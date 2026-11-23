import { ChangeDetectionStrategy, Component, DestroyRef, ElementRef, Injector, ViewEncapsulation, afterNextRender, inject } from '@angular/core';
import { Router } from '@angular/router';
import { ConfigService } from '@core/config/config.service';
import { startDragScroll } from '@core/dom/drag-scroll';
import { loadSwal } from '@core/dom/swal';
import { I18n } from '@core/i18n/i18n.service';
import { restDepsOf } from '@core/live/rest-deps';
import { PermissionService } from '@core/permissions/permission.service';
import type { ReceiptsBackend } from './receipts-backend';
import { ReceiptFormEnv, startReceiptForm } from './receipt-form.engine';

/**
 * The receipt form (`pages/sales_doc_rv.xhtml`).
 *
 * The template (`receipt-form.html`) and stylesheet (`receipt-form.scss`) are the Java page verbatim; the behaviour is
 * `receipt-form.engine.ts` (a 1:1 port of the page script). This component only hosts them: it gives the engine its environment (what the
 * Facelets page got from the session, the template and the URL), starts the drag-to-scroll of the line table (Java:
 * `<script data-targets=".rv-table-wrap">`), turns the link back to the list into router navigation and starts / stops the engine.
 *
 * The backend is chosen here (`backend()`): the fake data in mock mode (`receipts.mock.ts`), the REST services otherwise
 * (`receipts.live.ts`: RvApiServlet → RvApiService — createAndVerifyJson counts the receipts before and after and reports `verify` —,
 * composed with `/board/lead` (LeadDetailServlet), `/board/prospect` (ProspectDetailServlet) and `/board/prospect-list`
 * (ProspectListServlet) of `core/live`).
 */
@Component({
  selector: 'ts-receipt-form-view',
  templateUrl: './receipt-form.html',
  styleUrl: './receipt-form.scss',
  // the Java CSS / engine rely on global selectors and on HTML strings written by the engine
  encapsulation: ViewEncapsulation.None,
  // whitespace between inline elements is part of the look (Java rendered the markup as written)
  preserveWhitespaces: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  // data-java-page: a page generated from a Java file keeps the cursor its own CSS gives a disabled button (the shell's rule in _base.scss skips it)
  host: { '(click)': 'onClick($event)', 'data-java-page': '' },
})
export class ReceiptFormView {
  protected readonly t = inject(I18n).t;
  private readonly perm = inject(PermissionService);
  private readonly router = inject(Router);
  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef);
  private readonly mock = inject(ConfigService).value.mock;
  private readonly injector = inject(Injector);
  private stop: (() => void) | undefined;
  private stopDragScroll: (() => void) | undefined;
  private destroyed = false;

  constructor() {
    afterNextRender(() => void this.start());
    inject(DestroyRef).onDestroy(() => {
      this.destroyed = true;
      this.stop?.();
      this.stopDragScroll?.();
    });
  }

  /** `commonBean.hasFeature('A,B')` of the template (`ui:fragment rendered`) */
  protected can(features: string): boolean {
    return this.perm.has(features);
  }

  /**
   * The backend is its own chunk: the fake data in mock mode (`?mock=<fault>` in the address shows an error state of the screen, see
   * receipts.mock.ts), the REST calls otherwise (a method so that a test can hand in another backend).
   */
  protected async backend(): Promise<ReceiptsBackend> {
    if (this.mock) {
      const fault = new URLSearchParams(window.location.search).get('mock') ?? '';
      return (await import('./receipts.mock')).createMockReceipts({ delayMs: 150, fault });
    }
    return (await import('./receipts.live')).createLiveReceipts(restDepsOf(this.injector));
  }

  private async start(): Promise<void> {
    const backend = await this.backend();
    if (this.destroyed) return;
    const env: ReceiptFormEnv = {
      t: (key) => this.t(key),
      can: (features) => this.can(features),
      fetch: (input, init) => backend.fetch(input, init),
      // Java read the query string of the page itself (leadId, activityGroupId, listMaterialId)
      // the address says ?opportunityId=; the generated engine reads ?leadId= (the old address still works)
      search: window.location.search.replace(/([?&])opportunityId=/, '$1leadId='),
      navigate: (route) => void this.router.navigateByUrl(route),
      swal: (options) => this.swal(options),
      ctx: '',
    };
    this.stop = startReceiptForm(env);
    this.stopDragScroll = startDragScroll('.rv-table-wrap');
  }

  /** SweetAlert as the Java template loads it — a method so that a test can hand in a stand-in (jsdom loads no scripts) */
  protected swal(options: Record<string, unknown>): Promise<unknown> {
    return loadSwal().then((swal) => swal(options));
  }

  /** `<a href="/sales/receipts">` (the link back to the list) → router navigation (no full reload) */
  protected onClick(event: MouseEvent): void {
    if (event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
    const anchor = (event.target as HTMLElement).closest<HTMLAnchorElement>('a[href^="/sales/"]');
    if (!anchor || anchor.target === '_blank' || !this.host.nativeElement.contains(anchor)) return;
    event.preventDefault();
    void this.router.navigateByUrl(anchor.getAttribute('href') ?? '/');
  }
}
