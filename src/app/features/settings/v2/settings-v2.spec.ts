import { provideHttpClient, withInterceptors } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting, TestRequest } from '@angular/common/http/testing';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { ConfigService } from '@core/config/config.service';
import { apiErrorInterceptor } from '@core/http/interceptors';
import { I18n } from '@core/i18n/i18n.service';
import { pageById } from '@core/navigation/page-registry';
import { configStub } from '@core/testing/test-helpers';
import { EXTRA_PAGES } from './extra/extra';
import { CUSTOMER_PAGES } from './customer/customer';
import { FINANCE_PAGES } from './finance/finance';
import { INITIAL_PAGES } from './initial/initial';
import { ORGANIZATION_PAGES } from './organization/organization';
import { SALES_FLOW_PAGES } from './sales-flow/sales-flow';
import { SvFrame, SvPages } from './shared/sv-frame';

const BY_PHASE: Record<string, SvPages> = {
  p0: INITIAL_PAGES,
  p1: ORGANIZATION_PAGES,
  p2: SALES_FLOW_PAGES,
  p3: CUSTOMER_PAGES,
  p4: FINANCE_PAGES,
  p5: EXTRA_PAGES,
};

/** the steps the database defines (backoffice.menu, phases p0–p5 — p6 has no v2 page) — one tab file each; the page itself holds no such list */
const DB_STEPS: Record<string, string[]> = {
  p0: ['entity', 'systemname', 'channel', 'movementtype', 'typeset', 'instype', 'calendartype'],
  p1: ['branch', 'role', 'org', 'employee', 'salesteam'],
  p2: ['actstatus', 'flow', 'oppsharinggroup', 'opportunityconfig', 'waitlist'],
  p3: ['leadstatus', 'customergroup', 'marketing', 'custlists', 'dataattributeroleconfig', 'defperm'],
  p4: ['address', 'currency', 'fiscalyears', 'payment', 'product'],
  p5: ['partner', 'coupon', 'calendar', 'kpi'],
};

describe('settings v2 — the tabs', () => {
  it('has one registered page per menu (phase)', () => {
    for (const p of Object.keys(DB_STEPS)) expect(pageById(`settings-v2-${p}`).route, p).toMatch(/^settings\/v2\//);
  });

  it('every step the database defines has its own tab file, and no tab file is orphaned', () => {
    for (const [phase, keys] of Object.entries(DB_STEPS)) expect(Object.keys(BY_PHASE[phase]).sort(), phase).toEqual([...keys].sort());
  });

  it('every tab page loads a component', async () => {
    for (const pages of Object.values(BY_PHASE)) {
      for (const load of Object.values(pages)) expect(await load()).toBeTruthy();
    }
  });
});

const MASTER = '/master-service/api/v1';
const E1 = '0192f0a0-0000-7000-8000-0000000000e1';
const ok = <T>(result: T, meta?: object) => ({ status: 200, message: 'success', result, ...(meta ? { meta } : {}) });
const step = (stepKey: string, phaseKey: string, title: string, o: Record<string, unknown> = {}) => ({
  stepKey, phaseKey, title, goLive: true, done: false, locked: false, missingSteps: [], tables: [], visible: true, editable: true,
  note: null, editLevel: 'E', dependsOn: [], permFields: [], ...o,
});
const SETUP = {
  phases: [
    {
      key: 'p1',
      title: 'องค์กรและคน',
      steps: [
        step('branch', 'p1', 'สาขา', { done: true, dependsOn: ['entity'], tables: [{ tableKey: 'branch', title: 'สาขา', hasRelease: true, optional: false }] }),
        step('org', 'p1', 'โครงสร้างองค์กร', { dependsOn: ['branch'], tables: [{ tableKey: 'department', title: 'หน่วยงาน', hasRelease: false, optional: false }] }),
      ],
    },
    { key: 'p3', title: 'ลูกค้าและการตลาด', steps: [step('leadstatus', 'p3', 'สถานะ Lead', { tables: [{ tableKey: 'leadstatus', title: 'สถานะ Lead', hasRelease: false, optional: false }] })] },
    { key: 'p9', title: 'หมวดที่ยังไม่มีหน้า v2', steps: [step('x', 'p9', 'x')] },
  ],
  goLiveDone: 1,
  goLiveTotal: 20,
};
const columns = (table: string) => ({
  table, title: table, scope: 'ENTITY', provisional: false, defaultSort: 'code,asc', perPage: 20, perPageMax: 100, searchFields: [], version: 1,
  columns: [
    { field: 'code', label: 'รหัส', type: 'text', required: true, width: 120, sortable: true },
    { field: 'name', label: 'ชื่อ', type: 'text', required: true, width: 220, sortable: true },
  ],
});
const ROWS = [{ id: 'r1', code: 'B01', name: 'ลาดพร้าว' }];
const META = { page: 1, perPage: 20, total: 1, totalPages: 1 };

describe('settings v2 — the frame reads the same data as the main page (menu from the database)', () => {
  let http: HttpTestingController;
  let fixture: ComponentFixture<SvFrame>;
  let el: HTMLElement;

  const path = (p: string) => (r: TestRequest['request']) => r.url === `${MASTER}${p}`;
  const settle = async () => {
    for (let i = 0; i < 6; i++) {
      fixture.detectChanges();
      await new Promise((r) => setTimeout(r, 5));
    }
    fixture.detectChanges();
  };
  const texts = (sel: string) => Array.from(el.querySelectorAll(sel)).map((n) => n.textContent!.replace(/\s+/g, ' ').trim());
  /** column headers without the sort arrows (▲ sorted ascending · ▼ descending · ▲▼ sortable) */
  const heads = () => texts('thead th').map((h) => h.replace(/[▲▼]/g, '').trim());

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(withInterceptors([apiErrorInterceptor])),
        provideHttpClientTesting(),
        provideRouter([]),
        { provide: ConfigService, useValue: configStub({ mock: true }) }, // the app-config "mock" flag makes no difference to this page
        { provide: I18n, useValue: { t: (k: string, ...a: (string | number)[]) => (a.length ? `${k}|${a.join('|')}` : k) } },
      ],
    });
    http = TestBed.inject(HttpTestingController);
    fixture = TestBed.createComponent(SvFrame);
    fixture.componentRef.setInput('phase', 'p1');
    fixture.componentRef.setInput('pages', {}); // no tab file of its own → the shared list of the database
    el = fixture.nativeElement as HTMLElement;
  });
  afterEach(() => http.verify());

  it('draws the steps of its phase from the API and the list of the first step from the database', async () => {
    await settle();
    http.expectOne(path('/master-setup/entities')).flush(ok([{ id: E1, code: 'K29C1', name: 'บริษัทหนึ่ง' }]));
    await settle();
    const steps = http.expectOne(path('/master-setup/steps'));
    expect(steps.request.params.get('entityId')).toBe(E1);
    steps.flush(ok(SETUP));
    await settle();

    expect(texts('.step .sname')).toEqual(['สาขา', 'โครงสร้างองค์กร']); // only the steps of phase p1
    expect(el.querySelector('.go b')!.textContent!.trim()).toBe('1/20');
    expect(texts('.ptab')).toEqual(['0 องค์กรและคน', '1 ลูกค้าและการตลาด']); // p9 has no v2 page → not in the menu
    expect(el.querySelector('.ptab[aria-current=true]')!.textContent).toContain('องค์กรและคน');

    http.expectOne(path('/master-tables/branch')).flush(ok(columns('branch')));
    const rows = http.expectOne(path('/master-tables/branch/records'));
    expect(rows.request.params.get('entityId')).toBe(E1);
    rows.flush(ok(ROWS, META));
    await settle();
    expect(heads()).toEqual(['รหัส *', 'ชื่อ *', '', 'app.settings.actions']);
    expect(texts('tbody tr td').slice(0, 2)).toEqual(['B01', 'ลาดพร้าว']);
  });

  it('choosing another step (?tab=) loads that step\'s table', async () => {
    await settle();
    http.expectOne(path('/master-setup/entities')).flush(ok([{ id: E1, code: 'K', name: 'x' }]));
    await settle();
    http.expectOne(path('/master-setup/steps')).flush(ok(SETUP));
    await settle();
    http.expectOne(path('/master-tables/branch')).flush(ok(columns('branch')));
    http.expectOne(path('/master-tables/branch/records')).flush(ok(ROWS, META));
    await settle();

    el.querySelectorAll<HTMLElement>('.step')[1].click();
    await settle();
    http.expectOne(path('/master-tables/department')).flush(ok(columns('department')));
    http.expectOne(path('/master-tables/department/records')).flush(ok([], { page: 1, perPage: 20, total: 0, totalPages: 1 }));
    await settle();
    expect(el.querySelector('.step.sel .sname')!.textContent).toBe('โครงสร้างองค์กร');
  });

  it('a phase the role cannot use at all says so instead of drawing anything of its own', async () => {
    fixture.componentRef.setInput('phase', 'p2');
    await settle();
    http.expectOne(path('/master-setup/entities')).flush(ok([{ id: E1, code: 'K', name: 'x' }]));
    await settle();
    http.expectOne(path('/master-setup/steps')).flush(ok(SETUP));
    await settle();
    expect(el.querySelectorAll('.step').length).toBe(0);
    expect(el.querySelector('.work .empty')!.textContent).toContain('app.settings.live.phaseEmpty');
    http.expectNone((r) => r.url.includes('/master-tables/'));
  });
});
