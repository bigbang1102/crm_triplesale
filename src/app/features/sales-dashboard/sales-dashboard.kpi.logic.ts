/**
 * The five "ตัวชี้วัดหลัก" cards of the dashboard, worked out from the leads of the company (the sample leads of `core/mock/crm-seed.ts`:
 * for a company of the Seed Workbook they are its opportunities). Framework-free so the spec runs in Node.
 *
 * Rules: a lead is "won" (SUCCESS) in the month of its last contact; "lost" likewise; a lead is "new" in the month it was created; the
 * open value of a month is the amount of the active leads created by the end of that month (the sample leads keep no history of the
 * stage they were in). "This month" is the month of `today`, "before" the month ahead of it; the bars are the last BAR_MONTHS months.
 */
export interface DashLead {
  createdDate: string;
  lastContactDate: string;
  status: 'ACTIVE' | 'SUCCESS' | 'LOST';
  amount: number;
  ownerCode: string;
  source: string;
}

export interface KpiCard {
  /** the label of the card, as the snapshot writes it (how the card is found) */
  label: string;
  value: string;
  now: string;
  before: string;
  /** `▼ 29.6%` / `▲ 2.7%` / `▼ 17.1 จุด`; empty when there is nothing to compare with */
  delta: string;
  good: boolean;
  /** bar heights in percent, oldest first */
  bars: number[];
}

export const KPI_LABELS = {
  sales: 'ยอดขายปิดได้',
  deals: 'ดีลที่ชนะ',
  winRate: 'Win Rate',
  open: 'มูลค่าดีลที่เปิดอยู่',
  leads: 'Lead ใหม่',
} as const;

export const BAR_MONTHS = 8;
const MIN_BAR_PERCENT = 6;
const MILLION = 1_000_000;

const monthOf = (date: string): string => date.slice(0, 7);

export function shiftMonth(month: string, by: number): string {
  const [y, m] = month.split('-').map(Number);
  const total = y * 12 + (m - 1) + by;
  return `${Math.floor(total / 12)}-${String((total % 12) + 1).padStart(2, '0')}`;
}

const money = (v: number): string => `฿${(v / MILLION).toFixed(2)}M`;
const count = (v: number, unit: string): string => `${v.toLocaleString('en-US')} ${unit}`;
const rate = (v: number): string => `${Number(v.toFixed(1))}%`;

function change(now: number, before: number): { delta: string; good: boolean } {
  if (before === 0) return { delta: '', good: true };
  const pct = ((now - before) / before) * 100;
  return { delta: `${pct < 0 ? '▼' : '▲'} ${Number(Math.abs(pct).toFixed(1))}%`, good: pct >= 0 };
}

function pointChange(now: number, before: number): { delta: string; good: boolean } {
  const diff = now - before;
  return { delta: `${diff < 0 ? '▼' : '▲'} ${Number(Math.abs(diff).toFixed(1))} จุด`, good: diff >= 0 };
}

function bars(series: number[]): number[] {
  const max = Math.max(...series, 0);
  return series.map((v) => (max > 0 ? Math.max(MIN_BAR_PERCENT, Math.round((v / max) * 1e4) / 100) : MIN_BAR_PERCENT));
}

const sum = (list: DashLead[], by: (l: DashLead) => number): number => list.reduce((s, l) => s + by(l), 0);

/** the five cards for the leads of `owner` (all when empty), as of `today` (`YYYY-MM-DD`) */
export function buildKpis(allLeads: readonly DashLead[], today: string, owner = ''): KpiCard[] {
  const leads = owner ? allLeads.filter((l) => l.ownerCode === owner) : [...allLeads];
  const current = monthOf(today);
  const yearStart = `${current.slice(0, 4)}-01`;
  const window = Array.from({ length: BAR_MONTHS }, (_, i) => shiftMonth(current, i - BAR_MONTHS + 1));
  const closedIn = (status: DashLead['status'], m: string): DashLead[] => leads.filter((l) => l.status === status && monthOf(l.lastContactDate) === m);
  const wonIn = (m: string): DashLead[] => closedIn('SUCCESS', m);
  const inYear = (date: string): boolean => monthOf(date) >= yearStart && monthOf(date) <= current;
  const rateIn = (won: number, lost: number): number => (won + lost > 0 ? (won / (won + lost)) * 100 : 0);
  const winRateOf = (m: string): number => rateIn(wonIn(m).length, closedIn('LOST', m).length);
  const openAt = (m: string): number => sum(leads.filter((l) => l.status === 'ACTIVE' && monthOf(l.createdDate) <= m), (l) => l.amount);
  const newIn = (m: string): number => leads.filter((l) => monthOf(l.createdDate) === m).length;
  const before = shiftMonth(current, -1);

  const wonYear = leads.filter((l) => l.status === 'SUCCESS' && inYear(l.lastContactDate));
  const lostYear = leads.filter((l) => l.status === 'LOST' && inYear(l.lastContactDate));
  const salesNow = sum(wonIn(current), (l) => l.amount);
  const salesBefore = sum(wonIn(before), (l) => l.amount);
  const dealsNow = wonIn(current).length;
  const dealsBefore = wonIn(before).length;
  const openNow = openAt(current);
  const openBefore = openAt(before);

  return [
    { label: KPI_LABELS.sales, value: money(sum(wonYear, (l) => l.amount)), now: money(salesNow), before: money(salesBefore), ...change(salesNow, salesBefore), bars: bars(window.map((m) => sum(wonIn(m), (l) => l.amount))) },
    { label: KPI_LABELS.deals, value: count(wonYear.length, 'ดีล'), now: count(dealsNow, 'ดีล'), before: count(dealsBefore, 'ดีล'), ...change(dealsNow, dealsBefore), bars: bars(window.map((m) => wonIn(m).length)) },
    { label: KPI_LABELS.winRate, value: rate(rateIn(wonYear.length, lostYear.length)), now: rate(winRateOf(current)), before: rate(winRateOf(before)), ...pointChange(winRateOf(current), winRateOf(before)), bars: bars(window.map(winRateOf)) },
    { label: KPI_LABELS.open, value: money(openNow), now: money(openNow), before: money(openBefore), ...change(openNow, openBefore), bars: bars(window.map(openAt)) },
    { label: KPI_LABELS.leads, value: count(leads.filter((l) => inYear(l.createdDate)).length, 'ราย'), now: count(newIn(current), 'ราย'), before: count(newIn(before), 'ราย'), ...change(newIn(current), newIn(before)), bars: bars(window.map(newIn)) },
  ];
}

/** writes the cards into the generated markup (found by the label of each card); returns how many it found */
export function applyKpis(root: ParentNode, cards: readonly KpiCard[]): number {
  let applied = 0;
  for (const card of cards) {
    const label = [...root.querySelectorAll('ts-db-kpi-card .ks-l')].find((el) => el.textContent?.trim() === card.label);
    const host = label?.closest('.ks-c');
    if (!host) continue;
    applied += 1;
    host.setAttribute('aria-label', `${card.label} ${card.value}`);
    const set = (selector: string, text: string): void => {
      const el = host.querySelector(selector);
      if (el) el.textContent = text;
    };
    set('.ks-v', card.value);
    const cmp = host.querySelector('.ks-cmp');
    const [nowBox, beforeBox] = [...(cmp?.children ?? [])];
    const nowValue = nowBox?.querySelector('b');
    if (nowValue) nowValue.textContent = card.now;
    const beforeValue = beforeBox?.querySelector('b');
    if (beforeValue) beforeValue.textContent = card.before;
    const mark = nowBox?.querySelector('i');
    if (mark) {
      mark.textContent = card.delta;
      mark.className = card.good ? 'good' : 'bad';
    }
    [...host.querySelectorAll<HTMLElement>('.ks-bars .ks-b')].forEach((bar, i) => {
      const height = card.bars[i];
      if (height !== undefined) bar.style.height = `${height}%`;
    });
  }
  return applied;
}
