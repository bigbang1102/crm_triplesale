// Scenarios of the receipt form comparison. Each function is run INSIDE the page under test (Java replica / Angular app) with
// (sleep, side, win) in scope, after the prelude of lib/scenario-pre.mjs and the page prelude (`pre` in page.mjs: line(), pay(), fillValid(),
// choosePayer(), attach(), saveClick(), swalOk() …).
// add(name, opts, fn):  opts = { w, h, theme, lang, settle, wait, roots, ready, storage, mock, q }
//   mock = a fault of the fake backend (`?mock=` of the page address, see receipts.mock.ts)   q = the rest of the query string (leadId=…)
// A scenario that throws is recorded as SCENARIO-ERROR in its dump on that side — the run prints it, and none may be left.
//   live = what differs in a `run.mjs --live` run, on BOTH sides (the Angular app then talks to the fake REST service of replica.mjs, not to the
//   mock): { mock: 'rest-…' } = the fault is a failure of the REST service (the servlet answered those the same way whatever failed — HTTP 200 and
//   an envelope —, which is what the mock's rest-* faults answer); false = the situation cannot happen without the servlet (its own role check)
export default function (add) {
  const q = JSON.stringify;
  // the dump roots of the page plus the customer picker (240 customers: only the scenarios that open it)
  const ROOTS = ['.rv-root', '#rvPayDlgOverlay', '#rvSuccessOverlay', '.rv-item-panel', '.ods-list', '.swal-overlay'];
  const WITH_PICKER = ROOTS.concat('#rvCustPop');
  const SIZES = [[390, 844], [768, 1024], [1024, 768], [1920, 1080]];
  // the figures of fillValid(): 5,000.00 + 7% VAT = 5,350.00, paid in cash

  /* ---- first paint: themes, viewports, languages, the A A A buttons ---- */
  add('overview', {}, async function () {});
  add('overview-dark', { theme: 'dark' }, async function () {});
  SIZES.forEach(function (s) {
    add('overview-' + s[0], { w: s[0], h: s[1] }, async function () {});
  });
  add('overview-dark-390', { theme: 'dark', w: 390, h: 844 }, async function () {});
  add('overview-dark-1920', { theme: 'dark', w: 1920, h: 1080 }, async function () {});
  // around the breakpoints of the stylesheet (1279 · 1023 · 767 · 600)
  [[1500, 900], [1280, 800], [1279, 800], [1100, 800], [1023, 800], [900, 800], [767, 900], [700, 900], [600, 900], [599, 900], [480, 900], [360, 740]].forEach(function (s) {
    add('width-' + s[0], { w: s[0], h: s[1] }, async function () {});
  });
  [[1279, 800], [1023, 800], [767, 900], [600, 900]].forEach(function (s) {
    add('width-filled-' + s[0], { w: s[0], h: s[1] }, async function () { await fillValid(); });
  });
  add('en-overview', { lang: 'en' }, async function () {});
  add('en-overview-dark', { lang: 'en', theme: 'dark' }, async function () {});
  add('en-overview-390', { lang: 'en', w: 390, h: 844 }, async function () {});
  add('fs-plus', {}, 'fontAdj("2px"); await sleep(600);');
  add('fs-minus', {}, 'fontAdj("-2px"); await sleep(600);');
  add('fs-plus-dark-768', { theme: 'dark', w: 768, h: 1024 }, 'fontAdj("2px"); await sleep(600);');
  // filled in: a customer, a branch, a line and the payment
  add('valid-filled', {}, async function () { await fillValid(); });
  add('valid-filled-dark', { theme: 'dark' }, async function () { await fillValid(); });
  SIZES.slice(0, 3).forEach(function (s) {
    add('valid-filled-' + s[0], { w: s[0], h: s[1] }, async function () { await fillValid(); });
  });
  add('en-valid-filled', { lang: 'en' }, async function () { await fillValid(); });
  add('valid-filled-fs-plus', {}, async function () { fontAdj('2px'); await fillValid(); });

  /* ---- the link back to the list ---- */
  add('back-link', { roots: [] }, async function (sleep) { trackNav(); click('.rv-back'); await sleep(400); });
  add('back-link-icon', { roots: [] }, async function (sleep) { trackNav(); click('.rv-back i'); await sleep(400); });

  /* ---- header fields ---- */
  add('date-change', {}, async function (sleep) { typeIn('#rvDateText', '2026-03-05'); await sleep(500); });
  add('en-date-change', { lang: 'en' }, async function (sleep) { typeIn('#rvDateText', '2026-03-05'); await sleep(500); });
  add('date-picker-open', {}, async function (sleep) { click('#rvDateText'); await sleep(400); });
  add('date-picker-open-dark', { theme: 'dark' }, async function (sleep) { click('#rvDateText'); await sleep(400); });
  add('taxinv-special-chars', {}, async function (sleep) { typeIn('#rvTaxInv', 'TI<1>"2";{x}|[y]^~$%*+=\\'); await sleep(200); });
  add('taxinv-allowed-chars', {}, async function (sleep) { typeIn('#rvTaxInv', 'TI-001_2/3 #4:5@6&(7),8.9'); await sleep(200); });
  add('remark-thai-special', {}, async function (sleep) { typeIn('#rvRemark', 'หมายเหตุ <ทดสอบ> (ครั้งที่ 1) #2/3 & "x"'); await sleep(200); });
  add('refdoc-is-readonly', {}, async function (sleep) { var r = $('#rvRefDoc'); r.focus(); r.value = 'x'; await sleep(200); });
  add('currency-usd', {}, async function (sleep) { pick('#rvCurrency', 'USD'); await sleep(300); });
  add('currency-usd-dark', { theme: 'dark' }, async function (sleep) { pick('#rvCurrency', 'USD'); await sleep(300); });
  add('currency-usd-390', { w: 390, h: 844 }, async function (sleep) { pick('#rvCurrency', 'USD'); await sleep(300); });
  add('en-currency-usd', { lang: 'en' }, async function (sleep) { pick('#rvCurrency', 'USD'); await sleep(300); });
  add('currency-usd-rate-edit', {}, async function (sleep) { pick('#rvCurrency', 'USD'); await sleep(200); typeIn('#rvRate', '30.5'); await sleep(300); });
  add('currency-usd-with-line', {}, async function (sleep) { await line(0, 'excl', 'SV-LOAN-FEE', '100'); pick('#rvCurrency', 'USD'); await sleep(200); typeIn('#rvRate', '30'); await sleep(300); });
  add('currency-usd-clears-payments', {}, async function (sleep) { await fillValid(); pick('#rvCurrency', 'USD'); await sleep(300); });
  add('currency-back-to-thb', {}, async function (sleep) { pick('#rvCurrency', 'USD'); await sleep(150); pick('#rvCurrency', 'THB'); await sleep(300); });
  add('currency-usd-pay-and-save-echo', { mock: 'create-echo' }, async function (sleep) {
    await choosePayer('P00012'); await branch('SUN'); pick('#rvCurrency', 'USD'); await sleep(150); typeIn('#rvRate', '30'); await line(0, 'excl', 'SV-LOAN-FEE', '100');
    await pay('เงินสด', '3210'); await saveClick(); await swalOk(500);
  });
  add('currencies-error', { live: { mock: 'rest-currencies' }, mock: 'currencies-error', ready: "document.querySelector('#rvMethods .rv-method[data-m]') && document.querySelectorAll('#rvBranch option').length > 1", settle: 600 }, async function (sleep) { pick('#rvCurrency', 'USD'); await sleep(300); });
  add('branch-pick', {}, async function (sleep) { await branch('SUN02'); await sleep(200); });
  add('branch-single', { mock: 'branches-one', ready: "document.querySelector('#rvMethods .rv-method[data-m]') && document.querySelector('#rvBranch option[value=\"SUN\"]')" }, async function () {});
  add('branches-409', { live: { mock: 'rest-branches-409' }, mock: 'branches-409', ready: "document.querySelector('#rvMethods .rv-method[data-m]')" }, async function () {});
  add('branches-error', { live: { mock: 'rest-branches' }, mock: 'branches-error', ready: "document.querySelector('#rvMethods .rv-method[data-m]')" }, async function () {});

  /* ---- customer picker ---- */
  add('cust-open', { roots: WITH_PICKER }, async function (sleep) { click('#rvCustBtn'); await sleep(500); });
  add('cust-open-dark', { roots: WITH_PICKER, theme: 'dark' }, async function (sleep) { click('#rvCustBtn'); await sleep(500); });
  add('cust-open-390', { roots: WITH_PICKER, w: 390, h: 844 }, async function (sleep) { click('#rvCustBtn'); await sleep(500); });
  add('cust-open-768', { roots: WITH_PICKER, w: 768, h: 1024 }, async function (sleep) { click('#rvCustBtn'); await sleep(500); });
  add('en-cust-open', { roots: WITH_PICKER, lang: 'en' }, async function (sleep) { click('#rvCustBtn'); await sleep(500); });
  add('cust-search-name', { roots: WITH_PICKER }, async function (sleep) { click('#rvCustBtn'); await sleep(300); typeIn('#rvCustSearch', 'สมชาย'); await sleep(900); });
  add('cust-search-code', { roots: WITH_PICKER }, async function (sleep) { click('#rvCustBtn'); await sleep(300); typeIn('#rvCustSearch', 'p0001'); await sleep(900); });
  add('cust-search-lead', { roots: WITH_PICKER }, async function (sleep) { click('#rvCustBtn'); await sleep(300); typeIn('#rvCustSearch', 'LD:00-2026-08'); await sleep(900); });
  add('cust-search-none', { roots: WITH_PICKER }, async function (sleep) { click('#rvCustBtn'); await sleep(300); typeIn('#rvCustSearch', 'ไม่พบแน่นอน'); await sleep(900); });
  add('cust-search-none-dark', { roots: WITH_PICKER, theme: 'dark' }, async function (sleep) { click('#rvCustBtn'); await sleep(300); typeIn('#rvCustSearch', 'ไม่พบแน่นอน'); await sleep(900); });
  add('cust-search-then-clear', { roots: WITH_PICKER }, async function (sleep) { click('#rvCustBtn'); await sleep(300); typeIn('#rvCustSearch', 'สม'); await sleep(900); typeIn('#rvCustSearch', ''); await sleep(300); });
  add('cust-pick', {}, async function (sleep) { await choosePayer('P00012'); await sleep(300); });
  add('cust-pick-dark', { theme: 'dark' }, async function (sleep) { await choosePayer('P00012'); await sleep(300); });
  add('en-cust-pick', { lang: 'en' }, async function (sleep) { await choosePayer('P00012'); await sleep(300); });
  add('cust-pick-then-other', {}, async function (sleep) { await choosePayer('P00012'); await sleep(2700); await choosePayer('P00100'); await sleep(300); });
  add('cust-pick-after-search', {}, async function (sleep) { click('#rvCustBtn'); await sleep(300); typeIn('#rvCustSearch', 'P00012'); await sleep(900); click('#rvCustOpts .rv-cust-opt[data-code="P00012"]'); await sleep(300); });
  add('cust-reopen-clears-search', { roots: WITH_PICKER }, async function (sleep) { click('#rvCustBtn'); await sleep(300); typeIn('#rvCustSearch', 'สม'); await sleep(300); click('#rvCustBtn'); await sleep(200); click('#rvCustBtn'); await sleep(500); });
  add('cust-close-outside', { roots: WITH_PICKER }, async function (sleep) { click('#rvCustBtn'); await sleep(300); click('.rv-subhead'); await sleep(300); });
  add('cust-click-inside-stays', { roots: WITH_PICKER }, async function (sleep) { click('#rvCustBtn'); await sleep(300); click('.rv-pop-title'); await sleep(300); });
  add('cust-close-on-resize', { roots: WITH_PICKER }, async function (sleep) { click('#rvCustBtn'); await sleep(300); window.dispatchEvent(new Event('resize')); await sleep(300); });
  add('cust-close-on-scroll', { roots: WITH_PICKER }, async function (sleep) { click('#rvCustBtn'); await sleep(300); document.dispatchEvent(new Event('scroll')); window.dispatchEvent(new Event('scroll')); await sleep(300); });
  add('cust-leads-error', { live: { mock: 'rest-leads' }, roots: WITH_PICKER, mock: 'leads-error' }, async function (sleep) { click('#rvCustBtn'); await sleep(500); });

  /* ---- the line table ---- */
  add('rows-add-1', {}, async function () { await addRow(); });
  add('rows-add-3', {}, async function () { await addRow(); await addRow(); await addRow(); });
  add('rows-add-dark', { theme: 'dark' }, async function () { await addRow(); await addRow(); });
  add('rows-add-390', { w: 390, h: 844 }, async function () { await addRow(); await addRow(); });
  add('rows-add-768', { w: 768, h: 1024 }, async function () { await addRow(); });
  add('en-rows-add', { lang: 'en' }, async function () { await addRow(); await addRow(); });
  ['excl', 'incl', 'none'].forEach(function (m) {
    add('row-mode-' + m, {}, 'await addRow(); await setMethod(0, ' + q(m) + '); await setCell(0, ".rv-c-value", "1000"); await sleep(200);');
  });
  add('row-mode-sel-with-value', {}, async function () { await addRow(); await setCell(0, '.rv-c-value', '1000'); });
  add('row-mode-dark', { theme: 'dark' }, async function () { await line(0, 'incl', 'SV-LOAN-FEE', '1070'); });
  add('row-incl-rounding', {}, async function () { await line(0, 'incl', 'SV-LOAN-FEE', '500'); await line(1, 'incl', 'SV-LEGAL', '333.33'); await line(2, 'excl', 'SV-STAMP', '0.01'); });
  add('row-many-lines', { w: 1280, h: 1400 }, async function () { for (var i = 0; i < 6; i++) await line(i, i % 3 === 0 ? 'excl' : i % 3 === 1 ? 'incl' : 'none', i % 2 ? 'SV-LEGAL' : 'SV-INSURE', String(1000 + i * 100.5)); });
  add('row-wht-3', {}, async function () { await line(0, 'excl', 'SV-LOAN-FEE', '5000'); await setCell(0, '.rv-c-wht', '3'); });
  add('row-wht-clamp-high', {}, async function (sleep) { await line(0, 'excl', 'SV-LOAN-FEE', '5000'); var w = rowEl(0).querySelector('.rv-c-wht'); typeIn(w, '250'); w.dispatchEvent(new FocusEvent('blur')); await sleep(200); });
  add('row-wht-blur-format', {}, async function (sleep) { await line(0, 'excl', 'SV-LOAN-FEE', '5000'); var w = rowEl(0).querySelector('.rv-c-wht'); typeIn(w, '7'); w.dispatchEvent(new FocusEvent('blur')); await sleep(200); });
  add('row-wht-incl', {}, async function () { await line(0, 'incl', 'SV-LOAN-FEE', '1070'); await setCell(0, '.rv-c-wht', '5'); });
  add('row-value-filter', {}, async function (sleep) { await addRow(); await setCell(0, '.rv-c-value', '12a3.4.5-x'); await sleep(200); });
  add('row-value-maxlength', {}, async function (sleep) { await addRow(); var v = rowEl(0).querySelector('.rv-c-value'); v.maxLength; await setCell(0, '.rv-c-value', '1234567890123456789'); await sleep(200); });
  add('row-desc-special', {}, async function (sleep) { await addRow(); await setCell(0, '.rv-c-desc', 'งวดที่ <1> "ทดสอบ"; [x] | {y} #5 (ok) a-b_c.d,e/f:g@h&i'); await sleep(200); });
  add('row-desc-keeps-after-add', {}, async function (sleep) { await addRow(); await setCell(0, '.rv-c-desc', 'งวด 1'); await setCell(0, '.rv-c-value', '10'); await addRow(); await sleep(200); });
  add('row-delete-confirm-open', {}, async function (sleep) { await addRow(); await addRow(); click(rowEl(1).querySelector('.rv-del')); await sleep(500); });
  add('row-delete-confirm-open-dark', { theme: 'dark' }, async function (sleep) { await addRow(); await addRow(); click(rowEl(1).querySelector('.rv-del')); await sleep(500); });
  add('row-delete-ok', {}, async function (sleep) { await line(0, 'excl', 'SV-LOAN-FEE', '100'); await addRow(); click(rowEl(1).querySelector('.rv-del')); await sleep(400); await swalOk(500); });
  add('row-delete-first-keeps-others', {}, async function (sleep) { await line(0, 'excl', 'SV-LOAN-FEE', '100'); await line(1, 'incl', 'SV-LEGAL', '200'); click(rowEl(0).querySelector('.rv-del')); await sleep(400); await swalOk(500); });
  add('row-delete-cancel', {}, async function (sleep) { await addRow(); await addRow(); click(rowEl(1).querySelector('.rv-del')); await sleep(400); await swalCancel(500); });
  add('row-delete-last-refused', {}, async function (sleep) { await addRow(); click(rowEl(0).querySelector('.rv-del')); await sleep(500); });
  add('en-row-delete-open', { lang: 'en' }, async function (sleep) { await addRow(); await addRow(); click(rowEl(1).querySelector('.rv-del')); await sleep(500); });

  /* ---- the item picker (a panel on <body> under the toggle) ---- */
  add('picker-open', {}, async function (sleep) { await addRow(); click(rowEl(0).querySelector('.rv-item-toggle')); await sleep(600); });
  add('picker-open-dark', { theme: 'dark' }, async function (sleep) { await addRow(); click(rowEl(0).querySelector('.rv-item-toggle')); await sleep(600); });
  add('picker-open-390', { w: 390, h: 844 }, async function (sleep) { await addRow(); click(rowEl(0).querySelector('.rv-item-toggle')); await sleep(600); });
  add('picker-open-768', { w: 768, h: 1024 }, async function (sleep) { await addRow(); click(rowEl(0).querySelector('.rv-item-toggle')); await sleep(600); });
  add('picker-open-short', { w: 1280, h: 420 }, async function (sleep) { await addRow(); click(rowEl(0).querySelector('.rv-item-toggle')); await sleep(600); });
  add('en-picker-open', { lang: 'en' }, async function (sleep) { await addRow(); click(rowEl(0).querySelector('.rv-item-toggle')); await sleep(600); });
  add('picker-open-fs-plus', {}, async function (sleep) { fontAdj('2px'); await addRow(); click(rowEl(0).querySelector('.rv-item-toggle')); await sleep(600); });
  add('picker-loading', { mock: 'slow-materials' }, async function (sleep) { await addRow(); click(rowEl(0).querySelector('.rv-item-toggle')); await sleep(400); });
  add('picker-materials-error', { live: { mock: 'rest-materials' }, mock: 'materials-error' }, async function (sleep) { await addRow(); click(rowEl(0).querySelector('.rv-item-toggle')); await sleep(900); });
  add('picker-materials-empty', { mock: 'materials-empty' }, async function (sleep) { await addRow(); click(rowEl(0).querySelector('.rv-item-toggle')); await sleep(900); });
  add('picker-search-name', {}, async function (sleep) { await addRow(); click(rowEl(0).querySelector('.rv-item-toggle')); await sleep(600); typeIn('.rv-item-search-input', 'ค่า'); await sleep(300); });
  add('picker-search-code', {}, async function (sleep) { await addRow(); click(rowEl(0).querySelector('.rv-item-toggle')); await sleep(600); typeIn('.rv-item-search-input', 'sv-legal'); await sleep(300); });
  add('picker-search-none', {}, async function (sleep) { await addRow(); click(rowEl(0).querySelector('.rv-item-toggle')); await sleep(600); typeIn('.rv-item-search-input', 'zzz'); await sleep(300); });
  add('picker-search-none-dark', { theme: 'dark' }, async function (sleep) { await addRow(); click(rowEl(0).querySelector('.rv-item-toggle')); await sleep(600); typeIn('.rv-item-search-input', 'zzz'); await sleep(300); });
  add('picker-enter-picks-first', {}, async function (sleep) {
    await addRow(); click(rowEl(0).querySelector('.rv-item-toggle')); await sleep(600); typeIn('.rv-item-search-input', 'บริการ');
    $('.rv-item-search-input').dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true })); await sleep(300);
  });
  add('picker-escape-closes', {}, async function (sleep) { await addRow(); click(rowEl(0).querySelector('.rv-item-toggle')); await sleep(600); $('.rv-item-search-input').dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true })); await sleep(300); });
  add('picker-toggle-closes', {}, async function (sleep) { await addRow(); click(rowEl(0).querySelector('.rv-item-toggle')); await sleep(500); click(rowEl(0).querySelector('.rv-item-toggle')); await sleep(300); });
  add('picker-outside-click-closes', {}, async function (sleep) { await addRow(); click(rowEl(0).querySelector('.rv-item-toggle')); await sleep(500); click('.rv-subhead'); await sleep(300); });
  add('picker-click-in-panel-stays', {}, async function (sleep) { await addRow(); click(rowEl(0).querySelector('.rv-item-toggle')); await sleep(500); click('.rv-item-panel .rv-item-search'); await sleep(300); });
  add('picker-resize-closes', {}, async function (sleep) { await addRow(); click(rowEl(0).querySelector('.rv-item-toggle')); await sleep(500); window.dispatchEvent(new Event('resize')); await sleep(300); });
  add('picker-scroll-closes', {}, async function (sleep) { await addRow(); click(rowEl(0).querySelector('.rv-item-toggle')); await sleep(500); document.dispatchEvent(new Event('scroll')); window.dispatchEvent(new Event('scroll')); await sleep(300); });
  add('picker-scroll-inside-stays', {}, async function (sleep) { await addRow(); click(rowEl(0).querySelector('.rv-item-toggle')); await sleep(500); $('.rv-item-list').dispatchEvent(new Event('scroll', { bubbles: false })); await sleep(300); });
  add('picker-pick-with-price', {}, async function (sleep) { await addRow(); await pickItem(0, 'SV-APPRAISE'); await sleep(200); });
  add('picker-pick-no-price', {}, async function (sleep) { await addRow(); await setCell(0, '.rv-c-value', '77'); await pickItem(0, 'SV-ADS'); await sleep(200); });
  add('picker-pick-long-name', {}, async function (sleep) { await addRow(); await pickItem(0, 'SV-ADVISE'); await sleep(200); });
  add('picker-pick-long-name-390', { w: 390, h: 844 }, async function (sleep) { await addRow(); await pickItem(0, 'SV-ADVISE'); await sleep(200); });
  add('picker-pick-then-other', {}, async function (sleep) { await addRow(); await pickItem(0, 'SV-LEGAL'); await pickItem(0, 'SV-STAMP'); await sleep(200); });
  add('picker-active-mark', {}, async function (sleep) { await addRow(); await pickItem(0, 'SV-LEGAL'); click(rowEl(0).querySelector('.rv-item-toggle')); await sleep(500); });
  add('picker-pick-select-entry', {}, async function (sleep) { await addRow(); await pickItem(0, 'SV-LEGAL'); await pickItem(0, ''); await sleep(200); });
  add('picker-two-rows', {}, async function (sleep) { await addRow(); await addRow(); await pickItem(0, 'SV-LEGAL'); click(rowEl(1).querySelector('.rv-item-toggle')); await sleep(500); });
  add('picker-trading-goods-english', {}, async function (sleep) { await addRow(); await pickItem(0, 'TRADING'); await sleep(200); });

  /* ---- payments ---- */
  add('methods-default', {}, async function () {});
  add('methods-old-shape', { mock: 'methods-old' }, async function () {});
  add('methods-error-fallback', { live: { mock: 'rest-methods' }, mock: 'methods-error' }, async function () {});
  add('methods-empty-fallback', { mock: 'methods-empty' }, async function () {});
  add('methods-dark', { theme: 'dark' }, async function (sleep) { await line(0, 'excl', 'SV-LOAN-FEE', '100'); click('#rvMethods .rv-method[data-m="เงินสด"]'); await sleep(300); $('#rvPayDlgCancel').click(); await sleep(200); });
  add('pay-no-items-yet', {}, async function (sleep) { click('#rvMethods .rv-method[data-m="เงินสด"]'); await sleep(500); });
  add('pay-method-off', {}, async function (sleep) { await line(0, 'excl', 'SV-LOAN-FEE', '100'); click('#rvMethods .rv-method[data-m="เช็ค"]'); await sleep(500); });
  add('pay-method-off-old-shape', { mock: 'methods-old' }, async function (sleep) { await line(0, 'excl', 'SV-LOAN-FEE', '100'); click('#rvMethods .rv-method[data-m="เงินสด"]'); await sleep(500); });
  add('pay-cash-open', {}, async function (sleep) { await line(0, 'excl', 'SV-LOAN-FEE', '5000'); await openPay('เงินสด'); await sleep(300); });
  add('pay-cash-open-dark', { theme: 'dark' }, async function (sleep) { await line(0, 'excl', 'SV-LOAN-FEE', '5000'); await openPay('เงินสด'); await sleep(300); });
  add('pay-cash-open-390', { w: 390, h: 844 }, async function (sleep) { await line(0, 'excl', 'SV-LOAN-FEE', '5000'); await openPay('เงินสด'); await sleep(300); });
  add('pay-cash-open-1920', { w: 1920, h: 1080 }, async function (sleep) { await line(0, 'excl', 'SV-LOAN-FEE', '5000'); await openPay('เงินสด'); await sleep(300); });
  add('en-pay-cash-open', { lang: 'en' }, async function (sleep) { await line(0, 'excl', 'SV-LOAN-FEE', '5000'); await openPay('เงินสด'); await sleep(300); });
  add('pay-cash-open-fs-plus', {}, async function (sleep) { fontAdj('2px'); await line(0, 'excl', 'SV-LOAN-FEE', '5000'); await openPay('เงินสด'); await sleep(300); });
  add('pay-cash-keys', {}, async function (sleep) { await line(0, 'excl', 'SV-LOAN-FEE', '5000'); await openPay('เงินสด'); await keys('1234.5'); await sleep(200); });
  add('pay-cash-keys-two-decimals', {}, async function (sleep) { await line(0, 'excl', 'SV-LOAN-FEE', '5000'); await openPay('เงินสด'); await keys('12.345'); await sleep(200); });
  add('pay-cash-keys-second-point', {}, async function (sleep) { await line(0, 'excl', 'SV-LOAN-FEE', '5000'); await openPay('เงินสด'); await keys('1.2.3'); await sleep(200); });
  add('pay-cash-leading-point', {}, async function (sleep) { await line(0, 'excl', 'SV-LOAN-FEE', '5000'); await openPay('เงินสด'); await keys('.5'); await sleep(200); });
  add('pay-cash-leading-zeros', {}, async function (sleep) { await line(0, 'excl', 'SV-LOAN-FEE', '5000'); await openPay('เงินสด'); await keys('007'); await sleep(200); });
  add('pay-cash-large', {}, async function (sleep) { await line(0, 'excl', 'SV-LOAN-FEE', '5000'); await openPay('เงินสด'); await keys('123456789'); await sleep(200); });
  add('pay-cash-clear', {}, async function (sleep) { await line(0, 'excl', 'SV-LOAN-FEE', '5000'); await openPay('เงินสด'); await keys('123'); click('.rv-pd-key[data-k="clear"]'); await sleep(200); });
  add('pay-cash-empty-enter', {}, async function (sleep) { await line(0, 'excl', 'SV-LOAN-FEE', '5000'); await openPay('เงินสด'); await payOk(500); });
  add('pay-cash-exact', {}, async function (sleep) { await line(0, 'excl', 'SV-LOAN-FEE', '5000'); await pay('เงินสด', '5350'); await sleep(500); });
  add('pay-cash-exact-dark', { theme: 'dark' }, async function (sleep) { await line(0, 'excl', 'SV-LOAN-FEE', '5000'); await pay('เงินสด', '5350'); await sleep(500); });
  add('pay-cash-exact-390', { w: 390, h: 844 }, async function (sleep) { await line(0, 'excl', 'SV-LOAN-FEE', '5000'); await pay('เงินสด', '5350'); await sleep(500); });
  add('pay-cash-over-change', {}, async function (sleep) { await line(0, 'excl', 'SV-LOAN-FEE', '5000'); await pay('เงินสด', '6000'); await sleep(500); });
  add('pay-cash-partial', {}, async function (sleep) { await line(0, 'excl', 'SV-LOAN-FEE', '5000'); await pay('เงินสด', '1000.5'); await sleep(500); });
  add('pay-cash-two-payments', {}, async function (sleep) { await line(0, 'excl', 'SV-LOAN-FEE', '5000'); await pay('เงินสด', '1000'); await pay('เงินสด', '500'); await sleep(500); });
  add('pay-paid-full-refused', {}, async function (sleep) { await line(0, 'excl', 'SV-LOAN-FEE', '5000'); await pay('เงินสด', '5350'); await sleep(2700); click('#rvMethods .rv-method[data-m="เงินสด"]'); await sleep(500); });
  add('pay-remove', {}, async function (sleep) { await line(0, 'excl', 'SV-LOAN-FEE', '5000'); await pay('เงินสด', '1000'); await sleep(2700); click('#rvPayList .rm'); await sleep(500); });
  add('pay-card-open', {}, async function (sleep) { await line(0, 'excl', 'SV-LOAN-FEE', '5000'); await openPay('บัตรเครดิต'); await sleep(300); });
  add('pay-card-open-dark', { theme: 'dark' }, async function (sleep) { await line(0, 'excl', 'SV-LOAN-FEE', '5000'); await openPay('บัตรเครดิต'); await sleep(300); });
  add('pay-card-keys-locked', {}, async function (sleep) { await line(0, 'excl', 'SV-LOAN-FEE', '5000'); await openPay('บัตรเครดิต'); await keys('99'); await sleep(200); });
  add('pay-card-no-card-chosen', {}, async function (sleep) { await line(0, 'excl', 'SV-LOAN-FEE', '5000'); await openPay('บัตรเครดิต'); await payOk(500); });
  add('pay-card-drop-open', {}, async function (sleep) { await line(0, 'excl', 'SV-LOAN-FEE', '5000'); await openPay('บัตรเครดิต'); click('#rvPdAcctTrigger'); await sleep(300); });
  add('pay-card-drop-open-dark', { theme: 'dark' }, async function (sleep) { await line(0, 'excl', 'SV-LOAN-FEE', '5000'); await openPay('บัตรเครดิต'); click('#rvPdAcctTrigger'); await sleep(300); });
  add('pay-card-chosen', {}, async function (sleep) { await line(0, 'excl', 'SV-LOAN-FEE', '5000'); await openPay('บัตรเครดิต'); click('#rvPdAcctTrigger'); await sleep(200); click('#rvPdAcctOpts .rv-pd-opt[data-v="CC-VISA"]'); await sleep(300); });
  add('pay-card-ok', {}, async function (sleep) { await line(0, 'excl', 'SV-LOAN-FEE', '5000'); await pay('บัตรเครดิต', '', 'CC-MC'); await sleep(500); });
  add('pay-transfer-open', {}, async function (sleep) { await line(0, 'excl', 'SV-LOAN-FEE', '5000'); await openPay('เงินโอน'); await sleep(300); });
  add('pay-transfer-drop-open', {}, async function (sleep) { await line(0, 'excl', 'SV-LOAN-FEE', '5000'); await openPay('เงินโอน'); click('#rvPdAcctTrigger'); await sleep(300); });
  add('pay-transfer-drop-open-390', { w: 390, h: 844 }, async function (sleep) { await line(0, 'excl', 'SV-LOAN-FEE', '5000'); await openPay('เงินโอน'); click('#rvPdAcctTrigger'); await sleep(300); });
  add('pay-transfer-search', {}, async function (sleep) { await line(0, 'excl', 'SV-LOAN-FEE', '5000'); await openPay('เงินโอน'); click('#rvPdAcctTrigger'); await sleep(200); typeIn('#rvPdAcctSearch', 'กสิกร'); await sleep(300); });
  add('pay-transfer-search-none', {}, async function (sleep) { await line(0, 'excl', 'SV-LOAN-FEE', '5000'); await openPay('เงินโอน'); click('#rvPdAcctTrigger'); await sleep(200); typeIn('#rvPdAcctSearch', 'zzz'); await sleep(300); });
  add('pay-transfer-chosen', {}, async function (sleep) { await line(0, 'excl', 'SV-LOAN-FEE', '5000'); await openPay('เงินโอน'); click('#rvPdAcctTrigger'); await sleep(200); click('#rvPdAcctOpts .rv-pd-opt[data-v="TRAN-BBL-1112223334"]'); await sleep(300); });
  add('pay-transfer-chosen-dark', { theme: 'dark' }, async function (sleep) { await line(0, 'excl', 'SV-LOAN-FEE', '5000'); await openPay('เงินโอน'); click('#rvPdAcctTrigger'); await sleep(200); click('#rvPdAcctOpts .rv-pd-opt[data-v="TRAN-BBL-1112223334"]'); await sleep(300); });
  add('pay-transfer-ok', {}, async function (sleep) { await line(0, 'excl', 'SV-LOAN-FEE', '5000'); await pay('เงินโอน', '', 'TRAN-SCB-0123456789'); await sleep(500); });
  add('pay-transfer-no-acct', {}, async function (sleep) { await line(0, 'excl', 'SV-LOAN-FEE', '5000'); await openPay('เงินโอน'); await payOk(500); });
  add('pay-transfer-drop-closes-on-dialog-click', {}, async function (sleep) { await line(0, 'excl', 'SV-LOAN-FEE', '5000'); await openPay('เงินโอน'); click('#rvPdAcctTrigger'); await sleep(200); $('#rvPayDlgOverlay .rv-pd-amt-lbl').dispatchEvent(new MouseEvent('click', { bubbles: true })); await sleep(300); });
  add('pay-voucher-single-account', {}, async function (sleep) { await line(0, 'excl', 'SV-LOAN-FEE', '5000'); await openPay('บัตรกำนัล'); await sleep(300); });
  add('pay-voucher-over-due', {}, async function (sleep) { await line(0, 'excl', 'SV-LOAN-FEE', '5000'); await openPay('บัตรกำนัล'); await keys('999999'); await payOk(500); });
  add('pay-voucher-ok', {}, async function (sleep) { await line(0, 'excl', 'SV-LOAN-FEE', '5000'); await pay('บัตรกำนัล', '1000'); await sleep(500); });
  add('pay-mixed-methods', {}, async function (sleep) { await line(0, 'excl', 'SV-LOAN-FEE', '5000'); await pay('เงินสด', '1000'); await sleep(2700); await pay('บัตรกำนัล', '350'); await sleep(2700); await pay('เงินสด', '5000'); await sleep(500); });
  add('pay-close-x', {}, async function (sleep) { await line(0, 'excl', 'SV-LOAN-FEE', '5000'); await openPay('เงินสด'); await keys('12'); click('#rvPayDlgCancel'); await sleep(300); });
  add('pay-close-overlay-click', {}, async function (sleep) { await line(0, 'excl', 'SV-LOAN-FEE', '5000'); await openPay('เงินสด'); $('#rvPayDlgOverlay').click(); await sleep(300); });
  add('pay-dialog-click-stays', {}, async function (sleep) { await line(0, 'excl', 'SV-LOAN-FEE', '5000'); await openPay('เงินสด'); $('.rv-pay-dialog').click(); await sleep(300); });
  add('pay-reopen-clean', {}, async function (sleep) { await line(0, 'excl', 'SV-LOAN-FEE', '5000'); await openPay('เงินสด'); await keys('12'); click('#rvPayDlgCancel'); await sleep(150); await openPay('เงินสด'); await sleep(200); });
  // the real keyboard while the dialog is open
  add('pay-keyboard-digits', {}, async function (sleep) {
    await line(0, 'excl', 'SV-LOAN-FEE', '5000'); await openPay('เงินสด');
    '2500,5'.split('').forEach(function (k) { document.dispatchEvent(new KeyboardEvent('keydown', { key: k, bubbles: true, cancelable: true })); }); await sleep(200);
  });
  add('pay-keyboard-backspace-delete', {}, async function (sleep) {
    await line(0, 'excl', 'SV-LOAN-FEE', '5000'); await openPay('เงินสด');
    '1234'.split('').forEach(function (k) { document.dispatchEvent(new KeyboardEvent('keydown', { key: k, bubbles: true })); });
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Backspace', bubbles: true })); await sleep(100);
    var mid = $('#rvPayDlgAmt').value; document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Delete', bubbles: true })); await sleep(100);
    $('.rv-root').setAttribute('data-mid', mid);
  });
  add('pay-keyboard-enter', {}, async function (sleep) {
    await line(0, 'excl', 'SV-LOAN-FEE', '5000'); await openPay('เงินสด');
    '5350'.split('').forEach(function (k) { document.dispatchEvent(new KeyboardEvent('keydown', { key: k, bubbles: true })); });
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true })); await sleep(500);
  });
  add('pay-keyboard-escape', {}, async function (sleep) { await line(0, 'excl', 'SV-LOAN-FEE', '5000'); await openPay('เงินสด'); document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true })); await sleep(300); });
  add('pay-keyboard-escape-closes-drop-first', {}, async function (sleep) {
    await line(0, 'excl', 'SV-LOAN-FEE', '5000'); await openPay('เงินโอน'); click('#rvPdAcctTrigger'); await sleep(200);
    $('#rvPdAcctSearch').dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true })); await sleep(300);
  });
  add('pay-keyboard-ignored-with-ctrl', {}, async function (sleep) { await line(0, 'excl', 'SV-LOAN-FEE', '5000'); await openPay('เงินสด'); document.dispatchEvent(new KeyboardEvent('keydown', { key: '5', ctrlKey: true, bubbles: true })); await sleep(200); });
  add('pay-keyboard-letters-ignored', {}, async function (sleep) { await line(0, 'excl', 'SV-LOAN-FEE', '5000'); await openPay('เงินสด'); 'ab-'.split('').forEach(function (k) { document.dispatchEvent(new KeyboardEvent('keydown', { key: k, bubbles: true })); }); await sleep(200); });
  add('pay-keyboard-locked-card', {}, async function (sleep) { await line(0, 'excl', 'SV-LOAN-FEE', '5000'); await openPay('บัตรเครดิต'); document.dispatchEvent(new KeyboardEvent('keydown', { key: '9', bubbles: true })); await sleep(200); });
  // the four fallback methods (one account each) and the old one-row-per-account shape
  add('pay-fallback-transfer-single-account', { live: { mock: 'rest-methods' }, mock: 'methods-error' }, async function (sleep) { await line(0, 'excl', 'SV-LOAN-FEE', '5000'); await openPay('เงินโอน'); await sleep(300); });
  add('pay-fallback-card-ok', { live: { mock: 'rest-methods' }, mock: 'methods-error' }, async function (sleep) { await line(0, 'excl', 'SV-LOAN-FEE', '5000'); await pay('บัตรเครดิต', ''); await sleep(500); });
  add('pay-fallback-cheque-over-due', { mock: 'methods-empty' }, async function (sleep) { await line(0, 'excl', 'SV-LOAN-FEE', '5000'); await openPay('เช็ค'); await keys('999999'); await payOk(500); });
  add('pay-old-shape-transfer-two-accounts', { mock: 'methods-old' }, async function (sleep) { await line(0, 'excl', 'SV-LOAN-FEE', '5000'); await openPay('เงินโอน'); click('#rvPdAcctTrigger'); await sleep(300); });
  add('pay-old-shape-card-ok', { mock: 'methods-old' }, async function (sleep) { await line(0, 'excl', 'SV-LOAN-FEE', '5000'); await pay('บัตรเครดิต', ''); await sleep(500); });
  add('pay-usd-due-in-baht', {}, async function (sleep) { pick('#rvCurrency', 'USD'); await sleep(200); await line(0, 'excl', 'SV-LOAN-FEE', '100'); await openPay('เงินสด'); await sleep(200); });

  /* ---- attachments ---- */
  add('att-tab', {}, async function (sleep) { click('.rv-rtab[data-tab="att"]'); await sleep(300); });
  add('att-tab-dark', { theme: 'dark' }, async function (sleep) { click('.rv-rtab[data-tab="att"]'); await sleep(300); });
  add('att-tab-390', { w: 390, h: 844 }, async function (sleep) { click('.rv-rtab[data-tab="att"]'); await sleep(300); });
  add('en-att-tab', { lang: 'en' }, async function (sleep) { click('.rv-rtab[data-tab="att"]'); await sleep(300); });
  add('att-tab-back-to-pay', {}, async function (sleep) { click('.rv-rtab[data-tab="att"]'); await sleep(150); click('.rv-rtab[data-tab="pay"]'); await sleep(300); });
  add('att-add-ok', {}, async function (sleep) { click('.rv-rtab[data-tab="att"]'); await attach(['report.pdf', 'photo.png']); });
  add('att-add-ok-dark', { theme: 'dark' }, async function (sleep) { click('.rv-rtab[data-tab="att"]'); await attach(['report.pdf', 'photo.png']); });
  add('att-add-ok-390', { w: 390, h: 844 }, async function (sleep) { click('.rv-rtab[data-tab="att"]'); await attach(['report.pdf', 'photo.png']); });
  add('att-add-image-type', {}, async function (sleep) { click('.rv-rtab[data-tab="att"]'); await attach(['scan.image']); });
  add('att-add-uppercase-ext', {}, async function (sleep) { click('.rv-rtab[data-tab="att"]'); await attach(['REPORT.PDF']); });
  add('att-add-rejected', {}, async function (sleep) { click('.rv-rtab[data-tab="att"]'); await attach(['a.jpg', 'noext', 'b.docx'], 700); });
  add('att-add-rejected-dark', { theme: 'dark' }, async function (sleep) { click('.rv-rtab[data-tab="att"]'); await attach(['a.jpg', 'b.docx'], 700); });
  add('en-att-add-rejected', { lang: 'en' }, async function (sleep) { click('.rv-rtab[data-tab="att"]'); await attach(['a.jpg', 'b.docx'], 700); });
  add('att-add-mixed', {}, async function (sleep) { click('.rv-rtab[data-tab="att"]'); await attach(['a.pdf', 'b.jpg', 'c.png'], 700); });
  add('att-add-twice', {}, async function (sleep) { click('.rv-rtab[data-tab="att"]'); await attach(['a.pdf']); await sleep(2700); await attach(['b.png']); });
  add('att-select-row', {}, async function (sleep) { click('.rv-rtab[data-tab="att"]'); await attach(['report.pdf', 'photo.png']); click('#rvAttSavedBody .rv-doc-row[data-i="0"]'); await sleep(300); });
  add('att-download', {}, async function (sleep) {
    var dl = []; var orig = HTMLAnchorElement.prototype.click; HTMLAnchorElement.prototype.click = function () { dl.push(this.download + ' ' + (this.getAttribute('href') || '').slice(0, 5)); };
    click('.rv-rtab[data-tab="att"]'); await attach(['report.pdf']); click('#rvAttSavedBody .rv-doc-dl-btn'); await sleep(400);
    HTMLAnchorElement.prototype.click = orig; $('.rv-root').setAttribute('data-downloads', dl.join(' ;; '));
  });
  add('att-delete-confirm-open', {}, async function (sleep) { click('.rv-rtab[data-tab="att"]'); await attach(['report.pdf']); click('#rvAttSavedBody .rv-doc-del'); await sleep(500); });
  add('att-delete-ok', {}, async function (sleep) { click('.rv-rtab[data-tab="att"]'); await attach(['report.pdf', 'photo.png']); click('#rvAttSavedBody .rv-doc-del'); await sleep(400); await swalOk(500); });
  add('att-delete-last-ok', {}, async function (sleep) { click('.rv-rtab[data-tab="att"]'); await attach(['report.pdf']); click('#rvAttSavedBody .rv-doc-del'); await sleep(400); await swalOk(500); });
  add('att-delete-cancel', {}, async function (sleep) { click('.rv-rtab[data-tab="att"]'); await attach(['report.pdf']); click('#rvAttSavedBody .rv-doc-del'); await sleep(400); await swalCancel(500); });
  add('att-blocked-empty-types', { mock: 'attach-empty' }, async function (sleep) { await sleep(800); click('.rv-rtab[data-tab="att"]'); await sleep(200); click('#rvAttBtn'); await sleep(500); });
  add('att-blocked-then-files', { mock: 'attach-empty' }, async function (sleep) { await sleep(800); click('.rv-rtab[data-tab="att"]'); await attach(['a.pdf'], 600); });
  add('att-types-error-fallback', { live: { mock: 'rest-attach' }, mock: 'attach-error' }, async function (sleep) { await sleep(800); click('.rv-rtab[data-tab="att"]'); await attach(['a.pdf', 'b.jpg'], 700); });
  add('att-types-html-fallback', { live: { mock: 'rest-attach' }, mock: 'attach-html' }, async function (sleep) { await sleep(800); click('.rv-rtab[data-tab="att"]'); await attach(['a.pdf'], 600); });
  add('att-save-with-files-echo', { mock: 'create-echo' }, async function (sleep) { await fillValid(); click('.rv-rtab[data-tab="att"]'); await attach(['report.pdf', 'photo.png']); await saveClick(); await swalOk(800); });

  /* ---- save: the checks, the confirmation, the result ---- */
  add('save-no-payer', {}, async function (sleep) { await saveClick(500); });
  add('save-no-payer-dark', { theme: 'dark' }, async function (sleep) { await saveClick(500); });
  add('en-save-no-payer', { lang: 'en' }, async function (sleep) { await saveClick(500); });
  add('save-no-amount', {}, async function (sleep) { await choosePayer('P00012'); await sleep(2700); await saveClick(500); });
  add('save-no-complete-line', {}, async function (sleep) { await choosePayer('P00012'); await addRow(); await setMethod(0, 'excl'); await setCell(0, '.rv-c-value', '5000'); await sleep(2700); await saveClick(500); });
  add('save-line-without-item', {}, async function (sleep) { await choosePayer('P00012'); await line(0, 'excl', '', '5000'); await sleep(2700); await saveClick(500); });
  add('save-no-payment', {}, async function (sleep) { await choosePayer('P00012'); await line(0, 'excl', 'SV-LOAN-FEE', '5000'); await sleep(2700); await saveClick(500); });
  add('save-payment-incomplete', {}, async function (sleep) { await choosePayer('P00012'); await line(0, 'excl', 'SV-LOAN-FEE', '5000'); await pay('เงินสด', '1000'); await sleep(2700); await saveClick(500); });
  add('save-no-branch', {}, async function (sleep) { await choosePayer('P00012'); await line(0, 'excl', 'SV-LOAN-FEE', '5000'); await pay('เงินสด', '5350'); await sleep(2700); await saveClick(500); });
  add('save-confirm-open', {}, async function (sleep) { await fillValid(); await sleep(2700); await saveClick(600); });
  add('save-confirm-open-dark', { theme: 'dark' }, async function (sleep) { await fillValid(); await sleep(2700); await saveClick(600); });
  add('save-confirm-open-390', { w: 390, h: 844 }, async function (sleep) { await fillValid(); await sleep(2700); await saveClick(600); });
  add('en-save-confirm-open', { lang: 'en' }, async function (sleep) { await fillValid(); await sleep(2700); await saveClick(600); });
  add('save-confirm-with-change', {}, async function (sleep) { await choosePayer('P00012'); await branch('SUN'); await line(0, 'excl', 'SV-LOAN-FEE', '5000'); await pay('เงินสด', '6000'); await sleep(2700); await saveClick(600); });
  add('save-confirm-two-payments', {}, async function (sleep) { await choosePayer('P00012'); await branch('SUN'); await line(0, 'excl', 'SV-LOAN-FEE', '5000'); await pay('เงินสด', '1000'); await pay('เงินโอน', '', 'TRAN-SCB-0123456789'); await sleep(2700); await saveClick(600); });
  add('save-cancel', {}, async function (sleep) { await fillValid(); await saveClick(500); await swalCancel(500); });
  add('save-ok', {}, async function (sleep) { await fillValid(); await saveClick(); await swalOk(800); });
  add('save-ok-dark', { theme: 'dark' }, async function (sleep) { await fillValid(); await saveClick(); await swalOk(800); });
  add('save-ok-390', { w: 390, h: 844 }, async function (sleep) { await fillValid(); await saveClick(); await swalOk(800); });
  add('en-save-ok', { lang: 'en' }, async function (sleep) { await fillValid(); await saveClick(); await swalOk(800); });
  add('save-busy', {}, async function (sleep) { await fillValid(); await saveClick(); click('.swal-button--confirm'); await sleep(60); });
  add('save-ok-back-to-list', { roots: [] }, async function (sleep) { trackNav(); await fillValid(); await saveClick(); await swalOk(800); click('#rvSuccessBack'); await sleep(500); });
  add('save-pending', { mock: 'create-pending' }, async function (sleep) { await fillValid(); await saveClick(); await swalOk(800); });
  add('save-pending-dark', { mock: 'create-pending', theme: 'dark' }, async function (sleep) { await fillValid(); await saveClick(); await swalOk(800); });
  add('save-reject', { mock: 'create-reject' }, async function (sleep) { await fillValid(); await saveClick(); await swalOk(800); });
  add('save-reject-dark', { mock: 'create-reject', theme: 'dark' }, async function (sleep) { await fillValid(); await saveClick(); await swalOk(800); });
  add('save-reject-390', { mock: 'create-reject', w: 390, h: 844 }, async function (sleep) { await fillValid(); await saveClick(); await swalOk(800); });
  add('save-reject-close', { mock: 'create-reject' }, async function (sleep) { await fillValid(); await saveClick(); await swalOk(800); click('#rvSuccessBack'); await sleep(400); });
  add('save-details', { mock: 'create-details' }, async function (sleep) { await fillValid(); await saveClick(); await swalOk(800); });
  add('save-text-error', { mock: 'create-text' }, async function (sleep) { await fillValid(); await saveClick(); await swalOk(800); });
  add('save-empty-answer', { mock: 'create-empty' }, async function (sleep) { await fillValid(); await saveClick(); await swalOk(800); });
  add('save-403', { live: false, mock: 'create-403' }, async function (sleep) { await fillValid(); await saveClick(); await swalOk(800); });
  add('save-html-answer', { live: { mock: 'rest-create-html' }, mock: 'create-html' }, async function (sleep) { await fillValid(); await saveClick(); await swalOk(800); });
  add('save-down', { live: { mock: 'rest-create-down' }, mock: 'create-down' }, async function (sleep) { await fillValid(); await saveClick(); await swalOk(800); });
  add('en-save-down', { live: { mock: 'rest-create-down' }, mock: 'create-down', lang: 'en' }, async function (sleep) { await fillValid(); await saveClick(); await swalOk(800); });
  // what the backend received (the rejection prints the payload): the customer, the lines (VAT included → value*100/107), the payments, the header
  add('save-payload-simple', { mock: 'create-echo' }, async function (sleep) { await fillValid(); typeIn('#rvTaxInv', 'TI-001'); typeIn('#rvRemark', 'หมายเหตุ ทดสอบ'); await saveClick(); await swalOk(800); });
  add('save-payload-incl-none-wht', { mock: 'create-echo' }, async function (sleep) {
    await choosePayer('P00100'); await branch('SUN03');
    await line(0, 'incl', 'SV-LOAN-FEE', '1070'); await line(1, 'none', 'SV-STAMP', '350.5'); await line(2, 'excl', 'SV-LEGAL', '2500'); await setCell(2, '.rv-c-wht', '3'); await setCell(2, '.rv-c-desc', 'งวด 2');
    await addRow(); await setMethod(3, 'sel');
    // (the voucher has a single account: the dialog has no account list — it picks it itself); the last cash payment covers what is left (change is allowed)
    await pay('เงินสด', '1000'); await pay('บัตรกำนัล', '500');
    var left = parseFloat(String(document.getElementById('rvTNet').textContent).replace(/,/g, '')) - 1500;
    await pay('เงินสด', String(Math.max(1, Math.ceil(left)))); await saveClick(); await swalOk(800);
  });
  add('save-payload-skips-incomplete-lines', { mock: 'create-echo' }, async function (sleep) {
    await choosePayer('P00012'); await branch('SUN'); await line(0, 'excl', 'SV-LOAN-FEE', '5000'); await addRow(); await setCell(1, '.rv-c-value', '99'); await addRow(); await setMethod(2, 'excl'); await pickItem(2, 'SV-LEGAL');
    // (the second line is whole: 2,500 + VAT = 2,675; the empty one in the middle is the incomplete line that is not sent)
    await pay('เงินสด', '8025'); await saveClick(); await swalOk(800);
  });
  add('save-payload-card-and-transfer', { mock: 'create-echo' }, async function (sleep) {
    await choosePayer('P00012'); await branch('SUN'); await line(0, 'excl', 'SV-LOAN-FEE', '5000'); await pay('เงินโอน', '', 'TRAN-KBANK-2223334445'); await sleep(2700); await saveClick(); await swalOk(800);
  });
  add('save-payload-ref-doc', { mock: 'create-echo' }, async function (sleep) { await fillValid(); await sleep(300); await saveClick(); await swalOk(800); });
  add('save-payload-date', { mock: 'create-echo' }, async function (sleep) { await fillValid(); typeIn('#rvDateText', '2026-09-30'); await sleep(200); await saveClick(); await swalOk(800); });

  /* ---- opened from a lead: ?leadId= · ?activityGroupId= · ?listMaterialId= ---- */
  add('lead-prefill', { q: 'leadId=4' }, async function (sleep) { await sleep(1200); });
  add('lead-prefill-dark', { q: 'leadId=4', theme: 'dark' }, async function (sleep) { await sleep(1200); });
  add('lead-prefill-390', { q: 'leadId=4', w: 390, h: 844 }, async function (sleep) { await sleep(1200); });
  add('en-lead-prefill', { q: 'leadId=4', lang: 'en' }, async function (sleep) { await sleep(1200); });
  add('lead-prefill-erp-code', { q: 'leadId=5' }, async function (sleep) { await sleep(1200); });
  add('lead-prefill-three-items', { q: 'leadId=2' }, async function (sleep) { await sleep(1200); });
  add('lead-prefill-legacy-item', { q: 'leadId=11' }, async function (sleep) { await sleep(1200); });
  add('lead-prefill-no-items', { q: 'leadId=10' }, async function (sleep) { await sleep(1200); });
  add('lead-prefill-one-item', { q: 'leadId=4&listMaterialId=1004400041' }, async function (sleep) { await sleep(1200); });
  add('lead-prefill-two-items', { q: 'leadId=2&listMaterialId=1004400020,1004400022' }, async function (sleep) { await sleep(1200); });
  add('lead-prefill-unknown-item-ids', { q: 'leadId=4&listMaterialId=1,2' }, async function (sleep) { await sleep(1200); });
  add('lead-prefill-group-required', { q: 'leadId=7' }, async function (sleep) { await sleep(1200); });
  add('lead-prefill-group-required-dark', { q: 'leadId=7', theme: 'dark' }, async function (sleep) { await sleep(1200); });
  add('lead-prefill-group-given', { q: 'leadId=7&activityGroupId=101' }, async function (sleep) { await sleep(1200); });
  add('lead-prefill-group-zero-ignored', { q: 'leadId=7&activityGroupId=0' }, async function (sleep) { await sleep(1200); });
  add('lead-prefill-not-found', { q: 'leadId=999' }, async function (sleep) { await sleep(1200); });
  add('lead-prefill-error', { q: 'leadId=4', mock: 'lead-error' }, async function (sleep) { await sleep(1200); });
  add('lead-prefill-down', { live: false, q: 'leadId=4', mock: 'lead-down' }, async function (sleep) { await sleep(1200); });
  add('lead-prefill-prospect-down', { q: 'leadId=4', mock: 'prospect-down' }, async function (sleep) { await sleep(1200); });
  // (a malformed escape such as leadId=%2 is not testable: the Angular router cannot parse such an address at all and shows the fallback
  // page before this component exists — INTEGRATION.md §4.12 — so the odd-but-valid forms are tested)
  add('lead-prefill-odd-id', { q: 'leadId=%E0%B8%81' }, async function (sleep) { await sleep(800); });
  add('lead-prefill-id-with-space', { q: 'leadId=%204' }, async function (sleep) { await sleep(1000); });
  add('lead-prefill-materials-slow', { q: 'leadId=4', mock: 'slow-materials' }, async function (sleep) { await sleep(500); });
  add('lead-prefill-then-save-echo', { q: 'leadId=4', mock: 'create-echo' }, async function (sleep) { await sleep(1200); await branch('SUN'); var v = rowEl(0).querySelector('.rv-c-value').value; await pay('เงินสด', String(Math.ceil(parseFloat(String(document.getElementById('rvTCharge').textContent).replace(/,/g, ''))))); await saveClick(); await swalOk(800); });

  /* ---- the unavailable-master states of the whole page ---- */
  add('masters-all-slow', { mock: 'slow', ready: 'true', settle: 300 }, async function () {});
  add('masters-materials-error-open-picker', { live: { mock: 'rest-materials' }, mock: 'materials-error' }, async function (sleep) { await addRow(); await pickItem(0, '').catch(function () {}); });
}
