// Scenarios: the rest of the quotation / booking / delivery note — the document information (date, branch, employee, warehouse), the reference
// to another document, the remarks, the way back to the list. (The auto-dealer forms have theirs in scenarios-auto.mjs.)
export default function (add, S) {
  const ITEMS = ['qt', 'bk', 'ob'];
  const NONE = ['.no-such-root']; // (the page leaves — Angular moves to the list, Java is held back — so only the address is compared)
  const last = (id) => `var s = $id('${id}'); pick(s, s.options[s.options.length - 1].value); await sleep(250);`;
  ITEMS.forEach((t) => {
    /* ---- document information ---- */
    add(`${t}-doc-date`, { type: t }, S(t, `typ('DocDate', '2026-12-31'); await sleep(250);`));
    add(`${t}-doc-date-empty`, { type: t }, S(t, `typ('DocDate', ''); await sleep(250);`));
    add(`${t}-doc-date-empty-dark`, { type: t, theme: 'dark' }, S(t, `typ('DocDate', ''); await sleep(250);`));
    add(`${t}-doc-date-empty-en`, { type: t, lang: 'en' }, S(t, `typ('DocDate', ''); await sleep(250);`));
    add(`${t}-doc-date-old`, { type: t }, S(t, `typ('DocDate', '1999-01-01'); await sleep(250);`));
    add(`${t}-doc-date-sanitised`, { type: t }, S(t, `typ('DocDate', '2026-02-30'); await sleep(250);`)); // not a date: the browser empties the field
    add(`${t}-doc-branch-pick`, { type: t }, S(t, `${last('DocBranch')}`));
    add(`${t}-doc-branch-clear`, { type: t }, S(t, `pick($id('DocBranch'), ''); await sleep(250);`));
    add(`${t}-doc-employee-pick`, { type: t }, S(t, `${last('DocEmployee')}`));
    add(`${t}-doc-employee-clear`, { type: t }, S(t, `pick($id('DocEmployee'), ''); await sleep(250);`));
    add(`${t}-doc-employee-clear-dark`, { type: t, theme: 'dark' }, S(t, `pick($id('DocEmployee'), ''); await sleep(250);`));
    add(`${t}-doc-employee-clear-390`, { type: t, w: 390, h: 844 }, S(t, `pick($id('DocEmployee'), ''); await sleep(250);`));
    add(`${t}-doc-no`, { type: t }, S(t, `var n = $id('DocNo'); await sleep(150);`));
    // the lists of the shell's drop-down (ods): opened by a click on the button
    add(`${t}-doc-employee-open`, { type: t }, S(t, `$id('DocEmployee').parentNode.querySelector('.ods-btn').click(); await sleep(350);`));
    add(`${t}-doc-employee-open-dark`, { type: t, theme: 'dark' }, S(t, `$id('DocEmployee').parentNode.querySelector('.ods-btn').click(); await sleep(350);`));
    add(`${t}-doc-branch-open`, { type: t }, S(t, `$id('DocBranch').parentNode.querySelector('.ods-btn').click(); await sleep(350);`));
    add(`${t}-doc-branch-open-390`, { type: t, w: 390, h: 844 }, S(t, `$id('DocBranch').parentNode.querySelector('.ods-btn').click(); await sleep(350);`));

    /* ---- the remarks ---- */
    add(`${t}-remarks`, { type: t }, S(t, `typ('Remarks', 'หมายเหตุ ทดสอบ'); await sleep(250);`));
    add(`${t}-remarks-multiline`, { type: t }, S(t, `typ('Remarks', 'บรรทัดที่ 1\\nบรรทัดที่ 2\\nบรรทัดที่ 3\\nบรรทัดที่ 4'); await sleep(250);`));
    add(`${t}-remarks-forbidden`, { type: t }, S(t, `typ('Remarks', 'a<b>c'); await sleep(250);`));
    add(`${t}-remarks-forbidden-dark`, { type: t, theme: 'dark' }, S(t, `typ('Remarks', 'a<b>c'); await sleep(250);`));
    add(`${t}-remarks-forbidden-en`, { type: t, lang: 'en' }, S(t, `typ('Remarks', 'a{b}c'); await sleep(250);`));
    add(`${t}-remarks-too-long`, { type: t }, S(t, `typ('Remarks', new Array(1002).join('x')); await sleep(250);`));
    add(`${t}-remarks-max`, { type: t }, S(t, `typ('Remarks', new Array(1001).join('x')); await sleep(250);`));
    add(`${t}-remarks-fixed-after-error`, { type: t }, S(t, `typ('Remarks', 'a<b>c'); await sleep(150); typ('Remarks', 'ok'); await sleep(250);`));

    /* ---- the way back ---- */
    add(`${t}-back-click`, { type: t, roots: NONE }, S(t, `trackNav(side); document.querySelector('.qt-back').click(); await sleep(500);`));
  });

  /* ---- the reference number of the quotation ---- */
  add('qt-refno', { type: 'qt' }, S('qt', `typ('RefNo', 'PO-2026/001_a.b'); await sleep(250);`));
  add('qt-refno-invalid', { type: 'qt' }, S('qt', `typ('RefNo', 'ก ข'); await sleep(250);`));
  add('qt-refno-invalid-dark', { type: 'qt', theme: 'dark' }, S('qt', `typ('RefNo', 'ก ข'); await sleep(250);`));
  add('qt-refno-invalid-en', { type: 'qt', lang: 'en' }, S('qt', `typ('RefNo', 'a b'); await sleep(250);`));
  add('qt-refno-too-long', { type: 'qt' }, S('qt', `typ('RefNo', new Array(52).join('x')); await sleep(250);`));
  add('qt-refno-max', { type: 'qt' }, S('qt', `typ('RefNo', new Array(51).join('x')); await sleep(250);`));

  /* ---- the reference of the booking: a quotation it comes from ---- */
  const open = `$id('RefQtDocSearchBtn').click(); await sleep(500);`;
  add('bk-ref-open', { type: 'bk' }, S('bk', open));
  add('bk-ref-open-dark', { type: 'bk', theme: 'dark' }, S('bk', open));
  add('bk-ref-open-en', { type: 'bk', lang: 'en' }, S('bk', open));
  add('bk-ref-open-390', { type: 'bk', w: 390, h: 844 }, S('bk', open));
  add('bk-ref-search-number', { type: 'bk' }, S('bk', `${open} typ('RefQtDocSNo', 'QT'); await sleep(700);`));
  add('bk-ref-search-name', { type: 'bk' }, S('bk', `${open} typ('RefQtDocSName', 'ทดสอบ'); await sleep(700);`));
  add('bk-ref-search-forbidden', { type: 'bk' }, S('bk', `${open} typ('RefQtDocSNo', 'a<b'); await sleep(700);`));
  add('bk-ref-close-x', { type: 'bk' }, S('bk', `${open} $id('RefQtDocSearchModal').querySelector('[data-close]').click(); await sleep(350);`));
  add('bk-ref-close-esc', { type: 'bk' }, S('bk', `${open} $id('RefQtDocSearchModal').dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true })); await sleep(350);`));
  add('bk-ref-close-backdrop', { type: 'bk' }, S('bk', `${open} $id('RefQtDocSearchModal').click(); await sleep(350);`));
  add('bk-ref-reopen', { type: 'bk' }, S('bk', `${open} typ('RefQtDocSNo', 'QT'); await sleep(400); $id('RefQtDocSearchModal').querySelector('[data-close]').click(); await sleep(300); ${open}`));

  /* ---- the booking's own blocks: the warehouse, the paid-now bar, the summary ---- */
  add('bk-wh-pick', { type: 'bk' }, S('bk', `${last('DocWh')}`));
  add('bk-wh-clear', { type: 'bk' }, S('bk', `pick($id('DocWh'), ''); await sleep(250);`));
  add('ob-wh-pick', { type: 'ob' }, S('ob', `${last('DocWh')}`));
  add('ob-wh-clear', { type: 'ob' }, S('ob', `pick($id('DocWh'), ''); await sleep(250);`));

  /* ---- the messages of the validation that the scenarios of the blocks do not reach ---- */
  const toCreate = `$id('CustSearchBtn').click(); await sleep(150); $id('ToCreate').click(); await sleep(250);`;
  const newCust = (field, value) => `${toCreate} typ('FName', 'ลูกค้าใหม่'); typ('FTaxId', '1234567890121'); typ('FAddr', 'ที่อยู่ 1'); typ(${JSON.stringify(field)}, ${JSON.stringify(value)}); $id('FormSubmit').click(); await sleep(500);`;
  ['qt', 'bk', 'ob', 'aq', 'ad'].forEach((t) => {
    add(`${t}-cust-create-invalid-country`, { type: t }, S(t, newCust('FCountry', 'abc123')));
    add(`${t}-cust-create-invalid-country-en`, { type: t, lang: 'en' }, S(t, newCust('FCountry', 'abc123')));
  });
  // "no duplicate tax id" (quotation only): the rows of the pick must carry the tax id — the servlet of today sends none, the fault `prospects-taxid` gives them
  const dup = `${toCreate} typ('FName', 'ลูกค้าใหม่'); typ('FTaxId', '1000000000017'); typ('FAddr', 'ที่อยู่ 1'); $id('FormSubmit').click(); await sleep(900);`;
  add('qt-cust-taxid-dup', { type: 'qt', mock: 'prospects-taxid' }, S('qt', dup));
  add('qt-cust-taxid-dup-dark', { type: 'qt', mock: 'prospects-taxid', theme: 'dark' }, S('qt', dup));
  add('qt-cust-taxid-dup-en', { type: 'qt', mock: 'prospects-taxid', lang: 'en' }, S('qt', dup));
  add('qt-cust-taxid-dup-390', { type: 'qt', mock: 'prospects-taxid', w: 390, h: 844 }, S('qt', dup));
  add('qt-cust-taxid-dup-fixed', { type: 'qt', mock: 'prospects-taxid' }, S('qt', `${dup} typ('FTaxId', '1234567890121'); $id('FormSubmit').click(); await sleep(900);`));
  add('qt-cust-taxid-edit-unchanged', { type: 'qt', mock: 'prospects-taxid' }, S('qt', `await pickCust(0); $id('CustEditBtn').click(); await sleep(300); $id('FormSubmit').click(); await sleep(900);`));
  add('bk-cust-taxid-dup-not-checked', { type: 'bk', mock: 'prospects-taxid' }, S('bk', dup));
  const oneItem = "setProduct(0, 'ACC-A001'); await sleep(100);";
  // a discount that has to be given (an item without a discount cell value), the discount of the whole document, a payment that was filled and no longer fits
  ['qt', 'bk', 'ob'].forEach((t) => {
    add(`${t}-save-disc-empty`, { type: t }, S(t, `await fillValid(); typ(cell(row(0), 'disc'), ''); await save(500);`));
    add(`${t}-save-disc-empty-en`, { type: t, lang: 'en' }, S(t, `await fillValid(); typ(cell(row(0), 'disc'), ''); await save(500);`));
    add(`${t}-xdisc-format`, { type: t }, S(t, `${oneItem} typ($id('Discount'), '12.5.5'); await sleep(250);`));
    add(`${t}-xdisc-format-percent`, { type: t }, S(t, `${oneItem} typ($id('Discount'), '12.345%'); await sleep(250);`));
    add(`${t}-xdisc-format-dark`, { type: t, theme: 'dark' }, S(t, `${oneItem} typ($id('Discount'), '12.5.5'); await sleep(250);`));
  });
  ['qt', 'bk'].forEach((t) => {
    add(`${t}-save-pay-stale`, { type: t }, S(t, `await fillValid(); pick($id('CType'), 'schedule'); await sleep(300); typ($id('PsRows').rows[0].querySelector('[data-p="gross"]'), '2185'); $id('PsSubmit').click(); await sleep(300); typ(cell(row(0), 'qty'), '5'); await sleep(300); await save(500);`));
  });
  // more than two decimals in an amount
  add('ob-fin-invalid-decimals', { type: 'ob' }, S('ob', `setProduct(0, 'ACC-A001'); typ(cell(row(0), 'qty'), '2'); await sleep(150); pick($id('SaleType'), 'FINANCE'); await sleep(250); typ($f('Markup'), '12.345'); await sleep(250);`));
  ['aq', 'ad'].forEach((t) => {
    add(`${t}-hp-invalid-decimals`, { type: t }, S(t, `await pickVeh(0); typ('Down', '1.234'); await sleep(250);`));
    add(`${t}-price-plus-decimals`, { type: t }, S(t, `await pickVeh(0); typ('Plus', '1.234'); await sleep(250);`));
  });
}
