import { provideHttpClient, withInterceptors } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { signal } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { ConfigService } from '@core/config/config.service';
import { apiErrorInterceptor } from '@core/http/interceptors';
import { I18n } from '@core/i18n/i18n.service';
import { configStub } from '@core/testing/test-helpers';
import { DialogService } from '@shared/ui/notify/dialog.service';
import { Forecast } from './forecast';
import { ForecastBackend } from './forecast.backend';

const BASE = '/triplesale-service/api/v1/forecast';
const sleep = (ms = 0) => new Promise((r) => setTimeout(r, ms));

describe('Forecast page (the prototype v19 on the real shell)', () => {
  let http: HttpTestingController;
  let fixture: ComponentFixture<Forecast>;
  let el: HTMLElement;
  /** every call the page made: "GET /configs?year=2026" */
  let calls: string[];
  /** body of the last call per "METHOD /path" */
  let bodies: Record<string, unknown>;
  /** answers of a "real" API by path (default: 404 = the API is not there yet) */
  let real: Record<string, unknown>;

  beforeEach(() => {
    calls = [];
    bodies = {};
    real = {};
    TestBed.configureTestingModule({
      imports: [Forecast],
      providers: [
        provideHttpClient(withInterceptors([apiErrorInterceptor])),
        provideHttpClientTesting(),
        { provide: ConfigService, useValue: configStub({ mock: false }) },
        // texts = their keys (+ arguments), so the assertions do not depend on the wording
        { provide: I18n, useValue: { t: (k: string, ...a: (string | number)[]) => (a.length ? `${k}|${a.join('|')}` : k), lang: signal('th') } },
      ],
    });
    http = TestBed.inject(HttpTestingController);
  });
  afterEach(() => http.verify());

  /** answers what is pending (404 unless `real` has the path) until the page is quiet, then draws */
  async function settle(): Promise<void> {
    let idle = 0;
    while (idle < 3) {
      await sleep();
      const pending = http.match(() => true);
      idle = pending.length ? 0 : idle + 1;
      for (const req of pending) {
        const path = req.request.urlWithParams.replace(BASE, '');
        const key = `${req.request.method} ${path}`;
        calls.push(key);
        bodies[`${req.request.method} ${path.split('?')[0]}`] = req.request.body;
        const answer = real[path.split('?')[0]];
        if (answer !== undefined) req.flush(answer);
        else if (req.request.responseType === 'blob') req.flush(new Blob(['Not Found']), { status: 404, statusText: 'Not Found' });
        else req.flush('Not Found', { status: 404, statusText: 'Not Found' });
      }
      fixture.detectChanges();
    }
  }

  async function open(): Promise<void> {
    fixture = TestBed.createComponent(Forecast);
    el = fixture.nativeElement;
    fixture.detectChanges();
    await settle();
  }

  const q = <T extends Element = HTMLElement>(sel: string) => el.querySelector<T>(sel)!;
  const qa = <T extends Element = HTMLElement>(sel: string) => Array.from(el.querySelectorAll<T>(sel));
  const text = (sel: string) => qa(sel).map((n) => n.textContent!.replace(/\s+/g, ' ').trim());
  const click = async (target: Element) => {
    (target as HTMLElement).click();
    fixture.detectChanges();
    await settle();
  };
  const l1 = (n: number) => click(qa('.l1 button')[n]);
  const l2 = (n: number) => click(qa('.l2 button')[n]);
  const choose = async (label: string, value: string) => {
    const s = qa<HTMLSelectElement>('select').find((x) => x.getAttribute('aria-label') === label)!;
    s.value = value;
    s.dispatchEvent(new Event('change', { bubbles: true }));
    fixture.detectChanges();
    await settle();
  };
  const type = async (input: HTMLInputElement, value: string, event = 'input') => {
    input.value = value;
    input.dispatchEvent(new Event(event, { bubbles: true }));
    fixture.detectChanges();
    await settle();
  };
  const since = (n: number) => calls.slice(n);

  it('opens on Sales Forecast Listing with the data of the prototype when the API is not there', async () => {
    await open();
    // the five tabs of the prototype — no "แผนภาพฐานข้อมูล (ERD)", no "Endpoint ที่ใช้"
    expect(text('.l1 button')).toEqual(['☰Sales Forecast Listing', '⚙Sales Forecast Configuration', '▤Forecast Overview', '▥Forecast Dashboard', '◷Forecast Change History']);
    expect(el.textContent).not.toContain('ERD');
    expect(el.textContent).not.toContain('Endpoint');
    expect(text('.crumb span:not(.sep):not([aria-hidden])')).toEqual(['Sales Forecast', 'Sales Forecast Listing']);

    expect(text('tbody tr td:first-child')).toEqual(['FC-2027', 'FC-2026', 'FC-2025']);
    expect(text('tbody tr:nth-child(2) td').slice(1, 8)).toEqual(['Sales Forecast ปี 2026', '2569 app.forecast.list.currentYear', 'app.forecast.period.monthly', 'Weighted', 'Release', 'v3', '28/10/2026 11:05 System Configurator']);
    // row icons by status: Draft = open · release · delete · history · copy ; Release = open · block · history · copy
    expect(qa('tbody tr:nth-child(1) .ibtn-s').length).toBe(5);
    expect(qa('tbody tr:nth-child(2) .ibtn-s').length).toBe(4);

    // the API was asked first, on the paths of the Endpoint tab
    expect(calls).toEqual(expect.arrayContaining(['GET /lookups', 'GET /configs', 'GET /configs/C2/periods', 'GET /configs/C3/periods']));
    // sample-data badge + the company / simulated role of the prototype
    expect(text('.top-r .chip')).toEqual(['app.forecast.mock.badge']);
    expect(text('.top-r select option')).toEqual(['SUN GATEWAY', 'GGW', 'ACE CLOUD', 'System Configurator', 'Executive', 'Sales Manager (Team A)', 'Salesperson (สมชาย)']);
    expect(q('.toast')).toBeNull(); // nothing left on screen about the missing API
  });

  it('shows what the API answers when it is there: no sample badge, no simulated role', async () => {
    real['/lookups'] = {
      status: 200,
      result: {
        fiscalYears: [{ id: 'fy26', year: 2026, hasConfig: true }],
        pipelines: [{ id: 'PX', code: 'PX', name: 'สายจริง' }],
        teams: [{ id: 'T1', name: 'ทีมจริง', employees: [{ id: 'U1', name: 'คนจริง' }] }],
        stepMapping: [],
        company: { currency: 'THB', fiscalYearStart: 1 },
        permissions: { canConfig: false, canTarget: false, canAdjust: false, canClose: false, canReopen: false },
        currentMonth: '2026-11',
      },
    };
    const cfg = { id: 'R1', code: 'FC-REAL', name: 'ของจริง', year: 2026, periodType: 'monthly', hierarchyType: 'orgchart', openFormula: 'full', overdueRule: 'separate', allowJudgment: true, allowCategoryOverride: true, allowManagerAdjustment: true, status: 'release', versionNo: 7, everReleased: true, updatedAt: '2026-11-10T08:30:00', updatedBy: 'ผู้ดูแล', actions: ['open', 'history'] };
    real['/configs'] = { status: 200, result: { items: [cfg] } };
    real['/configs/R1/periods'] = { status: 200, result: { items: [] } };
    await open();

    expect(text('tbody tr td:first-child')).toEqual(['FC-REAL']);
    expect(text('tbody tr td').slice(4, 8)).toEqual(['Full Amount', 'Release', 'v7', '10/11/2026 08:30 ผู้ดูแล']);
    expect(qa('tbody tr .ibtn-s').length).toBe(2); // the actions the server computed
    expect(q('.top-r')).toBeNull();
    expect(q('.ph .btn-p')).toBeNull(); // canConfig = false: no "create"
    expect(TestBed.inject(ForecastBackend).offline()).toBe(false);
  });

  it('Sales Forecast Configuration opens the released Config of the current year; the form is the Configuration tab of the prototype', async () => {
    await open();
    const n = calls.length;
    await l1(1);
    expect(since(n)).toContain('GET /configs/C2'); // EP-03: the Config with its rowVersion
    expect(text('.crumb span:not(.sep):not([aria-hidden])')).toEqual(['Sales Forecast', 'Sales Forecast Configuration', 'FC-2026', 'Configuration']);
    expect(text('.wsbar select option')).toEqual(['FC-2027 · app.forecast.yearN|2570 · Draft', 'FC-2026 · app.forecast.yearN|2569 · Release', 'FC-2025 · app.forecast.yearN|2568 · Block']);
    expect(text('.wsbar .chip')).toEqual(['Release', 'v3']);
    expect(text('.l2 button')).toEqual(['Configuration', 'Sales Target', 'Adjustment', 'Close Forecast Period']);
    expect(qa<HTMLInputElement>('.cfg input.inp').map((i) => i.value)).toEqual(['FC-2026', 'Sales Forecast ปี 2026', 'app.forecast.cfg.creditOwner']);
    expect(qa<HTMLSelectElement>('.cfg select').map((s) => s.value)).toEqual(['2026', 'monthly', 'orgchart', 'weighted', 'current']);
    expect(qa<HTMLSelectElement>('.cfg select')[0].disabled).toBe(true); // the year is fixed once released
    expect(qa<HTMLInputElement>('.sw input').map((i) => i.checked)).toEqual([true, true, true]);
    expect(q<HTMLButtonElement>('.wsbar .btn-p').disabled).toBe(true); // nothing to save yet

    // an edit waits for the one save button; a released Config gets a new Version
    await choose('app.forecast.cfg.formula', 'full');
    expect(text('.wsdirty')).toEqual(['app.forecast.ws.pending app.forecast.ws.partCfg|1']);
    expect(text('.l2 button.on .dot').length).toBe(1);
    expect(text('.wsbar .btn-p')).toEqual(['app.forecast.ws.saveVersion|4']);
    await click(q('.wsbar .btn-p'));
    expect(bodies['PUT /configs/C2']).toEqual({ rowVersion: 1, config: { openFormula: 'full' } });
    expect(text('.wsbar .chip')).toEqual(['Release', 'v4']);
    expect(text('.toast')).toEqual(['app.forecast.toast.saved|app.forecast.msg.cfgVersion|4']);
    expect(q('.wsdirty')).toBeNull();
  });

  it('Sales Target: pick a pipeline and months, type targets, save them with the workspace', async () => {
    await open();
    await l1(1);
    const n = calls.length;
    await l2(1);
    expect(since(n)).toEqual(['GET /configs/C2/targets?periodIds=C2-2026-11&pipelineId=P1']);
    expect(text('.pick select option')).toEqual(['ขายโครงการapp.forecast.target.filled|3', 'ขายปลีกapp.forecast.target.filled|4']);
    expect(text('.selsum .chip')).toEqual(['พ.ย. 69×']);
    // months before พ.ย. 69 are closed periods: locked
    expect(qa('.q .ms button .lk').length).toBe(10);
    const cells = () => qa<HTMLInputElement>('tbody input.mini').map((i) => [i.value, i.placeholder, i.disabled]);
    expect(cells()).toEqual([
      ['', '1,008,000', false], // Team A · Target ทีม (placeholder = sum of the members)
      ['1008000', '—', false],
      ['', '—', false], // วิภา sells retail only: no target of this pipeline
      ['', '1,882,000', false],
      ['874000', '—', false],
      ['1008000', '—', false],
    ]);

    // the whole quarter: one more call for the new months; ต.ค. is a closed period → its cells are locked
    await click(qa('.q > button')[3]);
    expect(calls.at(-1)).toBe('GET /configs/C2/targets?periodIds=C2-2026-10,C2-2026-11,C2-2026-12&pipelineId=P1');
    expect(text('thead th')).toEqual(['app.forecast.col.teamEmp', 'ต.ค. 69 🔒', 'พ.ย. 69', 'ธ.ค. 69', 'app.forecast.col.sumi']);
    expect(cells().slice(3, 6)).toEqual([
      ['997000', '—', true],
      ['1008000', '—', false],
      ['1019000', '—', false],
    ]);

    // วิภา gets a target, the team target is set lower than the sum of its members
    const wipa = qa<HTMLInputElement>('tbody tr:nth-child(3) input.mini')[1];
    await type(wipa, '500000', 'change');
    const teamA = qa<HTMLInputElement>('tbody tr:nth-child(1) input.mini')[1];
    await type(teamA, '1200000', 'change');
    expect(wipa.getAttribute('data-chg')).toBe('1');
    expect(text('tbody tr:nth-child(1) .delta')).toEqual(['app.forecast.target.over|1,508,000|308,000']);
    expect(text('.wsdirty')).toEqual(['app.forecast.ws.pending app.forecast.ws.partTarget|2']);
    await click(q('.wsbar .btn-p'));
    expect(bodies['PUT /configs/C2']).toEqual({
      rowVersion: 1,
      targets: [{ periodId: 'C2-2026-11', periodNo: 11, employeeId: 'E02', pipelineId: 'P1', amount: 500000 }],
      teamTargets: [{ periodId: 'C2-2026-11', periodNo: 11, pipelineId: 'P1', positionId: 'A', amount: 1200000 }],
    });
    expect(text('.toast')).toEqual(['app.forecast.toast.saved|app.forecast.msg.target|2']);
    expect(q('.wsdirty')).toBeNull();
    expect(qa<HTMLInputElement>('tbody tr:nth-child(3) input.mini')[1].value).toBe('500000'); // saved, read back
  });

  it('Adjustment: the equation and the deals of the period; a judgment is a draft until reviewed and confirmed', async () => {
    await open();
    await l1(1);
    const n = calls.length;
    await l2(2);
    expect(since(n)).toEqual(expect.arrayContaining(['POST /summary', 'GET /opportunities?periodId=C2-2026-11&pipelineId=all']));
    expect(bodies['POST /summary']).toEqual({ periodId: 'C2-2026-11', pipelineId: 'all' });
    expect(text('.eq .eqc .v')).toEqual(['5,080,000', '+187,500', '+150,000', '5,417,500']);
    expect(text('.catline .ci')).toEqual(['Committed 2,440,000', 'Best Case 930,000', 'Pipeline 680,000 → 867,500 +187,500', 'Closed 1,030,000', 'Omitted 300,000']);
    expect(text('.empchips button')).toEqual(['app.forecast.filter.allEmps', 'สมชาย ใจดี1,947,500', 'วิภา ทองดี1,120,000', 'อนันต์ กิตติ1,400,000', 'พิมพ์ชนก แก้วใจ800,000']);
    expect(qa('tbody tr').length).toBe(10);
    expect(text('tbody tr:nth-child(2) td').slice(1, 5)).toEqual(['OPP-002 บริษัท เบต้า จำกัด · สมชาย ใจดี · Team A · ขายปลีก', 'Pipelineประเมินความต้องการ', '40%', '700,000']);
    expect(text('tbody tr:nth-child(2) td:nth-child(10)')).toEqual(['280,000467,500 +187,500']); // before → after of the saved judgment
    expect(text('tbody tr:nth-child(9) .chip.c-warn')).toEqual(['app.forecast.judg.overdueIn|ก.ย. 69']);
    // closed deals are read only
    expect(qa('tbody tr:nth-child(4) input, tbody tr:nth-child(4) select').length).toBe(0);

    // OPP-001 → OUT: the row changes at once, the totals come from EP-08 with the draft
    await choose('IN / OUT OPP-001', '0');
    expect(q('tbody tr:nth-child(1)').classList.contains('dirty')).toBe(true);
    expect(text('tbody tr:nth-child(1) td:nth-child(10)')).toEqual(['1,000,0000 −1,000,000']);
    await sleep(260); // the preview is asked a moment after the last edit
    await settle();
    expect(bodies['POST /summary']).toEqual({
      periodId: 'C2-2026-11',
      pipelineId: 'all',
      draft: { judgments: [{ opportunityId: 'OPP-001', in: false, probability: 80, amount: 1250000, category: 'committed', reason: '' }], adjustments: [] },
    });
    expect(text('.eq .eqc .v')).toEqual(['5,080,000', '−812,500', '+150,000', '4,417,500']);
    expect(text('.eqst .chip')).toEqual(['app.forecast.adjust.preview']);
    expect(text('.wsdirty')).toEqual(['app.forecast.ws.pending app.forecast.ws.partAdj|1']);

    // save → review: a reason is required before the confirm button works
    await click(q('.wsbar .btn-p'));
    expect(text('.dlg-h h3')).toEqual(['app.forecast.review.title']);
    expect(text('.ba-c .v')).toEqual(['5,417,500', '4,417,500', '−1,000,000']);
    expect(text('.dlg .warn')).toEqual(['app.forecast.review.fix|1app.forecast.err.reason|OPP-001']);
    expect(q<HTMLButtonElement>('.dlg-f .btn-p').disabled).toBe(true);
    await click(q('.dlg-f .btn-g')); // back to edit
    await type(q<HTMLInputElement>('tbody tr:nth-child(1) input.w150'), 'ลูกค้าเลื่อน');
    await click(q('.wsbar .btn-p'));
    expect(text('.dlg tbody td')).toEqual(['Judgment', 'OPP-001', 'IN · 80% · 1,250,000 · Committed app.forecast.review.original', 'OUT · 80% · 1,250,000 · Committed', 'ลูกค้าเลื่อน']);
    await click(q('.dlg-f .btn-p'));
    expect(bodies['POST /adjustments']).toEqual({
      periodId: 'C2-2026-11',
      judgments: [{ opportunityId: 'OPP-001', in: false, probability: 80, amount: 1250000, category: 'committed', reason: 'ลูกค้าเลื่อน' }],
      adjustments: [],
    });
    expect(q('.overlay')).toBeNull();
    expect(text('.toast')).toEqual(['app.forecast.toast.committed|1']);
    expect(text('.eq .eqc .v')).toEqual(['5,080,000', '−812,500', '+150,000', '4,417,500']);
    expect(text('.eqst .chip')).toEqual(['app.forecast.adjust.matches']);
    expect(q('.wsdirty')).toBeNull();
  });

  it('Manager Adjustment: read only for all pipelines, a Δ per employee once a pipeline is chosen', async () => {
    await open();
    await l1(1);
    await l2(2);
    await click(qa('.ph .seg button')[1]);
    expect(text('.note.inset')).toEqual(['app.forecast.mgr.pickPipe']);
    expect(qa('tbody input').length).toBe(0);
    expect(text('tbody tr.tot td').slice(0, 8)).toEqual(['app.forecast.total', '6,384,000', '5,080,000', '5,267,500', '+187,500', '+150,000', '5,417,500', '−966,500']);

    await choose('app.forecast.filter.pipe', 'P1');
    expect(bodies['POST /summary']).toEqual({ periodId: 'C2-2026-11', pipelineId: 'P1' });
    const row = (n: number) => text(`tbody tr:nth-child(${n}) td`);
    expect(row(1).slice(0, 5)).toEqual(['สมชาย ใจดีTeam A', '1,008,000', '1,480,000', '1,480,000', '±0']);
    expect(row(5).slice(6, 8)).toEqual(['950,000+150,000', '−58,000']); // พิมพ์ชนก: the saved +150,000
    expect(qa<HTMLInputElement>('tbody tr:nth-child(5) input').map((i) => i.value)).toEqual(['150000', '', 'คาดว่าลูกค้าเพิ่มคำสั่งซื้อปลายเดือน']);

    // "ตั้ง Final" 1,500,000 for สมชาย (after Judgment 1,480,000) → Δ +20,000, shown at once in the row and the totals
    const [delta, final] = qa<HTMLInputElement>('tbody tr:nth-child(1) input');
    await type(final, '1500000');
    expect(delta.value).toBe('20000');
    expect(row(1).slice(6, 8)).toEqual(['1,500,000+20,000', '+492,000']);
    expect(row(3).slice(5, 7)).toEqual(['+20,000', '2,070,000']); // รวม Team A
    expect(row(7).slice(5, 7)).toEqual(['+170,000', '3,420,000']); // รวมทั้งหมด
    expect(q('tbody tr:nth-child(1)').classList.contains('dirty')).toBe(true);

    // a Δ needs a reason
    await click(q('.wsbar .btn-p'));
    expect(text('.dlg .warn')).toEqual(['app.forecast.review.fix|1app.forecast.err.adjReason|สมชาย ใจดี · พ.ย. 69 · ขายโครงการ']);
    await click(q('.dlg-f .btn-g'));
    await type(qa<HTMLInputElement>('tbody tr:nth-child(1) input')[2], 'ดีลใหญ่ใกล้ปิด');
    await click(q('.wsbar .btn-p'));
    await click(q('.dlg-f .btn-p'));
    expect(bodies['POST /adjustments']).toEqual({ periodId: 'C2-2026-11', judgments: [], adjustments: [{ employeeId: 'E01', pipelineId: 'P1', delta: 20000, reason: 'ดีลใหญ่ใกล้ปิด' }] });
    expect(text('.eq .eqc .v')).toEqual(['3,250,000', '±0', '+170,000', '3,420,000']);
  });

  it('leaving with unsaved edits asks first (stay = nothing lost, leave = edits dropped)', async () => {
    await open();
    await l1(1);
    await choose('app.forecast.cfg.formula', 'full');
    await l1(2); // → Forecast Overview
    expect(text('.dlg-h h3')).toEqual(['app.forecast.leave.title']);
    expect(text('.dlg-b div')[0]).toBe('app.forecast.leave.text|1 · app.forecast.ws.partCfg|1');
    await click(q('.dlg-f .btn-g')); // stay
    expect(text('.l1 button.on')).toEqual(['⚙Sales Forecast Configuration']);
    expect(q<HTMLSelectElement>('.cfg select[aria-label="app.forecast.cfg.formula"]').value).toBe('full');
    await l1(2);
    await click(q('.dlg-f .btn-d')); // leave without saving
    expect(text('.l1 button.on')).toEqual(['▤Forecast Overview']);
    await l1(1);
    expect(q<HTMLSelectElement>('.cfg select[aria-label="app.forecast.cfg.formula"]').value).toBe('weighted');
  });

  it('Close Forecast Period: the periods of the year; closing asks for a reason and keeps the snapshot', async () => {
    await open();
    await l1(1);
    const n = calls.length;
    await l2(3);
    expect(since(n)).toEqual(['GET /configs/C2/periods?includeTotals=true']);
    expect(qa('tbody tr').length).toBe(12);
    expect(text('tbody tr:nth-child(10) td').slice(0, 7)).toEqual(['ต.ค. 69', 'FC-2026 Release', 'app.forecast.close.closed', '6,315,000', '5,250,000', '5,250,000', 'System Configurator 01/11/2026 09:00']);
    expect(text('tbody tr:nth-child(11) td').slice(0, 7)).toEqual(['พ.ย. 69', 'FC-2026 Release', 'app.forecast.close.open', '6,384,000', '5,417,500', '—', '—']);
    expect(text('tbody tr:nth-child(10) .btn')).toEqual(['app.forecast.close.reopen']);

    await click(q('tbody tr:nth-child(11) .btn'));
    expect(text('.dlg-h h3')).toEqual(['app.forecast.period.closeTitle|พ.ย. 69']);
    await click(q('.dlg-f .btn-p')); // no reason yet
    expect(text('.toast')).toEqual(['app.forecast.toast.reasonRequired']);
    expect(q('.overlay')).not.toBeNull();
    await type(q<HTMLInputElement>('.dlg input'), 'ปิดงวดประจำเดือน');
    await click(q('.dlg-f .btn-p'));
    expect(bodies['POST /periods/C2-2026-11/status']).toEqual({ action: 'close', reason: 'ปิดงวดประจำเดือน', rowVersion: 1 });
    expect(text('tbody tr:nth-child(11) td').slice(2, 6)).toEqual(['app.forecast.close.closed', '6,384,000', '5,417,500', '5,417,500']);
    expect(text('tbody tr:nth-child(11) .btn')).toEqual(['app.forecast.close.reopen']);
  });

  it('Sales Forecast Listing: release a Draft, copy to the next year, filter by status', async () => {
    await open();
    await click(q('tbody tr:nth-child(1) .ibtn-s.p')); // ✓ Release FC-2027
    expect(text('.dlg-h h3')).toEqual(['Release · FC-2027']);
    expect(text('.dlg-b > div:first-child')).toEqual(['app.forecast.cfgst.releaseText|2570']);
    await click(q('.dlg-f .btn-p'));
    expect(bodies['POST /configs/C3/status']).toEqual({ action: 'release', rowVersion: 1 });
    expect(text('tbody tr:nth-child(1) td:nth-child(6)')).toEqual(['Release']);
    expect(text('.toast')).toEqual(['FC-2027 → Release']);

    await click(qa('tbody tr:nth-child(2) .ibtn-s').at(-1)!); // ⧉ copy FC-2026
    expect(bodies['POST /configs']).toMatchObject({ copyFromId: 'C2', config: { code: 'FC-2028', name: 'Sales Forecast ปี 2028', year: 2028, fiscalYearId: 'FY2028', overdueRule: 'current' } });
    expect(text('tbody tr td:first-child')).toEqual(['FC-2028', 'FC-2027', 'FC-2026', 'FC-2025']);
    expect(text('.toast')).toEqual(['app.forecast.toast.copied|FC-2028|FC-2026']);

    await choose('app.forecast.status', 'draft');
    expect(calls.at(-1)).toBe('GET /configs?status=draft');
    expect(text('tbody tr td:first-child')).toEqual(['FC-2028']);

    // 🗑 delete the Draft: asks through the app dialog
    await click(q('tbody tr .ibtn-s.d'));
    expect(TestBed.inject(DialogService).state()).toMatchObject({ kind: 'confirm', title: 'app.forecast.confirm.delete|FC-2028', danger: true });
    TestBed.inject(DialogService).close(true);
    await settle();
    expect(bodies['POST /configs/C7/status']).toEqual({ action: 'delete', rowVersion: 1 });
    expect(text('tbody tr td')).toEqual(['app.forecast.noRows']);
  });

  it('version history of a Config (EP-03 include=versions)', async () => {
    await open();
    await click(qa('tbody tr:nth-child(2) .ibtn-s')[2]); // ↺
    expect(calls.at(-1)).toBe('GET /configs/C2?include=versions');
    expect(text('.dlg-h h3')).toEqual(['app.forecast.cfghist.title|FC-2026']);
    expect(qa('.dlg tbody tr').map((tr) => Array.from(tr.children, (td) => td.textContent!.replace(/\s+/g, ' ').trim()))).toEqual([
      ['v1', '05/01/2026 10:00', 'System Configurator', 'app.forecast.cfghist.first'],
      ['v2', '12/03/2026 15:30', 'System Configurator', 'app.forecast.cfghist.edit|Pipeline'],
      ['v3 app.forecast.cfghist.current', '28/10/2026 11:05', 'System Configurator', 'app.forecast.cfghist.edit|app.forecast.field.allowJudgment'],
    ]);
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
    fixture.detectChanges();
    expect(q('.overlay')).toBeNull();
  });

  it('Forecast Overview: the saved figures of the period; a click on a row lists its opportunities', async () => {
    await open();
    const n = calls.length;
    await l1(2);
    expect(since(n)).toEqual(expect.arrayContaining(['POST /summary', 'GET /opportunities?periodId=C2-2026-11&pipelineId=all']));
    expect(text('.kpis:not(.k3) .kpi .v')).toEqual(['6,384,000', '1,030,000', '7,450,000', '5,417,500', '−966,500', '84.9%']);
    expect(text('.kpis.k3 .kpi .v')).toEqual(['4,080,000', '5,417,500', '5,630,000']);
    expect(text('.kpis.k3 .kpi .s')).toEqual(['app.forecast.scen.ofTarget|64', 'app.forecast.scen.ofTarget|85', 'app.forecast.scen.ofTarget|88']);
    const table = qa('.tw table')[1];
    const rows = Array.from(table.querySelectorAll('tbody tr'), (tr) => Array.from(tr.children, (td) => td.textContent!.replace(/\s+/g, ' ').trim()));
    expect(rows[0]).toEqual(['Team A', '3,248,000', '1,030,000', '1,000,000', '570,000', '467,500', '2,880,000', '+187,500', '3,067,500', '−180,500', '94%']);
    expect(rows[1]).toEqual(['สมชาย ใจดี', '1,680,000', '480,000', '1,000,000', '0', '467,500', '1,760,000', '+187,500', '1,947,500', '+267,500', '116%']);
    expect(rows[6]).toEqual(['app.forecast.total', '6,384,000', '1,030,000', '2,440,000', '930,000', '867,500', '5,080,000', '+337,500', '5,417,500', '−966,500', '85%']);
    expect(text('.card-h').at(-1)).toBe('Opportunity · app.forecast.ov.alliapp.forecast.count|10');

    await click(table.querySelectorAll('tbody tr')[2]); // วิภา
    expect(calls.at(-1)).toBe('GET /opportunities?periodId=C2-2026-11&pipelineId=all&employeeId=E02');
    expect(qa('.card').at(-1)!.querySelectorAll('tbody tr').length).toBe(2);
    expect(text('.card tbody tr td:first-child').slice(-2)).toEqual(['OPP-003บริษัท แกมม่า จำกัด', 'OPP-004บริษัท เดลต้า จำกัด']);
    expect(table.querySelectorAll('tbody tr')[2].classList.contains('pick')).toBe(true);

    // a year with only a Draft Config still answers (ม.ค. 70 belongs to FC-2027)
    await choose('app.forecast.filter.month', '2027-01');
    expect(bodies['POST /summary']).toEqual({ periodId: 'C3-2027-01', pipelineId: 'all' });
    expect(text('.kpis:not(.k3) .kpi .v').slice(0, 4)).toEqual(['6,521,000', '0', '650,000', '390,000']);
  });

  it('Forecast Dashboard: month / quarter / year of EP-13, drawn as the four charts of the prototype', async () => {
    await open();
    const n = calls.length;
    await l1(3);
    expect(since(n)).toEqual(['GET /dashboard?level=month&year=2026&month=11&pipelineId=all']);
    expect(text('.kpis:not(.k3) .kpi .v')).toEqual(['6,384,000', '1,030,000', '5,417,500', '−966,500', '84.9%', '+337,500']);
    expect(qa('svg.chart path.ln').length).toBe(3); // Target · Final · Closed Success
    expect(qa('svg.chart circle').length).toBe(9);
    expect(text('svg.chart text.ax')).toEqual(['ต.ค.', 'พ.ย.', 'ธ.ค.']);
    expect(text('svg.chart text.ax.on')).toEqual(['พ.ย.']); // the selected month of the quarter
    expect(text('.trow')).toEqual(['Team A3,067,500', 'Team B2,350,000']);
    expect(qa('svg.donut circle.seg-c').length).toBe(4); // Omitted is listed, not drawn
    expect(text('.hrow')).toEqual(['Committed2,440,000', 'Best Case930,000', 'Pipeline867,500', 'Closed1,030,000', 'Omitted300,000']);
    expect(text('.brow')).toEqual(['app.forecast.before5,080,000', 'Judgment+187,500', 'Manager Adjustment+150,000', 'Final5,417,500']);

    await click(qa('.filters .seg button')[0]); // year
    expect(calls.at(-1)).toBe('GET /dashboard?level=year&year=2026&pipelineId=all');
    expect(text('svg.chart text.ax').length).toBe(12);
    expect(text('.kpis:not(.k3) .kpi .v')).toEqual(['72,914,000', '54,520,000', '60,377,500', '−12,536,500', '82.8%', '+337,500']);

    await click(qa('.filters .seg button')[1]); // quarter
    await choose('app.forecast.dash.quarter', '1');
    await choose('app.forecast.filter.team', 'B');
    expect(calls.at(-1)).toBe('GET /dashboard?level=quarter&year=2026&quarter=1&pipelineId=all&teamId=B');
    expect(text('.trow b')).toEqual(['Team B']);
  });

  it('Forecast Change History: the log, filtered by type; Export says it is a mockup while there is no API', async () => {
    await open();
    const n = calls.length;
    await l1(4);
    expect(since(n)).toEqual(['GET /history']);
    expect(qa('tbody tr').map((tr) => Array.from(tr.children, (td) => td.textContent!.trim()))).toEqual([
      ['05/11/2026 10:12', 'Sales Manager (Team B)', 'Manager Adjustment', 'พิมพ์ชนก แก้วใจ · พ.ย. 69', '±0', '+150,000', 'คาดว่าลูกค้าเพิ่มคำสั่งซื้อปลายเดือน'],
      ['04/11/2026 16:40', 'Sales Manager (Team A)', 'Opportunity Judgment', 'OPP-002', '40% · 700,000', '55% · 850,000', 'ลูกค้าเพิ่ม Scope'],
      ['01/11/2026 09:00', 'System Configurator', 'Close Period', 'ต.ค. 69', 'เปิดอยู่', 'ปิดแล้ว', 'ปิดงวดประจำเดือน'],
      ['28/10/2026 11:05', 'System Configurator', 'Configuration', 'FC-2026', 'v2', 'v3', 'แก้ไข: Opportunity Judgment'],
    ]);
    await choose('app.forecast.hist.type', 'judgment');
    expect(calls.at(-1)).toBe('GET /history?type=judgment');
    expect(text('tbody tr td:nth-child(4)')).toEqual(['OPP-002']);

    await click(q('.ph .btn-g')); // Export
    expect(calls.at(-1)).toBe('GET /history?type=judgment&format=xlsx');
    expect(text('.toast')).toEqual(['app.forecast.toast.exportMock']);
  });

  it('simulated role of the prototype: a salesperson only sees themself and can change nothing', async () => {
    await open();
    await choose('app.forecast.mock.role', 'sales');
    expect(q('.ph .btn-p')).toBeNull(); // no "create"
    expect(qa('tbody tr:nth-child(1) .ibtn-s').length).toBe(2); // open · history
    await l1(1);
    expect(q('.wsbar .btn-p')).toBeNull(); // no save button
    expect(qa<HTMLInputElement>('.cfg input.inp').every((i) => i.disabled)).toBe(true);
    await l2(2);
    expect(text('.adjbar select[aria-label="app.forecast.filter.team"] option')).toEqual(['Team A']);
    expect(text('.adjbar select[aria-label="app.forecast.filter.emp"] option')).toEqual(['สมชาย ใจดี']);
    expect(text('.card-h .chip.c-grey')).toEqual(['app.forecast.judg.viewOnly']);
    expect(qa('tbody tr').length).toBe(3); // OPP-001 · OPP-002 · OPP-015
    expect(qa<HTMLInputElement>('tbody input').every((i) => i.disabled)).toBe(true);
    await l2(3);
    expect(text('.note')).toEqual(['app.forecast.close.whyRole']);
    expect(qa('tbody .btn').length).toBe(0);
  });

  it('new Configuration: a Draft of the first free year, saved with one POST, then it is the open workspace', async () => {
    await open();
    await click(q('.ph .btn-p'));
    expect(text('.wsbar > b')).toEqual(['app.forecast.ws.newTitle|2571']);
    expect(text('.crumb span:not(.sep):not([aria-hidden])')).toEqual(['Sales Forecast', 'Sales Forecast Configuration', 'app.forecast.crumb.new', 'Configuration']);
    expect(qa<HTMLInputElement>('.cfg input.inp').slice(0, 2).map((i) => i.value)).toEqual(['FC-2028', 'Sales Forecast ปี 2028']);
    expect(text('.wsbar .btn-p')).toEqual(['app.forecast.ws.saveDraft']);

    // a code that exists is refused before anything is sent
    const n = calls.length;
    await type(qa<HTMLInputElement>('.cfg input.inp')[0], 'fc-2026');
    await click(q('.wsbar .btn-p'));
    expect(text('.toast')).toEqual(['app.forecast.toast.codeDup']);
    expect(since(n)).toEqual([]);

    await type(qa<HTMLInputElement>('.cfg input.inp')[0], 'FC-2028');
    await click(q('.wsbar .btn-p'));
    expect(bodies['POST /configs']).toEqual({
      config: {
        code: 'FC-2028', name: 'Sales Forecast ปี 2028', fiscalYearId: 'FY2028', year: 2028, periodType: 'monthly', hierarchyType: 'orgchart', openFormula: 'weighted',
        overdueRule: 'separate', allowJudgment: true, allowCategoryOverride: true, allowManagerAdjustment: true,
      },
    });
    expect(text('.toast')).toEqual(['app.forecast.toast.saved|app.forecast.msg.created|FC-2028']);
    expect(text('.wsbar .chip')).toEqual(['Draft', 'v1']);
    expect(q<HTMLSelectElement>('.wsbar select').value).toBe('C7');
  });
});
