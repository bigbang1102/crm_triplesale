import { ChangeDetectionStrategy, Component, ViewEncapsulation, computed, inject, signal } from '@angular/core';
import { NonNullableFormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { TsIcon } from '@shared/ui/icon/icon';
import { LeadDialogFrame } from './lead-dialog-frame';
import { LeadsStore, nowThai } from './leads.store';

const DEFAULT_TIME = '09:30';

/** สถานะที่เลือกได้ของนัดหมาย / งาน (เก็บเป็นข้อความที่แปลแล้ว เหมือนข้อมูลตั้งต้น) */
const STATUS_KEYS = {
  appointment: ['app.leads.item.statusPlanned', 'app.leads.item.statusDone', 'app.leads.item.statusCancelled'],
  task: ['app.leads.item.statusPending', 'app.leads.item.statusDoing', 'app.leads.item.statusDone'],
} as const;

/** หน้าต่าง "เพิ่มนัดหมาย" / "เพิ่มงาน" ของ Lead (หน้าต่างเดียว สองโหมดตาม `dialog.itemKind`) */
@Component({
  selector: 'ts-lead-item-dialog',
  imports: [ReactiveFormsModule, LeadDialogFrame, TsIcon],
  changeDetection: ChangeDetectionStrategy.OnPush,
  encapsulation: ViewEncapsulation.None,
  template: `
    @if (lead(); as l) {
      <ts-lead-dialog-frame [title]="t(kind === 'appointment' ? 'app.leads.item.addAppointment' : 'app.leads.item.addTask')" [width]="720" (closed)="store.open(null)">
        <form id="ld-item" class="ld-form" [formGroup]="form" (ngSubmit)="submit()" novalidate>
          <div class="ld-item-who">
            <span class="ld-label">{{ t('app.leads.leadName') }}</span>
            <span>{{ l.name }}</span>
            <span class="ld-owner"><span class="ld-avatar"><ts-icon name="user" [size]="14" /></span>{{ store.ownerName(l.ownerCode) }}</span>
          </div>
          <div class="ld-item-when">
            <label class="ld-label" for="ld-item-date">{{ t('app.leads.item.date') }}</label>
            <input id="ld-item-date" class="ld-input" type="date" formControlName="date" aria-required="true" [attr.aria-invalid]="submitted() && form.controls.date.invalid" />
            <label class="ld-label" for="ld-item-time">{{ t('app.leads.item.time') }}</label>
            <input id="ld-item-time" class="ld-input" type="time" formControlName="time" />
            <label class="ld-check"><input type="checkbox" formControlName="allDay" />{{ t('app.leads.allDay') }}</label>
          </div>
          <div class="ld-field">
            <label for="ld-item-title">{{ t('app.leads.item.subject') }}</label>
            <div>
              <input id="ld-item-title" class="ld-input" formControlName="title" maxlength="120" aria-required="true" [attr.aria-invalid]="submitted() && form.controls.title.invalid" />
              @if (submitted() && form.controls.title.invalid) { <span class="ld-err" role="alert">{{ t('app.leads.item.errSubject') }}</span> }
            </div>
          </div>
          <div class="ld-field">
            <label for="ld-item-detail">{{ t('app.leads.item.detail') }}</label>
            <textarea id="ld-item-detail" class="ld-input ld-textarea" rows="4" maxlength="1000" formControlName="detail"></textarea>
          </div>
          <div class="ld-item-foot">
            <label class="ld-label" for="ld-item-status">{{ t('app.leads.item.status') }}:</label>
            <select id="ld-item-status" class="ld-input" formControlName="status">
              @for (s of statuses(); track s) { <option [value]="s">{{ s }}</option> }
            </select>
          </div>
        </form>
        <ng-container foot>
          <button type="button" class="ld-btn" (click)="store.open(null)">{{ t('app.common.cancel') }}</button>
          <button type="submit" form="ld-item" class="ld-btn ld-btn-primary">{{ t(kind === 'appointment' ? 'app.leads.item.addAppointment' : 'app.leads.item.addTask') }}</button>
        </ng-container>
      </ts-lead-dialog-frame>
    }
  `,
})
export class LeadItemDialog {
  protected readonly store = inject(LeadsStore);
  protected readonly t = this.store.t;
  private readonly fb = inject(NonNullableFormBuilder);

  private readonly dialog = this.store.dialog();
  protected readonly kind = this.dialog?.kind === 'item' ? this.dialog.itemKind : 'appointment';
  protected readonly lead = computed(() => (this.dialog?.kind === 'item' ? this.store.leadOf(this.dialog.leadId) : undefined));
  protected readonly statuses = computed(() => STATUS_KEYS[this.kind].map((k) => this.t(k)));
  protected readonly submitted = signal(false);

  protected readonly form = this.fb.group({
    date: [nowThai().date, [Validators.required]],
    time: [DEFAULT_TIME],
    allDay: [false],
    title: [this.t(this.kind === 'appointment' ? 'app.leads.item.defaultAppointment' : 'app.leads.item.defaultTask'), [Validators.required, Validators.pattern(/\S/)]],
    detail: [''],
    status: [this.t(STATUS_KEYS[this.kind][0])],
  });

  /** when the action was last done: a second click that comes before the dialog is gone (a double click) must not do it again */
  private lastDoneAt = 0;
  private readonly justDone = (): boolean => Date.now() - this.lastDoneAt < 1000;

  protected submit(): void {
    this.submitted.set(true);
    const l = this.lead();
    if (!l || this.form.invalid || this.justDone()) return;
    this.lastDoneAt = Date.now();
    const v = this.form.getRawValue();
    this.store.addItem(l.id, {
      kind: this.kind,
      title: v.title.trim(),
      date: v.date,
      time: v.allDay ? '' : v.time,
      allDay: v.allDay,
      detail: v.detail.trim(),
      status: v.status,
    });
  }
}
