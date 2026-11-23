import { Type, signal } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { By } from '@angular/platform-browser';
import { Router, provideRouter } from '@angular/router';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AuthService } from '@core/auth/auth.service';
import { SessionInfo } from '@core/auth/auth.models';
import { ConfigService } from '@core/config/config.service';
import { I18n } from '@core/i18n/i18n.service';
import { javaLinkToRoute } from '@core/navigation/java-links';
import { PermissionService } from '@core/permissions/permission.service';
import { configStub } from '@core/testing/test-helpers';
import { SalesDocBackend } from './sales-doc-backend';
import { SalesDocForm } from './sales-doc-form';
import { SalesDocFormBase } from './sales-doc-form-base';
import { SalesDocAdView } from './sales-doc-ad-view';
import { SalesDocAqView } from './sales-doc-aq-view';
import { SalesDocBkView } from './sales-doc-bk-view';
import { SalesDocObView } from './sales-doc-ob-view';
import { SalesDocQtView } from './sales-doc-qt-view';
import { createMockSalesDoc, resetMockSalesDoc } from './sales-doc.mock';

// the page runs real timers against the fake backend (latency, 80 ms scans of the dropdowns …): more than vitest's 5 s when the machine is busy
vi.setConfig({ testTimeout: 30000 });

const lang = signal<'th' | 'en'>('th');
// a key stands for its text, except the one the customer form puts into a field (its value is validated: letters only)
const TEXT: Record<string, string> = { 'label.qt.country_th': 'ไทย' };
const t = (k: string) => TEXT[k] ?? k;
const session = signal<SessionInfo | null>({
  username: 'demo', profileName: 'สมชาย ใจดี (ทดลอง)', employeeId: 1001, employeeCode: 'E1001', branch: { id: 1004400123, code: 'SUN', name: 'SUN GATEWAY' }, branchCode: 'SUN', roles: ['super_admin'],
});

/** jsdom has no IntersectionObserver (the infinite scroll of the customer pick); every one that was made is kept to see that it is disconnected */
class FakeIntersectionObserver {
  static all: FakeIntersectionObserver[] = [];
  disconnected = false;
  constructor(public callback: unknown, public options?: unknown) {
    FakeIntersectionObserver.all.push(this);
  }
  observe(): void {}
  unobserve(): void {}
  takeRecords(): unknown[] { return []; }
  disconnect(): void { this.disconnected = true; }
}

type ViewType = Type<SalesDocFormBase>;
const FORMS: Array<{ type: 'qt' | 'bk' | 'ob' | 'aq' | 'ad'; view: ViewType; paper: string; rows: string; add: string }> = [
  { type: 'qt', view: SalesDocQtView, paper: '#qtPaper', rows: '#qtItems tr', add: '#qtAddRow' },
  { type: 'bk', view: SalesDocBkView, paper: '#bkPaper', rows: '#bkItems tr', add: '#bkAddRow' },
  { type: 'ob', view: SalesDocObView, paper: '#obPaper', rows: '#obItems tr', add: '#obAddRow' },
  { type: 'aq', view: SalesDocAqView, paper: '#aqPaper', rows: '#aqVehRows tr', add: '#aqVehAdd' },
  { type: 'ad', view: SalesDocAdView, paper: '#adPaper', rows: '#adVehRows tr', add: '#adVehAdd' },
];

describe('Sales-document forms (pages/sales_doc_{qt,bk,ob,aq,ad}_form.xhtml, generated)', () => {
  let fixture: ComponentFixture<unknown>;
  let el: HTMLElement;
  let allowed: boolean;
  let navigateSpy: ReturnType<typeof vi.fn>;
  let routeSpy: ReturnType<typeof vi.fn>;
  let calls: Array<{ url: string; method: string; body?: string }>;
  let swalCalls: Array<Record<string, any>>;

  const $ = <T extends HTMLElement = HTMLElement>(sel: string) => (el.querySelector<T>(sel) ?? document.querySelector<T>(sel))!;
  const $$ = <T extends HTMLElement = HTMLElement>(sel: string) => [...document.querySelectorAll<T>(sel)].filter((e) => el.contains(e) || true);
  const settle = (fn: () => void) => vi.waitFor(fn, { timeout: 5000, interval: 25 });

  function configure(mock = true): void {
    TestBed.configureTestingModule({
      providers: [
        provideRouter([]),
        { provide: ConfigService, useValue: configStub({ mock }) },
        { provide: I18n, useValue: { lang, t, use: async (l: 'th' | 'en') => lang.set(l) } },
        { provide: AuthService, useValue: { session } },
        { provide: PermissionService, useValue: { has: () => allowed } },
      ],
    });
    navigateSpy = vi.spyOn(TestBed.inject(Router), 'navigateByUrl').mockResolvedValue(true);
    routeSpy = vi.spyOn(TestBed.inject(Router), 'navigate').mockResolvedValue(true);
  }

  /** the host of one form, mounted in the document (the pop-ups the scripts move to <body> need it) */
  async function mount(view: ViewType): Promise<void> {
    configure();
    fixture = TestBed.createComponent(view);
    document.body.appendChild(fixture.nativeElement);
    fixture.detectChanges();
    el = fixture.nativeElement as HTMLElement;
  }

  beforeEach(() => {
    resetMockSalesDoc();
    lang.set('th');
    allowed = true;
    calls = [];
    swalCalls = [];
    FakeIntersectionObserver.all = [];
    vi.stubGlobal('IntersectionObserver', FakeIntersectionObserver);
    // jsdom does not scroll
    Element.prototype.scrollIntoView = vi.fn();
    // the backend chunk, the helper script of the Java head and SweetAlert are the host's to provide — the stand-ins record what the page asks for
    const proto = SalesDocFormBase.prototype as unknown as { backend(fault: string): Promise<SalesDocBackend>; loadHelpers(): Promise<unknown>; swal(o: Record<string, unknown>): Promise<unknown> };
    vi.spyOn(proto, 'backend').mockImplementation(async (fault: string) => {
      const real = createMockSalesDoc({ delayMs: 0, fault });
      return { fetch: (input, init) => (calls.push({ url: input, method: (init?.method ?? 'GET').toUpperCase(), body: init?.body as string | undefined }), real.fetch(input, init)) };
    });
    vi.spyOn(proto, 'loadHelpers').mockResolvedValue(undefined);
    vi.spyOn(proto, 'swal').mockImplementation((o) => (swalCalls.push(o), Promise.resolve(undefined)));
  });
  afterEach(() => {
    fixture?.destroy();
    fixture?.nativeElement.remove();
    TestBed.resetTestingModule();
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  describe.each(FORMS)('$type', ({ type, view, paper, rows, add }) => {
    it('renders the Java form and starts its engine: the sheet, the table of the lines, the products / vehicles from the backend', async () => {
      await mount(view);
      await settle(() => expect($$(rows).length).toBeGreaterThan(0));
      expect($(paper)).toBeTruthy();
      expect($('.qt-back').getAttribute('href')).toBe(`/sales/docs/${type}`);
      if (type === 'aq' || type === 'ad') {
        // the master data of the auto-dealer forms is fetched from the file the Java page fetches
        await settle(() => expect(calls.map((c) => c.url)).toContain('/resources/mock/auto_dealer_master.json'));
        const vtype = $<HTMLSelectElement>(`${rows} [data-f="vtype"]`);
        await settle(() => expect(vtype.options.length).toBeGreaterThan(1));
      } else {
        await settle(() => expect(calls.map((c) => c.url)).toContain('/rvapi?action=materials'));
        const item = $<HTMLSelectElement>(`${rows} [data-f="item"]`);
        await settle(() => expect([...item.options].map((o) => o.value)).toContain('ACC-A001'));
      }
    });

    it('the add button adds a line / a vehicle', async () => {
      await mount(view);
      await settle(() => expect($$(rows).length).toBe(1));
      $(add).click();
      expect($$(rows).length).toBe(2);
    });

    it('a field that is not valid shows its message under it when the user leaves it (the shared validation of the Java forms)', async () => {
      await mount(view);
      await settle(() => expect($$(rows).length).toBeGreaterThan(0));
      const field = $<HTMLInputElement>(type === 'aq' || type === 'ad' ? `#${type}FinPkg` : `#${type}Remarks`);
      field.dispatchEvent(new FocusEvent('focusin', { bubbles: true }));
      field.value = 'a<b>';
      field.dispatchEvent(new Event('input', { bubbles: true }));
      field.dispatchEvent(new Event('change', { bubbles: true }));
      field.dispatchEvent(new FocusEvent('focusout', { bubbles: true }));
      await settle(() => expect(field.classList.contains('qm-invalid')).toBe(true));
    });

    it('an empty document cannot be saved: the red bar says what is missing and the "saved" pop-up stays shut', async () => {
      await mount(view);
      await settle(() => expect($$(rows).length).toBeGreaterThan(0));
      ($<HTMLElement>(`#${type}SaveBtn`) ?? $<HTMLElement>(`#${type}SaveTopBtn`)).click();
      await settle(() => expect(document.getElementById('sdBar')).toBeTruthy());
      expect(document.getElementById('sdBar')!.className).toContain('qm-bar');
      expect($(`#${type}SavedModal`).classList.contains('qm-open')).toBe(false);
    });

    it('the save button is for those who may create documents (FEATURE_CRM_Document)', async () => {
      allowed = false;
      await mount(view);
      await settle(() => expect($$(rows).length).toBeGreaterThan(0));
      expect(el.querySelector(`#${type}SaveBtn, #${type}SaveTopBtn`)).toBeNull();
    });

    it('the link back to the list goes through the router (no page load)', async () => {
      await mount(view);
      const click = new MouseEvent('click', { bubbles: true, cancelable: true, button: 0 });
      $('.qt-back').dispatchEvent(click);
      expect(click.defaultPrevented).toBe(true);
      expect(navigateSpy).toHaveBeenCalledWith(`/sales/docs/${type}`);
    });

    it('the Java link to the form is the route of the page (javaLinkToRoute)', () => {
      expect(javaLinkToRoute(`sales_doc_${type}_form.xhtml?navbar_menu=navbar_menu_sale`)).toBe(`/sales/docs/${type}/new`);
    });

    it('leaving the screen takes everything back: window.SalesDoc*, the pop-ups on <body>, listeners, timers, observers', async () => {
      const added: [object, string, unknown][] = [];
      const removed: [object, string, unknown][] = [];
      for (const target of [document, window] as EventTarget[]) {
        const add_ = target.addEventListener.bind(target);
        const rm = target.removeEventListener.bind(target);
        vi.spyOn(target, 'addEventListener').mockImplementation(((ty: string, fn: unknown, opts?: unknown) => (added.push([target, ty, fn]), add_(ty, fn as never, opts as never))) as never);
        vi.spyOn(target, 'removeEventListener').mockImplementation(((ty: string, fn: unknown, opts?: unknown) => (removed.push([target, ty, fn]), rm(ty, fn as never, opts as never))) as never);
      }
      const timers = new Set<unknown>();
      const st = window.setTimeout.bind(window);
      const ct = window.clearTimeout.bind(window);
      vi.spyOn(window, 'setTimeout').mockImplementation(((fn: () => void, ms?: number, ...a: unknown[]) => {
        const h = st(() => (timers.delete(h), fn()), ms, ...a);
        timers.add(h);
        return h;
      }) as never);
      vi.spyOn(window, 'clearTimeout').mockImplementation(((h: never) => (timers.delete(h), ct(h))) as never);
      const bodyBefore = [...document.body.children].filter((e) => e !== fixture.nativeElement);

      await mount(view);
      await settle(() => expect($$(rows).length).toBeGreaterThan(0));
      await settle(() => expect(calls.length).toBeGreaterThan(0));
      const published = Object.keys(window).filter((k) => /^SalesDoc[A-Z]/.test(k));
      expect(published).toEqual(expect.arrayContaining(['SalesDocValidate', 'SalesDocCustomer']));
      expect(added.length).toBeGreaterThan(0);
      // the pop-ups were moved out of the (transformed) layout, to <body>
      expect(document.body.querySelector(`:scope > #${type}SearchModal`)).toBeTruthy();
      // … and are marked as parts of a page generated from Java (the shell's `button:disabled` cursor rule skips those)
      expect(document.body.querySelector(`:scope > #${type}SearchModal`)!.hasAttribute('data-java-page')).toBe(true);

      fixture.destroy();
      expect(Object.keys(window).filter((k) => /^SalesDoc[A-Z]/.test(k))).toEqual([]);
      expect(document.body.querySelector(`:scope > #${type}SearchModal`)).toBeNull();
      const bodyAfter = [...document.body.children].filter((e) => e !== fixture.nativeElement);
      expect(bodyAfter.map((e) => e.id || e.tagName)).toEqual(bodyBefore.map((e) => e.id || e.tagName));
      const open = added.filter(([tg, ty, fn]) => !removed.some(([rt, rty, rfn]) => rt === tg && rty === ty && rfn === fn));
      expect(open.filter(([, ty]) => ['click', 'keydown', 'input', 'change', 'focusout', 'resize', 'scroll'].includes(ty)).map(([, ty]) => ty)).toEqual([]);
      expect(FakeIntersectionObserver.all.every((o) => o.disconnected)).toBe(true);
      // nothing is left to fire after the page was left
      await new Promise((r) => setTimeout(r, 400));
      expect(timers.size).toBe(0);
    });

    it('an answer that comes after the screen was left paints nothing', async () => {
      vi.spyOn(SalesDocFormBase.prototype as unknown as { backend(f: string): Promise<SalesDocBackend> }, 'backend').mockImplementation(async (fault: string) => {
        const real = createMockSalesDoc({ delayMs: 150, fault });
        return { fetch: (input, init) => real.fetch(input, init) };
      });
      await mount(view);
      await settle(() => expect($$(rows).length).toBeGreaterThan(0));
      const body = $(rows.split(' ')[0]);
      const before = body.innerHTML;
      fixture.destroy();
      await new Promise((r) => setTimeout(r, 500));
      expect(body.innerHTML).toBe(before);
    });
  });

  it('puts the stylesheet of the system dropdown back at the end of <head> (in Java it comes after the sheets of the page)', async () => {
    const st = document.createElement('style');
    st.id = 'odsCss';
    document.head.appendChild(st);
    try {
      await mount(SalesDocQtView);
      await settle(() => expect(document.head.lastElementChild).toBe(st));
    } finally {
      st.remove();
    }
  });

  describe('the saved document (there is no save API: the Java forms open the pop-up with a provisional number)', () => {
    it('quotation: a valid document shows the "saved" pop-up with the provisional number and the notice that nothing was stored', async () => {
      await mount(SalesDocQtView);
      await settle(() => expect($$('#qtItems tr').length).toBe(1));
      const typ = (e: HTMLInputElement | HTMLSelectElement, v: string) => {
        e.dispatchEvent(new FocusEvent('focusin', { bubbles: true }));
        e.value = v;
        for (const n of ['input', 'change']) e.dispatchEvent(new Event(n, { bubbles: true }));
        e.dispatchEvent(new FocusEvent('focusout', { bubbles: true }));
      };
      // a customer made in the pop-up (the Java page has no customer API of its own: the customer form is part of the document)
      $('#qtCustSearchBtn').click();
      await settle(() => expect($$('#qtResultBody [data-pick]').length).toBeGreaterThan(0));
      $('#qtToCreate').click();
      typ($<HTMLInputElement>('#qtFName'), 'บริษัท ทดสอบ จำกัด');
      typ($<HTMLInputElement>('#qtFTaxId'), '1234567890121');
      typ($<HTMLInputElement>('#qtFAddr'), '99/9 ถนนสุขุมวิท กรุงเทพ');
      $('#qtFormSubmit').click();
      await settle(() => expect($('#qtCName').textContent!.trim()).toBe('บริษัท ทดสอบ จำกัด'));
      const item = $<HTMLSelectElement>('#qtItems [data-f="item"]');
      await settle(() => expect([...item.options].map((o) => o.value)).toContain('ACC-A001'));
      typ(item, 'ACC-A001');
      typ($<HTMLInputElement>('#qtItems [data-f="qty"]'), '2');
      typ($<HTMLSelectElement>('#qtCType'), 'cash');
      const debug = vi.spyOn(console, 'debug').mockImplementation(() => undefined);
      $('#qtSaveBtn').click();
      await settle(() => expect($('#qtSavedModal').classList.contains('qm-open')).toBe(true));
      expect($('#qtSavedNo').textContent).toMatch(/^QT:M00-\d{4}-00000$/);
      expect($('#qtSavedNote').hidden).toBe(false);
      expect($('#qtSavedNote').textContent).toBe('label.sdn.not_persisted');
      // the document the page built (nothing is sent anywhere): the totals are the ones of the screen
      const payload = JSON.stringify(debug.mock.calls);
      expect(payload).toContain('ACC-A001');
      expect(payload).toContain('2185');
      // "back to the list" is the router, the address is the list of the type
      $('#qtSavedList').click();
      expect(navigateSpy).toHaveBeenCalledWith('/sales/docs/qt');
    });
  });

  describe('the route (/sales/docs/:type/:id)', () => {
    const route = async (type: string | undefined, mock = true): Promise<ComponentFixture<SalesDocForm>> => {
      configure(mock);
      const f = TestBed.createComponent(SalesDocForm);
      f.componentRef.setInput('type', type);
      f.componentRef.setInput('id', 'new');
      document.body.appendChild(f.nativeElement);
      f.detectChanges();
      fixture = f as ComponentFixture<unknown>;
      el = f.nativeElement as HTMLElement;
      return f;
    };

    it.each(FORMS)('$type is its own view (a lazy chunk)', async ({ type, view }) => {
      const f = await route(type);
      await settle(() => expect(f.debugElement.query(By.directive(view))).toBeTruthy());
      expect(el.querySelectorAll('ts-sales-doc-qt-view, ts-sales-doc-bk-view, ts-sales-doc-ob-view, ts-sales-doc-aq-view, ts-sales-doc-ad-view')).toHaveLength(1);
    });

    it('an :id that is not a number the mockup kept shows the not-found notice of the detail page, not the form', async () => {
      configure();
      const f = TestBed.createComponent(SalesDocForm);
      f.componentRef.setInput('type', 'qt');
      f.componentRef.setInput('id', '12345');
      document.body.appendChild(f.nativeElement);
      f.detectChanges();
      fixture = f as ComponentFixture<unknown>;
      el = f.nativeElement as HTMLElement;
      await settle(() => expect(el.querySelector('ts-sales-doc-detail')).not.toBeNull());
      expect($$('#qtItems tr')).toHaveLength(0);
    });

    it.each(['so', 'QT', 'rv', 'qt/new', 'abc'])('type %j is not one of the five: no page in Java, the not-found page of the app', async (type) => {
      const f = await route(type);
      await settle(() => expect(routeSpy).toHaveBeenCalledWith(['/not-found'], { skipLocationChange: true }));
      expect(el.querySelector('ts-sales-doc-qt-view, ts-sales-doc-bk-view, ts-sales-doc-ob-view, ts-sales-doc-aq-view, ts-sales-doc-ad-view')).toBeNull();
      f.destroy();
    });

    it('a known type does not go to the not-found page', async () => {
      const f = await route('ob');
      await settle(() => expect(f.debugElement.query(By.directive(SalesDocObView))).toBeTruthy());
      expect(routeSpy).not.toHaveBeenCalled();
    });

    it('shows nothing of the page (the "live adapter is missing" box) when the backend is not the mock', async () => {
      await route('qt', false);
      expect(el.querySelector('ts-live-missing')).toBeTruthy();
      expect(el.querySelector('ts-sales-doc-qt-view')).toBeNull();
    });

    it('a language switch is a page reload in Java: a NEW page instance (the scripts read their texts once)', async () => {
      const f = await route('qt');
      await settle(() => expect(f.debugElement.query(By.directive(SalesDocQtView))).toBeTruthy());
      await settle(() => expect($$('#qtItems tr').length).toBe(1));
      const first = f.debugElement.query(By.directive(SalesDocQtView)).componentInstance;
      lang.set('en');
      f.detectChanges();
      await settle(() => expect(f.debugElement.query(By.directive(SalesDocQtView))?.componentInstance).not.toBe(first));
      await settle(() => expect($$('#qtItems tr').length).toBe(1));
      expect(el.querySelectorAll('ts-sales-doc-qt-view')).toHaveLength(1);
      // the first one was torn down with its pop-ups: one set of them on <body>
      expect(document.querySelectorAll('#qtSearchModal')).toHaveLength(1);
      // another type is another instance
      f.componentRef.setInput('type', 'bk');
      f.detectChanges();
      await settle(() => expect(f.debugElement.query(By.directive(SalesDocBkView))).toBeTruthy());
      expect(document.querySelectorAll('#qtSearchModal')).toHaveLength(0);
    });
  });
});
