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
import { Schedule } from './schedule';
import { ScheduleView } from './schedule-view';
import { createLiveSchedule } from './schedule.live';
import { resetMockSchedule } from './schedule.mock';

const session = signal<SessionInfo | null>({
  username: 'demo', profileName: 'Demo', employeeId: 1001, employeeCode: 'E101', branch: { id: 1, code: 'SUN', name: 'SUN' }, branchCode: 'SUN', roles: ['super_admin'],
});
const lang = signal<'th' | 'en'>('th');
const t = (k: string) => k;

/**
 * The inline handlers of the Java markup (`onclick="window.scGoLead(…)"`) run in the jsdom realm, whose `window` is not the object the engine
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
  for (const k of Object.keys(w)) if (/^(sc|wm|ld|_sc|LD2_|SC_|switchCalView|saveScheduleState)/.test(k)) realm[k] = w[k];
};

/** a minimal IntersectionObserver (jsdom has none): remembers who watches what, and whether it was disconnected */
class FakeObserver {
  static all: FakeObserver[] = [];
  disconnected = false;
  targets: Element[] = [];
  constructor(public cb: IntersectionObserverCallback, public options?: IntersectionObserverInit) {
    FakeObserver.all.push(this);
  }
  observe(el: Element): void {
    this.targets.push(el);
  }
  disconnect(): void {
    this.disconnected = true;
  }
  unobserve(): void {}
  takeRecords(): IntersectionObserverEntry[] {
    return [];
  }
  /** the sentinel came into view */
  fire(): void {
    this.cb([{ isIntersecting: true } as IntersectionObserverEntry], this as unknown as IntersectionObserver);
  }
}

/** the drag events of the board: jsdom has no DataTransfer */
const dragEvent = (type: string): Event => {
  const e = new Event(type, { bubbles: true, cancelable: true });
  (e as unknown as { dataTransfer: unknown }).dataTransfer = { effectAllowed: '', dropEffect: '', setData: () => undefined };
  return e;
};

describe('Schedule page (pages/schedule.xhtml + components/work_modal.xhtml, generated)', () => {
  let fixture: ComponentFixture<Schedule>;
  let el: HTMLElement;
  let swal: ReturnType<typeof vi.fn<(o: unknown) => Promise<unknown>>>;
  let denied: Set<string>;
  let deniedCodes: Set<string>;
  let bridgeTimer: ReturnType<typeof setInterval> | undefined;

  const $ = <T extends HTMLElement = HTMLElement>(sel: string) => el.querySelector<T>(sel)!;
  const $$ = <T extends HTMLElement = HTMLElement>(sel: string) => [...el.querySelectorAll<T>(sel)];
  const text = (sel: string) => ($(sel)?.textContent ?? '').trim();
  const settle = (fn: () => void, timeout = 6000) => vi.waitFor(fn, { timeout, interval: 40 });
  /** the page is up when the skeleton is gone and the month has its items */
  const up = () =>
    settle(() => {
      expect($('#scCalSkel').classList.contains('hide')).toBe(true);
      expect($$('#scCalBody .sc-event').length).toBeGreaterThan(0);
    });
  const idle = () => settle(() => expect(el.querySelector('tr.sc-skel-row, .sc-skel-card')).toBeNull());
  const typeIn = (sel: string, v: string) => {
    const i = $<HTMLInputElement>(sel);
    i.value = v;
    i.dispatchEvent(new Event('input', { bubbles: true }));
    i.dispatchEvent(new Event('change', { bubbles: true }));
  };
  const tab = async (name: string) => {
    $<HTMLElement>(`.ld-tab[data-tab="${name}"]`).click();
    await idle();
  };
  const view = async (n: number) => {
    $<HTMLElement>('.sc-view-btn').click();
    $<HTMLElement>(`.sc-view-menu .sc-view-item:nth-child(${n})`).click();
    await idle();
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
    fixture = TestBed.createComponent(Schedule);
    document.body.appendChild(fixture.nativeElement);
    fixture.detectChanges();
    el = fixture.nativeElement as HTMLElement;
    // the engine starts after the first change detection (a dynamic import of the mock) and again after a language switch: whatever it
    // publishes is copied to the inline handlers at once
    bridgeTimer ??= setInterval(bridge, 2);
  }

  beforeEach(() => {
    resetMockSchedule();
    // "today" of the page is the day the mock lives around (the page reads new Date())
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date(2026, 9, 20, 10, 30, 0));
    lang.set('th');
    denied = new Set();
    deniedCodes = new Set();
    FakeObserver.all = [];
    vi.stubGlobal('IntersectionObserver', FakeObserver);
    const nativeClick = HTMLElement.prototype.click;
    vi.spyOn(HTMLElement.prototype, 'click').mockImplementation(function (this: HTMLElement) {
      bridge();
      nativeClick.call(this);
    });
    swal = vi.fn<(o: unknown) => Promise<unknown>>(async () => undefined);
    vi.spyOn(ScheduleView.prototype as unknown as { swal(o: unknown): Promise<unknown> }, 'swal').mockImplementation((o) => swal(o));
  });
  afterEach(() => {
    clearInterval(bridgeTimer);
    bridgeTimer = undefined;
    fixture?.destroy();
    TestBed.resetTestingModule();
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
    vi.useRealTimers();
  });

  it('is the markup of the Java page: the three tabs, the calendar, the board, the lists, the error page, the filter dialog and the work modal', async () => {
    await create();
    await up();
    expect($$('.ld-tab').map((b) => b.dataset['tab'])).toEqual(['calendar', 'board', 'list']);
    for (const id of ['scTabCalendar', 'scTabBoard', 'scTabList', 'scErrorPage', 'scFilterOverlay', 'scMorePop', 'ld2ViewWorkOverlay', 'ld2AddWorkOverlay', 'wmSuccessOverlay', 'scApptBoard', 'scTaskBoard', 'scApptList', 'scTaskList']) {
      expect($('#' + id), id).toBeTruthy();
    }
    expect($$('#scTabList th')).toHaveLength(16);
    expect(text('.ld-tab[data-tab="calendar"]')).toBe('Calendar');
    expect($('#scTodayBtn').textContent).toBe('chat.today');
  });

  it('draws the first load from the backend: the products, the first workflow group, October 2026 with today marked and the items in their cells', async () => {
    await create();
    await up();
    expect(text('#scProdLabel')).toBe('สินเชื่อบ้าน');
    expect($$('#scProdDd .sc-prod-dd-item').map((i) => i.dataset['id'])).toEqual(['1004400740', '1004400741', '1004400742', '1004400743']);
    expect(text('#scGroupLabel')).toBe('ฝ่ายบริการลูกค้า');
    expect($$('#scGroupDd .ld-dd-item')).toHaveLength(7);
    expect(text('#scCalLabel')).toBe('October 2026');
    expect(text('#scCalBody .sc-day-num.today')).toBe('20');
    expect($$('#scCalBody tr')).toHaveLength(5);
    expect($$('#scCalBody .sc-more').length).toBeGreaterThan(0); // a dense day overflows into "N more"
    expect(text('.sc-more')).toMatch(/^label\.schedule\.more_items$|^[^{]*$/);
  });

  it('"วันนี้", the four "+ เพิ่ม" of the board and list tabs and "ล้างค่า" / "กรอง" of the filter dialog hang under PL-SC-CL-03, LT-04, LT-06, BD-04, BD-07, CL-07, CL-08: a code the user may not use takes away its button, and only that one, and the page still starts', async () => {
    const BUTTONS: Record<string, string> = {
      'PL-SC-CL-03': '#scTodayBtn',
      'PL-SC-CL-07': '#scHFClear',
      'PL-SC-CL-08': '#scHFApply',
      'PL-SC-LT-04': '#scAddApptListBtn',
      'PL-SC-LT-06': '#scAddTaskListBtn',
      'PL-SC-BD-04': '#scAddApptBoardBtn',
      'PL-SC-BD-07': '#scAddTaskBoardBtn',
    };
    // start 0 denies nothing, start b denies the codes whose (position + 1) has bit b set: every code is denied in some start and any two differ in a bit,
    // so a button must be there iff its own code is not denied (⌈log2(N+1)⌉ + 1 page starts instead of one per code)
    const codes = Object.keys(BUTTONS);
    const bits = Math.ceil(Math.log2(codes.length + 1));
    for (let start = 0; start <= bits; start++) {
      if (start > 0) {
        fixture.destroy();
        TestBed.resetTestingModule();
        resetMockSchedule();
      }
      deniedCodes = new Set(start === 0 ? [] : codes.filter((_, i) => ((i + 1) >> (start - 1)) & 1));
      await create();
      await up();
      for (const [code, sel] of Object.entries(BUTTONS)) expect(!!el.querySelector(sel), `${code} (${sel}) with [${[...deniedCodes].join(' ')}] denied`).toBe(!deniedCodes.has(code));
    }
  }, 30000);

  it('an item of the calendar (month cell, week and day columns) opens the view modal on a click only with PL-SC-CL-04: without it the item stays, with no click and no pointer', async () => {
    const clickable = (sel: string) => $$(sel).filter((e) => e.getAttribute('onclick')?.includes('scOpenWorkModal') && (e.getAttribute('style') ?? '').includes('cursor:pointer'));
    const views: [string, number, string][] = [['month', 0, '#scCalBody .sc-event'], ['week', 3, '#scWeekBody .sc-event'], ['day', 4, '#scDayBody .sc-event']];
    for (const denyIt of [false, true]) {
      if (denyIt) {
        fixture.destroy();
        TestBed.resetTestingModule();
        resetMockSchedule();
        deniedCodes = new Set(['PL-SC-CL-04']);
      }
      await create();
      await up();
      for (const [name, n, sel] of views) {
        if (n) await view(n);
        const items = $$(sel);
        expect(items.length, `${name} items (denied: ${denyIt})`).toBeGreaterThan(0);
        expect(clickable(sel).length, `${name} clickable items (denied: ${denyIt})`).toBe(denyIt ? 0 : items.length);
      }
    }
  }, 30000);

  it('a day of the year view that has items opens its pop-over on a click only with PL-SC-CL-05, and an item of the pop-over opens the view modal only with PL-SC-CL-06: without the code the day / the item stays, with no click and no pointer', async () => {
    const opens = (e: HTMLElement) => (e.getAttribute('onclick') ?? '').length > 0;
    for (const denyWhich of [null, 'PL-SC-CL-05', 'PL-SC-CL-06']) {
      if (denyWhich) {
        fixture.destroy();
        TestBed.resetTestingModule();
        resetMockSchedule();
      }
      deniedCodes = new Set(denyWhich ? [denyWhich] : []);
      await create();
      await up();
      // the pop-over of a month cell ("+N") holds the same items as the one of a day of the year view
      $('.sc-more').dispatchEvent(new MouseEvent('mouseenter'));
      const items = $$('#scMorePopList .sc-event');
      expect(items.length, `items of the pop-over (denied: ${denyWhich})`).toBeGreaterThan(0);
      expect(items.filter(opens).length, `clickable items of the pop-over (denied: ${denyWhich})`).toBe(denyWhich === 'PL-SC-CL-06' ? 0 : items.length);
      $<HTMLElement>('.sc-more-pop-close').click();
      await view(1);
      await settle(() => expect($$('.sc-yr-d.mark-past, .sc-yr-d.mark-future, .sc-yr-d.sc-yr-clk').length).toBeGreaterThan(5));
      expect($$('.sc-yr-d.sc-yr-clk').length > 0, `clickable days (denied: ${denyWhich})`).toBe(denyWhich !== 'PL-SC-CL-05');
      expect($$('.sc-yr-d.mark-past, .sc-yr-d.mark-future').length, `marked days (denied: ${denyWhich})`).toBeGreaterThan(0);
    }
  }, 30000);

  it('the toolbar shared by the tabs: the magnifier and the funnel of the calendar (CL-01, CL-02) and "ค้นหา", the X and the funnel of the list (LT-01 … 03) are hidden only on the tab whose code the user may not use', async () => {
    // [selector, tab, code]: the element is tagged data-sc-hide-on="<tab>" (the stylesheet hides it while that tab is open) iff the code is denied
    const ROWS: [string, string, string][] = [
      ['#scSearch .ld-search-ic', 'calendar', 'PL-SC-CL-01'],
      ['#scFilterBtn', 'calendar', 'PL-SC-CL-02'],
      ['#scSearchGo', 'list', 'PL-SC-LT-01'],
      ['#scSearchClear', 'list', 'PL-SC-LT-02'],
      ['#scFilterBtn', 'list', 'PL-SC-LT-03'],
      ['#scSearchGo', 'board', 'PL-SC-BD-01'],
      ['#scSearchClear', 'board', 'PL-SC-BD-02'],
      ['#scFilterBtn', 'board', 'PL-SC-BD-03'],
    ];
    const codes = ROWS.map((r) => r[2]);
    const bits = Math.ceil(Math.log2(codes.length + 1));
    for (let start = 0; start <= bits; start++) {
      if (start > 0) {
        fixture.destroy();
        TestBed.resetTestingModule();
        resetMockSchedule();
      }
      deniedCodes = new Set(start === 0 ? [] : codes.filter((_, i) => ((i + 1) >> (start - 1)) & 1));
      await create();
      await up();
      for (const [sel, tab, code] of ROWS) {
        const el1 = $(sel);
        expect(el1, `${sel} is always in the page`).toBeTruthy();
        const hiddenOn = (el1.getAttribute('data-sc-hide-on') ?? '').split(' ');
        expect(hiddenOn.includes(tab), `${code} (${sel} on ${tab}) with [${[...deniedCodes].join(' ')}] denied`).toBe(deniedCodes.has(code));
      }
    }
  }, 30000);

  it('the three dots of an appointment row of the list tab (PL-SC-LT-05) are drawn only with the code: without it the cell stays, and the task rows are not touched', async () => {
    for (const denyIt of [false, true]) {
      if (denyIt) {
        fixture.destroy();
        TestBed.resetTestingModule();
        resetMockSchedule();
        deniedCodes = new Set(['PL-SC-LT-05']);
      }
      await create();
      await up();
      await tab('list');
      const rows = $$('#scApptList tr').length;
      expect(rows).toBe(20);
      expect($$('#scApptList .sc-menu-btn').length, `dots of the appointment rows (denied: ${denyIt})`).toBe(denyIt ? 0 : rows);
      expect($$('#scApptList tr > td:first-child').length, 'the cell stays').toBe(rows);
      expect($$('#scTaskList .sc-menu-btn').length, 'task rows untouched').toBeGreaterThan(0);
    }
  }, 30000);

  it('the three dots of a task row of the list tab (PL-SC-LT-07) are drawn only with the code: without it the cell stays, and the appointment rows are not touched', async () => {
    for (const denyIt of [false, true]) {
      if (denyIt) {
        fixture.destroy();
        TestBed.resetTestingModule();
        resetMockSchedule();
        deniedCodes = new Set(['PL-SC-LT-07']);
      }
      await create();
      await up();
      await tab('list');
      const rows = $$('#scTaskList tr').length;
      expect(rows).toBe(20);
      expect($$('#scTaskList .sc-menu-btn').length, `dots of the task rows (denied: ${denyIt})`).toBe(denyIt ? 0 : rows);
      expect($$('#scTaskList tr > td:first-child').length, 'the cell stays').toBe(rows);
      expect($$('#scApptList .sc-menu-btn').length, 'appointment rows untouched').toBeGreaterThan(0);
    }
  }, 30000);

  it('the three dots of an appointment card of the board tab (PL-SC-BD-05) are drawn only with the code: the task cards are not touched', async () => {
    for (const denyIt of [false, true]) {
      if (denyIt) {
        fixture.destroy();
        TestBed.resetTestingModule();
        resetMockSchedule();
        deniedCodes = new Set(['PL-SC-BD-05']);
      }
      await create();
      await up();
      await tab('board');
      const cards = $$('#scApptBoard .sc-card').length;
      expect(cards).toBeGreaterThan(0);
      expect($$('#scApptBoard .sc-menu-btn').length, `dots of the appointment cards (denied: ${denyIt})`).toBe(denyIt ? 0 : cards);
      expect($$('#scTaskBoard .sc-menu-btn').length, 'task cards untouched').toBeGreaterThan(0);
    }
  }, 30000);

  it('the three dots of a task card of the board tab (PL-SC-BD-08) are drawn only with the code: the appointment cards are not touched', async () => {
    for (const denyIt of [false, true]) {
      if (denyIt) {
        fixture.destroy();
        TestBed.resetTestingModule();
        resetMockSchedule();
        deniedCodes = new Set(['PL-SC-BD-08']);
      }
      await create();
      await up();
      await tab('board');
      const cards = $$('#scTaskBoard .sc-card').length;
      expect(cards).toBeGreaterThan(0);
      expect($$('#scTaskBoard .sc-menu-btn').length, `dots of the task cards (denied: ${denyIt})`).toBe(denyIt ? 0 : cards);
      expect($$('#scApptBoard .sc-menu-btn').length, 'appointment cards untouched').toBeGreaterThan(0);
    }
  }, 30000);

  it('the save button of the create popup is there for an appointment only with PL-SC-AD-01 and for a task only with PL-SC-AD-02; the edit mode ("บันทึก") is not these', async () => {
    const showing = () => $<HTMLElement>('#ld2AwSubmitBtn').style.display !== 'none';
    for (const denied of [null, 'PL-SC-AD-01', 'PL-SC-AD-02']) {
      if (denied) {
        fixture.destroy();
        TestBed.resetTestingModule();
        resetMockSchedule();
        deniedCodes = new Set([denied]);
      }
      await create();
      await up();
      await tab('board');
      $<HTMLElement>('#scAddApptBoardBtn').click();
      expect(showing(), `appointment form (denied: ${denied})`).toBe(denied !== 'PL-SC-AD-01');
      $<HTMLElement>('#ld2AddWorkOverlay .ld2-aw-close').click();
      $<HTMLElement>('#scAddTaskBoardBtn').click();
      expect(showing(), `task form (denied: ${denied})`).toBe(denied !== 'PL-SC-AD-02');
      $<HTMLElement>('#ld2AddWorkOverlay .ld2-aw-close').click();
    }
  }, 30000);

  it('the view popup: the pencil is there only with PL-SC-ED-01, "บันทึก" of the view mode and of the edit mode only with PL-SC-ED-02', async () => {
    const shown = (sel: string) => $<HTMLElement>(sel).style.display !== 'none';
    for (const denied of [null, 'PL-SC-ED-01', 'PL-SC-ED-02']) {
      if (denied) {
        fixture.destroy();
        TestBed.resetTestingModule();
        resetMockSchedule();
        deniedCodes = new Set([denied]);
      }
      await create();
      await up();
      await tab('board');
      const open = $$('#scApptBoard .sc-card').find((c) => c.getAttribute('draggable') === 'true')!;
      open.click();
      expect($('#ld2ViewWorkOverlay').classList.contains('show')).toBe(true);
      expect(shown('#ld2VwEditBtn'), `pencil (denied: ${denied})`).toBe(denied !== 'PL-SC-ED-01');
      expect(shown('#ld2VwSubmitBtn'), `save of the view mode (denied: ${denied})`).toBe(denied !== 'PL-SC-ED-02');
      $<HTMLElement>('#ld2ViewWorkOverlay .ld2-vw-close, #ld2ViewWorkOverlay [onclick*="wmCloseView"]').click();
      // the edit mode is also reached from the ⋮ menu: its save button
      $<HTMLElement>('#scApptBoard .sc-menu-btn').click();
      $<HTMLElement>('#scApptBoard .sc-ctx-menu.show .sc-ctx-item, #scApptBoard .sc-ctx-menu .sc-ctx-item').click();
      await idle();
      expect($('#ld2AddWorkOverlay').classList.contains('show'), 'edit mode open').toBe(true);
      expect(shown('#ld2AwSubmitBtn'), `save of the edit mode (denied: ${denied})`).toBe(denied !== 'PL-SC-ED-02');
    }
  }, 30000);

  it('a card of the board is draggable only with PL-SC-BD-06 (appointment and task cards alike)', async () => {
    for (const denyIt of [false, true]) {
      if (denyIt) {
        fixture.destroy();
        TestBed.resetTestingModule();
        resetMockSchedule();
        deniedCodes = new Set(['PL-SC-BD-06']);
      }
      await create();
      await up();
      await tab('board');
      const drag = (sel: string) => $$(sel).filter((c) => c.getAttribute('draggable') === 'true').length;
      if (denyIt) {
        expect(drag('#scApptBoard .sc-card'), 'appointment cards draggable').toBe(0);
        expect(drag('#scTaskBoard .sc-card'), 'task cards draggable').toBe(0);
      } else {
        expect(drag('#scApptBoard .sc-card'), 'appointment cards draggable').toBeGreaterThan(0);
        expect(drag('#scTaskBoard .sc-card'), 'task cards draggable').toBeGreaterThan(0);
      }
    }
  }, 30000);

  it('the four views: the label, the grid and the request of each; the arrows and "today" move by the unit of the view', async () => {
    await create();
    await up();
    await view(3); // week
    expect(text('#scCalLabel')).toBe('OCT 18 - 24 ,2026');
    expect($$('#scWeekHead th')).toHaveLength(8);
    expect($$('#scWeekBody tr')).toHaveLength(24); // all day + 1 AM … 11 PM
    expect($$('#scWeekBody .sc-event').length).toBeGreaterThan(0);
    $<HTMLElement>('#scNextBtn').click();
    await idle();
    expect(text('#scCalLabel')).toBe('OCT 25 - 31 ,2026');
    $<HTMLElement>('#scTodayBtn').click();
    await idle();
    expect(text('#scCalLabel')).toBe('OCT 18 - 24 ,2026');
    await view(4); // day
    expect(text('#scCalLabel')).toBe('October 20 , 2026');
    expect(text('#scDayHead th.day-col')).toBe('Tuesday');
    $<HTMLElement>('#scPrevBtn').click();
    await idle();
    expect(text('#scCalLabel')).toBe('October 19 , 2026');
    await view(1); // year
    expect(text('#scCalLabel')).toBe('2026');
    expect($$('.sc-yr-m')).toHaveLength(12);
    await settle(() => expect($$('.sc-yr-d.sc-yr-clk').length).toBeGreaterThan(5)); // the marks arrive with the request
    expect($('.sc-yr-d.today')).toBeTruthy();
    await view(2); // month
    expect(text('#scCalLabel')).toBe('October 2026');
  });

  it('the appointment / task switches of the week view hide the events of that kind without asking the backend again', async () => {
    await create();
    await up();
    await view(3);
    const kinds = () => $$('#scWeekBody .sc-event').filter((e) => e.style.display !== 'none').map((e) => e.dataset['scType']);
    expect(new Set(kinds())).toEqual(new Set(['appt', 'task']));
    $<HTMLElement>('#scChkAppt').click();
    expect(new Set(kinds())).toEqual(new Set(['task']));
    $<HTMLElement>('#scChkTask').click();
    expect(kinds()).toEqual([]);
  });

  it('the "more" pop-up opens on hover with the whole day, closes with its button; a click on a marked day of the year view opens the day', async () => {
    await create();
    await up();
    $('.sc-more').dispatchEvent(new MouseEvent('mouseenter'));
    expect($('#scMorePop').classList.contains('show')).toBe(true);
    expect($$('#scMorePopList .sc-event').length).toBeGreaterThan(3);
    $<HTMLElement>('.sc-more-pop-close').click();
    expect($('#scMorePop').classList.contains('show')).toBe(false);
    await view(1);
    await settle(() => expect($$('.sc-yr-d.sc-yr-clk').length).toBeGreaterThan(5));
    $<HTMLElement>('.sc-yr-d.sc-yr-clk').click();
    await settle(() => expect($('#scMorePop').classList.contains('show')).toBe(true));
    expect(text('#scMorePopTitle')).toMatch(/^\d+ [A-Z][a-z]+ 2026$/);
  });

  it('the date picker: the label opens it (months in the month view), a month is picked, outside closes it', async () => {
    await create();
    await up();
    $<HTMLElement>('#scCalLabel').click();
    expect($('#scDatePicker').classList.contains('show')).toBe(true);
    expect($$('#scDpGrid .sc-dp-month-item')).toHaveLength(12);
    $$('#scDpGrid .sc-dp-month-item')[2].click();
    await idle();
    expect(text('#scCalLabel')).toBe('March 2026');
    expect($('#scDatePicker').classList.contains('show')).toBe(false);
    $<HTMLElement>('#scCalLabel').click();
    document.body.click();
    expect($('#scDatePicker').classList.contains('show')).toBe(false);
  });

  it('the product and group dropdowns ask the backend again; a product without a workflow hides the group dropdown', async () => {
    await create();
    await up();
    $<HTMLElement>('.sc-product-btn').click();
    expect($('#scProdDd').classList.contains('show')).toBe(true);
    $<HTMLElement>('#scProdDd .sc-prod-dd-item[data-id="1004400742"]').click();
    await idle();
    expect(text('#scProdLabel')).toBe('ที่ปรึกษาการเงิน');
    expect($<HTMLElement>('#scGroupWrap').style.display).toBe('none');
    $<HTMLElement>('.sc-product-btn').click();
    $<HTMLElement>('#scProdDd .sc-prod-dd-item[data-id="1004400740"]').click();
    await idle();
    await settle(() => expect($<HTMLElement>('#scGroupWrap').style.display).toBe(''));
    $<HTMLElement>('#scGroupBtn').click();
    $<HTMLElement>('#scGroupDd .ld-dd-item:nth-child(2)').click();
    await idle();
    expect(text('#scGroupLabel')).toBe('วิเคราะห์สินเชื่อ');
  });

  describe('the board', () => {
    it('draws one column per status with the counters; the sentinel of a column asks for its next page', async () => {
      await create();
      await up();
      await tab('board');
      expect($$('#scApptBoard .sc-col').map((c) => c.dataset['status'])).toEqual(['scheduled', 're-schedule', 'success', 'cancel']);
      expect($$('#scTaskBoard .sc-col').map((c) => c.dataset['status'])).toEqual(['doing', 'success', 'cancel']);
      const first = $$('#scApptBoard .sc-col')[0];
      const total = Number(first.querySelector('.sc-col-title span')!.textContent);
      expect(total).toBeGreaterThan(20);
      expect(first.querySelectorAll('.sc-card')).toHaveLength(20);
      // the summary numbers on top of the board
      expect(text('#scTabBoard .sc-section:first-child .sc-cbadge')).toBe(String(total));
      const watching = FakeObserver.all.filter((o) => !o.disconnected && o.targets.some((x) => x.id === 'scBSen-appointment-scheduled'));
      expect(watching).toHaveLength(1);
      watching[0].fire();
      await settle(() => expect(first.querySelectorAll('.sc-card').length).toBeGreaterThan(20));
    });

    it('a card dropped on another column of its kind changes the status (PATCH) and the counters follow; other kind / same column / closed column do nothing', async () => {
      await create();
      await up();
      await tab('board');
      const cols = $$('#scApptBoard .sc-col');
      const n = (c: HTMLElement) => Number(c.querySelector('.sc-col-title span')!.textContent);
      const [s0, r0] = [n(cols[0]), n(cols[1])];
      const card = cols[0].querySelector<HTMLElement>('.sc-card')!;
      expect(card.getAttribute('draggable')).toBe('true');
      // other kind, same column: nothing moves
      card.dispatchEvent(dragEvent('dragstart'));
      $$('#scTaskBoard .sc-col')[1].dispatchEvent(dragEvent('drop'));
      expect(n(cols[0])).toBe(s0);
      card.dispatchEvent(dragEvent('dragstart'));
      cols[0].dispatchEvent(dragEvent('drop'));
      expect(n(cols[0])).toBe(s0);
      // another column: optimistic move, then the board is drawn again from the backend
      card.dispatchEvent(dragEvent('dragstart'));
      cols[1].dispatchEvent(dragEvent('dragover'));
      expect(cols[1].classList.contains('sc-col-over')).toBe(true);
      cols[1].dispatchEvent(dragEvent('drop'));
      expect(n(cols[0])).toBe(s0 - 1);
      await settle(() => expect(n($$('#scApptBoard .sc-col')[1])).toBe(r0 + 1));
      expect(n($$('#scApptBoard .sc-col')[0])).toBe(s0 - 1);
      // a card of a closed column cannot be dragged
      const done = $$('#scApptBoard .sc-col')[2].querySelector<HTMLElement>('.sc-card')!;
      expect(done.getAttribute('draggable')).toBe('false');
    });

    it('a move the backend refuses is told (alert) and undone', async () => {
      sessionStorage.setItem('ts.mock.schedule.config', JSON.stringify({ failEdit: true }));
      const alert = vi.spyOn(window, 'alert').mockImplementation(() => undefined);
      await create();
      await up();
      await tab('board');
      const cols = $$('#scApptBoard .sc-col');
      const s0 = cols[0].querySelectorAll('.sc-card').length;
      const card = cols[0].querySelector<HTMLElement>('.sc-card')!;
      card.dispatchEvent(dragEvent('dragstart'));
      cols[1].dispatchEvent(dragEvent('drop'));
      await settle(() => expect(alert).toHaveBeenCalledWith('label.schedule.move_status_fail'));
      await idle();
      expect($$('#scApptBoard .sc-col')[0].querySelectorAll('.sc-card')).toHaveLength(s0);
      sessionStorage.removeItem('ts.mock.schedule.config');
    });

    it('the menu of a card has "edit" (not for a closed card) and "go to the lead"; the lead goes through the router with its workflow group', async () => {
      await create();
      await up();
      await tab('board');
      const nav = vi.spyOn(TestBed.inject(Router), 'navigateByUrl').mockResolvedValue(true);
      const open = $$('#scApptBoard .sc-col')[0].querySelector<HTMLElement>('.sc-menu-btn')!;
      open.click();
      const menu = $$('#scApptBoard .sc-ctx-menu.show')[0];
      expect([...menu.querySelectorAll('.sc-ctx-item')].map((i) => i.textContent)).toEqual(['label.ld2.edit', 'label.contracts.go_to_lead_btn']);
      [...menu.querySelectorAll<HTMLElement>('.sc-ctx-item')][1].click();
      expect(nav).toHaveBeenCalledTimes(1);
      expect(nav.mock.calls[0][0]).toMatch(/^\/crm\/opportunities\/\d+\?activityGroupId=101$/);
      const closed = $$('#scApptBoard .sc-col')[2].querySelector('.sc-ctx-menu')!;
      expect([...closed.querySelectorAll('.sc-ctx-item')].map((i) => i.textContent)).toEqual(['label.contracts.go_to_lead_btn']);
    });
  });

  describe('the list', () => {
    it('fills both tables, shows the counters and loads the next page of ONE table when its sentinel comes into view', async () => {
      await create();
      await up();
      await tab('list');
      expect($$('#scApptList tr')).toHaveLength(20);
      expect($$('#scTaskList tr')).toHaveLength(20);
      const sentinel = FakeObserver.all.filter((o) => !o.disconnected && o.targets.some((x) => x.id === 'scApptSentinel'));
      expect(sentinel).toHaveLength(1);
      sentinel[0].fire();
      await settle(() => expect($$('#scApptList tr').length).toBe(40));
      expect($$('#scTaskList tr')).toHaveLength(20);
    });

    it('sort and search ask the backend again from page 1 and are remembered (HttpSession)', async () => {
      await create();
      await up();
      await tab('list');
      $<HTMLElement>('#scSortBtn').click();
      $<HTMLElement>('#scSortDd .ld-dd-item[data-api="date_asc"]').click();
      await idle();
      expect(text('#scSortLabel')).toBe('label.contracts.sort_date_asc');
      $<HTMLElement>('.ld-search-ic').click();
      expect($('#scSearch').classList.contains('open')).toBe(true);
      typeIn('#scSearchInput', 'ไม่มีข้อมูลนี้แน่นอน');
      $<HTMLElement>('#scSearchGo').click();
      await idle();
      expect($$('#scApptList tr')).toHaveLength(0);
      $<HTMLElement>('#scSearchClear').click();
      await idle();
      expect($$('#scApptList tr')).toHaveLength(20);
      // the state went to the session (sendBeacon → POST), so a new page starts there
      await new Promise((r) => setTimeout(r, 400));
      fixture.destroy();
      TestBed.resetTestingModule();
      await create();
      await settle(() => expect($('.ld-tab[data-tab="list"]').classList.contains('active')).toBe(true));
      await settle(() => expect(text('#scSortLabel')).toBe('label.contracts.sort_date_asc'));
      await idle();
      expect($$('#scApptList tr').length).toBeGreaterThan(0);
    });
  });

  describe('the filter dialog', () => {
    it('loads its options when it opens; "กรองข้อมูล" filters every tab and shows the number of filters on the icon; "ล้าง" resets the form only', async () => {
      await create();
      await up();
      const all = $$('#scCalBody .sc-event').length;
      $<HTMLElement>('#scFilterBtn').click();
      expect($('#scFilterOverlay').classList.contains('show')).toBe(true);
      await settle(() => expect($$('#scHFOwnerList .sc-hf-dd-item').length).toBe(9));
      expect($$('#scHFSaleGroupList .sc-hf-dd-item')).toHaveLength(3);
      $<HTMLElement>('#scHFOwnerBtn').click();
      $$('#scHFOwnerList .sc-hf-dd-item')[2].click();
      expect(text('#scHFOwnerBtn')).toBe('สุดา รักงาน');
      $<HTMLElement>('#scHFClear').click();
      expect(text('#scHFOwnerBtn')).toBe('label.contracts.filter_all');
      expect($<HTMLElement>('#scFilterBadge').style.display).toBe('none');
      $<HTMLElement>('#scHFOwnerBtn').click();
      $$('#scHFOwnerList .sc-hf-dd-item')[2].click();
      $$<HTMLInputElement>('#scHFTaskGrid input')[0].click();
      $<HTMLElement>('#scHFApply').click();
      expect($('#scFilterOverlay').classList.contains('show')).toBe(false);
      expect(text('#scFilterBadge')).toBe('2');
      await idle();
      await settle(() => expect($$('#scCalBody .sc-event').length).toBeLessThan(all));
      // reopening restores what was applied, not what was left half done
      $<HTMLElement>('#scFilterBtn').click();
      expect(text('#scHFOwnerBtn')).toBe('สุดา รักงาน');
      expect($$<HTMLInputElement>('#scHFTaskGrid input').map((c) => c.checked)).toEqual([false, true, true]);
    });

    it('closes with the X and with a click on the overlay, not with a click inside', async () => {
      await create();
      await up();
      $<HTMLElement>('#scFilterBtn').click();
      $<HTMLElement>('.sc-hf-dialog').click();
      expect($('#scFilterOverlay').classList.contains('show')).toBe(true);
      $<HTMLElement>('#scFilterOverlay').click();
      expect($('#scFilterOverlay').classList.contains('show')).toBe(false);
      $<HTMLElement>('#scFilterBtn').click();
      $<HTMLElement>('#scHFClose').click();
      expect($('#scFilterOverlay').classList.contains('show')).toBe(false);
    });
  });

  describe('the work modal', () => {
    it('an event of the calendar opens the item read-only with the link "go to the lead" (not from the board); the pencil opens the edit form', async () => {
      await create();
      await up();
      $$<HTMLElement>('#scCalBody .sc-event')[0].click();
      expect($('#ld2ViewWorkOverlay').classList.contains('show')).toBe(true);
      expect($<HTMLElement>('#ld2VwGoLead').style.display).not.toBe('none');
      expect($<HTMLAnchorElement>('#ld2VwGoLead').getAttribute('href')).toMatch(/^\/crm\/opportunities\/\d+\?activityGroupId=\d+$/);
      expect($<HTMLButtonElement>('#ld2VwEditBtn').disabled).toBe(false);
      $<HTMLElement>('#ld2VwEditBtn').click();
      expect($('#ld2ViewWorkOverlay').classList.contains('show')).toBe(false);
      expect($('#ld2AddWorkOverlay').classList.contains('show')).toBe(true);
      expect($<HTMLInputElement>('#ld2AwSubject').value).not.toBe('');
      await tab('board');
      $<HTMLElement>('#ld2AddWorkOverlay .ld2-aw-close').click();
      $<HTMLElement>('#scApptBoard .sc-card').click();
      expect($('#ld2ViewWorkOverlay').classList.contains('show')).toBe(true);
      expect($<HTMLElement>('#ld2VwGoLead').style.display).toBe('none');
    });

    it('"+" opens the form with a customer search; the customer must be chosen (a warning), then the item is saved, the success overlay shows and the page starts again with it', async () => {
      await create();
      await up();
      await tab('board');
      $<HTMLElement>('#scAddApptBoardBtn').click();
      expect($('#ld2AddWorkOverlay').classList.contains('show')).toBe(true);
      expect($('#ld2AwCustWrap').classList.contains('wm-show')).toBe(true);
      expect($<HTMLButtonElement>('#ld2AwOwnerBtn').disabled).toBe(true); // nobody to choose from before a customer
      $<HTMLElement>('#ld2AwSubmitBtn').click();
      expect(swal).toHaveBeenLastCalledWith(expect.objectContaining({ icon: 'warning', text: 'label.ld2.please_select_customer' }));
      $<HTMLElement>('#ld2AwCustBtn').click();
      await settle(() => expect($$('#ld2AwCustItems .wm-cust-item').length).toBeGreaterThan(0));
      $$('#ld2AwCustItems .wm-cust-item')[0].dispatchEvent(new MouseEvent('mousedown', { bubbles: true }));
      await settle(() => expect($<HTMLButtonElement>('#ld2AwOwnerBtn').disabled).toBe(false));
      const first = fixture.debugElement.query(By.directive(ScheduleView)).componentInstance;
      typeIn('#ld2AwDate', '2026-10-28');
      typeIn('#ld2AwSubject', 'นัดที่เพิ่มจากปฏิทิน');
      typeIn('#ld2AwDetail', 'รายละเอียด');
      $<HTMLElement>('#ld2AwSubmitBtn').click();
      await settle(() => expect($('#wmSuccessOverlay').classList.contains('show')).toBe(true));
      await settle(() => expect(fixture.debugElement.query(By.directive(ScheduleView)).componentInstance).not.toBe(first), 6000);
      // the new page opens on the tab it was left on (the board): back to the calendar to look for the new item
      await settle(() => expect($('.ld-tab[data-tab="board"]').classList.contains('active')).toBe(true));
      await idle();
      $<HTMLElement>('.ld-tab[data-tab="calendar"]').click();
      await up();
      $<HTMLElement>('.ld-search-ic').click();
      typeIn('#scSearchInput', 'นัดที่เพิ่มจากปฏิทิน');
      $<HTMLElement>('#scSearchGo').click();
      await idle();
      await settle(() => expect($$('#scCalBody .sc-event').map((e) => e.textContent).join()).toContain('นัดที่เพิ่มจากปฏิทิน'));
    }, 15000);

    it('permissions: without CRM_Schedule_View no item opens; without _Edit no pencil / no drag; without _Create no "+" buttons; without CRM_Lead_View no "go to the lead"', async () => {
      denied = new Set(['CRM_Schedule_View']);
      await create();
      await up();
      $$<HTMLElement>('#scCalBody .sc-event')[0].click();
      expect($('#ld2ViewWorkOverlay').classList.contains('show')).toBe(false);
      fixture.destroy();
      TestBed.resetTestingModule();
      denied = new Set(['CRM_Schedule_Edit', 'CRM_Schedule_Create', 'CRM_Schedule_Create_Sup', 'CRM_Lead_View']);
      await create();
      await up();
      expect(['scAddApptBoardBtn', 'scAddTaskBoardBtn', 'scAddApptListBtn', 'scAddTaskListBtn'].every((id) => $<HTMLElement>('#' + id).style.display === 'none')).toBe(true);
      expect($<HTMLElement>('#ld2VwEditBtn').style.display).toBe('none');
      await tab('board');
      expect($$('#scApptBoard .sc-card').every((c) => c.getAttribute('draggable') === 'false')).toBe(true);
      $<HTMLElement>('#scApptBoard .sc-menu-btn').click();
      expect($$('#scApptBoard .sc-ctx-menu.show .sc-ctx-item')).toHaveLength(0);
    });
  });

  describe('the error screen', () => {
    it('a failing request shows the error page with its message and "ลองใหม่" asks again', async () => {
      sessionStorage.setItem('ts.mock.schedule.config', JSON.stringify({ failCalendar: true }));
      await create();
      await settle(() => expect($<HTMLElement>('#scErrorPage').style.display).toBe('flex'));
      expect(text('#scErrorMsg')).toBe('label.schedule.load_fail_calendar (HTTP 500)');
      expect($<HTMLElement>('#scTabCalendar').style.display).toBe('none');
      sessionStorage.removeItem('ts.mock.schedule.config');
      $<HTMLElement>('.sc-error-retry').click();
      await settle(() => expect($<HTMLElement>('#scErrorPage').style.display).toBe('none'));
      await up();
    });

    it('no product at all hides both dropdowns and still draws the calendar', async () => {
      sessionStorage.setItem('ts.mock.schedule.config', JSON.stringify({ noProducts: true }));
      await create();
      await settle(() => expect($<HTMLElement>('#scProdWrap').style.display).toBe('none'));
      expect($<HTMLElement>('#scGroupWrap').style.display).toBe('none');
      sessionStorage.removeItem('ts.mock.schedule.config');
    });
  });

  describe('life cycle', () => {
    it('a language switch is a page reload in Java: a NEW page instance', async () => {
      await create();
      await up();
      const first = fixture.debugElement.query(By.directive(ScheduleView)).componentInstance;
      lang.set('en');
      fixture.detectChanges();
      TestBed.tick?.();
      await settle(() => expect(fixture.debugElement.query(By.directive(ScheduleView)).componentInstance).not.toBe(first));
      await up();
    });

    it('leaving the page removes what the scripts put on the document and on window (listeners, timers, observers, window.x)', async () => {
      const added: Array<[string, unknown]> = [];
      const removed: Array<[string, unknown]> = [];
      const add = document.addEventListener.bind(document);
      const rem = document.removeEventListener.bind(document);
      vi.spyOn(document, 'addEventListener').mockImplementation((type: string, fn: unknown, o?: unknown) => (added.push([type, fn]), add(type, fn as EventListener, o as AddEventListenerOptions)));
      vi.spyOn(document, 'removeEventListener').mockImplementation((type: string, fn: unknown, o?: unknown) => (removed.push([type, fn]), rem(type, fn as EventListener, o as EventListenerOptions)));
      await create();
      await up();
      await tab('list');
      await tab('board');
      const w = window as unknown as Record<string, unknown>;
      expect(typeof w['scGoLead']).toBe('function');
      expect(typeof w['wmOpenAdd']).toBe('function');
      expect(w['LD2_MY_EMPLOYEE_ID']).toBe('1001');
      expect(FakeObserver.all.some((o) => !o.disconnected)).toBe(true);
      fixture.destroy();
      for (const name of ['scGoLead', 'scOpenWorkModal', 'switchCalView', 'saveScheduleState', 'SC_APPLIED_FILTER', 'scHFDdToggle', 'wmOpenAdd', 'wmSetLeadContext', 'wmShowSuccess', 'LD2_MY_EMPLOYEE_ID', 'LD2_CAN_SCHEDULE_EDIT']) expect(w[name], name).toBeUndefined();
      const left = added.filter((a) => !removed.some((r) => r[0] === a[0] && r[1] === a[1]));
      expect(left.map((l) => l[0])).toEqual([]);
      expect(FakeObserver.all.every((o) => o.disconnected)).toBe(true);
    });

    it('leaving the page before the first answer arrived: the late answers paint nothing (they never settle)', async () => {
      await create();
      await new Promise((r) => setTimeout(r, 60));
      const body = $('#scCalBody');
      fixture.destroy();
      await new Promise((r) => setTimeout(r, 900)); // the mock answers after 150 ms
      expect(body.querySelector('.sc-event')).toBeNull();
    });

    it('with mock off the host asks the LIVE backend (the REST services of triplesale-service, never the BFF): the saved filter state of the tab opens the page, what it asks is /schedules', async () => {
      sessionStorage.setItem('ts.sc_filter_state.demo', JSON.stringify({ movementTypeId: 1004400740, activityGroupId: null, calView: 'week', calYear: 2026, calMonth: 9, calDay: 14, tab: 'calendar', filter: null, listSort: 'date_desc', search: '' }));
      const { deps, calls } = fakeRest(
        (c) => {
          if (c.path === '/master-data/movement-types/LD') return { status: 200, result: { items: [{ id: 1004400740, code: 'LD-HL', name: 'ผลิตภัณฑ์จาก REST', usesWorkflowStep: false }] } };
          if (c.path.startsWith('/schedules?')) return { status: 200, result: { viewMode: 'week', items: [] } };
          return null; // everything else: the service does not answer
        },
        { roles: [], user: { username: 'demo' } },
      );
      const backend = vi.spyOn(ScheduleView.prototype as unknown as { backend(): Promise<unknown> }, 'backend').mockImplementation(async () => createLiveSchedule(deps));
      try {
        await create(false);
        await vi.waitFor(() => expect(calls.some((c) => c.path.startsWith('/schedules?viewMode=week&dateFrom='))).toBe(true), { timeout: 4000, interval: 20 });
        expect(backend).toHaveBeenCalledTimes(1);
        expect(el.querySelector('ts-live-missing')).toBeNull();
        expect(el.querySelector('.sc-root')).toBeTruthy();
        expect(calls.every((c) => c.url.startsWith('/triplesale-service/api/v1/'))).toBe(true);
        expect(calls.map((c) => c.path)).toContain('/master-data/movement-types/LD');
      } finally {
        sessionStorage.removeItem('ts.sc_filter_state.demo');
      }
    });
  });
});
