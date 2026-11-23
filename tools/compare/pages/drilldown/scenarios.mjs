// Scenarios of the DrillDown comparison. Each function is run INSIDE the page under test (Java replica / Angular app) with
// (sleep, side, win) in scope, after the prelude of lib/scenario-pre.mjs and the page prelude (`pre` in page.mjs: waitTable, openFilter,
// goPage, navBtn, tick, cellText, stubDownload, recordDownload).
// add(name, opts, fn):  opts = { w, h, theme: 'light'|'dark', lang: 'th'|'en', settle, wait, roots, frames, ready, code }
//   code: the report ('' = no code at all, the page opens T-CS-01); the codes X-… are test hooks of drilldown.mock.ts.
export default function (add) {
  var REPORTS = ['T-CS-01', 'T-PLS-01', 'T-PLS-02', 'T-PLS-03', 'T-LS-01', 'T-LS-02', 'T-LS-03', 'T-LS-04', 'T-LS-05', 'T-LE-01', 'T-FI-01'];
  var FONT = function (v) { return 'fontAdj(' + JSON.stringify(v) + ');'; };

  // --live (the Angular side talks to a fake REST service instead of the mock): the test-hook CODES X-… exist only in drilldown.mock.ts, so on the
  // Angular side such a scenario opens T-CS-01 and the fake service plays the situation (opts.live.hook, see `upstream` of page.mjs). A situation
  // a REST service cannot produce (the servlet threw, a proxy page instead of JSON, the role check of the servlet — the route is guarded) is skipped.
  var LIVE_OF_HOOK = {
    'X-BIG': { code: 'T-CS-01', hook: 'X-BIG' },
    'X-BLANK': { code: 'T-CS-01', hook: 'X-BLANK' },
    'X-SLOW': { code: 'T-CS-01', hook: 'X-SLOW' },
    'X-EMPTY': { code: 'T-CS-01', hook: 'X-EMPTY' },
    'X-ERR-UP': { code: 'T-CS-01', hook: 'X-ERR-UP' },
    'X-REAL': { code: 'T-CS-01' },
    'X-ERR-403': false,
    'X-ERR-500': false,
    'X-ERR-BAD': false
  };
  var addPlain = add;
  add = function (name, opts, fn) {
    var live = LIVE_OF_HOOK[String((opts && opts.code) || '').toUpperCase()];
    addPlain(name, live === undefined ? opts : Object.assign({}, opts, { live: live }), fn);
  };

  /* ---- first paint: themes, viewports, languages, the A A A buttons ---- */
  add('overview', {}, async function () {});
  add('overview-dark', { theme: 'dark' }, async function () {});
  add('overview-1024', { w: 1024, h: 768 }, async function () {});
  add('overview-768', { w: 768, h: 1024 }, async function () {});
  add('overview-390', { w: 390, h: 844 }, async function () {});
  add('overview-1920', { w: 1920, h: 1080 }, async function () {});
  add('overview-dark-390', { w: 390, h: 844, theme: 'dark' }, async function () {});
  add('en-overview', { lang: 'en' }, async function () {});
  add('en-overview-dark', { lang: 'en', theme: 'dark' }, async function () {});
  add('en-overview-390', { lang: 'en', w: 390, h: 844 }, async function () {});
  add('fs-plus', {}, FONT('2px') + ' await sleep(800);');
  add('fs-minus', {}, FONT('-2px') + ' await sleep(800);');
  add('fs-plus-390', { w: 390, h: 844 }, FONT('2px') + ' await sleep(800);');
  // no ?code= at all: the page opens T-CS-01 (the route of the port has the default in the link rule)
  add('default-code', { code: '' }, async function () {});
  // the code of the address is upper-cased by the page
  add('code-lowercase', { code: 't-ls-01' }, async function () {});

  /* ---- each of the 11 reports (their columns come from the server) ---- */
  REPORTS.forEach(function (code) {
    add('report-' + code, { code: code }, async function () {});
  });
  ['T-PLS-01', 'T-LS-01', 'T-LE-01', 'T-FI-01'].forEach(function (code) {
    add('report-' + code + '-dark', { code: code, theme: 'dark' }, async function () {});
  });
  ['T-PLS-03', 'T-LS-03', 'T-LE-01'].forEach(function (code) {
    add('report-' + code + '-390', { code: code, w: 390, h: 844 }, async function () {});
  });
  ['T-PLS-02', 'T-LS-04', 'T-FI-01'].forEach(function (code) {
    add('en-report-' + code, { code: code, lang: 'en' }, async function () {});
  });
  add('fs-plus-report-T-LS-01', { code: 'T-LS-01' }, FONT('2px') + ' await sleep(800);');
  add('report-T-LE-01-1024', { code: 'T-LE-01', w: 1024, h: 768 }, async function () {});

  /* ---- the frozen left columns and the scrolling of the table ---- */
  add('scroll-x', {}, async function (sleep) { $('#ddScroll').scrollLeft = 700; await sleep(400); });
  add('scroll-x-dark', { theme: 'dark' }, async function (sleep) { $('#ddScroll').scrollLeft = 700; await sleep(400); });
  add('scroll-x-end', { code: 'T-LE-01' }, async function (sleep) { var s = $('#ddScroll'); s.scrollLeft = s.scrollWidth; await sleep(400); });
  add('scroll-y', {}, async function (sleep) { var s = $('#ddScroll'); s.scrollTop = 500; s.scrollLeft = 300; await sleep(400); });
  add('scroll-xy-1024', { w: 1024, h: 768 }, async function (sleep) { var s = $('#ddScroll'); s.scrollTop = 300; s.scrollLeft = 400; await sleep(400); });
  // below 900px of table width nothing is frozen
  add('scroll-x-768', { w: 768, h: 1024 }, async function (sleep) { $('#ddScroll').scrollLeft = 400; await sleep(400); });
  // the table wrap changes its width without a window resize (the left menu folds): the offsets are measured again
  add('refreeze-on-wrap-width', {}, async function (sleep) {
    $('#ddScroll').style.width = '800px'; await sleep(600);
    $('#ddScroll').style.width = ''; await sleep(600);
  });
  add('refreeze-on-resize', {}, async function (sleep) {
    window.dispatchEvent(new Event('resize')); await sleep(500);
  });
  // drag to scroll (drag_scroll.js): hold the mouse mid-drag, and after the release
  add('drag-hold', {}, async function (sleep) {
    var cell = $('#ddBody tr[data-row] td:nth-child(8)'), s = $('#ddScroll');
    cell.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, button: 0, clientX: 700, clientY: 300 }));
    document.dispatchEvent(new MouseEvent('mousemove', { bubbles: true, clientX: 400, clientY: 280 }));
    await sleep(300);
  });
  add('drag-release', {}, async function (sleep) {
    var cell = $('#ddBody tr[data-row] td:nth-child(8)');
    cell.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, button: 0, clientX: 700, clientY: 300 }));
    document.dispatchEvent(new MouseEvent('mousemove', { bubbles: true, clientX: 300, clientY: 240 }));
    document.dispatchEvent(new MouseEvent('mouseup', { bubbles: true, clientX: 300, clientY: 240 }));
    await sleep(300);
  });

  /* ---- paging: 100 rows per page, the pager shows a window of 10 page numbers ---- */
  add('pager-p2', { code: 'T-PLS-02' }, 'await goPage(2);');
  add('pager-p2-dark', { code: 'T-PLS-02', theme: 'dark' }, 'await goPage(2);');
  add('pager-p2-390', { code: 'T-PLS-02', w: 390, h: 844 }, 'await goPage(2);');
  add('pager-p3-last', { code: 'T-LS-02' }, 'await goPage(2); await navBtn("last");');
  add('pager-next-prev', { code: 'T-LS-02' }, 'await navBtn("next"); await navBtn("next"); await navBtn("prev");');
  add('pager-first', { code: 'T-LS-02' }, 'await navBtn("last"); await navBtn("first");');
  add('pager-disabled-click', { code: 'T-LS-01' }, 'click($("#ddPager .dd-pg-btn[data-nav=prev]")); await sleep(500);');
  add('pager-active-click', { code: 'T-LS-01' }, 'click($("#ddPager .dd-pg-btn.active")); await sleep(500);');
  add('pager-big', { code: 'X-BIG' }, async function () {});
  add('pager-big-p7', { code: 'X-BIG' }, 'await goPage(7);');
  add('pager-big-p10-next', { code: 'X-BIG' }, 'await goPage(10); await navBtn("next");');
  add('pager-big-last', { code: 'X-BIG' }, 'await navBtn("last");');
  add('pager-big-last-dark', { code: 'X-BIG', theme: 'dark' }, 'await navBtn("last");');
  add('pager-big-last-390', { code: 'X-BIG', w: 390, h: 844 }, 'await navBtn("last");');
  add('en-pager-p2', { code: 'T-PLS-02', lang: 'en' }, 'await goPage(2);');
  // the filter is dropped when the page is loaded again
  add('pager-keeps-no-filter', { code: 'T-PLS-02' }, 'await openFilter("ประเทศ"); tick("ญี่ปุ่น"); click("#ddFMenuApply"); await sleep(300); await goPage(2);');
  // while a page is loading the skeleton rows stand in for the table (the answer of X-SLOW takes 4 s)
  add('loading-skeleton', { code: 'X-SLOW', ready: 'document.querySelector("#ddBody .dd-skel")', settle: 300 }, async function () {});
  add('loading-skeleton-dark', { code: 'X-SLOW', theme: 'dark', ready: 'document.querySelector("#ddBody .dd-skel")', settle: 300 }, async function () {});
  add('loading-skeleton-390', { code: 'X-SLOW', w: 390, h: 844, ready: 'document.querySelector("#ddBody .dd-skel")', settle: 300 }, async function () {});
  // … and when the columns are known the skeleton has one cell per column
  add('loading-skeleton-page2', { code: 'X-SLOW' }, 'click("#ddPager .dd-pg-btn[data-page=\\"2\\"]"); await sleep(300);');

  /* ---- the states of the answer ---- */
  add('state-real-no-pill', { code: 'X-REAL' }, async function () {});
  add('state-unknown-report', { code: 'T-ZZ-99' }, async function () {});
  add('state-unknown-report-dark', { code: 'T-ZZ-99', theme: 'dark' }, async function () {});
  add('en-state-unknown-report', { code: 'T-ZZ-99', lang: 'en' }, async function () {});
  add('state-err-403', { code: 'X-ERR-403' }, async function () {});
  add('state-err-500', { code: 'X-ERR-500' }, async function () {});
  add('state-err-500-dark', { code: 'X-ERR-500', theme: 'dark' }, async function () {});
  add('state-err-up', { code: 'X-ERR-UP' }, async function () {});
  add('state-err-up-390', { code: 'X-ERR-UP', w: 390, h: 844 }, async function () {});
  add('state-err-bad-json', { code: 'X-ERR-BAD' }, async function () {});
  add('en-state-err-bad-json', { code: 'X-ERR-BAD', lang: 'en' }, async function () {});
  add('state-empty', { code: 'X-EMPTY' }, async function () {});
  add('state-empty-dark', { code: 'X-EMPTY', theme: 'dark' }, async function () {});
  add('en-state-empty', { code: 'X-EMPTY', lang: 'en' }, async function () {});
  add('state-empty-export', { code: 'X-EMPTY' }, async function () { stubDownload(); click('#ddExportBtn'); await sleep(300); await recordDownload(); });

  /* ---- the column filter: a list of values to tick ---- */
  add('filter-open', {}, 'await openFilter("ประเทศ");');
  add('filter-open-dark', { theme: 'dark' }, 'await openFilter("ประเทศ");');
  add('filter-open-390', { w: 390, h: 844 }, 'await openFilter("ประเทศ");');
  add('filter-open-768', { w: 768, h: 1024 }, 'await openFilter("PP-Code");');
  add('filter-open-first-col', {}, 'await openFilter("MTH");');
  add('filter-open-last-col', {}, 'var cs = $$("#ddHead .dd-cf"); click(cs[cs.length - 1]); await sleep(250);');
  add('filter-open-scrolled', {}, 'await sleep(100); $("#ddScroll").scrollLeft = 800; await sleep(300); var cs = $$("#ddHead .dd-cf"); click(cs[cs.length - 2]); await sleep(250);');
  add('fs-plus-filter-open', {}, FONT('2px') + ' await sleep(500); await openFilter("ประเทศ");');
  add('en-filter-open', { lang: 'en' }, 'await openFilter("ประเทศ");');
  add('filter-open-long-values', { code: 'T-LS-01' }, 'await openFilter("ชื่อโครงการ, จังหวัด");');
  add('filter-open-profile', {}, 'await openFilter("Profile");');
  add('filter-tick-one', {}, 'await openFilter("ประเทศ"); tick("ญี่ปุ่น"); await sleep(200);');
  add('filter-apply-one', {}, 'await openFilter("ประเทศ"); tick("ญี่ปุ่น"); click("#ddFMenuApply"); await sleep(300);');
  add('filter-apply-one-dark', { theme: 'dark' }, 'await openFilter("ประเทศ"); tick("ญี่ปุ่น"); click("#ddFMenuApply"); await sleep(300);');
  add('filter-apply-one-390', { w: 390, h: 844 }, 'await openFilter("ประเทศ"); tick("ญี่ปุ่น"); click("#ddFMenuApply"); await sleep(300);');
  add('filter-apply-two-values', {}, 'await openFilter("ประเทศ"); tick("ญี่ปุ่น"); tick("ไต้หวัน"); click("#ddFMenuApply"); await sleep(300);');
  add('filter-reopen-shows-ticks', {}, 'await openFilter("ประเทศ"); tick("ญี่ปุ่น"); click("#ddFMenuApply"); await sleep(300); await openFilter("ประเทศ");');
  add('filter-clear-by-unticking', {}, 'await openFilter("ประเทศ"); tick("ญี่ปุ่น"); click("#ddFMenuApply"); await sleep(250); await openFilter("ประเทศ"); tick("ญี่ปุ่น"); click("#ddFMenuApply"); await sleep(300);');
  add('filter-apply-nothing-ticked', {}, 'await openFilter("ประเทศ"); click("#ddFMenuApply"); await sleep(300);');
  add('filter-two-columns', {}, 'await openFilter("ประเทศ"); tick("ญี่ปุ่น"); click("#ddFMenuApply"); await sleep(250); await openFilter("Profile"); var first = $$("#ddFMenuList .dd-fmenu-item")[0]; first.querySelector("input").click(); click("#ddFMenuApply"); await sleep(300);');
  add('filter-no-rows', { code: 'T-LS-01' }, `
    // two values that no row has together: the page shows its "nothing found" row
    await openFilter("ประเทศ"); var countryRow = cellText(0, "ประเทศ"); tick(countryRow); click("#ddFMenuApply"); await sleep(250);
    await openFilter("PP-Code");
    var codes = $$("#ddFMenuList .dd-fmenu-item").map(function (i) { return i.textContent.trim(); });
    var rowsWithCountry = $$("#ddBody tr[data-row]").filter(function (tr) { return tr.style.display !== "none"; }).map(function (tr) { return tr.children[colIndex("PP-Code")].textContent.trim(); });
    var other = codes.filter(function (c) { return rowsWithCountry.indexOf(c) < 0; })[0];
    if (!other) throw new Error("no code outside the first country");
    tick(other); click("#ddFMenuApply"); await sleep(300);`);
  add('filter-no-rows-dark', { code: 'T-LS-01', theme: 'dark' }, `
    await openFilter("ประเทศ"); tick(cellText(0, "ประเทศ")); click("#ddFMenuApply"); await sleep(250);
    await openFilter("PP-Code"); var codes = $$("#ddFMenuList .dd-fmenu-item").map(function (i) { return i.textContent.trim(); });
    var shown = $$("#ddBody tr[data-row]").filter(function (tr) { return tr.style.display !== "none"; }).map(function (tr) { return tr.children[colIndex("PP-Code")].textContent.trim(); });
    tick(codes.filter(function (c) { return shown.indexOf(c) < 0; })[0]); click("#ddFMenuApply"); await sleep(300);`);
  add('en-filter-no-rows', { code: 'T-LS-01', lang: 'en' }, `
    await openFilter("ประเทศ"); tick(cellText(0, "ประเทศ")); click("#ddFMenuApply"); await sleep(250);
    await openFilter("PP-Code"); var codes = $$("#ddFMenuList .dd-fmenu-item").map(function (i) { return i.textContent.trim(); });
    var shown = $$("#ddBody tr[data-row]").filter(function (tr) { return tr.style.display !== "none"; }).map(function (tr) { return tr.children[colIndex("PP-Code")].textContent.trim(); });
    tick(codes.filter(function (c) { return shown.indexOf(c) < 0; })[0]); click("#ddFMenuApply"); await sleep(300);`);
  add('filter-stripes-after-filter', { code: 'T-LS-01' }, 'await openFilter("PP-Code"); tick(cellText(1, "PP-Code")); tick(cellText(4, "PP-Code")); tick(cellText(7, "PP-Code")); click("#ddFMenuApply"); await sleep(300);');
  // the search box of the list
  add('filter-search-typed', {}, 'await openFilter("ประเทศ"); typeIn("#ddFMenuSearch", "ญี่"); await sleep(250);');
  add('filter-search-case', { code: 'T-LS-01' }, 'await openFilter("PP-Code"); typeIn("#ddFMenuSearch", "p00"); await sleep(250);');
  add('filter-search-none', {}, 'await openFilter("ประเทศ"); typeIn("#ddFMenuSearch", "zzzz"); await sleep(250);');
  add('filter-search-none-dark', { theme: 'dark' }, 'await openFilter("ประเทศ"); typeIn("#ddFMenuSearch", "zzzz"); await sleep(250);');
  add('en-filter-search-none', { lang: 'en' }, 'await openFilter("ประเทศ"); typeIn("#ddFMenuSearch", "zzzz"); await sleep(250);');
  add('filter-search-then-tick-apply', {}, 'await openFilter("ประเทศ"); typeIn("#ddFMenuSearch", "เกาหลี"); tick("เกาหลีใต้"); click("#ddFMenuApply"); await sleep(300);');
  add('filter-search-cleared-on-reopen', {}, 'await openFilter("ประเทศ"); typeIn("#ddFMenuSearch", "ญี่"); await sleep(150); await openFilter("Profile"); await openFilter("ประเทศ");');
  add('filter-blank-entry', { code: 'X-BLANK' }, 'await openFilter("ประเทศ");');
  add('en-filter-blank-entry', { code: 'X-BLANK', lang: 'en' }, 'await openFilter("ประเทศ");');
  add('filter-blank-apply', { code: 'X-BLANK' }, 'await openFilter("ประเทศ"); var items = $$("#ddFMenuList .dd-fmenu-item"); items[0].querySelector("input").click(); click("#ddFMenuApply"); await sleep(300);');
  // closing the menu
  add('filter-toggle-same-caret', {}, 'await openFilter("ประเทศ"); click(caretOf("ประเทศ")); await sleep(250);');
  add('filter-switch-caret', {}, 'await openFilter("ประเทศ"); await openFilter("Profile");');
  add('filter-close-esc', {}, 'await openFilter("ประเทศ"); key("Escape"); await sleep(250);');
  add('filter-close-click-outside', {}, 'await openFilter("ประเทศ"); document.dispatchEvent(new MouseEvent("click", { bubbles: true })); await sleep(250);');
  add('filter-stays-open-on-inside-click', {}, 'await openFilter("ประเทศ"); click("#ddFMenuList"); await sleep(250);');
  add('filter-close-on-scroll', {}, 'await openFilter("ประเทศ"); $("#ddScroll").dispatchEvent(new Event("scroll")); await sleep(250);');
  add('filter-close-on-resize', {}, 'await openFilter("ประเทศ"); window.dispatchEvent(new Event("resize")); await sleep(500);');
  add('filter-close-on-reload-page', { code: 'T-PLS-02' }, 'await openFilter("ประเทศ"); await goPage(2);');
  add('filter-caret-on-state-dark', { theme: 'dark' }, 'await openFilter("ประเทศ"); tick("ญี่ปุ่น"); click("#ddFMenuApply"); await sleep(300);');
  add('filter-on-numeric-column', { code: 'T-LS-02' }, 'await openFilter("ยอดอนุมัติ");');
  add('filter-on-money-column', { code: 'T-LS-01' }, 'await openFilter("ราคาซื้อขาย");');
  add('filter-on-sla-column', { code: 'T-LE-01' }, 'await openFilter("เกิน SLA");');

  /* ---- the column filter: a calendar for the date columns ---- */
  add('cal-open', {}, 'await openFilter("วันที่รับแจก");');
  add('cal-open-dark', { theme: 'dark' }, 'await openFilter("วันที่รับแจก");');
  add('cal-open-390', { w: 390, h: 844 }, 'await openFilter("วันที่รับแจก");');
  add('cal-open-768', { w: 768, h: 1024 }, 'await openFilter("วันที่สถานะ");');
  add('fs-plus-cal-open', {}, FONT('2px') + ' await sleep(500); await openFilter("วันที่รับแจก");');
  add('en-cal-open', { lang: 'en' }, 'await openFilter("วันที่รับแจก");');
  add('en-cal-open-dark', { lang: 'en', theme: 'dark' }, 'await openFilter("วันที่รับแจก");');
  add('cal-prev-month', {}, 'await openFilter("วันที่รับแจก"); click("#ddFMenuCal .dd-cal-nav[data-move=\\"-1\\"]"); await sleep(250);');
  add('cal-next-month', {}, 'await openFilter("วันที่รับแจก"); click("#ddFMenuCal .dd-cal-nav[data-move=\\"1\\"]"); await sleep(250);');
  add('cal-prev-year-boundary', {}, 'await openFilter("วันที่รับแจก"); for (var i = 0; i < 14; i++) click("#ddFMenuCal .dd-cal-nav[data-move=\\"-1\\"]"); await sleep(250);');
  add('cal-next-year-boundary', {}, 'await openFilter("วันที่รับแจก"); for (var i = 0; i < 14; i++) click("#ddFMenuCal .dd-cal-nav[data-move=\\"1\\"]"); await sleep(250);');
  add('en-cal-prev-month', { lang: 'en' }, 'await openFilter("วันที่รับแจก"); click("#ddFMenuCal .dd-cal-nav[data-move=\\"-1\\"]"); await sleep(250);');
  add('cal-pick-day', {}, `
    await openFilter("วันที่รับแจก");
    var m = /^(\\d\\d)\\/(\\d\\d)\\/(\\d{4})/.exec(cellText(2, "วันที่รับแจก")), iso = m[3] + "-" + m[2] + "-" + m[1];
    var sel = '#ddFMenuCal .dd-cal-day[data-date="' + iso + '"]:not(.other)';
    for (var i = 0; i < 120 && !$(sel); i++) click('#ddFMenuCal .dd-cal-nav[data-move="-1"]');
    for (var j = 0; j < 120 && !$(sel); j++) click('#ddFMenuCal .dd-cal-nav[data-move="1"]');
    click(sel); await sleep(300);`);
  add('cal-pick-day-reopen', {}, `
    await openFilter("วันที่รับแจก");
    var m = /^(\\d\\d)\\/(\\d\\d)\\/(\\d{4})/.exec(cellText(2, "วันที่รับแจก")), iso = m[3] + "-" + m[2] + "-" + m[1];
    var sel = '#ddFMenuCal .dd-cal-day[data-date="' + iso + '"]:not(.other)';
    for (var i = 0; i < 120 && !$(sel); i++) click('#ddFMenuCal .dd-cal-nav[data-move="-1"]');
    for (var j = 0; j < 120 && !$(sel); j++) click('#ddFMenuCal .dd-cal-nav[data-move="1"]');
    click(sel); await sleep(300);
    await openFilter("วันที่รับแจก");`);
  add('cal-pick-day-dark', { theme: 'dark' }, `
    await openFilter("วันที่รับแจก");
    var m = /^(\\d\\d)\\/(\\d\\d)\\/(\\d{4})/.exec(cellText(2, "วันที่รับแจก")), iso = m[3] + "-" + m[2] + "-" + m[1];
    var sel = '#ddFMenuCal .dd-cal-day[data-date="' + iso + '"]:not(.other)';
    for (var i = 0; i < 120 && !$(sel); i++) click('#ddFMenuCal .dd-cal-nav[data-move="-1"]');
    for (var j = 0; j < 120 && !$(sel); j++) click('#ddFMenuCal .dd-cal-nav[data-move="1"]');
    click(sel); await sleep(300);
    await openFilter("วันที่รับแจก");`);
  add('cal-pick-other-month-day', {}, 'await openFilter("วันที่รับแจก"); click($$("#ddFMenuCal .dd-cal-day.other")[0]); await sleep(300);');
  add('cal-today-link', {}, 'await openFilter("วันที่รับแจก"); click("#ddFMenuCal [data-today]"); await sleep(300);');
  add('en-cal-today-link', { lang: 'en' }, 'await openFilter("วันที่รับแจก"); click("#ddFMenuCal [data-today]"); await sleep(300);');
  add('cal-clear-link', {}, `
    await openFilter("วันที่รับแจก"); click("#ddFMenuCal [data-today]"); await sleep(250);
    await openFilter("วันที่รับแจก"); click("#ddFMenuCal [data-clear]"); await sleep(300);`);
  add('cal-clear-without-filter', {}, 'await openFilter("วันที่รับแจก"); click("#ddFMenuCal [data-clear]"); await sleep(300);');
  add('cal-filter-other-date-column', {}, 'await openFilter("วันที่รับแจก"); click("#ddFMenuCal [data-today]"); await sleep(250); await openFilter("วันที่สถานะ");');
  add('cal-close-esc', {}, 'await openFilter("วันที่รับแจก"); key("Escape"); await sleep(250);');
  add('cal-close-click-outside', {}, 'await openFilter("วันที่รับแจก"); document.dispatchEvent(new MouseEvent("click", { bubbles: true })); await sleep(250);');
  add('cal-stays-open-on-inside-click', {}, 'await openFilter("วันที่รับแจก"); click("#ddFMenuCal .dd-cal-title"); await sleep(250);');
  add('cal-then-list-column', {}, 'await openFilter("วันที่รับแจก"); await openFilter("ประเทศ");');
  add('cal-on-ls-date-column', { code: 'T-LS-01' }, 'await openFilter("วันที่ส่งเข้าธนาคาร");');
  add('cal-on-future-date-column', { code: 'T-LS-02' }, 'await openFilter("กำหนดโอน");');

  /* ---- CSV export (the file is stubbed on both sides; what was exported goes into the page root as an attribute) ---- */
  add('export-default', {}, async function (sleep) { stubDownload(); click('#ddExportBtn'); await sleep(300); await recordDownload(); });
  add('export-report-T-LS-01', { code: 'T-LS-01' }, async function (sleep) { stubDownload(); click('#ddExportBtn'); await sleep(300); await recordDownload(); });
  add('export-report-T-LE-01', { code: 'T-LE-01' }, async function (sleep) { stubDownload(); click('#ddExportBtn'); await sleep(300); await recordDownload(); });
  add('export-report-T-PLS-01', { code: 'T-PLS-01' }, async function (sleep) { stubDownload(); click('#ddExportBtn'); await sleep(300); await recordDownload(); });
  add('export-page2', { code: 'T-PLS-02' }, 'stubDownload(); await goPage(2); click("#ddExportBtn"); await sleep(300); await recordDownload();');
  // the export is the whole page, not what the column filters show
  add('export-with-filter', {}, 'await openFilter("ประเทศ"); tick("ญี่ปุ่น"); click("#ddFMenuApply"); await sleep(250); stubDownload(); click("#ddExportBtn"); await sleep(300); await recordDownload();');
  add('en-export-default', { lang: 'en' }, async function (sleep) { stubDownload(); click('#ddExportBtn'); await sleep(300); await recordDownload(); });
  add('export-blank-cells', { code: 'X-BLANK' }, async function (sleep) { stubDownload(); click('#ddExportBtn'); await sleep(300); await recordDownload(); });
  add('export-twice', {}, async function (sleep) { stubDownload(); click('#ddExportBtn'); await sleep(200); click('#ddExportBtn'); await sleep(300); await recordDownload(); });
  add('export-closes-nothing-open', {}, 'await openFilter("ประเทศ"); stubDownload(); click("#ddExportBtn"); await sleep(300); await recordDownload();');
}
