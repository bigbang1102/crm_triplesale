#!/usr/bin/env node
/**
 * `npm run mockup:setup -- --token <the token>`: writes `.env.mockup.local` for a developer machine and checks that the
 * shared file server (Datasource + Storage, https://acedemo.acecloud.co.th:7339) can be reached from here. After that `npm run mockup` is all there is.
 *
 *   --token      the shared secret (ask whoever runs the server; it is in .env.mockup-server on the acedemo machine) — asked for when left out
 *   --url        the address of the server (default https://acedemo.acecloud.co.th:7339)
 *   --force      replace an existing .env.mockup.local
 *
 * MOCKUP_REMOTE_IP is left out on purpose: `npm run mockup` finds out by itself whether the domain or the LAN address of the acedemo machine works.
 */
import { existsSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, resolve } from 'node:path';
import { createInterface } from 'node:readline/promises';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const { checkRemote, mockupRemote } = createRequire(import.meta.url)('./mockup-remote-proxy.cjs');

const arg = (name) => {
  const at = process.argv.indexOf(`--${name}`);
  return at > 0 ? process.argv[at + 1] : undefined;
};

/** the text of the file for these settings */
export function envFile({ url, token }) {
  return [
    '# the shared file server of the mockup (written by `npm run mockup:setup`) — git-ignored, never commit it',
    `MOCKUP_REMOTE_URL=${url}`,
    `MOCKUP_TOKEN=${token}`,
    '',
  ].join('\n');
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const target = resolve(root, '.env.mockup.local');
  if (existsSync(target) && !process.argv.includes('--force')) {
    console.error('.env.mockup.local exists already: not replaced (add --force to replace it).');
    process.exit(1);
  }
  const ask = async (question) => {
    const rl = createInterface({ input: process.stdin, output: process.stdout });
    try {
      return (await rl.question(question)).trim();
    } finally {
      rl.close();
    }
  };
  const token = arg('token') ?? (await ask('The token (ask whoever runs the server): '));
  if (!token) {
    console.error('A token is needed.');
    process.exit(1);
  }
  const url = arg('url') ?? 'https://acedemo.acecloud.co.th:7339';
  const { remote, problem } = mockupRemote({ MOCKUP_REMOTE_URL: url, MOCKUP_TOKEN: token });
  if (!remote) {
    console.error(problem);
    process.exit(1);
  }
  writeFileSync(target, envFile({ url, token }));
  console.log(`written: ${target}`);
  const check = await checkRemote(remote);
  if (!check.ok) console.warn(`The shared file server cannot be reached from here (${check.problem}). The file is written; see MOCKUP.md ("ฝั่ง dev แต่ละคน") when it is not on the office network.`);
  else console.log(check.token ? `Reachable${check.ip ? ` (through the LAN address ${check.ip})` : ''} and the token is accepted. Now: npm run mockup` : 'The server answers but REFUSES this token: check it with whoever runs the server.');
}
