import { Injectable } from '@angular/core';
import { journaledSync } from '@core/mockup/mockup-journal';
import { LeadsMock } from './leads.mock';

/**
 * ที่มาของข้อมูลหน้า Lead. ตอนนี้เป็น mock อย่างเดียว (ยังไม่มี backend — ดู FAST-DEBT ใน leads.mock.ts); การเขียนทุกครั้งถูกเก็บลง
 * Datasource/journal.leads.json เมื่อเปิดเซิร์ฟเวอร์ไฟล์ของ mockup แล้วเล่นซ้ำตอนเปิดแอป. เมื่อมี API ให้เปลี่ยน provider ตรงนี้ที่เดียว.
 */
export type LeadsBackend = LeadsMock;

const WRITES = ['create', 'update', 'setStatus', 'remove', 'restore', 'assign', 'returnToQueue', 'importRows', 'convert', 'createOpportunity', 'addContact', 'addItem'] as const;

let shared: LeadsBackend | undefined;

/** mock ตัวเดียวทั้งเซสชัน (ข้อมูลอยู่จนกว่าจะโหลดหน้าใหม่ — และกลับมาจาก journal) */
export function sharedLeadsBackend(): LeadsBackend {
  return (shared ??= journaledSync('leads', { make: () => new LeadsMock(), writes: WRITES, context: () => ({ get: () => 0, set: () => undefined }) }));
}

/** ใช้ในเทสต์: เริ่มจากข้อมูลตั้งต้นใหม่ */
export function resetLeadsBackend(): void {
  shared = undefined;
}

@Injectable({ providedIn: 'root' })
export class LeadsBackendProvider {
  readonly backend: LeadsBackend = sharedLeadsBackend();
}
