/**
 * The appointments and tasks of the fake CRM — the data set the Schedule page ("ปฏิทินงาน") shows, derived from the shared cast
 * (`crm-seed.ts`: the leads, the employees, the workflow groups) so that the lead you meet in the calendar is the lead of every other page.
 *
 * Every lead has the same model as in the Activities mock (`features/activities/activities.mock.ts`): its product (`n % 8`: 0-3 สินเชื่อบ้าน,
 * 4-5 สินเชื่อรถยนต์, 6-7 ที่ปรึกษาการเงิน — no workflow), its visited workflow groups, the step it stands on, its owner, and the same
 * appointments / tasks (`5_000_000 + n * 10 + k`, same subject / date / time / status), so the work done in the detail panel of the
 * Activities page is the work of the calendar. On top of those come the EXTRA rows below (ids from 6_000_000): a dense block in the
 * default view (สินเชื่อบ้าน / first workflow group) so that the month cells overflow into "more", the board columns and the lists have
 * several pages; rows in other months / years for the year view; and a handful of special rows (overlapping times, all day, a title that
 * needs escaping, an item nobody is responsible for …). They are Schedule-only; the Activities mock does not know them yet.
 *
 * TODO for the coordinator (see INTEGRATION.md): let `activities.mock.ts` build its leads / schedules from THIS file, so that an item
 * added in one page's work modal shows up in the other (today each page mock keeps its own state).
 *
 * Framework-free and deterministic (no Date.now, no Math.random): the comparison harness loads it in Node and both sides must see the
 * same data. Only erasable TypeScript (Node strips the types).
 */
import { productsCodec, reference } from './reference';
import { SEED_EMPLOYEES, SEED_GROUPS, SEED_LEAD_COUNT, SEED_TODAY, leadIds, seedDate, seedHash, seedLead, seedProspect, type SeedLead } from './crm-seed';

/* ================================================================================== master data */
export interface SeedGroup {
  id: number;
  code: string;
  name: string;
}
export interface SeedProduct {
  id: number;
  code: string;
  name: string;
  usesWorkflowStep: boolean;
  groups: SeedGroup[];
}
/** employee id = 1000 + the number of the code (E101 → 1001: the id of the mock sign-in "demo", see mock-backend.interceptor) */
export const employeeId = (code: string): number => 1000 + Number(code.slice(1)) - 100;
export const SALE_GROUPS = reference('shared.saleGroups', [
  { id: 1004400001, code: 'TA', name: 'ทีม A' },
  { id: 1004400002, code: 'TB', name: 'ทีม B' },
] as const);
const EMP_BY_CODE = new Map<string, (typeof SEED_EMPLOYEES)[number]>(SEED_EMPLOYEES.map((e) => [e.code as string, e]));
export const employeeByCode = (code: string) => EMP_BY_CODE.get(code);
export const saleGroupOfTeam = (team: string) => SALE_GROUPS.find((g) => g.name === team)!;

const ALL_PRODUCTS = reference('shared.products', [
  { id: 1004400740, code: 'LD-HL', name: 'สินเชื่อบ้าน', usesWorkflowStep: true, groups: [...SEED_GROUPS] },
  { id: 1004400741, code: 'LD-AL', name: 'สินเชื่อรถยนต์', usesWorkflowStep: true, groups: SEED_GROUPS.slice(0, 5) },
  { id: 1004400742, code: 'LD-FA', name: 'ที่ปรึกษาการเงิน', usesWorkflowStep: false, groups: [] },
  { id: 1004400743, code: 'LD-NW', name: 'ผลิตภัณฑ์ใหม่ (ยังไม่มีลีด)', usesWorkflowStep: true, groups: SEED_GROUPS.slice(0, 3) },
  { id: 1004400744, code: 'LD-XX', name: 'ผลิตภัณฑ์จำกัดสิทธิ์', usesWorkflowStep: true, groups: SEED_GROUPS.slice(0, 4), forbidden: true },
], productsCodec<SeedProduct & { forbidden?: boolean }>());
export const PRODUCTS: SeedProduct[] = ALL_PRODUCTS.filter((p) => !p.forbidden);
/** lead n belongs to product: 0-3 → สินเชื่อบ้าน, 4-5 → สินเชื่อรถยนต์, 6-7 → ที่ปรึกษาการเงิน (no workflow) */
export const productOfLead = (n: number): SeedProduct => PRODUCTS[(n % 8 < 4 ? 0 : n % 8 < 6 ? 1 : 2) % PRODUCTS.length]; // a company of the Seed Workbook may have fewer products than three

/** the steps of every group */
export const GROUP_STEPS: Record<string, string[]> = reference('shared.groupSteps', {
  CS: ['รับลีดใหม่', 'โทรติดต่อลูกค้า', 'นัดหมายพบลูกค้า', 'ส่งต่อทีมวิเคราะห์'],
  AN: ['ตรวจสอบเอกสาร', 'วิเคราะห์ความเสี่ยง', 'สรุปผลวิเคราะห์'],
  PLS: ['คัดกรองเบื้องต้น', 'ประเมินวงเงิน', 'เสนอผลิตภัณฑ์'],
  LS: ['ยื่นคำขอสินเชื่อ', 'พิจารณาอนุมัติ', 'แจ้งผลอนุมัติ'],
  FI: ['ตรวจสอบบัญชีผู้รับเงิน', 'จัดเตรียมการโอนเงิน'],
  LE: ['ทำสัญญาสินเชื่อ', 'จดทะเบียนหลักประกัน'],
  CRM: ['ติดตามหลังการขาย', 'สำรวจความพึงพอใจ'],
});
export const NOWF_STEPS = reference('shared.noWorkflowSteps', ['สอบถามความต้องการ', 'เสนอแนวทาง', 'ติดตามผล', 'ปิดการขาย']);
const APPT_SUBJECTS = reference('shared.apptSubjects', ['นัดดูทรัพย์', 'นัดเซ็นสัญญา', 'นัดส่งเอกสาร', 'พบลูกค้าที่สาขา', 'นัดประเมินราคา']);
const TASK_SUBJECTS = reference('shared.taskSubjects', ['เตรียมเอกสารสินเชื่อ', 'ตรวจสอบเครดิตบูโร', 'โทรยืนยันนัดหมาย', 'ส่งใบเสนอราคา', 'ติดตามผลการอนุมัติ']);
/** the texts of an appointment / a task that was made without a detail */
const DEFAULT_DETAILS = reference('shared.defaultDetails', { appointment: 'นัดหมายกับลูกค้าตามที่ตกลงทางโทรศัพท์', task: 'ดำเนินการให้เสร็จก่อนนัดหมายถัดไป' });

/* ================================================================================== the leads */
export interface SeedLeadModel {
  id: number;
  seed: SeedLead;
  product: SeedProduct;
  /** visited workflow groups, oldest first; the last one is the current group (none for a product without a workflow) */
  groups: SeedGroup[];
  stepName: string;
  /** the responsible employee (null = nobody yet) */
  ownerCode: string | null;
  salePersonCode: string;
  closed: boolean;
}

const leadCache = new Map<number, SeedLeadModel>();
/** lead `n` (1..SEED_LEAD_COUNT) as the Activities mock builds it (same formulas) */
export function leadModel(n: number): SeedLeadModel {
  const hit = leadCache.get(n);
  if (hit) return hit;
  const seed = seedLead(n);
  const product = productOfLead(n);
  const h = (salt: number) => seedHash(n, salt);
  let groups: SeedGroup[] = [];
  let stepName = NOWF_STEPS[h(104) % NOWF_STEPS.length];
  if (product.usesWorkflowStep) {
    const ci = seed.groupIdx % product.groups.length;
    const take = h(103) % 5 === 0 && ci >= 2 ? 3 : h(101) % 2 === 0 && ci >= 1 ? 2 : 1;
    groups = product.groups.slice(ci - take + 1, ci + 1);
    const steps = GROUP_STEPS[groups[groups.length - 1].code];
    stepName = steps[h(104) % steps.length];
  }
  const interest = seed.interest;
  const leadStatus = interest === 'HOT' || interest === 'WARM' || interest === 'COLD' ? 'ACTIVE' : interest;
  const closed = leadStatus === 'SUCCESS' || leadStatus === 'LOST';
  const model: SeedLeadModel = {
    id: n,
    seed,
    product,
    groups,
    stepName,
    ownerCode: !closed && h(111) % 10 === 0 ? null : seed.ownerCode,
    salePersonCode: SEED_EMPLOYEES[h(112) % SEED_EMPLOYEES.length].code,
    closed,
  };
  leadCache.set(n, model);
  return model;
}
export const currentGroup = (l: SeedLeadModel): SeedGroup | undefined => l.groups[l.groups.length - 1];
export const teamOfLead = (l: SeedLeadModel) => saleGroupOfTeam(employeeByCode(l.salePersonCode)!.team);
export const groupName = (id: number): string => PRODUCTS.flatMap((p) => p.groups).find((g) => g.id === id)?.name ?? '';
export const groupCode = (id: number): string => PRODUCTS.flatMap((p) => p.groups).find((g) => g.id === id)?.code ?? '';
export const leadTxNo = (n: number): string => `LD-2026-${String(n).padStart(5, '0')}`;
export { SEED_LEAD_COUNT, SEED_TODAY, seedProspect };

/* ================================================================================== the rows */
export type ScheduleKind = 'APPOINTMENT' | 'TASK';
export interface ScheduleRow {
  id: number;
  leadId: number;
  kind: ScheduleKind;
  subject: string;
  detail: string;
  /** yyyy-MM-dd */
  date: string;
  /** HH:mm:ss, null for an all-day item */
  time: string | null;
  allDay: boolean;
  /** appointment: scheduled | re-schedule | success | cancel · task: doing | success | cancel */
  status: string;
  /** workflow group the item was made in (0 = a product without a workflow) */
  groupId: number;
  stepName: string;
  /** employee code of the person responsible for the item (null = nobody) */
  assigneeCode: string | null;
  remark: string;
  /** yyyy-MM-dd HH:mm:ss — when the item was created */
  createTime: string;
}

const pad = (n: number, w = 2): string => String(n).padStart(w, '0');
const DAY = 86_400_000;
const dateOf = (offsetDays: number): string => seedDate(-offsetDays);
const createTimeOf = (date: string, salt: number): string => {
  const d = new Date(Date.parse(date + 'T00:00:00Z') - (1 + (salt % 9)) * DAY);
  return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())} ${pad(8 + (salt % 9))}:${pad((salt * 7) % 60)}:${pad((salt * 13) % 60)}`;
};

/** the appointments / tasks of lead `n` exactly as the Activities mock makes them (ids 5_000_000 + n * 10 + k) + who is responsible */
export function baseRowsOfLead(n: number): ScheduleRow[] {
  const lead = leadModel(n);
  const h = (salt: number) => seedHash(n, salt);
  const g = currentGroup(lead);
  const out: ScheduleRow[] = [];
  const assignee = (k: number): string | null => (h(215 + k) % 11 === 0 ? null : h(216 + k) % 3 === 0 ? lead.salePersonCode : (lead.ownerCode ?? lead.salePersonCode));
  const nAppt = h(180) % 4;
  const nTask = h(181) % 4;
  for (let k = 0; k < nAppt; k++) {
    const date = seedDate(-((h(184 + k) % 20) - 4));
    out.push({
      id: 5_000_000 + n * 10 + k,
      leadId: n,
      kind: 'APPOINTMENT',
      subject: APPT_SUBJECTS[h(183 + k) % APPT_SUBJECTS.length],
      detail: DEFAULT_DETAILS.appointment,
      date,
      time: `${pad(9 + (h(185 + k) % 8))}:${h(186 + k) % 2 ? '30' : '00'}:00`,
      allDay: false,
      status: ['scheduled', 'scheduled', 're-schedule', 'success'][h(182 + k) % 4],
      groupId: g?.id ?? 0,
      stepName: lead.stepName,
      assigneeCode: assignee(k),
      remark: '',
      createTime: createTimeOf(date, h(217 + k)),
    });
  }
  for (let k = 0; k < nTask; k++) {
    const allDay = h(191 + k) % 3 === 0;
    const date = seedDate(-((h(193 + k) % 14) - 3));
    out.push({
      id: 5_000_000 + n * 10 + 5 + k,
      leadId: n,
      kind: 'TASK',
      subject: TASK_SUBJECTS[h(192 + k) % TASK_SUBJECTS.length],
      detail: DEFAULT_DETAILS.task,
      date,
      time: allDay ? null : `${pad(10 + (h(194 + k) % 7))}:00:00`,
      allDay,
      status: ['doing', 'doing', 'success', 'cancel'][h(190 + k) % 4],
      groupId: g?.id ?? 0,
      stepName: lead.stepName,
      assigneeCode: assignee(5 + k),
      remark: '',
      createTime: createTimeOf(date, h(222 + k)),
    });
  }
  return out;
}

/* ---------------------------------------------------------------------------------- the extra rows (Schedule only, ids 6_000_000+) */
const EXTRA_BASE = 6_000_000;
/** the leads of the cast that belong to the company now (the rows of the calendar are made for these) */
const castLeadIds = (): number[] => leadIds().filter((n) => n <= SEED_LEAD_COUNT);

/** the leads of สินเชื่อบ้าน that are still open, in id order (the rows of the dense block belong to them) */
function houseLeads(): number[] {
  const out: number[] = [];
  for (const n of castLeadIds()) if (productOfLead(n) === PRODUCTS[0] && !leadModel(n).closed) out.push(n);
  return out;
}

/**
 * The special rows of the calendar (overlaps, all day, after midnight, a long title, special characters, other months and years): `leadSlot` picks the
 * lead (of the house loans), `day` is the offset from today unless `date` (yyyy-MM-dd) is given, `time` '' = no time, `step` = index of the step of the
 * first group, `assignee` '' = nobody. `ref.shared.json` › `specialScheduleRows` of the shared Datasource when it has them.
 */
interface SpecialRow {
  leadSlot: number;
  kind: string;
  subject: string;
  detail: string;
  day: number;
  date: string;
  time: string;
  allDay: boolean;
  status: string;
  step: number;
  assignee: string;
}
const SPECIAL_ROWS = reference<SpecialRow[]>('shared.specialScheduleRows', [
  { leadSlot: 40, kind: 'APPOINTMENT', subject: 'นัดซ้อนเวลา 1', detail: '', day: 0, date: '', time: '10:00:00', allDay: false, status: 'scheduled', step: 2, assignee: 'E101' },
  { leadSlot: 41, kind: 'APPOINTMENT', subject: 'นัดซ้อนเวลา 2', detail: '', day: 0, date: '', time: '10:00:00', allDay: false, status: 'scheduled', step: 2, assignee: 'E102' },
  { leadSlot: 42, kind: 'APPOINTMENT', subject: 'นัดซ้อนเวลา 3', detail: '', day: 0, date: '', time: '10:00:00', allDay: false, status: 'scheduled', step: 2, assignee: 'E103' },
  { leadSlot: 43, kind: 'TASK', subject: 'งานเวลาเดียวกัน', detail: '', day: 0, date: '', time: '10:00:00', allDay: false, status: 'doing', step: 1, assignee: 'E104' },
  { leadSlot: 44, kind: 'APPOINTMENT', subject: 'นัดตลอดวัน', detail: '', day: 0, date: '', time: '', allDay: true, status: 'scheduled', step: 2, assignee: 'E101' },
  { leadSlot: 45, kind: 'TASK', subject: 'งานตลอดวัน', detail: '', day: 0, date: '', time: '', allDay: true, status: 'doing', step: 0, assignee: 'E102' },
  { leadSlot: 46, kind: 'TASK', subject: 'งานหลังเที่ยงคืน', detail: '', day: 0, date: '', time: '00:30:00', allDay: false, status: 'doing', step: 0, assignee: '' },
  { leadSlot: 47, kind: 'APPOINTMENT', subject: 'นัดดึก', detail: '', day: 0, date: '', time: '23:30:00', allDay: false, status: 'scheduled', step: 2, assignee: 'E103' },
  { leadSlot: 48, kind: 'APPOINTMENT', subject: 'นัดที่ถูกยกเลิก', detail: '', day: -1, date: '', time: '14:00:00', allDay: false, status: 'cancel', step: 2, assignee: 'E105' },
  { leadSlot: 49, kind: 'APPOINTMENT', subject: 'นัดหมายลูกค้าเพื่อพิจารณาสินเชื่อบ้านพร้อมตรวจสอบเอกสารประกอบการขออนุมัติทั้งหมด (ชื่อยาวเพื่อทดสอบการตัดคำ)', detail: 'รายละเอียดยาว รายละเอียดยาว รายละเอียดยาว รายละเอียดยาว รายละเอียดยาว รายละเอียดยาว รายละเอียดยาว รายละเอียดยาว รายละเอียดยาว รายละเอียดยาว รายละเอียดยาว รายละเอียดยาว ', day: 1, date: '', time: '11:00:00', allDay: false, status: 're-schedule', step: 3, assignee: 'E106' },
  { leadSlot: 50, kind: 'TASK', subject: '<b>ตัวอักษรพิเศษ</b> & "อัญประกาศ" <i>', detail: 'a < b && c > d', day: 1, date: '', time: '15:00:00', allDay: false, status: 'doing', step: 1, assignee: 'E107' },
  { leadSlot: 51, kind: 'APPOINTMENT', subject: 'นัดสิ้นเดือน', detail: '', day: 0, date: '2026-10-31', time: '09:30:00', allDay: false, status: 'scheduled', step: 2, assignee: 'E108' },
  { leadSlot: 52, kind: 'TASK', subject: 'งานต้นเดือน', detail: '', day: 0, date: '2026-11-01', time: '09:00:00', allDay: false, status: 'doing', step: 1, assignee: 'E101' },
  { leadSlot: 53, kind: 'APPOINTMENT', subject: 'นัดปลายปี', detail: '', day: 0, date: '2026-12-31', time: '16:00:00', allDay: false, status: 'scheduled', step: 2, assignee: 'E102' },
  { leadSlot: 54, kind: 'TASK', subject: 'งานข้ามปี', detail: '', day: 0, date: '2027-01-01', time: '', allDay: true, status: 'doing', step: 0, assignee: 'E103' },
  { leadSlot: 55, kind: 'APPOINTMENT', subject: 'นัดปีที่แล้ว', detail: '', day: 0, date: '2025-12-31', time: '10:00:00', allDay: false, status: 'success', step: 2, assignee: 'E104' },
]);

export function extraRows(): ScheduleRow[] {
  const rows: ScheduleRow[] = [];
  const house = houseLeads();
  const cs = SEED_GROUPS[0]; // the first workflow group = the group the page opens on
  let seq = 0;
  const add = (r: Omit<ScheduleRow, 'id' | 'createTime' | 'remark' | 'detail' | 'groupId' | 'stepName'> & Partial<Pick<ScheduleRow, 'detail' | 'groupId' | 'stepName' | 'remark'>>): ScheduleRow => {
    const lead = leadModel(r.leadId);
    const g = currentGroup(lead);
    const id = EXTRA_BASE + seq++;
    const row: ScheduleRow = {
      detail: r.kind === 'APPOINTMENT' ? DEFAULT_DETAILS.appointment : DEFAULT_DETAILS.task,
      groupId: g?.id ?? 0,
      stepName: lead.stepName,
      remark: '',
      ...r,
      id,
      createTime: createTimeOf(r.date, id % 997),
    };
    rows.push(row);
    return row;
  };

  // (a) the dense block: สินเชื่อบ้าน / first group, from 6 days ago to 19 days ahead — several pages per board column, a "more" in many cells
  for (let i = 0; i < 90; i++) {
    const kind: ScheduleKind = i % 5 < 3 ? 'APPOINTMENT' : 'TASK';
    const allDay = i % 13 === 0;
    add({
      leadId: house[(i * 7) % house.length],
      kind,
      subject: (kind === 'APPOINTMENT' ? APPT_SUBJECTS : TASK_SUBJECTS)[i % 5],
      date: dateOf(((i * 7) % 26) - 6),
      time: allDay ? null : `${pad(9 + ((i * 3) % 9))}:${i % 2 ? '30' : '00'}:00`,
      allDay,
      status: kind === 'APPOINTMENT' ? ['scheduled', 'scheduled', 'scheduled', 're-schedule', 'success', 'cancel'][seedHash(i, 300) % 6] : ['doing', 'doing', 'doing', 'success', 'cancel'][seedHash(i, 301) % 5],
      groupId: cs.id,
      stepName: GROUP_STEPS['CS'][i % 4],
      assigneeCode: i % 11 === 0 ? null : SEED_EMPLOYEES[(i * 3) % SEED_EMPLOYEES.length].code,
    });
  }

  // (b) other months and years: marks in the year view, items when the calendar is moved (SEED_TODAY is 2026-10-20)
  const mine = castLeadIds();
  for (let i = 0; i < 40; i++) {
    const n = mine[(i * 37) % mine.length] ?? 1;
    const kind: ScheduleKind = i % 2 ? 'TASK' : 'APPOINTMENT';
    const time = `${pad(9 + ((i * 5) % 9))}:00:00`;
    add({
      leadId: n,
      kind,
      subject: (kind === 'APPOINTMENT' ? APPT_SUBJECTS : TASK_SUBJECTS)[(i + 2) % 5],
      date: dateOf(((i * 53) % 420) - 280),
      time,
      allDay: false,
      status: kind === 'APPOINTMENT' ? ['scheduled', 'success', 're-schedule', 'cancel'][i % 4] : ['doing', 'success', 'cancel'][i % 3],
      assigneeCode: SEED_EMPLOYEES[i % SEED_EMPLOYEES.length].code,
    });
  }

  // (c) the special rows — all of them in สินเชื่อบ้าน / first group, today unless said otherwise
  const lead = (k: number): number => house[k % house.length];
  const t = (offset = 0): string => dateOf(offset);
  for (const r of SPECIAL_ROWS) {
    add({
      leadId: lead(r.leadSlot),
      kind: r.kind === 'TASK' ? 'TASK' : 'APPOINTMENT',
      subject: r.subject,
      ...(r.detail ? { detail: r.detail } : {}),
      date: r.date || t(r.day),
      time: r.time || null,
      allDay: r.allDay,
      status: r.status as ScheduleRow['status'],
      groupId: cs.id,
      stepName: GROUP_STEPS['CS'][r.step],
      assigneeCode: r.assignee || null,
    });
  }
  return rows;
}

let rowsCache: ScheduleRow[] | null = null;
/** every row of the seed (base + extra), in id order; the objects are shared — the mock copies before it changes anything */
export function seedScheduleRows(): ScheduleRow[] {
  if (!rowsCache) {
    const rows: ScheduleRow[] = [];
    for (const n of castLeadIds()) rows.push(...baseRowsOfLead(n));
    rows.push(...extraRows());
    rowsCache = rows;
  }
  return rowsCache;
}

