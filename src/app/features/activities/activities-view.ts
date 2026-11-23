import { ChangeDetectionStrategy, ChangeDetectorRef, Component, DestroyRef, Injector, ViewEncapsulation, inject, output } from '@angular/core';
import { Router } from '@angular/router';
import { AuthService } from '@core/auth/auth.service';
import { startDragScroll } from '@core/dom/drag-scroll';
import { loadScript } from '@core/dom/load-script';
import { PhoneFormat } from '@core/dom/phone-format.service';
import { loadSwal } from '@core/dom/swal';
import { ConfigService } from '@core/config/config.service';
import { I18n } from '@core/i18n/i18n.service';
import { restDepsOf } from '@core/live/rest-deps';
import { javaLinkToRoute } from '@core/navigation/java-links';
import type { AccessButtonCode } from '@core/permissions/access-buttons';
import { PermissionService } from '@core/permissions/permission.service';
import type { ActivitiesBackend } from './activities-backend';
import { ActivitiesEnv, startActivities } from './activities.engine';

/** TS_PREF of ui_pref.js (localStorage; the Java file also kept a cookie as a second copy — there is no server to read it here) */
const pref = {
  get: (key: string): string => {
    try {
      return localStorage.getItem(key) ?? '';
    } catch {
      return '';
    }
  },
  set: (key: string, value: string): void => {
    try {
      localStorage.setItem(key, value);
    } catch {
      /* blocked storage: the choice is not remembered */
    }
  },
};

/**
 * The Activities screen (`pages/activity.xhtml` + `components/work_modal.xhtml`).
 *
 * The template (`activities.html`) and stylesheet (`activities.scss`) are the Java page verbatim (with the work modal spliced in where
 * Java included it); the behaviour is `activities.engine.ts` (a 1:1 port of the page script and of the modal script). This component only
 * hosts them: it gives the engine its environment (what the Facelets page got from the session, the template and the browser) and
 * starts / stops it. The engine edits the template's DOM, so "reload the page" (the work modal ends a save with it; Java also reloads
 * on a language switch) is a NEW instance of this component: it asks its parent (`reload`).
 *
 * BACKEND: the sample data in mock mode (`activities.mock.ts`), the REST services otherwise (`activities.live.ts`: the servlets of the Java
 * page — ActivityListServlet, ActivityDetailServlet, ContactActivitiesServlet, AssignLeadServlet, the master-data servlets, the work
 * modal's schedule writes — done in the browser). One thing the Java server did for the page is the host's decision now:
 * `../docproxy?url=` (an `http://` picture of the file server, fetched on the server so that an https page may show it) —
 * `env.docProxy` gives the address back as it is: the picture loads from the file server itself (INTEGRATION.md).
 */
@Component({
  selector: 'ts-activities-view',
  templateUrl: './activities.html',
  styleUrl: './activities.scss',
  // the Java CSS / engine rely on global selectors and on HTML strings written by the engine
  encapsulation: ViewEncapsulation.None,
  // a page generated from a Java file: the shell's `button:disabled { cursor: not-allowed }` (styles/_base.scss) does not apply inside it
  host: { 'data-java-page': '' },
  // whitespace between inline elements is part of the look (Java rendered the markup as written)
  preserveWhitespaces: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ActivitiesView {
  protected readonly t = inject(I18n).t;
  /** commonBean.hasFeature('…') of the template (`<ui:fragment rendered>`) */
  protected readonly can = (feature: string): boolean => this.perm.has(feature);
  /** `@if (access('PL-CA-LS-01'))` — the button registry (core/permissions/access-buttons.ts): the magnifier and the funnel of the top bar */
  protected readonly access = (code: AccessButtonCode): boolean => this.perm.canUse(code);

  private readonly perm = inject(PermissionService);
  private readonly auth = inject(AuthService);
  private readonly router = inject(Router);
  private readonly i18n = inject(I18n);
  private readonly phone = inject(PhoneFormat);
  private readonly cdr = inject(ChangeDetectorRef);
  private readonly mock = inject(ConfigService).value.mock;
  private readonly injector = inject(Injector);
  private stop: (() => void) | undefined;
  private stopDrag: (() => void) | undefined;
  private destroyed = false;

  /** location.reload() of the page: the parent replaces this component by a fresh one */
  readonly reload = output<void>();

  constructor() {
    void this.start();
    inject(DestroyRef).onDestroy(() => {
      this.destroyed = true;
      this.stop?.();
      this.stopDrag?.();
    });
  }

  private async start(): Promise<void> {
    const [backend] = await Promise.all([this.backend(), this.loadHelpers()]);
    if (this.destroyed) return;
    // the template is static (messages, permissions); the engine binds to the DOM it has now
    this.cdr.detectChanges();
    // template.xhtml loads phone_format.js for every page: TsPhone is the instance of the shell (DomGuards) — make sure it is there
    const w = window as unknown as { TsPhone?: unknown };
    w.TsPhone ??= this.phone.api;

    const env: ActivitiesEnv = {
      t: (key) => this.i18n.t(key),
      fetch: (input, init) => backend.fetch(String(input), init),
      ctx: '',
      can: (feature) => this.perm.has(feature),
      access: (code) => this.perm.canUse(code as AccessButtonCode),
      myEmployeeId: String(this.auth.session()?.employeeId ?? ''),
      pref,
      docProxy: (url) => url,
      navigate: (javaLink) => this.navigate(javaLink),
      reload: () => this.reload.emit(),
      swal: (options) => this.swal(options),
      href: (javaLink) => javaLinkToRoute(javaLink) ?? javaLink,
      assetBase: 'assets/',
    };
    // drag_scroll.js (data-targets=".ac-table-scroll"), loaded in the head of the Java page
    this.stopDrag = startDragScroll('.ac-table-scroll');
    this.stop = startActivities(env);
  }

  /** the scripts the Java page includes itself (copied byte for byte to public/assets/java-js/) */
  private loadHelpers(): Promise<unknown> {
    return loadScript('assets/java-js/step_group_color.js');
  }

  /** the backend is its own chunk: the sample data in mock mode, the REST calls otherwise (a method so that a test can hand in another backend) */
  protected async backend(): Promise<ActivitiesBackend> {
    if (this.mock) return (await import('./activities.mock')).createMockActivities();
    return (await import('./activities.live')).createLiveActivities(restDepsOf(this.injector));
  }

  /** `location.href = 'lead_detail.face?…'` of the Java page */
  protected navigate(javaLink: string): void {
    const route = javaLinkToRoute(javaLink);
    if (route) void this.router.navigateByUrl(route);
  }

  /** SweetAlert as the Java template loads it — a method so that a test can hand in a stand-in (jsdom loads no scripts) */
  protected swal(options: Record<string, unknown>): Promise<unknown> {
    return loadSwal().then((swal) => swal(options));
  }
}
