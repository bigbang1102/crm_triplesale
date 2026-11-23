/**
 * Shared pieces of the generators (tools/sync-receipts.mjs, tools/sync-receipt-form.mjs, and the sales-document forms that follow:
 * QT / BK / OB / AQ / AD) and of their comparison pages (tools/compare/pages/receipts*, …) for the menu group "งานขาย" (navbar_menu_sale).
 *
 * What the pages of this group have in common, and where it lives:
 *
 *   salesPage()        takes a Facelets page apart: <ui:define head|content>, the `<ui:include src="components/sales_doc_tabs.xhtml">`
 *                      that every page of the group carries (its <style> + <script> inject the tab strip into the Java top bar — the
 *                      Angular shell draws that strip itself, from `TOP_TAB_GROUPS.sale` in core/navigation/nav.config.ts),
 *                      the inline <style> / <script>, the <link> / <script src> of the head and the markup that is left
 *   checkSaleTabs()    compares the tab strip of the Java component with nav.config.ts (the shell is a shared file, so a difference is
 *                      REPORTED, not fixed here) — the generators print the notes, INTEGRATION.md lists them
 *   elToEnv()          `#{commonBean.msg['k']}` / `#{request.contextPath}` inside the JS strings of a page script -> `env.t("k")` /
 *                      `env.ctx`, found with the TypeScript parser (a regex cannot tell a quote inside a string from a quote inside a
 *                      regular expression: `.replace(/"/g, …)`), with the guard that no message can break the string it sits in
 *   stripIife()        the `(function () { … })();` wrapper of a page script (the engine is a function already)
 *
 * and for the harness (the Java replica):
 *   resolveJavaEl()    the EL the server resolves (messages of th.json, hasFeature, context path), applied to markup / script text
 *   xhtmlToHtml()      what Facelets does to markup: `<tag/>` -> `<tag></tag>` (only void elements keep the short form)
 *   TOPBAR_SALE_PAGES  which `topbar-page-NNN` panels the Java top bar renders for `navbar_menu_sale`
 *
 * The Java files are only READ.
 */
import { expandIncludes, splitSection, uiDefines } from './port-kit.mjs';

export const JAVA_CTX = '/triplesale';

/**
 * `commonBean.viewTopbarPage()` has no entry for `navbar_menu_sale` (CommonBean.java: only home / ticket / point / chat / ai / sun), and for an
 * unknown group it answers true for EVERY panel — so the Java top bar renders all of them and `components/sales_doc_tabs.xhtml` hides them
 * with inline `display:none` before adding its own strip (#sd2TopTabs). 001…014 are all the panels of WEB-INF/pages/topbar.xhtml.
 */
export const TOPBAR_SALE_PAGES = ['001', '002', '003', '004', '005', '006', '007', '008', '009', '010', '011', '012', '013', '014'];

/* ------------------------------------------------------------------------------------------------ the Java page, taken apart */

/**
 * @param read  reader(javaWeb) of tools/lib/port.mjs
 * @param file  e.g. 'pages/sales_doc_rv_list.xhtml'
 * @returns {{
 *   defines: Record<string,string>, headLinks: string[], headScripts: {src:string, targets:string|null}[], headStyles: string[],
 *   markup: string, styles: string[], pageScript: string, tabs: {active:string, items: {key:string, labelKey:string, href:string}[]},
 *   tabsStyle: string, tabsScript: string
 * }}
 */
export function salesPage(read, file) {
  const dir = file.slice(0, file.lastIndexOf('/'));
  const defines = uiDefines(read(file), file);
  if (!defines.head || !defines.content) throw new Error(`${file}: ui:define head / content not found`);

  // ---- the head: <link rel=stylesheet href> and <script src data-targets> (the files are read by the generator itself) ----
  const headLinks = [...defines.head.matchAll(/<link\b[^>]*rel="stylesheet"[^>]*\bhref="([^"]+)"[^>]*>/g)].map((m) => m[1]);
  const headScripts = [...defines.head.matchAll(/<script\b([^>]*)>\s*<\/script>/g)].map((m) => ({
    src: /\bsrc="([^"]+)"/.exec(m[1])?.[1] ?? '',
    targets: /\bdata-targets="([^"]+)"/.exec(m[1])?.[1] ?? null,
  }));
  const headSection = splitSection(defines.head);
  if (headSection.scripts.length) throw new Error(`${file}: the head has an inline <script> (not expected here)`);

  // ---- the content, with the includes spelled out the way Facelets does ----
  const expanded = expandIncludes(defines.content, read, dir, file);
  const sec = splitSection(expanded);
  const tabsAt = sec.scripts.findIndex((s) => s.includes('function injectTopTabs()'));
  if (tabsAt < 0) throw new Error(`${file}: the sales_doc_tabs component (injectTopTabs) is not included`);
  const tabsScript = sec.scripts[tabsAt];
  const rest = sec.scripts.filter((_s, i) => i !== tabsAt);
  if (rest.length !== 1) throw new Error(`${file}: expected exactly one page <script>, found ${rest.length}`);
  const tabsStyleAt = sec.styles.findIndex((s) => s.includes('#sd2TopTabs'));
  if (tabsStyleAt < 0) throw new Error(`${file}: the <style> of sales_doc_tabs (#sd2TopTabs) was not found`);
  const tabsStyle = sec.styles[tabsStyleAt];
  const styles = sec.styles.filter((_s, i) => i !== tabsStyleAt);

  const items = [];
  const typeList = /var TYPE_LIST = '([^']+)';/.exec(tabsScript)?.[1] ?? '';
  for (const m of tabsScript.matchAll(/\{\s*key:\s*'(\w+)',\s*name:\s*'#\{commonBean\.msg\['([\w.]+)'\]\}',\s*href:\s*(TYPE_LIST \+ '(\w+)'|'([^']+)')\s*\}/g)) {
    items.push({ key: m[1], labelKey: m[2], href: m[4] ? typeList + m[4] : m[5] });
  }
  const active = /var ACTIVE = '(\w+)';/.exec(tabsScript)?.[1];
  if (!items.length || !active) throw new Error(`${file}: the tab list of sales_doc_tabs was not understood`);
  return { defines, headLinks, headScripts, headStyles: headSection.styles, markup: sec.markup, styles, pageScript: rest[0], tabs: { active, items }, tabsStyle, tabsScript };
}

/** the route the shell's top bar gives each tab of the strip (nav.config.ts → TOP_TAB_GROUPS.sale) */
const SALE_TAB_ROUTE = (key) => (key === 'rv' ? '/sales/receipts' : `/sales/docs/${key}`);

/**
 * The strip `components/sales_doc_tabs.xhtml` injects into the Java top bar against the Angular `sale` group of nav.config.ts.
 * @returns {string[]} notes — empty when the shell shows exactly what the Java strip shows
 */
export function checkSaleTabs(tabs, navConfigSource, th) {
  const notes = [];
  const group = /\n\s*sale:\s*\[([\s\S]*?)\n\s*\],/.exec(navConfigSource)?.[1];
  if (!group) return ['nav.config.ts: TOP_TAB_GROUPS.sale was not found'];
  const angular = [...group.matchAll(/\{\s*id:\s*'(\w+)',\s*labelKey:\s*'([\w.]+)',\s*route:\s*'([^']+)'/g)].map((m) => ({ id: m[1], labelKey: m[2], route: m[3] }));
  if (angular.length !== tabs.items.length || angular.some((a, i) => a.id !== tabs.items[i].key)) {
    notes.push(`tab order/ids: Java ${tabs.items.map((t) => t.key).join(',')} · Angular ${angular.map((a) => a.id).join(',')}`);
  }
  for (const t of tabs.items) {
    const a = angular.find((x) => x.id === t.key);
    if (!a) continue;
    if (a.route !== SALE_TAB_ROUTE(t.key)) notes.push(`tab "${t.key}" route: nav.config.ts ${a.route} · expected ${SALE_TAB_ROUTE(t.key)}`);
    if (a.labelKey !== t.labelKey) notes.push(`tab "${t.key}" label: nav.config.ts uses ${a.labelKey} ("${th[a.labelKey]}") · the Java strip uses ${t.labelKey} ("${th[t.labelKey]}")`);
  }
  return notes;
}

/* ------------------------------------------------------------------------------------------------ EL inside JS strings */

/**
 * Replaces every `#{…}` that sits inside a string literal of the script with the JS expression `resolve(expr)` returns:
 *   '#{commonBean.msg['k']}'                 -> env.t("k")
 *   '<b>#{commonBean.msg['k']}</b>'          -> ('<b>' + env.t("k") + '</b>')
 * An EL outside a string (or inside a template literal) is a syntax error of the original-with-EL, and stops the run, as does an EL
 * in a place the parser cannot place. Comments are left alone (they are not code).
 * @param resolve (expr:string, quote:string) => string  JS expression, or throws for an EL it does not know (`quote` = the quote character of the string literal the EL sits in)
 * @returns {Promise<string>}
 */
export async function elToEnv(js, what, resolve) {
  const ts = (await import('typescript')).default;
  // The source with its EL is not valid JS: '#{commonBean.msg['k']}' closes its own string. Each EL is replaced by a token made of
  // letters first (inside a string it is text, anywhere else an identifier — which is found and refused below), the script is parsed,
  // and the strings that hold tokens are rewritten.
  const els = [];
  const masked = js.replace(/#\{[^}]*\}/g, (m) => {
    els.push(m);
    return `ZZEL${els.length - 1}ZZ`;
  });
  const TOKEN = /ZZEL(\d+)ZZ/g;
  const sf = ts.createSourceFile('script.js', masked, ts.ScriptTarget.ES2020, true, ts.ScriptKind.JS);
  if (sf.parseDiagnostics.length) {
    const d = sf.parseDiagnostics[0];
    const at = masked.slice(Math.max(0, d.start - 50), d.start + 60).replace(/\s+/g, ' ');
    throw new Error(`${what}: the script does not parse: ${ts.flattenDiagnosticMessageText(d.messageText, ' ')} … ${at}`);
  }
  const edits = [];
  const visit = (n) => {
    if (ts.isIdentifier(n) && /^ZZEL\d+ZZ$/.test(n.text)) {
      throw new Error(`${what}: an EL outside a string literal (handle it with a swap first): ${els[+/\d+/.exec(n.text)[0]]}`);
    }
    if ((ts.isNoSubstitutionTemplateLiteral(n) || ts.isTemplateExpression(n)) && /ZZEL\d+ZZ/.test(n.getText(sf))) {
      throw new Error(`${what}: an EL inside a template literal is not supported: ${n.getText(sf).slice(0, 80)}`);
    }
    if (ts.isStringLiteral(n)) {
      const src = n.getText(sf);
      if (/ZZEL\d+ZZ/.test(src)) {
        const q = src[0];
        const body = src.slice(1, -1);
        const parts = [];
        let last = 0;
        for (const m of body.matchAll(TOKEN)) {
          if (m.index > last) parts.push(q + body.slice(last, m.index) + q);
          parts.push(resolve(els[+m[1]].slice(2, -1).trim(), q));
          last = m.index + m[0].length;
        }
        if (last < body.length) parts.push(q + body.slice(last) + q);
        edits.push({ from: n.getStart(sf), to: n.getEnd(), text: parts.length === 1 ? parts[0] : `(${parts.join(' + ')})` });
        return;
      }
    }
    ts.forEachChild(n, visit);
  };
  visit(sf);
  let out = masked;
  for (const e of edits.sort((a, b) => b.from - a.from)) out = out.slice(0, e.from) + e.text + out.slice(e.to);
  // what is left (EL in comments) is put back as it was
  return out.replace(TOKEN, (_m, i) => els[+i]);
}

/** `commonBean.msg['k']` / `commonBean.msg["k"]` -> the key, or null */
export const msgKey = (expr) => /^commonBean\.msg\[(['"])([\w.]+)\1\]$/.exec(expr)?.[2] ?? null;

/**
 * A message becomes `env.t("k")`: the Java server pasted the text into the string literal, so the text must be safe in a literal
 * (no quote, backslash or line break) in BOTH languages — otherwise the Java page itself would be broken and the two would differ.
 */
export function checkMessages(keys, th, en, what) {
  const bad = [];
  for (const k of keys) {
    for (const [lang, bundle] of [['th', th], ['en', en]]) {
      const v = bundle[k];
      if (v == null) bad.push(`${k} (${lang}: missing)`);
      else if (/['"\\\r\n]/.test(v)) bad.push(`${k} (${lang}: ${JSON.stringify(v).slice(0, 60)})`);
    }
  }
  if (bad.length) throw new Error(`${what}: messages that cannot sit in a JS string literal like the server pasted them: ${bad.join('; ')}`);
}

/** drops the `(function () { … })();` wrapper of a page script; the body is returned without its first newline */
export function stripIife(script, what) {
  const m = /^\s*\(function \(\) \{\n([\s\S]*)\}\)\(\);\s*$/.exec(script);
  if (!m) throw new Error(`${what}: the script is not a (function () { … })(); wrapper`);
  return m[1];
}

/* ------------------------------------------------------------------------------------------------ the Java replica (harness) */

/**
 * Facelets writes `<tag/>` of XHTML as `<tag></tag>`; only void elements keep the short form. <script> / <style> bodies are not touched.
 */
export function xhtmlToHtml(markup) {
  const VOID = new Set(['area', 'base', 'br', 'col', 'embed', 'hr', 'img', 'input', 'link', 'meta', 'source', 'track', 'wbr']);
  return markup
    .split(/(<script\b[\s\S]*?<\/script>|<style\b[\s\S]*?<\/style>|<!--[\s\S]*?-->)/g)
    .map((part, i) =>
      i % 2 ? part : part.replace(/<([a-zA-Z][\w:-]*)\b((?:[^>"']|"[^"]*"|'[^']*')*?)\/>/g, (m, name, rest) => (VOID.has(name.toLowerCase()) ? m : `<${name}${rest}></${name}>`)),
    )
    .join('');
}

/**
 * The EL the server resolves, applied the way the server writes it (raw text, no escaping — the replicas of the other pages do the same):
 *   #{commonBean.msg['k']} · #{commonBean.hasFeature('A,B') ? 'true' : 'false'} · #{request.contextPath}
 * `<ui:fragment rendered="#{commonBean.hasFeature('…')}">…</ui:fragment>` is kept (features on) or dropped (off).
 * Anything else is an error: the page needs another resolver.
 */
export function resolveJavaEl(text, { msg, features = true, extra = {} }) {
  let out = text.replace(/<ui:fragment\s+rendered="#\{commonBean\.hasFeature\('[\w,]+'\)\}"\s*>([\s\S]*?)<\/ui:fragment>/g, (_m, inner) => (features ? inner : ''));
  out = out.replace(/#\{commonBean\.msg\[(['"])([\w.]+)\1\]\}/g, (_m, _q, k) => msg(k));
  out = out.replace(/#\{commonBean\.hasFeature\('[\w,]+'\)\s*\?\s*'true'\s*:\s*'false'\}/g, features ? 'true' : 'false');
  out = out.replace(/#\{request\.contextPath\}/g, JAVA_CTX);
  out = out.replace(/#\{([^}]*)\}/g, (m, e) => {
    if (e in extra) return extra[e];
    throw new Error('EL not resolved by the replica: ' + m);
  });
  return out;
}

/**
 * A Java page of the group as the server would send it, ready for the shell replica: `head` (the stylesheets / scripts the page adds to
 * <head>; in template.xhtml they come right after project_root.css, so the harness gives them to `headEarly`) and `content` (the markup,
 * the inline <style> and the scripts, with the includes spelled out and the EL resolved).
 * @param extra  more EL the page has: { 'expression': 'value' }
 */
export function replicaSections(read, file, { msg, features = true, extra = {} }) {
  const dir = file.slice(0, file.lastIndexOf('/'));
  const defines = uiDefines(read(file), file);
  const noComments = (s) => s.replace(/<!--[\s\S]*?-->/g, '');
  const resolve = (s) => resolveJavaEl(xhtmlToHtml(s), { msg, features, extra });
  return {
    head: resolve(noComments(defines.head)),
    content: resolve(expandIncludes(noComments(defines.content), read, dir, file)),
  };
}

/** the message function of the replica: the active bundle, an error for a missing key (the Java page would print the key) */
export function msgFn(bundle) {
  return (k) => {
    if (!(k in bundle)) throw new Error('no message ' + k);
    return bundle[k];
  };
}
