import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting } from '@angular/common/http/testing';
import { Component } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { Router, provideRouter } from '@angular/router';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ConfigService } from '../config/config.service';
import { configStub } from '../testing/test-helpers';
import { AuthService } from './auth.service';
import { TokenStore } from './token.store';

@Component({ template: '' })
class Blank {}

const session = { username: 'demo', profileName: 'Demo', employeeId: 1, employeeCode: 'E001', branch: null, branchCode: '', roles: [], lang: 'th' as const };

describe('AuthService.logout() of a Keycloak sign-in', () => {
  let auth: AuthService;
  let store: TokenStore;
  let leave: ReturnType<typeof vi.fn<(url: string) => void>>;

  beforeEach(() => {
    sessionStorage.clear();
    TestBed.configureTestingModule({
      providers: [
        provideRouter([{ path: 'login', component: Blank }]),
        provideHttpClient(),
        provideHttpClientTesting(),
        { provide: ConfigService, useValue: configStub({ keycloak: { enabled: true, url: '', realm: 'ace', clientId: 'triplesales-web' } }) },
      ],
    });
    auth = TestBed.inject(AuthService);
    store = TestBed.inject(TokenStore);
    leave = vi.fn<(url: string) => void>();
    (auth as unknown as { leave: (url: string) => void }).leave = leave;
  });

  it('ends the Keycloak session and comes back to /auth/callback — the address the client is registered with — not to /login', async () => {
    store.write({ accessToken: 'a', refreshToken: 'r', expiresAt: Date.now() + 60_000, provider: 'keycloak', idToken: 'id-1', issuer: 'https://dev-auth.example/realms/ace', session });
    await auth.logout();

    expect(leave).toHaveBeenCalledTimes(1);
    const url = new URL(leave.mock.calls[0][0] as string);
    expect(url.origin + url.pathname).toBe('https://dev-auth.example/realms/ace/protocol/openid-connect/logout');
    expect(url.searchParams.get('client_id')).toBe('triplesales-web');
    expect(url.searchParams.get('id_token_hint')).toBe('id-1');
    expect(url.searchParams.get('post_logout_redirect_uri')).toBe(new URL('auth/callback', document.baseURI).href);
    expect(store.read()).toBeNull(); // the sign-in of this tab is gone before it leaves
    expect(auth.isAuthenticated()).toBe(false);
  });

  it('a sign-in that did not come from Keycloak just goes to /login', async () => {
    store.write({ accessToken: 'a', refreshToken: 'r', expiresAt: Date.now() + 60_000, session });
    await auth.logout();
    expect(leave).not.toHaveBeenCalled();
    expect(TestBed.inject(Router).url).toBe('/login');
  });
});
