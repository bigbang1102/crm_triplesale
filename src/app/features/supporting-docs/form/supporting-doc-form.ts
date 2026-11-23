import { NgComponentOutlet } from '@angular/common';
import { ChangeDetectionStrategy, Component, type Type, computed, effect, inject, input, signal, untracked } from '@angular/core';
import { Router } from '@angular/router';
import { I18n } from '@core/i18n/i18n.service';
import { supportingActionType, supportingDocType } from '../supporting-doc-types';

/**
 * Supporting-document form route (`/crm/supporting-docs/:type/:id`) — `pages/sales_document_sub_1.xhtml` … `sales_document_sub_7.xhtml`: `:id` is `new`
 * (create) or the id of the document, `?action_type=edit` (the same page with the fields open; anything else with an id is the read-only detail).
 * Families 1 – 6 are one form (six copies of one page); the credit application (7) is the long one and is loaded on its own.
 * `FEATURE_CRM_Document` for the route, `CRM_Document_<Family>_View` for the page (Java: the form is `rendered` only with it).
 */
@Component({
  selector: 'ts-supporting-doc-form',
  imports: [NgComponentOutlet],
  changeDetection: ChangeDetectionStrategy.OnPush,
  // a new view instance = a fresh page (Java: location.reload(), another address)
  template: `
    @if (view(); as v) {
      @for (n of [epoch() + ':' + key()]; track n) {
        <ng-container *ngComponentOutlet="v; inputs: inputs()" />
      }
    }
  `,
})
export class SupportingDocForm {
  /** route parameters `:type` / `:id`, query parameter `action_type` */
  readonly type = input<string>();
  readonly id = input<string>();
  readonly action_type = input<string>();
  protected readonly docType = computed(() => supportingDocType(this.type()));
  protected readonly mode = computed(() => supportingActionType(this.id(), this.action_type()));
  protected readonly epoch = signal(0);
  protected readonly view = signal<Type<unknown> | null>(null);
  protected readonly key = computed(() => `${this.docType()?.slug}/${this.id()}/${this.mode()}`);
  protected readonly inputs = computed(() => ({ type: this.docType(), id: this.id() ?? 'new', actionType: this.mode() }));
  private readonly router = inject(Router);
  /** the two views, loaded when the first form is shown (their templates are big) — a field so that a test can hand in lighter ones */
  protected readonly views = {
    form: (): Promise<Type<unknown>> => import('./supporting-doc-form-view').then((m) => m.SupportingDocFormView),
    form7: (): Promise<Type<unknown>> => import('./supporting-doc-form-7-view').then((m) => m.SupportingDocForm7View),
  };

  constructor() {
    const i18n = inject(I18n);
    let first = true;
    // Java reloads the page on a language switch
    effect(() => {
      i18n.lang();
      untracked(() => (first ? (first = false) : this.epoch.update((n) => n + 1)));
    });
    effect(() => {
      const t = this.docType();
      if (!t) {
        untracked(() => void this.router.navigateByUrl('/crm/supporting-docs', { replaceUrl: true }));
        return;
      }
      void (t.n === 7 ? this.views.form7() : this.views.form()).then((c) => this.view.set(c));
    });
  }
}
