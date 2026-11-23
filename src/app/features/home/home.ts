import { ChangeDetectionStrategy, Component, effect, inject, signal, untracked } from '@angular/core';
import { I18n } from '@core/i18n/i18n.service';
import { HomeView } from './home-view';

/**
 * CRM home route (`/crm/home`) — pages/index.xhtml (+ resources/js/dashboard.js, components/work_modal.xhtml). The first page after sign-in: the
 * customer statistics and the donut by workflow step, the opportunity table (the NEW leads, infinite scroll) with the assign-work dialog, the
 * month calendar with the appointment carousel and the task list.
 *
 * The backend is chosen by the host (`home-view.ts`): the sample data in mock mode, the REST service (`home.live.ts`) otherwise.
 */
@Component({
  selector: 'ts-home',
  imports: [HomeView],
  changeDetection: ChangeDetectionStrategy.OnPush,
  // a new view instance = a fresh page (Java: location.reload())
  template: `
    @for (n of [epoch()]; track n) {
      <ts-home-view (reload)="reload()" />
    }
  `,
})
export class Home {
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
