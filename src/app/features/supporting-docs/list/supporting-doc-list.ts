import { ChangeDetectionStrategy, Component, computed, effect, inject, input, signal, untracked } from '@angular/core';
import { Router } from '@angular/router';
import { I18n } from '@core/i18n/i18n.service';
import { supportingDocType } from '../supporting-doc-types';
import { SupportingDocListView } from './supporting-doc-list-view';

/**
 * Supporting-document list route (`/crm/supporting-docs/:type`) — `pages/sales_document.xhtml` … `sales_document_7.xhtml`, the seven copies of one page:
 * the table of the documents of a family with the button that creates one. `FEATURE_CRM_Document` for the route, `CRM_Document_<Family>_View` for the
 * page itself (Java: the form is `rendered` only with it). Anything but one of the seven families goes back to the hub.
 */
@Component({
  selector: 'ts-supporting-doc-list',
  imports: [SupportingDocListView],
  changeDetection: ChangeDetectionStrategy.OnPush,
  // a new view instance = a fresh page (Java: location.reload(), another sales_document_N)
  template: `
    @if (docType(); as t) {
      @for (n of [epoch() + ':' + t.slug]; track n) {
        <ts-supporting-doc-list-view [type]="t" />
      }
    }
  `,
})
export class SupportingDocList {
  /** route parameter `:type` */
  readonly type = input<string>();
  protected readonly docType = computed(() => supportingDocType(this.type()));
  protected readonly epoch = signal(0);
  private readonly router = inject(Router);

  constructor() {
    // Java reloads the page on a language switch: the texts of the script are read from the bundle once, when it renders
    const i18n = inject(I18n);
    let first = true;
    effect(() => {
      i18n.lang();
      untracked(() => (first ? (first = false) : this.epoch.update((n) => n + 1)));
    });
    effect(() => {
      if (!this.docType()) untracked(() => void this.router.navigateByUrl('/crm/supporting-docs', { replaceUrl: true }));
    });
  }
}
