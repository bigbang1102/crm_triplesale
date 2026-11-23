// Scenarios of the prospect form: the "ข้อมูลเพิ่มเติม" tab (lead_detail's ld2…: sub-tabs, inner tabs, fields, the save with the update). Run INSIDE the page under test — see scenarios.mjs.
export default function (add) {
  const SUBS = ['cs', 'pls', 'ls', 'le', 'crm', 'extra2', 'survey'];
  const X2 = ['basic', 'asset', 'cointv', 'contact', 'custintv', 'installment', 'interest', 'ref', 'result', 'status', 'summary'];

  /* ---- the sub-tabs ---- */
  SUBS.forEach((sub) => {
    add(`extra-view-${sub}`, { mode: 'view', id: 1 }, `await tab(2); click($('.ld2-sub-tab[data-sub="${sub}"]')); await sleep(500);`);
    add(`extra-edit-${sub}`, { mode: 'edit', id: 1 }, `await tab(2); click($('.ld2-sub-tab[data-sub="${sub}"]')); await sleep(500);`);
  });
  ['cs', 'extra2', 'survey'].forEach((sub) => {
    add(`extra-edit-${sub}-dark`, { mode: 'edit', id: 1, theme: 'dark' }, `await tab(2); click($('.ld2-sub-tab[data-sub="${sub}"]')); await sleep(500);`);
    add(`extra-edit-${sub}-en`, { mode: 'edit', id: 1, lang: 'en' }, `await tab(2); click($('.ld2-sub-tab[data-sub="${sub}"]')); await sleep(500);`);
    add(`extra-edit-${sub}-390`, { mode: 'edit', id: 1, w: 390, h: 844 }, `await tab(2); click($('.ld2-sub-tab[data-sub="${sub}"]')); await sleep(500);`);
  });
  add('extra-add-mode', { mode: 'add' }, async function (sleep) { await tab(2); click($('.ld2-sub-tab[data-sub="pls"]')); await sleep(500); });
  add('extra-add-mode-cs', { mode: 'add' }, async function (sleep) { await tab(2); await sleep(500); });
  /* ---- the inner tabs (the co-borrower) and the sub-tabs of the extra 2 page ---- */
  add('extra-inner-co', { mode: 'edit', id: 1 }, async function (sleep) { await tab(2); click($('.ld2-inner-tab[data-inner="co"]')); await sleep(500); });
  add('extra-inner-co-view', { mode: 'view', id: 1 }, async function (sleep) { await tab(2); click($('.ld2-inner-tab[data-inner="co"]')); await sleep(500); });
  add('extra-inner-back', { mode: 'edit', id: 1 }, async function (sleep) { await tab(2); click($('.ld2-inner-tab[data-inner="co"]')); await sleep(300); click($('.ld2-inner-tab[data-inner="borrower"]')); await sleep(500); });
  X2.forEach((x) => {
    add(`extra-x2-${x}`, { mode: 'edit', id: 1 }, `await tab(2); click($('.ld2-sub-tab[data-sub="extra2"]')); await sleep(300); click($('.ld2-sub-tab[data-x2="${x}"]')); await sleep(500);`);
  });
  /* ---- the other record: a juristic person, one without data ---- */
  add('extra-edit-10', { mode: 'edit', id: 10 }, async function (sleep) { await tab(2); await sleep(500); });
  add('extra-view-30', { mode: 'view', id: 30 }, async function (sleep) { await tab(2); await sleep(500); });
  add('extra-edit-26', { mode: 'edit', id: 26 }, async function (sleep) { await tab(2); await sleep(500); });
  /* ---- the fields ---- */
  add('extra-select-change', { mode: 'edit', id: 1 }, async function (sleep) { await tab(2); var sel = $('#ld2CsLoanType'); sel.value = sel.options[sel.options.length - 1].value; sel.dispatchEvent(new Event('change', { bubbles: true })); await sleep(500); });
  add('extra-select-open', { mode: 'edit', id: 1 }, async function (sleep) { await tab(2); click($('#ld2CsLoanType + .ods-btn')); await sleep(500); });
  add('extra-select-open-dark', { mode: 'edit', id: 1, theme: 'dark' }, async function (sleep) { await tab(2); click($('#ld2CsLoanType + .ods-btn')); await sleep(500); });
  add('extra-text-type', { mode: 'edit', id: 1 }, async function (sleep) { await tab(2); var inp = $('.ld2-form-inp, input.ld2-form-sel'); if (inp) { await typeField(inp, '1234567'); } await sleep(300); });
  /* ---- the save: the update runs the save of the extra information first, then the main data ---- */
  add('update-extra-ok', { mode: 'edit', id: 1, roots: ['.swal-overlay'] }, async function (sleep, side) { trackNav(side); await tab(2); var sel = $('#ld2CsLoanType'); sel.value = sel.options[sel.options.length - 1].value; sel.dispatchEvent(new Event('change', { bubbles: true })); await sleep(300); click(UPDATE); await sleep(500); click('#updateConfirmModal .cl-btn-purple'); await sleep(3500); });
  add('update-extra-fail', { mode: 'edit', id: 1, roots: ['.swal-overlay', 'body > div[style*="99999"]'] }, async function (sleep, side) { trackNav(side); await tab(1); await typeField(field('j_idt3'), 'X-EXTRA-FAIL'); click(UPDATE); await sleep(500); click('#updateConfirmModal .cl-btn-purple'); await sleep(900); });
}
