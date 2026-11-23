import { ChangeDetectionStrategy, Component, effect, inject, signal, untracked } from '@angular/core';
import { I18n } from '@core/i18n/i18n.service';
import { OpportunitiesView } from './opportunities-view';

/**
 * Opportunities route (`/crm/opportunities`) — pages/lead.xhtml (+ components/access_pop, components/lead/filter_modal, components/move_step_modal,
 * css/lead.css): the Board (kanban) and the List of the sales opportunities. `FEATURE_CRM_Lead`; the page itself needs `CRM_Lead_View`
 * for the data and for opening a lead, `CRM_ContactActivity_Create[_Sup]` for moving a card.
 *
 * The backend is chosen by the host (`leads-view.ts`): the sample data in mock mode, the REST service (`leads.live.ts`) otherwise.
 */
@Component({
  selector: 'ts-opportunities',
  imports: [OpportunitiesView],
  changeDetection: ChangeDetectionStrategy.OnPush,
  // a new view instance = a fresh page (Java: location.reload())
  template: `
    @for (n of [epoch()]; track n) {
      <ts-opportunities-view (reload)="reload()" />
    }
  `,
})
export class Opportunities {
  protected readonly epoch = signal(0);

  constructor() {
    // Java reloads the page on a language switch: the texts of the script are read from the bundle once, when it renders
    const i18n = inject(I18n);
    let first = true;
    effect(() => {
      i18n.lang();
      untracked(() => (first ? (first = false) : this.reload()));
    });
  }

  protected reload(): void {
    this.epoch.update((n) => n + 1);
  }
}
