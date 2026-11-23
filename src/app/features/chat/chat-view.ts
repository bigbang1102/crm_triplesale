import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  ElementRef,
  ViewEncapsulation,
  afterNextRender,
  inject,
} from '@angular/core';
import { Router } from '@angular/router';
import { AuthService } from '@core/auth/auth.service';
import { ConfigService } from '@core/config/config.service';
import { I18n } from '@core/i18n/i18n.service';
import { PermissionService } from '@core/permissions/permission.service';
import { DialogService } from '@shared/ui/notify/dialog.service';
import { ChatEnv, startChat } from './chat.engine';

/**
 * The Chat screen (`pages/chatbot.xhtml`).
 *
 * The template (`chat.html`) and stylesheet (`chat.scss`) are the Java page verbatim; the behaviour is
 * `chat.engine.ts` (a 1:1 port of the page script). This component only hosts them: it hands the engine its
 * environment (the things the Facelets page got from EL, the template scripts and the server), turns the in-page
 * links into SPA navigation and tears the engine down on destroy. `Chat` re-creates it when the language changes,
 * like the page reload of the Java app.
 */
@Component({
  selector: 'ts-chat-view',
  templateUrl: './chat.html',
  styleUrl: './chat.scss',
  // the Java CSS / engine rely on global selectors and on HTML strings written by the engine
  encapsulation: ViewEncapsulation.None,
  // whitespace between inline elements is part of the look (Java rendered the markup as written)
  preserveWhitespaces: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { '(click)': 'onClick($event)' },
})
export class ChatView {
  /** `{{ t('chat.title') }}` — commonBean.msg['chat.title'] */
  protected readonly t = inject(I18n).t;
  private readonly perm = inject(PermissionService);
  /** `@if (can('Chat_Reply'))` — commonBean.hasFeature('Chat_Reply') */
  protected readonly can = (feature: string): boolean => this.perm.has(feature);

  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef);
  private readonly config = inject(ConfigService);
  private readonly auth = inject(AuthService);
  private readonly i18n = inject(I18n);
  private readonly router = inject(Router);
  private readonly dialog = inject(DialogService);
  private stop: (() => void) | undefined;
  private destroyed = false;

  constructor() {
    afterNextRender(() => void this.start());
    inject(DestroyRef).onDestroy(() => {
      this.destroyed = true;
      this.stop?.();
    });
  }

  private async start(): Promise<void> {
    const root = this.host.nativeElement.querySelector<HTMLElement>('.cb');
    if (!root) return;
    const { apiBase, mock } = this.config.value;
    const session = this.auth.session();

    const env: ChatEnv = {
      root,
      ctx: apiBase,
      lang: this.i18n.lang(),
      employeeId: session?.employeeId ?? '',
      branchId: session?.branch?.id ?? '',
      can: (feature) => this.perm.has(feature),
      t: (key) => this.i18n.t(key),
      fetch: (input, init) => fetch(input, { credentials: 'same-origin', ...init }),
      assetBase: 'assets/',
      confirm: (o) => this.dialog.confirm({ title: o.title, text: o.text, okText: o.ok, cancelText: o.cancel, danger: o.danger }),
      showError: (title, detail) => void this.dialog.alert({ title, text: detail ?? '' }),
    };

    if (mock) {
      // the fake backend (and its fake socket) is its own chunk: only loaded when `mock: true`
      const fake = await import('./chat.mock');
      const session$ = { employeeId: String(env.employeeId), branchId: String(env.branchId) };
      env.fetch = (input, init) => fake.mockChatFetch(input, init, apiBase, session$);
      env.io = fake.mockChatSocket;
      env.fileUrl = fake.mockChatFileUrl;
    } else {
      // FAST-DEBT(API): โหมด live ยิง `${apiBase}/chat-api` · `/board/*` · `/ai-api` + socket.io ที่เป็น URL ของ BFF/Tomcat เดิม ซึ่งไม่มีแล้ว (ADR-001) จึงตอบ 404 · ใช้ `fetch` ตรงจึงไม่มี Bearer จาก bearerInterceptor · เมื่อรู้ URL จริงของ triplesale-chat ให้ต่อผ่าน `config.serviceUrl()` + แนบ token แล้วตัด apiBase · somyot · 2026-11-19
      // Socket.IO client 4.7.5 — the Java page loads the same version from a CDN <script>
      const { io } = await import('socket.io-client');
      env.io = (url, opts) => io(url, opts);
    }
    if (this.destroyed) return;
    this.stop = startChat(env);
  }

  /** `<a href="/crm/…">` written by the engine → router navigation (no full reload); external links are left alone */
  protected onClick(event: MouseEvent): void {
    if (event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
    const anchor = (event.target as HTMLElement).closest<HTMLAnchorElement>('a[href^="/crm/"]');
    if (!anchor || anchor.target === '_blank') return;
    event.preventDefault();
    const url = anchor.getAttribute('href') ?? '/';
    // in the quick chat box (an iframe) a link opens in the main window: `<base target="_top">` of quickchat.xhtml
    if (window.parent !== window) window.parent.postMessage({ qcNavigate: url }, window.location.origin);
    else void this.router.navigateByUrl(url);
  }
}
