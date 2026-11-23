import { beforeEach, describe, expect, it } from 'vitest';
import { SEED_PROSPECT_COUNT, seedProspect } from '@core/mock/crm-seed';
import type { DrilldownBackend, DrilldownEnvelope } from './drilldown-backend';
import { allReports, findReport, humanize, mockColumns, normalizeKey, planColumns } from './drilldown.columns';
import { createMockDrilldown } from './drilldown.mock';
import { HIDDEN_LABELS, REPORTS } from './drilldown.reports';

const CODES = ['T-CS-01', 'T-PLS-01', 'T-PLS-02', 'T-PLS-03', 'T-LS-01', 'T-LS-02', 'T-LS-03', 'T-LS-04', 'T-LS-05', 'T-LE-01', 'T-FI-01'];
/** the row counts of the sample data: 64 + (index * 23) % 180 (DrilldownMockData) */
const ROWS = [64, 87, 110, 133, 156, 179, 202, 225, 68, 91, 114];

describe('DrillDown mock backend (the sample-data mode of DrilldownApiService)', () => {
  let b: DrilldownBackend;
  beforeEach(() => {
    b = createMockDrilldown({ delayMs: 0 });
  });
  const get = async (query: string): Promise<{ status: number; json: DrilldownEnvelope & { data: any } }> => {
    const r = await b.fetch(`/board/drilldown?${query}`);
    return { status: r.status, json: (await r.json()) as never };
  };

  describe('the registry (copied from the service by tools/sync-drilldown.mjs)', () => {
    it('has the 11 reports in the order of the menu; only T-CS-01 takes no date range', () => {
      expect(allReports().map((r) => r.def.code)).toEqual(CODES);
      expect(REPORTS.filter((r) => !r.supportsDateRange).map((r) => r.code)).toEqual(['T-CS-01']);
      expect(HIDDEN_LABELS).toEqual(['เป้าเดือน', 'เป้าปี', 'มีแบบบ้าน']);
    });

    it('finds a report by "T-CS-01", "t-cs-01" and its api path "tcs01"', () => {
      expect(findReport('t-cs-01')?.def.code).toBe('T-CS-01');
      expect(findReport('tcs01')?.def.code).toBe('T-CS-01');
      expect(findReport('tf1')?.def.code).toBe('T-FI-01');
      expect(findReport('T-XX-01')).toBeUndefined();
      expect(findReport('  ')).toBeUndefined();
      expect(findReport(null)).toBeUndefined();
    });

    it('compares field names without case, "_" and "-" (CASE_MONTH_TXT = caseMonthTxt)', () => {
      expect(normalizeKey('CASE_MONTH_TXT')).toBe('casemonthtxt');
      expect(normalizeKey('caseMonthTxt')).toBe('casemonthtxt');
      expect(normalizeKey('T-CS-01')).toBe('tcs01');
      expect(humanize('SEND_BANK_DATE_TXT')).toBe('Send bank date txt');
      expect(humanize('sendBankDate')).toBe('Send bank date');
    });
  });

  describe('the columns (ReportDef.planColumns)', () => {
    it('follow the order of the dictionary, one column per title, the hidden titles never show', () => {
      for (const r of allReports()) {
        const titles = mockColumns(r).map((c) => c.label);
        expect(new Set(titles).size, r.def.code).toBe(titles.length);
        for (const h of HIDDEN_LABELS) expect(titles, r.def.code).not.toContain(h);
      }
      expect(mockColumns(findReport('T-CS-01')!).map((c) => c.label)).toEqual([
        'MTH', 'วันที่รับแจก', 'ชื่อผู้รับผิดชอบ', 'PP-Code', 'ชื่อ-นามสกุล', 'ประเทศ', 'Profile', 'สถานะปัจจุบัน', 'วันที่สถานะ', 'รายละเอียดติดต่อ',
        'วันที่ลูกค้าชำระ', 'จำนวนวันที่ใช้', 'วันที่ส่งเข้า PLS', 'จำนวนวันเข้า PLS', 'เกิน SLA', 'วันที่เข้าธนาคาร', 'วันที่อนุมัติ PL',
      ]);
    });

    it('merges the four Profile fields into ONE column and does not show them separately', () => {
      const cols = mockColumns(findReport('T-PLS-01')!);
      expect(cols.filter((c) => c.label === 'Profile')).toHaveLength(1);
      expect(cols.map((c) => c.label)).not.toContain('ประเภทบริการ');
      expect(cols.map((c) => c.label)).not.toContain('VIP');
    });

    it('a field the dictionary does not know follows at the end; a title that repeats takes the first field that arrived', () => {
      const r = findReport('T-CS-01')!;
      const plan = planColumns(r, ['EXTRA_FIELD', 'CASE_MONTH_TXT', 'MTH', 'CUSTOMER_CODE']);
      // MTH and CASE_MONTH_TXT share the title "MTH": the dictionary lists MTH first, but only the one that arrived is used
      expect(plan).toEqual(['MTH', 'CUSTOMER_CODE', 'EXTRA_FIELD']);
      // a composite column shows as soon as ONE of its sources arrived
      expect(planColumns(r, ['CS_VIP'])).toEqual(['vcolprofile']);
    });

    it('titles the unknown field with a readable name', () => {
      const r = findReport('T-LS-01')!;
      const plan = planColumns(r, ['SOME_NEW_FIELD']);
      expect(plan).toEqual(['SOME_NEW_FIELD']);
    });
  });

  describe('GET ?action=data', () => {
    it('answers {success, message, data} with the sample-data flag, the columns and the rows of the first page', async () => {
      const { status, json } = await get('action=data&code=T-CS-01&page=1&pageSize=100');
      expect(status).toBe(200);
      expect(json.success).toBe(true);
      expect(json.message).toBe('Success (mock)');
      expect(json.data).toMatchObject({ code: 'T-CS-01', supportsDateRange: false, mock: true, page: 1, pageSize: 100, total: 64 });
      expect(json.data.columns).toHaveLength(17);
      expect(json.data.columns[0]).toEqual({ key: 'mth', label: 'MTH', mapped: true });
      expect(json.data.rows).toHaveLength(64);
      // every value is a string and every row has every column
      for (const row of json.data.rows) expect(Object.keys(row)).toEqual(json.data.columns.map((c: { key: string }) => c.key));
      expect(json.data.rows.every((row: Record<string, unknown>) => Object.values(row).every((v) => typeof v === 'string'))).toBe(true);
    });

    it('has the row counts of the Java sample set per report (64 + index * 23 mod 180) and pages them by 100', async () => {
      for (const [i, code] of CODES.entries()) {
        const p1 = (await get(`action=data&code=${code}&page=1&pageSize=100`)).json.data;
        expect(p1.total, code).toBe(ROWS[i]);
        expect(p1.rows.length, code).toBe(Math.min(100, ROWS[i]));
        if (ROWS[i] > 100) {
          const p2 = (await get(`action=data&code=${code}&page=2&pageSize=100`)).json.data;
          expect(p2.rows.length, code).toBe(Math.min(100, ROWS[i] - 100));
          expect(p2.page).toBe(2);
        }
      }
    });

    it('is a request without action: data; defaults page 1 / 100 rows; clamps a silly page size; ignores a non-number', async () => {
      expect((await get('code=T-PLS-02')).json.data).toMatchObject({ page: 1, pageSize: 100, total: 110 });
      expect((await get('action=data&code=T-PLS-02&pageSize=5000')).json.data.pageSize).toBe(2000);
      expect((await get('action=data&code=T-PLS-02&pageSize=0')).json.data.pageSize).toBe(1);
      expect((await get('action=data&code=T-PLS-02&page=abc&pageSize=x')).json.data).toMatchObject({ page: 1, pageSize: 100 });
      // a page past the end is empty, the total is still right
      const past = (await get('action=data&code=T-PLS-02&page=9&pageSize=100')).json.data;
      expect(past.rows).toEqual([]);
      expect(past.total).toBe(110);
    });

    it('takes the code in any spelling', async () => {
      expect((await get('action=data&code=t-ls-02')).json.data.code).toBe('T-LS-02');
      expect((await get('action=data&code=tls02')).json.data.code).toBe('T-LS-02'); // letters and digits only
      expect((await get('action=data&code=ls02')).json.data.code).toBe('T-LS-02'); // the api path of the endpoint
    });

    it('filters by fromdate / todate for the reports that take them — not for T-CS-01', async () => {
      const all = (await get('action=data&code=T-LS-01&pageSize=2000')).json.data;
      const dates = all.rows.length;
      expect(dates).toBe(156);
      const some = (await get('action=data&code=T-LS-01&pageSize=2000&fromdate=2026-10-01&todate=2026-10-20')).json.data;
      // a row every 2 days back from 2026-10-20: 10 rows in that range
      expect(some.total).toBe(10);
      expect(some.rows).toHaveLength(10);
      expect((await get('action=data&code=T-LS-01&fromdate=2027-01-01')).json.data.total).toBe(0);
      // T-CS-01 has no date range: the parameters are ignored
      expect((await get('action=data&code=T-CS-01&fromdate=2027-01-01')).json.data.total).toBe(64);
    });

    it('the content fits the title of its column: dates are ISO text, counts are numbers, money is a plain number, SLA is Y/N', async () => {
      const d = (await get('action=data&code=T-LS-01&pageSize=2000')).json.data;
      const col = (label: string) => d.columns.find((c: { label: string }) => c.label === label).key as string;
      const vals = (label: string) => d.rows.map((r: Record<string, string>) => r[col(label)]);
      expect(vals('วันที่รับเคส').filter(Boolean).every((v: string) => /^\d{4}-\d{2}-\d{2}$/.test(v))).toBe(true);
      expect(vals('จำนวนวันรอส่งพัสดุ').every((v: string) => /^\d+$/.test(v))).toBe(true);
      expect(vals('ราคาซื้อขาย').every((v: string) => /^\d+$/.test(v) && Number(v) % 50000 === 0)).toBe(true);
      expect(new Set(vals('เกิน SLA เข้าธนาคาร'))).toEqual(new Set(['Y', 'N']));
      expect(vals('MTH')[0]).toBe('10/2026');
      // blank dates (a step that was not reached) exist
      expect(vals('วันที่ส่งเข้าธนาคาร').some((v: string) => v === '')).toBe(true);
    });

    it('is the people of the other pages: a row\'s PP-Code and name are the same customer of the seed', async () => {
      const d = (await get('action=data&code=T-CS-01')).json.data;
      const key = (label: string) => d.columns.find((c: { label: string }) => c.label === label).key as string;
      d.rows.forEach((row: Record<string, string>) => {
        const n = Number(row[key('PP-Code')].slice(1));
        expect(n).toBeGreaterThanOrEqual(1);
        expect(n).toBeLessThanOrEqual(SEED_PROSPECT_COUNT);
        expect(row[key('ชื่อ-นามสกุล')]).toBe(seedProspect(n).fullName);
      });
    });

    it('is the same on every call and every instance (fixed seed, fixed "today")', async () => {
      const a = await (await b.fetch('/board/drilldown?action=data&code=T-LE-01')).text();
      const c = await (await createMockDrilldown({ delayMs: 0 }).fetch('/board/drilldown?action=data&code=T-LE-01')).text();
      expect(a).toBe(c);
    });

    it('an unknown report is { success: false } with the Java message, status 200', async () => {
      const { status, json } = await get('action=data&code=T-ZZ-99');
      expect(status).toBe(200);
      expect(json).toEqual({ success: false, message: 'ไม่รู้จักรายงาน: T-ZZ-99', data: {} });
      expect((await get('action=data')).json.message).toBe('ไม่รู้จักรายงาน: ');
    });
  });

  describe('the other actions of the servlet', () => {
    it('?action=reports lists the 11 reports', async () => {
      const { json } = await get('action=reports');
      expect(json.success).toBe(true);
      expect(json.data.reports).toHaveLength(11);
      expect(json.data.reports[0]).toEqual({ code: 'T-CS-01', apiPath: 'tcs01', supportsDateRange: false });
      expect(json.data.reports[10]).toEqual({ code: 'T-FI-01', apiPath: 'tf1', supportsDateRange: true });
    });

    it('an unknown action is 400 { success: false, "unknown action" }; another path is 404', async () => {
      const bad = await get('action=nope');
      expect(bad.status).toBe(400);
      expect(bad.json).toEqual({ success: false, message: 'unknown action', data: {} });
      expect((await b.fetch('/board/other')).status).toBe(404);
    });
  });

  describe('the test hooks (codes of the fake)', () => {
    it('X-ERR-403 / X-ERR-500 answer like the servlet does', async () => {
      const f = await get('action=data&code=X-ERR-403');
      expect(f.status).toBe(403);
      expect(f.json).toEqual({ success: false, message: 'ไม่มีสิทธิ์ใช้งานรายงาน DrillDown', data: {} });
      const e = await get('action=data&code=X-ERR-500');
      expect(e.status).toBe(500);
      expect(e.json).toEqual({ success: false, message: 'internal error', data: {} });
    });

    it('X-ERR-UP: the service failed — the message of the service and empty data; X-EMPTY: success without rows', async () => {
      const up = (await get('action=data&code=X-ERR-UP')).json;
      expect(up.success).toBe(false);
      expect(up.message).toBe('เรียกข้อมูลรายงานไม่สำเร็จ (HTTP 403)');
      expect(up.data).toMatchObject({ columns: [], rows: [], total: 0 });
      const empty = (await get('action=data&code=X-EMPTY')).json;
      expect(empty.success).toBe(true);
      expect(empty.data).toMatchObject({ columns: [], rows: [], total: 0 });
    });

    it('X-ERR-BAD is not JSON at all', async () => {
      const r = await b.fetch('/board/drilldown?action=data&code=X-ERR-BAD');
      expect(r.status).toBe(502);
      expect(await r.text()).toBe('Bad Gateway');
    });

    it('X-REAL has no sample-data flag; X-BIG has 1,234 rows; X-BLANK has empty cells', async () => {
      const real = (await get('action=data&code=X-REAL')).json;
      expect(real.message).toBe('Success');
      expect('mock' in real.data).toBe(false);
      expect((await get('action=data&code=X-BIG&page=13')).json.data).toMatchObject({ total: 1234, page: 13 });
      expect((await get('action=data&code=X-BIG&page=13')).json.data.rows).toHaveLength(34);
      const blank = (await get('action=data&code=X-BLANK&pageSize=2000')).json.data;
      const country = blank.columns.find((c: { label: string }) => c.label === 'ประเทศ').key;
      expect(blank.rows.filter((r: Record<string, string>) => r[country] === '')).toHaveLength(13);
    });
  });

  it('stops waiting when the request is aborted', async () => {
    const slow = createMockDrilldown({ delayMs: 200 });
    const ctl = new AbortController();
    const pending = slow.fetch('/board/drilldown?action=data&code=T-CS-01', { signal: ctl.signal });
    ctl.abort();
    await expect(pending).rejects.toMatchObject({ name: 'AbortError' });
  });
});
