/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * Deterministic fake backend of the CRM home page (dev / `mock: true`, tests and the Java-vs-Angular comparison).
 *
 * It answers the BFF URLs of the Java page (`../dashboardapi?action=summary|schedules`, `../board/movement-types`, `../board/leads`,
 * `../board/lead-assign`, the sale-group / sale-person / employee lists of the assign dialog, the work modal's endpoints …) in exactly the shapes
 * the servlets answered (see home-backend.ts). Every number is computed, not typed: the leads come from the shared cast
 * (`@core/mock/crm-seed`: `seedLead(n)` — lead 17 here is lead 17 of every other page), dealt to three products, and the statistics, the
 * donut, the opportunity table and the appointment / task cards are all computed from that ONE set of leads, so the page agrees with itself:
 * the figure "New" is the number of rows the table ends with; assigning a lead changes the row and the figures on the next load.
 *
 * What the backend of this mock does (so that every control of the page changes something real):
 *   - GET dashboardapi?action=summary   filters by product and by date (txDate), counts every status, counts the open leads per workflow STEP
 *     (`stepSummary`: the donut); a product without a workflow has no `stepSummary` (the page then counts the steps of its own rows);
 *   - GET dashboardapi?action=schedules the appointments and tasks are generated per DAY (a hash of the day number: any month has some, and the
 *     same day always has the same items), each belongs to a lead of the product; `viewMode=list` (a month), `year` (the days with something:
 *     the dots of the calendar) and `day`; the items the work modal adds / edits are merged in;
 *   - GET board/leads                   `viewMode=list`: the open leads (NEW · INACTIVE · HOT · WARM · COLD; `showClosed=true` = the closed ones)
 *     newest first (`txdate_desc`), 20 per page, with `search` / `employeeId` / `movementTypeId` / `activityGroupId` / date filters; the session
 *     without CRM_Lead_View gets `[]` (LeadsBoardServlet checks the role before it calls the service);
 *   - POST board/lead-assign            gives the lead its employee (and team / sale person); the employee ปรียา แสงทอง is refused by the
 *     backend (400 "ต้องส่งต่อ" — the message the page prints) so that the failure branch of the dialog can be seen.
 *
 * Special inputs (the Java page cannot trigger them any other way): a customer search containing "~500" fails (HTTP 500); a schedule whose
 * subject contains "~fail" is refused by the backend (400 with a message); the product "ผลิตภัณฑ์ใหม่ (ยังไม่มีลีด)" has no lead at all;
 * lead ids divisible by 17 are NEW with the employee set but the backend flag `unassigned` stuck at true (the quirk the page knows about),
 * divisible by 19 NEW with an employee id and no name; and the switches of `MockHomeConfig` (sessionStorage `ts.mock.home.config`).
 *
 * Framework-free on purpose (no Angular imports): the comparison harness loads this file in Node.
 */
import { productsCodec, msg, reference } from '@core/mock/reference';
import { canSeeOpportunity, employeeCodeOfId, type OpportunityViewer } from '@core/mock/org-chart';
import { MOCK_COUNTRIES } from '@core/http/mock-countries';
import { SEED_EMPLOYEES, SEED_GROUPS, SEED_TODAY, leadIds, seedHash, seedLead, type SeedLead } from '@core/mock/crm-seed';
import { sharedDbVersion } from '@core/mock/shared-db';
import { handleWorkModalRequest, parseBffUrl, toResponse, type MockReply, type ScheduleEnvelope, type WorkModalData, type WorkModalEmployee } from '@shared/work-modal/work-modal.mock';
import type { DashboardSummary, HomeBackend, ScheduleItem } from './home-backend';

export const MOCK_TODAY = SEED_TODAY;

/* ================================================================================== switches */
export interface MockHomeConfig {
  /** `/board/movement-types` answers no product: the page loads everything unfiltered */
  noProducts?: boolean;
  /** `/board/movement-types` answers HTTP 500 */
  failProducts?: boolean;
  /** `dashboardapi?action=summary` answers HTTP 500 */
  failSummary?: boolean;
  /** `dashboardapi?action=schedules` answers HTTP 500 */
  failSchedules?: boolean;
  /** `/board/leads` answers HTTP 500 (the table says it could not load everything) */
  failLeads?: boolean;
  /** the first request for each page of `/board/leads` answers 500; the automatic retry of the page (800 ms later) is answered */
  failLeadsOnce?: boolean;
  /** no appointment and no task at all */
  emptySchedules?: boolean;
  /** `/board/employees` answers `[]` (the owner list of the assign dialog then comes from the sale persons) */
  employeesEmpty?: boolean;
  /** NEW leads only among the oldest of the list: the table loads page after page, stops after 5 empty pages and offers "load more" */
  sparseNew?: boolean;
  /** `/board/lead-assign` answers HTTP 500 with a body that has no message */
  assign500?: boolean;
  /** ms every answer is delayed, instead of the delay of the options (a slow network: the skeleton stays on screen) */
  delayMs?: number;
  /** ms more that `/board/leads` takes (the backend query is the heavy one; default 120) */
  leadsExtraMs?: number;
}

export interface MockHomeOptions {
  /** ms every answer is delayed (default 150: a network) */
  delayMs?: number;
  /** `hasFeature(key)` of the signed-in user. Default: everything */
  can?: (feature: string) => boolean;
  /** the employee id of the session (`1001` = E101): who sees whose leads follows the chart of the organisation. Default: everything is seen */
  employeeId?: number;
  config?: MockHomeConfig;
}

const CONFIG_KEY = 'ts.mock.home.config';
const DATA_KEY = 'ts.mock.home.data';
const mem = new Map<string, string>(); // no sessionStorage in Node
const store = {
  get: (k: string): string | null => {
    try {
      if (typeof sessionStorage !== 'undefined') return sessionStorage.getItem(k);
    } catch {
      /* storage blocked */
    }
    return mem.get(k) ?? null;
  },
  set: (k: string, v: string | null): void => {
    try {
      if (typeof sessionStorage !== 'undefined') {
        if (v === null) sessionStorage.removeItem(k);
        else sessionStorage.setItem(k, v);
        return;
      }
    } catch {
      /* storage blocked: keep it in memory */
    }
    if (v === null) mem.delete(k);
    else mem.set(k, v);
  },
};

/* ================================================================================== master data */
/** employee id = 1000 + the number of the code (E101 → 1001: the id of the mock sign-in "demo", see mock-backend.interceptor) */
const empId = (code: string): number => 1000 + Number(code.slice(1)) - 100;
const SALE_GROUPS = reference('shared.saleGroups', [
  { id: 1004400001, code: 'TA', name: 'ทีม A' },
  { id: 1004400002, code: 'TB', name: 'ทีม B' },
]);
interface Emp {
  id: number;
  code: string;
  name: string;
  team: string;
  saleGroupId: number;
}
const EMPLOYEES: Emp[] = SEED_EMPLOYEES.map((e) => ({ id: empId(e.code), code: e.code, name: e.name, team: e.team, saleGroupId: SALE_GROUPS.find((g) => g.name === e.team)!.id }));
/** the sale people are the same people with ids of their own (a lead has a salePersonId AND an employeeId) */
const SALE_PERSONS = EMPLOYEES.map((e, i) => ({ id: 2001 + i, code: 'SP' + e.code.slice(1), name: e.name, saleGroupId: e.saleGroupId, employee: e }));
/** the backend refuses to give a lead to this employee (the failure branch of the assign dialog) */
const REFUSED_EMPLOYEE = 'E108';
const REFUSED_MESSAGE = 'ต้องส่งต่อ (forward) — พนักงานคนนี้รับงานเต็มแล้ว (จำลอง)';

interface Group {
  id: number;
  code: string;
  name: string;
}
interface Product {
  id: number;
  code: string;
  name: string;
  usesWorkflowStep: boolean;
  groups: Group[];
}
const ALL_PRODUCTS = reference('shared.products', [
  { id: 1004400740, code: 'LD-HL', name: 'สินเชื่อบ้าน', usesWorkflowStep: true, groups: [...SEED_GROUPS] },
  { id: 1004400741, code: 'LD-AL', name: 'สินเชื่อรถยนต์', usesWorkflowStep: true, groups: SEED_GROUPS.slice(0, 5) },
  { id: 1004400742, code: 'LD-FA', name: 'ที่ปรึกษาการเงิน', usesWorkflowStep: false, groups: [] },
  { id: 1004400743, code: 'LD-NW', name: 'ผลิตภัณฑ์ใหม่ (ยังไม่มีลีด)', usesWorkflowStep: true, groups: SEED_GROUPS.slice(0, 3) },
  { id: 1004400744, code: 'LD-XX', name: 'ผลิตภัณฑ์จำกัดสิทธิ์', usesWorkflowStep: true, groups: SEED_GROUPS.slice(0, 4), forbidden: true },
], productsCodec<Product & { forbidden?: boolean }>());
const PRODUCTS: Product[] = ALL_PRODUCTS.filter((p) => !p.forbidden);
/** lead n belongs to a product: 0-3 → สินเชื่อบ้าน, 4-5 → สินเชื่อรถยนต์, 6-7 → ที่ปรึกษาการเงิน (no workflow); nobody to the new product */
const productOfLead = (n: number): Product => PRODUCTS[(n % 8 < 4 ? 0 : n % 8 < 6 ? 1 : 2) % PRODUCTS.length]; // a company of the Seed Workbook may have fewer products than three

/** the steps of every group (a step id = group id * 10 + its position) */
const GROUP_STEPS: Record<string, string[]> = reference('shared.groupSteps', {
  CS: ['รับลีดใหม่', 'โทรติดต่อลูกค้า', 'นัดหมายพบลูกค้า', 'ส่งต่อทีมวิเคราะห์'],
  AN: ['ตรวจสอบเอกสาร', 'วิเคราะห์ความเสี่ยง', 'สรุปผลวิเคราะห์'],
  PLS: ['คัดกรองเบื้องต้น', 'ประเมินวงเงิน', 'เสนอผลิตภัณฑ์'],
  LS: ['ยื่นคำขอสินเชื่อ', 'พิจารณาอนุมัติ', 'แจ้งผลอนุมัติ'],
  FI: ['ตรวจสอบบัญชีผู้รับเงิน', 'จัดเตรียมการโอนเงิน'],
  LE: ['ทำสัญญาสินเชื่อ', 'จดทะเบียนหลักประกัน'],
  CRM: ['ติดตามหลังการขาย', 'สำรวจความพึงพอใจ'],
});
const NOWF_STEPS = reference('shared.noWorkflowSteps', ['สอบถามความต้องการ', 'เสนอแนวทาง', 'ติดตามผล', 'ปิดการขาย']);
const APPT_SUBJECTS = reference('shared.apptSubjects', ['นัดดูทรัพย์', 'นัดเซ็นสัญญา', 'นัดส่งเอกสาร', 'พบลูกค้าที่สาขา', 'นัดประเมินราคา']);
const TASK_SUBJECTS = reference('shared.taskSubjects', ['เตรียมเอกสารสินเชื่อ', 'ตรวจสอบเครดิตบูโร', 'โทรยืนยันนัดหมาย', 'ส่งใบเสนอราคา', 'ติดตามผลการอนุมัติ']);
const DETAILS = reference('home.details', ['นัดหมายกับลูกค้าตามที่ตกลงทางโทรศัพท์', 'เตรียมเอกสารตัวจริงและสำเนาให้ครบ', 'ติดตามความคืบหน้าและสรุปผลให้ทีมทราบภายในวันนี้ พร้อมแนบรายละเอียดเพิ่มเติมของลูกค้ารายนี้ทั้งหมดให้ครบถ้วน', '']);

const pad = (n: number, w = 2): string => String(n).padStart(w, '0');
const isoDate = (t: number): string => new Date(t).toISOString().slice(0, 10);
const DAY = 86_400_000;
const dayNoOf = (iso: string): number => {
  const [y, m, d] = iso.split('-').map(Number);
  return Math.floor(Date.UTC(y, m - 1, d) / DAY);
};

/** a picture that needs no network: the avatar of some customers */
const AVATARS = ['#EB4FA0', '#4B84FF', '#0AA77C', '#FF8E4E'].map((c) => 'data:image/svg+xml;base64,' + btoa(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 40 40"><rect width="40" height="40" fill="${c}"/><circle cx="20" cy="15" r="7" fill="#fff"/><path d="M6 40a14 14 0 0 1 28 0z" fill="#fff"/></svg>`));

/* ================================================================================== the leads */
type Kind = 'NEW' | 'INACTIVE' | 'HOT' | 'WARM' | 'COLD' | 'SUCCESS' | 'LOST';
interface LeadM {
  n: number;
  seed: SeedLead;
  product: Product;
  group: Group | null;
  step: string;
  baseKind: Kind;
  /** the owner the cast gives (null = nobody yet) */
  baseOwner: string | null;
  /** the backend flag `unassigned` is stuck at true although the lead has its employee */
  stuck: boolean;
  /** the lead has an employee id but the backend sends neither his code nor his name */
  nameless: boolean;
  /** the team is known although nobody has the lead yet */
  teamKnown: boolean;
  avatar: string;
  phoneCc: string | null;
  country: string | null;
  /** position in the list of ALL leads, newest first */
  rank: number;
  assigned?: { employeeId: number; saleGroupId?: number; salePersonId?: number };
}
interface Sched {
  id: number;
  kind: 'appointment' | 'task';
  leadId: number;
  subject: string;
  detail: string;
  date: string;
  time: string | null;
  allDay: boolean;
  status: string;
  groupId: number | null;
}
interface MockState {
  leads: LeadM[];
  byId: Map<number, LeadM>;
  added: Sched[];
  overrides: Map<number, Partial<Sched>>;
  seq: number;
  /** `failLeadsOnce`: the pages already refused once */
  refused: Set<string>;
}
let STATE: MockState | null = null;
let syncedVersion = -1;

function buildLead(n: number): LeadM {
  const seed = seedLead(n);
  const h = (salt: number) => seedHash(n, salt);
  const product = productOfLead(n);
  const group = product.groups.length ? product.groups[seed.groupIdx % product.groups.length] : null;
  const steps = group ? GROUP_STEPS[group.code] : NOWF_STEPS;
  let baseKind: Kind;
  if (seed.status !== 'ACTIVE') baseKind = seed.status;
  else {
    const r = h(41) % 100;
    baseKind = r < 40 ? 'NEW' : r < 55 ? 'INACTIVE' : (['HOT', 'WARM', 'COLD'] as const)[r % 3];
  }
  const quirk17 = baseKind === 'NEW' && n % 17 === 0;
  const quirk19 = baseKind === 'NEW' && n % 19 === 0 && !quirk17;
  const nobody = baseKind === 'NEW' && !quirk17 && !quirk19 && h(42) % 100 < 45;
  return {
    n,
    seed,
    product,
    group,
    step: steps[h(43) % steps.length],
    baseKind,
    baseOwner: nobody ? null : seed.ownerCode,
    stuck: quirk17,
    nameless: quirk19,
    teamKnown: nobody && n % 3 === 0,
    avatar: n % 7 === 0 ? AVATARS[h(44) % AVATARS.length] : '',
    phoneCc: n % 11 === 0 ? null : n % 13 === 0 ? '+81' : '+66',
    country: n % 11 === 0 ? null : n % 13 === 0 ? 'JPN' : 'THA',
    rank: 0,
  };
}

function state(): MockState {
  if (!STATE) {
    const leads = leadIds().map((n) => buildLead(n));
    syncedVersion = sharedDbVersion();
    [...leads].sort(byDateDesc).forEach((l, i) => (l.rank = i));
    STATE = { leads, byId: new Map(leads.map((l) => [l.n, l])), added: [], overrides: new Map(), seq: 8_000_000, refused: new Set() };
    // what the pages wrote before (the Java server kept it; here sessionStorage does, so that a reload of the page keeps it too)
    try {
      const d = JSON.parse(store.get(DATA_KEY) ?? 'null') as PersistedData | null;
      if (d) {
        for (const [n, a] of Object.entries(d.assigned)) STATE.byId.get(Number(n))!.assigned = a;
        STATE.added = d.added;
        STATE.overrides = new Map(d.overrides.map(([id, p]) => [id, p]));
        STATE.seq = d.seq;
      }
    } catch {
      /* damaged: start again */
    }
  }
  // the shared database changed (a customer edited, a lead opened on another page): the leads are made again, what was assigned is kept
  if (syncedVersion !== sharedDbVersion()) {
    const old = STATE.byId;
    const leads = leadIds().map((n) => buildLead(n));
    for (const l of leads) {
      const assigned = old.get(l.n)?.assigned;
      if (assigned) l.assigned = assigned;
    }
    [...leads].sort(byDateDesc).forEach((l, i) => (l.rank = i));
    STATE.leads = leads;
    STATE.byId = new Map(leads.map((l) => [l.n, l]));
    syncedVersion = sharedDbVersion();
  }
  return STATE;
}

interface PersistedData {
  assigned: Record<string, NonNullable<LeadM['assigned']>>;
  added: Sched[];
  overrides: [number, Partial<Sched>][];
  seq: number;
}
/** writes what the pages changed (lead-assign, schedule add / edit) */
function save(): void {
  const s = state();
  const assigned: PersistedData['assigned'] = {};
  for (const l of s.leads) if (l.assigned) assigned[l.n] = l.assigned;
  store.set(DATA_KEY, JSON.stringify({ assigned, added: s.added, overrides: [...s.overrides], seq: s.seq } satisfies PersistedData));
}

/** starts every scenario / test from the seed again (the data is edited by POST / PATCH) */
export function resetMockHome(): void {
  STATE = null;
  mem.clear();
  store.set(CONFIG_KEY, null);
  store.set(DATA_KEY, null);
}

const byDateDesc = (a: LeadM, b: LeadM): number => b.seed.createdDate.localeCompare(a.seed.createdDate) || b.n - a.n;
const closed = (k: Kind): boolean => k === 'SUCCESS' || k === 'LOST';

interface Ctx {
  can: (feature: string) => boolean;
  config: MockHomeConfig;
  /** whose leads the session sees (the chart of the organisation); absent = all */
  viewer?: OpportunityViewer;
}
const kindOf = (l: LeadM, c: Ctx): Kind => (c.config.sparseNew && l.baseKind === 'NEW' && l.rank < 215 ? 'INACTIVE' : l.baseKind);
const ownerOf = (l: LeadM): Emp | null => {
  if (l.assigned) return EMPLOYEES.find((e) => e.id === l.assigned!.employeeId) ?? null;
  return l.baseOwner ? (EMPLOYEES.find((e) => e.code === l.baseOwner) ?? null) : null;
};
/** the session sees the lead of its own and of its team (the chart of the organisation); a lead nobody owns is seen by all */
const visibleTo = (l: LeadM, c: Ctx): boolean => !c.viewer || canSeeOpportunity(c.viewer, ownerOf(l)?.code ?? null);
const digits = (s: string): string => s.replace(/\D/g, '');

/** one lead as `/board/leads` gives it (LeadListItemResDTO) */
function itemOf(l: LeadM, c: Ctx): Record<string, unknown> {
  const k = kindOf(l, c);
  const o = ownerOf(l);
  const active = k === 'HOT' || k === 'WARM' || k === 'COLD';
  const sp = l.assigned?.salePersonId ? SALE_PERSONS.find((s) => s.id === l.assigned!.salePersonId) : o ? SALE_PERSONS.find((s) => s.employee.id === o.id) : undefined;
  const teamId = l.assigned?.saleGroupId ?? (o ? o.saleGroupId : l.teamKnown ? SALE_GROUPS[l.n % 2].id : null);
  const team = SALE_GROUPS.find((g) => g.id === teamId);
  return {
    id: l.n,
    txNo: `LD-26-${pad(l.n, 5)}`,
    txDate: l.seed.createdDate,
    movementTypeId: l.product.id,
    movementTypeCode: l.product.code,
    prospectId: l.seed.prospectId,
    prospectCode: `P${pad(l.seed.prospectId, 5)}`,
    prospectName: l.seed.customerName,
    prospectAvatar: l.avatar,
    prospectTel: digits(l.seed.phone),
    phoneCountryCode: l.phoneCc,
    countryCode: l.country,
    leadStatus: active ? 'ACTIVE' : k,
    activeStatus: active ? k : '',
    forwardStatus: l.group ? `${l.group.name} - ${l.step}` : l.step,
    activityGroupId: l.group?.id ?? null,
    activityGroupName: l.group?.name ?? null,
    procedureGroupId: l.group?.id ?? null,
    procedureGroupName: l.group?.name ?? null,
    saleGroupId: team?.id ?? null,
    saleGroupName: team?.name ?? '',
    salePersonId: sp?.id ?? null,
    salePersonName: l.nameless ? '' : (sp?.name ?? ''),
    employeeId: o ? o.id : null,
    employeeCode: o && !l.nameless ? o.code : '',
    employeeName: o && !l.nameless ? o.name : '',
    unassigned: o === null || l.stuck || (!!l.assigned && !l.assigned.salePersonId),
    lastUpdatedAt: `${l.seed.lastContactDate} 09:00:00`,
    amount: l.seed.amount,
  };
}

/* ---------------------------------------------------------------- filters */
const str = (p: URLSearchParams, k: string): string => (p.get(k) ?? '').trim();
const intParam = (p: URLSearchParams, name: string, d: number): number => {
  const v = str(p, name);
  if (!v) return d;
  const n = parseInt(v, 10);
  return Number.isFinite(n) ? n : d;
};

/** the leads of the product (empty = every product) and of the date range */
function scope(p: URLSearchParams, from: string, to: string, c: Ctx): LeadM[] {
  const mt = str(p, 'movementTypeId');
  const f = str(p, from);
  const t = str(p, to);
  return state().leads.filter((l) => visibleTo(l, c) && (!mt || String(l.product.id) === mt) && (!f || l.seed.createdDate >= f) && (!t || l.seed.createdDate <= t));
}

/* ---------------------------------------------------------------- GET dashboardapi?action=summary */
function summary(p: URLSearchParams, c: Ctx): DashboardSummary {
  const set = scope(p, 'startDate', 'endDate', c);
  const count = (k: Kind) => set.filter((l) => kindOf(l, c) === k).length;
  const hot = count('HOT');
  const warm = count('WARM');
  const cold = count('COLD');
  // the donut counts the OPEN leads per workflow step, group by group in the order of the workflow
  const open = set.filter((l) => !closed(kindOf(l, c)) && l.group);
  const steps: DashboardSummary['stepSummary'] = [];
  const mt = str(p, 'movementTypeId');
  const groups = SEED_GROUPS.filter((g) => PRODUCTS.some((pr) => (!mt || String(pr.id) === mt) && pr.groups.some((x) => x.id === g.id)));
  for (const g of groups) {
    GROUP_STEPS[g.code].forEach((name, i) => {
      const n = open.filter((l) => l.group!.id === g.id && l.step === name).length;
      if (n > 0) steps.push({ id: g.id * 10 + i + 1, code: `${g.code}${pad(i + 1)}`, name, count: n });
    });
  }
  const perPage = Math.max(1, intParam(p, 'perPage', 20));
  const items = [...set].sort(byDateDesc).slice(0, perPage).map((l) => {
    const o = ownerOf(l);
    return { prospectName: l.seed.customerName, customerTel: digits(l.seed.phone), handlerName: o?.name ?? '', currentGroup: l.group?.name ?? '', currentStep: l.step, leadStatus: kindOf(l, c), attachFile: l.avatar };
  });
  return {
    stats: { total: set.length, statusNew: count('NEW'), statusSuccess: count('SUCCESS'), statusInactive: count('INACTIVE'), statusLost: count('LOST'), statusActive: hot + warm + cold, activeHot: hot, activeWarm: warm, activeCold: cold },
    stepSummary: steps,
    items,
  };
}

/* ---------------------------------------------------------------- GET dashboardapi?action=schedules */
function groupOf(l: LeadM): number | null {
  return l.group?.id ?? null;
}
/** the appointments and tasks of one day (generated from the day number) of the leads of the product */
function generated(dayNo: number, iso: string, cands: LeadM[]): Sched[] {
  if (!cands.length) return [];
  const out: Sched[] = [];
  const h = seedHash(dayNo, 51);
  const nAppt = h % 5 === 0 ? 1 + ((h >>> 4) % 2) : 0;
  const nTask = seedHash(dayNo, 52) % 4 === 1 ? 1 + (seedHash(dayNo, 53) % 3) : 0;
  const make = (kind: Sched['kind'], k: number): Sched => {
    const salt = dayNo * 10 + k;
    const l = cands[seedHash(salt, 54) % cands.length];
    const allDay = kind === 'task' && seedHash(salt, 55) % 4 === 0;
    return {
      id: 900_000_000 + salt,
      kind,
      leadId: l.n,
      subject: (kind === 'appointment' ? APPT_SUBJECTS : TASK_SUBJECTS)[seedHash(salt, 56) % 5],
      detail: DETAILS[seedHash(salt, 57) % DETAILS.length],
      date: iso,
      time: allDay ? null : `${pad(8 + (seedHash(salt, 58) % 9))}:${seedHash(salt, 59) % 2 ? '30' : '00'}:00`,
      allDay,
      status: kind === 'appointment' ? 'scheduled' : (['doing', 'doing', 'success'] as const)[seedHash(salt, 60) % 3],
      groupId: groupOf(l),
    };
  };
  for (let k = 0; k < nAppt; k++) out.push(make('appointment', k));
  for (let k = 0; k < nTask; k++) out.push(make('task', 2 + k));
  return out;
}

function schedulesOf(p: URLSearchParams, c: Ctx, from: string, to: string): Sched[] {
  if (c.config.emptySchedules) return [];
  const mt = str(p, 'movementTypeId');
  const cands = state().leads.filter((l) => visibleTo(l, c) && !closed(kindOf(l, c)) && (!mt || String(l.product.id) === mt));
  const out: Sched[] = [];
  const a = dayNoOf(from);
  const b = Math.min(dayNoOf(to), a + 62);
  for (let d = a; d <= b; d++) out.push(...generated(d, isoDate(d * DAY), cands));
  for (const s of state().added) {
    const l = state().byId.get(s.leadId);
    if (s.date >= from && s.date <= to && l && (!mt || String(l.product.id) === mt)) out.push(s);
  }
  return out
    .map((s) => ({ ...s, ...(state().overrides.get(s.id) ?? {}) }))
    .sort((x, y) => x.date.localeCompare(y.date) || (x.time ?? '').localeCompare(y.time ?? '') || x.id - y.id);
}

function scheduleItem(s: Sched): ScheduleItem {
  const l = state().byId.get(s.leadId)!;
  return {
    id: s.id,
    scheduleType: s.kind,
    leadId: s.leadId,
    prospectName: l.seed.customerName,
    prospectImage: l.avatar,
    topic: s.subject,
    detail: s.detail,
    appointmentDate: s.date,
    appointmentTime: s.time,
    allDay: s.allDay,
    status: s.status,
    activityGroupId: s.groupId,
    activityGroupName: l.group?.name ?? '',
    activityStepName: l.step,
  };
}

function schedules(p: URLSearchParams, c: Ctx): Record<string, unknown> {
  const mode = str(p, 'viewMode') || 'list';
  const date = str(p, 'date');
  const from = date || str(p, 'dateFrom') || SEED_TODAY.slice(0, 8) + '01';
  const to = date || str(p, 'dateTo') || SEED_TODAY;
  const all = schedulesOf(p, c, from, to);
  if (mode === 'year') return { marks: [...new Set(all.map((s) => s.date))] };
  if (mode === 'day') return { items: all.map(scheduleItem) };
  const appt = all.filter((s) => s.kind === 'appointment').map(scheduleItem);
  const task = all.filter((s) => s.kind === 'task').map(scheduleItem);
  return { list: { appointment: { items: appt, total: appt.length }, task: { items: task, total: task.length } }, summary: { appointments: appt.length, tasks: task.length } };
}

/* ---------------------------------------------------------------- GET board/leads */
function leadsReply(p: URLSearchParams, c: Ctx): { status: number; body: unknown } {
  const showClosed = str(p, 'showClosed') === 'true';
  const search = str(p, 'search').toLowerCase();
  const employee = str(p, 'employeeId');
  const group = intParam(p, 'activityGroupId', 0);
  const sortBy = str(p, 'sortBy') || 'txdate_desc';
  const page = Math.max(1, intParam(p, 'page', 1));
  const perPage = Math.max(1, intParam(p, 'perPage', 20));
  const base = scope(p, 'dateFrom', 'dateTo', c).filter((l) => {
    if (search) {
      const hay = [l.seed.customerName, `P${pad(l.seed.prospectId, 5)}`, `LD-26-${pad(l.n, 5)}`, digits(l.seed.phone)].join(' ').toLowerCase();
      if (!hay.includes(search)) return false;
    }
    if (employee && String(ownerOf(l)?.id ?? '') !== employee) return false;
    if (group > 0 && l.group?.id !== group) return false;
    return true;
  });
  const shown = base.filter((l) => closed(kindOf(l, c)) === showClosed);
  const order = (a: LeadM, b: LeadM): number => (sortBy === 'txdate_asc' ? -byDateDesc(a, b) : sortBy === 'id_asc' ? a.n - b.n : sortBy === 'id_desc' ? b.n - a.n : byDateDesc(a, b));
  const rows = [...shown].sort(order);
  const totalPages = Math.max(1, Math.ceil(rows.length / perPage));
  const mt = str(p, 'movementTypeId');
  const product = PRODUCTS.find((x) => String(x.id) === mt);
  const count = (k: Kind) => base.filter((l) => kindOf(l, c) === k).length;
  return {
    status: 200,
    body: {
      id: product?.id ?? 0,
      activityGroupId: group,
      usesWorkflowStep: product ? product.usesWorkflowStep : true,
      statusSummary: { total: base.length, new: count('NEW'), success: count('SUCCESS'), lost: count('LOST'), inactive: count('INACTIVE'), active: { total: count('HOT') + count('WARM') + count('COLD'), hot: count('HOT'), warm: count('WARM'), cold: count('COLD') } },
      wfStepSummary: (product ? product.groups : SEED_GROUPS).map((g) => ({ id: g.id, code: g.code, name: g.name, count: base.filter((l) => l.group?.id === g.id).length })),
      leads: { items: rows.slice((page - 1) * perPage, page * perPage).map((l) => itemOf(l, c)), meta: { page, perPage, total: rows.length, totalPages } },
    },
  };
}

/* ================================================================================== the data of the work modal */
function workModalData(c: Ctx): WorkModalData {
  const asModalEmp = (e: Emp): WorkModalEmployee => ({ id: e.id, code: e.code, name: e.name, attachFile: '' });
  return {
    employees: (saleGroupId) => EMPLOYEES.filter((e) => !saleGroupId || String(e.saleGroupId) === saleGroupId).map(asModalEmp),
    employeesByActivityGroup: (gid) => {
      const idx = SEED_GROUPS.findIndex((g) => String(g.id) === gid);
      // who works a group: every other employee, shifted by the group (at least four per group)
      return idx < 0 ? [] : EMPLOYEES.filter((_, i) => (i + idx) % 2 === 0).map(asModalEmp);
    },
    activityGroups: (mt) => PRODUCTS.find((p) => String(p.id) === mt)?.groups.map((g) => ({ id: g.id, code: g.code, name: g.name })) ?? null,
    leadStep: (id, agid) => {
      const l = state().byId.get(Number(id));
      if (!l) return { status: 404, body: leadError(404, msg('ไม่พบข้อมูล Lead')) };
      if (l.n % 53 === 0) return { status: 500, body: leadError(500, msg('ระบบขัดข้อง ไม่สามารถโหลดข้อมูล Lead ได้ (จำลอง)')) };
      const g = (agid && l.group && String(l.group.id) === agid ? l.group : null) ?? l.group;
      // LeadDetailServlet answers the `result` of GET /leads/{id} itself (no envelope)
      return { status: 200, body: { id: l.n, leadStatus: kindOf(l, c), currentStep: { procedureGroupId: g?.id ?? 0, procedureGroupName: g?.name ?? '', procedureName: l.step } } };
    },
    addSchedule: (b) => {
      const lead = state().byId.get(Number(b['leadId']));
      const bad = (message: string): ScheduleEnvelope => ({ status: 400, message, error: { code: 400, message } });
      if (!lead) return bad(msg('ไม่พบ Lead ที่ระบุ'));
      if (!String(b['subject'] ?? '').trim()) return bad(msg('subject ต้องไม่ว่าง'));
      if (String(b['subject']).includes('~fail')) return bad(msg('จำลองข้อผิดพลาดจาก backend (subject มี ~fail)'));
      if (!String(b['detail'] ?? '').trim()) return bad(msg('detail ต้องไม่ว่าง'));
      if (!/^\d{4}-\d{2}-\d{2}$/.test(String(b['date'] ?? ''))) return bad(msg('date รูปแบบไม่ถูกต้อง (yyyy-MM-dd)'));
      if (b['type'] !== 'APPOINTMENT' && b['type'] !== 'TASK') return bad(msg('type ต้องเป็น APPOINTMENT หรือ TASK'));
      if (lead.group && !(Number(b['procedureGroupId']) > 0)) return bad(msg('ต้องระบุ procedureGroupId เพราะ Lead นี้มีขั้นตอน workflow ที่ทำงานอยู่'));
      const id = ++state().seq;
      state().added.push({
        id,
        kind: b['type'] === 'APPOINTMENT' ? 'appointment' : 'task',
        leadId: lead.n,
        subject: String(b['subject']).trim(),
        detail: String(b['detail']).trim(),
        date: String(b['date']),
        time: b['allDay'] ? null : b['time'] ? `${String(b['time'])}:00`.replace(/^(\d\d:\d\d):00:00$/, '$1:00') : null,
        allDay: !!b['allDay'],
        status: String(b['status'] ?? 'scheduled'),
        groupId: Number(b['procedureGroupId']) || groupOf(lead),
      });
      save();
      return { status: 201, message: 'success', result: { id } };
    },
    editSchedule: (id, b) => {
      if (String(b['subject'] ?? '').includes('~fail')) return { status: 400, message: 'จำลองข้อผิดพลาดจาก backend (subject มี ~fail)', error: { code: 400, message: 'จำลองข้อผิดพลาดจาก backend (subject มี ~fail)' } };
      const patch: Partial<Sched> = {};
      if (b['subject'] != null) patch.subject = String(b['subject']);
      if (b['detail'] != null) patch.detail = String(b['detail']);
      if (b['date'] != null) patch.date = String(b['date']);
      if ('time' in b) patch.time = b['time'] ? String(b['time']) : null;
      if (b['allDay'] != null) patch.allDay = !!b['allDay'];
      if (b['status'] != null) patch.status = String(b['status']);
      const added = state().added.find((s) => s.id === id);
      if (added) {
        Object.assign(added, patch);
        save();
        return { status: 200, message: 'success' };
      }
      if (id >= 900_000_000 && id < 901_000_000) {
        state().overrides.set(id, { ...(state().overrides.get(id) ?? {}), ...patch });
        save();
        return { status: 200, message: 'success' };
      }
      return { status: 404, message: 'ไม่พบนัดหมาย/งาน', error: { code: 404, message: 'ไม่พบนัดหมาย/งาน' } };
    },
  };
}
const leadError = (status: number, message: string) => ({ status, message, error: { code: status, message } });

/* ================================================================================== the servlet layer */
const json = (status: number, body: unknown): MockReply => ({ status, body });
const body = (raw: string | undefined): Record<string, any> | null => {
  try {
    const v = JSON.parse(raw ?? '');
    return v && typeof v === 'object' ? v : null;
  } catch {
    return null;
  }
};
const master = (rows: readonly { id: number; code: string; name: string }[]): unknown[] => rows.map((r) => ({ id: r.id, code: r.code, name: r.name, nameTh: r.name, colorCode: '', attachFile: '', postCode: '' }));

/** the servlet layer: BFF URL → answer */
export function handleHomeRequest(method: string, input: string, rawBody: string | undefined, c: Ctx): MockReply {
  const { path, params } = parseBffUrl(input);
  const m = method.toUpperCase();
  switch (path) {
    case 'dashboardapi': {
      // DashboardApiServlet: the envelope of the service as it is; an exception → 500 {"message":"internal error"}
      const action = str(params, 'action');
      if (action === 'summary') {
        if (c.config.failSummary) return json(500, { message: 'internal error' });
        return json(200, { status: 200, message: 'success', result: summary(params, c) });
      }
      if (action === 'schedules') {
        if (c.config.failSchedules) return json(500, { message: 'internal error' });
        return json(200, { status: 200, message: 'success', result: schedules(params, c) });
      }
      return json(400, { message: 'unknown action' });
    }
    case 'board/movement-types':
      if (c.config.failProducts) return json(500, []);
      return json(200, c.config.noProducts ? [] : PRODUCTS.map((p) => ({ id: p.id, code: p.code, name: p.name, usesWorkflowStep: p.usesWorkflowStep })));
    case 'board/leads': {
      // LeadsBoardServlet: no CRM_Lead_View = "[]", the service is not called
      if (!c.can('CRM_Lead_View')) return json(200, []);
      if (c.config.failLeads) return json(500, []);
      if (c.config.failLeadsOnce) {
        const key = (params.get('page') ?? '1') + '|' + (params.get('movementTypeId') ?? '');
        if (!state().refused.has(key)) {
          state().refused.add(key);
          return json(500, []);
        }
      }
      if (str(params, 'search').includes('~500')) return json(500, []);
      const r = leadsReply(params, c);
      return json(r.status, r.body);
    }
    case 'board/lead-assign': {
      if (m !== 'POST') return json(405, { error: 'method not allowed' });
      const b = body(rawBody);
      if (!b) return json(400, { error: 'body required' });
      if (c.config.assign500) return json(500, { error: 'ระบบขัดข้อง' });
      const lead = state().byId.get(Number(b['leadId']));
      if (!lead) return json(404, { status: 404, message: 'ไม่พบ Lead', error: { code: 404, message: 'ไม่พบ Lead' } });
      const emp = EMPLOYEES.find((e) => e.id === Number(b['employeeId']));
      if (!emp) return json(400, { status: 400, message: 'Validation error', error: { code: 400, message: 'employeeId ไม่ถูกต้อง' } });
      if (emp.code === REFUSED_EMPLOYEE) return json(400, { status: 400, message: 'Validation error', error: { code: 400, message: REFUSED_MESSAGE } });
      lead.assigned = {
        employeeId: emp.id,
        ...(b['saleGroupId'] ? { saleGroupId: Number(b['saleGroupId']) } : {}),
        ...(b['salePersonId'] ? { salePersonId: Number(b['salePersonId']) } : {}),
      };
      save();
      return json(200, { status: 200, message: 'success' });
    }
    case 'board/sale-groups':
      return json(200, master(SALE_GROUPS));
    case 'board/sale-persons': {
      const g = str(params, 'saleGroupId');
      return json(
        200,
        SALE_PERSONS.filter((s) => !g || String(s.saleGroupId) === g).map((s) => ({
          id: s.id,
          code: s.code,
          name: s.name,
          nameTh: s.name,
          colorCode: '',
          attachFile: '',
          postCode: '',
          employee: { id: s.employee.id, code: s.employee.code, name: s.employee.name, nameTh: s.employee.name },
        })),
      );
    }
    case 'board/employees': {
      if (c.config.employeesEmpty) return json(200, []);
      const g = str(params, 'saleGroupId');
      return json(200, master(EMPLOYEES.filter((e) => !g || String(e.saleGroupId) === g)));
    }
    case 'board/chat-master-data':
      return params.get('type') === 'countries' ? json(200, { status: 200, result: MOCK_COUNTRIES }) : json(200, { status: 200, result: [] });
    default: {
      const r = handleWorkModalRequest(m, path, params, rawBody, workModalData(c));
      return r ?? json(404, { error: 'not mocked: ' + path });
    }
  }
}

/* ================================================================================== the backend */
const abortError = (): Error => new DOMException('The operation was aborted.', 'AbortError');

/** waits `ms`, or throws the AbortError of fetch() as soon as the signal fires (the page cancels the requests of a filter it replaced) */
function wait(ms: number, signal: AbortSignal | null | undefined): Promise<void> {
  if (signal?.aborted) return Promise.reject(abortError());
  return new Promise((resolve, reject) => {
    const onAbort = () => {
      clearTimeout(timer);
      reject(abortError());
    };
    const timer = setTimeout(() => {
      signal?.removeEventListener('abort', onAbort);
      resolve();
    }, ms);
    signal?.addEventListener('abort', onAbort, { once: true });
  });
}

/** The BFF contract of the page, answered from the seed (`mock: true`). */
export function createMockHome(options: MockHomeOptions = {}): HomeBackend {
  const delay = options.delayMs ?? 150;
  const can = options.can ?? (() => true);
  const viewer: OpportunityViewer | undefined =
    options.employeeId === undefined
      ? undefined
      : { employeeCode: employeeCodeOfId(options.employeeId), seesAll: ['VIEW_ALL', 'MASTER_EDIT_ALL', 'TRANSACTION_EDIT_ALL'].some((k) => can(k)) };
  const config = (): MockHomeConfig => {
    if (options.config) return options.config;
    try {
      return JSON.parse(store.get(CONFIG_KEY) ?? '{}') as MockHomeConfig;
    } catch {
      return {};
    }
  };
  return {
    async fetch(input: string, init?: RequestInit): Promise<Response> {
      const cfg = config();
      const url = String(input);
      const isLeads = /board\/leads(?:\?|$)/.test(url);
      await wait((cfg.delayMs ?? delay) + (isLeads ? (cfg.leadsExtraMs ?? 120) : 0), init?.signal);
      const raw = typeof init?.body === 'string' ? init.body : undefined;
      return toResponse(handleHomeRequest(init?.method ?? 'GET', url, raw, { can, config: cfg, viewer }));
    },
  };
}
