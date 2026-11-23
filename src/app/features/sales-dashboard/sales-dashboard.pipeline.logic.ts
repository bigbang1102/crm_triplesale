/**
 * The "Pipeline & ยอดขาย" tab of the dashboard, worked out from the leads of the company (sample leads of `core/mock/crm-seed.ts`) and written into
 * the generated markup (see `sales-dashboard.pipeline.dom.ts`). Framework-free so the spec runs in Node.
 *
 * The sample leads keep no history of the stage they are in, so some figures stand in for what the real service will know:
 *  - "days in the stage" and "days without contact" are both the days since the last contact (stuck = 14 days or more, neglected = 30 or more);
 *  - the expected close month of an open deal is spread over the next five months by the number of the lead;
 *  - the pass rate of a group is the share of the leads of the year that are in that group or beyond it (a sold lead has passed every group).
 */
import { type DashLead, shiftMonth } from './sales-dashboard.kpi.logic';

export interface PipeLead extends DashLead {
  id: number;
  customerName: string;
  ownerName: string;
  /** index of the group the lead is in now */
  groupIdx: number;
}

export interface PipeGroup {
  code: string;
  name: string;
}

export interface PipeCard {
  label: string;
  value: string;
  /** `▲ 2.7% จากเดือนก่อน`; `—` when there is nothing to compare with */
  delta: string;
  good: boolean;
}

export interface GroupBar {
  label: string;
  value: string;
  /** 0..100 */
  share: number;
}

export interface DealRow {
  customer: string;
  groupIdx: number;
  groupCode: string;
  owner: string;
  amount: number;
  /** days: the age of the deal in the top table, the days waiting in the lists */
  days: number;
  /** 0..100 of the biggest amount (top table) */
  share: number;
}

export interface WaitingList {
  count: number;
  total: string;
  rows: DealRow[];
}

export interface FunnelRow {
  label: string;
  value: string;
  share: number;
}

export interface MonthBar {
  label: string;
  value: string;
  share: number;
}

export interface PipelineFigures {
  cards: PipeCard[];
  groups: GroupBar[];
  top: DealRow[];
  stuck: WaitingList;
  funnel: FunnelRow[];
  expected: MonthBar[];
  neglected: WaitingList;
}

export const PIPE_LABELS = {
  open: 'มูลค่าดีลที่เปิดอยู่',
  count: 'ดีลที่เปิดอยู่',
  closed: 'ยอดปิดได้เดือนนี้',
  average: 'มูลค่าเฉลี่ยดีลที่ชนะ',
  stuck: 'ดีลค้างเกิน 14 วัน',
} as const;

export const STUCK_DAYS = 14;
export const NEGLECTED_DAYS = 30;
export const EXPECTED_MONTHS = 5;
const TOP_DEALS = 5;
const LIST_ROWS = 50;
const MILLION = 1_000_000;
const MS_PER_DAY = 86_400_000;
const THAI_MONTHS_ABBREVIATED = ['ม.ค.', 'ก.พ.', 'มี.ค.', 'เม.ย.', 'พ.ค.', 'มิ.ย.', 'ก.ค.', 'ส.ค.', 'ก.ย.', 'ต.ค.', 'พ.ย.', 'ธ.ค.'];

const monthOf = (date: string): string => date.slice(0, 7);
const dayNumber = (date: string): number => Math.floor(Date.UTC(+date.slice(0, 4), +date.slice(5, 7) - 1, +date.slice(8, 10)) / MS_PER_DAY);
const dateOf = (n: number): string => new Date(n * MS_PER_DAY).toISOString().slice(0, 10);
const money = (v: number): string => `฿${(v / MILLION).toFixed(2)}M`;
const trim1 = (n: number): number => Number(n.toFixed(1));
const sum = (list: readonly PipeLead[]): number => list.reduce((s, l) => s + l.amount, 0);
const lastDayOf = (month: string): string => dateOf(dayNumber(`${shiftMonth(month, 1)}-01`) - 1);

function trend(now: number, before: number, lowerIsBetter = false): Pick<PipeCard, 'delta' | 'good'> {
  if (before === 0) return { delta: '—', good: true };
  const pct = ((now - before) / before) * 100;
  return { delta: `${pct < 0 ? '▼' : '▲'} ${trim1(Math.abs(pct))}% จากเดือนก่อน`, good: lowerIsBetter ? pct <= 0 : pct >= 0 };
}

const share = (value: number, max: number): number => (max > 0 ? Math.round((value / max) * 1e4) / 100 : 0);

export function buildPipeline(allLeads: readonly PipeLead[], groups: readonly PipeGroup[], today: string): PipelineFigures {
  const current = monthOf(today);
  const before = shiftMonth(current, -1);
  const codeOf = (idx: number): string => groups[idx]?.code ?? '';
  const openLeads = allLeads.filter((l) => l.status === 'ACTIVE');
  const openAt = (m: string): PipeLead[] => openLeads.filter((l) => monthOf(l.createdDate) <= m);
  const wonIn = (m: string): PipeLead[] => allLeads.filter((l) => l.status === 'SUCCESS' && monthOf(l.lastContactDate) === m);
  const idleDays = (l: PipeLead, ref: string): number => dayNumber(ref) - dayNumber(l.lastContactDate);
  const staleAt = (ref: string, days: number): PipeLead[] => openLeads.filter((l) => l.createdDate <= ref && l.lastContactDate <= ref && idleDays(l, ref) >= days);
  const average = (list: readonly PipeLead[]): number => (list.length ? sum(list) / list.length : 0);
  const openNow = openAt(current);
  const openPrev = openAt(before);

  const cards: PipeCard[] = [
    { label: PIPE_LABELS.open, value: money(sum(openNow)), ...trend(sum(openNow), sum(openPrev)) },
    { label: PIPE_LABELS.count, value: `${openNow.length.toLocaleString('en-US')} ดีล`, ...trend(openNow.length, openPrev.length) },
    { label: PIPE_LABELS.closed, value: money(sum(wonIn(current))), ...trend(sum(wonIn(current)), sum(wonIn(before))) },
    { label: PIPE_LABELS.average, value: money(average(wonIn(current))), ...trend(average(wonIn(current)), average(wonIn(before))) },
    { label: PIPE_LABELS.stuck, value: `${staleAt(today, STUCK_DAYS).length} ดีล`, ...trend(staleAt(today, STUCK_DAYS).length, staleAt(lastDayOf(before), STUCK_DAYS).length, true) },
  ];

  const perGroup = groups.map((g, idx) => {
    const inGroup = openNow.filter((l) => l.groupIdx === idx);
    return { label: `${g.code} ${g.name}`, amount: sum(inGroup), count: inGroup.length };
  });
  const maxGroup = Math.max(...perGroup.map((g) => g.amount), 0);
  const groupBars: GroupBar[] = perGroup.map((g) => ({ label: g.label, value: `${money(g.amount)} · ${g.count}`, share: share(g.amount, maxGroup) }));

  const toRow = (l: PipeLead, days: number, maxAmount: number): DealRow => ({
    customer: l.customerName,
    groupIdx: l.groupIdx,
    groupCode: codeOf(l.groupIdx),
    owner: l.ownerName,
    amount: l.amount,
    days,
    share: share(l.amount, maxAmount),
  });
  const biggest = [...openNow].sort((a, b) => b.amount - a.amount || a.createdDate.localeCompare(b.createdDate) || a.id - b.id).slice(0, TOP_DEALS);
  const top = biggest.map((l) => toRow(l, dayNumber(today) - dayNumber(l.createdDate), biggest[0]?.amount ?? 0));
  const waiting = (days: number): WaitingList => {
    const found = staleAt(today, days).sort((a, b) => idleDays(b, today) - idleDays(a, today) || a.id - b.id);
    return { count: found.length, total: money(sum(found)), rows: found.slice(0, LIST_ROWS).map((l) => toRow(l, idleDays(l, today), 0)) };
  };

  const yearStart = `${current.slice(0, 4)}-01`;
  const ofYear = allLeads.filter((l) => monthOf(l.createdDate) >= yearStart && monthOf(l.createdDate) <= current);
  const reached = groups.map((_g, idx) => ofYear.filter((l) => l.status === 'SUCCESS' || l.groupIdx >= idx).length);
  const funnel: FunnelRow[] = groups.map((g, idx) => {
    const rate = reached[0] > 0 ? (reached[idx] / reached[0]) * 100 : 0;
    return { label: `${idx === 0 ? 'เข้ากลุ่ม' : 'ผ่านไป'} ${g.code}`, value: `${trim1(rate)}% · ${reached[idx]}`, share: share(rate, 100) };
  });

  const byMonth = Array.from({ length: EXPECTED_MONTHS }, () => 0);
  for (const l of openNow) byMonth[l.id % EXPECTED_MONTHS] += l.amount;
  const maxMonth = Math.max(...byMonth, 0);
  const expected: MonthBar[] = byMonth.map((amount, i) => ({
    label: THAI_MONTHS_ABBREVIATED[Number(shiftMonth(current, i).slice(5, 7)) - 1],
    value: (amount / MILLION).toFixed(2),
    share: share(amount, maxMonth),
  }));

  return { cards, groups: groupBars, top, stuck: waiting(STUCK_DAYS), funnel, expected, neglected: waiting(NEGLECTED_DAYS) };
}
