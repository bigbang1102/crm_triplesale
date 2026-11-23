// Comparison setup of the Opportunities page (/crm/opportunities: Board + List) — see tools/compare/README.md for the interface of a page.
//
// Java side: the REAL page — lead.xhtml with its three includes pasted in as Facelets does, EL resolved the way the server would, the
// real <script>s and <style>s in the real order, lead.css linked from the head — inside the shell replica. It is served at
// /triplesale/pages/lead.html so that its relative addresses (../board/leads, ../css/lead.css, ../images/…) resolve as they do in Java.
// Every call it makes (/triplesale/board/…) and phone_format.js's master data come from the SAME mock the Angular page runs
// (leads.mock.ts / core/http/mock-countries.ts). The page is built per request because its EL depends on who asks (the account,
// the language) and on the filter state the server session holds (`leadBoardView.savedFilterJson`).
import { join } from 'node:path';
import { facesToHtml } from '../../../lib/port-kit.mjs';
import { uiDefines, expandIncludes } from '../../../lib/port-kit.mjs';

const MOCK = 'src/app/features/opportunities/leads.mock.ts';
const COUNTRIES = 'src/app/core/http/mock-countries.ts';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/** the accounts of the harness (core/http/mock-backend.interceptor.ts): the roles they hold and their employee id */
const USERS = {
  demo: { employeeId: 1001, has: () => true },
  viewer: { employeeId: 1003, has: (k) => k === 'CRM_Lead_View' },
};

/**
 * The scripts template.xhtml loads at the end of <body>, with the texts of the language of the request (the shell replica builds them
 * from the Thai bundle only; a page that is opened in English has English texts in the system dropdown and the input guard)
 */
function templateScripts(shell, msg) {
  const ods = {
    select: msg('label.ods.select'), search: msg('label.ods.search_ph'), noData: msg('label.ods.no_data'), today: msg('label.ods.today'), ok: msg('label.ods.ok'), clear: msg('label.ods.clear'),
    months: Array.from({ length: 12 }, (_, i) => msg('label.month.' + (i + 1))), dow: Array.from({ length: 7 }, (_, i) => msg('label.dow.' + (i + 1))),
  };
  return shell
    .TEMPLATE_SCRIPTS()
    .replace(/window\.ODS_I18N = \{.*?\};<\/script>/s, () => 'window.ODS_I18N = ' + JSON.stringify(ods) + ';</script>')
    .replace(/window\.INPUT_GUARD_I18N = \{.*?\};/s, () => 'window.INPUT_GUARD_I18N = { blocked: ' + JSON.stringify(msg('label.guard.special_char')) + ' };');
}

export default {
  name: 'leads',
  roots: ['.ld-root', '#ldFilterOverlay', '#ldAccessPop', '#ld2MoveStepOverlay', '.swal-overlay', '.ods-list.ods-ac', '.ods-list:not(.ods-ac)'],
  // the first load of the page is over: the skeleton (it covers the page until /board/leads answered, or failed) has faded out
  ready: `document.querySelector('.ld-root') && getComputedStyle(document.querySelector('#ldSkeleton')).display === 'none'`,
  javaPath: (lang, opts) =>
    `/triplesale/pages/lead.html?l=${lang}&u=${opts.user ?? 'demo'}` + (opts.mock ? '&cfg=' + encodeURIComponent(JSON.stringify(opts.mock)) : ''),
  ngPath: () => '/crm/opportunities',
  latencyMs: 150,
  // helpers of this page's scenarios
  pre: `
var cols = function () { return $$('#ldBoardContent .ld-col'); };
var colBody = function (i) { return $$('#ldBoardContent .ld-col-body')[i]; };
var cards = function (i) { return $$('.ld-card', colBody(i)); };
var settled = async function (ms) { await sleep(ms || 900); };
var pickDd = async function (btn, item, ms) { click(btn); await sleep(150); click(item); await sleep(ms || 1200); };
var openFilter = async function () { click('#ldFilterBtn'); await sleep(500); };
var tabList = async function (ms) { click('.ld-tab[data-tab="list"]'); await waitFor(function () { return getComputedStyle($('#ldSkeleton')).display === 'none'; }, 6000); await sleep(ms || 600); };
// a native drag & drop of a card onto a column: the events the page listens to (dragstart on the card, dragover / drop on the column body)
var dnd = async function (card, body) {
  var dt = new DataTransfer();
  var mk = function (t) { return new DragEvent(t, { bubbles: true, cancelable: true, dataTransfer: dt }); };
  card.dispatchEvent(mk('dragstart')); await sleep(30);
  body.dispatchEvent(mk('dragover')); await sleep(30);
  body.dispatchEvent(mk('drop')); await sleep(30);
  card.dispatchEvent(mk('dragend'));
};
// the page leaves for lead_detail: record where (the Java address, or the route) without leaving — shown as the last lines of the dump
var navSeen = null;
var watchNav = function (side) {
  window.__extra = async function () { return ['NAV ' + (navSeen || '-')]; };
  if (side === 'java') {
    window.navigation.addEventListener('navigate', function (e) {
      var u = new URL(e.destination.url); if (u.pathname === location.pathname && u.search === location.search) return;
      var q = u.searchParams; navSeen = 'lead=' + q.get('param_lead_id') + ' group=' + (q.get('activityGroupId') || '-'); e.preventDefault();
    });
  }
};
// Angular: the router has already moved to /crm/opportunities/<id>[?activityGroupId=…] — say it the way the Java address is read above
var ngNav = function () { var u = new URL(location.href); var m = /\\/crm\\/leads\\/(\\w+)/.exec(u.pathname); navSeen = m ? 'lead=' + m[1] + ' group=' + (u.searchParams.get('activityGroupId') || '-') : null; };
`,
  // where the port deliberately differs: the images of the Java context root are public/assets/images (the shared normaliser maps the absolute ones;
  // these are the relative addresses the page script writes into its HTML strings, and default_avatar.svg, which sits one folder up)
  normalize: (l) =>
    l
      .replace(/(?:\.\.|\/triplesale)\/images\/icon\/default_avatar\.svg/g, 'assets/images/default_avatar.svg') // (the shell's open_down_select uses the flat one too)
      .replace(/\.\.\/images\//g, 'assets/images/'),

  /** builds the Java replica pages (th/en × account); returns {} — the pages are served by handle() */
  async build(ctx) {
    const { shell } = ctx;
    const defs = uiDefines(shell.read('pages/lead.xhtml'), 'lead.xhtml');
    const content = expandIncludes(defs.content, shell.read, 'pages', 'lead.xhtml');
    const head = defs.head.replace(/<!--[\s\S]*?-->/g, '').trim();
    const built = {};
    for (const lang of ['th', 'en']) {
      const th = shell.th;
      const dict = lang === 'en' ? ctx.readJson('public/assets/i18n/en.json') : th;
      const msg = (k) => {
        const v = dict[k] ?? th[k];
        if (v === undefined) throw new Error('no message ' + k);
        return v;
      };
      for (const [user, u] of Object.entries(USERS)) {
        // Facelets' own output: comments and the HTML-ish <tag/> only outside the scripts and styles
        const text = content
          .split(/(<script\b[\s\S]*?<\/script>|<style\b[\s\S]*?<\/style>)/)
          .map((part, i) => (i % 2 ? part : facesToHtml(part.replace(/<!--[\s\S]*?-->/g, ''))))
          .join('')
          .replace(/#\{commonBean\.msg\['([\w.]+)'\]\}/g, (_m, k) => msg(k))
          .replace(/#\{request\.contextPath\}/g, '/triplesale')
          .replace(/#\{leadBoardView\.hasLeadViewAccess\}/g, String(u.has('CRM_Lead_View')))
          .replace(/#\{commonBean\.hasFeature\('([\w,]+)'\)\}/g, (_m, k) => String(u.has(k)))
          .replace(/#\{commonBean\.ssEmployeeId\}/g, String(u.employeeId))
          .replace(/#\{leadBoardView\.savedFilterJson\}/g, '__SAVED_FILTER__');
        if (/#\{/.test(text)) throw new Error('EL left in the lead page: ' + text.match(/.{0,50}#\{.{0,50}/)[0]);
        const file = shell.build('home', '3', `h-lead-${lang}-${user}.html`, {
          // the real <ui:insert name="head"/> sits before the big <style> of template.xhtml (project_layout6 / dark_mode.css come after it)
          headEarly: head.replace(/href="\.\.\/css\//, 'href="/triplesale/css/'),
          content: text,
          // ts_username is what the Java login page left in sessionStorage
          tail: `<script>try { sessionStorage.setItem('ts_username', 'demo'); } catch (e) {}</script>\n${templateScripts(shell, msg)}`,
        });
        built[`${lang}:${user}`] = file;
      }
    }
    ctx.__leadPages = built;
    return {};
  },

  /** a fresh backend for one scenario run (its own module instance: the mock keeps its state at module level); hook = opts.live.hook of a --live scenario */
  async newState({ delay, hook }, ctx) {
    const mock = await ctx.loadTs(join(ctx.ngRoot, MOCK));
    mock.resetMockLeads?.();
    const countries = await ctx.loadTs(join(ctx.ngRoot, COUNTRIES));
    return { mock, countries, backend: mock.createMockLeads({ delayMs: 0 }), delay, hook: hook || '' };
  },

  /** the page itself and the BFF calls it makes; null = not mine */
  async handle(req, state, ctx) {
    const { readFileSync } = await import('node:fs');
    if (req.path === '/triplesale/pages/lead.html') {
      const q = new URLSearchParams(req.search);
      const lang = q.get('l') === 'en' ? 'en' : 'th';
      const user = USERS[q.get('u')] ? q.get('u') : 'demo';
      const cfg = q.get('cfg') ? JSON.parse(q.get('cfg')) : undefined;
      // the account / language / switches of this request decide what the backend answers (the module keeps the state across requests)
      state.backend = state.mock.createMockLeads({ delayMs: 0, can: USERS[user].has, employeeId: USERS[user].employeeId, lang: () => lang, config: cfg });
      const saved = (await state.backend.initial()).savedFilterJson;
      const html = readFileSync(ctx.__leadPages[`${lang}:${user}`], 'utf8').replace('__SAVED_FILTER__', () => JSON.stringify(saved));
      return { status: 200, headers: { 'content-type': 'text/html; charset=utf-8' }, body: Buffer.from(html, 'utf8') };
    }
    if (req.path === '/triplesale/board/chat-master-data') {
      // phone_format.js (the Java file) asks for the countries
      const r = state.countries.mockCountriesResponse();
      return { status: r.status, headers: { 'content-type': 'application/json' }, body: Buffer.from(await r.arrayBuffer()) };
    }
    if (req.path.startsWith('/triplesale/board/')) {
      if (state.delay) await sleep(state.delay);
      const r = await state.backend.fetch(req.path.slice('/triplesale'.length) + req.search, { method: req.method, body: req.body, headers: { 'Content-Type': req.headers['content-type'] ?? '' } });
      return { status: r.status, headers: { 'content-type': r.headers.get('content-type') ?? 'application/json' }, body: Buffer.from(await r.arrayBuffer()) };
    }
    return null;
  },

  /**
   * The fake REST service of triplesale-service (--live): the routes the LIVE backend of this page calls (leads.live.ts of the page, core/live/opportunities.live.ts,
   * board-master.live.ts), in the shape the Java code consumed them — an envelope `{status, message, result}`, the place names the way the service sends
   * them (provinces / districts in Thai with their codes, COUNTRIES in English), master lists with fields the page never reads and a province list
   * mixed with foreign cities and a duplicated code (what BACKEND_BUG_masterdata_address.md describes) — so that the page only looks right if the live backend does
   * what the servlets did. The data is the SAME sample set the Java replica gets (leads.mock.ts), asked for by the account of the Bearer token.
   *
   * state.hook = the mock switches of the scenario as JSON ({noProducts, failLeads, emptyBoard, maxPerPage, delayMs}): `failLeads` is played HERE as a failing
   * service (HTTP 500) — the mock's own failLeads (a 500 of the servlet) is a Java exception path that no longer exists; see `fail-leads` in scenarios.mjs.
   */
  async upstream(req, state) {
    if (req.api !== 'service') return null;
    const cfg = hookConfig(state.hook);
    const user = USERS[accountOf(req.headers)] ?? USERS.demo;
    // (the sample set always speaks Thai, like the service; the English of the page is the live backend's work)
    const sample = state.mock.createMockLeads({ delayMs: 0, can: user.has, employeeId: user.employeeId, config: { ...cfg, failLeads: false, blankLeads: false } });
    const ask = async (bff, init) => {
      const r = await sample.fetch(bff, init);
      return { status: r.status, json: JSON.parse(await r.text()) };
    };
    const envelope = (result, status = 200) => ({ status: 200, body: { status, message: 'success', result } });
    const q = new URLSearchParams(req.search);

    // ---- the customers of the suggestion card under the search box: ProspectListService (behind /board/prospect-list?enrich=1, prospect.live.ts) asks
    // the LIST (`GET /prospects`: rows of ProspectResDTO — name, customerTel, the address by its parts … but NO customer code) and then, for every row,
    // `GET /prospects/{id}/quick-view` (the code, sex, type …) which overwrites/fills the row. Which customers, the search and the paging are the mock's.
    if (req.method === 'GET' && req.path === '/prospects') {
      if (state.delay) await sleep(state.delay);
      const mq = new URLSearchParams();
      for (const k of ['page', 'perPage', 'searchText']) if (q.has(k)) mq.set(k, q.get(k));
      const { json } = await ask('/board/prospect-list?' + mq);
      const rows = json.result.items.map((it) => ({
        id: it.id, name: it.name, customerTel: it.phone, contactDate: '2026-01-02 09:30:00', marketingChanelName: 'Facebook',
        currentAddress: '', currentSubDistrictName: '', currentDistrictName: '', currentCityName: it.addr, currentPostId: '', attachFile: it.avatar,
        salePersonCode: 'E101', salePersonName: 'สมชาย ใจดี', saleGroupName: 'ทีม A', employeeCode: 'E101', employeeName: 'สมชาย ใจดี',
      }));
      return { status: 200, body: { status: 200, message: 'success', result: rows, meta: json.result.meta } };
    }
    const quick = req.method === 'GET' ? /^\/prospects\/(\d+)\/quick-view$/.exec(req.path) : null;
    if (quick) {
      if (state.delay) await sleep(Math.min(state.delay, 8)); // (the card asks for a whole page of them, one at a time)
      state.everyone ??= (await ask('/board/prospect-list?page=1&perPage=500')).json.result.items;
      const it = state.everyone.find((x) => String(x.id) === quick[1]);
      if (!it) return { status: 404, body: { status: 404, message: 'not found' } };
      return envelope({ code: it.code, sex: '1', customerType: 'person', prospectEmail: '', convenient: '' });
    }

    if (state.delay) await sleep(state.delay);

    if (req.method === 'GET') {
      if (/^\/master-data\/movement-types\/\w+$/.test(req.path)) return { status: 200, body: (await ask('/board/master/movement-types?type=LD')).json }; // the raw envelope
      if (req.path === '/leads') {
        if (cfg.failLeads) return { status: 500, body: { status: 500, message: 'Internal Server Error' } };
        const r = await ask('/board/leads' + req.search);
        return envelope(withEnglishCountries(r.json));
      }
      const lists = { '/master-data/tags': '/board/tags', '/master-data/sale-groups': '/board/sale-groups', '/master-data/employees': '/board/employees' };
      if (lists[req.path]) return envelope((await ask(lists[req.path])).json.map((row) => ({ ...row, createdAt: '2026-01-01T00:00:00', isActive: true })));
      if (req.path === '/master-data/provinces') {
        const clean = (await ask('/board/provinces')).json;
        // the real list: foreign cities, a code with a tab in front of it (older id), a Thai name without any code — the servlet kept the 6 clean rows
        return envelope([
          { id: 0, code: '\tBKK', name: 'กรุงเทพมหานคร' },
          { id: 9001, code: 'TYO', name: 'Tokyo', nameTh: '' },
          { id: 9002, code: '', name: 'ไม่มีรหัส' },
          ...clean,
          { id: 9003, code: 'NYC', name: 'New York' },
        ]);
      }
      if (req.path === '/master-data/districts') return envelope((await ask('/board/districts?provinceId=' + (q.get('provinceId') ?? ''))).json);
      if (req.path === '/master-data/countries') return { status: 200, body: JSON.parse(await (await state.countries.mockCountriesResponse()).text()) };
    }
    const contact = /^\/leads\/(\w+)\/contact-activities$/.exec(req.path);
    if (req.method === 'POST' && contact) {
      const body = req.body && typeof req.body === 'object' ? req.body : {};
      // what the servlet did before forwarding: the lead is in the path (not in the body) and the channel is the label of the o2o combo
      const bad = 'leadId' in body ? 'leadId must not be in the body' : 'channel' in body && !O2O_LABELS.includes(body.channel) ? `channel ${JSON.stringify(body.channel)} is not a label of the o2o combo` : '';
      if (bad) return { status: 400, body: { status: 400, message: bad, error: { code: 400, message: bad } } };
      const r = await ask('/board/contact-activities', { method: 'POST', body: JSON.stringify({ leadId: contact[1], ...body }) });
      return { status: r.status, body: r.json };
    }
    return null;
  },
};

/** what the sample set of the mock switches say (opts.live.hook of a --live scenario is their JSON) */
function hookConfig(hook) {
  try {
    return hook && hook.startsWith('{') ? JSON.parse(hook) : {};
  } catch {
    return {};
  }
}

/** the account of the Bearer token the fake sign-in issued (core/http/auth-api.mock.ts: `mock.access.<url-encoded claims>`, `k` = the lower-cased account) */
function accountOf(headers) {
  const m = /^Bearer mock\.access\.(.+)$/.exec(headers.authorization ?? '');
  try {
    return m ? JSON.parse(decodeURIComponent(m[1])).k : 'demo';
  } catch {
    return 'demo';
  }
}

/** the service names the countries in English (the Thai name comes from the dictionary of the live backend) */
const COUNTRY_EN = { THA: 'Thailand', JPN: 'Japan' };
function withEnglishCountries(result) {
  const fix = (items) => {
    if (Array.isArray(items)) for (const it of items) if (it && COUNTRY_EN[it.currentCountryCode]) it.currentCountryName = COUNTRY_EN[it.currentCountryCode];
  };
  if (result && typeof result === 'object' && !Array.isArray(result)) {
    fix(result.leads?.items);
    for (const col of result.kanban ?? []) fix(col.items);
  }
  return result;
}
const O2O_LABELS = ['Manual', 'Call In', 'Call Out', 'SMS', 'Email', 'Facebook', 'Line', 'WhatsApp'];
