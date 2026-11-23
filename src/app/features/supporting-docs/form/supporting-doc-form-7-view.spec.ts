import { signal } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { Router } from '@angular/router';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ConfigService } from '@core/config/config.service';
import { I18n } from '@core/i18n/i18n.service';
import { PermissionService } from '@core/permissions/permission.service';
import { configStub } from '@core/testing/test-helpers';
import { exposeInlineHandlers, fakeRuntime, removeRuntime } from '@shared/primefaces/pf-fakes.testing';
import { flash } from '../supporting-doc.flash';
import { supportingDocType } from '../supporting-doc-types';
import { SupportingDocForm7View } from './supporting-doc-form-7-view';

const lang = signal<'th' | 'en'>('th');

describe('Credit application form (pages/sales_document_sub_7.xhtml, generated)', () => {
  let fixture: ComponentFixture<SupportingDocForm7View>;
  let el: HTMLElement;
  let navigateByUrl: ReturnType<typeof vi.fn>;
  let rt: ReturnType<typeof fakeRuntime>;

  const $ = <T extends HTMLElement = HTMLElement>(sel: string) => el.querySelector<T>(sel)!;
  const $$ = <T extends HTMLElement = HTMLElement>(sel: string) => [...el.querySelectorAll<T>(sel)];
  const settle = (fn: () => void) => vi.waitFor(fn, { timeout: 6000, interval: 30 });
  const byId = <T extends HTMLElement = HTMLElement>(id: string) => document.getElementById(id) as T;

  async function setup(id: string, actionType: 'add' | 'edit' | 'detail') {
    TestBed.configureTestingModule({
      providers: [
        { provide: Router, useValue: { navigateByUrl, navigate: vi.fn() } },
        { provide: ConfigService, useValue: configStub({ mock: true }) },
        { provide: PermissionService, useValue: { has: () => true, canUse: () => true } },
        { provide: I18n, useValue: { lang, t: (k: string) => k } },
      ],
    });
    fixture = TestBed.createComponent(SupportingDocForm7View);
    document.body.appendChild(fixture.nativeElement);
    fixture.componentRef.setInput('type', supportingDocType('credit-application'));
    fixture.componentRef.setInput('id', id);
    fixture.componentRef.setInput('actionType', actionType);
    fixture.detectChanges();
    el = fixture.nativeElement;
    await settle(() => expect(typeof (globalThis as unknown as Record<string, unknown>)['sdOpenSaveConfirm']).toBe('function'));
    exposeInlineHandlers();
    return fixture;
  }
  const submit = () => $<HTMLFormElement>('#quotationForm').requestSubmit(byId('quotationForm:realSaveBtn'));

  beforeEach(() => {
    lang.set('th');
    navigateByUrl = vi.fn().mockResolvedValue(true);
    rt = fakeRuntime();
    vi.spyOn(SupportingDocForm7View.prototype as unknown as { loadRuntime(): Promise<void> }, 'loadRuntime').mockResolvedValue(undefined);
    flash.take();
    (Element.prototype as unknown as { scrollIntoView: unknown }).scrollIntoView = vi.fn();
  });
  afterEach(() => {
    fixture?.destroy();
    TestBed.resetTestingModule();
    vi.restoreAllMocks();
    removeRuntime();
    document.body.innerHTML = '';
  });

  it('is one long page with a single tab, no documents; its growl (3 s) is the PrimeFaces widget, started without messages', async () => {
    await setup('new', 'add');
    expect($$('.contract-tabbar .ct-tab')).toHaveLength(1);
    expect($$('.sd-doc-uploadbar, .ui-fileupload')).toHaveLength(0);
    const growl = rt.started.find((s) => s.type === 'Growl');
    expect(growl?.cfg).toMatchObject({ id: 'quotationForm:messages', life: 3000, msgs: [] });
    expect(rt.started.filter((s) => s.type === 'SelectOneMenu').length).toBeGreaterThan(3);
    expect(rt.started.filter((s) => s.type === 'Calendar').length).toBeGreaterThan(3);
  });

  it('the address fields become the select lists of the page script (province, district, sub-district; their content is the master-data servlets, proven in the browser harness)', async () => {
    await setup('new', 'add');
    expect($$('select.sd7-geo-sel').length).toBeGreaterThan(0);
    // the servlets are answered by the host from the backend (what env.fetch asks of them)
    const ask = (fixture.componentInstance as unknown as { fetchBrowser(u: string): Promise<Response> }).fetchBrowser.bind(fixture.componentInstance);
    const provinces = (await (await ask('/board/provinces')).json()) as { id: number; name: string }[];
    expect(provinces.some((p) => p.name === 'กรุงเทพมหานคร')).toBe(true);
    const districts = (await (await ask(`/board/districts?provinceId=${provinces.find((p) => p.name === 'กรุงเทพมหานคร')!.id}`)).json()) as unknown[];
    expect(districts.length).toBeGreaterThan(0);
  });

  it('saving without a customer goes to the list with the warning, as every family does', async () => {
    await setup('new', 'add');
    submit();
    await settle(() => expect(navigateByUrl).toHaveBeenCalledWith('/crm/supporting-docs/credit-application'));
    expect(flash.take()).toEqual([expect.objectContaining({ severity: 'warn', detail: 'กรุณาเลือกลูกค้า' })]);
  });

  it('a refusal of the backend stays on the page and its growl shows the reason (the document is drawn again, the growl started with the messages of the request)', async () => {
    await setup('7001', 'edit');
    const remark = $$<HTMLTextAreaElement>('textarea')[0];
    remark.value = 'X-FAIL';
    const overlay = $('#sdSaveConfirmOverlay');
    const before = rt.started.filter((s) => s.type === 'Growl').length;
    submit();
    await settle(() => expect($('#sdSaveConfirmOverlay')).not.toBe(overlay));
    expect(navigateByUrl).not.toHaveBeenCalled();
    const growls = rt.started.filter((s) => s.type === 'Growl');
    expect(growls.length).toBe(before + 1);
    expect(growls.at(-1)?.cfg['msgs']).toEqual([expect.objectContaining({ severity: 'error', summary: 'บันทึกไม่สำเร็จ' })]);
    expect($$<HTMLTextAreaElement>('textarea')[0].value).toBe('X-FAIL');
  });

  it('the detail mode is read only (and keeps the PrimeFaces widgets away: every field is plain text)', async () => {
    await setup('7001', 'detail');
    await settle(() => expect($('#quotationForm').classList.contains('sd-view-mode')).toBe(true));
    expect($$('.sd-save-btn')).toHaveLength(0);
    expect($$<HTMLInputElement>('#quotationForm input[type=text]').every((i) => i.disabled)).toBe(true);
  });
});
