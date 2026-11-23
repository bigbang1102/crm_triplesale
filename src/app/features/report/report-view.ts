import { ChangeDetectionStrategy, Component, DestroyRef, Injector, ViewEncapsulation, inject } from '@angular/core';
import { ConfigService } from '@core/config/config.service';
import { loadSwal } from '@core/dom/swal';
import { restDepsOf } from '@core/live/rest-deps';
import { PermissionService } from '@core/permissions/permission.service';
import type { ReportBackend } from './report-backend';
import { ReportEnv, startReport } from './report.engine';

/**
 * The Report screen (`pages/report.xhtml`).
 *
 * The template (`report.html`) and stylesheet (`report.scss`) are the Java page verbatim; the behaviour is `report.engine.ts` (a 1:1 port of the
 * page script). This component only hosts them: it gives the engine its environment (what the Facelets page got from the session, the
 * template and the browser) and starts / stops it.
 *
 * The backend is chosen by `backend()`: the sample data in mock mode, `report.live.ts` otherwise (the data file, the filter lists through the board master
 * routes, `reportPermJson` from the roles; the PDF itself has no REST endpoint yet — see report.live.ts).
 */
@Component({
  selector: 'ts-report-view',
  templateUrl: './report.html',
  styleUrl: './report.scss',
  // the Java CSS / engine rely on global selectors and on HTML strings written by the engine
  encapsulation: ViewEncapsulation.None,
  // whitespace between inline elements is part of the look (Java rendered the markup as written)
  preserveWhitespaces: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  // a page generated from a Java file: global rules that are the Angular shell's own (e.g. the not-allowed cursor of a disabled button) stay out of it (styles/_base.scss)
  host: { 'data-java-page': '' },
})
export class ReportView {
  private readonly perm = inject(PermissionService);
  private readonly mock = inject(ConfigService).value.mock;
  private readonly injector = inject(Injector);
  private stop: (() => void) | undefined;
  private destroyed = false;

  constructor() {
    void this.start();
    inject(DestroyRef).onDestroy(() => {
      this.destroyed = true;
      this.stop?.();
    });
  }

  /** the backend is its own chunk: the sample data in mock mode, the REST calls otherwise (a method so that a test can hand in another backend) */
  protected async backend(): Promise<ReportBackend> {
    if (this.mock) return (await import('./report.mock')).createMockReport({ delayMs: 120 });
    return (await import('./report.live')).createLiveReport(restDepsOf(this.injector));
  }

  private async start(): Promise<void> {
    const backend = await this.backend();
    const initial = backend.initial({ hasRole: (role) => this.perm.has(role) });
    if (this.destroyed) return;
    const env: ReportEnv = {
      ctx: '',
      fetch: (input, init) => backend.fetch(input, init),
      // `window.open(report url, '_blank')`: called inside the click, so the browser lets the tab open
      open: (url, target) => window.open(backend.reportUrl(url), target ?? '_blank'),
      swal: (options) => this.swal(options),
      initial: (name) => (initial as unknown as Record<string, unknown>)[name],
    };
    this.stop = startReport(env);
  }

  /** SweetAlert as the Java template loads it — a method so that a test can hand in a stand-in (jsdom loads no scripts) */
  protected swal(options: Record<string, unknown>): Promise<unknown> {
    return loadSwal().then((swal) => swal(options));
  }
}
