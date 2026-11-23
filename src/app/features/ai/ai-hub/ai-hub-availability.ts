import type { OffReason } from '@core/ai/ai-tool-availability.logic';

export const OFF_CARD = 'a.aih-tool.is-off';

/**
 * Hub home: a card of a tool the service cannot run goes grey, says so, and cannot be opened (`is-off` is styled by the adaptation block of
 * `tools/sync-ai-hub.mjs`; a click on it is stopped by `AiHubView.onClick`). Plain DOM — the markup is the Java page's, generated.
 * The grey cards then move to the END of their group (the usable tools first); the original order is remembered (`data-ord`), so a card that is
 * usable again goes back to its place. Safe to call again when the answer changes.
 */
export function markUnavailableTools(
  root: ParentNode,
  off: Readonly<Record<string, OffReason>>,
  reasonText: (reason: OffReason) => string,
  badgeText: string,
): void {
  for (const card of Array.from(root.querySelectorAll<HTMLAnchorElement>('a.aih-tool'))) {
    const tool = /^\/ai\/hub\/([\w-]+)$/.exec(card.getAttribute('href') ?? '')?.[1];
    const reason = tool ? off[tool] : undefined;
    const badge = card.querySelector('.aih-tool-off');
    if (!reason) {
      badge?.remove();
      card.classList.remove('is-off');
      card.removeAttribute('aria-disabled');
      card.removeAttribute('tabindex');
      card.removeAttribute('title');
      continue;
    }
    card.classList.add('is-off');
    card.setAttribute('aria-disabled', 'true');
    card.setAttribute('tabindex', '-1');
    card.title = reasonText(reason);
    if (!badge) {
      const mark = document.createElement('span');
      mark.className = 'aih-tool-off';
      mark.textContent = badgeText;
      card.querySelector('.aih-tool-txt')?.appendChild(mark);
    }
  }
  moveGreyToTheEnd(root);
}

/** inside each group (the cards of one parent element): usable cards first, grey ones last, each part in its original order */
function moveGreyToTheEnd(root: ParentNode): void {
  const parents = new Set<Element>();
  Array.from(root.querySelectorAll<HTMLElement>('a.aih-tool')).forEach((card, index) => {
    card.dataset['ord'] ??= String(index);
    if (card.parentElement) parents.add(card.parentElement);
  });
  for (const parent of parents) {
    const cards = Array.from(parent.querySelectorAll<HTMLElement>(':scope > a.aih-tool'));
    const wanted = [...cards].sort(
      (a, b) =>
        Number(a.classList.contains('is-off')) - Number(b.classList.contains('is-off')) ||
        Number(a.dataset['ord']) - Number(b.dataset['ord']),
    );
    if (wanted.every((card, i) => card === cards[i])) continue;
    // every card is inserted right before the node that followed the last card, so they end up in the wanted order
    const after = cards[cards.length - 1].nextSibling;
    for (const card of wanted) parent.insertBefore(card, after);
  }
}

/**
 * The Java page says everywhere that a song has no singing voice. When the service can sing (`music.vocals`), the music card, the tool header
 * and the note under the form say what really happens instead. Plain DOM, safe to repeat; `false` leaves the page as generated.
 */
export function markMusicVocals(
  root: ParentNode,
  vocals: boolean,
  texts: { subtitle: string; note: string },
): void {
  if (!vocals) return;
  const card = root.querySelector('a.aih-tool[href="/ai/hub/music"] .aih-tool-txt small');
  if (card) card.textContent = texts.subtitle;
  const view = root.querySelector('.aih-view[data-tool="music"]');
  const head = view?.querySelector('.aih-head-title small');
  if (head) head.textContent = texts.subtitle;
  const note = view?.querySelector('.aih-note.tip span');
  if (note) note.textContent = texts.note;
}
