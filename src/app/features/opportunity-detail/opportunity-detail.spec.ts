import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { signal } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { By } from '@angular/platform-browser';
import { ActivatedRoute, Router, convertToParamMap, provideRouter } from '@angular/router';
import { of } from 'rxjs';
import { setSingleMode } from './opportunity-detail.single-mode';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AuthService } from '@core/auth/auth.service';
import { SessionInfo } from '@core/auth/auth.models';
import { ConfigService } from '@core/config/config.service';
import { createTsPhone } from '@core/dom/phone-format';
import { I18n } from '@core/i18n/i18n.service';
import { MOCK_COUNTRIES, mockCountriesResponse } from '@core/http/mock-countries';
import { PermissionService } from '@core/permissions/permission.service';
import { configStub } from '@core/testing/test-helpers';
import { OpportunityDetail } from './opportunity-detail';
import { OpportunityDetailView } from './opportunity-detail-view';
import { MOCK_UPLOAD_ACCEPT, createMockLeadDetail, resetMockLeadDetail } from './opportunity-detail.mock';

const SERVICE = '/triplesale-service/api/v1';
const session = signal<SessionInfo | null>({
  username: 'demo', profileName: 'Demo', employeeId: 1001, employeeCode: 'E101', branch: { id: 1, code: 'SUN', name: 'SUN' }, branchCode: 'SUN', roles: ['super_admin'],
});
const lang = signal<'th' | 'en'>('th');
const t = (k: string) => k;
type Win = Record<string, unknown>;

/**
 * The inline handlers of the Java markup (`onclick="window.ldToggleInterestDd()"`) run in the jsdom realm, whose `window` is not the object the
 * engine (a module of the test realm) puts its functions on — in a browser they are the same. So whatever the engine published is copied over to
 * the realm of the handlers before a click (the same bridge as in activities.spec.ts).
 */
function handlerRealm(): Record<string, unknown> {
  const probe = document.createElement('button');
  probe.setAttribute('onclick', 'this.realm = window');
  probe.dispatchEvent(new MouseEvent('click')); // not .click(): that one is wrapped below
  return (probe as unknown as { realm: Record<string, unknown> }).realm;
}
const bridge = (): void => {
  const w = window as unknown as Record<string, unknown>;
  const realm = handlerRealm();
  for (const k of Object.keys(w)) if (/^(ld|_ld|wm|LD2_|make)/.test(k)) realm[k] = w[k];
};

describe('Lead detail page (pages/lead_detail.xhtml + its modals, generated)', () => {
  let fixture: ComponentFixture<OpportunityDetail>;
  let el: HTMLElement;
  let swal: ReturnType<typeof vi.fn<(o: unknown) => Promise<unknown>>>;
  let allowed: Set<string> | 'all';
  /** button codes (core/permissions/access-buttons.ts) the signed-in user may not use */
  let deniedCodes: Set<string>;
  let navigate: ReturnType<typeof vi.fn>;

  const $ = <T extends HTMLElement = HTMLElement>(sel: string) => el.querySelector<T>(sel)!;
  const $$ = <T extends HTMLElement = HTMLElement>(sel: string) => [...el.querySelectorAll<T>(sel)];
  const text = (sel: string) => ($(sel)?.textContent ?? '').trim();
  const settle = (fn: () => void, timeout = 6000) => vi.waitFor(fn, { timeout, interval: 40 });
  const win = () => window as unknown as Win;
  /** the page is up when the lead arrived (its customer code is in the card) and the history is drawn */
  const up = async () => {
    await settle(() => (expect(text('#ld2CustCode')).toMatch(/^P\d{5}$/), expect($('#ld2HistList .ld2-sk')).toBeNull()));
    bridge();
  };

  async function create(opts: { mock?: boolean; leadId?: string; group?: string } = {}): Promise<void> {
    TestBed.configureTestingModule({
      providers: [
        provideRouter([]),
        provideHttpClient(),
        provideHttpClientTesting(),
        { provide: ConfigService, useValue: configStub({ mock: opts.mock ?? true }) },
        { provide: AuthService, useValue: { session } },
        { provide: I18n, useValue: { lang, t, use: async (l: 'th' | 'en') => lang.set(l), masterRaw: () => undefined } },
        { provide: PermissionService, useValue: { has: (r: string) => allowed === 'all' || allowed.has(r), canUse: (code: string) => !deniedCodes.has(code) } },
        {
          provide: ActivatedRoute,
          useValue: {
            paramMap: of(convertToParamMap({ opportunityId: opts.leadId ?? '29' })),
            queryParamMap: of(convertToParamMap(opts.group ? { activityGroupId: opts.group } : {})),
            snapshot: { paramMap: convertToParamMap({ opportunityId: opts.leadId ?? '29' }), queryParamMap: convertToParamMap(opts.group ? { activityGroupId: opts.group } : {}) },
          },
        },
      ],
    });
    navigate = vi.spyOn(TestBed.inject(Router), 'navigateByUrl').mockResolvedValue(true) as unknown as ReturnType<typeof vi.fn>;
    fixture = TestBed.createComponent(OpportunityDetail);
    document.body.appendChild(fixture.nativeElement);
    fixture.detectChanges();
    el = fixture.nativeElement as HTMLElement;
  }

  beforeEach(() => {
    // this spec checks the Java page as generated, every button code of it; the single opportunity (no close / workflow buttons) is in opportunity-detail.single-mode.spec.ts
    setSingleMode(false);
    // an element is clicked right after the engine published its functions: hand them over before the click
    const nativeClick = HTMLElement.prototype.click;
    vi.spyOn(HTMLElement.prototype, 'click').mockImplementation(function (this: HTMLElement) {
      bridge();
      nativeClick.call(this);
    });
    resetMockLeadDetail();
    sessionStorage.clear();
    lang.set('th');
    allowed = 'all';
    deniedCodes = new Set();
    swal = vi.fn<(o: unknown) => Promise<unknown>>(async () => undefined);
    // jsdom loads no scripts: the helper script and the dialog library are stand-ins, TsPhone is the real (generated) one with the fake master data
    vi.spyOn(OpportunityDetailView.prototype as unknown as { loadLibraries(): Promise<unknown> }, 'loadLibraries').mockResolvedValue(undefined);
    vi.spyOn(OpportunityDetailView.prototype as unknown as { swal(o: unknown): Promise<unknown> }, 'swal').mockImplementation((o) => swal(o));
    win()['TsPhone'] = createTsPhone({ apiBase: '', fetch: async () => mockCountriesResponse() });
    win()['TsAttachTypes'] = { check: () => true };
    win()['crmShowError'] = vi.fn();
    win()['crmErrText'] = (s: string) => s;
    void MOCK_COUNTRIES;
  });
  afterEach(() => {
    setSingleMode(true);
    fixture?.destroy();
    TestBed.resetTestingModule();
    vi.restoreAllMocks();
    for (const k of ['TsPhone', 'TsAttachTypes', 'crmShowError', 'crmErrText']) delete win()[k];
  });

  it('is the markup of the Java page: the card, the tabs, the history, the table view, the modals', async () => {
    await create();
    await up();
    expect($('#ld2CustName').textContent).toBeTruthy();
    expect($$('.ld2-tab').map((x) => x.dataset['tab'])).toEqual(['contact', 'main', 'extra', 'docs', 'saledocs']);
    expect(['ld2TagModal', 'ld2SalesModal', 'ld2OwnerModal', 'ld2AddProdModal', 'ld2ViewWorkOverlay', 'ld2AddWorkOverlay', 'wmSuccessOverlay', 'ld2HistFilterOverlay', 'ld2AccessModal', 'ld2ReturnStepModal', 'ld2CloseGroupModal', 'ld2CloseLeadModal', 'ld2NextGroupModal', 'ldAccessPop', 'ld2MoveStepOverlay'].every((id) => !!document.getElementById(id))).toBe(true);
    // the one value the server rendered into the markup
    expect($<HTMLInputElement>('#ld2FileInput').getAttribute('accept')).toBe(MOCK_UPLOAD_ACCEPT);
    // images are the copies under assets/images (the Java ../images/)
    expect($('#ld2CustAv img').getAttribute('src')).toBe('assets/images/icon/default_avatar.svg');
  });

  it('draws the lead from the backend: card, stepbar (5 groups, the last one active), appointments, tasks, history', async () => {
    await create();
    await up();
    expect($('#ld2CustName').textContent).toMatch(/\S/);
    expect($$('#ld2StepBar .ld2-step')).toHaveLength(5);
    expect($$('#ld2StepBar .ld2-step').map((s) => s.className.replace('ld2-step ', ''))).toEqual(['ld2-step-done', 'ld2-step-done', 'ld2-step-done', 'ld2-step-done', 'ld2-step-active']);
    expect($('#ld2ApptList .ld2-appt-card')).toBeTruthy();
    expect($$('#ld2TaskList .ld2-task-card')).toHaveLength(2);
    expect($$('#ld2HistList .ld2-hist-item').length).toBeGreaterThan(3);
    expect(text('#ld2Interest')).toMatch(/HOT|WARM|COLD|INACTIVE|NEW/);
  });

  it('opens the lead of the route with the group it was opened in (the lead API is asked for exactly that)', async () => {
    await create({ leadId: '7', group: '103' });
    // the host gives the engine the address a Java page would have had
    const view = fixture.debugElement.query(By.directive(OpportunityDetailView)).componentInstance as OpportunityDetailView;
    expect(view.opportunityId()).toBe('7');
    expect(view.activityGroupId()).toBe('103');
    await up();
    expect($$('#ld2StepBar .ld2-step')).toHaveLength(5);
    expect($$('#ld2StepBar .ld2-step').findIndex((s) => s.classList.contains('ld2-step-active'))).toBe(2);
  });

  it('switches the tabs and remembers them in the tab for a reload (sessionStorage ld2_tab_state)', async () => {
    await create();
    await up();
    $<HTMLElement>('.ld2-tab[data-tab="extra"]').click();
    expect($('#ld2TabExtra').classList.contains('active')).toBe(true);
    expect($('#ld2TabContact').classList.contains('active')).toBe(false);
    $<HTMLElement>('.ld2-sub-tab[data-sub="pls"]').click();
    expect($('#ld2SubPls').classList.contains('active')).toBe(true);
    expect(JSON.parse(sessionStorage.getItem('ld2_tab_state')!)).toMatchObject({ leadId: '29', tab: 'extra', subTab: 'pls' });
  });

  it('fills the main tab from the customer and the master data (selects, phone code)', async () => {
    await create();
    await up();
    await settle(() => expect($<HTMLInputElement>('#ld2MName').value).toMatch(/\S/));
    await settle(() => expect($<HTMLSelectElement>('#ld2MPhoneCode').options.length).toBeGreaterThan(5));
    expect($<HTMLSelectElement>('#ld2MCountry').options.length).toBeGreaterThan(5);
    await settle(() => expect($<HTMLInputElement>('#ld2MPhone').value.length).toBeGreaterThan(5));
  });

  it('the interest dropdown opens and a choice is sent to the backend and shown', async () => {
    await create();
    await up();
    $('#ld2Interest').click();
    expect($('#ld2InterestDd').style.display).toBe('block');
    $<HTMLElement>('.ld2-int-opt[data-val="COLD"]').click();
    expect(text('#ld2InterestLabel')).toBe('COLD');
    expect($('#ld2InterestDd').style.display).toBe('none');
  });

  it('the schedule buttons leave the page through the router (window.open(…, "_self") in Java)', async () => {
    await create();
    await up();
    $<HTMLElement>('.ld2-add-btn[title="label.ld2.goto_schedule"]').click();
    expect(navigate).toHaveBeenCalledWith('/crm/schedule');
  });

  it('without Pipeline_Opportunity_Attachment_View the tab "เอกสารประกอบ" is there but its list is drawn as if there were no documents', async () => {
    await create();
    await up();
    await settle(() => expect($$('#ld2DocList .ld2-doc-row').length).toBeGreaterThan(0));
    fixture.destroy();
    TestBed.resetTestingModule();
    allowed = new Set(['CRM_Lead_View', 'CRM_ContactActivity_View', 'CRM_Schedule_View']);
    await create();
    await up();
    expect(el.querySelectorAll('.ld2-tab[data-tab="docs"]')).toHaveLength(1);
    await settle(() => expect($('#ld2DocList').textContent).toContain('label.ld2.no_supporting_docs_yet'));
    expect($$('#ld2DocList .ld2-doc-row')).toHaveLength(0);
  });

  it('a user without the edit / assign / close roles gets the Java page with those buttons hidden', async () => {
    allowed = new Set(['CRM_Lead_View', 'CRM_ContactActivity_View', 'CRM_Schedule_View']);
    session.update((s) => ({ ...s!, roles: [...allowed] }));
    await create();
    await up();
    expect($('#ld2EditTagBtn').style.display).toBe('none');
    expect($('#ld2AddProdBtn').style.display).toBe('none');
    expect($('#ldBtnCloseLead').style.display).toBe('none');
    expect($('#ldForwardLabel').style.display).toBe('none');
    expect($('#ld2AddApptBtn').style.display).toBe('none');
    session.update((s) => ({ ...s!, roles: ['super_admin'] }));
  });

  it('the pencil of the sales team, "+ เพิ่มพนักงานขาย / ผู้รับผิดชอบ", the "+" of the access rights, "+ เพิ่ม/แก้ไข Tag" and the "+" and the link of the appointment and of the task table hang under PL-OP-DT-01 … 06, 08, 09, 11, 12 (the head), 15 … 23 (the footer one of 20), 28 … 32, PL-OP-AS-01 and PL-OP-TG-01 (the save buttons of the change-salesperson and tag popups), PL-CA-AD-01 (the save button of the move-step popup): a code the user may not use takes away its button, and only that one, and the page still starts', async () => {
    // the link icon of a table has no id: it is the button of the head that sits right above the list of its table
    const linkOf = (list: string) => el.querySelector(`#${list}`)?.previousElementSibling?.querySelector('.ld2-add-btn[title="label.ld2.goto_schedule"]') ?? null;
    const BUTTONS: Record<string, () => Element | null> = {
      'PL-OP-DT-01': () => el.querySelector('#ld2TeamEditBtn'),
      'PL-OP-DT-02': () => el.querySelector('#ld2OwnerAddBtn'),
      'PL-OP-DT-03': () => el.querySelector('#ld2TeamAvs .ld2-acc-add-btn'),
      'PL-OP-DT-04': () => el.querySelector('#ld2EditTagBtn'),
      'PL-OP-DT-05': () => el.querySelector('#ld2AddApptBtn'),
      'PL-OP-DT-06': () => linkOf('ld2ApptList'),
      'PL-OP-DT-08': () => el.querySelector('#ld2AddWorkBtn'),
      'PL-OP-DT-09': () => linkOf('ld2TaskList'),
      'PL-OP-DT-11': () => el.querySelector('#ld2AddProdBtn'),
      'PL-OP-DT-12': () => el.querySelector('#ld2ProdDdStatic'), // the one of the head; the ones of the rows are in the next test
      'PL-OP-DT-15': () => el.querySelector('#ldFwdAddBtn'),
      'PL-OP-DT-16': () => el.querySelector('#ldForwardLabel'),
      'PL-OP-DT-17': () => el.querySelector('#ld2ContactSaveBtn'),
      'PL-OP-DT-18': () => el.querySelector('#ldBtnReturnStep'),
      'PL-OP-DT-19': () => el.querySelector('#ldBtnCloseGroup'),
      'PL-OP-DT-20': () => el.querySelector('#ldBtnCloseLead'), // the one of the footer; the one of the table view is in the next test
      'PL-OP-DT-21': () => el.querySelector('#ld2AvatarBtn'),
      'PL-OP-DT-22': () => el.querySelector('#ld2SaveMainBtn'), // and the ones of the "ข้อมูลเพิ่มเติม" tab: see the next test
      'PL-OP-DT-23': () => el.querySelector('#ld2UploadDocBtn'),
      'PL-OP-DT-28': () => el.querySelector('#ld2HistFilterBtn'),
      'PL-OP-DT-29': () => el.querySelector('#ld2PanelToggleBtn'),
      'PL-OP-DT-30': () => el.querySelector('#ld2GripBtn'),
      'PL-OP-DT-31': () => el.querySelector('#ld2HFClear'),
      'PL-OP-DT-32': () => el.querySelector('#ld2HFApply'),
      'PL-OP-AS-01': () => el.querySelector('#ld2SalesModalSaveBtn'), // the save button of the change-salesperson popup
      'PL-OP-TG-01': () => el.querySelector('#ld2TagSaveBtn'), // the save button of the tag popup
      'PL-CA-AD-01': () => el.querySelector('#ld2MsSubmitBtn'), // the save button of the move-step / contact popup
    };
    // One mount per code would be a page start each (more with every code that is added). The same is checked with ⌈log2(N+1)⌉ + 1 mounts: mount 0
    // denies nothing, mount b denies the codes whose (position + 1) has bit b set. Every code is denied in at least one mount, and any two codes
    // differ in a bit, so there is a mount where exactly one of the two is denied: a button must be there iff its own code is not denied.
    const codes = Object.keys(BUTTONS);
    const bits = Math.ceil(Math.log2(codes.length + 1));
    for (let mount = 0; mount <= bits; mount++) {
      deniedCodes = new Set(mount === 0 ? [] : codes.filter((_, i) => ((i + 1) >> (mount - 1)) & 1));
      // lead 27: a lead without workflow steps (n % 9 == 0 in the mock), the only kind whose access rights have the "+"
      await create({ leadId: '27' });
      await up();
      for (const [code, find] of Object.entries(BUTTONS)) expect(!!find(), `${code} with [${[...deniedCodes].join(' ')}] denied`).toBe(!deniedCodes.has(code));
      fixture.destroy();
      TestBed.resetTestingModule();
      sessionStorage.clear();
    }
  }, 40000);

  it('the history filter loads its lists and applies a choice to the history', async () => {
    await create();
    await up();
    const all = $$('#ld2HistList .ld2-hist-item').length;
    $('#ld2HistFilterBtn').click();
    expect($('#ld2HistFilterOverlay').classList.contains('show')).toBe(true);
    await settle(() => expect($('#ld2HFBody').style.display).toBe('block'));
    const owner = $<HTMLSelectElement>('#ld2HFOwner');
    await settle(() => expect(owner.options.length).toBeGreaterThan(3));
    owner.value = '1002';
    owner.dispatchEvent(new Event('change', { bubbles: true }));
    $('#ld2HFApply').click();
    expect($('#ld2HistFilterOverlay').classList.contains('show')).toBe(false);
    expect($$('#ld2HistList .ld2-hist-item').length).toBeLessThan(all);
  });

  it('the table view opens from the grip, shows the groups of the lead and goes back', async () => {
    await create();
    await up();
    $('#ld2GripBtn').click();
    expect($('#ld2TableView').style.display).toBe('flex');
    expect($('#ld2CenterCol').style.display).toBe('none');
    await settle(() => expect($$('#ld2TableContent .ld2-tv-group')).toHaveLength(5));
    expect(sessionStorage.getItem('ld2_tableview_open')).toBe('29');
    $('.ld2-tv-back').click();
    expect($('#ld2CenterCol').style.display).toBe('flex');
    expect(sessionStorage.getItem('ld2_tableview_open')).toBeNull();
  });

  it('forwarding to other people: the switch shows the first card with the groups the lead can go to', async () => {
    await create();
    await up();
    $('#ldForwardSlider').click();
    expect($('#ldForwardPanel').style.display).toBe('');
    await settle(() => expect($$('#ldForwardList .ld2-fwd-card')).toHaveLength(1));
    await settle(() => expect($$('#ld2FwdGroupDd1 .ld2-prod-dd-item').map((i) => i.dataset['val'])).toEqual(['101', '102', '103', '104']));
  });

  it('the table view: "+ เพิ่มการติดต่อ" hangs under PL-OP-DT-26 and "จบขั้นตอน" under PL-OP-DT-27: a denied code takes away its button only, and a denied "จบขั้นตอน" leaves the "—" of Java in its cell', async () => {
    const count = (sel: string) => $$(`#ld2TableContent ${sel}`).length;
    const openTable = async (denied: string[]) => {
      deniedCodes = new Set(denied);
      await create();
      await up();
      $('#ld2GripBtn').click();
      await settle(() => expect($$('#ld2TableContent .ld2-tv-group').length).toBeGreaterThan(0));
    };
    await openTable([]);
    const add = count('.ld2-tv-addct-btn');
    const end = count('.ld2-tv-end-btn');
    expect(add).toBeGreaterThan(0);
    expect(end).toBeGreaterThan(0);
    const dashes = () => $$('#ld2TableContent td span[style*="D1D5DB"]').length;
    const dashesBefore = dashes();

    for (const [denied, addNow, endNow] of [['PL-OP-DT-26', 0, end], ['PL-OP-DT-27', add, 0]] as const) {
      fixture.destroy();
      TestBed.resetTestingModule();
      sessionStorage.clear();
      await openTable([denied]);
      expect(count('.ld2-tv-addct-btn'), `add with ${denied} denied`).toBe(addNow);
      expect(count('.ld2-tv-end-btn'), `end with ${denied} denied`).toBe(endNow);
      if (denied === 'PL-OP-DT-27') expect(dashes()).toBe(dashesBefore + end); // the cell of the button shows "—"
    }
  }, 30000);

  it('the "ปิดโอกาสขาย" of the table view hangs under PL-OP-DT-20 like the one of the footer: without it the cell shows "—", never another button in its place', async () => {
    // lead 239 has one activity group (see the mock): its current step can be the last row, the only one with "ปิดโอกาสขาย"
    const closeBtns = () => $$('#ld2TableContent .ld2-tv-close-btn');
    const openTable = async () => {
      await create({ leadId: '239' });
      await up();
      $('#ld2GripBtn').click();
      await settle(() => expect($$('#ld2TableContent .ld2-tv-group').length).toBeGreaterThan(0));
    };
    await openTable();
    expect(closeBtns()).toHaveLength(1);
    const rowsWithDash = () => $$('#ld2TableContent tr').filter((r) => r.querySelector('td:last-child span[style*="D1D5DB"]'));
    const dashesBefore = rowsWithDash().length;
    const extraAddBtns = $$('#ld2TableContent .ld2-tv-add-btn').length;

    fixture.destroy();
    TestBed.resetTestingModule();
    sessionStorage.clear();
    deniedCodes = new Set(['PL-OP-DT-20']);
    await openTable();
    expect(closeBtns()).toHaveLength(0);
    expect(rowsWithDash().length).toBe(dashesBefore + 1); // the cell shows "—"
    expect($$('#ld2TableContent .ld2-tv-add-btn')).toHaveLength(extraAddBtns); // and no "+ เพิ่มการติดต่อ" took its place
  }, 20000);

  it('"อัปเดตข้อมูล" of the main tab and of every sub-tab of "ข้อมูลเพิ่มเติม" hang under the one code PL-OP-DT-22: without it none of the 18 is drawn', async () => {
    const saveButtons = () => $$('#ld2SaveMainBtn, .ld2-ef-update-btn button');
    await create();
    await up();
    expect(saveButtons()).toHaveLength(18); // 1 of the main tab + 17 of the additional-info tab

    fixture.destroy();
    TestBed.resetTestingModule();
    sessionStorage.clear();
    deniedCodes = new Set(['PL-OP-DT-22']);
    await create();
    await up();
    expect(saveButtons()).toHaveLength(0);
    // the pages around them are there: the tab, its sub-tabs, the upload button of the documents
    expect($('#ld2UploadDocBtn')).toBeTruthy();
  }, 20000);

  it('the download icon of a sales-document card hangs under PL-OP-DT-25: without it the cards are drawn without it, and the download of a supporting document (another code) stays', async () => {
    await create();
    await up();
    await settle(() => expect($$('#ld2SaleDocGrid .ld2-sale-card').length).toBeGreaterThan(0));
    const cards = $$('#ld2SaleDocGrid .ld2-sale-card').length;
    expect($$('#ld2SaleDocGrid .ld2-sale-dl-btn')).toHaveLength(cards);
    const docDl = $$('#ld2DocList .ld2-dl-btn').length;
    expect(docDl).toBeGreaterThan(0);

    fixture.destroy();
    TestBed.resetTestingModule();
    sessionStorage.clear();
    deniedCodes = new Set(['PL-OP-DT-25']);
    await create();
    await up();
    await settle(() => expect($$('#ld2SaleDocGrid .ld2-sale-card')).toHaveLength(cards));
    expect($$('#ld2SaleDocGrid .ld2-sale-dl-btn')).toHaveLength(0);
    expect($$('#ld2DocList .ld2-dl-btn')).toHaveLength(docDl);
  }, 20000);

  it('the download of a supporting-document row hangs under PL-OP-DT-24: without it the rows are drawn without it, and the download of a sales document (another code) stays', async () => {
    await create();
    await up();
    await settle(() => expect($$('#ld2DocList .ld2-doc-row').length).toBeGreaterThan(0));
    const rows = $$('#ld2DocList .ld2-doc-row').length;
    expect($$('#ld2DocList .ld2-dl-btn:not(.ld2-doc-del-btn)')).toHaveLength(rows);
    const saleDl = $$('.ld2-sale-dl-btn').length;
    expect(saleDl).toBeGreaterThan(0);

    fixture.destroy();
    TestBed.resetTestingModule();
    sessionStorage.clear();
    deniedCodes = new Set(['PL-OP-DT-24']);
    await create();
    await up();
    await settle(() => expect($$('#ld2DocList .ld2-doc-row')).toHaveLength(rows));
    expect($$('#ld2DocList .ld2-dl-btn:not(.ld2-doc-del-btn)')).toHaveLength(0);
    expect($$('.ld2-sale-dl-btn')).toHaveLength(saleDl);
  }, 20000);

  it('"ลบ" after the download of a supporting-document row needs Pipeline_Opportunity_Attachment_Delete, and asks before it deletes', async () => {
    await create();
    await up();
    await settle(() => expect($$('#ld2DocList .ld2-doc-row').length).toBeGreaterThan(0));
    const rows = $$('#ld2DocList .ld2-doc-row').length;
    expect($$('#ld2DocList .ld2-doc-del-btn')).toHaveLength(rows);
    // it comes after the download button in the same row
    const first = $<HTMLElement>('#ld2DocList .ld2-doc-row');
    expect([...first.querySelectorAll('button')].map((b) => b.classList.contains('ld2-doc-del-btn'))).toEqual([false, true]);
    swal.mockClear();
    $<HTMLElement>('#ld2DocList .ld2-doc-del-btn').click();
    await settle(() => expect(swal).toHaveBeenCalledTimes(1));
    expect(swal.mock.calls[0][0]).toMatchObject({ title: 'label.contracts.confirm_delete_doc', icon: 'warning', dangerMode: true });

    fixture.destroy();
    TestBed.resetTestingModule();
    sessionStorage.clear();
    allowed = new Set(['CRM_Lead_View', 'CRM_ContactActivity_View', 'CRM_Schedule_View', 'Pipeline_Opportunity_Attachment_View']);
    await create();
    await up();
    await settle(() => expect($$('#ld2DocList .ld2-doc-row')).toHaveLength(rows));
    expect($$('#ld2DocList .ld2-doc-del-btn')).toHaveLength(0);
  }, 20000);

  it('the trash icon of a forward card hangs under PL-OP-DT-14: without it the card is drawn without the icon, and the switch and the save button stay', async () => {
    await create();
    await up();
    $('#ldForwardSlider').click();
    await settle(() => expect($$('#ldForwardList .ld2-fwd-card')).toHaveLength(1));
    expect($$('#ldForwardList .ld2-fwd-trash')).toHaveLength(1);

    fixture.destroy();
    TestBed.resetTestingModule();
    sessionStorage.clear();
    deniedCodes = new Set(['PL-OP-DT-14']);
    await create();
    await up();
    $('#ldForwardSlider').click();
    await settle(() => expect($$('#ldForwardList .ld2-fwd-card')).toHaveLength(1));
    expect($$('#ldForwardList .ld2-fwd-trash')).toHaveLength(0);
    expect($('#ldForwardLabel')).toBeTruthy();
    expect($('#ld2ContactSaveBtn')).toBeTruthy();
  }, 20000);

  it('the quotation button of every product row hangs under PL-OP-DT-12 like the one of the head: without it the rows are drawn without it, and "+ เพิ่มผลิตภัณฑ์" stays', async () => {
    await create();
    await up();
    const rows = $$('#ld2ProdList [data-mat-id]').length;
    expect(rows).toBeGreaterThan(0);
    expect($$('#ld2ProdList .ld2-prod-action')).toHaveLength(rows);

    fixture.destroy();
    TestBed.resetTestingModule();
    sessionStorage.clear();
    deniedCodes = new Set(['PL-OP-DT-12']);
    await create();
    await up();
    expect($$('#ld2ProdList [data-mat-id]')).toHaveLength(rows);
    expect($$('#ld2ProdList .ld2-prod-action')).toHaveLength(0);
    expect(el.querySelector('#ld2ProdDdStatic')).toBeNull();
    expect($('#ld2AddProdBtn')).toBeTruthy();
  }, 20000);

  it('the appointment card opens the view dialog on a click only with PL-OP-DT-07: without it the card is still drawn, with no click and no hand cursor', async () => {
    await create();
    await up();
    $('#ld2ApptList .ld2-appt-card').click();
    expect($('#ld2ViewWorkOverlay').classList.contains('show')).toBe(true);
    $('#ld2ViewWorkOverlay .ld2-aw-close').click();
    expect($('#ld2ViewWorkOverlay').classList.contains('show')).toBe(false);

    fixture.destroy();
    TestBed.resetTestingModule();
    sessionStorage.clear();
    deniedCodes = new Set(['PL-OP-DT-07']);
    await create();
    await up();
    const card = $('#ld2ApptList .ld2-appt-card');
    expect(card.getAttribute('onclick')).toBeNull();
    expect(card.style.cursor).toBe('');
    expect(text('#ld2ApptList .ld2-appt-title')).toMatch(/\S/);
    card.click();
    expect($('#ld2ViewWorkOverlay').classList.contains('show')).toBe(false);
    // the task card next to it is another code (PL-OP-DT-10) and keeps its click
    $('#ld2TaskList .ld2-task-card').click();
    expect($('#ld2ViewWorkOverlay').classList.contains('show')).toBe(true);
  }, 20000);

  it('the task card opens the view dialog on a click only with PL-OP-DT-10: without it the card is still drawn, with no click, and the appointment card keeps its own', async () => {
    deniedCodes = new Set(['PL-OP-DT-10']);
    await create();
    await up();
    const card = $('#ld2TaskList .ld2-task-card');
    expect(card.getAttribute('onclick')).toBeNull();
    expect(text('#ld2TaskList .ld2-task-title')).toMatch(/\S/);
    card.click();
    expect($('#ld2ViewWorkOverlay').classList.contains('show')).toBe(false);
    $('#ld2ApptList .ld2-appt-card').click();
    expect($('#ld2ViewWorkOverlay').classList.contains('show')).toBe(true);
  }, 20000);

  it('the work modal: a task card opens the view dialog with the task, the cross closes it', async () => {
    await create();
    await up();
    $('#ld2TaskList .ld2-task-card').click();
    expect($('#ld2ViewWorkOverlay').classList.contains('show')).toBe(true);
    expect(text('#ld2VwTitle')).toBe('label.ld2.task');
    expect(text('#ld2VwSubject')).toMatch(/\S/);
    expect(text('#ld2VwDate')).toMatch(/^\d{2}\/\d{2}\/\d{4}$/);
    $('#ld2ViewWorkOverlay .ld2-aw-close').click();
    expect($('#ld2ViewWorkOverlay').classList.contains('show')).toBe(false);
  });

  it('the work modal: "+" opens the add dialog, an empty subject is refused, a filled one is saved and the page starts again with it (Java: reload)', async () => {
    await create();
    await up();
    const first = fixture.debugElement.query(By.directive(OpportunityDetailView)).componentInstance;
    $('#ld2AddApptBtn').click();
    expect($('#ld2AddWorkOverlay').classList.contains('show')).toBe(true);
    expect(text('#ld2AwTitle')).toBe('label.ld2.add_appointment');
    $('#ld2AwSubmitBtn').click();
    expect(swal).toHaveBeenCalledWith(expect.objectContaining({ icon: 'warning', text: 'label.ld2.please_specify_subject' }));
    $<HTMLInputElement>('#ld2AwSubject').value = 'นัดพบเพื่อเซ็นสัญญา';
    $<HTMLTextAreaElement>('#ld2AwDetail').value = 'เตรียมเอกสารตัวจริง';
    $<HTMLInputElement>('#ld2AwDate').value = '2026-10-28';
    $('#ld2AwSubmitBtn').click();
    await settle(() => expect($('#wmSuccessOverlay').classList.contains('show')).toBe(true));
    await settle(() => expect(fixture.debugElement.query(By.directive(OpportunityDetailView))?.componentInstance).not.toBe(first), 8000);
    await up();
    for (let i = 0; i < 3; i++) $('#ld2ApptList button[onclick*="ldApptNext"]').click();
    expect(text('#ld2ApptList .ld2-appt-title')).toBe('นัดพบเพื่อเซ็นสัญญา');
  }, 20000);

  it('saving a contact note shows the success box and starts the page again with the new note in the history (Java: reload)', async () => {
    await create();
    await up();
    const first = fixture.debugElement.query(By.directive(OpportunityDetailView)).componentInstance;
    $<HTMLTextAreaElement>('#ld2ContactTa').value = 'โทรหาลูกค้าแล้ว';
    $('#ld2ContactSaveBtn').click();
    await settle(() => expect(document.body.textContent).toContain('label.ld2.forward_done'));
    await settle(() => expect(fixture.debugElement.query(By.directive(OpportunityDetailView))?.componentInstance).not.toBe(first), 8000);
    await up();
    await settle(() => expect($('#ld2HistList').textContent).toContain('โทรหาลูกค้าแล้ว'));
    // the new view has its own update-confirm modal (the old one removed only what it had moved to <body>) and the old toast is gone
    expect($('#ld2UpdConfirmModal')).toBeTruthy();
    expect(document.body.querySelectorAll(':scope > div[style*="99999"]')).toHaveLength(0);
  }, 20000);

  it('a failed save is reported by the error popup of the template, and the page stays', async () => {
    await create();
    await up();
    $<HTMLTextAreaElement>('#ld2ContactTa').value = 'พัง [500]';
    $('#ld2ContactSaveBtn').click();
    await settle(() => expect(win()['crmShowError']).toHaveBeenCalled());
    expect(fixture.debugElement.queryAll(By.directive(OpportunityDetailView))).toHaveLength(1);
    expect($('#ld2ContactSaveBtn').textContent).toBe('chat.save');
  });

  it('an unreachable lead (403) says why in a dialog and draws nothing', async () => {
    await create({ leadId: '900' });
    await settle(() => expect(swal).toHaveBeenCalledWith(expect.objectContaining({ icon: 'error', text: expect.stringContaining('ไม่มีสิทธิ์') })));
    expect(text('#ld2CustCode')).not.toMatch(/^P\d{5}$/);
  });

  it('leaving the page puts everything back: listeners, window functions and flags, the nodes moved to <body>', async () => {
    const added: Array<[string, EventListenerOrEventListenerObject]> = [];
    const addDoc = document.addEventListener.bind(document);
    const remDoc = document.removeEventListener.bind(document);
    const addWin = window.addEventListener.bind(window);
    const remWin = window.removeEventListener.bind(window);
    const isPage = () => true;
    vi.spyOn(document, 'addEventListener').mockImplementation(((type: string, fn: EventListenerOrEventListenerObject, o?: unknown) => (isPage() && added.push([type, fn]), addDoc(type, fn, o as never))) as never);
    vi.spyOn(document, 'removeEventListener').mockImplementation(((type: string, fn: EventListenerOrEventListenerObject, o?: unknown) => {
      const i = added.findIndex((a) => a[0] === type && a[1] === fn);
      if (i >= 0) added.splice(i, 1);
      remDoc(type, fn, o as never);
    }) as never);
    vi.spyOn(window, 'addEventListener').mockImplementation(((type: string, fn: EventListenerOrEventListenerObject, o?: unknown) => (isPage() && added.push([type, fn]), addWin(type, fn, o as never))) as never);
    vi.spyOn(window, 'removeEventListener').mockImplementation(((type: string, fn: EventListenerOrEventListenerObject, o?: unknown) => {
      const i = added.findIndex((a) => a[0] === type && a[1] === fn);
      if (i >= 0) added.splice(i, 1);
      remWin(type, fn, o as never);
    }) as never);
    await create();
    await up();
    $<HTMLElement>('.ld2-tab[data-tab="main"]').click();
    $('#ld2SaveMainBtn').click(); // moves the update-confirm modal to <body>
    expect(document.getElementById('ld2UpdConfirmModal')!.parentElement).toBe(document.body);
    expect(added.length).toBeGreaterThan(10);
    expect(typeof win()['ldEditTags']).toBe('function');
    expect(typeof win()['wmOpenView']).toBe('function');
    expect(win()['LD2_MY_EMPLOYEE_ID']).toBe('1001');
    fixture.destroy();
    // (popstate / hashchange are Angular's Location, which lives as long as the TestBed — not the page's)
    expect(added.filter(([type]) => type !== 'popstate' && type !== 'hashchange')).toEqual([]);
    expect(win()['ldEditTags']).toBeUndefined();
    expect(win()['wmOpenView']).toBeUndefined();
    expect(win()['ldOpenAddAppt']).toBeUndefined();
    expect(win()['LD2_MY_EMPLOYEE_ID']).toBeUndefined();
    expect(win()['_ldApiLead']).toBeUndefined();
    // nothing of the page is left directly under <body> (the update-confirm modal was moved there; the popover too once it is opened)
    expect(document.body.querySelector(':scope > #ld2UpdConfirmModal')).toBeNull();
    expect(document.body.querySelector(':scope > #ldAccessPop')).toBeNull();
  });

  it('leaving the page before the lead arrived: the late answer paints nothing and nothing throws', async () => {
    const errors = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    await create();
    const card = $('#ld2CustCode');
    await new Promise((r) => setTimeout(r, 60));
    fixture.destroy();
    await new Promise((r) => setTimeout(r, 500)); // the mock answers after 120 ms
    expect(card.textContent).not.toMatch(/^P\d{5}$/);
    expect(errors).not.toHaveBeenCalled();
  });

  it('a language switch is a page reload in Java: a NEW page instance', async () => {
    await create();
    await up();
    const first = fixture.debugElement.query(By.directive(OpportunityDetailView)).componentInstance;
    lang.set('en');
    fixture.detectChanges();
    TestBed.tick?.();
    await settle(() => expect(fixture.debugElement.query(By.directive(OpportunityDetailView)).componentInstance).not.toBe(first));
    await up();
  });

  it('a picture at an http(s) address loads from that address: there is no /docproxy of the BFF any more (the host answers env.docProxy with the address itself)', async () => {
    const real = createMockLeadDetail({ delayMs: 0, employeeId: 1001 });
    vi.spyOn(OpportunityDetailView.prototype as unknown as { backend(): Promise<unknown> }, 'backend').mockImplementation(async () => ({
      initial: () => real.initial(),
      fetch: async (url: string, init?: RequestInit) => {
        const r = await real.fetch(url, init);
        if (!/board\/lead\?/.test(url)) return r;
        const body = await r.json();
        body.prospect.attachFile = 'http://files.test/p/5.png';
        return new Response(JSON.stringify(body), { status: 200, headers: { 'Content-Type': 'application/json' } });
      },
    }));
    await create();
    await up();
    expect($('#ld2CustAv img').getAttribute('src')).toBe('http://files.test/p/5.png');
    expect($$('img').every((i) => !(i.getAttribute('src') ?? '').includes('docproxy'))).toBe(true);
  });

  describe('against the real backend (mock off): the live backend answers the addresses of the Java page from REST calls', () => {
    let http: HttpTestingController;
    /** what the page's live backend asked of the REST service, as `METHOD path-below-the-api` */
    let seen: string[];
    /** the bodies it sent to the service, by `METHOD path` */
    let sent: Record<string, any>;
    const sample = createMockLeadDetail({ delayMs: 0, employeeId: 1001 });
    const ask = async (bff: string, init?: RequestInit): Promise<{ status: number; json: any }> => {
      const r = await sample.fetch(bff, init);
      return { status: r.status, json: await r.json() };
    };
    /** the REST service of the test: the shapes of triplesale-service (an envelope with `result`), made from the sample set of the mock */
    async function service(method: string, rel: string, body: unknown): Promise<{ status: number; body: unknown }> {
      const envelope = (result: unknown, status = 200) => ({ status: 200, body: { status, message: 'success', result } });
      let g: RegExpExecArray | null;
      if (method === 'GET' && (g = /^\/opportunities\/(\d+)(?:\?activityGroupId=(\d+))?$/.exec(rel))) {
        const r = await ask(`board/lead?id=${g[1]}`);
        return r.status === 200 ? envelope(r.json) : { status: r.status, body: r.json };
      }
      if (method === 'GET' && (g = /^\/leads\/(\d+)\/activity-groups$/.exec(rel))) return { status: 200, body: (await ask(`board/activity-groups?leadId=${g[1]}`)).json };
      if (method === 'GET' && (g = /^\/leads\/(\d+)\/activity-steps/.exec(rel))) return envelope((await ask(`board/activity-steps?leadId=${g[1]}`)).json);
      if (method === 'GET' && (g = /^\/leads\/(\d+)\/(contact-history|forward-groups|accessors)/.exec(rel))) return { status: 200, body: (await ask(`board/lead/${g[2]}?leadId=${g[1]}`)).json };
      if (method === 'POST' && (g = /^\/leads\/(\d+)\/(close|contact-activities)$/.exec(rel))) {
        sent[`${method} ${rel}`] = JSON.parse(String(body));
        return { status: 200, body: { status: 200, message: 'success' } };
      }
      if (method === 'GET' && rel.startsWith('/master-data/countries')) return envelope([{ code: 'THA', phoneCountryCode: '+66', phoneNumberFormat: 'XX XXX XXXX / X XXXX XXXX' }]);
      if (method === 'GET' && rel.startsWith('/master-data/')) return envelope([]);
      if (method === 'GET' && /^\/prospects\/\d+$/.test(rel)) return envelope((await ask('board/prospect?id=5')).json);
      if (method === 'GET' && rel.startsWith('/rv/attachments')) return envelope([]);
      if (method === 'GET' && /^\/prospects\/\d+\/attachments$/.test(rel)) return envelope([]);
      return { status: 404, body: { status: 404, message: `no such route ${method} ${rel}` } };
    }
    /** answers every request the page has made, until `done()` */
    const pump = (done: () => boolean) =>
      settle(async () => {
        for (const r of http.match(() => true)) {
          const rel = r.request.url.slice(SERVICE.length);
          seen.push(`${r.request.method} ${rel}`);
          const out = await service(r.request.method, rel, r.request.body);
          r.flush(JSON.stringify(out.body), { status: out.status, statusText: out.status === 200 ? 'OK' : 'Error' });
        }
        expect(done()).toBe(true);
      });
    const started = async (opts: { leadId?: string; group?: string } = {}): Promise<void> => {
      await create({ mock: false, ...opts });
      http = TestBed.inject(HttpTestingController);
    };
    const ready = () => /^P\d{5}$/.test(text('#ld2CustCode')) && !$('#ld2HistList .ld2-sk');

    beforeEach(() => {
      seen = [];
      sent = {};
    });

    it('the lead is drawn from the REST service (not the sample data, not the BFF): GET /opportunities/{id} and nothing of the old master data', async () => {
      const fetchSpy = vi.spyOn(globalThis, 'fetch');
      await started();
      await pump(ready);
      expect(el.querySelector('ts-live-missing')).toBeNull();
      expect(seen).toContain('GET /opportunities/29');
      expect(seen).not.toContain('GET /leads/29/activity-groups'); // not asked: the step groups answer '{}' at once
      // the old reads the service no longer has are not asked (the page keeps going with empty lists)
      expect(seen.some((u) => u.startsWith('GET /leads/29/') || u.startsWith('GET /master-data/'))).toBe(false);
      // nothing of the BFF: every call is a REST call, none goes through the global fetch
      expect(seen.every((u) => !u.includes('/board/'))).toBe(true);
      expect(fetchSpy).not.toHaveBeenCalled();
      // no step groups from the service: the step bar is inferred from the task / appointment lists (3 groups in this sample)
      expect($$('#ld2StepBar .ld2-step')).toHaveLength(3);
      // the one value the server rendered into the markup: the accept list of the file input, the way FileServerAccess.uploadAcceptAttr() joins it
      expect($<HTMLInputElement>('#ld2FileInput').getAttribute('accept')).toBe(MOCK_UPLOAD_ACCEPT);
    });

    it('the group the lead was opened in goes to the service as ?activityGroupId=', async () => {
      await started({ leadId: '7', group: '103' });
      await pump(ready);
      expect(seen).toContain('GET /opportunities/7?activityGroupId=103');
    });

    it('a user without CRM_Lead_View gets the 403 of the servlet and no call to the service', async () => {
      allowed = new Set(['CRM_ContactActivity_View']);
      await started();
      await pump(() => (swal.mock.calls as unknown[][]).length > 0);
      expect(swal).toHaveBeenCalledWith(expect.objectContaining({ icon: 'error', text: 'label.ld2.lead_no_permission' }));
      expect(seen).not.toContain('GET /opportunities/29');
    });

    it('a refusal of the service (403) is shown with its own message and nothing is drawn', async () => {
      await started({ leadId: '900' });
      await pump(() => (swal.mock.calls as unknown[][]).length > 0);
      expect(swal).toHaveBeenCalledWith(expect.objectContaining({ icon: 'error', text: expect.stringContaining('ไม่มีสิทธิ์') }));
      expect(text('#ld2CustCode')).not.toMatch(/^P\d{5}$/);
    });

    it('saving a contact note posts it to the service: the lead is in the path, not in the body; the channel is the label of the o2o combo', async () => {
      await started();
      await pump(ready);
      $<HTMLTextAreaElement>('#ld2ContactTa').value = 'โทรหาลูกค้าแล้ว';
      $('#ld2ContactSaveBtn').click();
      await pump(() => 'POST /leads/29/contact-activities' in sent);
      const body = sent['POST /leads/29/contact-activities'];
      expect(body.leadId).toBeUndefined();
      expect(body.content).toBe('โทรหาลูกค้าแล้ว');
      expect(body.channel).toBe('Manual');
    });

    it('closing the lead posts {outcome} to POST /leads/{id}/close (LeadCloseServlet); the success box and the new page follow the answer', async () => {
      await started();
      await pump(ready);
      const first = fixture.debugElement.query(By.directive(OpportunityDetailView)).componentInstance;
      $('#ldBtnCloseLead').click();
      expect($('#ld2CloseLeadModal').style.display).toBe('flex');
      $<HTMLElement>('#ld2CloseLeadModal button[onclick*="ldConfirmCloseLead"]').click();
      await pump(() => 'POST /leads/29/close' in sent);
      expect(sent['POST /leads/29/close']).toEqual({ outcome: 'sold' });
      await pump(() => fixture.debugElement.query(By.directive(OpportunityDetailView))?.componentInstance !== first);
    }, 20000);

    it('the file input of a document, the master data of the cards and the customer all come from the service too (no /board/ address is asked)', async () => {
      await started();
      await pump(ready);
      $<HTMLElement>('.ld2-tab[data-tab="main"]').click();
      await pump(() => seen.some((u) => u.startsWith('GET /prospects/')));
      expect(seen.some((u) => u.startsWith('GET /master-data/'))).toBe(false); // gone: not asked
      expect(seen.every((u) => !u.includes('/board/'))).toBe(true);
    });

    it('the PDF of a receipt (../rvreport?txno=) opens a tab with the words of the receipts page: there is no servlet and no REST endpoint for it', async () => {
      await started();
      await pump(ready);
      const open = vi.spyOn(window, 'open').mockReturnValue(null);
      const create = vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:report');
      const host = fixture.debugElement.query(By.directive(OpportunityDetailView)).componentInstance as unknown as { open(url: string, target?: string): void };
      host.open('../rvreport?txno=RV%3AM13-2610-00031', '_blank');
      expect(open).toHaveBeenCalledWith('blob:report', '_blank');
      const blob = create.mock.calls[0][0] as Blob;
      expect(await blob.text()).toContain('RV:M13-2610-00031');
      // and any other address that is not a page of the app is opened as it is
      host.open('https://files.test/doc.pdf', '_blank');
      expect(open).toHaveBeenLastCalledWith('https://files.test/doc.pdf', '_blank');
    });
  });
});
