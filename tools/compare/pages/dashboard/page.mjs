// Comparison setup of the Dashboard (/dashboard) — see tools/compare/README.md for the interface of a page.
//
// Java side: the REAL page (the <style> + ECharts include of dashboard.xhtml, the markup + page script of dashboard_company.xhtml, EL resolved
// the way the server would) inside the shell replica; its data (`dashboardView.*Json`), its BFF calls (/triplesale/dashboard/*), the Gold API proxy
// (/triplesale/goldapi/*) and the two iframe documents all come from the SAME mock the Angular page runs (dashboard.mock.ts).
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const MOCK = 'src/app/features/dashboard/dashboard.mock.ts';
const GOLD = '/dashboard-triplesale-service/api/v1';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const VOID = new Set(['area', 'base', 'br', 'col', 'embed', 'hr', 'img', 'input', 'link', 'meta', 'source', 'track', 'wbr']);

export default {
  name: 'dashboard',
  roots: ['.dbsun-root', '#dbsunModalHost'],
  ready: `document.querySelector('.dbsun-root .tab-btn') && document.querySelector('#kpiTotal') && !/^\\s*$/.test(document.querySelector('#kpiTotal').textContent)`,
  javaPath: (lang) => (lang === 'en' ? '/triplesale/dashboard-en.html' : '/triplesale/dashboard.html'),
  ngPath: () => '/dashboard',
  latencyMs: 150,
  // helpers of this page's scenarios
  pre: `
var tab = async function (t, ms) { click('.dbsun-root .tab-btn[data-tab="' + t + '"]'); await sleep(ms || 2400); };
var CALF = '#calendarFrame', KPIF = '#kpiFrame';
`,
  // where the port deliberately differs: the API prefixes; a new KPI row starts "now" (the time the page was opened)
  normalize: (l) =>
    l
      .replace(/\/triplesale\/(goldapi|dashboard)/g, '/API')
      .replace(/\/dashboard-triplesale-service\/api\/v1/g, '/API')
      .replace(/\bvalue=\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/g, 'value=NOW'),

  /** builds the Java replica pages; returns { url path -> file } */
  async build(ctx) {
    const { shell } = ctx;
    const mock = await ctx.loadTs(join(ctx.ngRoot, MOCK));
    const initial = await mock.createMockDashboard({ delayMs: 0 }).initial('SUN');
    const page = shell.read('pages/dashboard.xhtml');
    const company = shell.read('pages/dashboard_company.xhtml');

    /* ---- head: <style> of dashboard.xhtml + the fonts (local copies of the same families) ---- */
    const css = page.slice(page.indexOf('<style>') + '<style>'.length, page.indexOf('</style>', page.indexOf('<style>')));
    const FONTS = `<style>
@font-face { font-family: 'Noto Sans Thai'; src: url('/__pub/assets/fonts/noto-sans-thai/NotoSansThai-Variable.ttf') format('truetype'); font-weight: 100 900; font-style: normal; font-display: swap; }
@font-face { font-family: 'Be Vietnam Pro'; font-style: normal; font-weight: 600; font-display: swap; src: url('/__pub/assets/fonts/be-vietnam-pro/be-vietnam-pro-latin-600-normal.woff2') format('woff2'); }
@font-face { font-family: 'Be Vietnam Pro'; font-style: normal; font-weight: 700; font-display: swap; src: url('/__pub/assets/fonts/be-vietnam-pro/be-vietnam-pro-latin-700-normal.woff2') format('woff2'); }
@font-face { font-family: 'Be Vietnam Pro'; font-style: normal; font-weight: 800; font-display: swap; src: url('/__pub/assets/fonts/be-vietnam-pro/be-vietnam-pro-latin-800-normal.woff2') format('woff2'); }
@font-face { font-family: 'Be Vietnam Pro'; font-style: normal; font-weight: 900; font-display: swap; src: url('/__pub/assets/fonts/be-vietnam-pro/be-vietnam-pro-latin-900-normal.woff2') format('woff2'); }
</style>`;
    // (harness only) start the font downloads at the top of the head: the page draws its charts at DOMContentLoaded and ECharts
    // measures the legend text with whatever font is loaded THEN — a race that the real Java page has too; here it is made as
    // predictable as the already-warm Angular shell
    const PRELOAD = ['noto-sans-thai/NotoSansThai-Variable.ttf', 'be-vietnam-pro/be-vietnam-pro-latin-600-normal.woff2', 'be-vietnam-pro/be-vietnam-pro-latin-700-normal.woff2']
      .map((f) => `<link rel="preload" as="font" href="/__pub/assets/fonts/${f}" crossorigin>`).join('\n');
    const head = `${PRELOAD}\n<script src="/triplesale/js/echarts-5.6.0/echarts.min.js"></script>\n${FONTS}\n<style>${css}</style>`;

    /* ---- markup ---- */
    const mFrom = company.indexOf('<div class="dbsun-root">');
    const mTo = company.indexOf('<script>', mFrom);
    const sf = company.indexOf('//<![CDATA[', mTo);
    const se = company.indexOf('//]]>', sf);

    const buildLang = (lang) => {
      const th = lang === 'en' ? ctx.readJson('public/assets/i18n/en.json') : shell.th;
      const msg = (k) => {
        if (!(k in th)) throw new Error('no message ' + k);
        return th[k];
      };
      let markup = company.slice(mFrom, mTo).replace(/<!--[\s\S]*?-->/g, '');
      // Facelets writes <tag/> of XHTML as <tag></tag> (only void elements keep the short form)
      markup = markup.replace(/<([a-zA-Z][\w:-]*)\b((?:[^>"']|"[^"]*"|'[^']*')*?)\/>/g, (m, name, rest) => (VOID.has(name.toLowerCase()) ? m : `<${name}${rest}></${name}>`));
      markup = markup.replace(/#\{commonBean\.msg\['([\w.]+)'\]\}/g, (_m, k) => msg(k));
      for (const n of ['kpiTotalFmt', 'kpiCountries', 'kpiTopCountry', 'sourceFunnelSubtitle', 'csFunnelSubtitle', 'countryFunnelSubtitle']) {
        markup = markup.split(`#{dashboardView.${n}}`).join(initial[n]);
      }
      if (/#\{/.test(markup)) throw new Error('EL left in the markup: ' + markup.match(/.{0,40}#\{.{0,40}/)[0]);

      let script = company.slice(sf + '//<![CDATA['.length, se);
      script = script
        .replace(/#\{commonBean\.msg\["([\w.]+)"\]\}/g, (_m, k) => msg(k))
        .replace(/#\{dashboardView\.dashboardSunUrl\}/g, '/triplesale/dashboard/api/v1/sundashboard')
        .replace(/#\{sessionScope\.ss_branch_code\}/g, 'SUN')
        .replace(/#\{request\.contextPath\}/g, '/triplesale')
        .replace(/#\{'\$'\}/g, '$');
      for (const name of [
        'trendJson', 'groupJson', 'csJson', 'topCountriesJson', 'stepJson', 'sourceFunnelJson', 'csFunnelJson', 'countryFunnelJson', 'yearsJson', 'monthsJson',
        'provinceJson', 'occupationJson', 'employeeJson', 'countryMasterJson', 'chanelJson', 'activityGroupJson', 'movementtypeJson', 'groupPanelsJson',
        'pipelineTableJson', 'pipelinePeopleJson', 'statusKpisJson', 'statusEmployeesJson', 'statusPopupJson', 'leadsTableJson',
      ]) {
        script = script.split(`#{dashboardView.${name}}`).join(JSON.stringify(initial[name]));
      }
      const code = script.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
      if (/#\{/.test(code)) throw new Error('EL left in the page script: ' + code.match(/.{0,50}#\{.{0,50}/)[0]);

      return shell.build('home', '3', lang === 'en' ? 'h-dash-en.html' : 'h-dash.html', {
        head,
        content: markup + `\n<script>${script}</script>`,
        // ts_username is what the Java login page left in sessionStorage; the calendar / KPI frames read it
        tail: `<script>try { sessionStorage.setItem('ts_username', 'demo'); } catch (e) {}</script>\n${shell.TEMPLATE_SCRIPTS()}`,
      });
    };
    return { '/triplesale/dashboard.html': buildLang('th'), '/triplesale/dashboard-en.html': buildLang('en') };
  },

  /** a fresh backend for one scenario run (its own module instance: the mock keeps its state at module level) */
  async newState({ delay }, ctx) {
    const mock = await ctx.loadTs(join(ctx.ngRoot, MOCK));
    mock.resetMockDashboard?.();
    return { backend: mock.createMockDashboard({ delayMs: 0 }), delay };
  },

  /** the BFF / Gold API the Java page calls and the two iframe documents; null = not mine */
  async handle(req, state, ctx) {
    const { backend, delay } = state;
    let api = null;
    if (req.path.startsWith('/triplesale/dashboard/')) api = req.path.slice('/triplesale'.length);
    else if (req.path.startsWith('/triplesale/goldapi/')) api = GOLD + '/' + req.path.slice('/triplesale/goldapi/'.length);
    else if (req.path.startsWith(GOLD + '/')) api = req.path;
    if (api) {
      if (delay) await sleep(delay);
      const r = await backend.fetch(api + req.search, { method: req.method, body: req.body, headers: { 'Content-Type': req.headers['content-type'] ?? '' } });
      return { status: r.status, headers: { 'content-type': r.headers.get('content-type') ?? 'application/json' }, body: Buffer.from(await r.arrayBuffer()) };
    }
    const m = /^\/triplesale\/pages\/(dashboard_(?:calendar|kpi)_frame\.xhtml)$/.exec(req.path);
    if (m) {
      if (delay) await sleep(delay);
      return { status: 200, headers: { 'content-type': 'text/html; charset=utf-8' }, body: await javaFrame(ctx, backend, m[1]) };
    }
    return null;
  },
};

/** the Java frame document as the server rendered it: EL resolved from the mock, the same values the Angular builder gets */
async function javaFrame(ctx, backend, file) {
  let x = readFileSync(join(ctx.javaRoot, 'web', 'pages', file), 'utf8').replace(/\r\n/g, '\n').replace(/^<\?xml[^>]*\?>\s*/, '');
  const fctx = { ggwBranch: 'SUN', goldApi: '/triplesale/goldapi', employeeCode: 'E101', username: 'demo' };
  const el = { 'sessionScope.ss_branch_code': 'SUN', 'request.contextPath': '/triplesale' };
  if (file.includes('calendar')) {
    const d = await backend.calendarFrame(fctx);
    Object.assign(el, {
      'calendarDashboardView.calendarDataJson': d.calendarDataJson, 'calendarDashboardView.calendarApiUrl': d.calendarApiUrl,
      'calendarDashboardView.employeeCode': d.employeeCode, 'calendarDashboardView.myTaskListJson': d.myTaskListJson,
      'calendarDashboardView.calendarTaskCreateUrl': d.calendarTaskCreateUrl, 'calendarDashboardView.myCalendarListJson': d.myCalendarListJson,
      'calendarDashboardView.myTaskCalendarListJson': d.myTaskCalendarListJson,
    });
  } else {
    el['calendarDashboardView.kpiListDataJson'] = await backend.kpiFrame(fctx);
  }
  return x.replace(/#\{([^}]+)\}/g, (m, k) => {
    if (!(k in el)) throw new Error('frame EL not resolved: ' + m);
    return el[k];
  });
}
