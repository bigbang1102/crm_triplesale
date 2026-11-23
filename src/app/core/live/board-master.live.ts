/**
 * The master-data routes of the Java board (`/board/…`) answered in the browser — the thin servlets that every page of the CRM shares
 * (`MovementTypesServlet`, `MovementTypeServlet`, `EmployeesServlet`, `SaleGroupsServlet`, `SalePersonsServlet`, `TagsServlet`,
 * `ProvincesServlet`, `DistrictsServlet`, `SubDistrictsServlet`, `MetroGeoServlet`, `FiscalYearsServlet`, `MaterialGroupsServlet`,
 * `MaterialsServlet`, `MasterActivityGroupsServlet`, `MasterEmployeesByActivityGroupServlet`, `ChatMasterDataServlet`) with the helpers they
 * called (`LeadBoardView.fetchMasterArrayJson` / `fetchMovementTypesJson` / `keepThaiProvincesOnly`, `MasterDataItemBean`,
 * `MasterDataI18n`, `Data_API.sendGET`).
 *
 * Every page that needs a list for a dropdown composes `boardMasterRoutes(deps)` into its own backend (`composeRoutes(…)` of `rest.ts`).
 * What a servlet did is kept to the letter: an answer that is not 200 / not JSON / has no `result` array is the EMPTY list (`[]`, never an
 * error status — the dropdown just stays empty); `Data_API.sendGET` gave "" for any non-200 answer; `MasterDataItemBean` keeps only
 * id / code / name / nameTh / colorCode / attachFile / postCode (+ `employee`); the English names come from the master-data dictionary.
 *
 * Not ported: the per-session caches of `ProvincesServlet` and `ChatMasterDataServlet` (countries) — a browser asks again (the answers are
 * cached by the browser / the gateway); an HTTP 500 for an exception inside the servlet (there is nothing to throw here).
 */
import { has, isArr, isObj, optInt, optLong, optString, parseJson, type JObj } from './org-json';
import { body200, get, jsonResponse, textResponse, type RestDeps, type RouteHandler } from './rest';

/* ---------------------------------------------------------------- MasterDataI18n */

/** `MasterDataI18n.translate(code, fallback)`: the English name of a master-data code (the Thai text stays where there is none) */
export function translate(deps: RestDeps, code: string | null | undefined, fallback: string): string {
  if (code == null || code.trim() === '') return fallback;
  const en = deps.masterText('en', code.trim());
  return en != null && en.trim() !== '' ? en : fallback;
}

/** `MasterDataI18n.translateTh` — the Thai name from the Thai dictionary */
export function translateTh(deps: RestDeps, code: string | null | undefined, fallback: string): string {
  if (code == null || code.trim() === '') return fallback;
  const th = deps.masterText('th', code.trim());
  return th != null && th.trim() !== '' ? th : fallback;
}

/** `translateProvince` / `translateDistrict`: the keyed names (`province.BKK`, `district.1001`) */
export const translateProvince = (deps: RestDeps, code: string | null | undefined, fallback: string): string =>
  code == null || code.trim() === '' ? fallback : translate(deps, `province.${code.trim()}`, fallback);
export const translateDistrict = (deps: RestDeps, code: string | null | undefined, fallback: string): string =>
  code == null || code.trim() === '' ? fallback : translate(deps, `district.${code.trim()}`, fallback);

/** `translateEnvelopeResult(json, lang)`: in English every `result[].name` becomes the English name of its `code`; the text passes as it is otherwise */
export function translateEnvelopeResult(deps: RestDeps, json: string, lang: string): string {
  if (lang !== 'en' || !json.trim()) return json;
  const root = parseJson(json);
  if (!isObj(root) || !isArr(root['result'])) return json;
  for (const item of root['result']) if (isObj(item)) item['name'] = translate(deps, optString(item, 'code', ''), optString(item, 'name', ''));
  return JSON.stringify(root);
}

/** `translateEnvelopeResultTh(json)`: every `result[].nameTh` becomes the Thai name of its `code` (the countries of the chat) */
export function translateEnvelopeResultTh(deps: RestDeps, json: string): string {
  if (!json.trim()) return json;
  const root = parseJson(json);
  if (!isObj(root) || !isArr(root['result'])) return json;
  for (const item of root['result']) if (isObj(item)) item['nameTh'] = translateTh(deps, optString(item, 'code', ''), optString(item, 'nameTh', ''));
  return JSON.stringify(root);
}

/* ---------------------------------------------------------------- MasterDataItemBean + fetchMasterArrayJson */

/** `MasterDataItemBean.from(o).toJson()`: the normalised master-data row */
export function masterItem(o: JObj): JObj {
  const out: JObj = {
    id: optLong(o, 'id', 0),
    code: optString(o, 'code', ''),
    name: optString(o, 'name', ''),
    nameTh: optString(o, 'nameTh', ''),
    colorCode: optString(o, 'colorCode', ''),
    attachFile: optString(o, 'attachFile', ''),
    postCode: optString(o, 'postCode', ''),
  };
  const employee = o['employee'];
  if (isObj(employee)) out['employee'] = masterItem(employee); // only when there is one: the other endpoints keep their payload
  return out;
}

/**
 * `LeadBoardView.fetchMasterArrayJson(path, label)`: GET (Bearer) → `result[]` normalised through `MasterDataItemBean`; `[]` when the answer is
 * not 200, not a JSON object, not `status: 200` with a `result` array. `path` is below `/api/v1` (`/master-data/employees?saleGroupId=3`).
 */
export async function fetchMasterArray(deps: RestDeps, path: string, query?: Record<string, string>): Promise<JObj[]> {
  const text = body200(await get(deps, path, query));
  if (!text.trim().startsWith('{')) return [];
  const obj = parseJson(text);
  if (!isObj(obj) || optInt(obj, 'status', 0) !== 200 || !has(obj, 'result')) return [];
  const result = obj['result'];
  return isArr(result) ? result.filter(isObj).map(masterItem) : [];
}

/* ---------------------------------------------------------------- provinces */

/** `LeadBoardView.acIsThaiText`: only Thai letters (U+0E00..U+0E7F) and white space (`Character.isWhitespace`: no no-break space) */
const JAVA_WHITESPACE = new RegExp('[\t\n\u000B\f\r\u001C-\u001F \u1680\u2000-\u2006\u2008-\u200A\u2028\u2029\u205F\u3000]');
function isThaiText(text: string): boolean {
  if (!text.trim()) return false;
  for (const ch of text) {
    if (JAVA_WHITESPACE.test(ch)) continue;
    const c = ch.charCodeAt(0);
    if (c < 0x0e00 || c > 0x0e7f) return false;
  }
  return true;
}

/**
 * `LeadBoardView.keepThaiProvincesOnly`: `/master-data/provinces` mixes in foreign cities (2,659 of 2,739 rows) and repeats codes with a
 * leading tab — keep the rows with a code and a Thai-only name; of a repeated code the row with the higher id (it keeps the place of the first).
 */
export function keepThaiProvincesOnly(items: readonly JObj[]): JObj[] {
  const byCode = new Map<string, JObj>();
  for (const o of items) {
    const code = optString(o, 'code', '').trim();
    if (!code || !isThaiText(optString(o, 'name', ''))) continue;
    const already = byCode.get(code);
    if (!already || optLong(o, 'id', 0) > optLong(already, 'id', 0)) byCode.set(code, o);
  }
  return [...byCode.values()];
}

/* ---------------------------------------------------------------- the routes */

const list = (items: readonly JObj[]): Response => textResponse(200, JSON.stringify(items));
const trimmed = (q: URLSearchParams, name: string): string => (q.get(name) ?? '').trim();

/** `LeadBoardView.fetchMovementTypesJson`: the text of `result` of `movement-types/LD` ("[]" when it fails) */
async function movementTypesText(deps: RestDeps): Promise<string> {
  const text = body200(await get(deps, '/master-data/movement-types/LD'));
  if (!text.trim().startsWith('{')) return '[]';
  const obj = parseJson(text);
  if (isObj(obj) && optInt(obj, 'status', 0) === 200 && has(obj, 'result') && obj['result'] !== null) {
    const r = obj['result'];
    return typeof r === 'string' ? r : JSON.stringify(r); // (org.json `toString()` of a String is the text itself)
  }
  return '[]';
}

/** the `type` of `ChatMasterDataServlet` → the path below `/api/v1` */
const CHAT_MASTER_PATHS: Record<string, string> = {
  'marketing-channels': '/master-data/marketing-channels',
  employees: '/master-data/employees',
  'sale-persons': '/master-data/sale-persons',
  branches: '/master-data/branches',
  products: '/master-data/movement-types/LD',
  countries: '/master-data/countries?page=1&pageSize=1000',
  'business-types': '/master-data/business-types?page=1&pageSize=1000',
  occupations: '/master-data/occupations?page=1&pageSize=1000',
  'communication-types': '/master-data/communication-types?page=1&pageSize=1000',
  prospects: '/master-data/prospects/search',
};

/** the master-data routes of the board; compose them into the backend of a page */
export function boardMasterRoutes(deps: RestDeps): RouteHandler {
  return async (path, query) => {
    switch (path) {
      case '/board/movement-types': {
        let body = '[]';
        try {
          body = (await movementTypesText(deps)).trim() || '[]';
          if (deps.lang() === 'en') {
            const arr = parseJson(body);
            if (!isArr(arr)) throw new Error('not a JSONArray');
            for (const item of arr) if (isObj(item)) item['name'] = translate(deps, optString(item, 'code', ''), optString(item, 'name', ''));
            body = JSON.stringify(arr);
          }
        } catch {
          return textResponse(500, body);
        }
        return textResponse(200, body);
      }
      case '/board/master/movement-types': {
        const type = trimmed(query, 'type') ? query.get('type')! : 'LD';
        const u = await get(deps, `/master-data/movement-types/${type}`);
        const body = body200(u);
        return textResponse(200, body.trim() ? body : '{"status":204,"message":"no content","result":{"items":[]}}');
      }
      case '/board/employees': {
        const group = trimmed(query, 'saleGroupId');
        return list(await fetchMasterArray(deps, `/master-data/employees${group ? `?saleGroupId=${group}` : ''}`));
      }
      case '/board/sale-persons': {
        const group = trimmed(query, 'saleGroupId');
        return list(await fetchMasterArray(deps, `/master-data/sale-persons${group ? `?saleGroupId=${group}` : ''}`));
      }
      case '/board/sale-groups':
        return list(await fetchMasterArray(deps, '/master-data/sale-groups'));
      case '/board/tags':
        return list(await fetchMasterArray(deps, '/master-data/tags?key='));
      case '/board/fiscal-years':
        return list(await fetchMasterArray(deps, '/master-data/fiscal-years'));
      case '/board/material-groups':
        return list(await fetchMasterArray(deps, '/master-data/material-groups'));
      case '/board/materials': {
        const group = trimmed(query, 'groupId');
        return list(group ? await fetchMasterArray(deps, `/master-data/material-groups/${group}/materials`) : []);
      }
      case '/board/provinces':
        return list(keepThaiProvincesOnly(await fetchMasterArray(deps, '/master-data/provinces')));
      case '/board/districts': {
        const province = trimmed(query, 'provinceId');
        return list(province ? await fetchMasterArray(deps, '/master-data/districts', { provinceId: province }) : []);
      }
      case '/board/sub-districts': {
        const district = trimmed(query, 'districtId');
        return list(district ? await fetchMasterArray(deps, '/master-data/sub-districts', { districtId: district }) : []);
      }
      case '/board/metro-geo': {
        const text = await deps.asset('assets/data/metro-geo.json');
        if (text === null) return textResponse(500, '[]');
        return textResponse(200, text.trim() ? text : '[]');
      }
      case '/board/master/activity-groups': {
        const id = trimmed(query, 'movementTypeId');
        if (!id) return jsonResponse(400, { error: 'movementTypeId required' });
        const body = body200(await get(deps, `/master-data/activity-groups?movementTypeId=${id}`));
        return textResponse(200, translateEnvelopeResult(deps, body.trim() ? body : '{}', deps.lang()));
      }
      case '/board/master/employees-by-activity-group': {
        const id = trimmed(query, 'activityGroupId');
        if (!id) return jsonResponse(400, { error: 'activityGroupId required' });
        const body = body200(await get(deps, `/master-data/employees/by-activity-group?activityGroupId=${id}`));
        return textResponse(200, translateEnvelopeResult(deps, body.trim() ? body : '{}', deps.lang()));
      }
      case '/board/chat-master-data': {
        const type = (query.get('type') ?? '').trim();
        const target = Object.hasOwn(CHAT_MASTER_PATHS, type) ? CHAT_MASTER_PATHS[type] : null;
        if (!target) return jsonResponse(400, { status: 400, message: 'invalid type (marketing-channels|employees|sale-persons|branches|products)' });
        let body = body200(await get(deps, target));
        if (type === 'countries') body = translateEnvelopeResultTh(deps, body);
        return textResponse(200, body.trim() ? body : '{}');
      }
      default:
        return null;
    }
  };
}
