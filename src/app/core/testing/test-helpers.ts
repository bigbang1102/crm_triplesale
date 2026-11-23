import { signal } from '@angular/core';
import { ConfigService } from '../config/config.service';
import { AppConfig, DEFAULT_CONFIG } from '../config/app-config';
import { AuthService } from '../auth/auth.service';
import { SessionInfo } from '../auth/auth.models';

/** ConfigService stand-in for unit tests (no fetch). */
export function configStub(
  overrides: Partial<AppConfig> = {},
): Pick<ConfigService, 'value' | 'apiUrl' | 'authUrl' | 'serviceUrl' | 'dashboardUrl' | 'masterUrl' | 'isApiUrl' | 'isBackendUrl' | 'isBffUrl'> {
  const value: AppConfig = { ...DEFAULT_CONFIG, ...overrides };
  const join = (base: string, path: string) => `${base}${path.startsWith('/') ? path : `/${path}`}`;
  const isBackendUrl = (url: string) =>
    url.startsWith(`${value.api.auth}/`) ||
    url.startsWith(`${value.api.service}/`) ||
    url.startsWith(`${value.api.dashboard}/`) ||
    url.startsWith(`${value.api.master}/`);
  const isBffUrl = (url: string) => url.startsWith(`${value.apiBase}/`);
  return {
    value,
    apiUrl: (path: string) => join(value.apiBase, path),
    authUrl: (path: string) => join(value.api.auth, path),
    serviceUrl: (path: string) => join(value.api.service, path),
    dashboardUrl: (path: string) => join(value.api.dashboard, path),
    masterUrl: (path: string) => join(value.api.master, path),
    isBackendUrl,
    isBffUrl,
    isApiUrl: (url: string) => isBackendUrl(url) || isBffUrl(url),
  };
}

/** AuthService stand-in exposing only what PermissionService / NavService / the generated screens read. */
export function authStub(roles: string[] | null, employeeId: number | null = 1001) {
  const session = signal<SessionInfo | null>(
    roles === null ? null : { username: 'u', profileName: 'U', employeeId, employeeCode: '', branch: null, branchCode: '', roles },
  );
  return { session, isAuthenticated: () => session() !== null, stateKey: () => 'test-state-key' } as unknown as AuthService;
}
