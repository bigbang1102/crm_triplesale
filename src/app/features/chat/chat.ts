import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import { I18n } from '@core/i18n/i18n.service';
import { ChatView } from './chat-view';

/**
 * Chat route (`/chat`) — pages/chatbot.xhtml. Requires MODULE_CHATBOX (page guard); the buttons inside the page are
 * gated by the Chat_* feature keys exactly as the Java `ui:fragment rendered="#{commonBean.hasFeature(…)}"` were.
 */
@Component({
  selector: 'ts-chat',
  imports: [ChatView],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <!-- keyed by the language: the page script gets its messages once, so switching language rebuilds the view,
         like the page reload of the Java app -->
    @for (key of keys(); track key) {
      <ts-chat-view />
    }
  `,
})
export class Chat {
  private readonly lang = inject(I18n).lang;
  protected readonly keys = computed(() => [this.lang()]);
}
