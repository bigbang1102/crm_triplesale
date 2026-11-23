import { signal } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { Router } from '@angular/router';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ConfigService } from '@core/config/config.service';
import { I18n } from '@core/i18n/i18n.service';
import { PermissionService } from '@core/permissions/permission.service';
import { configStub } from '@core/testing/test-helpers';
import { flash } from '../supporting-doc.flash';
import { supportingDocType } from '../supporting-doc-types';
import { SupportingDocListView } from './supporting-doc-list-view';

const lang = signal<'th' | 'en'>('th');
let granted = true;

describe('Supporting-document list (pages/sales_document.xhtml, generated)', () => {
  let fixture: ComponentFixture<SupportingDocListView>;
  let el: HTMLElement;
  let navigateByUrl: ReturnType<typeof vi.fn>;
  let cw: ReturnType<typeof vi.fn>;
  let resetState: ReturnType<typeof vi.fn>;

  const $ = <T extends HTMLElement = HTMLElement>(sel: string) => el.querySelector<T>(sel)!;
  const $$ = <T extends HTMLElement = HTMLElement>(sel: string) => [...el.querySelectorAll<T>(sel)];
  const settle = (fn: () => void) => vi.waitFor(fn, { timeout: 6000, interval: 30 });
  const rows = () => $$('#sdTableBody tr[data-name]');

  function setup(slug = 'letter-of-intent') {
    TestBed.configureTestingModule({
      providers: [
        { provide: Router, useValue: { navigateByUrl } },
        { provide: ConfigService, useValue: configStub({ mock: true }) },
        { provide: PermissionService, useValue: { has: () => granted, canUse: () => granted } },
        { provide: I18n, useValue: { lang, t: (k: string) => k } },
      ],
    });
    fixture = TestBed.createComponent(SupportingDocListView);
    document.body.appendChild(fixture.nativeElement);
    fixture.componentRef.setInput('type', supportingDocType(slug));
    fixture.detectChanges();
    el = fixture.nativeElement;
    return fixture;
  }
  const up = () => settle(() => expect(rows().length).toBeGreaterThan(0));

  beforeEach(() => {
    granted = true;
    lang.set('th');
    navigateByUrl = vi.fn();
    cw = vi.fn();
    resetState = vi.fn();
    (window as unknown as { PrimeFaces: unknown }).PrimeFaces = { cw, widgets: {}, resetState };
    // (jsdom loads no script: the host's PrimeFaces loader is replaced — the growl widget is the fake above)
    vi.spyOn(SupportingDocListView.prototype as unknown as { loadRuntime(): Promise<void> }, 'loadRuntime').mockResolvedValue(undefined);
    flash.take();
  });
  afterEach(() => {
    fixture?.destroy();
    TestBed.resetTestingModule();
    vi.restoreAllMocks();
    delete (window as unknown as { PrimeFaces?: unknown }).PrimeFaces;
    document.body.innerHTML = '';
  });

  it('is the Java page: the title, the add button, the toolbar, the table with its first rows (the first page: 20 rows)', async () => {
    setup();
    await up();
    expect($('.ct-page-title').textContent).toBe('label.topbar.support_doc.intent');
    expect($('.ct-add-btn').getAttribute('href')).toContain('/crm/supporting-docs/letter-of-intent/new');
    expect($('#ctSortBtn')).toBeTruthy();
    expect($('#ldSearch')).toBeTruthy();
    expect(rows()).toHaveLength(20);
    expect(rows()[0].textContent).toMatch(/CA-\d{5}/);
  });

  it('shows the list of another family (its own title, its own rows)', async () => {
    setup('legal-credit-request');
    await up();
    expect($('.ct-page-title').textContent).toBe('label.topbar.support_doc.legal_credit');
    expect(rows()[0].textContent).toContain('CA-00020');
  });

  it('an empty family has no rows', async () => {
    setup('loan-agreement');
    await settle(() => expect($('.ct-table')).toBeTruthy());
    expect(rows()).toHaveLength(0);
  });

  it('the growl is the PrimeFaces widget, started with the messages a save left (and only once)', async () => {
    flash.keep([{ severity: 'warn', summary: 'ข้อความแจ้งเตือน', detail: 'กรุณาเลือกลูกค้า' }]);
    setup();
    await up();
    const growl = cw.mock.calls.find((c) => c[0] === 'Growl');
    expect(growl?.[2]).toMatchObject({ id: 'quotationForm:sdMessages', life: 4000, msgs: [{ severity: 'warn', detail: 'กรุณาเลือกลูกค้า' }] });
    expect(flash.take()).toEqual([]); // taken: a second visit does not show them again
  });

  it('without anything kept the growl starts with no messages', async () => {
    setup();
    await up();
    expect(cw.mock.calls.find((c) => c[0] === 'Growl')?.[2]).toMatchObject({ msgs: [] });
  });

  it('the filter dialog posts its fields: the table is drawn again with the rows that match, the dialog closes', async () => {
    setup();
    await up();
    const overlay = $('#sdFilterOverlay');
    overlay.classList.add('show');
    const field = $$<HTMLInputElement>('#sdFilterOverlay .ct-filter-row input')[0];
    field.value = 'CA-00004';
    $('#sdFilterOverlay .ct-btn-filter').click();
    await settle(() => expect(rows()).toHaveLength(1));
    expect(rows()[0].textContent).toContain('CA-00004');
    expect(overlay.classList.contains('show')).toBe(false); // oncomplete="sdCloseFilter();"
    expect($$('.sd-pg-btn').length).toBe(4); // a filtered list has its pager
  });

  it('the filter finds nothing → the table has no rows; "clear" brings the list back', async () => {
    setup();
    await up();
    $$<HTMLInputElement>('#sdFilterOverlay .ct-filter-row input')[0].value = 'zzzz';
    $('#sdFilterOverlay .ct-btn-filter').click();
    await settle(() => expect(rows()).toHaveLength(0));
    $('#sdFilterOverlay .ct-btn-clear').click();
    await settle(() => expect(rows().length).toBeGreaterThan(0));
    expect($$<HTMLInputElement>('#sdFilterOverlay .ct-filter-row input')[0].value).toBe('');
  });

  it('the pager of a filtered list moves a page (20 rows) and stops at the last one', async () => {
    setup();
    await up();
    $$<HTMLInputElement>('#sdFilterOverlay .ct-filter-row input')[0].value = 'CA-00';
    $('#sdFilterOverlay .ct-btn-filter').click();
    await settle(() => expect($$('.sd-pg-btn').length).toBe(4));
    expect(rows()).toHaveLength(20);
    $$('.sd-pg-btn')[3].click(); // last
    await settle(() => expect(rows()).toHaveLength(13));
    expect($$('.sd-pg-btn')[2].classList.contains('ui-state-disabled')).toBe(true); // next: nothing after the last page
    $$('.sd-pg-btn')[0].click(); // first
    await settle(() => expect(rows()).toHaveLength(20));
  });

  it('a link to the app (the add button) is the router, not a page load; a modified click keeps its browser meaning', async () => {
    setup();
    await up();
    const add = $<HTMLAnchorElement>('.ct-add-btn');
    add.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, button: 0 }));
    expect(navigateByUrl).toHaveBeenCalledWith(add.getAttribute('href'));
    navigateByUrl.mockClear();
    add.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, button: 0, ctrlKey: true }));
    add.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, button: 1 }));
    expect(navigateByUrl).not.toHaveBeenCalled();
  });

  it('leaving the page removes the growl the widget put into <body> and starts PrimeFaces over', async () => {
    setup();
    await up();
    const container = document.createElement('div'); // (what the widget draws)
    container.id = 'quotationForm:sdMessages_container';
    document.body.appendChild(container);
    fixture.destroy();
    expect(document.getElementById('quotationForm:sdMessages_container')).toBeNull();
    expect(resetState).toHaveBeenCalled();
  });
});
