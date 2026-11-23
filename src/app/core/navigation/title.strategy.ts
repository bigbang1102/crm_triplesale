import { Injectable, inject } from '@angular/core';
import { Title } from '@angular/platform-browser';
import { RouterStateSnapshot, TitleStrategy } from '@angular/router';
import { I18n } from '../i18n/i18n.service';
import { PageDef } from './page-registry';

/**
 * Browser tab title = "<page title> · Triple Sale", taken from page-registry.json. A route may carry the title of its Java page
 * as it is (`data.windowTitle`) — the login page's is "Triple Sales - ลงชื่อเข้าใช้".
 */
@Injectable({ providedIn: 'root' })
export class AppTitleStrategy extends TitleStrategy {
  private readonly title = inject(Title);
  private readonly i18n = inject(I18n);

  override updateTitle(snapshot: RouterStateSnapshot): void {
    let route = snapshot.root;
    while (route.firstChild) route = route.firstChild;
    const windowTitle = route.data['windowTitle'] as string | undefined;
    if (windowTitle) {
      this.title.setTitle(windowTitle);
      return;
    }
    const page = route.data['page'] as PageDef | undefined;
    const name = page?.title[this.i18n.lang()];
    this.title.setTitle(name ? `${name} · Triple Sale` : 'Triple Sale');
  }
}
