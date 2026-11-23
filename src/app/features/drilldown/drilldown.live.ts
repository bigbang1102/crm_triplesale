/**
 * The LIVE backend of the DrillDown page: what the servlet `DrilldownApiServlet` and the service `DrilldownApiService` did on the server,
 * done in the browser. The page script keeps asking `/board/drilldown?action=data&code=T-CS-01&page=1&pageSize=100`; `fetch()` answers it
 * with a real `Response`, from one REST call:
 *
 *   GET {triplesale-service}/api/v1/drilldown/<apiPath>?fromdate=&todate=&page=&pageSize=      (Bearer token: the app's HttpClient)
 *
 * The servlet's checks come first (the role `CRM_Dashboard_View`, the action); then the service's work: the swagger of the service does
 * not describe the rows (`ApiResponseObject`), so the columns are not fixed — the keys of the first rows decide, the dictionary
 * (`drilldown.reports.ts`, planned by `drilldown.columns.ts`) gives the titles and the order, and every value becomes text.
 *
 * Not ported: nothing of substance. (`drilldown.mock=true` of the Java service = `drilldown.mock.ts`; the `ApiLog` record of the service =
 * the API log the HttpClient interceptor of the app keeps; the 180 s timeout of the Java client = the browser's.)
 */
import { ROLE } from '@core/permissions/roles';
import { isJArr, isJObj, parseJava, toJavaJson, type JNode, type JObj } from '@core/live/json-java';
import { get, jsonResponse, parsePageUrl, type RestDeps } from '@core/live/rest';
import type { DrilldownBackend, DrilldownColumn, DrilldownData, DrilldownEnvelope } from './drilldown-backend';
import { allReports, labelOf, normalizeKey, humanize, findReport, planColumns, type Report } from './drilldown.columns';

const DEFAULT_PAGE = 1;
const DEFAULT_PAGE_SIZE = 100;
const MAX_PAGE_SIZE = 2000;
/** rows scanned for the keys of the columns (the first ones are enough: a row may miss fields) */
const COLUMN_SCAN_ROWS = 30;
/** where the array of the rows can be, on each level of the answer */
const ROWS_KEYS = ['result', 'data', 'items', 'content', 'rows', 'list', 'records'];
const TOTAL_KEYS = ['total', 'totalRecords', 'totalRecord', 'totalElements', 'totalCount', 'count', 'recordsTotal'];
/** internal ids: no meaning to the user, never a column */
const HIDDEN_KEYS = new Set(['id', 'no', 'rownumber', 'rowno']);

const INT_MIN = -2147483648;
const INT_MAX = 2147483647;

/** `DrilldownApiService.toInt`: absent / not an int (Integer.parseInt) -> the fallback, otherwise clamped */
function toInt(text: string, fallback: number, min: number, max: number): number {
  const t = (text ?? '').trim();
  if (!t || !/^[+-]?\d+$/.test(t)) return fallback;
  const n = Number(t);
  if (n < INT_MIN || n > INT_MAX) return fallback; // NumberFormatException
  return Math.max(min, Math.min(max, n));
}

const envelope = (success: boolean, message: string, data: DrilldownData | Record<string, never> | { reports: unknown[] }): DrilldownEnvelope =>
  ({ success, message, data }) as DrilldownEnvelope;

const emptyData = (r: Report, page: number, pageSize: number): DrilldownData => ({
  code: r.def.code,
  supportsDateRange: r.def.supportsDateRange,
  columns: [],
  rows: [],
  page,
  pageSize,
  total: 0,
});

/** `asText`: a JSON value as the cell text (null = '', a nested object / array = its JSON text) */
function asText(v: JNode | undefined): string {
  if (v === undefined || v === null) return '';
  if (typeof v === 'string') return v;
  return toJavaJson(v);
}

/** the array of the rows: the root itself, then `result`/`data`/… , then one level deeper (`{data: {items: […]}}`) */
function findRows(root: JObj): JNode[] | null {
  for (const key of ROWS_KEYS) {
    const v = root.get(key);
    if (v === undefined) continue;
    if (isJArr(v)) return v;
    if (isJObj(v)) {
      for (const inner of ROWS_KEYS) {
        const iv = v.get(inner);
        if (iv !== undefined && isJArr(iv)) return iv;
      }
    }
  }
  return null;
}

/** `JsonNumber.intValue()`: truncated, wrapped to 32 bits like `BigDecimal.intValue()` */
const intValue = (text: string): number => Number(BigInt.asIntN(32, BigInt(Math.trunc(Number(text)))));

function readInt(o: JObj, key: string): number | null {
  const v = o.get(key);
  if (v === undefined || v === null) return null;
  if (typeof v === 'string') {
    // Integer.valueOf(trim): an int in text form, or null
    const t = v.trim();
    if (!/^[+-]?\d+$/.test(t)) return null;
    const n = Number(t);
    return n >= INT_MIN && n <= INT_MAX ? n : null;
  }
  if (typeof v === 'object' && !Array.isArray(v) && !isJObj(v)) return intValue(v.text);
  return null;
}

function findTotal(root: JObj, fallback: number): number {
  for (const key of TOTAL_KEYS) {
    const found = readInt(root, key);
    if (found !== null) return found;
  }
  for (const key of ROWS_KEYS) {
    const v = root.get(key);
    if (v && isJObj(v)) {
      for (const tk of TOTAL_KEYS) {
        const found = readInt(v, tk);
        if (found !== null) return found;
      }
    }
  }
  return fallback;
}

/** the keys of the first rows in the order the service sent them, without the internal ones */
function collectKeys(rows: JNode[]): string[] {
  const keys = new Set<string>();
  for (const row of rows.slice(0, COLUMN_SCAN_ROWS)) {
    if (!isJObj(row)) continue;
    for (const key of row.keys()) if (!HIDDEN_KEYS.has(normalizeKey(key))) keys.add(key);
  }
  return [...keys];
}

/** the cell of a composite column = the values of its source fields joined by a space (empty ones skipped) */
function compositeText(r: Report, row: JObj, virtualKey: string): string {
  const byNormalized = new Map<string, JNode>();
  for (const [rawKey, v] of row) if (!byNormalized.has(normalizeKey(rawKey))) byNormalized.set(normalizeKey(rawKey), v);
  const parts: string[] = [];
  for (const source of r.composites.get(normalizeKey(virtualKey)) ?? []) {
    const text = asText(byNormalized.get(source));
    if (text.trim()) parts.push(text.trim());
  }
  return parts.join(' ');
}

/** the message the service sent with an error ("403 = no right" …), else the HTTP status in words */
function backendMessage(status: number, text: string): string {
  const root = parseJava(text);
  if (isJObj(root)) {
    const error = root.get('error');
    if (isJObj(error)) {
      const m = error.get('message');
      if (typeof m === 'string' && m) return m;
    }
    const m = root.get('message');
    if (typeof m === 'string' && m) return m;
  }
  return `เรียกข้อมูลรายงานไม่สำเร็จ (HTTP ${status})`;
}

/** `DrilldownApiService.dataJson` */
async function dataJson(deps: RestDeps, code: string, fromDate: string, toDate: string, page: string, pageSize: string): Promise<DrilldownEnvelope> {
  const r = findReport(code);
  if (!r) return envelope(false, `ไม่รู้จักรายงาน: ${(code ?? '').trim()}`, {});

  const pageNo = toInt(page, DEFAULT_PAGE, 1, INT_MAX);
  const size = toInt(pageSize, DEFAULT_PAGE_SIZE, 1, MAX_PAGE_SIZE);

  const up = await get(deps, `/drilldown/${r.def.apiPath}`, {
    ...(r.def.supportsDateRange ? { fromdate: fromDate.trim(), todate: toDate.trim() } : {}),
    page: pageNo,
    pageSize: size,
  });
  if (up.status !== 200) return envelope(false, backendMessage(up.status, up.text), emptyData(r, pageNo, size));

  // an array at the top is wrapped like {result: […]}; a body that is not JSON / not an object has no rows
  let root = parseJava(up.text);
  if (isJArr(root)) root = new Map<string, JNode>([['result', root]]);
  const rows = isJObj(root) ? findRows(root) : null;
  if (!isJObj(root) || !rows) return envelope(true, 'Success', emptyData(r, pageNo, size));

  const keys = planColumns(r, collectKeys(rows));
  const columns: DrilldownColumn[] = keys.map((key) => {
    const label = labelOf(r, key);
    return { key, label: label ?? humanize(key), mapped: label !== undefined };
  });
  const out: Record<string, string>[] = [];
  for (const row of rows) {
    if (!isJObj(row)) continue;
    const cells: Record<string, string> = {};
    for (const key of keys) cells[key] = r.composites.has(normalizeKey(key)) ? compositeText(r, row, key) : asText(row.get(key));
    out.push(cells);
  }
  return envelope(true, 'Success', {
    code: r.def.code,
    supportsDateRange: r.def.supportsDateRange,
    columns,
    rows: out,
    page: pageNo,
    pageSize: size,
    total: findTotal(root, rows.length),
  });
}

/** the live backend: `deps` = the app's REST plumbing (`injectRestDeps()` in the host) */
export function createLiveDrilldown(deps: RestDeps): DrilldownBackend {
  return {
    async fetch(input: string): Promise<Response> {
      const { path, query } = parsePageUrl(input);
      if (path !== '/board/drilldown') return jsonResponse(404, { status: 404, message: `no live route for ${path}` });
      const q = (name: string): string => (query.get(name) ?? '').trim();

      // the servlet's own role check (the service enforces it too: its 403 would arrive as "HTTP 403")
      if (!deps.hasRole(ROLE.dashboardView)) return jsonResponse(403, envelope(false, 'ไม่มีสิทธิ์ใช้งานรายงาน DrillDown', {}));

      try {
        switch (q('action') || 'data') {
          case 'reports':
            return jsonResponse(
              200,
              envelope(true, 'Success', { reports: allReports().map((r) => ({ code: r.def.code, apiPath: r.def.apiPath, supportsDateRange: r.def.supportsDateRange })) }),
            );
          case 'data':
            return jsonResponse(200, await dataJson(deps, q('code'), q('fromdate'), q('todate'), q('page'), q('pageSize')));
          default:
            return jsonResponse(400, envelope(false, 'unknown action', {}));
        }
      } catch {
        return jsonResponse(500, envelope(false, 'internal error', {}));
      }
    },
  };
}

