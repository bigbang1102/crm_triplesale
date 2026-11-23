/**
 * Shared helpers of the "generate 1:1 from the Java file" scripts (sync-ai-fab.mjs, sync-ai-translator.mjs …).
 * The Java files are only READ. A swap() that no longer matches stops the run on purpose: the original changed in a
 * place the port depends on.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

export const reader = (javaWeb) => (p) => readFileSync(join(javaWeb, p), 'utf8').replace(/\r\n/g, '\n');

/** replace exactly one occurrence in `text`, fail loudly otherwise */
export function swapIn(text, what, find, repl) {
  const i = text.indexOf(find);
  if (i < 0) throw new Error(`${what} changed — NOT FOUND: ${find.slice(0, 90)}`);
  if (text.indexOf(find, i + 1) >= 0) throw new Error(`${what} changed — AMBIGUOUS: ${find.slice(0, 90)}`);
  return text.slice(0, i) + repl + text.slice(i + find.length);
}
/** replace the block that starts at `from` and ends right before `to` */
export function swapBlockIn(text, what, from, to, repl) {
  const i = text.indexOf(from);
  if (i < 0) throw new Error(`${what} changed — NOT FOUND: ${from.slice(0, 90)}`);
  const j = text.indexOf(to, i);
  if (j < 0) throw new Error(`${what} changed — END NOT FOUND: ${to.slice(0, 90)}`);
  return text.slice(0, i) + repl + text.slice(j);
}
/** every occurrence, at least one (and exactly `count` when given) */
export function swapAllIn(text, what, find, repl, count) {
  const n = text.split(find).length - 1;
  if (n < 1) throw new Error(`${what} changed — NOT FOUND: ${find.slice(0, 90)}`);
  if (count !== undefined && n !== count) throw new Error(`${what} changed — FOUND ${n}x, expected ${count}x: ${find.slice(0, 90)}`);
  return text.split(find).join(repl);
}

/** an editable text with swap()/swapBlock()/swapAll() bound to a name */
export function editor(what, initial) {
  let text = initial;
  return {
    get text() {
      return text;
    },
    set text(v) {
      text = v;
    },
    swap: (find, repl) => (text = swapIn(text, what, find, repl)),
    swapBlock: (from, to, repl) => (text = swapBlockIn(text, what, from, to, repl)),
    swapAll: (find, repl, count) => (text = swapAllIn(text, what, find, repl, count)),
  };
}

/** the text between two markers (both must exist) */
export function between(text, what, open, close) {
  const i = text.indexOf(open);
  if (i < 0) throw new Error(`${what}: ${open.slice(0, 60)} not found`);
  const j = text.indexOf(close, i + open.length);
  if (j < 0) throw new Error(`${what}: ${close.slice(0, 60)} not found`);
  return text.slice(i + open.length, j);
}

/* ------------------------------------------------------------------ Facelets markup -> Angular template */
const TAG = /<(?:[^>"']|"[^"]*"|'[^']*')*>/g;
const VOID = new Set(['area', 'base', 'br', 'col', 'embed', 'hr', 'img', 'input', 'link', 'meta', 'source', 'track', 'wbr']);
const FOREIGN = new Set(['path', 'circle', 'rect', 'line', 'polyline', 'polygon', 'ellipse', 'stop', 'use', 'g', 'defs']);
const S = (s) => `\u0001${s}\u0002`; // sentinels survive the escaping of text; they become Angular syntax at the very end

/**
 * Converts the XHTML markup of a Java page to an Angular template:
 *   #{commonBean.msg['k']} in text -> {{ t('k') }}, as a whole attribute value -> [attr.x]="t('k')"
 *   <ui:fragment rendered="#{commonBean.hasFeature('X')}"> -> @if (can('X')) { … }
 *   <ui:fragment rendered="#{commonBean.hasAccess('PL-PR-LS-01')}"> -> @if (access('PL-PR-LS-01')) { … }   (the button registry,
 *       core/permissions/access-buttons.ts; no such EL exists in Java — a generator puts the fragment in to hang a button under a code)
 *   <x/> -> <x></x>, a missing <tbody> is spelled out, --fs-adj -> --ts-fs-adj, comments dropped.
 * Anything else that is JSF is an error.
 */
export function markupToTemplate(html, what) {
  html = html.replace(/<!--[\s\S]*?-->/g, '');
  const escText = (t) =>
    t
      .replace(/#\{commonBean\.msg\[(['"])([\w.]+)\1\]\}/g, (_m, _q, k) => S(`T:${k}`))
      .replace(/@/g, '&#64;')
      .replace(/\{/g, '&#123;')
      .replace(/\}/g, '&#125;');
  let tpl = '';
  let last = 0;
  let m;
  while ((m = TAG.exec(html))) {
    tpl += escText(html.slice(last, m.index));
    let tag = m[0];
    const name = (/^<\/?\s*([a-zA-Z][\w:-]*)/.exec(tag) || [])[1]?.toLowerCase();
    if (name === 'ui:define' || name === 'ui:composition') {
      // wrapper of the Facelets file — nothing to render
    } else if (name === 'ui:fragment') {
      if (tag.startsWith('</')) tpl += S('ENDIF');
      else {
        const f = /rendered="#\{commonBean\.hasFeature\('([\w,]+)'\)\}"/.exec(tag);
        const a = /rendered="#\{commonBean\.hasAccess\('([A-Z]{2}-[A-Z]{2}-[A-Z]{2}-\d{2})'\)\}"/.exec(tag);
        if (!f && !a) throw new Error(`${what}: unknown ui:fragment condition: ${tag}`);
        tpl += S(f ? `IF:${f[1]}` : `ACC:${a[1]}`);
      }
    } else {
      if (name && tag.endsWith('/>') && !VOID.has(name) && !FOREIGN.has(name) && name !== 'svg') {
        tag = tag.replace(/\s*\/>$/, `></${name}>`);
      }
      tag = tag.replace(/(\s)([a-zA-Z-]+)="#\{commonBean\.msg\[(['"])([\w.]+)\3\]\}"/g, (_m, ws, attr, _q, k) => `${ws}[attr.${attr}]="t('${k}')"`);
      tag = tag.replace(/var\(--fs-adj\s*,\s*0px\)/g, 'var(--ts-fs-adj, 0px)');
      tpl += tag;
    }
    last = m.index + m[0].length;
  }
  tpl += escText(html.slice(last));
  tpl = tpl
    .replace(/\u0001T:([\w.]+)\u0002/g, (_m, k) => `{{ t('${k}') }}`)
    .replace(/\u0001IF:([\w,]+)\u0002/g, (_m, k) => `@if (can('${k}')) {`)
    .replace(/\u0001ACC:([\w-]+)\u0002/g, (_m, k) => `@if (access('${k}')) {`)
    .replace(/\u0001ENDIF\u0002/g, '}');
  // the HTML parser of the Java page adds an implicit <tbody>; Angular builds the DOM node by node, so spell it out
  tpl = tpl.replace(/(<table\b[^>]*>\s*)(<tr\b[\s\S]*?<\/tr>)(\s*<\/table>)/g, '$1<tbody>$2</tbody>$3');
  const leftovers = tpl.match(/#\{|<ui:|<p:|<h:|<f:|\{\{(?! t\('[\w.]+'\) \}\})|[\u0001\u0002]/g);
  if (leftovers) throw new Error(`${what} still contains JSF markup: ${[...new Set(leftovers)].join(' ')}`);
  return tpl;
}

/* ------------------------------------------------------------------ dark_mode.css of the Java app */
function splitTop(s, sep) {
  const parts = [];
  let cur = '';
  let depth = 0;
  let q = '';
  for (const ch of s) {
    if (q) {
      cur += ch;
      if (ch === q) q = '';
      continue;
    }
    if (ch === '"' || ch === "'") {
      q = ch;
      cur += ch;
      continue;
    }
    if (ch === '(' || ch === '[') depth++;
    if (ch === ')' || ch === ']') depth--;
    if (ch === sep && depth === 0) {
      parts.push(cur);
      cur = '';
      continue;
    }
    cur += ch;
  }
  parts.push(cur);
  return parts;
}

/**
 * The global dark theme (resources/support/dark_mode.css, loaded by template.xhtml AFTER the page <style>, so it wins at
 * equal specificity): every rule is `body[data-theme="dark"] <selector>` — it styles plain elements and inline-style
 * wildcards ([style*="color:#6B7280"]) of every page. Ported rule by rule, scoped with :where() (specificity stays as in
 * Java) and meant to be appended AFTER the page CSS. Only rules that can match the page are kept: every class / id a
 * selector names must exist in `pageText` (markup + CSS + script).
 *
 * @param scope  e.g. ':where(.ait)'  (what the rules are limited to)
 * @param minRules  a floor that catches a changed dark_mode.css
 */
export function darkPort(darkCss, pageText, scope, minRules = 5) {
  const DARK_PREFIX = 'body[data-theme="dark"]';
  const SHELL_ONLY = /\.layout-|\.ui-navbar|\.topbar|#crm_main|\.footer|\.menu-|\.sidebar|\.ui-menu|\.rail/;
  const lowerText = pageText.toLowerCase();
  const mentions = (sel) => {
    const bare = sel.replace(/\[[^\]]*\]/g, '').replace(/:not\([^)]*\)/g, '');
    if (![...bare.matchAll(/[.#]([\w-]+)/g)].every((m) => pageText.includes(m[1]))) return false;
    // [style*="background:#fef2f2" i] can only match an element that has that inline style: the value (#fef2f2) must
    // appear in the page, otherwise the rule is dead weight (these wildcards are most of dark_mode.css)
    for (const a of sel.matchAll(/\[style\*="([^"]*)"/g)) {
      const value = a[1].slice(a[1].lastIndexOf(':') + 1).trim().toLowerCase();
      if (value && !lowerText.includes(value)) return false;
    }
    return true;
  };
  const src = darkCss.replace(/\/\*[\s\S]*?\*\//g, '');
  const rules = [];
  let seen = 0;
  for (const m of src.matchAll(/([^{}]+)\{([^{}]*)\}/g)) {
    const sels = splitTop(m[1].trim(), ',')
      .map((s) => s.trim())
      .filter((s) => s.startsWith(DARK_PREFIX + ' ') && !SHELL_ONLY.test(s));
    seen += sels.length;
    const kept = sels.filter(mentions).map((s) => `html[data-theme="dark"] ${scope}` + s.slice(DARK_PREFIX.length));
    if (kept.length) rules.push(kept.join(',\n') + ' {' + m[2].trim().replace(/\s*\n\s*/g, ' ') + '}');
  }
  if (rules.length < minRules) throw new Error(`dark_mode.css: expected ${minRules}+ matching rules, found ${rules.length}`);
  return { css: rules.join('\n'), kept: rules.length, seen };
}

/**
 * Names the code uses but never declares ("Cannot find name 'x'"), found with the TypeScript checker.
 *
 * Why: the Java page scripts are sloppy-mode scripts; the engines are ES module functions (strict). A sloppy script can assign an
 * undeclared variable (implicit global) or call a function that was declared inside a block (Annex B hoisting) — in strict mode
 * both are a ReferenceError at run time, in a code path a test might never reach. Run on the generated text, this finds them at
 * generation time. `allow` = names that are undefined in the original as well (e.g. only ever used behind `typeof x === 'function'`).
 */
export async function undeclaredNames(code, allow = []) {
  const ts = (await import('typescript')).default;
  const file = '/__generated__.ts';
  const options = { noEmit: true, target: ts.ScriptTarget.ES2022, lib: ['lib.es2022.d.ts', 'lib.dom.d.ts', 'lib.dom.iterable.d.ts'], strict: false, noImplicitAny: false, skipLibCheck: true, types: [] };
  const host = ts.createCompilerHost(options);
  const getSourceFile = host.getSourceFile.bind(host);
  host.getSourceFile = (name, ...rest) => (name === file ? ts.createSourceFile(name, code, options.target, true) : getSourceFile(name, ...rest));
  host.fileExists = (n) => n === file || ts.sys.fileExists(n);
  host.readFile = (n) => (n === file ? code : ts.sys.readFile(n));
  const program = ts.createProgram([file], options, host);
  const found = new Map();
  for (const d of program.getSemanticDiagnostics(program.getSourceFile(file))) {
    if (d.code !== 2304 && d.code !== 2552) continue; // Cannot find name 'x' [Did you mean …]
    const name = /name '([^']+)'/.exec(ts.flattenDiagnosticMessageText(d.messageText, '\n'))?.[1];
    if (!name || allow.includes(name)) continue;
    const line = code.slice(0, d.start).split('\n').length;
    found.set(name, [...(found.get(name) ?? []), line]);
  }
  return [...found].map(([name, lines]) => `${name} (line ${lines.slice(0, 3).join(', ')})`);
}
