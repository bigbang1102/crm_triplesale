import { ChangeDetectionStrategy, Component, effect, inject, signal, untracked } from '@angular/core';
import { I18n } from '@core/i18n/i18n.service';
import { DashboardView } from './dashboard-view';

/**
 * Dashboard route (`/dashboard`) — pages/dashboard.xhtml (+ dashboard_company.xhtml, dashboard_calendar_frame.xhtml,
 * dashboard_kpi_frame.xhtml). `FEATURE_CRM_Dashboard`; the page is the BI dashboard "Dashboard ลีดเก็บเงิน" with ten tabs.
 */
@Component({
  selector: 'ts-dashboard',
  imports: [DashboardView],
  changeDetection: ChangeDetectionStrategy.OnPush,
  // a new view instance = a fresh page (Java: location.reload())
  template: `
    @for (n of [epoch()]; track n) {
      <ts-dashboard-view (reload)="reload()" />
    }
  `,
})
export class Dashboard {
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
