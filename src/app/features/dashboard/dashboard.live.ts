/**
 * The live backend of the Dashboard: what the Java servlets and beans did on the server, done in the browser against the
 * dashboard service (`DashboardSunApiProxyServlet`, `DashboardChartSingleServlet` + `DashboardView.fetchSingleChart`,
 * `DashboardMasterdataServlet`, `DashboardMonthsServlet`, `DashboardActivityStepServlet`, `DashboardWidgetLayoutServlet`,
 * `GoldApiProxyServlet` and `CalendarDashboardView`). The page script keeps calling the same BFF paths (`/dashboard/chart-single?…`);
 * `fetch()` answers them with real `Response` objects, from `LiveDeps.call` (the app's HttpClient: bearer token, 401 handling, API log).
 * The pure parsing is in `dashboard.live.parse.ts`.
 *
 * Not ported: `DashboardResponseCache` (30 s cache of the servlets) and the 15 s / 60 s cache of `CalendarDashboardView` — the browser
 * asks again each time. The servlets built a fresh `DashboardView` per request, so "the last good answer" of Java never existed
 * either: a chart that fails answers `data: []` (or `{}` for the lead breakdown).
 */
import type { CalendarFrameData, DashboardBackend, DashboardInitial, FrameContext, LiveDeps } from './dashboard-backend';
import {
  applyOverview,
  buildFilterQSFull,
  chartFiltersOf,
  eventMovementsQuery,
  emptyInitialJson,
  emptyKpiStats,
  enc,
  extractTotalClosed,
  formatInt,
  funnelSubtitle,
  ggwBranchOf,
  JavaCastError,
  KPI_COLUMNS,
  KPI_EVENT_STATUS,
  kpiBranchQueryParam,
  kpiSummary,
  LEAD_BREAKDOWN_DIMENSIONS,
  layoutPageOf,
  myTaskArrayFromJson,
  normalizeMasterData,
  nz,
  parseActivityGroup,
  parseCalendarResponse,
  parseCsPerformance,
  parseDailyTrend,
  parseEventMovements,
  parseFunnel,
  parseGroupStep,
  parseJson,
  parseLatestStep,
  parseLeadBreakdown,
  parseMasterList,
  parsePipeline,
  parseStageSummary,
  parseTopCountries,
  sanitizeWidgetLayout,
  withActivityGroup,
  type ChartFilters,
  type JObj,
  type Option,
} from './dashboard.live.parse';

/** `ALLOWED_PATHS` of DashboardSunApiProxyServlet — the proxy must not become an open proxy */
const SUN_ALLOWED = new Set([
  'overview', 'daily_trend', 'activitygroup_summary', 'cs_performance', 'top_countries', 'funnel', 'funnel_cs', 'funnel_country', 'latest_step',
  'activitygroup', 'stage_summary', 'pipeline', 'pipeline/detail',
  'employee_performance', 'employee_performance/steps', 'employee_performance/pending_list', 'employee_performance/completed_list',
  'customer_step_groups', 'customer_status_list', 'lead_list', 'lead_list/detail',
  'masterdata/years', 'masterdata/months', 'masterdata/activity_group', 'masterdata/activitystep', 'masterdata/employee',
  'masterdata/movementtype', 'masterdata/chanel', 'masterdata/country', 'masterdata/province', 'masterdata/occupation',
]);

/** the nine lists of `loadMasterData()`: [key of /dashboard/masterdata-all, key of DashboardInitial, endpoint] */
const MASTERS = [
  ['years', 'yearsJson', 'years'],
  ['months', 'monthsJson', 'months'],
  ['province', 'provinceJson', 'province'],
  ['occupation', 'occupationJson', 'occupation'],
  ['employee', 'employeeJson', 'employee'],
  ['country', 'countryMasterJson', 'country'],
  ['chanel', 'chanelJson', 'chanel'],
  ['activity_group', 'activityGroupJson', 'activity_group'],
  ['movementtype', 'movementtypeJson', 'movementtype'],
] as const;

/** the master lists of the KPI table, in the order of `getKpiListDataJson()` */
const KPI_MASTERS = [
  ['taskTypes', 'masters/task-types'],
  ['jobTitles', 'masters/pillar-tasks'],
  ['prospects', 'masters/prospects'],
  ['products', 'masters/products'],
  ['units', 'masters/kpi-units'],
  ['levels', 'masters/levels'],
  ['kpiTasks', 'masters/kpi-tasks'],
  ['employees', 'masters/employees'],
  ['contacts', 'masters/contacts'],
  ['pillars', 'masters/pillars'],
] as const;

/** the sidebar calendars of `getCalendarDataJson()` (the frame reads only today / events; the Java list also named one developer, left out) */
const MY_CALENDARS = [
  { name: 'Tasks', color: 'blue' },
  { name: 'ครอบครัว', color: 'red' },
  { name: 'วันเกิด', color: 'green' },
];
const OTHER_CALENDARS = [{ name: 'วันหยุดในไทย', color: 'orange' }];

const JSON_TYPE = { 'Content-Type': 'application/json' };
/** statuses a `Response` may not have a body for */
const NO_BODY = new Set([204, 205, 304]);

/** a Response from a status and the text of the body (the statuses a Response cannot carry become 502) */
function reply(status: number, text: string): Response {
  const s = Number.isInteger(status) && status >= 200 && status <= 599 ? status : 502;
  return new Response(NO_BODY.has(s) ? null : text, { status: s, headers: JSON_TYPE });
}
const json = (body: unknown, status = 200): Response => reply(status, JSON.stringify(body));
/** `_writeError`: `{ "error": "<message>" }` — backslashes dropped, double quotes made single */
const writeError = (status: number, message: string): Response => json({ error: String(message).replace(/\\/g, '').replace(/"/g, "'") }, status);

const abortError = (): DOMException => new DOMException('The operation was aborted.', 'AbortError');

/** settles like `p`, but rejects with an AbortError as soon as the signal aborts (the HttpClient behind `LiveDeps.call` cannot be cancelled) */
function raceAbort<T>(p: Promise<T>, signal?: AbortSignal | null): Promise<T> {
  if (!signal) return p;
  if (signal.aborted) return Promise.reject(abortError());
  return new Promise<T>((resolve, reject) => {
    const onAbort = (): void => reject(abortError());
    signal.addEventListener('abort', onAbort, { once: true });
    p.then(
      (v) => {
        signal.removeEventListener('abort', onAbort);
        resolve(v);
      },
      (e) => {
        signal.removeEventListener('abort', onAbort);
        reject(e);
      },
    );
  });
}

// ---- the widget layout, per browser ------------------------------------------------------------------------------------

/** used when `localStorage` is not available (private window, blocked site data): the layout then lasts until the tab is closed */
const layoutMemory = new Map<string, string>();

/** forget the layouts kept in memory (tests) */
export function resetLiveDashboardMemory(): void {
  layoutMemory.clear();
}

function readLayout(key: string): string | null {
  try {
    const v = localStorage.getItem(key);
    if (v !== null) return v;
  } catch {
    /* no storage: fall through to memory */
  }
  return layoutMemory.get(key) ?? null;
}

function writeLayout(key: string, value: string): void {
  try {
    localStorage.setItem(key, value);
    layoutMemory.delete(key);
  } catch {
    layoutMemory.set(key, value);
  }
}

// ---- the backend -----------------------------------------------------------------------------------------------------------

/** how long the Java helpers waited for the service: connect 15 s + read 20 s (the HttpClient behind `LiveDeps.call` has no limit of its own) */
const SERVICE_TIMEOUT_MS = 35_000;
/** the proxy of the iframes (`GoldApiProxyServlet`) waited 30 s */
const GOLD_TIMEOUT_MS = 30_000;

export function createLiveDashboard(deps: LiveDeps): DashboardBackend {
  const api = (deps.dashboardApi ?? '').trim().replace(/\/+$/, '');

  /** one call to the service; a service that has not answered after `ms` is "no answer at all" (status 0) */
  function callWithin(ms: number, method: string, url: string, body?: unknown, headers?: Record<string, string>): Promise<{ status: number; text: string }> {
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => resolve({ status: 0, text: 'timeout' }), ms);
      const settle = <T>(f: (v: T) => void) => (v: T): void => {
        clearTimeout(timer);
        f(v);
      };
      try {
        deps.call(method, url, body, headers).then(settle(resolve), settle(reject));
      } catch (e) {
        clearTimeout(timer);
        reject(e);
      }
    });
  }

  /** one GET: the text of the answer when `ok(status)`, else null (Java: the HttpURLConnection helpers returned null on anything else) */
  async function getText(url: string, ok: (status: number) => boolean = (s) => s >= 200 && s < 300): Promise<string | null> {
    if (api === '') return null; // Java: "triplesale.api.dashboard ว่าง" → skip
    let r: { status: number; text: string };
    try {
      r = await callWithin(SERVICE_TIMEOUT_MS, 'GET', url);
    } catch {
      return null;
    }
    return ok(r.status) ? r.text : null;
  }
  const is200 = (s: number): boolean => s === 200;
  const segment = (seg: 'dashboards' | 'sundashboard', endpoint: string, qs: string): string => `${api}/${seg}/${endpoint}${qs}`;

  // ==== 1) DashboardSunApiProxyServlet ====================================================================================

  /** `/dashboard/api/v1/sundashboard/<path>?<query>` → the service, status and body unchanged; `overview` lives under `dashboards` */
  async function sunProxy(pathInfo: string, search: string): Promise<Response> {
    const path = pathInfo.trim().replace(/^\/+/, '').replace(/\/+$/, '');
    if (!SUN_ALLOWED.has(path)) return writeError(404, `Unknown dashboard-triplesale-service endpoint: ${path}`);
    if (api === '') return writeError(503, 'SUN API URL not configured');
    let r: { status: number; text: string };
    try {
      r = await callWithin(SERVICE_TIMEOUT_MS, 'GET', segment(path === 'overview' ? 'dashboards' : 'sundashboard', path, search));
    } catch (e) {
      return writeError(502, (e as Error)?.message ?? 'proxy failed');
    }
    if (r.status === 0) return writeError(502, 'no answer from the dashboard service');
    // an error answer with no body at all (Java: getErrorStream() == null)
    if (r.text === '' && (r.status < 200 || r.status >= 300)) return writeError(r.status, 'No response body from SUN API');
    return reply(r.status, r.text);
  }

  // ==== 2) DashboardChartSingleServlet + DashboardView.fetchSingleChart ======================================================

  /** the answer of `chart=groupPanels`: the servlet sent the full filter set (no `activitygroup`) to `fetchActivityGroupPanels` */
  async function fetchActivityGroupPanels(f: ChartFilters): Promise<JObj> {
    const resp = await getText(segment('sundashboard', 'activitygroup', buildFilterQSFull(f)));
    return { chart: 'groupPanels', data: parseActivityGroup(resp) ?? [] };
  }

  /** `fetchSingleChart`: `{ chart, data[, totalClosed, subtitle] }` — `data` is `[]` when the service failed or the parse found nothing */
  async function fetchSingleChart(chartName: string, f: ChartFilters): Promise<JObj> {
    const chart = chartName.trim();
    if (chart === '') return { chart: '', data: [] };
    const qs = withActivityGroup(buildFilterQSFull(f), f);
    let inner: unknown = null;
    let totalClosed = 0; // sourceFunnelTotalClosed & co.: kept only when > 0
    try {
      switch (chart) {
        case 'trend': {
          const resp = await getText(segment('dashboards', 'daily_trend', qs));
          inner = resp === null || resp.trim() === '' ? null : parseDailyTrend(resp);
          break;
        }
        case 'group':
          inner = parseGroupStep(await getText(segment('dashboards', 'activitygroup_summary', qs)));
          break;
        case 'cs':
          inner = parseCsPerformance(await getText(segment('dashboards', 'cs_performance', qs)));
          break;
        case 'topCountries':
          inner = parseTopCountries(await getText(segment('dashboards', 'top_countries', qs)));
          break;
        case 'sourceFunnel': {
          const resp = await getText(segment('dashboards', 'funnel', qs));
          totalClosed = extractTotalClosed(resp);
          inner = parseFunnel(resp, false, true); // the share of this funnel is the service's own `percentage`
          break;
        }
        case 'step':
          inner = parseLatestStep(await getText(segment('dashboards', 'latest_step', qs)));
          break;
        case 'csFunnel': {
          const resp = await getText(segment('dashboards', 'funnel_cs', qs));
          totalClosed = extractTotalClosed(resp);
          inner = parseFunnel(resp, false, false);
          break;
        }
        case 'countryFunnel': {
          const resp = await getText(segment('dashboards', 'funnel_country', qs));
          totalClosed = extractTotalClosed(resp);
          inner = parseFunnel(resp, false, false);
          break;
        }
        case 'groupPanels':
          inner = parseActivityGroup(await getText(segment('sundashboard', 'activitygroup', qs)));
          break;
        case 'pipelineTable':
          // Java: always page 1 (the servlet does not pass one); the label of a month without a name uses the requested year
          inner = parsePipeline(await getText(segment('sundashboard', 'pipeline', `${qs}&page=1`)), f.year, 1);
          break;
        case 'statusKpis':
          inner = parseStageSummary(await getText(segment('dashboards', 'stage_summary', `${qs}&group=${enc(nz(f.group, 'all'))}`)));
          break;
        case 'leadBreakdown':
          inner = parseLeadBreakdown(await getText(segment('dashboards', 'lead_breakdown', `${qs}&${LEAD_BREAKDOWN_DIMENSIONS}`)));
          break;
        case 'kpi': {
          // overview KPI on top of the empty stats; whatever the service did not give stays 0 / "-"
          const stats = emptyKpiStats();
          applyOverview(await getText(segment('dashboards', 'overview', qs)), stats);
          return { chart, data: kpiSummary(stats) };
        }
        default:
          return { chart, data: [], error: 'unknown chart' };
      }
    } catch (e) {
      // Java: a non-object in the list (ClassCastException) was logged and the chart answered empty; a real bug must not hide behind that
      if (!(e instanceof JavaCastError)) throw e;
      inner = null;
    }
    const out: JObj = { chart, data: inner ?? [] };
    if (chart === 'sourceFunnel' || chart === 'csFunnel' || chart === 'countryFunnel') {
      out['totalClosed'] = totalClosed;
      out['subtitle'] = funnelSubtitle(totalClosed); // the KPI stats of a fresh DashboardView are empty: 0 closed
    }
    return out;
  }

  /** DashboardChartSingleServlet.doGet */
  async function chartSingle(q: URLSearchParams): Promise<Response> {
    const chart = nz(q.get('chart'), '');
    const f = chartFiltersOf(q);
    try {
      return json(chart === 'groupPanels' ? await fetchActivityGroupPanels(f) : await fetchSingleChart(chart, f));
    } catch (e) {
      const message = (e as Error)?.message ? (e as Error).message.replace(/"/g, "'") : 'unknown';
      return json({ chart, error: message, data: [] }, 500);
    }
  }

  // ==== 3) master data ===================================================================================================

  /** `fetchMasterFromApi`: one list of `sundashboard/masterdata/<endpoint>` as `[{ value, label }]`; any failure is `[]` */
  async function fetchMasterFromApi(endpoint: string, qs: string | null, ggwBranch: string): Promise<Option[]> {
    try {
      let query = (qs ?? '').trim();
      query += `${query === '' ? '?' : '&'}ggwBranch=${enc(nz(ggwBranch, 'all'))}`;
      const resp = await getText(`${api}/sundashboard/masterdata/${endpoint}${query}`);
      if (resp === null || resp.trim() === '') return [];
      return normalizeMasterData(resp, endpoint);
    } catch {
      return [];
    }
  }

  /** `loadMasterData`: the nine lists at once, a failed one is `[]` */
  async function loadMasterData(ggwBranch: string): Promise<Record<(typeof MASTERS)[number][0], Option[]>> {
    const year = String(new Date().getFullYear());
    const lists = await Promise.all(
      MASTERS.map(([, , endpoint]) => fetchMasterFromApi(endpoint, endpoint === 'months' ? `?year=${year}` : null, ggwBranch).catch((): Option[] => [])),
    );
    const out = {} as Record<(typeof MASTERS)[number][0], Option[]>;
    MASTERS.forEach(([key], i) => (out[key] = lists[i]));
    return out;
  }

  // ==== 4) DashboardWidgetLayoutServlet (per browser) =========================================================================

  /**
   * The Java servlet kept one JSON file per employee on the server. The service has no endpoint for it, so the layout is kept in
   * this browser (`localStorage`) per employee and page — it does not follow the user to another browser or machine until the
   * service gets an endpoint for it.
   */
  function widgetLayout(q: URLSearchParams, method: string, body: string): Response {
    const who = (deps.user?.employeeCode || deps.user?.username || '').trim();
    const page = layoutPageOf(q.get('page'));
    const key = `ts.dashboard.layout.${who}.${page}`;
    if (method === 'GET') {
      if (who === '') return json({ error: 'ยังไม่ได้ login (ไม่พบ employeeCode / username)' }, 400);
      const saved = readLayout(key);
      const parsed = saved === null ? undefined : parseJson(saved);
      return json(parsed !== undefined && parsed !== null ? parsed : { widgets: [] });
    }
    if (method === 'POST') {
      if (who === '') return json({ ok: false, error: 'ยังไม่ได้ login (ไม่พบ employeeCode / username)' }, 400);
      const r = sanitizeWidgetLayout(body);
      if (!r.ok) return json({ ok: false, error: r.error }, 400);
      writeLayout(key, JSON.stringify({ widgets: r.widgets }));
      return json({ ok: true });
    }
    return writeError(405, 'method not allowed');
  }

  // ==== the dashboard service of the iframes (GoldApiProxyServlet) =============================================================

  /** forwards a call of an iframe to the service as it is: method, body, Content-Type / Accept — answers with its status and body */
  async function forward(url: string, init?: RequestInit): Promise<Response> {
    const method = (init?.method ?? 'GET').toUpperCase();
    const given = new Headers(init?.headers);
    const headers: Record<string, string> = { Accept: given.get('Accept') ?? 'application/json' };
    const withBody = method === 'POST' || method === 'PUT' || method === 'PATCH' || method === 'DELETE';
    if (withBody) headers['Content-Type'] = given.get('Content-Type') ?? 'application/json';
    const raw = init?.body;
    const body = withBody && raw !== undefined && raw !== null ? (typeof raw === 'string' ? raw : String(raw)) : undefined;
    let r: { status: number; text: string };
    try {
      r = await callWithin(GOLD_TIMEOUT_MS, method, url, body, headers);
    } catch (e) {
      return writeError(502, `gold api proxy failed: ${(e as Error)?.message ?? 'unknown'}`);
    }
    if (r.status === 0) return writeError(502, 'gold api proxy failed: no answer');
    return reply(r.status, r.text);
  }

  /** the iframes call the service by the address they were given (`FrameContext.goldApi`): `${dashboardApi}/…` */
  const isServiceUrl = (input: string): boolean => api !== '' && (input === api || input.startsWith(`${api}/`) || input.startsWith(`${api}?`));

  // ==== routing =========================================================================================================

  async function route(input: string, init?: RequestInit): Promise<Response> {
    if (isServiceUrl(input)) return forward(input, init);

    const url = new URL(input, 'http://dashboard.local');
    const method = (init?.method ?? 'GET').toUpperCase();
    const q = url.searchParams;
    const path = url.pathname.replace(/^\/dashboard(?=\/|$)/, '');
    const getOnly = (run: () => Promise<Response>): Promise<Response> => (method === 'GET' ? run() : Promise.resolve(writeError(405, 'method not allowed')));

    switch (path) {
      case '/chart-single':
        return getOnly(() => chartSingle(q));
      case '/masterdata-all':
        return getOnly(async () => {
          // DashboardView.fetchAllMasterdataJson(): the nine lists under their page names
          const lists = await loadMasterData(ggwBranchOf(q));
          return json(lists);
        });
      case '/months':
        return getOnly(async () => {
          // getMonthsForYear: months?year=<year of the request, else this year>
          const year = nz(q.get('year'), String(new Date().getFullYear()));
          return json(await fetchMasterFromApi('months', `?year=${enc(year)}`, ggwBranchOf(q)));
        });
      case '/masterdata-activitystep':
        return getOnly(async () => json(await fetchMasterFromApi('activitystep', `?activitygroup=${enc(nz(q.get('activitygroup'), 'CS'))}`, ggwBranchOf(q))));
      case '/widget-layout':
        return widgetLayout(q, method, typeof init?.body === 'string' ? init.body : init?.body == null ? '' : String(init.body));
      case '/api/v1/sundashboard':
        return getOnly(() => sunProxy('', url.search));
      default:
    }
    const sunPrefix = '/api/v1/sundashboard/';
    if (path.startsWith(sunPrefix)) {
      let rest = path.slice(sunPrefix.length);
      try {
        rest = decodeURIComponent(rest); // getPathInfo() is decoded
      } catch {
        /* keep the raw text: it will not be in the allow-list */
      }
      return getOnly(() => sunProxy(rest, url.search));
    }
    return json({ error: 'not found', path }, 404);
  }

  // ==== 6) the iframes (CalendarDashboardView) ==================================================================================

  /** `loadMyTaskListJson` / `fetchGoldMasterListJson`: `[{ id, code, name }]` as text, `[]` unless the service answered 200 */
  async function goldMasterList(path: string): Promise<string> {
    const body = await getText(`${api}${path}`, is200);
    return JSON.stringify(body === null ? [] : myTaskArrayFromJson(body));
  }

  /** the events of the month list: `fetchCalendarFromApi("all", "all", "all", 1, 20)` — 200 only, `[]` otherwise */
  async function calendarEvents(): Promise<unknown[]> {
    const query = 'date_type=&date_select=all&calendartype=all&employees=all&position=all&page=1&perPage=20';
    const body = await getText(`${api}/calendar?${query}`, is200);
    return (body === null ? null : parseCalendarResponse(body)) ?? [];
  }

  /** `fetchMasterList` → `masterArray`: the `result` of a master answer; `[]` when unusable. ggwBranch goes with every master (the service refuses them without) */
  async function kpiMaster(path: string, branch: string): Promise<unknown[]> {
    const items = parseMasterList(await getText(`${api}/${path}${kpiBranchQueryParam(branch, '?')}`));
    return items ?? [];
  }

  const pad2 = (n: number): string => (n < 10 ? '0' : '') + n;

  return {
    /**
     * `DashboardView.init()`: the empty JSON of `applySafeDefaultJson()` for every chart (the page asks for all of them again
     * right after it starts), the nine master lists fetched now, and the texts of an empty `DashboardBean` (0 / "-").
     */
    async initial(ggwBranch: string): Promise<DashboardInitial> {
      const lists = await loadMasterData(ggwBranch);
      return {
        ...emptyInitialJson(),
        yearsJson: lists.years,
        monthsJson: lists.months,
        provinceJson: lists.province,
        occupationJson: lists.occupation,
        employeeJson: lists.employee,
        countryMasterJson: lists.country,
        chanelJson: lists.chanel,
        activityGroupJson: lists.activity_group,
        movementtypeJson: lists.movementtype,
        kpiTotalFmt: formatInt(0),
        kpiCountries: '0',
        kpiTopCountry: '-',
        sourceFunnelSubtitle: funnelSubtitle(0),
        csFunnelSubtitle: funnelSubtitle(0),
        countryFunnelSubtitle: funnelSubtitle(0),
      };
    },

    /** `getCalendarDataJson()` and the lists of the sidebar; the addresses are the ones the iframe calls through `fetch()` */
    async calendarFrame(ctx: FrameContext): Promise<CalendarFrameData> {
      const [events, myTask, myCalendars, taskCalendars] = await Promise.all([
        calendarEvents().catch((): unknown[] => []),
        goldMasterList('/my-task'),
        goldMasterList('/my-calendar-list'),
        goldMasterList('/my-task-list'),
      ]);
      const now = new Date();
      return {
        calendarDataJson: JSON.stringify({
          defaultYear: now.getFullYear(),
          defaultMonth: now.getMonth() + 1,
          today: `${now.getFullYear()}-${pad2(now.getMonth() + 1)}-${pad2(now.getDate())}`,
          events,
          myCalendars: MY_CALENDARS,
          otherCalendars: OTHER_CALENDARS,
          taskLists: [],
        }),
        calendarApiUrl: `${ctx.goldApi}/calendar`,
        employeeCode: ctx.employeeCode,
        myTaskListJson: myTask,
        calendarTaskCreateUrl: `${ctx.goldApi}/calendar-task`,
        myCalendarListJson: myCalendars,
        myTaskCalendarListJson: taskCalendars,
      };
    },

    /** `getKpiListDataJson()`: `{ columns, statusOptions, records, total, source, masters }` as text */
    async kpiFrame(ctx: FrameContext): Promise<string> {
      const [list, ...masters] = await Promise.all([
        getText(`${api}/eventmovements${eventMovementsQuery('', '', 1, 200, ctx.ggwBranch)}`),
        ...KPI_MASTERS.map(([, path]) => kpiMaster(path, ctx.ggwBranch)),
      ]);
      const parsed = parseEventMovements(list);
      const records = parsed ?? []; // service unusable → an empty table, never made-up rows
      const statuses = new Set<string>();
      for (const r of records) {
        const s = typeof r['eventstatus'] === 'string' ? r['eventstatus'].trim() : '';
        if (s !== '') statuses.add(s);
      }
      if (statuses.size === 0) for (const s of KPI_EVENT_STATUS) statuses.add(s);
      const mastersOut: Record<string, unknown[]> = {};
      KPI_MASTERS.forEach(([key], i) => (mastersOut[key] = masters[i]));
      return JSON.stringify({
        columns: KPI_COLUMNS.map(([field, title, type]) => ({ field, title, type })),
        statusOptions: [...statuses],
        records,
        total: records.length,
        source: parsed === null ? 'unavailable' : 'api',
        masters: mastersOut,
      });
    },

    async fetch(input: string, init?: RequestInit): Promise<Response> {
      const signal = init?.signal;
      if (signal?.aborted) throw abortError();
      const done = route(String(input), init).catch((e: unknown) => writeError(500, (e as Error)?.message ?? 'unknown'));
      return raceAbort(done, signal);
    },
  };
}
