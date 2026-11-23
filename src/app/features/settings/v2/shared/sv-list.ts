import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { MasterList } from '../../list/master-list';
import { SvContext } from './sv-context';

/**
 * รายการของตารางที่กรอบเลือกไว้ (ชิปในแถบขั้นตอน) จาก DB — ที่เดียวกับหน้าหลัก (`ts-master-list`).
 * ตารางกับหัวคอลัมน์แสดงเสมอเมื่อมีตารางที่เลือก (คอลัมน์ไม่ต้องรอนิติบุคคล) ; แถวตามมาเมื่อมีนิติบุคคล.
 * แต่ละแท็บ (1 ไฟล์ในโฟลเดอร์ของหมวด) ใช้ตัวนี้เป็นค่าเริ่มต้น ; ถ้าแท็บไหนต้องการหน้าเฉพาะ ให้วางเนื้อหาของตัวเองแทนในไฟล์ของแท็บนั้น.
 */
@Component({
  selector: 'ts-sv-list',
  imports: [MasterList],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @if (ctx.table()) {
      <ts-master-list
        [table]="ctx.table()"
        [entityId]="ctx.entity()"
        [title]="ctx.store.tableTitle(ctx.table())"
        [stepTitle]="ctx.stepTitle()"
        (goStep)="ctx.goStep($event)"
      />
    }
  `,
})
export class SvList {
  protected readonly ctx = inject(SvContext);
}
