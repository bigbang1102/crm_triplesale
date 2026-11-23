import { ChangeDetectionStrategy, Component, effect, inject, signal, untracked } from '@angular/core';
import { I18n } from '@core/i18n/i18n.service';
import { ReceiptsView } from './receipts-view';

/**
 * Receipt list route (`/sales/receipts`) — pages/sales_doc_rv_list.xhtml: the receipts (ใบรับเงิน RV) with search, status and product
 * filters, the approve dialog, the detail modal and the report popover. `FEATURE_CRM_Document`, menu group "งานขาย".
 *
 * The backend is chosen by the host (`receipts-view.ts`): the fake data in mock mode, the REST services (`receipts.live.ts`) otherwise.
 */
@Component({
  selector: 'ts-receipts',
  imports: [ReceiptsView],
  changeDetection: ChangeDetectionStrategy.OnPush,
  // a new view instance = a fresh page (Java: location.reload())
  template: `
    @for (n of [epoch()]; track n) {
      <ts-receipts-view />
    }
  `,
})
export class Receipts {
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
