/**
 * Keycloak sign-in (OIDC authorization code + PKCE, public client) — framework-free so a spec can run it in Node.
 *
 * Flow: `beginLogin()` keeps {verifier, state, returnUrl} in sessionStorage and returns the Keycloak URL to go to;
 * Keycloak sends the browser back to `<origin>/auth/callback?code=…&state=…`; `finishLogin()` checks the state and swaps
 * the code for tokens at the token endpoint (Keycloak answers CORS for the web origin, so the browser calls it directly).
 */
import { tracedFetch } from '../http/auth-trace';

export interface KeycloakConfig {
  enabled: boolean;
  /** e.g. http://localhost:8180 (no trailing slash needed) */
  url: string;
  realm: string;
  clientId: string;
  /** group (company) code of the mobile app: when set, GET {groupApi}/auth/groups/{code} gives the issuer and the login hint */
  groupCode?: string;
  /** base of the API that serves /auth/groups/{code} — same-origin path (the gateway has no CORS), e.g. /tps-api/api/v1 */
  groupApi?: string;
  /** false = do not send login_hint (the mobile app has it off while testing); default true */
  loginHint?: boolean;
}

/** What GET /auth/groups/{code} says about a group (`result` of the answer). */
export interface ResolvedGroup {
  usernamePrefix: string;
  issuer: string;
}

export interface KeycloakTokens {
  accessToken: string;
  refreshToken: string;
  idToken: string;
  /** seconds, as Keycloak says */
  expiresIn: number;
}

const FLOW_KEY = 'ts_kc_flow';

interface Flow {
  verifier: string;
  state: string;
  returnUrl: string;
  /** realm URL the sign-in was started at (the token is asked from the same one) */
  issuer: string;
}

export const issuerOf = (c: KeycloakConfig): string => `${c.url.replace(/\/+$/, '')}/realms/${encodeURIComponent(c.realm)}`;
const connect = (issuer: string): string => `${issuer.replace(/\/+$/, '')}/protocol/openid-connect`;

/** GET {groupApi}/auth/groups/{code}. Throws KeycloakError (message safe to show) when the group is unknown or the answer is not usable. */
export async function resolveGroup(groupApi: string, code: string): Promise<ResolvedGroup> {
  const res = await tracedFetch('ค้นหากลุ่ม (group code)', `${groupApi.replace(/\/+$/, '')}/auth/groups/${encodeURIComponent(code)}`, { method: 'GET', headers: { Accept: 'application/json' } });
  const body = (await res.json().catch(() => ({}))) as { result?: { usernamePrefix?: unknown; issuer?: unknown } };
  const r = body.result;
  if (!res.ok || !r || typeof r.issuer !== 'string' || !r.issuer) {
    throw new KeycloakError(res.status === 404 ? `ไม่พบกลุ่ม ${code}` : `ตรวจสอบกลุ่มไม่สำเร็จ (HTTP ${res.status})`);
  }
  return { issuer: r.issuer, usernamePrefix: typeof r.usernamePrefix === 'string' ? r.usernamePrefix : '' };
}

export const callbackUrl = (origin: string, baseHref = '/'): string => `${origin}${baseHref.replace(/\/?$/, '/')}auth/callback`;

const base64Url = (bytes: Uint8Array): string => {
  let s = '';
  for (const b of bytes) s += String.fromCharCode(b);
  return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
};

export const randomString = (bytes = 32): string => base64Url(crypto.getRandomValues(new Uint8Array(bytes)));

/** S256 code challenge of RFC 7636 */
export async function challengeOf(verifier: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(verifier));
  return base64Url(new Uint8Array(digest));
}

export interface BeginOptions {
  /** realm URL to sign in at; default = the one of the config */
  issuer?: string;
  /** username prefill: `<usernamePrefix>.` as the mobile app sends it */
  loginHint?: string;
  /** `login` = Keycloak must ask for the password again even if its own session is still alive (after SESSION_REPLACED) */
  prompt?: 'login';
}

export async function beginLogin(c: KeycloakConfig, redirectUri: string, returnUrl: string, opts: BeginOptions = {}): Promise<string> {
  const issuer = opts.issuer || issuerOf(c);
  const flow: Flow = { verifier: randomString(48), state: randomString(16), returnUrl, issuer };
  sessionStorage.setItem(FLOW_KEY, JSON.stringify(flow));
  const q = new URLSearchParams({
    client_id: c.clientId,
    redirect_uri: redirectUri,
    response_type: 'code',
    scope: 'openid',
    state: flow.state,
    code_challenge: await challengeOf(flow.verifier),
    code_challenge_method: 'S256',
    ui_locales: 'th',
  });
  if (opts.loginHint) q.set('login_hint', opts.loginHint);
  if (opts.prompt) q.set('prompt', opts.prompt);
  return `${connect(issuer)}/auth?${q}`;
}

export class KeycloakError extends Error {}

/** A call of triplesales-api that was refused: `status` and the `code` of the answer (UNAUTHORIZED, SESSION_REPLACED, EMPLOYEE_INACTIVE …). */
export class ApiAuthError extends KeycloakError {
  constructor(
    message: string,
    readonly status: number,
    readonly code: string,
  ) {
    super(message);
  }
}

/** The error code of an answer of triplesales-api: `code` / `responseCode`, as a string or inside `error` (empty when there is none). */
export function errorCodeOf(body: unknown): string {
  if (!body || typeof body !== 'object') return '';
  const b = body as Record<string, unknown>;
  const e = b['error'];
  for (const v of [b['code'], b['responseCode'], typeof e === 'object' && e ? (e as Record<string, unknown>)['code'] : e]) {
    if (typeof v === 'string' && /^[A-Z][A-Z0-9_]+$/.test(v)) return v;
  }
  return '';
}

/**
 * The two refusals of `POST /me/session` that no sign-in can cure (403): NO_ACTIVE_COMPANY (no company is usable) and NO_SYSTEM_ACCESS (no right to use
 * Triple Sales). The page tells the user and offers a way OUT (sign-out); it must not send the user back to the sign-in — Keycloak would sign them in
 * again and the same answer would come back, round and round.
 */
export const BLOCKED_SIGN_IN_CODES: readonly string[] = ['NO_ACTIVE_COMPANY', 'NO_SYSTEM_ACCESS'];

/** What to tell the user about a refused sign-in step (never the answer itself). */
function refusedMessage(status: number, code: string, fallback: string): string {
  if (code === 'SESSION_REPLACED') return 'บัญชีนี้เข้าสู่ระบบจากเครื่องอื่น กรุณาเข้าสู่ระบบใหม่';
  if (code === 'EMPLOYEE_INACTIVE') return 'บัญชีพนักงานหรือบริษัทที่เลือกถูกปิดใช้งาน';
  if (code === 'NO_SYSTEM_ACCESS') return 'ไม่มีสิทธิ์ใช้ Triple Sales';
  if (code === 'NO_ACTIVE_COMPANY') return 'ไม่มีบริษัทที่ใช้งานได้ กรุณาติดต่อผู้ดูแลบริษัท';
  if (status === 401) return 'เซสชันหมดอายุ กรุณาเข้าสู่ระบบใหม่';
  if (status === 403) return 'ไม่มีสิทธิ์เข้าใช้งานระบบ';
  return fallback;
}

/** Swap the code for tokens. Throws KeycloakError (message safe to show) when the state is wrong or Keycloak refuses. */
export async function finishLogin(c: KeycloakConfig, redirectUri: string, params: URLSearchParams): Promise<{ tokens: KeycloakTokens; returnUrl: string; issuer: string }> {
  let flow: Flow | null = null;
  try {
    flow = JSON.parse(sessionStorage.getItem(FLOW_KEY) ?? 'null') as Flow | null;
    sessionStorage.removeItem(FLOW_KEY); // one use
  } catch {
    /* storage blocked */
  }
  const error = params.get('error');
  if (error) throw new KeycloakError(params.get('error_description') || error);
  const code = params.get('code');
  if (!flow || !code || params.get('state') !== flow.state) throw new KeycloakError('ข้อมูลการเข้าสู่ระบบไม่ถูกต้องหรือหมดอายุ กรุณาลองใหม่');

  const res = await tracedFetch('Keycloak token (authorization_code)', `${connect(flow.issuer)}/token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ grant_type: 'authorization_code', client_id: c.clientId, redirect_uri: redirectUri, code, code_verifier: flow.verifier }),
  });
  const body = (await res.json().catch(() => ({}))) as Record<string, unknown>;
  if (!res.ok || typeof body['access_token'] !== 'string') {
    throw new KeycloakError(typeof body['error_description'] === 'string' ? body['error_description'] : `เข้าสู่ระบบไม่สำเร็จ (HTTP ${res.status})`);
  }
  return {
    returnUrl: flow.returnUrl,
    issuer: flow.issuer,
    tokens: {
      accessToken: body['access_token'],
      refreshToken: typeof body['refresh_token'] === 'string' ? body['refresh_token'] : '',
      idToken: typeof body['id_token'] === 'string' ? body['id_token'] : '',
      expiresIn: typeof body['expires_in'] === 'number' ? body['expires_in'] : 300,
    },
  };
}

/**
 * POST {issuer}/protocol/openid-connect/token with `grant_type=refresh_token` (public client: no secret, no Authorization header).
 * Keycloak answers a new access token and — with refresh token rotation — a new refresh token, which the caller must keep
 * (the old one may not be used again). Throws KeycloakError when no token comes back (expired / used refresh token, unknown
 * client, no answer…); the message is safe to show and never contains a token.
 */
export async function refreshTokens(issuer: string, clientId: string, refreshToken: string): Promise<KeycloakTokens> {
  if (!refreshToken) throw new KeycloakError('ไม่มี refresh token');
  let res: Response;
  try {
    res = await tracedFetch('Keycloak token (refresh_token)', `${connect(issuer)}/token`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded', Accept: 'application/json' },
      body: new URLSearchParams({ grant_type: 'refresh_token', client_id: clientId, refresh_token: refreshToken }),
    });
  } catch {
    throw new KeycloakError('เชื่อมต่อ Keycloak ไม่ได้');
  }
  const body = (await res.json().catch(() => ({}))) as Record<string, unknown>;
  if (!res.ok || typeof body['access_token'] !== 'string' || !body['access_token']) {
    const reason = typeof body['error'] === 'string' ? body['error'] : `HTTP ${res.status}`;
    throw new KeycloakError(`ต่ออายุเซสชันไม่สำเร็จ (${reason})`);
  }
  return {
    accessToken: body['access_token'],
    // without rotation Keycloak may leave it out: the old one stays valid then
    refreshToken: typeof body['refresh_token'] === 'string' && body['refresh_token'] ? body['refresh_token'] : refreshToken,
    idToken: typeof body['id_token'] === 'string' ? body['id_token'] : '',
    expiresIn: typeof body['expires_in'] === 'number' ? body['expires_in'] : 300,
  };
}

/** Where to send the browser to end the Keycloak session too. */
export function logoutUrl(c: KeycloakConfig, issuer: string | undefined, idToken: string, postLogoutRedirect: string): string {
  const q = new URLSearchParams({ post_logout_redirect_uri: postLogoutRedirect, client_id: c.clientId });
  if (idToken) q.set('id_token_hint', idToken);
  return `${connect(issuer || issuerOf(c))}/logout?${q}`;
}

/** Claims of a JWT (not verified — only for showing the user name; the API verifies the token). */
export function claimsOf(jwt: string): Record<string, unknown> {
  try {
    const part = jwt.split('.')[1] ?? '';
    const json = decodeURIComponent(
      [...atob(part.replace(/-/g, '+').replace(/_/g, '/'))].map((ch) => '%' + ch.charCodeAt(0).toString(16).padStart(2, '0')).join(''),
    );
    const v: unknown = JSON.parse(json);
    return v && typeof v === 'object' ? (v as Record<string, unknown>) : {};
  } catch {
    return {};
  }
}

export interface TpsCompany {
  id: string;
  code: string;
  name: string;
}

/** `result` of POST /me/session (triplesales-api) */
export interface TpsSession {
  user: { id: string; username: string };
  companies: TpsCompany[];
  /** the company the server already picked (the user has one) — null/absent: the user has to choose */
  selectedCompanyId: string | null;
}

const text = (v: unknown): string => (typeof v === 'string' ? v : v == null ? '' : String(v));

/**
 * POST {api}/me/session with the Keycloak access token: starts the session of triplesales-api and says who the user is and which
 * companies they have. Called after every sign-in (the mobile app does the same). Throws KeycloakError (message safe to show).
 */
export async function startSession(api: string, accessToken: string): Promise<TpsSession> {
  const res = await tracedFetch('POST /me/session', `${api.replace(/\/+$/, '')}/me/session`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${accessToken}`, Accept: 'application/json' },
  });
  const body = (await res.json().catch(() => ({}))) as { result?: Record<string, unknown> };
  const r = body.result;
  if (!res.ok || !r || typeof r['user'] !== 'object' || !r['user']) {
    const code = errorCodeOf(body);
    throw new ApiAuthError(refusedMessage(res.status, code, `เริ่มเซสชันไม่สำเร็จ (HTTP ${res.status})`), res.status, code);
  }
  const user = r['user'] as Record<string, unknown>;
  const companies = (Array.isArray(r['companies']) ? r['companies'] : [])
    .filter((c): c is Record<string, unknown> => !!c && typeof c === 'object')
    .map((c) => ({ id: text(c['id']), code: text(c['code']), name: text(c['name']) || text(c['code']) }))
    .filter((c) => c.id);
  return { user: { id: text(user['id']), username: text(user['username']) }, companies, selectedCompanyId: text(r['selectedCompanyId']) || null };
}

/** PUT {api}/me/session/company/{id}: the user's choice of company for this session (empty body). Throws KeycloakError. */
export async function selectCompany(api: string, accessToken: string, companyId: string): Promise<void> {
  const res = await tracedFetch('PUT /me/session/company', `${api.replace(/\/+$/, '')}/me/session/company/${encodeURIComponent(companyId)}`, {
    method: 'PUT',
    headers: { Authorization: `Bearer ${accessToken}`, Accept: 'application/json' },
  });
  if (!res.ok) {
    const code = errorCodeOf(await res.json().catch(() => ({})));
    throw new ApiAuthError(refusedMessage(res.status, code, `เลือกบริษัทไม่สำเร็จ (HTTP ${res.status})`), res.status, code);
  }
}
