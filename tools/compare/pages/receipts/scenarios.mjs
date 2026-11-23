// Scenarios of the receipt list comparison. Each function is run INSIDE the page under test (Java replica / Angular app) with
// (sleep, side, win) in scope, after the prelude of lib/scenario-pre.mjs and the page prelude (`pre` in page.mjs: stubOpen(), noteOpened(),
// trackNav(), openApprove(), rowOf() …).
// add(name, opts, fn):  opts = { w, h, theme, lang, settle, wait, roots, ready, storage, mock }
//   mock = a fault of the fake backend (`?mock=` of the page address, see receipts.mock.ts)
// The receipts of the mock (receipts.mock.ts, ids 901…940, newest first) the scenarios use:
//   939 new1 (can be approved; CRM number, has an ERP form)   933 / 923 / 913 new, 935 / 925 / 915 / 905 waitToFlow (the call goes through, nothing is approved)
//   936 ActionWaitProcess (button disabled)   940 active1 (approved; USD; no ERP form yet)   938 cancelled (no ERP form)   917 unknown status "pendingReview"
//   937 / 929 / 931 have an ERP form   932 has two forms (RV_02 first)   905 has two payments   910 cash with change (amount sent as text)   913 / 931 / 940 USD
//   live = what differs in a `run.mjs --live` run, on BOTH sides (the Angular app then talks to the fake REST service of replica.mjs, not to the
//   mock): { mock: 'rest-…' } = the fault is a failure of the REST service (the servlet answered those the same way whatever failed — HTTP 200 and
//   an envelope —, which is what the mock's rest-* faults answer); false = the situation cannot happen without the servlet (its own role check)
export default function (add) {
  const q = JSON.stringify;
  const NO_ROWS = "document.querySelector('#sd2Body td[colspan]')";
  const SIZES = [[390, 844], [768, 1024], [1024, 768], [1920, 1080]];

  /* ---- first paint: themes, viewports, languages, the A A A buttons ---- */
  add('overview', {}, async function () {});
  add('overview-dark', { theme: 'dark' }, async function () {});
  SIZES.forEach(function (s) {
    add('overview-' + s[0], { w: s[0], h: s[1] }, async function () {});
  });
  add('overview-dark-390', { theme: 'dark', w: 390, h: 844 }, async function () {});
  add('overview-dark-1920', { theme: 'dark', w: 1920, h: 1080 }, async function () {});
  // around the breakpoints of the stylesheet (1599 · 1279 · 1024 · 860) and the phone widths
  [[1600, 900], [1599, 900], [1279, 800], [1100, 800], [1025, 800], [900, 800], [861, 800], [860, 800], [700, 900], [600, 900], [480, 900], [360, 740]].forEach(function (s) {
    add('width-' + s[0], { w: s[0], h: s[1] }, async function () {});
  });
  add('en-overview', { lang: 'en' }, async function () {});
  add('en-overview-dark', { lang: 'en', theme: 'dark' }, async function () {});
  add('en-overview-390', { lang: 'en', w: 390, h: 844 }, async function () {});
  add('fs-plus', {}, 'fontAdj("2px"); await sleep(600);');
  add('fs-minus', {}, 'fontAdj("-2px"); await sleep(600);');
  add('fs-plus-dark-768', { theme: 'dark', w: 768, h: 1024 }, 'fontAdj("2px"); await sleep(600);');

  /* ---- loading / empty / error states ---- */
  add('state-loading', { mock: 'slow', ready: NO_ROWS, settle: 200 }, async function () {});
  add('state-loading-dark', { mock: 'slow', ready: NO_ROWS, settle: 200, theme: 'dark' }, async function () {});
  add('state-empty', { mock: 'empty', ready: NO_ROWS }, async function () {});
  add('state-empty-dark-390', { mock: 'empty', ready: NO_ROWS, theme: 'dark', w: 390, h: 844 }, async function () {});
  add('en-state-empty', { mock: 'empty', ready: NO_ROWS, lang: 'en' }, async function () {});
  add('state-list-html', { live: { mock: 'rest-list' }, mock: 'list-html', ready: NO_ROWS }, async function () {});
  add('state-list-down', { live: { mock: 'rest-list-down' }, mock: 'list-down', ready: NO_ROWS }, async function () {});
  add('en-state-list-down', { live: { mock: 'rest-list-down' }, mock: 'list-down', ready: NO_ROWS, lang: 'en' }, async function () {});
  add('state-leads-error', { live: { mock: 'rest-leads' }, mock: 'leads-error' }, async function () {});
  add('state-products-error', { live: { mock: 'rest-products' }, mock: 'products-error' }, async function () {});
  add('state-products-error-menu', { live: { mock: 'rest-products' }, mock: 'products-error' }, async function () { click('#sd2ProductBtn'); await sleep(300); });

  /* ---- sorting: every sortable column, ascending then descending ---- */
  ['date', 'docNo', 'stLabel', 'maker', 'desc', 'payer', 'prospectNo', 'leadNo'].forEach(function (k) {
    add('sort-' + k, {}, 'click(' + q('.sd2-table thead th[data-sort="' + k + '"]') + '); await sleep(300);');
    add('sort-' + k + '-desc', {}, 'click(' + q('.sd2-table thead th[data-sort="' + k + '"]') + '); await sleep(100); click(' + q('.sd2-table thead th[data-sort="' + k + '"]') + '); await sleep(300);');
  });
  add('sort-switch-column', {}, async function (sleep) { click('.sd2-table thead th[data-sort="docNo"]'); await sleep(100); click('.sd2-table thead th[data-sort="payer"]'); await sleep(300); });
  add('sort-dark', { theme: 'dark' }, async function (sleep) { click('.sd2-table thead th[data-sort="stLabel"]'); await sleep(300); });
  add('sort-then-filter', {}, async function (sleep) { click('.sd2-table thead th[data-sort="payer"]'); await sleep(100); click('#sd2FilterBtn'); click('#sd2FilterMenu [data-f="done"]'); await sleep(300); });

  /* ---- search pill ---- */
  add('search-open', {}, async function (sleep) { click('#sd2SearchBtn'); await sleep(300); });
  add('search-open-dark', { theme: 'dark' }, async function (sleep) { click('#sd2SearchBtn'); await sleep(300); });
  add('search-open-390', { w: 390, h: 844 }, async function (sleep) { click('#sd2SearchBtn'); await sleep(300); });
  add('search-open-twice', {}, async function (sleep) { click('#sd2SearchBtn'); await sleep(200); click('#sd2SearchBtn'); await sleep(300); });
  add('search-type-docno', {}, async function (sleep) { click('#sd2SearchBtn'); typeIn('#sd2SearchInput', 'RV:M13'); await sleep(300); });
  add('search-type-payer', {}, async function (sleep) { click('#sd2SearchBtn'); typeIn('#sd2SearchInput', 'สม'); await sleep(300); });
  add('search-type-lead', {}, async function (sleep) { click('#sd2SearchBtn'); typeIn('#sd2SearchInput', 'LD:00'); await sleep(300); });
  add('search-type-code', {}, async function (sleep) { click('#sd2SearchBtn'); typeIn('#sd2SearchInput', 'p00'); await sleep(300); });
  add('search-none', {}, async function (sleep) { click('#sd2SearchBtn'); typeIn('#sd2SearchInput', 'ไม่มีแน่นอน'); await sleep(300); });
  add('search-none-dark', { theme: 'dark' }, async function (sleep) { click('#sd2SearchBtn'); typeIn('#sd2SearchInput', 'ไม่มีแน่นอน'); await sleep(300); });
  add('search-go-button', {}, async function (sleep) { click('#sd2SearchBtn'); var i = $('#sd2SearchInput'); i.value = 'RV:M14'; click('#sd2SearchGo'); await sleep(300); });
  add('search-enter', {}, async function (sleep) { click('#sd2SearchBtn'); var i = $('#sd2SearchInput'); i.value = 'RV:M15'; i.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true })); await sleep(300); });
  add('search-escape', {}, async function (sleep) { click('#sd2SearchBtn'); typeIn('#sd2SearchInput', 'RV:M13'); await sleep(100); $('#sd2SearchInput').dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true })); await sleep(300); });
  add('search-clear-x', {}, async function (sleep) { click('#sd2SearchBtn'); typeIn('#sd2SearchInput', 'RV:M13'); await sleep(100); click('#sd2SearchClear'); await sleep(300); });
  add('search-en', { lang: 'en' }, async function (sleep) { click('#sd2SearchBtn'); typeIn('#sd2SearchInput', 'RV:M13'); await sleep(300); });

  /* ---- status filter ---- */
  add('filter-open', {}, async function (sleep) { click('#sd2FilterBtn'); await sleep(300); });
  add('filter-open-dark', { theme: 'dark' }, async function (sleep) { click('#sd2FilterBtn'); await sleep(300); });
  add('filter-open-390', { w: 390, h: 844 }, async function (sleep) { click('#sd2FilterBtn'); await sleep(300); });
  add('filter-wait', {}, async function (sleep) { click('#sd2FilterBtn'); click('#sd2FilterMenu [data-f="wait"]'); await sleep(300); });
  add('filter-done', {}, async function (sleep) { click('#sd2FilterBtn'); click('#sd2FilterMenu [data-f="done"]'); await sleep(300); });
  add('filter-done-dark', { theme: 'dark' }, async function (sleep) { click('#sd2FilterBtn'); click('#sd2FilterMenu [data-f="done"]'); await sleep(300); });
  add('filter-done-then-all', {}, async function (sleep) { click('#sd2FilterBtn'); click('#sd2FilterMenu [data-f="done"]'); await sleep(100); click('#sd2FilterBtn'); click('#sd2FilterMenu [data-f="all"]'); await sleep(300); });
  add('filter-toggle-closes', {}, async function (sleep) { click('#sd2FilterBtn'); await sleep(100); click('#sd2FilterBtn'); await sleep(300); });
  add('filter-en', { lang: 'en' }, async function (sleep) { click('#sd2FilterBtn'); click('#sd2FilterMenu [data-f="wait"]'); await sleep(300); });

  /* ---- product dropdown ---- */
  add('product-open', {}, async function (sleep) { click('#sd2ProductBtn'); await sleep(300); });
  add('product-open-dark', { theme: 'dark' }, async function (sleep) { click('#sd2ProductBtn'); await sleep(300); });
  add('product-open-390', { w: 390, h: 844 }, async function (sleep) { click('#sd2ProductBtn'); await sleep(300); });
  ['M13', 'M14', 'M15'].forEach(function (mt) {
    add('product-' + mt, {}, 'click("#sd2ProductBtn"); click(' + q('#sd2ProductMenu .sd2-menu-item[data-v="' + mt + '"]') + '); await sleep(300);');
  });
  add('product-M14-dark', { theme: 'dark' }, async function (sleep) { click('#sd2ProductBtn'); click('#sd2ProductMenu .sd2-menu-item[data-v="M14"]'); await sleep(300); });
  add('product-M14-open-again', {}, async function (sleep) { click('#sd2ProductBtn'); click('#sd2ProductMenu .sd2-menu-item[data-v="M14"]'); await sleep(100); click('#sd2ProductBtn'); await sleep(300); });
  add('product-then-all', {}, async function (sleep) { click('#sd2ProductBtn'); click('#sd2ProductMenu .sd2-menu-item[data-v="M13"]'); await sleep(100); click('#sd2ProductBtn'); click('#sd2ProductMenu .sd2-menu-item[data-v=""]'); await sleep(300); });
  // the choice is kept (TS_PREF = localStorage + a cookie) and restored on the next visit
  add('product-kept', {}, async function (sleep) {
    click('#sd2ProductBtn'); click('#sd2ProductMenu .sd2-menu-item[data-v="M15"]'); await sleep(300);
    $('.sd2-root').setAttribute('data-kept', localStorage.getItem('ts_rvlist_selected_mt') + ' | ' + /(?:^|; )tsp_ts_rvlist_selected_mt=([^;]*)/.exec(document.cookie)[1]);
  });
  add('product-restored', { local: { ts_rvlist_selected_mt: 'M14' } }, async function () {});
  add('product-restored-dark-390', { local: { ts_rvlist_selected_mt: 'M13' }, theme: 'dark', w: 390, h: 844 }, async function () {});
  add('product-restored-unknown', { local: { ts_rvlist_selected_mt: 'M99' } }, async function () {});
  add('product-restored-products-error', { live: { mock: 'rest-products' }, local: { ts_rvlist_selected_mt: 'M14' }, mock: 'products-error' }, async function () {});
  add('en-product-M13', { lang: 'en' }, async function (sleep) { click('#sd2ProductBtn'); click('#sd2ProductMenu .sd2-menu-item[data-v="M13"]'); await sleep(300); });

  /* ---- the three filters together; a click elsewhere closes the menus ---- */
  add('combined', {}, async function (sleep) {
    click('#sd2ProductBtn'); click('#sd2ProductMenu .sd2-menu-item[data-v="M13"]'); await sleep(100);
    click('#sd2FilterBtn'); click('#sd2FilterMenu [data-f="done"]'); await sleep(100);
    click('#sd2SearchBtn'); typeIn('#sd2SearchInput', 'p0'); await sleep(300);
  });
  add('menu-closes-on-outside-click', {}, async function (sleep) { click('#sd2ProductBtn'); await sleep(100); click('.sd2-title'); await sleep(300); });
  add('menu-switch-product-filter', {}, async function (sleep) { click('#sd2ProductBtn'); await sleep(100); click('#sd2FilterBtn'); await sleep(300); });

  /* ---- approve ---- */
  add('approve-open', {}, async function (sleep) { await openApprove(400); });
  add('approve-open-dark', { theme: 'dark' }, async function (sleep) { await openApprove(400); });
  add('approve-open-390', { w: 390, h: 844 }, async function (sleep) { await openApprove(400); });
  add('approve-open-1920', { w: 1920, h: 1080 }, async function (sleep) { await openApprove(400); });
  add('en-approve-open', { lang: 'en' }, async function (sleep) { await openApprove(400); });
  add('approve-fs-plus', {}, async function (sleep) { fontAdj('2px'); await openApprove(400); });
  add('approve-select', {}, async function (sleep) { await openApprove(); pick('#sd2DebtFormat', 'loanfee'); await sleep(300); });
  add('approve-select-then-clear', {}, async function (sleep) { await openApprove(); pick('#sd2DebtFormat', 'loanfee'); await sleep(100); pick('#sd2DebtFormat', ''); await sleep(300); });
  add('approve-confirm', {}, async function (sleep) { await openApprove(); pick('#sd2DebtFormat', 'preloan'); click('#sd2DialogConfirm'); await sleep(1500); });
  add('approve-confirm-dark', { theme: 'dark' }, async function (sleep) { await openApprove(); pick('#sd2DebtFormat', 'translate'); click('#sd2DialogConfirm'); await sleep(1500); });
  add('approve-confirm-busy', {}, async function (sleep) { await openApprove(); pick('#sd2DebtFormat', 'preloan'); click('#sd2DialogConfirm'); await sleep(20); });
  add('approve-confirm-disabled-click', {}, async function (sleep) { await openApprove(); click('#sd2DialogConfirm'); await sleep(400); });
  add('approve-cancel', {}, async function (sleep) { await openApprove(); pick('#sd2DebtFormat', 'preloan'); click('#sd2DialogCancel'); await sleep(300); });
  add('approve-close-x', {}, async function (sleep) { await openApprove(); click('#sd2DialogClose'); await sleep(300); });
  add('approve-overlay-click', {}, async function (sleep) { await openApprove(); $('#sd2Overlay').click(); await sleep(300); });
  add('approve-dialog-click-stays', {}, async function (sleep) { await openApprove(); $('.sd2-dialog').click(); await sleep(300); });
  add('approve-escape-stays', {}, async function (sleep) { await openApprove(); document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true })); await sleep(300); });
  add('approve-reopen-clean', {}, async function (sleep) { await openApprove(); pick('#sd2DebtFormat', 'preloan'); click('#sd2DialogCancel'); await sleep(100); await openApprove(300); });
  add('approve-second-row', {}, async function (sleep) { click($$('#sd2Body .sd2-approve-btn:not(.approved)')[1]); await sleep(300); pick('#sd2DebtFormat', 'loanfee'); click('#sd2DialogConfirm'); await sleep(1500); });
  // 933 (new) and 935 (waitToFlow): the call goes through but nothing is approved yet (hopDone = false) → the backend message
  add('approve-not-yet-new', {}, async function (sleep) { click($('#sd2Body tr[data-id="933"] .sd2-approve-btn')); await sleep(300); pick('#sd2DebtFormat', 'preloan'); click('#sd2DialogConfirm'); await sleep(1500); });
  add('approve-not-yet-waitToFlow', {}, async function (sleep) { click($('#sd2Body tr[data-id="935"] .sd2-approve-btn')); await sleep(300); pick('#sd2DebtFormat', 'preloan'); click('#sd2DialogConfirm'); await sleep(1500); });
  add('approve-403', { live: { mock: 'rest-approve-403' }, mock: 'approve-403' }, async function (sleep) { await openApprove(); pick('#sd2DebtFormat', 'preloan'); click('#sd2DialogConfirm'); await sleep(1500); });
  add('approve-500', { live: { mock: 'rest-approve-500' }, mock: 'approve-500' }, async function (sleep) { await openApprove(); pick('#sd2DebtFormat', 'preloan'); click('#sd2DialogConfirm'); await sleep(1500); });
  add('approve-down', { live: { mock: 'rest-approve-down' }, mock: 'approve-down' }, async function (sleep) { await openApprove(); pick('#sd2DebtFormat', 'preloan'); click('#sd2DialogConfirm'); await sleep(1500); });
  add('en-approve-confirm', { lang: 'en' }, async function (sleep) { await openApprove(); pick('#sd2DebtFormat', 'preloan'); click('#sd2DialogConfirm'); await sleep(1500); });
  add('approve-then-filter-wait', {}, async function (sleep) {
    await openApprove(); pick('#sd2DebtFormat', 'preloan'); click('#sd2DialogConfirm'); await sleep(1500);
    click('#sd2FilterBtn'); click('#sd2FilterMenu [data-f="wait"]'); await sleep(300);
  });
  add('approve-disabled-rows', {}, async function (sleep) {
    // the rows that cannot be approved: done / cancelled / ActionWaitProcess — a click does nothing
    click($('#sd2Body tr[data-id="936"] .sd2-approve-btn')); click($('#sd2Body tr[data-id="940"] .sd2-approve-btn')); await sleep(300);
  });

  /* ---- report popover ---- */
  add('report-open-synced', {}, async function (sleep) { click($('#sd2Body tr[data-id="939"] .sd2-report')); await sleep(300); });
  add('report-open-unsynced', {}, async function (sleep) { click($('#sd2Body tr[data-id="938"] .sd2-report')); await sleep(300); });
  add('report-open-dark', { theme: 'dark' }, async function (sleep) { click($('#sd2Body tr[data-id="939"] .sd2-report')); await sleep(300); });
  add('report-open-390', { w: 390, h: 844 }, async function (sleep) { click($('#sd2Body tr[data-id="939"] .sd2-report')); await sleep(300); });
  add('report-open-1024', { w: 1024, h: 768 }, async function (sleep) { click($('#sd2Body tr[data-id="939"] .sd2-report')); await sleep(300); });
  add('en-report-open', { lang: 'en' }, async function (sleep) { click($('#sd2Body tr[data-id="939"] .sd2-report')); await sleep(300); });
  add('report-another-row', {}, async function (sleep) { click($('#sd2Body tr[data-id="939"] .sd2-report')); await sleep(100); click($('#sd2Body tr[data-id="937"] .sd2-report')); await sleep(300); });
  add('report-closes-outside', {}, async function (sleep) { click($('#sd2Body tr[data-id="939"] .sd2-report')); await sleep(100); click('.sd2-title'); await sleep(300); });
  add('report-closes-on-resize', {}, async function (sleep) { click($('#sd2Body tr[data-id="939"] .sd2-report')); await sleep(100); window.dispatchEvent(new Event('resize')); await sleep(300); });
  add('report-closes-on-scroll', {}, async function (sleep) { click($('#sd2Body tr[data-id="939"] .sd2-report')); await sleep(100); $('.sd2-table-wrap').dispatchEvent(new Event('scroll')); await sleep(300); });
  add('report-pdf-synced', {}, async function (sleep) { stubOpen(); click($('#sd2Body tr[data-id="939"] .sd2-report')); click('#sd2Pop .sd2-dl[data-type="pdf"]'); await sleep(500); await noteOpened(); });
  add('report-image-synced', {}, async function (sleep) { stubOpen(); click($('#sd2Body tr[data-id="939"] .sd2-report')); click('#sd2Pop .sd2-dl[data-type="img"]'); await sleep(500); await noteOpened(); });
  add('report-pdf-two-forms', {}, async function (sleep) { stubOpen(); click($('#sd2Body tr[data-id="932"] .sd2-report')); click('#sd2Pop .sd2-dl[data-type="pdf"]'); await sleep(500); await noteOpened(); });
  // a receipt that is not in the ERP yet: the toast explains, the PDF is the one made from the CRM data (/rvreceipt), the image is drawn on a canvas
  add('report-pdf-unsynced', {}, async function (sleep) { stubOpen(); click($('#sd2Body tr[data-id="938"] .sd2-report')); click('#sd2Pop .sd2-dl[data-type="pdf"]'); await sleep(500); await noteOpened(); });
  add('report-pdf-unsynced-dark', { theme: 'dark' }, async function (sleep) { stubOpen(); click($('#sd2Body tr[data-id="938"] .sd2-report')); click('#sd2Pop .sd2-dl[data-type="pdf"]'); await sleep(500); await noteOpened(); });
  add('report-image-unsynced', {}, async function (sleep) { stubOpen(); click($('#sd2Body tr[data-id="938"] .sd2-report')); click('#sd2Pop .sd2-dl[data-type="img"]'); await sleep(1200); await noteOpenedImage(); });
  add('report-image-unsynced-usd', {}, async function (sleep) { stubOpen(); click($('#sd2Body tr[data-id="940"] .sd2-report')); click('#sd2Pop .sd2-dl[data-type="img"]'); await sleep(1200); await noteOpenedImage(); });
  add('report-image-unsynced-payments', {}, async function (sleep) { stubOpen(); click($('#sd2Body tr[data-id="905"] .sd2-report')); click('#sd2Pop .sd2-dl[data-type="img"]'); await sleep(1200); await noteOpenedImage(); });
  add('report-image-unsynced-detail-error', { live: { mock: 'rest-detail' }, mock: 'detail-error' }, async function (sleep) { stubOpen(); click($('#sd2Body tr[data-id="938"] .sd2-report')); click('#sd2Pop .sd2-dl[data-type="img"]'); await sleep(1200); await noteOpenedImage(); });
  add('report-image-unsynced-detail-missing', { mock: 'detail-missing' }, async function (sleep) { stubOpen(); click($('#sd2Body tr[data-id="938"] .sd2-report')); click('#sd2Pop .sd2-dl[data-type="img"]'); await sleep(1200); await noteOpenedImage(); });
  add('en-report-pdf-unsynced', { lang: 'en' }, async function (sleep) { stubOpen(); click($('#sd2Body tr[data-id="938"] .sd2-report')); click('#sd2Pop .sd2-dl[data-type="pdf"]'); await sleep(500); await noteOpened(); });

  /* ---- detail modal ---- */
  add('detail-skeleton', { mock: 'slow-detail' }, async function (sleep) { click($('#sd2Body tr[data-id="939"]')); await sleep(300); });
  add('detail-skeleton-dark', { mock: 'slow-detail', theme: 'dark' }, async function (sleep) { click($('#sd2Body tr[data-id="939"]')); await sleep(300); });
  [['910', 'cash-change'], ['905', 'two-payments'], ['913', 'usd'], ['909', 'transfer'], ['939', 'synced'], ['933', 'new'], ['938', 'cancelled'], ['917', 'unknown-status'], ['940', 'usd-change']].forEach(function (r) {
    add('detail-' + r[1], {}, 'click($("#sd2Body tr[data-id=\\"' + r[0] + '\\"]")); await sleep(900);');
  });
  add('detail-dark', { theme: 'dark' }, async function (sleep) { click($('#sd2Body tr[data-id="905"]')); await sleep(900); });
  add('detail-390', { w: 390, h: 844 }, async function (sleep) { click($('#sd2Body tr[data-id="905"]')); await sleep(900); });
  add('detail-dark-390', { w: 390, h: 844, theme: 'dark' }, async function (sleep) { click($('#sd2Body tr[data-id="905"]')); await sleep(900); });
  add('detail-768', { w: 768, h: 1024 }, async function (sleep) { click($('#sd2Body tr[data-id="905"]')); await sleep(900); });
  add('detail-short-viewport', { w: 1280, h: 400 }, async function (sleep) { click($('#sd2Body tr[data-id="905"]')); await sleep(900); });
  add('detail-fs-plus', {}, async function (sleep) { fontAdj('2px'); click($('#sd2Body tr[data-id="905"]')); await sleep(900); });
  add('en-detail', { lang: 'en' }, async function (sleep) { click($('#sd2Body tr[data-id="905"]')); await sleep(900); });
  add('en-detail-usd', { lang: 'en' }, async function (sleep) { click($('#sd2Body tr[data-id="913"]')); await sleep(900); });
  add('detail-missing', { mock: 'detail-missing' }, async function (sleep) { click($('#sd2Body tr[data-id="939"]')); await sleep(900); });
  add('detail-error', { live: { mock: 'rest-detail' }, mock: 'detail-error' }, async function (sleep) { click($('#sd2Body tr[data-id="939"]')); await sleep(900); });
  add('detail-error-dark', { live: { mock: 'rest-detail' }, mock: 'detail-error', theme: 'dark' }, async function (sleep) { click($('#sd2Body tr[data-id="939"]')); await sleep(900); });
  add('detail-close-x', {}, async function (sleep) { click($('#sd2Body tr[data-id="939"]')); await sleep(700); click('#sd2DetailClose'); await sleep(300); });
  add('detail-close-overlay', {}, async function (sleep) { click($('#sd2Body tr[data-id="939"]')); await sleep(700); $('#sd2DetailOverlay').click(); await sleep(300); });
  add('detail-box-click-stays', {}, async function (sleep) { click($('#sd2Body tr[data-id="939"]')); await sleep(700); $('.sd2-dt-box').click(); await sleep(300); });
  add('detail-reopen-other', {}, async function (sleep) { click($('#sd2Body tr[data-id="939"]')); await sleep(700); click('#sd2DetailClose'); await sleep(200); click($('#sd2Body tr[data-id="913"]')); await sleep(900); });
  add('detail-scroll-reset', { w: 1280, h: 420 }, async function (sleep) {
    click($('#sd2Body tr[data-id="905"]')); await sleep(900); $('.sd2-dt-box').scrollTop = 200; click('#sd2DetailClose'); await sleep(200);
    click($('#sd2Body tr[data-id="913"]')); await sleep(900);
  });
  add('detail-resize-recenters', {}, async function (sleep) { click($('#sd2Body tr[data-id="905"]')); await sleep(700); window.dispatchEvent(new Event('resize')); await sleep(400); });
  // the button on the modal opens the ERP form of the receipt (the number is remembered from the row that was clicked)
  add('detail-form-synced', {}, async function (sleep) { stubOpen(); click($('#sd2Body tr[data-id="939"]')); await sleep(700); click('#sd2DtOpenForm'); await sleep(500); await noteOpened(); });
  add('detail-form-unsynced', {}, async function (sleep) { stubOpen(); click($('#sd2Body tr[data-id="938"]')); await sleep(700); click('#sd2DtOpenForm'); await sleep(500); await noteOpened(); });
  add('detail-form-unsynced-dark', { theme: 'dark' }, async function (sleep) { stubOpen(); click($('#sd2Body tr[data-id="938"]')); await sleep(700); click('#sd2DtOpenForm'); await sleep(500); await noteOpened(); });
  add('en-detail-form-unsynced', { lang: 'en' }, async function (sleep) { stubOpen(); click($('#sd2Body tr[data-id="938"]')); await sleep(700); click('#sd2DtOpenForm'); await sleep(500); await noteOpened(); });
  add('detail-after-sort', {}, async function (sleep) { click('.sd2-table thead th[data-sort="payer"]'); await sleep(200); click($$('#sd2Body tr[data-id]')[0]); await sleep(900); });

  /* ---- navigation ---- */
  add('add-button', { roots: [] }, async function (sleep) { trackNav(); click('#sd2AddBtn'); await sleep(500); });

  /* ---- the table scrolls sideways on a narrow screen (drag to scroll) ---- */
  add('narrow-scroll-drag', { w: 390, h: 844 }, async function (sleep) {
    var w = $('.sd2-table-wrap'), r = w.getBoundingClientRect();
    var ev = function (t, x) { return new MouseEvent(t, { bubbles: true, cancelable: true, button: 0, clientX: x, clientY: r.top + 100 }); };
    w.dispatchEvent(ev('mousedown', r.left + 300)); document.dispatchEvent(ev('mousemove', r.left + 250)); document.dispatchEvent(ev('mousemove', r.left + 120)); document.dispatchEvent(ev('mouseup', r.left + 120));
    await sleep(300);
    $('.sd2-root').setAttribute('data-scrolled', String(Math.round(w.scrollLeft)));
  });
  add('narrow-scroll-end', { w: 390, h: 844 }, async function (sleep) { var w = $('.sd2-table-wrap'); w.scrollLeft = 9999; await sleep(300); });
  add('wide-scroll-bottom', { w: 1280, h: 500 }, async function (sleep) { var w = $('.sd2-table-wrap'); w.scrollTop = 9999; await sleep(300); });
}
