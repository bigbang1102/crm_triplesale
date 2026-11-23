/**
 * Deterministic fake backend of the DrillDown page (dev / `mock: true`, tests and the Java-vs-Angular comparison).
 *
 * It answers like the servlet `/board/drilldown` does in its SAMPLE-DATA mode (`drilldown.mock=true`: DrilldownApiService.mockDataJson +
 * DrilldownMockData): the same columns for each of the 11 reports (the dictionary of the service, planned by `drilldown.columns.ts`), the
 * same row counts, the same rules that pick a value from the title of the column, the date-range filter and the paging — so the
 * page shows the "ข้อมูลตัวอย่าง" pill, as it does in Java in that mode. The people are the cast of `@core/mock/crm-seed` (a customer's
 * name and PP-Code belong together, the employees are the employees of the other pages); "today" is `SEED_TODAY`.
 *
 * A few CODES are test hooks of this fake (the real service would answer them with its error / empty paths; they let the page and
 * the comparison reach those states): X-ERR-403, X-ERR-500, X-ERR-UP, X-ERR-BAD, X-EMPTY, X-REAL (real-data answer: no sample pill),
 * X-BIG (1,234 rows: the page window of the pager slides), X-BLANK (empty cells: the "blank" entry of a filter list), X-SLOW (answers after 4 s: the loading skeleton stays on screen).
 *
 * Framework-free on purpose (no Angular imports): the comparison harness loads this file in Node.
 */
import { reference, msg } from '@core/mock/reference';
import { SEED_EMPLOYEES, SEED_PROSPECT_COUNT, SEED_PROVINCES, SEED_TODAY, seedProspect } from '@core/mock/crm-seed';
import type { DrilldownBackend, DrilldownColumn, DrilldownData, DrilldownEnvelope } from './drilldown-backend';
import { allReports, findReport, mockColumns, type PlannedColumn, type Report } from './drilldown.columns';

export interface MockDrilldownOptions {
  /** simulated network time per request (ms); the skeleton rows of the page need a little */
  delayMs?: number;
}

/* ---- the constants of DrilldownApiService / DrilldownMockData ---- */
const DEFAULT_PAGE = 1;
const DEFAULT_PAGE_SIZE = 100;
const MAX_PAGE_SIZE = 2000;
const ROWS_BASE = 64;
const ROWS_STEP = 23;
const ROWS_SPAN = 180;
const DAYS_PER_ROW = 2;
const BLANK_EVERY = 7;
/** the extra time the code X-SLOW takes to answer */
const SLOW_MS = 4000;

const COUNTRIES = reference('drilldown.countries', ['ญี่ปุ่น', 'เกาหลีใต้', 'ไต้หวัน', 'สิงคโปร์', 'ออสเตรเลีย', 'อิสราเอล']);
const STATUSES = reference('drilldown.statuses', ['รอเอกสารลูกค้า', 'ส่งเข้า PLS', 'รอผลอนุมัติ', 'อนุมัติแล้ว', 'ธนาคารขอเอกสารเพิ่ม', 'รอนัดเซ็นสัญญา', 'ยกเลิก']);
const PAY_STATUSES = reference('drilldown.payStatuses', ['ชำระแล้ว', 'รอชำระ', 'เกินกำหนด']);
const CONTENTS = reference('drilldown.contents', ['โทรติดตามลูกค้า ยังไม่ได้รับเอกสาร', 'ส่งเอกสารครบแล้ว รอธนาคารตรวจ', 'นัดหมายลูกค้าเซ็นสัญญา', 'ลูกค้าขอชะลอโครงการไว้ก่อน', 'แจ้งผลอนุมัติให้ลูกค้าแล้ว', 'ธนาคารขอสลิปเงินเดือนเพิ่ม']);
const PROJECTS = reference('drilldown.projects', ['บ้านสวนริมน้ำ, นนทบุรี', 'เดอะ ริช พระราม 9, กรุงเทพฯ', 'ศุภาลัย ปาร์ค, ชลบุรี', 'ลัดดารมย์ ราชพฤกษ์, นนทบุรี']);
const LOAN_TYPES = reference('drilldown.loanTypes', ['กู้ซื้อบ้าน', 'รีไฟแนนซ์', 'กู้ปลูกสร้าง']);
const PROPERTIES = reference('drilldown.properties', ['บ้านเดี่ยว', 'ทาวน์เฮาส์', 'คอนโดมิเนียม', 'ที่ดินเปล่า']);
const SERVICES = reference('drilldown.services', ['บริการเต็มรูปแบบ', 'เฉพาะสินเชื่อ', 'เฉพาะนิติกรรม']);
const INCOME_TYPES = reference('drilldown.incomeTypes', ['พนักงานประจำ', 'เจ้าของกิจการ', 'ฟรีแลนซ์']);

/* ---- dates (UTC day numbers: no time zone, no clock) ---- */
const pad2 = (n: number): string => (n < 10 ? '0' : '') + n;
const dayNum = (iso: string): number => Math.floor(Date.UTC(+iso.slice(0, 4), +iso.slice(5, 7) - 1, +iso.slice(8, 10)) / 86_400_000);
const isoOf = (n: number): string => new Date(n * 86_400_000).toISOString().slice(0, 10);
const TODAY_N = dayNum(SEED_TODAY);
const monthOf = (iso: string): string => `${iso.slice(5, 7)}/${iso.slice(0, 4)}`; // MM/yyyy

const floorMod = (a: number, n: number): number => ((a % n) + n) % n;
/** a number in [min, max], fixed by the seed (never random) */
const pick = (seed: number, min: number, max: number): number => min + floorMod(seed * 31 + 7, Math.max(1, max - min + 1));

interface MockRow {
  rowDate: string;
  values: Record<string, string>;
}

/** the value of one cell, chosen by the TITLE of the column so the content makes sense under the header (DrilldownMockData.value) */
function value(label: string, rowDate: string, reportIndex: number, row: number, col: number): string {
  const seed = reportIndex * 7919 + row * 131 + col * 17;
  const name = label ?? '';
  const has = (s: string): boolean => name.includes(s);
  const customer = seedProspect(1 + ((reportIndex * 37 + row) % SEED_PROSPECT_COUNT));
  const staff = SEED_EMPLOYEES[floorMod(seed, SEED_EMPLOYEES.length)].name;
  const day = dayNum(rowDate);

  if (name === 'MTH') return monthOf(rowDate);
  if (has('เป้าเดือน')) return monthOf(rowDate);
  if (has('เป้าปี')) return rowDate.slice(0, 4);
  // "จำนวนวัน" must be tested before "วันที่": the title "จำนวนวันที่ใช้" contains "วันที่"
  if (has('จำนวนวัน')) return String(pick(seed, 1, 28));
  if (has('วันที่')) {
    if (row % BLANK_EVERY === col % BLANK_EVERY) return ''; // that step has not been reached yet
    return isoOf(day - pick(seed, 0, 45));
  }
  if (has('PP-Code')) return customer.code;
  if (has('ชื่อ-นามสกุล') || has('ชื่อ-สกุล')) return customer.fullName;
  if (has('ประเทศ')) return COUNTRIES[floorMod(seed, COUNTRIES.length)];
  if (has('จังหวัด') && !has('โครงการ')) return SEED_PROVINCES[floorMod(seed, SEED_PROVINCES.length)];
  if (has('โครงการ')) return PROJECTS[floorMod(seed, PROJECTS.length)];
  if (has('ชื่อ') || has('ผู้รับผิดชอบ') || has('ผู้ส่ง') || has('ผู้รับ')) return staff;
  if (has('SLA')) return floorMod(seed, 4) === 0 ? 'Y' : 'N';
  if (has('สถานะชำระ')) return PAY_STATUSES[floorMod(seed, PAY_STATUSES.length)];
  if (has('สถานะ') || has('ธนาคารคืน')) return STATUSES[floorMod(seed, STATUSES.length)];
  if (has('ผล Pre')) return floorMod(seed, 5) === 0 ? 'ไม่ผ่าน' : 'ผ่าน';
  if (has('ระยะปี')) return String(pick(seed, 10, 30));
  if (has('วงเงิน') || has('ราคา') || has('ยอด') || has('มูลค่า')) return String(pick(seed, 12, 68) * 50000);
  if (has('รายละเอียดติดต่อ') || has('หมายเหตุ')) return CONTENTS[floorMod(seed, CONTENTS.length)];
  if (has('ประเภทการกู้')) return LOAN_TYPES[floorMod(seed, LOAN_TYPES.length)];
  if (has('ทรัพย์')) return PROPERTIES[floorMod(seed, PROPERTIES.length)];
  // the composite column Profile = service + VIP + translation + income type (tested before its four parts)
  if (has('Profile')) {
    return `${SERVICES[floorMod(seed, SERVICES.length)]} ${floorMod(seed, 6) === 0 ? 'VIP' : '-'} ${floorMod(seed, 3) === 0 ? 'มี' : 'ไม่มี'} ${INCOME_TYPES[floorMod(seed, INCOME_TYPES.length)]}`;
  }
  if (has('ประเภทบริการ')) return SERVICES[floorMod(seed, SERVICES.length)];
  if (has('ประเภทรายได้')) return INCOME_TYPES[floorMod(seed, INCOME_TYPES.length)];
  if (has('VIP')) return floorMod(seed, 6) === 0 ? 'VIP' : '-';
  if (has('แปลเอกสาร') || has('มีบ้าน') || has('เซ็นไทย')) return floorMod(seed, 3) === 0 ? 'มี' : 'ไม่มี';
  if (has('กู้เดี่ยว')) return floorMod(seed, 2) === 0 ? 'กู้เดี่ยว' : 'กู้ร่วม';
  if (has('คู่สมรส')) return floorMod(seed, 2) === 0 ? seedProspect(1 + ((reportIndex * 37 + row + 3) % SEED_PROSPECT_COUNT)).fullName : '-';
  if (has('กำหนดโอน')) return isoOf(day + pick(seed, 15, 90));
  return '-';
}

/** the whole sample set of one report (not paged yet), newest first */
function build(reportIndex: number, columns: readonly PlannedColumn[], total: number): MockRow[] {
  const rows: MockRow[] = [];
  for (let i = 0; i < total; i++) {
    const rowDate = isoOf(TODAY_N - i * DAYS_PER_ROW);
    const values: Record<string, string> = {};
    columns.forEach((c, ci) => (values[c.key] = value(c.label, rowDate, reportIndex, i, ci)));
    rows.push({ rowDate, values });
  }
  return rows;
}

/* ---- the answers ---- */
const envelope = (success: boolean, message: string, data: DrilldownData | Record<string, never>): DrilldownEnvelope => ({ success, message, data });
const emptyData = (r: Report, page: number, pageSize: number): DrilldownData => ({
  code: r.def.code,
  supportsDateRange: r.def.supportsDateRange,
  columns: [],
  rows: [],
  page,
  pageSize,
  total: 0,
});

/** int from a query value: absent / not a number -> the fallback, otherwise clamped to [min, max] (DrilldownApiService.toInt) */
function toInt(text: string, fallback: number, min: number, max: number): number {
  const t = (text ?? '').trim();
  if (!t) return fallback;
  if (!/^[+-]?\d+$/.test(t)) return fallback;
  return Math.max(min, Math.min(max, parseInt(t, 10)));
}

const sampleRowCount = (reportIndex: number): number => ROWS_BASE + ((reportIndex * ROWS_STEP) % ROWS_SPAN);

interface Variant {
  /** an answer of the real service (no "mock" flag) */
  real?: boolean;
  /** more rows than the sample set has */
  total?: number;
  /** every 5th row has no country and no status (the service sends "" for a null) */
  blanks?: boolean;
}

function dataEnvelope(code: string, fromDate: string, toDate: string, page: string, pageSize: string, variant: Variant = {}): { status: number; body: unknown } {
  const { real = false, total: bigTotal = 0, blanks = false } = variant;
  const r = findReport(code);
  if (!r) return { status: 200, body: envelope(false, msg('ไม่รู้จักรายงาน: {0}', (code ?? '').trim()), {}) };
  const pageNo = toInt(page, DEFAULT_PAGE, 1, Number.MAX_SAFE_INTEGER);
  const size = toInt(pageSize, DEFAULT_PAGE_SIZE, 1, MAX_PAGE_SIZE);

  const index = allReports().indexOf(r);
  const columns = mockColumns(r);
  const all = build(index, columns, bigTotal || sampleRowCount(index));
  if (blanks) {
    const empty = columns.filter((c) => c.label === 'ประเทศ' || c.label === 'สถานะปัจจุบัน');
    all.forEach((row, i) => i % 5 === 2 && empty.forEach((c) => (row.values[c.key] = '')));
  }
  const from = (fromDate ?? '').trim();
  const to = (toDate ?? '').trim();
  const filtered = all.filter((row) => !r.def.supportsDateRange || ((!from || row.rowDate >= from) && (!to || row.rowDate <= to)));

  const total = filtered.length;
  const lo = Math.min((pageNo - 1) * size, total);
  const hi = Math.min(lo + size, total);
  const data: DrilldownData = {
    code: r.def.code,
    supportsDateRange: r.def.supportsDateRange,
    ...(real ? {} : { mock: true }),
    columns: columns.map((c): DrilldownColumn => ({ key: c.key, label: c.label, mapped: true })),
    rows: filtered.slice(lo, hi).map((row) => Object.fromEntries(columns.map((c) => [c.key, row.values[c.key] ?? '']))),
    page: pageNo,
    pageSize: size,
    total,
  };
  return { status: 200, body: envelope(true, real ? 'Success' : 'Success (mock)', data) };
}

/** the answer to one request: [HTTP status, JSON body or raw text] */
function answer(url: URL): { status: number; body: unknown; raw?: boolean } {
  if (url.pathname !== '/board/drilldown') return { status: 404, body: { error: 'not found', path: url.pathname } };
  const q = (n: string): string => (url.searchParams.get(n) ?? '').trim();
  const action = q('action') || 'data';

  if (action === 'reports') {
    return { status: 200, body: envelope(true, 'Success', { reports: allReports().map((r) => ({ code: r.def.code, apiPath: r.def.apiPath, supportsDateRange: r.def.supportsDateRange })) } as unknown as DrilldownData) };
  }
  if (action !== 'data') return { status: 400, body: envelope(false, 'unknown action', {}) };

  const code = q('code');
  // ---- test hooks of the fake (see the header) ----
  switch (code.toUpperCase()) {
    case 'X-ERR-403': // no CRM_Dashboard_View (real mode)
      return { status: 403, body: envelope(false, 'ไม่มีสิทธิ์ใช้งานรายงาน DrillDown', {}) };
    case 'X-ERR-500': // the servlet threw
      return { status: 500, body: envelope(false, 'internal error', {}) };
    case 'X-ERR-UP': // the REST service answered with an error: the message is the service's, the data are empty
      return { status: 200, body: envelope(false, 'เรียกข้อมูลรายงานไม่สำเร็จ (HTTP 403)', emptyData(findReport('T-CS-01')!, toInt(q('page'), 1, 1, 1e9), toInt(q('pageSize'), 100, 1, MAX_PAGE_SIZE))) };
    case 'X-ERR-BAD': // not JSON at all (a proxy page): res.json() fails in the page
      return { status: 502, body: 'Bad Gateway', raw: true };
    case 'X-EMPTY': // the REST service answered without a list of rows
      return { status: 200, body: envelope(true, 'Success', emptyData(findReport('T-CS-01')!, toInt(q('page'), 1, 1, 1e9), toInt(q('pageSize'), 100, 1, MAX_PAGE_SIZE))) };
    case 'X-REAL': // real data (no "mock" flag): the sample-data pill stays hidden
      return dataEnvelope('T-CS-01', q('fromdate'), q('todate'), q('page'), q('pageSize'), { real: true });
    case 'X-BIG':
      return dataEnvelope('T-CS-01', q('fromdate'), q('todate'), q('page'), q('pageSize'), { total: 1234 });
    case 'X-BLANK': // empty cells in a column that is not a date column: the filter list shows its "(blank)" entry
      return dataEnvelope('T-CS-01', q('fromdate'), q('todate'), q('page'), q('pageSize'), { blanks: true });
    case 'X-SLOW': // answers after SLOW_MS (see createMockDrilldown): the skeleton rows stay on screen (1,234 rows: there is a page 2)
      return dataEnvelope('T-CS-01', q('fromdate'), q('todate'), q('page'), q('pageSize'), { total: 1234 });
  }
  return dataEnvelope(code, q('fromdate'), q('todate'), q('page'), q('pageSize'));
}

function wait(ms: number, signal?: AbortSignal | null): Promise<void> {
  const aborted = (): DOMException => new DOMException('The operation was aborted.', 'AbortError');
  if (signal?.aborted) return Promise.reject(aborted());
  if (ms <= 0) return Promise.resolve();
  return new Promise((resolve, reject) => {
    const t = setTimeout(() => {
      signal?.removeEventListener('abort', onAbort);
      resolve();
    }, ms);
    const onAbort = (): void => {
      clearTimeout(t);
      reject(aborted());
    };
    signal?.addEventListener('abort', onAbort, { once: true });
  });
}

/**
 * A body that arrives as a stream, like one from the network: the browser words the `res.json()` error of a streamed body ("Unexpected
 * token …") differently from that of an in-memory string body ("Failed to execute 'json' on 'Response': …"), and the page shows that
 * message to the user.
 */
function streamOf(text: string): ReadableStream<Uint8Array> {
  const bytes = new TextEncoder().encode(text);
  return new ReadableStream<Uint8Array>({
    start(controller) {
      controller.enqueue(bytes);
      controller.close();
    },
  });
}

export function createMockDrilldown(options: MockDrilldownOptions = {}): DrilldownBackend {
  const delay = options.delayMs ?? 150;
  return {
    async fetch(input: string, init?: RequestInit): Promise<Response> {
      await wait(delay, init?.signal);
      const url = new URL(input, 'http://mock.local');
      if ((url.searchParams.get('code') ?? '').trim().toUpperCase() === 'X-SLOW') await wait(SLOW_MS, init?.signal);
      const r = answer(url);
      return r.raw
        ? new Response(streamOf(String(r.body)), { status: r.status, headers: { 'Content-Type': 'text/plain; charset=UTF-8' } })
        : new Response(JSON.stringify(r.body), { status: r.status, headers: { 'Content-Type': 'application/json; charset=UTF-8' } });
    },
  };
}

/** nothing the user changes lives in this page (read-only report): kept for symmetry with the other mocks (tests, the harness) */
export function resetMockDrilldown(): void {
  /* stateless */
}
