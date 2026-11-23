// Comparison setup of the Report page (/report) — see tools/compare/README.md for the interface of a page.
//
// Java side: the REAL page (the <style> of the head, the markup + script of the content of report.xhtml, EL resolved the way the server
// would) inside the shell replica. Its data file (resources/mock/report_mock.json) is served straight from the Java project; the master
// data of the filters and the report URL come from the SAME mock the Angular page runs (report.mock.ts).
import { join } from 'node:path';
import { expandIncludes, facesToHtml, splitSection, uiDefines } from '../../../lib/port-kit.mjs';

const MOCK = 'src/app/features/report/report.mock.ts';

export default {
  name: 'report',
  roots: ['.rpt-root', '.swal-overlay'],
  // the skeleton cards are replaced when the data file arrived
  ready: `document.querySelector('.rpt-root') && document.querySelector('#rptGroups') && !document.querySelector('#rptGroups .rpt-sk')`,
  javaPath: () => '/triplesale/report.html',
  ngPath: () => '/report',
  latencyMs: 120,
  // helpers of this page's scenarios: stub window.open (both sides record the call), read what the page asked to open
  pre: `
var openCalls = [];
var stubOpen = function () { openCalls = []; win.open = function (u, t) { openCalls.push([String(u), t]); return { closed: false, location: {} }; }; };
var pickReport = async function (code, ms) { click('.rpt-item[data-code="' + code + '"]'); await sleep(ms || 700); };
// what a report URL asks for, as a sorted "k=v&…" string: Java opens /triplesale/report-pdf?…, Angular a blob URL of a PDF that lists the same pairs
var openedAs = async function () {
  var out = [];
  for (var i = 0; i < openCalls.length; i++) {
    var u = openCalls[i][0], pairs = [];
    if (u.indexOf('blob:') === 0) {
      var txt = await (await fetch(u)).text();
      txt.split('\\n').forEach(function (l) { var m = /^\\((.*) = (.*)\\) Tj ET$/.exec(l.replace(/^BT \\/F1 12 Tf 50 \\d+ Td /, '')); if (m) pairs.push(m[1] + '=' + m[2]); });
    } else {
      new URL(u, location.href).searchParams.forEach(function (v, k) { pairs.push(k + '=' + v); });
    }
    out.push(pairs.sort().join('&') + ' | ' + openCalls[i][1]);
  }
  return out;
};
// the page cannot show it (it is another tab): write it into the page so that it is part of the dump
var noteOpened = async function () { $('.rpt-root').setAttribute('data-opened', (await openedAs()).join(' ;; ')); };
`,

  /** builds the Java replica pages; returns { url path -> file } */
  async build(ctx) {
    const { shell } = ctx;
    const mock = await ctx.loadTs(join(ctx.ngRoot, MOCK));
    const perm = mock.createMockReport().initial({ hasRole: () => true }).reportPermJson;

    const defines = uiDefines(shell.read('pages/report.xhtml'), 'report.xhtml');
    const head = splitSection(defines['head']);
    const content = splitSection(expandIncludes(defines['content'], shell.read, 'pages', 'report.xhtml'));
    // (the real page also sets the dark rules etc. from its own <style>; nothing else comes from the head)
    let script = content.scripts[0].replace('#{commonBean.reportPermJson}', JSON.stringify(perm));
    if (/#\{/.test(script)) throw new Error('EL left in the report script');

    const file = shell.build('report', '0', 'h-report.html', {
      head: `<style>${head.styles[0]}</style>`,
      content: facesToHtml(content.markup) + `\n<script>${script}</script>`,
      tail: `<script>try { sessionStorage.setItem('ts_username', 'demo'); } catch (e) {}</script>\n${shell.TEMPLATE_SCRIPTS()}`,
    });
    return { '/triplesale/report.html': file };
  },

  /** a fresh backend for one scenario run (its own module instance) */
  async newState({ delay }, ctx) {
    const mock = await ctx.loadTs(join(ctx.ngRoot, MOCK));
    return { backend: mock.createMockReport({ delayMs: 0 }), delay };
  },

  /** the master data of the filters (and the PDF) the Java page asks the BFF for; null = not mine */
  async handle(req, state) {
    if (!/^\/triplesale\/(board\/|report-pdf)/.test(req.path)) return null;
    if (state.delay) await new Promise((r) => setTimeout(r, state.delay));
    const r = await state.backend.fetch(req.path.slice('/triplesale'.length) + req.search, { method: req.method });
    return { status: r.status, headers: { 'content-type': r.headers.get('content-type') ?? 'application/json' }, body: Buffer.from(await r.arrayBuffer()) };
  },

  /**
   * The fake REST service (--live): the master-data lists the filters of the page ask for, answered from the SAME mock the Java replica
   * gets. The mock's chat-master-data answers are already the envelope of the service ({status, message, result:[{code,name}]}); its employees
   * are a bare array, which the service wraps in `result`.
   */
  async upstream(req, state) {
    if (req.api !== 'service' || req.method !== 'GET') return null;
    const types = {
      '/master-data/sale-persons': 'sale-persons',
      '/master-data/communication-types': 'communication-types',
      '/master-data/prospects/search': 'prospects',
      '/master-data/marketing-channels': 'marketing-channels',
    };
    if (state.delay) await new Promise((r) => setTimeout(r, state.delay));
    if (types[req.path]) {
      const r = await state.backend.fetch('/board/chat-master-data?type=' + types[req.path]);
      return { status: r.status, body: await r.json() };
    }
    if (req.path === '/master-data/employees') {
      const r = await state.backend.fetch('/board/employees');
      return { status: 200, body: { status: 200, message: 'success', result: await r.json() } };
    }
    return null;
  },
};
