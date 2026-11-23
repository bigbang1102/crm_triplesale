#!/usr/bin/env node
/**
 * Puts the pictures this project draws differently from the Java original over the copies the generators made.
 *
 *   npm run images:override
 *
 *   tools/overrides/images/<p>   ->   public/assets/images/<p>
 *
 * Every `npm run <page>:sync` copies `web/images/<p>` of the Java project byte for byte, so a sync puts the Java picture back: run this after it.
 * The only overrides today: `icon/default_avatar.svg` and `default_avatar.svg` (the default picture of a person without one — grey ring, white head and shoulders), used by every page.
 */
import { copyFileSync, mkdirSync, readdirSync, statSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const from = join(root, 'tools/overrides/images');
const to = join(root, 'public/assets/images');

const files = [];
(function walk(dir) {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) walk(p);
    else files.push(p);
  }
})(from);
for (const f of files) {
  const dest = join(to, relative(from, f));
  mkdirSync(dirname(dest), { recursive: true });
  copyFileSync(f, dest);
}
console.log(`image overrides applied: ${files.map((f) => relative(from, f)).join(', ')}`);
