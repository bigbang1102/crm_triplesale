// Comparison setup of DrillDown (/crm/drilldown/:code) — see tools/compare/README.md for the interface of a page.
//
// Java side: the REAL page (the <link>s, the <style> and the drag_scroll.js include of the head of drilldown.xhtml, the markup and the page
// script of its content, EL resolved the way the server would) inside the shell replica; its one request (the servlet /triplesale/board/drilldown) is
// answered by the SAME mock the Angular page runs (drilldown.mock.ts). The report is chosen by `?code=` on the Java side (the page reads
// location.search itself) and by the route segment on the Angular side — `opts.code` of a scenario (default T-CS-01; '' = no code at all).
import { join } from 'node:path';
import { facesToHtml } from '../../../lib/port-kit.mjs';

const MOCK = 'src/app/features/drilldown/drilldown.mock.ts';
const COLUMNS = 'src/app/features/drilldown/drilldown.columns.ts';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

export default {
  name: 'drilldown',
  roots: ['.ct-root', '#ddFMenu'],
  // the first answer is drawn: rows, or a message row, and the pager (also on the failure paths)
  ready: `document.querySelector('#ddPager .dd-pg-btn') && (document.querySelector('#ddBody tr[data-row]') || document.querySelector('#ddBody td.dd-msg'))`,
  javaPath: (lang, opts) => `/triplesale/drilldown${lang === 'en' ? '-en' : ''}.html${opts.code === '' ? '' : `?code=${encodeURIComponent(opts.code ?? 'T-CS-01')}`}`,
  ngPath: (_lang, opts) => `/crm/drilldown/${encodeURIComponent(opts.code || 'T-CS-01')}`,
  latencyMs: 150,
  // helpers of this page's scenarios (they run in the page)
  pre: `
var waitTable = async function () { await waitFor(function () { return $('#ddPager .dd-pg-btn') && ($('#ddBody tr[data-row]') || $('#ddBody td.dd-msg')); }); await sleep(250); };
var caretOf = function (label) {
  var ths = $$('#ddHead th');
  for (var i = 0; i < ths.length; i++) if (ths[i].textContent.trim() === label) return ths[i].querySelector('.dd-cf');
  throw new Error('no filterable column "' + label + '"');
};
var openFilter = async function (label) { click(caretOf(label)); await sleep(250); };
var goPage = async function (n) { click('#ddPager .dd-pg-btn[data-page="' + n + '"]'); await sleep(300); await waitTable(); };
var navBtn = async function (nav) { click('#ddPager .dd-pg-btn[data-nav="' + nav + '"]'); await sleep(300); await waitTable(); };
var tick = function (text) {
  var items = $$('#ddFMenuList .dd-fmenu-item');
  for (var i = 0; i < items.length; i++) if (items[i].textContent.trim() === text) { items[i].querySelector('input').click(); return; }
  throw new Error('no value "' + text + '" in the filter list');
};
var colIndex = function (label) {
  var ths = $$('#ddHead th');
  for (var i = 0; i < ths.length; i++) if (ths[i].textContent.trim() === label) return i;
  throw new Error('no column "' + label + '"');
};
var cellText = function (row, label) { return $$('#ddBody tr[data-row]')[row].children[colIndex(label)].textContent.trim(); };
// the CSV export: the anchor click and the blob URL are stubbed on both sides; what was exported is written into the page root as an
// attribute (the file name without its time stamp, the type, the text) so that it is part of the dump
var stubDownload = function () {
  win.__dl = null;
  URL.createObjectURL = function (b) { win.__blob = b; return 'blob:stub'; };
  URL.revokeObjectURL = function () {};
  HTMLAnchorElement.prototype.click = function () { win.__dl = { name: this.download, href: this.href }; };
};
var recordDownload = async function () {
  var d = win.__dl, bytes = d ? new Uint8Array(await win.__blob.arrayBuffer()) : null;
  var bom = !!bytes && bytes[0] === 0xEF && bytes[1] === 0xBB && bytes[2] === 0xBF;
  var text = bytes ? new TextDecoder('utf-8', { ignoreBOM: false }).decode(bytes) : '';
  $('.ct-root').setAttribute('data-export', JSON.stringify(d ? { name: d.name.replace(/\\d{12}/, 'STAMP'), href: d.href, type: win.__blob.type, bom: bom, text: text } : null));
};
`,

  /** builds the Java replica pages; returns { url path -> file } */
  async build(ctx) {
    const { shell } = ctx;
    const src = shell.read('pages/drilldown.xhtml').replace(/\r\n/g, '\n');
    const section = (name) => {
      const open = src.indexOf(`<ui:define name="${name}">`);
      if (open < 0) throw new Error(`no ui:define ${name}`);
      return src.slice(open + `<ui:define name="${name}">`.length, src.indexOf('</ui:define>', open));
    };
    const headRaw = section('head');
    const content = section('content');
    const mFrom = content.indexOf('<div class="ct-root">');
    const sFrom = content.indexOf('<script type="text/javascript">');
    const cFrom = content.indexOf('//<![CDATA[', sFrom);
    const cTo = content.indexOf('//]]>', cFrom);
    if (mFrom < 0 || sFrom < 0 || cFrom < 0 || cTo < 0) throw new Error('drilldown.xhtml: markup / script boundaries not found');

    const buildLang = (lang) => {
      const th = lang === 'en' ? ctx.readJson('public/assets/i18n/en.json') : shell.th;
      const msg = (k) => {
        if (!(k in th)) throw new Error('no message ' + k);
        return th[k];
      };
      // the EL the server resolves: messages, the context path, the language of the session
      const el = (s) =>
        s
          .replace(/#\{commonBean\.msg\['([\w.]+)'\]\}/g, (_m, k) => msg(k))
          .replace(/#\{request\.contextPath\}/g, '/triplesale')
          .replace(/#\{commonBean\.currentLang\}/g, lang);

      const head = el(headRaw.replace(/<!--[\s\S]*?-->/g, ''));
      let markup = content.slice(mFrom, sFrom).replace(/<!--[\s\S]*?-->/g, '');
      // Facelets writes <tag/> of XHTML as <tag></tag> (only void elements keep the short form)
      markup = el(facesToHtml(markup));
      const script = el(content.slice(cFrom + '//<![CDATA['.length, cTo));
      for (const [what, text] of [['head', head], ['markup', markup], ['script', script.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '')]]) {
        if (/#\{/.test(text)) throw new Error(`EL left in the ${what}: ` + text.match(/.{0,40}#\{.{0,40}/)[0]);
      }
      // the head goes where <ui:insert name="head"/> sits in template.xhtml (after project_root.css, before the template styles)
      return shell.build('home', '3', lang === 'en' ? 'h-drilldown-en.html' : 'h-drilldown.html', {
        headEarly: head,
        content: markup + `\n<script type="text/javascript">${script}</script>`,
        tail: shell.TEMPLATE_SCRIPTS(),
      });
    };
    return { '/triplesale/drilldown.html': buildLang('th'), '/triplesale/drilldown-en.html': buildLang('en') };
  },

  /** a fresh backend for one scenario run (its own module instance); live = a --live run, hook = what the fake REST service plays (opts.live.hook) */
  async newState({ delay, hook, live }, ctx) {
    const mock = await ctx.loadTs(join(ctx.ngRoot, MOCK));
    mock.resetMockDrilldown?.();
    const columns = await ctx.loadTs(join(ctx.ngRoot, COLUMNS));
    return { backend: mock.createMockDrilldown({ delayMs: 0 }), delay, hook: hook || '', live: !!live, columns };
  },

  /** the servlet the Java page calls; null = not mine */
  async handle(req, state) {
    if (req.path !== '/triplesale/board/drilldown') return null;
    if (state.delay) await sleep(state.delay);
    // --live: the page was opened for T-CS-01 and the hook says which situation the mock plays (the Angular side's fake service plays the same one)
    const search = state.live && state.hook ? req.search.replace(/([?&]code=)[^&]*/, '$1' + encodeURIComponent(state.hook)) : req.search;
    const r = await state.backend.fetch('/board/drilldown' + search, { method: req.method });
    let body = Buffer.from(await r.arrayBuffer());
    if (state.live) {
      // a --live run compares with what the REST service really gives: REAL data, so no "sample data" flag (the pill) — everything else as the mock says
      const text = body.toString('utf8');
      try {
        const o = JSON.parse(text);
        if (o?.data && 'mock' in o.data) {
          delete o.data.mock;
          if (o.message === 'Success (mock)') o.message = 'Success';
          body = Buffer.from(JSON.stringify(o), 'utf8');
        }
      } catch { /* not JSON (X-ERR-BAD): as it is */ }
    }
    return { status: r.status, headers: { 'content-type': r.headers.get('content-type') ?? 'application/json' }, body };
  },

  /**
   * The fake REST service (--live): GET /drilldown/<apiPath>?fromdate&todate&page&pageSize of triplesale-service, answered from the SAME sample
   * set the Java replica gets. Rows are what the real service would send: objects keyed by the FIELD names of the dictionary (the
   * composite Profile column back as its source fields), an internal `id` / `ROW_NUMBER` in front, and the fields in REVERSE order — so
   * that the page only looks right if the live backend hides the internals and plans the columns by the dictionary.
   * state.hook plays a failure: X-ERR-UP (the service says 403), X-EMPTY (an answer without rows); X-BIG / X-BLANK / X-SLOW = the sample variants of the mock.
   */
  async upstream(req, state) {
    const m = /^\/drilldown\/(\w+)$/.exec(req.path);
    if (req.api !== 'service' || req.method !== 'GET' || !m) return null;
    if (state.delay) await sleep(state.delay);
    if (state.hook === 'X-ERR-UP') return { status: 403, body: {} };
    if (state.hook === 'X-EMPTY') return { status: 200, body: {} };
    const report = state.columns.allReports().find((r) => r.def.apiPath === m[1]);
    if (!report) return { status: 404, body: { status: 404, message: 'no such report ' + m[1] } };
    const q = new URLSearchParams(req.search);
    const hooked = ['X-BIG', 'X-BLANK', 'X-SLOW'].includes(state.hook);
    const ask = new URLSearchParams({ action: 'data', code: hooked ? state.hook : report.def.code });
    for (const k of ['fromdate', 'todate', 'page', 'pageSize']) if (q.has(k)) ask.set(k, q.get(k));
    const r = await state.backend.fetch('/board/drilldown?' + ask, {});
    const env = await r.json();
    if (!env.success) return { status: 500, body: env };
    const sources = Object.fromEntries(report.def.composites.map(([virtual, ...src]) => [state.columns.normalizeKey(virtual), src]));
    const rows = env.data.rows.map((row, i) => {
      const out = {};
      for (const [key, v] of Object.entries(row).reverse()) {
        const src = sources[state.columns.normalizeKey(key)];
        if (!src) out[key] = v;
        else {
          // the mock composed the cell of the sources with single spaces and none of the parts has a space: the parts go back to the fields
          const parts = v.split(' ');
          src.forEach((name, j) => (out[name] = src.length === parts.length ? parts[j] : j === 0 ? v : ''));
        }
      }
      return { id: 1000 + i, ROW_NUMBER: i + 1, ...out };
    });
    return { status: 200, body: { status: 200, message: 'OK', result: rows, total: env.data.total } };
  },
};
