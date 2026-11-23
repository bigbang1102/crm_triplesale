import { provideHttpClient, withInterceptors } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { ConfigService } from '@core/config/config.service';
import { ApiError } from '@core/http/api-error';
import { apiErrorInterceptor } from '@core/http/interceptors';
import { configStub } from '@core/testing/test-helpers';
import { ForecastBackend, isUnavailable } from './forecast.backend';

const BASE = '/triplesale-service/api/v1/forecast';
/** let the pending call reach HttpClient before the test answers it */
const tick = () => new Promise((r) => setTimeout(r));

describe('ForecastBackend — the real API first, the prototype data when it is not there', () => {
  let http: HttpTestingController;
  let backend: ForecastBackend;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [
        // the app's own error interceptor: the page sees ApiError, exactly as at runtime
        provideHttpClient(withInterceptors([apiErrorInterceptor])),
        provideHttpClientTesting(),
        { provide: ConfigService, useValue: configStub({ mock: false }) },
      ],
    });
    http = TestBed.inject(HttpTestingController);
    backend = TestBed.inject(ForecastBackend);
  });
  afterEach(() => http.verify());

  it('uses the answer of the API when there is one (no sample data, no "offline" badge)', async () => {
    const p = backend.configs();
    await tick();
    http.expectOne(`${BASE}/configs`).flush({ status: 200, result: { items: [{ id: 'REAL', code: 'FC-REAL' }] } });
    expect((await p).items.map((c) => c.code)).toEqual(['FC-REAL']);
    expect(backend.offline()).toBe(false);
  });

  it.each([
    ['no route (404)', 404],
    ['method not there (405)', 405],
    ['server error (500)', 500],
    ['the mock interceptor of `npm start` (501)', 501],
    ['bad gateway (502)', 502],
  ])('falls back to the prototype data on %s', async (_name, status) => {
    const p = backend.configs();
    await tick();
    http.expectOne(`${BASE}/configs`).flush({ message: 'x' }, { status, statusText: 'x' });
    expect((await p).items.map((c) => c.code)).toEqual(['FC-2027', 'FC-2026', 'FC-2025']);
    expect(backend.offline()).toBe(true);
  });

  it('falls back when the service cannot be reached at all (status 0)', async () => {
    const p = backend.lookups();
    await tick();
    http.expectOne(`${BASE}/lookups`).error(new ProgressEvent('error'));
    expect((await p).pipelines.map((x) => x.name)).toEqual(['ขายโครงการ', 'ขายปลีก']);
    expect(backend.offline()).toBe(true);
  });

  it('falls back when the answer is the dev server\'s index.html instead of JSON', async () => {
    const p = backend.lookups();
    await tick();
    http.expectOne(`${BASE}/lookups`).flush('<!doctype html><html><body></body></html>');
    expect((await p).currentMonth).toBe('2026-11');
    expect(backend.offline()).toBe(true);
  });

  it.each([
    ['conflict (409)', 409],
    ['validation (422)', 422],
    ['locked (423)', 423],
    ['forbidden (403)', 403],
  ])('does NOT fall back on an answer of a working API: %s is shown to the user', async (_name, status) => {
    const p = backend.saveWorkspace('C2', { rowVersion: 1 });
    await tick();
    http.expectOne(`${BASE}/configs/C2`).flush({ message: 'ข้อมูลถูกแก้ไปก่อน' }, { status, statusText: 'x' });
    await expect(p).rejects.toMatchObject({ status, message: 'ข้อมูลถูกแก้ไปก่อน' });
    expect(backend.offline()).toBe(false);
  });

  it('every one of the 14 endpoints is tried on the API first and answered by the mock when it fails', async () => {
    const calls: [string, string, () => Promise<unknown>][] = [
      ['GET', '/lookups', () => backend.lookups()],
      ['GET', '/configs', () => backend.configs()],
      ['GET', '/configs/C2', () => backend.configDetail('C2', 'versions')],
      ['GET', '/configs/C2/targets', () => backend.targets('C2', { periodIds: ['C2-2026-11'], pipelineId: 'P1' })],
      ['POST', '/summary', () => backend.summary({ periodId: 'C2-2026-11', pipelineId: 'all' })],
      ['GET', '/opportunities', () => backend.opportunities({ periodId: 'C2-2026-11' })],
      ['GET', '/configs/C2/periods', () => backend.periods('C2', true)],
      ['GET', '/dashboard', () => backend.dashboard({ level: 'month', year: 2026, month: 11, pipelineId: 'all' })],
      ['GET', '/history', () => backend.history()],
      ['POST', '/configs', () => backend.createConfig({ config: { code: 'FC-2028', name: 'Sales Forecast ปี 2028', year: 2028 } })],
      ['PUT', '/configs/C2', () => backend.saveWorkspace('C2', { rowVersion: 1, targets: [{ periodId: 'C2-2026-12', employeeId: 'E01', pipelineId: 'P1', amount: 1 }] })],
      ['POST', '/configs/C3/status', () => backend.configStatus('C3', { action: 'release', rowVersion: 1 })],
      ['POST', '/adjustments', () => backend.saveAdjustments({ periodId: 'C2-2026-11', judgments: [], adjustments: [{ employeeId: 'E01', pipelineId: 'P1', delta: 1000, reason: 'ทดสอบ' }] })],
      ['POST', '/periods/C2-2026-11/status', () => backend.periodStatus('C2-2026-11', { action: 'close', reason: 'สิ้นเดือน', rowVersion: 1 })],
    ];
    for (const [method, path, run] of calls) {
      const p = run();
      await tick();
      const req = http.expectOne((r) => r.url === BASE + path);
      expect(req.request.method, path).toBe(method);
      req.flush('Not Found', { status: 404, statusText: 'Not Found' });
      expect(await p, path).toBeTruthy();
    }
    expect(backend.offline()).toBe(true);
    // the writes above landed in the mock: the page keeps working without a backend
    expect(backend.mock.configs().items.map((c) => [c.code, c.status])).toEqual([
      ['FC-2028', 'draft'],
      ['FC-2027', 'release'],
      ['FC-2026', 'release'],
      ['FC-2025', 'block'],
    ]);
    expect(backend.mock.periods('C2', true).items[10]).toMatchObject({ status: 'closed', closedBy: 'System Configurator' });
  });

  it('a rule the mock enforces is an error with a message, like the API would answer', async () => {
    const p = backend.createConfig({ config: { code: 'fc-2026', name: 'ซ้ำ', year: 2028 } });
    await tick();
    http.expectOne(`${BASE}/configs`).flush(null, { status: 503, statusText: 'x' });
    await expect(p).rejects.toMatchObject({ status: 422, message: 'รหัสนี้มีอยู่แล้ว' });
  });

  it('the company / simulated role of the prototype only steer the mock', async () => {
    backend.setMockSession({ role: 'sales' });
    const p = backend.lookups();
    await tick();
    http.expectOne(`${BASE}/lookups`).flush(null, { status: 404, statusText: 'x' });
    const lk = await p;
    expect(lk.teams.map((t) => [t.id, t.employees.map((e) => e.id)])).toEqual([['A', ['E01']]]);
    expect(lk.permissions).toEqual({ canConfig: false, canTarget: false, canAdjust: false, canClose: false, canReopen: false });
  });

  it('history export: the file of the API, or null when the API is not there (the page then says so)', async () => {
    const ok = backend.historyExport({ type: 'config' });
    await tick();
    http.expectOne(`${BASE}/history?type=config&format=xlsx`).flush(new Blob(['xlsx'], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }));
    expect(await ok).toBeInstanceOf(Blob);

    const none = backend.historyExport();
    await tick();
    http.expectOne(`${BASE}/history?format=xlsx`).flush(new Blob(['<html>'], { type: 'text/html' }));
    expect(await none).toBeNull();

    const gone = backend.historyExport();
    await tick();
    http.expectOne(`${BASE}/history?format=xlsx`).flush(new Blob(['x']), { status: 404, statusText: 'x' });
    expect(await gone).toBeNull();
  });

  it('isUnavailable: only "the API is not there" counts', () => {
    for (const s of [0, 404, 405, 500, 501, 502, 503, 504, 200]) expect(isUnavailable(new ApiError(s, 'x')), String(s)).toBe(true);
    for (const s of [400, 401, 403, 409, 422, 423]) expect(isUnavailable(new ApiError(s, 'x')), String(s)).toBe(false);
    expect(isUnavailable(new Error('boom'))).toBe(false);
    expect(isUnavailable(null)).toBe(false);
  });
});
