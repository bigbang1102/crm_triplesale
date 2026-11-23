import { ChangeDetectionStrategy, Component, DestroyRef, ViewEncapsulation, computed, inject } from '@angular/core';
import { takeUntilDestroyed, toSignal } from '@angular/core/rxjs-interop';
import { NonNullableFormBuilder, ReactiveFormsModule } from '@angular/forms';
import { TsIcon } from '@shared/ui/icon/icon';
import { LeadDialogFrame } from './lead-dialog-frame';
import { formatPhone } from './leads.format';
import { LeadsStore } from './leads.store';
import { SALES_LINES, SALES_TEAMS } from './leads.types';

/**
 * หน้าต่าง "สร้างโอกาสขาย" (จากปุ่มในแผงรายละเอียด) และ "บันทึกลูกค้าเป้าหมาย" (หลังยืนยัน) — เลือกสายงาน / ทีมขาย / พนักงานขาย / ผู้รับผิดชอบ
 * แล้ว Lead ถูกย้ายไปเป็นลูกค้าเป้าหมาย (และเปิดโอกาสขายให้เมื่อเป็นโหมด opportunity).
 */
@Component({
  selector: 'ts-lead-convert-dialog',
  imports: [ReactiveFormsModule, LeadDialogFrame, TsIcon],
  changeDetection: ChangeDetectionStrategy.OnPush,
  encapsulation: ViewEncapsulation.None,
  template: `
    @if (lead(); as l) {
      <ts-lead-dialog-frame [title]="t(mode === 'opportunity' ? 'app.leads.convert.opportunityTitle' : 'app.leads.convert.prospectTitle')" [width]="580" (closed)="store.open(null)">
        <div class="ld-who">
          <span class="ld-avatar ld-avatar-lg"><ts-icon name="user" [size]="24" /></span>
          <div>
            <div class="ld-who-name">{{ l.name }}</div>
            <div class="ld-who-phone"><span class="ld-ico"><ts-icon name="phone" [size]="14" /></span>{{ phone(l.phoneCode, l.phone) }}</div>
          </div>
          <span class="ld-tag ld-who-tag" [attr.data-status]="l.status">{{ store.statusLabel(l.status) }}</span>
        </div>
        <form id="ld-convert" class="ld-grid ld-grid-stack" [formGroup]="form" (ngSubmit)="confirm()">
          <div class="ld-field ld-field-col">
            <label for="ld-cv-line">{{ t('app.leads.convert.line') }}</label>
            <select id="ld-cv-line" class="ld-input" formControlName="salesLine">
              @for (s of lines; track s) { <option [value]="s">{{ s }}</option> }
            </select>
          </div>
          <div class="ld-field ld-field-col">
            <label for="ld-cv-team">{{ t('app.leads.convert.team') }}</label>
            <select id="ld-cv-team" class="ld-input" formControlName="team">
              @for (s of teams(); track s) { <option [value]="s">{{ s }}</option> }
            </select>
          </div>
          <div class="ld-field ld-field-col">
            <label for="ld-cv-person">{{ t('app.leads.convert.person') }}</label>
            <select id="ld-cv-person" class="ld-input" formControlName="salesPerson">
              @for (o of store.owners; track o.code) { <option [value]="o.code">{{ o.code }} {{ o.name }}</option> }
            </select>
          </div>
          <div class="ld-field ld-field-col">
            <label for="ld-cv-owner">{{ t('app.leads.convert.owner') }}</label>
            <select id="ld-cv-owner" class="ld-input" formControlName="ownerCode">
              @if (mode === 'prospect') { <option value="">{{ t('app.leads.convert.toWaitlist') }}</option> }
              @for (o of store.receivers(mode); track o.code) { <option [value]="o.code">{{ o.code }} {{ o.name }}</option> }
            </select>
          </div>
        </form>
        <ng-container foot>
          <button type="button" class="ld-btn" (click)="store.open(null)">{{ t('app.common.cancel') }}</button>
          <button type="submit" form="ld-convert" class="ld-btn ld-btn-primary">{{ t(mode === 'opportunity' ? 'app.leads.convert.confirmOpportunity' : 'app.leads.convert.confirmProspect') }}</button>
        </ng-container>
      </ts-lead-dialog-frame>
    }
  `,
})
export class LeadConvertDialog {
  protected readonly store = inject(LeadsStore);
  protected readonly t = this.store.t;
  protected readonly lines = SALES_LINES;
  protected readonly phone = formatPhone;

  private readonly dialog = this.store.dialog();
  protected readonly mode = this.dialog?.kind === 'convert' ? this.dialog.mode : 'prospect';
  protected readonly lead = computed(() => (this.dialog?.kind === 'convert' ? this.store.leadOf(this.dialog.leadId) : undefined));

  private readonly fb = inject(NonNullableFormBuilder);
  protected readonly form = this.fb.group({
    salesLine: [SALES_LINES[0] as string],
    team: [SALES_TEAMS[SALES_LINES[0]][0]],
    salesPerson: [this.lead()?.ownerCode ?? this.store.defaultOwner()],
    // the owner of the new document must be able to receive that kind of document (the Lead's owner may not be)
    ownerCode: [this.store.receivers(this.mode).some((o) => o.code === this.lead()?.ownerCode) ? (this.lead()?.ownerCode ?? '') : this.store.defaultReceiver(this.mode)],
  });

  private readonly line = toSignal(this.form.controls.salesLine.valueChanges, { initialValue: this.form.controls.salesLine.value });
  /** ทีมขายของสายงานที่เลือก */
  protected readonly teams = computed(() => SALES_TEAMS[this.line()] ?? []);

  constructor() {
    // เปลี่ยนสายงานแล้วทีมเดิมอาจไม่อยู่ในสายงานนั้น → ตั้งเป็นทีมแรกของสายงานใหม่
    this.form.controls.salesLine.valueChanges.pipe(takeUntilDestroyed(inject(DestroyRef))).subscribe((line) => {
      this.form.controls.team.setValue((SALES_TEAMS[line] ?? [])[0] ?? '');
    });
  }

  /** when the action was last done: a second click that comes before the dialog is gone (a double click) must not do it again */
  private lastDoneAt = 0;
  private readonly justDone = (): boolean => Date.now() - this.lastDoneAt < 1000;

  protected confirm(): void {
    const l = this.lead();
    if (!l || this.justDone()) return;
    this.lastDoneAt = Date.now();
    this.store.convert(l.id, this.mode, this.form.getRawValue());
  }
}
