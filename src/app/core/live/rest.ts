/**
 * The plumbing every LIVE backend of a ported page shares (no Angular imports: the specs and the comparison harness use it too).
 *
 * The Java pages talked to servlets of the same web app (`/board/leads`, `/board/employees` …); those servlets held the token in the HTTP
 * session, called `triplesale-service` and reshaped the answer. There are no servlets any more (ADR-001): a live backend of a page keeps the
 * page's contract — `fetch('/board/leads?…')` — and answers it from the browser, calling the REST API through `RestDeps.call` (the app's
 * HttpClient: Bearer token, "session ended" on a 401, the API log of the top bar). One servlet = one function in a `*.live.ts` file
 * that does exactly what the servlet did: the role pre-check, the upstream call, the cleaning / localisation / renaming, the status mapping.
 */

import { runVia } from '../http/api-via';

/** what `RestDeps.call` resolves with, whatever the status (0 = no answer at all) */
export interface RestResult {
  status: number;
  /** body as text ('' when there is none) */
  text: string;
}

/** what a live backend gets from the app */
export interface RestDeps {
  /** one HTTP call with the Bearer token; never rejects */
  call(method: string, url: string, body?: unknown, headers?: Record<string, string>): Promise<RestResult>;
  /** base of triplesale-service, e.g. `/triplesale-service/api/v1` (Java: `triplesale.api.base` + `/triplesale-service/api/v1`) */
  serviceApi: string;
  /** base of dashboard-triplesale-service */
  dashboardApi: string;
  /** the signed-in user (Java: the session attributes `ss_*`) */
  user: { username: string; employeeId: number | null; employeeCode: string; branchCode: string; branchId: number | string | null };
  /** `SessionRoles.hasRole` — a super-admin alias passes every check */
  hasRole(role: string): boolean;
  /** the language of the page (Java: `commonBean.currentLang`) */
  lang(): 'th' | 'en';
  /** `MasterDataI18n`: the text of a key in the master-data dictionary of a language (`masterdata_en/th.properties`), undefined when there is none */
  masterText(lang: 'th' | 'en', key: string): string | undefined;
  /** the text of a message key in the language of the page (Java: `I18n.get(lang, key)`) */
  message(key: string): string;
  /** a static file of the app (`assets/…`: what the servlets read from the classpath), null when it is not there */
  asset(path: string): Promise<string | null>;
}

export type Query = Record<string, string | number | boolean | null | undefined | readonly (string | number)[]> | URLSearchParams;

/** `?a=1&a=2&b=x` from an object (undefined / null / '' are left out, arrays repeat the key) */
export function toQuery(q?: Query): string {
  if (!q) return '';
  const p = q instanceof URLSearchParams ? q : new URLSearchParams();
  if (!(q instanceof URLSearchParams)) {
    for (const [k, v] of Object.entries(q)) {
      if (v === undefined || v === null || v === '') continue;
      if (Array.isArray(v)) for (const x of v) p.append(k, String(x));
      else p.append(k, String(v));
    }
  }
  const s = p.toString();
  return s ? `?${s}` : '';
}

/** the parts of an answer a servlet looked at */
export interface Upstream {
  status: number;
  ok: boolean;
  text: string;
  /** the parsed body; `undefined` when it is empty or not JSON */
  json: unknown;
}

const parse = (text: string): unknown => {
  if (!text) return undefined;
  try {
    return JSON.parse(text);
  } catch {
    return undefined;
  }
};

/** a call to triplesale-service (`path` below `/api/v1`, e.g. `/leads`) */
export async function service(
  deps: RestDeps,
  method: string,
  path: string,
  opts: { query?: Query; body?: unknown; headers?: Record<string, string> } = {},
): Promise<Upstream> {
  const r = await deps.call(method, `${deps.serviceApi}${path}${toQuery(opts.query)}`, opts.body, { Accept: 'application/json', ...opts.headers });
  return { status: r.status, ok: r.status >= 200 && r.status < 300, text: r.text, json: parse(r.text) };
}

export const get = (deps: RestDeps, path: string, query?: Query): Promise<Upstream> => service(deps, 'GET', path, { query });

/** `Data_API.sendPOST` / `sendPatchRequest` / `sendPUT`: the body of the answer WHATEVER the status ('' when there is none or no answer at all) */
export async function sendBody(deps: RestDeps, method: 'POST' | 'PATCH' | 'PUT' | 'DELETE', path: string, body?: unknown): Promise<string> {
  return (await service(deps, method, path, { body })).text;
}

/** `Data_API.sendGET`: the body of a 200 answer, '' for anything else (the error body of the service was only logged) */
export const body200 = (u: Upstream): string => (u.status === 200 ? u.text : '');

/** `{ status, message, result }` → `result` (the envelope of the services); a body without `result` is returned as it is */
export function result<T = unknown>(u: Upstream): T | undefined {
  const j = u.json;
  if (j && typeof j === 'object' && !Array.isArray(j) && 'result' in (j as Record<string, unknown>)) return (j as { result: T }).result;
  return j as T | undefined;
}

/** the message of an upstream error body (`{message}` / `{error:{message}}` / `{error:"…"}`), '' when there is none */
export function errorMessage(u: Upstream): string {
  const j = u.json as { message?: unknown; error?: unknown } | undefined;
  const e = j?.error;
  if (typeof e === 'string' && e) return e;
  if (e && typeof e === 'object' && typeof (e as { message?: unknown }).message === 'string') return (e as { message: string }).message;
  return typeof j?.message === 'string' ? j.message : '';
}

/* ---------------------------------------------------------------- the answers a servlet gives */

export const jsonResponse = (status: number, body: unknown, headers: Record<string, string> = {}): Response =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json;charset=UTF-8', ...headers } });

/** a text answer (the servlets wrote JSON they had built as text) */
export const textResponse = (status: number, text: string, type = 'application/json; charset=UTF-8'): Response => new Response(text, { status, headers: { 'content-type': type } });

/** the body text of an upstream answer passed on untouched (a servlet that forwarded `status` and `body`) */
export const passThrough = (u: Upstream): Response =>
  new Response(u.text, { status: u.status || 502, headers: { 'content-type': 'application/json;charset=UTF-8' } });

/** what the servlets answered when the call could not be made at all */
export const noAnswer = (what: string): Response => jsonResponse(502, { status: 502, message: `${what}: no answer from the service` });

/** the URL a page passed to `fetch` → path (below the contract base, without a context path) + query */
export function parsePageUrl(input: string): { path: string; query: URLSearchParams } {
  const u = new URL(input, 'http://page.local');
  return { path: u.pathname.replace(/^\/triplesale(?=\/)/, ''), query: u.searchParams };
}

/** `Number(x)` for a query parameter; `undefined` when it is missing or not a number */
export function numParam(q: URLSearchParams, name: string): number | undefined {
  const v = q.get(name);
  if (v === null || v.trim() === '') return undefined;
  const n = Number(v);
  return Number.isFinite(n) ? n : undefined;
}

/** a route handler returns `null` when the URL is not its own */
export type RouteHandler = (path: string, query: URLSearchParams, init: RequestInit | undefined) => Promise<Response | null>;

/** the first handler that knows the route answers; none = 404 JSON like a servlet that is not mapped */
export function composeRoutes(...handlers: RouteHandler[]): (input: string, init?: RequestInit) => Promise<Response> {
  return async (input, init) => {
    const { path, query } = parsePageUrl(input);
    for (const h of handlers) {
      // the API log names this servlet URL next to the REST calls the handler makes (core/http/api-via.ts)
      const r = await runVia(path, () => h(path, query, init));
      if (r) return r;
    }
    return jsonResponse(404, { status: 404, message: `no live route for ${path}` });
  };
}

/** the JSON body a page posted (`init.body` is a string), `{}` when it is empty or not JSON */
export function bodyOf(init: RequestInit | undefined): Record<string, unknown> {
  const b = init?.body;
  if (typeof b !== 'string' || !b) return {};
  try {
    const j = JSON.parse(b);
    return j && typeof j === 'object' && !Array.isArray(j) ? (j as Record<string, unknown>) : {};
  } catch {
    return {};
  }
}
