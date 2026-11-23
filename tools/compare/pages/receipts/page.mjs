// Comparison setup of the receipt list (/sales/receipts) — see tools/compare/README.md for the interface of a page.
//
// Java side: the REAL page (the head of sales_doc_rv_list.xhtml — drag_scroll, sd2_list.css —, its markup, the tab strip component and the
// page script, EL resolved the way the server would) inside the shell replica. Its BFF (/triplesale/rvapi, /rvreport, /rvreceipt,
// /board/prospect-list) is the SAME mock the Angular page runs (receipts.mock.ts) — see replica.mjs, which the form's comparison shares.
import { PRE_COMMON, buildReplica, handle, newState, normalize, upstream } from './replica.mjs';

export default {
  name: 'receipts',
  // .sd2-root = the page; the boxes the script moves to <body>; the popovers; the SweetAlert toast
  roots: ['.sd2-root', '#sd2DetailOverlay', '#sd2Overlay', '#sd2Pop', '#sd2Items', '.swal-overlay'],
  // the rows are drawn (and the lead numbers merged, 150 ms later) once the list answered
  ready: `document.querySelector('#sd2Body tr[data-id]')`,
  javaPath: (lang, opts) => `/triplesale/pages/${lang === 'en' ? 'sales_doc_rv_list-en' : 'sales_doc_rv_list'}.xhtml${opts.mock ? '?mock=' + opts.mock : ''}`,
  ngPath: (_lang, opts) => `/sales/receipts${opts.mock ? '?mock=' + opts.mock : ''}`,
  latencyMs: 150,
  // helpers of this page's scenarios
  pre:
    PRE_COMMON +
    `
// "<target> <type> <bytes> <checksum>" of every window.open, written into the page so that it is part of the dump
var noteOpened = async function () {
  var out = [];
  for (var i = 0; i < openCalls.length; i++) out.push(openCalls[i][1] + ' ' + (await describeFile(openCalls[i][0])));
  $('.sd2-root').setAttribute('data-opened', out.join(' ;; '));
};
// The receipt image the page draws on a canvas: its text uses the family "Noto Sans Thai", which the Java app never declares (no @font-face —
// topbar.css says so itself), so the Java replica draws it with a system font and the Angular app, which ships that font, with the real one.
// The bytes of the PNG therefore differ by font; what the page decides — that it opens an image tab, and the size of the sheet — is compared.
var noteOpenedImage = async function () {
  var out = [];
  for (var i = 0; i < openCalls.length; i++) {
    var b = await (await fetch(openCalls[i][0])).blob(), bmp = await createImageBitmap(b);
    out.push(openCalls[i][1] + ' ' + b.type + ' ' + bmp.width + 'x' + bmp.height);
  }
  $('.sd2-root').setAttribute('data-opened', out.join(' ;; '));
};
// the approve dialog
var openApprove = async function (ms) { click($('#sd2Body .sd2-approve-btn:not(.approved)')); await sleep(ms || 300); };
`,
  normalize,
  async build(ctx) {
    return buildReplica(ctx, { file: 'pages/sales_doc_rv_list.xhtml', name: 'sales_doc_rv_list' });
  },
  newState,
  handle,
  // --live: the fake REST service (triplesale-service) the Angular side's live backend talks to — see replica.mjs
  upstream,
};
