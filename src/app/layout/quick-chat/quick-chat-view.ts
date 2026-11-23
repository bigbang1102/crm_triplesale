import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  ViewEncapsulation,
  afterNextRender,
  inject,
} from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { Location } from '@angular/common';
import { NavigationEnd, Router } from '@angular/router';
import { I18n } from '@core/i18n/i18n.service';
import { filter } from 'rxjs';
import type { QuickChatHandle } from './quick-chat.engine';
import { QuickChatService } from './quick-chat.service';

/** the SPA route that renders the chat page in embed mode (features/chat/chat-embed.ts) */
const EMBED_ROUTE = '/chat-embed';
const CHAT_ROUTE = '/chat';

/**
 * The quick chat box (`WEB-INF/pages/quickchat.xhtml`, included by template.xhtml): the floating chat the "แชท" button opens on
 * every page. The Shell renders it once, outside the page content.
 *
 * The template (`quick-chat.html`) and stylesheet (`quick-chat.scss`) are the Java include verbatim; the behaviour is
 * `quick-chat.engine.ts` (a 1:1 port of its script). This component only hosts them: it hands the engine its environment, tells
 * it when the page changed and registers it with `QuickChatService` so the buttons can open it.
 */
@Component({
  selector: 'ts-quick-chat-view',
  templateUrl: './quick-chat.html',
  styleUrl: './quick-chat.scss',
  // the Java CSS targets the button of the side rail (#chatMenuBtn) too, so it cannot be encapsulated
  encapsulation: ViewEncapsulation.None,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class QuickChatView {
  protected readonly t = inject(I18n).t;
  private readonly router = inject(Router);
  private readonly location = inject(Location);
  private readonly service = inject(QuickChatService);
  private handle: QuickChatHandle | undefined;
  private destroyed = false;

  constructor() {
    afterNextRender(() => void this.start());
    this.router.events
      .pipe(
        filter((e) => e instanceof NavigationEnd),
        takeUntilDestroyed(),
      )
      .subscribe(() => this.handle?.pageChanged());
    // the chat page in the box asks for a link to be opened in the main window (`<base target="_top">` in Java)
    const onMessage = (e: MessageEvent) => {
      const url: unknown = e.data?.qcNavigate;
      if (e.origin === window.location.origin && typeof url === 'string' && url.startsWith('/crm/')) void this.router.navigateByUrl(url);
    };
    window.addEventListener('message', onMessage);
    inject(DestroyRef).onDestroy(() => {
      this.destroyed = true;
      window.removeEventListener('message', onMessage);
      if (!this.handle) return;
      this.service.unregister(this.handle);
      this.handle.destroy();
    });
  }

  private async start(): Promise<void> {
    // the engine is its own chunk: the box is on every page, but nobody waits for its script to see the shell
    const { startQuickChat } = await import('./quick-chat.engine');
    if (this.destroyed) return;
    this.handle = startQuickChat({
      embedUrl: this.location.prepareExternalUrl(EMBED_ROUTE),
      onChatPage: () => this.router.url.split(/[?#]/)[0] === CHAT_ROUTE,
      goFull: () => void this.router.navigateByUrl(CHAT_ROUTE),
    });
    this.service.register(this.handle);
  }
}
