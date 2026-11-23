import { ChangeDetectionStrategy, Component, DestroyRef, Injector, ViewEncapsulation, afterNextRender, inject, input } from '@angular/core';
import { Title } from '@angular/platform-browser';
import { ConfigService } from '@core/config/config.service';
import { startDragScroll } from '@core/dom/drag-scroll';
import { I18n } from '@core/i18n/i18n.service';
import { restDepsOf } from '@core/live/rest-deps';
import { DrilldownBackend } from './drilldown-backend';
import { DrilldownEnv, startDrilldown } from './drilldown.engine';

/**
 * The DrillDown screen (`pages/drilldown.xhtml`).
 *
 * The template (`drilldown.html`) and stylesheet (`drilldown.scss`) are the Java page verbatim; the behaviour is
 * `drilldown.engine.ts` (a 1:1 port of the page script). This component only hosts them: it gives the engine its environment
 * (what the Facelets page got from the session, the template and the URL: the language, the texts, the report code) and the
 * backend, starts the drag-to-scroll of the table (Java: `<script src=drag_scroll.js data-targets=".ct-table-wrap">`) and stops
 * everything on destroy.
 *
 * The engine edits the template's DOM, so "load the page again" (Java: a language switch reloads it, and so does a link to another
 * report) is a NEW instance of this component: the route component (`drilldown.ts`) replaces it.
 */
@Component({
  selector: 'ts-drilldown-view',
  templateUrl: './drilldown.html',
  styleUrl: './drilldown.scss',
  // the Java CSS / engine rely on global selectors and on HTML strings written by the engine
  encapsulation: ViewEncapsulation.None,
  // whitespace between inline elements is part of the look (Java rendered the markup as written)
  preserveWhitespaces: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  // data-java-page: the shell's `button:disabled { cursor: not-allowed }` (styles/_base.scss) stays out of a page generated from Java
  host: { 'data-java-page': '' },
})
export class DrilldownView {
  protected readonly t = inject(I18n).t;

  /** the report code of the page address (`?code=` in Java, `:code` of the route) */
  readonly code = input('');

  private readonly i18n = inject(I18n);
  private readonly title = inject(Title);
  private readonly mock = inject(ConfigService).value.mock;
  private readonly injector = inject(Injector);
  private stop: (() => void) | undefined;
  private stopDragScroll: (() => void) | undefined;
  private destroyed = false;

  constructor() {
    afterNextRender(() => void this.start());
    inject(DestroyRef).onDestroy(() => {
      this.destroyed = true;
      this.stop?.();
      this.stopDragScroll?.();
    });
  }

  /** the backend is its own chunk: the sample data in mock mode, the REST calls otherwise (a method so that a test can hand in another backend) */
  protected async backend(): Promise<DrilldownBackend> {
    if (this.mock) return (await import('./drilldown.mock')).createMockDrilldown();
    return (await import('./drilldown.live')).createLiveDrilldown(restDepsOf(this.injector));
  }

  private async start(): Promise<void> {
    const backend = await this.backend();
    if (this.destroyed) return;
    const env: DrilldownEnv = {
      t: (key) => this.i18n.t(key),
      lang: this.i18n.lang(),
      api: '/board/drilldown',
      code: this.code(),
      setTitle: (title) => this.title.setTitle(title),
      fetch: (input, init) => backend.fetch(String(input), init),
    };
    this.stop = startDrilldown(env);
    this.stopDragScroll = startDragScroll('.ct-table-wrap');
  }
}
