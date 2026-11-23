// Comparison setup of the sales-document list (/sales/docs/:type) — see tools/compare/README.md for the interface of a page.
//
// Java side: the REAL page (sales_doc_type_list.xhtml with components/sales_doc_list_{mockup,legacy}.xhtml and sales_doc_tabs.xhtml pasted in as
// Facelets does — tools/lib/facelets.mjs —, the stylesheets / scripts of its head, EL resolved the way the server would) inside the shell
// replica, once per type and language. The page calls no API (the Java list has none yet), so there is nothing to serve.
import { javaLinkToRoute } from '../../../../src/app/core/navigation/java-links.ts';
import { renderPage } from '../../../lib/facelets.mjs';
import { msgFn, xhtmlToHtml } from '../../../lib/sales-doc.mjs';

// zz = a type the page does not know: the legacy list; QT = the spelling is not a type either (the comparison is case sensitive)
const DOCS = ['qt', 'bk', 'ob', 'aq', 'ad', 'zz', 'QT'];
// (the files are named per type; the file system is not case sensitive on Windows, hence "upper" for QT)
const name = (doc, lang) => `sales_doc_type_list-${doc === 'QT' ? 'upper' : doc}${lang === 'en' ? '-en' : ''}`;

export default {
  name: 'sales-doc-list',
  // the page (table of the types: .qml-root; the legacy list: .sd2-root) and the SweetAlert of the add button
  roots: ['.qml-root', '.sd2-root', '.swal-overlay'],
  // both variants draw their tbody rows when their script has run
  ready: `document.querySelector('#qmlBody tr, #sd2Body tr')`,
  javaPath: (lang, opts) => `/triplesale/pages/${name(opts.doc ?? 'qt', lang)}.xhtml`,
  ngPath: (_lang, opts) => `/sales/docs/${opts.doc ?? 'qt'}`,
  latencyMs: 0,
  // helpers of this page's scenarios
  pre: `
// location.href = … (Java) / the router (Angular): the Navigation API sees both; the Java page is kept where it is (a cancelled navigation)
var navCalls = [];
var trackNav = function (side) {
  navCalls = [];
  if (!window.navigation) throw new Error('no Navigation API');
  window.navigation.addEventListener('navigate', function (e) { var u = new URL(e.destination.url); navCalls.push(u.pathname + u.search); if (side === 'java') e.preventDefault(); });
  window.__extra = async function () { return ['NAV ' + navCalls.join(' ; ')]; };
};
`,
  // where the port deliberately differs: the links of the Java page are relative to /pages/ (the shell-level normaliser handles /pages/….xhtml)
  normalize: (l) => l.replace(/(\bhref=)(sales_doc_(?:qt|bk|ob|aq|ad)_form\.xhtml\?[^ >]*)/g, (_m, a, link) => a + (javaLinkToRoute(link) ?? link)),
  async build(ctx) {
    const { shell } = ctx;
    const out = {};
    for (const lang of ['th', 'en']) {
      const bundle = lang === 'en' ? ctx.readJson('public/assets/i18n/en.json') : shell.th;
      for (const doc of DOCS) {
        const r = renderPage({ read: shell.read, file: 'pages/sales_doc_type_list.xhtml', mode: 'java', msg: msgFn(bundle), session: {}, params: { doc } });
        out[`/triplesale/pages/${name(doc, lang)}.xhtml`] = shell.build('sale', '1', `h-${name(doc, lang)}.html`, {
          // template.xhtml puts the head of the page right after project_root.css
          headEarly: xhtmlToHtml(r.defines.head),
          content: xhtmlToHtml(r.defines.content),
          tail: `<script>try { sessionStorage.setItem('ts_username', 'demo'); } catch (e) {}</script>\n${shell.TEMPLATE_SCRIPTS(bundle)}`,
        });
      }
    }
    return out;
  },
  async newState() {
    return {};
  },
  async handle() {
    return null; // the page calls no API
  },
};
