import { ChangeDetectionStrategy, Component, effect, inject, input, signal, untracked } from '@angular/core';
import { I18n } from '@core/i18n/i18n.service';
import { ReceiptFormView } from './receipt-form-view';

/**
 * Receipt form route (`/sales/receipts/:id`) — pages/sales_doc_rv.xhtml: a new receipt (ใบรับเงิน RV) — customer, items with VAT /
 * withholding, payments with the numpad dialog, attachments, save. `FEATURE_CRM_Document`, menu group "งานขาย".
 *
 * `:id` is always `new`: a receipt cannot be edited once it is created (the backend has create and approve only), and the Java page took
 * no id — whatever the address says, this is the form for a new receipt. The page is prefilled from a lead when the address carries
 * `?leadId=` (+ `activityGroupId`, `listMaterialId`), like `sales_doc_rv.xhtml?leadId=…` did.
 *
 * The backend is chosen by the host (`receipt-form-view.ts`): the fake data in mock mode, the REST services (`receipts.live.ts`) otherwise.
 */
@Component({
  selector: 'ts-receipt-form',
  imports: [ReceiptFormView],
  changeDetection: ChangeDetectionStrategy.OnPush,
  // a new view instance = a fresh page (Java: location.reload())
  template: `
    @for (n of [epoch()]; track n) {
      <ts-receipt-form-view />
    }
  `,
})
export class ReceiptForm {
  /** route parameter `:id` (always "new", see above) */
  readonly id = input<string>();
  protected readonly epoch = signal(0);

  constructor() {
    // Java reloads the page on a language switch: the texts of the script are read from the bundle once, when it renders
    const i18n = inject(I18n);
    let first = true;
    effect(() => {
      i18n.lang();
      untracked(() => (first ? (first = false) : this.epoch.update((n) => n + 1)));
    });
  }
}
