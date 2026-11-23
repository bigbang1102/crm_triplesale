import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  ElementRef,
  ViewEncapsulation,
  afterNextRender,
  effect,
  inject,
  input,
} from '@angular/core';
import { Router } from '@angular/router';
import { AiToolAvailability } from '@core/ai/ai-tool-availability';
import type { OffReason } from '@core/ai/ai-tool-availability.logic';
import { ConfigService } from '@core/config/config.service';
import { I18n } from '@core/i18n/i18n.service';
import { loadSwal } from '@core/dom/swal';
import { PermissionService } from '@core/permissions/permission.service';
import { AuthService } from '@core/auth/auth.service';
import { AI_ADMIN_ROLES, AI_HUB_ROLE } from '@core/permissions/ai-hub-roles';
import { ROLE } from '@core/permissions/roles';
import { OFF_CARD, markMusicVocals, markUnavailableTools } from './ai-hub-availability';
import { applyAiToolPermissions } from './ai-hub-permissions';
import { DialogService } from '@shared/ui/notify/dialog.service';
import { ToastService } from '@shared/ui/notify/toast.service';
import { AiHubEnv, startAiHub } from './ai-hub.engine';

/**
 * One AI HUB screen: the hub home (`tool = ''`) or one of the 13 tools.
 *
 * The template (`ai-hub.html`) and stylesheet (`ai-hub.scss`) are the Java page verbatim; the behaviour is
 * `ai-hub.engine.ts` (a 1:1 port of `ai_hub.js`). This component only hosts them: it hands the engine its
 * environment, turns the in-page links into SPA navigation and tears the engine down on destroy.
 * `AiHub` re-creates this component whenever the tool changes, so each tool starts from a clean DOM
 * (the Java page reloaded on every link).
 */
@Component({
  selector: 'ts-ai-hub-view',
  templateUrl: './ai-hub.html',
  styleUrl: './ai-hub.scss',
  // the Java CSS / engine rely on global selectors (and on a panel appended to <body>)
  encapsulation: ViewEncapsulation.None,
  // whitespace between inline elements is part of the look (Java rendered the markup as written)
  preserveWhitespaces: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { style: 'display:block', '(click)': 'onClick($event)' },
})
export class AiHubView {
  readonly tool = input('');

  private readonly perm = inject(PermissionService);
  private readonly auth = inject(AuthService);
  /** the template's `ui:fragment` switches: Sales & Customer AI needs CRM_Prospect_View, Admin needs one of the AI_ADMIN_* roles */
  protected readonly canViewProspects = this.perm.has(ROLE.prospectView);
  protected readonly canAdmin = this.perm.has(AI_ADMIN_ROLES);
  /** `aihub.https-base-url` / `aihub.claudecode.bedrock-base-url` of the Java config — empty = the service default */
  protected readonly httpsBase = '';
  protected readonly bedrockBase = '';

  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef);
  private readonly availability = inject(AiToolAvailability);
  private readonly t = inject(I18n).t;
  private root: HTMLElement | undefined;
  private readonly config = inject(ConfigService);
  private readonly router = inject(Router);
  private readonly dialog = inject(DialogService);
  private readonly toast = inject(ToastService);
  private stop: (() => void) | undefined;
  private destroyed = false;

  constructor() {
    afterNextRender(() => void this.start());
    // a tool the service cannot run goes grey on the hub home (the answer arrives after the page is drawn)
    effect(() => this.markOff(this.availability.off()));
    effect(() => this.markVocals(this.availability.musicVocals()));
    inject(DestroyRef).onDestroy(() => {
      this.destroyed = true;
      this.stop?.();
    });
  }

  private markOff(off: Readonly<Record<string, OffReason>>): void {
    if (!this.root) return;
    markUnavailableTools(
      this.root,
      off,
      (reason) => this.t(`app.aiHub.off.${reason}`),
      this.t('app.aiHub.off.badge'),
    );
  }

  private markVocals(vocals: boolean): void {
    if (!this.root) return;
    markMusicVocals(this.root, vocals, {
      subtitle: this.t('app.aiHub.music.sungSubtitle'),
      note: this.t('app.aiHub.music.sungNote'),
    });
  }

  private async start(): Promise<void> {
    const root = this.host.nativeElement.querySelector<HTMLElement>('#aihRoot');
    if (!root) return;
    // hub home: only the tools the user may use (AI_*_USE); a tool page itself is guarded by `AiHub`
    applyAiToolPermissions(root, (role) => this.perm.has(role));
    this.root = root;
    this.markOff(this.availability.off());
    this.markVocals(this.availability.musicVocals());
    void this.availability.ensureLoaded();
    const { apiBase, mock, features } = this.config.value;
    // FAST-DEBT(SEC): `/triplesale/aihub` ทำงานได้เฉพาะ dev proxy (tools/aihub-dev-proxy.cjs ถือกุญแจ + ตัวตน + สิทธิ์ admin จาก env) · production ยังไม่มี gateway · ใช้ `fetch` ตรงไม่มี Bearer · ค้นหาลูกค้า (`/board/prospect-list`) ยังไม่มี live · somyot · 2026-11-19
    const api = `${apiBase}/aihub`;

    const env: AiHubEnv = {
      root,
      tool: this.tool(),
      apiBase: api,
      assetBase: 'assets/',
      fetch: (input, init) =>
        fetch(input, {
          credentials: 'same-origin',
          ...init,
          headers: { ...Object.fromEntries(new Headers(init?.headers)), ...this.identityHeaders() },
        }),
      popup: (text, _icon, title) => void this.dialog.alert({ title, text }),
      toast: (text) => this.toast.success(text, 1500),
      confirmDanger: (title, text, okText, cancelText) =>
        this.dialog.confirm({ title, text, okText, cancelText, danger: true }),
    };

    if (mock && !features.aiHubService) {
      // the fake backend is its own chunk: only loaded (and shipped to the browser) when `mock: true`
      const fake = await import('./ai-hub.mock');
      env.fetch = (input, init) => fake.mockAiHubFetch(input, init, api);
      env.fileUrl = fake.mockAiHubFileUrl;
      env.libraryUrl = (id) => fake.mockAiHubLibraryUrl(id);
      if (this.destroyed) return;
    }
    // the engine asks `window.swal` (the real SweetAlert of the Java template) at the moment a dialog is needed and falls back to
    // the browser's confirm() while it is absent, so loading it in the background is enough
    loadSwal().catch(() => undefined);
    this.stop = startAiHub(env);
  }

  /**
   * Who is signed in and what they may administer, for the dev proxy (it passes them to the service as the servlet did; honoured only
   * with AIHUB_CLIENT_IDENTITY=1). A super_admin is also the library / Claude Code admin: `has()` passes every check for it.
   */
  // FAST-DEBT(SEC): ตัวตน/สิทธิ์ admin มาจาก header ที่เบราว์เซอร์ส่ง (ปลอมได้) · ใช้ได้เฉพาะ dev proxy ที่เปิด AIHUB_CLIENT_IDENTITY=1 · production ให้ gateway ตัดสินจาก token (ADR-001) · somyot · 2026-11-21
  private identityHeaders(): Record<string, string> {
    const session = this.auth.session();
    const flag = (role: string) => (this.perm.has(role) ? '1' : '0');
    const headers: Record<string, string> = {
      'X-Ts-Super-Admin': this.perm.isSuperAdmin() ? '1' : '0',
      'X-Ts-Library-Admin': flag(AI_HUB_ROLE.aiLibraryManage),
      'X-Ts-Claude-Code-Admin': flag(AI_HUB_ROLE.aiClaudeCodeManage),
      'X-Ts-Token-Admin': flag(AI_ADMIN_ROLES),
      'X-Ts-Quota-Admin': flag(AI_HUB_ROLE.aiAdminQuotaManage),
      'X-Ts-All-Branch': flag(AI_HUB_ROLE.aiAdminUsageAllBranch),
    };
    if (!session) return headers;
    const text = (value: string | number | null | undefined) =>
      encodeURIComponent(String(value ?? ''));
    headers['X-Ts-Actor'] = text(session.profileName || session.username);
    headers['X-Ts-Actor-Id'] = text(session.employeeCode || session.employeeId);
    headers['X-Ts-Actor-User'] = text(session.username);
    headers['X-Ts-Branch-Id'] = text(session.branch?.id);
    headers['X-Ts-Branch-Code'] = text(session.branch?.code);
    headers['X-Ts-Branch-Name'] = text(session.branch?.name);
    return headers;
  }

  /** `<a href="/ai/hub/...">` inside the page → router navigation (no full reload); file / library links are left alone */
  protected onClick(event: MouseEvent): void {
    // a greyed card (the service cannot run that tool) does nothing
    if ((event.target as HTMLElement).closest(OFF_CARD)) {
      event.preventDefault();
      return;
    }
    if (
      event.defaultPrevented ||
      event.button !== 0 ||
      event.metaKey ||
      event.ctrlKey ||
      event.shiftKey ||
      event.altKey
    )
      return;

    // mock mode: a download link is a blob URL that names the file in its fragment (see ai-hub.mock.ts)
    const download = (event.target as HTMLElement).closest<HTMLAnchorElement>(
      'a[href^="blob:"][href*="#dl="]',
    );
    if (download) {
      event.preventDefault();
      const [url, name] = (download.getAttribute('href') ?? '').split('#dl=');
      const a = document.createElement('a');
      a.href = url;
      a.download = decodeURIComponent(name);
      document.body.append(a);
      a.click();
      a.remove();
      return;
    }

    const anchor = (event.target as HTMLElement).closest<HTMLAnchorElement>(
      'a[href^="/ai/hub"], a[href="/ai/translator"], a[href="/crm/home"]',
    );
    if (!anchor || anchor.target === '_blank') return;
    event.preventDefault();
    void this.router.navigateByUrl(anchor.getAttribute('href') ?? '/');
  }
}
