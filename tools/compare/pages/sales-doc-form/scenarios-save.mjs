// Scenarios: the save of every form — the check of the whole document (the red bar, the messages under the fields), the "saved" pop-up, the
// print screen (an iframe made from the form: the sheet of the quotation / booking, the formal form of the delivery note and the auto-dealer
// documents), the way back to the list. There is no save API: the Java pages open the pop-up with a provisional number.
export default function (add, S, ALL) {
  const NONE = ['.no-such-root']; // (the page leaves — Angular moves to the list, Java is held back — so only the address is compared)
  const waitSaved = (t) => `await waitFor(function () { return $id('SavedModal').classList.contains('qm-open'); }, 4000); await sleep(300);`;
  // The frame of the print screen is fitted to its content when it has loaded (and once more 300 ms later). If the web font of the paper is still
  // loading at that moment the lines wrap with the fallback font and the frame gets taller than the paper needs; the body never lets it shrink again
  // (min-height 100 %). That depends on the timing of the font — in the Java page as much as here — so the scenarios wait for the fonts of the frame
  // and let the frame be fitted once more from its natural height: what a user sees once the page has settled.
  const ready = `function () { var f = $id('PsFrame'); return f && f.contentDocument && f.contentDocument.body && f.contentDocument.body.children.length && f.style.height; }`;
  const waitPrint = `await waitFor(${ready}, 6000); var pf = $id('PsFrame'); await waitFor(function () { return pf.contentDocument.fonts.status === 'loaded'; }, 6000); await sleep(500); pf.style.height = ''; window.dispatchEvent(new Event('resize')); await sleep(300); await waitFor(${ready}, 6000); await sleep(600);`;
  const frame = (t) => [{ sel: `#${t}PsFrame`, name: 'print', roots: ['body'] }];
  ALL.forEach((t) => {
    /* ---- the check of the document ---- */
    add(`${t}-save-empty`, { type: t }, S(t, `await save(500);`));
    add(`${t}-save-empty-dark`, { type: t, theme: 'dark' }, S(t, `await save(500);`));
    add(`${t}-save-empty-en`, { type: t, lang: 'en' }, S(t, `await save(500);`));
    add(`${t}-save-empty-390`, { type: t, w: 390, h: 844 }, S(t, `await save(500);`));
    add(`${t}-save-empty-bar-gone`, { type: t }, S(t, `await save(500); await sleep(3600);`));
    add(`${t}-save-customer-only`, { type: t }, S(t, `await pickCust(0); await save(500);`));
    add(`${t}-save-customer-only-en`, { type: t, lang: 'en' }, S(t, `await pickCust(0); await save(500);`));
    add(`${t}-save-date-empty`, { type: t }, S(t, `await fillValid(); typ('DocDate', ''); await save(500);`));
    add(`${t}-save-then-fix`, { type: t }, S(t, `await save(400); await sleep(100); await fillValid(); await sleep(200);`));

    /* ---- saved ---- */
    add(`${t}-save-ok`, { type: t }, S(t, `spyPayload(); await fillValid(); await save(300); ${waitSaved(t)}`));
    add(`${t}-save-ok-dark`, { type: t, theme: 'dark' }, S(t, `await fillValid(); await save(300); ${waitSaved(t)}`));
    add(`${t}-save-ok-en`, { type: t, lang: 'en' }, S(t, `spyPayload(); await fillValid(); await save(300); ${waitSaved(t)}`));
    add(`${t}-save-ok-390`, { type: t, w: 390, h: 844 }, S(t, `await fillValid(); await save(300); ${waitSaved(t)}`));
    add(`${t}-saved-list`, { type: t, roots: NONE }, S(t, `trackNav(side); await fillValid(); await save(300); ${waitSaved(t)} $id('SavedList').click(); await sleep(500);`));
    add(`${t}-saved-esc`, { type: t, roots: NONE }, S(t, `trackNav(side); await fillValid(); await save(300); ${waitSaved(t)} $id('SavedModal').dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true })); await sleep(500);`));
    add(`${t}-saved-backdrop`, { type: t, roots: NONE }, S(t, `trackNav(side); await fillValid(); await save(300); ${waitSaved(t)} $id('SavedModal').click(); await sleep(500);`));

    /* ---- the print screen ---- */
    add(`${t}-print`, { type: t, frames: frame(t) }, S(t, `await fillValid(); await save(300); ${waitSaved(t)} $id('SavedPrint').click(); ${waitPrint}`));
    add(`${t}-print-dark`, { type: t, theme: 'dark', frames: frame(t) }, S(t, `await fillValid(); await save(300); ${waitSaved(t)} $id('SavedPrint').click(); ${waitPrint}`));
    add(`${t}-print-en`, { type: t, lang: 'en', frames: frame(t) }, S(t, `await fillValid(); await save(300); ${waitSaved(t)} $id('SavedPrint').click(); ${waitPrint}`));
    add(`${t}-print-390`, { type: t, w: 390, h: 844, frames: frame(t) }, S(t, `await fillValid(); await save(300); ${waitSaved(t)} $id('SavedPrint').click(); ${waitPrint}`));
    add(`${t}-print-1920`, { type: t, w: 1920, h: 1080, frames: frame(t) }, S(t, `await fillValid(); await save(300); ${waitSaved(t)} $id('SavedPrint').click(); ${waitPrint}`));
    add(`${t}-print-click`, { type: t, roots: ['.no-such-root'] }, S(t, `await fillValid(); await save(300); ${waitSaved(t)} $id('SavedPrint').click(); ${waitPrint} stubPrint(); $id('PsPrint').click(); await sleep(300); var prev = window.__extra; window.__extra = async function () { return ['PRINT CALLS ' + printCalls]; };`));
    add(`${t}-print-back`, { type: t, roots: NONE }, S(t, `trackNav(side); await fillValid(); await save(300); ${waitSaved(t)} $id('SavedPrint').click(); ${waitPrint} $id('PsBack').click(); await sleep(500);`));
    add(`${t}-print-resize`, { type: t, frames: frame(t) }, S(t, `await fillValid(); await save(300); ${waitSaved(t)} $id('SavedPrint').click(); ${waitPrint} window.dispatchEvent(new Event('resize')); await sleep(500);`));
  });

  /* ---- the sheet with what the document holds ---- */
  ['qt', 'bk', 'ob'].forEach((t) => {
    const rich = `await fillValid(); await addRow(); setProduct(1, 'PT-OIL5W30'); typ(cell(row(1), 'qty'), '3.5'); typ(cell(row(1), 'disc'), '10%'); pick(cell(row(1), 'vat'), 'exclude'); typ($id('Discount'), '100'); typ($id('Remarks'), 'หมายเหตุบรรทัดที่ 1\\nหมายเหตุบรรทัดที่ 2'); await sleep(200);`;
    add(`${t}-print-rich`, { type: t, frames: [{ sel: `#${t}PsFrame`, name: 'print', roots: ['body'] }] }, S(t, `${rich} await save(300); ${waitSaved(t)} $id('SavedPrint').click(); ${waitPrint}`));
    add(`${t}-print-rich-payload`, { type: t }, S(t, `spyPayload(); ${rich} await save(300); ${waitSaved(t)}`));
    add(`${t}-print-exempt`, { type: t, frames: [{ sel: `#${t}PsFrame`, name: 'print', roots: ['body'] }] }, S(t, `await fillValid(); pick($id('VatMode'), 'exempt'); await sleep(200); await save(300); ${waitSaved(t)} $id('SavedPrint').click(); ${waitPrint}`));
    add(`${t}-print-credit`, { type: t, frames: [{ sel: `#${t}PsFrame`, name: 'print', roots: ['body'] }] }, S(t, `await fillValid(); if ($id('CType')) { pick($id('CType'), 'credit_term'); await sleep(200); $id('CrSubmit').click(); await sleep(300); } await save(300); ${waitSaved(t)} $id('SavedPrint').click(); ${waitPrint}`));
    add(`${t}-print-schedule`, { type: t, frames: [{ sel: `#${t}PsFrame`, name: 'print', roots: ['body'] }] }, S(t, `await fillValid(); if ($id('CType')) { pick($id('CType'), 'schedule'); await sleep(200); $id('PsSubmit').click(); await sleep(300); } await save(300); ${waitSaved(t)} $id('SavedPrint').click(); ${waitPrint}`));
  });
}
