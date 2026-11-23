/**
 * The lead-action servlets of the lead detail page, answered in the browser (ADR-001: no Tomcat, no BFF). The page keeps asking its old
 * URLs (`fetch('../board/lead/close', …)`); `opportunityActionRoutes(deps)` answers them with real `Response`s built from calls to `{api}` =
 * `/triplesale-service/api/v1` through `RestDeps.call` (the app's HttpClient: Bearer token, 401 = the session ended, the API log).
 *
 *   POST /board/lead/close              LeadCloseServlet            POST /leads/{leadId}/close         {outcome}
 *   POST /board/lead/close-step         LeadCloseStepServlet        POST /leads/{leadId}/close-step    {wfsId, remark}
 *   POST /board/lead/forward            LeadForwardServlet          POST /leads/{leadId}/forward       {targets, [currentActivityGroupId], [remark]}
 *   POST /board/lead/return             LeadReturnServlet           POST /leads/{leadId}/return        {currentActivityGroupId, returnToActivityGroupId, remark}
 *   POST /board/lead/accessor-add       LeadAccessorAddServlet      POST /leads/{leadId}/accessors     (the posted body, untouched)
 *   GET  /board/lead/contact-history    LeadContactHistoryServlet   GET  /leads/{leadId}/contact-history
 *   GET  /board/lead/forward-groups     LeadForwardGroupsServlet    GET  /leads/{leadId}/forward-groups[?currentActivityGroupId=]
 *   GET  /board/lead/forward-employees  LeadForwardEmployeesServlet GET /leads/{leadId}/forward-employees[?activityGroupId=&currentActivityGroupId=]
 *   GET  /board/lead/return-groups      LeadReturnGroupsServlet     GET  /leads/{leadId}/return-groups[?currentActivityGroupId=]
 *   GET  /board/lead/accessors          LeadAccessorsSearchServlet  GET  /leads/{leadId}/accessors?all=true
 *
 * What a servlet did is kept to the letter (the Java files are the truth): the checks of the posted JSON and their 400 bodies, the URL the
 * service was asked (the lead id goes into the path as it is, only the `…GroupId` query values are `URLEncoder`-encoded, blank ones are left
 * out), the body the service was sent, and the envelope handling — `Data_API.sendPOST` = the body of the answer WHATEVER its status,
 * `Data_API.sendGET` = the body of a 200 answer only, "" for anything else. A blank answer becomes the stand-in the servlet wrote
 * (`{"status":204,"message":"no content"}`, `{}` for the contact history and the add-accessor call). The HTTP status of the page's answer is
 * 200 whatever the service said (the page reads `status` / `message` of the body) — also when the service answered an error with an empty
 * body, which then looks like the 204 stand-in (that is what the Java servlets did; see INTEGRATION.md).
 *
 * None of these servlets looked at the roles of the user (the service decides) and none kept anything in the HttpSession.
 *
 * Not ported, on purpose:
 *  - the `catch (Exception)` → HTTP 500 `{"status":500,"message":…}` of every POST servlet and of the forward-employees / forward-groups /
 *    return-groups / accessors / contact-history ones: nothing inside those `try` blocks can throw (`TriplesaleApi.authTokenFresh()` answers
 *    "" at worst, `Data_API` swallows every IOException and answers ""), and neither can this port;
 *  - `Cache-Control` / `Pragma` / `Expires` headers (no HTTP cache sits between the page and `RestDeps.call`).
 *
 * What differs from a servlet container, on purpose: a wrong HTTP method is a JSON 405 (the container's own page).
 */
import { javaTrim, javaUrlEncode, readBody } from './opportunities.live';
import { isArr, isObj, optLong, optString, parseJson, type JObj } from './org-json';
import { body200, get, jsonResponse, service, textResponse, type RestDeps, type RouteHandler } from './rest';

/* ---------------------------------------------------------------- Java semantics the servlets relied on */

/** `String.isBlank()`: empty or only `Character.isWhitespace` characters (the no-break spaces U+00A0 / U+2007 / U+202F are NOT whitespace there) */
const JAVA_BLANK = new RegExp('^[\\t\\n\\u000B\\f\\r\\u001C-\\u001F \\u1680\\u2000-\\u2006\\u2008-\\u200A\\u2028\\u2029\\u205F\\u3000]*$');
export const javaBlank = (s: string | null | undefined): boolean => s == null || JAVA_BLANK.test(s);

/** what the servlets wrote when the service answered nothing readable */
export const NO_CONTENT = '{"status":204,"message":"no content"}';

const methodNotAllowed = (): Response => jsonResponse(405, { status: 405, message: 'Method Not Allowed' });

/** `Content-Type: application/json; charset=UTF-8` — what `Data_API.sendPOST` sent with every body */
const JSON_BODY = { 'Content-Type': 'application/json; charset=UTF-8' };

/** `Data_API.sendPOST(url, token, json)`: the body of the answer whatever the status ('' when there is none or no answer at all) */
async function sendPost(deps: RestDeps, path: string, bodyText: string): Promise<string> {
  return (await service(deps, 'POST', path, { body: bodyText, headers: JSON_BODY })).text;
}

/** `new JSONObject(text)` of the posted body: the object, null where Java threw (the servlets ignored that and went on with nothing) */
function postedObject(init: RequestInit | undefined): JObj | null {
  const p = parseJson(readBody(init));
  return isObj(p) ? p : null;
}

/** `String.valueOf(body.opt("leadId"))`: the text of the value — `null` (Java null) when the body was no object, `"null"` for a missing or JSON-null one */
function leadIdOf(body: JObj | null): string | null {
  if (!body) return null;
  const v = body['leadId'];
  if (v === undefined || v === null) return 'null';
  if (typeof v === 'string') return v;
  if (typeof v === 'object') return JSON.stringify(v);
  return String(v);
}
/** `leadId == null || leadId.isBlank() || "null".equals(leadId)` */
const missingLeadId = (leadId: string | null): boolean => leadId === null || javaBlank(leadId) || leadId === 'null';

/** the 400 every servlet wrote for a request that lacks what it needs */
const missingParams = (what: string): Response => textResponse(400, `{"status":400,"message":"missing params: ${what}"}`);

/** the answer of a POST servlet: the body of the service, the stand-in when it is blank — always HTTP 200 */
const postAnswer = (result: string): Response => textResponse(200, javaBlank(result) ? NO_CONTENT : result);

/** `req.getParameter("leadId")` of a GET servlet that answers `{"status":400,"message":"missing param: leadId"}` without it */
const missingParam = (name: string): Response => textResponse(400, `{"status":400,"message":"missing param: ${name}"}`);

/**
 * a GET servlet that forwards `GET /leads/{leadId}/{what}[?query]`: `Data_API.sendGET` (a 200 answer only), a blank answer is `standIn`.
 * `query` entries are `[name, value]` — the value is `trim()`med and `URLEncoder`-encoded, a missing or empty one is left out.
 */
async function forwardGet(deps: RestDeps, leadId: string, what: string, query: [string, string | null][], standIn: string, blank: (s: string) => boolean): Promise<Response> {
  const qs = query
    .filter(([, v]) => v !== null && javaTrim(v) !== '')
    .map(([k, v]) => `${k}=${javaUrlEncode(javaTrim(v as string))}`)
    .join('&');
  const result = body200(await get(deps, `/leads/${javaTrim(leadId)}/${what}${qs ? `?${qs}` : ''}`));
  return textResponse(200, blank(result) ? standIn : result);
}

/** `result.trim().isEmpty()` (contact history, add accessor) */
const trimEmpty = (s: string): boolean => javaTrim(s) === '';

/* ---------------------------------------------------------------- the routes */

/** the routes of the lead actions; compose them into the backend of the lead detail page (`composeRoutes(…, opportunityActionRoutes(deps))`) */
export function opportunityActionRoutes(deps: RestDeps): RouteHandler {
  return async (path, query, init) => {
    const method = (init?.method ?? 'GET').toUpperCase();
    switch (path) {
      /* ---- LeadCloseServlet: close the lead as sold / lost ---- */
      case '/board/lead/close': {
        if (method !== 'POST') return methodNotAllowed();
        const body = postedObject(init);
        const leadId = leadIdOf(body);
        const outcome = body ? optString(body, 'outcome', '') : '';
        if (missingLeadId(leadId) || !(outcome === 'sold' || outcome === 'lost')) return missingParams('leadId, outcome (sold|lost)');
        return postAnswer(await sendPost(deps, `/leads/${leadId}/close`, `{"outcome":"${outcome}"}`));
      }

      /* ---- LeadCloseStepServlet: lock the current workflow step ---- */
      case '/board/lead/close-step': {
        if (method !== 'POST') return methodNotAllowed();
        const body = postedObject(init);
        const leadId = leadIdOf(body);
        const wfsId = body ? optLong(body, 'wfsId', 0) : 0;
        const remark = body ? optString(body, 'remark', '') : '';
        if (missingLeadId(leadId) || wfsId <= 0) return missingParams('leadId, wfsId');
        return postAnswer(await sendPost(deps, `/leads/${leadId}/close-step`, JSON.stringify({ wfsId, remark })));
      }

      /* ---- LeadForwardServlet: hand the work on (the workflow can fork into several teams) ---- */
      case '/board/lead/forward': {
        if (method !== 'POST') return methodNotAllowed();
        const body = postedObject(init);
        const leadId = leadIdOf(body);
        const targets = body && isArr(body['targets']) ? body['targets'] : null; // optJSONArray: only a real array
        const remark = body ? optString(body, 'remark', '') : '';
        const currentActivityGroupId = body ? optLong(body, 'currentActivityGroupId', 0) : 0;
        if (missingLeadId(leadId) || targets === null || targets.length === 0) return missingParams('leadId, targets');
        const payload: JObj = { targets };
        if (currentActivityGroupId > 0) payload['currentActivityGroupId'] = currentActivityGroupId;
        if (!javaBlank(remark)) payload['remark'] = remark;
        return postAnswer(await sendPost(deps, `/leads/${leadId}/forward`, JSON.stringify(payload)));
      }

      /* ---- LeadReturnServlet: send the current step back for correction ---- */
      case '/board/lead/return': {
        if (method !== 'POST') return methodNotAllowed();
        const body = postedObject(init);
        const leadId = leadIdOf(body);
        const currentActivityGroupId = body ? optLong(body, 'currentActivityGroupId', 0) : 0;
        const returnToActivityGroupId = body ? optLong(body, 'returnToActivityGroupId', 0) : 0;
        const remark = body ? optString(body, 'remark', '') : '';
        if (missingLeadId(leadId) || currentActivityGroupId <= 0 || returnToActivityGroupId <= 0) {
          return missingParams('leadId, currentActivityGroupId, returnToActivityGroupId');
        }
        return postAnswer(await sendPost(deps, `/leads/${leadId}/return`, JSON.stringify({ currentActivityGroupId, returnToActivityGroupId, remark })));
      }

      /* ---- LeadAccessorAddServlet: add the people who may reach the lead (the posted body goes on untouched) ---- */
      case '/board/lead/accessor-add': {
        if (method !== 'POST') return methodNotAllowed();
        const leadId = query.get('leadId');
        if (leadId === null || javaTrim(leadId) === '') return missingParam('leadId');
        const requestBody = readBody(init);
        if (requestBody === '') return textResponse(400, '{"status":400,"message":"body required"}');
        const result = await sendPost(deps, `/leads/${javaTrim(leadId)}/accessors`, requestBody);
        return textResponse(200, trimEmpty(result) ? '{}' : result);
      }

      /* ---- LeadContactHistoryServlet ---- */
      case '/board/lead/contact-history': {
        if (method !== 'GET') return methodNotAllowed();
        const leadId = query.get('leadId');
        if (leadId === null || javaTrim(leadId) === '') return textResponse(400, '{"error":"leadId required"}');
        return forwardGet(deps, leadId, 'contact-history', [], '{}', trimEmpty);
      }

      /* ---- LeadForwardGroupsServlet / LeadReturnGroupsServlet / LeadForwardEmployeesServlet / LeadAccessorsSearchServlet ---- */
      case '/board/lead/forward-groups':
      case '/board/lead/return-groups': {
        if (method !== 'GET') return methodNotAllowed();
        const leadId = query.get('leadId');
        if (leadId === null || javaTrim(leadId) === '') return missingParam('leadId');
        const what = path === '/board/lead/forward-groups' ? 'forward-groups' : 'return-groups';
        return forwardGet(deps, leadId, what, [['currentActivityGroupId', query.get('currentActivityGroupId')]], NO_CONTENT, javaBlank);
      }
      case '/board/lead/forward-employees': {
        if (method !== 'GET') return methodNotAllowed();
        const leadId = query.get('leadId');
        if (leadId === null || javaTrim(leadId) === '') return missingParam('leadId');
        return forwardGet(deps, leadId, 'forward-employees', [['activityGroupId', query.get('activityGroupId')], ['currentActivityGroupId', query.get('currentActivityGroupId')]], NO_CONTENT, javaBlank);
      }
      case '/board/lead/accessors': {
        if (method !== 'GET') return methodNotAllowed();
        const leadId = query.get('leadId');
        if (leadId === null || javaTrim(leadId) === '') return missingParam('leadId');
        return forwardGet(deps, leadId, 'accessors', [['all', 'true']], NO_CONTENT, javaBlank);
      }

      default:
        return null;
    }
  };
}
