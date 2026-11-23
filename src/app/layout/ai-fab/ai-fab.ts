import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import { I18n } from '@core/i18n/i18n.service';
import { AiFabView } from './ai-fab-view';

/**
 * The floating AI button of every signed-in page (the Shell renders it once, outside the page content — like
 * template.xhtml includes `ai_menu.xhtml` outside `.layout-wrapper`).
 */
@Component({
  selector: 'ts-ai-fab',
  imports: [AiFabView],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <!-- keyed by the language: the script gets the menu labels once, so switching language rebuilds the view,
         like the page reload of the Java app (the chat is restored from sessionStorage) -->
    @for (key of keys(); track key) {
      <ts-ai-fab-view />
    }
  `,
})
export class AiFab {
  private readonly lang = inject(I18n).lang;
  protected readonly keys = computed(() => [this.lang()]);
}
