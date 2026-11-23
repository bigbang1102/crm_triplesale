import { describe, expect, it } from 'vitest';
import { type PipeGroup, type PipeLead, PIPE_LABELS, buildPipeline } from './sales-dashboard.pipeline.logic';

const TODAY = '2026-10-20';
const groups: PipeGroup[] = [
  { code: 'CS', name: 'ฝ่ายบริการ' },
  { code: 'AN', name: 'วิเคราะห์' },
  { code: 'LS', name: 'สินเชื่อ' },
];
let seq = 0;
const lead = (o: Partial<PipeLead>): PipeLead => ({
  id: ++seq,
  customerName: `ลูกค้า ${seq}`,
  ownerName: 'พนักงาน',
  groupIdx: 0,
  createdDate: '2026-08-01',
  lastContactDate: '2026-10-18',
  status: 'ACTIVE',
  amount: 1_000_000,
  ownerCode: 'E1',
  source: 'Walk-in',
  ...o,
});
const leads: PipeLead[] = [
  lead({ amount: 5_000_000, groupIdx: 1, lastContactDate: '2026-09-01' }),
  lead({ amount: 3_000_000, groupIdx: 2, lastContactDate: '2026-10-01' }),
  lead({ amount: 2_000_000, groupIdx: 0 }),
  lead({ amount: 4_000_000, status: 'SUCCESS', lastContactDate: '2026-10-10', groupIdx: 2 }),
  lead({ amount: 2_000_000, status: 'SUCCESS', lastContactDate: '2026-09-10', groupIdx: 1 }),
  lead({ amount: 9_000_000, createdDate: '2026-10-15', groupIdx: 0 }),
];
const fig = buildPipeline(leads, groups, TODAY);
const card = (label: string) => fig.cards.find((c) => c.label === label)!;

describe('dashboard pipeline tab', () => {
  it('should give the open value and count with the change from the month before', () => {
    expect(card(PIPE_LABELS.open).value).toBe('฿19.00M');
    expect(card(PIPE_LABELS.open).delta).toBe('▲ 90% จากเดือนก่อน');
    expect(card(PIPE_LABELS.count).value).toBe('4 ดีล');
    expect(card(PIPE_LABELS.count).delta).toBe('▲ 33.3% จากเดือนก่อน');
  });

  it('should give the sales and the average of the won deals of the month, a fall being bad', () => {
    expect(card(PIPE_LABELS.closed).value).toBe('฿4.00M');
    expect(card(PIPE_LABELS.closed).delta).toBe('▲ 100% จากเดือนก่อน');
    expect(card(PIPE_LABELS.average).value).toBe('฿4.00M');
  });

  it('should count the deals idle for 14 days, a rise being the bad direction', () => {
    const stuck = card(PIPE_LABELS.stuck);
    expect(stuck.value).toBe('2 ดีล');
    expect(stuck.good).toBe(false);
    expect(fig.stuck.count).toBe(2);
    expect(fig.stuck.total).toBe('฿8.00M');
    expect(fig.stuck.rows.map((r) => r.days)).toEqual([49, 19]);
  });

  it('should split the open value by group, with the longest bar at 100', () => {
    expect(fig.groups.map((g) => g.label)).toEqual(['CS ฝ่ายบริการ', 'AN วิเคราะห์', 'LS สินเชื่อ']);
    expect(fig.groups[0]?.value).toBe('฿11.00M · 2');
    expect(fig.groups[0]?.share).toBe(100);
    expect(fig.groups[1]?.share).toBeCloseTo(45.45, 1);
  });

  it('should rank the biggest open deals with their age, and size the bars to the first', () => {
    expect(fig.top.map((r) => r.amount)).toEqual([9_000_000, 5_000_000, 3_000_000, 2_000_000]);
    expect(fig.top[0]?.days).toBe(5);
    expect(fig.top[0]?.share).toBe(100);
    expect(fig.top[1]?.groupCode).toBe('AN');
  });

  it('should give the pass rate of each group, a sold lead having passed every one', () => {
    expect(fig.funnel.map((f) => f.label)).toEqual(['เข้ากลุ่ม CS', 'ผ่านไป AN', 'ผ่านไป LS']);
    expect(fig.funnel[0]?.value).toBe('100% · 6');
    expect(fig.funnel[1]?.value).toBe('66.7% · 4');
    expect(fig.funnel[2]?.value).toBe('50% · 3');
  });

  it('should spread the open deals over the next five months, the first month marked', () => {
    expect(fig.expected.map((m) => m.label)).toEqual(['ต.ค.', 'พ.ย.', 'ธ.ค.', 'ม.ค.', 'ก.พ.']);
    expect(fig.expected.reduce((s, m) => s + Number(m.value), 0)).toBeCloseTo(19, 5);
    expect(Math.max(...fig.expected.map((m) => m.share))).toBe(100);
  });

  it('should list the deals with no contact for 30 days apart from the ones that are only stuck', () => {
    expect(fig.neglected.count).toBe(1);
    expect(fig.neglected.rows[0]?.days).toBe(49);
  });

  it('should give empty figures, not a crash, for no leads', () => {
    const empty = buildPipeline([], groups, TODAY);
    expect(empty.cards.map((c) => c.value)).toEqual(['฿0.00M', '0 ดีล', '฿0.00M', '฿0.00M', '0 ดีล']);
    expect(empty.cards[0]?.delta).toBe('—');
    expect(empty.top).toEqual([]);
    expect(empty.funnel[0]?.value).toBe('0% · 0');
  });
});
