// Scenarios of the Prospects comparison. Each function is run INSIDE the page under test (Java replica / Angular app) with (sleep, side, win) in
// scope, after the prelude of lib/scenario-pre.mjs and the page prelude (`pre` in page.mjs: rowsOf, openRow, searchFor, scrollEnd, openLead,
// pickFiles, stubDownload, recordNav …).
// add(name, opts, fn):  opts = { w, h, theme: 'light'|'dark', lang: 'th'|'en', settle, wait, roots, ready }
//
// The customers are those of core/mock/crm-seed.ts: P00001 has an avatar and documents, P00005 has no sale person, P00007 has pdf / docx / txt /
// xlsx / csv documents, P00009 lives abroad (Japan or other), P00013 has no country, P00017 has no phone, P00019 has jpg / png / zip documents,
// P00002 has no documents. Search texts X-… and file names *FAIL* / *UNVERIFIED* / *SLOW* are hooks of prospects.mock.ts.
export default function (add) {
  var FONT = function (v) { return 'fontAdj(' + JSON.stringify(v) + ');'; };
  var NAV = { roots: [] };
  var withNav = function (opts) { return Object.assign({}, opts, NAV); };
  // search for one customer by code, close the suggestion list, open the row
  var ONE = function (code, ms) { return 'await searchFor(' + JSON.stringify(code) + '); document.dispatchEvent(new MouseEvent("click", { bubbles: true })); await openRow(0, ' + (ms || 700) + ');'; };

  /* ================================================================ first paint: viewports, themes, languages, A A A */
  add('overview', {}, async function () {});
  add('overview-dark', { theme: 'dark' }, async function () {});
  [[1920, 1080], [1600, 900], [1440, 900], [1366, 768], [1024, 768], [860, 900], [768, 1024], [480, 800], [390, 844]].forEach(function (s) {
    add('overview-' + s[0], { w: s[0], h: s[1] }, async function () {});
  });
  add('overview-dark-1920', { theme: 'dark', w: 1920, h: 1080 }, async function () {});
  add('overview-dark-390', { theme: 'dark', w: 390, h: 844 }, async function () {});
  add('en-overview', { lang: 'en' }, async function () {});
  add('en-overview-dark', { lang: 'en', theme: 'dark' }, async function () {});
  add('en-overview-390', { lang: 'en', w: 390, h: 844 }, async function () {});
  add('fs-plus', {}, FONT('2px') + ' await sleep(900);');
  add('fs-minus', {}, FONT('-2px') + ' await sleep(900);');
  add('fs-plus-390', { w: 390, h: 844 }, FONT('2px') + ' await sleep(900);');
  add('fs-plus-panel', {}, FONT('2px') + ' await sleep(500); await openRow(0, 700);');

  /* ================================================================ sort */
  add('sort-open', {}, 'click("#ctSortBtn"); await sleep(300);');
  add('sort-open-dark', { theme: 'dark' }, 'click("#ctSortBtn"); await sleep(300);');
  add('sort-open-390', { w: 390, h: 844 }, 'click("#ctSortBtn"); await sleep(300);');
  add('en-sort-open', { lang: 'en' }, 'click("#ctSortBtn"); await sleep(300);');
  add('sort-close-outside', {}, 'click("#ctSortBtn"); await sleep(200); document.dispatchEvent(new MouseEvent("click", { bubbles: true })); await sleep(300);');
  ['date_asc', 'name_asc', 'name_desc', 'date_desc'].forEach(function (s) {
    add('sort-' + s, {}, 'click("#ctSortBtn"); await sleep(200); click("#ctSortMenu .ct-sort-item[data-sort=\\"' + s + '\\"]"); await sleep(800); await settleList();');
  });
  add('sort-name-asc-dark', { theme: 'dark' }, 'click("#ctSortBtn"); await sleep(200); click("#ctSortMenu .ct-sort-item[data-sort=\\"name_asc\\"]"); await sleep(800); await settleList();');
  add('en-sort-name-desc', { lang: 'en' }, 'click("#ctSortBtn"); await sleep(200); click("#ctSortMenu .ct-sort-item[data-sort=\\"name_desc\\"]"); await sleep(800); await settleList();');
  add('sort-then-scroll', {}, 'click("#ctSortBtn"); await sleep(200); click("#ctSortMenu .ct-sort-item[data-sort=\\"name_asc\\"]"); await sleep(800); await settleList(); await scrollEnd();');

  /* ================================================================ search */
  add('search-open', {}, 'click("#ldSearch .ld-search-ic"); await sleep(400);');
  add('search-open-dark', { theme: 'dark' }, 'click("#ldSearch .ld-search-ic"); await sleep(400);');
  add('search-open-390', { w: 390, h: 844 }, 'click("#ldSearch .ld-search-ic"); await sleep(400);');
  add('search-open-768', { w: 768, h: 1024 }, 'click("#ldSearch .ld-search-ic"); await sleep(400);');
  add('en-search-open', { lang: 'en' }, 'click("#ldSearch .ld-search-ic"); await sleep(400);');
  add('search-click-icon-twice', {}, 'click("#ldSearch .ld-search-ic"); await sleep(200); click("#ldSearch .ld-search-ic"); await sleep(300);');
  add('search-go-by-name', {}, 'await searchFor("สม");');
  add('search-go-by-name-dark', { theme: 'dark' }, 'await searchFor("สม");');
  add('search-go-by-name-390', { w: 390, h: 844 }, 'await searchFor("สม");');
  add('search-go-by-code', {}, 'await searchFor("P00009");');
  add('search-go-by-phone', {}, 'await searchFor("0812");');
  add('search-go-by-email', {}, 'await searchFor("customer17@");');
  add('search-no-result', {}, 'await searchFor("zzzz");');
  add('search-no-result-dark', { theme: 'dark' }, 'await searchFor("zzzz");');
  add('en-search-no-result', { lang: 'en' }, 'await searchFor("zzzz");');
  add('search-enter-key', {}, 'click("#ldSearch .ld-search-ic"); await sleep(150); typeIn("#ldSearchInput", "P00019"); $("#ldSearchInput").dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true })); await sleep(900); await settleList();');
  add('search-escape-key', {}, 'await searchFor("zzzz"); $("#ldSearchInput").dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true })); await sleep(900); await settleList();');
  add('search-clear-x', {}, 'await searchFor("zzzz"); click("#ldSearchClear"); await sleep(900); await settleList();');
  add('search-clear-x-nothing-typed', {}, 'click("#ldSearch .ld-search-ic"); await sleep(150); click("#ldSearchClear"); await sleep(500);');
  add('search-typed-only', {}, 'click("#ldSearch .ld-search-ic"); await sleep(150); typeIn("#ldSearchInput", "ทดสอบ"); await sleep(100);');
  // the suggestion list under the search box (odsProspectSuggest): cards with code, name, phone, address and avatar
  add('search-suggest', {}, 'click("#ldSearch .ld-search-ic"); await sleep(150); typeIn("#ldSearchInput", "สม"); await sleep(1100);');
  add('search-suggest-dark', { theme: 'dark' }, 'click("#ldSearch .ld-search-ic"); await sleep(150); typeIn("#ldSearchInput", "สม"); await sleep(1100);');
  add('search-suggest-390', { w: 390, h: 844 }, 'click("#ldSearch .ld-search-ic"); await sleep(150); typeIn("#ldSearchInput", "สม"); await sleep(1100);');
  add('en-search-suggest', { lang: 'en' }, 'click("#ldSearch .ld-search-ic"); await sleep(150); typeIn("#ldSearchInput", "สม"); await sleep(1100);');
  add('search-suggest-none', {}, 'click("#ldSearch .ld-search-ic"); await sleep(150); typeIn("#ldSearchInput", "zzzz"); await sleep(1100);');
  add('search-suggest-pick', {}, 'click("#ldSearch .ld-search-ic"); await sleep(150); typeIn("#ldSearchInput", "สม"); await sleep(1100); click(".ods-list.open .ods-item"); await sleep(900); await settleList();');
  // the hooks of the fake: how the page reports a list that fails, is empty, has no paging meta …
  [['500', 'X-ERR-500'], ['403', 'X-ERR-403'], ['404', 'X-ERR-404'], ['502', 'X-ERR-502'], ['0', 'X-ERR-0']].forEach(function (h) {
    // --live: "the service does not answer at all" (errorStatus 0) cannot be played: the app reaches the fake services through the proxy of the harness
    // (lib/servers.mjs), and a proxy whose upstream drops the connection answers the browser 502. (Status 0 is covered by prospect-list.live.spec.ts.)
    add('list-error-' + h[0], h[0] === '0' ? { live: false } : {}, 'await searchFor(' + JSON.stringify(h[1]) + ');');
  });
  add('list-error-500-dark', { theme: 'dark' }, 'await searchFor("X-ERR-500");');
  add('en-list-error-403', { lang: 'en' }, 'await searchFor("X-ERR-403");');
  add('list-error-then-search-again', {}, 'await searchFor("X-ERR-500"); await searchFor("P00009");');
  add('list-empty-hook', {}, 'await searchFor("X-EMPTY");');
  add('en-list-empty-hook', { lang: 'en' }, 'await searchFor("X-EMPTY");');
  add('list-full-rows', {}, 'await searchFor("X-FULL");');
  add('list-no-meta-two-pages', {}, 'await searchFor("X-NOMETA"); await scrollEnd(); await scrollEnd();');
  // --live: skipped. The hook makes the enrich REQUEST fail (HTTP 500 = the servlet threw). With REST behind it nothing makes that servlet throw: a
  // quick-view that fails is an EMPTY detail inside a 200 answer (ProspectListService.enrichFromDetail returns, toEnrichJson gives ""), so the page
  // marks the rows enriched (data-enriched=1) and the suggestion list shows no code. That behaviour is specified in prospect-list.live.spec.ts.
  add('list-enrich-fails', { live: false }, 'await searchFor("X-ENRICH-FAIL");');
  add('list-enrich-fails-open-panel', { live: false }, 'await searchFor("X-ENRICH-FAIL"); await openRow(0, 700);');
  // while a page is loading, skeleton rows stand in for the table (the answer of X-SLOW takes 3 s)
  add('list-skeleton-first-page', {}, 'click("#ldSearch .ld-search-ic"); await sleep(150); typeIn("#ldSearchInput", "X-SLOW"); click("#ldSearchGo"); await sleep(700);');
  add('list-skeleton-first-page-dark', { theme: 'dark' }, 'click("#ldSearch .ld-search-ic"); await sleep(150); typeIn("#ldSearchInput", "X-SLOW"); click("#ldSearchGo"); await sleep(700);');
  add('list-skeleton-next-page', {}, 'click("#ldSearch .ld-search-ic"); await sleep(150); typeIn("#ldSearchInput", "X-SLOW"); click("#ldSearchGo"); await sleep(4200); await settleList(); var w = $(".ct-table-wrap"); w.scrollTop = w.scrollHeight; await sleep(700);');

  /* ================================================================ the filter dialog */
  add('filter-open', {}, 'await openFilterDlg();');
  add('filter-open-dark', { theme: 'dark' }, 'await openFilterDlg();');
  add('filter-open-390', { w: 390, h: 844 }, 'await openFilterDlg();');
  add('filter-open-768', { w: 768, h: 1024 }, 'await openFilterDlg();');
  add('en-filter-open', { lang: 'en' }, 'await openFilterDlg();');
  add('fs-plus-filter-open', {}, FONT('2px') + ' await sleep(400); await openFilterDlg();');
  add('filter-close-overlay-click', {}, 'await openFilterDlg(); $("#ctFilterOverlay").dispatchEvent(new MouseEvent("click", { bubbles: true })); await sleep(300);');
  add('filter-click-inside-keeps-open', {}, 'await openFilterDlg(); click(".ct-filter-title"); await sleep(300);');
  add('filter-tag-select-two', {}, 'await openFilterDlg(); click(".ct-filter-tag:nth-child(1)"); click(".ct-filter-tag:nth-child(3)"); await sleep(300);');
  add('filter-tag-select-two-dark', { theme: 'dark' }, 'await openFilterDlg(); click(".ct-filter-tag:nth-child(1)"); click(".ct-filter-tag:nth-child(3)"); await sleep(300);');
  add('filter-tag-toggle-off', {}, 'await openFilterDlg(); click(".ct-filter-tag:nth-child(2)"); click(".ct-filter-tag:nth-child(2)"); await sleep(300);');
  add('filter-tag-search-shown', {}, 'await openFilterDlg(); typeIn("#ctFilterTagSearch", "ติ"); await sleep(300);');
  add('filter-tag-search-none', {}, 'await openFilterDlg(); typeIn("#ctFilterTagSearch", "zzz"); await sleep(300);');
  add('filter-province-cascade', {}, 'await openFilterDlg(); firstOpt("ctFilterProvince", 1); await sleep(700);');
  add('filter-province-cascade-dark', { theme: 'dark' }, 'await openFilterDlg(); firstOpt("ctFilterProvince", 1); await sleep(700);');
  add('filter-province-bkk-districts', {}, 'await openFilterDlg(); pickOpt("ctFilterProvince", "กรุงเทพมหานคร"); await sleep(700);');
  add('filter-province-back-to-all', {}, 'await openFilterDlg(); firstOpt("ctFilterProvince", 1); await sleep(600); $("#ctFilterProvince").selectedIndex = 0; $("#ctFilterProvince").dispatchEvent(new Event("change", { bubbles: true })); await sleep(400);');
  add('filter-agent-picked', {}, 'await openFilterDlg(); firstOpt("ctFilterAgent", 1); await sleep(300);');
  add('filter-apply-source', {}, 'await openFilterDlg(); click(".ct-filter-tag:nth-child(1)"); click("#ctFilterApply"); await sleep(900); await settleList();');
  add('filter-apply-source-dark', { theme: 'dark' }, 'await openFilterDlg(); click(".ct-filter-tag:nth-child(1)"); click("#ctFilterApply"); await sleep(900); await settleList();');
  add('filter-apply-two-sources', {}, 'await openFilterDlg(); click(".ct-filter-tag:nth-child(1)"); click(".ct-filter-tag:nth-child(2)"); click("#ctFilterApply"); await sleep(900); await settleList();');
  add('filter-apply-extra-source', {}, 'await openFilterDlg(); click(".ct-filter-tag:nth-child(11)"); click("#ctFilterApply"); await sleep(900); await settleList();');
  add('filter-apply-province', {}, 'await openFilterDlg(); pickOpt("ctFilterProvince", "กรุงเทพมหานคร"); await sleep(600); click("#ctFilterApply"); await sleep(900); await settleList();');
  add('filter-apply-district', {}, 'await openFilterDlg(); pickOpt("ctFilterProvince", "กรุงเทพมหานคร"); await sleep(700); firstOpt("ctFilterDistrict", 0); click("#ctFilterApply"); await sleep(900); await settleList();');
  add('filter-apply-agent', {}, 'await openFilterDlg(); firstOpt("ctFilterAgent", 0); click("#ctFilterApply"); await sleep(900); await settleList();');
  add('filter-apply-all', {}, 'await openFilterDlg(); click(".ct-filter-tag:nth-child(1)"); click(".ct-filter-tag:nth-child(2)"); pickOpt("ctFilterProvince", "กรุงเทพมหานคร"); await sleep(700); firstOpt("ctFilterDistrict", 0); firstOpt("ctFilterAgent", 1); click("#ctFilterApply"); await sleep(900); await settleList();');
  add('filter-apply-nothing', {}, 'await openFilterDlg(); click("#ctFilterApply"); await sleep(900); await settleList();');
  add('filter-apply-then-reopen', {}, 'await openFilterDlg(); click(".ct-filter-tag:nth-child(1)"); pickOpt("ctFilterProvince", "กรุงเทพมหานคร"); await sleep(600); click("#ctFilterApply"); await sleep(900); await settleList(); await openFilterDlg(400);');
  add('filter-clear', {}, 'await openFilterDlg(); click(".ct-filter-tag:nth-child(1)"); pickOpt("ctFilterProvince", "กรุงเทพมหานคร"); await sleep(700); firstOpt("ctFilterDistrict", 0); firstOpt("ctFilterAgent", 1); click("#ctFilterClear"); await sleep(900); await settleList();');
  add('filter-clear-after-apply', {}, 'await openFilterDlg(); click(".ct-filter-tag:nth-child(1)"); click("#ctFilterApply"); await sleep(900); await settleList(); await openFilterDlg(400); click("#ctFilterClear"); await sleep(900); await settleList();');
  add('filter-apply-with-search', {}, 'await searchFor("สม"); document.dispatchEvent(new MouseEvent("click", { bubbles: true })); await openFilterDlg(); click(".ct-filter-tag:nth-child(1)"); click("#ctFilterApply"); await sleep(900); await settleList();');
  add('filter-apply-with-sort', {}, 'click("#ctSortBtn"); await sleep(150); click("#ctSortMenu .ct-sort-item[data-sort=\\"name_asc\\"]"); await sleep(800); await settleList(); await openFilterDlg(); click(".ct-filter-tag:nth-child(1)"); click("#ctFilterApply"); await sleep(900); await settleList();');

  /* ================================================================ the rows and the detail panel */
  add('panel-open', {}, 'await openRow(0, 800);');
  add('panel-open-dark', { theme: 'dark' }, 'await openRow(0, 800);');
  add('panel-open-1024', { w: 1024, h: 768 }, 'await openRow(0, 800);');
  add('panel-open-768', { w: 768, h: 1024 }, 'await openRow(0, 800);');
  add('panel-open-390', { w: 390, h: 844 }, 'await openRow(0, 800);');
  add('panel-open-1920', { w: 1920, h: 1080 }, 'await openRow(0, 800);');
  add('en-panel-open', { lang: 'en' }, 'await openRow(0, 800);');
  add('panel-open-row-5', {}, 'await openRow(5, 800);');
  add('panel-switch-row', {}, 'await openRow(0, 600); await openRow(3, 800);');
  add('panel-close', {}, 'await openRow(0, 600); click("#ctPanelClose"); await sleep(500);');
  add('panel-reopen-after-close', {}, 'await openRow(0, 600); click("#ctPanelClose"); await sleep(400); await openRow(2, 800);');
  add('panel-with-avatar', {}, ONE('P00001'));
  add('panel-foreign-address', {}, ONE('P00009'));
  add('en-panel-foreign-address', { lang: 'en' }, ONE('P00009'));
  add('panel-no-phone', {}, ONE('P00017'));
  add('panel-no-sale-person', {}, ONE('P00005'));
  add('panel-no-country', {}, ONE('P00013'));
  add('panel-company-type', {}, ONE('P00010'));
  add('panel-extra-source', {}, ONE('P00011'));
  add('panel-full-rows-hook', {}, 'await searchFor("X-FULL"); document.dispatchEvent(new MouseEvent("click", { bubbles: true })); await openRow(1, 800);');
  add('panel-after-sort', {}, 'click("#ctSortBtn"); await sleep(150); click("#ctSortMenu .ct-sort-item[data-sort=\\"name_asc\\"]"); await sleep(800); await settleList(); await openRow(1, 800);');
  add('panel-row-highlight-dark', { theme: 'dark' }, 'await openRow(1, 800);');
  add('panel-tabs-docs-empty', {}, ONE('P00002') + ' await tabDocs();');
  add('panel-tab-back-to-detail', {}, 'await openRow(0, 600); await tabDocs(); click(".ct-tab[data-tab=\\"detail\\"]"); await sleep(300);');
  add('table-scroll-x-1024', { w: 1024, h: 768 }, 'var w = $(".ct-table-wrap"); w.scrollLeft = 400; await sleep(400);');
  add('table-drag-scroll', { w: 1024, h: 768 }, 'var c = $("#ctTableBody tr[data-id] td:nth-child(4)"); c.dispatchEvent(new MouseEvent("mousedown", { bubbles: true, button: 0, clientX: 700, clientY: 300 })); document.dispatchEvent(new MouseEvent("mousemove", { bubbles: true, clientX: 400, clientY: 280 })); await sleep(300);');

  /* ================================================================ the context menu of a row (edit / view) and the links to other pages */
  add('ctx-open', {}, 'click("#ctTableBody tr[data-id] .ct-menu-btn"); await sleep(300);');
  add('ctx-open-dark', { theme: 'dark' }, 'click("#ctTableBody tr[data-id] .ct-menu-btn"); await sleep(300);');
  add('ctx-open-390', { w: 390, h: 844 }, 'click("#ctTableBody tr[data-id] .ct-menu-btn"); await sleep(300);');
  add('en-ctx-open', { lang: 'en' }, 'click("#ctTableBody tr[data-id] .ct-menu-btn"); await sleep(300);');
  add('ctx-open-last-visible-row', { h: 700 }, 'var b = $$("#ctTableBody tr[data-id] .ct-menu-btn"); var w = $(".ct-table-wrap"); w.scrollTop = 300; await sleep(300); var r = b.filter(function (x) { var q = x.getBoundingClientRect(); return q.bottom < window.innerHeight - 4; }); click(r[r.length - 1]); await sleep(300);');
  add('ctx-open-then-other', {}, 'var b = $$("#ctTableBody tr[data-id] .ct-menu-btn"); click(b[0]); await sleep(200); click(b[2]); await sleep(300);');
  add('ctx-close-outside', {}, 'click("#ctTableBody tr[data-id] .ct-menu-btn"); await sleep(200); document.dispatchEvent(new MouseEvent("click", { bubbles: true })); await sleep(300);');
  add('ctx-click-does-not-open-panel', {}, 'click("#ctTableBody tr[data-id] .ct-menu-btn"); await sleep(400);');
  add('ctx-edit-goes-to-the-form', withNav({}), 'recordNav(); click("#ctTableBody tr[data-id] .ct-menu-btn"); await sleep(200); click("#ctTableBody tr[data-id] .ct-ctx-item:nth-child(1)"); await sleep(700);');
  add('ctx-view-goes-to-the-form', withNav({}), 'recordNav(); click("#ctTableBody tr[data-id] .ct-menu-btn"); await sleep(200); click("#ctTableBody tr[data-id] .ct-ctx-item:nth-child(2)"); await sleep(700);');
  add('add-button-goes-to-the-form', withNav({}), 'recordNav(); click(".ct-add-btn"); await sleep(700);');
  add('ctx-edit-row-3', withNav({}), 'recordNav(); var b = $$("#ctTableBody tr[data-id] .ct-menu-btn"); click(b[3]); await sleep(200); click($$("#ctTableBody tr[data-id]")[3].querySelector(".ct-ctx-item:nth-child(1)")); await sleep(700);');

  /* ================================================================ infinite scroll */
  add('scroll-page-2', {}, 'await scrollEnd();');
  add('scroll-page-3', {}, 'await scrollEnd(); await scrollEnd();');
  add('scroll-page-2-dark', { theme: 'dark' }, 'await scrollEnd();');
  add('scroll-page-2-390', { w: 390, h: 844 }, 'await scrollEnd();');
  add('scroll-then-open-row', {}, 'await scrollEnd(); await openRow(24, 800);');
  add('scroll-small-viewport', { h: 600 }, 'await scrollEnd();');
  add('scroll-tall-viewport-fills', { h: 1400 }, async function () {});

  /* ================================================================ the documents tab */
  add('docs-tab', {}, ONE('P00001') + ' await tabDocs();');
  add('docs-tab-dark', { theme: 'dark' }, ONE('P00001') + ' await tabDocs();');
  add('docs-tab-390', { w: 390, h: 844 }, ONE('P00001') + ' await tabDocs();');
  add('en-docs-tab', { lang: 'en' }, ONE('P00001') + ' await tabDocs();');
  add('docs-tab-loading', {}, ONE('P00001') + ' click(".ct-tab[data-tab=\\"docs\\"]"); await sleep(60);');
  add('docs-tab-many-kinds', {}, ONE('P00007') + ' await tabDocs();');
  add('docs-select-pdf', {}, ONE('P00007') + ' await tabDocs(); click($$("#ctTabDocs .ct-doc-row")[1]); await sleep(900);');
  add('docs-select-word', {}, ONE('P00007') + ' await tabDocs(); click($$("#ctTabDocs .ct-doc-row")[3]); await sleep(500);');
  add('docs-select-text', {}, ONE('P00007') + ' await tabDocs(); click($$("#ctTabDocs .ct-doc-row")[2]); await sleep(500);');
  add('docs-select-excel', {}, ONE('P00007') + ' await tabDocs(); click($$("#ctTabDocs .ct-doc-row")[0]); await sleep(500);');
  add('docs-select-image', {}, ONE('P00019') + ' await tabDocs(); click($$("#ctTabDocs .ct-doc-row")[3]); await sleep(700);');
  add('docs-select-zip', {}, ONE('P00019') + ' await tabDocs(); click($$("#ctTabDocs .ct-doc-row")[1]); await sleep(500);');
  add('docs-select-dark', { theme: 'dark' }, ONE('P00007') + ' await tabDocs(); click($$("#ctTabDocs .ct-doc-row")[3]); await sleep(500);');
  add('docs-switch-customer-and-back', {}, ONE('P00001') + ' await tabDocs(); await searchFor("P00007"); document.dispatchEvent(new MouseEvent("click", { bubbles: true })); await openRow(0, 600); await tabDocs(900);');
  add('docs-reopen-uses-cache', {}, ONE('P00001') + ' await tabDocs(); click(".ct-tab[data-tab=\\"detail\\"]"); await sleep(200); await tabDocs(300);');
  add('docs-download', withNav({}), ONE('P00007') + ' await tabDocs(); stubDownload(); click($$("#ctTabDocs .ct-dl-btn")[0]); await sleep(700); await recordDownload(); win.__extra = async function () { return ["DOWNLOAD " + $(".ct-root").getAttribute("data-download")]; };');
  add('docs-download-not-found', {}, 'await searchFor("P00001"); document.dispatchEvent(new MouseEvent("click", { bubbles: true })); await openRow(0, 600); await tabDocs(); await pickFiles([mkFile("missing.pdf", 50)], 1800); stubDownload(); click($$("#ctTabDocs .ct-dl-btn")[0]); await sleep(900);');
  add('docs-delete-confirm', {}, ONE('P00007') + ' await tabDocs(); click($$("#ctTabDocs .ct-doc-del")[0]); await sleep(600);');
  add('docs-delete-confirm-dark', { theme: 'dark' }, ONE('P00007') + ' await tabDocs(); click($$("#ctTabDocs .ct-doc-del")[0]); await sleep(600);');
  add('en-docs-delete-confirm', { lang: 'en' }, ONE('P00007') + ' await tabDocs(); click($$("#ctTabDocs .ct-doc-del")[0]); await sleep(600);');
  add('docs-delete-cancel', {}, ONE('P00007') + ' await tabDocs(); click($$("#ctTabDocs .ct-doc-del")[0]); await sleep(500); await swalCancel();');
  add('docs-delete-ok', {}, ONE('P00007') + ' await tabDocs(); click($$("#ctTabDocs .ct-doc-del")[0]); await sleep(500); await swalOk(); await sleep(900);');
  add('docs-delete-all', {}, ONE('P00004') + ' await tabDocs(); for (var i = 0; i < 2; i++) { click($$("#ctTabDocs .ct-doc-del")[0]); await sleep(500); await swalOk(); await sleep(800); }');
  add('docs-row-click-after-delete', {}, ONE('P00007') + ' await tabDocs(); click($$("#ctTabDocs .ct-doc-del")[0]); await sleep(500); await swalOk(); await sleep(900); click($$("#ctTabDocs .ct-doc-row")[2]); await sleep(500);');

  /* ---- upload ---- */
  add('upload-one-png', {}, ONE('P00002') + ' await tabDocs(); await pickFiles([mkFile("รูปใหม่.png", 200, "image/png")], 1800);');
  add('upload-one-png-dark', { theme: 'dark' }, ONE('P00002') + ' await tabDocs(); await pickFiles([mkFile("รูปใหม่.png", 200, "image/png")], 1800);');
  add('upload-three-files', {}, ONE('P00002') + ' await tabDocs(); await pickFiles([mkFile("a.pdf", 100), mkFile("b.docx", 100), mkFile("c.xlsx", 100)], 2600);');
  add('upload-to-existing-list', {}, ONE('P00001') + ' await tabDocs(); await pickFiles([mkFile("ใหม่.pdf", 100)], 1800);');
  add('upload-success-popup', {}, ONE('P00002') + ' await tabDocs(); await pickFiles([mkFile("ok.png", 100, "image/png")], 700);');
  add('en-upload-success-popup', { lang: 'en' }, ONE('P00002') + ' await tabDocs(); await pickFiles([mkFile("ok.png", 100, "image/png")], 700);');
  add('upload-fail', {}, ONE('P00002') + ' await tabDocs(); await pickFiles([mkFile("FAIL.pdf", 100)], 1600);');
  add('en-upload-fail', { lang: 'en' }, ONE('P00002') + ' await tabDocs(); await pickFiles([mkFile("FAIL.pdf", 100)], 1600);');
  add('upload-partial', {}, ONE('P00002') + ' await tabDocs(); await pickFiles([mkFile("good.pdf", 100), mkFile("FAIL.docx", 100)], 2400);');
  add('upload-unverified', {}, ONE('P00002') + ' await tabDocs(); await pickFiles([mkFile("UNVERIFIED.pdf", 100)], 1600);');
  add('upload-extension-not-allowed', {}, ONE('P00002') + ' await tabDocs(); await pickFiles([mkFile("virus.exe", 100)], 900);');
  add('en-upload-extension-not-allowed', { lang: 'en' }, ONE('P00002') + ' await tabDocs(); await pickFiles([mkFile("virus.exe", 100), mkFile("a.pdf", 10)], 900);');
  add('upload-too-large', {}, ONE('P00002') + ' await tabDocs(); await pickFiles([mkFile("huge.pdf", 15000001)], 1800);');
  add('upload-busy-state', {}, ONE('P00002') + ' await tabDocs(); await pickFiles([mkFile("SLOW.pdf", 100)], 500);');
  add('upload-busy-state-dark', { theme: 'dark' }, ONE('P00002') + ' await tabDocs(); await pickFiles([mkFile("SLOW.pdf", 100)], 500);');
  add('upload-button-click-while-busy', {}, ONE('P00002') + ' await tabDocs(); await pickFiles([mkFile("SLOW.pdf", 100)], 400); var n = 0; var oc = HTMLInputElement.prototype.click; HTMLInputElement.prototype.click = function () { n++; }; window.ctPickFile(); HTMLInputElement.prototype.click = oc; $(".ct-root").setAttribute("data-picker-clicks", String(n)); await sleep(100);');
  add('upload-button-opens-the-picker', {}, ONE('P00002') + ' await tabDocs(); var n = 0; var oc = HTMLInputElement.prototype.click; HTMLInputElement.prototype.click = function () { n++; }; click("#ctUploadBtn"); HTMLInputElement.prototype.click = oc; $(".ct-root").setAttribute("data-picker-clicks", String(n)); await sleep(100);');
  add('upload-file-input-accept', {}, ONE('P00002') + ' await tabDocs(); $(".ct-root").setAttribute("data-accept", $("#ctFileInput").getAttribute("accept")); await sleep(100);');
  add('docs-dragenter-mask', {}, ONE('P00002') + ' await tabDocs(); var dt = new DataTransfer(); dt.items.add(mkFile("a.pdf", 5)); $("#ctTabDocs").dispatchEvent(new DragEvent("dragenter", { bubbles: true, cancelable: true, dataTransfer: dt })); await sleep(300);');
  add('docs-dragenter-mask-dark', { theme: 'dark' }, ONE('P00002') + ' await tabDocs(); var dt = new DataTransfer(); dt.items.add(mkFile("a.pdf", 5)); $("#ctTabDocs").dispatchEvent(new DragEvent("dragenter", { bubbles: true, cancelable: true, dataTransfer: dt })); await sleep(300);');
  add('docs-dragenter-leave', {}, ONE('P00002') + ' await tabDocs(); var dt = new DataTransfer(); dt.items.add(mkFile("a.pdf", 5)); $("#ctTabDocs").dispatchEvent(new DragEvent("dragenter", { bubbles: true, cancelable: true, dataTransfer: dt })); $("#ctTabDocs").dispatchEvent(new DragEvent("dragleave", { bubbles: true, cancelable: true, dataTransfer: dt })); await sleep(300);');
  add('docs-drop-uploads', {}, ONE('P00002') + ' await tabDocs(); var dt = new DataTransfer(); dt.items.add(mkFile("dropped.png", 100, "image/png")); $("#ctTabDocs").dispatchEvent(new DragEvent("dragenter", { bubbles: true, cancelable: true, dataTransfer: dt })); $("#ctTabDocs").dispatchEvent(new DragEvent("drop", { bubbles: true, cancelable: true, dataTransfer: dt })); await sleep(1800);');
  add('docs-drop-text-is-ignored', {}, ONE('P00002') + ' await tabDocs(); var dt = new DataTransfer(); dt.setData("text/plain", "hello"); $("#ctTabDocs").dispatchEvent(new DragEvent("dragenter", { bubbles: true, cancelable: true, dataTransfer: dt })); await sleep(300);');

  /* ================================================================ the "create lead" modal */
  add('lead-open-without-customer', {}, 'window.clOpenModal(); await sleep(700);');
  add('en-lead-open-without-customer', { lang: 'en' }, 'window.clOpenModal(); await sleep(700);');
  add('lead-open', {}, 'await openLead(0);');
  add('lead-open-dark', { theme: 'dark' }, 'await openLead(0);');
  add('lead-open-390', { w: 390, h: 844 }, 'await openLead(0);');
  add('lead-open-768', { w: 768, h: 1024 }, 'await openLead(0);');
  add('lead-open-short-window', { w: 1280, h: 500 }, 'await openLead(0);');
  add('en-lead-open', { lang: 'en' }, 'await openLead(0);');
  add('fs-plus-lead-open', {}, FONT('2px') + ' await sleep(300); await openLead(0);');
  add('lead-product-with-groups', {}, 'await openLead(0); firstOpt("clProduct", 0); await sleep(900);');
  add('lead-product-with-groups-dark', { theme: 'dark' }, 'await openLead(0); firstOpt("clProduct", 0); await sleep(900);');
  add('lead-product-flag-false-but-groups', {}, 'await openLead(0); firstOpt("clProduct", 2); await sleep(900);');
  add('lead-product-without-groups', {}, 'await openLead(0); firstOpt("clProduct", 3); await sleep(900);');
  add('lead-product-back-to-empty', {}, 'await openLead(0); firstOpt("clProduct", 0); await sleep(700); $("#clProduct").selectedIndex = 0; $("#clProduct").dispatchEvent(new Event("change", { bubbles: true })); await sleep(500);');
  add('lead-step-group-filters-owner', {}, 'await openLead(0); firstOpt("clProduct", 0); await sleep(800); firstOpt("clStepGroup", 1); await sleep(900);');
  add('lead-step-group-then-clear', {}, 'await openLead(0); firstOpt("clProduct", 0); await sleep(800); firstOpt("clStepGroup", 1); await sleep(800); $("#clStepGroup").selectedIndex = 0; $("#clStepGroup").dispatchEvent(new Event("change", { bubbles: true })); await sleep(700);');
  add('lead-owner-picked-sets-sales', {}, 'await openLead(0); pickOpt("clOwner", "สุดา รักงาน"); await sleep(500);');
  add('lead-sales-picked', {}, 'await openLead(0); firstOpt("clSales", 3); await sleep(400);');
  add('lead-submit-nothing', {}, 'await openLead(0); click("#clSubmitBtn"); await sleep(600);');
  add('en-lead-submit-nothing', { lang: 'en' }, 'await openLead(0); click("#clSubmitBtn"); await sleep(600);');
  add('lead-submit-no-step-group', {}, 'await openLead(0); firstOpt("clProduct", 0); await sleep(800); click("#clSubmitBtn"); await sleep(600);');
  add('lead-submit-success', {}, 'await openLead(0); firstOpt("clProduct", 0); await sleep(800); firstOpt("clStepGroup", 0); await sleep(700); click("#clSubmitBtn"); await sleep(900);');
  add('lead-submit-success-dark', { theme: 'dark' }, 'await openLead(0); firstOpt("clProduct", 0); await sleep(800); firstOpt("clStepGroup", 0); await sleep(700); click("#clSubmitBtn"); await sleep(900);');
  add('lead-submit-success-390', { w: 390, h: 844 }, 'await openLead(0); firstOpt("clProduct", 0); await sleep(800); firstOpt("clStepGroup", 0); await sleep(700); click("#clSubmitBtn"); await sleep(900);');
  add('en-lead-submit-success', { lang: 'en' }, 'await openLead(0); firstOpt("clProduct", 0); await sleep(800); firstOpt("clStepGroup", 0); await sleep(700); click("#clSubmitBtn"); await sleep(900);');
  add('lead-submit-success-without-groups', {}, 'await openLead(0); firstOpt("clProduct", 3); await sleep(800); click("#clSubmitBtn"); await sleep(900);');
  add('lead-submit-with-owner-and-sales', {}, 'await openLead(0); firstOpt("clProduct", 3); await sleep(800); pickOpt("clOwner", "สุดา รักงาน"); firstOpt("clSales", 2); click("#clSubmitBtn"); await sleep(900);');
  add('lead-submit-busy-state', {}, 'await openLead(0); firstOpt("clProduct", 3); await sleep(800); click("#clSubmitBtn"); await sleep(60);');
  add('lead-submit-owner-assign-fails', {}, 'await openLead(0); firstOpt("clProduct", 3); await sleep(800); pickOpt("clOwner", "ปรียา แสงทอง"); click("#clSubmitBtn"); await sleep(1000);');
  add('lead-submit-validation-error', {}, 'await openLead(0); firstOpt("clProduct", 1); await sleep(800); firstOpt("clStepGroup", 0); await sleep(500); click("#clSubmitBtn"); await sleep(1000);');
  add('en-lead-submit-validation-error', { lang: 'en' }, 'await openLead(0); firstOpt("clProduct", 1); await sleep(800); firstOpt("clStepGroup", 0); await sleep(500); click("#clSubmitBtn"); await sleep(1000);');
  add('lead-submit-http-500', {}, 'await openLead(0); firstOpt("clProduct", 4); await sleep(800); click("#clSubmitBtn"); await sleep(1000);');
  add('lead-submit-twice-same-product', {}, 'await openLead(0); firstOpt("clProduct", 3); await sleep(800); click("#clSubmitBtn"); await sleep(900); window.ctHideLeadSuccess(); click(".ct-lead-btn"); await sleep(900); firstOpt("clProduct", 3); await sleep(800); click("#clSubmitBtn"); await sleep(900);');
  add('lead-submit-twice-other-product', {}, 'await openLead(0); firstOpt("clProduct", 3); await sleep(800); click("#clSubmitBtn"); await sleep(900); window.ctHideLeadSuccess(); click(".ct-lead-btn"); await sleep(900); firstOpt("clProduct", 2); await sleep(800); firstOpt("clStepGroup", 0); await sleep(500); click("#clSubmitBtn"); await sleep(900);');
  add('lead-created-key-in-storage', {}, 'await openLead(0); firstOpt("clProduct", 3); await sleep(800); click("#clSubmitBtn"); await sleep(900); var keys = Object.keys(sessionStorage).filter(function (k) { return k.indexOf("triplesale.createdLeadKeys.") === 0; }).map(function (k) { return k + "=" + Object.keys(JSON.parse(sessionStorage.getItem(k))).join(","); }); $(".ct-root").setAttribute("data-storage", keys.join(";")); await sleep(100);');
  add('lead-cancel', {}, 'await openLead(0); click(".ct-cl-cancel"); await sleep(400);');
  add('lead-close-x', {}, 'await openLead(0); click(".ct-cl-x"); await sleep(400);');
  add('lead-close-overlay-click', {}, 'await openLead(0); $("#ctCreateLeadModal").dispatchEvent(new MouseEvent("click", { bubbles: true })); await sleep(400);');
  add('lead-click-inside-box-keeps-open', {}, 'await openLead(0); click(".ct-cl-title"); await sleep(400);');
  add('lead-resize-recenters', { w: 1000, h: 700 }, 'await openLead(0); window.dispatchEvent(new Event("resize")); await sleep(500);');
  add('lead-reopen-reloads-dropdowns', {}, 'await openLead(0); firstOpt("clProduct", 0); await sleep(700); click(".ct-cl-cancel"); await sleep(300); click(".ct-lead-btn"); await sleep(900);');
  // the confirm / success popups (their buttons call window.ct… functions)
  add('lead-confirm-popup', {}, 'window.ctShowLeadConfirm(); await sleep(400);');
  add('lead-confirm-popup-dark', { theme: 'dark' }, 'window.ctShowLeadConfirm(); await sleep(400);');
  add('lead-confirm-popup-390', { w: 390, h: 844 }, 'window.ctShowLeadConfirm(); await sleep(400);');
  add('en-lead-confirm-popup', { lang: 'en' }, 'window.ctShowLeadConfirm(); await sleep(400);');
  add('lead-confirm-cancel', {}, 'window.ctShowLeadConfirm(); await sleep(200); click(".ct-confirm-cancel"); await sleep(300);');
  add('lead-confirm-ok-shows-success', {}, 'window.ctShowLeadConfirm(); await sleep(200); click("#ctLeadConfirmOverlay .ct-confirm-ok"); await sleep(400);');
  add('lead-confirm-overlay-click', {}, 'window.ctShowLeadConfirm(); await sleep(200); $("#ctLeadConfirmOverlay").dispatchEvent(new MouseEvent("click", { bubbles: true })); await sleep(300);');
  add('lead-success-popup', {}, 'window.ctShowLeadSuccess(); await sleep(400);');
  add('lead-success-popup-dark', { theme: 'dark' }, 'window.ctShowLeadSuccess(); await sleep(400);');
  add('en-lead-success-popup', { lang: 'en' }, 'window.ctShowLeadSuccess(); await sleep(400);');
  add('lead-success-close', {}, 'window.ctShowLeadSuccess(); await sleep(200); click("#ctLeadSuccessOverlay .ct-confirm-cancel"); await sleep(300);');
  add('lead-success-overlay-click', {}, 'window.ctShowLeadSuccess(); await sleep(200); $("#ctLeadSuccessOverlay").dispatchEvent(new MouseEvent("click", { bubbles: true })); await sleep(300);');
  add('lead-success-go-to-leads', withNav({}), 'recordNav(); window.ctShowLeadSuccess(); await sleep(200); click("#ctLeadSuccessOverlay .ct-confirm-ok"); await sleep(700);');
  add('lead-duplicate-then-go-to-leads', withNav({}), 'recordNav(); await openLead(0); firstOpt("clProduct", 3); await sleep(800); click("#clSubmitBtn"); await sleep(900); window.ctHideLeadSuccess(); click(".ct-lead-btn"); await sleep(900); firstOpt("clProduct", 3); await sleep(800); click("#clSubmitBtn"); await sleep(800); await swalOk(); await sleep(700);');
  add('lead-owner-fail-then-go-to-leads', withNav({}), 'recordNav(); await openLead(0); firstOpt("clProduct", 3); await sleep(800); pickOpt("clOwner", "ปรียา แสงทอง"); click("#clSubmitBtn"); await sleep(1000); await swalOk(); await sleep(700);');
}
