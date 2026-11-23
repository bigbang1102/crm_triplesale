import { ChangeDetectionStrategy, Component, DestroyRef, ElementRef, ViewEncapsulation, afterNextRender, inject, input } from '@angular/core';
import { Router } from '@angular/router';
import { startDragScroll } from '@core/dom/drag-scroll';
import { loadSwal } from '@core/dom/swal';
import { I18n } from '@core/i18n/i18n.service';
import { PermissionService } from '@core/permissions/permission.service';
import { DialogService } from '@shared/ui/notify/dialog.service';
import { ToastService } from '@shared/ui/notify/toast.service';
import { deleteSalesDoc } from '../sales-doc-store';
import { salesDocType, type SalesDocType } from '../sales-doc-types';
import type { SalesDocListBackend } from './sales-doc-list-backend';
import { attachRowActions } from './sales-doc-list-actions';
import { SalesDocListEnv, startSalesDocList } from './sales-doc-list.engine';

/**
 * The list of the sales documents (`pages/sales_doc_type_list.xhtml`): quotation · booking · delivery note · auto-dealer quotation · auto-dealer
 * booking (`docKey`), or — for any other type — the legacy list (`components/sales_doc_list_legacy.xhtml`).
 *
 * The template (`sales-doc-list.html`) and stylesheet (`sales-doc-list.scss`) are the Java page verbatim; the behaviour is
 * `sales-doc-list.engine.ts` (a 1:1 port of the page scripts). This component only hosts them: it gives the engine its environment (what the
 * Facelets page got from the session, the template and the URL), starts the drag-to-scroll of the table (Java: `<script data-targets=".sd2-table-wrap">`),
 * turns the links to the forms into router navigation and starts / stops the engine.
 *
 * LIVE ADAPTER (not built yet — the parent shows `ts-live-missing` when `mock` is off): `sales-doc-list-backend.ts` has the one call it
 * has to answer. There is no servlet to port: the Java page has no list API yet (it renders no rows).
 */
@Component({
  selector: 'ts-sales-doc-list-view',
  templateUrl: './sales-doc-list.html',
  styleUrl: './sales-doc-list.scss',
  // the Java CSS / engine rely on global selectors and on HTML strings written by the engine
  encapsulation: ViewEncapsulation.None,
  // whitespace between inline elements is part of the look (Java rendered the markup as written)
  preserveWhitespaces: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  // data-java-page: a page generated from a Java file keeps the cursor its own CSS gives a disabled button (the shell's rule in _base.scss skips it)
  host: { '(click)': 'onClick($event)', 'data-java-page': '' },
})
export class SalesDocListView {
  /** the document type of the address: qt | bk | ob | aq | ad, or '' (anything else = the legacy list) */
  readonly docKey = input.required<string>();
  protected readonly t = inject(I18n).t;
  private readonly perm = inject(PermissionService);
  private readonly router = inject(Router);
  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef);
  private stop: (() => void) | undefined;
  private stopDragScroll: (() => void) | undefined;
  private stopActions: (() => void) | undefined;
  private readonly dialog = inject(DialogService);
  private readonly toast = inject(ToastService);
  private destroyed = false;

  constructor() {
    afterNextRender(() => void this.start());
    inject(DestroyRef).onDestroy(() => {
      this.destroyed = true;
      this.stop?.();
      this.stopDragScroll?.();
      this.stopActions?.();
    });
  }

  /** `commonBean.hasFeature('A,B')` of the template (`ui:fragment rendered`) */
  protected can(features: string): boolean {
    return this.perm.has(features);
  }

  private async start(): Promise<void> {
    const backend = await this.backend();
    const key = salesDocType(this.docKey());
    const rows = key ? await backend.list(key) : [];
    if (this.destroyed) return;
    const env: SalesDocListEnv = {
      t: (k) => this.t(k),
      swal: (options) => this.swal(options),
      navigate: (route) => void this.router.navigateByUrl(route),
      docKey: key,
      rows,
    };
    this.stop = startSalesDocList(env);
    this.stopDragScroll = startDragScroll('.sd2-table-wrap');
    const body = this.host.nativeElement.querySelector<HTMLElement>('#qmlBody');
    if (body && key) this.stopActions = attachRowActions(body, key, { delete: this.t('app.salesDoc.detail.delete') }, { remove: (no) => this.remove(key, no) });
  }

  /** the backend of the screen (mock mode: the fake one, its own chunk, loaded only here — the parent does not create this view otherwise); a method so that a test can hand in its own */
  protected backend(): Promise<SalesDocListBackend> {
    return import('./sales-doc-list.mock').then((m) => m.createMockSalesDocList());
  }

  /** the delete button of a row: asks, then removes the document the mockup kept */
  private async remove(type: SalesDocType, no: string): Promise<boolean> {
    const ok = await this.dialog.confirm({ title: this.t('app.salesDoc.detail.deleteTitle'), text: `${no} — ${this.t('app.salesDoc.detail.deleteText')}`, danger: true, icon: 'warning' });
    if (!ok || !deleteSalesDoc(type, no)) return false;
    this.toast.success(this.t('app.salesDoc.detail.deleted'));
    return true;
  }

  /** SweetAlert as the Java template loads it — a method so that a test can hand in a stand-in (jsdom loads no scripts) */
  protected swal(options: Record<string, unknown>): Promise<unknown> {
    return loadSwal().then((swal) => swal(options));
  }

  /** `<a href="/sales/docs/qt/new">` (the button that creates a document) → router navigation (no full reload) */
  protected onClick(event: MouseEvent): void {
    if (event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
    const anchor = (event.target as HTMLElement).closest<HTMLAnchorElement>('a[href^="/sales/"]');
    if (!anchor || anchor.target === '_blank' || !this.host.nativeElement.contains(anchor)) return;
    event.preventDefault();
    void this.router.navigateByUrl(anchor.getAttribute('href') ?? '/');
  }
}
