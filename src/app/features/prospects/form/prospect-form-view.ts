import { ChangeDetectionStrategy, ChangeDetectorRef, Component, DestroyRef, ElementRef, Injector, ViewEncapsulation, afterEveryRender, afterNextRender, inject, input, signal } from '@angular/core';
import { Router } from '@angular/router';
import { AuthService } from '@core/auth/auth.service';
import { ConfigService } from '@core/config/config.service';
import { browserFileUrl } from '@core/http/file-url';
import { DomGuards } from '@core/dom/dom-guards';
import { loadScript } from '@core/dom/load-script';
import { loadSwal } from '@core/dom/swal';
import { I18n } from '@core/i18n/i18n.service';
import { retryEmptyOptions } from '@core/live/prospect-options.live';
import { restDepsOf } from '@core/live/rest-deps';
import { javaLinkToRoute } from '@core/navigation/java-links';
import type { AccessButtonCode } from '@core/permissions/access-buttons';
import { PermissionService } from '@core/permissions/permission.service';
import { startOdsPf } from '@shared/primefaces/ods-pf';
import { loadPrimeFaces, removeDatepickerDiv, resetPrimeFacesState, startWidget, stopWidgets, widgetVarOf } from '@shared/primefaces/pf-runtime';
import { makeLeadCreateDropdowns } from '../opportunity-create-dropdowns';
import { ProspectFormBackend } from './prospect-form-backend';
import { prospectSession, ProspectFormView as ProspectFormBean } from './prospect-form.bean';
import { startProspectForm, type ProspectFormEnv } from './prospect-form.engine';
import { FORM_ACTIONS, FORM_BINDINGS, FORM_ID, FORM_REMOTE, FORM_WIDGETS } from './prospect-form.meta';
import { ProspectFormService } from './prospect-form.service';
import { isMaskedValue, viewDate } from './prospect-form.logic';
import type { ProspectFormInitial, ProspectFormUser } from './prospect-form-types';

/**
 * The prospect form (`pages/contracts_master_data.xhtml`, add / view / edit; the bean is `ContractView`).
 *
 * The page of the Java server was: the HTML its renderers wrote, the PrimeFaces widget scripts started by inline `PrimeFaces.cw(…)`, the page's own
 * three scripts, and a bean that kept the state between requests (ajax actions, remote commands). Here:
 *   - the template (`prospect-form.html`, generated) is the HTML; the bean is `ProspectFormView` (prospect-form.bean.ts — the same class the comparison
 *     harness runs as "the server" of the Java replica);
 *   - the widgets are the real ones (assets/vendor/primefaces: select, date picker, dialog, radio), started with the configuration the generator took
 *     from the components;
 *   - `collect()` lays the values of the form's controls into the bean — what a post of the form does before a listener runs;
 *   - `ab()` plays the ajax behaviours and buttons (`PrimeFaces.ab`): collect, listener, the scripts the listener queued
 *     (`PrimeFaces.current().executeScript`), the parts named by `update` re-created (and their widgets restarted), `oncomplete` / `onsuccess`;
 *   - the `p:remoteCommand` functions (`rc_createLead` …) are window functions the page's script calls with `[{ name, value }]`;
 *   - what the servlets of the Java side answered to the page's own script (`/board/prospect`, `/board/prospect/save` …) is `env.fetch`.
 */
@Component({
  selector: 'ts-prospect-form-view',
  templateUrl: './prospect-form.html',
  // the order of the Java page: PrimeFaces' own stylesheets, the page's, then what the template says about the widgets
  styleUrls: ['../../../shared/primefaces/pf-theme.scss', './prospect-form.scss', '../../../shared/primefaces/pf-template.scss'],
  // the Java CSS / engine / widgets rely on global selectors and on HTML strings they write
  encapsulation: ViewEncapsulation.None,
  // whitespace between inline elements is part of the look (Java rendered the markup as written)
  preserveWhitespaces: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  // data-java-page: the shell's `button:disabled { cursor: not-allowed }` (styles/_base.scss) stays out of a page generated from Java
  host: { 'data-java-page': '' },
})
export class ProspectFormView {
  /** the address of the route: `new` or the id of the prospect, `?action_type=` (add | view | edit), `?pms=` */
  readonly id = input.required<string>();
  readonly actionType = input.required<string>();
  readonly pms = input<string | null>(null);

  protected readonly t = inject(I18n).t;
  protected readonly perm = inject(PermissionService);
  protected readonly router = inject(Router);
  protected readonly config = inject(ConfigService);
  protected readonly auth = inject(AuthService);
  protected readonly injector = inject(Injector);
  protected readonly cdr = inject(ChangeDetectorRef);
  protected readonly host = inject<ElementRef<HTMLElement>>(ElementRef);
  private readonly guards = inject(DomGuards);

  /** what `CommonBean` rendered into the page with EL (`commonBean.uploadAcceptExt` · `ssEmployeeId` · `aiHubEnabled`) */
  protected env: { uploadAcceptExt: string; ssEmployeeId: string; aiHubEnabled: boolean } = { uploadAcceptExt: '', ssEmployeeId: '', aiHubEnabled: this.config.value.features.aiHubEnabled };

  protected readonly ready = signal(false);
  /** every employee (`/board/employees`): the list of the "เปลี่ยนผู้รับผิดชอบ" menu of the view mode (nothing is saved yet) */
  protected readonly owners = signal<{ id: string; name: string; code: string }[]>([]);
  /** the customer type the page was drawn with (see typeAtLoad) */
  private loadedType = '';
  protected bean!: ProspectFormBean;
  private backendRef!: ProspectFormBackend;
  private readonly updates = signal<Record<string, number>>({});
  private readonly snaps = new Map<string, unknown[]>();
  private stopEngine: (() => void) | undefined;
  private stopOdsPf: (() => void) | undefined;
  private widgetVars: string[] = [];
  private widgetIds: string[] = [];
  private destroyed = false;
  private readonly disposers: (() => void)[] = [];
  private readonly meta = { bindings: FORM_BINDINGS, widgets: FORM_WIDGETS, actions: FORM_ACTIONS, remote: FORM_REMOTE, formId: FORM_ID };

  constructor() {
    afterNextRender(() => void this.start());
    afterEveryRender(() => this.lockMasked());
    inject(DestroyRef).onDestroy(() => this.teardown());
  }

  /** a field the service hides (`****`) is locked: it cannot be edited, and it is never sent (the bodies leave it out) */
  private lockMasked(): void {
    const root = this.host.nativeElement as HTMLElement;
    root.querySelectorAll<HTMLInputElement | HTMLTextAreaElement>('input[type="text"], input:not([type]), textarea').forEach((el) => {
      if (isMaskedValue(el.value)) {
        if (!el.disabled) el.disabled = true;
        el.setAttribute('data-masked', '1');
      } else if (el.getAttribute('data-masked') === '1') {
        el.disabled = false;
        el.removeAttribute('data-masked');
      }
    });
  }

  /* ------------------------------------------------------------------------------------------------------------ start / stop */
  /** the backend of the screen: the sample data in mock mode (its own chunk), the REST calls otherwise — a method so that a test can hand in its own */
  protected async backend(): Promise<ProspectFormBackend> {
    if (this.config.value.mock) return (await import('./prospect-form.mock')).createMockProspectForm({ delayMs: 0 });
    return (await import('./prospect-form.live')).createLiveProspectFormBackend(restDepsOf(this.injector));
  }

  /** the scripts the Java page loaded: PrimeFaces' widgets, the attachments check and SweetAlert — a method so that a test can hand in its own */
  protected loadRuntime(): Promise<unknown> {
    return Promise.all([loadPrimeFaces(), loadSwal(), loadScript('assets/java-js/attach_file_types.js')]);
  }

  /** `yyyy-MM-dd` of today (the local day) */
  protected today(): string {
    const d = new Date();
    const two = (n: number): string => String(n).padStart(2, '0');
    return `${d.getFullYear()}-${two(d.getMonth() + 1)}-${two(d.getDate())}`;
  }

  private user(): ProspectFormUser | undefined {
    const s = this.auth.session();
    return s?.employeeId ? { id: s.employeeId, code: s.employeeCode, name: s.profileName } : undefined;
  }

  private async start(): Promise<void> {
    retryEmptyOptions(); // a new visit: the lists that came empty last time are asked again
    const [backend] = await Promise.all([this.backend(), this.loadRuntime()]);
    if (this.destroyed) return;
    this.backendRef = backend;
    const initial: ProspectFormInitial = await backend.initial();
    this.env = { ...this.env, uploadAcceptExt: initial.uploadAcceptExt, ssEmployeeId: initial.ssEmployeeId };
    // the shell's page scripts (window.TsPhone, odsEnhance …): started once, a no-op when they already run
    this.guards.start();
    this.bean = new ProspectFormBean(new ProspectFormService(backend.api), {
      user: this.user(),
      today: () => this.today(),
      ctxPath: '',
      // the live build has no /docproxy servlet for an <img>: the address of the file itself
      docProxy: (url) => browserFileUrl(url, this.config.value.apiOrigin, location),
      session: prospectSession,
      onChange: () => this.cdr.markForCheck(),
    });
    await this.bean.init({ action_type: this.actionType(), id: this.id() === 'new' ? '' : this.id(), pms: this.pms() });
    if (this.destroyed) return;
    this.loadedType = this.bean.contractBean.customer_type ?? '';
    this.ready.set(true);
    this.cdr.detectChanges();
    this.startPage();
    void this.loadOwners(); // the owner field of the add / edit modes and the owner menu of the view mode
    if (this.actionType() === 'view') this.openBoxesUp();
  }

  /**
   * The app's dropdown (open_down_select.js) always opens downwards, and the "เปลี่ยนสถานะ" / "เปลี่ยนผู้รับผิดชอบ" boxes are in the footer row at the bottom of the page: when the
   * list does not fit under the box it is put above it (the list of the script is fixed to the viewport, so only its `top` changes).
   */
  private openBoxesUp(): void {
    const el = this.host.nativeElement;
    const flip = (ev: Event): void => {
      const box = (ev.target as HTMLElement | null)?.closest<HTMLElement & { _odsList?: HTMLElement }>('.ctd-sel .ods-btn');
      if (!box) return;
      setTimeout(() => {
        const list = box._odsList;
        if (!list || !list.classList.contains('open')) return;
        const b = box.getBoundingClientRect();
        if (b.bottom + 4 + list.offsetHeight <= window.innerHeight - 8) return;
        // the script shrank the items to the room under the box: above the box there is more
        const items = list.querySelector<HTMLElement>('.ods-items');
        if (items) items.style.maxHeight = `${Math.max(120, Math.min(216, b.top - 80))}px`;
        const h = list.offsetHeight;
        if (b.top - 4 - h >= 8) list.style.top = `${Math.round(b.top - 4 - h)}px`;
      }, 0);
    };
    el.addEventListener('click', flip, true);
    this.disposers.push(() => el.removeEventListener('click', flip, true));
  }

  /** the owner of the prospect is one of the employees of the list (then the menu needs no extra row with their name) */
  protected ownerListed(): boolean {
    const name = this.bean?.contractBean.salepersonname;
    return !!name && this.owners().some((o) => o.name === name);
  }

  /** the employee of the list that is the signed-in user: by id, else by code, else by name (the id of the session and the ids of the master data are not promised to be the same) */
  private signedInOwnerId(): string {
    const list = this.owners();
    const s = this.auth.session();
    const byId = list.find((o) => o.id === this.env.ssEmployeeId);
    const byCode = s?.employeeCode ? list.find((o) => o.code !== '' && o.code === String(s.employeeCode)) : undefined;
    const byName = s?.profileName ? list.find((o) => o.name === String(s.profileName)) : undefined;
    return (byId ?? byCode ?? byName)?.id ?? '';
  }

  /** the id of the employee shown in the owner field: the owner of the prospect (by id, else by name), else the signed-in employee (the default owner of a new prospect) */
  protected ownerSelectedId(): string {
    const c = this.bean?.contractBean;
    if (c?.salepersonid) {
      const byId = this.owners().find((o) => o.id === String(c.salepersonid));
      if (byId) return byId.id;
    }
    if (c?.salepersonname) {
      const byName = this.owners().find((o) => o.name === c.salepersonname);
      if (byName) return byName.id;
    }
    return this.bean?.action_type === 'add' ? this.signedInOwnerId() : '';
  }

  /** the owner field: the chosen employee is the sale person of the prospect (what the save sends as salePersonId / Code / Name) */
  protected pickOwner(id: string): void {
    const c = this.bean?.contractBean;
    if (!c) return;
    const o = this.owners().find((e) => e.id === id);
    c.salepersonid = o ? Number(o.id) || 0 : 0;
    c.salepersoncode = o?.code ?? '';
    c.salepersonname = o?.name ?? '';
    this.cdr.markForCheck();
  }

  /** a new prospect starts with the signed-in employee as the owner (the field shows them; the bean has to say so too) */
  private defaultOwner(): void {
    const c = this.bean?.contractBean;
    if (!c || this.bean.action_type !== 'add' || c.salepersonid) return;
    const id = this.signedInOwnerId();
    if (id) this.pickOwner(id);
  }

  private async loadOwners(): Promise<void> {
    try {
      type Row = { id?: unknown; name?: unknown; code?: unknown };
      // the queues (waitlists) first, then the people (responsibles), in one call: GET /prospects/options?sets=responsibles,waitlists; a queue goes as "wl:<id>" (as in the create-OPP window)
      const res = await this.fetchBrowser('/board/prospect-options?sets=responsibles,waitlists', { credentials: 'same-origin' });
      const data = (res.ok ? await res.json() : {}) as { responsibles?: Row[]; waitlists?: Row[] };
      if (this.destroyed) return;
      const people = (data.responsibles ?? []).map((o: Row) => ({ id: String(o.id ?? ''), name: String(o.name ?? o.code ?? ''), code: String(o.code ?? '') }));
      const queues = (data.waitlists ?? []).map((o: Row) => ({ id: `wl:${String(o.id ?? '')}`, name: String(o.name ?? o.id ?? ''), code: '' }));
      this.owners.set([...queues, ...people].filter((o) => o.id && o.id !== 'wl:' && o.name));
      this.defaultOwner();
      this.cdr.markForCheck();
    } catch {
      /* no list: the menu is empty */
    }
  }

  /** what the Java page did once the document was parsed: the widgets, the remote commands, the page's scripts */
  private startPage(): void {
    this.registerRemoteCommands();
    // The order of the Java document: the page's scripts run while it is parsed (the select's alignPanel is wrapped by the page first), the template's scripts after them
    // (open_down_select.js wraps what is there: the part that re-skins and patches the PrimeFaces widgets — the shell's port of it leaves them out), the widgets start when
    // the document is ready.
    this.stopEngine = startProspectForm(this.engineEnv());
    this.stopOdsPf = startOdsPf({ search: this.t('label.ods.search_ph') });
    this.startWidgets(undefined);
  }

  /** the page's scripts and widgets stopped (the DOM of the template is still there) */
  private stopPage(): void {
    this.stopEngine?.();
    this.stopOdsPf?.();
    // the dropdown panels the shell's ODS puts into <body> for the page's selects: they would stay behind when the page goes (Java: a page load clears <body>)
    this.host.nativeElement.querySelectorAll<HTMLElement & { _odsList?: HTMLElement }>('.ods-btn').forEach((b) => b._odsList?.remove());
    document.querySelectorAll('.ods-list').forEach((l) => {
      if (!document.getElementById(l.getAttribute('data-for') ?? '')) l.remove();
    });
    stopWidgets(this.widgetVars, this.widgetIds);
    removeDatepickerDiv();
    for (const r of this.meta.remote) delete (window as unknown as Record<string, unknown>)[r.name];
    delete (window as unknown as Record<string, unknown>)['ctdCheckDuplicate'];
    delete (window as unknown as Record<string, unknown>)['ctdCreateProspect'];
    this.disposers.splice(0).forEach((d) => d());
    this.widgetVars = [];
    this.widgetIds = [];
  }

  private teardown(): void {
    this.destroyed = true;
    this.stopPage();
    resetPrimeFacesState();
  }

  private engineEnv(): ProspectFormEnv {
    return {
      t: (k) => this.t(k),
      swal: (options) => loadSwal().then((swal) => swal(options)),
      actionType: this.bean.action_type,
      contractId: this.bean.contractid,
      pms: this.bean.page_mode_status,
      employeeId: this.env.ssEmployeeId,
      navigate: (javaUrl) => this.navigate(javaUrl),
      fetch: (input, init) => this.fetchBrowser(input, init),
      session: {
        getItem: (key) => {
          try {
            return sessionStorage.getItem(key);
          } catch {
            return null; // storage blocked
          }
        },
        setItem: (key, value) => {
          try {
            sessionStorage.setItem(key, value);
          } catch {
            /* storage blocked */
          }
        },
        removeItem: (key) => {
          try {
            sessionStorage.removeItem(key);
          } catch {
            /* storage blocked */
          }
        },
      },
      leadCreateDropdowns: (deps) => makeLeadCreateDropdowns({ ...deps, ctx: '' }),
    } as ProspectFormEnv;
  }

  /** `window.location.href = '<Java address>'`: the route of the address (a route of this app is taken as it is) */
  private navigate(url: string): void {
    const route = url.startsWith('/') && !/\.(face|xhtml)\b/.test(url) ? url : javaLinkToRoute(url);
    if (route) void this.router.navigateByUrl(route);
  }

  /** the BFF contract of the page's script (`/board/…`, `/docproxy`): the backend answers; any other address is the network */
  private fetchBrowser(input: string, init?: RequestInit): Promise<Response> {
    const url = String(input).replace(/^\.\.\//, '/');
    if (url.startsWith('/board/') || url.startsWith('/docproxy')) return this.backendRef.fetch(url, init);
    return fetch(input, init);
  }

  /* ------------------------------------------------------------------------------------------------------------ what the template calls */
  /** `@if (access('PL-PR-CR-02'))`: the button registry (core/permissions/access-buttons.ts) — may the user use the button */
  protected access(code: string): boolean {
    return this.perm.canUse(code as AccessButtonCode);
  }

  /** `commonBean.hasFeature('A,B')` of the template (`ui:fragment rendered`) */
  protected can(features: string): boolean {
    return this.perm.has(features);
  }

  /**
   * The customer type as the Java page was drawn: the type is chosen on the client (the page's script switches the panels, the label and the buttons) and no update of the page
   * draws the parts that depend on it again, so the DOM keeps what it was drawn with while the bean follows the posts of the form.
   */
  protected typeAtLoad(): string {
    return this.loadedType;
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

  /** the form is never posted: Enter in a field submits it, and Java's `p:commandButton`s are ajax */
  protected onSubmit(event: Event): void {
    event.preventDefault();
  }

  /* ------------------------------------------------------------------------------------------------------------ ajax */
  /** lays the controls' values into the bean (a post of the form); `ids` narrows it to the controls inside those elements, none = the whole form */
  protected collect(ids?: readonly string[]): void {
    const scopes = ids?.map((i) => document.getElementById(i)).filter((x): x is HTMLElement => !!x);
    for (const b of this.meta.bindings) {
      if (b.kind === 'hidden') continue; // a hidden field only carries a value TO the page (phoneFormatJson)
      const el = document.getElementById(b.id) as HTMLInputElement | HTMLSelectElement | null;
      if (!el) continue; // a control of the other branch of a `rendered`
      if (scopes && !scopes.some((s) => s === el || s.contains(el))) continue;
      if (b.kind === 'radio') {
        // the radio group: the value of the checked button (none checked = the group is not posted)
        const checked = el.querySelector<HTMLInputElement>('input[type=radio]:checked');
        if (checked) this.bean.assign(b.el, checked.value, b.kind);
        continue;
      }
      if (b.id === 'form:customer_name_input') {
        // two fields, one name: "ชื่อ" + " " + "สกุล" (a company has just its name)
        const first = el.value.trim();
        const sn = document.getElementById('ctdSurname') as HTMLInputElement | null;
        const last = sn && !el.closest('form')?.classList.contains('ct-type-juristic') ? sn.value.trim() : '';
        const joined = last ? `${first} ${last}`.trim() : el.value;
        this.nameCache = { src: joined, first: last ? first : el.value, last };
        this.bean.assign(b.el, joined, b.kind);
        continue;
      }
      this.bean.assign(b.el, el.value, b.kind);
    }
  }

  /** the choices of the usage status of the edit mode (usageStatus of the update: draft · release · block) */
  protected readonly statusChoices: readonly { v: string; k: string }[] = [
    { v: 'draft', k: 'app.prospects.statusDraft' },
    { v: 'release', k: 'app.prospects.statusActive' },
    { v: 'block', k: 'app.prospects.statusSuspended' },
  ];
  private statusAtLoad: string | null = null;

  private normStatus(v: string | null | undefined): string {
    const s = String(v ?? '').trim().toLowerCase();
    return s === 'draft' || s === 'block' ? s : 'release';
  }

  /** the status the prospect had when the page was drawn (the one with the badge "ปัจจุบัน") */
  protected statusLoaded(): string {
    if (this.statusAtLoad === null && this.bean) this.statusAtLoad = this.normStatus(this.bean.contractBean.usagestatus);
    return this.statusAtLoad ?? 'release';
  }

  protected usageStatusNow(): string {
    return this.normStatus(this.bean?.contractBean.usagestatus);
  }

  protected pickUsageStatus(v: string): void {
    const c = this.bean?.contractBean;
    if (!c) return;
    c.usagestatus = v;
    this.cdr.markForCheck();
  }

  /** a box of at most `max` lines: what is typed or pasted beyond the last line is cut */
  protected limitLines(event: Event, max: number): void {
    const el = event.target as HTMLTextAreaElement;
    const lines = el.value.split(/\r?\n/);
    if (lines.length > max) el.value = lines.slice(0, max).join('\n');
  }

  /** the two fields of the name: the stored name split at its first space (kept while it is the one the fields themselves joined) */
  private nameCache = { src: '\u0000', first: '', last: '' };
  protected nameParts(): { first: string; last: string } {
    const full = this.bean?.contractBean.customer_name ?? '';
    if (full !== this.nameCache.src) {
      const t = String(full).trim();
      const i = t.indexOf(' ');
      this.nameCache = { src: full, first: i < 0 ? t : t.slice(0, i), last: i < 0 ? '' : t.slice(i + 1).trim() };
    }
    return this.nameCache;
  }

  /**
   * `PrimeFaces.ab`: collect → listener → the scripts the listener queued → re-create what `update` names → `oncomplete` / `onsuccess`.
   * `process` is what the request executes: `@this` = the source alone, none / `@form` / `@all` = the whole form, else those parts.
   * (PrimeFaces sends the request with jQuery's `global: false`, so the page's `jQuery(document).ajaxComplete(…)` handlers do NOT run after it.)
   */
  protected ab(
    event: Event | null,
    source: string,
    listener: string | null,
    update: string | null,
    process: string | null,
    oncomplete: string | null,
    args: readonly unknown[] = [],
    onstart: string | null = null,
    onsuccess: string | null = null,
  ): Promise<void> {
    event?.preventDefault();
    // PrimeFaces sends its requests one after the other (ajax queue): a button with a nested p:ajax makes two
    const run = this.queue.then(() => this.request(source, listener, update, process, oncomplete, args, onstart, onsuccess));
    this.queue = run.catch((e) => console.error(e));
    return run;
  }

  /** the requests of the page wait for each other */
  private queue: Promise<void> = Promise.resolve();

  private async request(
    source: string,
    listener: string | null,
    update: string | null,
    process: string | null,
    oncomplete: string | null,
    args: readonly unknown[],
    onstart: string | null,
    onsuccess: string | null,
  ): Promise<void> {
    if (this.destroyed) return;
    if (onstart && this.run(onstart) === false) return; // (the script of onstart can cancel the request)
    const tokens = (process ?? '').split(/\s+/).filter(Boolean);
    const whole = tokens.length === 0 || tokens.some((t) => t === '@all' || t === '@form');
    this.collect(whole ? undefined : tokens.map((t) => (t === '@this' ? source : t)));
    await this.invoke(listener, args);
    const focus = this.focused(); // (the response starts to be handled: the focus is taken here)
    this.run(onsuccess); // (PrimeFaces runs onsuccess when the response arrives, before it updates the DOM)
    await this.redraw(update, source);
    this.flushScripts(); // (the <eval> of the partial response runs after the updates)
    this.reFocus(focus);
    this.run(oncomplete);
    this.complete();
  }

  /**
   * `$(document).trigger('pfAjaxComplete')`: PrimeFaces tells the page that a request is over (the page re-formats its phone fields and the codes beside them on it).
   * It does so for requests with `global` on (the default) — jQuery's own `ajaxComplete` is not triggered by them.
   */
  private complete(): void {
    const jq = (window as unknown as { jQuery?: (d: Document) => { trigger(n: string, a: unknown[]): void } }).jQuery;
    jq?.(document).trigger('pfAjaxComplete', [null, this, {}]);
  }

  /** the listener on the bean */
  private async invoke(listener: string | null, args: readonly unknown[]): Promise<void> {
    if (listener) await (this.bean as unknown as Record<string, (...a: unknown[]) => unknown>)[listener](...args);
  }

  /** the scripts the listener queued (`PrimeFaces.current().executeScript`): a move of the browser goes to the router */
  private flushScripts(): void {
    for (const js of this.bean.takeScripts()) this.run(js.replace(/window\.location\.href\s*=\s*'([^']*)'/g, (_m, url: string) => `window.ptNavigate('${url}')`));
  }

  private run(code: string | null | undefined): unknown {
    return code ? new Function('xhr', 'status', 'args', code)(null, 'success', {}) : undefined;
  }

  /** the parts of the page named by `update` drawn again, and their widgets started again (what the JSF ajax update does with the DOM it replaces) */
  private async redraw(update: string | null, source: string): Promise<void> {
    const ids = (update ?? '')
      .split(/\s+/)
      .filter((u) => u && u !== '@none')
      .map((u) => (u === '@this' ? source : u))
      .filter((u) => !u.startsWith('@'))
      .map((u) => u.split(':').pop() as string);
    if (ids.length) {
      this.snaps.clear(); // (the parts drawn again read the lists of the bean as they are now: the districts of the province just chosen)
      this.updates.update((u) => {
        const next = { ...u };
        for (const id of ids) next[id] = (next[id] ?? 0) + 1;
        return next;
      });
    }
    this.cdr.detectChanges();
    if (ids.length) this.startWidgets(ids);
  }

  /** the element that has the focus when a response starts to be handled, and its selection (PrimeFaces: `handleReFocus(id, selection)` of the response) */
  private focused(): { id: string; start: number | null; end: number | null } | null {
    const active = document.activeElement as (HTMLElement & { selectionStart?: number | null; selectionEnd?: number | null }) | null;
    return active && active.id ? { id: active.id, start: active.selectionStart ?? null, end: active.selectionEnd ?? null } : null;
  }

  /**
   * `PrimeFaces.ajax.Response.handleReFocus`: when every part of a response is done (the updates, the scripts), the element that had the focus gets it back — also when nothing
   * of the page was updated, and also from a dialog the response has just opened (the SweetAlert of the update: the focus goes back to the field the user was in).
   */
  private reFocus(f: { id: string; start: number | null; end: number | null } | null): void {
    if (!f) return;
    const again = document.getElementById(f.id) as HTMLInputElement | null;
    if (!again || document.activeElement?.id === f.id) return;
    again.focus();
    try {
      if (f.start != null && f.end != null) again.setSelectionRange(f.start, f.end);
    } catch {
      /* an element without a selection (a radio button) */
    }
  }

  /* ------------------------------------------------------------------------------------------------------------ widgets */
  /** `PrimeFaces.cw(...)` for the widgets of the page (or of the parts `only` names, drawn again) */
  private startWidgets(only: readonly string[] | undefined): void {
    // (the parts of an update are processed in the order the response names them: their widgets start in that order — the panels they draw into <body> follow it)
    const order = only ? only.flatMap((o) => this.meta.widgets.filter((w) => w.id === o || w.id.endsWith(`:${o}`))) : this.meta.widgets;
    for (const w of order) {
      const el = document.getElementById(w.id);
      if (!el) continue; // a widget of the other branch of a `rendered`
      const wv = w.widgetVar || widgetVarOf(w.id);
      if (!this.widgetVars.includes(wv)) {
        this.widgetVars.push(wv);
        this.widgetIds.push(w.id);
      }
      const cfg: Record<string, unknown> = { ...w.cfg };
      if (w.behaviors) {
        // the behaviours the widget calls itself (PrimeFaces writes them as functions after the configuration: `behaviors:{dateSelect:function(ext,event){PrimeFaces.ab(…)}}`)
        cfg['behaviors'] = Object.fromEntries(
          Object.entries(w.behaviors).map(([ev, b]) => [ev, () => void this.ab(null, w.id, b.listener ?? null, b.update, b.process, null, b.args ?? [])]),
        );
      }
      // the date picker draws its panel into the element `appendTo` names: Java's p:datePicker has none, and here the panel then goes nowhere (the plug-in looks the
      // empty expression up and gets an empty set) — it is put into <body> like the panels of the selects (appendTo="@(body)")
      if (w.type === 'DatePicker' && !cfg['appendTo']) cfg['appendTo'] = '@(body)';
      startWidget(w.type, wv, cfg);
      if (w.ajax) this.bindChange(w, w.ajax);
    }
  }

  /**
   * The change behaviour of a widget's own input (`p:ajax event="change"` on a select / a radio group): the widget calls no behaviour itself — PrimeFaces writes
   * it as an inline `onchange` on the hidden `<select>` / radio inputs, which the widget's `triggerChange()` runs through jQuery's `trigger('change')` (that does
   * not dispatch a DOM event, so Angular's `(change)` would never hear it). Same element, same event here.
   */
  private bindChange(w: { id: string; type: string }, ajax: { event: string; listener?: string; update: string; process: string }): void {
    const event = ajax.event || 'change';
    const targets: Element[] =
      w.type === 'SelectOneRadio' ? [...document.querySelectorAll(`[id="${w.id}"] input[type=radio]`)] : ([document.getElementById(`${w.id}_input`)].filter(Boolean) as Element[]);
    const jq = (window as unknown as { jQuery?: (e: Element) => { off(n: string): { on(n: string, f: () => void): void } } }).jQuery;
    if (!targets.length || !jq) return;
    for (const t of targets) {
      jq(t)
        .off(`${event}.ptajax`)
        .on(`${event}.ptajax`, () => void this.ab(null, w.id, ajax.listener ?? null, ajax.update, w.id, null));
    }
  }

  /** `p:remoteCommand`: a function the page's script calls with `[{ name, value }]`, answered by a bean method (the parameters go to `bean.request`) */
  private registerRemoteCommands(): void {
    // the "save" button of the add form: the duplicate check first (POST /prospects/duplicate-checks); the window of the save opens only when it passes
    (window as unknown as Record<string, unknown>)['ctdCheckDuplicate'] = (onOk: () => void): void => {
      void (async () => {
        this.collect(undefined);
        try {
          const ok = await this.bean.checkDuplicateBeforeSave();
          if (this.destroyed) return;
          this.flushScripts();
          if (ok) onOk();
        } catch (e) {
          console.error(e);
          onOk(); // a check that fails to run never keeps the user from the save (the service checks again)
        }
      })();
    };
    // "Save draft" (DRAFT) and the "Save" of the window (RELEASE + the owner chosen there): POST /api/v1/prospects; one at a time
    let creating = false;
    (window as unknown as Record<string, unknown>)['ctdCreateProspect'] = (mode: 'DRAFT' | 'RELEASE', owner?: string): void => {
      if (creating) return;
      creating = true;
      void (async () => {
        try {
          this.collect(undefined);
          await this.bean.createProspectV2(mode, owner ?? '');
          if (this.destroyed) return;
          this.flushScripts();
        } catch (e) {
          console.error(e);
        } finally {
          creating = false;
        }
      })();
    };
    for (const r of this.meta.remote) {
      (window as unknown as Record<string, unknown>)[r.name] = (params?: { name: string; value: string }[]): void => {
        const p = Object.fromEntries((params ?? []).map((x) => [x.name, x.value]));
        void (async () => {
          this.collect(r.process === '@this' || !r.process ? [] : undefined);
          this.bean.request = p;
          try {
            await this.invoke(r.listener, r.args ?? []);
            if (this.destroyed) return;
            const focus = this.focused();
            await this.redraw(r.update ?? null, r.id);
            this.flushScripts();
            this.reFocus(focus);
            this.run(r.oncomplete);
            this.complete();
          } catch (e) {
            console.error(e);
            this.run(r.onerror);
          }
        })();
      };
    }
  }
}
