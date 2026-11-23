import { Directive, ElementRef, afterRenderEffect, inject, input, output } from '@angular/core';

/**
 * Infinite scroll for a scrollable container (lists, kanban columns, tables) — the pattern used by
 * lead / activity / home / schedule / work-modal in the Java app: when the user scrolls within
 * `threshold` px of the bottom, ask for the next page; if the content does not fill the container
 * yet, keep asking (auto-fill).
 *
 *   <div class="rows" tsInfiniteScroll [disabled]="loading() || !hasMore()" (loadMore)="next()">
 *
 * Bind `disabled` to "loading OR no more pages". When it turns false again after a page has been
 * rendered, the directive re-checks, which gives auto-fill for free. The parent is responsible for
 * stopping after N consecutive empty pages (the Java code stops after 5).
 */
@Directive({
  selector: '[tsInfiniteScroll]',
  host: { '(scroll)': 'check()' },
})
export class InfiniteScroll {
  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef);

  /** distance from the bottom (px) that triggers loading */
  readonly threshold = input(80);
  readonly disabled = input(false);
  readonly loadMore = output<void>();

  constructor() {
    afterRenderEffect(() => {
      this.disabled(); // re-run after every render in which the flag changed
      this.check();
    });
  }

  protected check(): void {
    if (this.disabled()) return;
    const el = this.host.nativeElement;
    const remaining = el.scrollHeight - el.scrollTop - el.clientHeight;
    if (remaining <= this.threshold()) this.loadMore.emit();
  }
}
