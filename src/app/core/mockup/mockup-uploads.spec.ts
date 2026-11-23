import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { resetMockupForTests, setDatasource } from './mockup-datasource';
import { journaledBackend, resetJournalsForTests } from './mockup-journal';
import { base64Upload, contentTypeOf, fetchStored, storageIdOf, storedRef } from './mockup-uploads';

/** the bytes of a Blob (the Blob of the test DOM has no arrayBuffer()) */
const bytesOfBlob = (blob: Blob): Promise<Uint8Array> =>
  new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(new Uint8Array(reader.result as ArrayBuffer));
    reader.onerror = () => reject(reader.error);
    reader.readAsArrayBuffer(blob);
  });

/** a stand-in for the file server: POST /mockup-api/storage keeps the bytes, GET gives them back */
function fakeStorage() {
  const files = new Map<string, { type: string; bytes: Uint8Array }>();
  const posted: string[] = [];
  const fetchStub = vi.fn(async (url: string, init?: RequestInit) => {
    const u = new URL(url, 'http://x');
    if (init?.method === 'POST' && u.pathname === '/mockup-api/storage') {
      const id = (files.size + 1).toString(16).padStart(16, '0');
      files.set(id, { type: String((init.headers as Record<string, string>)['content-type']), bytes: await bytesOfBlob(init.body as Blob) });
      posted.push(`${u.searchParams.get('folder')}|${u.searchParams.get('name')}`);
      return new Response(JSON.stringify({ id, name: u.searchParams.get('name'), type: 'x', size: 1, url: '' }), { status: 201 });
    }
    const file = files.get(u.pathname.split('/').pop() ?? '');
    return file ? new Response(file.bytes as BodyInit, { status: 200, headers: { 'content-type': file.type } }) : new Response('no', { status: 404 });
  });
  return { files, posted, fetchStub };
}

const upload = (over: Record<string, unknown> = {}): RequestInit => ({
  method: 'POST',
  body: JSON.stringify({ prospectId: 7, fileName: 'ใบเสนอราคา.pdf', fileContentBase64: btoa('%PDF-bytes'), ...over }),
});

describe('base64Upload', () => {
  let storage: ReturnType<typeof fakeStorage>;
  beforeEach(() => {
    storage = fakeStorage();
    vi.stubGlobal('fetch', storage.fetchStub);
  });
  afterEach(() => vi.unstubAllGlobals());

  const prepare = base64Upload((input) => input.includes('/attachments'), (body) => `prospects/${String(body['prospectId'])}`, (name) => !name.includes('FAIL'));

  it('should put the bytes in Storage, and give the call back with the id instead of the bytes', async () => {
    const out = await prepare('../board/prospect/attachments', upload());
    const body = JSON.parse(String(out?.body)) as Record<string, unknown>;
    expect(body['fileContentBase64']).toBe('');
    expect(body['storageId']).toMatch(/^[a-f0-9]{16}$/);
    expect(body['fileName']).toBe('ใบเสนอราคา.pdf');
    expect(storage.posted).toEqual(['prospects/7|ใบเสนอราคา.pdf']);
    expect(new TextDecoder().decode([...storage.files.values()][0].bytes)).toBe('%PDF-bytes');
    expect([...storage.files.values()][0].type).toBe('application/pdf');
  });

  it('should leave a call alone that is not an upload, has no file, or is a name the mock refuses', async () => {
    expect(await prepare('../board/prospect/attachments', { method: 'GET' })).toBeUndefined();
    expect(await prepare('../board/other', upload())).toBeUndefined();
    expect(await prepare('../board/prospect/attachments', upload({ fileContentBase64: '' }))).toBeUndefined();
    expect(await prepare('../board/prospect/attachments', upload({ fileName: 'FAIL.pdf' }))).toBeUndefined();
    expect(await prepare('../board/prospect/attachments', { method: 'POST', body: 'not json' })).toBeUndefined();
    expect(storage.posted).toEqual([]);
  });

  it('should leave the call as it is when the file server does not take the file', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response('no', { status: 500 })));
    expect(await prepare('../board/prospect/attachments', upload())).toBeUndefined();
  });
});

describe('a stored file address', () => {
  it('should be made and read back, also inside a longer address', () => {
    const ref = storedRef('0123456789abcdef', 'a b.pdf');
    expect(storageIdOf(ref)).toBe('0123456789abcdef');
    expect(storageIdOf(`/docproxy?url=${encodeURIComponent(ref)}`)).toBeUndefined();
    expect(storageIdOf(`https://host/x/${ref}`)).toBe('0123456789abcdef');
    expect(storageIdOf('prospect/123/a.pdf')).toBeUndefined();
    expect(storageIdOf('mockup-storage/not-an-id/a.pdf')).toBeUndefined();
  });

  it('should guess the type of a file from its extension', () => {
    expect(contentTypeOf('a.PDF')).toBe('application/pdf');
    expect(contentTypeOf('noext')).toBe('application/octet-stream');
  });
});

describe('fetchStored', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('should give the file inline, or as an attachment, with its name; undefined when the server has none', async () => {
    const storage = fakeStorage();
    vi.stubGlobal('fetch', storage.fetchStub);
    storage.files.set('0123456789abcdef', { type: 'application/pdf', bytes: new TextEncoder().encode('hello') });
    const inline = await fetchStored('0123456789abcdef', 'ใบ.pdf', false);
    expect(inline?.headers.get('content-disposition')).toMatch(/^inline; filename\*=UTF-8''/);
    expect(await inline?.text()).toBe('hello');
    expect((await fetchStored('0123456789abcdef', 'ใบ.pdf', true))?.headers.get('content-disposition')).toMatch(/^attachment/);
    expect(await fetchStored('ffffffffffffffff', 'x.pdf', false)).toBeUndefined();
  });
});

describe('an upload through the journal', () => {
  // real timers: the Blob of the test DOM is read with a FileReader, which fake timers would hold back
  afterEach(() => {
    vi.unstubAllGlobals();
    resetJournalsForTests();
    resetMockupForTests();
  });

  it('should record the id, not the bytes, so a replay needs no file', async () => {
    const storage = fakeStorage();
    const journals: Record<string, Array<{ body: string }>> = {};
    vi.stubGlobal('fetch', async (url: string, init?: RequestInit) => {
      const journal = /\/mockup-api\/journal\/([^/?]+)/.exec(String(url));
      if (journal) {
        const list = (journals[journal[1]] ??= []);
        if (init?.method === 'POST') {
          list.push(JSON.parse(String(init.body)) as { body: string });
          return new Response(JSON.stringify({ seq: list.length, rev: list.length }), { status: 201 });
        }
        return new Response(JSON.stringify({ seq: list.length, entries: list.slice(Number(new URL(String(url), 'http://x').searchParams.get('after') ?? 0)) }));
      }
      return storage.fetchStub(String(url), init);
    });
    setDatasource({}, true);
    const make = () => ({ fetch: async (_input: string, _init?: RequestInit) => new Response('ok', { status: 201 }) });
    const backend = journaledBackend('up', make, {}, base64Upload(() => true, () => 'f'));
    await backend.fetch('../board/prospect/attachments', upload());
    const recorded = JSON.parse(String(journals['up'][0].body)) as Record<string, unknown>; // sent to the server before the call is answered
    expect(recorded['fileContentBase64']).toBe('');
    expect(recorded['storageId']).toMatch(/^[a-f0-9]{16}$/);
  });
});
