import { ChangeDetectionStrategy, Component, effect, inject, signal, untracked } from '@angular/core';
import { I18n } from '@core/i18n/i18n.service';
import { ReportView } from './report-view';

/**
 * Report route (`/report`) — pages/report.xhtml: the list of reports (groups, search) and the filter panel of the selected one; "เรียกดู"
 * opens the report PDF in a new tab. Which reports show depends on the roles `Report_<CODE>_View`.
 */
@Component({
  selector: 'ts-report',
  imports: [ReportView],
  changeDetection: ChangeDetectionStrategy.OnPush,
  // a new view instance = a fresh page (Java: location.reload())
  template: `
    @for (n of [epoch()]; track n) {
      <ts-report-view />
    }
  `,
})
export class Report {
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
