import { Injectable } from '@angular/core';
import type { QuickChatHandle } from './quick-chat.engine';

/**
 * The "แชท" buttons (side rail, …) ask this service whether the quick chat box takes the click: `true` = the box opened or
 * closed, `false` = no box (not mounted yet, or the user is on the full chat page) and the button navigates as a link would.
 * Java: `window.cbQuickChatGo(url)` of quickchat.xhtml.
 */
@Injectable({ providedIn: 'root' })
export class QuickChatService {
  private handle: QuickChatHandle | undefined;

  register(handle: QuickChatHandle): void {
    this.handle = handle;
  }

  unregister(handle: QuickChatHandle): void {
    if (this.handle === handle) this.handle = undefined;
  }

  toggle(): boolean {
    return this.handle?.toggle() ?? false;
  }
}
