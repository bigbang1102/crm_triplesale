// Comparison setup of the supporting documents hub (/crm/supporting-docs) — see tools/compare/README.md for the interface of a page.
//
// Java side: the REAL page (head: drag_scroll.css / drag_scroll.js / the <style>; content: the markup with every feature flag on + the
// inline script, EL resolved the way the server would) inside the shell replica. The page has no API, so there is no backend.
import { expandIncludes, facesToHtml, splitSection, uiDefines } from '../../../lib/port-kit.mjs';

export default {
  name: 'supporting-docs',
  roots: ['.ct-root'],
  ready: `document.querySelector('#sdTableBody tr[data-name]')`,
  javaPath: () => '/triplesale/supporting-docs.html',
  ngPath: () => '/crm/supporting-docs',
  latencyMs: 0,
  // DELIBERATE difference: pi-file-edit and pi-verified (rows 2 and 3) do not exist in the old PrimeIcons font of the Java app (Pandora layout),
  // so the Java page draws NOTHING there (an empty box); the Angular app ships PrimeIcons 7, which has them, and shows the icon the author meant.
  normalize: (l) => l.replace(/^(\s*<i class=pi pi-(?:file-edit|verified)>) [\d.,-]+ .*$/, '$1 hidden'),
  // helpers of this page's scenarios: where does a click on a row send the browser?
  //   Java: window.open(url, '_self') — stubbed, the call is recorded; Angular: the router moves to the route (location.pathname).
  //   The dump gets a line "NAV <url>" (the harness maps Java's /pages/x.face?… link to the route of the app, like it does for hrefs)
  pre: `
var navTo = function () {
  var got = [];
  win.open = function (u) { got.push(String(u)); return null; };
  win.__extra = async function () { await sleep(500); return side === 'ng' ? ['NAV ' + location.pathname + location.search] : got.map(function (u) { return 'NAV ' + u; }); };
};
`,

  /** builds the Java replica pages; returns { url path -> file } */
  async build(ctx) {
    const { shell } = ctx;
    const ctxPath = (s) => s.replace(/#\{request\.contextPath\}/g, '/triplesale');
    const defines = uiDefines(shell.read('pages/supporting_documents.xhtml'), 'supporting_documents.xhtml');
    const content = splitSection(expandIncludes(defines['content'], shell.read, 'pages', 'supporting_documents.xhtml'));
    // every feature flag on: <ui:fragment rendered="#{commonBean.hasFeature('X')}"> keeps its content
    const markup = content.markup.replace(/<ui:fragment\b[^>]*>/g, '').replace(/<\/ui:fragment>/g, '');
    const head = ctxPath(defines['head'].replace(/<!--[\s\S]*?-->/g, ''));
    if (/#\{/.test(ctxPath(head + markup + content.scripts[0]))) throw new Error('EL left in supporting_documents.xhtml');

    const file = shell.build('home', '7', 'h-supporting-docs.html', {
      head,
      content: facesToHtml(ctxPath(markup)) + `\n<script>${ctxPath(content.scripts[0])}</script>`,
      tail: `<script>try { sessionStorage.setItem('ts_username', 'demo'); } catch (e) {}</script>\n${shell.TEMPLATE_SCRIPTS()}`,
    });
    return { '/triplesale/supporting-docs.html': file };
  },

  async newState() {
    return {};
  },

  async handle() {
    return null;
  },
};
