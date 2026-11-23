// Runs scenarios on one side of the comparison in headless Chrome and returns the dump text.
//
// One task = (scenario, side). Every task gets its OWN browser context (clean cookies / localStorage / sessionStorage) and, on the
// Java side, its own backend state in the harness server (cookie `cmp_sid`), so tasks can run in parallel and never see each
// other's data.
import { readFileSync } from 'node:fs';
import { PRE } from './scenario-pre.mjs';

const DUMP_SRC = readFileSync(new URL('./dump-page.js', import.meta.url), 'utf8');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/** signs in once (the mock accepts any account but "wrong") and returns what the app keeps in sessionStorage */
export async function loginNg(browser, ngOrigin, user = 'demo', pass = 'demo') {
  const ctx = await browser.createBrowserContext();
  try {
    const p = await ctx.newPage();
    await p.goto(ngOrigin + '/login', { waitUntil: 'load' });
    await p.waitForSelector('#username', { timeout: 20000 });
    await p.type('#username', user);
    await p.type('#password', pass);
    await p.click('#loginBtn');
    const deadline = Date.now() + 20000;
    for (;;) {
      const st = await p.evaluate(() => ({
        path: location.pathname,
        org: !!document.querySelector('#orgStep') && getComputedStyle(document.querySelector('#orgStep')).display !== 'none' && document.querySelector('#orgSelect')?.options?.length > 0,
      }));
      if (!st.path.startsWith('/login')) break;
      if (st.org) await p.click('#orgSubmitBtn').catch(() => {});
      if (Date.now() > deadline) throw new Error('mock login did not leave /login');
      await sleep(250);
    }
    return await p.evaluate(() => Object.fromEntries(Object.entries(sessionStorage)));
  } finally {
    await ctx.close();
  }
}

/**
 * the sessionStorage entries of a sign-in with exactly these roles: every JSON value of the shape { session: { roles: […] } } is rewritten.
 * AuthService puts every role the app knows into the session at sign-in (TEMPORARY, finishLogin), while the Java replica of an account
 * is built for the account's own roles — so the sessions of the accounts a scenario asks for (opts.user) get their own roles back.
 */
export function withRoles(session, roles) {
  return Object.fromEntries(
    Object.entries(session).map(([k, v]) => {
      try {
        const o = JSON.parse(v);
        if (Array.isArray(o?.session?.roles)) {
          o.session.roles = [...roles];
          return [k, JSON.stringify(o)];
        }
      } catch { /* not JSON */ }
      return [k, v];
    }),
  );
}

/** the sessionStorage entries of a sign-in without some roles (opts.denyRoles of a scenario): every JSON value of the shape { session: { roles: […] } } is rewritten */
function withoutRoles(session, deny) {
  if (!deny?.length) return session;
  return Object.fromEntries(
    Object.entries(session).map(([k, v]) => {
      try {
        const o = JSON.parse(v);
        if (Array.isArray(o?.session?.roles)) {
          o.session.roles = o.session.roles.filter((r) => !deny.includes(r));
          return [k, JSON.stringify(o)];
        }
      } catch { /* not JSON */ }
      return [k, v];
    }),
  );
}

/** the code of a scenario as the page runs it */
export function scenarioCode(sc, pagePre = '') {
  return PRE + pagePre + (typeof sc.fn === 'string' ? sc.fn : 'return await (' + sc.fn.toString() + ')(sleep, side, win);');
}

/**
 * @param {import('puppeteer-core').Browser} browser
 * @param {{name:string, side:'java'|'ng', sc:{opts:object, fn:any}}} task
 * @param {object} env  { page, javaOrigin, ngOrigin, session, sid }
 * @returns {Promise<{dump:string, error:string|null, log:string[]}>}
 */
export async function runTask(browser, task, env) {
  const { page: cfg } = env;
  // --live: opts.live = what a scenario does differently in a live run, on BOTH sides (another address, a failure for the fake service / the replica's
  // mock to play: opts.live.hook), so that the two pages still start from the same address and the same situation
  const liveOpts = env.live && task.sc.opts.live ? task.sc.opts.live : {};
  const opts = { frames: [], ...task.sc.opts, ...liveOpts };
  const lang = opts.lang ?? 'th';
  const ctx = await browser.createBrowserContext();
  const log = [];
  let error = null;
  try {
    const p = await ctx.newPage();
    await p.setViewport({ width: opts.w ?? 1280, height: opts.h ?? 800, deviceScaleFactor: 1 });
    p.on('pageerror', (e) => log.push('pageerror: ' + (e.stack ?? e.message).split('\n').slice(0, 3).join(' | ')));
    p.on('console', (m) => { if (m.type() === 'error') log.push('console.error: ' + m.text().slice(0, 300)); });
    p.on('response', (r) => { if (r.status() >= 400) log.push(`HTTP ${r.status()} ${r.url().replace(/^http:\/\/127\.0\.0\.1:\d+/, '')}`); });

    const origin = task.side === 'java' ? env.javaOrigin : env.ngOrigin;
    // the harness server holds the state (the mock backend) of the scenario by cookie: the Java replica reads it, and so do the fake REST
    // services of the --live mode (the app reaches them through a same-origin proxy, the cookie goes with it)
    if (task.side === 'java' || env.live) {
      await ctx.setCookie({ name: 'cmp_sid', value: env.sid, domain: '127.0.0.1', path: '/' });
      await fetch(`${env.javaOrigin}/__reset?delay=${cfg.latencyMs ?? 150}&hook=${encodeURIComponent(opts.hook ?? '')}`, { headers: { cookie: 'cmp_sid=' + env.sid } });
    }
    // opts.user = the account the Angular side signs in with (default: the one run.mjs signed in); opts.storage = more sessionStorage keys,
    // set before the first document on both sides (a page's mock reads its switches from there)
    // opts.denyRoles: the signed-in user lacks these roles (Angular side; a Java replica page is built for the same set — see the page's build())
    let baseSession = withoutRoles(task.side === 'ng' ? (opts.user && env.sessions?.[opts.user]) || env.session : {}, opts.denyRoles);
    // (a page may also change the session of the signed-in user per scenario, e.g. other roles AND another employee: cfg.ngSession(session, opts))
    if (task.side === 'ng' && cfg.ngSession) baseSession = cfg.ngSession(baseSession, opts);
    // opts.local = { key: value }: what the page finds in localStorage when it starts (a value it kept on an earlier visit), both sides
    const init = { session: { ...baseSession, ...(opts.storage ?? {}) }, lang: lang === 'th' ? '' : lang, local: opts.local ?? {} };
    // before the first document of the tab: the sign-in (Angular), the language, a clean theme — once, so that a language
    // switch that reloads the page keeps what the page itself stored
    await p.evaluateOnNewDocument((i) => {
      if (window.top !== window) return;
      try {
        if (sessionStorage.getItem('__cmp')) return;
        sessionStorage.setItem('__cmp', '1');
        for (const [k, v] of Object.entries(i.session)) sessionStorage.setItem(k, v);
        for (const [k, v] of Object.entries(i.local)) localStorage.setItem(k, v);
        localStorage.removeItem('ts.theme');
        if (i.lang) localStorage.setItem('ts.lang', i.lang);
        else localStorage.removeItem('ts.lang');
      } catch (e) { /* storage blocked */ }
    }, init);

    // page.clock = [year, monthIndex, day, hour?, minute?, second?] (local time): "now" of the page. A page that reads `new Date()` for its
    // "today" (a calendar) shows the same day on every run and agrees with the mock data (SEED_TODAY), whatever the date of the machine is.
    // The clock keeps running from that moment on (timers, animations, ordering of events stay real); both sides get it.
    if (cfg.clock) {
      await p.evaluateOnNewDocument((c) => {
        const Real = Date;
        const base = new Real(c[0], c[1], c[2], c[3] ?? 10, c[4] ?? 30, c[5] ?? 0).getTime();
        const start = Real.now();
        const now = () => base + (Real.now() - start);
        function FakeDate(...a) {
          if (!new.target) return new Real(now()).toString();
          return a.length ? new Real(...a) : new Real(now());
        }
        FakeDate.prototype = Real.prototype;
        FakeDate.now = now;
        FakeDate.parse = Real.parse;
        FakeDate.UTC = Real.UTC;
        Object.defineProperty(FakeDate, 'name', { value: 'Date' });
        window.Date = FakeDate;
      }, cfg.clock);
    }

    const path = task.side === 'java' ? cfg.javaPath(lang, opts) : cfg.ngPath(lang, opts);
    const ready = opts.ready ?? cfg.ready;
    // everything after the document was requested: wait for the page, set the theme, let it settle, put the dump script in
    const boot = async () => {
      try {
        await p.waitForFunction(`!!(${ready})`, { timeout: opts.readyTimeout ?? 15000, polling: 100 });
      } catch {
        log.push('ready-timeout: ' + ready);
      }
      await p.evaluate(() => document.fonts.ready.then(() => 1));
      if (opts.theme) {
        // the Java page keeps the theme on <body>, the Angular shell on <html>: set both so each side's own CSS applies
        await p.evaluate((t) => { document.documentElement.setAttribute('data-theme', t); document.body.setAttribute('data-theme', t); }, opts.theme);
      }
      await sleep(opts.settle ?? 1800);
      await p.evaluate(DUMP_SRC);
    };
    await p.goto(origin + path, { waitUntil: 'load', timeout: 45000 });
    await boot();

    let out;
    try {
      out = await p.evaluate(async (code, side) => {
        try { return await window.__cmp.run(code, side); } catch (e) { return 'ERR ' + (e && e.message ? e.message : e); }
      }, scenarioCode(task.sc, cfg.pre ?? ''), task.side);
    } catch (e) {
      // opts.reloads: the scenario makes the Java page reload itself (location.reload() after a save) — the document is replaced and the
      // scenario function with it. Carry on with the NEW document (the Angular page starts a fresh view without a page load): wait for it,
      // put the dump helpers back and run the page's prelude again (it defines window.__extra)
      if (!opts.reloads || !/context was destroyed|navigat|detached/i.test(String(e?.message ?? e))) throw e;
      await p.waitForFunction('document.readyState === "complete"', { timeout: 20000, polling: 100 });
      await boot();
      out = await p.evaluate(async (code, side) => {
        try { return await window.__cmp.run(code, side); } catch (er) { return 'ERR ' + (er && er.message ? er.message : er); }
      }, PRE + (cfg.pre ?? '') + 'return 1;', task.side);
    }
    if (typeof out === 'string' && out.startsWith('ERR ')) error = out.slice(4);
    // a scenario that returns '__RELOAD__' wants the page loaded again (what it did first is kept by the server session / the tab's storage)
    if (out === '__RELOAD__') {
      await p.reload({ waitUntil: 'load', timeout: 45000 });
      await boot();
    }

    if (task.evalCode) {
      // debugging (run.mjs --eval): the value of an expression, after the scenario; the helpers of the scenarios are in scope
      const value = await p.evaluate(async (code, side) => {
        try { return JSON.stringify(await window.__cmp.run(code, side), null, 2); } catch (e) { return 'ERR ' + (e && e.message ? e.message : e); }
      }, PRE + (cfg.pre ?? '') + 'return (' + task.evalCode + ');', task.side);
      return { dump: String(value), error: null, log };
    }

    const docs = [{ name: 'main', roots: opts.roots ?? cfg.roots }];
    for (const f of opts.frames) docs.push({ name: f.name, frame: f.sel, roots: f.roots ?? ['body'] });
    const dump = await p.evaluate(async (d, wait) => { await window.__cmp.sleep(wait); return window.__cmp.dump(d); }, docs, opts.wait ?? 600);
    if (task.shotFile) await p.screenshot({ path: task.shotFile, fullPage: false }); // (--shots: look at the page, side by side with the other side)
    return { dump: error ? dump + '\nSCENARIO-ERROR ' + error : dump, error, log };
  } catch (e) {
    return { dump: 'RUNNER-ERROR ' + (e?.message ?? e), error: String(e?.message ?? e), log };
  } finally {
    await ctx.close().catch(() => {});
  }
}

/** runs `tasks` with `jobs` workers; `onDone(task, result)` is called as each finishes */
export async function runPool(browser, tasks, jobs, make, onDone) {
  let next = 0;
  const worker = async (w) => {
    for (;;) {
      const i = next++;
      if (i >= tasks.length) return;
      const task = tasks[i];
      const res = await runTask(browser, task, make(w, task));
      await onDone(task, res);
    }
  };
  await Promise.all(Array.from({ length: Math.max(1, Math.min(jobs, tasks.length)) }, (_, w) => worker(w)));
}
