import { ChangeDetectionStrategy, Component } from '@angular/core';
import { SvList } from '../shared/sv-list';

/** สิทธิ์เริ่มต้น Lead / Prospect — ตั้งเป็นฟิลด์ของนิติบุคคล (default_permission_lead, default_permission_prospect, customer_pdpa, customer_critical, company_financial, company_strategic) ไม่ใช่รายการ; ฟอร์มยังไม่ทำ — จึงแสดงรายการนิติบุคคล (ตารางที่ฟิลด์เหล่านี้อยู่) ใต้ข้อความอธิบายของกรอบ */
@Component({
  selector: 'ts-sv-defperm',
  imports: [SvList],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `<ts-sv-list />`,
})
export class DefpermStep {}
