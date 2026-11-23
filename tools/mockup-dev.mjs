#!/usr/bin/env node
/**
 * `npm run mockup` (or `npm run mockup:tenant`): the dev server of the app (mock mode, port 4300) with its data on the ONE file server every developer shares
 * (Datasource + Storage, D:\mockup-data on the Docker host, behind https). Needs MOCKUP_REMOTE_URL + MOCKUP_TOKEN (environment, or the git-ignored
 * `.env.mockup.local`): the dev server's proxy (proxy.conf.cjs) sends /mockup-api there. There is no local copy of the data and no local file server.
 */
import { spawn } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const run = (command, args) => spawn(command, args, { cwd: root, stdio: 'inherit', shell: true });

// the same `.env.mockup.local` the proxy reads (an environment variable that is already set wins)
try {
  for (const line of readFileSync(resolve(root, '.env.mockup.local'), 'utf8').split(/\r?\n/)) {
    const m = /^\s*([A-Z][A-Z0-9_]*)\s*=(.*)$/.exec(line);
    if (m && process.env[m[1]] === undefined) process.env[m[1]] = m[2].trim();
  }
} catch {
  // no file: the settings come from the shell
}
const { remote, problem } = createRequire(import.meta.url)('./mockup-remote-proxy.cjs').mockupRemote(process.env);
if (problem) console.warn(`[mockup] ${problem}`);
if (!remote) {
  console.error('[mockup] The data of the mockup is on the shared file server only. Set MOCKUP_REMOTE_URL and MOCKUP_TOKEN in .env.mockup.local (copy .env.mockup.local.example).');
  process.exit(1);
}
console.log(`[mockup] data from the shared file server ${remote.origin} ${remote.workspace ? `— WORKSPACE "${remote.workspace}": what you write stays in _workspaces/${remote.workspace}/ and nobody else sees it` : '(one state for everybody: what anyone does is seen by all at once)'}`);

// before the dev server starts: can this machine use the shared server? (the app shows a page and keeps asking when it cannot, so this only says why)
const check = await createRequire(import.meta.url)('./mockup-remote-proxy.cjs').checkRemote(remote);
if (check.ok) {
  if (check.ip && !remote.ip) {
    process.env.MOCKUP_REMOTE_IP = check.ip; // the dev server's proxy (a child process) reads it
    console.log(`[mockup] the domain does not lead to the server from this machine: using its LAN address ${check.ip}`);
  }
  console.log(check.token ? '[mockup] the shared file server answers and the token is accepted' : '[mockup] the shared file server answers but REFUSES the token: check MOCKUP_TOKEN in .env.mockup.local');
} else {
  const hint = check.problem === 'ETIMEDOUT'
    ? 'it did not answer in time: the firewall of the acedemo machine may not allow port 7339 yet (on that machine, as administrator: New-NetFirewallRule -DisplayName "triple-sales-mockup gateway 7339 (LAN)" -Direction Inbound -Action Allow -Protocol TCP -LocalPort 7339 -RemoteAddress LocalSubnet) — or this machine is not on the office network'
    : check.problem === 'ECONNREFUSED' && remote.ip === '127.0.0.1'
      ? 'MOCKUP_REMOTE_IP=127.0.0.1 only works on the machine that runs the gateway: remove that line (or use 192.168.24.233)'
      : 'is the container triple-sales-mockup-data + triple-sales-mockup-gateway running on the acedemo machine?';
  console.warn(`[mockup] the shared file server cannot be reached (${check.problem}) — ${hint}. The dev server starts anyway; the app shows a page and keeps asking.`);
}

// --tenant: the sign-in of the real system (group code, Keycloak PKCE, company choice) against the pretend identity provider of the file server
const tenant = process.argv.includes('--tenant');
// --port <n> (default 4300): the port of the dev server of the app
const portAt = process.argv.indexOf('--port');
const port = portAt > 0 && /^\d+$/.test(process.argv[portAt + 1] ?? '') ? process.argv[portAt + 1] : '4300';
const serve = ['ng', 'serve', '--port', port, ...(tenant ? ['--configuration', 'mockup-tenant'] : [])];
const children = [run('npx', serve)];
const stop = () => children.forEach((c) => c.kill());
process.on('SIGINT', stop);
process.on('SIGTERM', stop);
// one of them ending (a port already taken, a build error) ends the other: do not leave a half-started mockup behind
children.forEach((c) => c.on('exit', (code) => (code ? (stop(), process.exit(code)) : undefined)));
