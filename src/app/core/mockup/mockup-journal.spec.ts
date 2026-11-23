import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { resetMockupForTests, setDatasource } from './mockup-datasource';
import { journaled, journaledApi, journaledMethods, journaledSync, resetJournalsForTests, type FetchLike } from './mockup-journal';
import { journalPulls } from './mockup-registry';

/** the shared file server, in memory: the journals (entries numbered in the order they arrive), the documents, and the answers it gives */
function fakeServer() {
  const journals = new Map<string, Array<Record<string, unknown>>>();
  const docs = new Map<string, unknown>();
  const server = {
    down: false,
    journals,
    docs,
    posts: 0,
    fetch: vi.fn(async (input: string, init?: RequestInit): Promise<Response> => {
      if (server.down) throw new TypeError('connection refused');
      const url = new URL(String(input), 'http://x');
      const method = init?.method ?? 'GET';
      const json = (body: unknown, status = 200): Response => new Response(JSON.stringify(body), { status });
      const journal = /^\/mockup-api\/journal\/([^/]+)$/.exec(url.pathname);
      if (journal) {
        const name = decodeURIComponent(journal[1]);
        const list = journals.get(name) ?? [];
        if (method === 'POST') {
          server.posts += 1;
          list.push(JSON.parse(String(init?.body)) as Record<string, unknown>);
          journals.set(name, list);
          return json({ seq: list.length, rev: list.length }, 201);
        }
        const after = Number(url.searchParams.get('after') ?? 0);
        return json({ seq: list.length, entries: list.slice(after) });
      }
      const doc = /^\/mockup-api\/ds\/(.+)$/.exec(url.pathname);
      if (doc && method === 'PUT') {
        docs.set(decodeURIComponent(doc[1]), JSON.parse(String(init?.body)));
        return json({ ok: true, rev: 1 });
      }
      return json({ error: 'not found' }, 404);
    }),
  };
  return server;
}

/** a tiny backend: POST /items adds the body to a list with the next number, GET /items answers the list */
function backend(model: { items: Array<{ id: number; name: string }>; counter: number }) {
  const fetch: FetchLike = async (input, init) => {
    if ((init?.method ?? 'GET') === 'POST') {
      if (init?.body === 'bad') return new Response('no', { status: 400 });
      const item = { id: ++model.counter, name: String(init?.body) };
      model.items.push(item);
      return new Response(JSON.stringify(item), { status: 201 });
    }
    return new Response(JSON.stringify(model.items), { status: 200 });
  };
  return { fetch };
}
const newModel = () => ({ items: [] as Array<{ id: number; name: string }>, counter: 0 });

let server: ReturnType<typeof fakeServer>;
beforeEach(() => {
  server = fakeServer();
  vi.stubGlobal('fetch', server.fetch);
});
afterEach(() => {
  vi.unstubAllGlobals();
  vi.resetModules(); // the pages of the tests made their own copies of the modules: nothing of them may be left for the next file
  journalPulls.clear();
  resetJournalsForTests();
  resetMockupForTests();
});

/** a page of its own (its own copy of the modules: its own id, its own row of journals) that talks to the same server */
async function page() {
  vi.resetModules();
  const datasource = await import('./mockup-datasource');
  const journal = await import('./mockup-journal');
  const registry = await import('./mockup-registry');
  datasource.setDatasource({}, true);
  return { journal, registry };
}

describe('journaled (calls of a fetch-style mock)', () => {
  it('should send a write to the server and answer it, and not send a read nor a call without the server', async () => {
    setDatasource({}, true);
    const model = newModel();
    const api = journaled('items', backend(model), backend(model));
    const res = await api.fetch('/items', { method: 'POST', body: 'a' });
    expect(res.status).toBe(201);
    await api.fetch('/items');
    expect(server.journals.get('items')).toEqual([expect.objectContaining({ method: 'POST', url: '/items', body: 'a' })]);
    expect(server.posts).toBe(1);

    resetJournalsForTests();
    setDatasource({}, false);
    server.posts = 0;
    const plain = journaled('items2', backend(newModel()), backend(newModel()));
    expect((await plain.fetch('/items', { method: 'POST', body: 'b' })).status).toBe(201);
    expect(server.posts).toBe(0);
  });

  it('should play the whole journal before the first call is answered, once, even for two backends of the same mock', async () => {
    server.journals.set('items', [{ method: 'POST', url: '/items', body: 'old-1' }, { method: 'POST', url: '/items', body: 'old-2' }]);
    setDatasource({}, true);
    const model = newModel();
    const one = journaled('items', backend(model), backend(model));
    const two = journaled('items', backend(model), backend(model));
    expect(JSON.parse(await (await one.fetch('/items')).text()).map((i: { name: string }) => i.name)).toEqual(['old-1', 'old-2']);
    await two.fetch('/items');
    expect(model.items).toHaveLength(2);
  });

  it('should skip a played call that fails and still play the rest', async () => {
    server.journals.set('items', [{ method: 'POST', url: '/items', body: 'bad' }, { method: 'POST', url: '/items', body: 'good' }]);
    setDatasource({}, true);
    const model = newModel();
    const api = journaled('items', backend(model), backend(model));
    await api.fetch('/items');
    expect(model.items.map((i) => i.name)).toEqual(['good']);
  });

  it('should tell the page the server did not take the change, and leave its model as it was', async () => {
    setDatasource({}, true);
    const model = newModel();
    const api = journaled('items', backend(model), backend(model));
    await api.fetch('/items'); // started
    server.down = true;
    const res = await api.fetch('/items', { method: 'POST', body: 'lost' });
    expect(res.status).toBe(503);
    expect(model.items).toEqual([]);
  });

  it('should give two pages that write at the same moment the same numbers and the same order (the order of the server)', async () => {
    const a = await page();
    const modelA = newModel();
    const apiA = a.journal.journaled('items', backend(modelA), backend(modelA));
    const b = await page();
    const modelB = newModel();
    const apiB = b.journal.journaled('items', backend(modelB), backend(modelB));

    const [resA, resB] = await Promise.all([apiA.fetch('/items', { method: 'POST', body: 'from-a' }), apiB.fetch('/items', { method: 'POST', body: 'from-b' })]);
    // each page hears of the other one's call (the live loop does this on the notice of the server)
    await a.registry.journalPulls.get('items')!();
    await b.registry.journalPulls.get('items')!();

    expect(server.journals.get('items')).toHaveLength(2);
    expect(modelA.items).toEqual(modelB.items);
    expect(modelA.items.map((i) => i.id)).toEqual([1, 2]);
    // the numbers each page told its user are the ones everybody has
    const idOf = async (r: Response): Promise<number> => ((await r.json()) as { id: number }).id;
    const names = Object.fromEntries(modelA.items.map((i) => [i.name, i.id]));
    expect(await idOf(resA)).toBe(names['from-a']);
    expect(await idOf(resB)).toBe(names['from-b']);
  });

  it('should play what the others did before its own call, so a page that was behind still gets the right number', async () => {
    const a = await page();
    const modelA = newModel();
    const apiA = a.journal.journaled('items', backend(modelA), backend(modelA));
    const b = await page();
    const modelB = newModel();
    const apiB = b.journal.journaled('items', backend(modelB), backend(modelB));
    await apiB.fetch('/items'); // B has started: nothing yet

    await apiA.fetch('/items', { method: 'POST', body: 'a1' });
    await apiA.fetch('/items', { method: 'POST', body: 'a2' });
    // B writes without having been told: its call is played after a1 and a2
    const res = await apiB.fetch('/items', { method: 'POST', body: 'b1' });
    expect(((await res.json()) as { id: number }).id).toBe(3);
    expect(modelB.items.map((i) => i.name)).toEqual(['a1', 'a2', 'b1']);
    await a.registry.journalPulls.get('items')!();
    expect(modelA.items.map((i) => i.name)).toEqual(['a1', 'a2', 'b1']);
  });

  it('should say how many calls of the others it played, never play its own twice, and play nothing the second time', async () => {
    const a = await page();
    const modelA = newModel();
    const apiA = a.journal.journaled('items', backend(modelA), backend(modelA));
    const b = await page();
    const modelB = newModel();
    const apiB = b.journal.journaled('items', backend(modelB), backend(modelB));
    await apiA.fetch('/items', { method: 'POST', body: 'a1' });
    await apiB.fetch('/items', { method: 'POST', body: 'b1' });
    expect(await a.registry.journalPulls.get('items')!()).toBe(1); // b1
    expect(await a.registry.journalPulls.get('items')!()).toBe(0);
    expect(modelA.items.map((i) => i.name)).toEqual(['a1', 'b1']);
    expect(modelB.items.map((i) => i.name)).toEqual(['a1', 'b1']);
  });
});

describe('journaledMethods / journaledApi (calls of a mock made of methods)', () => {
  const shared: string[] = []; // the model lives in the module of the mock, shared by the page's instance and the replay's
  const make = (_o: { delayMs?: number }) => ({
    async add(name: string) {
      shared.push(name);
      return JSON.stringify({ status: 201 });
    },
    async list() {
      return JSON.stringify(shared);
    },
  });
  beforeEach(() => {
    shared.length = 0;
  });

  it('should send a write with its arguments, not a read, and play what was recorded before the first call is answered', async () => {
    server.journals.set('m', [{ method: 'CALL', url: 'add', body: '["from-file"]' }]);
    setDatasource({}, true);
    const api = journaledMethods('m', make, {}, ['add']);
    expect(JSON.parse(await api.list())).toEqual(['from-file']);
    await api.add('a');
    expect(server.journals.get('m')?.[1]).toEqual(expect.objectContaining({ method: 'CALL', url: 'add', body: '["a"]' }));
    expect(shared).toEqual(['from-file', 'a']);
  });

  it('should be the plain mock when there is no file server', async () => {
    setDatasource({}, false);
    const api = journaledMethods('m', make, {}, ['add']);
    await api.add('a');
    expect(server.posts).toBe(0);
    expect(JSON.parse(await api.list())).toEqual(['a']);
  });

  it('should play on the page instance itself with the answer delay dropped meanwhile', async () => {
    server.journals.set('i', [{ method: 'CALL', url: 'add', body: '["x"]' }]);
    setDatasource({}, true);
    const quiet = vi.fn();
    const wrapped = journaledApi('i', make({}), ['add'], { quiet });
    expect(JSON.parse(await wrapped.list())).toEqual(['x']);
    expect(quiet.mock.calls).toEqual([[true], [false]]);
  });

  it('should send the arguments a prepare step gave, not the ones the page passed', async () => {
    setDatasource({}, true);
    const wrapped = journaledApi('i', make({}), ['add'], { prepare: async (_m, args) => [`${String(args[0])}-stored`] });
    await wrapped.add('file');
    expect(shared).toEqual(['file-stored']);
    expect(server.journals.get('i')).toEqual([expect.objectContaining({ url: 'add', body: '["file-stored"]' })]);
  });
});

describe('journaledSync (calls of a mock whose methods answer at once)', () => {
  /** a sync mock whose answer depends on a field the page sets on it */
  class Mock {
    role = 'a';
    log: string[] = [];
    write(v: string): string {
      if (v === 'bad') throw new Error('refused');
      this.log.push(`${this.role}:${v}`);
      return 'ok';
    }
    read(): string[] {
      return this.log;
    }
  }
  const syncOptions = (made: Mock[] = []) => ({
    make: () => {
      const m = new Mock();
      made.push(m);
      return m;
    },
    writes: ['write'] as const,
    context: (m: Mock) => ({ get: () => m.role, set: (v: string) => (m.role = v) }),
    carry: (from: Mock, to: Mock) => {
      to.role = from.role;
    },
  });
  const wrap = () => journaledSync('s', syncOptions());

  it('should answer a write at once, send it with the context it was made in, and not send a failed one nor a read', async () => {
    setDatasource({}, true);
    const api = wrap();
    api.role = 'b';
    expect(api.write('x')).toBe('ok');
    expect(api.read()).toEqual(['b:x']);
    expect(() => api.write('bad')).toThrow();
    api.read();
    await new Promise((r) => setTimeout(r, 20));
    expect(server.journals.get('s')).toEqual([expect.objectContaining({ method: 'CALL', url: 'write', body: '["b","x"]' })]);
  });

  it('should play the journal of the app start in the recorded context, then give the context back', () => {
    setDatasource({ 'journal.s': [{ method: 'CALL', url: 'write', body: '["b","x"]' }] }, true);
    const api = wrap();
    expect(api.read()).toEqual(['b:x']);
    expect(api.role).toBe('a');
  });

  it('should play the calls of the others as they come, and its own only once', async () => {
    const a = await page();
    const apiA = a.journal.journaledSync('s', syncOptions());
    const b = await page();
    const apiB = b.journal.journaledSync('s', syncOptions());
    apiA.write('one');
    await new Promise((r) => setTimeout(r, 20));
    expect(await b.registry.journalPulls.get('s')!()).toBe(1);
    expect(apiB.read()).toEqual(['a:one']);
    apiB.write('two');
    await new Promise((r) => setTimeout(r, 20));
    expect(await a.registry.journalPulls.get('s')!()).toBe(1);
    expect(await a.registry.journalPulls.get('s')!()).toBe(0);
    expect(apiA.read()).toEqual(['a:one', 'a:two']);
    expect(apiB.read()).toEqual(['a:one', 'a:two']);
  });

  it('should come to the order of the server when two pages made a call at the same time (the copy is built again, the role stays)', async () => {
    const a = await page();
    const madeA: Mock[] = [];
    const apiA = a.journal.journaledSync('s', syncOptions(madeA));
    const b = await page();
    const apiB = b.journal.journaledSync('s', syncOptions());
    apiA.role = 'chosen-by-a';
    apiB.write('two'); // reaches the server first
    apiA.write('one'); // played at once on A: A holds [one] now, the server will have [two, one]
    expect(apiA.read()).toEqual(['chosen-by-a:one']);
    await new Promise((r) => setTimeout(r, 30));
    expect(await a.registry.journalPulls.get('s')!()).toBe(1);
    expect(await b.registry.journalPulls.get('s')!()).toBe(1);
    expect(apiA.read()).toEqual(['a:two', 'chosen-by-a:one']);
    expect(apiB.read()).toEqual(['a:two', 'chosen-by-a:one']);
    expect(apiA.role).toBe('chosen-by-a'); // what the page set on the old copy is on the new one
    expect(madeA).toHaveLength(2); // built once more
  });

  it('should not build the copy again when the calls of the others come after its own in the row', async () => {
    const a = await page();
    const madeA: Mock[] = [];
    const apiA = a.journal.journaledSync('s', syncOptions(madeA));
    const b = await page();
    const apiB = b.journal.journaledSync('s', syncOptions());
    apiA.write('one'); // reaches the server first
    await new Promise((r) => setTimeout(r, 30));
    apiB.write('two');
    await new Promise((r) => setTimeout(r, 30));
    await a.registry.journalPulls.get('s')!();
    await b.registry.journalPulls.get('s')!();
    expect(apiA.read()).toEqual(['a:one', 'a:two']);
    expect(apiB.read()).toEqual(['a:one', 'a:two']);
    expect(madeA).toHaveLength(1);
  });
});
