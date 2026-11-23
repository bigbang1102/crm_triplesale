// Comparison setup of the supporting-document list (/crm/supporting-docs/:type) — see tools/compare/README.md for the interface of a page.
//
// Java side: the REAL page (sales_document.xhtml … sales_document_7.xhtml: its head, its markup rendered by tools/lib/jsf.mjs the way the server would, its
// inline script, crm_list.js / sales_doc_list.js / drag_scroll.js), the real PrimeFaces stylesheet and scripts, inside the shell replica — one file per family
// and language. Its data is the SAME mock the Angular page runs (supporting-doc.mock.ts); the scroll asks /triplesale/board/sales-document-list, answered by the
// SAME service the Angular host uses (supporting-doc.service.ts). Scenario options: doc = the family (slug).
import { buildList, handle, newState, normalize, slugs } from '../../lib/supporting-doc-replica.mjs';

const name = (doc, lang) => `sdl-${doc}${lang === 'en' ? '-en' : ''}`;
const acts = (doc) => slugs.indexOf(doc) + 71;

export default {
  name: 'supporting-doc-list',
  // the page, the growl (a container PrimeFaces draws into <body>), the SweetAlert of the page
  roots: ['.ct-root', '.ct-filter-overlay', '.ui-growl', '.swal-overlay'],
  ready: `document.querySelector('#sdTableBody tr')`,
  javaPath: (lang, opts) => {
    const doc = opts.doc ?? 'letter-of-intent';
    return `/triplesale/pages/${name(doc, lang)}.xhtml?pid=1&page_id=7&act=7&acts=${acts(doc)}&sub_id=${acts(doc) - 70}&action_type=list`;
  },
  ngPath: (_lang, opts) => `/crm/supporting-docs/${opts.doc ?? 'letter-of-intent'}`,
  latencyMs: 0,
  // helpers of this page's scenarios
  pre: `
// the dump compares the state of the controls (value / checked / selected as the user sees it), not the attributes the markup was written with
window.__cmpState = true;
var fillFilter = function (i, v) { var el = $$('#sdFilterOverlay .ct-filter-row input')[i]; if (!el) throw new Error('no filter field ' + i); el.value = v; el.dispatchEvent(new Event('input', { bubbles: true })); };
// (the filter dialog of sales_document*.xhtml has no button that opens it — crm_list.js looks for #ctFilterBtn, which only contracts.xhtml has: the dialog is shown
// here by hand, to prove that its buttons — applyFilters / clearFilters / the pager — do the same on both sides)
var openFilter = async function () { document.getElementById('sdFilterOverlay').classList.add('show'); await sleep(250); };
// a filter that matches 53 rows (three pages of the pager) / a button of the pager (0 first, 1 previous, 2 next, 3 last)
var filterMany = async function () { await openFilter(); fillFilter(0, 'CA-00'); click('#sdFilterOverlay .ct-btn-filter'); await sleep(1500); };
var pgClick = function (i) { var b = $$('.sd-pg-btn')[i]; if (!b) throw new Error('no pager button ' + i); click(b); };
// location.href = … (Java) / the router (Angular): the Navigation API sees both; the Java page is kept where it is (a cancelled navigation)
var navCalls = [];
var trackNav = function (side) {
  navCalls = [];
  if (!window.navigation) throw new Error('no Navigation API');
  window.navigation.addEventListener('navigate', function (e) { var u = new URL(e.destination.url); navCalls.push(u.pathname + u.search); if (side === 'java') e.preventDefault(); });
  window.__extra = async function () { return ['NAV ' + navCalls.join(' ; ')]; };
};
var rowCount = function () { return $$('#sdTableBody tr[data-name]').length; };
var scrollEnd = async function () { var w = $('.ct-table-wrap'); w.scrollTop = w.scrollHeight; w.dispatchEvent(new Event('scroll')); await sleep(900); };
`,
  normalize,
  async build(ctx) {
    const out = {};
    for (const lang of ['th', 'en']) {
      for (const doc of slugs) {
        const n = name(doc, lang);
        out[`/triplesale/pages/${n}.xhtml`] = (await buildList(ctx, { t: doc, lang, name: n })).file;
      }
    }
    return out;
  },
  newState,
  handle,
};
