import { ChangeDetectionStrategy, Component, ViewEncapsulation, computed, inject, signal } from '@angular/core';
import { TsIcon } from '@shared/ui/icon/icon';
import { LeadDialogFrame } from './lead-dialog-frame';
import { formatPhone } from './leads.format';
import { LeadsStore } from './leads.store';

/**
 * หน้าต่าง "มอบหมาย": แจกใบในคิวให้คนอื่น (`give`) หรือเปลี่ยนผู้รับผิดชอบของใบที่มีเจ้าของ (`change`) — เลือกผู้รับ + เหตุผล (ไม่บังคับ).
 * ผู้รับเลือกได้เฉพาะคนที่ผ่านชุดสิทธิ์ขั้นต่ำของผู้รับ (View + Edit ของ Lead จาก Role ของตำแหน่ง — BR-LDP-16 · ตั้งค่า › Role สิทธิ์).
 * FAST-DEBT(REQ): สมาชิกกองเดียวกันของ Lead ยังไม่กำหนด — ถือว่าทุกคนที่ผ่านชุดสิทธิ์รับได้ · somyot · 2026-11-20
 */
@Component({
  selector: 'ts-lead-assign-dialog',
  imports: [LeadDialogFrame, TsIcon],
  changeDetection: ChangeDetectionStrategy.OnPush,
  encapsulation: ViewEncapsulation.None,
  template: `
    @if (lead(); as l) {
      <ts-lead-dialog-frame [title]="t(mode === 'give' ? 'app.leads.giveTitle' : 'app.leads.changeOwnerTitle')" [width]="560" (closed)="store.open(null)">
        <div class="ld-who">
          <span class="ld-avatar ld-avatar-lg"><ts-icon name="user" [size]="24" /></span>
          <div>
            <div class="ld-who-name">{{ l.name }}</div>
            <div class="ld-who-phone"><span class="ld-ico"><ts-icon name="phone" [size]="14" /></span>{{ phone(l.phoneCode, l.phone) }}</div>
          </div>
          <span class="ld-tag ld-who-tag" [attr.data-status]="l.status">{{ store.statusLabel(l.status) }}</span>
        </div>
        <div class="ld-field ld-field-col">
          <label for="ld-as-owner">{{ t('app.leads.newOwner') }}</label>
          <select id="ld-as-owner" class="ld-input" [value]="owner()" (change)="onOwner($event)">
            @for (o of choices(); track o.code) {
              <option [value]="o.code">{{ o.code }} {{ o.name }}</option>
            }
          </select>
          @if (!choices().length) {
            <p class="ld-hint">{{ t('app.leads.noReceiver') }}</p>
          }
        </div>
        <div class="ld-field ld-field-col">
          <label for="ld-as-reason">{{ t('app.leads.reason') }} ({{ t('app.leads.optional') }})</label>
          <textarea id="ld-as-reason" class="ld-input ld-textarea" rows="3" maxlength="500" [value]="reason()" (input)="onReason($event)"></textarea>
        </div>
        <ng-container foot>
          <button type="button" class="ld-btn" (click)="store.open(null)">{{ t('app.common.cancel') }}</button>
          <button type="button" class="ld-btn ld-btn-primary" [disabled]="!owner()" (click)="submit()">{{ t(mode === 'give' ? 'app.leads.give' : 'app.leads.changeOwnerOk') }}</button>
        </ng-container>
      </ts-lead-dialog-frame>
    }
  `,
})
export class LeadAssignDialog {
  protected readonly store = inject(LeadsStore);
  protected readonly t = this.store.t;
  protected readonly phone = formatPhone;

  private readonly dialog = this.store.dialog();
  protected readonly mode = this.dialog?.kind === 'assign' ? this.dialog.mode : 'give';
  private readonly leadId = this.dialog?.kind === 'assign' ? this.dialog.leadId : null;
  protected readonly lead = computed(() => (this.leadId === null ? undefined : this.store.leadOf(this.leadId)));

  /** ผู้รับที่เลือกได้ (เปลี่ยนเจ้าของ: ไม่รวมเจ้าของคนเดิม) */
  protected readonly choices = computed(() => this.store.receivers().filter((o) => o.code !== this.lead()?.ownerCode));
  protected readonly owner = signal(this.choices()[0]?.code ?? '');
  protected readonly reason = signal('');

  protected onOwner(e: Event): void {
    this.owner.set((e.target as HTMLSelectElement).value);
  }

  protected onReason(e: Event): void {
    this.reason.set((e.target as HTMLTextAreaElement).value);
  }

  protected submit(): void {
    if (this.leadId !== null && this.owner()) this.store.assignTo(this.leadId, this.mode, this.owner(), this.reason());
  }
}
