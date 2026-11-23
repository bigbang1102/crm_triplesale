import { ChangeDetectionStrategy, Component, ViewEncapsulation, computed, inject, signal } from '@angular/core';
import { LeadDialogFrame } from './lead-dialog-frame';
import { LeadsStore } from './leads.store';
import { CONTACT_KINDS, type ContactKind } from './leads.types';

const MAX_TEXT = 1000;

/** หน้าต่าง "เพิ่มการติดต่อ" — เลือกช่องทาง (Note / โทรออก / โทรเข้า / SMS / อีเมล / Facebook / LINE) + ข้อความ */
@Component({
  selector: 'ts-lead-contact-dialog',
  imports: [LeadDialogFrame],
  changeDetection: ChangeDetectionStrategy.OnPush,
  encapsulation: ViewEncapsulation.None,
  template: `
    @if (lead(); as l) {
      <ts-lead-dialog-frame [title]="t('app.leads.contact.title')" [width]="640" (closed)="store.open(null)">
        <p class="ld-contact-who">{{ l.name }}</p>
        <div class="ld-kinds" role="radiogroup" [attr.aria-label]="t('app.leads.contact.kind')">
          @for (k of kinds; track k) {
            <button type="button" role="radio" class="ld-pill ld-pill-sm" [class.on]="kind() === k" [attr.aria-checked]="kind() === k" (click)="kind.set(k)">{{ t('app.leads.contactKind.' + k) }}</button>
          }
        </div>
        <label class="ld-label" for="ld-contact-text">{{ t('app.leads.contact.text') }}</label>
        <textarea id="ld-contact-text" class="ld-input ld-textarea" rows="5" [maxLength]="maxText" [value]="text()" (input)="onText($event)" [attr.aria-invalid]="touched() && !ready()"></textarea>
        @if (touched() && !ready()) { <span class="ld-err" role="alert">{{ t('app.leads.contact.errText') }}</span> }
        <ng-container foot>
          <button type="button" class="ld-btn" (click)="store.open(null)">{{ t('app.common.cancel') }}</button>
          <button type="button" class="ld-btn ld-btn-primary" (click)="submit()">{{ t('app.leads.add') }}</button>
        </ng-container>
      </ts-lead-dialog-frame>
    }
  `,
})
export class LeadContactDialog {
  protected readonly store = inject(LeadsStore);
  protected readonly t = this.store.t;
  protected readonly kinds = CONTACT_KINDS;
  protected readonly maxText = MAX_TEXT;

  protected readonly kind = signal<ContactKind>(CONTACT_KINDS[0]);
  protected readonly text = signal('');
  protected readonly touched = signal(false);
  protected readonly ready = computed(() => this.text().trim() !== '');

  private readonly leadId = (() => {
    const d = this.store.dialog();
    return d?.kind === 'contact' ? d.leadId : null;
  })();
  protected readonly lead = computed(() => (this.leadId === null ? undefined : this.store.leadOf(this.leadId)));

  protected onText(e: Event): void {
    this.text.set((e.target as HTMLTextAreaElement).value);
  }

  /** when the action was last done: a second click that comes before the dialog is gone (a double click) must not do it again */
  private lastDoneAt = 0;
  private readonly justDone = (): boolean => Date.now() - this.lastDoneAt < 1000;

  protected submit(): void {
    this.touched.set(true);
    if (this.justDone() || this.leadId === null || !this.ready()) return;
    this.lastDoneAt = Date.now();
    this.store.addContact(this.leadId, this.kind(), this.text().trim());
  }
}
