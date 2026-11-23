/**
 * The pure half of the live Dashboard backend: ports of the Java parse / transform helpers of `DashboardView`
 * (the chart parsers, `normalizeMasterData`, the query builders …), `CalendarDashboardBean` / `CalendarDashboardView`
 * (calendar events, KPI records) and `DashboardWidgetLayoutServlet` (the layout validation).
 *
 * No Angular and no I/O: every function takes the text of an answer (or a decoded value) and gives back what the Java code
 * would have put into the JSON it sent to the page. `null` where Java returned `null` ("this chart failed, use the fallback").
 * The Java code reads JSON with the shaded org.json of PrimeFaces; `firstNonNull*` below reproduce its lenient getters
 * (`getInt` of a string, `getDouble` fallback, nested objects skipped …) because the service answers are not always typed.
 */

import { firstNonNullDouble, firstNonNullInt, firstNonNullString, has, hasVal, i32, isArr, isObj, javaParseDouble, optLong, optString, orgGetDouble, orgGetInt, parseJson, type JObj } from '@core/live/org-json';

export { firstNonNullDouble, firstNonNullInt, firstNonNullString, isObj, optLong, optString, parseJson };
export type { JObj };

// ---- org.json semantics: the helpers live in core/live/org-json.ts (shared with the other live backends) ----

/** Java `(JSONObject) array.get(i)` — a ClassCastException that the callers' try/catch turns into "this chart failed" */
export class JavaCastError extends Error {
  constructor() {
    super('not a JSONObject');
    this.name = 'JavaCastError';
  }
}
const asObj = (v: unknown): JObj => {
  if (!isObj(v)) throw new JavaCastError();
  return v;
};

const nvl = (s: string | null | undefined): string => s ?? '';

// ---- query builders --------------------------------------------------------------------------------------------------

/** `nz`: null / blank → the default, else trimmed */
export const nz = (v: string | null | undefined, def: string): string => (v == null || v.trim() === '' ? def : v.trim());

/**
 * `enc` = `URLEncoder.encode(v, "UTF-8")`: a space is `+`, only `A-Za-z0-9 . - * _` stay. (`encodeURIComponent` also leaves
 * `! ' ( ) ~` alone; the service decodes both, but the URL is then byte-for-byte what the Java page sent.)
 */
export function enc(v: string | null | undefined): string {
  return encodeURIComponent(v ?? '')
    .replace(/[!'()~]/g, (c) => '%' + c.charCodeAt(0).toString(16).toUpperCase())
    .replace(/%20/g, '+');
}

/** the filters the servlets read from the request (`DashboardChartSingleServlet._param` defaults) + the branch of the user */
export interface ChartFilters {
  year: string;
  month: string;
  fromdate: string;
  todate: string;
  datebasis: string;
  employee: string;
  chanel: string;
  country: string;
  occupation: string;
  province: string;
  activitygroup: string;
  movementtype: string;
  group: string;
  ggwBranch: string;
}

/** `_param`: blank / missing → the default, else trimmed */
const param = (q: URLSearchParams, name: string, def: string): string => nz(q.get(name), def);

/**
 * `DashboardView.currentGgwbranch()`. Java trusted the session first; without a session the page's own `ggwBranch` query
 * parameter was the fallback (`all` is never used from the parameter). Here the parameter is the only source: the page adds it
 * to every URL from the signed-in user (`_dbGgwbranchParam`).
 */
export function ggwBranchOf(q: URLSearchParams): string {
  let p = (q.get('ggwBranch') ?? '').trim();
  if (p === '') p = (q.get('ggwbranch') ?? '').trim(); // clients of the old name
  return p !== '' && p.toLowerCase() !== 'all' ? p : 'all';
}

/** the parameters of `/dashboard/chart-single` with the servlet's defaults (the `cs` of old pages stands in for `employee`) */
export function chartFiltersOf(q: URLSearchParams, now: Date = new Date()): ChartFilters {
  const employee = param(q, 'employee', 'all');
  return {
    year: param(q, 'year', String(now.getFullYear())),
    month: param(q, 'month', 'all'),
    fromdate: param(q, 'fromdate', 'all'),
    todate: param(q, 'todate', 'all'),
    datebasis: param(q, 'datebasis', 'contact'),
    employee: employee !== 'all' ? employee : param(q, 'cs', 'all'),
    chanel: param(q, 'chanel', 'all'),
    country: param(q, 'country', 'all'),
    occupation: param(q, 'occupation', 'all'),
    province: param(q, 'province', 'all'),
    activitygroup: param(q, 'activitygroup', 'all'),
    movementtype: param(q, 'movementtype', 'all'),
    group: param(q, 'group', 'all'),
    ggwBranch: ggwBranchOf(q),
  };
}

/** `buildFilterQSFull` — the full filter set of the API spec 2026-08-06 + `ggwBranch` (never `activitygroup`: see {@link withActivityGroup}) */
export function buildFilterQSFull(f: ChartFilters): string {
  return (
    `?year=${enc(nz(f.year, 'all'))}` +
    `&month=${enc(nz(f.month, 'all'))}` +
    `&fromdate=${enc(nz(f.fromdate, 'all'))}` +
    `&todate=${enc(nz(f.todate, 'all'))}` +
    `&datebasis=${enc(nz(f.datebasis, 'contact'))}` +
    `&employee=${enc(nz(f.employee, 'all'))}` +
    `&chanel=${enc(nz(f.chanel, 'all'))}` +
    `&country=${enc(nz(f.country, 'all'))}` +
    `&occupation=${enc(nz(f.occupation, 'all'))}` +
    `&province=${enc(nz(f.province, 'all'))}` +
    `&movementtype=${enc(nz(f.movementtype, 'all'))}` +
    `&ggwBranch=${enc(nz(f.ggwBranch, 'all'))}`
  );
}

/** what `fetchSingleChart` appends to `buildFilterQSFull` */
export const withActivityGroup = (qs: string, f: ChartFilters): string => `${qs}&activitygroup=${enc(nz(f.activitygroup, 'all'))}`;

/** `callLeadBreakdownApi`: the dimensions of the six breakdown charts (the service takes them comma separated) */
export const LEAD_BREAKDOWN_DIMENSIONS = 'dimension=occupation%2Cbusinesstype%2Cdistrict%2Cchannel%2Ccountry%2Cteam%2Csaleperson';

// ---- extract helpers -------------------------------------------------------------------------------------------------

const ARRAY_KEYS = ['result', 'data', 'items', 'rows', 'list'];

/** the first of `keys` whose value is an array */
function firstArray(o: JObj, keys: readonly string[]): unknown[] | null {
  for (const k of keys) if (isArr(o[k])) return o[k] as unknown[];
  return null;
}

/** `extractArray`: a bare array, `{result: []}` / `{data: []}` …, or one level deeper (`{result: {items: []}}`); null when there is none */
export function extractArray(resp: string | null | undefined): unknown[] | null {
  if (resp == null) return null;
  const t = resp.trim();
  if (t.startsWith('[')) {
    const v = parseJson(t);
    return isArr(v) ? v : null;
  }
  if (!t.startsWith('{')) return null;
  const root = parseJson(t);
  if (!isObj(root)) return null;
  const level1 = firstArray(root, ARRAY_KEYS);
  if (level1 !== null) return level1;
  for (const k of ARRAY_KEYS) {
    const inner = root[k];
    if (!isObj(inner)) continue;
    const level2 = firstArray(inner, ARRAY_KEYS);
    if (level2 !== null) return level2;
  }
  return null;
}

/** `extractObject`: the KPI object of an answer — the root when it carries KPI keys, else `result` / `data` … (an array gives its first object) */
export function extractObject(resp: string | null | undefined): JObj | null {
  if (resp == null) return null;
  const t = resp.trim();
  if (!t.startsWith('{')) return null;
  const root = parseJson(t);
  if (!isObj(root)) return null;
  for (const k of ['total', 'closed', 'closedPct', 'avgDays', 'countriesCount', 'topCountry', 'total_leads', 'totalLeads']) if (has(root, k)) return root;
  for (const k of ['result', 'data', 'results', 'item', 'overview', 'kpi', 'kpis']) {
    if (!hasVal(root, k)) continue;
    const v = root[k];
    if (isObj(v)) return v;
    if (isArr(v) && v.length > 0 && isObj(v[0])) return v[0];
  }
  return root;
}

/** `extractTotalClosed`: `totalClosed` at the root or inside `result` / `data`; 0 when absent */
export function extractTotalClosed(resp: string | null | undefined): number {
  if (resp == null || resp.trim() === '') return 0;
  const root = parseJson(resp.trim());
  if (!isObj(root)) return 0;
  const optInt = (o: JObj): number => orgGetInt(o['totalClosed']) ?? 0;
  if (has(root, 'totalClosed')) return optInt(root);
  for (const k of ['result', 'data']) {
    const inner = root[k];
    if (isObj(inner) && has(inner, 'totalClosed')) return optInt(inner);
  }
  return 0;
}

// ---- overview charts -------------------------------------------------------------------------------------------------

/** `parseDailyTrendResponse`: `{ xAxis, series }` — sent ready-made, or built from `[{ date, count }]` */
export function parseDailyTrend(resp: string): { xAxis: unknown[]; series: unknown[] } | null {
  const t = resp.trim();
  let items: unknown[] | null = null;
  if (t.startsWith('[')) {
    const v = parseJson(t);
    if (!isArr(v)) return null;
    items = v;
  } else if (t.startsWith('{')) {
    const root = parseJson(t);
    if (!isObj(root)) return null;
    if (has(root, 'xAxis') && has(root, 'series')) {
      return isArr(root['xAxis']) && isArr(root['series']) ? { xAxis: root['xAxis'], series: root['series'] } : null;
    }
    items = firstArray(root, ARRAY_KEYS);
  }
  if (items === null) return null;
  const xAxis: unknown[] = [];
  const series: unknown[] = [];
  for (const item of items) {
    if (!isObj(item)) continue;
    const date = firstNonNullString(item, 'date', 'day', 'contact_date', 'x', 'label', 'name');
    const count = firstNonNullInt(item, 'count', 'value', 'y', 'total', 'lead', 'leads', 'amount');
    if (date === null) continue;
    xAxis.push(date);
    series.push(count);
  }
  return { xAxis, series };
}

/** `fetchGroupStepFromApi`: the donut — `[{ name, value }]` from `{ result: [{ group, count }] }` */
export function parseGroupStep(resp: string | null): { name: string; value: number }[] | null {
  const arr = extractArray(resp);
  if (arr === null || arr.length === 0) return null;
  const out: { name: string; value: number }[] = [];
  for (const el of arr) {
    const o = asObj(el);
    const name = firstNonNullString(o, 'group', 'name', 'label', 'step', 'key', 'group_step', 'groupName', 'stepName', 'activity_group', 'activityGroup');
    const value = firstNonNullInt(o, 'count', 'value', 'total', 'y', 'amount', 'leads', 'leadCount', 'lead_count', 'cnt', 'num');
    if (name === null) continue;
    out.push({ name, value });
  }
  return out.length === 0 ? null : out;
}

/** the shared shape of the three bar charts: names + values (and the sum for the CS chart) */
function bars(
  resp: string | null,
  nameKeys: string[],
  valueKeys: string[],
): { yAxis: string[]; values: number[]; total: number } | null {
  const arr = extractArray(resp);
  if (arr === null || arr.length === 0) return null;
  const yAxis: string[] = [];
  const values: number[] = [];
  let total = 0;
  for (const el of arr) {
    const o = asObj(el);
    const name = firstNonNullString(o, ...nameKeys);
    const v = firstNonNullInt(o, ...valueKeys);
    if (name === null) continue;
    yAxis.push(name);
    values.push(v);
    total += v;
  }
  return yAxis.length === 0 ? null : { yAxis, values, total };
}

/** `fetchCsPerformanceFromApi` → `{ yAxis, values, total }` */
export function parseCsPerformance(resp: string | null): { yAxis: string[]; values: number[]; total: number } | null {
  return bars(
    resp,
    ['name', 'cs', 'label', 'employee', 'emp', 'csName', 'cs_name', 'empName', 'employeeName', 'fullname', 'full_name'],
    ['value', 'count', 'total', 'leads', 'amount', 'leadCount', 'lead_count', 'cnt', 'num'],
  );
}

/** `fetchTopCountriesFromApi` → `{ yAxis, values }` */
export function parseTopCountries(resp: string | null): { yAxis: string[]; values: number[] } | null {
  const r = bars(
    resp,
    ['name', 'country', 'label', 'countryName', 'country_name', 'nation'],
    ['value', 'count', 'total', 'leads', 'amount', 'leadCount', 'lead_count', 'cnt', 'num'],
  );
  return r && { yAxis: r.yAxis, values: r.values };
}

/** `fetchLatestStepFromApi` → `{ yAxis, values }` */
export function parseLatestStep(resp: string | null): { yAxis: string[]; values: number[] } | null {
  const r = bars(
    resp,
    ['name', 'step', 'label', 'stage', 'stepName', 'step_name', 'latestStep', 'latest_step'],
    ['value', 'count', 'total', 'leads', 'amount', 'leadCount', 'lead_count', 'cnt', 'num'],
  );
  return r && { yAxis: r.yAxis, values: r.values };
}

export interface FunnelRow {
  name: string;
  total: number;
  closed: number;
  sharePct: number;
  barPct: number;
  closedOnly: boolean;
}

/**
 * `parseFunnelArrayResponse`: `[{ name, total, closed, sharePct, barPct, closedOnly }]`. `useApiPercentage` (the source funnel
 * only) takes `sharePct` from the service's own `percentage`; otherwise it is the row's share of the shown total. All rows zero
 * means "the parse found nothing" → null (the caller falls back).
 */
export function parseFunnel(resp: string | null, closedOnly: boolean, useApiPercentage: boolean): FunnelRow[] | null {
  const arr = extractArray(resp);
  if (arr === null || arr.length === 0) return null;
  let max = 1;
  let grand = 0;
  let valid = 0;
  const rows: { name: string; total: number; closed: number; apiPct: number }[] = [];
  for (const el of arr) {
    const o = asObj(el);
    const name =
      firstNonNullString(o, 'name', 'label', 'source', 'cs', 'country', 'key', 'chanel', 'channel', 'csName', 'cs_name', 'countryName', 'country_name', 'sourceName', 'source_name') ??
      '(ไม่ระบุ)';
    const total = firstNonNullInt(o, 'total', 'lead', 'leads', 'amount', 'count', 'leadCount', 'lead_count', 'totalLeads', 'total_leads', 'totalLead', 'total_lead', 'qty', 'quantity', 'num');
    const closed = firstNonNullInt(o, 'closed', 'closeAmount', 'closedCount', 'success', 'closedLeads', 'closed_leads', 'close', 'closeCount', 'close_count', 'closedLead', 'closed_lead', 'won', 'wonCount', 'wonAmount');
    const apiPct = firstNonNullDouble(o, 'percentage', 'percent', 'pct', 'rate', 'successRate', 'success_rate', 'closePercent', 'close_percent', 'sharePct');
    rows.push({ name, total, closed, apiPct });
    const v = closedOnly ? closed : total;
    if (v > max) max = v;
    grand += v;
    if (total > 0 || closed > 0) valid++;
  }
  if (valid === 0) return null;
  const round1 = (n: number): number => Math.round(n * 10) / 10;
  return rows.map((r) => {
    const v = closedOnly ? r.closed : r.total;
    const share = useApiPercentage && r.apiPct > 0 ? r.apiPct : grand > 0 ? (v * 100) / grand : 0;
    const bar = max > 0 ? (v * 100) / max : 0;
    return { name: r.name, total: r.total, closed: r.closed, sharePct: round1(share), barPct: round1(bar), closedOnly };
  });
}

// ---- tabs: steps / pipeline / status ---------------------------------------------------------------------------------

/** `DEPT_META`: code, full name, subtitle, colour — fills what the service does not send */
const DEPT_META: Record<string, [string, string, string]> = {
  CS: ['Customer Service', 'บริการหลังการขาย', '#00d4a8'],
  AN: ['Analyze Service', 'วิเคราะห์', '#9C6F63'],
  PLS: ['Pre-Loan Stage', 'ต่อยอดสู่สินเชื่อ', '#4f7cff'],
  LS: ['Loan Service', 'บริการสินเชื่อ', '#ffb84d'],
  FI: ['Financial Service', 'บริการสินเชื่อ', '#ef4444'],
  LE: ['Loan Execution', 'ทำสัญญาสินเชื่อ', '#a26bff'],
  CRM: ['CRM', 'ลูกค้าสัมพันธ์', '#f01685'],
};

export interface GroupPanel {
  code: string;
  name: string;
  subtitle: string;
  color: string;
  total: number;
  steps: { rank: number; name: string; count: number; pct: number }[];
}

/** `fetchActivityGroupFromApi`: the panels of the tab "กลุ่มขั้นตอน" in the order the service sends them (group "000" dropped) */
export function parseActivityGroup(resp: string | null): GroupPanel[] | null {
  if (resp == null || resp.trim() === '') return null;
  const raw = extractArray(resp);
  if (raw === null || raw.length === 0) return null;
  const out: GroupPanel[] = [];
  for (const item of raw) {
    if (!isObj(item)) continue;
    let code = firstNonNullString(item, 'code', 'group', 'groupCode', 'deptCode', 'department', 'key');
    if (code === null) continue;
    code = code.trim().toUpperCase();
    if (code === '000') continue;
    const meta = Object.hasOwn(DEPT_META, code) ? DEPT_META[code] : undefined;
    const apiName = firstNonNullString(item, 'groupName', 'name', 'groupname', 'title');
    const apiSubtitle = firstNonNullString(item, 'groupDescription', 'subtitle', 'description', 'desc', 'group_description');
    const name = apiName !== null && apiName.trim() !== '' ? apiName : (meta?.[0] ?? code);
    const subtitle = apiSubtitle !== null && apiSubtitle.trim() !== '' ? apiSubtitle : (meta?.[1] ?? '');
    const color = meta?.[2] ?? '#4f7cff';
    let total = firstNonNullInt(item, 'total', 'count', 'leads', 'lead', 'totalLeads', 'total_leads', 'leadCount', 'lead_count', 'amount');
    const steps: GroupPanel['steps'] = [];
    const stepsArr = ['steps', 'items', 'list', 'rows', 'data', 'activities'].map((k) => item[k]).find((v) => isArr(v)) as unknown[] | undefined;
    if (stepsArr) {
      let rank = 1;
      for (const s of stepsArr) {
        if (!isObj(s)) continue;
        const stepName = firstNonNullString(s, 'name', 'stepName', 'step_name', 'label', 'title', 'step', 'activityName', 'activity_name');
        const count = firstNonNullInt(s, 'count', 'value', 'total', 'lead', 'leads', 'leadCount', 'lead_count', 'amount', 'num', 'cnt');
        if (stepName === null) continue;
        steps.push({ rank: rank++, name: stepName, count, pct: total > 0 ? Math.round((count * 1000) / total) / 10 : 0 });
      }
    }
    if (total === 0 && steps.length > 0) total = steps.reduce((sum, s) => sum + s.count, 0);
    out.push({ code, name, subtitle, color, total, steps });
  }
  // every panel at 0 = the parse found nothing
  return out.reduce((sum, p) => sum + p.total, 0) === 0 ? null : out;
}

export const MONTH_TH = ['มกราคม', 'กุมภาพันธ์', 'มีนาคม', 'เมษายน', 'พฤษภาคม', 'มิถุนายน', 'กรกฎาคม', 'สิงหาคม', 'กันยายน', 'ตุลาคม', 'พฤศจิกายน', 'ธันวาคม'];
const DEPT_LIST = ['CS', 'PLS', 'LS', 'LE', 'CRM'];

/** `_deptColorOf`: the colour of a department on the status KPI cards and the pipeline legend */
export function deptColorOf(code: string | null | undefined): string {
  if (code == null) return '#4f7cff';
  switch (code.trim().toUpperCase()) {
    case 'CS': return '#00d4a8';
    case 'PLS': return '#4f7cff';
    case 'LS': return '#ffb84d';
    case 'LE': return '#a26bff';
    case 'CRM': return '#f01685';
    case 'FI': return '#3ad6dd';
    default: return '#4f7cff';
  }
}

/** `_readPipelineGroups`: group codes from `["CS"]` or `[{ code: "CS" }]`, upper-cased, without duplicates */
function readPipelineGroups(raw: unknown[] | null): string[] {
  const groups: string[] = [];
  if (raw === null) return groups;
  for (const item of raw) {
    let code: string | null = null;
    if (isObj(item)) code = firstNonNullString(item, 'code', 'group', 'deptCode', 'department', 'name', 'label', 'value', 'key');
    else if (item !== null && item !== undefined) code = isArr(item) ? JSON.stringify(item) : String(item);
    if (code === null) continue;
    code = code.trim().toUpperCase();
    if (code === '') continue;
    if (!groups.includes(code)) groups.push(code);
  }
  return groups;
}

/** `_jsonIntValue`: a number or numeric text, rounded; anything else 0 */
function jsonIntValue(v: unknown): number {
  if (v === null || v === undefined) return 0;
  if (typeof v === 'number') return i32(Math.round(v));
  const d = javaParseDouble(isObj(v) || isArr(v) ? JSON.stringify(v) : String(v));
  return d === undefined ? 0 : i32(Math.round(d));
}

/** `_readDeptInt`: the count of a department under any of the spellings the service used (CS / cs / CSCount / cs_count / CSTotal …) */
function readDeptInt(o: JObj | null, dept: string): number {
  if (o === null) return 0;
  const lower = dept.toLowerCase();
  for (const k of [dept, lower, dept + 'Count', lower + 'Count', dept + '_count', lower + '_count', dept + 'Total', lower + 'Total']) {
    if (!hasVal(o, k)) continue;
    const a = orgGetInt(o[k]);
    if (a !== undefined) return a;
    const d = orgGetDouble(o[k]);
    if (d !== undefined) return i32(Math.round(d));
  }
  return 0;
}

const pad2 = (n: number): string => (n < 10 ? '0' : '') + n;

/**
 * `fetchPipelineFromApi`: the matrix of the tab Pipeline. Accepts `{ result: { months: [], groups: [], yearTotal } }`, a root
 * level `months`, or a bare array of months; month rows hold `values` as an object, an array in the order of `groups`, or the
 * departments as flat keys. `groups`/`months` are the new names, `departments`/`rows` the same data under the old ones.
 * `yearTotal` of the service (when present) replaces the sums computed here. A grand total of 0 counts as a failed parse.
 */
export function parsePipeline(resp: string | null, yearStr: string, page = 1): JObj | null {
  if (resp == null || resp.trim() === '') return null;
  let currentPage = page;
  let totalPages = 1;
  const t = resp.trim();
  let rawRows: unknown[] | null = null;
  let rawGroups: unknown[] | null = null;
  let pipelineObj: JObj | null = null;
  const ARR_KEYS = ['months', 'items', 'rows', 'data', 'list'];
  const first = firstArray;
  const groupsOf = (o: JObj): unknown[] | null => (isArr(o['groups']) ? o['groups'] : isArr(o['departments']) ? o['departments'] : null);

  if (t.startsWith('[')) {
    const v = parseJson(t);
    if (!isArr(v)) return null;
    rawRows = v;
  } else if (t.startsWith('{')) {
    const root = parseJson(t);
    if (!isObj(root)) return null;
    pipelineObj = root;
    rawRows = first(root, ARR_KEYS);
    rawGroups = groupsOf(root);
    if (has(root, 'currentPage')) currentPage = firstNonNullInt(root, 'currentPage');
    if (has(root, 'totalPages')) totalPages = firstNonNullInt(root, 'totalPages');
    if (rawRows === null) {
      for (const wk of ['result', 'data']) {
        const inner = root[wk];
        if (!isObj(inner)) continue;
        pipelineObj = inner;
        rawRows = first(inner, ARR_KEYS);
        rawGroups = groupsOf(inner);
        if (has(inner, 'currentPage')) currentPage = firstNonNullInt(inner, 'currentPage');
        if (has(inner, 'totalPages')) totalPages = firstNonNullInt(inner, 'totalPages');
        if (rawRows !== null) break;
      }
    }
  } else {
    return null;
  }
  if (rawRows === null || rawRows.length === 0) return null;

  const yearInt = /^[+-]?\d+$/.test(yearStr.trim()) ? Number(yearStr.trim()) : 2026;
  let groupList = readPipelineGroups(rawGroups);
  if (groupList.length === 0) groupList = [...DEPT_LIST];

  const months: JObj[] = [];
  const rows: JObj[] = [];
  const totals: number[] = groupList.map(() => 0);
  let grand = 0;
  for (const item of rawRows) {
    if (!isObj(item)) continue;
    const monthNum = firstNonNullInt(item, 'month', 'm', 'monthNum', 'month_num', 'monthNumber', 'month_number');
    if (monthNum < 1 || monthNum > 12) continue;
    const monthKey = pad2(monthNum);
    let monthLabel = firstNonNullString(item, 'label', 'monthLabel', 'month_label', 'name', 'title', 'display');
    if (monthLabel === null || monthLabel.trim() === '') monthLabel = `${MONTH_TH[monthNum - 1]}  ${yearInt}`;

    let valuesObj: JObj | null = null;
    let valuesArr: unknown[] | null = null;
    if (hasVal(item, 'values') && isObj(item['values'])) valuesObj = item['values'];
    else if (hasVal(item, 'values') && isArr(item['values'])) valuesArr = item['values'];
    else if (hasVal(item, 'departments') && isObj(item['departments'])) valuesObj = item['departments'];
    else if (hasVal(item, 'groups') && isObj(item['groups'])) valuesObj = item['groups'];
    else if (hasVal(item, 'groups') && isArr(item['groups'])) valuesArr = item['groups'];

    const vals: Record<string, number> = {};
    let rowTotalFromValues = 0;
    groupList.forEach((dept, di) => {
      let v: number;
      if (valuesArr !== null && di < valuesArr.length) v = jsonIntValue(valuesArr[di]);
      else if (valuesObj !== null) v = readDeptInt(valuesObj, dept);
      else v = readDeptInt(item, dept);
      vals[dept] = v;
      totals[di] += v;
      rowTotalFromValues += v;
    });
    const apiRowTotal = firstNonNullInt(item, 'total', 'rowTotal', 'sum', 'amount');
    const rowTotal = apiRowTotal > 0 ? apiRowTotal : rowTotalFromValues;
    months.push({ month: monthKey, label: monthLabel, values: vals, total: rowTotal });
    rows.push({ month: monthKey, monthLabel, values: vals, total: rowTotal });
    grand += rowTotal;
  }

  let totalsObj: Record<string, number> = {};
  groupList.forEach((d, i) => (totalsObj[d] = totals[i]));
  const yearTotal = pipelineObj !== null && hasVal(pipelineObj, 'yearTotal') ? pipelineObj['yearTotal'] : undefined;
  if (isObj(yearTotal)) {
    if (hasVal(yearTotal, 'values') && isObj(yearTotal['values'])) {
      const yv = yearTotal['values'];
      totalsObj = {};
      for (const d of groupList) totalsObj[d] = readDeptInt(yv, d);
    }
    const apiGrand = firstNonNullInt(yearTotal, 'total', 'grandTotal', 'sum', 'amount');
    if (apiGrand > 0) grand = apiGrand;
  }
  if (grand === 0) return null; // every cell 0 = the parse found nothing

  const deptColors: Record<string, string> = {};
  for (const d of groupList) deptColors[d] = deptColorOf(d);
  return {
    groups: groupList,
    departments: groupList,
    months,
    rows,
    totals: totalsObj,
    grandTotal: grand,
    deptColors,
    currentPage,
    totalPages: totalPages > 0 ? totalPages : 1,
  };
}

/** `fetchStageSummaryFromApi`: the KPI cards of the tab "สถานะ" — the service's names mapped to the page's, SLA fields kept only when sent */
export function parseStageSummary(resp: string | null): JObj[] | null {
  const arr = extractArray(resp);
  if (arr === null || arr.length === 0) return null;
  const out: JObj[] = [];
  for (const el of arr) {
    const o = asObj(el);
    const group = firstNonNullString(o, 'group', 'code', 'deptCode', 'department', 'name');
    if (group === null) continue;
    const k: JObj = {
      code: group,
      name: group,
      color: deptColorOf(group),
      pending: firstNonNullInt(o, 'pendingCount', 'pending', 'pendingLeads'),
      pendingAvg: firstNonNullDouble(o, 'avgPendingDays', 'pendingAvg', 'pendingAverageDays'),
      completed: firstNonNullInt(o, 'completedCount', 'completed', 'completedLeads'),
      completedAvg: firstNonNullDouble(o, 'avgCompletedDays', 'completedAvg', 'completedAverageDays'),
    };
    // null = "no SLA data yet", not 0 = "exactly on SLA": the keys are copied only when the service sent a value (copyNullable)
    for (const key of ['sla', 'slaUnit', 'slaDriftPending', 'slaDriftCompleted']) if (hasVal(o, key)) k[key] = o[key];
    out.push(k);
  }
  return out.length === 0 ? null : out;
}

/** `fetchLeadBreakdownFromApi`: the `result` object of the answer as is; `{}` when the call failed */
export function parseLeadBreakdown(resp: string | null): JObj {
  return extractObject(resp) ?? {};
}

// ---- overview KPI (the chart "kpi" of chart-single) -----------------------------------------------------------------

/** the numbers of `DashboardBean` the KPI cards read; `buildEmptyStats()` is where every request starts */
export interface KpiStats {
  total: number;
  closed: number;
  closedPct: number;
  avgDays: number;
  countriesCount: number;
  topCountry: string;
  csClose: number;
}
export const emptyKpiStats = (): KpiStats => ({ total: 0, closed: 0, closedPct: 0, avgDays: 0, countriesCount: 0, topCountry: '-', csClose: 0 });

function readNested<T>(root: JObj, outer: string[], inner: string[], read: (o: JObj, ...k: string[]) => T, ok: (v: T) => boolean): T | undefined {
  for (const k of outer) {
    if (!hasVal(root, k)) continue;
    const v = root[k];
    if (!isObj(v)) continue;
    const r = read(v, ...inner);
    if (ok(r)) return r;
  }
  return undefined;
}

/**
 * `fetchOverviewFromApi`: reads `{ alllead, close_success, avgDaysToClose, country, cs_close }` (or flat keys) into `stats`.
 * Returns false — and leaves `stats` alone — when every KPI is 0 / empty.
 */
export function applyOverview(resp: string | null, stats: KpiStats): boolean {
  if (resp == null || resp.trim() === '') return false;
  const root = extractObject(resp);
  if (root === null) return false;
  const positive = (n: number): boolean => n > 0;
  const text = (s: string | null): boolean => s !== null && s !== '';
  let total = readNested(root, ['alllead', 'all_lead', 'totalLead', 'total_lead', 'totalLeads', 'leads'], ['total', 'count', 'value', 'qty'], firstNonNullInt, positive) ?? 0;
  let closed = readNested(root, ['close_success', 'closeSuccess', 'closed', 'won'], ['total', 'count', 'value', 'closed', 'won'], firstNonNullInt, positive) ?? 0;
  let closedPct = readNested(root, ['close_success', 'closeSuccess', 'closedPct', 'successRate'], ['percent', 'percentage', 'pct', 'rate'], firstNonNullDouble, positive) ?? 0;
  let avgDays = readNested(root, ['avgDaysToClose', 'avg_days_to_close', 'avgDays', 'averageDays'], ['total', 'value', 'days', 'avg'], firstNonNullDouble, positive) ?? 0;
  let countries = readNested(root, ['country', 'countries', 'topCountry'], ['countryCount', 'countries_count', 'countriesCount', 'country_count', 'count', 'total', 'value'], firstNonNullInt, positive) ?? 0;
  let topCountry: string | null =
    readNested(root, ['country', 'countries', 'topCountry'], ['topCountry', 'top_country', 'topCountryName', 'name', 'country', 'countryName', 'country_name', 'label'], firstNonNullString, text) ?? null;
  const csClose = readNested(root, ['cs_close', 'csClose', 'csCloseSuccess', 'cs_close_success'], ['total', 'count', 'value', 'amount'], firstNonNullInt, positive) ?? 0;

  // the same numbers as flat keys of the root
  if (total <= 0) total = firstNonNullInt(root, 'total', 'totalLeads', 'total_leads', 'leads', 'lead', 'count', 'amount', 'qty', 'leadCount', 'lead_count');
  if (closed <= 0) closed = firstNonNullInt(root, 'closed', 'closedCount', 'closedLeads', 'won', 'wonCount', 'success');
  if (closedPct <= 0) closedPct = firstNonNullDouble(root, 'closedPct', 'closed_pct', 'closedPercent', 'percentage', 'pct', 'percent');
  if (avgDays <= 0) avgDays = firstNonNullDouble(root, 'avgDays', 'avg_days', 'averageDays', 'avgDayToClose');
  if (countries <= 0) countries = firstNonNullInt(root, 'countriesCount', 'countries', 'countryCount', 'totalCountries');
  if (topCountry === null || topCountry === '') topCountry = firstNonNullString(root, 'topCountry', 'top_country', 'topCountryName', 'leadingCountry');
  if (closedPct <= 0 && total > 0 && closed > 0) closedPct = Math.round(((closed * 100) / total) * 10) / 10;

  if (!(total > 0 || closed > 0 || countries > 0 || (topCountry !== null && topCountry !== ''))) return false;
  if (total > 0) stats.total = total;
  stats.closed = closed; // the service is trusted for closed / closedPct even when 0
  stats.closedPct = closedPct;
  if (avgDays > 0) stats.avgDays = avgDays;
  if (countries > 0) stats.countriesCount = countries;
  if (topCountry !== null && topCountry !== '') stats.topCountry = topCountry;
  stats.csClose = csClose;
  return true;
}

/** `getKpiTotalFmt()` … : `String.format("%,d")` */
export const formatInt = (n: number): string => Number(n || 0).toLocaleString('en-US');

/** the `kpi` object of `fetchSingleChart` (and of the old `fetchOverviewKpiJson`) */
export function kpiSummary(s: KpiStats): JObj {
  return {
    total: s.total,
    totalFmt: formatInt(s.total),
    closed: s.closed,
    closedFmt: formatInt(s.closed),
    closedPct: s.closedPct,
    closedPctFmt: s.closedPct.toFixed(1),
    avgDays: s.avgDays,
    avgDaysFmt: s.avgDays.toFixed(1),
    countries: s.countriesCount,
    topCountry: s.topCountry,
    csClose: s.csClose,
    csCloseFmt: formatInt(s.csClose),
  };
}

/** `getSourceFunnelSubtitle()` and its two siblings: the service's `totalClosed`, else the closed count of the KPI stats (0 here) */
export const funnelSubtitle = (totalClosed: number, kpiClosed = 0): string => `${formatInt(totalClosed > 0 ? totalClosed : kpiClosed)} ลีดที่ปิดได้`;

// ---- master data -----------------------------------------------------------------------------------------------------

/** `THAI_MONTH_ABBREV` (index 0 unused) */
const THAI_MONTH_ABBREV = ['', 'ม.ค.', 'ก.พ.', 'มี.ค.', 'เม.ย.', 'พ.ค.', 'มิ.ย.', 'ก.ค.', 'ส.ค.', 'ก.ย.', 'ต.ค.', 'พ.ย.', 'ธ.ค.'];

export interface Option {
  value: string;
  label: string;
}

/**
 * `buildMonthsJsonFromArray`: `[{ year, month }]` (or numbers / numeric text) → the distinct months 1–12, ascending,
 * `value` = the number, `label` = the Thai abbreviation
 */
export function buildMonthsFromArray(raw: unknown[]): Option[] {
  const months = new Set<number>();
  for (const item of raw) {
    let n = 0;
    if (isObj(item)) n = firstNonNullInt(item, 'month', 'm', 'monthNum', 'month_num', 'monthNumber', 'month_number', 'value', 'id');
    else if (typeof item === 'number' && Number.isInteger(item)) n = item;
    else if (typeof item === 'string') n = orgGetInt(item.trim()) ?? 0;
    if (n >= 1 && n <= 12) months.add(n);
  }
  return [...months].sort((a, b) => a - b).map((m) => ({ value: String(m), label: THAI_MONTH_ABBREV[m] }));
}

/**
 * `normalizeMasterData`: any of the answer shapes (`["a"]`, `[{ id, name }]`, `[{ code, desc }]`, `{ result: [] }` …) → `[{ value, label }]`.
 * Months become the Thai abbreviations; occupations use the name as the value (the service sends `code: "0"` for all of them).
 */
export function normalizeMasterData(resp: string, endpoint: string): Option[] {
  const t = resp.trim();
  let raw: unknown[] | null = null;
  if (t.startsWith('[')) {
    const v = parseJson(t);
    if (!isArr(v)) return [];
    raw = v;
  } else if (t.startsWith('{')) {
    const root = parseJson(t);
    if (!isObj(root)) return [];
    raw = firstArray(root, ARRAY_KEYS);
  }
  if (raw === null) return [];

  if (endpoint === 'months') return buildMonthsFromArray(raw);

  if (endpoint === 'occupation') {
    const out: Option[] = [];
    for (const item of raw) {
      let name: string | null = null;
      if (typeof item === 'string') name = item;
      else if (isObj(item)) name = firstNonNullString(item, 'name', 'label', 'desc', 'description', 'display', 'text', 'title');
      if (name === null || name.trim() === '') continue;
      out.push({ value: name, label: name });
    }
    return out;
  }

  const out: Option[] = [];
  for (const item of raw) {
    if (typeof item === 'string' || (typeof item === 'number' && Number.isInteger(item))) {
      out.push({ value: String(item), label: String(item) });
    } else if (isObj(item)) {
      let value = firstNonNullString(item, 'value', 'id', 'code', 'key', 'year', 'month');
      let label = firstNonNullString(item, 'label', 'name', 'desc', 'description', 'display', 'text', 'title');
      if (value === null) value = label;
      if (label === null) label = value;
      if (value === null || label === null) continue;
      out.push({ value, label });
    }
  }
  return out;
}

// ---- first paint -----------------------------------------------------------------------------------------------------

/** the values of `DashboardInitial` that `applySafeDefaultJson()` sets (the other ten are the master lists and the texts) */
export interface EmptyInitial {
  trendJson: unknown;
  groupJson: unknown;
  csJson: unknown;
  topCountriesJson: unknown;
  stepJson: unknown;
  sourceFunnelJson: unknown;
  csFunnelJson: unknown;
  countryFunnelJson: unknown;
  groupPanelsJson: unknown;
  pipelineTableJson: unknown;
  pipelinePeopleJson: unknown;
  statusKpisJson: unknown;
  statusEmployeesJson: unknown;
  statusPopupJson: unknown;
  leadsTableJson: unknown;
}

/** `applySafeDefaultJson()`: the empty JSON of every chart value (fresh objects each call — the page mutates what it is given) */
export function emptyInitialJson(): EmptyInitial {
  return {
    trendJson: { xAxis: [], series: [] },
    groupJson: [],
    csJson: { yAxis: [], values: [], total: 0 },
    topCountriesJson: { yAxis: [], values: [] },
    stepJson: { yAxis: [], values: [] },
    sourceFunnelJson: [],
    csFunnelJson: [],
    countryFunnelJson: [],
    groupPanelsJson: [],
    pipelineTableJson: { groups: [], departments: [], deptColors: {}, months: [], rows: [], totals: {}, grandTotal: 0 },
    pipelinePeopleJson: {},
    statusKpisJson: [],
    statusEmployeesJson: {},
    statusPopupJson: {},
    leadsTableJson: { rows: [], totalRows: 0 },
  };
}

// ---- widget layout (DashboardWidgetLayoutServlet) --------------------------------------------------------------------

/** the fixed widget ids of the overview; milestone cards are `ms:<label>` (label from the live answer, so not listed) */
const ALLOWED_WIDGET_IDS = new Set(['kpiTotal', 'kpiCountries', 'chartTrend', 'chartGroup', 'chartCS', 'chartCountry', 'funnelSource', 'chartStep', 'funnelCs', 'funnelCountry']);
const MILESTONE_ID_PREFIX = 'ms:';
const MILESTONE_ID_MAX_LEN = 200;
/** the page name in a storage key — letters, digits, `_` and `-` only (Java: SAFE_KEY, also the file name guard) */
const SAFE_KEY = /^[A-Za-z0-9_-]{1,64}$/;

export const isAllowedWidgetId = (id: string): boolean =>
  ALLOWED_WIDGET_IDS.has(id) || (id.startsWith(MILESTONE_ID_PREFIX) && id.length > MILESTONE_ID_PREFIX.length && id.length <= MILESTONE_ID_MAX_LEN);

/** `sanitize(page, "overview")` */
export const layoutPageOf = (raw: string | null): string => {
  const v = (raw ?? '').trim();
  return v !== '' && SAFE_KEY.test(v) ? v : 'overview';
};

export interface WidgetLayoutEntry {
  id: string;
  visible: boolean;
  order: number;
}

/** `optBoolean(key, true)`: a boolean or "true" / "false" in any case; anything else keeps the default */
function optBoolean(v: unknown, def: boolean): boolean {
  if (typeof v === 'boolean') return v;
  if (typeof v === 'string') {
    if (v.toLowerCase() === 'true') return true;
    if (v.toLowerCase() === 'false') return false;
  }
  return def;
}

/**
 * The POST of the layout: the body must be an object with a `widgets` array; entries with an unknown id (or that are not
 * objects) are dropped silently, the rest are reduced to `{ id, visible, order }` (visible defaults to true, order to the index).
 */
export function sanitizeWidgetLayout(body: string): { ok: true; widgets: WidgetLayoutEntry[] } | { ok: false; error: string } {
  let parsed: unknown;
  try {
    parsed = JSON.parse(body.trim());
  } catch (e) {
    return { ok: false, error: `invalid JSON body: ${String((e as Error).message)}`.replace(/"/g, "'") };
  }
  if (!isObj(parsed)) return { ok: false, error: "invalid JSON body: A JSONObject text must begin with '{'" };
  const list = parsed['widgets'];
  if (!isArr(list)) return { ok: false, error: `invalid JSON body: ไม่มี field 'widgets' หรือไม่ใช่ array` };
  const widgets: WidgetLayoutEntry[] = [];
  list.forEach((w, i) => {
    if (!isObj(w)) return;
    const id = optString(w, 'id', '');
    if (!isAllowedWidgetId(id)) return;
    widgets.push({ id, visible: optBoolean(w['visible'], true), order: orgGetInt(w['order']) ?? i });
  });
  return { ok: true, widgets };
}

// ---- calendar + KPI event movements (CalendarDashboardView / CalendarDashboardBean) ---------------------------------------

export interface CalendarEvent {
  id: string;
  title: string;
  date: string;
  start: string | null;
  end: string | null;
  allDay: boolean;
  type: string;
  color: string;
  calendar: string;
  reminderMinutes: number;
  description: string;
}

/**
 * The name of a calendar whose schedule has no title. Java used the name of one developer here; a neutral text instead
 * (the page only shows it as the calendar's label).
 */
const DEFAULT_CALENDAR_NAME = 'ปฏิทินของฉัน';

const trimmed = (o: JObj, k: string): string => nvl(optString(o, k, '')).trim();
const cutAt = (s: string, ch: string): string => (s.includes(ch) ? s.substring(0, s.indexOf(ch)) : s);
const hhmm = (raw: string): string | null => (raw.length >= 5 ? raw.substring(0, 5) : raw === '' ? null : raw);

/** `fromCalendarScheduleJSON`: one schedule of the service → one event per task of `task_list` (or one from its own date) */
export function fromCalendarSchedule(sched: JObj): CalendarEvent[] {
  const out: CalendarEvent[] = [];
  const schedId = String(optLong(sched, 'id', 0));
  // the new service names the schedule `name`; `title_group` (the old service) still wins when it is there
  let titleGroup = trimmed(sched, 'title_group');
  if (titleGroup === '') titleGroup = trimmed(sched, 'name');
  if (titleGroup === '') titleGroup = trimmed(sched, 'movementtype');
  const calName = titleGroup === '' ? DEFAULT_CALENDAR_NAME : titleGroup;

  const taskList = sched['task_list'];
  if (isArr(taskList) && taskList.length > 0) {
    taskList.forEach((task, j) => {
      if (!isObj(task)) return;
      const evId = `${schedId}-${optLong(task, 'id', j)}`;
      let title = trimmed(task, 'title_task');
      if (title === '') title = titleGroup === '' ? 'กิจกรรม' : titleGroup;

      let date = trimmed(task, 'appointment_date');
      if (date === '') date = trimmed(sched, 'appointment_date');
      if (date === '') date = trimmed(task, 'start_repeat');
      date = cutAt(cutAt(date, 'T'), ' ');
      if (date === '') return;

      let rawTime = trimmed(task, 'appointment_time');
      if (rawTime === '') rawTime = trimmed(sched, 'appointment_time');
      if (rawTime === '') rawTime = trimmed(task, 'repeat_time');
      const start = hhmm(rawTime);

      const stop = trimmed(task, 'stop_repat');
      let end: string | null = null;
      if (stop.includes(' ')) {
        const tp = stop.substring(stop.indexOf(' ') + 1);
        end = tp.length >= 5 ? tp.substring(0, 5) : tp;
      }
      if (end !== null && end === start) end = null;
      out.push({ id: evId, title, date, start, end, allDay: start === null, type: 'event', color: 'blue', calendar: calName, reminderMinutes: 0, description: trimmed(task, 'description_task') });
    });
  } else {
    let ct = trimmed(sched, 'appointment_date');
    if (ct === '') ct = trimmed(sched, 'createtime');
    const date = cutAt(cutAt(ct, ' '), 'T');
    const start = hhmm(trimmed(sched, 'appointment_time'));
    if (date !== '') {
      out.push({ id: schedId, title: titleGroup === '' ? 'กิจกรรม' : titleGroup, date, start, end: null, allDay: start === null, type: 'event', color: 'blue', calendar: calName, reminderMinutes: 0, description: '' });
    }
  }
  return out;
}

/** `parseCalendarResponse`: the schedules of the answer → events. null when the answer has no list at all */
export function parseCalendarResponse(text: string): CalendarEvent[] | null {
  const t = text.trim();
  let schedules: unknown[] | null = null;
  if (t.startsWith('[')) {
    const v = parseJson(t);
    schedules = isArr(v) ? v : null;
  } else {
    const root = parseJson(t);
    if (!isObj(root)) return null;
    for (const k of ['result', 'data', 'items', 'events', 'list', 'content', 'rows']) {
      if (!hasVal(root, k)) continue;
      // Java getJSONArray: a value that is not an array throws → the whole parse fails
      if (!isArr(root[k])) return null;
      schedules = root[k] as unknown[];
      break;
    }
  }
  if (schedules === null) return null;
  const events: CalendarEvent[] = [];
  for (const s of schedules) if (isObj(s)) events.push(...fromCalendarSchedule(s));
  return events;
}

/** `myTaskArrayFromJSON` / `calendarListFromJSON`: `[{ id, code, name }]` from `{ result: [] }` or a bare array; entries with no name and no code are dropped */
export function myTaskArrayFromJson(text: string | null): JObj[] {
  if (text == null || text.trim() === '') return [];
  const t = text.trim();
  let arr: unknown[] | null = null;
  if (t.startsWith('[')) {
    const v = parseJson(t);
    arr = isArr(v) ? v : null;
  } else {
    const root = parseJson(t);
    if (!isObj(root)) return [];
    for (const k of ['result', 'data', 'items', 'list', 'content']) {
      if (!hasVal(root, k)) continue;
      arr = isArr(root[k]) ? (root[k] as unknown[]) : null;
      break;
    }
  }
  if (arr === null) return [];
  const out: JObj[] = [];
  for (const o of arr) {
    if (!isObj(o)) continue;
    let name = trimmed(o, 'name');
    if (name === '') name = trimmed(o, 'code');
    if (name === '') continue;
    const item: JObj = {};
    // org.json `put(key, null)` removes the key: an event without an id has no `id`
    if (o['id'] !== undefined) item['id'] = o['id'];
    item['code'] = nvl(optString(o, 'code', ''));
    item['name'] = name;
    out.push(item);
  }
  return out;
}

/** one master item of the KPI dropdowns (`MasterItem.fromJSON`): `{ id, code, name }` */
export function masterItem(o: JObj): { id: number; code: string; name: string } {
  return { id: optLong(o, 'id', 0), code: optString(o, 'code', ''), name: optString(o, 'name', '') };
}

/** `fetchMasterList`: the `result` array of a master answer as items; null when the answer is unusable */
export function parseMasterList(text: string | null): { id: number; code: string; name: string }[] | null {
  if (text == null || text.trim() === '') return null;
  const root = parseJson(text);
  if (!isObj(root) || !hasVal(root, 'result') || !isArr(root['result'])) return null;
  const items = [];
  for (const o of root['result']) {
    if (!isObj(o)) return null; // getJSONObject throws
    items.push(masterItem(o));
  }
  return items;
}

/** `KPI_COLUMNS`: field, title, type */
export const KPI_COLUMNS: readonly (readonly [string, string, string])[] = [
  ['txno', 'เลขที่เอกสาร', 'String'],
  ['pillar', 'Pillar', 'String'],
  ['kpitasktype', 'ประเภทงาน', 'Reference'],
  ['kpijobtitle', 'หัวข้องาน', 'Reference'],
  ['kpiproduct', 'บริการ', 'Reference'],
  ['prospect', 'ลูกค้า', 'Reference'],
  ['startdate', 'วันที่เริ่มกิจกรรม', 'Date'],
  ['detail', 'รายละเอียด', 'String'],
  ['closedate', 'วันที่ปิดกิจกรรม', 'Date'],
  ['eventstatus', 'สถานะ', 'Select:String'],
  ['solution', 'สรุปการดำเนินงาน', 'String'],
  ['channel', 'ช่องทาง', 'String'],
  ['priority', 'ระดับ', 'Select:String'],
  ['kpitopic', 'หัวข้อ KPI', 'String'],
  ['keyfigure', 'key figure', 'Number'],
  ['kpiunit', 'KPI Unit', 'String'],
  ['responsibleby', 'ผู้รับผิดชอบ', 'Reference'],
  ['createby', 'ผู้จัดทำ', 'Reference'],
  ['createtime', 'เวลาที่สร้างเอกสาร', 'Timestamp'],
];

/** `KPI_EVENT_STATUS`: the status options when no record carries a status */
export const KPI_EVENT_STATUS = ['เปิดงาน', 'กำลังดำเนินการ', 'รอตรวจสอบ', 'ปิดงาน'];

/** `idStr`: an id of the service as text — 0 / missing → "" */
const idStr = (o: JObj, k: string): string => {
  const v = optLong(o, k, 0);
  return v > 0 ? String(v) : '';
};

const DATETIME_RE = /^(\d{4}-\d{2}-\d{2})(?:[ T](\d{2}:\d{2})(?::(\d{2}))?)?/;

/**
 * `parseApiDateTime` + the `yyyy-MM-dd HH:mm:ss` of `toKpiJSONObject` for the creation time: "2026-09-17T06:36:12" and
 * "2026-09-17 06:36" both give "2026-09-17 06:36:12" / "2026-09-17 06:36:00"; a date alone gives midnight; junk gives null.
 */
function formatCreateTime(s: string): string | null {
  const m = DATETIME_RE.exec(s.trim());
  return m ? `${m[1]} ${m[2] ?? '00:00'}:${m[3] ?? '00'}` : null;
}

/**
 * The start / close date of a record. Java parsed them with `SimpleDateFormat("yyyy-MM-dd")` and wrote the date part only;
 * the column is a date + time control (`datetime`) and the page's own mapper keeps the full text, so the time is kept here
 * (the date part is identical). Not a date → null.
 */
function formatApiDate(s: string): string | null {
  const m = DATETIME_RE.exec(s.trim());
  if (!m) return null;
  return m[2] ? `${m[1]} ${m[2]}:${m[3] ?? '00'}` : m[1];
}

const arrayOrEmpty = (v: unknown): unknown[] => (isArr(v) ? v : []);

/**
 * `fromEventMovementJSON` + `toKpiJSONObject`: one record of `eventmovements` → the row the KPI table keeps.
 * The page's own mapper (`mapEventToKpiRecord`, used when it reloads the list) also fills `channelId`, `priorityId`,
 * `createByName` and `targetDate`, and the dropdown value of the topic / unit: they are set here too so that the first paint and a
 * reload give the same rows.
 */
export function toKpiRecord(api: JObj): JObj {
  const txnoRaw = optString(api, 'txno', '') || optString(api, 'refDocNo', '');
  const refdocno = txnoRaw !== '' ? txnoRaw : hasVal(api, 'id') ? String(optLong(api, 'id', 0)) : '';
  const channel = optString(api, 'contactChannelName', '') || optString(api, 'channel', '');
  const priority = optString(api, 'kpiLevelName', '') || optString(api, 'priority', '');
  const responsibleby = optString(api, 'assingToName', '') || optString(api, 'responsibleName', '');
  const createby = optString(api, 'createByName', '') || optString(api, 'createBy', '');
  const createTime = optString(api, 'createTime', '');
  return {
    createtime: createTime !== '' ? formatCreateTime(createTime) : null,
    refdocno,
    txno: refdocno,
    pillar: optString(api, 'pillar', ''),
    pillarId: idStr(api, 'pillarId'),
    pillarCode: optString(api, 'pillarCode', ''),
    flow_refdoctype: '',
    flow_refdocno: '',
    parent_refdoctype: '',
    parent_refdocno: '',
    createby,
    createByName: createby,
    role_owner: '',
    role_destination: '',
    movementtype: '',
    kpitasktype: optString(api, 'kpiTaskTypeName', ''),
    kpijobtitle: optString(api, 'kpiPilerTaskName', ''),
    prospect: optString(api, 'prospectName', ''),
    kpiproduct: optString(api, 'kpiProductName', ''),
    detail: optString(api, 'detail', ''),
    solution: optString(api, 'solution', ''),
    eventstatus: optString(api, 'eventStatus', ''),
    startdate: formatApiDate(optString(api, 'startDate', '')),
    closedate: formatApiDate(optString(api, 'closeDate', '')),
    targetClose: optString(api, 'targetClose', ''),
    targetDate: optString(api, 'targetClose', ''),
    channel,
    channelId: idStr(api, 'contactChannelId'),
    priority,
    priorityId: idStr(api, 'kpiLevelId'),
    kpitopic: optString(api, 'kpiTopic', ''),
    kpitopicId: idStr(api, 'kpiTopicId'),
    keyfigure: optString(api, 'keyFigure', ''),
    kpiunit: optString(api, 'kpiUnit', ''),
    kpiunitId: idStr(api, 'kpiUnitId'),
    responsibleby,
    kpitasktypeId: idStr(api, 'kpiTaskTypeId'),
    kpijobtitleId: idStr(api, 'kpiPilerTaskId'),
    prospectId: idStr(api, 'prospectId'),
    kpiproductId: idStr(api, 'kpiProductId'),
    responsiblebyId: idStr(api, 'assingToId'),
    eventId: idStr(api, 'id'),
    createAttachItems: arrayOrEmpty(api['createAttachItems']),
    successAttachItems: arrayOrEmpty(api['successAttachItems']),
  };
}

/** `fetchEventMovements`: the `result` records of the answer; null when the answer is unusable (no `result`, or an entry that is not an object) */
export function parseEventMovements(text: string | null): JObj[] | null {
  if (text == null || text.trim() === '') return null;
  const root = parseJson(text);
  if (!isObj(root) || !hasVal(root, 'result') || !isArr(root['result'])) return null;
  const rows: JObj[] = [];
  for (const o of root['result']) {
    if (!isObj(o)) return null;
    rows.push(toKpiRecord(o));
  }
  return rows;
}

/** `kpiBranchQueryParam`: `ggwBranch=<code>` (`all` when empty), with the given prefix */
export const kpiBranchQueryParam = (branch: string | null | undefined, prefix: string): string => `${prefix || '?'}ggwBranch=${enc((branch ?? '').trim() || 'all')}`;

/** `enc` of CalendarDashboardView: blank → "", else trimmed + encoded */
const encTrim = (v: string): string => (v.trim() === '' ? '' : enc(v.trim()));

/** the query of `fetchEventMovements`: every parameter of the curl spec (the unused ones empty) */
export function eventMovementsQuery(search: string, eventStatus: string, page: number, perPage: number, branch: string): string {
  return (
    `?search=${encTrim(search)}&id=&kpiTaskTypeName=&kpiJobTitleName=&prospectName=&eventStatus=${encTrim(eventStatus)}` +
    `&kpiProductName=&kpiProductCode=&detail=&solution=&kpiTaskTypeId=&kpiJobTitleId=&prospectId=&kpiProductId=&startDate=&closeDate=` +
    kpiBranchQueryParam(branch, '&') +
    `&page=${page > 0 ? page : 1}&perPage=${perPage > 0 ? perPage : 20}`
  );
}
