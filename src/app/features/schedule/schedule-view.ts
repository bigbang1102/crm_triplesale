import { ChangeDetectionStrategy, ChangeDetectorRef, Component, DestroyRef, Injector, ViewEncapsulation, inject, output } from '@angular/core';
import { Router } from '@angular/router';
import { AuthService } from '@core/auth/auth.service';
import { ConfigService } from '@core/config/config.service';
import { loadSwal } from '@core/dom/swal';
import { I18n } from '@core/i18n/i18n.service';
import { restDepsOf } from '@core/live/rest-deps';
import { javaLinkToRoute } from '@core/navigation/java-links';
import type { AccessButtonCode } from '@core/permissions/access-buttons';
import { PermissionService } from '@core/permissions/permission.service';
import type { ScheduleBackend } from './schedule-backend';
import { ScheduleEnv, startSchedule } from './schedule.engine';

/**
 * The Schedule screen (`pages/schedule.xhtml` + `components/work_modal.xhtml`, page=schedule).
 *
 * The template (`schedule.html`) and stylesheet (`schedule.scss`) are the Java page verbatim (with the work modal spliced in where Java
 * included it); the behaviour is `schedule.engine.ts` (a 1:1 port of the page script, of the modal script and of the filter dialog
 * script). This component only hosts them: it loads the first-paint value the Java server rendered with EL
 * (`ScheduleView.savedFilterJson`), gives the engine its environment (what the Facelets page got from the session, the roles and the
 * browser) and starts / stops it. The engine edits the template's DOM, so "load the page again" (the work modal ends a save with
 * `location.reload()`; Java also reloads on a language switch) is a NEW instance of this component: it asks its parent (`reload`).
 *
 * BACKEND: the sample data in mock mode (`schedule.mock.ts`), the REST services otherwise (`schedule.live.ts`: the servlets of the Java page
 * and `ScheduleView.savedFilterJson`, done in the browser; the filter state the Java server kept in the HttpSession is in the sessionStorage
 * of the tab). Not a route any more: `../docproxy?url=` (an `http://` picture of the file server fetched on the server) — `env.docProxy`
 * gives the address back as it is (INTEGRATION.md).
 */
@Component({
  selector: 'ts-schedule-view',
  templateUrl: './schedule.html',
  styleUrl: './schedule.scss',
  // the Java CSS / engine rely on global selectors and on HTML strings written by the engine
  encapsulation: ViewEncapsulation.None,
  // a page generated from a Java file: the shell's `button:disabled { cursor: not-allowed }` (styles/_base.scss) does not apply inside it
  host: { 'data-java-page': '' },
  // whitespace between inline elements is part of the look (Java rendered the markup as written)
  preserveWhitespaces: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ScheduleView {
  /** `{{ t('label.contracts.filter_all') }}` — commonBean.msg['…'] */
  protected readonly t = inject(I18n).t;
  /** `@if (access('PL-SC-CL-03'))` — the button registry (core/permissions/access-buttons.ts) */
  protected readonly access = (code: AccessButtonCode): boolean => this.perm.canUse(code);

  private readonly i18n = inject(I18n);
  private readonly auth = inject(AuthService);
  private readonly perm = inject(PermissionService);
  private readonly router = inject(Router);
  private readonly cdr = inject(ChangeDetectorRef);
  private readonly mock = inject(ConfigService).value.mock;
  private readonly injector = inject(Injector);
  private stop: (() => void) | undefined;
  private destroyed = false;

  /** location.reload() of the page: the parent replaces this component by a fresh one */
  readonly reload = output<void>();

  constructor() {
    void this.start();
    inject(DestroyRef).onDestroy(() => {
      this.destroyed = true;
      this.stop?.();
    });
  }

  private async start(): Promise<void> {
    const backend = await this.backend();
    const initial = await backend.initial();
    if (this.destroyed) return;

    // the texts of the template first, then the engine (it binds to the DOM the template has now)
    this.cdr.detectChanges();

    const session = this.auth.session();
    const env: ScheduleEnv = {
      t: (key) => this.i18n.t(key),
      fetch: (input, init) => backend.fetch(String(input), init),
      ctx: '',
      can: (feature) => this.perm.has(feature),
      access: (code) => this.perm.canUse(code as AccessButtonCode),
      myEmployeeId: session?.employeeId == null ? '' : String(session.employeeId),
      initial: (name) => (initial as unknown as Record<string, unknown>)[name] ?? null,
      // navigator.sendBeacon('/board/schedule-filter-state', json): fire and forget
      beacon: (url, body) => void backend.fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body }),
      docProxy: (url) => url,
      // 'lead_detail.face?pid=1&page_id=3&act=3&param_lead_id=7&activityGroupId=101' → /crm/opportunities/7?activityGroupId=101
      navigate: (javaLink) => this.navigate(javaLink),
      reload: () => this.reload.emit(),
      swal: (options) => this.swal(options),
      href: (javaLink) => javaLinkToRoute(javaLink) ?? javaLink,
      assetBase: 'assets/',
    };
    if (this.destroyed) return;
    this.stop = startSchedule(env);
  }

  /** the backend is its own chunk: the sample data in mock mode, the REST calls otherwise (a method so that a test can hand in another backend) */
  protected async backend(): Promise<ScheduleBackend> {
    if (this.mock) return (await import('./schedule.mock')).createMockSchedule();
    return (await import('./schedule.live')).createLiveSchedule(restDepsOf(this.injector));
  }

  /** `window.location.href = 'lead_detail.face?…'` of the Java page */
  protected navigate(javaLink: string): void {
    const route = javaLinkToRoute(javaLink);
    if (route) void this.router.navigateByUrl(route);
  }

  /** SweetAlert as the Java template loads it — a method so that a test can hand in a stand-in (jsdom loads no scripts) */
  protected swal(options: Record<string, unknown>): Promise<unknown> {
    return loadSwal().then((swal) => swal(options));
  }
}
