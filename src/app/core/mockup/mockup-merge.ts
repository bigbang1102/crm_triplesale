/**
 * A three-way merge of two versions of one JSON document that were both made from the same earlier version: what the page changed (`ours`) and what
 * somebody else saved in the meantime (`theirs`), both measured against `base`, the version the page last knew. The result keeps the changes of BOTH, record
 * by record — so two people who each add or edit a different record of the same saved state (a quotation, a customer of the shared database) do not
 * overwrite each other, and only a change of the very same field is decided: the page that saves last wins it.
 *
 *   - an object is merged key by key (a key one side removed goes, unless the other side changed it);
 *   - a list of records that each have a key (`id`, `code`, `no` …) is merged by that key: added records are all kept, a removed record goes, a record both
 *     changed is merged again inside;
 *   - any other list is a heap of values: what the page added is added, what it removed is removed;
 *   - the Map / Set of `serialize()` (`{ $map }`, `{ $set }`) are merged as maps / sets;
 *   - a plain value: the page's when it changed it, else the other's.
 *
 * Framework-free and pure.
 */
type Json = unknown;
const isObject = (v: Json): v is Record<string, Json> => typeof v === 'object' && v !== null && !Array.isArray(v);
const same = (a: Json, b: Json): boolean => JSON.stringify(a) === JSON.stringify(b);
/** the field that names a record of a list, in the order it is looked for */
const KEYS = ['id', 'code', 'no', 'docNo', 'txNo', 'key'] as const;

function keyField(lists: Json[][]): string | undefined {
  const all = lists.flat();
  if (all.length === 0 || !all.every(isObject)) return undefined;
  return KEYS.find((k) => all.every((r) => (r as Record<string, Json>)[k] !== undefined && typeof (r as Record<string, Json>)[k] !== 'object'));
}

function mergeKeyed(base: Json[], ours: Json[], theirs: Json[], field: string): Json[] {
  const byKey = (list: Json[]): Map<string, Json> => new Map(list.map((r) => [String((r as Record<string, Json>)[field]), r]));
  const b = byKey(base);
  const o = byKey(ours);
  const t = byKey(theirs);
  const out: Json[] = [];
  const seen = new Set<string>();
  // theirs first (the order everybody else sees), then what only the page added
  for (const [key, theirRecord] of t) {
    seen.add(key);
    if (o.has(key)) out.push(merge(b.get(key), o.get(key), theirRecord));
    else if (b.has(key) && same(b.get(key), theirRecord)) continue; // the page removed it and nobody else touched it
    else out.push(theirRecord); // the page removed it but somebody else changed it: the change stays
  }
  for (const [key, ourRecord] of o) {
    if (seen.has(key)) continue;
    // added by the page — or removed by somebody else after the page changed it (the change stays)
    if (!b.has(key) || !same(b.get(key), ourRecord)) out.push(ourRecord);
  }
  return out;
}

function mergeHeap(base: Json[], ours: Json[], theirs: Json[]): Json[] {
  const count = (list: Json[]): Map<string, number> => {
    const m = new Map<string, number>();
    for (const v of list) m.set(JSON.stringify(v), (m.get(JSON.stringify(v)) ?? 0) + 1);
    return m;
  };
  const b = count(base);
  const o = count(ours);
  const removed = new Map<string, number>();
  const added: Json[] = [];
  for (const [k, n] of b) if ((o.get(k) ?? 0) < n) removed.set(k, n - (o.get(k) ?? 0));
  const addedCount = new Map<string, number>();
  for (const [k, n] of o) if (n > (b.get(k) ?? 0)) addedCount.set(k, n - (b.get(k) ?? 0));
  const out: Json[] = [];
  for (const v of theirs) {
    const k = JSON.stringify(v);
    const r = removed.get(k) ?? 0;
    if (r > 0) removed.set(k, r - 1);
    else out.push(v);
  }
  for (const v of ours) {
    const k = JSON.stringify(v);
    const a = addedCount.get(k) ?? 0;
    if (a > 0) {
      addedCount.set(k, a - 1);
      added.push(v);
    }
  }
  return [...out, ...added];
}

/** a Map of `serialize()` as an object by the text of its keys, and back */
const mapEntries = (m: Json): Array<[Json, Json]> => (isObject(m) && Array.isArray(m['$map']) ? (m['$map'] as Array<[Json, Json]>) : []);
const setValues = (s: Json): Json[] => (isObject(s) && Array.isArray(s['$set']) ? (s['$set'] as Json[]) : []);

function mergeObjects(base: Record<string, Json>, ours: Record<string, Json>, theirs: Record<string, Json>): Record<string, Json> {
  const out: Record<string, Json> = {};
  const keys = new Set([...Object.keys(theirs), ...Object.keys(ours), ...Object.keys(base)]);
  for (const key of keys) {
    const b = base[key];
    const o = ours[key];
    const t = theirs[key];
    if (o === undefined && t === undefined) continue; // gone on both sides
    if (o === undefined) {
      if (b === undefined || !same(b, t)) out[key] = t; // the page removed it: it goes, unless somebody else changed it
    } else if (t === undefined) {
      if (b === undefined || !same(b, o)) out[key] = o; // somebody else removed it: it goes, unless the page changed it
    } else out[key] = merge(b, o, t);
  }
  return out;
}

/** the merge of one value (see the header); `base` undefined = the value is new */
export function merge(base: Json, ours: Json, theirs: Json): Json {
  if (same(ours, base)) return theirs; // the page did not change it
  if (same(theirs, base) || same(ours, theirs)) return ours;
  if (isObject(ours) && isObject(theirs)) {
    const b = isObject(base) ? base : {};
    if ('$map' in ours || '$map' in theirs) {
      const asObject = (m: Json): Record<string, Json> => Object.fromEntries(mapEntries(m).map(([k, v]) => [JSON.stringify(k), [k, v]]));
      const merged = mergeObjects(asObject(b), asObject(ours), asObject(theirs));
      return { $map: Object.values(merged) };
    }
    if ('$set' in ours || '$set' in theirs) return { $set: mergeHeap(setValues(b), setValues(ours), setValues(theirs)) };
    return mergeObjects(b, ours, theirs);
  }
  if (Array.isArray(ours) && Array.isArray(theirs)) {
    const b = Array.isArray(base) ? base : [];
    const field = keyField([b, ours, theirs]);
    return field ? mergeKeyed(b, ours, theirs, field) : mergeHeap(b, ours, theirs);
  }
  return ours; // both changed a plain value (or its kind): the page that saves last wins
}
