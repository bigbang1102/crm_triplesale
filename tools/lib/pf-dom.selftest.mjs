#!/usr/bin/env node
/**
 * Self-check of tools/lib/pf-dom.mjs on the page that needs the most of it (run: node tools/lib/pf-dom.selftest.mjs):
 *  1. web/pages/contracts_master_data.xhtml (the prospect form) is rendered, whole, in both modes — java (the three modes of the form: add · edit · view, with a stub bean) and
 *     ng (the template) — and nothing may throw (an unsupported tag, an EL the renderer cannot evaluate);
 *  2. every widget the page starts has a type, an id and a configuration with that id; every behaviour / button / remote command names a listener;
 *  3. the numbering of the components without an id (`j_idtN`) does not depend on `rendered`: every generated id of a java render is an id of the ng template;
 *  4. what the page writes that no renderer reads (`R.ignoredAttrs`) is listed — the real renderer may read it (then the markup is wrong) or ignore it on purpose.
 * It prints the number of components per type. Exit code 1 on a failed check.
 */
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { Dyn, createRenderer } from './jsf.mjs';
import { updateTargetIds } from './pf-dom.mjs';
import { reader } from './port.mjs';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const java = join(resolve(process.env.TS_JAVA_ROOT ?? join(root, '..', 'triple_sale_main')), 'web');
const read = reader(java);
const PAGE = 'pages/contracts_master_data.xhtml';
let fails = 0;
const check = (name, ok, extra = '') => {
  if (!ok) {
    fails++;
    console.log('FAIL', name, extra);
  }
};

/* a bean that answers every property with an empty text (a list for the `list*` properties, a function for the methods the page calls with an argument) */
const METHODS = new Set(['avatarSrc', 'telWithCode', 'formatTel']);
function stub(path, over = {}) {
  return new Proxy(over, {
    get: (t, k) => {
      if (typeof k !== 'string') return undefined;
      if (k in t) return t[k];
      if (METHODS.has(k)) return () => '';
      if (/^list|^prospectDocs$/.test(k)) return [];
      return /^contract(Bean|id)$/.test(k) ? stub(`${path}.${k}`) : '';
    },
  });
}

const render = (mode, actionType) => {
  const base = {
    mode,
    read,
    formAction: '#',
    updateTargets: new Set(['district_1', 'sub_district_1', 'district_2', 'sub_district_2', 'current_postid_in', 'senddoc_postid_in', 'senddoc_address_in', 'country_2', 'province_2', 'prospect_tel_code', 'ctMdDocPanel', 'confirmationDialogPros', 'confirmationDialogLead', 'confirmationDialogEditPros', 'confirmationDialogEditLead', 'confirmationDialogUpdate']),
    linkTarget: () => '#',
    viewDate: (v) => v,
    pfStrict: true,
  };
  const r =
    mode === 'java'
      ? createRenderer({
          ...base,
          vars: { contractView: stub('contractView', { action_type: actionType }) },
          msg: (k) => k,
          can: () => true,
          session: { uploadAcceptExt: '.pdf', ssEmployeeId: '1', aiHubEnabled: false },
        })
      : createRenderer({ ...base, vars: { contractView: new Dyn('bean') } });
  const html = r.renderFile(PAGE, 'content');
  return { r, html };
};

const runs = [];
for (const [mode, action] of [['java', 'add'], ['java', 'edit'], ['java', 'view'], ['ng', undefined]]) {
  try {
    runs.push({ mode, action, ...render(mode, action) });
  } catch (e) {
    check(`render ${mode}${action ? `/${action}` : ''}`, false, e.stack?.split('\n').slice(0, 3).join(' | '));
  }
}

/* 2 ------------------------------------------------------------------------------------ the records */
for (const run of runs) {
  const label = `${run.mode}${run.action ? `/${run.action}` : ''}`;
  const { widgets, actions, remoteCommands, bindings } = run.r;
  for (const w of widgets) {
    check(`${label}: widget has type/id/cfg`, !!w.type && !!w.id && w.cfg && w.cfg.id === w.id, JSON.stringify(w).slice(0, 120));
    if (run.mode === 'java') {
      const marker = w.type === 'Growl' ? '' : `id="${w.id}`;
      if (marker) check(`${label}: ${w.type} ${w.id} is in the markup`, run.html.includes(marker) || run.html.includes(w.id), w.id);
    }
  }
  for (const a of actions) check(`${label}: action ${a.source} names a listener or submits`, a.listener !== undefined || a.submit || a.upload || a.update !== undefined, JSON.stringify(a).slice(0, 140));
  for (const c of remoteCommands) check(`${label}: remote command ${c.name} names a listener`, !!c.listener, c.name);
  for (const b of bindings) check(`${label}: binding ${b.id} has a value expression`, !!b.value);
  check(`${label}: no EL left in the markup`, !/#\{/.test(run.html), (run.html.match(/.{0,40}#\{.{0,40}/) ?? [''])[0]);
}

/* 2b ----------------------------------------------------------------------------------- remote commands: process / update as the author wrote them (keywords kept, ids resolved) */
{
  const rc = Object.fromEntries((runs.find((r) => r.mode === 'ng')?.r.remoteCommands ?? []).map((c) => [c.name, c]));
  const want = {
    rc_createLead: ['@form', '@none'],
    rc_uploadProspectImage: ['@this', undefined],
    rc_reloadProspectDocs: ['@this', 'form:ctMdDocPanel'],
    rc_deleteProspectDoc: ['@this', 'form:ctMdDocPanel'],
    rc_doUpdateContract: ['@form', '@none'],
  };
  for (const [name, [process, update]] of Object.entries(want)) check(`remote command ${name}: process ${process} · update ${update}`, rc[name]?.process === process && rc[name]?.update === update, JSON.stringify(rc[name]));
  const ng0 = runs.find((r) => r.mode === 'ng')?.r;
  const targets = ng0 ? updateTargetIds(ng0) : new Set();
  for (const id of ['ctMdDocPanel', 'district_1', 'sub_district_1', 'current_postid_in', 'senddoc_postid_in', 'confirmationDialogPros', 'prospect_tel_code', 'country_2']) check(`update target: ${id}`, targets.has(id));
}

/* 3 ------------------------------------------------------------------------------------ the ids */
// (a remote command's <script id="…_s"> is java only: the Angular template has the function from the host)
const genIds = (html) => new Set([...html.matchAll(/\bid="(form:[^"]*j_idt\d+[^"]*)"/g)].map((m) => m[1]).filter((id) => !/_s$/.test(id)));
const ng = runs.find((r) => r.mode === 'ng');
if (ng) {
  const ngIds = genIds(ng.html);
  for (const run of runs.filter((r) => r.mode === 'java')) {
    const missing = [...genIds(run.html)].filter((id) => !ngIds.has(id.replace(/_input$|_focus$|_label$|_panel$/, '')) && !ngIds.has(id));
    check(`java/${run.action}: every generated id is an id of the template`, missing.length === 0, missing.slice(0, 5).join(' '));
  }
}

/* 5 ------------------------------------------------------------------------------------ the scripts the host loads (pf-runtime.ts) are the vendored ones */
{
  const { readFileSync, readdirSync } = await import('node:fs');
  const runtime = readFileSync(join(root, 'src/app/shared/primefaces/pf-runtime.ts'), 'utf8');
  const listed = [...(/PF_SCRIPTS = \[([^\]]*)\]/.exec(runtime)?.[1] ?? '').matchAll(/'([\w.-]+\.js)'/g)].map((m) => m[1]);
  const vendored = readdirSync(join(root, 'public/assets/vendor/primefaces'));
  check('pf-runtime.ts lists scripts', listed.length >= 9, listed.join(' '));
  for (const f of listed) check(`vendored: ${f}`, vendored.includes(f));
  check('datepicker.js comes after calendar.js and locale-th.js', listed.indexOf('datepicker.js') > listed.indexOf('calendar.js') && listed.indexOf('datepicker.js') > listed.indexOf('locale-th.js'));
}

/* report ----------------------------------------------------------------------------------- */
const first = runs.find((r) => r.mode === 'java' && r.action === 'edit') ?? runs[0];
if (first) {
  const count = (re, text) => (text.match(re) ?? []).length;
  const tpl = ng?.html ?? first.html;
  // the tags of the page (source) and what the renderers wrote for them
  const src = read(PAGE);
  const tags = {};
  for (const m of src.matchAll(/<((?:h|p|f):[A-Za-z]+)\b/g)) tags[m[1]] = (tags[m[1]] ?? 0) + 1;
  console.log('tags of the page (source) → components:');
  const sig = { 'p:inputText': /class="ui-inputfield ui-inputtext /g, 'p:selectOneMenu': /class="ui-selectonemenu /g, 'p:datePicker': /class="ui-calendar/g, 'p:selectOneRadio': /ui-selectoneradio ui-widget"/g, 'p:dialog': /class="ui-dialog /g, 'p:commandLink': /class="ui-commandlink/g, 'p:outputLabel': /class="ui-outputlabel ui-widget/g, 'h:inputHidden': /type="hidden" name="form:ctPhoneFmtJson/g };
  for (const [name, n] of Object.entries(tags).sort((a, b) => b[1] - a[1])) {
    const tpl = ng?.html ?? first.html;
    const seen = sig[name] ? ((tpl.match(sig[name]) ?? []).length) : '';
    console.log(`  ${name.padEnd(18)} ${String(n).padStart(4)}${seen === '' ? '' : `  → ${seen} in the template`}`);
  }
  const byType = {};
  for (const w of first.r.widgets) byType[w.type] = (byType[w.type] ?? 0) + 1;
  console.log('widgets started (java/edit):', JSON.stringify(byType));
  const nb = {};
  for (const w of (ng ?? first).r.widgets) nb[w.type] = (nb[w.type] ?? 0) + 1;
  console.log('widgets recorded (ng):      ', JSON.stringify(nb));
  const acts = (ng ?? first).r.actions;
  console.log(`actions (ng) ${acts.length}: ${acts.filter((a) => a.behavior).length} behaviours · ${acts.filter((a) => !a.behavior && !a.submit && !a.upload).length} own requests · remote commands ${(ng ?? first).r.remoteCommands.length}`);
  console.log(`bindings (ng) ${(ng ?? first).r.bindings.length}:`, JSON.stringify((ng ?? first).r.bindings.reduce((m, b) => ({ ...m, [b.kind]: (m[b.kind] ?? 0) + 1 }), {})));
  const ign = new Map();
  for (const x of (ng ?? first).r.ignoredAttrs) ign.set(`${x.tag} ${x.attr}`, (ign.get(`${x.tag} ${x.attr}`) ?? 0) + 1);
  console.log('attributes no renderer reads:', ign.size ? [...ign].map(([k, n]) => `${k} ×${n}`).join(' · ') : '(none)');
}
console.log(fails ? `${fails} check(s) FAILED` : 'pf-dom selftest: all checks passed');
process.exit(fails ? 1 : 0);
