// Scenarios: what only the delivery note (ob) has — the sale type "finance" block (SalesDocFinance), the summary card, the trade-in partner pop-up,
// the nine payment methods (SalesDocPayModal + SalesDocModal) and the payment table, the insurance blocks, the reference to a booking / quotation.
export default function (add, S) {
  const t = 'ob';
  const total = `setProduct(0, 'ACC-A001'); typ(cell(row(0), 'qty'), '2'); await sleep(150);`;
  const swalUp = `await waitFor(function () { return $('.swal-overlay--show-modal'); }, 4000); await sleep(300);`;
  const fin = `pick($id('SaleType'), 'FINANCE'); await sleep(250);`;
  const radio = (v) => `var r = document.querySelector('input[name="obfDownMode"][value="${v}"]'); r.checked = true; r.dispatchEvent(new Event('change', { bubbles: true }));`;

  /* ---- sale type: cash / finance ---- */
  add('ob-sale-type-cash', { type: t }, S(t, `${total} pick($id('SaleType'), 'CASH'); await sleep(250);`));
  add('ob-fin-open', { type: t }, S(t, `${total} ${fin}`));
  add('ob-fin-open-dark', { type: t, theme: 'dark' }, S(t, `${total} ${fin}`));
  add('ob-fin-open-en', { type: t, lang: 'en' }, S(t, `${total} ${fin}`));
  add('ob-fin-open-390', { type: t, w: 390, h: 844 }, S(t, `${total} ${fin}`));
  add('ob-fin-open-1920', { type: t, w: 1920, h: 1080 }, S(t, `${total} ${fin}`));
  add('ob-fin-back-to-cash', { type: t }, S(t, `${total} ${fin} pick($id('SaleType'), 'CASH'); await sleep(250);`));
  add('ob-fin-down-amount', { type: t }, S(t, `${total} ${fin} typ($f('DownAmount'), '500'); await sleep(250);`));
  add('ob-fin-down-amount-over', { type: t }, S(t, `${total} ${fin} typ($f('DownAmount'), '999999'); await sleep(250);`));
  add('ob-fin-down-percent', { type: t }, S(t, `${total} ${fin} ${radio('PERCENT')} typ($f('DownPct'), '20'); await sleep(250);`));
  add('ob-fin-down-percent-over', { type: t }, S(t, `${total} ${fin} ${radio('PERCENT')} typ($f('DownPct'), '250'); await sleep(250);`));
  add('ob-fin-markup', { type: t }, S(t, `${total} ${fin} typ($f('Markup'), '150.5'); await sleep(250);`));
  add('ob-fin-deposits', { type: t }, S(t, `${total} ${fin} typ($f('DownAmount'), '1000'); typ($f('Deposit'), '100'); typ($f('DownDiscount'), '50'); typ($f('MarkupDiscount'), '25'); await sleep(250);`));
  add('ob-fin-rate-installment', { type: t }, S(t, `${total} ${fin} typ($f('InterestRate'), '3.5'); typ($f('Installment'), '1200'); await sleep(250);`));
  add('ob-fin-invalid-number', { type: t }, S(t, `${total} ${fin} typ($f('Markup'), 'abc'); await sleep(250);`));
  add('ob-fin-invalid-number-dark', { type: t, theme: 'dark' }, S(t, `${total} ${fin} typ($f('Markup'), 'abc'); await sleep(250);`));
  add('ob-fin-invalid-free-text', { type: t }, S(t, `${total} ${fin} typ($f('MarkupDesc'), 'a<b'); await sleep(250);`));
  add('ob-fin-invalid-name', { type: t }, S(t, `${total} ${fin} typ($f('BorrowerName'), 'a<b'); typ($f('BorrowerAddr'), 'ที่อยู่ <b>'); await sleep(250);`));
  add('ob-fin-with-items-change', { type: t }, S(t, `${total} ${fin} typ(cell(row(0), 'qty'), '10'); await sleep(250);`));

  /* ---- the summary card ---- */
  add('ob-summary-total', { type: t }, S(t, `${total}`));
  add('ob-summary-booking-deposit', { type: t }, S(t, `${total} typ('BookingDeposit', '500'); await sleep(250);`));
  add('ob-summary-trade-in', { type: t }, S(t, `${total} typ('TradeInAmount', '300'); await sleep(250);`));
  add('ob-summary-both', { type: t }, S(t, `${total} typ('BookingDeposit', '500'); typ('TradeInAmount', '300'); await sleep(250);`));
  add('ob-summary-invalid-deposit', { type: t }, S(t, `${total} typ('BookingDeposit', 'abc'); await sleep(250);`));
  add('ob-summary-dark', { type: t, theme: 'dark' }, S(t, `${total} typ('BookingDeposit', '500'); await sleep(250);`));
  add('ob-summary-390', { type: t, w: 390, h: 844 }, S(t, `${total} typ('BookingDeposit', '500'); await sleep(250);`));
  ['obBtnPromotion', 'obBtnOtherIncome', 'obBtnExpense', 'obBtnReturnItems', 'obBtnTopup'].forEach((id) => {
    add(`ob-summary-action-${id}`, { type: t }, S(t, `document.getElementById('${id}').click(); ${swalUp}`));
  });
  add('ob-summary-action-en', { type: t, lang: 'en' }, S(t, `document.getElementById('obBtnTopup').click(); ${swalUp}`));
  add('ob-save-draft', { type: t }, S(t, `$id('SaveDraftBtn').click(); ${swalUp}`));
  add('ob-save-draft-en', { type: t, lang: 'en' }, S(t, `$id('SaveDraftBtn').click(); ${swalUp}`));
  add('ob-save-draft-dark', { type: t, theme: 'dark' }, S(t, `$id('SaveDraftBtn').click(); ${swalUp}`));
  add('ob-save-bottom-button', { type: t }, S(t, `$id('SaveBtn').click(); await sleep(500);`));

  /* ---- the trade-in partner ---- */
  const partner = `$id('BtnTradeInPartner').click(); await sleep(400);`;
  add('ob-partner-open', { type: t }, S(t, partner));
  add('ob-partner-open-dark', { type: t, theme: 'dark' }, S(t, partner));
  add('ob-partner-open-en', { type: t, lang: 'en' }, S(t, partner));
  add('ob-partner-open-390', { type: t, w: 390, h: 844 }, S(t, partner));
  add('ob-partner-search', { type: t }, S(t, `${partner} typ('PtSearch', 'abc'); await sleep(300);`));
  add('ob-partner-refresh', { type: t }, S(t, `${partner} typ('PtSearch', 'abc'); $id('PtRefresh').click(); await sleep(300);`));
  add('ob-partner-pager', { type: t }, S(t, `${partner} $id('PtPager').querySelector('button[data-pg="2"]').click(); await sleep(300);`));
  add('ob-partner-pager-first', { type: t }, S(t, `${partner} $id('PtPager').querySelector('button[data-pg="1"]').click(); await sleep(300);`));
  add('ob-partner-select-empty', { type: t }, S(t, `${partner} $id('PtSelect').click(); await sleep(300);`));
  add('ob-partner-close-x', { type: t }, S(t, `${partner} $id('PtX').click(); await sleep(300);`));
  add('ob-partner-close-backdrop', { type: t }, S(t, `${partner} $id('PtOverlay').click(); await sleep(300);`));
  add('ob-partner-close-esc', { type: t }, S(t, `${partner} document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true })); await sleep(300);`));
  add('ob-partner-resize', { type: t }, S(t, `${partner} win.dispatchEvent(new Event('resize')); await sleep(300);`));

  /* ---- the payment methods ---- */
  const KEYS = ['CASH', 'CREDIT', 'DEBIT', 'TRANSFER', 'CHEQUE', 'QR', 'GIFTCARD', 'POINTS', 'OTHER'];
  const method = (k) => `document.querySelector('.bk-pay-method-btn[data-key="${k}"]').click(); await sleep(400);`;
  KEYS.forEach((k) => {
    add(`ob-paymethod-${k.toLowerCase()}`, { type: t }, S(t, `${total} ${method(k)}`));
  });
  add('ob-paymethod-cash-dark', { type: t, theme: 'dark' }, S(t, `${total} ${method('CASH')}`));
  add('ob-paymethod-credit-en', { type: t, lang: 'en' }, S(t, `${total} ${method('CREDIT')}`));
  add('ob-paymethod-qr-390', { type: t, w: 390, h: 844 }, S(t, `${total} ${method('QR')}`));
  add('ob-paymethod-confirm-cash', { type: t }, S(t, `${total} ${method('CASH')} $id('PmOk').click(); await sleep(400);`));
  add('ob-paymethod-confirm-transfer', { type: t }, S(t, `${total} ${method('TRANSFER')} typ('PmF_refNo', 'REF123'); typ('PmF_amount', '1000'); $id('PmOk').click(); await sleep(400);`));
  add('ob-paymethod-confirm-credit', { type: t }, S(t, `${total} ${method('CREDIT')} pick($id('PmF_bank'), $id('PmF_bank').options[1].value); typ('PmF_cardNo', '1234'); typ('PmF_approval', 'AP55'); $id('PmOk').click(); await sleep(400);`));
  add('ob-paymethod-confirm-cheque', { type: t }, S(t, `${total} ${method('CHEQUE')} typ('PmF_chequeNo', 'CH001'); typ('PmF_amount', '500'); $id('PmOk').click(); await sleep(400);`));
  add('ob-paymethod-amount-zero', { type: t }, S(t, `${total} ${method('OTHER')} typ('PmF_amount', '0'); $id('PmOk').click(); ${swalUp}`));
  add('ob-paymethod-amount-zero-en', { type: t, lang: 'en' }, S(t, `${total} ${method('OTHER')} typ('PmF_amount', '0'); $id('PmOk').click(); ${swalUp}`));
  add('ob-paymethod-cancel', { type: t }, S(t, `${total} ${method('CASH')} $id('PmCancel').click(); await sleep(300);`));
  add('ob-paymethod-x', { type: t }, S(t, `${total} ${method('CASH')} $id('PmX').click(); await sleep(300);`));
  add('ob-paymethod-backdrop', { type: t }, S(t, `${total} ${method('CASH')} $id('PmOverlay').click(); await sleep(300);`));
  add('ob-paymethod-esc', { type: t }, S(t, `${total} ${method('CASH')} document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true })); await sleep(300);`));
  add('ob-paymethod-money-format', { type: t }, S(t, `${total} ${method('CASH')} typ('PmF_received', '2500'); await sleep(250);`));
  add('ob-paymethod-date-field', { type: t }, S(t, `${total} ${method('TRANSFER')} typ('PmF_date', '2026-10-31'); await sleep(250);`));
  // the rows of the payment table
  const paid = `${total} ${method('CASH')} typ('PmF_received', '1000'); typ('PmF_amount', '1000'); $id('PmOk').click(); await sleep(400);`;
  add('ob-pay-row-one', { type: t }, S(t, paid));
  add('ob-pay-row-two', { type: t }, S(t, `${paid} ${method('TRANSFER')} typ('PmF_refNo', 'T9'); $id('PmOk').click(); await sleep(400);`));
  add('ob-pay-row-edit', { type: t }, S(t, `${paid} typ($id('PayRows').rows[0].querySelector('[data-f="amount"]'), '2000'); await sleep(250);`));
  add('ob-pay-row-edit-code', { type: t }, S(t, `${paid} typ($id('PayRows').rows[0].querySelector('[data-f="code"]'), 'X-1'); await sleep(250);`));
  add('ob-pay-row-invalid', { type: t }, S(t, `${paid} typ($id('PayRows').rows[0].querySelector('[data-f="amount"]'), 'abc'); await sleep(250);`));
  add('ob-pay-row-remove', { type: t }, S(t, `${paid} $id('PayRows').rows[0].querySelector('.qt-del').click(); await sleep(250);`));
  add('ob-pay-full', { type: t }, S(t, `${total} ${method('CASH')} typ('PmF_received', '2185'); typ('PmF_amount', '2185'); $id('PmOk').click(); await sleep(400);`));
  add('ob-pay-over', { type: t }, S(t, `${total} ${method('CASH')} typ('PmF_received', '3000'); typ('PmF_amount', '3000'); $id('PmOk').click(); await sleep(400);`));
  add('ob-pay-full-dark', { type: t, theme: 'dark' }, S(t, `${total} ${method('CASH')} typ('PmF_received', '2185'); typ('PmF_amount', '2185'); $id('PmOk').click(); await sleep(400);`));
  add('ob-pay-member-code', { type: t }, S(t, `typ('MemberCode', 'M-001'); await sleep(200);`));
  add('ob-pay-member-code-invalid', { type: t }, S(t, `typ('MemberCode', 'ก ข'); await sleep(200);`));
  add('ob-pay-finance-due', { type: t }, S(t, `${total} ${fin} typ($f('DownAmount'), '1000'); ${method('CASH')} $id('PmOk').click(); await sleep(400);`));

  /* ---- insurance, compulsory insurance (PRB), terms ---- */
  add('ob-ins-number-invalid', { type: t }, S(t, `typ('InsSumInsured', 'abc'); await sleep(250);`));
  add('ob-ins-number-valid', { type: t }, S(t, `typ('InsSumInsured', '500000'); typ('InsPremiumGeneral', '12000.5'); typ('InsPremiumCommercial', '8000'); await sleep(250);`));
  add('ob-ins-special-invalid', { type: t }, S(t, `typ('InsSpecialCondition', 'a<b'); typ('InsCommercialDetail', 'a{b}'); await sleep(250);`));
  add('ob-ins-notify-invalid', { type: t }, S(t, `typ('InsNotifyNo', 'ก ข'); await sleep(250);`));
  add('ob-ins-radio', { type: t }, S(t, `var r = document.querySelector('input[name="obInsCommercial"][value="Y"]'); r.checked = true; r.dispatchEvent(new Event('change', { bubbles: true })); await sleep(200);`));
  add('ob-ins-dates', { type: t }, S(t, `typ('InsCoverStart', '2026-11-01'); typ('InsCoverEnd', '2027-11-01'); typ('PrbCoverStart', '2026-11-01'); typ('PrbCoverEnd', '2027-11-01'); await sleep(250);`));
  add('ob-prb-invalid', { type: t }, S(t, `typ('PrbPolicyNo', 'ก ข'); typ('PrbPremium', 'x'); await sleep(250);`));
  add('ob-ins-dark', { type: t, theme: 'dark' }, S(t, `typ('InsSumInsured', 'abc'); typ('PrbPremium', 'x'); await sleep(250);`));
  add('ob-terms-text', { type: t }, S(t, `typ('PaymentTerms', 'ชำระภายใน 30 วัน'); typ('Remarks', 'หมายเหตุ'); await sleep(250);`));
  add('ob-terms-long', { type: t }, S(t, `typ('PaymentTerms', new Array(600).join('ก')); await sleep(250);`));

  /* ---- the reference to a booking / quotation, the document search ---- */
  add('ob-ref-menu', { type: t }, S(t, `$id('RefPickBtn').click(); await sleep(250);`));
  add('ob-ref-menu-dark', { type: t, theme: 'dark' }, S(t, `$id('RefPickBtn').click(); await sleep(250);`));
  add('ob-ref-menu-esc', { type: t }, S(t, `$id('RefPickBtn').click(); await sleep(150); $id('RefMenu').dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true })); await sleep(250);`));
  add('ob-ref-menu-outside', { type: t }, S(t, `$id('RefPickBtn').click(); await sleep(150); document.body.click(); await sleep(250);`));
  add('ob-ref-pick-booking', { type: t }, S(t, `$id('RefPickBtn').click(); await sleep(150); $id('RefBkDocSearchBtn').click(); await sleep(500);`));
  add('ob-ref-pick-quotation', { type: t }, S(t, `$id('RefPickBtn').click(); await sleep(150); $id('RefQtDocSearchBtn').click(); await sleep(500);`));
  add('ob-ref-pick-quotation-en', { type: t, lang: 'en' }, S(t, `$id('RefPickBtn').click(); await sleep(150); $id('RefQtDocSearchBtn').click(); await sleep(500);`));
  add('ob-ref-pick-quotation-dark', { type: t, theme: 'dark' }, S(t, `$id('RefPickBtn').click(); await sleep(150); $id('RefQtDocSearchBtn').click(); await sleep(500);`));
  add('ob-ref-search-type', { type: t }, S(t, `$id('RefPickBtn').click(); await sleep(150); $id('RefQtDocSearchBtn').click(); await sleep(400); typ('RefQtDocSNo', 'QT'); await sleep(500);`));
  add('ob-ref-search-close-esc', { type: t }, S(t, `$id('RefPickBtn').click(); await sleep(150); $id('RefQtDocSearchBtn').click(); await sleep(400); $id('RefQtDocSearchModal').dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true })); await sleep(300);`));
  add('ob-ref-number-typed', { type: t }, S(t, `typ('RefNo', 'QT:M00-2610-00001'); await sleep(250);`));
  add('ob-ref-number-invalid', { type: t }, S(t, `typ('RefNo', 'ก ข'); await sleep(250);`));
  add('ob-docsearch-open', { type: t }, S(t, `$id('DocSearchBtn').click(); await sleep(500);`));
  add('ob-docsearch-open-dark', { type: t, theme: 'dark' }, S(t, `$id('DocSearchBtn').click(); await sleep(500);`));
  add('ob-docsearch-open-en', { type: t, lang: 'en' }, S(t, `$id('DocSearchBtn').click(); await sleep(500);`));
  add('ob-docsearch-open-390', { type: t, w: 390, h: 844 }, S(t, `$id('DocSearchBtn').click(); await sleep(500);`));
  add('ob-docsearch-type', { type: t }, S(t, `$id('DocSearchBtn').click(); await sleep(400); typ('DocSNo', 'OB'); typ('DocSName', 'x'); await sleep(500);`));
  add('ob-docsearch-close-x', { type: t }, S(t, `$id('DocSearchBtn').click(); await sleep(400); $id('DocSearchModal').querySelector('[data-close]').click(); await sleep(300);`));

  /* ---- the header: warehouse, dates, the date of delivery ---- */
  add('ob-header-date', { type: t }, S(t, `typ('DocDate', '2026-12-31'); await sleep(250);`));
  add('ob-header-date-empty', { type: t }, S(t, `typ('DocDate', ''); await sleep(250);`));
  add('ob-header-recv-date', { type: t }, S(t, `typ('RecvDate', '2026-11-15'); await sleep(250);`));
  add('ob-header-textarea-grow', { type: t }, S(t, `var ta = $id('InsCommercialDetail'); ta.value = new Array(30).join('บรรทัด\\n'); ta.dispatchEvent(new Event('input', { bubbles: true })); await sleep(250);`));
}
