import { ChangeDetectionStrategy, Component, computed, inject, input, output, signal } from '@angular/core';
import { I18n } from '@core/i18n/i18n.service';
import { interestColor, stepperColor } from '@shared/constants/palettes';
import {
  dueMonthLabel,
  filterCounts,
  filterItems,
  money,
  savedDate,
  wonSummary,
  type OpportunityFilter,
  type ProspectOpportunity,
} from './prospect-opportunities.model';

/**
 * The "โอกาสขาย" tab of the prospect detail page: the summary (won count and value), the filter pills (all · open · won · lost) and one card per opportunity.
 * Written by hand (a new screen, no Java original). The data comes from the page (`mockProspectOpportunities()` until the API of E07 exists).
 */
@Component({
  selector: 'ts-prospect-opportunities',
  templateUrl: './prospect-opportunities.html',
  styleUrl: './prospect-opportunities.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ProspectOpportunities {
  readonly items = input.required<readonly ProspectOpportunity[]>();
  /** the user opens the page of an opportunity */
  readonly open = output<string>();

  private readonly i18n = inject(I18n);
  protected readonly t = this.i18n.t;
  protected readonly filter = signal<OpportunityFilter>('all');
  protected readonly counts = computed(() => filterCounts(this.items()));
  protected readonly shown = computed(() => filterItems(this.items(), this.filter()));
  protected readonly won = computed(() => wonSummary(this.items()));
  protected readonly wonColor = interestColor('SUCCESS');

  protected readonly money = money;
  protected readonly savedDate = savedDate;

  protected badgeColor(o: ProspectOpportunity): string {
    return interestColor(o.status);
  }
  protected stageColor(o: ProspectOpportunity): string {
    return stepperColor(o.stageTotal, o.stageIndex);
  }
  protected due(o: ProspectOpportunity): string {
    return dueMonthLabel(o.dueMonth, this.i18n.lang() === 'en' ? 'en' : 'th');
  }
  /** the people left out of the stack of avatars ("3+") */
  protected more(o: ProspectOpportunity): number {
    return Math.max(0, o.participantsTotal - o.participants.length);
  }
  protected avatar(src: string): string {
    return src || 'assets/images/icon/default_avatar.svg';
  }
}
