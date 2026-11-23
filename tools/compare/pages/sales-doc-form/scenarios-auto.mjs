// Scenarios: the auto-dealer quotation (aq) and booking (ad) — the vehicle table (type → series → colour → car), gifts and accessories, the
// discount pop-up, the price details, the hire-purchase block, the deposit and its pay-now pop-up (ad), the extra income / expense lines (ad),
// the summary, the signatures and the master data (a file the page fetches).
export default function (add, S) {
  const toast = `await sleep(500);`;
  const veh = (i, f) => `$id('VehRows').rows[${i}].querySelector('[data-f="${f}"]')`;
  const step = (i, f, n = 1) => `var s = ${veh(i, f)}; pick(s, s.options[${n}].value); await sleep(250);`;
  const cascade = `${step(0, 'vtype')} ${step(0, 'series')} ${step(0, 'color')}`;
  ['aq', 'ad'].forEach((t) => {
    const swalUp = `await waitFor(function () { return $('.swal-overlay--show-modal'); }, 4000); await sleep(300);`;
    /* ---- vehicles ---- */
    add(`${t}-veh-add-row`, { type: t }, S(t, `$id('VehAdd').click(); await sleep(250);`));
    add(`${t}-veh-remove-row`, { type: t }, S(t, `$id('VehAdd').click(); await sleep(150); $id('VehRows').rows[1].querySelector('[data-del]').click(); await sleep(250);`));
    add(`${t}-veh-remove-single-disabled`, { type: t }, S(t, `var b = $id('VehRows').rows[0].querySelector('[data-del]'); b.click(); await sleep(150);`));
    add(`${t}-veh-type`, { type: t }, S(t, step(0, 'vtype')));
    add(`${t}-veh-series`, { type: t }, S(t, `${step(0, 'vtype')} ${step(0, 'series')}`));
    add(`${t}-veh-color`, { type: t }, S(t, cascade));
    add(`${t}-veh-color-2nd`, { type: t }, S(t, `${step(0, 'vtype')} ${step(0, 'series')} ${step(0, 'color', 2)}`));
    add(`${t}-veh-car`, { type: t }, S(t, `await pickVeh(0);`));
    add(`${t}-veh-car-dark`, { type: t, theme: 'dark' }, S(t, `await pickVeh(0);`));
    add(`${t}-veh-car-en`, { type: t, lang: 'en' }, S(t, `await pickVeh(0);`));
    add(`${t}-veh-car-390`, { type: t, w: 390, h: 844 }, S(t, `await pickVeh(0);`));
    add(`${t}-veh-two`, { type: t }, S(t, `await pickVeh(0); $id('VehAdd').click(); await sleep(200); await pickVeh(1); await sleep(200);`));
    add(`${t}-veh-reset-type`, { type: t }, S(t, `await pickVeh(0); ${step(0, 'vtype', 2)}`));
    add(`${t}-veh-price-edit`, { type: t }, S(t, `await pickVeh(0); var p = ${veh(0, 'price')}; p.value = '900000'; evt(p, 'input'); evt(p, 'change'); await sleep(250);`));
    add(`${t}-veh-price-text`, { type: t }, S(t, `await pickVeh(0); var p = ${veh(0, 'price')}; p.value = 'abc'; evt(p, 'input'); evt(p, 'change'); await sleep(250);`));
    add(`${t}-veh-master-error`, { type: t, mock: 'master-error' }, S(t, `await sleep(500);`));
    add(`${t}-veh-master-down`, { type: t, mock: 'master-down' }, S(t, `await sleep(500);`));
    add(`${t}-veh-master-error-en`, { type: t, mock: 'master-error', lang: 'en' }, S(t, `await sleep(500);`));

    /* ---- gifts and accessories ---- */
    add(`${t}-gift-add`, { type: t }, S(t, `$id('GiftAdd').click(); await sleep(250);`));
    add(`${t}-gift-pick`, { type: t }, S(t, `var s = $id('GiftRows').querySelector('select.qm-t'); pick(s, s.options[1].value); await sleep(250);`));
    add(`${t}-gift-remove`, { type: t }, S(t, `$id('GiftAdd').click(); await sleep(150); $id('GiftRows').querySelector('[data-gdel]').click(); await sleep(250);`));
    add(`${t}-acc-add`, { type: t }, S(t, `$id('AccAdd').click(); await sleep(250);`));
    add(`${t}-acc-pick`, { type: t }, S(t, `var s = $id('AccRows').querySelector('select.qm-t'); pick(s, s.options[1].value); await sleep(250);`));
    add(`${t}-acc-pick-two`, { type: t }, S(t, `var s = $id('AccRows').querySelector('select.qm-t'); pick(s, s.options[1].value); await sleep(150); $id('AccAdd').click(); await sleep(150); var s2 = $id('AccRows').querySelectorAll('select.qm-t')[1]; pick(s2, s2.options[2].value); await sleep(250);`));
    add(`${t}-acc-price-edit`, { type: t }, S(t, `var s = $id('AccRows').querySelector('select.qm-t'); pick(s, s.options[1].value); await sleep(150); var p = $id('AccRows').querySelector('input.qm-p'); p.value = '1000'; evt(p, 'input'); evt(p, 'change'); await sleep(250);`));
    add(`${t}-acc-remove`, { type: t }, S(t, `var s = $id('AccRows').querySelector('select.qm-t'); pick(s, s.options[1].value); await sleep(150); $id('AccRows').querySelector('[data-adel]').click(); await sleep(250);`));
    add(`${t}-acc-dark`, { type: t, theme: 'dark' }, S(t, `var s = $id('AccRows').querySelector('select.qm-t'); pick(s, s.options[1].value); await sleep(250);`));

    /* ---- the discount pop-up ---- */
    const discOpen = `await pickVeh(0); $id('VehRows').querySelector('[data-disc]').click(); await sleep(350);`;
    add(`${t}-disc-open`, { type: t }, S(t, discOpen));
    add(`${t}-disc-open-dark`, { type: t, theme: 'dark' }, S(t, discOpen));
    add(`${t}-disc-open-en`, { type: t, lang: 'en' }, S(t, discOpen));
    add(`${t}-disc-open-390`, { type: t, w: 390, h: 844 }, S(t, discOpen));
    add(`${t}-disc-percent`, { type: t }, S(t, `${discOpen} $id('DiscPctR').click(); await sleep(150); typ('DiscPct', '10'); await sleep(250);`));
    add(`${t}-disc-amount`, { type: t }, S(t, `${discOpen} typ('DiscAmt', '5000'); await sleep(250);`));
    add(`${t}-disc-amount-over`, { type: t }, S(t, `${discOpen} typ('DiscAmt', '99999999'); await sleep(250);`));
    add(`${t}-disc-invalid`, { type: t }, S(t, `${discOpen} typ('DiscAmt', 'abc'); await sleep(250);`));
    add(`${t}-disc-apply`, { type: t }, S(t, `${discOpen} typ('DiscAmt', '5000'); $id('DiscApply').click(); await sleep(500);`));
    add(`${t}-disc-apply-percent`, { type: t }, S(t, `${discOpen} $id('DiscPctR').click(); await sleep(100); typ('DiscPct', '10'); $id('DiscApply').click(); await sleep(500);`));
    add(`${t}-disc-apply-all`, { type: t }, S(t, `await pickVeh(0); $id('VehAdd').click(); await sleep(200); await pickVeh(1); $id('VehRows').querySelector('[data-disc]').click(); await sleep(250); typ('DiscAmt', '1000'); $id('DiscApplyAll').click(); await sleep(500);`));
    add(`${t}-disc-clear`, { type: t }, S(t, `${discOpen} typ('DiscAmt', '5000'); $id('DiscApply').click(); await sleep(300); $id('VehRows').querySelector('[data-disc]').click(); await sleep(250); $id('DiscClear').click(); await sleep(500);`));
    add(`${t}-disc-clear-all`, { type: t }, S(t, `${discOpen} typ('DiscAmt', '5000'); $id('DiscApplyAll').click(); await sleep(300); $id('VehRows').querySelector('[data-disc]').click(); await sleep(250); $id('DiscClearAll').click(); await sleep(500);`));
    add(`${t}-disc-close-x`, { type: t }, S(t, `${discOpen} $id('DiscModal').querySelector('.qm-close').click(); await sleep(300);`));
    add(`${t}-disc-close-esc`, { type: t }, S(t, `${discOpen} $id('DiscModal').dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true })); await sleep(300);`));
    add(`${t}-disc-close-backdrop`, { type: t }, S(t, `${discOpen} $id('DiscModal').click(); await sleep(300);`));
    add(`${t}-disc-accessory`, { type: t }, S(t, `var s = $id('AccRows').querySelector('select.qm-t'); pick(s, s.options[1].value); await sleep(200); $id('AccRows').querySelector('[data-disc]').click(); await sleep(300); typ('DiscAmt', '500'); $id('DiscApply').click(); await sleep(500);`));
    add(`${t}-disc-accessory-open`, { type: t }, S(t, `var s = $id('AccRows').querySelector('select.qm-t'); pick(s, s.options[1].value); await sleep(200); $id('AccRows').querySelector('[data-disc]').click(); await sleep(300);`));

    /* ---- the price details, the sale type, the hire purchase ---- */
    add(`${t}-price-plus`, { type: t }, S(t, `await pickVeh(0); typ('Plus', '10000'); await sleep(250);`));
    add(`${t}-price-plus-invalid`, { type: t }, S(t, `await pickVeh(0); typ('Plus', 'abc'); await sleep(250);`));
    add(`${t}-sale-cash`, { type: t }, S(t, `await pickVeh(0); pick($id('SaleType'), 'cash'); await sleep(300);`));
    add(`${t}-sale-cash-dark`, { type: t, theme: 'dark' }, S(t, `await pickVeh(0); pick($id('SaleType'), 'cash'); await sleep(300);`));
    add(`${t}-sale-cash-en`, { type: t, lang: 'en' }, S(t, `await pickVeh(0); pick($id('SaleType'), 'cash'); await sleep(300);`));
    add(`${t}-sale-cash-back`, { type: t }, S(t, `await pickVeh(0); pick($id('SaleType'), 'cash'); await sleep(200); pick($id('SaleType'), 'finance'); await sleep(300);`));
    add(`${t}-hp-down-amount`, { type: t }, S(t, `await pickVeh(0); typ('Down', '200000'); await sleep(250);`));
    add(`${t}-hp-down-percent`, { type: t }, S(t, `await pickVeh(0); typ('DownRate', '20'); await sleep(250);`));
    add(`${t}-hp-down-then-price`, { type: t }, S(t, `await pickVeh(0); typ('Down', '200000'); await sleep(150); typ('Plus', '10000'); await sleep(250);`));
    add(`${t}-hp-rate-terms`, { type: t }, S(t, `await pickVeh(0); typ('DownRate', '20'); typ('Rate', '3.5'); var s = $id('Terms'); pick(s, s.options[2].value); await sleep(300);`));
    add(`${t}-hp-terms-only`, { type: t }, S(t, `await pickVeh(0); var s = $id('Terms'); pick(s, s.options[1].value); await sleep(300);`));
    add(`${t}-hp-invalid`, { type: t }, S(t, `await pickVeh(0); typ('Down', 'x'); typ('Rate', 'y'); await sleep(250);`));
    add(`${t}-hp-fin-co`, { type: t }, S(t, `var s = $id('FinCo'); pick(s, s.options[1].value); await sleep(250);`));
    add(`${t}-hp-loan-type`, { type: t }, S(t, `pick($id('LoanType'), 'leasing'); await sleep(250);`));
    add(`${t}-hp-package-invalid`, { type: t }, S(t, `typ('FinPkg', 'a<b'); await sleep(250);`));
    add(`${t}-hp-all`, { type: t }, S(t, `await pickVeh(0); var s = $id('FinCo'); pick(s, s.options[1].value); pick($id('LoanType'), 'hire_purchase'); typ('FinPkg', 'โปร 3.5%'); typ('DownRate', '25'); typ('Rate', '2.99'); var t2 = $id('Terms'); pick(t2, t2.options[3].value); await sleep(350);`));
    add(`${t}-hp-all-390`, { type: t, w: 390, h: 844 }, S(t, `await pickVeh(0); var s = $id('FinCo'); pick(s, s.options[1].value); pick($id('LoanType'), 'hire_purchase'); typ('DownRate', '25'); typ('Rate', '2.99'); var t2 = $id('Terms'); pick(t2, t2.options[3].value); await sleep(350);`));
    add(`${t}-sum-fields`, { type: t }, S(t, `await pickVeh(0); typ('Dd', '5000'); typ('Td', '2000'); await sleep(250);`));
    add(`${t}-sum-invalid`, { type: t }, S(t, `typ('Dd', 'abc'); await sleep(250);`));

    /* ---- the header and the signatures ---- */
    add(`${t}-sign-buyer-seller`, { type: t }, S(t, `await pickCust(0); await sleep(200);`));
    add(`${t}-sign-after-create`, { type: t }, S(t, `await createCust({ name: 'นายทดสอบ ระบบ' }); await sleep(200);`));
    add(`${t}-header-saletel`, { type: t }, S(t, `typ('SaleTel', '0891234567'); await sleep(250);`));
    add(`${t}-header-saletel-long`, { type: t }, S(t, `typ('SaleTel', '089123456789012345678901'); await sleep(250);`));
    add(`${t}-header-date`, { type: t }, S(t, `typ('DocDate', '2026-12-31'); await sleep(250);`));
    add(`${t}-header-date-empty`, { type: t }, S(t, `typ('DocDate', ''); await sleep(250);`));
    add(`${t}-header-refno`, { type: t }, S(t, `typ('RefNo', 'QT-0001'); await sleep(250);`));
    add(`${t}-header-refno-invalid`, { type: t }, S(t, `typ('RefNo', 'ก ข'); await sleep(250);`));
    add(`${t}-header-team`, { type: t }, S(t, `await pickCust(1); await sleep(200);`));

    /* ---- save of the auto-dealer forms: the problems of the document ---- */
    add(`${t}-save-no-vehicle`, { type: t }, S(t, `await pickCust(0); await save(500);`));
    add(`${t}-save-vehicle-no-price`, { type: t }, S(t, `await createCust({ more: { FTel: '0812345678' } }); await pickVeh(0); var p = ${veh(0, 'price')}; p.value = '0'; evt(p, 'input'); evt(p, 'change'); await save(500);`));
    add(`${t}-save-no-customer`, { type: t }, S(t, `await pickVeh(0); await save(500);`));
  });

  /* ---- the deposit of the auto-dealer booking (ad): the amount, the pay-now pop-up ---- */
  const t = 'ad';
  const method = (m) => `pick($id('DpMethod'), '${m}'); await sleep(250);`;
  add('ad-dep-amount', { type: t }, S(t, `typ('Dep', '10000'); await sleep(250);`));
  add('ad-dep-amount-invalid', { type: t }, S(t, `typ('Dep', 'x'); await sleep(250);`));
  add('ad-dep-date', { type: t }, S(t, `typ('DepDate', '2026-11-20'); await sleep(250);`));
  add('ad-dep-paynow-no-amount', { type: t }, S(t, `var c = $id('DpChk'); c.checked = true; c.dispatchEvent(new Event('change', { bubbles: true })); await sleep(600);`));
  add('ad-dep-paynow-no-amount-en', { type: t, lang: 'en' }, S(t, `var c = $id('DpChk'); c.checked = true; c.dispatchEvent(new Event('change', { bubbles: true })); await sleep(600);`));
  const paynow = `typ('Dep', '10000'); var c = $id('DpChk'); c.checked = true; c.dispatchEvent(new Event('change', { bubbles: true })); await sleep(400);`;
  add('ad-dep-paynow-open', { type: t }, S(t, paynow));
  add('ad-dep-paynow-open-dark', { type: t, theme: 'dark' }, S(t, paynow));
  add('ad-dep-paynow-open-en', { type: t, lang: 'en' }, S(t, paynow));
  add('ad-dep-paynow-open-390', { type: t, w: 390, h: 844 }, S(t, paynow));
  ['cash', 'transfer', 'cheque', 'card'].forEach((m) => {
    add(`ad-dep-method-${m}`, { type: t }, S(t, `${paynow} ${method(m)}`));
  });
  add('ad-dep-cash-received', { type: t }, S(t, `${paynow} typ('DpRecv', '12000'); await sleep(250);`));
  add('ad-dep-cash-less', { type: t }, S(t, `${paynow} typ('DpRecv', '5000'); await sleep(250);`));
  add('ad-dep-transfer-diff', { type: t }, S(t, `${paynow} ${method('transfer')} typ('DpAmt', '9000'); await sleep(250);`));
  add('ad-dep-note', { type: t }, S(t, `${paynow} typ('DpNote', 'มัดจำรอบแรก'); await sleep(250);`));
  add('ad-dep-note-invalid', { type: t }, S(t, `${paynow} typ('DpNote', 'a<b'); await sleep(250);`));
  add('ad-dep-save-cash', { type: t }, S(t, `${paynow} $id('DepSave').click(); await sleep(500);`));
  add('ad-dep-save-cash-dark', { type: t, theme: 'dark' }, S(t, `${paynow} $id('DepSave').click(); await sleep(500);`));
  add('ad-dep-save-cheque', { type: t }, S(t, `${paynow} ${method('cheque')} typ('DpCno', 'CH-001'); $id('DepSave').click(); await sleep(500);`));
  add('ad-dep-save-less-warn', { type: t }, S(t, `${paynow} typ('DpRecv', '5000'); $id('DepSave').click(); await sleep(500);`));
  add('ad-dep-save-edit', { type: t }, S(t, `${paynow} $id('DepSave').click(); await sleep(400); $id('DpEdit').click(); await sleep(400);`));
  add('ad-dep-amount-change-after-save', { type: t }, S(t, `${paynow} $id('DepSave').click(); await sleep(400); typ('Dep', '20000'); await sleep(400);`));
  add('ad-dep-cancel-unsaved', { type: t }, S(t, `${paynow} $id('DepCancel').click(); await sleep(400);`));
  add('ad-dep-x-unsaved', { type: t }, S(t, `${paynow} $id('DepX').click(); await sleep(400);`));
  add('ad-dep-esc-unsaved', { type: t }, S(t, `${paynow} $id('DepModal').dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true })); await sleep(400);`));
  add('ad-dep-backdrop-unsaved', { type: t }, S(t, `${paynow} $id('DepModal').click(); await sleep(400);`));
  add('ad-dep-cancel-saved-keeps', { type: t }, S(t, `${paynow} $id('DepSave').click(); await sleep(400); $id('DpEdit').click(); await sleep(300); $id('DepCancel').click(); await sleep(400);`));
  add('ad-dep-uncheck', { type: t }, S(t, `${paynow} $id('DepSave').click(); await sleep(400); var c2 = $id('DpChk'); c2.checked = false; c2.dispatchEvent(new Event('change', { bubbles: true })); await sleep(300);`));
  add('ad-dep-save-no-deposit', { type: t }, S(t, `await createCust(); await pickVeh(0); await save(500);`));

  /* ---- the extra income and expense lines ---- */
  const oth = (n) => `$id('Oth${n}Btn').click(); await sleep(350);`;
  add('ad-oth1-open', { type: t }, S(t, oth(1)));
  add('ad-oth2-open', { type: t }, S(t, oth(2)));
  add('ad-oth1-open-dark', { type: t, theme: 'dark' }, S(t, oth(1)));
  add('ad-oth2-open-en', { type: t, lang: 'en' }, S(t, oth(2)));
  add('ad-oth2-open-390', { type: t, w: 390, h: 844 }, S(t, oth(2)));
  add('ad-oth1-add-nothing', { type: t }, S(t, `${oth(1)} $id('LineAdd').click(); await sleep(400);`));
  add('ad-oth1-add-no-amount', { type: t }, S(t, `${oth(1)} var s = $id('LineItem'); pick(s, s.options[1].value); await sleep(150); $id('LineAdd').click(); await sleep(400);`));
  add('ad-oth1-add', { type: t }, S(t, `${oth(1)} var s = $id('LineItem'); pick(s, s.options[1].value); typ('LineAmt', '1500'); $id('LineAdd').click(); await sleep(400);`));
  add('ad-oth1-add-two', { type: t }, S(t, `${oth(1)} var s = $id('LineItem'); pick(s, s.options[1].value); typ('LineAmt', '1500'); $id('LineAdd').click(); await sleep(300); pick(s, s.options[2].value); typ('LineAmt', '250.5'); $id('LineAdd').click(); await sleep(400);`));
  add('ad-oth2-add-no-payee', { type: t }, S(t, `${oth(2)} var s = $id('LineItem'); pick(s, s.options[1].value); typ('LineAmt', '800'); $id('LineAdd').click(); await sleep(400);`));
  add('ad-oth2-add', { type: t }, S(t, `${oth(2)} var s = $id('LineItem'); pick(s, s.options[1].value); typ('LineAmt', '800'); var p = $id('LinePayee'); pick(p, p.options[1].value); $id('LineAdd').click(); await sleep(400);`));
  add('ad-oth2-add-then-close', { type: t }, S(t, `${oth(2)} var s = $id('LineItem'); pick(s, s.options[1].value); typ('LineAmt', '800'); var p = $id('LinePayee'); pick(p, p.options[1].value); $id('LineAdd').click(); await sleep(300); $id('LineModal').querySelector('.qm-foot-note [data-close]').click(); await sleep(400);`));
  add('ad-oth1-remove', { type: t }, S(t, `${oth(1)} var s = $id('LineItem'); pick(s, s.options[1].value); typ('LineAmt', '1500'); $id('LineAdd').click(); await sleep(300); $id('LineBody').querySelector('[data-lndel]').click(); await sleep(400);`));
  add('ad-oth-both-summary', { type: t }, S(t, `${oth(1)} var s = $id('LineItem'); pick(s, s.options[1].value); typ('LineAmt', '1500'); $id('LineAdd').click(); await sleep(300); $id('LineModal').querySelector('[data-close]').click(); await sleep(250); ${oth(2)} var s2 = $id('LineItem'); pick(s2, s2.options[1].value); typ('LineAmt', '800'); var p = $id('LinePayee'); pick(p, p.options[1].value); $id('LineAdd').click(); await sleep(300); $id('LineModal').querySelector('[data-close]').click(); await sleep(300);`));
  add('ad-oth-close-esc', { type: t }, S(t, `${oth(1)} $id('LineModal').dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true })); await sleep(300);`));
  add('ad-oth-close-backdrop', { type: t }, S(t, `${oth(1)} $id('LineModal').click(); await sleep(300);`));
  add('ad-oth-amount-invalid', { type: t }, S(t, `${oth(1)} typ('LineAmt', 'abc'); await sleep(250);`));

  /* ---- the rest of the booking: fees, insurance, the old car, the terms, the delivery date, the document search ---- */
  add('ad-fees', { type: t }, S(t, `typ('Reg', '1500'); typ('Act', '645.21'); await sleep(250);`));
  add('ad-fees-invalid', { type: t }, S(t, `typ('Reg', 'x'); typ('Act', 'y'); await sleep(250);`));
  add('ad-old-car', { type: t }, S(t, `typ('Old', '100000'); typ('Dd', '3000'); typ('Td', '1000'); await sleep(250);`));
  add('ad-summary-full', { type: t }, S(t, `await pickVeh(0); typ('Reg', '1500'); typ('Act', '645'); typ('Old', '100000'); typ('Dd', '3000'); typ('Td', '1000'); typ('Dep', '10000'); await sleep(300);`));
  add('ad-summary-full-390', { type: t, w: 390, h: 844 }, S(t, `await pickVeh(0); typ('Reg', '1500'); typ('Act', '645'); typ('Old', '100000'); typ('Dd', '3000'); typ('Td', '1000'); typ('Dep', '10000'); await sleep(300);`));
  add('ad-insurance', { type: t }, S(t, `var c = $id('InsCo'); pick(c, c.options[1].value); var y = $id('InsType'); pick(y, y.options[1].value); typ('Prem', '15000'); typ('InsOther', 'ซ่อมห้าง'); await sleep(250);`));
  add('ad-insurance-invalid', { type: t }, S(t, `typ('Prem', 'x'); typ('InsOther', 'a<b'); await sleep(250);`));
  add('ad-terms-open', { type: t }, S(t, `document.querySelector('.qm-adterms summary').click(); await sleep(300);`));
  add('ad-terms-open-dark', { type: t, theme: 'dark' }, S(t, `document.querySelector('.qm-adterms summary').click(); await sleep(300);`));
  add('ad-terms-open-390', { type: t, w: 390, h: 844 }, S(t, `document.querySelector('.qm-adterms summary').click(); await sleep(300);`));
  add('ad-deliver-date', { type: t }, S(t, `typ('Deliver', '2026-12-15'); await sleep(250);`));
  add('ad-docsearch-no-customer', { type: t }, S(t, `$id('DocSearchBtn').click(); ${'await waitFor(function () { return $(\'.swal-overlay--show-modal\'); }, 4000); await sleep(300);'}`));
  add('ad-docsearch-no-customer-en', { type: t, lang: 'en' }, S(t, `$id('DocSearchBtn').click(); ${'await waitFor(function () { return $(\'.swal-overlay--show-modal\'); }, 4000); await sleep(300);'}`));
  add('ad-docsearch-open', { type: t }, S(t, `await pickCust(0); $id('DocSearchBtn').click(); await sleep(600);`));
  add('ad-docsearch-open-dark', { type: t, theme: 'dark' }, S(t, `await pickCust(0); $id('DocSearchBtn').click(); await sleep(600);`));
  add('ad-docsearch-type', { type: t }, S(t, `await pickCust(0); $id('DocSearchBtn').click(); await sleep(400); typ('DocSNo', 'AD'); await sleep(500);`));
  add('ad-docsearch-close-esc', { type: t }, S(t, `await pickCust(0); $id('DocSearchBtn').click(); await sleep(400); $id('DocSearchModal').dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true })); await sleep(300);`));
  add('ad-validate-bar-date', { type: t }, S(t, `typ('DocDate', ''); await save(500);`));
  add('ad-validate-full', { type: t }, S(t, `await save(500);`));
}
