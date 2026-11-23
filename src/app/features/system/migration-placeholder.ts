import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import { ActivatedRoute } from '@angular/router';
import { I18n } from '@core/i18n/i18n.service';
import { PHASES, PageDef } from '@core/navigation/page-registry';
import { TsIcon } from '@shared/ui/icon/icon';

/**
 * Stand-in for every screen that has not been ported yet. It renders the registry entry of the
 * route (legacy files, APIs, notes, phase) so a developer opening the page sees exactly what has
 * to be built. When a page is implemented, set `implemented: true` in page-registry.json and add
 * its loader in app.routes.ts.
 */
@Component({
  selector: 'ts-migration-placeholder',
  imports: [TsIcon],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './migration-placeholder.html',
  styleUrl: './migration-placeholder.scss',
})
export class MigrationPlaceholder {
  private readonly i18n = inject(I18n);
  protected readonly t = this.i18n.t;

  /** route data is set once per route by app.routes.ts */
  protected readonly page = inject(ActivatedRoute).snapshot.data['page'] as PageDef;
  protected readonly title = computed(() => this.page.title[this.i18n.lang()]);
  protected readonly phase = PHASES.find((p) => p.id === this.page.phase);
}
