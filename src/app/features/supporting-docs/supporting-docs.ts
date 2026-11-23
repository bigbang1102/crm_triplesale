import { ChangeDetectionStrategy, Component, effect, inject, signal, untracked } from '@angular/core';
import { I18n } from '@core/i18n/i18n.service';
import { SupportingDocsView } from './supporting-docs-view';

/**
 * Supporting documents hub route (`/crm/supporting-docs`) — pages/supporting_documents.xhtml: the seven document families (each behind
 * `CRM_Document_<Family>_View`), a search box, and a button / row that opens the list of the family.
 */
@Component({
  selector: 'ts-supporting-docs',
  imports: [SupportingDocsView],
  changeDetection: ChangeDetectionStrategy.OnPush,
  // a new view instance = a fresh page (Java: location.reload())
  template: `
    @for (n of [epoch()]; track n) {
      <ts-supporting-docs-view />
    }
  `,
})
export class SupportingDocs {
  protected readonly epoch = signal(0);

  constructor() {
    // Java reloads the page on a language switch
    const i18n = inject(I18n);
    let first = true;
    effect(() => {
      i18n.lang();
      untracked(() => (first ? (first = false) : this.epoch.update((n) => n + 1)));
    });
  }
}
