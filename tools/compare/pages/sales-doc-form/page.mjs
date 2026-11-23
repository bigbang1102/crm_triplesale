// Comparison setup of the five sales-document forms (/sales/docs/:type/new — qt · bk · ob · aq · ad) — see tools/compare/README.md.
//
// Java side: the REAL page — sales_doc_<type>_form.xhtml with its ~22 components pasted in as Facelets does (tools/lib/facelets.mjs: the
// parameters, the conditions, the EL), the stylesheets and the `<script src>` engine scripts of its head (served from the Java project), the
// inline scripts — inside the shell replica, once per type and language. Every call it makes (/triplesale/board/prospect-list, /rvapi?action=materials,
// /board/prospect/attachments, /board/chat-master-data) comes from the SAME mock the Angular page runs (sales-doc.mock.ts); the master data of
// the auto-dealer forms is answered by that mock too (the file is what the Java page fetches).
import { join } from 'node:path';
import { javaLinkToRoute } from '../../../../src/app/core/navigation/java-links.ts';
import { renderPage } from '../../../lib/facelets.mjs';
import { msgFn, xhtmlToHtml } from '../../../lib/sales-doc.mjs';
import { FORM_PRE } from './pre.mjs';

export const MOCK = 'src/app/features/sales-docs/form/sales-doc.mock.ts';
const TYPES = ['qt', 'bk', 'ob', 'aq', 'ad'];
const name = (type, lang) => `sales_doc_${type}_form${lang === 'en' ? '-en' : ''}`;

/** the session of the harness account "demo" (core/http/mock-backend.interceptor.ts + auth-api.mock.ts) as Facelets sees it */
async function sessionOf(ctx, lang) {
  const roles = await ctx.loadTs(join(ctx.ngRoot, 'src/app/core/permissions/roles.ts'));
  const reports = await ctx.loadTs(join(ctx.ngRoot, 'src/app/core/permissions/report-roles.ts'));
  const all = [
    ...Object.values(roles.ROLE),
    ...Object.values(roles.SUPPORTING_DOC_ROLE_PREFIX).flatMap((p) => [`${p}_View`, `${p}_Create`, `${p}_Edit`]),
    ...reports.ALL_REPORT_ROLES,
  ];
  const mock = await ctx.loadTs(join(ctx.ngRoot, 'src/app/features/sales-docs/form/sales-doc-backend.ts'));
  return {
    branchName: 'SUN GATEWAY',
    branchId: 1004400123,
    branchCode: 'SUN',
    username: 'demo',
    lang,
    uploadAcceptExt: mock.UPLOAD_ACCEPT_EXT,
    profileName: 'สมชาย ใจดี (ทดลอง)',
    employeeId: 1001,
    roles: `[${[...new Set(all)].join(', ')}]`,
  };
}

export default {
  name: 'sales-doc-form',
  // the form; every pop-up the scripts move to <body> (all `.qm-overlay`: customer, payment, saved, print screen …) and the delivery note's own overlays;
  // the red / green bar of the validation, the toast, the SweetAlert, the system dropdown lists
  // The calendar panels of the date fields (.ods-cal) are compared when they are OPEN. A closed one is display:none, and the two sides keep a different number of them on purpose:
  // open_down_select.js of Java never removes the panel of a date field that the page has replaced (the deposit fields of the auto-dealer booking, the rows of the instalment table …
  // are drawn again and again) — it leaks one per redraw; the port in core/dom/open-down-select.ts does remove it (`_odsInput`). Nothing of it is visible.
  roots: ['.qt-page', '.qm-overlay', '.bk-oi-overlay', '#sdBar', '.qm-toast', '.swal-overlay', '.ods-list:not(.ods-cal)', '.ods-cal.open', '[id$="DocCtx"]', '#sdValMsgs'],
  // the item rows (quotation / booking / delivery note) or the vehicle rows (auto-dealer) are drawn when the page script has run
  ready: `document.querySelector('.qt-paper tbody[id$="Items"] tr, .qt-paper tbody[id$="VehRows"] tr')`,
  javaPath: (lang, opts) => `/triplesale/pages/${name(opts.type ?? 'qt', lang)}.xhtml${opts.mock ? '?mock=' + opts.mock : ''}`,
  ngPath: (_lang, opts) => `/sales/docs/${opts.type ?? 'qt'}/new${opts.mock ? '?mock=' + opts.mock : ''}`,
  latencyMs: 150,
  // helpers of this page's scenarios
  pre:
    FORM_PRE +
    `
// location.href = … (Java) / the router (Angular): the Navigation API sees both; the Java page is kept where it is (a cancelled navigation)
var navCalls = [];
var trackNav = function (side) {
  navCalls = [];
  if (!window.navigation) throw new Error('no Navigation API');
  window.navigation.addEventListener('navigate', function (e) { var u = new URL(e.destination.url); navCalls.push(u.pathname + u.search); if (side === 'java') e.preventDefault(); });
  var prev = window.__extra;
  window.__extra = async function () { return ['NAV ' + navCalls.join(' ; ')].concat(prev ? await prev() : []); };
};
`,
  // where the port deliberately differs: the links of the Java page are relative to /pages/ (the shell-level normaliser handles /pages/….xhtml)
  normalize: (l) =>
    l
      .replace(/(\bhref=)(sales_doc_(?:type_list|(?:qt|bk|ob|aq|ad)_form)\.xhtml\?[^ >]*)/g, (_m, a, link) => a + (javaLinkToRoute(link) ?? link))
      // an object URL is a new random id every time
      .replace(/blob:http:\/\/(?:127\.0\.0\.1|localhost):\d+\/[0-9a-f-]{36}/g, 'blob:BLOB')
      // the marker of the Angular shell (a page generated from Java keeps the cursor its own CSS gives a disabled button): the boxes moved to <body> carry it; it has no look of its own
      .replace(/ data-java-page=(?=[ >])/g, '')
      // the clock of "now": the time stamps of the payload and of the printed sheet
      .replace(/"(createtime|txdatetime)":"[^"]*"/g, '"$1":"NOW"')
      .replace(/\d{2}\/\d{2}\/\d{4} \d{2}\.\d{2}\.\d{2}/g, 'DD/MM/YYYY HH.MM.SS'),
  async build(ctx) {
    const { shell } = ctx;
    const out = {};
    for (const lang of ['th', 'en']) {
      const bundle = lang === 'en' ? ctx.readJson('public/assets/i18n/en.json') : shell.th;
      const session = await sessionOf(ctx, lang);
      for (const type of TYPES) {
        const r = renderPage({ read: shell.read, file: `pages/sales_doc_${type}_form.xhtml`, mode: 'java', msg: msgFn(bundle), session });
        out[`/triplesale/pages/${name(type, lang)}.xhtml`] = shell.build('sale', '1', `h-${name(type, lang)}.html`, {
          // template.xhtml puts the head of the page right after project_root.css
          headEarly: xhtmlToHtml(r.defines.head),
          content: xhtmlToHtml(r.defines.content),
          tail: `<script>try { sessionStorage.setItem('ts_username', 'demo'); } catch (e) {}</script>\n${shell.TEMPLATE_SCRIPTS(bundle)}`,
        });
      }
    }
    return out;
  },
  /** a fresh backend for one scenario run (its own module instance: the mock keeps its state at module level) */
  async newState({ delay }, ctx) {
    const mock = await ctx.loadTs(join(ctx.ngRoot, MOCK));
    mock.resetMockSalesDoc?.();
    return { mock, delay };
  },
  /** the BFF the Java page calls; null = not mine. A fault of the mock (`?mock=…`) reaches it through the Referer of the request. */
  async handle(req, state) {
    const m = /^\/triplesale\/(rvapi|board\/[\w/-]+|resources\/mock\/auto_dealer_master\.json)$/.exec(req.path);
    if (!m) return null;
    if (state.delay) await new Promise((r) => setTimeout(r, state.delay));
    let fault = '';
    try { fault = new URL(req.headers.referer ?? '').searchParams.get('mock') ?? ''; } catch { /* no referer */ }
    let r;
    try {
      r = await state.mock.createMockSalesDoc({ delayMs: 0, fault }).fetch(req.path.slice('/triplesale'.length) + req.search, { method: req.method, body: req.body });
    } catch {
      return { destroy: true }; // the mock says "no answer at all"
    }
    return { status: r.status, headers: { 'content-type': r.headers.get('content-type') ?? 'application/json' }, body: Buffer.from(await r.arrayBuffer()) };
  },
};
