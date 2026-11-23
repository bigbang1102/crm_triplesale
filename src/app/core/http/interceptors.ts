import { HttpErrorResponse, HttpEvent, HttpInterceptorFn, HttpRequest, HttpResponse } from '@angular/common/http';
import { Injector, inject } from '@angular/core';
import { Router } from '@angular/router';
import { Observable, catchError, from, switchMap, tap, throwError } from 'rxjs';
import { AuthService } from '../auth/auth.service';
import { errorCodeOf } from '../auth/keycloak';
import { TokenStore } from '../auth/token.store';
import { ConfigService } from '../config/config.service';
import { ApiError, errorText } from './api-error';
import { ApiLogService, BODY_LIMIT, CURL_BODY_LIMIT, clipBody, maskSecrets } from './api-log.service';
import { currentVia } from './api-via';
import { REFRESH_RETRIED, SIGN_IN_CALL } from './http-context';

/** a request body as the Log shows it: JSON text with every password / token masked (the sign-in body carries the password) */
function requestText(body: unknown): string {
  if (body === null || body === undefined) return '';
  if (body instanceof FormData) return '[form data]';
  if (typeof body === 'string') {
    try {
      return JSON.stringify(maskSecrets(JSON.parse(body)));
    } catch {
      return SECRET_TEXT.test(body) ? '***' : body; // not JSON (a form, plain text): never keep what looks like a secret
    }
  }
  return JSON.stringify(maskSecrets(body));
}
const SECRET_TEXT = /pass(word)?=|token=|secret=/i;

/** an answer as the Log shows it (a JSON object is printed as compact JSON, as the servlets printed the upstream body) */
function answerText(body: unknown): string {
  if (body === null || body === undefined) return '';
  if (typeof body === 'string') return body;
  if (typeof Blob !== 'undefined' && body instanceof Blob) return '(binary)';
  return JSON.stringify(body);
}

/**
 * Feeds the Log window (only when `features.apiLog` is on): one entry per call to a REST API / the old BFF, with the page it belongs
 * to, the servlet URL the page asked (api-via.ts), both bodies and the status. Outermost: sees the final status.
 */
export const apiLogInterceptor: HttpInterceptorFn = (req, next) => {
  const config = inject(ConfigService);
  if (!config.isApiUrl(req.url) || !config.value.features.apiLog) return next(req);

  const log = inject(ApiLogService);
  const started = performance.now();
  const page = log.currentPage;
  const via = currentVia(); // read now: the HttpClient subscribes in the turn of the handler's call
  const reqBody = clipBody(requestText(req.body), CURL_BODY_LIMIT);
  const record = (status: number, answer: unknown) =>
    log.record({
      page,
      via,
      method: req.method,
      url: req.urlWithParams,
      bearer: config.isBackendUrl(req.url),
      status,
      ms: Math.round(performance.now() - started),
      reqBody,
      resBody: clipBody(answerText(answer), BODY_LIMIT),
    });

  return next(req).pipe(
    tap({
      next: (event) => {
        if (event instanceof HttpResponse) record(event.status, event.body);
      },
      error: (err: unknown) => (err instanceof ApiError ? record(err.status, err.options.body) : record(0, '')),
    }),
  );
};

/** the header that tells the service which company this tab works in */
export const EXPECTED_COMPANY = 'X-Expected-Company';

/** a Keycloak session is renewed this long before its access token runs out (not at the last second) */
const REFRESH_SKEW_MS = 30_000;

/**
 * `Authorization: Bearer <access token>` on every call to the REST APIs — what `TriplesaleApi.authTokenFresh()` + `Data_API`
 * did on the server. A call that sets its own Authorization (the company choice with the pending token) is left alone.
 *
 * A Keycloak session (`keycloak.enabled`) whose token is about to run out is renewed first with its refresh token and the call is
 * sent with the new one. Anything else — the form sign-in, Keycloak off — keeps the old rule: a token whose time is up is not
 * sent, that is the `TOKEN_EXPIRED` of `SessionTokenFilter` (the session ends the same way as on a 401).
 */
export const bearerInterceptor: HttpInterceptorFn = (req, next) => {
  const config = inject(ConfigService);
  if (!config.isBackendUrl(req.url) || req.headers.has('Authorization')) return next(req);

  const store = inject(TokenStore);
  const injector = inject(Injector);
  const kept = store.read();
  if (!kept) return next(req); // not signed in: the service answers 401 itself

  const send = (k: { accessToken: string; expiresAt: number }): Observable<HttpEvent<unknown>> => {
    if (Date.now() >= k.expiresAt) {
      injector.get(AuthService).handleUnauthorized('TOKEN_EXPIRED');
      return throwError(
        () => new ApiError(401, 'เซสชันหมดอายุ กรุณาเข้าสู่ระบบใหม่', { authRequired: true, responseCode: 'TOKEN_EXPIRED' }),
      );
    }
    // `X-Expected-Company`: the company this tab chose (kept at the company choice: `session.branch.id`). The service refuses (409) a call whose
    // company is no longer the one it holds for the user, e.g. changed in another tab. To triplesale-service and the dashboard service, only when the
    // id is a uuid text. NOT to the auth service, and not to `/me/session` (those calls go through `fetch` in keycloak.ts): `POST /me/session` is what a tab
    // uses to learn the company the server holds NOW after another tab changed it — with the old company in the header it would be refused for the very reason
    // it is made
    const company = store.read()?.session.branch?.id;
    const companyApi = req.url.startsWith(`${config.value.api.service}/`) || req.url.startsWith(`${config.value.api.dashboard}/`);
    const expected = companyApi && !req.headers.has(EXPECTED_COMPANY) && typeof company === 'string' && company.trim() !== '' ? company.trim() : null;
    return next(req.clone({ setHeaders: { Authorization: `Bearer ${k.accessToken}`, ...(expected ? { [EXPECTED_COMPANY]: expected } : {}) } }));
  };

  const auth = injector.get(AuthService);
  if (kept.expiresAt - Date.now() <= REFRESH_SKEW_MS && auth.canRefresh()) {
    // no token back = the session is not renewed: a token that has not run out yet is still sent, one that has ends the session
    return from(auth.refresh()).pipe(switchMap((ok) => send((ok && store.read()) || kept)));
  }
  return send(kept);
};

/** Sends the JSESSIONID cookie to the old BFF (legacy — the REST APIs are called with the Bearer token only, no cookies). */
export const credentialsInterceptor: HttpInterceptorFn = (req, next) => {
  const config = inject(ConfigService);
  return next(config.isBffUrl(req.url) ? req.clone({ withCredentials: true }) : req);
};

/**
 * Converts any failed API call into an `ApiError` with a readable message and ends the session of a signed-in user when the
 * service says the token is no good:
 *   401 from a REST API (not a call of the sign-in itself)        →  AuthService.handleUnauthorized('TOKEN_EXPIRED')
 *   401 {"authRequired":true,"responseCode":…} of the old BFF       →  AuthService.handleUnauthorized(responseCode)
 * Other 401s (wrong password …) are plain errors — the caller shows `error.message`.
 *
 * With a Keycloak session (`keycloak.enabled`) a 401 of a REST API first tries the refresh token: new tokens are kept, the same call
 * is sent once more, and only when no token comes back (or the second try is a 401 too) does the session end as above. Calls that
 * 401 together share one refresh, and a call whose token was already replaced by another one is just sent again.
 */
export const apiErrorInterceptor: HttpInterceptorFn = (req, next) => {
  const config = inject(ConfigService);
  const injector = inject(Injector);
  if (!config.isApiUrl(req.url)) return next(req);

  const run = (r: HttpRequest<unknown>): Observable<HttpEvent<unknown>> => {
    const sentWith = injector.get(TokenStore).read()?.accessToken;
    return next(r).pipe(
      catchError((err: unknown) => {
        if (!(err instanceof HttpErrorResponse)) return throwError(() => err);

        const body = parseBody(err.error);
        const authRequired = typeof body === 'object' && body !== null && body['authRequired'] === true;
        const responseCode =
          typeof body === 'object' && body !== null ? (body['responseCode'] as string | undefined) : undefined;

        const fallback =
          err.status === 0 ? 'Cannot connect to the service' : `HTTP ${err.status}${err.statusText ? ` ${err.statusText}` : ''}`;
        const failure = () =>
          new ApiError(err.status, errorText(body, fallback), {
            authRequired,
            responseCode,
            code: typeof body === 'object' && body !== null ? (body['code'] as string | number | undefined) : undefined,
            body: err.error,
          });

        if (err.status === 401) {
          const auth = injector.get(AuthService);
          const code = errorCodeOf(body);
          if (authRequired) auth.handleUnauthorized(responseCode);
          else if (config.isBackendUrl(r.url) && !r.context.get(SIGN_IN_CALL) && code === 'SESSION_REPLACED') {
            // signed in on another device: a new token would not help — end the session, the next sign-in asks for the password (prompt=login)
            auth.handleUnauthorized('SESSION_REPLACED');
          } else if (config.isBackendUrl(r.url) && !r.context.get(SIGN_IN_CALL) && code === 'EMPLOYEE_INACTIVE' && auth.keycloakEnabled()) {
            // the employee / chosen company was switched off: keep the session, POST /me/session again and choose a company again
            const back = injector.get(Router).url;
            return from(auth.reselectCompany(back)).pipe(
              switchMap((shown) => {
                if (!shown) auth.handleUnauthorized('EMPLOYEE_INACTIVE');
                return throwError(failure);
              }),
            );
          } else if (config.isBackendUrl(r.url) && !r.context.get(SIGN_IN_CALL)) {
            if (auth.canRefresh() && !r.context.get(REFRESH_RETRIED) && !r.headers.has('Authorization')) {
              const store = injector.get(TokenStore);
              // someone already replaced the token this call was sent with: no need for another refresh, just send it again
              const renewed = store.read()?.accessToken !== sentWith ? Promise.resolve(true) : auth.refresh();
              return from(renewed).pipe(
                switchMap((ok) => {
                  if (ok) return run(r.clone({ context: r.context.set(REFRESH_RETRIED, true) }));
                  auth.handleUnauthorized('TOKEN_EXPIRED');
                  return throwError(failure);
                }),
              );
            }
            auth.handleUnauthorized('TOKEN_EXPIRED');
          }
        }
        if (err.status === 409 && config.isBackendUrl(r.url) && !r.context.get(SIGN_IN_CALL)) {
          const auth = injector.get(AuthService);
          const code = errorCodeOf(body);
          if (code === 'COMPANY_NOT_SELECTED' && auth.keycloakEnabled()) {
            // a business call before a company was chosen: take the user to the company choice
            return from(auth.reselectCompany(injector.get(Router).url)).pipe(switchMap(() => throwError(failure)));
          }
          if (code === 'COMPANY_CHANGED' && auth.keycloakEnabled()) {
            // the company was changed in another tab: this tab still shows the old one — tell the user, then reload (see App)
            void auth.notifyCompanyChanged();
          }
        }
        return throwError(failure);
      }),
    );
  };
  return run(req);
};

/** the error body as an object when it is JSON text (a call made with responseType 'text' keeps it as a string) */
function parseBody(raw: unknown): Record<string, unknown> | string | null {
  if (typeof raw !== 'string') return (raw as Record<string, unknown> | null) ?? null;
  const text = raw.trim();
  if (text.startsWith('{')) {
    try {
      return JSON.parse(text) as Record<string, unknown>;
    } catch {
      /* not JSON after all */
    }
  }
  return raw;
}
