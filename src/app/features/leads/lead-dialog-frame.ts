import { ChangeDetectionStrategy, Component, ElementRef, ViewEncapsulation, afterNextRender, inject, input, output } from '@angular/core';
import { I18n } from '@core/i18n/i18n.service';
import { TsIcon } from '@shared/ui/icon/icon';

let frameSeq = 0;

/** ช่องที่ได้โฟกัสเมื่อหน้าต่างเปิด (ช่องกรอกแรกที่ไม่ใช่ checkbox) */
const FIRST_FIELD = 'input:not([type="checkbox"]):not([type="file"]):not([readonly]),textarea,select';

/**
 * กรอบหน้าต่างของหน้า Lead (พื้นมืด + กล่องขาว + หัวเรื่อง/ปุ่มปิด + ส่วนท้าย) — เนื้อหาใส่ใน `<ts-lead-dialog-frame>`,
 * ส่วนหัวเพิ่มเติมใช้ `[head]`, ปุ่มท้ายหน้าต่างใช้ `[foot]`. ปิดด้วยปุ่ม ✕ หรือ Esc เท่านั้น (ไม่ปิดเมื่อคลิกพื้นหลัง กันข้อมูลที่กรอกหาย).
 */
@Component({
  selector: 'ts-lead-dialog-frame',
  imports: [TsIcon],
  changeDetection: ChangeDetectionStrategy.OnPush,
  encapsulation: ViewEncapsulation.None,
  template: `
    <div class="ld-overlay">
      <div class="ld-modal" role="dialog" aria-modal="true" [attr.aria-labelledby]="titleId" [style.max-width.px]="width()">
        <header class="ld-modal-head">
          <h2 [id]="titleId">{{ title() }}</h2>
          <ng-content select="[head]" />
          <button type="button" class="ld-icon-btn" [attr.aria-label]="t('app.common.close')" (click)="closed.emit()"><ts-icon name="x" [size]="22" /></button>
        </header>
        <div class="ld-modal-body"><ng-content /></div>
        <footer class="ld-modal-foot"><ng-content select="[foot]" /></footer>
      </div>
    </div>
  `,
})
export class LeadDialogFrame {
  readonly title = input.required<string>();
  readonly width = input(640);
  readonly closed = output();

  protected readonly t = inject(I18n).t;
  protected readonly titleId = `ld-dialog-title-${++frameSeq}`;
  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef);

  constructor() {
    afterNextRender(() => this.host.nativeElement.querySelector<HTMLElement>(FIRST_FIELD)?.focus());
  }
}
