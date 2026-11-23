import { ChangeDetectionStrategy, Component } from '@angular/core';
import { SvList } from '../shared/sv-list';

/** คู่ค้า — ตารางย่อยที่แสดงมาจาก ctx.table() (กรอบตั้งตามชิปในแถบขั้นตอน) */
@Component({
  selector: 'ts-sv-partner',
  imports: [SvList],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `<ts-sv-list />`,
})
export class PartnerStep {}
