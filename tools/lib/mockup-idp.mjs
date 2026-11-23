/**
 * A pretend identity provider + the session part of triplesales-api for the mockup (no dependency, in memory) — the same flow the real
 * system has (multi-tenant-access-design.md §4–§5), so the sign-in of the app can be run and tested offline:
 *
 *   GET  /mockup-tps/api/v1/auth/groups/{code}          group code → { usernamePrefix, issuer }  (unknown code = 404 with no company name)
 *   GET  /mockup-idp/realms/mockup/protocol/openid-connect/auth      the Keycloak login page (authorization code + PKCE S256)
 *   POST …/auth                                          checks the user, redirects to redirect_uri?code&state
 *   POST …/token                                         authorization_code (PKCE checked) | refresh_token (rotates)
 *   GET  …/logout                                        ends the session, redirects to post_logout_redirect_uri
 *   POST /mockup-tps/api/v1/me/session                   who the user is + the usable companies (+ the one the server picked)
 *   PUT  /mockup-tps/api/v1/me/session/company/{id}      the user's choice of company for this session
 *   POST /mockup-tps/api/v1/me/ping                      the gate of every write: company chosen · X-Expected-Company · session · employee
 *
 * Accounts come from Datasource/users.json (+ optional `memberships` per company and `systemAccess`), groups from groups.json,
 * companies from branches.json — read on every request, so editing a file (e.g. closing an employee) shows at once.
 * FAST-DEBT(SEC): tokens are unsigned and held in memory, the login page has no delay/IP limit — a developer tool on 127.0.0.1 only · somyot · 2026-11-20
 */
import { createHash, randomBytes } from 'node:crypto';

export const TPS_PREFIX = '/mockup-tps/api/v1';
export const IDP_BASE = '/mockup-idp/realms/mockup';
const CONNECT = `${IDP_BASE}/protocol/openid-connect`;
const ACCESS_SECONDS = 300;
const CODE_SECONDS = 60;
const CLIENT_ID = 'triplesales-web';
const AUDIENCE = 'triplesales-api';
const EXPECTED_COMPANY = 'x-expected-company';

const rand = (bytes = 24) => randomBytes(bytes).toString('base64url');
const b64 = (obj) => Buffer.from(JSON.stringify(obj)).toString('base64url');
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);

/**
 * Origins besides this machine that may receive the callback / post-logout redirect: MOCKUP_IDP_REDIRECT_ORIGINS (comma-separated, exact origins such as
 * https://acedemo.acecloud.co.th:7331) — the public address of the deployed web app. Empty = this machine only.
 */
const EXTRA_ORIGINS = (process.env.MOCKUP_IDP_REDIRECT_ORIGINS ?? '').split(',').map((o) => o.trim()).filter((o) => /^https?:\/\/[^/]+$/.test(o));

/** the callback / post-logout address must be this machine (or one of the origins above; the mock never redirects anywhere else) */
function isLocalRedirect(uri, mustEndWith) {
  try {
    const u = new URL(uri);
    return (u.protocol === 'http:' || u.protocol === 'https:') && (['localhost', '127.0.0.1', '[::1]'].includes(u.hostname) || EXTRA_ORIGINS.includes(u.origin)) && (!mustEndWith || u.pathname.endsWith(mustEndWith));
  } catch {
    return false;
  }
}

function json(res, status, body, headers = {}) {
  const text = JSON.stringify(body);
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', ...headers });
  res.end(text);
}

function readText(req, limit = 64 * 1024) {
  return new Promise((resolve, reject) => {
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
    req.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
    req.on('error', reject);
  });
}

/** `{ readDoc(name) → Promise<unknown|undefined>, now() → ms }` */
export function createIdp({ readDoc, now = () => Date.now() }) {
  /** access token → { username, sid, exp } */
  const accessTokens = new Map();
  /** refresh token → { username, sid, authTime } (one use: it rotates) */
  const refreshTokens = new Map();
  /** authorization code → { username, challenge, redirectUri, sid, authTime, exp } (one use) */
  const codes = new Map();
  /** username → { sid, company } : one live session per user (R9) */
  const sessions = new Map();
  /** sids a newer sign-in has replaced */
  const replaced = new Set();

  /* ---------------------------------------------------------------------------------------------- data */

  async function world() {
    const [users, groups, branches] = await Promise.all([readDoc('users'), readDoc('groups'), readDoc('branches')]);
    return { users: Array.isArray(users) ? users : [], groups: Array.isArray(groups) ? groups : [], branches: Array.isArray(branches) ? branches : [] };
  }

  const memberships = (user) =>
    Array.isArray(user.memberships)
      ? user.memberships
      : (user.branches ?? []).map((company) => ({ company, employeeId: user.employeeId, employeeCode: user.employeeCode, roleGroups: user.roleGroups, extraRoles: user.extraRoles, status: 'release' }));

  /** the companies the user may use now: an employee in `release` status in a company of the catalogue */
  function activeCompanies(user, branches) {
    return memberships(user).flatMap((m) => {
      const b = branches.find((x) => x.code === m.company);
      return b && (m.status ?? 'release') === 'release' ? [{ id: String(b.id), code: b.code, name: b.name }] : [];
    });
  }

  const findUser = (users, username) => users.find((u) => String(u.username).toLowerCase() === String(username).toLowerCase());

  /* ---------------------------------------------------------------------------------------------- tokens */

  function mint(user, sid, authTime, systemAccess) {
    const t = now();
    const exp = Math.floor(t / 1000) + ACCESS_SECONDS;
    const claims = {
      iss: IDP_BASE,
      sub: `u-${user.username}`,
      aud: AUDIENCE,
      azp: CLIENT_ID,
      typ: 'Bearer',
      exp,
      iat: Math.floor(t / 1000),
      sid,
      auth_time: authTime,
      preferred_username: user.username,
      name: user.profileName ?? user.username,
      realm_access: { roles: systemAccess ? ['triplesales-access'] : [] },
      jti: rand(8),
    };
    const jwt = (c) => `${b64({ alg: 'none', typ: 'JWT' })}.${b64(c)}.mock`;
    const access = jwt(claims);
    const refresh = rand(32);
    accessTokens.set(access, { username: user.username, sid, exp: exp * 1000 });
    refreshTokens.set(refresh, { username: user.username, sid, authTime });
    return { access_token: access, refresh_token: refresh, id_token: jwt({ ...claims, typ: 'ID' }), expires_in: ACCESS_SECONDS, token_type: 'Bearer' };
  }

  /* ---------------------------------------------------------------------------------------------- login page */

  function loginPage(params, message = '', hint = '') {
    const hidden = ['client_id', 'redirect_uri', 'response_type', 'scope', 'state', 'code_challenge', 'code_challenge_method']
      .map((k) => `<input type="hidden" name="${k}" value="${esc(params.get(k))}">`)
      .join('')
      // the group's prefix (`g1042.`) is kept out of sight: the field stays empty and the prefix is put in front of what is typed when it is sent
      .concat(`<input type="hidden" name="login_hint" value="${esc(params.get('login_hint') ?? '')}">`);
    return `<!doctype html><html lang="th"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>TripleSales — ลงชื่อเข้าใช้</title>
<style>
*{box-sizing:border-box}html,body{height:100%}
body{margin:0;font-family:'Noto Sans Thai','Inter',system-ui,sans-serif;color:#1a1230;background:#fff;-webkit-font-smoothing:antialiased;display:grid;grid-template-columns:1fr 1fr;min-height:100vh}
.left{position:relative;display:flex;align-items:center;justify-content:center;padding:32px}
form{width:min(420px,100%)}
h1{font-size:28px;line-height:1.3;font-weight:700;margin:0 0 32px;color:#1a1230}
label{display:block;font-size:14px;font-weight:500;margin:0 0 8px;color:#1a1230}
.field{margin-bottom:24px;position:relative}
input[type=text],input[type=password]{width:100%;height:46px;padding:0 44px 0 14px;border:1px solid transparent;border-radius:4px;background:#e8f0fe;font:inherit;font-size:15px;color:#1a1230;outline:none}
input[type=text]:focus,input[type=password]:focus{border-color:#4a1e9e;background:#eef3ff}
.eye{position:absolute;right:6px;bottom:3px;width:40px;height:40px;border:0;background:transparent;color:#5b5570;cursor:pointer;display:grid;place-items:center;padding:0}
.eye svg{width:20px;height:20px}
.submit{display:block;width:100%;height:48px;margin-top:28px;border:0;border-radius:4px;background:#4a1e9e;color:#fff;font:inherit;font-size:15px;font-weight:700;cursor:pointer}
.submit:hover{background:#5a2bb0}
.forgot,.regroup{display:block;text-align:center;margin-top:20px;font-size:14px;color:#4a1e9e;text-decoration:none}
.err{background:#fde7e7;color:#a11;padding:10px 14px;border-radius:4px;margin:-12px 0 20px;font-size:14px}
.regroup{margin-top:8px}
.ver{position:absolute;right:24px;bottom:18px;font-size:12px;color:#9a93a8}
.right{background:#4a1e9e url(/assets/images/login-bg.jpg) center/cover no-repeat;display:flex;align-items:center;justify-content:center}
.right img{width:min(520px,70%);height:auto}
@media (max-width:800px){body{grid-template-columns:1fr}.right{display:none}}
</style></head>
<body><div class="left"><form method="post" action="${CONNECT}/auth" autocomplete="off"><h1>ลงชื่อเข้าใช้ TrippleSales</h1>
${message ? `<div class="err" role="alert">${esc(message)}</div>` : ''}${hidden}
<div class="field"><label for="u">Username</label><input id="u" name="username" type="text" value="${esc(hint)}" autofocus autocomplete="off"></div>
<div class="field"><label for="p">Password</label><input id="p" name="password" type="password" autocomplete="off"><button class="eye" type="button" aria-label="แสดง/ซ่อนรหัสผ่าน" onclick="var i=document.getElementById('p');i.type=i.type==='password'?'text':'password'"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M1 12s4-7 11-7 11 7 11 7-4 7-11 7S1 12 1 12z"/><circle cx="12" cy="12" r="3"/></svg></button></div>
<button class="submit" type="submit">ลงชื่อเข้าใช้</button><a class="forgot" href="#" onclick="return false">ลืมรหัสผ่าน?</a><a class="forgot regroup" href="/login?changeGroup=1">← เปลี่ยนรหัสกลุ่ม</a></form><div class="ver">Version mockup</div></div>
<div class="right"><img src="/assets/images/triplesales-logo.png" alt="TripleSales"></div></body></html>`;
  }

  const authParamsOk = (p) =>
    p.get('client_id') === CLIENT_ID && p.get('response_type') === 'code' && p.get('code_challenge_method') === 'S256' && !!p.get('code_challenge') && isLocalRedirect(p.get('redirect_uri') ?? '', '/auth/callback');

  async function handleAuth(req, res, url) {
    const isPost = req.method === 'POST';
    const params = isPost ? new URLSearchParams(await readText(req)) : url.searchParams;
    if (!authParamsOk(params)) return json(res, 400, { error: 'invalid_request' });
    if (!isPost) {
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' });
      return res.end(loginPage(params, ''));
    }
    const { users, groups } = await world();
    const hint = String(params.get('login_hint') ?? '').trim().toLowerCase();
    const said = String(params.get('username') ?? '').trim().toLowerCase();
    // typed with the prefix (`g1042.somchai`) or without it (`somchai`, the prefix of the group asked for goes in front)
    const typed = hint && said && !said.startsWith(hint) ? `${hint}${said}` : said;
    const [prefix, ...rest] = typed.split('.');
    const group = groups.find((g) => String(g.internalCode).toLowerCase() === prefix);
    const found = group && rest.length ? findUser(users, rest.join('.')) : undefined;
    // an account with a `group` (the Seed Workbook ones) signs in under that group only; the hand-made accounts have none and sign in under any
    const user = found && (!found.group || String(found.group).toLowerCase() === String(group.code).toLowerCase()) ? found : undefined;
    // one message for every refusal (unknown group / user / password / closed account) so nothing can be guessed from it
    if (!user || user.disabled || user.password !== params.get('password')) {
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' });
      return res.end(loginPage(params, 'ชื่อผู้ใช้หรือรหัสผ่านไม่ถูกต้อง', params.get('username') ?? ''));
    }
    const code = rand(24);
    codes.set(code, { username: user.username, challenge: params.get('code_challenge'), redirectUri: params.get('redirect_uri'), sid: rand(12), authTime: Math.floor(now() / 1000), exp: now() + CODE_SECONDS * 1000 });
    const back = new URL(params.get('redirect_uri'));
    back.searchParams.set('code', code);
    if (params.get('state')) back.searchParams.set('state', params.get('state'));
    res.writeHead(302, { Location: back.href, 'Cache-Control': 'no-store' });
    return res.end();
  }

  /* ---------------------------------------------------------------------------------------------- token / logout */

  async function handleToken(req, res) {
    const p = new URLSearchParams(await readText(req));
    const grant = p.get('grant_type');
    const { users } = await world();
    const fail = (description) => json(res, 400, { error: 'invalid_grant', error_description: description });
    if (p.get('client_id') !== CLIENT_ID) return json(res, 401, { error: 'invalid_client' });

    if (grant === 'authorization_code') {
      const entry = codes.get(p.get('code') ?? '');
      codes.delete(p.get('code') ?? ''); // one use, even when the rest fails
      if (!entry || entry.exp < now()) return fail('Code not valid');
      if (entry.redirectUri !== p.get('redirect_uri')) return fail('Incorrect redirect_uri');
      const challenge = createHash('sha256').update(String(p.get('code_verifier') ?? '')).digest('base64url');
      if (challenge !== entry.challenge) return fail('PKCE verification failed');
      const user = findUser(users, entry.username);
      if (!user || user.disabled) return fail('Account disabled');
      return json(res, 200, mint(user, entry.sid, entry.authTime, user.systemAccess !== false));
    }
    if (grant === 'refresh_token') {
      const entry = refreshTokens.get(p.get('refresh_token') ?? '');
      refreshTokens.delete(p.get('refresh_token') ?? ''); // rotation: the old one is dead
      if (!entry) return fail('Token is not active');
      const user = findUser(users, entry.username);
      if (!user || user.disabled) return fail('Account disabled');
      return json(res, 200, mint(user, entry.sid, entry.authTime, user.systemAccess !== false));
    }
    return json(res, 400, { error: 'unsupported_grant_type' });
  }

  function handleLogout(res, url) {
    const hint = url.searchParams.get('id_token_hint') ?? '';
    try {
      const claims = JSON.parse(Buffer.from(hint.split('.')[1] ?? '', 'base64url').toString('utf8'));
      for (const [t, v] of accessTokens) if (v.sid === claims.sid) accessTokens.delete(t);
      for (const [t, v] of refreshTokens) if (v.sid === claims.sid) refreshTokens.delete(t);
      if (sessions.get(claims.preferred_username)?.sid === claims.sid) sessions.delete(claims.preferred_username);
    } catch {
      /* no usable hint: nothing to end */
    }
    const back = url.searchParams.get('post_logout_redirect_uri') ?? '';
    if (isLocalRedirect(back)) {
      res.writeHead(302, { Location: back });
      return res.end();
    }
    res.writeHead(200, { 'Content-Type': 'text/plain; charset=utf-8' });
    return res.end('ออกจากระบบแล้ว');
  }

  /* ---------------------------------------------------------------------------------------------- triplesales-api gates */

  const refuse = (res, status, code, message) => json(res, status, { code, message });

  /**
   * The gates of A §5 in order, as far as the mock has them: token → system role → user/session → (company chosen) → (X-Expected-Company on a
   * write) → employee still `release`. Returns { user, tok, session, companies, w } or null after answering.
   */
  async function gate(req, res, { needCompany = false, write = false } = {}) {
    const bearer = /^Bearer (.+)$/.exec(req.headers.authorization ?? '')?.[1];
    const tok = bearer ? accessTokens.get(bearer) : undefined;
    if (!tok || tok.exp < now()) return void refuse(res, 401, 'UNAUTHORIZED', 'โทเคนไม่ถูกต้องหรือหมดอายุ');
    const w = await world();
    const user = findUser(w.users, tok.username);
    if (!user || user.disabled) return void refuse(res, 401, 'UNAUTHORIZED', 'บัญชีไม่พร้อมใช้งาน');
    if (user.systemAccess === false) return void refuse(res, 403, 'NO_SYSTEM_ACCESS', 'ไม่มีสิทธิ์ใช้ Triple Sales');
    if (replaced.has(tok.sid)) return void refuse(res, 401, 'SESSION_REPLACED', 'มีการเข้าระบบจากที่อื่น');
    const companies = activeCompanies(user, w.branches);
    const session = sessions.get(user.username);
    const base = { user, tok, session, companies, w };
    if (!needCompany) return base;
    if (!session || session.sid !== tok.sid) return void refuse(res, 401, 'UNAUTHORIZED', 'ยังไม่ได้เริ่มเซสชัน');
    if (!session.company) return void refuse(res, 409, 'COMPANY_NOT_SELECTED', 'ยังไม่ได้เลือกบริษัท');
    if (write && req.headers[EXPECTED_COMPANY] !== session.company) return void refuse(res, 409, 'COMPANY_CHANGED', 'บริษัทที่ใช้งานเปลี่ยนแล้ว');
    if (!companies.some((c) => c.id === session.company)) {
      session.company = null; // the employee of the chosen company was closed (D-166): the user chooses again
      return void refuse(res, 401, 'EMPLOYEE_INACTIVE', 'บัญชีพนักงานในบริษัทที่เลือกถูกปิดใช้งาน');
    }
    return base;
  }

  async function handleTps(req, res, url) {
    const path = url.pathname.slice(TPS_PREFIX.length);
    const group = /^\/auth\/groups\/([^/]+)$/.exec(path);
    if (group && req.method === 'GET') {
      const code = decodeURIComponent(group[1]).trim().toLowerCase();
      const { groups } = await world();
      const g = groups.find((x) => String(x.code).toLowerCase() === code);
      // every miss looks the same and names no company
      return g ? json(res, 200, { result: { usernamePrefix: g.internalCode, issuer: IDP_BASE } }) : refuse(res, 404, 'NOT_FOUND', 'ไม่พบกลุ่ม');
    }
    if (path === '/me/session' && req.method === 'POST') {
      const g = await gate(req, res);
      if (!g) return undefined;
      if (g.companies.length === 0) return refuse(res, 403, 'NO_ACTIVE_COMPANY', 'ไม่มีบริษัทที่ใช้งานได้');
      let session = sessions.get(g.user.username);
      if (!session || session.sid !== g.tok.sid) {
        if (session) replaced.add(session.sid); // a new sign-in ends the old one (R9)
        session = { sid: g.tok.sid, company: null };
        sessions.set(g.user.username, session);
      }
      if (session.company && !g.companies.some((c) => c.id === session.company)) session.company = null;
      if (g.companies.length === 1) session.company = g.companies[0].id; // one usable company: the server picks it
      return json(res, 200, { result: { user: { id: `u-${g.user.username}`, username: g.user.username }, companies: g.companies, selectedCompanyId: session.company } });
    }
    const pick = /^\/me\/session\/company\/([^/]+)$/.exec(path);
    if (pick && req.method === 'PUT') {
      const g = await gate(req, res);
      if (!g) return undefined;
      if (!g.session || g.session.sid !== g.tok.sid) return refuse(res, 401, 'UNAUTHORIZED', 'ยังไม่ได้เริ่มเซสชัน');
      const id = decodeURIComponent(pick[1]);
      if (!g.companies.some((c) => c.id === id)) return refuse(res, 403, 'NO_ACTIVE_COMPANY', 'บริษัทนี้ใช้งานไม่ได้');
      g.session.company = id;
      return json(res, 200, { result: { selectedCompanyId: id } });
    }
    if (path === '/me/ping' && (req.method === 'POST' || req.method === 'GET')) {
      const g = await gate(req, res, { needCompany: true, write: req.method === 'POST' });
      return g ? json(res, 200, { result: { company: g.session.company } }) : undefined;
    }
    return refuse(res, 404, 'NOT_FOUND', 'ไม่พบเส้นทาง');
  }

  return {
    owns: (pathname) => pathname.startsWith(`${TPS_PREFIX}/`) || pathname.startsWith(`${IDP_BASE}/`),
    async handle(req, res, url) {
      try {
        if (url.pathname.startsWith(`${TPS_PREFIX}/`)) return await handleTps(req, res, url);
        const op = url.pathname.slice(CONNECT.length);
        if (op === '/auth' && (req.method === 'GET' || req.method === 'POST')) return await handleAuth(req, res, url);
        if (op === '/token' && req.method === 'POST') return await handleToken(req, res);
        if (op === '/logout') return handleLogout(res, url);
        return json(res, 404, { error: 'not found' });
      } catch (e) {
        return json(res, e?.status ?? 500, { error: e?.message ?? 'error' });
      }
    },
    /** forget every session and token (tests) */
    reset() {
      for (const m of [accessTokens, refreshTokens, codes, sessions]) m.clear();
      replaced.clear();
    },
  };
}
