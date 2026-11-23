import { describe, expect, it } from 'vitest';
import type { RestResult } from '@core/live/rest';
import { fakeRest } from '@core/live/rest-fake';
import { ROLE } from '@core/permissions/roles';
import type { DrilldownEnvelope } from './drilldown-backend';
import { createLiveDrilldown } from './drilldown.live';

const SERVICE = '/triplesale-service/api/v1';

/** a scripted service: `answer(url)` = what the REST service says; `calls` = what was asked */
function fake(answer: (url: string) => RestResult | object | string, roles: string[] = [ROLE.dashboardView]) {
  const { deps, calls } = fakeRest((c) => answer(c.url), { roles });
  return { deps, calls, backend: createLiveDrilldown(deps) };
}

const ask = async (f: ReturnType<typeof fake>, query: string) => {
  const res = await f.backend.fetch(`/board/drilldown?${query}`);
  return { status: res.status, type: res.headers.get('content-type'), body: (await res.json()) as DrilldownEnvelope };
};

interface Shown {
  columns: { key: string; label: string; mapped: boolean }[];
  rows: Record<string, string>[];
  total: number;
  page: number;
  pageSize: number;
}
const data = (e: DrilldownEnvelope): Shown => e.data as unknown as Shown;

describe('DrilldownApiServlet / DrilldownApiService, live', () => {
  describe('the servlet', () => {
    it('refuses a user without CRM_Dashboard_View with 403 and the Thai message, and asks the service for nothing', async () => {
      const f = fake(() => ({}), []);
      const r = await ask(f, 'action=data&code=T-CS-01');
      expect(r.status).toBe(403);
      expect(r.body).toEqual({ success: false, message: 'ไม่มีสิทธิ์ใช้งานรายงาน DrillDown', data: {} });
      expect(f.calls).toHaveLength(0);
    });

    it('a super-admin passes: hasRole decides (the alias lives there)', async () => {
      const f = fake(() => ({ result: [] }), [ROLE.dashboardView]);
      expect((await ask(f, 'code=T-CS-01')).status).toBe(200);
    });

    it('lists the 11 reports for action=reports (no service call) and refuses an unknown action with 400', async () => {
      const f = fake(() => ({}));
      const r = await ask(f, 'action=reports');
      expect(r.status).toBe(200);
      const reports = (r.body.data as unknown as { reports: { code: string; apiPath: string; supportsDateRange: boolean }[] }).reports;
      expect(reports).toHaveLength(11);
      expect(reports[0]).toEqual({ code: 'T-CS-01', apiPath: 'tcs01', supportsDateRange: false });
      expect(reports.at(-1)).toEqual({ code: 'T-FI-01', apiPath: 'tf1', supportsDateRange: true });
      expect(f.calls).toHaveLength(0);
      const bad = await ask(f, 'action=nope');
      expect(bad.status).toBe(400);
      expect(bad.body).toEqual({ success: false, message: 'unknown action', data: {} });
    });

    it('answers JSON with the UTF-8 charset; an empty action means data; a path that is not the servlet is a 404', async () => {
      const f = fake(() => ({ result: [] }));
      const r = await ask(f, 'code=T-LS-01');
      expect(r.type).toBe('application/json;charset=UTF-8');
      expect(f.calls).toHaveLength(1);
      const other = await f.backend.fetch('/board/leads');
      expect(other.status).toBe(404);
    });

    it('a code the dictionary does not know is a "success: false" answer with status 200 (the text keeps the trimmed code)', async () => {
      const f = fake(() => ({}));
      const r = await ask(f, 'action=data&code=%20X-9%20');
      expect(r.status).toBe(200);
      expect(r.body).toEqual({ success: false, message: 'ไม่รู้จักรายงาน: X-9', data: {} });
      expect((await ask(f, 'action=data')).body.message).toBe('ไม่รู้จักรายงาน: ');
      expect(f.calls).toHaveLength(0);
    });
  });

  describe('the request to the service', () => {
    it('GET /drilldown/<apiPath> with fromdate, todate, page, pageSize in this order (blanks left out, values trimmed)', async () => {
      const f = fake(() => ({ result: [] }));
      await ask(f, 'code=T-PLS-01&fromdate=%202026-01-01&todate=2026-01-31%20&page=3&pageSize=50');
      expect(f.calls.map(({ method, url, headers }) => ({ method, url, headers }))).toEqual([{ method: 'GET', url: `${SERVICE}/drilldown/tpls01?fromdate=2026-01-01&todate=2026-01-31&page=3&pageSize=50`, headers: { Accept: 'application/json' } }]);
      f.calls.length = 0;
      await ask(f, 'code=T-PLS-01&fromdate=&todate=2026-01-31');
      expect(f.calls[0].url).toBe(`${SERVICE}/drilldown/tpls01?todate=2026-01-31&page=1&pageSize=100`);
    });

    it('T-CS-01 takes no date range: the dates the page sent are not forwarded', async () => {
      const f = fake(() => ({ result: [] }));
      await ask(f, 'code=T-CS-01&fromdate=2026-01-01&todate=2026-01-31');
      expect(f.calls[0].url).toBe(`${SERVICE}/drilldown/tcs01?page=1&pageSize=100`);
    });

    it('finds the report by code in any style: "tcs01", "t-cs-01", "T-CS-01"', async () => {
      const f = fake(() => ({ result: [] }));
      for (const code of ['tcs01', 't-cs-01', 'T-CS-01', 'TCS01']) await ask(f, `code=${code}`);
      expect(new Set(f.calls.map((c) => c.url)).size).toBe(1);
    });

    it('page defaults to 1 and is at least 1; pageSize defaults to 100, at least 1, at most 2000; text that is not an int is the default', async () => {
      const f = fake(() => ({ result: [] }));
      const of = async (q: string) => {
        f.calls.length = 0;
        const r = await ask(f, `code=T-LS-01&${q}`);
        return { page: data(r.body).page, pageSize: data(r.body).pageSize, url: f.calls[0].url.split('?')[1] };
      };
      expect(await of('page=0&pageSize=0')).toMatchObject({ page: 1, pageSize: 1, url: 'page=1&pageSize=1' });
      expect(await of('page=-4&pageSize=99999')).toMatchObject({ page: 1, pageSize: 2000 });
      expect(await of('page=abc&pageSize=1.5')).toMatchObject({ page: 1, pageSize: 100 });
      expect(await of('page=%2B7&pageSize=%2020%20')).toMatchObject({ page: 7, pageSize: 20 });
      // Integer.parseInt fails above the int range: the default, not the maximum
      expect(await of('page=2147483648&pageSize=')).toMatchObject({ page: 1, pageSize: 100 });
      expect(await of('page=2147483647')).toMatchObject({ page: 2147483647 });
    });
  });

  describe('when the service does not answer 200', () => {
    const empty = (code: string, page = 1, pageSize = 100) => ({ code, supportsDateRange: code !== 'T-CS-01', columns: [], rows: [], page, pageSize, total: 0 });

    it('success:false with the message of the service (error.message first, then message) and empty data of the requested page', async () => {
      const a = fake(() => ({ status: 403, text: JSON.stringify({ message: 'top', error: { message: 'Forbidden: CRM_Dashboard_View' } }) }));
      const ra = await ask(a, 'code=T-CS-01&page=2&pageSize=10');
      expect(ra.status).toBe(200);
      expect(ra.body).toEqual({ success: false, message: 'Forbidden: CRM_Dashboard_View', data: empty('T-CS-01', 2, 10) });
      const b = fake(() => ({ status: 500, text: JSON.stringify({ message: 'boom', error: 'x' }) }));
      expect((await ask(b, 'code=T-LS-02')).body.message).toBe('boom');
    });

    it('without a message in the body: "เรียกข้อมูลรายงานไม่สำเร็จ (HTTP <status>)" — also for no answer at all (0) and for a body that is not JSON', async () => {
      for (const [status, text] of [[500, ''], [502, '<html>Bad Gateway</html>'], [0, ''], [404, '{"error":{}}'], [201, '{"result":[]}']] as const) {
        const f = fake(() => ({ status, text }));
        const r = await ask(f, 'code=T-LS-03');
        expect(r.body.success, String(status)).toBe(false);
        expect(r.body.message).toBe(`เรียกข้อมูลรายงานไม่สำเร็จ (HTTP ${status})`);
        expect(r.body.data).toEqual(empty('T-LS-03'));
      }
    });
  });

  describe('the rows', () => {
    const ok = (e: DrilldownEnvelope) => {
      expect(e.success).toBe(true);
      expect(e.message).toBe('Success');
      return data(e);
    };

    it('an answer without a list of rows is a success with empty data (not an error)', async () => {
      for (const body of ['{}', '{"status":200}', 'not json', '"text"', '42', '', '{"result":"x"}', '{"data":{"other":[]}}']) {
        const f = fake(() => body);
        const d = ok((await ask(f, 'code=T-LS-04')).body);
        expect(d, body).toMatchObject({ columns: [], rows: [], total: 0 });
      }
    });

    it('finds the rows in result / data / items / content / rows / list / records, in that order, also one level deeper; an array at the top counts as `result`', async () => {
      const row = { CUSTOMER_CODE: 'PP-1' };
      const shapes: unknown[] = [{ result: [row] }, { data: [row] }, { items: [row] }, { content: [row] }, { rows: [row] }, { list: [row] }, { records: [row] }, { data: { items: [row] } }, { result: { records: [row] } }, [row]];
      for (const shape of shapes) {
        const f = fake(() => shape as object);
        const d = ok((await ask(f, 'code=T-LS-04')).body);
        expect(d.rows, JSON.stringify(shape)).toEqual([{ CUSTOMER_CODE: 'PP-1' }]);
      }
      // `result` wins over `data`
      const both = fake(() => ({ data: [{ CUSTOMER_CODE: 'B' }], result: [{ CUSTOMER_CODE: 'A' }] }));
      expect(ok((await ask(both, 'code=T-LS-04')).body).rows).toEqual([{ CUSTOMER_CODE: 'A' }]);
    });

    it('the columns follow the dictionary, not the order of the service; the internal fields are dropped; an unknown field follows at the end with a humanized title', async () => {
      const f = fake(() => ({
        result: [{ id: 7, RowNumber: 1, PPNAME: 'สมชาย', zz_extra_field: 'x', PPCODE: 'PP-1', brandNewField: 'y', CASE_MONTH_TXT: '01/2026' }],
      }));
      const d = ok((await ask(f, 'code=T-LS-01')).body);
      const keys = d.columns.map((c) => c.key);
      // the T-LS-01 dictionary decides the order (MTH, PP-Code, name); the unknown fields follow in the order the service sent them
      expect(keys).toEqual(['CASE_MONTH_TXT', 'PPCODE', 'PPNAME', 'zz_extra_field', 'brandNewField']);
      expect(keys).not.toContain('id');
      expect(keys).not.toContain('RowNumber');
      const byKey = Object.fromEntries(d.columns.map((c) => [c.key, c]));
      expect(byKey['PPCODE']).toEqual({ key: 'PPCODE', label: 'PP-Code', mapped: true });
      expect(byKey['zz_extra_field']).toEqual({ key: 'zz_extra_field', label: 'Zz extra field', mapped: false });
      expect(byKey['brandNewField']).toEqual({ key: 'brandNewField', label: 'Brand new field', mapped: false });
      expect(Object.keys(d.rows[0])).toEqual(keys);
    });

    it('a field whose title is hidden (เป้าเดือน …) is not a column and not a cell', async () => {
      const f = fake(() => ({ result: [{ CUSTOMER_CODE: 'PP-1', TARGET_MONTH_YEAR: '01/2026' }] }));
      const d = ok((await ask(f, 'code=T-CS-01')).body);
      expect(d.columns.map((c) => c.key)).toEqual(['CUSTOMER_CODE']);
      expect(d.rows[0]).toEqual({ CUSTOMER_CODE: 'PP-1' });
    });

    it('T-CS-01 Profile = the four source fields joined by a space (empty ones skipped), and the sources are not columns of their own', async () => {
      const f = fake(() => ({
        result: [
          { cs_type_service: 'เต็มรูปแบบ', CsVip: 'VIP', CS_TRANSLATE: '', CS_INCOME_TYPE: ' ฟรีแลนซ์ ', CUSTOMER_CODE: 'PP-1' },
          { CUSTOMER_CODE: 'PP-2' },
        ],
      }));
      const d = ok((await ask(f, 'code=T-CS-01')).body);
      expect(d.columns.map((c) => [c.key, c.label, c.mapped])).toEqual([
        ['CUSTOMER_CODE', 'PP-Code', true],
        ['vcolprofile', 'Profile', true],
      ]);
      expect(d.rows).toEqual([
        { CUSTOMER_CODE: 'PP-1', vcolprofile: 'เต็มรูปแบบ VIP ฟรีแลนซ์' },
        { CUSTOMER_CODE: 'PP-2', vcolprofile: '' },
      ]);
    });

    it('every value is text: numbers keep their written form, null is empty, booleans are true/false, a nested value is compact JSON', async () => {
      const f = fake(
        () =>
          '{"result":[{"CUSTOMER_CODE":"PP-1","SPRVMINUS":12.50,"PLSMINUS":9007199254740993,"CONTENT":null,"SLA_CS_01_PLSDATE":true,"PLS_APPROVAL_DATE":false,"TXDATE":{"a":[1,2.0,{"b":"x\\"y"}]},"CHANGEDATE":"2026-08-01T00:00:00"}]}',
      );
      const d = ok((await ask(f, 'code=T-CS-01')).body);
      expect(d.rows[0]).toMatchObject({
        SPRVMINUS: '12.50',
        PLSMINUS: '9007199254740993',
        CONTENT: '',
        SLA_CS_01_PLSDATE: 'true',
        PLS_APPROVAL_DATE: 'false',
        TXDATE: '{"a":[1,2.0,{"b":"x\\"y"}]}',
        CHANGEDATE: '2026-08-01T00:00:00',
      });
    });

    it('rows that are not objects are skipped; a field missing in a row is an empty cell', async () => {
      const f = fake(() => ({ result: [{ CUSTOMER_CODE: 'PP-1', CUSTOMER_NAME: 'ก' }, 5, 'x', null, { CUSTOMER_CODE: 'PP-2' }] }));
      const d = ok((await ask(f, 'code=T-LS-01')).body);
      expect(d.rows).toEqual([
        { CUSTOMER_CODE: 'PP-1', CUSTOMER_NAME: 'ก' },
        { CUSTOMER_CODE: 'PP-2', CUSTOMER_NAME: '' },
      ]);
      // (the total falls back to the number of ITEMS of the array, the skipped ones included)
      expect(d.total).toBe(5);
    });

    it('only the first 30 rows decide the columns', async () => {
      const rows: Record<string, string>[] = Array.from({ length: 31 }, () => ({ CUSTOMER_CODE: 'PP' }));
      rows[30] = { CUSTOMER_CODE: 'PP', LATE_FIELD: 'x' };
      const f = fake(() => ({ result: rows }));
      expect(ok((await ask(f, 'code=T-LS-01')).body).columns.map((c) => c.key)).toEqual(['CUSTOMER_CODE']);
      rows[29] = { CUSTOMER_CODE: 'PP', LATE_FIELD: 'x' };
      expect(ok((await ask(f, 'code=T-LS-01')).body).columns.map((c) => c.key)).toEqual(['CUSTOMER_CODE', 'LATE_FIELD']);
    });
  });

  describe('the total', () => {
    const totalOf = async (body: object): Promise<number> => data((await ask(fake(() => body), 'code=T-LS-01')).body).total;
    const two = [{ CUSTOMER_CODE: 'a' }, { CUSTOMER_CODE: 'b' }];

    it('is read from the root (total, totalRecords, totalRecord, totalElements, totalCount, count, recordsTotal — that order), as a number or as text', async () => {
      expect(await totalOf({ result: two, total: 120 })).toBe(120);
      expect(await totalOf({ result: two, totalRecords: '77' })).toBe(77);
      expect(await totalOf({ result: two, count: 5, totalElements: 9 })).toBe(9);
      expect(await totalOf({ result: two, recordsTotal: 3.9 })).toBe(3);
      expect(await totalOf({ result: two, total: ' 41 ' })).toBe(41);
    });

    it('then from the object that holds the rows; then the number of rows', async () => {
      expect(await totalOf({ data: { items: two, totalElements: 300 } })).toBe(300);
      expect(await totalOf({ data: two })).toBe(2);
      // a total that is not a number is ignored
      expect(await totalOf({ result: two, total: 'many', count: 4 })).toBe(4);
      expect(await totalOf({ result: two, total: null, totalCount: [] })).toBe(2);
    });
  });
});
