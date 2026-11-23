#!/usr/bin/env node
// Compares a page of the Java app (rebuilt from the real Facelets / CSS / JS) with its Angular port, scenario by scenario, in
// headless Chrome — DOM + attributes + text + geometry + computed styles + canvas checksums, line by line. See README.md.
//
//   node tools/compare/run.mjs <page> [options]
//     --filter <regex>    only scenarios whose name matches            --list            print the scenario names and stop
//     --side both|java|ng which side(s) to run (default both)           --jobs <n>        parallel browser contexts (default 6)
//     --mode all|style|dom how strictly to compare (default all)        --limit <n>       diff lines shown per scenario (default 12)
//     --no-build          reuse the last `ng build` snapshot            --no-confirm      do not re-run differing scenarios serially
//     --cmp               do not run anything: compare the dumps of the last run again (use with --show)
//     --show <name>       print the diff of one scenario (with --style / --geom: the per element property summary)
//     --live              the Angular side runs its LIVE backend (mock:false) against fake REST services (page.upstream) — dumps in dumps-live/
//                         (a scenario's opts: `live: false` = skipped; `live: {…}` = opts that replace the others on both sides,
//                          e.g. { code, hook } — `hook` is handed to the page's state (state.hook) so that its fake service / mock can play a failure)
//     --shots             also save a screenshot per side to .compare/<page>/shots/<scenario>-<java|ng>.png
//     --eval <js> [--scenario <name>]   debugging: print the value of a JS expression on both sides (after the scenario)
import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { launch } from './lib/browser.mjs';
import { compareDumps, styleSummary } from './lib/diff.mjs';
import { loadTs } from './lib/load-ts.mjs';
import { loginNg, runPool, withRoles } from './lib/runner.mjs';
import { startHarness, startNg } from './lib/servers.mjs';
import { createLiveUpstream } from './lib/live-upstream.mjs';
import { createShell } from './lib/shell-replica.mjs';

/* ---------------- arguments ---------------- */
const argv = process.argv.slice(2);
const VALUE_OPTS = new Set(['filter', 'side', 'jobs', 'mode', 'limit', 'show', 'eval', 'scenario']);
const opt = {};
const pos = [];
for (let i = 0; i < argv.length; i++) {
  const a = argv[i];
  if (a.startsWith('--')) {
    const k = a.slice(2);
    if (VALUE_OPTS.has(k)) opt[k] = argv[++i];
    else opt[k] = true;
  } else pos.push(a);
}
const pageName = pos[0];
if (!pageName) {
  console.error('usage: node tools/compare/run.mjs <page> [--filter re] [--side both|java|ng] [--jobs n] [--mode all|style|dom] [--no-build] [--list] [--show name]');
  process.exit(2);
}

const here = dirname(fileURLToPath(import.meta.url));
const ngRoot = resolve(here, '../..');
const javaRoot = resolve(process.env.TS_JAVA_ROOT ?? join(ngRoot, '..', 'triple_sale_main'));
const root = join(ngRoot, '.compare');
const out = join(root, pageName);
const dumps = join(out, opt.live ? 'dumps-live' : 'dumps'); // --live: the Angular side runs its LIVE backend against the fake services (lib/live-upstream.mjs)
const ngBuild = join(root, 'ng-build');
const page = (await import(pathToFileURL(join(here, 'pages', pageName, 'page.mjs')).href)).default;
const scenarios = new Map();
(await import(pathToFileURL(join(here, 'pages', pageName, 'scenarios.mjs')).href)).default((name, opts, fn) => scenarios.set(name, { opts: opts ?? {}, fn }));

const mode = opt.mode ?? 'all';
const limit = Number(opt.limit ?? 12);
const jobs = Number(opt.jobs ?? 6);
const sides = opt.side === 'java' ? ['java'] : opt.side === 'ng' ? ['ng'] : ['java', 'ng'];
const filter = opt.filter ? new RegExp(opt.filter) : null;
// --live: a scenario with `live: false` in its opts cannot happen against a REST service (a servlet that threw, a proxy page instead of JSON …)
const names = [...scenarios.keys()].filter((n) => (!filter || filter.test(n)) && !(opt.live && scenarios.get(n).opts.live === false));
const dumpFile = (name, side) => join(dumps, `${name}-${side}.txt`);
const readDump = (name, side) => (existsSync(dumpFile(name, side)) ? readFileSync(dumpFile(name, side), 'utf8') : null);
const compareOne = (name) => {
  const a = readDump(name, 'java');
  const b = readDump(name, 'ng');
  return a == null || b == null ? null : compareDumps(a, b, { mode, limit, normalize: page.normalize });
};
const line = (name, r) => `${name.padEnd(34)} ${(r ? `java ${r.ja} / ng ${r.ng} lines` : '(one side missing)').padEnd(30)} ${r ? (r.diffs ? `${r.diffs} DIFFERENT` : 'identical') : ''}`;

if (opt.list) {
  console.log(names.join('\n'));
  console.log(`${names.length} scenarios`);
  process.exit(0);
}

/* ---------------- compare only ---------------- */
if (opt.cmp || opt.show) {
  if (opt.show) {
    const a = readDump(opt.show, 'java');
    const b = readDump(opt.show, 'ng');
    if (a == null || b == null) { console.log('missing a side of', opt.show); process.exit(1); }
    if (opt.style || opt.geom) {
      for (const l of styleSummary(a, b, { geom: !!opt.geom })) console.log(l);
    } else {
      const r = compareDumps(a, b, { mode, limit: Number(opt.limit ?? 40), normalize: page.normalize });
      console.log(line(opt.show, r));
      for (const o of r.out) console.log(o);
    }
    process.exit(0);
  }
  let bad = 0;
  for (const n of names) {
    const r = compareOne(n);
    if (r?.diffs) bad++;
    console.log(line(n, r));
  }
  console.log(bad ? `${bad} scenario(s) differ` : 'all identical');
  process.exit(bad ? 1 : 0);
}

/* ---------------- the Angular snapshot ---------------- */
const t0 = Date.now();
if (sides.includes('ng') && !(opt['no-build'] && existsSync(join(ngBuild, 'browser', 'index.html')))) {
  console.log('ng build (development) …');
  const r = spawnSync(process.execPath, [join(ngRoot, 'node_modules/@angular/cli/bin/ng.js'), 'build', '--configuration', 'development', '--output-path', ngBuild], { cwd: ngRoot, stdio: 'inherit', env: { ...process.env, CI: '1', NG_CLI_ANALYTICS: 'false' } });
  if (r.status !== 0) { console.error('ng build failed'); process.exit(1); }
}
const ngDir = existsSync(join(ngBuild, 'browser', 'index.html')) ? join(ngBuild, 'browser') : ngBuild;

/* ---------------- the Java replica + harness server ---------------- */
mkdirSync(dumps, { recursive: true });
rmSync(join(out, '_mod'), { recursive: true, force: true });
let modSeq = 0;
const ctx = {
  ngRoot,
  javaRoot,
  out,
  shell: createShell({ javaRoot, ngRoot, out }),
  loadTs: (entry) => loadTs(ngRoot, entry, join(out, '_mod', String(++modSeq))),
  readJson: (rel) => JSON.parse(readFileSync(join(ngRoot, rel), 'utf8')),
};
const javaPages = await page.build(ctx); // url path -> file
const liveUp = opt.live ? await createLiveUpstream(ctx, page) : null;
const harness = await startHarness({
  javaWeb: join(javaRoot, 'web'),
  ngRoot,
  pages: javaPages,
  newState: (sid, delay, hook) => page.newState({ sid, delay, hook, live: !!opt.live }, ctx),
  handle: async (req, state) => (liveUp && (await liveUp.handle(req, state))) || page.handle(req, state, ctx),
});
const ng = sides.includes('ng')
  ? await startNg(ngDir, opt.live ? { live: true, proxy: { prefixes: ['/triplesale-auth/', '/triplesale-service/', '/dashboard-triplesale-service/'], to: harness.origin } } : {})
  : { origin: 'http://127.0.0.1:0', close() {} };

/* ---------------- run ---------------- */
const browser = await launch();
let exitCode = 0;
try {
  const session = sides.includes('ng') ? await loginNg(browser, ng.origin) : {};
  // the other accounts the scenarios ask for (opts.user), signed in once
  const sessions = {};
  const users = await ctx.loadTs(join(ngRoot, 'src/app/core/http/mock-users.ts'));
  if (sides.includes('ng')) for (const u of new Set([...scenarios.values()].map((s) => s.opts.user).filter(Boolean))) sessions[u] = withRoles(await loginNg(browser, ng.origin, u), users.profileOf(u.toLowerCase(), u).roles);
  const make = (w) => ({ page, javaOrigin: harness.origin, ngOrigin: ng.origin, session, sessions, sid: 'w' + w, live: !!opt.live });
  const logs = new Map();
  const results = new Map();
  const finished = new Set();

  const runTasks = async (list, jobsN, quiet) => {
    await runPool(browser, list, jobsN, make, async (task, res) => {
      writeFileSync(dumpFile(task.name, task.side), res.dump);
      logs.set(`${task.name}-${task.side}`, res.log);
      if (res.error) console.log(`   ! ${task.name} [${task.side}] scenario error: ${res.error}`);
      results.set(`${task.name}-${task.side}`, res);
      if (!quiet && sides.every((s) => results.has(`${task.name}-${s}`)) && !finished.has(task.name)) {
        finished.add(task.name);
        if (sides.length === 2) console.log(line(task.name, compareOne(task.name)));
        else console.log(`${task.name.padEnd(34)} ${task.side} ${res.dump.split('\n').length} lines`);
      }
    });
  };
  if (opt.shots) mkdirSync(join(out, 'shots'), { recursive: true });
  const tasksFor = (list) =>
    list.flatMap((name) => sides.map((side) => ({ name, side, sc: scenarios.get(name), shotFile: opt.shots ? join(out, 'shots', `${name}-${side}.png`) : undefined })));

  if (opt.eval) {
    // debugging: open the page (after the scenario --scenario <name>, default: just the page) and print the value of the expression per side
    const sc = scenarios.get(opt.scenario) ?? { opts: {}, fn: async () => {} };
    const list = sides.map((side) => ({ name: 'eval', side, sc, evalCode: opt.eval }));
    await runPool(browser, list, 2, make, async (task, res) => {
      console.log(`── ${task.side} ──\n${res.dump}`);
      if (res.log.length) console.log('   (browser: ' + [...new Set(res.log)].slice(0, 3).join(' ‖ ') + ')');
    });
    await browser.close().catch(() => {});
    harness.close();
    ng.close();
    rmSync(join(out, '_mod'), { recursive: true, force: true });
    process.exit(0);
  }

  console.log(`running ${names.length} scenario(s) × ${sides.join('+')} with ${jobs} job(s) …`);
  await runTasks(tasksFor(names), jobs, false);

  let differing = sides.length === 2 ? names.filter((n) => compareOne(n)?.diffs) : [];
  if (differing.length && !opt['no-confirm']) {
    console.log(`\nre-running ${differing.length} differing scenario(s) one at a time (to rule out timing noise) …`);
    finished.clear();
    await runTasks(tasksFor(differing), 1, true);
    differing = names.filter((n) => compareOne(n)?.diffs);
  }

  const report = [];
  const blocks = [];
  for (const n of names) {
    const r = sides.length === 2 ? compareOne(n) : null;
    report.push(line(n, r));
    if (r?.diffs) { report.push(...r.out); blocks.push(line(n, r), ...r.out); }
  }
  // problems the browser reported (JS errors, failed requests), once each; the Java replica's shell has a few known 404s
  const IGNORE = [/^console\.error: Failed to load resource/, /\/images\/languages\//, /\/images\/icon_menu\//, /\/favicon\.ico/, ...(page.ignoreLog ?? [])];
  const agg = new Map();
  for (const [k, l] of logs) for (const m of new Set(l)) {
    if (IGNORE.some((re) => re.test(m))) continue;
    const e = agg.get(m) ?? { n: 0, first: k };
    e.n++;
    agg.set(m, e);
  }
  const summary = [];
  if (sides.length === 2) summary.push(differing.length ? `${differing.length} of ${names.length} scenario(s) DIFFER: ${differing.join(', ')}` : `all ${names.length} scenario(s) identical`);
  if (agg.size) {
    summary.push('', 'browser errors / failed requests:');
    for (const [m, e] of [...agg].slice(0, 30)) summary.push(`  ${String(e.n).padStart(3)}x ${m.slice(0, 220)}  (first: ${e.first})`);
  }
  writeFileSync(join(out, opt.live ? 'report-live.txt' : 'report.txt'), [...report, '', ...summary].join('\n'));
  console.log('\n' + [...blocks, ...(blocks.length ? [''] : []), ...summary].join('\n'));
  console.log(`\n${((Date.now() - t0) / 1000).toFixed(0)}s · dumps: ${dumps} · report: ${join(out, opt.live ? 'report-live.txt' : 'report.txt')}`);
  exitCode = differing.length ? 1 : 0;
} finally {
  await browser.close().catch(() => {});
  harness.close();
  ng.close();
  rmSync(join(out, '_mod'), { recursive: true, force: true });
}
process.exit(exitCode);
