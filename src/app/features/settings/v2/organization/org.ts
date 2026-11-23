import { ChangeDetectionStrategy, Component } from '@angular/core';
import { SvList } from '../shared/sv-list';

/** โครงสร้างองค์กร — หน่วยงาน → แผนก → ตำแหน่งงาน · สร้างตำแหน่งให้ครบทุกตำแหน่ง (P01–P16) ก่อน แล้วกลับมาใส่ผู้บังคับบัญชาและอัตรากำลังของแผนก — ตารางย่อยที่แสดงมาจาก ctx.table() (กรอบตั้งตามชิปในแถบขั้นตอน) */
@Component({
  selector: 'ts-sv-org',
  imports: [SvList],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `<ts-sv-list />`,
})
export class OrgStep {}
