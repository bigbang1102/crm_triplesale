#!/usr/bin/env node
/**
 * Regenerates the five sales-document forms — quotation (qt), booking (bk), delivery note (ob), auto-dealer quotation (aq) and auto-dealer
 * booking (ad), route /sales/docs/:type/:id — from the Java originals so the two can never drift while both exist:
 *
 *   npm run sales-doc-form:sync          (Java project = ../triple_sale_main, or set TS_JAVA_ROOT)
 *
 *   Java  web/pages/sales_doc_<t>_form.xhtml + the ~22 components/sales_doc_*.xhtml it includes   ->  src/app/features/sales-docs/form/sales-doc-<t>.html
 *   Java  the stylesheets of its head (sales_doc_form.css, sales_doc_qt_v3.css, …)                  ->  .../sales-doc-<t>.scss   (+ Angular adaptation block)
 *   Java  its inline scripts                                                                       ->  .../sales-doc-<t>.engine.ts
 *   Java  web/resources/support/sales_doc_*.js (the 17 engine scripts the heads load)              ->  .../sales-doc-libs.engine.ts   (ONE module, see tools/lib/sales-doc-libs.mjs)
 *   Java  web/resources/mock/auto_dealer_master.json (the master data of the auto-dealer forms)    ->  .../auto-dealer-master.ts      (data, byte for byte as JSON)
 *   Java  web/resources/js/attach_file_types.js                                                    ->  public/assets/java-js/attach_file_types.js (byte for byte)
 *
 * The pages are read with tools/lib/facelets.mjs — the same reading the comparison harness uses for the Java replica. The Java files are
 * only READ. The outputs carry a "GENERATED" header — change this script (the swap() lists), never the output. A swap() that no longer
 * matches stops the run on purpose: the original changed in a place the port depends on.
 */
import { copyFileSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { darkPort, editor, reader, undeclaredNames } from './lib/port.mjs';
import { adaptation, engineScaffold, ruleBody } from './lib/port-kit.mjs';
import { CTX_MARK } from './lib/facelets.mjs';
import { checkSaleTabs, elToEnv, msgKey } from './lib/sales-doc.mjs';
import { bundles, checkMarkupMessages, checkScriptMessages, loadSalesPage, messageContexts, portCss, routeOf, toAngularTemplate } from './lib/sales-doc-forms.mjs';
import { LIB_KEYS, libsModule, publishedNames } from './lib/sales-doc-libs.mjs';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const javaRoot = resolve(process.env.TS_JAVA_ROOT ?? join(root, '..', 'triple_sale_main'));
const java = join(javaRoot, 'web');
const out = join(root, 'src/app/features/sales-docs/form');
mkdirSync(out, { recursive: true });
const read = reader(java);
const { th, en } = bundles(root);

/* ================================================================================== what each form loads in its head */
/**
 * The head of every Java form: the stylesheets (in order) and the scripts (in order) — recorded here, checked against the page on every run.
 * `libs` = sales_doc_<key>.js ; `attachTypes` = resources/js/attach_file_types.js (a global library the engine reads: TsAttachTypes) ;
 * every form loads drag_scroll (css: global in the shell, js: core/dom/drag-scroll.ts, started by the host for `.qm-tbox`).
 */
const TYPES = {
  qt: {
    file: 'pages/sales_doc_qt_form.xhtml',
    prefix: 'qt',
    Name: 'Qt',
    css: ['sales_doc_form.css', 'sales_doc_qt_v3.css', 'sales_doc_print_quote.css'],
    libs: ['customer', 'pager', 'preview', 'print', 'print_quote', 'saved', 'search', 'items', 'attach', 'payment', 'validate', 'payload'],
    attachTypes: true,
  },
  bk: {
    file: 'pages/sales_doc_bk_form.xhtml',
    prefix: 'bk',
    Name: 'Bk',
    css: ['sales_doc_form.css', 'sales_doc_qt_v3.css', 'sales_doc_print_quote.css'],
    libs: ['validate', 'customer', 'pager', 'preview', 'print', 'print_quote', 'saved', 'payload', 'search', 'ref', 'items', 'attach', 'payment'],
    attachTypes: true,
  },
  ob: {
    file: 'pages/sales_doc_ob_form.xhtml',
    prefix: 'ob',
    Name: 'Ob',
    css: ['sales_doc_form.css', 'sales_doc_qt_v3.css', 'sales_doc_print.css'],
    libs: ['preview', 'print', 'saved', 'finance', 'validate', 'customer', 'pager', 'search', 'ref', 'items', 'attach', 'modal', 'pay_modal'],
    attachTypes: true,
  },
  aq: {
    file: 'pages/sales_doc_aq_form.xhtml',
    prefix: 'aq',
    Name: 'Aq',
    css: ['sales_doc_form.css', 'sales_doc_qt_v3.css', 'sales_doc_print.css', 'sales_doc_auto.css'],
    libs: ['validate', 'customer', 'pager', 'preview', 'print', 'saved', 'auto'],
    attachTypes: false,
  },
  ad: {
    file: 'pages/sales_doc_ad_form.xhtml',
    prefix: 'ad',
    Name: 'Ad',
    css: ['sales_doc_form.css', 'sales_doc_qt_v3.css', 'sales_doc_print.css', 'sales_doc_auto.css'],
    libs: ['validate', 'customer', 'pager', 'search', 'preview', 'print', 'saved', 'auto'],
    attachTypes: false,
  },
};
const DRAG_TARGETS = '.qm-tbox';
const GENERATED = (what) => `GENERATED by tools/sync-sales-doc-form.mjs from ${what} — do not edit; change the script and run \`npm run sales-doc-form:sync\`.`;

/* ================================================================================== the engine scripts (one module) */
const lm = libsModule(
  read,
    `
 * The engine scripts of the sales-document forms. ${GENERATED('web/resources/support/sales_doc_*.js (17 files)')}
 *
 * The Java scripts, same behaviour line by line — the maths of the items / VAT / discount / payments, the validation, the customer pick, the
 * attachments, the payload, the baht text, the preview and print builders (ES5 written for a browser global scope — hence "@ts-nocheck":
 * typing it would change it, not port it).
 *
 * WHY one module: each script is an IIFE that publishes \`window.SalesDocX\`; a page of this app must not let them reach for \`fetch\`, \`swal\`,
 * \`window.location\`, global listeners and timers directly (the screen has to take everything back when it is left) — tools/lib/sales-doc-libs.mjs
 * lists the swaps (fetch → env.fetch, swal → env.swal, window.location.href → env.navigate, document / window listeners → rt.listen,
 * setTimeout → rt.tmo, requestAnimationFrame → rt.raf, IntersectionObserver → rt.track, document.body.appendChild → rt.bodyAppend).`,
);
for (const k of LIB_KEYS) if (!lm.published[k]) throw new Error('lib without published names: ' + k);
{
  const undeclared = await undeclaredNames(lm.text.replace(/^\/\/ @ts-nocheck\n/, ''), ['SalesDocPaymentMsg', 'SalesDocAutoMsg', 'TsAttachTypes', ...Object.values(lm.published).flat()]);
  if (undeclared.length) throw new Error('sales-doc-libs engine: names that are not declared (a ReferenceError in strict mode): ' + undeclared.join(', '));
  writeFileSync(join(out, 'sales-doc-libs.engine.ts'), lm.text);
}
const PUBLISHED = lm.published;

/* ================================================================================== the master data of the auto-dealer forms */
{
  // FAST-DEBT(API): ข้อมูล master ของฟอร์มรถยนต์ (aq/ad) เป็นข้อมูลตัวอย่างชั่วคราวจาก auto_dealer_master.json (ไฟล์ที่ถูกสร้างคือ auto-dealer-master.ts — ห้ามแก้ตรงนั้น) · backend ยังไม่มี API · 15/10/2026 user เลือกใช้ข้อมูลตัวอย่างไปก่อน · เมื่อมี API ให้เปลี่ยนแหล่งข้อมูลจุดเดียว · somyot · 2026-11-19
  const json = read('resources/mock/auto_dealer_master.json');
  JSON.parse(json); // (must be JSON)
  writeFileSync(
    join(out, 'auto-dealer-master.ts'),
    `/**
 * The sample master data of the auto-dealer forms (quotation aq / booking ad): vehicles, accessories, finance companies, insurance, income / expense
 * items, payees, bank accounts, card terminals. ${GENERATED('web/resources/mock/auto_dealer_master.json')}
 * (The Java page fetches this file itself — "no API for the master data yet"; the fake backend of this app answers the same request with it.)
 */
export const AUTO_DEALER_MASTER_JSON = ${JSON.stringify(json)};
`,
  );
}
// the file attach_file_types.js is read by the engine as the global TsAttachTypes — a byte-identical copy, loaded by the host
mkdirSync(join(root, 'public/assets/java-js'), { recursive: true });
copyFileSync(join(java, 'resources/js/attach_file_types.js'), join(root, 'public/assets/java-js/attach_file_types.js'));

/* ================================================================================== one form */
const NAV_CONFIG = readFileSync(join(root, 'src/app/core/navigation/nav.config.ts'), 'utf8');
const summary = [];
const tabNotes = new Set();
const cssNotes = new Set();

for (const [type, T] of Object.entries(TYPES)) {
  const FILE = T.file;
  const base = FILE.split('/').pop();
  const page = loadSalesPage(read, FILE);
  const what = (s) => `${base} ${s}`;

  /* ---- the head: stylesheets, scripts ---- */
  const cssFiles = page.head.links
    .map((l) => /^@@CTX@@\/resources\/support\/([\w.]+\.css)(?:\?v=\w+)?$/.exec(l)?.[1])
    .map((f, i) => {
      if (!f) throw new Error(`${FILE}: an unexpected stylesheet in the head: ${page.head.links[i]}`);
      return f;
    });
  const wantCss = [...T.css, 'drag_scroll.css'];
  if (JSON.stringify(cssFiles) !== JSON.stringify(wantCss)) throw new Error(`${FILE}: the stylesheets of the head changed: ${cssFiles.join(' ')} (expected ${wantCss.join(' ')})`);
  const libs = [];
  let attachTypes = false;
  let drag = null;
  for (const s of page.head.scripts) {
    const m = /^@@CTX@@\/resources\/(support|js)\/([\w.]+)\.js(?:\?v=\w+)?$/.exec(s.src);
    if (!m) throw new Error(`${FILE}: an unexpected script in the head: ${s.src}`);
    if (m[1] === 'support' && m[2].startsWith('sales_doc_')) libs.push(m[2].slice('sales_doc_'.length));
    else if (m[1] === 'js' && m[2] === 'attach_file_types') attachTypes = true;
    else if (m[1] === 'support' && m[2] === 'drag_scroll') drag = s.targets;
    else throw new Error(`${FILE}: an unexpected script in the head: ${s.src}`);
  }
  if (JSON.stringify(libs) !== JSON.stringify(T.libs)) throw new Error(`${FILE}: the scripts of the head changed: ${libs.join(' ')} (expected ${T.libs.join(' ')})`);
  if (attachTypes !== T.attachTypes) throw new Error(`${FILE}: attach_file_types.js ${attachTypes ? 'is' : 'is no longer'} loaded`);
  if (drag !== DRAG_TARGETS) throw new Error(`${FILE}: drag_scroll targets changed: ${drag}`);
  if (page.head.styles.length) throw new Error(`${FILE}: the head has an inline <style> (not expected)`);
  if (page.styles.length) throw new Error(`${FILE}: the content has an inline <style> (not expected)`);
  if (page.tabs.active !== type) throw new Error(`${FILE}: the active tab is "${page.tabs.active}", expected "${type}"`);
  for (const n of checkSaleTabs(page.tabs, NAV_CONFIG, th)) tabNotes.add(n);

  /* ---- markup ---- */
  const markup = editor(what('markup'), page.markup.replace(/^\s+/, '').replace(/\s+$/, ''));
  // the links to the list page (the back link) are routes of this app (core/navigation/java-links.ts)
  markup.text = markup.text.replace(/href="([^"#]*\.xhtml\?[^"]*)"/g, (_x, link) => `href="${routeOf(link.replace(/&amp;/g, '&'), what('markup'))}"`);
  if (markup.text.includes(CTX_MARK)) throw new Error(`${what('markup')}: #{request.contextPath} left in the markup: ${markup.text.match(/.{0,50}@@CTX@@.{0,50}/)[0]}`);
  const used = new Set(page.msgKeys);
  let tpl = toAngularTemplate(markup.text, what('markup'));
  tpl = tpl.replace(/^ {8}/gm, '').replace(/^\n+/, '');
  if (/\bon[a-z]+="/.test(tpl)) throw new Error(`${what('markup')}: an inline handler appeared — export its function (see sync-dashboard.mjs HANDLERS_EXTRA)`);

  /* ---- scripts: the inline script of each component, then the page script ---- */
  const scripts = [];
  const scriptMsgs = new Set();
  const scriptUses = [];
  for (const [i, raw] of page.scripts.entries()) {
    let js = raw.replace(/^\n/, '');
    js = await elToEnv(js, what(`script #${i + 1}`), (expr, quote) => {
      const k = msgKey(expr);
      if (k) {
        scriptMsgs.add(k);
        scriptUses.push({ key: k, quote });
        return `env.t(${JSON.stringify(k)})`;
      }
      if (expr === 'request.contextPath') return 'env.ctx';
      throw new Error(`${what(`script #${i + 1}`)}: EL not understood: #{${expr}}`);
    });
    js = js
      .replace(/(^|[^.\w$])swal\(/gm, '$1env.swal(')
      .replace(/\b(document|window)\.addEventListener\(/g, 'listen($1, ')
      .replace(/(^|[^.\w$])setTimeout\(/gm, '$1tmo(')
      .replace(/(^|[^.\w$])requestAnimationFrame\(/gm, '$1rt.raf(')
      .replace(/var\(--fs-adj\s*,\s*0px\)/g, 'var(--ts-fs-adj,0px)');
    const code = js.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '').replace(/\s\/\/[^\n'"]*$/gm, '');
    if (/#\{/.test(code)) throw new Error(`${what(`script #${i + 1}`)}: EL left over in code: ${code.match(/.{0,40}#\{.{0,40}/)[0]}`);
    if (/\b(setInterval|XMLHttpRequest|localStorage|sessionStorage|document\.cookie|window\.open|window\.location|location\.(href|reload|search|assign)|\.face\b)/.test(code)) {
      throw new Error(`${what(`script #${i + 1}`)}: a global the engine environment has to provide: ${code.match(/.{0,40}\b(setInterval|XMLHttpRequest|localStorage|sessionStorage|document\.cookie|window\.open|window\.location|location\.(href|reload|search|assign)|\.face)\b.{0,40}/)?.[0]}`);
    }
    const bare = code.match(/(^|[^.\w$'"])(fetch|swal|setTimeout|requestAnimationFrame)\(/m);
    if (bare) throw new Error(`${what(`script #${i + 1}`)}: a bare ${bare[2]}( call is left`);
    scripts.push(js.replace(/\s+$/, '\n'));
  }
  for (const k of scriptMsgs) used.add(k);
  checkScriptMessages(scriptUses, th, en, what('scripts'));
  checkMarkupMessages(messageContexts(tpl), th, en, what('markup'));
  const winNames = [...new Set(scripts.flatMap((s) => publishedNames(s)))];

  /* ---- engine ---- */
  const libNames = T.libs;
  const exported = [...new Set([...libNames.flatMap((k) => PUBLISHED[k]), ...winNames])];
  const fn = `startSalesDoc${T.Name}`;
  const scaffold = engineScaffold({
    header: `
 * Sales-document form engine — ${T.prefix}. ${GENERATED(`web/${FILE} + its components`)}
 *
 * The page script(s) of the Java form, same behaviour line by line, on top of the engine scripts of sales-doc-libs.engine.ts (the scripts
 * its head loads: ${libNames.map((k) => `sales_doc_${k}.js`).join(' · ')}).
 *
 * WHY it is imperative DOM code and not Angular components: the Java page draws its HTML from data as strings. Porting it 1:1 is what
 * guarantees the screen, texts and states are identical to the production system.
 * "@ts-nocheck": the source is ES5 written for a browser global scope; typing it would change it, not port it.
 *
 * What changed versus the Java file (all of it lives in tools/sync-sales-doc-form.mjs):
 *   - the environment is injected (SalesDocFormEnv): messages, fetch (the BFF contract of sales-doc-backend.ts), SweetAlert, navigation, the
 *     context path — in Java these were EL, the URL and globals;
 *   - the strip of tabs that sales_doc_tabs.xhtml injects into the Java top bar is drawn by the Angular shell (nav.config.ts);
 *   - global listeners and timers added through listen() / tmo(), the animation frames, the boxes the scripts move to <body> and the response
 *     guard are removed by the function returned from ${fn}().`,
    envType: 'SalesDocFormEnv',
    envBody: `  /** commonBean.msg['key'] in the active language */
  t: (key: string) => string;
  /** the BFF contract of the page: /board/prospect-list, /rvapi?action=materials, /board/prospect/attachments, /board/chat-master-data${T.prefix === 'aq' || T.prefix === 'ad' ? ', /resources/mock/auto_dealer_master.json' : ''} (see sales-doc-backend.ts) */
  fetch: (input: string, init?: RequestInit) => Promise<Response>;
  /** SweetAlert v2 (js/sweetalert/sweetalertv1.min.js) */
  swal: (options: Record<string, unknown>) => Promise<any>;
  /** window.location.href = … : a route of this app, or an absolute address of this origin (the link back to the list) */
  navigate: (address: string) => void;
  /** #{request.contextPath}: where the BFF is ("" here) */
  ctx: string;`,
    fn,
    guardTail: `  var rt = createSalesDocRuntime({ listen: listen, tmo: tmo, track: track });
  /* the engine scripts the head of the Java page loads, in its order */
  createSalesDocLibs(env, rt, ${JSON.stringify(libNames)});`,
    handlers: [],
    exported,
    cleanup: `    rt.destroy();
`,
  });
  const header = scaffold.header.replace('\nexport interface', "\nimport { createSalesDocLibs, createSalesDocRuntime } from './sales-doc-libs.engine';\n\nexport interface");
  const body = scripts.map((s, i) => `\n  /* ---- inline script ${i + 1} of ${scripts.length} of the page ---- */\n` + s.replace(/\s+$/, '\n').replace(/^/gm, '  ').replace(/^ +$/gm, '')).join('');
  const engineText =
    header +
    scaffold.guard +
    body +
    scaffold.footer() +
    `
/** what the host has to load / start for this form (the Java head: attach_file_types.js, drag_scroll.js) */
export const SALES_DOC_${type.toUpperCase()}_NEEDS = { attachFileTypes: ${T.attachTypes}, dragScroll: ${JSON.stringify(DRAG_TARGETS)} };
`;
  const undeclared = await undeclaredNames(engineText.replace(/^\/\/ @ts-nocheck\n/, ''), ['SalesDocPaymentMsg', 'SalesDocAutoMsg', 'TsAttachTypes', ...Object.values(PUBLISHED).flat()]);
  if (undeclared.length) throw new Error(`${type} engine: names that are not declared (a ReferenceError in strict mode): ${undeclared.join(', ')}`);
  writeFileSync(join(out, `sales-doc-${type}.engine.ts`), engineText);

  /* ---- template ---- */
  writeFileSync(
    join(out, `sales-doc-${type}.html`),
    `<!-- ${GENERATED(`web/${FILE} + its components`)}
     The markup of ${base} with its includes spelled out and its parameters resolved (tools/lib/facelets.mjs); #{commonBean.msg[…]} -> t('…') ·
     hasFeature(…) -> can('…') · the server values (branch, user, language …) -> ini.… · the link back to the list is its route · the rest is verbatim -->\n` +
      tpl.replace(/\s+$/, '\n'),
  );

  /* ---- stylesheet (written last: the dark port reads the markup and the scripts) ---- */
  const SCOPE = ':where(ts-sales-doc-' + type + '-view, .qm-overlay, .qm-bar, .qm-toast)';
  const cssParts = T.css.map((f) => {
    const e = editor(f, read(`resources/support/${f}`).replace(/\s+$/, ''));
    if (f === 'sales_doc_form.css') {
      // the first two rules style elements of the Java template; the Angular shell has the same box: #crm_main_body_page
      e.swap(
        `#crm_main_body_page { padding: 0 !important; background: #F0F2FF !important; }
.layout-main .layout-content { padding: 0 !important; }
`,
        `/* (Java: #crm_main_body_page / .layout-main .layout-content — see the Angular adaptation block) */
`,
      );
    }
    const notes = [];
    const text = portCss(e.text, f, notes);
    notes.forEach((n) => cssNotes.add(n));
    return { file: f, text };
  });
  const cssAll = cssParts.map((p) => `/* ═════ ${p.file} ═════ */\n${p.text}`).join('\n\n');
  const pageText = tpl + '\n' + cssAll + '\n' + scripts.join('\n');
  const dark = darkPort(read('resources/support/dark_mode.css'), pageText, SCOPE, 1);
  const host = `ts-sales-doc-${type}-view`;
  const adapted = adaptation({ read, scope: SCOPE, host, text: tpl + '\n' + scripts.join('\n') });
  const hostRule = new RegExp(`^${host} \\{ display: contents; font-size: ([^;]+); color: ([^;]+); \\}$`, 'm').exec(adapted);
  const hostDark = new RegExp(`^html\\[data-theme='dark'\\] ${host} \\{ color: ([^;]+); \\}$`, 'm').exec(adapted);
  if (!hostRule || !hostDark) throw new Error('the host rule of adaptation() was not found — port-kit.mjs changed');
  const SHELL_BOX = `/* the two rules sales_doc_form.css sets on the Java template's boxes (#crm_main_body_page, .layout-main .layout-content) — the Angular shell's content box has the same id */
#crm_main_body_page:has(${host}) { padding: 0 !important; background: #F0F2FF !important; }
/* The pop-up lock below (html:has(.qm-overlay.qm-open) { overflow: hidden }) keeps the scroll position of the Java page, whose <body> is as tall as its
   content. The <body> of this app is the height of the window (styles/_base.scss): with the lock on it would become the scroller and the page would
   jump to the top when a pop-up opens — so while one is open the <body> grows with the content like the Java one. */
html:has(${host}):has(.qm-overlay.qm-open) body { height: auto; }
/* The shell turns every transition into 0.01 ms when the user asks for reduced motion (styles/_base.scss) — a transition that short still runs for a frame. The pop-ups
   centre themselves by clearing the transform of the dialog and measuring it at once (SalesDocModal.center()): they would measure the START of that transition and sit
   off centre. The Java app has no such rule (no transition at all), so the boxes of the page are given none. */
@media (prefers-reduced-motion: reduce) {
  :where(${host}, .qm-overlay, .bk-oi-overlay, .qm-bar, .qm-toast) * { transition-duration: 0s !important; }
}
`;
  // project_root.css: `[type="text"] { padding: 10px !important }` reaches every text input of a Java page; the Angular shell limits it to ts-shell and
  // the ods lists (styles/_base.scss), so a text input of a pop-up moved to <body> needs it too (same specificity as the original)
  const TEXT_INPUT = ruleBody(read('css/project_root.css'), 'project_root.css', '[type="text"]');
  const MOVED_BOXES = `/* the boxes the engine scripts append to <body> (pop-ups, the validation bar, the toast): the text defaults of the Java <body> (zero specificity: a rule of the box itself wins, as it wins over what is inherited) */
:where(.qm-overlay, .qm-bar, .qm-toast) { font-size: ${hostRule[1]}; color: ${hostRule[2]}; }
:where(html[data-theme='dark']) :where(.qm-overlay, .qm-bar, .qm-toast) { color: ${hostDark[1]}; }
/* project_root.css  [type="text"] — a text input outside ts-shell (the pop-ups on <body>) */
:where(.qm-overlay, .qm-bar, .qm-toast) [type="text"] { ${TEXT_INPUT} }
`;
  writeFileSync(
    join(out, `sales-doc-${type}.scss`),
    `/* Sales-document form stylesheet (${type}). ${GENERATED(`the stylesheets of web/${FILE}`)}
   ${T.css.join(' + ')} copied verbatim (in the order of the Java head), except:
     the two rules on #crm_main_body_page / .layout-main .layout-content -> Angular adaptation block
     body[data-theme="dark"] -> html[data-theme='dark']       (the Angular shell puts the theme on <html>; same specificity)
     --fs-adj                -> --ts-fs-adj                   (A A A font scale token of the Angular shell)
   drag_scroll.css is global in the Angular shell (styles/_drag-scroll.scss). Loaded with ViewEncapsulation.None: the engine writes HTML strings
   that need global selectors. */

` +
      adapted +
      SHELL_BOX +
      MOVED_BOXES +
      '\n' +
      cssAll.replace(/\s+$/, '\n') +
      `\n/* ───── dark_mode.css of the Java app, scoped to the page (${dark.kept} rules that can match it, of ${dark.seen} selectors) ───── */\n${dark.css}\n`,
  );
  summary.push(`${type}: ${used.size} messages, ${libNames.length} libs, ${dark.kept} dark rules; markup ${tpl.length}, css ${cssAll.length}, scripts ${scripts.join('').length}`);
}
for (const n of cssNotes) console.warn('  ! ' + n);
for (const n of tabNotes) console.warn('  ! top bar (shared file nav.config.ts, see INTEGRATION.md): ' + n);
console.log(`Sales-document forms synced from ${java}:\n  ` + summary.join('\n  '));
