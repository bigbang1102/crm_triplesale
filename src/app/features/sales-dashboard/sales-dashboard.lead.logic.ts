/**
 * The "Lead & การตลาด" tab of the dashboard, worked out from the leads of the company (sample leads of `core/mock/crm-seed.ts`) and written into
 * the generated markup (the snapshot's numbers are static). Framework-free so the spec runs in Node.
 *
 * Rules: "this month" is the month of `today`, "before" the month ahead of it; a lead is NEW in the month it was created; it is NOT CONTACTED
 * while it is active and its last contact is still the day it was created; it is SOLD when its status is SUCCESS. The sources and the
 * conversion are of the year to date. The daily line counts the leads created up to each day, this month against the same days of the month before.
 */
import { type DashLead, shiftMonth } from './sales-dashboard.kpi.logic';

export interface LeadCard {
  label: string;
  value: string;
  /** `▼ 55.6%` / `▲ 4.6 จุด`; empty when there is nothing to compare with */
  delta: string;
  good: boolean;
  note: string;
  side: [string, string];
}

export interface SourceRow {
  name: string;
  leads: number;
  sold: number;
}

export interface DailyLine {
  days: number;
  now: number[];
  before: number[];
}

const OTHER_SOURCES = 'อื่น ๆ';
const MAX_SOURCES = 6;
const OVER_DAY_LIMIT = 7;
const MILLION = 1_000_000;
const MS_PER_DAY = 86_400_000;

const monthOf = (date: string): string => date.slice(0, 7);
const dayOf = (date: string): number => Number(date.slice(8, 10));
const dayNumber = (date: string): number => Math.floor(Date.UTC(+date.slice(0, 4), +date.slice(5, 7) - 1, +date.slice(8, 10)) / MS_PER_DAY);
const money = (v: number): string => `฿${(v / MILLION).toFixed(2)}M`;
const trim1 = (n: number): number => Number(n.toFixed(1));

function change(now: number, before: number, lowerIsBetter = false): Pick<LeadCard, 'delta' | 'good'> {
  if (before === 0) return { delta: '', good: true };
  const pct = ((now - before) / before) * 100;
  return { delta: `${pct < 0 ? '▼' : '▲'} ${trim1(Math.abs(pct))}%`, good: lowerIsBetter ? pct <= 0 : pct >= 0 };
}

function pointChange(now: number, before: number): Pick<LeadCard, 'delta' | 'good'> {
  const diff = now - before;
  return { delta: `${diff < 0 ? '▼' : '▲'} ${trim1(Math.abs(diff))} จุด`, good: diff >= 0 };
}

const rateOf = (part: number, whole: number): number => (whole > 0 ? (part / whole) * 100 : 0);
const sumAmount = (list: readonly DashLead[]): number => list.reduce((s, l) => s + l.amount, 0);
const isUncontacted = (l: DashLead): boolean => l.status === 'ACTIVE' && l.lastContactDate <= l.createdDate;

/** the four cards of "ตัวเลข Lead เดือนนี้" */
export function buildLeadCards(leads: readonly DashLead[], today: string): LeadCard[] {
  const current = monthOf(today);
  const before = shiftMonth(current, -1);
  const created = (m: string): DashLead[] => leads.filter((l) => monthOf(l.createdDate) === m);
  const now = created(current);
  const prev = created(before);
  const sold = (list: readonly DashLead[]): DashLead[] => list.filter((l) => l.status === 'SUCCESS');
  const uncontacted = (list: readonly DashLead[]): DashLead[] => list.filter(isUncontacted);
  const nowSold = sold(now);
  const rateNow = rateOf(nowSold.length, now.length);
  const ratePrev = rateOf(sold(prev).length, prev.length);
  const unNow = uncontacted(now);
  const ageDays = (l: DashLead): number => dayNumber(today) - dayNumber(l.createdDate);
  const gap = now.length - prev.length;
  const salesNow = sumAmount(nowSold);
  const salesPrev = sumAmount(sold(prev));
  const sources = new Set(now.map((l) => l.source)).size;
  return [
    {
      label: 'Lead ใหม่',
      value: `${now.length.toLocaleString('en-US')} ราย`,
      ...change(now.length, prev.length),
      note: gap === 0 ? `เท่ากับเดือนก่อน ${prev.length} ราย` : `${gap < 0 ? 'น้อย' : 'มาก'}กว่าเดือนก่อน ${Math.abs(gap)} ราย`,
      side: [`${sources} ช่องทาง`, `ติดต่อแล้ว ${now.length - unNow.length}`],
    },
    {
      label: 'ยังไม่ได้ติดต่อ',
      value: `${unNow.length} ราย`,
      ...change(unNow.length, uncontacted(prev).length, true),
      note: `จาก Lead เดือนนี้ ${now.length} ราย`,
      side: [`เกิน 24 ชม. ${unNow.filter((l) => ageDays(l) >= 1).length}`, `เกิน ${OVER_DAY_LIMIT} วัน ${unNow.filter((l) => ageDays(l) >= OVER_DAY_LIMIT).length}`],
    },
    {
      label: 'อัตราแปลง Lead → ขายได้',
      value: `${trim1(rateNow)}%`,
      ...pointChange(rateNow, ratePrev),
      note: `ขายได้ ${nowSold.length} จาก Lead ${now.length} ราย`,
      side: [`ขายได้ ${nowSold.length}`, `Lead ${now.length}`],
    },
    {
      label: 'ยอดขายจาก Lead เดือนนี้',
      value: money(salesNow),
      ...change(salesNow, salesPrev),
      note: `จากดีลที่ขายได้ ${nowSold.length} ดีล`,
      side: [`ขายได้ ${nowSold.length}`, `Lead ${now.length}`],
    },
  ];
}

/** the leads and the sold ones of each source in the year to `today`, the biggest first; the rest is one row (so the chart keeps its width) */
export function buildSources(leads: readonly DashLead[], today: string): SourceRow[] {
  const yearStart = `${today.slice(0, 4)}-01`;
  const rows = new Map<string, SourceRow>();
  for (const l of leads) {
    if (monthOf(l.createdDate) < yearStart || monthOf(l.createdDate) > monthOf(today)) continue;
    const row = rows.get(l.source) ?? { name: l.source, leads: 0, sold: 0 };
    row.leads += 1;
    if (l.status === 'SUCCESS') row.sold += 1;
    rows.set(l.source, row);
  }
  const sorted = [...rows.values()].sort((a, b) => b.leads - a.leads || a.name.localeCompare(b.name));
  if (sorted.length <= MAX_SOURCES) return sorted;
  const rest = sorted.slice(MAX_SOURCES - 1);
  return [...sorted.slice(0, MAX_SOURCES - 1), { name: OTHER_SOURCES, leads: rest.reduce((s, r) => s + r.leads, 0), sold: rest.reduce((s, r) => s + r.sold, 0) }];
}

/** cumulative leads created by each day of this month and of the month before (same days) */
export function buildDaily(leads: readonly DashLead[], today: string): DailyLine {
  const current = monthOf(today);
  const before = shiftMonth(current, -1);
  const days = dayOf(today);
  const cumulative = (m: string): number[] => {
    const perDay = Array.from({ length: days }, () => 0);
    for (const l of leads) {
      const d = dayOf(l.createdDate);
      if (monthOf(l.createdDate) === m && d <= days) perDay[d - 1] += 1;
    }
    return perDay.map((_, i) => perDay.slice(0, i + 1).reduce((s, n) => s + n, 0));
  };
  return { days, now: cumulative(current), before: cumulative(before) };
}
