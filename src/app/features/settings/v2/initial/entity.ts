import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { SvContext } from '../shared/sv-context';
import { SvList } from '../shared/sv-list';
import { SvLetterhead } from './letterhead';

/**
 * นิติบุคคล — สกุลเงินและที่อยู่ของนิติบุคคลกรอกทีหลังได้ — ตารางย่อยที่แสดงมาจาก ctx.table() (กรอบตั้งตามชิปในแถบขั้นตอน) ;
 * ชิป "นิติบุคคล" มีหัวกระดาษบริษัท (ชื่อ ที่อยู่ โลโก้ ของหัวเอกสาร Smart Doc) ของนิติบุคคลที่เลือกใน "ใช้กับ" อยู่เหนือรายการ
 */
@Component({
  selector: 'ts-sv-entity',
  imports: [SvList, SvLetterhead],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @if (ctx.table() === 'businessentity' && ctx.entity()) {
      <ts-sv-letterhead />
    }
    <ts-sv-list />
  `,
})
export class EntityStep {
  protected readonly ctx = inject(SvContext);
}
