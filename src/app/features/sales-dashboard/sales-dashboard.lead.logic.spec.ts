import { describe, expect, it } from 'vitest';
import type { DashLead } from './sales-dashboard.kpi.logic';
import { buildDaily, buildLeadCards, buildSources } from './sales-dashboard.lead.logic';

const lead = (o: Partial<DashLead>): DashLead => ({ createdDate: '2026-10-05', lastContactDate: '2026-10-05', status: 'ACTIVE', amount: 1_000_000, ownerCode: 'E1', source: 'Walk-in', ...o });
const TODAY = '2026-10-20';
const leads: DashLead[] = [
  lead({ createdDate: '2026-10-02', lastContactDate: '2026-10-09' }),
  lead({ createdDate: '2026-10-05', status: 'SUCCESS', amount: 3_000_000, source: 'LINE OA', lastContactDate: '2026-10-12' }),
  lead({ createdDate: '2026-10-19', source: 'LINE OA' }),
  lead({ createdDate: '2026-10-10' }),
  lead({ createdDate: '2026-09-03', lastContactDate: '2026-09-03', source: 'LINE OA' }),
  lead({ createdDate: '2026-09-20', status: 'SUCCESS', amount: 2_000_000, lastContactDate: '2026-09-25' }),
  lead({ createdDate: '2025-12-31' }),
];
const cards = buildLeadCards(leads, TODAY);
const card = (label: string) => cards.find((c) => c.label === label)!;

describe('dashboard lead tab', () => {
  it('should count the new leads of the month against the month before, with the sources of the month', () => {
    const c = card('Lead ใหม่');
    expect(c.value).toBe('4 ราย');
    expect(c.delta).toBe('▲ 100%');
    expect(c.note).toBe('มากกว่าเดือนก่อน 2 ราย');
    expect(c.side).toEqual(['2 ช่องทาง', 'ติดต่อแล้ว 2']);
  });

  it('should count the leads not contacted and how long they have waited, a rise being the bad direction', () => {
    const c = card('ยังไม่ได้ติดต่อ');
    expect(c.value).toBe('2 ราย');
    expect(c.delta).toBe('▲ 100%');
    expect(c.good).toBe(false);
    expect(c.side).toEqual(['เกิน 24 ชม. 2', 'เกิน 7 วัน 1']);
  });

  it('should give the conversion in points and the sales of the sold leads of the month', () => {
    const rate = card('อัตราแปลง Lead → ขายได้');
    expect(rate.value).toBe('25%');
    expect(rate.delta).toBe('▼ 25 จุด');
    expect(rate.note).toBe('ขายได้ 1 จาก Lead 4 ราย');
    const sales = card('ยอดขายจาก Lead เดือนนี้');
    expect(sales.value).toBe('฿3.00M');
    expect(sales.delta).toBe('▲ 50%');
  });

  it('should rank the sources of the year, biggest first, with the sold ones, and fold the rest after six', () => {
    expect(buildSources(leads, TODAY)).toEqual([
      { name: 'LINE OA', leads: 3, sold: 1 },
      { name: 'Walk-in', leads: 3, sold: 1 },
    ]);
    const many = Array.from({ length: 8 }, (_, i) => lead({ source: `S${i}` }));
    const rows = buildSources(many, TODAY);
    expect(rows).toHaveLength(6);
    expect(rows[5]).toEqual({ name: 'อื่น ๆ', leads: 3, sold: 0 });
  });

  it('should accumulate the leads created by each day of this month and the same days of the month before', () => {
    const d = buildDaily(leads, TODAY);
    expect(d.days).toBe(20);
    expect(d.now[0]).toBe(0);
    expect(d.now[1]).toBe(1);
    expect(d.now[19]).toBe(4);
    expect(d.before[19]).toBe(2);
    expect(d.before[2]).toBe(1);
  });

  it('should give empty figures, not a crash, for no leads', () => {
    expect(buildLeadCards([], TODAY).map((c) => c.value)).toEqual(['0 ราย', '0 ราย', '0%', '฿0.00M']);
    expect(buildSources([], TODAY)).toEqual([]);
    expect(buildDaily([], TODAY).now.every((n) => n === 0)).toBe(true);
  });
});
