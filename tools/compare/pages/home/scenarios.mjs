// Scenarios of the CRM home comparison. Each function is run INSIDE the page under test (Java replica / Angular app) with (sleep, side, win)
// in scope, after lib/scenario-pre.mjs and the page prelude (`pre` in page.mjs: PRODUCTS, rows(), pickProduct(), scrollTable(), setRange(),
// calBtn(), dayCells(), openAssign(), csOpen(), csPick(), openWmAppt(), captureNav() …).
// add(name, opts, fn):  opts = { w, h, theme, lang, settle, wait, roots, ready, reloads, denyRoles } as in the README, and for this page
//   mock: {…} + storage: {…}        the mock-only switches (home.mock.ts MockHomeConfig) — `cfg({…})` below sets both
//   denyRoles: ['CRM_…']            the signed-in user lacks these features (Angular: roles of the session; Java: the page is built without them)
//
// The data (home.mock.ts): 4 products — สินเชื่อบ้าน (workflow, 7 groups, the one the page opens), สินเชื่อรถยนต์ (workflow, 5 groups), ที่ปรึกษาการเงิน
// (NO workflow: the donut is counted from the rows, the column says "ขั้นตอน") and ผลิตภัณฑ์ใหม่ (no lead at all). Only the NEW leads are rows of the
// table (30 for the first product, 20 per scroll step). Appointments / tasks are generated per day: every month has some.
//   `live.hook` (a --live run): the same switches for the fake REST service, which is not told by an address / by the storage of the tab as the mock is
const cfg = (c) => ({ mock: c, storage: { 'ts.mock.home.config': JSON.stringify(c) }, live: { hook: JSON.stringify(c) } });
const NO_ROOTS = ['#__none']; // scenarios that leave the page: only the NAV line counts

export default function (add) {
  /* ============================================================ first paint, themes, viewports, language */
  add('overview', {}, async function () {});
  add('overview-dark', { theme: 'dark' }, async function () {});
  add('overview-1920', { w: 1920, h: 1080 }, async function () {});
  add('overview-1920x1200', { w: 1920, h: 1200 }, async function () {});
  add('overview-1700', { w: 1700, h: 900 }, async function () {});
  add('overview-1500', { w: 1500, h: 860 }, async function () {});
  add('overview-1366', { w: 1366, h: 768 }, async function () {});
  add('overview-1280x600', { w: 1280, h: 600 }, async function () {});
  add('overview-1100', { w: 1100, h: 800 }, async function () {});
  add('overview-1024', { w: 1024, h: 768 }, async function () {});
  add('overview-768', { w: 768, h: 1024 }, async function () {});
  add('overview-600', { w: 600, h: 900 }, async function () {});
  add('overview-390', { w: 390, h: 844 }, async function () {});
  add('overview-dark-1920', { theme: 'dark', w: 1920, h: 1080 }, async function () {});
  add('overview-dark-1024', { theme: 'dark', w: 1024, h: 768 }, async function () {});
  add('overview-dark-768', { theme: 'dark', w: 768, h: 1024 }, async function () {});
  add('overview-dark-390', { theme: 'dark', w: 390, h: 844 }, async function () {});
  add('en-overview', { lang: 'en' }, async function () {});
  add('en-overview-dark', { lang: 'en', theme: 'dark' }, async function () {});
  add('en-overview-390', { lang: 'en', w: 390, h: 844 }, async function () {});
  add('en-overview-1024', { lang: 'en', w: 1024, h: 768 }, async function () {});

  /* ---- the A A A font buttons: Java sets --fs-adj, the Angular shell --ts-fs-adj ---- */
  add('fs-plus', {}, async function () { fontAdj('2px'); await sleep(800); });
  add('fs-minus', {}, async function () { fontAdj('-2px'); await sleep(800); });
  add('fs-plus-dark', { theme: 'dark' }, async function () { fontAdj('2px'); await sleep(800); });
  add('fs-minus-dark', { theme: 'dark' }, async function () { fontAdj('-2px'); await sleep(800); });
  add('fs-plus-390', { w: 390, h: 844 }, async function () { fontAdj('2px'); await sleep(800); });
  add('fs-minus-1024', { w: 1024, h: 768 }, async function () { fontAdj('-2px'); await sleep(800); });
  add('fs-plus-1920', { w: 1920, h: 1080 }, async function () { fontAdj('2px'); await sleep(800); });
  add('fs-plus-assign', {}, async function () { fontAdj('2px'); await sleep(300); await openAssign(0); });
  add('fs-plus-product-open', {}, async function () { fontAdj('2px'); await sleep(300); click('#tsProductBtn'); await sleep(300); });
  add('fs-plus-wm', {}, async function () { fontAdj('2px'); await sleep(300); await openWmAppt(); });
  add('fs-plus-donut-more', {}, async function () {
    fontAdj('2px');
    var st = document.createElement('style');
    st.id = '__force';
    st.textContent = '.ts-legend-more .ts-more-tip{display:block !important}';
    document.head.appendChild(st);
    await sleep(500);
  });

  /* ============================================================ product dropdown */
  add('product-open', {}, async function () { click('#tsProductBtn'); await sleep(300); });
  add('product-open-dark', { theme: 'dark' }, async function () { click('#tsProductBtn'); await sleep(300); });
  add('product-open-390', { w: 390, h: 844 }, async function () { click('#tsProductBtn'); await sleep(300); });
  add('en-product-open', { lang: 'en' }, async function () { click('#tsProductBtn'); await sleep(300); });
  add('product-close-outside', {}, async function () { click('#tsProductBtn'); await sleep(200); click('.ts-card-title'); await sleep(300); });
  add('product-toggle-twice', {}, async function () { click('#tsProductBtn'); await sleep(150); click('#tsProductBtn'); await sleep(300); });
  add('product-car', {}, async function () { await pickProduct(PRODUCTS.car); });
  add('product-car-dark', { theme: 'dark' }, async function () { await pickProduct(PRODUCTS.car); });
  add('product-car-390', { w: 390, h: 844 }, async function () { await pickProduct(PRODUCTS.car); });
  add('product-adviser', {}, async function () { await pickProduct(PRODUCTS.adviser); });
  add('product-adviser-dark', { theme: 'dark' }, async function () { await pickProduct(PRODUCTS.adviser); });
  add('product-adviser-390', { w: 390, h: 844 }, async function () { await pickProduct(PRODUCTS.adviser); });
  add('product-adviser-1024', { w: 1024, h: 768 }, async function () { await pickProduct(PRODUCTS.adviser); });
  add('en-product-adviser', { lang: 'en' }, async function () { await pickProduct(PRODUCTS.adviser); });
  add('product-adviser-end', {}, async function () { await pickProduct(PRODUCTS.adviser); await scrollTable(); await scrollTable(); });
  add('product-empty', {}, async function () { await pickProduct(PRODUCTS.empty); });
  add('product-empty-dark', { theme: 'dark' }, async function () { await pickProduct(PRODUCTS.empty); });
  add('product-empty-390', { w: 390, h: 844 }, async function () { await pickProduct(PRODUCTS.empty); });
  add('en-product-empty', { lang: 'en' }, async function () { await pickProduct(PRODUCTS.empty); });
  add('product-house-again', {}, async function () { await pickProduct(PRODUCTS.car); await pickProduct(PRODUCTS.house); });
  add('product-car-then-adviser', {}, async function () { await pickProduct(PRODUCTS.car); await pickProduct(PRODUCTS.adviser); });
  add('product-quick-switch', {}, async function () {
    // the page cancels the requests of the choice it replaced (AbortController) and ignores their answers
    click('#tsProductBtn'); click('#tsProdDd .ts-prod-dd-item[data-mt="' + PRODUCTS.car + '"]');
    await sleep(40);
    click('#tsProductBtn'); click('#tsProdDd .ts-prod-dd-item[data-mt="' + PRODUCTS.adviser + '"]');
    await sleep(2200);
  });
  // the choice is remembered (TS_PREF): the page opens on it after a reload, the label before the list of products has arrived
  add('product-remember-car', {}, async function () { await pickProduct(PRODUCTS.car); return '__RELOAD__'; });
  add('product-remember-adviser', {}, async function () { await pickProduct(PRODUCTS.adviser); return '__RELOAD__'; });
  add('product-remember-empty', { theme: 'dark' }, async function () { await pickProduct(PRODUCTS.empty); return '__RELOAD__'; });
  // a remembered product that no longer exists: the label shows its name until the list arrives, then the first product of the list
  add('product-remember-gone', {}, async function () {
    localStorage.setItem('ts_dash_selected_mt', '999'); localStorage.setItem('ts_dash_selected_wf', '0'); localStorage.setItem('ts_dash_selected_name', 'ผลิตภัณฑ์ที่เลิกขายแล้ว');
    return '__RELOAD__';
  });
  add('no-products', cfg({ noProducts: true }), async function () {});
  add('no-products-dark', { ...cfg({ noProducts: true }), theme: 'dark' }, async function () {});
  add('fail-products', cfg({ failProducts: true }), async function () {});

  /* ============================================================ the donut and the legend */
  // a point on the ring of the donut (canvas 110×110, radius 40), angle in radians from the top, clockwise
  var hover = 'var ringAt = function (a, r) { var c = $("#tsDonutCanvas"); var b = c.getBoundingClientRect(); var x = b.left + 55 * (b.width / 110) + (r || 40) * Math.sin(a); var y = b.top + 55 * (b.height / 110) - (r || 40) * Math.cos(a); c.dispatchEvent(new MouseEvent("mousemove", { clientX: x, clientY: y, bubbles: true })); };';
  var donut = (angle, r) => hover + ' ringAt(' + angle + ', ' + (r ?? 40) + '); await sleep(300);';
  add('donut-hover-first', {}, donut(0.05));
  add('donut-hover-second', {}, donut(0.45));
  add('donut-hover-mid', {}, donut(3.14));
  add('donut-hover-last', {}, donut(6.2));
  add('donut-hover-first-dark', { theme: 'dark' }, donut(0.05));
  add('donut-hover-center', {}, hover + ' ringAt(0.05); await sleep(150); ringAt(0.05, 10); await sleep(300);');
  add('donut-hover-outside', {}, hover + ' ringAt(0.05); await sleep(150); ringAt(0.05, 54); await sleep(300);');
  add('donut-hover-leave', {}, hover + ' ringAt(1.2); await sleep(150); $("#tsDonutCanvas").dispatchEvent(new MouseEvent("mouseleave", { bubbles: true })); await sleep(300);');
  add('donut-hover-390', { w: 390, h: 844 }, donut(1.3));
  add('donut-hover-adviser', {}, 'await pickProduct(PRODUCTS.adviser); ' + donut(2.0));
  add('donut-hover-car', {}, 'await pickProduct(PRODUCTS.car); ' + donut(4.0));
  add('donut-hover-en', { lang: 'en' }, donut(0.7));
  // the tooltip of "+ อีก N ขั้นตอน" opens on :hover, which a script cannot play: shown by a rule that is the same on both sides
  var force = 'var st = document.createElement("style"); st.id = "__force"; st.textContent = ".ts-legend-more .ts-more-tip{display:block !important}"; document.head.appendChild(st); await sleep(400);';
  add('legend-more-tip', {}, force);
  add('legend-more-tip-dark', { theme: 'dark' }, force);
  add('legend-more-tip-390', { w: 390, h: 844 }, force);
  add('legend-more-tip-car', {}, 'await pickProduct(PRODUCTS.car); ' + force);
  add('en-legend-more-tip', { lang: 'en' }, force);

  /* ============================================================ the opportunity table: infinite scroll */
  add('scroll-top-nothing', {}, async function () { await scrollTable(0, 600); });
  add('scroll-end-1', {}, async function () { await scrollTable(); });
  add('scroll-end-2', {}, async function () { await scrollTable(); await scrollTable(); });
  add('scroll-end-all', {}, async function () { for (var i = 0; i < 5; i++) await scrollTable(undefined, 700); });
  add('scroll-end-all-dark', { theme: 'dark' }, async function () { for (var i = 0; i < 5; i++) await scrollTable(undefined, 700); });
  add('scroll-end-all-390', { w: 390, h: 844 }, async function () { for (var i = 0; i < 5; i++) await scrollTable(undefined, 700); });
  add('scroll-end-all-1024', { w: 1024, h: 768 }, async function () { for (var i = 0; i < 5; i++) await scrollTable(undefined, 700); });
  add('en-scroll-end-all', { lang: 'en' }, async function () { for (var i = 0; i < 5; i++) await scrollTable(undefined, 700); });
  add('scroll-half', {}, async function () { await scrollTable(); await scrollTable(150, 500); });
  add('scroll-car-end', {}, async function () { await pickProduct(PRODUCTS.car); for (var i = 0; i < 4; i++) await scrollTable(undefined, 700); });
  add('scroll-tall-screen', { w: 1920, h: 1400 }, async function () { await sleep(800); });
  add('scroll-fill-short', { w: 1280, h: 1700 }, async function () { await sleep(1500); });

  /* ---- a row opens the lead ---- */
  add('row-click-first', { roots: NO_ROOTS }, async function (sleep, side) { captureNav(side); window.__extra = async function () { return ['NAV ' + window.__navs.join(' | ')]; }; click(rows()[0]); await sleep(900); });
  add('row-click-second', { roots: NO_ROOTS }, async function (sleep, side) { captureNav(side); window.__extra = async function () { return ['NAV ' + window.__navs.join(' | ')]; }; click(rows()[1]); await sleep(900); });
  add('row-click-last', { roots: NO_ROOTS }, async function (sleep, side) { await scrollTable(); captureNav(side); window.__extra = async function () { return ['NAV ' + window.__navs.join(' | ')]; }; var r = rows(); click(r[r.length - 1]); await sleep(900); });
  add('row-click-adviser', { roots: NO_ROOTS }, async function (sleep, side) { await pickProduct(PRODUCTS.adviser); captureNav(side); window.__extra = async function () { return ['NAV ' + window.__navs.join(' | ')]; }; click(rows()[0]); await sleep(900); });
  add('row-click-name', { roots: NO_ROOTS }, async function (sleep, side) { captureNav(side); window.__extra = async function () { return ['NAV ' + window.__navs.join(' | ')]; }; click($('#tsOppsBody .ts-name-wrap span')); await sleep(900); });
  // the "assign" button of a row is not a click on the row
  add('row-click-assign-button', {}, async function (sleep, side) { captureNav(side); click($('#tsOppsBody .ts-assign-btn')); await sleep(900); });

  /* ---- the date range ---- */
  add('range-from-only', {}, async function () { await setRange('2026-04-01', null); });
  add('range-to-only', {}, async function () { await setRange(null, '2026-06-30'); });
  add('range-narrow', {}, async function () { await setRange('2026-03-01', '2026-06-30'); });
  add('range-narrow-dark', { theme: 'dark' }, async function () { await setRange('2026-03-01', '2026-06-30'); });
  add('range-reversed', {}, async function () { await setRange('2026-09-01', null); await setRange(null, '2026-02-01'); });
  add('range-cleared', {}, async function () { await setRange('', ''); });
  add('range-cleared-from', {}, async function () { await setRange('', null); });
  add('range-none', {}, async function () { await setRange('2020-01-01', '2020-01-31'); });
  add('range-none-dark', { theme: 'dark' }, async function () { await setRange('2020-01-01', '2020-01-31'); });
  add('range-none-390', { w: 390, h: 844 }, async function () { await setRange('2020-01-01', '2020-01-31'); });
  add('en-range-none', { lang: 'en' }, async function () { await setRange('2020-01-01', '2020-01-31'); });
  add('range-car', {}, async function () { await pickProduct(PRODUCTS.car); await setRange('2026-03-01', '2026-08-31'); });
  add('range-then-scroll', {}, async function () { await setRange('2026-02-01', '2026-09-30'); await scrollTable(); });
  add('range-quick-changes', {}, async function () {
    // every change cancels the requests of the previous one
    var f = $('#tsDateFrom'); f.value = '2026-01-01'; f.dispatchEvent(new Event('change', { bubbles: true })); await sleep(30);
    f.value = '2026-05-01'; f.dispatchEvent(new Event('change', { bubbles: true })); await sleep(30);
    f.value = '2026-07-01'; f.dispatchEvent(new Event('change', { bubbles: true }));
    await sleep(2200);
  });
  add('range-fs-plus-dark', { theme: 'dark' }, async function () { fontAdj('2px'); await sleep(300); await setRange('2026-03-01', '2026-06-30'); });

  /* ---- loading and error states ---- */
  var slow = { ...cfg({ delayMs: 6000 }), ready: "document.querySelector('#tsOppsBody .ts-opps-skel-row')", readyTimeout: 20000 };
  add('loading-skeleton', slow, async function () {});
  add('loading-skeleton-dark', { ...slow, theme: 'dark' }, async function () {});
  add('loading-skeleton-390', { ...slow, w: 390, h: 844 }, async function () {});
  add('en-loading-skeleton', { ...slow, lang: 'en' }, async function () {});
  add('loading-first-paint', { ...cfg({ delayMs: 6000 }), ready: "document.querySelector('.ts-root #tsStatsRow .ts-stat')", settle: 300, wait: 200 }, async function () {});
  add('fail-leads', cfg({ failLeads: true }), async function () {});
  add('fail-leads-dark', { ...cfg({ failLeads: true }), theme: 'dark' }, async function () {});
  add('fail-leads-390', { ...cfg({ failLeads: true }), w: 390, h: 844 }, async function () {});
  add('en-fail-leads', { ...cfg({ failLeads: true }), lang: 'en' }, async function () {});
  add('fail-leads-scroll', cfg({ failLeads: true }), async function () { await scrollTable(); await sleep(1500); });
  add('fail-leads-once', cfg({ failLeadsOnce: true }), async function () {});
  add('fail-leads-once-scroll', cfg({ failLeadsOnce: true }), async function () { await scrollTable(); await sleep(2000); });
  add('fail-summary', cfg({ failSummary: true }), async function () {});
  add('fail-summary-dark', { ...cfg({ failSummary: true }), theme: 'dark' }, async function () {});
  add('fail-schedules', cfg({ failSchedules: true }), async function () {});
  add('fail-schedules-dark', { ...cfg({ failSchedules: true }), theme: 'dark' }, async function () {});
  add('fail-all', cfg({ failSummary: true, failSchedules: true, failLeads: true }), async function () {});
  add('fail-all-dark', { ...cfg({ failSummary: true, failSchedules: true, failLeads: true }), theme: 'dark' }, async function () {});
  // NEW leads only at the end of the list: the table loads page after page, gives up after 5 empty pages and offers "load more"
  var sparse = { ...cfg({ noProducts: true, sparseNew: true }), ready: "document.querySelector('#tsOppsBody .ts-opps-more-btn') || document.querySelector('#tsOppsBody tr[data-leadid]')", readyTimeout: 25000 };
  add('sparse-new-button', sparse, async function () {});
  add('sparse-new-button-dark', { ...sparse, theme: 'dark' }, async function () {});
  add('sparse-new-button-390', { ...sparse, w: 390, h: 844 }, async function () {});
  add('en-sparse-new-button', { ...sparse, lang: 'en' }, async function () {});
  add('sparse-new-more', sparse, async function () { click('#tsOppsBody .ts-opps-more-btn'); await sleep(4000); });
  add('sparse-new-more-dark', { ...sparse, theme: 'dark' }, async function () { click('#tsOppsBody .ts-opps-more-btn'); await sleep(4000); });
  add('no-products-all-scroll', cfg({ noProducts: true }), async function () { for (var i = 0; i < 3; i++) await scrollTable(undefined, 800); });
  add('no-products-donut-hover', cfg({ noProducts: true }), donut(1.0));

  /* ============================================================ the assign-work dialog */
  add('assign-open', {}, async function () { await openAssign(0); });
  add('assign-open-dark', { theme: 'dark' }, async function () { await openAssign(0); });
  add('assign-open-390', { w: 390, h: 844 }, async function () { await openAssign(0); });
  add('assign-open-390x500', { w: 390, h: 500 }, async function () { await openAssign(0); });
  add('assign-open-1920', { w: 1920, h: 1080 }, async function () { await openAssign(0); });
  add('en-assign-open', { lang: 'en' }, async function () { await openAssign(0); });
  add('en-assign-open-dark', { lang: 'en', theme: 'dark' }, async function () { await openAssign(0); });
  add('assign-open-second', {}, async function () { await openAssign(1); });
  add('assign-open-third-dark', { theme: 'dark' }, async function () { await openAssign(2); });
  add('assign-open-team-known', {}, async function () {
    var n = $$('#tsOppsBody .ts-assign-btn').length;
    for (var i = 0; i < n; i++) {
      await openAssign(i);
      if ($('#tsAsgTeam').value) break;
      click('#tsAssignClose'); await sleep(200);
    }
  });
  add('assign-team-menu', {}, async function () { await openAssign(0); await csOpen('tsAsgTeam'); });
  add('assign-team-menu-dark', { theme: 'dark' }, async function () { await openAssign(0); await csOpen('tsAsgTeam'); });
  add('assign-owner-menu', {}, async function () { await openAssign(0); await csOpen('tsAsgOwner'); });
  add('assign-owner-menu-dark', { theme: 'dark' }, async function () { await openAssign(0); await csOpen('tsAsgOwner'); });
  add('assign-sale-menu', {}, async function () { await openAssign(0); await csOpen('tsAsgSale'); });
  add('assign-owner-menu-390', { w: 390, h: 844 }, async function () { await openAssign(0); await csOpen('tsAsgOwner'); });
  add('en-assign-owner-menu', { lang: 'en' }, async function () { await openAssign(0); await csOpen('tsAsgOwner'); });
  add('assign-owner-search', {}, async function () { await openAssign(0); var w = await csOpen('tsAsgOwner'); typeIn(w.querySelector('.ts-cs-search'), 'สม'); await sleep(300); });
  add('assign-owner-search-dark', { theme: 'dark' }, async function () { await openAssign(0); var w = await csOpen('tsAsgOwner'); typeIn(w.querySelector('.ts-cs-search'), 'สม'); await sleep(300); });
  add('assign-owner-search-none', {}, async function () { await openAssign(0); var w = await csOpen('tsAsgOwner'); typeIn(w.querySelector('.ts-cs-search'), 'zzzz'); await sleep(300); });
  add('assign-owner-search-none-dark', { theme: 'dark' }, async function () { await openAssign(0); var w = await csOpen('tsAsgOwner'); typeIn(w.querySelector('.ts-cs-search'), 'zzzz'); await sleep(300); });
  add('en-assign-owner-search-none', { lang: 'en' }, async function () { await openAssign(0); var w = await csOpen('tsAsgOwner'); typeIn(w.querySelector('.ts-cs-search'), 'zzzz'); await sleep(300); });
  add('assign-menu-switch', {}, async function () { await openAssign(0); await csOpen('tsAsgTeam'); await csOpen('tsAsgOwner'); });
  add('assign-menu-close-outside', {}, async function () { await openAssign(0); await csOpen('tsAsgOwner'); click('.ts-asg-title'); await sleep(300); });
  add('assign-menu-toggle', {}, async function () { await openAssign(0); await csOpen('tsAsgOwner'); await csOpen('tsAsgOwner'); });
  add('assign-team-pick', {}, async function () { await openAssign(0); await csPick('tsAsgTeam', '1004400001', 1200); });
  add('assign-team-pick-b', {}, async function () { await openAssign(0); await csPick('tsAsgTeam', '1004400002', 1200); });
  add('assign-team-pick-owner-menu', {}, async function () { await openAssign(0); await csPick('tsAsgTeam', '1004400001', 1200); await csOpen('tsAsgOwner'); });
  add('assign-team-pick-sale-menu-dark', { theme: 'dark' }, async function () { await openAssign(0); await csPick('tsAsgTeam', '1004400002', 1200); await csOpen('tsAsgSale'); });
  add('assign-owner-pick', {}, async function () { await openAssign(0); await csPick('tsAsgOwner', '1002'); });
  add('assign-all-picked', {}, async function () { await openAssign(0); await csPick('tsAsgTeam', '1004400001', 1200); await csPick('tsAsgSale', '2002'); await csPick('tsAsgOwner', '1002'); });
  add('assign-all-picked-dark', { theme: 'dark' }, async function () { await openAssign(0); await csPick('tsAsgTeam', '1004400001', 1200); await csPick('tsAsgSale', '2002'); await csPick('tsAsgOwner', '1002'); });
  // validation: no owner
  add('assign-empty-submit', {}, async function () { await openAssign(0); click('#tsAssignSubmit'); await sleep(700); });
  add('assign-empty-submit-dark', { theme: 'dark' }, async function () { await openAssign(0); click('#tsAssignSubmit'); await sleep(700); });
  add('assign-empty-submit-390', { w: 390, h: 844 }, async function () { await openAssign(0); click('#tsAssignSubmit'); await sleep(700); });
  add('en-assign-empty-submit', { lang: 'en' }, async function () { await openAssign(0); click('#tsAssignSubmit'); await sleep(700); });
  add('assign-empty-submit-team-only', {}, async function () { await openAssign(0); await csPick('tsAsgTeam', '1004400001', 1200); click('#tsAssignSubmit'); await sleep(700); });
  // success: the row changes in place (no reload), toast "มอบหมายงานสำเร็จ"
  add('assign-success', {}, async function () { await openAssign(0); await csPick('tsAsgOwner', '1002'); click('#tsAssignSubmit'); await sleep(1100); });
  add('assign-success-dark', { theme: 'dark' }, async function () { await openAssign(0); await csPick('tsAsgOwner', '1002'); click('#tsAssignSubmit'); await sleep(1100); });
  add('assign-success-390', { w: 390, h: 844 }, async function () { await openAssign(0); await csPick('tsAsgOwner', '1002'); click('#tsAssignSubmit'); await sleep(1100); });
  add('en-assign-success', { lang: 'en' }, async function () { await openAssign(0); await csPick('tsAsgOwner', '1002'); click('#tsAssignSubmit'); await sleep(1100); });
  add('assign-success-after-toast', {}, async function () { await openAssign(0); await csPick('tsAsgOwner', '1002'); click('#tsAssignSubmit'); await sleep(3800); });
  add('assign-success-team-sale', {}, async function () { await openAssign(0); await csPick('tsAsgTeam', '1004400002', 1200); await csPick('tsAsgSale', '2003'); await csPick('tsAsgOwner', '1003'); click('#tsAssignSubmit'); await sleep(1100); });
  add('assign-success-second-row', {}, async function () { await openAssign(1); await csPickAny('tsAsgOwner'); click('#tsAssignSubmit'); await sleep(1100); });
  add('assign-success-then-reopen', {}, async function () { await openAssign(0); await csPick('tsAsgOwner', '1002'); click('#tsAssignSubmit'); await sleep(1100); await openAssign(0); });
  add('assign-success-then-reload', {}, async function () { await openAssign(0); await csPick('tsAsgOwner', '1002'); click('#tsAssignSubmit'); await sleep(1300); return '__RELOAD__'; });
  add('assign-then-scroll', {}, async function () { await openAssign(0); await csPick('tsAsgOwner', '1002'); click('#tsAssignSubmit'); await sleep(1100); await scrollTable(); });
  add('assign-after-scroll', {}, async function () { await scrollTable(); await sleep(300); await openAssign(lastAssign()); });
  add('assign-after-scroll-success', {}, async function () { await scrollTable(); await sleep(300); await openAssign(lastAssign()); await csPickAny('tsAsgOwner'); click('#tsAssignSubmit'); await sleep(1100); });
  // failure: the backend refuses (400 with the message of the service) / answers 500 without a message
  add('assign-fail-refused', {}, async function () { await openAssign(0); await csPick('tsAsgOwner', '1008'); click('#tsAssignSubmit'); await sleep(1100); });
  add('assign-fail-refused-dark', { theme: 'dark' }, async function () { await openAssign(0); await csPick('tsAsgOwner', '1008'); click('#tsAssignSubmit'); await sleep(1100); });
  add('assign-fail-refused-390', { w: 390, h: 844 }, async function () { await openAssign(0); await csPick('tsAsgOwner', '1008'); click('#tsAssignSubmit'); await sleep(1100); });
  add('en-assign-fail-refused', { lang: 'en' }, async function () { await openAssign(0); await csPick('tsAsgOwner', '1008'); click('#tsAssignSubmit'); await sleep(1100); });
  add('assign-fail-500', cfg({ assign500: true }), async function () { await openAssign(0); await csPick('tsAsgOwner', '1002'); click('#tsAssignSubmit'); await sleep(1100); });
  add('assign-fail-500-dark', { ...cfg({ assign500: true }), theme: 'dark' }, async function () { await openAssign(0); await csPick('tsAsgOwner', '1002'); click('#tsAssignSubmit'); await sleep(1100); });
  add('assign-fail-then-ok', {}, async function () { await openAssign(0); await csPick('tsAsgOwner', '1008'); click('#tsAssignSubmit'); await sleep(3200); await csPick('tsAsgOwner', '1002'); click('#tsAssignSubmit'); await sleep(1100); });
  add('assign-saving', { ...cfg({ delayMs: 2500 }), settle: 600, ready: "document.querySelector('#tsOppsBody tr[data-leadid]')", readyTimeout: 25000 }, async function () { await openAssign(0); await sleep(3200); await csPickAny('tsAsgOwner'); click('#tsAssignSubmit'); await sleep(400); });
  // the employee list is empty: the owners come from the sale persons
  add('assign-employees-empty', cfg({ employeesEmpty: true }), async function () { await openAssign(0); await csOpen('tsAsgOwner'); });
  add('assign-employees-empty-pick', cfg({ employeesEmpty: true }), async function () { await openAssign(0); await csPick('tsAsgOwner', '1002'); click('#tsAssignSubmit'); await sleep(1100); });
  // closing
  add('assign-close-x', {}, async function () { await openAssign(0); click('#tsAssignClose'); await sleep(400); });
  add('assign-close-overlay', {}, async function () { await openAssign(0); click('#tsAssignOverlay'); await sleep(400); });
  add('assign-click-inside-keeps', {}, async function () { await openAssign(0); click('.ts-asg-modal'); await sleep(400); });
  add('assign-escape-no-effect', {}, async function () { await openAssign(0); key('Escape'); key('Escape', $('#tsAssignOverlay')); await sleep(400); });
  add('assign-close-reopen-other', {}, async function () { await openAssign(0); click('#tsAssignClose'); await sleep(300); await openAssign(1); });
  add('assign-picked-then-close-reopen', {}, async function () { await openAssign(0); await csPick('tsAsgOwner', '1003'); click('#tsAssignClose'); await sleep(300); await openAssign(0); });
  add('assign-resize', { w: 1280, h: 800 }, async function () { await openAssign(0); window.innerWidth; window.dispatchEvent(new Event('resize')); await sleep(400); });
  add('assign-no-lead-view', { denyRoles: ['CRM_Lead_View'] }, async function () {});

  /* ============================================================ the calendar */
  add('cal-prev', {}, async function () { click(calBtn(0)); await sleep(1500); });
  add('cal-prev-dark', { theme: 'dark' }, async function () { click(calBtn(0)); await sleep(1500); });
  add('cal-prev-3', {}, async function () { for (var i = 0; i < 3; i++) { click(calBtn(0)); await sleep(500); } await sleep(1200); });
  add('cal-prev-12', {}, async function () { for (var i = 0; i < 12; i++) { click(calBtn(0)); await sleep(120); } await sleep(1800); });
  add('cal-next', {}, async function () { click(calBtn(1)); await sleep(1500); });
  add('cal-next-dark', { theme: 'dark' }, async function () { click(calBtn(1)); await sleep(1500); });
  add('cal-next-3', {}, async function () { for (var i = 0; i < 3; i++) { click(calBtn(1)); await sleep(500); } await sleep(1200); });
  add('cal-next-390', { w: 390, h: 844 }, async function () { click(calBtn(1)); await sleep(1500); });
  add('cal-prev-1024', { w: 1024, h: 768 }, async function () { click(calBtn(0)); await sleep(1500); });
  add('en-cal-next', { lang: 'en' }, async function () { click(calBtn(1)); await sleep(1500); });
  add('en-cal-prev-dark', { lang: 'en', theme: 'dark' }, async function () { click(calBtn(0)); await sleep(1500); });
  add('cal-next-then-prev', {}, async function () { click(calBtn(1)); await sleep(700); click(calBtn(0)); await sleep(1500); });
  add('cal-quick-clicks', {}, async function () { for (var i = 0; i < 4; i++) { click(calBtn(0)); await sleep(30); } await sleep(2000); });
  add('cal-fs-plus', {}, async function () { fontAdj('2px'); click(calBtn(0)); await sleep(1500); });
  // a day
  add('cal-day-marked', {}, async function () { click($$('#tsCalBody .ts-cal-cell.c-hi, #tsCalBody .ts-cal-cell.c-past')[0]); await sleep(1500); });
  add('cal-day-marked-dark', { theme: 'dark' }, async function () { click($$('#tsCalBody .ts-cal-cell.c-hi, #tsCalBody .ts-cal-cell.c-past')[0]); await sleep(1500); });
  add('cal-day-marked-390', { w: 390, h: 844 }, async function () { click($$('#tsCalBody .ts-cal-cell.c-hi, #tsCalBody .ts-cal-cell.c-past')[0]); await sleep(1500); });
  add('cal-day-marked-last', {}, async function () { var m = $$('#tsCalBody .ts-cal-cell.c-hi, #tsCalBody .ts-cal-cell.c-past'); click(m[m.length - 1]); await sleep(1500); });
  add('cal-day-plain', {}, async function () { click($$('#tsCalBody .ts-cal-cell:not(.c-out):not(.c-hi):not(.c-past):not(.c-today)')[0]); await sleep(1500); });
  add('cal-day-plain-dark', { theme: 'dark' }, async function () { click($$('#tsCalBody .ts-cal-cell:not(.c-out):not(.c-hi):not(.c-past):not(.c-today)')[0]); await sleep(1500); });
  add('cal-day-today', {}, async function () { click($('#tsCalBody .ts-cal-cell.c-today')); await sleep(1500); });
  add('cal-day-out-ignored', {}, async function () { click($('#tsCalBody .ts-cal-cell.c-out')); await sleep(800); });
  add('cal-day-then-day', {}, async function () { var m = $$('#tsCalBody .ts-cal-cell.c-hi, #tsCalBody .ts-cal-cell.c-past'); click(m[0]); await sleep(1000); click(m[1] || m[0]); await sleep(1300); });
  add('cal-day-then-month', {}, async function () { click($$('#tsCalBody .ts-cal-cell.c-hi, #tsCalBody .ts-cal-cell.c-past')[0]); await sleep(1000); click(calBtn(0)); await sleep(1600); });
  add('cal-day-then-range', {}, async function () { click($$('#tsCalBody .ts-cal-cell.c-hi, #tsCalBody .ts-cal-cell.c-past')[0]); await sleep(1000); await setRange('2026-03-01', '2026-06-30'); });
  add('cal-day-then-product', {}, async function () { click($$('#tsCalBody .ts-cal-cell.c-hi, #tsCalBody .ts-cal-cell.c-past')[0]); await sleep(1000); await pickProduct(PRODUCTS.car); await sleep(800); });
  add('cal-day-prev-month-marked', {}, async function () { click(calBtn(0)); await sleep(1500); click($$('#tsCalBody .ts-cal-cell.c-hi, #tsCalBody .ts-cal-cell.c-past')[2]); await sleep(1500); });
  add('cal-product-car', {}, async function () { await pickProduct(PRODUCTS.car); await sleep(800); });
  add('cal-product-adviser-dark', { theme: 'dark' }, async function () { await pickProduct(PRODUCTS.adviser); await sleep(800); });

  /* ---- the appointment carousel and the task list ---- */
  add('combo-next', {}, async function () { click('#tsComboNext'); await sleep(300); });
  add('combo-next-dark', { theme: 'dark' }, async function () { click('#tsComboNext'); await sleep(300); });
  add('combo-next-390', { w: 390, h: 844 }, async function () { click('#tsComboNext'); await sleep(300); });
  add('combo-prev', {}, async function () { click('#tsComboPrev'); await sleep(300); });
  add('combo-prev-wrap-dark', { theme: 'dark' }, async function () { click('#tsComboPrev'); await sleep(300); click('#tsComboPrev'); await sleep(300); });
  add('combo-next-all-round', {}, async function () { var n = $$('#tsComboDots span').length; for (var i = 0; i < n; i++) { click('#tsComboNext'); await sleep(120); } await sleep(300); });
  add('combo-next-month', {}, async function () { click(calBtn(1)); await sleep(1500); click('#tsComboNext'); await sleep(300); });
  add('en-combo-next', { lang: 'en' }, async function () { click('#tsComboNext'); await sleep(300); });
  add('tasks-scroll', {}, async function () { var c = $('.ts-tasks-card'); c.scrollTop = c.scrollHeight; c.dispatchEvent(new Event('scroll')); await sleep(400); });
  add('tasks-scroll-dark', { theme: 'dark' }, async function () { var c = $('.ts-tasks-card'); c.scrollTop = c.scrollHeight; c.dispatchEvent(new Event('scroll')); await sleep(400); });
  add('tasks-short-screen', { w: 1280, h: 560 }, async function () {});
  add('sidebar-short-screen-dark', { w: 1280, h: 520, theme: 'dark' }, async function () {});
  add('appt-click', { roots: NO_ROOTS }, async function (sleep, side) { captureNav(side); window.__extra = async function () { return ['NAV ' + window.__navs.join(' | ')]; }; click('#tsComboBody .ts-appt-slide'); await sleep(900); });
  add('appt-click-next', { roots: NO_ROOTS }, async function (sleep, side) { captureNav(side); window.__extra = async function () { return ['NAV ' + window.__navs.join(' | ')]; }; click('#tsComboNext'); await sleep(200); click('#tsComboBody .ts-appt-slide'); await sleep(900); });
  add('task-click', { roots: NO_ROOTS }, async function (sleep, side) { captureNav(side); window.__extra = async function () { return ['NAV ' + window.__navs.join(' | ')]; }; click('#tsTaskList .ts-task-card'); await sleep(900); });
  add('task-click-last', { roots: NO_ROOTS }, async function (sleep, side) { captureNav(side); window.__extra = async function () { return ['NAV ' + window.__navs.join(' | ')]; }; var t = $$('#tsTaskList .ts-task-card'); click(t[t.length - 1]); await sleep(900); });
  add('task-click-adviser', { roots: NO_ROOTS }, async function (sleep, side) { await pickProduct(PRODUCTS.adviser); await sleep(600); captureNav(side); window.__extra = async function () { return ['NAV ' + window.__navs.join(' | ')]; }; click('#tsTaskList .ts-task-card'); await sleep(900); });
  add('ext-link-appt', { roots: NO_ROOTS }, async function (sleep, side) { captureNav(side); window.__extra = async function () { return ['NAV ' + window.__navs.join(' | ')]; }; click($$('.ts-section-head a')[0]); await sleep(900); });
  add('ext-link-tasks', { roots: NO_ROOTS }, async function (sleep, side) { captureNav(side); window.__extra = async function () { return ['NAV ' + window.__navs.join(' | ')]; }; click($$('.ts-section-head a')[1]); await sleep(900); });
  // empty
  add('empty-schedules', cfg({ emptySchedules: true }), async function () {});
  add('empty-schedules-dark', { ...cfg({ emptySchedules: true }), theme: 'dark' }, async function () {});
  add('empty-schedules-390', { ...cfg({ emptySchedules: true }), w: 390, h: 844 }, async function () {});
  add('en-empty-schedules', { ...cfg({ emptySchedules: true }), lang: 'en' }, async function () {});
  add('empty-schedules-day', cfg({ emptySchedules: true }), async function () { click($('#tsCalBody .ts-cal-cell.c-today')); await sleep(1300); });
  add('empty-product-schedules-dark', { theme: 'dark' }, async function () { await pickProduct(PRODUCTS.empty); await sleep(600); });

  /* ============================================================ permissions */
  add('perm-nosched', { denyRoles: ['CRM_Schedule_View'] }, async function () {});
  add('perm-nosched-dark', { denyRoles: ['CRM_Schedule_View'], theme: 'dark' }, async function () {});
  add('perm-nosched-390', { denyRoles: ['CRM_Schedule_View'], w: 390, h: 844 }, async function () {});
  add('perm-nocreate', { denyRoles: ['CRM_Schedule_Create'] }, async function () {});
  add('perm-nocreate-dark', { denyRoles: ['CRM_Schedule_Create'], theme: 'dark' }, async function () {});
  add('perm-nocreate-390', { denyRoles: ['CRM_Schedule_Create'], w: 390, h: 844 }, async function () {});
  add('perm-nosup', { denyRoles: ['CRM_Schedule_Create_Sup'] }, async function () {});
  add('perm-nosup-wm-open', { denyRoles: ['CRM_Schedule_Create_Sup'] }, async function () { await openWmAppt(); click('#ld2AwCustBtn'); await sleep(1500); });
  add('perm-nosup-wm-pick', { denyRoles: ['CRM_Schedule_Create_Sup'] }, async function () { await openWmAppt(); click('#ld2AwCustBtn'); await sleep(1500); md($$('#ld2AwCustItems .wm-cust-item')[0]); await sleep(1500); });
  add('perm-nosup-wm-save', { denyRoles: ['CRM_Schedule_Create_Sup'] }, async function () { await openWmAppt(); click('#ld2AwCustBtn'); await sleep(1500); md($$('#ld2AwCustItems .wm-cust-item')[0]); await sleep(1500); typeIn('#ld2AwSubject', 'นัด'); typeIn('#ld2AwDetail', 'รายละเอียด'); click('#ld2AwSubmitBtn'); await sleep(1100); });
  add('perm-nocreate-nosup', { denyRoles: ['CRM_Schedule_Create', 'CRM_Schedule_Create_Sup'] }, async function () {});
  add('perm-nosched-nocreate', { denyRoles: ['CRM_Schedule_View', 'CRM_Schedule_Create', 'CRM_Schedule_Create_Sup'] }, async function () {});
  add('perm-nolead', { denyRoles: ['CRM_Lead_View'] }, async function () {});
  add('perm-nolead-dark', { denyRoles: ['CRM_Lead_View'], theme: 'dark' }, async function () {});
  add('perm-nolead-390', { denyRoles: ['CRM_Lead_View'], w: 390, h: 844 }, async function () {});
  add('en-perm-nolead', { denyRoles: ['CRM_Lead_View'], lang: 'en' }, async function () {});
  add('perm-nolead-scroll', { denyRoles: ['CRM_Lead_View'] }, async function () { await scrollTable(); await sleep(1200); });
  add('en-perm-nosched', { denyRoles: ['CRM_Schedule_View'], lang: 'en' }, async function () {});

  /* ============================================================ the work modal, opened from the page */
  var custList = 'await openWmAppt(); click("#ld2AwCustBtn"); await sleep(1500);';
  var pickCust = (i) => custList + ' $$("#ld2AwCustItems .wm-cust-item")[' + i + '].dispatchEvent(new MouseEvent("mousedown", { bubbles: true })); await sleep(1500);';
  add('wm-appt-open', {}, async function () { await openWmAppt(); });
  add('wm-appt-open-dark', { theme: 'dark' }, async function () { await openWmAppt(); });
  add('wm-appt-open-390', { w: 390, h: 844 }, async function () { await openWmAppt(); });
  add('en-wm-appt-open', { lang: 'en' }, async function () { await openWmAppt(); });
  add('wm-task-open', {}, async function () { await openWmTask(); });
  add('wm-task-open-dark', { theme: 'dark' }, async function () { await openWmTask(); });
  add('wm-task-open-390', { w: 390, h: 844 }, async function () { await openWmTask(); });
  add('wm-task-open-en-dark', { lang: 'en', theme: 'dark' }, async function () { await openWmTask(); });
  add('wm-cust-list', {}, custList);
  add('wm-cust-list-dark', { theme: 'dark' }, custList);
  add('wm-cust-list-390', { w: 390, h: 844 }, custList);
  add('en-wm-cust-list', { lang: 'en' }, custList);
  add('wm-cust-list-car', {}, 'await pickProduct(PRODUCTS.car); ' + custList);
  add('wm-cust-list-adviser-dark', { theme: 'dark' }, 'await pickProduct(PRODUCTS.adviser); ' + custList);
  add('wm-cust-search', {}, custList + ' typeIn("#ld2AwCustSearch", "สม"); await sleep(2600);');
  add('wm-cust-search-none', {}, custList + ' typeIn("#ld2AwCustSearch", "zzzz"); await sleep(2600);');
  add('wm-cust-search-error', {}, custList + ' typeIn("#ld2AwCustSearch", "~500"); await sleep(2600);');
  add('wm-cust-more-pages', {}, custList + ' var l = $("#ld2AwCustItems"); l.scrollTop = l.scrollHeight; l.dispatchEvent(new Event("scroll")); await sleep(1500);');
  add('wm-cust-pick', {}, pickCust(1));
  add('wm-cust-pick-dark', { theme: 'dark' }, pickCust(1));
  add('wm-cust-pick-car', {}, 'await pickProduct(PRODUCTS.car); ' + pickCust(0));
  add('wm-cust-pick-owner-menu', {}, pickCust(2) + ' click("#ld2AwOwnerBtn"); await sleep(1000);');
  add('wm-validate-no-subject', {}, async function () { await openWmAppt(); click('#ld2AwSubmitBtn'); await sleep(800); });
  add('wm-validate-no-subject-dark', { theme: 'dark' }, async function () { await openWmAppt(); click('#ld2AwSubmitBtn'); await sleep(800); });
  add('en-wm-validate-no-subject', { lang: 'en' }, async function () { await openWmAppt(); click('#ld2AwSubmitBtn'); await sleep(800); });
  add('wm-validate-no-customer', {}, async function () { await openWmAppt(); typeIn('#ld2AwSubject', 'นัด'); typeIn('#ld2AwDetail', 'รายละเอียด'); click('#ld2AwSubmitBtn'); await sleep(900); });
  add('wm-validate-no-detail', {}, async function () { await openWmAppt(); typeIn('#ld2AwSubject', 'นัด'); click('#ld2AwSubmitBtn'); await sleep(900); });
  add('wm-close-x', {}, async function () { await openWmAppt(); click('#ld2AddWorkOverlay .ld2-aw-close'); await sleep(400); });
  add('wm-fail-save', {}, pickCust(1) + ' typeIn("#ld2AwSubject", "ทดสอบ ~fail"); typeIn("#ld2AwDetail", "รายละเอียด"); click("#ld2AwSubmitBtn"); await sleep(1300);');
  // a saved item shows the success overlay and then the page starts again (location.reload()): the new item is on the cards
  add('wm-save-appt-reload', { reloads: true }, pickCust(1) + ' typeIn("#ld2AwDate", "' + new Date().toISOString().slice(0, 8) + '28"); typeIn("#ld2AwTime", "14:30"); typeIn("#ld2AwSubject", "นัดเซ็นสัญญาสินเชื่อ"); typeIn("#ld2AwDetail", "เตรียมเอกสารตัวจริงมาด้วย"); click("#ld2AwSubmitBtn"); await sleep(3900);');
  add('wm-save-task-reload', { reloads: true }, 'await openWmTask(); click("#ld2AwCustBtn"); await sleep(1500); $$("#ld2AwCustItems .wm-cust-item")[1].dispatchEvent(new MouseEvent("mousedown", { bubbles: true })); await sleep(1500); typeIn("#ld2AwDate", "' + new Date().toISOString().slice(0, 8) + '22"); click("#ld2AwAllDay"); typeIn("#ld2AwSubject", "ส่งใบเสนอราคา"); typeIn("#ld2AwDetail", "ส่งทางอีเมลก่อนเที่ยง"); click("#ld2AwSubmitBtn"); await sleep(3900);');
  add('wm-save-success-overlay', {}, pickCust(1) + ' typeIn("#ld2AwSubject", "นัดจากหน้าแรก"); typeIn("#ld2AwDetail", "รายละเอียด"); click("#ld2AwSubmitBtn"); await sleep(1100);');
  add('wm-save-success-overlay-dark', { theme: 'dark' }, pickCust(1) + ' typeIn("#ld2AwSubject", "นัดจากหน้าแรก"); typeIn("#ld2AwDetail", "รายละเอียด"); click("#ld2AwSubmitBtn"); await sleep(1100);');
}
