#!/usr/bin/env node
/**
 * Isolated copies of the project for parallel work (there is no git repository here, and one half-written file breaks every
 * `ng build` / `ng test` of the others, so each worker gets its own tree).
 *
 *   node tools/workspace.mjs create <name>        copy to ../<project>_ws_<name> (node_modules is a junction), remember a manifest of hashes
 *   node tools/workspace.mjs status <name>        files the workspace changed / added / removed since it was created
 *   node tools/workspace.mjs merge  <name>        … and what copying them back would do (dry run)
 *   node tools/workspace.mjs merge  <name> --apply   copy the clean ones back to this project
 *   node tools/workspace.mjs remove <name>        delete the workspace (the junction is removed first, node_modules stays)
 *
 * A file is "clean" when this project still has the version the workspace started from (or does not have the file at all).
 * "shared" files (the router table, the page registry, package.json, the i18n bundles, the manual …) are edited by several
 * workers: they are never copied automatically — the report lists them with the change so that they are merged by hand.
 * The Java project is not part of the copy: the workspace sits next to it, so `../triple_sale_main` resolves as usual.
 */
import { cpSync, existsSync, lstatSync, mkdirSync, readFileSync, readdirSync, rmSync, symlinkSync, unlinkSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { basename, dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const SKIP = new Set(['node_modules', '.angular', '.compare', 'dist', 'tmp', 'out-tsc', '.vscode']);
const SHARED = [
  /^src\/app\/app\.routes\.ts$/, /^src\/app\/core\/navigation\//, /^package(-lock)?\.json$/, /^CLAUDE\.md$/, /^README\.md$/, /^manual\//, /^docs\//,
  /^public\/assets\/i18n\//, /^src\/app\/core\/i18n\//, /^src\/app\/core\/auth\//, /^src\/app\/core\/config\//, /^angular\.json$/, /^tsconfig/,
  /^tools\/compare\/lib\//, /^tools\/compare\/run\.mjs$/, /^tools\/lib\//, /^tools\/workspace\.mjs$/,
];
const MANIFEST = '.ws-manifest.json';

const [cmd, name, ...flags] = process.argv.slice(2);
const sha = (f) => createHash('sha1').update(readFileSync(f)).digest('hex');
function* walk(dir, base = dir) {
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    if (SKIP.has(e.name) || e.name === MANIFEST || e.name.startsWith('.ws-')) continue; // .ws-* = the coordinator's notes to the worker
    const p = join(dir, e.name);
    if (e.isDirectory()) yield* walk(p, base);
    else if (e.isFile()) yield relative(base, p).replace(/\\/g, '/');
  }
}
const hashes = (dir) => Object.fromEntries([...walk(dir)].map((f) => [f, sha(join(dir, f))]));

/*  node tools/workspace.mjs refresh      (run INSIDE a workspace)
    pulls the infrastructure the coordinator maintains in the main project — the porting guide, tools/lib, the compare harness, the vendored
    libraries, the shared mock cast, the Java link table — without touching a file the worker has changed itself */
const PULL = [
  /^docs\/porting-guide\.md$/, /^tools\/lib\//, /^tools\/compare\/(lib\/|run\.mjs$|README\.md$)/, /^tools\/workspace\.mjs$/,
  /^public\/assets\/(vendor|java-js)\//, /^public\/assets\/i18n\/app\./, /^src\/app\/core\/(dom|mock)\//, /^src\/app\/core\/navigation\/java-links/, /^src\/styles/,
  /^src\/app\/shared\/ui\/live-missing\//,
  // the live-adapter plumbing and the modules other workers own (a file the worker changed itself is never overwritten)
  /^src\/app\/core\/live\//, /^src\/app\/core\/i18n\/i18n\.service\.ts$/,
];
if (cmd === 'refresh') {
  if (!existsSync(join(ROOT, '.ws-origin')) || !existsSync(join(ROOT, MANIFEST))) { console.error('not inside a workspace (no .ws-origin)'); process.exit(1); }
  const origin = readFileSync(join(ROOT, '.ws-origin'), 'utf8').trim();
  const manifest = JSON.parse(readFileSync(join(ROOT, MANIFEST), 'utf8'));
  const copied = [];
  const kept = [];
  for (const f of walk(origin)) {
    if (!PULL.some((re) => re.test(f))) continue;
    const theirs = sha(join(origin, f));
    const mine = existsSync(join(ROOT, f)) ? sha(join(ROOT, f)) : null;
    if (mine === theirs) { manifest[f] = theirs; continue; }
    if (mine === null || mine === manifest[f]) {
      mkdirSync(dirname(join(ROOT, f)), { recursive: true });
      cpSync(join(origin, f), join(ROOT, f));
      manifest[f] = theirs; // not "your change": it came from the main project
      copied.push(f);
    } else kept.push(f);
  }
  writeFileSync(join(ROOT, MANIFEST), JSON.stringify(manifest, null, 1));
  console.log(copied.length ? `updated from ${origin}:\n  ` + copied.join('\n  ') : 'already up to date');
  if (kept.length) console.log(`\nNOT updated (you changed them; merge by hand — compare with ${origin}):\n  ` + kept.join('\n  '));
  process.exit(0);
}

if (!cmd || !name) {
  console.error('usage: node tools/workspace.mjs create|status|merge|remove <name> [--apply]   ·   node tools/workspace.mjs refresh (inside a workspace)');
  process.exit(2);
}
const WS = resolve(ROOT, '..', `${basename(ROOT)}_ws_${name.replace(/[^\w-]/g, '')}`);

if (cmd === 'create') {
  if (existsSync(WS)) { console.error('already exists:', WS); process.exit(1); }
  cpSync(ROOT, WS, { recursive: true, filter: (src) => !SKIP.has(basename(src)) || src === ROOT });
  symlinkSync(join(ROOT, 'node_modules'), join(WS, 'node_modules'), 'junction');
  writeFileSync(join(WS, MANIFEST), JSON.stringify(hashes(WS), null, 1));
  writeFileSync(join(WS, '.ws-origin'), ROOT);
  console.log('workspace created:', WS);
  process.exit(0);
}

if (cmd === 'remove') {
  if (!existsSync(WS)) { console.error('no such workspace:', WS); process.exit(1); }
  const nm = join(WS, 'node_modules');
  if (existsSync(nm) && lstatSync(nm).isSymbolicLink()) unlinkSync(nm); // junction first: never delete through it
  rmSync(WS, { recursive: true, force: true });
  console.log('removed', WS);
  process.exit(0);
}

if (!existsSync(join(WS, MANIFEST))) { console.error('not a workspace (no manifest):', WS); process.exit(1); }
const base = JSON.parse(readFileSync(join(WS, MANIFEST), 'utf8'));
const now = hashes(WS);
const changed = Object.keys(now).filter((f) => base[f] !== now[f]);
const removed = Object.keys(base).filter((f) => !(f in now));
const isShared = (f) => SHARED.some((re) => re.test(f));
const mainHash = (f) => (existsSync(join(ROOT, f)) ? sha(join(ROOT, f)) : null);

const plan = { copy: [], shared: [], conflict: [], removed };
for (const f of changed) {
  const mine = mainHash(f);
  if (mine === now[f]) continue; // this project already has exactly this version (e.g. merged earlier, or the same vendored file added twice)
  const clean = mine === null || mine === base[f]; // untouched here since the workspace was created (or a new file)
  if (!clean) plan.conflict.push(f);
  else if (isShared(f)) plan.shared.push(f);
  else plan.copy.push(f);
}

const show = (title, list) => list.length && console.log(`\n${title} (${list.length})\n  ` + list.join('\n  '));
show('clean — copied back by `merge --apply`', plan.copy);
show('SHARED — merge by hand (diff the workspace file against this project\'s)', plan.shared);
show('CONFLICT — changed here as well since the workspace was created', plan.conflict);
show('removed in the workspace (not applied)', plan.removed);
if (!changed.length && !removed.length) console.log('no changes');

if (cmd === 'merge' && flags.includes('--apply')) {
  for (const f of plan.copy) {
    mkdirSync(dirname(join(ROOT, f)), { recursive: true });
    cpSync(join(WS, f), join(ROOT, f));
  }
  console.log(`\ncopied ${plan.copy.length} file(s) into ${ROOT}`);
}
