/**
 * Pieces every "generate the page 1:1 from the Java file" script needs and that do NOT depend on the page
 * (first used by tools/sync-dashboard.mjs; read tools/lib/port.mjs for the swap helpers):
 *
 *   adaptation()      the GLOBAL rules of the Java stylesheet stack that reach a page without the page saying so, read from the
 *                     original files (template.xhtml, layout-modify.css, project_root.css, primeflex.min.css) and scoped to the page
 *   engineScaffold()  the frame around a page script that became an ES module function: listen() / tmo() / track() registries,
 *                     the DOMContentLoaded / load emulation, the guard that keeps a late response from repainting a left screen,
 *                     and the destroy() that undoes everything
 *
 * The Java files are only READ. A rule that is no longer found exactly once stops the run on purpose.
 */
import postcss from 'postcss';
import { javaLinkToRoute } from '../../src/app/core/navigation/java-links.ts'; // (Node strips the types; the file has no Angular imports)

/** the body of the rule `selector { … }` of a stylesheet, comments removed, on one line; exactly one such rule must exist */
export const ruleBody = (text, what, selector) => {
  const esc = selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const found = [...text.matchAll(new RegExp(`(?:^|\\n)[ \\t]*${esc}[ \\t]*\\{`, 'g'))];
  if (found.length !== 1) throw new Error(`${what}: the rule "${selector}" was found ${found.length}x (expected 1) — the original changed`);
  const from = found[0].index + found[0][0].length;
  return text.slice(from, text.indexOf('}', from)).replace(/\/\*[\s\S]*?\*\//g, '').trim().replace(/\s*\n\s*/g, ' ');
};

/** every class name a piece of markup / script uses (class="…", className = '…', classList.add('…') …) */
export function usedClasses(src) {
  const set = new Set();
  for (const m of src.matchAll(/class(?:Name)?\s*=\s*["'`]([^"'`]*)["'`]/g)) m[1].split(/\s+/).forEach((c) => c && set.add(c));
  for (const m of src.matchAll(/classList\.(?:add|toggle|remove)\(([^)]*)\)/g)) for (const s of m[1].matchAll(/['"]([\w-]+)['"]/g)) set.add(s[1]);
  return set;
}

/** the `.class` rules of primeflex.min.css (incl. media queries) for the classes in `used`, scoped */
function primeflexSubset(primeflex, used, scope) {
  const out = [];
  const flat = primeflex.replace(/\/\*[\s\S]*?\*\//g, '');
  const walk = (text, wrap) => {
    let i = 0;
    while (i < text.length) {
      const open = text.indexOf('{', i);
      if (open < 0) break;
      const head = text.slice(i, open).trim();
      let depth = 1;
      let j = open + 1;
      while (j < text.length && depth) depth += text[j] === '{' ? 1 : text[j] === '}' ? -1 : 0, j++;
      const body = text.slice(open + 1, j - 1);
      if (head.startsWith('@media') || head.startsWith('@supports')) walk(body, [...wrap, head]);
      else if (!head.startsWith('@')) {
        const keep = head.split(',').map((s) => s.trim()).filter((s) => /^\.[\w-]+$/.test(s) && used.has(s.slice(1)));
        if (keep.length) out.push({ wrap, rule: `${keep.map((s) => `${scope} ${s}`).join(', ')} { ${body} }` });
      }
      i = j;
    }
  };
  walk(flat, []);
  const css = out.map((r) => r.wrap.reduceRight((acc, w) => `${w} { ${acc} }`, r.rule)).join('\n');
  if (!/\.col-12/.test(css) && used.has('col-12')) throw new Error('primeflex.min.css: .col-12 not found — the extractor no longer understands the file');
  return css;
}

/**
 * The "Angular adaptation" block of a page stylesheet.
 *
 * The markup of a Java page relies on global rules without saying so: Bootstrap-style utility names that PrimeFlex also defines, the forced
 * font-family of tags in template.xhtml, margins / line-heights of headings and paragraphs in layout-modify.css, the label rule of
 * project_root.css … They are repeated here, read from those files, scoped to the page with :where() (the specificity stays the
 * one they have in Java), and the Angular reset of form controls is undone (Java keeps the browser defaults for them).
 *
 * @param read       reader(javaWeb) of tools/lib/port.mjs
 * @param scope      e.g. ':where(.dbsun-root)' — what every rule is limited to
 * @param host       the tag of the route component, e.g. 'ts-dashboard-view' (made display: contents — in Java it was the <div> of ui:define "content")
 * @param text       markup + script of the page (the PrimeFlex classes it uses are looked up in it)
 */
export function adaptation({ read, scope, host, text }) {
  const template = read('WEB-INF/pages/template.xhtml');
  const layoutModify = read('resources/pandora-layout/css/layout-modify.css');
  const projectRoot = read('css/project_root.css');
  const primeflex = read('resources/pandora-layout/css/primeflex.min.css');
  // tokens of the Java stack -> values. The Java face is "NotoSansThai" with NO fallback list (--font-family-noto: NotoSansThai): a
  // symbol such as → falls back to the browser default there, not to the shell's longer --ts-font. --font-size-0 is a constant there
  // (14px — the A A A buttons set --fs-adj, which this variable does not follow), so the label keeps 14px at every font step
  const FONT_SIZE_0 = /--font-size-0:\s*([^;]+);/.exec(projectRoot)?.[1].trim();
  if (!FONT_SIZE_0 || !/^\d+px$/.test(FONT_SIZE_0)) throw new Error('project_root.css: --font-size-0 is no longer a fixed px value: ' + FONT_SIZE_0);
  const bodyRule = ruleBody(layoutModify, 'layout-modify.css', 'body');
  const BODY_FS = /font-size:\s*([^;]+)/.exec(bodyRule)?.[1].trim();
  if (!BODY_FS || !/^\d+px$/.test(BODY_FS)) throw new Error('layout-modify.css: the body font-size is no longer a fixed px value: ' + BODY_FS);
  // the text colour a page inherits from <body>: layout-modify.css (light; it is loaded after project_root.css, so it wins) and the first body rule of dark_mode.css
  const BODY_COLOR = /(?:^|[;\s])color:\s*(#[0-9a-fA-F]{3,8})/.exec(bodyRule)?.[1];
  const BODY_COLOR_DARK = /^body\[data-theme="dark"\]\s*\{[^}]*?[;{]\s*color:\s*(#[0-9a-fA-F]{3,8})/m.exec(read('resources/support/dark_mode.css'))?.[1];
  if (!BODY_COLOR || !BODY_COLOR_DARK) throw new Error('layout-modify.css / dark_mode.css: the body text colour was not found');
  const tok = (s) => s.replace(/var\(--font-family-noto\)/g, "'Noto Sans Thai'").replace(/var\(--font-size-0\)/g, FONT_SIZE_0).replace(/NotoSansThai/g, "'Noto Sans Thai'");

  const TAGS = 'h1, h2, h3, h4, h5, h6, h7, h8, h9, h10, span, p, button, ul, li, div, a';
  const globalRules = [
    [`template.xhtml  ${TAGS}`, `:is(h1, h2, h3, h4, h5, h6, span, p, button, ul, li, div, a, tr, td)`, tok(ruleBody(template, 'template.xhtml', TAGS))],
    ['template.xhtml  tr, td', null, ruleBody(template, 'template.xhtml', 'tr, td')], // folded into the rule above (same declaration)
    ['template.xhtml  input', 'input', ruleBody(template, 'template.xhtml', 'input')],
    ['layout-modify.css  h1 … h6', ':is(h1, h2, h3, h4, h5, h6)', ruleBody(layoutModify, 'layout-modify.css', 'h1, h2, h3, h4, h5, h6')],
    ['layout-modify.css  h1:first-child …', ':is(h1, h2, h3, h4, h5, h6):first-child', ruleBody(layoutModify, 'layout-modify.css', 'h1:first-child, h2:first-child, h3:first-child, h4:first-child, h5:first-child, h6:first-child')],
    ...['h1', 'h2', 'h3', 'h4', 'h5', 'h6'].map((h) => [`layout-modify.css  ${h}`, h, ruleBody(layoutModify, 'layout-modify.css', h)]),
    ['layout-modify.css  p', 'p', ruleBody(layoutModify, 'layout-modify.css', 'p')],
    ['layout-modify.css  p:last-child', 'p:last-child', ruleBody(layoutModify, 'layout-modify.css', 'p:last-child')],
    ['project_root.css  label', ':is(label, .title-text-label)', tok(ruleBody(projectRoot, 'project_root.css', '.title-text-label, label'))],
  ]
    .filter(([, sel]) => sel)
    .map(([from, sel, body]) => `/* ${from} */\n${scope} ${sel} { ${body} }`)
    .join('\n');

  const used = usedClasses(text);
  const pf = primeflexSubset(primeflex, used, scope);
  return `/* ───── Angular adaptation (not part of the Java file) ─────────────────────────────────────────────
   The page was built against the Java stylesheet stack (template.xhtml, project_root.css, layout-modify.css, primeflex.min.css,
   dark_mode.css). Their GLOBAL rules that reach this page are repeated here, read from those files by
   the generator (tools/lib/port-kit.mjs), scoped to the page and with the original specificity (:where() keeps the scope free), so the page
   renders as it does in the original. */
/* the route component is the <div> that ui:define "content" rendered in Java; the page inherits the text size and colour of the Java <body>
   (layout-modify.css: ${BODY_FS} and fixed — the A A A buttons only move what a page sets itself with var(--fs-adj); ${BODY_COLOR}, dark: ${BODY_COLOR_DARK}),
   not the Angular shell's base */
${host} { display: contents; font-size: ${BODY_FS}; color: ${BODY_COLOR}; }
html[data-theme='dark'] ${host} { color: ${BODY_COLOR_DARK}; }
/* ---- base.scss differences (the Angular reset: font / colour / padding / border … of form controls) ----
   The Java page keeps the browser defaults for them, so hand the defaults back (revert = the user-agent value). */
${scope} :is(button, input, select, textarea) { font: revert; letter-spacing: revert; color: revert; }
${scope} button { padding: revert; border: revert; background: revert; cursor: revert; text-align: revert; }
/* ---- global rules of the Java stack ---- */
${globalRules}
/* ---- PrimeFlex (${[...used].filter((c) => new RegExp(`\\.${c}\\b`).test(pf)).length} of the classes the page uses) ---- */
${pf}
/* ───── end of Angular adaptation ──────────────────────────────────────────────────────────────── */
`;
}

/**
 * The frame around a page script that is now `export function start<Page>(env): () => void`.
 *
 * Inside the frame the script sees: listen(target, type, fn) / tmo(fn, ms) / track(observer) (everything is undone by destroy()),
 * onReady(fn) / onLoad(fn) (the Java script ran while the document was still "loading" — DOMContentLoaded / load handlers are
 * queued and played by the footer after the whole script ran), `readyState`, and an `env` whose fetch never settles after destroy().
 *
 * @param {object} o
 * @param {string} o.header     the doc comment of the file (without the leading "/**")
 * @param {string} o.envType    name of the env interface, e.g. 'DashboardEnv'
 * @param {string} o.envBody    members of that interface (TS)
 * @param {string} o.fn         name of the exported function, e.g. 'startDashboard'
 * @param {string} [o.guardExtra]   statements (indented, one per line) right after `var rawFetch = env.fetch;` — e.g. `  var rawFrame = env.frame;`
 * @param {string} [o.envOverrides] more members of the guarded env besides fetch (without the comma before the first)
 * @param {string} [o.guardTail]    statements after the guarded env is installed
 * @param {string[]} o.handlers  functions the markup calls by name that are not window.* assignments (published on window by the footer)
 * @param {string[]} o.exported  every name published on window (removed again by destroy)
 * @param {string} [o.cleanup]       page specific statements of destroy(), before the window names are removed (indented lines, each ending in \n)
 * @param {string} [o.cleanupAfter]  … and after
 * @returns {{ header: string, guard: string, footer: () => string }}
 */
export function engineScaffold({ header, envType, envBody, fn, guardExtra = '', envOverrides = '', guardTail = '', handlers, exported, cleanup = '', cleanupAfter = '' }) {
  return {
    header: `// @ts-nocheck
/* eslint-disable */
/**${header}
 */

export interface ${envType} {
${envBody}
}

export function ${fn}(env: ${envType}): () => void {
  var destroyed = false;
  var disposers = [];
  var timers = [];
  var observers = [];
  function listen(target, type, fn, opts) {
    target.addEventListener(type, fn, opts);
    disposers.push(function () { target.removeEventListener(type, fn, opts); });
  }
  function tmo(fn, ms) { var h = setTimeout(function () { if (!destroyed) { fn(); } }, ms); timers.push(h); return h; }
  function track(o) { observers.push(o); return o; }
  /* document.readyState / DOMContentLoaded / load of the page the script was written for (see the generator) */
  var readyState = 'loading';
  var readyQueue = [];
  var loadQueue = [];
  function onReady(fn) { if (readyState === 'loading') { readyQueue.push(fn); } else { tmo(fn, 0); } }
  function onLoad(fn) { if (readyState !== 'complete') { loadQueue.push(fn); } else { tmo(fn, 0); } }
  function runQueue(queue, type) {
    queue.splice(0).forEach(function (fn) {
      try { fn.call(type === 'load' ? window : document, new Event(type)); } catch (e) { console.error(e); }
    });
  }
`,
    guard: `
  /* Nothing that is still in flight when the screen is left may repaint it: after destroy() a request never settles. */
  var rawFetch = env.fetch;
${guardExtra ? guardExtra + '\n' : ''}  var never = function () { return new Promise(function () {}); };
  var guardResponse = function (r) {
    return {
      ok: r.ok, status: r.status, statusText: r.statusText, headers: r.headers, url: r.url,
      clone: function () { return guardResponse(r.clone()); },
      json: function () { return r.json().then(function (v) { return destroyed ? never() : v; }); },
      text: function () { return r.text().then(function (v) { return destroyed ? never() : v; }); },
      blob: function () { return r.blob().then(function (v) { return destroyed ? never() : v; }); },
      arrayBuffer: function () { return r.arrayBuffer().then(function (v) { return destroyed ? never() : v; }); }
    };
  };
  env = Object.assign({}, env, {
    fetch: function (a, b) {
      if (destroyed) { return never(); }
      return rawFetch(a, b).then(
        function (r) { return destroyed ? never() : guardResponse(r); },
        function (e) { return destroyed ? never() : Promise.reject(e); });
    }${envOverrides ? ',\n' + envOverrides : ''}
  });
${guardTail ? guardTail + '\n' : ''}
`,
    footer: () => `
  /* the entry points of the inline handlers and of the window.* functions */
  ${handlers.map((n) => `window.${n} = ${n};`).join('\n  ')}
  var EXPORTED = ${JSON.stringify(exported)};

  /* "the document has been parsed": DOMContentLoaded handlers in the order they were registered, then "load" */
  readyState = 'interactive';
  runQueue(readyQueue, 'DOMContentLoaded');
  readyState = 'complete';
  tmo(function () { runQueue(loadQueue, 'load'); }, 0);

  return function destroy() {
    destroyed = true;
    disposers.splice(0).forEach(function (d) { d(); });
    timers.splice(0).forEach(function (h) { clearTimeout(h); });
    observers.splice(0).forEach(function (o) { o.disconnect(); });
${cleanup}    EXPORTED.forEach(function (n) { try { delete window[n]; } catch (e) { window[n] = undefined; } });
${cleanupAfter}  };
}
`,
  };
}

/* ------------------------------------------------------------------ links between pages */

/**
 * Every link to another page of the Java app in a piece of markup / script (`#{request.contextPath}/pages/sales_document.face?pid=1&amp;…`)
 * replaced by the route of this app (`/crm/supporting-docs/letter-of-intent`, see core/navigation/java-links.ts). A link the table does not
 * know stops the run: add its rule (and a spec) first.
 */
export function rewriteJavaLinks(text, what) {
  return text.replace(/(?:#\{request\.contextPath\})?\/pages\/[A-Za-z0-9_]+\.(?:face|xhtml)(?:\?[^"'`\s)<>]*)?/g, (m) => {
    const route = javaLinkToRoute(m);
    if (!route) throw new Error(`${what}: no route for the Java link ${m} — add a rule to src/app/core/navigation/java-links.ts`);
    return route;
  });
}

/* ------------------------------------------------------------------ Facelets structure */

/** the named sections of a page (`<ui:define name="head">…</ui:define>`): { title, viewname, head, content } as raw text */
export function uiDefines(text, what = 'page') {
  const out = {};
  const open = /<ui:define\s+name="([\w-]+)"\s*>/g;
  let m;
  while ((m = open.exec(text))) {
    const end = text.indexOf('</ui:define>', open.lastIndex);
    if (end < 0) throw new Error(`${what}: <ui:define name="${m[1]}"> is not closed`);
    out[m[1]] = text.slice(open.lastIndex, end);
    open.lastIndex = end + '</ui:define>'.length;
  }
  return out;
}

/**
 * `<ui:include src="components/x.xhtml"> <ui:param name="page" value="activity"/> </ui:include>` replaced by the body of the included file,
 * as Facelets does: the wrapper `<ui:composition …>` is dropped, `#{name}` of a param becomes its value. Recursive.
 * @param read  reader(javaWeb); `dir` = the folder (under web/) of the file that contains the include
 */
export function expandIncludes(text, read, dir, what = 'page') {
  // an include inside an HTML comment (usage notes at the top of a component) is not an include
  return text.split(/(<!--[\s\S]*?-->)/g).map((part, i) => (i % 2 ? part : expandOne(part, read, dir, what))).join('');
}
function expandOne(text, read, dir, what) {
  return text.replace(/<ui:include\s+src="([^"]+)"\s*(?:\/>|>([\s\S]*?)<\/ui:include>)/g, (_m, src, inner = '') => {
    const rel = (src.startsWith('/') ? src.slice(1) : `${dir}/${src}`).replace(/[^/]+\/\.\.\//g, '');
    let body = read(rel);
    const params = Object.fromEntries([...inner.matchAll(/<ui:param\s+name="([\w.]+)"\s+value="([^"]*)"\s*\/>/g)].map((p) => [p[1], p[2]]));
    body = body.replace(/^\s*<\?xml[^>]*\?>/, '').replace(/<ui:composition[^>]*>/, '').replace(/<\/ui:composition>\s*$/, '');
    for (const [k, v] of Object.entries(params)) body = body.split(`#{${k}}`).join(v);
    return expandIncludes(body, read, rel.slice(0, rel.lastIndexOf('/')), `${what} > ${src}`);
  });
}

/**
 * One section split into what the generators handle separately: the inline `<style>` blocks, the inline `<script>` blocks (CDATA
 * wrapper removed), `<link rel="stylesheet">` / `<script src>` references, and the markup that is left.
 * Comments are removed from the markup only (the scripts keep theirs, byte for byte).
 */
export function splitSection(text) {
  const styles = [];
  const scripts = [];
  const links = [];
  const externalScripts = [];
  let rest = text.replace(/<style\b[^>]*>([\s\S]*?)<\/style>/g, (_m, css) => (styles.push(css.replace(/^\s*\/\*\s*<!\[CDATA\[\s*\*\//, '').replace(/\/\*\s*\]\]>\s*\*\/\s*$/, '')), ''));
  rest = rest.replace(/<script\b([^>]*)>([\s\S]*?)<\/script>/g, (_m, attrs, js) => {
    const src = /\bsrc="([^"]+)"/.exec(attrs)?.[1];
    if (src) externalScripts.push(src);
    else scripts.push(js.replace(/^\s*\/\/\s*<!\[CDATA\[\s*\n?/, '').replace(/\n?\s*\/\/\s*\]\]>\s*$/, ''));
    return '';
  });
  rest = rest.replace(/<link\b[^>]*rel="stylesheet"[^>]*\/?>/g, (m) => (links.push(/\bhref="([^"]+)"/.exec(m)?.[1] ?? ''), ''));
  return { markup: rest.replace(/<!--[\s\S]*?-->/g, ''), styles, scripts, links, externalScripts };
}

/**
 * What Facelets sends to the browser for XHTML markup: `<tag/>` of a non-void element is written `<tag></tag>` (an HTML parser would
 * treat `<i class="x"/>` as an OPEN tag that swallows its siblings). Used by the Java replica pages of the comparison harness.
 */
const HTML_VOID = new Set(['area', 'base', 'br', 'col', 'embed', 'hr', 'img', 'input', 'link', 'meta', 'source', 'track', 'wbr']);
export function facesToHtml(markup) {
  return markup.replace(/<([a-zA-Z][\w:-]*)\b((?:[^>"']|"[^"]*"|'[^']*')*?)\/>/g, (m, name, rest) => (HTML_VOID.has(name.toLowerCase()) ? m : `<${name}${rest}></${name}>`));
}

/**
 * The same adaptation for what a widget script draws into <body> (a select panel, a datepicker, a growl): outside the route component, so the page's
 * own block (`adaptation()`) does not reach it, and the Angular <body> differs from the Java one. What Java's <body> and template.xhtml gave such a
 * portal is stated here: the text size / colour of the body, the forced font of the tags, and the Angular reset of form controls undone.
 *
 * @param read      reader(javaWeb)
 * @param selector  the portals, e.g. '.ui-growl, .ui-selectonemenu-panel, #ui-datepicker-div'
 */
export function portalAdaptation(read, selector) {
  const template = read('WEB-INF/pages/template.xhtml');
  const layoutModify = read('resources/pandora-layout/css/layout-modify.css');
  const projectRoot = read('css/project_root.css');
  const bodyRule = ruleBody(layoutModify, 'layout-modify.css', 'body');
  const BODY_FS = /font-size:\s*([^;]+)/.exec(bodyRule)?.[1].trim();
  const BODY_COLOR = /(?:^|[;\s])color:\s*(#[0-9a-fA-F]{3,8})/.exec(bodyRule)?.[1];
  const BODY_COLOR_DARK = /^body\[data-theme="dark"\]\s*\{[^}]*?[;{]\s*color:\s*(#[0-9a-fA-F]{3,8})/m.exec(read('resources/support/dark_mode.css'))?.[1];
  const P_RULE = ruleBody(layoutModify, 'layout-modify.css', 'p'); // the global `p { … }` of the Java template (the text of a growl message is a <p>)
  const FONT_SIZE_0 = /--font-size-0:\s*([^;]+);/.exec(projectRoot)?.[1].trim();
  if (!BODY_FS || !BODY_COLOR || !BODY_COLOR_DARK || !FONT_SIZE_0) throw new Error('portalAdaptation: the body rule of layout-modify.css / dark_mode.css / project_root.css changed');
  const TAGS = 'h1, h2, h3, h4, h5, h6, h7, h8, h9, h10, span, p, button, ul, li, div, a';
  const tok = (x) => x.replace(/var\(--font-family-noto\)/g, "'Noto Sans Thai'").replace(/var\(--font-size-0\)/g, FONT_SIZE_0).replace(/NotoSansThai/g, "'Noto Sans Thai'");
  return `/* ───── Angular adaptation of the portals in <body> (not part of the Java files) ─────────────────────
   The widgets draw ${selector} into <body>; Java's <body> (layout-modify.css) and template.xhtml gave them this text size / colour / font, the Angular <body> differs.
   (zero specificity on purpose: it stands for what the portals INHERIT from Java's <body>; the rules of the widgets themselves — \`body .ui-widget\`, \`.ui-datepicker\` — win as they do in Java) */
:where(${selector}) { font-size: ${BODY_FS}; color: ${BODY_COLOR}; }
:where(html[data-theme='dark'] :is(${selector})) { color: ${BODY_COLOR_DARK}; }
:where(${selector}) :is(button, input, select, textarea) { font: revert; letter-spacing: revert; color: revert; }
:where(${selector}) button { padding: revert; border: revert; background: revert; cursor: revert; text-align: revert; }
:where(${selector}) p { ${P_RULE} }
:where(${selector}) :is(h1, h2, h3, h4, h5, h6, span, p, button, ul, li, div, a, tr, td), :is(${selector}):is(div) { ${tok(ruleBody(template, 'template.xhtml', TAGS))} }
/* ───── end of Angular adaptation of the portals ───── */
`;
}

/**
 * The class rules of the Java stylesheets that every page gets from the template — `css/project_root.css` and `resources/pandora-layout/css/layout-modify.css`
 * (loaded in that order after the head) — for the classes a page uses without saying so (`.card`, `.title-header-header` …): a rule is kept when every
 * class of its selector is one the page uses; the custom properties of `:root` (project_root.css) are written in, the rest is verbatim; scoped to the page.
 *
 * @param read   reader(javaWeb)
 * @param used   usedClasses(markup + script)
 * @param scope  e.g. ':where(ts-supporting-doc-form-view)'
 */
export function globalClassRules({ read, used, scope }) {
  const files = [
    ['css/project_root.css', read('css/project_root.css')],
    ['resources/pandora-layout/css/layout-modify.css', read('resources/pandora-layout/css/layout-modify.css')],
  ];
  const vars = new Map();
  for (const m of files[0][1].matchAll(/:root\s*\{([^}]*)\}/g)) for (const d of m[1].matchAll(/(--[\w-]+)\s*:\s*([^;]+);/g)) vars.set(d[1], d[2].trim());
  const resolve = (v, depth = 0) => (depth > 5 ? v : v.replace(/var\((--[\w-]+)\s*(?:,\s*([^)]*))?\)/g, (all, name, fallback) => (vars.has(name) ? resolve(vars.get(name), depth + 1) : fallback !== undefined ? fallback.trim() : all)));
  const out = [];
  for (const [name, text] of files) {
    const root = postcss.parse(text, { from: name });
    root.walkRules((rule) => {
      if (rule.parent?.type === 'atrule' && /keyframes|font-face/.test(rule.parent.name)) return;
      const keep = rule.selectors.map((x) => x.trim()).filter((sel) => {
        const classes = [...sel.matchAll(/\.(-?[_a-zA-Z][\w-]*)/g)].map((m) => m[1]);
        return classes.length > 0 && classes.every((c) => used.has(c)) && !/#|\[|:not|\*/.test(sel.replace(/:(?:hover|focus|active|last-child|first-child|before|after|disabled|checked)\b/g, ''));
      });
      if (!keep.length) return;
      const body = rule.nodes.filter((n) => n.type === 'decl').map((d) => `${d.prop}: ${resolve(d.value).replace(/NotoSansThai/g, "'Noto Sans Thai'")}${d.important ? ' !important' : ''};`).join(' ');
      if (!body) return;
      const wraps = [];
      for (let p = rule.parent; p && p.type === 'atrule'; p = p.parent) wraps.unshift(`@${p.name} ${p.params}`);
      out.push(wraps.reduceRight((acc, w) => `${w} { ${acc} }`, `${keep.map((x) => `${scope} ${x}`).join(', ')} { ${body} }`) + `  /* ${name} */`);
    });
  }
  return `/* ───── global class rules of the Java stylesheets the page relies on (${out.length}) — project_root.css, layout-modify.css ───── */\n${out.join('\n')}\n`;
}
