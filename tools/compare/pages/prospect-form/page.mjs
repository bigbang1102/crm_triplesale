// Comparison setup of the prospect form (/crm/prospects/:id) — see tools/compare/README.md for the interface of a page.
//
// Java side: the REAL page (contracts_master_data.xhtml: markup rendered by tools/lib/jsf.mjs the way the server would, the three page scripts,
// attach_file_types.js, lead_create_dropdowns.js, phone_format.js), the real PrimeFaces stylesheet and widget scripts, inside the shell replica — one file
// per mode, record and language. Its data is the SAME mock the Angular page runs; the state of the page is the SAME bean class (prospect-form.bean.ts);
// PrimeFaces.ab posts to /triplesale/pages/<view>.face (see lib/prospect-form-replica.mjs).
// Scenario options: mode = add | view | edit, id = the record (the ids of the mock; see scenarios.mjs).
import { buildForm, handle, newState, normalize, viewName } from '../../lib/prospect-form-replica.mjs';

// the records the scenarios open (ids of the mock; see prospect-form.mock.ts mockFormDetail): 1 a person with a picture, 2 a person, 9 a foreigner,
// 10 a juristic person, 11 without a birth date, 13 without a country, 20 a legacy "company", 26 without a country and a sex, 30 a juristic person without a contact channel
const RECORDS = [1, 2, 9, 10, 11, 13, 20, 26, 30];
const MODES = [['add', 0], ...['view', 'edit'].flatMap((m) => RECORDS.map((id) => [m, id]))];
// the English pages
const EN = new Set(['add:0', 'view:1', 'edit:1', 'edit:2', 'view:10']);

export default {
  name: 'prospect-form',
  // the form, the modals the page moves into <body>, the PrimeFaces overlays, the ODS lists, the SweetAlert
  // (.ods-list is not a root: the lists the shell's ODS builds into <body> come in the order the selects were enhanced — in a single-page app the shell's selects
  // were enhanced before the page existed, and the modals the page moves to the end of <body> are enhanced where they are — so they are compared as a set, see odsSummary)
  roots: ['.card', '.cl-modal-overlay', '.ui-selectonemenu-panel', '.ui-datepicker', '.ui-dialog', '.ui-widget-overlay', '.swal-overlay'],
  ready: `document.querySelector('.contract-tabbar') && window.PrimeFaces`,
  javaPath: (lang, opts) => {
    const mode = opts.mode ?? 'add';
    const id = opts.id ?? 1;
    const q = `pid=1&page_id=1&act=2&action_type=${mode}${mode === 'add' ? '' : `&id=${id}`}${opts.pms ? `&pms=${opts.pms}` : ''}`;
    return `/triplesale/pages/${viewName(mode, id, lang)}.xhtml?${q}`;
  },
  ngPath: (_lang, opts) => {
    const mode = opts.mode ?? 'add';
    const id = opts.id ?? 1;
    return mode === 'add' ? '/crm/prospects/new?action_type=add' : `/crm/prospects/${id}?action_type=${mode}${opts.pms ? `&pms=${opts.pms}` : ''}`;
  },
  latencyMs: 0,
  // "today" of both sides: the date a new record gets (the bean of the replica is given the same day)
  clock: [2026, 9, 20, 10, 0, 0],
  // helpers of this page's scenarios
  pre: `
// the dump compares the state of the controls (value / checked / selected as the user sees it), not the attributes the markup was written with
window.__cmpState = true;
// the ODS lists as a set: class + the texts of the items, sorted
var odsSummary = function () {
  var rows = $$('.ods-list').map(function (l) { return l.className + ' | ' + Array.prototype.map.call(l.querySelectorAll('.ods-item'), function (i) { return (i.classList.contains('sel') ? '*' : '') + i.textContent.trim(); }).join(' / '); });
  rows.sort();
  return ['ODS lists: ' + rows.length].concat(rows);
};
window.__extra = async function () { return odsSummary(); };
var navCalls = [];
var trackNav = function (side) {
  navCalls = [];
  if (!window.navigation) throw new Error('no Navigation API');
  window.navigation.addEventListener('navigate', function (e) { var u = new URL(e.destination.url); navCalls.push(u.pathname + u.search); if (side === 'java') e.preventDefault(); });
  window.__extra = async function () { return ['NAV ' + navCalls.join(' ; ')]; };
};
// PrimeFaces components by their position on the page (the generated ids j_idtN differ between the Java replica and the template; the position does not)
var selEl = function (i) { return $$('.ui-selectonemenu')[i]; };
var selWith = function (label) {
  var i = $$('.ui-selectonemenu').findIndex(function (s) { return Array.prototype.some.call(s.querySelectorAll('option'), function (o) { return o.textContent.trim() === label; }); });
  if (i < 0) throw new Error('no select with the option ' + label);
  return i;
};
var openSel = async function (i) { click(selEl(i).querySelector('.ui-selectonemenu-trigger')); await sleep(450); };
var chooseOpt = async function (i, label) {
  await openSel(i);
  var li = $$('[id="' + selEl(i).id + '_panel"] .ui-selectonemenu-item').filter(function (x) { return x.getAttribute('data-label') === label; })[0];
  if (!li) throw new Error('no option ' + label);
  li.click();
  await sleep(450);
};
var chooseIdx = async function (i, n) {
  await openSel(i);
  var li = $$('[id="' + selEl(i).id + '_panel"] .ui-selectonemenu-item')[n];
  if (!li) throw new Error('no item ' + n + ' in select ' + i);
  li.click();
  await sleep(450);
};
var radioBox = function (group, i) { return $$('[id="' + group + '"] .ui-radiobutton-box')[i]; };
var calEl = function (i) { return $$('.ui-calendar')[i]; };
var openCal = async function (i) { click(calEl(i).querySelector('.ui-datepicker-trigger')); await sleep(500); };
var field = function (id) { return $('[id="form:' + id + '"]'); };
var tab = async function (n) { click('.contract-tabbar .ct-tab[data-tab="' + n + '"]'); await sleep(250); };
// files chosen in a file input (the browser takes them as a user's choice: the input's change event)
var setFiles = function (input, files) { var dt = new DataTransfer(); files.forEach(function (f) { dt.items.add(f); }); input.files = dt.files; input.dispatchEvent(new Event('change', { bubbles: true })); };
var fileOf = function (name, type, size) { return new File([new ArrayBuffer(size || 2048)], name, { type: type || 'application/pdf' }); };
var imageFile = function (w, h, type, name) {
  return new Promise(function (res) {
    var c = document.createElement('canvas'); c.width = w; c.height = h;
    var g = c.getContext('2d'); g.fillStyle = '#3a7'; g.fillRect(0, 0, w, h);
    c.toBlob(function (b) { res(new File([b], name || 'pic.jpg', { type: type || 'image/jpeg' })); }, type || 'image/jpeg', 0.9);
  });
};
// SweetAlert: wait for the dialog, then press one of its buttons
var swalBtn = async function (sel) { await waitFor(function () { return $('.swal-overlay--show-modal') && $(sel); }, 5000); await sleep(300); click($(sel)); await sleep(600); };
// window.open and the click of a download link, recorded instead of done (a new tab / a saved file is not something the dump can see)
var stubFileActions = function () {
  var log = [];
  var origClick = HTMLAnchorElement.prototype.click;
  HTMLAnchorElement.prototype.click = function () { if (this.download) { log.push('DOWNLOAD ' + this.download); return; } return origClick.apply(this, arguments); };
  window.__extra = async function () { return log.concat(odsSummary()); };
};
// the main button of each mode (by the handler it carries) and the steps of the "create lead" modal
var NEW_LEAD = 'button[onclick*="ctdOpenCreateLeadModal"]';
var VIEW_LEAD = 'button[onclick*="openCreateLeadModal"]';
var UPDATE = 'button[onclick*="ctdOpenUpdateConfirmModal"]';
// a select of the modal: its option n chosen (the ODS select is hidden, its change is the page's)
var pickIn = async function (id, n) { var el = document.getElementById(id); await waitFor(function () { return el.options.length > n; }, 6000); el.value = el.options[n].value; el.dispatchEvent(new Event('change', { bubbles: true })); await sleep(500); };
var OPEN_MODAL = async function (_s, name) { click(radioBox('form:customer_type', 0)); await sleep(400); await typeField(field('customer_name_input'), name || 'ทดสอบ ระบบ'); click(NEW_LEAD); await sleep(1200); };
var SUBMIT = async function (_s, name) { await OPEN_MODAL(_s, name); await pickIn('clProduct', 1); await sleep(800); await pickIn('clStepGroup', 1); await sleep(600); await pickIn('clOwner', 1); await pickIn('clSales', 1); click('#createLeadSubmitBtn'); await sleep(2500); };
// (the scroll container of the Java layout and the one of the Angular shell end at different places — a field at the bottom of the page scrolls them to different offsets: the scenario scrolls back)
var toTop = async function () { window.scrollTo(0, 0); $$('.layout-content, main.content').forEach(function (e) { e.scrollTop = 0; }); await sleep(200); };
var typeField = async function (el, v) { el.scrollIntoView({ block: 'center' }); await sleep(100); el.focus(); el.value = v; el.dispatchEvent(new Event('input', { bubbles: true })); el.dispatchEvent(new Event('change', { bubbles: true })); await sleep(300); };
`,
  normalize,
  async build(ctx) {
    const out = {};
    for (const lang of ['th', 'en']) {
      for (const [mode, id] of MODES) {
        if (lang === 'en' && !EN.has(`${mode}:${id}`)) continue;
        const n = viewName(mode, id, lang);
        out[`/triplesale/pages/${n}.xhtml`] = (await buildForm(ctx, { mode, id, lang, name: n })).file;
      }
    }
    return out;
  },
  newState,
  handle,
};
