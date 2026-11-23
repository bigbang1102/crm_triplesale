import { DestroyRef, Directive, ElementRef, inject, signal } from '@angular/core';

/**
 * Click-and-drag horizontal scrolling for wide tables / kanban boards / channel rows
 * (`drag_scroll.js` in the Java app). Clicks on interactive children still work; a drag longer
 * than 4 px swallows the click that would follow it (captured before children see it).
 *
 *   <div class="table-wrap" tsDragScroll>…</div>
 */
@Directive({
  selector: '[tsDragScroll]',
  host: {
    '(mousedown)': 'down($event)',
    '[style.cursor]': "dragging() ? 'grabbing' : null",
    '[style.user-select]': "dragging() ? 'none' : null",
  },
})
export class DragScroll {
  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef);

  protected readonly dragging = signal(false);
  private startX = 0;
  private startScroll = 0;
  private moved = 0;

  private readonly onMove = (e: MouseEvent) => {
    const dx = e.clientX - this.startX;
    this.moved = Math.max(this.moved, Math.abs(dx));
    this.host.nativeElement.scrollLeft = this.startScroll - dx;
  };

  private readonly onUp = () => {
    this.dragging.set(false);
    document.removeEventListener('mousemove', this.onMove);
    document.removeEventListener('mouseup', this.onUp);
  };

  private readonly onClickCapture = (e: MouseEvent) => {
    if (this.moved > 4) {
      e.stopPropagation();
      e.preventDefault();
    }
    this.moved = 0;
  };

  constructor() {
    const el = this.host.nativeElement;
    el.addEventListener('click', this.onClickCapture, true);
    inject(DestroyRef).onDestroy(() => {
      el.removeEventListener('click', this.onClickCapture, true);
      this.onUp();
    });
  }

  protected down(e: MouseEvent): void {
    if (e.button !== 0) return;
    if ((e.target as HTMLElement).closest('input,select,textarea,button,a,[contenteditable]')) return;
    this.dragging.set(true);
    this.moved = 0;
    this.startX = e.clientX;
    this.startScroll = this.host.nativeElement.scrollLeft;
    document.addEventListener('mousemove', this.onMove);
    document.addEventListener('mouseup', this.onUp);
  }
}
