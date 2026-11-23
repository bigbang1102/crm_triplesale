// Scenarios of the Dashboard comparison. Each function is run INSIDE the page under test (Java replica / Angular app) with
// (sleep, side, win) in scope, after the prelude of lib/scenario-pre.mjs and the page prelude (`pre` in page.mjs: tab(), CALF, KPIF).
// add(name, opts, fn):  opts = { w, h, theme: 'light'|'dark', lang: 'th'|'en', settle, wait, roots, frames: [{ sel, name, roots }], ready }
export default function (add) {
  var TABS = ['lead', 'steps', 'pipeline', 'status', 'customerGroup', 'statusByCustomer', 'table'];

  /* ---- first paint, themes, viewports ---- */
  add('overview', {}, async function () {});
  add('overview-dark', { theme: 'dark' }, async function () {});
  add('overview-1024', { w: 1024, h: 768 }, async function () {});
  add('overview-768', { w: 768, h: 1024 }, async function () {});
  add('overview-390', { w: 390, h: 844 }, async function () {});
  add('overview-1920', { w: 1920, h: 1080 }, async function () {});

  /* ---- each tab ---- */
  TABS.forEach(function (t) {
    add('tab-' + t, {}, 'await tab(' + JSON.stringify(t) + ');');
    add('tab-' + t + '-dark', { theme: 'dark' }, 'await tab(' + JSON.stringify(t) + ');');
  });
  ['pipeline', 'status', 'table'].forEach(function (t) {
    add('tab-' + t + '-390', { w: 390, h: 844 }, 'await tab(' + JSON.stringify(t) + ');');
    add('tab-' + t + '-768', { w: 768, h: 1024 }, 'await tab(' + JSON.stringify(t) + ');');
  });
  add('tab-calendar', { frames: [{ sel: '#calendarFrame', name: 'cal', roots: ['body'] }] }, async function (sleep) { await tab('calendar', 4500); });
  add('tab-calendar-dark', { theme: 'dark', frames: [{ sel: '#calendarFrame', name: 'cal', roots: ['body'] }] }, async function (sleep) { await tab('calendar', 4500); });
  add('tab-kpi', { frames: [{ sel: '#kpiFrame', name: 'kpi', roots: ['body'] }] }, async function (sleep) { await tab('kpi', 4500); });
  add('tab-kpi-dark', { theme: 'dark', frames: [{ sel: '#kpiFrame', name: 'kpi', roots: ['body'] }] }, async function (sleep) { await tab('kpi', 4500); });


  /* ---- the A A A font buttons: Java sets --fs-adj, the Angular shell --ts-fs-adj (same value on <html>) ---- */
  [['plus', '2px'], ['minus', '-2px']].forEach(function (p) {
    add('fs-' + p[0], {}, 'document.documentElement.style.setProperty("--fs-adj", ' + JSON.stringify(p[1]) + '); document.documentElement.style.setProperty("--ts-fs-adj", ' + JSON.stringify(p[1]) + '); await sleep(1200);');
    add('fs-' + p[0] + '-status', {}, 'document.documentElement.style.setProperty("--fs-adj", ' + JSON.stringify(p[1]) + '); document.documentElement.style.setProperty("--ts-fs-adj", ' + JSON.stringify(p[1]) + '); await tab("status");');
  });

  TABS.forEach(function (t) {
    add('fs-plus-tab-' + t, {}, 'document.documentElement.style.setProperty("--fs-adj", "2px"); document.documentElement.style.setProperty("--ts-fs-adj", "2px"); await tab(' + JSON.stringify(t) + ');');
  });
  add('fs-minus-tab-table', {}, 'document.documentElement.style.setProperty("--fs-adj", "-2px"); document.documentElement.style.setProperty("--ts-fs-adj", "-2px"); await tab("table");');
  /* ---- English (the page reloads on a language switch; here it starts in English) ---- */
  add('en-overview', { lang: 'en' }, async function () {});
  add('en-overview-dark', { lang: 'en', theme: 'dark' }, async function () {});
  ['lead', 'steps', 'pipeline', 'status', 'customerGroup', 'statusByCustomer', 'table'].forEach(function (t) {
    add('en-tab-' + t, { lang: 'en' }, 'await tab(' + JSON.stringify(t) + ');');
  });
  add('en-pipeline-modal', { lang: 'en' }, async function (sleep) { await tab('pipeline'); click($('#pipelineBody .pipeline-cell:not(.empty)')); await sleep(2200); });
  add('en-status-pending-modal', { lang: 'en' }, async function (sleep) { await tab('status'); click($('#statusBody .status-num-pending[data-emp]')); await sleep(2400); });
  add('en-month-3', { lang: 'en' }, async function (sleep) { click('#monthDropdownBtn'); await sleep(200); click('#monthDropdownMenu .hdr-dd-item[data-value="3"]'); await sleep(2600); });

  /* ---- the two iframes ---- */
  var calOpts = { frames: [{ sel: '#calendarFrame', name: 'cal', roots: ['body'] }] }, kpiOpts = { frames: [{ sel: '#kpiFrame', name: 'kpi', roots: ['body'] }] };
  ['day', 'week', 'year'].forEach(function (v) {
    add('cal-view-' + v, calOpts, 'await tab("calendar", 4500); fclick("#calendarFrame", "#gcViewDropBtn"); await sleep(300); fclick("#calendarFrame", ' + JSON.stringify('.gc-vdrop-item[data-view="' + v + '"]') + '); await sleep(1200);');
  });
  add('cal-next', calOpts, async function (sleep) { await tab('calendar', 4500); fclick(CALF, '#gcNext'); await sleep(2500); });
  add('cal-today', calOpts, async function (sleep) { await tab('calendar', 4500); fclick(CALF, '#gcNext'); await sleep(1500); fclick(CALF, '#gcToday'); await sleep(1800); });
  add('cal-create-menu', calOpts, async function (sleep) { await tab('calendar', 4500); fclick(CALF, '.gc-create'); await sleep(600); });
  add('cal-create-event', calOpts, async function (sleep) { await tab('calendar', 4500); fclick(CALF, '.gc-create'); await sleep(400); fclick(CALF, '.gc-create-mi[data-create="event"]'); await sleep(1200); });
  add('cal-create-task', calOpts, async function (sleep) { await tab('calendar', 4500); fclick(CALF, '.gc-create'); await sleep(400); fclick(CALF, '.gc-create-mi[data-create="task"]'); await sleep(1200); });
  add('cal-chip', calOpts, async function (sleep) { await tab('calendar', 4500); fclick(CALF, '.gc-chip'); await sleep(1000); });
  add('cal-tasks-view', calOpts, async function (sleep) { await tab('calendar', 4500); fclick(CALF, '#gcViewTasks'); await sleep(3000); });
  add('cal-dark-create', { theme: 'dark', frames: calOpts.frames }, async function (sleep) { await tab('calendar', 4500); fclick(CALF, '.gc-create'); await sleep(400); fclick(CALF, '.gc-create-mi[data-create="event"]'); await sleep(1200); });
  add('kpi-new', kpiOpts, async function (sleep) { await tab('kpi', 4500); fclick(KPIF, '#kpiNewBtn'); await sleep(1200); });
  add('kpi-row-menu', kpiOpts, async function (sleep) { await tab('kpi', 4500); fclick(KPIF, '#kpiListBody .kpi-act-btn[data-act="menu"]'); await sleep(600); });
  add('kpi-edit', kpiOpts, async function (sleep) { await tab('kpi', 4500); fclick(KPIF, '#kpiListBody .kpi-act-btn[data-act="menu"]'); await sleep(400); fclick(KPIF, '#kpiRowMenu [data-act="menu-edit"]'); await sleep(1500); });
  add('kpi-status-filter', kpiOpts, async function (sleep) { await tab('kpi', 4500); ftype(KPIF, '#kpiStatusSelect', 'Done'); await sleep(1500); });
  add('kpi-search', kpiOpts, async function (sleep) { await tab('kpi', 4500); ftype(KPIF, '#kpiListSearchInput', 'สินเชื่อ'); fclick(KPIF, '#kpiListSearchBtn'); await sleep(1500); });
  add('kpi-sort', kpiOpts, async function (sleep) { await tab('kpi', 4500); fclick(KPIF, '#kpiSortBtn'); await sleep(900); });
  add('kpi-branch', kpiOpts, async function (sleep) { await tab('kpi', 4500); ftype(KPIF, '#kpiBranchSelect', 'GOLD'); await sleep(3500); });
  add('kpi-attach', kpiOpts, async function (sleep) { await tab('kpi', 4500); fclick(KPIF, '#kpiListBody .kpi-upload-btn[data-act="view-attach-popup"]'); await sleep(1000); });
  add('kpi-dark-edit', { theme: 'dark', frames: kpiOpts.frames }, async function (sleep) { await tab('kpi', 4500); fclick(KPIF, '#kpiListBody .kpi-act-btn[data-act="menu"]'); await sleep(400); fclick(KPIF, '#kpiRowMenu [data-act="menu-edit"]'); await sleep(1500); });

  /* ---- header filters ---- */
  add('dd-year-open', {}, async function (sleep) { click('#yearPillBtn'); await sleep(300); });
  add('year-2025', {}, async function (sleep) { click('#yearPillBtn'); await sleep(200); click('#yearPillMenu .hdr-dd-item[data-value="2025"]'); await sleep(2600); });
  add('month-3', {}, async function (sleep) { click('#monthDropdownBtn'); await sleep(200); click('#monthDropdownMenu .hdr-dd-item[data-value="3"]'); await sleep(2600); });
  add('movement-2', {}, async function (sleep) { click('#hdrMovementTypeBtn'); await sleep(200); click('#hdrMovementTypeMenu .hdr-dd-item[data-value="02"]'); await sleep(2600); });
  add('source-facebook', {}, async function (sleep) { click('#sourceDropdownBtn'); await sleep(200); click('#sourceDropdownMenu .hdr-dd-item[data-value="Facebook"]'); await sleep(2600); });
  add('group-cs', {}, async function (sleep) { click('#groupDropdownBtn'); await sleep(200); click('#groupDropdownMenu .hdr-dd-item[data-value="CS"]'); await sleep(2600); });
  add('country-japan', {}, async function (sleep) { click('#hdrCountryBtn'); await sleep(200); click('#hdrCountryMenu .hdr-dd-item[data-value="ญี่ปุ่น"]'); await sleep(2600); });
  add('employee-multi', {}, async function (sleep) {
    click('#hdrEmployeeBtn'); await sleep(250);
    click('#hdrEmployeeMenu .hdr-dd-item[data-value="E101"]'); await sleep(100);
    click('#hdrEmployeeMenu .hdr-dd-item[data-value="E103"]'); await sleep(2800);
  });
  add('employee-search', {}, async function (sleep) {
    click('#hdrEmployeeBtn'); await sleep(250);
    typeIn('#hdrEmployeeMenu .hdr-dd-search-input', 'วิ'); await sleep(300);
  });
  add('date-range', {}, async function (sleep) { typeIn('#hdrFromDate', '01/03/2026'); await sleep(200); typeIn('#hdrToDate', '31/03/2026'); await sleep(2800); });
  add('basis-lead', {}, async function (sleep) { click('#dbBasisGroup input[value="lead"]'); await sleep(2600); });
  // the "open filter" button is not in the markup (the modal is unreachable in the original too): show the modal itself
  add('filter-modal-open', {}, async function (sleep) { var m = $('#filterModal'); m.classList.add('show'); m.setAttribute('aria-hidden', 'false'); await sleep(500); });

  /* ---- ภาพรวม: widget edit mode ---- */
  add('widget-edit', {}, async function (sleep) { click('#btnWidgetEdit'); await sleep(700); });
  add('widget-edit-hide', {}, async function (sleep) {
    click('#btnWidgetEdit'); await sleep(500);
    click($$('#overviewWidgetsGrid > [data-widget-id] .widget-eye-btn')[1]); await sleep(500);
  });
  add('widget-edit-save', {}, async function (sleep) {
    click('#btnWidgetEdit'); await sleep(500);
    click($$('#overviewWidgetsGrid > [data-widget-id] .widget-eye-btn')[1]); await sleep(300);
    click('.btn-widget-save'); await sleep(1500);
  });
  add('widget-edit-cancel', {}, async function (sleep) {
    click('#btnWidgetEdit'); await sleep(500);
    click($$('#overviewWidgetsGrid > [data-widget-id] .widget-eye-btn')[1]); await sleep(300);
    click('.btn-widget-cancel'); await sleep(1600);
  });

  /* ---- lead / steps ---- */
  add('lead-after-year-2025', {}, async function (sleep) {
    click('#yearPillBtn'); await sleep(200); click('#yearPillMenu .hdr-dd-item[data-value="2025"]'); await sleep(1200);
    await tab('lead', 2600);
  });

  /* ---- pipeline ---- */
  add('pipeline-modal', {}, async function (sleep) {
    await tab('pipeline'); click($('#pipelineBody .pipeline-cell:not(.empty)')); await sleep(2200);
  });
  add('pipeline-modal-sort', {}, async function (sleep) {
    await tab('pipeline'); click($('#pipelineBody .pipeline-cell:not(.empty)')); await sleep(2200);
    click('#pipelineListTable thead th[data-sort-key="name"]'); await sleep(500);
  });
  add('pipeline-modal-sort-desc', {}, async function (sleep) {
    await tab('pipeline'); click($('#pipelineBody .pipeline-cell:not(.empty)')); await sleep(2200);
    click('#pipelineListTable thead th[data-sort-key="date"]'); await sleep(300); click('#pipelineListTable thead th[data-sort-key="date"]'); await sleep(500);
  });
  add('pipeline-modal-search', {}, async function (sleep) {
    await tab('pipeline'); click($('#pipelineBody .pipeline-cell:not(.empty)')); await sleep(2200);
    typeIn('#pipelineModalSearch', 'ส'); await sleep(800);
  });
  add('pipeline-modal-page2', {}, async function (sleep) {
    await tab('pipeline'); click($('#pipelineBody .pipeline-cell:not(.empty)')); await sleep(2200);
    var b = $('#pipelineModalPagination .pmp-btn[data-page="2"]'); if (b) { click(b); await sleep(2200); }
  });
  add('pipeline-modal-esc', {}, async function (sleep) {
    await tab('pipeline'); click($('#pipelineBody .pipeline-cell:not(.empty)')); await sleep(2200);
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true })); await sleep(500);
  });
  add('pipeline-page2', {}, async function (sleep) {
    await tab('pipeline'); click('#pipelinePagination .pg-btn[data-page="2"]'); await sleep(2400);
  });
  // (a tall viewport: with a short page the Java replica has a document scrollbar and the Angular shell scrolls inside its own box)
  add('pipeline-month-3', { h: 1400 }, async function (sleep) {
    click('#monthDropdownBtn'); await sleep(200); click('#monthDropdownMenu .hdr-dd-item[data-value="3"]'); await sleep(1200);
    await tab('pipeline', 2600);
  });

  /* ---- สถานะตามกลุ่มขั้นตอน ---- */
  add('status-expand', {}, async function (sleep) {
    await tab('status'); click($('#statusBody .status-row-emp')); await sleep(2000);
  });
  add('status-pending-modal', {}, async function (sleep) {
    await tab('status'); click($('#statusBody .status-num-pending[data-emp]')); await sleep(2400);
  });
  add('status-completed-modal', {}, async function (sleep) {
    await tab('status'); click($('#statusBody .status-num-completed[data-emp]')); await sleep(2400);
  });
  add('status-dept-AN', {}, async function (sleep) {
    await tab('status'); click('#statusDeptBtn'); await sleep(250); click('#statusDeptMenu .hdr-dd-item[data-value="AN"]'); await sleep(2600);
  });
  add('status-dept-menu', {}, async function (sleep) { await tab('status'); click('#statusDeptBtn'); await sleep(400); });
  add('status-blocked', {}, async function (sleep) { await tab('status'); click('#statusIncludeBlockedToggle'); await sleep(2600); });
  add('status-sort', {}, async function (sleep) { await tab('status'); click('#statusSortBtn'); await sleep(600); });

  /* ---- ลูกค้าตามกลุ่มขั้นตอน ---- */
  add('cg-search', {}, async function (sleep) {
    await tab('customerGroup'); typeIn('#customerGroupSearchInput', 'สม'); click('#customerGroupSearchBtn'); await sleep(2400);
  });
  add('cg-sort', {}, async function (sleep) { await tab('customerGroup'); click('#cgSortBtn'); await sleep(700); });
  add('cg-page2', {}, async function (sleep) {
    await tab('customerGroup'); var b = $('#customerGroupPagination .pg-btn[data-page="2"]'); if (b) { click(b); await sleep(2400); }
  });
  add('cg-dept-PLS', {}, async function (sleep) {
    await tab('customerGroup'); click('#cgDeptBtn'); await sleep(250); click('#cgDeptMenu .hdr-dd-item[data-value="PLS"]'); await sleep(2600);
  });

  /* ---- สถานะตามลูกค้า ---- */
  add('sbc-step-menu', {}, async function (sleep) { await tab('statusByCustomer', 3000); click('#sbcStepBtn'); await sleep(500); });
  add('sbc-step-pick', {}, async function (sleep) {
    await tab('statusByCustomer', 3000); click('#sbcStepBtn'); await sleep(400);
    click($$('#sbcStepMenu .hdr-dd-item:not([data-value="all"])')[0]); await sleep(300);
    click($$('#sbcStepMenu .hdr-dd-item:not([data-value="all"])')[2]); await sleep(2600);
  });
  add('sbc-dept-LS', {}, async function (sleep) {
    await tab('statusByCustomer', 3000); click('#sbcDeptBtn'); await sleep(250); click('#sbcDeptMenu .hdr-dd-item[data-value="LS"]'); await sleep(3000);
  });
  add('sbc-search', {}, async function (sleep) {
    await tab('statusByCustomer', 3000); typeIn('#statusByCustomerSearchInput', 'วิ'); click('#statusByCustomerSearchBtn'); await sleep(2400);
  });
  add('sbc-sort', {}, async function (sleep) { await tab('statusByCustomer', 3000); click('#sbcSortBtn'); await sleep(700); });

  /* ---- ตารางลีดทั้งหมด ---- */
  add('table-search', {}, async function (sleep) {
    await tab('table'); typeIn('#leadsSearchInput', 'สม'); click('#leadsSearchBtn'); await sleep(2400);
  });
  add('table-expand', {}, async function (sleep) {
    await tab('table'); click($('#leadsTableBody .lt-main-row')); await sleep(2000);
  });
  add('table-page2', {}, async function (sleep) {
    await tab('table'); click('#leadsTablePagination .lt-page-btn[data-page="2"]'); await sleep(2400);
  });
  add('table-after-filters', {}, async function (sleep) {
    click('#sourceDropdownBtn'); await sleep(200); click('#sourceDropdownMenu .hdr-dd-item[data-value="LINE OA"]'); await sleep(1500);
    await tab('table', 2600);
  });
}
