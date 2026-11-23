import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { firstValueFrom } from 'rxjs';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { ConfigService } from '@core/config/config.service';
import { configStub } from '@core/testing/test-helpers';
import { ForecastApi } from './forecast.api';

/** base path of the "Endpoint ที่ใช้" tab (`/api/v1/forecast`) under the gateway prefix of triplesale-service */
const BASE = '/triplesale-service/api/v1/forecast';

describe('ForecastApi — method + path + parameters of the 14 endpoints of the prototype', () => {
  let http: HttpTestingController;
  let api: ForecastApi;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [provideHttpClient(), provideHttpClientTesting(), { provide: ConfigService, useValue: configStub({ mock: false }) }],
    });
    http = TestBed.inject(HttpTestingController);
    api = TestBed.inject(ForecastApi);
  });
  afterEach(() => http.verify());

  /** the one pending request: its method, path and query as text */
  const sent = () => {
    const [req] = http.match(() => true);
    return { req, line: `${req.request.method} ${req.request.urlWithParams}` };
  };

  it('EP-01 GET /lookups (configId / include only when given)', async () => {
    const p = firstValueFrom(api.lookups());
    const a = sent();
    expect(a.line).toBe(`GET ${BASE}/lookups`);
    a.req.flush({ pipelines: [] });
    expect(await p).toEqual({ pipelines: [] });

    void firstValueFrom(api.lookups({ configId: 'C2', include: 'pipelines,teams' }));
    const b = sent();
    expect(b.line).toBe(`GET ${BASE}/lookups?configId=C2&include=pipelines,teams`);
    b.req.flush({});
  });

  it('EP-02 GET /configs with year / status / sort', () => {
    void firstValueFrom(api.configs({ year: 2026, status: 'release', sort: '-year' }));
    const a = sent();
    expect(a.line).toBe(`GET ${BASE}/configs?year=2026&status=release&sort=-year`);
    a.req.flush({ items: [] });

    void firstValueFrom(api.configs());
    const b = sent();
    expect(b.line).toBe(`GET ${BASE}/configs`);
    b.req.flush({ items: [] });
  });

  it('EP-03 GET /configs/{id} (include=versions for the version history)', () => {
    void firstValueFrom(api.configDetail('C2', 'versions'));
    const a = sent();
    expect(a.line).toBe(`GET ${BASE}/configs/C2?include=versions`);
    a.req.flush({ config: {} });

    void firstValueFrom(api.configDetail('a/b'));
    const b = sent();
    expect(b.line).toBe(`GET ${BASE}/configs/a%2Fb`); // ids are path segments
    b.req.flush({ config: {} });
  });

  it('EP-04 POST /configs — create, copy (copyFromId) and the first targets in one body', () => {
    const body = { config: { code: 'FC-2028', name: 'x', fiscalYearId: 'FY2028' }, copyFromId: 'C2', targets: [{ periodNo: 1, employeeId: 'E01', pipelineId: 'P1', amount: 5 }] };
    void firstValueFrom(api.createConfig(body));
    const a = sent();
    expect(a.line).toBe(`POST ${BASE}/configs`);
    expect(a.req.request.body).toEqual(body);
    a.req.flush({ config: {} });
  });

  it('EP-05 PUT /configs/{id} — the single save of the workspace (rowVersion + changed fields + targets)', () => {
    const body = { rowVersion: 3, config: { openFormula: 'full' as const }, targets: [{ periodId: 'p11', employeeId: 'E01', pipelineId: 'P1', amount: null }], teamTargets: [{ periodId: 'p11', pipelineId: 'P1', positionId: 'A', amount: 9 }] };
    void firstValueFrom(api.saveWorkspace('C2', body));
    const a = sent();
    expect(a.line).toBe(`PUT ${BASE}/configs/C2`);
    expect(a.req.request.body).toEqual(body);
    a.req.flush({ config: {}, saved: 2, commitBatchId: 'B1' });
  });

  it('EP-06 POST /configs/{id}/status — release | block | unblock | delete by action', () => {
    void firstValueFrom(api.configStatus('C2', { action: 'block', reason: 'r', rowVersion: 3 }));
    const a = sent();
    expect(a.line).toBe(`POST ${BASE}/configs/C2/status`);
    expect(a.req.request.body).toEqual({ action: 'block', reason: 'r', rowVersion: 3 });
    a.req.flush({ config: {} });
  });

  it('EP-07 GET /configs/{id}/targets with periodIds[] + pipelineId (+ teamId)', () => {
    void firstValueFrom(api.targets('C2', { periodIds: ['p11', 'p12'], pipelineId: 'P1', teamId: 'A' }));
    const a = sent();
    expect(a.line).toBe(`GET ${BASE}/configs/C2/targets?periodIds=p11,p12&pipelineId=P1&teamId=A`);
    a.req.flush({ rows: [] });
  });

  it('EP-08 POST /summary — scope in the body, the unsaved draft too (preview)', () => {
    const body = { periodId: 'p11', pipelineId: 'all', teamId: 'A', draft: { judgments: [{ opportunityId: 'OPP-001', reset: true as const }], adjustments: [] } };
    void firstValueFrom(api.summary(body));
    const a = sent();
    expect(a.line).toBe(`POST ${BASE}/summary`);
    expect(a.req.request.body).toEqual(body);
    a.req.flush({ totals: {} });
  });

  it('EP-09 GET /opportunities with periodId + scope + paging', () => {
    void firstValueFrom(api.opportunities({ periodId: 'p11', pipelineId: 'P2', teamId: 'B', employeeId: 'E03', page: 2, pageSize: 50 }));
    const a = sent();
    expect(a.line).toBe(`GET ${BASE}/opportunities?periodId=p11&pipelineId=P2&teamId=B&employeeId=E03&page=2&pageSize=50`);
    a.req.flush({ items: [] });
  });

  it('EP-10 POST /adjustments — judgments + manager adjustments of one period', () => {
    const body = {
      periodId: 'p11',
      judgments: [{ opportunityId: 'OPP-001', in: false, probability: 80, amount: 10, category: 'committed' as const, reason: 'r' }],
      adjustments: [{ employeeId: 'E04', pipelineId: 'P1', delta: -5, reason: 'r' }],
    };
    void firstValueFrom(api.saveAdjustments(body));
    const a = sent();
    expect(a.line).toBe(`POST ${BASE}/adjustments`);
    expect(a.req.request.body).toEqual(body);
    a.req.flush({ saved: 2, commitBatchId: 'B2' });
  });

  it('EP-11 GET /configs/{id}/periods (includeTotals only when asked)', () => {
    void firstValueFrom(api.periods('C2', true));
    const a = sent();
    expect(a.line).toBe(`GET ${BASE}/configs/C2/periods?includeTotals=true`);
    a.req.flush({ items: [] });

    void firstValueFrom(api.periods('C2'));
    const b = sent();
    expect(b.line).toBe(`GET ${BASE}/configs/C2/periods`);
    b.req.flush({ items: [] });
  });

  it('EP-12 POST /periods/{id}/status — close | reopen with a reason', () => {
    void firstValueFrom(api.periodStatus('p11', { action: 'close', reason: 'สิ้นเดือน', rowVersion: 1 }));
    const a = sent();
    expect(a.line).toBe(`POST ${BASE}/periods/p11/status`);
    expect(a.req.request.body).toEqual({ action: 'close', reason: 'สิ้นเดือน', rowVersion: 1 });
    a.req.flush({ period: {} });
  });

  it('EP-13 GET /dashboard with level + year / quarter / month + pipelineId (+ teamId)', () => {
    void firstValueFrom(api.dashboard({ level: 'quarter', year: 2026, quarter: 4, pipelineId: 'all', teamId: 'A' }));
    const a = sent();
    expect(a.line).toBe(`GET ${BASE}/dashboard?level=quarter&year=2026&quarter=4&pipelineId=all&teamId=A`);
    a.req.flush({ outlook: [] });

    void firstValueFrom(api.dashboard({ level: 'month', year: 2026, month: 11, pipelineId: 'P1' }));
    const b = sent();
    expect(b.line).toBe(`GET ${BASE}/dashboard?level=month&year=2026&month=11&pipelineId=P1`);
    b.req.flush({ outlook: [] });
  });

  it('EP-14 GET /history with the filters; the export is the same call with format=xlsx (a file)', async () => {
    void firstValueFrom(api.history({ type: 'judgment', configId: 'C2', page: 1, pageSize: 20 }));
    const a = sent();
    expect(a.line).toBe(`GET ${BASE}/history?type=judgment&configId=C2&page=1&pageSize=20`);
    a.req.flush({ items: [], total: 0 });

    const p = firstValueFrom(api.historyExport({ type: 'judgment' }));
    const b = sent();
    expect(b.line).toBe(`GET ${BASE}/history?type=judgment&format=xlsx`);
    expect(b.req.request.responseType).toBe('blob');
    b.req.flush(new Blob(['x']));
    expect(await p).toBeInstanceOf(Blob);
  });

  it('answers: the standard envelope of the service is unwrapped, a bare body is taken as it is', async () => {
    const wrapped = firstValueFrom(api.configs());
    sent().req.flush({ status: 200, message: 'success', result: { items: [{ id: 'C1' }] } });
    expect(await wrapped).toEqual({ items: [{ id: 'C1' }] });

    const bare = firstValueFrom(api.configs());
    sent().req.flush({ items: [{ id: 'C2' }] });
    expect(await bare).toEqual({ items: [{ id: 'C2' }] });
  });

  it('answers: an envelope that says "failed" and a body that is not JSON data are errors', async () => {
    const failed = firstValueFrom(api.configs());
    sent().req.flush({ status: 422, message: 'รหัสซ้ำ', result: null });
    await expect(failed).rejects.toMatchObject({ status: 422, message: 'รหัสซ้ำ' });

    // the dev server answers an unknown path with index.html: nothing to show — status 0 = "not available"
    const html = firstValueFrom(api.lookups());
    sent().req.flush('<!doctype html><html></html>');
    await expect(html).rejects.toMatchObject({ status: 0 });

    const empty = firstValueFrom(api.lookups());
    sent().req.flush({ status: 200, result: null });
    await expect(empty).rejects.toMatchObject({ status: 0 });
  });
});
