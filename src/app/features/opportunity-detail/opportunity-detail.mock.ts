/**
 * Deterministic fake backend of the Lead detail page (dev / `mock: true`, tests and the Java-vs-Angular comparison).
 *
 * It answers in exactly the shapes the page script reads — the JSON of the BFF servlets under `/board/*` (`LeadDetailServlet`,
 * `ActivityGroupsServlet`, `LeadForwardServlet` … which pass the `triplesale-service` answer through) — and the one value the server
 * rendered into the markup (`commonBean.uploadAcceptExt`). The people and the leads are the shared cast of `@core/mock/crm-seed`
 * (`seedLead(n)`), so the lead you click in the list is the lead (and the customer) this page opens.
 *
 * What differs between leads (so that every branch of the page can be shown):
 *   n % 9 == 0   usesWorkflowStep = false (no stepbar, no group tag, "add access" button)       n == 239   one activity group
 *   n % 11 == 0  no responsible employee ("add owner" button)                                    n == 240   twelve activity groups
 *   n % 13 == 0  no sales team                                                                   n % 10 == 5  no contact history
 *   ACTIVE / SUCCESS / LOST come from the seed; lead 237 is SOLD
 *   ids 900..903 fail on purpose: 900 = 403 (no permission), 901 = 400, 902 = 500, 903 = an empty answer; others above the cast = 404
 * Writes change the lead for as long as the module lives (`resetMockLeadDetail()` starts over): lead-update, contact-activities,
 * forward / return / close-step / close, tags, products, accessors, prospect save, avatar, attachments, the saved history filter, and the
 * appointments / tasks of the work modal (`@shared/work-modal/work-modal.mock` is the servlet layer, the data is here).
 * A request can be made to fail by its text: a contact note / remark with "[500]" (or "#500", which the page's input guard lets be typed)
 * answers 500, "[400]" / "#400" answers 400, "#net" is not JSON; an appointment subject with "#fail" is refused (see `trigger`).
 *
 * Framework-free on purpose (no Angular imports): the comparison harness loads this file in Node.
 */
import { msg, reference } from '@core/mock/reference';
import { MOCK_COUNTRIES } from '@core/http/mock-countries';
import { SEED_EMPLOYEES, SEED_GROUPS, SEED_PROVINCES, SEED_TODAY, isKnownLead, leadIds, seedDate, seedHash, seedLead, seedProspect } from '@core/mock/crm-seed';
import { datasourceDoc } from '@core/mockup/mockup-datasource';
import { upsertSharedLead } from '@core/mock/shared-db';
import { stepProbability } from '@core/mock/step-probability';
import { isHeadOf, isInQueue, ownerOf, reassign } from '@core/mock/waitlist';
import { handleWorkModalRequest, toResponse, type ScheduleEnvelope, type WorkModalData } from '@shared/work-modal/work-modal.mock';
import type { OpportunityDetailBackend, OpportunityDetailInitial } from './opportunity-detail-backend';

/** FileServerAccess.uploadAcceptAttr(): the extensions of ALLOWED_EXT sorted and joined with "," (no space) — what commonBean.uploadAcceptExt gives */
export const MOCK_UPLOAD_ACCEPT = '.7z,.csv,.doc,.docx,.gif,.jpeg,.jpg,.pdf,.png,.ppt,.pptx,.rar,.txt,.webp,.xls,.xlsx,.zip';

export interface OpportunityDetailMockOptions {
  /** the signed-in employee (`ss_employee_id`): the lead owner check of the page compares it with `employee.id` */
  employeeId?: number | null;
  /** may see and change the deal value (`Pipeline_Opportunity_Company_Financial_Data`); false = masked and refused (default: may) */
  canSeeFinancial?: boolean;
  /** milliseconds every answer waits (the host uses a little, the harness 0 and adds its own) */
  delayMs?: number;
}

type Json = Record<string, unknown>;

/* =================================================================================================================== the cast */
const EMP_ID = (code: string): number => 1001 + SEED_EMPLOYEES.findIndex((e) => e.code === code);
const empOf = (i: number) => ({ id: EMP_ID(SEED_EMPLOYEES[i % SEED_EMPLOYEES.length].code), code: SEED_EMPLOYEES[i % SEED_EMPLOYEES.length].code, name: SEED_EMPLOYEES[i % SEED_EMPLOYEES.length].name, attachFile: '' });
const EMPLOYEES = SEED_EMPLOYEES.map((_, i) => empOf(i));
const EMP_BY_ID = new Map(EMPLOYEES.map((e) => [e.id, e]));
const TEAMS = reference('opportunityDetail.teams', [
  { id: 2001, code: 'TA', name: 'ทีม A' },
  { id: 2002, code: 'TB', name: 'ทีม B' },
]);
const TEAM_OF = (code: string) => (SEED_EMPLOYEES.find((e) => e.code === code)?.team === 'ทีม B' ? TEAMS[1] : TEAMS[0]);
const SALE_PERSONS = EMPLOYEES.map((e, i) => ({ id: 3001 + i, code: 'S' + e.code.slice(1), name: e.name, employee: e, saleGroupId: TEAM_OF(e.code).id }));

const TAGS = reference('opportunityDetail.tags', [
  { id: 4001, code: 'VIP', name: 'VIP', colorCode: '#EB5050' },
  { id: 4002, code: 'NEW', name: 'ลูกค้าใหม่', colorCode: '#4B84FF' },
  { id: 4003, code: 'FOLLOW', name: 'ติดตามผล', colorCode: '#FF8E4E' },
  { id: 4004, code: 'FOREIGN', name: 'ชาวต่างชาติ', colorCode: '#6043B6' },
  { id: 4005, code: 'REFER', name: 'ลูกค้าแนะนำ', colorCode: '#008B5A' },
  { id: 4006, code: 'COMPANY', name: 'นิติบุคคล', colorCode: '#0D61CF' },
  { id: 4007, code: 'URGENT', name: 'เร่งด่วน', colorCode: '#EB4FA0' },
  { id: 4008, code: 'DOCS', name: 'รอเอกสาร', colorCode: '#009ED0' },
]);
const MATERIAL_GROUPS = reference('opportunityDetail.materialGroups', [
  { id: 5001, code: 'LOAN', name: 'สินเชื่อบ้าน' },
  { id: 5002, code: 'REFI', name: 'รีไฟแนนซ์' },
  { id: 5003, code: 'LAND', name: 'สินเชื่อที่ดิน' },
]);
const MATERIALS = reference('opportunityDetail.materials', [
  { id: 6001, code: 'M001', name: 'สินเชื่อบ้านใหม่', groupId: 5001 },
  { id: 6002, code: 'M002', name: 'สินเชื่อบ้านมือสอง', groupId: 5001 },
  { id: 6003, code: 'M003', name: 'สินเชื่อสร้างบ้าน', groupId: 5001 },
  { id: 6004, code: 'M004', name: 'รีไฟแนนซ์ลดดอกเบี้ย', groupId: 5002 },
  { id: 6005, code: 'M005', name: 'รีไฟแนนซ์เพิ่มวงเงิน', groupId: 5002 },
  { id: 6006, code: 'M006', name: 'สินเชื่อซื้อที่ดินเปล่า', groupId: 5003 },
]);

/** the steps of each activity group (ids are `groupId * 100 + position`) */
const STEP_NAMES: Record<string, string[]> = reference('opportunityDetail.stepNames', {
  CS: ['รับลีดใหม่', 'โทรติดต่อลูกค้า', 'นัดหมายพบลูกค้า', 'ส่งต่อทีมวิเคราะห์'],
  AN: ['ตรวจสอบเอกสาร', 'วิเคราะห์ความเสี่ยง', 'สรุปผลวิเคราะห์'],
  PLS: ['คัดกรองเบื้องต้น', 'ประเมินวงเงิน', 'เสนอผลิตภัณฑ์'],
  LS: ['ยื่นคำขอสินเชื่อ', 'พิจารณาอนุมัติ', 'แจ้งผลอนุมัติ'],
  FI: ['ตรวจสอบบัญชีผู้รับเงิน', 'จัดเตรียมการโอนเงิน'],
  LE: ['ทำสัญญาสินเชื่อ', 'จดทะเบียนหลักประกัน'],
  CRM: ['ติดตามหลังการขาย', 'สำรวจความพึงพอใจ'],
});
/** the groups 8..12 exist for lead 240 only (twelve groups: the longest row of the stepper palette) */
const EXTRA_GROUPS = reference('opportunityDetail.extraGroups', ['ตรวจสอบสิทธิ์', 'ประเมินราคา', 'อนุมัติภายใน', 'ออกเอกสาร', 'ติดตามผล']).map((name, i) => ({ id: 108 + i, code: 'X' + (i + 1), name }));
const ALL_GROUPS = [...SEED_GROUPS.map((g) => ({ id: g.id as number, code: g.code as string, name: g.name as string })), ...EXTRA_GROUPS];
const stepsOf = (g: { id: number; code: string }): { id: number; code: string; name: string }[] =>
  (STEP_NAMES[g.code] ?? ['ขั้นตอนที่ 1', 'ขั้นตอนที่ 2']).map((name, i) => ({ id: g.id * 100 + i + 1, code: `${g.code}${String(i + 1).padStart(2, '0')}`, name }));
/** the people of each group (the group's department, as in the Dashboard mock) */
const DEPT_EMP: Record<string, string[]> = reference('opportunityDetail.deptEmployees', {
  CS: ['E101', 'E102', 'E103', 'E104'],
  AN: ['E105', 'E106'],
  PLS: ['E103', 'E107'],
  LS: ['E105', 'E108'],
  FI: ['E106'],
  LE: ['E107', 'E108'],
  CRM: ['E102', 'E104'],
});
const deptEmployees = (g: { code: string }) => (DEPT_EMP[g.code] ?? ['E101', 'E102']).map((c) => EMPLOYEES.find((e) => e.code === c)!);
/** groups that can be worked in parallel share the order number (PLS and LS) */
const ORDER_NO = (idx: number): number => (idx >= 3 ? idx : idx + 1);

const CHANNELS = reference('opportunityDetail.channels', [
  { type: 'manual', channel: 'manual', label: 'Note' },
  { type: 'call_out', channel: 'Call out', label: 'โทรออก' },
  { type: 'call_in', channel: 'call in', label: 'โทรเข้า' },
  { type: 'line', channel: 'line', label: 'LINE' },
  { type: 'sms', channel: 'sms', label: 'SMS' },
  { type: 'email', channel: 'email', label: 'อีเมล' },
  { type: 'facebook', channel: 'facebook', label: 'Facebook' },
  { type: 'whatsapp', channel: 'whatsapp', label: 'WhatsApp' },
]);
const NOTES = reference('opportunityDetail.notes', [
  'ลูกค้าสนใจสินเชื่อบ้านวงเงิน 3 ล้านบาท ขอเอกสารเพิ่มเติม',
  'โทรติดต่อลูกค้าแล้ว นัดส่งเอกสารรายได้ภายในสัปดาห์นี้',
  'ลูกค้าสอบถามอัตราดอกเบี้ยและระยะเวลาผ่อนชำระ',
  'ส่งใบเสนอราคาให้ลูกค้าทางอีเมลเรียบร้อย',
  'ลูกค้าขอเลื่อนนัดพบเป็นวันจันทร์หน้า',
  'ตรวจสอบเอกสารครบถ้วน รอผลวิเคราะห์',
  'ลูกค้าแจ้งว่ามีผู้กู้ร่วม จะนำเอกสารมาเพิ่ม',
]);

/** the texts of the appointments / tasks of a lead (the title is picked by position, so the lists may have any length) */
const ITEM_TEXTS = reference('opportunityDetail.itemTexts', {
  taskTitles: ['ติดตามเอกสารรายได้', 'เตรียมใบเสนอราคา', 'โทรยืนยันนัดหมาย', 'ส่งสัญญาให้ลูกค้า'],
  appointmentTitles: ['นัดพบลูกค้าที่สำนักงาน', 'นัดดูทรัพย์', 'นัดเซ็นเอกสารสินเชื่อ'],
  taskDetail: 'ตรวจสอบความครบถ้วนของเอกสารและแจ้งลูกค้า',
  appointmentDetail: 'พบลูกค้าเพื่อสรุปเงื่อนไขสินเชื่อ',
});
/** the sample values of the customer card of a lead (what the cast does not decide) */
const SAMPLE = reference('opportunityDetail.sampleCustomer', {
  remark: 'ลูกค้าแนะนำจากคุณสมชาย',
  demand: 'ต้องการสินเชื่อซื้อบ้านเดี่ยว วงเงินไม่เกิน 3,500,000 บาท',
  convenientDays: ['วันทำการ', 'ทุกวัน'],
  occupations: [
    { code: 'OC1', name: 'พนักงานบริษัท' },
    { code: 'OC2', name: 'เจ้าของกิจการ' },
    { code: 'OC3', name: 'ข้าราชการ' },
  ],
  workplaceName: 'บริษัท ตัวอย่าง จำกัด',
  workplacePosition: 'ผู้จัดการ',
  workplaceAddress: '99 ถนนสุขุมวิท กรุงเทพมหานคร',
  referralName: 'คุณวิภา ใจดี',
  referralRelate: 'เพื่อน',
});

/* =================================================================================================================== dates */
const dayNum = (iso: string): number => Math.floor(Date.UTC(+iso.slice(0, 4), +iso.slice(5, 7) - 1, +iso.slice(8, 10)) / 86_400_000);
const TODAY_N = dayNum(SEED_TODAY);
const isoOf = (n: number): string => new Date(n * 86_400_000).toISOString().slice(0, 10);
const pad2 = (n: number): string => (n < 10 ? '0' : '') + n;
const dmy = (iso: string): string => `${iso.slice(8, 10)}/${iso.slice(5, 7)}/${iso.slice(0, 4)}`;
const phone = (digits: string): string => digits.replace(/\D/g, '');

/* =================================================================================================================== the lead */
interface GroupRef {
  id: number;
  code: string;
  name: string;
}
interface HistoryItem {
  changeDate: string;
  workRecordDate?: string;
  type: string;
  channel: string;
  content: string;
  procedureGroupId: number | null;
  procedureGroupName: string;
  procedureId: number | null;
  procedureName: string;
  employee: { id: number; code: string; name: string; attachFile: string };
}
interface LeadState {
  closed?: 'SUCCESS' | 'LOST';
  /** the day the status last changed (`opp_status_date` of the design); the system writes it only when the value really changes */
  statusDate?: string;
  /** how many writes the opportunity has had; a write that carries an older `version` is refused (409 VERSION_CONFLICT) */
  version?: number;
  /** the people who were in charge before (EX Responsible Person of the design), oldest first */
  exResponsible?: string[];
  activeStatus?: string;
  amount?: number;
  targetMonth?: number;
  targetYear?: string;
  demand?: string;
  tagIds?: number[];
  saleGroupId?: number | null;
  salePersonId?: number | null;
  employeeId?: number | null;
  /** where the lead is after a forward / return / contact on another step: [group index, step index, assignee id] */
  at?: [number, number, number];
  /** the step group closed with "ปิดแก้ไขกลุ่มขั้นตอน" */
  stepClosed?: boolean;
  history: HistoryItem[];
  materialsAdded: { id: number; name: string; detailOrderNo: number }[];
  materialsRemoved: number[];
  accessorsAdded: number[];
  /** appointments / tasks created with the work modal, and the changes made to any of them (by id) */
  schedAdded?: Json[];
  schedEdits?: Record<string, Json>;
  tick: number;
}
interface ProspectState {
  data?: Json;
  attachFile?: string;
  attachments?: { detailOrderNo: number; attachFile: string; description: string }[];
}
interface MockState {
  leads: Map<number, LeadState>;
  prospects: Map<number, ProspectState>;
  filterState: unknown;
  docSeq: number;
}
const fresh = (): MockState => ({ leads: new Map(), prospects: new Map(), filterState: null, docSeq: 0 });
/**
 * The changes live in the module, and — when the browser has sessionStorage — also in this tab's storage, so that a reload of the browser
 * page (F5) keeps them like the real database does; the page itself reloads without that (it starts its view again). In Node (the comparison
 * harness) there is no sessionStorage: the state is the module's.
 */
// "ts.mock." keys are mirrored into Datasource/ by the mockup file server (core/mockup/mockup-bootstrap.ts): the state survives a restart too
const STORE_KEY = 'ts.mock.lead-detail.state';
const store = (): Storage | null => {
  try {
    return (globalThis as { sessionStorage?: Storage }).sessionStorage ?? null;
  } catch {
    return null;
  }
};
function restore(): MockState {
  try {
    const raw = store()?.getItem(STORE_KEY);
    if (raw) {
      const v = JSON.parse(raw) as { leads: [number, LeadState][]; prospects: [number, ProspectState][]; filterState: unknown; docSeq: number };
      return { leads: new Map(v.leads), prospects: new Map(v.prospects), filterState: v.filterState, docSeq: v.docSeq };
    }
  } catch {
    /* unreadable: start clean */
  }
  return fresh();
}
function persist(): void {
  try {
    store()?.setItem(STORE_KEY, JSON.stringify({ leads: [...STATE.leads], prospects: [...STATE.prospects], filterState: STATE.filterState, docSeq: STATE.docSeq }));
  } catch {
    /* storage full / blocked: the module copy is enough */
  }
}
let STATE = restore();
export function resetMockLeadDetail(): void {
  STATE = fresh();
  try {
    store()?.removeItem(STORE_KEY);
  } catch {
    /* nothing stored */
  }
}
/** the interest statuses a person may set (design 4.1); SOLD / LOST are set by the system alone, when the opportunity enters a step of 100% / 0% */
const OPEN_STATUSES: readonly string[] = ['new', 'hot', 'warm', 'cold', 'inactive'];
const SYSTEM_STATUSES: readonly string[] = ['sold', 'lost', 'success', 'loss'];
const isClosedLead = (n: number): boolean => !!stateOf(n).closed || seedLead(n).status !== 'ACTIVE';
/** the answer in the shape of the API standard: `error.code` is what the page reads */
const refuse = (status: number, code: string, message: string): Response => fail(status, message, { error: { code, description: message } });
/** a sold / lost opportunity is read-only (409 OPPORTUNITY_CLOSED) and one in the queue can be neither edited nor moved (409 OPPORTUNITY_IN_WAITLIST) */
function writeBlocked(n: number): Response | undefined {
  if (isClosedLead(n)) return refuse(409, 'OPPORTUNITY_CLOSED', msg('โอกาสขายที่ปิดแล้วเป็นแบบอ่านอย่างเดียว'));
  if (isInQueue('opportunity', n)) return refuse(409, 'OPPORTUNITY_IN_WAITLIST', msg('โอกาสขายอยู่ใน Wait List — รับงานก่อนจึงจะทำรายการได้'));
  return undefined;
}

const stateOf = (n: number): LeadState => {
  let s = STATE.leads.get(n);
  if (!s) STATE.leads.set(n, (s = { history: [], materialsAdded: [], materialsRemoved: [], accessorsAdded: [], tick: 0 }));
  return s;
};
const prospectState = (id: number): ProspectState => {
  let s = STATE.prospects.get(id);
  if (!s) STATE.prospects.set(id, (s = {}));
  return s;
};

const usesWf = (n: number): boolean => n % 9 !== 0;
const hasOwner = (n: number): boolean => n % 11 !== 0;
const hasTeam = (n: number): boolean => n % 13 !== 0;
const hasHistory = (n: number): boolean => n % 10 !== 5;
const groupsOf = (n: number): GroupRef[] => {
  if (!usesWf(n)) return [];
  if (n === 239) return ALL_GROUPS.slice(0, 1);
  if (n === 240) return ALL_GROUPS.slice(0, 12);
  const k = 2 + (seedHash(n, 30) % 6);
  return ALL_GROUPS.slice(0, Math.max(k, seedLead(n).groupIdx + 1));
};
const baseAt = (n: number): [number, number, number] => {
  const lead = seedLead(n);
  const groups = groupsOf(n);
  const gi = groups.length ? Math.min(lead.groupIdx, groups.length - 1) : 0;
  const steps = stepsOf(groups[gi] ?? ALL_GROUPS[0]);
  const si = seedHash(n, 20) % steps.length;
  const owner = EMPLOYEES.find((e) => e.code === lead.ownerCode)!;
  const assignee = EMPLOYEES[(EMPLOYEES.indexOf(owner) + (n % 3 === 0 ? gi : 0)) % EMPLOYEES.length];
  return [gi, si, assignee.id];
};
const statusOf = (n: number): 'ACTIVE' | 'SUCCESS' | 'LOST' | 'SOLD' => {
  const s = stateOf(n);
  if (s.closed) return s.closed;
  return n === 237 ? 'SOLD' : seedLead(n).status;
};

/** the history of a lead: what happened in every step it went through (newest first) */
function historyOf(n: number): HistoryItem[] {
  const st = stateOf(n);
  const items: HistoryItem[] = [];
  if (hasHistory(n)) {
    const groups = usesWf(n) ? groupsOf(n) : [];
    const [gi, si] = st.at ?? baseAt(n);
    const lastGroup = groups.length ? gi : 0;
    let seq = 0;
    const span = Math.min(120, 8 + (seedHash(n, 40) % 60));
    const total = groups.length ? lastGroup + 1 : 2;
    for (let g = 0; g < total; g++) {
      const grp = groups[g];
      const steps = grp ? stepsOf(grp) : [];
      const upTo = grp ? (g < lastGroup ? steps.length : si + 1) : 3;
      for (let s = 0; s < upTo; s++) {
        const count = 1 + (seedHash(n * 31 + g * 7 + s, 41) % 2);
        for (let c = 0; c < count; c++) {
          const ch = CHANNELS[seedHash(n * 17 + g * 5 + s * 3 + c, 42) % CHANNELS.length];
          const emp = grp ? deptEmployees(grp)[(s + c) % deptEmployees(grp).length] : EMPLOYEES[(n + s) % EMPLOYEES.length];
          const day = Math.max(0, span - Math.floor((seq * span) / Math.max(1, total * 3)));
          const stamp = `${seedDate(day)}T${pad2(9 + ((seq * 2) % 9))}:${pad2((seq * 13) % 60)}:00`;
          items.push({
            changeDate: stamp,
            ...(c === 0 && (n + g + s) % 3 === 0 ? { workRecordDate: `${seedDate(day + 1)}T10:30:00` } : {}),
            type: ch.type,
            channel: ch.channel,
            content: NOTES[seedHash(n * 13 + seq, 43) % NOTES.length],
            procedureGroupId: grp ? grp.id : null,
            procedureGroupName: grp ? grp.name : '',
            procedureId: grp ? steps[s].id : null,
            procedureName: grp ? steps[s].name : '',
            employee: emp,
          });
          seq++;
        }
      }
      if (grp && g < lastGroup) {
        const next = groups[g + 1];
        items.push({
          changeDate: `${seedDate(Math.max(0, span - Math.floor(((seq + 1) * span) / Math.max(1, total * 3))))}T17:45:00`,
          type: 'forward',
          channel: 'forward',
          content: msg('ส่งต่องานไปยัง {0}', next.name),
          procedureGroupId: grp.id,
          procedureGroupName: grp.name,
          procedureId: stepsOf(grp)[stepsOf(grp).length - 1].id,
          procedureName: stepsOf(grp)[stepsOf(grp).length - 1].name,
          employee: deptEmployees(grp)[0],
        });
        seq++;
      }
    }
  }
  const all = [...st.history, ...items];
  return all.sort((a, b) => (a.changeDate < b.changeDate ? 1 : a.changeDate > b.changeDate ? -1 : 0));
}

function currentStepOf(n: number, me: number | null): Json {
  const st = stateOf(n);
  const [gi, si, assigneeId] = st.at ?? baseAt(n);
  const assignee = EMP_BY_ID.get(assigneeId) ?? EMPLOYEES[0];
  if (!usesWf(n)) {
    const steps = stepsOf(ALL_GROUPS[0]);
    const s = steps[si % steps.length];
    return { procedureId: s.id, procedureName: s.name, assigneeId: assignee.id, assigneeCode: assignee.code, assigneeName: assignee.name, canReturn: false };
  }
  const groups = groupsOf(n);
  const g = groups[Math.min(gi, groups.length - 1)];
  const s = stepsOf(g)[si % stepsOf(g).length];
  const closed = statusOf(n) !== 'ACTIVE';
  void me;
  return {
    procedureGroupId: g.id,
    procedureGroupName: g.name,
    procedureId: s.id,
    procedureName: s.name,
    wfsId: 7_000_000 + n * 10 + gi,
    canReturn: !closed && gi > 0 && !st.stepClosed,
    assigneeId: assignee.id,
    assigneeCode: assignee.code,
    assigneeName: assignee.name,
  };
}

/** the status values of the REST service (work_modal.xhtml: WM_STATUS_APPT / WM_STATUS_TASK) */
const APPT_STATUS = ['scheduled', 're-schedule', 'scheduled', 'success', 'cancel'];
const TASK_STATUS = ['doing', 'doing', 'success', 'cancel'];

function scheduleOf(n: number, kind: 'APPOINTMENT' | 'TASK'): Json[] {
  const count = seedHash(n, kind === 'TASK' ? 50 : 51) % 4;
  const groups = groupsOf(n);
  const st = stateOf(n);
  const base = Array.from({ length: count }, (_, i) => {
    const grp = groups.length ? groups[(i + n) % groups.length] : null;
    const step = grp ? stepsOf(grp)[i % stepsOf(grp).length] : null;
    const emp = EMPLOYEES[(n + i) % EMPLOYEES.length];
    const day = isoOf(TODAY_N + 1 + ((n + i * 3) % 20));
    const allDay = (n + i) % 5 === 0;
    return {
      id: 8_000_000 + n * 10 + i + (kind === 'TASK' ? 5 : 0),
      type: kind,
      date: dmy(day),
      time: allDay ? '' : `${pad2(9 + ((n + i) % 8))}:${(n + i) % 2 ? '30' : '00'}:00`,
      allDay,
      title: kind === 'TASK' ? ITEM_TEXTS.taskTitles[(n + i) % ITEM_TEXTS.taskTitles.length] : ITEM_TEXTS.appointmentTitles[(n + i) % ITEM_TEXTS.appointmentTitles.length],
      detail: kind === 'TASK' ? ITEM_TEXTS.taskDetail : ITEM_TEXTS.appointmentDetail,
      procedureGroupName: grp ? grp.name : '',
      procedureName: step ? step.name : '',
      taskAssigneeId: emp.id,
      taskAssigneeCode: emp.code,
      taskAssigneeName: emp.name,
      status: kind === 'TASK' ? TASK_STATUS[(n + i) % TASK_STATUS.length] : APPT_STATUS[(n + i) % APPT_STATUS.length],
    };
  });
  const added = (st.schedAdded ?? []).filter((s) => s['type'] === kind);
  return [...base, ...added].map((s) => (st.schedEdits?.[String(s['id'])] ? { ...s, ...st.schedEdits[String(s['id'])] } : s));
}

/** the answer of `GET /board/lead?id=&activityGroupId=` (OpportunityDetail of `GET /leads/{id}`) */
function leadDetail(n: number, me: number | null, canSeeFinancial = true): Json {
  const seed = seedLead(n);
  const st = stateOf(n);
  const prospect = seedProspect(seed.prospectId);
  const owner = hasOwner(n) ? EMPLOYEES.find((e) => e.code === seed.ownerCode)! : null;
  // an opportunity in the queue has no owner until somebody takes it (design 6.5)
  const ownerNow = isInQueue('opportunity', n) ? null : st.employeeId === undefined ? owner : st.employeeId === null ? null : (EMP_BY_ID.get(st.employeeId) ?? owner);
  const team = hasTeam(n) ? TEAM_OF(seed.ownerCode) : null;
  const teamNow = st.saleGroupId === undefined ? team : (TEAMS.find((t) => t.id === st.saleGroupId) ?? null);
  const sp = hasTeam(n) ? SALE_PERSONS.find((p) => p.employee.code === seed.ownerCode)! : null;
  const spNow = st.salePersonId === undefined ? sp : (SALE_PERSONS.find((p) => p.id === st.salePersonId) ?? null);
  const status = statusOf(n);
  const groups = groupsOf(n);
  const cs = currentStepOf(n, me);
  const tagIds = st.tagIds ?? [4001, 4002, 4003, 4004, 4005, 4006, 4007, 4008].filter((_, i) => seedHash(n, 60 + i) % 5 === 0).slice(0, 4);
  const added = st.materialsAdded;
  const baseMaterials = Array.from({ length: seedHash(n, 70) % 4 }, (_, i) => MATERIALS[(n + i) % MATERIALS.length]).filter((m, i, a) => a.findIndex((x) => x.id === m.id) === i);
  const materials = [
    ...baseMaterials.map((m, i) => ({ id: m.id, name: m.name, detailOrderNo: 1 + i })).filter((m) => !st.materialsRemoved.includes(m.detailOrderNo)),
    ...added.filter((m) => !st.materialsRemoved.includes(m.detailOrderNo)),
  ];
  const accessors = accessorsOf(n);
  const amount = st.amount ?? seed.amount;
  return {
    id: n,
    txNo: `LD${String(n).padStart(6, '0')}`,
    prospect: prospectBrief(n),
    prospectInfo: {
      fullName: prospect.fullName,
      phone: seed.phone,
      customerCode: prospect.code,
      remark: n % 4 === 0 ? SAMPLE.remark : '',
      firstContactDate: `${seed.createdDate}T09:00:00`,
      contactInfo: { mobile1: phone(seed.phone), email: prospect.email, lineId: `line_${prospect.id}`, facebook: `fb.${prospect.id}` },
      addressInfo: { currentAddress: { country: 'THA', province: prospect.province, district: DISTRICTS[prospect.province]?.[0]?.name ?? '' } },
    },
    version: st.version ?? 1,
    exResponsible: st.exResponsible ?? [],
    leadStatus: status === 'SOLD' ? 'SOLD' : status,
    activeStatus: (st.activeStatus ?? seed.interest).toLowerCase(),
    usesWorkflowStep: usesWf(n),
    currentStep: cs,
    activeSteps: usesWf(n) ? groups.map((g) => ({ procedureGroupId: g.id, procedureGroupName: g.name })) : [],
    appointmentList: scheduleOf(n, 'APPOINTMENT'),
    taskList: scheduleOf(n, 'TASK'),
    contactHistoryList: historyOf(n),
    materialList: materials,
    tagList: tagIds.map((id) => TAGS.find((t) => t.id === id)).filter(Boolean),
    accessors,
    saleGroup: teamNow ? { id: teamNow.id, name: teamNow.name } : null,
    salePerson: spNow ? { id: spNow.id, name: spNow.name } : null,
    employee: ownerNow ? { id: ownerNow.id, code: ownerNow.code, name: ownerNow.name } : null,
    employeeName: ownerNow ? ownerNow.name : '',
    // without Company Financial the value is masked (design §9.5): the page never gets the real number
    amount: canSeeFinancial ? amount : '*****',
    targetYear: st.targetYear ?? String(2026 + (n % 2)),
    targetMonth: st.targetMonth ?? 1 + (seedHash(n, 80) % 12),
    leadDemand: st.demand ?? (n % 3 === 0 ? '' : SAMPLE.demand),
    permissions: { canAddContactActivity: me != null && ownerNow != null && ownerNow.id === me },
  };
}

function accessorsOf(n: number): Json[] {
  const st = stateOf(n);
  const base = [EMPLOYEES[(seedHash(n, 11) % EMPLOYEES.length)], ...Array.from({ length: seedHash(n, 90) % 5 }, (_, i) => EMPLOYEES[(n + i + 1) % EMPLOYEES.length])];
  const ids: number[] = [];
  base.forEach((e) => ids.indexOf(e.id) < 0 && ids.push(e.id));
  st.accessorsAdded.forEach((id) => ids.indexOf(id) < 0 && ids.push(id));
  return ids.map((id) => ({ ...EMP_BY_ID.get(id)!, type: 'EMPLOYEE', attachFile: '' }));
}

/* =================================================================================================================== the customer */
const DISTRICTS: Record<string, { id: number; code: string; name: string; nameTh: string }[]> = {};
const SUBS: Record<string, { id: number; code: string; name: string; nameTh: string; postCode: string }[]> = {};
/** the districts every province has (the name of the province is added after the first) */
const DISTRICT_NAMES = reference('opportunityDetail.districtNames', ['เมือง', 'บางรัก', 'สัตหีบ']);
const PROVINCES = SEED_PROVINCES.map((name, i) => ({ id: 9001 + i, code: `P${String(i + 1).padStart(2, '0')}`, name, nameTh: name }));
PROVINCES.forEach((p, pi) => {
  DISTRICTS[p.name] = DISTRICT_NAMES.map((nm, di) => ({ id: p.id * 10 + di + 1, code: `${p.code}D${di + 1}`, name: `${nm}${pi ? ' ' + p.name.slice(0, 3) : ''}`.trim(), nameTh: `${nm}${pi ? ' ' + p.name.slice(0, 3) : ''}`.trim() }));
  DISTRICTS[p.name].forEach((d) => {
    SUBS[d.code] = [1, 2, 3].map((si) => ({ id: d.id * 10 + si, code: `${d.code}S${si}`, name: msg('ตำบล{0}-{1}', si, d.name), nameTh: msg('ตำบล{0}-{1}', si, d.name), postCode: String(10000 + ((p.id + d.id + si * 37) % 80000)).padStart(5, '0') }));
  });
});
const provinceByName = (name: string) => PROVINCES.find((p) => p.name === name) ?? PROVINCES[0];

/** the part of the customer that `GET /leads/{id}` carries */
function prospectBrief(n: number): Json {
  const seed = seedLead(n);
  const full = prospectOf(n);
  return { id: seed.prospectId, name: full['name'], customerTel: full['customerTel'], phoneCountryCode: full['phoneCountryCode'], countryCode: full['countryCode'], attachFile: full['attachFile'], contactDate: full['contactDate'], currentCountryCode: full['currentCountryCode'], currentCountryName: full['currentCountryName'], currentCityCode: full['currentCityCode'], currentCityName: full['currentCityName'], currentDistrictCode: full['currentDistrictCode'], currentDistrictName: full['currentDistrictName'] };
}

/** the answer of `GET /board/prospect?id=` */
function prospectOf(n: number): Json {
  const seed = seedLead(n);
  const st = prospectState(seed.prospectId);
  if (st.data) return { ...st.data, ...(st.attachFile !== undefined ? { attachFile: st.attachFile } : {}) };
  const p = seedProspect(seed.prospectId);
  const company = n % 17 === 0;
  const prov = provinceByName(p.province);
  const dist = DISTRICTS[prov.name][0];
  const sub = SUBS[dist.code][0];
  const dir = (k: number) => String(seedHash(n, k));
  const owner = SEED_EMPLOYEES.find((e) => e.code === seed.ownerCode)!;
  const base: Json = {
    id: p.id,
    customerType: company ? 'juristic' : 'person',
    sex: ['1', '2', '0'][n % 3],
    attachFile: '',
    name: company ? msg('บริษัท {0} จำกัด', p.firstName) : p.fullName,
    customerTel: phone(p.phone),
    phoneCountryCode: '+66',
    contactBackName: 'LINE, Facebook',
    contactBackCode: 'LINE',
    convenient: SAMPLE.convenientDays[n % SAMPLE.convenientDays.length],
    countryCode: 'THA',
    countryName: 'ประเทศไทย',
    contactDate: seed.createdDate,
    marketingChanelName: p.source,
    remark: n % 4 === 0 ? SAMPLE.remark : '',
    salePersonName: owner.name,
    salePersonCode: seed.ownerCode,
    usageStatus: seed.status === 'ACTIVE' ? 'ใช้งาน' : 'ปิดแล้ว',
    idCard: (dir(1) + dir(2)).padEnd(13, '0').slice(0, 13),
    birthdate: `${1965 + (n % 35)}-${pad2(1 + (n % 12))}-${pad2(1 + (n % 28))}T00:00:00`,
    age: 26 + (n % 35),
    occupationName: SAMPLE.occupations[n % SAMPLE.occupations.length].name,
    occupationCode: SAMPLE.occupations[n % SAMPLE.occupations.length].code,
    nationality: 'ไทย',
    workplaceName: SAMPLE.workplaceName,
    workplacePosition: SAMPLE.workplacePosition,
    workplaceAddress: SAMPLE.workplaceAddress,
    workplaceTel: '02-123-4567',
    refferal: n % 3 === 0 ? SAMPLE.referralName : '',
    referralTel: n % 3 === 0 ? '081-234-5678' : '',
    referralRelate: n % 3 === 0 ? SAMPLE.referralRelate : '',
    taxId: company ? '0105555000111' : '',
    contactBusiness: company ? p.fullName : '',
    taxBranch: company ? '00000' : '',
    contactPosition: company ? 'กรรมการผู้จัดการ' : '',
    businessTypeName: company ? 'ค้าปลีก' : '',
    businessTypeCode: company ? 'BT1' : '',
    prospectPhone1: phone(p.phone),
    prospectPhone2: n % 2 ? '0899998888' : '',
    prospectPhone3: '',
    prospectTel1: '02-111-2222',
    prospectTel2: '',
    prospectTel3: '',
    prospectEmail: p.email,
    prospectLine: `line_${p.id}`,
    prospectFacebook: `fb.${p.id}`,
    prospectTwitter: '',
    prospectInstragram: n % 2 ? `ig_${p.id}` : '',
    prospectFax: '',
    currentAddress: `${10 + (n % 90)}/${1 + (n % 9)} หมู่ ${1 + (n % 12)}`,
    currentCountryName: 'ประเทศไทย',
    currentCountryCode: 'THA',
    currentCityCode: prov.code,
    currentCityName: prov.name,
    currentDistrictCode: dist.code,
    currentDistrictName: dist.name,
    currentSubDistrictCode: sub.code,
    currentSubDistrictName: sub.name,
    currentPostId: sub.postCode,
    senddocAddress: msg('{0} ซอย {1}', 20 + (n % 70), 1 + (n % 9)),
    sendDocCountryName: 'ประเทศไทย',
    sendDocCountryCode: 'THA',
    sendDocCityCode: prov.code,
    sendDocCityName: prov.name,
    senddocDistrictCode: dist.code,
    senddocDistrictName: dist.name,
    senddocSubDistrictCode: sub.code,
    senddocSubDistrictName: sub.name,
    senddocPostId: sub.postCode,
    sunProspectInfo: sunProspectInfo(n),
    satisfaction: satisfaction(n),
  };
  return base;
}

function sunProspectInfo(n: number): Json {
  const yn = (k: number) => (['Y', 'N', 'N/A'] as const)[seedHash(n, k) % 3];
  const owner = SEED_EMPLOYEES.find((e) => e.code === seedLead(n).ownerCode)!;
  return {
    prospectid: seedLead(n).prospectId,
    txDate: seedDate(20 + (n % 30)),
    researcher: n % 4 === 0 ? '' : owner.code,
    csLoanType: ['buy', 'build', 'refinance', 'decorate'][n % 4],
    csTypeProperty: ['home', 'condo', 'townhome', 'land'][n % 4],
    csLoanProperty: yn(100),
    csDateTransOwnership: seedDate(-30 - (n % 60)),
    csDescriptionProperty: 'บ้านเดี่ยว 2 ชั้น พื้นที่ 60 ตร.ว.',
    csTypeService: ['prep', 'pre_app'][n % 2],
    csDesiredLoanAmount: String(1_500_000 + (n % 20) * 100_000),
    csYearsLoan: String(10 + (n % 20)),
    csCoBorrower: ['Y', 'N'][n % 2],
    csMbRelationship: 'คู่สมรส',
    csTranslate: yn(101),
    csVip: ['VIP', 'N-VIP', 'N/A'][n % 3],
    csIncomeType: ['Owner', 'E', 'SE'][n % 3],
    csTwoMenWoIncome: yn(102),
    csThaiCoBorrower: yn(103),
    csJobCoBorrower: ['Owner', 'E', 'SE', 'without_income'][n % 4],
    plsTransfer: yn(104),
    plsVip: ['VIP', 'N-VIP', 'N/A'][(n + 1) % 3],
    plsTypeIncome: ['Owner', 'E', 'SE'][(n + 1) % 3],
    plsApprovalDate: seedDate(10),
    plsLoanApproval: String(1_200_000 + (n % 10) * 50_000),
    plsLoanPeriod: String(15 + (n % 10)),
    plsTxNo: `PLS${String(n).padStart(5, '0')}`,
    plsUrgency: ['1', '2', '3'][n % 3],
    plsStatus: 'รอพิจารณา',
    lsLoanType: ['buy', 'refinance'][n % 2],
    lsPropertyCondition: ['first_hand', 'second_hand', 'NPL_assets'][n % 3],
    lsTypeProperty: ['home', 'condo'][n % 2],
    lsStatusPropertyLoan: 'ยังไม่ผ่อนชำระ',
    lsPurchaseRelatives: yn(105),
    lsProjectName: 'โครงการสุขสันต์ วิลล่า',
    lsTransOwnership: seedDate(-10),
    lsSellerDetail: ['personal', 'juristic'][n % 2],
    lsPrice: String(3_000_000 + n * 1000),
    lsAppraisalPrice: String(2_900_000 + n * 1000),
    lsLoanAmount: String(2_400_000 + n * 1000),
    lsBankStatus: ['Y', 'N'][n % 2],
    lsLoanPeriod: '25',
    lsConditionsLegalAct: yn(106),
    lsSgJointLoan: ['single', 'joint'][n % 2],
    lsMarriedCouple: ['single', 'thai', 'foreigner', 'no'][n % 4],
    lsProvince: PROVINCES[n % PROVINCES.length].name,
    lsDistrict: DISTRICTS[PROVINCES[n % PROVINCES.length].name][0].name,
    leSignContractThai: seedDate(5),
    leLoanAccountNo: `0123${String(n).padStart(6, '0')}`,
    leLoanLimit: '2400000',
    leFirstPayment: '15000',
    leGuarantee: 'Y',
    leGuaranteeAmount: '5000.00',
    leOther: 'N',
    crmRelationsBorrower: 'ผู้กู้หลัก',
    crmPurchasePurpose: 'อยู่อาศัยเอง',
    crmCollateralResidents: ['Y', 'N'][n % 2],
    crmTypepaymentService: ['A', 'B', 'C', 'N/A'][n % 4],
    crmContractPersonThai1: 'คุณสมศรี ใจดี',
    crmThaiRelations1: 'มารดา',
    crmThaiPhone1: '081-111-2222',
    crmCustomerClosesAccountBankDate: seedDate(1),
    cusNickname: 'ตั้ม',
    cusCountry: 'THA',
    cusComfortTimeCallback: 'หลัง 18:00',
    cusMobile1: phone(seedLead(n).phone),
    cusEmail: seedProspect(seedLead(n).prospectId).email,
    cusSources: seedLead(n).source,
    cusPropertyTypeLoan: 'buy',
    cusPropertyHaveAsset: yn(107),
    cusPropertyHaveProvince: PROVINCES[(n + 1) % PROVINCES.length].name,
    cusPropertyHaveDistrict: DISTRICTS[PROVINCES[(n + 1) % PROVINCES.length].name][0].name,
    cusPropertyHavePrice: String(2_000_000 + n * 500),
    cusAge: '30-39',
    cusSex: ['ชาย', 'หญิง'][n % 2],
    cusEducation: 'ปริญญาตรี',
    cusStatus: ['โสด', 'สมรส'][n % 2],
    cusSurveyQ19_1_1: yn(108),
    cusSurveyQ19_2_1: yn(109),
    cusLoanRequireAmount: '2400000',
    cusLoanRequireYear: '25',
    cusSurveyHaveCoborrower: ['Y', 'N'][n % 2],
    cusPropertyInterestVisit: yn(110),
    cusPropertyInterestProject: 'โครงการสุขสันต์ วิลล่า',
    cusPropertyInterestProvince: PROVINCES[(n + 2) % PROVINCES.length].name,
    cusPropertyInterestDistrict: DISTRICTS[PROVINCES[(n + 2) % PROVINCES.length].name][0].name,
    cusPropertyInterestPrice: '3000000',
    cusPropertySummaryResult: 'สนใจ',
    cusPropertySummaryDate: seedDate(3),
    docContactType: ['O', 'I', 'MI', 'FB', 'L'][n % 5],
    docContactInterestStatus: ['N/A', 'A', 'P'][n % 3],
    docContactLastContactDate: seedDate(2),
    docContactDetail: 'ลูกค้าตอบรับดี',
    cusCrmCrmCode: `CRM${String(n).padStart(5, '0')}`,
    cusCrmPaymentType: ['A', 'B'][n % 2],
    cusCrmBorrowerName: seedProspect(seedLead(n).prospectId).fullName,
    cusCrmCollateralType: 'บ้านเดี่ยว',
    roleOwner: owner.name,
    cusCreateby: owner.code,
    mbGender: ['M', 'F'][n % 2],
    cbGender: ['M', 'F'][(n + 1) % 2],
    mbAgeMt60: yn(111),
    mbSalaryCerti: yn(112),
    cbSalaryCerti: yn(113),
    mbPaySlipLeast6m: yn(114),
  };
}

function satisfaction(n: number): Json {
  const rate = (k: number) => String(1 + (seedHash(n, k) % 5));
  return {
    customerGender: ['ชาย', 'หญิง'][n % 2],
    customerAge: ['20-30', '31-40', '41-50'][n % 3],
    customerStatus: n % 5 === 0 ? 'หย่าร้างชั่วคราว' : ['โสด', 'สมรส', 'หย่า/หม้าย'][n % 3],
    customerCountry: 'ไทย',
    customerJob: 'พนักงานบริษัท',
    customerMarketingChannel1: 'Y',
    customerMarketingChannel2: 'N',
    customerMarketingChannel3: 'Y',
    customerMarketingOther: n % 4 === 0 ? 'เพื่อนแนะนำ' : '',
    customerReason1: 'Y',
    customerReason2: 'N',
    customerReasonOther: '',
    satisfactionSuggestion: rate(120),
    satisfactionMarketing: rate(121),
    satisfactionDocument: rate(122),
    satisfactionContact: rate(123),
    satisfactionFee: rate(124),
    satisfactionPaymentService: rate(125),
    satisfactionManners: rate(126),
    satisfactionServiceMind: rate(127),
    satisfactionKnowledge: rate(128),
    satisfactionServiceStandard: rate(129),
    satisfactionHonest: rate(130),
    satisfactionCustomerTracking: rate(131),
    satisfactionPublicRelations: rate(132),
    satisfactionComment: n % 2 ? 'บริการดีมาก' : '',
  };
}

function attachmentsOf(prospectId: number): { detailOrderNo: number; attachFile: string; description: string }[] {
  const st = prospectState(prospectId);
  if (!st.attachments) {
    st.attachments = Array.from({ length: prospectId % 4 }, (_, i) => ({
      detailOrderNo: 100 + i,
      attachFile: `https://files.example.test/docs/${prospectId}/${['id-card', 'salary-slip', 'bank-statement'][i % 3]}-${prospectId}.pdf`,
      description: ['สำเนาบัตรประชาชน', 'สลิปเงินเดือน', 'รายการเดินบัญชี'][i % 3],
    }));
  }
  return st.attachments;
}

/* =================================================================================================================== the answers */
/** the body the service gives when it refuses the save of a customer (the fake REST service of a --live run sends exactly this), and what a gateway in front of it sends */
export const SAVE_REFUSED_BODY = '{"status":500,"message":"บันทึกข้อมูลลูกค้าไม่สำเร็จ (mock)"}';
export const GATEWAY_BODY = '<html>Bad gateway</html>';
/** `ProspectAttachmentsServlet.verifyFailMessage` of a probe that got HTTP 404 */
const UNVERIFIED_MESSAGE =
  'อัปโหลดสำเร็จ แต่ตรวจสอบไฟล์บน O2O ไม่ผ่าน — ไม่พบไฟล์ที่ file server หลังอัปโหลด (ไฟล์อาจไม่ถูกเก็บ หรือที่อยู่ไฟล์ที่ระบบหลังบ้านตอบกลับชี้ผิดที่) ไฟล์อาจดาวน์โหลด/แสดงไม่ได้ กรุณาลองใหม่หรือแจ้งผู้ดูแลระบบ [HTTP_404]';
const JSON_HEADERS = { 'Content-Type': 'application/json; charset=UTF-8' };
const json = (body: unknown, status = 200): Response => new Response(JSON.stringify(body), { status, headers: JSON_HEADERS });
const envelope = (result: unknown, status = 200): Response => json({ status, message: 'success', result }, status);
const ok = (extra: Json = {}): Response => json({ status: 200, message: 'success', ...extra });
const fail = (status: number, message: string, extra: Json = {}): Response => json({ status, message, ...extra }, status);
/**
 * a note / remark that carries "[500]" or "[400]" ("[net]": the answer is not JSON) makes the request fail (the way the scenarios show the
 * error paths). The page's input guard (the shell's input_guard.js) does not let `[ ] ~ …` be TYPED into a field, so "#500" / "#400" /
 * "#net" / "#fail" are the same triggers for a person (or a scenario) typing in the page.
 */
const has = (s: string, ...tokens: string[]): boolean => tokens.some((t) => s.includes(t));
const trigger = (text: unknown): 'none' | '400' | '500' | 'net' => {
  const s = String(text ?? '');
  return has(s, '[500]', '#500') ? '500' : has(s, '[400]', '#400') ? '400' : has(s, '[net]', '#net') ? 'net' : 'none';
};

function parseBody(init?: RequestInit): Json {
  const b = init?.body;
  if (typeof b !== 'string' || !b) return {};
  try {
    const v = JSON.parse(b);
    return v && typeof v === 'object' ? (v as Json) : {};
  } catch {
    return Object.fromEntries(new URLSearchParams(b));
  }
}

function leadError(n: number): Response | null {
  const msg = (t: string) => ({ error: { code: t, message: ({ FORBIDDEN: 'คุณไม่มีสิทธิ์ดูรายละเอียดลีดนี้', BAD_REQUEST: 'ต้องระบุ activityGroupId — ลีดนี้มีหลายกลุ่มขั้นตอน', INTERNAL: 'ระบบขัดข้อง กรุณาลองใหม่' } as Record<string, string>)[t] } });
  if (n === 900) return json({ status: 403, message: 'FORBIDDEN', ...msg('FORBIDDEN') }, 403);
  if (n === 901) return json({ status: 400, message: 'BAD_REQUEST', ...msg('BAD_REQUEST') }, 400);
  if (n === 902) return json({ status: 500, message: 'INTERNAL', ...msg('INTERNAL') }, 500);
  if (n === 903) return json({});
  if (!isKnownLead(n)) return json({ status: 404, message: 'NOT_FOUND', error: { code: 'NOT_FOUND', message: 'ไม่พบข้อมูลลีด' } }, 404);
  return null;
}

/** the groups the lead can be forwarded to (`orderNo` marks groups that may be worked at the same time) */
function forwardGroups(n: number): Json[] {
  const groups = groupsOf(n);
  const [gi] = stateOf(n).at ?? baseAt(n);
  return groups.filter((_, i) => i !== gi).map((g) => ({ id: g.id, code: g.code, name: g.name, orderNo: ORDER_NO(ALL_GROUPS.findIndex((x) => x.id === g.id)) }));
}

function returnGroups(n: number): Json[] {
  const groups = groupsOf(n);
  const st = stateOf(n);
  const [gi, si, assigneeId] = st.at ?? baseAt(n);
  if (gi === 0 || !groups.length) return [{ procedureName: currentStepOf(n, null)['procedureName'], returnToId: assigneeId, returnDestinations: [] }];
  const step = currentStepOf(n, null);
  return [
    {
      procedureName: step['procedureName'],
      returnToId: assigneeId,
      returnDestinations: groups.slice(0, gi).map((g, i) => {
        const e = deptEmployees(g)[(n + i + si) % deptEmployees(g).length];
        return { activityGroupId: g.id, activityGroupCode: g.code, activityGroupName: g.name, wfsTxNo: `WFS${n}-${g.code}`, returnToId: e.id, returnToCode: e.code, returnToName: e.name };
      }),
    },
  ];
}

function contactHistoryTable(n: number): Json {
  const groups = groupsOf(n);
  const st = stateOf(n);
  const [gi, si] = st.at ?? baseAt(n);
  const hist = historyOf(n);
  const closed = statusOf(n) !== 'ACTIVE';
  return {
    groups: groups
      .map((g, idx) => ({ g, idx }))
      .filter(({ idx }) => idx <= gi)
      .map(({ g, idx }) => {
        const steps = stepsOf(g);
        const upTo = idx < gi ? steps.length : si + 1;
        return {
          procedureGroupId: g.id,
          procedureGroupName: g.name,
          sla: 3 + idx * 2,
          slaActual: 1 + ((n + idx) % 9),
          steps: steps.slice(0, upTo).map((s, k) => {
            const items = hist.filter((h) => h.procedureId === s.id && h.type !== 'forward').reverse();
            const emp = items[0]?.employee ?? deptEmployees(g)[k % deptEmployees(g).length];
            const current = idx === gi && k === si && !closed;
            return {
              procedureId: s.id,
              procedureCode: s.code,
              procedureName: s.name,
              status: current ? 'current' : 'done',
              startDate: `${seedDate(Math.max(0, 40 - idx * 6 - k * 2))}T09:00:00`,
              slaActual: 1 + ((n + k) % 4),
              employee: { code: emp.code, name: emp.name, attachFile: '' },
              items: items.map((h) => ({ type: h.type, channel: h.channel, content: h.content })),
            };
          }),
        };
      }),
  };
}

/** the whole backend */
export function createMockLeadDetail(options: OpportunityDetailMockOptions = {}): OpportunityDetailBackend {
  const delayMs = options.delayMs ?? 120;
  const me = options.employeeId ?? null;
  const canSeeFinancial = options.canSeeFinancial ?? true;
  const wait = (): Promise<void> => (delayMs > 0 ? new Promise((r) => setTimeout(r, delayMs)) : Promise.resolve());

  async function handle(path: string, q: URLSearchParams, init?: RequestInit): Promise<Response> {
    const method = (init?.method ?? 'GET').toUpperCase();
    const num = (k: string): number => Number(q.get(k));
    switch (path) {
      /* ---- the lead ---- */
      case 'board/lead': {
        const n = num('id');
        return leadError(n) ?? json(leadDetail(n, me, canSeeFinancial));
      }
      case 'board/activity-groups': {
        const n = num('leadId');
        if (!q.get('leadId')) return json({ error: 'leadId required' }, 400);
        if (!isKnownLead(n)) return json({});
        return envelope(groupsOf(n).map((g) => ({ id: g.id, code: g.code, name: g.name })));
      }
      case 'board/activity-steps': {
        const n = num('leadId');
        const gid = q.get('activityGroupId');
        const groups = usesWf(n) ? groupsOf(n) : [ALL_GROUPS[0]];
        const list = gid ? groups.filter((g) => String(g.id) === gid) : groups;
        if (!isKnownLead(n)) return json([]);
        return json(list.flatMap((g) => stepsOf(g).map((s) => ({ id: s.id, code: s.code, name: s.name }))));
      }
      case 'board/lead/contact-history': {
        const n = num('leadId');
        return envelope(contactHistoryTable(n));
      }
      case 'board/lead/forward-groups':
        return envelope(forwardGroups(num('leadId')));
      case 'board/lead/forward-employees': {
        const g = ALL_GROUPS.find((x) => String(x.id) === q.get('activityGroupId'));
        return envelope(g ? deptEmployees(g) : EMPLOYEES);
      }
      case 'board/lead/return-groups':
        return envelope(returnGroups(num('leadId')));
      case 'board/lead/accessors':
        return envelope(accessorsOf(num('leadId')));
      case 'board/fiscal-years':
        return json([2026, 2027, 2028, 2029, 2030, 2031].map((y) => ({ code: String(y), name: String(y) })));
      case 'board/tags':
        return json(TAGS);
      case 'board/sale-groups':
        return json(TEAMS);
      case 'board/sale-persons': {
        const g = q.get('saleGroupId');
        return json(SALE_PERSONS.filter((p) => !g || String(p.saleGroupId) === g).map((p) => ({ id: p.id, code: p.code, name: p.name, employee: p.employee })));
      }
      case 'board/material-groups':
        return json(MATERIAL_GROUPS);
      case 'board/materials':
        return json(MATERIALS.filter((m) => String(m.groupId) === q.get('groupId')).map((m) => ({ id: m.id, code: m.code, name: m.name })));
      case 'board/detail-filter-state': {
        if (method === 'POST') {
          const raw = init?.body;
          try {
            STATE.filterState = typeof raw === 'string' ? JSON.parse(raw) : null;
          } catch {
            STATE.filterState = null;
          }
          return ok();
        }
        return json(STATE.filterState);
      }

      /* ---- master data of the main tab ---- */
      case 'board/chat-master-data':
        return masterData(q.get('type') ?? '');
      case 'board/provinces':
        return envelope(PROVINCES);
      case 'board/districts': {
        const p = PROVINCES.find((x) => String(x.id) === q.get('provinceId'));
        return envelope(p ? DISTRICTS[p.name] : []);
      }
      case 'board/sub-districts': {
        const d = Object.values(DISTRICTS).flat().find((x) => String(x.id) === q.get('districtId'));
        return envelope(d ? SUBS[d.code] : []);
      }
      case 'board/metro-geo':
        return json(
          PROVINCES.flatMap((p) => DISTRICTS[p.name].flatMap((d) => SUBS[d.code].map((s) => ({ p: p.code, pn: p.name, pid: p.id, d: d.code, dn: d.name, s: s.code, sn: s.name, z: s.postCode })))),
        );

      /* ---- the customer ---- */
      case 'board/prospect': {
        const p = Number(q.get('id'));
        const lead = leadIds().find((n) => seedLead(n).prospectId === p);
        return lead ? json(prospectOf(lead)) : json({});
      }
      case 'board/prospect-status-change': // the usage status of the customer (the mock accepts every change)
        return ok();
      case 'board/prospect/save':
        return prospectSave(parseBody(init));
      case 'board/prospect/avatar': {
        const b = parseBody(init);
        if (!b['prospectId'] || !b['fileContentBase64']) return json({ ok: false, message: 'prospectId และไฟล์จำเป็นต้องมี' }, 400);
        if (String(b['fileName'] ?? '').includes('fail')) return json({ ok: false, message: 'บันทึกรูปภาพไม่สำเร็จ' }, 500);
        prospectState(Number(b['prospectId'])).attachFile = String(b['fileContentBase64']);
        return json({ ok: true, attachFile: String(b['fileContentBase64']) });
      }
      case 'board/lead/attachments': // OP05: the files of the opportunity (the mock keeps them with its customer, as the upload / delete below do)
        return envelope(attachmentsOf(seedLead(num('leadId')).prospectId));
      case 'board/prospect/attachments':
        return attachments(method, q, init);
      case 'board/prospect/rv-attachments': {
        const p = num('prospectId');
        const list = p % 3 === 0 ? [] : Array.from({ length: 1 + (p % 3) }, (_, i) => ({ description: msg('ใบรับเงิน {0}', i + 1), rv_txno: `RV${String(p).padStart(5, '0')}-${i + 1}`, attachFile: `https://files.example.test/rv/${p}/rv-${i + 1}.pdf` }));
        return envelope(list);
      }

      /* ---- writes ---- */
      case 'board/lead-update':
        return leadUpdate(parseBody(init));
      case 'board/contact-activities':
        return contactActivity(parseBody(init));
      case 'board/lead/forward':
        return leadForward(parseBody(init));
      case 'board/lead/return':
        return leadReturn(parseBody(init));
      case 'board/lead/close-step':
        return leadCloseStep(parseBody(init));
      case 'board/lead/close':
        return leadClose(parseBody(init));
      case 'board/lead/accessor-add': {
        const n = num('leadId');
        const blocked = writeBlocked(n);
        if (blocked) return blocked;
        const b = parseBody(init);
        const ids = Array.isArray(b['employeeIds']) ? (b['employeeIds'] as unknown[]).map(Number) : [];
        if (!ids.length) return fail(400, 'missing params: employeeIds');
        if (ids.includes(EMPLOYEES[7].id)) return fail(500, msg('ไม่สามารถเพิ่มผู้มีสิทธิ์ได้')); // E108 is the one the backend refuses
        stateOf(n).accessorsAdded.push(...ids);
        return ok();
      }
      case 'board/lead-materials':
        return leadMaterials(parseBody(init));
      case 'docproxy':
        return new Response('mock file\n', { status: 200, headers: { 'Content-Type': 'application/octet-stream' } });
      default: {
        // the work modal: ../board/employees, ../board/schedule/add|edit, ../board/master/employees-by-activity-group, ../board/master/activity-groups
        const wm = handleWorkModalRequest(method, path, q, typeof init?.body === 'string' ? init.body : undefined, workModalData());
        return wm ? toResponse(wm) : fail(404, `no mock for ${method} ${path}`);
      }
    }
  }

  /** the data behind the work modal (the servlet layer is `@shared/work-modal/work-modal.mock`) */
  function workModalData(): WorkModalData {
    const bad = (message: string): ScheduleEnvelope => ({ status: 400, message, error: { code: 400, message } });
    const conflict = (message: string): ScheduleEnvelope => ({ status: 409, message, error: { code: 409, message } });
    const assigneeFields = (id: unknown): Json => {
      const e = EMP_BY_ID.get(Number(id));
      return e ? { taskAssigneeId: e.id, taskAssigneeCode: e.code, taskAssigneeName: e.name } : {};
    };
    return {
      employees: (saleGroupId) => (saleGroupId ? EMPLOYEES.filter((e) => String(TEAM_OF(e.code).id) === saleGroupId) : EMPLOYEES),
      employeesByActivityGroup: (gid) => {
        const g = ALL_GROUPS.find((x) => String(x.id) === gid);
        return g ? deptEmployees(g) : [];
      },
      activityGroups: () => ALL_GROUPS.slice(0, SEED_GROUPS.length).map((g) => ({ id: g.id, code: g.code, name: g.name })),
      addSchedule: (b) => {
        const n = Number(b['leadId']);
        if (!n || !isKnownLead(n)) return bad(msg('ไม่พบ Lead ที่ระบุ'));
        const blocked = writeBlocked(n);
        if (blocked) return conflict(isClosedLead(n) ? msg('โอกาสขายที่ปิดแล้วเป็นแบบอ่านอย่างเดียว') : msg('โอกาสขายอยู่ใน Wait List — รับงานก่อนจึงจะทำรายการได้'));
        if (!String(b['subject'] ?? '').trim()) return bad(msg('subject ต้องไม่ว่าง'));
        if (has(String(b['subject']), '~fail', '#fail')) return bad(msg('จำลองข้อผิดพลาดจาก backend (subject มี #fail)'));
        if (!String(b['detail'] ?? '').trim()) return bad(msg('detail ต้องไม่ว่าง'));
        if (!/^\d{4}-\d{2}-\d{2}$/.test(String(b['date'] ?? ''))) return bad(msg('date รูปแบบไม่ถูกต้อง (yyyy-MM-dd)'));
        if (b['type'] !== 'APPOINTMENT' && b['type'] !== 'TASK') return bad(msg('type ต้องเป็น APPOINTMENT หรือ TASK'));
        const cs = currentStepOf(n, me);
        if (usesWf(n) && !(Number(b['procedureGroupId']) > 0)) return bad(msg('ต้องระบุ procedureGroupId เพราะ Lead นี้มีขั้นตอน workflow ที่ทำงานอยู่'));
        const st = stateOf(n);
        const id = 9_000_000 + n * 100 + (st.schedAdded?.length ?? 0) + 1;
        const grp = ALL_GROUPS.find((g) => g.id === Number(b['procedureGroupId']));
        const allDay = !!b['allDay'];
        (st.schedAdded ??= []).push({
          id,
          type: b['type'],
          date: dmy(String(b['date'])),
          time: allDay || !b['time'] ? '' : `${String(b['time'])}:00`.replace(/^(\d\d:\d\d):00:00$/, '$1:00'),
          allDay,
          title: String(b['subject']).trim(),
          detail: String(b['detail']).trim(),
          procedureGroupName: grp ? grp.name : String(cs['procedureGroupName'] ?? ''),
          procedureName: String(cs['procedureName'] ?? ''),
          ...(assigneeFields(b['taskAssigneeId'])['taskAssigneeId'] ? assigneeFields(b['taskAssigneeId']) : assigneeFields(me ?? cs['assigneeId'])),
          status: String(b['status'] ?? (b['type'] === 'TASK' ? 'doing' : 'scheduled')),
        });
        return { status: 201, message: 'success', result: { id } };
      },
      editSchedule: (id, b) => {
        // the lead of the item: base items are 8_000_000 + n * 10 + i (+5 for a task), created ones 9_000_000 + n * 100 + k
        const n = id >= 9_000_000 ? Math.floor((id - 9_000_000) / 100) : Math.floor((id - 8_000_000) / 10);
        const known = isKnownLead(n) && [...scheduleOf(n, 'APPOINTMENT'), ...scheduleOf(n, 'TASK')].some((s) => s['id'] === id);
        if (!known) return { status: 404, message: 'ไม่พบนัดหมาย/งาน', error: { code: 404, message: 'ไม่พบนัดหมาย/งาน' } };
        // a sold / lost opportunity is read-only; a done or cancelled appointment / task cannot be changed again; a task is not re-scheduled (design 6.7)
        if (isClosedLead(n)) return conflict(msg('โอกาสขายที่ปิดแล้วเป็นแบบอ่านอย่างเดียว'));
        const item = [...scheduleOf(n, 'APPOINTMENT'), ...scheduleOf(n, 'TASK')].find((s) => s['id'] === id);
        if (item && (item['status'] === 'success' || item['status'] === 'cancel')) return conflict(msg('นัดหมาย/งานที่ปิดแล้วแก้ไขไม่ได้'));
        if (item?.['type'] === 'TASK' && b['status'] === 're-schedule') return bad(msg('งานเลื่อนนัดไม่ได้'));
        if (has(String(b['subject'] ?? ''), '~fail', '#fail')) return bad(msg('จำลองข้อผิดพลาดจาก backend (subject มี #fail)'));
        if (!String(b['subject'] ?? '').trim()) return bad(msg('subject ต้องไม่ว่าง'));
        if (!String(b['detail'] ?? '').trim()) return bad(msg('detail ต้องไม่ว่าง'));
        const edit: Json = {};
        if (b['subject'] != null) edit['title'] = String(b['subject']).trim();
        if (b['detail'] != null) edit['detail'] = String(b['detail']).trim();
        // (the page sends the date as it got it — dd/MM/yyyy — when only the status is changed in the view)
        if (b['date'] != null) edit['date'] = /^\d{4}-\d{2}-\d{2}$/.test(String(b['date'])) ? dmy(String(b['date'])) : String(b['date']);
        if (b['allDay'] != null) edit['allDay'] = !!b['allDay'];
        if ('time' in b) edit['time'] = b['time'] && !b['allDay'] ? `${String(b['time'])}:00`.replace(/^(\d\d:\d\d):00:00$/, '$1:00') : '';
        if (b['status'] != null) edit['status'] = String(b['status']);
        if (b['taskAssigneeId'] != null) Object.assign(edit, assigneeFields(b['taskAssigneeId']));
        const st = stateOf(n);
        (st.schedEdits ??= {})[String(id)] = { ...(st.schedEdits[String(id)] ?? {}), ...edit };
        return { status: 200, message: 'success' };
      },
    };
  }

  function masterData(type: string): Response {
    switch (type) {
      case 'countries':
        return envelope(MOCK_COUNTRIES.map((c, i) => ({ id: 100 + i, code: c.code, name: COUNTRY_NAMES[c.code]?.[1] ?? c.code, nameTh: COUNTRY_NAMES[c.code]?.[0] ?? c.code, phoneCountryCode: c.phoneCountryCode, phoneNumberFormat: c.phoneNumberFormat })));
      case 'business-types':
        return envelope(['ค้าปลีก', 'บริการ', 'การผลิต', 'เกษตรกรรม'].map((name, i) => ({ id: 200 + i, code: `BT${i + 1}`, name, nameTh: name })));
      case 'occupations':
        return envelope(['พนักงานบริษัท', 'เจ้าของกิจการ', 'ข้าราชการ', 'ฟรีแลนซ์'].map((name, i) => ({ id: 300 + i, code: `OC${i + 1}`, name, nameTh: name })));
      case 'marketing-channels':
        return envelope(['Facebook', 'LINE OA', 'Website', 'Walk-in', 'Referral', 'Call Center'].map((name, i) => ({ id: 400 + i, code: `MC${i + 1}`, name })));
      case 'communication-types':
        return envelope(['LINE', 'Facebook', 'โทรศัพท์', 'Email'].map((name, i) => ({ id: 500 + i, code: name.toUpperCase().slice(0, 4), name })));
      default:
        return fail(400, 'invalid type (marketing-channels|employees|sale-persons|branches|products)');
    }
  }

  function prospectSave(b: Json): Response {
    const pid = Number(b['prospectId']);
    if (!pid) return json({ ok: false, message: 'prospectId required' }, 400);
    const probe = JSON.stringify(b);
    const t = trigger(probe);
    // "#net": the page gets something that is not JSON (its `.catch` path; no servlet does that — a REST run skips these scenarios)
    if (t === 'net') return new Response('<html>Bad gateway</html>', { status: 502, headers: { 'Content-Type': 'text/html' } });
    // ProspectSaveServlet when the service refuses the save: HTTP 502 + { ok:false, via:'api', status, message: "API ตอบ <status> — <body of the answer>" }
    // ("#500" / "#400": the service answers 500 with the body below; "#gw": a gateway in front of it answers 502 with an HTML page)
    if (t === '500' || t === '400') return json({ ok: false, via: 'api', status: 500, message: msg('API ตอบ 500 — {0}', SAVE_REFUSED_BODY) }, 502);
    if (probe.includes('#gw')) return json({ ok: false, via: 'api', status: 502, message: msg('API ตอบ 502 — {0}', GATEWAY_BODY) }, 502);
    const st = prospectState(pid);
    const lead = leadIds().find((n) => seedLead(n).prospectId === pid) ?? 1;
    if (b['prospect'] && typeof b['prospect'] === 'object') st.data = { ...prospectOf(lead), ...(b['prospect'] as Json) };
    if (b['extraInfo'] && typeof b['extraInfo'] === 'object') {
      const x = b['extraInfo'] as Json;
      st.data = { ...(st.data ?? prospectOf(lead)), sunProspectInfo: x['sunProspectInfo'] ?? {}, satisfaction: x['satisfaction'] ?? {} };
    }
    return json({ ok: true, via: 'api', status: 200 });
  }

  function attachments(method: string, q: URLSearchParams, init?: RequestInit): Response {
    const pid = Number(q.get('prospectId') ?? parseBody(init)['prospectId']);
    if (!pid) return fail(400, 'prospectId required');
    const list = attachmentsOf(pid);
    if (method === 'GET') return envelope(list);
    if (method === 'DELETE') {
      const no = Number(q.get('docNo'));
      if (!no) return fail(400, msg('prospectId และ docNo จำเป็นต้องมี'));
      const i = list.findIndex((d) => d.detailOrderNo === no);
      if (i < 0) return fail(404, msg('ลบเอกสารไม่สำเร็จ: ไม่พบเอกสาร'));
      list.splice(i, 1);
      return ok();
    }
    const b = parseBody(init);
    const name = String(b['fileName'] ?? '');
    if (!b['fileContentBase64'] || !name) return fail(400, msg('prospectId และไฟล์จำเป็นต้องมี'));
    if (name.includes('bad')) return fail(500, msg('อัปโหลดไฟล์ไม่สำเร็จ'));
    const detailOrderNo = 200 + ++STATE.docSeq;
    const attachFile = `https://files.example.test/docs/${pid}/${name}`;
    list.push({ detailOrderNo, attachFile, description: String(b['description'] ?? name) });
    // ProspectAttachmentsServlet probes the stored file (HEAD): the file server answers 404 for the one named "unverified" (verifyFailMessage of HTTP 404)
    if (name.includes('unverified')) return json({ status: 200, verified: false, verifyReason: 'HTTP_404', message: UNVERIFIED_MESSAGE, result: { attachFile } });
    return json({ status: 200, verified: true, verifyReason: 'OK', message: 'success', result: { attachFile } });
  }

  function leadUpdate(b: Json): Response {
    const n = Number(b['leadId']);
    if (!n) return fail(400, 'leadId required');
    const blocked = writeBlocked(n);
    if (blocked) return blocked;
    const st = stateOf(n);
    if (b['version'] !== undefined && b['version'] !== '' && Number(b['version']) !== (st.version ?? 1)) {
      return refuse(409, 'VERSION_CONFLICT', msg('ข้อมูลถูกแก้โดยผู้อื่นแล้ว — โหลดใหม่ก่อนแก้'));
    }
    st.version = (st.version ?? 1) + 1;
    switch (String(b['action'])) {
      case 'target-year':
        st.targetYear = String(b['yearCode']);
        break;
      case 'target-month': {
        const month = Number(b['month']);
        if (!Number.isInteger(month) || month < 1 || month > 12) return refuse(422, 'VALIDATION_FAILED', msg('เดือนต้องอยู่ระหว่าง 1 ถึง 12'));
        st.targetMonth = month;
        break;
      }
      case 'amount': {
        if (!canSeeFinancial) return refuse(403, 'FIELD_NOT_EDITABLE', msg('ไม่มีสิทธิ์แก้มูลค่าดีล'));
        const amount = Number(b['amount']);
        if (!Number.isFinite(amount) || amount < 0) return refuse(422, 'VALIDATION_FAILED', msg('มูลค่าดีลต้องเป็นตัวเลขที่ไม่ติดลบ'));
        st.amount = amount;
        break;
      }
      case 'demand':
        st.demand = String(b['demand'] ?? '');
        break;
      case 'active-status': {
        const next = String(b['activeStatus'] ?? '').trim().toLowerCase();
        if (SYSTEM_STATUSES.includes(next)) return refuse(422, 'VALIDATION_FAILED', msg('สถานะ Sold / Lost ระบบตั้งให้เมื่อโอกาสขายเข้าขั้นที่ 100% / 0% — ตั้งเองไม่ได้'));
        if (!OPEN_STATUSES.includes(next)) return refuse(422, 'VALIDATION_FAILED', msg('สถานะต้องเป็น New, Hot, Warm, Cold หรือ Inactive'));
        if (next !== String(st.activeStatus ?? '').toLowerCase()) st.statusDate = SEED_TODAY;
        st.activeStatus = String(b['activeStatus']);
        break;
      }
      case 'tags':
        st.tagIds = String(b['tagIds'] ?? '')
          .split(',')
          .map((s) => Number(s.trim()))
          .filter(Boolean);
        break;
      case 'assign': {
        const to = b['employeeId'] !== undefined && b['employeeId'] !== '' ? EMP_BY_ID.get(Number(b['employeeId'])) : undefined;
        if (to) {
          const refused = changeOwner(n, to.code);
          if (refused) return refused;
        }
        if (!to && (b['saleGroupId'] !== undefined || b['salePersonId'] !== undefined) && !mayChangeHands(n)) {
          return refuse(403, 'FORBIDDEN', msg('เฉพาะผู้รับผิดชอบหรือหัวหน้าเท่านั้นที่เปลี่ยนพนักงานขายได้'));
        }
        if (b['saleGroupId'] !== undefined) st.saleGroupId = Number(b['saleGroupId']) || null;
        if (b['salePersonId'] !== undefined) st.salePersonId = Number(b['salePersonId']) || null;
        if (to) st.employeeId = to.id;
        break;
      }
      default:
        return fail(400, 'unknown action');
    }
    return ok();
  }

  /** the owner, or the head of the owner in the chart (not any supervisor), changes the owner and the sales person (design 6.4, 9.4) */
  function mayChangeHands(n: number): boolean {
    const caller = me === null ? undefined : EMP_BY_ID.get(me);
    const owner = ownerOf('opportunity', n);
    return !caller || !owner || caller.code === owner || isHeadOf(caller.code, owner);
  }

  /** only the owner or a supervisor changes the owner; the new one must be in the group of the pipeline, active, and not the same person (design 6.4) */
  function changeOwner(n: number, toCode: string): Response | undefined {
    const caller = me === null ? undefined : EMP_BY_ID.get(me);
    if (!mayChangeHands(n)) return refuse(403, 'FORBIDDEN', msg('เฉพาะผู้รับผิดชอบหรือหัวหน้าเท่านั้นที่เปลี่ยนผู้รับผิดชอบได้'));
    const before = ownerOf('opportunity', n);
    const result = reassign('opportunity', n, toCode, caller?.code ?? '', `${SEED_TODAY} 00:00`);
    if (result === 'ok') {
      if (before) stateOf(n).exResponsible = [...(stateOf(n).exResponsible ?? []).filter((c) => c !== before), before];
      return undefined;
    }
    if (result === 'closed') return refuse(409, 'OPPORTUNITY_CLOSED', msg('โอกาสขายที่ปิดแล้วเป็นแบบอ่านอย่างเดียว'));
    if (result === 'queued') return refuse(409, 'OPPORTUNITY_IN_WAITLIST', msg('โอกาสขายอยู่ใน Wait List — รับงานก่อนจึงจะทำรายการได้'));
    if (result === 'same') return refuse(422, 'VALIDATION_FAILED', msg('ผู้รับผิดชอบใหม่ต้องไม่ใช่คนเดิม'));
    return refuse(422, 'VALIDATION_FAILED', msg('ผู้รับผิดชอบใหม่ต้องเป็นพนักงานที่ใช้งานอยู่ในกลุ่มขั้นตอนของโอกาสขาย'));
  }

  function addHistory(n: number, item: Omit<HistoryItem, 'changeDate' | 'employee'> & { employee?: HistoryItem['employee'] }): void {
    const st = stateOf(n);
    st.tick++;
    const mins = st.tick;
    st.history.push({ ...item, changeDate: `${SEED_TODAY}T${pad2(18 + Math.floor(mins / 60))}:${pad2(mins % 60)}:00`, employee: item.employee ?? EMP_BY_ID.get(me ?? -1) ?? EMPLOYEES[0] });
  }

  function contactActivity(b: Json): Response {
    const n = Number(b['leadId']);
    if (!n) return json({ error: 'leadId required' }, 400);
    const blocked = writeBlocked(n);
    if (blocked) return blocked;
    const invalid = contactActivityInvalid(n, b);
    if (invalid) return invalid;
    const t = trigger(b['content']);
    if (t === '500') return json({ error: 'บันทึกการติดต่อไม่สำเร็จ (mock)' }, 500);
    if (t === '400') return json({ message: 'ข้อมูลไม่ถูกต้อง: กรุณาตรวจสอบขั้นตอน', status: 400 }, 400);
    const ch = CHANNELS.find((c) => c.type === b['channel'] || c.channel === b['channel']) ?? CHANNELS[0];
    const groups = groupsOf(n);
    const g = groups.find((x) => x.id === Number(b['procedureGroupId']));
    const step = g ? stepsOf(g).find((s) => s.id === Number(b['procedureId'])) : undefined;
    const [gi0, si0, asg] = stateOf(n).at ?? baseAt(n);
    if (g && step) {
      const gi = groups.indexOf(g);
      const si = stepsOf(g).findIndex((s) => s.id === step.id);
      if (gi !== gi0 || si !== si0) stateOf(n).at = [gi, si, asg];
    }
    const reached = step ? stepProbability(step.name) : undefined;
    addHistory(n, {
      type: ch.type,
      channel: ch.channel,
      content: String(b['content'] ?? ''),
      ...(b['workRecordDate'] ? { workRecordDate: String(b['workRecordDate']) } : {}),
      procedureGroupId: g ? g.id : null,
      procedureGroupName: g ? g.name : '',
      procedureId: step ? step.id : null,
      procedureName: step ? step.name : '',
    });
    if (step && (reached === 100 || reached === 0)) closeByStep(n, reached === 100 ? 'SUCCESS' : 'LOST', step.name, g?.id ?? null, step.id);
    return json({ status: 200, message: 'success' });
  }

  /** the rules of a contact activity (design 6.6): a channel and a detail; not dated ahead, nor before the opportunity was made */
  function contactActivityInvalid(n: number, b: Json): Response | undefined {
    const known = CHANNELS.some((c) => c.type === b['channel'] || c.channel === b['channel']);
    if (!known) return refuse(422, 'VALIDATION_FAILED', msg('ต้องเลือกช่องทางการติดต่อ'));
    if (String(b['content'] ?? '').trim() === '') return refuse(422, 'VALIDATION_FAILED', msg('ต้องกรอกรายละเอียดการติดต่อ'));
    const day = String(b['workRecordDate'] ?? '').slice(0, 10);
    if (!day) return undefined;
    // the page offers the clock of the browser, not the one of the sample data (SEED_TODAY)
    if (day > new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Bangkok' })) return refuse(422, 'VALIDATION_FAILED', msg('ลงบันทึกการติดต่อล่วงหน้าไม่ได้'));
    if (day < seedLead(n).createdDate) return refuse(422, 'VALIDATION_FAILED', msg('ลงบันทึกการติดต่อก่อนวันที่สร้างโอกาสขายไม่ได้'));
    return undefined;
  }

  /** the system closes the opportunity when it enters a step of 100% (sold) / 0% (lost): the result is written to the history and the shared database (design 6.3) */
  function closeByStep(n: number, outcome: 'SUCCESS' | 'LOST', stepName: string, groupId: number | null, stepId: number): void {
    const st = stateOf(n);
    // the appointments and tasks still open are cancelled with the opportunity (design 6.3, 6.7)
    const open = [...scheduleOf(n, 'APPOINTMENT'), ...scheduleOf(n, 'TASK')].filter((x) => x['status'] !== 'success' && x['status'] !== 'cancel');
    for (const x of open) (st.schedEdits ??= {})[String(x['id'])] = { ...(st.schedEdits[String(x['id'])] ?? {}), status: 'cancel' };
    st.closed = outcome;
    st.statusDate = SEED_TODAY;
    upsertSharedLead(n, { status: outcome, interest: outcome });
    addHistory(n, {
      type: 'close',
      channel: 'close',
      content: msg(outcome === 'SUCCESS' ? 'ปิดโอกาสขายอัตโนมัติ: ขายได้ (เข้าขั้น {0})' : 'ปิดโอกาสขายอัตโนมัติ: ไม่สำเร็จ (เข้าขั้น {0})', stepName),
      procedureGroupId: groupId,
      procedureGroupName: groupsOf(n).find((g) => g.id === groupId)?.name ?? '',
      procedureId: stepId,
      procedureName: stepName,
    });
    if (open.length > 0) {
      addHistory(n, { type: 'close', channel: 'close', content: msg('ยกเลิกนัดหมาย/งานที่ค้างอยู่ {0} รายการเพราะปิดโอกาสขาย', open.length), procedureGroupId: groupId, procedureGroupName: groupsOf(n).find((g) => g.id === groupId)?.name ?? '', procedureId: stepId, procedureName: stepName });
    }
  }

  function leadForward(b: Json): Response {
    const n = Number(b['leadId']);
    const targets = Array.isArray(b['targets']) ? (b['targets'] as Json[]) : [];
    if (!n || !targets.length) return fail(400, 'missing params: leadId, targets');
    const blocked = writeBlocked(n);
    if (blocked) return blocked;
    if (trigger(b['remark']) === '500') return fail(500, msg('ส่งต่องานไม่สำเร็จ (mock)'));
    if (trigger(b['remark']) === '400') return fail(400, msg('ผู้รับผิดชอบไม่อยู่ในกลุ่มขั้นตอนที่เลือก'));
    const groups = groupsOf(n);
    const first = targets[0];
    const gi = first['activityGroupId'] != null ? groups.findIndex((g) => g.id === Number(first['activityGroupId'])) : 0;
    const grp = groups[gi < 0 ? 0 : gi] ?? ALL_GROUPS[0];
    const steps = stepsOf(grp);
    const si = Math.max(0, steps.findIndex((s) => s.id === Number(first['activityStepId'])));
    stateOf(n).at = [gi < 0 ? 0 : gi, si, Number(first['assigneeEmployeeId'])];
    stateOf(n).stepClosed = false;
    upsertSharedLead(n, { ownerCode: EMP_BY_ID.get(Number(first['assigneeEmployeeId']))?.code });
    addHistory(n, { type: 'forward', channel: 'forward', content: String(b['remark'] ?? '') || msg('ส่งต่องานไปยัง {0}', grp.name), procedureGroupId: grp.id, procedureGroupName: grp.name, procedureId: steps[si].id, procedureName: steps[si].name });
    return ok();
  }

  function leadReturn(b: Json): Response {
    const n = Number(b['leadId']);
    if (!n || !b['currentActivityGroupId'] || !b['returnToActivityGroupId']) return fail(400, 'missing params: leadId, currentActivityGroupId, returnToActivityGroupId');
    const blocked = writeBlocked(n);
    if (blocked) return blocked;
    if (trigger(b['remark']) === '500') return fail(500, msg('ส่งกลับแก้ไขไม่สำเร็จ (mock)'));
    const groups = groupsOf(n);
    const gi = groups.findIndex((g) => g.id === Number(b['returnToActivityGroupId']));
    if (gi < 0) return fail(400, msg('ไม่พบกลุ่มขั้นตอนปลายทาง'));
    const g = groups[gi];
    stateOf(n).at = [gi, 0, deptEmployees(g)[0].id];
    stateOf(n).stepClosed = false;
    upsertSharedLead(n, { ownerCode: deptEmployees(g)[0].code });
    addHistory(n, { type: 'return', channel: 'return', content: String(b['remark'] ?? ''), procedureGroupId: g.id, procedureGroupName: g.name, procedureId: stepsOf(g)[0].id, procedureName: stepsOf(g)[0].name });
    return ok();
  }

  function leadCloseStep(b: Json): Response {
    const n = Number(b['leadId']);
    if (!n || !(Number(b['wfsId']) > 0)) return fail(400, 'missing params: leadId, wfsId');
    const blocked = writeBlocked(n);
    if (blocked) return blocked;
    if (n % 7 === 0) return fail(500, msg('ปิดแก้ไขกลุ่มขั้นตอนไม่สำเร็จ (mock)'));
    stateOf(n).stepClosed = true;
    const cs = currentStepOf(n, me);
    addHistory(n, { type: 'manual', channel: 'manual', content: String(b['remark'] ?? ''), procedureGroupId: (cs['procedureGroupId'] as number) ?? null, procedureGroupName: String(cs['procedureGroupName'] ?? ''), procedureId: (cs['procedureId'] as number) ?? null, procedureName: String(cs['procedureName'] ?? '') });
    return ok();
  }

  function leadClose(b: Json): Response {
    const n = Number(b['leadId']);
    if (!n || (b['outcome'] !== 'sold' && b['outcome'] !== 'lost')) return fail(400, 'missing params: leadId, outcome (sold|lost)');
    // FAST-DEBT(REQ): the design has no close button — the system closes the opportunity when it enters a step of 100% / 0% (S16 / S18); the button of the generated page is still drawn and answers with this refusal · somyot · 2026-11-21
    const blocked = isClosedLead(n) ? refuse(409, 'OPPORTUNITY_CLOSED', msg('โอกาสขายที่ปิดแล้วเป็นแบบอ่านอย่างเดียว')) : undefined;
    return blocked ?? refuse(422, 'VALIDATION_FAILED', msg('ไม่มีปุ่มปิดโอกาสขาย — ระบบปิดให้เมื่อย้ายเข้าขั้นที่ 100% (ขายได้) หรือ 0% (ไม่สำเร็จ)'));
  }

  /** the products are read-only on the single opportunity (design §5, S16): the answer is the refusal of a field nobody may edit */
  function leadMaterials(b: Json): Response {
    const n = Number(b['leadId']);
    if (!n) return fail(400, 'leadId required');
    const blocked = writeBlocked(n);
    return blocked ?? refuse(403, 'FIELD_NOT_EDITABLE', msg('ผลิตภัณฑ์เป็นแบบอ่านอย่างเดียว'));
  }

  return {
    async initial(): Promise<OpportunityDetailInitial> {
      await wait();
      return { uploadAcceptExt: MOCK_UPLOAD_ACCEPT };
    },
    async fetch(input: string, init?: RequestInit): Promise<Response> {
      await wait();
      const url = new URL(String(input).replace(/^(\.\.\/)+/, '').replace(/^\/+/, '/').replace(/^\//, ''), 'http://mock/');
      const path = url.pathname.replace(/^\//, '').replace(/^triplesale\//, '');
      const reply = await handle(path, url.searchParams, init);
      if ((init?.method ?? 'GET').toUpperCase() !== 'GET') persist();
      return reply;
    },
  };
}

/** [Thai, English] of each country: the Thai name is the one `ChatMasterDataServlet` writes — `MasterDataI18n.translateTh(code)` (the Thai dictionary master-data.th.json wins over the `nameTh` of the service) */
const COUNTRY_NAMES: Record<string, [string, string]> = {
  THA: ['ไทย', 'Thailand'],
  USA: ['สหรัฐอเมริกา', 'United States'],
  JPN: ['ญี่ปุ่น', 'Japan'],
  GBR: ['สหราชอาณาจักร', 'United Kingdom'],
  SGP: ['สิงคโปร์', 'Singapore'],
  CAN: ['แคนาดา', 'Canada'],
  AIA: ['แองกวิลลา', 'Anguilla'],
  MYS: ['มาเลเซีย', 'Malaysia'],
  LAO: ['ลาว', 'Laos'],
  VNM: ['เวียดนาม', 'Vietnam'],
  KHM: ['กัมพูชา', 'Cambodia'],
  ATA: ['แอนตาร์กติกา', 'Antarctica'],
  ASN: ['อาเซียน', 'Unspecified'],
};

/** what makes lead `n` special (the scenarios and the spec use it to pick leads; see the header) */
export function opportunityFacts(n: number): { usesWf: boolean; groups: number; groupIdx: number; stepIdx: number; steps: number; hasOwner: boolean; hasTeam: boolean; hasHistory: boolean; status: string; ownerId: number; appts: number; tasks: number } {
  const seed = seedLead(n);
  return {
    usesWf: usesWf(n),
    groups: groupsOf(n).length,
    groupIdx: Math.min(seed.groupIdx, Math.max(0, groupsOf(n).length - 1)),
    stepIdx: baseAt(n)[1],
    steps: stepsOf(groupsOf(n)[Math.min(seed.groupIdx, Math.max(0, groupsOf(n).length - 1))] ?? ALL_GROUPS[0]).length,
    hasOwner: hasOwner(n),
    hasTeam: hasTeam(n),
    hasHistory: hasHistory(n),
    status: statusOf(n),
    ownerId: EMP_ID(seed.ownerCode),
    appts: scheduleOf(n, 'APPOINTMENT').length,
    tasks: scheduleOf(n, 'TASK').length,
  };
}
