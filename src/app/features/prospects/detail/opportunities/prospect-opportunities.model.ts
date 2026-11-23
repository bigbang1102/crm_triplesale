/**
 * The "โอกาสขาย" tab of the prospect detail page — framework-free (the spec loads it in Node).
 * The opportunities of one prospect have no API yet (E07 of prospect-endpoints-v2.html: GET /api/v1/prospects/{id}/opportunities); until it exists the tab shows
 * `mockProspectOpportunities()` in both modes. The shape below is what the screen needs, so the live adapter only has to fill it.
 */

/** `open` = still being worked · `won` = closed successfully · `lost` = closed without a sale */
export type OpportunityOutcome = 'open' | 'won' | 'lost';

export interface OpportunityPerson {
  name: string;
  /** '' = the default avatar */
  avatar: string;
}

export interface ProspectOpportunity {
  /** the id of the opportunity: the route of its page is `/crm/opportunities/:id` */
  id: string;
  /** the badge of the card: a key of INT_COLOR_MAP (WARM · SUCCESS · LOST …) */
  status: string;
  outcome: OpportunityOutcome;
  /** the activity group the opportunity is in, and its place among the `stageTotal` groups (the dot takes the colour of that place in the stepper palette) */
  stageName: string;
  stageIndex: number;
  stageTotal: number;
  /** the step inside the group ("ติดตามลูกค้าครั้งที่ 1") */
  stepName: string;
  customerName: string;
  customerAvatar: string;
  /** THB */
  amount: number;
  /** `yyyy-MM` of the expected close of an open opportunity ('' = none) */
  dueMonth: string;
  team: string;
  owner: string;
  /** the people on the card (`participantsTotal` counts all of them: the rest is shown as "+n") */
  participants: OpportunityPerson[];
  participantsTotal: number;
  /** the code of the opportunity ("LD:00-2026-0910-113448-2959") */
  code: string;
  /** `yyyy-MM-dd` of the last save */
  lastSavedAt: string;
  need: string;
  tags: string[];
}

export type OpportunityFilter = 'all' | OpportunityOutcome;

export interface OpportunityFilterCount {
  key: OpportunityFilter;
  count: number;
}

/** the pills of the tab, in order, with how many opportunities each holds */
export function filterCounts(items: readonly ProspectOpportunity[]): OpportunityFilterCount[] {
  return [
    { key: 'all', count: items.length },
    { key: 'open', count: items.filter((o) => o.outcome === 'open').length },
    { key: 'won', count: items.filter((o) => o.outcome === 'won').length },
    { key: 'lost', count: items.filter((o) => o.outcome === 'lost').length },
  ];
}

export function filterItems(items: readonly ProspectOpportunity[], filter: OpportunityFilter): ProspectOpportunity[] {
  return filter === 'all' ? [...items] : items.filter((o) => o.outcome === filter);
}

/** "ปิดสำเร็จทั้งหมด" (how many were won) and "มูลค่าเงินรวม" (the sum of what they were worth) */
export function wonSummary(items: readonly ProspectOpportunity[]): { count: number; amount: number } {
  const won = items.filter((o) => o.outcome === 'won');
  return { count: won.length, amount: won.reduce((sum, o) => sum + o.amount, 0) };
}

/** 500000 → "500,000" */
export function money(n: number): string {
  return Math.round(n).toLocaleString('en-US');
}

/** `yyyy-MM-dd` → `dd/MM/yyyy` ('-' when it is not a date) */
export function savedDate(iso: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso);
  return m ? `${m[3]}/${m[2]}/${m[1]}` : '-';
}

/** `yyyy-MM` → "ธันวาคม 2026" / "December 2026" (the Gregorian year, as the form shows dates) */
export function dueMonthLabel(yyyyMm: string, lang: 'th' | 'en'): string {
  const m = /^(\d{4})-(\d{2})$/.exec(yyyyMm);
  if (!m) return '';
  const d = new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, 1));
  return d.toLocaleDateString(lang === 'th' ? 'th-TH-u-ca-gregory' : 'en-US', { month: 'long', year: 'numeric', timeZone: 'UTC' });
}

/* ---------------------------------------------------------------------------------------------------- mock data */
const PEOPLE: OpportunityPerson[] = [
  { name: 'ชวัญจิรา', avatar: '' },
  { name: 'ธนวัฒน์', avatar: '' },
  { name: 'พิมพ์ลดา', avatar: '' },
];
const LONG_NEED = '(ความต้องการ)' + 'x'.repeat(120);

/** the three opportunities of the design (open · won · lost); the same for every prospect until the API exists */
export function mockProspectOpportunities(): ProspectOpportunity[] {
  return [
    {
      id: 'LD-2026-0910-113448-2959',
      status: 'WARM',
      outcome: 'open',
      stageName: 'Customer Service',
      stageIndex: 0,
      stageTotal: 2,
      stepName: 'ติดตามลูกค้าครั้งที่ 1',
      customerName: 'มัลลิกา จิตราพรชัยวัฒนา',
      customerAvatar: '',
      amount: 0,
      dueMonth: '2026-12',
      team: 'ทีม CS (ชวัญจิรา)',
      owner: 'CS0001 ชวัญจิรา',
      participants: PEOPLE.slice(0, 2),
      participantsTotal: 2,
      code: 'LD:00-2026-0910-113448-2959',
      lastSavedAt: '2026-11-09',
      need: '-',
      tags: ['VIP', 'Repeated Purchase'],
    },
    {
      id: 'LD-2025-0708-120021-2501',
      status: 'SUCCESS',
      outcome: 'won',
      stageName: 'Legal Service',
      stageIndex: 1,
      stageTotal: 2,
      stepName: 'ส่งมอบเอกสารสิทธิ์',
      customerName: 'มัลลิกา จิตราพรชัยวัฒนา',
      customerAvatar: '',
      amount: 500000,
      dueMonth: '',
      team: 'ทีม LE (ชวัญจิรา)',
      owner: 'LE0001 ชวัญจิรา',
      participants: PEOPLE,
      participantsTotal: 6,
      code: 'LD:00-2025-0708-120021-2501',
      lastSavedAt: '2025-11-08',
      need: LONG_NEED,
      tags: ['VIP'],
    },
    {
      id: 'LD-2025-0610-24032-1104',
      status: 'LOST',
      outcome: 'lost',
      stageName: 'Customer Service',
      stageIndex: 0,
      stageTotal: 2,
      stepName: 'ติดตามลูกค้าครั้งที่ 1',
      customerName: 'มัลลิกา จิตราพรชัยวัฒนา',
      customerAvatar: '',
      amount: 0,
      dueMonth: '',
      team: 'ทีม CS (ชวัญจิรา)',
      owner: 'CS0001 ชวัญจิรา',
      participants: PEOPLE,
      participantsTotal: 3,
      code: 'LD:00-2025-0610-24032-1104',
      lastSavedAt: '2025-07-12',
      need: LONG_NEED,
      tags: ['First Purchase'],
    },
  ];
}
