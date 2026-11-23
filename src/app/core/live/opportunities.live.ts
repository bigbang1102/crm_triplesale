/**
 * The lead-board servlets of the Java app answered in the browser (ADR-001: no Tomcat, no BFF). The page keeps asking its old URLs
 * (`fetch('../board/leads?…')`); `opportunitiesRoutes(deps)` answers them with real `Response`s built from calls to `{api}` =
 * `/triplesale-service/api/v1` through `RestDeps.call` (the app's HttpClient: Bearer token, 401 = the session ended, the API log).
 *
 *   GET    /board/leads                  LeadsBoardServlet → LeadBoardView.fetchLeadsJson (+ localizeLocationNames)   GET /leads?viewMode=…
 *   GET|POST /board/filter-state         FilterStateServlet          HttpSession["ld_filter_state"]          → sessionStorage (per user)
 *   GET|POST /board/detail-filter-state  DetailFilterStateServlet    HttpSession["ld_detail_filter_state"]   → sessionStorage (per user)
 *   POST   /board/lead-assign            AssignLeadServlet           PATCH /leads/assign (the posted body, untouched)
 *   POST   /board/contact-activities     ContactActivitiesServlet + ContactChannel   POST /leads/{leadId}/contact-activities
 *   POST   /board/lead-update?action=    LeadUpdateServlet           PATCH /leads/{target-year|target-month|amount|assign|active-status|demand}, PUT /leads/{id}/tags
 *   POST|DELETE /board/lead-materials    LeadMaterialsServlet        POST|DELETE /leads/materials
 *
 * What a servlet did is kept to the letter (the Java files are the truth): the role pre-check of `/board/leads` (`CRM_Lead_View`, else `[]`
 * without a call), the defaults and clamps of every parameter, the URL the service was asked (order of the parameters, only `search`
 * URL-encoded, with `URLEncoder` rules), the envelope handling (`Data_API.sendGET` = the body of a 200 answer only; `sendPOST` / `sendPATCH` /
 * `sendPUT` = the body of ANY status), the cleaning (place names in the language of the page) and the exact error bodies / statuses the pages read.
 *
 * Not ported, on purpose:
 *  - the `500` + `[]` of `/board/leads` after an exception, and the `{"error": e.getMessage()}` bodies of the assign / contact-activities servlets:
 *    the Java code in those `try` blocks cannot throw (`Data_API` swallows every IOException and answers ""), and neither can this port;
 *  - `Cache-Control: no-store` / `Pragma` headers of the servlets (no HTTP cache sits between the page and `RestDeps.call`);
 *  - the HttpSession itself: the two filter states live in `sessionStorage` (see below).
 *
 * What differs from a servlet container, on purpose: a wrong HTTP method is a JSON 405 (the container's 405 page).
 */
import { translateDistrict, translateProvince, translateTh } from './board-master.live';
import { ROLE_CRM_LEAD_VIEW } from './opportunity-core.live';
import { has, isArr, isObj, optInt, optString, parseJson } from './org-json';
import { body200, get, jsonResponse, service, textResponse, type RestDeps, type RouteHandler, type Upstream } from './rest';

/* ---------------------------------------------------------------- Java semantics the servlets relied on */

/** `String.trim()`: every character up to U+0020 goes from both ends (JS `trim` also strips no-break space & co.) */
const JAVA_TRIM_EDGES = new RegExp('^[\\u0000-\\u0020]+|[\\u0000-\\u0020]+$', 'g');
export const javaTrim = (s: string): string => s.replace(JAVA_TRIM_EDGES, '');
const blank = (s: string | null | undefined): boolean => s == null || javaTrim(s) === '';

/**
 * `java.net.URLEncoder.encode(s, "UTF-8")`: letters, digits and `. - * _` stay, a space is `+`, everything else is the percent-encoded UTF-8 bytes
 * (upper-case hex; a lone surrogate becomes `?` = `%3F`). `encodeURIComponent` differs (`*` is encoded, `!'()~` are not, a space is `%20`).
 */
export function javaUrlEncode(s: string): string {
  let out = '';
  for (let i = 0; i < s.length; i++) {
    const ch = s[i];
    if (/[A-Za-z0-9.\-*_]/.test(ch)) {
      out += ch;
      continue;
    }
    if (ch === ' ') {
      out += '+';
      continue;
    }
    let cp = s.charCodeAt(i);
    if (cp >= 0xd800 && cp <= 0xdbff && i + 1 < s.length && s.charCodeAt(i + 1) >= 0xdc00 && s.charCodeAt(i + 1) <= 0xdfff) {
      cp = 0x10000 + ((cp - 0xd800) << 10) + (s.charCodeAt(i + 1) - 0xdc00);
      i++;
    } else if (cp >= 0xd800 && cp <= 0xdfff) {
      cp = 0x3f; // a lone surrogate: the encoder of the JDK writes '?'
    }
    const bytes = cp < 0x80 ? [cp] : cp < 0x800 ? [0xc0 | (cp >> 6), 0x80 | (cp & 63)] : cp < 0x10000 ? [0xe0 | (cp >> 12), 0x80 | ((cp >> 6) & 63), 0x80 | (cp & 63)] : [0xf0 | (cp >> 18), 0x80 | ((cp >> 12) & 63), 0x80 | ((cp >> 6) & 63), 0x80 | (cp & 63)];
    for (const b of bytes) out += '%' + b.toString(16).toUpperCase().padStart(2, '0');
  }
  return out;
}

const LONG_MIN = -(2n ** 63n);
const LONG_MAX = 2n ** 63n - 1n;
/** `Long.parseLong(text)`: an optional sign and digits that fit a long; `undefined` where Java throws NumberFormatException */
export function javaParseLong(text: string): bigint | undefined {
  if (!/^[+-]?\d+$/.test(text)) return undefined;
  const n = BigInt(text);
  return n >= LONG_MIN && n <= LONG_MAX ? n : undefined;
}

/** `Integer.parseInt(text)` of a trimmed text; `undefined` when Java would throw */
function javaParseInt(text: string): number | undefined {
  if (!/^[+-]?\d+$/.test(text)) return undefined;
  const n = Number(BigInt(text));
  return n >= -2147483648 && n <= 2147483647 ? n : undefined;
}

/** `new BigDecimal(text)` rendered as a JSON number (numerically the same as org.json wrote it: no sign `+`, no leading / trailing zeros); `undefined` where Java throws */
export function javaDecimalLiteral(text: string): string | undefined {
  const m = /^([+-]?)(\d*)(?:\.(\d*))?(?:[eE]([+-]?\d+))?$/.exec(text);
  if (!m || (!m[2] && !m[3])) return undefined;
  const [, sign, intPart, frac = '', exp] = m;
  const whole = intPart.replace(/^0+(?=\d)/, '') || '0';
  const fraction = frac.replace(/0+$/, '');
  const mantissa = `${whole}${fraction ? '.' + fraction : ''}`;
  const zero = /^0(\.0*)?$/.test(mantissa);
  return `${sign === '-' && !zero ? '-' : ''}${mantissa}${exp !== undefined ? 'e' + exp.replace(/^\+/, '') : ''}`;
}

/** what string concatenation of an `Object` parsed by org.json gives (`"" + leadId` in `TriplesaleApi.leadContactActivities`) */
const javaText = (v: unknown): string => (typeof v === 'string' ? v : v !== null && typeof v === 'object' ? JSON.stringify(v) : String(v));

/* ---------------------------------------------------------------- the request, as a servlet reads it */

/** `req.getReader()` joined by `readLine()` (line breaks are lost) and trimmed: what the servlets called `requestBody` */
export function readBody(init: RequestInit | undefined): string {
  const b = init?.body;
  const raw = typeof b === 'string' ? b : b instanceof URLSearchParams ? b.toString() : '';
  return javaTrim(raw.split(/\r\n|\r|\n/).join(''));
}

/** `req.getParameter(name)`: the query string first, then the form body of a POST (`application/x-www-form-urlencoded`) */
function requestParam(query: URLSearchParams, init: RequestInit | undefined): (name: string) => string | null {
  let form: URLSearchParams | null = null;
  const type = new Headers(init?.headers).get('content-type') ?? '';
  if ((init?.method ?? 'GET').toUpperCase() === 'POST' && /^application\/x-www-form-urlencoded/i.test(type)) {
    const b = init?.body;
    form = new URLSearchParams(typeof b === 'string' ? b : b instanceof URLSearchParams ? b.toString() : '');
  }
  return (name) => (query.has(name) ? query.get(name) : form?.get(name) ?? null);
}

/** `LeadsBoardServlet._param`: a trimmed value, the default when it is missing or blank */
const strParam = (q: URLSearchParams, name: string, def: string): string => {
  const v = q.get(name);
  return v === null || javaTrim(v) === '' ? def : javaTrim(v);
};
/** `LeadsBoardServlet._intParam`: `Integer.parseInt` of the trimmed value, the default when it is missing, blank or not an int */
const intParam = (q: URLSearchParams, name: string, def: number): number => {
  const v = q.get(name);
  if (v === null || javaTrim(v) === '') return def;
  return javaParseInt(javaTrim(v)) ?? def;
};

const methodNotAllowed = (): Response => jsonResponse(405, { status: 405, message: 'Method Not Allowed' });

/** a servlet answer with the status the service gave; the statuses that carry no body (204 …) have none, a status a `Response` cannot have is a 502 */
function answer(status: number, text: string): Response {
  const s = status >= 200 && status <= 599 ? status : 502;
  return s === 204 || s === 205 || s === 304 ? new Response(null, { status: s }) : textResponse(s, text);
}

/** `Content-Type: application/json; charset=UTF-8` — what `Data_API` sent with every body; the text goes out exactly as built */
const JSON_BODY = { 'Content-Type': 'application/json; charset=UTF-8' };
const sendJson = (deps: RestDeps, method: 'POST' | 'PATCH' | 'PUT' | 'DELETE', path: string, bodyText: string): Promise<Upstream> =>
  service(deps, method, path, { body: bodyText, headers: JSON_BODY });

/** the JSON text of an object whose values are already JSON literals (so that a long or a decimal keeps every digit) */
const jsonObject = (fields: [string, string][]): string => `{${fields.map(([k, v]) => `${JSON.stringify(k)}:${v}`).join(',')}}`;

/* ---------------------------------------------------------------- GET /board/leads */

/** the parameters of `LeadBoardView.fetchLeadsJson` (every overload is this one with the rest left out) */
export interface OpportunitiesRequest {
  viewMode?: string | null;
  movementTypeId?: string | null;
  activityGroupId?: string | null;
  activityStepId?: string | null;
  search?: string | null;
  showClosed?: string | null;
  dateRangeType?: string | null;
  dateFrom?: string | null;
  dateTo?: string | null;
  provinceId?: string | null;
  districtId?: string | null;
  activeStatus?: string | null;
  saleGroupId?: string | null;
  salePersonId?: string | null;
  employeeId?: string | null;
  tagIds?: string | null;
  sortBy?: string | null;
  page?: number;
  perPage?: number;
}

/** the `result` of an answer as the text `result.toString()` of org.json gave */
function resultText(result: unknown): string {
  if (result === null) return 'null'; // JSONObject.NULL
  if (typeof result === 'string') return result;
  if (typeof result === 'object') return JSON.stringify(result);
  return String(result);
}

/**
 * `LeadBoardView.fetchLeadsJson(…)`: `GET /leads?viewMode=…` → the text of `result`; `"[]"` for anything else (no answer, not 200, not an object,
 * not `status: 200`, no `result`). The values are trimmed and written into the URL as they are (only `search` is encoded); blank ones are left out;
 * `salePersonId` goes in before `employeeId` when given (the servlet never gives it).
 */
export async function fetchLeadsJson(deps: RestDeps, r: OpportunitiesRequest = {}): Promise<string> {
  const vm = blank(r.viewMode) ? 'board' : javaTrim(r.viewMode!);
  let path = `/leads?viewMode=${vm}`;
  const add = (name: string, value: string | null | undefined): void => {
    if (!blank(value)) path += `&${name}=${javaTrim(value!)}`;
  };
  add('movementTypeId', r.movementTypeId);
  add('activityGroupId', r.activityGroupId);
  add('activityStepId', r.activityStepId);
  if (!blank(r.search)) path += `&search=${javaUrlEncode(javaTrim(r.search!))}`;
  add('showClosed', r.showClosed);
  add('dateRangeType', r.dateRangeType);
  add('dateFrom', r.dateFrom);
  add('dateTo', r.dateTo);
  add('provinceId', r.provinceId);
  add('districtId', r.districtId);
  add('activeStatus', r.activeStatus);
  add('saleGroupId', r.saleGroupId);
  add('salePersonId', r.salePersonId);
  add('employeeId', r.employeeId);
  add('tagIds', r.tagIds);
  path += `&sortBy=${blank(r.sortBy) ? 'txdate_desc' : javaTrim(r.sortBy!)}`;
  const page = r.page ?? 1;
  const perPage = r.perPage ?? 20;
  path += `&page=${page < 1 ? 1 : page}&perPage=${perPage < 1 ? 20 : perPage}`;

  const response = body200(await get(deps, path));
  if (!javaTrim(response).startsWith('{')) return '[]';
  const obj = parseJson(response);
  if (!isObj(obj)) return '[]'; // new JSONObject(response) threw
  if (optInt(obj, 'status', 0) === 200 && has(obj, 'result')) return resultText(obj['result']);
  return '[]';
}

/**
 * `LeadsBoardServlet.localizeLocationNames`: English UI → `currentCityName` / `currentDistrictName` by the keyed names of the master-data dictionary
 * (`province.<code>` / `district.<code>`, the Thai name stays where there is none); Thai UI → `currentCountryName` by the Thai dictionary
 * (the service names countries in English). Both lists of items: `leads.items[]` (List) and `kanban[].items[]` (Board). A text that is not a JSON
 * object (`[]`, an array result) goes back as it is.
 */
export function localizeLocationNames(deps: RestDeps, json: string): string {
  const en = deps.lang() === 'en';
  const payload = parseJson(json);
  if (!isObj(payload)) return json;
  const items = (list: unknown): void => {
    if (!isArr(list)) return;
    for (const it of list) {
      if (!isObj(it)) continue;
      if (en) {
        const city = optString(it, 'currentCityName', '');
        if (!blank(city)) it['currentCityName'] = translateProvince(deps, optString(it, 'currentCityCode', ''), city);
        const district = optString(it, 'currentDistrictName', '');
        if (!blank(district)) it['currentDistrictName'] = translateDistrict(deps, optString(it, 'currentDistrictCode', ''), district);
        continue; // the service already names the country in English
      }
      const country = optString(it, 'currentCountryName', '');
      if (blank(country)) continue;
      it['currentCountryName'] = translateTh(deps, optString(it, 'currentCountryCode', ''), country);
    }
  };
  const leads = payload['leads'];
  if (isObj(leads)) items(leads['items']);
  const kanban = payload['kanban'];
  if (isArr(kanban)) for (const col of kanban) if (isObj(col)) items(col['items']);
  return JSON.stringify(payload);
}

/* ---------------------------------------------------------------- filter states (HttpSession → sessionStorage) */

/** `HttpSession["ld_filter_state"]` and `["ld_detail_filter_state"]`: one entry per signed-in user in the storage of the tab (gone with the tab, like the session) */
export const FILTER_STATE_KEY = 'ts.leads.filter-state';
export const DETAIL_FILTER_STATE_KEY = 'ts.lead-detail.filter-state';

const memory = new Map<string, string>(); // no storage (Node, a blocked storage): it lives as long as the page does
const store = {
  get(key: string): string | null {
    try {
      if (typeof sessionStorage !== 'undefined') return sessionStorage.getItem(key);
    } catch {
      /* storage blocked */
    }
    return memory.get(key) ?? null;
  },
  set(key: string, value: string | null): void {
    try {
      if (typeof sessionStorage !== 'undefined') {
        if (value === null) sessionStorage.removeItem(key);
        else sessionStorage.setItem(key, value);
        return;
      }
    } catch {
      /* storage blocked: keep it in memory */
    }
    if (value === null) memory.delete(key);
    else memory.set(key, value);
  },
};
const stateKey = (deps: RestDeps, base: string): string => `${base}:${deps.user.username}`;

/** what the session holds for the lead board (`LeadBoardView.init()` reads it for the page; `FilterStateServlet` GET answers it): the saved text, or `null` when there is none */
export function savedFilterState(deps: RestDeps): string | null {
  const saved = store.get(stateKey(deps, FILTER_STATE_KEY));
  return saved !== null && !blank(saved) ? saved : null;
}

/* ---------------------------------------------------------------- ContactChannel */

/** `ContactChannel.O2O_LABEL`: the key is the channel in lower case without anything but a-z / 0-9 */
const O2O_LABEL: Record<string, string> = {
  manual: 'Manual',
  callin: 'Call In',
  callout: 'Call Out',
  sms: 'SMS',
  email: 'Email',
  facebook: 'Facebook',
  line: 'Line',
  whatsapp: 'WhatsApp',
};

/** `ContactChannel.toO2oLabel`: `call_out` / `Call out` / `CALL-OUT` → "Call Out"; an unknown channel goes on trimmed, as it is */
export function toO2oLabel(raw: string): string {
  const trimmed = javaTrim(raw);
  const key = trimmed.toLowerCase().replace(/[^a-z0-9]/g, '');
  return Object.hasOwn(O2O_LABEL, key) ? O2O_LABEL[key] : trimmed;
}

/* ---------------------------------------------------------------- LeadUpdateServlet */

/** the body and the call of one `action` of `LeadUpdateServlet`; a NumberFormatException of the Java code is a throw here too (→ 500 "server error") */
async function leadUpdate(deps: RestDeps, action: string, p: (name: string) => string): Promise<string | null> {
  const lng = (name: string): bigint => javaParseLong(p(name)) ?? 0n;
  const unguardedLong = (name: string): bigint => {
    const n = javaParseLong(p(name));
    if (n === undefined) throw new Error(`NumberFormatException: For input string: "${p(name)}"`);
    return n;
  };
  const patch = async (path: string, fields: [string, string][]): Promise<string> => (await sendJson(deps, 'PATCH', path, jsonObject(fields))).text;
  switch (action) {
    case 'target-year': {
      const leadId = lng('leadId');
      return patch('/leads/target-year', [['leadId', String(leadId)], ['yearCode', JSON.stringify(p('yearCode'))]]);
    }
    case 'target-month': {
      const leadId = lng('leadId');
      const month = BigInt.asIntN(32, lng('month')); // (int) of a long
      return patch('/leads/target-month', [['leadId', String(leadId)], ['month', String(month)]]);
    }
    case 'amount': {
      const leadId = lng('leadId');
      const amount = javaDecimalLiteral(p('amount')) ?? '0'; // new BigDecimal(…) or ZERO
      return patch('/leads/amount', [['leadId', String(leadId)], ['amount', amount]]);
    }
    case 'tags': {
      const leadId = lng('leadId');
      const ids: string[] = [];
      for (const part of p('tagIds').split(',')) {
        const t = javaTrim(part);
        const id = t ? javaParseLong(t) : undefined;
        if (id !== undefined) ids.push(String(id)); // an entry that is not a long is skipped
      }
      return (await sendJson(deps, 'PUT', `/leads/${leadId}/tags`, jsonObject([['tagIds', `[${ids.join(',')}]`]]))).text;
    }
    case 'assign': {
      const leadId = lng('leadId');
      const fields: [string, string][] = [['leadId', String(leadId)]];
      for (const name of ['saleGroupId', 'salePersonId', 'employeeId']) if (p(name) !== '') fields.push([name, String(unguardedLong(name))]);
      return patch('/leads/assign', fields);
    }
    case 'active-status': {
      const leadId = lng('leadId');
      return patch('/leads/active-status', [['leadId', String(leadId)], ['activeStatus', JSON.stringify(p('activeStatus'))]]);
    }
    case 'demand': {
      const leadId = lng('leadId');
      return patch('/leads/demand', [['leadId', String(leadId)], ['demand', JSON.stringify(p('demand'))]]);
    }
    default:
      return null;
  }
}

/* ---------------------------------------------------------------- the routes */

/** the routes of the lead board; compose them into the backend of a page (`composeRoutes(…, opportunitiesRoutes(deps))`) */
export function opportunitiesRoutes(deps: RestDeps): RouteHandler {
  return async (path, query, init) => {
    const method = (init?.method ?? 'GET').toUpperCase();
    switch (path) {
      /* ---- LeadsBoardServlet ---- */
      case '/board/leads': {
        if (method !== 'GET') return methodNotAllowed();
        // no CRM_Lead_View: "[]", the service is not asked
        if (!deps.hasRole(ROLE_CRM_LEAD_VIEW)) return textResponse(200, '[]');
        try {
          let body = await fetchLeadsJson(deps, {
            viewMode: strParam(query, 'viewMode', 'board'),
            movementTypeId: strParam(query, 'movementTypeId', ''),
            activityGroupId: strParam(query, 'activityGroupId', ''),
            activityStepId: strParam(query, 'activityStepId', ''),
            search: strParam(query, 'search', ''),
            showClosed: strParam(query, 'showClosed', ''),
            dateRangeType: strParam(query, 'dateRangeType', ''),
            dateFrom: strParam(query, 'dateFrom', ''),
            dateTo: strParam(query, 'dateTo', ''),
            provinceId: strParam(query, 'provinceId', ''),
            districtId: strParam(query, 'districtId', ''),
            activeStatus: strParam(query, 'activeStatus', ''),
            saleGroupId: strParam(query, 'saleGroupId', ''),
            salePersonId: '', // the servlet leaves the person out: only employeeId goes on
            employeeId: strParam(query, 'employeeId', ''),
            tagIds: strParam(query, 'tagIds', ''),
            sortBy: strParam(query, 'sortBy', 'txdate_desc'),
            page: intParam(query, 'page', 1),
            perPage: intParam(query, 'perPage', 20),
          });
          if (blank(body)) body = '[]';
          return textResponse(200, localizeLocationNames(deps, body));
        } catch {
          return textResponse(500, '[]');
        }
      }

      /* ---- FilterStateServlet / DetailFilterStateServlet ---- */
      case '/board/filter-state':
      case '/board/detail-filter-state': {
        const detail = path === '/board/detail-filter-state';
        const key = stateKey(deps, detail ? DETAIL_FILTER_STATE_KEY : FILTER_STATE_KEY);
        if (method === 'GET') {
          const saved = store.get(key);
          return textResponse(200, saved !== null && !blank(saved) ? saved : 'null');
        }
        if (method !== 'POST') return methodNotAllowed();
        const body = readBody(init);
        // the board keeps any body that is not empty; the detail page also drops its state on the text "null"
        if (detail && (body === '' || body === 'null')) store.set(key, null);
        else if (body !== '') store.set(key, body);
        return new Response(null, { status: 204 });
      }

      /* ---- AssignLeadServlet ---- */
      case '/board/lead-assign': {
        if (method !== 'POST') return methodNotAllowed();
        const requestBody = readBody(init);
        if (requestBody === '') return textResponse(400, '{"error":"body required"}');
        const result = (await sendJson(deps, 'PATCH', '/leads/assign', requestBody)).text; // sendPATCH: the body of any status
        return textResponse(200, blank(result) ? '{}' : result);
      }

      /* ---- ContactActivitiesServlet ---- */
      case '/board/contact-activities': {
        if (method !== 'POST') return methodNotAllowed();
        const body = parseJson(readBody(init));
        if (!isObj(body)) return textResponse(400, '{"error":"invalid json body"}');
        if (!has(body, 'leadId') || body['leadId'] === null) return textResponse(400, '{"error":"leadId required"}');
        const leadId = body['leadId']; // (in the path of the service, not in its body)
        delete body['leadId'];
        const channel = optString(body, 'channel', '');
        if (!blank(channel)) body['channel'] = toO2oLabel(channel);
        const pr = await sendJson(deps, 'POST', `/leads/${javaText(leadId)}/contact-activities`, JSON.stringify(body));
        // the status of the service goes on, whatever it is (a rejection must not look like a success); no answer at all = 502
        return answer(pr.status >= 100 ? pr.status : 502, blank(pr.text) ? '{}' : pr.text);
      }

      /* ---- LeadUpdateServlet ---- */
      case '/board/lead-update': {
        if (method !== 'POST') return methodNotAllowed();
        const param = requestParam(query, init);
        const p = (name: string): string => javaTrim(param(name) ?? '');
        const action = p('action');
        try {
          const out = await leadUpdate(deps, action, p);
          if (out === null) return textResponse(400, `{"status":400,"message":"unknown action: ${action}"}`);
          return textResponse(200, blank(out) ? '{}' : out);
        } catch {
          return textResponse(500, '{"status":500,"message":"server error"}');
        }
      }

      /* ---- LeadMaterialsServlet ---- */
      case '/board/lead-materials': {
        if (method === 'POST') {
          const result = (await sendJson(deps, 'POST', '/leads/materials', readBody(init))).text; // sendPOST: the body of any status
          return textResponse(200, blank(result) ? '{}' : result);
        }
        if (method === 'DELETE') {
          const u = await sendJson(deps, 'DELETE', '/leads/materials', readBody(init));
          // the servlet's own HttpURLConnection: no answer at all = an exception = 500 with "{}"; otherwise 200 with the (trimmed) body of any status
          if (u.status === 0) return textResponse(500, '{}');
          const result = javaTrim(u.text);
          return textResponse(200, result === '' ? '{}' : result);
        }
        return methodNotAllowed();
      }

      default:
        return null;
    }
  };
}
