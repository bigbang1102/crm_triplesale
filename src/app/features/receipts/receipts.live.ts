/**
 * The LIVE backend of the two receipt (RV) screens — the list `sales/receipts` and the form `sales/receipts/:id`: what the servlet
 * `RvApiServlet` and the service `RvApiService` (with `RvDetailNormalizer`) did on the server, done in the browser. The page scripts keep
 * asking `/rvapi?action=list&page=1&pageSize=500`, `/rvapi?action=approve&txno=…` …; `fetch()` answers with a real `Response`, built from
 * the REST calls of `triplesale-service` (`/api/v1/rv…`, `/api/v1/master-data/…`) through the app's HttpClient (Bearer token, a 401 ends
 * the session, the API log of the top bar).
 *
 * What the servlet did, to the letter (see the spec for every case):
 *   - `action` (trimmed) picks the call; GET: list · detail · leads · materials · products · branches · currencies · receiveMethods ·
 *     attachFileTypes; POST: create · attach (both need CRM_RV_View / CRM_RV_Edit / FEATURE_CRM_Document → else 403) · calculate · approve
 *     (the same roles → 403; no `txno` → 400); anything else is 400 `{"message":"unknown action"}`.
 *   - `Data_API.sendGET` gave the body of a 200 answer and "" for anything else; `RvApiService.safeJson` turned every answer that is not
 *     a JSON object into `{"status":502,"message":"backend ไม่ตอบหรือ response ไม่ใช่ JSON"}` — HTTP 200, always: the page tells a failed
 *     call from a good one by the body, never by the status of /rvapi (only the role checks and the unknown action use a status).
 *   - `Data_API.sendPOST` gave the body of ANY status (so a refusal of the service reaches the page as it came, HTTP 200 of /rvapi).
 *   - `detail` is normalised (RvDetailNormalizer, `receipts.logic.ts`); `leads` and `materials` swallow every failure into a list;
 *     `create` and `attach` count / read before and after and report `verify` — the backend once answered 200 without saving anything.
 *
 * Composed with the routes the pages also use: `/board/lead` (`opportunityCoreRoutes`, done) and `/board/prospect`, `/board/prospect-list`
 * (`prospectRoutes`: the prospects worker's — until they exist the form gets a 404 for them).
 *
 * Not ported: the 30-minute caches of materials / products / currencies / receive methods / attach file types (static, shared by all
 * sessions) and of the branches (in the session of the user) — performance only; a cache that is emptied at every login/logout in Java
 * has no use in a tab that asks again when the page opens. The 500 `{"message":"internal error"}` of a servlet that threw is kept for an
 * exception here (there is none to expect). The PDF servlets `/rvreport` and `/rvreceipt` are `file()` — see receipts.live.files.ts.
 */
import { opportunityCoreRoutes } from '@core/live/opportunity-core.live';
import { prospectRoutes } from '@core/live/prospect.live';
import { body200, composeRoutes, get, jsonResponse, service, textResponse, type RestDeps, type RouteHandler, type Upstream } from '@core/live/rest';
import { javaTrim, urlEncode } from './java-text';
import { normalizeRvDetailJson } from './receipts.logic';
import { liveReceiptFile } from './receipts.live.files';
import { addMaterialsPage, attachCountOf, leadRows, parseOrWrap, remarkOf, safeJson, totalOf } from './receipts.live.parse';
import type { ReceiptsBackend } from './receipts-backend';

/** `RvApiServlet.ROLE_RV_APPROVE` / `ROLE_RV_WRITE` — any one of them is enough (`SessionRoles.hasRole` is an OR over the list) */
const ROLE_RV_APPROVE = 'CRM_RV_View,CRM_RV_Edit,FEATURE_CRM_Document';
const ROLE_RV_WRITE = 'CRM_RV_View,CRM_RV_Edit,FEATURE_CRM_Document';

/** `RvApiService.RV_LEADS_PAGE_SIZE` */
const RV_LEADS_PAGE_SIZE = 500;
/** `RvApiService.MATERIALS_PAGE_SIZE` / `MATERIALS_SCAN_MAX_PAGES` */
const MATERIALS_PAGE_SIZE = 30;
const MATERIALS_SCAN_MAX_PAGES = 40;

const JSON_UTF8 = { 'Content-Type': 'application/json; charset=UTF-8' };

/** `SessionRoles.hasRole(list)`: any one of the comma separated keys */
const hasAnyRole = (deps: RestDeps, list: string): boolean => list.split(',').some((key) => deps.hasRole(key.trim()));

/** `RvApiServlet.param`: the trimmed value, "" when the parameter is missing */
const param = (q: URLSearchParams, name: string): string => javaTrim(q.get(name) ?? '');

/** `BufferedReader.readLine` loops: the lines put together, no line break survives (the servlet read the request and every answer this way) */
const lines = (text: string): string => text.replace(/\r\n|\r|\n/g, '');

/** `RvApiServlet.readBody` */
const readBody = (init: RequestInit | undefined): string => (typeof init?.body === 'string' ? lines(init.body) : '');

/** `Data_API.sendGET`: the body of a 200 answer, "" for anything else */
const sendGET = (u: Upstream): string => lines(body200(u));

/** a POST with a JSON text as it is (the body is what the page / the servlet got, byte for byte): the body of the answer of ANY status, '' when there was no answer */
async function postText(deps: RestDeps, path: string, body: string, query?: Record<string, string>): Promise<string> {
  const u = await service(deps, 'POST', path, { body, headers: JSON_UTF8, query });
  return u.status === 0 ? '' : lines(u.text); // (status 0 = nothing came back; the text is then not a body of the service)
}

const json200 = (body: string): Response => textResponse(200, body);

/** the page asked for an address of /rvapi with a method the servlet does not have (the container's own 405 page: here a JSON one) */
const methodNotAllowed = (): Response => jsonResponse(405, { status: 405, message: 'Method Not Allowed' });

/** `denyWrite` / the approve check: fail closed — nothing is asked from the service */
const forbidden = (roles: string): Response => textResponse(403, `{"status":403,"message":"forbidden: ${roles} required"}`);

/* ---------------------------------------------------------------- RvApiService, one function per method */

/** `RvApiService.fetchTotal`: how many receipts the service has (all, or those found by `search`), -1 when it cannot be read */
async function fetchTotal(deps: RestDeps, search: string | null): Promise<number> {
  return totalOf(sendGET(await get(deps, '/rv', { search: search ?? undefined, page: '1', pageSize: '1' })));
}

/** `RvApiService.listJson`: GET /rv passed on, a parameter that is blank is not sent */
async function listJson(deps: RestDeps, q: URLSearchParams): Promise<string> {
  const u = await get(deps, '/rv', {
    search: param(q, 'search'),
    status: param(q, 'status'),
    dateFrom: param(q, 'dateFrom'),
    dateTo: param(q, 'dateTo'),
    page: param(q, 'page'),
    pageSize: param(q, 'pageSize'),
  });
  return safeJson(sendGET(u));
}

/** `RvApiService.detailJson`: GET /rv/{id}, normalised (an id that does not exist is a 200 with an empty result) */
async function detailJson(deps: RestDeps, id: string): Promise<string> {
  const u = await get(deps, `/rv/${urlEncode(id)}`);
  return normalizeRvDetailJson(safeJson(sendGET(u)));
}

/** `RvApiService.rvLeadsJson`: the customers of the leads for the picker — `{"result":[…]}`, empty when the call failed */
async function rvLeadsJson(deps: RestDeps, search: string): Promise<string> {
  let leads: unknown[] = [];
  try {
    const s = javaTrim(search);
    const u = await get(deps, '/rv/leads', { page: '0', pageSize: RV_LEADS_PAGE_SIZE, search: s });
    leads = leadRows(sendGET(u));
  } catch {
    // the Java servlet logged it and answered with what it had
  }
  return JSON.stringify({ result: leads });
}

/** `RvApiService.materialsJson`: every page of master-data/materials (30 a page, at most 40 pages) as `{code, name, salePrice}`, each code once */
async function materialsJson(deps: RestDeps): Promise<string> {
  const materials: Record<string, unknown>[] = [];
  const seen = new Set<string>();
  for (let page = 1; page <= MATERIALS_SCAN_MAX_PAGES; page++) {
    const u = await get(deps, '/master-data/materials', { page, pageSize: MATERIALS_PAGE_SIZE });
    const r = addMaterialsPage(sendGET(u), MATERIALS_PAGE_SIZE, seen, materials);
    if (r.failed || !r.more) break;
  }
  return JSON.stringify({ result: materials });
}

/** a master list passed on (products, branches, currencies, receive methods, attach file types) */
async function passThrough(deps: RestDeps, path: string, query?: Record<string, string | number>): Promise<string> {
  return safeJson(sendGET(await get(deps, path, query)));
}

/** `RvApiService.createAndVerifyJson`: POST /rv, and count the receipts before and after (and search the remark) to see that it was saved */
async function createAndVerifyJson(deps: RestDeps, body: string): Promise<string> {
  const totalBefore = await fetchTotal(deps, null);
  const raw = await postText(deps, '/rv', body);
  const totalAfter = await fetchTotal(deps, null);
  const remark = remarkOf(body);
  const foundByRemark = remark !== '' ? await fetchTotal(deps, remark) : -1;
  const persisted = (totalBefore >= 0 && totalAfter > totalBefore) || foundByRemark > 0;
  return JSON.stringify({ api: parseOrWrap(raw), verify: { totalBefore, totalAfter, foundByRemark, persisted } });
}

/** `RvApiService.attachAndVerifyJson`: POST /rv/{id}/attachments, verified by the number of `attach_items` before and after */
async function attachAndVerifyJson(deps: RestDeps, id: string, body: string): Promise<string> {
  const count = async (): Promise<number> => attachCountOf(sendGET(await get(deps, `/rv/${urlEncode(id)}`)));
  const attachCountBefore = await count();
  const raw = await postText(deps, `/rv/${urlEncode(id)}/attachments`, body);
  const attachCountAfter = await count();
  return JSON.stringify({ api: parseOrWrap(raw), verify: { attachCountBefore, attachCountAfter, persisted: attachCountBefore >= 0 && attachCountAfter > attachCountBefore } });
}

/* ---------------------------------------------------------------- RvApiServlet */

async function doGet(deps: RestDeps, action: string, q: URLSearchParams): Promise<Response> {
  switch (action) {
    case 'list':
      return json200(await listJson(deps, q));
    case 'detail':
      return json200(await detailJson(deps, param(q, 'id')));
    case 'leads':
      return json200(await rvLeadsJson(deps, param(q, 'search')));
    case 'materials':
      return json200(await materialsJson(deps));
    case 'products':
      return json200(await passThrough(deps, '/master-data/movement-types/LD'));
    case 'branches':
      return json200(await passThrough(deps, '/master-data/business-branches', { page: 1, perPage: 500 }));
    case 'currencies':
      return json200(await passThrough(deps, '/master-data/currencies'));
    case 'receiveMethods':
      return json200(await passThrough(deps, '/master-data/receive-methods', { txType: 'rv' }));
    case 'attachFileTypes':
      return json200(await passThrough(deps, '/master-data/attach-file-types'));
    default:
      return textResponse(400, '{"message":"unknown action"}');
  }
}

async function doPost(deps: RestDeps, action: string, q: URLSearchParams, init: RequestInit | undefined): Promise<Response> {
  const body = readBody(init);
  switch (action) {
    case 'create':
      if (!hasAnyRole(deps, ROLE_RV_WRITE)) return forbidden(ROLE_RV_WRITE);
      return json200(await createAndVerifyJson(deps, body));
    case 'attach':
      if (!hasAnyRole(deps, ROLE_RV_WRITE)) return forbidden(ROLE_RV_WRITE);
      return json200(await attachAndVerifyJson(deps, param(q, 'id'), body));
    case 'calculate':
      return json200(safeJson(await postText(deps, '/rv/calculate', body)));
    case 'approve': {
      const txno = param(q, 'txno');
      // fail-closed: without the right the service is not asked at all (the page turns the 403 into its own Thai message)
      if (!hasAnyRole(deps, ROLE_RV_APPROVE)) return forbidden(ROLE_RV_APPROVE);
      if (txno === '') return textResponse(400, '{"message":"txno required"}');
      // the service takes the number as a query parameter; the body "{}" is sent as the servlet did
      return json200(safeJson(await postText(deps, '/rv/approve', '{}', { txno })));
    }
    default:
      return textResponse(400, '{"message":"unknown action"}');
  }
}

/** `RvApiServlet` (`/rvapi?action=…`) */
export function rvApiRoutes(deps: RestDeps): RouteHandler {
  return async (path, query, init) => {
    if (path !== '/rvapi') return null;
    const method = (init?.method ?? 'GET').toUpperCase();
    if (method !== 'GET' && method !== 'POST') return methodNotAllowed();
    const action = param(query, 'action');
    try {
      return method === 'GET' ? await doGet(deps, action, query) : await doPost(deps, action, query, init);
    } catch {
      return textResponse(500, '{"message":"internal error"}');
    }
  };
}

/** the live backend of both receipt screens: `deps` = the app's REST plumbing (`restDepsOf(injector)` in the host) */
export function createLiveReceipts(deps: RestDeps): ReceiptsBackend {
  return {
    fetch: composeRoutes(rvApiRoutes(deps), opportunityCoreRoutes(deps), prospectRoutes(deps)),
    file: (url) => liveReceiptFile(url, deps.lang()),
  };
}
