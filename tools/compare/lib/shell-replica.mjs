// Static replica of the Java app shell (menu + topbar + footer) built from the REAL Facelets sources and the REAL CSS files of the
// Java project, so a Java page can be measured and compared without Tomcat: the page's own markup/script goes into `content`.
//
//   const shell = createShell({ javaRoot, ngRoot, out });
//   shell.build('home', '3', 'h-leads.html', { head, content, tail });   // menu group + active menu item + file name (in `out`)
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';

// which topbar-page-NNN each menu group shows (commonBean.viewTopbarPage) — extend per page when a group needs more
const TOPBAR_PAGES = {
  home: ['001', '002', '003', '004', '005', '007', '012'],
  chat: ['013'],
  // CommonBean.viewTopbarPage() has no entry for navbar_menu_sale, and for an unknown group it answers true for EVERY panel: the Java top
  // bar renders all of them and components/sales_doc_tabs.xhtml hides them (inline display:none) before it adds its own strip (#sd2TopTabs)
  sale: ['001', '002', '003', '004', '005', '006', '007', '008', '009', '010', '011', '012', '013', '014'],
};

export function createShell({ javaRoot, ngRoot, out, lang = 'th' }) {
  mkdirSync(out, { recursive: true });
  const WEB = resolve(javaRoot, 'web');
  const th = JSON.parse(readFileSync(join(ngRoot, 'public/assets/i18n/th.json'), 'utf8'));
  const bundle = lang === 'th' ? th : JSON.parse(readFileSync(join(ngRoot, `public/assets/i18n/${lang}.json`), 'utf8'));
  const read = (rel) => readFileSync(join(WEB, rel), 'utf8');

  /* the scripts template.xhtml loads at the end of <body> for every page (in its order): the system dropdown + its i18n bridge,
     no_autofill, input_guard + its bridge */
  // (the texts the template injects are those of the session language: `l` = 'en' for an English page, the Thai bundle otherwise)
  let enBundle;
  const bundleOf = (l) => (l === 'en' ? (enBundle ??= JSON.parse(readFileSync(join(ngRoot, 'public/assets/i18n/en.json'), 'utf8'))) : th);
  // (a page replica passes the language code ('en') or its own message bundle object)
  const TEMPLATE_SCRIPTS = (l = lang) => { const t = typeof l === 'string' ? bundleOf(l) : l; return `<script>window.ODS_I18N = ${JSON.stringify({
    select: t['label.ods.select'], search: t['label.ods.search_ph'], noData: t['label.ods.no_data'], today: t['label.ods.today'], ok: t['label.ods.ok'], clear: t['label.ods.clear'],
    months: Array.from({ length: 12 }, (_, i) => t['label.month.' + (i + 1)]), dow: Array.from({ length: 7 }, (_, i) => t['label.dow.' + (i + 1)]),
  })};</script>
<script type="text/javascript" src="/triplesale/resources/js/open_down_select.js?v=20261015"></script>
<script type="text/javascript" src="/triplesale/resources/js/no_autofill.js?v=20260825b"></script>
<script>window.INPUT_GUARD_I18N = { blocked: ${JSON.stringify(t['label.guard.special_char'])} };</script>
<script type="text/javascript" src="/triplesale/resources/js/input_guard.js?v=20260826a"></script>
<script type="text/javascript" src="/triplesale/resources/js/crm_error_popup.js?v=20261015a"></script>`; };

  const makeCtx = (group, active) => ({ group, active, pages: new Set(TOPBAR_PAGES[group] ?? []) });

  /* ---------------- EL evaluation ---------------- */
  function evalEl(expr, ctx) {
    let js = expr.trim();
    js = js.replace(/commonBean\.msg\['([^']+)'\]/g, (_, k) => JSON.stringify(th[k] ?? k));
    js = js.replace(/commonBean\.showLanguage\('([^']+)'\)/g, (_, k) => JSON.stringify(th[k] ?? k));
    js = js.replace(/commonBean\.viewTopbarPage\('topbar-page-(\d+)'\)/g, (_, n) => String(ctx.pages.has(n)));
    js = js.replace(/commonBean\.hasFeature\('[^']*'\)/g, 'true');
    js = js.replace(/commonBean\.aiHubEnabled/g, ctx.group === 'aihub' ? 'true' : 'false');
    js = js.replace(/commonBean\.param_topbar/g, `'navbar_menu_${ctx.group}'`);
    js = js.replace(/commonBean\.menu_active/g, `'${ctx.active}'`);
    js = js.replace(/commonBean\.currentLang/g, "'th'");
    js = js.replace(/commonBean\.activeBranchName/g, "'SUN GATEWAY'");
    js = js.replace(/commonBean\.project_en/g, "'ACHIEVER CO., LTD.'");
    js = js.replace(/commonBean\.version/g, "'1.1.0-260918-v2'");
    js = js.replace(/commonBean\.username/g, "'S000'");
    js = js.replace(/sessionScope\.ss_profile_name/g, "'S000'");
    js = js.replace(/request\.contextPath/g, "'/triplesale'");
    js = js.replace(/guestPreferences\.groupedMenu/g, 'true');
    js = js.replace(/\bnot empty\b/g, '!!').replace(/\bempty\b/g, '!');
    js = js.replace(/\band\b/g, '&&').replace(/\bor\b/g, '||').replace(/\bnot\b/g, '!').replace(/\beq\b/g, '===').replace(/\bne\b/g, '!==');
    try {
      // eslint-disable-next-line no-new-func
      const v = new Function(`return (${js});`)();
      return v == null ? '' : String(v);
    } catch {
      return '';
    }
  }

  const replaceEl = (s, ctx) => s.replace(/#\{([^}]*)\}/g, (_, e) => evalEl(e, ctx));

  /* ---------------- tag block processing ---------------- */
  function processBlocks(html, tag, handler) {
    const open = new RegExp(`<${tag}\\b([^>]*?)(/?)>`);
    for (let guard = 0; guard < 2000; guard++) {
      const m = open.exec(html);
      if (!m) return html;
      if (m[2] === '/') {
        html = html.slice(0, m.index) + handler(m[1], '') + html.slice(m.index + m[0].length);
        continue;
      }
      let depth = 1;
      const scan = new RegExp(`<${tag}\\b[^>]*?(/?)>|</${tag}>`, 'g');
      scan.lastIndex = m.index + m[0].length;
      let end = -1;
      let s;
      while ((s = scan.exec(html))) {
        if (s[0].startsWith('</')) {
          depth--;
          if (depth === 0) { end = s.index; break; }
        } else if (s[1] !== '/') depth++;
      }
      if (end < 0) throw new Error(`unbalanced <${tag}>`);
      const inner = html.slice(m.index + m[0].length, end);
      html = html.slice(0, m.index) + handler(m[1], inner) + html.slice(end + `</${tag}>`.length);
    }
    throw new Error('too many iterations');
  }

  const attr = (attrs, name) => {
    const m = new RegExp(`(?:^|\\s)${name}="([^"]*)"`).exec(attrs);
    return m ? m[1] : undefined;
  };

  function convert(src, ctx) {
    let h = src;
    h = h.replace(/<!--[\s\S]*?-->/g, '');
    h = h.replace(/<ui:composition[^>]*>/g, '').replace(/<\/ui:composition>/g, '');
    h = h.replace(/<script\b[\s\S]*?<\/script>/g, '');
    const flag = (a) => {
      const r = attr(a, 'rendered');
      return r === undefined ? true : r === 'true' ? true : r === 'false' ? false : evalEl(r.replace(/^#\{|\}$/g, ''), ctx) === 'true';
    };
    h = processBlocks(h, 'ui:fragment', (a, inner) => (flag(a) ? inner : ''));
    h = processBlocks(h, 'p:panel', (a, inner) => {
      if (!flag(a)) return '';
      const cls = [attr(a, 'class'), attr(a, 'styleClass')].filter(Boolean).join(' ');
      return `<div class="ui-panel ui-widget ui-widget-content ui-corner-all ${cls}"><div class="ui-panel-content ui-widget-content">${inner}</div></div>`;
    });
    h = processBlocks(h, 'h:form', (_a, inner) => `<form>${inner}</form>`);
    h = h.replace(/<p:outputLabel\b([^>]*?)(?:\/>|><\/p:outputLabel>)/g, (_, a) => {
      const cls = attr(a, 'styleClass') ?? '';
      const st = attr(a, 'style');
      const rendered = attr(a, 'rendered');
      if (rendered && evalEl(rendered.replace(/^#\{|\}$/g, ''), ctx) !== 'true' && rendered !== 'true') return '';
      return `<label class="ui-outputlabel ui-widget ${cls}"${st ? ` style="${st}"` : ''}>${attr(a, 'value') ?? ''}</label>`;
    });
    h = h.replace(/<p:spacer\b([^>]*?)\/>/g, (_, a) => `<span class="ui-spacer" style="display:inline-block;width:${attr(a, 'width') ?? '0'}"></span>`);
    h = h.replace(/<p:graphicImage\b([^>]*?)\/>/g, (_, a) => {
      if (attr(a, 'rendered') === 'false') return '';
      const url = attr(a, 'url');
      const st = attr(a, 'style');
      const w = attr(a, 'width');
      return url ? `<img src="${url.replace('../images/', '/triplesale/images/')}"${w ? ` width="${w}"` : ''}${st ? ` style="${st}"` : ''}>` : '';
    });
    h = h.replace(/<p:commandButton\b[^>]*\/>/g, '');
    h = h.replace(/<(i|span|div|li|a|label)\b([^>]*?)\/>/g, '<$1$2></$1>');
    return replaceEl(h, ctx);
  }

  /* ---------------- template pieces ---------------- */
  const template = read('WEB-INF/pages/template.xhtml');
  const headEnd = template.indexOf('</h:head>');
  const styleBlocks = [...template.matchAll(/<style\b[^>]*>([\s\S]*?)<\/style>/g)].map((m) => ({ css: m[1], idx: m.index }));
  const headStyles = styleBlocks.filter((b) => b.idx < headEnd);
  const bodyStyles = styleBlocks.filter((b) => b.idx > headEnd);

  /**
   * @param {string} group   menu group (navbar_menu_<group>)
   * @param {string} active  active menu item (commonBean.menu_active)
   * @param {string} name    file written into `out`
   * @param {{head?:string, headEarly?:string, content?:string, tail?:string}} extra
   */
  function build(group, active, name, extra = {}) {
    extra = { headFirst: '', headEarly: '', head: '', content: '', tail: '', ...extra };
    const ctx = makeCtx(group, active);
    const menu = convert(read('WEB-INF/pages/menu.xhtml'), ctx).replace(/<ui:include[^>]*groupedMenu[^>]*\/>/, convert(read('WEB-INF/pages/groupedMenu.xhtml'), ctx));
    const topbar = convert(read('WEB-INF/pages/topbar.xhtml'), ctx);
    const footer = convert(read('WEB-INF/pages/footer.xhtml'), ctx);
    const css = (blocks) => blocks.map((b) => `<style>${replaceEl(b.css, ctx)}</style>`).join('\n');

    const html = `<!DOCTYPE html>
<html lang="th"><head><meta charset="utf-8"><title>harness ${name}</title>
<meta name="viewport" content="width=device-width, initial-scale=1">
${extra.headFirst}
<link href="/triplesale/resources/primefaces-pandora-bluegrey/theme.css" rel="stylesheet">
<link href="/triplesale/js/sweetalert/sweetalert.css" rel="stylesheet">
<script src="/triplesale/js/sweetalert/sweetalertv1.min.js"></script>
<link href="/triplesale/fontawesome-free-5.9.0-web/css/all.min.css" rel="stylesheet">
<link href="/triplesale/fontawesome-free-6.1.1-web/css/all.min.css" rel="stylesheet">
<link href="/triplesale/style.css" rel="stylesheet">
<link href="/triplesale/css/project_root.css?v=20260901" rel="stylesheet">
${extra.headEarly}
${css(headStyles)}
<link href="/triplesale/css/project_layout6.css" rel="stylesheet">
<link href="/triplesale/css/project_support.css" rel="stylesheet">
<link href="/triplesale/resources/support/dark_mode.css?v=20260904c" rel="stylesheet">
<link href="/triplesale/resources/pandora-layout/css/primeicons.css" rel="stylesheet">
<link href="/triplesale/resources/pandora-layout/css/primeflex.min.css" rel="stylesheet">
<link href="/triplesale/resources/demo/css/demo.css" rel="stylesheet">
<link href="/triplesale/resources/pandora-layout/css/layout-modify.css" rel="stylesheet">
<style>.layout-profile{display:none!important}</style>
${extra.head}
</head>
<body data-theme="light">
<script>document.body.dataset.theme = new URLSearchParams(location.search).get('theme') || 'light';
var fs = new URLSearchParams(location.search).get('fs'); </script>
<div class="layout-wrapper layout-topbar-modify layout-menu-dark layout-slim-plus">
${menu}
<div class="layout-main">
${topbar}
<div id="crm_main_body_page" class="layout-content" style="background-color: #EAEEFD;">${extra.content || '<div id="harness-content" style="min-height: calc(100vh - 44px - 30px - 16px);"></div>'}</div>
${footer}
<div class="layout-mask"></div>
</div>
</div>
${css(bodyStyles)}
${extra.tail}
</body></html>`;
    writeFileSync(join(out, name), html, 'utf8');
    return join(out, name);
  }

  return { TEMPLATE_SCRIPTS, build, convert, evalEl, replaceEl, read, th, bundle, makeCtx, out, WEB };
}
