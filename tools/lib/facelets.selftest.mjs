#!/usr/bin/env node
/**
 * Self-check of tools/lib/facelets.mjs (run: node tools/lib/facelets.selftest.mjs):
 *  1. the EL evaluator on the expressions the sales-document files use;
 *  2. the receipt list (a page the older helper tools/lib/sales-doc.mjs replicaSections() already renders): the two readings of the original
 *     must give the same markup;
 *  3. every page of the group in both modes (nothing may throw, nothing may be left unresolved).
 */
import { readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { reader } from './port.mjs';
import { Dyn, evaluate, expandText, renderPage } from './facelets.mjs';
import { msgFn, replicaSections, xhtmlToHtml } from './sales-doc.mjs';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const java = join(resolve(process.env.TS_JAVA_ROOT ?? join(root, '..', 'triple_sale_main')), 'web');
const read = reader(java);
const th = JSON.parse(readFileSync(join(root, 'public/assets/i18n/th.json'), 'utf8'));
let fails = 0;
const check = (name, ok, extra = '') => {
  if (!ok) { fails++; console.log('FAIL', name, extra); }
};

/* 1 ---------------------------------------------------------------------------------- EL */
const ctx = (vars, mode = 'java') => ({
  mode,
  vars: new Map(Object.entries(vars)),
  server: {
    msg: (k) => (mode === 'java' ? 'M:' + k : new Dyn(`t('${k}')`, { msgKey: k })),
    feature: () => { throw new Error('feature'); },
    value: (p) => (mode === 'java' ? 'V:' + p : new Dyn('ini.' + p.split('.').pop())),
    param: (n) => ({ doc: 'qt' })[n] ?? null,
  },
});
const T = (el, vars, want, mode) => {
  const got = evaluate(el, ctx(vars, mode));
  const plain = got instanceof Dyn ? { js: got.js } : got;
  check(`#{${el}}`, JSON.stringify(plain) === JSON.stringify(want), `got ${JSON.stringify(plain)} want ${JSON.stringify(want)}`);
};
T("v25 eq 'qt'", { v25: 'qt' }, true);
T("v25 eq 'qt'", {}, false);
T("empty v25", {}, true);
T("not empty v25", { v25: 'so' }, true);
T("not empty whKey and empty v25", { whKey: 'k' }, true);
T("not empty whKey and empty v25", { whKey: 'k', v25: 'qt' }, false);
T("v25 eq 'qt' ? 'pick' : ''", { v25: 'qt' }, 'pick');
T("v25 eq 'qt' ? 'pick' : ''", { v25: 'so' }, '');
T("sumV25 eq 'qt' ? 1000 : 500", { sumV25: 'qt' }, 1000);
T("empty refKey ? 7 : 8", {}, 7);
T("empty refKey ? 7 : 8", { refKey: 'x' }, 8);
T("refPickQt eq 'true' or refPickBk eq 'true'", { refPickQt: 'true' }, true);
T("refPickQt eq 'true' or refPickBk eq 'true'", {}, false);
T("(empty extras or extras eq 'terms') and payV25 ne 'true'", { extras: 'terms', payV25: 'true' }, false);
T("(empty extras or extras eq 'terms') and payV25 ne 'true'", { extras: 'terms' }, true);
T("(empty extras or extras eq 'terms') and payV25 ne 'true'", { extras: 'false' }, false);
T("reqPick eq 'true' ? 'pick' : ''", { reqPick: true }, 'pick'); // a boolean param compared with 'true'
T("isAd ? 1 : 2", { isAd: true }, 1);
T("not refPick", { refPick: false }, true);
T("'label.pdoc.title.'.concat(fp)", { fp: 'qt' }, 'label.pdoc.title.qt');
T("commonBean.msg[isAd ? 'a.b' : 'c.d']", { isAd: false }, 'M:c.d');
T("commonBean.msg[empty sign1Key ? 'x' : sign1Key]", { sign1Key: 'y' }, 'M:y');
T("empty sessionScope.ss_profile_name ? commonBean.username : sessionScope.ss_profile_name", {}, { js: "(!ini.ss_profile_name ? ini.username : ini.ss_profile_name)" }, 'template');
T("companyHideEn eq 'true' and commonBean.currentLang eq 'en'", { companyHideEn: 'true' }, { js: "(ini.currentLang === 'en')" }, 'template');
T("companyHideEn eq 'true' and commonBean.currentLang eq 'en'", {}, false, 'template');
T("param.doc eq 'qt' or param.doc eq 'bk' ? param.doc : ''", {}, 'qt');
check('text', expandText('a#{fp}b#{x}', ctx({ fp: 'Z' })) === 'aZb');

/* 2 ---------------------------------------------------------------------------------- the receipt list in two readings */
{
  const file = 'pages/sales_doc_rv_list.xhtml';
  const norm = (s) => s.replace(/<!--[\s\S]*?-->/g, '').replace(/\s+/g, ' ').replace(/> </g, '><').trim();
  const old = replicaSections(read, file, { msg: msgFn(th) });
  const mine = renderPage({ read, file, mode: 'java', msg: msgFn(th), session: {} });
  const a = norm(old.content);
  const b = norm(xhtmlToHtml(mine.defines.content));
  check('rv list content', a === b, `\nold ${a.length}\nnew ${b.length}\nfirst difference at ${[...a].findIndex((c, i) => c !== b[i])}: ${a.slice(Math.max(0, [...a].findIndex((c, i) => c !== b[i]) - 60), [...a].findIndex((c, i) => c !== b[i]) + 80)}\n   vs ${b.slice(Math.max(0, [...a].findIndex((c, i) => c !== b[i]) - 60), [...a].findIndex((c, i) => c !== b[i]) + 80)}`);
  const ha = norm(old.head);
  const hb = norm(xhtmlToHtml(mine.defines.head));
  check('rv list head', ha === hb, `\n${ha}\n${hb}`);
}

/* 3 ---------------------------------------------------------------------------------- every page, both modes */
const SESSION = { branchName: 'SUN GATEWAY', branchId: 1004400123, branchCode: 'SUN', username: 'demo', lang: 'th', uploadAcceptExt: '.pdf', profileName: 'P', employeeId: 1001, roles: '[a, b]' };
const PAGES = [
  ['pages/sales_doc_type_list.xhtml', { doc: 'qt' }], ['pages/sales_doc_type_list.xhtml', { doc: 'bk' }], ['pages/sales_doc_type_list.xhtml', { doc: 'ob' }],
  ['pages/sales_doc_type_list.xhtml', { doc: 'aq' }], ['pages/sales_doc_type_list.xhtml', { doc: 'ad' }], ['pages/sales_doc_type_list.xhtml', { doc: '' }],
  ['pages/sales_doc_qt_form.xhtml'], ['pages/sales_doc_bk_form.xhtml'], ['pages/sales_doc_ob_form.xhtml'], ['pages/sales_doc_aq_form.xhtml'], ['pages/sales_doc_ad_form.xhtml'],
];
for (const [file, params] of PAGES) {
  for (const mode of ['java', 'template']) {
    const what = `${file} ${JSON.stringify(params ?? {})} [${mode}]`;
    try {
      const r = renderPage({ read, file, mode, msg: msgFn(th), session: SESSION, params });
      const all = Object.values(r.defines).join('\n');
      check(what + ' no EL left', !/#\{(?!commonBean\.msg\['[\w.]+'\]\}|request\.contextPath\}|commonBean\.hasFeature)/.test(mode === 'template' ? all.replace(/<script[\s\S]*?<\/script>/g, '') : all), all.match(/.{0,40}#\{.{0,60}/)?.[0]);
      check(what + ' no ui: left', !/<\/?ui:(?!fragment)/.test(all), all.match(/.{0,40}<\/?ui:.{0,60}/)?.[0]);
      console.log(`ok   ${what}  content ${r.defines.content?.length}  head ${r.defines.head?.length}  msgs ${r.used.msgKeys.size}`);
    } catch (e) {
      fails++;
      console.log('FAIL', what, e.message.slice(0, 300));
    }
  }
}
console.log(fails ? `${fails} failure(s)` : 'all good');
process.exit(fails ? 1 : 0);
