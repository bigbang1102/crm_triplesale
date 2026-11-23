import { provideHttpClient, withInterceptors } from '@angular/common/http';
import { provideHttpClientTesting } from '@angular/common/http/testing';
import { Component } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ConfigService } from '../config/config.service';
import { ApiLogService } from '../http/api-log.service';
import { setAuthTracer } from '../http/auth-trace';
import { apiErrorInterceptor, bearerInterceptor, credentialsInterceptor } from '../http/interceptors';
import { mockBackendInterceptor } from '../http/mock-backend.interceptor';
import { configStub } from '../testing/test-helpers';
import { AuthService } from './auth.service';
import { TokenStore } from './token.store';

@Component({ template: '' })
class Blank {}

const FEATURES_ON = { aiHubEnabled: true, pageGuardEnabled: true, apiLog: true };
const session = { username: 'demo', profileName: 'Demo', employeeId: 1, employeeCode: 'E001', branch: null, branchCode: '', roles: [], lang: 'th' as const };

/** the tokens a sign-in and a refresh bring are listed in the Log window (features.apiLog) — see the "Token" tab of layout/api-log */
describe('AuthService — tokens shown in the Log window', () => {
  describe('sign-in with the auth service', () => {
    const setup = (features = FEATURES_ON) => {
      sessionStorage.clear();
      TestBed.configureTestingModule({
        providers: [
          provideRouter([{ path: 'login', component: Blank }]),
          provideHttpClient(withInterceptors([apiErrorInterceptor, bearerInterceptor, credentialsInterceptor, mockBackendInterceptor])),
          { provide: ConfigService, useValue: configStub({ mock: true, features }) },
        ],
      });
      return { auth: TestBed.inject(AuthService), log: TestBed.inject(ApiLogService) };
    };

    it('a sign-in that succeeds lists its access token, refresh token and lifetime', async () => {
      const { auth, log } = setup();
      expect((await auth.proxy({ username: 'demo', password: 'x' })).data?.['responseCode']).toBe('COMPLETE');
      expect(log.tokenEvents()).toHaveLength(1);
      expect(log.tokenEvents()[0]).toMatchObject({ kind: 'login', source: 'auth-api', refreshToken: 'mock.refresh.demo', idToken: '', expiresIn: 3600 });
      expect(log.tokenEvents()[0].accessToken).toMatch(/^mock\.access\./);
      expect(log.tokenEvents()[0].accessToken).toBe(TestBed.inject(TokenStore).read()?.accessToken); // the one the tab really holds
    });

    it('a sign-in that fails, or one that still has to choose a company, lists nothing for the pending token', async () => {
      const { auth, log } = setup();
      await auth.proxy({ username: 'demo', password: 'wrong' });
      expect(log.tokenEvents()).toHaveLength(0);
      expect((await auth.proxy({ username: 'multi', password: 'x' })).data?.['responseCode']).toBe('ORG_REQUIRED');
      expect(log.tokenEvents()).toHaveLength(0); // that token may only be used to choose the company
    });

    it('the token of the chosen company is listed once the company step is done', async () => {
      const { auth, log } = setup();
      await auth.proxy({ username: 'multi', password: 'x' });
      await auth.proxy({ action: 'branches' });
      await auth.proxy({ action: 'select-org', org: '1004400456' });
      expect(log.tokenEvents()).toHaveLength(1);
      expect(log.tokenEvents()[0]).toMatchObject({ kind: 'login', source: 'auth-api' });
    });

    it('signing out empties the list', async () => {
      const { auth, log } = setup();
      await auth.proxy({ username: 'demo', password: 'x' });
      await auth.completeSignIn();
      await auth.logout();
      expect(log.tokenEvents()).toHaveLength(0);
    });

    it('lists nothing when the Log is off (features.apiLog — production)', async () => {
      const { auth, log } = setup({ aiHubEnabled: true, pageGuardEnabled: true, apiLog: false });
      await auth.proxy({ username: 'demo', password: 'x' });
      expect(log.tokenEvents()).toHaveLength(0);
    });
  });

  describe('Keycloak refresh token', () => {
    let fetchMock: ReturnType<typeof vi.fn>;
    const json = (body: unknown, status = 200) => ({ ok: status >= 200 && status < 300, status, json: async () => body });

    const setup = () => {
      sessionStorage.clear();
      TestBed.configureTestingModule({
        providers: [
          provideRouter([]),
          provideHttpClient(),
          provideHttpClientTesting(),
          { provide: ConfigService, useValue: configStub({ features: FEATURES_ON, keycloak: { enabled: true, url: '', realm: 'ace', clientId: 'triplesales-web' } }) },
        ],
      });
      TestBed.inject(TokenStore).write({ accessToken: 'old', refreshToken: 'r-1', expiresAt: Date.now() + 1000, provider: 'keycloak', issuer: 'https://x/realms/y', session });
      return { auth: TestBed.inject(AuthService), log: TestBed.inject(ApiLogService) };
    };

    beforeEach(() => {
      fetchMock = vi.fn();
      vi.stubGlobal('fetch', fetchMock);
    });
    afterEach(() => {
      setAuthTracer(null);
      vi.unstubAllGlobals();
    });

    it('with the Log watching the Keycloak calls, a refresh lists the curl it sent (token endpoint, form body); the next one starts empty', async () => {
      const { auth, log } = setup();
      log.watchAuthCalls();
      fetchMock.mockResolvedValue(json({ access_token: 'new-1', refresh_token: 'r-2', expires_in: 300 }));
      await auth.refresh();
      await auth.refresh();
      const [second, first] = log.tokenEvents();
      expect(first.calls).toHaveLength(1);
      expect(first.calls[0]).toMatchObject({ label: 'Keycloak token (refresh_token)', method: 'POST', status: 200, url: 'https://x/realms/y/protocol/openid-connect/token' });
      expect(log.authCurl(first.calls[0])).toBe(
        "curl -i -X POST 'https://x/realms/y/protocol/openid-connect/token' -H 'Content-Type: application/x-www-form-urlencoded' -H 'Accept: application/json' -d 'grant_type=refresh_token&client_id=triplesales-web&refresh_token=r-1'",
      );
      expect(second.calls).toHaveLength(1);
      expect(log.authCurl(second.calls[0])).toContain('refresh_token=r-2'); // the rotated token of the first refresh
    });

    it('without watchAuthCalls (Log off) the refresh lists no curl', async () => {
      const { auth, log } = setup();
      fetchMock.mockResolvedValue(json({ access_token: 'new-1', refresh_token: 'r-2', expires_in: 300 }));
      await auth.refresh();
      expect(log.tokenEvents()[0].calls).toEqual([]);
    });

    it('every refresh lists the new tokens (newest first), with the id token when Keycloak sends one', async () => {
      const { auth, log } = setup();
      fetchMock.mockResolvedValueOnce(json({ access_token: 'new-1', refresh_token: 'r-2', id_token: 'id-1', expires_in: 300 }));
      expect(await auth.refresh()).toBe(true);
      fetchMock.mockResolvedValueOnce(json({ access_token: 'new-2', refresh_token: 'r-3', expires_in: 300 }));
      expect(await auth.refresh()).toBe(true);

      expect(log.tokenEvents().map((t) => [t.kind, t.source, t.accessToken, t.refreshToken, t.idToken, t.expiresIn])).toEqual([
        ['refresh', 'keycloak', 'new-2', 'r-3', '', 300],
        ['refresh', 'keycloak', 'new-1', 'r-2', 'id-1', 300],
      ]);
    });

    it('a refresh that fails lists nothing', async () => {
      const { auth, log } = setup();
      vi.spyOn(console, 'warn').mockImplementation(() => undefined);
      fetchMock.mockResolvedValue(json({ error: 'invalid_grant' }, 400));
      expect(await auth.refresh()).toBe(false);
      expect(log.tokenEvents()).toHaveLength(0);
    });
  });
});
