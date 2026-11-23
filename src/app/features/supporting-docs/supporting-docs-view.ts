import { ChangeDetectionStrategy, Component, DestroyRef, ElementRef, ViewEncapsulation, afterNextRender, inject } from '@angular/core';
import { Router } from '@angular/router';
import { startDragScroll } from '@core/dom/drag-scroll';
import { PermissionService } from '@core/permissions/permission.service';
import { SupportingDocsEnv, startSupportingDocs } from './supporting-docs.engine';

/**
 * The supporting documents hub (`pages/supporting_documents.xhtml`).
 *
 * The template (`supporting-docs.html`) and stylesheet (`supporting-docs.scss`) are the Java page verbatim; the behaviour is
 * `supporting-docs.engine.ts` (a 1:1 port of the page script). The page has no API — the seven rows are in the markup, each behind its
 * feature flag (`can(...)` here, `commonBean.hasFeature(...)` in Java) — so there is no backend and no mock.
 */
@Component({
  selector: 'ts-supporting-docs-view',
  templateUrl: './supporting-docs.html',
  styleUrl: './supporting-docs.scss',
  // the Java CSS / engine rely on global selectors
  encapsulation: ViewEncapsulation.None,
  // whitespace between inline elements is part of the look (Java rendered the markup as written)
  preserveWhitespaces: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  // a page generated from a Java file: global rules that are the Angular shell's own (e.g. the not-allowed cursor of a disabled button) stay out of it (styles/_base.scss)
  host: { 'data-java-page': '' },
})
export class SupportingDocsView {
  private readonly perm = inject(PermissionService);
  private readonly router = inject(Router);
  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef);
  private stop: (() => void) | undefined;
  private stopDragScroll: (() => void) | undefined;
  private destroyed = false;

  private readonly onAnchorClick = (event: MouseEvent): void => this.onClick(event);

  constructor() {
    // the engine binds to the DOM the template has now (rows included): after the first render
    afterNextRender(() => {
      if (this.destroyed) return;
      const env: SupportingDocsEnv = { navigate: (route) => void this.router.navigateByUrl(route) };
      this.stop = startSupportingDocs(env);
      this.stopDragScroll = startDragScroll('.ct-table-wrap'); // drag_scroll.js with data-targets=".ct-table-wrap" in the Java head
    });
    // capture phase: the button's own inline handler (onclick="event.stopPropagation();", verbatim from Java) would hide the click from a bubbling listener
    this.host.nativeElement.addEventListener('click', this.onAnchorClick, true);
    inject(DestroyRef).onDestroy(() => {
      this.destroyed = true;
      this.host.nativeElement.removeEventListener('click', this.onAnchorClick, true);
      this.stop?.();
      this.stopDragScroll?.();
    });
  }

  /** `commonBean.hasFeature('X')` of the Java page */
  protected can(feature: string): boolean {
    return this.perm.has(feature);
  }

  /** `<a href="/crm/…">` (the "เปิดเอกสาร" button): the router instead of a page load; modifier / middle clicks keep their browser meaning */
  protected onClick(event: MouseEvent): void {
    if (event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
    const anchor = (event.target as HTMLElement).closest<HTMLAnchorElement>('a[href^="/crm/"]');
    if (!anchor || anchor.target === '_blank' || !this.host.nativeElement.contains(anchor)) return;
    event.preventDefault();
    void this.router.navigateByUrl(anchor.getAttribute('href') ?? '/');
  }
}
