// Comparison setup of the Activities page (/crm/activities) — see tools/compare/README.md for the interface of a page.
//
// Java side: the REAL page — the <style> + drag_scroll of the head of activity.xhtml, its markup and both scripts, with work_modal.xhtml
// included where Facelets includes it (ui:param page=activity), EL resolved the way the server would (messages of the bundle, context
// path, the permission flags, the signed-in employee) — inside the shell replica. Its BFF calls (/triplesale/board/…) are answered by
// the SAME mock the Angular page runs (activities.mock.ts).
//
// Variants: the page is built for several permission sets (`opts.perm` of a scenario → `denyRoles` of the Angular session and the
// `hasFeature` of the Java page) and for both languages.
import { join } from 'node:path';
import { javaLinkToRoute } from '../../../../src/app/core/navigation/java-links.ts'; // (Node strips the types)
import { expandIncludes, facesToHtml, uiDefines } from '../../../lib/port-kit.mjs';

const MOCK = 'src/app/features/activities/activities.mock.ts';
/** Java: commonBean.ssEmployeeId of the mock sign-in ("demo", mock-backend.interceptor.ts: employeeId 1001 = E101) */
const MY_EMPLOYEE_ID = '1001';

/** the permission sets: key → the features the user LACKS */
export const PERMS = {
  all: [],
  noedit: ['CRM_Schedule_Edit'],
  noadd: ['CRM_ContactActivity_Create', 'CRM_Schedule_Create'],
  nosched: ['CRM_Schedule_View'],
  nohist: ['CRM_ContactActivity_View'],
  nosup: ['CRM_Schedule_Create_Sup'],
  nosupedit: ['CRM_Schedule_Create_Sup', 'CRM_Schedule_Edit'],
};

/** <ui:fragment rendered="#{commonBean.hasFeature('X')}"> … </ui:fragment> (nested): kept or dropped, as Facelets does */
function fragments(html, allowed) {
  const re = /<ui:fragment\b[^>]*>|<\/ui:fragment>/g;
  let out = '';
  let last = 0;
  const stack = []; // each: { keep, start }
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
  name: 'activities',
  // the page, the dialogs (siblings of .ac-root), the work modal and the SweetAlert dialogs (the lists of the system dropdowns are in <body>,
  // created in another order by the two shells: __extra writes the open ones, sorted)
  roots: ['.ac-root', '#acFilterOverlay', '#acContactOverlay', '#acItemOverlay', '#ld2ViewWorkOverlay', '#ld2AddWorkOverlay', '#wmSuccessOverlay', '.swal-overlay'],
  // the first page of the table (or the empty / error row) and the statistics have been drawn
  ready: `document.querySelector('.ac-root #acStatsRow .ac-stat-item') && document.querySelector('#acBody0 tr') && !document.querySelector('#acMoreLoading.show')`,
  javaPath: (lang, opts) => `/triplesale/pages/activity${opts.perm && opts.perm !== 'all' ? '-' + opts.perm : ''}${lang === 'en' ? '-en' : ''}.html`,
  ngPath: () => '/crm/activities',
  latencyMs: 150,
  // helpers of this page's scenarios + the form values every dump ends with (the dump compares attributes, not the values of controls)
  pre: `
var PRODUCTS = { house: '1004400740', car: '1004400741', adviser: '1004400742', empty: '1004400743', forbidden: '1004400744' };
var tableRows = function () { return $$('#acBody0 tr.p-row, #acBody1 tr.p-row, #acBodyB tr.p-row'); };
var pickProduct = async function (id, ms) { click('#acProdDd .ac-prod-dd-item[data-mt="' + id + '"]'); await sleep(ms || 1800); };
// the work modal as the Schedule page opens it: a search box for the customer instead of a fixed lead (ctx.customerSearch)
var customerMode = function () {
  window.wmSetLeadContext({ leadRef: null, tasksRef: [], apptsRef: [], usesWfStep: true, customerSearch: true, getCreateParams: function () { return { movementTypeId: 1004400740, activityGroupId: 0 }; } });
  window.wmOpenAdd('appt', null, true);
};
// the work modal opened to look at an item with the link to the lead page (the calendar of the Schedule page does that)
var viewWithGoLead = function () {
  window.wmOpenView('task', { id: 5, title: 'งานจากปฏิทิน', detail: 'รายละเอียด', date: '2026-10-25', time_raw: '10:00', status: 'doing', activityGroupId: 102 }, { leadId: 43, customer_name: 'ปรียา ใจดี', team: 'ทีม B', owner_name: 'ธนากร เจริญผล', movement_type_name: 'วิเคราะห์สินเชื่อ', current_step: 'วิเคราะห์ความเสี่ยง', procedureGroupId: 102 }, true, true);
};
var openProductMenu = async function () { click('.ac-product-btn'); await sleep(250); };
var subtab = async function (i, ms) { click('.ac-subtab[data-subtab="' + i + '"]'); await sleep(ms || 500); };
var openFilter = async function () { click('#acFilterBtn'); await sleep(900); };
var waitList = async function (ms) { await sleep(150); await waitFor(function () { return !$('#acMoreLoading.show') && $('#acBody0 tr'); }, ms || 8000); await sleep(400); };
// click the row of a lead of the house list, loading further pages until it is there
var clickLead = async function (id) {
  for (var i = 0; i < 8; i++) {
    var r = $('#acBody0 tr.p-row[data-id="' + id + '"]');
    if (r) { click(r); await sleep(900); return true; }
    await scrollTable(undefined, 1100);
  }
  throw new Error('lead ' + id + ' is not in the list');
};
var scrollTable = async function (px, ms) { var s = $('.ac-table-scroll'); s.scrollTop = px === undefined ? s.scrollHeight : px; s.dispatchEvent(new Event('scroll')); await sleep(ms || 1200); };
// the navigation the page asks for (location.href = … on the Java side, router.navigateByUrl on the Angular side), written into the dump
var captureNav = function (side) {
  window.__navs = [];
  if (window.navigation) navigation.addEventListener('navigate', function (e) { window.__navs.push(e.destination.url.replace(location.origin, '')); if (side === 'java') e.preventDefault(); });
  // the Angular page is replaced by the route it navigated to: the dump of this scenario is the address only
  window.__extra = async function () { return ['NAV ' + window.__navs.join(' | ')]; };
};
window.__extra = async function () {
  var out = [];
  document.querySelectorAll('.ac-root, #acFilterOverlay, #acContactOverlay, #acItemOverlay, #ld2ViewWorkOverlay, #ld2AddWorkOverlay').forEach(function (root) {
    root.querySelectorAll('input, select, textarea').forEach(function (el, i) {
      out.push('VAL ' + (el.id || el.name || el.tagName + i) + ' ' + el.type + ' = ' + (el.type === 'checkbox' ? el.checked : el.value) + (el.disabled ? ' disabled' : ''));
    });
  });
  var sc = document.querySelector('.ac-table-scroll');
  if (sc) out.push('SCROLL ' + Math.round(sc.scrollTop) + ',' + Math.round(sc.scrollLeft) + ' rows=' + document.querySelectorAll('#acBody0 tr.p-row').length + '/' + document.querySelectorAll('#acBody1 tr').length + '/' + document.querySelectorAll('#acBodyB tr').length);
  try { out.push('PREF ' + localStorage.getItem('ts_activity_selected_mt')); } catch (e) { /* storage blocked */ }
  out.push('FLAGS ' + ['LD2_ROLE_SCHEDULE_CREATE', 'LD2_SUP_SCHEDULE_CREATE', 'LD2_CAN_SCHEDULE_CREATE', 'LD2_MY_EMPLOYEE_ID', 'LD2_CAN_SCHEDULE_VIEW', 'LD2_CAN_SCHEDULE_EDIT'].map(function (k) { return k + '=' + window[k]; }).join(' '));
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
  // where the port deliberately differs: the images of the Java web folder are public/assets/images/ ; a new contact starts "now"
  normalize: (l) =>
    l
      .replace(/\.\.\/images\//g, 'assets/images/')
      // the "go to lead" link of the work modal: Java writes the page link, the port the route of it (core/navigation/java-links.ts)
      .replace(/\bhref=(lead_detail\.face\?\S*)/, (_m, u) => 'href=' + (javaLinkToRoute(u) ?? u))
      .replace(/^(VAL acContactRefTime \S+ = \d{4}-\d\d-\d\d)T\d\d:\d\d/, '$1TNOW')
      .replace(/^(VAL ld2AwDate date = )\d{4}-\d\d-\d\d$/, '$1TODAY'),

  /** builds the Java replica pages; returns { url path -> file } */
  async build(ctx) {
    const { shell } = ctx;
    const defines = uiDefines(shell.read('pages/activity.xhtml'), 'activity.xhtml');
    const headRaw = defines['head'];
    // the work modal is included where Facelets includes it (ui:param page=activity)
    const contentRaw = expandIncludes(defines['content'], shell.read, 'pages', 'activity.xhtml');
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
          if (i % 2 === 0) s = facesToHtml(fragments(s.replace(/<!--[\s\S]*?-->/g, ''), allowed));
          return s
            .replace(/#\{commonBean\.msg\[(['"])([\w.]+)\1\]\}/g, (_m, _q, k) => msg(k))
            .replace(/#\{request\.contextPath\}/g, '/triplesale')
            .replace(/#\{commonBean\.hasFeature\('(\w+)'\)\}/g, (_m, f) => String(allowed(f)))
            .replace(/#\{commonBean\.ssEmployeeId\}/g, MY_EMPLOYEE_ID);
        })
        .join('');
      const code = out.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
      if (/#\{/.test(code)) throw new Error('EL left in the activity page: ' + code.match(/.{0,40}#\{.{0,40}/)[0]);
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

    const files = {};
    for (const lang of ['th', 'en']) {
      for (const [perm, denied] of Object.entries(PERMS)) {
        const name = `activity${perm === 'all' ? '' : '-' + perm}${lang === 'en' ? '-en' : ''}.html`;
        files['/triplesale/pages/' + name] = shell.build('home', '4', 'h-' + name, {
          // the page head sits where ui:insert name="head" is: right after project_root.css, before the template's own styles and dark_mode.css
          headEarly: render(headRaw, lang, denied),
          // ui_pref.js (TS_PREF) is loaded by template.xhtml in the head
          head: '<script src="/triplesale/resources/js/ui_pref.js?v=20260819a"></script>',
          content: render(contentRaw, lang, denied),
          tail: `<script>try { sessionStorage.setItem('ts_username', 'demo'); } catch (e) {}</script>\n${tailFor(lang)}`,
        });
      }
    }
    return files;
  },

  /** a fresh backend for one scenario run (its own module instance: the mock keeps its state at module level); live = a --live run */
  async newState({ delay, hook, live }, ctx) {
    const mock = await ctx.loadTs(join(ctx.ngRoot, MOCK));
    mock.resetMockActivities?.();
    // `rest` = the REST service of the seed (what the fake service of a --live run answers GET /contact-activities … from)
    return { backend: mock.createMockActivities({ delayMs: 0 }), rest: mock.createMockRest(), delay, hook: hook || '', live: !!live };
  },

  /** the BFF the Java page calls; null = not mine */
  async handle(req, state) {
    if (!req.path.startsWith('/triplesale/board/')) return null;
    if (state.delay) await new Promise((r) => setTimeout(r, state.delay));
    const r = await state.backend.fetch(req.path.slice('/triplesale'.length) + req.search, { method: req.method, body: req.body, headers: { 'Content-Type': req.headers['content-type'] ?? '' } });
    return { status: r.status, headers: { 'content-type': r.headers.get('content-type') ?? 'application/json' }, body: Buffer.from(await r.arrayBuffer()) };
  },

  /**
   * The fake REST service of a --live run: the calls of triplesale-service that the LIVE backend of this page makes, answered from the SAME seed the
   * Java replica gets (the shapes of the real service as the Java code reads them: the envelope `{status, message, result}`, the field names of
   * ContactActivityListReqDTO / the items). The list, the history and the lead come from the mock's REST layer (createMockRest); what the page
   * writes and the master data come from the servlet layer of the same mock — wrapped in the envelope of the service.
   * Also here: GET /leads (the customer search of the work modal) and GET /prospects + /prospects/{id}/quick-view (the suggestion card).
   */
  async upstream(req, state) {
    if (req.api !== 'service') return null;
    const p = req.path;
    const q = new URLSearchParams(req.search);
    const wait = async () => { if (state.delay) await new Promise((r) => setTimeout(r, state.delay)); };
    const asIs = (r) => r.text().then((body) => ({ status: r.status, body }));
    const bff = async (path, init = {}) => asIs(await state.backend.fetch(path, init));
    /** a list of the servlet layer in the envelope of the service */
    const listOf = async (path) => {
      const r = await state.backend.fetch(path);
      return { status: r.status, body: { status: r.status, message: r.status === 200 ? 'success' : 'error', result: await r.json() } };
    };
    let m;
    if (req.method === 'GET' && p === '/contact-activities') {
      await wait();
      const num = (k) => (q.has(k) ? Number(q.get(k)) : undefined);
      const r = await state.rest.contactActivities({
        groupBy: q.get('groupBy') ?? 'lead',
        movementTypeId: q.get('movementTypeId') ?? undefined,
        leadId: q.get('leadId') ?? undefined,
        saleGroupId: q.get('saleGroupId') ?? undefined,
        employeeName: q.get('employeeName') ?? undefined,
        contactName: q.get('contactName') ?? undefined,
        activeStatus: q.get('activeStatus') ?? undefined,
        lastContactFrom: q.get('lastContactFrom') ?? undefined,
        lastContactTo: q.get('lastContactTo') ?? undefined,
        assignDateFrom: q.get('assignDateFrom') ?? undefined,
        assignDateTo: q.get('assignDateTo') ?? undefined,
        showClosed: q.get('showClosed') ?? undefined,
        sortBy: q.get('sortBy') ?? undefined,
        pageNo: num('pageNo'),
        pageSize: num('pageSize'),
      });
      return { status: r.status, body: r.body };
    }
    if (req.method === 'GET' && (m = /^\/leads\/(\d+)\/contact-history$/.exec(p))) {
      // (the second hop of a list: the replica's single 150 ms of the BFF hop is already spent)
      const r = await state.rest.contactHistory(m[1]);
      return { status: r.status, body: r.body };
    }
    if (req.method === 'GET' && (m = /^\/leads\/(\d+)$/.exec(p))) {
      await wait();
      const r = await state.rest.leadById(m[1], q.get('activityGroupId') ?? undefined);
      return { status: r.status, body: r.body };
    }
    if (req.method === 'POST' && (m = /^\/leads\/(\d+)\/contact-activities$/.exec(p))) {
      await wait();
      return bff('/board/contact-activities', { method: 'POST', body: JSON.stringify({ ...req.body, leadId: Number(m[1]) }) });
    }
    if (req.method === 'PATCH' && p === '/leads/assign') {
      await wait();
      return bff('/board/lead-assign', { method: 'POST', body: typeof req.body === 'string' ? req.body : JSON.stringify(req.body) });
    }
    if (req.method === 'POST' && p === '/schedules') {
      await wait();
      const r = await bff('/board/schedule/add', { method: 'POST', body: JSON.stringify(req.body) });
      // the service answers HTTP 201 for what the servlet showed as 200 (the status of the envelope decides what the servlet passes on)
      const env = JSON.parse(r.body);
      return { status: env.status ?? r.status, body: r.body };
    }
    if (req.method === 'PATCH' && (m = /^\/schedules\/(\d+)$/.exec(p))) {
      await wait();
      return bff('/board/schedule/edit', { method: 'PATCH', body: JSON.stringify({ ...req.body, id: Number(m[1]) }) });
    }
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
    if (req.method !== 'GET') return null;
    // master data
    if (p === '/master-data/movement-types/LD') return await wait(), listOf('/board/movement-types');
    // the countries of the phone masks (TsPhone): the shell asks ChatMasterDataServlet's data from the service (core/dom/phone-format.service.ts)
    if (p === '/master-data/countries') return bff('/board/chat-master-data?type=countries');
    if (p === '/master-data/tags') return await wait(), listOf('/board/tags');
    if (p === '/master-data/sale-groups') return await wait(), listOf('/board/sale-groups');
    if (p === '/master-data/provinces') return await wait(), listOf('/board/provinces');
    if (p === '/master-data/districts') return await wait(), listOf('/board/districts?provinceId=' + encodeURIComponent(q.get('provinceId') ?? ''));
    if (p === '/master-data/employees') return await wait(), listOf('/board/employees' + (q.get('saleGroupId') ? '?saleGroupId=' + encodeURIComponent(q.get('saleGroupId')) : ''));
    if (p === '/master-data/activity-groups') return await wait(), bff('/board/master/activity-groups?movementTypeId=' + encodeURIComponent(q.get('movementTypeId') ?? ''));
    if (p === '/master-data/employees/by-activity-group') return await wait(), bff('/board/master/employees-by-activity-group?activityGroupId=' + encodeURIComponent(q.get('activityGroupId') ?? ''));
    return null;
  },
};
