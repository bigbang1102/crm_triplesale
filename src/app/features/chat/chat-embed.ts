import { ChangeDetectionStrategy, Component, DestroyRef, computed, inject } from '@angular/core';
import { DomGuards } from '@core/dom/dom-guards';
import { I18n } from '@core/i18n/i18n.service';
import { ChatView } from './chat-view';

/** keys quickchat.xhtml writes to sessionStorage: the room that was open before the page changed */
const ROOM_KEY = 'qc_room';

interface ChatEmbedFlags {
  CB_EMBED?: boolean;
  CB_ROOM?: unknown;
  CB_ROOM_OPEN?: boolean;
}

/** the room left open in the box: `{ room, open }` (room = chat id, open = the conversation screen rather than the list) */
function savedRoom(): { room: unknown; open: boolean } | undefined {
  try {
    const raw: unknown = JSON.parse(sessionStorage.getItem(ROOM_KEY) ?? 'null');
    if (raw && typeof raw === 'object' && 'room' in raw && raw.room !== null && raw.room !== undefined) {
      return { room: raw.room, open: 'open' in raw && raw.open === true };
    }
  } catch {
    // unreadable value = no saved room
  }
  return undefined;
}

/**
 * The chat page in embed mode (`/chat-embed`) — what the quick chat box of every page loads in its iframe (Java: chatbot.face
 * fetched with `embed=1` and put in `srcdoc` after quickchat.xhtml injected `window.CB_EMBED`). It lives outside the Shell, so
 * there is no menu, top bar or footer to hide; the page script and the `.cb-embed` rules of chat.scss do the rest.
 */
@Component({
  selector: 'ts-chat-embed',
  imports: [ChatView],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @for (key of keys(); track key) {
      <ts-chat-view />
    }
  `,
})
export class ChatEmbed {
  private readonly lang = inject(I18n).lang;
  protected readonly keys = computed(() => [this.lang()]);

  constructor() {
    const flags = window as unknown as ChatEmbedFlags;
    const room = savedRoom();
    flags.CB_EMBED = true;
    if (room) {
      flags.CB_ROOM = room.room;
      flags.CB_ROOM_OPEN = room.open;
    }
    document.documentElement.classList.add('cb-embed');

    // quickchat.xhtml: a `<a href="#">` in a srcdoc must not load the parent page again — here it would route the frame to "/"
    const stopHashLinks = (e: MouseEvent) => {
      const a = (e.target as Element | null)?.closest?.('a');
      if (a?.getAttribute('href')?.startsWith('#')) e.preventDefault();
    };
    document.addEventListener('click', stopHashLinks, true);

    // what template.xhtml loads for every signed-in page (the Shell starts it for the other routes)
    const guards = inject(DomGuards);
    guards.start();

    inject(DestroyRef).onDestroy(() => {
      document.removeEventListener('click', stopHashLinks, true);
      guards.stop();
      document.documentElement.classList.remove('cb-embed');
      delete flags.CB_EMBED;
      delete flags.CB_ROOM;
      delete flags.CB_ROOM_OPEN;
    });
  }
}
