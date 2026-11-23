import { ChangeDetectionStrategy, Component } from '@angular/core';
import { SvList } from '../shared/sv-list';

/** ขั้นตอนการขาย — กลุ่มขั้นตอน → ขั้นตอน · ค่าเงื่อนไขพิเศษของกลุ่มขั้นตอนอ้างถึงขั้นตอน ปล่อยว่างไว้ก่อนแล้วกลับมาเติม — ตารางย่อยที่แสดงมาจาก ctx.table() (กรอบตั้งตามชิปในแถบขั้นตอน) */
@Component({
  selector: 'ts-sv-flow',
  imports: [SvList],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `<ts-sv-list />`,
})
export class FlowStep {}
