// The Java side of the supporting-document comparisons (pages supporting-doc-list and supporting-doc-form): the REAL page files
// (sales_document*.xhtml, sales_document_sub_*.xhtml, pages/inc/*.xhtml) rendered by tools/lib/jsf.mjs in 'java' mode — the HTML the server would write — inside
// the shell replica, with the REAL PrimeFaces stylesheet / widget scripts, the REAL page scripts and the REAL theme.
//
// What stands in for the server:
//   - the state of the page (the @ViewScoped bean) is the SAME class the Angular host holds (supporting-doc.bean.ts) over the SAME mock (supporting-doc.mock.ts);
//   - the components' markup is tools/lib/pf-dom.mjs — the same file the generator uses for the Angular template: both sides read it, so a wrong class
//     there is a visual difference to the real Java page, NOT a failing comparison (see docs/integration/supporting-docs.md);
//   - PrimeFaces.ab (the ajax of the buttons) posts to /triplesale/__jsf/<page> and the harness answers with the parts the action re-draws.
import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import postcss from 'postcss';
import safeParser from 'postcss-safe-parser';
import { createRenderer } from '../../lib/jsf.mjs';
import { themeColors } from '../../lib/pf-css.mjs';
import { msgFn } from '../../lib/sales-doc.mjs';
import { ajaxPost, docAttach, formPost, sessionOf } from './supporting-doc-server.mjs';

export const BARREL = 'tools/compare/lib/supporting-doc-barrel.ts';
export const slugs = ['letter-of-intent', 'legal-credit-request', 'service-contract', 'loan-agreement', 'preliminary-credit-approval', 'property-project-contract', 'credit-application'];

let componentsCss;
/** components.css of the PrimeFaces jar (the structure of the widgets), read once */
export function pfComponentsCss(javaRoot) {
  if (componentsCss) return componentsCss;
  const jar = process.env.TS_PF_JAR ?? join(javaRoot, 'target/triplesale/WEB-INF/lib/primefaces-14.0.7-jakarta.jar');
  if (!existsSync(jar)) throw new Error(`PrimeFaces jar not found: ${jar} (set TS_PF_JAR)`);
  componentsCss = execFileSync('unzip', ['-p', jar, 'META-INF/resources/primefaces/components.css'], { maxBuffer: 64 * 1024 * 1024 }).toString('utf8');
  return componentsCss;
}

/** the widgets of the PrimeFaces head resources, in the order JSF loads them (the vendored files are the jar's, byte for byte) */
const PF_SCRIPTS = ['jquery.js', 'jquery-plugins.js', 'core.js', 'components.js', 'locale-th.js', 'calendar.js', 'validation.js', 'fileupload.js'];

/**
 * The declarations of the template's inline <style> that read a color from the server (`box-shadow: 0 0 0 0.2em #{commonBean.getRootColor('theme.color.2_1')}`, the focus ring of the
 * inputs): the shell replica leaves the EL out, so they would not apply; here they are written with the line of theme_1.properties the server read (CommonBean.getRootColor), after
 * everything else, as rules of their own.
 */
let rootColorCss;
export function rootColorStyle(ctx) {
  if (rootColorCss !== undefined) return rootColorCss;
  const color = themeColors(readFileSync(join(ctx.javaRoot, 'src/java/theme_1.properties'), 'utf8'));
  const styles = [...ctx.shell.read('WEB-INF/pages/template.xhtml').matchAll(/<style[^>]*>([\s\S]*?)<\/style>/g)].map((m) => m[1]).join('\n');
  const root = safeParser(styles.replace(/#\{commonBean\.getRootColor\(\s*(['"])([\w.]+)\1\s*\)\}/g, (_m, _q, k) => color(k) ?? '__EL__').replace(/#\{[^}]*\}/g, '__EL__'));
  const out = [];
  root.walkRules((rule) => {
    const decls = rule.nodes.filter((n) => n.type === 'decl' && /#[0-9A-Fa-f]{3,8}\b/.test(n.value) && /\bbox-shadow\b|\bborder-color\b|\bcolor\b|\bbackground\b|\bborder\b/.test(n.prop) && !n.value.includes('__EL__'));
    // only the rules that name a PrimeFaces widget (the ring of an input, the border of a hovered select …)
    if (decls.length && rule.selectors.every((x) => /\.ui-/.test(x))) out.push(`${rule.selector} { ${decls.map((d) => `${d.prop}: ${d.value};`).join(' ')} }`);
  });
  rootColorCss = out.length ? `<style id="sdRootColors">${out.join('\n')}</style>` : '';
  return rootColorCss;
}

/** PrimeFaces' own stylesheet comes before the theme (the shell replica links the theme first) */
export const pfFirst = () => `<link rel="stylesheet" href="/__pf/components.css"/>`;
/** the widget scripts: head resources of PrimeFaces (the page's own scripts run after them) */
export const pfHead = () => PF_SCRIPTS.map((f) => `<script src="/__pub/assets/vendor/primefaces/${f}"></script>`).join('\n');

/** `PrimeFaces.cw(...)` of a widget, with the change behaviour of a select as a function (what the server wrote inline after the component) */
export function widgetScript(w, messages) {
  const base = JSON.stringify(w.cfg);
  const extra = [];
  if (w.type === 'Growl') extra.push(`"msgs":${JSON.stringify(messages ?? [])}`);
  if (w.raw) extra.push(...w.raw);
  const text = extra.length ? base.replace(/\}$/, `,${extra.join(',')}}`) : base;
  const wv = w.widgetVar || `widget_${w.id.replace(/[^\w]/g, '_')}`;
  return `PrimeFaces.cw(${JSON.stringify(w.type)},${JSON.stringify(wv)},${text});`;
}

/** the widgets inside a part the server answers with (an ajax update): their scripts follow the markup, as the renderers write them */
export const widgetScripts = (widgets) => (widgets.length ? `<script type="text/javascript">${widgets.map((w) => widgetScript(w)).join('')}</script>` : '');

/** the page-level script that starts the widgets once the document is ready */
export function widgetInit(widgets, view, messages) {
  return `<script>window.__SDVIEW=${JSON.stringify(view)};$(function(){${widgets.map((w) => widgetScript(w, messages)).join('\n')}});</script>`;
}

/** the renderer of a page in java mode */
export function rendererFor(ctx, m, bundle, bean, formAction, ids) {
  return createRenderer({
    mode: 'java',
    ids,
    read: ctx.shell.read,
    msg: msgFn(bundle),
    can: () => true,
    vars: { sales_documentView: bean, contractView: null },
    formAction,
    viewDate: m.viewDate,
    ctxPath: '/triplesale',
    session: { timeZone: 'Asia/Bangkok', uploadMaxBytes: 14680064, uploadMaxLabel: '14 MB' },
    // h:link / p:linkButton: /triplesale/pages/<page>.face?a=b&amp;c=d
    linkTarget: (page, params, R) => `/triplesale/pages/${page}.face?` + params.map(([k, v]) => `${k}=${R.out(v)}`).join('&amp;'),
  });
}

export const bundleOf = (ctx, lang) => (lang === 'en' ? ctx.readJson('public/assets/i18n/en.json') : ctx.shell.th);

/**
 * The views the replica built (name → what the server needs to restore one): the kind of page, the family, the language / mode, and the ids of its components
 * (shared by every draw of the view — see jsf.mjs `nextId`).
 */
export const VIEWS = new Map();

/**
 * The descriptor of a view by its name. A list is also reached by a redirect (the save of a form): when only forms were built in this run, the list is described
 * from its name (`sdl-<family>[-en]`), and drawn by the server when asked for.
 */
export function viewDesc(name) {
  const known = VIEWS.get(name);
  if (known) return known;
  const m = /^sdl-(.+?)(-en)?$/.exec(name);
  if (!m || !slugs.includes(m[1])) return undefined;
  const d = { kind: 'list', name, t: m[1], lang: m[2] ? 'en' : 'th', ids: { map: new Map(), n: 1 } };
  VIEWS.set(name, d);
  return d;
}

/** the page of a view drawn again for its bean: { r, html } (the renderer holds the bindings / actions / widgets of this draw) */
export function draw(ctx, state, v) {
  const { d, bean, type } = v;
  const file = `pages/${d.kind === 'form' ? type.subPage : type.listPage}.xhtml`;
  const r = rendererFor(ctx, state.m, bundleOf(ctx, d.lang), bean, `/triplesale/pages/${d.name}.face`, d.ids);
  return { r, html: r.renderFile(file, 'content') };
}

/** the whole document of a view (the shell, the page's head and body, the widgets' start-up) as a file of the harness's output folder; `messages` go to its growl */
function compose(ctx, { name, lang, file, r, content, messages, fileName }) {
  const head = r.renderFile(file, 'head');
  return ctx.shell.build('home', '7', fileName ?? `h-${name}.html`, {
    headFirst: pfFirst(),
    headEarly: `${pfHead()}\n${head}`,
    head: rootColorStyle(ctx),
    content,
    tail: `<script>try { sessionStorage.setItem('ts_username', 'demo'); } catch (e) {}</script>\n${ctx.shell.TEMPLATE_SCRIPTS(bundleOf(ctx, lang))}\n${widgetInit(r.widgets, name, messages)}`,
  });
}

let dynSeq = 0;
/** the document of a view the server draws now (not a file built in advance): its html, for the bean in `v`, with the messages in the growl */
function pageOf(ctx, state, v, messages) {
  const { d, type } = v;
  const file = `pages/${d.kind === 'form' ? type.subPage : type.listPage}.xhtml`;
  const dr = draw(ctx, state, v);
  v.last = dr;
  return readFileSync(compose(ctx, { name: d.name, lang: d.lang, file, r: dr.r, content: dr.html, messages, fileName: `h-${d.name}-dyn${++dynSeq}.html` }), 'utf8');
}

/** the address of the list of a view's family (what the save redirects to) */
function listUrl(d, type) {
  return `/triplesale/pages/sdl-${d.t}${d.lang === 'en' ? '-en' : ''}.xhtml?pid=1&page_id=7&act=7&acts=${type.acts}&sub_id=${type.subId}&action_type=list`;
}

/** the list page of a family for a language: { file, widgets, actions } */
export async function buildList(ctx, { t, lang, name }) {
  const m = await ctx.loadTs(BARREL);
  const { api } = m.createMockSupportingDocs({ delayMs: 0 });
  const bean = new m.SupportingListBean(m.SUPPORTING_DOC_TYPES.find((x) => x.slug === t), new m.SupportingDocService(api, new m.AttachStore()), () => {});
  const type = bean.type;
  await bean.init();
  const file = `pages/${type.listPage}.xhtml`;
  const ids = { map: new Map(), n: 1 };
  VIEWS.set(name, { kind: 'list', name, t, lang, ids });
  const r = rendererFor(ctx, m, bundleOf(ctx, lang), bean, `/triplesale/pages/${name}.face`, ids);
  const content = r.renderFile(file, 'content');
  const built = compose(ctx, { name, lang, file, r, content });
  return { file: built, widgets: r.widgets, actions: r.actions, bindings: r.bindings };
}

/** the form page of a family for a mode: { file, ... } */
export async function buildForm(ctx, { t, lang, mode, k, name }) {
  const m = await ctx.loadTs(BARREL);
  const { api } = m.createMockSupportingDocs({ delayMs: 0 });
  const type = m.SUPPORTING_DOC_TYPES.find((x) => x.slug === t);
  const bean = new m.SupportingFormBean(type, mode, new m.SupportingDocService(api, new m.AttachStore()), () => {}, () => '2026-10-20');
  await bean.init(mode === 'add' ? undefined : String(m.mockDocId(type.n, k)));
  const file = `pages/${type.subPage}.xhtml`;
  const ids = { map: new Map(), n: 1 };
  VIEWS.set(name, { kind: 'form', name, t, lang, mode, k, ids });
  const r = rendererFor(ctx, m, bundleOf(ctx, lang), bean, `/triplesale/pages/${name}.face`, ids);
  const content = r.renderFile(file, 'content');
  const built = compose(ctx, { name, lang, file, r, content });
  return { file: built, widgets: r.widgets, actions: r.actions, bindings: r.bindings, uploads: r.uploads, remoteCommands: r.remoteCommands };
}

/* ------------------------------------------------------------------------------------------------ what the dumps compare */
// where the Angular port deliberately differs from the Java page (see docs/integration/supporting-docs.md, "ความต่างที่ตั้งใจ")
export function normalize(l) {
  return (
    l
      // the ids JSF gives a component that has none: the numbering of the component tree is not something the port reproduces
      .replace(/j_idt\d+/g, 'j_idt#')
      // the ajax plumbing of PrimeFaces: the buttons of the Angular page are plain buttons with Angular's own click handler
      .replace(/ onclick=PrimeFaces\.ab\(\{.*?\}\);return false;/g, '')
      // the change behavior of a select: an inline onchange on the hidden <select> in Java; the Angular host listens to the same event on the same element
      // the id the shell's ODS gives a <select> that has none counts the selects it enhanced since the page was loaded (a single-page app does not start from 0 after a post)
      .replace(/\bodsAuto_\d+/g, 'odsAuto_#')
      .replace(/ onchange=PrimeFaces\.ab\(\{.*?\}\)(?= [\w-]+=|>)/g, '')
      // the action of a form: the page address in Java; the Angular form is never posted
      .replace(/ action=\S+ (enctype=)/g, ' action=# $1')
      // the six copies of the form differ in the ids of their sections and of the receive controls; the template has family 1's
      .replace(/\bsd([2-6])(RcvDate|RcvBy)(?![A-Za-z0-9])/g, 'sd1$2')
      .replace(/\bsd[2-6]-panel-/g, 'sd-panel-')
      // handlers that carry an address / an id of the Java row are static here (the row says which): the Java strings mapped to those
      .replace(/onclick=window\.sdCtxToggle\('\d+',event\)/g, 'onclick=window.sdCtxToggle(this.nextElementSibling.id.slice(6),event)')
      .replace(/(onclick|ondblclick)=window\.location\.href='[A-Za-z_0-9]+\.face\?[^']*action_type=(edit|detail)[^']*'/g, '$1=window.sdGo(this,\'$2\')')
      .replace(/onclick=togglePanel\(this, '[\w-]+'\)/g, 'onclick=togglePanel(this, this.nextElementSibling.id)')
      .replace(/onclick=docAttOpenUrl\('(view|download)', '[^']*', \d+, this\); return false;/g, "onclick=docAttOpenUrl('$1', null, null, this); return false;")
      // the address a click went to: the replica file of the form is the route of the document in the Angular app
      .replace(/NAV \/triplesale\/pages\/sdf-([a-z-]+?)-(?:add|edit|detail)-\d+(?:-en)?\.xhtml\?\S*?action_type=(edit|detail)\S*?quotation_id=(\d+)\S*/g, 'NAV /crm/supporting-docs/$1/$3?action_type=$2')
      // the rows sales_doc_list.js adds write '../images/…' (relative to /pages/ in Java); the images are assets/images/ here
      .replace(/\.\.\/images\//g, 'assets/images/')
      // the inline position jQuery UI gives the datepicker is the layout position of its input in 1/64 px ('365.09px' / '365.094px' for the same box): one decimal
      .replace(/\b(top|left):(-?\d+\.\d{2,3})px/g, (_m, p, v) => `${p}:${Number(v).toFixed(1)}px`)
  );
}

export function readBundleKeys(ctx, lang) {
  return readFileSync(join(ctx.ngRoot, `public/assets/i18n/${lang}.json`), 'utf8');
}

/* ------------------------------------------------------------------------------------------------ the backend of the replica */
export async function newState({ delay }, ctx) {
  const m = await ctx.loadTs(BARREL);
  const mock = m.createMockSupportingDocs({ delayMs: delay });
  return { m, mock, svc: new m.SupportingDocService(mock.api, new m.AttachStore()), views: new Map() };
}

const json = (status, body) => ({ status, headers: { 'content-type': 'application/json; charset=UTF-8' }, body: JSON.stringify(body) });

const DEPS = { views: { get: viewDesc }, draw, widgetScripts, page: pageOf, listUrl };

export async function handle(req, state, ctx) {
  const { path } = req;
  if (path === '/__pf/components.css') return { status: 200, headers: { 'content-type': 'text/css; charset=utf-8' }, body: pfComponentsCss(ctx.javaRoot) };
  // the post of the form of a view: a PrimeFaces ajax request (a partial response) or the plain submit of the form (ajax="false")
  const view = /^\/triplesale\/pages\/(sd[fl]-[\w.-]+)\.face$/.exec(path);
  if (view && req.method === 'POST') {
    if (/jakarta\.faces\.partial\.ajax/.test(req.body ?? '')) return ajaxPost(DEPS, view[1], req, state, ctx);
    return formPost(DEPS, view[1], req, state, ctx);
  }
  if (path === '/triplesale/docattach') return docAttach(DEPS, req, state, ctx);
  // a page load: the view starts again (a @ViewScoped bean per page); the list after a save is drawn now (the saved document, the flash messages)
  const pageGet = /^\/triplesale\/pages\/(sd[fl]-[\w.-]+)\.xhtml$/.exec(path);
  if (pageGet && req.method === 'GET') {
    state.views?.delete(pageGet[1]);
    const d = viewDesc(pageGet[1]);
    if (d?.kind === 'list' && (state.saved || state.flash)) {
      const v = await sessionOf(DEPS, state, ctx, pageGet[1]);
      const messages = state.flash ?? [];
      state.flash = undefined;
      return { status: 200, headers: { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store' }, body: pageOf(ctx, state, v, messages) };
    }
  }
  const url = new URL(req.path + req.search, 'http://x');
  if (path === '/triplesale/board/sales-document-list') {
    const type = state.m.SUPPORTING_DOC_TYPES.find((x) => x.formType === (url.searchParams.get('formType') ?? '').trim());
    const page = Number.parseInt(url.searchParams.get('page') ?? '', 10);
    const perPage = Number.parseInt(url.searchParams.get('perPage') ?? '', 10);
    try {
      const result = type ? await state.svc.fetchPage(type, Number.isNaN(page) ? 1 : page, Number.isNaN(perPage) ? 20 : perPage) : { items: [], total: 0, page: 1, perPage: 20 };
      return json(200, { status: 200, message: 'success', result });
    } catch {
      return json(500, { status: 500, message: 'โหลดรายการเอกสารไม่สำเร็จ' });
    }
  }
  if (path.startsWith('/triplesale/board/') && /\/(provinces|districts|sub-districts)$/.test(path)) {
    const r = await state.mock.board(path + req.search);
    return { status: r.status, headers: { 'content-type': 'application/json; charset=UTF-8' }, body: await r.text() };
  }
  return null;
}
