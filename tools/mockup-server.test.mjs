import assert from 'node:assert/strict';
import { mkdtemp, readFile, readdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { after, before, describe, it } from 'node:test';
import { createMockupServer, isLoopback, safeFileName, safeFolder, sameToken } from './mockup-server.mjs';

describe('mockup file server', () => {
  let server;
  let base;
  let dirs;

  before(async () => {
    const root = await mkdtemp(join(tmpdir(), 'mockup-'));
    dirs = { datasourceDir: join(root, 'Datasource'), storageDir: join(root, 'Storage') };
    server = createMockupServer(dirs);
    await new Promise((r) => server.listen(0, '127.0.0.1', r));
    base = `http://127.0.0.1:${server.address().port}/mockup-api`;
  });
  after(() => new Promise((r) => server.close(r)));

  it('should write a document, read it back, list it and remove it', async () => {
    assert.equal((await fetch(`${base}/ds/users`)).status, 404);
    const put = await fetch(`${base}/ds/users`, { method: 'PUT', body: JSON.stringify([{ id: 1, name: 'สมชาย' }]) });
    assert.equal(put.status, 200);
    assert.deepEqual(await (await fetch(`${base}/ds/users`)).json(), [{ id: 1, name: 'สมชาย' }]);
    assert.deepEqual((await (await fetch(`${base}/ds`)).json()).names, ['users']);
    assert.deepEqual(await (await fetch(`${base}/ds-all`)).json(), { users: [{ id: 1, name: 'สมชาย' }] });
    const written = await readFile(join(dirs.datasourceDir, 'users.json'), 'utf8');
    assert.ok(written.includes('\n  '), 'the file is pretty-printed for a person to read');
    assert.equal((await fetch(`${base}/ds/users`, { method: 'DELETE' })).status, 200);
    assert.equal((await fetch(`${base}/ds/users`)).status, 404);
  });

  it('should accept the name of a mirrored storage key (dots) and refuse a path or a body that is not JSON', async () => {
    assert.equal((await fetch(`${base}/ds/ts.mock.leads.state`, { method: 'PUT', body: '{"a":1}' })).status, 200);
    assert.equal((await fetch(`${base}/ds/users`, { method: 'PUT', body: 'not json' })).status, 400);
    assert.equal((await fetch(`${base}/ds/..%2Fsecret`)).status, 400);
    assert.equal((await fetch(`${base}/ds/.hidden`)).status, 400);
  });

  it('should leave a document that is not valid JSON out of the preload instead of failing it', async () => {
    const { writeFile } = await import('node:fs/promises');
    await writeFile(join(dirs.datasourceDir, 'broken.json'), '{oops');
    const all = await (await fetch(`${base}/ds-all`)).json();
    assert.ok(!('broken' in all));
    assert.ok('ts.mock.leads.state' in all);
  });

  it('should store an upload, serve it inline and as a download, and remove it', async () => {
    const bytes = Buffer.from([1, 2, 3, 4, 5]);
    const up = await fetch(`${base}/storage?name=${encodeURIComponent('ใบเสนอราคา.pdf')}&folder=prospects/12`, { method: 'POST', headers: { 'content-type': 'application/pdf' }, body: bytes });
    assert.equal(up.status, 201);
    const meta = await up.json();
    assert.match(meta.id, /^[a-f0-9]{16}$/);
    assert.equal(meta.size, 5);
    assert.equal(meta.type, 'application/pdf');
    const inline = await fetch(`${base}/storage/${meta.id}`);
    assert.equal(inline.headers.get('content-type'), 'application/pdf');
    assert.match(inline.headers.get('content-disposition'), /^inline/);
    assert.deepEqual(Buffer.from(await inline.arrayBuffer()), bytes);
    assert.match((await fetch(`${base}/storage/${meta.id}?download=1`)).headers.get('content-disposition'), /^attachment/);
    assert.ok((await readdir(join(dirs.storageDir, 'prospects', '12'))).some((f) => f.endsWith('__ใบเสนอราคา.pdf')));
    assert.equal((await fetch(`${base}/storage/${meta.id}`, { method: 'DELETE' })).status, 200);
    assert.equal((await fetch(`${base}/storage/${meta.id}`)).status, 404);
  });

  it('should refuse a bad folder or id and never leave Storage', async () => {
    assert.equal((await fetch(`${base}/storage?name=a.txt&folder=..%2F..%2Fx`, { method: 'POST', body: 'x' })).status, 400);
    assert.equal((await fetch(`${base}/storage/not-an-id`)).status, 400);
    assert.equal((await fetch(`${base}/storage/0000000000000000`)).status, 404);
  });

  it('should clean a file name and a folder', () => {
    assert.equal(safeFileName('../../etc/passwd'), 'passwd');
    assert.equal(safeFileName('a<b>:c.txt'), 'a_b__c.txt');
    assert.equal(safeFileName('.env'), 'env');
    assert.equal(safeFileName(''), 'file');
    assert.equal(safeFolder('prospects/12'), 'prospects/12');
    assert.equal(safeFolder('a/../b'), undefined);
    assert.equal(safeFolder('a/b/c/d'), undefined);
    assert.equal(safeFolder(''), '');
  });
});

describe('the file server shared by several developers (token, one state, journals, changes)', () => {
  let server;
  let base;
  let root;
  const TOKEN = 'a-long-shared-secret';
  const withToken = (extra = {}) => ({ 'x-mockup-token': TOKEN, ...extra });

  before(async () => {
    root = await mkdtemp(join(tmpdir(), 'mockup-shared-'));
    server = createMockupServer({ datasourceDir: join(root, 'Datasource'), storageDir: join(root, 'Storage'), token: TOKEN });
    await new Promise((r) => server.listen(0, '127.0.0.1', r));
    base = `http://127.0.0.1:${server.address().port}/mockup-api`;
  });
  after(() => new Promise((r) => server.close(r)));

  it('should refuse every call without the token, except a health check that tells nothing', async () => {
    assert.equal((await fetch(`${base}/ds-all`)).status, 401);
    assert.equal((await fetch(`${base}/ds-all`, { headers: { 'x-mockup-token': 'wrong' } })).status, 401);
    assert.equal((await fetch(`${base}/storage/0000000000000000`)).status, 401);
    assert.equal((await fetch(`${base}/ds/users`, { method: 'PUT', body: '[]' })).status, 401);
    assert.deepEqual(await (await fetch(`${base}/health`)).json(), { ok: true });
    const health = await (await fetch(`${base}/health`, { headers: withToken() })).json();
    assert.equal(health.auth, true);
    assert.equal((await fetch(`${base}/ds-all`, { headers: withToken() })).status, 200);
  });

  it('should have ONE state for everybody who asks for no workspace', async () => {
    await fetch(`${base}/ds/users`, { method: 'PUT', headers: withToken(), body: JSON.stringify([{ u: 'shared' }]) });
    await fetch(`${base}/ds/shared-db`, { method: 'PUT', headers: withToken(), body: JSON.stringify({ owner: 'ann' }) });
    assert.deepEqual(await (await fetch(`${base}/ds/shared-db`, { headers: withToken() })).json(), { owner: 'ann' });
    await fetch(`${base}/ds/shared-db`, { method: 'PUT', headers: withToken(), body: JSON.stringify({ owner: 'bob' }) });
    assert.deepEqual(await (await fetch(`${base}/ds-all`, { headers: withToken() })).json(), { users: [{ u: 'shared' }], 'shared-db': { owner: 'bob' } });
    assert.equal((await fetch(`${base}/ds/shared-db`, { method: 'DELETE', headers: withToken() })).status, 200);
    assert.equal((await fetch(`${base}/ds/shared-db`, { headers: withToken() })).status, 404);
  });

  it('should keep what a workspace writes in its own folder, read its copy before the shared document, and leave the others alone', async () => {
    const ann = withToken({ 'x-mockup-workspace': 'ann' });
    const bob = withToken({ 'x-mockup-workspace': 'bob' });
    const json = (headers) => ({ ...headers, 'content-type': 'application/json' });
    await fetch(`${base}/ds/state.ws`, { method: 'PUT', headers: withToken(), body: JSON.stringify({ from: 'shared' }) });
    // a workspace reads the shared document until it writes its own
    assert.deepEqual(await (await fetch(`${base}/ds/state.ws`, { headers: ann })).json(), { from: 'shared' });
    await fetch(`${base}/ds/state.ws`, { method: 'PUT', headers: ann, body: JSON.stringify({ from: 'ann' }) });
    assert.deepEqual(await (await fetch(`${base}/ds/state.ws`, { headers: ann })).json(), { from: 'ann' });
    assert.deepEqual(await (await fetch(`${base}/ds/state.ws`, { headers: bob })).json(), { from: 'shared' }, 'another workspace does not see it');
    assert.deepEqual(await (await fetch(`${base}/ds/state.ws`, { headers: withToken() })).json(), { from: 'shared' }, 'nor does the shared state');
    assert.equal(JSON.parse(await readFile(join(root, 'Datasource', '_workspaces', 'ann', 'state.ws.json'), 'utf8')).from, 'ann');
    // the preload of the app: the shared documents with the copies of the workspace over them
    const all = await (await fetch(`${base}/ds-all`, { headers: ann })).json();
    assert.equal(all['state.ws'].from, 'ann');
    assert.equal((await (await fetch(`${base}/ds-all`, { headers: bob })).json())['state.ws'].from, 'shared');
    // removing the copy gives the shared document back, and does not touch it
    assert.equal((await fetch(`${base}/ds/state.ws`, { method: 'DELETE', headers: ann })).status, 200);
    assert.deepEqual(await (await fetch(`${base}/ds/state.ws`, { headers: ann })).json(), { from: 'shared' });
    // a journal of a workspace starts from the shared row and goes on in the workspace only
    await fetch(`${base}/journal/wsrow`, { method: 'POST', headers: json(withToken()), body: '{"url":"shared-1"}' });
    const mine = await (await fetch(`${base}/journal/wsrow`, { method: 'POST', headers: json(ann), body: '{"url":"ann-2"}' })).json();
    assert.equal(mine.seq, 2);
    assert.deepEqual((await (await fetch(`${base}/journal/wsrow?after=0`, { headers: ann })).json()).entries.map((e) => e.url), ['shared-1', 'ann-2']);
    assert.deepEqual((await (await fetch(`${base}/journal/wsrow?after=0`, { headers: withToken() })).json()).entries.map((e) => e.url), ['shared-1']);
    // a name that is not a plain word is refused
    assert.equal((await fetch(`${base}/ds-all`, { headers: withToken({ 'x-mockup-workspace': '../x' }) })).status, 400);
  });

  it('should tell a workspace the shared changes it has no copy of and its own, and the shared state nothing of the workspaces', async () => {
    const ann = withToken({ 'x-mockup-workspace': 'ann2' });
    const changes = async (headers, since) => (await fetch(`${base}/changes?since=${since}&wait=0`, { headers })).json();
    const start = (await (await fetch(`${base}/changes`, { headers: withToken() })).json()).rev;
    await fetch(`${base}/ds/state.copied`, { method: 'PUT', headers: ann, body: '{"v":"ann"}' }); // ann has its own copy of it from now on
    const own = await changes(ann, start);
    assert.deepEqual(own.changed.map((c) => c.name), ['state.copied']);
    own.rev = own.changed[0].rev;
    assert.deepEqual((await changes(withToken(), start)).changed, [], 'the shared state hears nothing of a workspace');
    assert.deepEqual((await changes(withToken({ 'x-mockup-workspace': 'other' }), start)).changed, [], 'nor does another workspace');
    // somebody changes the shared documents: the workspace hears of the one it has no copy of, not of the one it copied
    await fetch(`${base}/ds/state.copied`, { method: 'PUT', headers: withToken(), body: '{"v":"shared"}' });
    await fetch(`${base}/ds/state.notcopied`, { method: 'PUT', headers: withToken(), body: '{"v":"shared"}' });
    assert.deepEqual((await changes(ann, own.rev)).changed.map((c) => c.name), ['state.notcopied']);
  });

  it('should answer a waiting workspace only for a change it hears of (a change in another workspace does not end its wait)', async () => {
    const ann = withToken({ 'x-mockup-workspace': 'ann3' });
    const start = (await (await fetch(`${base}/changes`, { headers: withToken() })).json()).rev;
    const t0 = Date.now();
    const waiting = fetch(`${base}/changes?since=${start}&wait=20000`, { headers: ann }).then((r) => r.json());
    await new Promise((r) => setTimeout(r, 100));
    await fetch(`${base}/ds/state.elsewhere`, { method: 'PUT', headers: withToken({ 'x-mockup-workspace': 'zed' }), body: '{}' }); // not for ann
    await new Promise((r) => setTimeout(r, 150));
    await fetch(`${base}/ds/state.forann`, { method: 'PUT', headers: ann, body: '{}' });
    const answer = await waiting;
    assert.deepEqual(answer.changed.map((c) => c.name), ['state.forann']);
    assert.ok(Date.now() - t0 < 5000);
  });

  it('should refuse a save that started from an older revision than the document has now, and answer with the newer document', async () => {
    const put = (doc, baseRev) =>
      fetch(`${base}/ds/state.merge`, { method: 'PUT', headers: withToken(baseRev === undefined ? {} : { 'x-mockup-base-rev': String(baseRev) }), body: JSON.stringify(doc) });
    const first = await (await put({ n: 1 }, 0)).json(); // a new document: nobody saved it yet
    assert.ok(first.rev > 0);
    const second = await put({ n: 2, by: 'ann' }, first.rev); // starts from the revision of the first: allowed
    assert.equal(second.status, 200);
    const secondRev = (await second.json()).rev;
    const late = await put({ n: 3, by: 'bob' }, first.rev); // bob still starts from the first revision: ann saved after it
    assert.equal(late.status, 409);
    const refusal = await late.json();
    assert.equal(refusal.rev, secondRev);
    assert.deepEqual(refusal.doc, { n: 2, by: 'ann' });
    assert.deepEqual(await (await fetch(`${base}/ds/state.merge`, { headers: withToken() })).json(), { n: 2, by: 'ann' }); // nothing was written
    assert.equal((await put({ n: 3, by: 'bob' }, secondRev)).status, 200); // again, from the newer revision
    assert.equal((await put({ n: 4 })).status, 200); // no revision said: written as before (a deliberate overwrite)
  });

  it('should keep every journal entry in the order it arrived, give each its number, and hand out the ones after a number', async () => {
    const post = (entry) => fetch(`${base}/journal/orders`, { method: 'POST', headers: withToken({ 'content-type': 'application/json' }), body: JSON.stringify(entry) });
    // many at once: they are put in a row, none is lost, the numbers are 1..n without a gap
    const answers = await Promise.all(Array.from({ length: 12 }, (_, i) => post({ method: 'POST', url: `/x/${i}` }).then((r) => r.json())));
    assert.deepEqual(answers.map((a) => a.seq).sort((x, y) => x - y), Array.from({ length: 12 }, (_, i) => i + 1));
    const all = await (await fetch(`${base}/journal/orders?after=0`, { headers: withToken() })).json();
    assert.equal(all.seq, 12);
    assert.equal(all.entries.length, 12);
    const tail = await (await fetch(`${base}/journal/orders?after=10`, { headers: withToken() })).json();
    assert.deepEqual(tail.entries, all.entries.slice(10));
    // the entry that got number 11 is the 11th one of the file — the same order for everybody who reads it
    const answerOf11 = answers.find((a) => a.seq === 11);
    assert.ok(answerOf11.rev > 0);
    // the document of the journal is the plain array (what the first version of the mockup wrote)
    assert.deepEqual(await (await fetch(`${base}/ds/journal.orders`, { headers: withToken() })).json(), all.entries);
    assert.equal((await post('not an object')).status, 400);
    assert.equal((await fetch(`${base}/journal/bad%20name`, { headers: withToken() })).status, 400);
  });

  it('should tell what changed after a revision, and make a client that asks for more wait for the next change', async () => {
    const changes = async (since, wait) => (await fetch(`${base}/changes?since=${since}&wait=${wait}`, { headers: withToken() })).json();
    const start = await (await fetch(`${base}/changes`, { headers: withToken() })).json();
    assert.ok(start.epoch && start.rev > 0);
    assert.deepEqual(await changes(start.rev, 0), { epoch: start.epoch, rev: start.rev, changed: [] });

    // somebody writes while the client waits: it is answered at once with what changed, not when the wait is over
    const waiting = changes(start.rev, 20000);
    const t0 = Date.now();
    await new Promise((r) => setTimeout(r, 100));
    const put = await (await fetch(`${base}/ds/state.test`, { method: 'PUT', headers: withToken(), body: '{"a":1}' })).json();
    const woke = await waiting;
    assert.ok(Date.now() - t0 < 5000, 'woken by the change');
    assert.equal(put.ok, true);
    assert.deepEqual(woke.changed, [{ name: 'state.test', rev: put.rev }]);
    assert.equal(woke.rev, put.rev);

    // a journal append and a delete are changes too, and a client that is behind gets them all (each name once, at its last revision)
    const appended = await (await fetch(`${base}/journal/orders`, { method: 'POST', headers: withToken({ 'content-type': 'application/json' }), body: '{"method":"DELETE","url":"/x/1"}' })).json();
    const removed = await (await fetch(`${base}/ds/state.test`, { method: 'DELETE', headers: withToken() })).json();
    const behind = await changes(start.rev, 0);
    assert.deepEqual(behind.changed.map((c) => c.name), ['journal.orders', 'state.test']);
    assert.equal(behind.changed[0].rev, appended.rev);
    assert.equal(behind.changed[1].rev, removed.rev);
  });

  it('should answer an empty change list when the wait runs out, and forget a client that went away', async () => {
    const start = await (await fetch(`${base}/changes`, { headers: withToken() })).json();
    const t0 = Date.now();
    const none = await (await fetch(`${base}/changes?since=${start.rev}&wait=300`, { headers: withToken() })).json();
    assert.deepEqual(none.changed, []);
    assert.ok(Date.now() - t0 >= 250);
    const controller = new AbortController();
    const gone = fetch(`${base}/changes?since=${start.rev}&wait=20000`, { headers: withToken(), signal: controller.signal }).catch(() => 'aborted');
    await new Promise((r) => setTimeout(r, 100));
    controller.abort();
    assert.equal(await gone, 'aborted');
    // the server is fine afterwards
    assert.equal((await fetch(`${base}/health`)).status, 200);
  });

  it('should share the stored files between clients', async () => {
    const up = await fetch(`${base}/storage?name=a.txt`, { method: 'POST', headers: withToken({ 'content-type': 'text/plain' }), body: 'hello' });
    const meta = await up.json();
    const seen = await fetch(`${base}/storage/${meta.id}`, { headers: withToken() });
    assert.equal(await seen.text(), 'hello');
  });

  it('should compare secrets without a shortcut, and tell a loopback address', () => {
    assert.equal(sameToken('abc', 'abc'), true);
    assert.equal(sameToken('abc', 'abd'), false);
    assert.equal(sameToken('abc', 'abcd'), false);
    assert.equal(sameToken(undefined, 'abc'), false);
    assert.equal(isLoopback('127.0.0.1'), true);
    assert.equal(isLoopback('0.0.0.0'), false);
  });
});
