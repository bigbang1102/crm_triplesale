import { signal } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { By } from '@angular/platform-browser';
import { Router, provideRouter } from '@angular/router';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AuthService } from '@core/auth/auth.service';
import { SessionInfo } from '@core/auth/auth.models';
import { ConfigService } from '@core/config/config.service';
import { DomGuards } from '@core/dom/dom-guards';
import { createTsPhone } from '@core/dom/phone-format';
import { mockCountriesResponse } from '@core/http/mock-countries';
import { I18n } from '@core/i18n/i18n.service';
import { PermissionService } from '@core/permissions/permission.service';
import { configStub } from '@core/testing/test-helpers';
import { ProspectsBackend } from './prospects-backend';
import { Prospects } from './prospects';
import { ProspectsView } from './prospects-view';
import { createMockProspects, resetMockProspects } from './prospects.mock';

// the page talks to a mock with real timers and many steps per test: more than vitest's 5 s when the machine is busy
vi.setConfig({ testTimeout: 30000 });

/** the functions the engine publishes on window (the entry points of the inline handlers) */
const HANDLER_NAMES = [
  'ctSourceBadgeColors', 'ctAfterDocsLoaded', 'ctDeleteDoc', 'ctDeleteProspect', 'ctRestoreProspect', 'ctChangeStatus', 'ctOpenPanel', 'ctCtxToggle', 'ctShowLeadConfirm', 'ctHideLeadConfirm', 'ctConfirmLead',
  'ctShowLeadSuccess', 'ctHideLeadSuccess', 'ctGotoLeadPage', 'clSgRequired', 'clOnProductChange', 'clOnStepGroupChange', 'clOpenModal', 'clCloseModal',
  'clSubmit', 'ctPickFile', 'ctRenderPreview', 'ctDownloadDoc', 'ctOnFilePicked', 'rc_ctLoadDocs', 'rc_ctDeleteDoc', 'ctNavigate',
];

const lang = signal<'th' | 'en'>('th');
// a key stands for its text; the three HTTP-status texts are real words because the page treats a text that still starts with "label." as missing
const WORDS: Record<string, string> = { 'label.contracts.error_auth': 'AUTH', 'label.contracts.error_endpoint': 'ENDPOINT', 'label.contracts.error_server': 'SERVER' };
const t = (k: string) => WORDS[k] ?? k;
const session = signal<SessionInfo | null>({
  username: 'demo', profileName: 'Demo', employeeId: 1001, employeeCode: 'E001', branch: { id: 1, code: 'SUN', name: 'SUN' }, branchCode: 'SUN', roles: ['super_admin'],
});

describe('Prospects page (pages/contracts.xhtml, generated)', () => {
  let fixture: ComponentFixture<Prospects>;
  let el: HTMLElement;
  let backend: ProspectsBackend;
  let calls: Array<{ url: string; method: string; body?: string }>;
  let swalCalls: Array<Record<string, any>>;
  let swalAnswer: unknown;
  let allowed: boolean;
  /** codes of the button registry (PermissionService.canUse) the signed-in user may not use */
  let deniedCodes: Set<string>;
  let deniedRoles: Set<string>;
  let delayMs = 0;
  let navigateSpy: ReturnType<typeof vi.fn>;

  // the page first; the "create lead" modal (moved to <body>) and the popups are found in the whole document
  const $ = <T extends HTMLElement = HTMLElement>(sel: string) => (el.querySelector<T>(sel) ?? document.querySelector<T>(sel))!;
  const $$ = <T extends HTMLElement = HTMLElement>(sel: string) => {
    const inPage = [...el.querySelectorAll<T>(sel)];
    return inPage.length ? inPage : [...document.querySelectorAll<T>(sel)];
  };
  const text = (sel: string) => ($(sel)?.textContent ?? '').trim();
  const settle = (fn: () => void) => vi.waitFor(fn, { timeout: 5000, interval: 25 });
  const rows = () => $$('#ctTableBody tr[data-id]');
  /** the first page is drawn and enriched (no skeleton left) */
  const up = () => settle(() => {
    expect(rows().length).toBeGreaterThan(0);
    expect($$('#ctTableBody .ct-skel-row, #ctTableBody .ct-code .ct-skel-line')).toHaveLength(0);
  });
  const urls = (part: string) => calls.filter((c) => c.url.includes(part));
  const click = (target: Element | string) => (typeof target === 'string' ? $(target) : (target as HTMLElement)).click();
  const typeIn = (sel: string, v: string) => {
    const i = $<HTMLInputElement>(sel);
    i.value = v;
    i.dispatchEvent(new Event('input', { bubbles: true }));
  };
  const swalCount = () => swalCalls.length;

  async function create(opts: { mock?: boolean; code?: string } = {}): Promise<void> {
    TestBed.configureTestingModule({
      providers: [
        provideRouter([]),
        { provide: ConfigService, useValue: configStub({ mock: opts.mock ?? true }) },
        { provide: I18n, useValue: { lang, t, use: async (l: 'th' | 'en') => lang.set(l) } },
        { provide: AuthService, useValue: { session } },
        { provide: PermissionService, useValue: { has: (role: string) => allowed && !deniedRoles.has(role), canUse: (code: string) => allowed && !deniedCodes.has(code) } },
        { provide: DomGuards, useValue: { start: () => undefined, stop: () => undefined } },
      ],
    });
    navigateSpy = vi.spyOn(TestBed.inject(Router), 'navigateByUrl').mockResolvedValue(true);
    fixture = TestBed.createComponent(Prospects);
    document.body.appendChild(fixture.nativeElement);
    fixture.detectChanges();
    el = fixture.nativeElement as HTMLElement;
  }

  beforeEach(() => {
    resetMockProspects();
    lang.set('th');
    allowed = true;
    deniedCodes = new Set();
    deniedRoles = new Set();
    delayMs = 0;
    calls = [];
    swalCalls = [];
    swalAnswer = undefined;
    // what the shell's page scripts and the Java page's own scripts provide: TsPhone (real, with the fake country master), the suggestion list,
    // TsAttachTypes (a stand-in: the real file is compared against Java by the harness)
    const phone = createTsPhone({ apiBase: '', fetch: async () => mockCountriesResponse() });
    vi.stubGlobal('TsPhone', phone);
    vi.stubGlobal('odsProspectSuggest', vi.fn());
    vi.stubGlobal('TsAttachTypes', {
      check: (files: File[], _accept: string, msg: { notAllowed: string }) => {
        const bad = [...files].filter((f) => f.name.endsWith('.exe'));
        if (bad.length) void (window as any).swal({ title: msg.notAllowed, text: bad.map((f) => f.name).join('\n'), icon: 'warning' });
        return !bad.length;
      },
    });
    vi.stubGlobal('swal', (o: Record<string, any>) => (swalCalls.push(o), Promise.resolve(swalAnswer)));
    // the inline handlers of the markup (onclick="ctOpenPanel(this)") are compiled in jsdom's own global, while the engine publishes
    // its window.* names on the global of the test runner: let jsdom's window read them from there
    const jsdomWindow = (globalThis as unknown as { jsdom?: { window: object } }).jsdom?.window;
    if (jsdomWindow) {
      for (const name of HANDLER_NAMES) Object.defineProperty(jsdomWindow, name, { configurable: true, get: () => (globalThis as Record<string, unknown>)[name] });
    }
    // jsdom has no layout: every box is 0 high, so "the table does not fill the viewport yet" would load all the pages in a row.
    // The tall table below keeps the infinite scroll quiet until a test scrolls on purpose (it redefines the sizes of the wrap).
    Object.defineProperty(HTMLElement.prototype, 'scrollHeight', { configurable: true, get: () => 100000 });
    Object.defineProperty(HTMLElement.prototype, 'clientHeight', { configurable: true, get: () => 600 });
    const proto = ProspectsView.prototype as unknown as { backend(): Promise<ProspectsBackend>; swal(o: Record<string, unknown>): Promise<unknown>; loadHelpers(): Promise<unknown> };
    vi.spyOn(proto, 'backend').mockImplementation(async () => {
      backend = createMockProspects({ delayMs });
      return {
        initial: () => backend.initial(),
        fetch: (input, init) => (calls.push({ url: input, method: (init?.method ?? 'GET').toUpperCase(), body: init?.body as string | undefined }), backend.fetch(input, init)),
      };
    });
    vi.spyOn(proto, 'swal').mockImplementation((o) => (swalCalls.push(o), Promise.resolve(swalAnswer)));
    vi.spyOn(proto, 'loadHelpers').mockResolvedValue(undefined);
  });
  afterEach(() => {
    const jsdomWindow = (globalThis as unknown as { jsdom?: { window: object } }).jsdom?.window;
    if (jsdomWindow) for (const name of HANDLER_NAMES) delete (jsdomWindow as Record<string, unknown>)[name];
    delete (HTMLElement.prototype as unknown as Record<string, unknown>)['scrollHeight'];
    delete (HTMLElement.prototype as unknown as Record<string, unknown>)['clientHeight'];
    fixture?.destroy();
    TestBed.resetTestingModule();
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
    document.querySelectorAll('#ctCreateLeadModal').forEach((n) => n.remove());
  });

  it('is the markup of the Java page and draws the first page: 20 rows, the customer code arrives with the enrichment', async () => {
    await create();
    await up();
    expect(rows()).toHaveLength(20);
    expect(text('.ct-page-title')).toBe('label.contracts.title (180)');
    expect($$('#ctStatusChips .ct-chip')).toHaveLength(5);
    expect($$('.ct-table thead th')[2].textContent).toContain('app.prospects.activeStatus');
    expect($$('.ct-table thead th')).toHaveLength(9);
    // list first, then ONE enrich request for the whole page
    expect(urls('prospect-list')[0].url).toBe('/board/prospect-list?page=1&perPage=20&sortBy=date_desc');
    expect(urls('prospect-enrich')).toHaveLength(1);
    expect(decodeURIComponent(urls('prospect-enrich')[0].url.split('ids=')[1]).split(',')).toHaveLength(20);
    expect(rows().every((r) => /^P\d{5}$/.test(r.querySelector('.ct-code')!.textContent!))).toBe(true);
    expect(rows().every((r) => r.hasAttribute('data-enriched'))).toBe(true);
    // the source badge got its colour, the phone is formatted with the dial code
    const badge = $<HTMLElement>('.ct-source-badge');
    expect(badge.style.color).toMatch(/^#|rgb/);
    await settle(() => expect($$('.ts-tel').some((s) => /^\+66 \d\d-\d{3}-\d{4}$/.test(s.textContent!))).toBe(true));
  });

  it('a row shows the short address: the country of a foreign one, province and district of a Thai one', async () => {
    await create();
    await up();
    await settle(() => expect(rows().every((r) => r.querySelector('.ct-addr')!.textContent !== '')).toBe(true));
    const cell = (id: number) => $(`#ctTableBody tr[data-id="${id}"] .ct-addr`);
    // P00009 lives abroad; P00001 in Thailand
    const foreign = await (async () => {
      typeIn('#ldSearchInput', 'P00009');
      click('#ldSearchGo');
      await settle(() => expect(rows()).toHaveLength(1));
      await up();
      return text('#ctTableBody .ct-addr');
    })();
    expect(foreign).toMatch(/[ก-๙]/); // the country in Thai
    expect(foreign).not.toContain(',');
    expect(cell(9).title).toContain('Tokyo'.slice(0, 0)); // (the full address is the title)
    expect(cell(9).title.length).toBeGreaterThan(foreign.length - 1);
  });

  it('a click on a row opens the detail panel with what the row knows; a second row replaces it; the cross closes it', async () => {
    await create();
    await up();
    rows()[2].click();
    expect($('#ctRightPanel').classList.contains('open')).toBe(true);
    expect(rows()[2].classList.contains('ct-row-active')).toBe(true);
    expect(text('#ctDName')).toBe(rows()[2].dataset['name']);
    expect(text('#ctDCode')).toBe(rows()[2].dataset['code']);
    expect(text('#ctDEmail')).toMatch(/@example\.com$/);
    expect($('#ctDetailPhoto').getAttribute('src')).toMatch(/default_avatar\.svg$|^data:image/);
    rows()[4].click();
    expect(rows()[2].classList.contains('ct-row-active')).toBe(false);
    expect(text('#ctDName')).toBe(rows()[4].dataset['name']);
    click('#ctPanelClose');
    expect($('#ctRightPanel').classList.contains('open')).toBe(false);
    expect($$('.ct-row-active')).toHaveLength(0);
  });

  it('sort: the label follows, the list is asked again from page 1 with the new key', async () => {
    await create();
    await up();
    click('#ctSortBtn');
    expect($('#ctSortMenu').style.display).toBe('block');
    click('#ctSortMenu .ct-sort-item[data-sort="name_asc"]');
    expect(text('#ctSortLabel')).toBe('label.contracts.sort_name_asc');
    expect($('#ctSortMenu').style.display).toBe('none');
    await settle(() => expect(urls('prospect-list').some((c) => c.url.includes('sortBy=name_asc') && c.url.includes('page=1'))).toBe(true));
    await up();
    const names = rows().map((r) => r.dataset['name']!);
    expect([...names].sort((a, b) => a.localeCompare(b, 'th'))).toEqual(names);
  });

  it('search asks the server (searchText); nothing found shows the empty line; Escape / the cross reset the search', async () => {
    await create();
    await up();
    click('#ldSearch .ld-search-ic');
    expect($('#ldSearch').classList.contains('open')).toBe(true);
    typeIn('#ldSearchInput', 'zzzz');
    click('#ldSearchGo');
    await settle(() => expect(text('#ctTableBody .ct-status-row')).toBe('label.contracts.empty_customer'));
    expect(urls('prospect-list').at(-1)!.url).toContain('searchText=zzzz');
    $('#ldSearchInput').dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    expect($('#ldSearch').classList.contains('open')).toBe(false);
    expect($<HTMLInputElement>('#ldSearchInput').value).toBe('');
    await up();
    expect(rows().length).toBe(20);
    // Enter does the same as the button
    click('#ldSearch .ld-search-ic');
    typeIn('#ldSearchInput', 'P00019');
    $('#ldSearchInput').dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
    await settle(() => expect(rows()).toHaveLength(1));
  });

  it('the suggestion list under the search box is the shell\'s odsProspectSuggest, fed with this page\'s backend and avatar', async () => {
    await create();
    await up();
    const ods = (window as unknown as { odsProspectSuggest: ReturnType<typeof vi.fn> }).odsProspectSuggest;
    expect(ods).toHaveBeenCalledTimes(1);
    const [input, opts] = ods.mock.calls[0];
    expect((input as HTMLElement).id).toBe('ldSearchInput');
    expect(opts.apiUrl).toBe('/board/prospect-list');
    expect(opts.contextPath).toBe('');
    expect(opts.defaultAvatar).toBe('assets/images/icon/default_avatar.svg');
    expect(await (await opts.fetch('/board/prospect-list?page=1&perPage=8&enrich=1&searchText=P0000')).json()).toMatchObject({ status: 200 });
  });

  it('list failures are told apart: HTTP 500 of the servlet, the status of the service, an empty list, a list without paging meta', async () => {
    await create();
    await up();
    const search = async (q: string) => {
      click('#ldSearch .ld-search-ic');
      typeIn('#ldSearchInput', q);
      click('#ldSearchGo');
      await settle(() => expect($$('#ctTableBody .ct-skel-row')).toHaveLength(0));
    };
    await search('X-ERR-500');
    await settle(() => expect(text('#ctTableBody .ct-status-row')).toBe('SERVER (HTTP 500)'));
    await search('X-ERR-403');
    await settle(() => expect(text('#ctTableBody .ct-status-row')).toBe('AUTH (HTTP 403)'));
    await search('X-ERR-404');
    await settle(() => expect(text('#ctTableBody .ct-status-row')).toBe('ENDPOINT (HTTP 404)'));
    await search('X-ERR-502');
    await settle(() => expect(text('#ctTableBody .ct-status-row')).toBe('SERVER (HTTP 502)'));
    await search('X-ERR-0');
    await settle(() => expect(text('#ctTableBody .ct-status-row')).toBe('label.dashboard.backend_error'));
    await search('X-EMPTY');
    await settle(() => expect(text('#ctTableBody .ct-status-row')).toBe('label.contracts.empty_customer'));
    // 25 rows and no meta: the second page has 5, the page after that is never asked for
    await search('X-NOMETA');
    await up();
    const wrap = $('.ct-table-wrap');
    Object.defineProperty(wrap, 'scrollHeight', { configurable: true, value: 5000 });
    Object.defineProperty(wrap, 'clientHeight', { configurable: true, value: 600 });
    wrap.scrollTop = 4500;
    wrap.dispatchEvent(new Event('scroll'));
    await settle(() => expect(rows()).toHaveLength(25));
    wrap.dispatchEvent(new Event('scroll'));
    await new Promise((r) => setTimeout(r, 100));
    expect(urls('searchText=X-NOMETA').filter((c) => c.url.includes('page=3'))).toHaveLength(0);
  });

  it('a row whose enrichment fails loses its skeleton and keeps going (the code stays empty)', async () => {
    await create();
    await up();
    click('#ldSearch .ld-search-ic');
    typeIn('#ldSearchInput', 'X-ENRICH-FAIL');
    click('#ldSearchGo');
    await settle(() => expect(rows()).toHaveLength(3));
    await settle(() => expect($$('#ctTableBody .ct-code .ct-skel-line')).toHaveLength(0));
    expect(rows().map((r) => r.querySelector('.ct-code')!.textContent)).toEqual(['', '', '']);
    expect(rows().some((r) => r.hasAttribute('data-enriched'))).toBe(false);
  });

  it('infinite scroll: near the end of the table the next page is asked for and appended after skeleton rows', async () => {
    delayMs = 40;
    await create();
    await up();
    const wrap = $('.ct-table-wrap');
    Object.defineProperty(wrap, 'scrollHeight', { configurable: true, value: 3000 });
    Object.defineProperty(wrap, 'clientHeight', { configurable: true, value: 600 });
    wrap.scrollTop = 2200;
    wrap.dispatchEvent(new Event('scroll'));
    await settle(() => expect($$('#ctTableBody .ct-skel-row').length).toBe(3));
    await settle(() => expect(rows()).toHaveLength(40));
    expect(urls('prospect-list').map((c) => c.url.match(/page=(\d+)/)![1])).toEqual(['1', '2']);
    // a repeated row (same id|code|name) is not added twice
    const ids = rows().map((r) => r.dataset['id']);
    expect(new Set(ids).size).toBe(40);
  });

  describe('the filter dialog', () => {
    it('loads its options in the background when the page opens — once, opening the popup asks nothing more — and the districts follow the province', async () => {
      await create();
      await up();
      await settle(() => expect(urls('chat-master-data')).toHaveLength(1));
      click('#ctFilterBtn');
      expect($('#ctFilterOverlay').classList.contains('show')).toBe(true);
      // "all" + the 12 sources
      await settle(() => expect($$('#ctFilterOverlay .ct-filter-tag')).toHaveLength(13));
      // the marketing channels (master data) — the countries, provinces and people come from the prospect options
      expect(urls('chat-master-data')).toHaveLength(1);
      expect(urls('set=countries')).toHaveLength(1);
      expect(urls('set=provinces')).toHaveLength(1);
      expect(urls('set=responsibleFilter')).toHaveLength(1);
      expect(urls('/board/sale-persons')).toHaveLength(0);
      // more than 10 sources: the search box above the chips shows
      expect($('#ctFilterTagSearch').style.display).toBe('');
      click('#ctFilterOverlay .ct-filter-title');
      expect($('#ctFilterOverlay').classList.contains('show')).toBe(true);
      $('#ctFilterOverlay').dispatchEvent(new MouseEvent('click', { bubbles: true }));
      expect($('#ctFilterOverlay').classList.contains('show')).toBe(false);
      click('#ctFilterBtn');
      expect(urls('chat-master-data')).toHaveLength(1);
      await settle(() => expect($<HTMLSelectElement>('#ctFilterCountry').options.length).toBeGreaterThan(1));
      // the country row sits right above the province row
      expect($('#ctFilterCountry').closest('.ct-filter-row')!.nextElementSibling!.querySelector('#ctFilterProvince')).not.toBeNull();

      const province = $<HTMLSelectElement>('#ctFilterProvince');
      province.value = province.options[1].value;
      province.dispatchEvent(new Event('change', { bubbles: true }));
      await settle(() => expect($<HTMLSelectElement>('#ctFilterDistrict').options.length).toBeGreaterThan(1));
      expect(urls('set=districts')[0].url).toBe(`/board/prospect-options?set=districts&provinceId=${province.value}`);
    });

    it('the district select is disabled until a province is chosen, is enabled when its districts are there, and is disabled again when the form is cleared', async () => {
      await create();
      await up();
      click('#ctFilterBtn');
      const district = $<HTMLSelectElement>('#ctFilterDistrict');
      const province = $<HTMLSelectElement>('#ctFilterProvince');
      await settle(() => expect(province.options.length).toBeGreaterThan(1));
      expect(district.disabled).toBe(true);
      province.value = province.options[1].value;
      province.dispatchEvent(new Event('change', { bubbles: true }));
      await settle(() => expect(district.options.length).toBeGreaterThan(1));
      expect(district.disabled).toBe(false);
      // the province is put back to "all": no districts to choose from, disabled again
      province.value = '';
      province.dispatchEvent(new Event('change', { bubbles: true }));
      expect(district.disabled).toBe(true);
      expect(district.options).toHaveLength(1);
      province.value = province.options[1].value;
      province.dispatchEvent(new Event('change', { bubbles: true }));
      await settle(() => expect(district.disabled).toBe(false));
      click('#ctFilterClear');
      expect(district.disabled).toBe(true);
    });

    it('the search box narrows the chips; fewer than 11 sources: no search box', async () => {
      await create();
      await up();
      click('#ctFilterBtn');
      await settle(() => expect($$('#ctFilterOverlay .ct-filter-tag').length).toBeGreaterThan(0));
      typeIn('#ctFilterTagSearch', 'face');
      // the "all" chip is not a source: the search leaves it alone
      expect($$('#ctFilterOverlay .ct-filter-tag:not(.ct-filter-tag-all)').filter((c) => c.style.display !== 'none').map((c) => c.textContent)).toEqual(['Facebook']);
    });

    it('the filter popup has no date range: the date of saving is not a filter of the popup, and the list asks for no fromDate / toDate', async () => {
      await create();
      await up();
      click('#ctFilterBtn');
      expect(document.querySelector('#ctFilterFrom, #ctFilterTo, #ctFilterOverlay input[type="date"]')).toBeNull();
      click('#ctFilterApply');
      await settle(() => expect(urls('prospect-list').length).toBeGreaterThan(1));
      expect(urls('prospect-list').some((c) => c.url.includes('fromDate') || c.url.includes('toDate'))).toBe(false);
    });

    it('the panel changes the responsible person through POST /board/prospect-assign (live: /prospects/{id}/assignments); the row shows the new person after it', async () => {
      await create();
      await up();
      const row = rows()[0];
      row.click();
      click('#ctChangeOwnerBtn'); // edit mode: the select lists the people (value = id, label = name)
      await settle(() => expect($<HTMLSelectElement>('#ctDOwnerSelect').options.length).toBeGreaterThan(1));
      const sel = $<HTMLSelectElement>('#ctDOwnerSelect');
      const other = Array.from(sel.options).find((o) => o.value !== sel.value && o.value && !o.value.startsWith('wl:'))!;
      sel.value = other.value;
      click('#ctChangeOwnerBtn'); // save
      await settle(() => expect(urls('prospect-assign')).toHaveLength(1));
      expect(urls('prospect-assign')[0].method).toBe('POST');
      await settle(() => expect(row.getAttribute('data-owner')).toBe(other.textContent!.trim()));
      expect(row.getAttribute('data-ownerid')).toBe(other.value);
      expect($('#ctDOwnerView').textContent!.trim()).toBe(other.textContent!.trim());
      // the same person again: nothing is asked
      click('#ctChangeOwnerBtn');
      click('#ctChangeOwnerBtn');
      expect(urls('prospect-assign')).toHaveLength(1);
    });

    it('the owner select of the panel lists the responsible people AND the queues (GET /prospects/options?sets=responsibles,waitlists, kept); a queue chosen posts destination WAITLIST and the list is read again', async () => {
      const bodies: Array<Record<string, unknown>> = [];
      const proto = ProspectsView.prototype as unknown as { backend(): Promise<ProspectsBackend> };
      vi.spyOn(proto, 'backend').mockImplementation(async () => {
        backend = createMockProspects({ delayMs });
        return {
          initial: () => backend.initial(),
          fetch: (input, init) => {
            calls.push({ url: input, method: (init?.method ?? 'GET').toUpperCase() });
            if (input.includes('/board/prospect-assign')) bodies.push(JSON.parse(String(init?.body ?? '{}')) as Record<string, unknown>);
            return backend.fetch(input, init);
          },
        };
      });
      await create({ mock: false });
      await up();
      rows()[0].click();
      click('#ctChangeOwnerBtn');
      await settle(() => expect(urls('/board/prospect-options?sets=responsibles,waitlists')).toHaveLength(1));
      const sel = $<HTMLSelectElement>('#ctDOwnerSelect');
      await settle(() => expect([...sel.options].some((o) => o.value.startsWith('wl:'))).toBe(true));
      const values = [...sel.options].filter((o) => o.value).map((o) => o.value);
      expect(values.some((v) => v.startsWith('r-'))).toBe(true);
      expect(values.filter((v) => v.startsWith('wl:'))).toEqual(['wl:w-1', 'wl:w-2']);
      expect([...sel.options].find((o) => o.value === 'wl:w-1')!.textContent).toBe('คิวทดสอบในเครื่อง');
      expect([...sel.options].find((o) => o.value === 'wl:w-2')!.textContent).toBe('w-2'); // a queue with no name shows its id
      // the person now responsible is in the list and chosen (here the mock row has a name and no id: found by its name)
      expect(sel.selectedOptions[0].textContent).toBe(rows()[0].getAttribute('data-owner'));
      const lists = urls('prospect-list').length;
      sel.value = 'wl:w-1';
      click('#ctChangeOwnerBtn');
      await settle(() => expect(bodies).toHaveLength(1));
      expect(bodies[0]).toMatchObject({ destination: 'WAITLIST', waitlistId: 'w-1' });
      expect(bodies[0]).not.toHaveProperty('responsibleEmployeeId');
      await settle(() => expect(urls('prospect-list').length).toBeGreaterThan(lists));
    });

    it('a status chip asks the list with that status (the page sends status=, the live backend turns it into usageStatus)', async () => {
      await create();
      await up();
      click('#ctStatusChips .ct-chip[data-status="draft"]');
      await settle(() => expect(urls('prospect-list').at(-1)!.url).toContain('status=draft'));
    });

    it('the deleted tab (the trash): the code and the open button of the panel lead to the detail page with trash=1; no 3-dots menu; the other tabs have no trash=1 and keep the menu', async () => {
      await create();
      await up();
      expect($$('#ctTableBody .ct-menu-btn').length).toBeGreaterThan(0);
      expect($$('#ctTableBody .ct-code-link').every((a) => !a.getAttribute('onclick')!.includes('trash=1'))).toBe(true);
      click('#ctStatusChips .ct-chip[data-status="deleted"]');
      await settle(() => expect(urls('prospect-list').at(-1)!.url).toContain('status=deleted'));
      await up();
      expect($$('#ctTableBody .ct-code-link').length).toBeGreaterThan(0);
      expect($$('#ctTableBody .ct-code-link').every((a) => a.getAttribute('onclick')!.includes('&trash=1'))).toBe(true);
      // the 3 dots are there with "view" (to the detail page of the trash, trash=1) and "restore" (edit / waitlist / status / delete are for a live record)
      expect($$('#ctTableBody .ct-menu-btn').length).toBeGreaterThan(0);
      expect($$('#ctTableBody .ct-ctx-item').length).toBe(rows().length * 2);
      const first = rows()[0].querySelectorAll<HTMLElement>('.ct-ctx-item');
      expect(first[0].getAttribute('onclick')).toContain('contracts_master_data.face');
      expect(first[0].getAttribute('onclick')).toContain('&trash=1');
      expect(first[1].id.startsWith('ctCtxRestore-')).toBe(true);
      const id = rows()[0].dataset['id']!;
      rows()[0].click();
      $<HTMLElement>('#ctOpenFull').click();
      const url = String(navigateSpy.mock.calls.at(-1)![0]);
      expect(url).toContain(`/crm/prospects/${id}/detail`);
      expect(url).toContain('trash=1');
      click('#ctStatusChips .ct-chip[data-status=""]');
      await settle(() => expect(urls('prospect-list').at(-1)!.url).not.toContain('status=deleted'));
      await up();
      expect($$('#ctTableBody .ct-code-link').every((a) => !a.getAttribute('onclick')!.includes('trash=1'))).toBe(true);
      expect($$('#ctTableBody .ct-menu-btn').length).toBeGreaterThan(0);
    });

    describe('the trash menu follows the roles: "view" needs Pipeline_Prospect_View, "restore" needs Pipeline_Prospect_Trash', () => {
      const trashItems = async (denied: string[]) => {
        deniedRoles = new Set(denied);
        await create();
        await up();
        click('#ctStatusChips .ct-chip[data-status="deleted"]');
        await settle(() => expect(urls('prospect-list').at(-1)!.url).toContain('status=deleted'));
        await up();
        return {
          dots: $$('#ctTableBody .ct-menu-btn').length,
          items: [...rows()[0].querySelectorAll<HTMLElement>('.ct-ctx-item')].map((i) => (i.id.startsWith('ctCtxRestore-') ? 'restore' : 'view')),
        };
      };
      it('both roles: view and restore', async () => {
        expect((await trashItems([])).items).toEqual(['view', 'restore']);
      });
      it('without the right to restore: view only', async () => {
        expect((await trashItems(['Pipeline_Prospect_Trash'])).items).toEqual(['view']);
      });
      it('without the right to view: restore only', async () => {
        expect((await trashItems(['Pipeline_Prospect_View'])).items).toEqual(['restore']);
      });
      it('with neither: no 3 dots', async () => {
        expect((await trashItems(['Pipeline_Prospect_View', 'Pipeline_Prospect_Trash'])).dots).toBe(0);
      });
    });

    it('"restore" of the deleted tab asks first (swal); confirmed: POST /board/prospect-trash-action and the row leaves the trash list; cancelled: nothing is posted', async () => {
      await create();
      await up();
      click('#ctStatusChips .ct-chip[data-status="deleted"]');
      await settle(() => expect(urls('prospect-list').at(-1)!.url).toContain('status=deleted'));
      await up();
      const before = rows().length;
      const id = rows()[0].dataset['id']!;
      // cancelled
      swalAnswer = null;
      $<HTMLElement>(`#ctCtxRestore-${id}`).click();
      await settle(() => expect(swalCalls).toHaveLength(1));
      expect(swalCalls[0]).toMatchObject({ title: 'app.prospects.confirmRestore', icon: 'warning' });
      expect(swalCalls[0]['buttons']).toEqual(['chat.cancel', 'app.prospects.restore']);
      expect(urls('prospect-trash-action')).toHaveLength(0);
      expect(rows()).toHaveLength(before);
      // confirmed
      swalAnswer = true;
      $<HTMLElement>(`#ctCtxRestore-${id}`).click();
      await settle(() => expect(urls('prospect-trash-action')).toHaveLength(1));
      expect(urls('prospect-trash-action')[0].method).toBe('POST');
      await settle(() => expect(rows()).toHaveLength(before - 1));
      expect(rows().some((r) => r.dataset['id'] === id)).toBe(false);
      expect(swalCalls.at(-1)).toMatchObject({ title: 'app.prospects.restored', icon: 'success' });
    });

    it('the source chips: "all" is first and selected; it excludes the others both ways; un-choosing the last one brings it back; with it "apply" sends no source', async () => {
      await create();
      await up();
      click('#ctFilterBtn');
      await settle(() => expect($$('#ctFilterOverlay .ct-filter-tag').length).toBeGreaterThan(1));
      const all = $('#ctFilterOverlay .ct-filter-tag-all');
      expect($$('#ctFilterOverlay .ct-filter-tag')[0]).toBe(all);
      expect(all.classList.contains('selected')).toBe(true);
      const [a, b] = $$('#ctFilterOverlay .ct-filter-tag:not(.ct-filter-tag-all)');
      a.click();
      b.click();
      expect($$('#ctFilterOverlay .ct-filter-tag.selected')).toEqual([a, b]);
      all.click();
      expect($$('#ctFilterOverlay .ct-filter-tag.selected')).toEqual([all]);
      a.click();
      a.click(); // the last one chosen is un-chosen: "all" again
      expect($$('#ctFilterOverlay .ct-filter-tag.selected')).toEqual([all]);
      click('#ctFilterApply');
      await settle(() => expect(urls('prospect-list').length).toBeGreaterThan(0));
      expect(urls('prospect-list').at(-1)!.url).not.toContain('marketingChannelIds');
    });

    it('"apply" asks for page 1 with the ids; "clear" resets the form and asks again without them', async () => {
      await create();
      await up();
      click('#ctFilterBtn');
      await settle(() => expect($$('#ctFilterOverlay .ct-filter-tag').length).toBeGreaterThan(0));
      const all = $('#ctFilterOverlay .ct-filter-tag-all');
      expect(all.classList.contains('selected')).toBe(true); // the default
      const tags = $$('#ctFilterOverlay .ct-filter-tag:not(.ct-filter-tag-all)');
      tags[0].click();
      tags[1].click();
      expect(tags[0].classList.contains('selected')).toBe(true);
      expect(all.classList.contains('selected')).toBe(false);
      const agent = $<HTMLSelectElement>('#ctFilterAgent');
      agent.value = agent.options[2].value;
      await settle(() => expect($<HTMLSelectElement>('#ctFilterCountry').options.length).toBeGreaterThan(1));
      const country = $<HTMLSelectElement>('#ctFilterCountry');
      country.value = country.options[1].value;
      click('#ctFilterApply');
      expect($('#ctFilterOverlay').classList.contains('show')).toBe(false);
      await settle(() => expect(urls('prospect-list').at(-1)!.url).toContain(`marketingChannelIds=${tags[0].dataset['val']}%2C${tags[1].dataset['val']}`));
      expect(urls('prospect-list').at(-1)!.url).toContain(`salePersonId=${agent.value}`);
      expect(urls('prospect-list').at(-1)!.url).toContain(`currentCountryId=${country.value}`);
      await up();
      expect(rows().every((r) => [tags[0].textContent, tags[1].textContent].includes(r.dataset['source']!))).toBe(true);
      click('#ctFilterBtn');
      click('#ctFilterClear');
      expect($$('#ctFilterOverlay .ct-filter-tag.selected')).toEqual([all]); // back to "all"
      expect(agent.selectedIndex).toBe(0);
      await settle(() => expect(urls('prospect-list').at(-1)!.url).not.toContain('marketingChannelIds'));
      await up();
      expect(rows()).toHaveLength(20);
    });
  });

  describe('the context menu of a row and the links to other pages', () => {
    it('the three dots open a menu; edit and view go to the prospect form (Java address → route); a click outside closes it', async () => {
      await create();
      await up();
      const id = rows()[1].dataset['id'];
      rows()[1].querySelector<HTMLElement>('.ct-menu-btn')!.click();
      const menu = rows()[1].querySelector<HTMLElement>('.ct-ctx-menu')!;
      expect(menu.classList.contains('show')).toBe(true);
      expect($('#ctRightPanel').classList.contains('open')).toBe(false);
      document.dispatchEvent(new MouseEvent('click', { bubbles: true }));
      expect(menu.classList.contains('show')).toBe(false);
      rows()[1].querySelector<HTMLElement>('.ct-menu-btn')!.click();
      menu.querySelectorAll<HTMLElement>('.ct-ctx-item')[0].click();
      expect(navigateSpy).toHaveBeenLastCalledWith(`/crm/prospects/${id}?action_type=edit&pms=detail`);
      expect([...menu.querySelectorAll('.ct-ctx-item')].map((i) => i.textContent)).toEqual([
        'label.ld2.edit', 'label.contracts.view_detail_tip', 'app.prospects.waitlist', 'app.prospects.suspend', 'label.cmd.delete_tip',
      ]);
      expect(menu.querySelector('.ct-ctx-trash')).not.toBeNull();
      menu.querySelectorAll<HTMLElement>('.ct-ctx-item')[1].click();
      expect(navigateSpy).toHaveBeenLastCalledWith(`/crm/prospects/${id}/detail?pms=detail`);
    });

    it('the "add" button is a link to the new-prospect form that the router follows; without CRM_Prospect_Create it is not there', async () => {
      await create();
      await up();
      const add = $<HTMLAnchorElement>('.ct-add-btn');
      expect(add.getAttribute('href')).toBe('/crm/prospects/new?action_type=add');
      add.click();
      expect(navigateSpy).toHaveBeenLastCalledWith('/crm/prospects/new?action_type=add');
      fixture.destroy();
      TestBed.resetTestingModule();
      allowed = false;
      await create();
      await up();
      expect(el.querySelector('.ct-add-btn')).toBeNull();
    });

    it('the buttons of the top bar, of the filter popup and of the side panel hang under PL-PR-LS-01 … 05, 07 … 10 (and the save button of the create-lead popup under PL-OP-NW-01, the "ไปโอกาสขาย" of its success window under PL-OP-NW-02): a code the user may not use takes away its button, and only that one', async () => {
      const BUTTONS: Record<string, string> = {
        'PL-PR-LS-01': '#ldSearch .ld-search-ic',
        'PL-PR-LS-02': '#ldSearchGo',
        'PL-PR-LS-03': '#ldSearchClear',
        'PL-PR-LS-04': '#ctFilterBtn',
        'PL-PR-LS-05': '.ct-add-btn',
        'PL-PR-LS-07': '#ctFilterClear',
        'PL-PR-LS-08': '#ctFilterApply',
        'PL-PR-LS-09': '#ctRightPanel .ct-lead-btn',
        'PL-PR-LS-10': '#ctRightPanel #ctUploadBtn',
        'PL-OP-NW-01': '#ctCreateLeadModal #clSubmitBtn', // the save button of the create-lead popup (an opportunity code)
        'PL-OP-NW-02': '#ctLeadSuccessOverlay .ct-confirm-ok', // "ไปโอกาสขาย" of the window that tells the opportunity was created
      };
      await create();
      await up();
      for (const [code, sel] of Object.entries(BUTTONS)) expect(el.querySelector(sel), code).not.toBeNull();
      for (const denied of Object.keys(BUTTONS)) {
        fixture.destroy();
        TestBed.resetTestingModule();
        deniedCodes = new Set([denied]);
        await create();
        await up();
        for (const [code, sel] of Object.entries(BUTTONS)) expect(!!el.querySelector(sel), `${code} with ${denied} denied`).toBe(code !== denied);
      }
    });

    it('the "3 dots" of every row is drawn when the user holds any role of its items (Edit · View · Change_Assign · Trash); with none of them the rows have no menu, but a click on the row still opens the panel', async () => {
      await create();
      await up();
      expect($$('#ctTableBody tr[data-id] .ct-menu-btn')).toHaveLength(rows().length);
      expect($$('#ctTableBody tr[data-id] .ct-ctx-menu')).toHaveLength(rows().length);
      fixture.destroy();
      TestBed.resetTestingModule();
      deniedRoles = new Set(['Pipeline_Prospect_Edit', 'Pipeline_Prospect_View', 'Pipeline_Prospect_Change_Assign', 'Pipeline_Prospect_Trash']);
      await create();
      await up();
      expect(rows().length).toBeGreaterThan(0);
      expect(el.querySelectorAll('#ctTableBody .ct-menu-btn')).toHaveLength(0);
      expect(el.querySelectorAll('#ctTableBody .ct-ctx-menu')).toHaveLength(0);
      expect(el.querySelectorAll('#ctTableBody .ct-ctx-wrap')).toHaveLength(rows().length); // the cell stays, so the columns line up
      rows()[0].click();
      expect($('#ctRightPanel').classList.contains('open')).toBe(true);
    });
  });

  describe('the documents tab', () => {
    const openFor = async (code: string) => {
      click('#ldSearch .ld-search-ic');
      typeIn('#ldSearchInput', code);
      click('#ldSearchGo');
      await settle(() => expect(rows()).toHaveLength(1));
      await up();
      rows()[0].click();
    };

    it('the download button and the trash icon of a document row hang under PL-PR-LS-11 and PL-PR-LS-12: a code the user may not use takes away its button from every row, and only that one', async () => {
      const open = async () => {
        await create();
        await up();
        await openFor('P00007');
        click('.ct-tab[data-tab="docs"]');
        await settle(() => expect($$('#ctTabDocs .ct-doc-row')).toHaveLength(5));
      };
      await open();
      expect(el.querySelectorAll('#ctTabDocs .ct-dl-btn')).toHaveLength(5);
      expect(el.querySelectorAll('#ctTabDocs .ct-doc-del')).toHaveLength(5);
      for (const [denied, gone, kept] of [
        ['PL-PR-LS-11', '.ct-dl-btn', '.ct-doc-del'],
        ['PL-PR-LS-12', '.ct-doc-del', '.ct-dl-btn'],
      ]) {
        fixture.destroy();
        TestBed.resetTestingModule();
        deniedCodes = new Set([denied]);
        await open();
        expect(el.querySelectorAll(`#ctTabDocs ${gone}`), `${denied} denied: ${gone}`).toHaveLength(0);
        expect(el.querySelectorAll(`#ctTabDocs ${kept}`), `${denied} denied: ${kept}`).toHaveLength(5);
      }
    });

    it('"ลบ" of the row menu asks first, with the same swal as the delete of a document', async () => {
      await create();
      await up();
      swalAnswer = null;
      $<HTMLElement>('#ctTableBody .ct-ctx-trash').click();
      await settle(() => expect(swalCalls).toHaveLength(1));
      expect(swalCalls[0]).toMatchObject({ title: 'app.prospects.confirmDelete', icon: 'warning', dangerMode: true });
      expect(swalCalls[0]['buttons']).toEqual(['chat.cancel', 'label.cmd.delete_tip']);
    });

    it('the menu of the 3 dots of a row has "ลบ" only with Pipeline_Prospect_Trash', async () => {
      await create();
      await up();
      const items = () => $$('#ctTableBody .ct-ctx-menu').map((m) => [...m.querySelectorAll('.ct-ctx-item')].map((i) => i.textContent));
      expect(items().length).toBeGreaterThan(0);
      expect(items().every((l) => l.length === 5 && l[4] === 'label.cmd.delete_tip')).toBe(true);
      fixture.destroy();
      TestBed.resetTestingModule();
      deniedRoles = new Set(['Pipeline_Prospect_Trash']);
      await create();
      await up();
      expect(items().length).toBeGreaterThan(0);
      expect(items().every((l) => l.length === 4)).toBe(true);
    });

    it('the tab "เอกสารประกอบ" is shown for Pipeline_Prospect_Attachment_View only: without the role the panel has only the tab "รายละเอียด", which stays active', async () => {
      await create();
      await up();
      await openFor('P00007');
      expect(el.querySelectorAll('#ctRightPanel .ct-tab[data-tab="docs"]')).toHaveLength(1);
      fixture.destroy();
      TestBed.resetTestingModule();
      deniedRoles = new Set(['Pipeline_Prospect_Attachment_View']);
      await create();
      await up();
      await openFor('P00007');
      expect(el.querySelectorAll('#ctRightPanel .ct-tab[data-tab="docs"]')).toHaveLength(0);
      expect(el.querySelectorAll('#ctRightPanel .ct-tab[data-tab="detail"]')).toHaveLength(1);
      expect($('#ctTabDetail').classList.contains('active')).toBe(true);
    });

    it('loads the documents when the tab is opened — not when the row is clicked — and once per customer; the profile picture is not listed', async () => {
      await create();
      await up();
      await openFor('P00007');
      expect(urls('prospect/attachments')).toHaveLength(0);
      click('.ct-tab[data-tab="docs"]');
      await settle(() => expect($$('#ctTabDocs .ct-doc-row')).toHaveLength(5));
      expect(urls('prospect/attachments').map((c) => c.url)).toEqual(['/board/prospect/attachments?prospectId=7']);
      expect($('#ctTabDocs').classList.contains('active')).toBe(true);
      expect($('#ctTabDetail').classList.contains('active')).toBe(false);
      expect($$('#ctTabDocs .ct-doc-row').some((r) => r.dataset['name'] === 'profile.png')).toBe(false);
      // the first document is selected and previewed; the icons follow the file type
      expect($$('#ctTabDocs .ct-doc-row')[0].classList.contains('active')).toBe(true);
      expect($$('#ctTabDocs .ct-doc-row .ct-doc-ic').map((i) => i.className)).toContain('fas fa-file-pdf ct-doc-ic');
      click('.ct-tab[data-tab="detail"]');
      click('.ct-tab[data-tab="docs"]');
      expect(urls('prospect/attachments')).toHaveLength(1);
    });

    it('a customer without documents shows the empty line; selecting a row previews it', async () => {
      await create();
      await up();
      await openFor('P00002');
      click('.ct-tab[data-tab="docs"]');
      await settle(() => expect(text('#ctTabDocs .ct-doc-empty')).toBe('label.contracts.empty_attachments'));
      expect(text('#ctDocPreview')).toBe('label.contracts.no_preview');
      click('.ct-tab[data-tab="detail"]');
      await openFor('P00007').catch(() => undefined);
    });

    it('delete: a confirm first (SweetAlert, danger mode); only a yes deletes, and the list is drawn again from the server', async () => {
      await create();
      await up();
      await openFor('P00007');
      click('.ct-tab[data-tab="docs"]');
      await settle(() => expect($$('#ctTabDocs .ct-doc-row')).toHaveLength(5));
      swalAnswer = null; // "cancel"
      $$('#ctTabDocs .ct-doc-del')[0].click();
      await settle(() => expect(swalCount()).toBeGreaterThan(0));
      expect(swalCalls[0]).toMatchObject({ title: 'label.contracts.confirm_delete_doc', icon: 'warning', dangerMode: true, buttons: ['chat.cancel', 'label.cmd.delete_tip'] });
      await new Promise((r) => setTimeout(r, 30));
      expect(calls.filter((c) => c.method === 'DELETE')).toHaveLength(0);
      swalAnswer = true;
      const first = $$('#ctTabDocs .ct-doc-row')[0].dataset['no']!;
      $$('#ctTabDocs .ct-doc-del')[0].click();
      await settle(() => expect($$('#ctTabDocs .ct-doc-row')).toHaveLength(4));
      expect(calls.filter((c) => c.method === 'DELETE').map((c) => c.url)).toEqual([`/board/prospect/attachments?prospectId=7&docNo=${first}`]);
      expect($$('#ctTabDocs .ct-doc-row').some((r) => r.dataset['no'] === first)).toBe(false);
    });

    it('download: the file comes through /docproxy as a blob with the name of the document', async () => {
      await create();
      await up();
      await openFor('P00007');
      click('.ct-tab[data-tab="docs"]');
      await settle(() => expect($$('#ctTabDocs .ct-doc-row')).toHaveLength(5));
      const made: Blob[] = [];
      (URL as unknown as Record<string, unknown>)['createObjectURL'] = vi.fn((b: Blob) => (made.push(b), 'blob:doc'));
      (URL as unknown as Record<string, unknown>)['revokeObjectURL'] = vi.fn();
      const clicked: Array<{ download: string; href: string }> = [];
      vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(function (this: HTMLAnchorElement) {
        clicked.push({ download: this.download, href: this.href });
      });
      const row = $$('#ctTabDocs .ct-doc-row')[0];
      row.querySelector<HTMLElement>('.ct-dl-btn')!.click();
      await settle(() => expect(clicked).toHaveLength(1));
      expect(clicked[0].download).toBe(row.dataset['name']);
      expect(urls('/docproxy').at(-1)!.url).toBe(`/docproxy?url=${encodeURIComponent(row.dataset['src']!)}`);
      expect(made).toHaveLength(1);
    });

    it('upload: the extension is checked first; each file is sent as base64 JSON; the list is drawn again; a summary popup tells how it went', async () => {
      await create();
      await up();
      await openFor('P00002');
      click('.ct-tab[data-tab="docs"]');
      await settle(() => expect($$('#ctTabDocs .ct-doc-empty')).toHaveLength(1));
      const input = $<HTMLInputElement>('#ctFileInput');
      expect(input.getAttribute('accept')).toContain('.pdf');
      const pick = (...files: File[]) => {
        Object.defineProperty(input, 'files', { configurable: true, value: files });
        input.dispatchEvent(new Event('change', { bubbles: true }));
      };
      // a file type that is not allowed: nothing is sent (the popup is TsAttachTypes')
      pick(new File(['x'], 'virus.exe'));
      expect(urls('prospect/attachments').filter((c) => c.method === 'POST')).toHaveLength(0);
      // two files: one after the other, then the list from the server
      pick(new File(['hello'], 'a.pdf', { type: 'application/pdf' }), new File(['world'], 'b.png', { type: 'image/png' }));
      expect($('#ctUploadBtn').hasAttribute('disabled')).toBe(true);
      expect($('#ctDocProgress').style.display).toBe('flex');
      await settle(() => expect($$('#ctTabDocs .ct-doc-row')).toHaveLength(2));
      const posts = calls.filter((c) => c.method === 'POST');
      expect(posts).toHaveLength(2);
      const body = JSON.parse(posts[0].body!);
      expect(body).toMatchObject({ prospectId: '2', fileName: 'a.pdf', description: 'a.pdf' });
      expect(body.fileContentBase64).toMatch(/^data:application\/pdf;base64,/);
      expect($('#ctUploadBtn').hasAttribute('disabled')).toBe(false);
      expect(swalCalls.at(-1)).toMatchObject({ icon: 'success', buttons: false, timer: 2000, title: 'label.cmd.upload_done 2 label.cmd.file_unit' });
      // a failure and a file over the limit are reported with their reasons
      pick(new File(['x'], 'FAIL.pdf'));
      await settle(() => expect(swalCalls.at(-1)).toMatchObject({ icon: 'error', title: 'label.ld2.upload_failed' }));
      expect(swalCalls.at(-1)!['text']).toContain('FAIL.pdf — ');
    });

    it('a file over the limit is not even read: the reason names the limit in MB', async () => {
      await create();
      await up();
      await openFor('P00002');
      click('.ct-tab[data-tab="docs"]');
      await settle(() => expect($$('#ctTabDocs .ct-doc-empty')).toHaveLength(1));
      const input = $<HTMLInputElement>('#ctFileInput');
      const big = new File(['x'], 'huge.pdf');
      Object.defineProperty(big, 'size', { value: 15_000_001 });
      Object.defineProperty(input, 'files', { configurable: true, value: [big] });
      input.dispatchEvent(new Event('change', { bubbles: true }));
      await settle(() => expect(swalCalls.at(-1)).toMatchObject({ icon: 'error' }));
      expect(swalCalls.at(-1)!['text']).toBe('huge.pdf — label.cmd.file_too_large 14.3 MB');
      expect(calls.filter((c) => c.method === 'POST')).toHaveLength(0);
    });
  });

  describe('the "create lead" modal', () => {
    const openModal = async (fresh = true) => {
      if (fresh) {
        await create();
        await up();
      }
      rows()[0].click();
      click('.ct-lead-btn');
      await settle(() => expect($<HTMLSelectElement>('#clProduct').options.length).toBeGreaterThan(1));
    };
    const choose = (id: string, index: number) => {
      const s = $<HTMLSelectElement>(id);
      s.value = [...s.options].filter((o) => o.value)[index].value;
      s.dispatchEvent(new Event('change', { bubbles: true }));
    };

    it('without a customer the button warns; with one the modal moves to <body> and asks its lists in ONE call when it opens: sales lines (+ "ไม่ระบุ"), owners (people + queues), sale persons', async () => {
      await create();
      await up();
      (window as unknown as { clOpenModal(): void }).clOpenModal();
      expect(swalCalls.at(-1)).toMatchObject({ title: 'ข้อความแจ้งเตือน!', text: 'label.contracts.please_select_customer', icon: 'warning', timer: 3000, buttons: false });
      await openModal(false);
      const modal = document.getElementById('ctCreateLeadModal')!;
      expect(modal.parentElement).toBe(document.body);
      expect(modal.classList.contains('show')).toBe(true);
      // ONE call for the four lists, and none of the old ones (products, sale persons, employees)
      expect(urls('/board/prospect-options?sets=salesLines,responsibles,waitlists,salePersons')).toHaveLength(1);
      expect(urls('/board/movement-types')).toHaveLength(0);
      expect(urls('/board/sale-persons')).toHaveLength(0);
      expect(urls('/board/employees').length).toBeLessThanOrEqual(1); // (the one of the side panel's own owner select, not of the modal)
      // the field of the product is the sales line: the placeholder, "ไม่ระบุ" (made here), then the lines of the service
      expect([...$<HTMLSelectElement>('#clProduct').options].map((o) => o.textContent)).toEqual(['label.dashboard.select', 'ไม่ระบุ', 'สายงานขาย A', 'สายงานขาย B']);
      // the owner: the responsible people, then the queues (value wl:<id>; a queue with no name is shown by its id)
      const owner = [...$<HTMLSelectElement>('#clOwner').options];
      expect(owner.filter((o) => !o.value.startsWith('wl:') && o.value).length).toBeGreaterThan(1);
      expect(owner.filter((o) => o.value.startsWith('wl:')).map((o) => [o.value, o.textContent])).toEqual([['wl:w-1', 'คิวทดสอบในเครื่อง'], ['wl:w-2', 'w-2']]);
      // the sale persons are kept for when a line is chosen (their field is hidden until then)
      expect($$('#clSales option').length).toBeGreaterThan(1);
      expect($('#clSalesField').style.display).toBe('none');
      click('.ct-cl-cancel');
      expect(modal.classList.contains('show')).toBe(false);
    });

    it('opening it again asks again; the sales field shows only when a real line is chosen; "ไม่ระบุ" is no line', async () => {
      await openModal();
      expect($('#clSalesField').style.display).toBe('none');
      choose('#clProduct', 0); // "ไม่ระบุ"
      expect($<HTMLSelectElement>('#clProduct').value).toBe('__none__');
      expect($('#clSalesField').style.display).toBe('none');
      choose('#clProduct', 1); // a sales line
      await settle(() => expect($('#clSalesField').style.display).toBe(''));
      choose('#clProduct', 0);
      expect($('#clSalesField').style.display).toBe('none');
      click('.ct-cl-cancel');
      click('.ct-lead-btn');
      await settle(() => expect(urls('/board/prospect-options?sets=salesLines,responsibles,waitlists,salePersons')).toHaveLength(2));
    });

    it('choosing a sales line asks GET /prospects/options?sets=responsibles&salesLineId=<id>: the owners become the people of that line (no queues); "ไม่ระบุ" gives back people + queues; the sale person is chosen for the owner', async () => {
      await openModal();
      const owners = () => [...$<HTMLSelectElement>('#clOwner').options].filter((o) => o.value).map((o) => o.value);
      const opening = owners();
      expect(opening.some((v) => v.startsWith('wl:'))).toBe(true);
      expect(urls('salesLineId')).toHaveLength(0);
      choose('#clProduct', 1); // the first line: sl-1
      await settle(() => expect(urls('/board/prospect-options?sets=responsibles&salesLineId=sl-1')).toHaveLength(1));
      await settle(() => expect(owners()).toEqual(['r-0', 'r-1']));
      expect(owners().some((v) => v.startsWith('wl:'))).toBe(false);
      // the sale person of the chosen owner is chosen for it (its employeeId is the owner)
      const owner = $<HTMLSelectElement>('#clOwner');
      owner.value = 'r-1';
      owner.dispatchEvent(new Event('change', { bubbles: true }));
      const sales = $<HTMLSelectElement>('#clSales');
      expect(sales.selectedOptions[0].getAttribute('data-emp')).toBe('r-1');
      // another line: asked again with its own id
      choose('#clProduct', 2);
      await settle(() => expect(urls('/board/prospect-options?sets=responsibles&salesLineId=sl-2')).toHaveLength(1));
      // "ไม่ระบุ": the people + queues of the opening, no call, the sales field hidden
      const calls0 = urls('salesLineId').length;
      choose('#clProduct', 0);
      await settle(() => expect(owners()).toEqual(opening));
      expect(urls('salesLineId')).toHaveLength(calls0);
      expect($('#clSalesField').style.display).toBe('none');
    });

    it('a late answer of an earlier line does not replace the people of the line chosen after it', async () => {
      await openModal();
      choose('#clProduct', 1);
      choose('#clProduct', 2);
      await settle(() => expect(urls('salesLineId')).toHaveLength(2));
      await new Promise((r) => setTimeout(r, 50));
      expect([...$<HTMLSelectElement>('#clOwner').options].filter((o) => o.value).map((o) => o.value)).toEqual(['r-0', 'r-1']);
    });

    it('validation: a line is needed (the placeholder is not one); "ไม่ระบุ" is a choice', async () => {
      await openModal();
      click('#clSubmitBtn');
      expect(swalCalls.at(-1)!['text']).toBe('label.contracts.please_select_product');
      choose('#clProduct', 0);
      expect($<HTMLSelectElement>('#clProduct').value).toBe('__none__');
    });

    it('the success popup goes to the lead list through the link table', async () => {
      await create();
      await up();
      (window as unknown as { ctShowLeadSuccess(): void }).ctShowLeadSuccess();
      click('#ctLeadSuccessOverlay .ct-confirm-ok');
      expect(navigateSpy).toHaveBeenLastCalledWith('/crm/opportunities');
    });
  });

  describe('leaving the page', () => {
    it('removes every listener, observer and timer it added, the window.* names, the modal it moved to <body> and the drag-scroll', async () => {
      const added: Array<[EventTarget, string, unknown]> = [];
      const removed: Array<[EventTarget, string, unknown]> = [];
      for (const target of [document, window]) {
        const add = target.addEventListener.bind(target);
        const rm = target.removeEventListener.bind(target);
        vi.spyOn(target, 'addEventListener').mockImplementation(((type: string, fn: unknown, o?: unknown) => (added.push([target, type, fn]), add(type, fn as never, o as never))) as never);
        vi.spyOn(target, 'removeEventListener').mockImplementation(((type: string, fn: unknown, o?: unknown) => (removed.push([target, type, fn]), rm(type, fn as never, o as never))) as never);
      }
      const live = new Set<unknown>();
      const st = window.setTimeout.bind(window);
      const ct = window.clearTimeout.bind(window);
      vi.spyOn(window, 'setTimeout').mockImplementation(((fn: () => void, ms?: number, ...a: unknown[]) => {
        const h = st(() => (live.delete(h), fn()), ms, ...a);
        if (ms === 60 || ms === 320 || ms === 1000) live.add(h);
        return h;
      }) as never);
      vi.spyOn(window, 'clearTimeout').mockImplementation(((h: never) => (live.delete(h), ct(h))) as never);
      const observers: Array<{ disconnected: boolean }> = [];
      vi.stubGlobal(
        'IntersectionObserver',
        class {
          disconnected = false;
          constructor() {
            observers.push(this);
          }
          observe() {}
          disconnect() {
            this.disconnected = true;
          }
        },
      );

      await create();
      await up();
      const types = new Set(added.map(([, type]) => type));
      for (const type of ['click', 'resize', 'dragover', 'drop', 'mousemove', 'mouseup']) expect(types.has(type), type).toBe(true);
      rows()[0].click(); // schedules the panel height sync timers
      expect(live.size).toBeGreaterThan(0);
      click('.ct-lead-btn');
      await settle(() => expect(document.getElementById('ctCreateLeadModal')!.parentElement).toBe(document.body));
      expect(typeof (window as unknown as Record<string, unknown>)['ctOpenPanel']).toBe('function');
      const wrap = $('.ct-table-wrap');
      expect(wrap.getAttribute('data-ds-bound')).toBe('1');

      fixture.destroy();
      expect(live.size).toBe(0);
      expect(observers.length).toBeGreaterThan(0);
      expect(observers.every((o) => o.disconnected)).toBe(true);
      expect(document.getElementById('ctCreateLeadModal')).toBeNull();
      for (const name of ['ctOpenPanel', 'ctCtxToggle', 'clSubmit', 'clOpenModal', 'ctRenderPreview', 'ctDownloadDoc', 'rc_ctLoadDocs', 'rc_ctDeleteDoc', 'ctNavigate', 'CT_CUR_PID']) {
        expect((window as unknown as Record<string, unknown>)[name], name).toBeUndefined();
      }
      expect(wrap.hasAttribute('data-ds-bound')).toBe(false);
      const open = added.filter(([tg, type, fn]) => !removed.some(([rt, rtype, rfn]) => rt === tg && rtype === type && rfn === fn));
      // (popstate / hashchange are the Router's own, created by this TestBed and released when it is reset)
      expect(open.map(([, type]) => type).filter((type) => type !== 'popstate' && type !== 'hashchange')).toEqual([]);
    });

    it('an answer that arrives after the page was left paints nothing (it never settles)', async () => {
      delayMs = 120;
      await create();
      await settle(() => expect($$('#ctTableBody .ct-skel-row').length).toBeGreaterThan(0));
      const body = $('#ctTableBody');
      fixture.destroy();
      await new Promise((r) => setTimeout(r, 450));
      expect(body.querySelector('tr[data-id]')).toBeNull();
      expect(body.querySelector('.ct-skel-row')).toBeTruthy();
    });
  });

  it('a language switch is a page reload in Java: a NEW page instance', async () => {
    await create();
    await up();
    const first = fixture.debugElement.query(By.directive(ProspectsView)).componentInstance;
    lang.set('en');
    fixture.detectChanges();
    TestBed.tick?.();
    await settle(() => expect(fixture.debugElement.query(By.directive(ProspectsView)).componentInstance).not.toBe(first));
    await up();
  });

  it('with mock off the host asks the LIVE backend (not the sample data) and draws what it answers', async () => {
    const backend = vi.spyOn(ProspectsView.prototype as unknown as { backend(): Promise<ProspectsBackend> }, 'backend');
    await create({ mock: false });
    await up();
    expect(backend).toHaveBeenCalledTimes(1);
    expect(el.querySelector('ts-live-missing')).toBeNull();
    expect(el.querySelector('.ct-root')).toBeTruthy();
    expect(rows()).toHaveLength(20);
  });

  it('live mode fetches no country master on entering the page: the phone master is set empty, the BFF address is not asked (it is gone)', async () => {
    const shellFetch = vi.fn(async () => new Response('<html></html>', { status: 200 }));
    vi.stubGlobal('TsPhone', createTsPhone({ apiBase: '', fetch: shellFetch }));
    const proto = ProspectsView.prototype as unknown as { backend(): Promise<ProspectsBackend> };
    vi.spyOn(proto, 'backend').mockImplementation(async () => {
      backend = createMockProspects({ delayMs });
      return { initial: () => backend.initial(), fetch: (input, init) => (calls.push({ url: input, method: (init?.method ?? 'GET').toUpperCase() }), backend.fetch(input, init)) };
    });
    await create({ mock: false });
    await up();
    expect(urls('type=countries')).toHaveLength(0);
    expect(shellFetch).not.toHaveBeenCalled();
    expect((globalThis as unknown as { TsPhone: { isReady(): boolean } }).TsPhone.isReady()).toBe(true);
  });

  it('live mode asks the waitlists in the background on entering the page (once); mock mode does not', async () => {
    const proto = ProspectsView.prototype as unknown as { backend(): Promise<ProspectsBackend> };
    vi.spyOn(proto, 'backend').mockImplementation(async () => {
      backend = createMockProspects({ delayMs });
      return { initial: () => backend.initial(), fetch: (input, init) => (calls.push({ url: input, method: (init?.method ?? 'GET').toUpperCase() }), backend.fetch(input, init)) };
    });
    await create({ mock: false });
    await up();
    expect(urls('set=waitlists')).toHaveLength(1);
  });

  it('live mode, with the REAL live backend: entering the page calls GET /prospects/options?sets=waitlists once, and not again after it came', async () => {
    const { fakeRest } = await import('@core/live/rest-fake');
    const { createLiveProspects } = await import('./prospects.live');
    const { clearOptionCache } = await import('@core/live/options-cache');
    clearOptionCache();
    sessionStorage.clear();
    const rest = fakeRest((c) =>
      c.path.startsWith('/prospects/options')
        ? { status: 200, result: { waitlists: [{ id: 'w-1', name: 'queue' }] } }
        : c.path.startsWith('/prospects?')
          ? { status: 200, result: [], meta: { page: 1, perPage: 20, total: 0, totalPages: 0 } }
          : { status: 200, result: [] },
    );
    const proto = ProspectsView.prototype as unknown as { backend(): Promise<ProspectsBackend> };
    vi.spyOn(proto, 'backend').mockImplementation(async () => createLiveProspects(rest.deps));
    await create({ mock: false });
    await settle(() => expect(rest.calls.filter((c) => c.path === '/prospects/options?sets=waitlists')).toHaveLength(1));
    expect(rest.calls.find((c) => c.path === '/prospects/options?sets=waitlists')!.method).toBe('GET');
  });

  it('a row whose dial code is **** shows **** as the phone, in the table and in the panel (no formatting, no digits)', async () => {
    const proto = ProspectsView.prototype as unknown as { backend(): Promise<ProspectsBackend> };
    vi.spyOn(proto, 'backend').mockImplementation(async () => {
      backend = createMockProspects({ delayMs });
      return {
        initial: () => backend.initial(),
        fetch: async (input, init) => {
          calls.push({ url: input, method: (init?.method ?? 'GET').toUpperCase() });
          const res = await backend.fetch(input, init);
          if (!input.includes('/board/prospect-list')) return res;
          const json = (await res.json()) as { result: { items: Array<Record<string, unknown>> } };
          json.result.items[0] = { ...json.result.items[0], phone: '0812345678', phonecc: '****' };
          return new Response(JSON.stringify(json), { status: 200, headers: { 'content-type': 'application/json' } });
        },
      };
    });
    await create({ mock: false });
    await up();
    const cell = rows()[0].querySelector('.ct-phone')!;
    expect(cell.textContent!.trim()).toBe('****');
    expect(cell.textContent).not.toMatch(/\d/);
    rows()[0].click();
    expect($('#ctDPhone').textContent!.trim()).toBe('****');
    // another row keeps its phone
    expect(rows()[1].querySelector('.ct-phone')!.textContent).not.toBe('****');
  });

  describe('the status item of the 3-dots menu (POST /prospects/{id}/status-changes)', () => {
    const sent: Array<Record<string, unknown>> = [];

    /** the list with its first rows given states, and the bodies of the status changes kept */
    async function withStates(states: string[], failKey = false): Promise<void> {
      sent.length = 0;
      const proto = ProspectsView.prototype as unknown as { backend(): Promise<ProspectsBackend> };
      vi.spyOn(proto, 'backend').mockImplementation(async () => {
        backend = createMockProspects({ delayMs });
        return {
          initial: () => backend.initial(),
          fetch: async (input, init) => {
            calls.push({ url: input, method: (init?.method ?? 'GET').toUpperCase() });
            if (input.includes('/board/prospect-status-change')) {
              const body = JSON.parse(String(init?.body ?? '{}')) as Record<string, unknown>;
              sent.push(body);
              if (failKey) body['idempotencyKey'] = 'X-FAIL-409';
              return backend.fetch(input, { ...init, body: JSON.stringify(body) });
            }
            const res = await backend.fetch(input, init);
            if (!input.includes('/board/prospect-list')) return res;
            const json = (await res.json()) as { result: { items: Array<Record<string, unknown>> } };
            states.forEach((st, i) => (json.result.items[i] = { ...json.result.items[i], status: st }));
            return new Response(JSON.stringify(json), { status: 200, headers: { 'content-type': 'application/json' } });
          },
        };
      });
      await create({ mock: false });
      await up();
    }
    const item = (i: number) => rows()[i].querySelector<HTMLElement>('[id^="ctCtxStatus-"]');

    it('each state has its item: draft → Release, active → Suspend, suspended → Unblock (the label comes from its own key)', async () => {
      await withStates(['แบบร่าง', 'เปิดใช้งาน', 'ระงับใช้งาน']);
      expect(item(0)!.textContent!.trim()).toBe('app.prospects.release');
      expect(item(1)!.textContent!.trim()).toBe('app.prospects.suspend');
      expect(item(2)!.textContent!.trim()).toBe('app.prospects.unblock');
      expect(item(0)!.getAttribute('onclick')).toContain("'RELEASE'");
      expect(item(1)!.getAttribute('onclick')).toContain("'BLOCK'");
      expect(item(2)!.getAttribute('onclick')).toContain("'RELEASE'");
    });

    it('Suspend asks first; cancelled nothing is sent; confirmed it posts BLOCK with no assignment and an Idempotency-Key, then the list is read again', async () => {
      await withStates(['เปิดใช้งาน']);
      const id = rows()[0].dataset['id']!;
      const lists = urls('prospect-list').length;
      swalAnswer = null;
      item(0)!.click();
      await settle(() => expect(swalCalls).toHaveLength(1));
      expect(swalCalls[0]).toMatchObject({ title: 'app.prospects.confirmSuspend', icon: 'warning' });
      expect(sent).toHaveLength(0);
      swalAnswer = true;
      item(0)!.click();
      await settle(() => expect(sent).toHaveLength(1));
      expect(sent[0]).toMatchObject({ prospectId: id, targetStatus: 'BLOCK' });
      expect(sent[0]).not.toHaveProperty('assignment');
      expect(String(sent[0]['idempotencyKey']).length).toBeGreaterThan(8);
      await settle(() => expect(urls('prospect-list').length).toBeGreaterThan(lists));
      expect(swalCalls.some((c) => c['title'] === 'app.prospects.statusChanged')).toBe(true);
    });

    it('Release (a draft) and Unblock choose who is responsible: the dialog lists the people, the choice goes as assignment { destination: EMPLOYEE, responsibleEmployeeId }', async () => {
      await withStates(['แบบร่าง', 'ระงับใช้งาน']);
      swalAnswer = new Promise<boolean>((resolve) => setTimeout(() => resolve(true), 30)); // the answer comes after the choice (the queues are listed first: a person is chosen)
      item(0)!.click();
      await settle(() => expect(swalCalls.some((c) => c['content'] instanceof HTMLSelectElement)).toBe(true));
      const dialog = swalCalls.find((c) => c['content'] instanceof HTMLSelectElement)!;
      expect(dialog).toMatchObject({ title: 'app.prospects.chooseResponsible' });
      expect(dialog['buttons']).toEqual(['chat.cancel', 'app.prospects.release']);
      const select = dialog['content'] as HTMLSelectElement;
      expect(select.options.length).toBeGreaterThan(1);
      select.value = [...select.options].find((o) => o.value && !o.value.startsWith('wl:'))!.value; // the queues are listed first: choose a person
      await settle(() => expect(sent).toHaveLength(1));
      expect(sent[0]).toMatchObject({ targetStatus: 'RELEASE', assignment: { destination: 'EMPLOYEE', responsibleEmployeeId: select.value } });
      // unblock: the same, with its own label on the button
      swalCalls.length = 0;
      item(1)!.click();
      await settle(() => expect(swalCalls.some((c) => c['content'] instanceof HTMLSelectElement)).toBe(true));
      expect(swalCalls.find((c) => c['content'] instanceof HTMLSelectElement)!['buttons']).toEqual(['chat.cancel', 'app.prospects.unblock']);
    });

    it('the Release dialog lists the people AND the queues; a queue chosen sends assignment { destination: WAITLIST, waitlistId }', async () => {
      await withStates(['แบบร่าง']);
      swalAnswer = true;
      item(0)!.click();
      await settle(() => expect(swalCalls.some((c) => c['content'] instanceof HTMLSelectElement)).toBe(true));
      const select = swalCalls.find((c) => c['content'] instanceof HTMLSelectElement)!['content'] as HTMLSelectElement;
      expect([...select.options].filter((o) => o.value.startsWith('wl:')).map((o) => o.value)).toEqual(['wl:w-1', 'wl:w-2']);
      expect([...select.options].filter((o) => !o.value.startsWith('wl:')).length).toBeGreaterThan(1);
      await settle(() => expect(sent).toHaveLength(1));
      // the dialog answered "yes" with its first choice (a person): destination EMPLOYEE. Again, choosing the queue before the answer:
      swalCalls.length = 0;
      sent.length = 0;
      swalAnswer = new Promise<boolean>((resolve) => setTimeout(() => resolve(true), 30));
      item(0)!.click();
      await settle(() => expect(swalCalls.some((c) => c['content'] instanceof HTMLSelectElement)).toBe(true));
      const again = swalCalls.find((c) => c['content'] instanceof HTMLSelectElement)!['content'] as HTMLSelectElement;
      again.value = 'wl:w-1';
      await settle(() => expect(sent).toHaveLength(1));
      expect(sent[0]).toMatchObject({ targetStatus: 'RELEASE', assignment: { destination: 'WAITLIST', waitlistId: 'w-1' } });
      expect(sent[0]['assignment']).not.toHaveProperty('responsibleEmployeeId');
    });

    it('a 409 of the service shows its reason and leaves the list as it is', async () => {
      await withStates(['เปิดใช้งาน'], true);
      swalAnswer = true;
      item(0)!.click();
      await settle(() => expect(swalCalls.some((c) => c['title'] === 'app.prospects.statusChangeFailed')).toBe(true));
      const failed = swalCalls.find((c) => c['title'] === 'app.prospects.statusChangeFailed')!;
      expect(String(failed['text'])).toContain('status changed');
      expect(swalCalls.some((c) => c['title'] === 'app.prospects.statusChanged')).toBe(false);
    });

    it('the deleted tab has no status item (its menu is "restore" only)', async () => {
      await withStates([]);
      click('#ctStatusChips .ct-chip[data-status="deleted"]');
      await settle(() => expect(urls('prospect-list').at(-1)!.url).toContain('status=deleted'));
      await up();
      expect($$('#ctTableBody [id^="ctCtxStatus-"]')).toHaveLength(0);
    });
  });

  it('live mode: the first click on a row asks the record of the prospect (GET /prospects/{id}?sections=BASE,SOCIAL,ATTACHMENTS,OPPORTUNITIES) and the panel shows what it says; the second click asks nothing', async () => {
    const { fakeRest } = await import('@core/live/rest-fake');
    const { createLiveProspects } = await import('./prospects.live');
    const { clearOptionCache } = await import('@core/live/options-cache');
    clearOptionCache();
    sessionStorage.clear();
    const ID = '019b0000-0000-7000-8000-000000009410';
    const rest = fakeRest((c) => {
      if (c.path.startsWith('/prospects/options')) return { status: 200, result: { waitlists: [] } };
      if (c.path.startsWith(`/prospects/${ID}`)) {
        return {
          status: 200,
          result: {
            base: { id: ID, code: 'P010', name: 'สมชาย', sex: 'FEMALE', customerType: 'JURISTIC', email: 'a@b.com', marketingChannel: { name: 'Line OA' }, contactBack: { name: 'อีเมล' } },
            socialAccounts: [{ channelType: 'LINE', accountId: 'Uabc' }],
            attachments: [{ id: 'a-1', type: { id: 't1', name: 'บัตร' }, description: 'สำเนาบัตร', createdAt: '2026-11-12T08:31:00Z', downloadUrl: '/api/v1/prospects/x/attachments/a-1' }],
          },
        };
      }
      if (c.path.startsWith('/prospects?')) {
        return {
          status: 200,
          result: [{ id: ID, code: 'P010', name: 'สมชาย', usageStatus: 'RELEASE', contactDate: '2026-11-02', currentArea: { province: 'เชียงใหม่' }, responsible: { id: 'e2', name: 'สมศรี' } }],
          meta: { page: 1, perPage: 20, total: 1, totalPages: 1 },
        };
      }
      return { status: 200, result: [] };
    });
    const proto = ProspectsView.prototype as unknown as { backend(): Promise<ProspectsBackend> };
    vi.spyOn(proto, 'backend').mockImplementation(async () => createLiveProspects(rest.deps));
    await create({ mock: false });
    await settle(() => expect(rows()).toHaveLength(1));
    const recordCalls = () => rest.calls.filter((c) => c.path.startsWith(`/prospects/${ID}?`));
    expect(recordCalls()).toHaveLength(0); // nothing is asked until a row is clicked
    rows()[0].click();
    await settle(() => expect(recordCalls()).toHaveLength(1));
    expect(recordCalls()[0].path).toBe(`/prospects/${ID}?sections=BASE%2CSOCIAL%2CATTACHMENTS%2COPPORTUNITIES`);
    await settle(() => expect($('#ctDEmail').textContent!.trim()).toBe('a@b.com'));
    expect($('#ctDGender').textContent!.trim()).toBe('หญิง');
    expect($('#ctDType').textContent!.trim()).toBe('องค์กร');
    expect($('#ctDSocial').textContent).toContain('Uabc');
    expect($('#ctDSource').textContent).toContain('Line OA');
    expect($('#ctDAvailChannel').textContent!.trim()).toBe('อีเมล');
    // the documents came with the record: the tab lists them, no call of its own
    click('#ctPanelTabDocs, [data-tab="docs"]');
    await settle(() => expect(document.body.textContent).toContain('สำเนาบัตร'));
    expect(rest.calls.filter((c) => c.path.includes('sections=ATTACHMENTS') && !c.path.includes('BASE'))).toHaveLength(0);
    rows()[0].click(); // the same row again: the panel is drawn from what the row holds now
    expect(recordCalls()).toHaveLength(1);
  });

  it('in mock mode the waitlists are not asked on entering the page', async () => {
    await create();
    await up();
    expect(urls('set=waitlists')).toHaveLength(0);
  });

  it('in mock mode the host does not ask for the phone master itself (the shell fetches the fake one)', async () => {
    await create();
    await up();
    expect(urls('type=countries')).toHaveLength(0);
  });
});
