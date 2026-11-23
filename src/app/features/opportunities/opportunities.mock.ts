/**
 * Deterministic fake backend of the Opportunities page (Board + List) — dev (`mock: true`), tests and the Java-vs-Angular comparison.
 *
 * It answers in exactly the shapes the servlets of the Java page gave (`/board/leads` = the `result` of triplesale-service `/leads`,
 * `/board/master/movement-types` = the raw envelope, the master lists as plain arrays, `/board/filter-state` = the HttpSession of
 * the Java app, `/board/contact-activities` = the move-step modal) and keeps the kanban, the list, the numbers on top and the
 * filters consistent: every answer is computed from ONE set of leads — `seedLead(n)` of the shared cast, so the lead you see here
 * is the lead the detail page opens — dealt to four products. Filtering, searching, sorting, paging per column and moving a card
 * between columns really work.
 *
 * What the mock decides where the Java servlets only forward to the backend (the real rules live in triplesale-service; listed in
 * INTEGRATION.md): `showClosed=false` = open leads only (NEW · INACTIVE · HOT · WARM · COLD), `true` = closed ones (SUCCESS · LOST);
 * the numbers on top ignore showClosed / activeStatus (they are the overview of the filtered set); the default workflow group is
 * the first of the product.
 *
 * Mock-only switches (the comparison harness and the tests use them): `config` — `{ noProducts, failLeads, emptyBoard }` — from the
 * options or from sessionStorage `ts.mock.leads.config`; a move-step note that is exactly `!fail` is answered with 500.
 *
 * Framework-free on purpose (no Angular imports): the comparison harness loads this file in Node.
 */
import { canSeeOpportunity, employeeCodeOfId } from '@core/mock/org-chart';
import { reference } from '@core/mock/reference';
import { SEED_EMPLOYEES, SEED_GROUPS, SEED_PROVINCES, SEED_TODAY, leadIds, prospectIds, seedHash, seedLead, seedProspect, type SeedLead } from '@core/mock/crm-seed';
import { sharedDbVersion, upsertSharedLead } from '@core/mock/shared-db';
import { closingOutcome, stepProbability } from '@core/mock/step-probability';
import { isInQueue } from '@core/mock/waitlist';
import type { OpportunitiesBackend, OpportunitiesInitial } from './opportunities-backend';

export { SEED_TODAY as MOCK_TODAY };

export interface MockLeadsConfig {
  /** `/board/master/movement-types` answers no product (the page hides the product / group dropdowns and shows its empty state) */
  noProducts?: boolean;
  /** `/board/leads` answers 500 */
  failLeads?: boolean;
  /** `/board/leads` answers `[]` with status 200 — what the servlet gave when triplesale-service failed (the live mode of the comparison plays a failing service with it) */
  blankLeads?: boolean;
  /** `/board/leads?viewMode=board` answers a result with no column at all */
  emptyBoard?: boolean;
  /** the server never gives more than this many items per page, whatever `perPage` asks (short columns that need the auto-fill / "load more") */
  maxPerPage?: number;
  /** ms every answer is delayed, instead of `delayMs` of the options (a slow network: the skeleton stays on screen) */
  delayMs?: number;
  /** with delayMs: only the answers of /board/leads are delayed (the master lists are not). The Java replica is served over HTTP/1.1 — six connections: with six answers held back for seconds the images of its stylesheet queue behind them and the load event is late, so a dump meant to show the skeleton came after the data (a flaky scenario) */
  delayLeadsOnly?: boolean;
}

export interface MockLeadsOptions {
  /** ms every answer is delayed (default 150: a network) */
  delayMs?: number;
  /** `hasFeature(key)` of the signed-in user. Default: everything */
  can?: (feature: string) => boolean;
  /** the employee id of the session (`ss_employee_id`); the owner rule of the move-step modal needs it. Default 1001 (the demo account) */
  employeeId?: number;
  /** the UI language (Java: `I18n.fromSession`): English shows English place names. Default th */
  lang?: () => 'th' | 'en';
  config?: MockLeadsConfig;
}

/* ================================================================================== the cast */
export const MOCK_PRODUCTS = reference('opportunities.products', [
  { id: 31, code: 'LD-WFS-A', name: 'ผลิตภัณฑ์ A (มี WorkFlow Step)', groups: [101, 102, 103, 104, 105] },
  { id: 32, code: 'LD-WFS-B', name: 'ผลิตภัณฑ์ B (มี WorkFlow Step)', groups: [101, 106, 107] },
  { id: 33, code: 'LD-NWF-C', name: 'ผลิตภัณฑ์ C (ไม่มี WorkFlow Step)', groups: [] as number[] },
  { id: 34, code: 'LD-WFS-D', name: 'ผลิตภัณฑ์ D (กลุ่มเดียว)', groups: [101] },
] as const);
type Product = (typeof MOCK_PRODUCTS)[number];

interface Step {
  id: number;
  code: string;
  name: string;
}
/** the steps (kanban columns) of each workflow group; id = group id * 10 + position */
const GROUP_STEPS: Record<number, string[]> = reference('opportunities.groupSteps', {
  101: ['รับลีดใหม่', 'โทรติดต่อลูกค้า', 'นัดหมายพบลูกค้า', 'ส่งต่อทีมวิเคราะห์'],
  102: ['ตรวจสอบเอกสาร', 'วิเคราะห์ความเสี่ยง', 'สรุปผลวิเคราะห์'],
  103: ['เสนอผลิตภัณฑ์', 'ต่อรองเงื่อนไข', 'ยืนยันผลิตภัณฑ์', 'รออนุมัติ'],
  104: ['จัดทำสัญญา', 'รอลงนาม', 'ตรวจสอบหลังลงนาม'],
  105: ['ตรวจสอบวงเงิน', 'เตรียมโอนเงิน', 'โอนเงิน'],
  106: ['ตรวจสอบนิติกรรม', 'จดทะเบียน'],
  107: ['ติดตามหลังขาย', 'สำรวจความพึงพอใจ'],
});
const stepsOfGroup = (groupId: number): Step[] =>
  (GROUP_STEPS[groupId] ?? []).map((name, i) => ({ id: groupId * 10 + i + 1, code: `${SEED_GROUPS.find((g) => g.id === groupId)?.code ?? 'G'}${String(i + 1).padStart(2, '0')}`, name }));
/** the product without a workflow: one pipeline, 55 % / 30 % / 15 % of its leads */
const PIPELINE: Step[] = reference('opportunities.pipelineNames', ['ลีดใหม่', 'ติดตามลูกค้า', 'เสนอราคา']).map((name, i) => ({ id: 2001 + i, code: `PL0${i + 1}`, name }));
const usesWorkflow = (p: Product): boolean => p.groups.length > 0;
const stepsOf = (p: Product, groupId: number | null): Step[] => (usesWorkflow(p) ? stepsOfGroup(groupId ?? p.groups[0]) : PIPELINE);

export const MOCK_TAGS = reference('opportunities.tags', [
  { id: 1, code: 'VIP', name: 'VIP', colorCode: '#EB5050', inItem: true },
  { id: 2, code: 'HOT-DEAL', name: 'ดีลร้อน', colorCode: '#FF8E4E', inItem: true },
  { id: 3, code: 'FOLLOW', name: 'ติดตามด่วน', colorCode: '#4B84FF', inItem: true },
  { id: 4, code: 'DOC', name: 'รอเอกสาร', colorCode: '#80E8FF', inItem: true }, // a pastel: TagPillColor darkens the text
  { id: 5, code: 'REFER', name: 'ผู้แนะนำ', colorCode: '#6043B6', inItem: false }, // the lead item has no colour: it comes with the master data later
  { id: 6, code: 'GENERAL', name: 'ทั่วไป', colorCode: '', inItem: false }, // no colour anywhere: the default pill
] as const);

export const MOCK_SALE_GROUPS = reference('opportunities.saleGroups', [
  { id: 11, code: 'TEAM-A', name: 'ทีม A' },
  { id: 12, code: 'TEAM-B', name: 'ทีม B' },
] as const);

/** employee `E1xx` has the id `1000 + xx`: E101 is 1001, the id of the demo account */
const empId = (code: string): number => 1000 + Number(code.slice(2));

interface Place {
  id: number;
  code: string;
  th: string;
  en: string;
  districts: { id: number; code: string; th: string; en: string }[];
}
// The English names are what the servlet gave in an English UI: `MasterDataI18n` (masterdata_en.properties = public/assets/i18n/master-data.en.json)
// by the code of the place — `province.<code>` for the 6 provinces below, `district.<code>` for the Bangkok districts (BKK_01 …). The dictionary has
// no entry for the districts of the other provinces, so there the Thai name stays in English too (the servlet's fallback). The live backend
// translates with the same dictionary, which is why the comparison of the live mode can be identical.
const PLACES: Place[] = reference('opportunities.places', [
  { id: 1, code: 'BKK', th: 'กรุงเทพมหานคร', en: 'Bangkok', districts: [{ id: 101, code: 'BKK_01', th: 'พระนคร', en: 'Phra Nakhon District' }, { id: 102, code: 'BKK_04', th: 'บางรัก', en: 'Bang Rak District' }, { id: 103, code: 'BKK_30', th: 'จตุจักร', en: 'Chatuchak District' }] },
  { id: 2, code: 'CMI', th: 'เชียงใหม่', en: 'Chiang Mai', districts: [{ id: 201, code: 'CMI-MU', th: 'เมืองเชียงใหม่', en: 'เมืองเชียงใหม่' }, { id: 202, code: 'CMI-SR', th: 'สารภี', en: 'สารภี' }] },
  { id: 3, code: 'KKN', th: 'ขอนแก่น', en: 'Khon Kaen', districts: [{ id: 301, code: 'KKN-MU', th: 'เมืองขอนแก่น', en: 'เมืองขอนแก่น' }, { id: 302, code: 'KKN-BP', th: 'บ้านไผ่', en: 'บ้านไผ่' }] },
  { id: 4, code: 'PKT', th: 'ภูเก็ต', en: 'Phuket', districts: [{ id: 401, code: 'PKT-MU', th: 'เมืองภูเก็ต', en: 'เมืองภูเก็ต' }, { id: 402, code: 'PKT-KT', th: 'กะทู้', en: 'กะทู้' }] },
  { id: 5, code: 'CBI', th: 'ชลบุรี', en: 'Chonburi', districts: [{ id: 501, code: 'CBI-MU', th: 'เมืองชลบุรี', en: 'เมืองชลบุรี' }, { id: 502, code: 'CBI-SR', th: 'ศรีราชา', en: 'ศรีราชา' }] },
  { id: 6, code: 'NMA', th: 'นครราชสีมา', en: 'Nakhon Ratchasima', districts: [{ id: 601, code: 'NMA-MU', th: 'เมืองนครราชสีมา', en: 'เมืองนครราชสีมา' }, { id: 602, code: 'NMA-PC', th: 'ปากช่อง', en: 'ปากช่อง' }] },
]);
// the province of the seed is one of SEED_PROVINCES (same order): the table above should agree (both come from the shared Datasource: edit them together)
if (PLACES.some((p, i) => p.th !== SEED_PROVINCES[i])) console.warn('ref.opportunities.json › places and seed.org.json › names.provinces disagree (same provinces, same order): the province of a customer may have no district');

const DEMANDS = reference('opportunities.demands', ['ขอสินเชื่อเพื่อซื้อรถยนต์', 'ต้องการรีไฟแนนซ์บ้าน', 'ขยายกิจการร้านค้า', 'ซื้อบ้านหลังแรก', '', 'ต้องการเงินทุนหมุนเวียน', 'สอบถามอัตราดอกเบี้ย']);
const STATUS_RANK: Record<string, number> = { NEW: 0, HOT: 1, WARM: 2, COLD: 3, INACTIVE: 4, SUCCESS: 5, LOST: 6 };

interface Lead {
  n: number;
  seed: SeedLead;
  product: Product;
  /** the workflow group (null: the product has none) and the step as the cast has them — a move changes `pos` */
  group: number | null;
  step: number;
  /** HOT · WARM · COLD · NEW · INACTIVE · SUCCESS · LOST: the badge */
  badge: string;
  place: Place;
  district: Place['districts'][number];
  foreign: boolean;
  tags: number[];
  accessors: string[];
  salePerson: string;
  txDate: string;
  updatedAt: string;
}

function build(n: number): Lead {
  const seed = seedLead(n);
  const roll = seedHash(n, 21) % 100;
  // a company of the Seed Workbook has as many products (pipelines) as it has: the four of the formulas wrap round
  const product = MOCK_PRODUCTS[(roll < 35 ? 0 : roll < 60 ? 1 : roll < 90 ? 2 : 3) % MOCK_PRODUCTS.length];
  let group: number | null = null;
  let step: number;
  if (usesWorkflow(product)) {
    group = (product.groups as readonly number[]).includes(seed.groupId) ? seed.groupId : product.groups[seed.groupIdx % product.groups.length];
    const steps = stepsOfGroup(group);
    step = steps[seedHash(n, 22) % steps.length].id;
  } else {
    const r = seedHash(n, 23) % 100;
    step = PIPELINE[r < 55 ? 0 : r < 85 ? 1 : 2].id;
  }
  const place = PLACES.find((p) => p.th === seed.province) ?? PLACES[0];
  const tagCount = seedHash(n, 24) % 4;
  const tags: number[] = [];
  for (let i = 0; i < tagCount; i++) {
    const t = MOCK_TAGS[(seedHash(n, 25) + i * 2 + i) % MOCK_TAGS.length].id;
    if (!tags.includes(t)) tags.push(t);
  }
  const accessorCount = seedHash(n, 26) % 7; // 0 … 6: none, a few, more than the 3 the card shows
  const start = seedHash(n, 27) % SEED_EMPLOYEES.length;
  const accessors = Array.from({ length: accessorCount }, (_, i) => SEED_EMPLOYEES[(start + i) % SEED_EMPLOYEES.length].code);
  const team = SEED_EMPLOYEES.find((e) => e.code === seed.ownerCode)?.team;
  const mates = SEED_EMPLOYEES.filter((e) => e.team === team);
  const hh = String(8 + (seedHash(n, 28) % 10)).padStart(2, '0');
  const mm = String(seedHash(n, 29) % 60).padStart(2, '0');
  return {
    n,
    seed,
    product,
    group,
    step,
    badge: seed.interest,
    place,
    district: place.districts[seedHash(n, 30) % place.districts.length],
    foreign: n % 13 === 0,
    tags,
    accessors,
    salePerson: mates[seedHash(n, 31) % mates.length].name,
    txDate: seed.createdDate,
    updatedAt: `${seed.lastContactDate} ${hh}:${mm}:00`,
  };
}
let leadsAt = -1;
let leadsCache: Lead[] = [];
/** the leads now: the cast and the ones the user opened, from the customers as they are now (rebuilt when the shared database changes) */
function currentLeads(): Lead[] {
  if (leadsAt !== sharedDbVersion()) {
    leadsCache = leadIds().map((n) => build(n));
    leadsAt = sharedDbVersion();
  }
  return leadsCache;
}
const isClosed = (l: Lead): boolean => l.badge === 'SUCCESS' || l.badge === 'LOST';

/* ================================================================================== state (what the Java HttpSession / the backend remember) */
interface State {
  /** lead id → where a move-step put it */
  moved: Record<number, { group: number | null; step: number }>;
  /** the JSON text POSTed to /board/filter-state (HttpSession["ld_filter_state"]) */
  filterState: string | null;
}
const STATE_KEY = 'ts.mock.leads.state';
const CONFIG_KEY = 'ts.mock.leads.config';
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
function loadState(): State {
  try {
    const raw = store.get(STATE_KEY);
    if (raw) return { moved: {}, filterState: null, ...(JSON.parse(raw) as Partial<State>) };
  } catch {
    /* damaged: start again */
  }
  return { moved: {}, filterState: null };
}
const saveState = (s: State): void => store.set(STATE_KEY, JSON.stringify(s));

/** back to the cast as seeded (tests, the comparison harness) */
export function resetMockLeads(): void {
  mem.clear();
  store.set(STATE_KEY, null);
  store.set(CONFIG_KEY, null);
}

/* ================================================================================== the backend */
const json = (body: unknown, status = 200): Response =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json; charset=UTF-8' } });
const sleep = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms));

export function createMockLeads(options: MockLeadsOptions = {}): OpportunitiesBackend {
  const delayMs = options.delayMs ?? 150;
  const can = options.can ?? (() => true);
  const me = options.employeeId ?? 1001;
  // เห็นของตนและของลูกทีมตามผังองค์กรจำลอง · เห็นทั้งบริษัทเมื่อมีสิทธิ์ `*` / VIEW_ALL / *_EDIT_ALL (ค่าเริ่มต้นของ `can` = ทุกอย่าง)
  const viewer = { employeeCode: employeeCodeOfId(me), seesAll: ['VIEW_ALL', 'MASTER_EDIT_ALL', 'TRANSACTION_EDIT_ALL'].some((k) => can(k)) };
  const lang = options.lang ?? (() => 'th' as const);
  const config = (): MockLeadsConfig => {
    if (options.config) return options.config;
    try {
      return JSON.parse(store.get(CONFIG_KEY) ?? '{}') as MockLeadsConfig;
    } catch {
      return {};
    }
  };
  const state = loadState();

  const where = (l: Lead): { group: number | null; step: number } => state.moved[l.n] ?? { group: l.group, step: l.step };
  const place = (l: Lead) => (lang() === 'en' ? { city: l.place.en, district: l.district.en } : { city: l.place.th, district: l.district.th });

  /* ---- one lead as /board/leads gives it (LeadListItemResDTO) ---- */
  function item(l: Lead): Record<string, unknown> {
    const s = l.seed;
    const at = where(l);
    const g = at.group === null ? null : SEED_GROUPS.find((x) => x.id === at.group) ?? null;
    const stepName = stepsOf(l.product, at.group).find((x) => x.id === at.step)?.name ?? '';
    const emp = SEED_EMPLOYEES.find((e) => e.code === s.ownerCode)!;
    const team = MOCK_SALE_GROUPS.find((t) => t.name === emp.team)!;
    const active = l.badge === 'HOT' || l.badge === 'WARM' || l.badge === 'COLD';
    const jp = l.foreign;
    const p = place(l);
    const queued = isInQueue('opportunity', l.n);
    return {
      id: l.n,
      txNo: `LD-26-${String(l.n).padStart(5, '0')}`,
      txDate: l.txDate,
      movementTypeId: l.product.id,
      movementTypeCode: l.product.code,
      prospectId: s.prospectId,
      prospectCode: seedProspect(s.prospectId).code,
      prospectName: s.customerName,
      prospectAvatar: '',
      prospectTel: s.phone.replace(/\D/g, ''),
      phoneCountryCode: jp ? '+81' : l.n % 11 === 0 ? null : '+66',
      countryCode: jp ? 'JPN' : l.n % 11 === 0 ? null : 'THA',
      currentCityCode: jp ? '' : l.place.code,
      currentCityName: jp ? '' : p.city,
      currentDistrictCode: jp ? '' : l.district.code,
      currentDistrictName: jp ? '' : p.district,
      currentCountryCode: jp ? 'JPN' : 'THA',
      currentCountryName: jp ? (lang() === 'en' ? 'Japan' : 'ญี่ปุ่น') : lang() === 'en' ? 'Thailand' : 'ไทย',
      amount: s.amount,
      leadStatus: active ? 'ACTIVE' : l.badge,
      activeStatus: active ? l.badge : '',
      forwardStatus: g ? `${g.name} - ${stepName}` : stepName,
      activityGroupId: at.group,
      activityGroupName: g?.name ?? null,
      procedureGroupId: at.group,
      saleGroupId: team.id,
      saleGroupName: team.name,
      salePersonName: l.salePerson,
      // an opportunity in the queue has no owner until somebody takes it (design 6.5): the card shows "-"
      employeeId: queued ? null : empId(s.ownerCode),
      employeeCode: queued ? '' : s.ownerCode,
      employeeName: queued ? '' : s.ownerName,
      unassigned: queued,
      lastUpdatedAt: l.updatedAt,
      leadDemand: DEMANDS[l.n % DEMANDS.length],
      tags: l.tags.map((id) => {
        const t = MOCK_TAGS.find((x) => x.id === id)!;
        return t.inItem ? { id: t.id, code: t.code, name: t.name, colorCode: t.colorCode } : { id: t.id, code: t.code, name: t.name };
      }),
      accessors: l.accessors.map((code) => {
        const e = SEED_EMPLOYEES.find((x) => x.code === code)!;
        return { id: empId(code), code, name: e.name, type: 'EMPLOYEE', attachFile: '' };
      }),
      assigneeAvatars: [],
    };
  }

  /* ---- /board/leads ---- */
  function leads(q: URLSearchParams): Response {
    if (!can('CRM_Lead_View')) return json([]); // LeadsBoardServlet: no role = "[]", no call to the backend
    if (config().failLeads) return json([], 500);
    if (config().blankLeads) return json([]);
    const mode = q.get('viewMode') === 'list' ? 'list' : 'board';
    const product = MOCK_PRODUCTS.find((p) => String(p.id) === q.get('movementTypeId')) ?? MOCK_PRODUCTS[0];
    const num = (k: string): number | null => {
      const v = q.get(k);
      return v !== null && v !== '' && !Number.isNaN(Number(v)) ? Number(v) : null;
    };
    const page = Math.max(1, num('page') ?? 1);
    const perPage = Math.min(Math.max(1, num('perPage') ?? 20), config().maxPerPage ?? Infinity);
    const search = (q.get('search') ?? '').trim().toLowerCase();
    const showClosed = q.get('showClosed') === 'true';
    const activeStatus = q.get('activeStatus') ?? '';
    const from = q.get('dateFrom') ?? '';
    const to = q.get('dateTo') ?? '';
    const province = num('provinceId');
    const district = num('districtId');
    const saleGroup = num('saleGroupId');
    const employee = num('employeeId');
    const tagIds = (q.get('tagIds') ?? '').split(',').filter(Boolean).map(Number);
    const sortBy = q.get('sortBy') ?? 'txdate_desc';
    const groupParam = num('activityGroupId');
    const stepParam = num('activityStepId');

    // the set the filters of the dialog and the search box describe …
    const base = currentLeads().filter((l) => {
      if (l.product !== product) return false;
      if (!canSeeOpportunity(viewer, l.seed.ownerCode)) return false;
      if (search) {
        const s = l.seed;
        const hay = [s.customerName, seedProspect(s.prospectId).code, `LD-26-${String(l.n).padStart(5, '0')}`, s.phone.replace(/\D/g, ''), s.ownerName].join(' ').toLowerCase();
        if (!hay.includes(search)) return false;
      }
      if (from && to && (l.txDate < from || l.txDate > to)) return false;
      if (province !== null && l.place.id !== province) return false;
      if (district !== null && l.district.id !== district) return false;
      if (saleGroup !== null && MOCK_SALE_GROUPS.find((t) => t.name === SEED_EMPLOYEES.find((e) => e.code === l.seed.ownerCode)?.team)?.id !== saleGroup) return false;
      if (employee !== null && empId(l.seed.ownerCode) !== employee) return false;
      if (tagIds.length && !l.tags.some((t) => tagIds.includes(t))) return false;
      return true;
    });
    // … and the part of it the list / the columns show
    const shown = base.filter((l) => {
      if (isClosed(l) !== showClosed) return false;
      if (activeStatus && l.badge !== activeStatus) return false;
      return true;
    });
    const order = (a: Lead, b: Lead): number => {
      switch (sortBy) {
        case 'txdate_asc':
          return a.txDate.localeCompare(b.txDate) || a.n - b.n;
        case 'id_asc':
          return a.n - b.n;
        case 'id_desc':
          return b.n - a.n;
        case 'status':
          return STATUS_RANK[a.badge] - STATUS_RANK[b.badge] || a.n - b.n;
        default:
          return b.txDate.localeCompare(a.txDate) || b.n - a.n;
      }
    };
    const pageOf = <T>(all: T[]) => {
      const totalPages = Math.max(1, Math.ceil(all.length / perPage));
      return { items: all.slice((page - 1) * perPage, page * perPage), meta: { page, perPage, total: all.length, totalPages } };
    };

    const wf = usesWorkflow(product);
    // the group on show: the one asked for, else the first of the product; the list asks for 0 (= every group)
    const group = !wf ? null : mode === 'list' ? (groupParam && groupParam > 0 ? groupParam : 0) : product.groups.includes(groupParam as never) ? (groupParam as number) : product.groups[0];

    const inGroup = (l: Lead): boolean => !wf || !group || where(l).group === group;
    const overview = base.filter(inGroup);
    const count = (f: (l: Lead) => boolean) => overview.filter(f).length;
    const activeOf = (b: string) => count((l) => l.badge === b);
    const statusSummary = {
      total: overview.length,
      new: activeOf('NEW'),
      success: activeOf('SUCCESS'),
      lost: activeOf('LOST'),
      inactive: activeOf('INACTIVE'),
      active: { total: activeOf('HOT') + activeOf('WARM') + activeOf('COLD'), hot: activeOf('HOT'), warm: activeOf('WARM'), cold: activeOf('COLD') },
    };
    const result: Record<string, unknown> = {
      id: product.id,
      activityGroupId: wf ? group : null,
      usesWorkflowStep: wf,
      statusSummary,
      wfStepSummary: wf
        ? product.groups.map((gid) => {
            const g = SEED_GROUPS.find((x) => x.id === gid)!;
            return { id: gid, code: g.code, name: g.name, count: base.filter((l) => where(l).group === gid).length };
          })
        : [],
    };

    if (mode === 'list') {
      const rows = shown.filter((l) => inGroup(l) && (stepParam === null || where(l).step === stepParam)).sort(order);
      const p = pageOf(rows);
      result['leads'] = { items: p.items.map(item), meta: p.meta };
      return json(result);
    }
    if (config().emptyBoard) {
      result['kanban'] = [];
      return json(result);
    }
    const columns = stepsOf(product, group).filter((s) => stepParam === null || s.id === stepParam);
    result['kanban'] = columns.map((s) => {
      const rows = shown.filter((l) => inGroup(l) && where(l).step === s.id).sort(order);
      const p = pageOf(rows);
      return { stepId: s.id, stepCode: s.code, stepName: s.name, items: p.items.map(item), meta: p.meta };
    });
    return json(result);
  }

  /* ---- master data ---- */
  const master = (rows: readonly { id: number; code: string; name: string; colorCode?: string }[]) =>
    json(rows.map((r) => ({ id: r.id, code: r.code, name: r.name, nameTh: r.name, colorCode: r.colorCode ?? '', attachFile: '', postCode: '' })));

  /* ---- POST /board/contact-activities (the move-step modal) ---- */
  function contactActivity(init?: RequestInit): Response {
    let body: Record<string, unknown>;
    try {
      body = JSON.parse(String(init?.body ?? '')) as Record<string, unknown>;
    } catch {
      return json({ error: 'invalid json body' }, 400);
    }
    if (body['leadId'] === undefined || body['leadId'] === null) return json({ error: 'leadId required' }, 400);
    const lead = currentLeads().find((l) => String(l.n) === String(body['leadId']));
    if (!lead) return json({ status: 404, message: 'ไม่พบ Lead', error: { code: 404, message: 'ไม่พบ Lead' } }, 404);
    if (body['content'] === '!fail') return json({ status: 500, message: 'ระบบขัดข้อง', error: { code: 500, message: 'ระบบขัดข้อง กรุณาลองใหม่' } }, 500);
    // CRM_ContactActivity_Create needs the lead to be the user's own; the _Sup key goes past that
    const allowed = can('CRM_ContactActivity_Create_Sup') || (can('CRM_ContactActivity_Create') && empId(lead.seed.ownerCode) === me);
    if (!allowed) return json({ status: 403, message: 'ไม่มีสิทธิ์', error: { code: 403, message: 'ไม่มีสิทธิ์บันทึกการติดต่อของ Lead นี้' } }, 403);
    // a sold / lost opportunity is read-only, and one in the queue cannot be moved (design 4.1, 6.5)
    if (isClosed(lead)) return json({ status: 409, message: 'โอกาสขายที่ปิดแล้วเป็นแบบอ่านอย่างเดียว', error: { code: 409, message: 'โอกาสขายที่ปิดแล้วเป็นแบบอ่านอย่างเดียว' } }, 409);
    if (isInQueue('opportunity', lead.n)) return json({ status: 409, message: 'โอกาสขายอยู่ใน Wait List', error: { code: 409, message: 'โอกาสขายอยู่ใน Wait List — รับงานก่อนจึงจะทำรายการได้' } }, 409);
    const procedureId = body['procedureId'];
    if (procedureId !== null && procedureId !== undefined) {
      const group = body['procedureGroupId'] === undefined ? where(lead).group : Number(body['procedureGroupId']);
      const step = stepsOf(lead.product, group).find((s) => String(s.id) === String(procedureId));
      if (!step) return json({ status: 400, message: 'ขั้นตอนไม่ถูกต้อง', error: { code: 400, message: 'ขั้นตอนไม่อยู่ในกลุ่มขั้นตอนนี้' } }, 400);
      state.moved[lead.n] = { group: usesWorkflow(lead.product) ? group : null, step: step.id };
      saveState(state);
      // entering a step of 100% sells the opportunity, of 0% loses it — the system closes it, as on the detail page (design 6.3)
      const outcome = closingOutcome(stepProbability(step.name));
      if (outcome) upsertSharedLead(lead.n, { status: outcome, interest: outcome });
    }
    return json({ status: 201, message: 'success', result: { id: 9000 + lead.n } }, 201);
  }

  /* ---- the auto-complete card under the search box (ProspectListServlet) ---- */
  function prospects(q: URLSearchParams): Response {
    const text = (q.get('searchText') ?? '').trim().toLowerCase();
    const perPage = Math.max(1, Number(q.get('perPage') ?? 8) || 8);
    const rows = prospectIds().map((id) => seedProspect(id))
      .filter((p) => !text || [p.fullName, p.code, p.phone, p.province].join(' ').toLowerCase().includes(text))
      .slice(0, perPage)
      .map((p) => ({ id: p.id, code: p.code, name: p.fullName, phone: p.phone.replace(/\D/g, ''), addr: p.province, avatar: '' }));
    return json({ status: 200, message: 'success', result: { items: rows, meta: { page: 1, perPage, total: rows.length, totalPages: 1 } } });
  }

  function route(method: string, path: string, q: URLSearchParams, init?: RequestInit): Response {
    const key = `${method} ${path}`;
    switch (key) {
      case 'GET /board/leads':
        return leads(q);
      case 'GET /board/master/movement-types':
        return json({ status: 200, message: 'success', result: { items: config().noProducts ? [] : MOCK_PRODUCTS.map((p) => ({ id: p.id, code: p.code, name: p.name })) } });
      case 'GET /board/tags':
        return master(MOCK_TAGS);
      case 'GET /board/sale-groups':
        return master(MOCK_SALE_GROUPS);
      case 'GET /board/provinces':
        return master(PLACES.map((p) => ({ id: p.id, code: p.code, name: p.th })));
      case 'GET /board/employees':
        return master(SEED_EMPLOYEES.map((e) => ({ id: empId(e.code), code: e.code, name: e.name })));
      case 'GET /board/districts':
        return master((PLACES.find((p) => String(p.id) === q.get('provinceId'))?.districts ?? []).map((d) => ({ id: d.id, code: d.code, name: d.th })));
      case 'GET /board/filter-state':
        return new Response(state.filterState ?? 'null', { status: 200, headers: { 'Content-Type': 'application/json; charset=UTF-8' } });
      case 'POST /board/filter-state': {
        const body = String(init?.body ?? '').trim();
        if (body) {
          state.filterState = body;
          saveState(state);
        }
        return new Response(null, { status: 204 });
      }
      case 'POST /board/contact-activities':
        return contactActivity(init);
      case 'GET /board/prospect-list':
        return prospects(q);
      default:
        return json({ status: 501, message: `Mock backend: ${key} is not implemented` }, 501);
    }
  }

  return {
    async initial(): Promise<OpportunitiesInitial> {
      let saved: unknown = null;
      try {
        saved = state.filterState ? JSON.parse(state.filterState) : null;
      } catch {
        saved = null;
      }
      return { savedFilterJson: saved };
    },
    async fetch(input: string, init?: RequestInit): Promise<Response> {
      // '../board/leads?…' · '/triplesale/board/prospect-list?…' · 'http://host/triplesale/board/…' → '/board/…'
      const url = String(input).replace(/^https?:\/\/[^/]+/, '').replace(/#.*$/, '');
      const [rawPath, query = ''] = url.split('?');
      const path = '/' + rawPath.replace(/^(\.\.?\/)+/, '').replace(/^\/+/, '').replace(/^triplesale\//, '');
      const response = route((init?.method ?? 'GET').toUpperCase(), path, new URLSearchParams(query), init);
      const wait = config().delayMs ?? delayMs;
      if (wait > 0 && (!config().delayLeadsOnly || path === '/board/leads')) await sleep(wait);
      return response;
    },
  };
}
