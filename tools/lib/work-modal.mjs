/**
 * The shared WORK MODAL (add / view / edit an appointment or a task) of the Java app — `web/pages/components/work_modal.xhtml` —
 * as a reusable piece of the "generate the page 1:1 from the Java file" generators.
 *
 * Java includes the file with `<ui:include src="components/work_modal.xhtml"><ui:param name="page" value="activity"/></ui:include>` from
 * activity.xhtml, schedule.xhtml, index.xhtml (CRM home) and lead_detail.xhtml, so the page script and the modal script share ONE
 * document: the page calls the modal's globals by name (`window.wmSetLeadContext(...)`, `window.ldOpenAddAppt()`, `window.wmDarkSafe(hex)`
 * …) and the modal reads flags the page declares (`window.LD2_CAN_SCHEDULE_EDIT`, `window.LD2_SUP_SCHEDULE_CREATE` …, always behind
 * `typeof x === 'undefined'`). The generated engine keeps exactly that shape: the modal's script is spliced into the engine function
 * of the page, after the page script, where Java included the file.
 *
 * API
 * ---
 *   import { workModalPieces } from './lib/work-modal.mjs';
 *   const wm = workModalPieces({ read, page: 'schedule' });      // read = reader(javaWeb) of tools/lib/port.mjs
 *
 *   wm.markup        Angular template of the three overlays (view, add/edit, success) — append where Java put the include (end of the content).
 *                    Uses `t('key')` of the host component (message lookups of Facelets), nothing else.
 *   wm.css           the two <style> blocks, ready for the page .scss (dark theme on <html>, root-relative `/assets/images/…` icons).
 *   wm.script        ES5 statements for the body of the engine function: put them AFTER the page script (and after the page's flag
 *                    script) and BEFORE engineScaffold().footer(). They use the frame of port-kit's engineScaffold()
 *                    (listen / tmo / onReady / destroyed) and these members of `env`: see wm.envBody.
 *   wm.envBody       the members of the engine's env interface the modal needs (TypeScript lines) — add them to `envBody` of engineScaffold().
 *   wm.windowNames   every `window.x = …` the modal makes (wmOpenView, ldOpenAddWork, wmShowSuccess …): add them to `exported` of
 *                    engineScaffold(), destroy() deletes them again.
 *   wm.globalsRead   names the modal reads from window by bare identifier (LD2_* flags): the page declares them; allow them in
 *                    undeclaredNames(); a page that declares none gets the same defaults as in Java (no guard blocks).
 *   wm.images        the files of `web/images/` the markup / css / script use ("icon/fi_users.svg", "calendar_work/fi_arrow-right.svg" …):
 *                    copy them byte for byte to `public/assets/images/<same path>` (copyImages() below does it).
 *   wm.page          the value of `#{page}` (Java: WM_PAGE — a constant of the script, no per-page branch reads it today)
 *
 * What the generator changes versus the Java file (every swap stops the run when the original no longer matches):
 *   #{page}                         -> the page name
 *   #{commonBean.msg['k']}          -> env.t("k") in the script, t('k') in the template
 *   fetch( / swal(                  -> env.fetch( / env.swal(          (the backend contract / the real SweetAlert of Java)
 *   location.reload()               -> env.reload()                     (the success overlay ends with a reload of the page: the host starts it again)
 *   document 'DOMContentLoaded'     -> onReady(…) ; other document listeners -> listen(document, …) ; setTimeout -> tmo
 *   document.body 'data-theme'      -> document.documentElement         (the Angular shell puts the theme on <html>)
 *   <a id="ld2VwGoLead" href=…>     -> href = env.href(javaUrl) and a click handler that calls env.navigate(javaUrl) (the Java link
 *                                      `lead_detail.face?…` becomes the SPA route through javaLinkToRoute() in the host)
 *   ../images/…                     -> assets/images/… (template, script) / /assets/images/… (css)
 *   body[data-theme="dark"]         -> html[data-theme='dark']
 *
 * A second page uses it like this (sketch of tools/sync-schedule.mjs):
 *
 *   const wm = workModalPieces({ read, page: 'schedule' });
 *   tpl      += '\n' + wm.markup;                       // after the markup of the page
 *   scss     += '\n' + wm.css;                          // after the page css (and its dark port, as in the Java document order)
 *   js.text  += '\n' + wm.script;                       // after the page script
 *   engineScaffold({ …, envBody: pageEnvBody + wm.envBody, exported: [...pageNames, ...wm.windowNames] });
 *   await undeclaredNames(engineText, [...pageAllow, ...wm.globalsRead]);
 *   wm.copyImages(java, 'public/assets/images');        // the icons
 *
 * and the host component provides: `t`, and in env: t, fetch (the backend contract of the page, which must answer the endpoints
 * below), swal, reload, navigate (a Java page link -> router), href (a Java page link -> route), assetBase ('assets/').
 *
 * Endpoints the modal calls (the page backend must serve them; src/app/shared/work-modal/work-modal.mock.ts has the mock):
 *   POST  ../board/schedule/add                              body { leadId, taskAssigneeId, subject, detail, date, time, type, status, allDay, remark, procedureGroupId?, … }
 *   PATCH ../board/schedule/edit                             body { id, taskAssigneeId, subject, detail, date, time, status, allDay, remark }
 *   GET   ../board/employees  ·  ../board/master/employees-by-activity-group?activityGroupId=
 *   customer search (only when the page sets ctx.customerSearch, e.g. schedule): GET ../board/leads?viewMode=list… · ../board/lead?id=… ·
 *   ../board/master/activity-groups?movementTypeId=
 */
import { copyFileSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { editor, markupToTemplate } from './port.mjs';
import { assertPortable, elMessages, fsAdj, swapCalls, windowNames as findWindowNames } from './port-script.mjs';
import { splitSection } from './port-kit.mjs';

/** the Java globals the modal reads by bare name (declared by the page as `window.X = …`) */
export const WORK_MODAL_GLOBALS = [
  'LD2_CAN_SCHEDULE_CREATE',
  'LD2_SUP_SCHEDULE_CREATE',
  'LD2_ROLE_SCHEDULE_CREATE',
  'LD2_MY_EMPLOYEE_ID',
  'LD2_CAN_SCHEDULE_VIEW',
  'LD2_CAN_SCHEDULE_EDIT',
  'LD2_LEAD_CLOSED',
  'LD2_CAN_VIEW_LEAD',
];

/** the members of the engine's env the modal script uses (a page that declares the same member itself must not repeat it) */
export const WORK_MODAL_ENV = {
  t: `  /** commonBean.msg['key'] in the active language */
  t: (key: string) => string;`,
  fetch: `  /** the backend contract of the page (the BFF URLs of the Java page: ../board/…) */
  fetch: (input: string, init?: RequestInit) => Promise<Response>;`,
  navigate: `  /** location.href = '…face?…': a link of the Java app, the host maps it to a route (javaLinkToRoute) */
  navigate: (javaLink: string) => void;`,
  reload: `  /** location.reload(): the host starts the page again with fresh data */
  reload: () => void;`,
  swal: `  /** SweetAlert (the library template.xhtml loads) */
  swal: (options: any) => Promise<any>;`,
  href: `  /** a link of the Java app ("lead_detail.face?…") as the URL of its route — the href of the "go to lead" link */
  href: (javaLink: string) => string;`,
  assetBase: `  /** where the static files of the Java app live: images/… of the Java web folder are served at \`<assetBase>images/…\` */
  assetBase: string;`,
};
const ENV_BODY = Object.values(WORK_MODAL_ENV).join('\n');

/**
 * @param {object} o
 * @param {(p: string) => string} o.read   reader(javaWeb) of tools/lib/port.mjs
 * @param {string} o.page                  the value of the ui:param "page" (activity | schedule | index | lead_detail …)
 */
export function workModalPieces({ read, page }) {
  if (!/^[\w-]+$/.test(page ?? '')) throw new Error('workModalPieces: page must be a plain name, got ' + JSON.stringify(page));
  const WHAT = 'work_modal.xhtml';
  let src = read('pages/components/work_modal.xhtml');
  src = src.replace(/^\s*<\?xml[^>]*\?>/, '').replace(/<ui:composition[^>]*>/, '').replace(/<\/ui:composition>\s*$/, '');
  src = src.split('#{page}').join(page); // the ui:param, as Facelets substitutes it
  const parts = splitSection(src);
  if (parts.styles.length !== 2 || parts.scripts.length !== 2) {
    throw new Error(`${WHAT} changed — expected 2 <style> and 2 <script> blocks, found ${parts.styles.length} and ${parts.scripts.length}`);
  }
  if (parts.links.length || parts.externalScripts.length) throw new Error(`${WHAT} changed — it now loads external files: ${[...parts.links, ...parts.externalScripts].join(', ')}`);

  /* ================================================================================ template */
  const markup = editor(`${WHAT} markup`, parts.markup.replace(/\s+$/, '').replace(/^\s*\n/, ''));
  markup.swapAll('../images/', 'assets/images/', 11); // masks of the icons (a -webkit- and a plain url each), the search icon
  markup.swap(
    `placeholder="#{commonBean.msg['label.dashboard.search']}..."`,
    `placeholder="ZZ_SEARCH_DOTS_ZZ"`,
  );
  let tpl = markupToTemplate(markup.text, `${WHAT} markup`);
  tpl = tpl.replace(
    `placeholder="ZZ_SEARCH_DOTS_ZZ"`,
    `[attr.placeholder]="t('label.dashboard.search') + '...'"`,
  );
  if (/ZZ_/.test(tpl)) throw new Error(`${WHAT} markup: a placeholder is left`);
  tpl = tpl.replace(/^ {4}/gm, '');

  /* ================================================================================ stylesheet */
  const css = editor(`${WHAT} style`, parts.styles.join('\n'));
  css.swapAll('url(../images/', 'url(/assets/images/', 8); // root-relative: the Angular build leaves it alone and <base href="/"> is the app root
  css.text = css.text.replace(/body\[data-theme="dark"\]/g, "html[data-theme='dark']");
  css.text = fsAdj(css.text);
  if (/body\[data-theme/.test(css.text)) throw new Error(`${WHAT} css: a body[data-theme] selector is left`);
  const cssText = css.text
    .split('\n')
    .map((l) => l.replace(/^ {8}/, ''))
    .join('\n')
    .replace(/^\s+|\s+$/g, '');

  /* ================================================================================ script */
  const js = editor(`${WHAT} script`, parts.scripts[0].replace(/^\n/, ''));
  const js2 = editor(`${WHAT} script (success overlay)`, parts.scripts[1].replace(/^\n/, ''));

  // ---- strict mode: the original assigns _wmOwnPickable without ever declaring it (an implicit global of a sloppy script) ----
  js.swap(`            var _wmOwnSelected = '';`, `            var _wmOwnSelected = '';
            var _wmOwnPickable;   /* (implicit global in the Java file: declared here, strict mode) */`);

  // ---- environment ----
  js.swap(`var WM_PAGE = '${page}';`, `var WM_PAGE = ${JSON.stringify(page)};\n            var wmGoLeadUrl = '';   /* the Java link of the "go to lead" anchor (see the click handler below) */`);
  js.text = elMessages(js.text, WHAT);
  js2.text = elMessages(js2.text, `${WHAT} (success)`);
  for (const e of [js, js2]) e.text = fsAdj(e.text);
  js.text = swapCalls(js.text, WHAT, 'fetch', 'env.fetch').text;
  js.text = swapCalls(js.text, WHAT, 'swal', 'env.swal').text;
  js.swapAll(`location.reload()`, `env.reload()`, 2);

  // ---- the theme lives on <html> in the Angular shell ----
  js.swap(`document.body.getAttribute('data-theme') !== 'dark'`, `document.documentElement.getAttribute('data-theme') !== 'dark'`);

  // ---- images used by the script ----
  js.swap(
    `'<span class="ld2-aw-ic" style="-webkit-mask-image:url(../images/icon/' + svg + ');mask-image:url(../images/icon/' + svg + ');"></span>'`,
    `'<span class="ld2-aw-ic" style="-webkit-mask-image:url(' + env.assetBase + 'images/icon/' + svg + ');mask-image:url(' + env.assetBase + 'images/icon/' + svg + ');"></span>'`,
  );

  // ---- the "go to lead" link: a Java page link -> the route of the SPA ----
  js.swap(
    `if (vwShowGoLead) vwGoLead.href = 'lead_detail.face?pid=1&page_id=3&act=3&param_lead_id=' + encodeURIComponent(vwLeadId)
                        + ((vwGidStr !== '' && vwGidStr !== '0') ? '&activityGroupId=' + encodeURIComponent(vwGidStr) : '');`,
    `if (vwShowGoLead) {
                        wmGoLeadUrl = 'lead_detail.face?pid=1&page_id=3&act=3&param_lead_id=' + encodeURIComponent(vwLeadId)
                            + ((vwGidStr !== '' && vwGidStr !== '0') ? '&activityGroupId=' + encodeURIComponent(vwGidStr) : '');
                        vwGoLead.href = env.href(wmGoLeadUrl);
                    }`,
  );
  js.swap(
    `            /* ── CLOSE ON OVERLAY CLICK ── */`,
    `            /* the anchor navigates inside the app (a plain click would load the route as a new page) */
            (function () {
                var a = wmG('ld2VwGoLead');
                if (a) listen(a, 'click', function (e) {
                    if (!wmGoLeadUrl) return;
                    e.preventDefault();
                    env.navigate(wmGoLeadUrl);
                });
            })();

            /* ── CLOSE ON OVERLAY CLICK ── */`,
  );

  // ---- listeners and timers are registered so that destroy() can remove them ----
  js.swap(
    `document.addEventListener('DOMContentLoaded', function () {
                if (typeof LD2_CAN_SCHEDULE_EDIT === 'undefined' || LD2_CAN_SCHEDULE_EDIT) return;
                var el = document.getElementById('ld2VwEditBtn');
                if (el) el.style.display = 'none';
            });`,
    `onReady(function () {
                if (typeof LD2_CAN_SCHEDULE_EDIT === 'undefined' || LD2_CAN_SCHEDULE_EDIT) return;
                var el = document.getElementById('ld2VwEditBtn');
                if (el) el.style.display = 'none';
            });`,
  );
  js.swapAll(`document.addEventListener('click', function() {`, `listen(document, 'click', function() {`, 1);
  js.text = swapCalls(js.text, WHAT, 'setTimeout', 'tmo').text;
  js2.text = swapCalls(js2.text, `${WHAT} (success)`, 'setTimeout', 'tmo').text;

  const script = `/* ───── work_modal.xhtml (page=${page}) ───── */\n` + js.text.replace(/\s+$/, '') + `\n/* ───── work_modal.xhtml: success overlay ───── */\n` + js2.text.replace(/\s+$/, '') + '\n';

  /* nothing the modal does may reach the page address, storage or the Java pages behind env's back */
  for (const [name, text] of [['script', js.text], ['success script', js2.text]]) {
    assertPortable(text, `${WHAT} ${name}`, { bare: ['fetch', 'swal', 'setTimeout'], javaLinks: ["'lead_detail.face?pid=1&page_id=3&act=3&param_lead_id='"] });
  }

  const names = [...new Set([...findWindowNames(js.text), ...findWindowNames(js2.text)])];
  // every icon of images/ the template, the css and the script name (the script builds two of them from a file name: wmCustIc('fi_list.svg'))
  const images = [
    ...new Set([
      ...[...(tpl + cssText + script).matchAll(/images\/((?:icon|calendar_work)\/[\w.-]+\.svg)/g)].map((m) => m[1]),
      ...[...script.matchAll(/wmCustIc\('([\w.-]+\.svg)'\)/g)].map((m) => 'icon/' + m[1]),
    ]),
  ].sort();
  const copyImages = (javaWeb, destDir) => {
    for (const f of images) {
      mkdirSync(dirname(join(destDir, f)), { recursive: true });
      copyFileSync(join(javaWeb, 'images', f), join(destDir, f));
    }
    return images.length;
  };

  return {
    page,
    markup: tpl,
    css: cssText,
    script,
    envBody: ENV_BODY,
    envMembers: WORK_MODAL_ENV,
    windowNames: names,
    globalsRead: WORK_MODAL_GLOBALS,
    images,
    copyImages,
  };
}
