// Scenarios: the payment method of the quotation and the booking (SalesDocPayment: cash · credit term · contract instalments · deposit · prepaid),
// the pop-ups and what they do to the page.
export default function (add, S) {
  const PAY = ['qt', 'bk'];
  // a document with a total (2 x 1092.50 = 2,185.00 with VAT included) so that the tables of the pop-ups have something to add up to
  const withTotal = `setProduct(0, 'ACC-A001'); typ(cell(row(0), 'qty'), '2'); await sleep(150);`;
  const open = (m) => `pick($id('CType'), '${m}'); await sleep(300);`;
  const row0 = (f) => `$id('PsRows').rows[0].querySelector('[data-p="${f}"]')`;
  PAY.forEach((t) => {
    add(`${t}-pay-none`, { type: t }, S(t, `await sleep(100);`));
    add(`${t}-pay-cash`, { type: t }, S(t, `pick($id('CType'), 'cash'); await sleep(250);`));
    add(`${t}-pay-cash-dark`, { type: t, theme: 'dark' }, S(t, `pick($id('CType'), 'cash'); await sleep(250);`));
    add(`${t}-pay-cash-en`, { type: t, lang: 'en' }, S(t, `pick($id('CType'), 'cash'); await sleep(250);`));
    add(`${t}-pay-cash-then-none`, { type: t }, S(t, `pick($id('CType'), 'cash'); await sleep(100); pick($id('CType'), ''); await sleep(250);`));

    /* ---- credit term ---- */
    add(`${t}-pay-credit-open`, { type: t }, S(t, open('credit_term')));
    add(`${t}-pay-credit-open-dark`, { type: t, theme: 'dark' }, S(t, open('credit_term')));
    add(`${t}-pay-credit-open-en`, { type: t, lang: 'en' }, S(t, open('credit_term')));
    add(`${t}-pay-credit-open-390`, { type: t, w: 390, h: 844 }, S(t, open('credit_term')));
    add(`${t}-pay-credit-days`, { type: t }, S(t, `${open('credit_term')} typ('CrDays', '45'); await sleep(200);`));
    add(`${t}-pay-credit-days-mask`, { type: t }, S(t, `${open('credit_term')} var d = $id('CrDays'); d.value = '4a5๗'; evt(d, 'input'); await sleep(200);`));
    add(`${t}-pay-credit-save`, { type: t }, S(t, `${open('credit_term')} $id('CrSubmit').click(); await sleep(400);`));
    add(`${t}-pay-credit-save-45`, { type: t }, S(t, `${open('credit_term')} typ('CrDays', '45'); $id('CrSubmit').click(); await sleep(400);`));
    add(`${t}-pay-credit-save-dark`, { type: t, theme: 'dark' }, S(t, `${open('credit_term')} $id('CrSubmit').click(); await sleep(400);`));
    add(`${t}-pay-credit-save-en`, { type: t, lang: 'en' }, S(t, `${open('credit_term')} $id('CrSubmit').click(); await sleep(400);`));
    add(`${t}-pay-credit-save-barwait`, { type: t }, S(t, `${open('credit_term')} $id('CrSubmit').click(); await sleep(3400);`));
    [['empty', ''], ['zero', '0'], ['too-big', '366'], ['text', 'abc']].forEach(([n, v]) => {
      add(`${t}-pay-credit-invalid-${n}`, { type: t }, S(t, `${open('credit_term')} var d = $id('CrDays'); d.value = ${JSON.stringify(v)}; evt(d, 'input'); $id('CrSubmit').click(); await sleep(300);`));
    });
    add(`${t}-pay-credit-cancel-x`, { type: t }, S(t, `${open('credit_term')} $id('CrModal').querySelector('.qm-close').click(); await sleep(300);`));
    add(`${t}-pay-credit-cancel-button`, { type: t }, S(t, `${open('credit_term')} $id('CrModal').querySelector('.qm-mfoot [data-close]').click(); await sleep(300);`));
    add(`${t}-pay-credit-cancel-esc`, { type: t }, S(t, `${open('credit_term')} $id('CrModal').dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true })); await sleep(300);`));
    add(`${t}-pay-credit-cancel-backdrop`, { type: t }, S(t, `${open('credit_term')} $id('CrModal').click(); await sleep(300);`));
    add(`${t}-pay-credit-edit`, { type: t }, S(t, `${open('credit_term')} typ('CrDays', '60'); $id('CrSubmit').click(); await sleep(300); $id('PayEdit').click(); await sleep(300);`));
    add(`${t}-pay-credit-edit-cancel-keeps`, { type: t }, S(t, `${open('credit_term')} typ('CrDays', '60'); $id('CrSubmit').click(); await sleep(300); $id('PayEdit').click(); await sleep(200); typ('CrDays', '90'); $id('CrModal').click(); await sleep(300);`));
    add(`${t}-pay-credit-then-cash`, { type: t }, S(t, `${open('credit_term')} $id('CrSubmit').click(); await sleep(300); pick($id('CType'), 'cash'); await sleep(300);`));
    add(`${t}-pay-credit-date-change`, { type: t }, S(t, `${open('credit_term')} $id('CrSubmit').click(); await sleep(300); typ('DocDate', '2026-12-01'); await sleep(300);`));

    /* ---- the tables: contract instalments (schedule), deposit, prepaid ---- */
    ['schedule', 'deposit', 'prepaid'].forEach((m) => {
      add(`${t}-pay-${m}-open-nodoc`, { type: t }, S(t, open(m)));
      add(`${t}-pay-${m}-open`, { type: t }, S(t, `${withTotal} ${open(m)}`));
      add(`${t}-pay-${m}-open-dark`, { type: t, theme: 'dark' }, S(t, `${withTotal} ${open(m)}`));
      add(`${t}-pay-${m}-open-en`, { type: t, lang: 'en' }, S(t, `${withTotal} ${open(m)}`));
      add(`${t}-pay-${m}-open-390`, { type: t, w: 390, h: 844 }, S(t, `${withTotal} ${open(m)}`));
      add(`${t}-pay-${m}-add-row`, { type: t }, S(t, `${withTotal} ${open(m)} $id('PsAdd').click(); await sleep(250);`));
      add(`${t}-pay-${m}-remove-row`, { type: t }, S(t, `${withTotal} ${open(m)} $id('PsAdd').click(); await sleep(150); $id('PsRows').querySelector('[data-pdel]').click(); await sleep(250);`));
      add(`${t}-pay-${m}-gross`, { type: t }, S(t, `${withTotal} ${open(m)} typ(${row0('gross')}, '1000'); await sleep(250);`));
      add(`${t}-pay-${m}-net`, { type: t }, S(t, `${withTotal} ${open(m)} typ(${row0('net')}, '500'); await sleep(250);`));
      add(`${t}-pay-${m}-rate`, { type: t }, S(t, `${withTotal} ${open(m)} pick(${row0('rate')}, '0'); await sleep(250);`));
      add(`${t}-pay-${m}-note`, { type: t }, S(t, `${withTotal} ${open(m)} typ(${row0('note')}, 'งวดแรก'); await sleep(250);`));
      add(`${t}-pay-${m}-due`, { type: t }, S(t, `${withTotal} ${open(m)} typ(${row0('due')}, '2026-12-25'); await sleep(250);`));
      add(`${t}-pay-${m}-save-equal`, { type: t }, S(t, `${withTotal} ${open(m)} typ(${row0('gross')}, '2185'); $id('PsSubmit').click(); await sleep(400);`));
      add(`${t}-pay-${m}-save-half`, { type: t }, S(t, `${withTotal} ${open(m)} typ(${row0('gross')}, '1000'); $id('PsSubmit').click(); await sleep(400);`));
      add(`${t}-pay-${m}-save-over`, { type: t }, S(t, `${withTotal} ${open(m)} typ(${row0('gross')}, '5000'); $id('PsSubmit').click(); await sleep(400);`));
      add(`${t}-pay-${m}-save-two-rows`, { type: t }, S(t, `${withTotal} ${open(m)} typ(${row0('gross')}, '1000'); $id('PsAdd').click(); await sleep(150); typ($id('PsRows').rows[1].querySelector('[data-p="gross"]'), '1185'); $id('PsSubmit').click(); await sleep(400);`));
      add(`${t}-pay-${m}-save-edit`, { type: t }, S(t, `${withTotal} ${open(m)} typ(${row0('gross')}, '2185'); $id('PsSubmit').click(); await sleep(300); $id('PayEdit').click(); await sleep(300);`));
      add(`${t}-pay-${m}-save-dark`, { type: t, theme: 'dark' }, S(t, `${withTotal} ${open(m)} typ(${row0('gross')}, '2185'); $id('PsSubmit').click(); await sleep(400);`));
      add(`${t}-pay-${m}-cancel-esc`, { type: t }, S(t, `${withTotal} ${open(m)} $id('PsModal').dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true })); await sleep(300);`));
      add(`${t}-pay-${m}-cancel-backdrop`, { type: t }, S(t, `${withTotal} ${open(m)} $id('PsModal').click(); await sleep(300);`));
      add(`${t}-pay-${m}-cancel-x`, { type: t }, S(t, `${withTotal} ${open(m)} $id('PsModal').querySelector('.qm-close').click(); await sleep(300);`));
      add(`${t}-pay-${m}-then-vat-change`, { type: t }, S(t, `${withTotal} ${open(m)} typ(${row0('gross')}, '2185'); $id('PsSubmit').click(); await sleep(300); pick($id('VatMode'), 'exclude'); await waitFor(function () { return $('.swal-overlay--show-modal'); }, 3000); await sleep(300);`));
      add(`${t}-pay-${m}-then-row-vat-change`, { type: t }, S(t, `${withTotal} ${open(m)} typ(${row0('gross')}, '2185'); $id('PsSubmit').click(); await sleep(300); pick(cell(row(0), 'vat'), 'exempt'); await waitFor(function () { return $('.swal-overlay--show-modal'); }, 3000); await sleep(300);`));
      add(`${t}-pay-${m}-then-qty-change`, { type: t }, S(t, `${withTotal} ${open(m)} typ(${row0('gross')}, '2185'); $id('PsSubmit').click(); await sleep(300); typ(cell(row(0), 'qty'), '5'); await sleep(300);`));
    });
    // the checks of the table (every message of the strict mode)
    add(`${t}-pay-schedule-invalid-due-empty`, { type: t }, S(t, `${withTotal} ${open('schedule')} typ(${row0('due')}, ''); $id('PsSubmit').click(); await sleep(300);`));
    add(`${t}-pay-schedule-invalid-due-before-doc`, { type: t }, S(t, `${withTotal} ${open('schedule')} typ(${row0('due')}, '2020-01-01'); $id('PsSubmit').click(); await sleep(300);`));
    add(`${t}-pay-schedule-invalid-due-order`, { type: t }, S(t, `${withTotal} ${open('schedule')} typ(${row0('gross')}, '1000'); $id('PsAdd').click(); await sleep(150); typ($id('PsRows').rows[1].querySelector('[data-p="due"]'), '2026-10-21'); typ($id('PsRows').rows[1].querySelector('[data-p="gross"]'), '1185'); typ(${row0('due')}, '2026-12-25'); $id('PsSubmit').click(); await sleep(300);`));
    add(`${t}-pay-schedule-invalid-amount-zero`, { type: t }, S(t, `${withTotal} ${open('deposit')} $id('PsSubmit').click(); await sleep(300);`));
    add(`${t}-pay-schedule-invalid-amount-big`, { type: t }, S(t, `${withTotal} ${open('deposit')} typ(${row0('gross')}, '1000000000'); $id('PsSubmit').click(); await sleep(300);`));
    add(`${t}-pay-schedule-invalid-note-forbidden`, { type: t }, S(t, `${withTotal} ${open('schedule')} typ(${row0('gross')}, '2185'); typ(${row0('note')}, 'a<b'); $id('PsSubmit').click(); await sleep(300);`));
    add(`${t}-pay-schedule-invalid-note-dark`, { type: t, theme: 'dark' }, S(t, `${withTotal} ${open('schedule')} typ(${row0('gross')}, '2185'); typ(${row0('note')}, 'a<b'); $id('PsSubmit').click(); await sleep(300);`));
    add(`${t}-pay-schedule-mask`, { type: t }, S(t, `${withTotal} ${open('schedule')} var g = ${row0('gross')}; evt(g, 'focusin'); g.value = '12a,3.4.5'; evt(g, 'input'); await sleep(250);`));
    // the payment of the document is part of the check on save
    add(`${t}-pay-save-unfilled`, { type: t }, S(t, `await fillValid(); pick($id('CType'), 'credit_term'); await sleep(300); $id('CrModal').querySelector('.qm-close').click(); await sleep(200); pick($id('CType'), 'deposit'); await sleep(300); $id('PsModal').click(); await sleep(200); await save(500);`));
  });
}
