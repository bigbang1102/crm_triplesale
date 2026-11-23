import { HttpErrorResponse, HttpInterceptorFn, HttpResponse } from '@angular/common/http';
import { inject } from '@angular/core';
import { Observable, mergeMap, of, throwError, timer } from 'rxjs';
import { TokenStore } from '../auth/token.store';
import { ConfigService } from '../config/config.service';
import { ApiRequest, handleApi } from './auth-api.mock';
import { profileOf } from './mock-users';

/**
 * Development-only fake of the backends the shell needs, enabled by `mock: true` in config/app-config.json (the default for
 * `npm start`). It lets you run and demo the whole UI without the auth service, triplesale-service, Tomcat or MySQL: the
 * sign-in runs the real code (AuthService) against fake answers of the REST APIs (auth-api.mock.ts).
 *
 * Demo accounts (any password except "wrong"):
 *   demo    all permissions                     multi   asks to pick a company (2-step login)
 *   viewer  Lead + Calendar only                admin    super_admin
 *   (any other name behaves like "demo"; the accounts that make a sign-in call fail on purpose are listed in auth-api.mock.ts)
 *
 * Every other REST route answers 501 once signed in (401 before), so a missing mock is obvious.
 */

const LATENCY_MS = 250;

const reply = <T>(body: T, status = 200): Observable<HttpResponse<T>> =>
  timer(LATENCY_MS).pipe(mergeMap(() => of(new HttpResponse<T>({ status, body }))));

const fail = (url: string, status: number, error: unknown): Observable<never> =>
  timer(LATENCY_MS).pipe(mergeMap(() => throwError(() => new HttpErrorResponse({ status, error, url }))));

export const mockBackendInterceptor: HttpInterceptorFn = (req, next) => {
  const config = inject(ConfigService);
  if (!config.value.mock) return next(req);

  // the REST APIs (auth service, triplesale-service)
  const { auth, service } = config.value.api;
  const api = req.url.startsWith(`${auth}/`) ? 'auth' : req.url.startsWith(`${service}/`) ? 'service' : null;
  if (api) {
    const base = api === 'auth' ? auth : service;
    const call: ApiRequest = {
      api,
      method: req.method,
      path: req.url.slice(base.length),
      body: req.body,
      bearer: /^Bearer (.+)$/.exec(req.headers.get('Authorization') ?? '')?.[1] ?? null,
    };
    const out = handleApi(call, profileOf);
    if (out.status === 0) return fail(req.url, 0, null);
    return out.status < 300 ? reply(out.body, out.status) : fail(req.url, out.status, out.body);
  }

  // the old BFF (legacy): nothing of it is mocked here — the pages that still call it bring their own mock
  if (config.isBffUrl(req.url)) {
    if (!inject(TokenStore).isLive()) {
      return fail(req.url, 401, { authRequired: true, responseCode: 'NO_TOKEN', message: 'กรุณาลงชื่อเข้าใช้', status: 401 });
    }
    const path = req.url.slice(config.value.apiBase.length).split('?')[0];
    return fail(req.url, 501, { status: 501, message: `Mock backend: ${req.method} ${path} is not implemented` });
  }

  return next(req);
};
