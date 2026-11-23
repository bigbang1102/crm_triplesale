import { ChangeDetectionStrategy, ChangeDetectorRef, Component, DestroyRef, ElementRef, Injector, ViewEncapsulation, inject } from '@angular/core';
import { Router } from '@angular/router';
import { AuthService } from '@core/auth/auth.service';
import { ConfigService } from '@core/config/config.service';
import { DomGuards } from '@core/dom/dom-guards';
import { startDragScroll } from '@core/dom/drag-scroll';
import { loadScript } from '@core/dom/load-script';
import { loadSwal } from '@core/dom/swal';
import { I18n } from '@core/i18n/i18n.service';
import { retryEmptyOptions } from '@core/live/prospect-options.live';
import { restDepsOf } from '@core/live/rest-deps';
import { javaLinkToRoute } from '@core/navigation/java-links';
import type { AccessButtonCode } from '@core/permissions/access-buttons';
import { PermissionService } from '@core/permissions/permission.service';
import { makeLeadCreateDropdowns } from './opportunity-create-dropdowns';
import { ProspectsBackend, ProspectsInitial } from './prospects-backend';
import { deleteProspectDoc, loadProspectDocs } from './prospects.docs';
import { ProspectsEnv, startProspects } from './prospects.engine';

/**
 * The Prospects screen (`pages/contracts.xhtml` — "ลูกค้าเป้าหมาย").
 *
 * The template (`prospects.html`) and stylesheet (`prospects.scss`) are the Java page verbatim; the behaviour is `prospects.engine.ts` (a 1:1
 * port of the page script). This component only hosts them: it loads the value the server rendered with EL (the `accept` of the file input),
 * gives the engine its environment (what the Facelets page got from the session, the template scripts, JSF and the URL), starts the
 * drag-to-scroll of the table (Java: `<script src=drag_scroll.js data-targets=".ct-table-wrap">`) and stops everything on destroy.
 *
 * Scripts the Java page loads itself: `phone_format.js` (window.TsPhone — the shell provides it), `open_down_select.js` (the shell),
 * `attach_file_types.js` (window.TsAttachTypes — copied byte for byte to assets/java-js/, loaded here) and `lead_create_dropdowns.js` (generated:
 * ./opportunity-create-dropdowns.ts, it fetches through the backend).
 *
 * The backend is chosen here (`backend()`): the sample data in mock mode, `prospects.live.ts` otherwise — the servlets of the Java page
 * (ProspectListServlet/Service, ProspectEnrichServlet, the master-data servlets, LeadCreateServlet, ProspectAttachmentsServlet, DocProxy)
 * answered from REST calls in the browser; the two remote commands of the document tab (ContractView) go through the attachments route.
 */
@Component({
  selector: 'ts-prospects-view',
  templateUrl: './prospects.html',
  styleUrl: './prospects.scss',
  // the Java CSS / engine rely on global selectors and on HTML strings written by the engine
  encapsulation: ViewEncapsulation.None,
  // whitespace between inline elements is part of the look (Java rendered the markup as written)
  preserveWhitespaces: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  // data-java-page: the shell's `button:disabled { cursor: not-allowed }` (styles/_base.scss) stays out of a page generated from Java
  host: { '(click)': 'onClick($event)', 'data-java-page': '' },
})
export class ProspectsView {
  protected readonly t = inject(I18n).t;
  private readonly perm = inject(PermissionService);
  /** `@if (can('CRM_Prospect_Create'))` — commonBean.hasFeature('CRM_Prospect_Create') */
  protected readonly can = (feature: string): boolean => this.perm.has(feature);
  /** `@if (access('PL-PR-LS-01'))` — the button registry (core/permissions/access-buttons.ts): the five buttons of the top bar */
  protected readonly access = (code: AccessButtonCode): boolean => this.perm.canUse(code);
  /** what the server rendered into the page with EL */
  protected ini: ProspectsInitial = { uploadAcceptExt: '' };

  private readonly i18n = inject(I18n);
  private readonly mock = inject(ConfigService).value.mock;
  private readonly injector = inject(Injector);
  private readonly auth = inject(AuthService);
  private readonly router = inject(Router);
  private readonly guards = inject(DomGuards);
  private readonly cdr = inject(ChangeDetectorRef);
  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef);
  private stop: (() => void) | undefined;
  private stopDragScroll: (() => void) | undefined;
  private destroyed = false;

  constructor() {
    // the windows that show the lists (the filter popup, the create-OPP window): opening one asks the empty lists again. Capture phase: before the
    // script of the page reads them
    const retryOnOpen = (e: Event): void => {
      if ((e.target as Element | null)?.closest?.('#ctFilterBtn, .ct-lead-btn')) retryEmptyOptions();
    };
    this.host.nativeElement.addEventListener('click', retryOnOpen, true);
    inject(DestroyRef).onDestroy(() => this.host.nativeElement.removeEventListener('click', retryOnOpen, true));
    void this.start();
    inject(DestroyRef).onDestroy(() => {
      this.destroyed = true;
      this.stop?.();
      this.stopDragScroll?.();
    });
  }

  /** the backend is its own chunk: the sample data in mock mode, the REST calls otherwise (a method so that a test can hand in another backend) */
  protected async backend(): Promise<ProspectsBackend> {
    if (this.mock) return (await import('./prospects.mock')).createMockProspects({ lang: this.i18n.lang() });
    return (await import('./prospects.live')).createLiveProspects(restDepsOf(this.injector));
  }

  /**
   * Live mode only: `window.TsPhone` (the phone numbers) asks the old BFF for its country master (`/triplesale/board/chat-master-data?type=countries`),
   * which does not exist. The only source left, `GET /prospects/options?sets=countries`, has no dial codes or number formats, so nothing is fetched on
   * entering the page: the master is set empty (a number is shown as it came) and no call is made. The countries of the filter popup are asked
   * when the popup is opened. A no-op once the shell does it itself.
   */
  protected seedPhoneCountries(): void {
    const phone = (window as unknown as { TsPhone?: { setCountries?: (list: unknown[]) => unknown } }).TsPhone;
    phone?.setCountries?.([]);
  }

  /** SweetAlert as the Java template loads it — a method so that a test can hand in a stand-in (jsdom loads no scripts) */
  protected swal(options: Record<string, unknown>): Promise<unknown> {
    return loadSwal().then((swal) => swal(options));
  }

  /** `TsAttachTypes` and the SweetAlert it calls — a method so that a test need not load files (jsdom loads no scripts) */
  protected loadHelpers(): Promise<unknown> {
    return Promise.all([loadSwal(), loadScript('assets/java-js/attach_file_types.js')]);
  }

  private async start(): Promise<void> {
    // a new visit: the lists that came empty last time are asked again
    retryEmptyOptions();
    const backend = await this.backend();
    const initial = await backend.initial();
    if (this.destroyed) return;

    // the value the template renders (the `accept` of the file input), then the engine (it binds to the DOM the template has now)
    this.ini = initial;
    this.cdr.detectChanges();
    await this.loadHelpers().catch(() => undefined);
    if (this.destroyed) return;
    // the shell's page scripts (window.TsPhone, odsProspectSuggest, odsEnhance …): started once, a no-op when they already run
    this.guards.start();
    if (!this.mock) this.seedPhoneCountries();
    if (this.destroyed) return;

    const session = this.auth.session();
    const call = (input: string, init?: RequestInit): Promise<Response> => backend.fetch(input, init);
    const env: ProspectsEnv = {
      t: (key) => this.i18n.t(key),
      access: (code) => this.perm.canUse(code as AccessButtonCode),
      can: (role) => this.perm.has(role),
      fetch: (input, init) => call(String(input), init),
      ctx: '',
      swal: (options) => this.swal(options),
      navigate: (javaUrl) => {
        const route = javaLinkToRoute(javaUrl);
        if (route) void this.router.navigateByUrl(route);
      },
      session: { employeeId: String(session?.employeeId ?? ''), username: session?.username ?? '', branchCode: session?.branchCode ?? '' },
      storage: {
        getItem: (key) => {
          try {
            return sessionStorage.getItem(key);
          } catch {
            return null; // storage blocked: the page then does not remember created leads
          }
        },
        setItem: (key, value) => {
          try {
            sessionStorage.setItem(key, value);
          } catch {
            /* storage blocked */
          }
        },
      },
      // the two p:remoteCommand of the document tab (ContractView.panelLoadProspectDocs / panelDeleteProspectDocument)
      docs: { load: (pid) => loadProspectDocs(call, pid), remove: (pid, docNo) => deleteProspectDoc(call, pid, docNo) },
      leadCreateDropdowns: (deps) => makeLeadCreateDropdowns({ ...deps, ctx: '' }),
    };
    if (this.destroyed) return;
    this.stop = startProspects(env);
    // the queues a prospect can be sent to (GET /prospects/options?sets=waitlists): asked in the background on entering the page, kept for the session
    if (!this.mock) void backend.fetch('/board/prospect-options?set=waitlists').catch(() => undefined);
    this.stopDragScroll = startDragScroll('.ct-table-wrap');
  }

  /** `<a href="/crm/…">` of the template (the "add customer" button) → router navigation, no full reload */
  protected onClick(event: MouseEvent): void {
    if (event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
    const anchor = (event.target as HTMLElement).closest<HTMLAnchorElement>('a[href^="/crm/"]');
    if (!anchor || anchor.target === '_blank' || !this.host.nativeElement.contains(anchor)) return;
    event.preventDefault();
    void this.router.navigateByUrl(anchor.getAttribute('href') ?? '/');
  }
}
