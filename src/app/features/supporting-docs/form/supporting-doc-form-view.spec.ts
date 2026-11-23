import { signal } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { Router } from '@angular/router';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ConfigService } from '@core/config/config.service';
import { I18n } from '@core/i18n/i18n.service';
import { PermissionService } from '@core/permissions/permission.service';
import { configStub } from '@core/testing/test-helpers';
import { exposeInlineHandlers, fakeRuntime, removeRuntime, transports } from '@shared/primefaces/pf-fakes.testing';
import { flash } from '../supporting-doc.flash';
import { supportingDocType } from '../supporting-doc-types';
import { SupportingDocFormView } from './supporting-doc-form-view';

const lang = signal<'th' | 'en'>('th');

describe('Supporting-document form (pages/sales_document_sub_1.xhtml, generated)', () => {
  let fixture: ComponentFixture<SupportingDocFormView>;
  let el: HTMLElement;
  let navigateByUrl: ReturnType<typeof vi.fn>;
  let rt: ReturnType<typeof fakeRuntime>;
  let swal: ReturnType<typeof vi.fn>;

  const $ = <T extends HTMLElement = HTMLElement>(sel: string) => el.querySelector<T>(sel)!;
  const $$ = <T extends HTMLElement = HTMLElement>(sel: string) => [...el.querySelectorAll<T>(sel)];
  const settle = (fn: () => void) => vi.waitFor(fn, { timeout: 6000, interval: 30 });
  const byId = <T extends HTMLElement = HTMLElement>(id: string) => document.getElementById(id) as T;

  async function setup(slug: string, id: string, actionType: 'add' | 'edit' | 'detail') {
    TestBed.configureTestingModule({
      providers: [
        { provide: Router, useValue: { navigateByUrl, navigate: vi.fn() } },
        { provide: ConfigService, useValue: configStub({ mock: true }) },
        { provide: PermissionService, useValue: { has: () => true, canUse: () => true } },
        { provide: I18n, useValue: { lang, t: (k: string) => k } },
      ],
    });
    fixture = TestBed.createComponent(SupportingDocFormView);
    document.body.appendChild(fixture.nativeElement);
    fixture.componentRef.setInput('type', supportingDocType(slug));
    fixture.componentRef.setInput('id', id);
    fixture.componentRef.setInput('actionType', actionType);
    fixture.detectChanges();
    el = fixture.nativeElement;
    await settle(() => expect($('.contract-tabbar')).toBeTruthy());
    // the page is up when its scripts are (the detail mode has no PrimeFaces widget to wait for)
    await settle(() => expect(typeof (globalThis as unknown as Record<string, unknown>)['sdOpenSaveConfirm']).toBe('function'));
    exposeInlineHandlers();
    return fixture;
  }

  /** the change a PrimeFaces select fires: the value of the hidden select is set, then jQuery's trigger('change') reaches the handler bound to it */
  async function pickCustomer(n: number) {
    const select = $<HTMLSelectElement>('select[id$="j_idt5_input"], select[id*="_input"]');
    const customerSelect = $$<HTMLSelectElement>('.ui-selectonemenu select').find((s) => s.options.length > 3)!;
    void select;
    customerSelect.value = customerSelect.options[n].value;
    rt.bound.filter((b) => b.target === customerSelect && b.event.startsWith('change')).forEach((b) => b.handler());
    await settle(() => expect($<HTMLInputElement>('input[id$="sd1RcvDate_input"]').value).not.toBe(''));
  }
  const confirmSave = async () => {
    exposeInlineHandlers();
    $$('.sd-save-btn')[0].click();
    expect($('#sdSaveConfirmOverlay').classList.contains('is-open')).toBe(true);
    $('.sd-confirm-ok').click(); // sdConfirmSave(): clicks the hidden real save button
  };

  beforeEach(() => {
    lang.set('th');
    navigateByUrl = vi.fn().mockResolvedValue(true);
    swal = vi.fn().mockResolvedValue(undefined);
    rt = fakeRuntime();
    vi.spyOn(SupportingDocFormView.prototype as unknown as { loadRuntime(): Promise<void> }, 'loadRuntime').mockResolvedValue(undefined);
    flash.take();
    (Element.prototype as unknown as { scrollIntoView: unknown }).scrollIntoView = vi.fn();
    vi.spyOn(window, 'open').mockImplementation(() => null);
    void swal;
  });
  afterEach(() => {
    fixture?.destroy();
    TestBed.resetTestingModule();
    vi.restoreAllMocks();
    removeRuntime();
    document.body.innerHTML = '';
  });

  it('is the Java page: the tab bar, the customer select, the three dates, the save buttons; its widgets are started with the configuration of the components', async () => {
    await setup('letter-of-intent', 'new', 'add');
    expect($$('.contract-tabbar .ct-tab').length).toBe(2);
    expect($$('.ui-selectonemenu').length).toBe(2); // the customer and the receiver
    expect($$('.ui-calendar').length).toBe(3);
    expect($$('.sd-save-btn').length).toBe(2);
    const types = rt.started.map((s) => s.type);
    expect(types.filter((t) => t === 'SelectOneMenu')).toHaveLength(2);
    expect(types.filter((t) => t === 'Calendar')).toHaveLength(3);
    expect(types).not.toContain('Growl'); // the growl is out of these six pages (24/08)
    expect(rt.started.find((s) => s.widgetVar === 'sdCustomerWv')?.cfg).toMatchObject({ renderPanelContentOnClient: true });
  });

  it('starts the upload bar as the real FileUpload widget: auto, sequential, the drop zone, the update of the list', async () => {
    await setup('letter-of-intent', 'new', 'add');
    const up = rt.started.find((s) => s.type === 'FileUpload');
    expect(up?.cfg).toMatchObject({ auto: true, sequentialUploads: true, dropZone: '@(.sd-doc-wrap)' });
    expect(String(up?.cfg['update'])).toContain('sdDocList');
    expect(typeof up?.cfg['onstart']).toBe('function');
    expect(typeof up?.cfg['onvalidationfailure']).toBe('function');
  });

  it('picking a customer (the change of the hidden select, which PrimeFaces fires with jQuery) fills the receive date — the change behavior is bound to the select', async () => {
    await setup('letter-of-intent', 'new', 'add');
    const customer = $$<HTMLSelectElement>('.ui-selectonemenu select').find((s) => s.options.length > 3)!;
    expect(rt.bound.some((b) => b.target === customer && b.event.startsWith('change'))).toBe(true);
    expect($<HTMLInputElement>('input[id$="sd1RcvDate_input"]').value).toBe('');
    await pickCustomer(2);
    const d = new Date();
    const two = (n: number) => String(n).padStart(2, '0');
    expect($<HTMLInputElement>('input[id$="sd1RcvDate_input"]').value).toBe(`${two(d.getDate())}/${two(d.getMonth() + 1)}/${d.getFullYear()}`);
  });

  it('the pieces a pick draws again are started again (the new calendar / select are widgets of their own)', async () => {
    await setup('letter-of-intent', 'new', 'add');
    const before = rt.started.length;
    await pickCustomer(1);
    const again = rt.started.slice(before).map((s) => s.widgetVar);
    expect(again.some((v) => v.includes('sd1RcvDate'))).toBe(true);
    expect(again.some((v) => v.includes('sd1RcvBy'))).toBe(true);
  });

  it('saving without a customer goes to the list with the warning (Java returns the list for a failed check too)', async () => {
    await setup('letter-of-intent', 'new', 'add');
    await confirmSave();
    $<HTMLFormElement>('#quotationForm').requestSubmit(byId('quotationForm:realSaveBtn'));
    await settle(() => expect(navigateByUrl).toHaveBeenCalledWith('/crm/supporting-docs/letter-of-intent'));
    expect(flash.take()).toEqual([expect.objectContaining({ severity: 'warn', detail: 'กรุณาเลือกลูกค้า' })]);
  });

  it('saving a document with a customer goes to the list; the document is there', async () => {
    await setup('letter-of-intent', 'new', 'add');
    await pickCustomer(2);
    $<HTMLFormElement>('#quotationForm').requestSubmit(byId('quotationForm:realSaveBtn'));
    await settle(() => expect(navigateByUrl).toHaveBeenCalledWith('/crm/supporting-docs/letter-of-intent'));
    expect(flash.take()).toEqual([]);
  });

  it('a refusal of the backend stays on the page: it is drawn again from the bean (a new document: the dialog closed, the scripts started anew), the typed text kept', async () => {
    await setup('letter-of-intent', '1001', 'edit');
    const remark = $$<HTMLTextAreaElement>('textarea')[0];
    remark.value = 'X-FAIL';
    const overlay = $('#sdSaveConfirmOverlay');
    await confirmSave();
    const startedBefore = rt.started.length;
    $<HTMLFormElement>('#quotationForm').requestSubmit(byId('quotationForm:realSaveBtn'));
    await settle(() => expect($('#sdSaveConfirmOverlay')).not.toBe(overlay));
    expect(navigateByUrl).not.toHaveBeenCalled();
    expect($('#sdSaveConfirmOverlay').classList.contains('is-open')).toBe(false);
    expect($$<HTMLTextAreaElement>('textarea')[0].value).toBe('X-FAIL');
    await settle(() => expect(rt.started.length).toBeGreaterThan(startedBefore)); // the widgets of the new document
    expect(rt.resetState).toHaveBeenCalled(); // (a page load starts PrimeFaces over)
  });

  it('the trash icon of a file asks, then the hidden command link removes it and the list of files is drawn again', async () => {
    await setup('letter-of-intent', '1008', 'edit');
    const rows = () => $$('#quotationForm\\:sdDocList .sd-doc-row');
    const before = rows().length;
    expect(before).toBeGreaterThan(0);
    rows()[0].querySelector<HTMLElement>('.sd-doc-del-real')!.click();
    await settle(() => expect(rows().length).toBe(before - 1));
  });

  it('a file chosen in the upload bar is posted by the widget: the transport hands it to the bean and the list of files is drawn again', async () => {
    await setup('letter-of-intent', '1008', 'edit');
    const rows = () => $$('#quotationForm\\:sdDocList .sd-doc-row');
    const before = rows().length;
    const up = rt.started.find((s) => s.type === 'FileUpload')!;
    const data = new FormData();
    data.append('jakarta.faces.partial.ajax', 'true');
    data.append('jakarta.faces.source', String(up.cfg['id']));
    data.append('jakarta.faces.partial.render', String(up.cfg['update']));
    data.append(String(up.cfg['id']), new File(['hello'], 'new-file.pdf', { type: 'application/pdf' }), 'new-file.pdf');
    const transport = transports.at(-1)!({ data })!;
    const done = await new Promise<number>((resolve) => transport.send({}, (status) => resolve(status)));
    expect(done).toBe(200);
    await settle(() => expect(rows().length).toBe(before + 1));
    expect(rows().at(-1)!.textContent).toContain('new-file.pdf');
  });

  it('the remote command sdProsLoad searches the customers by its parameters and hands the page of results to the script as prosJson', async () => {
    await setup('letter-of-intent', 'new', 'add');
    const lazy = (window as unknown as { sdCustomerLazy: { onComplete: ReturnType<typeof vi.fn> } }).sdCustomerLazy;
    (window as unknown as { sdProsLoad(p: unknown): void }).sdProsLoad([
      { name: 'key', value: 'zzzz' },
      { name: 'page', value: 0 },
      { name: 'gen', value: 3 },
    ]);
    await settle(() => expect(lazy.onComplete).toHaveBeenCalled());
    const res = JSON.parse((lazy.onComplete.mock.calls[0][0] as { prosJson: string }).prosJson);
    expect(res).toMatchObject({ items: [], hasMore: false, page: 0, gen: '3' });
  });

  it('the detail mode is read only: no PrimeFaces widget, every field disabled, no save button, an edit button', async () => {
    await setup('letter-of-intent', '1008', 'detail');
    expect(rt.started).toHaveLength(0);
    await settle(() => expect($('#quotationForm').classList.contains('sd-view-mode')).toBe(true));
    expect($('.btn-master-edit')).toBeTruthy();
    expect($$<HTMLInputElement>('#quotationForm input[type=text]').every((i) => i.disabled)).toBe(true);
    expect($$('.sd-save-btn')).toHaveLength(0);
  });

  it('leaving the page stops it: the remote command is gone, the dropdown panels and the datepicker it put into <body> go, PrimeFaces starts over', async () => {
    await setup('letter-of-intent', 'new', 'add');
    const panel = document.createElement('div'); // (what the shell's ODS and the datepicker draw outside the page)
    panel.className = 'ods-list';
    document.body.appendChild(panel);
    $$<HTMLElement & { _odsList?: HTMLElement }>('.ods-btn').forEach((b) => (b._odsList = panel));
    const dp = document.createElement('div');
    dp.id = 'ui-datepicker-div';
    document.body.appendChild(dp);
    expect(typeof (window as unknown as { sdProsLoad?: unknown }).sdProsLoad).toBe('function');
    fixture.destroy();
    expect((window as unknown as { sdProsLoad?: unknown }).sdProsLoad).toBeUndefined();
    expect(document.getElementById('ui-datepicker-div')).toBeNull();
    expect(rt.resetState).toHaveBeenCalled();
  });
});
