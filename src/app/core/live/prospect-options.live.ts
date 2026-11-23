/**
 * The options of the filter popup of the Prospects list, answered from `GET /api/v1/prospects/options` (SD-2) instead of the master-data
 * servlets of the old board (`/board/provinces`, `/board/districts`, `/board/sale-persons`, `type=countries`): there the ids are numbers, here
 * they are uuids — the ones `GET /api/v1/prospects` takes as `currentProvinceId` / `currentDistrictId` / `responsibleEmployeeId`.
 *
 *   /board/prospect-options?set=provinces                     sets=provinces
 *   /board/prospect-options?set=districts&provinceId=<uuid>   sets=districts&provinceId=…
 *   /board/prospect-options?set=countries                     sets=countries
 *   /board/prospect-options?set=responsibleFilter             sets=responsibleFilter   (the "Agent" select: who is responsible)
 *
 *   /board/employees                                          sets=responsibles        (the owners of the create-OPP window)
 *   /board/prospect-options?set=waitlists                     sets=waitlists          (the queues a prospect can be sent to)
 *   /board/sale-persons                                       sets=salePersons         (the owner select of the detail panel, the create-OPP window)
 *   /board/prospect-options?set=marketingChannels             sets=marketingChannels   (the source chips; `/board/chat-master-data?type=marketing-channels` is the same)
 *
 * A route of its own (not a replacement of `/board/provinces` …) because the other pages and the "create OPP" window of this page still need
 * the numeric ids of the old master data. The answer is a bare array of `{ id, code?, name }` (what the select of the popup reads).
 */
import { onClearOptionCache, optionKey, readOptions, writeOptions } from './options-cache';
import { isArr, isObj, optString, type JObj } from './org-json';
import { get, jsonResponse, textResponse, type RestDeps, type RouteHandler } from './rest';

/** the sets the popup asks for → the `sets` the service knows */
const SETS: Readonly<Record<string, string>> = {
  provinces: 'provinces',
  districts: 'districts',
  countries: 'countries',
  marketingChannels: 'marketingChannels',
  responsibleFilter: 'responsibleFilter',
  responsibles: 'responsibles',
  salePersons: 'salePersons',
  waitlists: 'waitlists',
  salesLines: 'salesLines',
};

/**
 * The list inside `result`: the result itself, `result.<set>`, or either of those as a page `{ items | data | rows | content: [...] }`. The service
 * is not documented beyond a draft, so the usual wrappers are all accepted.
 */
function rowsOf(result: unknown, set: string): unknown[] {
  const listIn = (v: unknown): unknown[] | null => {
    if (isArr(v)) return v;
    if (isObj(v)) for (const k of ['items', 'data', 'rows', 'content', 'list']) if (isArr(v[k])) return v[k] as unknown[];
    return null;
  };
  const direct = listIn(result);
  if (direct) return direct;
  if (isObj(result)) {
    const named = listIn(result[set]);
    if (named) return named;
    // a single set asked: the only list in the object, whatever its key
    const lists = Object.values(result).map(listIn).filter((l): l is unknown[] => l !== null);
    if (lists.length === 1) return lists[0];
  }
  return [];
}

/** the rows of one set of the answer: `result.<set>[]` (what a service that answers several sets sends), or `result[]` for a single one */
export function optionRows(json: unknown, set: string): JObj[] {
  if (!isObj(json)) return [];
  const rows = rowsOf(json['result'], set);
  const out: JObj[] = [];
  for (const r of rows) {
    if (!isObj(r)) continue;
    const id = optString(r, 'id', '').trim();
    if (id === '') continue;
    const item: JObj = { id, name: optString(r, 'name', '') };
    const code = optString(r, 'code', '');
    if (code !== '') item['code'] = code;
    // a sale person says which employee (= responsible person) it is: `employeeId`, or `employee.id`
    const emp = optString(r, 'employeeId', '') || (isObj(r['employee']) ? optString(r['employee'] as JObj, 'id', '') : '');
    if (emp !== '') item['employeeId'] = emp;
    // what the forms read when the service has it (the country list: the Thai name, the dial code and the number format)
    for (const key of ['nameTh', 'phoneCountryCode', 'phoneNumberFormat']) {
      const v = optString(r, key, '');
      if (v !== '') item[key] = v;
    }
    out.push(item);
  }
  return out;
}

/**
 * One set of `GET /prospects/options`, with the session cache: `{ ok, rows }`, or `{ ok: false, status }` when the service did not answer 2xx (0 = no
 * answer). `params` narrows it (`provinceId` of the districts, `districtId` of the sub-districts); the cache is per set and per narrowing.
 */
export async function fetchOptionRows(deps: RestDeps, sets: string, params: Record<string, string> = {}): Promise<{ ok: true; rows: JObj[] } | { ok: false; status: number }> {
  const q: Record<string, string> = { sets, ...params };
  const key = optionKey(deps, sets, params['provinceId'] ?? params['districtId'] ?? '');
  const kept = readOptions<JObj>(key) ?? IN_MEMORY.get(key) ?? null;
  if (kept) return { ok: true, rows: kept };
  // a list that came EMPTY is not asked again until `retryEmptyOptions()` (a new visit of the page, or the opening of the window that shows it): the
  // parts of one page that ask for it one after the other do not each go to the service. In memory only, never in the storage
  if (EMPTY.has(key)) return { ok: true, rows: [] };
  // the same list asked (several parts of a page ask for the countries at once) shares that one call
  const running = IN_FLIGHT.get(key);
  if (running) return running;
  const call = (async (): Promise<{ ok: true; rows: JObj[] } | { ok: false; status: number }> => {
    const u = await get(deps, '/prospects/options', q);
    if (!u.ok) return { ok: false, status: u.status };
    const rows = optionRows(u.json, sets);
    writeOptions(key, rows);
    if (rows.length > 0) IN_MEMORY.set(key, rows); // when the storage is blocked or full the page still does not ask twice
    else {
      EMPTY.add(key);
      warnNoRows(sets, u.json);
    }
    return { ok: true, rows };
  })().finally(() => IN_FLIGHT.delete(key));
  IN_FLIGHT.set(key, call);
  return call;
}

/** the keys of the lists that came empty (200 and no rows) */
const EMPTY = new Set<string>();

/** the moment to try the empty lists again: a page is entered, or a window that needs them is opened (a list with rows is not touched) */
export function retryEmptyOptions(): void {
  EMPTY.clear();
}

/** the lists of this page load, by the key of the cache (the storage may refuse them) */
const IN_MEMORY = new Map<string, JObj[]>();
onClearOptionCache(() => {
  IN_MEMORY.clear();
  EMPTY.clear();
});

/** an answer that said 200 and gave no rows: not an error for the page, but worth a line in the console (the NAMES of the keys only, never the data) */
function warnNoRows(sets: string, json: unknown): void {
  const result = isObj(json) ? json['result'] : undefined;
  const shape = isArr(result) ? 'array(0)' : isObj(result) ? `{ ${Object.keys(result).join(', ')} }` : typeof result;
  console.warn(`[prospects/options] sets=${sets}: 200 but no rows read; result is ${shape}`);
}

/** the calls on their way, by the key of the cache */
const IN_FLIGHT = new Map<string, Promise<{ ok: true; rows: JObj[] } | { ok: false; status: number }>>();

/**
 * Several sets in ONE call (`GET /prospects/options?sets=a,b,c`): what the create-OPP window asks when it opens. Sets already kept (the session, or an empty
 * answer remembered) are not asked; the others go together in one request. `{ ok, byset }`: the rows of every set asked.
 */
export async function fetchOptionSets(
  deps: RestDeps,
  sets: readonly string[],
  params: Record<string, string> = {},
): Promise<{ ok: true; byset: Record<string, JObj[]> } | { ok: false; status: number }> {
  // `salesLineId` narrows the people to those of one sales line: its lists are kept apart (per line)
  const scope = params['salesLineId'] ?? '';
  const byset: Record<string, JObj[]> = {};
  const missing: string[] = [];
  for (const set of sets) {
    const key = optionKey(deps, set, scope);
    const kept = readOptions<JObj>(key) ?? IN_MEMORY.get(key);
    if (kept) byset[set] = kept;
    else if (EMPTY.has(key)) byset[set] = [];
    else missing.push(set);
  }
  if (missing.length > 0) {
    const u = await get(deps, '/prospects/options', { sets: missing.join(','), ...params });
    if (!u.ok) return { ok: false, status: u.status };
    for (const set of missing) {
      const rows = optionRows(u.json, set);
      byset[set] = rows;
      const key = optionKey(deps, set, scope);
      writeOptions(key, rows);
      if (rows.length > 0) IN_MEMORY.set(key, rows);
      else EMPTY.add(key);
    }
  }
  return { ok: true, byset };
}

/** the form's `GET /master-data/<name>?<query>` → the options request that replaces it (null: not one of those lists, it stays what it was) */
export function optionsRequestOf(pathAndQuery: string): { sets: string; params: Record<string, string> } | null {
  const [name, query = ''] = pathAndQuery.split('?');
  const q = new URLSearchParams(query);
  const sets: Readonly<Record<string, string>> = {
    countries: 'countries',
    provinces: 'provinces',
    districts: 'districts',
    'sub-districts': 'subdistricts',
    'business-types': 'businessTypes',
    occupations: 'occupations',
    'marketing-channels': 'marketingChannels',
    'communication-types': 'communicationTypes',
    'sale-persons': 'salePersons',
  };
  if (!Object.hasOwn(sets, name)) return null;
  const params: Record<string, string> = {};
  if (name === 'districts') params['provinceId'] = (q.get('provinceId') ?? '').trim();
  if (name === 'sub-districts') params['districtId'] = (q.get('districtId') ?? '').trim();
  return { sets: sets[name], params };
}

export function prospectOptionRoutes(deps: RestDeps): RouteHandler {
  return async (path, query) => {
    // the source chips used to come from `/board/chat-master-data?type=marketing-channels` (= /master-data/marketing-channels, gone: 404)
    // the owners of the create-OPP window used to come from `/board/employees` (= /master-data/employees, gone): the same people, from `options`
    // the products of the create-OPP window (`/board/movement-types` = /master-data/movement-types/LD) are the old model of an opportunity: no call, no products
    if (path === '/board/movement-types') return textResponse(200, '[]');
    const employees = path === '/board/employees';
    // the provinces of the board filters used to come from `/board/provinces` (= /master-data/provinces, gone: 404): the same list, from `options`
    const provinces = path === '/board/provinces';
    // the sale persons (the owner select of the detail panel, the create-OPP window) used to come from `/board/sale-persons` (= /master-data/sale-persons, gone: 404)
    const salePersons = path === '/board/sale-persons';
    const chat = path === '/board/chat-master-data' && (query.get('type') ?? '').trim() === 'marketing-channels';
    // the step groups and their people belong to the old model of an opportunity (a product, then a group of steps): no call, nothing to choose
    if (path === '/board/master/activity-groups' || path === '/board/master/employees-by-activity-group') return jsonResponse(200, { status: 200, result: [] });
    // several sets at once: `?sets=salesLines,responsibles,waitlists,salePersons` -> { salesLines: [...], responsibles: [...], ... }, one request to the service
    const several = path === '/board/prospect-options' ? (query.get('sets') ?? '').split(',').map((x) => x.trim()).filter((x) => x !== '') : [];
    if (several.length > 0) {
      if (several.some((x) => !Object.hasOwn(SETS, x))) return jsonResponse(400, { status: 400, message: 'invalid sets' });
      const lineId = (query.get('salesLineId') ?? '').trim();
      const got = await fetchOptionSets(deps, several.map((x) => SETS[x]), lineId === '' ? {} : { salesLineId: lineId });
      if (!got.ok) return jsonResponse(got.status === 0 ? 502 : got.status, { status: got.status, message: 'options failed' });
      return jsonResponse(200, got.byset);
    }
    if (path !== '/board/prospect-options' && !chat && !employees && !salePersons && !provinces) return null;
    const set = provinces ? 'provinces' : employees ? 'responsibles' : salePersons ? 'salePersons' : chat ? 'marketingChannels' : (query.get('set') ?? '').trim();
    const sets = Object.hasOwn(SETS, set) ? SETS[set] : '';
    if (sets === '') return jsonResponse(400, { status: 400, message: 'invalid set (provinces|districts|countries|marketingChannels|responsibleFilter|responsibles|salePersons|waitlists|salesLines)' });
    const params: Record<string, string> = {};
    if (set === 'districts') {
      const province = (query.get('provinceId') ?? '').trim();
      if (province === '') return textResponse(200, '[]'); // the districts depend on the province
      params['provinceId'] = province;
    }
    // kept for the session: a list that came with something in it is not asked again (by this page or another that needs it)
    const got = await fetchOptionRows(deps, sets, params);
    // a failed call is an error for the page (it logs it and leaves the select with "all"), not an empty list that looks like "no options"
    if (!got.ok) return jsonResponse(got.status === 0 ? 502 : got.status, { status: got.status, message: 'options failed' });
    return textResponse(200, JSON.stringify(got.rows));
  };
}
