import { HttpClient, provideHttpClient, withInterceptors } from '@angular/common/http';
import { Component } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { Router, provideRouter } from '@angular/router';
import { firstValueFrom } from 'rxjs';
import { beforeEach, describe, expect, it } from 'vitest';
import { ConfigService } from '../config/config.service';
import { ApiError } from '../http/api-error';
import { apiErrorInterceptor, bearerInterceptor, credentialsInterceptor } from '../http/interceptors';
import { mockBackendInterceptor } from '../http/mock-backend.interceptor';
import { ROLE } from '../permissions/roles';
import { ReferenceStore, servletReply } from '../testing/login-servlet.reference';
import { configStub } from '../testing/test-helpers';
import { AuthService, parseRoles } from './auth.service';
import { TokenStore } from './token.store';

@Component({ template: '' })
class Blank {}

const SERVICE = '/triplesale-service/api/v1';

/** Exercises AuthService + the real interceptors against the built-in mock of the REST APIs. */
describe('AuthService (mock REST APIs)', () => {
  let auth: AuthService;
  let store: TokenStore;
  let http: HttpClient;

  /** what the login page does for an account that goes straight in: one POST, then open the session */
  const signIn = async (username: string, password = 'x') => {
    const reply = await auth.proxy({ username, password });
    expect(reply.data?.['responseCode']).toBe('COMPLETE');
    await auth.completeSignIn();
  };

  beforeEach(() => {
    sessionStorage.clear();
    TestBed.configureTestingModule({
      providers: [
        provideRouter([{ path: 'login', component: Blank }]),
        provideHttpClient(withInterceptors([apiErrorInterceptor, bearerInterceptor, credentialsInterceptor, mockBackendInterceptor])),
        { provide: ConfigService, useValue: configStub({ mock: true }) },
      ],
    });
    auth = TestBed.inject(AuthService);
    store = TestBed.inject(TokenStore);
    http = TestBed.inject(HttpClient);
  });

  describe('sign-in', () => {
    it('restore() finds no sign-in at first → anonymous (and shows no "expired" dialog)', () => {
      auth.restore();
      expect(auth.status()).toBe('anonymous');
      expect(auth.expiredCode()).toBeNull();
    });

    it('single company: COMPLETE → no session until completeSignIn() opens it; the user, branch and roles come from the APIs', async () => {
      const reply = await auth.proxy({ username: 'demo', password: 'secret' });
      expect(reply).toMatchObject({ status: 200, ok: true, data: { responseCode: 'COMPLETE', username: 'demo' } });
      expect(auth.isAuthenticated()).toBe(false);

      await auth.completeSignIn();
      expect(auth.isAuthenticated()).toBe(true);
      expect(auth.session()).toMatchObject({
        username: 'demo',
        profileName: 'สมชาย ใจดี (ทดลอง)', // profile.name of /auth/user-detail
        employeeId: 1001, // employee.id
        employeeCode: 'E1001', // employee.code (the calendar tab of the dashboard asks for the tasks of this employee)
        branchCode: 'SUN', // employee.branch.code = Java's ss_branch_code (the dashboard's ggwBranch)
        branch: { id: 1004400123, code: 'SUN', name: 'SUN GATEWAY' }, // employee.branch (no company was chosen)
        lang: 'th',
      });
      expect(auth.session()?.roles).toContain(ROLE.featureLead); // /me/roles
    });

    it('an account the directory does not know is "demo" under its own name', async () => {
      await signIn('somebody');
      expect(auth.session()).toMatchObject({ username: 'somebody', profileName: 'somebody', employeeId: 1001 });
    });

    it('several companies: ORG_REQUIRED → branches → select-org; the chosen company is the active branch', async () => {
      expect((await auth.proxy({ username: 'multi', password: 'secret' })).data?.['responseCode']).toBe('ORG_REQUIRED');
      expect(store.read()).toBeNull(); // nothing is kept yet: the pending token only serves the choice
      expect(sessionStorage.getItem('ts_auth')).toBeNull();

      const list = await auth.proxy({ action: 'branches' });
      const branches = list.data?.['branches'] as Array<{ id: number; code: string }>;
      expect(branches.map((b) => b.code)).toEqual(['SUN', 'ACE']);

      expect((await auth.proxy({ action: 'select-org', org: String(branches[1].id) })).data?.['responseCode']).toBe('COMPLETE');
      await auth.completeSignIn();
      expect(auth.session()?.branch).toEqual({ id: 1004400456, code: 'ACE', name: 'เอซ คลาวด์' }); // not the home branch (SUN)
    });

    it('the access token is kept in sessionStorage of the tab with its expiry — and is no part of the session pages see', async () => {
      const before = Date.now();
      await signIn('demo');
      const kept = JSON.parse(sessionStorage.getItem('ts_auth')!);
      expect(kept.accessToken).toMatch(/^mock\.access\./);
      expect(kept.expiresAt).toBeGreaterThanOrEqual(before + 3600 * 1000 - 50);
      expect(JSON.stringify(auth.session())).not.toContain('mock.access');
    });

    it('the pending token of the company step never leaves memory', async () => {
      await auth.proxy({ username: 'multi', password: 'x' });
      await auth.proxy({ action: 'branches' });
      expect(JSON.stringify(sessionStorage)).not.toContain('mock.pending');
    });

    it('proxy() resolves with the status and the Thai failMessage of a failed step, never rejects', async () => {
      expect(await auth.proxy({ username: 'demo', password: 'wrong' })).toMatchObject({
        status: 401,
        ok: false,
        data: { responseCode: 'ERROR', failMessage: 'ชื่อผู้ใช้หรือรหัสผ่านไม่ถูกต้อง' },
      });
      expect(await auth.proxy({ username: '', password: '' })).toMatchObject({ status: 400, data: { failMessage: 'กรุณาระบุ Username และ Password' } });
      expect(await auth.proxy({ action: 'branches' })).toMatchObject({ status: 401, data: { failMessage: 'เซสชันหมดอายุ กรุณาเข้าสู่ระบบใหม่' } });
      expect(await auth.proxy(null as unknown as object)).toMatchObject({ status: 400 }); // an empty body is a login without fields
      expect(auth.isAuthenticated()).toBe(false);
      expect(store.read()).toBeNull();
    });

    it('a wrong password of a SIGNED-IN user is just a failed attempt: the session stays (a 401 of the sign-in is not "token expired")', async () => {
      await signIn('demo');
      expect((await auth.proxy({ username: 'demo', password: 'wrong' })).status).toBe(401);
      expect(auth.expiredCode()).toBeNull();
      expect(auth.isAuthenticated()).toBe(true);
    });
  });

  describe('answers like LoginProxyServlet did (login-servlet.reference.ts)', () => {
    /** a sequence of bodies the page sends, from a fresh start */
    const SCENARIOS: Array<[string, object[]]> = [
      ['blank fields', [{ username: '', password: '' }, { username: 'demo', password: '' }, { username: '   ', password: 'x' }, {}]],
      ['wrong password', [{ username: 'demo', password: 'wrong' }]],
      ['single company (name trimmed)', [{ username: '  demo  ', password: ' x ' }]],
      [
        'company flow',
        [
          { username: 'multi', password: 'x' },
          { action: 'branches' },
          { action: ' Select-Org ', org: '' },
          { action: 'select-org', org: '999' },
          { action: 'select-org', org: '1004400456' },
          { action: 'branches' }, // used up
        ],
      ],
      ['nothing in progress', [{ action: 'branches' }, { action: 'select-org', org: '1' }, { action: 'select-org', org: '' }]],
      ['odd companies', [{ username: 'multimix', password: 'x' }, { action: 'branches' }, { action: 'select-org', org: '11' }]],
      ['no companies', [{ username: 'nobranch', password: 'x' }, { action: 'branches' }]],
      ['company list fails (500)', [{ username: 'branchfail', password: 'x' }, { action: 'branches' }]],
      ['company list gives no answer', [{ username: 'branchdown', password: 'x' }, { action: 'branches' }]],
      ['choice fails (500)', [{ username: 'selectfail', password: 'x' }, { action: 'branches' }, { action: 'select-org', org: '1004400123' }]],
      ['choice gives no answer', [{ username: 'selectdown', password: 'x' }, { action: 'branches' }, { action: 'select-org', org: '1004400123' }]],
      ['token ran out before the choice (401)', [{ username: 'expire', password: 'x' }, { action: 'branches' }, { action: 'select-org', org: '1004400123' }]],
      ['auth service gives no answer', [{ username: 'down', password: 'x' }]],
      ['auth service errors', [{ username: 'err500', password: 'x' }, { username: 'html500', password: 'x' }, { username: 'nojson', password: 'x' }, { username: 'disabled', password: 'x' }]],
    ];

    it.each(SCENARIOS)('%s', async (_name, steps) => {
      const mem: Record<string, string> = {};
      const reference: ReferenceStore = { get: (k) => mem[k], set: (k, v) => (mem[k] = v), del: (k) => delete mem[k] };
      for (const step of steps) {
        const expected = servletReply(step, reference);
        const got = await auth.proxy(step);
        expect({ step, status: got.status, data: got.data }).toEqual({ step, status: expected.status, data: expected.body });
        expect(got.ok).toBe(expected.status >= 200 && expected.status < 300);
      }
    });
  });

  describe('session lifetime', () => {
    it('restore() picks the sign-in of this tab up again (page reload) — without asking any server', async () => {
      await signIn('viewer');
      // simulate a fresh page load of the SPA: client state is gone, sessionStorage is not
      auth.session.set(null);
      auth.status.set('unknown');
      auth.restore();
      expect(auth.isAuthenticated()).toBe(true);
      expect(auth.session()?.username).toBe('viewer');
      expect(auth.session()?.roles).toContain(ROLE.leadView);
    });

    it('restore() drops a token whose time has run out', async () => {
      await signIn('demo');
      store.write({ ...store.read()!, expiresAt: Date.now() - 1 });
      auth.session.set(null);
      auth.status.set('unknown');
      auth.restore();
      expect(auth.status()).toBe('anonymous');
      expect(sessionStorage.getItem('ts_auth')).toBeNull();
    });

    it('logout() drops the token and the session and goes to /login', async () => {
      await signIn('demo');
      await auth.logout();
      expect(auth.status()).toBe('anonymous');
      expect(store.read()).toBeNull();
      expect(sessionStorage.getItem('ts_auth')).toBeNull();
      expect(TestBed.inject(Router).url).toBe('/login');
      auth.restore();
      expect(auth.isAuthenticated()).toBe(false);
    });

    it('logout() forgets the chat with the help assistant (template.xhtml clearSessionUi) before it leaves', async () => {
      sessionStorage.setItem('ai_help_chat', '{"u":"demo"}');
      await signIn('demo');
      await auth.logout();
      expect(sessionStorage.getItem('ai_help_chat')).toBeNull();
    });

    it('stateKey() is a per-sign-in key (commonBean.clientStateKey): stable within one, new after the session ends', async () => {
      await signIn('demo');
      const first = auth.stateKey();
      expect(first).toMatch(/^[0-9a-f]{1,8}$/);
      expect(auth.stateKey()).toBe(first); // a reload of the tab keeps it (sessionStorage)
      await auth.logout();
      expect(sessionStorage.getItem('ts_state_key')).toBeNull();
      await signIn('demo');
      expect(auth.stateKey()).not.toBe(first);
      auth.handleUnauthorized('TOKEN_EXPIRED'); // an expired session ends it too
      expect(sessionStorage.getItem('ts_state_key')).toBeNull();
    });

    it('handleUnauthorized() while signed in raises the expired flag; before sign-in it stays silent', async () => {
      auth.handleUnauthorized('NO_TOKEN');
      expect(auth.expiredCode()).toBeNull();

      await signIn('demo');
      auth.handleUnauthorized('TOKEN_EXPIRED');
      expect(auth.expiredCode()).toBe('TOKEN_EXPIRED');
      expect(auth.status()).toBe('anonymous');
      expect(store.read()).toBeNull();
    });
  });

  describe('the REST APIs after sign-in (bearer + 401 handling)', () => {
    const getLeads = () => firstValueFrom(http.get(`${SERVICE}/leads`));

    it('an unmocked route answers 501 once signed in (the Bearer token is sent) and 401 before', async () => {
      const before = await getLeads().catch((e: unknown) => e);
      expect((before as ApiError).status).toBe(401);

      await signIn('demo');
      const after = await getLeads().catch((e: unknown) => e);
      expect((after as ApiError).status).toBe(501);
    });

    it('a 401 from an API ends the session of a signed-in user (token refused) → expired flag', async () => {
      await signIn('demo');
      store.write({ ...store.read()!, accessToken: 'mock.access.garbage' }); // the service no longer accepts it
      const err = await getLeads().catch((e: unknown) => e);
      expect((err as ApiError).status).toBe(401);
      expect(auth.expiredCode()).toBe('TOKEN_EXPIRED');
      expect(auth.isAuthenticated()).toBe(false);
      expect(store.read()).toBeNull();
    });

    it('a token whose time is up is not sent: the call fails as TOKEN_EXPIRED and the session ends (SessionTokenFilter)', async () => {
      await signIn('demo');
      store.write({ ...store.read()!, expiresAt: Date.now() - 1 });
      const err = await getLeads().catch((e: unknown) => e);
      expect(err).toBeInstanceOf(ApiError);
      expect(err).toMatchObject({ status: 401, message: 'เซสชันหมดอายุ กรุณาเข้าสู่ระบบใหม่' });
      expect((err as ApiError).options.responseCode).toBe('TOKEN_EXPIRED');
      expect(auth.expiredCode()).toBe('TOKEN_EXPIRED');
    });
  });
});

describe('parseRoles (SessionRoles.parseRoles)', () => {
  it('takes an array of names or of objects carrying one under roleName / role / name / code', () => {
    expect(parseRoles(['A', 'B'])).toEqual(['A', 'B']);
    expect(parseRoles([{ roleName: 'A' }, { role: 'B' }, { name: 'C' }, { code: 'D' }, { roleName: 'E', name: 'ignored' }])).toEqual(['A', 'B', 'C', 'D', 'E']);
  });

  it('is fail-closed: anything else is no role, duplicates collapse, nulls and unknown shapes are skipped', () => {
    expect(parseRoles(undefined)).toEqual([]);
    expect(parseRoles({ roles: ['A'] })).toEqual([]);
    expect(parseRoles('A')).toEqual([]);
    expect(parseRoles(['A', 'A', null, 7, { other: 'x' }, { roleName: null, role: 'B' }])).toEqual(['A', 'B']);
  });
});
