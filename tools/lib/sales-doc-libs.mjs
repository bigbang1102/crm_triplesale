/**
 * The engine scripts of the sales-document forms (web/resources/support/sales_doc_*.js, ~5,000 lines) as ONE generated module:
 * `src/app/features/sales-docs/form/sales-doc-libs.engine.ts`, written by tools/sync-sales-doc-form.mjs with the helpers below.
 *
 * Why one module and not a `<script src>` per file like Java: the scripts reach for things a page of this app must not touch directly —
 * `fetch` (the contract of the backend), `swal`, `window.location`, global listeners on `document` / `window`, timers, and elements they move
 * to <body> — and they have to be taken apart again when the screen is left. Each script is an IIFE that publishes `window.SalesDocX`;
 * here each becomes a function that does the same when the page asks for it (`createSalesDocLibs(env, rt, names)` — `names` = the scripts
 * the Java page loads in its head), with the listed swaps only:
 *
 *   fetch(…)                                  env.fetch(…)                  (the BFF contract of sales-doc-backend.ts)
 *   swal(…) / window.swal                     env.swal(…) / env.swal        (the real SweetAlert, see core/dom/swal.ts)
 *   window.location.href = url                env.navigate(url)
 *   document|window.addEventListener(…)       rt.listen(document|window, …) (removed again by destroy())
 *   setTimeout(…)                             rt.tmo(…)                     (cleared by destroy())
 *   requestAnimationFrame(…)                  rt.raf(…)
 *   new IntersectionObserver(…)               rt.track(new IntersectionObserver(…))
 *   document.body.appendChild(el)             rt.bodyAppend(el)             (the modals the scripts move out of the transformed layout)
 *
 * Everything else is verbatim: the maths of the items, VAT (included / excluded / exempt), discount, payments and the baht text, the
 * validation and the print builders are the Java code. The Java files are only READ.
 */
import { editor, swapIn } from './port.mjs';
import { adaptation, ruleBody } from './port-kit.mjs';

/** the scripts, in the order a page may load them; `key` = the name a page's head refers to (sales_doc_<key>.js) */
export const LIB_KEYS = ['validate', 'customer', 'pager', 'search', 'items', 'attach', 'payment', 'payload', 'preview', 'print', 'print_quote', 'saved', 'ref', 'finance', 'modal', 'pay_modal', 'auto'];

/**
 * What each script is expected to contain — a count that no longer matches means the original changed in a place the port depends on
 * (stops the run): { listen: document/window listeners, tmo: setTimeout, body: document.body.appendChild, fetch, swal: bare swal calls,
 *   nav: window.location.href, raf: requestAnimationFrame, io: IntersectionObserver }
 */
const EXPECT = {
  validate: { listen: 3, tmo: 1, body: 1 },
  customer: { tmo: 2, body: 1, fetch: 3, swal: 1, swalGuard: 1 },
  pager: { io: 1 },
  search: { tmo: 2, body: 1 },
  items: { fetch: 1 },
  attach: { fetch: 3, swal: 9 },
  payment: { tmo: 1, body: 1 },
  payload: {},
  preview: { listen: 1, tmo: 2, body: 1 },
  print: {},
  print_quote: {},
  saved: { listen: 1, tmo: 3, body: 2, nav: 1 },
  ref: { listen: 1, swal: 3 },
  finance: {},
  modal: { listen: 2, raf: 1 },
  pay_modal: { swal: 1 },
  auto: { tmo: 2, body: 1, swal: 1, fetch: 1 },
};

/**
 * What the print-preview frame gets from its Java host page, as one stylesheet. The frame copies EVERY stylesheet of its host page (headHtml in
 * sales_doc_preview.js), so the paper is drawn with the global rules of the whole Java stack: the margins / line-heights of `p` and the headings
 * (layout-modify.css), the forced font of the tags (template.xhtml), the browser defaults of the form controls, and the base of <html> / <body>
 * (13px, #191a1c, min-height 100 %). The global stylesheet of this app has other rules for the same elements, so the Java ones are put after
 * the host's links — read from the Java files by adaptation() (the same extraction the pages use), with the original specificity.
 */
function previewHostBase(read) {
  const layout = read('resources/pandora-layout/css/layout-modify.css');
  const prop = (rule, name) => {
    const m = new RegExp('(?:^|[;\\s])' + name + ':\\s*([^;]+)').exec(rule);
    if (!m) throw new Error(`layout-modify.css: "${name}" is missing in: ${rule}`);
    return m[1].trim();
  };
  const bodyRule = ruleBody(layout, 'layout-modify.css', 'body');
  const htmlRule = ruleBody(layout, 'layout-modify.css', 'html');
  const NL = String.fromCharCode(10);
  const adapted = adaptation({ read, scope: ':where(html)', host: 'x-java-body', text: '' })
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .split(NL)
    .filter((line) => line.trim() && !/^(html\[data-theme='dark'\] )?x-java-body\b/.test(line))
    .join(NL);
  const base = [
    `html { height: ${prop(htmlRule, 'height')}; font-size: ${prop(htmlRule, 'font-size')}; }`,
    // the <body> of the Java host is as tall as its content (this app's is the height of the window)
    `body { height: auto; min-height: ${prop(bodyRule, 'min-height')}; font-size: ${prop(bodyRule, 'font-size')}; font-weight: ${prop(bodyRule, 'font-weight')}; color: ${prop(bodyRule, 'color')}; }`,
  ];
  return [adapted, ...base].join(NL);
}

/** the names a script publishes on window (`window.SalesDocX = …`) */
export function publishedNames(text) {
  return [...text.matchAll(/^\s*window\.(\w+)\s*=/gm)].map((m) => m[1]);
}

/**
 * @param read  reader(javaWeb)
 * @returns {{ key: string, file: string, names: string[], body: string }}  `body` = the statements of the IIFE with the swaps made
 */
export function portLib(read, key) {
  const file = `resources/support/sales_doc_${key}.js`;
  const src = read(file).replace(/\s+$/, '\n');
  const m = /^\/\*[\s\S]*?\*\/\n([\s\S]*)$/.exec(src);
  const code = m ? m[1] : src;
  const wrap = /^\(function \(\) \{\n([\s\S]*)\}\)\(\);\s*$/.exec(code);
  if (!wrap) throw new Error(`${file}: not a (function () { … })(); script`);
  const names = publishedNames(wrap[1]);
  if (!names.length) throw new Error(`${file}: nothing is published on window`);
  const e = editor(file, wrap[1]);
  const want = EXPECT[key];
  if (!want) throw new Error(`${file}: no expectation recorded (add it to EXPECT in tools/lib/sales-doc-libs.mjs)`);
  const count = (re) => (e.text.match(re) ?? []).length;
  const got = {
    listen: count(/\b(document|window)\.addEventListener\(/g),
    tmo: count(/(^|[^.\w$])setTimeout\(/gm),
    body: count(/\bdocument\.body\.appendChild\(/g),
    fetch: count(/(^|[^.\w$])fetch\(/gm),
    swal: count(/(^|[^.\w$])swal\(/gm),
    swalGuard: count(/\bwindow\.swal\b/g),
    nav: count(/\bwindow\.location\.href = /g),
    raf: count(/(^|[^.\w$])requestAnimationFrame\(/gm),
    io: count(/\bnew IntersectionObserver\(/g),
  };
  for (const k of Object.keys(got)) {
    if ((want[k] ?? 0) !== got[k]) throw new Error(`${file}: expected ${want[k] ?? 0} × ${k}, found ${got[k]} — the original changed; check the swaps of tools/lib/sales-doc-libs.mjs`);
  }
  // ---- the swaps ----
  e.text = e.text
    .replace(/\b(document|window)\.addEventListener\(/g, 'rt.listen($1, ')
    .replace(/(^|[^.\w$])setTimeout\(/gm, '$1rt.tmo(')
    .replace(/\bdocument\.body\.appendChild\(/g, 'rt.bodyAppend(')
    .replace(/(^|[^.\w$])fetch\(/gm, '$1env.fetch(')
    .replace(/(^|[^.\w$])swal\(/gm, '$1env.swal(')
    .replace(/\bwindow\.swal\b/g, 'env.swal')
    .replace(/(^|[^.\w$])requestAnimationFrame\(/gm, '$1rt.raf(');
  if (got.nav) e.text = e.text.replace(/\bwindow\.location\.href = ([^;]+);/, 'env.navigate($1);');
  if (key === 'preview') {
    // the frame copies every stylesheet of its host page: see previewHostBase(). In Java every <link> (the sheets of the page and layout-modify.css after
    // them) comes before the <style> blocks; here the page's sheets are <style> blocks too, so the base goes after them to keep layout-modify.css after the page's rules
    e.swap(
      `each(document.querySelectorAll('style'), function (s) { h += '<style>' + s.textContent + '</style>'; });`,
      `each(document.querySelectorAll('style'), function (s) { h += '<style>' + s.textContent + '</style>'; });
        h += '<style>' + ${JSON.stringify(previewHostBase(read))} + '</style>';`,
    );
  }
  if (got.io) {
    // the observer of the infinite scroll is disconnected by destroy()
    e.swap('observer = new IntersectionObserver(function (entries) {', 'observer = rt.track(new IntersectionObserver(function (entries) {');
    e.swap(`rootMargin: '0px 0px ' + NEAR_BOTTOM_PX + 'px 0px' });`, `rootMargin: '0px 0px ' + NEAR_BOTTOM_PX + 'px 0px' }));`);
  }
  // the sweep: nothing may be left that reaches the browser around the environment
  const rest = e.text.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
  const bad = rest.match(/.{0,40}\b(XMLHttpRequest|localStorage|sessionStorage|document\.cookie|window\.open|window\.location|location\.(href|reload|assign|replace)|setInterval|MutationObserver|ResizeObserver)\b.{0,40}/);
  if (bad) throw new Error(`${file}: a global that the environment has to provide: ${bad[0]}`);
  const bare = rest.match(/(^|[^.\w$'"])(fetch|swal|setTimeout|requestAnimationFrame)\(/m);
  if (bare) throw new Error(`${file}: a bare ${bare[2]}( call is left`);
  if (/\b(document|window)\.addEventListener\(/.test(rest) || /\bdocument\.body\.appendChild\(/.test(rest)) throw new Error(`${file}: a global listener / body append is left`);
  // `window.X = …` of the published names stays (the page and the other scripts read them by name); destroy() removes them
  return { key, file, names, body: e.text.replace(/\s+$/, '\n') };
}

/** the whole module */
export function libsModule(read, header) {
  const libs = LIB_KEYS.map((k) => portLib(read, k));
  const published = Object.fromEntries(libs.map((l) => [l.key, l.names]));
  const indent = (s, n) => s.split('\n').map((l) => (l.trim() ? ' '.repeat(n) + l : l)).join('\n');
  const text = `// @ts-nocheck
/* eslint-disable */
/**${header}
 */

/** what the scripts need from the page that hosts them (see the swaps in the header) */
export interface SalesDocLibsEnv {
  /** the BFF contract of the page: /board/prospect-list, /rvapi?action=materials, /board/prospect/attachments, /board/chat-master-data, /resources/mock/auto_dealer_master.json */
  fetch: (input: string, init?: RequestInit) => Promise<Response>;
  /** SweetAlert v2 (js/sweetalert/sweetalertv1.min.js) */
  swal: (options: Record<string, unknown>) => Promise<any>;
  /** window.location.href = … : an address of this app (a route, or an absolute address of the same origin) */
  navigate: (address: string) => void;
}

/** what the scripts leave behind and destroy() has to take back */
export interface SalesDocRuntime {
  listen: (target: EventTarget, type: string, fn: EventListener, opts?: any) => void;
  tmo: (fn: () => void, ms?: number) => any;
  raf: (fn: () => void) => any;
  track: <T extends { disconnect(): void }>(o: T) => T;
  /** document.body.appendChild(el) — the element is removed again by destroy() */
  bodyAppend: <T extends Node>(el: T) => T;
  destroy: () => void;
}

/**
 * The runtime of one screen: the listeners / timers / observers go through the registries of the engine (\`listen\`, \`tmo\`, \`track\`),
 * the elements the scripts move to <body> and the animation frames are taken back by destroy().
 */
export function createSalesDocRuntime(base: { listen: any; tmo: any; track: any }): SalesDocRuntime {
  const moved: Node[] = [];
  const frames: number[] = [];
  let destroyed = false;
  return {
    listen: base.listen,
    tmo: base.tmo,
    track: base.track,
    raf: (fn) => {
      const h = requestAnimationFrame(() => {
        if (!destroyed) fn();
      });
      frames.push(h);
      return h;
    },
    bodyAppend: (el) => {
      document.body.appendChild(el);
      // a box on <body> is outside the host of the page: mark it as a part of a page generated from Java (the shell's rule button:disabled { cursor: not-allowed }
      // skips those — in Java a disabled button has the cursor its own stylesheet gives it)
      if (el instanceof Element) el.setAttribute('data-java-page', '');
      moved.push(el);
      return el;
    },
    destroy: () => {
      destroyed = true;
      frames.splice(0).forEach((h) => cancelAnimationFrame(h));
      moved.splice(0).forEach((el) => {
        if (el.parentNode) el.parentNode.removeChild(el);
      });
    },
  };
}

/** the names each script publishes on window (destroy() deletes them) */
export const SALES_DOC_LIB_PUBLISHED: Record<string, string[]> = ${JSON.stringify(published)};

/**
 * Loads the scripts a page asks for (\`names\` = the keys of its \`<script src="…/sales_doc_<key>.js">\`, in the order of its head): each one
 * runs the way it does when the browser loads the file — it defines its API and publishes it as \`window.SalesDocX\`.
 * @returns the names that were published on window
 */
export function createSalesDocLibs(env: SalesDocLibsEnv, rt: SalesDocRuntime, names: readonly string[]): string[] {
  const libs: Record<string, () => void> = {};
${libs.map((l) => `  /* ---------------------------------------------------------------- ${l.file} */\n  libs[${JSON.stringify(l.key)}] = function () {\n${indent(l.body.replace(/\s+$/, ''), 4)}\n  };`).join('\n\n')}

  const out: string[] = [];
  for (const n of names) {
    if (!libs[n]) throw new Error('no such script: sales_doc_' + n + '.js');
    libs[n]();
    out.push(...SALES_DOC_LIB_PUBLISHED[n]);
  }
  return out;
}
`;
  return { text, published, libs };
}

export { swapIn };
