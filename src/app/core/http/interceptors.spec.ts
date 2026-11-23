import { HttpClient, HttpContext, provideHttpClient, withInterceptors } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { firstValueFrom } from 'rxjs';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AuthService } from '../auth/auth.service';
import { TokenStore } from '../auth/token.store';
import { ConfigService } from '../config/config.service';
import { configStub } from '../testing/test-helpers';
import { ApiError } from './api-error';
import { ApiLogService } from './api-log.service';
import { runVia } from './api-via';
import { SIGN_IN_CALL } from './http-context';
import { EXPECTED_COMPANY, apiErrorInterceptor, apiLogInterceptor, bearerInterceptor, credentialsInterceptor } from './interceptors';

const AUTH = '/triplesale-auth/api/v1';
const SERVICE = '/triplesale-service/api/v1';
const MASTER = '/master-service/api/v1';
const DASHBOARD = '/dashboard-triplesale-service/api/v1';
const BFF = '/triplesale';
const session = { username: 'demo', profileName: 'Demo', employeeId: 1, employeeCode: 'E001', branch: null, branchCode: '', roles: [], lang: 'th' as const };

describe('HTTP interceptors (REST APIs)', () => {
  let http: HttpClient;
  let backend: HttpTestingController;
  let store: TokenStore;
  let auth: AuthService;

  beforeEach(() => {
    sessionStorage.clear();
    TestBed.configureTestingModule({
      providers: [
        provideRouter([]),
        provideHttpClient(withInterceptors([apiLogInterceptor, apiErrorInterceptor, bearerInterceptor, credentialsInterceptor])),
        provideHttpClientTesting(),
        { provide: ConfigService, useValue: configStub({ features: { aiHubEnabled: true, pageGuardEnabled: true, apiLog: true } }) },
      ],
    });
    http = TestBed.inject(HttpClient);
    backend = TestBed.inject(HttpTestingController);
    store = TestBed.inject(TokenStore);
    auth = TestBed.inject(AuthService);
  });

  const signedIn = (expiresAt = Date.now() + 60_000) => {
    store.write({ accessToken: 'tok-123', refreshToken: 'r', expiresAt, session });
    auth.restore();
  };

  describe('bearer', () => {
    it('adds the access token to calls to the auth service and triplesale-service — and to nothing else', () => {
      signedIn();
      for (const url of [`${SERVICE}/leads`, `${AUTH}/auth/select-org`, `${BFF}/board/x`, 'assets/i18n/th.json']) http.get(url).subscribe();
      expect(backend.expectOne(`${SERVICE}/leads`).request.headers.get('Authorization')).toBe('Bearer tok-123');
      expect(backend.expectOne(`${AUTH}/auth/select-org`).request.headers.get('Authorization')).toBe('Bearer tok-123');
      expect(backend.expectOne(`${BFF}/board/x`).request.headers.has('Authorization')).toBe(false);
      expect(backend.expectOne('assets/i18n/th.json').request.headers.has('Authorization')).toBe(false);
    });

    it('adds the access token to EVERY call of the Configuration & Master data page (master API: GET / POST / PUT / DELETE)', () => {
      signedIn();
      const calls: [string, string][] = [
        ['GET', `${MASTER}/master-setup/entities`],
        ['GET', `${MASTER}/master-setup/steps?entityId=e1`],
        ['GET', `${MASTER}/master-tables/branch/records?entityId=e1&page=1`],
        ['POST', `${MASTER}/master-tables/branch/records`],
        ['PUT', `${MASTER}/master-tables/branch/records/r1`],
        ['DELETE', `${MASTER}/master-tables/branch/records/r1?entityId=e1`],
      ];
      for (const [method, url] of calls) http.request(method, url, method === 'GET' || method === 'DELETE' ? {} : { body: {} }).subscribe();
      for (const [method, url] of calls) {
        const req = backend.expectOne((r) => r.method === method && r.urlWithParams === url);
        expect(req.request.headers.get('Authorization'), `${method} ${url}`).toBe('Bearer tok-123');
      }
    });

    it('X-Expected-Company: the company this tab chose goes to triplesale-service and the dashboard service only, and only when it is a text id', () => {
      const companyId = '01a1bf8d-a7db-7f8e-9606-d9936ba91282';
      store.write({ accessToken: 'tok-123', refreshToken: 'r', expiresAt: Date.now() + 60_000, session: { ...session, branch: { id: companyId, code: 'C1', name: 'Company 1' } } });
      auth.restore();
      for (const url of [`${SERVICE}/prospects`, `${DASHBOARD}/events`, `${AUTH}/auth/select-org`, `${BFF}/board/x`]) http.get(url).subscribe();
      expect(backend.expectOne(`${SERVICE}/prospects`).request.headers.get(EXPECTED_COMPANY)).toBe(companyId);
      expect(backend.expectOne(`${DASHBOARD}/events`).request.headers.get(EXPECTED_COMPANY)).toBe(companyId);
      expect(backend.expectOne(`${AUTH}/auth/select-org`).request.headers.has(EXPECTED_COMPANY)).toBe(false);
      expect(backend.expectOne(`${BFF}/board/x`).request.headers.has(EXPECTED_COMPANY)).toBe(false);
    });

    it('X-Expected-Company: no company chosen, or a numeric id (the form sign-in), sends none; a header of the call itself is kept', () => {
      signedIn(); // branch: null
      http.get(`${SERVICE}/me/roles`).subscribe();
      expect(backend.expectOne(`${SERVICE}/me/roles`).request.headers.has(EXPECTED_COMPANY)).toBe(false);
      store.write({ accessToken: 'tok-123', refreshToken: 'r', expiresAt: Date.now() + 60_000, session: { ...session, branch: { id: 7, code: 'C1', name: 'Company 1' } } });
      auth.restore();
      http.get(`${SERVICE}/leads`).subscribe();
      expect(backend.expectOne(`${SERVICE}/leads`).request.headers.has(EXPECTED_COMPANY)).toBe(false);
      store.write({ accessToken: 'tok-123', refreshToken: 'r', expiresAt: Date.now() + 60_000, session: { ...session, branch: { id: 'own-company', code: 'C1', name: 'Company 1' } } });
      auth.restore();
      http.get(`${SERVICE}/prospects`, { headers: { [EXPECTED_COMPANY]: 'from-the-call' } }).subscribe();
      expect(backend.expectOne(`${SERVICE}/prospects`).request.headers.get(EXPECTED_COMPANY)).toBe('from-the-call');
    });

    it('sends nothing when nobody is signed in (the service answers 401 itself)', () => {
      http.get(`${SERVICE}/leads`).subscribe();
      expect(backend.expectOne(`${SERVICE}/leads`).request.headers.has('Authorization')).toBe(false);
    });

    it('leaves an Authorization of the call itself alone (the company choice uses the pending token)', () => {
      signedIn();
      http.get(`${SERVICE}/master-data/branches`, { headers: { Authorization: 'Bearer pending-1' } }).subscribe();
      expect(backend.expectOne(`${SERVICE}/master-data/branches`).request.headers.get('Authorization')).toBe('Bearer pending-1');
    });

    it('does not send a token whose time is up: the call fails as TOKEN_EXPIRED and the session ends', async () => {
      signedIn();
      store.write({ ...store.read()!, expiresAt: Date.now() - 1 }); // the minute ran out while the page was open
      const err = await firstValueFrom(http.get(`${SERVICE}/leads`)).catch((e: unknown) => e);
      backend.expectNone(`${SERVICE}/leads`);
      expect(err).toBeInstanceOf(ApiError);
      expect((err as ApiError).options).toMatchObject({ authRequired: true, responseCode: 'TOKEN_EXPIRED' });
      expect(auth.expiredCode()).toBe('TOKEN_EXPIRED');
      expect(store.read()).toBeNull();
    });
  });

  describe('cookies', () => {
    it('go only to the old BFF; the REST APIs get the Bearer token and no cookies', () => {
      signedIn();
      http.get(`${BFF}/board/x`).subscribe();
      http.get(`${SERVICE}/leads`).subscribe();
      expect(backend.expectOne(`${BFF}/board/x`).request.withCredentials).toBe(true);
      expect(backend.expectOne(`${SERVICE}/leads`).request.withCredentials).toBe(false);
    });
  });

  describe('401', () => {
    it('from a REST API ends the session of a signed-in user', async () => {
      signedIn();
      const done = firstValueFrom(http.get(`${SERVICE}/leads`)).catch((e: unknown) => e);
      backend.expectOne(`${SERVICE}/leads`).flush({ status: 401, message: 'Unauthorized' }, { status: 401, statusText: 'Unauthorized' });
      const err = await done;
      expect((err as ApiError).status).toBe(401);
      expect(auth.expiredCode()).toBe('TOKEN_EXPIRED');
      expect(auth.isAuthenticated()).toBe(false);
    });

    it('from a call of the sign-in itself is only an error (wrong password), even for a signed-in user', async () => {
      signedIn();
      const done = firstValueFrom(
        http.post(`${AUTH}/auth/login`, { username: 'a', password: 'b' }, { context: new HttpContext().set(SIGN_IN_CALL, true) }),
      ).catch((e: unknown) => e);
      backend.expectOne(`${AUTH}/auth/login`).flush({ error: 'Invalid user credentials' }, { status: 401, statusText: 'Unauthorized' });
      const err = await done;
      expect((err as ApiError).message).toBe('Invalid user credentials');
      expect(auth.expiredCode()).toBeNull();
      expect(auth.isAuthenticated()).toBe(true);
    });

    it('keeps the body of the error, as text when the call asked for text', async () => {
      const done = firstValueFrom(http.get(`${SERVICE}/x`, { responseType: 'text' })).catch((e: unknown) => e);
      backend.expectOne(`${SERVICE}/x`).flush('{"error":"บัญชีนี้ถูกปิดการใช้งาน"}', { status: 403, statusText: 'Forbidden' });
      const err = (await done) as ApiError;
      expect(err.message).toBe('บัญชีนี้ถูกปิดการใช้งาน'); // read from the JSON text
      expect(err.options.body).toBe('{"error":"บัญชีนี้ถูกปิดการใช้งาน"}');
    });

    it('the 401 {authRequired} of the old BFF still ends the session with its code', async () => {
      signedIn();
      const done = firstValueFrom(http.get(`${BFF}/board/x`)).catch((e: unknown) => e);
      backend.expectOne(`${BFF}/board/x`).flush({ authRequired: true, responseCode: 'NO_TOKEN' }, { status: 401, statusText: 'Unauthorized' });
      await done;
      expect(auth.expiredCode()).toBe('NO_TOKEN');
    });
  });

  describe('API log', () => {
    it('never keeps a password (or a token) of a request body, and marks calls that carry the Bearer token', async () => {
      const log = TestBed.inject(ApiLogService);
      const done = firstValueFrom(http.post(`${AUTH}/auth/login`, { username: 'demo', password: 'secret' })).catch(() => null);
      backend.expectOne(`${AUTH}/auth/login`).flush({ status: 200 });
      await done;
      const entry = log.entries()[0];
      expect(entry.reqBody).toBe('{"username":"demo","password":"***"}');
      expect(entry.bearer).toBe(true);
      expect(log.curl(entry, 'http://localhost:4200')).toContain('Authorization: Bearer <access_token>');
      expect(log.curl(entry, 'http://localhost:4200')).not.toContain('secret');
    });

    it('records the answer (text of a JSON answer), the page, the time and the servlet URL named by runVia', async () => {
      const log = TestBed.inject(ApiLogService);
      log.currentPage = 'index.face';
      const url = `${SERVICE}/master-data/movement-types/LD`;
      const done = firstValueFrom(runVia('/board/movement-types', () => http.get(url))).catch(() => null);
      backend.expectOne(url).flush({ status: 200, result: [{ code: 'LD-01' }] });
      await done;
      expect(log.entries()[0]).toMatchObject({
        page: 'index.face',
        via: '/board/movement-types',
        method: 'GET',
        url,
        status: 200,
        reqBody: '',
        resBody: '{"status":200,"result":[{"code":"LD-01"}]}',
      });
      expect(log.entries()[0].at).toMatch(/^\d{2}:\d{2}:\d{2}\.\d{3}$/);
    });

    it('has no servlet for a call made outside a handler, and keeps the body of a failed call', async () => {
      const log = TestBed.inject(ApiLogService);
      const done = firstValueFrom(http.get(`${SERVICE}/leads`)).catch(() => null);
      backend.expectOne(`${SERVICE}/leads`).flush({ status: 500, message: 'boom' }, { status: 500, statusText: 'Server Error' });
      await done;
      expect(log.entries()[0]).toMatchObject({ via: '', status: 500, resBody: '{"status":500,"message":"boom"}' });
    });

    it('cuts a long answer at 4,000 characters, like ApiLog.clip', async () => {
      const log = TestBed.inject(ApiLogService);
      const done = firstValueFrom(http.get(`${SERVICE}/big`, { responseType: 'text' })).catch(() => null);
      backend.expectOne(`${SERVICE}/big`).flush('y'.repeat(4010));
      await done;
      expect(log.entries()[0].resBody).toBe(`${'y'.repeat(4000)}...[ตัดออก 10 ตัวอักษร จากทั้งหมด 4010]`);
    });
  });
});

describe('HTTP interceptors — Keycloak refresh token', () => {
  let http: HttpClient;
  let backend: HttpTestingController;
  let store: TokenStore;
  let auth: AuthService;
  let fetchMock: ReturnType<typeof vi.fn>;

  const tick = () => new Promise<void>((resolve) => setTimeout(resolve));
  const tokensAnswer = (n: number) => ({ ok: true, status: 200, json: async () => ({ access_token: `new-${n}`, refresh_token: `r-${n + 1}`, expires_in: 1800 }) });
  const refused = { ok: false, status: 400, json: async () => ({ error: 'invalid_grant' }) };

  const setup = (keycloakEnabled: boolean) => {
    sessionStorage.clear();
    TestBed.configureTestingModule({
      providers: [
        provideRouter([]),
        provideHttpClient(withInterceptors([apiErrorInterceptor, bearerInterceptor, credentialsInterceptor])),
        provideHttpClientTesting(),
        { provide: ConfigService, useValue: configStub({ keycloak: { enabled: keycloakEnabled, url: '', realm: 'ace', clientId: 'triplesales-web' } }) },
      ],
    });
    http = TestBed.inject(HttpClient);
    backend = TestBed.inject(HttpTestingController);
    store = TestBed.inject(TokenStore);
    auth = TestBed.inject(AuthService);
  };

  const signedIn = (opts: { expiresAt?: number; provider?: 'keycloak' } = { provider: 'keycloak' }) => {
    store.write({ accessToken: 'old', refreshToken: 'r-1', expiresAt: opts.expiresAt ?? Date.now() + 600_000, provider: opts.provider, session });
    void auth.restore();
  };
  const reject401 = (url: string) => backend.expectOne(url).flush({ status: 401 }, { status: 401, statusText: 'Unauthorized' });

  beforeEach(() => {
    fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
  });
  afterEach(() => vi.unstubAllGlobals());

  it('401 → refresh token → the same call is sent again with the new token, and both new tokens are kept', async () => {
    setup(true);
    signedIn();
    fetchMock.mockResolvedValue(tokensAnswer(1));
    const done = firstValueFrom(http.get(`${SERVICE}/leads`));
    const first = backend.expectOne(`${SERVICE}/leads`);
    expect(first.request.headers.get('Authorization')).toBe('Bearer old');
    first.flush({ status: 401 }, { status: 401, statusText: 'Unauthorized' });
    await tick();
    const again = backend.expectOne(`${SERVICE}/leads`);
    expect(again.request.headers.get('Authorization')).toBe('Bearer new-1');
    again.flush({ ok: true });
    expect(await done).toEqual({ ok: true });

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const sent = Object.fromEntries(new URLSearchParams(fetchMock.mock.calls[0][1].body as URLSearchParams));
    expect(sent).toEqual({ grant_type: 'refresh_token', client_id: 'triplesales-web', refresh_token: 'r-1' });
    expect(store.read()).toMatchObject({ accessToken: 'new-1', refreshToken: 'r-2', provider: 'keycloak' });
    expect(auth.isAuthenticated()).toBe(true);
    expect(auth.expiredCode()).toBeNull();
  });

  it('every 401 refreshes again and keeps the new tokens (the next one uses the rotated refresh token)', async () => {
    setup(true);
    signedIn();
    fetchMock.mockResolvedValueOnce(tokensAnswer(1)).mockResolvedValueOnce(tokensAnswer(2));
    for (const [n, sentWith] of [[1, 'old'], [2, 'new-1']] as const) {
      const done = firstValueFrom(http.get(`${SERVICE}/leads`));
      const first = backend.expectOne(`${SERVICE}/leads`);
      expect(first.request.headers.get('Authorization')).toBe(`Bearer ${sentWith}`);
      first.flush({ status: 401 }, { status: 401, statusText: 'Unauthorized' });
      await tick();
      backend.expectOne(`${SERVICE}/leads`).flush({ n });
      expect(await done).toEqual({ n });
    }
    expect(new URLSearchParams(fetchMock.mock.calls[1][1].body as URLSearchParams).get('refresh_token')).toBe('r-2');
    expect(store.read()).toMatchObject({ accessToken: 'new-2', refreshToken: 'r-3' });
  });

  it('no token back → the session ends as before (dialog → /login = the group code page), no retry', async () => {
    setup(true);
    signedIn();
    fetchMock.mockResolvedValue(refused);
    const done = firstValueFrom(http.get(`${SERVICE}/leads`)).catch((e: unknown) => e);
    reject401(`${SERVICE}/leads`);
    const err = await done;
    backend.expectNone(`${SERVICE}/leads`);
    expect((err as ApiError).status).toBe(401);
    expect(auth.expiredCode()).toBe('TOKEN_EXPIRED');
    expect(auth.isAuthenticated()).toBe(false);
    expect(store.read()).toBeNull();
  });

  it('a call is sent again only once: a second 401 ends the session without another refresh', async () => {
    setup(true);
    signedIn();
    fetchMock.mockResolvedValue(tokensAnswer(1));
    const done = firstValueFrom(http.get(`${SERVICE}/leads`)).catch((e: unknown) => e);
    reject401(`${SERVICE}/leads`);
    await tick();
    reject401(`${SERVICE}/leads`);
    expect(((await done) as ApiError).status).toBe(401);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(auth.expiredCode()).toBe('TOKEN_EXPIRED');
  });

  it('calls that 401 together share one refresh (a rotated refresh token cannot be used twice)', async () => {
    setup(true);
    signedIn();
    fetchMock.mockResolvedValue(tokensAnswer(1));
    const a = firstValueFrom(http.get(`${SERVICE}/a`));
    const b = firstValueFrom(http.get(`${SERVICE}/b`));
    reject401(`${SERVICE}/a`);
    reject401(`${SERVICE}/b`);
    await tick();
    backend.expectOne(`${SERVICE}/a`).flush('a');
    backend.expectOne(`${SERVICE}/b`).flush('b');
    expect([await a, await b]).toEqual(['a', 'b']);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('a call whose token was replaced meanwhile is just sent again (no refresh of its own)', async () => {
    setup(true);
    signedIn();
    const done = firstValueFrom(http.get(`${SERVICE}/leads`));
    store.write({ ...store.read()!, accessToken: 'swapped', refreshToken: 'r-9' }); // another call already refreshed
    reject401(`${SERVICE}/leads`);
    await tick();
    const again = backend.expectOne(`${SERVICE}/leads`);
    expect(again.request.headers.get('Authorization')).toBe('Bearer swapped');
    again.flush('ok');
    await done;
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('a token about to run out is renewed before the call, which goes out with the new one', async () => {
    setup(true);
    signedIn({ provider: 'keycloak', expiresAt: Date.now() + 10_000 });
    fetchMock.mockResolvedValue(tokensAnswer(1));
    const done = firstValueFrom(http.get(`${SERVICE}/leads`));
    await tick();
    const req = backend.expectOne(`${SERVICE}/leads`);
    expect(req.request.headers.get('Authorization')).toBe('Bearer new-1');
    req.flush('ok');
    await done;
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('a token that has run out and cannot be renewed ends the session as TOKEN_EXPIRED, nothing is sent', async () => {
    setup(true);
    signedIn({ provider: 'keycloak' });
    store.write({ ...store.read()!, expiresAt: Date.now() - 1 });
    fetchMock.mockResolvedValue(refused);
    const err = await firstValueFrom(http.get(`${SERVICE}/leads`)).catch((e: unknown) => e);
    backend.expectNone(`${SERVICE}/leads`);
    expect((err as ApiError).options).toMatchObject({ authRequired: true, responseCode: 'TOKEN_EXPIRED' });
    expect(auth.expiredCode()).toBe('TOKEN_EXPIRED');
    expect(store.read()).toBeNull();
  });

  it.each([400, 403, 404, 409, 422, 500, 502, 503])('%i is only an error: no refresh, the session stays', async (status) => {
    setup(true);
    signedIn();
    const done = firstValueFrom(http.get(`${SERVICE}/leads`)).catch((e: unknown) => e);
    backend.expectOne(`${SERVICE}/leads`).flush({ message: 'x' }, { status, statusText: 'x' });
    expect(((await done) as ApiError).status).toBe(status);
    backend.expectNone(`${SERVICE}/leads`); // not sent again
    expect(fetchMock).not.toHaveBeenCalled();
    expect(auth.isAuthenticated()).toBe(true);
    expect(auth.expiredCode()).toBeNull();
    expect(store.read()!.accessToken).toBe('old');
  });

  it('404 does not refresh and does not end the session', async () => {
    setup(true);
    signedIn();
    const done = firstValueFrom(http.get(`${SERVICE}/leads`)).catch((e: unknown) => e);
    backend.expectOne(`${SERVICE}/leads`).flush({ message: 'Not Found' }, { status: 404, statusText: 'Not Found' });
    expect(((await done) as ApiError).status).toBe(404);
    expect(fetchMock).not.toHaveBeenCalled();
    expect(auth.isAuthenticated()).toBe(true);
    expect(auth.expiredCode()).toBeNull();
  });

  it('keycloak.enabled = false → the old flow, untouched: 401 ends the session, no refresh', async () => {
    setup(false);
    signedIn(); // even with a refresh token of a Keycloak session in the store
    const done = firstValueFrom(http.get(`${SERVICE}/leads`)).catch((e: unknown) => e);
    reject401(`${SERVICE}/leads`);
    expect(((await done) as ApiError).status).toBe(401);
    expect(fetchMock).not.toHaveBeenCalled();
    expect(auth.expiredCode()).toBe('TOKEN_EXPIRED');
    expect(store.read()).toBeNull();
  });

  it('a session that did not come from Keycloak (the form sign-in) → the old flow, no refresh', async () => {
    setup(true);
    signedIn({});
    const done = firstValueFrom(http.get(`${SERVICE}/leads`)).catch((e: unknown) => e);
    reject401(`${SERVICE}/leads`);
    expect(((await done) as ApiError).status).toBe(401);
    expect(fetchMock).not.toHaveBeenCalled();
    expect(auth.expiredCode()).toBe('TOKEN_EXPIRED');
  });

  it('a call that carries its own Authorization (company choice with the pending token) is never refreshed', async () => {
    setup(true);
    signedIn();
    const done = firstValueFrom(http.get(`${SERVICE}/master-data/branches`, { headers: { Authorization: 'Bearer pending-1' } })).catch((e: unknown) => e);
    reject401(`${SERVICE}/master-data/branches`);
    await done;
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
