// Scenarios of the Activities comparison. Each function is run INSIDE the page under test (Java replica / Angular app) with
// (sleep, side, win) in scope, after the prelude of lib/scenario-pre.mjs and the page prelude (`pre` in page.mjs).
// add(name, opts, fn):  opts = { w, h, theme, lang, perm, denyRoles, reloads, settle, wait, roots, frames, ready }
//   perm + denyRoles: the permission set (page.mjs PERMS) — the Java page is built for it, the Angular session loses the roles
//
// The mock leads the scenarios rely on (see activities.mock.ts): product "สินเชื่อบ้าน" (house, default) has 120 leads, 20 per page; the
// first row of the default list is lead 43 (no owner on some rows, several with more than one workflow group); "สินเชื่อรถยนต์" (car)
// and "ที่ปรึกษาการเงิน" (adviser: no workflow step → table B); lead ids divisible by 53 fail to open (500).
import { PERMS } from './page.mjs';

export default function (add) {
  const perm = (key) => ({ perm: key, denyRoles: PERMS[key] });
  const q = (s) => JSON.stringify(s);

  /* ============================================================ first paint, themes, viewports, fonts, language */
  add('overview', {}, async function () {});
  add('overview-dark', { theme: 'dark' }, async function () {});
  [[1920, 1080], [1600, 900], [1440, 900], [1280, 720], [1024, 768], [768, 1024], [600, 900], [390, 844]].forEach(function (s) {
    add('overview-' + s[0], { w: s[0], h: s[1] }, async function () {});
  });
  add('overview-dark-390', { theme: 'dark', w: 390, h: 844 }, async function () {});
  add('overview-dark-768', { theme: 'dark', w: 768, h: 1024 }, async function () {});
  add('en-overview', { lang: 'en' }, async function () {});
  add('en-overview-dark', { lang: 'en', theme: 'dark' }, async function () {});
  add('en-overview-390', { lang: 'en', w: 390, h: 844 }, async function () {});
  add('fs-plus', {}, 'fontAdj("2px"); await sleep(800);');
  add('fs-minus', {}, 'fontAdj("-2px"); await sleep(800);');
  add('fs-plus-390', { w: 390, h: 844 }, 'fontAdj("2px"); await sleep(800);');
  add('fs-plus-dark', { theme: 'dark' }, 'fontAdj("2px"); await sleep(800);');

  /* ============================================================ product dropdown, the three layouts */
  add('product-menu', {}, async function () { await openProductMenu(); });
  add('product-menu-dark', { theme: 'dark' }, async function () { await openProductMenu(); });
  add('product-car', {}, async function () { await openProductMenu(); await pickProduct(PRODUCTS.car); });
  add('product-car-pref', {}, async function () { await openProductMenu(); await pickProduct(PRODUCTS.car); });
  add('product-adviser', {}, async function () { await openProductMenu(); await pickProduct(PRODUCTS.adviser); });
  add('product-adviser-dark', { theme: 'dark' }, async function () { await openProductMenu(); await pickProduct(PRODUCTS.adviser); });
  add('product-adviser-390', { w: 390, h: 844 }, async function () { await openProductMenu(); await pickProduct(PRODUCTS.adviser); });
  add('product-adviser-then-house', {}, async function () { await pickProduct(PRODUCTS.adviser); await pickProduct(PRODUCTS.house); });
  add('product-empty', {}, async function () { await pickProduct(PRODUCTS.empty); });
  add('product-empty-dark', { theme: 'dark' }, async function () { await pickProduct(PRODUCTS.empty); });
  add('product-forbidden', {}, async function () { await pickProduct(PRODUCTS.forbidden); });
  add('en-product-forbidden', { lang: 'en' }, async function () { await pickProduct(PRODUCTS.forbidden); });
  add('product-tag-then-adviser', {}, async function () {
    click('.ac-tgl-group .ac-tgl:nth-child(2)'); await sleep(500);
    await pickProduct(PRODUCTS.adviser);
  });

  /* ============================================================ statistics 😊 / 🏷 */
  add('stats-tag', {}, async function () { click('.ac-tgl-group .ac-tgl:nth-child(2)'); await sleep(500); });
  add('stats-tag-dark', { theme: 'dark' }, async function () { click('.ac-tgl-group .ac-tgl:nth-child(2)'); await sleep(500); });
  add('stats-tag-390', { w: 390, h: 844 }, async function () { click('.ac-tgl-group .ac-tgl:nth-child(2)'); await sleep(500); });
  add('stats-tag-1024', { w: 1024, h: 768 }, async function () { click('.ac-tgl-group .ac-tgl:nth-child(2)'); await sleep(500); });
  add('stats-tag-next', {}, async function () { click('.ac-tgl-group .ac-tgl:nth-child(2)'); await sleep(400); click('#acWfNext'); await sleep(400); click('#acWfNext'); await sleep(400); });
  add('stats-tag-prev', {}, async function () { click('.ac-tgl-group .ac-tgl:nth-child(2)'); await sleep(400); click('#acWfNext'); click('#acWfNext'); await sleep(300); click('#acWfPrev'); await sleep(400); });
  add('stats-tag-car', {}, async function () { await pickProduct(PRODUCTS.car); click('.ac-tgl-group .ac-tgl:nth-child(2)'); await sleep(500); });
  add('stats-tag-back', {}, async function () { click('.ac-tgl-group .ac-tgl:nth-child(2)'); await sleep(300); click('.ac-tgl-group .ac-tgl:nth-child(1)'); await sleep(400); });
  add('stats-tag-disabled-adviser', {}, async function () { await pickProduct(PRODUCTS.adviser); click('.ac-tgl-group .ac-tgl:nth-child(2)'); await sleep(500); });
  add('stats-tag-table1', {}, async function () { click('.ac-tgl-group .ac-tgl:nth-child(2)'); await sleep(300); await subtab(1, 600); });
  add('stats-tag-table1-dark', { theme: 'dark' }, async function () { click('.ac-tgl-group .ac-tgl:nth-child(2)'); await sleep(300); await subtab(1, 600); });

  /* ============================================================ the tables */
  add('table1', {}, async function () { await subtab(1, 700); });
  add('table1-dark', { theme: 'dark' }, async function () { await subtab(1, 700); });
  add('table1-1024', { w: 1024, h: 768 }, async function () { await subtab(1, 700); });
  add('table1-390', { w: 390, h: 844 }, async function () { await subtab(1, 700); });
  add('table1-fs-plus', {}, async function () { fontAdj('2px'); await subtab(1, 700); });
  add('table1-car', {}, async function () { await pickProduct(PRODUCTS.car); await subtab(1, 700); });
  add('table1-back', {}, async function () { await subtab(1, 500); await subtab(0, 500); });
  add('en-table1', { lang: 'en' }, async function () { await subtab(1, 700); });
  add('tableB-dark', { theme: 'dark' }, async function () { await pickProduct(PRODUCTS.adviser); });
  add('tableB-row', {}, async function () { await pickProduct(PRODUCTS.adviser); click('#acBodyB tr.p-row:nth-child(3)'); await sleep(1200); });
  add('tableB-1024', { w: 1024, h: 768 }, async function () { await pickProduct(PRODUCTS.adviser); });
  add('table-drag-scroll', { w: 1024, h: 768 }, async function () {
    var s = $('.ac-table-scroll'), r = s.getBoundingClientRect();
    var ev = function (t, x, y) { return new MouseEvent(t, { bubbles: true, clientX: x, clientY: y, button: 0 }); };
    s.dispatchEvent(ev('mousedown', r.left + 400, r.top + 120));
    document.dispatchEvent(ev('mousemove', r.left + 300, r.top + 120));
    document.dispatchEvent(ev('mousemove', r.left + 150, r.top + 120));
    document.dispatchEvent(ev('mouseup', r.left + 150, r.top + 120));
    await sleep(500);
  });

  /* ---- expanding the rows ---- */
  add('expand-first', {}, async function () { click('#acBody0 tr.p-row .ac-chev-btn'); await sleep(1000); });
  add('expand-first-dark', { theme: 'dark' }, async function () { click('#acBody0 tr.p-row .ac-chev-btn'); await sleep(1000); });
  add('expand-collapse', {}, async function () { var b = $('#acBody0 tr.p-row .ac-chev-btn'); click(b); await sleep(800); click(b); await sleep(500); });
  add('expand-reopen', {}, async function () { var b = $('#acBody0 tr.p-row .ac-chev-btn'); click(b); await sleep(800); click(b); await sleep(300); click(b); await sleep(500); });
  add('expand-three', {}, async function () { $$('#acBody0 tr.p-row .ac-chev-btn').slice(0, 3).forEach(click); await sleep(1500); });
  add('expand-multigroup', {}, async function () {
    var r = $$('#acBody0 tr.p-row').filter(function (t) { return t.querySelector('.ac-chev-btn'); })[1]; click(r.querySelector('.ac-chev-btn')); await sleep(1200);
  });
  add('expand-all', {}, async function () { click('#acExpandAll'); await sleep(3000); });
  add('expand-all-dark', { theme: 'dark' }, async function () { click('#acExpandAll'); await sleep(3000); });
  add('expand-all-collapse', {}, async function () { click('#acExpandAll'); await sleep(2800); click('#acExpandAll'); await sleep(600); });
  add('expand-all-twice-fast', {}, async function () { click('#acExpandAll'); click('#acExpandAll'); await sleep(3000); });
  add('expand-child-click', {}, async function () { click('#acBody0 tr.p-row .ac-chev-btn'); await sleep(1000); click('#acBody0 tr.c-row'); await sleep(1500); });
  add('expand-adviser-no-children', {}, async function () { await pickProduct(PRODUCTS.adviser); click('#acBodyB tr.p-row'); await sleep(900); });

  /* ============================================================ the detail panel */
  add('panel-second-row', {}, async function () { click($$('#acBody0 tr.p-row')[1]); await sleep(1200); });
  add('panel-second-row-dark', { theme: 'dark' }, async function () { click($$('#acBody0 tr.p-row')[1]); await sleep(1200); });
  add('panel-no-owner', {}, async function () { click($$('#acBody0 tr.p-row').filter(function (r) { return !r.querySelectorAll('td')[2].textContent.trim(); })[0]); await sleep(1200); });
  add('panel-tab-appt', {}, async function () { click('.ac-panel-tab[data-tab="appt"]'); await sleep(500); });
  add('panel-tab-appt-dark', { theme: 'dark' }, async function () { click('.ac-panel-tab[data-tab="appt"]'); await sleep(500); });
  add('panel-tab-appt-390', { w: 390, h: 844 }, async function () { click('.ac-panel-tab[data-tab="appt"]'); await sleep(500); });
  add('panel-tab-appt-back', {}, async function () { click('.ac-panel-tab[data-tab="appt"]'); await sleep(300); click('.ac-panel-tab[data-tab="detail"]'); await sleep(400); });
  add('panel-appt-next', {}, async function () {
    for (var i = 0; i < 6; i++) { click($$('#acBody0 tr.p-row')[i]); await sleep(1100); if ($$('#acApptList .ac-dot-sm, #acApptList span[style*="border-radius:50%"]').length > 1) break; }
    click('.ac-panel-tab[data-tab="appt"]'); await sleep(300);
    var n = $('#acApptList button[onclick="window.acApptNext()"]'); if (n) { click(n); await sleep(400); }
  });
  add('panel-appt-prev-wrap', {}, async function () {
    for (var i = 0; i < 6; i++) { click($$('#acBody0 tr.p-row')[i]); await sleep(1100); if ($('#acApptList button[onclick="window.acApptNext()"]')) break; }
    click('.ac-panel-tab[data-tab="appt"]'); await sleep(300);
    var n = $('#acApptList button[onclick="window.acApptNext()"]'); if (n) { click(n); await sleep(300); }
    var p = $('#acApptList button[onclick="window.acApptPrev()"]'); if (p) { click(p); await sleep(300); }
  });
  add('panel-close', {}, async function () { click('#acPanelClose'); await sleep(600); });
  add('panel-close-dark', { theme: 'dark' }, async function () { click('#acPanelClose'); await sleep(600); });
  add('panel-close-reopen', {}, async function () { click('#acPanelClose'); await sleep(500); click($$('#acBody0 tr.p-row')[3]); await sleep(1200); });
  add('panel-close-subtab', {}, async function () { await subtab(1, 800); });
  add('panel-390', { w: 390, h: 844 }, async function () { click($$('#acBody0 tr.p-row')[2]); await sleep(1200); });
  add('panel-768', { w: 768, h: 1024 }, async function () { click($$('#acBody0 tr.p-row')[2]); await sleep(1200); });
  add('panel-1024', { w: 1024, h: 768 }, async function () { click($$('#acBody0 tr.p-row')[2]); await sleep(1200); });
  add('panel-table1-row', {}, async function () { await subtab(1, 600); click($$('#acBody1 tr.p-row')[2]); await sleep(1300); });
  add('panel-table1-row-multi', {}, async function () { await subtab(1, 600); click($$('#acBody1 tr.p-row')[5]); await sleep(1300); });
  add('panel-car', {}, async function () { await pickProduct(PRODUCTS.car); click($$('#acBody0 tr.p-row')[1]); await sleep(1300); });
  add('panel-closed-lead', {}, async function () { click('#acSwClosed'); await sleep(2500); click($$('#acBody0 tr.p-row')[0]); await sleep(1300); });
  add('panel-detail-error', {}, async function () { await clickLead(106); await sleep(1500); });
  add('panel-detail-error-twice', {}, async function () { await clickLead(106); await sleep(300); click($$('#acBody0 tr.p-row')[1]); await sleep(300); await clickLead(106); await sleep(1200); });
  add('panel-goto-lead', { roots: [] }, async function (sleep, side) { captureNav(side); click('.ac-goto-btn'); await sleep(800); });
  add('panel-goto-lead-child', { roots: [] }, async function (sleep, side) {
    captureNav(side); click('#acBody0 tr.p-row .ac-chev-btn'); await sleep(900); click('#acBody0 tr.c-row'); await sleep(1300); click('.ac-goto-btn'); await sleep(800);
  });
  add('panel-goto-lead-ext-appt', { roots: [] }, async function (sleep, side) { captureNav(side); click('.ac-panel-tab[data-tab="appt"]'); await sleep(300); click('#acApptExt'); await sleep(800); });
  add('panel-goto-lead-ext-task', { roots: [] }, async function (sleep, side) { captureNav(side); click('.ac-panel-tab[data-tab="appt"]'); await sleep(300); click('#acTaskExt'); await sleep(800); });
  add('panel-goto-lead-closed-panel', { roots: [] }, async function (sleep, side) { captureNav(side); click('#acPanelClose'); await sleep(400); window.acGotoLead(); await sleep(600); });
  add('panel-history-filter-btn', {}, async function () { click('#acHistFilterBtn'); await sleep(1000); });

  /* ============================================================ sort, search */
  ['date_asc', 'name_asc', 'name_desc', 'date_desc'].forEach(function (k) {
    add('sort-' + k, {}, 'click("#acSortBtn"); await sleep(250); click(\'.ac-sort-item[data-sort="' + k + '"]\'); await sleep(1800);');
  });
  add('sort-menu', {}, async function () { click('#acSortBtn'); await sleep(300); });
  add('sort-menu-dark', { theme: 'dark' }, async function () { click('#acSortBtn'); await sleep(300); });
  add('sort-menu-close', {}, async function () { click('#acSortBtn'); await sleep(300); click('.ac-main-card'); await sleep(300); });
  add('sort-name-table1', {}, async function () { await subtab(1, 500); click('#acSortBtn'); await sleep(250); click('.ac-sort-item[data-sort="name_asc"]'); await sleep(1800); });
  add('sort-name-adviser', {}, async function () { await pickProduct(PRODUCTS.adviser); click('#acSortBtn'); await sleep(250); click('.ac-sort-item[data-sort="name_desc"]'); await sleep(1800); });
  add('search-open', {}, async function () { click('#acSearch .ac-search-ic'); await sleep(400); });
  add('search-open-dark', { theme: 'dark' }, async function () { click('#acSearch .ac-search-ic'); await sleep(400); });
  add('search-open-390', { w: 390, h: 844 }, async function () { click('#acSearch .ac-search-ic'); await sleep(400); });
  add('search-open-600', { w: 600, h: 800 }, async function () { click('#acSearch .ac-search-ic'); await sleep(400); });
  add('search-text', {}, async function () { click('#acSearch .ac-search-ic'); typeIn('#acSearchInput', 'สมชาย'); await sleep(1800); });
  add('search-enter', {}, async function () { click('#acSearch .ac-search-ic'); $('#acSearchInput').value = 'ธนากร'; key('Enter', $('#acSearchInput')); await sleep(1600); });
  add('search-go', {}, async function () { click('#acSearch .ac-search-ic'); $('#acSearchInput').value = 'วิชัย'; click('#acSearchGo'); await sleep(1600); });
  add('search-no-result', {}, async function () { click('#acSearch .ac-search-ic'); typeIn('#acSearchInput', 'ไม่มีชื่อนี้'); await sleep(1800); });
  add('search-no-result-dark', { theme: 'dark' }, async function () { click('#acSearch .ac-search-ic'); typeIn('#acSearchInput', 'ไม่มีชื่อนี้'); await sleep(1800); });
  add('search-no-result-table1', {}, async function () { await subtab(1, 400); click('#acSearch .ac-search-ic'); typeIn('#acSearchInput', 'ไม่มีชื่อนี้'); await sleep(1800); });
  add('search-no-result-adviser', {}, async function () { await pickProduct(PRODUCTS.adviser); click('#acSearch .ac-search-ic'); typeIn('#acSearchInput', 'ไม่มีชื่อนี้'); await sleep(1800); });
  add('search-clear', {}, async function () { click('#acSearch .ac-search-ic'); typeIn('#acSearchInput', 'สมชาย'); await sleep(1500); click('#acSearchClear'); await sleep(1600); });
  add('search-escape', {}, async function () { click('#acSearch .ac-search-ic'); typeIn('#acSearchInput', 'สมชาย'); await sleep(1500); key('Escape', $('#acSearchInput')); await sleep(1600); });
  add('search-debounce-typing', {}, async function () { click('#acSearch .ac-search-ic'); typeIn('#acSearchInput', 'ส'); await sleep(100); typeIn('#acSearchInput', 'สม'); await sleep(100); typeIn('#acSearchInput', 'สมช'); await sleep(1800); });
  // an exception of ActivityListServlet (HTTP 500 + the empty list): the service layer swallows every exception (fetchActivityListJson catches all) and no REST answer can make it throw — live: false
  add('search-server-error', { live: false }, async function () { click('#acSearch .ac-search-ic'); typeIn('#acSearchInput', '~500'); await sleep(1800); });
  add('search-backend-refuses', {}, async function () { click('#acSearch .ac-search-ic'); typeIn('#acSearchInput', '~err'); await sleep(1800); });
  add('search-suggest', {}, async function () { click('#acSearch .ac-search-ic'); $('#acSearchInput').focus(); typeIn('#acSearchInput', 'สม'); await sleep(1500); });
  add('search-suggest-dark', { theme: 'dark' }, async function () { click('#acSearch .ac-search-ic'); $('#acSearchInput').focus(); typeIn('#acSearchInput', 'สม'); await sleep(1500); });
  add('search-suggest-pick', {}, async function () {
    click('#acSearch .ac-search-ic'); $('#acSearchInput').focus(); typeIn('#acSearchInput', 'สม'); await sleep(1500);
    var it = $$('body > .ods-list').filter(function (l) { return l.getBoundingClientRect().height > 0; }).map(function (l) { return l.querySelector('.ods-item'); })[0]; if (it) { it.dispatchEvent(new MouseEvent('mousedown', { bubbles: true })); it.click(); } await sleep(1600);
  });
  add('search-after-sort', {}, async function () { click('#acSortBtn'); click('.ac-sort-item[data-sort="name_asc"]'); await sleep(1500); click('#acSearch .ac-search-ic'); typeIn('#acSearchInput', 'ธนากร'); await sleep(1800); });

  /* ============================================================ infinite scroll */
  add('scroll-page2', {}, async function () { await scrollTable(); });
  add('scroll-page3', {}, async function () { await scrollTable(); await scrollTable(); });
  add('scroll-page6-end', {}, async function () { for (var i = 0; i < 7; i++) await scrollTable(undefined, 1000); });
  add('scroll-loading-bar', {}, async function () { var s = $('.ac-table-scroll'); s.scrollTop = s.scrollHeight; s.dispatchEvent(new Event('scroll')); await sleep(60); });
  add('scroll-page2-table1', {}, async function () { await subtab(1, 500); await scrollTable(); });
  add('scroll-page2-adviser', {}, async function () { await pickProduct(PRODUCTS.adviser); await scrollTable(); });
  add('scroll-then-filter', {}, async function () { await scrollTable(); await sleep(400); click('#acSortBtn'); click('.ac-sort-item[data-sort="date_asc"]'); await sleep(1800); });
  add('scroll-expand-all', {}, async function () { await scrollTable(); click('#acExpandAll'); await sleep(4500); });
  add('scroll-tall-viewport', { h: 1700 }, async function () {});
  add('scroll-autofill-short', { h: 2400 }, async function () { await sleep(1500); });
  add('scroll-top-after', {}, async function () { await scrollTable(); await sleep(300); await scrollTable(0, 500); });
  add('scroll-then-product', {}, async function () { await scrollTable(); await pickProduct(PRODUCTS.car); });

  /* ============================================================ the filter dialog */
  add('filter-open', {}, async function () { await openFilter(); });
  add('filter-open-dark', { theme: 'dark' }, async function () { await openFilter(); });
  add('filter-open-390', { w: 390, h: 844 }, async function () { await openFilter(); });
  add('filter-open-768', { w: 768, h: 1024 }, async function () { await openFilter(); });
  add('filter-open-fs-plus', {}, async function () { fontAdj('2px'); await openFilter(); });
  add('en-filter-open', { lang: 'en' }, async function () { await openFilter(); });
  add('filter-from-history-icon', {}, async function () { click('#acHistFilterBtn'); await sleep(1000); click('#acFilterX'); await sleep(300); });
  add('filter-dropdown-team', {}, async function () { await openFilter(); click('#acFilterOverlay .ods-btn:not([disabled])'); await sleep(300); });
  add('filter-close-x', {}, async function () { await openFilter(); click('#acFilterX'); await sleep(400); });
  add('filter-close-overlay', {}, async function () { await openFilter(); click('#acFilterOverlay'); await sleep(400); });
  add('filter-switch-closed', {}, async function () { await openFilter(); click('#acSwClosed'); await sleep(2500); });
  add('filter-switch-closed-dark', { theme: 'dark' }, async function () { await openFilter(); click('#acSwClosed'); await sleep(2500); });
  add('filter-switch-closed-off', {}, async function () { await openFilter(); click('#acSwClosed'); await sleep(2200); click('#acSwClosed'); await sleep(2200); });
  add('filter-date-from', {}, async function () { await openFilter(); typeIn('#acContactFrom', '2026-09-20'); await sleep(400); });
  add('filter-date-both', {}, async function () { await openFilter(); typeIn('#acContactFrom', '2026-09-20'); typeIn('#acContactTo', '2026-10-05'); await sleep(400); });
  add('filter-date-swapped', {}, async function () { await openFilter(); typeIn('#acContactFrom', '2026-10-10'); typeIn('#acContactTo', '2026-09-01'); await sleep(400); });
  add('filter-date-dark', { theme: 'dark' }, async function () { await openFilter(); typeIn('#acContactFrom', '2026-09-20'); await sleep(400); });
  add('filter-apply-dates', {}, async function () { await openFilter(); typeIn('#acContactFrom', '2026-09-20'); typeIn('#acContactTo', '2026-10-05'); click('#acBtnFilter'); await sleep(2200); });
  add('filter-apply-dates-390', { w: 390, h: 844 }, async function () { await openFilter(); typeIn('#acContactFrom', '2026-09-20'); typeIn('#acContactTo', '2026-10-05'); click('#acBtnFilter'); await sleep(2200); });
  add('filter-apply-team-a', {}, async function () { await openFilter(); pick('#acFTeam', '1004400001'); click('#acBtnFilter'); await sleep(2200); });
  add('filter-apply-team-b', {}, async function () { await openFilter(); pick('#acFTeam', '1004400002'); click('#acBtnFilter'); await sleep(2200); });
  add('filter-apply-owner', {}, async function () { await openFilter(); pick('#acFOwner', '1003'); click('#acBtnFilter'); await sleep(2200); });
  add('filter-apply-owner-table1', {}, async function () { await subtab(1, 400); await openFilter(); pick('#acFOwner', '1003'); click('#acBtnFilter'); await sleep(2200); });
  add('filter-apply-close-closed', {}, async function () { await openFilter(); pick('#acFClose', 'closed'); click('#acBtnFilter'); await sleep(2500); });
  add('filter-apply-close-open', {}, async function () { await openFilter(); pick('#acFClose', 'open'); click('#acBtnFilter'); await sleep(2200); });
  add('filter-apply-combo', {}, async function () {
    await openFilter(); pick('#acFTeam', '1004400002'); pick('#acFOwner', '1004'); typeIn('#acContactFrom', '2026-08-01'); click('#acBtnFilter'); await sleep(2400);
  });
  add('filter-apply-no-result', {}, async function () {
    await openFilter(); pick('#acFOwner', '1008'); typeIn('#acContactFrom', '2026-10-19'); typeIn('#acContactTo', '2026-10-20'); click('#acBtnFilter'); await sleep(2400);
  });
  add('filter-apply-no-result-dark', { theme: 'dark' }, async function () {
    await openFilter(); pick('#acFOwner', '1008'); typeIn('#acContactFrom', '2026-10-19'); typeIn('#acContactTo', '2026-10-20'); click('#acBtnFilter'); await sleep(2400);
  });
  add('filter-apply-adviser', {}, async function () { await pickProduct(PRODUCTS.adviser); await openFilter(); pick('#acFTeam', '1004400001'); click('#acBtnFilter'); await sleep(2200); });
  add('filter-clear', {}, async function () {
    await openFilter(); pick('#acFTeam', '1004400002'); pick('#acFOwner', '1004'); typeIn('#acContactFrom', '2026-08-01'); click('#acSwClosed'); await sleep(2200); click('#acBtnClear'); await sleep(2400);
  });
  add('filter-province-district', {}, async function () { await openFilter(); pick('#acFProvince', '10'); await sleep(900); });
  add('filter-keeps-values', {}, async function () { await openFilter(); pick('#acFTeam', '1004400002'); click('#acBtnFilter'); await sleep(2000); await openFilter(); });
  add('filter-then-scroll', {}, async function () { await openFilter(); pick('#acFTeam', '1004400001'); click('#acBtnFilter'); await sleep(2200); await scrollTable(); });
  add('filter-sort-search-combo', {}, async function () {
    click('#acSortBtn'); click('.ac-sort-item[data-sort="name_asc"]'); await sleep(1500);
    await openFilter(); pick('#acFTeam', '1004400001'); click('#acBtnFilter'); await sleep(2000);
  });

  /* ============================================================ add contact dialog */
  add('contact-open', {}, async function () { click('#acAddContactBtn'); await sleep(500); });
  add('contact-open-dark', { theme: 'dark' }, async function () { click('#acAddContactBtn'); await sleep(500); });
  add('contact-open-390', { w: 390, h: 844 }, async function () { click('#acAddContactBtn'); await sleep(500); });
  add('contact-open-600', { w: 600, h: 800 }, async function () { click('#acAddContactBtn'); await sleep(500); });
  add('contact-open-fs-plus', {}, async function () { fontAdj('2px'); click('#acAddContactBtn'); await sleep(500); });
  add('en-contact-open', { lang: 'en' }, async function () { click('#acAddContactBtn'); await sleep(500); });
  ['manual', 'call_out', 'call_in', 'sms', 'email', 'facebook', 'line', 'whatsapp'].forEach(function (c) {
    add('contact-pill-' + c, {}, 'click("#acAddContactBtn"); await sleep(300); click(\'#acContactTypes .ac-ct-pill[data-channel="' + c + '"]\'); await sleep(300);');
  });
  add('contact-pill-dark', { theme: 'dark' }, async function () { click('#acAddContactBtn'); await sleep(300); click('#acContactTypes .ac-ct-pill[data-channel="line"]'); await sleep(300); });
  add('contact-reopen-resets', {}, async function () {
    click('#acAddContactBtn'); await sleep(300); click('#acContactTypes .ac-ct-pill[data-channel="sms"]'); typeIn('#acContactText', 'ข้อความทดสอบ'); click('#acContactX'); await sleep(300); click('#acAddContactBtn'); await sleep(400);
  });
  add('contact-close-x', {}, async function () { click('#acAddContactBtn'); await sleep(300); click('#acContactX'); await sleep(400); });
  add('contact-close-overlay', {}, async function () { click('#acAddContactBtn'); await sleep(300); click('#acContactOverlay'); await sleep(400); });
  add('contact-empty-save', {}, async function () { click('#acAddContactBtn'); await sleep(300); click('#acContactSave'); await sleep(900); });
  add('contact-empty-save-dark', { theme: 'dark' }, async function () { click('#acAddContactBtn'); await sleep(300); click('#acContactSave'); await sleep(900); });
  add('en-contact-empty-save', { lang: 'en' }, async function () { click('#acAddContactBtn'); await sleep(300); click('#acContactSave'); await sleep(900); });
  add('contact-no-lead', {}, async function () { click('#acPanelClose'); await sleep(300); click('#acAddContactBtn'); await sleep(300); typeIn('#acContactText', 'ข้อความ'); click('#acContactSave'); await sleep(900); });
  add('contact-save', {}, async function () {
    click('#acAddContactBtn'); await sleep(300); click('#acContactTypes .ac-ct-pill[data-channel="call_out"]'); typeIn('#acContactText', 'โทรติดตามผลการอนุมัติ');
    typeIn('#acContactRefTime', '2026-10-19T10:30'); click('#acContactSave'); await sleep(2800);
  });
  add('contact-save-dark', { theme: 'dark' }, async function () {
    click('#acAddContactBtn'); await sleep(300); click('#acContactTypes .ac-ct-pill[data-channel="line"]'); typeIn('#acContactText', 'ส่งไลน์สรุปข้อเสนอ');
    typeIn('#acContactRefTime', '2026-10-19T14:05'); click('#acContactSave'); await sleep(2800);
  });
  add('contact-save-table1', {}, async function () {
    await subtab(1, 500); click($$('#acBody1 tr.p-row')[1]); await sleep(1200);
    click('#acAddContactBtn'); await sleep(300); click('#acContactTypes .ac-ct-pill[data-channel="email"]'); typeIn('#acContactText', 'ส่งอีเมลใบเสนอราคา'); typeIn('#acContactRefTime', '2026-10-19T09:00'); click('#acContactSave'); await sleep(2800);
  });
  add('contact-save-visible-row-counts', {}, async function () {
    click('#acAddContactBtn'); await sleep(300); click('#acContactTypes .ac-ct-pill[data-channel="whatsapp"]'); typeIn('#acContactText', 'แจ้งผ่าน WhatsApp'); typeIn('#acContactRefTime', '2026-10-20T08:15'); click('#acContactSave'); await sleep(2800);
  });
  add('contact-save-no-owner', {}, async function () {
    var r = $$('#acBody0 tr.p-row').filter(function (t) { return !t.querySelectorAll('td')[2].textContent.trim(); })[0]; click(r); await sleep(1300);
    click('#acAddContactBtn'); await sleep(300); typeIn('#acContactText', 'ลูกค้าไม่มีผู้รับผิดชอบ มอบหมายอัตโนมัติ'); typeIn('#acContactRefTime', '2026-10-19T11:00'); click('#acContactSave'); await sleep(3200);
  });
  add('contact-save-fail', {}, async function () {
    click('#acAddContactBtn'); await sleep(300); typeIn('#acContactText', 'ทดสอบ ~fail'); click('#acContactSave'); await sleep(1500);
  });
  add('contact-save-fail-dark', { theme: 'dark' }, async function () {
    click('#acAddContactBtn'); await sleep(300); typeIn('#acContactText', 'ทดสอบ ~fail'); click('#acContactSave'); await sleep(1500);
  });
  add('contact-save-busy', {}, async function () { click('#acAddContactBtn'); await sleep(300); typeIn('#acContactText', 'ทดสอบ'); click('#acContactSave'); await sleep(40); });
  add('contact-noadd-perm', { ...perm('noadd') }, async function () {});
  add('contact-nohist-perm', { ...perm('nohist') }, async function () {});

  /* ---- the fallback add appointment / task dialog of the page (used when the work modal is missing) ---- */
  add('item-open-appt', {}, async function () { delete window.ldOpenAddAppt; click('#acAddApptBtn'); await sleep(500); });
  add('item-open-task-dark', { theme: 'dark' }, async function () { delete window.ldOpenAddWork; click('.ac-panel-tab[data-tab="appt"]'); click('#acAddTaskBtn'); await sleep(500); });
  add('item-empty-save', {}, async function () { delete window.ldOpenAddAppt; click('#acAddApptBtn'); await sleep(300); click('#acItemSave'); await sleep(900); });
  add('item-save', {}, async function () {
    delete window.ldOpenAddAppt; click('#acAddApptBtn'); await sleep(300); typeIn('#acItemName', 'นัดตรวจเอกสาร'); typeIn('#acItemDate', '2026-10-25'); typeIn('#acItemTime', '10:00'); typeIn('#acItemDetail', 'ตรวจเอกสารที่สาขา');
    click('#acItemSave'); await sleep(2000);
  });
  add('item-save-fail', {}, async function () {
    delete window.ldOpenAddAppt; click('#acAddApptBtn'); await sleep(300); typeIn('#acItemName', 'ทดสอบ ~fail'); typeIn('#acItemDate', '2026-10-25'); click('#acItemSave'); await sleep(1500);
  });
  add('item-close', {}, async function () { delete window.ldOpenAddAppt; click('#acAddApptBtn'); await sleep(300); click('#acItemX'); await sleep(300); });
  add('item-close-overlay', {}, async function () { delete window.ldOpenAddAppt; click('#acAddApptBtn'); await sleep(300); click('#acItemOverlay'); await sleep(300); });

  /* ============================================================ the work modal (rows of the default list: 6 = lead 1 with 3 appointments and
     3 tasks, 7 = lead 74 without an owner, 1 = lead 67 with 2 groups, 0 = lead 43 with none) */
  var open = function (i) { return 'click($$("#acBody0 tr.p-row")[' + i + ']); await sleep(1300); click(\'.ac-panel-tab[data-tab="appt"]\'); await sleep(300); '; };

  /* ---- add ---- */
  add('wm-add-appt', {}, open(6) + 'click("#acAddApptBtn"); await sleep(600);');
  add('wm-add-appt-dark', { theme: 'dark' }, open(6) + 'click("#acAddApptBtn"); await sleep(600);');
  add('wm-add-appt-390', { w: 390, h: 844 }, open(6) + 'click("#acAddApptBtn"); await sleep(600);');
  add('wm-add-appt-768', { w: 768, h: 1024 }, open(6) + 'click("#acAddApptBtn"); await sleep(600);');
  add('wm-add-appt-fs-plus', {}, open(6) + 'fontAdj("2px"); click("#acAddApptBtn"); await sleep(600);');
  add('wm-add-appt-fs-minus', {}, open(6) + 'fontAdj("-2px"); click("#acAddApptBtn"); await sleep(600);');
  add('en-wm-add-appt', { lang: 'en' }, open(6) + 'click("#acAddApptBtn"); await sleep(600);');
  add('wm-add-task', {}, open(6) + 'click("#acAddTaskBtn"); await sleep(600);');
  add('wm-add-task-dark', { theme: 'dark' }, open(6) + 'click("#acAddTaskBtn"); await sleep(600);');
  add('wm-add-no-owner-lead', {}, open(7) + 'click("#acAddApptBtn"); await sleep(600);');
  add('wm-add-multigroup-lead', {}, open(1) + 'click("#acAddApptBtn"); await sleep(600);');
  add('wm-add-three-groups-lead', {}, open(9) + 'click("#acAddTaskBtn"); await sleep(600);');
  add('wm-add-adviser-lead', {}, 'await pickProduct(PRODUCTS.adviser); click($$("#acBodyB tr.p-row")[2]); await sleep(1300); click(\'.ac-panel-tab[data-tab="appt"]\'); await sleep(300); click("#acAddApptBtn"); await sleep(600);');
  add('wm-add-car-lead', {}, 'await pickProduct(PRODUCTS.car); click($$("#acBody0 tr.p-row")[2]); await sleep(1300); click(\'.ac-panel-tab[data-tab="appt"]\'); await sleep(300); click("#acAddTaskBtn"); await sleep(600);');
  add('wm-add-empty-lead', {}, open(0) + 'click("#acAddApptBtn"); await sleep(600);');
  add('wm-add-allday', {}, open(6) + 'click("#acAddApptBtn"); await sleep(400); click("#ld2AwAllDay"); await sleep(300);');
  add('wm-add-allday-off', {}, open(6) + 'click("#acAddApptBtn"); await sleep(400); click("#ld2AwAllDay"); click("#ld2AwAllDay"); await sleep(300);');
  add('wm-add-status-open', {}, open(6) + 'click("#acAddApptBtn"); await sleep(400); click("#ld2AwStatusBtn"); await sleep(300);');
  add('wm-add-status-open-dark', { theme: 'dark' }, open(6) + 'click("#acAddApptBtn"); await sleep(400); click("#ld2AwStatusBtn"); await sleep(300);');
  add('wm-add-status-pick', {}, open(6) + 'click("#acAddApptBtn"); await sleep(400); click("#ld2AwStatusBtn"); await sleep(200); click("#ld2AwStatusList .wm-sd-item:nth-child(3)"); await sleep(300);');
  add('wm-add-status-task-pick', {}, open(6) + 'click("#acAddTaskBtn"); await sleep(400); click("#ld2AwStatusBtn"); await sleep(200); click("#ld2AwStatusList .wm-sd-item:nth-child(2)"); await sleep(300);');
  add('wm-add-owner-open', {}, open(6) + 'click("#acAddApptBtn"); await sleep(700); click("#ld2AwOwnerBtn"); await sleep(900);');
  add('wm-add-owner-open-dark', { theme: 'dark' }, open(6) + 'click("#acAddApptBtn"); await sleep(700); click("#ld2AwOwnerBtn"); await sleep(900);');
  add('wm-add-owner-search', {}, open(6) + 'click("#acAddApptBtn"); await sleep(700); click("#ld2AwOwnerBtn"); await sleep(900); typeIn("#ld2AwOwnerSearch", "สุ"); await sleep(300);');
  add('wm-add-owner-pick', {}, open(6) + 'click("#acAddApptBtn"); await sleep(700); click("#ld2AwOwnerBtn"); await sleep(900); click("#ld2AwOwnerBody .wm-own-item:nth-child(2)"); await sleep(300);');
  add('wm-add-owner-open-no-owner-lead', {}, open(7) + 'click("#acAddApptBtn"); await sleep(700); click("#ld2AwOwnerBtn"); await sleep(900);');
  add('wm-add-dropdown-closes-on-click-away', {}, open(6) + 'click("#acAddApptBtn"); await sleep(700); click("#ld2AwOwnerBtn"); await sleep(900); click("#ld2AwStatusBtn"); await sleep(300); click(".ld2-aw-title"); await sleep(300);');
  add('wm-add-validate-subject', {}, open(6) + 'click("#acAddApptBtn"); await sleep(500); click("#ld2AwSubmitBtn"); await sleep(900);');
  add('wm-add-validate-subject-dark', { theme: 'dark' }, open(6) + 'click("#acAddApptBtn"); await sleep(500); click("#ld2AwSubmitBtn"); await sleep(900);');
  add('en-wm-add-validate-subject', { lang: 'en' }, open(6) + 'click("#acAddApptBtn"); await sleep(500); click("#ld2AwSubmitBtn"); await sleep(900);');
  add('wm-add-validate-detail', {}, open(6) + 'click("#acAddApptBtn"); await sleep(500); typeIn("#ld2AwSubject", "นัดทดสอบ"); click("#ld2AwSubmitBtn"); await sleep(900);');
  add('wm-add-validate-date', {}, open(6) + 'click("#acAddApptBtn"); await sleep(500); typeIn("#ld2AwDate", ""); typeIn("#ld2AwSubject", "นัดทดสอบ"); typeIn("#ld2AwDetail", "รายละเอียด"); click("#ld2AwSubmitBtn"); await sleep(900);');
  add('wm-add-save-appt', {}, open(6) + 'click("#acAddApptBtn"); await sleep(500); typeIn("#ld2AwDate", "2026-10-28"); typeIn("#ld2AwTime", "14:30"); typeIn("#ld2AwSubject", "นัดเซ็นสัญญาสินเชื่อ"); typeIn("#ld2AwDetail", "เตรียมเอกสารตัวจริงมาด้วย"); click("#ld2AwSubmitBtn"); await sleep(200);');
  add('wm-add-save-appt-success', {}, open(6) + 'click("#acAddApptBtn"); await sleep(500); typeIn("#ld2AwDate", "2026-10-28"); typeIn("#ld2AwTime", "14:30"); typeIn("#ld2AwSubject", "นัดเซ็นสัญญาสินเชื่อ"); typeIn("#ld2AwDetail", "เตรียมเอกสารตัวจริงมาด้วย"); click("#ld2AwSubmitBtn"); await sleep(1100);');
  add('wm-add-save-appt-success-dark', { theme: 'dark' }, open(6) + 'click("#acAddApptBtn"); await sleep(500); typeIn("#ld2AwDate", "2026-10-28"); typeIn("#ld2AwTime", "14:30"); typeIn("#ld2AwSubject", "นัดเซ็นสัญญาสินเชื่อ"); typeIn("#ld2AwDetail", "เตรียมเอกสารตัวจริงมาด้วย"); click("#ld2AwSubmitBtn"); await sleep(1100);');
  add('wm-add-save-appt-reload', { reloads: true }, open(6) + 'click("#acAddApptBtn"); await sleep(500); typeIn("#ld2AwDate", "2026-10-28"); typeIn("#ld2AwTime", "14:30"); typeIn("#ld2AwSubject", "นัดเซ็นสัญญาสินเชื่อ"); typeIn("#ld2AwDetail", "เตรียมเอกสารตัวจริงมาด้วย"); click("#ld2AwSubmitBtn"); await sleep(3900);');
  add('wm-add-save-task-reload', { reloads: true }, open(6) + 'click("#acAddTaskBtn"); await sleep(500); typeIn("#ld2AwDate", "2026-10-22"); click("#ld2AwAllDay"); typeIn("#ld2AwSubject", "ส่งใบเสนอราคา"); typeIn("#ld2AwDetail", "ส่งทางอีเมลก่อนเที่ยง"); click("#ld2AwSubmitBtn"); await sleep(3900);');
  add('wm-add-save-status-success', {}, open(6) + 'click("#acAddApptBtn"); await sleep(500); click("#ld2AwStatusBtn"); click("#ld2AwStatusList .wm-sd-item:nth-child(4)"); typeIn("#ld2AwSubject", "นัดที่เสร็จแล้ว"); typeIn("#ld2AwDetail", "บันทึกย้อนหลัง"); click("#ld2AwSubmitBtn"); await sleep(1100);');
  add('wm-add-save-fail', {}, open(6) + 'click("#acAddApptBtn"); await sleep(500); typeIn("#ld2AwSubject", "ทดสอบ ~fail"); typeIn("#ld2AwDetail", "รายละเอียด"); click("#ld2AwSubmitBtn"); await sleep(1500);');
  add('wm-add-save-fail-dark', { theme: 'dark' }, open(6) + 'click("#acAddApptBtn"); await sleep(500); typeIn("#ld2AwSubject", "ทดสอบ ~fail"); typeIn("#ld2AwDetail", "รายละเอียด"); click("#ld2AwSubmitBtn"); await sleep(1500);');
  add('wm-add-save-busy', {}, open(6) + 'click("#acAddApptBtn"); await sleep(500); typeIn("#ld2AwSubject", "นัด"); typeIn("#ld2AwDetail", "รายละเอียด"); click("#ld2AwSubmitBtn"); await sleep(40);');
  add('wm-add-save-no-owner-lead', {}, open(7) + 'click("#acAddApptBtn"); await sleep(800); typeIn("#ld2AwSubject", "นัดลูกค้าไม่มีผู้รับผิดชอบ"); typeIn("#ld2AwDetail", "รายละเอียด"); click("#ld2AwSubmitBtn"); await sleep(1100);');
  add('wm-add-close-x', {}, open(6) + 'click("#acAddApptBtn"); await sleep(400); click("#ld2AddWorkOverlay .ld2-aw-close"); await sleep(400);');
  add('wm-add-close-overlay', {}, open(6) + 'click("#acAddApptBtn"); await sleep(400); click("#ld2AddWorkOverlay"); await sleep(400);');
  add('wm-add-escape-does-nothing', {}, open(6) + 'click("#acAddApptBtn"); await sleep(400); key("Escape"); await sleep(400);');
  add('wm-add-reopen-resets', {}, open(6) + 'click("#acAddApptBtn"); await sleep(400); typeIn("#ld2AwSubject", "ค้าง"); click("#ld2AwAllDay"); click("#ld2AddWorkOverlay .ld2-aw-close"); await sleep(300); click("#acAddTaskBtn"); await sleep(500);');
  add('wm-add-after-switching-lead', {}, open(6) + 'click("#acAddApptBtn"); await sleep(400); click("#ld2AddWorkOverlay .ld2-aw-close"); click($$("#acBody0 tr.p-row")[2]); await sleep(1300); click("#acAddApptBtn"); await sleep(600);');

  /* ---- view ---- */
  add('wm-view-appt', {}, open(6) + 'click("#acApptList .ac-appt-card"); await sleep(600);');
  add('wm-view-appt-dark', { theme: 'dark' }, open(6) + 'click("#acApptList .ac-appt-card"); await sleep(600);');
  add('wm-view-appt-390', { w: 390, h: 844 }, open(6) + 'click("#acApptList .ac-appt-card"); await sleep(600);');
  add('wm-view-appt-fs-plus', {}, open(6) + 'fontAdj("2px"); click("#acApptList .ac-appt-card"); await sleep(600);');
  add('en-wm-view-appt', { lang: 'en' }, open(6) + 'click("#acApptList .ac-appt-card"); await sleep(600);');
  add('wm-view-appt-second', {}, open(6) + 'click("#acApptList button[onclick=\\"window.acApptNext()\\"]"); await sleep(300); click("#acApptList .ac-appt-card"); await sleep(600);');
  add('wm-view-appt-multigroup', {}, open(1) + 'click("#acApptList .ac-appt-card"); await sleep(600);');
  add('wm-view-task', {}, open(6) + 'click("#acTaskList .ac-task-card"); await sleep(600);');
  add('wm-view-task-dark', { theme: 'dark' }, open(6) + 'click("#acTaskList .ac-task-card"); await sleep(600);');
  add('wm-view-task-all-day', {}, open(6) + 'click($$("#acTaskList .ac-task-card").filter(function (c) { return /ทั้งวัน|All day/.test(c.textContent); })[0]); await sleep(600);');
  add('wm-view-task-done', {}, open(2) + 'click($$("#acTaskList .ac-task-card.done")[0] || $("#acTaskList .ac-task-card")); await sleep(600);');
  add('wm-view-task-third', {}, open(2) + 'click($$("#acTaskList .ac-task-card")[2]); await sleep(600);');
  add('wm-view-no-owner-lead', {}, open(7) + 'click("#acTaskList .ac-task-card"); await sleep(600);');
  add('wm-view-status-open', {}, open(6) + 'click("#acTaskList .ac-task-card"); await sleep(500); click("#ld2VwStatusBtn"); await sleep(300);');
  add('wm-view-status-open-dark', { theme: 'dark' }, open(6) + 'click("#acTaskList .ac-task-card"); await sleep(500); click("#ld2VwStatusBtn"); await sleep(300);');
  add('wm-view-status-pick-save', {}, open(6) + 'click("#acTaskList .ac-task-card"); await sleep(500); click("#ld2VwStatusBtn"); click("#ld2VwStatusList .wm-sd-item:nth-child(3)"); await sleep(200); click("#ld2VwSubmitBtn"); await sleep(1100);');
  add('wm-view-status-pick-save-reload', { reloads: true }, open(6) + 'click("#acTaskList .ac-task-card"); await sleep(500); click("#ld2VwStatusBtn"); click("#ld2VwStatusList .wm-sd-item:nth-child(3)"); await sleep(200); click("#ld2VwSubmitBtn"); await sleep(3900);');
  add('wm-view-appt-save-no-id', {}, open(6) + 'click("#acApptList .ac-appt-card"); await sleep(500); click("#ld2VwSubmitBtn"); await sleep(400);');
  add('wm-view-save-unchanged', {}, open(6) + 'click("#acTaskList .ac-task-card"); await sleep(500); click("#ld2VwSubmitBtn"); await sleep(1100);');
  add('wm-view-close-x', {}, open(6) + 'click("#acApptList .ac-appt-card"); await sleep(400); click("#ld2ViewWorkOverlay .ld2-aw-close"); await sleep(400);');
  add('wm-view-close-overlay', {}, open(6) + 'click("#acApptList .ac-appt-card"); await sleep(400); click("#ld2ViewWorkOverlay"); await sleep(400);');
  add('wm-view-go-lead-hidden', {}, open(6) + 'click("#acApptList .ac-appt-card"); await sleep(400);');

  /* ---- edit (from the pencil of the view) ---- */
  add('wm-edit-task', {}, open(6) + 'click("#acTaskList .ac-task-card"); await sleep(500); click("#ld2VwEditBtn"); await sleep(600);');
  add('wm-edit-task-dark', { theme: 'dark' }, open(6) + 'click("#acTaskList .ac-task-card"); await sleep(500); click("#ld2VwEditBtn"); await sleep(600);');
  add('wm-edit-task-390', { w: 390, h: 844 }, open(6) + 'click("#acTaskList .ac-task-card"); await sleep(500); click("#ld2VwEditBtn"); await sleep(600);');
  add('wm-edit-appt', {}, open(6) + 'click("#acApptList .ac-appt-card"); await sleep(500); click("#ld2VwEditBtn"); await sleep(600);');
  add('en-wm-edit-task', { lang: 'en' }, open(6) + 'click("#acTaskList .ac-task-card"); await sleep(500); click("#ld2VwEditBtn"); await sleep(600);');
  add('wm-edit-task-all-day', {}, open(6) + 'click($$("#acTaskList .ac-task-card").filter(function (c) { return /ทั้งวัน|All day/.test(c.textContent); })[0]); await sleep(500); click("#ld2VwEditBtn"); await sleep(600);');
  add('wm-edit-done-blocked', {}, open(2) + 'click($$("#acTaskList .ac-task-card.done")[0] || $("#acTaskList .ac-task-card")); await sleep(500); click("#ld2VwEditBtn"); await sleep(500);');
  add('wm-edit-clear-subject', {}, open(6) + 'click("#acTaskList .ac-task-card"); await sleep(500); click("#ld2VwEditBtn"); await sleep(500); typeIn("#ld2AwSubject", ""); click("#ld2AwSubmitBtn"); await sleep(900);');
  add('wm-edit-save', {}, open(6) + 'click("#acTaskList .ac-task-card"); await sleep(500); click("#ld2VwEditBtn"); await sleep(500); typeIn("#ld2AwSubject", "หัวข้อที่แก้ไข"); typeIn("#ld2AwTime", "11:15"); click("#ld2AwSubmitBtn"); await sleep(1100);');
  add('wm-edit-save-reload', { reloads: true }, open(6) + 'click("#acTaskList .ac-task-card"); await sleep(500); click("#ld2VwEditBtn"); await sleep(500); typeIn("#ld2AwSubject", "หัวข้อที่แก้ไข"); typeIn("#ld2AwDetail", "รายละเอียดใหม่"); click("#ld2AwStatusBtn"); click("#ld2AwStatusList .wm-sd-item:nth-child(2)"); click("#ld2AwSubmitBtn"); await sleep(3900);');
  add('wm-edit-save-fail', {}, open(6) + 'click("#acTaskList .ac-task-card"); await sleep(500); click("#ld2VwEditBtn"); await sleep(500); typeIn("#ld2AwSubject", "แก้ ~fail"); click("#ld2AwSubmitBtn"); await sleep(1500);');
  add('wm-edit-owner-dropdown', {}, open(6) + 'click("#acTaskList .ac-task-card"); await sleep(500); click("#ld2VwEditBtn"); await sleep(900); click("#ld2AwOwnerBtn"); await sleep(900);');
  add('wm-edit-close', {}, open(6) + 'click("#acTaskList .ac-task-card"); await sleep(500); click("#ld2VwEditBtn"); await sleep(500); click("#ld2AddWorkOverlay .ld2-aw-close"); await sleep(400);');
  add('wm-edit-then-add-resets', {}, open(6) + 'click("#acTaskList .ac-task-card"); await sleep(500); click("#ld2VwEditBtn"); await sleep(500); click("#ld2AddWorkOverlay .ld2-aw-close"); click("#acAddApptBtn"); await sleep(600);');

  /* ---- permissions ---- */
  ['noedit', 'nosupedit', 'nosup', 'noadd', 'nosched', 'nohist'].forEach(function (p) {
    add('perm-' + p, perm(p), open(6));
    add('perm-' + p + '-dark', { ...perm(p), theme: 'dark' }, open(6));
  });
  add('perm-noedit-view', perm('noedit'), open(6) + 'click("#acTaskList .ac-task-card"); await sleep(600);');
  add('perm-noedit-view-status', perm('noedit'), open(6) + 'click("#acTaskList .ac-task-card"); await sleep(500); click("#ld2VwStatusBtn"); await sleep(300);');
  add('perm-noedit-view-save', perm('noedit'), open(6) + 'click("#acTaskList .ac-task-card"); await sleep(500); click("#ld2VwSubmitBtn"); await sleep(400);');
  add('perm-noedit-add', perm('noedit'), open(6) + 'click("#acAddApptBtn"); await sleep(600);');
  add('perm-nosup-add', perm('nosup'), open(6) + 'click("#acAddApptBtn"); await sleep(800);');
  add('perm-nosup-add-owner-lead', perm('nosup'), open(0) + 'click("#acAddApptBtn"); await sleep(800);');
  add('perm-nosup-add-save', perm('nosup'), open(6) + 'click("#acAddApptBtn"); await sleep(600); typeIn("#ld2AwSubject", "นัด"); typeIn("#ld2AwDetail", "รายละเอียด"); click("#ld2AwSubmitBtn"); await sleep(1100);');
  add('perm-nosup-view', perm('nosup'), open(6) + 'click("#acTaskList .ac-task-card"); await sleep(600);');
  add('perm-nosupedit-edit', perm('nosupedit'), open(6) + 'click("#acTaskList .ac-task-card"); await sleep(600);');
  add('perm-nohist-390', { ...perm('nohist'), w: 390, h: 844 }, async function () {});
  add('perm-noedit-en', { ...perm('noedit'), lang: 'en' }, open(6));

  /* ---- closed lead ---- */
  add('closed-panel-appt', {}, 'click("#acSwClosed"); await sleep(2500); click($$("#acBody0 tr.p-row")[0]); await sleep(1300); click(\'.ac-panel-tab[data-tab="appt"]\'); await sleep(400);');
  add('closed-panel-add-hidden', {}, 'click("#acSwClosed"); await sleep(2500); click($$("#acBody0 tr.p-row")[0]); await sleep(1300);');
  add('closed-lost-panel', {}, 'click("#acFilterBtn"); pick("#acFClose", "closed"); click("#acBtnFilter"); await sleep(2500); click($$("#acBody0 tr.p-row")[2]); await sleep(1300);');

  /* ============================================================ the work modal in the other modes of the shared piece: the customer search
     (the Schedule page's way: ctx.customerSearch — the Activities page itself never sets it) and the "go to lead" link of the view */
  var mousedown = '.dispatchEvent(new MouseEvent("mousedown", { bubbles: true }))';
  var firstItems = 'customerMode(); await sleep(500); click("#ld2AwCustBtn"); await sleep(1500);';
  var pickSecond = '$$("#ld2AwCustItems .wm-cust-item")[1]' + mousedown + '; await sleep(1500);';
  add('wm-cust-open', {}, 'customerMode(); await sleep(900);');
  add('wm-cust-open-dark', { theme: 'dark' }, 'customerMode(); await sleep(900);');
  add('wm-cust-open-390', { w: 390, h: 844 }, 'customerMode(); await sleep(900);');
  add('en-wm-cust-open', { lang: 'en' }, 'customerMode(); await sleep(900);');
  add('wm-cust-list', {}, firstItems);
  add('wm-cust-list-dark', { theme: 'dark' }, firstItems);
  add('wm-cust-list-390', { w: 390, h: 844 }, firstItems);
  add('wm-cust-search', {}, firstItems + ' typeIn("#ld2AwCustSearch", "สม"); await sleep(2600);');
  add('wm-cust-search-typing', {}, firstItems + ' typeIn("#ld2AwCustSearch", "ส"); await sleep(300);');
  add('wm-cust-search-clear', {}, firstItems + ' typeIn("#ld2AwCustSearch", "สม"); await sleep(1800); $("#ld2AwCustX")' + mousedown + '; await sleep(1500);');
  add('wm-cust-not-found', {}, firstItems + ' typeIn("#ld2AwCustSearch", "zzzz"); await sleep(2600);');
  add('wm-cust-filter-team-menu', {}, firstItems + ' $(".wm-cust-pill")' + mousedown + '; await sleep(300);');
  add('wm-cust-filter-team-pick', {}, firstItems + ' $(".wm-cust-pill")' + mousedown + '; await sleep(200); $$("#wmCustFltMenu-team .wm-cust-flt-mi")[1]' + mousedown + '; await sleep(400);');
  add('wm-cust-filter-owner-pick', {}, firstItems + ' $$(".wm-cust-pill")[1]' + mousedown + '; await sleep(200); $$("#wmCustFltMenu-owner .wm-cust-flt-mi")[2]' + mousedown + '; await sleep(400);');
  add('wm-cust-more-pages', {}, firstItems + ' var l = $("#ld2AwCustItems"); l.scrollTop = l.scrollHeight; l.dispatchEvent(new Event("scroll")); await sleep(1500);');
  add('wm-cust-pick', {}, firstItems + ' ' + pickSecond);
  add('wm-cust-pick-dark', { theme: 'dark' }, firstItems + ' ' + pickSecond);
  add('wm-cust-pick-then-owner', {}, firstItems + ' ' + pickSecond + ' click("#ld2AwOwnerBtn"); await sleep(1000);');
  add('wm-cust-pick-then-search-again', {}, firstItems + ' ' + pickSecond + ' click("#ld2AwCustBtn"); await sleep(600); typeIn("#ld2AwCustSearch", "ธ"); await sleep(2600);');
  add('wm-cust-save-needs-customer', {}, 'customerMode(); await sleep(600); typeIn("#ld2AwSubject", "นัด"); typeIn("#ld2AwDetail", "x"); click("#ld2AwSubmitBtn"); await sleep(900);');
  add('wm-cust-save', {}, firstItems + ' ' + pickSecond + ' typeIn("#ld2AwSubject", "นัดจากปฏิทิน"); typeIn("#ld2AwDetail", "รายละเอียด"); click("#ld2AwSubmitBtn"); await sleep(1100);');
  add('wm-cust-save-nosup', perm('nosup'), firstItems + ' $$("#ld2AwCustItems .wm-cust-item")[0]' + mousedown + '; await sleep(1500); typeIn("#ld2AwSubject", "นัด"); typeIn("#ld2AwDetail", "รายละเอียด"); click("#ld2AwSubmitBtn"); await sleep(1100);');
  add('wm-cust-list-nosup', perm('nosup'), firstItems);
  add('wm-cust-close-list-click-away', {}, firstItems + ' click(".ld2-aw-title"); await sleep(300);');
  add('wm-view-go-lead-link', {}, 'viewWithGoLead(); await sleep(600);');
  add('wm-view-go-lead-link-dark', { theme: 'dark' }, 'viewWithGoLead(); await sleep(600);');
  add('wm-view-go-lead-click', { roots: [] }, async function (sleep, side) { captureNav(side); viewWithGoLead(); await sleep(400); click('#ld2VwGoLead'); await sleep(700); });
  add('wm-view-go-lead-no-group', { roots: [] }, async function (sleep, side) {
    captureNav(side); window.wmOpenView('task', { id: 5, title: 't', date: '2026-10-25', status: 'doing' }, { leadId: 7 }, false, true); await sleep(400); click('#ld2VwGoLead'); await sleep(700);
  });
  add('wm-open-edit-direct', {}, 'window.wmSetLeadContext({ leadRef: { leadId: 43, customer_name: "ปรียา ใจดี", team: "ทีม B", owner_name: "ธนากร", owner_id: 1005, procedureGroupId: 102 }, usesWfStep: true, tasksRef: [], apptsRef: [] }); window.wmOpenEdit("appt", { id: 9, title: "นัดแก้ตรง", detail: "x", date: "2026-10-25", time_raw: "10:00", status: "scheduled", group: "วิเคราะห์สินเชื่อ", step: "วิเคราะห์ความเสี่ยง" }, null, true); await sleep(900);');
  add('wm-open-edit-direct-closed-blocked', {}, 'window.wmOpenEdit("appt", { id: 9, title: "จบแล้ว", detail: "x", date: "2026-10-25", time_raw: "10:00", status: "cancel" }, null, true); await sleep(500);');

  /* ---- more of the page in the other language / theme, escape keys, small widths ---- */
  add('en-panel-appt', { lang: 'en' }, open(6));
  add('en-panel-appt-empty', { lang: 'en' }, open(0));
  add('en-wm-view-task', { lang: 'en' }, open(6) + 'click("#acTaskList .ac-task-card"); await sleep(600);');
  add('en-product-menu', { lang: 'en' }, async function () { await openProductMenu(); });
  add('en-sort-menu', { lang: 'en' }, async function () { click('#acSortBtn'); await sleep(300); });
  add('en-search-no-result', { lang: 'en' }, async function () { click('#acSearch .ac-search-ic'); typeIn('#acSearchInput', 'ไม่มีชื่อนี้'); await sleep(1800); });
  add('en-stats-tag', { lang: 'en' }, async function () { click('.ac-tgl-group .ac-tgl:nth-child(2)'); await sleep(500); });
  add('en-table-adviser', { lang: 'en' }, async function () { await pickProduct(PRODUCTS.adviser); });
  add('en-contact-save-fail', { lang: 'en' }, async function () { click('#acAddContactBtn'); await sleep(300); typeIn('#acContactText', 'ทดสอบ ~fail'); click('#acContactSave'); await sleep(1500); });
  add('filter-escape-does-nothing', {}, async function () { await openFilter(); key('Escape'); await sleep(400); });
  add('contact-escape-does-nothing', {}, async function () { click('#acAddContactBtn'); await sleep(300); key('Escape'); await sleep(400); });
  add('product-car-dark', { theme: 'dark' }, async function () { await pickProduct(PRODUCTS.car); });
  add('table1-dark-multi', { theme: 'dark' }, async function () { await subtab(1, 700); click($$('#acBody1 tr.p-row')[5]); await sleep(1300); });
  add('panel-dark-tab-appt-multi', { theme: 'dark' }, open(1));
  add('panel-fs-plus', {}, 'fontAdj("2px"); click($$("#acBody0 tr.p-row")[6]); await sleep(1300);');
  add('panel-fs-minus', {}, 'fontAdj("-2px"); click($$("#acBody0 tr.p-row")[6]); await sleep(1300);');
  add('panel-appt-fs-plus', {}, open(6) + 'fontAdj("2px"); await sleep(300);');
  add('table-768', { w: 768, h: 1024 }, async function () { await subtab(1, 600); });
  add('tableB-390', { w: 390, h: 844 }, async function () { await pickProduct(PRODUCTS.adviser); });
  add('expand-390', { w: 390, h: 844 }, async function () { click('#acBody0 tr.p-row .ac-chev-btn'); await sleep(1000); });
}
