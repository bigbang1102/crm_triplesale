// The helpers every scenario of the sales-document forms uses (code that runs IN the page under test: Java replica / Angular app).
// A scenario sets `var P = '<type>'` first (see scenarios.mjs, S()); the helpers read it when they are called.
export const FORM_PRE = `
var $id = function (s) { return document.getElementById(P + s); };
// the finance block of the delivery note has the prefix 'obf'
var $f = function (s) { return document.getElementById('obf' + s); };
var evt = function (el, t) { el.dispatchEvent(new (t === 'focusin' || t === 'focusout' ? FocusEvent : Event)(t, { bubbles: true })); };
// what a user does in a field: enter it, type, leave it (the scripts format / validate on input, change and focusout)
var typ = function (el, v) { var nm = el; if (typeof el === 'string') el = $id(el); if (!el) throw new Error('typ: no field ' + nm); evt(el, 'focusin'); el.value = v; evt(el, 'input'); evt(el, 'change'); evt(el, 'focusout'); };
var row = function (i) { return $id('Items').rows[i]; };
var cell = function (tr, f) { return tr.querySelector('[data-f="' + f + '"]'); };
var addRow = async function () { $id('AddRow').click(); await sleep(80); };
var setProduct = function (i, code) { pick(cell(row(i), 'item'), code); };
var openCust = async function () { $id('CustSearchBtn').click(); await waitFor(function () { return $id('ResultBody').querySelector('[data-pick]'); }, 6000); await sleep(100); };
var pickCust = async function (n) { await openCust(); $id('ResultBody').querySelectorAll('[data-pick]')[n || 0].click(); await sleep(300); };
// a customer made in the pop-up (the way to a customer with a tax id: the list of the pick has none)
var createCust = async function (o) {
  o = o || {};
  $id('CustSearchBtn').click(); await sleep(150);
  $id('ToCreate').click(); await sleep(150);
  typ('FName', o.name || 'บริษัท ทดสอบ จำกัด');
  typ('FTaxId', o.tax || '1234567890121');
  typ('FAddr', o.addr || '99/9 ถนนสุขุมวิท กรุงเทพ');
  if (o.more) Object.keys(o.more).forEach(function (k) { typ(k, o.more[k]); });
  $id('FormSubmit').click();
  await sleep(600);
};
// console.debug of the payload, written into the dump (the time stamps are normalised by the page)
var spyPayload = function () {
  var out = [];
  console.debug = function () { try { out.push(Array.prototype.map.call(arguments, function (a) { return typeof a === 'string' ? a : JSON.stringify(a); }).join(' ')); } catch (e) { out.push('ERR ' + e.message); } };
  var prev = window.__extra;
  window.__extra = async function () { return out.map(function (s) { return 'PAYLOAD ' + s; }).concat(prev ? await prev() : []); };
};
// the dialogs the scripts open with window.print() of the preview frame: record them (both sides), do not open any
var printCalls = 0;
var stubPrint = function () { printCalls = 0; var f = $id('PsFrame'); if (f && f.contentWindow) { f.contentWindow.print = function () { printCalls++; }; } };
var saveBtn = function () { return $id('SaveBtn') || $id('SaveTopBtn'); };
var save = async function (ms) { saveBtn().click(); await sleep(ms || 500); };
// the header fields every document asks for
var fillDocHeader = function () { var d = $id('DocDate'); if (d && !d.value) typ(d, '2026-10-20'); };
// a document that passes every check of its type (what a user has to give)
var fillValid = async function () {
  var qty = function (i, v) { typ(cell(row(i), 'qty'), v); };
  if (P === 'aq' || P === 'ad') {
    await createCust({ more: { FTel: '0812345678' } });
    await pickVeh(0);
    if (P === 'ad') typ('Dep', '1000');
    await sleep(150);
    return;
  }
  await createCust();
  if (P === 'ob') {
    var wh = $id('DocWh'); if (wh && wh.options.length > 1) pick(wh, wh.options[1].value);
  }
  setProduct(0, 'ACC-A001'); await sleep(80); qty(0, '2');
  if ($id('CType')) pick($id('CType'), 'cash');
  await sleep(150);
};
// a vehicle of the auto-dealer forms: the first type, series and colour of the master data (the car follows when only one matches)
var pickVeh = async function (i) {
  var fields = ['vtype', 'series', 'color'];
  for (var k = 0; k < fields.length; k++) { var s = $id('VehRows').rows[i].querySelector('[data-f="' + fields[k] + '"]'); pick(s, s.options[1].value); await sleep(150); }
  var c = $id('VehRows').rows[i].querySelector('[data-f="code"]');
  if (!c.value) pick(c, c.options[1].value);
  await sleep(200);
};
var billBar = function () { var b = document.getElementById('sdBar'); return b ? b.className + ' | ' + b.textContent : '-'; };
// every file a user can pick: a File put into the input of the attachments (the way a browser does) and the change event
var attachFiles = async function (files) {
  var dt = new DataTransfer();
  files.forEach(function (f) { dt.items.add(new File([f.body || 'x'], f.name, { type: f.type || 'application/pdf' })); });
  var input = $id('AttachInput');
  input.files = dt.files;
  input.dispatchEvent(new Event('change', { bubbles: true }));
};
`;
