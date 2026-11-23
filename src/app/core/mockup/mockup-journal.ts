/**
 * Keeps the changes a user makes in a mock page — for EVERYBODY, at once, the way the calls of an API would.
 *
 * A mock backend answers the BFF / REST contract of its page from an in-memory model built from the seed. Instead of saving that model
 * (its objects are tied to the seed's constants and it differs for every mock), the WRITE calls it answered are put in the journal
 * `journal.<name>` of the shared file server — `[{ "method": "POST", "url": "../board/contact-activities", "body": "{…}" }]` — which is ONE row of
 * calls for all the developers: the server numbers them in the order they arrive. Every page plays the calls in that order against the model it has
 * (the mock handles them exactly as it did the first time, so its counters and rules come out the same on every machine); a page that starts plays the
 * whole row first, and one that is open plays the calls of the others as they come (mockup-live.ts tells it). The file is readable: it says what was
 * added, edited or deleted, in order.
 *
 * A call of this page is sent to the server FIRST and played here at the place the server gave it (after every call that arrived before it): the
 * answer waits for that, one round trip.
 *
 * Without the file server nothing is recorded and nothing is replayed.
 */
import { CLIENT_ID } from './mockup-live';
import { onJournalChanged } from './mockup-registry';
import { appendJournal, readJournal, saveDocument, type JournalRecord } from './mockup-client';
import { datasourceDoc, mockupEnabled } from './mockup-datasource';

export interface JournalEntry {
  method: string;
  url: string;
  /** the text body of the call (JSON / form); a call with a binary body is not recorded here (its file goes to Storage/) */
  body?: string;
}

export type FetchLike = (input: string, init?: RequestInit) => Promise<Response>;

/** changes a call before it is answered and recorded (undefined = leave it): used to move an uploaded file into Storage/ */
export type PrepareCall = (input: string, init?: RequestInit) => Promise<RequestInit | undefined>;

const DOC_PREFIX = 'journal.';
const READ_ONLY = /^(GET|HEAD|OPTIONS)$/i;

/** the place of one journal in this page: how many entries it has played, the row they are played in, and the calls of this page not played yet */
interface Line {
  seq: number;
  chain: Promise<unknown>;
  posts: Promise<unknown>;
  mine: Set<number>;
  next: number;
  /** the row has been played once when the page started to use this journal (several backends of one mock share it) */
  initial: boolean;
  started?: Promise<void>;
}
const lines = new Map<string, Line>();
const lineOf = (name: string): Line => {
  let line = lines.get(name);
  if (!line) lines.set(name, (line = { seq: 0, chain: Promise.resolve(), posts: Promise.resolve(), mine: new Set(), next: 1, initial: false }));
  return line;
};

/** one job at a time on a journal: the entries are played one after the other, in the order given */
function inRow<T>(line: Line, job: () => Promise<T>): Promise<T> {
  const run = line.chain.then(job);
  line.chain = run.then(() => undefined, () => undefined);
  return run;
}

const isMine = (line: Line, entry: JournalRecord): boolean => entry.by === CLIENT_ID && entry.cid !== undefined && line.mine.has(entry.cid);

/**
 * Plays the entries after the ones this page has played, up to `upTo` (all of them when undefined), STOPPING at one of this page's own calls that is
 * waiting for its turn (it is played by the call itself, at its place). Answers how many were played.
 */
async function playTail(name: string, play: (e: JournalRecord) => Promise<void>, upTo?: number): Promise<number> {
  const line = lineOf(name);
  const tail = await readJournal(name, line.seq);
  if (!tail) throw new Error('the file server did not answer');
  if (tail.seq < line.seq) {
    // the journal was emptied or replaced on the server (somebody removed the file): what this page played cannot be taken back — only a reload agrees
    line.seq = tail.seq;
    return 1;
  }
  let played = 0;
  const entries = upTo === undefined ? tail.entries : tail.entries.slice(0, Math.max(0, upTo - line.seq));
  for (const e of entries) {
    if (isMine(line, e)) break;
    try {
      await play(e);
    } catch {
      // a call that no longer works (the mock changed since it was recorded) is skipped, the rest still apply
    }
    line.seq += 1;
    played += 1;
  }
  return played;
}

/**
 * The part of a journal that is the same for every flavour of mock: the page starts by playing the whole row, a call is sent and played at its place,
 * and the calls of the others are played as they come. `play` replays one entry on the model.
 */
function asyncJournal(name: string, play: (e: JournalRecord) => Promise<void>) {
  const line = lineOf(name);
  /** inside the row: plays the whole journal the first time (once for every backend of the mock) */
  const playFirst = async (): Promise<boolean> => {
    if (line.initial) return false;
    line.initial = true;
    if (mockupEnabled()) {
      // the row as the app loaded it (no round trip for a journal nobody touched since), then whatever was added after that
      const loaded = datasourceDoc<JournalRecord[]>(`${DOC_PREFIX}${name}`);
      for (const e of Array.isArray(loaded) ? loaded : []) {
        try {
          await play(e);
        } catch {
          // a call that no longer works (the mock changed since it was recorded) is skipped, the rest still apply
        }
        line.seq += 1;
      }
      try {
        await playTail(name, play);
      } catch {
        // the server did not answer now: the next change it announces is pulled
      }
    }
    return true;
  };
  const start = (): Promise<void> => (line.started ??= inRow(line, async () => void (await playFirst())));
  // the calls of the others; a page that has not played the journal yet has nothing to refresh — the first use plays them
  const pull = (): Promise<number> => inRow(line, async () => ((await playFirst()) || !mockupEnabled() ? 0 : playTail(name, play)));
  onJournalChanged(name, pull);

  /** sends the call, then runs it at its place: after every entry the server numbered before it */
  const write = async <T>(entry: JournalEntry, run: () => Promise<T>): Promise<T> => {
    await start();
    const cid = line.next++;
    line.mine.add(cid);
    const ticket = line.posts.then(() => appendJournal(name, { ...entry, by: CLIENT_ID, cid }));
    line.posts = ticket.catch(() => undefined);
    const sent = await ticket;
    if (!sent) {
      line.mine.delete(cid);
      throw new Error('the file server did not take the change');
    }
    return inRow(line, async () => {
      try {
        // the ones the server numbered before this call
        while (line.seq < sent.seq - 1) {
          const played = await playTail(name, play, sent.seq - 1);
          if (played === 0) break;
        }
        return await run();
      } finally {
        line.seq = Math.max(line.seq, sent.seq);
        line.mine.delete(cid);
        // the others' entries that came after it, now that its place is taken
        void pull().catch(() => undefined);
      }
    });
  };
  return { write, start };
}

/**
 * `replay`: a backend of the same mock without its answer delay (a replay of many calls must not wait 150 ms for each); `live`: the one the
 * page uses. They share the model (it lives in the mock's module), so what `replay` does is what `live` then sees.
 */
export function journaled(name: string, replay: { fetch: FetchLike }, live: { fetch: FetchLike }, prepare?: PrepareCall): { fetch: FetchLike } {
  const journal = asyncJournal(name, async (e) => {
    await replay.fetch(e.url, { method: e.method, body: e.body, headers: e.body === undefined ? undefined : { 'content-type': 'application/json' } });
  });
  return {
    async fetch(input, rawInit) {
      await journal.start();
      // a call that carries a file: the file goes to Storage/ first and the call is made (and recorded) with a reference instead of the bytes
      const init = prepare && mockupEnabled() ? ((await prepare(String(input), rawInit)) ?? rawInit) : rawInit;
      const method = init?.method ?? 'GET';
      const recorded = mockupEnabled() && !READ_ONLY.test(method) && (init?.body === undefined || init.body === null || typeof init.body === 'string');
      if (!recorded) return live.fetch(input, init);
      try {
        return await journal.write({ method: method.toUpperCase(), url: String(input), ...(typeof init?.body === 'string' ? { body: init.body } : {}) }, () => live.fetch(input, init));
      } catch (e) {
        if (e instanceof Error && e.message === 'the file server did not take the change') {
          return new Response(JSON.stringify({ status: 503, message: 'mockup file server did not take the change' }), { status: 503, headers: { 'content-type': 'application/json' } });
        }
        throw e;
      }
    },
  };
}

/**
 * A mock backend (`{ fetch, …other methods }`) whose writes are journaled: `make` builds it from the options, once for the page and once
 * with no answer delay for the replay. The other members of the backend are those of the page's own instance.
 */
export function journaledBackend<B extends { fetch: FetchLike }, O extends { delayMs?: number }>(name: string, make: (options: O) => B, options: O, prepare?: PrepareCall): B {
  const live = make(options);
  const replay = make({ ...options, delayMs: 0 });
  return { ...live, fetch: journaled(name, replay, live, prepare).fetch };
}

/** forget what was recorded (and its file): the next start begins from the seed */
export function clearJournal(name: string): void {
  const line = lineOf(name);
  line.seq = 0;
  void saveDocument(`${DOC_PREFIX}${name}`, [], { overwrite: true });
}

/** for the tests */
export function resetJournalsForTests(): void {
  lines.clear();
}

export interface JournaledApiOptions<A> {
  /** a second instance of the mock (no answer delay) that does the replay; without it the replay runs on `live` itself, with `quiet` told to drop the delay meanwhile */
  replay?: A;
  quiet?: (on: boolean) => void;
  /** changes the arguments of a write before it is made and recorded (e.g. moves a file into Storage/); undefined = leave them */
  prepare?: (method: string, args: unknown[]) => Promise<unknown[] | undefined>;
}

/**
 * Like `journaledBackend`, for a mock whose writes are METHODS (`api.createProspect(body)` …) not `fetch` calls: each call of a method in
 * `writes` that the mock answered successfully is recorded as `{ method: 'CALL', url: '<method>', body: '<the arguments as JSON>' }`
 * and replayed on the next start. The arguments must be JSON-able. The reads wait for the replay.
 */
export function journaledApi<A extends object>(name: string, live: A, writes: readonly (keyof A & string)[], options: JournaledApiOptions<A> = {}): A {
  type Fn = (...args: unknown[]) => Promise<unknown>;
  const target = (options.replay ?? live) as Record<string, Fn>;
  const journal = asyncJournal(name, async (e) => {
    if (!options.replay) options.quiet?.(true);
    try {
      await target[e.url]?.(...(JSON.parse(e.body ?? '[]') as unknown[]));
    } finally {
      if (!options.replay) options.quiet?.(false);
    }
  });
  const source = live as Record<string, unknown>;
  const wrapped: Record<string, unknown> = { ...source };
  for (const key of Object.keys(source)) {
    const fn = source[key];
    if (typeof fn !== 'function') continue;
    if (!writes.includes(key as keyof A & string)) {
      wrapped[key] = async (...args: unknown[]) => (await journal.start(), (fn as Fn).apply(live, args));
      continue;
    }
    wrapped[key] = async (...args: unknown[]) => {
      await journal.start();
      const callArgs = mockupEnabled() ? ((await options.prepare?.(key, args)) ?? args) : args;
      if (!mockupEnabled()) return (fn as Fn).apply(live, callArgs);
      return journal.write({ method: 'CALL', url: key, body: JSON.stringify(callArgs) }, () => (fn as Fn).apply(live, callArgs));
    };
  }
  return wrapped as A;
}

/** `journaledApi` for a mock whose model lives in its module (a second instance sees the same model): `make` builds the page's instance and the replay's */
export function journaledMethods<A extends object, O extends { delayMs?: number }>(
  name: string,
  make: (options: O) => A,
  options: O,
  writes: readonly (keyof A & string)[],
  prepare?: JournaledApiOptions<A>['prepare'],
): A {
  return journaledApi(name, make(options), writes, { replay: make({ ...options, delayMs: 0 }), prepare });
}

/**
 * `journaledApi` for a mock of SYNCHRONOUS methods whose answer depends on a context the page sets on it (the forecast mock: company + role).
 * The entry keeps the context the call was made in (`[context, …arguments]`); the replay happens when the mock is wrapped, so a read sees it.
 * A write that throws is neither recorded nor replayed.
 *
 * A synchronous call cannot wait for the server, so it is played here AT ONCE (the page answers without a round trip) and sent after it. The server
 * then puts it in the row of everybody's calls. When the calls of the others come in the order this page played them in (nothing of this page's own
 * is still waiting), they are played on top. When one of the others' calls belongs BEFORE a call of this page that was already played (they were
 * made at the same time), the page's copy would end up in another order than everybody else's — the ids and the counters would differ — so the
 * copy is built again: a new instance (`make`), the whole row in the server's order, then the page's own calls the server has not numbered yet.
 * `carry` copies what the page set on the old instance that is not in the row (the forecast's company and role) to the new one.
 */
export interface JournaledSyncOptions<A extends object, C> {
  /** builds a mock from its seed (the page's instance and the ones of a rebuild) */
  make: () => A;
  writes: readonly (keyof A & string)[];
  /** the context of a call on a given instance */
  context: (mock: A) => { get: () => C; set: (value: C) => void };
  carry?: (from: A, to: A) => void;
}

export function journaledSync<A extends object, C>(name: string, options: JournaledSyncOptions<A, C>): A {
  type Fn = (...args: unknown[]) => unknown;
  const { make, writes, context, carry } = options;
  const holder: { current: A } = { current: make() };
  const line = lineOf(name);
  /** the row in the server's order, as far as this page knows it (to build the copy again) */
  const history: JournalRecord[] = [];
  /** the calls of this page that were played but are not in the row yet, in the order they were made */
  const pendingOwn = new Map<number, JournalRecord>();

  const apply = (mock: A, e: JournalRecord): void => {
    const ctx = context(mock);
    const original = ctx.get();
    try {
      const [value, ...args] = JSON.parse(e.body ?? '[]') as [C, ...unknown[]];
      ctx.set(value);
      (Reflect.get(mock, e.url) as Fn | undefined)?.apply(mock, args);
    } catch {
      // a call that no longer works is skipped, the rest still apply
    } finally {
      ctx.set(original);
    }
  };
  /** a new instance that has the row in the server's order, then the own calls that are not in it yet */
  const rebuild = (): void => {
    const fresh = make();
    carry?.(holder.current, fresh);
    for (const e of history) apply(fresh, e);
    for (const e of pendingOwn.values()) apply(fresh, e);
    holder.current = fresh;
  };

  if (mockupEnabled()) {
    // the row as the app loaded it (the methods of this mock are synchronous: they cannot wait for the server); then what came after
    const saved = datasourceDoc<JournalRecord[]>(`${DOC_PREFIX}${name}`);
    const known = Array.isArray(saved) ? saved : [];
    for (const e of known) apply(holder.current, e);
    history.push(...known);
    line.seq = known.length;
  }

  const pull = (): Promise<number> =>
    inRow(line, async () => {
      if (!mockupEnabled()) return 0;
      const tail = await readJournal(name, line.seq);
      if (!tail) throw new Error('the file server did not answer');
      if (tail.seq < line.seq) {
        line.seq = tail.seq; // the journal was emptied on the server: only a reload agrees (see playTail)
        history.length = Math.min(history.length, tail.seq);
        return 1;
      }
      let played = 0;
      let reorder = false;
      for (const e of tail.entries) {
        history.push(e);
        line.seq += 1;
        if (e.by === CLIENT_ID) {
          pendingOwn.delete(e.cid ?? -1); // its place in the row is known now; it was played when it was made
          continue;
        }
        played += 1;
        // a call of the others that comes before one of this page's that was played already: the copy has to be built in the server's order
        if (reorder || pendingOwn.size > 0) reorder = true;
        else apply(holder.current, e);
      }
      if (reorder) rebuild();
      return played;
    });
  onJournalChanged(name, pull);
  if (mockupEnabled()) void pull().catch(() => undefined);

  // the page holds this object; the instance behind it is replaced by a rebuild
  return new Proxy({} as A, {
    get(_target, key) {
      const value: unknown = Reflect.get(holder.current, key);
      if (typeof value !== 'function') return value;
      const isWrite = typeof key === 'string' && writes.includes(key as keyof A & string);
      return (...args: unknown[]) => {
        const mock = holder.current;
        const ctx = context(mock).get();
        const answer = (Reflect.get(mock, key) as Fn).apply(mock, args);
        if (isWrite && mockupEnabled()) {
          // played here already (the answer cannot wait); sent after it, in the order the calls were made
          const cid = line.next++;
          const entry: JournalRecord = { method: 'CALL', url: String(key), body: JSON.stringify([ctx, ...args]), by: CLIENT_ID, cid };
          pendingOwn.set(cid, entry);
          line.posts = line.posts.then(() => appendJournal(name, entry)).catch(() => undefined);
        }
        return answer;
      };
    },
    set: (_target, key, value) => Reflect.set(holder.current, key, value),
    has: (_target, key) => Reflect.has(holder.current, key),
    getPrototypeOf: () => Object.getPrototypeOf(holder.current) as object | null,
  });
}
