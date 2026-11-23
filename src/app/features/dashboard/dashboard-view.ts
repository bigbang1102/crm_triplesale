import {
  ChangeDetectionStrategy,
  ChangeDetectorRef,
  Component,
  DestroyRef,
  ViewEncapsulation,
  inject,
  output,
} from '@angular/core';
import { HttpClient, HttpErrorResponse } from '@angular/common/http';
import { Router } from '@angular/router';
import { firstValueFrom } from 'rxjs';
import { AuthService } from '@core/auth/auth.service';
import { ConfigService } from '@core/config/config.service';
import { ApiError } from '@core/http/api-error';
import { I18n } from '@core/i18n/i18n.service';
import { DashboardBackend, DashboardInitial, LiveDeps } from './dashboard-backend';
import { DashboardEnv, startDashboard } from './dashboard.engine';

/** the texts of the KPI cards the template shows before the first chart arrives (DashboardView getters) */
type Ini = Pick<DashboardInitial, 'kpiTotalFmt' | 'kpiCountries' | 'kpiTopCountry' | 'sourceFunnelSubtitle' | 'csFunnelSubtitle' | 'countryFunnelSubtitle'>;
const NO_TEXT: Ini = { kpiTotalFmt: '', kpiCountries: '', kpiTopCountry: '', sourceFunnelSubtitle: '', csFunnelSubtitle: '', countryFunnelSubtitle: '' };

/**
 * The Dashboard screen (`pages/dashboard.xhtml`).
 *
 * The template (`dashboard.html`) and stylesheet (`dashboard.scss`) are the Java page verbatim; the behaviour is
 * `dashboard.engine.ts` (a 1:1 port of the page script). This component only hosts them: it loads the first-paint data the
 * Java server rendered with EL (DashboardView), gives the engine its environment (what the Facelets page got from the session,
 * the template and the URL) and starts / stops it. The engine edits the template's DOM, so "reload the page" (the page's own
 * refresh button; Java also reloads on a language switch) is a NEW instance of this component: it asks its parent (`reload`).
 */
@Component({
  selector: 'ts-dashboard-view',
  templateUrl: './dashboard.html',
  styleUrl: './dashboard.scss',
  // the Java CSS / engine rely on global selectors and on HTML strings written by the engine
  encapsulation: ViewEncapsulation.None,
  // whitespace between inline elements is part of the look (Java rendered the markup as written)
  preserveWhitespaces: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class DashboardView {
  protected readonly t = inject(I18n).t;
  protected ini: Ini = NO_TEXT;

  private readonly config = inject(ConfigService);
  private readonly auth = inject(AuthService);
  private readonly router = inject(Router);
  private readonly http = inject(HttpClient);
  private readonly i18n = inject(I18n);
  private readonly cdr = inject(ChangeDetectorRef);
  private stop: (() => void) | undefined;
  private bridgeOff: (() => void) | undefined;
  private destroyed = false;

  /** location.reload() of the page: the parent replaces this component by a fresh one */
  readonly reload = output<void>();

  constructor() {
    void this.start();
    inject(DestroyRef).onDestroy(() => {
      this.destroyed = true;
      this.stop?.();
      this.bridgeOff?.();
    });
  }

  private async start(): Promise<void> {
    const { mock, apiBase, api } = this.config.value;
    const [echarts, backend, frames] = await Promise.all([this.loadEcharts(), this.backend(mock), import('./dashboard-frames')]);
    const session = this.auth.session();
    // the branch of the signed-in user: Java's ss_branch_code (empty = "all", like the page does)
    const ggwBranch = session?.branchCode ?? '';
    const initial = await backend.initial(ggwBranch);
    if (this.destroyed) return;

    // the server-rendered texts of the template, then the engine (it binds to the DOM the template has now)
    this.ini = initial;
    this.cdr.detectChanges();

    const frameOptions = { ggwBranch, goldApi: api.dashboard, employeeCode: session?.employeeCode ?? '', username: session?.username ?? '', ctx: '' };
    // the iframes (srcdoc, same origin) reach the backend through the page
    this.bridgeOff = frames.installFrameBridge((input, init) => backend.fetch(input, init));
    const env: DashboardEnv = {
      t: (key) => this.i18n.t(key),
      fetch: (input, init) => backend.fetch(String(input), init),
      echarts,
      initial: (name) => (initial as unknown as Record<string, unknown>)[name],
      ctx: apiBase,
      dbApiBase: '/dashboard',
      sunApi: `${api.dashboard}/sundashboard`,
      goldApi: api.dashboard,
      ggwBranch,
      pagePath: '/dashboard',
      frame: (kind) => frames.dashboardFrame(kind, backend, frameOptions),
      navigate: (url) => void this.router.navigateByUrl(url),
      reload: () => this.reload.emit(),
    };
    if (this.destroyed) return;
    this.stop = startDashboard(env);
  }

  /** the ECharts module (Java: <script src="js/echarts-5.6.0/echarts.min.js">) — a method so that a test can hand in a stand-in (no canvas in jsdom) */
  protected loadEcharts(): Promise<unknown> {
    return import('echarts');
  }

  private async backend(mock: boolean): Promise<DashboardBackend> {
    if (mock) return (await import('./dashboard.mock')).createMockDashboard();
    const session = this.auth.session();
    const deps: LiveDeps = {
      call: async (method, url, body, headers) => {
        try {
          const r = await firstValueFrom(this.http.request(method, url, { body, headers, observe: 'response', responseType: 'text' }));
          return { status: r.status, text: r.body ?? '' };
        } catch (e) {
          // the interceptors turn a non-2xx answer into an ApiError that still carries the raw body
          const status = e instanceof ApiError ? e.status : e instanceof HttpErrorResponse ? e.status : 0;
          const raw = e instanceof ApiError ? e.options.body : e instanceof HttpErrorResponse ? e.error : '';
          return { status, text: typeof raw === 'string' ? raw : raw == null ? '' : JSON.stringify(raw) };
        }
      },
      dashboardApi: this.config.value.api.dashboard,
      user: { username: session?.username ?? '', employeeCode: session?.employeeCode ?? '' },
    };
    return (await import('./dashboard.live')).createLiveDashboard(deps);
  }
}
