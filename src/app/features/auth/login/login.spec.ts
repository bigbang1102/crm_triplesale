import { provideHttpClient, withInterceptors } from '@angular/common/http';
import { Component, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { Router, provideRouter } from '@angular/router';
import { RouterTestingHarness } from '@angular/router/testing';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AuthService } from '@core/auth/auth.service';
import { ConfigService } from '@core/config/config.service';
import { apiErrorInterceptor, bearerInterceptor, credentialsInterceptor } from '@core/http/interceptors';
import { mockBackendInterceptor } from '@core/http/mock-backend.interceptor';
import { I18n } from '@core/i18n/i18n.service';
import { configStub } from '@core/testing/test-helpers';
import { loginEntry } from './login.engine';
import { Login } from './login';

@Component({ template: '' })
class Blank {}

const VIEWPORT_BEFORE = 'width=device-width, initial-scale=1';
const VIEWPORT_JAVA = 'width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=0';

const lang = signal<'th' | 'en'>('th');
const use = vi.fn(async (l: 'th' | 'en') => lang.set(l));

/** the login page against the real AuthService, the real interceptors and the dev mock of the REST APIs (auth-api.mock.ts) */
async function open(url = '/login') {
  const harness = await RouterTestingHarness.create();
  await harness.navigateByUrl(url, Login);
  const el = harness.routeNativeElement as HTMLElement;
  return { harness, el, router: TestBed.inject(Router), auth: TestBed.inject(AuthService) };
}

const $ = <T extends HTMLElement = HTMLElement>(el: HTMLElement, id: string) => el.querySelector<T>('#' + id)!;
const type = (input: HTMLInputElement, value: string) => {
  input.value = value;
  input.dispatchEvent(new Event('input', { bubbles: true }));
};
const key = (target: HTMLElement, k: string) => target.dispatchEvent(new KeyboardEvent('keydown', { key: k, bubbles: true, cancelable: true }));
const fill = (el: HTMLElement, user: string, password = 'x') => {
  type($<HTMLInputElement>(el, 'username'), user);
  type($<HTMLInputElement>(el, 'password'), password);
};
const alertOf = (el: HTMLElement) => {
  const box = $(el, 'alertBox');
  return { text: box.textContent, shown: box.style.display === 'block', cls: box.className };
};
const options = (el: HTMLElement) => [...$<HTMLSelectElement>(el, 'orgSelect').options].map((o) => `${o.value}=${o.textContent}`);
/** the address bar of the test page (jsdom) — the arrival script of the Java page reads `location.search` */
const atUrl = (url: string) => history.replaceState(null, '', url);
const busy = (el: HTMLElement) => $(el, 'overlay').classList.contains('show');

describe('Login page (web/index.xhtml, generated)', () => {
  beforeEach(() => {
    sessionStorage.clear();
    lang.set('th');
    use.mockClear();
    document.head.querySelector('meta[name="viewport"]')?.remove();
    document.head.insertAdjacentHTML('beforeend', `<meta name="viewport" content="${VIEWPORT_BEFORE}">`);
    TestBed.configureTestingModule({
      providers: [
        provideRouter([
          { path: 'login', component: Login },
          { path: 'crm/home', component: Blank },
          { path: 'crm/opportunities', component: Blank },
        ]),
        provideHttpClient(withInterceptors([apiErrorInterceptor, bearerInterceptor, credentialsInterceptor, mockBackendInterceptor])),
        { provide: ConfigService, useValue: configStub({ mock: true, branding: { projectEn: 'ACHIEVER CO., LTD.', version: '9.9.9-test' } }) },
        { provide: I18n, useValue: { lang, use, t: (k: string) => k } },
      ],
    });
  });
  afterEach(() => {
    TestBed.resetTestingModule();
    vi.restoreAllMocks();
    atUrl('/');
  });

  /** a live server session, as after a page reload of a signed-in user (the mock backend keeps it in sessionStorage) */
  const signedIn = async () => {
    const auth = TestBed.inject(AuthService);
    await auth.proxy({ username: 'demo', password: 'x' });
    await auth.completeSignIn();
  };

  describe('what the page shows', () => {
    it('is the markup of the Java file: title, labels, placeholders, the two logos, the version', async () => {
      const { el } = await open();
      expect(el.querySelector('h1.login-title')!.textContent).toBe('ลงชื่อเข้าใช้ TrippleSales');
      expect([...el.querySelectorAll('.field label')].map((l) => l.textContent)).toEqual(['Username', 'Password', 'บริษัท']);
      expect($<HTMLInputElement>(el, 'username').placeholder).toBe('ระบุชื่อผู้ใช้ของคุณ');
      expect($<HTMLInputElement>(el, 'password').placeholder).toBe('ระบุรหัสผ่าน');
      expect($(el, 'loginBtn').textContent).toBe('ลงชื่อเข้าใช้');
      expect($(el, 'forgotLink').textContent).toBe('ลืมรหัสผ่าน?');
      expect(el.querySelector('.version-tag')!.textContent).toBe('Version 9.9.9-test');
      expect([...el.querySelectorAll('img')].map((i) => i.getAttribute('src'))).toEqual(['assets/images/triplesales-logo.png', 'assets/images/triplesales-logo.png']);
      // nothing from the old Angular page is left: no subtitle, no demo-account hint
      expect(el.querySelector('.sub, .mock')).toBeNull();
    });

    it('starts on the form: the company step, the back link, the alert and the overlay are hidden; the user name has the focus', async () => {
      const { el } = await open();
      expect($(el, 'orgStep').classList.contains('show')).toBe(false);
      expect($(el, 'orgBackLink').style.display).toBe('none');
      expect(alertOf(el).shown).toBe(false);
      expect(busy(el)).toBe(false);
      await vi.waitFor(() => expect(document.activeElement).toBe($(el, 'username')));
    });

    it('puts the Java page behaviour on <html> / <meta viewport> while it is open and takes it away when it closes', async () => {
      const { harness, router } = await open();
      expect(document.documentElement.classList.contains('ts-login-page')).toBe(true);
      expect(document.querySelector('meta[name="viewport"]')!.getAttribute('content')).toBe(VIEWPORT_JAVA);

      await router.navigateByUrl('/crm/home');
      harness.fixture.detectChanges();
      expect(document.documentElement.classList.contains('ts-login-page')).toBe(false);
      expect(document.querySelector('meta[name="viewport"]')!.getAttribute('content')).toBe(VIEWPORT_BEFORE);
    });

    it('is always Thai: a language chosen in an earlier session is not restored (LoginProxyServlet: "ภาษาไทยเป็น default เสมอ")', async () => {
      lang.set('en');
      await open();
      expect(use).toHaveBeenCalledWith('th');
    });

    it('does not touch the language when it is Thai already', async () => {
      await open();
      expect(use).not.toHaveBeenCalled();
    });
  });

  describe('the form', () => {
    it('the eye button shows and hides the password (and swaps the icon)', async () => {
      const { el } = await open();
      const pw = $<HTMLInputElement>(el, 'password');
      const icon = $(el, 'togglePassIcon');
      expect([pw.type, icon.className]).toEqual(['password', 'fa-solid fa-eye-slash']);
      $(el, 'togglePass').click();
      expect([pw.type, icon.className]).toEqual(['text', 'fa-solid fa-eye']);
      $(el, 'togglePass').click();
      expect([pw.type, icon.className]).toEqual(['password', 'fa-solid fa-eye-slash']);
    });

    it('"forgot password" shows the administrator message as an error; the next attempt clears it', async () => {
      const { el } = await open();
      $(el, 'forgotLink').click();
      expect(alertOf(el)).toEqual({ text: 'กรุณาติดต่อผู้ดูแลระบบเพื่อรีเซ็ตรหัสผ่าน', shown: true, cls: 'alert error' });
      $(el, 'loginBtn').click();
      expect(alertOf(el).text).toBe('กรุณาระบุ Username และ Password');
    });

    it('a blank user name or password is refused before anything is sent (a blank user name is trimmed away)', async () => {
      const { el } = await open();
      const sent = vi.spyOn(TestBed.inject(AuthService), 'proxy');
      $(el, 'loginBtn').click();
      expect(alertOf(el)).toEqual({ text: 'กรุณาระบุ Username และ Password', shown: true, cls: 'alert error' });
      fill(el, '   ', 'x');
      $(el, 'loginBtn').click();
      fill(el, 'demo', '');
      key($(el, 'password'), 'Enter');
      $<HTMLFormElement>(el, 'loginForm').requestSubmit();
      expect(sent).not.toHaveBeenCalled();
      expect(busy(el)).toBe(false);
    });

    it('a wrong password shows the message of the server, re-enables the button and hides the overlay', async () => {
      const { el } = await open();
      fill(el, 'demo', 'wrong');
      $(el, 'loginBtn').click();
      expect(busy(el)).toBe(true);
      expect($<HTMLButtonElement>(el, 'loginBtn').disabled).toBe(true);
      await vi.waitFor(() => expect(alertOf(el).text).toBe('ชื่อผู้ใช้หรือรหัสผ่านไม่ถูกต้อง'));
      expect(alertOf(el).cls).toBe('alert error');
      expect(busy(el)).toBe(false);
      expect($<HTMLButtonElement>(el, 'loginBtn').disabled).toBe(false);
      expect(TestBed.inject(Router).url).toBe('/login');
    });

    it.each([
      ['err500', 'เข้าสู่ระบบไม่สำเร็จ (HTTP 500)'],
      ['html500', 'เข้าสู่ระบบไม่สำเร็จ (HTTP 500)'], // the body is not JSON: the status is all there is
      ['down', 'เชื่อมต่อระบบยืนยันตัวตนไม่ได้: Failed to fetch'], // the auth service gives no answer
      ['nojson', 'เข้าสู่ระบบไม่สำเร็จ (HTTP 200)'], // 200 without a token
      ['disabled', 'บัญชีนี้ถูกปิดการใช้งาน'], // the `error` text of the auth service is shown as it is
    ])('answer of the APIs for "%s" → "%s"', async (user, message) => {
      const { el } = await open();
      fill(el, user);
      key($(el, 'username'), 'Enter');
      await vi.waitFor(() => expect(alertOf(el).text).toBe(message), { timeout: 3000 });
      expect(alertOf(el).cls).toBe('alert error');
      expect(busy(el)).toBe(false);
    });

    it('a reply the page does not know (responseCode that is not COMPLETE / ORG_REQUIRED): the message of the server, else the code', async () => {
      const { el, auth } = await open();
      const answer = (data: Record<string, unknown>) => ({ status: 200, ok: true, data, raw: JSON.stringify(data) });
      const proxy = vi.spyOn(auth, 'proxy');
      proxy.mockResolvedValueOnce(answer({ responseCode: 'LOCKED' }));
      fill(el, 'demo');
      $(el, 'loginBtn').click();
      await vi.waitFor(() => expect(alertOf(el).text).toBe('เข้าสู่ระบบไม่สำเร็จ (LOCKED)'));
      proxy.mockResolvedValueOnce(answer({ responseCode: 'LOCKED', responseMessage: 'บัญชีนี้ถูกล็อก' }));
      $(el, 'loginBtn').click();
      await vi.waitFor(() => expect(alertOf(el).text).toBe('บัญชีนี้ถูกล็อก'));
    });

    it('if the page cannot even ask (the call rejects) it says the service cannot be reached', async () => {
      vi.spyOn(console, 'error').mockImplementation(() => undefined);
      const { el, auth } = await open();
      vi.spyOn(auth, 'proxy').mockRejectedValue(new TypeError('Failed to fetch'));
      fill(el, 'demo');
      $(el, 'loginBtn').click();
      await vi.waitFor(() => expect(alertOf(el).text).toBe('ไม่สามารถเชื่อมต่อ Service ได้: Failed to fetch'));
      expect(busy(el)).toBe(false);
    });

    it('success: the flags of the Java page are written, the success alert is shown, the session is opened, Home is shown', async () => {
      const { el, router, auth } = await open();
      fill(el, '  demo  ', 'secret');
      key($(el, 'password'), 'Enter');
      await vi.waitFor(() => expect(router.url).toBe('/crm/home'), { timeout: 3000 });
      expect(alertOf(el)).toEqual({ text: 'เข้าสู่ระบบสำเร็จ กำลังเข้าสู่หน้า Dashboard...', shown: true, cls: 'alert success' });
      expect(JSON.parse(sessionStorage.getItem('ts_login')!)).toEqual({ responseCode: 'COMPLETE', username: 'demo' });
      expect(sessionStorage.getItem('ts_username')).toBe('demo');
      expect(auth.isAuthenticated()).toBe(true);
      expect(auth.session()?.username).toBe('demo');
    });

    it('goes back to the page the guard sent the user from (?returnUrl=)', async () => {
      const { el, router } = await open('/login?returnUrl=%2Fcrm%2Fopportunities');
      fill(el, 'demo');
      $(el, 'loginBtn').click();
      await vi.waitFor(() => expect(router.url).toBe('/crm/opportunities'), { timeout: 3000 });
    });

    it('an external returnUrl is ignored', async () => {
      const { el, router } = await open('/login?returnUrl=%2F%2Fevil.example%2Fx');
      fill(el, 'demo');
      $(el, 'loginBtn').click();
      await vi.waitFor(() => expect(router.url).toBe('/crm/home'), { timeout: 3000 });
    });

    it('if the session cannot be opened after COMPLETE the page says so and stays usable (Java left the page at this point)', async () => {
      vi.spyOn(console, 'error').mockImplementation(() => undefined);
      const { el, auth, router } = await open();
      vi.spyOn(auth, 'completeSignIn').mockRejectedValue(new Error('HTTP 404 Not Found'));
      fill(el, 'demo');
      $(el, 'loginBtn').click();
      await vi.waitFor(() => expect(alertOf(el).text).toBe('ไม่สามารถเชื่อมต่อ Service ได้: HTTP 404 Not Found'));
      expect(alertOf(el).cls).toBe('alert error');
      expect(busy(el)).toBe(false);
      expect($<HTMLButtonElement>(el, 'loginBtn').disabled).toBe(false);
      expect(router.url).toBe('/login');
    });
  });

  describe('the company step', () => {
    const toCompanyStep = async (user = 'multi') => {
      const page = await open();
      fill(page.el, user);
      $(page.el, 'loginBtn').click();
      await vi.waitFor(() => expect($(page.el, 'orgStep').classList.contains('show')).toBe(true), { timeout: 3000 });
      return page;
    };
    const loaded = (el: HTMLElement) => vi.waitFor(() => expect(busy(el)).toBe(false), { timeout: 3000 });

    it('ORG_REQUIRED: the form is replaced by the company step for that account, the list is loaded, the button waits for a choice', async () => {
      const { el } = await toCompanyStep();
      await loaded(el);
      expect($(el, 'orgUser').textContent).toBe('multi');
      expect($<HTMLFormElement>(el, 'loginForm').style.display).toBe('none');
      expect($(el, 'forgotLink').style.display).toBe('none');
      expect($(el, 'orgBackLink').style.display).toBe('block');
      expect(options(el)).toEqual(['=-- กรุณาเลือกบริษัท --', '1004400123=ซัน เกตเวย์ (SUN)', '1004400456=เอซ คลาวด์ (ACE)']);
      expect($<HTMLButtonElement>(el, 'orgSubmitBtn').disabled).toBe(true);
      expect(alertOf(el).shown).toBe(false);
    });

    it('a choice enables the button; clearing it disables it again; Enter on the list without a choice asks for one', async () => {
      const { el } = await toCompanyStep();
      await loaded(el);
      const sel = $<HTMLSelectElement>(el, 'orgSelect');
      const pick = (v: string) => {
        sel.value = v;
        sel.dispatchEvent(new Event('change', { bubbles: true }));
      };
      pick('1004400456');
      expect($<HTMLButtonElement>(el, 'orgSubmitBtn').disabled).toBe(false);
      pick('');
      expect($<HTMLButtonElement>(el, 'orgSubmitBtn').disabled).toBe(true);
      key(sel, 'Enter');
      expect(alertOf(el)).toEqual({ text: 'กรุณาเลือกบริษัทก่อนเข้าสู่โปรแกรม', shown: true, cls: 'alert error' });
      expect(document.activeElement).toBe(sel);
      pick('1004400123'); // choosing hides the message
      expect(alertOf(el).shown).toBe(false);
    });

    it('choosing a company completes the sign-in with that company', async () => {
      const { el, router, auth } = await toCompanyStep();
      await loaded(el);
      const sel = $<HTMLSelectElement>(el, 'orgSelect');
      sel.value = '1004400456';
      sel.dispatchEvent(new Event('change', { bubbles: true }));
      $(el, 'orgSubmitBtn').click();
      expect(busy(el)).toBe(true);
      await vi.waitFor(() => expect(router.url).toBe('/crm/home'), { timeout: 3000 });
      expect(alertOf(el).text).toBe('เข้าสู่ระบบสำเร็จ กำลังเข้าสู่หน้า Dashboard...');
      expect(sessionStorage.getItem('ts_username')).toBe('multi');
      expect(auth.session()?.branch?.code).toBe('ACE');
    });

    it('the back link returns to the form: password cleared, user name kept and focused, list reset, nothing busy', async () => {
      const { el } = await toCompanyStep();
      await loaded(el);
      $(el, 'orgBackLink').click();
      expect($(el, 'orgStep').classList.contains('show')).toBe(false);
      expect($<HTMLFormElement>(el, 'loginForm').style.display).toBe('');
      expect($(el, 'forgotLink').style.display).toBe('');
      expect($(el, 'orgBackLink').style.display).toBe('none');
      expect($<HTMLInputElement>(el, 'password').value).toBe('');
      expect($<HTMLInputElement>(el, 'username').value).toBe('multi');
      expect(options(el)).toEqual(['=กำลังโหลดรายชื่อบริษัท...']);
      expect($<HTMLButtonElement>(el, 'orgSubmitBtn').disabled).toBe(true);
      expect(document.activeElement).toBe($(el, 'username'));
    });

    it('every shape of company is labelled "<name> (<code>)" with the Thai name first, and escaped', async () => {
      const { el } = await toCompanyStep('multimix');
      await loaded(el);
      expect(options(el)).toEqual([
        '=-- กรุณาเลือกบริษัท --',
        '11=Tom & "Jerry" <b>Co</b> (T&C)', // nameTh is empty → name; shown as text, not as markup
        '12=No code company',
        '13=ไม่มีชื่ออังกฤษ (NOC)',
        '14=#14',
        '15=ONLY (ONLY)', // only a code: it is the name too
      ]);
      expect($(el, 'orgSelect').querySelector('b')).toBeNull();
    });

    it.each([
      ['nobranch', 'บัญชีนี้ยังไม่ถูกผูกกับบริษัทใด กรุณาติดต่อผู้ดูแลระบบ', '=ไม่พบบริษัทที่ใช้งานได้'],
      ['branchfail', 'โหลดรายชื่อบริษัทไม่สำเร็จ (HTTP 500)', '=โหลดรายชื่อบริษัทไม่สำเร็จ'],
      ['branchdown', 'เชื่อมต่อระบบไม่ได้ระหว่างโหลดรายชื่อบริษัท', '=โหลดรายชื่อบริษัทไม่สำเร็จ'],
    ])('company list of "%s" → "%s"', async (user, message, option) => {
      const { el } = await toCompanyStep(user);
      await loaded(el);
      expect(alertOf(el)).toEqual({ text: message, shown: true, cls: 'alert error' });
      expect(options(el)).toEqual([option]);
      expect($<HTMLSelectElement>(el, 'orgSelect').disabled).toBe(false);
      expect($<HTMLButtonElement>(el, 'orgSubmitBtn').disabled).toBe(true);
    });

    it.each([
      ['selectfail', 'เลือกบริษัทไม่สำเร็จ (HTTP 500)'],
      ['selectdown', 'เชื่อมต่อระบบยืนยันตัวตนไม่ได้: Failed to fetch'],
    ])('choice of "%s" fails with "%s": the button is usable again', async (user, message) => {
      const { el } = await toCompanyStep(user);
      await loaded(el);
      const sel = $<HTMLSelectElement>(el, 'orgSelect');
      sel.value = '1004400123';
      sel.dispatchEvent(new Event('change', { bubbles: true }));
      $(el, 'orgSubmitBtn').click();
      await vi.waitFor(() => expect(alertOf(el).text).toBe(message), { timeout: 3000 });
      expect(busy(el)).toBe(false);
      expect($<HTMLButtonElement>(el, 'orgSubmitBtn').disabled).toBe(false);
      expect($(el, 'orgStep').classList.contains('show')).toBe(true);
    });

    it('a token that ran out (401) while choosing sends the user back to the form after 1.5 s', async () => {
      const { el } = await toCompanyStep('expire');
      await loaded(el);
      const sel = $<HTMLSelectElement>(el, 'orgSelect');
      sel.value = '1004400123';
      sel.dispatchEvent(new Event('change', { bubbles: true }));
      $(el, 'orgSubmitBtn').click();
      await vi.waitFor(() => expect(alertOf(el).text).toBe('Token expired'), { timeout: 3000 });
      expect($(el, 'orgStep').classList.contains('show')).toBe(true); // the message first …
      await vi.waitFor(() => expect($(el, 'orgStep').classList.contains('show')).toBe(false), { timeout: 3000 }); // … then the form
      expect(alertOf(el).shown).toBe(false);
      expect($<HTMLInputElement>(el, 'username').value).toBe('expire');
    });
  });

  describe('arrival', () => {
    it('?auth=… (the session filter sent the user back): the old flags are cleared and the form is shown, with no message', async () => {
      sessionStorage.setItem('ts_login', JSON.stringify({ responseCode: 'COMPLETE' }));
      sessionStorage.setItem('ts_username', 'demo');
      atUrl('/login?auth=TOKEN_EXPIRED'); // the Java script reads the address of the page (the test router does not move it)
      const { el } = await open('/login?auth=TOKEN_EXPIRED');
      expect(sessionStorage.getItem('ts_login')).toBeNull();
      expect(sessionStorage.getItem('ts_username')).toBeNull();
      expect(alertOf(el).shown).toBe(false);
      expect($(el, 'loginForm')).toBeTruthy();
    });

    it('?auth=… wins over a live session: the form is shown (Java: never auto-redirect from there, or it loops)', async () => {
      await signedIn();
      atUrl('/login?auth=NO_TOKEN');
      const { router, el } = await open('/login?auth=NO_TOKEN');
      expect(router.url).toBe('/login?auth=NO_TOKEN');
      expect($(el, 'loginForm')).toBeTruthy();
    });

    it('already signed in: straight to Home, the form is not shown', async () => {
      await signedIn();
      const { router, harness } = await open('/login');
      await harness.fixture.whenStable();
      expect(router.url).toBe('/crm/home');
    });

    it('loginEntry(): the arrival rules of the two Java scripts, on their own', () => {
      const redirected = vi.fn();
      const env = (signedIn: boolean) => ({ signedIn: () => signedIn, redirectHome: redirected });
      expect(loginEntry(env(false))).toBe('show');
      expect(redirected).not.toHaveBeenCalled();
      expect(loginEntry(env(true))).toBe('redirect');
      expect(redirected).toHaveBeenCalledTimes(1);
    });
  });

  describe('input guard (index.xhtml loads input_guard.js: the template that normally does is not used by this page)', () => {
    const before = (el: HTMLElement, id: string, data: string) => {
      const e = new InputEvent('beforeinput', { data, inputType: 'insertText', bubbles: true, cancelable: true });
      $(el, id).dispatchEvent(e);
      return e.defaultPrevented;
    };

    it('special characters cannot be typed into the user name, with the message in a box on <body>; the password is free', async () => {
      const { el } = await open();
      expect(before(el, 'username', '<')).toBe(true);
      expect(before(el, 'username', 'a')).toBe(false);
      expect(before(el, 'password', '<')).toBe(false);
      expect(document.getElementById('ig-warn-tip')!.textContent).toContain('label.guard.special_char');
    });

    it('is switched off when the page is left', async () => {
      const { el, router, harness } = await open();
      const username = $(el, 'username');
      await router.navigateByUrl('/crm/home');
      harness.fixture.detectChanges();
      const e = new InputEvent('beforeinput', { data: '<', inputType: 'insertText', bubbles: true, cancelable: true });
      username.dispatchEvent(e);
      expect(e.defaultPrevented).toBe(false);
    });
  });
});
