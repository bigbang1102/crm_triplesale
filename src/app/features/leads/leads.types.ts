import { reference } from '@core/mock/reference';
/**
 * เมนู Lead (`/crm/leads` — รายชื่อผู้สนใจก่อนเป็นลูกค้าเป้าหมาย) ตามดีไซน์ Figma "Triple Sales - Web App" › CRM › Lead.
 * ชนิดข้อมูลของหน้า — ไม่ผูก framework (mock + spec ใช้ใน Node ได้).
 */

export const LEAD_STATUSES = ['new', 'contacting', 'inactive', 'disqualified', 'converted'] as const;
export type LeadStatus = (typeof LEAD_STATUSES)[number];

/** ชนิดของบันทึกการติดต่อ (ปุ่มในหน้าต่าง "เพิ่มการติดต่อ") */
export const CONTACT_KINDS = ['note', 'callOut', 'callIn', 'sms', 'email', 'facebook', 'line'] as const;
export type ContactKind = (typeof CONTACT_KINDS)[number];

export const LEAD_HISTORY_ACTIONS = ['queueIn', 'take', 'give', 'change', 'return', 'trash', 'restore'] as const;
export type LeadHistoryAction = (typeof LEAD_HISTORY_ACTIONS)[number];

/** หนึ่งบรรทัดของประวัติการมอบหมาย: ใคร · เมื่อไร · จากใคร → ใคร · เหตุผล (รหัสเจ้าของ ว่าง = คิว) */
export interface LeadHistory {
  action: LeadHistoryAction;
  /** `YYYY-MM-DD HH:mm` (เวลาเครื่อง) */
  at: string;
  byCode: string;
  fromCode: string;
  toCode: string;
  reason: string;
}

/** ที่ที่ Lead อยู่: รายการของคน (มีเจ้าของ) · คิว (Wait List — ไม่มีเจ้าของ) · ถังขยะ */
export type LeadScope = 'owned' | 'queue' | 'trash';

export interface LeadContactLog {
  id: number;
  kind: ContactKind;
  text: string;
  /** `YYYY-MM-DD HH:mm` (เวลาเครื่อง) */
  at: string;
  byCode: string;
}

export const LEAD_ITEM_KINDS = ['appointment', 'task'] as const;
export type LeadItemKind = (typeof LEAD_ITEM_KINDS)[number];

/** นัดหมาย / งาน ของ Lead */
export interface LeadItem {
  id: number;
  kind: LeadItemKind;
  title: string;
  /** `YYYY-MM-DD` */
  date: string;
  /** `HH:mm` ; ว่างเมื่อ `allDay` */
  time: string;
  allDay: boolean;
  detail: string;
  status: string;
}

export interface Lead {
  id: number;
  /** เลขที่ Lead เช่น `LD-P23-05671` */
  code: string;
  /** `YYYY-MM-DD` */
  createdDate: string;
  status: LeadStatus;
  name: string;
  phoneCode: string;
  phone: string;
  email: string;
  source: string;
  ownerCode: string;
  address: string;
  country: string;
  province: string;
  district: string;
  subdistrict: string;
  postcode: string;
  taxId: string;
  /** วันที่ติดต่อครั้งแรก `YYYY-MM-DD` */
  firstContactDate: string;
  contacts: LeadContactLog[];
  items: LeadItem[];
  /** ย้ายไปถังขยะแล้ว (ไม่โผล่ในรายการ/ค้นหา/ตัวนับ — ไม่ลบจริง) · วันที่ `YYYY-MM-DD` · ผู้ลบ */
  trashed?: boolean;
  trashedAt?: string;
  trashedBy?: string;
  /** ประวัติการเข้า/ออกคิว รับ มอบ คืน เปลี่ยนคน ลบ กู้คืน (flow §3.5 · แก้/ลบไม่ได้) เรียงเก่าก่อน */
  history?: LeadHistory[];
  /** เมื่อสถานะ Converted: ลูกค้าเป้าหมาย/โอกาสขายที่เกิดจากใบนี้ · วันที่ `YYYY-MM-DD` · ผู้แปลง · ผู้รับผิดชอบตอนแปลง (flow §3.10) */
  prospectId?: number;
  opportunityId?: number;
  convertedAt?: string;
  convertedBy?: string;
  convertedOwner?: string;
}

/** ค่าที่หน้าต่าง เพิ่ม / แก้ไข Lead ส่งมา */
export interface LeadForm {
  name: string;
  phoneCode: string;
  phone: string;
  email: string;
  source: string;
  ownerCode: string;
  address: string;
  country: string;
  province: string;
  district: string;
  subdistrict: string;
  postcode: string;
  taxId: string;
}

export type LeadSort = 'newest' | 'oldest' | 'name';

export interface LeadFilter {
  /** ว่าง = ทุกที่มา */
  sources: readonly string[];
  /** ว่าง = ทุกคน */
  ownerCode: string;
  /** `YYYY-MM-DD` หรือว่าง */
  dateFrom: string;
  dateTo: string;
}

export interface LeadQuery {
  /** ว่าง = ทั้งหมด */
  status: LeadStatus | '';
  search: string;
  sort: LeadSort;
  filter: LeadFilter;
  /** ใบที่ผู้ใช้เห็นได้ (ว่าง = ทุกใบ) — ใช้กับรายการ ตัวนับ และการค้นหาเหมือนกัน */
  canSee?: (lead: Lead) => boolean;
  /** ที่ที่ค้นหา (ว่าง = `owned`: รายการของคน ไม่รวมคิวและถังขยะ) */
  scope?: LeadScope;
  /** ค้นหาจากเบอร์/อีเมลได้หรือไม่ (false เมื่อฟิลด์นั้นถูกปิดตามสิทธิ์ข้อมูล) */
  searchContacts?: boolean;
}

export type LeadCounts = Record<LeadStatus | 'all', number>;

/** แถวของรายชื่อที่นำเข้า (ผลตรวจจากไฟล์) */
export type ImportRowState = 'new' | 'exists' | 'duplicate' | 'noPhone';

export interface ImportRow {
  /** ลำดับในไฟล์ (เริ่ม 1) */
  no: number;
  firstName: string;
  lastName: string;
  phone: string;
  email: string;
  address: string;
  state: ImportRowState;
}

export interface ConvertForm {
  salesLine: string;
  team: string;
  salesPerson: string;
  ownerCode: string;
}

export interface Employee {
  code: string;
  name: string;
}

/** ผู้รับผิดชอบที่เลือกได้ (ข้อมูลจำลอง) */
export const LEAD_OWNERS: readonly Employee[] = reference('leads.owners', [
  { code: 'CS0001', name: 'ขวัญจิรา' },
  { code: 'CS0002', name: 'ธนากร' },
  { code: 'CS0003', name: 'พิมพ์ชนก' },
  { code: 'CS0004', name: 'อนุชา' },
]);

export const LEAD_SOURCES = reference('leads.sources', ['Event & Exhibition', 'Facebook', 'LINE OA', 'Website', 'Walk-in', 'Referral'] as const);

export const SALES_LINES = reference('leads.salesLines', ['สายงานขาย A', 'สายงานขาย B'] as const);
export const SALES_TEAMS: Readonly<Record<string, readonly string[]>> = reference('leads.salesTeams', {
  'สายงานขาย A': ['ทีมขาย A1', 'ทีมขาย A2'],
  'สายงานขาย B': ['ทีมขาย B1'],
});
