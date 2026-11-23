/**
 * A small Facelets processor for the pages of the menu group "งานขาย": it evaluates a Java page (`<ui:composition>` + `<ui:define>` +
 * `<ui:include>` / `<ui:param>` / `<ui:fragment rendered>` + the EL of the markup) the way the server does, so that both the
 * generators (tools/sync-sales-doc-*.mjs) and the comparison harness (the Java replica) work from the SAME reading of the original.
 *
 * Why it exists: tools/lib/port-kit.mjs `expandIncludes()` pastes the body of an included file and replaces `#{param}` by the text of
 * the value — enough for the receipt pages, not for the sales documents (22 components that pass 175 parameters on, compute new ones
 * with `#{empty x ? 'a' : x}`, decide with `rendered="#{v25 eq 'qt'}"`, and build message keys with `commonBean.msg[isAd ? 'a' : 'b']`).
 *
 * Two modes:
 *   'java'      the page as the server sends it: every EL is replaced by its value (messages of the bundle, the user, the branch …).
 *   'template'  the page for the Angular template: what is known when the page is generated (parameters, conditions) is resolved;
 *               what the server decides per request stays symbolic and is written as a sentinel `\u0003<js>\u0004` where <js> is a
 *               JS expression of the Angular host (`t('label.x')`, `ini.branchName`, `(ini.lang === 'en' ? … : …)`), and
 *               `<ui:fragment rendered="#{commonBean.hasFeature('X')}">` is kept as it is (markupToTemplate turns it into `@if (can('X'))`).
 *
 * The EL subset (everything the 29 files use; anything else throws): string / number / boolean literals, identifiers, `a.b`, `a['b']`,
 * `a.f(x)` (only `hasFeature` and the String `concat`), `not` `!`, `empty`, `eq` `==`, `ne` `!=`, `and` `&&`, `or` `||`, `? :`, `( )`.
 * An identifier that is not a parameter is `null` (as in Facelets). Output is raw (no escaping) like the server's: the messages used in
 * markup are checked by the generators (checkMarkupMessages).
 *
 * The Java files are only READ.
 */

export const SENTINEL_OPEN = '\u0003';
export const SENTINEL_CLOSE = '\u0004';
/** `#{request.contextPath}` in template mode — the generator swaps it (images → assets/images, …) and refuses what is left */
export const CTX_MARK = '@@CTX@@';

/* ------------------------------------------------------------------------------------------------ values */

/** a value only the running page knows: a JS expression of the Angular host */
export class Dyn {
  constructor(js, meta = {}) {
    this.js = js;
    this.meta = meta; // { msgKey?, ini? }
  }
}
/** `commonBean.hasFeature('A,B')` */
class Feature {
  constructor(keys) {
    this.keys = keys;
  }
}
/** `commonBean`, `sessionScope`, `request`, `param`: a name space whose members the environment knows */
class Space {
  constructor(name) {
    this.name = name;
  }
}

const isDyn = (v) => v instanceof Dyn;
const jsLit = (v) => (isDyn(v) ? v.js : v === null || v === undefined ? "''" : typeof v === 'string' ? "'" + v.replace(/\\/g, '\\\\').replace(/'/g, "\\'") + "'" : String(v));

/** the server-side values of the session, and what each looks like in the Angular host (`ini.<name>`) */
export const SERVER_VALUES = {
  'commonBean.activeBranchName': 'branchName',
  'commonBean.activeBranchId': 'branchId',
  'commonBean.activeBranchCode': 'branchCode',
  'commonBean.username': 'username',
  'commonBean.currentLang': 'lang',
  'commonBean.uploadAcceptExt': 'uploadAcceptExt',
  'sessionScope.ss_profile_name': 'profileName',
  'sessionScope.ss_employee_id': 'employeeId',
  'sessionScope.ss_roles': 'roles',
};

/* ------------------------------------------------------------------------------------------------ EL parser */

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
    if (['==', '!=', '&&', '||'].includes(two)) { out.push({ t: 'op', v: two }); i += 2; continue; }
    if ('?:()[].!,'.includes(c)) { out.push({ t: 'op', v: c }); i++; continue; }
    throw new Error(`EL: unexpected "${c}" in #{${src}}`);
  }
  return out;
}

/** precedence climbing: ternary < or < and < eq/ne < unary < postfix */
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
  function ternary() {
    const c = or();
    if (isOp('?')) {
      p++;
      const a = ternary();
      expect(':');
      const b = ternary();
      return { k: 'cond', c, a, b };
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
    let l = unary();
    for (;;) {
      if (isWord('eq') || isOp('==')) { p++; l = { k: 'eq', l, r: unary(), neg: false }; }
      else if (isWord('ne') || isOp('!=')) { p++; l = { k: 'eq', l, r: unary(), neg: true }; }
      else return l;
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

/* ------------------------------------------------------------------------------------------------ EL evaluation */

const isEmpty = (v) => v === null || v === undefined || v === '' || (Array.isArray(v) && !v.length);
const truthy = (v) => (typeof v === 'string' ? v.toLowerCase() === 'true' : !!v);

/** EL `eq`: Boolean / Number operands coerce the other side, otherwise the String forms are compared */
function elEquals(a, b) {
  if (a === null || a === undefined || b === null || b === undefined) return (a ?? null) === (b ?? null);
  if (typeof a === 'boolean' || typeof b === 'boolean') return truthy(a) === truthy(b);
  if (typeof a === 'number' || typeof b === 'number') return Number(a) === Number(b);
  return String(a) === String(b);
}

/**
 * @param ast
 * @param ctx { vars: Scope, mode: 'java'|'template', server: { msg(key), feature(keys), value(path), param(name) } }
 */
function evalAst(ast, ctx) {
  const ev = (n) => evalAst(n, ctx);
  switch (ast.k) {
    case 'lit':
      return ast.v;
    case 'id': {
      if (ctx.vars.has(ast.name)) return ctx.vars.get(ast.name);
      if (['commonBean', 'sessionScope', 'request', 'param'].includes(ast.name)) return new Space(ast.name);
      return null;
    }
    case 'member':
    case 'index': {
      const o = ev(ast.o);
      const name = ast.k === 'member' ? ast.name : ev(ast.x);
      if (isDyn(name)) throw new Error('EL: a member name that only the running page knows');
      if (o instanceof Space) {
        if (o.name === 'commonBean' && name === 'msg') return new Space('commonBean.msg');
        if (o.name === 'commonBean.msg') return ctx.server.msg(String(name));
        if (o.name === 'param') return ctx.server.param(String(name));
        return ctx.server.value(`${o.name}.${name}`);
      }
      if (o && typeof o === 'object' && !isDyn(o)) return o[name] ?? null;
      return null;
    }
    case 'call': {
      const o = ev(ast.o);
      const args = ast.args.map(ev);
      if (o instanceof Space && o.name === 'commonBean' && ast.name === 'hasFeature') {
        if (typeof args[0] !== 'string') throw new Error('EL: hasFeature with a computed argument');
        return ctx.server.feature(args[0]);
      }
      if (ast.name === 'concat' && (typeof o === 'string' || isDyn(o))) {
        if (isDyn(o) || args.some(isDyn)) return new Dyn(`(${jsLit(o)} + ${jsLit(args[0])})`);
        return o + String(args[0] ?? '');
      }
      throw new Error(`EL: call of ${ast.name}() is not supported`);
    }
    case 'not': {
      const v = ev(ast.e);
      return isDyn(v) ? new Dyn(`!${v.js}`) : v instanceof Feature ? bad('not hasFeature') : !truthy(v);
    }
    case 'empty': {
      const v = ev(ast.e);
      return isDyn(v) ? new Dyn(`!${v.js}`) : isEmpty(v);
    }
    case 'eq': {
      const a = ev(ast.l);
      const b = ev(ast.r);
      if (isDyn(a) || isDyn(b)) return new Dyn(`(${jsLit(a)} ${ast.neg ? '!==' : '==='} ${jsLit(b)})`);
      return elEquals(a, b) !== ast.neg;
    }
    case 'and':
    case 'or': {
      const a = ev(ast.l);
      if (!isDyn(a)) {
        if (a instanceof Feature) return bad('hasFeature combined with another condition');
        if (ast.k === 'and' ? !truthy(a) : truthy(a)) return truthy(a);
        const b = ev(ast.r);
        return isDyn(b) ? b : b instanceof Feature ? bad('hasFeature combined with another condition') : truthy(b);
      }
      const b = ev(ast.r);
      return new Dyn(`(${a.js} ${ast.k === 'and' ? '&&' : '||'} ${jsLit(b)})`);
    }
    case 'cond': {
      const c = ev(ast.c);
      if (!isDyn(c)) return truthy(c) ? ev(ast.a) : ev(ast.b);
      const a = ev(ast.a);
      const b = ev(ast.b);
      // both branches are the same fixed text: the condition does not matter (company address line 2 …)
      if (!isDyn(a) && !isDyn(b) && a === b) return a;
      return new Dyn(`(${c.js} ? ${jsLit(a)} : ${jsLit(b)})`);
    }
    default:
      throw new Error('EL: node ' + ast.k);
  }
}
function bad(what) {
  throw new Error('EL: not supported: ' + what);
}

const cache = new Map();
const astOf = (src) => {
  let a = cache.get(src);
  if (!a) cache.set(src, (a = parseEl(src)));
  return a;
};

/** the value of an EL expression (the text between `#{` and `}`) */
export function evaluate(src, ctx) {
  return evalAst(astOf(src), ctx);
}

/* ------------------------------------------------------------------------------------------------ text with EL */

/** `#{…}` bodies of a text: finds the closing brace outside of a string literal */
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

/** a value as it is written into markup */
function show(v, ctx) {
  if (isDyn(v)) {
    if (ctx.mode === 'java') throw new Error('internal: a Dyn value in java mode');
    return SENTINEL_OPEN + v.js + SENTINEL_CLOSE;
  }
  if (v instanceof Feature) throw new Error('hasFeature(…) may only be used as rendered="…" of a ui:fragment');
  if (v instanceof Space) throw new Error('EL: a name space (' + v.name + ') used as a value');
  return v === null || v === undefined ? '' : String(v);
}

/** the text with its EL resolved (raw, no escaping) */
export function expandText(text, ctx) {
  let out = '';
  for (const part of elParts(text)) out += part.el !== undefined ? show(evaluate(part.el, ctx), ctx) : part.text;
  return out;
}

/** a `value="…"` of ui:param: one pure `#{…}` keeps its type (boolean / number), anything else is a string */
function paramValue(raw, ctx) {
  const parts = [...elParts(raw)];
  if (parts.length === 1 && parts[0].el !== undefined) return evaluate(parts[0].el, ctx);
  const vals = parts.map((p) => (p.el !== undefined ? evaluate(p.el, ctx) : p.text));
  if (vals.some(isDyn)) return new Dyn('(' + vals.map(jsLit).join(' + ') + ')');
  return vals.map((v) => (v === null || v === undefined ? '' : String(v))).join('');
}

/** `rendered="…"`: true / false, an EL, or `hasFeature('X')` (kept in template mode) */
function renderedOf(raw, ctx) {
  if (raw === undefined) return true;
  const v = paramValue(raw, ctx);
  if (v instanceof Feature) return v; // decided by the caller
  if (isDyn(v)) throw new Error(`ui:fragment rendered="${raw}" depends on something only the running page knows`);
  return truthy(v);
}

/* ------------------------------------------------------------------------------------------------ the document */

/** one lexical item of a Facelets file */
function lex(text) {
  const items = [];
  let i = 0;
  const push = (type, raw, extra = {}) => items.push({ type, raw, ...extra });
  while (i < text.length) {
    const lt = text.indexOf('<', i);
    if (lt < 0) { push('text', text.slice(i)); break; }
    if (lt > i) push('text', text.slice(i, lt));
    if (text.startsWith('<!--', lt)) {
      const e = text.indexOf('-->', lt);
      if (e < 0) throw new Error('unterminated comment');
      push('comment', text.slice(lt, e + 3));
      i = e + 3;
      continue;
    }
    // <?xml … ?>
    if (text.startsWith('<?', lt)) {
      const e = text.indexOf('?>', lt);
      push('comment', text.slice(lt, e + 2));
      i = e + 2;
      continue;
    }
    // a tag: up to the matching `>` (outside of attribute quotes)
    let j = lt + 1;
    let q = '';
    while (j < text.length) {
      const c = text[j];
      if (q) { if (c === q) q = ''; }
      else if (c === '"' || c === "'") q = c;
      else if (c === '>') break;
      j++;
    }
    if (j >= text.length) throw new Error('unterminated tag: ' + text.slice(lt, lt + 80));
    const raw = text.slice(lt, j + 1);
    const m = /^<(\/?)([A-Za-z][\w:.-]*)/.exec(raw);
    if (!m) throw new Error('not a tag: ' + raw.slice(0, 60));
    const name = m[2];
    const closing = !!m[1];
    const self = raw.endsWith('/>');
    // raw-text elements: the body is not markup
    if (!closing && !self && (name === 'script' || name === 'style')) {
      const from = j + 1;
      const closeTag = new RegExp(`</${name}\\s*>`, 'i').exec(text.slice(from));
      if (!closeTag) throw new Error(`<${name}> is not closed`);
      push('raw', raw, { name, body: text.slice(from, from + closeTag.index), close: closeTag[0] });
      i = from + closeTag.index + closeTag[0].length;
      continue;
    }
    push(name.startsWith('ui:') ? 'ui' : 'tag', raw, { name, closing, self });
    i = j + 1;
  }
  return items;
}

/** attributes of a tag: { name: rawValue } */
function attrsOf(raw) {
  const out = {};
  for (const m of raw.matchAll(/\s([\w:.-]+)\s*=\s*("([^"]*)"|'([^']*)')/g)) out[m[1]] = m[3] ?? m[4];
  return out;
}

/** a tag with the EL of its attribute values resolved (an attribute that resolves to nothing at all is kept with an empty value) */
function expandTag(raw, ctx) {
  if (!raw.includes('#{')) return raw;
  return raw.replace(/(\s[\w:.-]+\s*=\s*)("([^"]*)"|'([^']*)')/g, (m, pre, q, dq, sq) => {
    const v = dq ?? sq;
    if (!v.includes('#{')) return m;
    const quote = dq !== undefined ? '"' : "'";
    return pre + quote + expandText(v, ctx) + quote;
  });
}

/**
 * The script / style text of a page: EL is not replaced by sentinels (the generators' parser reads the JS with its EL):
 *   'java' mode       everything is replaced by its value;
 *   'template' mode   a message stays `#{commonBean.msg['key']}` (key resolved), `request.contextPath` stays, a fixed value is written in.
 */
function expandCode(text, ctx) {
  if (!text.includes('#{')) return text;
  if (ctx.mode === 'java') return expandText(text, ctx);
  let out = '';
  for (const part of elParts(text)) {
    if (part.text !== undefined) { out += part.text; continue; }
    if (part.el.trim() === 'request.contextPath') { out += '#{request.contextPath}'; continue; }
    const v = evaluate(part.el, ctx);
    if (isDyn(v)) {
      if (v.meta.msgKey) out += `#{commonBean.msg['${v.meta.msgKey}']}`;
      else if (v.meta.ini) throw new Error(`a server value (#{${part.el}}) inside a script: add it to the engine environment`);
      else throw new Error(`#{${part.el}} inside a script depends on the running page`);
    } else out += v === null || v === undefined ? '' : String(v);
  }
  return out;
}

/**
 * Evaluates the Facelets text `text` in `scope` and returns the markup.
 * @param read  (path relative to web/) => text
 * @param dir   folder (under web/) of the file the text is from — relative `src` of ui:include are resolved from it
 */
function render(text, scope, ctx, read, dir, what) {
  const items = lex(text);
  let out = '';
  for (let n = 0; n < items.length; n++) {
    const it = items[n];
    switch (it.type) {
      case 'comment':
        break;
      case 'text':
        out += expandText(it.raw, { ...ctx, vars: scope });
        break;
      case 'tag':
        out += expandTag(it.raw, { ...ctx, vars: scope });
        break;
      case 'raw':
        out += expandTag(it.raw, { ...ctx, vars: scope }) + expandCode(it.body, { ...ctx, vars: scope }) + it.close;
        break;
      case 'ui': {
        const c = { ...ctx, vars: scope };
        const tag = it.name;
        if (tag === 'ui:composition') {
          // the wrapper of the file: only its content counts
          break;
        }
        if (tag === 'ui:param') {
          if (it.closing) break;
          const a = attrsOf(it.raw);
          scope.set(a.name, paramValue(a.value ?? '', c));
          break;
        }
        if (tag === 'ui:define') throw new Error(`${what}: unexpected <ui:define> (use renderDefines)`);
        if (tag === 'ui:fragment' || tag === 'ui:include') {
          if (it.closing) throw new Error(`${what}: unbalanced </${tag}>`);
          // the content of the element, up to its end tag (nested ones of the same name counted)
          let inner = [];
          if (!it.self) {
            let depth = 1;
            let k = n + 1;
            for (; k < items.length; k++) {
              const x = items[k];
              if (x.type === 'ui' && x.name === tag && !x.self) depth += x.closing ? -1 : 1;
              if (depth === 0) break;
            }
            if (k >= items.length) throw new Error(`${what}: <${tag}> is not closed`);
            inner = items.slice(n + 1, k);
            n = k;
          }
          if (tag === 'ui:fragment') {
            const a = attrsOf(it.raw);
            const r = renderedOf(a.rendered, c);
            const body = () => render(joinItems(inner), scope, ctx, read, dir, what);
            if (r instanceof Feature) {
              if (ctx.mode === 'java') out += ctx.server.featuresOn ? body() : '';
              else out += `<ui:fragment rendered="#{commonBean.hasFeature('${r.keys}')}">` + body() + '</ui:fragment>';
            } else if (r) out += body();
            break;
          }
          // ui:include: the params are evaluated where the include stands, the file sees them on top of everything it inherits
          const a = attrsOf(it.raw);
          const src = a.src;
          const rel = (src.startsWith('/') ? src.slice(1) : `${dir}/${src}`).replace(/[^/]+\/\.\.\//g, '');
          const child = new Map(scope);
          for (const x of inner) {
            if (x.type === 'ui' && x.name === 'ui:param' && !x.closing) {
              const pa = attrsOf(x.raw);
              child.set(pa.name, paramValue(pa.value ?? '', c));
            }
          }
          out += render(read(rel), child, ctx, read, rel.slice(0, rel.lastIndexOf('/')), `${what} > ${src}`);
          break;
        }
        throw new Error(`${what}: <${tag}> is not supported`);
      }
      default:
        throw new Error('lex: ' + it.type);
    }
  }
  return out;
}
const joinItems = (items) => items.map((x) => x.raw + (x.type === 'raw' ? x.body + x.close : '')).join('');

/**
 * Evaluates a page file: the top-level `ui:param`s, then every `ui:define`.
 * @param o
 * @param o.read      (path under web/) => text
 * @param o.file      e.g. 'pages/sales_doc_qt_form.xhtml'
 * @param o.mode      'java' | 'template'
 * @param o.msg       (key) => text      the bundle of the language (java mode); template mode needs only `has(key)` to refuse a missing key
 * @param o.session   values of the session in java mode: { branchName, branchId, branchCode, username, lang, uploadAcceptExt, profileName, employeeId, roles }
 * @param o.params    request parameters (`param.doc` …) and extra variables
 * @param o.featuresOn  java mode: do the `hasFeature` fragments render (default true)
 * @returns {{ defines: Record<string,string>, vars: Map }}  the markup of every `ui:define` (and of the page itself when it has none)
 */
export function renderPage(o) {
  const { read, file, mode } = o;
  const dir = file.slice(0, file.lastIndexOf('/'));
  const used = { msgKeys: new Set() };
  const server = {
    msg: (key) => {
      used.msgKeys.add(key);
      if (mode === 'java') return o.msg(key);
      return new Dyn(`t(${jsLit(key)})`, { msgKey: key });
    },
    feature: (keys) => new Feature(keys),
    featuresOn: o.featuresOn !== false,
    value: (path) => {
      if (path === 'request.contextPath') return mode === 'java' ? (o.ctx ?? '/triplesale') : CTX_MARK;
      const name = SERVER_VALUES[path];
      if (!name) throw new Error(`EL: ${path} is not known (add it to SERVER_VALUES)`);
      if (mode === 'java') {
        if (!(name in (o.session ?? {}))) throw new Error(`EL: the session has no value "${name}" (${path})`);
        return o.session[name];
      }
      return new Dyn(`ini.${name}`, { ini: name });
    },
    param: (name) => (o.params && name in o.params ? o.params[name] : null),
  };
  const ctx = { mode, server };
  const scope = new Map(Object.entries(o.vars ?? {}));
  const text = read(file);
  const items = lex(text);
  // the top level of the composition: ui:param (in order) and ui:define; everything else outside a define is the page itself
  const defines = {};
  let body = '';
  let depth = 0;
  for (let n = 0; n < items.length; n++) {
    const it = items[n];
    if (it.type === 'ui' && it.name === 'ui:composition') { depth += it.closing ? -1 : it.self ? 0 : 1; continue; }
    if (it.type === 'ui' && it.name === 'ui:param' && !it.closing) {
      const a = attrsOf(it.raw);
      scope.set(a.name, paramValue(a.value ?? '', { ...ctx, vars: scope }));
      continue;
    }
    if (it.type === 'ui' && it.name === 'ui:define' && !it.closing) {
      const name = attrsOf(it.raw).name;
      let d = 1;
      let k = n + 1;
      for (; k < items.length; k++) {
        const x = items[k];
        if (x.type === 'ui' && x.name === 'ui:define' && !x.self) d += x.closing ? -1 : 1;
        if (d === 0) break;
      }
      defines[name] = joinItems(items.slice(n + 1, k));
      n = k;
      continue;
    }
    if (it.type === 'comment' || (it.type === 'text' && !it.raw.trim())) continue;
    body += it.raw + (it.type === 'raw' ? it.body + it.close : '');
  }
  const rendered = {};
  for (const [name, t] of Object.entries(defines)) {
    if (name === 'title' || name === 'viewname') continue; // the browser tab / breadcrumb of the Java template: the shell draws them
    rendered[name] = render(t, new Map(scope), ctx, read, dir, `${file} [${name}]`);
  }
  if (body.trim()) rendered['(body)'] = render(body, new Map(scope), ctx, read, dir, file);
  return { defines: rendered, vars: scope, used };
}

/* ------------------------------------------------------------------------------------------------ for the Java replica (harness) */

/** markup of a Java page as the browser parses it: Facelets writes `<tag/>` of XHTML and the HTML parser needs `<tag></tag>` (void elements keep it) */
export { xhtmlToHtml } from './sales-doc.mjs';

/* ------------------------------------------------------------------------------------------------ Angular template */

/**
 * Turns the sentinels of a template-mode markup (already passed through markupToTemplate) into Angular bindings:
 *   text:      `…<S>t('k')</S>…`           ->  `…{{ t('k') }}…`
 *   attribute: `name="a<S>t('k')</S>b"`    ->  `[attr.name]="'a' + t('k') + 'b'"`
 * A static part may not contain `&` or `"` (it would break the binding): the generator must resolve those first.
 */
export function sentinelsToAngular(tpl, what) {
  const S = new RegExp(`${SENTINEL_OPEN}([^${SENTINEL_CLOSE}]*)${SENTINEL_CLOSE}`, 'g');
  const TAG = /<(?:[^>"']|"[^"]*"|'[^']*')*>/g;
  const jsStr = (s) => "'" + s.replace(/\\/g, '\\\\').replace(/'/g, "\\'") + "'";
  let out = '';
  let last = 0;
  let m;
  while ((m = TAG.exec(tpl))) {
    out += tpl.slice(last, m.index).replace(S, (_x, js) => `{{ ${js} }}`);
    let tag = m[0];
    if (tag.includes(SENTINEL_OPEN)) {
      tag = tag.replace(/(\s)([\w:.-]+)="([^"]*)"/g, (all, ws, name, value) => {
        if (!value.includes(SENTINEL_OPEN)) return all;
        const pieces = [];
        let k = 0;
        for (const x of value.matchAll(S)) {
          if (x.index > k) pieces.push(jsStr(value.slice(k, x.index)));
          pieces.push(x[1]);
          k = x.index + x[0].length;
        }
        if (k < value.length) pieces.push(jsStr(value.slice(k)));
        const expr = pieces.length === 1 ? pieces[0] : pieces.join(' + ');
        if (/[&"]/.test(expr.replace(/'(?:[^'\\]|\\.)*'/g, (s) => (/[&"]/.test(s) ? 'X!' : ''))) && /&|"/.test(value.replace(S, ''))) {
          throw new Error(`${what}: the static part of attribute ${name}="${value.slice(0, 60)}…" contains & or "`);
        }
        return `${ws}[attr.${name}]="${expr}"`;
      });
      if (tag.includes(SENTINEL_OPEN)) throw new Error(`${what}: a sentinel is left in a tag: ${tag.slice(0, 120)}`);
    }
    out += tag;
    last = m.index + m[0].length;
  }
  out += tpl.slice(last).replace(S, (_x, js) => `{{ ${js} }}`);
  if (out.includes(SENTINEL_OPEN) || out.includes(SENTINEL_CLOSE)) throw new Error(`${what}: a sentinel is left`);
  return out;
}

/** the message keys a template-mode markup uses (sentinels `t('key')` and hasFeature are not counted) */
export function usedMessageKeys(markup) {
  const keys = new Set();
  for (const m of markup.matchAll(/t\('([\w.]+)'\)/g)) keys.add(m[1]);
  return keys;
}
