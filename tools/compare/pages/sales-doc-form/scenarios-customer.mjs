// Scenarios: the customer block of the five forms (pick pop-up, edit / create pop-up, the tax-invoice tab of the quotation and booking).
export default function (add, S, ALL) {
  const openAndWait = `$id('CustSearchBtn').click(); await waitFor(function () { return $id('ResultBody').querySelector('[data-pick]'); }, 6000); await sleep(150);`;
  const toCreate = `$id('CustSearchBtn').click(); await sleep(150); $id('ToCreate').click(); await sleep(250);`;
  ALL.forEach((t) => {
    add(`${t}-cust-open`, { type: t }, S(t, openAndWait));
    add(`${t}-cust-open-dark`, { type: t, theme: 'dark' }, S(t, openAndWait));
    add(`${t}-cust-open-390`, { type: t, w: 390, h: 844 }, S(t, openAndWait));
    add(`${t}-cust-open-en`, { type: t, lang: 'en' }, S(t, openAndWait));
    add(`${t}-cust-open-loading`, { type: t, mock: 'slow-prospects' }, S(t, `$id('CustSearchBtn').click(); await sleep(400);`));
    add(`${t}-cust-search-code`, { type: t }, S(t, `${openAndWait} typ('SCode', 'P0001'); await sleep(900);`));
    add(`${t}-cust-search-name`, { type: t }, S(t, `${openAndWait} typ('SName', 'สมชาย'); await sleep(900);`));
    add(`${t}-cust-search-none`, { type: t }, S(t, `${openAndWait} typ('SName', 'ไม่มีแน่นอน'); await sleep(900);`));
    add(
      `${t}-cust-scroll-more`,
      { type: t },
      S(t, `${openAndWait} var sc = $id('ResultBody').closest('.qm-tbox'); sc.scrollTop = sc.scrollHeight; sc.dispatchEvent(new Event('scroll')); await waitFor(function () { return $id('ResultBody').querySelectorAll('[data-pick]').length > 10; }, 6000); await sleep(200);`),
    );
    add(`${t}-cust-pick`, { type: t }, S(t, `await pickCust(2);`));
    add(`${t}-cust-pick-dark`, { type: t, theme: 'dark' }, S(t, `await pickCust(2);`));
    add(`${t}-cust-pick-en`, { type: t, lang: 'en' }, S(t, `await pickCust(0);`));
    add(`${t}-cust-pick-390`, { type: t, w: 390, h: 844 }, S(t, `await pickCust(1);`));
    add(`${t}-cust-change-open`, { type: t }, S(t, `await pickCust(0); ${openAndWait}`));
    add(`${t}-cust-close-x`, { type: t }, S(t, `${openAndWait} $id('SearchModal').querySelector('[data-close]').click(); await sleep(200);`));
    add(`${t}-cust-close-esc`, { type: t }, S(t, `${openAndWait} $id('SearchModal').dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true })); await sleep(200);`));
    add(`${t}-cust-close-backdrop`, { type: t }, S(t, `${openAndWait} $id('SearchModal').click(); await sleep(200);`));
    add(`${t}-cust-edit`, { type: t }, S(t, `await pickCust(0); $id('CustEditBtn').click(); await sleep(300);`));
    add(`${t}-cust-edit-dark`, { type: t, theme: 'dark' }, S(t, `await pickCust(0); $id('CustEditBtn').click(); await sleep(300);`));
    add(`${t}-cust-edit-390`, { type: t, w: 390, h: 844 }, S(t, `await pickCust(0); $id('CustEditBtn').click(); await sleep(300);`));
    add(`${t}-cust-edit-save`, { type: t }, S(t, `await pickCust(0); $id('CustEditBtn').click(); await sleep(200); typ('FName', 'ชื่อที่แก้แล้ว'); typ('FTaxId', '1234567890121'); $id('FormSubmit').click(); await sleep(600);`));
    add(`${t}-cust-create-open`, { type: t }, S(t, toCreate));
    add(`${t}-cust-create-open-en`, { type: t, lang: 'en' }, S(t, toCreate));
    add(`${t}-cust-create-empty`, { type: t }, S(t, `${toCreate} $id('FormSubmit').click(); await sleep(400);`));
    add(`${t}-cust-create-empty-dark`, { type: t, theme: 'dark' }, S(t, `${toCreate} $id('FormSubmit').click(); await sleep(400);`));
    [['taxid-short', 'FTaxId', '123'], ['taxid-checksum', 'FTaxId', '1234567890123'], ['taxid-text', 'FTaxId', 'abcdefghijklm'], ['phone', 'FTel', '123'], ['zip', 'FZip', '12'], ['email', 'FEmail', 'not-an-email'], ['name-special', 'FName', 'ชื่อ <b>']].forEach(([n, f, v]) => {
      if (f === 'FEmail' && t === 'bk') return; // the booking's customer form has no e-mail field
      add(`${t}-cust-create-invalid-${n}`, { type: t }, S(t, `${toCreate} typ('FName', 'ลูกค้าใหม่'); typ('FTaxId', '1234567890121'); typ('FAddr', 'ที่อยู่ 1'); typ(${JSON.stringify(f)}, ${JSON.stringify(v)}); $id('FormSubmit').click(); await sleep(500);`));
    });
    add(`${t}-cust-create-ok`, { type: t }, S(t, `await createCust();`));
    add(`${t}-cust-create-ok-dark`, { type: t, theme: 'dark' }, S(t, `await createCust();`));
    add(`${t}-cust-create-ok-en`, { type: t, lang: 'en' }, S(t, `await createCust();`));
    add(`${t}-cust-create-ok-390`, { type: t, w: 390, h: 844 }, S(t, `await createCust();`));
    add(`${t}-cust-create-cancel`, { type: t }, S(t, `${toCreate} $id('FormModal').querySelector('[data-close]').click(); await sleep(200);`));
    add(`${t}-cust-create-esc`, { type: t }, S(t, `${toCreate} $id('FormModal').dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true })); await sleep(200);`));
    add(`${t}-cust-prospects-empty`, { type: t, mock: 'prospects-empty' }, S(t, `$id('CustSearchBtn').click(); await sleep(900);`));
    add(`${t}-cust-prospects-error`, { type: t, mock: 'prospects-error' }, S(t, `$id('CustSearchBtn').click(); await sleep(900);`));
    add(`${t}-cust-prospects-down`, { type: t, mock: 'prospects-down' }, S(t, `$id('CustSearchBtn').click(); await sleep(900);`));
    add(`${t}-cust-prospects-error-en`, { type: t, mock: 'prospects-error', lang: 'en' }, S(t, `$id('CustSearchBtn').click(); await sleep(900);`));
  });
  // the occupations of the customer pop-up (the auto-dealer forms)
  ['aq', 'ad'].forEach((t) => {
    add(`${t}-cust-jobs-open`, { type: t }, S(t, `await pickCust(0); $id('CustEditBtn').click(); await sleep(700);`));
    add(`${t}-cust-jobs-pick`, { type: t }, S(t, `await pickCust(0); $id('CustEditBtn').click(); await sleep(600); pick($id('FJob'), 'พนักงานบริษัท'); await sleep(200);`));
    add(`${t}-cust-jobs-error`, { type: t, mock: 'jobs-error' }, S(t, `await pickCust(0); $id('CustEditBtn').click(); await sleep(700);`));
    add(`${t}-cust-jobs-empty`, { type: t, mock: 'jobs-empty' }, S(t, `await pickCust(0); $id('CustEditBtn').click(); await sleep(700);`));
    add(`${t}-cust-jobs-en`, { type: t, lang: 'en' }, S(t, `await pickCust(0); $id('CustEditBtn').click(); await sleep(700);`));
  });
  // the tax-invoice tab of the quotation and the booking
  ['qt', 'bk'].forEach((t) => {
    add(`${t}-tax-tab`, { type: t }, S(t, `$id('StTax').click(); await sleep(200);`));
    add(`${t}-tax-tab-dark`, { type: t, theme: 'dark' }, S(t, `$id('StTax').click(); await sleep(200);`));
    add(`${t}-tax-tab-390`, { type: t, w: 390, h: 844 }, S(t, `$id('StTax').click(); await sleep(200);`));
    add(`${t}-tax-tab-keys`, { type: t }, S(t, `$id('StCus').dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true })); await sleep(200);`));
    add(`${t}-tax-tab-keys-back`, { type: t }, S(t, `$id('StTax').click(); $id('StTax').dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowLeft', bubbles: true })); await sleep(200);`));
    add(`${t}-tax-copy-nocust`, { type: t }, S(t, `$id('StTax').click(); $id('TaxCopy').click(); await waitFor(function () { return $('.swal-overlay--show-modal'); }, 4000); await sleep(300);`));
    add(`${t}-tax-copy-cust`, { type: t }, S(t, `await pickCust(1); $id('StTax').click(); $id('TaxCopy').click(); await sleep(300);`));
    add(`${t}-tax-after-pick`, { type: t }, S(t, `await pickCust(1); $id('StTax').click(); await sleep(300);`));
    add(`${t}-tax-after-create`, { type: t }, S(t, `await createCust(); $id('StTax').click(); await sleep(300);`));
  });
  [['name-empty', 'TName', ''], ['taxid-short', 'TTaxId', '123'], ['taxid-checksum', 'TTaxId', '1234567890123'], ['branch', 'TBranch', '12'], ['zip', 'TZip', '1'], ['phone', 'TTel', '12'], ['contract', 'TContract', 'ก ข']].forEach(([n, f, v]) => {
    add(`qt-tax-invalid-${n}`, { type: 'qt' }, S('qt', `$id('StTax').click(); typ(${JSON.stringify(f)}, ${JSON.stringify(v)}); await sleep(300);`));
  });
  // the booking's customer of the tax invoice (a business partner of its own)
  add('bk-vb-search-open', { type: 'bk' }, S('bk', `await pickCust(0); $id('StTax').click(); $id('VbSearch').click(); await waitFor(function () { return $id('ResultBody').querySelector('[data-pick]'); }, 6000); await sleep(200);`));
  add('bk-vb-pick', { type: 'bk' }, S('bk', `await pickCust(0); $id('StTax').click(); $id('VbSearch').click(); await waitFor(function () { return $id('ResultBody').querySelector('[data-pick]'); }, 6000); $id('ResultBody').querySelectorAll('[data-pick]')[3].click(); await sleep(300);`));
  add('bk-vb-same', { type: 'bk' }, S('bk', `await pickCust(0); $id('StTax').click(); $id('VbSearch').click(); await sleep(500); $id('ResultBody').querySelectorAll('[data-pick]')[3].click(); await sleep(200); $id('TaxCopy').click(); await sleep(300);`));
}
