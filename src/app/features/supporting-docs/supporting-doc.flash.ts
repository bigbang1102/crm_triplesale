import type { FacesMessage } from './supporting-doc.logic';

/**
 * `ExternalContext.getFlash().setKeepMessages(true)`: the messages of a save that moved on to the list (the form's growl is gone with the
 * page; the list's growl `sdMessages` shows them once). Held in memory for the one navigation in between.
 */
let kept: FacesMessage[] = [];

export const flash = {
  keep(messages: readonly FacesMessage[]): void {
    kept = [...messages];
  },
  /** the kept messages, once */
  take(): FacesMessage[] {
    const m = kept;
    kept = [];
    return m;
  },
};
