// Scenarios of the Report comparison. Each function is run INSIDE the page under test (Java replica / Angular app) with
// (sleep, side, win) in scope, after the prelude of lib/scenario-pre.mjs and the page prelude (`pre` in page.mjs: stubOpen(), pickReport(), noteOpened()).
// add(name, opts, fn):  opts = { w, h, theme: 'light'|'dark', lang: 'th'|'en', settle, wait, roots, frames, ready }
export default function (add) {
  // --live: the report PDF has no REST endpoint (see features/report/report.live.ts), so the Angular tab shows a text instead of the PDF the mock makes;
  // the scenarios that read what the page opened (noteOpened) are skipped there — the mock run proves the URL the page builds
  var addPlain = add;
  add = function (name, opts, fn) {
    addPlain(name, String(fn).indexOf('noteOpened()') >= 0 ? Object.assign({}, opts, { live: false }) : opts, fn);
  };
  // the 15 reports that are in the report registry (SUN-LD-08 is in the data file but not in the registry: neither side shows it)
  const CODES = ['CRMG10', 'CRMG11', 'CRMG12', 'CRMG13', 'CRMG14', 'SUN-LD-01', 'SUN-LD-02', 'SUN-LD-03', 'SUN-LD-04', 'SUN-LD-05', 'SUN-LD-06', 'SUN-LD-07', 'SUN-LD-09', 'GGW-LD-01', 'GGW-LD-02'];
  const q = (s) => JSON.stringify(s);

  /* ---- first paint, themes, viewports ---- */
  add('overview', {}, async function () {});
  add('overview-dark', { theme: 'dark' }, async function () {});
  [[390, 844], [768, 1024], [1024, 768], [1920, 1080]].forEach(function (s) {
    add('overview-' + s[0], { w: s[0], h: s[1] }, async function () {});
  });
  add('overview-dark-390', { theme: 'dark', w: 390, h: 844 }, async function () {});
  add('en-overview', { lang: 'en' }, async function () {});
  add('fs-plus', {}, 'fontAdj("2px"); await sleep(600);');
  add('fs-minus', {}, 'fontAdj("-2px"); await sleep(600);');
  add('fs-plus-select', {}, 'fontAdj("2px"); await pickReport("CRMG10", 1000);');

  /* ---- every report: the filter panel it builds (selects load their options from master data) ---- */
  CODES.forEach(function (c) {
    add('select-' + c, {}, 'await pickReport(' + q(c) + ', 1200);');
  });
  add('select-dark', { theme: 'dark' }, 'await pickReport("SUN-LD-06", 1200);');
  add('select-390', { w: 390, h: 844 }, 'await pickReport("CRMG11", 1200);');
  add('select-768', { w: 768, h: 1024 }, 'await pickReport("SUN-LD-03", 1200);');
  add('select-dark-390', { theme: 'dark', w: 390, h: 844 }, 'await pickReport("SUN-LD-05", 1200);');
  add('select-then-other', {}, 'await pickReport("CRMG10", 900); await pickReport("SUN-LD-06", 1200);');
  add('select-keyboard', {}, 'var el = $(".rpt-item[data-code=\\"GGW-LD-01\\"]"); el.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true })); await sleep(1200);');

  /* ---- search ---- */
  add('search-sun', {}, 'typeIn("#rptSearch", "SUN"); await sleep(300);');
  add('search-code', {}, 'typeIn("#rptSearch", "crmg1"); await sleep(300);');
  add('search-none', {}, 'typeIn("#rptSearch", "zzz"); await sleep(300);');
  add('search-thai', {}, 'typeIn("#rptSearch", "ลูกค้า"); await sleep(300);');
  add('search-then-clear', {}, 'typeIn("#rptSearch", "SUN"); await sleep(200); typeIn("#rptSearch", ""); await sleep(300);');
  add('search-keeps-selection', {}, 'await pickReport("SUN-LD-02", 900); typeIn("#rptSearch", "SUN-LD-0"); await sleep(300);');

  /* ---- the buttons of the filter panel ---- */
  add('clear-filters', {}, 'await pickReport("CRMG10", 1200); var s = $("#rptSide select"); if (s && s.options.length > 1) pick(s, s.options[1].value); await sleep(200); click("#rptClear"); await sleep(700);');
  add('clear-filters-dark', { theme: 'dark' }, 'await pickReport("SUN-LD-02", 1200); click("#rptClear"); await sleep(700);');
  add('run-required-missing', {}, 'await pickReport("SUN-LD-06", 1200); click("#rptRun"); await sleep(700);');
  add('run-ok', {}, 'stubOpen(); await pickReport("CRMG10", 1000); click("#rptRun"); await sleep(900); await noteOpened();');
  add('run-with-selects', {}, 'stubOpen(); await pickReport("SUN-LD-02", 1200); $$("#rptSide select").forEach(function (s) { if (s.options.length > 1) pick(s, s.options[s.options.length - 1].value); }); click("#rptRun"); await sleep(900); await noteOpened();');
  add('run-with-prospect', {}, 'stubOpen(); await pickReport("SUN-LD-06", 1400); pick("#f_prospect", $("#f_prospect").options[2].value); click("#rptRun"); await sleep(900); await noteOpened();');
  add('run-date-range', {}, 'stubOpen(); await pickReport("SUN-LD-01", 1200); var f = $("#f_dateRange_from"); if (f) { typeIn(f, "01/03/2026"); typeIn("#f_dateRange_to", "31/03/2026"); } click("#rptRun"); await sleep(900); await noteOpened();');
  add('run-popup-blocked', {}, 'win.open = function () { return null; }; await pickReport("CRMG11", 1000); click("#rptRun"); await sleep(900);');
  ['GGW-LD-02', 'CRMG14', 'SUN-LD-09'].forEach(function (c) {
    add('run-' + c, {}, 'stubOpen(); await pickReport(' + q(c) + ', 1200); click("#rptRun"); await sleep(900); await noteOpened();');
  });
}
