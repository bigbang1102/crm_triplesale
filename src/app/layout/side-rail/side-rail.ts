import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import { I18n } from '@core/i18n/i18n.service';
import { NavService, RailView } from '@core/navigation/nav.service';
import { QuickChatService } from '../quick-chat/quick-chat.service';

/**
 * Left module switcher: 68 px, always visible, no collapse (same as the Java "slim-plus" menu).
 * Geometry is taken from groupedMenu.xhtml measured in a browser: logo cell 80 px, items 66 px high
 * with an 8 px gap, 20 px icon on a 25 px line box + 8 px + label, chat button pinned to the bottom.
 */
@Component({
  selector: 'ts-side-rail',
  imports: [RouterLink],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <nav class="rail" [attr.aria-label]="t('app.nav.main')">
      <ul class="group">
        @for (item of top(); track item.id) {
          <li>
            @if (item.logo) {
              <a
                class="logo"
                [class.disabled]="!item.enabled"
                [routerLink]="item.enabled ? item.route : null"
                [attr.aria-disabled]="!item.enabled"
                aria-label="Triple Sale"
              >
                <img src="assets/images/logo.png" alt="" width="45" height="45" />
              </a>
            } @else {
              <a class="cell" [routerLink]="item.route" [class.active]="nav.isRailActive(item)" [attr.aria-current]="nav.isRailActive(item) ? 'page' : null">
                <span class="ico">
                  <img class="n" [src]="icon(item.icon)" alt="" />
                  <img class="a" [src]="icon(item.iconActive ?? item.icon)" alt="" />
                </span>
                <span class="label">{{ label(item) }}</span>
              </a>
            }
          </li>
        }
      </ul>

      @for (item of bottom(); track item.id) {
        <a id="chatMenuBtn" class="cell chat" [href]="item.route" (click)="onChatClick($event, item.route)" [class.active]="nav.isRailActive(item)" [attr.aria-current]="nav.isRailActive(item) ? 'page' : null">
          <span class="chat-btn">
            <img [src]="icon(item.icon)" alt="" width="28" height="28" />
            <span class="chat-label">{{ label(item) }}</span>
          </span>
        </a>
      }
    </nav>
  `,
  styles: `
    .rail {
      position: fixed;
      inset: 0 auto 0 0;
      z-index: var(--ts-z-rail);
      width: var(--ts-rail-w);
      padding-bottom: 40px;
      overflow: hidden auto;
      background: var(--ts-rail-bg);
      color: var(--ts-rail-text);
    }
    .group {
      display: flex;
      flex-direction: column;
      gap: 8px;
      margin: 0;
      padding: 0;
      list-style: none;
    }

    .logo {
      display: flex;
      align-items: center;
      justify-content: center;
      height: 80px;
    }
    .logo img {
      width: 44.923px;
      height: auto;
    }
    .logo.disabled {
      opacity: 0.5;
      pointer-events: none;
    }

    // module cell: 66 px, 2 px left bar, icon + label centred with an 8 px gap
    .cell {
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      gap: 8px;
      height: 66px;
      border-left: 2px solid transparent;
      color: var(--ts-rail-text);
      font-size: var(--ts-fs-small);
      letter-spacing: 0.2px;
      line-height: normal;
      text-align: center;
      text-decoration: none;
      transition:
        background 0.15s,
        color 0.15s;
    }
    .cell:hover,
    .cell.active {
      border-left-color: var(--ts-accent);
      background: var(--ts-accent-soft);
      color: var(--ts-accent);
    }

    // icon sits on a 25 px line box (20 px image + descender) exactly like the inline <i> in Java
    .ico {
      display: block;
      width: 20px;
      height: 25px;
    }
    .ico img {
      display: block;
      width: 20px;
      height: 20px;
    }
    .ico .a {
      display: none;
    }
    .cell:hover .ico .n,
    .cell.active .ico .n {
      display: none;
    }
    .cell:hover .ico .a,
    .cell.active .ico .a {
      display: block;
    }

    // chat button pinned to the bottom edge; label stays white on hover (Java: #FFFFFF !important)
    .cell.chat {
      position: absolute;
      bottom: 0;
      left: 0;
      width: var(--ts-rail-w);
      cursor: pointer;
    }
    .chat-btn {
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      width: 100%;
    }
    .chat-btn img {
      display: block;
    }
    .chat-label {
      color: #fff;
      font-size: var(--ts-fs-0);
      letter-spacing: var(--ts-letter-spacing);
      line-height: 20px;
    }
    .cell.chat.active {
      border-left-color: transparent;
      background: transparent;
    }
    .cell.chat.active:hover {
      border-left-color: var(--ts-accent);
      background: var(--ts-accent-soft);
    }
    .cell.chat.active .chat-btn {
      width: 100%;
      padding: 6px 4px 4px;
      border-radius: 10px;
      background: rgba(255, 255, 255, 0.18);
    }
    .cell.chat.active img {
      filter: brightness(1.4);
    }

    // ≤ 992px: the rail shrinks to 60px but, as in Java, the pinned chat button keeps its 68px box (the icon
    // stays centred in 68, 4px right of the other items) and the rail no longer clips it
    @media (max-width: 992px) {
      .rail {
        width: 60px;
        overflow: visible;
      }
    }
  `,
})
export class SideRail {
  protected readonly nav = inject(NavService);
  protected readonly t = inject(I18n).t;
  private readonly quickChat = inject(QuickChatService);
  private readonly router = inject(Router);

  protected readonly top = computed(() => this.nav.railItems().filter((i) => i.placement === 'top'));
  protected readonly bottom = computed(() => this.nav.railItems().filter((i) => i.placement === 'bottom'));

  /**
   * The "แชท" button opens the quick chat box (quickchat.xhtml: cbQuickChatGo); where no box takes the click (the full chat page)
   * it is a link to the chat page. It is not a `routerLink`: RouterLink navigates in its own click listener whatever this one
   * decides, so the box could never be closed by the same button.
   */
  protected onChatClick(event: MouseEvent, route: string): void {
    if (event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
    event.preventDefault();
    if (!this.quickChat.toggle()) void this.router.navigateByUrl(route);
  }

  protected icon(name: string): string {
    return name === 'logo' ? 'assets/images/logo.png' : `assets/icons/menu/${name}.svg`;
  }

  protected label(item: RailView): string {
    return item.label ?? (item.labelKey ? this.t(item.labelKey) : '');
  }
}
