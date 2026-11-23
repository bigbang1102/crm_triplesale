// Comparison setup of the Schedule page (/crm/schedule, "ปฏิทินงาน") — see tools/compare/README.md for the interface of a page.
//
// Java side: the REAL page — the <style> of the head of schedule.xhtml, its markup, its page script, work_modal.xhtml included where Facelets
// includes it (ui:param page=schedule), the filter dialog and its script, EL resolved the way the server would (messages of the bundle,
// context path, the permission flags, the signed-in employee, the filter state of the HttpSession) — inside the shell replica. It is served
// at /triplesale/pages/schedule.html so that the relative addresses of the work modal (../board/…, ../images/…) resolve as they do in Java.
// Every call it makes (/triplesale/board/…) is answered by the SAME mock the Angular page runs (schedule.mock.ts). The page is built per
// request because its EL depends on who asks (the language, the permission set) and on the state the server session holds
// (`scheduleView.savedFilterJson`).
//
// "Now" of both sides is fixed (clock below): the page reads `new Date()` for its today, the mock lives around SEED_TODAY (2026-10-20).
//
// Variants: `opts.perm` (a key of PERMS) builds the Java page for a permission set and, with `denyRoles`, signs the Angular session in
// without the same roles; `opts.mock` + `opts.storage` switch the failures of the mock on (scenarios.mjs `cfg()`); `opts.saved` opens the
// page with a filter state the HttpSession already holds (`seed()`).
import { join } from 'node:path';
import { javaLinkToRoute } from '../../../../src/app/core/navigation/java-links.ts'; // (Node strips the types)
import { expandIncludes, facesToHtml, uiDefines } from '../../../lib/port-kit.mjs';

const MOCK = 'src/app/features/schedule/schedule.mock.ts';
/** Java: commonBean.ssEmployeeId of the mock sign-in ("demo", mock-backend.interceptor.ts: employeeId 1001 = E101) */
const MY_EMPLOYEE_ID = '1001';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/** the permission sets: key → the features the user LACKS */
export const PERMS = {
  all: [],
  noview: ['CRM_Schedule_View'],
  noedit: ['CRM_Schedule_Edit'],
  nocreate: ['CRM_Schedule_Create', 'CRM_Schedule_Create_Sup'],
  nosup: ['CRM_Schedule_Create_Sup'],
  nolead: ['CRM_Lead_View'],
  readonly: ['CRM_Schedule_Edit', 'CRM_Schedule_Create', 'CRM_Schedule_Create_Sup', 'CRM_Lead_View'],
};

export default {
  name: 'schedule',
  // "now" of the page: 2026-10-20 10:30 (SEED_TODAY) — both sides (runner.mjs `clock`)
  clock: [2026, 9, 20, 10, 30, 0],
  // the page, the "more" pop-up, the dialogs (siblings of .sc-root), the work modal and the SweetAlert dialogs
  roots: ['.sc-root', '#scMorePop', '#scFilterOverlay', '#ld2ViewWorkOverlay', '#ld2AddWorkOverlay', '#wmSuccessOverlay', '.swal-overlay'],
  // the first load is over: the skeleton of the calendar is gone (the data arrived, or the error page took its place)
  ready: `document.querySelector('.sc-root') && document.querySelector('#scCalSkel') && document.querySelector('#scCalSkel').classList.contains('hide') && document.querySelector('#scCalNavRight .sc-view-btn')`,
  javaPath: (lang, opts) =>
    `/triplesale/pages/schedule.html?l=${lang}&p=${opts.perm ?? 'all'}` +
    (opts.mock ? '&cfg=' + encodeURIComponent(JSON.stringify(opts.mock)) : '') +
    (opts.saved ? '&state=' + encodeURIComponent(JSON.stringify(opts.saved)) : ''),
  ngPath: () => '/crm/schedule',
  latencyMs: 150,
  // browser messages that are the point of a scenario (a failing backend, a failed move): not problems of the port
  ignoreLog: [/^HTTP 500 \/(?:triplesale\/)?board\//, /^HTTP 400 \/(?:triplesale\/)?board\/schedule\/(?:add|edit)/, /^console\.error: scMoveCard error/, /^console\.error: \[work_modal\] submitAdd error/],
  // helpers of this page's scenarios + the lines every dump ends with (the dump compares attributes, not the values of controls)
  pre: `
var PRODUCTS = { house: '1004400740', car: '1004400741', adviser: '1004400742', empty: '1004400743' };
var TODAY = '2026-10-20';
// the first load is over (the skeleton is hidden) and the request in flight has been answered
var loaded = async function (ms) { await sleep(150); await waitFor(function () { return $('#scCalSkel') && $('#scCalSkel').classList.contains('hide'); }, 8000); await sleep(ms || 500); };
// the page after a request that redraws it: the skeleton rows of the lists / board are gone
var idle = async function (ms) { await sleep(450); await waitFor(function () { return !$("tr.sc-skel-row") && !$(".sc-skel-card") && !$("#scCalSkel:not(.hide)"); }, 8000); await sleep(ms || 350); };
var tab = async function (name, ms) { click('.ld-tab[data-tab="' + name + '"]'); await idle(ms); };
var VIEWS = { year: 1, month: 2, week: 3, day: 4 };
var openViewMenu = async function () { click('.sc-view-btn'); await sleep(250); };
var calView = async function (v, ms) { await openViewMenu(); click('.sc-view-menu .sc-view-item:nth-child(' + VIEWS[v] + ')'); await idle(ms); };
var nav = async function (which, ms) { click(which === 'prev' ? '#scPrevBtn' : which === 'next' ? '#scNextBtn' : '#scTodayBtn'); await idle(ms); };
var pickProduct = async function (id, ms) { click('.sc-product-btn'); await sleep(250); click('#scProdDd .sc-prod-dd-item[data-id="' + id + '"]'); await idle(ms || 700); };
var pickGroup = async function (i, ms) { click('#scGroupBtn'); await sleep(250); click('#scGroupDd .ld-dd-item:nth-child(' + i + ')'); await idle(ms || 700); };
var openFilter = async function (ms) { click('#scFilterBtn'); await sleep(ms || 500); };
var applyFilter = async function (ms) { click('#scHFApply'); await idle(ms || 700); };
var openDp = async function () { click('#scCalLabel'); await sleep(350); };
// a native drag & drop of a card onto a column: the events the page listens to (dragstart on the card, dragover / drop on the column)
var dnd = async function (card, col) {
  card = need(card); col = need(col);
  var dt = new DataTransfer();
  var mk = function (t) { return new DragEvent(t, { bubbles: true, cancelable: true, dataTransfer: dt }); };
  card.dispatchEvent(mk('dragstart')); await sleep(30);
  col.dispatchEvent(mk('dragover')); await sleep(30);
  col.dispatchEvent(mk('drop')); await sleep(30);
  card.dispatchEvent(mk('dragend'));
};
var hover = function (el, type) { need(el).dispatchEvent(new MouseEvent(type, { bubbles: true })); };
// the "+" of the board / the list opens the work modal without a customer: where = board | list, kind = appt | task
var addFrom = async function (where, kind, ms) {
  await tab(where, 500);
  click('#scAdd' + (kind === 'appt' ? 'Appt' : 'Task') + (where === 'board' ? 'Board' : 'List') + 'Btn');
  await sleep(ms || 500);
};
// the customer search of the work modal: open it, type (the page waits 1 s after the last key), choose the n-th result (the page listens to mousedown)
var pickCustomer = async function (q, nth) {
  click('#ld2AwCustBtn'); await sleep(500);
  await waitFor(function () { return $('#ld2AwCustItems .wm-cust-item'); }, 6000);
  if (q) { typeIn('#ld2AwCustSearch', q); await sleep(1700); await waitFor(function () { return !$('#ld2AwCustBody .wm-cust-empty') || /ไม่พบ|No /.test($('#ld2AwCustBody').textContent); }, 6000); }
  if (nth !== undefined) {
    var it = $$('#ld2AwCustItems .wm-cust-item')[nth];
    if (!it) throw new Error('no customer #' + nth);
    it.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }));
    await sleep(900);
  }
};
// fill the add form (the customer must be chosen first)
var fillWork = function (o) {
  if (o.date !== undefined) typeIn('#ld2AwDate', o.date);
  if (o.time !== undefined) typeIn('#ld2AwTime', o.time);
  if (o.subject !== undefined) typeIn('#ld2AwSubject', o.subject);
  if (o.detail !== undefined) typeIn('#ld2AwDetail', o.detail);
};
// the value of a field as the user cannot type it (the shell's input guard strips ~ and other special characters from what is typed): set without events
var setVal = function (sel, v) { need(sel).value = v; };
var evs = function (sel) { return $$(sel || '.sc-event').filter(function (e) { return e.offsetParent !== null; }); };
var scrollEl = async function (el, to, ms) { el = need(el); el.scrollTop = to === undefined ? el.scrollHeight : to; el.dispatchEvent(new Event('scroll')); await sleep(ms || 1200); };
// the page leaves for lead_detail (go to lead): record where (the Java address or the route) without leaving. The Angular page is replaced by
// the route it navigated to, so the dump of such a scenario is the address only (use roots: [])
var navs = [];
var watchNav = function (side) {
  window.navigation.addEventListener('navigate', function (e) {
    var u = new URL(e.destination.url); if (u.pathname === location.pathname && u.search === location.search) return;
    navs.push(e.destination.url.replace(location.origin, '')); if (side === 'java') e.preventDefault();
  });
  window.__extra = async function () { return ['NAV ' + navs.join(' | ')]; };
};
// alert() of the page (the board's "move failed"): collected instead of blocking the headless browser
var alerts = [];
window.alert = function (m) { alerts.push(String(m)); };
window.__extra = async function () {
  var out = [];
  document.querySelectorAll('.sc-root, #scFilterOverlay, #ld2ViewWorkOverlay, #ld2AddWorkOverlay').forEach(function (root) {
    root.querySelectorAll('input, select, textarea').forEach(function (el, i) {
      out.push('VAL ' + (el.id || el.name || el.tagName + i) + ' ' + el.type + ' = ' + (el.type === 'checkbox' ? el.checked : el.value) + (el.disabled ? ' disabled' : ''));
    });
  });
  ['.sc-cal-scroll', '.sc-list-scroll', '.sc-board'].forEach(function (sel) {
    document.querySelectorAll(sel).forEach(function (el, i) { if (el.scrollTop || el.scrollLeft) out.push('SCROLL ' + sel + '#' + i + ' ' + Math.round(el.scrollTop) + ',' + Math.round(el.scrollLeft)); });
  });
  out.push('ROWS appt=' + document.querySelectorAll('#scApptList tr:not(.sc-skel-row)').length + ' task=' + document.querySelectorAll('#scTaskList tr:not(.sc-skel-row)').length + ' board=' + document.querySelectorAll('#scApptBoard .sc-card').length + '/' + document.querySelectorAll('#scTaskBoard .sc-card').length);
  out.push('FLAGS ' + ['LD2_ROLE_SCHEDULE_CREATE', 'LD2_SUP_SCHEDULE_CREATE', 'LD2_CAN_SCHEDULE_CREATE', 'LD2_MY_EMPLOYEE_ID', 'LD2_CAN_SCHEDULE_VIEW', 'LD2_CAN_SCHEDULE_EDIT', 'LD2_CAN_VIEW_LEAD'].map(function (k) { return k + '=' + window[k]; }).join(' '));
  out.push('APPLIED ' + JSON.stringify(window.SC_APPLIED_FILTER || null));
  var lists = [];
  document.querySelectorAll('body > .ods-list').forEach(function (el) {
    var r = el.getBoundingClientRect();
    if (r.width > 0 || r.height > 0) lists.push('ODSLIST ' + el.className + ' ' + [r.x, r.y, r.width, r.height].map(function (n) { return Math.round(n * 10) / 10; }).join(',') + ' :: ' + el.innerText.replace(/\\s+/g, ' ').trim());
  });
  out.push.apply(out, lists.sort());
  if (alerts.length) out.push('ALERT ' + alerts.join(' | '));
  if (navs.length) out.push('NAV ' + navs.join(' | '));
  return out;
};
`,
  // where the port deliberately differs: the images of the Java web folder are public/assets/images/ ; the link to the lead page is its route
  normalize: (l) =>
    l
      .replace(/\.\.\/images\//g, 'assets/images/')
      // the "go to lead" link of the work modal: Java writes the page link, the port the route of it (core/navigation/java-links.ts)
      .replace(/\bhref=(lead_detail\.face\?\S*)/, (_m, u) => 'href=' + (javaLinkToRoute(u) ?? u)),

  /** builds the Java replica pages (th/en × permission set); returns {} — the pages are served by handle() */
  async build(ctx) {
    const { shell } = ctx;
    const defines = uiDefines(shell.read('pages/schedule.xhtml'), 'schedule.xhtml');
    const headRaw = defines['head'];
    // the work modal is included where Facelets includes it (ui:param page=schedule)
    const contentRaw = expandIncludes(defines['content'], shell.read, 'pages', 'schedule.xhtml');
    const en = ctx.readJson('public/assets/i18n/en.json');

    const render = (text, lang, denied) => {
      const bundle = lang === 'en' ? en : shell.th;
      const msg = (k) => {
        if (!(k in bundle)) throw new Error('no message ' + k);
        return bundle[k];
      };
      const allowed = (f) => !denied.includes(f);
      const out = text
        .split(/(<script\b[\s\S]*?<\/script>|<style\b[\s\S]*?<\/style>)/g)
        .map((seg, i) => {
          let s = seg;
          if (i % 2 === 0) s = facesToHtml(s.replace(/<!--[\s\S]*?-->/g, ''));
          return s
            .replace(/#\{commonBean\.msg\[(['"])([\w.]+)\1\]\}/g, (_m, _q, k) => msg(k))
            .replace(/#\{request\.contextPath\}/g, '/triplesale')
            .replace(/#\{commonBean\.hasFeature\('(\w+)'\)\}/g, (_m, f) => String(allowed(f)))
            .replace(/#\{commonBean\.ssEmployeeId\}/g, MY_EMPLOYEE_ID)
            .replace(/#\{not empty scheduleView\.savedFilterJson \? scheduleView\.savedFilterJson : 'null'\}/g, '__SAVED_FILTER__');
        })
        .join('');
      const code = out.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
      if (/#\{/.test(code)) throw new Error('EL left in the schedule page: ' + code.match(/.{0,40}#\{.{0,40}/)[0]);
      return out;
    };

    // the scripts template.xhtml loads for every page, with the texts of the language of the page (the replica's own list is Thai)
    const tailFor = (lang) => {
      const b = lang === 'en' ? en : shell.th;
      return shell
        .TEMPLATE_SCRIPTS()
        .replace(/window\.ODS_I18N = \{.*?\};<\/script>/s, () => {
          const o = { select: b['label.ods.select'], search: b['label.ods.search_ph'], noData: b['label.ods.no_data'], today: b['label.ods.today'], ok: b['label.ods.ok'], clear: b['label.ods.clear'], months: Array.from({ length: 12 }, (_, i) => b['label.month.' + (i + 1)]), dow: Array.from({ length: 7 }, (_, i) => b['label.dow.' + (i + 1)]) };
          return `window.ODS_I18N = ${JSON.stringify(o)};</script>`;
        })
        .replace(/window\.INPUT_GUARD_I18N = \{.*?\};/s, () => `window.INPUT_GUARD_I18N = { blocked: ${JSON.stringify(b['label.guard.special_char'])} };`);
    };

    const built = {};
    for (const lang of ['th', 'en']) {
      for (const [perm, denied] of Object.entries(PERMS)) {
        const name = `schedule-${lang}-${perm}.html`;
        built[`${lang}:${perm}`] = shell.build('home', '5', 'h-' + name, {
          // the page head sits where ui:insert name="head" is: right after project_root.css, before the template's own styles and dark_mode.css
          headEarly: render(headRaw, lang, denied),
          // ui_pref.js (TS_PREF) is loaded by template.xhtml in the head
          head: '<script src="/triplesale/resources/js/ui_pref.js?v=20260819a"></script>',
          content: render(contentRaw, lang, denied),
          tail: `<script>try { sessionStorage.setItem('ts_username', 'demo'); } catch (e) {}</script>\n${tailFor(lang)}`,
        });
      }
    }
    ctx.__schedulePages = built;
    return {};
  },

  /** a fresh backend for one scenario run (its own module instance: the mock keeps its state at module level) */
  async newState({ delay, hook, live }, ctx) {
    const mock = await ctx.loadTs(join(ctx.ngRoot, MOCK));
    mock.resetMockSchedule?.();
    // live = a --live run: `hook` is the switches of the mock (scenarios.mjs cfg()) as JSON — the Angular page of such a run is not told them by an
    // address, so the fake REST service plays them (see upstream())
    return { mock, backend: mock.createMockSchedule({ delayMs: 0 }), delay, config: undefined, seeded: false, hook: hook || '', live: !!live, hookDone: false };
  },

  /** the page itself and the BFF calls it makes; null = not mine */
  async handle(req, state, ctx) {
    const { readFileSync } = await import('node:fs');
    if (req.path === '/triplesale/pages/schedule.html') {
      const q = new URLSearchParams(req.search);
      const lang = q.get('l') === 'en' ? 'en' : 'th';
      const perm = ctx.__schedulePages[`${lang}:${q.get('p')}`] ? q.get('p') : 'all';
      const cfg = q.get('cfg') ? JSON.parse(q.get('cfg')) : undefined;
      // the switches of this request decide what the backend answers (the module keeps the state across requests)
      if (JSON.stringify(cfg) !== JSON.stringify(state.config)) {
        state.config = cfg;
        const keep = state.backend;
        state.backend = state.mock.createMockSchedule({ delayMs: 0, config: cfg });
        void keep;
      }
      // a page that opens with a state the HttpSession already holds: only the first time (the pages save their own state afterwards)
      if (q.get('state') && !state.seeded) {
        state.seeded = true;
        await state.backend.fetch('/board/schedule-filter-state', { method: 'POST', body: q.get('state') });
      }
      const saved = (await state.backend.initial()).savedFilterJson;
      const html = readFileSync(ctx.__schedulePages[`${lang}:${perm}`], 'utf8').replace('__SAVED_FILTER__', () => (saved == null ? 'null' : JSON.stringify(saved)));
      return { status: 200, headers: { 'content-type': 'text/html; charset=utf-8' }, body: Buffer.from(html, 'utf8') };
    }
    if (req.path.startsWith('/triplesale/board/')) {
      if (state.delay) await sleep(state.delay);
      const r = await state.backend.fetch(req.path.slice('/triplesale'.length) + req.search, { method: req.method, body: req.body, headers: { 'Content-Type': req.headers['content-type'] ?? '' } });
      let status = r.status;
      let body = Buffer.from(await r.arrayBuffer());
      let type = r.headers.get('content-type') ?? 'application/json';
      // --live: the failure switches of the mock (failCalendar / failBoard / failList / failProducts / failGroups) stand for "the REST service fails" and the mock plays
      // them as an HTTP 500 of the BFF. A real servlet never answered 500 for that: Data_API.sendGET gave "" for a service that does not answer 200 and the servlets
      // turned "" into a stand-in (ScheduleFetchServlet / MovementTypeServlet: the "no content" envelope, MasterActivityGroupsServlet: "{}"), HTTP 200. The replica
      // of a --live run answers what the real servlet answers to a failing service; the fake service of the Angular side fails with HTTP 500 (upstream()).
      if (state.live && status === 500) {
        const u = new URL(req.path + req.search, 'http://x');
        const path = u.pathname.slice('/triplesale'.length);
        const stand = {
          '/board/schedule/fetch': `{"status":204,"message":"no content","result":{"viewMode":"${u.searchParams.get('viewMode')}","items":[]}}`,
          '/board/master/movement-types': '{"status":204,"message":"no content","result":{"items":[]}}',
          '/board/master/activity-groups': '{}',
        }[path];
        if (stand !== undefined) {
          status = 200;
          body = Buffer.from(stand, 'utf8');
          type = 'application/json; charset=UTF-8';
        }
      }
      return { status, headers: { 'content-type': type }, body };
    }
    return null;
  },

  /**
   * The fake REST service of a --live run: the calls of triplesale-service that the LIVE backend of this page makes — GET /schedules (the servlet only
   * forwarded: the body of the service IS the BFF answer of the mock), the master data, POST /schedules / PATCH /schedules/{id} — answered from the SAME
   * mock the Java replica gets (schedule.mock.ts, its switches played from `state.hook`), the lists wrapped in the envelope of the service.
   * Also here: GET /leads (the customer search of the work modal) and GET /prospects + /prospects/{id}/quick-view (the suggestion card).
   */
  async upstream(req, state) {
    if (req.api !== 'service') return null;
    // the switches of the scenario (the Java page gets them in its address): once
    if (state.live && !state.hookDone) {
      state.hookDone = true;
      if (state.hook) {
        state.config = JSON.parse(state.hook);
        state.backend = state.mock.createMockSchedule({ delayMs: 0, config: state.config });
      }
    }
    const p = req.path;
    const q = new URLSearchParams(req.search);
    const wait = async () => { if (state.delay) await sleep(state.delay); };
    const asIs = (r) => r.text().then((body) => ({ status: r.status, body }));
    const bff = async (path, init = {}) => (await wait(), asIs(await state.backend.fetch(path, init)));
    const listOf = async (path) => {
      await wait();
      const r = await state.backend.fetch(path);
      return { status: r.status, body: { status: r.status, message: r.status === 200 ? 'success' : 'error', result: await r.json() } };
    };
    let m;
    // ---- the customer search of the work modal (LeadsBoardServlet → GET /leads) and the suggestion card of the search box (ProspectListService →
    // GET /prospects, then GET /prospects/{id}/quick-view of each row): answered from the SAME mock the Java replica runs, written the way the service
    // sends them (receipts/replica.mjs maps the rows the same way: phone → customerTel ('-' = none), the composed address in currentAddress, the picture
    // in attachFile; the quick-view brings the customer code)
    if (req.method === 'GET' && p === '/leads') {
      await wait();
      const r = await state.backend.fetch('/board/leads' + req.search);
      const text = await r.text();
      return r.status === 200 ? { status: 200, body: { status: 200, message: 'success', result: JSON.parse(text) } } : { status: r.status, body: text };
    }
    if (req.method === 'GET' && p === '/prospects') {
      await wait();
      const ask = new URLSearchParams({ page: q.get('page') ?? '1', perPage: q.get('perPage') ?? '8', searchText: q.get('searchText') ?? '' });
      const r = await state.backend.fetch('/board/prospect-list?' + ask);
      const text = await r.text();
      if (r.status !== 200) return { status: r.status, body: text };
      const { result } = JSON.parse(text);
      const rows = result.items.map((it) => ({ id: it.id, name: it.name, code: it.code, customerTel: it.phone === '-' ? '' : it.phone, currentAddress: it.addr, attachFile: it.avatar }));
      return { status: 200, body: { status: 200, message: 'success', result: rows, meta: result.meta } };
    }
    if (req.method === 'GET' && (m = /^\/prospects\/(\d+)\/quick-view$/.exec(p))) {
      // (one call per row, one after the other: the latency was paid by the list)
      const r = await state.backend.fetch('/board/prospect-list?page=1&perPage=1000');
      const item = JSON.parse(await r.text()).result.items.find((it) => String(it.id) === m[1]);
      return item ? { status: 200, body: { status: 200, message: 'success', result: { code: item.code } } } : { status: 404, body: { status: 404, message: 'not found' } };
    }
    if (req.method === 'GET' && p === '/schedules') return bff('/board/schedule/fetch' + req.search);
    if (req.method === 'POST' && p === '/schedules') {
      const r = await bff('/board/schedule/add', { method: 'POST', body: JSON.stringify(req.body) });
      // the service answers HTTP 201 for what the servlet showed as 200 (the status of the envelope decides what the servlet passes on)
      const env = JSON.parse(r.body);
      return { status: env.status ?? r.status, body: r.body };
    }
    if (req.method === 'PATCH' && (m = /^\/schedules\/(\d+)$/.exec(p))) return bff('/board/schedule/edit', { method: 'PATCH', body: JSON.stringify({ ...req.body, id: Number(m[1]) }) });
    if (req.method === 'GET' && p === '/master-data/movement-types/LD') return bff('/board/master/movement-types?type=LD');
    if (req.method === 'GET' && p === '/master-data/activity-groups') return bff('/board/master/activity-groups?movementTypeId=' + encodeURIComponent(q.get('movementTypeId') ?? ''));
    if (req.method === 'GET' && p === '/master-data/employees/by-activity-group') return bff('/board/master/employees-by-activity-group?activityGroupId=' + encodeURIComponent(q.get('activityGroupId') ?? ''));
    if (req.method === 'GET' && p === '/master-data/sale-groups') return listOf('/board/sale-groups');
    if (req.method === 'GET' && p === '/master-data/employees') return listOf('/board/employees' + (q.get('saleGroupId') ? '?saleGroupId=' + encodeURIComponent(q.get('saleGroupId')) : ''));
    if (req.method === 'GET' && (m = /^\/leads\/(\d+)$/.exec(p))) {
      // the lead of the work modal's customer search: the BFF answers the `result` of the lead itself, the service wraps it
      const r = await bff('/board/lead?id=' + m[1] + (q.get('activityGroupId') ? '&activityGroupId=' + encodeURIComponent(q.get('activityGroupId')) : ''));
      return r.status === 200 ? { status: 200, body: { status: 200, message: 'success', result: JSON.parse(r.body) } } : r;
    }
    return null;
  },
};
