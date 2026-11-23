import { ChangeDetectorRef, DestroyRef, Directive, ElementRef, Injector, afterNextRender, inject, input, signal } from '@angular/core';
import { Router } from '@angular/router';
import { ConfigService } from '@core/config/config.service';
import { loadScript } from '@core/dom/load-script';
import { loadSwal } from '@core/dom/swal';
import { restDepsOf } from '@core/live/rest-deps';
import { I18n } from '@core/i18n/i18n.service';
import type { AccessButtonCode } from '@core/permissions/access-buttons';
import { PermissionService } from '@core/permissions/permission.service';
import { PfGrowl } from '@shared/primefaces/pf-growl';
import { startOdsPf } from '@shared/primefaces/ods-pf';
import { loadPrimeFaces, removeDatepickerDiv, resetPrimeFacesState, startWidget, stopWidgets, widgetVarOf } from '@shared/primefaces/pf-runtime';
import { setUploadHandler } from '@shared/primefaces/pf-upload-transport';
import { resolveStoredUrl } from '@core/mockup/mockup-uploads';
import type { BoardFetch, SupportingDocApi } from '../supporting-doc-backend';
import { SupportingFormBean } from '../supporting-doc.bean';
import { flash } from '../supporting-doc.flash';
import { type FacesMessage, viewDate } from '../supporting-doc.logic';
import { SupportingDocService } from '../supporting-doc.service';
import { type SupportingActionType, type SupportingDocType, supportingButton, supportingRole } from '../supporting-doc-types';

/** what the generator took out of the page (`<page>.meta.ts`) */
export interface FormMeta {
  bindings: readonly { id: string; el: string; kind: string }[];
  widgets: readonly { type: string; id: string; widgetVar: string; cfg: Record<string, unknown>; ajax?: { event: string; listener: string; update: string; process: string } }[];
  uploads: readonly { id: string; allowTypes?: string; sizeLimit?: string; multiple: boolean; auto: boolean; sequential: boolean; dropZone?: string; onstart?: string; oncomplete?: string; oncancel?: string; onvalidationfailure?: string; update: string }[];
  remote: readonly { name: string; id: string; listener: string; oncomplete?: string; onerror?: string }[];
  formId: string;
}

/** the environment the generated engine of a form is given (supporting-doc-form[-7].engine.ts: the same members) */
export interface FormEngineEnv {
  t: (key: string) => string;
  swal: (options: Record<string, unknown>) => Promise<unknown>;
  actionType: SupportingActionType;
  docId: () => string;
  goEdit: () => void;
  fetch: (input: string, init?: RequestInit) => Promise<Response>;
  open: (url: string) => void;
  fileUrl: (i: number) => string;
  uploadMaxBytes: number;
  uploadMaxLabel: string;
  hasCustomerSelect: () => boolean;
}

const mb = (bytes: number): string => `${(bytes / 1048576) >= 10 ? Math.round(bytes / 1048576) : Math.round((bytes / 1048576) * 10) / 10} MB`;

/**
 * What the two forms of the supporting documents (`sales_document_sub_1…6.xhtml` and `sales_document_sub_7.xhtml`, `Sales_DocumentView` as the bean)
 * have in common: the host of a generated template.
 *
 * The page of the Java server was: the HTML its renderers wrote, the PrimeFaces widget scripts started by inline `PrimeFaces.cw(…)`, the page's own
 * scripts, and a bean that kept the state between requests (ajax actions, the post of the form). Here:
 *   - the template (generated) is the HTML; the bean is `SupportingFormBean` (supporting-doc.bean.ts);
 *   - the widgets are the real ones (assets/vendor/primefaces), started with the configuration the generator took from the components;
 *   - `collect()` lays the values of the form's controls into the bean — what a post of the form does before a listener runs;
 *   - `ab()` plays the ajax buttons (`PrimeFaces.ab`): collect, listener, the parts named by `update` re-created (and their widgets restarted), `oncomplete`;
 *   - the save is the submit of the hidden `realSaveBtn` (as in Java: the confirmation dialog clicks it); an Enter in a field submits the form the same way;
 *   - the file upload (`p:fileUpload`) is the page's own: choose / drop, validate (type, size), add to the bean one by one, with the page's callbacks;
 *   - what the servlets of the Java side answered to the page's script (`/docattach`, `/board/provinces` …) is `env.fetch`.
 */
@Directive()
export abstract class SupportingDocFormBase {
  readonly type = input.required<SupportingDocType>();
  /** the id of the address: `new` or the id of the document */
  readonly id = input.required<string>();
  readonly actionType = input.required<SupportingActionType>();

  protected readonly t = inject(I18n).t;
  protected readonly perm = inject(PermissionService);
  protected readonly router = inject(Router);
  protected readonly config = inject(ConfigService);
  protected readonly injector = inject(Injector);
  protected readonly cdr = inject(ChangeDetectorRef);
  protected readonly host = inject<ElementRef<HTMLElement>>(ElementRef);

  /** `commonBean.uploadMaxBytes` of the template (the `sizeLimit` of the upload bar, which the widget's client validation reads from the file input) */
  protected readonly env = { uploadMaxBytes: this.config.value.upload.maxBytes };

  protected readonly ready = signal(false);
  protected bean!: SupportingFormBean;
  protected cfg!: { slug: string; titleKey: string; docCode: string; view: string; edit: string; codes: { save: string; upload: string; download: string; delete: string } };
  private readonly updates = signal<Record<string, number>>({});
  private readonly snaps = new Map<string, unknown[]>();
  private stopEngine: (() => void) | undefined;
  private stopOdsPf: (() => void) | undefined;
  private growls: PfGrowl[] = [];
  private widgetVars: string[] = [];
  private widgetIds: string[] = [];
  private destroyed = false;
  private boardFetch: BoardFetch | undefined;
  private objectUrls: string[] = [];
  private readonly disposers: (() => void)[] = [];

  protected abstract readonly meta: FormMeta;
  /** the generated engine of this form */
  protected abstract startEngine(env: FormEngineEnv): () => void;
  /** does the page (the credit application) call the master-data servlets? */
  protected readonly usesBoard: boolean = false;

  constructor() {
    afterNextRender(() => void this.start());
    inject(DestroyRef).onDestroy(() => this.teardown());
  }

  /* ------------------------------------------------------------------------------------------------------------ start / stop */
  /** the backend of the screen: the fake one in mock mode (its own chunk), the REST service otherwise — a method so that a test can hand in its own */
  protected async backend(): Promise<{ api: SupportingDocApi; board: BoardFetch }> {
    if (this.config.value.mock) {
      const m = (await import('../supporting-doc.mock')).sharedMockSupportingDocs();
      return { api: m.api, board: m.board };
    }
    const live = await import('../supporting-doc.live');
    const deps = restDepsOf(this.injector);
    return { api: live.createLiveSupportingDocApi(deps), board: live.createLiveBoardFetch(deps) };
  }

  /** the scripts the Java page loaded: PrimeFaces' widgets and the page's customer-search helper — a method so that a test can hand in its own */
  protected loadRuntime(): Promise<unknown> {
    return Promise.all([loadPrimeFaces(), loadScript('assets/java-js/sd_customer_lazy.js')]);
  }

  /** `yyyy-MM-dd` of today (the local day) */
  protected today(): string {
    const d = new Date();
    const two = (n: number): string => String(n).padStart(2, '0');
    return `${d.getFullYear()}-${two(d.getMonth() + 1)}-${two(d.getDate())}`;
  }

  private async start(): Promise<void> {
    const type = this.type();
    this.cfg = {
      slug: type.slug,
      titleKey: type.titleKey,
      docCode: type.docCode,
      view: supportingRole(type, 'View'),
      edit: supportingRole(type, 'Edit'),
      // the button registry (PL-<family>-DT-01 … 04): save, upload, download of a file, delete of a file
      codes: { save: supportingButton(type, 'DT', 1), upload: supportingButton(type, 'DT', 2), download: supportingButton(type, 'DT', 3), delete: supportingButton(type, 'DT', 4) },
    };
    const [{ api, board }] = await Promise.all([this.backend(), this.loadRuntime()]);
    if (this.destroyed) return;
    this.boardFetch = board;
    this.bean = new SupportingFormBean(type, this.actionType(), new SupportingDocService(api), () => this.cdr.markForCheck(), () => this.today());
    await this.bean.init(this.id() === 'new' ? undefined : this.id());
    if (this.destroyed) return;
    this.ready.set(true);
    this.cdr.detectChanges();
    this.startPage();
  }

  /** what the Java page did once the document was parsed: the widgets, the page's scripts, the remote commands, the upload (`messages`: what the request left for the growl) */
  private startPage(messages: readonly FacesMessage[] = []): void {
    // the part of open_down_select.js that re-skins and patches the PrimeFaces widgets (the shell's port of it leaves them out)
    this.stopOdsPf = startOdsPf({ search: this.t('label.ods.search_ph') });
    this.registerRemoteCommands();
    this.startWidgets(undefined, messages);
    this.stopEngine = this.startEngine(this.engineEnv());
    this.startUploads();
  }

  /** the page's scripts and widgets stopped (the DOM of the template is still there) */
  private stopPage(): void {
    setUploadHandler(undefined);
    this.stopEngine?.();
    this.stopOdsPf?.();
    this.growls.forEach((g) => g.destroy());
    // the dropdown panels the shell's ODS puts into <body> for the page's selects: they would stay behind when the page goes (Java: a page load clears <body>)
    this.host.nativeElement.querySelectorAll<HTMLElement & { _odsList?: HTMLElement }>('.ods-btn').forEach((b) => b._odsList?.remove());
    stopWidgets(this.widgetVars, this.widgetIds);
    removeDatepickerDiv();
    for (const r of this.meta.remote) delete (window as unknown as Record<string, unknown>)[r.name];
    this.disposers.splice(0).forEach((d) => d());
    this.growls = [];
    this.widgetVars = [];
    this.widgetIds = [];
  }

  private teardown(): void {
    this.destroyed = true;
    this.stopPage();
    this.objectUrls.forEach((u) => URL.revokeObjectURL(u));
    resetPrimeFacesState();
  }

  /**
   * What the Java server did when a post stayed on the page: the whole document drawn again from the bean — a new document, so the page's scripts and
   * widgets run on it anew (the dialogs closed, the first tab, the lists of the selects as the bean has them) and the growl shows what the request left.
   */
  private async reloadPage(messages: readonly FacesMessage[]): Promise<void> {
    this.stopPage();
    resetPrimeFacesState(); // (a page load starts PrimeFaces over: the z-index counter, the widgets)
    this.snaps.clear();
    this.updates.set({});
    this.ready.set(false);
    this.cdr.detectChanges();
    this.ready.set(true);
    this.cdr.detectChanges();
    this.startPage(messages);
  }

  private engineEnv(): FormEngineEnv {
    const max = this.config.value.upload.maxBytes;
    return {
      t: (k) => this.t(k),
      swal: (options) => loadSwal().then((swal) => swal(options)),
      actionType: this.actionType(),
      docId: () => (this.id() === 'new' ? '' : this.id()),
      goEdit: () => void this.router.navigate([], { queryParams: { action_type: 'edit' }, queryParamsHandling: 'merge' }),
      fetch: (input, init) => this.fetchBrowser(input, init),
      open: (url) => this.openUrl(url),
      fileUrl: (i) => resolveStoredUrl(this.bean.uploadedFiles[i]?.proxyUrl ?? ''),
      uploadMaxBytes: max,
      uploadMaxLabel: mb(max),
      hasCustomerSelect: () => {
        const w = this.meta.widgets.find((x) => x.widgetVar === 'sdCustomerWv');
        return !!w && !!document.getElementById(w.id);
      },
    };
  }

  /* ------------------------------------------------------------------------------------------------------------ what the template calls */
  /** `@if (access(cfg.codes.save))`: the button registry (core/permissions/access-buttons.ts) — may the user use the button */
  protected access(code: string): boolean {
    return this.perm.canUse(code as AccessButtonCode);
  }

  /** `commonBean.hasFeature('A,B')` of the template (`ui:fragment rendered`) */
  protected can(features: string): boolean {
    return this.perm.has(features);
  }

  /** `f:convertDateTime pattern="dd/MM/yyyy"` of a `yyyy-MM-dd` */
  protected vd(iso: string | null | undefined): string {
    return viewDate(iso);
  }

  /** the options of a list the widget's own script rewrites: the bean's list as it was when the page was drawn */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  protected snap(name: string): any[] {
    let s = this.snaps.get(name);
    if (!s) {
      s = [...((this.bean as unknown as Record<string, unknown[]>)[name] ?? [])];
      this.snaps.set(name, s);
    }
    return s;
  }

  /** the counter of an updatable part of the page: it changes when an ajax action named the part in `update=` */
  protected upd(id: string): number {
    return this.updates()[id] ?? 0;
  }

  /** the form is never posted: a submit is the save (the hidden realSaveBtn) or nothing */
  protected onSubmit(event: Event): void {
    event.preventDefault();
    const submitter = (event as SubmitEvent).submitter as HTMLElement | null;
    if (submitter && submitter.id === `${this.meta.formId}:realSaveBtn`) void this.save();
  }

  /* ------------------------------------------------------------------------------------------------------------ ajax */
  /** lays the controls' values into the bean (a post of the form); `ids` narrows it to the controls inside those elements, none = the whole form */
  protected collect(ids?: readonly string[]): void {
    const scopes = ids?.map((i) => document.getElementById(i)).filter((x): x is HTMLElement => !!x);
    for (const b of this.meta.bindings) {
      const el = document.getElementById(b.id) as HTMLInputElement | HTMLSelectElement | null;
      if (!el) continue; // a control of the other branch of a `rendered`
      if (scopes && !scopes.some((s) => s === el || s.contains(el))) continue;
      this.bean.assign(b.el, b.kind === 'checkbox' ? (el as HTMLInputElement).checked : el.value, b.kind);
    }
  }

  /**
   * `PrimeFaces.ab`: collect → listener → re-create what `update` names → `oncomplete`.
   * `process` is what the request executes: `@this` = the source alone (no input is read), none / `@form` / `@all` = the whole form, else those parts.
   * (PrimeFaces sends the request with jQuery's `global: false`, so the page's `jQuery(document).ajaxComplete(…)` handlers do NOT run after it.)
   */
  protected async ab(event: Event | null, source: string, listener: string | null, update: string | null, process: string | null, oncomplete: string | null, args: readonly unknown[] = []): Promise<void> {
    event?.preventDefault();
    const tokens = (process ?? '').split(/\s+/).filter(Boolean);
    const whole = tokens.length === 0 || tokens.some((t) => t === '@all' || t === '@form');
    this.collect(whole ? undefined : tokens.map((t) => (t === '@this' ? source : t)));
    if (listener) await (this.bean as unknown as Record<string, (...a: unknown[]) => unknown>)[listener](...args);
    await this.redraw(update);
    if (oncomplete) new Function('xhr', 'status', 'args', oncomplete)(null, 'success', {});
  }

  /** the parts of the page named by `update` drawn again, and their widgets started again (what the JSF ajax update does with the DOM it replaces) */
  private async redraw(update: string | null): Promise<void> {
    const ids = (update ?? '').split(/\s+/).filter(Boolean).map((u) => u.split(':').pop() as string);
    if (ids.length) {
      this.updates.update((u) => {
        const next = { ...u };
        for (const id of ids) next[id] = (next[id] ?? 0) + 1;
        return next;
      });
    }
    this.cdr.detectChanges();
    if (ids.length) this.startWidgets(ids);
    this.flushMessages(ids);
  }

  /**
   * The messages a request left (`FacesContext.addMessage`) are drawn by a growl that is part of the response; one the response does not name is not drawn, and
   * the messages are gone with the request.
   */
  private flushMessages(updated: readonly string[]): void {
    const messages = this.bean.messages.splice(0);
    const g = this.meta.widgets.find((w) => w.type === 'Growl');
    if (g && messages.length && updated.some((u) => g.id === u || g.id.endsWith(`:${u}`))) this.growls[0]?.show(messages);
  }

  /** `saveDocumentAndList`: the whole form is posted, the document is saved, the page moves on to the list (or stays with an error) */
  protected async save(): Promise<void> {
    this.collect();
    const r = await this.bean.saveDocumentAndList();
    if (r.redirect) {
      flash.keep(r.messages);
      this.bean.messages = [];
      await this.router.navigateByUrl(`/crm/supporting-docs/${this.type().slug}`);
      return;
    }
    this.bean.messages = [];
    await this.reloadPage(r.messages);
  }

  /* ------------------------------------------------------------------------------------------------------------ widgets */
  /** `PrimeFaces.cw(...)` for the widgets of the page (or of the parts `only` names, drawn again) */
  private startWidgets(only: readonly string[] | undefined, messages: readonly FacesMessage[] = []): void {
    for (const w of this.meta.widgets) {
      if (w.type === 'Growl') {
        if (!only) this.growls.push(new PfGrowl({ id: w.id, life: Number(w.cfg['life'] ?? 6000), sticky: !!w.cfg['sticky'], messages }));
        continue;
      }
      const el = document.getElementById(w.id);
      if (!el) continue; // a widget of the other branch of a `rendered`
      if (only && !only.some((o) => w.id === o || w.id.endsWith(`:${o}`))) continue;
      const wv = w.widgetVar || widgetVarOf(w.id);
      if (!this.widgetVars.includes(wv)) {
        this.widgetVars.push(wv);
        this.widgetIds.push(w.id);
      }
      startWidget(w.type, wv, { ...w.cfg });
      if (w.ajax) this.bindChange(w.id, w.ajax);
    }
  }

  /**
   * The change behaviour of a select (`p:ajax event="change"`): the widget calls no behavior itself — PrimeFaces writes it as an inline `onchange` on the hidden
   * `<select>`, which the widget's `triggerChange()` runs through jQuery's `trigger('change')` (that does not dispatch a DOM event, so Angular's `(change)`
   * would never hear it). Same element, same event here: the select is posted, the listener runs, the parts it names are drawn again.
   */
  private bindChange(id: string, ajax: { event: string; listener: string; update: string }): void {
    const input = document.getElementById(`${id}_input`);
    const jq = (window as unknown as { jQuery?: (e: Element) => { off(n: string): { on(n: string, f: () => void): void } } }).jQuery;
    if (!input || !jq) return;
    jq(input)
      .off(`${ajax.event || 'change'}.sdajax`)
      .on(`${ajax.event || 'change'}.sdajax`, () => void this.ab(null, id, ajax.listener, ajax.update, id, null));
  }

  /** `p:remoteCommand`: a function the page's script calls with `[{ name, value }]`, answered by a bean method (the callback params go to the script) */
  private registerRemoteCommands(): void {
    for (const r of this.meta.remote) {
      (window as unknown as Record<string, unknown>)[r.name] = (params: { name: string; value: string }[]): void => {
        const p = Object.fromEntries((params ?? []).map((x) => [x.name, x.value]));
        void (async () => {
          const lazy = (window as unknown as { sdCustomerLazy?: { onComplete(a: unknown): void; onError(): void } }).sdCustomerLazy;
          try {
            const res = await this.bean.loadProspectPageAjax(String(p['key'] ?? ''), Number.parseInt(String(p['page'] ?? '0'), 10) || 0, String(p['gen'] ?? '0'));
            if (!this.destroyed) lazy?.onComplete({ prosJson: JSON.stringify(res) });
          } catch {
            if (!this.destroyed) lazy?.onError();
          }
        })();
      };
    }
  }

  /* ------------------------------------------------------------------------------------------------------------ files */
  /**
   * `p:fileUpload mode="advanced" auto multiple sequential`: the real PrimeFaces widget (validation, message list, rows, drop zone, the callbacks of the page),
   * started with the configuration the generator took from the component. Its post is answered by `uploadRequest` (see pf-upload-transport.ts).
   */
  private startUploads(): void {
    const run = (code: string | undefined, vars: Record<string, unknown> = {}): void => {
      if (code) new Function(...Object.keys(vars), code)(...Object.values(vars));
    };
    let any = false;
    for (const u of this.meta.uploads) {
      if (!document.getElementById(u.id)) continue; // detail mode: no upload bar
      const wv = widgetVarOf(u.id);
      if (!this.widgetVars.includes(wv)) {
        this.widgetVars.push(wv);
        this.widgetIds.push(u.id);
      }
      any = true;
      startWidget('FileUpload', wv, {
        id: u.id,
        ...(u.auto ? { auto: true } : {}),
        ...(u.update ? { update: u.update } : {}),
        ...(u.sequential ? { sequentialUploads: true } : {}),
        ...(u.dropZone ? { dropZone: u.dropZone } : {}),
        onstart: () => run(u.onstart),
        oncomplete: () => run(u.oncomplete),
        oncancel: () => run(u.oncancel),
        onvalidationfailure: (msg: unknown) => run(u.onvalidationfailure, { msg }),
      });
    }
    if (any) setUploadHandler((files, fields) => this.uploadRequest(files, fields));
  }

  /** the post of the upload widget (one file of the request each): the file joins the bean, the parts the request names are drawn again */
  private async uploadRequest(files: File[], fields: FormData): Promise<void> {
    for (const f of files) this.bean.handleUpload({ name: f.name, type: f.type, size: f.size, blob: f });
    await this.redraw(String(fields.get('jakarta.faces.partial.render') ?? ''));
  }

  /** DocAttachServlet and the master-data servlets: what the page's script asks the server of its own app; any other address is the network */
  private async fetchBrowser(input: string, init?: RequestInit): Promise<Response> {
    const url = new URL(input, 'http://page.local');
    if (url.pathname === '/docattach') return this.docAttach(url, init);
    if (url.pathname.startsWith('/board/') && this.boardFetch) return this.boardFetch(input, init);
    return fetch(input, init);
  }

  private docAttach(url: URL, init?: RequestInit): Response {
    const i = Number.parseInt(url.searchParams.get('i') ?? '', 10);
    const file = Number.isNaN(i) ? undefined : this.bean.localFile(i);
    const json = (status: number): Response => new Response(JSON.stringify({ status }), { status: 200, headers: { 'content-type': 'application/json; charset=UTF-8' } });
    if ((init?.method ?? 'GET').toUpperCase() === 'POST') {
      if (url.searchParams.get('action') !== 'describe') return json(400);
      if (!file) return json(404);
      file.description = new URLSearchParams(String(init?.body ?? '')).get('text') ?? '';
      return json(200);
    }
    if (!file?.content || file.content.size === 0) return new Response('attachment not found', { status: 404 });
    const disposition = url.searchParams.get('action') === 'download' ? 'attachment' : 'inline';
    return new Response(file.content, {
      status: 200,
      headers: { 'content-type': file.contentType || 'application/octet-stream', 'content-disposition': `${disposition}; filename*=UTF-8''${encodeURIComponent(file.filename)}` },
    });
  }

  /** `window.open(url, '_blank')`: the address of a file of the browser is its object URL */
  private openUrl(url: string): void {
    const u = new URL(url, 'http://page.local');
    if (u.pathname === '/docattach') {
      const i = Number.parseInt(u.searchParams.get('i') ?? '', 10);
      const file = Number.isNaN(i) ? undefined : this.bean.localFile(i);
      if (!file?.content) return;
      const obj = URL.createObjectURL(file.content);
      this.objectUrls.push(obj);
      window.open(obj, '_blank');
      return;
    }
    window.open(url, '_blank');
  }
}
