/**
 * The cast of the fake data of the CRM pages (mock mode, tests and the Java-vs-Angular comparison).
 *
 * Every page has its own mock backend that answers in the shape ITS Java servlets answered, but they all draw the people and the
 * leads from here, so the lead you click in the list is the lead the detail page opens, the employee who owns an activity is a
 * person of the employee list, and the dashboard's employees are the same people. READ-ONLY for page work: a page that needs more
 * about a lead (a history, products, documents …) derives it in its own mock from `seedLead(n)`; it does not edit this file.
 *
 * Framework-free and deterministic (no Date.now, no Math.random): the comparison harness loads it in Node and both sides must see
 * the same data.
 */

import { castFilter, stampBelongs } from './company-scope';
import { leadPatchOf, prospectPatchOf, sharedDb } from './shared-db';

/** "today" of every mock (the Dashboard mock agrees) */
export const SEED_TODAY = '2026-10-20';

export const SEED_BRANCH = { code: 'SUN', name: 'SUN GATEWAY' } as const;

export interface SeedEmployee {
  code: string;
  name: string;
  team: string;
  role: string;
}

export interface SeedGroup {
  id: number;
  code: string;
  name: string;
}

/**
 * The employees and the activity groups of the cast. Plain lists the pages read: the shared Datasource may replace what is in them
 * (`seed.org.json` — core/mock/org-seed.ts, IN PLACE, before the pages load), so never keep a copy of them at the top of a module that loads early.
 */
export const SEED_EMPLOYEES: SeedEmployee[] = [
  { code: 'E101', name: 'สมชาย ใจดี', team: 'ทีม A', role: 'Sup' },
  { code: 'E102', name: 'สุดา รักงาน', team: 'ทีม A', role: 'Staff' },
  { code: 'E103', name: 'วิชัย มั่นคง', team: 'ทีม B', role: 'Staff' },
  { code: 'E104', name: 'พิมพ์ใจ สุขสม', team: 'ทีม B', role: 'Staff' },
  { code: 'E105', name: 'ธนากร เจริญผล', team: 'ทีม A', role: 'Staff' },
  { code: 'E106', name: 'กมลชนก ศรีสุข', team: 'ทีม B', role: 'Staff' },
  { code: 'E107', name: 'อนุชา พงษ์ศิริ', team: 'ทีม A', role: 'Staff' },
  { code: 'E108', name: 'ปรียา แสงทอง', team: 'ทีม B', role: 'Staff' },
];

/** the activity groups of the workflow, left to right (CLAUDE.md §1: matched by `id`, never by name) */
export const SEED_GROUPS: SeedGroup[] = [
  { id: 101, code: 'CS', name: 'ฝ่ายบริการลูกค้า' },
  { id: 102, code: 'AN', name: 'วิเคราะห์สินเชื่อ' },
  { id: 103, code: 'PLS', name: 'พิจารณาผลิตภัณฑ์' },
  { id: 104, code: 'LS', name: 'สินเชื่อ' },
  { id: 105, code: 'FI', name: 'การเงิน' },
  { id: 106, code: 'LE', name: 'นิติกรรม' },
  { id: 107, code: 'CRM', name: 'ดูแลหลังการขาย' },
];

export const SEED_INTERESTS = ['HOT', 'WARM', 'COLD', 'INACTIVE', 'NEW', 'LOST', 'SUCCESS'] as const;
export const SEED_SOURCES: string[] = ['Facebook', 'LINE OA', 'Website', 'Walk-in', 'Referral', 'Call Center'];
export const SEED_PROVINCES: string[] = ['กรุงเทพมหานคร', 'เชียงใหม่', 'ขอนแก่น', 'ภูเก็ต', 'ชลบุรี', 'นครราชสีมา'];

export const SEED_FIRST_NAMES: string[] = ['สมชาย', 'สมหญิง', 'วิชัย', 'นภา', 'ธนากร', 'พิมพ์ชนก', 'อนุชา', 'ปรียา', 'กิตติ', 'มาลี', 'ประเสริฐ', 'จิราพร', 'ภานุ', 'สุภาพร', 'ณัฐวุฒิ', 'รัตนา', 'เอกชัย', 'วราภรณ์', 'ชัยวัฒน์', 'ศิริพร'];
export const SEED_LAST_NAMES: string[] = ['ใจดี', 'รักษา', 'มั่นคง', 'สุขสวัสดิ์', 'เจริญผล', 'แสงทอง', 'พงษ์ศิริ', 'ทองดี', 'บุญมา', 'ศรีสุข', 'วงศ์ไทย', 'อินทร์แก้ว'];

/**
 * How many customers and leads the cast has. 180 / 240 for the formulas; a document of the cast (`seed.crm`, or the workbook cast of a company
 * — workbook-cast.ts) may have any number, so these follow `setCastDocument` (live bindings: the importers see the new value).
 */
export let SEED_LEAD_COUNT = 240;
export let SEED_PROSPECT_COUNT = 180;
const FORMULA_LEAD_COUNT = 240;
const FORMULA_PROSPECT_COUNT = 180;

/**
 * The cast as a document of the shared Datasource (`seed.crm.json`, made by `npm run mockup:seed`): when the file server has it, the customers
 * and the leads come from THERE — the same rows for every developer, editable by hand — instead of from the formulas below (which stay the
 * fallback: no server, no document, a document that does not fit). The rows are the BASE of the cast: what a user changed (shared-db.ts) is laid over them.
 * The employees and the groups stay in this file (the pages build lists from them when they load).
 */
export interface CastProspectRow {
  id: number;
  code: string;
  firstName: string;
  lastName: string;
  fullName: string;
  phone: string;
  email: string;
  province: string;
  source: string;
  createdDate: string;
}

export interface CastLeadRow {
  id: number;
  code: string;
  prospectId: number;
  ownerCode: string;
  groupIdx: number;
  interest: string;
  status: string;
  createdDate: string;
  lastContactDate: string;
  amount: number;
}

export interface CastDocument {
  prospects: CastProspectRow[];
  leads: CastLeadRow[];
}

const LEAD_STATUSES: readonly string[] = ['ACTIVE', 'SUCCESS', 'LOST'];
let castProspects = new Map<number, CastProspectRow>();
let castLeads = new Map<number, CastLeadRow>();

const isText = (v: unknown): v is string => typeof v === 'string';
const isCount = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);

function validProspectRow(r: unknown): r is CastProspectRow {
  const o = r as Partial<Record<keyof CastProspectRow, unknown>>;
  return !!o && isCount(o.id) && [o.code, o.firstName, o.lastName, o.fullName, o.phone, o.email, o.province, o.source, o.createdDate].every(isText);
}

function validLeadRow(r: unknown): r is CastLeadRow {
  const o = r as Partial<Record<keyof CastLeadRow, unknown>>;
  return (
    !!o &&
    isCount(o.id) &&
    isCount(o.prospectId) &&
    isCount(o.amount) &&
    isCount(o.groupIdx) &&
    o.groupIdx >= 0 &&
    o.groupIdx < SEED_GROUPS.length &&
    [o.code, o.ownerCode, o.interest, o.status, o.createdDate, o.lastContactDate].every(isText) &&
    SEED_EMPLOYEES.some((e) => e.code === o.ownerCode) &&
    LEAD_STATUSES.includes(o.status as string)
  );
}

/**
 * Takes the cast from a document of the Datasource (`undefined` = back to the formulas). A document that does not have exactly the
 * customers and leads with the ids 1..n each (any number of them), or has a row that does not fit (unknown owner / group / status), is
 * refused as a whole — half a cast would break the pages that count on every id — and the reason is returned.
 */
export function setCastDocument(doc: unknown): string | undefined {
  castProspects = new Map();
  castLeads = new Map();
  SEED_PROSPECT_COUNT = FORMULA_PROSPECT_COUNT;
  SEED_LEAD_COUNT = FORMULA_LEAD_COUNT;
  if (doc === undefined || doc === null) return undefined;
  const { prospects, leads } = doc as Partial<CastDocument>;
  if (!Array.isArray(prospects) || !Array.isArray(leads)) return 'seed.crm: "prospects" and "leads" must be lists';
  if (prospects.length === 0 || leads.length === 0) return 'seed.crm: needs at least one customer and one lead';
  const p = new Map<number, CastProspectRow>();
  const l = new Map<number, CastLeadRow>();
  for (const row of prospects) if (validProspectRow(row)) p.set(row.id, row);
  for (const row of leads) if (validLeadRow(row)) l.set(row.id, row);
  const ids = (n: number): number[] => Array.from({ length: n }, (_x, i) => i + 1);
  if (p.size !== prospects.length || l.size !== leads.length || !ids(prospects.length).every((id) => p.has(id)) || !ids(leads.length).every((id) => l.has(id))) {
    return 'seed.crm: a row is missing, repeated or does not fit (ids 1..n, a known owner / group / status)';
  }
  castProspects = p;
  castLeads = l;
  SEED_PROSPECT_COUNT = prospects.length;
  SEED_LEAD_COUNT = leads.length;
  return undefined;
}

/** small deterministic mixer: the same (n, salt) is the same number everywhere */
export function seedHash(n: number, salt = 0): number {
  let h = (Math.imul(n + 1, 2654435761) ^ Math.imul(salt + 7, 40503)) >>> 0;
  h = Math.imul(h ^ (h >>> 15), 2246822519) >>> 0;
  h = Math.imul(h ^ (h >>> 13), 3266489917) >>> 0;
  return (h ^ (h >>> 16)) >>> 0;
}
const pick = <T>(list: readonly T[], n: number, salt: number): T => list[seedHash(n, salt) % list.length];
const pad = (n: number, w: number): string => String(n).padStart(w, '0');

/** `YYYY-MM-DD` of SEED_TODAY minus `days` */
export function seedDate(days: number): string {
  const d = new Date(Date.UTC(2026, 9, 20) - days * 86_400_000);
  return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1, 2)}-${pad(d.getUTCDate(), 2)}`;
}

export interface SeedProspect {
  id: number;
  /** the employee who has the customer (set when it is taken out of the Wait List) */
  ownerCode?: string;
  code: string;
  firstName: string;
  lastName: string;
  fullName: string;
  phone: string;
  email: string;
  province: string;
  source: string;
  createdDate: string;
}

/** the ids of every customer now: the cast 1..SEED_PROSPECT_COUNT, then the ones the user added (shared-db.ts) */
export const prospectIds = (): number[] => {
  const mine = castFilter();
  return [...Array.from({ length: SEED_PROSPECT_COUNT }, (_x, i) => i + 1).filter(mine), ...sharedDb().addedProspects.filter(addedProspectIsMine)];
};

/** the customer of a cast lead `n` (a lead the user opened has its own: shared-db) */
const castLeadProspect = (n: number): number => 1 + ((n - 1) % SEED_PROSPECT_COUNT);

/** something the user added belongs to the company it was added in (no stamp: to every company) */
const addedProspectIsMine = (id: number): boolean => stampBelongs(prospectPatchOf(id)?.company);
const addedLeadIsMine = (id: number): boolean => stampBelongs(leadPatchOf(id)?.company);

/** the ids of every lead now: the cast 1..SEED_LEAD_COUNT, then the ones the user opened (shared-db.ts) */
export const leadIds = (): number[] => {
  const mine = castFilter();
  return [...Array.from({ length: SEED_LEAD_COUNT }, (_x, i) => i + 1).filter((n) => mine(castLeadProspect(n))), ...sharedDb().addedLeads.filter(addedLeadIsMine)];
};

export const isKnownProspect = (id: number): boolean =>
  Number.isInteger(id) && ((id >= 1 && id <= SEED_PROSPECT_COUNT && castFilter()(id)) || (sharedDb().addedProspects.includes(id) && addedProspectIsMine(id)));
export const isKnownLead = (id: number): boolean =>
  Number.isInteger(id) && ((id >= 1 && id <= SEED_LEAD_COUNT && castFilter()(castLeadProspect(id))) || (sharedDb().addedLeads.includes(id) && addedLeadIsMine(id)));

/** customer (prospect) `n`: the cast 1..SEED_PROSPECT_COUNT (or one the user added), with what the user changed laid over it */
export function seedProspect(n: number): SeedProspect {
  const base = baseProspect(n);
  const patch = prospectPatchOf(n);
  if (!patch) return base;
  const merged = { ...base, ...patch };
  // a name given whole is the name; the parts follow it
  if (patch.fullName && !patch.firstName) {
    const [firstName = '', ...rest] = patch.fullName.trim().split(/\s+/);
    merged.firstName = firstName;
    merged.lastName = rest.join(' ');
  }
  merged.fullName = patch.fullName ?? `${merged.firstName} ${merged.lastName}`.trim();
  return merged;
}

function baseProspect(n: number): SeedProspect {
  const row = castProspects.get(n);
  if (row) return { ...row };
  const firstName = pick(SEED_FIRST_NAMES, n, 1);
  const lastName = pick(SEED_LAST_NAMES, n, 2);
  return {
    id: n,
    code: `P${pad(n, 5)}`,
    firstName,
    lastName,
    fullName: `${firstName} ${lastName}`,
    phone: `08${seedHash(n, 3) % 10}-${pad(seedHash(n, 4) % 1000, 3)}-${pad(seedHash(n, 5) % 10000, 4)}`,
    email: `customer${n}@example.com`,
    province: pick(SEED_PROVINCES, n, 6),
    source: pick(SEED_SOURCES, n, 7),
    createdDate: seedDate(5 + (seedHash(n, 8) % 400)),
  };
}

export interface SeedLead {
  id: number;
  code: string;
  prospectId: number;
  customerName: string;
  phone: string;
  province: string;
  source: string;
  /** owner (an employee code) */
  ownerCode: string;
  ownerName: string;
  /** index into SEED_GROUPS of the group the lead is in now */
  groupIdx: number;
  groupId: number;
  interest: (typeof SEED_INTERESTS)[number];
  /** lead status: ACTIVE while it is worked, SUCCESS / LOST when closed */
  status: 'ACTIVE' | 'SUCCESS' | 'LOST';
  createdDate: string;
  lastContactDate: string;
  amount: number;
}

/** lead `n`, 1..SEED_LEAD_COUNT — its customer is prospect `1 + (n-1) % SEED_PROSPECT_COUNT` */
export function seedLead(n: number): SeedLead {
  const base = baseLead(n);
  const patch = leadPatchOf(n);
  // the customer's own data is read now (it may have been edited since the lead was made)
  const prospect = seedProspect(base.prospectId);
  const owner = patch?.ownerCode ? SEED_EMPLOYEES.find((e) => e.code === patch.ownerCode) : undefined;
  const groupIdx = patch?.groupIdx ?? base.groupIdx;
  const status = patch?.status ?? base.status;
  return {
    ...base,
    customerName: prospect.fullName,
    phone: prospect.phone,
    province: prospect.province,
    source: prospect.source,
    ownerCode: owner?.code ?? base.ownerCode,
    ownerName: owner?.name ?? base.ownerName,
    groupIdx,
    groupId: SEED_GROUPS[groupIdx].id,
    status,
    interest: (patch?.interest as SeedLead['interest'] | undefined) ?? (patch?.status && patch.status !== 'ACTIVE' ? patch.status : base.interest),
    amount: patch?.amount ?? base.amount,
    createdDate: patch?.createdDate ?? base.createdDate,
  };
}

function baseLead(n: number): SeedLead {
  const row = castLeads.get(n);
  if (row) return leadOfRow(row);
  // a lead the user opened belongs to the customer it was opened for; a lead of the cast, to `1 + (n-1) % SEED_PROSPECT_COUNT`
  const prospect = seedProspect(leadPatchOf(n)?.prospectId ?? castLeadProspect(n));
  const owner = pick(SEED_EMPLOYEES, n, 11);
  const groupIdx = seedHash(n, 12) % SEED_GROUPS.length;
  const roll = seedHash(n, 13) % 100;
  const status = roll < 12 ? 'SUCCESS' : roll < 22 ? 'LOST' : 'ACTIVE';
  const interest = status === 'ACTIVE' ? pick(['HOT', 'WARM', 'COLD', 'INACTIVE', 'NEW'] as const, n, 14) : status;
  const age = 3 + (seedHash(n, 15) % 300);
  return {
    id: n,
    code: `L${pad(n, 5)}`,
    prospectId: prospect.id,
    customerName: prospect.fullName,
    phone: prospect.phone,
    province: prospect.province,
    source: prospect.source,
    ownerCode: owner.code,
    ownerName: owner.name,
    groupIdx,
    groupId: SEED_GROUPS[groupIdx].id,
    interest,
    status,
    createdDate: seedDate(age),
    lastContactDate: seedDate(Math.max(0, age - (seedHash(n, 16) % age))),
    amount: (1 + (seedHash(n, 17) % 40)) * 50_000,
  };
}

/** a lead of the document: the customer's own data and the names are read from the customer and the employee, as for a lead of the formulas */
function leadOfRow(row: CastLeadRow): SeedLead {
  const prospect = seedProspect(leadPatchOf(row.id)?.prospectId ?? row.prospectId);
  const owner = SEED_EMPLOYEES.find((e) => e.code === row.ownerCode);
  return {
    id: row.id,
    code: row.code,
    prospectId: prospect.id,
    customerName: prospect.fullName,
    phone: prospect.phone,
    province: prospect.province,
    source: prospect.source,
    ownerCode: row.ownerCode,
    ownerName: owner?.name ?? '',
    groupIdx: row.groupIdx,
    groupId: SEED_GROUPS[row.groupIdx].id,
    interest: row.interest as SeedLead['interest'],
    status: row.status as SeedLead['status'],
    createdDate: row.createdDate,
    lastContactDate: row.lastContactDate,
    amount: row.amount,
  };
}
