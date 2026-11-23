// Scenarios of the supporting-document form comparison. Each function is run INSIDE the page under test (Java replica / Angular app) with
// (sleep, side, win) in scope, after the prelude of lib/scenario-pre.mjs and the page prelude (`pre` in page.mjs).
// add(name, opts, fn):  opts = { w, h, theme, lang, settle, wait, roots, ready, doc, mode, k }
export default function (add) {
  const FAMILIES = ['letter-of-intent', 'legal-credit-request', 'service-contract', 'loan-agreement', 'preliminary-credit-approval', 'property-project-contract', 'credit-application'];
  const short = (d) => d.split('-')[0] + d.split('-').length;
  const SIZES = [[390, 844], [768, 1024], [1024, 768], [1920, 1080]];

  /* ---- first paint: every family, every mode, both themes, both languages ---- */
  FAMILIES.forEach((d) => {
    const n = short(d);
    ['add', 'edit', 'detail'].forEach((mode) => {
      add(`${mode}-${n}`, { doc: d, mode }, async function () {});
      add(`${mode}-${n}-dark`, { doc: d, mode, theme: 'dark' }, async function () {});
    });
    add(`en-add-${n}`, { doc: d, mode: 'add', lang: 'en' }, async function () {});
    add(`en-edit-${n}`, { doc: d, mode: 'edit', lang: 'en' }, async function () {});
    add(`en-detail-${n}`, { doc: d, mode: 'detail', lang: 'en' }, async function () {});
  });
  // other documents (1 = few fields, 4 = a different mix): the first and the last family
  ['letter-of-intent', 'credit-application'].forEach((d) => {
    ['edit', 'detail'].forEach((mode) => [1, 4].forEach((k) => add(`${mode}-${short(d)}-doc${k}`, { doc: d, mode, k }, async function () {})));
  });
  /* ---- viewports and the A A A buttons ---- */
  ['letter-of-intent', 'credit-application'].forEach((d) => {
    SIZES.forEach((s) => {
      add(`add-${short(d)}-${s[0]}`, { doc: d, mode: 'add', w: s[0], h: s[1] }, async function () {});
      add(`edit-${short(d)}-${s[0]}`, { doc: d, mode: 'edit', w: s[0], h: s[1] }, async function () {});
      add(`detail-${short(d)}-${s[0]}`, { doc: d, mode: 'detail', w: s[0], h: s[1] }, async function () {});
    });
    add(`fs-plus-edit-${short(d)}`, { doc: d, mode: 'edit' }, 'fontAdj("2px"); await sleep(600);');
    add(`fs-minus-edit-${short(d)}`, { doc: d, mode: 'edit' }, 'fontAdj("-2px"); await sleep(600);');
    add(`fs-plus-detail-${short(d)}-dark`, { doc: d, mode: 'detail', theme: 'dark' }, 'fontAdj("2px"); await sleep(600);');
  });
  [[1600, 900], [1279, 800], [1100, 800], [900, 800], [700, 900], [600, 900], [480, 900], [360, 740]].forEach((s) => {
    add(`width-add-${s[0]}`, { mode: 'add', w: s[0], h: s[1] }, async function () {});
    add(`width-edit-7-${s[0]}`, { doc: 'credit-application', mode: 'edit', w: s[0], h: s[1] }, async function () {});
  });

  /* ================================================================ behaviour (the part that needs no server) ================================================================ */
  // the tabs and the sections
  FAMILIES.slice(0, 6).forEach((d) => {
    add(`tab-docs-${short(d)}`, { doc: d, mode: 'edit' }, async function () { await tab(2); });
    add(`tab-docs-add-${short(d)}`, { doc: d, mode: 'add' }, async function () { await tab(2); });
  });
  add('tab-docs-detail', { mode: 'detail' }, async function () { await tab(2); });
  add('tab-docs-dark', { mode: 'edit', theme: 'dark' }, async function () { await tab(2); });
  add('tab-docs-390', { mode: 'edit', w: 390, h: 844 }, async function () { await tab(2); });
  add('tab-docs-en', { mode: 'edit', lang: 'en' }, async function () { await tab(2); });
  add('tab-back', { mode: 'edit' }, async function () { await tab(2); await tab(1); });
  add('toggle-section-1', { mode: 'edit' }, async function (sleep) { click($$('.togglepanel-container')[0]); await sleep(300); });
  add('toggle-section-1-twice', { mode: 'edit' }, async function (sleep) { click($$('.togglepanel-container')[0]); await sleep(150); click($$('.togglepanel-container')[0]); await sleep(300); });
  add('toggle-all-sections', { mode: 'edit' }, async function (sleep) { $$('.togglepanel-container').forEach(function (h) { h.click(); }); await sleep(300); });
  add('toggle-section-7', { doc: 'credit-application', mode: 'edit' }, async function (sleep) { click($$('.togglepanel-container')[2]); await sleep(300); });
  add('toggle-all-sections-7', { doc: 'credit-application', mode: 'edit' }, async function (sleep) { $$('.togglepanel-container').forEach(function (h) { h.click(); }); await sleep(300); });
  // the confirmation of the save
  const confirmOpen = async function (sleep) { click($$('.sd-save-btn')[0]); await sleep(300); };
  add('confirm-add', { mode: 'add' }, confirmOpen);
  add('confirm-edit', { mode: 'edit' }, confirmOpen);
  add('confirm-edit-en', { mode: 'edit', lang: 'en' }, confirmOpen);
  add('confirm-add-dark', { mode: 'add', theme: 'dark' }, confirmOpen);
  add('confirm-edit-390', { mode: 'edit', w: 390, h: 844 }, confirmOpen);
  add('confirm-7-edit', { doc: 'credit-application', mode: 'edit' }, confirmOpen);
  add('confirm-cancel', { mode: 'edit' }, async function (sleep) { await confirmOpen(sleep); click('.sd-confirm-cancel'); await sleep(300); });
  add('confirm-x', { mode: 'edit' }, async function (sleep) { await confirmOpen(sleep); click('.sd-confirm-close'); await sleep(300); });
  add('confirm-overlay-click', { mode: 'edit' }, async function (sleep) { await confirmOpen(sleep); click('#sdSaveConfirmOverlay'); await sleep(300); });
  add('confirm-box-click-stays', { mode: 'edit' }, async function (sleep) { await confirmOpen(sleep); click('.sd-confirm-box'); await sleep(300); });
  add('confirm-from-docs-tab', { mode: 'edit' }, async function (sleep) { await tab(2); click($$('.sd-save-btn')[1]); await sleep(300); });
  // the receiver (a PrimeFaces select without ajax) and the dates
  add('rcvby-open', { mode: 'add' }, async function () { await openSel(1); });
  add('rcvby-open-dark', { mode: 'add', theme: 'dark' }, async function () { await openSel(1); });
  add('rcvby-open-en', { mode: 'add', lang: 'en' }, async function () { await openSel(1); });
  add('rcvby-open-390', { mode: 'add', w: 390, h: 844 }, async function () { await openSel(1); });
  add('rcvby-filter', { mode: 'add' }, async function (sleep) { await openSel(1); typeField($('[id="' + selEl(1).id + '_panel"] .ui-selectonemenu-filter'), 'สุดา'); await sleep(500); });
  add('rcvby-choose', { mode: 'add' }, async function () { await chooseOpt(1, 'สุดา รักงาน'); });
  add('rcvby-choose-dark', { mode: 'add', theme: 'dark' }, async function () { await chooseOpt(1, 'วิชัย มั่นคง'); });
  add('rcvby-keyboard', { mode: 'add' }, async function (sleep) { await openSel(1); var l = selEl(1).querySelector('.ui-selectonemenu-label'); ['ArrowDown', 'ArrowDown', 'Enter'].forEach(function (k) { document.activeElement.dispatchEvent(new KeyboardEvent('keydown', { key: k, bubbles: true })); }); await sleep(400); });
  add('rcvby-escape', { mode: 'add' }, async function (sleep) { await openSel(1); document.activeElement.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true })); await sleep(400); });
  add('customer-open', { mode: 'add' }, async function () { await openSel(0); });
  add('customer-open-dark', { mode: 'add', theme: 'dark' }, async function () { await openSel(0); });
  add('customer-open-scrolled', { mode: 'add' }, async function (sleep) { await openSel(0); var w = $('[id="' + selEl(0).id + '_panel"] .ui-selectonemenu-items-wrapper'); w.scrollTop = 120; w.dispatchEvent(new Event('scroll')); await sleep(300); });
  add('rcvdate-open', { mode: 'add' }, async function () { await openCal(2); });
  add('rcvdate-open-dark', { mode: 'add', theme: 'dark' }, async function () { await openCal(2); });
  add('rcvdate-open-en', { mode: 'add', lang: 'en' }, async function () { await openCal(2); });
  add('refdate-open', { mode: 'add' }, async function () { await openCal(0); });
  add('docdate-open', { mode: 'add' }, async function () { await openCal(1); });
  add('rcvdate-pick-day', { mode: 'add' }, async function (sleep) { await openCal(2); click($$('#ui-datepicker-div td a').filter(function (a) { return a.textContent.trim() === '15'; })[0]); await sleep(400); });
  add('rcvdate-next-month', { mode: 'add' }, async function (sleep) { await openCal(2); click('#ui-datepicker-div .ui-datepicker-next'); await sleep(500); });
  add('rcvdate-month-list', { mode: 'add' }, async function (sleep) { await openCal(2); click('#ui-datepicker-div .ods-btn'); await sleep(400); });
  add('rcvdate-type', { mode: 'add' }, async function (sleep) { await typeField(calEl(2).querySelector('input'), '05/10/2026'); await openCal(2); await sleep(200); });
  add('rcvdate-open-390', { mode: 'add', w: 390, h: 844 }, async function () { await openCal(2); });
  add('rcvdate-closes-on-outside-click', { mode: 'add' }, async function (sleep) { await openCal(2); document.body.click(); await sleep(400); });
  // typing into the plain fields
  add('type-fields', { mode: 'add' }, async function (sleep) { var i = $$('input.ui-inputtext'); await typeField(i[0], 'REF-001'); await typeField($('textarea'), 'หมายเหตุ'); await sleep(200); });
  add('type-fields-dark', { mode: 'add', theme: 'dark' }, async function (sleep) { var i = $$('input.ui-inputtext'); await typeField(i[0], 'REF-001'); await sleep(200); });
  // the detail's button, and the way out of the page
  add('detail-edit-button', { mode: 'detail', roots: ['.swal-overlay'] }, async function (sleep, side) { trackNav(side); click('.btn-master-edit'); await sleep(500); });
  add('detail-edit-button-7', { doc: 'credit-application', mode: 'detail', roots: ['.swal-overlay'] }, async function (sleep, side) { trackNav(side); click('.btn-master-edit'); await sleep(500); });
  add('back-arrow', { mode: 'edit', roots: ['.swal-overlay'] }, async function (sleep) { await sleep(100); });
  // the credit application: checkboxes, selects of its own, the address drop-downs
  add('s7-checkbox', { doc: 'credit-application', mode: 'edit' }, async function (sleep) { click($$('.ui-chkbox-box')[0]); await sleep(300); });
  add('s7-checkbox-twice', { doc: 'credit-application', mode: 'edit' }, async function (sleep) { click($$('.ui-chkbox-box')[0]); await sleep(150); click($$('.ui-chkbox-box')[0]); await sleep(300); });
  add('s7-checkbox-add', { doc: 'credit-application', mode: 'add' }, async function (sleep) { click($$('.ui-chkbox-box')[1]); await sleep(300); });
  add('s7-gender-open', { doc: 'credit-application', mode: 'add' }, async function () { await openSel(selWith('หญิง')); });
  add('s7-gender-choose', { doc: 'credit-application', mode: 'add' }, async function () { await chooseOpt(selWith('หญิง'), 'หญิง'); });
  add('s7-province-list', { doc: 'credit-application', mode: 'add' }, async function (sleep) { var s = $$('select.sd7-geo-sel')[0]; await waitFor(function () { return s && s.options.length > 3; }, 4000); await sleep(300); });
  add('s7-province-choose', { doc: 'credit-application', mode: 'add' }, async function (sleep) { var s = $$('select.sd7-geo-sel')[0]; await waitFor(function () { return s && s.options.length > 3; }, 4000); pick(s, 'กรุงเทพมหานคร'); await sleep(900); });
  add('s7-district-choose', { doc: 'credit-application', mode: 'add' }, async function (sleep) { var g = $$('select.sd7-geo-sel'); await waitFor(function () { return g[0] && g[0].options.length > 3; }, 4000); pick(g[0], 'กรุงเทพมหานคร'); await sleep(700); pick(g[1], 'เขตบางรัก'); await sleep(900); });
  add('s7-subdistrict-zip', { doc: 'credit-application', mode: 'add' }, async function (sleep) { var g = $$('select.sd7-geo-sel'); await waitFor(function () { return g[0] && g[0].options.length > 3; }, 4000); pick(g[0], 'กรุงเทพมหานคร'); await sleep(700); pick(g[1], 'เขตบางรัก'); await sleep(700); pick(g[2], 'สีลม'); await sleep(700); });
  add('s7-edit-legacy-address', { doc: 'credit-application', mode: 'edit' }, async function (sleep) { await sleep(1500); });
  add('s7-edit-legacy-address-dark', { doc: 'credit-application', mode: 'edit', theme: 'dark' }, async function (sleep) { await sleep(1500); });

  /* ================================================================ server round trips (PrimeFaces.ab → the replica's JSF lifecycle) ================================================================ */
  // the customer of the document is picked: onCustomerSelected fills the receive date (+ the receiver) and the parts named by `update` are drawn again
  add('customer-pick', { mode: 'add' }, async function (sleep) { await pickCustomer(sleep, 2); });
  add('customer-pick-dark', { mode: 'add', theme: 'dark' }, async function (sleep) { await pickCustomer(sleep, 3); });
  add('customer-pick-en', { mode: 'add', lang: 'en' }, async function (sleep) { await pickCustomer(sleep, 1); });
  add('customer-pick-7', { doc: 'credit-application', mode: 'add' }, async function (sleep) { await pickCustomer(sleep, 2); });
  // the lazy customers (sd_customer_lazy.js → the remote command sdProsLoad → loadProspectPageAjax → prosJson): a search in the panel's box, then the list scrolled to its end
  add('customer-search', { mode: 'add' }, async function (sleep) {
    await openSel(0);
    await typeFilter($('[id="' + selEl(0).id + '_panel"] .ui-selectonemenu-filter'), 'สุ');
    await sleep(2600);
  });
  add('customer-search-none', { mode: 'add' }, async function (sleep) {
    await openSel(0);
    await typeFilter($('[id="' + selEl(0).id + '_panel"] .ui-selectonemenu-filter'), 'zzzz');
    await sleep(2600);
  });
  add('customer-search-then-pick', { mode: 'add' }, async function (sleep) {
    await openSel(0);
    await typeFilter($('[id="' + selEl(0).id + '_panel"] .ui-selectonemenu-filter'), 'สุ');
    await sleep(2600);
    var li = $$('[id="' + selEl(0).id + '_panel"] .ui-selectonemenu-item')[1];
    if (!li) throw new Error('no result to pick');
    li.click();
    await sleep(1100);
  });
  add('customer-scroll-more', { mode: 'add' }, async function (sleep) {
    await openSel(0);
    var w = $('[id="' + selEl(0).id + '_panel"] .ui-selectonemenu-items-wrapper');
    w.scrollTop = w.scrollHeight;
    w.dispatchEvent(new Event('scroll'));
    await sleep(1800);
  });

  // a file of the document is deleted: the trash icon asks (SweetAlert), the hidden command link posts removeFile(file) and sdDocList is drawn again
  add('file-delete-ask', { mode: 'edit' }, async function (sleep) { await tab(2); click('.sd-doc-del'); await sleep(600); });
  add('file-delete-ask-dark', { mode: 'edit', theme: 'dark' }, async function (sleep) { await tab(2); click('.sd-doc-del'); await sleep(600); });
  add('file-delete-cancel', { mode: 'edit' }, async function (sleep) { await tab(2); click('.sd-doc-del'); await sleep(600); click('.swal-button--cancel'); await sleep(600); });
  add('file-delete', { mode: 'edit' }, async function (sleep) { await tab(2); click('.sd-doc-del'); await sleep(600); click('.swal-button--confirm'); await sleep(1500); });
  add('file-delete-dark', { mode: 'edit', theme: 'dark' }, async function (sleep) { await tab(2); click('.sd-doc-del'); await sleep(600); click('.swal-button--confirm'); await sleep(1500); });
  // (the credit application has one tab and no documents)
  // (the mock gives document 8 an attachment in three of the families only)
  ['legal-credit-request', 'preliminary-credit-approval'].forEach((d) => {
    add(`file-delete-${short(d)}`, { doc: d, mode: 'edit' }, async function (sleep) { await tab(2); click('.sd-doc-del'); await sleep(600); click('.swal-button--confirm'); await sleep(1500); });
  });

  // files are chosen in the upload bar (p:fileUpload advanced, auto, multiple, sequential): each one is posted and sdDocList is drawn again, the bar says "uploading" meanwhile
  add('upload-one', { mode: 'edit' }, async function () { await tab(2); await uploadFiles([{ name: 'report.pdf' }]); });
  add('upload-one-dark', { mode: 'edit', theme: 'dark' }, async function () { await tab(2); await uploadFiles([{ name: 'report.pdf' }]); });
  add('upload-one-en', { mode: 'edit', lang: 'en' }, async function () { await tab(2); await uploadFiles([{ name: 'report.pdf' }]); });
  add('upload-three', { mode: 'edit' }, async function () { await tab(2); await uploadFiles([{ name: 'a.pdf' }, { name: 'b.txt', type: 'text/plain' }, { name: 'c.docx', type: 'application/msword' }], 3000); });
  add('upload-image', { mode: 'edit' }, async function () { await tab(2); await uploadFiles([{ name: 'photo.png', type: 'image/png' }]); });
  add('upload-in-add-mode', { mode: 'add' }, async function () { await tab(2); await uploadFiles([{ name: 'draft.pdf' }]); });
  add('upload-wrong-type', { mode: 'edit' }, async function () { await tab(2); await uploadFiles([{ name: 'virus.exe', type: 'application/x-msdownload' }], 1500); });
  add('upload-wrong-type-dark', { mode: 'edit', theme: 'dark' }, async function () { await tab(2); await uploadFiles([{ name: 'virus.exe', type: 'application/x-msdownload' }], 1500); });
  add('upload-too-big', { mode: 'edit' }, async function () { await tab(2); await uploadFiles([{ name: 'huge.pdf', size: 15 * 1024 * 1024 }], 1500); });
  add('upload-mixed', { mode: 'edit' }, async function () { await tab(2); await uploadFiles([{ name: 'ok.pdf' }, { name: 'bad.exe', type: 'application/x-msdownload' }], 2500); });
  add('upload-then-delete', { mode: 'edit' }, async function (sleep) { await tab(2); await uploadFiles([{ name: 'tmp.pdf' }]); click($$('.sd-doc-del')[$$('.sd-doc-del').length - 1]); await sleep(600); click('.swal-button--confirm'); await sleep(1500); });

  // the name of a file opens it (window.open), the arrow downloads it (a fetch of the file, then a link with `download`): a file of the backend, and one only this browser has
  add('file-view-backend', { mode: 'edit' }, async function (sleep) { stubFileActions(); await tab(2); click($$('.sd-doc-name')[0]); await sleep(500); });
  add('file-view-uploaded', { mode: 'edit' }, async function (sleep) { stubFileActions(); await tab(2); await uploadFiles([{ name: 'mine.pdf' }]); click($$('.sd-doc-name')[$$('.sd-doc-name').length - 1]); await sleep(500); });
  add('file-download-uploaded', { mode: 'edit' }, async function (sleep) { stubFileActions(); await tab(2); await uploadFiles([{ name: 'mine.pdf' }]); click($$('.sd-doc-act.pi-download')[$$('.sd-doc-act.pi-download').length - 1]); await sleep(1200); });
  add('file-download-backend', { mode: 'edit' }, async function (sleep) { stubFileActions(); await tab(2); click($$('.sd-doc-act.pi-download')[0]); await sleep(1500); });
  add('file-view-add-mode', { mode: 'add' }, async function (sleep) { stubFileActions(); await tab(2); await uploadFiles([{ name: 'draft.pdf' }]); click($$('.sd-doc-name')[0]); await sleep(500); });

  /* ================================================================ the save (confirm → the form is posted → the list, or the same page again) ================================================================ */
  // `reloads`: the Java page really navigates (a POST, a redirect / the answer drawn again) — the scenario carries on in the new document; the Angular page moves with its router
  var SAVE = { reloads: true, settle: 700 };
  // a new document: a customer is picked (the check passes), the form is posted, the page moves to the list (the new document first, a growl says it is saved)
  add('save-new', Object.assign({ mode: 'add' }, SAVE), async function (sleep) { await pickCustomer(sleep, 2); click($$('.sd-save-btn')[0]); await sleep(300); click('.sd-confirm-ok'); await waitFor(function () { return document.querySelector('#sdTableBody tr'); }, 8000); await sleep(300); });
  add('save-new-dark', Object.assign({ mode: 'add', theme: 'dark' }, SAVE), async function (sleep) { await pickCustomer(sleep, 2); click($$('.sd-save-btn')[0]); await sleep(300); click('.sd-confirm-ok'); await waitFor(function () { return document.querySelector('#sdTableBody tr'); }, 8000); await sleep(300); });
  add('save-new-en', Object.assign({ mode: 'add', lang: 'en' }, SAVE), async function (sleep) { await pickCustomer(sleep, 2); click($$('.sd-save-btn')[0]); await sleep(300); click('.sd-confirm-ok'); await waitFor(function () { return document.querySelector('#sdTableBody tr'); }, 8000); await sleep(300); });
  add('save-new-7', Object.assign({ doc: 'credit-application', mode: 'add' }, SAVE), async function (sleep) { await pickCustomer(sleep, 2); click($$('.sd-save-btn')[0]); await sleep(300); click('.sd-confirm-ok'); await waitFor(function () { return document.querySelector('#sdTableBody tr'); }, 8000); await sleep(300); });
  add('save-edit', Object.assign({ mode: 'edit' }, SAVE), async function (sleep) { click($$('.sd-save-btn')[0]); await sleep(300); click('.sd-confirm-ok'); await waitFor(function () { return document.querySelector('#sdTableBody tr'); }, 8000); await sleep(300); });
  add('save-edit-7', Object.assign({ doc: 'credit-application', mode: 'edit' }, SAVE), async function (sleep) { click($$('.sd-save-btn')[0]); await sleep(300); click('.sd-confirm-ok'); await waitFor(function () { return document.querySelector('#sdTableBody tr'); }, 8000); await sleep(300); });
  add('save-edit-from-docs-tab', Object.assign({ mode: 'edit' }, SAVE), async function (sleep) { await tab(2); click($$('.sd-save-btn')[1]); await sleep(300); click('.sd-confirm-ok'); await waitFor(function () { return document.querySelector('#sdTableBody tr'); }, 8000); await sleep(300); });
  // the checks before the save: no customer, no receive date → a warning, the page is drawn again (its growl, when it has one)
  add('save-no-customer', Object.assign({ mode: 'add' }, SAVE), async function (sleep) { click($$('.sd-save-btn')[0]); await sleep(300); click('.sd-confirm-ok'); await waitFor(function () { return document.querySelector('#sdTableBody tr'); }, 8000); await sleep(300); });
  add('save-no-customer-7', Object.assign({ doc: 'credit-application', mode: 'add' }, SAVE), async function (sleep) { click($$('.sd-save-btn')[0]); await sleep(300); click('.sd-confirm-ok'); await waitFor(function () { return document.querySelector('#sdTableBody tr'); }, 8000); await sleep(300); });
  add('save-no-customer-7-dark', Object.assign({ doc: 'credit-application', mode: 'add', theme: 'dark' }, SAVE), async function (sleep) { click($$('.sd-save-btn')[0]); await sleep(300); click('.sd-confirm-ok'); await waitFor(function () { return document.querySelector('#sdTableBody tr'); }, 8000); await sleep(300); });
  // the backend refuses (the mock reads the remark): the page is drawn again with the typed values kept
  add('save-backend-error', Object.assign({ mode: 'edit' }, SAVE), async function (sleep) { await typeField($$('textarea')[0], 'X-FAIL'); click($$('.sd-save-btn')[0]); await sleep(300); click('.sd-confirm-ok'); await sleep(1500); });
  add('save-backend-error-7', Object.assign({ doc: 'credit-application', mode: 'edit' }, SAVE), async function (sleep) { await typeField($$('textarea')[0], 'X-FAIL'); click($$('.sd-save-btn')[0]); await sleep(300); click('.sd-confirm-ok'); await sleep(1500); });
}
