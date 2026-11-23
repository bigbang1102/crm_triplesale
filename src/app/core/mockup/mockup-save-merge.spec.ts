import { afterEach, describe, expect, it, vi } from 'vitest';
import { noteDocument, resetKnownForTests, saveDocument, setMergedHandler } from './mockup-client';

/** the server as far as a save sees it: one document with a revision; a save that starts from an older revision is refused with the document */
function fakeServer(initial: unknown, startRev: number) {
  const state = { doc: initial, rev: startRev, puts: [] as Array<{ base: string | null; body: unknown }> };
  vi.stubGlobal(
    'fetch',
    vi.fn((_url: string, init?: RequestInit): Promise<Response> => {
      const headers = new Headers(init?.headers);
      const base = headers.get('x-mockup-base-rev');
      const body = JSON.parse(String(init?.body));
      state.puts.push({ base, body });
      if (base !== null && state.rev > Number(base)) return Promise.resolve(new Response(JSON.stringify({ conflict: true, rev: state.rev, doc: state.doc }), { status: 409 }));
      state.doc = body;
      state.rev += 1;
      return Promise.resolve(new Response(JSON.stringify({ ok: true, rev: state.rev })));
    }),
  );
  return state;
}

afterEach(() => {
  resetKnownForTests();
  vi.unstubAllGlobals();
});

describe('saving a whole document that somebody else saved too', () => {
  it('should write straight away when nobody saved it since the page read it', async () => {
    const server = fakeServer({ list: [{ id: 1, v: 1 }] }, 5);
    noteDocument('state.x', { list: [{ id: 1, v: 1 }] }, 5);
    expect(await saveDocument('state.x', { list: [{ id: 1, v: 2 }] })).toBe(true);
    expect(server.puts).toHaveLength(1);
    expect(server.puts[0].base).toBe('5');
    expect(server.doc).toEqual({ list: [{ id: 1, v: 2 }] });
  });

  it('should merge its change with the one somebody saved meanwhile, write the merge and hand it to the page', async () => {
    const server = fakeServer({ list: [{ id: 1, v: 1 }, { id: 2, v: 2 }] }, 6); // the others added record 2 at revision 6
    noteDocument('state.x', { list: [{ id: 1, v: 1 }] }, 5); // this page read it at revision 5
    const merged = vi.fn();
    setMergedHandler(merged);
    expect(await saveDocument('state.x', { list: [{ id: 1, v: 9 }] })).toBe(true); // this page edited record 1
    expect(server.puts.map((p) => p.base)).toEqual(['5', '6']); // refused once, then written from the newer revision
    expect(server.doc).toEqual({ list: [{ id: 1, v: 9 }, { id: 2, v: 2 }] }); // both changes are there
    expect(merged).toHaveBeenCalledWith('state.x', { list: [{ id: 1, v: 9 }, { id: 2, v: 2 }] });
  });

  it('should not tell the page anything when nobody saved meanwhile (it holds what it wrote)', async () => {
    fakeServer({ a: 1 }, 3);
    noteDocument('state.x', { a: 1 }, 3);
    const merged = vi.fn();
    setMergedHandler(merged);
    await saveDocument('state.x', { a: 2 });
    expect(merged).not.toHaveBeenCalled();
  });

  it('should start from the revision it wrote itself for the next save', async () => {
    const server = fakeServer({ a: 1 }, 3);
    noteDocument('state.x', { a: 1 }, 3);
    await saveDocument('state.x', { a: 2 });
    await saveDocument('state.x', { a: 3 });
    expect(server.puts.map((p) => p.base)).toEqual(['3', '4']);
    expect(server.doc).toEqual({ a: 3 });
  });

  it('should write without asking when it is told to overwrite (a deliberate reset)', async () => {
    const server = fakeServer([1, 2, 3], 9);
    expect(await saveDocument('journal.x', [], { overwrite: true })).toBe(true);
    expect(server.puts[0].base).toBeNull();
    expect(server.doc).toEqual([]);
  });

  it('should save a document it never read as a new one (revision 0), and merge when it was there after all', async () => {
    const server = fakeServer({ theirs: 1 }, 4);
    expect(await saveDocument('state.y', { mine: 1 })).toBe(true);
    expect(server.puts.map((p) => p.base)).toEqual(['0', '4']);
    expect(server.doc).toEqual({ theirs: 1, mine: 1 });
  });

  it('should give up (false) when the server keeps refusing, not loop for ever', async () => {
    const calls = vi.fn(() => Promise.resolve(new Response(JSON.stringify({ conflict: true, rev: 99, doc: { z: 1 } }), { status: 409 })));
    vi.stubGlobal('fetch', calls);
    expect(await saveDocument('state.z', { a: 1 })).toBe(false);
    expect(calls.mock.calls.length).toBeLessThanOrEqual(5);
  });
});
