// Comparison setup of the supporting-document forms (/crm/supporting-docs/:type/:id) — see tools/compare/README.md for the interface of a page.
//
// Java side: the REAL page (sales_document_sub_1.xhtml … _7.xhtml with pages/inc/{sd_field_ro,sd_customer_field,save_confirm_dialog}.xhtml: markup rendered by
// tools/lib/jsf.mjs the way the server would, the page scripts, sd_customer_lazy.js, crm_form.css), the real PrimeFaces stylesheet and widget scripts, inside the
// shell replica — one file per family, mode and language. Its data is the SAME mock the Angular page runs; the state of the page is the SAME bean class
// (supporting-doc.bean.ts); PrimeFaces.ab posts to /triplesale/__jsf/<page> (see lib/supporting-doc-replica.mjs).
// Scenario options: doc = the family (slug), mode = add | edit | detail, k = the document (its number in the family: 8 has an attachment, a reference, a creator).
import { buildForm, handle, newState, normalize, slugs } from '../../lib/supporting-doc-replica.mjs';

const name = (doc, mode, k, lang) => `sdf-${doc}-${mode}-${mode === 'add' ? 0 : k}${lang === 'en' ? '-en' : ''}`;
const acts = (doc) => slugs.indexOf(doc) + 71;
const MODES = [['add', 0], ['edit', 8], ['detail', 8], ['edit', 1], ['detail', 1], ['edit', 4], ['detail', 4]];

export default {
  name: 'supporting-doc-form',
  // the page, the confirmation of the save, the growl, the SweetAlert of the page
  // (.ct-root: the list a save goes to)
  roots: ['.card', '#sdSaveConfirmOverlay', '.ui-selectonemenu-panel', '#ui-datepicker-div', '.ods-list', '.ui-growl', '.swal-overlay', '.ct-root'],
  ready: `(document.querySelector('.contract-tabbar') && window.PrimeFaces && document.querySelector('#sdSaveConfirmOverlay')) || document.querySelector('#sdTableBody tr')`,
  javaPath: (lang, opts) => {
    const doc = opts.doc ?? 'letter-of-intent';
    const mode = opts.mode ?? 'add';
    const k = opts.k ?? 8;
    const q = `pid=1&page_id=7&act=7&acts=${acts(doc)}&sub_id=${acts(doc) - 70}&action_type=${mode}${mode === 'add' ? '' : `&quotation_id=${(acts(doc) - 70) * 1000 + k}`}`;
    return `/triplesale/pages/${name(doc, mode, k, lang)}.xhtml?${q}`;
  },
  ngPath: (_lang, opts) => {
    const doc = opts.doc ?? 'letter-of-intent';
    const mode = opts.mode ?? 'add';
    const k = opts.k ?? 8;
    return mode === 'add' ? `/crm/supporting-docs/${doc}/new` : `/crm/supporting-docs/${doc}/${(slugs.indexOf(doc) + 1) * 1000 + k}?action_type=${mode}`;
  },
  latencyMs: 0,
  // "today" of both sides: the receive date a customer pick fills (the bean of the replica is given the same day)
  clock: [2026, 9, 20, 10, 0, 0],
  // helpers of this page's scenarios
  pre: `
// the dump compares the state of the controls (value / checked / selected as the user sees it), not the attributes the markup was written with
window.__cmpState = true;
var navCalls = [];
var trackNav = function (side) {
  navCalls = [];
  if (!window.navigation) throw new Error('no Navigation API');
  window.navigation.addEventListener('navigate', function (e) { var u = new URL(e.destination.url); navCalls.push(u.pathname + u.search); if (side === 'java') e.preventDefault(); });
  window.__extra = async function () { return ['NAV ' + navCalls.join(' ; ')]; };
};
// PrimeFaces components by their position on the page (the generated ids j_idtN differ between the Java replica and the template; the position does not)
var selEl = function (i) { return $$('.ui-selectonemenu')[i]; };
var calEl = function (i) { return $$('.ui-calendar')[i]; };
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
// files chosen in the upload bar of the documents tab: [{ name, type?, text?, size? }]; the browser takes them as a user's choice (the input's change event)
var uploadFiles = async function (specs, wait) {
  var inp = $('.ui-fileupload-choose input[type=file]');
  if (!inp) throw new Error('no upload input');
  var dt = new DataTransfer();
  specs.forEach(function (s) {
    var body = s.size ? new ArrayBuffer(s.size) : (s.text || 'content of ' + s.name);
    dt.items.add(new File([body], s.name, { type: s.type || 'application/pdf' }));
  });
  inp.files = dt.files;
  inp.dispatchEvent(new Event('change', { bubbles: true }));
  await sleep(wait || 2000);
};
// window.open and the click of a download link, recorded instead of done (a new tab / a saved file is not something the dump can see). The Java servlet streams a file
// of the browser at /docattach; the Angular page opens its object URL: both are "a file of this browser", whatever the address
var stubFileActions = function () {
  var log = [];
  var kind = function (u) { u = String(u); return u.indexOf('blob:') === 0 || u.indexOf('/docattach?') >= 0 ? 'BROWSER-FILE' : u; };
  window.open = function (u, target) { log.push('OPEN ' + kind(u) + ' ' + (target || '')); return null; };
  var origClick = HTMLAnchorElement.prototype.click;
  HTMLAnchorElement.prototype.click = function () { if (this.download) { log.push('DOWNLOAD ' + this.download + ' ' + kind(this.href)); return; } return origClick.apply(this, arguments); };
  window.__extra = async function () { return log; };
};
var typeFilter = async function (el, v) {
  // the search box of a select panel: PrimeFaces listens to keyup
  el.focus();
  el.value = v;
  el.dispatchEvent(new Event('input', { bubbles: true }));
  el.dispatchEvent(new KeyboardEvent('keyup', { key: 'a', code: 'KeyA', bubbles: true }));
  await sleep(60);
};
var pickCustomer = async function (sleep, n) {
  await openSel(0);
  var li = $$('[id="' + selEl(0).id + '_panel"] .ui-selectonemenu-item')[n];
  if (!li) throw new Error('no customer ' + n);
  li.click();
  await sleep(1100);
};
var openCal = async function (i) { click(calEl(i).querySelector('.ui-datepicker-trigger')); await sleep(500); };
var confirmOpen = async function (sleep) { click($$('.sd-save-btn')[0]); await sleep(300); };
var tab = async function (n) { click('.contract-tabbar .ct-tab[data-tab="' + n + '"]'); await sleep(250); };
var typeField = async function (el, v) { el.focus(); el.value = v; el.dispatchEvent(new Event('input', { bubbles: true })); el.dispatchEvent(new Event('change', { bubbles: true })); await sleep(60); };
`,
  normalize,
  async build(ctx) {
    const out = {};
    for (const lang of ['th', 'en']) {
      for (const doc of slugs) {
        for (const [mode, k] of MODES) {
          if (lang === 'en' && !(mode === 'add' || (mode === 'edit' && k === 8) || (mode === 'detail' && k === 8))) continue;
          if (mode !== 'add' && k !== 8 && doc !== 'letter-of-intent' && doc !== 'credit-application') continue;
          const n = name(doc, mode, k, lang);
          out[`/triplesale/pages/${n}.xhtml`] = (await buildForm(ctx, { t: doc, lang, mode, k, name: n })).file;
        }
      }
    }
    return out;
  },
  newState,
  handle,
};
