import { ChangeDetectionStrategy, Component, computed, inject, input } from '@angular/core';
import { I18n } from '@core/i18n/i18n.service';
import { historyTime, newestFirst, shown, type ProspectHistoryEntry } from './prospect-history.model';

/**
 * The "ประวัติการแก้ไข" tab of the prospect detail page: a table of the edits (when · field · old value → new value · who). Written by hand (a new screen, no Java
 * original). The data comes from the page (`mockProspectHistory()` until the API exists). The table stretches to the bottom of the tab.
 */
@Component({
  selector: 'ts-prospect-history',
  templateUrl: './prospect-history.html',
  styleUrl: './prospect-history.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ProspectHistory {
  readonly entries = input.required<readonly ProspectHistoryEntry[]>();

  protected readonly t = inject(I18n).t;
  protected readonly rows = computed(() => newestFirst(this.entries()));
  protected readonly time = historyTime;
  protected readonly shown = shown;
}
