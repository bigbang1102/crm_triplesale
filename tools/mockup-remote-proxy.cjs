/**
 * Points the dev server of ONE developer at the file server that all of them share (Datasource/ + Storage/ in a Docker container behind https),
 * instead of the one that `npm run mockup` starts on their own machine.
 *
 *   MOCKUP_REMOTE_URL   https://acedemo.acecloud.co.th:7339      (the origin; the paths /mockup-api, /mockup-idp, /mockup-tps are kept)
 *   MOCKUP_TOKEN        the shared secret of that server          (added to every call here — it never reaches the browser)
 *   MOCKUP_WORKSPACE    optional: the name of a workspace of your own (letters, digits, _ and -). Without it there is ONE state for everybody (what one does is
 *                       seen by all at once). With it the data you write goes to Datasource/_workspaces/<name>/ on the server and nobody else sees it
 *   MOCKUP_REMOTE_IP    the address to connect to instead of looking the name up (optional): on the machine that runs the gateway itself the public
 *                       address of the domain does not come back to it, so put 127.0.0.1 there — the name stays in the TLS handshake and in `Host`,
 *                       so it is still the domain https://… that is called (certificate checked, virtual host chosen as for everybody else)
 *
 * They come from the environment or from the git-ignored file `.env.mockup.local` at the project root (see `.env.mockup.local.example`).
 * The browser keeps calling the same addresses (/mockup-api/…) of its own dev server, so no page and no client code knows the difference —
 * and the token also reaches an <img> / a download of a stored file, which could not carry a header by itself.
 */
const MOCKUP_PATHS = ['/mockup-api', '/mockup-idp', '/mockup-tps'];
const IPV4 = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/;
const https = require('node:https');

/** the shared server the developer asked for, or `{ remote: undefined }`; `problem` says what is wrong with the settings */
function mockupRemote(env = process.env) {
  const raw = (env.MOCKUP_REMOTE_URL ?? '').trim();
  if (raw === '') return { remote: undefined };
  let url;
  try {
    url = new URL(raw);
  } catch {
    return { remote: undefined, problem: `MOCKUP_REMOTE_URL is not an address: ${raw}` };
  }
  if (url.protocol !== 'https:' && url.protocol !== 'http:') return { remote: undefined, problem: 'MOCKUP_REMOTE_URL must start with https://' };
  const token = (env.MOCKUP_TOKEN ?? '').trim();
  if (token === '') return { remote: undefined, problem: 'MOCKUP_TOKEN is needed with MOCKUP_REMOTE_URL (ask whoever runs the shared server)' };
  const workspace = (env.MOCKUP_WORKSPACE ?? '').trim();
  if (workspace !== '' && !/^[A-Za-z0-9][A-Za-z0-9_-]{0,39}$/.test(workspace)) return { remote: undefined, problem: 'MOCKUP_WORKSPACE may only have letters, digits, _ and - (up to 40, starting with a letter or digit)' };
  const ip = (env.MOCKUP_REMOTE_IP ?? '').trim();
  if (ip !== '' && !(IPV4.test(ip) && ip.split('.').every((n) => Number(n) <= 255))) return { remote: undefined, problem: 'MOCKUP_REMOTE_IP must be an IPv4 address such as 127.0.0.1' };
  return { remote: { origin: url.origin, token, workspace, ip } };
}

/** an https agent that connects to `ip` whatever the name says (the name still goes into the handshake and the Host header) */
function agentTo(ip) {
  return new https.Agent({
    keepAlive: true,
    lookup: (_hostname, options, callback) => (options && options.all ? callback(null, [{ address: ip, family: 4 }]) : callback(null, ip, 4)),
  });
}

/**
 * What the proxy does when the shared server cannot be reached: ONE line that says so (with the usual cause), a quiet 502 for every call — instead of a
 * stack trace per call, which the page of the app (it asks `/mockup-api/health` every few seconds while the server is away) would fill the terminal with.
 */
function quietWhenUnreachable({ origin, ip }) {
  let told = false;
  const isLoopback = ip === '127.0.0.1' || ip === '::1';
  return (proxy) => {
    // the dev server adds its own 'error' listener after this one (it prints a stack per call): from here on only ours counts
    const on = proxy.on.bind(proxy);
    proxy.removeAllListeners('error');
    proxy.on = (event, listener) => (event === 'error' ? proxy : on(event, listener));
    on('error', (err, _req, res) => {
      if (!told) {
        told = true;
        const cause = isLoopback
          ? 'MOCKUP_REMOTE_IP=127.0.0.1 only works on the machine that runs the gateway: on any other machine put the LAN address of that machine there (192.168.24.233) or remove the line'
          : 'is the file server (Docker: triple-sales-mockup-data + triple-sales-mockup-gateway) running, and is the address reachable from this machine?';
        console.warn(`[mockup] the shared file server ${origin}${ip ? ` (connecting to ${ip})` : ''} cannot be reached (${err.code ?? err.message}) — ${cause}. The app shows a page and keeps asking quietly.`);
      }
      if (res && typeof res.writeHead === 'function' && !res.headersSent) {
        res.writeHead(502, { 'content-type': 'application/json' });
        res.end('{"error":"mockup file server unreachable"}');
      }
    });
    on('proxyRes', () => {
      if (told) console.log('[mockup] the shared file server is reachable again');
      told = false;
    });
  };
}

/** the entries of the proxy table for the three mockup paths, pointed at the shared server */
function remoteEntries({ origin, token, ip, workspace }) {
  const configure = quietWhenUnreachable({ origin, ip });
  const headers = { 'x-mockup-token': token, ...(workspace ? { 'x-mockup-workspace': workspace } : {}) };
  return Object.fromEntries(
    MOCKUP_PATHS.map((path) => [
      path,
      // changeOrigin: the gateway picks its virtual host by the Host header
      { target: origin, secure: true, changeOrigin: true, headers, logLevel: 'warn', configure, ...(ip && origin.startsWith('https:') ? { agent: agentTo(ip) } : {}) },
    ]),
  );
}

/** `table` with the mockup paths pointed at the shared server (the table itself when there is none) */
function applyMockupRemote(table, env = process.env) {
  const { remote, problem } = mockupRemote(env);
  if (problem) console.warn(`[mockup] shared file server ignored: ${problem}`);
  return remote ? { ...table, ...remoteEntries(remote) } : table;
}

/** the LAN address of the machine that runs the gateway (acedemo): what another machine of the office uses when the domain does not lead to it */
const LAN_FALLBACK_IP = '192.168.24.233';

/** one GET to the shared server for the check below: { status } or { error } (a code like ECONNREFUSED / ETIMEDOUT) */
function probe({ origin, token, ip }, urlPath, timeoutMs) {
  const http = require('node:http');
  return new Promise((resolve) => {
    const url = new URL(origin);
    const secure = url.protocol === 'https:';
    const req = (secure ? https : http).request(
      { hostname: url.hostname, port: url.port || (secure ? 443 : 80), path: urlPath, method: 'GET', headers: token ? { 'x-mockup-token': token } : {}, ...(secure && ip ? { agent: agentTo(ip) } : {}) },
      (res) => {
        res.resume();
        resolve({ status: res.statusCode });
      },
    );
    req.setTimeout(timeoutMs, () => req.destroy(Object.assign(new Error('timeout'), { code: 'ETIMEDOUT' })));
    req.on('error', (e) => resolve({ error: e.code || e.message }));
    req.end();
  });
}

/**
 * Can this machine use the shared server, and with which address? Tries what is configured (MOCKUP_REMOTE_IP, else the domain itself); when nothing is
 * configured and the domain does not lead to the server it tries the LAN address of the acedemo machine (so a colleague in the office needs no setting
 * for it). Also checks the token. Never throws: `{ ok, ip, token, problem }` — `ip` is the address that worked ('' = the domain itself).
 */
async function checkRemote(remote, { lan = LAN_FALLBACK_IP, timeoutMs = 4000 } = {}) {
  const candidates = remote.ip ? [remote.ip] : remote.origin.startsWith('https:') ? ['', lan] : [''];
  let problem = 'not tried';
  for (const ip of candidates) {
    const health = await probe({ ...remote, ip }, '/mockup-api/health', timeoutMs);
    if (health.error || health.status !== 200) {
      problem = health.error ?? `HTTP ${health.status}`;
      continue;
    }
    const auth = await probe({ ...remote, ip }, '/mockup-api/ds/users', timeoutMs);
    return { ok: true, ip, token: auth.status !== 401 && auth.status !== 403, problem: '' };
  }
  return { ok: false, ip: remote.ip ?? '', token: false, problem };
}

module.exports = { MOCKUP_PATHS, LAN_FALLBACK_IP, applyMockupRemote, checkRemote, mockupRemote, remoteEntries };
