const assert = require('node:assert/strict');
const { describe, it } = require('node:test');
const { MOCKUP_PATHS, applyMockupRemote, checkRemote, mockupRemote } = require('./mockup-remote-proxy.cjs');

const table = { '/mockup-api': { target: 'http://127.0.0.1:4310' }, '/other': { target: 'http://x' } };
const env = { MOCKUP_REMOTE_URL: 'https://acedemo.acecloud.co.th:7339/', MOCKUP_TOKEN: 'secret' };

describe('the dev proxy to the shared file server', () => {
  it('should leave the table alone when no shared server is asked for', () => {
    assert.equal(applyMockupRemote(table, {}), table);
    assert.equal(applyMockupRemote(table, { MOCKUP_REMOTE_URL: '  ' }), table);
  });

  it('should point the three mockup paths at it with the token (no workspace unless one is asked for: there is one state), and keep the rest', () => {
    const out = applyMockupRemote(table, env);
    assert.deepEqual(Object.keys(out).sort(), [...MOCKUP_PATHS, '/other'].sort());
    for (const path of MOCKUP_PATHS) {
      assert.equal(out[path].target, 'https://acedemo.acecloud.co.th:7339');
      assert.equal(out[path].changeOrigin, true);
      assert.equal(out[path].secure, true);
      assert.deepEqual(out[path].headers, { 'x-mockup-token': 'secret' });
    }
    assert.equal(out['/other'], table['/other']);
  });

  it('should add the workspace header only when a workspace is asked for', () => {
    const out = applyMockupRemote(table, { ...env, MOCKUP_WORKSPACE: 'somyot' });
    for (const path of MOCKUP_PATHS) assert.deepEqual(out[path].headers, { 'x-mockup-token': 'secret', 'x-mockup-workspace': 'somyot' });
    assert.equal(mockupRemote({ ...env, MOCKUP_WORKSPACE: ' somyot ' }).remote.workspace, 'somyot');
    for (const path of MOCKUP_PATHS) assert.equal(applyMockupRemote(table, { ...env, MOCKUP_WORKSPACE: '' })[path].headers['x-mockup-workspace'], undefined);
  });

  it('should connect to the address asked for while the name stays the domain (the gateway machine cannot reach its own public address)', async () => {
    const out = applyMockupRemote(table, { ...env, MOCKUP_REMOTE_IP: '127.0.0.1' });
    const agent = out['/mockup-api'].agent;
    assert.ok(agent, 'an agent is given');
    assert.equal(out['/mockup-api'].target, 'https://acedemo.acecloud.co.th:7339');
    const one = await new Promise((resolve) => agent.options.lookup('acedemo.acecloud.co.th', {}, (e, address, family) => resolve({ e, address, family })));
    assert.deepEqual(one, { e: null, address: '127.0.0.1', family: 4 });
    const all = await new Promise((resolve) => agent.options.lookup('acedemo.acecloud.co.th', { all: true }, (e, list) => resolve(list)));
    assert.deepEqual(all, [{ address: '127.0.0.1', family: 4 }]);
    assert.equal(applyMockupRemote(table, env)['/mockup-api'].agent, undefined, 'no address, no agent');
    assert.match(mockupRemote({ ...env, MOCKUP_REMOTE_IP: '999.1.1.1' }).problem, /MOCKUP_REMOTE_IP/);
    assert.match(mockupRemote({ ...env, MOCKUP_REMOTE_IP: 'localhost' }).problem, /MOCKUP_REMOTE_IP/);
  });

  it('should say ONCE that the server cannot be reached (with the cause for a loopback address), answer 502 quietly, and say when it is back', () => {
    const { EventEmitter } = require('node:events');
    const warnings = [];
    const logs = [];
    const warn = console.warn;
    const log = console.log;
    console.warn = (m) => warnings.push(m);
    console.log = (m) => logs.push(m);
    try {
      const out = applyMockupRemote(table, { ...env, MOCKUP_REMOTE_IP: '127.0.0.1' });
      const proxy = new EventEmitter();
      proxy.on('error', () => assert.fail('a listener that was there is replaced'));
      out['/mockup-api'].configure(proxy);
      proxy.on('error', () => assert.fail('a listener added later (the dev server prints a stack per call) is ignored'));
      const reply = () => {
        const res = { headersSent: false, writeHead(code) { this.code = code; }, end(body) { this.body = body; } };
        return res;
      };
      const first = reply();
      proxy.emit('error', Object.assign(new Error('refused'), { code: 'ECONNREFUSED' }), {}, first);
      proxy.emit('error', Object.assign(new Error('refused'), { code: 'ECONNREFUSED' }), {}, reply());
      assert.equal(first.code, 502);
      assert.match(first.body, /unreachable/);
      assert.equal(warnings.length, 1);
      assert.match(warnings[0], /ECONNREFUSED/);
      assert.match(warnings[0], /192\.168\.24\.233/);
      proxy.emit('proxyRes');
      assert.match(logs[0], /reachable again/);
      proxy.emit('error', new Error('again'), {}, reply());
      assert.equal(warnings.length, 2);
    } finally {
      console.warn = warn;
      console.log = log;
    }
  });

  it('should ignore, and say why, a setting that cannot work (no token, a bad address)', () => {
    assert.match(mockupRemote({ ...env, MOCKUP_TOKEN: '' }).problem, /MOCKUP_TOKEN/);
    assert.match(mockupRemote({ ...env, MOCKUP_REMOTE_URL: 'not a url' }).problem, /not an address/);
    assert.match(mockupRemote({ ...env, MOCKUP_REMOTE_URL: 'ftp://x' }).problem, /https/);
    assert.match(mockupRemote({ ...env, MOCKUP_WORKSPACE: '../x' }).problem, /MOCKUP_WORKSPACE/);
    assert.equal(mockupRemote({ ...env, MOCKUP_TOKEN: '' }).remote, undefined);
  });

  describe('can this machine use the shared server?', () => {
    const http = require('node:http');
    const serve = (handler) => new Promise((r) => { const server = http.createServer(handler); server.listen(0, '127.0.0.1', () => r(server)); });

    it('should say yes, and whether the token is accepted', async () => {
      const server = await serve((req, res) => { res.statusCode = req.url.endsWith('/health') ? 200 : req.headers['x-mockup-token'] === 'good' ? 404 : 401; res.end('{}'); });
      try {
        const origin = `http://127.0.0.1:${server.address().port}`;
        assert.deepEqual(await checkRemote({ origin, token: 'good', ip: '' }), { ok: true, ip: '', token: true, problem: '' });
        assert.equal((await checkRemote({ origin, token: 'bad', ip: '' })).token, false);
      } finally {
        server.close();
      }
    });

    it('should say no, with the reason, when nothing answers (and not try a LAN address for a plain http address)', async () => {
      const server = await serve(() => undefined);
      const port = server.address().port;
      await new Promise((r) => server.close(r));
      const out = await checkRemote({ origin: `http://127.0.0.1:${port}`, token: 't', ip: '' }, { timeoutMs: 1500 });
      assert.equal(out.ok, false);
      assert.match(out.problem, /ECONNREFUSED/);
    });
  });
});
