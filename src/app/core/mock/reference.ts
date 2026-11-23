/**
 * The reference lists of the mock pages (products, teams, tags, steps of each group, sample texts, branches, currencies …) as documents of the
 * shared Datasource: `ref.<page>.json` = `{ "<list>": <value>, … }`. A mock wraps the list it has in the code:
 *
 *     const TAGS = reference('activities.tags', [{ id: 1, code: 'VIP', … }, …]);
 *
 * and gets the list of the document when the file server has one (the same lists for every developer, edited by hand), else the list of the
 * code. A list of the document is used only when it FITS the one of the code (same kind of value; every row has the fields of the first row of the
 * code, except where it has null (and a null of the document stands for a missing text / number); an object keeps every key) — else it is told about once and the code's list stays. Lists are read when a module loads, which is after the
 * Datasource was read (the page modules are lazy), so a mock never keeps one at the top of a module that loads before the app starts.
 *
 * A list whose rows are not alike (a tree with a different kind of node at each level) passes its own check as the 4th argument instead of the
 * "fits" rule: `reference(name, builtIn, undefined, (doc) => …)`.
 *
 * `npm run mockup:seed` writes the lists of the code as the documents (`referenceDefaults`). Framework-free.
 */
import { datasourceDoc } from '../mockup/mockup-datasource';
import { SEED_GROUPS, type SeedGroup } from './crm-seed';

/** a list that holds objects of the code (the groups of a product) is saved as plain data and rebuilt on reading */
export interface ReferenceCodec<T> {
  encode(value: T): unknown;
  decode(json: unknown): T;
}

const DOC_PREFIX = 'ref.';
const registry = new Map<string, unknown>();
const ownChecks = new Map<string, (doc: unknown) => boolean>();
const told = new Set<string>();

const copy = <T>(value: T): T => JSON.parse(JSON.stringify(value)) as T;
const isObject = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);

const kindOf = (v: unknown): string => (v === null ? 'null' : Array.isArray(v) ? 'array' : typeof v);

/**
 * whether the value of a document can take the place of the one of the code (see the header). A list of one kind of value is a list of rows that
 * each fit the first row; a list of mixed values (`['OPP-1', 'name', 80, …]`) is a row of fixed places: the document's must have at least those places, each fitting.
 */
export function fits(builtIn: unknown, doc: unknown): boolean {
  if (Array.isArray(builtIn)) {
    if (!Array.isArray(doc)) return false;
    if (new Set(builtIn.map(kindOf)).size > 1) return doc.length >= builtIn.length && builtIn.every((v, i) => fits(v, doc[i]));
    const first = builtIn[0];
    return first === undefined || doc.every((row) => fits(first, row));
  }
  if (isObject(builtIn)) return isObject(doc) && Object.keys(builtIn).every((k) => k in doc && fits(builtIn[k], doc[k]));
  // a null in the code's row (no avatar, no attachment …) says nothing about what the other rows hold; a null in the document's row is "no value" of text / number / yes-no
  if (builtIn === null) return true;
  if (doc === null) return ['string', 'number', 'boolean'].includes(typeof builtIn);
  return typeof builtIn === typeof doc;
}

/** the list `name` (`<page>.<list>`): the one of the Datasource when it fits, else `builtIn` */
export function reference<T>(name: string, builtIn: T, codec?: ReferenceCodec<T>, accept?: (doc: unknown) => boolean): T {
  const encoded = codec ? codec.encode(builtIn) : builtIn;
  registry.set(name, copy(encoded));
  if (accept) ownChecks.set(name, accept);
  const [page, ...rest] = name.split('.');
  const raw = (datasourceDoc(`${DOC_PREFIX}${page}`) as Record<string, unknown> | undefined)?.[rest.join('.')];
  if (raw === undefined) return builtIn;
  if (!(accept ? accept(raw) : fits(copy(encoded), raw))) {
    if (!told.has(name)) console.warn(`ref.${page}.json: "${rest.join('.')}" does not fit the list of the code (kind of value, or a field / key is missing) — the built-in list is used instead.`);
    told.add(name);
    return builtIn;
  }
  return codec ? codec.decode(copy(raw)) : copy(raw as T);
}

/**
 * A text a mock answers with (an error message, a refusal …): the one `ref.messages.json` gives for that text, else the text itself.
 * The document is `{ "<the text of the code>": "<the text to show>" }` — written by `npm run mockup:seed`, which finds every `msg('…')` of the
 * mocks, so a message is changed by editing its right-hand side. Used at the moment of the answer, not at load.
 */
export function msg(text: string, ...args: unknown[]): string {
  const doc = datasourceDoc<Record<string, unknown>>(`${DOC_PREFIX}messages`);
  const replacement = isObject(doc) ? doc[text] : undefined;
  const shown = typeof replacement === 'string' && replacement !== '' ? replacement : text;
  // `{0}`, `{1}` … stand for the values the mock puts in (a name, a count); the replacement keeps them where it wants them
  return args.length === 0 ? shown : shown.replace(/\{(\d+)\}/g, (whole, index: string) => (Number(index) < args.length ? String(args[Number(index)]) : whole));
}

/** the lists of the code that the modules loaded so far have asked for, as the documents to write: `{ page: { list: value } }` */
export function referenceDefaults(): Record<string, Record<string, unknown>> {
  const docs: Record<string, Record<string, unknown>> = {};
  for (const [name, value] of [...registry.entries()].sort(([a], [b]) => a.localeCompare(b))) {
    const [page, ...rest] = name.split('.');
    (docs[page] ??= {})[rest.join('.')] = value;
  }
  return docs;
}

/**
 * the lists whose own default, written out as a document and read back, would NOT be accepted (so a page would silently keep the list of the
 * code although the Datasource has a document) — must be empty; the test of the export looks at it. Lists that gave their own check use it.
 */
export function referenceNotAcceptingThemselves(): string[] {
  return [...registry.entries()]
    .filter(([name, value]) => !(ownChecks.get(name) ?? ((doc: unknown) => fits(copy(value), doc)))(copy(value)))
    .map(([name]) => name);
}

/** for the tests: forget what was asked for */
export function resetReferenceRegistry(): void {
  registry.clear();
  ownChecks.clear();
  told.clear();
}

/** products hold the activity groups they use (objects of SEED_GROUPS): saved as the ids, so a rename in `seed.org.json` still shows */
export function productsCodec<P extends { groups: SeedGroup[] }>(): ReferenceCodec<P[]> {
  return {
    encode: (products) => products.map(({ groups, ...rest }) => ({ ...rest, groupIds: groups.map((g) => g.id) })),
    decode: (json) =>
      (json as (Omit<P, 'groups'> & { groupIds: number[] })[]).map(({ groupIds, ...rest }) => ({ ...rest, groups: groupIds.flatMap((id) => SEED_GROUPS.find((g) => g.id === id) ?? []) }) as unknown as P),
  };
}
