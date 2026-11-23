/** Error thrown by every BFF/API call. `message` is already user-presentable. */
export class ApiError extends Error {
  constructor(
    readonly status: number,
    message: string,
    readonly options: {
      code?: string | number;
      details?: unknown;
      /** true for a 401 produced by SessionTokenFilter (`{authRequired:true}`) */
      authRequired?: boolean;
      /** NO_TOKEN | TOKEN_EXPIRED | ERROR … from BFF-originated bodies */
      responseCode?: string;
      body?: unknown;
    } = {},
  ) {
    super(message);
    this.name = 'ApiError';
  }

  get authRequired(): boolean {
    return this.options.authRequired === true;
  }
}

/**
 * Builds a readable message from any error body the backends/BFF produce.
 * Port of `crmErrText()` (crm_error_popup.js): show `message`, then `error` (string) or
 * `error.message` / `error.description`, then the JSON of `error.details | fieldErrors | errors`,
 * joined by " - ". BFF shapes `{failMessage}` and `{error:"…"}` are understood too.
 */
export function errorText(body: unknown, fallback = ''): string {
  if (body == null) return fallback;
  if (typeof body === 'string') return body.trim() || fallback;
  if (typeof body !== 'object') return fallback;

  const b = body as Record<string, unknown>;
  const parts: string[] = [];
  const push = (v: unknown) => {
    if (typeof v !== 'string') return;
    const s = v.trim();
    if (s && !parts.includes(s)) parts.push(s);
  };

  push(b['failMessage']);
  push(b['message']);

  const err = b['error'];
  if (typeof err === 'string') {
    push(err);
  } else if (err && typeof err === 'object') {
    const e = err as Record<string, unknown>;
    push(e['message']);
    push(e['description']);
    const extra = e['details'] ?? e['fieldErrors'] ?? e['errors'];
    if (extra != null && extra !== '') push(typeof extra === 'string' ? extra : JSON.stringify(extra));
  }
  return parts.join(' - ') || fallback;
}
