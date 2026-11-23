import { ChangeDetectionStrategy, ChangeDetectorRef, Component, DestroyRef, Injector, ViewEncapsulation, inject, input, output } from '@angular/core';
import { Location } from '@angular/common';
import { Router } from '@angular/router';
import { AuthService } from '@core/auth/auth.service';
import { ConfigService } from '@core/config/config.service';
import { loadScript } from '@core/dom/load-script';
import { loadSwal } from '@core/dom/swal';
import { I18n } from '@core/i18n/i18n.service';
import { restDepsOf } from '@core/live/rest-deps';
import { javaLinkToRoute } from '@core/navigation/java-links';
import type { AccessButtonCode } from '@core/permissions/access-buttons';
import { accessInSingleMode } from './opportunity-detail.single-mode';
import { PermissionService } from '@core/permissions/permission.service';
import { ROLE } from '@core/permissions/roles';
import { liveReceiptFile } from '@features/receipts/receipts.live.files';
import type { OpportunityDetailBackend, OpportunityDetailInitial } from './opportunity-detail-backend';
import { OpportunityDetailEnv, startOpportunityDetail } from './opportunity-detail.engine';

/**
 * The Lead detail screen (`pages/lead_detail.xhtml` + the modals of `components/lead_detail/*`, `move_step_modal`, `access_pop`).
 *
 * The template (`opportunity-detail.html`) and stylesheets (`opportunity-detail*.scss`) are the Java page verbatim; the behaviour is
 * `opportunity-detail.engine.ts` (a 1:1 port of the page script and of the scripts of its modals). This component only hosts them: it gives
 * the engine its environment (what the Facelets page got from the session, the template and the URL) and starts / stops it. The
 * engine edits the template's DOM, so "reload the page" (the page's own `location.reload()` after a save; Java also reloads on a
 * language switch) is a NEW instance of this component: it asks its parent (`reload`).
 *
 * The backend is chosen here (`backend()`): the sample data in mock mode (`lead-detail.mock.ts`), otherwise the LIVE backend (`lead-detail.live.ts`),
 * which answers the addresses the page asks (`../board/lead?…`, `../board/lead/close`, `../board/prospect/save` …) from REST calls to
 * triplesale-service — what the servlets did on the server (no BFF any more). Three things of the Java page are not requests the backend can answer
 * and are decided here:
 *   - `env.docProxy(url)`: an `<img src>` of a picture at an http(s):// address pointed at `../docproxy?url=` (the BFF fetched it and served it from the
 *     same origin); there is no BFF now, so the picture loads from the address the service gave (the other pages do the same). The DOWNLOAD of a
 *     document is a `fetch` of the same address and is answered by the live backend (`/docproxy` of `prospect.live.ts`).
 *   - `env.open('../rvreport?txno=…')`: the PDF of a receipt came from the report servlet; there is no REST endpoint for it (INTEGRATION.md). In live mode
 *     the new tab shows the text the receipts page shows for it (`liveReceiptFile`), in the click itself so that the browser lets it open.
 *   - `env.open(url)` for any other address that is not a page of the app (a file) opens it as it is.
 */
@Component({
  selector: 'ts-opportunity-detail-view',
  templateUrl: './opportunity-detail.html',
  // two sheets: web/css/lead_detail.css (+ the Angular adaptation) and web/css/lead_detail_modal.css (+ the dark theme port, the styles of the includes)
  styleUrls: ['./opportunity-detail.scss', './opportunity-detail-modal.scss'],
  // the products are read-only (the trash icon is drawn by the generated script, so it is hidden here, not by a button code)
  styles: `
    ts-opportunity-detail-view img[onclick^='window.ldDeleteMaterial'] {
      display: none;
    }
  `,
  // the Java CSS / engine rely on global selectors and on HTML strings written by the engine
  encapsulation: ViewEncapsulation.None,
  // whitespace between inline elements is part of the look (Java rendered the markup as written)
  preserveWhitespaces: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  // generated from a Java page: the shell's `button:disabled { cursor: not-allowed }` (styles/_base.scss) stays out of it, as in Java
  host: { 'data-java-page': '' },
})
export class OpportunityDetailView {
  protected readonly t = inject(I18n).t;
  protected readonly can = (feature: string): boolean => this.perm.has(feature);
  /** `@if (access('PL-OP-DT-01'))` — the button registry (core/permissions/access-buttons.ts): the pencil of the sales team, "+ เพิ่มพนักงานขาย / ผู้รับผิดชอบ" and "+ เพิ่ม/แก้ไข Tag" */
  protected readonly access = (code: AccessButtonCode): boolean => accessInSingleMode(code, (c) => this.perm.canUse(c));
  /** the one value the server rendered into the markup */
  protected ini: OpportunityDetailInitial = { uploadAcceptExt: '' };

  /** the lead id of the route (Java: ?param_lead_id=) */
  readonly opportunityId = input.required<string>();
  /** the activity group the lead was opened in (Java: &activityGroupId=), '' when none */
  readonly activityGroupId = input<string>('');
  /** location.reload() of the page: the parent replaces this component by a fresh one */
  readonly reload = output<void>();

  private readonly router = inject(Router);
  private readonly location = inject(Location);
  private readonly auth = inject(AuthService);
  private readonly perm = inject(PermissionService);
  private readonly i18n = inject(I18n);
  private readonly cdr = inject(ChangeDetectorRef);
  private readonly mock = inject(ConfigService).value.mock;
  private readonly injector = inject(Injector);
  private stop: (() => void) | undefined;
  private destroyed = false;

  constructor() {
    void this.start();
    inject(DestroyRef).onDestroy(() => {
      this.destroyed = true;
      this.stop?.();
    });
  }

  private async start(): Promise<void> {
    const employeeId = this.auth.session()?.employeeId ?? null;
    const [backend] = await Promise.all([this.backend(employeeId), this.loadLibraries()]);
    const initial = await backend.initial();
    if (this.destroyed) return;

    // the server-rendered value of the template, then the engine (it binds to the DOM the template has now)
    this.ini = initial;
    this.cdr.detectChanges();

    const lead = this.opportunityId();
    const group = this.activityGroupId();
    const env: OpportunityDetailEnv = {
      t: (key) => this.i18n.t(key),
      fetch: (input, init) => backend.fetch(String(input), init),
      can: (feature) => this.perm.has(feature),
      access: (code) => accessInSingleMode(code as AccessButtonCode, (c) => this.perm.canUse(c)),
      lang: this.i18n.lang(),
      employeeId: employeeId == null ? '' : String(employeeId),
      search: `?param_lead_id=${encodeURIComponent(lead)}${group ? `&activityGroupId=${encodeURIComponent(group)}` : ''}`,
      session: storage(),
      swal: (options) => this.swal(options),
      navigate: (url) => void this.router.navigateByUrl(javaLinkToRoute(url) ?? url),
      open: (url, target) => this.open(url, target),
      reload: () => this.reload.emit(),
      replaceQuery: (query) => this.location.replaceState(this.location.path().split('?')[0], query),
      // Java: '../docproxy?url=' + encodeURIComponent(url) for a picture at an http(s):// address (the BFF fetched it and served it from the same origin,
      // which is also what kept the browser from blocking http:// pictures on an https page). There is no BFF now: the picture loads from the address
      // the service gave — it works while the file server answers https (or the page itself is on http); see INTEGRATION.md
      docProxy: (url) => url,
      // the work modal: its "go to lead" link (a Java page link as the URL of its route) and where the icons are served from
      href: (url) => javaLinkToRoute(url) ?? url,
      assetBase: 'assets/',
    };
    if (this.destroyed) return;
    this.stop = startOpportunityDetail(env);
  }

  /** window.open(url, target): a link to a page of the app opens its route, anything else (a PDF servlet, a file) is opened as it is */
  private open(url: string, target?: string): void {
    const route = javaLinkToRoute(url);
    if (!route && !this.mock && /(^|\/)rvreport\?/.test(url)) {
      // no servlet, no REST endpoint for the PDF of a receipt (RvJasperReportServlet): the tab says so, as on the receipts page
      const file = liveReceiptFile(url, this.i18n.lang());
      window.open(URL.createObjectURL(new Blob([file.body as BlobPart], { type: file.type })), target ?? '_blank');
    } else if (!route) {
      window.open(url, target);
    } else if (!target || target === '_self') {
      void this.router.navigateByUrl(route);
    } else {
      window.open(this.router.serializeUrl(this.router.parseUrl(route)), target);
    }
  }

  /** SweetAlert as the Java template loads it — a method so that a test can hand in a stand-in (jsdom loads no scripts) */
  protected swal(options: unknown): Promise<unknown> {
    return loadSwal().then((swal) => swal(options as never));
  }

  /**
   * What the Java page loaded itself or got from the template: attach_file_types.js (a helper script of the page, `TsAttachTypes`, copied
   * byte for byte) and SweetAlert (attach_file_types.js calls the global `swal`, so the library is loaded before the engine starts).
   * A method so that a test can hand in stand-ins (jsdom loads no scripts).
   */
  protected loadLibraries(): Promise<unknown> {
    return Promise.all([loadScript('assets/java-js/attach_file_types.js'), loadSwal()]);
  }

  /** the backend of the page: each is its own chunk — the fake one only loads when `mock: true`, the REST one otherwise (a method so that a test can hand in another) */
  protected async backend(employeeId: number | null): Promise<OpportunityDetailBackend> {
    if (!this.mock) return (await import('./opportunity-detail.live')).createLiveOpportunityDetail(restDepsOf(this.injector));
    return (await import('./opportunity-detail.mock')).createMockLeadDetail({ employeeId, canSeeFinancial: this.perm.has(ROLE.pipelineOpportunityCompanyFinancialData) });
  }
}

/** window.sessionStorage when the browser allows it (private windows / blocked site data throw), else a tab-local stand-in */
function storage(): OpportunityDetailEnv['session'] {
  try {
    const probe = '__ts_probe';
    window.sessionStorage.setItem(probe, '1');
    window.sessionStorage.removeItem(probe);
    return window.sessionStorage;
  } catch {
    const mem = new Map<string, string>();
    return { getItem: (k) => mem.get(k) ?? null, setItem: (k, v) => void mem.set(k, v), removeItem: (k) => void mem.delete(k) };
  }
}
