import { signal } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { By } from '@angular/platform-browser';
import { Router, provideRouter } from '@angular/router';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AuthService } from '@core/auth/auth.service';
import { SessionInfo } from '@core/auth/auth.models';
import { ConfigService } from '@core/config/config.service';
import { I18n } from '@core/i18n/i18n.service';
import { PermissionService } from '@core/permissions/permission.service';
import { fakeRest } from '@core/live/rest-fake';
import { configStub } from '@core/testing/test-helpers';
import { Activities } from './activities';
import { ActivitiesView } from './activities-view';
import { createLiveActivities } from './activities.live';
import { resetMockActivities } from './activities.mock';

const session = signal<SessionInfo | null>({
  username: 'demo', profileName: 'Demo', employeeId: 1001, employeeCode: 'E101', branch: { id: 1, code: 'SUN', name: 'SUN' }, branchCode: 'SUN', roles: ['super_admin'],
});
const lang = signal<'th' | 'en'>('th');
const t = (k: string) => k;

/**
 * The inline handlers of the Java markup (`onclick="window.acOpen(…)"`) run in the jsdom realm, whose `window` is not the object the engine
 * (a module of the test realm) puts its functions on — in a browser they are the same. So the functions the engine publishes are copied over
 * to the realm of the handlers as soon as they exist.
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
  for (const k of Object.keys(w)) if (/^(ac|wm|ld|_ac|LD2_)/.test(k)) realm[k] = w[k];
};

describe('Activities page (pages/activity.xhtml + components/work_modal.xhtml, generated)', () => {
  let fixture: ComponentFixture<Activities>;
  let el: HTMLElement;
  let swal: ReturnType<typeof vi.fn<(o: unknown) => Promise<unknown>>>;
  let denied: Set<string>;
  /** button codes (core/permissions/access-buttons.ts) the signed-in user may not use */
  let deniedCodes: Set<string>;
  let bridgeTimer: ReturnType<typeof setInterval> | undefined;

  const $ = <T extends HTMLElement = HTMLElement>(sel: string) => el.querySelector<T>(sel)!;
  const $$ = <T extends HTMLElement = HTMLElement>(sel: string) => [...el.querySelectorAll<T>(sel)];
  const text = (sel: string) => ($(sel)?.textContent ?? '').trim();
  const settle = (fn: () => void, timeout = 6000) => vi.waitFor(fn, { timeout, interval: 40 });
  /** the page is up when the first page of the list is in the table and the panel has the first lead */
  const up = () => settle(() => {
    expect($$('#acBody0 tr.p-row').length).toBeGreaterThan(0);
    expect(text('#acDName')).not.toBe('-');
  });
  const typeIn = (sel: string, v: string) => {
    const i = $<HTMLInputElement>(sel);
    i.value = v;
    i.dispatchEvent(new Event('input', { bubbles: true }));
    i.dispatchEvent(new Event('change', { bubbles: true }));
  };

  async function create(mock = true): Promise<void> {
    TestBed.configureTestingModule({
      providers: [
        provideRouter([]),
        { provide: ConfigService, useValue: configStub({ mock }) },
        { provide: AuthService, useValue: { session } },
        { provide: I18n, useValue: { lang, t, use: async (l: 'th' | 'en') => lang.set(l) } },
        { provide: PermissionService, useValue: { has: (k: string) => !denied.has(k), canUse: (code: string) => !deniedCodes.has(code) } },
      ],
    });
    fixture = TestBed.createComponent(Activities);
    document.body.appendChild(fixture.nativeElement);
    fixture.detectChanges();
    el = fixture.nativeElement as HTMLElement;
    // the engine starts after the first change detection (a dynamic import of the mock) and again after a language switch: whatever it
    // publishes is copied to the inline handlers at once
    bridgeTimer ??= setInterval(bridge, 2);
  }

  beforeEach(() => {
    resetMockActivities();
    localStorage.removeItem('ts_activity_selected_mt'); // the product the user chose last time
    lang.set('th');
    denied = new Set();
    deniedCodes = new Set();
    // the page opens the first lead by clicking its row, right after it published its functions: hand them over before any click, not on the
    // next tick of the interval (that was a race, lost when the machine was busy)
    const nativeClick = HTMLElement.prototype.click;
    vi.spyOn(HTMLElement.prototype, 'click').mockImplementation(function (this: HTMLElement) {
      bridge();
      nativeClick.call(this);
    });
    swal = vi.fn<(o: unknown) => Promise<unknown>>(async () => undefined);
    vi.spyOn(ActivitiesView.prototype as unknown as { swal(o: unknown): Promise<unknown> }, 'swal').mockImplementation((o) => swal(o));
    // jsdom loads no scripts: stand in for step_group_color.js (the page asks it for the colour of a workflow group)
    vi.spyOn(ActivitiesView.prototype as unknown as { loadHelpers(): Promise<unknown> }, 'loadHelpers').mockImplementation(async () => {
      (window as unknown as Record<string, unknown>)['StepGroupColor'] = { buildMeta: (items: unknown[]) => ({ total: items.length }), resolve: () => '#0C8E6A', tagStyle: (hex: string) => `color:${hex};`, color: () => '#0C8E6A' };
    });
  });
  afterEach(() => {
    clearInterval(bridgeTimer);
    bridgeTimer = undefined;
    fixture?.destroy();
    TestBed.resetTestingModule();
    vi.restoreAllMocks();
    delete (window as unknown as Record<string, unknown>)['StepGroupColor'];
  });

  it('is the markup of the Java page: product, statistics, the two sub-tabs, the three tables, the panel and the dialogs', async () => {
    await create();
    await up();
    expect($$('.ac-subtab').map((b) => b.dataset['subtab'])).toEqual(['0', '1']);
    expect(['acTable0', 'acTable1', 'acTableB'].every((id) => !!$('#' + id))).toBe(true);
    expect(['acRightWrap', 'acFilterOverlay', 'acContactOverlay', 'acItemOverlay', 'ld2ViewWorkOverlay', 'ld2AddWorkOverlay', 'wmSuccessOverlay'].every((id) => !!$('#' + id))).toBe(true);
    expect($('#acTable0 thead th:nth-child(2)').textContent).toContain('label.template.last_contact');
  });

  it('draws the first page from the backend: product, statistics, 20 rows, the first lead open in the panel', async () => {
    await create();
    await up();
    expect(text('#acProdLabel')).toBe('สินเชื่อบ้าน');
    expect($$('#acProdDd .ac-prod-dd-item')).toHaveLength(5);
    expect($$('#acStatsRow .ac-stat-item').map((i) => i.querySelector('.ac-stat-lbl')?.textContent)).toEqual(['Total', 'New', 'Success', 'Lost', 'Inactive', 'Active']);
    expect(text('#acStatsRow .ac-stat-val')).toBe('120');
    expect($$('#acBody0 tr.p-row')).toHaveLength(20);
    expect($('#acRightWrap').classList.contains('open')).toBe(true);
    expect($$('#acBody0 tr.p-row')[0].classList.contains('active')).toBe(true);
    // the panel is drawn from the row of the list (the service has no lead detail): the list carries no responsible person, so the owner is the dash
    expect(text('#acDName')).not.toBe('-');
    expect(text('#acDOwner')).toBe('-');
    expect($('#acTable0').style.display).toBe('');
  });

  it('a click on a row opens that lead; the chevron loads the child rows; infinite scroll appends the next page', async () => {
    await create();
    await up();
    const second = $$('#acBody0 tr.p-row')[1];
    second.click();
    await settle(() => expect(second.classList.contains('active')).toBe(true));
    await settle(() => expect(text('#acDName')).toBe(second.querySelectorAll('td')[3].textContent!.trim()));
    $<HTMLElement>('#acBody0 tr.p-row .ac-chev-btn').click();
    await settle(() => expect($$('#acBody0 tr.c-row').length).toBeGreaterThan(0));
    // the scroll box of the table
    const box = $('.ac-table-scroll');
    Object.defineProperty(box, 'clientHeight', { configurable: true, value: 100 });
    Object.defineProperty(box, 'scrollHeight', { configurable: true, value: 400 });
    box.scrollTop = 300;
    box.dispatchEvent(new Event('scroll'));
    await settle(() => expect($$('#acBody0 tr.p-row').length).toBeGreaterThan(20));
  });

  it('a product without a workflow shows the flat table B and hides the group sub-tab; the 🏷 button is disabled', async () => {
    await create();
    await up();
    $<HTMLElement>('.ac-product-btn').click();
    $<HTMLElement>('#acProdDd .ac-prod-dd-item[data-mt="1004400742"]').click();
    // (table B is drawn from the same rows as the others: it is the switch of the layout that tells the product was loaded)
    await settle(() => expect($('#acTableB').style.display).toBe(''));
    expect($$('#acBodyB tr.p-row').length).toBeGreaterThan(0);
    expect($('#acTable0').style.display).toBe('none');
    expect($$<HTMLElement>('.ac-subtab')[1].style.display).toBe('none');
    expect($('.ac-tgl-group .ac-tgl:nth-child(2)').classList.contains('disabled')).toBe(true);
    // and the choice is remembered (TS_PREF)
    expect(localStorage.getItem('ts_activity_selected_mt')).toBe('1004400742');
  });

  it('the magnifier and the funnel of the top bar and "ล้างค่า" / "กรอง" of the filter panel and the expand-all arrow, the arrow of a row and the "ไปหน้าโอกาสขาย" of the panel, the filter icon and the "+" of its history, the two links of the appointment and task tables and the checkbox of a task hang under PL-CA-LS-01 … 12, and the save button of the contact popup under PL-CA-AD-01: a code the user may not use takes away its button, and only that one, and the page still starts', async () => {
    const BUTTONS: Record<string, string> = {
      'PL-CA-LS-01': '#acSearch .ac-search-ic',
      'PL-CA-LS-02': '#acFilterBtn',
      'PL-CA-LS-03': '#acBtnClear', // "ล้างค่า" and "กรอง" of the filter panel
      'PL-CA-LS-04': '#acBtnFilter',
      'PL-CA-LS-05': '#acExpandAll', // the double arrow in the head of the table
      'PL-CA-LS-06': '#acBody0 tr.p-row .ac-chev-btn', // the arrow at the start of a row (drawn by the engine)
      'PL-CA-LS-07': '.ac-goto-btn', // "ไปหน้าโอกาสขาย →" of the panel of the open row
      'PL-CA-LS-08': '#acHistFilterBtn', // the filter icon of the contact history in the panel
      'PL-CA-LS-09': '#acAddContactBtn', // the purple "+ เพิ่มการติดต่อ" of that history
      'PL-CA-LS-10': '#acApptExt, #acAddApptBtn', // the link to the lead of the appointment table and the "+" beside it …
      'PL-CA-LS-11': '#acTaskExt, #acAddTaskBtn', // … and the same of the task table
      'PL-CA-AD-01': '#acContactSave', // the save button of the contact popup
    };
    // PL-CA-LS-12 (the checkbox of a task card) is not here: the panel has no tasks of its own any more (the list gives none, see tools/sync-activities.mjs),
    // so no card is drawn. Open a lead on the tab of the appointments and tasks: the links and the "+" of both tables are on it.
    const tasks = async () => {
      $$('#acBody0 tr.p-row')[6].click();
      await settle(() => expect($('#acRightWrap').classList.contains('open')).toBe(true));
      $<HTMLElement>('.ac-panel-tab[data-tab="appt"]').click();
    };
    // One page start per code would be 14 starts (and more with every code added). The same is checked with ⌈log2(N+1)⌉ + 1 starts: start 0 denies
    // nothing, start b denies the codes whose (position + 1) has bit b set. Every code is denied in at least one start, and any two codes differ in
    // a bit, so there is a start where exactly one of the two is denied: a button must be there iff its own code is not denied.
    const codes = Object.keys(BUTTONS);
    const bits = Math.ceil(Math.log2(codes.length + 1));
    for (let start = 0; start <= bits; start++) {
      if (start > 0) {
        fixture.destroy();
        TestBed.resetTestingModule();
      }
      deniedCodes = new Set(start === 0 ? [] : codes.filter((_, i) => ((i + 1) >> (start - 1)) & 1));
      await create();
      await up();
      await tasks();
      for (const [code, sels] of Object.entries(BUTTONS))
        for (const sel of sels.split(', ')) expect(!!el.querySelector(sel), `${code} (${sel}) with [${[...deniedCodes].join(' ')}] denied`).toBe(!deniedCodes.has(code));
    }
  }, 30000);

  it('search and sort ask the backend again from page 1', async () => {
    await create();
    await up();
    $<HTMLElement>('#acSearch .ac-search-ic').click();
    typeIn('#acSearchInput', 'ไม่มีชื่อนี้');
    await settle(() => expect(text('#acBody0')).toContain('label.activity.no_data_filter'));
    $<HTMLElement>('#acSearchClear').click();
    await settle(() => expect($$('#acBody0 tr.p-row').length).toBe(20));
    $<HTMLElement>('#acSortBtn').click();
    $<HTMLElement>('.ac-sort-item[data-sort="name_asc"]').click();
    await settle(() => expect(text('#acSortLabel')).toBe('label.activity.sort_name_asc'));
  });

  it('"go to lead" navigates to the route of the lead page, with the group of the open row', async () => {
    await create();
    await up();
    const nav = vi.spyOn(TestBed.inject(Router), 'navigateByUrl').mockResolvedValue(true);
    $<HTMLElement>('.ac-goto-btn').click();
    expect(nav).toHaveBeenCalledWith('/crm/opportunities/43?activityGroupId=102');
    // with the panel closed there is no lead: the list of leads
    $<HTMLElement>('#acPanelClose').click();
    (window as unknown as { acGotoLead(): void }).acGotoLead();
    expect(nav).toHaveBeenLastCalledWith('/crm/opportunities');
  });

  describe('dialogs', () => {
    it('the add-contact dialog: empty text → a warning (swal); a text is saved and the history shows it', async () => {
      await create();
      await up();
      $<HTMLElement>('#acAddContactBtn').click();
      expect($('#acContactOverlay').classList.contains('show')).toBe(true);
      $<HTMLElement>('#acContactSave').click();
      expect(swal).toHaveBeenCalledWith(expect.objectContaining({ icon: 'warning', text: 'label.activity.please_fill_content' }));
      $<HTMLElement>('#acContactTypes .ac-ct-pill[data-channel="sms"]').click();
      typeIn('#acContactText', 'ส่งเอสเอ็มเอสแจ้งผล');
      typeIn('#acContactRefTime', '2026-10-19T10:30');
      $<HTMLElement>('#acContactSave').click();
      // saved: the dialog closes and the list is asked again (the panel keeps what the list gives: the history of the lead is not asked of the service)
      await settle(() => expect($('#acContactOverlay').classList.contains('show')).toBe(false));
      expect(swal).not.toHaveBeenCalledWith(expect.objectContaining({ icon: 'error' }));
    });

    it('a backend refusal is shown with its message and keeps the dialog open', async () => {
      await create();
      await up();
      $<HTMLElement>('#acAddContactBtn').click();
      typeIn('#acContactText', 'ทดสอบ ~fail');
      $<HTMLElement>('#acContactSave').click();
      await settle(() => expect(swal).toHaveBeenCalledWith(expect.objectContaining({ icon: 'error', text: expect.stringContaining('~fail') })));
      expect($('#acContactOverlay').classList.contains('show')).toBe(true);
      expect($<HTMLButtonElement>('#acContactSave').disabled).toBe(false);
    });

    it('the filter dialog loads its masters when it opens and filters the list on "กรอง"', async () => {
      await create();
      await up();
      $<HTMLElement>('#acFilterBtn').click();
      expect($('#acFilterOverlay').classList.contains('show')).toBe(true);
      await settle(() => expect($<HTMLSelectElement>('#acFTeam').options.length).toBe(3));
      // the filters the backend cannot apply are switched off, with the reason
      expect(['acFTag', 'acFProvince', 'acFDistrict'].every((id) => $<HTMLSelectElement>('#' + id).disabled)).toBe(true);
      const total = text('#acStatsRow .ac-stat-val');
      const team = $<HTMLSelectElement>('#acFTeam');
      team.value = '1004400001';
      team.dispatchEvent(new Event('change', { bubbles: true }));
      $<HTMLElement>('#acBtnFilter').click();
      await settle(() => expect(text('#acStatsRow .ac-stat-val')).not.toBe(total));
      expect($('#acFilterOverlay').classList.contains('show')).toBe(false);
    });
  });

  describe('the work modal', () => {
    const openAppt = async () => {
      $<HTMLElement>('.ac-panel-tab[data-tab="appt"]').click();
      $<HTMLElement>('#acAddApptBtn').click();
      await settle(() => expect($('#ld2AddWorkOverlay').classList.contains('show')).toBe(true));
    };

    it('add: the form has its defaults and validates subject, detail and date with the messages of the page', async () => {
      await create();
      await up();
      await openAppt();
      expect(text('#ld2AwTitle')).toBe('label.ld2.add_appointment');
      expect($<HTMLInputElement>('#ld2AwTime').value).toBe('09:30');
      $<HTMLElement>('#ld2AwSubmitBtn').click();
      expect(swal).toHaveBeenLastCalledWith(expect.objectContaining({ icon: 'warning', text: 'label.ld2.please_specify_subject' }));
      typeIn('#ld2AwSubject', 'นัดทดสอบ');
      $<HTMLElement>('#ld2AwSubmitBtn').click();
      expect(swal).toHaveBeenLastCalledWith(expect.objectContaining({ text: 'label.ld2.please_specify_detail' }));
      typeIn('#ld2AwDetail', 'รายละเอียด');
      typeIn('#ld2AwDate', '');
      $<HTMLElement>('#ld2AwSubmitBtn').click();
      expect(swal).toHaveBeenLastCalledWith(expect.objectContaining({ text: 'label.ld2.please_specify_date' }));
      // "all day" clears and locks the time
      $<HTMLElement>('#ld2AwAllDay').click();
      expect($<HTMLInputElement>('#ld2AwTime').disabled).toBe(true);
    });

    it('a saved item shows the success overlay and then the page starts again (location.reload) — unless the page was left before', async () => {
      await create();
      await up();
      await openAppt();
      const first = fixture.debugElement.query(By.directive(ActivitiesView)).componentInstance;
      typeIn('#ld2AwDate', '2026-10-28');
      typeIn('#ld2AwSubject', 'นัดเซ็นสัญญา');
      typeIn('#ld2AwDetail', 'เตรียมเอกสารตัวจริง');
      $<HTMLElement>('#ld2AwSubmitBtn').click();
      await settle(() => expect($('#wmSuccessOverlay').classList.contains('show')).toBe(true));
      expect(text('#wmSuccessText')).toBe('label.ld2.appt_added');
      await settle(() => expect(fixture.debugElement.query(By.directive(ActivitiesView)).componentInstance).not.toBe(first), 6000);
      // the new instance starts clean; the panel does not list the appointments of the lead any more (the list gives none: see tools/sync-activities.mjs)
      await up();
      $<HTMLElement>('.ac-panel-tab[data-tab="appt"]').click();
      expect($('#acApptList').textContent).toContain('label.ld2.no_appointments');
    }, 15000);

    it('leaving the page during the 3 seconds of the success overlay cancels the reload', async () => {
      await create();
      await up();
      await openAppt();
      typeIn('#ld2AwSubject', 'นัด');
      typeIn('#ld2AwDetail', 'x');
      $<HTMLElement>('#ld2AwSubmitBtn').click();
      await settle(() => expect($('#wmSuccessOverlay').classList.contains('show')).toBe(true));
      const reloads = vi.fn();
      fixture.debugElement.query(By.directive(ActivitiesView)).componentInstance.reload.subscribe(reloads);
      fixture.destroy();
      await new Promise((r) => setTimeout(r, 3300));
      expect(reloads).not.toHaveBeenCalled();
    }, 10000);

    // The view / edit dialog of a task was opened from a task card of the panel. The panel has no tasks of its own any more (the list gives none, see
    // tools/sync-activities.mjs), so there is no card to open it from here; the dialog itself is still covered where the work modal is shared (home, schedule).
    it('the panel has no task card to open the view / edit dialog from (the list gives no tasks)', async () => {
      await create();
      await up();
      $$('#acBody0 tr.p-row')[6].click();
      await settle(() => expect($('#acRightWrap').classList.contains('open')).toBe(true));
      $<HTMLElement>('.ac-panel-tab[data-tab="appt"]').click();
      expect($$('#acTaskList .ac-task-card')).toHaveLength(0);
      expect($('#ld2ViewWorkOverlay').classList.contains('show')).toBe(false);
    });

    it('permissions: without CRM_Schedule_Edit the pencil is hidden and the status cannot be saved; without CRM_Schedule_View the sections are gone', async () => {
      denied = new Set(['CRM_Schedule_Edit']);
      await create();
      await up();
      expect($<HTMLElement>('#ld2VwEditBtn').style.display).toBe('none');
      fixture.destroy();
      TestBed.resetTestingModule();
      denied = new Set(['CRM_Schedule_View']);
      await create();
      await up();
      expect($('#acApptList')).toBeNull();
      expect($('#acTaskList')).toBeNull();
    });
  });

  describe('permissions of the template', () => {
    it('without CRM_ContactActivity_Create there is no "add contact"; without CRM_ContactActivity_View no history; without CRM_Schedule_Create no "+" buttons', async () => {
      denied = new Set(['CRM_ContactActivity_Create', 'CRM_Schedule_Create']);
      await create();
      await up();
      expect($('#acAddContactBtn')).toBeNull();
      expect($('#acHistFilterBtn')).toBeTruthy();
      expect($('#acAddApptBtn')).toBeNull();
      expect($('#acAddTaskBtn')).toBeNull();
      expect($('#acApptExt')).toBeTruthy();
    });
    it('without CRM_ContactActivity_View the history block is not rendered at all', async () => {
      denied = new Set(['CRM_ContactActivity_View']);
      await create();
      await up().catch(() => undefined);
      expect($('#acHistList')).toBeNull();
      expect($('#acAddContactBtn')).toBeNull();
    });
  });

  describe('life cycle', () => {
    it('a language switch is a page reload in Java: a NEW page instance', async () => {
      await create();
      await up();
      const first = fixture.debugElement.query(By.directive(ActivitiesView)).componentInstance;
      lang.set('en');
      fixture.detectChanges();
      TestBed.tick?.();
      await settle(() => expect(fixture.debugElement.query(By.directive(ActivitiesView)).componentInstance).not.toBe(first));
      await up();
    });

    it('leaving the page removes what the scripts put on the document and on window (listeners, timers, window.x)', async () => {
      const added: Array<[string, unknown]> = [];
      const removed: Array<[string, unknown]> = [];
      const add = document.addEventListener.bind(document);
      const rem = document.removeEventListener.bind(document);
      vi.spyOn(document, 'addEventListener').mockImplementation((type: string, fn: unknown, o?: unknown) => (added.push([type, fn]), add(type, fn as EventListener, o as AddEventListenerOptions)));
      vi.spyOn(document, 'removeEventListener').mockImplementation((type: string, fn: unknown, o?: unknown) => (removed.push([type, fn]), rem(type, fn as EventListener, o as EventListenerOptions)));
      await create();
      await up();
      const w = window as unknown as Record<string, unknown>;
      expect(typeof w['acOpen']).toBe('function');
      expect(typeof w['wmOpenAdd']).toBe('function');
      expect(w['LD2_MY_EMPLOYEE_ID']).toBe('1001');
      fixture.destroy();
      for (const name of ['acOpen', 'acToggleAll', 'wmOpenAdd', 'wmSetLeadContext', 'ldOpenViewWork', 'wmShowSuccess', 'LD2_MY_EMPLOYEE_ID', 'LD2_CAN_SCHEDULE_EDIT', '_acCurrentDet', '_acAutoOpened']) expect(w[name], name).toBeUndefined();
      const left = added.filter((a) => !removed.some((r) => r[0] === a[0] && r[1] === a[1]));
      expect(left.map((l) => l[0])).toEqual([]);
    });

    it('leaving the page before the first list arrived: the late answers paint nothing (they never settle)', async () => {
      await create();
      await new Promise((r) => setTimeout(r, 60));
      const body = $('#acBody0');
      fixture.destroy();
      await new Promise((r) => setTimeout(r, 600)); // the mock answers after 150 ms
      expect(body.querySelector('tr.p-row')).toBeNull();
    });

    it('with mock off the host asks the LIVE backend (the REST services of triplesale-service, never the BFF); the list is CA-G01 (two views) and the products are the sales lines, not GET /contact-activities nor movement-types/LD', async () => {
      const { deps, calls } = fakeRest(() => null, { roles: [] }); // everything: the service does not answer
      const backend = vi.spyOn(ActivitiesView.prototype as unknown as { backend(): Promise<unknown> }, 'backend').mockImplementation(async () => createLiveActivities(deps));
      await create(false);
      await settle(() => expect(calls.some((c) => c.path.startsWith('/contact-activity-summaries?view=BY_OPPORTUNITY&include=CHILDREN%2CSUMMARY'))).toBe(true));
      expect(backend).toHaveBeenCalledTimes(1);
      expect(el.querySelector('ts-live-missing')).toBeNull();
      expect($$('#acBodyB tr.p-row')).toHaveLength(0);
      // what it asked: only the REST services (the base of triplesale-service), and neither GET /contact-activities nor movement-types/LD
      expect(calls.every((c) => c.url.startsWith('/triplesale-service/api/v1/'))).toBe(true);
      expect(calls.map((c) => c.path).filter((path) => path.startsWith('/contact-activities') || path === '/master-data/movement-types/LD')).toEqual([]);
    });
  });
});
