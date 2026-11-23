import { signal } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { By } from '@angular/platform-browser';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ConfigService } from '@core/config/config.service';
import { I18n } from '@core/i18n/i18n.service';
import { PermissionService } from '@core/permissions/permission.service';
import { reportRole } from '@core/permissions/report-roles';
import { fakeRest } from '@core/live/rest-fake';
import { configStub } from '@core/testing/test-helpers';
import { Report } from './report';
import { ReportView } from './report-view';
import { createLiveReport } from './report.live';

const lang = signal<'th' | 'en'>('th');
const t = (k: string) => k;

describe('Report page (pages/report.xhtml, generated)', () => {
  let fixture: ComponentFixture<Report>;
  let el: HTMLElement;
  let swal: ReturnType<typeof vi.fn<(o: unknown) => Promise<unknown>>>;
  let allowed: Set<string> | 'all';

  const $ = <T extends HTMLElement = HTMLElement>(sel: string) => el.querySelector<T>(sel)!;
  const $$ = <T extends HTMLElement = HTMLElement>(sel: string) => [...el.querySelectorAll<T>(sel)];
  const settle = (fn: () => void) => vi.waitFor(fn, { timeout: 4000, interval: 30 });
  const up = () => settle(() => expect($$('.rpt-item').length).toBeGreaterThan(0));
  const typeIn = (sel: string, v: string) => {
    const i = $<HTMLInputElement>(sel);
    i.value = v;
    i.dispatchEvent(new Event('input', { bubbles: true }));
  };

  async function create(mock = true): Promise<void> {
    TestBed.configureTestingModule({
      providers: [
        { provide: ConfigService, useValue: configStub({ mock }) },
        { provide: I18n, useValue: { lang, t, use: async (l: 'th' | 'en') => lang.set(l) } },
        { provide: PermissionService, useValue: { has: (r: string) => allowed === 'all' || allowed.has(r) } },
      ],
    });
    fixture = TestBed.createComponent(Report);
    document.body.appendChild(fixture.nativeElement);
    fixture.detectChanges();
    el = fixture.nativeElement as HTMLElement;
  }

  beforeEach(() => {
    lang.set('th');
    allowed = 'all';
    swal = vi.fn<(o: unknown) => Promise<unknown>>(async () => undefined);
    vi.spyOn(ReportView.prototype as unknown as { swal(o: unknown): Promise<unknown> }, 'swal').mockImplementation((o) => swal(o));
  });
  afterEach(() => {
    fixture?.destroy();
    TestBed.resetTestingModule();
    vi.restoreAllMocks();
  });

  it('is the markup of the Java page and lists the reports of the three groups', async () => {
    await create();
    await up();
    expect($('.rpt-title').textContent).toBe('รายงานทั้งหมด');
    expect($('#rptSearch')).toBeTruthy();
    expect($$('.rpt-card-hd').map((h) => h.textContent)).toEqual(['รายงาน CRM', 'รายงาน SUN', 'รายงาน GGW']);
    // SUN-LD-08 is in the data file but not in the report registry: nobody sees it
    const codes = $$('.rpt-item').map((i) => i.dataset['code']);
    expect(codes).toHaveLength(15);
    expect(codes).not.toContain('SUN-LD-08');
    expect($('.rpt-side-empty').textContent).toContain('เลือกรายงานจากรายการด้านซ้าย');
  });

  it('shows only the reports the user has Report_<CODE>_View for', async () => {
    allowed = new Set([reportRole('CRMG10'), reportRole('GGW-LD-01')]);
    await create();
    await up();
    expect($$('.rpt-item').map((i) => i.dataset['code'])).toEqual(['CRMG10', 'GGW-LD-01']);
  });

  it('search narrows the list; no match → the empty card', async () => {
    await create();
    await up();
    typeIn('#rptSearch', 'SUN-LD-0');
    expect($$('.rpt-item').length).toBe(8);
    typeIn('#rptSearch', 'zzz');
    expect($$('.rpt-item')).toHaveLength(0);
    expect($('#rptGroups').textContent).toContain('ไม่พบรายงานที่ค้นหา');
  });

  it('selecting a report builds its filter panel and fills the selects from master data', async () => {
    await create();
    await up();
    $<HTMLElement>('.rpt-item[data-code="SUN-LD-06"]').click();
    expect($('.rpt-side-title').textContent).toContain('SUN-LD-06');
    expect($('.rpt-item.on').dataset['code']).toBe('SUN-LD-06');
    await settle(() => expect($<HTMLSelectElement>('#f_prospect').options.length).toBeGreaterThan(2));
    expect($<HTMLSelectElement>('#f_prospect').options[0].textContent).toBe('เลือก');
  });

  it('a required filter that is empty stops "เรียกดู" with a message; nothing is opened', async () => {
    await create();
    await up();
    const open = vi.spyOn(window, 'open').mockReturnValue({ closed: false } as Window);
    $<HTMLElement>('.rpt-item[data-code="SUN-LD-06"]').click();
    await settle(() => expect($<HTMLSelectElement>('#f_prospect').options.length).toBeGreaterThan(2));
    $('#rptRun').click();
    expect(swal).toHaveBeenCalledWith(expect.objectContaining({ icon: 'info', buttons: false, text: expect.stringContaining('กรุณาเลือก ลูกค้า') }));
    expect(open).not.toHaveBeenCalled();
  });

  it('"เรียกดู" opens the report in a new tab with the filters as the page sends them (yyyy-MM-dd)', async () => {
    await create();
    await up();
    const created: Blob[] = [];
    (URL as unknown as Record<string, unknown>)['createObjectURL'] = vi.fn((b: Blob) => (created.push(b), 'blob:report'));
    const open = vi.spyOn(window, 'open').mockReturnValue({ closed: false } as Window);
    $<HTMLElement>('.rpt-item[data-code="SUN-LD-01"]').click();
    const from = $<HTMLInputElement>('#f_dateRange_from');
    from.value = '01/03/2026';
    $<HTMLInputElement>('#f_dateRange_to').value = '31/03/2026';
    $('#rptRun').click();
    expect(open).toHaveBeenCalledWith('blob:report', '_blank');
    const pdf = await created[0].text();
    expect(pdf).toContain('(code = SUN-LD-01)');
    expect(pdf).toContain('(dateRange_from = 2026-03-01)');
    expect(pdf).toContain('(dateRange_to = 2026-03-31)');
  });

  it('a blocked popup is reported instead of failing silently', async () => {
    await create();
    await up();
    (URL as unknown as Record<string, unknown>)['createObjectURL'] = vi.fn(() => 'blob:report');
    vi.spyOn(window, 'open').mockReturnValue(null);
    $<HTMLElement>('.rpt-item[data-code="CRMG11"]').click();
    $('#rptRun').click();
    expect(swal).toHaveBeenCalledWith(expect.objectContaining({ text: expect.stringContaining('บล็อกการเปิดแท็บใหม่') }));
  });

  it('a language switch is a page reload in Java: a NEW page instance', async () => {
    await create();
    await up();
    const first = fixture.debugElement.query(By.directive(ReportView)).componentInstance;
    lang.set('en');
    fixture.detectChanges();
    TestBed.tick?.();
    await settle(() => expect(fixture.debugElement.query(By.directive(ReportView)).componentInstance).not.toBe(first));
    await up();
  });

  it('leaving the page before the data file arrived: the late answer paints nothing (it never settles)', async () => {
    await create();
    const groups = $('#rptGroups');
    // wait until the engine has started (it asked for the data file: the skeleton is still there), then leave
    await new Promise((r) => setTimeout(r, 40));
    fixture.destroy();
    await new Promise((r) => setTimeout(r, 400)); // the mock answers after 120 ms
    expect(groups.querySelector('.rpt-sk')).toBeTruthy();
    expect(groups.querySelector('.rpt-item')).toBeNull();
  });

  it('with mock off the host builds the LIVE backend: the page lists the reports the roles allow, from the data file, with no "not connected" notice', async () => {
    allowed = new Set([reportRole('CRMG10'), reportRole('GGW-LD-01')]);
    const { deps } = fakeRest(() => ({}), { roles: [...allowed] });
    const backend = vi.spyOn(ReportView.prototype as unknown as { backend(): Promise<unknown> }, 'backend').mockImplementation(async () => createLiveReport(deps));
    await create(false);
    await up();
    expect(backend).toHaveBeenCalledTimes(1);
    expect(el.querySelector('ts-live-missing')).toBeNull();
    expect($$('.rpt-item').map((i) => i.dataset['code'])).toEqual(['CRMG10', 'GGW-LD-01']);
  });
});
