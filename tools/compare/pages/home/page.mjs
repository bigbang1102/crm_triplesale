// Comparison setup of the CRM home page (/crm/home) — see tools/compare/README.md for the interface of a page.
//
// Java side: the REAL page — the <style> of the head of index.xhtml, its markup, its three inline scripts and the three scripts it loads
// (phone_format.js, step_group_color.js and the real resources/js/dashboard.js, served from the Java project), with work_modal.xhtml included
// where Facelets includes it (ui:param page=dashboard), EL resolved the way the server would (messages of the bundle, context path, the
// permission flags, the signed-in employee) — inside the shell replica. Its BFF calls (/triplesale/dashboardapi, /triplesale/board/…) are
// answered by the SAME mock the Angular page runs (home.mock.ts).
//
// Variants: the page is built for several permission sets (`opts.denyRoles` of a scenario → the roles the Angular session lacks, and the
// `hasFeature` of the Java page + the role check of /board/leads in the mock) and for both languages; `opts.mock` = the mock-only switches
// (home.mock.ts MockHomeConfig; the Angular side reads them from sessionStorage `ts.mock.home.config`, `cfg()` of the scenarios sets both).
import { join } from 'node:path';
import { javaLinkToRoute } from '../../../../src/app/core/navigation/java-links.ts'; // (Node strips the types)
import { expandIncludes, facesToHtml, uiDefines } from '../../../lib/port-kit.mjs';

const MOCK = 'src/app/features/home/home.mock.ts';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
/** Java: commonBean.ssEmployeeId of the mock sign-in ("demo", mock-backend.interceptor.ts: employeeId 1001 = E101) */
const MY_EMPLOYEE_ID = '1001';

/** <ui:fragment rendered="#{commonBean.hasFeature('X')}"> … </ui:fragment> (nested): kept or dropped, as Facelets does */
function fragments(html, allowed) {
  const re = /<ui:fragment\b[^>]*>|<\/ui:fragment>/g;
  let out = '';
  let last = 0;
  const stack = []; // each: { keep }
  let m;
  const keepAll = () => stack.every((s) => s.keep);
  while ((m = re.exec(html))) {
    if (keepAll()) out += html.slice(last, m.index);
    last = m.index + m[0].length;
    if (m[0].startsWith('</')) stack.pop();
    else {
      const f = /rendered="#\{commonBean\.hasFeature\('(\w+)'\)\}"/.exec(m[0]);
      if (!f) throw new Error('unknown ui:fragment condition: ' + m[0]);
      stack.push({ keep: allowed(f[1]) });
    }
  }
  if (keepAll()) out += html.slice(last);
  if (stack.length) throw new Error('unbalanced <ui:fragment>');
  return out;
}

export default {
  name: 'home',
  // the page, the assign dialog (moved into <body> by the page), the work modal and the SweetAlert dialogs / toasts
  roots: ['.ts-root', '#tsAssignOverlay', '#ld2ViewWorkOverlay', '#ld2AddWorkOverlay', '#wmSuccessOverlay', '.swal-overlay'],
  // the first page of the table (or the empty / error row) has been drawn: the skeleton rows are gone
  ready: `document.querySelector('.ts-root #tsStatsRow .ts-stat') && document.querySelector('#tsOppsBody tr') && !document.querySelector('#tsOppsBody .ts-opps-skel-row')`,
  javaPath: (lang, opts) =>
    `/triplesale/pages/index.html?l=${lang}` + (opts.denyRoles?.length ? '&deny=' + opts.denyRoles.join(',') : '') + (opts.mock ? '&cfg=' + encodeURIComponent(JSON.stringify(opts.mock)) : ''),
  ngPath: () => '/crm/home',
  latencyMs: 150,
  // helpers of this page's scenarios + the form values every dump ends with (the dump compares attributes, not the values of controls)
  pre: `
var PRODUCTS = { house: '1004400740', car: '1004400741', adviser: '1004400742', empty: '1004400743' };
var rows = function () { return $$('#tsOppsBody tr[data-leadid]'); };
var scroller = function () { return $('.ts-opps-scroll'); };
var settled = async function (ms) { await sleep(ms || 900); };
// the first page of the table is there (or the empty / error row): the skeleton is gone
var tableUp = async function (ms) { await waitFor(function () { return !$('#tsOppsBody .ts-opps-skel-row') && $('#tsOppsBody tr'); }, ms || 8000); await sleep(300); };
var pickProduct = async function (id, ms) { click('#tsProductBtn'); await sleep(150); click('#tsProdDd .ts-prod-dd-item[data-mt="' + id + '"]'); await sleep(ms || 1500); await tableUp(); };
var scrollTable = async function (px, ms) { var s = scroller(); s.scrollTop = px === undefined ? s.scrollHeight : px; s.dispatchEvent(new Event('scroll')); await sleep(ms || 1000); };
var setRange = async function (from, to, ms) {
  if (from !== null && from !== undefined) { var f = $('#tsDateFrom'); f.value = from; f.dispatchEvent(new Event('change', { bubbles: true })); }
  if (to !== null && to !== undefined) { var t = $('#tsDateTo'); t.value = to; t.dispatchEvent(new Event('change', { bubbles: true })); }
  await sleep(ms || 1500); await tableUp();
};
var calBtn = function (i) { return $$('.ts-cal-nav .ts-cal-btn')[i]; };
var dayCells = function () { return $$('#tsCalBody .ts-cal-cell:not(.c-out)'); };
var openAssign = async function (i) { click($$('#tsOppsBody .ts-assign-btn')[i || 0]); await sleep(900); };
var csOpen = async function (id) { var sel = $('#' + id); var wrap = sel.nextSibling; click(wrap.querySelector('.ts-cs-btn')); await sleep(250); return wrap; };
var csPick = async function (id, value, ms) { var wrap = await csOpen(id); click(wrap.querySelector('.ts-cs-item[data-v="' + value + '"]')); await sleep(ms || 700); };
// the first real choice of a dropdown (the lists of a lead whose team is known only hold the people of that team)
var csPickAny = async function (id, ms) { var wrap = await csOpen(id); click($$('.ts-cs-item', wrap).filter(function (i) { return i.getAttribute('data-v') !== ''; })[0]); await sleep(ms || 700); };
var lastAssign = function () { return $$('#tsOppsBody .ts-assign-btn').length - 1; };
var md = function (el) { need(el).dispatchEvent(new MouseEvent('mousedown', { bubbles: true })); };
var openWmAppt = async function () { click('#tsComboAddBtn'); await sleep(500); };
var openWmTask = async function () { click('#tsTaskAddBtn'); await sleep(500); };
// the navigation the page asks for (location.href = … on the Java side, router.navigateByUrl on the Angular side), written into the dump
var captureNav = function (side) {
  window.__navs = [];
  if (window.navigation) navigation.addEventListener('navigate', function (e) { var u = e.destination.url.replace(location.origin, ''); if (u === location.pathname + location.search) return; window.__navs.push(u); if (side === 'java') e.preventDefault(); });
};
window.__extra = async function () {
  var out = [];
  document.querySelectorAll('.ts-root, #tsAssignOverlay, #ld2ViewWorkOverlay, #ld2AddWorkOverlay').forEach(function (root) {
    root.querySelectorAll('input, select, textarea').forEach(function (el, i) {
      out.push('VAL ' + (el.id || el.name || el.tagName + i) + ' ' + el.type + ' = ' + (el.type === 'checkbox' ? el.checked : el.value) + (el.disabled ? ' disabled' : ''));
    });
  });
  var sc = document.querySelector('.ts-opps-scroll');
  if (sc) out.push('SCROLL ' + Math.round(sc.scrollTop) + ',' + Math.round(sc.scrollLeft) + ' rows=' + document.querySelectorAll('#tsOppsBody tr[data-leadid]').length);
  try { out.push('PREF ' + ['ts_dash_selected_mt', 'ts_dash_selected_wf', 'ts_dash_selected_name'].map(function (k) { return k + '=' + localStorage.getItem(k); }).join(' ')); } catch (e) { /* storage blocked */ }
  out.push('FLAGS ' + ['LD2_ROLE_SCHEDULE_CREATE', 'LD2_SUP_SCHEDULE_CREATE', 'LD2_CAN_SCHEDULE_CREATE', 'LD2_MY_EMPLOYEE_ID', 'LD2_CAN_SCHEDULE_VIEW', 'LD2_CAN_SCHEDULE_EDIT'].map(function (k) { return k + '=' + window[k]; }).join(' '));
  out.push('I18N ' + (window.TS_I18N ? Object.keys(window.TS_I18N).length + ' ' + window.TS_I18N.assign + ' / ' + window.TS_I18N.months[9] : 'none'));
  var lists = [];
  document.querySelectorAll('body > .ods-list').forEach(function (el) {
    var r = el.getBoundingClientRect();
    if (r.width > 0 || r.height > 0) lists.push('ODSLIST ' + el.className + ' ' + [r.x, r.y, r.width, r.height].map(function (n) { return Math.round(n * 10) / 10; }).join(',') + ' :: ' + el.innerText.replace(/\\s+/g, ' ').trim());
  });
  out.push.apply(out, lists.sort());
  if (window.__navs) out.push('NAV ' + window.__navs.join(' | '));
  if (window.__log) out.push('LOG ' + window.__log.join(' | '));
  return out;
};
`,
  // where the port deliberately differs: the images of the Java web folder are public/assets/images/ (the relative addresses the page script writes
  // into its HTML strings); the "go to lead" link of the work modal is written as the route of it
  normalize: (l) =>
    l
      .replace(/\.\.\/images\//g, 'assets/images/')
      .replace(/\bhref=(lead_detail\.face\?\S*)/, (_m, u) => 'href=' + (javaLinkToRoute(u) ?? u)),

  /** builds the Java replica pages lazily (see handle()); returns {} */
  async build(ctx) {
    const { shell } = ctx;
    const defines = uiDefines(shell.read('pages/index.xhtml'), 'index.xhtml');
    ctx.__home = {
      headRaw: defines['head'],
      // the work modal is included where Facelets includes it (ui:param page=dashboard)
      contentRaw: expandIncludes(defines['content'], shell.read, 'pages', 'index.xhtml'),
      built: new Map(),
    };
    return {};
  },

  /** the Java page for a language and a permission set (EL resolved the way the server does it) */
  javaPage(ctx, lang, denied) {
    const key = lang + ':' + [...denied].sort().join(',');
    const home = ctx.__home;
    if (home.built.has(key)) return home.built.get(key);
    const { shell } = ctx;
    const en = ctx.readJson('public/assets/i18n/en.json');
    const bundle = lang === 'en' ? en : shell.th;
    const msg = (k) => {
      if (!(k in bundle)) throw new Error('no message ' + k);
      return bundle[k];
    };
    const allowed = (f) => !denied.includes(f);
    const render = (text) =>
      text
        .split(/(<script\b[\s\S]*?<\/script>|<style\b[\s\S]*?<\/style>)/g)
        .map((seg, i) => {
          let s = seg;
          if (i % 2 === 0) s = facesToHtml(fragments(s.replace(/<!--[\s\S]*?-->/g, ''), allowed));
          return s
            .replace(/#\{commonBean\.msg\[(['"])([\w.]+)\1\]\}/g, (_m, _q, k) => msg(k))
            .replace(/#\{request\.contextPath\}/g, '/triplesale')
            .replace(/#\{commonBean\.hasFeature\('(\w+)'\)\}/g, (_m, f) => String(allowed(f)))
            .replace(/#\{commonBean\.ssEmployeeId\}/g, MY_EMPLOYEE_ID);
        })
        .join('');
    const content = render(home.contentRaw);
    const code = content.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
    if (/#\{/.test(code)) throw new Error('EL left in the home page: ' + code.match(/.{0,40}#\{.{0,40}/)[0]);
    // the scripts template.xhtml loads for every page, with the texts of the language of the page (the replica's own list is Thai)
    const tail = shell
      .TEMPLATE_SCRIPTS()
      .replace(/window\.ODS_I18N = \{.*?\};<\/script>/s, () => {
        const o = { select: bundle['label.ods.select'], search: bundle['label.ods.search_ph'], noData: bundle['label.ods.no_data'], today: bundle['label.ods.today'], ok: bundle['label.ods.ok'], clear: bundle['label.ods.clear'], months: Array.from({ length: 12 }, (_, i) => bundle['label.month.' + (i + 1)]), dow: Array.from({ length: 7 }, (_, i) => bundle['label.dow.' + (i + 1)]) };
        return `window.ODS_I18N = ${JSON.stringify(o)};</script>`;
      })
      .replace(/window\.INPUT_GUARD_I18N = \{.*?\};/s, () => `window.INPUT_GUARD_I18N = { blocked: ${JSON.stringify(bundle['label.guard.special_char'])} };`);
    const file = shell.build('home', '1', `h-home-${lang}-${denied.length}-${home.built.size}.html`, {
      // the page head sits where ui:insert name="head" is: right after project_root.css, before the template's own styles and dark_mode.css
      headEarly: render(home.headRaw),
      // ui_pref.js (TS_PREF) is loaded by template.xhtml in the head
      head: '<script src="/triplesale/resources/js/ui_pref.js?v=20260819a"></script>',
      content,
      tail: `<script>try { sessionStorage.setItem('ts_username', 'demo'); } catch (e) {}</script>\n${tail}`,
    });
    home.built.set(key, file);
    return file;
  },

  /**
   * a fresh backend for one scenario run (its own module instance: the mock keeps its state at module level);
   * live = a --live run: `hook` is the switches of the mock (scenarios.mjs cfg()) as JSON — the Angular page of such a run is not told them by an
   * address or by the storage of its tab (its live backend asks a REST service), so the fake service plays them (see upstream())
   */
  async newState({ delay, hook, live }, ctx) {
    const mock = await ctx.loadTs(join(ctx.ngRoot, MOCK));
    mock.resetMockHome?.();
    return { mock, backend: mock.createMockHome({ delayMs: 0 }), delay, hook: hook || '', live: !!live };
  },

  /** the page itself and the BFF calls it makes; null = not mine */
  async handle(req, state, ctx) {
    const { readFileSync } = await import('node:fs');
    if (req.path === '/triplesale/pages/index.html') {
      const q = new URLSearchParams(req.search);
      const lang = q.get('l') === 'en' ? 'en' : 'th';
      const denied = (q.get('deny') ?? '').split(',').filter(Boolean);
      const cfg = q.get('cfg') ? JSON.parse(q.get('cfg')) : undefined;
      // the account / switches of this request decide what the backend answers (the module keeps the data across requests and page loads)
      state.backend = state.mock.createMockHome({ delayMs: 0, can: (f) => !denied.includes(f), config: cfg });
      const html = readFileSync(this.javaPage(ctx, lang, denied), 'utf8');
      return { status: 200, headers: { 'content-type': 'text/html; charset=utf-8' }, body: Buffer.from(html, 'utf8') };
    }
    if (req.path === '/triplesale/dashboardapi' || req.path.startsWith('/triplesale/board/')) {
      if (state.delay) await sleep(state.delay);
      const path = req.path.slice('/triplesale'.length);
      const r = await state.backend.fetch(path + req.search, { method: req.method, body: req.body, headers: { 'Content-Type': req.headers['content-type'] ?? '' } });
      let status = r.status;
      let body = Buffer.from(await r.arrayBuffer());
      let type = r.headers.get('content-type') ?? 'application/json';
      // --live: the failure switches of the mock (failSummary / failSchedules / failProducts / failLeads / failLeadsOnce, the search "~500") stand for "the REST service
      // fails", and the mock plays them as an HTTP 500 of the BFF. A real servlet never answered 500 for that (it answers 500 only for an exception inside itself):
      // Data_API.sendGET gave "" for a service that does not answer 200 and the servlets turned "" into a stand-in, HTTP 200 —
      //   /dashboardapi (DashboardApiService.safeJson)  → {"status":502,"message":"backend ไม่ตอบหรือ response ไม่ใช่ JSON"}
      //   /board/leads (LeadBoardView.fetchLeadsJson)   → []          /board/movement-types (fetchMovementTypesJson) → []
      //   /board/master/activity-groups (a 404 of the service) → {}
      // The replica of a --live run answers what the real servlet answers to a failing service; the fake service of the Angular side fails with the same HTTP status (upstream()).
      if (state.live) {
        const stand =
          path === '/dashboardapi' && status === 500 ? '{"status":502,"message":"backend ไม่ตอบหรือ response ไม่ใช่ JSON"}'
          : (path === '/board/leads' || path === '/board/movement-types') && status === 500 ? '[]'
          : path === '/board/master/activity-groups' && status === 404 ? '{}'
          : undefined;
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
   * The fake REST service of a --live run: the calls of triplesale-service that the LIVE backend of this page makes (home.live.ts = core/live/dashboard-api.live.ts,
   * board-master.live.ts, lead-core.live.ts, leads.live.ts), in the shape the Java code consumed them — the envelope `{status, message, result}` of the service, NOT the
   * shape of the BFF — answered from the SAME mock the Java replica gets (home.mock.ts): the data of the replica is the data of the service, the switches of the
   * scenario (`state.hook` = MockHomeConfig as JSON) play the failures. What the page shows can only equal the replica's if the live backend did what the servlets did.
   *
   *   GET  /dashboard                              summary: stats, stepSummary, items (the mock's `result` as it is)
   *   GET  /dashboard/schedules                    list | year (marks) | day (items)
   *   GET  /prospects?page=1&pageSize=500          the pictures DashboardApiService.enrichOpportunityImages fills in: [{name, attachFile}] (no waiting: the replica's one hop
   *                                                of the BFF already covers the servlet's second call to the service)
   *   GET  /leads?viewMode=list&…                  the `result` object of the lead list (statusSummary, wfStepSummary, leads{items, meta}); 500 when the mock fails it
   *   GET  /leads/{id}                             the `result` of one lead; its error answers keep their status
   *   GET  /master-data/movement-types/LD          result = the array of products
   *   GET  /master-data/{sale-groups,sale-persons,employees}   result = rows with fields the page never reads (createdAt, isActive)
   *   GET  /master-data/activity-groups · employees/by-activity-group     the envelope of the mock as it is (status 404 for an unknown product)
   *   GET  /master-data/countries                  the phone masks of the shell (TsPhone)
   *   PATCH /leads/assign                          the body of the page; the answer of the mock whatever its status
   *   POST /schedules · PATCH /schedules/{id}      what the work modal writes — the body must already be what AddScheduleServlet / EditScheduleServlet send
   *                                                (procedureGroupId instead of activityGroupId, no movementTypeId; no id / leadId in an edit): a service that gets the
   *                                                modal's own field names refuses with 400, so a live backend that forgot the rewrite shows the error in the modal
   * What this fake ASSUMES about the real service (from the Java code, not from real data) is listed in INTEGRATION.md.
   */
  async upstream(req, state) {
    if (req.api !== 'service') return null;
    // the REST service has no permissions of the page (the live backend checks CRM_Lead_View itself): the mock answers as a user who may do everything
    state.rest ??= state.mock.createMockHome({ delayMs: 0, can: () => true, config: hookConfig(state.hook) });
    // the pictures of GET /prospects: a mock of its own, without the delays of the scenario
    state.pictures ??= state.mock.createMockHome({ delayMs: 0, can: () => true, config: { leadsExtraMs: 0 } });
    const p = req.path;
    const q = req.search ?? '';
    const tail = q ? '&' + q.slice(1) : ''; // (the query of the REST call, on the BFF address that has an action= already)
    const wait = async () => { if (state.delay) await sleep(state.delay); };
    const bff = async (url, init) => {
      const r = await state.rest.fetch(url, init);
      return { status: r.status, text: await r.text() };
    };
    const envelope = (result) => ({ status: 200, body: { status: 200, message: 'success', result } });
    const failing = (r) => ({ status: r.status, body: { status: r.status, message: r.status === 404 ? 'Not Found' : 'Internal Server Error', error: { code: r.status, message: r.status === 404 ? 'Not Found' : 'Internal Server Error' } } });
    let m;

    if (req.method === 'GET' && p === '/prospects') {
      // (a customer without a picture is not in the list: DashboardApiService only takes the pictures)
      const r = JSON.parse((await (await state.pictures.fetch('../board/leads?viewMode=list&showClosed=false&page=1&perPage=500')).text()) || '[]');
      const rows = (r.leads?.items ?? []).filter((it) => it.prospectAvatar).map((it) => ({ id: it.prospectId, name: it.prospectName, customerTel: it.prospectTel, attachFile: it.prospectAvatar }));
      return envelope(rows);
    }
    if (req.method === 'GET' && p === '/dashboard') {
      await wait();
      const r = await bff('../dashboardapi?action=summary' + tail);
      return { status: r.status, body: r.text };
    }
    if (req.method === 'GET' && p === '/dashboard/schedules') {
      await wait();
      const r = await bff('../dashboardapi?action=schedules' + tail);
      return { status: r.status, body: r.text };
    }
    if (req.method === 'GET' && p === '/leads') {
      await wait();
      const r = await bff('../board/leads' + q);
      return r.status === 200 ? envelope(JSON.parse(r.text)) : failing(r);
    }
    if (req.method === 'GET' && (m = /^\/leads\/(\d+)$/.exec(p))) {
      await wait();
      const r = await bff('../board/lead?id=' + m[1] + (q ? '&' + q.slice(1) : ''));
      // the mock's error answers are in the shape of the service already ({status, message, error:{code, message}})
      return r.status === 200 ? envelope(JSON.parse(r.text)) : { status: r.status, body: r.text };
    }
    if (req.method === 'PATCH' && p === '/leads/assign') {
      await wait();
      const r = await bff('../board/lead-assign', { method: 'POST', body: typeof req.body === 'string' ? req.body : JSON.stringify(req.body) });
      return { status: r.status, body: r.text };
    }
    if (req.method === 'POST' && p === '/schedules') {
      await wait();
      const b = req.body && typeof req.body === 'object' ? req.body : {};
      const bad = ['movementTypeId', 'activityGroupId'].filter((k) => k in b);
      if (bad.length) return { status: 400, body: { status: 400, message: 'unknown field', error: { code: 400, message: `${bad.join(', ')} is not a field of POST /schedules (procedureGroupId is)` } } };
      const r = await bff('../board/schedule/add', { method: 'POST', body: JSON.stringify(b) });
      // the service answers HTTP 201 for what the servlet showed as 200 (the status of the envelope decides what the servlet passes on)
      const env = JSON.parse(r.text);
      return { status: env.status ?? r.status, body: r.text };
    }
    if (req.method === 'PATCH' && (m = /^\/schedules\/(\d+)$/.exec(p))) {
      await wait();
      const b = req.body && typeof req.body === 'object' ? req.body : {};
      const bad = ['id', 'leadId'].filter((k) => k in b);
      if (bad.length) return { status: 400, body: { status: 400, message: 'unknown field', error: { code: 400, message: `${bad.join(', ')} is not a field of PATCH /schedules/{id}` } } };
      const r = await bff('../board/schedule/edit', { method: 'PATCH', body: JSON.stringify({ ...b, id: Number(m[1]) }) });
      return { status: r.status, body: r.text };
    }
    if (req.method !== 'GET') return null;

    // master data
    if (p === '/master-data/movement-types/LD') {
      await wait();
      const r = await bff('../board/movement-types');
      return r.status === 200 ? envelope(JSON.parse(r.text)) : failing(r);
    }
    const lists = { '/master-data/sale-groups': '../board/sale-groups', '/master-data/sale-persons': '../board/sale-persons', '/master-data/employees': '../board/employees' };
    if (lists[p]) {
      await wait();
      const r = await bff(lists[p] + q);
      return r.status === 200 ? envelope(JSON.parse(r.text).map((row) => ({ ...row, createdAt: '2026-01-01T00:00:00', isActive: true }))) : failing(r);
    }
    if (p === '/master-data/activity-groups') {
      await wait();
      const r = await bff('../board/master/activity-groups' + q);
      return { status: r.status, body: r.text };
    }
    if (p === '/master-data/employees/by-activity-group') {
      await wait();
      const r = await bff('../board/master/employees-by-activity-group' + q);
      return { status: r.status, body: r.text };
    }
    // the countries of the phone masks (TsPhone): the shell asks ChatMasterDataServlet's data from the service (core/dom/phone-format.service.ts)
    if (p === '/master-data/countries') {
      const r = await bff('../board/chat-master-data?type=countries');
      return { status: r.status, body: r.text };
    }
    return null;
  },
};

/** the switches of the scenario (opts.live.hook of a --live scenario is MockHomeConfig as JSON) */
function hookConfig(hook) {
  try {
    return hook && hook.startsWith('{') ? JSON.parse(hook) : {};
  } catch {
    return {};
  }
}
