import { ChangeDetectionStrategy, Component } from '@angular/core';
import { SvList } from '../shared/sv-list';

/** ประเภทปฏิทิน — ตารางย่อยที่แสดงมาจาก ctx.table() (กรอบตั้งตามชิปในแถบขั้นตอน) */
@Component({
  selector: 'ts-sv-calendartype',
  imports: [SvList],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `<ts-sv-list />`,
})
export class CalendartypeStep {}
