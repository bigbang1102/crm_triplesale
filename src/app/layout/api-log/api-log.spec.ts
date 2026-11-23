import { signal } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AuthService } from '@core/auth/auth.service';
import { TokenStore } from '@core/auth/token.store';
import { ConfigService } from '@core/config/config.service';
import { ApiLogEntry, ApiLogService } from '@core/http/api-log.service';
import { PermissionService } from '@core/permissions/permission.service';
import { authStub, configStub } from '@core/testing/test-helpers';
import { ApiLogWindow } from './api-log';

const SERVICE = '/triplesale-service/api/v1';

const call = (over: Partial<ApiLogEntry> = {}): Omit<ApiLogEntry, 'id' | 'at'> => ({
  page: 'index.face',
  via: '/board/movement-types',
  method: 'GET',
  url: `${SERVICE}/master-data/movement-types/LD`,
  status: 200,
  ms: 178,
  reqBody: '',
  resBody: '{"status":200,"result":[{"code":"AA-SUN1"}]}',
  bearer: true,
  ...over,
});

describe('Log window (api_log.xhtml)', () => {
  let fixture: ComponentFixture<ApiLogWindow>;
  let log: ApiLogService;
  let el: HTMLElement;
  let superAdmin: ReturnType<typeof signal<boolean>>;

  const settle = async () => {
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();
  };
  const $ = <T extends HTMLElement = HTMLElement>(sel: string) => el.querySelector<T>(sel);
  const $$ = <T extends HTMLElement = HTMLElement>(sel: string) => [...el.querySelectorAll<T>(sel)];
  const text = (node: Element | null) => (node?.textContent ?? '').replace(/\s+/g, ' ').trim();
  /** the classes of an element, in a fixed order (Angular does not keep the order of a [class] binding) */
  const classesOf = (node: Element) => [...node.classList].sort();
  const open = async () => {
    log.open();
    await settle();
  };
  const type = async (sel: string, value: string) => {
    const input = $<HTMLInputElement>(sel)!;
    input.value = value;
    input.dispatchEvent(new Event('input', { bubbles: true }));
    await settle();
  };
  const click = async (node: HTMLElement | null) => {
    node!.click();
    await settle();
  };
  const button = (label: string) => $$('button').find((b) => text(b).startsWith(label)) ?? null;

  beforeEach(() => {
    sessionStorage.clear();
    superAdmin = signal(false);
    TestBed.configureTestingModule({
      providers: [
        { provide: ConfigService, useValue: configStub({ apiOrigin: 'https://uat.example' }) },
        { provide: AuthService, useValue: authStub(['Zeta_View', 'super_admin', 'CRM_Lead_View', 'alpha_Edit']) },
        { provide: PermissionService, useValue: { isSuperAdmin: superAdmin } },
      ],
    });
    log = TestBed.inject(ApiLogService);
    fixture = TestBed.createComponent(ApiLogWindow);
    el = fixture.nativeElement as HTMLElement;
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
    document.body.style.overflow = '';
  });

  describe('opening', () => {
    it('is nothing until the Log button opens it, then the dark overlay with the panel; the page behind stops scrolling', async () => {
      await settle();
      expect($('#apiLogOverlay')).toBeNull();
      await open();
      expect($('#apiLogOverlay')?.classList.contains('show')).toBe(true);
      expect(text($('.alg-head .t'))).toBe('Log การเรียก API');
      expect(document.body.style.overflow).toBe('hidden');
      log.close();
      await settle();
      expect($('#apiLogOverlay')).toBeNull();
      expect(document.body.style.overflow).toBe('');
    });

    it('closes with "ปิด", with Esc, and with a click on the dark area — not with a click on the panel', async () => {
      await open();
      await click($('.alg-panel'));
      expect(log.isOpen()).toBe(true);
      await click(button('ปิด'));
      expect(log.isOpen()).toBe(false);

      await open();
      document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
      await settle();
      expect(log.isOpen()).toBe(false);

      await open();
      await click($('#apiLogOverlay'));
      expect(log.isOpen()).toBe(false);
    });

    it('shows the two tabs, the footer of Log UI v4 and, with no call yet, the hint to open a page', async () => {
      await open();
      expect($$('.alg-tab').map((t) => text(t))).toEqual(['API ที่ยิงออกไป', 'สิทธิ์ของผู้ใช้ (Role)', 'Token (0)']);
      expect($('#algTabApi')?.classList.contains('on')).toBe(true);
      expect(text($('.alg-empty'))).toBe('ยังไม่มี log — เปิดหน้าที่ต้องการตรวจสอบให้ระบบยิง API ก่อน แล้วกด "รีเฟรช"');
      expect(text($('.alg-foot'))).toContain('Log UI v4 · 28/08/2026');
      expect(text($('#algCount'))).toBe('0 / 0');
    });
  });

  describe('API tab', () => {
    beforeEach(() => {
      log.record(call({ page: 'index.face' }));
      log.record(call({ url: `${SERVICE}/dashboard/schedules?viewMode=year`, via: '/dashboard/schedules', ms: 22 }));
      log.record(call({ page: 'contracts.face', method: 'POST', url: `${SERVICE}/prospects`, via: '/board/prospect-save', status: 422, ms: 41, reqBody: '{"name":"x"}', resBody: '{"message":"bad"}' }));
    });

    it('lists the calls oldest first under a heading per page, each with #, time, method, path, status and ms', async () => {
      await open();
      expect($$('.alg-pagehd').map((h) => text(h))).toEqual(['หน้า: index.face', 'หน้า: contracts.face']);
      const rows = $$('.alg-row');
      expect(rows).toHaveLength(3);
      const cells = [...rows[0].children].map((c) => text(c));
      expect(cells[0]).toBe('#1');
      expect(cells[1]).toMatch(/^\d{2}:\d{2}:\d{2}\.\d{3}$/);
      expect(cells.slice(2)).toEqual(['GET', '/triplesale-service/api/v1/master-data/movement-types/LD', '200', '178 ms']);
      expect($$('.alg-m').map((m) => classesOf(m))).toEqual([['GET', 'alg-m'], ['GET', 'alg-m'], ['POST', 'alg-m']]);
      expect($$('.alg-st').map((s) => classesOf(s))).toEqual([
        ['alg-st', 'ok', 'st'],
        ['alg-st', 'ok', 'st'],
        ['alg-st', 'st', 'warn'],
      ]);
      expect(text($('#algCount'))).toBe('3 / 3');
    });

    it('colours a 5xx and "no answer" as errors and shows ERR for status 0', async () => {
      log.record(call({ status: 500 }));
      log.record(call({ status: 0 }));
      await open();
      const st = $$('.alg-st').slice(3);
      expect(st.map((s) => [text(s), classesOf(s)])).toEqual([
        ['500', ['alg-st', 'err', 'st']],
        ['ERR', ['alg-st', 'err', 'st']],
      ]);
    });

    it('a click on a row opens: the servlet, the full URL, the request body, the response and the curl — a second click closes it', async () => {
      await open();
      expect($('.alg-detail.show')).toBeNull();
      await click($$('.alg-row')[2]);
      const detail = $('.alg-detail.show')!;
      expect(text(detail.querySelector('.alg-dlbl'))).toBe('เรียกจาก servlet: /board/prospect-save');
      const pre = [...detail.querySelectorAll('.alg-pre')].map((p) => p.textContent);
      expect(pre[0]).toBe(`https://uat.example${SERVICE}/prospects`); // the full URL, the host the page proxies to
      expect(pre[1]).toBe('{\n  "name": "x"\n}'); // request body, indented
      expect(pre[2]).toBe('{\n  "message": "bad"\n}'); // response
      expect(text(detail.querySelector('.alg-curl .alg-dlbl'))).toContain('curl (วางใน Postman ได้เลย)');
      await click($$('.alg-row')[2]);
      expect($('.alg-detail.show')).toBeNull();
    });

    it('the servlet is "-" when it is not known, and a call without a body has no Request body box', async () => {
      log.clear();
      log.record(call({ via: '' }));
      await open();
      await click($('.alg-row'));
      expect(text($('.alg-detail.show .alg-dlbl'))).toBe('เรียกจาก servlet: -');
      expect($$('.alg-detail.show .alg-dlbl').map((l) => text(l))).not.toContain('Request body');
    });

    it('prints an empty answer as (ว่าง) and a text that is not JSON as it is', async () => {
      log.clear();
      log.record(call({ resBody: '' }));
      log.record(call({ resBody: 'plain text answer' }));
      await open();
      await click($$('.alg-row')[0]);
      await click($$('.alg-row')[1]);
      const answers = $$('.alg-detail.show').map((d) => d.querySelectorAll('.alg-pre')[1].textContent);
      expect(answers).toEqual(['(ว่าง)', 'plain text answer']);
    });

    it('the curl carries the access token of this tab (Authorization: Bearer …) and the body; the entry itself does not', async () => {
      TestBed.inject(TokenStore).write({
        accessToken: 'tok-123',
        refreshToken: 'r',
        expiresAt: Date.now() + 60_000,
        session: { username: 'u', profileName: 'U', employeeId: 1, employeeCode: '', branch: null, branchCode: '', roles: [] },
      });
      await open();
      await click($$('.alg-row')[2]);
      expect(text($('.alg-curl .alg-pre'))).toBe(
        `curl -i -X POST 'https://uat.example${SERVICE}/prospects' -H 'Content-Type: application/json; charset=UTF-8' -H 'Accept: application/json' -H 'Authorization: Bearer tok-123' -d '{"name":"x"}'`,
      );
      expect(JSON.stringify(log.entries())).not.toContain('tok-123');
    });

    it('"คัดลอก curl" copies exactly that curl and says "คัดลอกแล้ว" for a moment', async () => {
      const writeText = vi.fn().mockResolvedValue(undefined);
      vi.stubGlobal('navigator', { ...navigator, clipboard: { writeText } });
      await open();
      await click($$('.alg-row')[0]);
      vi.useFakeTimers();
      await click($('.alg-copy'));
      await Promise.resolve();
      await settle();
      expect(writeText).toHaveBeenCalledWith(text($('.alg-curl .alg-pre')));
      expect(text($('.alg-copy'))).toBe('คัดลอกแล้ว');
      await vi.advanceTimersByTimeAsync(1500);
      await settle();
      expect(text($('.alg-copy'))).toBe('คัดลอก curl');
    });

    it('the copy button does not toggle the row', async () => {
      vi.stubGlobal('navigator', { ...navigator, clipboard: { writeText: vi.fn().mockResolvedValue(undefined) } });
      await open();
      await click($$('.alg-row')[0]);
      await click($('.alg-copy'));
      expect($('.alg-detail.show')).not.toBeNull();
    });

    it('the page dropdown lists the pages that have calls with their numbers, and filters the list', async () => {
      await open();
      const select = $<HTMLSelectElement>('#algPage')!;
      expect([...select.options].map((o) => text(o))).toEqual(['ทุกหน้า (3)', 'index.face (2)', 'contracts.face (1)']);
      select.value = 'contracts.face';
      select.dispatchEvent(new Event('change', { bubbles: true }));
      await settle();
      expect($$('.alg-row')).toHaveLength(1);
      expect(text($('#algCount'))).toBe('1 / 3');
    });

    it('the search looks in the URL, the method, the servlet and both bodies', async () => {
      await open();
      await type('#algSearch', 'schedules');
      expect($$('.alg-row')).toHaveLength(1);
      await type('#algSearch', 'bad');
      expect($$('.alg-row')).toHaveLength(1); // the response of the POST
      await type('#algSearch', '"name":"x"');
      expect($$('.alg-row')).toHaveLength(1); // its request body
      await type('#algSearch', 'POST');
      expect($$('.alg-row')).toHaveLength(1);
      await type('#algSearch', 'nothing like this');
      expect($$('.alg-row')).toHaveLength(0);
      expect(text($('.alg-empty'))).toContain('ยังไม่มี log');
    });

    it('a new call shows only after "รีเฟรช" (the list is read when asked), and the chosen page that vanished goes back to "ทุกหน้า"', async () => {
      await open();
      log.record(call({ page: 'home.face' }));
      await settle();
      expect($$('.alg-row')).toHaveLength(3);
      await click(button('รีเฟรช'));
      expect($$('.alg-row')).toHaveLength(4);

      const select = $<HTMLSelectElement>('#algPage')!;
      select.value = 'home.face';
      select.dispatchEvent(new Event('change', { bubbles: true }));
      await settle();
      log.clear();
      await click(button('รีเฟรช'));
      expect($<HTMLSelectElement>('#algPage')!.value).toBe('');
    });

    it('"อัตโนมัติ" re-reads every 3 seconds (button turns green: เปิด) until it is switched off or the window closes', async () => {
      await open();
      vi.useFakeTimers();
      await click($('#algAutoBtn'));
      expect(text($('#algAutoBtn'))).toBe('อัตโนมัติ: เปิด');
      expect($('#algAutoBtn')?.classList.contains('on')).toBe(true);

      log.record(call({ page: 'home.face' }));
      await vi.advanceTimersByTimeAsync(3000);
      await settle();
      expect($$('.alg-row')).toHaveLength(4);

      await click($('#algAutoBtn'));
      expect(text($('#algAutoBtn'))).toBe('อัตโนมัติ: ปิด');
      log.record(call());
      await vi.advanceTimersByTimeAsync(6000);
      await settle();
      expect($$('.alg-row')).toHaveLength(4);

      await click($('#algAutoBtn'));
      log.close();
      await settle();
      log.open();
      await settle();
      expect(text($('#algAutoBtn'))).toBe('อัตโนมัติ: ปิด'); // closing stopped it
    });

    it('"ล้าง" empties the list of the service and of the window', async () => {
      await open();
      await click($$('.alg-row')[0]);
      await click(button('ล้าง'));
      expect(log.entries()).toHaveLength(0);
      expect($$('.alg-row')).toHaveLength(0);
      expect(text($('#algCount'))).toBe('0 / 0');
    });
  });

  describe('สิทธิ์ของผู้ใช้ (Role) tab', () => {
    it('lists the roles A–Z with the super-admin one first and explained; the controls of the API tab are hidden', async () => {
      superAdmin.set(true);
      await open();
      expect($('#algSearch')).not.toBeNull();
      await click($('#algTabRoles'));
      expect($('#algTabRoles')?.classList.contains('on')).toBe(true);
      expect($('#algSearch')).toBeNull();
      expect($('#algPage')).toBeNull();
      expect($('#algAutoBtn')).toBeNull();
      expect(button('ล้าง')).toBeNull();
      expect(button('รีเฟรช')).not.toBeNull();

      expect($$('.alg-role').map((r) => text(r))).toEqual(['super_admin ผ่านทุกด่านสิทธิ์โดยอัตโนมัติ', 'alpha_Edit', 'CRM_Lead_View', 'Zeta_View']);
      expect($('.alg-role.super')).not.toBeNull();
      expect($$('.alg-rsum .k, .alg-rsum .v').map((c) => text(c))).toEqual(['ผู้ใช้', 'u', 'จำนวน role', '4', 'super_admin']);
      expect(text($('.alg-badge'))).toBe('ใช่ — ข้ามทุกด่านสิทธิ์');
      expect($('.alg-badge')?.classList.contains('yes')).toBe(true);
      expect(text($('#algCount'))).toBe('4');
    });

    it('says when the user is not a super admin', async () => {
      await open();
      await click($('#algTabRoles'));
      expect(text($('.alg-badge'))).toBe('ไม่ใช่ — ตรวจตาม role ด้านล่าง');
      expect($('.alg-badge')?.classList.contains('no')).toBe(true);
    });

    it('the role search hides what does not match, marks what does, and the count follows', async () => {
      await open();
      await click($('#algTabRoles'));
      await type('#algRoleSearch', 'view');
      expect($$('.alg-role').map((r) => text(r))).toEqual(['CRM_Lead_View', 'Zeta_View']);
      expect($$('.alg-role.hit')).toHaveLength(2);
      expect(text($('#algCount'))).toBe('2');
      await type('#algRoleSearch', '');
      expect($$('.alg-role')).toHaveLength(4);
      expect($$('.alg-role.hit')).toHaveLength(0);
    });

    it('a session with no role says what it usually means (fail-closed)', async () => {
      TestBed.resetTestingModule();
      TestBed.configureTestingModule({
        providers: [
          { provide: ConfigService, useValue: configStub() },
          { provide: AuthService, useValue: authStub([]) },
          { provide: PermissionService, useValue: { isSuperAdmin: signal(false) } },
        ],
      });
      log = TestBed.inject(ApiLogService);
      fixture = TestBed.createComponent(ApiLogWindow);
      el = fixture.nativeElement as HTMLElement;
      await open();
      await click($('#algTabRoles'));
      expect(text($('.alg-empty'))).toBe('ไม่มี role เลย — ส่วนใหญ่แปลว่า /me/roles ตอน login ไม่สำเร็จ (ระบบเป็น fail-closed เมนูและปุ่มจะหายทั้งหมด)');
    });

    it('going back to the API tab shows the list again', async () => {
      log.record(call());
      await open();
      await click($('#algTabRoles'));
      await click($('#algTabApi'));
      expect($$('.alg-row')).toHaveLength(1);
      expect($('#algSearch')).not.toBeNull();
    });
  });

  describe('Token tab (the tokens a sign-in and every refresh brought)', () => {
    /** a JWT whose payload is {preferred_username:'demo', azp:'triplesales-web'} (header and signature are not read) */
    const jwt = `h.${btoa('{"preferred_username":"demo","azp":"triplesales-web"}')}.s`;
    const tokenEvent = (over: Partial<Parameters<ApiLogService['recordToken']>[0]> = {}) =>
      log.recordToken({ kind: 'login', source: 'keycloak', accessToken: jwt, refreshToken: 'refresh-1', idToken: '', expiresIn: 300, ...over });

    it('the tab says how many tokens there are; with none it says when they will show', async () => {
      await open();
      expect(text($('#algTabTokens'))).toBe('Token (0)');
      await click($('#algTabTokens'));
      expect($('#algTabTokens')?.classList.contains('on')).toBe(true);
      expect(text($('.alg-empty'))).toBe('ยังไม่มี token ในแท็บนี้ — token จะแสดงที่นี่หลัง login สำเร็จ และทุกครั้งที่มีการ refresh token');
      expect($('#algSearch')).toBeNull(); // the controls of the API tab are hidden here as well
      expect(text($('#algCount'))).toBe('0');
    });

    it('lists a sign-in: when, who issued it, the access / refresh token in full, the lifetime and what the access token says', async () => {
      tokenEvent();
      await open();
      await click($('#algTabTokens'));
      expect(text($('#algTabTokens'))).toBe('Token (1)');
      expect(text($('.alg-pagehd'))).toMatch(/^Login สำเร็จ · \d{2}:\d{2}:\d{2}\.\d{3} · Keycloak$/);
      const boxes = $$('.alg-curl .alg-pre').map((p) => p.textContent);
      expect(boxes).toEqual([jwt, 'refresh-1']);
      expect(text($$('.alg-dbox')[0])).toMatch(/^อายุ access token: 300 วินาที — หมดอายุเวลา \d{2}:\d{2}:\d{2}\.\d{3}$/);
      const claims = $$('.alg-dbox').at(-1)!.querySelector('.alg-pre')!.textContent!;
      expect(JSON.parse(claims)).toEqual({ preferred_username: 'demo', azp: 'triplesales-web' });
    });

    it('shows the curl of the calls the sign-in made, in the order they were sent, each with its answer and a copy button', async () => {
      log.traceAuthCall({
        label: 'Keycloak token (authorization_code)',
        method: 'POST',
        url: 'https://kc.example/realms/ace/protocol/openid-connect/token',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: 'grant_type=authorization_code&code=abc',
        status: 200,
        ms: 31,
        resBody: '{"expires_in":300}',
      });
      log.traceAuthCall({ label: 'POST /me/session', method: 'POST', url: 'https://api.example/me/session', headers: { Authorization: 'Bearer tok' }, body: '', status: 403, ms: 12, resBody: '' });
      tokenEvent();
      await open();
      await click($('#algTabTokens'));
      const curls = $$('.alg-curl').filter((b) => text(b).startsWith('#'));
      expect(curls.map((b) => b.querySelector('.alg-pre')!.textContent)).toEqual([
        "curl -i -X POST 'https://kc.example/realms/ace/protocol/openid-connect/token' -H 'Content-Type: application/x-www-form-urlencoded' -d 'grant_type=authorization_code&code=abc'",
        "curl -i -X POST 'https://api.example/me/session' -H 'Authorization: Bearer tok'",
      ]);
      expect(text(curls[0].querySelector('.alg-dlbl'))).toContain('Keycloak token (authorization_code) · POST → HTTP 200 · 31 ms');
      expect(text(curls[1].querySelector('.alg-dlbl'))).toContain('POST /me/session · POST → HTTP 403 · 12 ms');
      expect(text($('#algTokens'))).toContain('curl ของการ Login (2 คำขอ)');
      expect(text($('#algTokens'))).toContain('"expires_in": 300'); // the answer of the first call, indented
      // a call with no answer text has no Response box
      expect($$('.alg-dlbl').filter((l) => text(l).startsWith('Response #')).map((l) => text(l))).toEqual(['Response #1']);
    });

    it('a token with no call before it (old auth service) shows no curl section', async () => {
      tokenEvent();
      await open();
      await click($('#algTabTokens'));
      expect(text($('#algTokens'))).not.toContain('curl ของการ');
    });

    it('a refresh is listed above the sign-in, the id token only when there is one, and a token that is not a JWT says so', async () => {
      tokenEvent();
      tokenEvent({ kind: 'refresh', accessToken: 'opaque-token', idToken: 'id-1', source: 'auth-api' });
      await open();
      await click($('#algTabTokens'));
      expect($$('.alg-pagehd').map((h) => text(h).replace(/ · \d{2}:\d{2}:\d{2}\.\d{3}/, '').replace(' ใช้งานอยู่', ''))).toEqual([
        'Refresh token · auth service (POST /auth/login)',
        'Login สำเร็จ · Keycloak',
      ]);
      const first = $$('.alg-dbox.alg-curl')[0].closest('.alg-tokens')!;
      expect([...first.querySelectorAll('.alg-curl .alg-dlbl')].map((l) => text(l).replace(/(คัดลอก)$/, '').trim())).toEqual([
        'access_token',
        'refresh_token',
        'id_token',
        'access_token',
        'refresh_token',
      ]);
      const claimsBoxes = $$('.alg-dbox').filter((d) => text(d).startsWith('ข้อมูลใน access token'));
      expect(text(claimsBoxes[0])).toContain('(ไม่ใช่ JWT — อ่านข้อมูลในตัว token ไม่ได้)'); // the refresh (newest)
      expect(text(claimsBoxes[1])).toContain('"preferred_username"'); // the sign-in
    });

    it('marks the token the tab uses now "ใช้งานอยู่", and the one a refresh replaced not', async () => {
      TestBed.inject(TokenStore).write({
        accessToken: 'newest-token',
        refreshToken: 'r',
        expiresAt: Date.now() + 60_000,
        session: { username: 'u', profileName: 'U', employeeId: 1, employeeCode: '', branch: null, branchCode: '', roles: [] },
      });
      tokenEvent({ accessToken: 'old-token' });
      tokenEvent({ kind: 'refresh', accessToken: 'newest-token' });
      await open();
      await click($('#algTabTokens'));
      expect($$('.alg-pagehd').map((h) => !!h.querySelector('.alg-badge'))).toEqual([true, false]);
    });

    it('a refresh that happens while the tab is open shows at once (nothing to refresh)', async () => {
      await open();
      await click($('#algTabTokens'));
      tokenEvent({ kind: 'refresh' });
      await settle();
      expect($$('.alg-pagehd')).toHaveLength(1);
      expect(text($('#algCount'))).toBe('1');
    });

    it('the copy buttons copy exactly the token and say "คัดลอกแล้ว" for a moment', async () => {
      const writeText = vi.fn().mockResolvedValue(undefined);
      vi.stubGlobal('navigator', { ...navigator, clipboard: { writeText } });
      tokenEvent();
      await open();
      await click($('#algTabTokens'));
      vi.useFakeTimers();
      const [access, refresh] = $$('.alg-copy');
      await click(access);
      await Promise.resolve();
      await settle();
      expect(writeText).toHaveBeenLastCalledWith(jwt);
      expect(text(access)).toBe('คัดลอกแล้ว');
      expect(text(refresh)).toBe('คัดลอก');
      await click(refresh);
      await Promise.resolve();
      expect(writeText).toHaveBeenLastCalledWith('refresh-1');
      await vi.advanceTimersByTimeAsync(1500);
      await settle();
      expect($$('.alg-copy').map((b) => text(b))).toEqual(['คัดลอก', 'คัดลอก']);
    });

    it('going back to the API tab shows the calls again', async () => {
      log.record(call());
      tokenEvent();
      await open();
      await click($('#algTabTokens'));
      await click($('#algTabApi'));
      expect($$('.alg-row')).toHaveLength(1);
    });
  });

  describe('dragging the window by its head', () => {
    const pointer = (type: string, x: number, y: number) => new MouseEvent(type, { clientX: x, clientY: y, button: 0, bubbles: true, cancelable: true });
    const transform = () => $<HTMLElement>('.alg-panel')!.style.transform;

    beforeEach(async () => {
      await open();
      const head = $<HTMLElement>('.alg-head')!;
      head.setPointerCapture = vi.fn();
      head.releasePointerCapture = vi.fn();
    });

    it('moves with the pointer, stops on release, and a double click on the head brings it back to the middle', async () => {
      const head = $<HTMLElement>('.alg-head')!;
      expect(transform()).toBe('translate(0px,0px)');
      head.dispatchEvent(pointer('pointerdown', 10, 10));
      expect(document.body.classList.contains('alg-dragging')).toBe(true);
      head.dispatchEvent(pointer('pointermove', 310, 110));
      await settle();
      expect(transform()).toBe('translate(300px,100px)');
      head.dispatchEvent(pointer('pointerup', 310, 110));
      expect(document.body.classList.contains('alg-dragging')).toBe(false);
      head.dispatchEvent(pointer('pointermove', 400, 400));
      await settle();
      expect(transform()).toBe('translate(300px,100px)'); // released: no longer follows

      head.dispatchEvent(new MouseEvent('dblclick', { bubbles: true }));
      await settle();
      expect(transform()).toBe('translate(0px,0px)');
    });

    it('a press on a button, a field or the dropdown of the head is a click, not a drag', () => {
      $<HTMLElement>('#algSearch')!.dispatchEvent(pointer('pointerdown', 5, 5));
      expect(document.body.classList.contains('alg-dragging')).toBe(false);
    });

    it('is kept after the window is closed and opened again', async () => {
      const head = $<HTMLElement>('.alg-head')!;
      head.dispatchEvent(pointer('pointerdown', 0, 0));
      head.dispatchEvent(pointer('pointermove', 200, 50));
      head.dispatchEvent(pointer('pointerup', 200, 50));
      log.close();
      await settle();
      await open();
      expect(transform()).toBe('translate(200px,50px)');
    });
  });
});
