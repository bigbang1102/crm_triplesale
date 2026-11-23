import { ChangeDetectionStrategy, Component } from '@angular/core';
import { SvList } from '../shared/sv-list';

/** ฟิลด์ข้อมูลส่วนบุคคล — เลือกชื่อฟิลด์จากรายการ ไม่พิมพ์เอง — ตารางย่อยที่แสดงมาจาก ctx.table() (กรอบตั้งตามชิปในแถบขั้นตอน) */
@Component({
  selector: 'ts-sv-dataattributeroleconfig',
  imports: [SvList],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `<ts-sv-list />`,
})
export class DataattributeroleconfigStep {}
