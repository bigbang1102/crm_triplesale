import { NgComponentOutlet } from '@angular/common';
import { ChangeDetectionStrategy, Component, Type, computed, effect, inject, input, signal, untracked } from '@angular/core';
import { Router } from '@angular/router';
import { ConfigService } from '@core/config/config.service';
import { I18n } from '@core/i18n/i18n.service';
import { LiveMissing } from '@shared/ui/live-missing/live-missing';
import { SalesDocDetail } from '../detail/sales-doc-detail';
import { SalesDocType, salesDocType } from '../sales-doc-types';

/** the host of each form is its own lazy chunk (its template, stylesheet and engine): only the form the address names is loaded */
const VIEWS: Record<SalesDocType, () => Promise<Type<unknown>>> = {
  qt: () => import('./sales-doc-qt-view').then((m) => m.SalesDocQtView),
  bk: () => import('./sales-doc-bk-view').then((m) => m.SalesDocBkView),
  ob: () => import('./sales-doc-ob-view').then((m) => m.SalesDocObView),
  aq: () => import('./sales-doc-aq-view').then((m) => m.SalesDocAqView),
  ad: () => import('./sales-doc-ad-view').then((m) => m.SalesDocAdView),
};

/**
 * Sales-document form route (`/sales/docs/:type/:id`) — the forms of the quotation (qt), booking (bk), delivery note (ob), auto-dealer
 * quotation (aq) and auto-dealer booking (ad): pages/sales_doc_<type>_form.xhtml. `FEATURE_CRM_Document`, menu group "งานขาย".
 *
 * `:id` = `new` is the empty form of the type (the Java pages took no id: they are reached from the "create" button of the list). Any other `:id`
 * is the number of a document the mockup kept (sales-doc-store.ts): its detail page (view / edit / delete) instead of the form. A type that is not one of
 * the five has no page in Java (404): the not-found page of the app is shown.
 */
@Component({
  selector: 'ts-sales-doc-form',
  imports: [NgComponentOutlet, LiveMissing, SalesDocDetail],
  changeDetection: ChangeDetectionStrategy.OnPush,
  // a new view instance = a fresh page (Java: location.reload() on a language switch)
  template: `
    @if (live) {
      <ts-live-missing />
    } @else if (savedNo(); as no) {
      <ts-sales-doc-detail [type]="docType() || 'qt'" [no]="no" />
    } @else {
      @if (view(); as v) {
        @for (n of [epoch() + ':' + docType()]; track n) {
          <ng-container *ngComponentOutlet="v" />
        }
      }
    }
  `,
})
export class SalesDocForm {
  /** route parameters `:type` and `:id` (bound by `withComponentInputBinding`) */
  readonly type = input<string>();
  readonly id = input<string>();
  protected readonly docType = computed(() => salesDocType(this.type()));
  /** `:id` of a saved document (its number); `new` (or none) = the empty form */
  protected readonly savedNo = computed(() => {
    const id = this.id();
    return this.docType() && id && id !== 'new' ? id : '';
  });
  protected readonly epoch = signal(0);
  protected readonly view = signal<Type<unknown> | null>(null);
  /** the real backend is not connected yet (see sales-doc-form-base.ts) */
  protected readonly live = !inject(ConfigService).value.mock;
  private readonly router = inject(Router);

  constructor() {
    // the form of the type (a lazy chunk); an unknown type = no such page
    effect(() => {
      const t = this.docType();
      untracked(() => {
        if (!t) {
          this.view.set(null);
          void this.router.navigate(['/not-found'], { skipLocationChange: true });
          return;
        }
        void VIEWS[t]().then((c) => {
          if (this.docType() === t) this.view.set(c);
        });
      });
    });
    // Java reloads the page on a language switch: the texts of the script are read from the bundle once, when it renders
    const i18n = inject(I18n);
    let first = true;
    effect(() => {
      i18n.lang();
      untracked(() => (first ? (first = false) : this.epoch.update((n) => n + 1)));
    });
  }
}
