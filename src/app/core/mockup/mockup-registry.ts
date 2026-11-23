/**
 * Who wants to hear that somebody else changed a piece of the shared data (mockup-live.ts calls them). Kept apart from the rest so that the modules that
 * hold the data (mockup-datasource.ts, mockup-journal.ts) can register without depending on the one that listens to the server. Framework-free.
 */
/** fetches and plays what the others added to a journal; answers how many entries it played */
export type JournalPull = () => Promise<number>;
/** takes in a document somebody else wrote (`undefined` = it was removed) */
export type DocumentListener = (value: unknown) => void;
/** takes in a document of a family of names (`ts.mock.` …) */
export type FamilyListener = (name: string, value: unknown) => void;

export const journalPulls = new Map<string, JournalPull>();
export const documentListeners = new Map<string, Set<DocumentListener>>();
export const familyListeners: Array<{ prefix: string; listener: FamilyListener }> = [];

/** a mock page that keeps a journal: `pull` fetches and plays what the others added */
export function onJournalChanged(name: string, pull: JournalPull): void {
  journalPulls.set(name, pull);
}

/** the copy in memory of one document follows what somebody else wrote */
export function onDocumentChanged(name: string, listener: DocumentListener): void {
  let set = documentListeners.get(name);
  if (!set) documentListeners.set(name, (set = new Set()));
  set.add(listener);
}

/** the same for every document whose name starts with `prefix` */
export function onDocumentFamilyChanged(prefix: string, listener: FamilyListener): void {
  familyListeners.push({ prefix, listener });
}

export function clearRegistry(): void {
  journalPulls.clear();
  documentListeners.clear();
  familyListeners.length = 0;
}
