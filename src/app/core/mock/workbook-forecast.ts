/**
 * The lists of the Forecast mock (`ref.forecast.json`) made from the opportunities of a company of the Seed Workbook: its deals (amount, owner,
 * category, month), its salespeople and teams, and a monthly target for each. The Forecast page has no Java page and no API yet, so the workbook is the
 * only real source of figures for a company other than the prototype's. Framework-free.
 */
import type { CastLeadRow, CastProspectRow } from './crm-seed';
import type { OrgDocument } from './org-seed';

type DealTuple = [string, string, string, string, number, number, string, string, string, string?];

export interface WorkbookForecast {
  companies: [string, string][];
  employees: { id: string; name: string; team: string }[];
  teams: Record<string, { name: string; mgr: string }>;
  deals: DealTuple[];
  monthlyTargets: Record<string, number>;
}

const FIRST_MONTH = '2026-01';
const LAST_MONTH = '2027-12';
const CURRENT_MONTH = '2026-11';
const MAX_DEALS = 60;
const MAX_SALESPEOPLE = 8;
const FIRST_TEAM_KEY = 65; // 'A': the manager role of the mock looks at team A
const MIN_TARGET = 300_000;
const TARGET_ROUND = 1000;
const OPEN_SPREAD_MONTHS = 3;

/** how a lead of the cast is placed in the forecast: probability, category and the step the prototype names for it */
const BY_INTEREST: Readonly<Record<string, readonly [number, string, string]>> = {
  HOT: [80, 'committed', 'เจรจาเสนอราคา'],
  WARM: [60, 'bestcase', 'ส่งข้อเสนอ'],
  COLD: [40, 'pipeline', 'ประเมินความต้องการ'],
  NEW: [20, 'pipeline', 'เริ่มติดต่อ'],
  INACTIVE: [20, 'pipeline', 'เริ่มติดต่อ'],
};
const WON: readonly [number, string, string] = [100, 'closed', 'ตกลงซื้อ'];
const LOST: readonly [number, string, string] = [0, 'omitted', 'ไม่สนใจ'];

const clampMonth = (m: string): string => (m < FIRST_MONTH ? FIRST_MONTH : m > LAST_MONTH ? LAST_MONTH : m);

function addMonths(month: string, n: number): string {
  const [y, m] = month.split('-').map(Number);
  const total = y * 12 + (m - 1) + n;
  return `${Math.floor(total / 12)}-${String((total % 12) + 1).padStart(2, '0')}`;
}

/** the forecast of `company` from its leads; undefined when it has nobody to forecast for */
export function buildWorkbookForecast(company: string, org: OrgDocument, prospects: CastProspectRow[], leads: CastLeadRow[]): WorkbookForecast | undefined {
  const usable = leads.filter((l) => l.amount > 0).slice(0, MAX_DEALS);
  const byOwner = new Map<string, number>();
  for (const l of usable) byOwner.set(l.ownerCode, (byOwner.get(l.ownerCode) ?? 0) + l.amount);
  const nameOf = new Map(org.employees.map((e) => [e.code, e]));
  const owners = [...byOwner.keys()]
    .filter((code) => nameOf.has(code))
    .sort((a, b) => (byOwner.get(b) ?? 0) - (byOwner.get(a) ?? 0))
    .slice(0, MAX_SALESPEOPLE);
  if (owners.length === 0) return undefined;

  const teamKey = new Map<string, string>();
  const teams: WorkbookForecast['teams'] = {};
  for (const code of owners) {
    const teamName = nameOf.get(code)?.team ?? '';
    if (!teamKey.has(teamName)) {
      const key = String.fromCharCode(FIRST_TEAM_KEY + teamKey.size);
      teamKey.set(teamName, key);
      const manager = org.employees.find((e) => e.team === teamName && e.role === 'Sup');
      teams[key] = { name: teamName, mgr: manager?.name ?? teamName };
    }
  }
  const employees = owners.map((code) => ({ id: code, name: nameOf.get(code)?.name ?? code, team: teamKey.get(nameOf.get(code)?.team ?? '') ?? 'A' }));

  const prospectName = new Map(prospects.map((p) => [p.id, p.fullName]));
  const mine = new Set(owners);
  let openIndex = 0;
  const deals: DealTuple[] = usable
    .filter((l) => mine.has(l.ownerCode))
    .map((l) => {
      const placed = l.status === 'SUCCESS' ? WON : l.status === 'LOST' ? LOST : (BY_INTEREST[l.interest] ?? BY_INTEREST['NEW']);
      const created = clampMonth(l.createdDate.slice(0, 7));
      const isOpen = l.status === 'ACTIVE';
      // an open deal is expected to close from this month on (a past month would count it as overdue); a closed one belongs to the month it was made
      const month = isOpen ? addMonths(created < CURRENT_MONTH ? CURRENT_MONTH : created, openIndex++ % OPEN_SPREAD_MONTHS) : created;
      const status = l.status === 'SUCCESS' ? 'won' : l.status === 'LOST' ? 'lost' : 'open';
      return [l.code, prospectName.get(l.prospectId) ?? l.code, l.ownerCode, placed[1], placed[0], l.amount, clampMonth(month), status, placed[2]];
    });

  const monthlyTargets: Record<string, number> = {};
  for (const code of owners) {
    const yearly = byOwner.get(code) ?? 0;
    monthlyTargets[code] = Math.max(MIN_TARGET, Math.round(yearly / 12 / TARGET_ROUND) * TARGET_ROUND);
  }
  return { companies: [[company, company]], employees, teams, deals, monthlyTargets };
}
