/**
 * สิทธิ์และการมองเห็นของเมนู Lead — ไม่ผูก framework (spec ใช้ใน Node ได้).
 * อ้างอิง: permission-visibility-design.md (§1 ลำดับชั้น · §4 รายการสิทธิ์ · §5.1 action → permission · §6–7 การมองเห็นตามผังองค์กร · §9 ฟิลด์ลับ)
 * และ lead-prospect-opportunity-flow.md (§3.2 ตารางเปลี่ยนสถานะ · §3.10 หลังแปลงเป็นลูกค้าเป้าหมาย).
 *
 * ลำดับตัดสิน: ต้องมี `Pipeline_Lead_View` (เพดาน — ไม่มีแล้วไม่เห็นแม้เป็นเจ้าของ) → เห็นใบนี้ไหม (ช่องทางเข้าถึง) → ทำ action นั้นได้ไหม
 * (permission ของ action + ช่องทางเข้าถึงให้ระดับแก้ + สถานะของใบ). ใบที่มองไม่เห็นต้องไม่โผล่ทั้งในรายการ ตัวนับ และการค้นหา.
 */
import { employeeCodeOfOwner, isSuperiorOf, ownerCodeOf } from '@core/mock/org-chart';
import { ROLE } from '@core/permissions/roles';
import type { Lead, LeadForm, LeadStatus } from './leads.types';

/** ค่าที่แสดงแทนฟิลด์ที่ผู้ใช้ไม่มีสิทธิ์ข้อมูล (ค่าจริงไม่ถูกส่งมาหน้าจอ) */
export const MASK = '***';

/** ผู้ใช้ที่กำลังดูหน้า Lead: รหัสเจ้าของของตน (ว่าง = ไม่ได้อยู่ในผังของ Lead) + ฟังก์ชันตรวจสิทธิ์ */
export interface LeadViewer {
  readonly ownerCode: string;
  has(key: string): boolean;
}

export { employeeCodeOfOwner, isSuperiorOf, ownerCodeOf };

export type LeadLevel = 'none' | 'read' | 'write';

/**
 * ระดับการเข้าถึงใบนี้ของผู้ใช้:
 *  - ไม่มี `Pipeline_Lead_View` → none (เพดาน)
 *  - `MASTER_EDIT_ALL` / `TRANSACTION_EDIT_ALL` (Entity Admin) → write ทุกใบ
 *  - เจ้าของ หรือหัวหน้าทุกชั้น → write (ทำได้เท่าที่ permission ของตัวเองให้ — ตรวจที่ `leadActions`)
 *  - ใบไม่มีเจ้าของ (Wait List) → read เมื่อมี `Pipeline_Wait_list_Access`
 *  - `VIEW_ALL` (Entity Viewer) → read ทุกใบ
 *  - นอกนั้น (รวมคนระดับเดียวกัน) → none
 */
export function leadLevel(viewer: LeadViewer, lead: Pick<Lead, 'ownerCode'>): LeadLevel {
  if (!viewer.has(ROLE.pipelineLeadView)) return 'none';
  if (viewer.has(ROLE.masterEditAll) || viewer.has(ROLE.transactionEditAll)) return 'write';
  if (lead.ownerCode === '') return viewer.has(ROLE.pipelineWaitListAccess) || viewer.has(ROLE.viewAll) ? 'read' : 'none';
  const mine = viewer.ownerCode !== '' && (lead.ownerCode === viewer.ownerCode || isSuperiorOf(viewer.ownerCode, lead.ownerCode));
  if (mine) return 'write';
  return viewer.has(ROLE.viewAll) ? 'read' : 'none';
}

export const canSeeLead = (viewer: LeadViewer, lead: Pick<Lead, 'ownerCode'>): boolean => leadLevel(viewer, lead) !== 'none';

/* ================================================================================================ สถานะ */

/** การเปลี่ยนสถานะด้วยมือที่ทำได้ (flow §3.2): New→Contacting และ Inactive→Contacting ผ่านการบันทึกการติดต่อ (ระบบทำเอง) ; Converted ผ่านเส้นแปลงเท่านั้น */
const TRANSITIONS: Readonly<Record<LeadStatus, readonly LeadStatus[]>> = {
  new: ['disqualified'],
  contacting: ['inactive', 'disqualified'],
  inactive: ['contacting', 'disqualified'],
  disqualified: ['contacting'],
  converted: [],
};

/** ต้องระบุเหตุผล: ไป Disqualified (LD-17) หรือเปิดกลับจาก Disqualified (LD-18) */
export const needsReason = (from: LeadStatus, to: LeadStatus): boolean => to === 'disqualified' || from === 'disqualified';

/** สถานะปลายทางที่ผู้ใช้เปลี่ยนให้ใบนี้ได้ (ไป Disqualified ใช้ `Pipeline_Lead_Close` ที่เหลือใช้ `Pipeline_Lead_Edit`) */
export function allowedStatuses(viewer: LeadViewer, lead: Pick<Lead, 'ownerCode' | 'status'>): LeadStatus[] {
  // a lead in the queue has no owner: nobody changes its status until it is taken, not even an administrator (LD-20)
  if (leadLevel(viewer, lead) !== 'write' || lead.ownerCode === '') return [];
  return TRANSITIONS[lead.status].filter((to) => viewer.has(to === 'disqualified' ? ROLE.pipelineLeadClose : ROLE.pipelineLeadEdit));
}

export const isTransitionAllowed = (from: LeadStatus, to: LeadStatus): boolean => TRANSITIONS[from].includes(to);

/* ================================================================================================ ปุ่ม */

export interface LeadActions {
  /** เปลี่ยนผู้รับผิดชอบ (`_Change_Assign`) — ใบที่มีเจ้าของและยังไม่ปิด */
  changeOwner: boolean;
  /** คืนเข้าคิว (`_Change_Assign`) — ต้องบอกเหตุผล */
  returnToQueue: boolean;
  edit: boolean;
  trash: boolean;
  status: boolean;
  convert: boolean;
  opportunity: boolean;
  contact: boolean;
  appointment: boolean;
  task: boolean;
}

/**
 * ปุ่มที่ผู้ใช้กดได้กับใบนี้ = permission ของปุ่ม ∧ ช่องทางเข้าถึงให้ระดับแก้ ∧ สถานะของใบ.
 * Converted อ่านอย่างเดียว (ยกเว้นนัด/งานที่ค้าง) ; Disqualified ทำได้แค่ดู เปิดกลับ และลงถังขยะ (flow §3.2, §3.10).
 */
export function leadActions(viewer: LeadViewer, lead: Pick<Lead, 'ownerCode' | 'status'>): LeadActions {
  const write = leadLevel(viewer, lead) === 'write';
  // a lead in the queue (no owner) can be taken or given, trashed or viewed — but not edited, moved on, converted or worked (LD-20)
  const worked = write && lead.ownerCode !== '';
  const converted = lead.status === 'converted';
  const active = !converted && lead.status !== 'disqualified';
  const has = (key: string): boolean => viewer.has(key);
  const convert = worked && active && has(ROLE.pipelineLeadConvertProspect);
  // เปลี่ยนคน / คืนคิว: เจ้าของหรือหัวหน้า · ใบไม่ปิด ไม่ Converted · ใบที่อยู่ในคิวทำไม่ได้ (ทำได้อย่างเดียวคือมอบหมาย)
  const reassign = write && active && lead.ownerCode !== '' && lead.status !== 'disqualified' && has(ROLE.pipelineLeadChangeAssign);
  // FAST-DEBT(REQ): ปุ่ม "สร้างโอกาสขาย" บนหน้า Lead เก็บไว้ตามดีไซน์ Figma ทั้งที่ lead-prospect-opportunity-flow.md (S14 ข้อ 3) ระบุว่าไม่ทำรอบนี้ (ให้แปลงเป็นลูกค้าก่อนแล้วสร้างโอกาสขายจากหน้าลูกค้า) · somyot · 2026-11-20
  return {
    changeOwner: reassign,
    returnToQueue: reassign,
    edit: worked && active && has(ROLE.pipelineLeadEdit),
    trash: write && !converted && has(ROLE.pipelineLeadTrash),
    status: allowedStatuses(viewer, lead).length > 0,
    convert,
    opportunity: convert && has(ROLE.pipelineOpportunityCreate),
    contact: worked && active && has(ROLE.pipelineLeadContactActivityCreate),
    // Disqualified is view / reopen / trash only (flow 3.2): no new appointment or task either
    appointment: worked && active && has(ROLE.pipelineScheduleAppointmentAddEdit),
    task: worked && active && has(ROLE.pipelineScheduleTaskAddEdit),
  };
}

/** ปุ่ม/ทางลัดที่ไม่ผูกกับใบใดใบหนึ่ง: เพิ่ม · นำเข้า · ส่งออก · ดูบันทึกการติดต่อ */
export interface LeadMenuActions {
  /** ดูคิว (Wait List): `Pipeline_Wait_list_Access` + `Pipeline_Lead_View` (+ สมาชิก Sharing Group — จำลองว่าทุกคนที่มีสิทธิ์เป็นสมาชิก) */
  queue: boolean;
  /** รับให้ตัวเอง / แจกให้คนอื่น จากคิว (`Pipeline_Lead_Assign`) — "รับ" ต้องมีรหัสเจ้าของในผังของ Lead ด้วย */
  take: boolean;
  give: boolean;
  /** ถังขยะ: ดูและกู้คืนได้เฉพาะผู้มี `Pipeline_Lead_Trash` */
  trash: boolean;
  create: boolean;
  import: boolean;
  export: boolean;
  contactView: boolean;
}

/**
 * FAST-DEBT(PERM): ส่งออก CSV ไม่มี permission ของตัวเองในเอกสาร (Q10) — ใช้ `Pipeline_Lead_View` (ฟิลด์ลับถูกปิดตามสิทธิ์ผู้ส่งออก) รอทีมสินค้ากำหนด · somyot · 2026-11-20
 */
export function leadMenuActions(viewer: LeadViewer): LeadMenuActions {
  const queue = viewer.has(ROLE.pipelineWaitListAccess) && viewer.has(ROLE.pipelineLeadView);
  const assign = queue && viewer.has(ROLE.pipelineLeadAssign);
  return {
    queue,
    take: assign && viewer.ownerCode !== '',
    give: assign,
    trash: viewer.has(ROLE.pipelineLeadTrash) && viewer.has(ROLE.pipelineLeadView),
    create: viewer.has(ROLE.pipelineLeadCreate),
    import: viewer.has(ROLE.pipelineLeadCreate),
    export: viewer.has(ROLE.pipelineLeadView),
    contactView: viewer.has(ROLE.pipelineLeadContactView),
  };
}

/** กู้คืนจากถังขยะ: ต้องมี `Pipeline_Lead_Trash` และเห็นใบนั้นตามสิทธิ์ปกติ (เจ้าของ หัวหน้า VIEW_ALL ผู้ดูแล — คนอื่น = ไม่พบ) */
export const canRestoreLead = (viewer: LeadViewer, lead: Pick<Lead, 'ownerCode'>): boolean => viewer.has(ROLE.pipelineLeadTrash) && canSeeLead(viewer, lead);

/** ผู้ที่เป็นสมาชิกคิวเห็นใบในคิวทุกใบ (ไม่แยกเจ้าของ) ; ใบมีเจ้าของไม่นับเป็นใบของคิว */
export const canSeeQueued = (viewer: LeadViewer, lead: Pick<Lead, 'ownerCode'>): boolean => lead.ownerCode === '' && canSeeLead(viewer, lead);

/* ================================================================================================ ฟิลด์ลับ */

type SecretField = keyof Pick<LeadForm, 'phone' | 'email' | 'address' | 'taxId' | 'source'>;

/**
 * ฟิลด์ลับตามหมวดข้อมูล (§9): PDPA = เบอร์/อีเมล/ที่อยู่ปัจจุบัน · Critical = เลขที่ผู้เสียภาษี · Strategic = แหล่งที่มา.
 * FAST-DEBT(REQ): หมวดทั้งหมดถือว่าบริษัท "เปิด" ไว้ (ค่าจริงเป็นการตั้งค่าต่อบริษัท) · somyot · 2026-11-20
 */
const SECRET_FIELDS: ReadonlyArray<readonly [string, readonly SecretField[]]> = [
  [ROLE.pipelineLeadCustomerPdpaData, ['phone', 'email', 'address']],
  [ROLE.pipelineLeadCustomerCriticalData, ['taxId']],
  [ROLE.pipelineLeadCompanyStrategicData, ['source']],
];

/** ฟิลด์ที่ผู้ใช้นี้ไม่มีสิทธิ์ข้อมูลจึงต้องปิด (`***`) */
export function maskedFields(viewer: LeadViewer): readonly SecretField[] {
  return SECRET_FIELDS.filter(([key]) => !viewer.has(key)).flatMap(([, fields]) => fields);
}

/** สำเนาของ Lead ที่ปิดฟิลด์ลับแล้ว (ค่าจริงไม่ติดไปกับสำเนา) */
export function maskLead(lead: Lead, masked: readonly SecretField[]): Lead {
  if (!masked.length) return lead;
  const copy: Lead = { ...lead };
  for (const f of masked) copy[f] = copy[f] ? MASK : '';
  return copy;
}

/** ค่าของฟอร์มที่ส่งมาแก้: ฟิลด์ที่ถูกปิดคงค่าเดิมเสมอ (แก้ฟิลด์ลับไม่ได้ — ที่ API จริงคือ 403 FIELD_NOT_EDITABLE) */
export function keepMasked(form: LeadForm, original: Lead, masked: readonly SecretField[]): LeadForm {
  const out: LeadForm = { ...form };
  for (const f of masked) out[f] = original[f];
  return out;
}
