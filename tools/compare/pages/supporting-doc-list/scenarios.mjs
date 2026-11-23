// Scenarios of the supporting-document list comparison. Each function is run INSIDE the page under test (Java replica / Angular app) with
// (sleep, side, win) in scope, after the prelude of lib/scenario-pre.mjs and the page prelude (`pre` in page.mjs).
// add(name, opts, fn):  opts = { w, h, theme, lang, settle, wait, roots, ready, doc }   doc = the family (slug), default letter-of-intent
export default function (add) {
  const FAMILIES = ['letter-of-intent', 'legal-credit-request', 'service-contract', 'loan-agreement', 'preliminary-credit-approval', 'property-project-contract', 'credit-application'];
  const SIZES = [[390, 844], [768, 1024], [1024, 768], [1920, 1080]];
  // a click that moves the page: the Angular app really goes to the route (its page is gone), the Java replica is held back (trackNav): only the address both went to is compared
  const NAV = ['.swal-overlay'];
  const short = (d) => d.split('-')[0] + d.split('-').length;

  /* ---- first paint: every family, both themes, both languages, the viewports, the A A A buttons ---- */
  FAMILIES.forEach((d) => {
    const n = short(d);
    add(`overview-${n}`, { doc: d }, async function () {});
    add(`overview-${n}-dark`, { doc: d, theme: 'dark' }, async function () {});
    add(`en-overview-${n}`, { doc: d, lang: 'en' }, async function () {});
    add(`en-overview-${n}-dark`, { doc: d, lang: 'en', theme: 'dark' }, async function () {});
    SIZES.forEach((s) => add(`overview-${n}-${s[0]}`, { doc: d, w: s[0], h: s[1] }, async function () {}));
    add(`fs-plus-${n}`, { doc: d }, 'fontAdj("2px"); await sleep(600);');
    add(`fs-minus-${n}`, { doc: d }, 'fontAdj("-2px"); await sleep(600);');
  });
  add('overview-dark-390', { theme: 'dark', w: 390, h: 844 }, async function () {});
  add('fs-plus-dark-768', { theme: 'dark', w: 768, h: 1024 }, 'fontAdj("2px"); await sleep(600);');
  [[1600, 900], [1279, 800], [1100, 800], [900, 800], [700, 900], [600, 900], [480, 900], [360, 740]].forEach((s) => add(`width-${s[0]}`, { w: s[0], h: s[1] }, async function () {}));

  /* ---- infinite scroll: the first page is 20 rows; the next pages are asked for when the table is scrolled to its end ---- */
  add('scroll-next-page', {}, async function (sleep) { await scrollEnd(); await waitFor(function () { return rowCount() > 20; }, 4000); await sleep(300); });
  add('scroll-all-pages', {}, async function (sleep) { for (var i = 0; i < 4; i++) await scrollEnd(); await waitFor(function () { return rowCount() === 53; }, 4000); await sleep(300); });
  add('scroll-exact-page', { doc: 'legal-credit-request' }, async function (sleep) { await scrollEnd(); await sleep(400); });
  add('scroll-short-family', { doc: 'service-contract' }, async function (sleep) { await scrollEnd(); await sleep(400); });
  add('scroll-next-page-dark', { theme: 'dark' }, async function (sleep) { await scrollEnd(); await waitFor(function () { return rowCount() > 20; }, 4000); await sleep(300); });
  add('scroll-then-search', {}, async function (sleep) { await scrollEnd(); click('#ldSearch .ld-search-ic'); typeIn('#ldSearchInput', 'CA-0004'); await sleep(400); });

  /* ---- an empty family ---- */
  add('empty-family', { doc: 'loan-agreement' }, async function () {});
  add('empty-family-dark', { doc: 'loan-agreement', theme: 'dark' }, async function () {});
  add('empty-family-en', { doc: 'loan-agreement', lang: 'en' }, async function () {});

  /* ---- the toolbar: sort menu, search pill ---- */
  const sortOpen = async function (sleep) { click('#ctSortBtn'); await sleep(300); };
  add('sort-menu', {}, sortOpen);
  add('sort-menu-dark', { theme: 'dark' }, sortOpen);
  add('sort-menu-390', { w: 390, h: 844 }, sortOpen);
  ['date_asc', 'name_asc', 'name_desc', 'date_desc'].forEach((m) => add(`sort-${m}`, {}, `click('#ctSortBtn'); click('.ct-sort-item[data-sort="${m}"]'); await sleep(400);`));
  add('sort-then-scroll', {}, async function (sleep) { click('#ctSortBtn'); click('.ct-sort-item[data-sort="name_asc"]'); await sleep(200); await scrollEnd(); });
  add('sort-menu-closes-outside', {}, async function (sleep) { click('#ctSortBtn'); await sleep(150); document.body.click(); await sleep(300); });
  const searchOpen = async function (sleep) { click('#ldSearch .ld-search-ic'); await sleep(300); };
  add('search-open', {}, searchOpen);
  add('search-open-dark', { theme: 'dark' }, searchOpen);
  add('search-open-390', { w: 390, h: 844 }, searchOpen);
  add('search-type-code', {}, async function (sleep) { click('#ldSearch .ld-search-ic'); typeIn('#ldSearchInput', 'CA-0001'); await sleep(400); });
  add('search-type-name', {}, async function (sleep) { click('#ldSearch .ld-search-ic'); typeIn('#ldSearchInput', 'ธนากร'); await sleep(400); });
  add('search-no-result', {}, async function (sleep) { click('#ldSearch .ld-search-ic'); typeIn('#ldSearchInput', 'zzzz'); await sleep(400); });
  add('search-no-result-dark', { theme: 'dark' }, async function (sleep) { click('#ldSearch .ld-search-ic'); typeIn('#ldSearchInput', 'zzzz'); await sleep(400); });
  add('search-enter', {}, async function (sleep) { click('#ldSearch .ld-search-ic'); var i = $('#ldSearchInput'); i.value = 'CA-0002'; i.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true })); await sleep(400); });
  add('search-go', {}, async function (sleep) { click('#ldSearch .ld-search-ic'); $('#ldSearchInput').value = 'CA-0003'; click('#ldSearchGo'); await sleep(400); });
  add('search-clear', {}, async function (sleep) { click('#ldSearch .ld-search-ic'); typeIn('#ldSearchInput', 'zzzz'); await sleep(200); click('#ldSearchClear'); await sleep(400); });
  add('search-en', { lang: 'en' }, async function (sleep) { click('#ldSearch .ld-search-ic'); typeIn('#ldSearchInput', 'zzzz'); await sleep(400); });

  /* ---- the add button and the rows ---- */
  FAMILIES.forEach((d) => add(`add-${short(d)}`, { doc: d, roots: NAV }, async function (sleep, side) { trackNav(side); click('.ct-add-btn'); await sleep(500); }));
  add('add-focus', {}, async function (sleep) { $('.ct-add-btn').focus(); await sleep(200); });
  add('add-hover', {}, async function (sleep) { await sleep(100); });
  add('row-menu-open', {}, async function (sleep) { click($$('.ct-menu-btn')[1]); await sleep(300); });
  add('row-menu-open-dark', { theme: 'dark' }, async function (sleep) { click($$('.ct-menu-btn')[1]); await sleep(300); });
  add('row-menu-edit', { roots: NAV }, async function (sleep, side) { trackNav(side); click($$('.ct-menu-btn')[1]); await sleep(200); click($$('.ct-ctx-item')[2]); await sleep(500); });
  add('row-menu-detail', { roots: NAV }, async function (sleep, side) { trackNav(side); click($$('.ct-menu-btn')[1]); await sleep(200); click($$('.ct-ctx-item')[3]); await sleep(500); });
  add('row-menu-edit-7', { doc: 'credit-application', roots: NAV }, async function (sleep, side) { trackNav(side); click($$('.ct-menu-btn')[0]); await sleep(200); click($$('.ct-ctx-item')[0]); await sleep(500); });
  add('row-menu-closes-on-click', {}, async function (sleep) { click($$('.ct-menu-btn')[0]); await sleep(200); document.body.click(); await sleep(300); });
  add('row-menu-switch', {}, async function (sleep) { click($$('.ct-menu-btn')[0]); await sleep(150); click($$('.ct-menu-btn')[1]); await sleep(300); });
  add('row-dblclick', { roots: NAV }, async function (sleep, side) { trackNav(side); $$('#sdTableBody tr[data-name]')[0].dispatchEvent(new MouseEvent('dblclick', { bubbles: true })); await sleep(500); });
  add('row-menu-scrolled-row', {}, async function (sleep) { await scrollEnd(); click($$('.ct-menu-btn')[22]); await sleep(300); });
  add('scrolled-row-dblclick', { roots: NAV }, async function (sleep, side) { trackNav(side); await scrollEnd(); $$('#sdTableBody tr[data-name]')[22].dispatchEvent(new MouseEvent('dblclick', { bubbles: true })); await sleep(500); });
  add('scrolled-row-menu-edit', { roots: NAV }, async function (sleep, side) { trackNav(side); await scrollEnd(); click($$('.ct-menu-btn')[22]); await sleep(200); click($$('.ct-ctx-item')[44]); await sleep(500); });

  /* ---- the filter dialog and the server side filter (PrimeFaces.ab → applyFilters / clearFilters / the pager → sdTableWrap drawn again) ---- */
  add('filter-open', {}, async function () { await openFilter(); });
  add('filter-open-dark', { theme: 'dark' }, async function () { await openFilter(); });
  add('filter-open-390', { w: 390, h: 844 }, async function () { await openFilter(); });
  add('filter-open-en', { lang: 'en' }, async function () { await openFilter(); });
  add('filter-typed', {}, async function (sleep) { await openFilter(); fillFilter(0, 'CA-0004'); fillFilter(3, 'x'); await sleep(200); });
  add('filter-apply-docno', {}, async function (sleep) { await openFilter(); fillFilter(0, 'CA-0004'); click('#sdFilterOverlay .ct-btn-filter'); await sleep(1500); });
  add('filter-apply-docno-dark', { theme: 'dark' }, async function (sleep) { await openFilter(); fillFilter(0, 'CA-0004'); click('#sdFilterOverlay .ct-btn-filter'); await sleep(1500); });
  add('filter-apply-docno-en', { lang: 'en' }, async function (sleep) { await openFilter(); fillFilter(0, 'CA-0004'); click('#sdFilterOverlay .ct-btn-filter'); await sleep(1500); });
  add('filter-apply-many', {}, async function (sleep) { await openFilter(); fillFilter(0, 'CA-00'); click('#sdFilterOverlay .ct-btn-filter'); await sleep(1500); });
  add('filter-apply-many-390', { w: 390, h: 844 }, async function (sleep) { await openFilter(); fillFilter(0, 'CA-00'); click('#sdFilterOverlay .ct-btn-filter'); await sleep(1500); });
  add('filter-apply-name', {}, async function (sleep) { await openFilter(); fillFilter(2, 'ธนากร'); click('#sdFilterOverlay .ct-btn-filter'); await sleep(1500); });
  add('filter-apply-none', {}, async function (sleep) { await openFilter(); fillFilter(0, 'zzzz'); click('#sdFilterOverlay .ct-btn-filter'); await sleep(1500); });
  add('filter-apply-none-dark', { theme: 'dark' }, async function (sleep) { await openFilter(); fillFilter(0, 'zzzz'); click('#sdFilterOverlay .ct-btn-filter'); await sleep(1500); });
  add('filter-apply-empty', {}, async function (sleep) { await openFilter(); click('#sdFilterOverlay .ct-btn-filter'); await sleep(1500); });
  add('filter-apply-status', {}, async function (sleep) { await openFilter(); fillFilter(4, 'รอ'); click('#sdFilterOverlay .ct-btn-filter'); await sleep(1500); });
  // the pager of a filtered list: first / previous / next / last page (each one a request that draws the table again)
  add('filter-page-next', {}, async function (sleep) { await filterMany(); pgClick(2); await sleep(1200); });
  add('filter-page-last', {}, async function (sleep) { await filterMany(); pgClick(3); await sleep(1200); });
  add('filter-page-prev', {}, async function (sleep) { await filterMany(); pgClick(3); await sleep(1200); pgClick(1); await sleep(1200); });
  add('filter-page-first', {}, async function (sleep) { await filterMany(); pgClick(2); await sleep(1200); pgClick(0); await sleep(1200); });
  add('filter-page-walk', {}, async function (sleep) { await filterMany(); pgClick(2); await sleep(1200); pgClick(2); await sleep(1200); pgClick(2); await sleep(1200); });
  add('filter-page-next-dark', { theme: 'dark' }, async function (sleep) { await filterMany(); pgClick(2); await sleep(1200); });
  add('filter-page-last-390', { w: 390, h: 844 }, async function (sleep) { await filterMany(); pgClick(3); await sleep(1200); });
  add('filter-clear', {}, async function (sleep) { await openFilter(); fillFilter(0, 'CA-0004'); click('#sdFilterOverlay .ct-btn-filter'); await sleep(1500); await openFilter(); click('#sdFilterOverlay .ct-btn-clear'); await sleep(1500); });
  add('filter-clear-then-scroll', {}, async function (sleep) { await openFilter(); fillFilter(0, 'CA-0004'); click('#sdFilterOverlay .ct-btn-filter'); await sleep(1500); await openFilter(); click('#sdFilterOverlay .ct-btn-clear'); await sleep(1500); await scrollEnd(); });
  add('filter-apply-other-family', { doc: 'legal-credit-request' }, async function (sleep) { await openFilter(); fillFilter(0, 'CA-00'); click('#sdFilterOverlay .ct-btn-filter'); await sleep(1500); });
}
