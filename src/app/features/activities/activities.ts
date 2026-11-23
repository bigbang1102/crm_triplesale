import { ChangeDetectionStrategy, Component, effect, inject, signal, untracked } from '@angular/core';
import { I18n } from '@core/i18n/i18n.service';
import { ActivitiesView } from './activities-view';

/**
 * Activities route (`/crm/activities`) — pages/activity.xhtml + components/work_modal.xhtml. `FEATURE_CRM_ContactActivity`; the contact
 * activities of the leads: table by opportunity (A0), by workflow group (A1) or flat (B, products without a workflow), the detail
 * panel (history, appointments, tasks) and the work modal.
 *
 * The backend is chosen by the host (`activities-view.ts`): the sample data in mock mode, the REST services (`activities.live.ts`) otherwise.
 */
@Component({
  selector: 'ts-activities',
  imports: [ActivitiesView],
  changeDetection: ChangeDetectionStrategy.OnPush,
  // a new view instance = a fresh page (Java: location.reload())
  template: `
    @for (n of [epoch()]; track n) {
      <ts-activities-view (reload)="reload()" />
    }
  `,
})
export class Activities {
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
