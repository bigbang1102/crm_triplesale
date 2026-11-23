import { DEFAULT_CONFIG } from '@core/config/app-config';
import { ConfigService } from '@core/config/config.service';
import type { PageDef } from '@core/navigation/page-registry';
import { ApiLogEntry, ApiLogService, BODY_LIMIT, CURL_BODY_LIMIT, MAX_ENTRIES, clipBody, clock, curlOrigin, javaPageName, maskSecrets } from './api-log.service';

const entry = (over: Partial<ApiLogEntry> = {}): Omit<ApiLogEntry, 'id' | 'at'> => ({
  page: 'index.face',
  via: '/board/list',
  method: 'GET',
  url: '/triplesale/board/list?page=1',
  status: 200,
  ms: 12,
  reqBody: '',
  resBody: '{}',
  ...over,
});

describe('ApiLogService', () => {
  it('keeps the calls oldest first (like the Java list), numbers them and stamps the time', () => {
    const log = new ApiLogService();
    log.record(entry({ url: '/a' }));
    log.record(entry({ url: '/b' }));
    expect(log.entries().map((e) => e.url)).toEqual(['/a', '/b']);
    expect(log.entries()[1].id).toBe(log.entries()[0].id + 1);
    expect(log.entries()[0].at).toMatch(/^\d{2}:\d{2}:\d{2}\.\d{3}$/);
  });

  it('formats a moment as HH:mm:ss.SSS', () => {
    expect(clock(new Date(2026, 10, 16, 14, 58, 29, 737))).toBe('14:58:29.737');
    expect(clock(new Date(2026, 0, 1, 3, 4, 5, 6))).toBe('03:04:05.006');
  });

  it('keeps the newest 300 calls (triplesale.apilog.max) and can be cleared', () => {
    const log = new ApiLogService();
    for (let i = 0; i < MAX_ENTRIES + 20; i++) log.record(entry({ url: `/u${i}` }));
    expect(log.entries()).toHaveLength(MAX_ENTRIES);
    expect(log.entries()[0].url).toBe('/u20');
    expect(log.entries().at(-1)?.url).toBe(`/u${MAX_ENTRIES + 19}`);
    log.clear();
    expect(log.entries()).toHaveLength(0);
  });

  it('opens and closes the window', () => {
    const log = new ApiLogService();
    expect(log.isOpen()).toBe(false);
    log.open();
    expect(log.isOpen()).toBe(true);
    log.close();
    expect(log.isOpen()).toBe(false);
  });

  describe('curl (Data_API.toCurl)', () => {
    const curlOf = (over: Partial<ApiLogEntry>, token?: string, origin = 'http://localhost:4200') => {
      const log = new ApiLogService();
      log.record(entry(over));
      return log.curl(log.entries()[0], origin, token);
    };

    it('is one line: -i, the method, the URL, the JSON headers and the cookie placeholder of the old BFF (no body for a GET)', () => {
      expect(curlOf({})).toBe(
        "curl -i -X GET 'http://localhost:4200/triplesale/board/list?page=1' -H 'Content-Type: application/json; charset=UTF-8' -H 'Accept: application/json' -H 'Cookie: JSESSIONID=<your-session-id>'",
      );
    });

    it('puts the access token of a REST call in the Authorization header — a placeholder when none is given — and no cookie', () => {
      const rest = { url: '/triplesale-service/api/v1/leads', bearer: true };
      expect(curlOf(rest, 'tok123')).toContain("-H 'Authorization: Bearer tok123'");
      expect(curlOf(rest)).toContain("-H 'Authorization: Bearer <access_token>'");
      expect(curlOf(rest, 'tok123')).not.toContain('JSESSIONID');
    });

    it('never puts a token into the entry, only into the curl asked for', () => {
      const log = new ApiLogService();
      log.record(entry({ bearer: true }));
      log.curl(log.entries()[0], 'http://localhost:4200', 'tok123');
      expect(JSON.stringify(log.entries())).not.toContain('tok123');
    });

    it('adds the body as -d, a quote in it escaped for the shell', () => {
      expect(curlOf({ method: 'post', reqBody: '{"name":"O\'Neil"}' })).toContain(`curl -i -X POST`);
      expect(curlOf({ method: 'POST', reqBody: '{"name":"O\'Neil"}' })).toContain(`-d '{"name":"O'\\''Neil"}'`);
    });

    it('cuts a body longer than the curl limit and says how much', () => {
      const curl = curlOf({ method: 'POST', reqBody: 'x'.repeat(CURL_BODY_LIMIT + 10) });
      expect(curl).toContain(`...[ตัดออก 10 ตัวอักษร จากทั้งหมด ${CURL_BODY_LIMIT + 10}]`);
    });
  });
});

describe('clipBody', () => {
  it('leaves a short text alone and cuts a long one with the Java note', () => {
    expect(clipBody('abc', BODY_LIMIT)).toBe('abc');
    expect(clipBody('abcdef', 4)).toBe('abcd...[ตัดออก 2 ตัวอักษร จากทั้งหมด 6]');
  });
});

describe('javaPageName', () => {
  const page = (legacy: string[]) => ({ legacy }) as PageDef;

  it('is the .face file of the Java page (pages/index.xhtml → index.face)', () => {
    expect(javaPageName(page(['pages/index.xhtml', 'resources/js/dashboard.js']), '/crm/home')).toBe('index.face');
    expect(javaPageName(page(['resources/js/x.js', 'pages/contracts.xhtml']), '/crm/prospects')).toBe('contracts.face');
  });

  it('is the route for a page that has no Java page (a mock-up, a page without a registry entry)', () => {
    expect(javaPageName(page(['master-setup mockup.html']), '/settings')).toBe('/settings');
    expect(javaPageName(undefined, '/x')).toBe('/x');
  });
});

describe('curlOrigin', () => {
  const config = (apiOrigin?: string) => {
    const c = new ConfigService();
    (c as unknown as { current: unknown }).current = { ...DEFAULT_CONFIG, apiOrigin };
    return c;
  };

  it('names config.apiOrigin for a call to auth / service / dashboard, the page origin for anything else', () => {
    const c = config('https://uat.example');
    for (const url of ['/triplesale-service/api/v1/x', '/triplesale-auth/api/v1/x', '/dashboard-triplesale-service/api/v1/x'])
      expect(curlOrigin(url, c, 'http://localhost:4200')).toBe('https://uat.example');
    expect(curlOrigin('/triplesale/board/list', c, 'http://localhost:4200')).toBe('http://localhost:4200');
  });

  it('is the page origin for every call when apiOrigin is not set', () => {
    expect(curlOrigin('/triplesale-service/api/v1/x', config(), 'https://page.example')).toBe('https://page.example');
  });
});

describe('maskSecrets', () => {
  it('replaces the value of password / token / secret / authorization fields, at any depth, and leaves the rest', () => {
    expect(
      maskSecrets({ username: 'demo', password: 'p', nested: { access_token: 'a', refreshToken: 'r', clientSecret: 's', keep: 1 }, list: [{ Authorization: 'x', n: 2 }] }),
    ).toEqual({ username: 'demo', password: '***', nested: { access_token: '***', refreshToken: '***', clientSecret: '***', keep: 1 }, list: [{ Authorization: '***', n: 2 }] });
  });

  it('does not touch what is not an object, empty secrets, or the original', () => {
    const body = { password: '', token: null };
    expect(maskSecrets(null)).toBeNull();
    expect(maskSecrets('text')).toBe('text');
    expect(maskSecrets(body)).toEqual({ password: '', token: null });
    const original = { password: 'p' };
    maskSecrets(original);
    expect(original.password).toBe('p');
  });
});

describe('ApiLogService — tokens (the "Token" tab)', () => {
  const token = (n: number) => ({ kind: 'login' as const, source: 'keycloak' as const, accessToken: `a${n}`, refreshToken: `r${n}`, idToken: '', expiresIn: 300 });

  it('keeps the newest first, numbers and stamps them, and says when the access token ends', () => {
    const log = new ApiLogService();
    log.recordToken(token(1));
    log.recordToken({ ...token(2), kind: 'refresh' });
    expect(log.tokenEvents().map((t) => [t.id, t.kind, t.accessToken])).toEqual([
      [2, 'refresh', 'a2'],
      [1, 'login', 'a1'],
    ]);
    expect(log.tokenEvents()[0].at).toMatch(/^\d{2}:\d{2}:\d{2}\.\d{3}$/);
    expect(Math.abs(log.tokenEvents()[0].issuedAt - Date.now())).toBeLessThan(2000);
  });

  it('keeps 20 and can be emptied — and is separate from the list of calls', () => {
    const log = new ApiLogService();
    for (let i = 0; i < 25; i++) log.recordToken(token(i));
    expect(log.tokenEvents()).toHaveLength(20);
    expect(log.tokenEvents()[0].accessToken).toBe('a24');
    log.record({ page: 'p', via: '', method: 'GET', url: '/u', status: 200, ms: 1, reqBody: '', resBody: '' });
    log.clear(); // "ล้าง" of the API tab does not take the tokens away
    expect(log.tokenEvents()).toHaveLength(20);
    log.clearTokens();
    expect(log.tokenEvents()).toHaveLength(0);
  });
});

describe('ApiLogService — the calls of the sign-in (curl in the "Token" tab)', () => {
  const call = (label: string, over: Partial<Parameters<ApiLogService['traceAuthCall']>[0]> = {}) => ({
    label,
    method: 'POST',
    url: 'https://kc.example/realms/ace/protocol/openid-connect/token',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: 'grant_type=authorization_code&code=abc',
    status: 200,
    ms: 30,
    resBody: '{}',
    ...over,
  });
  const token = { kind: 'login' as const, source: 'keycloak' as const, accessToken: 'a', refreshToken: 'r', idToken: '', expiresIn: 300 };

  it('the calls made before a token go with that token (numbered, stamped), and the next token starts with none', () => {
    const log = new ApiLogService();
    log.traceAuthCall(call('Keycloak token (authorization_code)'));
    log.traceAuthCall(call('POST /me/session', { method: 'POST', status: 200 }));
    log.recordToken(token);
    log.recordToken({ ...token, kind: 'refresh' });
    const [refresh, login] = log.tokenEvents();
    expect(login.calls.map((c) => [c.id, c.label])).toEqual([
      [1, 'Keycloak token (authorization_code)'],
      [2, 'POST /me/session'],
    ]);
    expect(login.calls[0].at).toMatch(/^\d{2}:\d{2}:\d{2}\.\d{3}$/);
    expect(refresh.calls).toEqual([]);
  });

  it('a token with no call before it (the old auth service) has an empty list; clearTokens forgets calls that were not shown yet', () => {
    const log = new ApiLogService();
    log.recordToken(token);
    expect(log.tokenEvents()[0].calls).toEqual([]);
    log.traceAuthCall(call('x'));
    log.clearTokens();
    log.recordToken(token);
    expect(log.tokenEvents()[0].calls).toEqual([]);
  });

  it('keeps the newest 30 calls that wait for a token', () => {
    const log = new ApiLogService();
    for (let i = 0; i < 35; i++) log.traceAuthCall(call(`c${i}`));
    log.recordToken(token);
    const calls = log.tokenEvents()[0].calls;
    expect(calls).toHaveLength(30);
    expect(calls[0].label).toBe('c5');
  });

  it('authCurl: one line with the call as it was sent — own headers and form body, quotes made safe', () => {
    const log = new ApiLogService();
    log.traceAuthCall(call('t'));
    log.traceAuthCall(call('s', { url: 'https://api.example/me/session', body: '', headers: { Authorization: 'Bearer tok', Accept: 'application/json' } }));
    log.traceAuthCall(call('q', { body: "a=it's" }));
    log.recordToken(token);
    const [t, s, q] = log.tokenEvents()[0].calls;
    expect(log.authCurl(t)).toBe(
      "curl -i -X POST 'https://kc.example/realms/ace/protocol/openid-connect/token' -H 'Content-Type: application/x-www-form-urlencoded' -d 'grant_type=authorization_code&code=abc'",
    );
    expect(log.authCurl(s)).toBe("curl -i -X POST 'https://api.example/me/session' -H 'Authorization: Bearer tok' -H 'Accept: application/json'");
    expect(log.authCurl(q)).toContain(String.raw`-d 'a=it'\''s'`);
  });
});
