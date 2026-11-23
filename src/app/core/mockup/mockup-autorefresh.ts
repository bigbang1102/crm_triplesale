/**
 * Loads the page again by itself after somebody else changed the data it shows — but only when that cannot cost the user anything.
 *
 * The pages are generated from Java screens and keep their own state in the DOM, so the data a page shows is refreshed by loading it again. A
 * reload under the hands of somebody who is typing, or has a dialog open, or a form half filled would lose what they did, so the page waits until none
 * of that is so (the notice stays up meanwhile, with its button for the user to decide), looking again every few seconds:
 *
 *   - a dialog / popup is open, or a field has the focus (input, textarea, select, editable text);
 *   - a form field was changed by the user and not saved (`.ng-dirty`);
 *   - the user typed or changed something in the last 10 seconds;
 *   - the page is a form (new / edit / create / form in the address);
 *   - the page was loaded again by this very thing a moment ago (never a loop).
 *
 * Turned off for a browser with `localStorage['ts.mockup.autoRefresh'] = 'off'`. Framework-free.
 */
const SWITCH_KEY = 'ts.mockup.autoRefresh';
const LAST_KEY = 'ts.mockup.autoRefreshAt';
export const QUIET_MS = 10000;
export const DELAY_MS = 1200;
export const RETRY_MS = 3000;
const MIN_GAP_MS = 8000;

/** what means "something is open on the page that a reload would take away" */
const OPEN_THINGS = [
  'dialog[open]',
  '[role="dialog"]',
  '[aria-modal="true"]',
  '.swal-overlay--show-modal',
  '.swal2-container',
  '.modal.show',
  '.p-dialog',
  '.ui-dialog:not([style*="display: none"])',
  '.cdk-overlay-pane',
  '.ts-modal',
].join(',');
const FORM_ROUTE = /(^|[/_-])(new|edit|create|form|add)([/_?-]|$)|action_type=/i;
const TYPING_EVENTS = ['keydown', 'input', 'change', 'paste'] as const;

let lastTypedAt = 0;
let watching = false;
let timer: ReturnType<typeof setTimeout> | undefined;

/** remembers when the user last typed or changed something (the page must be quiet for a while before it is loaded again) */
export function watchUserInput(): void {
  if (watching || typeof document === 'undefined') return;
  watching = true;
  const note = (): void => void (lastTypedAt = Date.now());
  for (const type of TYPING_EVENTS) document.addEventListener(type, note, { capture: true, passive: true });
}

function readStorage(key: string): string | null {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

function readSession(key: string): string | null {
  try {
    return sessionStorage.getItem(key);
  } catch {
    return null;
  }
}

export const autoRefreshOn = (): boolean => readStorage(SWITCH_KEY) !== 'off';

/** a popup that is in the page all the time but hidden (the help panel, the chat box) is not "open" */
function isShown(element: Element): boolean {
  if (element.closest('[aria-hidden="true"]')) return false;
  const style = getComputedStyle(element);
  // an empty opacity = not computed (jsdom) — not "0", so the element is not hidden by it
  const isTransparent = style.opacity !== '' && Number(style.opacity) === 0;
  if (style.display === 'none' || style.visibility === 'hidden' || isTransparent) return false;
  return true;
}

function isEditing(active: Element | null): boolean {
  if (!active) return false;
  const tag = active.tagName;
  return tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || (active as HTMLElement).isContentEditable === true;
}

/** true when loading the page again takes nothing away from the user */
export function isSafeToRefresh(now: number = Date.now()): boolean {
  if (typeof document === 'undefined') return false;
  if (isEditing(document.activeElement)) return false;
  if ([...document.querySelectorAll(OPEN_THINGS)].some(isShown)) return false;
  if (document.querySelector('.ng-dirty')) return false;
  if (now - lastTypedAt < QUIET_MS) return false;
  if (FORM_ROUTE.test(`${location.pathname}${location.search}`)) return false;
  const last = Number(readSession(LAST_KEY) ?? 0);
  return !(last > 0 && now - last < MIN_GAP_MS);
}

/** the page was loaded again by this: the next one must not come at once */
function markReloaded(): void {
  try {
    sessionStorage.setItem(LAST_KEY, String(Date.now()));
  } catch {
    // the page loads again all the same
  }
}

/**
 * Loads the page again when it is safe: after a short delay (a burst of changes is one reload), and checked again just before it is done. When it is not
 * safe the check is repeated until it is — or until the user takes the button of the notice. `told` hears what is going to happen (for the notice).
 */
export function scheduleAutoRefresh(options: { reload?: () => void; told?: (state: 'soon' | 'waiting') => void } = {}): void {
  if (!autoRefreshOn() || timer !== undefined) return;
  const reload = options.reload ?? ((): void => location.reload());
  const attempt = (first: boolean): void => {
    timer = undefined;
    if (isSafeToRefresh()) {
      options.told?.('soon');
      timer = setTimeout(() => {
        timer = undefined;
        if (!isSafeToRefresh()) return scheduleAgain();
        markReloaded();
        reload();
      }, DELAY_MS);
      return;
    }
    if (first) options.told?.('waiting');
    scheduleAgain();
  };
  const scheduleAgain = (): void => {
    timer = setTimeout(() => attempt(false), RETRY_MS);
  };
  attempt(true);
}

/** for the tests and when the live connection is stopped */
export function stopAutoRefresh(): void {
  clearTimeout(timer);
  timer = undefined;
  lastTypedAt = 0;
}

/** for the tests: the user typed at this time */
export function typedAtForTests(at: number): void {
  lastTypedAt = at;
}
