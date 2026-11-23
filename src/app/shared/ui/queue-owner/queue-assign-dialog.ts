import { ChangeDetectionStrategy, Component, ElementRef, afterNextRender, inject, input, output, signal } from '@angular/core';
import { I18n } from '@core/i18n/i18n.service';
import { queueEmployees } from '@core/mock/waitlist';

let seq = 0;

/**
 * "เปลี่ยนผู้รับผิดชอบ" / "คืนเข้าคิว" ของลูกค้าเป้าหมายและโอกาสขาย: เลือกผู้รับ (เปลี่ยนคน) + เหตุผล (ไม่บังคับ ตาม flow §4.7) แล้วยืนยัน.
 * ปิดด้วยปุ่ม ยกเลิก / ✕ / Esc. ใช้สี token กลาง `--ts-*` (อยู่ได้ทั้งหน้าที่เขียนเอง และหน้าที่สร้างจาก Java).
 */
@Component({
  selector: 'ts-queue-assign-dialog',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { '(document:keydown.escape)': 'closed.emit()' },
  template: `
    <div class="qd-overlay">
      <div class="qd" role="dialog" aria-modal="true" [attr.aria-labelledby]="titleId">
        <header class="qd-head">
          <h2 [id]="titleId">{{ t(mode() === 'change' ? 'app.queue.changeTitle' : 'app.queue.returnTitle') }}</h2>
          <button type="button" class="qd-x" [attr.aria-label]="t('app.common.close')" (click)="closed.emit()">✕</button>
        </header>
        <p class="qd-name">{{ name() }}</p>
        @if (mode() === 'change') {
          <label class="qd-label" [for]="ownerId">{{ t('app.leads.newOwner') }}</label>
          <select class="qd-input" [id]="ownerId" [value]="owner()" (change)="onOwner($event)">
            @for (o of choices(); track o.code) {
              <option [value]="o.code">{{ o.code }} {{ o.name }}</option>
            }
          </select>
          @if (!choices().length) {
            <p class="qd-hint">{{ t('app.leads.noReceiver') }}</p>
          }
        } @else {
          <p class="qd-hint">{{ t('app.queue.returnHint') }}</p>
        }
        <label class="qd-label" [for]="reasonId">{{ t('app.leads.reason') }} ({{ t('app.leads.optional') }})</label>
        <textarea class="qd-input" [id]="reasonId" rows="3" maxlength="500" [value]="reason()" (input)="onReason($event)"></textarea>
        <footer class="qd-foot">
          <button type="button" class="qd-btn" (click)="closed.emit()">{{ t('app.common.cancel') }}</button>
          <button type="button" class="qd-btn qd-primary" [disabled]="mode() === 'change' && !owner()" (click)="confirmed.emit({ owner: owner(), reason: reason() })">
            {{ t(mode() === 'change' ? 'app.leads.changeOwnerOk' : 'app.leads.returnToQueue') }}
          </button>
        </footer>
      </div>
    </div>
  `,
  styles: `
    .qd-overlay { position: fixed; inset: 0; z-index: var(--ts-z-dialog, 3000); display: grid; place-items: center; padding: 16px; background: var(--ts-overlay, rgba(20, 18, 40, 0.38)); }
    .qd { box-sizing: border-box; display: flex; flex-direction: column; gap: 8px; width: min(480px, 100%); padding: 18px 22px; border-radius: 12px; background: var(--ts-surface, #fff); color: var(--ts-text, #383838); box-shadow: 0 18px 40px rgba(25, 18, 70, 0.18); font-size: 14px; line-height: 1.45; }
    .qd-head { display: flex; align-items: center; justify-content: space-between; }
    .qd-head h2 { margin: 0; font-size: 18px; }
    .qd-x { border: 0; background: transparent; color: inherit; font-size: 18px; cursor: pointer; }
    .qd-name { margin: 0; font-weight: 700; }
    .qd-hint { margin: 0; color: var(--ts-text-secondary, #7c848d); }
    .qd-label { color: var(--ts-text-secondary, #7c848d); }
    .qd-input { box-sizing: border-box; width: 100%; padding: 8px 12px; border: 1px solid var(--ts-border, #d1d5db); border-radius: 8px; background: var(--ts-input-bg, #fff); color: inherit; font: inherit; }
    .qd-foot { display: flex; justify-content: flex-end; gap: 10px; margin-top: 8px; }
    .qd-btn { min-height: 38px; padding: 0 16px; border: 1px solid var(--ts-border, #d1d5db); border-radius: 8px; background: var(--ts-surface, #fff); color: inherit; font: inherit; font-weight: 600; cursor: pointer; }
    .qd-btn:disabled { opacity: 0.5; cursor: not-allowed; }
    .qd-primary { border-color: var(--ts-selected-bar, #35236a); background: var(--ts-selected-bar, #35236a); color: #fff; }
  `,
})
export class QueueAssignDialog {
  protected readonly t = inject(I18n).t;
  readonly mode = input.required<'change' | 'return'>();
  readonly name = input.required<string>();
  /** the current owner: not offered again */
  readonly currentOwner = input('');
  /** who may be chosen (null = every employee): the members of the activity group for an opportunity */
  readonly owners = input<readonly { code: string; name: string }[] | null>(null);
  readonly confirmed = output<{ owner: string; reason: string }>();
  readonly closed = output();

  protected readonly titleId = `qd-title-${++seq}`;
  protected readonly ownerId = `qd-owner-${seq}`;
  protected readonly reasonId = `qd-reason-${seq}`;
  protected readonly owner = signal('');
  protected readonly reason = signal('');
  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef);

  protected choices(): readonly { code: string; name: string }[] {
    return (this.owners() ?? queueEmployees()).filter((e) => e.code !== this.currentOwner());
  }

  constructor() {
    afterNextRender(() => {
      this.owner.set(this.choices()[0]?.code ?? '');
      this.host.nativeElement.querySelector<HTMLElement>('select, textarea')?.focus();
    });
  }

  protected onOwner(e: Event): void {
    this.owner.set((e.target as HTMLSelectElement).value);
  }

  protected onReason(e: Event): void {
    this.reason.set((e.target as HTMLTextAreaElement).value);
  }
}
