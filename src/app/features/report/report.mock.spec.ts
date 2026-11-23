import { describe, expect, it } from 'vitest';
import { REPORT_CODES, reportRole } from '@core/permissions/report-roles';
import { REPORT_DATA } from './report.data.generated';
import { createMockReport, tinyPdf } from './report.mock';

const backend = createMockReport();
const json = async (url: string) => (await backend.fetch(url)).json();

describe('Report mock backend (the answers of the Java servlets)', () => {
  it('serves the data file of the page: groups of reports + the filter definitions', async () => {
    const data = await json('/resources/mock/report_mock.json');
    expect(data).toEqual(REPORT_DATA);
    expect(Object.keys(data.filterDefs)).toContain('dateRange');
    expect(data.groups.map((g: { id: string }) => g.id)).toEqual(['crm', 'sun', 'ggw']);
    // the same file with a context path in front (Java: CTX + RPT_DATA_URL)
    expect(await json('/triplesale/resources/mock/report_mock.json')).toEqual(REPORT_DATA);
  });

  it('answers the master data of the filters: chat-master-data wraps the list, employees is a bare array', async () => {
    for (const type of ['sale-persons', 'communication-types', 'prospects', 'marketing-channels']) {
      const body = await json(`/board/chat-master-data?type=${type}`);
      expect(body.status).toBe(200);
      expect(body.result.length).toBeGreaterThan(2);
      expect(body.result[0]).toEqual({ code: expect.any(String), name: expect.any(String) });
    }
    const employees = await json('/board/employees');
    expect(Array.isArray(employees)).toBe(true);
    expect(employees[0]).toMatchObject({ code: 'E101' });
    const bad = await backend.fetch('/board/chat-master-data?type=nope');
    expect(bad.status).toBe(400);
  });

  it('every filter source of the data file is answered', async () => {
    const sources = new Set<string>();
    const walk = (o: unknown) => {
      if (o && typeof o === 'object') {
        for (const [k, v] of Object.entries(o)) (k === 'source' && typeof v === 'string' ? sources.add(v) : walk(v));
      }
    };
    walk(REPORT_DATA);
    expect(sources.size).toBeGreaterThanOrEqual(4);
    for (const s of sources) expect((await backend.fetch(s)).status, s).toBe(200);
  });

  it('reportPermJson: one entry per report of the registry, true when the user has Report_<CODE>_View', () => {
    const only = new Set([reportRole('CRMG10'), reportRole('SUN-LD-06')]);
    const perm = backend.initial({ hasRole: (r) => only.has(r) }).reportPermJson;
    expect(Object.keys(perm)).toEqual([...REPORT_CODES]);
    expect(Object.entries(perm).filter(([, v]) => v).map(([k]) => k)).toEqual(['CRMG10', 'SUN-LD-06']);
    expect(Object.values(backend.initial({ hasRole: () => true }).reportPermJson).every(Boolean)).toBe(true);
  });

  it('the report URL answers a PDF that says which report and filters were asked for', async () => {
    const r = await backend.fetch('/report-pdf?code=CRMG10&dateRange_from=2026-03-01&dateRange_to=2026-03-31');
    expect(r.status).toBe(200);
    expect(r.headers.get('content-type')).toBe('application/pdf');
    const text = new TextDecoder().decode(await r.arrayBuffer());
    expect(text.startsWith('%PDF-1.4')).toBe(true);
    expect(text).toContain('(code = CRMG10)');
    expect(text).toContain('(dateRange_from = 2026-03-01)');
    expect(text.trimEnd().endsWith('%%EOF')).toBe(true);
  });

  it('tinyPdf escapes what a PDF string cannot hold and keeps a valid cross-reference table', () => {
    const text = new TextDecoder().decode(tinyPdf(['a (b) \\ c', 'ไทย']));
    expect(text).toContain('(a \\(b\\) \\\\ c)');
    expect(text).toContain('(???)');
    const start = Number(/startxref\n(\d+)/.exec(text)![1]);
    expect(text.slice(start, start + 4)).toBe('xref');
  });

  it('an unknown URL is a 404 JSON, so a missing mock is obvious', async () => {
    const r = await backend.fetch('/board/nothing');
    expect(r.status).toBe(404);
  });
});
