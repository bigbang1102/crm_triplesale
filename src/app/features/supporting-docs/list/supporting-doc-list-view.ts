import { ChangeDetectionStrategy, ChangeDetectorRef, Component, DestroyRef, ElementRef, Injector, ViewEncapsulation, afterNextRender, inject, input, signal } from '@angular/core';
import { Router } from '@angular/router';
import { ConfigService } from '@core/config/config.service';
import { startDragScroll } from '@core/dom/drag-scroll';
import { restDepsOf } from '@core/live/rest-deps';
import { I18n } from '@core/i18n/i18n.service';
import type { AccessButtonCode } from '@core/permissions/access-buttons';
import { PermissionService } from '@core/permissions/permission.service';
import { PfGrowl } from '@shared/primefaces/pf-growl';
import { loadPrimeFaces, resetPrimeFacesState } from '@shared/primefaces/pf-runtime';
import type { SupportingDocApi } from '../supporting-doc-backend';
import { SupportingListBean } from '../supporting-doc.bean';
import { flash } from '../supporting-doc.flash';
import { SupportingDocService } from '../supporting-doc.service';
import { SUPPORTING_DOC_TYPES, type SupportingDocType, supportingButton, supportingRole } from '../supporting-doc-types';
import { LIST_BINDINGS, LIST_FORM_ID } from './supporting-doc-list.meta';
import { type SupportingDocListEnv, startSupportingDocList } from './supporting-doc-list.engine';

/**
 * One list of the supporting documents (`pages/sales_document.xhtml` and its six copies, `Sales_DocumentView` as its bean).
 *
 * The template (`supporting-doc-list.html`) and stylesheet (`supporting-doc-list.scss`) are the Java page verbatim; the behaviour of the page's scripts is
 * `supporting-doc-list.engine.ts` (a 1:1 port); the behaviour of the bean is `SupportingListBean` (supporting-doc.bean.ts). This component hosts them:
 * it loads the first page of rows before the template exists (the Java server rendered them before the scripts ran), gives the engine its environment,
 * answers the BFF address the script asks for (`/board/sales-document-list`) from the bean, plays the ajax buttons of the page (`ab`, with `upd`
 * re-creating what `update=` named), shows the messages a save left (the growl), starts the drag-to-scroll of the table and turns the links to the
 * form into router navigation.
 */
@Component({
  selector: 'ts-supporting-doc-list-view',
  templateUrl: './supporting-doc-list.html',
  // the order of the Java page: PrimeFaces' own stylesheets, the page's, then what the template says about the widgets
  styleUrls: ['../../../shared/primefaces/pf-theme.scss', './supporting-doc-list.scss', '../../../shared/primefaces/pf-template.scss'],
  // the Java CSS / engine rely on global selectors and on HTML strings written by the engine
  encapsulation: ViewEncapsulation.None,
  // whitespace between inline elements is part of the look (Java rendered the markup as written)
  preserveWhitespaces: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  // data-java-page: a page generated from a Java file keeps the cursor its own CSS gives a disabled button (the shell's rule in _base.scss skips it)
  host: { 'data-java-page': '' },
})
export class SupportingDocListView {
  /** the family of the address */
  readonly type = input.required<SupportingDocType>();
  protected readonly t = inject(I18n).t;
  private readonly perm = inject(PermissionService);
  private readonly router = inject(Router);
  private readonly config = inject(ConfigService);
  private readonly injector = inject(Injector);
  private readonly cdr = inject(ChangeDetectorRef);
  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef);
  /** the template exists once the first page of rows is loaded */
  protected readonly ready = signal(false);
  /** the parts an ajax action re-draws: a counter per id, the template re-creates the block when it changes */
  private readonly updates = signal<Record<string, number>>({});
  protected bean!: SupportingListBean;
  protected cfg!: { slug: string; titleKey: string; view: string; codes: { search: string; add: string; detail: string }; formType: string; subPage: string; acts: number; subId: number };
  private stop: (() => void) | undefined;
  private stopDragScroll: (() => void) | undefined;
  private growl: PfGrowl | undefined;
  private destroyed = false;

  private readonly onAnchorClick = (event: MouseEvent): void => this.onClick(event);

  constructor() {
    afterNextRender(() => void this.start());
    // capture phase: the first cell of a row has `onclick="event.stopPropagation();"` (verbatim from Java), which would hide the click on the row's hidden edit link
    // from a bubbling listener
    this.host.nativeElement.addEventListener('click', this.onAnchorClick, true);
    inject(DestroyRef).onDestroy(() => {
      this.host.nativeElement.removeEventListener('click', this.onAnchorClick, true);
      this.destroyed = true;
      this.stop?.();
      this.stopDragScroll?.();
      this.growl?.destroy();
      resetPrimeFacesState();
    });
  }

  /** PrimeFaces' widget scripts (the growl) — a method so that a test can hand in its own */
  protected loadRuntime(): Promise<void> {
    return loadPrimeFaces();
  }

  /** the backend of the screen: the fake one in mock mode (its own chunk), the REST service otherwise — a method so that a test can hand in its own */
  protected async backend(): Promise<SupportingDocApi> {
    if (this.config.value.mock) return (await import('../supporting-doc.mock')).sharedMockSupportingDocs().api;
    return (await import('../supporting-doc.live')).createLiveSupportingDocApi(restDepsOf(this.injector));
  }

  private async start(): Promise<void> {
    const type = this.type();
    this.cfg = {
      slug: type.slug,
      titleKey: type.titleKey,
      view: supportingRole(type, 'View'),
      // the button registry (PL-<family>-LS-01 … 03): the search icon, "+ เพิ่มใหม่" and "ดูรายละเอียด" of a row
      codes: { search: supportingButton(type, 'LS', 1), add: supportingButton(type, 'LS', 2), detail: supportingButton(type, 'LS', 3) },
      formType: type.formType,
      subPage: type.subPage,
      acts: type.acts,
      subId: type.subId,
    };
    // (the growl is the real PrimeFaces widget: its scripts, loaded once for all the screens of the documents)
    const [api] = await Promise.all([this.backend(), this.loadRuntime()]);
    const svc = new SupportingDocService(api);
    this.bean = new SupportingListBean(type, svc, () => this.cdr.markForCheck());
    // the page is drawn for a user who may see it: Java renders the form only with the View role and the bean's init() runs either way
    await this.bean.init();
    if (this.destroyed) return;
    this.ready.set(true);
    this.cdr.detectChanges();
    this.afterRender();
    // `<p:growl id="sdMessages" life="4000">`: the widget draws its container into <body> when the page starts; the messages a save left (Flash) are shown in it
    this.growl = new PfGrowl({ id: `${LIST_FORM_ID}:sdMessages`, life: 4000, messages: flash.take() });
  }

  /** the scripts of the page run on the DOM the template has now */
  private afterRender(): void {
    this.stop?.();
    const type = this.type();
    const env: SupportingDocListEnv = {
      t: (k) => this.t(k),
      fetch: (input, init) => this.fetchBff(input, init),
      navigate: (route) => void this.router.navigateByUrl(route),
      route: (id, mode) => `/crm/supporting-docs/${type.slug}/${encodeURIComponent(id)}?action_type=${mode}`,
      ctx: '',
      suggestCustomers: false,
      access: (code) => this.access(code),
      cfg: { detail: supportingButton(type, 'LS', 3), formType: type.formType, subPage: type.subPage, acts: type.acts, subId: type.subId, slug: type.slug },
    };
    this.stop = startSupportingDocList(env);
    this.stopDragScroll ??= startDragScroll('.ct-table-wrap');
  }

  /** `@if (access(cfg.codes.add))`: the button registry (core/permissions/access-buttons.ts) — may the user use the button */
  protected access(code: string): boolean {
    return this.perm.canUse(code as AccessButtonCode);
  }

  /** `commonBean.hasFeature('A,B')` of the template (`ui:fragment rendered`) */
  protected can(features: string): boolean {
    return this.perm.has(features);
  }

  /** the counter of an updatable part of the page: it changes when an ajax action named the part in `update=` */
  protected upd(id: string): number {
    return this.updates()[id] ?? 0;
  }

  /** a `<form>` of the page is never posted (the buttons that submit are handled by `ab`) */
  protected onSubmit(event: Event): void {
    event.preventDefault();
  }

  /**
   * `PrimeFaces.ab({s, f, p, u, onco})`: what the ajax buttons of the page do — the form values named by `process` are laid into the bean
   * (a post of the form), the listener of the bean runs, the parts named by `update` are drawn again, then `oncomplete` runs.
   */
  protected async ab(event: Event, _source: string, listener: string | null, update: string | null, process: string | null, oncomplete: string | null, args: readonly unknown[] = []): Promise<void> {
    event.preventDefault();
    if ((event.currentTarget as HTMLElement | null)?.classList.contains('ui-state-disabled')) return;
    this.collect(process);
    if (listener) {
      const bean = this.bean as unknown as Record<string, (...a: unknown[]) => unknown>;
      await bean[listener](...args);
    }
    if (update) {
      this.updates.update((u) => {
        const next = { ...u };
        for (const id of update.split(/\s+/).filter(Boolean)) next[id] = (next[id] ?? 0) + 1;
        return next;
      });
    }
    this.cdr.detectChanges();
    if (oncomplete) {
      // the page's own oncomplete code (e.g. "sdCloseFilter();") — the engine publishes what it calls on window
      new Function('xhr', 'status', 'args', oncomplete)(null, 'success', {});
    }
  }

  /** what `process=` names: the inputs inside it are posted (`@this` posts nothing of the form) */
  private collect(process: string | null): void {
    const ids = (process ?? '').split(/\s+/).filter((p) => p && p !== '@this');
    for (const id of ids) {
      const scope = document.getElementById(id) ?? document.getElementById(`${LIST_FORM_ID}:${id}`);
      if (!scope) continue;
      for (const b of LIST_BINDINGS) {
        const el = document.getElementById(b.id) as HTMLInputElement | null;
        if (el && scope.contains(el)) this.bean.assign(b.el, el.value);
      }
    }
  }

  /** the BFF address `sales_doc_list.js` asks: one page of rows (SalesDocumentListServlet) */
  private async fetchBff(input: string, _init?: RequestInit): Promise<Response> {
    const url = new URL(input, 'http://page.local');
    if (url.pathname !== '/board/sales-document-list') return new Response(JSON.stringify({ status: 404, message: 'no such route' }), { status: 404 });
    const page = Number.parseInt(url.searchParams.get('page') ?? '', 10);
    const perPage = Number.parseInt(url.searchParams.get('perPage') ?? '', 10);
    const type = SUPPORTING_DOC_TYPES.find((x) => x.formType === (url.searchParams.get('formType') ?? '').trim());
    try {
      const result = type ? await this.bean.fetchPageOf(type, Number.isNaN(page) ? 1 : page, Number.isNaN(perPage) ? 20 : perPage) : { items: [], total: 0, page: 1, perPage: 20 };
      return new Response(JSON.stringify({ status: 200, message: 'success', result }), { status: 200, headers: { 'content-type': 'application/json; charset=UTF-8' } });
    } catch {
      return new Response(JSON.stringify({ status: 500, message: 'โหลดรายการเอกสารไม่สำเร็จ' }), { status: 500, headers: { 'content-type': 'application/json; charset=UTF-8' } });
    }
  }

  /** `<a href="/crm/…">` (the add button, the hidden edit link): the router instead of a page load; modifier / middle clicks keep their browser meaning */
  protected onClick(event: MouseEvent): void {
    if (event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
    const anchor = (event.target as HTMLElement).closest<HTMLAnchorElement>('a[href^="/crm/"]');
    if (!anchor || anchor.target === '_blank' || !this.host.nativeElement.contains(anchor)) return;
    event.preventDefault();
    void this.router.navigateByUrl(anchor.getAttribute('href') ?? '/');
  }
}
