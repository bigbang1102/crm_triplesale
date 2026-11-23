#!/usr/bin/env node
/**
 * Regenerates what the supporting-document screens need of PrimeFaces, from the Java project (read only):
 *
 *   npm run supporting-doc-pf:sync          (Java project = ../triple_sale_main, or set TS_JAVA_ROOT; the jar = TS_PF_JAR)
 *
 *   primefaces-14.0.7-jakarta.jar  jquery/jquery.js · jquery/jquery-plugins.js · core.js · components.js · calendar/calendar.js · datepicker/datepicker.js · locales/locale-th.js
 *                                  · validation/validation.js · fileupload/fileupload.js
 *                                  ->  public/assets/vendor/primefaces/*.js      (byte for byte: the SAME widgets the Java pages run)
 *   primefaces-14.0.7-jakarta.jar  components.css  +  web/resources/primefaces-pandora-bluegrey/theme.css
 *                                  ->  src/app/shared/primefaces/pf-theme.scss + pf-template.scss   (the rules of the widgets the pages use, unscoped — tools/lib/pf-css.mjs; see the order below)
 *
 * Why the real widget scripts: the calendar (a jQuery UI datepicker with a Thai locale), the select with its filter and its panel built on
 * demand, the check box … are behaviour the Java pages get from PrimeFaces. Re-writing them would be a guess; running them is the
 * same screen. They are loaded only by the supporting-document screens (`loadPrimeFaces()` in pf-runtime.ts).
 *
 * PrimeFaces 14 (core) and jQuery are MIT licensed; the jar's own headers travel with the files.
 */
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { portalAdaptation } from './lib/port-kit.mjs';
import { reader } from './lib/port.mjs';
import { pickWidgetRules, themeColors, unresolvedResources } from './lib/pf-css.mjs';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const javaRoot = resolve(process.env.TS_JAVA_ROOT ?? join(root, '..', 'triple_sale_main'));
const jar = process.env.TS_PF_JAR ?? join(javaRoot, 'target/triplesale/WEB-INF/lib/primefaces-14.0.7-jakarta.jar');
if (!existsSync(jar)) throw new Error(`PrimeFaces jar not found: ${jar} (set TS_PF_JAR)`);
const fromJar = (p) => execFileSync('unzip', ['-p', jar, `META-INF/resources/primefaces/${p}`], { maxBuffer: 64 * 1024 * 1024 });

const vendor = join(root, 'public/assets/vendor/primefaces');
mkdirSync(vendor, { recursive: true });
const FILES = [
  ['jquery/jquery.js', 'jquery.js'],
  ['jquery/jquery-plugins.js', 'jquery-plugins.js'],
  ['core.js', 'core.js'],
  ['components.js', 'components.js'],
  ['calendar/calendar.js', 'calendar.js'],
  // p:datePicker (the prospect form): the PrimeFaces 14 date picker — its own widget, not the calendar's jQuery UI datepicker
  ['datepicker/datepicker.js', 'datepicker.js'],
  ['locales/locale-th.js', 'locale-th.js'],
  // p:fileUpload (the upload bar of the documents tab) and the client validation it runs on the chosen files
  ['validation/validation.js', 'validation.js'],
  ['fileupload/fileupload.js', 'fileupload.js'],
];
for (const [from, to] of FILES) writeFileSync(join(vendor, to), fromJar(from));
writeFileSync(
  join(vendor, 'README.md'),
  `PrimeFaces 14.0.7 (jakarta) — the widget scripts of the Java pages, copied byte for byte from \`primefaces-14.0.7-jakarta.jar\`\n(\`META-INF/resources/primefaces/\`) by \`npm run supporting-doc-pf:sync\`. Do not edit. Loaded only by the supporting-document screens.\nPrimeFaces (core) and jQuery are MIT licensed.\n\n${FILES.map(([f, t]) => `- ${t}  <-  ${f}`).join('\n')}\n`,
);

const components = fromJar('components.css').toString('utf8');
const theme = execFileSync('cat', [join(javaRoot, 'web/resources/primefaces-pandora-bluegrey/theme.css')], { maxBuffer: 64 * 1024 * 1024 }).toString('utf8');
// what the Java stack adds on top of the theme for every page: the inline <style> of template.xhtml, layout-modify.css, project_root.css and dark_mode.css
// (the rules that name PrimeFaces widgets: `body .ui-inputfield { … }`, `body .ui-selectonemenu { … }`, the dark ones)
const readJava = reader(join(javaRoot, 'web'));
// CommonBean.getRootColor(key) = theme_1.properties
const rootColor = themeColors(readFileSync(join(javaRoot, 'src/java/theme_1.properties'), 'utf8'));
const templateStyles = [...readJava('WEB-INF/pages/template.xhtml').matchAll(/<style[^>]*>([\s\S]*?)<\/style>/g)].map((m) => m[1]).join('\n');
const darkMode = readJava('resources/support/dark_mode.css').replace(/body\[data-theme="dark"\]/g, "html[data-theme='dark']");
// the growl icons: the image of the jar, inlined (a stylesheet of a component cannot name a file of assets/ without a build step)
const MESSAGES = `data:image/png;base64,${fromJar('messages/messages.png').toString('base64')}`;
const inlineImage = (css) => css.replace(/#\{resource\['primefaces:messages\/messages\.png'\]\}/g, MESSAGES);

/* The order of the Java page: PrimeFaces' own stylesheets come first (components.css, the theme), then the head of the page (crm_form.css …), THEN the
   inline <style> of template.xhtml (it is inserted after `<ui:insert name="head"/>`) and dark_mode.css — so what the template says about the widgets wins
   over the page's stylesheet at equal specificity. The two files are the two sides of the page's own CSS in the components' `styleUrls`. */
const GEN = 'GENERATED by tools/sync-supporting-doc-pf.mjs — do not edit; run `npm run supporting-doc-pf:sync`.';
const first = `/* PrimeFaces widgets of the supporting-document screens (before the page's stylesheet). ${GEN}
   The rules of the widgets the pages use: components.css of primefaces-14.0.7-jakarta.jar (structure), primefaces-pandora-bluegrey/theme.css (the skin), project_root.css (the template links it first).
   Not scoped: the select panel, the datepicker and the growl are drawn into <body>. */

/* ───── components.css (primefaces-14.0.7-jakarta.jar) ───── */
${pickWidgetRules(components, 'components.css')}

/* ───── theme.css (primefaces-pandora-bluegrey) ───── */
${pickWidgetRules(theme, 'theme.css')}

/* ───── project_root.css (template.xhtml links it before the page's head) ───── */
${pickWidgetRules(readJava('css/project_root.css'), 'project_root.css')}
`;
const last = `/* What the Java stack says about the PrimeFaces widgets after the page's own stylesheet. ${GEN}
   The rules that name the widgets of: the inline <style> of template.xhtml (every page gets them, inserted after the page's head), dark_mode.css
   and layout-modify.css (body[data-theme="dark"] is html[data-theme='dark'] here). Then the portals in <body>. */

/* ───── template.xhtml <style> ───── */
${pickWidgetRules(templateStyles, 'template.xhtml', { rootColor })}

/* ───── project_layout6.css · project_support.css (linked by template.xhtml's head after its inline styles) ───── */
${pickWidgetRules(readJava('css/project_layout6.css'), 'project_layout6.css')}
${pickWidgetRules(readJava('css/project_support.css'), 'project_support.css')}

/* ───── dark_mode.css ───── */
${pickWidgetRules(darkMode, 'dark_mode.css')}

/* ───── layout-modify.css (the layout stylesheet is a head resource JSF adds after the template's own head) ───── */
${pickWidgetRules(readJava('resources/pandora-layout/css/layout-modify.css'), 'layout-modify.css')}

${portalAdaptation(reader(join(javaRoot, 'web')), '.ui-growl, .ui-selectonemenu-panel, #ui-datepicker-div, .ui-dialog')}`;
const left = unresolvedResources(inlineImage(first + last));
if (left.length) console.warn(`  ! JSF resource expressions left in the CSS: ${[...new Set(left)].slice(0, 5).join(' ')}`);
const dir = join(root, 'src/app/shared/primefaces');
writeFileSync(join(dir, 'pf-theme.scss'), inlineImage(first));
writeFileSync(join(dir, 'pf-template.scss'), inlineImage(last));
console.log(`PrimeFaces synced: ${FILES.length} scripts, pf-theme.scss ${first.length} + pf-template.scss ${last.length} bytes`);
