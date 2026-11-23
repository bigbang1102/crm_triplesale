#!/usr/bin/env node
/**
 * `npm run mockup:seed`: puts the documents the code can make (seed.crm / seed.org / seed.roles / ref.<page> / ref.messages) onto the ONE shared file
 * server — through its https address, the same MOCKUP_REMOTE_URL + MOCKUP_TOKEN (+ MOCKUP_REMOTE_IP) of `.env.mockup.local` the dev server uses.
 * The data of the mockup lives only there (D:\mockup-data\Datasource on the Docker host); the project keeps no copy.
 *
 *   npm run mockup:seed             shows what would be added (nothing is written)
 *   npm run mockup:seed -- --apply  writes it
 *
 * It only ADDS: a document the server does not have is created; in a document it has, the lists / keys it lacks are added; what is there — a list
 * somebody edited by hand — is never touched. So it is safe to run after a new list was added to the code, and again and again.
 */
import { readFileSync } from 'node:fs';
import http from 'node:http';
import https from 'node:https';
import { createRequire } from 'node:module';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const isRecord = (v) => typeof v === 'object' && v !== null && !Array.isArray(v);

/** what putting `local` next to `remote` (the document on the server, or undefined) would do: { action: 'create' | 'add' | 'same' | 'keep', doc?, keys? } */
export function mergeMissing(local, remote) {
  if (remote === undefined || remote === null) return { action: 'create', doc: local };
  if (!isRecord(local) || !isRecord(remote)) return { action: 'keep' };
  const keys = Object.keys(local).filter((k) => !(k in remote));
  return keys.length === 0 ? { action: 'same' } : { action: 'add', keys, doc: { ...remote, ...Object.fromEntries(keys.map((k) => [k, local[k]])) } };
}

/** a request to the shared server: https with the address of `ip` instead of a lookup of the name when one is given (the name stays in TLS and Host) */
export function request({ origin, token, ip }, method, path, body) {
  const url = new URL(origin);
  const secure = url.protocol === 'https:';
  const lib = secure ? https : http;
  const agent = secure && ip ? new https.Agent({ lookup: (_h, options, cb) => (options && options.all ? cb(null, [{ address: ip, family: 4 }]) : cb(null, ip, 4)) }) : undefined;
  const payload = body === undefined ? undefined : Buffer.from(JSON.stringify(body));
  return new Promise((resolveRequest, reject) => {
    const req = lib.request(
      { hostname: url.hostname, port: url.port || (secure ? 443 : 80), path, method, agent, headers: { 'x-mockup-token': token, ...(payload ? { 'content-type': 'application/json', 'content-length': payload.length } : {}) } },
      (res) => {
        const chunks = [];
        res.on('data', (c) => chunks.push(c));
        res.on('end', () => resolveRequest({ status: res.statusCode ?? 0, text: Buffer.concat(chunks).toString('utf8') }));
      },
    );
    req.on('error', reject);
    req.setTimeout(60000, () => req.destroy(new Error('timeout')));
    if (payload) req.write(payload);
    req.end();
  });
}

/** compares `docs` ({ name: document }) with what the server has and, with `apply`, writes what is missing; returns the plan */
export async function syncSeed(docs, remote, apply = false) {
  const all = await request(remote, 'GET', '/mockup-api/ds-all');
  if (all.status !== 200) throw new Error(`the shared file server answered ${all.status} to ds-all (is the token right?)`);
  const there = JSON.parse(all.text);
  const plan = [];
  for (const [name, local] of Object.entries(docs)) {
    const step = mergeMissing(local, there[name]);
    plan.push({ name, action: step.action, keys: step.keys ?? [] });
    if (apply && (step.action === 'create' || step.action === 'add')) {
      const done = await request(remote, 'PUT', `/mockup-api/ds/${encodeURIComponent(name)}`, step.doc);
      if (done.status !== 200 && done.status !== 204) throw new Error(`could not write ${name}: ${done.status}`);
    }
  }
  return plan;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    for (const line of readFileSync(resolve(root, '.env.mockup.local'), 'utf8').split(/\r?\n/)) {
      const m = /^\s*([A-Z][A-Z0-9_]*)\s*=(.*)$/.exec(line);
      if (m && process.env[m[1]] === undefined) process.env[m[1]] = m[2].trim();
    }
  } catch {
    // no file: the settings come from the shell
  }
  const { remote, problem } = createRequire(import.meta.url)('./mockup-remote-proxy.cjs').mockupRemote(process.env);
  if (!remote) {
    console.error(problem ?? 'Set MOCKUP_REMOTE_URL and MOCKUP_TOKEN in .env.mockup.local (copy .env.mockup.local.example).');
    process.exit(1);
  }
  const apply = process.argv.includes('--apply');
  const { seedDocuments } = await import('./mockup-export-seed.mjs');
  const plan = await syncSeed(await seedDocuments(), remote, apply);
  for (const p of plan) if (p.action === 'create' || p.action === 'add') console.log(`${apply ? 'wrote ' : 'would write'}  ${p.name}  ${p.action === 'create' ? '(new document)' : `+ ${p.keys.join(', ')}`}`);
  const changes = plan.filter((p) => p.action === 'create' || p.action === 'add').length;
  console.log(`${remote.origin}: ${plan.length} documents checked, ${changes} ${apply ? 'written' : 'to write — run with --apply'}, ${plan.filter((p) => p.action === 'same').length} already complete`);
}
