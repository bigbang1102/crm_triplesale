import { describe, expect, it } from 'vitest';
import { type DashLead, KPI_LABELS, applyKpis, buildKpis, shiftMonth } from './sales-dashboard.kpi.logic';

const lead = (o: Partial<DashLead>): DashLead => ({ createdDate: '2026-03-01', lastContactDate: '2026-03-01', status: 'ACTIVE', amount: 1_000_000, ownerCode: 'E1', source: 'Walk-in', ...o });
const TODAY = '2026-10-20';
const leads: DashLead[] = [
  lead({ status: 'SUCCESS', amount: 4_000_000, lastContactDate: '2026-10-05' }),
  lead({ status: 'SUCCESS', amount: 2_000_000, lastContactDate: '2026-09-05', ownerCode: 'E2' }),
  lead({ status: 'SUCCESS', amount: 1_000_000, lastContactDate: '2026-09-15' }),
  lead({ status: 'LOST', lastContactDate: '2026-10-10' }),
  lead({ status: 'ACTIVE', amount: 3_000_000, createdDate: '2026-10-02' }),
  lead({ status: 'ACTIVE', amount: 500_000, createdDate: '2025-12-30' }),
];
const byLabel = (label: string) => buildKpis(leads, TODAY).find((c) => c.label === label)!;

describe('dashboard key figures', () => {
  it('should add the closed sales of the year and compare this month with the one before', () => {
    const c = byLabel(KPI_LABELS.sales);
    expect(c.value).toBe('฿7.00M');
    expect(c.now).toBe('฿4.00M');
    expect(c.before).toBe('฿3.00M');
    expect(c.delta).toBe('▲ 33.3%');
    expect(c.good).toBe(true);
  });

  it('should count the won deals and give the win rate in points', () => {
    expect(byLabel(KPI_LABELS.deals).value).toBe('3 ดีล');
    const w = byLabel(KPI_LABELS.winRate);
    expect(w.value).toBe('75%');
    expect(w.now).toBe('50%');
    expect(w.before).toBe('100%');
    expect(w.delta).toBe('▼ 50 จุด');
    expect(w.good).toBe(false);
  });

  it('should take the open value as the active leads created so far, and count the new leads of the year', () => {
    expect(byLabel(KPI_LABELS.open).value).toBe('฿3.50M');
    expect(byLabel(KPI_LABELS.leads).value).toBe('5 ราย');
  });

  it('should give 8 bars, the tallest 100% and the empty ones the minimum', () => {
    const bars = byLabel(KPI_LABELS.sales).bars;
    expect(bars).toHaveLength(8);
    expect(Math.max(...bars)).toBe(100);
    expect(bars[0]).toBe(6);
  });

  it('should narrow to one salesperson, and show nothing to compare when the month before is empty', () => {
    const only = buildKpis(leads, TODAY, 'E2').find((c) => c.label === KPI_LABELS.sales)!;
    expect(only.value).toBe('฿2.00M');
    expect(only.delta).toBe('▼ 100%');
    expect(buildKpis([leads[0]], TODAY)[0]?.delta).toBe('');
    expect(buildKpis([], TODAY).every((c) => c.bars.every((b) => b === 6))).toBe(true);
  });

  it('should move a month across a year', () => {
    expect(shiftMonth('2026-01', -1)).toBe('2025-12');
    expect(shiftMonth('2026-10', -9)).toBe('2026-01');
  });

  it('should write the cards into the generated markup and report how many it found', () => {
    const root = document.createElement('div');
    root.innerHTML =
      '<ts-db-kpi-card><button class="ks-c" aria-label="x"><span class="ks-l">ยอดขายปิดได้</span><span class="ks-v">old</span><span class="ks-bars"><span class="ks-b"></span></span><span class="ks-cmp"><span>เดือนนี้ <b>a</b><i class="bad">x</i></span><span>เดือนก่อน <b>b</b></span></span></button></ts-db-kpi-card>';
    expect(applyKpis(root, buildKpis(leads, TODAY))).toBe(1);
    expect(root.querySelector('.ks-v')?.textContent).toBe('฿7.00M');
    expect(root.querySelector('.ks-cmp i')?.className).toBe('good');
    expect(root.querySelector('.ks-cmp span:last-child b')?.textContent).toBe('฿3.00M');
    expect(root.querySelector('.ks-c')?.getAttribute('aria-label')).toBe('ยอดขายปิดได้ ฿7.00M');
  });
});
