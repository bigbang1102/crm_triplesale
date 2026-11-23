#!/usr/bin/env node
/**
 * Smoke test of the markup of pf-dom.mjs against the REAL PrimeFaces widgets (run: node tools/lib/pf-dom.smoke.mjs; jsdom, no browser):
 * the vendored scripts (public/assets/vendor/primefaces) are loaded in the order of pf-runtime.ts into a jsdom window, the p:datePicker · p:dialog · p:selectOneRadio ·
 * p:selectOneMenu of contracts_master_data.xhtml are drawn in java mode and started with the `PrimeFaces.cw(…)` the replica would write — the widgets must find
 * what they look for in the markup and do what the page needs of them (a trigger button and a panel for the picker, the mask for a modal dialog, the box / icon
 * classes and the inline `onchange` for the radio). Prints what was checked; exit code 1 on a failed check.
 * (jsdom has no layout: positions and sizes are not checked.)
 */
import { readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { JSDOM } from 'jsdom';
import { createRenderer } from './jsf.mjs';
import { reader } from './port.mjs';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const java = join(resolve(process.env.TS_JAVA_ROOT ?? join(root, '..', 'triple_sale_main')), 'web');
const read = reader(java);
const vendor = join(root, 'public/assets/vendor/primefaces');
const runtime = readFileSync(join(root, 'src/app/shared/primefaces/pf-runtime.ts'), 'utf8');
const scripts = [...(/PF_SCRIPTS = \[([^\]]*)\]/.exec(runtime)?.[1] ?? '').matchAll(/'([\w.-]+\.js)'/g)].map((m) => m[1]);

let fails = 0;
const check = (name, ok, extra = '') => {
  if (!ok) {
    fails++;
    console.log('FAIL', name, extra);
  } else console.log('ok  ', name);
};

/* the page's widgets, drawn by the java renderer (a bean with the form in the edit mode) */
const bean = new Proxy({ action_type: 'edit', contractBean: new Proxy({ customer_type: 'person', sex: 'หญิง', date_save: '2026-09-10' }, { get: (t, k) => (k in t ? t[k] : '') }) }, {
  get: (t, k) => (k in t ? t[k] : /^(avatarSrc|telWithCode|formatTel)$/.test(String(k)) ? () => '' : /^list|^prospectDocs$/.test(String(k)) ? [] : ''),
});
const r = createRenderer({
  mode: 'java',
  read,
  formAction: '#',
  linkTarget: () => '#',
  viewDate: (v) => String(v).split('-').reverse().join('/'),
  pfStrict: true,
  vars: { contractView: bean },
  msg: (k) => k,
  can: () => true,
  session: { uploadAcceptExt: '.pdf', ssEmployeeId: '1', aiHubEnabled: false },
});
const html = r.renderFile('pages/contracts_master_data.xhtml', 'content');

const dom = new JSDOM(`<!doctype html><html><body>${html}</body></html>`, { runScripts: 'dangerously', pretendToBeVisual: true, url: 'http://localhost/' });
const w = dom.window;
w.matchMedia = w.matchMedia ?? (() => ({ matches: false, addListener() {}, removeListener() {}, addEventListener() {}, removeEventListener() {} }));
w.ResizeObserver = w.ResizeObserver ?? class { observe() {} disconnect() {} unobserve() {} };
const errors = [];
w.addEventListener('error', (e) => errors.push(String(e.message)));
for (const f of scripts) {
  try {
    w.eval(readFileSync(join(vendor, f), 'utf8'));
  } catch (e) {
    check(`script ${f} evaluates`, false, String(e.message).slice(0, 120));
  }
}
check('PrimeFaces and the widgets are defined', !!(w.PrimeFaces && w.PrimeFaces.widget.DatePicker && w.PrimeFaces.widget.Dialog && w.PrimeFaces.widget.SelectOneRadio && w.PrimeFaces.widget.SelectOneMenu));
w.PrimeFaces.settings.locale = 'th';

/* the start-up scripts of the widgets, as the replica writes them */
const wscript = (x) => {
  const base = JSON.stringify(x.cfg);
  const text = x.raw?.length ? base.replace(/\}$/, `,${x.raw.join(',')}}`) : base;
  return `PrimeFaces.cw(${JSON.stringify(x.type)},${JSON.stringify(x.widgetVar || `widget_${x.id.replace(/[^\w]/g, '_')}`)},${text});`;
};
const started = {};
for (const x of r.widgets) {
  try {
    w.eval(wscript(x));
    started[x.type] = (started[x.type] ?? 0) + 1;
  } catch (e) {
    check(`PrimeFaces.cw(${x.type}, ${x.id})`, false, String(e.stack ?? e).split('\n').slice(0, 3).join(' | '));
  }
}
check('every widget of the page started', Object.keys(started).length === 4 && Object.values(started).reduce((a, b) => a + b, 0) === r.widgets.length, JSON.stringify(started));
const d = w.document;

/* p:datePicker */
const picker = r.widgets.find((x) => x.type === 'DatePicker');
const span = d.getElementById(picker.id);
const wv = w.PrimeFaces.widgets[`widget_${picker.id.replace(/[^\w]/g, '_')}`];
check('date picker: the widget put a trigger button (showIcon) into the container', !!span.querySelector('button.ui-datepicker-trigger'));
check('date picker: the container got ui-trigger-calendar', span.classList.contains('ui-trigger-calendar'));
// (the plug-in builds the panel itself: where it puts it — the container, or <body> for an `appendTo` — and its show / hide go through a CSS transition jsdom lacks)
const plugin = wv.jq.data().primeDatePicker;
check('date picker: the plug-in built its panel (id <client id>_panel, a dialog with the Thai chooseDate label)', plugin.panel.length === 1 && plugin.panel.attr('id') === `${picker.id}_panel` && /[ก-๙]/.test(plugin.panel.attr('aria-label') ?? ''), plugin.panel.attr('aria-label'));
check('date picker: the input keeps the date of the bean (10/09/2026) in the format dd/MM/yyyy', d.getElementById(`${picker.id}_input`).value === '10/09/2026', d.getElementById(`${picker.id}_input`).value);
check('date picker: the Thai locale is used (the trigger button is labelled in Thai)', /[ก-๙]/.test(span.querySelector('button.ui-datepicker-trigger').getAttribute('aria-label') ?? ''), span.querySelector('button.ui-datepicker-trigger').getAttribute('aria-label'));
let selected = null;
w.PrimeFaces.ab = (cfg) => { selected = cfg; };
wv.setDate(new w.Date(2026, 8, 15));
wv.fireDateSelectEvent();
check('date picker: choosing a date calls the dateSelect behaviour (s/e/p/u of the p:ajax)', selected && selected.s === picker.id && selected.e === 'dateSelect' && selected.p === picker.id && selected.u === picker.id, JSON.stringify(selected));

/* p:dialog */
const dlg = r.widgets.find((x) => x.type === 'Dialog' && x.widgetVar === 'confirmationDialogPros');
const dwv = w.PF ? w.PF('confirmationDialogPros') : w.PrimeFaces.widgets.confirmationDialogPros;
check('dialog: PF(widgetVar) finds the widget', !!dwv);
check('dialog: the real widget found its content / title bar / close icon', dwv.content.length === 1 && dwv.titlebar.length === 1 && dwv.closeIcon.length === 1);
check('dialog: hidden until shown (display:none from the renderer)', d.getElementById(dlg.id).style.display === 'none');
dwv.show();
check('dialog: show() makes it visible', d.getElementById(dlg.id).style.display !== 'none', d.getElementById(dlg.id).getAttribute('style'));
check('dialog: a modal one draws its mask', !!d.getElementById(`${dlg.id}_modal`));
dwv.hide();

/* p:selectOneRadio */
const radio = r.widgets.find((x) => x.type === 'SelectOneRadio' && x.id === 'form:customer_gender');
const inputs = [...d.querySelectorAll(`input[name="${radio.id}"]`)];
check('radio: three options, ids id:0 … id:2', inputs.length === 3 && inputs.map((i) => i.id).join() === `${radio.id}:0,${radio.id}:1,${radio.id}:2`, inputs.map((i) => i.id).join());
check('radio: the option of the bean value (หญิง) is checked and drawn active', inputs[1].hasAttribute('checked') && inputs[1].closest('.ui-radiobutton').querySelector('.ui-radiobutton-box').classList.contains('ui-state-active'));
let ajaxCall = null;
w.PrimeFaces.ab = (cfg) => { ajaxCall = cfg; };
// the click on the box of the first option: the widget selects it and fires jQuery's `change` on the input — which runs the inline onchange (the behaviour)
const box0 = inputs[0].closest('.ui-radiobutton').querySelector('.ui-radiobutton-box');
w.jQuery(box0).trigger('click');
check('radio: clicking a box checks its input and marks box and icon', inputs[0].checked && box0.classList.contains('ui-state-active') && box0.querySelector('.ui-radiobutton-icon').classList.contains('ui-icon-bullet'));
check('radio: the previous option is unchecked and blank', !inputs[1].checked && !inputs[1].closest('.ui-radiobutton').querySelector('.ui-radiobutton-box').classList.contains('ui-state-active'));
check('radio: the inline onchange (the p:ajax behaviour) ran through jQuery\'s trigger', ajaxCall && ajaxCall.s === radio.id && ajaxCall.e === 'change', JSON.stringify(ajaxCall));
const typeRadio = [...d.querySelectorAll('input[name="form:customer_type"]')];
check('radio: the page\'s own onchange (ctApplyTypeUI) is an inline attribute of the inputs', typeRadio.length === 2 && typeRadio.every((i) => /ctApplyTypeUI/.test(i.getAttribute('onchange') ?? '')));

/* p:selectOneMenu with appendTo="@(body)" */
const sel = r.widgets.find((x) => x.type === 'SelectOneMenu' && x.cfg.appendTo);
const panel = d.getElementById(`${sel.id}_panel`);
check('select: the panel was moved into <body> (appendTo)', !!panel && panel.parentElement === d.body, panel?.parentElement?.tagName);

check('no script error was reported', errors.length === 0, errors.slice(0, 3).join(' | '));
console.log(fails ? `${fails} check(s) FAILED` : 'pf-dom smoke: all checks passed');
process.exit(fails ? 1 : 0);
