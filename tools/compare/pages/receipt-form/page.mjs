// Comparison setup of the receipt form (/sales/receipts/new) — see tools/compare/README.md for the interface of a page.
//
// Java side: the REAL page (the head of sales_doc_rv.xhtml — drag_scroll, its <style> —, the markup, the tab strip component and the page
// script, EL resolved the way the server would) inside the shell replica. Its BFF (/triplesale/rvapi, /board/lead, /board/prospect,
// /board/prospect-list) is the SAME mock the Angular page runs (receipts.mock.ts) — see ../receipts/replica.mjs, shared with the list.
// Scenario options: q = the query string of the address ("leadId=5&activityGroupId=101"), mock = a fault of the mock (?mock=, see receipts.mock.ts).
import { PRE_COMMON, buildReplica, handle, newState, normalize, upstream } from '../receipts/replica.mjs';

const query = (opts) => {
  const s = [opts.q, opts.mock ? 'mock=' + opts.mock : ''].filter(Boolean).join('&');
  return s ? '?' + s : '';
};

export default {
  name: 'receipt-form',
  // .rv-root = the page; the dialogs / popovers (they stay in place, position: fixed), the item picker panel (appended to <body>), the
  // dropdowns and calendars of the shell (ods), the SweetAlert dialogs / toasts
  // (#rvCustPop — 240 customers — is added by the scenarios that open the picker)
  roots: ['.rv-root', '#rvPayDlgOverlay', '#rvSuccessOverlay', '.rv-item-panel', '.ods-list', '.swal-overlay'],
  // the masters are in: the payment methods, the branches, and the currency list the page rebuilds
  ready: `document.querySelector('#rvMethods .rv-method[data-m]') && document.querySelectorAll('#rvBranch option').length > 1 && document.querySelector('#rvCurrency option[data-rate]')`,
  javaPath: (lang, opts) => `/triplesale/pages/${lang === 'en' ? 'sales_doc_rv-en' : 'sales_doc_rv'}.xhtml${query(opts)}`,
  ngPath: (_lang, opts) => `/sales/receipts/new${query(opts)}`,
  latencyMs: 150,
  // helpers of this page's scenarios
  pre:
    PRE_COMMON +
    `
var rowEl = function (i) { return $$('#rvBody tr')[i]; };
var addRow = async function () { click('#rvAddItem'); await sleep(120); };
// opens the item picker of row i and chooses an item (by code; '' = the "select" entry)
var pickItem = async function (i, code) { click(rowEl(i).querySelector('.rv-item-toggle')); await sleep(450); click('.rv-item-panel .rv-item-opt[data-val="' + code + '"]'); await sleep(120); };
var setMethod = async function (i, v) { pick(rowEl(i).querySelector('.rv-c-method'), v); await sleep(80); };
var setCell = async function (i, cls, v) { typeIn(rowEl(i).querySelector(cls), v); await sleep(60); };
// a line: tax mode, item, value (the value of the item's standard price is filled by the picker when it has one)
var line = async function (i, mode, code, value) { if (i >= $$('#rvBody tr').length) await addRow(); await setMethod(i, mode); await pickItem(i, code); if (value != null) await setCell(i, '.rv-c-value', value); };
var choosePayer = async function (code) { click('#rvCustBtn'); await sleep(350); click('#rvCustOpts .rv-cust-opt[data-code="' + code + '"]'); await sleep(250); };
var openPay = async function (label, ms) { click('#rvMethods .rv-method[data-m="' + label + '"]'); await sleep(ms || 250); };
var keys = async function (s) { for (var i = 0; i < s.length; i++) { click('.rv-pd-key[data-k="' + s[i] + '"]'); } await sleep(60); };
var payOk = async function (ms) { click('#rvPayDlgOk'); await sleep(ms || 300); };
// a payment: the method, the keys, Enter ('' keys = the amount the dialog filled in itself)
var pay = async function (label, digits, acct) {
  await openPay(label);
  if (acct) { click('#rvPdAcctTrigger'); await sleep(150); click('#rvPdAcctOpts .rv-pd-opt[data-v="' + acct + '"]'); await sleep(100); }
  if (digits) await keys(digits);
  await payOk();
};
var branch = async function (code) { pick('#rvBranch', code); await sleep(100); };
var saveClick = async function (ms) { click('#rvSave'); await sleep(ms || 400); };
var swalOk = async function (ms) { click('.swal-button--confirm'); await sleep(ms || 300); };
var swalCancel = async function (ms) { click('.swal-button--cancel'); await sleep(ms || 300); };
// files for the attachments input: names → File objects
var attach = async function (names, ms) {
  var dt = new DataTransfer();
  names.forEach(function (n) { dt.items.add(new File([n.indexOf('.pdf') > 0 ? '%PDF-1.4 sample' : n.indexOf('.png') > 0 ? 'png' : 'text'], n, { type: n.indexOf('.pdf') > 0 ? 'application/pdf' : n.indexOf('.png') > 0 ? 'image/png' : 'text/plain' })); });
  var input = $('#rvAttFile'); input.files = dt.files; input.dispatchEvent(new Event('change', { bubbles: true })); await sleep(ms || 400);
};
// everything a valid receipt needs: a customer from the picker, a branch, one line with VAT excluded, paid in cash (7,000.00 → net 5,350.00)
var fillValid = async function () {
  await choosePayer('P00012');
  await branch('SUN');
  await line(0, 'excl', 'SV-LOAN-FEE', '5000');
  await pay('เงินสด', '5350');
};
`,
  normalize,
  async build(ctx) {
    return buildReplica(ctx, { file: 'pages/sales_doc_rv.xhtml', name: 'sales_doc_rv' });
  },
  newState,
  handle,
  // --live: the fake REST service (triplesale-service) the Angular side's live backend talks to — see replica.mjs
  upstream,
};
