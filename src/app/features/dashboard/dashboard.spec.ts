import { provideHttpClient } from '@angular/common/http';
import { signal } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { By } from '@angular/platform-browser';
import { provideRouter } from '@angular/router';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AuthService } from '@core/auth/auth.service';
import { SessionInfo } from '@core/auth/auth.models';
import { ConfigService } from '@core/config/config.service';
import { I18n } from '@core/i18n/i18n.service';
import { configStub } from '@core/testing/test-helpers';
import { Dashboard } from './dashboard';
import { DashboardView } from './dashboard-view';
import { resetMockDashboard } from './dashboard.mock';

/** ECharts needs a canvas; the page only needs something it can call. Every chart gets its own recording instance. */
function fakeEcharts() {
  const instances: Array<Record<string, ReturnType<typeof vi.fn>>> = [];
  const mk = () => {
    const inst = { setOption: vi.fn(), resize: vi.fn(), dispose: vi.fn(), clear: vi.fn(), on: vi.fn(), off: vi.fn(), getOption: vi.fn(() => ({})), isDisposed: vi.fn(() => false) };
    instances.push(inst);
    return inst;
  };
  return { instances, module: { init: vi.fn((_el: HTMLElement, ..._rest: unknown[]) => mk()), graphic: { LinearGradient: class {} }, getInstanceByDom: vi.fn() } };
}

const session = signal<SessionInfo | null>({
  username: 'demo', profileName: 'Demo', employeeId: 101, employeeCode: 'E101', branch: { id: 1, code: 'SUN', name: 'SUN' }, branchCode: 'SUN', roles: ['super_admin'],
});
const lang = signal<'th' | 'en'>('th');
const dict: Record<string, string> = {};
const t = (k: string) => dict[k] ?? k;

describe('Dashboard page (pages/dashboard.xhtml + dashboard_company.xhtml, generated)', () => {
  let fixture: ComponentFixture<Dashboard>;
  let el: HTMLElement;
  let echarts: ReturnType<typeof fakeEcharts>;

  const $ = <T extends HTMLElement = HTMLElement>(sel: string) => el.querySelector<T>(sel)!;
  const text = (sel: string) => ($(sel)?.textContent ?? '').trim();
  const settle = (fn: () => void) => vi.waitFor(fn, { timeout: 6000, interval: 40 });
  /** the page is up when the first charts have been drawn from the backend */
  const up = () => settle(() => expect(text('#kpiTotal')).toMatch(/^\d/));

  beforeEach(async () => {
    resetMockDashboard();
    lang.set('th');
    echarts = fakeEcharts();
    vi.spyOn(DashboardView.prototype as unknown as { loadEcharts(): Promise<unknown> }, 'loadEcharts').mockResolvedValue(echarts.module);
    TestBed.configureTestingModule({
      providers: [
        provideRouter([]),
        provideHttpClient(),
        { provide: ConfigService, useValue: configStub({ mock: true }) },
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
    vi.restoreAllMocks();
  });

  it('is the markup of the Java page: header filters, ten tabs, the panes', async () => {
    await up();
    expect($$('.dbsun-root .tab-btn').map((b) => b.dataset['tab'])).toEqual(['calendar', 'kpi', 'overview', 'lead', 'steps', 'pipeline', 'status', 'customerGroup', 'statusByCustomer', 'table']);
    expect($('#dbBasisGroup')).toBeTruthy();
    expect($$('.hdr-dd-wrap').map((w) => w.dataset['ddType'])).toEqual(expect.arrayContaining(['year', 'month', 'movementtype', 'source', 'group', 'occupation', 'country', 'employee']));
    expect(['tabOverview', 'tabLead', 'tabSteps', 'tabPipeline', 'tabStatus', 'tabTable', 'tabCustomerGroup', 'tabStatusByCustomer', 'tabCalendar', 'tabKpi'].every((id) => !!$('#' + id))).toBe(true);
  });

  const $$ = <T extends HTMLElement = HTMLElement>(sel: string) => [...el.querySelectorAll<T>(sel)];

  it('draws the first paint from the backend: KPI cards, milestone cards, funnels, the five charts', async () => {
    await up();
    expect(text('#kpiTotal')).toMatch(/^[\d,]+$/);
    await settle(() => expect($$('.kpi-card-milestone')).toHaveLength(3));
    await settle(() => expect($$('#funnelView .funnel-row').length).toBeGreaterThan(0));
    const ids = echarts.module.init.mock.calls.map((c) => (c[0] as HTMLElement).id);
    expect(ids).toEqual(expect.arrayContaining(['chartTrend', 'chartGroup', 'chartCS', 'chartCountry', 'chartStep']));
    // the trend chart got the days of the API as its x axis
    const trend = echarts.instances[ids.indexOf('chartTrend')];
    await settle(() => expect((trend['setOption'].mock.calls.at(-1)?.[0] as any).xAxis.data.length).toBeGreaterThan(0));
  });

  it('fills the header dropdowns from /dashboard/masterdata-all (months are the Thai abbreviations)', async () => {
    await up();
    await settle(() => expect($$('#monthDropdownMenu .hdr-dd-item').length).toBeGreaterThan(1));
    expect($$('#monthDropdownMenu .hdr-dd-item').slice(1, 4).map((i) => i.textContent!.trim())).toEqual(['ม.ค.', 'ก.พ.', 'มี.ค.']);
    expect($$('#yearPillMenu .hdr-dd-item').map((i) => i.dataset['value'])).toEqual(['all', '2026', '2025']);
  });

  it('choosing a year asks for the data again and the numbers follow', async () => {
    await up();
    const before = text('#kpiTotal');
    $('#yearPillBtn').click();
    $<HTMLElement>('#yearPillMenu .hdr-dd-item[data-value="2025"]').click();
    await settle(() => expect(text('#kpiTotal')).not.toBe(before));
    expect(text('#kpiTotal')).toMatch(/^[\d,]+$/);
  });

  it('opens a tab and loads its data: pipeline → the year table; the cell opens the list of people', async () => {
    await up();
    $<HTMLElement>('.dbsun-root .tab-btn[data-tab="pipeline"]').click();
    expect(document.body.classList.contains('tab-pipeline-active')).toBe(true);
    await settle(() => expect($$('#pipelineBody .pipeline-cell:not(.empty)').length).toBeGreaterThan(0));
    $$('#pipelineBody .pipeline-cell:not(.empty)')[0].click();
    // the modal is moved to a host at <body> level (like Java: out of any transformed ancestor)
    const modal = document.getElementById('pipelineModal')!;
    expect(modal.classList.contains('show')).toBe(true);
    expect(modal.parentElement!.id).toBe('dbsunModalHost');
    await settle(() => expect(modal.querySelectorAll('#pipelineListBody tr').length).toBeGreaterThan(0));
  });

  it('the lead table pages and expands a lead to its timeline', async () => {
    await up();
    $<HTMLElement>('.dbsun-root .tab-btn[data-tab="table"]').click();
    await settle(() => expect($$('#leadsTableBody .lt-main-row').length).toBe(20));
    $$('#leadsTableBody .lt-main-row')[0].click();
    await settle(() => expect($$('#leadsTableBody .lt-timeline-table tr').length).toBeGreaterThan(1));
    $<HTMLElement>('#leadsTablePagination .lt-page-btn[data-page="2"]').click();
    await settle(() => expect(text('#leadsTablePagination .lt-page-btn.active')).toBe('2'));
  });

  it('the two iframe tabs get their documents (srcdoc) from the generated frames', async () => {
    await up();
    $<HTMLElement>('.dbsun-root .tab-btn[data-tab="calendar"]').click();
    await settle(() => expect($<HTMLIFrameElement>('#calendarFrame').srcdoc).toContain('<title>ปฏิทินงาน</title>'));
    $<HTMLElement>('.dbsun-root .tab-btn[data-tab="kpi"]').click();
    await settle(() => expect($<HTMLIFrameElement>('#kpiFrame').srcdoc).toContain('var KPI_DATA = '));
    // the placeholders were replaced by the dashboard (gold API of the config, the branch of the session)
    const srcdoc = $<HTMLIFrameElement>('#kpiFrame').srcdoc;
    expect(srcdoc).toContain("var KPI_GOLD_API = '/dashboard-triplesale-service/api/v1';");
    expect(srcdoc).toContain("var KPI_GGW_BRANCH = 'SUN';");
    // …and its fetch bridge is installed on the page
    expect(typeof (window as unknown as { __tsDashFetch?: unknown }).__tsDashFetch).toBe('function');
  });

  it('a language switch is a page reload in Java: a NEW page instance, not an edit of the old DOM', async () => {
    await up();
    const first = fixture.debugElement.query(By.directive(DashboardView)).componentInstance;
    lang.set('en');
    fixture.detectChanges();
    TestBed.tick?.();
    await settle(() => expect(fixture.debugElement.query(By.directive(DashboardView)).componentInstance).not.toBe(first));
    await up();
  });

  it('leaving the page removes everything it put outside its own DOM', async () => {
    await up();

    $<HTMLElement>('.dbsun-root .tab-btn[data-tab="pipeline"]').click();
    await settle(() => expect($$('#pipelineBody .pipeline-cell:not(.empty)').length).toBeGreaterThan(0));
    $$('#pipelineBody .pipeline-cell:not(.empty)')[0].click();
    expect(document.getElementById('dbsunModalHost')).toBeTruthy();
    const w = window as unknown as Record<string, unknown>;
    expect(typeof w['refreshAllChartsFromApi']).toBe('function');
    fixture.destroy();
    expect(document.getElementById('dbsunModalHost')).toBeNull();
    expect(w['refreshAllChartsFromApi']).toBeUndefined();
    expect(w['__tsDashFetch']).toBeUndefined();
    expect(document.body.className).not.toMatch(/tab-\w+-active/);
    for (const inst of echarts.instances) expect(inst['dispose']).toHaveBeenCalled();
  });
});
