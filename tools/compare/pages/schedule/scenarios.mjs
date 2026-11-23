// Scenarios of the Schedule comparison. Each function is run INSIDE the page under test (Java replica / Angular app) with
// (sleep, side, win) in scope, after the prelude of lib/scenario-pre.mjs and the page prelude (`pre` in page.mjs).
// add(name, opts, fn):  opts = { w, h, theme, lang, perm, denyRoles, mock, saved, storage, reloads, settle, wait, roots, ready }
//   perm + denyRoles: the permission set (page.mjs PERMS) — the Java page is built for it, the Angular session loses the roles
//   cfg({…})         the failures of the mock (schedule.mock.ts MockScheduleConfig) — `mock` for the Java page URL, `storage` for the Angular side
//   seed({…})        the page opens with a state the HttpSession already holds (the shape ScheduleView.savedFilterJson has)
//
// The data the scenarios rely on (see core/mock/schedule-seed.ts; "now" is 2026-10-20 10:30, the clock of both sides is fixed): product
// "สินเชื่อบ้าน" (house, the default) with its first workflow group "ฝ่ายบริการลูกค้า" (the default group); the days around today are dense
// (cells overflow into "N more"), today has three appointments at 10:00, an all-day appointment and an all-day task, a task at 00:30 (the
// week / day grids start at 1 AM) and one at 23:30; October 31 / November 1 / December 31 / January 1 have one item each; the car
// product has another workflow, the adviser product none; the 4th product has no item at all.
import { PERMS } from './page.mjs';

export default function (add) {
  // `live.hook` (a --live run): the switches for the fake REST service, which is not told by an address / by the storage of the tab as the mock is
  // (the Angular live backend keeps the state of the filter in the sessionStorage of the tab itself: key ts.sc_filter_state.<user>)
  const cfg = (c) => ({ mock: c, storage: { 'ts.mock.schedule.config': JSON.stringify(c) }, live: { hook: JSON.stringify(c) } });
  const seed = (s) => ({ saved: s, storage: { 'ts.mock.schedule.state': JSON.stringify({ patches: {}, added: [], filterState: JSON.stringify(s) }), 'ts.sc_filter_state.demo': JSON.stringify(s) } });
  const both = (a, b) => ({ ...a, ...b, storage: { ...(a.storage ?? {}), ...(b.storage ?? {}) } });
  const perm = (key) => ({ perm: key, denyRoles: PERMS[key] });
  const SIZES = [[1920, 1080], [1600, 900], [1440, 900], [1280, 720], [1024, 768], [768, 1024], [600, 900], [390, 844]];

  /* ============================================================ first paint: themes, viewports, language, A A A */
  add('overview', {}, async function () {});
  add('overview-dark', { theme: 'dark' }, async function () {});
  SIZES.forEach(function (s) { add('overview-' + s[0], { w: s[0], h: s[1] }, async function () {}); });
  add('overview-dark-390', { theme: 'dark', w: 390, h: 844 }, async function () {});
  add('overview-dark-768', { theme: 'dark', w: 768, h: 1024 }, async function () {});
  add('overview-dark-1024', { theme: 'dark', w: 1024, h: 768 }, async function () {});
  add('en-overview', { lang: 'en' }, async function () {});
  add('en-overview-dark', { lang: 'en', theme: 'dark' }, async function () {});
  add('en-overview-390', { lang: 'en', w: 390, h: 844 }, async function () {});
  add('fs-plus', {}, 'fontAdj("2px"); await sleep(800);');
  add('fs-minus', {}, 'fontAdj("-2px"); await sleep(800);');
  add('fs-plus-390', { w: 390, h: 844 }, 'fontAdj("2px"); await sleep(800);');
  add('fs-plus-dark', { theme: 'dark' }, 'fontAdj("2px"); await sleep(800);');
  add('fs-plus-1024', { w: 1024, h: 768 }, 'fontAdj("2px"); await sleep(800);');

  /* ============================================================ calendar: the four views and how to move in them */
  // year
  add('view-year', {}, async function () { await calView('year'); });
  add('view-year-dark', { theme: 'dark' }, async function () { await calView('year'); });
  add('view-year-390', { w: 390, h: 844 }, async function () { await calView('year'); });
  add('view-year-768', { w: 768, h: 1024 }, async function () { await calView('year'); });
  add('view-year-1024', { w: 1024, h: 768 }, async function () { await calView('year'); });
  add('view-year-1920', { w: 1920, h: 1080 }, async function () { await calView('year'); });
  add('en-view-year', { lang: 'en' }, async function () { await calView('year'); });
  add('view-year-fs-plus', {}, 'await calView("year"); fontAdj("2px"); await sleep(800);');
  add('year-next', {}, async function () { await calView('year'); await nav('next'); });
  add('year-prev', {}, async function () { await calView('year'); await nav('prev'); });
  add('year-prev-today', {}, async function () { await calView('year'); await nav('prev'); await nav('today'); });
  add('year-next-dark', { theme: 'dark' }, async function () { await calView('year'); await nav('next'); });
  add('year-day-pop', {}, async function () { await calView('year'); click('.sc-yr-d.sc-yr-clk'); await idle(600); });
  add('year-day-pop-dark', { theme: 'dark' }, async function () { await calView('year'); click('.sc-yr-d.sc-yr-clk'); await idle(600); });
  add('year-day-pop-today', {}, async function () { await calView('year'); click('.sc-yr-d.today'); await idle(600); });
  add('year-day-pop-390', { w: 390, h: 844 }, async function () { await calView('year'); click('.sc-yr-d.sc-yr-clk'); await idle(600); });
  add('year-day-pop-close', {}, async function () { await calView('year'); click('.sc-yr-d.sc-yr-clk'); await idle(500); click('.sc-more-pop-close'); await sleep(300); });
  add('year-day-pop-event', {}, async function () { await calView('year'); click('.sc-yr-d.sc-yr-clk'); await idle(500); click('#scMorePopList .sc-event'); await sleep(600); });
  add('year-day-unmarked', {}, async function () { await calView('year'); click('.sc-yr-d:not(.sc-yr-clk):not(.empty)'); await sleep(400); });
  add('year-month-title', {}, async function () { await calView('year'); click('.sc-yr-title:nth-child(1)'); await idle(700); });
  add('year-month-title-oct', {}, async function () { await calView('year'); click($$('.sc-yr-title')[9]); await idle(700); });
  add('year-next-3', {}, async function () { await calView('year'); await nav('next'); await nav('next'); await nav('next'); });
  // month
  add('month-next', {}, async function () { await nav('next'); });
  add('month-prev', {}, async function () { await nav('prev'); });
  add('month-prev-prev', {}, async function () { await nav('prev'); await nav('prev'); });
  add('month-next-next', {}, async function () { await nav('next'); await nav('next'); });
  add('month-next-today', {}, async function () { await nav('next'); await nav('today'); });
  add('month-next-dark', { theme: 'dark' }, async function () { await nav('next'); });
  add('month-next-390', { w: 390, h: 844 }, async function () { await nav('next'); });
  add('month-next-year-end', {}, async function () { await nav('next'); await nav('next'); await nav('next'); });
  add('month-prev-year-start', {}, 'for (var i = 0; i < 10; i++) { await nav("prev", 150); } await idle(500);');
  add('en-month-next', { lang: 'en' }, async function () { await nav('next'); });
  add('month-1024', { w: 1024, h: 768 }, async function () { await nav('next'); });
  add('month-768-fs-plus', { w: 768, h: 1024 }, 'fontAdj("2px"); await sleep(800);');
  add('month-more-pop', {}, async function () { hover($('.sc-more'), 'mouseenter'); await sleep(400); });
  add('month-more-pop-dark', { theme: 'dark' }, async function () { hover($('.sc-more'), 'mouseenter'); await sleep(400); });
  add('month-more-pop-390', { w: 390, h: 844 }, async function () { hover($('.sc-more'), 'mouseenter'); await sleep(400); });
  add('month-more-pop-last-cell', {}, async function () { var m = $$('.sc-more'); hover(m[m.length - 1], 'mouseenter'); await sleep(400); });
  add('month-more-pop-leave', {}, async function () { var m = $('.sc-more'); hover(m, 'mouseenter'); await sleep(300); hover(m, 'mouseleave'); await sleep(600); });
  add('month-more-pop-leave-back', {}, async function () { var m = $('.sc-more'); hover(m, 'mouseenter'); await sleep(300); hover(m, 'mouseleave'); await sleep(40); hover($('#scMorePop'), 'mouseenter'); await sleep(500); });
  add('month-more-pop-close', {}, async function () { hover($('.sc-more'), 'mouseenter'); await sleep(300); click('.sc-more-pop-close'); await sleep(300); });
  add('month-more-pop-event', {}, async function () { hover($('.sc-more'), 'mouseenter'); await sleep(300); click('#scMorePopList .sc-event'); await sleep(700); });
  add('month-event-appt', {}, async function () { click($$('#scCalBody .sc-event').filter(function (e) { return /35236a/i.test(e.getAttribute('style')); })[0]); await sleep(700); });
  add('month-event-task', {}, async function () { click($$('#scCalBody .sc-event').filter(function (e) { return /00c08b/i.test(e.getAttribute('style')); })[0]); await sleep(700); });

  // week
  add('view-week', {}, async function () { await calView('week'); });
  add('view-week-dark', { theme: 'dark' }, async function () { await calView('week'); });
  add('view-week-390', { w: 390, h: 844 }, async function () { await calView('week'); });
  add('view-week-768', { w: 768, h: 1024 }, async function () { await calView('week'); });
  add('view-week-1024', { w: 1024, h: 768 }, async function () { await calView('week'); });
  add('view-week-1920', { w: 1920, h: 1080 }, async function () { await calView('week'); });
  add('en-view-week', { lang: 'en' }, async function () { await calView('week'); });
  add('view-week-fs-plus', {}, 'await calView("week"); fontAdj("2px"); await sleep(800);');
  add('week-next', {}, async function () { await calView('week'); await nav('next'); });
  add('week-prev', {}, async function () { await calView('week'); await nav('prev'); });
  add('week-prev-today', {}, async function () { await calView('week'); await nav('prev'); await nav('today'); });
  add('week-next-dark', { theme: 'dark' }, async function () { await calView('week'); await nav('next'); });
  add('week-across-month', {}, async function () { await calView('week'); await nav('next'); await nav('next'); });
  add('week-across-year', {}, 'await calView("week"); for (var i = 0; i < 11; i++) { await nav("next", 150); } await idle(500);');
  add('week-toggle-appt', {}, async function () { await calView('week'); click('#scChkAppt'); await sleep(300); });
  add('week-toggle-task', {}, async function () { await calView('week'); click('#scChkTask'); await sleep(300); });
  add('week-toggle-both', {}, async function () { await calView('week'); click('#scChkAppt'); click('#scChkTask'); await sleep(300); });
  add('week-toggle-back', {}, async function () { await calView('week'); click('#scChkAppt'); click('#scChkAppt'); await sleep(300); });
  add('week-toggle-dark', { theme: 'dark' }, async function () { await calView('week'); click('#scChkTask'); await sleep(300); });
  add('week-toggle-then-next', {}, async function () { await calView('week'); click('#scChkAppt'); await nav('next'); });
  add('week-event-open', {}, async function () { await calView('week'); click(evs('.sc-tg-cell .sc-event')[0]); await sleep(700); });
  add('week-allday-event-open', {}, async function () { await calView('week'); click(evs('.sc-tg-allday-cell .sc-event')[0]); await sleep(700); });
  // day
  add('view-day', {}, async function () { await calView('day'); });
  add('view-day-dark', { theme: 'dark' }, async function () { await calView('day'); });
  add('view-day-390', { w: 390, h: 844 }, async function () { await calView('day'); });
  add('view-day-768', { w: 768, h: 1024 }, async function () { await calView('day'); });
  add('view-day-1920', { w: 1920, h: 1080 }, async function () { await calView('day'); });
  add('en-view-day', { lang: 'en' }, async function () { await calView('day'); });
  add('view-day-fs-plus', {}, 'await calView("day"); fontAdj("2px"); await sleep(800);');
  add('day-next', {}, async function () { await calView('day'); await nav('next'); });
  add('day-prev', {}, async function () { await calView('day'); await nav('prev'); });
  add('day-prev-today', {}, async function () { await calView('day'); await nav('prev'); await nav('today'); });
  add('day-next-dark', { theme: 'dark' }, async function () { await calView('day'); await nav('next'); });
  add('day-across-month', {}, 'await calView("day"); for (var i = 0; i < 12; i++) { await nav("next", 120); } await idle(500);');
  add('day-toggle-appt', {}, async function () { await calView('day'); click('#scChkAppt'); await sleep(300); });
  add('day-toggle-task', {}, async function () { await calView('day'); click('#scChkTask'); await sleep(300); });
  add('day-event-open', {}, async function () { await calView('day'); click(evs('.sc-tg-cell .sc-event')[0]); await sleep(700); });
  add('day-event-open-dark', { theme: 'dark' }, async function () { await calView('day'); click(evs('.sc-tg-cell .sc-event')[0]); await sleep(700); });
  // view menu and the way back to the month
  add('view-menu', {}, async function () { await openViewMenu(); });
  add('view-menu-dark', { theme: 'dark' }, async function () { await openViewMenu(); });
  add('view-menu-week', {}, async function () { await calView('week'); await openViewMenu(); });
  add('view-menu-close-outside', {}, async function () { await openViewMenu(); click('.sc-cal-label'); await sleep(300); click('.sc-main-card'); await sleep(300); });
  add('view-back-to-month', {}, async function () { await calView('week'); await calView('month'); });
  add('view-day-then-year', {}, async function () { await calView('day'); await calView('year'); });
  add('view-week-after-next-month', {}, async function () { await nav('next'); await calView('week'); });
  add('view-day-after-prev-month', {}, async function () { await nav('prev'); await calView('day'); });

  /* ============================================================ the date picker (the label of the calendar) */
  add('dp-month', {}, async function () { await openDp(); });
  add('dp-month-dark', { theme: 'dark' }, async function () { await openDp(); });
  add('dp-month-390', { w: 390, h: 844 }, async function () { await openDp(); });
  add('en-dp-month', { lang: 'en' }, async function () { await openDp(); });
  add('dp-month-fs-plus', {}, 'fontAdj("2px"); await openDp();');
  add('dp-month-prev-year', {}, async function () { await openDp(); click('#scDpPrev'); await sleep(250); });
  add('dp-month-next-year', {}, async function () { await openDp(); click('#scDpNext'); await sleep(250); });
  add('dp-month-pick', {}, async function () { await openDp(); click($$('#scDpGrid .sc-dp-month-item')[2]); await idle(700); });
  add('dp-month-pick-next-year', {}, async function () { await openDp(); click('#scDpNext'); click($$('#scDpGrid .sc-dp-month-item')[0]); await idle(700); });
  add('dp-month-close-outside', {}, async function () { await openDp(); click('.sc-main-card'); await sleep(300); });
  add('dp-month-toggle', {}, async function () { await openDp(); click('#scCalLabel'); await sleep(300); });
  add('dp-year', {}, async function () { await calView('year'); await openDp(); });
  add('dp-year-dark', { theme: 'dark' }, async function () { await calView('year'); await openDp(); });
  add('dp-year-prev', {}, async function () { await calView('year'); await openDp(); click('#scDpPrev'); await sleep(250); });
  add('dp-year-next', {}, async function () { await calView('year'); await openDp(); click('#scDpNext'); await sleep(250); });
  add('dp-year-pick', {}, async function () { await calView('year'); await openDp(); click($$('#scDpGrid .sc-dp-year-item')[4]); await idle(700); });
  add('dp-week', {}, async function () { await calView('week'); await openDp(); });
  add('dp-week-dark', { theme: 'dark' }, async function () { await calView('week'); await openDp(); });
  add('dp-week-prev-month', {}, async function () { await calView('week'); await openDp(); click('#scDpPrev'); await sleep(250); });
  add('dp-week-next-month', {}, async function () { await calView('week'); await openDp(); click('#scDpNext'); await sleep(250); });
  add('dp-week-pick', {}, async function () { await calView('week'); await openDp(); click($$('#scDpGrid .sc-dp-day:not(.other)')[8]); await idle(700); });
  add('dp-week-pick-390', { w: 390, h: 844 }, async function () { await calView('week'); await openDp(); click($$('#scDpGrid .sc-dp-day:not(.other)')[8]); await idle(700); });
  add('dp-day', {}, async function () { await calView('day'); await openDp(); });
  add('dp-day-dark', { theme: 'dark' }, async function () { await calView('day'); await openDp(); });
  add('dp-day-pick', {}, async function () { await calView('day'); await openDp(); click($$('#scDpGrid .sc-dp-day:not(.other)')[24]); await idle(700); });
  add('dp-day-next-month-pick', {}, async function () { await calView('day'); await openDp(); click('#scDpNext'); click($$('#scDpGrid .sc-dp-day:not(.other)')[0]); await idle(700); });
  add('dp-day-prev-year-month', {}, 'await calView("day"); await openDp(); for (var i = 0; i < 10; i++) { click("#scDpPrev"); } await sleep(300);');

  /* ============================================================ product and workflow group */
  add('product-menu', {}, async function () { click('.sc-product-btn'); await sleep(300); });
  add('product-menu-dark', { theme: 'dark' }, async function () { click('.sc-product-btn'); await sleep(300); });
  add('product-menu-390', { w: 390, h: 844 }, async function () { click('.sc-product-btn'); await sleep(300); });
  add('en-product-menu', { lang: 'en' }, async function () { click('.sc-product-btn'); await sleep(300); });
  add('product-menu-close-outside', {}, async function () { click('.sc-product-btn'); await sleep(300); click('.sc-main-card'); await sleep(300); });
  add('product-car', {}, async function () { await pickProduct(PRODUCTS.car); });
  add('product-car-dark', { theme: 'dark' }, async function () { await pickProduct(PRODUCTS.car); });
  add('product-adviser', {}, async function () { await pickProduct(PRODUCTS.adviser); });
  add('product-adviser-dark', { theme: 'dark' }, async function () { await pickProduct(PRODUCTS.adviser); });
  add('product-adviser-390', { w: 390, h: 844 }, async function () { await pickProduct(PRODUCTS.adviser); });
  add('product-empty', {}, async function () { await pickProduct(PRODUCTS.empty); });
  add('product-empty-dark', { theme: 'dark' }, async function () { await pickProduct(PRODUCTS.empty); });
  add('product-empty-board', {}, async function () { await pickProduct(PRODUCTS.empty); await tab('board'); });
  add('product-empty-list', {}, async function () { await pickProduct(PRODUCTS.empty); await tab('list'); });
  add('product-adviser-week', {}, async function () { await pickProduct(PRODUCTS.adviser); await calView('week'); });
  add('product-adviser-board', {}, async function () { await pickProduct(PRODUCTS.adviser); await tab('board'); });
  add('product-adviser-list', {}, async function () { await pickProduct(PRODUCTS.adviser); await tab('list'); });
  add('product-car-board', {}, async function () { await tab('board'); await pickProduct(PRODUCTS.car); });
  add('product-car-list', {}, async function () { await tab('list'); await pickProduct(PRODUCTS.car); });
  add('product-adviser-then-house', {}, async function () { await pickProduct(PRODUCTS.adviser); await pickProduct(PRODUCTS.house); });
  add('product-adviser-year', {}, async function () { await calView('year'); await pickProduct(PRODUCTS.adviser); });
  add('group-menu', {}, async function () { click('#scGroupBtn'); await sleep(300); });
  add('group-menu-dark', { theme: 'dark' }, async function () { click('#scGroupBtn'); await sleep(300); });
  add('en-group-menu', { lang: 'en' }, async function () { click('#scGroupBtn'); await sleep(300); });
  add('group-2', {}, async function () { await pickGroup(2); });
  add('group-3-dark', { theme: 'dark' }, async function () { await pickGroup(3); });
  add('group-last', {}, async function () { await pickGroup(7); });
  add('group-2-board', {}, async function () { await tab('board'); await pickGroup(2); });
  add('group-2-list', {}, async function () { await tab('list'); await pickGroup(2); });
  add('group-4-week', {}, async function () { await calView('week'); await pickGroup(4); });
  add('group-then-product', {}, async function () { await pickGroup(3); await pickProduct(PRODUCTS.car); });
  add('group-390', { w: 390, h: 844 }, async function () { await pickGroup(2); });

  /* ============================================================ tabs, sort, search */
  SIZES.forEach(function (s) {
    add('tab-board-' + s[0], { w: s[0], h: s[1] }, async function () { await tab('board', 800); });
    add('tab-list-' + s[0], { w: s[0], h: s[1] }, async function () { await tab('list', 800); });
  });
  add('tab-board', {}, async function () { await tab('board', 800); });
  add('tab-board-dark', { theme: 'dark' }, async function () { await tab('board', 800); });
  add('tab-board-dark-390', { theme: 'dark', w: 390, h: 844 }, async function () { await tab('board', 800); });
  add('en-tab-board', { lang: 'en' }, async function () { await tab('board', 800); });
  add('tab-board-fs-plus', {}, 'await tab("board", 600); fontAdj("2px"); await sleep(800);');
  add('tab-board-fs-minus', {}, 'await tab("board", 600); fontAdj("-2px"); await sleep(800);');
  add('tab-list', {}, async function () { await tab('list', 800); });
  add('tab-list-dark', { theme: 'dark' }, async function () { await tab('list', 800); });
  add('tab-list-dark-390', { theme: 'dark', w: 390, h: 844 }, async function () { await tab('list', 800); });
  add('en-tab-list', { lang: 'en' }, async function () { await tab('list', 800); });
  add('tab-list-fs-plus', {}, 'await tab("list", 600); fontAdj("2px"); await sleep(800);');
  add('tab-list-fs-minus', {}, 'await tab("list", 600); fontAdj("-2px"); await sleep(800);');
  add('tab-board-then-calendar', {}, async function () { await tab('board'); await tab('calendar'); });
  add('tab-list-then-board', {}, async function () { await tab('list'); await tab('board'); });
  add('tab-list-then-calendar-week', {}, async function () { await calView('week'); await tab('list'); await tab('calendar'); });
  add('sort-menu-list', {}, async function () { await tab('list'); click('#scSortBtn'); await sleep(300); });
  add('sort-menu-list-dark', { theme: 'dark' }, async function () { await tab('list'); click('#scSortBtn'); await sleep(300); });
  add('en-sort-menu-list', { lang: 'en' }, async function () { await tab('list'); click('#scSortBtn'); await sleep(300); });
  add('sort-menu-calendar-hidden', {}, async function () { click('#scSortBtn'); await sleep(300); });
  add('sort-date-asc-list', {}, async function () { await tab('list'); click('#scSortBtn'); click('#scSortDd .ld-dd-item[data-api="date_asc"]'); await idle(700); });
  add('sort-order-asc-list', {}, async function () { await tab('list'); click('#scSortBtn'); click('#scSortDd .ld-dd-item[data-api="order_asc"]'); await idle(700); });
  add('sort-order-desc-list', {}, async function () { await tab('list'); click('#scSortBtn'); click('#scSortDd .ld-dd-item[data-api="order_desc"]'); await idle(700); });
  add('sort-status-list', {}, async function () { await tab('list'); click('#scSortBtn'); click('#scSortDd .ld-dd-item[data-api="status"]'); await idle(700); });
  add('sort-status-list-dark', { theme: 'dark' }, async function () { await tab('list'); click('#scSortBtn'); click('#scSortDd .ld-dd-item[data-api="status"]'); await idle(700); });
  add('sort-date-asc-board', {}, async function () { await tab('board'); click('#scSortBtn'); click('#scSortDd .ld-dd-item[data-api="date_asc"]'); await idle(700); });
  add('sort-status-board', {}, async function () { await tab('board'); click('#scSortBtn'); click('#scSortDd .ld-dd-item[data-api="status"]'); await idle(700); });
  add('sort-then-back-date-desc', {}, async function () { await tab('list'); click('#scSortBtn'); click('#scSortDd .ld-dd-item[data-api="status"]'); await idle(500); click('#scSortBtn'); click('#scSortDd .ld-dd-item[data-api="date_desc"]'); await idle(700); });
  add('sort-close-outside', {}, async function () { await tab('list'); click('#scSortBtn'); await sleep(250); click('.sc-main-card'); await sleep(300); });
  add('search-open', {}, async function () { click('.ld-search-ic'); await sleep(300); });
  add('search-open-dark', { theme: 'dark' }, async function () { click('.ld-search-ic'); await sleep(300); });
  add('search-open-390', { w: 390, h: 844 }, async function () { click('.ld-search-ic'); await sleep(300); });
  add('en-search-open', { lang: 'en' }, async function () { click('.ld-search-ic'); await sleep(300); });
  add('search-type-go', {}, async function () { click('.ld-search-ic'); typeIn('#scSearchInput', 'นัดเซ็นสัญญา'); click('#scSearchGo'); await idle(700); });
  add('search-enter', {}, async function () { click('.ld-search-ic'); typeIn('#scSearchInput', 'นัดดึก'); key('Enter', $('#scSearchInput')); await idle(700); });
  add('search-customer', {}, async function () { click('.ld-search-ic'); typeIn('#scSearchInput', 'สมชาย'); click('#scSearchGo'); await idle(700); });
  add('search-none', {}, async function () { click('.ld-search-ic'); typeIn('#scSearchInput', 'ไม่มีข้อมูลนี้แน่นอน'); click('#scSearchGo'); await idle(700); });
  add('search-none-dark', { theme: 'dark' }, async function () { click('.ld-search-ic'); typeIn('#scSearchInput', 'ไม่มีข้อมูลนี้แน่นอน'); click('#scSearchGo'); await idle(700); });
  add('search-clear', {}, async function () { click('.ld-search-ic'); typeIn('#scSearchInput', 'นัดเซ็นสัญญา'); click('#scSearchGo'); await idle(500); click('#scSearchClear'); await idle(700); });
  add('search-close-empty', {}, async function () { click('.ld-search-ic'); click('#scSearchClear'); await sleep(300); });
  add('search-list', {}, async function () { await tab('list'); click('.ld-search-ic'); typeIn('#scSearchInput', 'ประเมินราคา'); click('#scSearchGo'); await idle(700); });
  add('search-board', {}, async function () { await tab('board'); click('.ld-search-ic'); typeIn('#scSearchInput', 'ประเมินราคา'); click('#scSearchGo'); await idle(700); });
  add('search-week', {}, async function () { await calView('week'); click('.ld-search-ic'); typeIn('#scSearchInput', 'นัดซ้อนเวลา'); click('#scSearchGo'); await idle(700); });
  add('search-year', {}, async function () { await calView('year'); click('.ld-search-ic'); typeIn('#scSearchInput', 'นัดปลายปี'); click('#scSearchGo'); await idle(700); });
  add('search-special-chars', {}, async function () { click('.ld-search-ic'); typeIn('#scSearchInput', 'ตัวอักษรพิเศษ'); click('#scSearchGo'); await idle(700); });
  add('search-then-tab-list', {}, async function () { click('.ld-search-ic'); typeIn('#scSearchInput', 'นัดเซ็นสัญญา'); click('#scSearchGo'); await idle(500); await tab('list'); });
  add('search-open-fs-plus', {}, 'fontAdj("2px"); click(".ld-search-ic"); await sleep(500);');

  /* ============================================================ board */
  add('board-scroll-more-scheduled', {}, async function () { await tab('board'); await scrollEl($$('#scApptBoard .sc-col')[0], undefined, 400); await idle(500); });
  add('board-scroll-more-twice', {}, async function () { await tab('board'); var c = $$('#scApptBoard .sc-col')[0]; await scrollEl(c, undefined, 400); await idle(400); await scrollEl(c, undefined, 400); await idle(500); });
  add('board-scroll-more-task', {}, async function () { await tab('board'); await scrollEl($$('#scTaskBoard .sc-col')[0], undefined, 400); await idle(500); });
  add('board-scroll-more-dark', { theme: 'dark' }, async function () { await tab('board'); await scrollEl($$('#scApptBoard .sc-col')[0], undefined, 400); await idle(500); });
  add('board-scroll-more-slow', {}, async function () { await tab('board'); await scrollEl($$('#scApptBoard .sc-col')[0], undefined, 60); });
  add('board-hscroll', {}, async function () { await tab('board'); var b = $('#scApptBoard'); b.scrollLeft = 300; await sleep(300); });
  add('board-grab-scroll', {}, async function () {
    await tab('board'); var b = $('#scApptBoard'); var r = b.getBoundingClientRect();
    var ev = function (t, x, y) { return new MouseEvent(t, { bubbles: true, clientX: x, clientY: y, button: 0 }); };
    b.dispatchEvent(ev('mousedown', r.left + 6, r.top + 6));
    document.dispatchEvent(ev('mousemove', r.left - 100, r.top + 6));
    await sleep(200);
  });
  add('board-grab-release', {}, async function () {
    await tab('board'); var b = $('#scApptBoard'); var r = b.getBoundingClientRect();
    var ev = function (t, x, y) { return new MouseEvent(t, { bubbles: true, clientX: x, clientY: y, button: 0 }); };
    b.dispatchEvent(ev('mousedown', r.left + 6, r.top + 6));
    document.dispatchEvent(ev('mousemove', r.left - 100, r.top + 6));
    document.dispatchEvent(ev('mouseup', r.left - 100, r.top + 6)); await sleep(200);
  });
  add('board-ctx', {}, async function () { await tab('board'); click($('#scApptBoard .sc-menu-btn')); await sleep(300); });
  add('board-ctx-dark', { theme: 'dark' }, async function () { await tab('board'); click($('#scApptBoard .sc-menu-btn')); await sleep(300); });
  add('board-ctx-task', {}, async function () { await tab('board'); click($('#scTaskBoard .sc-menu-btn')); await sleep(300); });
  add('board-ctx-closed', {}, async function () { await tab('board'); click($$('#scApptBoard .sc-col')[2].querySelector('.sc-menu-btn')); await sleep(300); });
  add('board-ctx-noedit', perm('noedit'), async function () { await tab('board'); click($('#scApptBoard .sc-menu-btn')); await sleep(300); });
  add('board-ctx-nolead', perm('nolead'), async function () { await tab('board'); click($('#scApptBoard .sc-menu-btn')); await sleep(300); });
  add('board-ctx-readonly', perm('readonly'), async function () { await tab('board'); click($('#scApptBoard .sc-menu-btn')); await sleep(300); });
  add('board-ctx-390', { w: 390, h: 844 }, async function () { await tab('board'); click($('#scApptBoard .sc-menu-btn')); await sleep(300); });
  add('board-ctx-switch', {}, async function () { await tab('board'); var m = $$('#scApptBoard .sc-menu-btn'); click(m[0]); await sleep(150); click(m[1]); await sleep(300); });
  add('board-ctx-close-outside', {}, async function () { await tab('board'); click($('#scApptBoard .sc-menu-btn')); await sleep(200); click('.sc-main-card'); await sleep(300); });
  add('board-ctx-edit', {}, async function () { await tab('board'); click($('#scApptBoard .sc-menu-btn')); await sleep(200); click($('#scApptBoard .sc-ctx-menu.show .sc-ctx-item')); await sleep(700); });
  add('board-ctx-edit-task', {}, async function () { await tab('board'); click($('#scTaskBoard .sc-menu-btn')); await sleep(200); click($('#scTaskBoard .sc-ctx-menu.show .sc-ctx-item')); await sleep(700); });
  add('board-ctx-go-lead', { roots: [] }, async function (sleep, side) { watchNav(side); await tab('board'); click($('#scApptBoard .sc-menu-btn')); await sleep(200); click($$('#scApptBoard .sc-ctx-menu.show .sc-ctx-item')[1]); await sleep(700); });
  add('board-card-open', {}, async function () { await tab('board'); click($('#scApptBoard .sc-card')); await sleep(700); });
  add('board-card-open-task', {}, async function () { await tab('board'); click($('#scTaskBoard .sc-card')); await sleep(700); });
  add('board-card-open-dark', { theme: 'dark' }, async function () { await tab('board'); click($('#scApptBoard .sc-card')); await sleep(700); });
  add('board-card-open-closed', {}, async function () { await tab('board'); click($$('#scApptBoard .sc-col')[3].querySelector('.sc-card')); await sleep(700); });
  add('board-add-appt', {}, async function () { await addFrom('board', 'appt'); });
  add('board-add-task', {}, async function () { await addFrom('board', 'task'); });
  // drag & drop
  add('board-drag-start', {}, async function () {
    await tab('board'); var card = $('#scApptBoard .sc-card'); var dt = new DataTransfer();
    card.dispatchEvent(new DragEvent('dragstart', { bubbles: true, cancelable: true, dataTransfer: dt })); await sleep(100);
  });
  add('board-drag-over-allowed', {}, async function () {
    await tab('board'); var card = $('#scApptBoard .sc-card'); var dt = new DataTransfer(); var mk = function (t) { return new DragEvent(t, { bubbles: true, cancelable: true, dataTransfer: dt }); };
    card.dispatchEvent(mk('dragstart')); await sleep(100); $$('#scApptBoard .sc-col')[1].dispatchEvent(mk('dragover')); await sleep(100);
  });
  add('board-drag-over-allowed-dark', { theme: 'dark' }, async function () {
    await tab('board'); var card = $('#scApptBoard .sc-card'); var dt = new DataTransfer(); var mk = function (t) { return new DragEvent(t, { bubbles: true, cancelable: true, dataTransfer: dt }); };
    card.dispatchEvent(mk('dragstart')); await sleep(100); $$('#scApptBoard .sc-col')[1].dispatchEvent(mk('dragover')); await sleep(100);
  });
  add('board-drag-over-other-type', {}, async function () {
    await tab('board'); var card = $('#scApptBoard .sc-card'); var dt = new DataTransfer(); var mk = function (t) { return new DragEvent(t, { bubbles: true, cancelable: true, dataTransfer: dt }); };
    card.dispatchEvent(mk('dragstart')); await sleep(100); $$('#scApptBoard .sc-col')[1].dispatchEvent(mk('dragover')); await sleep(60); $$('#scTaskBoard .sc-col')[0].dispatchEvent(mk('dragover')); await sleep(100);
  });
  add('board-drag-end-cancelled', {}, async function () {
    await tab('board'); var card = $('#scApptBoard .sc-card'); var dt = new DataTransfer(); var mk = function (t) { return new DragEvent(t, { bubbles: true, cancelable: true, dataTransfer: dt }); };
    card.dispatchEvent(mk('dragstart')); await sleep(100); $$('#scApptBoard .sc-col')[1].dispatchEvent(mk('dragover')); card.dispatchEvent(mk('dragend')); await sleep(150);
  });
  add('board-drag-reschedule', {}, async function () { await tab('board'); await dnd($('#scApptBoard .sc-card'), $$('#scApptBoard .sc-col')[1]); await idle(900); });
  add('board-drag-success', {}, async function () { await tab('board'); await dnd($('#scApptBoard .sc-card'), $$('#scApptBoard .sc-col')[2]); await idle(900); });
  add('board-drag-cancel', {}, async function () { await tab('board'); await dnd($('#scApptBoard .sc-card'), $$('#scApptBoard .sc-col')[3]); await idle(900); });
  add('board-drag-back-scheduled', {}, async function () { await tab('board'); await dnd($$('#scApptBoard .sc-col')[1].querySelector('.sc-card'), $$('#scApptBoard .sc-col')[0]); await idle(900); });
  add('board-drag-task-success', {}, async function () { await tab('board'); await dnd($('#scTaskBoard .sc-card'), $$('#scTaskBoard .sc-col')[1]); await idle(900); });
  add('board-drag-task-cancel-dark', { theme: 'dark' }, async function () { await tab('board'); await dnd($('#scTaskBoard .sc-card'), $$('#scTaskBoard .sc-col')[2]); await idle(900); });
  add('board-drag-immediate', {}, async function () { await tab('board'); await dnd($('#scApptBoard .sc-card'), $$('#scApptBoard .sc-col')[1]); await sleep(30); });
  add('board-drag-other-type', {}, async function () { await tab('board'); await dnd($('#scApptBoard .sc-card'), $$('#scTaskBoard .sc-col')[1]); await idle(700); });
  add('board-drag-same-column', {}, async function () { await tab('board'); await dnd($('#scApptBoard .sc-card'), $$('#scApptBoard .sc-col')[0]); await idle(700); });
  add('board-drag-from-closed', {}, async function () { await tab('board'); await dnd($$('#scApptBoard .sc-col')[2].querySelector('.sc-card'), $$('#scApptBoard .sc-col')[0]); await idle(700); });
  add('board-drag-from-closed-task', {}, async function () { await tab('board'); await dnd($$('#scTaskBoard .sc-col')[1].querySelector('.sc-card'), $$('#scTaskBoard .sc-col')[0]); await idle(700); });
  add('board-drag-noedit', perm('noedit'), async function () { await tab('board'); await dnd($('#scApptBoard .sc-card'), $$('#scApptBoard .sc-col')[1]); await idle(700); });
  add('board-drag-fail', cfg({ failEdit: true }), async function () { await tab('board'); await dnd($('#scApptBoard .sc-card'), $$('#scApptBoard .sc-col')[1]); await idle(900); });
  add('board-drag-fail-task', cfg({ failEdit: true }), async function () { await tab('board'); await dnd($('#scTaskBoard .sc-card'), $$('#scTaskBoard .sc-col')[1]); await idle(900); });
  add('board-drag-twice', {}, async function () { await tab('board'); await dnd($('#scApptBoard .sc-card'), $$('#scApptBoard .sc-col')[1]); await idle(900); await dnd($('#scApptBoard .sc-card'), $$('#scApptBoard .sc-col')[1]); await idle(900); });
  add('board-drag-then-list', {}, async function () { await tab('board'); await dnd($('#scApptBoard .sc-card'), $$('#scApptBoard .sc-col')[2]); await idle(900); await tab('list'); });
  add('board-drag-then-month', {}, async function () { await tab('board'); await dnd($('#scApptBoard .sc-card'), $$('#scApptBoard .sc-col')[3]); await idle(900); await tab('calendar'); });
  add('board-1024-scroll', { w: 1024, h: 768 }, async function () { await tab('board'); $('#scApptBoard').scrollLeft = 400; await sleep(300); });
  add('board-390-scroll-task', { w: 390, h: 844 }, async function () { await tab('board'); $('#scTaskBoard').scrollLeft = 300; await sleep(300); });

  /* ============================================================ list */
  add('list-scroll-more-appt', {}, async function () { await tab('list'); await scrollEl($$('.sc-list-scroll')[0], undefined, 400); await idle(500); });
  add('list-scroll-more-appt-twice', {}, async function () { await tab('list'); var s = $$('.sc-list-scroll')[0]; await scrollEl(s, undefined, 400); await idle(400); await scrollEl(s, undefined, 400); await idle(500); });
  add('list-scroll-more-task', {}, async function () { await tab('list'); await scrollEl($$('.sc-list-scroll')[1], undefined, 400); await idle(500); });
  add('list-scroll-more-dark', { theme: 'dark' }, async function () { await tab('list'); await scrollEl($$('.sc-list-scroll')[0], undefined, 400); await idle(500); });
  add('list-scroll-more-slow', {}, async function () { await tab('list'); await scrollEl($$('.sc-list-scroll')[0], undefined, 60); });
  add('list-scroll-middle', {}, async function () { await tab('list'); await scrollEl($$('.sc-list-scroll')[0], 300, 300); });
  add('list-hscroll-1024', { w: 1024, h: 768 }, async function () { await tab('list'); $$('.sc-list-scroll')[0].scrollLeft = 300; await sleep(300); });
  add('list-ctx', {}, async function () { await tab('list'); click($('#scApptList .sc-menu-btn')); await sleep(300); });
  add('list-ctx-dark', { theme: 'dark' }, async function () { await tab('list'); click($('#scApptList .sc-menu-btn')); await sleep(300); });
  add('list-ctx-task', {}, async function () { await tab('list'); click($('#scTaskList .sc-menu-btn')); await sleep(300); });
  add('list-ctx-closed', {}, async function () { await tab('list'); click($$('#scApptList tr').filter(function (r) { return r.querySelector('.sc-st-success, .sc-st-cancel'); })[0].querySelector('.sc-menu-btn')); await sleep(300); });
  add('list-ctx-noedit', perm('noedit'), async function () { await tab('list'); click($('#scApptList .sc-menu-btn')); await sleep(300); });
  add('list-ctx-nolead', perm('nolead'), async function () { await tab('list'); click($('#scApptList .sc-menu-btn')); await sleep(300); });
  add('list-ctx-readonly', perm('readonly'), async function () { await tab('list'); click($('#scApptList .sc-menu-btn')); await sleep(300); });
  add('list-ctx-close-outside', {}, async function () { await tab('list'); click($('#scApptList .sc-menu-btn')); await sleep(200); click('.sc-main-card'); await sleep(300); });
  add('list-ctx-edit', {}, async function () { await tab('list'); click($('#scApptList .sc-menu-btn')); await sleep(200); click($('#scApptList .sc-ctx-menu.show .sc-ctx-item')); await sleep(700); });
  add('list-ctx-edit-task', {}, async function () { await tab('list'); click($('#scTaskList .sc-menu-btn')); await sleep(200); click($('#scTaskList .sc-ctx-menu.show .sc-ctx-item')); await sleep(700); });
  add('list-ctx-go-lead', { roots: [] }, async function (sleep, side) { watchNav(side); await tab('list'); click($('#scApptList .sc-menu-btn')); await sleep(200); click($$('#scApptList .sc-ctx-menu.show .sc-ctx-item')[1]); await sleep(700); });
  add('list-ctx-go-lead-task', { roots: [] }, async function (sleep, side) { watchNav(side); await tab('list'); click($('#scTaskList .sc-menu-btn')); await sleep(200); click($$('#scTaskList .sc-ctx-menu.show .sc-ctx-item')[1]); await sleep(700); });
  add('list-row-open', {}, async function () { await tab('list'); click($$('#scApptList tr')[1].querySelectorAll('td')[2]); await sleep(700); });
  add('list-row-open-task', {}, async function () { await tab('list'); click($$('#scTaskList tr')[1].querySelectorAll('td')[2]); await sleep(700); });
  add('list-row-open-dark', { theme: 'dark' }, async function () { await tab('list'); click($$('#scApptList tr')[1].querySelectorAll('td')[2]); await sleep(700); });
  add('list-row-open-noview', perm('noview'), async function () { await tab('list'); click($$('#scApptList tr')[1].querySelectorAll('td')[2]); await sleep(700); });
  add('list-add-appt', {}, async function () { await addFrom('list', 'appt'); });
  add('list-add-task', {}, async function () { await addFrom('list', 'task'); });

  /* ============================================================ the filter dialog */
  add('filter-open', {}, async function () { await openFilter(); });
  add('filter-open-dark', { theme: 'dark' }, async function () { await openFilter(); });
  add('filter-open-390', { w: 390, h: 844 }, async function () { await openFilter(); });
  add('filter-open-768', { w: 768, h: 1024 }, async function () { await openFilter(); });
  add('filter-open-1024-short', { w: 1024, h: 500 }, async function () { await openFilter(); });
  add('en-filter-open', { lang: 'en' }, async function () { await openFilter(); });
  add('filter-open-fs-plus', {}, 'fontAdj("2px"); await openFilter();');
  add('filter-open-board', {}, async function () { await tab('board'); await openFilter(); });
  add('filter-open-list-dark', { theme: 'dark' }, async function () { await tab('list'); await openFilter(); });
  add('filter-dd-team', {}, async function () { await openFilter(1000); click('#scHFSaleGroupBtn'); await sleep(400); });
  add('filter-dd-team-dark', { theme: 'dark' }, async function () { await openFilter(1000); click('#scHFSaleGroupBtn'); await sleep(400); });
  add('filter-dd-owner', {}, async function () { await openFilter(1000); click('#scHFOwnerBtn'); await sleep(400); });
  add('filter-dd-owner-dark', { theme: 'dark' }, async function () { await openFilter(1000); click('#scHFOwnerBtn'); await sleep(400); });
  add('en-filter-dd-owner', { lang: 'en' }, async function () { await openFilter(1000); click('#scHFOwnerBtn'); await sleep(400); });
  add('filter-dd-owner-search', {}, async function () { await openFilter(1000); click('#scHFOwnerBtn'); await sleep(300); typeIn('#scHFOwnerList .sc-hf-dd-search input', 'สม'); await sleep(300); });
  add('filter-dd-owner-search-none', {}, async function () { await openFilter(1000); click('#scHFOwnerBtn'); await sleep(300); typeIn('#scHFOwnerList .sc-hf-dd-search input', 'zzzz'); await sleep(300); });
  add('filter-dd-switch', {}, async function () { await openFilter(1000); click('#scHFOwnerBtn'); await sleep(250); click('#scHFSaleGroupBtn'); await sleep(300); });
  add('filter-dd-close-outside', {}, async function () { await openFilter(1000); click('#scHFOwnerBtn'); await sleep(250); click('.sc-hf-title'); await sleep(300); });
  add('filter-pick-team', {}, async function () { await openFilter(1000); click('#scHFSaleGroupBtn'); await sleep(250); click($$('#scHFSaleGroupList .sc-hf-dd-item')[1]); await sleep(300); });
  add('filter-pick-owner', {}, async function () { await openFilter(1000); click('#scHFOwnerBtn'); await sleep(250); click($$('#scHFOwnerList .sc-hf-dd-item')[2]); await sleep(300); });
  add('filter-pick-owner-dark', { theme: 'dark' }, async function () { await openFilter(1000); click('#scHFOwnerBtn'); await sleep(250); click($$('#scHFOwnerList .sc-hf-dd-item')[2]); await sleep(300); });
  add('filter-uncheck-appt', {}, async function () { await openFilter(); click('#scHFApptGrid input:nth-of-type(1)'); await sleep(200); });
  add('filter-uncheck-task', {}, async function () { await openFilter(); click($$('#scHFTaskGrid input')[0]); await sleep(200); });
  add('filter-uncheck-all-dark', { theme: 'dark' }, async function () { await openFilter(); $$('#scFilterOverlay .sc-hf-ch-item input').forEach(function (c) { c.click(); }); await sleep(200); });
  add('filter-apply-nothing', {}, async function () { await openFilter(); await applyFilter(); });
  add('filter-apply-team', {}, async function () { await openFilter(1000); click('#scHFSaleGroupBtn'); await sleep(250); click($$('#scHFSaleGroupList .sc-hf-dd-item')[1]); await sleep(200); await applyFilter(); });
  add('filter-apply-team-dark', { theme: 'dark' }, async function () { await openFilter(1000); click('#scHFSaleGroupBtn'); await sleep(250); click($$('#scHFSaleGroupList .sc-hf-dd-item')[1]); await sleep(200); await applyFilter(); });
  add('filter-apply-owner', {}, async function () { await openFilter(1000); click('#scHFOwnerBtn'); await sleep(250); click($$('#scHFOwnerList .sc-hf-dd-item')[2]); await sleep(200); await applyFilter(); });
  add('filter-apply-appt-status', {}, async function () { await openFilter(); click($$('#scHFApptGrid input')[0]); click($$('#scHFApptGrid input')[3]); await applyFilter(); });
  add('filter-apply-task-status', {}, async function () { await openFilter(); click($$('#scHFTaskGrid input')[0]); await applyFilter(); });
  add('filter-apply-two', {}, async function () { await openFilter(1000); click('#scHFOwnerBtn'); await sleep(250); click($$('#scHFOwnerList .sc-hf-dd-item')[1]); click($$('#scHFTaskGrid input')[1]); await applyFilter(); });
  add('filter-apply-four', {}, async function () { await openFilter(1000); click('#scHFSaleGroupBtn'); await sleep(250); click($$('#scHFSaleGroupList .sc-hf-dd-item')[1]); click('#scHFOwnerBtn'); await sleep(250); click($$('#scHFOwnerList .sc-hf-dd-item')[1]); click($$('#scHFApptGrid input')[0]); click($$('#scHFTaskGrid input')[2]); await applyFilter(); });
  add('filter-apply-four-dark', { theme: 'dark' }, async function () { await openFilter(1000); click('#scHFSaleGroupBtn'); await sleep(250); click($$('#scHFSaleGroupList .sc-hf-dd-item')[1]); click('#scHFOwnerBtn'); await sleep(250); click($$('#scHFOwnerList .sc-hf-dd-item')[1]); click($$('#scHFApptGrid input')[0]); click($$('#scHFTaskGrid input')[2]); await applyFilter(); });
  add('filter-apply-board', {}, async function () { await tab('board'); await openFilter(1000); click($$('#scHFApptGrid input')[0]); click($$('#scHFTaskGrid input')[0]); await applyFilter(); });
  add('filter-apply-board-owner', {}, async function () { await tab('board'); await openFilter(1000); click('#scHFOwnerBtn'); await sleep(250); click($$('#scHFOwnerList .sc-hf-dd-item')[1]); await applyFilter(); });
  add('filter-apply-list', {}, async function () { await tab('list'); await openFilter(1000); click($$('#scHFApptGrid input')[1]); await applyFilter(); });
  add('filter-apply-list-team', {}, async function () { await tab('list'); await openFilter(1000); click('#scHFSaleGroupBtn'); await sleep(250); click($$('#scHFSaleGroupList .sc-hf-dd-item')[2]); await applyFilter(); });
  add('filter-apply-week', {}, async function () { await calView('week'); await openFilter(1000); click($$('#scHFApptGrid input')[0]); await applyFilter(); });
  add('filter-apply-year', {}, async function () { await calView('year'); await openFilter(1000); click($$('#scHFTaskGrid input')[0]); await applyFilter(); });
  add('filter-apply-none-match', {}, async function () { await openFilter(1000); $$('#scHFApptGrid input, #scHFTaskGrid input').forEach(function (c) { c.click(); }); await applyFilter(); });
  add('filter-clear', {}, async function () { await openFilter(1000); click('#scHFOwnerBtn'); await sleep(250); click($$('#scHFOwnerList .sc-hf-dd-item')[2]); click($$('#scHFTaskGrid input')[0]); click('#scHFClear'); await sleep(300); });
  add('filter-clear-then-apply', {}, async function () { await openFilter(1000); click('#scHFOwnerBtn'); await sleep(250); click($$('#scHFOwnerList .sc-hf-dd-item')[2]); await applyFilter(); await openFilter(); click('#scHFClear'); await applyFilter(); });
  add('filter-close-x', {}, async function () { await openFilter(); click('#scHFClose'); await sleep(300); });
  add('filter-close-overlay', {}, async function () { await openFilter(); click('#scFilterOverlay'); await sleep(300); });
  add('filter-click-inside-keeps-open', {}, async function () { await openFilter(); click('.sc-hf-dialog'); await sleep(300); });
  add('filter-reopen-keeps-applied', {}, async function () { await openFilter(1000); click($$('#scHFTaskGrid input')[0]); await applyFilter(); await openFilter(); });
  add('filter-reopen-drops-unapplied', {}, async function () { await openFilter(1000); click($$('#scHFTaskGrid input')[0]); click('#scHFClose'); await sleep(300); await openFilter(); });
  add('filter-then-product', {}, async function () { await openFilter(1000); click($$('#scHFTaskGrid input')[0]); await applyFilter(); await pickProduct(PRODUCTS.car); });
  add('filter-then-tab-board', {}, async function () { await openFilter(1000); click($$('#scHFApptGrid input')[2]); await applyFilter(); await tab('board'); });

  /* ============================================================ the work modal: every way in */
  add('wm-view-month-appt', {}, async function () { click($$('#scCalBody .sc-event')[0]); await sleep(700); });
  add('wm-view-month-appt-dark', { theme: 'dark' }, async function () { click($$('#scCalBody .sc-event')[0]); await sleep(700); });
  add('wm-view-month-appt-390', { w: 390, h: 844 }, async function () { click($$('#scCalBody .sc-event')[0]); await sleep(700); });
  add('en-wm-view-month-appt', { lang: 'en' }, async function () { click($$('#scCalBody .sc-event')[0]); await sleep(700); });
  add('wm-view-month-appt-fs-plus', {}, 'fontAdj("2px"); click($$("#scCalBody .sc-event")[0]); await sleep(700);');
  add('wm-view-month-task', {}, async function () { click($$('#scCalBody .sc-event').filter(function (e) { return /00c08b/i.test(e.getAttribute('style')); })[0]); await sleep(700); });
  add('wm-view-month-task-dark', { theme: 'dark' }, async function () { click($$('#scCalBody .sc-event').filter(function (e) { return /00c08b/i.test(e.getAttribute('style')); })[0]); await sleep(700); });
  add('wm-view-month-go-lead', { roots: [] }, async function (sleep, side) { watchNav(side); click($$('#scCalBody .sc-event')[0]); await sleep(500); click('#ld2VwGoLead'); await sleep(500); });
  add('wm-view-month-go-lead-nolead', perm('nolead'), async function () { click($$('#scCalBody .sc-event')[0]); await sleep(600); });
  add('wm-view-month-edit', {}, async function () { click($$('#scCalBody .sc-event')[0]); await sleep(500); click('#ld2VwEditBtn'); await sleep(700); });
  add('wm-view-month-noedit', perm('noedit'), async function () { click($$('#scCalBody .sc-event')[0]); await sleep(600); });
  add('wm-view-month-noview', perm('noview'), async function () { click($$('#scCalBody .sc-event')[0]); await sleep(600); });
  add('wm-view-month-closed', {}, async function () { var e = $$('#scCalBody .sc-event'); click(e[e.length - 1]); await sleep(600); });
  add('wm-view-month-close-x', {}, async function () { click($$('#scCalBody .sc-event')[0]); await sleep(400); click('#ld2ViewWorkOverlay .ld2-aw-close'); await sleep(400); });
  add('wm-view-month-close-overlay', {}, async function () { click($$('#scCalBody .sc-event')[0]); await sleep(400); click('#ld2ViewWorkOverlay'); await sleep(400); });
  add('wm-view-week', {}, async function () { await calView('week'); click(evs('.sc-tg-cell .sc-event')[0]); await sleep(700); });
  add('wm-view-week-allday', {}, async function () { await calView('week'); click(evs('.sc-tg-allday-cell .sc-event')[0]); await sleep(700); });
  add('wm-view-day-task', {}, async function () { await calView('day'); click(evs('.sc-tg-cell .sc-event').filter(function (e) { return /00c08b/i.test(e.getAttribute('style')); })[0]); await sleep(700); });
  add('wm-view-board-appt', {}, async function () { await tab('board'); click($('#scApptBoard .sc-card')); await sleep(700); });
  add('wm-view-board-appt-390', { w: 390, h: 844 }, async function () { await tab('board'); click($('#scApptBoard .sc-card')); await sleep(700); });
  add('wm-view-board-task', {}, async function () { await tab('board'); click($('#scTaskBoard .sc-card')); await sleep(700); });
  add('wm-view-list-appt', {}, async function () { await tab('list'); click($$('#scApptList tr')[2].querySelectorAll('td')[3]); await sleep(700); });
  add('wm-view-list-task-dark', { theme: 'dark' }, async function () { await tab('list'); click($$('#scTaskList tr')[2].querySelectorAll('td')[3]); await sleep(700); });
  add('wm-view-status-open', {}, async function () { await tab('board'); click($('#scApptBoard .sc-card')); await sleep(500); click('#ld2VwStatusBtn'); await sleep(300); });
  add('wm-edit-save-month', {}, async function () { click($$('#scCalBody .sc-event')[0]); await sleep(500); click('#ld2VwEditBtn'); await sleep(600); typeIn('#ld2AwSubject', 'หัวข้อที่แก้ไขแล้ว'); click('#ld2AwSubmitBtn'); await sleep(1500); });
  add('wm-edit-save-month-reload', { reloads: true }, async function () { click($$('#scCalBody .sc-event')[0]); await sleep(500); click('#ld2VwEditBtn'); await sleep(600); typeIn('#ld2AwSubject', 'หัวข้อที่แก้ไขแล้ว'); click('#ld2AwSubmitBtn'); await sleep(3900); await loaded(1000); });
  add('wm-edit-save-board-reload', { reloads: true }, async function () { await tab('board'); click($('#scApptBoard .sc-menu-btn')); await sleep(200); click($('#scApptBoard .sc-ctx-menu.show .sc-ctx-item')); await sleep(600); typeIn('#ld2AwSubject', 'แก้จากบอร์ด'); click('#ld2AwSubmitBtn'); await sleep(3900); await loaded(1000); });
  add('wm-edit-save-fail', {}, async function () { click($$('#scCalBody .sc-event')[0]); await sleep(500); click('#ld2VwEditBtn'); await sleep(600); setVal('#ld2AwSubject', 'แก้ ~fail'); click('#ld2AwSubmitBtn'); await sleep(1500); });
  add('wm-view-save-status', {}, async function () { await tab('board'); click($('#scApptBoard .sc-card')); await sleep(500); click('#ld2VwStatusBtn'); click('#ld2VwStatusList .wm-sd-item:nth-child(2)'); await sleep(200); click('#ld2VwSubmitBtn'); await sleep(1500); });
  // add (the customer is chosen in the modal)
  add('wm-add-board-appt', {}, async function () { await addFrom('board', 'appt'); });
  add('wm-add-board-appt-dark', { theme: 'dark' }, async function () { await addFrom('board', 'appt'); });
  add('wm-add-board-appt-390', { w: 390, h: 844 }, async function () { await addFrom('board', 'appt'); });
  add('en-wm-add-board-appt', { lang: 'en' }, async function () { await addFrom('board', 'appt'); });
  add('wm-add-board-appt-fs-plus', {}, 'fontAdj("2px"); await addFrom("board", "appt");');
  add('wm-add-list-task', {}, async function () { await addFrom('list', 'task'); });
  add('wm-add-list-task-dark', { theme: 'dark' }, async function () { await addFrom('list', 'task'); });
  add('wm-add-car-product', {}, async function () { await pickProduct(PRODUCTS.car); await addFrom('board', 'appt'); });
  add('wm-add-adviser-product', {}, async function () { await pickProduct(PRODUCTS.adviser); await addFrom('list', 'task'); });
  add('wm-add-group-3', {}, async function () { await pickGroup(3); await addFrom('board', 'task'); });
  add('wm-add-customer-open', {}, async function () { await addFrom('board', 'appt'); click('#ld2AwCustBtn'); await sleep(900); });
  add('wm-add-customer-open-dark', { theme: 'dark' }, async function () { await addFrom('board', 'appt'); click('#ld2AwCustBtn'); await sleep(900); });
  add('wm-add-customer-open-390', { w: 390, h: 844 }, async function () { await addFrom('board', 'appt'); click('#ld2AwCustBtn'); await sleep(900); });
  add('wm-add-customer-search', {}, async function () { await addFrom('board', 'appt'); await pickCustomer('สม'); });
  add('wm-add-customer-search-none', {}, async function () { await addFrom('board', 'appt'); await pickCustomer('ไม่มีลูกค้าชื่อนี้'); });
  add('wm-add-customer-scroll-more', {}, async function () { await addFrom('board', 'appt'); click('#ld2AwCustBtn'); await sleep(900); var it = $('#ld2AwCustItems'); it.scrollTop = it.scrollHeight; await sleep(1200); });
  add('wm-add-customer-filter-team', {}, async function () { await addFrom('board', 'appt'); click('#ld2AwCustBtn'); await sleep(900); click($$('#ld2AwCustBody .wm-cust-pill')[0]); await sleep(300); });
  add('wm-add-customer-clear', {}, async function () { await addFrom('board', 'appt'); await pickCustomer('สม'); click('#ld2AwCustX'); await sleep(500); });
  add('wm-add-customer-pick', {}, async function () { await addFrom('board', 'appt'); await pickCustomer('', 0); });
  add('wm-add-customer-pick-dark', { theme: 'dark' }, async function () { await addFrom('board', 'appt'); await pickCustomer('', 0); });
  add('wm-add-customer-pick-second', {}, async function () { await addFrom('list', 'task'); await pickCustomer('', 2); });
  add('wm-add-customer-pick-owner-open', {}, async function () { await addFrom('board', 'appt'); await pickCustomer('', 0); click('#ld2AwOwnerBtn'); await sleep(900); });
  add('wm-add-validate-customer', {}, async function () { await addFrom('board', 'appt'); click('#ld2AwSubmitBtn'); await sleep(900); });
  add('wm-add-validate-customer-dark', { theme: 'dark' }, async function () { await addFrom('board', 'appt'); click('#ld2AwSubmitBtn'); await sleep(900); });
  add('en-wm-add-validate-customer', { lang: 'en' }, async function () { await addFrom('board', 'appt'); click('#ld2AwSubmitBtn'); await sleep(900); });
  add('wm-add-validate-subject', {}, async function () { await addFrom('board', 'appt'); await pickCustomer('', 0); click('#ld2AwSubmitBtn'); await sleep(900); });
  add('wm-add-validate-detail', {}, async function () { await addFrom('board', 'appt'); await pickCustomer('', 0); fillWork({ subject: 'นัดทดสอบ' }); click('#ld2AwSubmitBtn'); await sleep(900); });
  add('wm-add-validate-date', {}, async function () { await addFrom('board', 'appt'); await pickCustomer('', 0); fillWork({ date: '', subject: 'นัดทดสอบ', detail: 'รายละเอียด' }); click('#ld2AwSubmitBtn'); await sleep(900); });
  add('wm-add-allday', {}, async function () { await addFrom('board', 'appt'); click('#ld2AwAllDay'); await sleep(300); });
  add('wm-add-save-appt', {}, async function () { await addFrom('board', 'appt'); await pickCustomer('', 0); fillWork({ date: '2026-10-28', time: '14:30', subject: 'นัดเซ็นสัญญาใหม่', detail: 'เตรียมเอกสารตัวจริง' }); click('#ld2AwSubmitBtn'); await sleep(900); });
  add('wm-add-save-appt-dark', { theme: 'dark' }, async function () { await addFrom('board', 'appt'); await pickCustomer('', 0); fillWork({ date: '2026-10-28', time: '14:30', subject: 'นัดเซ็นสัญญาใหม่', detail: 'เตรียมเอกสารตัวจริง' }); click('#ld2AwSubmitBtn'); await sleep(900); });
  add('wm-add-save-appt-reload', { reloads: true }, async function () { await addFrom('board', 'appt'); await pickCustomer('', 0); fillWork({ date: '2026-10-28', time: '14:30', subject: 'นัดเซ็นสัญญาใหม่', detail: 'เตรียมเอกสารตัวจริง' }); click('#ld2AwSubmitBtn'); await sleep(3900); await loaded(1000); });
  add('wm-add-save-appt-reload-board', { reloads: true }, async function () { await addFrom('board', 'appt'); await pickCustomer('', 0); fillWork({ date: '2026-10-28', time: '14:30', subject: 'นัดเซ็นสัญญาใหม่', detail: 'เตรียมเอกสารตัวจริง' }); click('#ld2AwSubmitBtn'); await sleep(3900); await loaded(1000); });
  add('wm-add-save-task-allday-reload', both({ reloads: true }, seed({ movementTypeId: 1004400740, activityGroupId: 101, calView: 'month', calYear: 2026, calMonth: 9, calDay: 20, tab: 'list', filter: null, listSort: 'order_desc', search: '' })), async function () { click('#scAddTaskListBtn'); await sleep(500); await pickCustomer('', 1); click('#ld2AwAllDay'); fillWork({ date: '2026-10-22', subject: 'งานตลอดวันใหม่', detail: 'รายละเอียดงาน' }); click('#ld2AwSubmitBtn'); await sleep(3900); await loaded(1000); });
  add('wm-add-save-fail', {}, async function () { await addFrom('board', 'appt'); await pickCustomer('', 0); setVal('#ld2AwSubject', 'ทดสอบ ~fail'); fillWork({ detail: 'รายละเอียด' }); click('#ld2AwSubmitBtn'); await sleep(1500); });
  add('wm-add-save-fail-dark', { theme: 'dark' }, async function () { await addFrom('board', 'appt'); await pickCustomer('', 0); setVal('#ld2AwSubject', 'ทดสอบ ~fail'); fillWork({ detail: 'รายละเอียด' }); click('#ld2AwSubmitBtn'); await sleep(1500); });
  add('wm-add-nosup-customers', perm('nosup'), async function () { await addFrom('board', 'appt'); click('#ld2AwCustBtn'); await sleep(1200); });
  add('wm-add-nosup-pick', perm('nosup'), async function () { await addFrom('board', 'appt'); await pickCustomer('', 0); });
  add('wm-add-nocreate-board', perm('nocreate'), async function () { await tab('board'); });
  add('wm-add-nocreate-list', perm('nocreate'), async function () { await tab('list'); });
  add('wm-add-nocreate-open-attempt', perm('nocreate'), async function () { await tab('board'); window.scOpenWorkAdd('appt'); await sleep(400); });
  add('wm-add-close-x', {}, async function () { await addFrom('board', 'appt'); click('#ld2AddWorkOverlay .ld2-aw-close'); await sleep(400); });
  add('wm-add-reopen-resets', {}, async function () { await addFrom('board', 'appt'); await pickCustomer('', 0); fillWork({ subject: 'ค้างอยู่' }); click('#ld2AddWorkOverlay .ld2-aw-close'); await sleep(300); click('#scAddTaskBoardBtn'); await sleep(500); });

  /* ============================================================ permissions */
  [['noview', 'perm-noview'], ['noedit', 'perm-noedit'], ['nocreate', 'perm-nocreate'], ['nosup', 'perm-nosup'], ['nolead', 'perm-nolead'], ['readonly', 'perm-readonly']].forEach(function (p) {
    add(p[1] + '-month', perm(p[0]), async function () {});
    add(p[1] + '-board', perm(p[0]), async function () { await tab('board'); });
    add(p[1] + '-list', perm(p[0]), async function () { await tab('list'); });
  });
  add('perm-readonly-dark', both(perm('readonly'), { theme: 'dark' }), async function () { await tab('board'); });
  add('perm-noview-event', perm('noview'), async function () { click($$('#scCalBody .sc-event')[0]); await sleep(500); });
  add('perm-noview-board-card', perm('noview'), async function () { await tab('board'); click($('#scApptBoard .sc-card')); await sleep(500); });
  add('perm-nolead-week-event', perm('nolead'), async function () { await calView('week'); click(evs('.sc-tg-cell .sc-event')[0]); await sleep(600); });

  /* ============================================================ empty and failing backends */
  add('err-products', cfg({ failProducts: true }), async function () {});
  add('err-products-dark', both(cfg({ failProducts: true }), { theme: 'dark' }), async function () {});
  add('err-products-390', both(cfg({ failProducts: true }), { w: 390, h: 844 }), async function () {});
  add('en-err-products', both(cfg({ failProducts: true }), { lang: 'en' }), async function () {});
  add('err-products-retry', cfg({ failProducts: true }), async function () { click('.sc-error-retry'); await idle(700); });
  add('err-calendar', cfg({ failCalendar: true }), async function () {});
  add('err-calendar-dark', both(cfg({ failCalendar: true }), { theme: 'dark' }), async function () {});
  add('en-err-calendar', both(cfg({ failCalendar: true }), { lang: 'en' }), async function () {});
  add('err-calendar-retry', cfg({ failCalendar: true }), async function () { click('.sc-error-retry'); await idle(700); });
  add('err-calendar-week-nav', cfg({ failCalendar: true }), async function () { await calView('week'); });
  add('err-calendar-tab-board', cfg({ failCalendar: true }), async function () { await tab('board'); });
  add('err-board', cfg({ failBoard: true }), async function () { await tab('board'); });
  add('err-board-dark', both(cfg({ failBoard: true }), { theme: 'dark' }), async function () { await tab('board'); });
  add('en-err-board', both(cfg({ failBoard: true }), { lang: 'en' }), async function () { await tab('board'); });
  add('err-board-retry', cfg({ failBoard: true }), async function () { await tab('board'); click('.sc-error-retry'); await idle(700); });
  add('err-board-then-calendar', cfg({ failBoard: true }), async function () { await tab('board'); await tab('calendar'); });
  add('err-list', cfg({ failList: true }), async function () { await tab('list'); });
  add('err-list-dark', both(cfg({ failList: true }), { theme: 'dark' }), async function () { await tab('list'); });
  add('en-err-list', both(cfg({ failList: true }), { lang: 'en' }), async function () { await tab('list'); });
  add('err-list-retry', cfg({ failList: true }), async function () { await tab('list'); click('.sc-error-retry'); await idle(700); });
  add('err-groups', cfg({ failGroups: true }), async function () {});
  add('err-groups-product-car', cfg({ failGroups: true }), async function () { await pickProduct(PRODUCTS.car); });
  add('no-groups', cfg({ noGroups: true }), async function () {});
  add('no-groups-board', cfg({ noGroups: true }), async function () { await tab('board'); });
  add('no-products', cfg({ noProducts: true }), async function () {});
  add('no-products-dark', both(cfg({ noProducts: true }), { theme: 'dark' }), async function () {});
  add('no-products-board', cfg({ noProducts: true }), async function () { await tab('board'); });
  add('no-products-list', cfg({ noProducts: true }), async function () { await tab('list'); });
  add('no-products-add', cfg({ noProducts: true }), async function () { await addFrom('board', 'appt'); });
  add('empty-all-month', cfg({ emptyAll: true }), async function () {});
  add('empty-all-month-dark', both(cfg({ emptyAll: true }), { theme: 'dark' }), async function () {});
  add('empty-all-week', cfg({ emptyAll: true }), async function () { await calView('week'); });
  add('empty-all-day', cfg({ emptyAll: true }), async function () { await calView('day'); });
  add('empty-all-year', cfg({ emptyAll: true }), async function () { await calView('year'); });
  add('empty-all-board', cfg({ emptyAll: true }), async function () { await tab('board'); });
  add('empty-all-board-dark', both(cfg({ emptyAll: true }), { theme: 'dark' }), async function () { await tab('board'); });
  add('empty-all-list', cfg({ emptyAll: true }), async function () { await tab('list'); });
  add('empty-all-list-dark', both(cfg({ emptyAll: true }), { theme: 'dark' }), async function () { await tab('list'); });
  add('empty-all-list-390', both(cfg({ emptyAll: true }), { w: 390, h: 844 }), async function () { await tab('list'); });
  add('short-pages-board', cfg({ maxPerPage: 4 }), async function () { await tab('board'); });
  add('short-pages-board-scroll', cfg({ maxPerPage: 4 }), async function () { await tab('board'); var c = $$('#scApptBoard .sc-col')[0]; for (var i = 0; i < 3; i++) { await scrollEl(c, undefined, 300); await idle(300); } });
  add('short-pages-list', cfg({ maxPerPage: 4 }), async function () { await tab('list'); });
  add('short-pages-list-scroll', cfg({ maxPerPage: 4 }), async function () { await tab('list'); var s = $$('.sc-list-scroll')[0]; for (var i = 0; i < 3; i++) { await scrollEl(s, undefined, 300); await idle(300); } });

  /* ============================================================ the state the HttpSession keeps */
  add('saved-week', seed({ movementTypeId: 1004400740, activityGroupId: 101, calView: 'week', calYear: 2026, calMonth: 9, calDay: 14, tab: 'calendar', filter: null, listSort: 'date_desc', search: '' }), async function () {});
  add('saved-day-dark', both(seed({ movementTypeId: 1004400740, activityGroupId: 101, calView: 'day', calYear: 2026, calMonth: 9, calDay: 20, tab: 'calendar', filter: null, listSort: 'date_desc', search: '' }), { theme: 'dark' }), async function () {});
  add('saved-year', seed({ movementTypeId: 1004400740, activityGroupId: 101, calView: 'year', calYear: 2026, calMonth: 9, calDay: 20, tab: 'calendar', filter: null, listSort: 'date_desc', search: '' }), async function () {});
  add('saved-month-next', seed({ movementTypeId: 1004400740, activityGroupId: 101, calView: 'month', calYear: 2026, calMonth: 10, calDay: 1, tab: 'calendar', filter: null, listSort: 'date_desc', search: '' }), async function () {});
  add('saved-board', seed({ movementTypeId: 1004400740, activityGroupId: 101, calView: 'month', calYear: 2026, calMonth: 9, calDay: 20, tab: 'board', filter: null, listSort: 'date_desc', search: '' }), async function () {});
  add('saved-board-dark', both(seed({ movementTypeId: 1004400740, activityGroupId: 101, calView: 'month', calYear: 2026, calMonth: 9, calDay: 20, tab: 'board', filter: null, listSort: 'status', search: '' }), { theme: 'dark' }), async function () {});
  add('saved-list-sort', seed({ movementTypeId: 1004400740, activityGroupId: 101, calView: 'month', calYear: 2026, calMonth: 9, calDay: 20, tab: 'list', filter: null, listSort: 'order_desc', search: '' }), async function () {});
  add('saved-list-sort-390', both(seed({ movementTypeId: 1004400740, activityGroupId: 101, calView: 'month', calYear: 2026, calMonth: 9, calDay: 20, tab: 'list', filter: null, listSort: 'date_asc', search: '' }), { w: 390, h: 844 }), async function () {});
  add('saved-search', seed({ movementTypeId: 1004400740, activityGroupId: 101, calView: 'month', calYear: 2026, calMonth: 9, calDay: 20, tab: 'calendar', filter: null, listSort: 'date_desc', search: 'นัดเซ็นสัญญา' }), async function () {});
  add('saved-search-list', seed({ movementTypeId: 1004400740, activityGroupId: 101, calView: 'month', calYear: 2026, calMonth: 9, calDay: 20, tab: 'list', filter: null, listSort: 'date_desc', search: 'ประเมินราคา' }), async function () {});
  add('saved-filter', seed({ movementTypeId: 1004400740, activityGroupId: 101, calView: 'month', calYear: 2026, calMonth: 9, calDay: 20, tab: 'calendar', filter: { saleGroup: '1004400001', owner: '', appt: ['scheduled', 're-schedule'], task: ['doing', 'success', 'cancel'], apptAll: false, taskAll: true }, listSort: 'date_desc', search: '' }), async function () {});
  add('saved-filter-dark', both(seed({ movementTypeId: 1004400740, activityGroupId: 101, calView: 'month', calYear: 2026, calMonth: 9, calDay: 20, tab: 'calendar', filter: { saleGroup: '', owner: '1002', appt: ['scheduled', 're-schedule', 'cancel', 'success'], task: ['doing'], apptAll: true, taskAll: false }, listSort: 'date_desc', search: '' }), { theme: 'dark' }), async function () {});
  add('saved-filter-open', seed({ movementTypeId: 1004400740, activityGroupId: 101, calView: 'month', calYear: 2026, calMonth: 9, calDay: 20, tab: 'calendar', filter: { saleGroup: '1004400002', owner: '1003', appt: ['success'], task: ['doing', 'success', 'cancel'], apptAll: false, taskAll: true }, listSort: 'date_desc', search: '' }), async function () { await openFilter(1200); });
  add('saved-filter-board', seed({ movementTypeId: 1004400740, activityGroupId: 101, calView: 'month', calYear: 2026, calMonth: 9, calDay: 20, tab: 'board', filter: { saleGroup: '', owner: '', appt: ['scheduled'], task: ['doing'], apptAll: false, taskAll: false }, listSort: 'date_desc', search: '' }), async function () {});
  add('saved-product-car', seed({ movementTypeId: 1004400741, activityGroupId: 102, calView: 'month', calYear: 2026, calMonth: 9, calDay: 20, tab: 'calendar', filter: null, listSort: 'date_desc', search: '' }), async function () {});
  add('saved-product-adviser', seed({ movementTypeId: 1004400742, activityGroupId: null, calView: 'week', calYear: 2026, calMonth: 9, calDay: 20, tab: 'calendar', filter: null, listSort: 'date_desc', search: '' }), async function () {});
  add('saved-product-unknown', seed({ movementTypeId: 999, activityGroupId: 101, calView: 'month', calYear: 2026, calMonth: 9, calDay: 20, tab: 'calendar', filter: null, listSort: 'date_desc', search: '' }), async function () {});
  add('saved-group-3-list', seed({ movementTypeId: 1004400740, activityGroupId: 103, calView: 'month', calYear: 2026, calMonth: 9, calDay: 20, tab: 'list', filter: null, listSort: 'date_desc', search: '' }), async function () {});
  add('saved-invalid-sort', seed({ movementTypeId: 1004400740, activityGroupId: 101, calView: 'month', calYear: 2026, calMonth: 9, calDay: 20, tab: 'list', filter: null, listSort: 'bogus', search: '' }), async function () {});
  add('saved-empty-object', seed({}), async function () {});
  add('saved-all-390', both(seed({ movementTypeId: 1004400741, activityGroupId: 103, calView: 'week', calYear: 2026, calMonth: 10, calDay: 3, tab: 'calendar', filter: { saleGroup: '1004400001', owner: '', appt: ['scheduled'], task: ['doing', 'success', 'cancel'], apptAll: false, taskAll: true }, listSort: 'status', search: 'นัด' }), { w: 390, h: 844 }), async function () {});
  // the page saves its state with every change (sendBeacon): change things, load the page again, the new page starts from there
  add('reload-view-week', {}, async function () { await calView('week'); await nav('next'); await sleep(300); return '__RELOAD__'; });
  add('reload-view-day-dark', { theme: 'dark' }, async function () { await calView('day'); await nav('prev'); await sleep(300); return '__RELOAD__'; });
  add('reload-view-year', {}, async function () { await calView('year'); await nav('next'); await sleep(300); return '__RELOAD__'; });
  add('reload-tab-board', {}, async function () { await tab('board'); await sleep(300); return '__RELOAD__'; });
  add('reload-tab-list-sort', {}, async function () { await tab('list'); click('#scSortBtn'); click('#scSortDd .ld-dd-item[data-api="status"]'); await idle(500); return '__RELOAD__'; });
  add('reload-product-group', {}, async function () { await pickProduct(PRODUCTS.car); await pickGroup(2); await sleep(300); return '__RELOAD__'; });
  add('reload-search', {}, async function () { click('.ld-search-ic'); typeIn('#scSearchInput', 'นัดเซ็นสัญญา'); click('#scSearchGo'); await idle(500); return '__RELOAD__'; });
  add('reload-search-cleared', {}, async function () { click('.ld-search-ic'); typeIn('#scSearchInput', 'นัดเซ็นสัญญา'); click('#scSearchGo'); await idle(500); click('#scSearchClear'); await idle(500); return '__RELOAD__'; });
  add('reload-filter', {}, async function () { await openFilter(1000); click($$('#scHFTaskGrid input')[0]); click('#scHFOwnerBtn'); await sleep(250); click($$('#scHFOwnerList .sc-hf-dd-item')[1]); await applyFilter(); return '__RELOAD__'; });
  add('reload-filter-cleared', {}, async function () { await openFilter(1000); click($$('#scHFTaskGrid input')[0]); await applyFilter(); await openFilter(); click('#scHFClear'); await applyFilter(); return '__RELOAD__'; });
  add('reload-date-picker', {}, async function () { await openDp(); click($$('#scDpGrid .sc-dp-month-item')[11]); await idle(500); return '__RELOAD__'; });
  add('reload-today-button', {}, async function () { await nav('next'); await nav('next'); await nav('today'); return '__RELOAD__'; });
  add('reload-everything', {}, async function () { await pickProduct(PRODUCTS.car); await calView('week'); await nav('next'); click('.ld-search-ic'); typeIn('#scSearchInput', 'นัด'); click('#scSearchGo'); await idle(500); await tab('list'); return '__RELOAD__'; });

  /* ============================================================ the shape of the A A A buttons across the tabs and dialogs */
  add('fs-plus-week', {}, 'await calView("week"); fontAdj("2px"); await sleep(800);');
  add('fs-plus-day-dark', { theme: 'dark' }, 'await calView("day"); fontAdj("2px"); await sleep(800);');
  add('fs-minus-week', {}, 'await calView("week"); fontAdj("-2px"); await sleep(800);');
  add('fs-minus-year', {}, 'await calView("year"); fontAdj("-2px"); await sleep(800);');
  add('fs-plus-more-pop', {}, 'fontAdj("2px"); await sleep(700); hover($(".sc-more"), "mouseenter"); await sleep(500);');
  add('fs-plus-board-ctx', {}, 'await tab("board"); fontAdj("2px"); await sleep(700); click($("#scApptBoard .sc-menu-btn")); await sleep(400);');
  add('fs-plus-filter-dd', {}, 'await openFilter(1000); fontAdj("2px"); click("#scHFOwnerBtn"); await sleep(400);');
  add('fs-plus-view-menu', {}, 'fontAdj("2px"); await openViewMenu();');
  add('fs-plus-error', cfg({ failCalendar: true }), 'fontAdj("2px"); await sleep(500);');
  add('fs-minus-wm-view', {}, 'fontAdj("-2px"); click($$("#scCalBody .sc-event")[0]); await sleep(700);');

  /* ============================================================ the first paint while the answers are on their way, and slow views */
  const first = (ready, extra) => ({ ...cfg({ delayMs: 4000 }), ready, settle: 100, wait: 100, readyTimeout: 20000, ...extra });
  const SK = (sel) => "!!document.querySelector('" + sel + "')";
  const state = (over) => seed({ movementTypeId: 1004400740, activityGroupId: 101, calView: 'month', calYear: 2026, calMonth: 9, calDay: 20, tab: 'calendar', filter: null, listSort: 'date_desc', search: '', ...over });
  add('first-paint-month', first(SK('#scCalSkel.skel-month')), async function () {});
  add('first-paint-month-dark', first(SK('#scCalSkel.skel-month'), { theme: 'dark' }), async function () {});
  add('first-paint-month-390', first(SK('#scCalSkel.skel-month'), { w: 390, h: 844 }), async function () {});
  add('first-paint-month-en', first(SK('#scCalSkel.skel-month'), { lang: 'en' }), async function () {});
  add('first-paint-year', both(first(SK('#scCalSkel.skel-year')), state({ calView: 'year' })), async function () {});
  add('first-paint-year-dark', both(first(SK('#scCalSkel.skel-year'), { theme: 'dark' }), state({ calView: 'year' })), async function () {});
  add('first-paint-week', both(first(SK('#scCalSkel.skel-tg')), state({ calView: 'week' })), async function () {});
  add('first-paint-day', both(first(SK('#scCalSkel.skel-tg')), state({ calView: 'day' })), async function () {});
  add('first-paint-day-dark', both(first(SK('#scCalSkel.skel-tg'), { theme: 'dark' }), state({ calView: 'day' })), async function () {});
  add('first-paint-list', both(first(SK('#scApptList .sc-skel-row')), state({ tab: 'list' })), async function () {});
  add('first-paint-list-dark', both(first(SK('#scApptList .sc-skel-row'), { theme: 'dark' }), state({ tab: 'list' })), async function () {});
  add('first-paint-list-390', both(first(SK('#scApptList .sc-skel-row'), { w: 390, h: 844 }), state({ tab: 'list' })), async function () {});
  const slow = (view, extra) => ({ ...cfg({ delayByView: { [view]: 4000 } }), ...extra });
  add('slow-board', slow('board'), async function () { click('.ld-tab[data-tab="board"]'); await sleep(500); });
  add('slow-board-dark', slow('board', { theme: 'dark' }), async function () { click('.ld-tab[data-tab="board"]'); await sleep(500); });
  add('slow-board-390', slow('board', { w: 390, h: 844 }), async function () { click('.ld-tab[data-tab="board"]'); await sleep(500); });
  add('slow-list', slow('list'), async function () { click('.ld-tab[data-tab="list"]'); await sleep(500); });
  add('slow-list-dark', slow('list', { theme: 'dark' }), async function () { click('.ld-tab[data-tab="list"]'); await sleep(500); });
  add('slow-list-sort', slow('list'), async function () { click('.ld-tab[data-tab="list"]'); await sleep(300); click('#scSortBtn'); await sleep(200); click('#scSortDd .ld-dd-item[data-api="order_asc"]'); await sleep(500); });
  add('slow-week', slow('week'), async function () { await openViewMenu(); click('.sc-view-menu .sc-view-item:nth-child(3)'); await sleep(500); });
  add('slow-day', slow('day'), async function () { await openViewMenu(); click('.sc-view-menu .sc-view-item:nth-child(4)'); await sleep(500); });
  add('slow-year', slow('year'), async function () { await openViewMenu(); click('.sc-view-menu .sc-view-item:nth-child(1)'); await sleep(500); });

  /* ============================================================ keys, mid-size screens, dark and English variants of the pop-ups */
  add('key-escape-work-modal', {}, async function () { click($$('#scCalBody .sc-event')[0]); await sleep(500); key('Escape'); await sleep(300); });
  add('key-escape-add-modal', {}, async function () { await addFrom('board', 'appt'); key('Escape'); await sleep(300); });
  add('key-escape-filter', {}, async function () { await openFilter(); key('Escape'); await sleep(300); });
  add('key-escape-date-picker', {}, async function () { await openDp(); key('Escape'); await sleep(300); });
  add('key-escape-search', {}, async function () { click('.ld-search-ic'); key('Escape', $('#scSearchInput')); await sleep(300); });
  add('key-enter-empty-search', {}, async function () { click('.ld-search-ic'); key('Enter', $('#scSearchInput')); await idle(500); });
  add('en-board-ctx', { lang: 'en' }, async function () { await tab('board'); click($('#scApptBoard .sc-menu-btn')); await sleep(300); });
  add('en-list-ctx', { lang: 'en' }, async function () { await tab('list'); click($('#scApptList .sc-menu-btn')); await sleep(300); });
  add('en-month-more-pop', { lang: 'en' }, async function () { hover($('.sc-more'), 'mouseenter'); await sleep(400); });
  add('en-dp-week', { lang: 'en' }, async function () { await calView('week'); await openDp(); });
  add('en-dp-year', { lang: 'en' }, async function () { await calView('year'); await openDp(); });
  add('en-year-day-pop', { lang: 'en' }, async function () { await calView('year'); click('.sc-yr-d.sc-yr-clk'); await idle(600); });
  add('en-wm-view-board', { lang: 'en' }, async function () { await tab('board'); click($('#scApptBoard .sc-card')); await sleep(700); });
  add('en-wm-edit-board', { lang: 'en' }, async function () { await tab('board'); click($('#scApptBoard .sc-menu-btn')); await sleep(200); click($('#scApptBoard .sc-ctx-menu.show .sc-ctx-item')); await sleep(700); });
  add('en-wm-add-customer-open', { lang: 'en' }, async function () { await addFrom('board', 'appt'); click('#ld2AwCustBtn'); await sleep(900); });
  add('en-wm-add-save-fail', { lang: 'en' }, async function () { await addFrom('board', 'appt'); await pickCustomer('', 0); setVal('#ld2AwSubject', 'x ~fail'); fillWork({ detail: 'd' }); click('#ld2AwSubmitBtn'); await sleep(1500); });
  add('en-filter-apply-four', { lang: 'en' }, async function () { await openFilter(1000); click('#scHFSaleGroupBtn'); await sleep(250); click($$('#scHFSaleGroupList .sc-hf-dd-item')[1]); click($$('#scHFApptGrid input')[0]); await applyFilter(); });
  add('en-board-drag-fail', both(cfg({ failEdit: true }), { lang: 'en' }), async function () { await tab('board'); await dnd($('#scApptBoard .sc-card'), $$('#scApptBoard .sc-col')[1]); await idle(900); });
  add('en-perm-readonly-board', both(perm('readonly'), { lang: 'en' }), async function () { await tab('board'); });
  add('en-search-none', { lang: 'en' }, async function () { click('.ld-search-ic'); typeIn('#scSearchInput', 'ไม่มีข้อมูลนี้แน่นอน'); click('#scSearchGo'); await idle(700); });
  add('wm-view-month-appt-768', { w: 768, h: 1024 }, async function () { click($$('#scCalBody .sc-event')[0]); await sleep(700); });
  add('wm-add-board-appt-768', { w: 768, h: 1024 }, async function () { await addFrom('board', 'appt'); });
  add('wm-add-customer-open-768', { w: 768, h: 1024 }, async function () { await addFrom('board', 'appt'); click('#ld2AwCustBtn'); await sleep(900); });
  add('wm-edit-board-dark', { theme: 'dark' }, async function () { await tab('board'); click($('#scApptBoard .sc-menu-btn')); await sleep(200); click($('#scApptBoard .sc-ctx-menu.show .sc-ctx-item')); await sleep(700); });
  add('wm-edit-list-390', { w: 390, h: 844 }, async function () { await tab('list'); click($('#scApptList .sc-menu-btn')); await sleep(200); click($('#scApptList .sc-ctx-menu.show .sc-ctx-item')); await sleep(700); });
  add('wm-view-board-dark', { theme: 'dark' }, async function () { await tab('board'); click($('#scApptBoard .sc-card')); await sleep(700); });
  add('wm-add-customer-filter-dark', { theme: 'dark' }, async function () { await addFrom('board', 'appt'); click('#ld2AwCustBtn'); await sleep(900); click($$('#ld2AwCustBody .wm-cust-pill')[1]); await sleep(300); });
  add('fs-plus-wm-add-customer', {}, 'await addFrom("board", "appt"); fontAdj("2px"); await sleep(700); click("#ld2AwCustBtn"); await sleep(900);');
  add('fs-plus-board-1024', { w: 1024, h: 768 }, 'await tab("board"); fontAdj("2px"); await sleep(800);');
  add('fs-minus-list-390', { w: 390, h: 844 }, 'await tab("list"); fontAdj("-2px"); await sleep(800);');
  add('filter-dd-search-dark', { theme: 'dark' }, async function () { await openFilter(1000); click('#scHFOwnerBtn'); await sleep(300); typeIn('#scHFOwnerList .sc-hf-dd-search input', 'สม'); await sleep(300); });
  add('filter-open-board-390', { w: 390, h: 844 }, async function () { await tab('board'); await openFilter(); });
  add('month-prev-390-fs-plus', { w: 390, h: 844 }, 'fontAdj("2px"); await nav("prev"); await sleep(600);');
  add('week-event-open-dark', { theme: 'dark' }, async function () { await calView('week'); click(evs('.sc-tg-cell .sc-event')[0]); await sleep(700); });
}
