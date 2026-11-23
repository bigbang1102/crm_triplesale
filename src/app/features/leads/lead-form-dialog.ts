import { ChangeDetectionStrategy, Component, ViewEncapsulation, inject, signal } from '@angular/core';
import { NonNullableFormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { TsIcon } from '@shared/ui/icon/icon';
import { LeadDialogFrame } from './lead-dialog-frame';
import { COUNTRIES, PHONE_CODES } from './leads.options';
import { LeadsStore } from './leads.store';
import { LEAD_SOURCES, type LeadForm } from './leads.types';

/** อักขระที่เบอร์โทรมีได้ (ตัวเลข เว้นวรรค ขีด) — ความยาวจริงตรวจจากจำนวนตัวเลข */
const PHONE_PATTERN = /^[\d\s-]+$/;
const MIN_PHONE_DIGITS = 9;
const MAX_PHONE_DIGITS = 15;
const TAX_ID_PATTERN = /^(\d{13})?$/;
const BLANK_PATTERN = /\S/;

/**
 * หน้าต่าง "เพิ่ม Lead ใหม่" / "แก้ไข Lead" (หนึ่งฟอร์ม — โหมดแก้ไขเมื่อ `dialog.leadId` ไม่ว่าง).
 * FAST-DEBT(REQ): จังหวัด / เขต / แขวง เป็นช่องพิมพ์เอง เพราะ Master ที่อยู่ยังไม่ต่อกับหน้านี้ (ดีไซน์เป็น dropdown) · somyot · 2026-11-20
 */
@Component({
  selector: 'ts-lead-form-dialog',
  imports: [ReactiveFormsModule, LeadDialogFrame, TsIcon],
  changeDetection: ChangeDetectionStrategy.OnPush,
  encapsulation: ViewEncapsulation.None,
  template: `
    <ts-lead-dialog-frame [title]="t(editing ? 'app.leads.editTitle' : 'app.leads.addTitle')" [width]="860" (closed)="store.open(null)">
      <form id="ld-form" class="ld-form" [formGroup]="form" (ngSubmit)="save()" novalidate>
        <h3 class="ld-form-sec">{{ t('app.leads.sectionGeneral') }}</h3>
        <div class="ld-grid">
          <div class="ld-field">
            <label for="ld-name">{{ t('app.leads.leadName') }} <span class="ld-req" aria-hidden="true">*</span></label>
            <div>
              <input id="ld-name" class="ld-input" formControlName="name" maxlength="120" [attr.aria-invalid]="invalid('name')" aria-required="true" />
              @if (invalid('name')) { <span class="ld-err" role="alert">{{ t('app.leads.errName') }}</span> }
            </div>
          </div>
          <div class="ld-field">
            <label for="ld-phone">{{ t('app.leads.col.phone') }} <span class="ld-req" aria-hidden="true">*</span></label>
            <div>
              <div class="ld-phone-in">
                <select class="ld-input" formControlName="phoneCode" [attr.aria-label]="t('app.leads.phoneCode')">
                  @for (c of phoneCodes; track c) { <option [value]="c">{{ c }}</option> }
                </select>
                <input id="ld-phone" class="ld-input" formControlName="phone" inputmode="tel" maxlength="20" [attr.aria-invalid]="invalid('phone')" aria-required="true" />
              </div>
              @if (invalid('phone')) { <span class="ld-err" role="alert">{{ t('app.leads.errPhone') }}</span> }
            </div>
          </div>
          <div class="ld-field">
            <label for="ld-email">{{ t('app.leads.email') }}</label>
            <div>
              <input id="ld-email" class="ld-input" type="email" formControlName="email" maxlength="120" [placeholder]="t('app.leads.emailPlaceholder')" [attr.aria-invalid]="invalid('email')" />
              @if (invalid('email')) { <span class="ld-err" role="alert">{{ t('app.leads.errEmail') }}</span> }
            </div>
          </div>
          <div class="ld-field">
            <label for="ld-source">{{ t('app.leads.source') }}</label>
            <select id="ld-source" class="ld-input" formControlName="source">
              @for (s of sources; track s) { <option [value]="s">{{ s }}</option> }
            </select>
          </div>
          <div class="ld-field">
            <label for="ld-owner">{{ t('app.leads.owner') }}</label>
            <select id="ld-owner" class="ld-input" formControlName="ownerCode">
              @if (!editing && store.menu().queue) { <option value="">{{ t('app.leads.queueOption') }}</option> }
              @for (o of ownerOptions; track o.code) { <option [value]="o.code">{{ o.code }} {{ o.name }}</option> }
            </select>
            @if (!editing && !ownerOptions.length) {
              <p class="ld-hint">{{ t('app.leads.noReceiver') }}</p>
            }
          </div>
          <div class="ld-field">
            <span class="ld-label">{{ t('app.leads.leadStatus') }}</span>
            <span class="ld-tag" [attr.data-status]="status">{{ store.statusLabel(status) }}</span>
          </div>
        </div>

        <button type="button" class="ld-form-toggle" [attr.aria-expanded]="moreOpen()" aria-controls="ld-more" (click)="moreOpen.set(!moreOpen())">
          <span>{{ t('app.leads.sectionMore') }} <small>({{ t('app.leads.optional') }})</small></span>
          <ts-icon [name]="moreOpen() ? 'chevronDown' : 'chevronRight'" [size]="18" />
        </button>
        <div id="ld-more" class="ld-grid" [hidden]="!moreOpen()">
          <div class="ld-field">
            <label for="ld-address">{{ t('app.leads.address') }}</label>
            <input id="ld-address" class="ld-input" formControlName="address" maxlength="200" />
          </div>
          <div class="ld-field">
            <label for="ld-country">{{ t('app.leads.country') }}</label>
            <select id="ld-country" class="ld-input" formControlName="country">
              @for (c of countries(); track c) { <option [value]="c">{{ c }}</option> }
            </select>
          </div>
          <div class="ld-field">
            <label for="ld-province">{{ t('app.leads.province') }}</label>
            <input id="ld-province" class="ld-input" formControlName="province" maxlength="80" />
          </div>
          <div class="ld-field">
            <label for="ld-district">{{ t('app.leads.district') }}</label>
            <input id="ld-district" class="ld-input" formControlName="district" maxlength="80" />
          </div>
          <div class="ld-field">
            <label for="ld-subdistrict">{{ t('app.leads.subdistrict') }}</label>
            <input id="ld-subdistrict" class="ld-input" formControlName="subdistrict" maxlength="80" />
          </div>
          <div class="ld-field">
            <label for="ld-postcode">{{ t('app.leads.postcode') }}</label>
            <input id="ld-postcode" class="ld-input" formControlName="postcode" inputmode="numeric" maxlength="5" />
          </div>
          <div class="ld-field">
            <label for="ld-taxid">{{ t('app.leads.taxId') }}</label>
            <div>
              <input id="ld-taxid" class="ld-input" formControlName="taxId" inputmode="numeric" maxlength="13" [attr.aria-invalid]="invalid('taxId')" />
              @if (invalid('taxId')) { <span class="ld-err" role="alert">{{ t('app.leads.errTaxId') }}</span> }
            </div>
          </div>
        </div>
      </form>
      <ng-container foot>
        <button type="button" class="ld-btn" (click)="store.open(null)">{{ t('app.common.cancel') }}</button>
        <button type="submit" form="ld-form" class="ld-btn ld-btn-primary">{{ t(editing ? 'app.leads.save' : 'app.leads.addLead') }}</button>
      </ng-container>
    </ts-lead-dialog-frame>
  `,
})
export class LeadFormDialog {
  protected readonly store = inject(LeadsStore);
  protected readonly t = this.store.t;
  private readonly fb = inject(NonNullableFormBuilder);

  /** Lead ที่แก้ไข (`undefined` = เพิ่มใหม่) */
  protected readonly editing = (() => {
    const d = this.store.dialog();
    return d?.kind === 'form' && d.leadId !== null ? this.store.leadOf(d.leadId) : undefined;
  })();
  protected readonly status = this.editing?.status ?? 'new';
  protected readonly phoneCodes = PHONE_CODES;
  protected readonly sources = LEAD_SOURCES;
  protected readonly moreOpen = signal(true);
  private readonly submitted = signal(false);

  protected readonly form = this.fb.group({
    name: [this.editing?.name ?? '', [Validators.required, Validators.pattern(BLANK_PATTERN)]],
    phoneCode: [this.editing?.phoneCode ?? PHONE_CODES[0]],
    phone: [this.editing?.phone ?? '', [Validators.required, Validators.pattern(PHONE_PATTERN), digitsBetween(MIN_PHONE_DIGITS, MAX_PHONE_DIGITS)]],
    email: [this.editing?.email ?? '', [Validators.email]],
    source: [this.editing?.source ?? LEAD_SOURCES[0]],
    ownerCode: [this.editing?.ownerCode ?? this.store.defaultReceiver()],
    address: [this.editing?.address ?? ''],
    country: [this.editing?.country || COUNTRIES[0]],
    province: [this.editing?.province ?? ''],
    district: [this.editing?.district ?? ''],
    subdistrict: [this.editing?.subdistrict ?? ''],
    postcode: [this.editing?.postcode ?? ''],
    taxId: [this.editing?.taxId ?? '', [Validators.pattern(TAX_ID_PATTERN)]],
  });

  /** who the Lead can be given to: the receivers (View + Edit of a Lead); an edited Lead keeps its current owner in the list */
  protected readonly ownerOptions = this.store.owners.filter((o) => o.code === this.editing?.ownerCode || this.store.receivers().some((r) => r.code === o.code));

  constructor() {
    // ฟิลด์ที่ผู้ใช้ไม่มีสิทธิ์ข้อมูลแสดงเป็น *** และแก้ไม่ได้ (ค่าจริงคงเดิมที่ store.update)
    if (this.editing) for (const f of this.store.masked()) this.form.controls[f].disable();
    // เปลี่ยนผู้รับผิดชอบทำที่ปุ่ม "เปลี่ยนผู้รับผิดชอบ" (`Pipeline_Lead_Change_Assign`) ไม่ใช่ที่ฟอร์มแก้ไข
    if (this.editing) this.form.controls.ownerCode.disable();
  }

  /** ประเทศที่เลือกได้ (รวมค่าเดิมของ Lead ที่แก้ไขซึ่งอาจไม่อยู่ในรายการ) */
  protected readonly countries = signal<readonly string[]>(
    this.editing?.country && !COUNTRIES.some((c) => c === this.editing?.country) ? [...COUNTRIES, this.editing.country] : COUNTRIES,
  );

  /** แสดงข้อผิดพลาดของช่องหลังแตะช่องนั้นหรือกดบันทึกแล้ว */
  protected invalid(name: keyof LeadForm): boolean {
    const c = this.form.controls[name];
    return c.invalid && (c.touched || c.dirty || this.submitted());
  }

  /** when the action was last done: a second click that comes before the dialog is gone (a double click) must not do it again */
  private lastDoneAt = 0;
  private readonly justDone = (): boolean => Date.now() - this.lastDoneAt < 1000;

  protected save(): void {
    this.submitted.set(true);
    if (this.form.invalid || this.justDone()) return;
    const v = this.form.getRawValue();
    const text = (x: string): string => x.trim();
    const value: LeadForm = {
      name: text(v.name),
      phoneCode: v.phoneCode,
      phone: text(v.phone),
      email: text(v.email),
      source: v.source,
      ownerCode: v.ownerCode,
      address: text(v.address),
      country: v.country,
      province: text(v.province),
      district: text(v.district),
      subdistrict: text(v.subdistrict),
      postcode: text(v.postcode),
      taxId: text(v.taxId),
    };
    this.lastDoneAt = Date.now();
    if (this.editing) this.store.update(this.editing.id, value);
    else void this.store.create(value);
  }
}

/** ตรวจจำนวนตัวเลขของเบอร์ (ไม่นับเว้นวรรค/ขีด) */
function digitsBetween(min: number, max: number) {
  return (control: { value: unknown }): { phoneLength: true } | null => {
    const count = String(control.value ?? '').replace(/\D/g, '').length;
    return count >= min && count <= max ? null : { phoneLength: true };
  };
}
