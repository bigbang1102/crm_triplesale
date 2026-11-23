import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import { RouterLink } from '@angular/router';
import { I18n } from '@core/i18n/i18n.service';
import { type NotificationItem, badgeText, bangkokDateTime, sectionOf } from '@core/notifications/notification.model';
import { NotificationService } from '@core/notifications/notification.service';

/**
 * The notification panel of the bell (Figma "Notification", 440 px): title + close, the tabs "all / unread" with the unread badge, "mark all read",
 * the date range, then the notifications in two sections — today and earlier. Hover (or focus) on a row shows its two actions: hide and mark read.
 * Opens from the bell of the top bar (`NotificationService.panelOpen`); closes with Escape, a click outside, or the close button.
 */
@Component({
  selector: 'ts-notification-panel',
  imports: [RouterLink],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: {
    '(document:keydown.escape)': 'svc.close()',
    '(document:pointerdown)': 'onPointerDown($event)',
  },
  styles: `
    :host {
      display: contents;
    }
    .panel {
      position: fixed;
      z-index: 1500;
      top: 52px;
      right: 16px;
      width: 440px;
      max-width: calc(100vw - 32px);
      max-height: calc(100vh - 76px);
      display: flex;
      flex-direction: column;
      overflow: hidden;
      background: var(--ts-surface);
      color: var(--ts-text);
      border-radius: 16px;
      box-shadow: 0 2px 6px rgba(0, 0, 0, 0.08), 0 8px 26px rgba(0, 0, 0, 0.12);
    }
    header {
      border-bottom: 1px solid var(--ts-line);
    }
    .title-row {
      display: flex;
      align-items: center;
      justify-content: space-between;
      padding: 16px 16px 8px;
    }
    h2 {
      margin: 0;
      font-size: 18px;
      line-height: 24px;
      font-weight: 700;
    }
    .close {
      width: 32px;
      height: 32px;
      border: 0;
      background: transparent;
      color: inherit;
      border-radius: 50%;
      cursor: pointer;
    }
    .tabs-row {
      display: flex;
      align-items: center;
      justify-content: space-between;
      padding: 8px 16px;
    }
    .tabs {
      display: flex;
      gap: 8px;
    }
    .tab {
      height: 38px;
      display: inline-flex;
      align-items: center;
      gap: 4px;
      padding: 6px 16px;
      border: 1px solid var(--ts-line);
      border-radius: 99px;
      background: transparent;
      color: inherit;
      font: inherit;
      font-weight: 600;
      cursor: pointer;
    }
    .tab.on {
      background: var(--ts-primary);
      border-color: var(--ts-primary);
      color: #fff;
    }
    .badge {
      min-width: 18px;
      height: 18px;
      padding: 0 4px;
      border-radius: 999px;
      background: var(--ts-danger);
      color: #fff;
      font-size: 11px;
      line-height: 18px;
      font-weight: 500;
      text-align: center;
    }
    .mark-all {
      height: 38px;
      padding: 0 12px;
      border: 0;
      border-radius: 6px;
      background: transparent;
      color: var(--ts-primary);
      font: inherit;
      font-weight: 500;
      cursor: pointer;
    }
    .mark-all:disabled {
      color: var(--ts-text-disabled);
      cursor: default;
    }
    .range {
      display: flex;
      align-items: center;
      gap: 8px;
      padding: 16px 16px 8px;
    }
    .range input {
      flex: 1;
      min-width: 0;
      height: 38px;
      padding: 0 10px;
      border: 1px solid var(--ts-border-strong);
      border-radius: 6px;
      background: var(--ts-input-bg);
      color: inherit;
      font: inherit;
    }
    .body {
      flex: 1;
      min-height: 0;
      overflow-y: auto;
      padding-bottom: 8px;
    }
    .section {
      padding: 8px 16px 4px;
      font-weight: 700;
      line-height: 22px;
      color: var(--ts-muted);
    }
    .item {
      position: relative;
      display: flex;
      gap: 16px;
      padding: 16px;
      border-bottom: 1px solid var(--ts-line);
    }
    .item:hover,
    .item:focus-within {
      background: rgba(127, 99, 210, 0.1);
    }
    .icon {
      position: relative;
      flex: none;
      width: 32px;
      height: 32px;
      display: grid;
      place-items: center;
      border: 1px solid var(--ts-line);
      border-radius: 50%;
      color: var(--ts-text-secondary);
    }
    .dot {
      position: absolute;
      top: 0;
      right: -1px;
      width: 8px;
      height: 8px;
      border-radius: 50%;
      background: var(--ts-danger);
    }
    .content {
      flex: 1;
      min-width: 0;
      display: flex;
      flex-direction: column;
      gap: 12px;
    }
    .item h3 {
      margin: 0 0 8px;
      font-size: 14px;
      line-height: 22px;
      font-weight: 700;
    }
    .item p {
      margin: 0;
      line-height: 20px;
    }
    .item p a {
      color: var(--ts-info);
      text-decoration: underline;
    }
    .time {
      display: flex;
      justify-content: flex-end;
      align-items: center;
      gap: 6px;
      font-size: 12px;
      font-weight: 500;
      color: var(--ts-muted);
    }
    .actions {
      display: none;
      flex: none;
      gap: 8px;
      align-self: flex-start;
    }
    .item:hover .actions,
    .item:focus-within .actions {
      display: flex;
    }
    .act {
      position: relative;
      width: 32px;
      height: 32px;
      border: 1px solid var(--ts-line);
      border-radius: 8px;
      background: var(--ts-surface);
      color: inherit;
      cursor: pointer;
      box-shadow: 0 2px 6px rgba(0, 0, 0, 0.2);
    }
    .act:hover::after,
    .act:focus-visible::after {
      content: attr(data-tip);
      position: absolute;
      bottom: calc(100% + 6px);
      left: 50%;
      transform: translateX(-50%);
      padding: 6px 8px;
      border-radius: 6px;
      background: #0a0f1c;
      color: #fff;
      font-size: 12px;
      font-weight: 500;
      white-space: nowrap;
    }
    .empty {
      padding: 32px 16px;
      text-align: center;
      color: var(--ts-muted);
    }
  `,
  template: `
    @if (svc.panelOpen()) {
      <section class="panel" role="dialog" [attr.aria-label]="t('app.notif.title')" aria-modal="false">
        <header>
          <div class="title-row">
            <h2>{{ t('app.notif.title') }}</h2>
            <button type="button" class="close" [attr.aria-label]="t('app.common.close')" [title]="t('app.common.close')" (click)="svc.close()">
              <i class="pi pi-times"></i>
            </button>
          </div>
          <div class="tabs-row">
            <div class="tabs" role="tablist">
              <button type="button" role="tab" class="tab" [class.on]="svc.tab() === 'all'" [attr.aria-selected]="svc.tab() === 'all'" (click)="svc.tab.set('all')">
                {{ t('app.notif.tabAll') }}
              </button>
              <button type="button" role="tab" class="tab" [class.on]="svc.tab() === 'unread'" [attr.aria-selected]="svc.tab() === 'unread'" (click)="svc.tab.set('unread')">
                {{ t('app.notif.tabUnread') }}
                @if (svc.unread() > 0) {
                  <span class="badge">{{ badge(svc.unread()) }}</span>
                }
              </button>
            </div>
            <button type="button" class="mark-all" [disabled]="svc.unread() === 0" (click)="svc.markAllRead()">{{ t('app.notif.markAll') }}</button>
          </div>
        </header>
        <div class="range">
          <label for="notif-from">{{ t('app.notif.range') }}</label>
          <input id="notif-from" type="date" [value]="svc.from()" [attr.aria-label]="t('app.notif.from')" (change)="svc.from.set($any($event.target).value)" />
          <span aria-hidden="true">–</span>
          <input id="notif-to" type="date" [value]="svc.to()" [attr.aria-label]="t('app.notif.to')" (change)="svc.to.set($any($event.target).value)" />
        </div>
        <div class="body">
          @for (group of groups(); track group.section) {
            <div class="section">{{ t(group.section === 'today' ? 'app.notif.today' : 'app.notif.earlier') }}</div>
            @for (n of group.items; track n.id) {
              <article class="item">
                <div class="icon">
                  <i class="pi pi-bell" aria-hidden="true"></i>
                  @if (!svc.isRead(n.id)) {
                    <span class="dot" [attr.aria-label]="t('app.notif.unreadDot')"></span>
                  }
                </div>
                <div class="content">
                  <div>
                    <h3>{{ n.title }}</h3>
                    <p>
                      @for (part of n.body; track $index) {
                        @if (part.link; as to) {
                          <a [routerLink]="to" (click)="open(n)">{{ part.text }}</a>
                        } @else if (part.bold) {
                          <strong>{{ part.text }}</strong>
                        } @else {
                          {{ part.text }}
                        }
                      }
                    </p>
                  </div>
                  <div class="time">
                    <i class="pi pi-clock" aria-hidden="true"></i>
                    <span>{{ when(n) }}</span>
                  </div>
                </div>
                <div class="actions">
                  <button type="button" class="act" [attr.data-tip]="t('app.notif.hide')" [attr.aria-label]="t('app.notif.hide')" (click)="svc.hide(n.id)">
                    <i class="pi pi-eye-slash" aria-hidden="true"></i>
                  </button>
                  <button type="button" class="act" [attr.data-tip]="t('app.notif.markRead')" [attr.aria-label]="t('app.notif.markRead')" [disabled]="svc.isRead(n.id)" (click)="svc.markRead(n.id)">
                    <i class="pi pi-check-square" aria-hidden="true"></i>
                  </button>
                </div>
              </article>
            }
          } @empty {
            <div class="empty">{{ t('app.notif.empty') }}</div>
          }
        </div>
      </section>
    }
  `,
})
export class NotificationPanel {
  protected readonly svc = inject(NotificationService);
  protected readonly t = inject(I18n).t;

  protected readonly groups = computed((): { section: 'today' | 'earlier'; items: NotificationItem[] }[] => {
    const now = new Date();
    const items = this.svc.items();
    const today = items.filter((n) => sectionOf(n, now) === 'today');
    const earlier = items.filter((n) => sectionOf(n, now) === 'earlier');
    return [
      ...(today.length ? [{ section: 'today' as const, items: today }] : []),
      ...(earlier.length ? [{ section: 'earlier' as const, items: earlier }] : []),
    ];
  });

  protected badge(count: number): string {
    return badgeText(count);
  }

  protected when(n: NotificationItem): string {
    return bangkokDateTime(n.at);
  }

  /** a link inside the text: the notification is read once its document is opened */
  protected open(n: NotificationItem): void {
    this.svc.markRead(n.id);
    this.svc.close();
  }

  protected onPointerDown(event: PointerEvent): void {
    if (!this.svc.panelOpen()) return;
    if (!(event.target as HTMLElement).closest('.panel, .bell')) this.svc.close();
  }
}
