/**
 * สิทธิ์ของหน้า Waitlist แยกตามชนิดเอกสาร (permission-visibility-design.md §4–§5.1 · flow §2.4):
 * เห็นคิวเมื่อมี `Pipeline_Wait_list_Access` + `Pipeline_<Doc>_View` (ไม่ครบ = ไม่พบ) · รับ/แจกต้องมี `Pipeline_<Doc>_Assign`.
 * ไม่ผูก framework.
 */
import { ROLE } from './roles';
import { SEED_EMPLOYEES } from '../mock/crm-seed';
import { isHeadOf } from '../mock/waitlist';

/** what the checks need of the user: the permission test of `PermissionService` (or a stand-in in a spec) */
export interface Has {
  has(key: string): boolean;
}

export type QueueTab = 'lead' | 'prospect' | 'opportunity';

export const QUEUE_TABS: readonly QueueTab[] = ['lead', 'prospect', 'opportunity'];

const KEYS: Readonly<Record<QueueTab, { view: string; assign: string; pdpa: string }>> = {
  lead: { view: ROLE.pipelineLeadView, assign: ROLE.pipelineLeadAssign, pdpa: ROLE.pipelineLeadCustomerPdpaData },
  prospect: { view: ROLE.pipelineProspectView, assign: ROLE.pipelineProspectAssign, pdpa: ROLE.pipelineProspectCustomerPdpaData },
  opportunity: { view: ROLE.pipelineOpportunityView, assign: ROLE.pipelineOpportunityAssign, pdpa: ROLE.pipelineOpportunityCustomerPdpaData },
};

/** แท็บของคิวที่ผู้ใช้เห็น */
export const queueTabs = (viewer: Has): QueueTab[] =>
  viewer.has(ROLE.pipelineWaitListAccess) ? QUEUE_TABS.filter((t) => viewer.has(KEYS[t].view)) : [];

/** แจกให้คนอื่นได้ */
export const canGiveFromQueue = (viewer: Has, tab: QueueTab): boolean => queueTabs(viewer).includes(tab) && viewer.has(KEYS[tab].assign);

/** เบอร์/ข้อมูลลูกค้าของแท็บนี้แสดงจริงได้หรือไม่ (หมวด Customer PDPA ของเอกสารนั้น) */
export const canSeeQueuePhone = (viewer: Has, tab: QueueTab): boolean => viewer.has(KEYS[tab].pdpa);

/** รหัสพนักงานของผู้ใช้ในผัง Prospect/โอกาสขาย (`E10x`) — ว่าง = ไม่อยู่ในรายชื่อ จึง "รับ" ให้ตัวเองไม่ได้ (แจกให้คนอื่นยังได้) */
export const employeeCodeOf = (employeeCode: string): string => (SEED_EMPLOYEES.some((e) => e.code === employeeCode) ? employeeCode : '');

/** what the owner bar of a customer / opportunity offers */
export interface OwnerBarActions {
  changeOwner: boolean;
  returnToQueue: boolean;
}

const CHANGE_ASSIGN = { prospect: ROLE.pipelineProspectChangeAssign, opportunity: ROLE.pipelineOpportunityChangeAssign } as const;

/**
 * Change the owner / return to the queue (`Pipeline_<Doc>_Change_Assign`): the owner or a head of the owner, the item is not in the queue.
 * An Entity Admin (`MASTER_EDIT_ALL` / `TRANSACTION_EDIT_ALL`) may too for a customer — never for an opportunity (OP-24: "no Admin may do the owner's work").
 */
export function ownerBarActions(viewer: Has, kind: 'prospect' | 'opportunity', ownerCode: string, employeeCode: string, inQueue: boolean): OwnerBarActions {
  const none = { changeOwner: false, returnToQueue: false };
  if (inQueue || !viewer.has(CHANGE_ASSIGN[kind])) return none;
  const mine = ownerCode !== '' && employeeCode !== '' && (employeeCode === ownerCode || isHeadOf(employeeCode, ownerCode));
  const admin = kind === 'prospect' && (viewer.has(ROLE.masterEditAll) || viewer.has(ROLE.transactionEditAll));
  return mine || admin ? { changeOwner: true, returnToQueue: true } : none;
}

