import { Injectable, inject, signal } from '@angular/core';
import { SettingsStore } from '../../settings.store';

/**
 * สถานะที่กรอบ (sv-frame) กับหน้าของแต่ละแท็บใช้ร่วมกัน (ข้อมูลทั้งหมดมาจาก DB ผ่าน SettingsStore — ไม่มีข้อมูลจำลอง)
 *  - entity  นิติบุคคลที่เลือก (ตัวเดียวกับหน้าหลัก)
 *  - table   ตารางย่อยที่เลือกในแท็บ (ชิปในแถบขั้นตอน) — กรอบเป็นคนตั้ง หน้าแท็บอ่านอย่างเดียว
 *  - goStep  ไปที่ขั้นอื่น (กรอบเป็นคนผูก) — ใช้ตอนฟอร์มสร้างไม่ได้เพราะขั้นก่อนหน้ายังไม่เสร็จ
 */
@Injectable({ providedIn: 'root' })
export class SvContext {
  readonly store = inject(SettingsStore);
  readonly entity = this.store.entity;
  readonly table = signal('');
  /** ชื่อขั้นตอนที่เลือก (breadcrumb ของหน้าฟอร์ม) — กรอบเป็นคนตั้ง */
  readonly stepTitle = signal('');
  goStep: (stepKey: string) => void = () => undefined;
}
