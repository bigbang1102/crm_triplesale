/**
 * ผังองค์กรจำลอง (เจ้าของ → หัวหน้า) ที่หน้า Lead และหน้าโอกาสขายใช้ร่วมกัน — ไม่ผูก framework (spec ใช้ใน Node ได้).
 * ใช้ตัดสินว่าใครเห็นของใคร: เห็นของตนและของลูกทีมทุกชั้น.
 */
import { reference } from './reference';

/**
 * รหัสพนักงานของบัญชีที่ล็อกอิน (`E10x`) → รหัสเจ้าของที่ใช้ในข้อมูล Lead (`CS000x`).
 * FAST-DEBT(REQ): ผังองค์กร/พนักงานจำลองในไฟล์นี้ (ข้อมูลจริงมาจาก employee/position ของ backend) · somyot · 2026-11-20
 */
const LEAD_OWNER_OF_EMPLOYEE: Readonly<Record<string, string>> = reference('leads.ownerOfEmployee', { E101: 'CS0001', E102: 'CS0002', E103: 'CS0003', E104: 'CS0004' });

/** ผังองค์กรจำลอง: เจ้าของ → หัวหน้าโดยตรง (กราฟหลายแม่ได้ ใช้เดินขึ้นทุกชั้น) — CS0004 → CS0003 → CS0001 */
const LEAD_SUPERIORS: Readonly<Record<string, readonly string[]>> = reference('leads.superiors', { CS0002: ['CS0001'], CS0003: ['CS0001'], CS0004: ['CS0003'] });

/**
 * พนักงานที่ไม่มีใบ Lead แต่มีโอกาสขาย (E105–E108): เพิ่มต่อจากผังของ Lead เพื่อให้หน้าโอกาสขายกรองตามสายบังคับบัญชาได้ครบทั้งทีมจำลอง.
 * FAST-DEBT(REQ): ตั้งว่าทีม A (E105, E107) อยู่ใต้ E101 และทีม B (E106, E108) อยู่ใต้ E103 จนกว่าจะมีผังองค์กรจริงจาก backend · somyot · 2026-11-21
 */
const EXTRA_OWNER_OF_EMPLOYEE: Readonly<Record<string, string>> = { E105: 'CS0005', E106: 'CS0006', E107: 'CS0007', E108: 'CS0008' };
const EXTRA_SUPERIORS: Readonly<Record<string, readonly string[]>> = { CS0005: ['CS0001'], CS0006: ['CS0003'], CS0007: ['CS0001'], CS0008: ['CS0003'] };

const OWNER_OF_EMPLOYEE: Readonly<Record<string, string>> = { ...EXTRA_OWNER_OF_EMPLOYEE, ...LEAD_OWNER_OF_EMPLOYEE };
const SUPERIORS: Readonly<Record<string, readonly string[]>> = { ...EXTRA_SUPERIORS, ...LEAD_SUPERIORS };

export const ownerCodeOf = (employeeCode: string): string => OWNER_OF_EMPLOYEE[employeeCode] ?? '';

/** the reverse: the employee code (`E10x`) of an owner code of the Lead data — empty when the owner is not in the chart */
export const employeeCodeOfOwner = (ownerCode: string): string => Object.entries(OWNER_OF_EMPLOYEE).find(([, owner]) => owner === ownerCode)?.[0] ?? '';

/** `head` เป็นหัวหน้าทุกชั้นเหนือ `owner` หรือไม่ (ไม่นับตัวเอง · กันวนซ้ำด้วยชุดที่เดินแล้ว) */
export function isSuperiorOf(head: string, owner: string): boolean {
  const seen = new Set<string>([owner]);
  const queue = [owner];
  while (queue.length) {
    for (const up of SUPERIORS[queue.shift() as string] ?? []) {
      if (up === head) return true;
      if (!seen.has(up)) {
        seen.add(up);
        queue.push(up);
      }
    }
  }
  return false;
}

/** ผู้ใช้ที่กำลังดูรายการโอกาสขาย: รหัสพนักงานของตน (`E10x`) + เห็นทั้งบริษัทหรือไม่ (`*` / VIEW_ALL / MASTER_EDIT_ALL / TRANSACTION_EDIT_ALL) */
export interface OpportunityViewer {
  readonly employeeCode: string;
  readonly seesAll: boolean;
}

/** รหัสพนักงาน `E10x` ของ employee id ของ session (`1001` → `E101`) */
export const employeeCodeOfId = (employeeId: number): string => `E${100 + (employeeId - 1000)}`;

/**
 * ผู้ใช้เห็นโอกาสขายของเจ้าของคนนี้ไหม (`ownerEmployeeCode` = null → ยังไม่มีเจ้าของ):
 *  - เห็นทั้งบริษัท → เห็นทุกใบ
 *  - ใบที่ยังไม่มอบหมาย → เห็น (หัวหน้าต้องเห็นเพื่อมอบหมาย)
 *  - เจ้าของคือตนเอง หรือตนเป็นหัวหน้าทุกชั้นของเจ้าของ → เห็น
 *  - ผู้ใช้ที่ไม่อยู่ในผังองค์กร (เช่น ผู้ชม) → เห็นทุกใบ เพราะไม่รู้สายบังคับบัญชา
 */
export function canSeeOpportunity(viewer: OpportunityViewer, ownerEmployeeCode: string | null): boolean {
  if (viewer.seesAll || ownerEmployeeCode === null) return true;
  const mine = ownerCodeOf(viewer.employeeCode);
  if (mine === '') return true;
  return ownerEmployeeCode === viewer.employeeCode || isSuperiorOf(mine, ownerCodeOf(ownerEmployeeCode));
}
