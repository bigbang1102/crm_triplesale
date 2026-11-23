/**
 * The lead servlets that several pages share — answered in the browser: `LeadDetailServlet` (`GET /board/lead?id=&activityGroupId=`, used by the
 * lead detail page, the work modal of activities / schedule / home, and the receipt form) and the work modal's writes `AddScheduleServlet`
 * (`POST /board/schedule/add`) and `EditScheduleServlet` (`PATCH|POST /board/schedule/edit`), with the helpers they used
 * (`LeadBoardView.fetchLeadByIdResult` / `unwrapLeadResult` / `opportunityErrorResult` / `opportunityErrorJson`, `Data_API.sendGETWithStatus` / `sendPOST` /
 * `sendPatchRequest`). Compose `opportunityCoreRoutes(deps)` into the backend of a page with `composeRoutes(…)`.
 *
 * What differs from a servlet container, on purpose: a request body that is not JSON (the container answered its own HTML 500 page) is a
 * JSON 500 here; a wrong HTTP method is a JSON 405 (the container's 405 page).
 */
import { translateDistrict, translateProvince, translateTh } from './board-master.live';
import { has, isObj, optInt, optString, parseJson, type JObj } from './org-json';
import { get, jsonResponse, sendBody, textResponse, type RestDeps, type RouteHandler } from './rest';

export const ROLE_CRM_LEAD_VIEW = 'CRM_Lead_View';

/** `LeadBoardView.opportunityErrorJson`: the error body in the shape of the backend (`{status, message, error:{code, message}}`) — the page reads `error.message` */
export const opportunityErrorJson = (status: number, message: string | null | undefined): string =>
  JSON.stringify({ status, message: message ?? '', error: { code: status, message: message ?? '' } });

/** the result of `GET /leads/{id}` (`Data_API.sendGETWithStatus`: the status and the body, also of an error) */
export interface OpportunityResult {
  status: number;
  body: string;
}

/** `LeadBoardView.fetchLeadByIdResult`: `status 0` and no body when there is no id */
export async function fetchLeadByIdResult(deps: RestDeps, id: string, activityGroupId: string): Promise<OpportunityResult> {
  if (!id.trim()) return { status: 0, body: '' };
  const ag = activityGroupId.trim();
  const u = await get(deps, `/leads/${id.trim()}${ag ? `?activityGroupId=${ag}` : ''}`);
  return { status: u.status, body: u.text };
}

/** `LeadBoardView.unwrapLeadResult`: the text of `result` of a successful answer (HTTP 200 + envelope status 200 + a result), else null */
export function unwrapLeadResult(lr: OpportunityResult | null): string | null {
  if (!lr || lr.status !== 200) return null;
  const b = lr.body.trim();
  if (!b.startsWith('{')) return null;
  const env = parseJson(b);
  if (isObj(env) && optInt(env, 'status', 0) === 200 && has(env, 'result')) {
    const r = env['result'];
    return typeof r === 'string' ? r : JSON.stringify(r);
  }
  return null;
}

/**
 * `LeadBoardView.opportunityErrorResult`: the status and body to pass on after a failure — the backend answered 200 but the envelope says no: the
 * envelope's status (when ≥ 400, else 502); no answer at all (status < 100): 502; a JSON body of the backend goes on as it is, else a built one.
 */
export function opportunityErrorResult(lr: OpportunityResult | null, defaultMsg: string): OpportunityResult {
  let status = lr?.status ?? 0;
  const raw = (lr?.body ?? '').trim();
  let env: JObj | null = null;
  if (raw.startsWith('{')) {
    const p = parseJson(raw);
    env = isObj(p) ? p : null;
  }
  if (status === 200) status = env && optInt(env, 'status', 0) >= 400 ? optInt(env, 'status', 502) : 502;
  else if (status < 100) status = 502;
  return { status, body: env ? raw : opportunityErrorJson(status, defaultMsg) };
}

/** `LeadDetailServlet.localizeProspectLocation`: the prospect gets `current{City,District,Country}NameI18n` for the language of the page */
export function localizeProspectLocation(deps: RestDeps, json: string): string {
  const root = parseJson(json);
  if (!isObj(root)) return json;
  const p = root['prospect'];
  if (!isObj(p)) return json;
  const en = deps.lang() === 'en';
  const city = optString(p, 'currentCityName', '');
  const district = optString(p, 'currentDistrictName', '');
  const country = optString(p, 'currentCountryName', '');
  const countryCode = optString(p, 'currentCountryCode', '');
  p['currentCityNameI18n'] = en ? translateProvince(deps, optString(p, 'currentCityCode', ''), city) : city;
  p['currentDistrictNameI18n'] = en ? translateDistrict(deps, optString(p, 'currentDistrictCode', ''), district) : district;
  p['currentCountryNameI18n'] = en ? country : translateTh(deps, countryCode, country);
  return JSON.stringify(root);
}

const methodNotAllowed = (): Response => jsonResponse(405, { status: 405, message: 'Method Not Allowed' });

/** the JSON object a page posted, or null when the body is not one */
function postedObject(init: RequestInit | undefined): JObj | null {
  const b = init?.body;
  if (typeof b !== 'string') return null;
  const p = parseJson(b.trim());
  return isObj(p) ? p : null;
}

/** the answer of the schedule servlets: the body of the service as it came; blank = the stand-in; an envelope status ≥ 400 is the HTTP status */
function scheduleAnswer(result: string, blankStand: string): Response {
  if (!result.trim()) return textResponse(200, blankStand);
  let status = 200;
  if (result.trim().startsWith('{')) {
    const p = parseJson(result);
    if (!isObj(p)) return textResponse(500, JSON.stringify({ status: 500, success: false, message: 'bad JSON from the service' }));
    const st = optInt(p, 'status', 200);
    if (st >= 400) status = st;
  }
  return textResponse(status, result);
}

/** the lead detail and the work modal's schedule writes */
export function opportunityCoreRoutes(deps: RestDeps): RouteHandler {
  return async (path, query, init) => {
    const method = (init?.method ?? 'GET').toUpperCase();
    switch (path) {
      case '/board/lead': {
        if (method !== 'GET') return methodNotAllowed();
        if (!deps.hasRole(ROLE_CRM_LEAD_VIEW)) return textResponse(403, opportunityErrorJson(403, deps.message('label.ld2.lead_no_permission')));
        const id = (query.get('id') ?? '').trim();
        const activityGroupId = (query.get('activityGroupId') ?? '').trim();
        const lr = await fetchLeadByIdResult(deps, id, activityGroupId);
        const result = unwrapLeadResult(lr);
        if (result !== null) return textResponse(200, localizeProspectLocation(deps, result));
        const er = opportunityErrorResult(lr, deps.message('label.ld2.lead_load_failed_default'));
        return textResponse(er.status, er.body);
      }
      case '/board/schedule/add': {
        if (method !== 'POST') return methodNotAllowed();
        const obj = postedObject(init);
        if (!obj) return jsonResponse(500, { status: 500, success: false, message: 'request body is not a JSON object' });
        // the work modal talks of movementTypeId / activityGroupId; the service wants procedureGroupId
        delete obj['movementTypeId'];
        if (has(obj, 'activityGroupId')) {
          const agid = obj['activityGroupId'];
          delete obj['activityGroupId'];
          if (!has(obj, 'procedureGroupId') && agid !== undefined && agid !== null) obj['procedureGroupId'] = agid;
        }
        return scheduleAnswer(await sendBody(deps, 'POST', '/schedules', obj), '{"status":201,"success":true}');
      }
      case '/board/schedule/edit': {
        if (method !== 'PATCH' && method !== 'POST') return methodNotAllowed();
        const obj = postedObject(init);
        const id = obj ? optInt(obj, 'id', Number.NaN) : Number.NaN;
        if (!obj || Number.isNaN(id)) return jsonResponse(500, { status: 500, success: false, message: 'JSONObject["id"] not found.' });
        delete obj['leadId'];
        delete obj['id'];
        return scheduleAnswer(await sendBody(deps, 'PATCH', `/schedules/${id}`, obj), '{"status":200,"success":true}');
      }
      default:
        return null;
    }
  };
}

