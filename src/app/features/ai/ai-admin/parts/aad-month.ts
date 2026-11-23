import { ChangeDetectionStrategy, Component, computed, inject, model } from '@angular/core';
import { I18n } from '@core/i18n/i18n.service';
import { PrefsService } from '@core/prefs/prefs.service';
import { monthLabel, shiftMonth } from '../ai-admin.logic';

/** Month picker `‹ พ.ย. 2569 ›` (the value is `yyyy-MM`, the service's month format). */
@Component({
  selector: 'ts-aad-month',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="aad-month" role="group" [attr.aria-label]="t('app.aiAdmin.month')">
      <button
        type="button"
        class="aad-btn aad-btn-icon"
        [attr.aria-label]="t('app.aiAdmin.monthPrev')"
        (click)="move(-1)"
      >
        <i class="fa-solid fa-chevron-left" aria-hidden="true"></i>
      </button>
      <label class="aad-month-label">
        <span class="aad-sr">{{ t('app.aiAdmin.month') }}</span>
        <input type="month" [value]="month()" (change)="onInput($event)" />
        <strong>{{ label() }}</strong>
      </label>
      <button
        type="button"
        class="aad-btn aad-btn-icon"
        [attr.aria-label]="t('app.aiAdmin.monthNext')"
        (click)="move(1)"
      >
        <i class="fa-solid fa-chevron-right" aria-hidden="true"></i>
      </button>
    </div>
  `,
})
export class AadMonth {
  readonly month = model.required<string>();
  protected readonly t = inject(I18n).t;
  private readonly prefs = inject(PrefsService);
  protected readonly label = computed(() =>
    monthLabel(this.month(), this.prefs.lang() === 'en' ? 'en' : 'th'),
  );

  protected move(delta: number): void {
    this.month.set(shiftMonth(this.month(), delta));
  }

  protected onInput(event: Event): void {
    const value = (event.target as HTMLInputElement).value;
    if (/^\d{4}-\d{2}$/.test(value)) this.month.set(value);
  }
}
