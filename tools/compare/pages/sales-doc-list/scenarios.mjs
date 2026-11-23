// Scenarios of the sales-document list comparison. Each function is run INSIDE the page under test (Java replica / Angular app) with
// (sleep, side, win) in scope, after the prelude of lib/scenario-pre.mjs and the page prelude (`pre` in page.mjs: trackNav()).
// add(name, opts, fn):  opts = { w, h, theme, lang, settle, wait, roots, ready, doc }   doc = qt | bk | ob | aq | ad | zz (an unknown type: the legacy list)
export default function (add) {
  const DOCS = ['qt', 'bk', 'ob', 'aq', 'ad', 'zz'];
  const SIZES = [[390, 844], [768, 1024], [1024, 768], [1920, 1080]];
  const lbl = (d) => (d === 'zz' ? 'legacy' : d);

  /* ---- first paint: every type, themes, viewports, languages, the A A A buttons ---- */
  DOCS.forEach((d) => {
    add(`overview-${lbl(d)}`, { doc: d }, async function () {});
    add(`overview-${lbl(d)}-dark`, { doc: d, theme: 'dark' }, async function () {});
    add(`en-overview-${lbl(d)}`, { doc: d, lang: 'en' }, async function () {});
    add(`en-overview-${lbl(d)}-dark`, { doc: d, lang: 'en', theme: 'dark' }, async function () {});
    SIZES.forEach((s) => add(`overview-${lbl(d)}-${s[0]}`, { doc: d, w: s[0], h: s[1] }, async function () {}));
    add(`overview-${lbl(d)}-dark-390`, { doc: d, theme: 'dark', w: 390, h: 844 }, async function () {});
    add(`fs-plus-${lbl(d)}`, { doc: d }, 'fontAdj("2px"); await sleep(600);');
    add(`fs-minus-${lbl(d)}`, { doc: d }, 'fontAdj("-2px"); await sleep(600);');
    add(`fs-plus-${lbl(d)}-dark-768`, { doc: d, theme: 'dark', w: 768, h: 1024 }, 'fontAdj("2px"); await sleep(600);');
  });
  // around the breakpoints of the stylesheets (600 of the table of the types; 1599 · 1279 · 1024 · 860 of sd2_list.css) and the phone widths
  [[1600, 900], [1279, 800], [1100, 800], [900, 800], [861, 800], [860, 800], [700, 900], [601, 900], [600, 900], [480, 900], [360, 740]].forEach((s) => {
    add(`width-qt-${s[0]}`, { doc: 'qt', w: s[0], h: s[1] }, async function () {});
    add(`width-legacy-${s[0]}`, { doc: 'zz', w: s[0], h: s[1] }, async function () {});
  });
  // an upper-case spelling is not a type either: the legacy list
  add('overview-legacy-case', { doc: 'QT' }, async function () {});

  /* ---- the button that creates a document ---- */
  DOCS.slice(0, 5).forEach((d) => {
    // (the Angular app really moves to the route — the Java page is held back by trackNav — so only the address both sides went to is compared)
    add(`create-${d}`, { doc: d, roots: ['.swal-overlay'] }, async function (sleep, side) { trackNav(side); click('#qmlAddBtn'); await sleep(500); });
  });
  add('create-qt-focus', { doc: 'qt' }, async function (sleep) { $('#qmlAddBtn').focus(); await sleep(200); });

  /* ---- the legacy list ---- */
  const alertUp = async function (sleep) { click('#sd2AddBtn'); await waitFor(function () { return $('.swal-overlay--show-modal'); }, 4000); await sleep(400); };
  add('legacy-add-alert', { doc: 'zz' }, alertUp);
  add('legacy-add-alert-dark', { doc: 'zz', theme: 'dark' }, alertUp);
  add('legacy-add-alert-en', { doc: 'zz', lang: 'en' }, alertUp);
  add('legacy-add-alert-390', { doc: 'zz', w: 390, h: 844 }, alertUp);
  add('legacy-add-alert-gone', { doc: 'zz' }, async function (sleep) { click('#sd2AddBtn'); await waitFor(function () { return $('.swal-overlay--show-modal'); }, 4000); await sleep(4200); });
  add('legacy-search-open', { doc: 'zz' }, async function (sleep) { click('#sd2SearchBtn'); await sleep(300); });
  add('legacy-search-open-dark', { doc: 'zz', theme: 'dark' }, async function (sleep) { click('#sd2SearchBtn'); await sleep(300); });
  add('legacy-search-open-390', { doc: 'zz', w: 390, h: 844 }, async function (sleep) { click('#sd2SearchBtn'); await sleep(300); });
  add('legacy-search-open-twice', { doc: 'zz' }, async function (sleep) { click('#sd2SearchBtn'); await sleep(150); click('#sd2SearchBtn'); await sleep(300); });
  add('legacy-search-type', { doc: 'zz' }, async function (sleep) { click('#sd2SearchBtn'); typeIn('#sd2SearchInput', 'abc'); await sleep(300); });
  add('legacy-search-go', { doc: 'zz' }, async function (sleep) { click('#sd2SearchBtn'); var i = $('#sd2SearchInput'); i.value = 'xyz'; click('#sd2SearchGo'); await sleep(300); });
  add('legacy-search-enter', { doc: 'zz' }, async function (sleep) { click('#sd2SearchBtn'); var i = $('#sd2SearchInput'); i.value = 'xyz'; i.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true })); await sleep(300); });
  add('legacy-search-escape', { doc: 'zz' }, async function (sleep) { click('#sd2SearchBtn'); typeIn('#sd2SearchInput', 'abc'); await sleep(100); $('#sd2SearchInput').dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true })); await sleep(300); });
  add('legacy-search-clear', { doc: 'zz' }, async function (sleep) { click('#sd2SearchBtn'); typeIn('#sd2SearchInput', 'abc'); await sleep(100); click('#sd2SearchClear'); await sleep(300); });
  add('legacy-search-en', { doc: 'zz', lang: 'en' }, async function (sleep) { click('#sd2SearchBtn'); typeIn('#sd2SearchInput', 'abc'); await sleep(300); });
  add('legacy-product-menu', { doc: 'zz' }, async function (sleep) { click('#sd2ProductBtn'); await sleep(300); });
  add('legacy-product-menu-dark', { doc: 'zz', theme: 'dark' }, async function (sleep) { click('#sd2ProductBtn'); await sleep(300); });
  add('legacy-product-menu-pick', { doc: 'zz' }, async function (sleep) { click('#sd2ProductBtn'); click('#sd2ProductMenu .sd2-menu-item'); await sleep(300); });
  add('legacy-filter-menu', { doc: 'zz' }, async function (sleep) { click('#sd2FilterBtn'); await sleep(300); });
  add('legacy-filter-menu-dark', { doc: 'zz', theme: 'dark' }, async function (sleep) { click('#sd2FilterBtn'); await sleep(300); });
  add('legacy-filter-menu-390', { doc: 'zz', w: 390, h: 844 }, async function (sleep) { click('#sd2FilterBtn'); await sleep(300); });
  add('legacy-menus-switch', { doc: 'zz' }, async function (sleep) { click('#sd2ProductBtn'); await sleep(100); click('#sd2FilterBtn'); await sleep(300); });
  add('legacy-menu-closes-on-document-click', { doc: 'zz' }, async function (sleep) { click('#sd2FilterBtn'); await sleep(100); document.body.click(); await sleep(300); });
  add('legacy-menu-toggle-twice', { doc: 'zz' }, async function (sleep) { click('#sd2FilterBtn'); await sleep(100); click('#sd2FilterBtn'); await sleep(300); });
}
