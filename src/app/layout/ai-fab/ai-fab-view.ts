import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  ElementRef,
  ViewEncapsulation,
  afterNextRender,
  inject,
} from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { NavigationEnd, Router } from '@angular/router';
import { AuthService } from '@core/auth/auth.service';
import { ConfigService } from '@core/config/config.service';
import { javaPageNames } from '@core/dom/page-names';
import { I18n } from '@core/i18n/i18n.service';
import { PAGES, type PageDef } from '@core/navigation/page-registry';
import { filter } from 'rxjs';
import type { AiFabEnv, AiFabHandle } from './ai-fab.engine';

/**
 * The floating AI button and the "สอบถามการใช้งาน" window (`WEB-INF/pages/ai_menu.xhtml`, included by template.xhtml).
 *
 * The template (`ai-fab.html`) and stylesheet (`ai-fab.scss`) are the Java include verbatim; the behaviour is
 * `ai-fab.engine.ts` (a 1:1 port of its script). This component only hosts them: it hands the engine its environment,
 * tells it when the page changed (the quick questions follow the page) and tears it down on destroy. `AiFab` re-creates
 * it when the language changes, like the page reload of the Java app.
 */
@Component({
  selector: 'ts-ai-fab-view',
  templateUrl: './ai-fab.html',
  styleUrl: './ai-fab.scss',
  // the Java CSS / engine rely on global selectors and on HTML strings written by the engine
  encapsulation: ViewEncapsulation.None,
  // whitespace between inline elements is part of the look (Java rendered the markup as written)
  preserveWhitespaces: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AiFabView {
  private readonly config = inject(ConfigService);
  private readonly auth = inject(AuthService);
  private readonly i18n = inject(I18n);
  private readonly router = inject(Router);
  private handle: AiFabHandle | undefined;
  private destroyed = false;

  constructor() {
    afterNextRender(() => void this.start());
    this.router.events
      .pipe(
        filter((e) => e instanceof NavigationEnd),
        takeUntilDestroyed(),
      )
      .subscribe(() => this.handle?.pageChanged());
    inject(DestroyRef).onDestroy(() => {
      this.destroyed = true;
      this.handle?.destroy();
    });
  }

  private async start(): Promise<void> {
    const { apiBase, mock } = this.config.value;
    const real = (input: string, init?: RequestInit) => fetch(input, { credentials: 'same-origin', ...init });

    const env: AiFabEnv = {
      ctx: apiBase,
      lang: this.i18n.lang(),
      assetBase: 'assets/',
      who: () => this.auth.session()?.username ?? '',
      pageKey: () => this.pageKey(),
      openPage: (url) => this.openPage(url),
      fetch: real,
    };

    if (mock) {
      // the fake assistant is its own chunk: only loaded when `mock: true`
      const fake = await import('./ai-fab.mock');
      env.fetch = (input, init) => (String(input).startsWith(`${apiBase}/help-api/`) ? fake.mockHelpFetch(input, init, apiBase) : real(input, init));
      env.helpImageUrl = fake.mockHelpImageUrl;
    }
    // the engine is its own chunk: the button is on every page, but nobody waits for ~90 kB of script to see the shell
    const { startAiFab } = await import('./ai-fab.engine');
    if (this.destroyed) return;
    this.handle = startAiFab(env);
  }

  /** the Java page of the active route as the file name its URL had ("lead.face") — what the assistant is told */
  private pageKey(): string {
    const name = javaPageNames(this.activePage()?.legacy)[0];
    return name ? `${name}.face` : '';
  }

  /** a menu item of type "page" (`ai_translator.face?pid=…`): the route that replaces that Java page */
  private openPage(url: string): void {
    const name = (/^([A-Za-z0-9_]+)\.face/.exec(String(url).split('?')[0]) ?? [])[1]?.toLowerCase();
    const page = name ? PAGES.find((p) => !p.route.includes(':') && javaPageNames(p.legacy).includes(name)) : undefined;
    if (page) void this.router.navigateByUrl('/' + page.route);
  }

  private activePage(): PageDef | undefined {
    let route = this.router.routerState.snapshot.root;
    while (route.firstChild) route = route.firstChild;
    return route.data['page'] as PageDef | undefined;
  }
}
