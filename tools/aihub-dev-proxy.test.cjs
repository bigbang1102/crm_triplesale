'use strict';
const assert = require('node:assert/strict');
const { describe, it } = require('node:test');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { aihubProxy, bypass, configProblem, loadLocalEnv, rewrite } = require('./aihub-dev-proxy.cjs');

const ENV = { AIHUB_SERVICE_BASE: 'https://svc.example', AIHUB_API_KEY: 'test-key', AIHUB_ACTOR: 'tester', AIHUB_SUPER_ADMIN: '1' };
const ID = 'a'.repeat(32);

const reply = () => {
  const r = { headers: {}, setHeader: (k, v) => (r.headers[k] = v), end: (b) => (r.body = b) };
  return r;
};

describe('AI HUB dev proxy', () => {
  it('should rewrite an allowed path to the service API and add the identity of the proxy', () => {
    const out = rewrite('/triplesale/aihub/tools/doc-analyze', ENV);
    const url = new URL(out, 'http://x');
    assert.equal(url.pathname, '/aihub-api/tools/doc-analyze');
    assert.equal(url.searchParams.get('actor'), 'tester');
    assert.equal(url.searchParams.get('superAdmin'), '1');
    assert.equal(url.searchParams.get('libraryAdmin'), '0');
  });

  it('should drop what the caller sent for an injected parameter, and keep the rest', () => {
    const out = rewrite(`/triplesale/aihub/files/${ID}?download=1&superAdmin=1&actor=root`, { ...ENV, AIHUB_SUPER_ADMIN: '0' });
    const q = new URL(out, 'http://x').searchParams;
    assert.equal(q.get('download'), '1');
    assert.equal(q.get('superAdmin'), '0');
    assert.equal(q.get('actor'), 'tester');
    assert.equal(q.getAll('actor').length, 1);
  });

  it('should refuse a path the servlet did not allow', () => {
    for (const url of ['/triplesale/aihub/admin', '/triplesale/aihub/files/short', '/other/tools']) {
      assert.equal(rewrite(url, ENV), undefined, url);
    }
  });

  it('should answer 403 / 503 itself instead of forwarding', () => {
    let res = reply();
    assert.equal(bypass({ url: '/triplesale/aihub/nothing' }, res, ENV), true);
    assert.equal(res.statusCode, 403);

    res = reply();
    assert.equal(bypass({ url: '/triplesale/aihub/tools' }, res, { ...ENV, AIHUB_API_KEY: '' }), true);
    assert.equal(res.statusCode, 503);
    assert.match(JSON.parse(res.body).error, /AIHUB_API_KEY/);

    assert.equal(bypass({ url: '/triplesale/aihub/tools' }, reply(), ENV), undefined);
  });

  it('should report what is missing, and send the key as a header only', () => {
    assert.match(configProblem({}), /AIHUB_SERVICE_BASE/);
    assert.equal(configProblem(ENV), '');
    const entry = aihubProxy(ENV);
    assert.equal(entry.headers['X-Api-Key'], 'test-key');
    assert.equal(entry.target, 'https://svc.example');
    assert.equal(rewrite('/triplesale/aihub/usage', ENV).includes('test-key'), false);
  });

  it('should read KEY=VALUE lines of the local file, let a real variable win, and accept a missing file', () => {
    const file = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'aihub-')), 'env');
    fs.writeFileSync(file, ['# comment', 'AIHUB_SERVICE_BASE=https://from-file', 'AIHUB_API_KEY = k-from-file', 'not a pair', ''].join('\r\n'));
    const env = { AIHUB_SERVICE_BASE: 'https://from-shell' };
    loadLocalEnv(file, env);
    assert.equal(env.AIHUB_SERVICE_BASE, 'https://from-shell');
    assert.equal(env.AIHUB_API_KEY, 'k-from-file');
    assert.doesNotThrow(() => loadLocalEnv(path.join(os.tmpdir(), 'does-not-exist-aihub'), {}));
  });
});

describe('AI HUB dev proxy — identity of the signed-in user', () => {
  const headers = { 'x-ts-actor': encodeURIComponent('สมชาย'), 'x-ts-super-admin': '1', 'x-ts-branch-code': 'SUN' };

  it('should ignore the X-Ts headers unless AIHUB_CLIENT_IDENTITY is 1', () => {
    const q = new URL(rewrite('/triplesale/aihub/usage', { ...ENV, AIHUB_SUPER_ADMIN: '0' }, headers), 'http://x').searchParams;
    assert.equal(q.get('superAdmin'), '0');
    assert.equal(q.get('actor'), 'tester');
  });

  it('should take identity and flags from the headers when AIHUB_CLIENT_IDENTITY is 1, and fall back to the env for an absent one', () => {
    const env = { ...ENV, AIHUB_SUPER_ADMIN: '0', AIHUB_CLIENT_IDENTITY: '1', AIHUB_LIBRARY_ADMIN: '1' };
    const q = new URL(rewrite('/triplesale/aihub/usage', env, headers), 'http://x').searchParams;
    assert.equal(q.get('actor'), 'สมชาย');
    assert.equal(q.get('superAdmin'), '1');
    assert.equal(q.get('branchCode'), 'SUN');
    assert.equal(q.get('libraryAdmin'), '1');
  });

  it('should not trust a malformed header value', () => {
    const env = { ...ENV, AIHUB_CLIENT_IDENTITY: '1' };
    const q = new URL(rewrite('/triplesale/aihub/usage', env, { 'x-ts-actor': '%E0%A4%A' }), 'http://x').searchParams;
    assert.equal(q.get('actor'), 'tester');
  });
});

describe('AI HUB dev proxy — token admin flags and department', () => {
  const headers = { 'x-ts-token-admin': '1', 'x-ts-quota-admin': '0', 'x-ts-all-branch': '1', 'x-ts-dept-code': 'A1-PO-MKT', 'x-ts-dept-name': encodeURIComponent('ฝ่ายการตลาด') };

  it('should default the new flags to 0 and the department to empty', () => {
    const q = new URL(rewrite('/triplesale/aihub/tools/admin-tokens', ENV), 'http://x').searchParams;
    for (const key of ['tokenAdmin', 'quotaAdmin', 'allBranch']) assert.equal(q.get(key), '0', key);
    assert.equal(q.get('deptCode'), '');
  });

  it('should take the new flags and the department from the headers when AIHUB_CLIENT_IDENTITY is 1', () => {
    const q = new URL(rewrite('/triplesale/aihub/tools/admin-tokens', { ...ENV, AIHUB_CLIENT_IDENTITY: '1' }, headers), 'http://x').searchParams;
    assert.equal(q.get('tokenAdmin'), '1');
    assert.equal(q.get('quotaAdmin'), '0');
    assert.equal(q.get('allBranch'), '1');
    assert.equal(q.get('deptName'), 'ฝ่ายการตลาด');
  });

  it('should drop a tokenAdmin the caller put in the query string', () => {
    const q = new URL(rewrite('/triplesale/aihub/tools/admin-tokens?tokenAdmin=1&quotaAdmin=1', ENV), 'http://x').searchParams;
    assert.equal(q.get('tokenAdmin'), '0');
    assert.equal(q.getAll('quotaAdmin').length, 1);
  });
});
