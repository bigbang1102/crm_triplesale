// Scenarios of the prospect form. Each function is run INSIDE the page under test (Java replica / Angular app) with (sleep, side, win) in scope, after the
// prelude of lib/scenario-pre.mjs and the page prelude (`pre` in page.mjs).
// add(name, opts, fn):  opts = { w, h, theme, lang, settle, wait, roots, ready, mode, id, pms }
import docs from './scenarios-docs.mjs';
import save from './scenarios-save.mjs';
import extra from './scenarios-extra.mjs';

export default function (add) {
  docs(add);
  save(add);
  extra(add);
  // the records of the mock (see page.mjs): 1 a person with a picture, 2 a person, 9 a foreigner, 10 a juristic person, 11 without a birth date,
  // 13 without a country, 20 a legacy "company", 26 without a country and a sex, 30 a juristic person without a contact channel
  const RECORDS = [1, 2, 9, 10, 11, 13, 20, 26, 30];
  const SIZES = [[390, 844], [768, 1024], [1024, 768], [1920, 1080]];

  /* ================================================================ first paint ================================================================ */
  add('add', { mode: 'add' }, async function () {});
  add('add-dark', { mode: 'add', theme: 'dark' }, async function () {});
  add('en-add', { mode: 'add', lang: 'en' }, async function () {});
  RECORDS.forEach((id) => {
    add(`view-${id}`, { mode: 'view', id }, async function () {});
    add(`edit-${id}`, { mode: 'edit', id }, async function () {});
  });
  add('view-1-pms', { mode: 'view', id: 1, pms: 'detail' }, async function () {});
  [1, 10].forEach((id) => {
    add(`view-${id}-dark`, { mode: 'view', id, theme: 'dark' }, async function () {});
    add(`edit-${id}-dark`, { mode: 'edit', id, theme: 'dark' }, async function () {});
  });
  add('en-view-1', { mode: 'view', id: 1, lang: 'en' }, async function () {});
  add('en-edit-1', { mode: 'edit', id: 1, lang: 'en' }, async function () {});
  add('en-view-10', { mode: 'view', id: 10, lang: 'en' }, async function () {});
  /* ---- viewports and the A A A buttons ---- */
  SIZES.forEach((s) => {
    add(`add-${s[0]}`, { mode: 'add', w: s[0], h: s[1] }, async function () {});
    add(`view-1-${s[0]}`, { mode: 'view', id: 1, w: s[0], h: s[1] }, async function () {});
    add(`edit-1-${s[0]}`, { mode: 'edit', id: 1, w: s[0], h: s[1] }, async function () {});
  });
  add('fs-plus-edit-1', { mode: 'edit', id: 1 }, 'fontAdj("2px"); await sleep(600);');
  add('fs-minus-edit-1', { mode: 'edit', id: 1 }, 'fontAdj("-2px"); await sleep(600);');
  add('fs-plus-view-1-dark', { mode: 'view', id: 1, theme: 'dark' }, 'fontAdj("2px"); await sleep(600);');
  add('fs-plus-add', { mode: 'add' }, 'fontAdj("2px"); await sleep(600);');
  [[1600, 900], [1279, 800], [1100, 800], [900, 800], [700, 900], [600, 900], [480, 900], [360, 740]].forEach((s) => {
    add(`width-add-${s[0]}`, { mode: 'add', w: s[0], h: s[1] }, async function () {});
    add(`width-edit-${s[0]}`, { mode: 'edit', id: 1, w: s[0], h: s[1] }, async function () {});
  });

  /* ================================================================ the tabs and the sections (the page's own script) ================================================================ */
  [['add', 0], ['view', 1], ['edit', 1], ['view', 10], ['edit', 10]].forEach(([mode, id]) => {
    add(`tab2-${mode}-${id}`, { mode, id }, async function () { await tab(2); });
    add(`tab3-${mode}-${id}`, { mode, id }, async function () { await tab(3); });
  });
  add('tab2-view-1-dark', { mode: 'view', id: 1, theme: 'dark' }, async function () { await tab(2); });
  add('tab3-edit-1-dark', { mode: 'edit', id: 1, theme: 'dark' }, async function () { await tab(3); });
  add('tab2-edit-1-en', { mode: 'edit', id: 1, lang: 'en' }, async function () { await tab(2); });
  add('tab3-view-1-en', { mode: 'view', id: 1, lang: 'en' }, async function () { await tab(3); });
  add('tab2-edit-1-390', { mode: 'edit', id: 1, w: 390, h: 844 }, async function () { await tab(2); });
  add('tab3-edit-1-390', { mode: 'edit', id: 1, w: 390, h: 844 }, async function () { await tab(3); });
  add('tab-back', { mode: 'edit', id: 1 }, async function () { await tab(2); await tab(1); });
  add('tab-round', { mode: 'view', id: 1 }, async function () { await tab(3); await tab(2); await tab(1); });
  add('toggle-section-1', { mode: 'edit', id: 1 }, async function (sleep) { click($$('.togglepanel-container')[0]); await sleep(300); });
  add('toggle-section-1-twice', { mode: 'edit', id: 1 }, async function (sleep) { click($$('.togglepanel-container')[0]); await sleep(150); click($$('.togglepanel-container')[0]); await sleep(300); });
  add('toggle-all-sections', { mode: 'edit', id: 1 }, async function (sleep) { $$('.togglepanel-container').forEach(function (h) { h.click(); }); await sleep(300); });
  add('toggle-all-sections-view', { mode: 'view', id: 10 }, async function (sleep) { $$('.togglepanel-container').forEach(function (h) { h.click(); }); await sleep(300); });
  add('toggle-all-sections-add', { mode: 'add' }, async function (sleep) { $$('.togglepanel-container').forEach(function (h) { h.click(); }); await sleep(300); });

  /* ================================================================ the customer type, the name, the phone (client side + changeUpdate) ================================================================ */
  const TYPE_FILL = async function (sleep) { click(radioBox('form:customer_type', 1)); await sleep(500); };
  add('type-person', { mode: 'add' }, async function (sleep) { click(radioBox('form:customer_type', 0)); await sleep(500); });
  add('type-juristic', { mode: 'add' }, TYPE_FILL);
  add('type-person-dark', { mode: 'add', theme: 'dark' }, async function (sleep) { click(radioBox('form:customer_type', 0)); await sleep(500); });
  add('type-juristic-390', { mode: 'add', w: 390, h: 844 }, TYPE_FILL);
  add('en-type-juristic', { mode: 'add', lang: 'en' }, TYPE_FILL);
  add('type-juristic-then-person', { mode: 'add' }, async function (sleep) { click(radioBox('form:customer_type', 1)); await sleep(400); click(radioBox('form:customer_type', 0)); await sleep(500); });
  add('edit-type-to-juristic', { mode: 'edit', id: 1 }, TYPE_FILL);
  add('edit-type-to-person', { mode: 'edit', id: 10 }, async function (sleep) { click(radioBox('form:customer_type', 0)); await sleep(500); });
  add('gender-female', { mode: 'add' }, async function (sleep) { click(radioBox('form:customer_gender', 1)); await sleep(500); });
  add('gender-other', { mode: 'edit', id: 26 }, async function (sleep) { click(radioBox('form:customer_gender', 2)); await sleep(500); });
  add('name-type', { mode: 'add' }, async function () { await typeField(field('customer_name_input'), 'ทดสอบ ระบบ'); });
  add('name-type-then-type', { mode: 'add' }, async function (sleep) { await typeField(field('customer_name_input'), 'ทดสอบ ระบบ'); click(radioBox('form:customer_type', 0)); await sleep(500); });
  add('name-clear-edit', { mode: 'edit', id: 1 }, async function () { await typeField(field('customer_name_input'), ''); });
  add('tel-type', { mode: 'add' }, async function () { await typeField(field('prospect_tel'), '0812345678'); });
  add('tel-type-letters', { mode: 'add' }, async function () { await typeField(field('prospect_tel'), '08a1-2b3'); });
  add('tel-type-long', { mode: 'add' }, async function () { await typeField(field('prospect_tel'), '081234567890123'); });
  add('tel-edit-clear', { mode: 'edit', id: 2 }, async function () { await typeField(field('prospect_tel'), ''); });
  add('tel-code-open', { mode: 'add' }, async function () { await openSel(0); });
  add('tel-code-choose-uk', { mode: 'edit', id: 2 }, async function () { await chooseIdx(0, 2); });
  add('tel-code-choose-then-type', { mode: 'add' }, async function () { await chooseIdx(0, 1); await typeField(field('prospect_tel'), '0812345678'); });

  /* ---- every select of the form, opened (in the three widths that matter) ---- */
  for (let i = 0; i < 15; i++) {
    // (a string of code: a function would not see i — it runs inside the page)
    add(`select-open-${i}`, { mode: 'edit', id: 1 }, `await openSel(${i});`);
  }
  add('select-open-dark', { mode: 'edit', id: 1, theme: 'dark' }, async function () { await openSel(3); });
  add('select-open-en', { mode: 'edit', id: 1, lang: 'en' }, async function () { await openSel(3); });
  add('select-open-390', { mode: 'edit', id: 1, w: 390, h: 844 }, async function () { await openSel(3); });
  add('select-filter', { mode: 'edit', id: 1 }, async function (sleep) { await openSel(3); typeField($('[id="' + selEl(3).id + '_panel"] .ui-selectonemenu-filter'), 'ก'); await sleep(500); });
  add('select-choose-3', { mode: 'edit', id: 1 }, async function () { await chooseIdx(3, 2); });
  add('select-choose-3-dark', { mode: 'edit', id: 1, theme: 'dark' }, async function () { await chooseIdx(3, 2); });
  add('select-choose-add-0', { mode: 'add' }, async function () { await chooseIdx(0, 2); });
  add('select-keyboard', { mode: 'edit', id: 1 }, async function (sleep) { await openSel(3); document.activeElement.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true })); await sleep(200); document.activeElement.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true })); await sleep(500); });
  add('select-escape', { mode: 'edit', id: 1 }, async function (sleep) { await openSel(3); document.activeElement.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true })); await sleep(400); });

  /* ---- the dates ---- */
  add('date-open-first', { mode: 'add' }, async function () { await openCal(0); });
  add('date-open-birth', { mode: 'edit', id: 1 }, async function () { await openCal(1); });
  add('date-open-dark', { mode: 'edit', id: 1, theme: 'dark' }, async function () { await openCal(1); });
  add('date-open-en', { mode: 'edit', id: 1, lang: 'en' }, async function () { await openCal(1); });
  add('date-open-390', { mode: 'edit', id: 1, w: 390, h: 844 }, async function () { await openCal(1); });
  add('date-open-empty', { mode: 'edit', id: 11 }, async function () { await openCal(1); });
  add('date-type', { mode: 'edit', id: 1 }, async function (sleep) { await typeField(calEl(1).querySelector('input'), '05/10/1990'); await sleep(200); });

  /* ================================================================ the address: province → district → sub-district → post code, the copy, the country ================================================================ */
  // the selects, by position: 0 phone code · 1 contact channel · 2 convenient time · 3 country · 4 source · 5 occupation · 6 business type · 7-10 current address (country, province, district, sub-district) · 11-14 the same for the documents
  add('addr-province', { mode: 'edit', id: 2 }, async function () { await chooseIdx(8, 3); });
  add('addr-province-then-district', { mode: 'edit', id: 2 }, async function () { await chooseIdx(8, 3); await chooseIdx(9, 1); });
  add('addr-province-district-sub', { mode: 'edit', id: 2 }, async function () { await chooseIdx(8, 3); await chooseIdx(9, 1); await chooseIdx(10, 1); });
  add('addr-bangkok-zip', { mode: 'edit', id: 2 }, async function () { await chooseIdx(8, 1); await chooseIdx(9, 1); await chooseIdx(10, 1); });
  add('addr-district-only', { mode: 'edit', id: 1 }, async function () { await chooseIdx(9, 2); });
  add('addr-sub-only', { mode: 'edit', id: 2 }, async function () { await chooseIdx(10, 2); });
  add('addr-doc-province', { mode: 'edit', id: 2 }, async function () { await chooseIdx(12, 2); });
  add('addr-doc-district-sub', { mode: 'edit', id: 2 }, async function () { await chooseIdx(12, 1); await chooseIdx(13, 1); await chooseIdx(14, 1); });
  add('addr-country-1', { mode: 'edit', id: 2 }, async function () { await chooseIdx(7, 2); });
  add('addr-country-2', { mode: 'edit', id: 2 }, async function () { await chooseIdx(11, 2); });
  add('addr-copy', { mode: 'edit', id: 2 }, async function (sleep) { click(field('j_idt32')); await sleep(900); });
  add('addr-copy-after-province', { mode: 'edit', id: 2 }, async function (sleep) { await chooseIdx(8, 3); await chooseIdx(9, 1); click(field('j_idt32')); await sleep(900); });
  add('addr-copy-add', { mode: 'add' }, async function (sleep) { click(field('j_idt32')); await sleep(900); });
  add('addr-post-type', { mode: 'edit', id: 2 }, async function () { await typeField(field('current_postid_in'), '10500'); await toTop(); });
  add('addr-foreigner-edit', { mode: 'edit', id: 9 }, async function () {});
  add('addr-province-dark', { mode: 'edit', id: 2, theme: 'dark' }, async function () { await chooseIdx(8, 3); });
  add('addr-province-en', { mode: 'edit', id: 2, lang: 'en' }, async function () { await chooseIdx(8, 3); });
  add('country-change', { mode: 'edit', id: 2 }, async function () { await chooseIdx(3, 2); });
  add('country-change-add', { mode: 'add' }, async function () { await chooseIdx(3, 3); });
  add('country-change-then-tel', { mode: 'add' }, async function () { await chooseIdx(3, 3); await typeField(field('prospect_tel'), '0812345678'); });
  add('addr-open-province', { mode: 'edit', id: 2 }, async function () { await openSel(8); });
  add('addr-open-district-empty', { mode: 'add' }, async function () { await openSel(9); });
  add('source-choose', { mode: 'edit', id: 2 }, async function () { await chooseIdx(4, 2); });
  add('occupation-choose', { mode: 'edit', id: 2 }, async function () { await chooseIdx(5, 2); });
  add('business-choose', { mode: 'edit', id: 10 }, async function () { await chooseIdx(6, 2); });
  add('contact-channel-choose', { mode: 'edit', id: 2 }, async function () { await chooseIdx(1, 2); });
  add('convenient-choose', { mode: 'edit', id: 2 }, async function () { await chooseIdx(2, 2); });
  add('juristic-fields', { mode: 'edit', id: 10 }, async function () { await tab(1); });
  add('remark-type', { mode: 'edit', id: 2 }, async function () { await typeField(field('j_idt3'), 'หมายเหตุทดสอบ'); });
  add('email-type', { mode: 'add' }, async function () { await typeField(field('j_idt20'), 'a@b.co'); });
}
