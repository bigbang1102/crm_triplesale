import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { I18n } from '@core/i18n/i18n.service';
import { TsIcon } from '@shared/ui/icon/icon';

type Kind = 'forbidden' | 'not-found' | 'under-construction';

const VIEW: Record<Kind, { icon: string; title: string; text: string }> = {
  forbidden: { icon: 'ban', title: 'app.forbidden.title', text: 'app.forbidden.text' },
  'not-found': { icon: 'compass', title: 'app.notFound.title', text: 'app.notFound.text' },
  'under-construction': { icon: 'hammer', title: 'app.uc.title', text: 'app.uc.text' },
};

/** One component for the three system pages; route `data.kind` picks the content. */
@Component({
  selector: 'ts-system-page',
  imports: [RouterLink, TsIcon],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <section class="ts-card box">
      <span class="ico"><ts-icon [name]="view().icon" [size]="40" /></span>
      <h1>{{ t(view().title) }}</h1>
      <p>{{ t(view().text) }}</p>
      <a class="ts-btn" routerLink="/crm/home">{{ t('app.forbidden.home') }}</a>
    </section>
  `,
  styles: `
    :host {
      display: grid;
      place-items: center;
      min-height: calc(100vh - var(--ts-topbar-h) - var(--ts-footer-h) - 2 * var(--ts-content-pad));
    }
    .box {
      display: grid;
      justify-items: center;
      gap: 10px;
      width: min(460px, 100%);
      padding: 40px 28px;
      text-align: center;
    }
    .ico {
      display: grid;
      place-items: center;
      width: 80px;
      height: 80px;
      border-radius: 50%;
      background: var(--ts-selected);
      color: var(--ts-primary-fg);
    }
    h1 {
      font-size: var(--ts-fs-3);
      color: var(--ts-text-header);
    }
    p {
      margin-bottom: 8px;
      color: var(--ts-text-muted);
    }
    a {
      text-decoration: none;
    }
  `,
})
export class SystemPage {
  protected readonly t = inject(I18n).t;
  private readonly kind = (inject(ActivatedRoute).snapshot.data['kind'] ?? 'not-found') as Kind;
  protected readonly view = computed(() => VIEW[this.kind]);
}
