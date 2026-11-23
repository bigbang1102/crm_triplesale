import { DestroyRef, ElementRef, afterNextRender, inject } from '@angular/core';
import { Router } from '@angular/router';
import { AuthService } from '@core/auth/auth.service';
import { startDragScroll } from '@core/dom/drag-scroll';
import { loadScript } from '@core/dom/load-script';
import { loadSwal } from '@core/dom/swal';
import { I18n } from '@core/i18n/i18n.service';
import { PermissionService } from '@core/permissions/permission.service';
import { SalesDocBackend, SalesDocIni, UPLOAD_ACCEPT_EXT } from './sales-doc-backend';
import { captureSalesDocSaves } from '../sales-doc-store';

/** what an engine (`sales-doc-<type>.engine.ts`) needs from its host */
export interface SalesDocFormEnv {
  t: (key: string) => string;
  fetch: (input: string, init?: RequestInit) => Promise<Response>;
  swal: (options: Record<string, unknown>) => Promise<any>;
  navigate: (address: string) => void;
  ctx: string;
}

/**
 * What the five hosts of the sales-document forms share (the Java pages share it through the template and the head scripts): the
 * values the Facelets markup prints (`ini`: branch, user, language …), `t()` / `can()` for the template, the environment of the engine,
 * the scripts the Java head loads (`attach_file_types.js`, `drag_scroll.js`) and the start / stop of the engine.
 *
 * Each subclass is the host of ONE form: its template (`sales-doc-<type>.html`) and stylesheet (`sales-doc-<type>.scss`) are the Java page
 * verbatim, the behaviour is `sales-doc-<type>.engine.ts` (a 1:1 port of the page scripts + sales-doc-libs.engine.ts).
 *
 * LIVE ADAPTER (not built yet — the parent shows `ts-live-missing` when `mock` is off): it has to answer the requests of
 * `sales-doc-backend.ts` — INTEGRATION.md lists what each servlet does (ProspectListServlet, RvApiServlet `materials`,
 * ProspectAttachmentsServlet, ChatMasterDataServlet, and the master data file of the auto-dealer forms).
 */
export abstract class SalesDocFormBase {
  protected readonly t = inject(I18n).t;
  private readonly i18n = inject(I18n);
  private readonly perm = inject(PermissionService);
  private readonly auth = inject(AuthService);
  private readonly router = inject(Router);
  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef);
  private stop: (() => void) | undefined;
  private stopDragScroll: (() => void) | undefined;
  private destroyed = false;
  private stopCapture: (() => void) | undefined;

  /** `commonBean.activeBranchName` … of the markup */
  protected readonly ini: SalesDocIni = this.iniOfSession();

  /** what the Java head of this form loads besides the engine scripts */
  protected abstract readonly needs: { attachFileTypes: boolean; dragScroll: string };
  /** starts the generated engine */
  protected abstract startEngine(env: SalesDocFormEnv): () => void;

  constructor() {
    afterNextRender(() => void this.start());
    inject(DestroyRef).onDestroy(() => {
      this.destroyed = true;
      this.stop?.();
      this.stopDragScroll?.();
      this.stopCapture?.();
    });
  }

  /** `commonBean.hasFeature('A,B')` of the template (`ui:fragment rendered`) */
  protected can(features: string): boolean {
    return this.perm.has(features);
  }

  private iniOfSession(): SalesDocIni {
    const s = this.auth.session();
    return {
      branchName: s?.branch?.name ?? '',
      branchId: s?.branch ? String(s.branch.id) : '',
      branchCode: s?.branch?.code ?? '',
      username: s?.username ?? '',
      lang: this.i18n.lang(),
      uploadAcceptExt: UPLOAD_ACCEPT_EXT,
      profileName: s?.profileName ?? '',
      employeeId: s?.employeeId != null ? String(s.employeeId) : '',
      roles: `[${(s?.roles ?? []).join(', ')}]`,
    };
  }

  private async start(): Promise<void> {
    // the fake backend is its own chunk, loaded only in mock mode (the parent does not create this view otherwise).
    // `?mock=<fault>` in the address shows an error / empty state of the screen (see sales-doc.mock.ts)
    const fault = new URLSearchParams(window.location.search).get('mock') ?? '';
    const backend = await this.backend(fault);
    await this.loadHelpers();
    if (this.destroyed) return;
    this.odsLast();
    const env: SalesDocFormEnv = {
      t: (key) => this.t(key),
      fetch: (input, init) => backend.fetch(input, init),
      swal: (options) => this.swal(options),
      navigate: (address) => this.navigate(address),
      ctx: '',
    };
    this.stopCapture = captureSalesDocSaves(); // mock mode only (this code is reached through the fake backend): a saved document goes to the list
    this.stop = this.startEngine(env);
    this.stopDragScroll = startDragScroll(this.needs.dragScroll);
  }

  /**
   * In the Java app the stylesheet of the system dropdown (open_down_select.js, `<style id="odsCss">`) is added at the END of <head>, after the sheets of the
   * page — a rule of it that ties with one of the page in specificity wins (e.g. `.ods-btn.ods-disabled` against `.qm-overlay .ods-btn`). Here it is added when the
   * app starts, before the styles of the pages that load later: put it back at the end.
   */
  private odsLast(): void {
    const style = document.getElementById('odsCss');
    if (style && style !== document.head.lastElementChild) document.head.appendChild(style);
  }

  /** the backend of the screen (mock mode: the fake one, its own chunk) — a method so that a test can hand in a recording one */
  protected backend(fault: string): Promise<SalesDocBackend> {
    return import('./sales-doc.mock').then((m) => m.createMockSalesDoc({ delayMs: 150, fault }));
  }

  /** the global script the Java head loads (TsAttachTypes) — the engine reads it by name; a method so that a test can stand in for it (jsdom loads no scripts) */
  protected loadHelpers(): Promise<unknown> {
    return this.needs.attachFileTypes ? loadScript('assets/java-js/attach_file_types.js') : Promise.resolve();
  }

  /** SweetAlert as the Java template loads it — a method so that a test can hand in a stand-in (jsdom loads no scripts) */
  protected swal(options: Record<string, unknown>): Promise<unknown> {
    return loadSwal().then((swal) => swal(options));
  }

  /** `window.location.href = …`: a route of this app, or the absolute address of an anchor of this origin (the link back to the list) */
  protected navigate(address: string): void {
    const url = new URL(address, window.location.href);
    if (url.origin === window.location.origin) void this.router.navigateByUrl(url.pathname + url.search + url.hash);
    else window.location.href = address;
  }

  /** `<a href="/sales/docs/qt">` (the link back to the list) → router navigation (no full reload) */
  protected onClick(event: MouseEvent): void {
    if (event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
    const anchor = (event.target as HTMLElement).closest<HTMLAnchorElement>('a[href^="/sales/"]');
    if (!anchor || anchor.target === '_blank' || !this.host.nativeElement.contains(anchor)) return;
    event.preventDefault();
    void this.router.navigateByUrl(anchor.getAttribute('href') ?? '/');
  }
}
