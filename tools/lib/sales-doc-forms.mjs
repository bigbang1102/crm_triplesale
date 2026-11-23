/**
 * Helpers of the generators of the sales-document list and forms (tools/sync-sales-doc-list.mjs, tools/sync-sales-doc-form.mjs) and of
 * their comparison pages. They sit on top of tools/lib/facelets.mjs (the page read the way the server reads it), tools/lib/port.mjs and
 * tools/lib/port-kit.mjs. The Java files are only READ.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { javaLinkToRoute } from '../../src/app/core/navigation/java-links.ts'; // (Node strips the types; the file has no Angular imports)
import { markupToTemplate } from './port.mjs';
import { splitSection } from './port-kit.mjs';
import { renderPage, sentinelsToAngular } from './facelets.mjs';

/** the two message bundles of the app (public/assets/i18n, converted from the Java .properties) */
export function bundles(root) {
  const load = (l) => JSON.parse(readFileSync(join(root, `public/assets/i18n/${l}.json`), 'utf8'));
  return { th: load('th'), en: load('en') };
}

/** the strip of tabs components/sales_doc_tabs.xhtml injects into the Java top bar: { active, items: [{ key, labelKey, href }] } */
export function parseSaleTabs(tabsScript, what) {
  const items = [];
  const typeList = /var TYPE_LIST = '([^']+)';/.exec(tabsScript)?.[1] ?? '';
  for (const m of tabsScript.matchAll(/\{\s*key:\s*'(\w+)',\s*name:\s*'#\{commonBean\.msg\['([\w.]+)'\]\}',\s*href:\s*(TYPE_LIST \+ '(\w+)'|'([^']+)')\s*\}/g)) {
    items.push({ key: m[1], labelKey: m[2], href: m[4] ? typeList + m[4] : m[5] });
  }
  const active = /var ACTIVE = '(\w*)';/.exec(tabsScript)?.[1];
  if (!items.length || active === undefined) throw new Error(`${what}: the tab list of sales_doc_tabs was not understood`);
  return { active, items };
}

/**
 * A page of the group read for the Angular template: the `ui:define`s evaluated (template mode), the head taken apart (stylesheets,
 * `<script src>`), the content taken apart (markup, inline styles, inline scripts) and the tab strip of sales_doc_tabs.xhtml set aside.
 * @returns {{ head: { links: string[], scripts: {src:string, targets:string|null}[], styles: string[] }, markup: string, styles: string[],
 *             scripts: string[], tabs: {active:string, items:object[]}, tabsStyle: string, tabsScript: string, msgKeys: Set<string> }}
 */
export function loadSalesPage(read, file, params = {}) {
  const r = renderPage({ read, file, mode: 'template', params });
  const { head, content } = r.defines;
  if (head === undefined || content === undefined) throw new Error(`${file}: ui:define head / content not found`);
  const hs = splitSection(head);
  if (hs.scripts.length) throw new Error(`${file}: the head has an inline <script> (not expected)`);
  const links = [...head.matchAll(/<link\b[^>]*rel="stylesheet"[^>]*\bhref="([^"]+)"[^>]*>/g)].map((m) => m[1]);
  const scripts = [...head.matchAll(/<script\b([^>]*)>\s*<\/script>/g)].map((m) => ({
    src: /\bsrc="([^"]+)"/.exec(m[1])?.[1] ?? '',
    targets: /\bdata-targets="([^"]+)"/.exec(m[1])?.[1] ?? null,
  }));
  const sec = splitSection(content);
  const tabsAt = sec.scripts.findIndex((s) => s.includes('function injectTopTabs()'));
  if (tabsAt < 0) throw new Error(`${file}: the sales_doc_tabs component (injectTopTabs) is not included`);
  const tabsStyleAt = sec.styles.findIndex((s) => s.includes('#sd2TopTabs'));
  if (tabsStyleAt < 0) throw new Error(`${file}: the <style> of sales_doc_tabs (#sd2TopTabs) was not found`);
  return {
    head: { links, scripts, styles: hs.styles },
    markup: sec.markup,
    styles: sec.styles.filter((_s, i) => i !== tabsStyleAt),
    scripts: sec.scripts.filter((_s, i) => i !== tabsAt),
    tabs: parseSaleTabs(sec.scripts[tabsAt], file),
    tabsStyle: sec.styles[tabsStyleAt],
    tabsScript: sec.scripts[tabsAt],
    msgKeys: r.used.msgKeys,
  };
}

/**
 * Markup of a template-mode page -> Angular template: `ui:fragment hasFeature` -> `@if (can(…))`, `<x/>` -> `<x></x>`, the sentinels of the
 * server values and messages -> `{{ … }}` / `[attr.x]="…"`. Anything that is still JSF is an error.
 */
export function toAngularTemplate(markup, what) {
  const tpl = sentinelsToAngular(markupToTemplate(markup, what), what);
  // `class=""` (the EL of a parameter that was not given): Angular drops an empty static class attribute, the browser keeps the one the server wrote
  return tpl.replace(/<(?:[^>"']|"[^"]*"|'[^']*')*>/g, (tag) => tag.replace(/(\s)class=""/, `$1[attr.class]="''"`));
}

/**
 * The messages the server pastes into a JS string literal of a page script (`'#{commonBean.msg['k']}'`): the text must not contain the
 * quote of that literal, a backslash or a line break — in BOTH languages — or the Java page itself would be broken and the two would differ.
 * @param uses  [{ key, quote }] as collected by the `resolve` callback of elToEnv
 */
export function checkScriptMessages(uses, th, en, what) {
  const bad = [];
  for (const { key, quote } of uses) {
    for (const [lang, bundle] of [['th', th], ['en', en]]) {
      const v = bundle[key];
      if (v == null) bad.push(`${key} (${lang}: missing)`);
      else if (v.includes(quote) || /[\\\r\n]/.test(v)) bad.push(`${key} (${lang}, in a ${quote}…${quote} string: ${JSON.stringify(v).slice(0, 60)})`);
    }
  }
  if (bad.length) throw new Error(`${what}: messages that cannot sit in a JS string literal like the server pasted them: ${[...new Set(bad)].join('; ')}`);
}

/**
 * The messages of a finished Angular template, by where they are written: { text: Set, attr: Set } — `{{ t('k') }}` is text, `[attr.x]="…t('k')…"` an attribute.
 */
export function messageContexts(tpl) {
  const attr = new Set();
  const text = new Set();
  const rest = tpl.replace(/\[attr\.[\w:.-]+\]="([^"]*)"/g, (_m, expr) => {
    for (const k of expr.matchAll(/t\('([\w.]+)'\)/g)) attr.add(k[1]);
    return '';
  });
  for (const m of rest.matchAll(/\{\{ ([^}]*) \}\}/g)) for (const k of m[1].matchAll(/t\('([\w.]+)'\)/g)) text.add(k[1]);
  return { text, attr };
}

/**
 * A message that the server writes into markup RAW, and Angular as text / an attribute value, must not contain what the two treat
 * differently — otherwise the two pages would differ for a reason that has nothing to do with the port:
 *   in text:       `<` (a tag) and an `&` that starts an entity;
 *   in a (double-quoted) attribute: `"` and an `&` that starts an entity (`<` `>` and a lone `&` are plain characters there).
 */
export function checkMarkupMessages(ctx, th, en, what) {
  const bad = [];
  const ENTITY = /&(?:#\d+|#x[\da-fA-F]+|[A-Za-z][\w]*);?/;
  const test = (k, kind, re) => {
    for (const [lang, bundle] of [['th', th], ['en', en]]) {
      const v = bundle[k];
      if (v == null) bad.push(`${k} (${lang}: missing)`);
      else if (re.test(v) || /[]/.test(v)) bad.push(`${k} (${kind}, ${lang}: ${JSON.stringify(v).slice(0, 60)})`);
    }
  };
  for (const k of ctx.text) test(k, 'text', new RegExp(`<|${ENTITY.source}`));
  for (const k of ctx.attr) test(k, 'attribute', new RegExp(`"|${ENTITY.source}`));
  if (bad.length) throw new Error(`${what}: messages that cannot be written into markup the same way by Facelets and by Angular: ${bad.join('; ')}`);
}

/** `window.location.href = '<java page>.xhtml?…'` / a string literal that is a Java page link -> the route of this app (core/navigation/java-links.ts) */
export function routeOf(link, what) {
  const route = javaLinkToRoute(link);
  if (!route) throw new Error(`${what}: no route for the Java link ${link}`);
  return route;
}

/**
 * What a browser does with an unmatched `}` at the top level of a stylesheet (CSS Syntax 3, "consume a list of rules"): the `}` starts a
 * qualified rule whose prelude runs up to the next `{` — an invalid selector — so THAT rule (its whole block) is dropped. Sass refuses such a
 * file, so the generator removes the same thing: the stray `}` and the rule that follows it. Returns the text and a note per removal.
 */
export function dropStrayBraces(css, what) {
  let out = '';
  let depth = 0;
  const notes = [];
  let i = 0;
  while (i < css.length) {
    const c = css[i];
    if (c === '/' && css[i + 1] === '*') {
      const e = css.indexOf('*/', i + 2);
      out += css.slice(i, e + 2);
      i = e + 2;
    } else if (c === '"' || c === "'") {
      let j = i + 1;
      while (j < css.length && css[j] !== c) j += css[j] === '\\' ? 2 : 1;
      out += css.slice(i, j + 1);
      i = j + 1;
    } else if (c === '{') {
      depth++;
      out += c;
      i++;
    } else if (c === '}' && depth === 0) {
      // the stray brace and the rule it swallows: everything up to and including the next top-level block
      const from = i;
      let j = i + 1;
      let d = 0;
      let seenBlock = false;
      while (j < css.length) {
        const cj = css[j];
        if (cj === '/' && css[j + 1] === '*') { j = css.indexOf('*/', j + 2) + 2; continue; }
        if (cj === '"' || cj === "'") { j++; while (j < css.length && css[j] !== cj) j += css[j] === '\\' ? 2 : 1; j++; continue; }
        if (cj === '{') { d++; seenBlock = true; }
        if (cj === '}') { d--; if (seenBlock && d === 0) { j++; break; } }
        j++;
      }
      const dropped = css.slice(from, j);
      notes.push(`${what}: a stray "}" at line ${css.slice(0, from).split('\n').length} — the browser drops the rule after it: ${dropped.replace(/\s+/g, ' ').slice(0, 120)}…`);
      i = j;
    } else {
      if (c === '}') depth--;
      out += c;
      i++;
    }
  }
  return { css: out, notes };
}

/**
 * The stylesheet text of a Java CSS file for the Angular component: the theme attribute sits on <html>, the A A A font scale is
 * `--ts-fs-adj`. Anything else is verbatim (a stray `}` is handled like a browser does — see dropStrayBraces).
 * `dark` rules (`body[data-theme="dark"] …`) keep their specificity (html + attribute = body + attribute).
 */
export function portCss(css, what, notes = []) {
  const stray = dropStrayBraces(css, what);
  notes.push(...stray.notes);
  const out = stray.css.replace(/body\[data-theme="dark"\]/g, "html[data-theme='dark']").replace(/var\(--fs-adj\s*,\s*0px\)/g, 'var(--ts-fs-adj,0px)');
  const code = out.replace(/\/\*[\s\S]*?\*\//g, '').replace(/--ts-fs-adj/g, '');
  if (/--fs-adj/.test(code)) throw new Error(`${what}: --fs-adj left over`);
  if (/body\[data-theme/.test(code)) throw new Error(`${what}: body[data-theme …] left over`);
  return out;
}

/** removes the indentation Facelets files give to an embedded stylesheet / script (the first non-empty line decides) */
export function dedent(text) {
  const lines = text.replace(/\s+$/, '').split('\n');
  const ind = Math.min(...lines.filter((l) => l.trim()).map((l) => /^ */.exec(l)[0].length));
  return lines.map((l) => l.slice(Math.min(ind, /^ */.exec(l)[0].length))).join('\n');
}
