// Scenarios: the attachments of the quotation, the booking and the delivery note (SalesDocAttach — the file goes to the customer that was
// picked in the document; every check of the strict mode, the progress, the summary, the delete).
export default function (add, S) {
  const ITEMS = ['qt', 'bk', 'ob'];
  const swalUp = `await waitFor(function () { return $('.swal-overlay--show-modal'); }, 6000); await sleep(300);`;
  const pdf = `{ name: 'ใบเสนอ.pdf' }`;
  ITEMS.forEach((t) => {
    add(`${t}-attach-empty`, { type: t }, S(t, `await sleep(100);`));
    add(`${t}-attach-empty-390`, { type: t, w: 390, h: 844 }, S(t, `await sleep(100);`));
    add(`${t}-attach-no-customer`, { type: t }, S(t, `await attachFiles([${pdf}]); ${swalUp}`));
    add(`${t}-attach-no-customer-en`, { type: t, lang: 'en' }, S(t, `await attachFiles([${pdf}]); ${swalUp}`));
    add(`${t}-attach-no-customer-dark`, { type: t, theme: 'dark' }, S(t, `await attachFiles([${pdf}]); ${swalUp}`));
    add(`${t}-attach-bad-type`, { type: t }, S(t, `await pickCust(0); await attachFiles([{ name: 'virus.exe' }]); ${swalUp}`));
    add(`${t}-attach-bad-type-mixed`, { type: t }, S(t, `await pickCust(0); await attachFiles([{ name: 'a.pdf' }, { name: 'b.exe' }, { name: 'c.png' }]); ${swalUp}`));
    add(`${t}-attach-too-big`, { type: t }, S(t, `await pickCust(0); await attachFiles([{ name: 'big.pdf', body: new Uint8Array(10 * 1024 * 1024 + 1) }]); ${swalUp}`));
    add(`${t}-attach-too-many`, { type: t }, S(t, `await pickCust(0); var fs = []; for (var i = 0; i < 11; i++) fs.push({ name: 'f' + i + '.pdf' }); await attachFiles(fs); ${swalUp}`));
    add(`${t}-attach-ok`, { type: t }, S(t, `await pickCust(0); await attachFiles([${pdf}]); await waitFor(function () { return $id('AttachBody').rows.length > 0; }, 6000); await sleep(300);`));
    add(`${t}-attach-ok-summary`, { type: t }, S(t, `await pickCust(0); await attachFiles([${pdf}]); ${swalUp}`));
    add(`${t}-attach-ok-summary-dark`, { type: t, theme: 'dark' }, S(t, `await pickCust(0); await attachFiles([${pdf}]); ${swalUp}`));
    add(`${t}-attach-ok-summary-en`, { type: t, lang: 'en' }, S(t, `await pickCust(0); await attachFiles([${pdf}]); ${swalUp}`));
    add(`${t}-attach-ok-three`, { type: t }, S(t, `await pickCust(0); await attachFiles([{ name: 'a.pdf' }, { name: 'b.png', type: 'image/png' }, { name: 'c.docx', type: 'application/msword' }]); await waitFor(function () { return $id('AttachBody').rows.length > 2; }, 8000); await sleep(400);`));
    add(`${t}-attach-ok-390`, { type: t, w: 390, h: 844 }, S(t, `await pickCust(0); await attachFiles([${pdf}]); await waitFor(function () { return $id('AttachBody').rows.length > 0; }, 6000); await sleep(300);`));
    add(`${t}-attach-uploading`, { type: t, mock: 'slow-attach' }, S(t, `await pickCust(0); await attachFiles([${pdf}]); await sleep(900);`));
    add(`${t}-attach-detail-valid`, { type: t }, S(t, `await pickCust(0); await attachFiles([${pdf}]); await waitFor(function () { return $id('AttachBody').rows.length > 0; }, 6000); await sleep(2600); typ($id('AttachBody').rows[0].querySelector('input'), 'รายละเอียดไฟล์'); await sleep(250);`));
    add(`${t}-attach-detail-forbidden`, { type: t }, S(t, `await pickCust(0); await attachFiles([${pdf}]); await waitFor(function () { return $id('AttachBody').rows.length > 0; }, 6000); await sleep(2600); typ($id('AttachBody').rows[0].querySelector('input'), 'a<b>'); await sleep(250);`));
    add(`${t}-attach-detail-forbidden-dark`, { type: t, theme: 'dark' }, S(t, `await pickCust(0); await attachFiles([${pdf}]); await waitFor(function () { return $id('AttachBody').rows.length > 0; }, 6000); await sleep(2600); typ($id('AttachBody').rows[0].querySelector('input'), 'a<b>'); await sleep(250);`));
    add(`${t}-attach-detail-long`, { type: t }, S(t, `await pickCust(0); await attachFiles([${pdf}]); await waitFor(function () { return $id('AttachBody').rows.length > 0; }, 6000); await sleep(2600); var d = $id('AttachBody').rows[0].querySelector('input'); typ(d, new Array(300).join('x')); await sleep(250);`));
    // the delete: a confirmation (SweetAlert), the list of the customer, then the DELETE
    const uploaded = `await pickCust(0); await attachFiles([${pdf}]); await waitFor(function () { return $id('AttachBody').rows.length > 0; }, 6000); await sleep(2700);`;
    add(`${t}-attach-delete-confirm`, { type: t }, S(t, `${uploaded} $id('AttachBody').querySelector('.qt-del').click(); ${swalUp}`));
    add(`${t}-attach-delete-confirm-dark`, { type: t, theme: 'dark' }, S(t, `${uploaded} $id('AttachBody').querySelector('.qt-del').click(); ${swalUp}`));
    add(`${t}-attach-delete-confirm-en`, { type: t, lang: 'en' }, S(t, `${uploaded} $id('AttachBody').querySelector('.qt-del').click(); ${swalUp}`));
    add(`${t}-attach-delete-yes`, { type: t }, S(t, `${uploaded} $id('AttachBody').querySelector('.qt-del').click(); ${swalUp} document.querySelector('.swal-button--danger, .swal-button--confirm').click(); await sleep(900);`));
    add(`${t}-attach-delete-no`, { type: t }, S(t, `${uploaded} $id('AttachBody').querySelector('.qt-del').click(); ${swalUp} document.querySelector('.swal-button--cancel').click(); await sleep(500);`));
    add(`${t}-attach-delete-list-empty`, { type: t, mock: 'attach-list-empty' }, S(t, `${uploaded} $id('AttachBody').querySelector('.qt-del').click(); ${swalUp} document.querySelector('.swal-button--danger, .swal-button--confirm').click(); await waitFor(function () { return document.querySelectorAll('.swal-overlay--show-modal .swal-title').length && /./.test(document.querySelector('.swal-title').textContent); }, 4000); await sleep(600);`));
    add(`${t}-attach-delete-list-error`, { type: t, mock: 'attach-list-error' }, S(t, `${uploaded} $id('AttachBody').querySelector('.qt-del').click(); ${swalUp} document.querySelector('.swal-button--danger, .swal-button--confirm').click(); await sleep(1200);`));
    add(`${t}-attach-delete-fail`, { type: t, mock: 'attach-delete-fail' }, S(t, `${uploaded} $id('AttachBody').querySelector('.qt-del').click(); ${swalUp} document.querySelector('.swal-button--danger, .swal-button--confirm').click(); await sleep(1200);`));
    // the answers of the upload
    add(`${t}-attach-fail`, { type: t, mock: 'attach-fail' }, S(t, `await pickCust(0); await attachFiles([${pdf}]); ${swalUp}`));
    add(`${t}-attach-fail-en`, { type: t, mock: 'attach-fail', lang: 'en' }, S(t, `await pickCust(0); await attachFiles([${pdf}]); ${swalUp}`));
    add(`${t}-attach-unverified`, { type: t, mock: 'attach-unverified' }, S(t, `await pickCust(0); await attachFiles([${pdf}]); ${swalUp}`));
    add(`${t}-attach-down`, { type: t, mock: 'attach-down' }, S(t, `await pickCust(0); await attachFiles([${pdf}]); ${swalUp}`));
    add(`${t}-attach-bad-request`, { type: t, mock: 'attach-bad' }, S(t, `await pickCust(0); await attachFiles([${pdf}]); ${swalUp}`));
    add(`${t}-attach-partial`, { type: t, mock: 'attach-fail' }, S(t, `await pickCust(0); await attachFiles([{ name: 'a.pdf' }, { name: 'b.png' }]); ${swalUp}`));
    add(`${t}-attach-new-customer`, { type: t }, S(t, `await createCust(); await attachFiles([${pdf}]); ${swalUp}`)); // a customer made in the pop-up has no id: nothing to attach to
    add(`${t}-attach-pick-button`, { type: t }, S(t, `var b = $id('AttachAdd'); b.click(); await sleep(200);`));
  });
}
