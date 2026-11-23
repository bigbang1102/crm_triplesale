/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * Deterministic fake backend of the Activities page (dev / `mock: true`, tests and the Java-vs-Angular comparison).
 *
 * It answers the BFF URLs of the Java page (`../board/activity-list`, `../board/activity-detail`, `../board/contact-activities`,
 * `../board/lead-assign`, the master data of the filters, the product list, the work modal's schedule endpoints …) in exactly the
 * shapes the servlets answered. The numbers are computed, not typed: the leads come from the shared cast (`@core/mock/crm-seed`:
 * `seedLead(n)` — lead 17 here is lead 17 of every other page), their contact history / appointments / tasks are derived from it, and
 * the REST service `triplesale-service` is played by an `ActivitiesRest` over that data. The servlets' own work (the aggregation of the
 * list, the mapping of the detail) is NOT repeated here: `activities.bff.ts` — the port of `ContactActivityApiService` /
 * `LeadBoardView` — runs on top, so the totals, the channel counters of the parent rows, `meta.hasMore` and the history grouping are
 * computed by the same code the live adapter will use.
 *
 * What the backend of this mock does (so that every control of the page changes something real):
 *   - GET /contact-activities  filters by product, sale group, responsible employee (name substring), contact name (substring), last
 *     contact date range, assign date range; sorts by lastContactDate / prospectName; pages (0-based pageNo); `statusSummary` and
 *     `wfStepSummary` count the filtered set INCLUDING closed leads, `items` leave closed leads (SUCCESS / LOST) out unless
 *     showClosed=true — the behaviour the Java comments describe;
 *   - groupBy=group answers ONE row per lead (the current group) for a lead with several groups: the known fault of the real
 *     backend, which the BFF repairs from the contact history (ContactActivityApiService.topUpFromHistory);
 *   - POST contact-activities / lead-assign / schedule add / edit change the data; the page reads them back.
 *
 * Special inputs (the Java page cannot trigger them any other way): a search containing "~500" → the list servlet fails (HTTP 500);
 * the product "ผลิตภัณฑ์จำกัดสิทธิ์" → the backend refuses with HTTP 403 (the table prints the generic reason: Data_API.sendGET gave "" for any error); the product "ผลิตภัณฑ์ใหม่" has no lead;
 * lead ids divisible by 53 → GET /leads/{id} fails (500); a lead with several groups needs `activityGroupId` (400 otherwise);
 * a contact whose text contains "~fail" and a schedule whose subject contains "~fail" are refused by the backend (400 with a message).
 *
 * Framework-free on purpose (no Angular imports): the comparison harness loads this file in Node.
 */
import { productsCodec, msg, reference } from '@core/mock/reference';
import { MOCK_COUNTRIES } from '@core/http/mock-countries';
import { journaled } from '@core/mockup/mockup-journal';
import { SEED_EMPLOYEES, SEED_GROUPS, SEED_LEAD_COUNT, SEED_PROVINCES, SEED_TODAY, leadIds, prospectIds, seedDate, seedHash, seedLead, seedProspect, type SeedLead } from '@core/mock/crm-seed';
import { sharedDbVersion } from '@core/mock/shared-db';
import { handleWorkModalRequest, parseBffUrl, toResponse, type MockReply, type ScheduleEnvelope, type WorkModalData, type WorkModalEmployee } from '@shared/work-modal/work-modal.mock';
import type { ActivitiesBackend, ActivitiesRest, ContactActivitiesQuery, ContactActivityItem, ContactActivitiesResult, ContactHistoryEntry, OpportunityByIdResult, RestEnvelope } from './activities-backend';
import { DEFAULT_PER_PAGE, contactChannelLabel, emptyListJson, fetchActivityDetail, fetchActivityList, javaParseInt, javaParseLong, javaTrim, opportunityErrorJson, type ListQuery } from './activities.bff';

export const MOCK_TODAY = SEED_TODAY;

/* ================================================================================== master data */

/** employee id = 1000 + the number of the code (E101 → 1001: the id of the mock sign-in "demo", see mock-backend.interceptor) */
const empId = (code: string): number => 1000 + Number(code.slice(1)) - 100;
const EMPLOYEES: WorkModalEmployee[] = SEED_EMPLOYEES.map((e) => ({ id: empId(e.code), code: e.code, name: e.name, attachFile: '' }));
const EMP_BY_CODE = new Map(SEED_EMPLOYEES.map((e) => [e.code as string, e]));
const SALE_GROUPS = reference('shared.saleGroups', [
  { id: 1004400001, code: 'TA', name: 'ทีม A' },
  { id: 1004400002, code: 'TB', name: 'ทีม B' },
]);
const SALE_GROUP_OF_TEAM = new Map(SALE_GROUPS.map((g) => [g.name, g]));
const TAGS = reference('activities.tags', [
  { id: 1, code: 'VIP', name: 'ลูกค้า VIP', colorCode: '#EB5050' },
  { id: 2, code: 'FOLLOW', name: 'ต้องติดตาม', colorCode: '#FF8E4E' },
  { id: 3, code: 'DOC', name: 'รอเอกสาร', colorCode: '#4B84FF' },
  { id: 4, code: 'REF', name: 'ลูกค้าแนะนำ', colorCode: '#008B5A' },
  { id: 5, code: 'NEW', name: 'ลูกค้าใหม่', colorCode: '#EB4FA0' },
]);
const PROVINCES = SEED_PROVINCES.map((name, i) => ({ id: 10 + i * 10, code: String(10 + i * 10), name, nameTh: name }));
const DISTRICT_NAMES = reference('activities.districtNames', ['เมือง', 'บางใหญ่', 'หนองจอก', 'สันทราย', 'ศรีราชา', 'ปากเกร็ด']);
const districtsOf = (provinceId: number) =>
  [0, 1, 2].map((k) => {
    const name = `${DISTRICT_NAMES[(provinceId / 10 + k) % DISTRICT_NAMES.length]}`;
    return { id: provinceId * 100 + k + 1, code: String(provinceId * 100 + k + 1), name, nameTh: name };
  });

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
  /** the backend refuses the list of this product */
  forbidden?: boolean;
}
const PRODUCTS: Product[] = reference('shared.products', [
  { id: 1004400740, code: 'LD-HL', name: 'สินเชื่อบ้าน', usesWorkflowStep: true, groups: [...SEED_GROUPS] },
  { id: 1004400741, code: 'LD-AL', name: 'สินเชื่อรถยนต์', usesWorkflowStep: true, groups: SEED_GROUPS.slice(0, 5) },
  { id: 1004400742, code: 'LD-FA', name: 'ที่ปรึกษาการเงิน', usesWorkflowStep: false, groups: [] },
  { id: 1004400743, code: 'LD-NW', name: 'ผลิตภัณฑ์ใหม่ (ยังไม่มีลีด)', usesWorkflowStep: true, groups: SEED_GROUPS.slice(0, 3) },
  { id: 1004400744, code: 'LD-XX', name: 'ผลิตภัณฑ์จำกัดสิทธิ์', usesWorkflowStep: true, groups: SEED_GROUPS.slice(0, 4), forbidden: true },
], productsCodec<Product>());
/** lead n belongs to product: 0-3 → สินเชื่อบ้าน, 4-5 → สินเชื่อรถยนต์, 6-7 → ที่ปรึกษาการเงิน (no workflow) */
const productOfLead = (n: number): Product => PRODUCTS[(n % 8 < 4 ? 0 : n % 8 < 6 ? 1 : 2) % PRODUCTS.length]; // a company of the Seed Workbook may have fewer products than three

/** the steps of every group (procedure ids = groupId * 10 + 1..) */
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
const DEMANDS = reference('activities.demands', [
  'ต้องการสินเชื่อบ้านหลังแรก วงเงิน 2.5 ล้านบาท',
  'รีไฟแนนซ์บ้านเดิม ลดดอกเบี้ย',
  'ซื้อรถยนต์ใหม่ ดาวน์ 20%',
  'ขยายกิจการ ต้องการเงินทุนหมุนเวียน',
  '42 ปี Australia Citizen สมรส มีบุตร 2 คน ต้องการซื้อคอนโดใกล้รถไฟฟ้า ใช้เอกสารรายได้จากต่างประเทศ ขอทราบเงื่อนไขการกู้ร่วมกับคู่สมรส และระยะเวลาผ่อนที่ยาวที่สุด',
  'ปรึกษาแผนการเงินเพื่อการเกษียณ',
  '',
]);
const CONTACT_TEXTS = reference('activities.contactTexts', [
  'โทรติดตามลูกค้า สอบถามความคืบหน้าเอกสาร',
  'ลูกค้าแจ้งว่าจะส่งสลิปเงินเดือนภายในสัปดาห์นี้',
  'ส่งข้อมูลโปรโมชั่นดอกเบี้ยพิเศษให้ทางไลน์',
  'นัดหมายเข้าพบที่สาขา วันพฤหัสบดี',
  'ลูกค้าสอบถามค่างวดต่อเดือน แจ้งตัวเลขเบื้องต้นแล้ว',
  'ส่งอีเมลสรุปเงื่อนไขและเอกสารที่ต้องใช้',
  'ติดต่อไม่ได้ ฝากข้อความไว้',
  'ลูกค้าพอใจในข้อเสนอ ขอเวลาปรึกษาครอบครัว',
]);
const CHANNELS = ['manual', 'call_out', 'call_in', 'sms', 'email', 'facebook', 'line', 'whatsapp', 'call_out', 'line', 'manual'].map(contactChannelLabel).concat(['Visit']);
const APPT_SUBJECTS = reference('shared.apptSubjects', ['นัดดูทรัพย์', 'นัดเซ็นสัญญา', 'นัดส่งเอกสาร', 'พบลูกค้าที่สาขา', 'นัดประเมินราคา']);
const TASK_SUBJECTS = reference('shared.taskSubjects', ['เตรียมเอกสารสินเชื่อ', 'ตรวจสอบเครดิตบูโร', 'โทรยืนยันนัดหมาย', 'ส่งใบเสนอราคา', 'ติดตามผลการอนุมัติ']);

/* ================================================================================== the data of the leads */
const DAY = 86_400_000;
const TODAY_MS = Date.parse(SEED_TODAY + 'T00:00:00Z');
const pad = (n: number, w = 2) => String(n).padStart(w, '0');
const daysAgoOf = (iso: string): number => Math.round((TODAY_MS - Date.parse(iso.slice(0, 10) + 'T00:00:00Z')) / DAY);

interface Ev extends ContactHistoryEntry {
  id: number;
  /** 0 = a product without a workflow */
  groupId: number;
  stepName: string;
}
interface Sched {
  id: number;
  kind: 'APPOINTMENT' | 'TASK';
  subject: string;
  detail: string;
  date: string;
  time: string | null;
  allDay: boolean;
  status: string;
  groupId: number;
  stepName: string;
}
interface LeadM {
  id: number;
  seed: SeedLead;
  product: Product;
  /** visited workflow groups, oldest first; the last one is the current group */
  groups: Group[];
  stepName: string;
  /** the responsible employee (null = nobody yet) */
  ownerCode: string | null;
  salePersonCode: string;
  tagIds: number[];
  demand: string;
  leadStatus: string;
  activeStatus: string;
  phoneCountryCode: string;
  countryCode: string;
  district: string;
  events: Ev[];
  schedules: Sched[];
}

interface MockState {
  leads: Map<number, LeadM>;
  seq: number;
}
let STATE: MockState | null = null;
let syncedVersion = -1;

function buildLead(n: number): LeadM {
  const seed = seedLead(n);
  const product = productOfLead(n);
  const h = (salt: number) => seedHash(n, salt);
  // ---- groups ----
  let groups: Group[] = [];
  let stepName = NOWF_STEPS[h(104) % NOWF_STEPS.length];
  if (product.usesWorkflowStep) {
    const ci = seed.groupIdx % product.groups.length;
    const take = h(103) % 5 === 0 && ci >= 2 ? 3 : h(101) % 2 === 0 && ci >= 1 ? 2 : 1;
    groups = product.groups.slice(ci - take + 1, ci + 1);
    const steps = GROUP_STEPS[groups[groups.length - 1].code];
    stepName = steps[h(104) % steps.length];
  }
  // ---- status ----
  const interest = seed.interest;
  const leadStatus = interest === 'HOT' || interest === 'WARM' || interest === 'COLD' ? 'ACTIVE' : interest;
  const activeStatus = leadStatus === 'ACTIVE' ? interest : '';
  const closed = leadStatus === 'SUCCESS' || leadStatus === 'LOST';
  const ownerCode = !closed && h(111) % 10 === 0 ? null : seed.ownerCode;
  const foreign = h(113) % 12 === 0;
  const lead: LeadM = {
    id: n,
    seed,
    product,
    groups,
    stepName,
    ownerCode,
    salePersonCode: SEED_EMPLOYEES[h(112) % SEED_EMPLOYEES.length].code,
    tagIds: [h(114) % 3 === 0 ? 1 + (h(115) % 5) : 0, h(116) % 4 === 0 ? 1 + (h(117) % 5) : 0].filter((x, i, a) => x > 0 && a.indexOf(x) === i),
    demand: DEMANDS[h(105) % DEMANDS.length],
    leadStatus,
    activeStatus,
    phoneCountryCode: foreign ? '+81' : '+66',
    countryCode: foreign ? 'JPN' : 'THA',
    district: districtsOf(PROVINCES[h(118) % PROVINCES.length].id)[0].name,
    events: [],
    schedules: [],
  };
  // a lead the user opened has no history yet (the history of the cast is made up from the seed)
  lead.events = n > SEED_LEAD_COUNT ? [] : buildEvents(lead);
  lead.schedules = n > SEED_LEAD_COUNT ? [] : buildSchedules(lead);
  return lead;
}

const GROUP_ID_OF = (g: Group | undefined): number => (g ? g.id : 0);
const stepOf = (g: Group | undefined, h: number): string => (g ? GROUP_STEPS[g.code][h % GROUP_STEPS[g.code].length] : NOWF_STEPS[h % NOWF_STEPS.length]);

function buildEvents(lead: LeadM): Ev[] {
  const n = lead.id;
  const h = (salt: number) => seedHash(n, salt);
  const out: Ev[] = [];
  const age0 = Math.max(3, daysAgoOf(lead.seed.createdDate));
  const lastAge = Math.min(age0 - 1, daysAgoOf(lead.seed.lastContactDate));
  const total = h(102) % 9;
  const stamp = (i: number, count: number): string => {
    const day = age0 - Math.floor(((age0 - lastAge) * (i + 1)) / (count + 1));
    return `${seedDate(day)}T${pad(9 + (h(120 + i) % 9))}:${pad((h(130 + i) % 12) * 5)}:00`;
  };
  const owner = EMP_BY_CODE.get(lead.ownerCode ?? lead.salePersonCode)!;
  const sale = EMP_BY_CODE.get(lead.salePersonCode)!;
  const who = (i: number) => (i % 2 === 0 ? owner : sale);
  let seq = n * 100;
  const gs = lead.groups.length ? lead.groups : [undefined];
  // the lead is created in the first group; every move to the next group is a system event
  out.push({ id: ++seq, changeDate: `${seedDate(age0)}T08:30:00`, channel: 'system', type: 'create', content: 'สร้าง Lead อัตโนมัติ', procedureGroupId: GROUP_ID_OF(gs[0]), procedureGroupName: gs[0]?.name ?? '', procedureName: stepOf(gs[0], 0), contactTxNo: '', groupId: GROUP_ID_OF(gs[0]), stepName: stepOf(gs[0], 0), employee: { code: owner.code, name: owner.name } });
  for (let i = 0; i < total; i++) {
    const gi = Math.min(gs.length - 1, Math.floor((i * gs.length) / Math.max(1, total)));
    const g = gs[gi];
    const stepName = g === gs[gs.length - 1] ? lead.stepName : stepOf(g, h(140 + i));
    const e = who(i);
    out.push({
      id: ++seq,
      changeDate: stamp(i, total),
      channel: CHANNELS[h(150 + i) % CHANNELS.length],
      type: 'contact',
      content: CONTACT_TEXTS[h(160 + i) % CONTACT_TEXTS.length],
      contactTxNo: `CA${pad(n, 4)}${pad(i + 1)}`,
      procedureGroupId: GROUP_ID_OF(g),
      procedureGroupName: g?.name ?? '',
      procedureId: GROUP_ID_OF(g) * 10 + 1,
      procedureName: stepName,
      groupId: GROUP_ID_OF(g),
      stepName,
      salePerson: { code: e.code, name: e.name },
    });
  }
  for (let gi = 1; gi < gs.length; gi++) {
    const g = gs[gi]!;
    out.push({ id: ++seq, changeDate: `${seedDate(Math.max(lastAge, age0 - Math.floor((age0 * gi) / gs.length)))}T16:00:00`, channel: 'system', type: 'forward', content: msg('ส่งต่องานไปยัง {0}', g.name), contactTxNo: '', procedureGroupId: g.id, procedureGroupName: g.name, procedureName: stepOf(g, 0), groupId: g.id, stepName: stepOf(g, 0), employee: { code: owner.code, name: owner.name } });
  }
  // a note written with the forward (not a channel, not counted)
  if (gs.length > 1 && h(170) % 2 === 0) {
    const g = gs[gs.length - 1]!;
    out.push({ id: ++seq, changeDate: `${seedDate(Math.max(lastAge, 1))}T16:05:00`, channel: 'forward_note', type: 'forward', content: 'ส่งต่อพร้อมเอกสารครบ', contactTxNo: '', procedureGroupId: g.id, procedureGroupName: g.name, procedureName: stepOf(g, 0), groupId: g.id, stepName: stepOf(g, 0), employee: { code: owner.code, name: owner.name } });
  }
  return out.sort((a, b) => a.changeDate.localeCompare(b.changeDate) || a.id - b.id);
}

function buildSchedules(lead: LeadM): Sched[] {
  const n = lead.id;
  const h = (salt: number) => seedHash(n, salt);
  const g = lead.groups[lead.groups.length - 1];
  const out: Sched[] = [];
  const nAppt = h(180) % 4;
  const nTask = h(181) % 4;
  for (let k = 0; k < nAppt; k++) {
    const status = ['scheduled', 'scheduled', 're-schedule', 'success'][h(182 + k) % 4];
    out.push({ id: 5_000_000 + n * 10 + k, kind: 'APPOINTMENT', subject: `${APPT_SUBJECTS[h(183 + k) % APPT_SUBJECTS.length]}`, detail: 'นัดหมายกับลูกค้าตามที่ตกลงทางโทรศัพท์', date: seedDate(-((h(184 + k) % 20) - 4)), time: `${pad(9 + (h(185 + k) % 8))}:${h(186 + k) % 2 ? '30' : '00'}:00`, allDay: false, status, groupId: GROUP_ID_OF(g), stepName: lead.stepName });
  }
  for (let k = 0; k < nTask; k++) {
    const status = ['doing', 'doing', 'success', 'cancel'][h(190 + k) % 4];
    const allDay = h(191 + k) % 3 === 0;
    out.push({ id: 5_000_000 + n * 10 + 5 + k, kind: 'TASK', subject: TASK_SUBJECTS[h(192 + k) % TASK_SUBJECTS.length], detail: 'ดำเนินการให้เสร็จก่อนนัดหมายถัดไป', date: seedDate(-((h(193 + k) % 14) - 3)), time: allDay ? null : `${pad(10 + (h(194 + k) % 7))}:00:00`, allDay, status, groupId: GROUP_ID_OF(g), stepName: lead.stepName });
  }
  return out;
}

function state(): MockState {
  if (!STATE) {
    STATE = { leads: new Map(), seq: 9_000_000 };
    for (const n of leadIds()) STATE.leads.set(n, buildLead(n)); // the leads of the company now
    syncedVersion = -1;
  }
  // the shared database: a lead the user opened is here, and the customer's own data is the current one
  if (syncedVersion !== sharedDbVersion()) {
    for (const id of leadIds()) {
      const had = STATE.leads.get(id);
      if (had) had.seed = seedLead(id);
      else STATE.leads.set(id, buildLead(id));
    }
    syncedVersion = sharedDbVersion();
  }
  return STATE;
}

/** starts every scenario / test from the seed again (the data is edited by POST / PATCH) */
export function resetMockActivities(): void {
  STATE = null;
}

/* ================================================================================== helpers over the model */
const ownerOf = (l: LeadM) => (l.ownerCode ? EMP_BY_CODE.get(l.ownerCode)! : null);
const closedLead = (l: LeadM) => l.leadStatus === 'SUCCESS' || l.leadStatus === 'LOST';
const currentGroup = (l: LeadM): Group | undefined => l.groups[l.groups.length - 1];
const isContact = (e: Ev) => e.type === 'contact';
const lastContactOf = (l: LeadM): string => {
  const contacts = l.events.filter(isContact);
  return contacts.length ? contacts[contacts.length - 1].changeDate : `${l.seed.createdDate}T09:00:00`;
};
const teamOf = (l: LeadM) => SALE_GROUP_OF_TEAM.get(EMP_BY_CODE.get(l.salePersonCode)!.team)!;
const tel = (l: LeadM) => l.seed.phone;

/** the channel counters of the events (facebook is the key of the backend for the `fb` column) */
function counts(events: Ev[]): Pick<ContactActivityItem, 'note' | 'line' | 'facebook' | 'whatsapp' | 'email' | 'sms' | 'call' | 'visit'> {
  const c = { note: 0, line: 0, facebook: 0, whatsapp: 0, email: 0, sms: 0, call: 0, visit: 0 };
  for (const e of events) {
    if (!isContact(e)) continue;
    const u = e.channel.toUpperCase();
    const k = u.includes('LINE') ? 'line' : u.includes('WHATSAPP') ? 'whatsapp' : u.includes('FACEBOOK') ? 'facebook' : u.includes('MAIL') ? 'email' : u.includes('SMS') ? 'sms' : u.includes('CALL') ? 'call' : u.includes('VISIT') ? 'visit' : 'note';
    c[k]++;
  }
  return c;
}

function itemOf(l: LeadM, group: Group | undefined, scope: 'lead' | 'group'): ContactActivityItem {
  const owner = ownerOf(l);
  // groupBy=lead: the counters of the CURRENT group only (MR !184) ; groupBy=group: the counters of that group
  const evs = l.events.filter((e) => e.groupId === GROUP_ID_OF(group));
  const own = evs.filter(isContact);
  const lastIso = own.length ? own[own.length - 1].changeDate : lastContactOf(l);
  return {
    leadId: l.id,
    contactCode: owner?.code ?? '',
    contactId: owner ? empId(owner.code) : undefined,
    contactName: owner?.name ?? '',
    contactAvatar: '',
    prospectName: l.seed.customerName,
    prospectAvatar: '',
    prospectId: l.seed.prospectId,
    prospectCode: seedProspect(l.seed.prospectId).code,
    prospectTel: tel(l),
    txNo: `LD-2026-${pad(l.id, 5)}`,
    leadDemand: l.demand,
    procedureGroupId: GROUP_ID_OF(group),
    // groupBy=lead of the first product carries the group name; the other products leave it out, as the real backend did on 16/09 (the
    // BFF then falls back to the groupBy=group answer, then to the step: ContactActivityApiService.stepGroupOf)
    procedureGroupName: scope === 'group' || l.product === PRODUCTS[0] ? (group?.name ?? '') : undefined,
    procedureId: GROUP_ID_OF(group) * 10 + 1,
    procedureName: scope === 'group' ? stepOfGroup(l, group) : l.stepName,
    groupCount: Math.max(1, l.groups.length),
    leadStatus: l.leadStatus,
    activeStatus: l.activeStatus,
    tags: l.tagIds.map((id) => TAGS.find((t) => t.id === id)!),
    lastContactDate: scope === 'group' ? lastIso : lastContactOf(l),
    assignDate: `${l.seed.createdDate}T09:00:00`,
    lastAppointmentDate: l.schedules.find((s) => s.kind === 'APPOINTMENT')?.date ?? '',
    ...counts(scope === 'lead' ? l.events.filter((e) => e.groupId === GROUP_ID_OF(currentGroup(l))) : evs),
  };
}
const stepOfGroup = (l: LeadM, g: Group | undefined): string => (g === currentGroup(l) ? l.stepName : l.events.find((e) => e.groupId === GROUP_ID_OF(g))?.stepName ?? '');

/* ================================================================================== the REST service */
/** an answer of the service as an object (the seed code below); `createMockRest` turns it into what `Data_API` saw: the status and the TEXT */
interface RestReply<T = unknown> {
  status: number;
  body: RestEnvelope<T> | null;
}
interface RestObjects {
  contactActivities(q: ContactActivitiesQuery): Promise<RestReply<ContactActivitiesResult>>;
  contactHistory(leadId: string): Promise<RestReply<unknown>>;
  leadById(id: string, activityGroupId?: string): Promise<RestReply<OpportunityByIdResult>>;
}
const reply = <T>(status: number, body: any): RestReply<T> => ({ status, body });
const ok = <T>(result: T): RestReply<T> => reply(200, { status: 200, message: 'success', result });
const fail = (status: number, message: string): RestReply<any> => reply(status, { status, message, error: { code: status, message } });

/** the REST service of the seed: the answers as the service sends them (status + JSON text) — the code of `activities.bff.ts` reads them like `Data_API` did */
export function createMockRest(): ActivitiesRest {
  const o = createMockRestObjects();
  const text = (r: RestReply<unknown>): { status: number; body: string } => ({ status: r.status, body: r.body ? JSON.stringify(r.body) : '' });
  return {
    contactActivities: async (q) => text(await o.contactActivities(q)),
    contactHistory: async (id) => text(await o.contactHistory(id)),
    leadById: async (id, agid) => text(await o.leadById(id, agid)),
  };
}

function createMockRestObjects(): RestObjects {
  return {
    async contactActivities(q: ContactActivitiesQuery) {
      const mt = q.movementTypeId ? PRODUCTS.find((p) => String(p.id) === q.movementTypeId) : undefined;
      if (q.movementTypeId && !mt) return fail(404, msg('ไม่พบผลิตภัณฑ์')) as RestReply<ContactActivitiesResult>;
      if (mt?.forbidden) return fail(403, msg('ไม่มีสิทธิ์เข้าถึงข้อมูลการติดต่อ (CRM_ContactActivity_View)')) as RestReply<ContactActivitiesResult>;
      if (q.contactName?.includes('~err')) return fail(403, msg('ไม่มีสิทธิ์เข้าถึงข้อมูลการติดต่อ (CRM_ContactActivity_View)')) as RestReply<ContactActivitiesResult>;
      let leads = [...state().leads.values()].filter((l) => !mt || l.product === mt);
      const lc = (s: string) => s.toLowerCase();
      if (q.saleGroupId) leads = leads.filter((l) => String(teamOf(l).id) === q.saleGroupId);
      if (q.employeeName) leads = leads.filter((l) => !!ownerOf(l) && lc(ownerOf(l)!.name).includes(lc(q.employeeName!)));
      if (q.contactName) leads = leads.filter((l) => !!ownerOf(l) && lc(ownerOf(l)!.name).includes(lc(q.contactName!)));
      if (q.activeStatus) leads = leads.filter((l) => l.activeStatus === q.activeStatus!.toUpperCase());
      const inRange = (iso: string, from?: string, to?: string) => (!from || iso.slice(0, 10) >= from) && (!to || iso.slice(0, 10) <= to);
      leads = leads.filter((l) => inRange(lastContactOf(l), q.lastContactFrom, q.lastContactTo) && inRange(l.seed.createdDate, q.assignDateFrom, q.assignDateTo));

      // the summaries count the filtered set, closed leads included
      const sum = { total: leads.length, new: 0, success: 0, lost: 0, inactive: 0, active: { total: 0, hot: 0, warm: 0, cold: 0 } };
      for (const l of leads) {
        if (l.leadStatus === 'NEW') sum.new++;
        else if (l.leadStatus === 'SUCCESS') sum.success++;
        else if (l.leadStatus === 'LOST') sum.lost++;
        else if (l.leadStatus === 'INACTIVE') sum.inactive++;
        else if (l.leadStatus === 'ACTIVE') {
          sum.active.total++;
          if (l.activeStatus === 'HOT') sum.active.hot++;
          else if (l.activeStatus === 'WARM') sum.active.warm++;
          else if (l.activeStatus === 'COLD') sum.active.cold++;
        }
      }
      const wf = mt?.usesWorkflowStep ? mt.groups.map((g) => ({ id: g.id, code: g.code, name: g.name, count: leads.filter((l) => currentGroup(l)?.id === g.id).length })) : [];

      // items: closed leads only when asked for
      let shown = q.showClosed === 'true' ? leads : leads.filter((l) => !closedLead(l));
      const by = q.sortBy ?? 'lastContactDate_desc';
      const key = (l: LeadM) => (by.startsWith('prospectName') ? l.seed.customerName : lastContactOf(l));
      shown = shown.slice().sort((a, b) => {
        const c = by.startsWith('prospectName') ? key(a).localeCompare(key(b), 'th') : key(a).localeCompare(key(b));
        return (by.endsWith('_desc') ? -c : c) || a.id - b.id;
      });
      const total = shown.length;
      const totalPages = Math.ceil(total / q.pageSize);
      const pageNo = q.pageNo ?? 0;
      const slice = shown.slice(pageNo * q.pageSize, (pageNo + 1) * q.pageSize);
      const items: ContactActivityItem[] =
        q.groupBy === 'lead'
          ? slice.map((l) => itemOf(l, currentGroup(l), 'lead'))
          : // groupBy=group: the real backend answers one row per lead even when the lead has several groups
            slice.map((l) => itemOf(l, currentGroup(l), 'group'));
      return ok<ContactActivitiesResult>({
        items,
        meta: { page: pageNo, perPage: q.pageSize, total, totalPages },
        statusSummary: sum,
        usesWorkflowStep: !!mt?.usesWorkflowStep,
        wfStepSummary: wf,
        movementTypeId: mt?.id ?? 0,
      });
    },

    async contactHistory(leadId: string) {
      const l = state().leads.get(Number(leadId));
      if (!l) return fail(404, msg('ไม่พบ Lead'));
      if (!l.product.usesWorkflowStep) return ok({ items: l.events.slice() });
      // groups[].steps[].items[], oldest first
      const groups = l.groups.map((g) => {
        const evs = l.events.filter((e) => e.groupId === g.id);
        const steps = [...new Set(evs.map((e) => e.stepName))].map((s) => ({ procedureName: s, items: evs.filter((e) => e.stepName === s) }));
        return { procedureGroupId: g.id, procedureGroupName: g.name, steps };
      });
      return ok({ groups });
    },

    async leadById(id: string, activityGroupId?: string) {
      const n = Number(id);
      const l = state().leads.get(n);
      if (!l) return fail(404, msg('ไม่พบข้อมูล Lead'));
      if (n % 53 === 0) return fail(500, msg('ระบบขัดข้อง ไม่สามารถโหลดข้อมูล Lead ได้ (จำลอง)')) as RestReply<OpportunityByIdResult>;
      if (l.groups.length > 1 && seedHash(n, 119) % 3 === 0 && !activityGroupId) return fail(400, msg('ต้องระบุ activityGroupId — lead นี้มีหลายกลุ่มขั้นตอนทำงานอยู่พร้อมกัน')) as RestReply<OpportunityByIdResult>;
      // the group being looked at (activityGroupId) or the current one
      const viewed = (activityGroupId && l.groups.find((g) => String(g.id) === activityGroupId)) || currentGroup(l);
      const owner = ownerOf(l);
      const sp = EMP_BY_CODE.get(l.salePersonCode)!;
      const firstSale = EMPLOYEES.find((e) => e.code === sp.code)!;
      const prospect = seedProspect(l.seed.prospectId);
      const history = l.events.slice().sort((a, b) => b.changeDate.localeCompare(a.changeDate) || b.id - a.id);
      const result: OpportunityByIdResult = {
        prospect: { name: l.seed.customerName, attachFile: '', currentDistrictName: l.district, currentCityName: l.seed.province, customerTel: tel(l), phoneCountryCode: l.phoneCountryCode, countryCode: l.countryCode },
        prospectInfo: { fullName: prospect.fullName, firstContactDate: l.seed.createdDate, contactInfo: { mobile1: tel(l) } },
        salePerson: { id: firstSale.id, code: sp.code, name: sp.name },
        saleGroup: { name: teamOf(l).name },
        employee: owner ? { id: empId(owner.code), code: owner.code, name: owner.name } : undefined,
        leadStatus: l.leadStatus,
        activeStatus: l.activeStatus,
        contactDate: l.seed.createdDate,
        currentStep: viewed ? { procedureGroupId: viewed.id, procedureGroupName: viewed.name, procedureName: viewed === currentGroup(l) ? l.stepName : stepOfGroup(l, viewed) } : { procedureGroupId: 0, procedureGroupName: '', procedureName: l.stepName },
        contactHistoryList: history,
        appointmentList: l.schedules.filter((s) => s.kind === 'APPOINTMENT').map((s) => ({ id: s.id, subject: s.subject, date: s.date, time: s.time ?? '', status: s.status, procedureGroupName: groupName(s.groupId), procedureName: s.stepName })),
        taskList: l.schedules.filter((s) => s.kind === 'TASK').map((s) => ({ id: s.id, completed: s.status === 'success', date: s.date, time: s.time ?? '', allDay: s.allDay, subject: s.subject, description: s.detail, procedureGroupName: groupName(s.groupId), procedureName: s.stepName })),
      };
      return ok(result);
    },
  };
}
const groupName = (id: number): string => PRODUCTS.flatMap((p) => p.groups).find((g) => g.id === id)?.name ?? '';

/* ================================================================================== the data of the work modal */
function workModalData(): WorkModalData {
  const nowStep = (l: LeadM) => l.stepName;
  return {
    employees: (saleGroupId) => (saleGroupId ? EMPLOYEES.filter((e) => String(SALE_GROUP_OF_TEAM.get(EMP_BY_CODE.get(e.code)!.team)!.id) === saleGroupId) : EMPLOYEES),
    employeesByActivityGroup: (gid) => {
      const idx = SEED_GROUPS.findIndex((g) => String(g.id) === gid);
      // who works a group: every other employee, shifted by the group (at least four per group)
      return idx < 0 ? [] : EMPLOYEES.filter((_, i) => (i + idx) % 2 === 0);
    },
    activityGroups: (mt) => PRODUCTS.find((p) => String(p.id) === mt)?.groups.map((g) => ({ id: g.id, code: g.code, name: g.name })) ?? null,
    searchLeads: (p) => {
      const q = (p.get('search') ?? '').trim().toLowerCase();
      const mt = p.get('movementTypeId');
      const emp = p.get('employeeId');
      const per = intParam(p, 'perPage', 20);
      const page = intParam(p, 'page', 1);
      const hits = [...state().leads.values()]
        .filter((l) => !closedLead(l) && (!mt || String(l.product.id) === mt) && (!emp || (ownerOf(l) && String(empId(ownerOf(l)!.code)) === emp)))
        .filter((l) => !q || [l.seed.customerName, l.seed.code, seedProspect(l.seed.prospectId).code].some((s) => s.toLowerCase().includes(q)))
        .sort((a, b) => a.id - b.id);
      const items = hits.slice((page - 1) * per, page * per).map((l) => {
        const g = currentGroup(l);
        const o = ownerOf(l);
        return { id: l.id, prospectCode: seedProspect(l.seed.prospectId).code, prospectName: l.seed.customerName, saleGroupName: teamOf(l).name, employeeId: o ? empId(o.code) : null, employeeCode: o?.code ?? '', employeeName: o?.name ?? '', txNo: `LD-2026-${pad(l.id, 5)}`, forwardStatus: g ? `${g.name} - ${l.stepName}` : l.stepName, activityGroupId: g?.id ?? 0, activityGroupName: g?.name ?? '', movementTypeId: l.product.id };
      });
      return { items, page, perPage: per, total: hits.length, totalPages: Math.ceil(hits.length / per) };
    },
    leadStep: (id, agid) => {
      const l = state().leads.get(Number(id));
      if (!l) return { status: 404, body: opportunityErrorJson(404, msg('ไม่พบข้อมูล Lead')) };
      if (l.id % 53 === 0) return { status: 500, body: opportunityErrorJson(500, msg('ระบบขัดข้อง ไม่สามารถโหลดข้อมูล Lead ได้ (จำลอง)')) };
      const g = (agid && l.groups.find((x) => String(x.id) === agid)) || currentGroup(l);
      // LeadDetailServlet answers the `result` of GET /leads/{id} itself (no envelope)
      return { status: 200, body: { id: l.id, leadStatus: l.leadStatus, currentStep: { procedureGroupId: g?.id ?? 0, procedureGroupName: g?.name ?? '', procedureName: l.stepName } } };
    },
    addSchedule: (b) => {
      const lead = state().leads.get(Number(b['leadId']));
      const bad = (message: string): ScheduleEnvelope => ({ status: 400, message, error: { code: 400, message } });
      if (!lead) return bad(msg('ไม่พบ Lead ที่ระบุ'));
      if (!String(b['subject'] ?? '').trim()) return bad(msg('subject ต้องไม่ว่าง'));
      if (String(b['subject']).includes('~fail')) return bad(msg('จำลองข้อผิดพลาดจาก backend (subject มี ~fail)'));
      if (!String(b['detail'] ?? '').trim()) return bad(msg('detail ต้องไม่ว่าง'));
      if (!/^\d{4}-\d{2}-\d{2}$/.test(String(b['date'] ?? ''))) return bad(msg('date รูปแบบไม่ถูกต้อง (yyyy-MM-dd)'));
      if (b['type'] !== 'APPOINTMENT' && b['type'] !== 'TASK') return bad(msg('type ต้องเป็น APPOINTMENT หรือ TASK'));
      const g = currentGroup(lead);
      if (g && !(Number(b['procedureGroupId']) > 0)) return bad(msg('ต้องระบุ procedureGroupId เพราะ Lead นี้มีขั้นตอน workflow ที่ทำงานอยู่'));
      const id = ++state().seq;
      lead.schedules.push({ id, kind: b['type'] as 'APPOINTMENT' | 'TASK', subject: String(b['subject']).trim(), detail: String(b['detail']).trim(), date: String(b['date']), time: b['allDay'] ? null : b['time'] ? `${String(b['time'])}:00`.replace(/^(\d\d:\d\d):00:00$/, '$1:00') : null, allDay: !!b['allDay'], status: String(b['status'] ?? 'scheduled'), groupId: Number(b['procedureGroupId']) || GROUP_ID_OF(g), stepName: nowStep(lead) });
      return { status: 201, message: 'success', result: { id } };
    },
    editSchedule: (id, b) => {
      if (String(b['subject'] ?? '').includes('~fail')) return { status: 400, message: 'จำลองข้อผิดพลาดจาก backend (subject มี ~fail)', error: { code: 400, message: 'จำลองข้อผิดพลาดจาก backend (subject มี ~fail)' } };
      for (const l of state().leads.values()) {
        const s = l.schedules.find((x) => x.id === id);
        if (!s) continue;
        if (b['subject'] != null) s.subject = String(b['subject']);
        if (b['detail'] != null) s.detail = String(b['detail']);
        if (b['date'] != null) s.date = String(b['date']);
        if ('time' in b) s.time = b['time'] ? String(b['time']) : null;
        if (b['allDay'] != null) s.allDay = !!b['allDay'];
        if (b['status'] != null) s.status = String(b['status']);
        return { status: 200, message: 'success' };
      }
      return { status: 404, message: 'ไม่พบนัดหมาย/งาน', error: { code: 404, message: 'ไม่พบนัดหมาย/งาน' } };
    },
  };
}

/* ================================================================================== the BFF */
export interface MockActivitiesOptions {
  /** how long every answer takes (ms) */
  delayMs?: number;
}

const json = (status: number, body: unknown): MockReply => ({ status, body });
/** ActivityListServlet._intParam: an int in the text, else the default */
const intParam = (p: URLSearchParams, name: string, d: number): number => {
  const v = javaTrim(p.get(name) ?? '');
  return v === '' ? d : (javaParseInt(v) ?? d);
};
const body = (raw: string | undefined): Record<string, any> | null => {
  try {
    const v = JSON.parse(raw ?? '');
    return v && typeof v === 'object' ? v : null;
  } catch {
    return null;
  }
};

/** the servlet layer: BFF URL → answer */
export async function handleActivitiesRequest(method: string, input: string, rawBody: string | undefined, rest: ActivitiesRest): Promise<MockReply> {
  const { path, params } = parseBffUrl(input);
  const m = method.toUpperCase();
  switch (path) {
    case 'board/activity-list': {
      const q: ListQuery = {
        movementTypeId: params.get('movementTypeId') ?? undefined,
        saleGroupId: params.get('saleGroupId') ?? undefined,
        employeeName: params.get('employeeName') ?? undefined,
        search: params.get('search') ?? undefined,
        sortBy: params.get('sortBy') ?? undefined,
        activeStatus: params.get('activeStatus') ?? undefined,
        lastContactFrom: params.get('lastContactFrom') ?? undefined,
        lastContactTo: params.get('lastContactTo') ?? undefined,
        assignDateFrom: params.get('assignDateFrom') ?? undefined,
        assignDateTo: params.get('assignDateTo') ?? undefined,
        showClosed: params.get('showClosed') ?? undefined,
        page: intParam(params, 'page', 1),
        perPage: intParam(params, 'perPage', DEFAULT_PER_PAGE),
      };
      // ActivityListServlet: an exception → HTTP 500 and the empty list
      if (q.search?.includes('~500')) return json(500, emptyListJson());
      return json(200, await fetchActivityList(rest, q));
    }
    case 'board/activity-detail': {
      // ActivityDetailServlet: Long.parseLong(trimmed), the NumberFormatException ignored (0)
      const num = (n: string) => javaParseLong(javaTrim(params.get(n) ?? '')) ?? 0;
      const all = params.get('all');
      const r = await fetchActivityDetail(
        rest,
        { leadId: (params.get('id') ?? '').trim(), wfsId: num('wfsId'), txNo: (params.get('txNo') ?? '').trim(), allGroups: all === '1' || all?.toLowerCase() === 'true', activityGroupId: num('activityGroupId') },
        'โหลดข้อมูล Lead ไม่สำเร็จ',
      );
      return json(r.status, r.body);
    }
    case 'board/contact-activities': {
      if (m !== 'POST') return json(405, { error: 'method not allowed' });
      const b = body(rawBody);
      if (!b) return json(400, { error: 'invalid json body' });
      if (b['leadId'] == null) return json(400, { error: 'leadId required' });
      const lead = state().leads.get(Number(b['leadId']));
      const bad = (message: string) => json(400, { status: 400, message, error: { code: 400, message } });
      if (!lead) return json(404, { status: 404, message: 'ไม่พบ Lead', error: { code: 404, message: 'ไม่พบ Lead' } });
      if (!String(b['content'] ?? '').trim()) return bad(msg('content ต้องไม่ว่าง'));
      if (String(b['content']).includes('~fail')) return bad(msg('จำลองข้อผิดพลาดจาก backend (content มี ~fail)'));
      if (!(Number(b['createById']) > 0)) return bad(msg('ต้องระบุ createById (ผู้รับผิดชอบ)'));
      const who = EMPLOYEES.find((e) => e.id === Number(b['createById']));
      if (!who) return bad(msg('createById ไม่ถูกต้อง'));
      const g = currentGroup(lead);
      const pg = Number(b['procedureGroupId']) || 0;
      if (g && pg <= 0) return bad(msg('ต้องระบุ procedureGroupId เพราะ Lead นี้มีขั้นตอน workflow ที่ทำงานอยู่'));
      const when = typeof b['workRecordDate'] === 'string' && b['workRecordDate'] ? String(b['workRecordDate']) : `${SEED_TODAY}T09:00:00`;
      const id = ++state().seq;
      const grp = [...lead.product.groups].find((x) => x.id === pg) ?? g;
      lead.events.push({ id, changeDate: when, channel: contactChannelLabel(String(b['channel'] ?? '')), type: 'contact', content: String(b['content']), contactTxNo: `CA${pad(lead.id, 4)}N${id % 1000}`, procedureGroupId: GROUP_ID_OF(grp), procedureGroupName: grp?.name ?? '', procedureId: GROUP_ID_OF(grp) * 10 + 1, procedureName: lead.stepName, groupId: GROUP_ID_OF(grp), stepName: grp === g ? lead.stepName : stepOfGroup(lead, grp), salePerson: { code: who.code, name: who.name } });
      lead.events.sort((a, c) => a.changeDate.localeCompare(c.changeDate) || a.id - c.id);
      return json(201, { status: 201, message: 'success', result: { id } });
    }
    case 'board/lead-assign': {
      if (m !== 'POST') return json(405, { error: 'method not allowed' });
      const b = body(rawBody);
      if (!b) return json(400, { error: 'body required' });
      const lead = state().leads.get(Number(b['leadId']));
      if (!lead) return json(404, { status: 404, message: 'ไม่พบ Lead', error: { code: 404, message: 'ไม่พบ Lead' } });
      const emp = EMPLOYEES.find((e) => e.id === Number(b['employeeId']));
      if (!emp) return json(400, { status: 400, message: 'employeeId ไม่ถูกต้อง', error: { code: 400, message: 'employeeId ไม่ถูกต้อง' } });
      lead.ownerCode = emp.code;
      return json(200, { status: 200, message: 'success' });
    }
    case 'board/movement-types':
      return json(200, PRODUCTS.map((p) => ({ id: p.id, code: p.code, name: p.name, usesWorkflowStep: p.usesWorkflowStep })));
    case 'board/tags':
      return json(200, TAGS);
    case 'board/sale-groups':
      return json(200, SALE_GROUPS);
    case 'board/provinces':
      return json(200, PROVINCES);
    case 'board/districts': {
      const pid = Number(params.get('provinceId')?.trim());
      return json(200, Number.isFinite(pid) && PROVINCES.some((p) => p.id === pid) ? districtsOf(pid) : []);
    }
    case 'board/prospect-list': {
      const q = (params.get('searchText') ?? '').trim().toLowerCase();
      const per = intParam(params, 'perPage', 8);
      const items: any[] = [];
      for (const i of prospectIds()) {
        if (items.length >= per) break;
        const p = seedProspect(i);
        if (q && ![p.code, p.fullName, p.phone].some((s) => s.toLowerCase().includes(q))) continue;
        items.push({ id: p.id, code: p.code, name: p.fullName, date: p.createdDate, source: p.source, phone: p.phone, phonecc: '+66', countrycode: 'THA', addr: p.province, province: p.province, district: '' });
      }
      return json(200, { status: 200, message: 'success', result: { items, meta: { page: 1, perPage: per, total: items.length, totalPages: 1 } } });
    }
    case 'board/chat-master-data':
      return params.get('type') === 'countries' ? json(200, { status: 200, result: MOCK_COUNTRIES }) : json(200, { status: 200, result: [] });
    default: {
      const r = handleWorkModalRequest(m, path, params, rawBody, workModalData());
      return r ?? json(404, { error: 'not mocked: ' + path });
    }
  }
}

/** The BFF contract of the page, answered from the seed (`mock: true`). */
export function createMockActivities(options: MockActivitiesOptions = {}): ActivitiesBackend {
  const make = (delay: number): ActivitiesBackend => {
    const rest = createMockRest();
    return {
      async fetch(input: string, init?: RequestInit): Promise<Response> {
        if (delay) await new Promise((r) => setTimeout(r, delay));
        const raw = typeof init?.body === 'string' ? init.body : undefined;
        return toResponse(await handleActivitiesRequest(init?.method ?? 'GET', String(input), raw, rest));
      },
    };
  };
  // the changes of the user are kept in Datasource/journal.activities.json (mockup file server) and replayed at the next start
  return journaled('activities', make(0), make(options.delayMs ?? 150));
}

export { opportunityErrorJson };
