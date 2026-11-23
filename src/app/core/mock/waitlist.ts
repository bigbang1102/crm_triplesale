/**
 * คิว (Wait List) ของลูกค้าเป้าหมาย (Prospect) และโอกาสขาย (OPP) — ไม่ผูก framework (spec ใช้ใน Node ได้).
 * ข้อมูลคิวอยู่ในฐานข้อมูลร่วมของ mock (`@core/mock/shared-db`: `waitlist`) ; ลูกค้า/โอกาสขายมาจาก seed กลาง (`@core/mock/crm-seed`) จึงเป็นคนเดียวกับที่ทุกหน้าเห็น.
 * กติกาตาม lead-prospect-opportunity-flow.md §2.4, §4.7, §5.7: เรียงเก่าสุดก่อน · รับ/แจกทีละใบ คนแรกได้ คนที่สองไม่ได้ · ผู้รับเป็นพนักงาน (E10x).
 * FAST-DEBT(API): ยังไม่มี backend — การรับ/แจกเขียนลงฐานร่วมโดยตรง · somyot · 2026-11-20
 */
import { SEED_EMPLOYEES, SEED_GROUPS, leadIds, seedHash, seedLead, seedProspect } from './crm-seed';
import { canReceiveWork, receiversOf } from './role-store';
import { appendWaitHistory, dequeue, enqueue, groupMembersOf, setGroupMembers, upsertSharedLead, upsertSharedProspect, waitHistoryOf, waitlistOf, type WaitEntry, type WaitHistoryEntry } from './shared-db';

export type QueueKind = 'prospect' | 'opportunity';

const STATE_KEY = { prospect: 'prospects', opportunity: 'opportunities' } as const;

/** พนักงานทุกคนของ mockup (ผู้รับจริงของแต่ละเอกสารกรองจากชุดสิทธิ์ขั้นต่ำด้วย `candidatesFor` — BR-LDP-16 / OP-31) */
export const queueEmployees = (): { code: string; name: string }[] => SEED_EMPLOYEES.map((e) => ({ code: e.code, name: e.name }));

export const queueEmployeeName = (code: string): string => {
  const e = queueEmployees().find((x) => x.code === code);
  return e ? `${e.code} ${e.name}` : code;
};

export interface QueueRow {
  id: number;
  code: string;
  /** ชื่อลูกค้า */
  name: string;
  phone: string;
  province: string;
  source: string;
  /** รออยู่ตั้งแต่ `YYYY-MM-DD` */
  since: string;
  /** โอกาสขาย: กลุ่มกิจกรรมที่คิวนี้เป็นของ (คิวต่อกลุ่ม) */
  groupId: number;
  group: string;
  interest: string;
  amount: number;
  /** เจ้าของเดิมที่คืนใบเข้าคิว (ว่าง = เข้าคิวโดยไม่มีเจ้าของ) */
  fromCode: string;
}

function rowOf(kind: QueueKind, id: number, entry: WaitEntry): QueueRow {
  if (kind === 'prospect') {
    const p = seedProspect(id);
    return { id, code: p.code, name: p.fullName, phone: p.phone, province: p.province, source: p.source, since: entry.since, groupId: 0, group: '', interest: '', amount: 0, fromCode: entry.fromCode };
  }
  const l = seedLead(id);
  const g = SEED_GROUPS[l.groupIdx];
  return { id, code: l.code, name: l.customerName, phone: l.phone, province: l.province, source: l.source, since: entry.since, groupId: g.id, group: g.name, interest: l.interest, amount: l.amount, fromCode: entry.fromCode };
}

/* ================================================================================================ สมาชิกกลุ่มกิจกรรม */

export interface GroupInfo {
  id: number;
  code: string;
  name: string;
}

/** สมาชิกของกลุ่มกิจกรรม = สมาชิกของ Wait List ของกลุ่มนั้น (คู่กัน 1:1 แก้แยกไม่ได้ — flow §5.13) */
export const membersOf = (groupId: number): readonly string[] => groupMembersOf(groupId);

export const isMember = (groupId: number, employeeCode: string): boolean => employeeCode !== '' && groupMembersOf(groupId).includes(employeeCode);

/** กลุ่มกิจกรรมที่พนักงานเป็นสมาชิก (ไม่อยู่ในกลุ่มใดเลย = ว่าง) */
export const groupsOf = (employeeCode: string): GroupInfo[] => SEED_GROUPS.filter((g) => isMember(g.id, employeeCode)).map((g) => ({ id: g.id, code: g.code, name: g.name }));

/** กลุ่มกิจกรรมที่โอกาสขายอยู่ (กลุ่มเดียวตลอดอายุใบ — single) */
export const groupIdOfOpportunity = (id: number): number => seedLead(id).groupId;

/**
 * ผู้ที่เป็นเจ้าของ/รับใบนี้ได้ = ผ่านชุดสิทธิ์ขั้นต่ำของผู้รับ (View + Edit ของเอกสารประเภทนั้น จาก Role ของตำแหน่ง — BR-LDP-16 / OP-31)
 * และโอกาสขายต้องเป็นสมาชิกกลุ่มกิจกรรมของใบด้วย.
 */
export function candidatesFor(kind: QueueKind, id: number): { code: string; name: string }[] {
  const receivers = receiversOf(kind);
  if (kind === 'prospect') return receivers;
  const members = membersOf(groupIdOfOpportunity(id));
  return receivers.filter((e) => members.includes(e.code));
}

/** ผ่านชุดสิทธิ์ขั้นต่ำของผู้รับของเอกสารประเภทนี้หรือไม่ */
const isReceiver = (kind: QueueKind, code: string): boolean => canReceiveWork(kind, code);

const isGroupMember = (kind: QueueKind, id: number, code: string): boolean => kind === 'prospect' || isMember(groupIdOfOpportunity(id), code);

/**
 * ใบที่รออยู่ในคิว เรียงเก่าสุดก่อน (เท่ากันเรียงตาม id) ; โอกาสขายกรองตามกลุ่มกิจกรรมได้.
 * `member` (รหัสพนักงานของผู้ดู): โอกาสขายเห็นเฉพาะใบของกลุ่มที่เป็นสมาชิก — คนที่ไม่ใช่สมาชิกไม่เห็นคิวของกลุ่มนั้นเลย (flow §5.7: ไม่ครบ = 404).
 */
export function queueRows(kind: QueueKind, groupId = 0, member?: string): QueueRow[] {
  const rows = Object.entries(waitlistOf()[STATE_KEY[kind]]).map(([id, entry]) => rowOf(kind, Number(id), entry));
  return rows
    .filter((r) => !groupId || r.groupId === groupId)
    .filter((r) => kind === 'prospect' || member === undefined || isMember(r.groupId, member))
    .sort((a, b) => a.since.localeCompare(b.since) || a.id - b.id);
}

/** `notReceiver` = ผู้รับไม่มี View + Edit ของเอกสารประเภทนี้ (ชุดสิทธิ์ขั้นต่ำของผู้รับ) */
export type TakeResult = 'ok' | 'taken' | 'invalid' | 'notMember' | 'notReceiver';

/**
 * รับ (`toCode` = ตัวเอง) หรือแจก (`toCode` = คนอื่น) จากคิว: ออกจากคิวและมีผู้รับผิดชอบทันที — ทุกหน้าเห็นเจ้าของใหม่.
 * คนแรกได้ ; ใบที่ไม่อยู่ในคิวแล้ว = `taken` ; ผู้รับที่ไม่ใช่พนักงาน = `invalid`.
 */
export function takeFromQueue(kind: QueueKind, id: number, toCode: string, byCode = '', at = ''): TakeResult {
  if (!queueEmployees().some((e) => e.code === toCode)) return 'invalid';
  if (!isReceiver(kind, toCode)) return 'notReceiver';
  // ผู้รับโอกาสขายต้องเป็นสมาชิกกลุ่มกิจกรรมของใบ (422) — เช็กก่อนว่ายังรออยู่ไหม
  if (!isGroupMember(kind, id, toCode)) return 'notMember';
  const entry = waitlistOf()[STATE_KEY[kind]][String(id)];
  if (!dequeue(STATE_KEY[kind], id)) return 'taken';
  setOwner(kind, id, toCode);
  note(kind, id, { action: byCode && byCode !== toCode ? 'give' : 'take', at, byCode, fromCode: '', toCode, reason: entry?.reason ?? '' });
  return 'ok';
}

/** ส่งลูกค้าเข้าคิว (ตอนแปลง Lead แล้วเลือก "ส่งเข้า Wait List") — ใบเข้าคิวโดยไม่มีผู้ทำรายการ จดเป็น `queueIn` */
export function sendToQueue(kind: QueueKind, id: number, since: string, fromCode = '', reason = ''): void {
  enqueue(STATE_KEY[kind], id, { since, fromCode, reason });
  note(kind, id, { action: 'queueIn', at: `${since} 00:00`, byCode: '', fromCode, toCode: '', reason });
}

const keyOf = (kind: QueueKind, id: number): string => `${kind}:${id}`;
const note = (kind: QueueKind, id: number, entry: WaitHistoryEntry): void => appendWaitHistory(keyOf(kind, id), entry);

function setOwner(kind: QueueKind, id: number, code: string): void {
  if (kind === 'prospect') upsertSharedProspect(id, { ownerCode: code });
  else upsertSharedLead(id, { ownerCode: code });
}

/**
 * มอบให้ผู้รับผิดชอบตามที่ผู้ใช้เลือกจากรายการของหน้า (แผงข้างของลูกค้าเป้าหมาย / หน้าต่างปล่อยสถานะ) — ทำตามที่เลือกเสมอ ไม่ตรวจสิทธิ์ผู้รับ
 * (รายการนั้นให้เลือกจากพนักงานทั้งหมด) ; ออกจากคิวถ้าใบรออยู่ ; ทุกหน้าเห็นเจ้าของใหม่ ; คนเดิม = ไม่เปลี่ยน.
 * FAST-DEBT(REQ): ไม่ตรวจว่าผู้รับมีสิทธิ์รับ (หน้ารายละเอียดตรวจ — เทียบกับ 422 ของ backend จริง) จนกว่าจะกำหนดว่ารายการเลือกต้องกรองตามสิทธิ์ · somyot · 2026-11-21
 */
export function setResponsible(kind: QueueKind, id: number, toCode: string, byCode: string, at: string): 'ok' | 'invalid' {
  if (!queueEmployees().some((e) => e.code === toCode)) return 'invalid';
  const queued = queueEntryOf(kind, id);
  const from = ownerOf(kind, id);
  if (queued) dequeue(STATE_KEY[kind], id);
  else if (from === toCode) return 'ok';
  setOwner(kind, id, toCode);
  note(kind, id, { action: queued ? (byCode && byCode !== toCode ? 'give' : 'take') : 'change', at, byCode, fromCode: queued ? '' : from, toCode, reason: queued?.reason ?? '' });
  return 'ok';
}

/* ================================================================================================ ใบที่มีเจ้าของ: เปลี่ยนคน / คืนเข้าคิว */

export const isInQueue = (kind: QueueKind, id: number): boolean => String(id) in waitlistOf()[STATE_KEY[kind]];

/** `{ since, fromCode, reason }` ของใบที่อยู่ในคิว (ไม่อยู่ในคิว = undefined) */
export const queueEntryOf = (kind: QueueKind, id: number): WaitEntry | undefined => waitlistOf()[STATE_KEY[kind]][String(id)];

/**
 * ผู้รับผิดชอบตอนนี้ (รหัสพนักงาน `E10x`) ; ว่างเมื่อใบอยู่ในคิว.
 * FAST-DEBT(REQ): ลูกค้าเป้าหมายของ seed ไม่มีเจ้าของในข้อมูลตั้งต้น — ใช้เจ้าของจำลองจากรหัส (คงที่) จนกว่าจะมีข้อมูลจริง · somyot · 2026-11-20
 */
export function ownerOf(kind: QueueKind, id: number): string {
  if (isInQueue(kind, id)) return '';
  if (kind === 'opportunity') return seedLead(id).ownerCode;
  return seedProspect(id).ownerCode ?? SEED_EMPLOYEES[seedHash(id, 21) % SEED_EMPLOYEES.length].code;
}

/** หัวหน้าของเจ้าของ: หัวหน้าทีม (`role: 'Sup'`) ของทีมเดียวกัน ไม่ใช่ตัวเอง (ผังจำลอง) */
export function isHeadOf(headCode: string, ownerCode: string): boolean {
  const head = SEED_EMPLOYEES.find((e) => e.code === headCode);
  const owner = SEED_EMPLOYEES.find((e) => e.code === ownerCode);
  return !!head && !!owner && head.role === 'Sup' && head.team === owner.team && head.code !== owner.code;
}

/** โอกาสขายที่ปิดแล้ว (SUCCESS / LOST) เปลี่ยนมือหรือคืนคิวไม่ได้ (flow §5.7: ใบปิด = 409) */
const isClosed = (kind: QueueKind, id: number): boolean => kind === 'opportunity' && seedLead(id).status !== 'ACTIVE';

export type OwnerChangeResult = 'ok' | 'queued' | 'closed' | 'same' | 'invalid' | 'notMember' | 'notReceiver';

/** เปลี่ยนผู้รับผิดชอบ: ใบในคิว/ปิดแล้ว/คนเดิม/ไม่ใช่พนักงาน = ไม่เปลี่ยน ; เจ้าของเก่าหมดสิทธิ์ทันที */
export function reassign(kind: QueueKind, id: number, toCode: string, byCode: string, at: string, reason = ''): OwnerChangeResult {
  if (isInQueue(kind, id)) return 'queued';
  if (isClosed(kind, id)) return 'closed';
  if (!queueEmployees().some((e) => e.code === toCode)) return 'invalid';
  const from = ownerOf(kind, id);
  if (from === toCode) return 'same';
  // a seeded opportunity may have an owner outside its group (the seed picks owner and group apart); only a NEW owner has to be in it
  if (!isReceiver(kind, toCode)) return 'notReceiver';
  if (!isGroupMember(kind, id, toCode)) return 'notMember';
  setOwner(kind, id, toCode);
  note(kind, id, { action: 'change', at, byCode, fromCode: from, toCode, reason: reason.trim() });
  return 'ok';
}

/**
 * คืนเข้าคิว: ใบยังอยู่ครบ (Prospect เป็น RELEASE ต่อ · OPP ทำต่อตามเดิม) แต่ไม่มีผู้รับผิดชอบ และเจ้าของเดิมไม่เห็นอีก ;
 * เหตุผลไม่บังคับ (flow §4.7) ; ใบในคิวแล้ว/ปิดแล้ว = ไม่ทำ.
 */
export function returnToQueue(kind: QueueKind, id: number, byCode: string, at: string, reason = ''): OwnerChangeResult {
  if (isInQueue(kind, id)) return 'queued';
  if (isClosed(kind, id)) return 'closed';
  const from = ownerOf(kind, id);
  enqueue(STATE_KEY[kind], id, { since: at.slice(0, 10), fromCode: from, reason: reason.trim() });
  note(kind, id, { action: 'return', at, byCode, fromCode: from, toCode: '', reason: reason.trim() });
  return 'ok';
}

/** ประวัติการมอบหมายของใบ เรียงเก่าก่อน */
export const historyOf = (kind: QueueKind, id: number): readonly WaitHistoryEntry[] => waitHistoryOf(keyOf(kind, id));

/* ================================================================================================ แก้สมาชิกกลุ่มกิจกรรม */

export interface MembersChange {
  /** the employees taken out of the group */
  removed: string[];
  /** opportunities that went back to the queue because their owner was taken out (they had pulled them from it) */
  returned: number[];
}

/**
 * Sets who is in an activity group (Entity Configurator — `CONFIG_ALL`). Taking a member out while they still hold an opportunity they pulled from
 * the queue (the last line of its history is a take / give) sends that opportunity back to the queue of the group (OP-31 · TS-OPP-133);
 * an opportunity they hold any other way stays with them.
 */
export function updateGroupMembers(groupId: number, codes: readonly string[], byCode: string, at: string): MembersChange {
  const before = membersOf(groupId);
  const valid = queueEmployees().map((e) => e.code).filter((c) => codes.includes(c));
  setGroupMembers(groupId, valid);
  const removed = before.filter((c) => !valid.includes(c));
  const returned: number[] = [];
  if (removed.length === 0) return { removed, returned };
  for (const id of leadIds()) {
    if (groupIdOfOpportunity(id) !== groupId || isInQueue('opportunity', id) || isClosed('opportunity', id)) continue;
    const owner = ownerOf('opportunity', id);
    const last = historyOf('opportunity', id).at(-1);
    if (!removed.includes(owner) || !last || (last.action !== 'take' && last.action !== 'give')) continue;
    returnToQueue('opportunity', id, byCode, at, 'ถอนออกจากกลุ่มกิจกรรม');
    returned.push(id);
  }
  return { removed, returned };
}

