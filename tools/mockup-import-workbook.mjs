#!/usr/bin/env node
/**
 * `npm run mockup:import-workbook -- --seed <seed.json>`: puts the identity of the Seed Workbook (groups · companies · roles · users — see
 * tools/lib/workbook-identity.mjs) onto the ONE shared file server, next to what is there. It only ADDS: an entry whose key the server has is kept as it is.
 *
 *   python -I -X utf8 tools/lib/xlsx-to-json.py Seed_Workbook_TripleSales.xlsx seed.json      (once: the workbook as JSON)
 *   npm run mockup:import-workbook -- --seed seed.json             shows what would be added (nothing is written)
 *   npm run mockup:import-workbook -- --seed seed.json --apply     writes it
 *
 * The shared server is the same MOCKUP_REMOTE_URL + MOCKUP_TOKEN (+ MOCKUP_REMOTE_IP) of `.env.mockup.local` the dev server uses.
 * With `--lpo <lpo.json>` (Lead_Prospect_OPP_GenFormat.xlsx as JSON) the CRM rows are put too, as documents `seed.workbook.crm.<company>` and
 * `seed.workbook.master` (tools/lib/workbook-crm.mjs); those documents are the importer's own, so a second run REPLACES them.
 * Every account gets the test password (Test@1234); nothing here is a real credential.
 */
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildCrmDocuments } from './lib/workbook-crm.mjs';
import { buildIdentity, mergeByKey } from './lib/workbook-identity.mjs';
import { request } from './mockup-sync-seed.mjs';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
/** the document of each list and the field that identifies an entry of it */
const DOCS = [
  ['groups', 'groups', 'code'],
  ['branches', 'branches', 'code'],
  ['roles', 'roles', 'code'],
  ['users', 'users', 'username'],
];

function argument(name) {
  const i = process.argv.indexOf(name);
  return i >= 0 ? process.argv[i + 1] : undefined;
}

function remoteFromEnv() {
  try {
    for (const line of readFileSync(resolve(root, '.env.mockup.local'), 'utf8').split(/\r?\n/)) {
      const m = /^\s*([A-Z][A-Z0-9_]*)\s*=(.*)$/.exec(line);
      if (m && process.env[m[1]] === undefined) process.env[m[1]] = m[2].trim();
    }
  } catch {
    // no file: the settings come from the shell
  }
  const { remote, problem } = createRequire(import.meta.url)('./mockup-remote-proxy.cjs').mockupRemote(process.env);
  if (!remote) throw new Error(problem ?? 'Set MOCKUP_REMOTE_URL and MOCKUP_TOKEN in .env.mockup.local.');
  return remote;
}

const seedPath = argument('--seed');
if (!seedPath) {
  console.error('Usage: node tools/mockup-import-workbook.mjs --seed <seed.json> [--apply]');
  process.exit(1);
}
const apply = process.argv.includes('--apply');
const seedSheets = JSON.parse(readFileSync(resolve(seedPath), 'utf8'));
const identity = buildIdentity(seedSheets);
const lpoPath = argument('--lpo');
const remote = remoteFromEnv();
const all = await request(remote, 'GET', '/mockup-api/ds-all');
if (all.status !== 200) throw new Error(`the shared file server answered ${all.status} to ds-all`);
const there = JSON.parse(all.text);
const documents = there.documents ?? there;
for (const [name, key, id] of DOCS) {
  const { list, added } = mergeByKey(documents[name], identity[key], id);
  console.log(`${apply ? 'writing' : 'would write'}  ${name}: +${added} (${list.length} in all)`);
  if (apply && added > 0) {
    const done = await request(remote, 'PUT', `/mockup-api/ds/${encodeURIComponent(name)}`, list);
    if (done.status !== 200 && done.status !== 204) throw new Error(`could not write ${name}: ${done.status}`);
  }
}
if (lpoPath) {
  const crm = buildCrmDocuments(JSON.parse(readFileSync(resolve(lpoPath), 'utf8')), seedSheets);
  for (const [name, doc] of Object.entries(crm)) {
    const size = Buffer.byteLength(JSON.stringify(doc));
    console.log(`${apply ? 'writing' : 'would write'}  ${name}: ${(size / 1024).toFixed(0)} KB${name in documents ? ' (replaces)' : ''}`);
    if (apply) {
      const done = await request(remote, 'PUT', `/mockup-api/ds/${encodeURIComponent(name)}`, doc);
      if (done.status !== 200 && done.status !== 204) throw new Error(`could not write ${name}: ${done.status}`);
    }
  }
}
if (!apply) console.log('Nothing was written — run with --apply.');
