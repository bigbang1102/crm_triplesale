import { ChangeDetectionStrategy, Component, DestroyRef, Injector, ViewEncapsulation, afterNextRender, inject } from '@angular/core';
import { Router } from '@angular/router';
import { ConfigService } from '@core/config/config.service';
import { startDragScroll } from '@core/dom/drag-scroll';
import { loadSwal } from '@core/dom/swal';
import { I18n } from '@core/i18n/i18n.service';
import { restDepsOf } from '@core/live/rest-deps';
import { PermissionService } from '@core/permissions/permission.service';
import type { ReceiptsBackend } from './receipts-backend';
import { ReceiptsEnv, startReceipts } from './receipts.engine';
import { tsPref } from './ts-pref';

/**
 * The receipt list (`pages/sales_doc_rv_list.xhtml`).
 *
 * The template (`receipts.html`) and stylesheet (`receipts.scss`) are the Java page verbatim; the behaviour is `receipts.engine.ts` (a 1:1
 * port of the page script). This component only hosts them: it gives the engine its environment (what the Facelets page got from the
 * session, the template and the browser), starts the drag-to-scroll of the table (Java: `<script data-targets=".sd2-table-wrap">`) and
 * starts / stops the engine.
 *
 * The backend is chosen here (`backend()`): the fake data in mock mode (`receipts.mock.ts`), the REST services otherwise
 * (`receipts.live.ts`: RvApiServlet → RvApiService, RvDetailNormalizer; the report addresses `/rvreport` and `/rvreceipt` that
 * `window.open` shows in a new tab are `file()` of it — there is no REST endpoint for them yet, see INTEGRATION.md).
 */
@Component({
  selector: 'ts-receipts-view',
  templateUrl: './receipts.html',
  styleUrl: './receipts.scss',
  // the Java CSS / engine rely on global selectors and on HTML strings written by the engine
  encapsulation: ViewEncapsulation.None,
  // whitespace between inline elements is part of the look (Java rendered the markup as written)
  preserveWhitespaces: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  // a page generated from a Java file keeps the cursor its own CSS gives a disabled button (the shell's rule in _base.scss skips it)
  host: { 'data-java-page': '' },
})
export class ReceiptsView {
  protected readonly t = inject(I18n).t;
  private readonly perm = inject(PermissionService);
  private readonly router = inject(Router);
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
   * The backend is its own chunk: the fake data in mock mode (`?mock=<fault>` in the address shows an error / empty state of the screen,
   * see receipts.mock.ts), the REST calls otherwise (a method so that a test can hand in another backend).
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
    const env: ReceiptsEnv = {
      t: (key) => this.t(key),
      can: (features) => this.can(features),
      fetch: (input, init) => backend.fetch(input, init),
      // `window.open(report address, '_blank')`: called inside the click, so the browser lets the tab open
      open: (url, target) => this.openFile(backend, url, target),
      navigate: (route) => void this.router.navigateByUrl(route),
      swal: (options) => this.swal(options),
      pref: tsPref,
      ctx: '',
      // Java never attaches the customer suggestions to this page (its script runs before open_down_select.js is loaded) — see sync-receipts.mjs
      suggestCustomers: false,
    };
    this.stop = startReceipts(env);
    this.stopDragScroll = startDragScroll('.sd2-table-wrap');
  }

  /** a report address becomes the file the backend makes for it (a blob URL); a blob URL of the page itself (the canvas image) is opened as it is */
  private openFile(backend: ReceiptsBackend, url: string, target?: string): WindowProxy | null {
    if (url.startsWith('blob:')) return window.open(url, target ?? '_blank');
    const f = backend.file(url);
    return window.open(URL.createObjectURL(new Blob([f.body as BlobPart], { type: f.type })), target ?? '_blank');
  }

  /** SweetAlert as the Java template loads it — a method so that a test can hand in a stand-in (jsdom loads no scripts) */
  protected swal(options: Record<string, unknown>): Promise<unknown> {
    return loadSwal().then((swal) => swal(options));
  }
}
