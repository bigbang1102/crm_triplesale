import { ChangeDetectionStrategy, Component, DestroyRef, afterNextRender, inject } from '@angular/core';
import { RouterOutlet } from '@angular/router';
import { ConfigService } from '@core/config/config.service';
import { DomGuards } from '@core/dom/dom-guards';
import { AiFab } from './ai-fab/ai-fab';
import { ApiLogWindow } from './api-log/api-log';
import { NotificationPanel } from './notifications/notification-panel';
import { FooterBar } from './footer-bar/footer-bar';
import { QuickChatView } from './quick-chat/quick-chat-view';
import { SideRail } from './side-rail/side-rail';
import { TopBar } from './top-bar/top-bar';

/**
 * Application frame for every signed-in page:
 *
 *   ┌────┬──────────────────────────────┐
 *   │    │ top bar (tabs · prefs · user)│  44 px, sticky
 *   │rail├──────────────────────────────┤
 *   │68px│ <router-outlet/>             │  padding 8 px, bg --ts-content-bg
 *   │    ├──────────────────────────────┤
 *   │    │ footer                       │  30 px, fixed
 *   └────┴──────────────────────────────┘
 */
@Component({
  selector: 'ts-shell',
  imports: [RouterOutlet, SideRail, TopBar, FooterBar, AiFab, QuickChatView, ApiLogWindow, NotificationPanel],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <ts-side-rail />
    <div class="main">
      <ts-top-bar />
      <main class="content" id="crm_main_body_page">
        <router-outlet />
      </main>
    </div>
    <ts-footer-bar />
    <!-- ai_menu.xhtml: the floating AI button + help assistant, outside the page content -->
    <ts-ai-fab />
    <!-- quickchat.xhtml: the floating chat box of the "แชท" button, outside the page content -->
    <ts-quick-chat-view />
    <!-- the panel of the bell in the top bar (Figma "Notification") -->
    <ts-notification-panel />
    <!-- api_log.xhtml: the Log window of the top bar "Log" button (dev / test only: features.apiLog) -->
    @if (apiLog) {
      <ts-api-log />
    }
  `,
  styles: `
    :host {
      display: block;
      min-height: 100vh;
      background: var(--ts-shell-bg);
    }
    .main {
      display: flex;
      flex-direction: column;
      min-height: 100vh;
      // 68px, and 80px at ≤ 992px where the rail is 60px (--ts-main-ml in _tokens.scss; Java does the same)
      margin-left: var(--ts-main-ml);
    }
    .content {
      flex: 1;
      padding: var(--ts-content-pad);
      // keep content clear of the fixed footer
      padding-bottom: calc(var(--ts-content-pad) + var(--ts-footer-h));
      background: var(--ts-content-bg);
    }
  `,
})
export class Shell {
  protected readonly apiLog = inject(ConfigService).value.features.apiLog === true;

  constructor() {
    // no_autofill.js / input_guard.js / phone_format.js — what template.xhtml loads for every signed-in page (not for login)
    const guards = inject(DomGuards);
    afterNextRender(() => guards.start());
    inject(DestroyRef).onDestroy(() => guards.stop());
  }
}
