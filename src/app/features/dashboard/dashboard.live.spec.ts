import { HttpErrorResponse, HttpResponse, provideHttpClient, withInterceptors } from '@angular/common/http';
import { signal } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { from, mergeMap, of, throwError } from 'rxjs';
import { AuthService } from '@core/auth/auth.service';
import { SessionInfo } from '@core/auth/auth.models';
import { ConfigService } from '@core/config/config.service';
import { I18n } from '@core/i18n/i18n.service';
import { configStub } from '@core/testing/test-helpers';
import type { DashboardBackend, LiveDeps } from './dashboard-backend';
import { Dashboard } from './dashboard';
import { DashboardView } from './dashboard-view';
import { createLiveDashboard, resetLiveDashboardMemory } from './dashboard.live';
import * as P from './dashboard.live.parse';
import { createMockDashboard, resetMockDashboard } from './dashboard.mock';

/**
 * The live backend against a fake dashboard service. Every answer below is synthetic; the shapes are the ones the real service
 * gave on UAT (checked with curl) and the odd ones the Java parsers were written to survive.
 */
const API = '/dashboard-triplesale-service/api/v1';

interface Call {
  method: string;
  url: string;
  body?: unknown;
  headers?: Record<string, string>;
  /** the path below the service base, e.g. `dashboards/daily_trend` */
  path: string;
  q: URLSearchParams;
}
type Answer = string | { status: number; text?: string } | ((c: Call) => string | { status: number; text?: string });

/** a fake `LiveDeps`: `routes` maps `path` or `METHOD path` to the answer (a string = 200 with that body); anything else is a 404 */
function service(routes: Record<string, Answer> = {}, user: LiveDeps['user'] | 'anonymous' = { username: 'tester', employeeCode: 'E900' }) {
  const calls: Call[] = [];
  const deps: LiveDeps = {
    dashboardApi: API,
    user: user === 'anonymous' ? undefined : user,
    call: async (method, url, body, headers) => {
      const u = new URL(url, 'http://svc.test');
      const path = u.pathname.slice(API.length + 1);
      const call: Call = { method, url, body, headers, path, q: u.searchParams };
      calls.push(call);
      let a = routes[`${method} ${path}`] ?? routes[path];
      if (typeof a === 'function') a = a(call);
      if (a === undefined) return { status: 404, text: '{"error":"no such endpoint"}' };
      if (typeof a === 'string') return { status: 200, text: a };
      return { status: a.status, text: a.text ?? '' };
    },
  };
  return { deps, calls, backend: createLiveDashboard(deps) };
}

/** the envelope of the service */
const env = (result: unknown): string => JSON.stringify({ timestamp: 't', message: 'Success', responseCode: 'COMPLETE', status: 200, result });
const FILTERS = 'year=2026&month=all&fromdate=all&todate=all&datebasis=contact&employee=all&chanel=all&country=all&occupation=all&province=all&activitygroup=all&movementtype=AA-1&ggwBranch=SUN';
const chart = async <T = any>(b: DashboardBackend, name: string, extra = ''): Promise<T> => (await b.fetch(`/dashboard/chart-single?chart=${name}&${FILTERS}${extra}`)).json();

beforeEach(() => {
  localStorage.clear();
  resetLiveDashboardMemory();
});
afterEach(() => {
  vi.restoreAllMocks();
  vi.useRealTimers();
  resetMockDashboard();
});

// =========================================================================================================================
describe('Java helpers behind the parsers (org.json getters, URLEncoder)', () => {
  it('firstNonNullInt: getInt truncates a number, parses a string, falls back to a rounded double, skips what is no number', () => {
    expect(P.firstNonNullInt({ a: 12.7 }, 'a')).toBe(12); // JSONObject.getInt of a double: intValue()
    expect(P.firstNonNullInt({ a: '12' }, 'a')).toBe(12);
    expect(P.firstNonNullInt({ a: '12.6' }, 'a')).toBe(13); // Integer.parseInt fails → Math.round(getDouble)
    expect(P.firstNonNullInt({ a: ' 7 ' }, 'a')).toBe(7); // Double.parseDouble trims
    expect(P.firstNonNullInt({ a: true, b: { x: 1 }, c: [1], d: null, e: 'x', f: 4 }, 'a', 'b', 'c', 'd', 'e', 'f')).toBe(4);
    expect(P.firstNonNullInt({}, 'a')).toBe(0);
  });

  it('firstNonNullDouble and firstNonNullString', () => {
    expect(P.firstNonNullDouble({ a: '2.5' }, 'a')).toBe(2.5);
    expect(P.firstNonNullDouble({ a: 'n/a', b: 3 }, 'a', 'b')).toBe(3);
    expect(P.firstNonNullDouble({ a: null }, 'a')).toBe(0);
    // strings come from primitives only: a nested object / array is skipped, not stringified
    expect(P.firstNonNullString({ a: { x: 1 }, b: [1], c: null, d: 5 }, 'a', 'b', 'c', 'd')).toBe('5');
    expect(P.firstNonNullString({ a: true }, 'a')).toBe('true');
    expect(P.firstNonNullString({}, 'a')).toBeNull();
  });

  it('enc is URLEncoder: space is +, ! \' ( ) ~ are escaped, Thai is UTF-8', () => {
    expect(P.enc('a b')).toBe('a+b');
    expect(P.enc("!'()~*-._")).toBe('%21%27%28%29%7E*-._');
    expect(P.enc('ธุรกิจ')).toBe(encodeURIComponent('ธุรกิจ'));
    expect(P.enc(null)).toBe('');
  });

  it('extractArray: bare array, {result}, {data}, {items}, one level deeper, and nothing', () => {
    expect(P.extractArray('[1,2]')).toEqual([1, 2]);
    expect(P.extractArray('{"result":[1]}')).toEqual([1]);
    expect(P.extractArray('{"data":[2]}')).toEqual([2]);
    expect(P.extractArray('{"items":[3]}')).toEqual([3]);
    expect(P.extractArray('{"result":{"totalClosed":3,"items":[4]}}')).toEqual([4]);
    expect(P.extractArray('{"data":{"rows":[5]}}')).toEqual([5]);
    expect(P.extractArray('{"result":{"count":1}}')).toBeNull();
    expect(P.extractArray('{"result":"x"}')).toBeNull();
    expect(P.extractArray('not json')).toBeNull();
    expect(P.extractArray('[broken')).toBeNull();
    expect(P.extractArray('')).toBeNull();
    expect(P.extractArray(null)).toBeNull();
  });

  it('extractObject: the root when it holds KPI keys, else result / data …, a one-element list gives its first object', () => {
    expect(P.extractObject('{"total":3,"result":{"x":1}}')).toEqual({ total: 3, result: { x: 1 } });
    expect(P.extractObject('{"result":{"x":1}}')).toEqual({ x: 1 });
    expect(P.extractObject('{"data":[{"y":2}]}')).toEqual({ y: 2 });
    expect(P.extractObject('{"other":1}')).toEqual({ other: 1 });
    expect(P.extractObject('[1]')).toBeNull();
    expect(P.extractObject(null)).toBeNull();
  });

  it('extractTotalClosed: at the root, inside result / data, 0 otherwise', () => {
    expect(P.extractTotalClosed('{"totalClosed":5}')).toBe(5);
    expect(P.extractTotalClosed('{"result":{"totalClosed":"6","items":[]}}')).toBe(6);
    expect(P.extractTotalClosed('{"data":{"totalClosed":7}}')).toBe(7);
    expect(P.extractTotalClosed('{"result":[]}')).toBe(0);
    expect(P.extractTotalClosed('[]')).toBe(0);
    expect(P.extractTotalClosed(null)).toBe(0);
  });

  it('filters of the servlet: defaults, cs stands in for employee, trimmed, branch only from ggwBranch (never "all" from the parameter)', () => {
    const f = P.chartFiltersOf(new URLSearchParams('chart=cs&cs=E5&month=%20&occupation=%20x%20&ggwbranch=OLD'), new Date(2030, 0, 1));
    expect(f).toMatchObject({ year: '2030', month: 'all', employee: 'E5', occupation: 'x', datebasis: 'contact', movementtype: 'all', ggwBranch: 'OLD' });
    expect(P.chartFiltersOf(new URLSearchParams('employee=E1&cs=E5')).employee).toBe('E1');
    expect(P.ggwBranchOf(new URLSearchParams('ggwBranch=ALL'))).toBe('all');
    expect(P.ggwBranchOf(new URLSearchParams('ggwBranch=&ggwbranch=SUN'))).toBe('SUN');
    expect(P.ggwBranchOf(new URLSearchParams(''))).toBe('all');
  });
});

// =========================================================================================================================
describe('route table of fetch() — each BFF path → the upstream URL', () => {
  const CASES: [string, string, string][] = [
    // [BFF path, upstream path, a query fragment that must be there]
    ['/dashboard/chart-single?chart=trend&year=2026', 'dashboards/daily_trend', 'year=2026'],
    ['/dashboard/chart-single?chart=group&year=2026', 'dashboards/activitygroup_summary', 'year=2026'],
    ['/dashboard/chart-single?chart=cs&year=2026', 'dashboards/cs_performance', 'year=2026'],
    ['/dashboard/chart-single?chart=topCountries&year=2026', 'dashboards/top_countries', 'year=2026'],
    ['/dashboard/chart-single?chart=sourceFunnel&year=2026', 'dashboards/funnel', 'year=2026'],
    ['/dashboard/chart-single?chart=step&year=2026', 'dashboards/latest_step', 'year=2026'],
    ['/dashboard/chart-single?chart=csFunnel&year=2026', 'dashboards/funnel_cs', 'year=2026'],
    ['/dashboard/chart-single?chart=countryFunnel&year=2026', 'dashboards/funnel_country', 'year=2026'],
    ['/dashboard/chart-single?chart=groupPanels&year=2026', 'sundashboard/activitygroup', 'year=2026'],
    ['/dashboard/chart-single?chart=pipelineTable&year=2026', 'sundashboard/pipeline', 'page=1'],
    ['/dashboard/chart-single?chart=statusKpis&year=2026&group=LS', 'dashboards/stage_summary', 'group=LS'],
    ['/dashboard/chart-single?chart=leadBreakdown&year=2026', 'dashboards/lead_breakdown', 'dimension=occupation%2Cbusinesstype%2Cdistrict%2Cchannel%2Ccountry%2Cteam%2Csaleperson'],
    ['/dashboard/chart-single?chart=kpi&year=2026', 'dashboards/overview', 'year=2026'],
    ['/dashboard/api/v1/sundashboard/overview?year=2026', 'dashboards/overview', 'year=2026'], // the only sundashboard path that lives under dashboards
    ['/dashboard/api/v1/sundashboard/pipeline?year=2026&page=3', 'sundashboard/pipeline', 'page=3'],
    ['/dashboard/api/v1/sundashboard/pipeline/detail?group=CS', 'sundashboard/pipeline/detail', 'group=CS'],
    ['/dashboard/api/v1/sundashboard/employee_performance?group=CS', 'sundashboard/employee_performance', 'group=CS'],
    ['/dashboard/api/v1/sundashboard/employee_performance/steps?employeeCode=E1', 'sundashboard/employee_performance/steps', 'employeeCode=E1'],
    ['/dashboard/api/v1/sundashboard/employee_performance/pending_list?page=1', 'sundashboard/employee_performance/pending_list', 'page=1'],
    ['/dashboard/api/v1/sundashboard/employee_performance/completed_list?page=1', 'sundashboard/employee_performance/completed_list', 'page=1'],
    ['/dashboard/api/v1/sundashboard/customer_step_groups?page=1', 'sundashboard/customer_step_groups', 'page=1'],
    ['/dashboard/api/v1/sundashboard/customer_status_list?page=1', 'sundashboard/customer_status_list', 'page=1'],
    ['/dashboard/api/v1/sundashboard/lead_list?page=2', 'sundashboard/lead_list', 'page=2'],
    ['/dashboard/api/v1/sundashboard/lead_list/detail?prospectCode=P1', 'sundashboard/lead_list/detail', 'prospectCode=P1'],
    ['/dashboard/api/v1/sundashboard/masterdata/years', 'sundashboard/masterdata/years', ''],
    ['/dashboard/months?year=2025&ggwBranch=SUN', 'sundashboard/masterdata/months', 'year=2025&ggwBranch=SUN'],
    ['/dashboard/masterdata-activitystep?activitygroup=LS&ggwBranch=SUN', 'sundashboard/masterdata/activitystep', 'activitygroup=LS&ggwBranch=SUN'],
  ];

  it.each(CASES)('%s', async (bff, upstream, fragment) => {
    const { backend, calls } = service();
    const r = await backend.fetch(bff);
    expect(calls.length).toBeGreaterThan(0);
    expect(calls[0].method).toBe('GET');
    expect(calls[0].path).toBe(upstream);
    expect(calls[0].url).toContain(fragment);
    expect(r).toBeInstanceOf(Response);
  });

  it('the whole query of a chart request, in the order of buildFilterQSFull + activitygroup (+ group), every value encoded, ggwBranch once', async () => {
    const { backend, calls } = service();
    const occ = encodeURIComponent('ธุรกิจส่วนตัว');
    await backend.fetch(
      `/dashboard/chart-single?chart=statusKpis&year=2026&month=3&fromdate=2026-03-01&todate=2026-03-31&datebasis=wfs&employee=E1%2CE2&chanel=MKC-001&country=THA&occupation=${occ}&province=B+K&activitygroup=CS&movementtype=AA-1&ggwBranch=SUN&group=LS`,
    );
    expect(calls[0].url).toBe(
      `${API}/dashboards/stage_summary?year=2026&month=3&fromdate=2026-03-01&todate=2026-03-31&datebasis=wfs&employee=E1%2CE2&chanel=MKC-001&country=THA&occupation=${occ}&province=B+K&movementtype=AA-1&ggwBranch=SUN&activitygroup=CS&group=LS`,
    );
    expect(calls[0].url.match(/ggwBranch=/g)).toHaveLength(1); // the page already added it: it is read, not added again
  });

  it('a request without filters gets the servlet defaults (this year, all, contact) and the branch "all"', async () => {
    const { backend, calls } = service();
    await backend.fetch('/dashboard/chart-single?chart=trend');
    expect(calls[0].url).toBe(`${API}/dashboards/daily_trend?year=${new Date().getFullYear()}&month=all&fromdate=all&todate=all&datebasis=contact&employee=all&chanel=all&country=all&occupation=all&province=all&movementtype=all&ggwBranch=all&activitygroup=all`);
  });

  it('groupPanels goes through fetchActivityGroupPanels: the full filters, no activitygroup', async () => {
    const { backend, calls } = service();
    await backend.fetch(`/dashboard/chart-single?chart=groupPanels&${FILTERS}`);
    expect(calls[0].url).toBe(`${API}/sundashboard/activitygroup?year=2026&month=all&fromdate=all&todate=all&datebasis=contact&employee=all&chanel=all&country=all&occupation=all&province=all&movementtype=AA-1&ggwBranch=SUN`);
  });

  it('a path the page does not know is a 404 JSON, a wrong method a 405', async () => {
    const { backend, calls } = service();
    const r = await backend.fetch('/dashboard/nope');
    expect(r.status).toBe(404);
    expect(await r.json()).toEqual({ error: 'not found', path: '/nope' });
    expect((await backend.fetch('/dashboard/chart-single?chart=trend', { method: 'POST' })).status).toBe(405);
    expect((await backend.fetch('/dashboard/masterdata-all', { method: 'DELETE' })).status).toBe(405);
    expect((await backend.fetch('/dashboard/api/v1/sundashboard/overview', { method: 'POST' })).status).toBe(405);
    expect(calls).toHaveLength(0);
  });

  it('answers with real Response objects: JSON content type, never a throw for an HTTP error', async () => {
    const { backend } = service({ 'dashboards/daily_trend': { status: 503, text: 'down' } });
    const r = await backend.fetch(`/dashboard/chart-single?chart=trend&${FILTERS}`);
    expect(r).toBeInstanceOf(Response);
    expect(r.headers.get('Content-Type')).toBe('application/json');
    expect(r.status).toBe(200); // the servlet answered with an empty chart, not with the error of the service
    expect(await r.json()).toEqual({ chart: 'trend', data: [] });
  });
});

// =========================================================================================================================
describe('DashboardSunApiProxyServlet — the allow-listed pass-through', () => {
  it('passes the raw query and gives the status and body back unchanged', async () => {
    const body = '{"status":200,"result":{"currentPage":2}}';
    const { backend, calls } = service({ 'sundashboard/lead_list': body });
    const r = await backend.fetch('/dashboard/api/v1/sundashboard/lead_list?year=2026&search=%E0%B8%81+%E0%B8%82&page=2&ggwBranch=SUN');
    expect(calls[0].url).toBe(`${API}/sundashboard/lead_list?year=2026&search=%E0%B8%81+%E0%B8%82&page=2&ggwBranch=SUN`);
    expect(r.status).toBe(200);
    expect(await r.text()).toBe(body);
  });

  it('an error of the service keeps its status and body (a validation error is the page\'s to show)', async () => {
    const err = '{"status":422,"message":"VALIDATION_ERROR"}';
    const { backend } = service({ 'sundashboard/pipeline': { status: 422, text: err } });
    const r = await backend.fetch('/dashboard/api/v1/sundashboard/pipeline?page=1');
    expect(r.status).toBe(422);
    expect(await r.text()).toBe(err);
  });

  it('a path outside the allow-list is a 404 JSON like _writeError, and nothing is called', async () => {
    const { backend, calls } = service();
    const r = await backend.fetch('/dashboard/api/v1/sundashboard/admin/secrets?x=1');
    expect(r.status).toBe(404);
    expect((await r.json()).error).toBe('Unknown dashboard-triplesale-service endpoint: admin/secrets');
    const dots = await backend.fetch('/dashboard/api/v1/sundashboard/../x');
    expect(dots.status).toBe(404);
    expect((await backend.fetch('/dashboard/api/v1/sundashboard')).status).toBe(404);
    expect(calls).toHaveLength(0);
  });

  it('slashes around the path are ignored; the path is decoded before the check', async () => {
    const { backend, calls } = service();
    await backend.fetch('/dashboard/api/v1/sundashboard//lead_list/?a=1');
    await backend.fetch('/dashboard/api/v1/sundashboard/lead_list%2Fdetail?a=1');
    expect(calls.map((c) => c.path)).toEqual(['sundashboard/lead_list', 'sundashboard/lead_list/detail']);
  });

  it('every path of the allow-list is served; the error body has quotes made single and backslashes dropped', async () => {
    const { backend, calls } = service();
    for (const p of ['daily_trend', 'activitygroup_summary', 'cs_performance', 'top_countries', 'funnel', 'funnel_cs', 'funnel_country', 'latest_step', 'activitygroup', 'stage_summary',
      'masterdata/months', 'masterdata/activity_group', 'masterdata/activitystep', 'masterdata/employee', 'masterdata/movementtype', 'masterdata/chanel', 'masterdata/country', 'masterdata/province', 'masterdata/occupation']) {
      await backend.fetch(`/dashboard/api/v1/sundashboard/${p}`);
    }
    // daily_trend … stage_summary are on the list but live under sundashboard here (only overview moves to dashboards)
    expect(calls).toHaveLength(19);
    expect(calls.every((c) => c.path.startsWith('sundashboard/'))).toBe(true);
    const bad = await backend.fetch('/dashboard/api/v1/sundashboard/we%22ird%5Cx'); // we"ird\x
    expect((await bad.json()).error).toBe("Unknown dashboard-triplesale-service endpoint: we'irdx");
  });

  it('no answer at all (status 0) is a 502; an error with an empty body says so', async () => {
    const { backend } = service({ 'sundashboard/lead_list': { status: 0 }, 'sundashboard/pipeline': { status: 500, text: '' }, 'sundashboard/funnel': { status: 204, text: '' } });
    const none = await backend.fetch('/dashboard/api/v1/sundashboard/lead_list');
    expect(none.status).toBe(502);
    expect((await none.json()).error).toBeTruthy();
    const empty = await backend.fetch('/dashboard/api/v1/sundashboard/pipeline');
    expect(empty.status).toBe(500);
    expect((await empty.json()).error).toBe('No response body from SUN API');
    const noContent = await backend.fetch('/dashboard/api/v1/sundashboard/funnel');
    expect(noContent.status).toBe(204);
    expect(await noContent.text()).toBe('');
  });

  it('a service that is not configured is a 503', async () => {
    const backend = createLiveDashboard({ dashboardApi: '', call: async () => ({ status: 200, text: '{}' }) });
    expect((await backend.fetch('/dashboard/api/v1/sundashboard/overview')).status).toBe(503);
  });
});

// =========================================================================================================================
describe('overview charts (DashboardView.fetchSingleChart)', () => {
  it('trend: {result:[{date,count}]}, a bare array, other key names, {xAxis,series} as sent, an empty list', async () => {
    const t = (text: string) => service({ 'dashboards/daily_trend': text }).backend;
    expect((await chart(t(env([{ date: '2026-01-01', count: 3 }, { date: '2026-01-02', count: '4' }, { count: 9 }, 'junk', { day: '2026-01-03', value: 5.9 }])), 'trend')).data).toEqual({
      xAxis: ['2026-01-01', '2026-01-02', '2026-01-03'],
      series: [3, 4, 5],
    });
    expect((await chart(t('[{"x":"a","y":2}]'), 'trend')).data).toEqual({ xAxis: ['a'], series: [2] });
    expect((await chart(t('{"data":[{"label":"L","total":1}]}'), 'trend')).data).toEqual({ xAxis: ['L'], series: [1] });
    expect((await chart(t('{"xAxis":["a","b"],"series":[1,2]}'), 'trend')).data).toEqual({ xAxis: ['a', 'b'], series: [1, 2] });
    expect((await chart(t('{"xAxis":"a","series":[1]}'), 'trend')).data).toEqual([]); // not arrays: the parse fails
    expect((await chart(t(env([])), 'trend')).data).toEqual({ xAxis: [], series: [] }); // a list with no days is a valid (empty) chart
    expect((await chart(t('{"nothing":1}'), 'trend')).data).toEqual([]);
    expect((await chart(t('   '), 'trend')).data).toEqual([]);
  });

  it('group: name ← group, value ← count; entries without a name are skipped; nothing left = the fallback', async () => {
    const g = (text: string) => service({ 'dashboards/activitygroup_summary': text }).backend;
    expect((await chart(g(env([{ group: 'CS', count: 10, percentage: 90 }, { count: 4 }, { name: 'AN', value: '1' }])), 'group')).data).toEqual([
      { name: 'CS', value: 10 },
      { name: 'AN', value: 1 },
    ]);
    expect((await chart(g(env([{ count: 4 }])), 'group')).data).toEqual([]);
    expect((await chart(g(env([])), 'group')).data).toEqual([]);
  });

  it('a list with an entry that is not an object fails the whole chart (ClassCastException in Java) — empty, not an error', async () => {
    const r = await chart(service({ 'dashboards/activitygroup_summary': env([{ group: 'CS', count: 1 }, 'oops']) }).backend, 'group');
    expect(r).toEqual({ chart: 'group', data: [] });
  });

  it('cs: yAxis / values / total, the name from any of the names the service used', async () => {
    const c = (text: string) => service({ 'dashboards/cs_performance': text }).backend;
    expect((await chart(c(env([{ csName: 'Ann', count: 8 }, { cs: 'Bob', value: 2 }, { employeeName: 'Cy', leads: '1' }, { count: 5 }])), 'cs')).data).toEqual({ yAxis: ['Ann', 'Bob', 'Cy'], values: [8, 2, 1], total: 11 });
    expect((await chart(c('[{"name":"A","count":3}]'), 'cs')).data).toEqual({ yAxis: ['A'], values: [3], total: 3 });
    expect((await chart(c(env([{ count: 5 }])), 'cs')).data).toEqual([]);
  });

  it('topCountries and step: yAxis / values (no total)', async () => {
    expect((await chart(service({ 'dashboards/top_countries': env([{ country: 'Japan', count: 4 }, { name: 'Korea', total: 2 }]) }).backend, 'topCountries')).data).toEqual({ yAxis: ['Japan', 'Korea'], values: [4, 2] });
    expect((await chart(service({ 'dashboards/latest_step': env([{ step: 'Call', count: 7 }, { stepName: 'Meet', count: 1 }]) }).backend, 'step')).data).toEqual({ yAxis: ['Call', 'Meet'], values: [7, 1] });
    expect((await chart(service({ 'dashboards/top_countries': env([]) }).backend, 'topCountries')).data).toEqual([]);
  });

  describe('funnels', () => {
    const items = [
      { channel: 'Web', lead: 6, closed: 2, percentage: 33.33 },
      { channel: 'Phone', lead: 3, closed: 1, percentage: 0 },
      { lead: 1, closed: 0 },
    ];

    it('source funnel: sharePct is the service\'s own percentage where it sent one, else the share of the total; barPct against the biggest', async () => {
      const r = await chart(service({ 'dashboards/funnel': env({ totalClosed: 7, items }) }).backend, 'sourceFunnel');
      expect(r.data).toEqual([
        { name: 'Web', total: 6, closed: 2, sharePct: 33.3, barPct: 100, closedOnly: false },
        { name: 'Phone', total: 3, closed: 1, sharePct: 30, barPct: 50, closedOnly: false },
        { name: '(ไม่ระบุ)', total: 1, closed: 0, sharePct: 10, barPct: 16.7, closedOnly: false },
      ]);
      expect(r.totalClosed).toBe(7);
      expect(r.subtitle).toBe('7 ลีดที่ปิดได้');
    });

    it('cs and country funnels ignore the percentage of the service (share of the shown total)', async () => {
      const cs = await chart(service({ 'dashboards/funnel_cs': env({ totalClosed: 1234, items: items.map((i) => ({ ...i, csName: i.channel })) }) }).backend, 'csFunnel');
      expect(cs.data.map((d: any) => [d.name, d.sharePct])).toEqual([['Web', 60], ['Phone', 30], ['(ไม่ระบุ)', 10]]);
      expect(cs.subtitle).toBe('1,234 ลีดที่ปิดได้');
      const co = await chart(service({ 'dashboards/funnel_country': env({ items: [{ country: 'Japan', lead: 1, closed: 1, percentage: 99 }] }) }).backend, 'countryFunnel');
      expect(co.data).toEqual([{ name: 'Japan', total: 1, closed: 1, sharePct: 100, barPct: 100, closedOnly: false }]);
    });

    it('a funnel as a bare array, with the other names of the fields', async () => {
      const r = await chart(service({ 'dashboards/funnel': JSON.stringify([{ name: 'A', total: 2, closeCount: 1 }, { source: 'B', count: 2, won: 2 }]) }).backend, 'sourceFunnel');
      expect(r.data.map((d: any) => [d.name, d.total, d.closed])).toEqual([['A', 2, 1], ['B', 2, 2]]); // closed ← closeCount / won, total ← total / count, name ← name / source
      expect(r.totalClosed).toBe(0);
    });

    it('all rows zero = "found nothing": the fallback, but the totalClosed the service gave is still reported', async () => {
      const r = await chart(service({ 'dashboards/funnel': env({ totalClosed: 5, items: [{ channel: 'x', lead: 0, closed: 0 }] }) }).backend, 'sourceFunnel');
      expect(r.data).toEqual([]);
      expect(r.totalClosed).toBe(5);
      expect(r.subtitle).toBe('5 ลีดที่ปิดได้');
    });

    it('no totalClosed: the subtitle counts the closed leads of an empty KPI = 0', async () => {
      const r = await chart(service({ 'dashboards/funnel_cs': env({ items: [{ csName: 'A', lead: 1 }] }) }).backend, 'csFunnel');
      expect(r.totalClosed).toBe(0);
      expect(r.subtitle).toBe('0 ลีดที่ปิดได้');
    });

    it('parseFunnel with closedOnly takes the closed counts for the bars', () => {
      const rows = P.parseFunnel(JSON.stringify([{ name: 'A', total: 10, closed: 1 }, { name: 'B', total: 2, closed: 3 }]), true, false)!;
      expect(rows.map((r) => [r.sharePct, r.barPct, r.closedOnly])).toEqual([[25, 33.3, true], [75, 100, true]]);
    });

    it('a service that failed (HTTP error) gives the empty answer with the subtitle', async () => {
      const r = await chart(service({ 'dashboards/funnel': { status: 500, text: '{"error":"x"}' } }).backend, 'sourceFunnel');
      expect(r).toEqual({ chart: 'sourceFunnel', data: [], totalClosed: 0, subtitle: '0 ลีดที่ปิดได้' });
    });
  });

  it('an unknown chart is an error body (200), an empty name an empty answer', async () => {
    const { backend, calls } = service();
    expect(await (await backend.fetch('/dashboard/chart-single?chart=nope')).json()).toEqual({ chart: 'nope', data: [], error: 'unknown chart' });
    expect(await (await backend.fetch('/dashboard/chart-single')).json()).toEqual({ chart: '', data: [] });
    expect(calls).toHaveLength(0);
  });

  it('an answer the parser cannot even read comes back as the 500 of the servlet', async () => {
    const deps: LiveDeps = {
      dashboardApi: API,
      call: async () => ({
        status: 200,
        get text(): string {
          throw new Error('broken "answer"');
        },
      }),
    };
    const r = await createLiveDashboard(deps).fetch('/dashboard/chart-single?chart=trend');
    expect(r.status).toBe(500);
    expect(await r.json()).toEqual({ chart: 'trend', error: "broken 'answer'", data: [] });
  });

  describe('lead breakdown', () => {
    it('the result object as the page draws it; {} when the service fails', async () => {
      const result = { occupation: { totalLead: 3, items: [{ code: 'O1', name: 'Self', lead: 3 }] }, saleperson: { totalLead: 3, totalSuccess: 1, totalLost: 0, items: [] } };
      expect((await chart(service({ 'dashboards/lead_breakdown': env(result) }).backend, 'leadBreakdown')).data).toEqual(result);
      expect((await chart(service({ 'dashboards/lead_breakdown': JSON.stringify({ data: result }) }).backend, 'leadBreakdown')).data).toEqual(result);
      expect((await chart(service({ 'dashboards/lead_breakdown': JSON.stringify({ result: [result] }) }).backend, 'leadBreakdown')).data).toEqual(result); // a one-element list gives its first object
      expect((await chart(service({ 'dashboards/lead_breakdown': { status: 500 } }).backend, 'leadBreakdown')).data).toEqual({});
      expect((await chart(service({ 'dashboards/lead_breakdown': '[1]' }).backend, 'leadBreakdown')).data).toEqual({});
    });
  });

  describe('kpi', () => {
    it('reads the sub-objects of the overview into the KPI summary the page updates its cards with', async () => {
      const result = { alllead: { total: 1234 }, close_success: { total: 100, percent: 8.1 }, avgDaysToClose: { total: 12.34 }, country: { countryCount: 3, topCountry: 'Japan' }, cs_close: { total: 7 } };
      expect((await chart(service({ 'dashboards/overview': env(result) }).backend, 'kpi')).data).toEqual({
        total: 1234, totalFmt: '1,234', closed: 100, closedFmt: '100', closedPct: 8.1, closedPctFmt: '8.1', avgDays: 12.34, avgDaysFmt: '12.3',
        countries: 3, topCountry: 'Japan', csClose: 7, csCloseFmt: '7',
      });
    });

    it('recomputes the closed percentage when the service sends none; an empty overview leaves the baseline (0, "-")', async () => {
      const r = await chart(service({ 'dashboards/overview': env({ alllead: { total: 8 }, close_success: { total: 2 } }) }).backend, 'kpi');
      expect(r.data).toMatchObject({ total: 8, closed: 2, closedPct: 25, closedPctFmt: '25.0' });
      const none = await chart(service({ 'dashboards/overview': { status: 500 } }).backend, 'kpi');
      expect(none.data).toEqual({ total: 0, totalFmt: '0', closed: 0, closedFmt: '0', closedPct: 0, closedPctFmt: '0.0', avgDays: 0, avgDaysFmt: '0.0', countries: 0, topCountry: '-', csClose: 0, csCloseFmt: '0' });
      const zeros = await chart(service({ 'dashboards/overview': env({ alllead: { total: 0 }, country: { countryCount: 0 } }) }).backend, 'kpi');
      expect(zeros.data.topCountry).toBe('-');
    });

    it('flat keys at the root are read too', () => {
      const s = P.emptyKpiStats();
      expect(P.applyOverview('{"total":5,"closed":1,"countriesCount":2,"topCountry":"X","avgDays":3.5}', s)).toBe(true);
      expect(s).toMatchObject({ total: 5, closed: 1, closedPct: 20, countriesCount: 2, topCountry: 'X', avgDays: 3.5 });
    });
  });
});

// =========================================================================================================================
describe('tab "กลุ่มขั้นตอน" (activitygroup)', () => {
  const panels = (text: string) => service({ 'sundashboard/activitygroup': text }).backend;

  it('panels in the order of the service: name / subtitle fall back to the department table, colour from it, group 000 dropped', async () => {
    const r = await chart(
      panels(env([
        { group: 'cs', groupName: '', groupDescription: '', total: 10, steps: [{ step: 'S1', count: 6 }, { step: 'S2', count: 4 }, { count: 9 }, 'x'] },
        { group: '000', total: 5 },
        { code: 'xyz', total: 2, steps: [] },
        { group: 'AN', groupName: 'Analysis', groupDescription: 'sub', total: 1 },
      ])),
      'groupPanels',
    );
    expect(r.chart).toBe('groupPanels');
    expect(r.data).toEqual([
      { code: 'CS', name: 'Customer Service', subtitle: 'บริการหลังการขาย', color: '#00d4a8', total: 10, steps: [{ rank: 1, name: 'S1', count: 6, pct: 60 }, { rank: 2, name: 'S2', count: 4, pct: 40 }] },
      { code: 'XYZ', name: 'XYZ', subtitle: '', color: '#4f7cff', total: 2, steps: [] },
      { code: 'AN', name: 'Analysis', subtitle: 'sub', color: '#9C6F63', total: 1, steps: [] },
    ]);
  });

  it('a panel without a total takes the sum of its steps — but the percentages used the total the service sent (0)', async () => {
    const r = await chart(panels(env([{ group: 'LS', steps: [{ step: 'a', count: 3 }, { step: 'b', count: 1 }] }])), 'groupPanels');
    expect(r.data[0]).toMatchObject({ code: 'LS', total: 4, steps: [{ rank: 1, name: 'a', count: 3, pct: 0 }, { rank: 2, name: 'b', count: 1, pct: 0 }] });
  });

  it('the list of steps may be called items / list / rows / data / activities; every panel at 0 = the fallback', async () => {
    const r = await chart(panels(env([{ group: 'CS', total: 3, items: [{ name: 'n', count: 3 }] }])), 'groupPanels');
    expect(r.data[0].steps).toEqual([{ rank: 1, name: 'n', count: 3, pct: 100 }]);
    expect((await chart(panels(env([{ group: 'CS', total: 0, steps: [] }, { group: 'AN', total: 0 }])), 'groupPanels')).data).toEqual([]);
    expect((await chart(panels('{"result":{"items":[]}}'), 'groupPanels')).data).toEqual([]);
    expect((await chart(service({ 'sundashboard/activitygroup': { status: 422, text: '{}' } }).backend, 'groupPanels')).data).toEqual([]);
  });
});

// =========================================================================================================================
describe('tab Pipeline', () => {
  const pipe = (text: string) => service({ 'sundashboard/pipeline': text }).backend;

  it('the shape the service sends: groups, months with values, yearTotal, the page numbers', async () => {
    const result = {
      currentPage: 2,
      totalPages: 5,
      groups: ['CS', 'AN'],
      months: [
        { month: 1, label: 'มกราคม 2026', values: { CS: 3, AN: 1 }, total: 4 },
        { month: 2, values: { CS: 2, AN: 0 } },
        { month: 13, values: { CS: 9 } },
        'junk',
      ],
      yearTotal: { label: 'รวม', values: { CS: 10, AN: 5 }, total: 15 },
    };
    const r = (await chart(pipe(env(result)), 'pipelineTable')).data;
    expect(r.groups).toEqual(['CS', 'AN']);
    expect(r.departments).toEqual(['CS', 'AN']);
    expect(r.months).toEqual([
      { month: '01', label: 'มกราคม 2026', values: { CS: 3, AN: 1 }, total: 4 },
      { month: '02', label: 'กุมภาพันธ์  2026', values: { CS: 2, AN: 0 }, total: 2 }, // no label: the month name, two spaces, the requested year
    ]);
    expect(r.rows).toEqual([
      { month: '01', monthLabel: 'มกราคม 2026', values: { CS: 3, AN: 1 }, total: 4 },
      { month: '02', monthLabel: 'กุมภาพันธ์  2026', values: { CS: 2, AN: 0 }, total: 2 },
    ]);
    expect(r.totals).toEqual({ CS: 10, AN: 5 }); // yearTotal replaces the sums
    expect(r.grandTotal).toBe(15);
    expect(r.deptColors).toEqual({ CS: '#00d4a8', AN: '#4f7cff' });
    expect([r.currentPage, r.totalPages]).toEqual([2, 5]);
  });

  it('without groups: the five departments; flat rows with lower-case or Count/Total keys; page numbers default to 1', async () => {
    const r = (await chart(pipe(JSON.stringify([{ month: '3', cs: 5, plsCount: 2, LS_count: '1', LETotal: 1.6 }])), 'pipelineTable')).data;
    expect(r.groups).toEqual(['CS', 'PLS', 'LS', 'LE', 'CRM']);
    // 1.6 is read by getInt, which truncates: 1 (the rounding is only the fallback for text like "1.6")
    expect(r.months[0]).toEqual({ month: '03', label: 'มีนาคม  2026', values: { CS: 5, PLS: 2, LS: 1, LE: 1, CRM: 0 }, total: 9 });
    expect(r.totals).toEqual({ CS: 5, PLS: 2, LS: 1, LE: 1, CRM: 0 });
    expect([r.grandTotal, r.currentPage, r.totalPages]).toEqual([9, 1, 1]);
  });

  it('values as a list in the order of the groups; groups as objects or text, upper-cased, no duplicates; an own row total wins', async () => {
    const r = (
      await chart(pipe(JSON.stringify({ groups: [{ code: 'cs' }, { group: 'ls' }, 'le', 'CS', { x: 1 }, ' '], months: [{ month: 4, values: [1, '2', null], total: 9 }] })), 'pipelineTable')
    ).data;
    expect(r.groups).toEqual(['CS', 'LS', 'LE']);
    expect(r.months[0]).toMatchObject({ month: '04', values: { CS: 1, LS: 2, LE: 0 }, total: 9 });
  });

  it('the year in the label comes from the request (2026 when it is not a number); all cells 0 = the fallback', async () => {
    const body = env({ months: [{ month: 5, values: { CS: 1 } }] });
    const y = (await chart(service({ 'sundashboard/pipeline': body }).backend, 'pipelineTable', '')).data;
    expect(y.months[0].label).toBe('พฤษภาคม  2026');
    const all = (await (await service({ 'sundashboard/pipeline': body }).backend.fetch(`/dashboard/chart-single?chart=pipelineTable&${FILTERS.replace('year=2026', 'year=2024')}`)).json()).data;
    expect(all.months[0].label).toBe('พฤษภาคม  2024');
    const text = (await (await service({ 'sundashboard/pipeline': body }).backend.fetch(`/dashboard/chart-single?chart=pipelineTable&${FILTERS.replace('year=2026', 'year=all')}`)).json()).data;
    expect(text.months[0].label).toBe('พฤษภาคม  2026');
    expect((await chart(pipe(env({ months: [{ month: 1, values: { CS: 0 } }] })), 'pipelineTable')).data).toEqual([]);
    expect((await chart(pipe(env({ nothing: [] })), 'pipelineTable')).data).toEqual([]);
    expect((await chart(pipe('[]'), 'pipelineTable')).data).toEqual([]);
  });

  it('months nested under data, departments / groups as the name of the values', async () => {
    const r = (await chart(pipe(JSON.stringify({ data: { rows: [{ month: 6, departments: { CS: 2 } }, { month: 7, groups: { CS: 3 } }] } })), 'pipelineTable')).data;
    expect(r.months.map((m: any) => m.values.CS)).toEqual([2, 3]);
    expect(r.grandTotal).toBe(5);
  });
});

// =========================================================================================================================
describe('tab "สถานะ" (stage_summary)', () => {
  it('maps the names of the service to the page\'s; SLA fields only when they have a value', async () => {
    const { backend, calls } = service({
      'dashboards/stage_summary': env([
        { group: 'CS', pendingCount: 4, avgPendingDays: 2.5, completedCount: 1, avgCompletedDays: 1, sla: 4, slaUnit: 'วัน', slaDriftPending: -1.5, slaDriftCompleted: null },
        { code: 'LS', pending: '7', completedAvg: '2.5' },
        { foo: 1 },
      ]),
    });
    const r = await chart(backend, 'statusKpis', '&group=CS');
    expect(r.data).toEqual([
      { code: 'CS', name: 'CS', color: '#00d4a8', pending: 4, pendingAvg: 2.5, completed: 1, completedAvg: 1, sla: 4, slaUnit: 'วัน', slaDriftPending: -1.5 },
      { code: 'LS', name: 'LS', color: '#ffb84d', pending: 7, pendingAvg: 0, completed: 0, completedAvg: 2.5 },
    ]);
    expect(calls[0].q.get('group')).toBe('CS');
    expect(calls[0].q.get('activitygroup')).toBe('all');
  });

  it('colours of the departments (FI, unknown) and the fallback when nothing is usable', async () => {
    expect(['CS', 'PLS', 'LS', 'LE', 'CRM', 'FI', 'AN', 'zz', ' ls '].map(P.deptColorOf)).toEqual(['#00d4a8', '#4f7cff', '#ffb84d', '#a26bff', '#f01685', '#3ad6dd', '#4f7cff', '#4f7cff', '#ffb84d']);
    expect(P.deptColorOf(null)).toBe('#4f7cff');
    expect((await chart(service({ 'dashboards/stage_summary': env([{ foo: 1 }]) }).backend, 'statusKpis')).data).toEqual([]);
  });
});

// =========================================================================================================================
describe('master data', () => {
  it('normalizeMasterData: every shape the service used', () => {
    const n = (v: unknown, ep = 'employee') => P.normalizeMasterData(JSON.stringify(v), ep);
    expect(n(['a', 'b'])).toEqual([{ value: 'a', label: 'a' }, { value: 'b', label: 'b' }]);
    expect(n({ result: [{ id: 1, name: 'One' }, { code: 'x', desc: 'Ex' }, { value: 'v' }, { label: 'only' }, { foo: 'bar' }, 5, 2.5, null, true, { year: 2026 }] })).toEqual([
      { value: '1', label: 'One' },
      { value: 'x', label: 'Ex' },
      { value: 'v', label: 'v' },
      { value: 'only', label: 'only' },
      { value: '5', label: '5' },
      { value: '2026', label: '2026' },
    ]);
    expect(n({ data: [{ code: 'A', name: 'a' }] })).toEqual([{ value: 'A', label: 'a' }]);
    expect(n({ items: ['z'] })).toEqual([{ value: 'z', label: 'z' }]);
    expect(n({ result: { x: 1 } })).toEqual([]);
    expect(n({ other: [] })).toEqual([]);
    expect(P.normalizeMasterData('not json', 'x')).toEqual([]);
    expect(P.normalizeMasterData('[oops', 'x')).toEqual([]);
  });

  it('months: the distinct months 1–12 ascending with the Thai abbreviation; text and numbers count', () => {
    const r = P.normalizeMasterData(JSON.stringify({ result: [{ year: 2026, month: 3 }, { year: 2026, month: 1 }, { month: 3 }, { value: 12 }, '12', 7, 0, 13, 'x', {}] }), 'months');
    expect(r).toEqual([{ value: '1', label: 'ม.ค.' }, { value: '3', label: 'มี.ค.' }, { value: '7', label: 'ก.ค.' }, { value: '12', label: 'ธ.ค.' }]);
    const all = P.buildMonthsFromArray(Array.from({ length: 12 }, (_, i) => ({ month: i + 1 })));
    expect(all.map((m) => m.label)).toEqual(['ม.ค.', 'ก.พ.', 'มี.ค.', 'เม.ย.', 'พ.ค.', 'มิ.ย.', 'ก.ค.', 'ส.ค.', 'ก.ย.', 'ต.ค.', 'พ.ย.', 'ธ.ค.']);
  });

  it('occupation: the name is the value (the service sends code 0 for all), blanks are skipped', () => {
    const r = P.normalizeMasterData(JSON.stringify({ result: [{ code: '0', name: 'Cook' }, { code: '0', name: '' }, 'Baker', { name: '  ' }, { label: 'Pilot' }, 7] }), 'occupation');
    expect(r).toEqual([{ value: 'Cook', label: 'Cook' }, { value: 'Baker', label: 'Baker' }, { value: 'Pilot', label: 'Pilot' }]);
  });

  describe('/dashboard/masterdata-all', () => {
    const MASTER_ROUTES: Record<string, string> = {
      'sundashboard/masterdata/years': env([{ year: 2026 }, { year: 2025 }]),
      'sundashboard/masterdata/months': env([{ year: 2026, month: 2 }, { year: 2026, month: 1 }]),
      'sundashboard/masterdata/province': env([{ code: 'BKK', name: 'Bangkok' }]),
      'sundashboard/masterdata/occupation': env([{ code: '0', name: 'Cook' }]),
      'sundashboard/masterdata/employee': env([{ code: 'E1', name: 'Ann' }]),
      'sundashboard/masterdata/country': env([{ code: 'THA', name: 'Thailand' }]),
      'sundashboard/masterdata/chanel': env([{ code: 'C1', name: 'Web' }]),
      'sundashboard/masterdata/activity_group': env([{ code: 'CS', name: 'CS' }]),
      'sundashboard/masterdata/movementtype': env([{ code: 'AA-1', name: 'First' }]),
    };

    it('asks the nine endpoints at once, each with the branch of the request and this year for the months', async () => {
      const { backend, calls } = service(MASTER_ROUTES);
      const r = await (await backend.fetch('/dashboard/masterdata-all?ggwBranch=SUN')).json();
      expect(calls.map((c) => c.path).sort()).toEqual(Object.keys(MASTER_ROUTES).sort());
      for (const c of calls) {
        expect(c.url.match(/ggwBranch=SUN/g)).toHaveLength(1);
        if (c.path.endsWith('/months')) expect(c.q.get('year')).toBe(String(new Date().getFullYear()));
        else expect([...c.q.keys()]).toEqual(['ggwBranch']);
      }
      expect(Object.keys(r)).toEqual(['years', 'months', 'province', 'occupation', 'employee', 'country', 'chanel', 'activity_group', 'movementtype']);
      expect(r.years).toEqual([{ value: '2026', label: '2026' }, { value: '2025', label: '2025' }]);
      expect(r.months).toEqual([{ value: '1', label: 'ม.ค.' }, { value: '2', label: 'ก.พ.' }]);
      expect(r.occupation).toEqual([{ value: 'Cook', label: 'Cook' }]);
      expect(r.employee).toEqual([{ value: 'E1', label: 'Ann' }]);
    });

    it('a list that fails — HTTP error, empty body, garbage, a call that throws — is [] and the others still arrive', async () => {
      const { backend } = service({
        ...MASTER_ROUTES,
        'sundashboard/masterdata/years': { status: 500, text: '{"error":1}' },
        'sundashboard/masterdata/province': { status: 200, text: '' },
        'sundashboard/masterdata/country': 'oops',
        'sundashboard/masterdata/chanel': { status: 0 },
      });
      const r = await (await backend.fetch('/dashboard/masterdata-all')).json();
      expect([r.years, r.province, r.country, r.chanel]).toEqual([[], [], [], []]);
      expect(r.employee).toHaveLength(1);
      const throwing = createLiveDashboard({ dashboardApi: API, call: async () => { throw new Error('net down'); } });
      expect(Object.values(await (await throwing.fetch('/dashboard/masterdata-all')).json())).toEqual(Array(9).fill([]));
    });

    it('without a branch in the request the service gets "all"', async () => {
      const { backend, calls } = service(MASTER_ROUTES);
      await backend.fetch('/dashboard/masterdata-all');
      expect(calls.every((c) => c.q.get('ggwBranch') === 'all')).toBe(true);
    });
  });

  it('/dashboard/months: the months of the year asked (this year when none), as abbreviations', async () => {
    const { backend, calls } = service({ 'sundashboard/masterdata/months': env([{ year: 2025, month: 11 }, { year: 2025, month: 4 }]) });
    expect(await (await backend.fetch('/dashboard/months?year=2025&ggwBranch=SUN')).json()).toEqual([{ value: '4', label: 'เม.ย.' }, { value: '11', label: 'พ.ย.' }]);
    expect(calls[0].url).toBe(`${API}/sundashboard/masterdata/months?year=2025&ggwBranch=SUN`);
    await backend.fetch('/dashboard/months');
    expect(calls[1].q.get('year')).toBe(String(new Date().getFullYear()));
    expect(await (await service({ 'sundashboard/masterdata/months': { status: 500 } }).backend.fetch('/dashboard/months?year=2025')).json()).toEqual([]);
  });

  it('/dashboard/masterdata-activitystep: the steps of a group, CS when none is named', async () => {
    const { backend, calls } = service({ 'sundashboard/masterdata/activitystep': env([{ code: 'CS01', name: 'First' }, { code: 'CS02', name: 'Second' }]) });
    expect(await (await backend.fetch('/dashboard/masterdata-activitystep?activitygroup=%20LS%20&ggwBranch=SUN')).json()).toEqual([{ value: 'CS01', label: 'First' }, { value: 'CS02', label: 'Second' }]);
    expect(calls[0].url).toBe(`${API}/sundashboard/masterdata/activitystep?activitygroup=LS&ggwBranch=SUN`);
    await backend.fetch('/dashboard/masterdata-activitystep');
    expect(calls[1].q.get('activitygroup')).toBe('CS');
  });
});

// =========================================================================================================================
describe('initial() — the first paint', () => {
  const MASTER = (code: string) => env([{ code, name: `name ${code}` }]);

  it('gives the 24 JSON values and the 6 texts; the charts are the empty JSON of applySafeDefaultJson, the lists are fetched live', async () => {
    const { backend, calls } = service({
      'sundashboard/masterdata/years': env([{ year: 2026 }]),
      'sundashboard/masterdata/months': env([{ month: 5 }]),
      'sundashboard/masterdata/province': MASTER('P'),
      'sundashboard/masterdata/occupation': MASTER('O'),
      'sundashboard/masterdata/employee': MASTER('E'),
      'sundashboard/masterdata/country': MASTER('C'),
      'sundashboard/masterdata/chanel': MASTER('H'),
      'sundashboard/masterdata/activity_group': MASTER('G'),
      'sundashboard/masterdata/movementtype': MASTER('M'),
    });
    const ini = (await backend.initial('SUN')) as unknown as Record<string, unknown>;
    expect(Object.keys(ini).filter((k) => k.endsWith('Json'))).toHaveLength(24);
    expect(ini['trendJson']).toEqual({ xAxis: [], series: [] });
    expect(ini['groupJson']).toEqual([]);
    expect(ini['csJson']).toEqual({ yAxis: [], values: [], total: 0 });
    expect(ini['topCountriesJson']).toEqual({ yAxis: [], values: [] });
    expect(ini['stepJson']).toEqual({ yAxis: [], values: [] });
    expect([ini['sourceFunnelJson'], ini['csFunnelJson'], ini['countryFunnelJson'], ini['groupPanelsJson'], ini['statusKpisJson']]).toEqual([[], [], [], [], []]);
    expect(ini['pipelineTableJson']).toEqual({ groups: [], departments: [], deptColors: {}, months: [], rows: [], totals: {}, grandTotal: 0 });
    expect([ini['pipelinePeopleJson'], ini['statusEmployeesJson'], ini['statusPopupJson']]).toEqual([{}, {}, {}]);
    expect(ini['leadsTableJson']).toEqual({ rows: [], totalRows: 0 });
    expect(ini['yearsJson']).toEqual([{ value: '2026', label: '2026' }]);
    expect(ini['monthsJson']).toEqual([{ value: '5', label: 'พ.ค.' }]);
    expect(ini['provinceJson']).toEqual([{ value: 'P', label: 'name P' }]);
    expect(ini['movementtypeJson']).toEqual([{ value: 'M', label: 'name M' }]);
    // the texts of an empty DashboardBean
    expect([ini['kpiTotalFmt'], ini['kpiCountries'], ini['kpiTopCountry']]).toEqual(['0', '0', '-']);
    expect([ini['sourceFunnelSubtitle'], ini['csFunnelSubtitle'], ini['countryFunnelSubtitle']]).toEqual(Array(3).fill('0 ลีดที่ปิดได้'));
    // only the nine master lists are asked (the page asks for the charts itself right after it starts), all for this branch
    expect(calls).toHaveLength(9);
    expect(calls.every((c) => c.path.startsWith('sundashboard/masterdata/') && c.q.get('ggwBranch') === 'SUN')).toBe(true);
  });

  it('some master lists failing leave [] in their place and never reject', async () => {
    const { backend } = service({
      'sundashboard/masterdata/years': { status: 500, text: '' },
      'sundashboard/masterdata/employee': MASTER('E'),
      'sundashboard/masterdata/country': 'garbage',
    });
    const ini = await backend.initial('');
    expect(ini.yearsJson).toEqual([]);
    expect(ini.countryMasterJson).toEqual([]);
    expect(ini.employeeJson).toEqual([{ value: 'E', label: 'name E' }]);
    expect(ini.provinceJson).toEqual([]); // 404 from the fake service
  });

  it('has the same fields as the mock (the page reads them by name)', async () => {
    resetMockDashboard();
    const mock = await createMockDashboard({ delayMs: 0 }).initial('SUN');
    const live = await service().backend.initial('SUN');
    expect(Object.keys(live).sort()).toEqual(Object.keys(mock).sort());
    for (const k of Object.keys(mock)) expect(typeof live[k as keyof typeof live], k).toBe(typeof mock[k as keyof typeof mock]);
  });

  it('hands out fresh objects each time (the page mutates what it is given)', async () => {
    const { backend } = service();
    const a = (await backend.initial('SUN')).trendJson as { xAxis: unknown[] };
    a.xAxis.push('x');
    expect(((await backend.initial('SUN')).trendJson as { xAxis: unknown[] }).xAxis).toEqual([]);
  });
});

// =========================================================================================================================
describe('widget layout (DashboardWidgetLayoutServlet, kept in this browser)', () => {
  const URL_ = '/dashboard/widget-layout?page=overview';
  const post = (b: DashboardBackend, body: unknown, url = URL_) => b.fetch(url, { method: 'POST', body: typeof body === 'string' ? body : JSON.stringify(body) });

  it('is empty at first, keeps what the page saved — for the next backend too (a page reload) — under ts.dashboard.layout.<employee>.<page>', async () => {
    const { backend } = service();
    expect(await (await backend.fetch(URL_)).json()).toEqual({ widgets: [] });
    const widgets = [{ id: 'chartTrend', visible: false, order: 3 }, { id: 'kpiTotal', visible: true, order: 0 }];
    const ok = await post(backend, { widgets });
    expect(ok.status).toBe(200);
    expect(await ok.json()).toEqual({ ok: true });
    expect(await (await backend.fetch(URL_)).json()).toEqual({ widgets });
    expect(await (await service().backend.fetch(URL_)).json()).toEqual({ widgets });
    expect(JSON.parse(localStorage.getItem('ts.dashboard.layout.E900.overview')!)).toEqual({ widgets });
  });

  it('keeps one layout per employee and per page; the page name is sanitised like SAFE_KEY', async () => {
    const a = service({}, { username: 'a', employeeCode: 'E1' }).backend;
    const b = service({}, { username: 'b', employeeCode: 'E2' }).backend;
    await post(a, { widgets: [{ id: 'chartTrend', visible: false, order: 1 }] });
    expect((await (await b.fetch(URL_)).json()).widgets).toEqual([]);
    await post(a, { widgets: [{ id: 'chartStep', visible: false, order: 2 }] }, '/dashboard/widget-layout?page=other');
    await post(a, { widgets: [{ id: 'chartCS', visible: false, order: 2 }] }, '/dashboard/widget-layout?page=../../x');
    expect((await (await a.fetch(URL_)).json()).widgets[0].id).toBe('chartCS'); // an unsafe name is the page "overview"
    expect((await (await a.fetch('/dashboard/widget-layout?page=other')).json()).widgets[0].id).toBe('chartStep');
    expect(Object.keys(localStorage).sort()).toEqual(['ts.dashboard.layout.E1.other', 'ts.dashboard.layout.E1.overview']);
  });

  it('with no employee code the username names the layout; with neither it is the 400 of "not signed in"', async () => {
    const byName = service({}, { username: 'someone', employeeCode: '' }).backend;
    await post(byName, { widgets: [{ id: 'kpiTotal', visible: false, order: 0 }] });
    expect(localStorage.getItem('ts.dashboard.layout.someone.overview')).not.toBeNull();
    const anon = service({}, 'anonymous').backend;
    const g = await anon.fetch(URL_);
    expect(g.status).toBe(400);
    expect((await g.json()).error).toBeTruthy();
    const p = await post(anon, { widgets: [] });
    expect(p.status).toBe(400);
    expect(await p.json()).toMatchObject({ ok: false });
  });

  it('keeps only the widgets it knows: the fixed ids and ms:<label> (1–200 chars after the prefix); the rest is dropped without an error', async () => {
    const { backend } = service();
    const long = 'ms:' + 'x'.repeat(197);
    const tooLong = 'ms:' + 'x'.repeat(198);
    const r = await post(backend, {
      widgets: [
        { id: 'kpiTotal', visible: false, order: 4 },
        { id: 'ms:ปิดการขาย', visible: true, order: 1 },
        { id: long },
        { id: tooLong },
        { id: 'ms:' },
        { id: 'unknown' },
        { id: 'chartCS' }, // no visible / order: visible defaults to true, order to the index
        'junk',
        null,
        { id: 'funnelCs', visible: 'FALSE', order: '9' },
        { id: 'funnelSource', visible: 'maybe', order: 'x' },
      ],
    });
    expect(r.status).toBe(200);
    expect((await (await backend.fetch(URL_)).json()).widgets).toEqual([
      { id: 'kpiTotal', visible: false, order: 4 },
      { id: 'ms:ปิดการขาย', visible: true, order: 1 },
      { id: long, visible: true, order: 2 },
      { id: 'chartCS', visible: true, order: 6 },
      { id: 'funnelCs', visible: false, order: 9 },
      { id: 'funnelSource', visible: true, order: 10 },
    ]);
  });

  it('only {id, visible, order} are stored: extra fields of an entry are dropped', async () => {
    const { backend } = service();
    await post(backend, { widgets: [{ id: 'chartGroup', visible: true, order: 2, size: 'L', html: '<b>x</b>' }] });
    expect(JSON.parse(localStorage.getItem('ts.dashboard.layout.E900.overview')!).widgets[0]).toEqual({ id: 'chartGroup', visible: true, order: 2 });
  });

  it('a body that is not a JSON object with a widgets array is a 400 { ok: false, error }', async () => {
    const { backend } = service();
    for (const body of ['x', '', '[]', '"s"', '{"nope":1}', '{"widgets":"a"}', '{"widgets":{}}']) {
      const r = await post(backend, body);
      expect(r.status, body).toBe(400);
      const j = await r.json();
      expect(j.ok).toBe(false);
      expect(String(j.error)).toMatch(/^invalid JSON body: /);
      expect(String(j.error)).not.toContain('"'); // quotes made single, like the servlet
    }
    expect(localStorage.length).toBe(0);
  });

  it('reads a damaged stored value as empty; other methods are 405', async () => {
    const { backend } = service();
    localStorage.setItem('ts.dashboard.layout.E900.overview', '{broken');
    expect(await (await backend.fetch(URL_)).json()).toEqual({ widgets: [] });
    expect((await backend.fetch(URL_, { method: 'DELETE' })).status).toBe(405);
  });

  it('works without localStorage (private window, blocked data): kept in memory until the tab goes, never throws', async () => {
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new DOMException('denied', 'SecurityError');
    });
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new DOMException('denied', 'SecurityError');
    });
    const { backend } = service();
    expect(await (await backend.fetch(URL_)).json()).toEqual({ widgets: [] });
    expect((await post(backend, { widgets: [{ id: 'chartTrend', visible: false, order: 1 }] })).status).toBe(200);
    expect(await (await service().backend.fetch(URL_)).json()).toEqual({ widgets: [{ id: 'chartTrend', visible: false, order: 1 }] });
    resetLiveDashboardMemory();
    expect(await (await backend.fetch(URL_)).json()).toEqual({ widgets: [] });
  });

  it('is the same contract as the mock: GET { widgets }, POST { ok: true }, a bad body 400', async () => {
    resetMockDashboard();
    const mock = createMockDashboard({ delayMs: 0 });
    const live = service().backend;
    const widgets = [{ id: 'chartTrend', visible: false, order: 3 }];
    for (const b of [mock, live]) {
      expect(await (await b.fetch(URL_)).json()).toEqual({ widgets: [] });
      expect(await (await post(b, { widgets })).json()).toEqual({ ok: true });
      expect(await (await b.fetch(URL_)).json()).toEqual({ widgets });
      expect((await post(b, 'x')).status).toBe(400);
    }
  });
});

// =========================================================================================================================
describe('fetch(): abort and robustness', () => {
  it('a request that is already aborted rejects with AbortError and calls nothing', async () => {
    const { backend, calls } = service();
    const ctrl = new AbortController();
    ctrl.abort();
    await expect(backend.fetch('/dashboard/chart-single?chart=trend', { signal: ctrl.signal })).rejects.toMatchObject({ name: 'AbortError' });
    await expect(backend.fetch('/dashboard/months', { signal: ctrl.signal })).rejects.toMatchObject({ name: 'AbortError' });
    expect(calls).toHaveLength(0);
  });

  it('a request aborted while the service is slow (a newer filter) rejects at once; the late answer is dropped without noise', async () => {
    let release!: (v: { status: number; text: string }) => void;
    const deps: LiveDeps = { dashboardApi: API, call: () => new Promise((r) => (release = r)) };
    const backend = createLiveDashboard(deps);
    const ctrl = new AbortController();
    const p = backend.fetch(`/dashboard/chart-single?chart=trend&${FILTERS}`, { signal: ctrl.signal });
    const settled = vi.fn();
    p.then(settled, settled);
    await Promise.resolve();
    expect(settled).not.toHaveBeenCalled();
    ctrl.abort();
    await expect(p).rejects.toMatchObject({ name: 'AbortError' });
    release({ status: 200, text: env([]) }); // must not throw anywhere
    await new Promise((r) => setTimeout(r, 0));
  });

  it('a request that finishes before the abort resolves normally and the listener is gone', async () => {
    const { backend } = service({ 'dashboards/daily_trend': env([{ date: 'd', count: 1 }]) });
    const ctrl = new AbortController();
    const r = await backend.fetch(`/dashboard/chart-single?chart=trend&${FILTERS}`, { signal: ctrl.signal });
    ctrl.abort();
    expect((await r.json()).data).toEqual({ xAxis: ['d'], series: [1] });
  });

  it('a service that does not answer is given up on after the time Java waited: 35 s for the charts and the pass-through, 30 s for the iframes', async () => {
    vi.useFakeTimers();
    const backend = createLiveDashboard({ dashboardApi: API, call: () => new Promise(() => undefined) });
    const chartP = backend.fetch(`/dashboard/chart-single?chart=cs&${FILTERS}`);
    const sunP = backend.fetch('/dashboard/api/v1/sundashboard/lead_list');
    const goldP = backend.fetch(`${API}/calendar`);
    await vi.advanceTimersByTimeAsync(30_000);
    expect((await goldP).status).toBe(502);
    const chartSettled = vi.fn();
    chartP.then(chartSettled);
    await vi.advanceTimersByTimeAsync(0);
    expect(chartSettled).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(5_000);
    expect(await (await chartP).json()).toEqual({ chart: 'cs', data: [] });
    expect((await sunP).status).toBe(502);
    expect(vi.getTimerCount()).toBe(0);
  });

  it('an answer that arrives in time leaves no timer behind', async () => {
    vi.useFakeTimers();
    const { backend } = service({ 'dashboards/cs_performance': env([{ name: 'A', count: 1 }]) });
    const r = await backend.fetch(`/dashboard/chart-single?chart=cs&${FILTERS}`);
    expect((await r.json()).data.yAxis).toEqual(['A']);
    expect(vi.getTimerCount()).toBe(0);
  });

  it('a call that throws is handled like a failed service (the contract says it never does; a broken one must not crash the page)', async () => {
    const backend = createLiveDashboard({ dashboardApi: API, call: async () => { throw new Error('boom'); } });
    expect(await (await backend.fetch(`/dashboard/chart-single?chart=cs&${FILTERS}`)).json()).toEqual({ chart: 'cs', data: [] });
    expect((await backend.fetch('/dashboard/api/v1/sundashboard/overview')).status).toBe(502);
    expect((await backend.fetch(`${API}/calendar`)).status).toBe(502);
  });
});

// =========================================================================================================================
describe('iframes: the dashboard service through fetch() (GoldApiProxyServlet)', () => {
  it('forwards method, body and Content-Type / Accept as they are and gives status and body back', async () => {
    const { backend, calls } = service({ 'POST calendar-task': { status: 201, text: '{"status":201,"result":{"id":5}}' } });
    const r = await backend.fetch(`${API}/calendar-task?x=1`, { method: 'POST', body: '{"title_task":"ประชุม"}', headers: { 'Content-Type': 'application/json; charset=UTF-8', Accept: 'text/plain' } });
    expect(calls).toHaveLength(1);
    expect(calls[0]).toMatchObject({ method: 'POST', url: `${API}/calendar-task?x=1`, body: '{"title_task":"ประชุม"}' });
    expect(calls[0].headers).toEqual({ Accept: 'text/plain', 'Content-Type': 'application/json; charset=UTF-8' });
    expect(r.status).toBe(201);
    expect(await r.json()).toEqual({ status: 201, result: { id: 5 } });
  });

  it('defaults: Accept application/json; Content-Type application/json for the methods that carry a body (also DELETE with none)', async () => {
    const { backend, calls } = service();
    await backend.fetch(`${API}/calendar`);
    await backend.fetch(`${API}/eventmovements/9`, { method: 'delete' });
    await backend.fetch(`${API}/eventmovements/9`, { method: 'PATCH', body: JSON.stringify({ eventStatus: 'Done' }), headers: new Headers({ 'content-type': 'application/merge-patch+json' }) });
    expect(calls[0]).toMatchObject({ method: 'GET', body: undefined, headers: { Accept: 'application/json' } });
    expect(calls[1]).toMatchObject({ method: 'DELETE', body: undefined, headers: { Accept: 'application/json', 'Content-Type': 'application/json' } });
    expect(calls[2].headers).toEqual({ Accept: 'application/json', 'Content-Type': 'application/merge-patch+json' });
    expect(calls[2].body).toBe('{"eventStatus":"Done"}');
  });

  it('an error of the service is handed on as it is; no answer at all is the 502 of the proxy; 204 has no body', async () => {
    const { backend } = service({ 'masters/levels': { status: 422, text: '{"status":422}' }, 'GET calendar': { status: 0 }, 'DELETE eventmovements/9': { status: 204, text: '' } });
    const err = await backend.fetch(`${API}/masters/levels`);
    expect(err.status).toBe(422);
    expect(await err.text()).toBe('{"status":422}');
    const none = await backend.fetch(`${API}/calendar`);
    expect(none.status).toBe(502);
    expect((await none.json()).error).toMatch(/^gold api proxy failed/);
    const del = await backend.fetch(`${API}/eventmovements/9`, { method: 'DELETE' });
    expect(del.status).toBe(204);
    expect(await del.text()).toBe('');
  });

  it('a service address with a host is recognised too', async () => {
    const abs = 'https://svc.example.test/dashboard-triplesale-service/api/v1';
    const calls: string[] = [];
    const backend = createLiveDashboard({ dashboardApi: abs + '/', call: async (_m, url) => (calls.push(url), { status: 200, text: '{}' }) });
    await backend.fetch(`${abs}/calendar?a=1`);
    expect(calls).toEqual([`${abs}/calendar?a=1`]);
  });
});

// =========================================================================================================================
describe('calendarFrame() — CalendarDashboardView.getCalendarDataJson and the sidebar lists', () => {
  const CTX = { ggwBranch: 'SUN', goldApi: API, employeeCode: 'E900', username: 'tester' };
  const CAL = env([
    {
      id: 11,
      name: 'Sales calendar',
      task_list: [
        { id: 101, title_task: 'Weekly sync', description_task: ' agenda ', appointment_date: '2026-09-19', appointment_time: '14:00:00', start_repeat: '2026-09-17', stop_repat: '2026-09-23 15:30:00' },
        { id: 102, title_task: '', start_repeat: '2026-09-20T08:00:00', repeat_time: '08:00:00', stop_repat: '2026-09-20 08:00:00' },
        { id: 103, title_task: 'No date' },
        'junk',
      ],
    },
    { id: 12, title_group: 'Old title', name: 'ignored', appointment_date: '2026-10-01', appointment_time: '09:30:00' },
    { id: 13 },
    { id: 14, createtime: '2026-10-05 10:00:00' },
    null,
  ]);
  const LISTS = {
    'my-task': env([{ id: 1, code: 'T1', name: 'Task one' }, { id: 2, code: 'T2', name: '' }, { id: 3, code: '', name: '' }, { code: 'noid', name: 'No id' }, 'junk']),
    'my-calendar-list': env([{ id: 7, code: 'CAL-7', name: 'Mine' }]),
    'my-task-list': env([{ id: 8, code: 'TK', name: 'Team' }]),
  };

  it('events from the schedules of the service: one per task (date / time / end rules of fromCalendarScheduleJSON), or one per schedule without tasks', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2026, 9, 20, 10, 0, 0));
    const { backend, calls } = service({ calendar: CAL, ...LISTS });
    const f = await backend.calendarFrame(CTX);
    const data = JSON.parse(f.calendarDataJson);
    expect(data).toMatchObject({ defaultYear: 2026, defaultMonth: 10, today: '2026-10-20', taskLists: [] });
    expect(data.events).toEqual([
      { id: '11-101', title: 'Weekly sync', date: '2026-09-19', start: '14:00', end: '15:30', allDay: false, type: 'event', color: 'blue', calendar: 'Sales calendar', reminderMinutes: 0, description: 'agenda' },
      { id: '11-102', title: 'Sales calendar', date: '2026-09-20', start: '08:00', end: null, allDay: false, type: 'event', color: 'blue', calendar: 'Sales calendar', reminderMinutes: 0, description: '' },
      { id: '12', title: 'Old title', date: '2026-10-01', start: '09:30', end: null, allDay: false, type: 'event', color: 'blue', calendar: 'Old title', reminderMinutes: 0, description: '' },
      { id: '14', title: 'กิจกรรม', date: '2026-10-05', start: null, end: null, allDay: true, type: 'event', color: 'blue', calendar: 'ปฏิทินของฉัน', reminderMinutes: 0, description: '' },
    ]);
    expect(calls.find((c) => c.path === 'calendar')!.url).toBe(`${API}/calendar?date_type=&date_select=all&calendartype=all&employees=all&position=all&page=1&perPage=20`);
  });

  it('the sidebar lists: [{id, code, name}], name falls back to the code, entries with neither are dropped, the id is kept only when it exists', async () => {
    const { backend } = service({ calendar: CAL, ...LISTS });
    const f = await backend.calendarFrame(CTX);
    expect(JSON.parse(f.myTaskListJson)).toEqual([{ id: 1, code: 'T1', name: 'Task one' }, { id: 2, code: 'T2', name: 'T2' }, { code: 'noid', name: 'No id' }]);
    expect(JSON.parse(f.myCalendarListJson)).toEqual([{ id: 7, code: 'CAL-7', name: 'Mine' }]);
    expect(JSON.parse(f.myTaskCalendarListJson)).toEqual([{ id: 8, code: 'TK', name: 'Team' }]);
    expect(f.calendarApiUrl).toBe(`${API}/calendar`);
    expect(f.calendarTaskCreateUrl).toBe(`${API}/calendar-task`);
    expect(f.employeeCode).toBe('E900');
  });

  it('the shape of the strings is the mock\'s', async () => {
    resetMockDashboard();
    const mock = await createMockDashboard({ delayMs: 0 }).calendarFrame(CTX);
    const live = await service({ calendar: CAL, ...LISTS }).backend.calendarFrame(CTX);
    expect(Object.keys(live).sort()).toEqual(Object.keys(mock).sort());
    expect(Object.keys(JSON.parse(live.calendarDataJson))).toEqual(expect.arrayContaining(Object.keys(JSON.parse(mock.calendarDataJson))));
    for (const k of ['myTaskListJson', 'myCalendarListJson', 'myTaskCalendarListJson'] as const) expect(Array.isArray(JSON.parse(live[k])), k).toBe(true);
  });

  it('a service that is down gives an empty calendar and empty lists, never a rejection; only an exact 200 counts', async () => {
    const f = await service({ calendar: { status: 500 }, 'my-task': { status: 204, text: '' }, 'my-calendar-list': { status: 201, text: LISTS['my-calendar-list'] } }).backend.calendarFrame(CTX);
    expect(JSON.parse(f.calendarDataJson).events).toEqual([]);
    expect([f.myTaskListJson, f.myCalendarListJson, f.myTaskCalendarListJson]).toEqual(['[]', '[]', '[]']);
    const boom = createLiveDashboard({ dashboardApi: API, call: async () => { throw new Error('x'); } });
    expect(JSON.parse((await boom.calendarFrame(CTX)).calendarDataJson).events).toEqual([]);
  });

  it('parseCalendarResponse: bare array / envelope keys; null when there is no list or a key holds something else', () => {
    expect(P.parseCalendarResponse('[{"id":1,"task_list":[{"id":2,"start_repeat":"2026-01-02"}]}]')).toHaveLength(1);
    expect(P.parseCalendarResponse('{"data":[]}')).toEqual([]);
    expect(P.parseCalendarResponse('{"result":{"a":1}}')).toBeNull();
    expect(P.parseCalendarResponse('{"x":1}')).toBeNull();
    expect(P.parseCalendarResponse('nope')).toBeNull();
  });
});

// =========================================================================================================================
describe('kpiFrame() — CalendarDashboardView.getKpiListDataJson', () => {
  const CTX = { ggwBranch: 'SUN', goldApi: API, employeeCode: 'E900', username: 'tester' };
  const EVENTS = env([
    {
      id: 9001, txno: 'KPI-1', pillar: 'P1', pillarId: 3, pillarCode: 'P1', kpiTaskTypeName: 'Follow up', kpiTaskTypeId: 2, kpiPilerTaskName: 'Call', kpiPilerTaskId: '7',
      prospectName: 'Customer One', prospectId: 11, kpiProductName: 'Loan', kpiProductId: 0, detail: 'd', solution: 's', eventStatus: ' Open ', startDate: '2026-09-01 09:00:00',
      closeDate: '', targetClose: '2026-09-05', contactChannelName: 'Line', contactChannelId: 4, kpiLevelName: 'High', kpiLevelId: 1, kpiTopic: 'Calls', keyFigure: 12, kpiUnit: 'Day',
      assingToName: 'Owner A', assingToId: 5, createByName: 'Maker', createTime: '2026-09-01T08:00:00', createAttachItems: [{ description: 'x' }], successAttachItems: 'bad',
    },
    { id: 9002, eventStatus: 'Done', startDate: 'not a date', createTime: 'junk' },
    { eventStatus: 'Open' },
  ]);
  const master = (key: string): Record<string, Answer> => ({ [`masters/${key}`]: env([{ id: 1, code: 'C1', name: 'Name 1', sla: 4, kpiUnitCode: 'Day' }, { id: '2', name: 'Name 2' }]) });
  const MASTERS = ['task-types', 'pillar-tasks', 'prospects', 'products', 'kpi-units', 'levels', 'kpi-tasks', 'employees', 'contacts', 'pillars'];
  const ROUTES: Record<string, Answer> = { eventmovements: EVENTS, ...Object.assign({}, ...MASTERS.map(master)) };

  it('{ columns, statusOptions, records, total, source, masters } as text', async () => {
    const { backend } = service(ROUTES);
    const kpi = JSON.parse(await backend.kpiFrame(CTX));
    expect(Object.keys(kpi)).toEqual(['columns', 'statusOptions', 'records', 'total', 'source', 'masters']);
    expect(kpi.columns).toHaveLength(19);
    expect(kpi.columns[0]).toEqual({ field: 'txno', title: 'เลขที่เอกสาร', type: 'String' });
    expect(kpi.columns[18]).toEqual({ field: 'createtime', title: 'เวลาที่สร้างเอกสาร', type: 'Timestamp' });
    expect(kpi.source).toBe('api');
    expect(kpi.total).toBe(3);
    expect(kpi.statusOptions).toEqual(['Open', 'Done']); // distinct, trimmed, in the order they appear
    expect(Object.keys(kpi.masters)).toEqual(['taskTypes', 'jobTitles', 'prospects', 'products', 'units', 'levels', 'kpiTasks', 'employees', 'contacts', 'pillars']);
    expect(kpi.masters.levels).toEqual([{ id: 1, code: 'C1', name: 'Name 1' }, { id: 2, code: '', name: 'Name 2' }]);
  });

  it('a record: fromEventMovementJSON + toKpiJSONObject (ids as text, 0 = "", names from the new names of the fields, attachments as lists)', async () => {
    const kpi = JSON.parse(await service(ROUTES).backend.kpiFrame(CTX));
    expect(kpi.records[0]).toMatchObject({
      eventId: '9001', txno: 'KPI-1', refdocno: 'KPI-1', pillar: 'P1', pillarId: '3', pillarCode: 'P1', kpitasktype: 'Follow up', kpitasktypeId: '2', kpijobtitle: 'Call', kpijobtitleId: '7',
      prospect: 'Customer One', prospectId: '11', kpiproduct: 'Loan', kpiproductId: '', detail: 'd', solution: 's', eventstatus: ' Open ', startdate: '2026-09-01 09:00:00', closedate: null,
      targetClose: '2026-09-05', channel: 'Line', channelId: '4', priority: 'High', priorityId: '1', kpitopic: 'Calls', keyfigure: '12', kpiunit: 'Day', responsibleby: 'Owner A',
      responsiblebyId: '5', createby: 'Maker', createByName: 'Maker', createtime: '2026-09-01 08:00:00', createAttachItems: [{ description: 'x' }], successAttachItems: [],
    });
    // no txno → the id of the record; an unreadable date → null; no id at all → no event id and no document number
    expect(kpi.records[1]).toMatchObject({ eventId: '9002', txno: '9002', startdate: null, createtime: null, eventstatus: 'Done' });
    expect(kpi.records[2]).toMatchObject({ eventId: '', txno: '', eventstatus: 'Open' });
  });

  it('asks eventmovements with every parameter of the curl spec (page 1, 200 rows) and every master with the branch', async () => {
    const { backend, calls } = service(ROUTES);
    await backend.kpiFrame(CTX);
    expect(calls.find((c) => c.path === 'eventmovements')!.url).toBe(
      `${API}/eventmovements?search=&id=&kpiTaskTypeName=&kpiJobTitleName=&prospectName=&eventStatus=&kpiProductName=&kpiProductCode=&detail=&solution=&kpiTaskTypeId=&kpiJobTitleId=&prospectId=&kpiProductId=&startDate=&closeDate=&ggwBranch=SUN&page=1&perPage=200`,
    );
    expect(calls.filter((c) => c.path.startsWith('masters/')).map((c) => c.url).sort()).toEqual(MASTERS.map((m) => `${API}/masters/${m}?ggwBranch=SUN`).sort());
    expect(calls).toHaveLength(11);
  });

  it('a branch with Thai or spaces is encoded; no branch asks for "all"', async () => {
    const { backend, calls } = service(ROUTES);
    await backend.kpiFrame({ ...CTX, ggwBranch: ' สาขา 1 ' });
    expect(calls[0].url).toContain('ggwBranch=' + P.enc('สาขา 1'));
    await backend.kpiFrame({ ...CTX, ggwBranch: '' });
    expect(calls.some((c) => c.url.includes('ggwBranch=all'))).toBe(true);
  });

  it('no usable list: an empty table (source "unavailable"), the default status options — never made-up rows', async () => {
    for (const bad of [{ status: 500 }, { status: 200, text: '' }, 'junk', '{"result":null}', '{"result":[1]}']) {
      const kpi = JSON.parse(await service({ ...ROUTES, eventmovements: bad as Answer }).backend.kpiFrame(CTX));
      expect(kpi.records, JSON.stringify(bad)).toEqual([]);
      expect(kpi.total).toBe(0);
      expect(kpi.source).toBe('unavailable');
      expect(kpi.statusOptions).toEqual(P.KPI_EVENT_STATUS);
    }
    const empty = JSON.parse(await service({ ...ROUTES, eventmovements: env([]) }).backend.kpiFrame(CTX));
    expect(empty.source).toBe('api');
    expect(empty.statusOptions).toEqual(P.KPI_EVENT_STATUS);
  });

  it('a master that fails or is unusable is [] and does not touch the others', async () => {
    const kpi = JSON.parse(await service({ ...ROUTES, 'masters/levels': { status: 422, text: '{}' }, 'masters/pillars': '{"result":"x"}', 'masters/contacts': env([{ id: 1 }, 'x']) }).backend.kpiFrame(CTX));
    expect([kpi.masters.levels, kpi.masters.pillars, kpi.masters.contacts]).toEqual([[], [], []]);
    expect(kpi.masters.taskTypes).toHaveLength(2);
  });

  it('the shape is the mock\'s', async () => {
    resetMockDashboard();
    const mock = JSON.parse(await createMockDashboard({ delayMs: 0 }).kpiFrame(CTX));
    const live = JSON.parse(await service(ROUTES).backend.kpiFrame(CTX));
    expect(Object.keys(live)).toEqual(expect.arrayContaining(Object.keys(mock)));
    expect(live.columns.map((c: any) => c.field).sort()).toEqual(mock.columns.map((c: any) => c.field).sort());
    expect(Object.keys(live.records[0])).toEqual(expect.arrayContaining(Object.keys(mock.records[0]).filter((k) => k !== '_rid'))); // _rid is given by the frame itself
  });

  it('date helpers: the start / close date keep the time, the creation time is always yyyy-MM-dd HH:mm:ss', () => {
    const r = (o: Record<string, unknown>): any => P.toKpiRecord(o);
    expect(r({ startDate: '2026-01-02' }).startdate).toBe('2026-01-02');
    expect(r({ startDate: '2026-01-02T03:04' }).startdate).toBe('2026-01-02 03:04:00');
    expect(r({ closeDate: ' 2026-01-02 03:04:05 ' }).closedate).toBe('2026-01-02 03:04:05');
    expect(r({ createTime: '2026-01-02' }).createtime).toBe('2026-01-02 00:00:00');
    expect(r({ createTime: '2026-01-02 03:04' }).createtime).toBe('2026-01-02 03:04:00');
    expect(r({ createTime: '02/01/2026' }).createtime).toBeNull();
    expect(r({ txno: '', refDocNo: 'R1' }).txno).toBe('R1');
    expect(r({ contactChannelName: '', channel: 'Old' }).channel).toBe('Old');
  });
});

// =========================================================================================================================
describe('the page on the live backend (HttpClient → LiveDeps.call → fetch() → the generated page script)', () => {
  const session = signal<SessionInfo | null>({
    username: 'demo', profileName: 'Demo', employeeId: 101, employeeCode: 'E101', branch: { id: 1, code: 'SUN', name: 'SUN' }, branchCode: 'SUN', roles: ['super_admin'],
  });
  const lang = signal<'th' | 'en'>('th');
  const t = (k: string): string => k;
  /** ECharts needs a canvas; the page only needs something it can call */
  const echartsInstances: Record<string, ReturnType<typeof vi.fn>>[] = [];
  const fakeEcharts = {
    init: vi.fn((_el: HTMLElement, ..._rest: unknown[]) => {
      const inst = { setOption: vi.fn(), resize: vi.fn(), dispose: vi.fn(), clear: vi.fn(), on: vi.fn(), off: vi.fn(), getOption: vi.fn(() => ({})), isDisposed: vi.fn(() => false) };
      echartsInstances.push(inst);
      return inst;
    }),
    graphic: { LinearGradient: class {} },
    getInstanceByDom: vi.fn(),
  };

  /** a service with a little synthetic data in every shape the page draws from at start-up */
  const SERVICE: Record<string, Answer> = {
    'sundashboard/masterdata/years': env([{ year: 2026 }, { year: 2025 }]),
    'sundashboard/masterdata/months': env([{ year: 2026, month: 3 }, { year: 2026, month: 1 }]),
    'sundashboard/masterdata/province': env([{ code: 'BKK', name: 'Bangkok' }]),
    'sundashboard/masterdata/occupation': env([{ code: '0', name: 'Cook' }]),
    'sundashboard/masterdata/employee': env([{ code: 'E1', name: 'Ann' }]),
    'sundashboard/masterdata/country': env([{ code: 'THA', name: 'Thailand' }]),
    'sundashboard/masterdata/chanel': env([{ code: 'C1', name: 'Web' }]),
    'sundashboard/masterdata/activity_group': env([{ code: 'CS', name: 'CS' }]),
    'sundashboard/masterdata/movementtype': env([{ code: 'AA-1', name: 'First' }]),
    'dashboards/overview': env({
      alllead: { total: 1234 }, close_success: { total: 100, percent: 8.1 }, avgDaysToClose: { total: 12.3 }, country: { countryCount: 3, topCountry: 'Japan' }, cs_close: { total: 7 },
      milestones: [{ label: 'Closed deals', total: 100, percent: 8.1 }],
    }),
    'dashboards/daily_trend': env([{ date: '2026-01-01', count: 3 }, { date: '2026-01-02', count: 5 }]),
    'dashboards/activitygroup_summary': env([{ group: 'CS', count: 10 }, { group: 'AN', count: 2 }]),
    'dashboards/cs_performance': env([{ csName: 'Ann', count: 8 }, { csName: 'Bob', count: 2 }]),
    'dashboards/top_countries': env([{ country: 'Japan', count: 4 }]),
    'dashboards/latest_step': env([{ step: 'Call', count: 7 }]),
    'dashboards/funnel': env({ totalClosed: 7, items: [{ channel: 'Web', lead: 6, closed: 2, percentage: 33.3 }] }),
    'dashboards/funnel_cs': env({ totalClosed: 7, items: [{ csName: 'Ann', lead: 6, closed: 2 }] }),
    'dashboards/funnel_country': env({ totalClosed: 7, items: [{ country: 'Japan', lead: 6, closed: 2 }] }),
    'dashboards/lead_breakdown': env({ occupation: { totalLead: 3, items: [{ name: 'Cook', lead: 3 }] } }),
    'sundashboard/pipeline': env({
      currentPage: 1, totalPages: 1, groups: ['CS', 'AN'],
      months: [{ month: 1, label: 'มกราคม 2026', values: { CS: 3, AN: 1 }, total: 4 }, { month: 2, label: 'กุมภาพันธ์ 2026', values: { CS: 0, AN: 0 }, total: 0 }],
      yearTotal: { values: { CS: 3, AN: 1 }, total: 4 },
    }),
    calendar: env([{ id: 11, name: 'Sales calendar', task_list: [{ id: 101, title_task: 'Weekly sync', appointment_date: '2026-10-19', appointment_time: '14:00:00' }] }]),
    'my-task': env([{ id: 1, code: 'T1', name: 'Task one' }]),
    'my-calendar-list': env([{ id: 7, code: 'CAL-7', name: 'Mine' }]),
    'my-task-list': env([{ id: 8, code: 'TK', name: 'Team' }]),
    eventmovements: env([{ id: 9001, txno: 'KPI-1', eventStatus: 'Open', startDate: '2026-09-01 09:00:00' }]),
  };
  /** the page needs a few round trips of its own before the numbers are on screen */
  const slow = (name: string, fn: () => Promise<void>): void => it(name, fn, 20_000);
  let fixture: ComponentFixture<Dashboard>;
  let el: HTMLElement;
  let fake: ReturnType<typeof service>;
  const $ = <E extends HTMLElement = HTMLElement>(sel: string): E => el.querySelector<E>(sel)!;
  const $$ = <E extends HTMLElement = HTMLElement>(sel: string): E[] => [...el.querySelectorAll<E>(sel)];
  const text = (sel: string): string => ($(sel)?.textContent ?? '').trim();
  const settle = (fn: () => void) => vi.waitFor(fn, { timeout: 6000, interval: 40 });

  beforeEach(() => {
    echartsInstances.length = 0;
    fakeEcharts.init.mockClear();
    fake = service(SERVICE);
    vi.spyOn(DashboardView.prototype as unknown as { loadEcharts(): Promise<unknown> }, 'loadEcharts').mockResolvedValue(fakeEcharts);
    TestBed.configureTestingModule({
      providers: [
        provideRouter([]),
        // what the app's interceptors would do with the service, without a network: the answer of the fake service, as an HttpResponse / an error
        provideHttpClient(
          withInterceptors([
            (req) =>
              from(fake.deps.call(req.method, req.urlWithParams, req.body)).pipe(
                mergeMap((r) =>
                  r.status >= 200 && r.status < 300
                    ? of(new HttpResponse({ status: r.status, body: r.text, url: req.urlWithParams }))
                    : throwError(() => new HttpErrorResponse({ status: r.status, error: r.text, url: req.urlWithParams })),
                ),
              ),
          ]),
        ),
        { provide: ConfigService, useValue: configStub({ mock: false }) },
        { provide: AuthService, useValue: { session } },
        { provide: I18n, useValue: { lang, t, use: async (l: 'th' | 'en') => lang.set(l) } },
      ],
    });
    fixture = TestBed.createComponent(Dashboard);
    document.body.appendChild(fixture.nativeElement);
    fixture.detectChanges();
    el = fixture.nativeElement as HTMLElement;
  });
  afterEach(() => {
    fixture.destroy();
    TestBed.resetTestingModule();
  });

  /** the page is up when the first numbers have been drawn from the service */
  const up = () => settle(() => expect(text('#kpiTotal')).toMatch(/^\d/));

  slow('starts: the KPI cards, the milestone card, the funnels and the charts come from the service; the dropdowns from the master lists', async () => {
    await up();
    expect(text('#kpiTotal')).toBe('1,234');
    expect(text('#kpiCountries')).toBe('3');
    await settle(() => expect($$('.kpi-card-milestone')).toHaveLength(1));
    await settle(() => expect($$('#funnelView .funnel-row').length).toBeGreaterThan(0));
    await settle(() => expect(text('#funnelSourceSub')).toBe('7 ลีดที่ปิดได้'));
    const ids = fakeEcharts.init.mock.calls.map((c) => (c[0] as HTMLElement).id);
    expect(ids).toEqual(expect.arrayContaining(['chartTrend', 'chartGroup', 'chartCS', 'chartCountry', 'chartStep']));
    // every render makes a new chart object: the last one of the trend chart holds the days of the service
    await settle(() => {
      const now = fakeEcharts.init.mock.calls.map((c) => (c[0] as HTMLElement).id);
      const trend = echartsInstances[now.lastIndexOf('chartTrend')];
      expect((trend['setOption'].mock.calls.at(-1)?.[0] as any).xAxis.data).toEqual(['2026-01-01', '2026-01-02']);
    });
    await settle(() => expect($$('#monthDropdownMenu .hdr-dd-item').slice(1).map((i) => i.textContent!.trim())).toEqual(['ม.ค.', 'มี.ค.']));
    expect($$('#yearPillMenu .hdr-dd-item').map((i) => i.dataset['value'])).toEqual(['all', '2026', '2025']);
  });

  slow('every request of the page went to the dashboard service with the branch of the user, and nothing else was called', async () => {
    await up();
    await settle(() => expect(fake.calls.some((c) => c.path === 'dashboards/funnel_country')).toBe(true));
    expect(fake.calls.length).toBeGreaterThan(15);
    for (const c of fake.calls) {
      expect(c.url.startsWith(`${API}/`), c.url).toBe(true);
      if (c.path.startsWith('dashboards/') || c.path.startsWith('sundashboard/')) expect(c.url.match(/ggwBranch=SUN/g), c.url).toHaveLength(1);
    }
    // the first paint asked for the master lists only; the charts were asked for by the page itself, with the first movement type as its default
    expect(fake.calls.filter((c) => c.path === 'dashboards/daily_trend').every((c) => c.q.get('movementtype') === 'AA-1')).toBe(true);
  });

  slow('applies the layout saved in this browser, and the edit mode saves the new one back', async () => {
    localStorage.setItem('ts.dashboard.layout.E101.overview', JSON.stringify({ widgets: [{ id: 'chartTrend', visible: false, order: 0 }] }));
    // the page of the beforeEach started without it: open a new one (a reload)
    fixture.destroy();
    fixture = TestBed.createComponent(Dashboard);
    document.body.appendChild(fixture.nativeElement);
    fixture.detectChanges();
    el = fixture.nativeElement as HTMLElement;
    await up();
    await settle(() => expect($('[data-widget-id="chartTrend"]').hidden).toBe(true));
    expect($('[data-widget-id="chartGroup"]').hidden).toBe(false);

    // the buttons call these by name from inline handlers, which the test DOM does not wire to this window; same functions
    const w = window as unknown as { toggleWidgetEditMode(): void; saveWidgetLayout(): void };
    w.toggleWidgetEditMode();
    w.saveWidgetLayout();
    await settle(() => {
      const saved = JSON.parse(localStorage.getItem('ts.dashboard.layout.E101.overview')!);
      expect(saved.widgets.find((w: any) => w.id === 'chartTrend')).toEqual({ id: 'chartTrend', visible: false, order: expect.any(Number) });
      expect(saved.widgets.map((w: any) => w.id)).toEqual(expect.arrayContaining(['kpiTotal', 'chartGroup', 'funnelCountry']));
    });
  });

  slow('the pipeline tab draws the matrix the service sends', async () => {
    await up();
    $<HTMLElement>('.dbsun-root .tab-btn[data-tab="pipeline"]').click();
    await settle(() => expect($$('#pipelineBody .pipeline-cell:not(.empty)').length).toBeGreaterThan(0));
    expect(text('#pipelineBody')).toContain('มกราคม 2026');
  });

  slow('the two iframe tabs get their documents built from the service: the calendar events, the KPI rows; and their calls go through the page', async () => {
    await up();
    $<HTMLElement>('.dbsun-root .tab-btn[data-tab="calendar"]').click();
    await settle(() => expect($<HTMLIFrameElement>('#calendarFrame').srcdoc).toContain('<title>ปฏิทินงาน</title>'));
    const cal = $<HTMLIFrameElement>('#calendarFrame').srcdoc;
    expect(cal).toContain('Weekly sync');
    expect(cal).toContain('Task one');
    $<HTMLElement>('.dbsun-root .tab-btn[data-tab="kpi"]').click();
    await settle(() => expect($<HTMLIFrameElement>('#kpiFrame').srcdoc).toContain('var KPI_DATA = '));
    expect($<HTMLIFrameElement>('#kpiFrame').srcdoc).toContain('KPI-1');
    // the bridge the iframes call (window.parent.__tsDashFetch) answers from the service with a real Response
    const bridge = (window as unknown as { __tsDashFetch: (u: string, i?: RequestInit) => Promise<Response> }).__tsDashFetch;
    const r = await bridge(`${API}/my-task`);
    expect(r.status).toBe(200);
    expect((await r.json()).result[0].name).toBe('Task one');
  });
});
