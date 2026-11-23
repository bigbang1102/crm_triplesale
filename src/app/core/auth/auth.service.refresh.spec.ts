import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ConfigService } from '../config/config.service';
import { configStub } from '../testing/test-helpers';
import { AuthService } from './auth.service';
import { TokenStore } from './token.store';

const session = { username: 'demo', profileName: 'Demo', employeeId: 1, employeeCode: 'E001', branch: null, branchCode: '', roles: [], lang: 'th' as const };
const TOKEN_URL = 'https://x/realms/y/protocol/openid-connect/token';

const json = (body: unknown, status = 200) => ({ ok: status >= 200 && status < 300, status, json: async () => body });
const tokens = (n: number) => json({ access_token: `new-${n}`, refresh_token: `r-${n + 1}`, expires_in: 1800 });

describe('AuthService — Keycloak refresh token', () => {
  let auth: AuthService;
  let store: TokenStore;
  let fetchMock: ReturnType<typeof vi.fn>;

  const setup = (keycloak: { enabled: boolean; groupApi?: string }) => {
    sessionStorage.clear();
    TestBed.configureTestingModule({
      providers: [
        provideRouter([]),
        provideHttpClient(),
        provideHttpClientTesting(),
        { provide: ConfigService, useValue: configStub({ keycloak: { ...keycloak, url: '', realm: 'ace', clientId: 'triplesales-web' } }) },
      ],
    });
    auth = TestBed.inject(AuthService);
    store = TestBed.inject(TokenStore);
  };
  const keepKeycloakSession = (expiresAt: number) =>
    store.write({ accessToken: 'old', refreshToken: 'r-1', expiresAt, provider: 'keycloak', issuer: 'https://x/realms/y', session });

  beforeEach(() => {
    fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
  });
  afterEach(() => vi.unstubAllGlobals());

  describe('refresh()', () => {
    it('keeps both new tokens and the rest of the session; the request goes to the issuer of the sign-in with the web client', async () => {
      setup({ enabled: true });
      keepKeycloakSession(Date.now() + 1000);
      fetchMock.mockResolvedValue(tokens(1));
      expect(await auth.refresh()).toBe(true);
      expect(fetchMock.mock.calls[0][0]).toBe(TOKEN_URL);
      expect(Object.fromEntries(new URLSearchParams(fetchMock.mock.calls[0][1].body as URLSearchParams))).toMatchObject({ client_id: 'triplesales-web', refresh_token: 'r-1' });
      expect(store.read()).toMatchObject({ accessToken: 'new-1', refreshToken: 'r-2', provider: 'keycloak', issuer: 'https://x/realms/y', session });
      expect(store.read()!.expiresAt).toBeGreaterThan(Date.now() + 1_700_000);
    });

    it('calls made while one is running share it', async () => {
      setup({ enabled: true });
      keepKeycloakSession(Date.now() + 1000);
      fetchMock.mockResolvedValue(tokens(1));
      expect(await Promise.all([auth.refresh(), auth.refresh(), auth.refresh()])).toEqual([true, true, true]);
      expect(fetchMock).toHaveBeenCalledTimes(1);
      fetchMock.mockResolvedValue(tokens(2)); // the next one after it is a new refresh
      expect(await auth.refresh()).toBe(true);
      expect(fetchMock).toHaveBeenCalledTimes(2);
    });

    it('no token back → false, the session is left as it was, and nothing secret is logged', async () => {
      setup({ enabled: true });
      keepKeycloakSession(Date.now() + 1000);
      const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
      fetchMock.mockResolvedValue(json({ error: 'invalid_grant' }, 400));
      expect(await auth.refresh()).toBe(false);
      expect(store.read()).toMatchObject({ accessToken: 'old', refreshToken: 'r-1' });
      expect(JSON.stringify(warn.mock.calls)).not.toContain('r-1');
      warn.mockRestore();
    });

    it('does nothing when Keycloak is off, when the session is not a Keycloak one, or when there is no refresh token', async () => {
      setup({ enabled: false });
      keepKeycloakSession(Date.now() + 1000);
      expect(auth.canRefresh()).toBe(false);
      expect(await auth.refresh()).toBe(false);

      TestBed.resetTestingModule();
      setup({ enabled: true });
      store.write({ accessToken: 'a', refreshToken: 'r', expiresAt: Date.now() + 1000, session }); // form sign-in
      expect(auth.canRefresh()).toBe(false);
      store.write({ accessToken: 'a', refreshToken: '', expiresAt: Date.now() + 1000, provider: 'keycloak', session });
      expect(auth.canRefresh()).toBe(false);
      expect(fetchMock).not.toHaveBeenCalled();
    });
  });

  describe('restore()', () => {
    it('a live session is restored without any request', async () => {
      setup({ enabled: true });
      keepKeycloakSession(Date.now() + 600_000);
      await auth.restore();
      expect(auth.isAuthenticated()).toBe(true);
      expect(fetchMock).not.toHaveBeenCalled();
    });

    it('a Keycloak session whose token ran out is renewed first (reload after the token expired)', async () => {
      setup({ enabled: true });
      keepKeycloakSession(Date.now() - 1000);
      fetchMock.mockResolvedValue(tokens(1));
      await auth.restore();
      expect(auth.isAuthenticated()).toBe(true);
      expect(store.read()!.accessToken).toBe('new-1');
    });

    it('…and when no token comes back the tab is signed out', async () => {
      setup({ enabled: true });
      keepKeycloakSession(Date.now() - 1000);
      fetchMock.mockResolvedValue(json({ error: 'invalid_grant' }, 400));
      vi.spyOn(console, 'warn').mockImplementation(() => undefined);
      await auth.restore();
      expect(auth.isAuthenticated()).toBe(false);
      expect(store.read()).toBeNull();
    });

    it('Keycloak off → the old rule: a token that ran out is dropped, no request', async () => {
      setup({ enabled: false });
      keepKeycloakSession(Date.now() - 1000);
      await auth.restore();
      expect(auth.isAuthenticated()).toBe(false);
      expect(fetchMock).not.toHaveBeenCalled();
    });
  });
});
