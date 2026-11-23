// Scenarios of the prospect form: the documents tab (upload · delete · download) and the picture (handleUpload). Run INSIDE the page under test — see scenarios.mjs.
export default function (add) {
  const DOCS = (mode, id, extra = {}) => ({ mode, id, ...extra });

  /* ================================================================ the documents tab ================================================================ */
  add('docs-upload-ok', DOCS('edit', 1), async function (sleep) { await tab(3); setFiles($('#ctMdFileInput'), [fileOf('ทดสอบ.pdf')]); await waitFor(function () { return $$('.ct-doc-row2').length === 4; }, 6000); await sleep(2800); });
  add('docs-upload-ok-progress', DOCS('edit', 1), async function (sleep) { await tab(3); setFiles($('#ctMdFileInput'), [fileOf('ทดสอบ.pdf')]); await sleep(150); });
  add('docs-upload-multi', DOCS('edit', 1), async function (sleep) { await tab(3); setFiles($('#ctMdFileInput'), [fileOf('a.pdf'), fileOf('b.png', 'image/png'), fileOf('c.csv', 'text/csv')]); await waitFor(function () { return $$('.ct-doc-row2').length === 6; }, 8000); await sleep(2800); });
  add('docs-upload-bad-ext', DOCS('edit', 1), async function (sleep) { await tab(3); setFiles($('#ctMdFileInput'), [fileOf('virus.exe', 'application/x-msdownload')]); await sleep(900); });
  add('docs-upload-bad-ext-dark', DOCS('edit', 1, { theme: 'dark' }), async function (sleep) { await tab(3); setFiles($('#ctMdFileInput'), [fileOf('virus.exe', 'application/x-msdownload')]); await sleep(900); });
  add('docs-upload-bad-ext-en', DOCS('edit', 1, { lang: 'en' }), async function (sleep) { await tab(3); setFiles($('#ctMdFileInput'), [fileOf('virus.exe', 'application/x-msdownload')]); await sleep(900); });
  add('docs-upload-too-large', DOCS('edit', 1), async function (sleep) { await tab(3); setFiles($('#ctMdFileInput'), [fileOf('big.pdf', 'application/pdf', 15100000)]); await sleep(2500); });
  add('docs-upload-fail', DOCS('edit', 1), async function (sleep) { await tab(3); setFiles($('#ctMdFileInput'), [fileOf('FAIL-doc.pdf')]); await sleep(3500); });
  add('docs-upload-mixed', DOCS('edit', 1), async function (sleep) { await tab(3); setFiles($('#ctMdFileInput'), [fileOf('ok.pdf'), fileOf('FAIL-doc.pdf')]); await sleep(3800); });
  add('docs-upload-add-mode', { mode: 'add' }, async function (sleep) { await tab(3); setFiles($('#ctMdFileInput'), [fileOf('ทดสอบ.pdf')]); await sleep(900); });
  add('docs-delete-confirm-open', DOCS('edit', 1), async function (sleep) { await tab(3); click($('.ct-doc-row2 .pi-trash')); await sleep(700); });
  add('docs-delete-confirm-open-dark', DOCS('edit', 1, { theme: 'dark' }), async function (sleep) { await tab(3); click($('.ct-doc-row2 .pi-trash')); await sleep(700); });
  add('docs-delete-confirm-open-en', DOCS('edit', 1, { lang: 'en' }), async function (sleep) { await tab(3); click($('.ct-doc-row2 .pi-trash')); await sleep(700); });
  add('docs-delete-yes', DOCS('edit', 1), async function (sleep) { await tab(3); click($('.ct-doc-row2 .pi-trash')); await swalBtn('.swal-button--danger'); await sleep(1500); });
  add('docs-delete-no', DOCS('edit', 1), async function (sleep) { await tab(3); click($('.ct-doc-row2 .pi-trash')); await swalBtn('.swal-button--cancel'); await sleep(500); });
  add('docs-delete-all', DOCS('edit', 1), async function (sleep) { await tab(3); for (var k = 0; k < 3; k++) { click($('.ct-doc-row2 .pi-trash')); await swalBtn('.swal-button--danger'); await sleep(1200); } });
  add('docs-download', DOCS('view', 1), async function (sleep) { stubFileActions(); await tab(3); click($('.ct-doc-dl-btn')); await sleep(1500); });
  add('docs-download-name-link', DOCS('view', 1), async function (sleep) { stubFileActions(); await tab(3); click($('.ct-doc-file-link')); await sleep(1500); });
  add('docs-download-missing', DOCS('view', 1), async function (sleep) { stubFileActions(); await tab(3); var a = $('.ct-doc-dl-btn'); a.setAttribute('data-url', 'prospect/missing/x.pdf'); click(a); await sleep(1500); });
  add('docs-empty', DOCS('view', 26), async function () { await tab(3); });
  add('docs-view-no-trash', DOCS('view', 1), async function () { await tab(3); });

  /* ================================================================ the picture (handleUpload) ================================================================ */
  const PIC = 'input[type=file][accept*="image"]';
  add('avatar-ok-add', { mode: 'add' }, async function (sleep) { setFiles($('input[type=file][accept*="image"]'), [await imageFile(600, 600)]); await sleep(1500); });
  add('avatar-ok-edit', DOCS('edit', 2), async function (sleep) { setFiles($('input[type=file][accept*="image"]'), [await imageFile(700, 640)]); await sleep(1800); });
  add('avatar-ok-edit-png', DOCS('edit', 2), async function (sleep) { setFiles($('input[type=file][accept*="image"]'), [await imageFile(600, 600, 'image/png', 'a.png')]); await sleep(1800); });
  add('avatar-big-dimensions', DOCS('edit', 2), async function (sleep) { setFiles($('input[type=file][accept*="image"]'), [await imageFile(2000, 1500)]); await sleep(2000); });
  add('avatar-bad-type', DOCS('edit', 2), async function (sleep) { setFiles($('input[type=file][accept*="image"]'), [fileOf('a.gif', 'image/gif', 5000)]); await sleep(900); });
  add('avatar-too-big', DOCS('edit', 2), async function (sleep) { setFiles($('input[type=file][accept*="image"]'), [fileOf('a.jpg', 'image/jpeg', 2200000)]); await sleep(900); });
  add('avatar-small', DOCS('edit', 2), async function (sleep) { setFiles($('input[type=file][accept*="image"]'), [await imageFile(400, 400)]); await sleep(1200); });
  add('avatar-bad-type-dark', DOCS('edit', 2, { theme: 'dark' }), async function (sleep) { setFiles($('input[type=file][accept*="image"]'), [fileOf('a.gif', 'image/gif', 5000)]); await sleep(900); });
  add('avatar-bad-type-en', DOCS('edit', 2, { lang: 'en' }), async function (sleep) { setFiles($('input[type=file][accept*="image"]'), [fileOf('a.gif', 'image/gif', 5000)]); await sleep(900); });
  void PIC;
}
