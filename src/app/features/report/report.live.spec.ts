import { afterEach, describe, expect, it, vi } from 'vitest';
import { fakeRest } from '@core/live/rest-fake';
import { REPORT_CODES, reportRole } from '@core/permissions/report-roles';
import { createLiveReport, reportNotConnectedText, reportPdfAnswer } from './report.live';
import { REPORT_DATA } from './report.data.generated';

const setup = (roles: string[] = [], answer: (path: string) => object | string = () => ({})) => {
  const { deps, calls } = fakeRest((c) => answer(c.path), { roles });
  return { deps, calls, backend: createLiveReport(deps) };
};

describe('Report page — live backend', () => {
  afterEach(() => vi.restoreAllMocks());

  it('reportPermJson: one flag per report of the registry, true where the user has Report_<CODE>_View', () => {
    const roles = [reportRole('CRMG10'), reportRole('SUN-LD-01')];
    const { backend } = setup(roles);
    const perm = backend.initial({ hasRole: (r) => roles.includes(r) }).reportPermJson;
    expect(Object.keys(perm)).toEqual([...REPORT_CODES]);
    expect(Object.entries(perm).filter(([, v]) => v).map(([k]) => k)).toEqual(['CRMG10', 'SUN-LD-01']);
  });

  it('serves the data file of the Java web app (resources/mock/report_mock.json) without calling any service', async () => {
    const { backend, calls } = setup();
    const r = await backend.fetch('/resources/mock/report_mock.json');
    expect(r.status).toBe(200);
    expect(await r.json()).toEqual(JSON.parse(JSON.stringify(REPORT_DATA)));
    expect(calls).toHaveLength(0);
  });

  it('answers the filter lists with the board master routes: chat-master-data (the envelope of the service) and employees (a bare array)', async () => {
    const { backend, calls } = setup([], (path) =>
      path.startsWith('/master-data/employees')
        ? { status: 200, result: [{ id: 3, code: 'E3', name: 'สมศรี', extra: 1 }] }
        : { status: 200, message: 'success', result: [{ code: 'MC1', name: 'Facebook' }] },
    );
    const channels = await (await backend.fetch('/board/chat-master-data?type=marketing-channels')).json();
    expect(channels).toEqual({ status: 200, message: 'success', result: [{ code: 'MC1', name: 'Facebook' }] });
    const employees = await (await backend.fetch('/board/employees')).json();
    expect(employees).toEqual([{ id: 3, code: 'E3', name: 'สมศรี', nameTh: '', colorCode: '', attachFile: '', postCode: '' }]);
    expect(calls.map((c) => c.path)).toEqual(['/master-data/marketing-channels', '/master-data/employees']);
    expect((await backend.fetch('/board/chat-master-data?type=nope')).status).toBe(400);
  });

  describe('/report-pdf (ReportPdfServlet): the servlet checks it can make, then 501 — the report host has no REST endpoint', () => {
    it('400 for a missing / malformed code (letters, digits, _ and - only, 2–24 long)', () => {
      const { deps } = setup(['Report_CRMG10_View']);
      for (const code of ['', ' ', 'a', 'x'.repeat(25), 'CRM G10', "CRMG10'--", '../x']) {
        const a = reportPdfAnswer(deps, new URLSearchParams({ code }));
        expect(a, JSON.stringify(code)).toEqual({ status: 400, body: 'ต้องระบุรหัสรายงาน (code) ให้ถูกต้อง' });
      }
      expect(reportPdfAnswer(deps, new URLSearchParams()).status).toBe(400);
    });

    it('403 without Report_<CODE>_View (the text names the report)', () => {
      const { deps } = setup(['Report_CRMG11_View']);
      expect(reportPdfAnswer(deps, new URLSearchParams({ code: 'CRMG10' }))).toEqual({ status: 403, body: 'ไม่มีสิทธิ์เรียกดูรายงาน CRMG10' });
    });

    it('501 with the "not connected" text when the user may see it; the call itself goes through fetch as text/plain', async () => {
      const { backend, calls } = setup(['Report_CRMG10_View']);
      const r = await backend.fetch('/report-pdf?code=CRMG10&dateRange_from=2026-01-01');
      expect(r.status).toBe(501);
      expect(r.headers.get('content-type')).toBe('text/plain; charset=UTF-8');
      expect(await r.text()).toBe(reportNotConnectedText('CRMG10'));
      expect(calls).toHaveLength(0);
    });

    it('reportUrl: the new tab loads a text/plain blob with what the servlet answered', async () => {
      const blobs: Blob[] = [];
      const original = URL.createObjectURL;
      URL.createObjectURL = (b: Blob | MediaSource) => (blobs.push(b as Blob), `blob:test/${blobs.length}`);
      try {
        const { backend } = setup(['Report_CRMG10_View']);
        expect(backend.reportUrl('/report-pdf?code=CRMG10')).toBe('blob:test/1');
        expect(backend.reportUrl('/report-pdf?code=SUN-LD-01')).toBe('blob:test/2');
        expect(blobs.map((b) => b.type)).toEqual(['text/plain;charset=utf-8', 'text/plain;charset=utf-8']); // (a Blob lower-cases its type)
        expect(await blobs[0].text()).toBe(reportNotConnectedText('CRMG10'));
        expect(await blobs[1].text()).toBe('ไม่มีสิทธิ์เรียกดูรายงาน SUN-LD-01');
      } finally {
        URL.createObjectURL = original;
      }
    });
  });

  it('answers a route it does not know with a 404', async () => {
    expect((await setup().backend.fetch('/board/nothing')).status).toBe(404);
  });
});
