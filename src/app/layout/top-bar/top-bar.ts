import { ChangeDetectionStrategy, Component, effect, inject, signal } from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import { AiToolAvailability } from '@core/ai/ai-tool-availability';
import { AuthService } from '@core/auth/auth.service';
import { Lang } from '@core/config/app-config';
import { ConfigService } from '@core/config/config.service';
import { ApiLogService } from '@core/http/api-log.service';
import { I18n } from '@core/i18n/i18n.service';
import { MenuLink, TabDef } from '@core/navigation/nav.config';
import { NavService } from '@core/navigation/nav.service';
import { FontStep, PrefsService } from '@core/prefs/prefs.service';
import { badgeText } from '@core/notifications/notification.model';
import { NotificationService } from '@core/notifications/notification.service';
import { DialogService } from '@shared/ui/notify/dialog.service';

type Popup = 'user' | 'lang';

/**
 * Top bar (44 px, sticky) — same boxes as topbar.xhtml + topbar.css: page tabs of the active group on
 * the left; on the right font size A A A, light/dark switch, user menu, language flag and (dev/test)
 * the API "Log" button. The legacy search / notification / change-password controls of the Java top
 * bar are intentionally not ported (they were hidden).
 */
@Component({
  selector: 'ts-top-bar',
  imports: [RouterLink],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './top-bar.html',
  styleUrl: './top-bar.scss',
  host: {
    '(document:keydown.escape)': 'closeAll()',
    '(document:pointerdown)': 'onPointerDown($event)',
  },
})
export class TopBar {
  protected readonly nav = inject(NavService);
  protected readonly prefs = inject(PrefsService);
  protected readonly auth = inject(AuthService);
  protected readonly i18n = inject(I18n);
  protected readonly t = this.i18n.t;
  protected readonly apiLog = inject(ApiLogService);
  protected readonly notifications = inject(NotificationService);
  private readonly dialog = inject(DialogService);
  private readonly aiTools = inject(AiToolAvailability);
  private readonly router = inject(Router);

  private readonly config = inject(ConfigService);
  protected readonly apiLogEnabled = this.config.value.features.apiLog === true;
  protected readonly openTab = signal<string | null>(null);
  protected readonly popup = signal<Popup | null>(null);
  private closeTimer: ReturnType<typeof setTimeout> | undefined;

  protected readonly fontSteps: { step: FontStep; labelKey: string }[] = [
    { step: -1, labelKey: 'app.top.fontSmaller' },
    { step: 0, labelKey: 'app.top.fontNormal' },
    { step: 1, labelKey: 'app.top.fontLarger' },
  ];

  constructor() {
    // the AI HUB menu greys the tools the service cannot run: ask the service once, when that menu is the one on screen
    effect(() => {
      if (this.nav.group() === 'aihub') void this.aiTools.ensureLoaded();
    });
  }

  /** why an AI HUB menu entry cannot be used (the tool is greyed in the menu), or null */
  protected aiOff(item: MenuLink): string | null {
    const tool = /^\/ai\/hub\/([\w-]+)$/.exec(item.route ?? '')?.[1];
    const reason = tool ? this.aiTools.off()[tool] : undefined;
    return reason ? this.t(`app.aiHub.off.${reason}`) : null;
  }

  /** a dropdown's entries with the AI HUB tools the service cannot run (grey) after the usable ones; the order inside each part is kept */
  protected ordered(items: readonly MenuLink[]): readonly MenuLink[] {
    const usable = items.filter((item) => !this.aiOff(item));
    return usable.length === items.length
      ? items
      : [...usable, ...items.filter((item) => this.aiOff(item))];
  }

  protected label(link: MenuLink): string {
    return link.label ?? (link.labelKey ? this.t(link.labelKey) : '');
  }

  protected maskUrl(tab: TabDef): string | null {
    return tab.maskIcon ? `url(assets/icons/topnav/${tab.maskIcon}.svg)` : null;
  }

  /** gradient behind an AI HUB dropdown icon */
  protected badge(item: MenuLink): string | null {
    return item.badge ? `linear-gradient(135deg, ${item.badge[0]}, ${item.badge[1]})` : null;
  }

  protected flag(lang: Lang): string {
    return `assets/images/languages/${lang === 'en' ? 'england' : 'thailand'}.png`;
  }

  // ---- dropdown tabs: open on hover (with a close delay like the Java menu) or on click -----
  protected hoverOpen(id: string): void {
    clearTimeout(this.closeTimer);
    this.openTab.set(id);
  }

  protected hoverClose(): void {
    clearTimeout(this.closeTimer);
    this.closeTimer = setTimeout(() => this.openTab.set(null), 400);
  }

  protected toggleTab(id: string): void {
    clearTimeout(this.closeTimer);
    this.openTab.update((cur) => (cur === id ? null : id));
  }

  protected navigated(): void {
    this.closeAll();
  }

  protected closeAll(): void {
    clearTimeout(this.closeTimer);
    this.openTab.set(null);
    this.popup.set(null);
  }

  protected onPointerDown(event: PointerEvent): void {
    if (!(event.target as HTMLElement).closest('.tab-dd, .popup-wrap')) this.closeAll();
  }

  protected togglePopup(name: Popup): void {
    this.openTab.set(null);
    this.popup.update((cur) => (cur === name ? null : name));
  }

  protected async setLang(lang: Lang): Promise<void> {
    this.popup.set(null);
    await this.i18n.use(lang);
  }

  /** more than one usable company (triplesales-api sign-in): the user may switch at any time */
  protected canSwitchCompany(): boolean {
    return (this.auth.session()?.companyCount ?? 0) > 1;
  }

  protected switchCompany(): void {
    this.popup.set(null);
    // the page of the old company may not exist (or be allowed) in the other one: start from the entry page ("/" goes to the first page the user may open)
    void this.auth.switchCompany('/');
  }

  protected async logout(): Promise<void> {
    this.popup.set(null);
    const ok = await this.dialog.confirm({
      title: this.t('app.logout.title'),
      text: this.t('app.logout.text'),
      okText: this.t('app.logout.confirm'),
      cancelText: this.t('app.common.cancel'),
      danger: true,
    });
    if (ok) await this.auth.logout();
  }

  protected bellBadge(): string {
    return badgeText(this.notifications.unread());
  }

  protected toggleNotifications(): void {
    this.closeAll();
    this.notifications.toggle();
  }

  protected displayName(): string {
    const s = this.auth.session();
    return s?.profileName || s?.username || '';
  }

  protected goHome(): void {
    void this.router.navigateByUrl('/crm/home');
  }
}
