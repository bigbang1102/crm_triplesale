import { Injectable, signal } from '@angular/core';
import type { ConfigService } from '@core/config/config.service';
import type { PageDef } from '@core/navigation/page-registry';
import { type AuthCall, type AuthCallReport, setAuthTracer } from './auth-trace';

/** One line of the Log window = one REST call this tab made (Java: `ApiLog.Call`). */
export interface ApiLogEntry {
  /** `#n` of the row (Java: `seq`) */
  id: number;
  /** `HH:mm:ss.SSS` */
  at: string;
  /** the page the call belongs to, e.g. `index.face` (Java: `ApiLog.pageOf`) */
  page: string;
  /** the servlet URL of the Java app the page asked, e.g. `/board/movement-types` ('' when it is not known — see api-via.ts) */
  via: string;
  method: string;
  /** path + query as sent (relative to the origin) */
  url: string;
  /** HTTP status, 0 when the request never got a response */
  status: number;
  ms: number;
  /** the request body as text, passwords / tokens masked (clipped at CURL_BODY_LIMIT) */
  reqBody: string;
  /** the answer as text (clipped at BODY_LIMIT) */
  resBody: string;
  /** true for a call to a REST API (Bearer token); false/absent for the old BFF (session cookie) */
  bearer?: boolean;
}

export type TokenKind = 'login' | 'refresh';
/** who issued it: Keycloak, or the old auth service (`POST /auth/login`) */
export type TokenSource = 'keycloak' | 'auth-api';

/**
 * A token a sign-in or a refresh brought (the "Token" tab of the Log window). New in Angular: the Java Log had no such list because the
 * token stayed on the server. Kept in memory only, never in an entry of the call list, emptied when the sign-in ends.
 */
export interface TokenEvent {
  id: number;
  /** `HH:mm:ss.SSS` */
  at: string;
  /** epoch ms of `at` (the access token ends at `issuedAt + expiresIn`) */
  issuedAt: number;
  kind: TokenKind;
  source: TokenSource;
  accessToken: string;
  refreshToken: string;
  /** '' when the issuer sent none */
  idToken: string;
  /** seconds the access token lives, as the issuer said */
  expiresIn: number;
  /** the calls the sign-in / refresh made since the token before (token endpoint, `POST /me/session`, …), oldest first — with their curl */
  calls: readonly AuthCall[];
}

/** the calls of the sign-in kept until the token they led to is recorded */
const MAX_PENDING_CALLS = 30;

/** the newest tokens kept */
export const MAX_TOKEN_EVENTS = 20;

/** `triplesale.apilog.max` of the Java app: calls kept per session */
export const MAX_ENTRIES = 300;
/** `ApiLog.BODY_LIMIT`: request / answer text shown in the Log */
export const BODY_LIMIT = 4000;
/** `Data_API.CURL_BODY_LIMIT`: the request body a curl may carry */
export const CURL_BODY_LIMIT = 65536;

/** `Data_API.clipBody`: at most `limit` characters, and how much was cut */
export function clipBody(body: string, limit: number): string {
  if (body.length <= limit) return body;
  return `${body.slice(0, limit)}...[ตัดออก ${body.length - limit} ตัวอักษร จากทั้งหมด ${body.length}]`;
}

/** `Data_API.shq`: a string in single quotes that is safe for a shell, even with a quote inside */
const shq = (s: string): string => `'${s.replaceAll("'", `'\\''`)}'`;

const pad = (n: number, width = 2): string => String(n).padStart(width, '0');

/** `HH:mm:ss.SSS` of a moment (local time, like `ApiLog.TIME_FMT`) */
export function clock(d: Date): string {
  return `${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}.${pad(d.getMilliseconds(), 3)}`;
}

/**
 * The calls this tab made to the REST APIs, oldest first — the Angular counterpart of the Java Log (`ApiLog` in memory + `api_log.xhtml`;
 * the window is `layout/api-log`). The list never holds a secret: the request body is masked (see `maskSecrets`) and the access token is
 * put into a curl only when that curl is shown or copied (`curl(…, token)`), never into an entry.
 */
@Injectable({ providedIn: 'root' })
export class ApiLogService {
  private seq = 0;
  readonly entries = signal<readonly ApiLogEntry[]>([]);
  /** the Log window is open */
  readonly isOpen = signal(false);
  /** the page the calls made now belong to — kept by `ApiLogPageTracker` (Java: `ApiLog.pageOf`) */
  currentPage = '(อื่น ๆ)';

  record(entry: Omit<ApiLogEntry, 'id' | 'at'>): void {
    const next: ApiLogEntry = { id: ++this.seq, at: clock(new Date()), ...entry };
    this.entries.update((list) => [...list, next].slice(-MAX_ENTRIES));
  }

  clear(): void {
    this.entries.set([]);
  }

  /** the tokens of this tab, newest first (see `TokenEvent`) */
  readonly tokenEvents = signal<readonly TokenEvent[]>([]);
  private tokenSeq = 0;

  /** the calls of the sign-in / refresh that are not yet shown with a token (they go to the next `recordToken`) */
  private pendingCalls: AuthCall[] = [];
  private callSeq = 0;

  /** start listening to `tracedFetch` (the Keycloak calls): done once, when `features.apiLog` is on */
  watchAuthCalls(): void {
    setAuthTracer((call) => this.traceAuthCall(call));
  }

  traceAuthCall(call: AuthCallReport): void {
    this.pendingCalls = [...this.pendingCalls, { id: ++this.callSeq, at: clock(new Date()), ...call }].slice(-MAX_PENDING_CALLS);
  }

  recordToken(event: Omit<TokenEvent, 'id' | 'at' | 'issuedAt' | 'calls'>): void {
    const now = new Date();
    const next: TokenEvent = { id: ++this.tokenSeq, at: clock(now), issuedAt: now.getTime(), calls: this.pendingCalls, ...event };
    this.pendingCalls = [];
    this.tokenEvents.update((list) => [next, ...list].slice(0, MAX_TOKEN_EVENTS));
  }

  clearTokens(): void {
    this.tokenEvents.set([]);
    this.pendingCalls = [];
  }

  /**
   * The curl of a call of the sign-in, as it was sent: its own headers and body (form-encoded for the token endpoint). The values are real
   * — the Log window is for dev / test only (`features.apiLog`) — so it can be tried in Postman; an authorization `code` works once only.
   */
  authCurl(call: AuthCall): string {
    const parts = [`curl -i -X ${call.method.toUpperCase()}`, shq(call.url)];
    for (const [k, v] of Object.entries(call.headers)) parts.push('-H', shq(`${k}: ${v}`));
    if (call.body) parts.push('-d', shq(clipBody(call.body, CURL_BODY_LIMIT)));
    return parts.join(' ');
  }

  open(): void {
    this.isOpen.set(true);
  }

  close(): void {
    this.isOpen.set(false);
  }

  /**
   * The curl of a call, as `Data_API.toCurl` writes it: `-i`, the JSON headers, the Bearer token and the body, on one line.
   * `token`: the access token — given only when the curl is shown or copied; without it a placeholder. A call to the old BFF
   * carries the session cookie instead.
   */
  curl(entry: ApiLogEntry, origin: string, token?: string): string {
    const parts = [
      `curl -i -X ${entry.method.toUpperCase()}`,
      shq(`${origin}${entry.url}`),
      '-H',
      shq('Content-Type: application/json; charset=UTF-8'),
      '-H',
      shq('Accept: application/json'),
      '-H',
      shq(entry.bearer ? `Authorization: Bearer ${token?.trim() || '<access_token>'}` : 'Cookie: JSESSIONID=<your-session-id>'),
    ];
    if (entry.reqBody) parts.push('-d', shq(clipBody(entry.reqBody, CURL_BODY_LIMIT)));
    return parts.join(' ');
  }
}

/**
 * The origin a curl of this call should name: `config.apiOrigin` for a call to the REST APIs (the page only proxies them), the origin of the
 * page for anything else (and for every call when `apiOrigin` is not set).
 */
export function curlOrigin(url: string, config: ConfigService, pageOrigin: string): string {
  return config.isBackendUrl(url) && config.value.apiOrigin ? config.value.apiOrigin : pageOrigin;
}

/**
 * The name of a page in the Log: what `ApiLog.pageOf` printed for the Java app — the `.face` file of the page (`pages/index.xhtml` of the
 * registry → `index.face`); a page that has no Java file (a mock-up) is named by its route.
 */
export function javaPageName(page: PageDef | undefined, route: string): string {
  const file = page?.legacy.find((l) => /^pages\/[^/]+\.xhtml$/.test(l));
  return file ? file.slice('pages/'.length).replace(/\.xhtml$/, '.face') : route;
}

const SECRET_KEY = /pass(word)?|token|secret|authorization/i;

/** A copy of a request body with the value of every password / token / secret field replaced by "***" (nested objects too). */
export function maskSecrets(value: unknown, depth = 0): unknown {
  if (value === null || typeof value !== 'object' || depth > 6) return value;
  if (Array.isArray(value)) return value.map((v) => maskSecrets(v, depth + 1));
  return Object.fromEntries(
    Object.entries(value as Record<string, unknown>).map(([k, v]) => [k, SECRET_KEY.test(k) && v != null && v !== '' ? '***' : maskSecrets(v, depth + 1)]),
  );
}
