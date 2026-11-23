/**
 * What the others did, at once. The data of the mockup is ONE state on the shared file server; this is how a page hears of a change somebody else made,
 * the way a client of an API would: it keeps a request open (`GET /mockup-api/changes?since=<rev>`, a long poll), the server answers it the moment any
 * document or journal changes, and the client takes the change in:
 *
 *   - a journal that a mock page uses (`journal.<name>`): its `pull()` fetches the entries it has not seen and plays them (mockup-journal.ts);
 *   - any other document (`state.*`, `shared-db`, `ts.mock.*` …): read again, put in the copy in memory, and whoever registered a listener for it
 *     (mockup-registry.ts) takes it in;
 *
 * Nothing is announced and the page never loads itself again: what the others did is taken in silently and shows with the next load.
 *
 * Framework-free. Nothing happens without the server (`startLive` is only called when it answered).
 */
import { MOCKUP_API, noteDocument, ownRevisions, readDocument, setMergedHandler } from './mockup-client';
import { localDocName } from '../mock/company-scope';
import { setDocument } from './mockup-datasource';
import { clearRegistry, documentListeners, familyListeners, journalPulls } from './mockup-registry';

/** the page (tab) that makes the calls: the entries it writes carry it, so a page can tell its own entries from the others' */
export const CLIENT_ID: string = (() => {
  const bytes = new Uint8Array(6);
  globalThis.crypto?.getRandomValues?.(bytes);
  return Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('') || String(Math.random()).slice(2, 14);
})();

const WAIT_MS = 25000;
const RETRY_MS = 3000;

let epoch: string | undefined;
let rev = 0;
let running = false;
let controller: AbortController | undefined;

async function take(change: { name: string; rev: number }): Promise<void> {
  const name = localDocName(change.name); // another company's document is not news here
  if (name === undefined) return;
  if (name.startsWith('journal.')) {
    const pull = journalPulls.get(name.slice('journal.'.length));
    if (pull) {
      await pull();
      return;
    }
  } else if ((ownRevisions.get(name) ?? 0) >= change.rev) {
    return; // our own write
  }
  const read = await readDocument(name);
  if (!read) return;
  const value = read.found ? read.value : undefined;
  noteDocument(name, value, change.rev); // the base of this page's next save of it
  applyDocument(name, value);
}

/** puts a document in the copy in memory and tells whoever holds it; true when somebody did */
function applyDocument(name: string, value: unknown): boolean {
  setDocument(name, value);
  const listeners = [...(documentListeners.get(name) ?? [])];
  const family = familyListeners.filter((f) => name.startsWith(f.prefix));
  for (const listener of listeners) listener(value);
  for (const f of family) f.listener(name, value);
  return listeners.length + family.length > 0;
}

async function loop(signal: AbortSignal): Promise<void> {
  while (running && !signal.aborted) {
    try {
      const res = await fetch(`${MOCKUP_API}/changes?since=${rev}&wait=${WAIT_MS}`, { signal, cache: 'no-store' });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const body = (await res.json()) as { epoch: string; rev: number; changed: Array<{ name: string; rev: number }> };
      if (epoch !== undefined && body.epoch !== epoch) {
        // the server was started again: the revisions begin anew (what the page holds is not changed; the next load agrees with the server)
        epoch = body.epoch;
        rev = body.rev;
        continue;
      }
      for (const change of body.changed) {
        try {
          await take(change);
        } catch {
          // one change that cannot be taken in does not stop the others
        }
      }
      rev = body.rev;
    } catch {
      if (signal.aborted) return;
      await new Promise((r) => setTimeout(r, RETRY_MS));
    }
  }
}

/** starts listening for the changes of the others, from the revision the app took before it loaded the documents */
export function startLive(cursor: { epoch: string; rev: number }): void {
  if (running) return;
  epoch = cursor.epoch;
  rev = cursor.rev;
  running = true;
  // a save that had to be merged with what others saved: this page holds the merged document now
  setMergedHandler((name, merged) => {
    applyDocument(name, merged);
  });
  controller = new AbortController();
  void loop(controller.signal);
}

/** for the tests and when the page goes away */
export function stopLive(): void {
  running = false;
  controller?.abort();
  controller = undefined;
  setMergedHandler(undefined);
  clearRegistry();
  epoch = undefined;
  rev = 0;
}
