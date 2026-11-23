/**
 * The board of the Opportunities page from the new service: `GET /api/v1/opportunities?opportunityConfigId=&view=BOARD&tab=ALL`.
 *
 * The page script keeps asking the addresses of the Java page; two of them are answered from the new service here:
 *
 *   GET /board/master/movement-types?type=LD   → the sales lines of `GET /prospects/options?sets=salesLines`, as the envelope the page reads
 *                                                 ({ status: 200, result: { items: [{ id, code, name }] } }): the "products" of the page
 *   GET /board/leads?viewMode=board&movementTypeId=<id>…
 *                                              → GET /opportunities?opportunityConfigId=<id>&view=BOARD&tab=ALL&closed=<false|true>   (the board; closed=true only when the filter's switch of closed opportunities is on)
 *
 * `opportunityConfigId` is the sales line the page chose; the first sales line when it has none yet (the first paint).
 *
 * The board answers `result.columns[] = { step: { id, name }, count, sumAmount, hasMore, cards: [] }` and `meta: { page, cardsPerColumn, maskedFields }` (seen on DEV).
 * The CARDS' fields are not known yet (the sample had none): they go through as the service sent them. Other shapes are read as a guess: `result` as a list (`result`, `result.items`, `result.data`,
 * `result.opportunities`) or as columns (`result.columns | stages | steps | kanban`, each with `items`), and gives the page the board it reads:
 * `{ kanban: [{ stepId, stepName, items: [...] }], summary }`. Cards are grouped by the first of `stepId | stageId | activityStepId` with the name
 * `stepName | stageName | activityStepName`; their fields go through as the service sent them. Check it against a real answer.
 */
import { localizeProspectLocation, opportunityErrorJson, ROLE_CRM_LEAD_VIEW } from './opportunity-core.live';
import { onClearOptionCache, optionKey, readOptions } from './options-cache';
import { rememberOpportunityVersion } from './opportunity-sale-person.live';
import { fetchOpportunitySchedules } from './opportunity-schedules.live';
import { askSets, FILTER_OPTION_SETS } from './sale-team.live';
import { fetchOptionRows } from './prospect-options.live';
import { errorMessage, get, jsonResponse, passThrough, service, textResponse, type RestDeps, type RouteHandler } from './rest';

type Obj = Record<string, unknown>;
const isObj = (v: unknown): v is Obj => v !== null && typeof v === 'object' && !Array.isArray(v);
const str = (v: unknown): string => (typeof v === 'string' || typeof v === 'number' ? String(v).trim() : '');
const first = (o: Obj, keys: readonly string[]): string => {
  for (const k of keys) {
    const v = str(o[k]);
    if (v !== '') return v;
  }
  return '';
};

/** the first sales line (the default `opportunityConfigId`); '' when there is none or the call failed */
export async function firstSalesLineId(deps: RestDeps): Promise<string> {
  const got = await fetchOptionRows(deps, 'salesLines');
  return got.ok && got.rows.length > 0 ? str(got.rows[0]['id']) : '';
}

/** the sales lines as the products of the page */
async function productsEnvelope(deps: RestDeps): Promise<Response> {
  const got = await fetchOptionRows(deps, 'salesLines');
  if (!got.ok) return jsonResponse(got.status === 0 ? 502 : got.status, { status: got.status, message: 'options failed' });
  const items = got.rows.map((r) => ({ id: r['id'], code: str(r['code']), name: str(r['name']) || str(r['code']) || str(r['id']) }));
  return jsonResponse(200, { status: 200, message: 'success', result: { items } });
}

const LIST_KEYS = ['items', 'data', 'opportunities', 'rows', 'content', 'list'] as const;
const COLUMN_KEYS = ['columns', 'stages', 'steps', 'kanban'] as const;
const CARD_KEYS = ['cards', 'items'] as const;

/** a text from a field that is a string, or an object `{ name | code }` (the service is not read one way yet) */
const label = (v: unknown): string => (isObj(v) ? first(v, ['name', 'nameTh', 'label', 'code']) : str(v));

/** a dial code with its "+" ("66" and "+66" are the same code: the service may leave the sign out); a masked or empty code is kept as it is */
export function dialCode(value: unknown): string {
  const text = str(value);
  return /^\d+$/.test(text.replace(/^\+/, '')) && text !== '' ? '+' + text.replace(/^\+/, '') : text;
}

/** the customer of the header with the names the page reads for the phone and the current address (what the customer already has under those names is kept) */
export function customerOf(prospect: Obj): Obj {
  const out: Obj = { ...prospect };
  const put = (key: string, value: string): void => {
    if (value !== '' && str(out[key]) === '') out[key] = value;
  };
  put('customerTel', phoneDigits(prospect['mainPhone'] ?? prospect['phone']));
  if (str(prospect['phoneCountryCode']) !== '') out['phoneCountryCode'] = dialCode(prospect['phoneCountryCode']);
  put('currentCountryName', label(prospect['currentCountry']));
  put('currentCountryCode', isObj(prospect['currentCountry']) ? str(prospect['currentCountry']['code']) : '');
  put('currentCityName', label(prospect['currentProvince']));
  put('currentDistrictName', label(prospect['currentDistrict']));
  return out;
}

/**
 * a phone as its digits only: "-" and " " (the service may send a number already shaped) are taken out, because the shape is the page's job (the `phoneNumberFormat` of the country
 * of the dial code). A masked value (`****`: no digit at all) is kept as it is.
 */
export function phoneDigits(value: unknown): string {
  const text = str(value);
  return /\d/.test(text) ? text.replace(/\D/g, '') : text;
}

/**
 * One opportunity of the new service as the page reads it: the page draws the fields of the Java `/board/leads` item (`txNo`, `prospectName`,
 * `employeeName`, `saleGroupName` …), the service names them differently (`txno`, `prospect.name`, `responsibleEmployee.name`, `saleGroup` …).
 * Only what is missing is added (a field of the old name that came is kept); the item goes on with everything it came with.
 *   txno → txNo · lastActivityAt (else txdate) → lastUpdatedAt (the date) · customerPhone → prospectTel / phone (the phone) · status → leadStatus (the badge) · currentActivity → stepName (the step column)
 *   salePerson → salePersonName · saleGroup → saleGroupName · responsibleEmployee.{name,code,id} → employeeName / employeeCode / employeeId
 *   prospect.{name,code} → prospectName / prospectCode
 */
export function legacyItem(item: unknown): unknown {
  if (!isObj(item)) return item;
  const out: Obj = { ...item };
  const put = (key: string, value: string): void => {
    if (value !== '' && (out[key] === undefined || out[key] === null || out[key] === '')) out[key] = value;
  };
  put('txNo', str(item['txno']));
  // an amount sent as a text ("150000.00") is a number for the page: added or formatted as a text it would be joined / shown raw (a masked or empty amount stays as it came)
  if (typeof item['amount'] === 'string' && item['amount'].trim() !== '' && Number.isFinite(Number(item['amount']))) out['amount'] = Number(item['amount']);
  // the date column / card date: the last activity (ISO `T` → the space the page cuts the date at), the date of the document when there is none
  put('lastUpdatedAt', str(item['lastActivityAt']).replace('T', ' '));
  put('lastUpdatedAt', str(item['txdate']));
  put('leadDemand', label(item['demand']));
  put('leadStatus', label(item['status']));
  // there is no `activeStatus` any more: `status` is the one status (HOT / WARM / …). The page reads activeStatus only when leadStatus is ACTIVE, so it gets the same value there
  put('activeStatus', label(item['status']));
  put('stepName', label(item['currentActivity']));
  put('salePersonName', label(item['salePerson']));
  put('saleGroupName', label(item['saleGroup']));
  const owner = item['responsibleEmployee'];
  if (isObj(owner)) {
    put('employeeName', str(owner['name']));
    put('employeeCode', str(owner['code']));
    // the picture of the responsible (the list row reads assigneeAvatars[0])
    const ownerPic = str(owner['avatarUrl']) || str(owner['attachFile']) || str(owner['avatar']);
    if (ownerPic !== '' && !Array.isArray(out['assigneeAvatars'])) out['assigneeAvatars'] = [ownerPic];
    if (out['employeeId'] === undefined && owner['id'] !== undefined && owner['id'] !== null) out['employeeId'] = owner['id'];
  }
  // the people who may see it: a card carries `people: { first: [...], total }` (the first few), the page reads `accessors`
  const people = item['people'];
  const firstPeople = isObj(people) ? people['first'] : people;
  if (out['accessors'] === undefined && Array.isArray(firstPeople) && firstPeople.length > 0) out['accessors'] = firstPeople;
  const prospect = item['prospect'];
  if (isObj(prospect)) {
    put('prospectName', str(prospect['name']));
    put('prospectCode', str(prospect['code']));
    // the address of the list row (province, district — or the country when it is not Thailand)
    put('currentCityName', label(prospect['currentProvince']));
    put('currentDistrictName', label(prospect['currentDistrict']));
    put('currentCountryName', label(prospect['currentCountry']));
    put('prospectAvatar', str(prospect['avatarUrl']) || str(prospect['attachFile']));
    if (out['prospectId'] === undefined && prospect['id'] !== undefined && prospect['id'] !== null) out['prospectId'] = prospect['id'];
    // the phone of the card and of the list row (TsPhone formats `prospectTel`): prospect.mainPhone first
    put('prospectTel', phoneDigits(prospect['mainPhone']));
    put('phone', phoneDigits(prospect['mainPhone']));
    // the dial code (and the country) of the number: the page asks the countries of the session for the `phoneNumberFormat` of that code and shapes the digits with it (TsPhone)
    put('phoneCountryCode', str(prospect['phoneCountryCode']));
    put('countryCode', str(prospect['countryCode']));
  }
  // fallback when the prospect carries no mainPhone
  put('prospectTel', phoneDigits(item['customerPhone']));
  put('phone', phoneDigits(item['customerPhone']));
  return out;
}

const cardsOf = (c: Obj): unknown[] | null => {
  for (const k of CARD_KEYS) if (Array.isArray(c[k])) return c[k] as unknown[];
  return null;
};

/**
 * What the page reads: `{ kanban: [{ stepId, stepName, items, meta: { page, perPage, total, totalPages } }], summary? }`.
 * A column of the service is `{ step: { id, name }, count, sumAmount, hasMore, cards: [...] }`; `meta` is the `meta` next to `result`
 * (`{ page, cardsPerColumn }`): the page of the cards and how many a column holds.
 */
export function boardOf(result: unknown, meta: unknown = null): Obj {
  const body: Obj = isObj(result) ? result : { items: Array.isArray(result) ? result : [] };
  const summary = body['summary'];
  const m = isObj(meta) ? meta : {};
  const page = Number(m['page']) > 0 ? Number(m['page']) : 1;
  const perPage = Number(m['cardsPerColumn']) > 0 ? Number(m['cardsPerColumn']) : 20;
  for (const k of COLUMN_KEYS) {
    const cols = body[k];
    if (Array.isArray(cols) && cols.every((c) => isObj(c) && cardsOf(c) !== null)) {
      const kanban = (cols as Obj[]).map((c) => {
        const step = isObj(c['step']) ? (c['step'] as Obj) : {};
        const items = cardsOf(c)!.map(legacyItem);
        const total = Number.isFinite(Number(c['count'])) && c['count'] !== null ? Number(c['count']) : items.length;
        return {
          ...c,
          stepId: first(c, ['stepId', 'stageId', 'activityStepId']) || first(step, ['id']) || first(c, ['id']),
          stepName: first(c, ['stepName', 'stageName', 'activityStepName']) || first(step, ['name']) || first(c, ['name']),
          items,
          // the total of the whole column (the cards loaded are only a page of it); a number for the page
          ...(Number.isFinite(Number(c['sumAmount'])) && c['sumAmount'] !== null && c['sumAmount'] !== '' ? { sumAmount: Number(c['sumAmount']) } : {}),
          // hasMore: the page asks for the next one when the last card scrolls into view, even if the count says less
          meta: { page, perPage, total, totalPages: Math.max(c['hasMore'] === true ? page + 1 : 1, Math.ceil(total / perPage)) },
        };
      });
      return { kanban, ...(summary === undefined ? {} : { summary }) };
    }
  }
  let list: unknown[] = [];
  for (const k of LIST_KEYS) {
    if (Array.isArray(body[k])) {
      list = body[k] as unknown[];
      break;
    }
  }
  const order: string[] = [];
  const cols = new Map<string, { stepId: string; stepName: string; items: unknown[] }>();
  for (const it of list) {
    const o = isObj(it) ? it : {};
    const stage = isObj(o['stage']) ? (o['stage'] as Obj) : isObj(o['step']) ? (o['step'] as Obj) : {};
    const stepId = first(o, ['stepId', 'stageId', 'activityStepId']) || first(stage, ['id']);
    const stepName = first(o, ['stepName', 'stageName', 'activityStepName']) || first(stage, ['name']);
    const key = stepId || stepName;
    if (!cols.has(key)) {
      cols.set(key, { stepId, stepName, items: [] });
      order.push(key);
    }
    cols.get(key)!.items.push(legacyItem(it));
  }
  return { kanban: order.map((k) => cols.get(k)!), ...(summary === undefined ? {} : { summary }) };
}

/**
 * What the page reads for the list: `{ leads: { items, meta: { page, perPage, total, totalPages } } }`. The rows are read from `result` (a list, or
 * `items | data | opportunities | rows | content | list` of it); the total from `result.total | count | totalItems` or `meta.total | totalItems`.
 * ★ A GUESS: no sample of the list has been seen yet.
 */
export function listOf(result: unknown, meta: unknown = null, asked: { page: number; perPage: number } = { page: 1, perPage: 20 }): Obj {
  const body: Obj = isObj(result) ? result : { items: Array.isArray(result) ? result : [] };
  const m = isObj(meta) ? meta : {};
  let items: unknown[] = [];
  for (const k of LIST_KEYS) {
    if (Array.isArray(body[k])) {
      items = body[k] as unknown[];
      break;
    }
  }
  const num = (...vs: unknown[]): number | null => {
    for (const v of vs) if (v !== null && v !== '' && Number.isFinite(Number(v))) return Number(v);
    return null;
  };
  const page = num(m['page'], body['page']) ?? asked.page;
  const perPage = num(m['perPage'], m['pageSize'], body['perPage']) ?? asked.perPage;
  const known = num(body['total'], body['count'], body['totalItems'], m['total'], m['totalItems']);
  const total = known ?? (page - 1) * perPage + items.length;
  // the total is not always sent: a full page (or hasMore) means there may be a next one, which the page asks for when the last row scrolls into view
  const more = body['hasMore'] === true || m['hasMore'] === true || (known === null && items.length >= perPage);
  const totalPages = num(m['totalPages'], body['totalPages']) ?? (known !== null ? Math.max(1, Math.ceil(total / perPage)) : more ? page + 1 : page);
  return { leads: { items: items.map(legacyItem), meta: { page, perPage, total, totalPages } } };
}

/**
 * The lists of the filter popup, from ONE call: `GET /api/v1/opportunities/filter-options` (OP07). The page asks four old addresses when it opens
 * (`/board/tags`, `/board/sale-groups`, `/board/provinces`, `/board/employees`); they all share this one call (asked once per visit of the page — the
 * four requests that come together share the one in flight, and a list that came is kept until sign-out or the language/company changes).
 *
 * ★ A GUESS: no sample of the answer has been seen. The lists are read from `result.<set>` (or `result` itself when it holds them), each as an array
 * or a page `{ items | data | rows | content | list }`, under these names:
 *   tags → tags | tagOptions · sale groups → saleGroups | teams | saleTeams · provinces → provinces · employees (the owner select) → responsibleFilter | employees | responsibles | owners
 * (`pipelines` and `salePersons` are asked too; the page has no list for them yet)
 * A list that is not in the answer (or a call that failed) is not answered here (`null`): the next route answers as before (the options of
 * `/prospects/options` for provinces and employees, an empty list for the tags and the sale groups). Check the names against a real answer.
 */
const FILTER_LISTS: Readonly<Record<string, readonly string[]>> = {
  '/board/tags': ['tags', 'tagOptions'],
  '/board/sale-groups': ['saleGroups', 'teams', 'saleTeams'],
  '/board/provinces': ['provinces'],
  '/board/employees': ['responsiblies', 'responsibleFilter', 'employees', 'responsibles', 'owners'],
};

/** the sets asked of filter-options */
const FILTER_SETS = FILTER_OPTION_SETS.join(',');

const FILTER_CACHE = new Map<string, Promise<Obj | null>>();
onClearOptionCache(() => FILTER_CACHE.clear());

/**
 * the `result` of filter-options as the lists the routes read (an object `{ tags, saleGroups, salePersons, responsibleFilter, pipelines, fiscalYears }`), or null when none is to be had.
 * Each list is kept in the session (sale-team.live.ts); only the sets that are NOT kept are asked of the service (`sets=` the missing ones), and a list that came
 * empty counts as not kept: it is asked again at the next visit of a page that needs it (this page, or the opportunity detail).
 */
function filterOptions(deps: RestDeps): Promise<Obj | null> {
  const key = optionKey(deps, 'opportunityFilterOptions');
  const kept = FILTER_CACHE.get(key);
  if (kept) return kept;
  let failed = false;
  const call = (async (): Promise<Obj | null> => {
    const sets = FILTER_SETS.split(',');
    // the countries are not a set of filter-options: they come from `GET /prospects/options?sets=countries` (kept in the session by fetchOptionRows: asked once)
    const [asked, countries] = await Promise.all([askSets(deps, sets), fetchOptionRows(deps, 'countries')]);
    failed = asked.failed;
    const got = asked.rows;
    const result: Obj = {};
    for (const s of sets) if (got[s]) result[s] = got[s];
    if (countries.ok && countries.rows.length > 0) result['countries'] = countries.rows;
    const provinces = readOptions<unknown>(optionKey(deps, 'provinces')); // not asked: kept only when an answer carried it
    if (provinces) result['provinces'] = provinces;
    return result; // may be empty (nothing came): the four addresses of this visit still share this one answer; the next visit asks again
  })();
  FILTER_CACHE.set(key, call);
  void call.then(() => {
    if (failed && FILTER_CACHE.get(key) === call) FILTER_CACHE.delete(key); // the service did not answer: asked again next time
  });
  return call;
}

/** one list of the answer as an array of rows (an array, or a page of one); null when the answer has none under these names */
export function filterList(result: Obj, names: readonly string[]): unknown[] | null {
  for (const n of names) {
    const v = result[n];
    if (Array.isArray(v)) return v;
    if (isObj(v)) for (const k of LIST_KEYS) if (Array.isArray(v[k])) return v[k] as unknown[];
  }
  return null;
}

export function opportunityV2Routes(deps: RestDeps): RouteHandler {
  // a new visit of the page: the lists that are not kept (never asked, or they came empty) are asked again (the four addresses of ONE visit still share one call)
  FILTER_CACHE.delete(optionKey(deps, 'opportunityFilterOptions'));
  return async (path, query, init) => {
    const method = (init?.method ?? 'GET').toUpperCase();
    const names = method === 'GET' ? FILTER_LISTS[path] : undefined;
    if (names) {
      const result = await filterOptions(deps);
      const rows = result ? filterList(result, names) : null;
      return rows ? jsonResponse(200, rows) : null;
    }
    if (path === '/board/master/movement-types' && method === 'GET') return productsEnvelope(deps);
    if (path !== '/board/leads' || method !== 'GET') return null;
    // no right to see the board: "[]", the service is not asked (as before)
    if (!deps.hasRole(ROLE_CRM_LEAD_VIEW)) return textResponse(200, '[]');
    const configId = (query.get('movementTypeId') ?? '').trim() || (await firstSalesLineId(deps));
    // `closed`: always sent, false unless the switch "show the closed opportunities" of the filter is on (the page says it as showClosed=true)
    const closed = (query.get('showClosed') ?? '').trim().toLowerCase() === 'true' ? 'true' : 'false';
    // the list (the tab "list"): GET /opportunities?opportunityConfigId=&tab=ALL (no `view`); the next page is the param `page`
    if ((query.get('viewMode') ?? '').trim().toLowerCase() === 'list') {
      const page = Math.max(1, Number((query.get('page') ?? '').trim()) || 1);
      const perPage = Math.max(1, Number((query.get('perPage') ?? '').trim()) || 20);
      const lq: Record<string, string> = { opportunityConfigId: configId, tab: 'ALL', closed };
      if (page > 1) lq['page'] = String(page);
      const lu = await service(deps, 'GET', '/opportunities', { query: lq });
      if (!lu.ok) return passThrough(lu);
      const lresult = isObj(lu.json) && 'result' in lu.json ? (lu.json as Obj)['result'] : lu.json;
      return jsonResponse(200, listOf(lresult, isObj(lu.json) ? (lu.json as Obj)['meta'] : null, { page, perPage }));
    }
    // the next cards of ONE column: its step (`activityId`) and the page, two params of their own; the first load of the board has neither
    const step = (query.get('activityStepId') ?? '').trim();
    const page = Number((query.get('page') ?? '').trim());
    const q: Record<string, string> = { opportunityConfigId: configId, view: 'BOARD', tab: 'ALL', closed };
    if (step !== '') q['activityId'] = step;
    if (step !== '' || page > 1) q['page'] = String(page > 1 ? page : 1);
    const u = await service(deps, 'GET', '/opportunities', { query: q });
    if (!u.ok) return passThrough(u);
    const result = isObj(u.json) && 'result' in u.json ? (u.json as Obj)['result'] : u.json;
    const board = boardOf(result, isObj(u.json) ? (u.json as Obj)['meta'] : null);
    // the page reads the column it asked for as the first one
    if (step !== '' && Array.isArray(board['kanban'])) board['kanban'] = (board['kanban'] as Obj[]).filter((c) => str(c['stepId']) === step);
    return jsonResponse(200, board);
  };
}

/**
 * The detail of ONE opportunity from the new service: `GET /api/v1/opportunities/{opportunityId}` answers the page's `GET /board/lead?id=&activityGroupId=`
 * (the old `GET /leads/{id}`). Compose it BEFORE `opportunityCoreRoutes` (which still answers the old address for the pages that have not moved).
 *
 * The answer (seen on DEV, 17/11): `result = { header, maskedFields, steps: { current, groups, history } }`. The page reads the flat `OpportunityDetail` of
 * the old service, so `legacyDetail` flattens `header` and adds the old names (what is already named for the page is kept; everything else goes through):
 *
 *   header.txno · status · demand · amount · targetMonth      → txNo · leadStatus (HOT … the page takes it as the interest) · leadDemand · amount · targetMonth
 *   header.targetYear { id, yearValue }                       → targetYear = yearValue (null on DEV: the page then shows the current year)
 *   header.responsibleEmployee { id, name }                   → employee + employeeName
 *   header.saleGroup / salePerson { id, name }                → as they are (null = "-")
 *   header.prospect { id, name }                              → as it is (the name may be masked "****"); prospectInfo.fullName is the same name
 *   header.people[]                                           → accessors (the people who may see it)
 *   steps.current { activityGroup, activity }                 → currentStep { procedureGroupId/Name, procedureId/Name, assigneeId/Name (= the responsible), canReturn: false }
 *   steps.groups[] { activityGroup, orderNo, steps[] }        → activeSteps [{ procedureGroupId, procedureGroupName }] and usesWorkflowStep = true when there are groups
 *   steps.history[]                                           → stepHistory (as it is: the page has no panel for it; `contactHistoryList` is another thing)
 *   maskedFields                                              → as it is (a masked `amount` is null: the page shows 0)
 *
 * Not in the answer (so empty here): `appointmentList`, `taskList`, `contactHistoryList`, `materialList`, `tagList`, `permissions` (no one may add a contact
 * note by it), `prospectInfo` of the customer, `canReturn`. `activityGroupId` goes as a query param of the same name (the service may not know it).
 * An error is the body the page reads (`{ status, message, error: { code, message } }`) with the text of the service (details → description → message).
 */
export function legacyDetail(result: unknown): unknown {
  if (!isObj(result)) return result;
  const header = isObj(result['header']) ? (result['header'] as Obj) : null;
  // the header goes flat; the rest of `result` (maskedFields, steps) stays next to it
  const flat: Obj = header ? { ...header, ...Object.fromEntries(Object.entries(result).filter(([k]) => k !== 'header')) } : { ...result };
  const out = legacyItem(flat) as Obj;
  const put = (key: string, value: unknown): void => {
    if (value !== undefined && value !== null && value !== '' && (out[key] === undefined || out[key] === null || out[key] === '')) out[key] = value;
  };
  const named = (v: unknown): Obj | null => (isObj(v) ? (v as Obj) : null);
  put('employee', flat['responsibleEmployee']);
  put('tagList', flat['tags']);
  put('leadDemand', flat['demand'] ?? flat['requirement']);
  put('accessors', Array.isArray(flat['people']) && (flat['people'] as unknown[]).length > 0 ? flat['people'] : undefined);
  // targetYear { id, yearValue }: the year shown is `yearValue` (the name is the fallback; null on DEV); a plain value is kept
  const ty = flat['targetYear'];
  if (isObj(ty)) out['targetYear'] = str(ty['yearValue']) || str(ty['name']);
  // the customer: only id and name come; the page reads prospect.name and prospectInfo.fullName
  const prospect = named(flat['prospect']);
  // the customer of the left card, under the names the page reads (a name it already has is kept):
  //   prospect.mainPhone (digits) → prospect.customerTel (+ its phoneCountryCode / countryCode as they came) · ★ A GUESS: the names are those of the list's prospect
  //   prospect.currentCountry / currentProvince / currentDistrict { id, name } → prospect.currentCountryName (+ Code) / currentCityName / currentDistrictName: the page shows
  //   only the country when it is not Thailand, else "province, district"
  if (prospect) out['prospect'] = customerOf(prospect);
  // "ติดต่อครั้งแรก" = the date of the opportunity (`txdate`): the page reads prospectInfo.firstContactDate (the date part of it)
  const txdate = str(flat['txdate']);
  // the code of the customer is shown under the name (prospectInfo.customerCode)
  const customerCode = prospect ? str(prospect['code']) : '';
  if (prospect && !isObj(out['prospectInfo'])) out['prospectInfo'] = { fullName: str(prospect['name']), ...(customerCode !== '' ? { customerCode } : {}), ...(txdate !== '' ? { firstContactDate: txdate } : {}) };
  else if (isObj(out['prospectInfo'])) {
    const info: Obj = { ...out['prospectInfo'] };
    if (txdate !== '' && !info['firstContactDate']) info['firstContactDate'] = txdate;
    if (customerCode !== '' && !info['customerCode']) info['customerCode'] = customerCode;
    out['prospectInfo'] = info;
  }
  // the steps
  const steps = named(flat['steps']);
  if (steps) {
    const cur = named(steps['current']);
    const group = named(cur?.['activityGroup']);
    const activity = named(cur?.['activity']);
    if (!isObj(out['currentStep']) && (group || activity)) {
      const owner = named(flat['responsibleEmployee']);
      out['currentStep'] = {
        procedureGroupId: group?.['id'] ?? null,
        procedureGroupName: str(group?.['name']),
        procedureId: activity?.['id'] ?? null,
        procedureName: str(activity?.['name']),
        assigneeId: owner?.['id'] ?? null,
        assigneeName: str(owner?.['name']),
        canReturn: false,
      };
    }
    const groups = Array.isArray(steps['groups']) ? (steps['groups'] as unknown[]) : [];
    if (out['activeSteps'] === undefined) {
      out['activeSteps'] = groups
        .map((g) => named(named(g)?.['activityGroup']))
        .filter((g): g is Obj => g !== null)
        .map((g) => ({ procedureGroupId: g['id'], procedureGroupName: str(g['name']) }));
    }
    if (out['usesWorkflowStep'] === undefined) out['usesWorkflowStep'] = USES_WORKFLOW_STEP && groups.length > 0;
    if (Array.isArray(steps['history'])) out['stepHistory'] = steps['history'];
  }
  return out;
}

/**
 * ★ For now every opportunity is a "no workflow step" one: the page hides the step bar (and the group tags, the close-group / return-step buttons) as it does
 * for `usesWorkflowStep = false`. Set to true to decide it by the groups the answer carries again (`steps.groups` not empty).
 */
const USES_WORKFLOW_STEP = false;

/** the message of an error body of the new service: the first detail, then `error.description`, then `message` */
function detailErrorText(u: { json?: unknown; text: string }): string {
  const j = u.json;
  const err = isObj(j) && isObj(j['error']) ? (j['error'] as Obj) : null;
  const details = err && Array.isArray(err['details']) ? (err['details'] as unknown[]) : [];
  const first0 = details.find(isObj) as Obj | undefined;
  return str(first0?.['message']) || str(err?.['description']) || errorMessage({ json: j } as Parameters<typeof errorMessage>[0]);
}

export function opportunityDetailV2Routes(deps: RestDeps): RouteHandler {
  return async (path, query, init) => {
    if (path !== '/board/lead' || (init?.method ?? 'GET').toUpperCase() !== 'GET') return null;
    if (!deps.hasRole(ROLE_CRM_LEAD_VIEW)) return textResponse(403, opportunityErrorJson(403, deps.message('label.ld2.lead_no_permission')));
    const id = (query.get('id') ?? '').trim();
    const fallback = deps.message('label.ld2.lead_load_failed_default');
    if (id === '') return textResponse(502, opportunityErrorJson(502, fallback));
    const group = (query.get('activityGroupId') ?? '').trim();
    // OP06: the appointments and the tasks are asked AT ONCE with the opportunity (the page needs the three on entering): not after it has answered
    const oppCall = get(deps, `/opportunities/${encodeURIComponent(id)}`, group !== '' ? { activityGroupId: group } : undefined);
    const schedulesCall = fetchOpportunitySchedules(deps, id);
    const u = await oppCall;
    if (!u.ok) {
      const status = u.status >= 100 ? u.status : 502;
      return textResponse(status, opportunityErrorJson(status, detailErrorText(u as { json?: unknown; text: string }) || fallback));
    }
    const body = isObj(u.json) && 'result' in u.json ? (u.json as Obj)['result'] : u.json;
    if (!isObj(body)) return textResponse(502, opportunityErrorJson(502, fallback));
    rememberOpportunityVersion(id, body, isObj(u.json) ? u.json['meta'] : null); // OP12 sends it back
    // OP06: the tables of appointments and tasks of the page (started above, with the opportunity)
    const lead = legacyDetail(body) as Obj;
    const schedules = await schedulesCall;
    if (lead['appointmentList'] === undefined) lead['appointmentList'] = schedules.appointmentList;
    if (lead['taskList'] === undefined) lead['taskList'] = schedules.taskList;
    return textResponse(200, localizeProspectLocation(deps, JSON.stringify(lead)));
  };
}
