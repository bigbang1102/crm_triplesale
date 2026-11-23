/**
 * The calls of the sign-in itself (the Keycloak token endpoint, `POST /me/session`, …) are made with the browser's `fetch`, not with
 * HttpClient, so the Log interceptor never sees them. `tracedFetch` is `fetch` that tells a listener what it sent and what came back —
 * only while one is registered (`setAuthTracer`, done when `features.apiLog` is on); with none it is plain `fetch`.
 */
export interface AuthCall {
  id: number;
  /** `HH:mm:ss.SSS` */
  at: string;
  /** what the call is for, e.g. `Keycloak token (authorization_code)` */
  label: string;
  method: string;
  /** the full URL */
  url: string;
  headers: Record<string, string>;
  /** the request body as text ('' when none) */
  body: string;
  /** HTTP status, 0 when nothing came back */
  status: number;
  ms: number;
  /** the answer as text (clipped) */
  resBody: string;
}

export type AuthCallReport = Omit<AuthCall, 'id' | 'at'>;

let tracer: ((call: AuthCallReport) => void) | null = null;

/** register (or, with null, remove) the listener of `tracedFetch` */
export function setAuthTracer(fn: ((call: AuthCallReport) => void) | null): void {
  tracer = fn;
}

export interface TracedInit {
  method: string;
  headers: Record<string, string>;
  body?: URLSearchParams | string;
}

const RES_LIMIT = 4000;

/** `fetch(url, init)`, reported to the listener when there is one. Never changes what fetch does or throws. */
export async function tracedFetch(label: string, url: string, init: TracedInit): Promise<Response> {
  const listener = tracer;
  if (!listener) return fetch(url, init);
  const started = performance.now();
  const body = init.body === undefined ? '' : init.body.toString();
  const report = (status: number, resBody: string): void => {
    try {
      listener({ label, method: init.method, url, headers: init.headers, body, status, ms: Math.round(performance.now() - started), resBody });
    } catch {
      /* a listener must not break the sign-in */
    }
  };
  let res: Response;
  try {
    res = await fetch(url, init);
  } catch (err) {
    report(0, '');
    throw err;
  }
  let text = '';
  try {
    text = typeof res.clone === 'function' ? await res.clone().text() : '';
  } catch {
    /* body not readable: report without it */
  }
  report(res.status, text.length > RES_LIMIT ? `${text.slice(0, RES_LIMIT)}...[ตัดออก ${text.length - RES_LIMIT} ตัวอักษร จากทั้งหมด ${text.length}]` : text);
  return res;
}
