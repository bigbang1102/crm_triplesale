import { ChangeDetectionStrategy, Component, effect, inject, signal, untracked } from '@angular/core';
import { I18n } from '@core/i18n/i18n.service';
import { ProspectsView } from './prospects-view';

/**
 * Prospects route (`/crm/prospects`) — pages/contracts.xhtml (the customer prospect list; the file name is historical). `FEATURE_CRM_Prospect`.
 * The prospect form (`/crm/prospects/:id`, contracts_master_data.xhtml) is another page; the links to it go through `javaLinkToRoute()`.
 *
 * The backend is chosen by the host (`prospects-view.ts`): the sample data in mock mode, the REST services (`prospects.live.ts`: the
 * ProspectListServlet/Service, ProspectEnrichServlet, ProspectAttachmentsServlet, DocProxy and LeadCreateServlet of the Java app, the
 * master-data servlets through `boardMasterRoutes`) otherwise.
 */
@Component({
  selector: 'ts-prospects',
  imports: [ProspectsView],
  changeDetection: ChangeDetectionStrategy.OnPush,
  // a new view instance = a fresh page (Java: location.reload())
  template: `
    @for (n of [epoch()]; track n) {
      <ts-prospects-view />
    }
  `,
})
export class Prospects {
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
