import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { resetMockupForTests, setDatasource } from '@core/mockup/mockup-datasource';
import { ForecastMock, ForecastMockError } from './forecast.mock';

/**
 * ตัวเลขในไฟล์นี้ได้จากการรันสคริปต์ของต้นแบบ (TripleSales_Forecast_Prototype_v19.html) เองใน Node แล้วเทียบกับ forecast.mock.ts
 * ทุกบริษัท / บทบาท / งวด / Pipeline / ทีม (21,938 จุด ตรงกันทั้งหมด ณ วันที่พอร์ต) — ที่ตรึงไว้ตรงนี้คือตัวแทนของชุดนั้น
 * เพื่อให้รู้ทันทีถ้าการคำนวณเพี้ยนจากต้นแบบ.
 */
describe('ForecastMock — the data and the calculation of the prototype', () => {
  let mock: ForecastMock;
  const P = (month: string, cfg = 'C2') => `${cfg}-${month}`;

  beforeEach(() => {
    mock = new ForecastMock();
  });

  it('EP-01 lookups: pipelines, teams → employees, step mapping, company, permissions of the System Configurator', () => {
    const lk = mock.lookups();
    expect(lk.pipelines).toEqual([
      { id: 'P1', code: 'P1', name: 'ขายโครงการ' },
      { id: 'P2', code: 'P2', name: 'ขายปลีก' },
    ]);
    expect(lk.teams.map((t) => [t.name, t.employees.map((e) => e.name)])).toEqual([
      ['Team A', ['สมชาย ใจดี', 'วิภา ทองดี']],
      ['Team B', ['อนันต์ กิตติ', 'พิมพ์ชนก แก้วใจ']],
    ]);
    expect(lk.stepMapping).toHaveLength(6);
    expect(lk.stepMapping[3]).toEqual({ step: 'เจรจาเสนอราคา', probability: 80, category: 'committed' });
    expect(lk.company).toEqual({ currency: 'THB', fiscalYearStart: 1 });
    expect(lk.fiscalYears.map((f) => [f.year, f.hasConfig])).toEqual([[2025, true], [2026, true], [2027, true], [2028, false]]);
    expect(lk.permissions).toEqual({ canConfig: true, canTarget: true, canAdjust: true, canClose: true, canReopen: true });
    expect(lk.currentMonth).toBe('2026-11');
  });

  it('roles of the prototype: what each one sees and may do', () => {
    mock.session = { company: 'SUN', role: 'exec' };
    expect(mock.lookups().permissions).toEqual({ canConfig: false, canTarget: true, canAdjust: true, canClose: true, canReopen: false });
    mock.session = { company: 'SUN', role: 'manager' };
    expect(mock.lookups().teams.map((t) => t.id)).toEqual(['A']);
    expect(mock.lookups().permissions).toEqual({ canConfig: false, canTarget: false, canAdjust: true, canClose: false, canReopen: false });
    expect(mock.configs().items[0].actions).toEqual(['open', 'history']);
    mock.session = { company: 'SUN', role: 'sales' };
    expect(mock.summary({ periodId: P('2026-11'), pipelineId: 'all' }).teams.map((t) => t.employees.map((e) => e.employeeId))).toEqual([['E01']]);
  });

  it('EP-02 / EP-03 configs: the three years of the prototype, row actions by status, version history', () => {
    const items = mock.configs().items;
    expect(items.map((c) => [c.id, c.code, c.year, c.status, c.versionNo, c.openFormula, c.overdueRule])).toEqual([
      ['C3', 'FC-2027', 2027, 'draft', 1, 'weighted', 'separate'],
      ['C2', 'FC-2026', 2026, 'release', 3, 'weighted', 'current'],
      ['C1', 'FC-2025', 2025, 'block', 2, 'weighted', 'separate'],
    ]);
    expect(items.map((c) => c.actions)).toEqual([
      ['open', 'release', 'delete', 'history', 'copy'],
      ['open', 'block', 'history', 'copy'],
      ['open', 'unblock', 'history', 'copy'],
    ]);
    expect(mock.configs({ year: 2026 }).items.map((c) => c.code)).toEqual(['FC-2026']);
    expect(mock.configs({ status: 'draft' }).items.map((c) => c.code)).toEqual(['FC-2027']);
    expect(mock.config('C2', 'versions').versions?.map((v) => [v.versionNo, v.changedFields, v.createdAt])).toEqual([
      [1, [], '2026-01-05T10:00:00'],
      [2, ['Pipeline'], '2026-03-12T15:30:00'],
      [3, ['allowJudgment'], '2026-10-28T11:05:00'],
    ]);
    expect(mock.config('C2').versions).toBeUndefined();
    expect(() => mock.config('nope')).toThrowError(ForecastMockError);
  });

  it('EP-08 summary of พ.ย. 69 (all pipelines) = the numbers on the prototype', () => {
    const s = mock.summary({ periodId: P('2026-11'), pipelineId: 'all' });
    expect(s.totals).toEqual({ target: 6384000, base: 5080000, judgmentDelta: 187500, managerDelta: 150000, final: 5417500, closed: 1030000, open: 7450000, gap: -966500, coverage: (5417500 / 6384000) * 100 });
    expect(s.scenario).toEqual({ min: 4080000, expected: 5417500, max: 5630000 });
    expect(s.categories).toEqual([
      { category: 'committed', before: 2440000, after: 2440000 },
      { category: 'bestcase', before: 930000, after: 930000 },
      { category: 'pipeline', before: 680000, after: 867500 },
      { category: 'closed', before: 1030000, after: 1030000 },
      { category: 'omitted', before: 300000, after: 300000 },
    ]);
    expect(s.teams.map((t) => [t.name, t.target, t.base, t.final, t.gap])).toEqual([
      ['Team A', 3248000, 2880000, 3067500, -180500],
      ['Team B', 3136000, 2200000, 2350000, -786000],
    ]);
    expect(s.teams[0].employees.map((e) => [e.name, e.final, e.categories.closed, e.categories.committed])).toEqual([
      ['สมชาย ใจดี', 1947500, 480000, 1000000],
      ['วิภา ทองดี', 1120000, 550000, 0],
    ]);
    expect(s.configStatus).toBe('release');
  });

  it('EP-08 other periods: a closed month, the next month, a year with only a Draft', () => {
    expect(mock.summary({ periodId: P('2026-10'), pipelineId: 'all' }).totals).toMatchObject({ target: 6315000, base: 5250000, final: 5250000, closed: 5250000, open: 0 });
    expect(mock.summary({ periodId: P('2026-12'), pipelineId: 'all' }).totals).toMatchObject({ target: 6453000, final: 1470000, open: 2550000 });
    const y27 = mock.summary({ periodId: P('2027-01', 'C3'), pipelineId: 'all' });
    expect(y27.totals).toMatchObject({ target: 6521000, final: 390000, open: 650000 });
    expect(y27.configStatus).toBe('none'); // FC-2027 is a Draft: nothing released for the year
  });

  it('EP-08 one pipeline: the manager adjustment of that pipeline, with its reason for the form', () => {
    const s = mock.summary({ periodId: P('2026-11'), pipelineId: 'P1' });
    expect(s.totals).toMatchObject({ target: 2890000, base: 3250000, judgmentDelta: 0, managerDelta: 150000, final: 3400000 });
    const pim = s.teams[1].employees[1];
    expect([pim.name, pim.adjustment]).toEqual(['พิมพ์ชนก แก้วใจ', { delta: 150000, reason: 'คาดว่าลูกค้าเพิ่มคำสั่งซื้อปลายเดือน' }]);
    expect(mock.summary({ periodId: P('2026-11'), pipelineId: 'all' }).teams[1].employees[1].adjustment).toBeNull();
  });

  it('EP-08 preview: an unsaved draft changes the answer and nothing else', () => {
    const draft = {
      judgments: [
        { opportunityId: 'OPP-001', in: false, probability: 80, amount: 1250000, category: 'committed' as const, reason: '' },
        { opportunityId: 'OPP-003', in: true, probability: 90, amount: 950000, category: 'committed' as const, reason: '' },
        { opportunityId: 'OPP-002', reset: true as const },
      ],
      adjustments: [{ employeeId: 'E01', pipelineId: 'P1', delta: -50000, reason: 'x' }],
    };
    const s = mock.summary({ periodId: P('2026-11'), pipelineId: 'P1', draft });
    expect(s.totals).toMatchObject({ base: 3250000, judgmentDelta: -715000, managerDelta: 100000, final: 2635000, open: 3950000 });
    expect(s.scenario).toEqual({ min: 2430000, expected: 2635000, max: 2430000 });
    expect(s.categories.map((c) => [c.category, c.before, c.after])).toEqual([
      ['committed', 1800000, 1655000],
      ['bestcase', 570000, 0],
      ['pipeline', 400000, 400000],
      ['closed', 480000, 480000],
      ['omitted', 0, 1250000],
    ]);
    // nothing was written
    expect(mock.summary({ periodId: P('2026-11'), pipelineId: 'P1' }).totals.final).toBe(3400000);
    expect(mock.history().items).toHaveLength(4);
  });

  it('EP-08 the second company of the prototype (GGW = 45 % of the amounts)', () => {
    mock.session = { company: 'GGW', role: 'config' };
    const id = mock.configs().items.find((c) => c.year === 2026)!.id;
    expect(id).toBe('C5');
    expect(mock.summary({ periodId: `${id}-2026-11`, pipelineId: 'all' }).totals).toMatchObject({ target: 2873000, base: 2286000, final: 2437875 });
  });

  it('EP-09 opportunities of the period: original values, the saved judgment, the overdue deal, closed deals not editable', () => {
    const items = mock.opportunities({ periodId: P('2026-11') }).items;
    expect(items.map((d) => d.id)).toEqual(['OPP-001', 'OPP-002', 'OPP-003', 'OPP-004', 'OPP-005', 'OPP-006', 'OPP-007', 'OPP-008', 'OPP-014', 'OPP-015']);
    const by = (id: string) => items.find((d) => d.id === id)!;
    expect(by('OPP-002')).toMatchObject({
      customer: 'บริษัท เบต้า จำกัด',
      owner: { id: 'E01', name: 'สมชาย ใจดี', teamId: 'A', teamName: 'Team A' },
      pipeline: { id: 'P2', name: 'ขายปลีก' },
      original: { amount: 700000, probability: 40, category: 'pipeline' },
      judgment: { in: true, probability: 55, amount: 850000, category: 'pipeline', reason: 'ลูกค้าเพิ่ม Scope' },
      valueBefore: 280000,
      valueAfter: 467500,
      editable: true,
    });
    // target month ก.ย. 69, still open in พ.ย. 69; FC-2026 counts it in the current period
    expect(by('OPP-014').overdue).toEqual({ targetMonth: '2026-09', rule: 'current' });
    expect(by('OPP-014').valueAfter).toBe(360000);
    expect([by('OPP-004').status, by('OPP-004').editable, by('OPP-006').status, by('OPP-006').valueAfter]).toEqual(['won', false, 'lost', 0]);
    expect(mock.opportunities({ periodId: P('2026-11'), employeeId: 'E04', pipelineId: 'P1' }).items.map((d) => d.id)).toEqual(['OPP-005']);
    // a closed period: nothing is editable
    expect(mock.opportunities({ periodId: P('2026-10') }).items.every((d) => !d.editable)).toBe(true);
  });

  it('EP-10 saving judgments and adjustments: values change, the history gets a line each, rules are enforced', () => {
    const res = mock.saveAdjustments({
      periodId: P('2026-11'),
      judgments: [
        { opportunityId: 'OPP-001', in: false, probability: 80, amount: 1250000, category: 'committed', reason: 'ลูกค้าเลื่อน' },
        { opportunityId: 'OPP-002', reset: true },
      ],
      adjustments: [{ employeeId: 'E01', pipelineId: 'P1', delta: -50000, reason: 'ระวังไว้ก่อน' }],
    });
    expect(res.saved).toBe(3);
    expect(mock.summary({ periodId: P('2026-11'), pipelineId: 'all' }).totals).toMatchObject({ judgmentDelta: -1000000, managerDelta: 100000, final: 4180000 });
    expect(mock.history().items.slice(0, 3).map((h) => [h.type, h.label, h.oldValue, h.newValue, h.reason])).toEqual([
      ['adjustment', 'สมชาย ใจดี · พ.ย. 69 · ขายโครงการ', '±0', '−50,000', 'ระวังไว้ก่อน'],
      ['judgment', 'OPP-002', 'IN · 55% · 850,000 · Pipeline', 'IN · 40% · 700,000 · Pipeline (ค่าเดิม)', 'คืนค่าเดิม'],
      ['judgment', 'OPP-001', 'IN · 80% · 1,250,000 · Committed (ค่าเดิม)', 'OUT · 80% · 1,250,000 · Committed', 'ลูกค้าเลื่อน'],
    ]);

    const bad = (fn: () => unknown) => {
      try {
        fn();
      } catch (e) {
        return [(e as ForecastMockError).status, (e as Error).message];
      }
      return null;
    };
    expect(bad(() => mock.saveAdjustments({ periodId: P('2026-11'), judgments: [{ opportunityId: 'OPP-003', in: true, probability: 120, amount: 1, category: 'bestcase', reason: '' }], adjustments: [] }))).toEqual([
      422,
      'OPP-003: Probability ต้องอยู่ระหว่าง 0–100 · OPP-003: ต้องระบุเหตุผล',
    ]);
    expect(bad(() => mock.saveAdjustments({ periodId: P('2026-10'), judgments: [], adjustments: [] }))?.[0]).toBe(423); // closed period
    expect(bad(() => mock.saveAdjustments({ periodId: P('2027-01', 'C3'), judgments: [], adjustments: [] }))?.[0]).toBe(423); // not released
    mock.session = { company: 'SUN', role: 'sales' };
    expect(bad(() => mock.saveAdjustments({ periodId: P('2026-11'), judgments: [], adjustments: [] }))?.[0]).toBe(403);
  });

  it('EP-07 targets: null where an employee has no target of the pipeline; EP-05 writes them (null = delete)', () => {
    const q = { periodIds: [P('2026-11'), P('2026-12')], pipelineId: 'P1' };
    const t = mock.targets('C2', q);
    expect(t.rows.map((r) => [r.employeeId, r.teamId, r.cells[P('2026-11')], r.cells[P('2026-12')]])).toEqual([
      ['E01', 'A', 1008000, 1019000],
      ['E02', 'A', null, null], // วิภา sells retail only
      ['E03', 'B', 874000, 883000],
      ['E04', 'B', 1008000, 1019000],
    ]);
    expect(t.teamRows.map((r) => [r.teamId, r.cells[P('2026-11')]])).toEqual([
      ['A', { amount: null, sumOfMembers: 1008000 }],
      ['B', { amount: null, sumOfMembers: 1882000 }],
    ]);
    expect(t.pipelineSummary).toEqual([
      { pipelineId: 'P1', employeesWithTarget: 3 },
      { pipelineId: 'P2', employeesWithTarget: 4 },
    ]);
    expect(t.periods).toEqual([
      { periodId: P('2026-11'), status: 'open' },
      { periodId: P('2026-12'), status: 'open' },
    ]);

    const saved = mock.saveWorkspace('C2', {
      rowVersion: 1,
      targets: [
        { periodId: P('2026-11'), employeeId: 'E02', pipelineId: 'P1', amount: 500000 },
        { periodId: P('2026-12'), employeeId: 'E01', pipelineId: 'P1', amount: null },
      ],
      teamTargets: [{ periodId: P('2026-11'), pipelineId: 'P1', positionId: 'A', amount: 2000000 }],
    });
    expect([saved.saved, saved.config.versionNo, saved.config.rowVersion]).toEqual([3, 3, 2]); // targets alone make no new Version
    const after = mock.targets('C2', q);
    expect(after.rows[1].cells[P('2026-11')]).toBe(500000);
    expect(after.rows[0].cells[P('2026-12')]).toBeNull();
    expect(after.teamRows[0].cells[P('2026-11')]).toEqual({ amount: 2000000, sumOfMembers: 1508000 });
    expect(mock.history().items[0]).toMatchObject({ type: 'target', label: 'พ.ย. 69, ธ.ค. 69', newValue: 'บันทึก 3 ค่า', reason: 'FC-2026' });
    expect(() => mock.saveWorkspace('C2', { rowVersion: 2, targets: [{ periodId: P('2026-10'), employeeId: 'E01', pipelineId: 'P1', amount: 1 }] })).toThrowError(/งวดปิดแล้ว/);
    expect(() => mock.saveWorkspace('C2', { rowVersion: 2, targets: [{ periodId: P('2026-12'), employeeId: 'E01', pipelineId: 'P1', amount: -1 }] })).toThrowError(/0 ขึ้นไป/);
  });

  it('EP-05 configuration: a released Config gets a new Version, a Draft is saved over; guarded by rowVersion', () => {
    const r = mock.saveWorkspace('C2', { rowVersion: 1, config: { openFormula: 'full', allowManagerAdjustment: false } });
    expect([r.config.versionNo, r.config.openFormula, r.config.allowManagerAdjustment, r.config.rowVersion]).toEqual([4, 'full', false, 2]);
    expect(mock.config('C2', 'versions').versions?.at(-1)).toMatchObject({ versionNo: 4, changedFields: ['openFormula', 'allowManagerAdjustment'] });
    expect(mock.history().items[0]).toMatchObject({ type: 'config', label: 'FC-2026', oldValue: 'v3', newValue: 'v4', reason: 'แก้ไข: สูตร, Manager Adjustment' });
    // Full Amount: the seven open deals count in full (7,300,000) + the two closed ones (1,030,000)
    expect(mock.summary({ periodId: P('2026-11'), pipelineId: 'all' }).totals.base).toBe(8330000);

    const d = mock.saveWorkspace('C3', { rowVersion: 1, config: { name: 'แผน 2570' } });
    expect([d.config.versionNo, d.config.name]).toEqual([1, 'แผน 2570']);
    expect(mock.history().items[0]).toMatchObject({ oldValue: 'Draft', newValue: 'Draft', reason: 'แก้ไข: ชื่อ' });

    expect(() => mock.saveWorkspace('C2', { rowVersion: 1, config: { name: 'x' } })).toThrowError(/ถูกแก้ไขไปก่อน/);
    expect(() => mock.saveWorkspace('C3', { rowVersion: 2, config: { code: 'fc-2026' } })).toThrowError('รหัสนี้มีอยู่แล้ว');
    expect(() => mock.saveWorkspace('C1', { rowVersion: 1, config: { name: 'x' } })).toThrowError(/Block/);
    mock.session = { company: 'SUN', role: 'exec' };
    expect(() => mock.saveWorkspace('C3', { rowVersion: 2, config: { name: 'y' } })).toThrowError(/System Configurator/);
  });

  it('EP-04 create and copy: a Draft v1 with the 12 periods of the year, targets of the first save included', () => {
    const made = mock.createConfig({
      config: { code: 'FC-2028', name: 'Sales Forecast ปี 2028', fiscalYearId: 'FY2028', openFormula: 'full' },
      targets: [{ periodNo: 3, employeeId: 'E01', pipelineId: 'P1', amount: 700000 }],
    });
    expect(made.config).toMatchObject({ id: 'C7', code: 'FC-2028', year: 2028, status: 'draft', versionNo: 1, everReleased: false, openFormula: 'full', allowJudgment: true });
    expect(made.periods?.map((p) => p.periodNo)).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12]);
    expect(mock.targets('C7', { periodIds: ['C7-2028-03'], pipelineId: 'P1' }).rows[0].cells['C7-2028-03']).toBe(700000);
    expect(mock.history().items.slice(0, 2).map((h) => [h.type, h.label, h.newValue, h.reason])).toEqual([
      ['target', 'มี.ค. 71', 'บันทึก 1 ค่า', 'FC-2028'],
      ['config', 'FC-2028', 'สร้าง Draft', 'สร้างใหม่'],
    ]);

    const copy = mock.createConfig({ config: { code: 'FC-2029', name: 'Sales Forecast ปี 2029', year: 2029 }, copyFromId: 'C2' });
    expect(copy.config).toMatchObject({ code: 'FC-2029', year: 2029, status: 'draft', versionNo: 1, overdueRule: 'current' }); // values of FC-2026
    expect(mock.history().items[0].reason).toBe('คัดลอกจาก FC-2026');
    expect(() => mock.createConfig({ config: { code: ' ', name: 'x', year: 2030 } })).toThrowError(/รหัสและชื่อ/);
    expect(() => mock.createConfig({ config: { code: 'FC-2029', name: 'x', year: 2030 } })).toThrowError('รหัสนี้มีอยู่แล้ว');
  });

  it('EP-06 status: release / block / unblock / delete with the rules of the prototype', () => {
    expect(() => mock.configStatus('C2', { action: 'block', rowVersion: 1 })).toThrowError('ต้องระบุเหตุผล');
    expect(mock.configStatus('C2', { action: 'block', reason: 'ปิดปี', rowVersion: 1 }).config.status).toBe('block');
    expect(mock.history().items[0]).toMatchObject({ label: 'FC-2026', oldValue: 'Release', newValue: 'Block', reason: 'ปิดปี' });
    // the whole year is read only now
    expect(mock.opportunities({ periodId: P('2026-11') }).items.every((d) => !d.editable)).toBe(true);
    expect(mock.configStatus('C2', { action: 'unblock', rowVersion: 2 }).config.status).toBe('release');

    const rel = mock.configStatus('C3', { action: 'release', rowVersion: 1 }).config;
    expect([rel.status, rel.everReleased, rel.actions]).toEqual(['release', true, ['open', 'block', 'history', 'copy']]);
    expect(mock.config('C3', 'versions').versions).toHaveLength(1); // "Release ครั้งแรก"
    expect(() => mock.configStatus('C3', { action: 'delete', rowVersion: 2 })).toThrowError(/เฉพาะ Draft/);

    const second = mock.createConfig({ config: { code: 'FC-2027B', name: 'อีกชุด', year: 2027 } }).config;
    expect(() => mock.configStatus(second.id, { action: 'release', rowVersion: 1 })).toThrowError('ปี 2570 มี FC-2027 Release อยู่แล้ว · Block รายการนั้นก่อน');
    mock.configStatus(second.id, { action: 'delete', rowVersion: 1 });
    expect(mock.configs().items.map((c) => c.code)).not.toContain('FC-2027B');
    expect(mock.history().items[0]).toMatchObject({ label: 'FC-2027B', newValue: 'ลบ', reason: 'ลบ Draft ที่ไม่เคย Release' });
  });

  it('EP-11 / EP-12 periods: totals of the year, close keeps a snapshot, reopen only by the System Configurator', () => {
    const items = mock.periods('C2', true).items;
    expect(items).toHaveLength(12);
    expect(items[9]).toMatchObject({ periodId: 'C2-2026-10', periodNo: 10, start: '2026-10-01', end: '2026-10-31', status: 'closed', target: 6315000, finalNow: 5250000, snapshotFinal: 5250000, closedBy: 'System Configurator', closedAt: '2026-11-01T09:00:00', canClose: false, canReopen: true });
    expect(items[10]).toMatchObject({ status: 'open', target: 6384000, finalNow: 5417500, snapshotFinal: null, closedBy: null, canClose: true, canReopen: false });
    expect(mock.periods('C2').items[10].target).toBeUndefined();
    // FC-2027 is a Draft: nothing can be closed
    expect(mock.periods('C3', true).items.every((p) => !p.canClose && !p.canReopen)).toBe(true);

    expect(() => mock.periodStatus('C2-2026-11', { action: 'close', reason: ' ', rowVersion: 1 })).toThrowError('ต้องระบุเหตุผล');
    const closed = mock.periodStatus('C2-2026-11', { action: 'close', reason: 'ปิดงวดประจำเดือน', rowVersion: 1 }).period;
    expect(closed).toMatchObject({ status: 'closed', snapshotFinal: 5417500, closedBy: 'System Configurator', canReopen: true });
    expect(mock.history().items[0]).toMatchObject({ type: 'period', label: 'พ.ย. 69', oldValue: 'เปิดอยู่', newValue: 'ปิดแล้ว' });
    expect(() => mock.periodStatus('C2-2026-11', { action: 'close', reason: 'x', rowVersion: 1 })).toThrowError(/ปิดอยู่แล้ว/);

    mock.session = { company: 'SUN', role: 'exec' };
    expect(() => mock.periodStatus('C2-2026-11', { action: 'reopen', reason: 'x', rowVersion: 1 })).toThrowError(/System Configurator/);
    mock.session = { company: 'SUN', role: 'config' };
    expect(mock.periodStatus('C2-2026-11', { action: 'reopen', reason: 'แก้ตัวเลข', rowVersion: 1 }).period.status).toBe('open');
  });

  it('EP-13 dashboard: outlook, teams, pipeline health, bridge and scenario of the range', () => {
    const month = mock.dashboard({ level: 'month', year: 2026, month: 11, pipelineId: 'all' });
    expect(month.outlook).toEqual([
      { month: '2026-10', target: 6315000, final: 5250000, closed: 5250000, inRange: false },
      { month: '2026-11', target: 6384000, final: 5417500, closed: 1030000, inRange: true },
      { month: '2026-12', target: 6453000, final: 1470000, closed: 0, inRange: false },
    ]);
    expect(month.teams).toEqual([
      { team: 'A', name: 'Team A', target: 3248000, final: 3067500 },
      { team: 'B', name: 'Team B', target: 3136000, final: 2350000 },
    ]);
    expect(month.bridge).toEqual({ base: 5080000, judgment: 187500, manager: 150000, final: 5417500 });
    expect(month.scenario).toEqual({ min: 4080000, expected: 5417500, max: 5630000 });

    const year = mock.dashboard({ level: 'year', year: 2026, pipelineId: 'all' });
    expect(year.outlook).toHaveLength(12);
    expect(year.health.map((h) => [h.category, h.amount])).toEqual([
      ['committed', 3160000],
      ['bestcase', 1200000],
      ['pipeline', 1347500],
      ['closed', 54520000],
      ['omitted', 5900000],
    ]);
    expect(year.health.reduce((s, h) => s + h.share, 0)).toBeCloseTo(1);
    expect(year.bridge).toEqual({ base: 60040000, judgment: 187500, manager: 150000, final: 60377500 });

    const q4 = mock.dashboard({ level: 'quarter', year: 2026, quarter: 4, pipelineId: 'all', teamId: 'A' });
    expect(q4.outlook.map((o) => o.month)).toEqual(['2026-10', '2026-11', '2026-12']);
    expect(q4.teams).toEqual([{ team: 'A', name: 'Team A', target: 9744000, final: 6297500 }]);
  });

  it('EP-14 history: the four lines of the prototype, newest first, filtered by type', () => {
    const all = mock.history();
    expect(all.total).toBe(4);
    expect(all.items.map((h) => [h.at, h.actor, h.type, h.label, h.oldValue, h.newValue])).toEqual([
      ['2026-11-05T10:12:00', 'Sales Manager (Team B)', 'adjustment', 'พิมพ์ชนก แก้วใจ · พ.ย. 69', '±0', '+150,000'],
      ['2026-11-04T16:40:00', 'Sales Manager (Team A)', 'judgment', 'OPP-002', '40% · 700,000', '55% · 850,000'],
      ['2026-11-01T09:00:00', 'System Configurator', 'period', 'ต.ค. 69', 'เปิดอยู่', 'ปิดแล้ว'],
      ['2026-10-28T11:05:00', 'System Configurator', 'config', 'FC-2026', 'v2', 'v3'],
    ]);
    expect(mock.history({ type: 'adjustment' }).items.map((h) => h.label)).toEqual(['พิมพ์ชนก แก้วใจ · พ.ย. 69']);
    expect(mock.history({ type: 'target' }).items).toEqual([]);
  });

  it('answers are copies: changing one does not change the data', () => {
    const a = mock.configs().items[0];
    a.code = 'changed';
    expect(mock.configs().items[0].code).toBe('FC-2027');
  });
});

describe('ForecastMock — the lists of the prototype taken from the shared Datasource (ref.forecast.json)', () => {
  afterEach(() => resetMockupForTests());

  it('should show the pipelines, the teams and the step mapping of the document (the lists a module reads when it loads need a fresh load)', async () => {
    vi.resetModules();
    const datasource = await import('@core/mockup/mockup-datasource');
    datasource.setDatasource({
      'ref.forecast': {
        pipelines: [{ id: 'P1', name: 'ไลน์กลาง' }, { id: 'P2', name: 'ขายปลีก' }],
        teams: { A: { name: 'ทีมกลาง', mgr: 'หัวหน้ากลาง' }, B: { name: 'Team B', mgr: 'ผู้จัดการทีม B' } },
        stepMapping: [['เริ่มติดต่อ', 20, 'pipeline'], ['ประเมินความต้องการ', 40, 'pipeline'], ['ส่งข้อเสนอ', 60, 'bestcase'], ['เจรจาเสนอราคา', 90, 'committed'], ['ตกลงซื้อ', 100, 'closed'], ['ไม่สนใจ', 0, 'omitted']],
      },
    }, true);
    const fresh = await import('./forecast.mock');
    const lk = new fresh.ForecastMock().lookups();
    expect(lk.pipelines.map((p) => p.name)).toEqual(['ไลน์กลาง', 'ขายปลีก']);
    expect(lk.teams.map((t) => t.name)).toContain('ทีมกลาง');
    expect(lk.stepMapping[3]).toEqual({ step: 'เจรจาเสนอราคา', probability: 90, category: 'committed' });
  });

  it('should build the configs and the saved judgment from the document, and keep the figures the same for the company with the smaller ones', () => {
    setDatasource({
      'ref.forecast': {
        configs: [
          { code: 'FC-2025', name: 'ปี 2025', year: 2025, status: 'block', versionNo: 2, everReleased: true, updatedAt: '05/01/2026 10:00', updatedBy: 'ผู้ตั้งค่า', versions: [] },
          { code: 'FC-2026', name: 'ปี 2026 จากไฟล์กลาง', year: 2026, status: 'release', versionNo: 3, everReleased: true, updatedAt: '28/10/2026 11:05', updatedBy: 'ผู้ตั้งค่า', versions: [] },
        ],
      },
    }, true);
    const items = new ForecastMock().configs().items;
    expect(items.map((c) => c.code).sort()).toEqual(['FC-2025', 'FC-2026']);
    expect(items.find((c) => c.code === 'FC-2026')?.name).toBe('ปี 2026 จากไฟล์กลาง');
  });

  it('should show the people, the teams and the deals of a company of the Seed Workbook (made by applyWorkbookCast)', async () => {
    vi.resetModules();
    const { applyWorkbookCast, workbookCrmDoc, WORKBOOK_MASTER_DOC } = await import('@core/mockup/mockup-workbook');
    const entity = 'businessentity (code)';
    const all: Record<string, unknown> = {
      [WORKBOOK_MASTER_DOC]: {
        '11_employee': [{ code: 'A1-E1', name: 'สมศรี', [entity]: 'A1' }],
        '20_activitygroup': [{ code: 'A1-AG-X', name: 'กลุ่ม', [entity]: 'A1' }],
        '22_activity': [{ code: 'A1-AG-X-1', name: 'ติดต่อ', 'activitygroup (code)': 'A1-AG-X', [entity]: 'A1' }],
      },
      [workbookCrmDoc('A1')]: {
        company: 'A1',
        prospects: [{ code: 'PS-1', name: 'นันทิดา', lastname: 'บุญมา' }],
        leads: [],
        opportunities: [{ txNo: 'OP-1', createtime: '2026-04-21 09:30:00', opp_status: 'hot', prospect: 'PS-1', amount: 5_000_000, employee: 'A1-E1', currentStep: { activitygroup: 'A1-AG-X' } }],
      },
    };
    expect(applyWorkbookCast(all, 'A1')).toBeDefined();
    const datasource = await import('@core/mockup/mockup-datasource');
    datasource.setDatasource(all, true);
    const fresh = await import('./forecast.mock');
    const mock = new fresh.ForecastMock();
    expect(fresh.MOCK_COMPANIES.map(([code]) => code)).toContain('A1');
    mock.session.company = 'A1';
    const lk = mock.lookups();
    expect(lk.teams).toHaveLength(1);
    expect(lk.teams[0]?.employees.map((e) => e.name)).toEqual(['สมศรี']);
  });

  it('should keep the lists of the code when the document does not fit', () => {
    setDatasource({ 'ref.forecast': { pipelines: [{ id: 'P1' }], deals: [['OPP-1']] } }, true);
    const lk = new ForecastMock().lookups();
    expect(lk.pipelines.map((p) => p.name)).toEqual(['ขายโครงการ', 'ขายปลีก']);
  });
});
