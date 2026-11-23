import { signal } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { By } from '@angular/platform-browser';
import { Router, provideRouter } from '@angular/router';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ConfigService } from '@core/config/config.service';
import { I18n } from '@core/i18n/i18n.service';
import { javaLinkToRoute } from '@core/navigation/java-links';
import { PermissionService } from '@core/permissions/permission.service';
import { configStub } from '@core/testing/test-helpers';
import { SalesDocList } from './sales-doc-list';
import { SalesDocListView } from './sales-doc-list-view';
import { SalesDocRow } from '../sales-doc-types';
import type { SalesDocListBackend } from './sales-doc-list-backend';

const lang = signal<'th' | 'en'>('th');
// a key stands for its text, except the text the empty row shows
const t = (k: string) => k;

describe('Sales-document list (pages/sales_doc_type_list.xhtml, generated)', () => {
  let fixture: ComponentFixture<SalesDocList>;
  let el: HTMLElement;
  let allowed: boolean;
  let navigateSpy: ReturnType<typeof vi.fn>;
  let swalCalls: Array<Record<string, unknown>>;

  const $ = <T extends HTMLElement = HTMLElement>(sel: string) => el.querySelector<T>(sel)!;
  const $$ = <T extends HTMLElement = HTMLElement>(sel: string) => [...el.querySelectorAll<T>(sel)];
  const settle = (fn: () => void) => vi.waitFor(fn, { timeout: 4000, interval: 20 });

  async function create(type: string | undefined, mock = true): Promise<void> {
    TestBed.configureTestingModule({
      providers: [
        provideRouter([]),
        { provide: ConfigService, useValue: configStub({ mock }) },
        { provide: I18n, useValue: { lang, t, use: async (l: 'th' | 'en') => lang.set(l) } },
        { provide: PermissionService, useValue: { has: () => allowed } },
      ],
    });
    navigateSpy = vi.spyOn(TestBed.inject(Router), 'navigateByUrl').mockResolvedValue(true);
    fixture = TestBed.createComponent(SalesDocList);
    fixture.componentRef.setInput('type', type);
    document.body.appendChild(fixture.nativeElement);
    fixture.detectChanges();
    el = fixture.nativeElement as HTMLElement;
  }

  beforeEach(() => {
    lang.set('th');
    allowed = true;
    swalCalls = [];
    // SweetAlert is a script the Java template loads: a stand-in (jsdom loads no scripts)
    vi.spyOn(SalesDocListView.prototype as unknown as { swal(o: Record<string, unknown>): Promise<unknown> }, 'swal').mockImplementation((o) => (swalCalls.push(o), Promise.resolve(undefined)));
  });
  afterEach(() => {
    fixture?.destroy();
    fixture?.nativeElement.remove();
    TestBed.resetTestingModule();
    vi.restoreAllMocks();
  });

  describe.each([
    ['qt', 'label.topbar.sales_doc.quotation', 'label.qtl.create_qt', 7],
    ['bk', 'label.topbar.sales_doc.booking', 'label.qtl.create_bk', 8],
    ['ob', 'label.sales_doc_tab.delivery', 'label.qtl.create_ob', 7],
    ['aq', 'label.ad.tab_aq', 'label.qtl.create_aq', 7],
    ['ad', 'label.ad.tab_ad', 'label.qtl.create_ad', 7],
  ])('type %s', (type, title, create_, cols) => {
    it('is the markup of the Java page: title, the button that creates a document, the columns, an empty table', async () => {
      await create(type);
      await settle(() => expect($$('#qmlBody tr')).toHaveLength(1));
      expect($('.qml-title').textContent).toContain(title);
      const add = $<HTMLAnchorElement>('#qmlAddBtn');
      expect(add.getAttribute('href')).toBe(`/sales/docs/${type}/new`);
      expect(add.textContent).toContain(create_);
      expect($$('.qml-table thead th')).toHaveLength(cols);
      // the Java page has no list API: no rows, the "no data" row spans every column
      const empty = $('#qmlBody tr.qml-empty td');
      expect(empty.getAttribute('colspan')).toBe(String(cols));
      expect(empty.textContent).toBe('label.dashboard.no_data');
    });
  });

  it('bookings have the reference column, the others do not', async () => {
    await create('bk');
    expect($$('.qml-table thead th').map((h) => h.textContent!.trim())).toContain('label.cv.ref_qt');
    fixture.destroy();
    TestBed.resetTestingModule();
    await create('qt');
    expect($$('.qml-table thead th').map((h) => h.textContent!.trim())).not.toContain('label.cv.ref_qt');
    expect($$('.qml-table thead th')).toHaveLength(7);
  });

  it('the button of the document list is for those who may create documents (FEATURE_CRM_Document)', async () => {
    allowed = false;
    await create('qt');
    await settle(() => expect($$('#qmlBody tr')).toHaveLength(1));
    expect(el.querySelector('#qmlAddBtn')).toBeNull();
  });

  it('the create button goes to the form through the router, not a page load', async () => {
    await create('ob');
    const click = new MouseEvent('click', { bubbles: true, cancelable: true, button: 0 });
    $('#qmlAddBtn').dispatchEvent(click);
    expect(click.defaultPrevented).toBe(true);
    expect(navigateSpy).toHaveBeenCalledWith('/sales/docs/ob/new');
    // a click with a modifier key is the browser's (new tab)
    const ctrl = new MouseEvent('click', { bubbles: true, cancelable: true, button: 0, ctrlKey: true });
    $('#qmlAddBtn').dispatchEvent(ctrl);
    expect(ctrl.defaultPrevented).toBe(false);
    expect(navigateSpy).toHaveBeenCalledTimes(1);
  });

  it('the Java links of the other pages arrive at these routes (javaLinkToRoute)', () => {
    expect(javaLinkToRoute('sales_doc_type_list.xhtml?navbar_menu=navbar_menu_sale&doc=bk')).toBe('/sales/docs/bk');
    expect(javaLinkToRoute('/triplesale/pages/sales_doc_type_list.xhtml?doc=ad')).toBe('/sales/docs/ad');
    for (const tp of ['qt', 'bk', 'ob', 'aq', 'ad']) expect(javaLinkToRoute(`sales_doc_${tp}_form.xhtml?navbar_menu=navbar_menu_sale`)).toBe(`/sales/docs/${tp}/new`);
  });

  describe('any other type is the legacy list', () => {
    it.each([undefined, '', 'so', 'QT', 'rv'])('type %j', async (type) => {
      await create(type);
      await settle(() => expect($$('#sd2Body tr.sdt-empty')).toHaveLength(1));
      expect(el.querySelector('.qml-root')).toBeNull();
      expect($('#sd2Body tr.sdt-empty td').textContent).toBe('label.dashboard.no_data');
      // the button that adds a document is gated like the create buttons
      expect(el.querySelector('#sd2AddBtn')).toBeTruthy();
    });

    it('the search pill opens and closes, the menus toggle and close on a click elsewhere', async () => {
      await create('zz');
      await settle(() => expect($$('#sd2Body tr')).toHaveLength(1));
      const wrap = $('#sd2Search');
      $('#sd2SearchBtn').click();
      expect(wrap.classList.contains('open')).toBe(true);
      const input = $<HTMLInputElement>('#sd2SearchInput');
      input.value = 'abc';
      input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
      expect(wrap.classList.contains('open')).toBe(false);
      expect(input.value).toBe('');

      $('#sd2ProductBtn').click();
      expect($('#sd2ProductMenu').classList.contains('show')).toBe(true);
      $('#sd2FilterBtn').click(); // the other menu: the first one closes
      expect($('#sd2ProductMenu').classList.contains('show')).toBe(false);
      expect($('#sd2FilterMenu').classList.contains('show')).toBe(true);
      document.body.click();
      expect($('#sd2FilterMenu').classList.contains('show')).toBe(false);
    });

    it('the footer counts what the filter shows', async () => {
      await create('zz');
      await settle(() => expect($$('#sd2Body tr')).toHaveLength(1));
      $<HTMLInputElement>('#sd2SearchInput').dispatchEvent(new Event('input'));
      expect($('.sd2-foot span').textContent).toBe('label.rv.showing');
    });

    it('the table is dragged to scroll, until the screen is left', async () => {
      await create('zz');
      await settle(() => expect($$('#sd2Body tr')).toHaveLength(1));
      const wrap = $('.sd2-table-wrap');
      expect(wrap.getAttribute('data-ds-bound')).toBe('1');
      fixture.destroy();
      expect(wrap.hasAttribute('data-ds-bound')).toBe(false);
    });
  });

  it('shows nothing of the page (the "live adapter is missing" box) when the backend is not the mock', async () => {
    await create('qt', false);
    expect(el.querySelector('ts-live-missing')).toBeTruthy();
    expect(el.querySelector('ts-sales-doc-list-view')).toBeNull();
  });

  it('a language switch is a page reload in Java: a NEW page instance (the script reads its texts once)', async () => {
    await create('qt');
    await settle(() => expect($$('#qmlBody tr')).toHaveLength(1));
    const first = fixture.debugElement.query(By.directive(SalesDocListView)).componentInstance;
    lang.set('en');
    fixture.detectChanges();
    await settle(() => expect(fixture.debugElement.query(By.directive(SalesDocListView))?.componentInstance).not.toBe(first));
    await settle(() => expect($$('#qmlBody tr')).toHaveLength(1));
    expect($$('ts-sales-doc-list-view')).toHaveLength(1);
    // another type of the same route is a new instance too
    const second = fixture.debugElement.query(By.directive(SalesDocListView)).componentInstance;
    fixture.componentRef.setInput('type', 'bk');
    fixture.detectChanges();
    await settle(() => expect(fixture.debugElement.query(By.directive(SalesDocListView)).componentInstance).not.toBe(second));
    await settle(() => expect($$('#qmlAddBtn')[0]?.getAttribute('href')).toBe('/sales/docs/bk/new'));
  });

  describe('leaving the page', () => {
    it('removes every listener and timer it put on the document / window', async () => {
      const added: [object, string, unknown][] = [];
      const removed: [object, string, unknown][] = [];
      for (const target of [document, window] as EventTarget[]) {
        const add = target.addEventListener.bind(target);
        const rm = target.removeEventListener.bind(target);
        vi.spyOn(target, 'addEventListener').mockImplementation(((type: string, fn: unknown, opts?: unknown) => (added.push([target, type, fn]), add(type, fn as never, opts as never))) as never);
        vi.spyOn(target, 'removeEventListener').mockImplementation(((type: string, fn: unknown, opts?: unknown) => (removed.push([target, type, fn]), rm(type, fn as never, opts as never))) as never);
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

      await create('zz'); // the legacy list is the one with document listeners
      await settle(() => expect($$('#sd2Body tr')).toHaveLength(1));
      expect(added.some(([, type]) => type === 'click')).toBe(true);
      expect((window as unknown as Record<string, unknown>)['sdtApplyFilters']).toBeTypeOf('function');
      fixture.destroy();
      expect((window as unknown as Record<string, unknown>)['sdtApplyFilters']).toBeUndefined();
      const open = added.filter(([tg, type, fn]) => !removed.some(([rt, rtype, rfn]) => rt === tg && rtype === type && rfn === fn));
      // what Angular itself listens to (zone / test harness) is not ours: only the page's click listener matters
      expect(open.filter(([, type]) => type === 'click').map(([, type]) => type)).toEqual([]);
    });

    it('a table that was started after the screen was left paints nothing', async () => {
      await create('qt');
      const body = $('#qmlBody');
      fixture.destroy();
      await new Promise((r) => setTimeout(r, 200));
      expect(body.querySelector('tr')).toBeNull();
    });
  });

  it('rows given by a backend are drawn like the Java script draws them (the contract for the day an API exists)', async () => {
    const rows: SalesDocRow[] = [{ no: 'QT:M00-2610-00001', date: '2026-10-19', customer: 'บริษัท <ทดสอบ> จำกัด', employee: 'สมชาย', total: 1092.5, status: 'draft', isNew: true }];
    vi.spyOn(SalesDocListView.prototype as unknown as { backend(): Promise<SalesDocListBackend> }, 'backend').mockResolvedValue({ list: () => Promise.resolve(rows) });
    await create('qt');
    await settle(() => expect($$('#qmlBody tr td.qml-no')).toHaveLength(1));
    const tr = $('#qmlBody tr');
    expect(tr.classList.contains('qml-new')).toBe(true);
    expect([...tr.querySelectorAll('td')].map((td) => td.textContent)).toEqual(['QT:M00-2610-00001', '19/10/2026', 'บริษัท <ทดสอบ> จำกัด', 'สมชาย', '1,092.50', 'draft', '', '']);
    // the customer name is text, not markup
    expect(tr.querySelector('b, script')).toBeNull();
    // there is no print handler yet: the button is disabled
    expect(tr.querySelector<HTMLButtonElement>('.qml-pbtn')!.disabled).toBe(true);
  });
});
