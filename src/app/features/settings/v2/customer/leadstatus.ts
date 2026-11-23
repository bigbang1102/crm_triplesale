import { ChangeDetectionStrategy, Component } from '@angular/core';
import { SvList } from '../shared/sv-list';

/** สถานะ Lead — ต้องมีอย่างน้อย 1 สถานะที่ convert เป็น Prospect ได้ — ตารางย่อยที่แสดงมาจาก ctx.table() (กรอบตั้งตามชิปในแถบขั้นตอน) */
@Component({
  selector: 'ts-sv-leadstatus',
  imports: [SvList],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `<ts-sv-list />`,
})
export class LeadstatusStep {}
