/**
 * The CSS of the PrimeFaces components the supporting-document pages draw, cut out of the stylesheets the Java app loads for every page:
 *
 *   primefaces-14.0.7-jakarta.jar  META-INF/resources/primefaces/components.css   the structure of the widgets (layout of the select, the datepicker …)
 *   web/resources/primefaces-pandora-bluegrey/theme.css                        the skin (the default theme of GuestPreferences: componentTheme = "bluegrey")
 *
 * Only the rules of the widget families the pages use are kept (a rule that also names another widget — `.ui-datatable …`, `.ui-menu …` —
 * can never match this DOM and is left out), in the original order (components.css first, the theme after it, as the Java head loads them).
 * The result is NOT scoped: the select panel, the datepicker and the growl are drawn into <body> by the widgets, outside the page; the
 * class names are PrimeFaces' own and nothing else of the Angular app uses them.
 */
import postcss from 'postcss';
import safeParser from 'postcss-safe-parser';

/** every `.ui-…` class of a kept selector must start with one of these (the widget families of the pages) */
const FAMILY = [
  'ui-widget', 'ui-state', 'ui-corner', 'ui-helper', 'ui-icon', 'ui-c', 'ui-shadow', 'ui-input-overlay', 'ui-inputfield', 'ui-inputtext', 'ui-inputtextarea',
  'ui-button', 'ui-selectonemenu', 'ui-calendar', 'ui-datepicker', 'ui-trigger-calendar', 'ui-chkbox', 'ui-growl', 'ui-fileupload', 'ui-outputlabel',
  'ui-commandlink', 'ui-priority', 'ui-overlay', 'ui-connected-overlay', 'ui-noselection-option', 'ui-input-filled', 'ui-fluid', 'ui-inputwrapper', 'ui-icon-loading',
  // the prospect form: p:dialog (+ its mask `ui-dialog-mask`, the resize handles jQuery UI adds), p:selectOneRadio, the hidden containers
  'ui-dialog', 'ui-radiobutton', 'ui-selectoneradio', 'ui-resizable', 'ui-hidden-container', 'ui-overflow-hidden',
];
/** classes without the ui- prefix a kept selector may name */
// (`p-datepicker-panel`: the class the PrimeFaces 14 DatePicker gives its panel — its rules are written with it; `layout-line-direction`: the radio group's)
const PLAIN = new Set(['hasDatepicker', 'pi', 'pi-spin', 'pi-spinner', 'ui-timepicker-div', 'p-datepicker-panel', 'layout-line-direction']);

const familyOf = (c) => FAMILY.some((f) => c === f || c.startsWith(`${f}-`));

/** a selector is kept when it names at least one widget class and nothing that belongs to another widget */
function keepSelector(sel) {
  const classes = [...sel.matchAll(/\.(-?[_a-zA-Z][\w-]*)/g)].map((m) => m[1]);
  const ui = classes.filter((c) => c.startsWith('ui-') || c === 'hasDatepicker');
  if (!ui.length) return false;
  if (/\.ui-timepicker|\.ui_tpicker/.test(sel)) return false; // the time picker plug-in: the pages have dates only
  return classes.every((c) => PLAIN.has(c) || (c.startsWith('ui-') && familyOf(c)));
}

/** the rules of `css` for the widget families, as text (at-rules keep their kept rules; empty ones are dropped) */
export function pickWidgetRules(css, what, opts = {}) {
  // the template's inline styles carry EL: `#{commonBean.getRootColor('theme.color.2_1')}` is a line of theme_1.properties (opts.rootColor); anything else that needs the
  // server (`#{resource[…]}` …) drops its declaration
  // (the safe parser: the inline styles of a template are not always a clean stylesheet — what it cannot read, it skips)
  const resolved = opts.rootColor
    ? css.replace(/#\{commonBean\.getRootColor\(\s*(['"])([\w.]+)\1\s*\)\}/g, (m, _q, k) => opts.rootColor(k) ?? m)
    : css;
  const root = safeParser(resolved.replace(/#\{[^}]*\}/g, '__EL__'), { from: what });
  root.walkDecls((d) => {
    if (d.value.includes('__EL__') || d.prop.includes('__EL__')) d.remove();
  });
  const keyframes = new Set();
  root.walkRules((rule) => {
    if (rule.parent?.type === 'atrule' && /keyframes/.test(rule.parent.name)) return;
    // the theme's custom properties (--surface-a, --primary-color, --font-family …) are what its rules read
    if (rule.parent?.type === 'root' && rule.selector === ':root') return;
    const kept = rule.selectors.filter(keepSelector);
    if (!kept.length) {
      rule.remove();
      return;
    }
    rule.selectors = kept;
    rule.walkDecls(/^animation(-name)?$/, (d) => d.value.split(/[\s,]+/).forEach((v) => keyframes.add(v)));
  });
  root.walkAtRules((at) => {
    if (/keyframes/.test(at.name)) {
      if (!keyframes.has(at.params)) at.remove();
    } else if (at.name === 'font-face' || at.name === 'import' || at.name === 'charset') at.remove();
    else if (at.nodes && !at.nodes.length) at.remove();
  });
  // a `:root` / `html` / `body` rule is not a widget rule
  root.walkRules((rule) => {
    if (rule.parent?.type === 'root' && rule.selector !== ':root' && rule.selectors.every((s) => /^(html|body|:root|\*)\b/.test(s)) && !rule.selectors.some((s) => /\.ui-/.test(s))) rule.remove();
  });
  return root.toString().replace(/\n{3,}/g, '\n\n').trim();
}

/** `"url(…)"` of a rule that the Java stack resolved with JSF resources (`#{resource[…]}`) cannot work here: what is left is reported by the caller */
export const unresolvedResources = (css) => [...css.matchAll(/#\{[^}]*\}/g)].map((m) => m[0]);

/** `theme_1.properties` of the Java app (`key=value`, a value may end in `;`) as a lookup */
export function themeColors(text) {
  const map = new Map();
  for (const line of text.split('\n')) {
    const m = /^\s*([\w.]+)\s*=\s*([^;\r]*?)\s*;?\s*$/.exec(line);
    if (m && !line.trim().startsWith('#')) map.set(m[1], m[2]);
  }
  return (key) => map.get(key);
}
