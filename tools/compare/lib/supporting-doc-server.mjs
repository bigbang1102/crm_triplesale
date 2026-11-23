// The JSF lifecycle of the Java replica of the supporting-document pages: what the server did with a POST of the page's form.
//
// The browser side is REAL — PrimeFaces' own `PrimeFaces.ab` / widget scripts post to the action of the form (/triplesale/pages/<view>.face) and process the
// partial-response they get back. What stands in for Mojarra + PrimeFaces on the server:
//   restore view   the bean of the view (the SAME class the Angular host holds, over the SAME mock) and the component tree the browser holds (the last draw)
//   apply values   the posted fields of the components named by `execute` go into the bean through the bindings the draw recorded
//   invoke         the listener of the source (a p:commandButton / p:commandLink, a change behavior, a remote command)
//   render         the page is drawn again in java mode; the parts named by `render` go back as `<update>`, with the `PrimeFaces.cw` of their widgets after them
// Everything the page's markup says (which listener, which parts) comes from the draw (tools/lib/pf-dom.mjs), not from this file.

/* ------------------------------------------------------------------------------------------------ fragments of the drawn page */
const VOID = new Set(['area', 'base', 'br', 'col', 'embed', 'hr', 'img', 'input', 'link', 'meta', 'source', 'track', 'wbr']);
const TAG = /<(\/?)([a-zA-Z][\w:-]*)((?:[^>"']|"[^"]*"|'[^']*')*?)(\/?)>/g;

/** the outer HTML of the element with this id (the first), or null */
export function extractById(html, id) {
  const needle = new RegExp(`<([a-zA-Z][\\w:-]*)\\b(?:[^>"']|"[^"]*"|'[^']*')*?\\sid="${id.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}"`);
  const m = needle.exec(html);
  if (!m) return null;
  const name = m[1];
  const start = m.index;
  if (VOID.has(name.toLowerCase())) return html.slice(start, html.indexOf('>', start) + 1);
  TAG.lastIndex = start;
  let depth = 0;
  for (let t = TAG.exec(html); t; t = TAG.exec(html)) {
    if (t[2] !== name) {
      if (t[2] === 'script' && !t[1] && !t[4]) {
        const close = html.indexOf('</script>', TAG.lastIndex);
        if (close < 0) return null;
        TAG.lastIndex = close + '</script>'.length;
      }
      continue;
    }
    if (t[1]) {
      if (--depth === 0) return html.slice(start, TAG.lastIndex);
    } else if (!t[4] && !VOID.has(name.toLowerCase())) depth++;
  }
  return null;
}

const cdata = (s) => `<![CDATA[${s.replace(/\]\]>/g, ']]]]><![CDATA[>')}]]>`;

/** a JSF partial-response */
export function partialResponse(updates, args, evals = []) {
  const changes = updates.map(([id, html]) => `<update id="${id}">${cdata(html)}</update>`).join('');
  // (PrimeFaces.current().executeScript(js): <eval> after the updates and the view state, before the args extension)
  const scripts = evals.map((js) => `<eval>${cdata(js)}</eval>`).join('');
  return (
    `<?xml version='1.0' encoding='UTF-8'?>\n<partial-response id="j_id1"><changes>${changes}` +
    `<update id="j_id1:jakarta.faces.ViewState:0">${cdata('ViewState')}</update>${scripts}` +
    `<extension ln="primefaces" type="args">${cdata(JSON.stringify(args))}</extension></changes></partial-response>`
  );
}

/** a multipart/form-data body (the file upload of PrimeFaces): { params: URLSearchParams, files: [{ name, filename, type, content }] } — the body arrives as a utf8 string */
export function parseMultipart(body, contentType) {
  const m = /boundary=(?:"([^"]+)"|([^;]+))/i.exec(contentType ?? '');
  if (!m) return { params: new URLSearchParams(), files: [] };
  const boundary = `--${m[1] ?? m[2]}`;
  const params = new URLSearchParams();
  const files = [];
  for (const part of body.split(boundary).slice(1)) {
    if (part.startsWith('--')) break;
    const at = part.indexOf('\r\n\r\n');
    const head = part.slice(0, at);
    const content = part.slice(at + 4).replace(/\r\n$/, '');
    const name = /name="([^"]*)"/.exec(head)?.[1] ?? '';
    const filename = /filename="([^"]*)"/.exec(head)?.[1];
    if (filename !== undefined) files.push({ name, filename, type: /content-type:\s*([^\r\n]+)/i.exec(head)?.[1].trim() ?? 'application/octet-stream', content });
    else params.append(name, content);
  }
  return { params, files };
}

/* ------------------------------------------------------------------------------------------------ the view */
/**
 * The state of a view in this session: its bean and the draw the browser holds.
 * @param deps  { views: Map name → descriptor, draw(ctx, state, view) → { r, html } }
 */
export async function sessionOf(deps, state, ctx, name) {
  state.views ??= new Map();
  let v = state.views.get(name);
  if (v) return v;
  const d = deps.views.get(name);
  if (!d) return null;
  if (deps.makeView) {
    // another family of pages (the prospect form): it builds the bean of the view itself; { d, bean, last } is all this file needs of it
    v = await deps.makeView(d, state, ctx);
    v.last = deps.draw(ctx, state, v);
    state.views.set(name, v);
    return v;
  }
  const m = state.m;
  const type = m.SUPPORTING_DOC_TYPES.find((x) => x.slug === d.t);
  let bean;
  if (d.kind === 'form') {
    bean = new m.SupportingFormBean(type, d.mode, state.svc, () => {}, () => '2026-10-20');
    await bean.init(d.mode === 'add' ? undefined : String(m.mockDocId(type.n, d.k)));
  } else {
    bean = new m.SupportingListBean(type, state.svc, () => {});
    await bean.init();
  }
  v = { d, bean, type, last: null };
  v.last = deps.draw(ctx, state, v);
  state.views.set(name, v);
  return v;
}

/* ------------------------------------------------------------------------------------------------ apply request values */
/** the components a `jakarta.faces.partial.execute` names: does it reach the binding (`id` is the input, a select's / calendar's `_input`)? */
function reaches(v, exec, formId, b) {
  if (exec.has('@all') || exec.has(formId) || exec.size === 0) return true;
  const comp = b.id.replace(/_input$/, '');
  if (exec.has(comp) || exec.has(b.id)) return true;
  for (const e of exec) {
    if (e.startsWith('@')) continue;
    const part = extractById(v.last.html, e);
    if (part && part.includes(` id="${b.id}"`)) return true;
  }
  return false;
}

/** lays the posted values into the bean (the decode + validate + update model phases for the components of `execute`) */
export function applyRequestValues(v, params, execute, formId) {
  const exec = new Set(execute.split(/\s+/).filter(Boolean));
  for (const b of v.last.r.bindings) {
    if (!reaches(v, exec, formId, b)) continue;
    if (b.kind === 'checkbox') v.bean.assign(b.value, params.has(b.id), b.kind);
    else if (params.has(b.id)) v.bean.assign(b.value, params.get(b.id), b.kind);
  }
}

/* ------------------------------------------------------------------------------------------------ invoke */
/** the listener the request names: { call(): Promise<args> } */
function actionOf(v, params, source, behavior) {
  const last = v.last.r;
  if (behavior) {
    const w = last.widgets.find((x) => x.id === source && x.ajax);
    if (w) return { listener: w.ajax.listener, args: [], render: undefined };
  }
  const rc = last.remoteCommands.find((x) => x.id === source);
  if (rc) return { listener: rc.listener, remote: true, args: [String(params.get('key') ?? ''), Number.parseInt(String(params.get('page') ?? '0'), 10) || 0, String(params.get('gen') ?? '0')] };
  const a = last.actions.find((x) => x.source === source);
  if (!a) return null;
  // the id of a button in a row of a ui:repeat: …:<repeat>:<index>:<id>
  const row = /:(\d+):[^:]+$/.exec(source);
  return { listener: a.listener, args: a.rowArg && row ? [Number(row[1])] : [], submit: a.submit, upload: a.upload };
}

/**
 * Handles `POST /triplesale/pages/<view>.face` — a PrimeFaces ajax request (partial response) — and returns { status, headers, body }.
 */
export async function ajaxPost(deps, name, req, state, ctx) {
  const v = await sessionOf(deps, state, ctx, name);
  if (!v) return { status: 404, headers: {}, body: 'no view ' + name };
  const contentType = String(req.headers?.['content-type'] ?? '');
  const mp = /^multipart\/form-data/i.test(contentType) ? parseMultipart(req.body ?? '', contentType) : null;
  const q = mp ? mp.params : new URLSearchParams(req.body ?? '');
  const source = q.get('jakarta.faces.source') ?? '';
  const behavior = q.get('jakarta.faces.behavior.event');
  const execute = q.get('jakarta.faces.partial.execute') ?? '@all';
  const render = (q.get('jakarta.faces.partial.render') ?? '').split(/\s+/).filter(Boolean);
  const formId = v.last.r.bindings[0]?.id.split(':')[0] ?? 'quotationForm';

  if (process.env.SD_TRACE) console.error(`[sd-server] ${name} source=${source} behavior=${behavior} execute=${execute} render=${render.join(' ')}\n  body=${(req.body ?? '').slice(0, 600)}`);
  applyRequestValues(v, q, execute, formId);
  const act = actionOf(v, q, source, behavior);
  const args = { validationFailed: false };
  if (act?.listener) {
    const fn = v.bean[act.listener];
    if (typeof fn !== 'function') return { status: 500, headers: {}, body: `no listener ${act.listener}` };
    if (act.upload) {
      // p:fileUpload: the listener gets each file of the request (a FileUploadEvent)
      for (const f of mp?.files ?? []) await fn.call(v.bean, { name: f.filename, type: f.type, size: Buffer.byteLength(f.content), blob: new Blob([f.content], { type: f.type }) });
    } else {
      const res = await fn.apply(v.bean, act.args);
      if (act.remote) args.prosJson = JSON.stringify(res);
    }
  }
  v.bean.messages?.splice?.(0);
  v.last = deps.draw(ctx, state, v);

  const updates = [];
  for (const id of render) {
    if (id === '@none') continue;
    const html = id === '@all' || id === '@form' ? v.last.html : extractById(v.last.html, id);
    if (html === null) continue;
    updates.push([id, html + deps.widgetScripts(v.last.r.widgets.filter((w) => w.type !== 'Growl' && (html.includes(` id="${w.id}"`))))]);
  }
  return { status: 200, headers: { 'content-type': 'text/xml; charset=UTF-8', 'cache-control': 'no-cache' }, body: partialResponse(updates, args) };
}

/* ------------------------------------------------------------------------------------------------ the post of the form (ajax="false")                  */
/**
 * Handles a plain `POST /triplesale/pages/<view>.face` (the submit button of the form, `p:commandButton ajax="false"`): the whole form is applied, the action
 * runs; a `redirect` outcome is a 302 to the list (the messages travel as a flash), anything else draws the same view again (a whole document).
 * @param deps  { views, draw, page(ctx, state, v, messages) → html, listUrl(d) → url }
 */
export async function formPost(deps, name, req, state, ctx) {
  const v = await sessionOf(deps, state, ctx, name);
  if (!v) return { status: 404, headers: {}, body: 'no view ' + name };
  const q = new URLSearchParams(req.body ?? '');
  const formId = v.last.r.bindings[0]?.id.split(':')[0] ?? 'quotationForm';
  if (process.env.SD_TRACE) console.error(`[sd-server] POST ${name} submit=${[...q.keys()].filter((k) => k.startsWith(formId + ':') && !k.includes('_input')).join(',')}`);
  applyRequestValues(v, q, '@all', formId);
  const act = v.last.r.actions.find((a) => a.submit && q.has(a.source));
  let messages = [];
  if (act?.listener) {
    const res = await v.bean[act.listener]();
    messages = [...(res?.messages ?? [])]; // (a copy: the bean's own list is emptied when the request ends)
    if (res?.redirect) {
      state.flash = messages;
      state.saved = true;
      state.views.delete(name); // (the view is left: the next visit starts a new one)
      return { status: 302, headers: { location: deps.listUrl(v.d, v.type) }, body: '' };
    }
  }
  if (process.env.SD_TRACE) console.error(`[sd-server] ${name} stays: ${JSON.stringify(messages)}`);
  v.bean.messages?.splice?.(0);
  v.last = deps.draw(ctx, state, v);
  const html = deps.page(ctx, state, v, messages);
  if (process.env.SD_TRACE) console.error(`[sd-server] growl: ${(/PrimeFaces\.cw\("Growl"[^;]*;/.exec(html) ?? ['none'])[0].slice(0, 400)}`);
  return { status: 200, headers: { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store' }, body: html };
}

/* ------------------------------------------------------------------------------------------------ DocAttachServlet                                    */
/** `GET /docattach?i=&action=view|download` (a file of the document the browser holds) and `POST …?action=describe&i=` (its description) */
export async function docAttach(deps, req, state, ctx) {
  const url = new URL(req.path + req.search, 'http://x');
  // the servlet reads the document from the session's view: the page that asked is the one named by the Referer
  const name = /\/pages\/(sdf-[\w.-]+)\.(?:xhtml|face)/.exec(String(req.headers?.referer ?? ''))?.[1];
  const v = name ? await sessionOf(deps, state, ctx, name) : null;
  const i = Number.parseInt(url.searchParams.get('i') ?? '', 10);
  const file = Number.isNaN(i) || !v ? undefined : v.bean.localFile(i);
  const json = (status) => ({ status: 200, headers: { 'content-type': 'application/json; charset=UTF-8' }, body: JSON.stringify({ status }) });
  if (req.method === 'POST') {
    if (url.searchParams.get('action') !== 'describe') return json(400);
    if (!file) return json(404);
    file.description = new URLSearchParams(String(req.body ?? '')).get('text') ?? '';
    return json(200);
  }
  if (!file?.content || file.content.size === 0) return { status: 404, headers: { 'content-type': 'text/plain; charset=utf-8' }, body: 'attachment not found' };
  const disposition = url.searchParams.get('action') === 'download' ? 'attachment' : 'inline';
  return {
    status: 200,
    headers: { 'content-type': file.contentType || 'application/octet-stream', 'content-disposition': `${disposition}; filename*=UTF-8''${encodeURIComponent(file.filename)}` },
    body: Buffer.from(await file.content.arrayBuffer()),
  };
}
