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
import { PermissionService } from '@core/permissions/permission.service';
import { configStub } from '@core/testing/test-helpers';
import { Opportunities } from './opportunities';
import { OpportunitiesView } from './opportunities-view';
import { createMockLeads, resetMockLeads } from './opportunities.mock';

const SERVICE = '/triplesale-service/api/v1';
const session = signal<SessionInfo | null>({
  username: 'demo', profileName: 'Demo', employeeId: 1001, employeeCode: 'E101', branch: { id: 1, code: 'SUN', name: 'SUN' }, branchCode: 'SUN', roles: ['super_admin'],
});
const lang = signal<'th' | 'en'>('th');
const t = (k: string) => k;

describe('Opportunities page (pages/lead.xhtml + its three includes, generated)', () => {
  let fixture: ComponentFixture<Opportunities>;
  let el: HTMLElement;
  let allowed: Set<string> | 'all';
  /** button codes (core/permissions/access-buttons.ts) the signed-in user may not use */
  let deniedCodes: Set<string>;
  let navigate: ReturnType<typeof vi.spyOn>;

  const $ = <T extends HTMLElement = HTMLElement>(sel: string) => el.querySelector<T>(sel)!;
  const $$ = <T extends HTMLElement = HTMLElement>(sel: string) => [...el.querySelectorAll<T>(sel)];
  const text = (sel: string) => ($(sel)?.textContent ?? '').trim();
  const settle = (fn: () => void) => vi.waitFor(fn, { timeout: 6000, interval: 40 });
  /** the page is up when the first board is drawn */
  const up = () => settle(() => expect($$('#ldBoardContent .ld-card').length).toBeGreaterThan(0));
  const w = window as unknown as Record<string, any>;
  /** an inline handler (`onclick="window.ldSelectLead(5,'101')"`) as the browser runs it — jsdom evaluates them in a realm of its own, so the attribute is run here */
  const inline = (el: Element, attr: string, event: Event = new Event(attr.slice(2))) => new Function('event', el.getAttribute(attr)!).call(el, event);

  async function create(opts: { mock?: boolean } = {}): Promise<void> {
    TestBed.configureTestingModule({
      providers: [
        provideRouter([]),
        provideHttpClient(),
        provideHttpClientTesting(),
        { provide: ConfigService, useValue: configStub({ mock: opts.mock ?? true }) },
        { provide: AuthService, useValue: { session } },
        { provide: I18n, useValue: { lang, t, use: async (l: 'th' | 'en') => lang.set(l), masterRaw: () => undefined } },
        { provide: PermissionService, useValue: { has: (r: string) => allowed === 'all' || allowed.has(r), canUse: (code: string) => !deniedCodes.has(code) } },
      ],
    });
    fixture = TestBed.createComponent(Opportunities);
    document.body.appendChild(fixture.nativeElement);
    fixture.detectChanges();
    el = fixture.nativeElement as HTMLElement;
    navigate = vi.spyOn(TestBed.inject(Router), 'navigateByUrl').mockResolvedValue(true);
  }

  beforeEach(() => {
    sessionStorage.clear();
    resetMockLeads();
    lang.set('th');
    allowed = 'all';
    deniedCodes = new Set();
    // tag_pill_color.js is a script the page loads itself (jsdom does not run scripts): the Java rule, shortened
    vi.spyOn(OpportunitiesView.prototype as unknown as { loadHelpers(): Promise<unknown> }, 'loadHelpers').mockImplementation(async () => {
      w['TagPillColor'] = { style: (c: string) => `background:${c}33;color:${c};` };
    });
  });
  afterEach(() => {
    fixture?.destroy();
    TestBed.resetTestingModule();
    vi.restoreAllMocks();
    delete w['TagPillColor'];
    delete w['TsPhone'];
  });

  it('is the markup of the Java page: stat bar, tabs, toolbar, board, list, filter dialog, move-step modal, popover', async () => {
    await create();
    await up();
    expect($$('.ld-tab').map((b) => b.dataset['tab'])).toEqual(['board', 'list']);
    expect($('#ldProductBtn')).toBeTruthy();
    expect($$('#ldSortDd .ld-dd-item').map((i) => i.dataset['api'])).toEqual(['txdate_desc', 'txdate_asc', 'id_asc', 'id_desc', 'status']);
    // texts come from the bundle with the Java keys
    expect(text('.ld-toolbar > span')).toBe('label.contracts.sort_label');
    expect($<HTMLInputElement>('#ldSearchInput').getAttribute('placeholder')).toBe('label.dashboard.search');
    expect($('#ldFilterOverlay .ld-f-title').textContent).toBe('label.contracts.filter_title');
    for (const id of ['ldFilterOverlay', 'ldAccessPop', 'ld2MoveStepOverlay', 'ldListBody', 'ldSkeleton']) expect(document.getElementById(id), id).toBeTruthy();
    // the images of the Java context root are served from assets/images
    expect($<HTMLImageElement>('#ldSortIcon').getAttribute('src')).toBe('assets/images/icon/fi_sort_by.svg');
  });

  it('draws the first paint from the backend: product dropdown, summary, workflow group pill, the columns of the default group', async () => {
    await create();
    await up();
    await settle(() => expect($$('#ldProductDd .ld-dd-item').length).toBe(4));
    expect(text('#ldProductLabel')).toBe('ผลิตภัณฑ์ A (มี WorkFlow Step)');
    expect($$('#ldStatsRow .ld-stat-lbl').map((n) => n.textContent)).toEqual(['Total', 'New', 'Success', 'Lost', 'Inactive', 'Active']);
    expect($$('#ldBoardContent .ld-col-title').map((n) => n.firstChild!.textContent)).toEqual(['รับลีดใหม่', 'โทรติดต่อลูกค้า', 'นัดหมายพบลูกค้า', 'ส่งต่อทีมวิเคราะห์']);
    expect($('#ldGroupWrap').style.display).not.toBe('none');
    expect(text('#ldGroupLabel')).toBe('ฝ่ายบริการลูกค้า');
    // the skeleton fades out, then is hidden (380 ms)
    await settle(() => expect(getComputedStyle($('#ldSkeleton')).display).toBe('none'));
    // phone numbers are TsPhone spans; tag pills are painted by TagPillColor
    expect($$('.ts-tel').length).toBeGreaterThan(0);
  });

  it('a product without workflow hides the group pill, disables the tag toggle and has its own columns', async () => {
    await create();
    await up();
    await settle(() => expect($$('#ldProductDd .ld-dd-item').length).toBe(4));
    $<HTMLElement>('#ldProductBtn').click();
    $<HTMLElement>('#ldProductDd .ld-dd-item[data-id="33"]').click();
    await settle(() => expect($$('#ldBoardContent .ld-col-title').map((n) => n.firstChild!.textContent)).toEqual(['ลีดใหม่', 'ติดตามลูกค้า', 'เสนอราคา']));
    expect($('#ldGroupWrap').style.display).toBe('none');
    expect($('.ld-seg[data-seg="tag"]').classList.contains('disabled')).toBe(true);
  });

  it('the List tab loads viewMode=list; scrolling to the end appends the next page', async () => {
    await create();
    await up();
    $<HTMLElement>('.ld-tab[data-tab="list"]').click();
    await settle(() => expect($$('#ldListBody tr').length).toBe(20));
    expect($('#ldTable').classList.contains('ld-no-wf')).toBe(false);
    const wrap = $('.ld-list-wrap');
    Object.defineProperty(wrap, 'clientHeight', { value: 400, configurable: true });
    Object.defineProperty(wrap, 'scrollHeight', { value: 2000, configurable: true });
    wrap.scrollTop = 1700;
    wrap.dispatchEvent(new Event('scroll'));
    await settle(() => expect($$('#ldListBody tr').length).toBe(40));
  });

  it('searching asks the backend again with the text and shows the empty state when nothing matches (List)', async () => {
    await create();
    await up();
    $<HTMLElement>('.ld-tab[data-tab="list"]').click();
    await settle(() => expect($$('#ldListBody tr').length).toBe(20));
    $<HTMLElement>('.ld-search-ic').click();
    expect($('#ldSearch').classList.contains('open')).toBe(true);
    $<HTMLInputElement>('#ldSearchInput').value = 'zzzz';
    $('#ldSearchGo').click();
    await settle(() => expect($('#ldListEmpty').style.display).toBe('flex'));
    expect($$('#ldListBody tr')).toHaveLength(0);
  });

  it('opening a lead goes to the route with the group of the card (lead_detail.face … &activityGroupId=)', async () => {
    await create();
    await up();
    const card = $('#ldBoardContent .ld-card');
    expect(card.getAttribute('onclick')).toBe(`window.ldSelectLead('${card.dataset['id']}','101')`); // the id is quoted: a uuid is not a JS literal
    inline(card, 'onclick');
    expect(navigate).toHaveBeenCalledTimes(1);
    expect(navigate.mock.calls[0][0]).toBe(`/crm/opportunities/${card.dataset['id']}?activityGroupId=101`);
  });

  it('without CRM_Lead_View the board stays empty (the servlet answers []) and the cards cannot be opened', async () => {
    allowed = new Set(['CRM_ContactActivity_Create']);
    await create();
    await settle(() => expect(getComputedStyle($('#ldSkeleton')).display).toBe('none'));
    expect($$('#ldBoardContent .ld-card')).toHaveLength(0);
    expect(w['ldSelectLead'](5)).toBeUndefined();
    expect(navigate).not.toHaveBeenCalled();
  });

  it('only the owner (or the _Sup key) can drag a card: draggable follows CRM_ContactActivity_Create[_Sup] and the owner', async () => {
    allowed = new Set(['CRM_Lead_View', 'CRM_ContactActivity_Create']);
    await create();
    await up();
    const mine = $$('#ldBoardContent .ld-card').filter((c) => c.getAttribute('draggable') === 'true');
    const others = $$('#ldBoardContent .ld-card').filter((c) => c.getAttribute('draggable') === 'false');
    expect(others.length).toBeGreaterThan(0);
    expect(mine.length).toBeLessThan($$('#ldBoardContent .ld-card').length);
    fixture.destroy();
    TestBed.resetTestingModule();
    allowed = 'all';
    await create();
    await up();
    expect($$('#ldBoardContent .ld-card').every((c) => c.getAttribute('draggable') === 'true')).toBe(true);
  });

  it('dragging a card hangs under PL-OP-LS-06 as well: without it no card is draggable and a drop moves nothing, with the roles of Java unchanged', async () => {
    deniedCodes = new Set(['PL-OP-LS-06']);
    await create();
    await up();
    const cards = $$('#ldBoardContent .ld-card');
    expect(cards.length).toBeGreaterThan(0);
    expect(cards.every((c) => c.getAttribute('draggable') === 'false')).toBe(true);
    // a drop is refused as well (the browser would not start the drag, so the events are fired by hand)
    const bodies = $$('#ldBoardContent .ld-col-body');
    const card = bodies[0].querySelector<HTMLElement>('.ld-card')!;
    drag('dragstart', card);
    drag('drop', bodies[1]);
    expect($('#ld2MoveStepOverlay').classList.contains('show')).toBe(false);
    expect(bodies[0].querySelector(`.ld-card[data-id="${card.dataset['id']}"]`)).toBeTruthy();
  });

  /** a drag & drop as the browser fires it (jsdom has no DragEvent / DataTransfer) */
  function drag(type: string, target: Element): void {
    const e = new Event(type, { bubbles: true, cancelable: true });
    Object.defineProperty(e, 'dataTransfer', { value: { effectAllowed: '', dropEffect: '', setData: () => undefined, getData: () => '', setDragImage: () => undefined } });
    target.dispatchEvent(e);
  }

  it('dropping a card on another column opens the move-step modal; cancel puts the card back; save moves it for good', async () => {
    await create();
    await up();
    const bodies = () => $$('#ldBoardContent .ld-col-body');
    const card = bodies()[0].querySelector<HTMLElement>('.ld-card')!;
    const id = card.dataset['id']!;
    drag('dragstart', card);
    drag('dragover', bodies()[1]);
    expect(bodies()[1].classList.contains('ld-col-over')).toBe(true);
    drag('drop', bodies()[1]);
    // optimistic: the card is already in the new column and the modal asks for the note
    expect($('#ld2MoveStepOverlay').classList.contains('show')).toBe(true);
    expect($('#ld2MsStep').textContent).toBe('โทรติดต่อลูกค้า');
    expect(bodies()[1].querySelector(`.ld-card[data-id="${id}"]`)).toBeTruthy();
    inline($('#ld2MsCancelBtn'), 'onclick');
    expect($('#ld2MoveStepOverlay').classList.contains('show')).toBe(false);
    expect(bodies()[0].querySelector(`.ld-card[data-id="${id}"]`)).toBeTruthy();

    drag('dragstart', bodies()[0].querySelector<HTMLElement>(`.ld-card[data-id="${id}"]`)!);
    drag('drop', bodies()[1]);
    $<HTMLInputElement>('#ld2MsText').value = 'ย้ายตามนัด';
    inline($('#ld2MsSubmitBtn'), 'onclick');
    await settle(() => expect($('#ld2MoveStepOverlay').classList.contains('show')).toBe(false));
    await settle(() => expect(bodies()[1].querySelector(`.ld-card[data-id="${id}"]`)).toBeTruthy());
    // the server really moved it: a reload of the board keeps it there
    $<HTMLElement>('.ld-tab[data-tab="board"]').click();
    await settle(() => expect(bodies()[1].querySelector(`.ld-card[data-id="${id}"]`)).toBeTruthy());
  });

  it('saves the filter state at every load (POST /board/filter-state) — the next visit restores it', async () => {
    await create();
    await up();
    $<HTMLElement>('.ld-tab[data-tab="list"]').click();
    await settle(() => expect($$('#ldListBody tr').length).toBe(20));
    fixture.destroy();
    TestBed.resetTestingModule();
    await create();
    // a page that comes back opens on the saved tab
    await settle(() => expect($$('#ldListBody tr').length).toBe(20));
    expect($('.ld-tab[data-tab="list"]').classList.contains('active')).toBe(true);
  });

  it('the filter dialog opens, lists the master data, applies and counts the filters on the badge', async () => {
    await create();
    await up();
    $('#ldFilterBtn').click();
    expect($('#ldFilterOverlay').classList.contains('show')).toBe(true);
    await settle(() => expect($<HTMLSelectElement>('#ldOwnerSel').options.length).toBe(9));
    await settle(() => expect($$('#ldTagPanel .ld-tag-cb').length).toBe(6));
    const owner = $<HTMLSelectElement>('#ldOwnerSel');
    owner.value = '1003';
    $('#ldFilterApply').click();
    expect($('#ldFilterOverlay').classList.contains('show')).toBe(false);
    expect(text('#ldFilterBadge')).toBe('2'); // the "closed" switch always counts one
    await settle(() => expect($$('#ldBoardContent .ld-card .ld-card-owner').every((o) => o.textContent === 'วิชัย มั่นคง')).toBe(true));
  });

  it('the search icon, "ค้นหา", the filter funnel and "ล้างค่า" / "กรอง" of its dialog hang under PL-OP-LS-01 … 05, and the save button of the move-step popup under PL-CA-AD-01 (Board and List alike): a code the user may not use takes away its button, and only that one, and the page still starts', async () => {
    const BUTTONS: Record<string, string> = {
      'PL-OP-LS-01': '#ldSearch .ld-search-ic',
      'PL-OP-LS-02': '#ldSearchGo',
      'PL-OP-LS-03': '#ldFilterBtn',
      'PL-OP-LS-04': '#ldFilterClear',
      'PL-OP-LS-05': '#ldFilterApply',
      'PL-CA-AD-01': '#ld2MsSubmitBtn', // the save button of the move-step popup (a contact activity)
    };
    await create();
    await up();
    for (const [code, sel] of Object.entries(BUTTONS)) expect(el.querySelector(sel), code).not.toBeNull();
    for (const denied of Object.keys(BUTTONS)) {
      fixture.destroy();
      TestBed.resetTestingModule();
      sessionStorage.clear(); // the List tab of the last visit is saved: the next page would open on it
      deniedCodes = new Set([denied]);
      await create();
      await up();
      const shown =(tab: string) => {
        for (const [code, sel] of Object.entries(BUTTONS)) expect(!!el.querySelector(sel), `${code} with ${denied} denied (${tab})`).toBe(code !== denied);
      };
      shown('board');
      $<HTMLElement>('.ld-tab[data-tab="list"]').click();
      await settle(() => expect($$('#ldListBody tr').length).toBe(20));
      shown('list');
    }
  }, 20000);

  it('the province fills the districts; ล้าง empties the form', async () => {
    await create();
    await up();
    $('#ldFilterBtn').click();
    await settle(() => expect($<HTMLSelectElement>('#ldProvinceSel').options.length).toBe(7));
    expect($<HTMLSelectElement>('#ldDistrictSel').disabled).toBe(true);
    const prov = $<HTMLSelectElement>('#ldProvinceSel');
    prov.value = '1';
    prov.dispatchEvent(new Event('change'));
    await settle(() => expect($<HTMLSelectElement>('#ldDistrictSel').options.length).toBe(4));
    expect($<HTMLSelectElement>('#ldDistrictSel').disabled).toBe(false);
    $('#ldFilterClear').click();
    expect($<HTMLSelectElement>('#ldProvinceSel').selectedIndex).toBe(0);
    expect($<HTMLSelectElement>('#ldDistrictSel').disabled).toBe(true);
  });

  it('a language switch is a page reload in Java: a NEW page instance, not an edit of the old DOM', async () => {
    await create();
    await up();
    const first = fixture.debugElement.query(By.directive(OpportunitiesView)).componentInstance;
    lang.set('en');
    fixture.detectChanges();
    TestBed.tick?.();
    await settle(() => expect(fixture.debugElement.query(By.directive(OpportunitiesView)).componentInstance).not.toBe(first));
    await up();
  });

  describe('against the real backend (mock off): the live backend answers the addresses of the Java page from REST calls', () => {
    let http: HttpTestingController;
    /** what the page's live backend asked of the REST service, as `METHOD path-below-the-api` */
    let seen: string[];
    /** the bodies it posted to the service */
    let posted: { path: string; body: any }[];
    const sample = createMockLeads({ delayMs: 0 });
    const ask = async (bff: string): Promise<unknown> => (await sample.fetch(bff)).json();
    /** the REST service of the test: the shapes of triplesale-service (an envelope with `result`), made from the sample set of the mock */
    async function service(method: string, rel: string, body: unknown): Promise<{ status: number; body: unknown }> {
      const envelope = (result: unknown, status = 200) => ({ status, body: { status, message: 'success', result } });
      if (method === 'POST' && /^\/leads\/\d+\/contact-activities$/.test(rel)) {
        posted.push({ path: rel, body: JSON.parse(String(body)) });
        return envelope({ id: 1 }, 201);
      }
      if (method !== 'GET') return { status: 404, body: { status: 404, message: `no such route ${method} ${rel}` } };
      if (rel.startsWith('/prospects/options')) return { status: 200, body: { status: 200, result: { salesLines: [{ id: 'sl-1', code: 'A', name: 'สายงาน หนึ่ง' }] } } };
      if (rel.startsWith('/opportunities?')) return envelope(rel.includes('view=BOARD') ? { columns: [{ step: { id: 's-1', name: 'ขั้น 1' }, count: 0, cards: [] }] } : { items: [] });
      if (rel.startsWith('/master-data/movement-types/')) return { status: 200, body: await ask('/board/master/movement-types?type=LD') };
      if (rel.startsWith('/leads?')) return envelope(await ask('/board/leads' + rel.slice('/leads'.length)));
      const lists: Record<string, string> = { '/master-data/tags?key=': '/board/tags', '/master-data/sale-groups': '/board/sale-groups', '/master-data/provinces': '/board/provinces', '/master-data/employees': '/board/employees' };
      if (lists[rel]) return envelope(await ask(lists[rel]));
      if (rel.startsWith('/master-data/countries')) return envelope([{ code: 'THA', phoneCountryCode: '+66', phoneNumberFormat: 'XX XXX XXXX / X XXXX XXXX' }]);
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
    const started = async (): Promise<void> => {
      await create({ mock: false });
      http = TestBed.inject(HttpTestingController);
    };

    beforeEach(() => {
      seen = [];
      posted = [];
    });

    it('the first paint asks nothing of the old calls: no /leads, no master-data, nothing of the BFF; the board is empty', async () => {
      const fetchSpy = vi.spyOn(globalThis, 'fetch');
      await started();
      await settle(() => expect($('#ldBoardContent')).toBeTruthy());
      for (let i = 0; i < 3; i++) {
        await pump(() => true);
        await new Promise((r) => setTimeout(r, 40));
      }
      expect(fixture.nativeElement.querySelector('ts-live-missing')).toBeNull();
      // the gone calls are answered at once: the service is not asked for the board, the products, the tags, the sale groups
      expect(seen.some((u) => u.startsWith('GET /leads?') || u.startsWith('GET /master-data/movement-types') || u.startsWith('GET /master-data/tags') || u.startsWith('GET /master-data/sale-groups'))).toBe(false);
      expect(seen.every((u) => !u.includes('/board/'))).toBe(true);
      expect(fetchSpy).not.toHaveBeenCalled();
      expect($$('#ldBoardContent .ld-card')).toHaveLength(0);
    });

    it('switching the tab asks for that tab: the list = /opportunities?opportunityConfigId=&tab=ALL, the board = ...&view=BOARD&tab=ALL; the first sales line is the default', async () => {
      await started();
      await pump(() => $$('#ldBoardContent .ld-col').length === 1);
      expect(seen.filter((u) => u.startsWith('GET /opportunities?'))).toEqual(['GET /opportunities?opportunityConfigId=sl-1&view=BOARD&tab=ALL&closed=false']);
      $<HTMLElement>('.ld-tab[data-tab="list"]').click();
      await pump(() => seen.some((u) => u === 'GET /opportunities?opportunityConfigId=sl-1&tab=ALL&closed=false'));
      const before = seen.filter((u) => u.includes('view=BOARD')).length;
      $<HTMLElement>('.ld-tab[data-tab="board"]').click();
      await pump(() => seen.filter((u) => u.includes('view=BOARD')).length > before);
    });
  });


  it('a picture at an http(s) address loads from that address: there is no /docproxy of the BFF any more (the host answers env.docProxy with the address itself)', async () => {
    const real = createMockLeads({ delayMs: 0 });
    vi.spyOn(OpportunitiesView.prototype as unknown as { backend(): Promise<unknown> }, 'backend').mockImplementation(async () => ({
      initial: () => real.initial(),
      fetch: async (url: string, init?: RequestInit) => {
        const r = await real.fetch(url, init);
        if (!/board\/leads\?/.test(url)) return r;
        const body = await r.json();
        for (const col of body.kanban ?? []) for (const it of col.items) it.prospectAvatar = `http://files.test/p/${it.id}.png`;
        return new Response(JSON.stringify(body), { status: 200, headers: { 'Content-Type': 'application/json' } });
      },
    }));
    await create();
    await up();
    const card = $('#ldBoardContent .ld-card');
    expect(card.querySelector('.ld-card-av img')!.getAttribute('src')).toBe(`http://files.test/p/${card.dataset['id']}.png`);
    expect($$('#ldBoardContent img').every((i) => !(i.getAttribute('src') ?? '').includes('docproxy'))).toBe(true);
  });

  it('leaving the page removes everything it put outside its own DOM: window names, listeners, timers, the popover, the CSS variable', async () => {
    const add = vi.spyOn(document, 'addEventListener');
    const remove = vi.spyOn(document, 'removeEventListener');
    await create();
    await up();
    // the hover popover moves itself into the column; the drag ghost goes to <body>
    const wrap = $('#ldBoardContent .ld-team-avs-wrap');
    inline(wrap, 'onmouseenter', new MouseEvent('mouseenter'));
    expect($('#ldAccessPop').classList.contains('show')).toBe(true);
    expect($('#ldAccessPop').parentElement!.classList.contains('ld-col-body')).toBe(true);
    expect(typeof w['ldSelectLead']).toBe('function');
    expect(w['CAN_CONTACT_ACTIVITY_CREATE']).toBe(true);
    expect(w['LEAD_MY_EMPLOYEE_ID']).toBe('1001');
    expect(document.documentElement.style.getPropertyValue('--ld-drop-hint-text')).toBe("'label.lead.drag_drop_hint'");
    expect(add.mock.calls.length).toBeGreaterThan(0);

    fixture.destroy();
    expect(document.getElementById('ldAccessPop')).toBeNull();
    for (const n of ['ldSelectLead', 'ldCardToggle', 'ldShowAccessPop', 'ldOpenMoveStep', 'ldInitFilter', 'ldSaveFilterState', 'CAN_CONTACT_ACTIVITY_CREATE', 'LEAD_MY_EMPLOYEE_ID', 'LD_ASSIGNEES_MAP', '_ldMsCtx']) {
      expect(w[n], n).toBeUndefined();
    }
    expect(document.documentElement.style.getPropertyValue('--ld-drop-hint-text')).toBe('');
    // every listener the page put on the document is taken off again (same type, same capture flag)
    const key = (c: unknown[]) => `${String(c[0])}|${c[2] === true || (c[2] as { capture?: boolean } | undefined)?.capture === true}`;
    const count = (calls: unknown[][]) => calls.reduce<Record<string, number>>((m, c) => ((m[key(c)] = (m[key(c)] ?? 0) + 1), m), {});
    const added = count(add.mock.calls);
    const removed = count(remove.mock.calls);
    for (const k of Object.keys(added)) expect(removed[k] ?? 0, k).toBeGreaterThanOrEqual(added[k]);
  });

  it('leaving the page before the data arrived: the late answer paints nothing (it never settles)', async () => {
    await create();
    const board = $('#ldBoardContent');
    fixture.destroy();
    await new Promise((r) => setTimeout(r, 600));
    expect(board.querySelectorAll('.ld-card')).toHaveLength(0);
  });
});
