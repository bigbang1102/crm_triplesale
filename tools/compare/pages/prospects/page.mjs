// Comparison setup of the Prospects page (/crm/prospects — Java: pages/contracts.xhtml) — see tools/compare/README.md for the interface of a page.
//
// Java side: the REAL page (the <link>/<script> and the <style> of the head, the markup, the five <script> tags and the page script of the content
// of contracts.xhtml, EL resolved the way the server would, the JSF tags written as JSF writes them) inside the shell replica, at
// /triplesale/pages/contracts.html so that its relative addresses ('../board/…', '../images/…', '../js/lead/…') resolve like they do in Tomcat.
// Everything it asks the server for — the BFF servlets, /docproxy, the country master of phone_format.js, and the two p:remoteCommand of the
// document tab (rendered here like JSF renders them) — is answered by the SAME mock the Angular page runs (prospects.mock.ts).
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { facesToHtml } from '../../../lib/port-kit.mjs';
import { javaLinkToRoute } from '../../../../src/app/core/navigation/java-links.ts'; // (Node strips the types; the file has no Angular imports)

const MOCK = 'src/app/features/prospects/prospects.mock.ts';
const DOCS = 'src/app/features/prospects/prospects.docs.ts';
const COUNTRIES = 'src/app/core/http/mock-countries.ts';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const escHtml = (s) => String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
// the demo account of the mock login (core/http/mock-backend.interceptor.ts): employee 1001, branch SUN
const SESSION = { employeeId: '1001', username: 'demo', branchCode: 'SUN' };
// FileServerAccess.ALLOWED_EXT sorted (commonBean.uploadAcceptExt) — read from the Java source, independently of the generator
const uploadAccept = (javaRoot) => {
  const fsa = readFileSync(join(javaRoot, 'src/java/com/ace/utils/FileServerAccess.java'), 'utf8');
  const set = /ALLOWED_EXT = Set\.of\(([\s\S]*?)\);/.exec(fsa)[1];
  return [...set.matchAll(/"(\.[a-z0-9]+)"/g)].map((m) => m[1]).sort().join(',');
};

export default {
  name: 'prospects',
  roots: ['.ct-root', '#ctLeadConfirmOverlay', '#ctLeadSuccessOverlay', '#ctFilterOverlay', '#ctCreateLeadModal', '.ods-list.open', '.swal-overlay'],
  // the first page of rows (or a status row) is drawn, the rows were enriched (no skeleton line left), the country master of the phone numbers arrived
  ready: `(document.querySelector('#ctTableBody tr[data-id]') || document.querySelector('#ctTableBody tr.ct-status-row')) && !document.querySelector('#ctTableBody .ct-skel-row, #ctTableBody .ct-code .ct-skel-line') && window.TsPhone && TsPhone.isReady()`,
  javaPath: (lang) => (lang === 'en' ? '/triplesale/pages/contracts-en.html' : '/triplesale/pages/contracts.html'),
  ngPath: () => '/crm/prospects',
  latencyMs: 150,
  // (the document previews address files of a file server that the mock does not have: prospect/<epoch>/<name> answers 404 on both sides)
  ignoreLog: [/HTTP 404 \S*\/prospect\/\d{13}\//],
  // helpers of this page's scenarios (they run in the page)
  pre: `
var rowsOf = function () { return $$('#ctTableBody tr[data-id]'); };
var settleList = async function () { await waitFor(function () { return !$('#ctTableBody .ct-skel-row, #ctTableBody .ct-code .ct-skel-line'); }, 8000); await sleep(250); };
var openRow = async function (i, ms) { rowsOf()[i || 0].click(); await sleep(ms || 400); };
var tabDocs = async function (ms) { click('.ct-tab[data-tab="docs"]'); await sleep(ms || 700); };
var searchFor = async function (text, ms) {
  if (!$('#ldSearch').classList.contains('open')) { click('#ldSearch .ld-search-ic'); await sleep(150); }
  typeIn('#ldSearchInput', text); click('#ldSearchGo');
  await sleep(ms || 900); await settleList();
};
var scrollEnd = async function (ms) { var w = $('.ct-table-wrap'); w.scrollTop = w.scrollHeight; await sleep(ms || 1200); await settleList(); };
var openFilterDlg = async function (ms) { click('#ctFilterBtn'); await sleep(ms || 700); };
var pickOpt = function (id, text) {
  var s = $('#' + id), o = Array.prototype.slice.call(s.options).filter(function (x) { return x.textContent.trim() === text; })[0];
  if (!o) throw new Error('no option "' + text + '" in #' + id);
  s.value = o.value; s.dispatchEvent(new Event('change', { bubbles: true }));
};
var firstOpt = function (id, nth) {
  var s = $('#' + id), o = Array.prototype.slice.call(s.options).filter(function (x) { return x.value; })[nth || 0];
  if (!o) throw new Error('no option in #' + id);
  s.value = o.value; s.dispatchEvent(new Event('change', { bubbles: true }));
};
var optText = function (id, nth) { return Array.prototype.slice.call($('#' + id).options).filter(function (x) { return x.value; })[nth || 0].textContent.trim(); };
// the "create lead" modal: open it for a row, wait for the dropdowns
var openLead = async function (rowIdx) { await openRow(rowIdx || 0, 600); click('.ct-lead-btn'); await sleep(900); };
var swalOk = async function () { var b = $('.swal-button--confirm'); if (b) b.click(); await sleep(400); };
var swalCancel = async function () { var b = $('.swal-button--cancel'); if (b) b.click(); await sleep(400); };
// files: new File([bytes], name, { type })
var mkFile = function (name, size, type) { return new File([new Uint8Array(size || 12)], name, { type: type || '' }); };
var pickFiles = async function (files, ms) {
  var inp = $('#ctFileInput'), dt = new DataTransfer();
  files.forEach(function (f) { dt.items.add(f); });
  inp.files = dt.files; inp.dispatchEvent(new Event('change', { bubbles: true }));
  await sleep(ms || 1600);
};
// downloads / navigation, as in the DrillDown scenarios: stubbed on both sides, what happened is written into the page root
var stubDownload = function () {
  win.__dl = null;
  URL.revokeObjectURL = function () {};
  var create = URL.createObjectURL.bind(URL);
  URL.createObjectURL = function (b) { win.__blob = b; return create(b); };
  HTMLAnchorElement.prototype.click = function () { win.__dl = { name: this.download, href: this.href }; };
};
var recordDownload = async function () {
  var d = win.__dl, text = d ? await win.__blob.text() : '';
  $('.ct-root').setAttribute('data-download', JSON.stringify(d ? { name: d.name, type: win.__blob.type, size: win.__blob.size, text: text.slice(0, 200) } : null));
};
// navigation: Java assigns window.location.href (cancelled here, the Navigation API reports it); Angular navigates the router. Both are written
// as lines at the end of the dump (the page itself is gone on the Angular side) — use with { roots: [] }
var recordNav = function () {
  win.__navs = [];
  if (win.navigation) win.navigation.addEventListener('navigate', function (e) { win.__navs.push(e.destination.url); if (side === 'java') { try { e.preventDefault(); } catch (x) {} } });
  win.__extra = async function () { return win.__navs.map(function (u) { return 'NAV ' + u; }); };
};
`,
  // where the port deliberately differs from the Java page
  normalize: (l) =>
    l
      // the inline handler of a context-menu item: Java assigns window.location.href, the port calls ctNavigate (the host maps the address to a route)
      .replace(/window\.location\.href='([^']*)'/g, 'NAV($1)')
      .replace(/ctNavigate\('([^']*)'\)/g, 'NAV($1)')
      // the Java address of the prospect form / lead list, whichever way it is written, is the route of this app (core/navigation/java-links.ts)
      .replace(/(?<![\w/.-])[A-Za-z0-9_]+\.face\?[^\s'"<>)]*/g, (m) => javaLinkToRoute(m) ?? m)
      // web/images/ is public/assets/images/ (the Java page addresses it relative to /pages/)
      .replace(/([="'(\s])\.\.\/images\//g, '$1assets/images/')
      // --live: the fake service names the file server by an absolute address (the real service does; the mock keeps `prospect/<epoch>/<name>` so that
      // it stays off the network) — the host of the harness is random, and it is not part of what the page shows
      .replace(/http:\/\/127\.0\.0\.1:\d+\/__files\//g, '')
      // blob addresses are random
      .replace(/blob:(?:ORIGIN|https?:\/\/[^/\s"'<>]+)\/[0-9a-f-]+/g, 'blob:ORIGIN/BLOB'),

  /** builds the Java replica pages; returns { url path -> file } */
  async build(ctx) {
    const { shell } = ctx;
    const src = shell.read('pages/contracts.xhtml').replace(/\r\n/g, '\n');
    const section = (name) => {
      const open = src.indexOf(`<ui:define name="${name}">`);
      if (open < 0) throw new Error(`no ui:define ${name}`);
      return src.slice(open + `<ui:define name="${name}">`.length, src.indexOf('</ui:define>', open));
    };
    const headRaw = section('head');
    const content = section('content');
    const mFrom = content.indexOf('<div class="ct-root">');
    const sFrom = content.indexOf('<script src="../js/lead/lead_create_dropdowns.js');
    const iFrom = content.indexOf('<script>', sFrom);
    const cFrom = content.indexOf('//<![CDATA[', iFrom);
    const cTo = content.indexOf('//]]>', cFrom);
    if (mFrom < 0 || sFrom < 0 || iFrom < 0 || cFrom < 0 || cTo < 0) throw new Error('contracts.xhtml: markup / script boundaries not found');
    const accept = uploadAccept(ctx.javaRoot);
    // the body of the ui:repeat that renders one document row, and the line shown for an empty list
    const repeat = /<ui:repeat value="#\{contractView\.prospectDocs\}" var="doc">([\s\S]*?)<\/ui:repeat>/.exec(content);
    const emptyFrag = /<ui:fragment rendered="#\{empty contractView\.prospectDocs\}">([\s\S]*?)<\/ui:fragment>/.exec(content);
    if (!repeat || !emptyFrag) throw new Error('contracts.xhtml: the document list tags were not found');

    const buildLang = (lang) => {
      const th = lang === 'en' ? ctx.readJson('public/assets/i18n/en.json') : shell.th;
      const msg = (k) => {
        if (!(k in th)) throw new Error('no message ' + k);
        return th[k];
      };
      // the EL the server resolves
      const el = (s) =>
        s
          .replace(/#\{commonBean\.msg\['([\w.]+)'\]\}/g, (_m, k) => msg(k))
          .replace(/#\{request\.contextPath\}/g, '/triplesale')
          .replace(/#\{commonBean\.uploadAcceptExt\}/g, accept)
          .replace(/#\{commonBean\.ssEmployeeId\}/g, SESSION.employeeId)
          .replace(/#\{sessionScope\.ssousername\}/g, SESSION.username)
          .replace(/#\{sessionScope\.ss_branch_code\}/g, SESSION.branchCode);

      const head = el(headRaw.replace(/<!--[\s\S]*?-->/g, ''));
      // the markup as Facelets writes it: the JSF tags become the elements JSF renders, the ui:repeat has no rows yet, the empty-list line is shown
      let markup = content.slice(mFrom, sFrom).replace(/<!--[\s\S]*?-->/g, '');
      markup = markup
        .replace(repeat[0], '')
        .replace(emptyFrag[0], emptyFrag[1])
        .replace(/<ui:fragment rendered="#\{commonBean\.hasFeature\('CRM_Prospect_Create'\)\}">([\s\S]*?)<\/ui:fragment>/, '$1')
        .replace('<h:form id="ctDocForm">', '<form id="ctDocForm" name="ctDocForm" method="post" action="/triplesale/pages/contracts.face" enctype="application/x-www-form-urlencoded">')
        .replace('</h:form>', '</form>')
        .replace('<h:panelGroup id="ctDocList" layout="block" styleClass="ct-doc-list">', '<div id="ctDocForm:ctDocList" class="ct-doc-list">')
        .replace('</h:panelGroup>', '</div>')
        .replace(/<p:remoteCommand[\s\S]*?\/>/g, '');
      if (/<(?:h|p|ui|f):/.test(markup)) throw new Error('JSF tag left in the markup: ' + markup.match(/<(?:h|p|ui|f):[^>]*>/)[0]);
      markup = el(facesToHtml(markup));
      // the script tags of the page, then the page script
      const tags = content.slice(sFrom, iFrom).replace(/<!--[\s\S]*?-->/g, '');
      const script = el(content.slice(cFrom + '//<![CDATA['.length, cTo));
      for (const [what, text] of [['head', head], ['markup', markup], ['tags', el(tags)], ['script', script.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '')]]) {
        if (/#\{/.test(text)) throw new Error(`EL left in the ${what}: ` + text.match(/.{0,40}#\{.{0,40}/)[0]);
      }
      // PrimeFaces: p:remoteCommand name="rc_…" posts to the server and replaces the list; oncomplete="window.ctAfterDocsLoaded()"
      const rc = `<script>
function rcDocs(op, params) {
  var o = {};
  (params || []).forEach(function (p) { o[p.name] = p.value; });
  return fetch('/triplesale/__rc/docs?op=' + op + '&pid=' + encodeURIComponent(o.pid) + '&docNo=' + encodeURIComponent(o.docNo || '')).then(function (r) { return r.text(); }).then(function (html) {
    var list = document.getElementById('ctDocForm:ctDocList');
    list.outerHTML = html;
    window.ctAfterDocsLoaded();
  });
}
window.rc_ctLoadDocs = function (params) { return rcDocs('load', params); };
window.rc_ctDeleteDoc = function (params) { return rcDocs('delete', params); };
</script>`;
      return shell.build('home', '2', lang === 'en' ? 'h-prospects-en.html' : 'h-prospects.html', {
        // (the head goes where <ui:insert name="head"/> sits in template.xhtml: after project_root.css, before the template styles)
        headEarly: head + (lang === 'en' ? `\n<script>document.cookie = 'cmp_lang=en; path=/';</script>` : ''),
        content: markup + `\n${el(tags)}\n${rc}\n<script>${script}</script>`,
        tail: shell.TEMPLATE_SCRIPTS(lang),
      });
    };
    return { '/triplesale/pages/contracts.html': buildLang('th'), '/triplesale/pages/contracts-en.html': buildLang('en') };
  },

  /** a fresh backend for one scenario run (its own module instance: the mock keeps what the user changed at module level) */
  async newState({ delay }, ctx) {
    const mock = await ctx.loadTs(join(ctx.ngRoot, MOCK));
    mock.resetMockProspects?.();
    const docs = await ctx.loadTs(join(ctx.ngRoot, DOCS));
    const countries = await ctx.loadTs(join(ctx.ngRoot, COUNTRIES));
    return { mock, docs, countries, delay, backends: {} };
  },

  /**
   * --live: the FILE SERVER of the fake REST service. The attachments of the service carry the address of their file here
   * (http://<harness>/__files/prospect/<epoch>/<name>, absolute like the real service's); the live backend fetches it itself (the probe after an
   * upload, /docproxy for the preview of a PDF and the download). Same answers as the mock's /docproxy; a picture asked for by an <img> (not by fetch)
   * is 404 — in the Java replica the address `prospect/<epoch>/<name>` is relative to the page and nothing is there, and the page should look the same.
   * null = not mine.
   */
  async files(req, state) {
    if (!req.path.startsWith('/__files/')) return null;
    const rel = req.path.slice('/__files/'.length);
    // the files the mock calls missing (/docproxy answers 502 UPSTREAM_404), and the files of the upload hook UNVERIFIED: the mock says they were stored
    // but cannot be verified — the check after the upload (HEAD) finds nothing, while the file itself is served (the replica's /docproxy serves it)
    const notFound = /missing/.test(rel) || (/UNVERIFIED/.test(rel) && req.method === 'HEAD');
    if (notFound || req.headers['sec-fetch-dest'] === 'image') return { status: 404, headers: { 'content-type': 'text/plain' }, body: 'not found' };
    if (req.method === 'HEAD') return { status: 200, headers: {}, body: '' };
    const backend = (state.backends.th ??= state.mock.createMockProspects({ delayMs: 0, lang: 'th' }));
    const r = await backend.fetch('/docproxy?url=' + encodeURIComponent(rel));
    return { status: r.status, headers: Object.fromEntries(r.headers), body: Buffer.from(await r.arrayBuffer()) };
  },

  /**
   * --live: the REST service (triplesale-service) as the Java code consumes it, answered from the SAME fixtures as the mock the Java replica runs
   * (state.mock: the cast of customers, the master data, the documents, the leads that were created). The shapes are those the Java code reads:
   *   GET /prospects                  { status, result: [row of ProspectResDTO], meta: { page, perPage, total, totalPages } } — the row has only what the
   *                                   LIST has (no code, sex, e-mail … unless the X-FULL hook says the service carries them)
   *   GET /prospects/{id}/quick-view  { status, result: { code, sex (M/F), customerType, prospectEmail …, the address by its parts, salePerson*, … } }
   *   GET|POST /prospects/{id}/attachments, DELETE …/{no}     { status, result: [ { detailOrderNo, attachFile (absolute), description, attachFileTypeCode } ] }
   *   POST /leads, PATCH /leads/assign, GET /master-data/…     the envelope { status, message, result }
   * The hooks of the fake (a search text X-…, a file name *FAIL* / *UNVERIFIED* / *SLOW*) are played the way the real service would answer them.
   */
  async upstream(req, state) {
    if (req.api !== 'service') return null;
    const mock = state.mock;
    const backend = (state.backends.th ??= mock.createMockProspects({ delayMs: 0, lang: 'th' })); // the service answers Thai names only
    const q = new URLSearchParams(req.search ?? '');
    const delay = () => (state.delay ? sleep(state.delay) : undefined);
    const ask = async (url, init) => {
      const r = await backend.fetch(url, init);
      return { status: r.status, body: await r.json() };
    };
    const envelope = (result) => ({ status: 200, body: { status: 200, message: 'success', result } });
    const abs = (rel) => `http://${req.headers.host}/__files/${rel}`;
    const sexCode = (th) => (th === 'ชาย' ? 'M' : th === 'หญิง' ? 'F' : '');
    const typeCode = (th) => (th === 'องค์กร' ? 'juristic' : th ? 'person' : '');
    const m = (re) => re.exec(req.path);

    // ---- the list: ProspectResDTO rows (the customers are those of the mock; filters, sort and paging are the mock's)
    if (req.method === 'GET' && req.path === '/prospects') {
      await delay();
      const hook = (q.get('searchText') ?? '').trim().toUpperCase();
      const fail = /^X-ERR-(\d+)$/.exec(hook);
      if (fail) return Number(fail[1]) === 0 ? { destroy: true } : { status: Number(fail[1]), body: { status: Number(fail[1]), message: 'upstream error' } };
      const mq = new URLSearchParams();
      for (const k of ['page', 'perPage', 'searchText', 'sortBy', 'currentCityId', 'currentDistrictId', 'salePersonId']) if (q.has(k)) mq.set(k, q.get(k));
      if (q.has('marketingChannelIds')) mq.set('marketingChannelIds', q.getAll('marketingChannelIds').join(','));
      const { body } = await ask('/board/prospect-list?' + mq);
      const rows = body.result.items.map((it) => {
        const p = mock.mockProspect(it.id);
        const row = {
          id: p.id, name: p.name, contactDate: p.contact, marketingChanelName: p.source, customerTel: p.tel, phoneCountryCode: p.phonecc, countryCode: p.countrycode,
          currentAddress: p.address, currentSubDistrictName: p.subDistrict, currentDistrictName: p.district, currentCityName: p.province, currentPostId: p.postId,
          currentCountryName: p.countryEn, currentCountryCode: p.countryCode,
          salePersonCode: p.sale?.code ?? '', salePersonName: p.sale?.name ?? '', saleGroupName: p.team, employeeCode: '', employeeName: p.recorder, attachFile: p.avatar,
        };
        // X-FULL: a service that carries them on the list (the list spells Instagram wrong, the quick-view right)
        return hook === 'X-FULL'
          ? { ...row, code: p.code, sex: sexCode(p.sex), customerType: typeCode(p.type), prospectEmail: p.email, prospectLine: p.line, prospectFacebook: p.fb, prospectTwitter: p.x, prospectInstragram: p.ig, convenient: p.convenient }
          : row;
      });
      const meta = hook === 'X-NOMETA' ? undefined : body.result.meta;
      return { status: 200, body: { status: 200, message: 'success', result: rows, ...(meta ? { meta } : {}) } };
    }

    // ---- the detail of one row
    let g = req.method === 'GET' ? m(/^\/prospects\/(\d+)\/quick-view$/) : null;
    if (g) {
      if (state.delay) await sleep(Math.min(state.delay, 8)); // (the page asks for a whole page of them, one at a time)
      const p = mock.mockProspect(Number(g[1]));
      if (!p) return { status: 404, body: { status: 404, message: 'not found' } };
      if (Number(g[1]) >= mock.BROKEN_FROM) return { status: 500, body: { status: 500, message: 'Internal Server Error' } }; // the enrich-fail hook
      return envelope({
        code: p.code, sex: sexCode(p.sex), customerType: typeCode(p.type), prospectEmail: p.email, prospectLine: p.line, prospectFacebook: p.fb, prospectTwitter: p.x, prospectInstagram: p.ig,
        convenient: p.convenient, // (no contactBackName: the quick-view has none)
        currentAddress: p.address, currentSubDistrictName: p.subDistrict, currentDistrictName: p.district, currentCityName: p.province, currentPostId: p.postId,
        currentCountryName: p.countryEn, currentCountryCode: p.countryCode,
        salePersonCode: p.sale?.code ?? '', salePersonName: p.sale?.name ?? '', saleGroupName: p.team, employeeCode: '', employeeName: p.recorder,
      });
    }

    // ---- the documents of a customer
    g = m(/^\/prospects\/(\d+)\/attachments(?:\/(\d+))?$/);
    if (g) {
      await delay();
      const id = Number(g[1]);
      if (req.method === 'GET' && g[2] === undefined) {
        const { body } = await ask('/board/prospect/attachments?prospectId=' + id);
        return envelope(body.result.map((a) => ({ ...a, attachFile: abs(a.attachFile) })));
      }
      if (req.method === 'POST' && g[2] === undefined) {
        const b = req.body ?? {};
        const r = await ask('/board/prospect/attachments', { method: 'POST', body: JSON.stringify({ prospectId: id, fileContentBase64: b.fileContentBase64 ?? b.attachFileBase64, fileName: b.fileName, description: b.description }) });
        if (r.status !== 200) return { status: r.status, body: r.status === 500 ? '' : r.body }; // (a file called *FAIL*: the service answers 500 and says nothing)
        return { status: 201, body: { status: 201, message: 'Created', result: { attachFile: abs(r.body.result.attachFile) } } };
      }
      if (req.method === 'DELETE' && g[2] !== undefined) {
        const r = await ask(`/board/prospect/attachments?prospectId=${id}&docNo=${g[2]}`, { method: 'DELETE' });
        return r.status === 200 ? { status: 200, body: '' } : { status: r.status, body: 'not found' };
      }
    }

    // ---- creating a lead: the mock decides (validation error, HTTP 500, the next lead number); the owner is set by PATCH /leads/assign
    if (req.method === 'POST' && req.path === '/leads') {
      await delay();
      const b = req.body ?? {};
      const r = await ask('/board/lead-create', { method: 'POST', body: JSON.stringify({ prospectId: b.prospectId, movementTypeId: b.movementTypeId, procedureGroupId: b.procedureGroupId }) });
      return { status: r.status, body: r.body };
    }
    if (req.method === 'PATCH' && req.path === '/leads/assign') {
      await delay();
      const b = req.body ?? {};
      // employee 108 is the one the fake cannot assign (what the mock answers for a lead created with that owner)
      return b.employeeId === 108
        ? { status: 400, body: { status: 400, message: 'ไม่สามารถมอบหมายให้พนักงานคนนี้ได้ (ทดสอบ)' } }
        : { status: 200, body: { status: 200, message: 'OK' } };
    }

    // ---- master data (the mock answers the BFF shape; the service's is the envelope)
    if (req.method === 'GET') {
      let url = null;
      let asList = true;
      if (req.path === '/master-data/marketing-channels') [url, asList] = ['/board/chat-master-data?type=marketing-channels', false];
      else if (req.path === '/master-data/provinces') url = '/board/provinces';
      else if (req.path === '/master-data/districts') url = '/board/districts?provinceId=' + encodeURIComponent(q.get('provinceId') ?? '');
      else if (req.path === '/master-data/sale-persons') url = '/board/sale-persons';
      else if (req.path === '/master-data/employees') url = '/board/employees';
      else if (req.path === '/master-data/movement-types/LD') url = '/board/movement-types';
      else if (req.path === '/master-data/activity-groups') [url, asList] = ['/board/master/activity-groups?movementTypeId=' + encodeURIComponent(q.get('movementTypeId') ?? ''), false];
      else if (req.path === '/master-data/employees/by-activity-group') [url, asList] = ['/board/master/employees-by-activity-group?activityGroupId=' + encodeURIComponent(q.get('activityGroupId') ?? ''), false];
      else if (req.path === '/master-data/countries') {
        await delay();
        const r = state.countries.mockCountriesResponse();
        return { status: 200, body: await r.text() };
      }
      if (url) {
        await delay();
        const r = await ask(url);
        return asList ? envelope(r.body) : { status: r.status, body: r.body };
      }
    }
    return null;
  },

  /** the BFF the Java page calls (+ /docproxy, the country master, the remote commands); null = not mine */
  async handle(req, state, ctx) {
    if (req.path.startsWith('/__files/')) return this.files(req, state);
    if (!req.path.startsWith('/triplesale/')) return null;
    const rel = req.path.slice('/triplesale'.length);
    const lang = /(?:^|;\s*)cmp_lang=en/.test(req.headers.cookie ?? '') ? 'en' : 'th';
    const backend = (state.backends[lang] ??= state.mock.createMockProspects({ delayMs: 0, lang }));
    const reply = async (r) => ({ status: r.status, headers: Object.fromEntries(r.headers), body: Buffer.from(await r.arrayBuffer()) });
    if (rel === '/board/chat-master-data' && /type=countries/.test(req.search)) {
      if (state.delay) await sleep(state.delay);
      return reply(state.countries.mockCountriesResponse());
    }
    if (rel === '/__rc/docs') {
      if (state.delay) await sleep(state.delay);
      const q = new URL(req.path + req.search, 'http://x').searchParams;
      const f = (input, init) => backend.fetch(input, init);
      const docs = q.get('op') === 'delete' ? await state.docs.deleteProspectDoc(f, q.get('pid'), q.get('docNo')) : await state.docs.loadProspectDocs(f, q.get('pid'));
      return { status: 200, headers: { 'content-type': 'text/html; charset=utf-8' }, body: Buffer.from(await renderDocList(ctx, docs, lang)) };
    }
    if (rel.startsWith('/board/') || rel === '/docproxy') {
      if (state.delay) await sleep(state.delay);
      const r = await backend.fetch(rel + req.search, { method: req.method, body: req.body });
      return reply(r);
    }
    return null;
  },
};

/** the list as JSF renders it after the remote command: <ui:repeat> over the documents, or the "no attachments" line (read from the Java file) */
async function renderDocList(ctx, docs, lang) {
  const src = ctx.shell.read('pages/contracts.xhtml').replace(/\r\n/g, '\n');
  const repeat = /<ui:repeat value="#\{contractView\.prospectDocs\}" var="doc">([\s\S]*?)<\/ui:repeat>/.exec(src)[1];
  const empty = /<ui:fragment rendered="#\{empty contractView\.prospectDocs\}">([\s\S]*?)<\/ui:fragment>/.exec(src)[1];
  const th = lang === 'en' ? ctx.readJson('public/assets/i18n/en.json') : ctx.shell.th;
  const msg = (s) => s.replace(/#\{commonBean\.msg\['([\w.]+)'\]\}/g, (_m, k) => escHtml(th[k] ?? k));
  const rows = docs.map((doc) =>
    msg(facesToHtml(repeat.replace(/<!--[\s\S]*?-->/g, '')))
      .replace(/#\{doc\.(no|attachfile|filename|kind)\}/g, (_m, k) => escHtml(doc[k])),
  );
  return `<div id="ctDocForm:ctDocList" class="ct-doc-list">${docs.length ? rows.join('') : msg(facesToHtml(empty))}</div>`;
}
