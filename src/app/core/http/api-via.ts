/**
 * "Which servlet of the Java app is this REST call made for?" — the `เรียกจาก servlet: /board/…` line of the Log window
 * (Java: `ApiLog.viaOf(request)` = the path of the servlet that was running when `Data_API` sent the request).
 *
 * There are no servlets any more: a page still asks `fetch('/board/leads?…')`, and a live backend (core/live, `composeRoutes`) answers it
 * from the browser with REST calls. `composeRoutes` wraps every handler in `runVia(path, …)`; the API log interceptor reads
 * `currentVia()` when the request enters the HttpClient — which is synchronous, in the same turn as the handler's first REST call.
 *
 * The value is cleared at the end of that turn (microtask), so a call a handler makes after an `await` is logged with no servlet
 * rather than with another request's. Never wrong, sometimes empty. Framework-free: the specs and the harness import it too.
 */
let current = '';

/** run `fn` (synchronously) as the handler of the servlet URL `via`; REST calls issued in the same turn are logged under it */
export function runVia<T>(via: string, fn: () => T): T {
  current = via;
  queueMicrotask(() => {
    if (current === via) current = '';
  });
  return fn();
}

/** the servlet whose handler is running right now ('' = none / unknown) */
export const currentVia = (): string => current;
