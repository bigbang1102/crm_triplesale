/**
 * Dev-only stand-in for `AiHubProxyServlet` (the Java servlet that sat between the AI HUB page and the ai-hub service).
 *
 *   browser  GET/POST /triplesale/aihub/<path>   →   {AIHUB_SERVICE_BASE}/aihub-api/<path>?…&actor=…
 *
 * What the servlet did and this keeps: only the paths of the ai-hub API pass; every query parameter the servlet injects is
 * dropped from the caller and set here; the `X-Api-Key` is added on the way out, so the browser never sees it.
 * What it cannot do: it does not know who is signed in (the SPA keeps the session in sessionStorage, not on a server), so the
 * identity and the admin flags come from environment variables. This is for a developer machine only — production needs the
 * gateway to hold the key and decide the roles (manual ADR-001).
 *
 * Environment (nothing is read from the Java project; the key is never written to a file of this repo):
 *   AIHUB_SERVICE_BASE   base URL of the ai-hub service, e.g. https://host:port   (required)
 *   AIHUB_API_KEY        the service's X-Api-Key                                   (required)
 *   AIHUB_ACTOR          who is shown in the service log        (default "dev-proxy")
 *   AIHUB_ACTOR_ID · AIHUB_ACTOR_USER · AIHUB_BRANCH_ID · AIHUB_BRANCH_CODE · AIHUB_BRANCH_NAME   (default "")
 *   AIHUB_LIBRARY_ADMIN · AIHUB_CLAUDE_CODE_ADMIN · AIHUB_SUPER_ADMIN   "1" = yes   (default "0")
 *   AIHUB_TOKEN_ADMIN · AIHUB_QUOTA_ADMIN · AIHUB_ALL_BRANCH             "1" = yes   (token admin menu / set quotas / see every company; default "0")
 *   AIHUB_DEPT_CODE · AIHUB_DEPT_NAME                                    department of the user (default "" — the service finds it in its org directory)
 *   AIHUB_CLIENT_IDENTITY  "1" = take who is signed in and the admin flags from the `X-Ts-*` headers the page sends (mockup: the SPA knows
 *                          the session and its roles); a header that is absent falls back to the variables above. Never on a shared host.
 */
// FAST-DEBT(SEC): proxy เฉพาะเครื่อง dev · ถือ AIHUB_API_KEY และตัวตน/สิทธิ์ admin จาก environment variable (SPA ไม่มี server session) · production ต้องให้ gateway ถือกุญแจและตัดสินสิทธิ์ (ADR-001) ยังไม่ได้ทำ · somyot · 2026-11-19
'use strict';

/** the paths AiHubProxyServlet.ALLOWED lets through (after the /aihub prefix) */
const ALLOWED = /^\/(tools|tools\/[a-z0-9-]{1,40}|files\/[a-f0-9]{32}|library\/[a-f0-9]{32}|history\/[a-f0-9]{32}|usage)$/;

/** AiHubProxyServlet.INJECTED: set by the proxy, never taken from the caller */
const INJECTED = ['actor', 'sessionKey', 'actorId', 'actorUser', 'branchId', 'branchCode', 'branchName', 'deptCode', 'deptName', 'libraryAdmin', 'claudeCodeAdmin', 'superAdmin', 'tokenAdmin', 'quotaAdmin', 'allBranch'];

const PREFIX = '/triplesale/aihub';

const flag = (value) => (value === '1' ? '1' : '0');

/** the problem that stops the proxy from working, or '' when it can forward */
function configProblem(env) {
  if (!env.AIHUB_SERVICE_BASE) return 'AIHUB_SERVICE_BASE is not set';
  if (!env.AIHUB_API_KEY) return 'AIHUB_API_KEY is not set';
  return '';
}

/** the page's `X-Ts-*` headers → the injected parameters (values are URI-encoded: names are Thai); only when AIHUB_CLIENT_IDENTITY=1 */
const CLIENT_HEADERS = {
  actor: 'x-ts-actor', actorId: 'x-ts-actor-id', actorUser: 'x-ts-actor-user', branchId: 'x-ts-branch-id', branchCode: 'x-ts-branch-code',
  branchName: 'x-ts-branch-name', libraryAdmin: 'x-ts-library-admin', claudeCodeAdmin: 'x-ts-claude-code-admin', superAdmin: 'x-ts-super-admin',
  deptCode: 'x-ts-dept-code', deptName: 'x-ts-dept-name', tokenAdmin: 'x-ts-token-admin', quotaAdmin: 'x-ts-quota-admin', allBranch: 'x-ts-all-branch',
};

function fromClient(env, headers, key) {
  if (env.AIHUB_CLIENT_IDENTITY !== '1') return undefined;
  const raw = headers[CLIENT_HEADERS[key]];
  if (typeof raw !== 'string') return undefined;
  try {
    return decodeURIComponent(raw);
  } catch {
    return undefined;
  }
}

/** `/triplesale/aihub/tools/x?a=1` → `/aihub-api/tools/x?a=1&actor=…`; `undefined` when the path is not one the servlet allowed */
function rewrite(url, env, headers = {}) {
  const pick = (key, fallback) => fromClient(env, headers, key) ?? fallback;
  if (!url.startsWith(PREFIX)) return undefined;
  const parsed = new URL(url.slice(PREFIX.length) || '/', 'http://x');
  if (!ALLOWED.test(parsed.pathname)) return undefined;
  const query = new URLSearchParams();
  for (const [key, value] of parsed.searchParams) if (!INJECTED.includes(key)) query.append(key, value);
  query.set('actor', pick('actor', env.AIHUB_ACTOR || 'dev-proxy'));
  query.set('actorId', pick('actorId', env.AIHUB_ACTOR_ID || ''));
  query.set('actorUser', pick('actorUser', env.AIHUB_ACTOR_USER || ''));
  query.set('branchId', pick('branchId', env.AIHUB_BRANCH_ID || ''));
  query.set('branchCode', pick('branchCode', env.AIHUB_BRANCH_CODE || ''));
  query.set('branchName', pick('branchName', env.AIHUB_BRANCH_NAME || ''));
  query.set('libraryAdmin', flag(pick('libraryAdmin', env.AIHUB_LIBRARY_ADMIN)));
  query.set('claudeCodeAdmin', flag(pick('claudeCodeAdmin', env.AIHUB_CLAUDE_CODE_ADMIN)));
  query.set('superAdmin', flag(pick('superAdmin', env.AIHUB_SUPER_ADMIN)));
  query.set('deptCode', pick('deptCode', env.AIHUB_DEPT_CODE || ''));
  query.set('deptName', pick('deptName', env.AIHUB_DEPT_NAME || ''));
  query.set('tokenAdmin', flag(pick('tokenAdmin', env.AIHUB_TOKEN_ADMIN)));
  query.set('quotaAdmin', flag(pick('quotaAdmin', env.AIHUB_QUOTA_ADMIN)));
  query.set('allBranch', flag(pick('allBranch', env.AIHUB_ALL_BRANCH)));
  return `/aihub-api${parsed.pathname}?${query.toString()}`;
}

/** the dev-server `bypass`: answer here (and do not forward) when the request must not or cannot go to the service */
function bypass(req, res, env) {
  const send = (status, error) => {
    res.statusCode = status;
    res.setHeader('content-type', 'application/json');
    res.end(JSON.stringify({ ok: false, error }));
    return true;
  };
  if (rewrite(req.url, env) === undefined) return send(403, 'path not allowed');
  const problem = configProblem(env);
  if (problem) return send(503, `AI HUB dev proxy: ${problem} (see tools/aihub-dev-proxy.cjs)`);
  return undefined;
}

/** the entry of the dev-server proxy table */
function aihubProxy(env = process.env) {
  return {
    target: env.AIHUB_SERVICE_BASE || 'http://localhost:0',
    secure: true,
    changeOrigin: true,
    logLevel: 'warn',
    headers: { 'X-Api-Key': env.AIHUB_API_KEY || '' },
    // the dev server's own `pathRewrite` only takes a prefix map; the query has to be rebuilt too, so set the outgoing path here
    configure: (proxy) => {
      proxy.on('proxyReq', (proxyReq, req) => {
        const path = rewrite(req.url, env, req.headers);
        if (path !== undefined) proxyReq.path = path;
      });
    },
    bypass: (req, res) => (bypass(req, res, env) ? false : undefined),
  };
}

/**
 * `KEY=VALUE` lines of a local, git-ignored file (`.env.aihub.local`) into `env`; a variable that is already set wins, so a
 * real environment variable still overrides the file. A missing file is fine (the variables then come from the shell).
 */
function loadLocalEnv(file, env = process.env) {
  let text;
  try {
    text = require('node:fs').readFileSync(file, 'utf8');
  } catch {
    return;
  }
  for (const line of text.split(/\r?\n/)) {
    const m = /^\s*([A-Z][A-Z0-9_]*)\s*=(.*)$/.exec(line);
    if (m && env[m[1]] === undefined) env[m[1]] = m[2].trim();
  }
}

module.exports = { ALLOWED, INJECTED, PREFIX, aihubProxy, bypass, configProblem, loadLocalEnv, rewrite };
