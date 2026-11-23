import { HttpClient, HttpErrorResponse } from '@angular/common/http';
import { Injector, inject, runInInjectionContext } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import { AuthService } from '../auth/auth.service';
import { SessionInfo } from '../auth/auth.models';
import { ConfigService } from '../config/config.service';
import { ApiError } from '../http/api-error';
import { I18n } from '../i18n/i18n.service';
import { PermissionService } from '../permissions/permission.service';
import type { RestDeps } from './rest';

/** `RestDeps` of an injector — for a host that only needs them in live mode (the mock mode must not ask for HttpClient / AuthService) */
export const restDepsOf = (injector: Injector): RestDeps => runInInjectionContext(injector, injectRestDeps);

/** `RestDeps` for a host component (call it in the constructor / a field initialiser: it injects) */
export function injectRestDeps(): RestDeps {
  const config = inject(ConfigService);
  const auth = inject(AuthService);
  const perm = inject(PermissionService);
  const i18n = inject(I18n);
  return createRestDeps({
    http: inject(HttpClient),
    api: config.value.api,
    session: () => auth.session(),
    hasRole: (role) => perm.has(role),
    lang: () => i18n.lang(),
    masterText: (lang, key) => i18n.masterRaw(lang, key),
    message: (key) => i18n.t(key),
  });
}

/**
 * The Angular side of `RestDeps`: every call goes through the app's HttpClient, so the interceptors do their work (Bearer token,
 * a 401 = the session ended, the API log of the top bar, `ApiError` for a non-2xx answer). A failed call still resolves with the
 * status and the raw body, as a servlet that forwards an upstream error would see it.
 */
export function createRestDeps(args: {
  http: HttpClient;
  api: { service: string; dashboard: string };
  session: () => SessionInfo | null;
  hasRole: (role: string) => boolean;
  lang: () => 'th' | 'en';
  masterText: (lang: 'th' | 'en', key: string) => string | undefined;
  message: (key: string) => string;
}): RestDeps {
  const { http, api } = args;
  return {
    call: async (method, url, body, headers) => {
      try {
        const r = await firstValueFrom(http.request(method, url, { body, headers, observe: 'response', responseType: 'text' }));
        return { status: r.status, text: r.body ?? '' };
      } catch (e) {
        // the interceptors turn a non-2xx answer into an ApiError that still carries the raw body
        const status = e instanceof ApiError ? e.status : e instanceof HttpErrorResponse ? e.status : 0;
        // no answer at all (the network is down): nothing to read — `error` would be the ProgressEvent, `{"isTrusted":true}` as text
        if (status === 0) return { status: 0, text: '' };
        const raw = e instanceof ApiError ? e.options.body : e instanceof HttpErrorResponse ? e.error : '';
        return { status, text: typeof raw === 'string' ? raw : raw == null ? '' : JSON.stringify(raw) };
      }
    },
    serviceApi: api.service,
    dashboardApi: api.dashboard,
    get user() {
      const s = args.session();
      return {
        username: s?.username ?? '',
        employeeId: s?.employeeId ?? null,
        employeeCode: s?.employeeCode ?? '',
        branchCode: s?.branchCode ?? '',
        branchId: s?.branch?.id ?? null,
      };
    },
    hasRole: args.hasRole,
    lang: args.lang,
    masterText: args.masterText,
    message: args.message,
    asset: async (path) => {
      try {
        return await firstValueFrom(http.get(path, { responseType: 'text' }));
      } catch {
        return null;
      }
    },
  };
}
