import { ChangeDetectionStrategy, Component } from '@angular/core';
import { SvList } from '../shared/sv-list';

/** ทีมขาย — กลุ่มการขาย → พนักงานขาย — ตารางย่อยที่แสดงมาจาก ctx.table() (กรอบตั้งตามชิปในแถบขั้นตอน) */
@Component({
  selector: 'ts-sv-salesteam',
  imports: [SvList],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `<ts-sv-list />`,
})
export class SalesteamStep {}
