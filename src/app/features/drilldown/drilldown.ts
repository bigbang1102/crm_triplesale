import { ChangeDetectionStrategy, Component, computed, inject, input } from '@angular/core';
import { I18n } from '@core/i18n/i18n.service';
import { DrilldownView } from './drilldown-view';

/**
 * DrillDown route (`/crm/drilldown/:code`) — pages/drilldown.xhtml. `CRM_Dashboard_View`; the 11 reports T-CS-01 … T-FI-01 share this
 * one page (the menu opens `drilldown.face?code=T-…`, here the code is the last segment of the route).
 *
 * The backend is chosen by the host (`drilldown-view.ts`): the sample data in mock mode, the REST service
 * (`GET {triplesale-service}/api/v1/drilldown/<apiPath>`, `drilldown.live.ts`) otherwise.
 */
@Component({
  selector: 'ts-drilldown',
  imports: [DrilldownView],
  changeDetection: ChangeDetectionStrategy.OnPush,
  // a new view instance = a fresh page (Java: a language switch reloads the page, a link to another report is another page)
  template: `
    @for (key of [viewKey()]; track key) {
      <ts-drilldown-view [code]="code()" />
    }
  `,
})
export class Drilldown {
  /** `:code` of the route (bound by `withComponentInputBinding`) */
  readonly code = input('');

  private readonly i18n = inject(I18n);
  protected readonly viewKey = computed(() => `${this.code()}|${this.i18n.lang()}`);
}
