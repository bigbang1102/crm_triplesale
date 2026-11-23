// Scenarios of the Opportunities comparison. Each function is run INSIDE the page under test (Java replica / Angular app) with (sleep, side, win)
// in scope, after lib/scenario-pre.mjs and the page prelude (`pre` in page.mjs: cols(), colBody(i), cards(i), pickDd(), openFilter(),
// tabList(), dnd(card, body), watchNav(side)).
// add(name, opts, fn):  opts = { w, h, theme, lang, settle, wait, roots, ready } as in the README, and for this page
//   user: 'viewer'                  the account (Angular: signs in with it; Java: the page is built for its roles)
//   mock: {…} + storage: {…}        the mock-only switches (leads.mock.ts MockLeadsConfig) — `cfg({…})` below sets both
//   live: {hook, mock}               --live only (the Angular side runs its live backend against the fake REST service of page.mjs): `hook` = the same
//                                    switches as JSON, played by the fake service; `mock` replaces the switches of the Java replica where the
//                                    live run has to compare with another situation (see fail-leads)
//
// The data (leads.mock.ts): product A (31, workflow, 5 groups, default group 101 "ฝ่ายบริการลูกค้า" = 4 columns), B (32, 3 groups),
// C (33, NO workflow: 3 columns, the first one has 32 open leads = 2 pages), D (34, one group). Open leads only unless "showClosed".
// (liveMock: the switches the Java replica gets in a --live run instead of c)
const cfg = (c, liveMock) => ({ mock: c, storage: { 'ts.mock.leads.config': JSON.stringify(c) }, live: { hook: JSON.stringify(c), ...(liveMock ? { mock: liveMock } : {}) } });
const NO_ROOTS = ['#__none']; // scenarios that leave the page: only the NAV line counts

export default function (add) {
  /* ---- first paint, themes, viewports, language ---- */
  add('overview', {}, async function () {});
  add('overview-dark', { theme: 'dark' }, async function () {});
  add('overview-1024', { w: 1024, h: 768 }, async function () {});
  add('overview-768', { w: 768, h: 1024 }, async function () {});
  add('overview-390', { w: 390, h: 844 }, async function () {});
  add('overview-1920', { w: 1920, h: 1080 }, async function () {});
  add('en-overview', { lang: 'en' }, async function () {});
  add('en-overview-dark', { lang: 'en', theme: 'dark' }, async function () {});

  add('list', {}, async function () { await tabList(); });
  add('list-dark', { theme: 'dark' }, async function () { await tabList(); });
  add('list-1024', { w: 1024, h: 768 }, async function () { await tabList(); });
  add('list-768', { w: 768, h: 1024 }, async function () { await tabList(); });
  add('list-390', { w: 390, h: 844 }, async function () { await tabList(); });
  add('list-1920', { w: 1920, h: 1080 }, async function () { await tabList(); });
  add('en-list', { lang: 'en' }, async function () { await tabList(); });
  add('en-list-dark', { lang: 'en', theme: 'dark' }, async function () { await tabList(); });
  add('list-back-to-board', {}, async function () { await tabList(); click('.ld-tab[data-tab="board"]'); await sleep(1500); });

  /* ---- the A A A font buttons: Java sets --fs-adj, the Angular shell --ts-fs-adj ---- */
  add('fs-plus', {}, async function () { fontAdj('2px'); await sleep(800); });
  add('fs-minus', {}, async function () { fontAdj('-2px'); await sleep(800); });
  add('fs-plus-list', {}, async function () { fontAdj('2px'); await sleep(300); await tabList(); });
  add('fs-minus-list', {}, async function () { fontAdj('-2px'); await sleep(300); await tabList(); });
  add('fs-plus-dark', { theme: 'dark' }, async function () { fontAdj('2px'); await sleep(800); });
  add('fs-plus-filter', {}, async function () { fontAdj('2px'); await sleep(300); await openFilter(); });
  add('fs-minus-filter', {}, async function () { fontAdj('-2px'); await sleep(300); await openFilter(); });
  add('fs-plus-seg-tag', {}, async function () { fontAdj('2px'); await sleep(300); click('.ld-seg[data-seg="tag"]'); await sleep(600); });

  /* ---- product and workflow-group dropdowns, the summary toggle ---- */
  add('product-open', {}, async function () { click('#ldProductBtn'); await sleep(300); });
  add('product-open-dark', { theme: 'dark' }, async function () { click('#ldProductBtn'); await sleep(300); });
  add('product-B', {}, async function () { await pickDd('#ldProductBtn', '#ldProductDd .ld-dd-item[data-id="32"]'); });
  add('product-C-nowf', {}, async function () { await pickDd('#ldProductBtn', '#ldProductDd .ld-dd-item[data-id="33"]'); });
  add('product-C-nowf-dark', { theme: 'dark' }, async function () { await pickDd('#ldProductBtn', '#ldProductDd .ld-dd-item[data-id="33"]'); });
  add('product-D-onegroup', {}, async function () { await pickDd('#ldProductBtn', '#ldProductDd .ld-dd-item[data-id="34"]'); });
  add('product-C-list', {}, async function () { await pickDd('#ldProductBtn', '#ldProductDd .ld-dd-item[data-id="33"]'); await tabList(); });
  add('product-B-list', {}, async function () { await pickDd('#ldProductBtn', '#ldProductDd .ld-dd-item[data-id="32"]'); await tabList(); });
  add('group-open', {}, async function () { click('#ldGroupBtn'); await sleep(300); });
  add('group-open-dark', { theme: 'dark' }, async function () { click('#ldGroupBtn'); await sleep(300); });
  add('group-AN', {}, async function () { await pickDd('#ldGroupBtn', '#ldGroupDd .ld-dd-item[data-id="102"]'); });
  add('group-LS', {}, async function () { await pickDd('#ldGroupBtn', '#ldGroupDd .ld-dd-item[data-id="104"]'); });
  add('group-B-LE', {}, async function () {
    await pickDd('#ldProductBtn', '#ldProductDd .ld-dd-item[data-id="32"]');
    await pickDd('#ldGroupBtn', '#ldGroupDd .ld-dd-item[data-id="106"]');
  });
  add('dd-close-outside', {}, async function () { click('#ldProductBtn'); await sleep(200); click('#ldSortBtn'); await sleep(200); click('.ld-tabs-toolbar'); await sleep(300); });
  add('seg-tag', {}, async function () { click('.ld-seg[data-seg="tag"]'); await sleep(600); });
  add('seg-tag-dark', { theme: 'dark' }, async function () { click('.ld-seg[data-seg="tag"]'); await sleep(600); });
  add('seg-tag-390', { w: 390, h: 844 }, async function () { click('.ld-seg[data-seg="tag"]'); await sleep(600); });
  add('seg-tag-next', {}, async function () { click('.ld-seg[data-seg="tag"]'); await sleep(400); click('#ldWfNext'); await sleep(700); });
  add('seg-tag-prev', {}, async function () { click('.ld-seg[data-seg="tag"]'); await sleep(400); click('#ldWfNext'); await sleep(500); click('#ldWfNext'); await sleep(500); click('#ldWfPrev'); await sleep(700); });
  add('seg-tag-back', {}, async function () { click('.ld-seg[data-seg="tag"]'); await sleep(400); click('.ld-seg[data-seg="emoji"]'); await sleep(500); });
  add('seg-tag-then-product-C', {}, async function () {
    click('.ld-seg[data-seg="tag"]'); await sleep(400);
    await pickDd('#ldProductBtn', '#ldProductDd .ld-dd-item[data-id="33"]');
  });
  add('seg-tag-disabled-click', {}, async function () {
    await pickDd('#ldProductBtn', '#ldProductDd .ld-dd-item[data-id="33"]');
    click('.ld-seg[data-seg="tag"]'); await sleep(500);
  });
  add('en-seg-tag', { lang: 'en' }, async function () { click('.ld-seg[data-seg="tag"]'); await sleep(600); });

  /* ---- sort ---- */
  add('sort-open', {}, async function () { click('#ldSortBtn'); await sleep(300); });
  add('sort-open-dark', { theme: 'dark' }, async function () { click('#ldSortBtn'); await sleep(300); });
  add('sort-date-asc', {}, async function () { await pickDd('#ldSortBtn', '#ldSortDd .ld-dd-item[data-api="txdate_asc"]'); });
  add('sort-id-asc', {}, async function () { await pickDd('#ldSortBtn', '#ldSortDd .ld-dd-item[data-api="id_asc"]'); });
  add('sort-id-desc', {}, async function () { await pickDd('#ldSortBtn', '#ldSortDd .ld-dd-item[data-api="id_desc"]'); });
  add('sort-status', {}, async function () { await pickDd('#ldSortBtn', '#ldSortDd .ld-dd-item[data-api="status"]'); });
  add('sort-status-list', {}, async function () { await tabList(); await pickDd('#ldSortBtn', '#ldSortDd .ld-dd-item[data-api="status"]'); });
  add('sort-id-asc-list', {}, async function () { await tabList(); await pickDd('#ldSortBtn', '#ldSortDd .ld-dd-item[data-api="id_asc"]'); });
  add('en-sort-open', { lang: 'en' }, async function () { click('#ldSortBtn'); await sleep(300); });

  /* ---- search ---- */
  add('search-open', {}, async function () { click('.ld-search-ic'); await sleep(400); });
  add('search-open-dark', { theme: 'dark' }, async function () { click('.ld-search-ic'); await sleep(400); });
  add('search-open-390', { w: 390, h: 844 }, async function () { click('.ld-search-ic'); await sleep(400); });
  add('search-suggest', {}, async function () {
    click('.ld-search-ic'); await sleep(300); typeIn('#ldSearchInput', 'สม'); await sleep(1200);
  });
  add('search-suggest-dark', { theme: 'dark' }, async function () {
    click('.ld-search-ic'); await sleep(300); typeIn('#ldSearchInput', 'สม'); await sleep(1200);
  });
  add('search-suggest-pick', {}, async function () {
    click('.ld-search-ic'); await sleep(300); typeIn('#ldSearchInput', 'สม'); await sleep(1200);
    var it = $('.ods-list.ods-ac .ods-item'); if (it) it.dispatchEvent(new MouseEvent('mousedown', { bubbles: true })), it.click();
    await sleep(1500);
  });
  add('search-go', {}, async function () { click('.ld-search-ic'); await sleep(300); typeIn('#ldSearchInput', 'สม'); click('#ldSearchGo'); await sleep(1500); });
  add('search-enter', {}, async function () { click('.ld-search-ic'); await sleep(300); typeIn('#ldSearchInput', 'วิชัย'); key('Enter', $('#ldSearchInput')); await sleep(1500); });
  add('search-none', {}, async function () { click('.ld-search-ic'); await sleep(300); typeIn('#ldSearchInput', 'zzzz'); click('#ldSearchGo'); await sleep(1500); });
  add('search-none-list', {}, async function () { await tabList(); click('.ld-search-ic'); await sleep(300); typeIn('#ldSearchInput', 'zzzz'); click('#ldSearchGo'); await sleep(1500); });
  add('search-none-list-dark', { theme: 'dark' }, async function () { await tabList(); click('.ld-search-ic'); await sleep(300); typeIn('#ldSearchInput', 'zzzz'); click('#ldSearchGo'); await sleep(1500); });
  add('search-list', {}, async function () { await tabList(); click('.ld-search-ic'); await sleep(300); typeIn('#ldSearchInput', 'สม'); click('#ldSearchGo'); await sleep(1500); });
  add('search-close-x', {}, async function () { click('.ld-search-ic'); await sleep(300); typeIn('#ldSearchInput', 'สม'); click('#ldSearchGo'); await sleep(1200); click('#ldSearchClear'); await sleep(1500); });
  add('search-esc', {}, async function () { click('.ld-search-ic'); await sleep(300); typeIn('#ldSearchInput', 'สม'); click('#ldSearchGo'); await sleep(1200); key('Escape', $('#ldSearchInput')); await sleep(1500); });
  add('en-search-open', { lang: 'en' }, async function () { click('.ld-search-ic'); await sleep(400); });

  /* ---- the filter dialog ---- */
  add('filter-open', {}, async function () { await openFilter(); });
  add('filter-open-dark', { theme: 'dark' }, async function () { await openFilter(); });
  add('filter-open-390', { w: 390, h: 844 }, async function () { await openFilter(); });
  add('filter-open-768', { w: 768, h: 1024 }, async function () { await openFilter(); });
  add('filter-open-1920', { w: 1920, h: 1080 }, async function () { await openFilter(); });
  add('en-filter-open', { lang: 'en' }, async function () { await openFilter(); });
  add('en-filter-open-dark', { lang: 'en', theme: 'dark' }, async function () { await openFilter(); });
  add('filter-open-list-wf', {}, async function () { await tabList(); await openFilter(); });
  add('filter-open-list-wf-dark', { theme: 'dark' }, async function () { await tabList(); await openFilter(); });
  add('filter-open-list-nowf', {}, async function () {
    await pickDd('#ldProductBtn', '#ldProductDd .ld-dd-item[data-id="33"]'); await tabList(); await openFilter();
  });
  add('filter-list-group-pick', {}, async function () {
    await tabList(); await openFilter(); pick('#ldFGroupSel', '102'); await sleep(900);
  });
  add('filter-list-group-step-apply', {}, async function () {
    await tabList(); await openFilter(); pick('#ldFGroupSel', '102'); await sleep(900); pick('#ldFStepSel', '1022'); await sleep(300);
    click('#ldFilterApply'); await sleep(1500);
  });
  add('filter-list-nowf-step-apply', {}, async function () {
    await pickDd('#ldProductBtn', '#ldProductDd .ld-dd-item[data-id="33"]'); await tabList(); await openFilter(); await sleep(600);
    pick('#ldFStepSel', '2002'); await sleep(300); click('#ldFilterApply'); await sleep(1500);
  });
  add('filter-toggle-closed', {}, async function () { await openFilter(); click('#ldToggleStatus'); await sleep(400); });
  add('filter-toggle-closed-dark', { theme: 'dark' }, async function () { await openFilter(); click('#ldToggleStatus'); await sleep(400); });
  add('filter-tag-open', {}, async function () { await openFilter(); await sleep(600); click('#ldTagBtn'); await sleep(400); });
  add('filter-tag-open-dark', { theme: 'dark' }, async function () { await openFilter(); await sleep(600); click('#ldTagBtn'); await sleep(400); });
  add('filter-tag-pick-two', {}, async function () {
    await openFilter(); await sleep(600); click('#ldTagBtn'); await sleep(300);
    click($$('#ldTagPanel .ld-tag-cb')[0]); click($$('#ldTagPanel .ld-tag-cb')[2]); await sleep(400);
  });
  add('filter-tag-pick-three', {}, async function () {
    await openFilter(); await sleep(600); click('#ldTagBtn'); await sleep(300);
    $$('#ldTagPanel .ld-tag-cb').slice(0, 3).forEach(function (c) { click(c); }); await sleep(400);
  });
  add('filter-tag-pick-all', {}, async function () {
    await openFilter(); await sleep(600); click('#ldTagBtn'); await sleep(300);
    $$('#ldTagPanel .ld-tag-cb').forEach(function (c) { click(c); }); await sleep(400);
  });
  add('filter-tag-search', {}, async function () {
    await openFilter(); await sleep(600); click('#ldTagBtn'); await sleep(300); typeIn('#ldTagSearch', 'ด'); await sleep(400);
  });
  add('filter-tag-all-click', {}, async function () {
    await openFilter(); await sleep(600); click('#ldTagBtn'); await sleep(300); click($('#ldTagPanel .ld-tag-cb')); click('#ldTagAll'); await sleep(400);
  });
  add('filter-tag-chip-remove', {}, async function () {
    await openFilter(); await sleep(600); click('#ldTagBtn'); await sleep(300);
    click($$('#ldTagPanel .ld-tag-cb')[0]); click($$('#ldTagPanel .ld-tag-cb')[1]); await sleep(300);
    click('#ldTagChips .ld-f-chip i'); await sleep(400);
  });
  add('filter-tag-close-outside', {}, async function () {
    await openFilter(); await sleep(600); click('#ldTagBtn'); await sleep(300); click('.ld-f-title'); await sleep(400);
  });
  add('filter-province-districts', {}, async function () {
    await openFilter(); await sleep(600); pick('#ldProvinceSel', '1'); await sleep(900);
  });
  add('filter-province-districts-dark', { theme: 'dark' }, async function () {
    await openFilter(); await sleep(600); pick('#ldProvinceSel', '1'); await sleep(900);
  });
  add('filter-province-back-to-all', {}, async function () {
    await openFilter(); await sleep(600); pick('#ldProvinceSel', '1'); await sleep(900); pick('#ldProvinceSel', $('#ldProvinceSel option').value); await sleep(500);
  });
  add('filter-status-options-open', {}, async function () { await openFilter(); await sleep(400); click('#ldFilterOverlay .ods-btn'); await sleep(400); });
  add('filter-dates', {}, async function () {
    await openFilter(); typeIn('#ldDateFrom', '2026-01-01'); typeIn('#ldDateTo', '2026-06-30'); await sleep(400);
  });
  add('filter-dates-dark', { theme: 'dark' }, async function () {
    await openFilter(); typeIn('#ldDateFrom', '2026-01-01'); typeIn('#ldDateTo', '2026-06-30'); await sleep(400);
  });
  add('filter-date-picker-open', {}, async function () { await openFilter(); click('#ldDateFrom'); await sleep(500); });
  add('filter-close-x', {}, async function () { await openFilter(); click('#ldFilterClose'); await sleep(400); });
  add('filter-close-outside', {}, async function () { await openFilter(); click('#ldFilterOverlay'); await sleep(400); });
  add('filter-reopen-reverts', {}, async function () {
    await openFilter(); await sleep(500); click('#ldToggleStatus'); pick('#ldOwnerSel', '1003'); await sleep(300);
    click('#ldFilterClose'); await sleep(300); await openFilter(); await sleep(500);
  });
  add('filter-clear', {}, async function () {
    await openFilter(); await sleep(600); pick('#ldOwnerSel', '1003'); pick('#ldSaleGroupSel', '12'); pick('#ldProvinceSel', '2'); await sleep(900);
    typeIn('#ldDateFrom', '2026-01-01'); click('#ldToggleStatus'); await sleep(300); click('#ldFilterClear'); await sleep(600);
  });

  /* ---- applying a filter ---- */
  add('apply-owner', {}, async function () { await openFilter(); await sleep(600); pick('#ldOwnerSel', '1003'); await sleep(300); click('#ldFilterApply'); await sleep(1800); });
  add('apply-owner-list', {}, async function () { await tabList(); await openFilter(); await sleep(600); pick('#ldOwnerSel', '1003'); await sleep(300); click('#ldFilterApply'); await sleep(1800); });
  add('apply-sale-group', {}, async function () { await openFilter(); await sleep(600); pick('#ldSaleGroupSel', '12'); await sleep(300); click('#ldFilterApply'); await sleep(1800); });
  add('apply-province-district', {}, async function () {
    await openFilter(); await sleep(600); pick('#ldProvinceSel', '1'); await sleep(900); pick('#ldDistrictSel', '102'); await sleep(300);
    click('#ldFilterApply'); await sleep(1800);
  });
  add('apply-status-hot', {}, async function () { await openFilter(); await sleep(600); pick('#ldCloseStatusSel', 'HOT'); await sleep(300); click('#ldFilterApply'); await sleep(1800); });
  add('apply-dates', {}, async function () {
    await openFilter(); typeIn('#ldDateFrom', '2026-03-01'); typeIn('#ldDateTo', '2026-08-31'); await sleep(300); click('#ldFilterApply'); await sleep(1800);
  });
  add('apply-dates-half', {}, async function () { await openFilter(); typeIn('#ldDateFrom', '2026-03-01'); await sleep(300); click('#ldFilterApply'); await sleep(1800); });
  add('apply-tags', {}, async function () {
    await openFilter(); await sleep(600); click('#ldTagBtn'); await sleep(300); click($$('#ldTagPanel .ld-tag-cb')[0]); click($$('#ldTagPanel .ld-tag-cb')[1]); await sleep(300);
    click('#ldFilterApply'); await sleep(1800);
  });
  add('apply-closed', {}, async function () { await openFilter(); click('#ldToggleStatus'); await sleep(300); click('#ldFilterApply'); await sleep(1800); });
  add('apply-closed-lost', {}, async function () {
    await openFilter(); click('#ldToggleStatus'); await sleep(300); pick('#ldCloseStatusSel', 'LOST'); await sleep(200); click('#ldFilterApply'); await sleep(1800);
  });
  add('apply-closed-list', {}, async function () { await tabList(); await openFilter(); click('#ldToggleStatus'); await sleep(300); click('#ldFilterApply'); await sleep(1800); });
  add('apply-many-badge', {}, async function () {
    await openFilter(); await sleep(600); pick('#ldOwnerSel', '1001'); pick('#ldSaleGroupSel', '11'); pick('#ldProvinceSel', '1'); await sleep(900);
    typeIn('#ldDateFrom', '2026-01-01'); typeIn('#ldDateTo', '2026-12-31'); click('#ldTagBtn'); await sleep(200); click($('#ldTagPanel .ld-tag-cb')); await sleep(200);
    click('#ldFilterApply'); await sleep(1800);
  });
  add('apply-many-badge-dark', { theme: 'dark' }, async function () {
    await openFilter(); await sleep(600); pick('#ldOwnerSel', '1001'); pick('#ldSaleGroupSel', '11'); pick('#ldProvinceSel', '1'); await sleep(900);
    click('#ldFilterApply'); await sleep(1800);
  });
  add('apply-no-result', {}, async function () { await openFilter(); await sleep(600); pick('#ldOwnerSel', '1008'); pick('#ldProvinceSel', '4'); await sleep(900); pick('#ldCloseStatusSel', 'COLD'); click('#ldFilterApply'); await sleep(1800); });
  add('apply-then-clear', {}, async function () {
    await openFilter(); await sleep(600); pick('#ldOwnerSel', '1003'); click('#ldFilterApply'); await sleep(1500);
    await openFilter(); await sleep(400); click('#ldFilterClear'); await sleep(300); click('#ldFilterApply'); await sleep(1800);
  });
  add('en-apply-many-badge', { lang: 'en' }, async function () {
    await openFilter(); await sleep(600); pick('#ldOwnerSel', '1001'); pick('#ldProvinceSel', '1'); await sleep(900); click('#ldFilterApply'); await sleep(1800);
  });

  /* ---- cards: expand, open a lead, the access popover ---- */
  add('card-expand', {}, async function () { click($('#ldBoardContent .ld-card-expand')); await sleep(400); });
  add('card-expand-dark', { theme: 'dark' }, async function () { click($('#ldBoardContent .ld-card-expand')); await sleep(400); });
  add('card-expand-all', {}, async function () { $$('#ldBoardContent .ld-card-expand').forEach(function (b) { click(b); }); await sleep(500); });
  add('card-expand-collapse', {}, async function () { var b = $('#ldBoardContent .ld-card-expand'); click(b); await sleep(300); click(b); await sleep(400); });
  add('en-card-expand', { lang: 'en' }, async function () { click($('#ldBoardContent .ld-card-expand')); await sleep(400); });
  add('card-expand-390', { w: 390, h: 844 }, async function () { click($('#ldBoardContent .ld-card-expand')); await sleep(400); });
  add('card-click-nav', { roots: NO_ROOTS }, async function (sleep, side) {
    watchNav(side); click(cards(0)[1]); await sleep(900);
    if (side === 'ng') { var u = new URL(location.href); var m = /\/crm\/leads\/(\w+)/.exec(u.pathname); navSeen = m ? 'lead=' + m[1] + ' group=' + (u.searchParams.get('activityGroupId') || '-') : null; }
  });
  add('card-click-nav-group-AN', { roots: NO_ROOTS }, async function (sleep, side) {
    await pickDd('#ldGroupBtn', '#ldGroupDd .ld-dd-item[data-id="102"]');
    watchNav(side); click(cards(0)[0]); await sleep(900);
    if (side === 'ng') { var u = new URL(location.href); var m = /\/crm\/leads\/(\w+)/.exec(u.pathname); navSeen = m ? 'lead=' + m[1] + ' group=' + (u.searchParams.get('activityGroupId') || '-') : null; }
  });
  add('card-click-nav-nowf', { roots: NO_ROOTS }, async function (sleep, side) {
    await pickDd('#ldProductBtn', '#ldProductDd .ld-dd-item[data-id="33"]');
    watchNav(side); click(cards(0)[0]); await sleep(900);
    if (side === 'ng') { var u = new URL(location.href); var m = /\/crm\/leads\/(\w+)/.exec(u.pathname); navSeen = m ? 'lead=' + m[1] + ' group=' + (u.searchParams.get('activityGroupId') || '-') : null; }
  });
  add('row-click-nav', { roots: NO_ROOTS }, async function (sleep, side) {
    await tabList(); watchNav(side); click($('#ldListBody tr')); await sleep(900);
    if (side === 'ng') { var u = new URL(location.href); var m = /\/crm\/leads\/(\w+)/.exec(u.pathname); navSeen = m ? 'lead=' + m[1] + ' group=' + (u.searchParams.get('activityGroupId') || '-') : null; }
  });
  add('card-click-viewer-nav', { user: 'viewer', roots: NO_ROOTS }, async function (sleep, side) {
    watchNav(side); click(cards(0)[0]); await sleep(900);
    if (side === 'ng') { var u = new URL(location.href); var m = /\/crm\/leads\/(\w+)/.exec(u.pathname); navSeen = m ? 'lead=' + m[1] + ' group=' + (u.searchParams.get('activityGroupId') || '-') : null; }
  });
  add('card-expand-no-nav', { roots: NO_ROOTS }, async function (sleep, side) {
    watchNav(side); click($('#ldBoardContent .ld-card-expand')); await sleep(700);
    if (side === 'ng') { var u = new URL(location.href); var m = /\/crm\/leads\/(\w+)/.exec(u.pathname); navSeen = m ? 'lead=' + m[1] : null; }
  });
  add('access-pop', {}, async function () {
    var w = $('#ldBoardContent .ld-team-avs-wrap'); w.dispatchEvent(new MouseEvent('mouseenter', { bubbles: true })); await sleep(500);
  });
  add('access-pop-dark', { theme: 'dark' }, async function () {
    var w = $('#ldBoardContent .ld-team-avs-wrap'); w.dispatchEvent(new MouseEvent('mouseenter', { bubbles: true })); await sleep(500);
  });
  add('access-pop-me', {}, async function () {
    // a lead the signed-in employee (id 1001) has access to: the row moves to the top with "(ฉัน)"
    var ws = $$('#ldBoardContent .ld-team-avs-wrap'); var pick1 = ws.find(function (w) { return (window.LD_ASSIGNEES_MAP[w.closest('.ld-card').dataset.id] || []).some(function (a) { return String(a.id) === '1001'; }); });
    (pick1 || ws[0]).dispatchEvent(new MouseEvent('mouseenter', { bubbles: true })); await sleep(500);
  });
  // an account without the contact-activity roles still sees who has access (the popover has no permission of its own); a lead with nobody has no avatars to hover
  add('access-pop-viewer', { user: 'viewer' }, async function () {
    $('#ldBoardContent .ld-team-avs-wrap').dispatchEvent(new MouseEvent('mouseenter', { bubbles: true })); await sleep(500);
  });
  add('access-pop-viewer-dark', { user: 'viewer', theme: 'dark' }, async function () {
    $('#ldBoardContent .ld-team-avs-wrap').dispatchEvent(new MouseEvent('mouseenter', { bubbles: true })); await sleep(500);
  });
  add('access-pop-close-x', {}, async function () {
    $('#ldBoardContent .ld-team-avs-wrap').dispatchEvent(new MouseEvent('mouseenter', { bubbles: true })); await sleep(400); click('#ldAccessPop .ld-access-pop-close'); await sleep(400);
  });
  add('access-pop-leave', {}, async function () {
    var w = $('#ldBoardContent .ld-team-avs-wrap'); w.dispatchEvent(new MouseEvent('mouseenter', { bubbles: true })); await sleep(400);
    w.dispatchEvent(new MouseEvent('mouseleave', { bubbles: true })); await sleep(600);
  });
  add('access-pop-last-col', {}, async function () {
    var ws = $$('#ldBoardContent .ld-col:last-child .ld-team-avs-wrap'); $('#ldBoardContent').scrollLeft = 99999; await sleep(300);
    ws[0].dispatchEvent(new MouseEvent('mouseenter', { bubbles: true })); await sleep(500);
  });
  add('en-access-pop', { lang: 'en' }, async function () {
    $('#ldBoardContent .ld-team-avs-wrap').dispatchEvent(new MouseEvent('mouseenter', { bubbles: true })); await sleep(500);
  });

  /* ---- drag & drop of a card and the move-step modal ---- */
  add('dnd-hover', {}, async function () {
    var dt = new DataTransfer(); var c = cards(0)[0];
    c.dispatchEvent(new DragEvent('dragstart', { bubbles: true, cancelable: true, dataTransfer: dt })); await sleep(100);
    colBody(1).dispatchEvent(new DragEvent('dragover', { bubbles: true, cancelable: true, dataTransfer: dt })); await sleep(300);
  });
  add('dnd-hover-dark', { theme: 'dark' }, async function () {
    var dt = new DataTransfer(); var c = cards(0)[0];
    c.dispatchEvent(new DragEvent('dragstart', { bubbles: true, cancelable: true, dataTransfer: dt })); await sleep(100);
    colBody(1).dispatchEvent(new DragEvent('dragover', { bubbles: true, cancelable: true, dataTransfer: dt })); await sleep(300);
  });
  add('dnd-modal', {}, async function () { await dnd(cards(0)[0], colBody(1)); await sleep(600); });
  add('dnd-modal-dark', { theme: 'dark' }, async function () { await dnd(cards(0)[0], colBody(1)); await sleep(600); });
  add('dnd-modal-390', { w: 390, h: 844 }, async function () { await dnd(cards(0)[0], colBody(1)); await sleep(600); });
  add('dnd-modal-768', { w: 768, h: 1024 }, async function () { await dnd(cards(0)[0], colBody(1)); await sleep(600); });
  add('en-dnd-modal', { lang: 'en' }, async function () { await dnd(cards(0)[0], colBody(1)); await sleep(600); });
  add('dnd-modal-nowf', {}, async function () {
    await pickDd('#ldProductBtn', '#ldProductDd .ld-dd-item[data-id="33"]'); await dnd(cards(0)[0], colBody(2)); await sleep(600);
  });
  add('dnd-modal-tab-line', {}, async function () { await dnd(cards(0)[0], colBody(1)); await sleep(500); click('#ld2MsTabs .ld2-ms-tab[data-channel="line"]'); typeIn('#ld2MsText', 'โทรแล้ว ลูกค้าสนใจ'); await sleep(400); });
  add('dnd-modal-tab-line-dark', { theme: 'dark' }, async function () { await dnd(cards(0)[0], colBody(1)); await sleep(500); click('#ld2MsTabs .ld2-ms-tab[data-channel="line"]'); typeIn('#ld2MsText', 'โทรแล้ว ลูกค้าสนใจ'); await sleep(400); });
  add('dnd-modal-tabs-scroll', { w: 390, h: 844 }, async function () { await dnd(cards(0)[0], colBody(1)); await sleep(500); var t = $('#ld2MsTabs'); t.scrollLeft = 400; await sleep(300); });
  add('dnd-modal-cancel', {}, async function () { await dnd(cards(0)[0], colBody(1)); await sleep(500); click('#ld2MsCancelBtn'); await sleep(600); });
  add('dnd-modal-close-x', {}, async function () { await dnd(cards(0)[0], colBody(1)); await sleep(500); click('#ld2MoveStepOverlay .ld2-ms-close'); await sleep(600); });
  add('dnd-modal-click-outside', {}, async function () { await dnd(cards(0)[0], colBody(1)); await sleep(500); click('#ld2MoveStepOverlay'); await sleep(600); });
  add('dnd-modal-save', {}, async function () {
    await dnd(cards(0)[0], colBody(1)); await sleep(500); typeIn('#ld2MsText', 'ย้ายขั้นตอนตามนัด'); click('#ld2MsSubmitBtn'); await sleep(2200);
  });
  add('dnd-modal-save-nowf', {}, async function () {
    await pickDd('#ldProductBtn', '#ldProductDd .ld-dd-item[data-id="33"]');
    await dnd(cards(0)[0], colBody(2)); await sleep(500); click('#ld2MsTabs .ld2-ms-tab[data-channel="call_out"]'); click('#ld2MsSubmitBtn'); await sleep(2200);
  });
  add('dnd-modal-save-fail', {}, async function () {
    await dnd(cards(0)[0], colBody(1)); await sleep(500); typeIn('#ld2MsText', '!fail'); click('#ld2MsSubmitBtn'); await sleep(1500);
  });
  add('dnd-modal-save-fail-dark', { theme: 'dark' }, async function () {
    await dnd(cards(0)[0], colBody(1)); await sleep(500); typeIn('#ld2MsText', '!fail'); click('#ld2MsSubmitBtn'); await sleep(1500);
  });
  add('dnd-modal-saving', { ...cfg({ delayMs: 2500 }), ready: `document.querySelector('#ldBoardContent .ld-col-body .ld-card')`, readyTimeout: 20000 }, async function () {
    await dnd(cards(0)[0], colBody(1)); await sleep(400); click('#ld2MsSubmitBtn'); await sleep(500);
  });
  add('dnd-same-column', {}, async function () { await dnd(cards(0)[0], colBody(0)); await sleep(600); });
  add('dnd-to-last-column', {}, async function () { await dnd(cards(0)[0], colBody(3)); await sleep(600); });
  add('dnd-move-then-card-moved', {}, async function () {
    await dnd(cards(0)[0], colBody(1)); await sleep(400); click('#ld2MsSubmitBtn'); await sleep(2200); await dnd(cards(2)[0], colBody(3)); await sleep(600);
  });
  add('dnd-viewer-not-allowed', { user: 'viewer' }, async function () { await dnd(cards(0)[0], colBody(1)); await sleep(600); });
  add('viewer-overview', { user: 'viewer' }, async function () {});
  add('viewer-overview-dark', { user: 'viewer', theme: 'dark' }, async function () {});
  add('viewer-list', { user: 'viewer' }, async function () { await tabList(); });
  add('apply-closed-drag-disabled', {}, async function () {
    await openFilter(); click('#ldToggleStatus'); await sleep(300); click('#ldFilterApply'); await sleep(1800);
    var c = cards(0)[0]; if (c) { await dnd(c, colBody(1)); await sleep(500); }
  });
  add('dnd-auto-scroll-edge', { w: 800, h: 700 }, async function () {
    var dt = new DataTransfer(); var c = cards(0)[0]; var board = $('#ldBoardContent'); var r = board.getBoundingClientRect();
    c.dispatchEvent(new DragEvent('dragstart', { bubbles: true, cancelable: true, dataTransfer: dt }));
    board.dispatchEvent(new DragEvent('dragover', { bubbles: true, cancelable: true, dataTransfer: dt, clientX: r.right - 10, clientY: r.top + 100 })); await sleep(700);
    // how far the board scrolled depends on how many animation frames fit in the 700 ms (a few px more or less under load): compare THAT it scrolled, not how far
    var moved = board.scrollLeft > 0; board.scrollLeft = 0;
    board.dispatchEvent(new DragEvent('drop', { bubbles: true, cancelable: true, dataTransfer: dt })); c.dispatchEvent(new DragEvent('dragend', { bubbles: true })); await sleep(300);
    board.scrollLeft = 0; board.setAttribute('data-autoscrolled', moved ? '1' : '0');
  });

  /* ---- paging: per-column infinite scroll, the list, the auto-fill ---- */
  add('scroll-col-more', {}, async function () {
    await pickDd('#ldProductBtn', '#ldProductDd .ld-dd-item[data-id="33"]');
    var b = colBody(0); b.scrollTop = b.scrollHeight; await sleep(1800);
  });
  add('scroll-col-more-dark', { theme: 'dark' }, async function () {
    await pickDd('#ldProductBtn', '#ldProductDd .ld-dd-item[data-id="33"]');
    var b = colBody(0); b.scrollTop = b.scrollHeight; await sleep(1800);
  });
  add('scroll-col-loading', { ...cfg({ delayMs: 1500 }), ready: `document.querySelector('#ldBoardContent .ld-col-body .ld-card')`, readyTimeout: 20000 }, async function () {
    await pickDd('#ldProductBtn', '#ldProductDd .ld-dd-item[data-id="33"]', 2600);
    var b = colBody(0); b.scrollTop = b.scrollHeight; await sleep(500);
  });
  add('scroll-col-twice', {}, async function () {
    await pickDd('#ldProductBtn', '#ldProductDd .ld-dd-item[data-id="33"]');
    var b = colBody(0); b.scrollTop = b.scrollHeight; await sleep(1800); b.scrollTop = b.scrollHeight; await sleep(1800);
  });
  add('scroll-col-search', {}, async function () {
    await pickDd('#ldProductBtn', '#ldProductDd .ld-dd-item[data-id="33"]');
    click('.ld-search-ic'); await sleep(300); typeIn('#ldSearchInput', 'ส'); click('#ldSearchGo'); await sleep(1500);
    var b = colBody(0); b.scrollTop = b.scrollHeight; await sleep(1800);
  });
  add('list-scroll-more', {}, async function () {
    await tabList(); var w = $('#ldTabList .ld-list-wrap'); w.scrollTop = w.scrollHeight; await sleep(1800);
  });
  add('list-scroll-more-nowf', {}, async function () {
    await pickDd('#ldProductBtn', '#ldProductDd .ld-dd-item[data-id="33"]');
    await tabList(); var w = $('#ldTabList .ld-list-wrap'); w.scrollTop = w.scrollHeight; await sleep(1800);
  });
  add('list-scroll-more-dark', { theme: 'dark' }, async function () {
    await tabList(); var w = $('#ldTabList .ld-list-wrap'); w.scrollTop = w.scrollHeight; await sleep(1800);
  });
  add('list-scroll-loading', { ...cfg({ delayMs: 1500 }), ready: `document.querySelector('#ldBoardContent .ld-col-body .ld-card')`, readyTimeout: 20000 }, async function () {
    click('.ld-tab[data-tab="list"]'); await waitFor(function () { return $('#ldListBody tr'); }, 9000); await sleep(600);
    var w = $('#ldTabList .ld-list-wrap'); w.scrollTop = w.scrollHeight; await sleep(500);
  });
  add('list-scroll-sideways', { w: 1024, h: 768 }, async function () {
    await tabList(); var w = $('#ldTabList .ld-list-wrap'); w.scrollLeft = 600; await sleep(400);
  });
  add('autofill-board', cfg({ maxPerPage: 3 }), async function () { await sleep(1500); });
  add('autofill-board-more-btn', cfg({ maxPerPage: 3 }), async function () {
    await pickDd('#ldProductBtn', '#ldProductDd .ld-dd-item[data-id="33"]', 2500);
  });
  add('autofill-board-more-btn-click', cfg({ maxPerPage: 3 }), async function () {
    await pickDd('#ldProductBtn', '#ldProductDd .ld-dd-item[data-id="33"]', 2500);
    var m = $('#ldBoardContent .ld-col-more'); if (m) { click(m); await sleep(1500); }
  });
  add('autofill-board-more-btn-dark', { theme: 'dark', ...cfg({ maxPerPage: 3 }) }, async function () {
    await pickDd('#ldProductBtn', '#ldProductDd .ld-dd-item[data-id="33"]', 2500);
  });
  add('autofill-list', cfg({ maxPerPage: 3 }), async function () { await tabList(1800); });

  /* ---- grab-scroll with the mouse ---- */
  add('grab-scroll-board', {}, async function () {
    var b = $('#ldBoardContent'); var r = b.getBoundingClientRect();
    b.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, button: 0, clientX: r.left + 5, clientY: r.top + 5 }));
    document.dispatchEvent(new MouseEvent('mousemove', { bubbles: true, clientX: r.left - 295, clientY: r.top + 5 })); await sleep(300);
    document.dispatchEvent(new MouseEvent('mouseup', { bubbles: true })); await sleep(300);
  });
  add('grab-scroll-list', { w: 1024, h: 768 }, async function () {
    await tabList(); var w = $('#ldTabList .ld-list-wrap'); var cell = $('#ldListBody td');
    cell.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, button: 0, clientX: 400, clientY: 300 }));
    document.dispatchEvent(new MouseEvent('mousemove', { bubbles: true, buttons: 1, clientX: 200, clientY: 280 })); await sleep(300);
    document.dispatchEvent(new MouseEvent('mouseup', { bubbles: true })); await sleep(300);
  });

  // the click that ends a drag is swallowed (no navigation); the next real click opens the lead
  add('grab-scroll-list-click-swallowed', { w: 1024, h: 768, roots: NO_ROOTS }, async function (sleep, side) {
    await tabList(); watchNav(side); var cell = $('#ldListBody td');
    cell.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, button: 0, clientX: 400, clientY: 300 }));
    document.dispatchEvent(new MouseEvent('mousemove', { bubbles: true, buttons: 1, clientX: 300, clientY: 300 }));
    document.dispatchEvent(new MouseEvent('mouseup', { bubbles: true }));
    cell.click(); await sleep(700);
    if (side === 'ng') ngNav();
  });
  add('grab-scroll-list-then-click', { w: 1024, h: 768, roots: NO_ROOTS }, async function (sleep, side) {
    await tabList(); watchNav(side); var cell = $('#ldListBody td');
    cell.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, button: 0, clientX: 400, clientY: 300 }));
    document.dispatchEvent(new MouseEvent('mousemove', { bubbles: true, buttons: 1, clientX: 300, clientY: 300 }));
    document.dispatchEvent(new MouseEvent('mouseup', { bubbles: true }));
    await sleep(100); cell.click(); await sleep(700);
    if (side === 'ng') ngNav();
  });

  /* ---- skeleton, empty states, errors ---- */
  // (only the answers of /board/leads are held back: with all six master / data answers pending for seconds the Java replica — HTTP/1.1, six connections — queued
  //  the images of its stylesheet behind them, its load event came with the data and the dump showed no skeleton, on that side only: a scenario that was flaky)
  add('skeleton-first-load', { ...cfg({ delayMs: 4000, delayLeadsOnly: true }), ready: `document.querySelector('#ldSkeleton')`, settle: 200, wait: 200 }, async function () { await sleep(300); });
  add('skeleton-first-load-dark', { theme: 'dark', ...cfg({ delayMs: 4000, delayLeadsOnly: true }), ready: `document.querySelector('#ldSkeleton')`, settle: 200, wait: 200 }, async function () { await sleep(300); });
  add('skeleton-first-load-390', { w: 390, h: 844, ...cfg({ delayMs: 4000, delayLeadsOnly: true }), ready: `document.querySelector('#ldSkeleton')`, settle: 200, wait: 200 }, async function () { await sleep(300); });
  add('skeleton-content-only', { ...cfg({ delayMs: 1500 }), readyTimeout: 20000 }, async function () {
    click('.ld-tab[data-tab="list"]'); await sleep(400);
  });
  add('skeleton-content-only-board', { ...cfg({ delayMs: 1500 }), readyTimeout: 20000 }, async function () {
    await sleep(100); click('#ldSortBtn'); await sleep(100); click('#ldSortDd .ld-dd-item[data-api="id_asc"]'); await sleep(400);
  });
  add('skeleton-content-only-dark', { theme: 'dark', ...cfg({ delayMs: 1500 }), readyTimeout: 20000 }, async function () {
    click('.ld-tab[data-tab="list"]'); await sleep(400);
  });
  add('empty-board', cfg({ emptyBoard: true }), async function () {});
  add('empty-board-dark', { theme: 'dark', ...cfg({ emptyBoard: true }) }, async function () {});
  add('empty-list', {}, async function () {
    await tabList(); click('.ld-search-ic'); await sleep(300); typeIn('#ldSearchInput', 'zzzz'); key('Enter', $('#ldSearchInput')); await sleep(1500);
  });
  add('no-products', cfg({ noProducts: true }), async function () {});
  add('no-products-dark', { theme: 'dark', ...cfg({ noProducts: true }) }, async function () {});
  add('no-products-seg-tag', cfg({ noProducts: true }), async function () { click('.ld-seg[data-seg="tag"]'); await sleep(400); });
  add('en-no-products', { lang: 'en', ...cfg({ noProducts: true }) }, async function () {});
  // (--live: the mock's 500 is an exception of the servlet, which no longer exists — a failing SERVICE gave `[]` with status 200: the fake service answers 500
  //  and the Java replica answers what the servlet did, blankLeads)
  add('fail-leads', { ...cfg({ failLeads: true }, { blankLeads: true }) }, async function () {});
  add('fail-leads-list', { ...cfg({ failLeads: true }, { blankLeads: true }) }, async function () {
    click('.ld-tab[data-tab="list"]'); await sleep(1500);
  });

  /* ---- more of the narrow screens and of the English texts ---- */
  add('product-open-390', { w: 390, h: 844 }, async function () { click('#ldProductBtn'); await sleep(300); });
  add('group-open-390', { w: 390, h: 844 }, async function () { click('#ldGroupBtn'); await sleep(300); });
  add('sort-open-390', { w: 390, h: 844 }, async function () { click('#ldSortBtn'); await sleep(300); });
  add('access-pop-390', { w: 390, h: 844 }, async function () {
    $('#ldBoardContent .ld-team-avs-wrap').dispatchEvent(new MouseEvent('mouseenter', { bubbles: true })); await sleep(500);
  });
  add('filter-tag-open-390', { w: 390, h: 844 }, async function () { await openFilter(); await sleep(600); click('#ldTagBtn'); await sleep(400); });
  add('filter-open-list-wf-390', { w: 390, h: 844 }, async function () { await tabList(); await openFilter(); });
  add('search-suggest-390', { w: 390, h: 844 }, async function () { click('.ld-search-ic'); await sleep(300); typeIn('#ldSearchInput', 'สม'); await sleep(1200); });
  add('dnd-hover-390', { w: 390, h: 844 }, async function () {
    var dt = new DataTransfer(); var c = cards(0)[0];
    c.dispatchEvent(new DragEvent('dragstart', { bubbles: true, cancelable: true, dataTransfer: dt })); await sleep(100);
    colBody(1).dispatchEvent(new DragEvent('dragover', { bubbles: true, cancelable: true, dataTransfer: dt })); await sleep(300);
  });
  add('en-filter-open-list-wf', { lang: 'en' }, async function () { await tabList(); await openFilter(); });
  add('en-dnd-modal-save-fail', { lang: 'en' }, async function () {
    await dnd(cards(0)[0], colBody(1)); await sleep(500); typeIn('#ld2MsText', '!fail'); click('#ld2MsSubmitBtn'); await sleep(1500);
  });
  add('en-empty-list', { lang: 'en' }, async function () {
    await tabList(); click('.ld-search-ic'); await sleep(300); typeIn('#ldSearchInput', 'zzzz'); key('Enter', $('#ldSearchInput')); await sleep(1500);
  });
  add('en-group-open', { lang: 'en' }, async function () { click('#ldGroupBtn'); await sleep(300); });
  add('en-product-C-list', { lang: 'en' }, async function () { await pickDd('#ldProductBtn', '#ldProductDd .ld-dd-item[data-id="33"]'); await tabList(); });
  add('viewer-card-expand', { user: 'viewer' }, async function () { click($('#ldBoardContent .ld-card-expand')); await sleep(400); });
  add('viewer-filter-open', { user: 'viewer' }, async function () { await openFilter(); });

  /* ---- the filter state the server session keeps: leave and come back (the page is loaded again) ---- */
  add('restore-list-sort', {}, async function () {
    await tabList(); await pickDd('#ldSortBtn', '#ldSortDd .ld-dd-item[data-api="id_desc"]'); await sleep(800); return '__RELOAD__';
  });
  add('restore-list-sort-dark', { theme: 'dark', ready: `document.querySelector('.ld-root') && document.querySelector('#ldTabList') && getComputedStyle(document.querySelector('#ldSkeleton')).display === 'none'` }, async function () {
    await tabList(); await pickDd('#ldSortBtn', '#ldSortDd .ld-dd-item[data-api="id_desc"]'); await sleep(800); return '__RELOAD__';
  });
  add('restore-search', {}, async function () {
    click('.ld-search-ic'); await sleep(300); typeIn('#ldSearchInput', 'สม'); click('#ldSearchGo'); await sleep(1200); return '__RELOAD__';
  });
  add('restore-product-group', {}, async function () {
    await pickDd('#ldProductBtn', '#ldProductDd .ld-dd-item[data-id="32"]'); await pickDd('#ldGroupBtn', '#ldGroupDd .ld-dd-item[data-id="106"]'); await sleep(800); return '__RELOAD__';
  });
  add('restore-product-nowf', {}, async function () {
    await pickDd('#ldProductBtn', '#ldProductDd .ld-dd-item[data-id="33"]'); await sleep(800); return '__RELOAD__';
  });
  add('restore-filter', {}, async function () {
    await openFilter(); await sleep(600); pick('#ldOwnerSel', '1003'); pick('#ldSaleGroupSel', '12'); pick('#ldProvinceSel', '1'); await sleep(900); pick('#ldDistrictSel', '102');
    typeIn('#ldDateFrom', '2026-01-01'); typeIn('#ldDateTo', '2026-12-31'); click('#ldTagBtn'); await sleep(200); click($('#ldTagPanel .ld-tag-cb')); await sleep(200);
    click('#ldFilterApply'); await sleep(1500); return '__RELOAD__';
  });
  add('restore-filter-open', {}, async function () {
    await openFilter(); await sleep(600); pick('#ldOwnerSel', '1003'); pick('#ldProvinceSel', '1'); await sleep(900); pick('#ldDistrictSel', '102');
    click('#ldFilterApply'); await sleep(1500); return '__RELOAD__';
  });
  add('restore-closed', {}, async function () {
    await openFilter(); click('#ldToggleStatus'); await sleep(300); pick('#ldCloseStatusSel', 'SUCCESS'); click('#ldFilterApply'); await sleep(1500); return '__RELOAD__';
  });
  add('restore-moved-card', {}, async function () {
    await dnd(cards(0)[0], colBody(1)); await sleep(500); click('#ld2MsSubmitBtn'); await sleep(2200); return '__RELOAD__';
  });
  add('restore-list-filter-step', {}, async function () {
    await tabList(); await openFilter(); pick('#ldFGroupSel', '102'); await sleep(900); pick('#ldFStepSel', '1022'); await sleep(300); click('#ldFilterApply'); await sleep(1500); return '__RELOAD__';
  });
  add('en-restore-list-sort', { lang: 'en' }, async function () {
    await tabList(); await pickDd('#ldSortBtn', '#ldSortDd .ld-dd-item[data-api="id_desc"]'); await sleep(800); return '__RELOAD__';
  });
}
