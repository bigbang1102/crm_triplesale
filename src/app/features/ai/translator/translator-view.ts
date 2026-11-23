import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  ElementRef,
  ViewEncapsulation,
  afterNextRender,
  inject,
} from '@angular/core';
import { Router } from '@angular/router';
import { AuthService } from '@core/auth/auth.service';
import { ConfigService } from '@core/config/config.service';
import { startDragScroll } from '@core/dom/drag-scroll';
import { DialogService } from '@shared/ui/notify/dialog.service';
import { ToastService } from '@shared/ui/notify/toast.service';
import { SwalOptions, TranslatorEnv, startTranslator } from './translator.engine';

/**
 * The AI Document Translator screen (`pages/ai_translator.xhtml`).
 *
 * The template (`translator.html`) and stylesheet (`translator.scss`) are the Java page verbatim; the behaviour is
 * `translator.engine.ts` (a 1:1 port of the page script). This component only hosts them: it hands the engine its
 * environment (what the Facelets page got from the URL, the template scripts and the server), starts the drag-to-scroll of
 * the table (Java: `<script data-targets=".ait-tbl-wrap">`), turns the in-page link to the customer into SPA navigation and
 * tears everything down on destroy.
 */
@Component({
  selector: 'ts-translator-view',
  templateUrl: './translator.html',
  styleUrl: './translator.scss',
  // the Java CSS / engine rely on global selectors and on HTML strings written by the engine
  encapsulation: ViewEncapsulation.None,
  // whitespace between inline elements is part of the look (Java rendered the markup as written)
  preserveWhitespaces: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { '(click)': 'onClick($event)' },
})
export class TranslatorView {
  /** `data-key="#{commonBean.clientStateKey}"` — scopes the remembered customer / filters to this sign-in */
  protected readonly stateKey = inject(AuthService).stateKey();

  private readonly config = inject(ConfigService);
  private readonly router = inject(Router);
  private readonly dialog = inject(DialogService);
  private readonly toast = inject(ToastService);
  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef);
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

  private async start(): Promise<void> {
    const { apiBase, mock } = this.config.value;
    const real = (input: string, init?: RequestInit) => fetch(input, { credentials: 'same-origin', ...init });

    const env: TranslatorEnv = {
      ctx: apiBase,
      assetBase: 'assets/',
      fetch: real,
      xhr: () => new XMLHttpRequest(),
      open: (url, target) => void window.open(url, target ?? '_blank'),
      swal: (o) => this.swal(o),
    };

    if (mock) {
      // the fake backend is its own chunk: only loaded when `mock: true`
      const fake = await import('./translator.mock');
      const mocked = (input: string) => input.startsWith(`${apiBase}/aitran`) || input.startsWith(`${apiBase}/board/prospect-list`);
      env.fetch = (input, init) => (mocked(String(input)) ? fake.mockTranslatorFetch(input, init, apiBase) : real(input, init));
      env.xhr = () => fake.createMockXhr(apiBase);
      env.open = (url, target) => {
        // quotations / translated files are not real files in dev mode: open a stand-in page
        const doc = fake.mockAitranDocument(url);
        window.open(URL.createObjectURL(new Blob([doc.data], { type: doc.type })), target ?? '_blank');
      };
    }
    if (this.destroyed) return;
    this.stop = startTranslator(env);
    this.stopDragScroll = startDragScroll('.ait-tbl-wrap');
  }

  /**
   * SweetAlert v2 as the page uses it, on the shell's dialogs and toasts:
   *   buttons: false + timer  → a toast (resolves undefined)       buttons: [cancel, ok] → confirm (true | null)
   *   content: {element:'input'} → a text prompt (string | null)   neither → an alert with one button (true)
   */
  private async swal(o: SwalOptions): Promise<unknown> {
    const title = o.title ?? '';
    if (o.buttons === false) {
      const text = o.text ?? title;
      if (o.icon === 'error') this.toast.error(text, o.timer);
      else if (o.icon === 'success') this.toast.success(text, o.timer);
      else this.toast.info(text, o.timer ?? 3000);
      return undefined;
    }
    const [cancelText, okText] = Array.isArray(o.buttons) ? o.buttons : [undefined, undefined];
    if (o.content?.element === 'input') {
      return this.dialog.prompt({ title, text: o.text, placeholder: o.content.attributes?.placeholder, okText, cancelText, icon: o.icon });
    }
    if (Array.isArray(o.buttons)) {
      const ok = await this.dialog.confirm({ title, text: o.text, okText, cancelText, icon: o.icon });
      return ok ? true : null;
    }
    await this.dialog.alert({ title, text: o.text, icon: o.icon });
    return true;
  }

  /** `<a href="/crm/…">` written by the engine → router navigation (no full reload) */
  protected onClick(event: MouseEvent): void {
    if (event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
    const anchor = (event.target as HTMLElement).closest<HTMLAnchorElement>('a[href^="/crm/"]');
    if (!anchor || anchor.target === '_blank' || !this.host.nativeElement.contains(anchor)) return;
    event.preventDefault();
    void this.router.navigateByUrl(anchor.getAttribute('href') ?? '/');
  }
}
