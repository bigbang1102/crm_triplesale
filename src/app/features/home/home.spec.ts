import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { signal } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { By } from '@angular/platform-browser';
import { Router, provideRouter } from '@angular/router';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AuthService } from '@core/auth/auth.service';
import { SessionInfo } from '@core/auth/auth.models';
import { ConfigService } from '@core/config/config.service';
import { I18n } from '@core/i18n/i18n.service';
import { ACCESS_BUTTONS } from '@core/permissions/access-buttons';
import { PermissionService } from '@core/permissions/permission.service';
import { configStub } from '@core/testing/test-helpers';
import { Home } from './home';
import { HomeView } from './home-view';
import { createMockHome, resetMockHome } from './home.mock';

const SERVICE = '/triplesale-service/api/v1';
const session = signal<SessionInfo | null>({
  username: 'demo', profileName: 'Demo', employeeId: 1001, employeeCode: 'E101', branch: { id: 1, code: 'SUN', name: 'SUN' }, branchCode: 'SUN', roles: ['super_admin'],
});
const lang = signal<'th' | 'en'>('th');
const t = (k: string) => k;
/** the real `backend()` of the host (the tests below replace it by the mock, except the ones that run against the REST service) */
const realBackend = (HomeView.prototype as unknown as { backend(): Promise<unknown> }).backend;

/**
 * The inline handlers of the Java markup / of the HTML strings the engine writes (`onclick="window.tsGoLead(…)"`) run in the jsdom realm,
 * whose `window` is not the object the engine (a module of the test realm) puts its functions on — in a browser they are the same. So the
 * functions the engine publishes are copied over to the realm of the handlers as soon as they exist.
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
  for (const k of Object.keys(w)) if (/^(ts|wm|ld|LD2_)/.test(k)) realm[k] = w[k];
};

/** the 2D context jsdom does not have: records what the donut draws */
function fakeContext(): { calls: string[]; ctx: unknown } {
  const calls: string[] = [];
  const ctx = new Proxy({} as Record<string, unknown>, {
    get: (o, k: string) => (k in o ? o[k] : (...a: unknown[]) => void calls.push(`${k}(${a.map((x) => (typeof x === 'number' ? Math.round(x * 100) / 100 : String(x))).join(',')})`)),
    set: (o, k: string, v) => ((o[k] = v), calls.push(`${k}=${String(v)}`), true),
  });
  return { calls, ctx };
}

// every test starts the page and waits for the mock network (150 ms per answer, 270 ms for the leads)
vi.setConfig({ testTimeout: 20000 });

describe('CRM home page (pages/index.xhtml + resources/js/dashboard.js + components/work_modal.xhtml, generated)', () => {
  let fixture: ComponentFixture<Home>;
  let el: HTMLElement;
  let swal: ReturnType<typeof vi.fn<(o: unknown) => Promise<unknown>>>;
  let denied: Set<string>;
  /** codes of the button registry (PermissionService.canUse) the signed-in user may not use, besides those of the roles in `denied` */
  let deniedCodes: Set<string>;
  let bridgeTimer: ReturnType<typeof setInterval> | undefined;
  let canvas: ReturnType<typeof fakeContext>;
  let wrap: ((url: string, init: RequestInit | undefined, real: () => Promise<Response>) => Promise<Response>) | undefined;
  /** the test runs against the REST service (the host's own `backend()`), not the mock */
  let useRest = false;

  // (the assign dialog moves itself into <body>: what is not inside the page is looked for in the document)
  const $ = <T extends HTMLElement = HTMLElement>(sel: string) => (el.querySelector<T>(sel) ?? document.querySelector<T>(sel))!;
  const $$ = <T extends HTMLElement = HTMLElement>(sel: string) => {
    const own = [...el.querySelectorAll<T>(sel)];
    return own.length ? own : [...document.querySelectorAll<T>(sel)];
  };
  const text = (sel: string) => ($(sel)?.textContent ?? '').trim();
  const settle = (fn: () => void, timeout = 6000) => vi.waitFor(fn, { timeout, interval: 40 });
  const rows = () => $$('#tsOppsBody tr[data-leadid]');
  /** the page is up when the first page of the table is in (the skeleton is gone) and the statistics have arrived */
  const up = () =>
    settle(() => {
      expect(rows().length).toBeGreaterThan(0);
      expect(text('#tsStatsRow .ts-stat-value')).not.toBe('0');
    });
  const typeIn = (sel: string, v: string) => {
    const i = $<HTMLInputElement>(sel);
    i.value = v;
    i.dispatchEvent(new Event('input', { bubbles: true }));
    i.dispatchEvent(new Event('change', { bubbles: true }));
  };
  const pickProduct = async (id: string) => {
    $<HTMLElement>('#tsProductBtn').click();
    $<HTMLElement>(`#tsProdDd .ts-prod-dd-item[data-mt="${id}"]`).click();
    await new Promise((r) => setTimeout(r, 30));
  };

  async function create(mock = true): Promise<void> {
    TestBed.configureTestingModule({
      providers: [
        provideRouter([]),
        provideHttpClient(),
        provideHttpClientTesting(),
        { provide: ConfigService, useValue: configStub({ mock }) },
        { provide: AuthService, useValue: { session } },
        { provide: I18n, useValue: { lang, t, use: async (l: 'th' | 'en') => lang.set(l), masterRaw: () => undefined } },
        {
          provide: PermissionService,
          useValue: {
            has: (k: string) => !denied.has(k),
            // the button registry as PermissionService answers it: any of the roles the code hangs under is held, and the code is not denied by itself
            canUse: (code: string) => {
              const roles = (ACCESS_BUTTONS as Record<string, { roles: readonly string[] }>)[code]?.roles ?? [];
              return roles.some((role) => !denied.has(role)) && !deniedCodes.has(code);
            },
          },
        },
      ],
    });
    fixture = TestBed.createComponent(Home);
    document.body.appendChild(fixture.nativeElement);
    fixture.detectChanges();
    el = fixture.nativeElement as HTMLElement;
    // the engine starts after the first change detection (a dynamic import of the mock) and again after a language switch: whatever it
    // publishes is copied to the inline handlers at once
    bridgeTimer ??= setInterval(bridge, 2);
  }

  beforeEach(() => {
    resetMockHome();
    for (const k of ['ts_dash_selected_mt', 'ts_dash_selected_wf', 'ts_dash_selected_name']) localStorage.removeItem(k);
    lang.set('th');
    denied = new Set();
    deniedCodes = new Set();
    wrap = undefined;
    useRest = false;
    canvas = fakeContext();
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockImplementation(() => canvas.ctx as never);
    const nativeClick = HTMLElement.prototype.click;
    vi.spyOn(HTMLElement.prototype, 'click').mockImplementation(function (this: HTMLElement) {
      bridge();
      nativeClick.call(this);
    });
    swal = vi.fn<(o: unknown) => Promise<unknown>>(async () => undefined);
    vi.spyOn(HomeView.prototype as unknown as { swal(o: unknown): Promise<unknown> }, 'swal').mockImplementation((o) => swal(o));
    // jsdom loads no scripts: stand in for step_group_color.js (the page asks it for the colour of a workflow group)
    vi.spyOn(HomeView.prototype as unknown as { loadHelpers(): Promise<unknown> }, 'loadHelpers').mockImplementation(async () => {
      (window as unknown as Record<string, unknown>)['StepGroupColor'] = { buildMeta: (items: unknown[]) => ({ total: items.length }), resolve: () => '#0C8E6A', tagStyle: (hex: string) => `color:${hex};`, color: () => '#0C8E6A' };
    });
    // the mock backend as the page gets it (permissions of the test), optionally with a spy on every request
    vi.spyOn(HomeView.prototype as unknown as { backend(): Promise<unknown> }, 'backend').mockImplementation(async function (this: HomeView) {
      if (useRest) return realBackend.call(this);
      const real = createMockHome({ can: (f) => !denied.has(f) });
      return { fetch: (url: string, init?: RequestInit) => (wrap ? wrap(url, init, () => real.fetch(url, init)) : real.fetch(url, init)) };
    });
  });
  afterEach(() => {
    clearInterval(bridgeTimer);
    bridgeTimer = undefined;
    fixture?.destroy();
    TestBed.resetTestingModule();
    vi.restoreAllMocks();
    delete (window as unknown as Record<string, unknown>)['StepGroupColor'];
    // the shell's phone masks are the first page's `PhoneFormat` (a test module of its own each time): the next test starts without them
    delete (window as unknown as Record<string, unknown>)['TsPhone'];
    localStorage.clear();
  });

  it('is the markup of the Java page: product, statistics, donut, table, calendar, the two cards, the assign dialog and the work modal', async () => {
    await create();
    await up();
    expect(['tsProductBtn', 'tsProdDd', 'tsStatsRow', 'tsDonutCanvas', 'tsDonutTip', 'tsLegend', 'tsOppsBody', 'tsDateFrom', 'tsDateTo', 'tsCalBody', 'tsComboBody', 'tsTaskList', 'tsAssignOverlay', 'ld2AddWorkOverlay', 'ld2ViewWorkOverlay', 'wmSuccessOverlay'].every((id) => !!$('#' + id))).toBe(true);
    expect($$('.ts-opps thead th').map((th) => th.textContent!.trim())).toEqual(['label.template.customer_name', 'label.template.tel', 'chat.cust.owner', 'label.dashboard.step_group', 'label.dashboard.interest_level']);
    expect($('.ts-block-head .ts-card-title').textContent).toBe('label.dashboard.customers_all');
    expect($$('.ts-cal-grid thead th').map((th) => th.textContent)).toEqual(['SUN', 'MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT']);
  });

  it('draws the first load: product, statistics, donut, the NEW leads (20 rows), the calendar and both cards', async () => {
    await create();
    await up();
    expect(text('#tsProductLabel')).toBe('สินเชื่อบ้าน');
    expect($$('#tsProdDd .ts-prod-dd-item')).toHaveLength(4);
    expect($('#tsProdDd .ts-prod-dd-item.selected .fa-check')).toBeTruthy();
    expect($$('#tsStatsRow .ts-stat-label').map((l) => l.textContent)).toEqual(['label.contracts.filter_all', 'New', 'Success', 'Inactive', 'Lost', 'Active']);
    expect($$('#tsStatsRow .ts-active-dots .d')).toHaveLength(3);
    // the figure "New" is the number in the title of the table
    const news = Number($$('#tsStatsRow .ts-stat-value')[1].textContent);
    expect(Number(text('#tsOppsTotal'))).toBe(news);
    // the first page is 20 leads; the table shows the NEW ones (the rest are other statuses)
    expect(rows().length).toBeGreaterThan(0);
    expect(rows().length).toBeLessThanOrEqual(20);
    expect($$('#tsOppsBody .ts-pill').every((p) => p.textContent === 'NEW' || p.classList.contains('wf-tag'))).toBe(true);
    // the donut was drawn on the canvas, and its legend names three steps and says how many more
    expect(canvas.calls.some((c) => c.startsWith('arc('))).toBe(true);
    expect($$('#tsLegend .ts-legend-item')).toHaveLength(3);
    expect($('#tsLegend .ts-legend-more').firstChild!.textContent).toBe('label.dashboard.more_steps');
    expect($$('#tsLegend .ts-more-row').length).toBeGreaterThan(5);
    expect(Number(text('#tsDonutTotal'))).toBeGreaterThan(0);
    expect(/^[\w.]+ \d{4}$/.test(text('#tsCalLabel')) || /\d{4}$/.test(text('#tsCalLabel'))).toBe(true);
    expect($$('#tsCalBody .ts-cal-cell').length).toBeGreaterThanOrEqual(35);
    expect($('#tsCalBody .ts-cal-cell.c-today')).toBeTruthy();
    expect($$('#tsTaskList .ts-task-card').length).toBeGreaterThan(0);
    // the dates of the range are filled in (2 years back … today)
    expect($<HTMLInputElement>('#tsDateFrom').value).toMatch(/^\d{4}-\d\d-01$/);
    expect($<HTMLInputElement>('#tsDateTo').value).toMatch(/^\d{4}-\d\d-\d\d$/);
  });

  it('infinite scroll: reaching the bottom of the table asks for the next page and appends it (no row twice) until the end', async () => {
    // a table that is taller than its box (jsdom has no layout): the page does not fill it up by itself
    vi.spyOn(Element.prototype, 'scrollHeight', 'get').mockImplementation(function (this: Element) {
      return this.classList.contains('ts-opps-scroll') ? 100000 : 0;
    });
    vi.spyOn(Element.prototype, 'clientHeight', 'get').mockImplementation(function (this: Element) {
      return this.classList.contains('ts-opps-scroll') ? 200 : 0;
    });
    await create();
    await up();
    const total = Number(text('#tsOppsTotal'));
    const box = $('.ts-opps-scroll');
    Object.defineProperty(box, 'scrollTop', { configurable: true, writable: true, value: 99999 });
    const first = rows().length;
    expect(first).toBeLessThan(total);
    for (let i = 0; i < 12 && rows().length < total; i++) {
      const before = rows().length;
      box.dispatchEvent(new Event('scroll'));
      // (a page can have no NEW lead at all: the page then asks for the next one by itself)
      await settle(() => expect(rows().length).toBeGreaterThan(before), 8000);
    }
    await settle(() => expect(rows()).toHaveLength(total));
    const ids = rows().map((r) => r.dataset['leadid']);
    expect(new Set(ids).size).toBe(ids.length);
    // …and at the end a scroll asks for nothing more
    const urls: string[] = [];
    wrap = async (url, _i, real) => (urls.push(url), real());
    box.dispatchEvent(new Event('scroll'));
    await new Promise((r) => setTimeout(r, 500));
    expect(urls.filter((u) => u.includes('board/leads'))).toEqual([]);
  });

  it('a click on a row opens that lead, with its workflow group; the "assign" button of a row is not a click on the row', async () => {
    await create();
    await up();
    const nav = vi.spyOn(TestBed.inject(Router), 'navigateByUrl').mockResolvedValue(true);
    const first = rows()[0];
    first.click();
    expect(nav).toHaveBeenCalledWith(`/crm/opportunities/${first.dataset['leadid']}?activityGroupId=${first.dataset['groupid']}`);
    nav.mockClear();
    const btn = $<HTMLElement>('#tsOppsBody .ts-assign-btn');
    btn.click();
    expect(nav).not.toHaveBeenCalled();
    expect($('#tsAssignOverlay').classList.contains('show')).toBe(true);
  });

  it('a product without a workflow: the column says "ขั้นตอน", the donut is counted from the rows, and the choice is remembered (TS_PREF)', async () => {
    await create();
    await up();
    await pickProduct('1004400742');
    await settle(() => expect(text('#tsStepHead')).toBe('label.dashboard.step'));
    await settle(() => expect(rows().length).toBeGreaterThan(0));
    expect(text('#tsProductLabel')).toBe('ที่ปรึกษาการเงิน');
    expect($$('#tsOppsBody .wf-tag')).toHaveLength(0);
    expect($$('#tsLegend .ts-legend-item').length).toBeGreaterThan(0);
    expect(localStorage.getItem('ts_dash_selected_mt')).toBe('1004400742');
    expect(localStorage.getItem('ts_dash_selected_wf')).toBe('0');
    expect(localStorage.getItem('ts_dash_selected_name')).toBe('ที่ปรึกษาการเงิน');
  });

  it('a product without any lead: empty table with its picture and text, zero figures', async () => {
    await create();
    await up();
    await pickProduct('1004400743');
    await settle(() => expect($('#tsOppsBody .ts-opps-empty')).toBeTruthy());
    expect(text('#tsOppsBody .ts-opps-empty-txt')).toBe('label.dashboard.empty_customer');
    expect($<HTMLImageElement>('#tsOppsBody .ts-opps-empty img').getAttribute('src')).toBe('assets/images/background/no_data_table.png');
    await settle(() => expect(text('#tsStatsRow .ts-stat-value')).toBe('0'));
    expect(text('#tsComboBody')).toContain('label.dashboard.empty_appointment');
    expect(text('#tsTaskList')).toContain('label.dashboard.empty_task');
  });

  it('the remembered product is the one the page opens on', async () => {
    localStorage.setItem('ts_dash_selected_mt', '1004400741');
    localStorage.setItem('ts_dash_selected_wf', '1');
    localStorage.setItem('ts_dash_selected_name', 'สินเชื่อรถยนต์');
    await create();
    // the label is the remembered name before the list of products has arrived (the product list is the slowest of the first answers)
    await settle(() => expect(text('#tsProductLabel')).toBe('สินเชื่อรถยนต์'));
    await up();
    expect(text('#tsProductLabel')).toBe('สินเชื่อรถยนต์');
    expect($('#tsProdDd .ts-prod-dd-item.selected').getAttribute('data-mt')).toBe('1004400741');
  });

  it('the date range filters the table and the figures; "to" before "from" is swapped', async () => {
    await create();
    await up();
    const total = text('#tsStatsRow .ts-stat-value');
    typeIn('#tsDateFrom', '2026-09-01');
    typeIn('#tsDateTo', '2026-03-01');
    expect($<HTMLInputElement>('#tsDateFrom').value).toBe('2026-03-01');
    expect($<HTMLInputElement>('#tsDateTo').value).toBe('2026-09-01');
    await settle(() => expect(text('#tsStatsRow .ts-stat-value')).not.toBe(total));
  });

  it('requests that a newer filter replaced are cancelled (AbortController) and their answers never paint', async () => {
    const aborted: string[] = [];
    wrap = async (url, init, real) => {
      init?.signal?.addEventListener('abort', () => aborted.push(url));
      return real();
    };
    await create();
    await up();
    typeIn('#tsDateFrom', '2026-01-01');
    await new Promise((r) => setTimeout(r, 20));
    typeIn('#tsDateFrom', '2026-06-01');
    await settle(() => expect(aborted.length).toBeGreaterThan(0));
    await new Promise((r) => setTimeout(r, 900));
    expect(text('#tsOppsTotal')).toBe(text('#tsStatsRow .ts-stat:nth-child(2) .ts-stat-value'));
  });

  describe('failures', () => {
    it('the leads cannot be loaded: a retry, then an empty table with a warning', async () => {
      const urls: string[] = [];
      wrap = async (url, _init, real) => {
        if (url.includes('board/leads')) {
          urls.push(url);
          return new Response('[]', { status: 500 });
        }
        return real();
      };
      await create();
      await settle(() => expect($('#tsOppsLoadWarn')).toBeTruthy(), 8000);
      expect(text('#tsOppsLoadWarn')).toBe('⚠ label.dashboard.opps_load_fail');
      expect(urls.length).toBe(2); // the page asks again once, 800 ms later
      expect($('#tsOppsBody .ts-opps-empty')).toBeTruthy();
    });

    it('without CRM_Lead_View the list answers "[]": the same warning', async () => {
      denied = new Set(['CRM_Lead_View']);
      await create();
      await settle(() => expect($('#tsOppsLoadWarn')).toBeTruthy(), 8000);
    });

    it('before the answers arrive the table is a skeleton', async () => {
      await create();
      await settle(() => expect($$('#tsOppsBody .ts-opps-skel-row')).toHaveLength(6));
      await up();
      expect($$('#tsOppsBody .ts-opps-skel-row')).toHaveLength(0);
    });
  });

  describe('the assign-work dialog', () => {
    const open = async (i = 0) => {
      $$<HTMLElement>('#tsOppsBody .ts-assign-btn')[i].click();
      await settle(() => expect($('#tsAssignOverlay').classList.contains('show')).toBe(true));
      // the team list and the sale person / employee lists have been asked for
      await settle(() => expect($$('#tsAsgOwner option').length).toBeGreaterThan(1));
    };

    it('moves itself into <body> and shows the lead; the three lists are the master data; "ผู้รับผิดชอบ" has every employee', async () => {
      await create();
      await up();
      await open();
      expect($('#tsAssignOverlay').parentElement).toBe(document.body);
      expect(text('#tsAsgName')).not.toBe('-');
      expect(text('#tsAsgInterest')).toBe('NEW');
      expect($$('#tsAsgTeam option').map((o) => o.textContent)).toEqual(['label.dashboard.select', 'TA ทีม A', 'TB ทีม B']);
      expect($$('#tsAsgOwner option')).toHaveLength(9);
      expect($$('#tsAsgSale option')).toHaveLength(9);
      // …shown through the custom dropdown that always opens downwards
      expect($$('.ts-cs')).toHaveLength(3);
    });

    it('choosing a team asks for the people of that team only', async () => {
      await create();
      await up();
      await open();
      const team = $<HTMLSelectElement>('#tsAsgTeam');
      team.value = '1004400002';
      team.dispatchEvent(new Event('change', { bubbles: true }));
      await settle(() => expect($$('#tsAsgOwner option')).toHaveLength(5));
    });

    it('no owner: a message and nothing is sent; an owner: saved, the row is drawn again in place, the dialog closes', async () => {
      const sent: string[] = [];
      wrap = async (url, init, real) => {
        if (url.includes('lead-assign')) sent.push(String(init?.body));
        return real();
      };
      await create();
      await up();
      await open();
      $<HTMLElement>('#tsAssignSubmit').click();
      expect(swal).toHaveBeenLastCalledWith(expect.objectContaining({ icon: 'info', text: 'label.dashboard.pick_owner' }));
      expect(sent).toEqual([]);
      const leadId = $('#tsOppsBody .ts-assign-btn').closest('tr')!.dataset['leadid'];
      const owner = $<HTMLSelectElement>('#tsAsgOwner');
      owner.value = '1002';
      owner.dispatchEvent(new Event('change', { bubbles: true }));
      $<HTMLElement>('#tsAssignSubmit').click();
      expect($<HTMLButtonElement>('#tsAssignSubmit').disabled).toBe(true);
      expect(text('#tsAssignSubmit')).toBe('label.dashboard.saving');
      await settle(() => expect(swal).toHaveBeenLastCalledWith(expect.objectContaining({ text: 'label.dashboard.assign_ok' })));
      expect(JSON.parse(sent[0])).toMatchObject({ employeeId: '1002' });
      // that row is drawn again in place: the button is gone, the owner is named (rows below it may have arrived meanwhile)
      expect(document.querySelector('#tsOppsBody tr[data-leadid="' + leadId + '"] .ts-assign-btn')).toBeNull();
      expect($('#tsAssignOverlay').classList.contains('show')).toBe(false);
      expect($<HTMLButtonElement>('#tsAssignSubmit').disabled).toBe(false);
      expect(text('#tsOppsBody tr[data-leadid="' + leadId + '"] td:nth-child(3)')).toBe('สุดา รักงาน');
    });

    it('a refusal of the backend is shown with its message and keeps the dialog open; a dead network says so', async () => {
      await create();
      await up();
      await open();
      const owner = $<HTMLSelectElement>('#tsAsgOwner');
      owner.value = '1008';
      owner.dispatchEvent(new Event('change', { bubbles: true }));
      $<HTMLElement>('#tsAssignSubmit').click();
      await settle(() => expect(swal).toHaveBeenLastCalledWith(expect.objectContaining({ text: expect.stringContaining('label.dashboard.assign_fail: ต้องส่งต่อ') })));
      expect($('#tsAssignOverlay').classList.contains('show')).toBe(true);
      expect($<HTMLButtonElement>('#tsAssignSubmit').disabled).toBe(false);
      wrap = async (url, _i, real) => {
        if (url.includes('lead-assign')) throw new TypeError('Failed to fetch');
        return real();
      };
      owner.value = '1002';
      owner.dispatchEvent(new Event('change', { bubbles: true }));
      $<HTMLElement>('#tsAssignSubmit').click();
      await settle(() => expect(swal).toHaveBeenLastCalledWith(expect.objectContaining({ text: 'label.dashboard.backend_error' })));
    });

    it('closes with the X and with a click on the backdrop, not with a click inside', async () => {
      await create();
      await up();
      await open();
      $<HTMLElement>('.ts-asg-modal').click();
      expect($('#tsAssignOverlay').classList.contains('show')).toBe(true);
      $<HTMLElement>('#tsAssignClose').click();
      expect($('#tsAssignOverlay').classList.contains('show')).toBe(false);
      await open(1);
      $<HTMLElement>('#tsAssignOverlay').click();
      expect($('#tsAssignOverlay').classList.contains('show')).toBe(false);
    });
  });

  describe('the calendar and the cards', () => {
    it('the arrows change the month and ask for its dots and cards; a click on a day loads that day alone', async () => {
      const urls: string[] = [];
      wrap = async (url, _i, real) => {
        urls.push(url);
        return real();
      };
      await create();
      await up();
      const label = text('#tsCalLabel');
      $$<HTMLElement>('.ts-cal-nav .ts-cal-btn')[0].click();
      expect(text('#tsCalLabel')).not.toBe(label);
      await settle(() => expect(urls.some((u) => u.includes('viewMode=year'))).toBe(true));
      await settle(() => expect($('#tsCalBody .ts-cal-cell.c-hi, #tsCalBody .ts-cal-cell.c-past')).toBeTruthy());
      $<HTMLElement>('#tsCalBody .ts-cal-cell.c-hi, #tsCalBody .ts-cal-cell.c-past').click();
      await settle(() => expect(urls.some((u) => u.includes('viewMode=day&date='))).toBe(true));
      expect($('#tsCalBody .ts-cal-cell.c-sel')).toBeTruthy();
      $$<HTMLElement>('.ts-cal-nav .ts-cal-btn')[1].click();
      expect(text('#tsCalLabel')).toBe(label);
    });

    it('the carousel of appointments goes round; a card opens its lead', async () => {
      await create();
      await up();
      const dots = $$('#tsComboDots span');
      if (dots.length > 1) {
        const first = text('#tsComboBody .ts-appt-meta-row');
        $<HTMLElement>('#tsComboNext').click();
        expect($$('#tsComboDots span')[1].classList.contains('active')).toBe(true);
        expect(text('#tsComboBody .ts-appt-meta-row')).not.toBe(first);
        $<HTMLElement>('#tsComboPrev').click();
        $<HTMLElement>('#tsComboPrev').click();
        expect($$('#tsComboDots span')[dots.length - 1].classList.contains('active')).toBe(true);
      }
      const nav = vi.spyOn(TestBed.inject(Router), 'navigateByUrl').mockResolvedValue(true);
      $<HTMLElement>('#tsComboBody .ts-appt-slide').click();
      expect(nav).toHaveBeenCalledWith(expect.stringMatching(/^\/crm\/opportunities\/\d+/));
      nav.mockClear();
      $<HTMLElement>('#tsTaskList .ts-task-card').click();
      expect(nav).toHaveBeenCalledWith(expect.stringMatching(/^\/crm\/opportunities\/\d+/));
    });

    it('the external-link icons go to the calendar page through the router (no page load), in the capture phase', async () => {
      await create();
      await up();
      const nav = vi.spyOn(TestBed.inject(Router), 'navigateByUrl').mockResolvedValue(true);
      const a = $<HTMLAnchorElement>('.ts-section-head a');
      expect(a.getAttribute('href')).toBe('/crm/schedule');
      const ev = new MouseEvent('click', { bubbles: true, cancelable: true, button: 0 });
      a.dispatchEvent(ev);
      expect(ev.defaultPrevented).toBe(true);
      expect(nav).toHaveBeenCalledWith('/crm/schedule');
      // with a modifier key the browser keeps the link (a new tab)
      nav.mockClear();
      const ctrl = new MouseEvent('click', { bubbles: true, cancelable: true, button: 0, ctrlKey: true });
      a.dispatchEvent(ctrl);
      expect(ctrl.defaultPrevented).toBe(false);
      expect(nav).not.toHaveBeenCalled();
    });
  });

  describe('the work modal opened from the page', () => {
    it('"+ เพิ่มนัดหมาย" opens it with the customer search; without a customer a save is refused with the message of the modal', async () => {
      await create();
      await up();
      $<HTMLElement>('#tsComboAddBtn').click();
      await settle(() => expect($('#ld2AddWorkOverlay').classList.contains('show')).toBe(true));
      expect(text('#ld2AwTitle')).toBe('label.ld2.add_appointment');
      typeIn('#ld2AwSubject', 'นัดทดสอบ');
      typeIn('#ld2AwDetail', 'รายละเอียด');
      $<HTMLElement>('#ld2AwSubmitBtn').click();
      expect(swal).toHaveBeenLastCalledWith(expect.objectContaining({ text: 'label.ld2.please_select_customer' }));
    });

    it('"+ เพิ่มงาน" opens the task form', async () => {
      await create();
      await up();
      $<HTMLElement>('#tsTaskAddBtn').click();
      await settle(() => expect(text('#ld2AwTitle')).toBe('label.ld2.add_task'));
    });

    it('saves an appointment for the customer found: the success overlay, then the page starts again with the new item on the cards', async () => {
      await create();
      await up();
      $<HTMLElement>('#tsComboAddBtn').click();
      $<HTMLElement>('#ld2AwCustBtn').click();
      await settle(() => expect($$('#ld2AwCustItems .wm-cust-item').length).toBeGreaterThan(0), 8000);
      $$('#ld2AwCustItems .wm-cust-item')[1].dispatchEvent(new MouseEvent('mousedown', { bubbles: true }));
      await new Promise((r) => setTimeout(r, 1200));
      const first = fixture.debugElement.query(By.directive(HomeView)).componentInstance;
      const month = new Date().toISOString().slice(0, 8);
      typeIn('#ld2AwDate', `${month}28`);
      typeIn('#ld2AwSubject', 'นัดเซ็นสัญญาจากหน้าแรก');
      typeIn('#ld2AwDetail', 'เตรียมเอกสาร');
      $<HTMLElement>('#ld2AwSubmitBtn').click();
      await settle(() => expect($('#wmSuccessOverlay').classList.contains('show')).toBe(true), 8000);
      await settle(() => expect(fixture.debugElement.query(By.directive(HomeView)).componentInstance).not.toBe(first), 6000);
      await up();
      // (the calendar is of the current month: the appointment is among the dots and the cards)
      const items = (await (await createMockHome({ delayMs: 0, config: { leadsExtraMs: 0 } }).fetch(`../dashboardapi?action=schedules&viewMode=day&date=${month}28`)).json()) as { result: { items: { topic: string }[] } };
      expect(items.result.items.map((i) => i.topic)).toContain('นัดเซ็นสัญญาจากหน้าแรก');
    }, 25000);

    it('the buttons of the cards, of the table and of the assign dialog hang under PL-DB-MN-01 … 05 and PL-DB-AS-01: a code the user may not use takes away its button, and only that one', async () => {
      const BUTTONS: Record<string, string> = {
        'PL-DB-AS-01': '#tsAssignSubmit',
        'PL-DB-MN-01': '#tsComboAddBtn',
        'PL-DB-MN-02': '#tsComboTitle + span a[href="/crm/schedule"]',
        'PL-DB-MN-03': '#tsOppsBody .ts-assign-btn',
        'PL-DB-MN-04': '#tsTaskAddBtn',
        'PL-DB-MN-05': '.ts-tasks-card .ts-section-head a[href="/crm/schedule"]',
      };
      await create();
      await up();
      for (const [code, sel] of Object.entries(BUTTONS)) expect($(sel), code).not.toBeNull();
      for (const denied of Object.keys(BUTTONS)) {
        fixture.destroy();
        TestBed.resetTestingModule();
        deniedCodes = new Set([denied]);
        await create();
        await up();
        for (const [code, sel] of Object.entries(BUTTONS)) expect($(sel) !== null, `${code} with ${denied} denied`).toBe(code !== denied);
      }
    }, 30000);

    it('permissions: without Pipeline_Schedule_Appointment_Add_Edit / Pipeline_Schedule_Task_Add_Edit (the roles of PL-DB-MN-01 / 04) there is no "+", without CRM_Schedule_View no card, without CRM_Schedule_Create_Sup the search lists only the leads of the user', async () => {
      denied = new Set(['Pipeline_Schedule_Appointment_Add_Edit', 'Pipeline_Schedule_Task_Add_Edit']);
      await create();
      await up();
      expect($('#tsComboAddBtn')).toBeNull();
      expect($('#tsTaskAddBtn')).toBeNull();
      expect($('.ts-section-head a')).toBeTruthy();
      fixture.destroy();
      TestBed.resetTestingModule();
      denied = new Set(['CRM_Schedule_View']);
      await create();
      await up();
      expect($('#tsComboBody')).toBeNull();
      expect($('#tsTaskList')).toBeNull();
      fixture.destroy();
      TestBed.resetTestingModule();
      denied = new Set(['CRM_Schedule_Create_Sup']);
      const urls: string[] = [];
      wrap = async (url, _i, real) => {
        urls.push(url);
        return real();
      };
      await create();
      await up();
      $<HTMLElement>('#tsComboAddBtn').click();
      $<HTMLElement>('#ld2AwCustBtn').click();
      await settle(() => expect(urls.some((u) => u.includes('board/leads') && u.includes('showClosed=false'))).toBe(true));
      expect(urls.find((u) => u.includes('showClosed=false'))).toContain('employeeId=1001');
    });
  });

  describe('life cycle', () => {
    it('a language switch is a page reload in Java: a NEW page instance', async () => {
      await create();
      await up();
      const first = fixture.debugElement.query(By.directive(HomeView)).componentInstance;
      lang.set('en');
      fixture.detectChanges();
      TestBed.tick?.();
      await settle(() => expect(fixture.debugElement.query(By.directive(HomeView)).componentInstance).not.toBe(first));
      await up();
    });

    it('leaving the page removes what the scripts put on the document and on window (listeners, timers, window.x, the dialog in <body>)', async () => {
      const added: Array<[string, unknown]> = [];
      const removed: Array<[string, unknown]> = [];
      const add = document.addEventListener.bind(document);
      const rem = document.removeEventListener.bind(document);
      vi.spyOn(document, 'addEventListener').mockImplementation((type: string, fn: unknown, o?: unknown) => (added.push([type, fn]), add(type, fn as EventListener, o as AddEventListenerOptions)));
      vi.spyOn(document, 'removeEventListener').mockImplementation((type: string, fn: unknown, o?: unknown) => (removed.push([type, fn]), rem(type, fn as EventListener, o as EventListenerOptions)));
      const wAdd = window.addEventListener.bind(window);
      const wRem = window.removeEventListener.bind(window);
      const wAdded: Array<[string, unknown]> = [];
      const wRemoved: Array<[string, unknown]> = [];
      vi.spyOn(window, 'addEventListener').mockImplementation((type: string, fn: unknown, o?: unknown) => (wAdded.push([type, fn]), wAdd(type, fn as EventListener, o as AddEventListenerOptions)));
      vi.spyOn(window, 'removeEventListener').mockImplementation((type: string, fn: unknown, o?: unknown) => (wRemoved.push([type, fn]), wRem(type, fn as EventListener, o as EventListenerOptions)));
      await create();
      await up();
      $<HTMLElement>('#tsOppsBody .ts-assign-btn').click(); // the dialog is moved into <body> and listens to the window
      const w = window as unknown as Record<string, unknown>;
      expect(typeof w['tsGoLead']).toBe('function');
      expect(typeof w['wmOpenAdd']).toBe('function');
      expect(typeof w['TS_I18N']).toBe('object');
      expect(w['LD2_MY_EMPLOYEE_ID']).toBe('1001');
      expect(document.getElementById('tsAssignOverlay')).toBeTruthy();
      fixture.destroy();
      for (const name of ['tsGoLead', 'tsGoProspect', 'TS_I18N', 'wmOpenAdd', 'wmSetLeadContext', 'wmShowSuccess', 'ldOpenViewWork', 'LD2_MY_EMPLOYEE_ID', 'LD2_ROLE_SCHEDULE_CREATE']) expect(w[name], name).toBeUndefined();
      expect(document.getElementById('tsAssignOverlay')).toBeNull();
      expect(added.filter((a) => !removed.some((r) => r[0] === a[0] && r[1] === a[1])).map((l) => l[0])).toEqual([]);
      // (popstate / hashchange are the Router's: it lives until the test module is reset)
      expect(wAdded.filter((a) => !wRemoved.some((r) => r[0] === a[0] && r[1] === a[1]) && !['popstate', 'hashchange'].includes(a[0])).map((l) => l[0])).toEqual([]);
    });

    it('leaving the page before the first answers arrived: the late answers paint nothing (they never settle)', async () => {
      await create();
      await new Promise((r) => setTimeout(r, 60));
      const body = $('#tsOppsBody');
      fixture.destroy();
      await new Promise((r) => setTimeout(r, 900)); // the mock answers after 150 ms (the leads after 270)
      expect(body.querySelector('tr[data-leadid]')).toBeNull();
    });

  });

  describe('against the real backend (mock off): the live backend answers the addresses of the Java page from REST calls', () => {
    let http: HttpTestingController;
    /** what the page's live backend asked of the REST service, as `METHOD path-below-the-api` */
    let seen: string[];
    /** the bodies the page wrote to the service */
    let posted: { method: string; path: string; body: unknown }[];
    const sample = createMockHome({ delayMs: 0, config: { leadsExtraMs: 0 } });
    const ask = async (bff: string, init?: RequestInit): Promise<{ status: number; json: any }> => {
      const r = await sample.fetch(bff, init);
      return { status: r.status, json: await r.json() };
    };
    /** the REST service of the test: the shapes of triplesale-service (an envelope with `result`), made from the sample set of the mock */
    async function service(method: string, rel: string, body: unknown): Promise<{ status: number; body: unknown }> {
      const envelope = (result: unknown) => ({ status: 200, body: { status: 200, message: 'success', result } });
      const q = rel.includes('?') ? rel.slice(rel.indexOf('?') + 1) : '';
      if (method === 'PATCH' && rel === '/leads/assign') {
        posted.push({ method, path: rel, body });
        // (the live backend forwards the text the page posted, as the servlet did)
        const r = await ask('../board/lead-assign', { method: 'POST', body: typeof body === 'string' ? body : JSON.stringify(body) });
        return { status: r.status, body: r.json };
      }
      if (method !== 'GET') return { status: 404, body: { status: 404, message: `no such route ${method} ${rel}` } };
      if (rel.startsWith('/master-data/movement-types/')) return envelope((await ask('../board/movement-types')).json);
      if (rel.startsWith('/dashboard/schedules')) return { status: 200, body: (await ask('../dashboardapi?action=schedules&' + q)).json };
      if (rel.startsWith('/dashboard?')) return { status: 200, body: (await ask('../dashboardapi?action=summary&' + q)).json };
      // the phone masks of the shell: the countries are one set of the prospect options (a row needs an id; the dial code and the format are the mask)
      if (rel.startsWith('/prospects/options?sets=countries')) return envelope([{ id: '1', code: 'THA', name: 'Thailand', phoneCountryCode: '+66', phoneNumberFormat: 'XX XXX XXXX / X XXXX XXXX' }]);
      if (rel.startsWith('/prospects')) return envelope([]);
      if (rel.startsWith('/leads?')) return envelope((await ask('../board/leads?' + q)).json);
      if (rel.startsWith('/master-data/activity-groups')) return { status: 200, body: (await ask('../board/master/activity-groups?' + q)).json };
      const lists: Record<string, string> = { '/master-data/sale-groups': '../board/sale-groups', '/master-data/sale-persons': '../board/sale-persons', '/master-data/employees': '../board/employees' };
      const list = lists[rel.split('?')[0]];
      if (list) return envelope((await ask(list + (q ? '?' + q : ''))).json);
      return { status: 404, body: { status: 404, message: `no such route ${method} ${rel}` } };
    }
    /** answers every request the page has made, until `done()` */
    const pump = (done: () => boolean, timeout = 8000) =>
      settle(async () => {
        for (const r of http.match(() => true)) {
          const rel = r.request.url.slice(SERVICE.length);
          seen.push(`${r.request.method} ${rel}`);
          const out = await service(r.request.method, rel, r.request.body);
          r.flush(JSON.stringify(out.body), { status: out.status, statusText: out.status === 200 ? 'OK' : 'Error' });
        }
        expect(done(), 'asked of the service: ' + seen.join(' | ')).toBe(true);
      }, timeout);
    const started = async (): Promise<void> => {
      useRest = true;
      await create(false);
      http = TestBed.inject(HttpTestingController);
    };

    beforeEach(() => {
      seen = [];
      posted = [];
    });

    it('the first paint is made from the REST service (not the sample data, not the BFF): the products, then the statistics, the month, and the first page of the table', async () => {
      const fetchSpy = vi.spyOn(globalThis, 'fetch');
      await started();
      await pump(() => rows().length > 0 && text('#tsStatsRow .ts-stat-value') !== '0');
      expect(el.querySelector('ts-live-missing')).toBeNull();
      expect(text('#tsProductLabel')).toBe('สินเชื่อบ้าน');
      expect(seen).toContain('GET /master-data/movement-types/LD');
      // summaryUrl() / schedulesMonthUrl() / leadsUrl() of the script, as the servlets passed them on
      expect(seen.find((u) => u.startsWith('GET /dashboard?'))).toMatch(/^GET \/dashboard\?movementTypeId=1004400740&startDate=\d{4}-\d\d-01&endDate=\d{4}-\d\d-\d\d&page=1&perPage=100$/);
      expect(seen.find((u) => u.startsWith('GET /dashboard/schedules?viewMode=list'))).toMatch(/^GET \/dashboard\/schedules\?viewMode=list&dateFrom=\d{4}-\d\d-01&dateTo=\d{4}-\d\d-\d\d&movementTypeId=1004400740$/);
      expect(seen.find((u) => u.startsWith('GET /leads?'))).toMatch(/^GET \/leads\?viewMode=list&movementTypeId=1004400740&activityGroupId=0&dateRangeType=custom&dateFrom=\d{4}-\d\d-01&dateTo=\d{4}-\d\d-\d\d&sortBy=txdate_desc&page=1&perPage=20$/);
      expect(seen).toContain('GET /master-data/activity-groups?movementTypeId=1004400740');
      // the phone masks of the shell come from the same module
      expect(seen).toContain('GET /prospects/options?sets=countries');
      // nothing of the BFF: every call is a REST call below the API, none goes through the global fetch
      expect(seen.every((u) => !u.includes('/board/') && !u.includes('dashboardapi'))).toBe(true);
      expect(fetchSpy).not.toHaveBeenCalled();
      // the same page as the mock draws: the figure "New" is the number in the title of the table
      expect(Number(text('#tsOppsTotal'))).toBe(Number($$('#tsStatsRow .ts-stat-value')[1].textContent));
      expect($$('#tsProdDd .ts-prod-dd-item')).toHaveLength(4);
      expect($$('#tsLegend .ts-legend-item').length).toBeGreaterThan(0);
    });

    it('without CRM_Lead_View the table is not asked for (the servlet answered [] without a call): the warning, and no GET /leads', async () => {
      denied = new Set(['CRM_Lead_View']);
      await started();
      await pump(() => !!$('#tsOppsLoadWarn'));
      expect(seen.some((u) => u.startsWith('GET /leads?'))).toBe(false);
      expect(seen).toContain('GET /master-data/movement-types/LD');
    });

    it('a product picked in the dropdown is asked for again with its id (summary, month cards, table, activity groups)', async () => {
      await started();
      await pump(() => rows().length > 0);
      seen.length = 0;
      await pickProduct('1004400741');
      await pump(() => seen.some((u) => u.startsWith('GET /leads?')) && rows().length > 0);
      expect(seen.find((u) => u.startsWith('GET /dashboard?'))).toContain('movementTypeId=1004400741');
      expect(seen.find((u) => u.startsWith('GET /dashboard/schedules?viewMode=list'))).toContain('movementTypeId=1004400741');
      expect(seen.find((u) => u.startsWith('GET /leads?'))).toContain('movementTypeId=1004400741');
      expect(seen).toContain('GET /master-data/activity-groups?movementTypeId=1004400741');
      expect(text('#tsProductLabel')).toBe('สินเชื่อรถยนต์');
    });

    it('the assign dialog asks for the three master lists and sends PATCH /leads/assign with the body of the page; it closes on success', async () => {
      await started();
      await pump(() => rows().length > 0);
      $$<HTMLElement>('#tsOppsBody .ts-assign-btn')[0].click();
      await pump(() => $$('#tsAsgOwner option').length > 1);
      expect(seen).toEqual(expect.arrayContaining(['GET /master-data/sale-groups', 'GET /master-data/sale-persons', 'GET /master-data/employees']));
      const owner = $<HTMLSelectElement>('#tsAsgOwner');
      owner.value = '1002';
      owner.dispatchEvent(new Event('change', { bubbles: true }));
      $<HTMLElement>('#tsAssignSubmit').click();
      await pump(() => posted.length === 1 && !$('#tsAssignOverlay').classList.contains('show'));
      expect(posted[0].path).toBe('/leads/assign');
      expect(JSON.parse(String(posted[0].body))).toMatchObject({ employeeId: '1002' });
      expect(swal).toHaveBeenLastCalledWith(expect.objectContaining({ text: 'label.dashboard.assign_ok' }));
    });

    it('a newer filter replaces the older round: the page aborts the old requests (it sees an AbortError) and only the last range paints', async () => {
      await started();
      await pump(() => rows().length > 0);
      typeIn('#tsDateFrom', '2026-01-01');
      await new Promise((r) => setTimeout(r, 20));
      typeIn('#tsDateFrom', '2026-06-01');
      await pump(() => seen.some((u) => u.startsWith('GET /leads?') && u.includes('dateFrom=2026-06-01')));
      await pump(() => text('#tsOppsTotal') === text('#tsStatsRow .ts-stat:nth-child(2) .ts-stat-value'));
      expect($<HTMLInputElement>('#tsDateFrom').value).toBe('2026-06-01');
    });
  });
});
