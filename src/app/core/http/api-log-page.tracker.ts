import { Injectable, inject } from '@angular/core';
import { RoutesRecognized, Router } from '@angular/router';
import { ApiLogService, javaPageName } from './api-log.service';
import type { PageDef } from '@core/navigation/page-registry';

/**
 * Keeps two things of the Java Log that the server did on every page request (started once, when `features.apiLog` is on):
 *
 *   - the page a call belongs to (`ApiLog.pageOf`) — `ApiLogService.currentPage`, named like the Java file (`index.face`);
 *   - `ApiLog.onPageNavigate`: going to another page empties the Log, so it never mixes the calls of a page that is closed with the
 *     one that is open (a change of the query string, or of a tab inside a page, is not a new page).
 *
 * It listens to `RoutesRecognized`: after the navigation started, before the page is created — so the calls the new page makes while it
 * opens already belong to it, and are not wiped.
 */
@Injectable({ providedIn: 'root' })
export class ApiLogPageTracker {
  private readonly log = inject(ApiLogService);
  private lastPath: string | null = null;

  constructor() {
    inject(Router).events.subscribe((event) => {
      if (!(event instanceof RoutesRecognized)) return;
      const path = event.urlAfterRedirects.split(/[?#]/)[0];
      let leaf = event.state.root;
      while (leaf.firstChild) leaf = leaf.firstChild;
      this.log.currentPage = javaPageName(leaf.data['page'] as PageDef | undefined, path);
      if (this.lastPath !== null && path !== this.lastPath) this.log.clear();
      this.lastPath = path;
    });
  }
}
