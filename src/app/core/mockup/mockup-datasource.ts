/**
 * The data of the mock pages as documents of Datasource/ (the file server, tools/mockup-server.mjs).
 *
 * Two kinds of document:
 *   - hand-made ones (users, roles …): read with `datasourceDoc(name)`; a person edits the file;
 *   - the state of a mock backend that lives in memory (the leads of the Activities mock, the customers of the Prospects mock …): a mock
 *     asks `persistedState(name, build)` for it. The first `get()` restores the saved document (`state.<name>.json`), or builds the seed;
 *     `touch()` after every change saves it again (debounced), so a reload or a restart of the server keeps what was added / edited / deleted.
 *
 * Framework-free, and harmless without the server (nothing is restored, nothing is saved) — the mocks also run in Node for the tests.
 */
import { removeDocument, saveDocument } from './mockup-client';
import { onDocumentChanged } from './mockup-registry';

const STATE_PREFIX = 'state.';
const SAVE_DELAY_MS = 400;

let enabled = false;
let documents: Record<string, unknown> = {};

/** the preload of the app: the documents that were found on the server (`enabled` = it is there, so changes are saved) */
export function setDatasource(all: Record<string, unknown>, serverUp: boolean): void {
  documents = all;
  enabled = serverUp;
}

export const mockupEnabled = (): boolean => enabled;

/** a document changed on the server (somebody else wrote it): the copy in memory follows; undefined = it was removed */
export function setDocument(name: string, value: unknown): void {
  if (value === undefined) delete documents[name];
  else documents[name] = value;
}

/** a hand-made document of Datasource/, or undefined */
export function datasourceDoc<T>(name: string): T | undefined {
  return documents[name] as T | undefined;
}

/* ------------------------------------------------------------------ JSON that keeps a Map and a Set */
export function serialize(value: unknown): unknown {
  return JSON.parse(
    JSON.stringify(value, (_key, v: unknown) => {
      if (v instanceof Map) return { $map: [...v.entries()] };
      if (v instanceof Set) return { $set: [...v.values()] };
      return v;
    }),
  );
}

export function revive<T>(value: unknown): T {
  return JSON.parse(
    JSON.stringify(value),
    (_key, v: unknown) => {
      if (v && typeof v === 'object') {
        const o = v as { $map?: [unknown, unknown][]; $set?: unknown[] };
        if (Array.isArray(o.$map)) return new Map(o.$map);
        if (Array.isArray(o.$set)) return new Set(o.$set);
      }
      return v;
    },
  ) as T;
}

/* ------------------------------------------------------------------ the state of a mock backend */
export interface PersistedState<T> {
  /** the state: restored from Datasource on the first call, else built from the seed */
  get(): T;
  /** the state was changed: save it */
  touch(): void;
  /** forget it (and its document): the next `get()` builds the seed again */
  reset(): void;
}

const registry: PersistedState<unknown>[] = [];

export function persistedState<T>(name: string, build: () => T): PersistedState<T> {
  const docName = `${STATE_PREFIX}${name}`;
  let current: T | undefined;
  let timer: ReturnType<typeof setTimeout> | undefined;
  const state: PersistedState<T> = {
    get() {
      if (current === undefined) {
        const saved = documents[docName];
        current = saved === undefined ? build() : revive<T>(saved);
      }
      return current;
    },
    touch() {
      if (!enabled || current === undefined) return;
      clearTimeout(timer);
      timer = setTimeout(() => {
        if (current !== undefined) void saveDocument(docName, serialize(current));
      }, SAVE_DELAY_MS);
    },
    reset() {
      clearTimeout(timer);
      current = undefined;
      delete documents[docName];
      if (enabled) void removeDocument(docName);
    },
  };
  // somebody else saved this state (a write of the whole document): it is the state now (not saved again — it is already there)
  onDocumentChanged(docName, (value) => {
    clearTimeout(timer);
    current = value === undefined ? undefined : revive<T>(value);
  });
  registry.push(state as PersistedState<unknown>);
  return state;
}

/** the mock answers like a server: a call that is not a read changes the state, so save it after the answer */
export function savingAfterWrites<A extends unknown[], R>(state: Pick<PersistedState<unknown>, 'touch'>, fetchLike: (...args: A) => Promise<R>, methodOf: (...args: A) => string): (...args: A) => Promise<R> {
  return async (...args: A) => {
    const out = await fetchLike(...args);
    if (!/^(GET|HEAD|OPTIONS)$/i.test(methodOf(...args))) state.touch();
    return out;
  };
}

/** for the tests: back to "no server, nothing restored" */
export function resetMockupForTests(): void {
  enabled = false;
  documents = {};
  registry.length = 0;
}
