/**
 * The client of the mockup file server (tools/mockup-server.mjs): the documents of Datasource/ and the files of Storage/.
 * Framework-free (plain `fetch`), so the mock backends — which also run in Node — can use it. Every call is safe to make when the server
 * is not running: it answers "nothing" instead of throwing, and the page keeps working from its in-memory seed.
 */

import { localDocName, serverDocName } from '../mock/company-scope';
import { merge } from './mockup-merge';

export const MOCKUP_API = '/mockup-api';

/** the journal `name` of a page is the document `journal.<name>`: the journal of the company now */
const serverJournalName = (name: string): string => serverDocName(`journal.${name}`).slice('journal.'.length);

/** a file kept in Storage/ */
export interface StoredFile {
  id: string;
  name: string;
  type: string;
  size: number;
  /** same-origin address to show or open the file */
  url: string;
}

const HEALTH_TIMEOUT_MS = 1500;

/** true when the file server answers */
export async function mockupServerUp(): Promise<boolean> {
  if (typeof fetch === 'undefined') return false;
  try {
    const res = await fetch(`${MOCKUP_API}/health`, { signal: AbortSignal.timeout(HEALTH_TIMEOUT_MS) });
    return res.ok;
  } catch {
    return false;
  }
}

/** every document of Datasource/, by name; `{}` when the server is not there */
export async function loadDatasource(): Promise<Record<string, unknown>> {
  try {
    const res = await fetch(`${MOCKUP_API}/ds-all`);
    if (!res.ok) return {};
    // only the documents of the company now (and the ones that are nobody's: users, seeds …), under the names the app uses
    const out: Record<string, unknown> = {};
    for (const [serverName, doc] of Object.entries((await res.json()) as Record<string, unknown>)) {
      const name = localDocName(serverName);
      if (name !== undefined) out[name] = doc;
    }
    return out;
  } catch {
    return {};
  }
}

/** the revision the server gave to our last write of each document: what `changes` says about a revision up to it is our own write, not news */
export const ownRevisions = new Map<string, number>();

/** a document as this page last knew it: the revision of the server it was taken at, and the document itself (the base of a merge) */
interface KnownDocument {
  rev: number;
  doc: unknown;
}
const known = new Map<string, KnownDocument>();
const BASE_REV_HEADER = 'x-mockup-base-rev';
const MAX_SAVE_ATTEMPTS = 5;

const copyOf = (value: unknown): unknown => (value === undefined ? undefined : JSON.parse(JSON.stringify(value)));

/** the page read (or was told of) a document at revision `rev`: a later save starts from it, and merges with what others saved since */
export function noteDocument(name: string, doc: unknown, rev: number): void {
  const had = known.get(name);
  if (had && had.rev > rev) return; // an older answer than what we know
  known.set(name, { rev, doc: copyOf(doc) });
}

/** forget what was known (for the tests) */
export function resetKnownForTests(): void {
  known.clear();
  ownRevisions.clear();
  mergedHandler = undefined;
}

let mergedHandler: ((name: string, merged: unknown) => void) | undefined;
/** told when a save had to be merged with the changes of others: the page takes the merged document in (it holds what the others saved, too) */
export function setMergedHandler(handler: ((name: string, merged: unknown) => void) | undefined): void {
  mergedHandler = handler;
}

/**
 * Writes (replaces) one document; false when it could not be saved. The write says which revision of the document the page started from: when
 * somebody saved it after that, the server refuses with their version, the changes of both are merged (mockup-merge.ts) and written again —
 * so two people who edit different records of the same document do not overwrite each other. `overwrite` skips that (a deliberate reset).
 */
export async function saveDocument(name: string, value: unknown, options: { overwrite?: boolean } = {}): Promise<boolean> {
  try {
    let ours = value;
    let merged = false;
    for (let attempt = 0; attempt < MAX_SAVE_ATTEMPTS; attempt += 1) {
      const base = known.get(name);
      const headers: Record<string, string> = { 'content-type': 'application/json' };
      if (!options.overwrite) headers[BASE_REV_HEADER] = String(base?.rev ?? 0);
      const res = await fetch(`${MOCKUP_API}/ds/${encodeURIComponent(serverDocName(name))}`, { method: 'PUT', headers, body: JSON.stringify(ours) });
      if (res.status === 409) {
        const body = (await res.json().catch(() => undefined)) as { rev?: number; doc?: unknown } | undefined;
        if (typeof body?.rev !== 'number') return false;
        const theirs = body.doc ?? undefined;
        if (theirs !== undefined) {
          ours = merge(base?.doc, ours, theirs);
          merged = true;
        }
        known.set(name, { rev: body.rev, doc: copyOf(theirs) });
        continue;
      }
      if (!res.ok) return false;
      const answer = await res.json().catch(() => undefined);
      rememberRevision(name, answer);
      const rev = (answer as { rev?: unknown } | undefined)?.rev;
      if (typeof rev === 'number') known.set(name, { rev, doc: copyOf(ours) });
      if (merged) mergedHandler?.(name, ours);
      return true;
    }
    return false;
  } catch {
    return false;
  }
}

function rememberRevision(name: string, answer: unknown): void {
  const rev = (answer as { rev?: unknown } | undefined)?.rev;
  if (typeof rev === 'number') ownRevisions.set(name, Math.max(rev, ownRevisions.get(name) ?? 0));
}

/** one document as the server has it NOW: `{ found: false }` for a document that is not there, undefined when the server did not answer */
export async function readDocument(name: string): Promise<{ found: boolean; value?: unknown } | undefined> {
  try {
    const res = await fetch(`${MOCKUP_API}/ds/${encodeURIComponent(serverDocName(name))}`, { cache: 'no-store' });
    if (res.status === 404) return { found: false };
    return res.ok ? { found: true, value: await res.json() } : undefined;
  } catch {
    return undefined;
  }
}

/** one entry of a journal, as it is kept on the server (the fields of the call, and who made it) */
export interface JournalRecord {
  method: string;
  url: string;
  body?: string;
  /** who made the call (the id of the page that did) and which of its calls it was */
  by?: string;
  cid?: number;
}

/** appends an entry to the journal of a mock page; the server puts it in a row with the entries of everybody and says which number it got */
export async function appendJournal(name: string, entry: JournalRecord): Promise<{ seq: number; rev: number } | undefined> {
  try {
    const res = await fetch(`${MOCKUP_API}/journal/${encodeURIComponent(serverJournalName(name))}`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(entry) });
    return res.ok ? ((await res.json()) as { seq: number; rev: number }) : undefined;
  } catch {
    return undefined;
  }
}

/** the entries of a journal after the `after`-th one, and how many there are in all; undefined when the server did not answer */
export async function readJournal(name: string, after: number): Promise<{ seq: number; entries: JournalRecord[] } | undefined> {
  try {
    const res = await fetch(`${MOCKUP_API}/journal/${encodeURIComponent(serverJournalName(name))}?after=${after}`, { cache: 'no-store' });
    return res.ok ? ((await res.json()) as { seq: number; entries: JournalRecord[] }) : undefined;
  } catch {
    return undefined;
  }
}

/** where the changes of the data are now: { epoch (the run of the server), rev }; taken BEFORE the documents are loaded so nothing falls in between */
export async function readChangeCursor(): Promise<{ epoch: string; rev: number } | undefined> {
  try {
    const res = await fetch(`${MOCKUP_API}/changes`, { cache: 'no-store' });
    return res.ok ? ((await res.json()) as { epoch: string; rev: number }) : undefined;
  } catch {
    return undefined;
  }
}

/** removes one document (the page starts from its seed again) */
export async function removeDocument(name: string): Promise<boolean> {
  try {
    const res = await fetch(`${MOCKUP_API}/ds/${encodeURIComponent(serverDocName(name))}`, { method: 'DELETE' });
    if (res.ok) {
      const answer = await res.json().catch(() => undefined);
      rememberRevision(name, answer);
      const rev = (answer as { rev?: unknown } | undefined)?.rev;
      if (typeof rev === 'number') known.set(name, { rev, doc: undefined });
    }
    return res.ok;
  } catch {
    return false;
  }
}

/** puts a file in Storage/<folder>/; undefined when the server is not there or refuses it */
export async function uploadFile(file: Blob, name: string, folder = ''): Promise<StoredFile | undefined> {
  try {
    const query = new URLSearchParams({ name, ...(folder === '' ? {} : { folder }) });
    const res = await fetch(`${MOCKUP_API}/storage?${query}`, { method: 'POST', headers: { 'content-type': file.type || 'application/octet-stream' }, body: file });
    return res.ok ? ((await res.json()) as StoredFile) : undefined;
  } catch {
    return undefined;
  }
}

/** the address of a stored file; `download` asks for a "save as" instead of showing it in the page */
export const storedFileUrl = (id: string, download = false): string => `${MOCKUP_API}/storage/${encodeURIComponent(id)}${download ? '?download=1' : ''}`;

/** removes a stored file */
export async function deleteStoredFile(id: string): Promise<boolean> {
  try {
    return (await fetch(`${MOCKUP_API}/storage/${encodeURIComponent(id)}`, { method: 'DELETE' })).ok;
  } catch {
    return false;
  }
}
