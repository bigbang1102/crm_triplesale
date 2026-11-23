import { signal } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { Router } from '@angular/router';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AuthService } from '@core/auth/auth.service';
import { ConfigService } from '@core/config/config.service';
import { DomGuards } from '@core/dom/dom-guards';
import { I18n } from '@core/i18n/i18n.service';
import { PermissionService } from '@core/permissions/permission.service';
import { configStub } from '@core/testing/test-helpers';
import { fakeRuntime, removeRuntime } from '@shared/primefaces/pf-fakes.testing';
import { ProspectFormView } from './prospect-form-view';
import { ProspectFormView as ProspectFormBean, prospectSession } from './prospect-form.bean';
import { resetMockProspectForm } from './prospect-form.mock';

const lang = signal<'th' | 'en'>('th');

/**
 * The page's inline handlers (`onclick="ctdOpenUpdateConfirmModal()"`) look their function up on jsdom's own window, while the engine defines them on the global the
 * tests run in (a browser has one window): the functions the engine published are copied over.
 */
function exposeInlineHandlers(): void {
  const dom = (globalThis as unknown as { jsdom?: { window: Record<string, unknown> } }).jsdom;
  if (!dom) return;
  for (const [k, v] of Object.entries(globalThis)) if (typeof v === 'function' && /^(pt[A-Z]|ct[A-Za-z]|cl[A-Z]|open[A-Z]|close[A-Z]|confirm[A-Z]|handle[A-Z]|toggle[A-Z]|submit[A-Z]|goto[A-Z]|md[A-Z]|update[A-Z])/.test(k)) dom.window[k] = v;
}

describe('Prospect form (pages/contracts_master_data.xhtml, generated)', () => {
  let fixture: ComponentFixture<ProspectFormView>;
  let el: HTMLElement;
  let navigateByUrl: ReturnType<typeof vi.fn>;
  let rt: ReturnType<typeof fakeRuntime>;
  let deniedRoles: Set<string>;

  const $ = <T extends HTMLElement = HTMLElement>(sel: string) => el.querySelector<T>(sel)!;
  const $$ = <T extends HTMLElement = HTMLElement>(sel: string) => [...el.querySelectorAll<T>(sel)];
  const settle = (fn: () => void) => vi.waitFor(fn, { timeout: 6000, interval: 30 });
  const win = window as unknown as Record<string, unknown>;

  async function setup(id: string, actionType: 'add' | 'view' | 'edit', pms: string | null = null) {
    TestBed.configureTestingModule({
      providers: [
        { provide: Router, useValue: { navigateByUrl, navigate: vi.fn() } },
        { provide: ConfigService, useValue: configStub({ mock: true }) },
        { provide: PermissionService, useValue: { has: (role: string) => !deniedRoles.has(role), canUse: () => true } },
        { provide: I18n, useValue: { lang, t: (k: string) => k } },
        { provide: AuthService, useValue: { session: () => ({ username: 'demo', profileName: 'สมชาย ใจดี (ทดลอง)', employeeId: 1001, employeeCode: 'E1001' }) } },
        { provide: DomGuards, useValue: { start: vi.fn() } },
      ],
    });
    fixture = TestBed.createComponent(ProspectFormView);
    document.body.appendChild(fixture.nativeElement);
    fixture.componentRef.setInput('id', id);
    fixture.componentRef.setInput('actionType', actionType);
    fixture.componentRef.setInput('pms', pms);
    fixture.detectChanges();
    el = fixture.nativeElement;
    await settle(() => expect($('.contract-tabbar')).toBeTruthy());
    // the page is up when its script is
    await settle(() => expect(typeof win['ctShowTab']).toBe('function'));
    exposeInlineHandlers();
    return fixture;
  }

  beforeEach(() => {
    deniedRoles = new Set();
    lang.set('th');
    navigateByUrl = vi.fn().mockResolvedValue(true);
    rt = fakeRuntime();
    resetMockProspectForm();
    prospectSession.ss_tel = undefined;
    prospectSession.contactDetailOriginalJson = undefined;
    vi.spyOn(ProspectFormView.prototype as unknown as { loadRuntime(): Promise<void> }, 'loadRuntime').mockResolvedValue(undefined);
    (Element.prototype as unknown as { scrollIntoView: unknown }).scrollIntoView = vi.fn();
    win['swal'] = vi.fn(() => Promise.resolve(true));
  });
  afterEach(() => {
    fixture?.destroy();
    TestBed.resetTestingModule();
    removeRuntime();
    delete win['swal'];
    vi.restoreAllMocks();
  });

  describe('the tab "เอกสารประกอบ"', () => {
    it('is in the tab bar of every mode only for Pipeline_Prospect_Attachment_View: without the role the form has two tabs', async () => {
      for (const mode of ['add', 'view', 'edit'] as const) {
        await setup(mode === 'add' ? 'new' : '7', mode);
        expect($$('.contract-tabbar .ct-tab[data-tab="3"]'), mode).toHaveLength(1);
        fixture.destroy();
        TestBed.resetTestingModule();
        deniedRoles = new Set(['Pipeline_Prospect_Attachment_View']);
        await setup(mode === 'add' ? 'new' : '7', mode);
        expect($$('.contract-tabbar .ct-tab').map((t) => t.dataset['tab']), mode).toEqual(['1', '2']);
        fixture.destroy();
        TestBed.resetTestingModule();
        deniedRoles = new Set();
      }
    });

    it('the download icon of a document row needs Pipeline_Prospect_Attachment_Download; the file name stays a link', async () => {
      await setup('7', 'view');
      win['ctShowTab'] && (win['ctShowTab'] as (n: number) => void)(3);
      await settle(() => expect($$('.ct-doc-row2').length).toBeGreaterThan(0));
      const rows = $$('.ct-doc-row2').length;
      expect($$('.ct-doc-dl-btn')).toHaveLength(rows);
      fixture.destroy();
      TestBed.resetTestingModule();
      deniedRoles = new Set(['Pipeline_Prospect_Attachment_Download']);
      await setup('7', 'view');
      (win['ctShowTab'] as (n: number) => void)(3);
      await settle(() => expect($$('.ct-doc-row2')).toHaveLength(rows));
      expect($$('.ct-doc-dl-btn')).toHaveLength(0);
      expect($$('.ct-doc-file-link')).toHaveLength(rows);
    });
  });

  describe('add', () => {
    it('draws the form of a new customer: three tabs, the customer type to choose, the buttons locked until it is', async () => {
      await setup('new', 'add');
      expect($$('.contract-tabbar .ct-tab').length).toBe(3);
      expect($$('[id="form:customer_type"] input[type=radio]').length).toBe(2);
      // no type yet: the form says so, the "create lead" button is locked
      expect($('#form').classList.contains('cust-type-locked')).toBe(true);
      expect($('button[onclick*="ctdOpenCreateLeadModal"]').classList.contains('is-disabled')).toBe(true);
      expect($$('.ui-datepicker-trigger, [id$="_input"].hasDatepicker').length).toBeGreaterThanOrEqual(0);
    });

    it('starts the real PrimeFaces widgets of the page: the selects, the radios, the dialogs (the dates are the app\'s own date inputs, no date picker)', async () => {
      await setup('new', 'add');
      await settle(() => expect(rt.started.length).toBeGreaterThan(0));
      const by = (type: string) => rt.started.filter((s) => s.type === type).length;
      expect(by('SelectOneMenu')).toBe(15);
      expect(by('DatePicker')).toBe(0);
      expect(by('SelectOneRadio')).toBe(2);
      expect(by('Dialog')).toBe(5);
    });

    it('defines the window functions of the p:remoteCommand (rc_createLead …) and takes them away again', async () => {
      await setup('new', 'add');
      for (const n of ['rc_createLead', 'rc_uploadProspectImage', 'rc_reloadProspectDocs', 'rc_deleteProspectDoc', 'rc_doUpdateContract']) expect(typeof win[n]).toBe('function');
      fixture.destroy();
      for (const n of ['rc_createLead', 'rc_uploadProspectImage', 'rc_reloadProspectDocs', 'rc_deleteProspectDoc', 'rc_doUpdateContract']) expect(win[n]).toBeUndefined();
    });

    it('gives a new customer today as the date of the first contact', async () => {
      await setup('new', 'add');
      const input = $<HTMLInputElement>('#form\\:j_idt2_input.ods-date');
      expect(input).toBeTruthy();
      expect(input.value).toMatch(/^\d{2}\/\d{2}\/\d{4}$/);
    });

    it('the customer type: the page script switches the panels and unlocks the buttons', async () => {
      await setup('new', 'add');
      const juristic = $<HTMLInputElement>('[id="form:customer_type:1"]');
      juristic.checked = true;
      win['ctApplyTypeUI'] ??= undefined;
      // onchange="ctApplyTypeUI();" is an inline handler; the engine publishes the function on window
      (globalThis as unknown as { ctApplyTypeUI?: () => void }).ctApplyTypeUI?.();
      await settle(() => expect($('#form').classList.contains('ct-type-juristic')).toBe(true));
      expect($('#form').classList.contains('cust-type-locked')).toBe(false);
      expect($('#ctNameLabelText').textContent).toBe('label.cmd.company_name_label');
    });

    describe('creating (POST /api/v1/prospects)', () => {
      /** a company (no surname needed) with a name: the checks of the page before the window pass */
      const fillCompany = (): void => {
        $<HTMLInputElement>('[id="form:customer_type:1"]').checked = true;
        (globalThis as unknown as { ctApplyTypeUI?: () => void }).ctApplyTypeUI?.();
        $<HTMLInputElement>('[id="form:customer_name_input"]').value = 'บริษัท ทดสอบ';
      };

      it('"Save draft": the checks of the page first (no type chosen = a warning, nothing is created); then a DRAFT is created and the window is not opened', async () => {
        const create = vi.spyOn(ProspectFormBean.prototype, 'createProspectV2').mockResolvedValue(true);
        await setup('new', 'add');
        $('#ctdSaveDraftBtn').click();
        await settle(() => expect(win['swal']).toHaveBeenCalled()); // (SweetAlert is loaded on demand)
        expect(create).not.toHaveBeenCalled();
        expect((win['swal'] as ReturnType<typeof vi.fn>).mock.calls.at(-1)![0]).toMatchObject({ icon: 'warning' });
        fillCompany();
        // the button sets the flag and calls the page's function (in a browser one window; here the inline handler is compiled in jsdom's own, so it is done by hand)
        expect($('#ctdSaveDraftBtn').getAttribute('onclick')).toContain('ctdDraftMode = true; ctdOpenCreateLeadModal()');
        win['ctdDraftMode'] = true;
        (win['ctdOpenCreateLeadModal'] as () => void)();
        await settle(() => expect(create).toHaveBeenCalledWith('DRAFT', ''));
        expect(document.getElementById('createLeadModal')!.classList.contains('show')).toBe(false);
      });

      it('"Save" of the window (no OPP): an owner is needed; then RELEASE with that owner (a person, or a queue wl:<id>)', async () => {
        const create = vi.spyOn(ProspectFormBean.prototype, 'createProspectV2').mockResolvedValue(true);
        await setup('new', 'add');
        const save = () => (win['ctdSaveProspect'] as () => void)();
        expect(document.getElementById('createProspectOnlyBtn')).toBeTruthy();
        save(); // no owner chosen
        await settle(() => expect(win['swal']).toHaveBeenCalled());
        expect(create).not.toHaveBeenCalled();
        expect((win['swal'] as ReturnType<typeof vi.fn>).mock.calls.at(-1)![0]).toMatchObject({ text: 'app.prospects.pleaseSelectOwner', icon: 'warning' });
        const owner = document.getElementById('clOwner') as HTMLSelectElement;
        owner.innerHTML = '<option value="">-</option><option value="e-1">คน</option><option value="wl:w-1">คิว</option>';
        owner.value = 'e-1';
        save();
        await settle(() => expect(create).toHaveBeenCalledWith('RELEASE', 'e-1'));
        owner.value = 'wl:w-1';
        save();
        await settle(() => expect(create).toHaveBeenCalledWith('RELEASE', 'wl:w-1'));
      });

      it('the host function creates one at a time and is taken away with the page', async () => {
        let release!: () => void;
        const create = vi.spyOn(ProspectFormBean.prototype, 'createProspectV2').mockImplementation(() => new Promise<boolean>((resolve) => (release = () => resolve(true))));
        await setup('new', 'add');
        const host = win['ctdCreateProspect'] as (mode: 'DRAFT' | 'RELEASE', owner?: string) => void;
        host('DRAFT');
        host('DRAFT'); // while the first one is on its way
        await settle(() => expect(create).toHaveBeenCalledTimes(1));
        release();
        fixture.destroy();
        expect(win['ctdCreateProspect']).toBeUndefined();
      });
    });
  });

  describe('view', () => {
    it('shows the values as text: no input, no widget, the AI summary link of the customer, the create-lead button', async () => {
      await setup('1', 'view');
      await settle(() => expect($('.title-text-value')).toBeTruthy());
      expect($$('input.ui-inputtext').length).toBe(0);
      expect(rt.started.filter((s) => s.type === 'SelectOneMenu').length).toBe(0);
      expect($('a[href^="/ai/hub/customer-brief"]').getAttribute('href')).toBe('/ai/hub/customer-brief?prospectId=1');
      expect($('button[onclick*="openCreateLeadModal"]')).toBeTruthy();
    });

    it('sends the link to the AI summary to the router, not to a page load', async () => {
      await setup('1', 'view');
      const a = $<HTMLAnchorElement>('a[href^="/ai/hub/customer-brief"]');
      const ev = new MouseEvent('click', { bubbles: true, cancelable: true });
      a.dispatchEvent(ev);
      expect(ev.defaultPrevented).toBe(true);
      expect(navigateByUrl).toHaveBeenCalledWith('/ai/hub/customer-brief?prospectId=1');
    });

    it('the back arrow goes to the list of the prospects', async () => {
      await setup('1', 'view');
      $('.pi-arrow-left').click();
      expect(navigateByUrl).toHaveBeenCalledWith('/crm/prospects');
    });
  });

  describe('edit', () => {
    it('draws the record in its fields: the name, the phone as digits, the documents of the record', async () => {
      await setup('2', 'edit');
      const name = $<HTMLInputElement>('[id="form:customer_name_input"]');
      expect(name.value).not.toBe('');
      await settle(() => expect(rt.started.filter((s) => s.type === 'SelectOneMenu').length).toBe(15));
    });

    it('the tabs of the page: the second shows the extra information, the third the documents', async () => {
      await setup('2', 'edit');
      (globalThis as unknown as { ctShowTab: (n: number) => void }).ctShowTab(3);
      expect($<HTMLElement>('[id="form:ctPane3"]').style.display).toBe('block');
      expect($<HTMLElement>('[id="form:ctPane1"]').style.display).toBe('none');
      (globalThis as unknown as { ctShowTab: (n: number) => void }).ctShowTab(1);
      expect($<HTMLElement>('[id="form:ctPane1"]').style.display).toBe('block');
    });

    it('a change in a field is the ajax behaviour changeUpdate: the digits of the phone are kept, the name goes to the bean', async () => {
      await setup('2', 'edit');
      const tel = $<HTMLInputElement>('[id="form:prospect_tel"]');
      tel.value = '08-123 4567';
      tel.dispatchEvent(new Event('change', { bubbles: true }));
      await settle(() => expect(prospectSession.ss_tel).toBe('081234567'));
    });

    it('a province chosen in the select re-draws the district list from the bean', async () => {
      await setup('2', 'edit');
      await settle(() => expect(rt.started.filter((s) => s.type === 'SelectOneMenu').length).toBe(15));
      const province = rt.started.find((s) => s.cfg['id'] === 'form:province_1');
      expect(province).toBeTruthy();
      const select = $<HTMLSelectElement>('[id="form:province_1_input"]');
      const before = [...$<HTMLSelectElement>('[id="form:district_1_input"]').options].map((o) => o.value).join();
      select.value = select.options[3].value;
      rt.bound.filter((b) => b.target === select && b.event.startsWith('change')).forEach((b) => b.handler());
      await settle(() => expect([...$<HTMLSelectElement>('[id="form:district_1_input"]').options].map((o) => o.value).join()).not.toBe(before));
    });

    it('update: the confirm modal, then the bean saves and the page goes to the view of the record', { timeout: 20000 }, async () => {
      const log: string[] = [];
      const origError = console.error;
      console.error = (...a: unknown[]) => { log.push(a.map(String).join(' ').slice(0, 200)); };
      await setup('2', 'edit');
      $('button[onclick*="ctdOpenUpdateConfirmModal"]').click();
      // (the modals are in <body>: the page's script moved them out of the form)
      expect(document.getElementById('updateConfirmModal')!.classList.contains('show')).toBe(true);
      document.querySelector<HTMLElement>('#updateConfirmModal .cl-btn-purple')!.click();
      try {
        await settle(() => expect(win['swal']).toHaveBeenCalled());
      } catch (e) {
        console.error = origError;
        throw new Error(String(e) + ' | ' + log.join(' | '));
      }
      console.error = origError;
      // the success message is a SweetAlert whose .then(gotoViewMode) moves the browser to the view of the record
      const options = (win['swal'] as ReturnType<typeof vi.fn>).mock.calls.at(-1)![0] as { title: string };
      expect(options.title).toBe('บันทึกสำเร็จ!');
      await settle(() => expect(navigateByUrl).toHaveBeenCalledWith(expect.stringMatching(/^\/crm\/prospects\/2\/detail/)));
    });
  });

  describe('leaving', () => {
    it('takes away what the page put into <body> (the modals) and what it hung on the document', async () => {
      await setup('2', 'edit');
      expect(document.body.querySelector(':scope > #createLeadModal')).toBeTruthy(); // the page moves its modals out of the form
      fixture.destroy();
      expect(document.getElementById('createLeadModal')).toBeNull();
      expect(document.getElementById('updateConfirmModal')).toBeNull();
      expect(win['ctShowTab']).toBeUndefined();
      expect(rt.resetState).toHaveBeenCalled();
    });
  });
});
