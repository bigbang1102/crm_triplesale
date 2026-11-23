import { ChangeDetectionStrategy, Component, ViewEncapsulation, inject, input, output, signal } from '@angular/core';
import { I18n } from '@core/i18n/i18n.service';
import { LeadDialogFrame } from './lead-dialog-frame';

/**
 * หน้าต่าง "แจกให้…" ของคิวลูกค้าเป้าหมาย / โอกาสขาย: เลือกผู้รับแล้วยืนยัน (รายการผู้รับส่งมาจากหน้า = ผ่านชุดสิทธิ์ขั้นต่ำของผู้รับ + เป็นสมาชิกกลุ่มกิจกรรมของใบ).
 * ของ Lead ใช้ `lead-assign-dialog` ที่ผูกกับ store ของ Lead.
 */
@Component({
  selector: 'ts-waitlist-give-dialog',
  imports: [LeadDialogFrame],
  changeDetection: ChangeDetectionStrategy.OnPush,
  encapsulation: ViewEncapsulation.None,
  template: `
    <ts-lead-dialog-frame [title]="t('app.leads.giveTitle')" [width]="520" (closed)="closed.emit()">
      <p class="ld-contact-who">{{ name() }}</p>
      <div class="ld-field ld-field-col">
        <label for="ld-give-owner">{{ t('app.leads.newOwner') }}</label>
        <select id="ld-give-owner" class="ld-input" [value]="owner()" (change)="onOwner($event)">
          @for (o of owners(); track o.code) {
            <option [value]="o.code">{{ o.code }} {{ o.name }}</option>
          }
        </select>
        @if (!owners().length) {
          <p class="ld-hint">{{ t('app.leads.noReceiver') }}</p>
        }
      </div>
      <ng-container foot>
        <button type="button" class="ld-btn" (click)="closed.emit()">{{ t('app.common.cancel') }}</button>
        <button type="button" class="ld-btn ld-btn-primary" [disabled]="!owner()" (click)="chosen.emit(owner())">{{ t('app.leads.give') }}</button>
      </ng-container>
    </ts-lead-dialog-frame>
  `,
})
export class WaitlistGiveDialog {
  protected readonly t = inject(I18n).t;
  readonly name = input.required<string>();
  readonly owners = input.required<readonly { code: string; name: string }[]>();
  readonly chosen = output<string>();
  readonly closed = output();

  protected readonly owner = signal('');

  constructor() {
    queueMicrotask(() => this.owner.set(this.owners()[0]?.code ?? ''));
  }

  protected onOwner(e: Event): void {
    this.owner.set((e.target as HTMLSelectElement).value);
  }
}
