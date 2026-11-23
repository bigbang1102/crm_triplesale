import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, it } from 'node:test';
import { ensureLocalData } from './lib/mockup-local-data.mjs';

describe('local Datasource of the mockup', () => {
  it('should write the sign-in documents the first time and leave them alone after', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'mockup-local-'));
    try {
      const first = await ensureLocalData(dir);
      assert.deepEqual(first.written.sort(), ['branches', 'groups', 'roles', 'users']);
      const users = JSON.parse(await readFile(join(first.datasource, 'users.json'), 'utf8'));
      assert.equal(users[0].username, 'admin');
      assert.equal(users[0].password, 'admin');

      // somebody edited a document: it is kept, and nothing else is written again
      await writeFile(join(first.datasource, 'users.json'), '[{"username":"mine"}]', 'utf8');
      const second = await ensureLocalData(dir);
      assert.deepEqual(second.written, []);
      assert.equal(JSON.parse(await readFile(join(first.datasource, 'users.json'), 'utf8'))[0].username, 'mine');
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });
});
