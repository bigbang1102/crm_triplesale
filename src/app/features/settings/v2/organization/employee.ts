import { ChangeDetectionStrategy, Component } from '@angular/core';
import { SvList } from '../shared/sv-list';

/** พนักงาน — พนักงานทุกคนต้องผูกระบบที่ใช้อย่างน้อย 1 ระบบ และมีตำแหน่งหลัก 1 ตำแหน่ง — ตารางย่อยที่แสดงมาจาก ctx.table() (กรอบตั้งตามชิปในแถบขั้นตอน) */
@Component({
  selector: 'ts-sv-employee',
  imports: [SvList],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `<ts-sv-list />`,
})
export class EmployeeStep {}
