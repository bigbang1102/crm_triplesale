#!/usr/bin/env node
/**
 * Regenerates the two forms of the supporting documents from the Java original so the two can never drift while both exist:
 *
 *   npm run supporting-doc-form:sync          (Java project = ../triple_sale_main, or set TS_JAVA_ROOT)
 *
 *   form   Java web/pages/sales_document_sub_1.xhtml … sales_document_sub_6.xhtml (six copies of one page: rendered as six, compared, written once with the
 *          family as `cfg`)                        ->  src/app/features/supporting-docs/form/supporting-doc-form.{html,scss,engine.ts,meta.ts}
 *   form7  Java web/pages/sales_document_sub_7.xhtml (the credit application: borrower / co-borrower / guarantor, 270 fields, no documents tab)
 *                                                  ->  src/app/features/supporting-docs/form/supporting-doc-form-7.{html,scss,engine.ts,meta.ts}
 *   both   Java web/pages/inc/{sd_field_ro,sd_customer_field,save_confirm_dialog}.xhtml, resources/support/{crm_form.css,sd_customer_lazy.js}
 *          sd_customer_lazy.js  ->  public/assets/java-js/sd_customer_lazy.js   (byte for byte; the host loads it, as the page did)
 *
 * The markup is rendered by tools/lib/jsf.mjs (the same code the comparison harness uses for the Java replica) in template mode: `rendered` becomes
 * `@if`, `ui:repeat` becomes `@for`, `#{commonBean.msg[…]}` becomes `t('…')`, the bean is `bean`, the PrimeFaces components are the markup their
 * renderers write (tools/lib/pf-dom.mjs) — the widget scripts (select, calendar, check box) are the REAL ones (public/assets/vendor/primefaces).
 *
 * Differences between the six copies that are not behaviour (the ids of the sections / of the receive controls: sd-panel-1 · sd2-panel-1 …, sdN RcvDate)
 * are unified before the copies are compared (the family 1 spelling is the template's) — see `normalizeSource`. What differs on purpose is `cfg`
 * (title, document code, roles View / Edit). The Java files are only READ; the outputs carry a "GENERATED" header.
 */
import { copyFileSync, mkdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadTs } from './compare/lib/load-ts.mjs';
import { CTX_MARK, Dyn, createRenderer, toAngular } from './lib/jsf.mjs';
import { adaptation, engineScaffold, globalClassRules, usedClasses } from './lib/port-kit.mjs';
import { darkPort, editor, reader, undeclaredNames } from './lib/port.mjs';
import { elToEnv, msgKey } from './lib/sales-doc.mjs';
import { bundles, checkScriptMessages, dedent, portCss } from './lib/sales-doc-forms.mjs';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const javaRoot = resolve(process.env.TS_JAVA_ROOT ?? join(root, '..', 'triple_sale_main'));
const java = join(javaRoot, 'web');
const out = join(root, 'src/app/features/supporting-docs/form');
mkdirSync(out, { recursive: true });
const read = reader(java);
const { th, en } = bundles(root);
const { SUPPORTING_DOC_TYPES: TYPES } = await loadTs(root, 'src/app/features/supporting-docs/supporting-doc-types.ts', join(tmpdir(), 'ts-gen-supporting-doc-form'));

const UPDATE_TARGETS = { form: ['sd1RcvDate', 'sd1RcvBy', 'sdDocList'], form7: ['sd7RcvDate', 'sd7RcvBy'] };

/* the includes every form shares: their scripts and styles */
const incFile = (name) => `pages/inc/${name}.xhtml`;
const shared = createRenderer({ mode: 'ng', read, vars: {}, viewDate: (v) => v, linkTarget: () => '' });
const saveDialog = shared.partsOfFile(incFile('save_confirm_dialog'));
const customerField = shared.partsOfFile(incFile('sd_customer_field'));
if (saveDialog.scripts.length !== 1 || saveDialog.styles.length !== 1) throw new Error('save_confirm_dialog.xhtml: expected one <script> and one <style>');
if (customerField.scriptSrc.length !== 1 || !/sd_customer_lazy\.js/.test(customerField.scriptSrc[0].src) || customerField.scripts.length !== 1 || !/sdCustomerLazy\.init\('sdCustomerWv'\);/.test(customerField.scripts[0])) {
  throw new Error('sd_customer_field.xhtml: the scripts changed');
}

/** the source of a page with what differs between the families only in spelling unified (family 1's ids) and the document code made a parameter */
function normalizeSource(t, kind) {
  return (path) => {
    let text = read(path);
    if (path !== `pages/${t.subPage}.xhtml`) return text;
    if (kind === 'form') {
      const code = new RegExp(`<ui:param name="val" value="${t.docCode}" />`, 'g');
      if ((text.match(code) ?? []).length !== 1) throw new Error(`${path}: expected one <ui:param name="val" value="${t.docCode}">`);
      text = text.replace(code, '<ui:param name="val" value="#{cfg.docCode}" />');
      if (t.n > 1) {
        text = text.replace(new RegExp(`\\bsd${t.n}(RcvDate|RcvBy)\\b`, 'g'), 'sd1$1').replace(new RegExp(`\\b${t.panel}-panel-`, 'g'), 'sd-panel-');
      }
    }
    return text;
  };
}

function renderFamily(t, kind) {
  const file = `pages/${t.subPage}.xhtml`;
  const r = createRenderer({
    mode: 'ng',
    read: normalizeSource(t, kind),
    vars: { sales_documentView: new Dyn('bean'), cfg: new Dyn('cfg') },
    formAction: '#',
    updateTargets: new Set(UPDATE_TARGETS[kind]),
    linkTarget: () => {
      throw new Error(`${file}: a link to another page (not expected on a form)`);
    },
    // the file rows' handlers carry the address and the index of the row; written once, static (docAttOpenUrl reads both from the row): [attr.onclick] is refused by Angular
    rewriteAttr: (el, name, raw) => {
      const m = /^docAttOpenUrl\('(view|download)', '#\{sales_documentView\.docProxyUrl\(file\.remoteUrl\)\}', #\{status\.index\}, this\); return false;$/.exec(raw);
      return name === 'onclick' && m ? `docAttOpenUrl('${m[1]}', null, null, this); return false;` : raw;
    },
    viewDate: (v) => v,
  });
  const markup = r.renderFile(file, 'content');
  return { t, r, markup, head: r.partsOf(file, 'head'), content: r.partsOf(file, 'content'), file };
}

function normFamily(f, kind) {
  let m = f.markup;
  const swapAll = (find, repl, min = 1) => {
    const n = m.split(find).length - 1;
    if (n < min) throw new Error(`${f.file}: ${find} found ${n}x (expected ${min}+)`);
    m = m.split(find).join(repl);
  };
  swapAll(`t('${f.t.titleKey}')`, 't(cfg.titleKey)');
  swapAll(`can('${f.t.rolePrefix}_Edit')`, 'can(cfg.edit)');
  // the button registry (core/permissions/access-buttons.ts, PL-<family>-DT-01 … 04): Java never checked these four (always shown); the codes are per family,
  // the host puts them in `cfg.codes`. The file upload bar, the save button, and (on every file of the list) the download and the trash icon.
  const wrapOnce = (re, code, what, times = 1) => {
    const found = m.match(re) ?? [];
    if (found.length !== times) throw new Error(`${f.file}: ${what} found ${found.length}x (expected ${times})`);
    m = m.replace(re, (el) => `@if (access(cfg.codes.${code})) {${el}}`);
  };
  if (kind === 'form') {
    wrapOnce(/<div class="sd-doc-uploadbar">[\s\S]*?\n {36}<\/div>/g, 'upload', 'the upload bar');
    // (the page has two save buttons, one under the main tab and one under the documents tab: both open the same confirm and save the same form, so both are DT-01)
    wrapOnce(/<button [^>]*sd-save-btn[^>]*>[\s\S]*?<\/button>/g, 'save', 'the save buttons', 2);
    wrapOnce(/<i class="pi pi-download sd-doc-act"[^>]*><\/i>/g, 'download', 'the download icon');
    wrapOnce(/<i class="pi pi-trash sd-doc-act sd-doc-del"[^>]*><\/i>/g, 'delete', 'the trash icon');
  } else {
    // the credit application (sub_7) has no documents tab: its one button is the save (DT-01); upload / download / delete (DT-02 … 04) are not on this page
    wrapOnce(/<button [^>]*sd-save-btn[^>]*>[\s\S]*?<\/button>/g, 'save', 'the save button');
  }
  const viewRole = `can('${f.t.rolePrefix}_View')`;
  swapAll(viewRole, 'can(cfg.view)');
  const left = [...m.matchAll(/can\('([^']*)'\)/g)].map((x) => x[1]).filter((k) => !/^cfg\./.test(k));
  if (left.length) throw new Error(`${f.file}: a role the page does not share with the others: ${left.join(', ')}`);
  return m;
}

const KINDS = [
  { kind: 'form', families: TYPES.slice(0, 6), base: 'supporting-doc-form', host: 'ts-supporting-doc-form-view', env: 'SupportingDocFormEnv', fn: 'startSupportingDocForm' },
  { kind: 'form7', families: [TYPES[6]], base: 'supporting-doc-form-7', host: 'ts-supporting-doc-form-7-view', env: 'SupportingDocForm7Env', fn: 'startSupportingDocForm7' },
];

let totalMessages = new Set();
let darkKept = 0;
for (const k of KINDS) {
  const GENERATED = `GENERATED by tools/sync-supporting-doc-form.mjs from web/pages/${k.kind === 'form' ? 'sales_document_sub_{1…6}' : 'sales_document_sub_7'}.xhtml + pages/inc/{sd_field_ro,sd_customer_field,save_confirm_dialog}.xhtml + resources/support/{crm_form.css,sd_customer_lazy.js} — do not edit; change the script and run \`npm run supporting-doc-form:sync\`.`;
  const SCOPE = `:where(${k.host})`;
  const families = k.families.map((t) => renderFamily(t, k.kind));
  const normalized = families.map((f) => normFamily(f, k.kind));
  normalized.forEach((m, i) => {
    if (m !== normalized[0]) {
      const a = normalized[0].split('\n');
      const b = m.split('\n');
      const at = a.findIndex((l, n) => l !== b[n]);
      throw new Error(`${families[i].file} differs from ${families[0].file} beyond title / roles / document code (line ${at + 1}):\n  ${a[at]?.trim().slice(0, 200)}\n  ${b[at]?.trim().slice(0, 200)}`);
    }
  });
  const first = families[0];
  const used = new Set();
  for (const f of families) f.r.used.msgKeys.forEach((key) => used.add(key));
  const miss = [...used].filter((key) => !(key in th) || !(key in en));
  if (miss.length) throw new Error(`messages missing from the bundles: ${miss.join(', ')}`);
  used.forEach((key) => totalMessages.add(key));

  // every `update=` of the page is something the template re-creates
  const updated = new Set([...first.r.actions.flatMap((a) => (a.update ?? '').split(/\s+/)), ...first.r.widgets.flatMap((w) => (w.ajax ? w.ajax.update.split(/\s+/) : []))].filter(Boolean).map((u) => u.split(':').pop()));
  for (const u of updated) if (!UPDATE_TARGETS[k.kind].includes(u)) throw new Error(`${first.file}: an update target the generator does not know: ${u}`);

  /* ---- the head and the scripts */
  for (const f of families) {
    if (JSON.stringify(f.head.links) !== JSON.stringify(['#{request.contextPath}/resources/support/crm_form.css?v=20260923a'])) throw new Error(`${f.file}: the stylesheets of the head changed: ${f.head.links.join(' ')}`);
    if (f.head.scriptSrc.length !== 1 || !/resources\/js\/jquery\.min\.js/.test(f.head.scriptSrc[0].src)) throw new Error(`${f.file}: the scripts of the head changed`);
    if (f.content.scripts.length !== 1) throw new Error(`${f.file}: expected one inline script in the content, found ${f.content.scripts.length}`);
  }
  const scriptsText = families.map((f) => f.content.scripts[0]);
  scriptsText.forEach((s, i) => {
    if (s !== scriptsText[0]) throw new Error(`${families[i].file}: the content script differs from ${families[0].file}`);
  });

  /* ================================================================================== markup */
  let tpl = toAngular(normalized[0], k.kind);
  tpl = tpl.replace(new RegExp(`${CTX_MARK}/images/([\\w./-]+)`, 'g'), (_m, p) => `assets/images/${p}`);
  if (tpl.includes(CTX_MARK) || /\u0001/.test(tpl)) throw new Error('#{request.contextPath} left in the markup');
  // the toggles of the sections: the header's handler reads the id of the panel next to it (the six copies have ids of their own in Java)
  let n = 0;
  tpl = tpl.replace(/onclick="togglePanel\(this, '([\w-]+)'\)"/g, () => (n++, `onclick="togglePanel(this, this.nextElementSibling.id)"`));
  if (!n) throw new Error('no togglePanel handler found');
  writeFileSync(
    join(out, `${k.base}.html`),
    `<!-- ${GENERATED}
     The markup of ${k.kind === 'form' ? 'sales_document_sub_1.xhtml (the six copies are the same page: the title, the document code and the roles View / Edit are `cfg`; the ids of the sections and of the receive controls are those of family 1)' : 'sales_document_sub_7.xhtml'},
     rendered by tools/lib/jsf.mjs: rendered -> @if · ui:repeat -> @for · #{commonBean.msg[…]} -> t('…') · hasFeature(…) -> can(…) · the bean is \`bean\` ·
     the PrimeFaces components are the markup of their renderers (tools/lib/pf-dom.mjs; the widgets are started by the host with the configuration of ${k.base}.meta.ts) ·
     the ajax plumbing of PrimeFaces is the host's ab(…) · the header of a section reads the id of the panel next to it · the rest is verbatim.
     The host gives: ready(), bean, cfg, can(), t(), vd(), snap(), upd(), ab(), onSubmit() — see ${k.base}-view.ts -->
@if (ready()) {
${tpl.trim()}
}
`,
  );

  /* ================================================================================== engine */
  const page = editor(`${k.base}: the inline script`, scriptsText[0].replace(/^\s*\/\/<!\[CDATA\[\n/, '').replace(/\n\s*\/\/\]\]>\s*$/, '\n'));
  page.swap(`window.ctActiveTab = window.ctActiveTab || 1;`, `window.ctActiveTab = 1;`);
  page.swap(`if (window.jQuery) { jQuery(document).ajaxComplete(function () { ctApplyTab(); }); }`, `if (window.jQuery) { jQuery(document).on('ajaxComplete.sdform', function () { ctApplyTab(); }); }`);
  page.swap(`if (document.readyState === 'loading') { document.addEventListener('DOMContentLoaded', ctApplyTab); } else { ctApplyTab(); }`, `onReady(ctApplyTab);`);

  const dialog = editor('save_confirm_dialog.xhtml: the script', saveDialog.scripts[0].replace(/^\s*\/\/<!\[CDATA\[\n/, '').replace(/\n\s*\/\/\]\]>\s*$/, '\n'));
  dialog.swap(`var isEdit = /[?&]action_type=edit(&|$)/.test(window.location.search);`, `var isEdit = env.actionType === 'edit';`);
  dialog.swap(`if (!/[?&]action_type=detail(&|$)/.test(window.location.search)) { return; }`, `if (env.actionType !== 'detail') { return; }`);
  dialog.swapBlock(`        function sdGoEdit() {`, `        /* โหมด detail (กดไอคอน`, `        function sdGoEdit() {\n            env.goEdit();\n        }\n\n`);
  dialog.swapAll(`if (document.readyState === 'loading') {\n            document.addEventListener('DOMContentLoaded', sdApplyReadOnly);\n        } else { sdApplyReadOnly(); }`, `onReady(sdApplyReadOnly);`, 1);
  dialog.swap(`if (window.jQuery) { jQuery(document).ajaxComplete(function () { sdApplyReadOnly(); }); }`, `if (window.jQuery) { jQuery(document).on('ajaxComplete.sdform', function () { sdApplyReadOnly(); }); }`);
  dialog.swapAll(`if (document.readyState === 'loading') {\n            document.addEventListener('DOMContentLoaded', sdApplyDocIcons);\n        } else { sdApplyDocIcons(); }`, `onReady(sdApplyDocIcons);`, 1);
  dialog.swap(`if (window.jQuery) { jQuery(document).ajaxComplete(function () { sdApplyDocIcons(); }); }`, `if (window.jQuery) { jQuery(document).on('ajaxComplete.sdform', function () { sdApplyDocIcons(); }); }`);
  dialog.swap(`_sdUpWatchdog = window.setTimeout(function () { sdUploadSet(0); }, 180000);`, `_sdUpWatchdog = tmo(function () { sdUploadSet(0); }, 180000);`);
  dialog.swap(`document.addEventListener('change', function (ev) {`, `listen(document, 'change', function (ev) {`);
  dialog.swap(`document.addEventListener('drop', function (ev) {`, `listen(document, 'drop', function (ev) {`);
  dialog.swap(`setTimeout(function () { URL.revokeObjectURL(href); }, 1000);`, `tmo(function () { URL.revokeObjectURL(href); }, 1000);`);
  dialog.swap(`var SD_UPLOAD_MAX_BYTES = #{commonBean.uploadMaxBytes};`, `var SD_UPLOAD_MAX_BYTES = env.uploadMaxBytes;`);
  dialog.swap(`var SD_UPLOAD_MAX_LABEL = '#{commonBean.uploadMaxLabel}';`, `var SD_UPLOAD_MAX_LABEL = env.uploadMaxLabel;`);
  // the files of the browser (DocAttachServlet: /docattach, from the session) are the host's; remote files are fetched by the browser itself (env.fetch passes them on)
  dialog.swapBlock(`        function docAttDocId() {`, `        /* URL ของไฟล์ที่ยังอยู่แค่ session store`, `        function docAttDocId() {\n            return env.docId();\n        }\n`);
  dialog.swap(`return '../docattach?action=' + action`, `return '/docattach?action=' + action`);
  dialog.swap(`if (action !== 'download') { window.open(target, '_blank'); return; }`, `if (action !== 'download') { env.open(target); return; }`);
  dialog.swap(`fetch(target, { credentials: 'same-origin' })`, `env.fetch(target, { credentials: 'same-origin' })`);
  dialog.swap(`fetch('../docattach?action=describe&docId=' + encodeURIComponent(id) + '&i=' + i, {`, `env.fetch('/docattach?action=describe&docId=' + encodeURIComponent(id) + '&i=' + i, {`);
  // the rows' handlers are static (the row knows its index and address): docAttOpenUrl('view', null, null, this) reads them from the row
  dialog.swap(
    `        function docAttOpenUrl(action, url, i, srcEl) {\n            var filename = sdRowFilename(srcEl);`,
    `        function docAttOpenUrl(action, url, i, srcEl) {\n            if (url === null || i === null) {\n                var rowEl = srcEl.closest('.sd-doc-row');\n                i = Array.prototype.indexOf.call(rowEl.parentNode.querySelectorAll('.sd-doc-row'), rowEl);\n                url = env.fileUrl(i);\n            }\n            var filename = sdRowFilename(srcEl);`,
  );
  dialog.text = dialog.text.replace(/(^|[^.\w$'"])swal\(/gm, '$1env.swal(');

  const js = { page, dialog };
  let geo = null;
  if (k.kind === 'form7') {
    // the geo script (provinces → districts → sub-districts + the post code) is the tail of the inline script of sub_7
    const text = page.text;
    const at = text.indexOf('/* ═══════════════════════════════════════════════════════════════════\n               ★ 24/08: จังหวัด / เขต-อำเภอ');
    if (at < 0) throw new Error('sub_7: the geo script was not found');
    geo = editor('sub_7: the geo script', text.slice(at).replace(/\n\s*\/\/\]\]>\s*$/, '\n'));
    page.text = text.slice(0, at);
    geo.swap(`var CTX = '#{request.contextPath}';`, `var CTX = '';`);
    geo.swap(`return fetch(url, { credentials: 'same-origin' })`, `return env.fetch(url, { credentials: 'same-origin' })`);
    geo.swap(`if (document.readyState === 'loading') { document.addEventListener('DOMContentLoaded', initGeo); } else { initGeo(); }`, `onReady(initGeo);`);
    geo.swap(`if (window.jQuery) { jQuery(document).ajaxComplete(function () { initGeo(); }); }`, `if (window.jQuery) { jQuery(document).on('ajaxComplete.sdform', function () { initGeo(); }); }`);
    js.geo = geo;
  }
  const uses = [];
  for (const [name, e] of Object.entries(js)) {
    e.text = await elToEnv(e.text, `${k.base} ${name} script`, (expr, quote) => {
      const key = msgKey(expr);
      if (key) {
        used.add(key);
        totalMessages.add(key);
        uses.push({ key, quote });
        return `env.t(${JSON.stringify(key)})`;
      }
      throw new Error(`${name} script: EL not understood: #{${expr}}`);
    });
  }
  checkScriptMessages(uses, th, en, `${k.base} scripts`);
  for (const [name, e] of Object.entries(js)) {
    const code = e.text.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
    if (/#\{/.test(code)) throw new Error(`${name} script: EL left over in code: ` + code.match(/.{0,40}#\{.{0,40}/)[0]);
    if (/\b(setInterval|setTimeout|XMLHttpRequest|localStorage|sessionStorage|document\.cookie|window\.open|window\.location|location\.(href|reload|search))\b/.test(code)) {
      throw new Error(`${name} script: unexpected timer / XHR / storage / navigation: ${code.match(/.{0,60}\b(setInterval|setTimeout|XMLHttpRequest|localStorage|sessionStorage|document\.cookie|window\.open|window\.location|location\.(href|reload|search))\b.{0,40}/)[0]}`);
    }
    if (/(^|[^.\w$'"])(fetch|swal)\(/m.test(code)) throw new Error(`${name} script: a bare fetch / swal is left`);
  }
  const HANDLERS = ['sdOpenSaveConfirm', 'sdCloseSaveConfirm', 'sdConfirmOverlayClick', 'sdConfirmSave', 'sdGoEdit', 'sdAskDeleteFile', 'sdAfterDeleteFile', 'docAttOpenUrl', 'docAttEditDesc', 'ctShowTab', 'togglePanel', 'sdUploadStart', 'sdUploadDone', 'sdUploadRejected'];
  const scaffold = engineScaffold({
    header: `
 * Supporting-document form engine. ${GENERATED}
 *
 * The scripts of the Java form, same behaviour line by line: the tabs and the toggles of the sections (the inline script), the confirmation of the save, the
 * read-only mode of the detail, the upload state, the file rows (view / download / description / delete with the SweetAlert confirm, the icon of the type of
 * the file) of save_confirm_dialog.xhtml${k.kind === 'form7' ? ' and the province → district → sub-district drop-downs with the post code' : ''}.
 *
 * WHY it is imperative DOM code and not Angular components: the Java page is written that way; porting it 1:1 is what guarantees the screen and its states
 * are those of the production system. "@ts-nocheck": the source is ES5 written for a browser global scope; typing it would change it, not port it.
 *
 * What changed versus the Java files (all of it lives in tools/sync-supporting-doc-form.mjs):
 *   - the environment is injected (${k.env}): texts, SweetAlert, the mode (add / edit / detail) and the id of the document, navigation to the edit mode, the files of
 *     the browser (what /docattach served from the session), the address of a file, fetch (the BFF contract: /docattach${k.kind === 'form7' ? ', /board/provinces · /board/districts · /board/sub-districts' : ''});
 *   - location.search / location.href are env.actionType / env.docId / env.goEdit(); window.open is env.open(); swal(…) is env.swal(…);
 *   - the rows' handlers are static (docAttOpenUrl('view', null, null, this): the row knows its index and address);
 *   - document / jQuery listeners are added through listen() / the namespace .sdform and removed by destroy(); DOMContentLoaded handlers run through onReady().`,
    envType: k.env,
    envBody: `  /** commonBean.msg['key'] in the active language */
  t: (key: string) => string;
  /** SweetAlert (the library of the Java page) */
  swal: (options: Record<string, unknown>) => Promise<unknown>;
  /** the mode of the form (Java: ?action_type=) and the id of the document (?quotation_id=) */
  actionType: 'add' | 'edit' | 'detail';
  docId: () => string;
  /** the button "แก้ไขข้อมูล" of the detail: the same page in the edit mode */
  goEdit: () => void;
  /** the browser's own requests: /docattach (the files of the browser — DocAttachServlet)${k.kind === 'form7' ? ', /board/provinces · /board/districts · /board/sub-districts' : ''}, any other address goes to the network */
  fetch: (input: string, init?: RequestInit) => Promise<Response>;
  /** window.open(url, '_blank') — a /docattach address is the object URL of a file of the browser */
  open: (url: string) => void;
  /** the address of the file of row i (the backend's: through /docproxy in Java, the address itself here; '' for a file that is only in the browser) */
  fileUrl: (i: number) => string;
  /** commonBean.uploadMaxBytes / uploadMaxLabel */
  uploadMaxBytes: number;
  uploadMaxLabel: string;${k.kind === 'form' ? `
  /** is the customer drop-down of the page there (add mode only): sdCustomerLazy.init needs it */
  hasCustomerSelect: () => boolean;` : `
  hasCustomerSelect: () => boolean;`}`,
    fn: k.fn,
    guardExtra: '',
    handlers: HANDLERS,
    exported: [...HANDLERS, 'ctActiveTab'],
    cleanup: `    if (window.jQuery) { jQuery(document).off('.sdform'); }\n`,
  });
  const sections = [
    `  /* ---- the inline script of the page ---- */`,
    page.text.replace(/\s+$/, '').replace(/^/gm, '  '),
    `\n  /* ---- pages/inc/save_confirm_dialog.xhtml ---- */`,
    dialog.text.replace(/\s+$/, '').replace(/^/gm, '  '),
    `\n  /* ---- pages/inc/sd_customer_field.xhtml: <script>sdCustomerLazy.init('sdCustomerWv');</script> (sd_customer_lazy.js is loaded by the host) ---- */`,
    `  onReady(function () { if (window.sdCustomerLazy && env.hasCustomerSelect()) { sdCustomerLazy.init('sdCustomerWv'); } });`,
  ];
  if (geo) sections.push(`\n  /* ---- sub_7: provinces / districts / sub-districts ---- */`, geo.text.replace(/\s+$/, '').replace(/^/gm, '  '));
  const engineText = scaffold.header + scaffold.guard + sections.join('\n') + '\n' + scaffold.footer();
  const undeclared = await undeclaredNames(engineText.replace(/^\/\/ @ts-nocheck\n/, ''), ['sdCustomerLazy', 'jQuery']);
  if (undeclared.length) throw new Error(`${k.base} engine: names that are not declared (a ReferenceError in strict mode): ${undeclared.join(', ')}`);
  writeFileSync(join(out, `${k.base}.engine.ts`), engineText);

  /* ================================================================================== meta */
  const R = first.r;
  const prefixes = (list) => list.map((b) => ({ ...b }));
  writeFileSync(
    join(out, `${k.base}.meta.ts`),
    `/* ${GENERATED} */
/** every input of the form: the id of its element, the EL of the bean it is bound to (what a post of the form lays into the bean) and its kind */
export const FORM_BINDINGS: readonly { id: string; el: string; kind: string }[] = ${JSON.stringify(prefixes(R.bindings.map((b) => ({ id: b.id, el: b.value, kind: b.kind }))), null, 1)};
/** the PrimeFaces widgets of the page (PrimeFaces.cw): type, client id, the widgetVar of its own (or ''), the configuration, and the change behaviour (p:ajax) */
export const FORM_WIDGETS: readonly { type: string; id: string; widgetVar: string; cfg: Record<string, unknown>; ajax?: { event: string; listener: string; update: string; process: string } }[] = ${JSON.stringify(R.widgets.map((w) => ({ type: w.type, id: w.id, widgetVar: w.widgetVar ?? '', cfg: w.cfg, ajax: w.ajax })), null, 1)};
/** p:fileUpload: the addresses of the callbacks are the page's own functions (sdUploadStart …), run by the host */
export const FORM_UPLOADS: readonly { id: string; allowTypes?: string; sizeLimit?: string; multiple: boolean; auto: boolean; sequential: boolean; dropZone?: string; onstart?: string; oncomplete?: string; oncancel?: string; onvalidationfailure?: string; listener?: string; update: string }[] = ${JSON.stringify(R.uploads, null, 1)};
/** p:remoteCommand */
export const FORM_REMOTE: readonly { name: string; id: string; listener: string; oncomplete?: string; onerror?: string }[] = ${JSON.stringify(R.remoteCommands, null, 1)};
/** the parts of the page an ajax action re-draws (\`update=\`): the template re-creates them when \`upd(id)\` changes */
export const FORM_UPDATE_TARGETS: readonly string[] = ${JSON.stringify(UPDATE_TARGETS[k.kind])};
export const FORM_ID = 'quotationForm';
`,
  );

  /* ================================================================================== stylesheet */
  const crmForm = read('resources/support/crm_form.css').replace(/\s+$/, '');
  const dialogCss = saveDialog.styles[0];
  const cssText = [portCss(dedent(crmForm), 'crm_form.css'), portCss(dedent(dialogCss), 'save_confirm_dialog.xhtml <style>')].join('\n');
  const pageText = normalized[0] + '\n' + cssText + '\n' + Object.values(js).map((e) => e.text).join('\n');
  const dark = darkPort(read('resources/support/dark_mode.css'), pageText, SCOPE, 1);
  darkKept += dark.kept;
  const adaptText = normalized[0] + '\n' + Object.values(js).map((e) => e.text).join('\n');
  const adapted = adaptation({ read, scope: SCOPE, host: k.host, text: adaptText }) + globalClassRules({ read, used: usedClasses(adaptText), scope: SCOPE });
  writeFileSync(
    join(out, `${k.base}.scss`),
    `/* Supporting-document form stylesheet. ${GENERATED}
   crm_form.css + the <style> of save_confirm_dialog.xhtml copied verbatim, except:
     body[data-theme="dark"] -> html[data-theme='dark']       (the Angular shell puts the theme on <html>; same specificity)
     --fs-adj                -> --ts-fs-adj                   (A A A font scale token of the Angular shell)
   Loaded with ViewEncapsulation.None: the engine and the PrimeFaces widgets write HTML that needs global selectors. The widgets' own rules are pf-theme.scss / pf-template.scss. */

${adapted}
${dedent(cssText)}

/* ───── dark_mode.css of the Java app, scoped to the page (${dark.kept} rules that can match it, of ${dark.seen} selectors) ───── */
${dark.css}
`,
  );
}

/* the script of the customer drop-down: loaded by the host as the page did (byte for byte) */
mkdirSync(join(root, 'public/assets/java-js'), { recursive: true });
copyFileSync(join(java, 'resources/support/sd_customer_lazy.js'), join(root, 'public/assets/java-js/sd_customer_lazy.js'));

console.log(`Supporting-doc forms synced from ${java}: ${KINDS.map((x) => `${x.kind} (${x.families.length} page${x.families.length > 1 ? 's' : ''} compared)`).join(', ')}, ${totalMessages.size} messages, ${darkKept} dark rules`);
