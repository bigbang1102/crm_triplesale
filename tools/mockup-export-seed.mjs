#!/usr/bin/env node
/**
 * `npm run mockup:export-seed`: writes the cast of the mock pages as documents of the Datasource, so the file server (the one every developer
 * shares) holds the data the pages show, and a person can edit it. The app reads them back in core/mockup/mockup-bootstrap.ts:
 *   Datasource/seed.crm.json    the customers and the leads that `core/mock/crm-seed.ts` makes from its formulas   (setCastDocument)
 *   Datasource/seed.org.json    the employees, the activity groups, who is in each group, which positions each employee holds, the pools of names / provinces / sources   (setOrgDocument)
 *   Datasource/seed.roles.json  the catalog of roles: the permissions in their groups, the standard roles, the example positions, the positions of the chart   (setRoleCatalog)
 *   Datasource/ref.<page>.json  the reference lists of each page mock (products, teams, tags, steps of each group, sample texts …)   (core/mock/reference.ts)
 *   Datasource/ref.messages.json  every text a mock answers with (`msg('…')`: errors, refusals): { "<text of the code>": "<text to show>" }   (msg in core/mock/reference.ts)
 *
 *   node tools/mockup-export-seed.mjs <folder>      (no default folder: the data lives on the shared file server — see tools/mockup-sync-seed.mjs)
 *
 * The seeds are TypeScript: they are bundled in memory with esbuild (already in node_modules for Angular) and run here.
 */
import { build } from 'esbuild';
import { mkdir, mkdtemp, readFile, readdir, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');

/** the page mocks that ask for reference lists (core/mock/reference.ts): loading them is what registers the lists */
const REFERENCE_MODULES = [
  'core/mock/schedule-seed',
  'features/home/home.mock',
  'features/activities/activities.mock',
  'features/opportunities/opportunities.mock',
  'features/opportunity-detail/opportunity-detail.mock',
  'features/receipts/receipts.mock',
  'features/sales-docs/form/sales-doc.mock',
  'features/report/report.mock',
  'features/dashboard/dashboard.mock',
  'features/drilldown/drilldown.mock',
  'features/ai/translator/translator.mock',
  'features/ai/ai-hub/ai-hub.mock.more',
  'features/settings/settings.mock',
  'features/settings/settings.config.mock',
  'features/prospects/prospects.mock',
  'features/prospects/form/prospect-form.mock',
  'features/ai/ai-hub/ai-hub.mock',
  'features/leads/leads.options',
  'features/settings/settings.master-mock',
  'core/http/mock-countries',
  'layout/ai-fab/ai-fab.mock',
];

/** the page mocks that ask for their lists only when they build their data: a function of each that does it (see `registerReferenceLists`) */
const REGISTERING_MODULES = ['core/http/auth-api.mock', 'features/forecast/forecast.mock', 'features/chat/chat.mock', 'features/supporting-docs/supporting-doc.mock', 'features/leads/leads.mock'];

/** the document for the cast: `{ prospects: [...], leads: [...] }` with only the fields the pages cannot work out from the others */
export function castDocument(seed) {
  const prospects = Array.from({ length: seed.SEED_PROSPECT_COUNT }, (_x, i) => {
    const { id, code, firstName, lastName, fullName, phone, email, province, source, createdDate } = seed.seedProspect(i + 1);
    return { id, code, firstName, lastName, fullName, phone, email, province, source, createdDate };
  });
  const leads = Array.from({ length: seed.SEED_LEAD_COUNT }, (_x, i) => {
    const { id, code, prospectId, ownerCode, groupIdx, interest, status, createdDate, lastContactDate, amount } = seed.seedLead(i + 1);
    return { id, code, prospectId, ownerCode, groupIdx, interest, status, createdDate, lastContactDate, amount };
  });
  return { prospects, leads };
}

/** the document for the people: the lists as the code has them */
export function orgDocument(seed) {
  return {
    employees: seed.SEED_EMPLOYEES.map(({ code, name, team, role }) => ({ code, name, team, role })),
    groups: seed.SEED_GROUPS.map(({ id, code, name }) => ({ id, code, name })),
    groupMembers: Object.fromEntries(Object.entries(seed.SEED_GROUP_MEMBERS).map(([id, codes]) => [id, [...codes]])),
    employeePositions: Object.fromEntries(Object.entries(seed.SEED_EMPLOYEE_POSITIONS).map(([code, list]) => [code, [...list]])),
    names: { firstNames: [...seed.SEED_FIRST_NAMES], lastNames: [...seed.SEED_LAST_NAMES], provinces: [...seed.SEED_PROVINCES], sources: [...seed.SEED_SOURCES] },
  };
}

async function loadSeed() {
  const app = join(root, 'src', 'app').split('\\').join('/');
  const mock = `${app}/core/mock`;
  const loads = REFERENCE_MODULES.map((m, i) => `import * as ref${i} from '${app}/${m}.ts'; void ref${i};`).join(' ');
  const registers = REGISTERING_MODULES.map((m, i) => `import { registerReferenceLists as register${i} } from '${app}/${m}.ts'; register${i}();`).join(' ');
  const entry = `${loads} ${registers} export * from '${mock}/crm-seed.ts'; export { SEED_GROUP_MEMBERS } from '${mock}/activity-group-seed.ts'; export { SEED_EMPLOYEE_POSITIONS } from '${mock}/role-store.ts'; export { referenceDefaults } from '${mock}/reference.ts'; export { ROLE_CATALOG } from '${app}/core/permissions/role-model.ts';`;
  const out = await build({ stdin: { contents: entry, resolveDir: root, loader: 'ts' }, bundle: true, platform: 'node', format: 'esm', write: false, logLevel: 'error' });
  const dir = await mkdtemp(join(tmpdir(), 'mockup-seed-'));
  const file = join(dir, 'seed.mjs');
  await writeFile(file, out.outputFiles[0].text);
  return import(pathToFileURL(file).href);
}

/** every `msg('…')` text of the sources (the mocks), in order of appearance without repeats: { text: text } */
export async function messagesDocument(dir = join(root, 'src', 'app')) {
  const found = new Map();
  const walk = async (folder) => {
    for (const entry of await readdir(folder, { withFileTypes: true })) {
      const path = join(folder, entry.name);
      if (entry.isDirectory()) await walk(path);
      else if (/\.ts$/.test(entry.name) && !/\.spec\.ts$/.test(entry.name)) {
        const text = await readFile(path, 'utf8');
        if (!/import \{[^}]*\bmsg\b[^}]*\} from '@core\/mock\/reference'/.test(text)) continue; // only the files that use the `msg` of the mocks
        for (const m of text.matchAll(/\bmsg\('((?:[^'\\\n]|\\.)*)'[,)]/g)) {
          const original = m[1].replace(/\\(['\\])/g, '$1');
          if (!found.has(original)) found.set(original, original);
        }
      }
    }
  };
  await walk(dir);
  return Object.fromEntries([...found.entries()].sort(([a], [b]) => a.localeCompare(b, 'th')));
}

/** every seed / reference document the code can make, by name: `{ 'seed.crm': …, 'seed.org': …, 'seed.roles': …, 'ref.<page>': …, 'ref.messages': … }` */
export async function seedDocuments() {
  const seed = await loadSeed();
  const docs = {
    'seed.crm': castDocument(seed),
    'seed.org': orgDocument(seed),
    'seed.roles': seed.ROLE_CATALOG,
  };
  for (const [page, lists] of Object.entries(seed.referenceDefaults())) docs[`ref.${page}`] = lists;
  docs['ref.messages'] = await messagesDocument();
  return docs;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  // the data of the mockup lives in ONE place — the shared file server (D:\mockup-data\Datasource behind https) — and is put there with
  // `npm run mockup:seed`. This command only writes the documents into a folder you name (to look at them, or to compare).
  if (!process.argv[2]) {
    console.error('Usage: node tools/mockup-export-seed.mjs <folder>   (writes the documents there; to put them on the shared file server use `npm run mockup:seed`)');
    process.exit(1);
  }
  const folder = resolve(process.argv[2]);
  await mkdir(folder, { recursive: true });
  const docs = await seedDocuments();
  for (const [name, doc] of Object.entries(docs)) await writeFile(join(folder, `${name}.json`), JSON.stringify(doc, null, 2) + '\n');
  console.log(`${folder}: ${Object.keys(docs).length} documents`);
}
