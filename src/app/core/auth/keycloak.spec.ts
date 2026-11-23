import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ApiAuthError, BLOCKED_SIGN_IN_CODES, KeycloakConfig, KeycloakError, errorCodeOf, beginLogin, callbackUrl, challengeOf, claimsOf, finishLogin, logoutUrl, refreshTokens, resolveGroup, selectCompany, startSession } from './keycloak';

const cfg: KeycloakConfig = { enabled: true, url: 'http://localhost:8180/', realm: 'triplesale', clientId: 'triplesales-web' };
const redirect = 'http://localhost:4200/auth/callback';

describe('keycloak (authorization code + PKCE)', () => {
  beforeEach(() => sessionStorage.clear());
  afterEach(() => vi.unstubAllGlobals());

  it('S256 challenge matches the RFC 7636 example', async () => {
    expect(await challengeOf('dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk')).toBe('E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM');
  });

  it('callbackUrl follows <base href>', () => {
    expect(callbackUrl('http://localhost:4200', '/')).toBe(redirect);
    expect(callbackUrl('http://localhost:4200', '/app')).toBe('http://localhost:4200/app/auth/callback');
  });

  it('builds the authorize URL and keeps the flow for the callback', async () => {
    const url = new URL(await beginLogin(cfg, redirect, '/crm/home'));
    expect(url.origin + url.pathname).toBe('http://localhost:8180/realms/triplesale/protocol/openid-connect/auth');
    expect(url.searchParams.get('client_id')).toBe('triplesales-web');
    expect(url.searchParams.get('redirect_uri')).toBe(redirect);
    expect(url.searchParams.get('response_type')).toBe('code');
    expect(url.searchParams.get('code_challenge_method')).toBe('S256');
    expect(JSON.parse(sessionStorage.getItem('ts_kc_flow')!).state).toBe(url.searchParams.get('state'));
  });

  it('swaps the code for tokens with the verifier, once', async () => {
    const url = new URL(await beginLogin(cfg, redirect, '/crm/prospects'));
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, status: 200, json: async () => ({ access_token: 'a', refresh_token: 'r', id_token: 'i', expires_in: 300 }) });
    vi.stubGlobal('fetch', fetchMock);
    const params = new URLSearchParams({ code: 'abc', state: url.searchParams.get('state')! });
    const out = await finishLogin(cfg, redirect, params);
    expect(out).toEqual({ returnUrl: '/crm/prospects', issuer: 'http://localhost:8180/realms/triplesale', tokens: { accessToken: 'a', refreshToken: 'r', idToken: 'i', expiresIn: 300 } });
    const sent = new URLSearchParams(fetchMock.mock.calls[0][1].body as URLSearchParams);
    expect(sent.get('grant_type')).toBe('authorization_code');
    expect(await challengeOf(sent.get('code_verifier')!)).toBe(url.searchParams.get('code_challenge'));
    await expect(finishLogin(cfg, redirect, params)).rejects.toBeInstanceOf(KeycloakError); // flow already used
  });

  it('refuses a wrong state without calling Keycloak', async () => {
    await beginLogin(cfg, redirect, '/');
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    await expect(finishLogin(cfg, redirect, new URLSearchParams({ code: 'abc', state: 'other' }))).rejects.toBeInstanceOf(KeycloakError);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('shows the message Keycloak gives when it refuses the code', async () => {
    const url = new URL(await beginLogin(cfg, redirect, '/'));
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false, status: 400, json: async () => ({ error: 'invalid_grant', error_description: 'Code not valid' }) }));
    await expect(finishLogin(cfg, redirect, new URLSearchParams({ code: 'x', state: url.searchParams.get('state')! }))).rejects.toThrow('Code not valid');
  });

  it('logout URL carries the id token hint', () => {
    const u = new URL(logoutUrl(cfg, undefined, 'idtok', 'http://localhost:4200/login'));
    expect(u.pathname).toBe('/realms/triplesale/protocol/openid-connect/logout');
    expect(u.searchParams.get('id_token_hint')).toBe('idtok');
    expect(u.searchParams.get('post_logout_redirect_uri')).toBe('http://localhost:4200/login');
  });

  it('signs in at the issuer of the group, with the login hint and Thai UI', async () => {
    const issuer = 'https://dev-auth.acecloud.co.th/realms/ace';
    const u = new URL(await beginLogin(cfg, redirect, '/', { issuer, loginHint: 'g9001.' }));
    expect(u.origin + u.pathname).toBe(`${issuer}/protocol/openid-connect/auth`);
    expect(u.searchParams.get('login_hint')).toBe('g9001.');
    expect(u.searchParams.get('ui_locales')).toBe('th');
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, status: 200, json: async () => ({ access_token: 'a' }) });
    vi.stubGlobal('fetch', fetchMock);
    const out = await finishLogin(cfg, redirect, new URLSearchParams({ code: 'c', state: u.searchParams.get('state')! }));
    expect(fetchMock.mock.calls[0][0]).toBe(`${issuer}/protocol/openid-connect/token`);
    expect(out.issuer).toBe(issuer);
    expect(new URL(logoutUrl(cfg, out.issuer, '', 'http://x/login')).origin).toBe('https://dev-auth.acecloud.co.th');
  });

  it('no login_hint when the group has no prefix', async () => {
    expect(new URL(await beginLogin(cfg, redirect, '/')).searchParams.has('login_hint')).toBe(false);
  });

  it('resolveGroup reads issuer and prefix of the answer', async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, status: 200, json: async () => ({ status: 200, result: { usernamePrefix: 'g9001', issuer: 'https://i/realms/ace' } }) });
    vi.stubGlobal('fetch', fetchMock);
    expect(await resolveGroup('/tps-api/api/v1/', 'k29test')).toEqual({ usernamePrefix: 'g9001', issuer: 'https://i/realms/ace' });
    expect(fetchMock.mock.calls[0][0]).toBe('/tps-api/api/v1/auth/groups/k29test');
  });

  it('resolveGroup: unknown group is a readable error', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false, status: 404, json: async () => ({ error: { code: 'NOT_FOUND' } }) }));
    await expect(resolveGroup('/x', 'nope')).rejects.toThrow('ไม่พบกลุ่ม nope');
  });

  it('startSession: POST /me/session with the Bearer, reads user and companies', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ result: { user: { id: 'u1', username: 'qatest1' }, companies: [{ id: 'c1', code: 'K29C1', name: 'บริษัททดสอบ' }], selectedCompanyId: 'c1', terms: null } }),
    });
    vi.stubGlobal('fetch', fetchMock);
    const s = await startSession('/tps-api/api/v1', 'tok');
    expect(s).toEqual({ user: { id: 'u1', username: 'qatest1' }, companies: [{ id: 'c1', code: 'K29C1', name: 'บริษัททดสอบ' }], selectedCompanyId: 'c1' });
    expect(fetchMock.mock.calls[0][0]).toBe('/tps-api/api/v1/me/session');
    expect(fetchMock.mock.calls[0][1]).toMatchObject({ method: 'POST', headers: { Authorization: 'Bearer tok' } });
  });

  it('startSession: nothing selected → null; refused → readable error', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, status: 200, json: async () => ({ result: { user: { id: 'u', username: 'x' }, companies: [{ id: 'a', code: 'A' }, { id: 'b', code: 'B' }] } }) }));
    expect((await startSession('/x', 't')).selectedCompanyId).toBeNull();
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false, status: 401, json: async () => ({}) }));
    await expect(startSession('/x', 't')).rejects.toThrow('เข้าสู่ระบบใหม่');
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false, status: 403, json: async () => ({ code: 'NO_SYSTEM_ACCESS' }) }));
    await expect(startSession('/x', 't')).rejects.toThrow('ไม่มีสิทธิ์');
  });

  it('selectCompany: PUT /me/session/company/{id} with the Bearer; a refusal is a readable error', async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, status: 200 });
    vi.stubGlobal('fetch', fetchMock);
    await selectCompany('/tps-api/api/v1', 'tok', 'c 1');
    expect(fetchMock.mock.calls[0][0]).toBe('/tps-api/api/v1/me/session/company/c%201');
    expect(fetchMock.mock.calls[0][1]).toMatchObject({ method: 'PUT', headers: { Authorization: 'Bearer tok' } });
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false, status: 403, json: async () => ({}) }));
    await expect(selectCompany('/x', 't', 'c')).rejects.toThrow('ไม่มีสิทธิ์');
  });

  it('reads claims of a JWT, {} when it is not one', () => {
    expect(claimsOf('not-a-jwt')).toEqual({});
    expect(claimsOf(`x.${btoa('{"preferred_username":"demo"}')}.y`)['preferred_username']).toBe('demo');
  });

  describe('refreshTokens', () => {
    it('POSTs grant_type=refresh_token with the client and the refresh token — no secret, no Authorization — and returns the new tokens', async () => {
      const fetchMock = vi.fn().mockResolvedValue({ ok: true, status: 200, json: async () => ({ access_token: 'a2', refresh_token: 'r2', id_token: 'i2', expires_in: 1800 }) });
      vi.stubGlobal('fetch', fetchMock);
      const out = await refreshTokens('https://kc.example/realms/ace', 'triplesales-web', 'r1');
      expect(out).toEqual({ accessToken: 'a2', refreshToken: 'r2', idToken: 'i2', expiresIn: 1800 });
      expect(fetchMock.mock.calls[0][0]).toBe('https://kc.example/realms/ace/protocol/openid-connect/token');
      const init = fetchMock.mock.calls[0][1] as { method: string; headers: Record<string, string>; body: URLSearchParams };
      expect(init.method).toBe('POST');
      expect(init.headers['Content-Type']).toBe('application/x-www-form-urlencoded');
      expect(init.headers['Authorization']).toBeUndefined();
      const sent = new URLSearchParams(init.body);
      expect(Object.fromEntries(sent)).toEqual({ grant_type: 'refresh_token', client_id: 'triplesales-web', refresh_token: 'r1' });
    });

    it('keeps the old refresh token when Keycloak sends no new one (no rotation)', async () => {
      vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, status: 200, json: async () => ({ access_token: 'a2', expires_in: 60 }) }));
      expect((await refreshTokens('https://kc/realms/x/', 'c', 'r1')).refreshToken).toBe('r1');
    });

    it('no token back → KeycloakError (refused, no access_token, no answer, nothing to refresh with) — the message never holds a token', async () => {
      vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false, status: 400, json: async () => ({ error: 'invalid_grant' }) }));
      await expect(refreshTokens('https://kc/realms/x', 'c', 'secret-refresh')).rejects.toThrow('invalid_grant');
      await expect(refreshTokens('https://kc/realms/x', 'c', 'secret-refresh')).rejects.not.toThrow(/secret-refresh/);
      vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, status: 200, json: async () => ({}) }));
      await expect(refreshTokens('https://kc/realms/x', 'c', 'r')).rejects.toBeInstanceOf(KeycloakError);
      vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new TypeError('Failed to fetch')));
      await expect(refreshTokens('https://kc/realms/x', 'c', 'r')).rejects.toThrow('เชื่อมต่อ Keycloak ไม่ได้');
      await expect(refreshTokens('https://kc/realms/x', 'c', '')).rejects.toBeInstanceOf(KeycloakError);
    });
  });
  it('errorCodeOf: reads the code of the answer wherever it is', () => {
    expect(errorCodeOf({ code: 'SESSION_REPLACED' })).toBe('SESSION_REPLACED');
    expect(errorCodeOf({ error: { code: 'EMPLOYEE_INACTIVE' } })).toBe('EMPLOYEE_INACTIVE');
    expect(errorCodeOf({ responseCode: 'UNAUTHORIZED', message: 'x' })).toBe('UNAUTHORIZED');
    expect(errorCodeOf({ code: 401, message: 'not a code' })).toBe('');
    expect(errorCodeOf(null)).toBe('');
  });

  it('startSession: a refused call carries its status and code', async () => {
    for (const [status, code] of [[401, 'UNAUTHORIZED'], [401, 'SESSION_REPLACED'], [401, 'EMPLOYEE_INACTIVE']] as const) {
      vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({ code }), { status })));
      const err = await startSession('/x', 't').catch((e: unknown) => e);
      expect(err).toBeInstanceOf(ApiAuthError);
      expect(err).toMatchObject({ status, code });
    }
  });

  it('startSession: 403 NO_ACTIVE_COMPANY and NO_SYSTEM_ACCESS say why, carry their code, and are the refusals no new sign-in can cure', async () => {
    const cases = [
      ['NO_ACTIVE_COMPANY', 'ติดต่อผู้ดูแลบริษัท'],
      ['NO_SYSTEM_ACCESS', 'ไม่มีสิทธิ์ใช้ Triple Sales'],
    ] as const;
    for (const [code, text] of cases) {
      vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({ error: { code } }), { status: 403 })));
      const err = await startSession('/x', 't').catch((e: unknown) => e);
      expect(err).toBeInstanceOf(ApiAuthError);
      expect(err).toMatchObject({ status: 403, code });
      expect((err as Error).message).toContain(text);
      expect(BLOCKED_SIGN_IN_CODES).toContain(code);
    }
    expect(BLOCKED_SIGN_IN_CODES).not.toContain('EMPLOYEE_INACTIVE'); // that one is cured by choosing a company again
    expect(BLOCKED_SIGN_IN_CODES).not.toContain('SESSION_REPLACED'); // and that one by signing in again
  });

  it('beginLogin: prompt=login only when asked', async () => {
    expect(new URL(await beginLogin(cfg, redirect, '/crm/home', { prompt: 'login' })).searchParams.get('prompt')).toBe('login');
    expect(new URL(await beginLogin(cfg, redirect, '/crm/home')).searchParams.has('prompt')).toBe(false);
  });
});
