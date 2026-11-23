// The Java side of the prospect-form comparison (page prospect-form): the REAL page file (contracts_master_data.xhtml: markup rendered by tools/lib/jsf.mjs the
// way the server would, the three page scripts, attach_file_types.js, lead_create_dropdowns.js, phone_format.js), the real PrimeFaces stylesheet and widget
// scripts (select, date picker, dialog, radio), inside the shell replica — one file per mode, record and language.
//
// What stands in for the server:
//   - the state of the page (the @ViewScoped bean) is the SAME class the Angular host holds (prospect-form.bean.ts) over the SAME mock (prospect-form.mock.ts);
//   - the components' markup is tools/lib/pf-dom.mjs — the same file the generator uses for the Angular template (see docs/integration/prospect-form.md §5);
//   - PrimeFaces.ab (the ajax of the inputs / buttons / remote commands) posts to /triplesale/pages/<view>.face and the harness answers with a partial response:
//     the parts the action re-draws, and the <eval> of the scripts the listener queued (PrimeFaces.current().executeScript);
//   - the BFF the page's scripts call (/triplesale/board/prospect · /prospect/save · /prospect/attachments · /employees …, /docproxy) is the backend's `fetch`.
import { readFileSync } from 'node:fs';
import { createRenderer } from '../../lib/jsf.mjs';
import { msgFn } from '../../lib/sales-doc.mjs';
import { applyRequestValues, extractById, partialResponse, sessionOf } from './supporting-doc-server.mjs';
import { bundleOf, pfComponentsCss, pfFirst, rootColorStyle, widgetInit, widgetScripts } from './supporting-doc-replica.mjs';

export const BARREL = 'tools/compare/lib/prospect-form-barrel.ts';
export const FILE = 'pages/contracts_master_data.xhtml';

/** the widget scripts the Java page loads (the vendored files are the jar's, byte for byte): PrimeFaces core + the components it uses; the date picker has its own file */
const PF_SCRIPTS = ['jquery.js', 'jquery-plugins.js', 'core.js', 'components.js', 'locale-th.js', 'datepicker.js'];
const pfHead = () => PF_SCRIPTS.map((f) => `<script src="/__pub/assets/vendor/primefaces/${f}"></script>`).join('\n');

/** the signed-in employee of the mock login (the Angular host reads the same from the auth session of `demo`) */
export const USER = { id: 1001, code: 'E1001', name: 'สมชาย ใจดี (ทดลอง)' };
export const TODAY = '2026-10-20';

/** name -> the descriptor of a view: { name, mode, id, lang, ids } (the ids of the components are shared by every draw of the view — see jsf.mjs `nextId`) */
export const VIEWS = new Map();
export const viewName = (mode, id, lang) => `ptf-${mode}-${mode === 'add' ? 0 : id}${lang === 'en' ? '-en' : ''}`;

/** the renderer of the page in java mode */
export function rendererFor(ctx, m, bundle, bean, formAction, ids, initial) {
  return createRenderer({
    mode: 'java',
    pfStrict: true,
    ids,
    read: ctx.shell.read,
    msg: msgFn(bundle),
    can: () => true,
    vars: { contractView: bean },
    formAction,
    viewDate: m.viewDate,
    ctxPath: '/triplesale',
    session: { timeZone: 'Asia/Bangkok', uploadAcceptExt: initial.uploadAcceptExt, ssEmployeeId: initial.ssEmployeeId, aiHubEnabled: true },
    // h:link / p:linkButton: none on this page
    linkTarget: () => {
      throw new Error('contracts_master_data: an h:link / p:linkButton (not expected on this page)');
    },
  });
}

/** the bean of a view, started the way the page's @PostConstruct does */
export async function newBean(m, backend, d) {
  const bean = new m.ProspectFormView(new m.ProspectFormService(backend.api), {
    user: USER,
    today: () => TODAY,
    ctxPath: '/triplesale',
    // the live build has no /docproxy servlet for an <img>: the address of the file itself (the Angular host does the same)
    docProxy: (u) => u,
    session: m.prospectSession,
  });
  await bean.init({ action_type: d.mode, id: d.mode === 'add' ? '' : String(d.id), pms: d.pms ?? null });
  return bean;
}

/** the page of a view drawn again for its bean: { r, html } (the renderer holds the bindings / actions / widgets of this draw) */
export function draw(ctx, state, v) {
  const { d, bean } = v;
  const r = rendererFor(ctx, state.m, bundleOf(ctx, d.lang), bean, `/triplesale/pages/${d.name}.face`, d.ids, state.initial);
  return { r, html: r.renderFile(FILE, 'content') };
}

/** the whole document of a view (the shell, the page's head and body, the widgets' start-up) as a file of the harness's output folder */
function compose(ctx, { name, lang, r, content, messages, fileName }) {
  const head = r.renderFile(FILE, 'head');
  return ctx.shell.build('home', '2', fileName ?? `h-${name}.html`, {
    headFirst: pfFirst(),
    headEarly: `${pfHead()}\n${head}${lang === 'en' ? `\n<script>document.cookie = 'cmp_lang=en; path=/';</script>` : ''}`,
    head: rootColorStyle(ctx),
    content,
    tail: `<script>try { sessionStorage.setItem('ts_username', 'demo'); } catch (e) {}</script>\n${ctx.shell.TEMPLATE_SCRIPTS(bundleOf(ctx, lang))}\n${widgetInit(r.widgets, name, messages)}`,
  });
}

/** the form page of a mode / record / language: a file of the harness (the document the browser loads) */
export async function buildForm(ctx, { mode, id, lang, name, pms }) {
  const m = await ctx.loadTs(BARREL);
  const backend = m.createMockProspectForm({ delayMs: 0 });
  const initial = await backend.initial();
  const d = { name, mode, id, lang, pms, ids: { map: new Map(), n: 1 } };
  VIEWS.set(name, d);
  const bean = await newBean(m, backend, d);
  const r = rendererFor(ctx, m, bundleOf(ctx, lang), bean, `/triplesale/pages/${name}.face`, d.ids, initial);
  const content = r.renderFile(FILE, 'content');
  return { file: compose(ctx, { name, lang, r, content }), widgets: r.widgets, actions: r.actions, bindings: r.bindings, remoteCommands: r.remoteCommands };
}

/* ------------------------------------------------------------------------------------------------ what the dumps compare */
// where the Angular port deliberately differs from the Java page (see docs/integration/prospect-form.md, "ความต่างที่ตั้งใจ")
export function normalize(l) {
  return (
    l
      // the ids JSF gives a component that has none: the numbering of the component tree is not something the port reproduces
      .replace(/j_idt\d+/g, 'j_idt#')
      // the ajax plumbing of PrimeFaces: the buttons / inputs of the Angular page have Angular's own event handlers
      .replace(/ onclick=PrimeFaces\.bcn\(this,event,\[.*?\}\]\);/g, '')
      .replace(/ onclick=PrimeFaces\.ab\(.*?\);return false;/g, '')
      // a page that leaves with window.location.href = 'x.face?…' (an inline handler): the Angular page hands the address to the router (ptNavigate)
      .replace(/onclick=window\.location\.href = '([^']*)';/g, "onclick=ptNavigate('$1');")
      // the wrapper of a radio button: class="" in Java (Angular drops an empty attribute); the icon's state class comes after ui-c here (a class binding is added last)
      .replace(/ class= role=radio/g, ' role=radio')
      .replace(/ui-icon ui-icon-(blank|bullet) ui-c/g, 'ui-icon ui-c ui-icon-$1')
      .replace(/ on(change|click|blur)=PrimeFaces\.ab\(\{.*?\}\);?(?= [\w-]+=|>|$)/g, '')
      // the id the shell's ODS gives a <select> that has none counts the selects it enhanced since the page was loaded (a single-page app does not start from 0 after a post)
      .replace(/\bodsAuto_\d+/g, 'odsAuto_#')
      // the action of a form: the page address in Java; the Angular form is never posted
      .replace(/ action=\S+ (enctype=)/g, ' action=# $1')
      // the number of a document row in the handler of its delete icon: a data attribute here
      .replace(/onclick=ctMdDeleteDoc\('(\d+)'\); return false;/g, "data-docno=$1 onclick=ctMdDeleteDoc(this.getAttribute('data-docno')); return false;")
      // the "customer summary" link of the view mode: the address of the AI HUB in Java, its route (and the router's click) here
      .replace(/<a href=ai_hub\.face\?pid=1&page_id=16&act=21&acts=211&tool=customer-brief&prospectId=(\d+)&navbar_menu=navbar_menu_aihub /g, "<a href=/ai/hub/customer-brief?prospectId=$1 onclick=ptNavigate(this.getAttribute('href')); return false; ")
      // the address a click went to: the replica file of the form is the route of the record in the Angular app
      .replace(/NAV \/triplesale\/pages\/ptf-(?:add|view|edit)-\d+(?:-en)?\.xhtml\?\S*?action_type=(view|edit)\S*?[?&]id=(\d+)\S*/g, 'NAV /crm/prospects/$2?action_type=$1')
      // the "customer summary" link of the view mode is bound to the bean here (Angular re-reads a binding when it changes); the Java page keeps the value of the page load
      // until a part that holds it is updated — after "create lead" in the view mode the bean holds the id of the lead's prospect
      .replace(/(\/ai\/hub\/customer-brief\?prospectId=)\d+/g, '$1#')
      // where the page went: the Java address of the replica (/triplesale/pages/<page>.face?…) and the route of the Angular app
      .replace(/NAV \/triplesale\/pages\/contracts_master_data\.face\?\S*?action_type=view&id=(\d+)&pms=(\w+)/g, 'NAV /crm/prospects/$1?action_type=view&pms=$2')
      .replace(/NAV \/triplesale\/pages\/contracts\.face\?\S*/g, 'NAV /crm/prospects')
      .replace(/NAV \/triplesale\/pages\/lead\.face\?\S*/g, 'NAV /crm/opportunities')
      // the images the Java stylesheet / script names relative to /pages/ are assets/images/ here
      .replace(/\.\.\/images\//g, 'assets/images/')
      // the inline position of the date picker panel is the layout position of its input in 1/64 px: one decimal
      .replace(/\b(top|left):(-?\d+\.\d{2,3})px/g, (_m, p, v) => `${p}:${Number(v).toFixed(1)}px`)
  );
}

/* ------------------------------------------------------------------------------------------------ the backend of the replica */
export async function newState({ delay }, ctx) {
  const m = await ctx.loadTs(BARREL);
  const backend = m.createMockProspectForm({ delayMs: delay });
  return { m, backend, initial: await backend.initial(), views: new Map() };
}

/** the descriptor of a view by its name */
const viewDesc = (name) => VIEWS.get(name);

/** the listener a request names: { listener, args, remote } */
function actionOf(v, q, source, behavior) {
  const r = v.last.r;
  const rc = r.remoteCommands.find((x) => x.id === source);
  if (rc) return { listener: rc.listener, args: rc.args ?? [], remote: true };
  if (behavior) {
    const w = r.widgets.find((x) => x.id === source);
    const b = w?.behaviors?.[behavior];
    if (b) return { listener: b.listener, args: b.args ?? [] };
    if (w?.ajax && (w.ajax.event || 'change') === behavior) return { listener: w.ajax.listener, args: [] };
  }
  const a = r.actions.find((x) => x.source === source && !!x.behavior === !!behavior && (!behavior || !x.event || x.event === behavior));
  return a ? { listener: a.listener, args: a.args ?? [] } : null;
}

/** the posted fields into the bean: a hidden field only carries a value to the page (phoneFormatJson) */
function applyValues(v, params, execute, formId) {
  const bindings = v.last.r.bindings.filter((b) => b.kind !== 'hidden');
  applyRequestValues({ ...v, last: { ...v.last, r: { ...v.last.r, bindings } } }, params, execute, formId);
}

/** `POST /triplesale/pages/<view>.face` — a PrimeFaces ajax request (partial response) */
async function ajaxPost(name, req, state, ctx) {
  const v = await sessionOf(DEPS, state, ctx, name);
  if (!v) return { status: 404, headers: {}, body: 'no view ' + name };
  const q = new URLSearchParams(req.body ?? '');
  const source = q.get('jakarta.faces.source') ?? '';
  const behavior = q.get('jakarta.faces.behavior.event');
  const execute = q.get('jakarta.faces.partial.execute') ?? '@all';
  const render = (q.get('jakarta.faces.partial.render') ?? '').split(/\s+/).filter(Boolean);
  const formId = v.last.r.bindings[0]?.id.split(':')[0] ?? 'form';
  if (process.env.PF_TRACE) console.error(`[pf-server] ${name} source=${source} behavior=${behavior} execute=${execute} render=${render.join(' ')}\n  body=${(req.body ?? '').slice(0, 500)}`);
  applyValues(v, q, execute, formId);
  const act = actionOf(v, q, source, behavior);
  const args = { validationFailed: false };
  if (act?.listener) {
    const fn = v.bean[act.listener];
    if (typeof fn !== 'function') return { status: 500, headers: {}, body: `no listener ${act.listener}` };
    // the parameters of the request (what PF.ab(… args) / a remote command sent): the listener reads them from the request parameter map
    v.bean.request = Object.fromEntries([...q.entries()].filter(([k]) => !k.startsWith('jakarta.faces.') && !k.startsWith('form:') && k !== 'form'));
    await fn.apply(v.bean, act.args);
  }
  const evals = v.bean.takeScripts();
  v.last = draw(ctx, state, v);
  const updates = [];
  for (const id of render) {
    if (id === '@none') continue;
    const html = id === '@all' || id === '@form' ? v.last.html : extractById(v.last.html, id);
    if (html === null) continue;
    updates.push([id, html + widgetScripts(v.last.r.widgets.filter((w) => html.includes(` id="${w.id}"`)))]);
  }
  return { status: 200, headers: { 'content-type': 'text/xml; charset=UTF-8', 'cache-control': 'no-cache' }, body: partialResponse(updates, args, evals) };
}

/** a view the server restores: the bean of the page (started like @PostConstruct) and the draw the browser holds */
async function makeView(d, state) {
  return { d, bean: await newBean(state.m, state.backend, d), last: null };
}

const DEPS = { views: { get: viewDesc }, draw, makeView };

// (every header the backend sets goes through: /docproxy says why it failed in X-DocProxy-Reason)
const asResponse = async (r) => ({ status: r.status, headers: { 'content-type': 'application/octet-stream', ...Object.fromEntries(r.headers.entries()) }, body: Buffer.from(await r.arrayBuffer()) });

export async function handle(req, state, ctx) {
  const { path } = req;
  if (path === '/__pf/components.css') return { status: 200, headers: { 'content-type': 'text/css; charset=utf-8' }, body: pfComponentsCss(ctx.javaRoot) };
  // the post of the form of a view: a PrimeFaces ajax request
  const view = /^\/triplesale\/pages\/(ptf-[\w.-]+)\.face$/.exec(path);
  if (view && req.method === 'POST') return ajaxPost(view[1], req, state, ctx);
  // a page load: the view starts again (a @ViewScoped bean per page)
  const pageGet = /^\/triplesale\/pages\/(ptf-[\w.-]+)\.xhtml$/.exec(path);
  if (pageGet && req.method === 'GET') state.views?.delete(pageGet[1]);
  // the BFF the page's scripts call (the servlets of the Java app), and /docproxy
  if (path.startsWith('/triplesale/board/') || path === '/triplesale/docproxy') {
    const init = { method: req.method, headers: req.headers, ...(req.method === 'GET' || req.method === 'HEAD' ? {} : { body: req.body }) };
    return asResponse(await state.backend.fetch(path.slice('/triplesale'.length) + req.search, init));
  }
  return null;
}

export const readBundleKeys = (ctx, lang) => readFileSync(`${ctx.ngRoot}/public/assets/i18n/${lang}.json`, 'utf8');
