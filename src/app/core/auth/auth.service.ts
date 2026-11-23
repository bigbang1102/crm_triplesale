import { HttpClient, HttpContext, HttpErrorResponse, HttpHeaders } from '@angular/common/http';
import { Injectable, computed, inject, signal } from '@angular/core';
import { Router } from '@angular/router';
import { firstValueFrom } from 'rxjs';
import { ConfigService } from '../config/config.service';
import { clearSessionUi } from '../dom/session-ui';
import { ApiError } from '../http/api-error';
import { ApiLogService, TokenKind, TokenSource } from '../http/api-log.service';
import { SIGN_IN_CALL } from '../http/http-context';
import { KNOWN_ROLES } from '../permissions/all-roles';
import { mockAccounts } from '../http/auth-api.mock';
import { AuthStatus, LoginProxyReply, SessionInfo } from './auth.models';
import { ApiAuthError, BLOCKED_SIGN_IN_CODES, BeginOptions, KeycloakConfig, KeycloakError, KeycloakTokens, TpsCompany, TpsSession, beginLogin, issuerOf, refreshTokens, resolveGroup, selectCompany, startSession, callbackUrl, claimsOf, finishLogin as keycloakFinish, logoutUrl } from './keycloak';
import { TokenStore } from './token.store';

const STATE_KEY = 'ts_state_key';
/** set when the server said SESSION_REPLACED: the next Keycloak sign-in must ask for the password (`prompt=login`) */
const PROMPT_KEY = 'ts_kc_prompt_login';
const SESSION_GONE = 'เซสชันหมดอายุ กรุณาเข้าสู่ระบบใหม่';
/** what a browser says when a request gets no answer at all (the servlet printed the Java exception text here) */
const NO_ANSWER = 'Failed to fetch';

type Json = Record<string, unknown>;

/* ------------------------------------------------------------------ JSON helpers (JSONObject.opt* of the servlet) */
const parseObject = (text: string): Json => {
  try {
    const v: unknown = text.trim() ? JSON.parse(text) : null;
    return v && typeof v === 'object' && !Array.isArray(v) ? (v as Json) : {};
  } catch {
    return {};
  }
};
const optObject = (v: unknown): Json | null => (v && typeof v === 'object' && !Array.isArray(v) ? (v as Json) : null);
/** optString: the text of a string, "" for null / missing, the JSON for anything else */
const optString = (v: unknown): string => (typeof v === 'string' ? v : v == null ? '' : typeof v === 'object' ? JSON.stringify(v) : String(v));
const optBoolean = (v: unknown): boolean => v === true || (typeof v === 'string' && v.trim().toLowerCase() === 'true');
const optLong = (v: unknown, fallback: number): number => {
  const n = typeof v === 'number' ? v : typeof v === 'string' && v.trim() !== '' ? Number(v) : NaN;
  return Number.isFinite(n) ? Math.trunc(n) : fallback;
};
const firstNonEmpty = (a: string, b: string): string => (a.trim() ? a : b);
/** `{status, message, result:{…}}` of the new auth API, or the old flat shape: the payload either way (unwrapResult) */
const unwrapResult = (body: Json): Json => optObject(body['result']) ?? body;
const asText = (body: unknown): string => (typeof body === 'string' ? body : body == null ? '' : JSON.stringify(body));

/** SessionRoles.parseRoles: an array of names, or of objects carrying one under roleName / role / name / code */
export function parseRoles(result: unknown): string[] {
  const out = new Set<string>();
  if (!Array.isArray(result)) return [];
  for (const item of result) {
    if (typeof item === 'string') out.add(item);
    else if (item && typeof item === 'object') {
      const o = item as Json;
      for (const key of ['roleName', 'role', 'name', 'code']) {
        if (o[key] != null) {
          out.add(optString(o[key]));
          break;
        }
      }
    }
  }
  return [...out];
}

interface Upstream {
  /** HTTP status of the answer */
  status: number;
  text: string;
}

/** a Keycloak sign-in on triplesales-api that waits for the user to choose a company (kept in memory only) */
interface TpsPending {
  tokens: KeycloakTokens;
  username: string;
  issuer: string;
  returnUrl: string;
  companies?: TpsCompany[];
}

interface Pending {
  token: string;
  username: string;
  /** id → code / name of the companies listed for the choice (Java: `ss_branch_map`) */
  branches: Map<string, { id: number | string; code: string; name: string }>;
}

/**
 * Session state + the sign-in against the REST APIs — there is no BFF any more, so what `LoginProxyServlet` did for the page
 * happens here. The login page (generated from index.xhtml) still talks to it as it talked to the servlet: `proxy()` takes
 * the same three JSON bodies and answers with the same status / `responseCode` / `failMessage`:
 *
 *   1. {username, password}           POST {auth}/auth/login                     → COMPLETE | ORG_REQUIRED | ERROR
 *   2. {action:'branches'}            GET  {service}/master-data/branches        → the companies to choose from
 *   3. {action:'select-org', org}     POST {auth}/auth/select-org                → COMPLETE
 *
 * Once the token is issued it reads the user (GET {service}/auth/user-detail) and the roles (GET {service}/me/roles) the way
 * the servlet did, builds the `SessionInfo` and keeps it with the token in the TokenStore. The page then calls
 * `completeSignIn()` to open the session. The access token is the Bearer of every later call (core/http/bearer.interceptor).
 */
@Injectable({ providedIn: 'root' })
export class AuthService {
  private readonly http = inject(HttpClient);
  private readonly config = inject(ConfigService);
  private readonly router = inject(Router);
  private readonly store = inject(TokenStore);
  private readonly apiLog = inject(ApiLogService);

  /** the token of a sign-in that still has to choose a company (Java: `ss_pending_token`) — never leaves memory */
  private pending: Pending | null = null;
  private tpsPending: (TpsPending & { companies: TpsCompany[] }) | null = null;
  /** companies to choose from after a Keycloak sign-in (null = nothing to choose) — the callback page shows them */
  readonly companyChoice = signal<TpsCompany[] | null>(null);
  /**
   * Set when the service refused the session for good (403 NO_ACTIVE_COMPANY / NO_SYSTEM_ACCESS, see `BLOCKED_SIGN_IN_CODES`): the callback page then
   * shows the reason and a sign-out button, never a way back to the sign-in (Keycloak would sign the user in again: a loop). Holds what the sign-out needs.
   */
  readonly signInBlocked = signal<{ code: string; issuer: string; idToken: string } | null>(null);

  readonly session = signal<SessionInfo | null>(null);
  readonly status = signal<AuthStatus>('unknown');
  /** Set when a signed-in user's session ends (401 / expiry) — the shell shows a dialog. */
  readonly expiredCode = signal<string | null>(null);
  /** Set on 409 COMPANY_CHANGED: another tab changed the company — the shell tells the user, then reloads the page (`App`). */
  readonly companyChanged = signal(false);
  /** a company switch is on: the page is loaded again after the choice so nothing of the old company stays on screen (S13) */
  private reloadAfterChoice = false;

  readonly isAuthenticated = computed(() => this.status() === 'authenticated');

  /**
   * Stands in for `commonBean.clientStateKey` of the Java template (a hash of the server session id): a key that changes
   * with every sign-in, so what a page remembers in localStorage (the translator's customer / filters) is bound to one
   * sign-in and cannot be read by the next person on the machine. Kept in sessionStorage (survives a reload of the tab) and
   * dropped when the session ends.
   */
  stateKey(): string {
    try {
      let key = sessionStorage.getItem(STATE_KEY);
      if (!key) {
        key = Math.floor(Math.random() * 0xffffffff).toString(16);
        sessionStorage.setItem(STATE_KEY, key);
      }
      return key;
    } catch {
      return ''; // storage blocked: still works, just not scoped to the sign-in (like an empty key in Java)
    }
  }

  /**
   * Called once by the app initializer: does this tab still hold a live sign-in? A token whose time ran out is tested by use
   * (no request) — except a Keycloak session, which is renewed first with its refresh token (see `refresh()`).
   */
  async restore(): Promise<void> {
    const kept = this.store.read();
    if (kept && this.store.isLive()) {
      this.session.set(kept.session);
      this.status.set('authenticated');
      return;
    }
    if (kept && this.canRefresh() && (await this.refresh())) {
      const renewed = this.store.read();
      if (renewed) {
        this.session.set(renewed.session);
        this.status.set('authenticated');
        return;
      }
    }
    this.clear();
  }

  /* ------------------------------------------------------------------ Keycloak: refresh token (only with `keycloak.enabled`) */
  private refreshing: Promise<boolean> | null = null;

  /** The signed-in session came from Keycloak, Keycloak is on, and a refresh token is kept: everything else keeps the old flow. */
  canRefresh(): boolean {
    return this.keycloakEnabled() && this.store.read()?.provider === 'keycloak' && !!this.store.read()?.refreshToken;
  }

  /**
   * Swaps the refresh token for new tokens and keeps them in the TokenStore (both, every time: a rotated refresh token is the
   * only valid one). Resolves true when the session holds a fresh access token, false when no token came back — the session is
   * left as it is, the caller decides (the HTTP interceptors end the session: `handleUnauthorized`, then /login = the group code page).
   * Calls made while one is running share it: with rotation a second call with the same refresh token would fail.
   */
  refresh(): Promise<boolean> {
    if (!this.canRefresh()) return Promise.resolve(false);
    this.refreshing ??= this.doRefresh().finally(() => (this.refreshing = null));
    return this.refreshing;
  }

  private async doRefresh(): Promise<boolean> {
    const kept = this.store.read();
    if (!kept) return false;
    try {
      const tokens = await refreshTokens(kept.issuer || issuerOf(this.keycloak()), this.keycloak().clientId, kept.refreshToken);
      this.store.write({
        ...kept,
        accessToken: tokens.accessToken,
        refreshToken: tokens.refreshToken,
        expiresAt: Date.now() + tokens.expiresIn * 1000,
        idToken: tokens.idToken || kept.idToken,
      });
      this.showTokens('refresh', 'keycloak', tokens);
      return true;
    } catch (err) {
      console.warn('[auth] refresh token failed:', err instanceof Error ? err.message : 'unknown error'); // never the token
      return false;
    }
  }

  /**
   * One step of the login page. Resolves with the status and the body whatever the status is (the page shows the
   * `failMessage` of a 401 / 500 itself) and never rejects: no answer from a service is a 502, as in the servlet.
   */
  async proxy(payload: object): Promise<LoginProxyReply> {
    const body = (payload && typeof payload === 'object' ? payload : {}) as Json;
    const action = optString(body['action'] ?? 'login').trim().toLowerCase();
    try {
      if (action === 'branches') return await this.stepBranches();
      if (action === 'select-org') return await this.stepSelectOrg(optString(body['org']).trim());
      return await this.stepLogin(optString(body['username']).trim(), optString(body['password']));
    } catch (err) {
      return this.failure(502, `เชื่อมต่อระบบยืนยันตัวตนไม่ได้: ${this.reason(err)}`);
    }
  }

  /** The page got COMPLETE: open the session that `proxy()` built. */
  async completeSignIn(): Promise<void> {
    const kept = this.store.read();
    if (!kept) throw new ApiError(401, SESSION_GONE, { responseCode: 'NO_TOKEN' });
    this.session.set(kept.session);
    this.status.set('authenticated');
  }

  /** Keycloak sign-in is on (config `keycloak.enabled`) */
  keycloakEnabled(): boolean {
    return !!this.config.value.keycloak?.enabled;
  }

  /** The login page asks for a group code first (Keycloak on and `keycloak.groupApi` set) */
  keycloakAsksGroup(): boolean {
    const c = this.config.value.keycloak;
    return !!c?.enabled && !!c.groupApi;
  }

  /**
   * Leave for the Keycloak login page; it sends the browser back to /auth/callback. With a group code (typed on the login page,
   * else `keycloak.groupCode` of the config) the group is looked up first: unknown group → rejects with a KeycloakError, nothing opens.
   */
  async startKeycloak(returnUrl: string, groupCode?: string): Promise<void> {
    const c = this.keycloak();
    const code = (groupCode ?? c.groupCode ?? '').trim();
    // a group code (company of the mobile app) says which realm to sign in at and what username to prefill
    const group = code && c.groupApi ? await resolveGroup(c.groupApi, code) : null;
    const hint = group?.usernamePrefix && c.loginHint !== false ? `${group.usernamePrefix}.` : '';
    const opts: BeginOptions = group ? { issuer: group.issuer, loginHint: hint } : {};
    if (!opts.issuer && !c.url) throw new KeycloakError('ไม่พบ Keycloak issuer: กรุณาระบุรหัสกลุ่ม');
    if (this.takePromptLogin()) opts.prompt = 'login';
    window.location.assign(await beginLogin(c, this.callback(), returnUrl, opts));
  }

  /**
   * /auth/callback: swap the code for tokens, then read the user and roles as after the form sign-in. Resolves with the page to
   * open; rejects with a KeycloakError whose message can be shown.
   */
  async completeKeycloak(params: URLSearchParams): Promise<string | null> {
    const { tokens, returnUrl, issuer } = await keycloakFinish(this.keycloak(), this.callback(), params);
    return this.openKeycloakSession(tokens, issuer, returnUrl);
  }

  /**
   * Tokens of a Keycloak sign-in are in hand (from the callback, or from a refresh token): read the user and the companies and open
   * the session. Resolves with the page to open, or null when the user has to choose a company first (`companyChoice`).
   */
  private async openKeycloakSession(tokens: KeycloakTokens, issuer: string, returnUrl: string): Promise<string | null> {
    const claims = claimsOf(tokens.accessToken);
    const username = optString(claims['preferred_username']) || optString(claims['email']) || optString(claims['sub']);
    const api = this.keycloak().groupApi;

    if (!api) {
      // old service: the user and the roles come from user-detail / me/roles
      await this.finishLogin({ access_token: tokens.accessToken, refresh_token: tokens.refreshToken, expires_in: tokens.expiresIn }, username, null, null, 'keycloak');
      const kept = this.store.read();
      if (!kept) throw new KeycloakError(SESSION_GONE);
      this.store.write({ ...kept, provider: 'keycloak', idToken: tokens.idToken, issuer });
      this.showTokens('login', 'keycloak', tokens);
      this.session.set(kept.session);
      this.status.set('authenticated');
      return returnUrl;
    }

    // triplesales-api (like the mobile app): POST /me/session says who the user is and which companies they have
    let s: TpsSession;
    try {
      s = await startSession(api, tokens.accessToken);
    } catch (err) {
      // 403 NO_ACTIVE_COMPANY / NO_SYSTEM_ACCESS: nothing a new sign-in can change — keep what the sign-out needs, then tell the user
      if (err instanceof ApiAuthError && BLOCKED_SIGN_IN_CODES.includes(err.code)) {
        this.signInBlocked.set({ code: err.code, issuer, idToken: tokens.idToken ?? '' });
        throw err;
      }
      // 401 UNAUTHORIZED (token no good): one refresh and one more try; no new token → the user signs in again
      if (!(err instanceof ApiAuthError) || err.status !== 401 || err.code === 'SESSION_REPLACED' || err.code === 'EMPLOYEE_INACTIVE' || !tokens.refreshToken) {
        if (err instanceof ApiAuthError && err.code === 'SESSION_REPLACED') this.markPromptLogin();
        throw err;
      }
      const fresh = await refreshTokens(issuer, this.keycloak().clientId, tokens.refreshToken);
      this.showTokens('refresh', 'keycloak', fresh);
      tokens = fresh;
      s = await startSession(api, fresh.accessToken);
    }
    if (s.companies.length === 0) {
      // no company at all is the same as NO_ACTIVE_COMPANY: nothing a new sign-in can change
      this.signInBlocked.set({ code: 'NO_ACTIVE_COMPANY', issuer, idToken: tokens.idToken ?? '' });
      throw new KeycloakError('ไม่มีบริษัทที่ใช้งานได้ กรุณาติดต่อผู้ดูแลบริษัท');
    }
    const base = { tokens, username: s.user.username || username, issuer, returnUrl };
    // PUT /me/session/company/{id} is REQUIRED every time, even when the user has one company or the server already picked one
    const chosen = s.companies.find((c) => c.id === s.selectedCompanyId) ?? (s.companies.length === 1 ? s.companies[0] : undefined);
    if (chosen) {
      await selectCompany(api, tokens.accessToken, chosen.id);
      this.openTps(base, chosen, s.companies.length);
      return returnUrl;
    }
    // several companies and none chosen: the user chooses (the page shows `companyChoice`, then calls chooseCompany)
    this.tpsPending = { ...base, companies: s.companies };
    this.companyChoice.set(s.companies);
    return null;
  }

  /**
   * 401 EMPLOYEE_INACTIVE (the employee or the chosen company was switched off): the session is not ended. POST /me/session is called
   * again and the user chooses a company again on /auth/callback (it shows `companyChoice`). Resolves true when the choice is shown;
   * false = the Keycloak session cannot be used any more (the caller ends the session).
   */
  async reselectCompany(returnUrl: string): Promise<boolean> {
    const kept = this.store.read();
    const api = this.keycloak().groupApi;
    if (!kept || kept.provider !== 'keycloak' || !api) return false;
    try {
      const s = await startSession(api, kept.accessToken);
      if (s.companies.length === 0) return false;
      const tokens: KeycloakTokens = { accessToken: kept.accessToken, refreshToken: kept.refreshToken, idToken: kept.idToken ?? '', expiresIn: Math.max(1, Math.round((kept.expiresAt - Date.now()) / 1000)) };
      this.tpsPending = { tokens, username: kept.session.username, issuer: kept.issuer ?? '', returnUrl, companies: s.companies };
      this.companyChoice.set(s.companies);
      await this.router.navigate(['/auth/callback']);
      return true;
    } catch {
      return false;
    }
  }

  /**
   * 409 COMPANY_CHANGED: the company was changed in another tab, this tab still shows the old one. The company the server holds now
   * (POST /me/session → `selectedCompanyId`) is written into this tab's session, then `companyChanged` is set so the shell tells the
   * user and reloads the page. Several calls that fail together tell it once. When the server has no company chosen now, nothing is
   * rewritten: the reload then meets COMPANY_NOT_SELECTED and goes to the company choice.
   */
  async notifyCompanyChanged(): Promise<void> {
    if (this.companyChanged()) return;
    this.companyChanged.set(true);
    const kept = this.store.read();
    const api = this.config.value.keycloak?.groupApi;
    if (!kept || kept.provider !== 'keycloak' || !api) return;
    try {
      const s = await startSession(api, kept.accessToken);
      const now = s.companies.find((c) => c.id === s.selectedCompanyId);
      if (now) {
        this.store.write({ ...kept, session: { ...kept.session, branch: { id: now.id, code: now.code, name: now.name }, branchCode: now.code } });
      }
    } catch {
      /* the reload shows what the server says (a refused token ends the session there) */
    }
  }

  clearCompanyChanged(): void {
    this.companyChanged.set(false);
  }

  private markPromptLogin(): void {
    try {
      sessionStorage.setItem(PROMPT_KEY, '1');
    } catch {
      /* storage blocked: the sign-in just will not force the password */
    }
  }

  private takePromptLogin(): boolean {
    try {
      const on = sessionStorage.getItem(PROMPT_KEY) === '1';
      sessionStorage.removeItem(PROMPT_KEY);
      return on;
    } catch {
      return false;
    }
  }

  /** The user picked a company on the callback page: PUT /me/session/company/{id}, then the session opens. Resolves with the page to open. */
  async chooseCompany(companyId: string): Promise<string> {
    const p = this.tpsPending;
    const company = p?.companies.find((c) => c.id === companyId);
    if (!p || !company) throw new KeycloakError(SESSION_GONE);
    await selectCompany(this.keycloak().groupApi!, p.tokens.accessToken, company.id);
    this.openTps(p, company, p.companies.length);
    this.tpsPending = null;
    this.companyChoice.set(null);
    return p.returnUrl;
  }

  /**
   * The user wants another company (top bar): the company choice is shown again (`reselectCompany`) and, once chosen, the page is loaded
   * again — the menus, options and data of the old company must not stay (multi-tenant-access-design.md §11). Resolves false when the
   * choice cannot be shown (the session is not a triplesales-api one).
   */
  async switchCompany(returnUrl: string): Promise<boolean> {
    this.reloadAfterChoice = true;
    const shown = await this.reselectCompany(returnUrl);
    if (!shown) this.reloadAfterChoice = false;
    return shown;
  }

  /** the account the company choice is for (shown above the list: "บัญชี … ใช้งานได้หลายบริษัท") */
  companyChoiceUser(): string {
    return this.tpsPending?.username ?? '';
  }

  /** true once after a company switch: the page that opens the chosen company must reload the whole app */
  takeReloadAfterChoice(): boolean {
    const on = this.reloadAfterChoice;
    this.reloadAfterChoice = false;
    return on;
  }

  private openTps(p: TpsPending, company: TpsCompany, companyCount: number): void {
    // the mockup's accounts (Datasource/users.json) say who the user is and what they may do in THIS company; the real API gives no roles yet
    // FAST-DEBT(API): roles come from the Datasource in the mockup and are all known roles otherwise (as before) until /me/roles exists · somyot · 2026-11-20
    const known = mockAccounts()?.membershipSession(p.username, company.code);
    this.store.write({
      accessToken: p.tokens.accessToken,
      refreshToken: p.tokens.refreshToken,
      expiresAt: Date.now() + p.tokens.expiresIn * 1000,
      provider: 'keycloak',
      idToken: p.tokens.idToken,
      issuer: p.issuer,
      session: {
        username: p.username,
        profileName: known?.profileName ?? p.username,
        employeeId: known?.employeeId ?? null,
        employeeCode: known?.employeeCode ?? '',
        branch: { id: company.id, code: company.code, name: company.name },
        branchCode: company.code,
        // TEMPORARY, as in finishLogin: the API gives out no roles yet
        roles: known?.roles ?? [...KNOWN_ROLES],
        companyCount,
        lang: 'th',
      },
    });
    this.showTokens('login', 'keycloak', p.tokens);
    try {
      sessionStorage.removeItem(STATE_KEY);
    } catch {
      /* nothing stored */
    }
    const kept = this.store.read()!;
    this.session.set(kept.session);
    this.status.set('authenticated');
  }

  private keycloak(): KeycloakConfig {
    return this.config.value.keycloak!;
  }

  private callback(): string {
    return callbackUrl(window.location.origin, new URL(document.baseURI).pathname);
  }

  /**
   * The sign-out of a sign-in that was refused for good (`signInBlocked`): ends the Keycloak session too and lands on the sign-in page, which is then
   * the plain sign-in (no automatic sign-in, so no loop). Nothing is kept here: the tokens were never stored.
   */
  signOutBlocked(): void {
    const blocked = this.signInBlocked();
    clearSessionUi();
    this.clear();
    this.signInBlocked.set(null);
    if (blocked && this.keycloakEnabled()) {
      window.location.assign(logoutUrl(this.keycloak(), blocked.issuer, blocked.idToken, new URL('login', document.baseURI).href));
      return;
    }
    void this.router.navigate(['/login']);
  }

  /**
   * "Back to the sign-in page" after a failed sign-in: ends the Keycloak session too (otherwise Keycloak would sign the user straight
   * back in with the same account). Without a stored id token the logout goes by client_id only.
   */
  backToLogin(): void {
    const kept = this.store.read();
    // a sign-in that waits for the company choice has no stored session yet: its tokens say which Keycloak to end the session at
    const waiting = this.tpsPending;
    const idToken = kept?.idToken ?? this.signInBlocked()?.idToken ?? waiting?.tokens.idToken ?? '';
    const issuer = kept?.issuer ?? this.signInBlocked()?.issuer ?? waiting?.issuer;
    clearSessionUi();
    this.clear();
    this.signInBlocked.set(null);
    this.tpsPending = null;
    this.companyChoice.set(null);
    if (this.keycloakEnabled()) {
      window.location.assign(logoutUrl(this.keycloak(), issuer, idToken, new URL('login', document.baseURI).href));
      return;
    }
    void this.router.navigate(['/login']);
  }

  async logout(): Promise<void> {
    clearSessionUi();
    const kept = this.store.read();
    if (kept?.provider === 'keycloak' && this.keycloakEnabled()) {
      this.clear();
      // Back to /auth/callback, not /login: it is the address the client is registered with (login works with it), while
      // "Valid post logout redirect URIs" of the realm may not list /login ("Invalid redirect uri"). The callback page sees
      // that no code came with it and opens /login.
      this.leave(logoutUrl(this.keycloak(), kept.issuer, kept.idToken ?? '', this.callback()));
      return;
    }
    // Like before, the token is not revoked at the auth service (there is no call for it): it is dropped here, expires there.
    this.clear();
    await this.router.navigate(['/login']);
  }

  /** a full-page navigation out of the app (to Keycloak) — its own method so that a spec can catch it */
  protected leave(url: string): void {
    window.location.assign(url);
  }

  /** Called by the HTTP interceptors on a 401 of a signed-in user (or a token whose time is up). */
  handleUnauthorized(code: string | undefined): void {
    const wasSignedIn = this.status() === 'authenticated';
    if (code === 'SESSION_REPLACED') this.markPromptLogin();
    this.clear();
    if (wasSignedIn) this.expiredCode.set(code ?? 'TOKEN_EXPIRED');
  }

  clearExpired(): void {
    this.expiredCode.set(null);
  }

  /* ------------------------------------------------------------------ step 1 — POST /auth/login */
  private async stepLogin(username: string, password: string): Promise<LoginProxyReply> {
    if (!username || !password) return this.failure(400, 'กรุณาระบุ Username และ Password');

    // the new API takes no org here (it moved to select-org)
    const up = await this.upstream('POST', this.config.authUrl('/auth/login'), null, { username, password });
    const raw = parseObject(up.text);
    const result = unwrapResult(raw);
    const accessToken = optString(result['access_token']);
    const needOrg = optBoolean(result['requires_org_selection']);

    if (up.status >= 200 && up.status < 300 && accessToken) {
      if (needOrg) {
        // not signed in yet: the token is kept apart (the servlet's ss_pending_token), only the company choice may use it
        this.pending = { token: accessToken, username, branches: new Map() };
        return this.reply(200, { responseCode: 'ORG_REQUIRED', username });
      }
      await this.finishLogin(result, username, null);
      return this.reply(200, { responseCode: 'COMPLETE', username });
    }

    let failMessage = firstNonEmpty(optString(raw['error']), optString(result['error']));
    if (failMessage.includes('Invalid user credentials') || up.status === 401) failMessage = 'ชื่อผู้ใช้หรือรหัสผ่านไม่ถูกต้อง';
    else if (!failMessage) failMessage = `เข้าสู่ระบบไม่สำเร็จ (HTTP ${up.status})`;
    return this.failure(up.status, failMessage);
  }

  /* ------------------------------------------------------------------ step 2 — GET /master-data/branches */
  private async stepBranches(): Promise<LoginProxyReply> {
    const pending = this.pending;
    if (!pending) return this.failure(401, SESSION_GONE);
    try {
      const up = await this.upstream('GET', this.config.serviceUrl('/master-data/branches'), pending.token);
      if (up.status < 200 || up.status >= 300) return this.failure(up.status, `โหลดรายชื่อบริษัทไม่สำเร็จ (HTTP ${up.status})`);
      const rows = parseObject(up.text)['result'];
      const list = Array.isArray(rows) ? rows : [];
      // id → code / name, for the active branch of the session once the choice is made (Java: ss_branch_map)
      pending.branches = new Map();
      for (const row of list) {
        const b = optObject(row);
        if (!b || b['id'] == null) continue;
        const name = optString(b['nameTh']).trim() || optString(b['name']).trim() || optString(b['code']).trim();
        pending.branches.set(String(b['id']), { id: b['id'] as number | string, code: optString(b['code']).trim(), name });
      }
      return this.reply(200, { responseCode: 'COMPLETE', branches: list });
    } catch {
      return this.failure(502, 'เชื่อมต่อระบบไม่ได้ระหว่างโหลดรายชื่อบริษัท');
    }
  }

  /* ------------------------------------------------------------------ step 3 — POST /auth/select-org */
  private async stepSelectOrg(org: string): Promise<LoginProxyReply> {
    const pending = this.pending;
    if (!pending) return this.failure(401, SESSION_GONE);
    if (!org) return this.failure(400, 'กรุณาเลือกบริษัท');

    const up = await this.upstream('POST', this.config.authUrl('/auth/select-org'), pending.token, { org });
    const raw = parseObject(up.text);
    const result = unwrapResult(raw);
    const newToken = optString(result['access_token']);
    const stillNeedOrg = optBoolean(result['requires_org_selection']);

    if (up.status < 200 || up.status >= 300 || !newToken || stillNeedOrg) {
      const failMessage =
        firstNonEmpty(optString(raw['error']), optString(result['error'])) ||
        (stillNeedOrg ? 'เลือกบริษัทไม่สำเร็จ กรุณาลองใหม่' : `เลือกบริษัทไม่สำเร็จ (HTTP ${up.status})`);
      return this.failure(up.status, failMessage);
    }

    await this.finishLogin(result, pending.username, org, pending);
    this.pending = null; // used once
    return this.reply(200, { responseCode: 'COMPLETE', username: pending.username });
  }

  /**
   * The token is issued: keep it, then read who the user is and what they may do (finishLogin of the servlet). Neither read
   * may break the sign-in: no user detail = no profile name / employee id, no roles = nothing visible (fail-closed).
   */
  private async finishLogin(result: Json, username: string, org: string | null, pending: Pending | null = null, source: TokenSource = 'auth-api'): Promise<void> {
    const accessToken = optString(result['access_token']);
    const expiresIn = optLong(result['expires_in'], 3600);
    const expiresAt = Date.now() + expiresIn * 1000;

    // the two reads do not depend on each other (the servlet asked one after the other); neither may break the sign-in
    const [detail, sentRoles] = await Promise.all([
      this.upstream('GET', this.config.serviceUrl('/auth/user-detail'), accessToken).then(
        (up) => (up.status >= 200 && up.status < 300 ? optObject(parseObject(up.text)['result']) : null),
        () => null,
      ),
      this.upstream('GET', this.config.serviceUrl('/me/roles'), accessToken).then(
        (up) => (up.status >= 200 && up.status < 300 ? parseRoles(parseObject(up.text)['result']) : []),
        () => [] as string[],
      ),
    ]);
    // TEMPORARY: the backend has not started to give out the roles, so the session gets the roles set in the app (KNOWN_ROLES) on
    // top of what /me/roles answered — what was really sent stays (a real super_admin is still one). Delete this line, and the
    // KNOWN_ROLES import, when the backend gives them out. Note that the sales documents send these roles as `role_owner`.
    // Mockup: the roles of an account of Datasource/users.json are exactly what its role groups give (roles.json) — the point is to see the
    // app with the rights of a salesperson, a viewer … — so nothing is added to them.
    const roles = mockAccounts() ? sentRoles : [...new Set([...sentRoles, ...KNOWN_ROLES])];

    const employee = optObject(detail?.['employee']);
    const homeBranch = optObject(employee?.['branch']);
    const profileName = optString(optObject(detail?.['profile'])?.['name']).trim();
    const id = optLong(employee?.['id'], NaN);
    const employeeId = Number.isFinite(id) ? id : null;
    const employeeCode = optString(employee?.['code']).trim();
    const home =
      homeBranch && homeBranch['id'] != null
        ? { id: homeBranch['id'] as number | string, code: optString(homeBranch['code']).trim(), name: optString(homeBranch['name']).trim() }
        : null;

    // The company chosen at login is the one the backend filters by (ActiveBranch: employee.branch is only the home branch
    // of the employee and can differ), so after a choice it is what the top bar shows; otherwise the home branch.
    const chosen = org != null ? pending?.branches.get(org) : undefined;
    const branch: SessionInfo['branch'] = chosen
      ? { id: chosen.id, code: chosen.code, name: chosen.name }
      : org != null
        ? { id: org, code: home?.code ?? '', name: home?.name || home?.code || '' }
        : home
          ? { id: home.id, code: home.code, name: home.name || home.code }
          : null;

    this.store.write({
      accessToken,
      refreshToken: optString(result['refresh_token']),
      expiresAt,
      session: { username, profileName: profileName || username, employeeId, employeeCode, branch, branchCode: home?.code || chosen?.code || '', roles, lang: 'th' },
    });
    // the Keycloak sign-in logs its own tokens once the id token is known (openKeycloakSession)
    if (source === 'auth-api') this.showTokens('login', source, { accessToken, refreshToken: optString(result['refresh_token']), idToken: '', expiresIn });
    // a new sign-in is a new key for what pages remember per sign-in
    try {
      sessionStorage.removeItem(STATE_KEY);
    } catch {
      /* nothing stored */
    }
  }

  /* ------------------------------------------------------------------ transport */
  /** One request to a service; HTTP errors come back as a status, only "no answer at all" throws. */
  private async upstream(method: 'GET' | 'POST', url: string, bearer: string | null, body?: unknown): Promise<Upstream> {
    const headers = bearer ? new HttpHeaders({ Authorization: `Bearer ${bearer}` }) : undefined;
    try {
      const res = await firstValueFrom(
        this.http.request(method, url, {
          body: body ?? null,
          headers,
          observe: 'response',
          responseType: 'text',
          context: new HttpContext().set(SIGN_IN_CALL, true),
        }),
      );
      return { status: res.status, text: asText(res.body) }; // the dev mock hands over an object, a server a string
    } catch (err) {
      // the interceptors turn a failed call into an ApiError (the body is kept); without them it is the HttpErrorResponse
      if (err instanceof ApiError && err.status > 0) return { status: err.status, text: asText(err.options.body) };
      if (err instanceof HttpErrorResponse && err.status > 0) return { status: err.status, text: asText(err.error) };
      throw err;
    }
  }

  private reply(status: number, data: Json): LoginProxyReply {
    return { status, ok: status >= 200 && status < 300, data, raw: JSON.stringify(data) };
  }

  private failure(status: number, failMessage: string): LoginProxyReply {
    return this.reply(status, { responseCode: 'ERROR', failMessage });
  }

  private reason(err: unknown): string {
    if (err instanceof ApiError && err.status === 0) return NO_ANSWER;
    if (err instanceof HttpErrorResponse && err.status === 0) return NO_ANSWER;
    return err instanceof Error ? err.message : String(err);
  }

  /**
   * The Log window (features.apiLog, dev / test only) lists the tokens of this tab: the ones a sign-in brought and every refresh.
   * They live in memory only, go with the sign-in (`clear`) and are never written anywhere.
   */
  private showTokens(kind: TokenKind, source: TokenSource, t: { accessToken: string; refreshToken: string; idToken?: string; expiresIn: number }): void {
    if (this.config.value.features.apiLog) this.apiLog.recordToken({ kind, source, accessToken: t.accessToken, refreshToken: t.refreshToken, idToken: t.idToken || '', expiresIn: t.expiresIn });
  }

  private clear(): void {
    this.apiLog.clearTokens();
    this.store.clear();
    this.pending = null;
    this.tpsPending = null;
    this.companyChoice.set(null);
    try {
      sessionStorage.removeItem(STATE_KEY);
    } catch {
      /* nothing stored */
    }
    this.session.set(null);
    this.status.set('anonymous');
  }
}
