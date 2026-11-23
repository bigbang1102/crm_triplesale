import { ChangeDetectionStrategy, ChangeDetectorRef, Component, DestroyRef, Injector, ViewEncapsulation, inject, output } from '@angular/core';
import { Router } from '@angular/router';
import { AuthService } from '@core/auth/auth.service';
import { ConfigService } from '@core/config/config.service';
import { loadScript } from '@core/dom/load-script';
import { PhoneFormat } from '@core/dom/phone-format.service';
import { I18n } from '@core/i18n/i18n.service';
import { restDepsOf } from '@core/live/rest-deps';
import { javaLinkToRoute } from '@core/navigation/java-links';
import type { AccessButtonCode } from '@core/permissions/access-buttons';
import { PermissionService } from '@core/permissions/permission.service';
import type { OpportunitiesBackend } from './opportunities-backend';
import { OpportunitiesEnv, startOpportunities } from './opportunities.engine';

/**
 * The Opportunities screen (`pages/lead.xhtml`).
 *
 * The template (`opportunities.html`) and stylesheet (`opportunities.scss`) are the Java page verbatim; the behaviour is `opportunities.engine.ts` (a 1:1 port of
 * the five page scripts). This component only hosts them: it loads the first-paint value the Java server rendered with EL
 * (`LeadBoardView.savedFilterJson`), gives the engine its environment (what the Facelets page got from the session, the roles and the
 * browser) and starts / stops it. The engine edits the template's DOM, so "load the page again" is a NEW instance of this component:
 * it asks its parent (`reload`).
 *
 * The backend is chosen here (`backend()`): the sample data in mock mode (`leads.mock.ts`), otherwise the LIVE backend (`leads.live.ts`) that
 * answers the addresses the page asks from REST calls to triplesale-service — what the servlets did on the server (no BFF any more):
 *   GET  /board/leads?viewMode=board|list&…           LeadsBoardServlet → triplesale-service GET /leads (+ place names in the UI language;
 *                                                      `[]` without the role CRM_Lead_View)
 *   GET  /board/master/movement-types?type=LD         MovementTypeServlet → master-data/movement-types/LD (raw envelope)
 *   GET  /board/{tags,sale-groups,provinces,employees} TagsServlet · SaleGroupsServlet · ProvincesServlet · EmployeesServlet
 *   GET  /board/districts?provinceId=                 DistrictsServlet
 *   GET  /board/prospect-list?…&enrich=1              ProspectListServlet (the suggestion card under the search box — prospects module)
 *   GET|POST /board/filter-state                      FilterStateServlet: the HttpSession["ld_filter_state"] → sessionStorage of the tab,
 *                                                      per signed-in user; `initial()` answers `savedFilterJson` from it
 *   POST /board/contact-activities                    ContactActivitiesServlet → POST /leads/{id}/contact-activities (move-step modal)
 *   GET  ../docproxy?url=                             DocProxy (mixed-content image proxy): NOT answered — an `<img src>` is not a `fetch`;
 *                                                      `env.docProxy(url)` hands the engine the address the service gave (INTEGRATION.md)
 */
@Component({
  selector: 'ts-opportunities-view',
  templateUrl: './opportunities.html',
  styleUrl: './opportunities.scss',
  // the Java CSS / engine rely on global selectors and on HTML strings written by the engine
  encapsulation: ViewEncapsulation.None,
  // whitespace between inline elements is part of the look (Java rendered the markup as written)
  preserveWhitespaces: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  // a page generated from a Java file: global rules that are the Angular shell's own (e.g. the not-allowed cursor of a disabled button) stay out of it (styles/_base.scss)
  host: { 'data-java-page': '' },
})
export class OpportunitiesView {
  /** `{{ t('label.contracts.filter_all') }}` — commonBean.msg['…'] */
  protected readonly t = inject(I18n).t;

  private readonly i18n = inject(I18n);
  private readonly auth = inject(AuthService);
  private readonly perm = inject(PermissionService);

  /** `@if (access('PL-OP-LS-01'))` — the button registry (core/permissions/access-buttons.ts): the search icon, "ค้นหา" and the filter funnel */
  protected readonly access = (code: AccessButtonCode): boolean => this.perm.canUse(code);
  private readonly router = inject(Router);
  private readonly phone = inject(PhoneFormat);
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
    const [backend] = await Promise.all([this.backend(), this.loadHelpers()]);
    const initial = await backend.initial();
    if (this.destroyed) return;

    // the texts of the template first, then the engine (it binds to the DOM the template has now)
    this.cdr.detectChanges();
    // phone_format.js is loaded by the page itself in Java, before its script: window.TsPhone (the shell's typed copy of it)
    const w = window as unknown as { TsPhone?: unknown };
    w.TsPhone ??= this.phone.api;

    const session = this.auth.session();
    const env: OpportunitiesEnv = {
      t: (key) => this.i18n.t(key),
      can: (feature) => this.perm.has(feature),
      access: (code) => this.perm.canUse(code as AccessButtonCode),
      employeeId: session?.employeeId == null ? '' : String(session.employeeId),
      fetch: (input, init) => backend.fetch(String(input), init),
      initial: (name) => (initial as unknown as Record<string, unknown>)[name] ?? null,
      ctx: '',
      // navigator.sendBeacon('../board/filter-state', json): fire and forget
      beacon: (url, body) => void backend.fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body }),
      // 'lead_detail.face?pid=1&page_id=3&act=3&param_lead_id=7&activityGroupId=101' → /crm/opportunities/7?activityGroupId=101
      navigate: (url) => {
        const route = javaLinkToRoute(url);
        if (route) void this.router.navigateByUrl(route);
      },
      reload: () => this.reload.emit(),
      // Java: '../docproxy?url=' + encodeURIComponent(url) for a picture at an http(s):// address (the BFF fetched it and served it from the same origin,
      // which is also what kept the browser from blocking http:// pictures on an https page). There is no BFF now: the picture loads from the address
      // the service gave — it works while the file server answers https (or the page itself is on http); see INTEGRATION.md
      docProxy: (url) => url,
    };
    if (this.destroyed) return;
    this.stop = startOpportunities(env);
  }

  /** each backend is its own chunk: the fake one only loads when `mock: true`, the REST one otherwise (a method so that a test can hand in another backend) */
  protected async backend(): Promise<OpportunitiesBackend> {
    if (!this.mock) return (await import('./opportunities.live')).createLiveOpportunities(restDepsOf(this.injector));
    const session = this.auth.session();
    return (await import('./opportunities.mock')).createMockLeads({
      can: (feature) => this.perm.has(feature),
      employeeId: session?.employeeId ?? undefined,
      lang: () => this.i18n.lang(),
    });
  }

  /** `<script src="…/tag_pill_color.js">` of lead.xhtml (copied byte for byte) — a method so that a test can hand in a stand-in (jsdom loads no scripts) */
  protected loadHelpers(): Promise<unknown> {
    return loadScript('assets/java-js/tag_pill_color.js');
  }
}
