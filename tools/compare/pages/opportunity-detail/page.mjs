// Comparison setup of the Lead detail page (/crm/opportunities/:opportunityId) — see tools/compare/README.md for the interface of a page.
//
// Java side: the REAL page (lead_detail.xhtml with the stylesheets of its head, its markup, its page script and — through ui:include —
// the markup + scripts of the modals, EL resolved the way the server would) inside the shell replica. Its data (/triplesale/board/*) comes
// from the SAME mock the Angular page runs (lead-detail.mock.ts); work_modal.xhtml is included where Facelets includes it (ui:param page=lead_detail).
//
// Variants (the permissions of the signed-in user, `opts.variant` of a scenario): `all` = every role incl. the _Sup ones (the "demo" account),
// `owner` = the base roles only (a lead is only the user's own when its employee is him), `viewer` = the roles of the "viewer" account.
// The Java page gets them as the values of its EL; the Angular app as the roles of the session (ngSession).
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { expandIncludes, facesToHtml, uiDefines } from '../../../lib/port-kit.mjs';
import { javaLinkToRoute } from '../../../../src/app/core/navigation/java-links.ts'; // (Node strips the types)
import { ROLE } from '../../../../src/app/core/permissions/roles.ts';
import { makeUpstream } from './upstream.mjs';

const MOCK = 'src/app/features/opportunity-detail/lead-detail.mock.ts';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/** the features the page asks commonBean.hasFeature() for */
const FEATURES = [
  'CRM_ContactActivity_View', 'CRM_ContactActivity_Create', 'CRM_ContactActivity_Create_Sup', 'CRM_Lead_WorkflowStep_Rework', 'CRM_Lead_WorkflowStep_Rework_Sup',
  'CRM_Lead_Close', 'CRM_Lead_Close_Sup', 'CRM_Lead_WorkflowStep_Close', 'CRM_Lead_WorkflowStep_Close_Sup', 'CRM_Lead_Assign', 'CRM_Lead_Assign_Sup',
  'CRM_Lead_Sales_Person_Assign', 'CRM_Schedule_Create', 'CRM_Schedule_Create_Sup', 'CRM_Schedule_View', 'CRM_Schedule_Edit', 'CRM_Lead_Edit', 'CRM_Prospect_Edit', 'CRM_Lead_View',
];
const MENU_ROLES = [ROLE.moduleCrm, ROLE.featureLead, ROLE.featureCalendar];
const VARIANTS = {
  all: { employeeId: 1001, features: FEATURES },
  owner: { employeeId: 1001, features: FEATURES.filter((f) => !f.endsWith('_Sup')) },
  viewer: { employeeId: 1003, features: ['CRM_Lead_View', 'CRM_Schedule_View', 'CRM_ContactActivity_View'] },
  // sees the page but not the contact history (no CRM_ContactActivity_View) and cannot edit anything
  noactivity: { employeeId: 1003, features: ['CRM_Lead_View', 'CRM_Schedule_View'] },
};
const variantOf = (opts) => VARIANTS[opts?.variant ?? 'all'];
const suffix = (opts, lang) => `${opts?.variant && opts.variant !== 'all' ? '-' + opts.variant : ''}${lang === 'en' ? '-en' : ''}`;
// --live: the fake REST service of triplesale-service and the file server of its attachments
const { upstream, files } = makeUpstream({ VARIANTS, sleep });

/** the strings the scenarios use to stand in for what only a browser dialog can show (alert) */
const PAGE_PATH = (opts, lang) => `/triplesale/pages/lead_detail${suffix(opts, lang)}.html`;

/** HTML comments removed outside <style> / <script> blocks (the usage notes of the includes name those tags in words) */
const withoutComments = (t) => t.replace(/(<!--[\s\S]*?-->)|(<style\b[^>]*>[\s\S]*?<\/style>)|(<script\b[^>]*>[\s\S]*?<\/script>)/g, (m, c) => (c ? '' : m));

export default {
  name: 'lead-detail',
  roots: [
    '.ld2-root', '#ld2TagModal', '#ld2SalesModal', '#ld2OwnerModal', '#ld2AddProdModal', '#ld2ViewWorkOverlay', '#ld2AddWorkOverlay', '#wmSuccessOverlay',
    '#ld2HistFilterOverlay', '#ld2AccessModal', '#ld2ReturnStepModal',
    '#ld2CloseGroupModal', '#ld2CloseLeadModal', '#ld2NextGroupModal', '#ldAccessPop', '#ld2MoveStepOverlay', '#ld2UpdConfirmModal',
    'body > div[style*="99999"]', 'body > div[style*="10001"]', '.swal-overlay', '#__cmp_notes',
  ],
  // the lead arrived: its customer code is in the card (the tags answer re-draws the card from the EMPTY lead before that, so the name alone is not enough)
  // and the lists drawn from the lead / the saved history filter are no longer skeletons (a dark theme set before the history is drawn would colour it differently on the two sides)
  ready: `(function () { var c = document.getElementById('ld2CustCode'); return !!c && /^P[0-9]{5}$/.test(c.textContent) && !document.querySelector('#ld2HistList .ld2-sk, #ld2ApptList .ld2-sk, #ld2TaskList .ld2-sk'); })()`,
  javaPath: (lang, opts) => `${PAGE_PATH(opts, lang)}?param_lead_id=${opts?.lead ?? 29}${opts?.group ? '&activityGroupId=' + opts.group : ''}`,
  ngPath: (lang, opts) => `/crm/opportunities/${opts?.lead ?? 29}${opts?.group ? '?activityGroupId=' + opts.group : ''}`,
  latencyMs: 120,
  /** the roles / employee of the signed-in user for this scenario */
  ngSession(session, opts) {
    const v = variantOf(opts);
    if (!opts?.variant || opts.variant === 'all') return session;
    const auth = JSON.parse(session['ts_auth']);
    auth.session.roles = [...MENU_ROLES, ...v.features];
    auth.session.employeeId = v.employeeId;
    return { ...session, ts_auth: JSON.stringify(auth) };
  },
  // helpers of this page's scenarios
  pre: `
var tab = async function (t, ms) { click('.ld2-tab[data-tab="' + t + '"]'); await sleep(ms || 500); };
var sub = async function (t, ms) { click('.ld2-sub-tab[data-sub="' + t + '"]'); await sleep(ms || 500); };
// window.open / alert / location are replaced by recorders (both sides record the call; the page writes the record into #__cmp_notes)
// (fixed + own font — !important on every note: the Java stylesheets force their font on every div — so that the recorder looks the same on both sides)
var notes = function () { var n = document.getElementById('__cmp_notes'); if (!n) { n = document.createElement('div'); n.id = '__cmp_notes'; n.style.cssText = 'position:fixed;left:0;top:0;width:0;height:0;overflow:hidden;font:12px Arial;color:#000;'; n.style.setProperty('font-family', 'Arial', 'important'); document.body.appendChild(n); } return n; };
// waits for a toast the page puts on the body (the fixed 99999 stack) and lets it settle
var toast = async function (ms) { await waitFor(function () { return !!document.querySelector('body > div[style*="99999"], body > div[style*="10001"]'); }, ms || 5000); await sleep(150); };
// the page reloads itself after a save (Java: location.reload() = this context is destroyed, the runner takes over; here: the view is created again =
// a new #ld2CustCode node): markPage() before the click, afterReload() as the last step
var markPage = function () { var c = document.getElementById('ld2CustCode'); if (c) c.__cmpOld = 1; };
var afterReload = async function (ms) {
  if (!(await waitFor(function () { var c = document.getElementById('ld2CustCode'); return !!c && !c.__cmpOld; }, ms || 9000))) return;
  await leadReady(); await sleep(1500);
};
var note = function (kind, text) { var n = notes(); var d = document.createElement('div'); d.setAttribute('data-kind', kind); d.textContent = String(text); d.style.setProperty('font-family', 'Arial', 'important'); n.appendChild(d); };
var stubDialogs = function () {
  win.alert = function (m) { note('alert', m); };
  win.open = function (u, t) { note('open', String(u) + ' | ' + t); return { closed: false, location: {} }; };
};
var x2 = async function (t, ms) { click('.ld2-sub-tab[data-x2="' + t + '"]'); await sleep(ms || 400); };
var inner = async function (t, ms) { click('.ld2-inner-tab[data-inner="' + t + '"]'); await sleep(ms || 400); };
var blur = function (el) { el = need(el); el.dispatchEvent(new Event('blur')); };
var vis = function (sel) { var e = $(sel); return !!e && getComputedStyle(e).display !== 'none'; };
// a File of the given name (and type) for the file inputs
var setFiles = function (input, files) { input = need(input); var dt = new DataTransfer(); files.forEach(function (f) { dt.items.add(f); }); input.files = dt.files; input.dispatchEvent(new Event('change', { bubbles: true })); };
var pngFile = async function (name, w, h) { var c = document.createElement('canvas'); c.width = w; c.height = h; var x = c.getContext('2d'); x.fillStyle = '#336699'; x.fillRect(0, 0, w, h); var blob = await new Promise(function (r) { c.toBlob(r, 'image/png'); }); return new File([blob], name, { type: 'image/png' }); };
// the dump compares attributes, not the values of controls: every dump of this page ends with the values of the forms (the page and the work modal)
window.__extra = async function () {
  var out = [];
  document.querySelectorAll('.ld2-root, #ld2AddWorkOverlay, #ld2ViewWorkOverlay').forEach(function (root) {
    root.querySelectorAll('input, select, textarea').forEach(function (el, i) {
      out.push('VAL ' + (el.id || el.name || el.tagName + i) + ' ' + el.type + ' = ' + (el.type === 'checkbox' || el.type === 'radio' ? el.checked : el.value) + (el.disabled ? ' disabled' : ''));
    });
  });
  return out;
};
// the appointment carousel shows one card: step to the k-th one
var appt = async function (k) { for (var i = 0; i < k; i++) { click("#ld2ApptList button[onclick*=ldApptNext]"); await sleep(250); } };
var ready2 = async function (ms) { await waitFor(function () { return !document.querySelector('.ld2-sk'); }, ms || 6000); await sleep(300); };
var leadReady = async function (ms) { await waitFor(function () { var c = document.getElementById('ld2CustCode'); return !!c && /^P[0-9]{5}$/.test(c.textContent) && !document.querySelector('#ld2HistList .ld2-sk, #ld2ApptList .ld2-sk, #ld2TaskList .ld2-sk'); }, ms || 8000); await sleep(400); };
`,
  // where the port deliberately differs from the Java page: the image folder and the page links; a time that is "now" (the default of a date-time input)
  normalize: (l) =>
    l
      .replace(/\.\.\/images\//g, 'assets/images/')
      // the two "go to the schedule" buttons: window.open(url, '_self') in Java, window.ldNavigate(url) here (the SPA navigates)
      .replace(/window\.open\(('[^']*'),'_self'\)/g, 'window.ldNavigate($1)')
      .replace(/value=\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(?::\d{2})?/g, 'value=NOW')
      // the ids the shell's select enhancer gives (open-down-select.ts, a counter of the document): the Java page reloads itself after a save and
      // starts counting again, the Angular page starts its view again in the same document and the counter goes on
      .replace(/\bodsAuto_\d+/g, 'odsAuto_N')
      // the values of the controls (window.__extra): a date-time that is "now", the date the work modal starts with (today)
      .replace(/^(VAL \S+ datetime-local = )\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(?::\d{2})?/, '$1NOW')
      .replace(/^(VAL ld2AwDate date = )\d{4}-\d{2}-\d{2}$/, '$1TODAY')
      // the new photo is shown with a cache-buster (&cb=<time>)
      .replace(/([?&])cb=\d+/g, '$1cb=NOW')
      .replace(/\b(?:sales_doc_rv|lead_detail|lead|schedule)\.(?:face|xhtml)\?[^"'`\s)<>|]*/g, (m) => javaLinkToRoute(m) ?? m)
      .replace(/(\| )?(\/sales\/receipts[^\s|]*)/g, '$1$2')
      // (after the link mapping, which writes the comma of a list as %2C:) the address a window.open note holds — Java writes the comma of
      // a list as %2C (encodeURIComponent), the router of Angular as ","; the same address
      .replace(/%2C/gi, ',')
      // --live: the files of the attachments are on the harness's file server (the fake REST service gives their addresses; the Java replica shows the address the mock made)
      .replace(/http:\/\/127\.0\.0\.1:\d+\/__files\//g, 'https://'),

  /** builds the Java replica pages; returns { url path -> file } */
  async build(ctx) {
    const { shell } = ctx;
    const mock = await ctx.loadTs(join(ctx.ngRoot, MOCK));
    const uploadAccept = (await mock.createMockLeadDetail({ delayMs: 0 }).initial()).uploadAcceptExt;

    const pageSrc = shell.read('pages/lead_detail.xhtml');
    const defs = uiDefines(pageSrc, 'lead_detail.xhtml');
    // (work_modal.xhtml is included where Facelets includes it: ui:param page=lead_detail)
    const expanded = withoutComments(expandIncludes(defs.content, shell.read, 'pages', 'lead_detail.xhtml'));
    // the stylesheets of the head, in the position Facelets puts them (ui:insert "head" sits before the template's own styles)
    const HEAD = `<link rel="stylesheet" href="/triplesale/css/lead_detail.css?v=20260914b"/>\n<link rel="stylesheet" href="/triplesale/css/lead_detail_modal.css?v=20260928b"/>`;
    const FONT_PRELOAD = ['noto-sans-thai/NotoSansThai-Variable.ttf'].map((f) => `<link rel="preload" as="font" href="/__pub/assets/fonts/${f}" crossorigin>`).join('\n');

    const buildOne = (lang, opts) => {
      const v = variantOf(opts);
      const th = lang === 'en' ? ctx.readJson('public/assets/i18n/en.json') : shell.th;
      const msg = (k) => {
        if (!(k in th)) throw new Error('no message ' + k);
        return th[k];
      };
      const el = (text) =>
        text
          .replace(/#\{commonBean\.msg\[(['"])([\w.]+)\1\]\}/g, (_m, _q, k) => msg(k))
          .replace(/#\{commonBean\.hasFeature\('(\w+)'\)\}/g, (_m, k) => String(v.features.includes(k)))
          .replace(/#\{commonBean\.ssEmployeeId\}/g, String(v.employeeId))
          .replace(/#\{commonBean\.currentLang\}/g, lang)
          .replace(/#\{commonBean\.uploadAcceptExt\}/g, uploadAccept)
          .replace(/#\{request\.contextPath\}/g, '/triplesale');
      // markup: Facelets writes <tag/> of XHTML as <tag></tag>; scripts and styles are written as they are
      const parts = expanded.split(/(<script\b[^>]*>[\s\S]*?<\/script>|<style\b[^>]*>[\s\S]*?<\/style>)/g);
      const content = parts
        .map((p, i) => {
          if (i % 2 === 0) return el(facesToHtml(p));
          // inline script: CDATA wrapper kept (a comment in JS); the EL is resolved first
          const s = el(p);
          if (/^<script\b/.test(s) && !/\bsrc=/.test(s.slice(0, s.indexOf('>')))) {
            const code = s.replace(/^<script[^>]*>/, '').replace(/<\/script>$/, '');
            try {
              // eslint-disable-next-line no-new-func
              new Function(code);
            } catch (e) {
              throw new Error('the Java page script does not parse after the EL was resolved (a message with a quote?): ' + e.message);
            }
          }
          return s;
        })
        .join('');
      const code = content.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
      if (/#\{/.test(code)) throw new Error('EL left in the lead_detail page: ' + code.match(/.{0,50}#\{.{0,50}/)[0]);
      return shell.build('home', '3', `h-lead-detail${suffix(opts, lang)}.html`, {
        headEarly: `${FONT_PRELOAD}\n${HEAD}`,
        content,
        tail: `<script>try { sessionStorage.setItem('ts_username', 'demo'); } catch (e) {}</script>\n${shell.TEMPLATE_SCRIPTS(th)}`,
      });
    };
    const files = {};
    for (const variant of [undefined, ...Object.keys(VARIANTS).filter((k) => k !== 'all')]) {
      for (const lang of ['th', 'en']) files[PAGE_PATH({ variant }, lang)] = buildOne(lang, { variant });
    }
    return files;
  },

  /** a fresh backend for one scenario run (its own module instance: the mock keeps its state at module level) */
  async newState({ delay, hook, live }, ctx) {
    const mock = await ctx.loadTs(join(ctx.ngRoot, MOCK));
    mock.resetMockLeadDetail?.();
    // hook = opts.hook of the scenario ('variant=<name>': who is signed in — the fake REST service cannot read it from the token); live = a --live run
    return { mock, backends: new Map(), delay, hook: hook || '', live: !!live };
  },

  /** the BFF the Java page calls (/triplesale/board/*, /triplesale/docproxy); null = not mine. The user comes from the page that asked (Referer) */
  async handle(req, state, ctx) {
    // --live: the file server the attachments of the fake REST service point at (page.files)
    if (req.path.startsWith('/__files/')) return files(req, state);
    // --live: the Angular app reads metro_geo.json from its assets (the servlet read the same file from the classpath): the replica serves that file too
    if (state.live && req.path === '/triplesale/board/metro-geo') {
      return { status: 200, headers: { 'content-type': 'application/json' }, body: await readFile(join(ctx.ngRoot, 'public/assets/data/metro-geo.json')) };
    }
    if (!/^\/triplesale\/(board\/|docproxy)/.test(req.path)) return null;
    const variant = /lead_detail-(owner|viewer|noactivity)/.exec(req.headers.referer ?? '')?.[1] ?? 'all';
    let backend = state.backends.get(variant);
    if (!backend) state.backends.set(variant, (backend = state.mock.createMockLeadDetail({ delayMs: 0, employeeId: VARIANTS[variant].employeeId })));
    if (state.delay) await sleep(state.delay);
    const r = await backend.fetch(req.path.slice('/triplesale'.length) + req.search, { method: req.method, body: req.body, headers: { 'Content-Type': req.headers['content-type'] ?? '' } });
    return { status: r.status, headers: { 'content-type': r.headers.get('content-type') ?? 'application/json' }, body: Buffer.from(await r.arrayBuffer()) };
  },

  /** --live: the fake REST service (triplesale-service) and the file server of its attachments — see upstream.mjs */
  upstream,
  files,
};
