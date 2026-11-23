/**
 * A small JSF (Facelets + PrimeFaces) page renderer for the supporting-document pages (`sales_document*.xhtml`, `sales_document_sub_*.xhtml`,
 * `inc/*.xhtml`): the part of the server that turns the page into HTML, written once and used twice —
 *
 *   mode 'java'   the HTML a browser gets: every `#{…}` is evaluated against a bean state (the Java replica of the comparison harness);
 *   mode 'ng'     an Angular template: what the server decides per request stays symbolic (`t('key')`, `bean.sunDetail.x`, `can('F')`),
 *                 `rendered` becomes `@if`, `ui:repeat` becomes `@for`, the inputs get their bindings.
 *
 * Why not tools/lib/facelets.mjs: it reads the pages of the menu group "งานขาย", which have no JSF components and no bean — here there
 * are 286 `p:inputText`, calendars, drop-downs, ajax buttons and a bean (`sales_documentView`) whose state the template reads and writes,
 * and the EL needs `lt le gt ge`. The EL parser is the same idea (a precedence-climbing parser over a small grammar), extended.
 *
 * Both modes walk the same tree with the same code, so the Java replica and the Angular template can only differ where a component's
 * `javaOnly` / `ngOnly` part says so (PrimeFaces' ajax plumbing in the Java markup, the bindings in the Angular one).
 *
 * The Java files are only READ. The page is XML (Facelets requires it), so it is parsed as XML; text and attribute values are kept as they
 * were written (entities included) and written back the same way.
 */
import { SENTINEL_CLOSE, SENTINEL_OPEN, sentinelsToAngular } from './facelets.mjs';
import { needsGeneratedId, pfComponent } from './pf-dom.mjs';

export { SENTINEL_OPEN, SENTINEL_CLOSE, sentinelsToAngular };

/** `#{request.contextPath}` in ng mode: the generator swaps it (images → assets/images …) and refuses what is left */
export const CTX_MARK = '\u0001CTX\u0001';

/* ================================================================================================ XML */

/** `{ type:'el', name, attrs:[{name, raw}], children, self }` · `{ type:'text', raw }` · comments are dropped */
export function parseXml(text, what = 'xml') {
  const root = { type: 'el', name: '#root', attrs: [], children: [], self: false };
  const stack = [root];
  const top = () => stack[stack.length - 1];
  let i = 0;
  while (i < text.length) {
    const lt = text.indexOf('<', i);
    if (lt < 0) {
      top().children.push({ type: 'text', raw: text.slice(i) });
      break;
    }
    if (lt > i) top().children.push({ type: 'text', raw: text.slice(i, lt) });
    if (text.startsWith('<!--', lt)) {
      const e = text.indexOf('-->', lt);
      if (e < 0) throw new Error(`${what}: unterminated comment`);
      i = e + 3;
      continue;
    }
    if (text.startsWith('<![CDATA[', lt)) {
      const e = text.indexOf(']]>', lt);
      if (e < 0) throw new Error(`${what}: unterminated CDATA`);
      top().children.push({ type: 'text', raw: text.slice(lt, e + 3) });
      i = e + 3;
      continue;
    }
    if (text.startsWith('<?', lt)) {
      i = text.indexOf('?>', lt) + 2;
      continue;
    }
    let j = lt + 1;
    let q = '';
    while (j < text.length) {
      const c = text[j];
      if (q) {
        if (c === q) q = '';
      } else if (c === '"' || c === "'") q = c;
      else if (c === '>') break;
      j++;
    }
    if (j >= text.length) throw new Error(`${what}: unterminated tag near "${text.slice(lt, lt + 60)}"`);
    const raw = text.slice(lt, j + 1);
    const m = /^<(\/?)([A-Za-z][\w:.-]*)/.exec(raw);
    if (!m) throw new Error(`${what}: not a tag: ${raw.slice(0, 60)}`);
    const name = m[2];
    if (m[1]) {
      const open = stack.pop();
      if (open.name !== name) throw new Error(`${what}: </${name}> closes <${open.name}>`);
      i = j + 1;
      continue;
    }
    const attrs = [];
    for (const a of raw.slice(m[0].length).matchAll(/\s([\w:.-]+)\s*=\s*("([^"]*)"|'([^']*)')/g)) attrs.push({ name: a[1], raw: a[3] ?? a[4] });
    const self = raw.endsWith('/>');
    // (src + pos: where the element is — the id JSF gives a component without one is a property of the component tree, not of the render order)
    const el = { type: 'el', name, attrs, children: [], self, src: what, pos: lt };
    top().children.push(el);
    i = j + 1;
    if (self) continue;
    if (name === 'script' || name === 'style') {
      // the body of a script is code, not markup (the pages protect it with //<![CDATA[ … //]]>, which is kept as it is)
      const close = new RegExp(`</${name}\\s*>`).exec(text.slice(i));
      if (!close) throw new Error(`${what}: <${name}> is not closed`);
      el.children.push({ type: 'text', raw: text.slice(i, i + close.index) });
      i += close.index + close[0].length;
      continue;
    }
    stack.push(el);
  }
  if (stack.length !== 1) throw new Error(`${what}: <${top().name}> is not closed`);
  return root;
}

export const attr = (el, name) => el.attrs.find((a) => a.name === name)?.raw;
const elementsOf = (el) => el.children.filter((c) => c.type === 'el');

/* ================================================================================================ EL */

function tokenize(src) {
  const out = [];
  let i = 0;
  while (i < src.length) {
    const c = src[i];
    if (/\s/.test(c)) { i++; continue; }
    if (c === "'" || c === '"') {
      let j = i + 1;
      let s = '';
      while (j < src.length && src[j] !== c) {
        if (src[j] === '\\') { s += src[j + 1]; j += 2; } else s += src[j++];
      }
      if (j >= src.length) throw new Error(`EL: unterminated string in #{${src}}`);
      out.push({ t: 'str', v: s });
      i = j + 1;
      continue;
    }
    if (/\d/.test(c)) {
      const m = /^\d+(?:\.\d+)?/.exec(src.slice(i));
      out.push({ t: 'num', v: Number(m[0]) });
      i += m[0].length;
      continue;
    }
    if (/[A-Za-z_$]/.test(c)) {
      const m = /^[A-Za-z_$][\w$]*/.exec(src.slice(i));
      out.push({ t: 'id', v: m[0] });
      i += m[0].length;
      continue;
    }
    const two = src.slice(i, i + 2);
    if (['==', '!=', '&&', '||', '<=', '>='].includes(two)) { out.push({ t: 'op', v: two }); i += 2; continue; }
    if ('?:()[].!,<>'.includes(c)) { out.push({ t: 'op', v: c }); i++; continue; }
    throw new Error(`EL: unexpected "${c}" in #{${src}}`);
  }
  return out;
}

/** precedence climbing: ternary < or < and < eq/ne < lt/gt/le/ge < unary < postfix */
export function parseEl(src) {
  const toks = tokenize(src);
  let p = 0;
  const peek = () => toks[p];
  const isOp = (v) => peek()?.t === 'op' && peek().v === v;
  const isWord = (v) => peek()?.t === 'id' && peek().v === v;
  const expect = (v) => {
    if (!isOp(v)) throw new Error(`EL: expected "${v}" in #{${src}}`);
    p++;
  };
  const REL = { lt: '<', gt: '>', le: '<=', ge: '>=' };
  function ternary() {
    const c = or();
    if (isOp('?')) {
      p++;
      const a = ternary();
      expect(':');
      return { k: 'cond', c, a, b: ternary() };
    }
    return c;
  }
  function or() {
    let l = and();
    while (isWord('or') || isOp('||')) { p++; l = { k: 'or', l, r: and() }; }
    return l;
  }
  function and() {
    let l = eq();
    while (isWord('and') || isOp('&&')) { p++; l = { k: 'and', l, r: eq() }; }
    return l;
  }
  function eq() {
    let l = rel();
    for (;;) {
      if (isWord('eq') || isOp('==')) { p++; l = { k: 'eq', l, r: rel(), neg: false }; }
      else if (isWord('ne') || isOp('!=')) { p++; l = { k: 'eq', l, r: rel(), neg: true }; }
      else return l;
    }
  }
  function rel() {
    let l = unary();
    for (;;) {
      const t = peek();
      const op = t?.t === 'id' && REL[t.v] ? REL[t.v] : t?.t === 'op' && ['<', '>', '<=', '>='].includes(t.v) ? t.v : null;
      if (!op) return l;
      p++;
      l = { k: 'rel', op, l, r: unary() };
    }
  }
  function unary() {
    if (isWord('not') || isOp('!')) { p++; return { k: 'not', e: unary() }; }
    if (isWord('empty')) { p++; return { k: 'empty', e: unary() }; }
    return postfix();
  }
  function postfix() {
    let e = primary();
    for (;;) {
      if (isOp('.')) {
        p++;
        const t = peek();
        if (t?.t !== 'id') throw new Error(`EL: member name expected in #{${src}}`);
        p++;
        if (isOp('(')) {
          p++;
          const args = [];
          if (!isOp(')')) for (;;) { args.push(ternary()); if (isOp(',')) { p++; continue; } break; }
          expect(')');
          e = { k: 'call', o: e, name: t.v, args };
        } else e = { k: 'member', o: e, name: t.v };
      } else if (isOp('[')) {
        p++;
        const x = ternary();
        expect(']');
        e = { k: 'index', o: e, x };
      } else return e;
    }
  }
  function primary() {
    const t = peek();
    if (!t) throw new Error(`EL: unexpected end of #{${src}}`);
    if (t.t === 'str' || t.t === 'num') { p++; return { k: 'lit', v: t.v }; }
    if (isOp('(')) { p++; const e = ternary(); expect(')'); return e; }
    if (t.t === 'id') {
      p++;
      if (t.v === 'true') return { k: 'lit', v: true };
      if (t.v === 'false') return { k: 'lit', v: false };
      if (t.v === 'null') return { k: 'lit', v: null };
      return { k: 'id', name: t.v };
    }
    throw new Error(`EL: unexpected "${t.v}" in #{${src}}`);
  }
  const ast = ternary();
  if (p < toks.length) throw new Error(`EL: unexpected "${toks[p].v}" in #{${src}}`);
  return ast;
}

const astCache = new Map();
const astOf = (src) => {
  let a = astCache.get(src);
  if (!a) astCache.set(src, (a = parseEl(src)));
  return a;
};

/** a value only the running Angular page knows: a JS expression of the host */
export class Dyn {
  constructor(js, meta = {}) {
    this.js = js;
    this.meta = meta;
  }
}
/** `commonBean` · `request` · `param` · `sessionScope`: a name space whose members the environment knows */
class Space {
  constructor(name) {
    this.name = name;
  }
}
export const isDyn = (v) => v instanceof Dyn;

const jsStr = (s) => `'${s.replace(/\\/g, '\\\\').replace(/'/g, "\\'").replace(/"/g, '\\u0022').replace(/\n/g, '\\n').replace(/\r/g, '\\r')}'`;
const jsLit = (v) => (isDyn(v) ? v.js : v === null || v === undefined ? 'null' : typeof v === 'string' ? jsStr(v) : String(v));
const isEmpty = (v) => v === null || v === undefined || v === '' || (Array.isArray(v) && !v.length);
const truthy = (v) => (typeof v === 'string' ? v.toLowerCase() === 'true' : !!v);
function elEquals(a, b) {
  if (a === null || a === undefined || b === null || b === undefined) return (a ?? null) === (b ?? null);
  if (typeof a === 'boolean' || typeof b === 'boolean') return truthy(a) === truthy(b);
  if (typeof a === 'number' || typeof b === 'number') return Number(a) === Number(b);
  return String(a) === String(b);
}
const num = (v) => (v === null || v === undefined || v === '' ? 0 : Number(v));

/**
 * Evaluates an EL AST.
 * @param ctx { scope: Map, space(name, member): value, mode }
 */
function evalAst(ast, ctx) {
  const ev = (n) => evalAst(n, ctx);
  switch (ast.k) {
    case 'lit':
      return ast.v;
    case 'id': {
      if (ctx.scope.has(ast.name)) return ctx.scope.get(ast.name);
      if (['commonBean', 'request', 'param', 'sessionScope'].includes(ast.name)) return new Space(ast.name);
      return null; // an unknown name is null in Facelets
    }
    case 'member':
    case 'index': {
      const o = ev(ast.o);
      const name = ast.k === 'member' ? ast.name : ev(ast.x);
      if (isDyn(name)) throw new Error('EL: a member name only the running page knows');
      if (o instanceof Space) return ctx.space(o.name, String(name));
      if (isDyn(o)) return new Dyn(/^[A-Za-z_$][\w$]*$/.test(String(name)) ? `${o.js}.${name}` : `${o.js}[${jsLit(String(name))}]`);
      if (o && typeof o === 'object') return o[name] ?? null;
      return null;
    }
    case 'call': {
      const o = ev(ast.o);
      const args = ast.args.map(ev);
      if (o instanceof Space && o.name === 'commonBean' && ast.name === 'hasFeature') return ctx.space('commonBean', 'hasFeature', args);
      if (isDyn(o)) return new Dyn(`${o.js}.${ast.name}(${args.map(jsLit).join(', ')})`);
      if (o && typeof o === 'object' && typeof o[ast.name] === 'function') {
        if (args.some(isDyn)) throw new Error('EL: a call with an argument only the running page knows on a value of the server');
        return o[ast.name](...args);
      }
      // EL 3.0 calls the methods of java.lang.String on a string (the prospect form: `code.concat(' ').concat(tel)`)
      if (typeof o === 'string' && typeof String.prototype[ast.name] === 'function') {
        if (args.some(isDyn)) throw new Error('EL: a call with an argument only the running page knows on a value of the server');
        return String.prototype[ast.name].apply(o, args);
      }
      throw new Error(`EL: call of ${ast.name}() is not supported`);
    }
    case 'not': {
      const v = ev(ast.e);
      return isDyn(v) ? new Dyn(`!${v.js}`) : !truthy(v);
    }
    case 'empty': {
      const v = ev(ast.e);
      // a string, an array or nothing (a number or a boolean has no length: never empty, as in EL)
      return isDyn(v) ? new Dyn(`(${v.js} == null || ${v.js}.length === 0)`) : isEmpty(v);
    }
    case 'eq': {
      const a = ev(ast.l);
      const b = ev(ast.r);
      if (isDyn(a) || isDyn(b)) return new Dyn(`(${jsLit(a)} ${ast.neg ? '!==' : '==='} ${jsLit(b)})`);
      return elEquals(a, b) !== ast.neg;
    }
    case 'rel': {
      const a = ev(ast.l);
      const b = ev(ast.r);
      if (isDyn(a) || isDyn(b)) return new Dyn(`(${jsLit(a)} ${ast.op} ${jsLit(b)})`);
      const [x, y] = [num(a), num(b)];
      return ast.op === '<' ? x < y : ast.op === '>' ? x > y : ast.op === '<=' ? x <= y : x >= y;
    }
    case 'and':
    case 'or': {
      const a = ev(ast.l);
      if (!isDyn(a)) {
        if (ast.k === 'and' ? !truthy(a) : truthy(a)) return truthy(a);
        const b = ev(ast.r);
        return isDyn(b) ? b : truthy(b);
      }
      const b = ev(ast.r);
      return new Dyn(`(${a.js} ${ast.k === 'and' ? '&&' : '||'} ${jsLit(b)})`);
    }
    case 'cond': {
      const c = ev(ast.c);
      if (!isDyn(c)) return truthy(c) ? ev(ast.a) : ev(ast.b);
      return new Dyn(`(${c.js} ? ${jsLit(ev(ast.a))} : ${jsLit(ev(ast.b))})`);
    }
    default:
      throw new Error('EL: node ' + ast.k);
  }
}

/** the pieces of a text: `{ text }` and `{ el }` (the closing brace is found outside of a string literal) */
function* elParts(text) {
  let i = 0;
  let last = 0;
  while (i < text.length) {
    const s = text.indexOf('#{', i);
    if (s < 0) break;
    let j = s + 2;
    let q = '';
    while (j < text.length) {
      const c = text[j];
      if (q) { if (c === '\\') j++; else if (c === q) q = ''; }
      else if (c === "'" || c === '"') q = c;
      else if (c === '}') break;
      j++;
    }
    if (j >= text.length) throw new Error('EL: unterminated #{ in: ' + text.slice(s, s + 80));
    if (s > last) yield { text: text.slice(last, s) };
    yield { el: text.slice(s + 2, j) };
    i = j + 1;
    last = i;
  }
  if (last < text.length) yield { text: text.slice(last) };
}

/* ================================================================================================ output helpers */

const VOID = new Set(['img', 'input', 'br', 'hr', 'meta', 'link']);
/** HTML escape of a VALUE the server wrote (`&` `<` `>` `"`) */
export const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
/** text for an Angular template: `@ { }` would start syntax */
const ngEsc = (s) => s.replace(/@/g, '&#64;').replace(/\{/g, '&#123;').replace(/\}/g, '&#125;');
/** the markup-safe form of a value (a Dyn is a sentinel for sentinelsToAngular) */
/** `<` `>` `&` of an expression written into markup (Angular decodes the entities before it reads the expression) */
const jsInMarkup = (js) => js.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const out = (v, mode) => (isDyn(v) ? `${SENTINEL_OPEN}${jsInMarkup(v.js)}${SENTINEL_CLOSE}` : v === null || v === undefined ? '' : mode === 'java' ? esc(v) : ngEsc(esc(v)));

/* ================================================================================================ rendering */

/**
 * The environment of a render.
 * @param o
 * @param o.mode      'java' | 'ng'
 * @param o.read      (path under web/) => text of an included file
 * @param o.msg       java: (key) => text
 * @param o.can       java: (featureKeys) => boolean
 * @param o.bean      java: the state of `sales_documentView` (an object); ng: ignored (the bean is the JS name `bean`)
 * @param o.session   java: values of `commonBean` ({ timeZone, uploadMaxBytes, uploadMaxLabel }) and the context path
 * @param o.params    request parameters (`param.x`)
 * @param o.ctxPath   java: '/triplesale'
 * @param o.formAction  the `action` of an `h:form`
 * @param o.vars      extra variables of the scope (java: values, ng: Dyn)
 */
export function createRenderer(o) {
  const mode = o.mode;
  const used = { msgKeys: new Set(), features: new Set() };
  const widgets = []; // PrimeFaces widgets of the page: { type, id, cfg }

  const space = (name, member, args) => {
    if (name === 'commonBean') {
      if (member === 'msg') return new Space('commonBean.msg');
      if (member === 'hasFeature') {
        const keys = String(args[0]);
        used.features.add(keys);
        return mode === 'java' ? o.can(keys) : new Dyn(`can(${jsLit(keys)})`);
      }
      const key = `commonBean.${member}`;
      if (mode === 'java') {
        if (!(member in (o.session ?? {}))) throw new Error(`EL: commonBean.${member} is not known`);
        return o.session[member];
      }
      return new Dyn(`env.${member}`, { server: key });
    }
    if (name === 'commonBean.msg') {
      used.msgKeys.add(member);
      return mode === 'java' ? o.msg(member) : new Dyn(`t(${jsLit(member)})`, { msgKey: member });
    }
    if (name === 'request') {
      if (member !== 'contextPath') throw new Error(`EL: request.${member} is not known`);
      return mode === 'java' ? o.ctxPath ?? '/triplesale' : CTX_MARK;
    }
    if (name === 'param') return o.params && member in o.params ? o.params[member] : null;
    throw new Error(`EL: ${name}.${member} is not known`);
  };

  const evalCtx = (scope) => ({ scope, space });
  const evalEl = (src, scope) => evalAst(astOf(src), evalCtx(scope));

  /** the value of an attribute / text with EL: a single `#{…}` keeps its value, anything else is a string (Dyn when a part is) */
  function valueOf(raw, scope) {
    const parts = [...elParts(raw)];
    if (parts.length === 1 && parts[0].el !== undefined) return evalEl(parts[0].el, scope);
    const vals = parts.map((p) => (p.el !== undefined ? evalEl(p.el, scope) : p.text));
    if (vals.some(isDyn)) return new Dyn('(' + vals.map((v) => (isDyn(v) ? `(${v.js})` : jsLit(v === null ? '' : String(v)))).join(' + ') + ')');
    return vals.map((v) => (v === null || v === undefined ? '' : String(v))).join('');
  }
  /** a string for text / attribute (null = ''): static or Dyn */
  const strOf = (raw, scope) => {
    const v = valueOf(raw, scope);
    return v === null || v === undefined ? '' : v;
  };

  /** `rendered="…"`: true / false, or a Dyn */
  function renderedOf(el, scope) {
    const raw = attr(el, 'rendered');
    if (raw === undefined) return true;
    const v = valueOf(raw, scope);
    return isDyn(v) ? v : truthy(v);
  }

  /** text of an attribute whose value may be an EL: an entity written in the page stays as written, a value of the server is escaped */
  function attrText(raw, scope) {
    const parts = [...elParts(raw)];
    if (parts.length === 1 && parts[0].text !== undefined) return parts[0].text; // as written
    let s = '';
    for (const p of parts) {
      if (p.text !== undefined) s += p.text;
      else {
        const v = evalEl(p.el, scope);
        s += out(v === null ? '' : v, mode);
      }
    }
    return s;
  }

  /**
   * The id of a component without one (`j_idtN`). JSF numbers the components of the TREE, so a component keeps its id however often the view is drawn and
   * whatever `rendered` / the rows of a repeat say; here the id belongs to the element of the page file (`o.ids` is shared by the renders of one view — the
   * ajax answers of the replica server must carry the ids of the page the browser holds). Without an element: the next number.
   */
  const ids = o.ids ?? { map: new Map(), n: o.idStart ?? 1 };
  const nextId = (el) => {
    if (!el || el.src === undefined) return `j_idt${ids.n++}`;
    const key = `${el.src}@${el.pos}`;
    let id = ids.map.get(key);
    if (!id) ids.map.set(key, (id = `j_idt${ids.n++}`));
    return id;
  };
  /** the page's own bookkeeping, filled by the components: input bindings, ajax actions, uploads, remote commands */
  const bindings = [];
  const actions = [];
  const uploads = [];
  const remoteCommands = [];
  /** attributes of the page's components that the renderers of pf-dom.mjs do not read (see KNOWN_ATTRS there) */
  const ignoredAttrs = [];

  /** the rendering environment passed to components */
  const R = {
    mode,
    o,
    used,
    widgets,
    bindings,
    actions,
    uploads,
    remoteCommands,
    ignoredAttrs,
    /** the JS of a value (static or Dyn) for an Angular binding */
    dynJs: (v) => jsLit(v === undefined ? null : v),
    evalEl,
    valueOf,
    strOf,
    attrText,
    nextId,
    out: (v) => out(v, mode),
    jsLit,
    isDyn,
    Dyn,
    renderChildren: (el, scope, form) => renderNodes(el.children, scope, form),
  };

  /* -------------------------------------------------------------------------------------------- the tree */
  function renderNodes(nodes, scope, form) {
    let s = '';
    for (const n of nodes) s += renderNode(n, scope, form);
    return s;
  }

  function renderPlain(el, scope, form) {
    const attrs = el.attrs
      .map((a) => {
        const raw = mode === 'ng' && o.rewriteAttr ? o.rewriteAttr(el.name, a.name, a.raw) : a.raw;
        return raw === null ? '' : ` ${a.name}="${attrText(raw, scope)}"`;
      })
      .join('');
    if (VOID.has(el.name) || (el.self && VOID.has(el.name))) return `<${el.name}${attrs}/>`;
    if (el.name === 'script' || el.name === 'style') {
      // code: the page's own scripts are handled by the generators; in the Java markup they are written as they are
      if (mode !== 'java') return '';
      // the EL of the code is written by the server like any text of the page (messages, the upload limit …)
      // (a script without a CDATA section is XML text to Facelets: &amp; &lt; &gt; reach the browser as & < >, and a value of the server is not escaped in it)
      const rawCode = el.children.map((c) => c.raw).join('');
      const cdata = rawCode.includes('<![CDATA[');
      const xmlText = cdata ? rawCode : rawCode.replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&');
      const code = xmlText.replace(/#\{[^}]*\}/g, (m) => {
        const v = evalEl(m.slice(2, -1).trim(), scope);
        return v === null || v === undefined ? '' : cdata ? jsInMarkup(String(v)) : String(v);
      });
      return `<${el.name}${attrs}>${code}</${el.name}>`;
    }
    return `<${el.name}${attrs}>${renderNodes(el.children, scope, form)}</${el.name}>`;
  }

  function renderNode(n, scope, form) {
    if (n.type === 'text') {
      if (n.raw.startsWith('<![CDATA[')) return n.raw;
      let s = '';
      for (const p of elParts(n.raw)) {
        if (p.text !== undefined) s += mode === 'java' ? p.text : ngEsc(p.text);
        else {
          const v = evalEl(p.el, scope);
          s += out(v === null ? '' : v, mode);
        }
      }
      return s;
    }
    const name = n.name;
    // ---- Facelets
    if (name === 'ui:composition' || name === 'ui:define') return renderNodes(n.children, scope, form);
    if (name === 'ui:param') {
      scope.set(attr(n, 'name'), valueOf(attr(n, 'value') ?? '', scope));
      return '';
    }
    if (name === 'ui:fragment') return withRendered(n, scope, () => renderNodes(n.children, scope, form));
    if (name === 'ui:include') {
      const src = attr(n, 'src');
      const child = new Map(scope);
      for (const x of elementsOf(n)) if (x.name === 'ui:param') child.set(attr(x, 'name'), valueOf(attr(x, 'value') ?? '', scope));
      const tree = parseXml(o.read(src.replace(/^\//, '')), src);
      return renderNodes(tree.children, child, form);
    }
    if (name === 'ui:repeat') return renderRepeat(n, scope, form);
    // ---- JSF / PrimeFaces components
    if (/^(h|p|f):/.test(name)) return pfComponent(R, n, scope, form);
    return renderPlain(n, scope, form);
  }

  /** `rendered`: java drops or keeps; ng wraps in `@if` */
  function withRendered(el, scope, body) {
    const r = renderedOf(el, scope);
    if (!isDyn(r)) {
      if (r) return body();
      // the component tree still holds what is not rendered: its components have numbers (j_idtN) and the ones after them keep theirs — the Angular template
      // (which draws both branches of a `rendered`) numbers them all in the order of the page
      if (mode === 'java') reserveIds(el);
      return '';
    }
    return `@if (${r.js}) {${body()}}`;
  }
  /** numbers the components without an id of `el` (and `el` itself), in page order, as drawing them would */
  function reserveIds(el) {
    if (needsGeneratedId(el)) nextId(el);
    for (const c of el.children) if (c.type === 'el') reserveIds(c);
  }
  R.withRendered = withRendered;

  function renderRepeat(el, scope, form) {
    const list = valueOf(attr(el, 'value'), scope);
    const v = attr(el, 'var');
    const status = attr(el, 'varStatus');
    const repeatId = nextId(el);
    if (mode === 'java') {
      let s = '';
      (list ?? []).forEach((item, index) => {
        const child = new Map(scope);
        child.set('__rows', `${repeatId}:${index}:`);
        child.set(v, item);
        if (status) child.set(status, { index, count: index + 1, first: index === 0, last: index === list.length - 1 });
        s += renderNodes(el.children, child, form);
      });
      return s;
    }
    if (!isDyn(list)) throw new Error('ui:repeat over a value only the generator knows');
    const child = new Map(scope);
    child.set(v, new Dyn(v));
    child.set('__rows', `${repeatId}:${SENTINEL_OPEN}${status ?? 'status'}Index${SENTINEL_CLOSE}:`);
    child.set('__index', `${status ?? 'status'}Index`);
    if (status) child.set(status, new Dyn(`${status}`, { status: true }));
    const body = renderNodes(el.children, child, form);
    // a status.index is the $index of the @for; the loop variable is named after the page's own
    return `@for (${v} of ${list.js}; track $index; let ${status ?? 'status'}Index = $index) {${body.replace(new RegExp(`\\b${status}\\.index\\b`, 'g'), `${status}Index`)}}`;
  }

  /** the file as a tree, its `ui:define` (or the whole body) rendered */
  function renderFile(path, defineName, scope = new Map()) {
    const tree = parseXml(o.read(path), path);
    const comp = elementsOf(tree).find((e) => e.name === 'ui:composition');
    const root = comp ?? tree;
    const sc = new Map(Object.entries(o.vars ?? {}));
    for (const [k, v] of scope) sc.set(k, v);
    const defs = elementsOf(root).filter((e) => e.name === 'ui:define');
    const target = defs.find((d) => attr(d, 'name') === defineName);
    if (!target) throw new Error(`${path}: no <ui:define name="${defineName}">`);
    // the top-level ui:param of the composition apply to every define
    for (const e of elementsOf(root)) if (e.name === 'ui:param') sc.set(attr(e, 'name'), valueOf(attr(e, 'value') ?? '', sc));
    return renderNodes(target.children, sc, null);
  }

  /** the `<script>` / `<style>` / `<link>` of a define, extracted as data instead of markup */
  function partsOf(path, defineName) {
    const tree = parseXml(o.read(path), path);
    const comp = elementsOf(tree).find((e) => e.name === 'ui:composition') ?? tree;
    const target = elementsOf(comp).find((d) => d.name === 'ui:define' && attr(d, 'name') === defineName);
    if (!target) return { scripts: [], styles: [], links: [], scriptSrc: [] };
    const found = { scripts: [], styles: [], links: [], scriptSrc: [] };
    const walk = (nodes) => {
      for (const n of nodes) {
        if (n.type !== 'el') continue;
        if (n.name === 'script') {
          const src = attr(n, 'src');
          if (src) found.scriptSrc.push({ src, attrs: Object.fromEntries(n.attrs.map((a) => [a.name, a.raw])) });
          else found.scripts.push(n.children.map((c) => c.raw).join(''));
        } else if (n.name === 'style') found.styles.push(n.children.map((c) => c.raw).join(''));
        else if (n.name === 'link') found.links.push(attr(n, 'href'));
        else walk(n.children);
      }
    };
    walk(target.children);
    return found;
  }

  /** the scripts / styles of a whole file (an include has no ui:define) */
  function partsOfFile(path) {
    const tree = parseXml(o.read(path), path);
    const found = { scripts: [], styles: [], links: [], scriptSrc: [] };
    const walk = (nodes) => {
      for (const n of nodes) {
        if (n.type !== 'el') continue;
        if (n.name === 'script') {
          const src = attr(n, 'src');
          if (src) found.scriptSrc.push({ src, attrs: Object.fromEntries(n.attrs.map((a) => [a.name, a.raw])) });
          else found.scripts.push(n.children.map((c) => c.raw).join(''));
        } else if (n.name === 'style') found.styles.push(n.children.map((c) => c.raw).join(''));
        else if (n.name === 'link') found.links.push(attr(n, 'href'));
        else walk(n.children);
      }
    };
    walk(tree.children);
    return found;
  }

  return { R, renderFile, renderNodes, partsOf, partsOfFile, used, widgets, bindings, actions, uploads, remoteCommands, ignoredAttrs, evalEl, valueOf, parseXml };
}

/** the final pass of a template-mode markup: sentinels → Angular interpolation / `[attr.x]` bindings */
export function toAngular(tpl, what) {
  return sentinelsToAngular(tpl, what);
}
