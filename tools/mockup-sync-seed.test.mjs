import assert from 'node:assert/strict';
import { mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { after, before, describe, it } from 'node:test';
import { createMockupServer } from './mockup-server.mjs';
import { mergeMissing, syncSeed } from './mockup-sync-seed.mjs';

describe('putting the seed documents on the shared file server', () => {
  it('should create a document the server does not have, add only the lists it lacks, and leave the rest', () => {
    assert.deepEqual(mergeMissing({ a: 1 }, undefined), { action: 'create', doc: { a: 1 } });
    assert.deepEqual(mergeMissing({ a: 1, b: 2 }, { a: 'edited by hand' }), { action: 'add', keys: ['b'], doc: { a: 'edited by hand', b: 2 } });
    assert.deepEqual(mergeMissing({ a: 1 }, { a: 'edited', extra: 3 }), { action: 'same' });
    assert.deepEqual(mergeMissing([1], [2]), { action: 'keep' });
  });

  describe('against a file server', () => {
    const TOKEN = 'sync-test-token';
    let server;
    let remote;
    before(async () => {
      const root = await mkdtemp(join(tmpdir(), 'mockup-sync-'));
      server = createMockupServer({ datasourceDir: join(root, 'Datasource'), storageDir: join(root, 'Storage'), token: TOKEN });
      await new Promise((r) => server.listen(0, '127.0.0.1', r));
      remote = { origin: `http://127.0.0.1:${server.address().port}`, token: TOKEN };
    });
    after(() => new Promise((r) => server.close(r)));

    const docs = { 'ref.page': { one: [1], two: [2] }, 'seed.x': { rows: [] } };
    const read = async (name) => (await (await fetch(`${remote.origin}/mockup-api/ds/${name}`, { headers: { 'x-mockup-token': TOKEN } })).json());

    it('should write nothing without --apply, then write what is missing, then keep a list edited by hand', async () => {
      const dry = await syncSeed(docs, remote, false);
      assert.deepEqual(dry.map((p) => p.action), ['create', 'create']);
      assert.equal((await fetch(`${remote.origin}/mockup-api/ds/ref.page`, { headers: { 'x-mockup-token': TOKEN } })).status, 404);

      await syncSeed(docs, remote, true);
      assert.deepEqual(await read('ref.page'), { one: [1], two: [2] });

      // somebody edits `one`; the code gets a third list: only the new list arrives
      await fetch(`${remote.origin}/mockup-api/ds/ref.page`, { method: 'PUT', headers: { 'x-mockup-token': TOKEN, 'content-type': 'application/json' }, body: JSON.stringify({ one: ['edited'], two: [2] }) });
      const plan = await syncSeed({ ...docs, 'ref.page': { ...docs['ref.page'], three: [3] } }, remote, true);
      assert.deepEqual(plan[0], { name: 'ref.page', action: 'add', keys: ['three'] });
      assert.deepEqual(await read('ref.page'), { one: ['edited'], two: [2], three: [3] });
    });

    it('should say so when the token is wrong', async () => {
      await assert.rejects(() => syncSeed(docs, { ...remote, token: 'nope' }, false), /401/);
    });
  });
});
