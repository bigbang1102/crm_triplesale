import { ChangeDetectionStrategy, Component } from '@angular/core';
import { SvList } from '../shared/sv-list';

/** ประเภทลูกค้าและคู่ค้า — ประเภทร้านค้า → ประเภทลูกค้า — ตารางย่อยที่แสดงมาจาก ctx.table() (กรอบตั้งตามชิปในแถบขั้นตอน) */
@Component({
  selector: 'ts-sv-typeset',
  imports: [SvList],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `<ts-sv-list />`,
})
export class TypesetStep {}
