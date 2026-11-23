import { clearOptionCache } from '../live/options-cache';
declare global {
  interface Window {
    /** ai-fab.engine.ts — forgets the chat with the help assistant (Java: called by template.xhtml when signing out) */
    aiHelpForget?: () => void;
  }
}

/**
 * Clears what is bound to "the person who is signed in" before signing out (template.xhtml `clearSessionUi()`): the chat
 * with the help assistant lives in sessionStorage so that it survives navigation, but must be gone the moment the user
 * leaves — the next person on a shared machine must not see it. ts_login / ts_username are deliberately not touched.
 *
 * The filter states the Java servlets kept in the HttpSession (`ld_filter_state`, `ld_detail_filter_state`, `sc_filter_state` …) live in
 * sessionStorage under `ts.<page>.filter-state:<username>` (core/live/*.live.ts): Java destroyed the session at logout, so they go too.
 */
export function clearSessionUi(): void {
  try {
    if (typeof window.aiHelpForget === 'function') window.aiHelpForget();
    else sessionStorage.removeItem('ai_help_chat');
    clearFilterStates();
    clearOptionCache();
  } catch {
    /* storage is blocked = there is nothing to clear */
  }
}

/** forgets the filter states of the pages (what the HttpSession held in Java) */
export function clearFilterStates(): void {
  try {
    for (const key of Object.keys(sessionStorage)) if (/^ts\.[\w-]+\.filter-state:/.test(key)) sessionStorage.removeItem(key);
  } catch {
    /* storage is blocked = there is nothing to clear */
  }
}
