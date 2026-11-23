/**
 * The markup the server (Mojarra 4 + PrimeFaces 14.0.7, theme pandora-bluegrey) writes for the JSF components the supporting-document
 * pages use — see tools/lib/jsf.mjs. Written from the widgets' own JavaScript (web/resources of primefaces-14.0.7-jakarta.jar: what
 * `SelectOneMenu.init`, `Calendar.init`, … look for in the DOM) and the page's stylesheets, NOT copied from a real server answer: there is no
 * running server to copy from (see docs/integration/supporting-docs.md). A class or attribute that differs from the real server's shows up
 * as a visual difference against the Java page, not as a failing comparison — both sides of the comparison are written by this file.
 *
 * Each component writes:
 *   java mode   the HTML (with the PrimeFaces ajax plumbing `onclick="PrimeFaces.ab({…})"` of the real server);
 *   ng mode     the same HTML where the plumbing is replaced by Angular bindings: `(click)="ab(…)"`, `[attr.value]`, `[disabled]`.
 * Widgets that PrimeFaces starts with `PrimeFaces.cw('Type','widget_id',{cfg})` are recorded in `R.widgets` ({ type, id, cfg }).
 */
const VOID = new Set(['img', 'input', 'br', 'hr', 'meta', 'link']);
const elementsOf = (el) => el.children.filter((c) => c.type === 'el');
const A = (el, name) => el.attrs.find((a) => a.name === name)?.raw;

/** the PrimeFaces widget id of a client id: `quotationForm:sd1RcvBy` → `widget_quotationForm_sd1RcvBy` */
export const widgetVar = (clientId) => `widget_${clientId.replace(/[^\w]/g, '_')}`;

/**
 * Where the markup of the components added for the prospect form (p:datePicker, p:dialog, p:selectOneRadio, h:inputHidden, h:outputLabel, the `class`
 * alias, the nested `p:ajax` behaviours of the buttons) comes from — read from the CLASS FILES of the Java project's own jars, with `javap -c`:
 *   primefaces-14.0.7-jakarta.jar  DatePickerRenderer · BaseCalendarRenderer · DialogRenderer · SelectOneRadioRenderer · CommandButtonRenderer ·
 *                                  CoreRenderer (buildDomEvent, encodeClientBehaviors) · AjaxBehaviorRenderer · AjaxRequestBuilder · WidgetBuilder
 *   jakarta.faces-4.0.7.jar        HiddenRenderer · LabelRenderer · GroupRenderer · FormRenderer · HtmlComponentHandler (`class` → `styleClass`, h: only)
 * so the element names, the attributes (and their order) and the widget configuration keys are those the renderers write; what a renderer computes
 * from the environment (the locale's AM/PM strings, `isTouchable`) is an assumption and says so where it is made.
 */

/** the components that ask for a generated id (`j_idtN`) when the page gives none: the numbering must not depend on `rendered` (see createRenderer) */
const ID_TAGS = new Set([
  'p:inputText', 'p:inputTextarea', 'p:outputLabel', 'p:calendar', 'p:datePicker', 'p:selectOneMenu', 'p:selectOneRadio', 'p:selectBooleanCheckbox',
  'p:commandButton', 'p:commandLink', 'p:linkButton', 'p:fileUpload', 'p:remoteCommand', 'p:dialog', 'h:inputHidden',
]);
export const needsGeneratedId = (el) => ID_TAGS.has(el.name) && A(el, 'id') === undefined;

/**
 * `class` is an alias of `styleClass` on the h: components only (Mojarra's HtmlComponentHandler: `MetaRuleset.alias("class", "styleClass")`); on the p:
 * components PrimeFaces' own tag handlers have no alias — `class="…"` is stored in the attributes map and nothing writes it.
 */
function styleClassOf(R, el, scope) {
  const given = valOf(R, el, 'styleClass', scope);
  if (given !== undefined || !el.name.startsWith('h:')) return given;
  return valOf(R, el, 'class', scope);
}

/** `#{bean.method(args)}` → { name, args: [literals], row?: the name of a row variable } (`removeFile(file)`: the argument is the row of a ui:repeat) */
export function callOf(raw) {
  const s = (raw ?? '').trim().replace(/^#\{\s*[A-Za-z_]\w*\./, '').replace(/\s*\}$/, '');
  const m = /^(\w+)\((.*)\)$/s.exec(s);
  if (!m) return { name: s || undefined, args: [] };
  const inner = m[2].trim();
  if (inner === '') return { name: m[1], args: [] };
  if (/^[A-Za-z_]\w*$/.test(inner) && !['true', 'false', 'null'].includes(inner)) return { name: m[1], args: [], row: inner };
  const lit = (x) => {
    const q = /^'(.*)'$/s.exec(x) ?? /^"(.*)"$/s.exec(x);
    if (q) return q[1];
    if (/^-?\d+(\.\d+)?$/.test(x)) return Number(x);
    if (x === 'true' || x === 'false') return x === 'true';
    if (x === 'null') return null;
    throw new Error(`jsf: an argument of a listener the generator cannot read: ${x}`);
  };
  return { name: m[1], args: inner.split(/\s*,\s*/).map(lit) };
}

/**
 * `process=` / `update=` of a component as the author wrote them, resolved to client ids but with the keywords kept (`@this` `@form` `@none` `@all` stay): what the
 * records of remote commands hold (a keyword means something to the one who plays the request; `ctMdDocPanel` → `form:ctMdDocPanel`, `form:x` stays, `:x` loses its colon)
 */
function clientIdsKeepingKeywords(s, form) {
  return idList(s)
    .map((x) => (x.startsWith('@') ? x : x.startsWith(':') ? x.slice(1) : form && x.startsWith(`${form.id}:`) ? x : form ? `${form.id}:${x}` : x))
    .join(' ');
}

/**
 * The ids a page's ajax actions re-draw (the last segment of every `update` id: `form:ctMdDocPanel` → `ctMdDocPanel`) — of the recorded actions (a button's own request, a
 * behaviour), of the widgets' behaviours (`widgets[].ajax`, `widgets[].behaviors`) and of the remote commands: the `updateTargets` of createRenderer.
 */
export function updateTargetIds({ actions = [], widgets = [], remoteCommands = [] }) {
  const out = new Set();
  const add = (s) => idList(s).filter((x) => !x.startsWith('@')).forEach((x) => out.add(x.split(':').pop()));
  for (const a of actions) add(a.update);
  for (const w of widgets) {
    if (w.ajax) add(w.ajax.update);
    for (const b of Object.values(w.behaviors ?? {})) add(b.update);
  }
  for (const c of remoteCommands) add(c.update);
  return out;
}

/** the ids of `process=` / `update=`: space or comma separated (PrimeFaces' search expressions accept both) */
const idList = (s) => (s ?? '').trim().split(/[\s,]+/).filter(Boolean);

/* ------------------------------------------------------------------------------------------------ small helpers */
const cls = (...parts) => parts.filter(Boolean).join(' ');
const SP = (s) => (s ? ` ${s}` : '');

/** ` name="value"` — a Dyn value is a sentinel (written as a binding by the final pass); null / false = no attribute */
function at(R, name, value) {
  if (value === null || value === undefined || value === false) return '';
  if (value === true) return ` ${name}`;
  return ` ${name}="${typeof value === 'string' ? value : R.out(value)}"`;
}

/** an attribute value (EL allowed) of a component as markup-safe text, undefined when it is not there */
function attrOf(R, el, name, scope) {
  const raw = A(el, name);
  return raw === undefined ? undefined : R.attrText(raw, scope);
}

/** the value of an attribute as a value (static string or Dyn) */
function valOf(R, el, name, scope) {
  const raw = A(el, name);
  return raw === undefined ? undefined : R.strOf(raw, scope);
}

/** `<tag attrs>inner</tag>` */
function tag(name, attrs, inner = '') {
  return VOID.has(name) ? `<${name}${attrs}/>` : `<${name}${attrs}>${inner}</${name}>`;
}

/** client id of a component: `form:id` inside a form, the explicit id or a generated one (and the id of a row in a ui:repeat) */
function clientId(R, el, form, scope, force = false) {
  const given = A(el, 'id');
  const id = given ?? (force ? R.nextId(el) : undefined);
  if (id === undefined) return undefined;
  const rows = scope.get('__rows') ?? '';
  return `${form ? `${form.id}:` : ''}${rows}${id}`;
}

/** the id of an `update="a b"` target resolved to a client id (as PrimeFaces.ab writes it): relative ids stay relative, `:x:y` loses its colon */
const updateIds = (s) => idList(s).map((x) => x.replace(/^:/, '')).join(' ');

/**
 * `process=` / `update=` as the PrimeFaces CLIENT wants them in `PrimeFaces.ab({p:…,u:…})`: the client does not resolve relative ids (the server did, writing
 * client ids): `sdTableWrap` is `quotationForm:sdTableWrap`, `@this` the source, `@form` the form; `@all` / `@none` stay.
 */
function clientIds(s, form, source) {
  return idList(s)
    .map((x) => {
      if (x === '@this') return source;
      if (x === '@form') return form ? form.id : '@all';
      if (x.startsWith('@')) return x;
      if (x.startsWith(':')) return x.slice(1);
      // `form:confirmationDialogPros` written in the page: PrimeFaces finds it from the form up, and writes the client id it found — the same text
      if (form && x.startsWith(`${form.id}:`)) return x;
      return form ? `${form.id}:${x}` : x;
    })
    .join(' ');
}

/** a part of the page an ajax action re-draws (`update=`): in the Angular template it is re-created when the host bumps `upd(id)` */
function keyed(R, el, html) {
  let key = A(el, 'id');
  // (pfStrict: a component the author gave no id is updated by the id JSF generated for it — `update="@this"` of an input: form:j_idt20)
  if (!key && R.o.pfStrict) key = /^<[a-zA-Z][\w-]*(?:[^>"']|"[^"]*"|'[^']*')*?\sid="([^"]+)"/.exec(html)?.[1]?.split(':').pop();
  return R.mode === 'ng' && key && R.o.updateTargets?.has(key) ? `@for (_k of [upd('${key}')]; track _k) {${html}}` : html;
}

/* ------------------------------------------------------------------------------------------------ the dispatcher */
export function pfComponent(R, el, scope, form) {
  noteIgnoredAttrs(R, el);
  switch (el.name) {
    case 'h:form': return hForm(R, el, scope);
    case 'h:panelGroup': return panelGroup(R, el, scope, form);
    case 'h:outputText': return outputText(R, el, scope, form);
    case 'h:outputLabel': return hOutputLabel(R, el, scope, form);
    case 'h:inputHidden': return inputHidden(R, el, scope, form);
    case 'h:link': return hLink(R, el, scope, form);
    case 'f:param': case 'f:convertDateTime': case 'f:selectItem': case 'f:selectItems': return ''; // read by their parent
    case 'p:growl': return growl(R, el, scope, form);
    case 'p:inputText': return inputText(R, el, scope, form);
    case 'p:inputTextarea': return inputTextarea(R, el, scope, form);
    case 'p:outputLabel': return outputLabel(R, el, scope, form);
    case 'p:calendar': return calendar(R, el, scope, form);
    case 'p:datePicker': return datePicker(R, el, scope, form);
    case 'p:selectOneMenu': return selectOneMenu(R, el, scope, form);
    case 'p:selectOneRadio': return selectOneRadio(R, el, scope, form);
    case 'p:selectBooleanCheckbox': return checkbox(R, el, scope, form);
    case 'p:commandButton': return commandButton(R, el, scope, form);
    case 'p:commandLink': return commandLink(R, el, scope, form);
    case 'p:linkButton': return linkButton(R, el, scope, form);
    case 'p:fileUpload': return fileUpload(R, el, scope, form);
    case 'p:remoteCommand': return remoteCommand(R, el, scope, form);
    case 'p:dialog': return dialog(R, el, scope, form);
    case 'p:ajax': return ''; // read by its parent
    default: throw new Error(`jsf: <${el.name}> is not supported`);
  }
}

/* ------------------------------------------------------------------------------------------------ attributes the renderers do not read */
/**
 * The attributes each renderer below reads (a component not listed is not checked). An attribute of the page that is not in its list is recorded in
 * `R.ignoredAttrs` ({ tag, attr, value }): the real renderer may read it (the markup is then wrong) or ignore it on purpose (`class` on a p: component).
 */
const KNOWN_ATTRS = {
  'h:form': ['id', 'rendered', 'styleClass', 'class', 'style'],
  'h:panelGroup': ['id', 'rendered', 'layout', 'styleClass', 'class', 'style'],
  'h:outputText': ['id', 'rendered', 'value', 'styleClass', 'class', 'style'],
  'h:outputLabel': ['id', 'rendered', 'value', 'for', 'styleClass', 'class', 'style', 'title', 'escape'],
  'h:inputHidden': ['id', 'rendered', 'value'],
  'p:inputText': ['id', 'rendered', 'value', 'styleClass', 'style', 'maxlength', 'placeholder'],
  'p:outputLabel': ['id', 'rendered', 'value', 'styleClass', 'style', 'for'],
  'p:datePicker': ['id', 'rendered', 'value', 'locale', 'pattern', 'showIcon', 'showOnFocus', 'monthNavigator', 'yearNavigator', 'styleClass', 'style', 'appendTo'],
  'p:selectOneMenu': ['id', 'rendered', 'value', 'filter', 'filterMatchMode', 'filterPlaceholder', 'style', 'appendTo', 'widgetVar'],
  'p:selectOneRadio': ['id', 'rendered', 'value', 'layout', 'styleClass', 'style', 'onchange'],
  'p:commandButton': ['id', 'rendered', 'value', 'icon', 'title', 'type', 'ajax', 'styleClass', 'style', 'disabled', 'onclick', 'actionListener', 'action', 'process', 'update', 'onstart', 'onsuccess', 'oncomplete', 'onerror'],
  'p:commandLink': ['id', 'rendered', 'styleClass', 'style', 'actionListener', 'action', 'process', 'update', 'onstart', 'onsuccess', 'oncomplete', 'onerror'],
  'p:dialog': ['id', 'rendered', 'widgetVar', 'draggable', 'modal', 'closable', 'width', 'styleClass', 'style', 'appendTo'],
  'p:remoteCommand': ['id', 'rendered', 'name', 'process', 'update', 'actionListener', 'oncomplete', 'onerror', 'global'],
};
function noteIgnoredAttrs(R, el) {
  const known = KNOWN_ATTRS[el.name];
  if (!known || !R.ignoredAttrs) return;
  for (const a of el.attrs) if (!known.includes(a.name)) R.ignoredAttrs.push({ tag: el.name, attr: a.name, value: a.raw });
}

/* ------------------------------------------------------------------------------------------------ h: */
function hForm(R, el, scope) {
  const id = A(el, 'id');
  const f = { id };
  const body = () => {
    const hidden = `<input type="hidden" name="${id}" value="${id}"/>`;
    const vs = `<input type="hidden" name="jakarta.faces.ViewState" id="j_id1:jakarta.faces.ViewState:0" value="ViewState" autocomplete="off"/>`;
    // FormRenderer.encodeBegin: id · name · method · action · class (styleClass) · accept-charset · the pass-through attributes (style, enctype …)
    const attrs = ` id="${id}" name="${id}" method="post" action="${R.o.formAction ?? '#'}"${at(R, 'class', styleClassOf(R, el, scope))}${at(R, 'style', valOf(R, el, 'style', scope))} enctype="application/x-www-form-urlencoded"`;
    return tag('form', attrs + (R.mode === 'ng' ? ' (submit)="onSubmit($event)"' : ''), hidden + R.renderChildren(el, scope, f) + vs);
  };
  return R.withRendered(el, scope, body);
}

function panelGroup(R, el, scope, form) {
  return R.withRendered(el, scope, () => {
    const id = clientId(R, el, form, scope);
    const block = A(el, 'layout') === 'block';
    const styleClass = styleClassOf(R, el, scope);
    const style = valOf(R, el, 'style', scope);
    const inner = R.renderChildren(el, scope, form);
    if (!block && id === undefined && !styleClass && !style) return inner;
    return keyed(R, el, tag(block ? 'div' : 'span', at(R, 'id', id) + at(R, 'class', styleClass) + at(R, 'style', style), inner));
  });
}

function outputText(R, el, scope, form) {
  return R.withRendered(el, scope, () => {
    let v = R.valueOf(A(el, 'value') ?? '', scope);
    const conv = elementsOf(el).find((c) => c.name === 'f:convertDateTime');
    if (conv) {
      // a Date shown with a pattern: the bean holds yyyy-MM-dd texts, the pattern is dd/MM/yyyy
      if (A(conv, 'pattern') !== 'dd/MM/yyyy') throw new Error('jsf: f:convertDateTime pattern other than dd/MM/yyyy');
      v = R.isDyn(v) ? new R.Dyn(`vd(${v.js})`) : R.o.viewDate(v);
    }
    const text = R.out(v === null || v === undefined ? '' : v);
    const styleClass = styleClassOf(R, el, scope);
    const style = valOf(R, el, 'style', scope);
    const id = clientId(R, el, form, scope);
    return styleClass || style || id ? tag('span', at(R, 'id', id) + at(R, 'class', styleClass) + at(R, 'style', style), text) : text;
  });
}

/** `f:param` children → [name, value (static or Dyn)] (a param whose value is null is left out, as the server does) */
function paramsOf(R, el, scope) {
  return elementsOf(el).filter((c) => c.name === 'f:param').map((c) => [A(c, 'name'), R.strOf(A(c, 'value') ?? '', scope)]);
}

/** the target of an outcome: java = the page address; ng = the route of this app (`o.linkTarget`) */
function linkHref(R, outcome, params) {
  const page = outcome.replace(/^\/pages\//, '').replace(/\.xhtml$/, '');
  const live = params.filter(([, v]) => !(v === '' || v === null || v === undefined));
  return R.o.linkTarget(page, live, R);
}

function hLink(R, el, scope, form) {
  return R.withRendered(el, scope, () => {
    const params = paramsOf(R, el, scope);
    const href = linkHref(R, A(el, 'outcome'), params);
    const inner = elementsOf(el).length || el.children.some((c) => c.type === 'text' && c.raw.trim()) ? R.renderChildren(el, scope, form).replace(/^\s+|\s+$/g, '') : '';
    return tag('a', at(R, 'href', href) + at(R, 'class', valOf(R, el, 'styleClass', scope)) + at(R, 'style', valOf(R, el, 'style', scope)), inner);
  });
}

/* ------------------------------------------------------------------------------------------------ p: simple */
function growl(R, el, scope, form) {
  const id = clientId(R, el, form, scope);
  // the widget draws its own container into <body> (PrimeFaces.widget.Growl.init): the page itself has nothing for it
  R.widgets.push({ type: 'Growl', id, cfg: { id, sticky: A(el, 'sticky') === 'true', life: Number(A(el, 'life') ?? 6000), escape: A(el, 'escape') !== 'false', showDetail: A(el, 'showDetail') === 'true' } });
  return '';
}

function inputTextarea(R, el, scope, form) {
  const id = clientId(R, el, form, scope, true);
  const bind = A(el, 'value');
  const v = bind === undefined ? '' : R.strOf(bind, scope);
  if (bind !== undefined) R.bindings?.push({ id, value: bind, kind: 'text' });
  const style = valOf(R, el, 'style', scope);
  const resize = A(el, 'autoResize') === 'false' ? '' : ' ui-inputtextarea-resizable';
  const attrs = ` id="${id}" name="${id}" cols="20" rows="3"${at(R, 'style', style)} class="ui-inputfield ui-inputtextarea ui-widget ui-state-default ui-corner-all${resize}"`;
  if (R.mode === 'ng') return tag('textarea', `${attrs} [value]="${R.dynJs(v, true)}"`, `${R.out(v)}`);
  return tag('textarea', attrs, R.out(v));
}

/* ------------------------------------------------------------------------------------------------ DOM events with behaviours */
/** the DOM event a behaviour is written on (`valueChange` is the `change` of an input, `action` the `click` of a button) */
const DOM_EVENT = (e) => (e === 'valueChange' ? 'change' : e === 'action' ? 'click' : e);

/**
 * The inline DOM-event attributes of a component that has behaviours (CoreRenderer.renderDomEvents → buildDomEvent): java writes
 * ` onchange="PrimeFaces.ab({s:…,e:…,f:…,p:…,u:…});"` (several scripts of one event are chained by `PrimeFaces.bcn`), ng the Angular statement ` (change)="ab(…)"`.
 * `user`: the page's own script for the event (`onchange="ctApplyTypeUI();"`), written first.
 */
function eventAttrs(R, behaviors, scope, form, user = {}) {
  const byEvent = new Map();
  for (const b of behaviors) {
    const e = DOM_EVENT(b.event);
    byEvent.set(e, [...(byEvent.get(e) ?? []), b]);
  }
  for (const e of Object.keys(user)) if (user[e] && !byEvent.has(e)) byEvent.set(e, []); // (the page's own script of an event that has no behaviour)
  let s = '';
  for (const [e, list] of byEvent) {
    if (R.mode === 'java') {
      const chain = [...(user[e] ? [user[e]] : []), ...list.map((b) => behaviorScript(R, b, scope, form, '&quot;', '});'))];
      s += ` on${e}="${chain.length === 1 ? chain[0] : `PrimeFaces.bcn(this,event,[${chain.map((x) => `function(event){${x}}`).join(',')}]);`}"`;
    } else {
      s += ` (${e})="${list.map((b) => behaviorBinding(R, b, scope)).join('; ')}"`;
    }
  }
  return s;
}

/* ------------------------------------------------------------------------------------------------ p:inputText */
function inputText(R, el, scope, form) {
  return R.withRendered(el, scope, () => {
    const id = clientId(R, el, form, scope, true);
    const bind = A(el, 'value');
    const v = bind === undefined ? '' : R.strOf(bind, scope);
    if (bind !== undefined) R.bindings?.push({ id, value: bind, kind: 'text' });
    const styleClass = valOf(R, el, 'styleClass', scope);
    const style = valOf(R, el, 'style', scope);
    const behaviors = behaviorsOf(R, el, scope, form, id, 'change');
    for (const b of behaviors) recordBehavior(R, b, scope);
    const events = eventAttrs(R, behaviors, scope, form);
    // InputTextRenderer: the pass-through attributes (HTML.INPUT_TEXT_ATTRS_WITHOUT_EVENTS: maxlength · placeholder … in this order) after the class, the DOM events last
    const pass = (A(el, 'maxlength') !== undefined ? ` maxlength="${attrOf(R, el, 'maxlength', scope)}"` : '') + (A(el, 'placeholder') !== undefined ? ` placeholder="${attrOf(R, el, 'placeholder', scope)}"` : '');
    const base = ` id="${id}" name="${id}" type="text"`;
    if (R.mode === 'ng') return keyed(R, el, tag('input', `${base} [attr.value]="${R.dynJs(v, true)}" [value]="${R.dynJs(v, true)}"${at(R, 'style', style)} class="${cls('ui-inputfield ui-inputtext ui-widget ui-state-default ui-corner-all', typeof styleClass === 'string' ? styleClass : '')}"${pass}${events}`));
    return keyed(R, el, tag('input', `${base} value="${R.out(v)}"${at(R, 'style', style)} class="${cls('ui-inputfield ui-inputtext ui-widget ui-state-default ui-corner-all', styleClass)}"${pass}${events}`));
  });
}

/* ------------------------------------------------------------------------------------------------ p:outputLabel / h:outputLabel / h:inputHidden */
/**
 * OutputLabelRenderer.encodeEnd: `<label id class="ui-outputlabel ui-widget [styleClass]" [for]><span class="ui-outputlabel-label">text</span></label>`.
 * The older spelling of this file wrote the text without the span and ignored `styleClass`; `o.outputLabelSpan` (or `o.pfStrict`, which the prospect form sets) writes what PrimeFaces writes.
 */
function outputLabel(R, el, scope, form) {
  return R.withRendered(el, scope, () => {
    const id = clientId(R, el, form, scope, true);
    const text = R.out(R.strOf(A(el, 'value') ?? '', scope));
    const style = valOf(R, el, 'style', scope);
    if (!(R.o.outputLabelSpan ?? R.o.pfStrict)) return tag('label', ` id="${id}" class="ui-outputlabel ui-widget"${at(R, 'style', style)}`, text);
    const styleClass = valOf(R, el, 'styleClass', scope);
    const forId = A(el, 'for') === undefined ? undefined : `${form ? `${form.id}:` : ''}${A(el, 'for')}`;
    return tag('label', ` id="${id}" class="${cls('ui-outputlabel ui-widget', typeof styleClass === 'string' ? styleClass : '')}"${at(R, 'for', forId)}${at(R, 'style', style)}`, tag('span', ' class="ui-outputlabel-label"', text));
  });
}

/** h:outputLabel (LabelRenderer): `<label [id] [for] [style] [class]>text</label>` — the id only when the page gave one; `class` is `styleClass` (h: alias) */
function hOutputLabel(R, el, scope, form) {
  return R.withRendered(el, scope, () => {
    let v = R.valueOf(A(el, 'value') ?? '', scope);
    const conv = elementsOf(el).find((c) => c.name === 'f:convertDateTime');
    if (conv) {
      // a Date shown with a pattern (DateTimeConverter): the bean holds yyyy-MM-dd texts, the pattern is dd/MM/yyyy; a String ('-') is shown as it is
      if (A(conv, 'pattern') !== 'dd/MM/yyyy') throw new Error('jsf: f:convertDateTime pattern other than dd/MM/yyyy');
      v = R.isDyn(v) ? new R.Dyn(`vd(${v.js})`) : R.o.viewDate(v);
    }
    const text = R.out(v === null || v === undefined ? '' : v);
    const id = clientId(R, el, form, scope);
    const forId = A(el, 'for') === undefined ? undefined : `${form ? `${form.id}:` : ''}${A(el, 'for')}`;
    return tag('label', at(R, 'id', id) + at(R, 'for', forId) + at(R, 'style', valOf(R, el, 'style', scope)) + at(R, 'class', styleClassOf(R, el, scope)), text);
  });
}

/** h:inputHidden (HiddenRenderer): `<input id type="hidden" name value/>` — the id only when the page gave one, the name is always the client id */
function inputHidden(R, el, scope, form) {
  return R.withRendered(el, scope, () => {
    const name = clientId(R, el, form, scope, true);
    const given = clientId(R, el, form, scope);
    const bind = A(el, 'value');
    const v = bind === undefined ? '' : R.strOf(bind, scope);
    if (bind !== undefined) R.bindings?.push({ id: name, value: bind, kind: 'hidden' });
    const idAttr = given === undefined ? '' : ` id="${given}"`;
    if (R.mode === 'ng') return tag('input', `${idAttr} type="hidden" name="${name}" [attr.value]="${R.dynJs(v, true)}" [value]="${R.dynJs(v, true)}"`);
    return tag('input', `${idAttr} type="hidden" name="${name}" value="${R.out(v)}"`);
  });
}

/* ------------------------------------------------------------------------------------------------ p:datePicker */
/** the widget's behaviours as PrimeFaces writes them after the configuration: `,behaviors:{dateSelect:function(ext,event) {PrimeFaces.ab({…},ext);}}` */
function widgetBehaviorsText(R, behaviors, scope, form) {
  const byEvent = new Map();
  for (const b of behaviors) byEvent.set(b.event, [...(byEvent.get(b.event) ?? []), b]);
  const fns = [...byEvent].map(([e, list]) => `${e}:function(ext,event) {${list.map((b) => behaviorScript(R, b, scope, form, '"', '},ext);')).join('')}}`);
  return `behaviors:{${fns.join(',')}}`;
}

/**
 * p:datePicker (PrimeFaces 14 DatePicker — not p:calendar): `<span id class="ui-calendar [styleClass]" [style]><input id_input … /></span>`; the widget adds the trigger button
 * (`showIcon`) and the panel itself. Its configuration is DatePickerRenderer.encodeScript's, in its order, a key only when it differs from the default.
 * ASSUMPTIONS (not readable from the class files): the locale's AM/PM strings (`localeAm` / `localePm`: the CLDR ones of `th`; used by time pickers only), `isTouchable`
 * true (the default; false would add `touchable:false`), `primefaces.FLEX` unset.
 */
function datePicker(R, el, scope, form) {
  return R.withRendered(el, scope, () => {
    const id = clientId(R, el, form, scope, true);
    const bind = A(el, 'value');
    const v = bind === undefined ? '' : R.strOf(bind, scope);
    if (bind !== undefined) R.bindings?.push({ id: `${id}_input`, value: bind, kind: 'date' });
    const pattern = A(el, 'pattern') ?? 'dd/MM/yyyy';
    if (pattern !== 'dd/MM/yyyy') throw new Error(`jsf: p:datePicker pattern ${pattern}`);
    const bool = (n) => A(el, n) === 'true';
    const cfg = { id, inline: false, userLocale: A(el, 'locale') ?? 'en' };
    if (cfg.userLocale === 'th') Object.assign(cfg, { localeAm: 'ก่อนเที่ยง', localePm: 'หลังเที่ยง' });
    cfg.dateFormat = 'dd/mm/yy';
    if (bool('showIcon')) cfg.showIcon = true;
    // (UICalendar.isShowOnFocus is a boolean the renderer boxes: written whatever its value)
    cfg.showOnFocus = A(el, 'showOnFocus') === undefined ? true : bool('showOnFocus');
    if (bool('monthNavigator')) cfg.monthNavigator = true;
    if (bool('yearNavigator')) cfg.yearNavigator = true;
    if (A(el, 'appendTo') !== undefined) cfg.appendTo = A(el, 'appendTo');
    cfg.timeInput = false;
    cfg.selectOtherMonths = false;
    const behaviors = behaviorsOf(R, el, scope, form, id, 'dateSelect');
    for (const b of behaviors) recordBehavior(R, b, scope);
    const entry = { type: 'DatePicker', id, cfg };
    if (behaviors.length) {
      if (R.mode === 'java') entry.raw = [widgetBehaviorsText(R, behaviors, scope, form)];
      entry.behaviors = Object.fromEntries(behaviors.map((b) => [b.event, { listener: b.listener, args: b.args, update: b.update, process: b.process }]));
    }
    R.widgets.push(entry);
    const styleClass = valOf(R, el, 'styleClass', scope);
    const style = valOf(R, el, 'style', scope);
    const shown = R.isDyn(v) ? new R.Dyn(`vd(${v.js})`) : R.o.viewDate(v);
    const aria = ` role="combobox" aria-autocomplete="none" aria-haspopup="dialog" aria-expanded="false" aria-controls="${id}_panel"`;
    const input = tag(
      'input',
      ` id="${id}_input" name="${id}_input" type="text" ${R.mode === 'ng' ? `[attr.value]="${R.dynJs(shown, true)}" [value]="${R.dynJs(shown, true)}" ` : `value="${R.out(shown)}" `}class="ui-inputfield ui-widget ui-state-default ui-corner-all"${aria}`,
    );
    return keyed(R, el, tag('span', ` id="${id}" class="${cls('ui-calendar', typeof styleClass === 'string' ? styleClass : '')}"${at(R, 'style', style)}`, input));
  });
}

/* ------------------------------------------------------------------------------------------------ p:selectOneRadio */
/**
 * p:selectOneRadio, layout="lineDirection" (SelectOneRadioRenderer.encodeResponsiveLayout with one column, no flex grid):
 * `<div id role="radiogroup" class="layout-line-direction [styleClass] ui-selectoneradio ui-widget">` and, per item, a `<div class="" role="radio" aria-checked>` holding
 * the radio button (`ui-radiobutton`: the hidden input, the box with its icon) and the `<label for>`. `class="…"` on a p: component is not read (no alias).
 * The input's `onchange` is the page's script and/or the behaviours on `change`; the widget fires it with jQuery's trigger (so Angular's (change) would not hear it:
 * the behaviours are recorded in the widget entry for the host to bind through jQuery).
 */
function selectOneRadio(R, el, scope, form) {
  return R.withRendered(el, scope, () => {
    const id = clientId(R, el, form, scope, true);
    const layout = A(el, 'layout') ?? 'lineDirection';
    if (layout !== 'lineDirection') throw new Error(`jsf: p:selectOneRadio layout ${layout} (only lineDirection is written)`);
    const bind = A(el, 'value');
    const cur = bind === undefined ? '' : R.strOf(bind, scope);
    if (bind !== undefined) R.bindings?.push({ id, value: bind, kind: 'radio' });
    const styleClass = valOf(R, el, 'styleClass', scope);
    const style = valOf(R, el, 'style', scope);
    const behaviors = behaviorsOf(R, el, scope, form, id, 'change');
    for (const b of behaviors) recordBehavior(R, b, scope);
    const userOnchange = A(el, 'onchange') === undefined ? undefined : R.attrText(A(el, 'onchange'), scope);
    const items = elementsOf(el)
      .filter((c) => c.name === 'f:selectItem')
      .map((c) => ({ label: R.strOf(A(c, 'itemLabel') ?? '', scope), value: R.strOf(A(c, 'itemValue') ?? '', scope) }));
    const entry = { type: 'SelectOneRadio', id, cfg: { id, unselectable: false } };
    if (behaviors.length) {
      const b = behaviors[0];
      entry.ajax = { event: b.event, listener: b.listener, ...(b.args.length ? { args: b.args } : {}), update: b.update, process: b.process };
    }
    R.widgets.push(entry);
    let rows = '';
    items.forEach((it, i) => {
      const oid = `${id}:${i}`;
      const same = R.isDyn(cur) || R.isDyn(it.value) ? new R.Dyn(`(${R.dynJs(cur)} == ${R.dynJs(it.value)})`) : String(cur) === String(it.value);
      const dyn = R.isDyn(same);
      const events = R.mode === 'java' ? eventAttrs(R, behaviors, scope, form, { change: userOnchange }) : userOnchange ? ` onchange="${userOnchange}"` : '';
      const input = tag(
        'input',
        ` id="${oid}" name="${id}" type="radio" value="${R.out(it.value)}"${events}${dyn ? ` [attr.checked]="${same.js} ? 'checked' : null"` : same ? ' checked="checked"' : ''}`,
      );
      const box = dyn
        ? `<div class="ui-radiobutton-box ui-widget ui-corner-all ui-state-default" [class.ui-state-active]="${same.js}"><span class="ui-radiobutton-icon ui-icon ui-c" [class.ui-icon-bullet]="${same.js}" [class.ui-icon-blank]="!(${same.js})"></span></div>`
        : `<div class="${cls('ui-radiobutton-box ui-widget ui-corner-all ui-state-default', same ? 'ui-state-active' : '')}"><span class="ui-radiobutton-icon ui-icon ${same ? 'ui-icon-bullet' : 'ui-icon-blank'} ui-c"></span></div>`;
      const aria = dyn ? ` [attr.aria-checked]="${same.js}"` : ` aria-checked="${same}"`;
      rows += `<div class="" role="radio"${aria}><div class="ui-radiobutton ui-widget"><div class="ui-helper-hidden-accessible">${input}</div>${box}</div><label for="${oid}">${R.out(it.label)}</label></div>`;
    });
    return keyed(R, el, tag('div', ` id="${id}" role="radiogroup" class="${cls('layout-line-direction', typeof styleClass === 'string' ? styleClass : '', 'ui-selectoneradio ui-widget')}"${at(R, 'style', style)}`, rows));
  });
}

/* ------------------------------------------------------------------------------------------------ p:dialog */
/**
 * p:dialog (DialogRenderer.encodeMarkup): `<div id class="ui-dialog ui-widget ui-widget-content ui-corner-all ui-shadow ui-hidden-container [styleClass]" style="[style;]display:none;">`
 * with the title bar (`showHeader` is true by default: the title span — empty when the page gives no header — and, `closable`, the close icon), the content (`id_content`) with
 * the children, and no footer. The widget (real Dialog) moves it to <body>, draws the mask when `modal`, sizes it with `width`.
 */
function dialog(R, el, scope, form) {
  return R.withRendered(el, scope, () => {
    const id = clientId(R, el, form, scope, true);
    const cfg = { id };
    if (A(el, 'draggable') === 'false') cfg.draggable = false;
    if (A(el, 'modal') === 'true') cfg.modal = true;
    if (A(el, 'width') !== undefined) cfg.width = A(el, 'width');
    if (A(el, 'appendTo') !== undefined) cfg.appendTo = A(el, 'appendTo');
    const entry = { type: 'Dialog', id, widgetVar: A(el, 'widgetVar') ?? widgetVar(id), cfg };
    R.widgets.push(entry);
    const styleClass = valOf(R, el, 'styleClass', scope);
    const style = valOf(R, el, 'style', scope);
    const userStyle = style === undefined || style === '' ? '' : String(style).replace(/;?\s*$/, ';');
    const closable = A(el, 'closable') !== 'false';
    const titlebar =
      `<div class="ui-dialog-titlebar ui-widget-header ui-helper-clearfix ui-corner-top"><span id="${id}_title" class="ui-dialog-title"></span>` +
      (closable ? '<a href="#" class="ui-dialog-titlebar-icon ui-dialog-titlebar-close ui-corner-all"><span class="ui-icon ui-icon-closethick"></span></a>' : '') +
      '</div>';
    const content = `<div class="ui-dialog-content ui-widget-content" id="${id}_content">${R.renderChildren(el, scope, form)}</div>`;
    return keyed(R, el, tag('div', ` id="${id}" class="${cls('ui-dialog ui-widget ui-widget-content ui-corner-all ui-shadow ui-hidden-container', typeof styleClass === 'string' ? styleClass : '')}" style="${userStyle}display:none;"`, titlebar + content));
  });
}

/* ------------------------------------------------------------------------------------------------ p:calendar */
function calendar(R, el, scope, form) {
  const id = clientId(R, el, form, scope, true);
  const bind = A(el, 'value');
  const v = bind === undefined ? '' : R.strOf(bind, scope);
  if (bind !== undefined) R.bindings?.push({ id: `${id}_input`, value: bind, kind: 'date' });
  const pattern = A(el, 'pattern') ?? 'dd/MM/yyyy';
  if (pattern !== 'dd/MM/yyyy') throw new Error(`jsf: p:calendar pattern ${pattern}`);
  const cfg = {
    id,
    popup: true,
    locale: A(el, 'locale') ?? 'en',
    dateFormat: 'dd/mm/yy',
    showOn: A(el, 'showOn') ?? 'focus',
    changeMonth: A(el, 'monthNavigator') === 'true',
    changeYear: A(el, 'yearNavigator') === 'true',
  };
  R.widgets.push({ type: 'Calendar', id, cfg });
  const styleClass = valOf(R, el, 'styleClass', scope);
  const style = valOf(R, el, 'style', scope);
  const shown = R.isDyn(v) ? new R.Dyn(`vd(${v.js})`) : R.o.viewDate(v);
  const input = tag('input', ` id="${id}_input" name="${id}_input" type="text" ${R.mode === 'ng' ? `[attr.value]="${R.dynJs(shown, true)}" [value]="${R.dynJs(shown, true)}" ` : `value="${R.out(shown)}" `}class="ui-inputfield ui-widget ui-state-default ui-corner-all"`);
  return keyed(R, el, tag('span', ` id="${id}" class="${cls('ui-calendar', styleClass)}"${at(R, 'style', style)}`, input));
}

/* ------------------------------------------------------------------------------------------------ p:selectOneMenu */
/** the options of a select: static f:selectItem and f:selectItems over a list; each { label, value, noSelection } */
function optionsOf(R, el, scope) {
  const items = [];
  for (const c of elementsOf(el)) {
    if (c.name === 'f:selectItem') {
      items.push({ kind: 'item', label: R.strOf(A(c, 'itemLabel') ?? '', scope), value: R.strOf(A(c, 'itemValue') ?? '', scope), noSelection: A(c, 'noSelectionOption') === 'true' });
    } else if (c.name === 'f:selectItems') {
      items.push({ kind: 'items', list: R.valueOf(A(c, 'value'), scope), v: A(c, 'var'), label: A(c, 'itemLabel'), value: A(c, 'itemValue') });
    }
  }
  return items;
}

function selectOneMenu(R, el, scope, form) {
  return R.withRendered(el, scope, () => selectOneMenuBody(R, el, scope, form));
}

function selectOneMenuBody(R, el, scope, form) {
  const id = clientId(R, el, form, scope, true);
  const bind = A(el, 'value');
  const cur = bind === undefined ? '' : R.strOf(bind, scope);
  if (bind !== undefined) R.bindings?.push({ id: `${id}_input`, value: bind, kind: 'select' });
  const filter = A(el, 'filter') === 'true';
  const ajax = elementsOf(el).find((c) => c.name === 'p:ajax');
  const items = optionsOf(R, el, scope);

  // <option>s of the hidden <select>
  let options = '';
  let firstLabel = '';
  const curIsDyn = R.isDyn(cur);
  const sel = (v) => (curIsDyn ? ` ${SENTINEL_SEL(R, v, cur)}` : String(v) === String(cur) ? ' selected="selected"' : '');
  for (const it of items) {
    if (it.kind === 'item') {
      const label = R.out(it.label);
      const value = R.out(it.value);
      options += `<option value="${value}"${R.isDyn(it.value) ? '' : sel(it.value)}${it.noSelection ? ' data-noselection-option="true"' : ''}>${label}</option>`;
      if (!firstLabel) firstLabel = label;
    } else if (R.mode === 'java') {
      for (const row of it.list ?? []) {
        const child = new Map(scope);
        child.set(it.v, row);
        const label = R.out(R.strOf(it.label, child));
        const value = R.strOf(it.value, child);
        options += `<option value="${R.out(value)}"${sel(value)}>${label}</option>`;
      }
    } else {
      const child = new Map(scope);
      child.set(it.v, new R.Dyn(it.v));
      const label = R.out(R.strOf(it.label, child));
      const value = R.strOf(it.value, child);
      // the options of a list the widget's own script rewrites (the customers: sd_customer_lazy.js) must not be touched by Angular after the first draw:
      // the template reads a snapshot of the bean's list (the host's snap(), taken once)
      const listJs = /^bean\.(\w+)$/.test(it.list.js) ? `snap('${/^bean\.(\w+)$/.exec(it.list.js)[1]}')` : it.list.js;
      options += `@for (${it.v} of ${listJs}; track $index) {<option [attr.value]="${R.dynJs(value, true)}" [selected]="${R.dynJs(cur, true)} == ${R.dynJs(value, true)}" [attr.selected]="(${R.dynJs(cur, true)} == ${R.dynJs(value, true)}) ? 'selected' : null">${label}</option>}`;
    }
  }
  const style = valOf(R, el, 'style', scope);
  const widgetEntry = {
    type: 'SelectOneMenu',
    id,
    widgetVar: A(el, 'widgetVar'),
    cfg: { id, ...(A(el, 'appendTo') !== undefined ? { appendTo: A(el, 'appendTo') } : {}), renderPanelContentOnClient: true, ...(filter ? { filter: true, filterMatchMode: A(el, 'filterMatchMode') ?? 'startsWith' } : {}) },
    // p:ajax event="change": what the widget's change behaviour does
    ajax: ajax ? { event: A(ajax, 'event'), listener: callOf(A(ajax, 'listener')).name ?? '', ...(callOf(A(ajax, 'listener')).args.length ? { args: callOf(A(ajax, 'listener')).args } : {}), update: clientIds(R.attrText(A(ajax, 'update') ?? '', scope), form, id), process: id } : undefined,
  };
  R.widgets.push(widgetEntry);
  const placeholder = R.mode === 'java' ? firstLabel : firstLabel;
  // p:ajax event="change": PrimeFaces writes it as an inline `onchange` on the hidden <select> (the widget's triggerChange() fires jQuery's 'change' on it); the
  // widget itself calls no behavior for it. The Angular host binds the same event on the same element (see widgets[].ajax).
  const widgetAjax = widgetEntry.ajax;
  let onchange = '';
  if (widgetAjax) {
    R.actions?.push({ source: id, listener: widgetAjax.listener, update: widgetAjax.update, process: id, event: widgetAjax.event || 'change' });
    if (R.mode === 'java') onchange = ` onchange="PrimeFaces.ab({s:&quot;${id}&quot;,e:&quot;${widgetAjax.event || 'change'}&quot;,f:&quot;${form.id}&quot;,p:&quot;${id}&quot;,u:&quot;${widgetAjax.update}&quot;})"`;
  }
  const filterBox = filter
    ? `<div class="ui-selectonemenu-filter-container"><input type="text" class="ui-selectonemenu-filter ui-inputfield ui-inputtext ui-widget ui-state-default ui-corner-all" role="searchbox" autocomplete="off" aria-expanded="false" aria-haspopup="listbox" aria-owns="${id}_items" aria-controls="${id}_items" placeholder="${R.out(R.strOf(A(el, 'filterPlaceholder') ?? '', scope))}"/><span class="ui-icon ui-icon-search"></span></div>`
    : '';
  const panel = `<div id="${id}_panel" class="ui-selectonemenu-panel ui-widget ui-widget-content ui-corner-all ui-helper-hidden ui-input-overlay">${filterBox}<div class="ui-selectonemenu-items-wrapper" style="max-height: 200px;"></div></div>`;
  const inner =
    `<div class="ui-helper-hidden-accessible"><input id="${id}_focus" name="${id}_focus" type="text" autocomplete="off" aria-haspopup="listbox" aria-expanded="false" readonly="readonly" role="combobox"/></div>` +
    `<div class="ui-helper-hidden-accessible"><select id="${id}_input" name="${id}_input" tabindex="-1" aria-hidden="true"${onchange}>${options}</select></div>` +
    `<label id="${id}_label" class="ui-selectonemenu-label ui-inputfield ui-corner-all">${placeholder || '&nbsp;'}</label>` +
    `<div class="ui-selectonemenu-trigger ui-state-default ui-corner-right"><span class="ui-icon ui-icon-triangle-1-s ui-c"></span></div>` +
    panel;
  return keyed(R, el, tag('div', ` id="${id}" class="ui-selectonemenu ui-widget ui-state-default ui-corner-all"${at(R, 'style', style)}`, inner));
}
/** `selected` for a dynamic current value */
const SENTINEL_SEL = (R, v, cur) => `[attr.selected]="(${R.dynJs(cur, true)} == ${R.dynJs(v, true)}) ? 'selected' : null"`;

/* ------------------------------------------------------------------------------------------------ p:selectBooleanCheckbox */
function checkbox(R, el, scope, form) {
  const id = clientId(R, el, form, scope, true);
  const bind = A(el, 'value');
  const v = bind === undefined ? false : R.valueOf(bind, scope);
  if (bind !== undefined) R.bindings?.push({ id: `${id}_input`, value: bind, kind: 'checkbox' });
  R.widgets.push({ type: 'SelectBooleanCheckbox', id, cfg: { id } });
  const on = R.isDyn(v) ? v.js : v === true || v === 'true';
  const dyn = R.isDyn(v);
  const checkedAttr = dyn ? ` [attr.checked]="${v.js} ? 'checked' : null" [attr.aria-checked]="${v.js}"` : on ? ' checked="checked" aria-checked="true"' : ' aria-checked="false"';
  const box = `<div class="${dyn ? '' : cls('ui-chkbox-box ui-widget ui-corner-all ui-state-default', on ? 'ui-state-active' : '')}"${dyn ? ` class="ui-chkbox-box ui-widget ui-corner-all ui-state-default" [class.ui-state-active]="${v.js}"` : ''}>`;
  const boxHtml = dyn
    ? `<div class="ui-chkbox-box ui-widget ui-corner-all ui-state-default" [class.ui-state-active]="${v.js}"><span class="ui-chkbox-icon ui-icon ui-c" [class.pi]="${v.js}" [class.pi-check]="${v.js}" [class.ui-icon-blank]="!${v.js}"></span></div>`
    : `${box}<span class="ui-chkbox-icon ui-icon ui-c ${on ? 'pi pi-check' : 'ui-icon-blank'}"></span></div>`;
  return tag(
    'div',
    ` id="${id}" class="ui-chkbox ui-widget"`,
    `<div class="ui-helper-hidden-accessible"><input id="${id}_input" name="${id}_input" type="checkbox"${checkedAttr}/></div>${boxHtml}`,
  );
}

/* ------------------------------------------------------------------------------------------------ buttons */
/**
 * The callbacks of an ajax request as `PrimeFaces.ab({…})` takes them (AjaxRequestBuilder: onstart · onerror · onsuccess · oncomplete, in this order; each
 * `,onXX:function(args){<script>;}`). `legacyOncomplete`: the older spelling of this file for `oncomplete` (no `;` before the closing brace) — kept for the
 * supporting-document pages, whose replica was compared with it.
 */
function callbacksText(R, scope, get, q, legacyOncomplete = false) {
  const js = (name) => R.attrText(get(name), scope).replace(/"/g, q);
  let s = '';
  if (get('onstart') !== undefined) s += `,onst:function(cfg){${js('onstart')};}`;
  if (get('onerror') !== undefined) s += `,oner:function(xhr,status,error){${js('onerror')};}`;
  if (get('onsuccess') !== undefined) s += `,onsu:function(data,status,xhr){${js('onsuccess')};}`;
  if (get('oncomplete') !== undefined) s += legacyOncomplete ? `,onco:function(xhr,status,args,data){${js('oncomplete')}}` : `,onco:function(xhr,status,args,data){${js('oncomplete')};}`;
  return s;
}

/** the callbacks of an element as plain data (for the records the replica server and the Angular host read) */
function callbackData(R, el, scope) {
  const out = {};
  for (const n of ['onstart', 'onerror', 'onsuccess', 'oncomplete']) if (A(el, n) !== undefined) out[n] = R.attrText(A(el, n), scope);
  return out;
}

/**
 * The `p:ajax` children of a component as behaviours (AjaxBehaviorRenderer.getScript): the process defaults to `@this`, the source is the component
 * (`s:`), the event is the one the page names (`change`, `click`, `dateSelect` …).
 */
function behaviorsOf(R, el, scope, form, cid, defaultEvent) {
  return elementsOf(el)
    .filter((c) => c.name === 'p:ajax')
    .map((a) => {
      const call = callOf(A(a, 'listener'));
      return {
        el: a,
        event: A(a, 'event') ?? defaultEvent,
        source: cid,
        listener: call.name,
        args: call.args,
        row: call.row,
        process: clientIds(A(a, 'process') ?? '@this', form, cid),
        update: clientIds(A(a, 'update'), form, cid),
        rawUpdate: updateIds(A(a, 'update')),
        rawProcess: A(a, 'process') ?? '@this',
      };
    });
}

/** `PrimeFaces.ab({s:…,e:…,f:…,p:…,u:…,callbacks});` — a behaviour (AjaxBehaviorRenderer; `q` is the quote: `&quot;` in an attribute, `"` in a script; `tail`: `});` or `},ext);` for a widget's behaviour) */
function behaviorScript(R, b, scope, form, q, tail) {
  const parts = [`s:${q}${b.source}${q}`, `e:${q}${b.event}${q}`];
  if (form) parts.push(`f:${q}${form.id}${q}`);
  parts.push(`p:${q}${b.process}${q}`);
  if (b.update) parts.push(`u:${q}${b.update}${q}`);
  return `PrimeFaces.ab({${parts.join(',')}${callbacksText(R, scope, (n) => A(b.el, n), q)}${tail}`;
}

/** the behaviour recorded for the replica server (java) or the host (ng) */
function recordBehavior(R, b, scope) {
  R.actions?.push({
    source: b.source,
    event: b.event,
    behavior: true,
    listener: b.listener,
    ...(b.args.length ? { args: b.args } : {}),
    update: R.mode === 'java' ? b.update : b.rawUpdate,
    process: R.mode === 'java' ? b.process : b.rawProcess,
    rowArg: !!b.row,
    ...callbackData(R, b.el, scope),
  });
}

/** the inline DOM-event script of a component with behaviours on `event` (obstrusive mode): one behaviour is written as it is, more are chained by `PrimeFaces.bcn` */
function domEventText(R, behaviors, scope, form) {
  const scripts = behaviors.map((b) => behaviorScript(R, b, scope, form, '&quot;', '});'));
  return scripts.length === 1 ? scripts[0] : `PrimeFaces.bcn(this,event,[${scripts.map((s) => `function(event){${s}}`).join(',')}]);`;
}

/** the ng side of a behaviour: `ab($event, source, listener, update, process, oncomplete, args, onstart, onsuccess)` of the host */
function behaviorBinding(R, b, scope) {
  const q = (s) => (s === undefined ? 'null' : `'${String(s).replace(/\\/g, '\\\\').replace(/'/g, "\\'").replace(/"/g, '&quot;')}'`);
  if (b.row) throw new Error(`jsf: ${b.listener}(${b.row}) on a behaviour`);
  const cb = callbackData(R, b.el, scope);
  const staticId = b.source.replace(/\u0003[^\u0004]*\u0004/g, '*');
  const extra = cb.onstart !== undefined || cb.onsuccess !== undefined ? `, ${q(cb.onstart)}, ${q(cb.onsuccess)}` : '';
  return `ab($event, ${q(staticId)}, ${q(b.listener)}, ${q(b.rawUpdate)}, ${q(b.rawProcess)}, ${q(cb.oncomplete)}, ${JSON.stringify(b.args).replace(/"/g, "'")}${extra})`;
}

/** `PrimeFaces.ab({…})` of a p:commandButton / p:commandLink (java); the action is recorded for the replica server (what the Angular side records in `abBinding`) */
function abCall(R, el, cid, form, scope) {
  const p = A(el, 'process');
  const u = A(el, 'update');
  const parts = [`s:&quot;${cid}&quot;`];
  if (form) parts.push(`f:&quot;${form.id}&quot;`);
  if (p) parts.push(`p:&quot;${clientIds(p, form, cid)}&quot;`);
  if (u) parts.push(`u:&quot;${clientIds(u, form, cid)}&quot;`);
  const call = callOf(A(el, 'actionListener') ?? A(el, 'action'));
  R.actions?.push({
    source: cid,
    listener: call.name,
    ...(call.args.length ? { args: call.args } : {}),
    update: clientIds(u, form, cid),
    process: clientIds(p, form, cid),
    rowArg: !!call.row,
    ...(p ? {} : { processDefault: '@all' }),
    ...callbackData(R, el, scope),
  });
  return `PrimeFaces.ab({${parts.join(',')}${callbacksText(R, scope, (n) => A(el, n), '&quot;', true)}});return false;`;
}

/** the ng side of an ajax button: `ab(source, listener, process, update, oncomplete)` of the host */
function abBinding(R, el, cid, scope) {
  const q = (s) => (s === undefined ? 'null' : `'${String(s).replace(/\\/g, '\\\\').replace(/'/g, "\\'").replace(/"/g, '&quot;')}'`);
  const call = callOf(A(el, 'actionListener') ?? A(el, 'action'));
  const l = call.name;
  // removeFile(file): the argument is the row of the repeat — its index here
  let args = JSON.stringify(call.args).replace(/"/g, "'");
  if (call.row) {
    const idx = scope.get('__index');
    if (!idx || scope.get(call.row) === undefined) throw new Error(`jsf: ${l}(${call.row}) outside a ui:repeat`);
    args = `[${idx}]`;
  }
  const cb = callbackData(R, el, scope);
  R.actions?.push({
    source: cid,
    listener: l,
    ...(call.args.length ? { args: call.args } : {}),
    update: updateIds(A(el, 'update')),
    process: A(el, 'process'),
    oncomplete: A(el, 'oncomplete'),
    rowArg: !!call.row,
    ...(A(el, 'process') ? {} : { processDefault: '@all' }),
    ...(cb.onstart !== undefined ? { onstart: cb.onstart } : {}),
    ...(cb.onsuccess !== undefined ? { onsuccess: cb.onsuccess } : {}),
    ...(cb.onerror !== undefined ? { onerror: cb.onerror } : {}),
  });
  // (the id of a row's component carries the row's index as a binding: the host does not need it, a star stands for it)
  const staticId = cid.replace(/\u0003[^\u0004]*\u0004/g, '*');
  const extra = cb.onstart !== undefined || cb.onsuccess !== undefined ? `, ${q(cb.onstart)}, ${q(cb.onsuccess)}` : '';
  return `ab($event, ${q(staticId)}, ${q(l)}, ${q(updateIds(A(el, 'update')))}, ${q(A(el, 'process'))}, ${q(A(el, 'oncomplete'))}, ${args}${extra})`;
}

/**
 * The click of a p:commandButton (CommandButtonRenderer.encodeMarkup → CoreRenderer.buildDomEvent(…, "onclick", "click", "action", request)): the scripts that
 * run, in this order — the page's own `onclick`, the behaviours on `click`, and (for a submit button) the button's own ajax request. One script is written as
 * it is; more are chained by `PrimeFaces.bcn(this,event,[function(event){…},…])`, which stops at the first one that returns false. A `type="button"` has no
 * request of its own. (A submit button with none of action / listener / process / update / callbacks and no behaviour writes a request in PrimeFaces too — the pages
 * have none, and the older spelling of this file wrote nothing for it.)
 */
const AJAX_ATTRS = ['actionListener', 'action', 'process', 'update', 'onstart', 'onsuccess', 'oncomplete', 'onerror'];

function commandButton(R, el, scope, form) {
  return R.withRendered(el, scope, () => {
    const cid = clientId(R, el, form, scope, true);
    const value = A(el, 'value') === undefined ? undefined : R.strOf(A(el, 'value'), scope);
    const icon = A(el, 'icon');
    const title = valOf(R, el, 'title', scope);
    const styleClass = valOf(R, el, 'styleClass', scope);
    const style = valOf(R, el, 'style', scope);
    const disabledRaw = A(el, 'disabled');
    const disabled = disabledRaw === undefined ? false : R.valueOf(disabledRaw, scope);
    const hasText = value !== undefined && value !== '';
    const skin = icon ? (hasText ? 'ui-button-text-icon-left' : 'ui-button-icon-only') : 'ui-button-text-only';
    const type = A(el, 'type') ?? 'submit';
    const ajaxOff = A(el, 'ajax') === 'false';
    const onclickRaw = A(el, 'onclick');
    const behaviors = behaviorsOf(R, el, scope, form, cid, 'click');
    const ownRequest = type !== 'button' && type !== 'reset' && !ajaxOff && (behaviors.length > 0 || AJAX_ATTRS.some((n) => A(el, n) !== undefined));
    // the older spelling: a page's `onclick` and no behaviour = that script only
    const ownToo = ownRequest && !(onclickRaw && !behaviors.length);
    let onclick = null;
    if (R.mode === 'java') {
      const chain = [];
      if (onclickRaw) chain.push(R.attrText(onclickRaw, scope));
      for (const b of behaviors) {
        recordBehavior(R, b, scope);
        chain.push(behaviorScript(R, b, scope, form, '&quot;', '});'));
      }
      if (ownToo) chain.push(abCall(R, el, cid, form, scope));
      if (chain.length) onclick = chain.length === 1 ? chain[0] : `PrimeFaces.bcn(this,event,[${chain.map((s) => `function(event){${s}}`).join(',')}]);`;
    } else {
      if (onclickRaw) onclick = R.attrText(onclickRaw, scope);
      for (const b of behaviors) recordBehavior(R, b, scope);
    }
    // (a styleClass with a value of the page in it — `btn-master-save-lead #{empty bean.x ? 'is-disabled' : ''}` — is one expression that writes the whole class attribute)
    const classAttr =
      R.isDyn(styleClass)
        ? `[attr.class]="'${cls('ui-button ui-widget ui-state-default ui-corner-all', skin)}' + (${R.isDyn(styleClass) ? `(${styleClass.js}) ? ' ' + (${styleClass.js}) : ''` : styleClass ? `' ${styleClass}'` : `''`}) + (${R.isDyn(disabled) ? disabled.js : disabled ? 'true' : 'false'} ? ' ui-state-disabled' : '')"`
        : R.isDyn(disabled)
          ? `class="${cls('ui-button ui-widget ui-state-default ui-corner-all', skin, styleClass)}" [class.ui-state-disabled]="${disabled.js}"`
          : `class="${cls('ui-button ui-widget ui-state-default ui-corner-all', skin, styleClass, disabled ? 'ui-state-disabled' : '')}"`;
    const dis = R.isDyn(disabled) ? ` [attr.disabled]="${disabled.js} ? 'disabled' : null"` : disabled ? ' disabled="disabled"' : '';
    const inner = (icon ? `<span class="ui-button-icon-left ui-icon ui-c ${icon}"></span>` : '') + `<span class="ui-button-text ui-c">${hasText ? R.out(value) : 'ui-button'}</span>`;
    // ng: the same scripts as Angular statements in the same order (the host's ab() queues the requests, as PrimeFaces does)
    let ng = '';
    if (R.mode === 'ng' && !onclickRaw) {
      const calls = behaviors.map((b) => behaviorBinding(R, b, scope));
      if (ownToo) calls.push(abBinding(R, el, cid, scope));
      if (calls.length) ng = ` (click)="${calls.join('; ')}"`;
    }
    // an ajax="false" submit (the real save button) is a plain submit of the form
    if (ajaxOff) R.actions?.push({ source: cid, listener: callOf(A(el, 'action')).name, submit: true });
    const attrs = ` id="${cid}" name="${cid}" ${classAttr}${at(R, 'style', style)}${at(R, 'title', title)}${onclick ? ` onclick="${onclick}"` : ''} type="${type}"${dis}${ng}`;
    return tag('button', attrs, inner);
  });
}

function commandLink(R, el, scope, form) {
  return R.withRendered(el, scope, () => {
    const cid = clientId(R, el, form, scope, true);
    const styleClass = valOf(R, el, 'styleClass', scope);
    const style = valOf(R, el, 'style', scope);
    const attrs = ` id="${cid}" href="#" class="${cls('ui-commandlink ui-widget', typeof styleClass === 'string' ? styleClass : '')}"${at(R, 'style', style)}${R.mode === 'java' ? ` onclick="${abCall(R, el, cid, form, scope)}"` : ` (click)="${abBinding(R, el, cid, scope)}"`}`;
    return tag('a', attrs, R.renderChildren(el, scope, form));
  });
}

function linkButton(R, el, scope, form) {
  return R.withRendered(el, scope, () => {
    const cid = clientId(R, el, form, scope, true);
    const params = paramsOf(R, el, scope);
    const href = linkHref(R, A(el, 'outcome'), params);
    const icon = A(el, 'icon');
    const value = R.strOf(A(el, 'value') ?? '', scope);
    const styleClass = valOf(R, el, 'styleClass', scope);
    const hasText = value !== '';
    const skin = icon ? (hasText ? 'ui-button-text-icon-left' : 'ui-button-icon-only') : 'ui-button-text-only';
    const inner = (icon ? `<span class="ui-button-icon-left ui-icon ui-c ${icon}"></span>` : '') + `<span class="ui-button-text ui-c">${hasText ? R.out(value) : 'ui-button'}</span>`;
    return tag('a', ` id="${cid}"${at(R, 'href', href)} class="${cls('ui-button ui-widget ui-state-default ui-corner-all', skin, typeof styleClass === 'string' ? styleClass : '')}"`, inner);
  });
}

/* ------------------------------------------------------------------------------------------------ p:fileUpload (advanced) */
/** the JS callback a p:fileUpload attribute holds, as PrimeFaces writes it into the widget's configuration: `function(<args>){<the code>}` */
const cb = (R, el, scope, name, args) => (A(el, name) ? `"${name}":function(${args}){${R.attrText(A(el, name), scope).replace(/&quot;/g, '"')}}` : undefined);

function fileUpload(R, el, scope, form) {
  const cid = clientId(R, el, form, scope, true);
  const label = R.out(R.strOf(A(el, 'label') ?? '', scope));
  const styleClass = valOf(R, el, 'styleClass', scope);
  const sizeLimit = A(el, 'sizeLimit') === undefined ? undefined : R.strOf(A(el, 'sizeLimit'), scope);
  R.uploads?.push({
    id: cid,
    allowTypes: A(el, 'allowTypes'),
    sizeLimit: A(el, 'sizeLimit'),
    multiple: A(el, 'multiple') === 'true',
    auto: A(el, 'auto') === 'true',
    sequential: A(el, 'sequential') === 'true',
    dropZone: A(el, 'dropZone'),
    onstart: A(el, 'onstart'),
    oncomplete: A(el, 'oncomplete'),
    oncancel: A(el, 'oncancel'),
    onvalidationfailure: A(el, 'onvalidationfailure'),
    listener: A(el, 'listener'),
    update: updateIds(A(el, 'update')),
  });
  const update = clientIds(A(el, 'update'), form, cid);
  const listener = callOf(A(el, 'listener')).name ?? '';
  if (R.mode === 'java') {
    // FileUploadRenderer.encodeScript: PrimeFaces.cw('FileUpload', …, { id, auto, update, sequentialUploads, dropZone, callbacks })
    R.widgets.push({
      type: 'FileUpload',
      id: cid,
      cfg: {
        id: cid,
        ...(A(el, 'auto') === 'true' ? { auto: true } : {}),
        ...(update ? { update } : {}),
        ...(A(el, 'sequential') === 'true' ? { sequentialUploads: true } : {}),
        ...(A(el, 'dropZone') ? { dropZone: A(el, 'dropZone') } : {}),
      },
      raw: [cb(R, el, scope, 'onstart', ''), cb(R, el, scope, 'oncomplete', 'args,data'), cb(R, el, scope, 'oncancel', ''), cb(R, el, scope, 'onvalidationfailure', 'msg')].filter(Boolean),
    });
    R.actions?.push({ source: cid, listener, update, upload: true });
  }
  // the validation data of the file input (primefaces.File validator: PrimeFaces.validation reads them)
  const validation =
    ` data-p-val="primefaces.File"${A(el, 'allowTypes') ? ` data-p-allowtypes="${R.attrText(A(el, 'allowTypes'), scope)}"` : ''}${sizeLimit !== undefined ? ` data-p-sizelimit="${R.out(sizeLimit)}"` : ''}`;
  const choose =
    `<span class="ui-button ui-widget ui-state-default ui-corner-all ui-button-text-icon-left ui-fileupload-choose"><span class="ui-button-icon-left ui-icon ui-c pi pi-plus"></span><span class="ui-button-text ui-c">${label}</span>` +
    `<input id="${cid}_input" name="${cid}_input" type="file"${A(el, 'multiple') === 'true' ? ' multiple="multiple"' : ''}${validation}/></span>`;
  const bar = `<div class="ui-fileupload-buttonbar ui-widget-header ui-corner-top">${choose}</div>`;
  const content = `<div class="ui-fileupload-content ui-widget-content ui-corner-bottom"><div class="ui-fileupload-files"><div></div></div></div>`;
  return tag('div', ` id="${cid}" class="${cls('ui-fileupload ui-widget', typeof styleClass === 'string' ? styleClass : '')}"`, bar + content);
}

function remoteCommand(R, el, scope, form) {
  // a function the page's script calls (`sdProsLoad([{ name, value }])`); it draws nothing but its definition
  const name = A(el, 'name');
  const id = clientId(R, el, form, scope, true);
  const ajaxAttrs = R.o.remoteCommandAjaxAttrs ?? R.o.pfStrict ?? false;
  R.remoteCommands?.push({
    name,
    id,
    listener: callOf(A(el, 'actionListener')).name ?? '',
    ...(callOf(A(el, 'actionListener')).args.length ? { args: callOf(A(el, 'actionListener')).args } : {}),
    // opt-in (`remoteCommandAjaxAttrs`, or `pfStrict`): the supporting-document pages' meta types a remote command without them, so their output must not gain the fields
    ...(ajaxAttrs && A(el, 'process') !== undefined ? { process: clientIdsKeepingKeywords(A(el, 'process'), form) } : {}),
    ...(ajaxAttrs && A(el, 'update') !== undefined ? { update: clientIdsKeepingKeywords(A(el, 'update'), form) } : {}),
    oncomplete: A(el, 'oncomplete'),
    onerror: A(el, 'onerror'),
  });
  if (R.mode !== 'java') return '';
  const p = A(el, 'process');
  const u = A(el, 'update');
  const onco = A(el, 'oncomplete');
  const oner = A(el, 'onerror');
  const cfg = [`s:"${id}"`];
  if (form) cfg.push(`f:"${form.id}"`);
  if (p) cfg.push(`p:"${clientIds(p, form, id)}"`);
  if (u) cfg.push(`u:"${clientIds(u, form, id)}"`);
  if (A(el, 'global') === 'false') cfg.push('g:false');
  cfg.push('pa:arguments[0]');
  if (onco) cfg.push(`onco:function(xhr,status,args,data){${R.attrText(onco, scope)}}`);
  if (oner) cfg.push(`oner:function(xhr,status,error){${R.attrText(oner, scope)}}`);
  return `<script id="${id}_s" type="text/javascript">${name}=function(){PrimeFaces.ab({${cfg.join(',')}});}</script>`;
}
