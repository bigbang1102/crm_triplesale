import { ChangeDetectionStrategy, Component, computed, inject, input } from '@angular/core';
import { I18n } from '@core/i18n/i18n.service';
import { formatNumber, formatPercent, formatTokens, quotaStatus } from '../ai-admin.logic';
import type { QuotaInfo } from '../ai-admin.types';

/**
 * Used / limit bar of a quota with a status chip (text + icon + colour, never colour alone).
 * `compact` = just the bar and the percentage (table cells); otherwise used, remaining and limit are spelled out.
 */
@Component({
  selector: 'ts-aad-quota-bar',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @if (quota(); as q) {
      <div class="aad-quota" [class]="'aad-quota is-' + status()">
        <div
          class="aad-quota-track"
          role="progressbar"
          [attr.aria-valuenow]="q.percent"
          aria-valuemin="0"
          aria-valuemax="100"
          [attr.aria-label]="
            t('app.aiAdmin.quota.usedOf', formatTokens(q.used), formatTokens(q.limit))
          "
        >
          <span class="aad-quota-fill" [style.width.%]="width()"></span>
        </div>
        <div class="aad-quota-text">
          <span class="aad-chip" [class]="'aad-chip is-' + status()"
            ><i [class]="icon()" aria-hidden="true"></i
            >{{ t('app.aiAdmin.status.' + status()) }}</span
          >
          <span>{{ formatPercent(q.percent) }}</span>
          @if (!compact()) {
            <span>{{
              t('app.aiAdmin.quota.usedOf', formatNumber(q.used), formatNumber(q.limit))
            }}</span>
            <span>{{ t('app.aiAdmin.quota.remaining', formatNumber(q.remaining)) }}</span>
          }
          @if (!q.enabled) {
            <span class="aad-muted">{{ t('app.aiAdmin.quota.off') }}</span>
          }
        </div>
      </div>
    } @else {
      <span class="aad-muted">{{ t('app.aiAdmin.quota.none') }}</span>
    }
  `,
})
export class AadQuotaBar {
  readonly quota = input<QuotaInfo | null>(null);
  readonly compact = input(false);

  protected readonly t = inject(I18n).t;
  protected readonly formatTokens = formatTokens;
  protected readonly formatNumber = formatNumber;
  protected readonly formatPercent = formatPercent;
  protected readonly status = computed(() => quotaStatus(this.quota()));
  protected readonly width = computed(() => Math.min(100, Math.max(0, this.quota()?.percent ?? 0)));
  protected readonly icon = computed(() => {
    const status = this.status();
    return status === 'full'
      ? 'fa-solid fa-ban'
      : status === 'warn'
        ? 'fa-solid fa-triangle-exclamation'
        : 'fa-solid fa-circle-check';
  });
}
