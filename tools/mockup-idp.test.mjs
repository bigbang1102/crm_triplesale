import assert from 'node:assert/strict';
import { createHash, randomBytes } from 'node:crypto';
import { createServer } from 'node:http';
import { after, before, beforeEach, describe, it } from 'node:test';
import { IDP_BASE, TPS_PREFIX, createIdp } from './lib/mockup-idp.mjs';

const BRANCHES = [
  { id: 1004400123, code: 'SUN', name: 'SUN GATEWAY' },
  { id: 1004400456, code: 'ACE', name: 'ACE CLOUD' },
];
const GROUPS = [
  { code: 'sun', internalCode: 'g1042' },
  { code: 'EG-A', internalCode: 'g2001' },
];
const user = (username, extra = {}) => ({ username, password: username, profileName: username, employeeId: 1, employeeCode: 'E1', roleGroups: ['sales'], branches: ['SUN'], ...extra });
let USERS;
const resetUsers = () => {
  USERS = [
    user('one'),
    user('two', { branches: ['SUN', 'ACE'] }),
    user('half', { memberships: [{ company: 'SUN', status: 'release' }, { company: 'ACE', status: 'block' }] }),
    user('none', { memberships: [{ company: 'SUN', status: 'block' }] }),
    user('nosys', { systemAccess: false }),
    user('off', { disabled: true }),
    user('bound', { group: 'EG-A' }),
  ];
};

describe('mockup identity provider + session API', () => {
  let server;
  let origin;
  let idp;
  const clock = { t: 1_800_000_000_000 };

  before(async () => {
    resetUsers();
    idp = createIdp({ readDoc: async (n) => ({ users: USERS, groups: GROUPS, branches: BRANCHES })[n], now: () => clock.t });
    server = createServer((req, res) => {
      const url = new URL(req.url, 'http://localhost');
      return idp.owns(url.pathname) ? idp.handle(req, res, url) : (res.writeHead(404), res.end());
    });
    await new Promise((r) => server.listen(0, '127.0.0.1', r));
    origin = `http://127.0.0.1:${server.address().port}`;
  });
  after(() => new Promise((r) => server.close(r)));
  beforeEach(() => {
    idp.reset();
    resetUsers();
    clock.t = 1_800_000_000_000;
  });

  const REDIRECT = 'http://localhost:4300/auth/callback';
  const pkce = () => {
    const verifier = randomBytes(32).toString('base64url');
    return { verifier, challenge: createHash('sha256').update(verifier).digest('base64url') };
  };
  const authForm = (challenge, username, password) =>
    new URLSearchParams({ client_id: 'triplesales-web', redirect_uri: REDIRECT, response_type: 'code', scope: 'openid', state: 'st1', code_challenge: challenge, code_challenge_method: 'S256', username, password });
  const post = (path, body, headers = {}) => fetch(`${origin}${path}`, { method: 'POST', redirect: 'manual', headers: { 'Content-Type': 'application/x-www-form-urlencoded', ...headers }, body });

  /** sign in as `g1042.<name>` and return the token answer */
  async function signIn(name, password = name) {
    const { verifier, challenge } = pkce();
    const r = await post(`${IDP_BASE}/protocol/openid-connect/auth`, authForm(challenge, `g1042.${name}`, password));
    assert.equal(r.status, 302, `sign-in of ${name}`);
    const code = new URL(r.headers.get('location')).searchParams.get('code');
    const t = await post(`${IDP_BASE}/protocol/openid-connect/token`, new URLSearchParams({ grant_type: 'authorization_code', client_id: 'triplesales-web', redirect_uri: REDIRECT, code, code_verifier: verifier }));
    assert.equal(t.status, 200);
    return t.json();
  }
  const api = (path, tokens, init = {}) => fetch(`${origin}${TPS_PREFIX}${path}`, { ...init, headers: { Authorization: `Bearer ${tokens.access_token}`, ...(init.headers ?? {}) } });
  const session = async (tokens) => (await api('/me/session', tokens, { method: 'POST' })).json();

  it('should answer a group code with the internal code and issuer, and every miss the same way', async () => {
    const ok = await (await fetch(`${origin}${TPS_PREFIX}/auth/groups/SUN`)).json();
    assert.deepEqual(ok.result, { usernamePrefix: 'g1042', issuer: IDP_BASE });
    const miss = await fetch(`${origin}${TPS_PREFIX}/auth/groups/nope`);
    assert.equal(miss.status, 404);
    assert.ok(!JSON.stringify(await miss.json()).includes('SUN'));
  });

  it('should show the login page only for a valid PKCE request to a local callback', async () => {
    const { challenge } = pkce();
    const q = authForm(challenge, '', '');
    q.delete('username');
    q.delete('password');
    assert.equal((await fetch(`${origin}${IDP_BASE}/protocol/openid-connect/auth?${q}`)).status, 200);
    q.set('redirect_uri', 'https://evil.example/auth/callback');
    assert.equal((await fetch(`${origin}${IDP_BASE}/protocol/openid-connect/auth?${q}`)).status, 400);
  });

  it('should refuse with one message a wrong password, a user of another group, a closed account and an unknown user', async () => {
    const { challenge } = pkce();
    const bodies = [];
    for (const [name, pw] of [['g1042.one', 'bad'], ['g9999.one', 'one'], ['g1042.off', 'off'], ['g1042.ghost', 'x']]) {
      const r = await post(`${IDP_BASE}/protocol/openid-connect/auth`, authForm(challenge, name, pw));
      assert.equal(r.status, 200);
      bodies.push((await r.text()).match(/class="err"[^>]*>([^<]*)</)?.[1]);
    }
    assert.ok(bodies[0]);
    assert.equal(new Set(bodies).size, 1);
  });

  it('should let an account that belongs to a group sign in under that group only, and a hand-made one under any', async () => {
    const { challenge } = pkce();
    const text = async (name, pw) => (await (await post(`${IDP_BASE}/protocol/openid-connect/auth`, authForm(challenge, name, pw))).text()).match(/class="err"[^>]*>([^<]*)</)?.[1];
    assert.ok(await text('g1042.bound', 'bound'), 'the group of the account is EG-A, not sun');
    assert.equal(await text('g2001.one', 'one'), undefined, 'an account without a group signs in under any group');
    const ok = await post(`${IDP_BASE}/protocol/openid-connect/auth`, authForm(challenge, 'g2001.bound', 'bound'));
    assert.equal(ok.status, 302);
  });

  it('should show the login page with an EMPTY username field (the group prefix stays hidden) and accept the name typed with or without the prefix', async () => {
    const { challenge } = pkce();
    const q = new URLSearchParams({ client_id: 'triplesales-web', redirect_uri: REDIRECT, response_type: 'code', scope: 'openid', state: 'st1', code_challenge: challenge, code_challenge_method: 'S256', login_hint: 'g1042.' });
    const page = await (await fetch(`${origin}${IDP_BASE}/protocol/openid-connect/auth?${q}`)).text();
    assert.match(page, /name="username" type="text" value=""/, 'the field is empty');
    assert.match(page, /name="login_hint" value="g1042\."/, 'the prefix is sent back as a hidden value');
    const signIn = async (username, hint) => {
      const form = authForm(challenge, username, 'one');
      if (hint) form.set('login_hint', hint);
      return post(`${IDP_BASE}/protocol/openid-connect/auth`, form);
    };
    assert.equal((await signIn('one', 'g1042.')).status, 302, 'the bare name, the prefix put in front');
    assert.equal((await signIn('g1042.one', 'g1042.')).status, 302, 'the full name still works');
    assert.equal((await signIn('One', 'g1042.')).status, 302, 'in any case');
    assert.equal((await signIn('one', 'g9999.')).status, 200, 'the prefix of another group is refused like any wrong name');
    assert.equal((await signIn('one', '')).status, 200, 'a bare name with no group asked for cannot be placed');
  });

  it('should check PKCE and use a code once', async () => {
    const { challenge } = pkce();
    const r = await post(`${IDP_BASE}/protocol/openid-connect/auth`, authForm(challenge, 'g1042.one', 'one'));
    const code = new URL(r.headers.get('location')).searchParams.get('code');
    const token = (verifier) => post(`${IDP_BASE}/protocol/openid-connect/token`, new URLSearchParams({ grant_type: 'authorization_code', client_id: 'triplesales-web', redirect_uri: REDIRECT, code, code_verifier: verifier }));
    assert.equal((await token('wrong-verifier')).status, 400);
    assert.equal((await token('wrong-verifier')).status, 400); // the code is spent even by a failed try
  });

  it('should rotate the refresh token: the old one stops working', async () => {
    const t1 = await signIn('one');
    const refresh = (rt) => post(`${IDP_BASE}/protocol/openid-connect/token`, new URLSearchParams({ grant_type: 'refresh_token', client_id: 'triplesales-web', refresh_token: rt }));
    const r2 = await refresh(t1.refresh_token);
    assert.equal(r2.status, 200);
    assert.equal((await refresh(t1.refresh_token)).status, 400);
    assert.equal((await refresh((await r2.json()).refresh_token)).status, 200);
  });

  it('should pick the only usable company by itself', async () => {
    const s = await session(await signIn('one'));
    assert.equal(s.result.companies.length, 1);
    assert.equal(s.result.selectedCompanyId, String(BRANCHES[0].id));
  });

  it('should ignore a company whose employee is closed, so a user with one usable company is not asked', async () => {
    const s = await session(await signIn('half'));
    assert.deepEqual(s.result.companies.map((c) => c.code), ['SUN']);
    assert.equal(s.result.selectedCompanyId, String(BRANCHES[0].id));
  });

  it('should ask a user with several companies to choose, and keep the choice', async () => {
    const t = await signIn('two');
    const s = await session(t);
    assert.equal(s.result.companies.length, 2);
    assert.equal(s.result.selectedCompanyId, null);
    assert.equal((await api('/me/ping', t)).status, 409); // COMPANY_NOT_SELECTED
    assert.equal((await api(`/me/session/company/${BRANCHES[1].id}`, t, { method: 'PUT' })).status, 200);
    assert.equal((await api('/me/ping', t)).status, 200);
    assert.equal((await session(t)).result.selectedCompanyId, String(BRANCHES[1].id)); // same sid → the choice stays
    assert.equal((await api('/me/session/company/999', t, { method: 'PUT' })).status, 403);
  });

  it('should refuse with a code that tells the user what is wrong: no company, no system role, a closed account', async () => {
    const none = await api('/me/session', await signIn('none'), { method: 'POST' });
    assert.equal(none.status, 403);
    assert.equal((await none.json()).code, 'NO_ACTIVE_COMPANY');
    const nosys = await api('/me/session', await signIn('nosys'), { method: 'POST' });
    assert.equal(nosys.status, 403);
    assert.equal((await nosys.json()).code, 'NO_SYSTEM_ACCESS');
    const t = await signIn('one');
    USERS.find((u) => u.username === 'one').disabled = true;
    assert.equal((await api('/me/session', t, { method: 'POST' })).status, 401);
  });

  it('should end the older session when the same user signs in again (SESSION_REPLACED)', async () => {
    const first = await signIn('one');
    await session(first);
    const second = await signIn('one');
    await session(second);
    const old = await api('/me/session', first, { method: 'POST' });
    assert.equal(old.status, 401);
    assert.equal((await old.json()).code, 'SESSION_REPLACED');
    assert.equal((await api('/me/ping', second)).status, 200);
  });

  it('should refuse a write sent for another company (COMPANY_CHANGED) and clear the choice when its employee is closed', async () => {
    const t = await signIn('two');
    await session(t);
    await api(`/me/session/company/${BRANCHES[0].id}`, t, { method: 'PUT' });
    assert.equal((await api('/me/ping', t, { method: 'POST', headers: { 'X-Expected-Company': String(BRANCHES[0].id) } })).status, 200);
    const stale = await api('/me/ping', t, { method: 'POST', headers: { 'X-Expected-Company': String(BRANCHES[1].id) } });
    assert.equal(stale.status, 409);
    assert.equal((await stale.json()).code, 'COMPANY_CHANGED');
    USERS.find((u) => u.username === 'two').branches = ['ACE']; // the employee of SUN is closed
    const closed = await api('/me/ping', t);
    assert.equal(closed.status, 401);
    assert.equal((await closed.json()).code, 'EMPLOYEE_INACTIVE');
  });

  it('should reject an expired access token and end the session at logout', async () => {
    const t = await signIn('one');
    await session(t);
    const hint = encodeURIComponent(t.id_token);
    const out = await fetch(`${origin}${IDP_BASE}/protocol/openid-connect/logout?id_token_hint=${hint}&post_logout_redirect_uri=${encodeURIComponent('http://localhost:4300/login')}`, { redirect: 'manual' });
    assert.equal(out.status, 302);
    const refreshed = await post(`${IDP_BASE}/protocol/openid-connect/token`, new URLSearchParams({ grant_type: 'refresh_token', client_id: 'triplesales-web', refresh_token: t.refresh_token }));
    assert.equal(refreshed.status, 400);
    const t2 = await signIn('one');
    clock.t += 6 * 60 * 1000;
    assert.equal((await api('/me/session', t2, { method: 'POST' })).status, 401);
  });
});
