#!/usr/bin/env node
/**
 * The file layer of the mockup: a small local HTTP server (no dependency) that keeps the data of the mock pages in JSON files and
 * the uploaded files on disk, so the data survives a reload / a restart and can be read or edited by hand.
 *
 *   Datasource/<name>.json      one JSON document per name (a collection, or the mirror of a `ts.mock.*` storage key)
 *   Storage/<folder>/<id>__<file name>   an uploaded file;  Storage/_index.json = id → { name, type, size, path, createdAt }
 *
 *   GET    /mockup-api/health                       → { ok, datasource, storage }
 *   GET    /mockup-api/ds                           → { names: [...] }
 *   GET    /mockup-api/ds-all                       → { <name>: <document>, ... }      (the preload of the app)
 *   GET    /mockup-api/ds/<name>                    → the document (404 when there is none)
 *   PUT    /mockup-api/ds/<name>      body = JSON   → writes the document (atomic: temp file + rename)
 *   DELETE /mockup-api/ds/<name>                    → removes it (the page then starts from its seed again)
 *   POST   /mockup-api/journal/<name>  body = one entry → appends it to `journal.<name>` (atomic, in arrival order) → { seq, rev }
 *   GET    /mockup-api/journal/<name>?after=<n>         → { seq, entries: [the entries after the n-th] }
 *   GET    /mockup-api/changes?since=<rev>&wait=<ms>    → { epoch, rev, changed: [{ name, rev }] }: what changed after `rev`; when nothing did it WAITS
 *                                                          (at most `wait` ms, 25 s by default) for the next change — how every client learns at once
 *                                                          what somebody else did. Every write above (and a journal append) takes the next `rev`.
 *   POST   /mockup-api/storage?name=<file>&folder=<sub>   body = the bytes (Content-Type is kept)  → { id, name, type, size, url }
 *   GET    /mockup-api/storage/<id>[?download=1]    → the bytes (inline, or as an attachment with ?download=1)
 *   DELETE /mockup-api/storage/<id>
 *
 *   plus a pretend Keycloak + the session part of triplesales-api (tools/lib/mockup-idp.mjs): /mockup-idp/… and /mockup-tps/api/v1/…
 *   (group code → PKCE sign-in → /me/session → choose a company), used by `npm run mockup:tenant`
 *
 *   MOCKUP_PORT (4310) · MOCKUP_DATASOURCE (<root>/Datasource) · MOCKUP_STORAGE (<root>/Storage)
 *
 * Alone on a developer's machine it listens on 127.0.0.1 with no authentication (a developer tool). Shared by several developers
 * (a Docker container behind https — docker/mockup-server/, docs in MOCKUP.md) it needs two more things:
 *   MOCKUP_HOST   the address to listen on (0.0.0.0 in the container). Anything but loopback REQUIRES MOCKUP_TOKEN (refuses to start without).
 *   MOCKUP_TOKEN  a shared secret: every call except GET /mockup-api/health must carry it in the `x-mockup-token` header (the dev server
 *                 of each developer adds it — proxy.conf.cjs — so it never reaches the browser, nor an <img> that shows a stored file).
 * By default there is ONE state: everybody reads and writes the same documents (like the calls of an API), and learns of the changes of the others
 * through `changes`.
 *
 * A caller can ask for a WORKSPACE of its own (header `x-mockup-workspace: <name>`; the dev server adds it from MOCKUP_WORKSPACE): then the documents it
 * writes (state, shared-db, journals …) go to Datasource/_workspaces/<name>/<doc>.json, and it reads its own copy of a document when it has one, else the
 * shared one. Nobody else sees what a workspace holds, and the workspace does not hear the changes of the documents it has a copy of (it hears the shared
 * ones it has not copied). Storage/ stays shared. A workspace is used when somebody wants to try things without touching the data of the others.
 */
import { createServer } from 'node:http';
import { randomBytes, timingSafeEqual } from 'node:crypto';
import { mkdir, readFile, readdir, rename, rm, stat, writeFile } from 'node:fs/promises';
import { createReadStream } from 'node:fs';
import { dirname, join, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createIdp } from './lib/mockup-idp.mjs';

const PREFIX = '/mockup-api';
const NAME = /^[A-Za-z0-9][A-Za-z0-9._-]{0,99}$/;
const ID = /^[a-f0-9]{16}$/;
const MAX_JSON_BYTES = 20 * 1024 * 1024;
const MAX_FILE_BYTES = 50 * 1024 * 1024;
const INDEX = '_index.json';
const TOKEN_HEADER = 'x-mockup-token';
const BASE_REV_HEADER = 'x-mockup-base-rev';
const WORKSPACE_HEADER = 'x-mockup-workspace';
const WORKSPACES = '_workspaces';
const WORKSPACE_NAME = /^[A-Za-z0-9][A-Za-z0-9_-]{0,39}$/;
const JOURNAL = 'journal.';
const MAX_WAIT_MS = 55000;
const DEFAULT_WAIT_MS = 25000;

/** true when the two secrets are equal (same time whatever the first difference) */
export function sameToken(given, expected) {
  const a = Buffer.from(String(given ?? ''));
  const b = Buffer.from(String(expected ?? ''));
  return a.length === b.length && timingSafeEqual(a, b);
}

/** true for an address only this machine can reach */
export const isLoopback = (host) => ['127.0.0.1', 'localhost', '::1'].includes(String(host));

/** a file name that is safe on disk: no path, no control characters, no leading dots; the Thai letters stay */
export function safeFileName(name) {
  const base = String(name ?? '').split(/[\\/]/).pop() ?? '';
  // eslint-disable-next-line no-control-regex
  const clean = base.replace(/[\u0000-\u001f<>:"|?*]/g, '_').replace(/^\.+/, '').trim().slice(0, 150);
  return clean === '' ? 'file' : clean;
}

/** a sub folder of Storage: letters, digits, "-", "_" and "." in segments joined by "/", never "..", at most 3 deep */
export function safeFolder(folder) {
  const parts = String(folder ?? '').split('/').filter(Boolean);
  if (parts.length > 3 || parts.some((p) => !/^[A-Za-z0-9][A-Za-z0-9._-]{0,59}$/.test(p) || p === '..')) return undefined;
  return parts.join('/');
}

function readBody(req, limit) {
  return new Promise((resolveBody, reject) => {
    const chunks = [];
    let size = 0;
    req.on('data', (c) => {
      size += c.length;
      if (size > limit) {
        reject(Object.assign(new Error('payload too large'), { status: 413 }));
        req.destroy();
        return;
      }
      chunks.push(c);
    });
    req.on('end', () => resolveBody(Buffer.concat(chunks)));
    req.on('error', reject);
  });
}

async function writeAtomic(file, data) {
  const tmp = `${file}.${randomBytes(4).toString('hex')}.tmp`;
  await writeFile(tmp, data);
  await rename(tmp, file);
}

/** @param {{ datasourceDir: string, storageDir: string, token?: string }} options  `token`: when set, every call but the health check must carry it */
export function createMockupServer({ datasourceDir, storageDir, token }) {
  const ds = resolve(datasourceDir);
  const st = resolve(storageDir);
  // one write at a time per file: two quick PUTs of the same name must not interleave, and the storage index is read-modify-write
  const queues = new Map();
  const serial = (key, job) => {
    const run = (queues.get(key) ?? Promise.resolve()).catch(() => undefined).then(job);
    queues.set(key, run);
    return run;
  };

  /** the file of a document: the shared one, or the copy in the workspace `ws` */
  const docFile = (name, ws) => (ws ? join(ds, WORKSPACES, ws, `${name}.json`) : join(ds, `${name}.json`));
  const exists = async (file) => {
    try {
      await stat(file);
      return true;
    } catch {
      return false;
    }
  };
  /** the file to read: the caller's own copy when it has one, else the shared document */
  const readableFile = async (name, ws) => (ws && (await exists(docFile(name, ws))) ? docFile(name, ws) : docFile(name));
  /** the key a document is tracked under: its name, or `<workspace>:<name>` (a name never has a colon) */
  const keyOf = (name, ws) => (ws ? `${ws}:${name}` : name);

  // What changed and when: every write takes the next `rev`; `lastRev` says at which `rev` each document last changed; the clients that wait on
  // `changes` are woken by the next one. `epoch` tells a client that the server restarted (the revs start again: it must load everything again).
  const epoch = randomBytes(4).toString('hex');
  let rev = 0;
  const lastRev = new Map();
  const waiters = new Set();
  const changed = (name, ws) => {
    rev += 1;
    lastRev.set(keyOf(name, ws), rev);
    for (const wake of [...waiters]) wake();
    return rev;
  };
  /**
   * what changed after `since` as `ws` sees it: the shared documents it has no copy of (`owned` = the names it has), and its own copies. Somebody else's
   * workspace is never in it, and a shared document the workspace copied is not news to it (it reads its copy).
   */
  const changesSince = (since, ws, owned = new Set()) =>
    [...lastRev.entries()]
      .filter(([, r]) => r > since)
      .flatMap(([key, r]) => {
        const colon = key.indexOf(':');
        if (colon < 0) return ws && owned.has(key) ? [] : [{ name: key, rev: r }];
        return ws && key.slice(0, colon) === ws ? [{ name: key.slice(colon + 1), rev: r }] : [];
      })
      .sort((a, b) => a.rev - b.rev);
  /** the revision the document this caller reads was last changed at (its own copy, else the shared one) */
  const lastRevOf = async (name, ws) => (ws && (await exists(docFile(name, ws))) ? lastRev.get(keyOf(name, ws)) : lastRev.get(name)) ?? 0;

  const idp = createIdp({
    readDoc: async (name) => {
      try {
        return JSON.parse(await readFile(docFile(name), 'utf8'));
      } catch {
        return undefined;
      }
    },
  });

  async function readIndex() {
    try {
      return JSON.parse(await readFile(join(st, INDEX), 'utf8'));
    } catch {
      return {};
    }
  }

  const send = (res, status, body, headers = {}) => {
    const isBuffer = Buffer.isBuffer(body);
    const payload = isBuffer ? body : JSON.stringify(body);
    res.writeHead(status, { 'content-type': isBuffer ? 'application/octet-stream' : 'application/json; charset=utf-8', 'cache-control': 'no-store', ...headers });
    res.end(payload);
  };

  async function namesIn(dir) {
    try {
      return (await readdir(dir)).filter((f) => f.endsWith('.json')).map((f) => f.slice(0, -5)).filter((n) => NAME.test(n));
    } catch {
      return [];
    }
  }

  /** the shared documents and the ones of the caller's workspace */
  const listNames = async (ws) => [...new Set([...(await namesIn(ds)), ...(ws ? await namesIn(join(ds, WORKSPACES, ws)) : [])])].sort();

  async function handleDs(req, res, name, ws) {
    if (name === undefined) return send(res, 200, { names: await listNames(ws) });
    if (!NAME.test(name)) return send(res, 400, { error: 'bad name' });
    if (req.method === 'GET') {
      try {
        return send(res, 200, await readFile(await readableFile(name, ws)), { 'content-type': 'application/json; charset=utf-8' });
      } catch {
        return send(res, 404, { error: 'not found' });
      }
    }
    if (req.method === 'PUT') {
      const raw = await readBody(req, MAX_JSON_BYTES);
      try {
        JSON.parse(raw.toString('utf8'));
      } catch {
        return send(res, 400, { error: 'body is not JSON' });
      }
      // A page that saves a whole document says which revision it started from (`x-mockup-base-rev`). If somebody saved the document after that,
      // the write is refused with the newer document: the page merges its change into it and saves again, so nobody's change is lost.
      const baseHeader = req.headers[BASE_REV_HEADER];
      const base = baseHeader === undefined ? undefined : Number(baseHeader);
      const outcome = await serial(`ds:${ws ?? ''}:${name}`, async () => {
        const nowRev = await lastRevOf(name, ws);
        if (base !== undefined && Number.isFinite(base) && nowRev > base) {
          let current;
          try {
            current = JSON.parse(await readFile(await readableFile(name, ws), 'utf8'));
          } catch {
            current = undefined; // the document was removed after the page read it
          }
          return { conflict: true, rev: nowRev, doc: current };
        }
        await mkdir(dirname(docFile(name, ws)), { recursive: true });
        // pretty-printed: the file is meant to be read and edited by a person
        await writeAtomic(docFile(name, ws), JSON.stringify(JSON.parse(raw.toString('utf8')), null, 2) + '\n');
        return { rev: changed(name, ws) };
      });
      if (outcome.conflict) return send(res, 409, { conflict: true, rev: outcome.rev, doc: outcome.doc ?? null });
      return send(res, 200, { ok: true, rev: outcome.rev });
    }
    if (req.method === 'DELETE') {
      // in a workspace only the caller's own copy goes (the shared document stays, and is what it reads again)
      const taken = await serial(`ds:${ws ?? ''}:${name}`, async () => {
        await rm(docFile(name, ws), { force: true });
        return changed(name, ws);
      });
      return send(res, 200, { ok: true, rev: taken });
    }
    return send(res, 405, { error: 'method not allowed' });
  }

  async function handleDsAll(res, ws) {
    const all = {};
    for (const name of await listNames(ws)) {
      try {
        all[name] = JSON.parse(await readFile(await readableFile(name, ws), 'utf8'));
      } catch {
        // a document that is not valid JSON (edited by hand) is left out, not a reason to stop the preload
      }
    }
    return send(res, 200, all);
  }

  async function handleStorage(req, res, url, id) {
    if (req.method === 'POST' && id === undefined) {
      const name = safeFileName(url.searchParams.get('name'));
      const folder = safeFolder(url.searchParams.get('folder') ?? '');
      if (folder === undefined) return send(res, 400, { error: 'bad folder' });
      const bytes = await readBody(req, MAX_FILE_BYTES);
      const newId = randomBytes(8).toString('hex');
      const rel = `${folder === '' ? '_' : folder}/${newId}__${name}`;
      const type = (req.headers['content-type'] ?? 'application/octet-stream').split(';')[0].trim() || 'application/octet-stream';
      await serial('storage-index', async () => {
        const target = join(st, ...rel.split('/'));
        await mkdir(dirname(target), { recursive: true });
        await writeAtomic(target, bytes);
        const index = await readIndex();
        index[newId] = { name, type, size: bytes.length, path: rel, createdAt: new Date().toISOString() };
        await writeAtomic(join(st, INDEX), JSON.stringify(index, null, 2) + '\n');
      });
      return send(res, 201, { id: newId, name, type, size: bytes.length, url: `${PREFIX}/storage/${newId}` });
    }
    if (id === undefined || !ID.test(id)) return send(res, 400, { error: 'bad id' });
    const meta = (await readIndex())[id];
    if (!meta) return send(res, 404, { error: 'not found' });
    const file = join(st, ...meta.path.split('/'));
    if (!resolve(file).startsWith(st + sep)) return send(res, 400, { error: 'bad path' });
    if (req.method === 'GET') {
      try {
        const info = await stat(file);
        const disposition = url.searchParams.get('download') === '1' ? 'attachment' : 'inline';
        res.writeHead(200, {
          'content-type': meta.type,
          'content-length': info.size,
          'content-disposition': `${disposition}; filename*=UTF-8''${encodeURIComponent(meta.name)}`,
          'cache-control': 'no-store',
        });
        createReadStream(file).pipe(res);
        return undefined;
      } catch {
        return send(res, 404, { error: 'file is gone' });
      }
    }
    if (req.method === 'DELETE') {
      await serial('storage-index', async () => {
        await rm(file, { force: true });
        const index = await readIndex();
        delete index[id];
        await writeAtomic(join(st, INDEX), JSON.stringify(index, null, 2) + '\n');
      });
      return send(res, 200, { ok: true });
    }
    return send(res, 405, { error: 'method not allowed' });
  }

  const readJournal = async (name, ws) => {
    try {
      const list = JSON.parse(await readFile(await readableFile(`${JOURNAL}${name}`, ws), 'utf8'));
      return Array.isArray(list) ? list : [];
    } catch {
      return [];
    }
  };

  /** the journal of a mock page: the calls that changed its data, in the order the server got them — the order every client plays them in */
  async function handleJournal(req, res, url, name, ws) {
    if (name === undefined || !NAME.test(name)) return send(res, 400, { error: 'bad name' });
    if (req.method === 'GET') {
      const after = Math.max(0, Number.parseInt(url.searchParams.get('after') ?? '0', 10) || 0);
      const list = await readJournal(name, ws);
      return send(res, 200, { seq: list.length, entries: list.slice(after) });
    }
    if (req.method === 'POST') {
      let entry;
      try {
        entry = JSON.parse((await readBody(req, MAX_JSON_BYTES)).toString('utf8'));
      } catch {
        return send(res, 400, { error: 'body is not JSON' });
      }
      if (typeof entry !== 'object' || entry === null || Array.isArray(entry)) return send(res, 400, { error: 'an entry is an object' });
      // a workspace starts from the shared row and keeps its own from the first entry on
      const out = await serial(`ds:${ws ?? ''}:${JOURNAL}${name}`, async () => {
        const list = await readJournal(name, ws);
        list.push(entry);
        await mkdir(dirname(docFile(`${JOURNAL}${name}`, ws)), { recursive: true });
        await writeAtomic(docFile(`${JOURNAL}${name}`, ws), JSON.stringify(list, null, 2) + '\n');
        return { seq: list.length, rev: changed(`${JOURNAL}${name}`, ws) };
      });
      return send(res, 201, out);
    }
    return send(res, 405, { error: 'method not allowed' });
  }

  /** what changed after `since`; with nothing new it waits for the next change (a long poll), so a client hears of it at once */
  async function handleChanges(req, res, url, ws) {
    const since = Math.max(0, Number.parseInt(url.searchParams.get('since') ?? '', 10));
    const asked = Number.parseInt(url.searchParams.get('wait') ?? '', 10);
    const wait = Math.min(Number.isFinite(asked) ? Math.max(0, asked) : DEFAULT_WAIT_MS, MAX_WAIT_MS);
    // no `since`: where the cursor is now (a client takes it BEFORE it loads the documents, so it misses nothing in between)
    if (!Number.isFinite(since)) return send(res, 200, { epoch, rev, changed: [] });
    // the shared documents this workspace has a copy of are not news to it
    const news = async () => changesSince(since, ws, ws ? new Set(await namesIn(join(ds, WORKSPACES, ws))) : undefined);
    const now = await news();
    if (now.length > 0 || wait === 0) return send(res, 200, { epoch, rev, changed: now });
    const deadline = Date.now() + wait;
    let gone = false;
    res.on('close', () => (gone = true)); // the client went away: nobody to answer
    // woken at every change, it answers when the change is one this caller hears of (a change in another workspace only wakes it up for nothing)
    for (let left = wait; left > 0 && !gone; left = deadline - Date.now()) {
      await new Promise((done) => {
        const wake = () => finish();
        const timer = setTimeout(() => finish(), left);
        const finish = () => {
          clearTimeout(timer);
          waiters.delete(wake);
          res.off('close', finish);
          done();
        };
        waiters.add(wake);
        res.on('close', finish);
      });
      if (gone || res.destroyed || res.writableEnded) return undefined;
      const fresh = await news();
      if (fresh.length > 0) return send(res, 200, { epoch, rev, changed: fresh });
    }
    if (gone || res.destroyed || res.writableEnded) return undefined;
    return send(res, 200, { epoch, rev, changed: [] });
  }

  /** the workspace the caller asked for (undefined = the shared documents); a name that is not a plain word is refused */
  function workspaceOf(req) {
    const raw = req.headers[WORKSPACE_HEADER];
    if (raw === undefined || raw === '') return undefined;
    if (typeof raw !== 'string' || !WORKSPACE_NAME.test(raw)) throw Object.assign(new Error('bad workspace'), { status: 400 });
    return raw;
  }

  return createServer(async (req, res) => {
    try {
      const url = new URL(req.url ?? '/', 'http://localhost');
      const isHealth = url.pathname === `${PREFIX}/health`;
      // the health check answers without the token (the container's healthcheck, "is it up"), but tells nothing about the machine
      if (token && !sameToken(req.headers[TOKEN_HEADER], token)) {
        return isHealth ? send(res, 200, { ok: true }) : send(res, 401, { error: 'token required' });
      }
      if (idp.owns(url.pathname)) return await idp.handle(req, res, url);
      if (!url.pathname.startsWith(`${PREFIX}/`) && url.pathname !== PREFIX) return send(res, 404, { error: 'not found' });
      const [area, key] = url.pathname.slice(PREFIX.length + 1).split('/');
      if (area === 'health') return send(res, 200, { ok: true, datasource: ds, storage: st, auth: Boolean(token) });
      const ws = workspaceOf(req);
      if (area === 'ds-all' && req.method === 'GET') return await handleDsAll(res, ws);
      if (area === 'ds') return await handleDs(req, res, key === undefined ? undefined : decodeURIComponent(key), ws);
      if (area === 'journal') return await handleJournal(req, res, url, key === undefined ? undefined : decodeURIComponent(key), ws);
      if (area === 'changes' && req.method === 'GET') return await handleChanges(req, res, url, ws);
      if (area === 'storage') return await handleStorage(req, res, url, key);
      return send(res, 404, { error: 'not found' });
    } catch (e) {
      return send(res, e?.status ?? 500, { error: e?.message ?? 'error' });
    }
  });
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
  const port = Number(process.env.MOCKUP_PORT ?? 4310);
  const host = process.env.MOCKUP_HOST ?? '127.0.0.1';
  const token = process.env.MOCKUP_TOKEN || undefined;
  // reachable from other machines = anyone who finds the address can read and write the data: never without a secret
  if (!isLoopback(host) && !token) {
    console.error(`MOCKUP_HOST=${host} is reachable from the network: set MOCKUP_TOKEN (a long random secret) first.`);
    process.exit(1);
  }
  // the data lives in ONE place (the folders the shared server mounts, e.g. D:\\mockup-data): never in a folder of the project, so name them
  if (!process.env.MOCKUP_DATASOURCE || !process.env.MOCKUP_STORAGE) {
    console.error('Set MOCKUP_DATASOURCE and MOCKUP_STORAGE (the folders of the shared data, e.g. D:\\mockup-data\\Datasource and \\Storage). The project keeps no copy of its own.');
    process.exit(1);
  }
  const server = createMockupServer({
    datasourceDir: process.env.MOCKUP_DATASOURCE,
    storageDir: process.env.MOCKUP_STORAGE,
    token,
  });
  server.listen(port, host, () => console.log(`Mockup file server on http://${host}:${port}${PREFIX}  (Datasource + Storage${token ? ', token required' : ''})`));
}
