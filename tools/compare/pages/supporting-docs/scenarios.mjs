// Scenarios of the supporting documents hub comparison. Each function is run INSIDE the page under test with (sleep, side, win) in scope,
// after the prelude of lib/scenario-pre.mjs and the page prelude (`pre` in page.mjs: navTo()).
export default function (add) {
  /* ---- first paint, themes, viewports ---- */
  add('overview', {}, async function () {});
  add('overview-dark', { theme: 'dark' }, async function () {});
  [[390, 844], [768, 1024], [1024, 768], [1920, 1080]].forEach(function (s) {
    add('overview-' + s[0], { w: s[0], h: s[1] }, async function () {});
  });
  add('overview-dark-390', { theme: 'dark', w: 390, h: 844 }, async function () {});
  add('en-overview', { lang: 'en' }, async function () {});
  add('fs-plus', {}, 'fontAdj("2px"); await sleep(600);');
  add('fs-minus', {}, 'fontAdj("-2px"); await sleep(600);');

  /* ---- the search box: the magnifier opens it, the input filters by name, x closes it ---- */
  add('search-open', {}, 'click(".ld-search-ic"); await sleep(400);');
  add('search-open-dark', { theme: 'dark' }, 'click(".ld-search-ic"); await sleep(400);');
  add('search-type', {}, 'click(".ld-search-ic"); await sleep(300); typeIn("#ldSearchInput", "สัญญา"); await sleep(500);');
  add('search-type-latin', {}, 'click(".ld-search-ic"); await sleep(300); typeIn("#ldSearchInput", "service"); await sleep(500);');
  add('search-none', {}, 'click(".ld-search-ic"); await sleep(300); typeIn("#ldSearchInput", "zzz"); await sleep(500);');
  add('search-none-dark', { theme: 'dark' }, 'click(".ld-search-ic"); await sleep(300); typeIn("#ldSearchInput", "zzz"); await sleep(500);');
  add('search-clear', {}, 'click(".ld-search-ic"); await sleep(300); typeIn("#ldSearchInput", "สัญญา"); await sleep(300); click("#ldSearchClear"); await sleep(500);');
  add('search-close-magnifier', {}, 'click(".ld-search-ic"); await sleep(300); click(".ld-search-ic"); await sleep(400);');
  add('search-390', { w: 390, h: 844 }, 'click(".ld-search-ic"); await sleep(300); typeIn("#ldSearchInput", "ใบ"); await sleep(500);');

  /* ---- a click on a row opens the document family (same tab) ---- */
  add('row-click-1', { roots: [] }, 'navTo(); click("#sdTableBody tr[data-name]"); await sleep(600);');
  add('row-click-service-contract', { roots: [] }, 'navTo(); click("#sdTableBody tr[data-name=\\"Service Contract\\"]"); await sleep(600);');
  add('row-click-last', { roots: [] }, 'navTo(); var rows = $$("#sdTableBody tr[data-name]"); click(rows[rows.length - 1]); await sleep(600);');
}
