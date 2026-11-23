import { ChangeDetectionStrategy, Component, computed, effect, inject, input, signal, untracked } from '@angular/core';
import { ConfigService } from '@core/config/config.service';
import { I18n } from '@core/i18n/i18n.service';
import { LiveMissing } from '@shared/ui/live-missing/live-missing';
import { salesDocType } from '../sales-doc-types';
import { SalesDocListView } from './sales-doc-list-view';

/**
 * Sales-document list route (`/sales/docs/:type`) — pages/sales_doc_type_list.xhtml: the table of the quotations (qt), bookings (bk), delivery
 * notes (ob), auto-dealer quotations (aq) or auto-dealer bookings (ad) with the button that creates one; any other `:type` shows the legacy
 * list, as `?doc=` of the Java page did. `FEATURE_CRM_Document`, menu group "งานขาย".
 */
@Component({
  selector: 'ts-sales-doc-list',
  imports: [SalesDocListView, LiveMissing],
  changeDetection: ChangeDetectionStrategy.OnPush,
  // a new view instance = a fresh page (Java: location.reload(), a different ?doc=)
  template: `
    @if (live) {
      <ts-live-missing />
    } @else {
      @for (n of [epoch() + ':' + docKey()]; track n) {
        <ts-sales-doc-list-view [docKey]="docKey()" />
      }
    }
  `,
})
export class SalesDocList {
  /** route parameter `:type` */
  readonly type = input<string>();
  protected readonly docKey = computed(() => salesDocType(this.type()));
  protected readonly epoch = signal(0);
  /** the real backend is not connected yet (see sales-doc-list-view.ts) */
  protected readonly live = !inject(ConfigService).value.mock;

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
