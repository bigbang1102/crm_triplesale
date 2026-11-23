#!/usr/bin/env node
/**
 * `npm run mockup` (or `npm run mockup:tenant`): the dev server of the app (mock mode, port 4300) with its data on THIS machine: a small file server
 * (tools/mockup-server.mjs, 127.0.0.1:4310) keeps the Datasource and the Storage in `.mockup-data/` (git-ignored) and the dev server's proxy sends
 * /mockup-api there. Nothing is read from or written to any other server. The first run writes the sign-in documents (group sun · admin/admin ·
 * demo/demo: tools/lib/mockup-local-data.mjs); edit the files in .mockup-data/Datasource by hand when you want other accounts or data.
 *
 * The shared file server is still possible, only on purpose: set MOCKUP_REMOTE_URL + MOCKUP_TOKEN (environment, or the git-ignored `.env.mockup.local`).
 * `--local` (or MOCKUP_LOCAL=1) keeps the data on this machine even then.
 */
import { spawn } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { ensureLocalData } from './lib/mockup-local-data.mjs';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const run = (command, args) => spawn(command, args, { cwd: root, stdio: 'inherit', shell: true });
const proxy = createRequire(import.meta.url)('./mockup-remote-proxy.cjs');

// the same `.env.mockup.local` the proxy reads (an environment variable that is already set wins)
try {
  for (const line of readFileSync(resolve(root, '.env.mockup.local'), 'utf8').split(/\r?\n/)) {
    const m = /^\s*([A-Z][A-Z0-9_]*)\s*=(.*)$/.exec(line);
    if (m && process.env[m[1]] === undefined) process.env[m[1]] = m[2].trim();
  }
} catch {
  // no file: the settings come from the shell
}

const forceLocal = process.argv.includes('--local') || process.env.MOCKUP_LOCAL === '1';
// an empty value that is already set wins over the file: the dev server's proxy (a child process) then keeps its local default
if (forceLocal) process.env.MOCKUP_REMOTE_URL = '';
const { remote, problem } = proxy.mockupRemote(process.env);
if (problem) console.warn(`[mockup] ${problem}`);

/** what to stop together: the local file server (when there is one) and the dev server */
const children = [];

if (remote) {
  console.log(`[mockup] data from the shared file server ${remote.origin} ${remote.workspace ? `— WORKSPACE "${remote.workspace}": what you write stays in _workspaces/${remote.workspace}/ and nobody else sees it` : '(one state for everybody: what anyone does is seen by all at once)'}`);
  // before the dev server starts: can this machine use the shared server? (the app shows a page and keeps asking when it cannot, so this only says why)
  const check = await proxy.checkRemote(remote);
  if (check.ok) {
    if (check.ip && !remote.ip) {
      process.env.MOCKUP_REMOTE_IP = check.ip; // the dev server's proxy (a child process) reads it
      console.log(`[mockup] the domain does not lead to the server from this machine: using its LAN address ${check.ip}`);
    }
    console.log(check.token ? '[mockup] the shared file server answers and the token is accepted' : '[mockup] the shared file server answers but REFUSES the token: check MOCKUP_TOKEN in .env.mockup.local');
  } else {
    console.warn(`[mockup] the shared file server cannot be reached (${check.problem}). The dev server starts anyway; the app shows a page and keeps asking.`);
  }
} else {
  // the data of this machine: .mockup-data/Datasource + .mockup-data/Storage, served on 127.0.0.1:4310 (what proxy.conf.json points /mockup-api at)
  const dataDir = resolve(root, '.mockup-data');
  const local = await ensureLocalData(dataDir);
  if (local.written.length) console.log(`[mockup] first run: wrote ${local.written.join(', ')} in ${local.datasource} — sign in with group code sun · admin / admin (or demo / demo)`);
  console.log(`[mockup] data on this machine only: ${dataDir}`);
  children.push(
    spawn(process.execPath, ['tools/mockup-server.mjs'], {
      cwd: root,
      stdio: 'inherit',
      env: { ...process.env, MOCKUP_DATASOURCE: local.datasource, MOCKUP_STORAGE: local.storage, MOCKUP_PORT: '4310', MOCKUP_HOST: '127.0.0.1' },
    }),
  );
}

// --tenant: the sign-in of the real system (group code, Keycloak PKCE, company choice) against the pretend identity provider of the file server
const tenant = process.argv.includes('--tenant');
// --port <n> (default 4300): the port of the dev server of the app
const portAt = process.argv.indexOf('--port');
const port = portAt > 0 && /^\d+$/.test(process.argv[portAt + 1] ?? '') ? process.argv[portAt + 1] : '4300';
const serve = ['ng', 'serve', '--port', port, ...(tenant ? ['--configuration', 'mockup-tenant'] : [])];
children.push(run('npx', serve));
const stop = () => children.forEach((c) => c.kill());
process.on('SIGINT', stop);
process.on('SIGTERM', stop);
// one of them ending (a port already taken, a build error) ends the other: do not leave a half-started mockup behind
children.forEach((c) => c.on('exit', (code) => (code ? (stop(), process.exit(code)) : undefined)));
