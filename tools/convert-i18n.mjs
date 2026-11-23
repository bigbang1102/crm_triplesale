#!/usr/bin/env node
/**
 * Converts the Java frontend's `.properties` dictionaries into JSON for the Angular app.
 *
 *   node tools/convert-i18n.mjs [path/to/triple_sale_main/src/java]
 *
 * Input  : messages_{th,en}.properties      -> public/assets/i18n/{th,en}.json
 *          masterdata_{th,en}.properties    -> public/assets/i18n/master-data.{th,en}.json
 * The parser follows java.util.Properties (line continuation, \uXXXX escapes, `=` / `:` / space
 * separators) and also accepts raw UTF-8 values, like the Java `I18n` loader does.
 * Also copies `metro_geo.json` (the province / district / sub-district / post code table that MetroGeoServlet served) to
 * public/assets/data/metro-geo.json — the live backend of `/board/metro-geo` (core/live/board-master.live.ts) reads it as a static asset.
 * The text of th.json / en.json is reworded Lead -> Opportunity (tools/lib/i18n-terms.mjs; keys are untouched);
 *   `node tools/convert-i18n.mjs --rebrand-only` does just that to the committed files.
 * `messages_jp.properties` is intentionally ignored (broken stub, Japanese is not supported).
 */
import { copyFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { rebrand } from './lib/i18n-terms.mjs';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const src = resolve(process.argv.slice(2).find((a) => !a.startsWith('--')) ?? 'D:/Dev-Project/CRM_PROJECT/triple_sale_main/src/java');
const out = join(root, 'public', 'assets', 'i18n');

/** Parses the content of a .properties file into an object (insertion ordered). */
export function parseProperties(text) {
  const result = {};
  const rawLines = text.replace(/^\uFEFF/, '').split(/\r\n|\n|\r/);

  for (let i = 0; i < rawLines.length; i++) {
    let line = rawLines[i].replace(/^[ \t\f]+/, '');
    if (!line || line[0] === '#' || line[0] === '!') continue;

    // a trailing odd number of backslashes continues the logical line
    while (endsWithOddBackslashes(line) && i + 1 < rawLines.length) {
      line = line.slice(0, -1) + rawLines[++i].replace(/^[ \t\f]+/, '');
    }

    let k = 0;
    while (k < line.length) {
      const ch = line[k];
      if (ch === '\\') k += 2;
      else if (ch === '=' || ch === ':' || ch === ' ' || ch === '\t' || ch === '\f') break;
      else k++;
    }
    const key = unescape(line.slice(0, k));
    let rest = line.slice(k).replace(/^[ \t\f]+/, '');
    if (rest[0] === '=' || rest[0] === ':') rest = rest.slice(1).replace(/^[ \t\f]+/, '');
    result[key] = unescape(rest);
  }
  return result;
}

function endsWithOddBackslashes(s) {
  let n = 0;
  for (let i = s.length - 1; i >= 0 && s[i] === '\\'; i--) n++;
  return n % 2 === 1;
}

function unescape(s) {
  return s.replace(/\\(u[0-9a-fA-F]{4}|.)/gs, (_, c) => {
    if (c[0] === 'u' && c.length === 5) return String.fromCharCode(parseInt(c.slice(1), 16));
    switch (c) {
      case 't': return '\t';
      case 'n': return '\n';
      case 'r': return '\r';
      case 'f': return '\f';
      default: return c;
    }
  });
}

function convert(name, target) {
  let dict = parseProperties(readFileSync(join(src, name), 'utf8'));
  if (target === 'th.json' || target === 'en.json') dict = rebrand(dict); // Lead -> Opportunity in the text (not the keys): tools/lib/i18n-terms.mjs
  writeFileSync(join(out, target), JSON.stringify(dict), 'utf8');
  return dict;
}

if (import.meta.url === `file://${process.argv[1].replace(/\\/g, '/')}` || process.argv[1]?.endsWith('convert-i18n.mjs')) {
  mkdirSync(out, { recursive: true });
  if (process.argv.includes('--rebrand-only')) {
    // reword the committed th.json / en.json without reading the Java project (no other key is added or changed)
    for (const t of ['th.json', 'en.json']) {
      const file = join(out, t);
      const before = readFileSync(file, 'utf8');
      const after = JSON.stringify(rebrand(JSON.parse(before)));
      if (after !== before) writeFileSync(file, after, 'utf8');
      console.log(`${t}: ${after === before ? 'already reworded' : 'reworded'}`);
    }
    process.exit(0);
  }
  const th = convert('messages_th.properties', 'th.json');
  const en = convert('messages_en.properties', 'en.json');
  const mdTh = convert('masterdata_th.properties', 'master-data.th.json');
  const mdEn = convert('masterdata_en.properties', 'master-data.en.json');

  const onlyTh = Object.keys(th).filter((k) => !(k in en));
  const onlyEn = Object.keys(en).filter((k) => !(k in th));
  console.log(`messages   th=${Object.keys(th).length}  en=${Object.keys(en).length}`);
  console.log(`masterdata th=${Object.keys(mdTh).length}  en=${Object.keys(mdEn).length}`);
  console.log(`keys only in th: ${onlyTh.length}, only in en: ${onlyEn.length}`);
  if (onlyTh.length || onlyEn.length) console.log('  ', [...onlyTh, ...onlyEn].slice(0, 10).join(', '));
  if (existsSync(join(src, 'metro_geo.json'))) {
    mkdirSync(join(root, 'public', 'assets', 'data'), { recursive: true });
    copyFileSync(join(src, 'metro_geo.json'), join(root, 'public', 'assets', 'data', 'metro-geo.json'));
    console.log('metro_geo.json -> public/assets/data/metro-geo.json');
  }
  console.log(`written to ${out}`);
}
