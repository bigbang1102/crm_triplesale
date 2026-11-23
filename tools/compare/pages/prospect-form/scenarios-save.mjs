// Scenarios of the prospect form: "save and create a lead" (add), "create a lead" (view), "update" (edit) — the modals, the remote commands, the messages and where the
// page goes next. Run INSIDE the page under test — see scenarios.mjs.
export default function (add) {
  // (NEW_LEAD · VIEW_LEAD · UPDATE · pickIn · OPEN_MODAL · SUBMIT are in the prelude of page.mjs: a scenario function runs inside the page, it sees no variable of this file)

  /* ================================================================ add: save and create a lead ================================================================ */
  add('create-no-type', { mode: 'add' }, async function (sleep) { click(NEW_LEAD); await sleep(700); });
  add('create-no-type-dark', { mode: 'add', theme: 'dark' }, async function (sleep) { click(NEW_LEAD); await sleep(700); });
  add('create-no-type-en', { mode: 'add', lang: 'en' }, async function (sleep) { click(NEW_LEAD); await sleep(700); });
  add('create-no-name', { mode: 'add' }, async function (sleep) { click(radioBox('form:customer_type', 0)); await sleep(400); click(NEW_LEAD); await sleep(700); });
  add('create-modal-open', { mode: 'add' }, async function (sleep) { click(radioBox('form:customer_type', 0)); await sleep(400); await typeField(field('customer_name_input'), 'ทดสอบ ระบบ'); click(NEW_LEAD); await sleep(1200); });
  add('create-modal-open-dark', { mode: 'add', theme: 'dark' }, async function (sleep) { click(radioBox('form:customer_type', 0)); await sleep(400); await typeField(field('customer_name_input'), 'ทดสอบ ระบบ'); click(NEW_LEAD); await sleep(1200); });
  add('create-modal-open-en', { mode: 'add', lang: 'en' }, async function (sleep) { click(radioBox('form:customer_type', 0)); await sleep(400); await typeField(field('customer_name_input'), 'Test Person'); click(NEW_LEAD); await sleep(1200); });
  add('create-modal-open-390', { mode: 'add', w: 390, h: 844 }, async function (sleep) { click(radioBox('form:customer_type', 0)); await sleep(400); await typeField(field('customer_name_input'), 'ทดสอบ ระบบ'); click(NEW_LEAD); await sleep(1200); });
  add('create-modal-open-juristic', { mode: 'add' }, async function (sleep) { click(radioBox('form:customer_type', 1)); await sleep(400); await typeField(field('customer_name_input'), 'บริษัท ทดสอบ จำกัด'); click(NEW_LEAD); await sleep(1200); });
  add('create-modal-close-x', { mode: 'add' }, async function (sleep) { click(radioBox('form:customer_type', 0)); await sleep(400); await typeField(field('customer_name_input'), 'ทดสอบ ระบบ'); click(NEW_LEAD); await sleep(800); click('#createLeadModal .cl-modal-close'); await sleep(400); });
  add('create-modal-cancel', { mode: 'add' }, async function (sleep) { click(radioBox('form:customer_type', 0)); await sleep(400); await typeField(field('customer_name_input'), 'ทดสอบ ระบบ'); click(NEW_LEAD); await sleep(800); click('#createLeadModal .cl-btn-secondary'); await sleep(400); });
  add('create-modal-escape', { mode: 'add' }, async function (sleep) { click(radioBox('form:customer_type', 0)); await sleep(400); await typeField(field('customer_name_input'), 'ทดสอบ ระบบ'); click(NEW_LEAD); await sleep(800); document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true })); await sleep(400); });
  add('create-modal-backdrop', { mode: 'add' }, async function (sleep) { click(radioBox('form:customer_type', 0)); await sleep(400); await typeField(field('customer_name_input'), 'ทดสอบ ระบบ'); click(NEW_LEAD); await sleep(800); click('#createLeadModal'); await sleep(400); });
  add('create-modal-product', { mode: 'add' }, async function (sleep) { await OPEN_MODAL(sleep); await pickIn('clProduct', 1); await sleep(800); });
  add('create-modal-product-2', { mode: 'add' }, async function (sleep) { await OPEN_MODAL(sleep); await pickIn('clProduct', 2); await sleep(800); });
  add('create-modal-stepgroup', { mode: 'add' }, async function (sleep) { await OPEN_MODAL(sleep); await pickIn('clProduct', 1); await sleep(800); await pickIn('clStepGroup', 1); await sleep(600); });
  add('create-modal-all-chosen', { mode: 'add' }, async function (sleep) { await OPEN_MODAL(sleep); await pickIn('clProduct', 1); await sleep(800); await pickIn('clStepGroup', 1); await sleep(600); await pickIn('clOwner', 1); await pickIn('clSales', 1); });
  add('create-modal-all-chosen-dark', { mode: 'add', theme: 'dark' }, async function (sleep) { await OPEN_MODAL(sleep); await pickIn('clProduct', 1); await sleep(800); await pickIn('clStepGroup', 1); await sleep(600); await pickIn('clOwner', 1); await pickIn('clSales', 1); });
  add('create-submit-missing', { mode: 'add' }, async function (sleep) { await OPEN_MODAL(sleep); click('#createLeadSubmitBtn'); await sleep(900); });
  add('create-submit-missing-stepgroup', { mode: 'add' }, async function (sleep) { await OPEN_MODAL(sleep); await pickIn('clProduct', 1); await sleep(800); click('#createLeadSubmitBtn'); await sleep(900); });
  add('create-submit-ok', { mode: 'add' }, async function (sleep) { await SUBMIT(sleep); });
  add('create-submit-ok-dark', { mode: 'add', theme: 'dark' }, async function (sleep) { await SUBMIT(sleep); });
  add('create-submit-ok-en', { mode: 'add', lang: 'en' }, async function (sleep) { await SUBMIT(sleep, 'Test Person'); });
  add('create-submit-ok-close', { mode: 'add', roots: ['.swal-overlay'] }, async function (sleep, side) { trackNav(side); await SUBMIT(sleep); click('#createLeadSuccessModal .cl-btn-secondary'); await sleep(900); });
  add('create-submit-ok-goto-lead', { mode: 'add', roots: ['.swal-overlay'] }, async function (sleep, side) { trackNav(side); await SUBMIT(sleep); click('#createLeadSuccessModal .cl-btn-purple'); await sleep(900); });
  add('create-submit-dup', { mode: 'add' }, async function (sleep) { await SUBMIT(sleep, 'X-DUP'); });
  add('create-submit-dup-confirm', { mode: 'add' }, async function (sleep) { await SUBMIT(sleep, 'X-DUP'); click('#mergeConfirmBtn'); await sleep(2500); });
  add('create-submit-dup-cancel', { mode: 'add' }, async function (sleep) { await SUBMIT(sleep, 'X-DUP'); click('#mergeConfirmModal .cl-btn-secondary'); await sleep(900); });
  add('create-submit-fail', { mode: 'add' }, async function (sleep) { await SUBMIT(sleep, 'X-FAIL'); });
  add('create-submit-invalid', { mode: 'add' }, async function (sleep) { await SUBMIT(sleep, 'X-INVALID'); });
  add('create-submit-noreply', { mode: 'add' }, async function (sleep) { await SUBMIT(sleep, 'X-NOREPLY'); });

  /* ================================================================ view: create a lead for the customer ================================================================ */
  add('view-create-lead-open', { mode: 'view', id: 1 }, async function (sleep) { click(VIEW_LEAD); await sleep(1200); });
  add('view-create-lead-open-dark', { mode: 'view', id: 1, theme: 'dark' }, async function (sleep) { click(VIEW_LEAD); await sleep(1200); });
  add('view-create-lead-submit', { mode: 'view', id: 1 }, async function (sleep) { click(VIEW_LEAD); await sleep(1200); await pickIn('clProduct', 1); await sleep(800); await pickIn('clStepGroup', 1); await sleep(600); await pickIn('clOwner', 1); click('#createLeadSubmitBtn'); await sleep(2500); });

  /* ================================================================ edit: update ================================================================ */
  add('update-open-confirm', { mode: 'edit', id: 1 }, async function (sleep) { click(UPDATE); await sleep(600); });
  add('update-open-confirm-dark', { mode: 'edit', id: 1, theme: 'dark' }, async function (sleep) { click(UPDATE); await sleep(600); });
  add('update-open-confirm-en', { mode: 'edit', id: 1, lang: 'en' }, async function (sleep) { click(UPDATE); await sleep(600); });
  add('update-open-confirm-390', { mode: 'edit', id: 1, w: 390, h: 844 }, async function (sleep) { click(UPDATE); await sleep(600); });
  add('update-confirm-cancel', { mode: 'edit', id: 1 }, async function (sleep) { click(UPDATE); await sleep(500); click('#updateConfirmModal .cl-btn-secondary'); await sleep(500); });
  add('update-confirm-backdrop', { mode: 'edit', id: 1 }, async function (sleep) { click(UPDATE); await sleep(500); click('#updateConfirmModal'); await sleep(500); });
  add('update-confirm-escape', { mode: 'edit', id: 1 }, async function (sleep) { click(UPDATE); await sleep(500); document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true })); await sleep(500); });
  add('update-no-name', { mode: 'edit', id: 1 }, async function (sleep) { await typeField(field('customer_name_input'), ''); click(UPDATE); await sleep(700); });
  add('update-ok', { mode: 'edit', id: 1, roots: ['.swal-overlay'] }, async function (sleep, side) { trackNav(side); click(UPDATE); await sleep(500); click('#updateConfirmModal .cl-btn-purple'); await sleep(3500); });
  add('update-ok-dark', { mode: 'edit', id: 1, theme: 'dark', roots: ['.swal-overlay'] }, async function (sleep, side) { trackNav(side); click(UPDATE); await sleep(500); click('#updateConfirmModal .cl-btn-purple'); await sleep(1500); });
  add('update-ok-en', { mode: 'edit', id: 1, lang: 'en', roots: ['.swal-overlay'] }, async function (sleep, side) { trackNav(side); click(UPDATE); await sleep(500); click('#updateConfirmModal .cl-btn-purple'); await sleep(3500); });
  add('update-edited-ok', { mode: 'edit', id: 2, roots: ['.swal-overlay'] }, async function (sleep, side) { trackNav(side); await typeField(field('customer_name_input'), 'ชื่อใหม่ ทดสอบ'); await typeField(field('prospect_tel'), '0899998888'); click(UPDATE); await sleep(500); click('#updateConfirmModal .cl-btn-purple'); await sleep(3500); });
  add('update-fail', { mode: 'edit', id: 2, roots: ['.swal-overlay'] }, async function (sleep, side) { trackNav(side); await typeField(field('customer_name_input'), 'X-FAIL'); click(UPDATE); await sleep(500); click('#updateConfirmModal .cl-btn-purple'); await sleep(2500); });
  add('update-juristic-ok', { mode: 'edit', id: 10, roots: ['.swal-overlay'] }, async function (sleep, side) { trackNav(side); click(UPDATE); await sleep(500); click('#updateConfirmModal .cl-btn-purple'); await sleep(3500); });
}
