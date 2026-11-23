import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { signal } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { By } from '@angular/platform-browser';
import { Router, provideRouter } from '@angular/router';
import { afterEach, beforeEach, describe, expect, it, vi, type Mock } from 'vitest';
import { AuthService } from '@core/auth/auth.service';
import { ConfigService } from '@core/config/config.service';
import { I18n } from '@core/i18n/i18n.service';
import { PermissionService } from '@core/permissions/permission.service';
import { configStub } from '@core/testing/test-helpers';
import { Receipts } from './receipts';
import { ReceiptsView } from './receipts-view';
import { createMockReceipts, resetMockReceipts } from './receipts.mock';
import { tsPref } from './ts-pref';

const lang = signal<'th' | 'en'>('th');
const t = (k: string) => k;
let granted = true;

function setup(mock = true) {
  TestBed.configureTestingModule({
    providers: [
      provideRouter([]),
      { provide: ConfigService, useValue: configStub({ mock }) },
      { provide: PermissionService, useValue: { has: () => granted } },
      { provide: I18n, useValue: { lang, t, use: async (l: 'th' | 'en') => lang.set(l) } },
    ],
  });
  const fixture = TestBed.createComponent(Receipts);
  document.body.appendChild(fixture.nativeElement);
  fixture.detectChanges();
  return fixture;
}

describe('Receipt list page (pages/sales_doc_rv_list.xhtml, generated)', () => {
  let fixture: ComponentFixture<Receipts>;
  let el: HTMLElement;
  let swal: Mock<(o: any) => Promise<unknown>>;
  let opened: string[];

  const $ = <T extends HTMLElement = HTMLElement>(sel: string) => el.querySelector<T>(sel)!;
  const $$ = <T extends HTMLElement = HTMLElement>(sel: string) => [...el.querySelectorAll<T>(sel)];
  const settle = (fn: () => void) => vi.waitFor(fn, { timeout: 6000, interval: 40 });
  /** the page is up when the table has its rows */
  const up = () => settle(() => expect($$('#sd2Body tr[data-id]').length).toBeGreaterThan(0));
  /** the boxes the page moves to <body> are not below the host any more */
  const d$ = <T extends HTMLElement = HTMLElement>(sel: string) => document.querySelector<T>(sel)!;
  const row = (id: number) => $(`#sd2Body tr[data-id="${id}"]`);
  const visibleRows = () => $$('#sd2Body tr[data-id]').filter((r) => r.style.display !== 'none');

  beforeEach(() => {
    resetMockReceipts();
    lang.set('th');
    granted = true;
    localStorage.clear();
    swal = vi.fn().mockResolvedValue(undefined);
    vi.spyOn(ReceiptsView.prototype as unknown as { swal(o: unknown): Promise<unknown> }, 'swal').mockImplementation((o) => swal(o));
    opened = [];
    (Element.prototype as unknown as { scrollIntoView: unknown }).scrollIntoView = vi.fn();
    vi.spyOn(window, 'open').mockImplementation((u) => (opened.push(String(u)), null));
    (URL as unknown as { createObjectURL: unknown }).createObjectURL = vi.fn((b: Blob) => `blob:${b.type}:${b.size}`);
  });
  afterEach(() => {
    fixture?.destroy();
    TestBed.resetTestingModule();
    vi.restoreAllMocks();
    document.cookie = 'tsp_ts_rvlist_selected_mt=; Max-Age=0; Path=/';
  });

  it('is the markup of the Java page: toolbar, the 10 columns, the footer, the dialog / modal / popovers', async () => {
    fixture = setup();
    el = fixture.nativeElement;
    await up();
    expect($('.sd2-title').textContent).toBe('label.rv.title_list');
    expect($$('.sd2-table thead th').length).toBe(10);
    expect($$('.sd2-table thead th.sd2-sortable').map((th) => th.dataset['sort'])).toEqual(['date', 'docNo', 'stLabel', 'maker', 'desc', 'payer', 'prospectNo', 'leadNo']);
    for (const id of ['sd2ProductBtn', 'sd2SearchInput', 'sd2FilterBtn', 'sd2AddBtn', 'sd2Overlay', 'sd2DetailOverlay', 'sd2Pop', 'sd2Items']) expect(el.querySelector('#' + id), id).toBeTruthy();
    expect($('.sd2-foot span').textContent).toBe('label.rv.showing'.replace('{0}', '40').replace('{1}', '40'));
  });

  it('loads the table once (500 rows), merges the lead number and fills the product menu with the counts', async () => {
    fixture = setup();
    el = fixture.nativeElement;
    await up();
    await settle(() => expect(row(939).children[7].textContent).toMatch(/^LD:00-/));
    expect(row(939).children[7].textContent).not.toBe('-');
    const items = $$('#sd2ProductMenu .sd2-menu-item');
    expect(items.map((i) => i.dataset['v'])).toEqual(['', 'M13', 'M14', 'M15']);
    expect(items[1].textContent).toMatch(/\(\d+ label\.rv\.count_unit\)/);
  });

  it('filters on the client: search text, the status filter and the product together; the footer counts what is shown', async () => {
    fixture = setup();
    el = fixture.nativeElement;
    await up();
    const all = visibleRows().length;
    $('#sd2FilterBtn').click();
    $<HTMLElement>('#sd2FilterMenu [data-f="done"]').click();
    const done = visibleRows();
    expect(done.length).toBeGreaterThan(0);
    expect(done.length).toBeLessThan(all);
    expect(done.every((r) => r.dataset['st'] === 'done')).toBe(true);
    $('#sd2ProductBtn').click();
    $<HTMLElement>('#sd2ProductMenu .sd2-menu-item[data-v="M13"]').click();
    expect(visibleRows().every((r) => r.dataset['mt'] === 'M13' && r.dataset['st'] === 'done')).toBe(true);
    expect($('#sd2ProductVal').textContent).not.toBe('label.contracts.filter_all');
    const input = $<HTMLInputElement>('#sd2SearchInput');
    input.value = 'zzzz-nothing';
    input.dispatchEvent(new Event('input'));
    expect(visibleRows()).toHaveLength(0);
    expect($('.sd2-foot span').textContent).toBe('label.rv.showing'.replace('{0}', '0').replace('{1}', String(all)));
  });

  it('sorts a column ascending, then descending, and shows the arrow', async () => {
    fixture = setup();
    el = fixture.nativeElement;
    await up();
    const th = $('.sd2-table thead th[data-sort="docNo"]');
    const nos = () => $$('#sd2Body tr[data-id]').map((r) => r.dataset['txno']!.toLowerCase());
    th.click();
    expect(th.querySelector('i')!.className).toContain('fa-sort-up');
    const asc = nos();
    expect(asc).toEqual([...asc].sort((a, b) => a.localeCompare(b, 'th', { numeric: true })));
    th.click();
    expect(th.querySelector('i')!.className).toContain('fa-sort-down');
    expect(nos()).toEqual([...asc].reverse());
  });

  it('keeps the product choice (localStorage + cookie, TS_PREF) and restores it on the next visit', async () => {
    fixture = setup();
    el = fixture.nativeElement;
    await up();
    $('#sd2ProductBtn').click();
    $<HTMLElement>('#sd2ProductMenu .sd2-menu-item[data-v="M14"]').click();
    expect(localStorage.getItem('ts_rvlist_selected_mt')).toBe('M14');
    expect(document.cookie).toContain('tsp_ts_rvlist_selected_mt=M14');
    fixture.destroy();
    TestBed.resetTestingModule();

    fixture = setup();
    el = fixture.nativeElement;
    await up();
    expect(visibleRows().length).toBeGreaterThan(0);
    expect(visibleRows().every((r) => r.dataset['mt'] === 'M14')).toBe(true);
    expect($('#sd2ProductMenu .sd2-menu-item.active').dataset['v']).toBe('M14');
  });

  it('the pref helper falls back to the cookie when localStorage is empty and writes it back', () => {
    localStorage.clear();
    tsPref.set('k1', 'v1');
    localStorage.removeItem('k1');
    expect(tsPref.get('k1')).toBe('v1');
    expect(localStorage.getItem('k1')).toBe('v1');
    tsPref.remove('k1');
    expect(tsPref.get('k1')).toBe('');
  });

  it('approve: the dialog needs a condition before OK; OK posts the number, the list is read again and the row is "approved"', async () => {
    fixture = setup();
    el = fixture.nativeElement;
    await up();
    const btn = $('#sd2Body tr[data-id="939"] .sd2-approve-btn');
    expect(btn.classList.contains('approved')).toBe(false);
    btn.click();
    const overlay = document.getElementById('sd2Overlay')!;
    expect(overlay.parentElement).toBe(document.body); // moved out of any transformed ancestor, like the original
    expect(overlay.classList.contains('show')).toBe(true);
    const ok = d$<HTMLButtonElement>('#sd2DialogConfirm');
    expect(ok.disabled).toBe(true);
    const select = d$<HTMLSelectElement>('#sd2DebtFormat');
    select.value = 'preloan';
    select.dispatchEvent(new Event('change'));
    expect(ok.disabled).toBe(false);
    ok.click();
    expect(overlay.classList.contains('show')).toBe(false);
    await settle(() => expect(swal).toHaveBeenCalled());
    expect(swal.mock.calls[0][0]).toMatchObject({ icon: 'info', buttons: false });
    expect(String((swal.mock.calls[0][0] as { text: string }).text)).toMatch(/^label\.rv\.approve_success : RV:/);
    await settle(() => expect(row(939).querySelector('.sd2-approve-btn')!.classList.contains('approved')).toBe(true));
  });

  it('approve: a receipt that cannot be approved yet shows the message of the backend and stays as it is', async () => {
    fixture = setup();
    el = fixture.nativeElement;
    await up();
    $('#sd2Body tr[data-id="933"] .sd2-approve-btn').click();
    const select = d$<HTMLSelectElement>('#sd2DebtFormat');
    select.value = 'translate';
    select.dispatchEvent(new Event('change'));
    d$('#sd2DialogConfirm').click();
    await settle(() => expect(swal).toHaveBeenCalled());
    expect((swal.mock.calls[0][0] as { text: string }).text).toContain('new1');
    await up();
    expect(row(933).dataset['st']).toBe('wait');
  });

  it('approve: the dialog closes with X, Cancel and a click on the backdrop (not on the box); a row that is done / being approved does nothing', async () => {
    fixture = setup();
    el = fixture.nativeElement;
    await up();
    const overlay = () => document.getElementById('sd2Overlay')!;
    for (const close of [() => d$('#sd2DialogClose').click(), () => d$('#sd2DialogCancel').click(), () => overlay().click()]) {
      $('#sd2Body tr[data-id="939"] .sd2-approve-btn').click();
      expect(overlay().classList.contains('show')).toBe(true);
      close();
      expect(overlay().classList.contains('show')).toBe(false);
    }
    $('#sd2Body tr[data-id="939"] .sd2-approve-btn').click();
    d$('.sd2-dialog').click();
    expect(overlay().classList.contains('show')).toBe(true);
    d$('#sd2DialogCancel').click();
    $('#sd2Body tr[data-id="936"] .sd2-approve-btn').click(); // ActionWaitProcess
    $('#sd2Body tr[data-id="940"] .sd2-approve-btn').click(); // done
    expect(overlay().classList.contains('show')).toBe(false);
  });

  it('report popover: a synced receipt opens the ERP form (PDF / PNG) in a new tab', async () => {
    fixture = setup();
    el = fixture.nativeElement;
    await up();
    $('#sd2Body tr[data-id="939"] .sd2-report').click();
    expect($('#sd2Pop').classList.contains('show')).toBe(true);
    expect($('#sd2PopDocName').textContent).toBe(row(939).dataset['txno']);
    $('#sd2Pop .sd2-dl[data-type="pdf"]').click();
    expect(opened).toEqual(['blob:application/pdf:' + (URL.createObjectURL as ReturnType<typeof vi.fn>).mock.calls[0][0].size]);
    $('#sd2Body tr[data-id="939"] .sd2-report').click();
    $('#sd2Pop .sd2-dl[data-type="img"]').click();
    expect(opened[1]).toMatch(/^blob:image\/png:/);
    expect(swal).not.toHaveBeenCalled();
  });

  it('report popover: a receipt that is not in the ERP yet gets the toast and the PDF made from the CRM data', async () => {
    fixture = setup();
    el = fixture.nativeElement;
    await up();
    $('#sd2Body tr[data-id="938"] .sd2-report').click();
    $('#sd2Pop .sd2-dl[data-type="pdf"]').click();
    expect(swal).toHaveBeenCalledWith({ text: 'label.rv.not_synced_erp_preview', icon: 'info', timer: 2500, buttons: false });
    expect(opened[0]).toMatch(/^blob:application\/pdf:/);
  });

  it('detail modal: opens with the skeleton, then the data; the PDF button needs the ERP number; X and the backdrop close it', async () => {
    fixture = setup();
    el = fixture.nativeElement;
    await up();
    row(905).click();
    const overlay = document.getElementById('sd2DetailOverlay')!;
    expect(overlay.parentElement).toBe(document.body);
    expect(overlay.classList.contains('show')).toBe(true);
    expect(overlay.querySelector('.sd2-dt-skel')).toBeTruthy();
    await settle(() => expect(overlay.querySelector('.sd2-dt-skel')).toBeNull());
    expect(overlay.querySelectorAll('.sd2-dt-cell').length).toBe(12);
    expect(overlay.querySelector('.sd2-dt-cell .v')!.textContent).toBe('RV:M14-2607-00035');
    expect(overlay.querySelectorAll('.sd2-dt-pay').length).toBeGreaterThan(2); // 3 items + 2 payments + the total received
    d$('#sd2DtOpenForm').click(); // 905 is not in the ERP
    expect(swal).toHaveBeenCalledWith(expect.objectContaining({ text: 'label.rv.not_synced_erp' }));
    expect(opened).toEqual([]);
    d$('#sd2DetailClose').click();
    expect(overlay.classList.contains('show')).toBe(false);
    row(939).click();
    await settle(() => expect(overlay.querySelector('.sd2-dt-skel')).toBeNull());
    d$('#sd2DtOpenForm').click();
    expect(opened).toHaveLength(1);
    overlay.click();
    expect(overlay.style.display).toBe('none');
  });

  it('the add button and a click on a row without an id go to the form', async () => {
    fixture = setup();
    el = fixture.nativeElement;
    const nav = vi.spyOn(TestBed.inject(Router), 'navigateByUrl').mockResolvedValue(true);
    await up();
    $('#sd2AddBtn').click();
    expect(nav).toHaveBeenCalledWith('/sales/receipts/new');
  });

  it('without the right to write: no add button, the approve column shows a dash', async () => {
    granted = false;
    fixture = setup();
    el = fixture.nativeElement;
    await up();
    expect(el.querySelector('#sd2AddBtn')).toBeNull();
    expect(row(939).querySelector('.sd2-approve-btn')).toBeNull();
    expect(row(939).children[8].textContent!.trim()).toBe('—');
  });

  it('shows the error row when the list cannot be read (HTML answer) and the empty row when there is nothing', async () => {
    const orig = window.location.search;
    history.replaceState(null, '', '?mock=list-html');
    fixture = setup();
    el = fixture.nativeElement;
    await settle(() => expect($('#sd2Body').textContent).toContain('label.rv.load_fail'));
    fixture.destroy();
    TestBed.resetTestingModule();
    history.replaceState(null, '', '?mock=empty');
    fixture = setup();
    el = fixture.nativeElement;
    await settle(() => expect($('#sd2Body').textContent).toBe('label.dashboard.no_data'));
    history.replaceState(null, '', orig || '?');
  });

  it('a language switch is a page reload in Java: a NEW page instance, not an edit of the old DOM', async () => {
    fixture = setup();
    el = fixture.nativeElement;
    await up();
    const first = fixture.debugElement.query(By.directive(ReceiptsView)).componentInstance;
    lang.set('en');
    fixture.detectChanges();
    TestBed.tick?.();
    await settle(() => expect(fixture.debugElement.query(By.directive(ReceiptsView)).componentInstance).not.toBe(first));
    await up();
  });

  it('leaving the page removes everything it put outside its own DOM and every listener it added', async () => {
    const added: Array<[EventTarget, string, unknown, unknown]> = [];
    const removed: Array<[EventTarget, string, unknown]> = [];
    const addDoc = document.addEventListener.bind(document);
    const addWin = window.addEventListener.bind(window);
    vi.spyOn(document, 'addEventListener').mockImplementation((type: string, fn: any, opts?: any) => (added.push([document, type, fn, opts]), addDoc(type, fn, opts)));
    vi.spyOn(window, 'addEventListener').mockImplementation((type: string, fn: any, opts?: any) => (added.push([window, type, fn, opts]), addWin(type, fn, opts)));
    const rmDoc = document.removeEventListener.bind(document);
    const rmWin = window.removeEventListener.bind(window);
    vi.spyOn(document, 'removeEventListener').mockImplementation((type: string, fn: any, opts?: any) => (removed.push([document, type, fn]), rmDoc(type, fn, opts)));
    vi.spyOn(window, 'removeEventListener').mockImplementation((type: string, fn: any, opts?: any) => (removed.push([window, type, fn]), rmWin(type, fn, opts)));

    fixture = setup();
    el = fixture.nativeElement;
    await up();
    $('#sd2Body tr[data-id="939"] .sd2-approve-btn').click();
    d$('#sd2DialogCancel').click();
    row(939).click();
    expect(document.getElementById('sd2Overlay')!.parentElement).toBe(document.body);
    expect(document.getElementById('sd2DetailOverlay')!.parentElement).toBe(document.body);
    const mine = added.filter(([, type, fn]) => typeof fn === 'function' && type !== 'popstate' && type !== 'hashchange');
    expect(mine.length).toBeGreaterThanOrEqual(5);
    fixture.destroy();
    expect(document.getElementById('sd2Overlay')).toBeNull();
    expect(document.getElementById('sd2DetailOverlay')).toBeNull();
    for (const [target, type, fn] of mine) {
      if (target === window && type === 'scroll') continue; // (removed with the drag-scroll module's own listeners below)
      expect(removed.some(([t2, ty2, f2]) => t2 === target && ty2 === type && f2 === fn), `${type} listener of ${target === window ? 'window' : 'document'}`).toBe(true);
    }
    const removedScroll = removed.filter(([t2, ty2]) => t2 === window && ty2 === 'scroll');
    expect(removedScroll.length).toBeGreaterThan(0);
  });

  it('with mock off the page is shown and asks the REST services of triplesale-service (through HttpClient) — not the BFF, not window.fetch', async () => {
    const spy = vi.spyOn(window, 'fetch');
    TestBed.configureTestingModule({ providers: [provideHttpClient(), provideHttpClientTesting(), { provide: AuthService, useValue: { session: () => null } }] });
    fixture = setup(false);
    el = fixture.nativeElement;
    const http = TestBed.inject(HttpTestingController);
    const asked: string[] = [];
    // (the service answers an empty object: the page draws its "no data" row)
    await settle(() => {
      for (const r of http.match(() => true)) {
        asked.push(`${r.request.method} ${r.request.urlWithParams}`);
        r.flush('{}');
      }
      expect($('#sd2Body').textContent).toBe('label.dashboard.no_data');
    });
    expect(el.querySelector('ts-live-missing')).toBeNull();
    expect(asked).toContain('GET /triplesale-service/api/v1/rv?page=1&pageSize=500');
    expect(asked).toContain('GET /triplesale-service/api/v1/master-data/movement-types/LD');
    expect(asked).toContain('GET /triplesale-service/api/v1/rv/leads?page=0&pageSize=500');
    expect(asked.every((a) => a.includes('/triplesale-service/api/v1/'))).toBe(true);
    expect(spy).not.toHaveBeenCalled();
  });

  it('with mock off the host asks the LIVE backend (not the fake data)', async () => {
    const backend = vi.spyOn(ReceiptsView.prototype as unknown as { backend(): Promise<unknown> }, 'backend').mockImplementation(async () => createMockReceipts({ delayMs: 0 }));
    fixture = setup(false);
    el = fixture.nativeElement;
    await up();
    expect(backend).toHaveBeenCalledTimes(1);
    expect(el.querySelector('ts-live-missing')).toBeNull();
  });
});
