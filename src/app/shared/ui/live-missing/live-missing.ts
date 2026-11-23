import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { I18n } from '@core/i18n/i18n.service';

/**
 * What a page that is ported (it works against its mock) shows when the app runs against the real backend and the live adapter
 * of that page does not exist yet (`config.mock === false`). Replace the use of it by the live backend when that is written.
 */
@Component({
  selector: 'ts-live-missing',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="live-missing" role="status">
      <strong>{{ t('app.live.missingTitle') }}</strong>
      <span>{{ t('app.live.missingText') }}</span>
    </div>
  `,
  styles: `
    .live-missing {
      display: flex;
      flex-direction: column;
      gap: 6px;
      margin: 24px;
      padding: 16px 20px;
      border: 1px dashed var(--ts-border);
      border-radius: var(--ts-radius);
      background: var(--ts-surface);
      color: var(--ts-text-muted);
    }
    strong {
      color: var(--ts-text-header);
    }
  `,
})
export class LiveMissing {
  protected readonly t = inject(I18n).t;
}
