/**
 * The prospect servlets of the Java board answered in the browser — every page that shows or edits a customer composes `prospectRoutes(deps)`
 * (`composeRoutes(…, prospectRoutes(deps))`):
 *
 *   GET  /board/prospect-list              ProspectListServlet + ProspectListService   (prospect-list.live.ts)
 *   GET  /board/prospect-enrich            ProspectEnrichServlet                       (prospect-list.live.ts)
 *   GET  /board/prospect?id=               ProspectDetailServlet     → GET /prospects/{id}
 *   GET  /board/prospect-leads             ProspectLeadsServlet      → GET /master-data/movement-types/LD, GET /leads (per product / step group)
 *   POST /board/prospect/save              ProspectSaveServlet       → PUT /prospects/{id}, PUT /prospects/{id}/extra-info
 *   POST /board/prospect/update            ProspectUpdateServlet     NOT PORTED — it wrote the database (ProspectBoDao); no page calls it any more
 *   GET|POST|DELETE /board/prospect/attachments   ProspectAttachmentsServlet → GET|POST /prospects/{id}/attachments, DELETE …/{docNo}
 *   POST /board/prospect/avatar            ProspectAvatarServlet     → POST /prospects/{id}/attachments (PROFILE), GET + PUT /prospects/{id}
 *   GET  /board/prospect/rv-attachments    RvAttachmentsServlet      → GET /rv/attachments?prospectId=
 *   POST /board/chat-prospect-create       ChatProspectCreateServlet → GET /master-data/activity-groups, POST /prospects/chat
 *   GET  /docproxy?url=                    DocProxy                  → the file server (prospect-files.live.ts)
 * and, for the pages that create a lead from a customer, `opportunityCreateRoutes`: POST /board/lead-create (LeadCreateServlet) → POST /leads, PATCH /leads/assign.
 *
 * Each route does what the servlet did — the checks and their answers, the call to the service (path, query, body, order), the cleaning of the
 * answer, the status and body of every failure. A servlet that failed with a Java exception (a body that is not JSON …) answered 500 with the
 * text of the exception; the texts of org.json are not reproduced word for word (the page never sends such a body).
 *
 * NOT PORTED / CHANGED ON PURPOSE (details and the questions for the owners are in INTEGRATION.md):
 *   - the database: `SunProspectInfoBoDao.ensureForProspect` (the row the service wanted before `/attachments`; skipped — if the service still
 *     needs it the user gets its own error message), `ProspectBoDao.updateProspect` (the whole of ProspectUpdateServlet), the optional DB merge of
 *     ProspectDetailServlet (`ENABLE_DB_MERGE_PATCH = false` in Java, and the save fallback `ENABLE_DB_FALLBACK = false`: both were off);
 *   - the per-session caches (the 120 s cache of the enrich answers);
 *   - `/docproxy`: the browser fetches the file server itself, without the host allow-list (needs CORS there); an `<img src>` that Java pointed at
 *     `/docproxy` points at the file itself.
 */
import { ROLE } from '../permissions/roles';
import { fetchDetails, fetchPage, type ListQuery } from './prospect-list.live';
import { attachmentsEnvelope, normalizeProspectV2, takeAttachments } from './prospect-v2.live';
import { browserFileIo, allowedUploadExtText, docProxy, isAllowedUploadName, javaUrlEncode, probe, verifyFailMessage, type FileIo } from './prospect-files.live';
import { collapse, extraInfoBody, jtrim, mainBody, optObject, toRelative, toRelativeIn } from './prospect-payload.live';
import { has, isArr, isObj, optInt, optLong, optString, parseJson, type JObj } from './org-json';
import { body200, get, jsonResponse, sendBody, service, textResponse, type RestDeps, type RouteHandler, type Upstream } from './rest';

/* ---------------------------------------------------------------- small shared helpers */

const methodNotAllowed = (): Response => jsonResponse(405, { status: 405, message: 'Method Not Allowed' });
const json = (status: number, body: unknown): Response => textResponse(status, JSON.stringify(body));

/** `trimParam`: the parameter trimmed, "" when it is missing */
const trimParam = (q: URLSearchParams, name: string): string => jtrim(q.get(name) ?? '');

/** `Integer.parseInt(trim)` of a parameter, the fallback when it is blank or not an int */
function intParam(q: URLSearchParams, name: string, fallback: number): number {
  const raw = trimParam(q, name);
  if (!/^[+-]?\d+$/.test(raw)) return fallback;
  const n = Number(raw);
  return n >= -2147483648 && n <= 2147483647 ? n : fallback;
}

const LONG_MAX = 9223372036854775807n;
/** `Long.parseLong(trim)`, the default when it is blank or not a long */
function parseLong(s: string | null, def: number): number {
  const t = s == null ? '' : jtrim(s);
  if (!/^[+-]?\d+$/.test(t)) return def;
  const b = BigInt(t);
  return b > LONG_MAX || b < -LONG_MAX - 1n ? def : Number(b);
}

/** the text of the request body (the pages post JSON text) */
const bodyText = (init: RequestInit | undefined): string => (typeof init?.body === 'string' ? init.body : '');

/** `new JSONObject(text)`: the object, null where Java threw */
function objectOf(text: string): JObj | null {
  const p = parseJson(text);
  return isObj(p) ? p : null;
}

/** what org.json says about a text that is not a JSON object (not word for word: the version of the shaded library is not known here) */
const BAD_JSON = "A JSONObject text must begin with '{'";

/** `String.valueOf(jsonObject.opt(key))`: the text of any value, "null" for a missing one */
function javaValueOf(v: unknown): string {
  if (v === undefined || v === null) return 'null';
  if (typeof v === 'string') return v;
  if (typeof v === 'object') return JSON.stringify(v);
  return String(v);
}

/** a response of the service that is a JSON text, or a JSON text built from it */
function parsedOrRaw(text: string): unknown {
  return objectOf(text) ?? text;
}

/* ---------------------------------------------------------------- GET /board/prospect?id= */

/**
 * ONE read of a prospect of the new service with every section. The page asks for the record (`/board/prospect?id=`) and for the documents
 * (`/board/prospect/attachments?prospectId=`) at the same moment when it opens: the two share the call that is IN FLIGHT. Nothing is kept once it
 * has answered (a read after a write, or a later read, is always a new call).
 */
const FULL_SECTIONS = 'BASE,SOCIAL,ATTACHMENTS,OPPORTUNITIES';
/** the sections of the opportunity detail: its documents are the ones of the OPPORTUNITY (OP05), so the section ATTACHMENTS of the customer is not asked */
export const SECTIONS_WITHOUT_ATTACHMENTS = 'BASE,SOCIAL,OPPORTUNITIES';
const FULL = new Map<string, Promise<string>>();
function fullRecord(deps: RestDeps, id: string, sections: string = FULL_SECTIONS): Promise<string> {
  const key = `${id}|${sections}`;
  const running = FULL.get(key);
  if (running) return running;
  const answer = (async () => body200(await get(deps, `/prospects/${encodeURIComponent(id)}`, { sections })))().finally(() => FULL.delete(key));
  FULL.set(key, answer);
  return answer;
}

/** `LeadBoardView.fetchProspectByIdJson`: the `result` of `GET /prospects/{id}` as text; "{}" for anything else */
async function fetchProspectByIdJson(deps: RestDeps, id: string, sections: string = FULL_SECTIONS): Promise<string> {
  if (jtrim(id) === '') return '{}';
  // a prospect of the new service (uuid): ONE call with every section (the record, its documents, social, opportunities). The record is lifted out of `base`;
  // the documents are kept for the documents tab (`/board/prospect/attachments` takes them: no second call)
  if (UUID.test(jtrim(id))) {
    const u = jtrim(id);
    const answer = await fullRecord(deps, u, sections);
    const root = jtrim(answer).startsWith('{') ? objectOf(answer) : null;
    const result = root && optInt(root, 'status', 0) === 200 && isObj(root['result']) ? root['result'] : null;
    if (!result) return '{}';
    return JSON.stringify(normalizeProspectV2(result));
  }
  const text = body200(await get(deps, `/prospects/${encodeURIComponent(jtrim(id))}`));
  if (!jtrim(text).startsWith('{')) return '{}';
  const obj = objectOf(text);
  if (obj && optInt(obj, 'status', 0) === 200 && has(obj, 'result')) {
    const r = obj['result'];
    return typeof r === 'string' ? r : JSON.stringify(r);
  }
  return '{}';
}

/* ---------------------------------------------------------------- GET /board/prospect-leads */

/** the most leads asked for in one call (a customer has a few; the search may bring other people's) */
const LEADS_FETCH_SIZE = 100;

/** the movement-type ids of `GET /master-data/movement-types/LD`; [""] when there are none (the service then picks the first product) */
async function movementTypeIds(deps: RestDeps): Promise<string[]> {
  const ids: string[] = [];
  const root = objectOf(body200(await get(deps, '/master-data/movement-types/LD')));
  const arr = root?.['result'];
  if (isArr(arr)) for (const it of arr) if (isObj(it) && has(it, 'id')) ids.push(javaValueOf(it['id']));
  if (ids.length === 0) ids.push('');
  return ids;
}

/** `itemsOf`: the leads of an answer — `result` itself, `result.leads.items`, or `result.items` (throws, like Java, when the text is not a JSON object) */
function leadItemsOf(response: string): unknown[] {
  if (jtrim(response) === '') return [];
  const root = objectOf(response);
  if (!root) throw new Error(BAD_JSON);
  const result = root['result'];
  if (isArr(result)) return result;
  if (isObj(result)) {
    const leads = optObject(result, 'leads');
    if (leads && isArr(leads['items'])) return leads['items'];
    if (isArr(result['items'])) return result['items'];
  }
  return [];
}

/**
 * `collectLeads`: `GET /leads` of one product (and one step group) into `byId`. The first call of a product has no group (the service picks the
 * first and sends `wfStepSummary`); each other group with leads is then asked on its own. A failure ends this call only.
 */
async function collectLeads(deps: RestDeps, byId: Map<string, JObj>, keyword: string, movementTypeId: string, activityGroupId: string | null): Promise<void> {
  try {
    let path = `/leads?viewMode=list&page=1&perPage=${LEADS_FETCH_SIZE}`;
    if (movementTypeId !== '') path += `&movementTypeId=${movementTypeId}`;
    if (activityGroupId !== null && activityGroupId !== '') path += `&activityGroupId=${activityGroupId}`;
    if (keyword !== '') path += `&search=${javaUrlEncode(keyword)}`;
    const response = body200(await get(deps, path));
    for (const it of leadItemsOf(response)) {
      if (!isObj(it) || !has(it, 'id')) continue;
      const key = javaValueOf(it['id']);
      if (!byId.has(key)) byId.set(key, it);
    }
    if (activityGroupId !== null) return; // the round of a step group: no further split
    if (jtrim(response) === '') return;
    const root = objectOf(response);
    if (!root) throw new Error(BAD_JSON);
    const result = optObject(root, 'result');
    if (!result) return;
    const loaded = javaValueOf(result['activityGroupId']);
    const groups = result['wfStepSummary'];
    if (!isArr(groups)) return;
    for (const g of groups) {
      if (!isObj(g) || optInt(g, 'count', 0) <= 0) continue;
      const gid = javaValueOf(g['id']);
      if (gid === '' || gid === loaded) continue;
      await collectLeads(deps, byId, keyword, movementTypeId, gid);
    }
  } catch {
    /* Java logged it and went on with the next product */
  }
}

/** `groupIdOf`: the step group of a lead (activityGroupId, else procedureGroupId); null when there is none or it is 0 (= every group, not a real id) */
function groupIdOf(it: JObj): string | null {
  let v = it['activityGroupId'];
  if (v === undefined || v === null) v = it['procedureGroupId'];
  const s = v === undefined || v === null ? '' : jtrim(javaValueOf(v));
  return s === '' || s === '0' ? null : s;
}

async function prospectLeads(deps: RestDeps, query: URLSearchParams): Promise<Response> {
  const prospectId = trimParam(query, 'prospectId');
  if (prospectId === '') return json(400, { status: 400, message: 'ต้องระบุ prospectId' });
  try {
    const keyword = trimParam(query, 'keyword');
    // every product, and of a product every step group that has leads (see the header of ProspectLeadsServlet: the service shows one product / one group at a time)
    const byId = new Map<string, JObj>();
    for (const movementTypeId of await movementTypeIds(deps)) await collectLeads(deps, byId, keyword, movementTypeId, null);

    const mine: JObj[] = [];
    for (const it of byId.values()) {
      if (prospectId !== javaValueOf(it['prospectId'])) continue; // the search brings customers with a similar name too
      const row: JObj = {
        id: it['id'],
        txNo: optString(it, 'txNo', ''),
        txDate: optString(it, 'txDate', ''),
        leadStatus: optString(it, 'leadStatus', ''),
        activeStatus: optString(it, 'activeStatus', ''),
        movementTypeName: optString(it, 'movementTypeName', ''),
        employeeName: optString(it, 'employeeName', ''),
        salePersonName: optString(it, 'salePersonName', ''),
        saleGroupName: optString(it, 'saleGroupName', ''),
      };
      if (it['amount'] !== undefined) row['amount'] = it['amount'];
      const gid = groupIdOf(it);
      if (gid !== null) row['activityGroupId'] = gid; // the chat bot adds it as ?activityGroupId= when it opens the lead
      mine.push(row);
    }
    // newest first (txDate is yyyy-MM-dd: the text sorts in time order); equal dates keep the order they were found in
    mine.sort((a, b) => {
      const x = optString(a, 'txDate', '');
      const y = optString(b, 'txDate', '');
      return x < y ? 1 : x > y ? -1 : 0;
    });
    return json(200, { status: 200, total: mine.length, result: mine });
  } catch (e) {
    return json(500, { status: 500, message: String((e as Error)?.message ?? e) });
  }
}

/* ---------------------------------------------------------------- POST /board/prospect/save */

/** the answer of a PUT as the servlet kept it: -1 = no answer at all */
interface ApiResult {
  status: number;
  body: string;
}
const apiOk = (r: ApiResult): boolean => r.status >= 200 && r.status < 300;

async function putJson(deps: RestDeps, path: string, body: JObj): Promise<ApiResult> {
  const u: Upstream = await service(deps, 'PUT', path, { body });
  return { status: u.status === 0 ? -1 : u.status, body: u.text };
}

const MAX_ERROR_DETAIL = 300;
/** `apiErrorMessage`: what the page shows when the service refused the save */
function apiErrorMessage(status: number, body: string): string {
  let detail = jtrim(body ?? '');
  if (detail.length > MAX_ERROR_DETAIL) detail = detail.substring(0, MAX_ERROR_DETAIL) + '…';
  if (status < 0) return 'เชื่อมต่อ API ไม่ได้ (บันทึกผ่าน API เท่านั้น ไม่มีการเขียนฐานข้อมูลสำรอง)';
  const head = `API ตอบ ${status}`;
  return detail === '' ? head : `${head} — ${detail}`;
}

async function prospectSave(deps: RestDeps, init: RequestInit | undefined): Promise<Response> {
  const body = objectOf(jtrim(bodyText(init)));
  const pid = body ? optLong(body, 'prospectId', 0) : 0;
  const prospect = optObject(body, 'prospect');
  const fields = optObject(body, 'fields');

  // the two parts of the request: the main data and the extra info (sent as "extraInfo", or inside "prospect" by an old caller)
  const extraInfoIn = optObject(body, 'extraInfo');
  const sunInfo = extraInfoIn ? optObject(extraInfoIn, 'sunProspectInfo') : prospect ? optObject(prospect, 'sunProspectInfo') : null;
  const satisfaction = extraInfoIn ? optObject(extraInfoIn, 'satisfaction') : prospect ? optObject(prospect, 'satisfaction') : null;
  const extraBody = extraInfoBody(sunInfo, satisfaction);

  if (body === null || pid <= 0 || (prospect === null && fields === null && extraBody === null)) {
    return json(400, { ok: false, message: 'missing/invalid prospectId or payload' });
  }

  const r: JObj = {};
  // 1) the main data — only when the caller sent "prospect"
  let apiStatus = -1;
  let apiResp = '';
  if (prospect !== null) {
    const main = await putJson(deps, `/prospects/${pid}`, mainBody(prospect, pid));
    apiStatus = main.status;
    apiResp = main.body;
    r['status'] = apiStatus;
    r['api'] = parsedOrRaw(apiResp);
  }

  // 2) the extra info — when the main data did not fail (or was not sent)
  if (extraBody !== null && (prospect === null || (apiStatus >= 200 && apiStatus < 300))) {
    const extra = await putJson(deps, `/prospects/${pid}/extra-info`, extraBody);
    r['extraStatus'] = extra.status;
    r['extraApi'] = parsedOrRaw(extra.body);
    if (!apiOk(extra)) {
      r['ok'] = false;
      r['via'] = 'api';
      r['message'] = apiErrorMessage(extra.status, extra.body);
      return json(502, r);
    }
    if (prospect === null) {
      apiStatus = extra.status; // only the extra info was sent: its status is the result
      r['status'] = extra.status;
    }
  }

  if (apiStatus >= 200 && apiStatus < 300) {
    r['ok'] = true;
    r['via'] = 'api';
    return json(200, r);
  }
  // the service failed (or only the legacy "fields" came): no database fallback, the error goes back to the page
  r['ok'] = false;
  r['via'] = 'api';
  r['message'] = apiErrorMessage(apiStatus, apiResp);
  return json(502, r);
}

/* ---------------------------------------------------------------- POST /board/prospect/update */

function prospectUpdate(init: RequestInit | undefined): Response {
  const body = objectOf(jtrim(bodyText(init)));
  const id = body ? optLong(body, 'id', 0) : 0;
  if (body === null || id <= 0) return json(400, { ok: false, message: 'missing/invalid body or id' });
  // ProspectUpdateServlet wrote backoffice.ggwprospect through ProspectBoDao: there is no REST resource for that, and no page calls it any more
  // (lead_detail saves through /board/prospect/save). The edit of the main data is PUT /prospects/{id} — that is /board/prospect/save.
  return json(501, { ok: false, message: 'not implemented: /board/prospect/update wrote the database directly; use /board/prospect/save (PUT /prospects/{id})' });
}

/* ---------------------------------------------------------------- /board/prospect/attachments */

/** `collapseAttachUrls`: the `attachFile` of every row of `result` with the doubled hosts folded; a text that is not a JSON object is returned as it is */
function collapseAttachUrls(response: string): string {
  const root = objectOf(response);
  if (!root) return response;
  const items = root['result'];
  if (!isArr(items)) return response;
  for (const a of items) if (isObj(a) && has(a, 'attachFile')) a['attachFile'] = collapse(optString(a, 'attachFile', ''));
  return JSON.stringify(root);
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

async function attachmentsList(deps: RestDeps, query: URLSearchParams): Promise<Response> {
  // a prospect of the new service (uuid): the documents are a section of the record (`sections=ATTACHMENTS`); the first read uses what came with the record
  const raw = jtrim(query.get('prospectId') ?? '');
  if (UUID.test(raw)) {
    const kept = takeAttachments(raw);
    const text = kept ?? attachmentsEnvelope(await fullRecord(deps, raw));
    return textResponse(200, text);
  }
  const pid = parseLong(query.get('prospectId'), 0);
  if (pid <= 0) return json(400, { status: 400, message: 'prospectId required' });
  const response = body200(await get(deps, `/prospects/${pid}/attachments`));
  return textResponse(200, jtrim(response) === '' ? '{}' : collapseAttachUrls(response));
}

async function attachmentsUpload(deps: RestDeps, io: FileIo, init: RequestInit | undefined): Promise<Response> {
  const inObj = objectOf(bodyText(init));
  if (!inObj) return json(500, { status: 500, message: 'อัปโหลดเอกสารไม่สำเร็จ: ' + BAD_JSON });
  const pid = optLong(inObj, 'prospectId', 0);
  let base64 = optString(inObj, 'fileContentBase64', '');
  const fileName = optString(inObj, 'fileName', 'document');
  const description = optString(inObj, 'description', fileName);

  if (pid <= 0 || jtrim(base64) === '') return json(400, { status: 400, message: 'prospectId และไฟล์จำเป็นต้องมี' });
  // the extension is checked BEFORE the file goes to the service (the page checks the `accept` of the input too)
  if (!isAllowedUploadName(fileName)) return json(400, { status: 400, message: `ไม่รองรับไฟล์ประเภทนี้ (รองรับ: ${allowedUploadExtText()})` });
  // "data:…;base64," in front of the content (a data URL) is cut off
  if (base64.startsWith('data:')) {
    const comma = base64.indexOf(',');
    if (comma > -1) base64 = base64.substring(comma + 1);
  }
  // (Java made sure here that the customer has a row in ggwsunprospectinfo — a database call; see the header)
  const response = await sendBody(deps, 'POST', `/prospects/${pid}/attachments`, { fileContentBase64: base64, fileName, attachFileTypeCode: 'DOC', description });

  let attachUrl = '';
  let apiMsg = '';
  const jr = objectOf(response);
  if (jr) {
    apiMsg = optString(jr, 'message', '');
    // the real reason is in error.message (a file too long answers message "Malformed request body" and error.message "String value length … exceeds …")
    const err = optObject(jr, 'error');
    if (err) {
      const detail = optString(err, 'message', '');
      if (detail !== '') apiMsg = apiMsg === '' ? detail : `${apiMsg} — ${detail}`;
    }
    const res = optObject(jr, 'result');
    if (res) attachUrl = optString(res, 'attachFile', '');
  }
  if (attachUrl === '') return json(500, { status: 500, message: apiMsg === '' ? 'อัปโหลดไฟล์ไม่สำเร็จ' : apiMsg, raw: response ?? '' });

  // check that the stored file can be opened (the service once answered an address without writing the file)
  const fileUrl = collapse(attachUrl);
  const p = await probe(io, fileUrl);
  return json(200, {
    status: 200,
    verified: p.ok,
    verifyReason: p.reason,
    message: p.ok ? 'success' : verifyFailMessage(p),
    result: { attachFile: fileUrl },
  });
}

async function attachmentsDelete(deps: RestDeps, query: URLSearchParams): Promise<Response> {
  const pid = parseLong(query.get('prospectId'), 0);
  const docNo = parseLong(query.get('docNo'), -1);
  if (pid <= 0 || docNo < 0) return json(400, { status: 400, message: 'prospectId และ docNo จำเป็นต้องมี' });
  // Data_API.sendDELETE: {status, success, message} — the message is the body of the answer
  const u = await service(deps, 'DELETE', `/prospects/${pid}/attachments/${docNo}`);
  const apiResp = { status: u.status === 0 ? -1 : u.status, success: u.ok, message: u.text };
  if (apiResp.success) return json(200, { status: 200, message: 'success' });
  const st = apiResp.status; // optInt("status", 502): the status of the service, -1 when it did not answer
  return json(st > 0 ? st : 502, { status: st, message: 'ลบเอกสารไม่สำเร็จ: ' + apiResp.message });
}

/* ---------------------------------------------------------------- POST /board/prospect/avatar */

async function prospectAvatar(deps: RestDeps, init: RequestInit | undefined): Promise<Response> {
  const inObj = objectOf(jtrim(bodyText(init)));
  const pid = inObj ? optLong(inObj, 'prospectId', 0) : 0;
  let base64 = inObj ? optString(inObj, 'fileContentBase64', '') : '';
  let fileName = 'prospect-image.jpg';
  if (inObj) {
    const fn = optString(inObj, 'fileName', '');
    if (fn !== '') fileName = fn;
  }
  if (pid <= 0 || jtrim(base64) === '') return json(400, { ok: false, message: 'prospectId และไฟล์จำเป็นต้องมี' });
  if (base64.startsWith('data:')) {
    const comma = base64.indexOf(',');
    if (comma > -1) base64 = base64.substring(comma + 1);
  }

  // 1) (Java: ensureForProspect — a database call, see the header)
  // 2) upload the picture (type PROFILE)
  const response = await sendBody(deps, 'POST', `/prospects/${pid}/attachments`, {
    attachFileBase64: base64,
    fileName,
    attachFileTypeCode: 'PROFILE',
    description: 'รูปโปรไฟล์ลูกค้า',
  });
  let attachUrl = '';
  let apiMsg = '';
  const jr = objectOf(response);
  if (jr) {
    apiMsg = optString(jr, 'message', '');
    const res = optObject(jr, 'result');
    if (res) attachUrl = optString(res, 'attachFile', '');
  }
  if (attachUrl === '') return json(500, { ok: false, message: apiMsg === '' ? 'อัปโหลดรูปไม่สำเร็จ' : apiMsg });

  // 3) the service does not make it the picture of the customer: read the customer, put the address in, PUT it back (relative, like every write)
  const rel = toRelative(attachUrl);
  const fileOnly = rel.substring(rel.lastIndexOf('/') + 1);
  const detailPath = `/prospects/${pid}`;
  let persisted = false;
  let persistErr = '';
  try {
    const cur = objectOf(body200(await get(deps, detailPath)));
    if (!cur) throw new Error(BAD_JSON);
    const current = optObject(cur, 'result');
    if (!current) persistErr = 'อ่านข้อมูลลูกค้ากลับมาไม่ได้ก่อนบันทึกรูป';
    else {
      const putBody = mainBody(current, pid);
      putBody['attachFile'] = rel;
      putBody['downloadAttachFile'] = rel;
      toRelativeIn(putBody, 'attachFile', 'downloadAttachFile');
      if (base64 !== '') putBody['attachFileBase64'] = base64;
      const putResp = await sendBody(deps, 'PUT', detailPath, putBody);
      const pj = objectOf(putResp);
      if (!pj) throw new Error(BAD_JSON);
      const st = optInt(pj, 'status', optInt(pj, 'code', -1));
      persisted = (st >= 200 && st < 300) || putResp.toLowerCase().includes('success');
      if (!persisted) persistErr = putResp;
    }
  } catch (e) {
    persistErr = String((e as Error)?.message ?? e);
  }

  // 4) read the customer again and look for the file in the address
  let verified = false;
  try {
    const dj = optObject(objectOf(body200(await get(deps, detailPath))), 'result');
    const savedAf = dj ? optString(dj, 'attachFile', '') : '';
    verified = fileOnly !== '' && savedAf.includes(fileOnly);
  } catch {
    /* not verified */
  }

  let message = '';
  if (!persisted) message = 'บันทึกลิงก์รูปไม่สำเร็จ (API): ' + persistErr;
  else if (!verified) message = 'อัปโหลดไฟล์สำเร็จ แต่ยืนยันลิงก์รูปในระบบไม่ได้ — เครื่องอื่นอาจไม่เห็นรูป';
  return json(200, { ok: persisted && verified, persisted, verified, attachFile: collapse(attachUrl), message });
}

/* ---------------------------------------------------------------- GET /board/prospect/rv-attachments */

async function rvAttachments(deps: RestDeps, query: URLSearchParams): Promise<Response> {
  const prospectId = query.get('prospectId');
  if (prospectId == null || jtrim(prospectId) === '') return json(400, { status: 400, message: 'prospectId required' });
  const response = body200(await get(deps, '/rv/attachments', { prospectId: jtrim(prospectId) }));
  return textResponse(200, jtrim(response) === '' ? '{}' : response);
}

/* ---------------------------------------------------------------- POST /board/chat-prospect-create */

/** the branch of the new customer is the branch of the signed-in user (the form's value is an outlet id, not a branch id); the form's value when the user has none */
function branchIdOf(deps: RestDeps, inObj: JObj): number {
  const fromForm = optLong(inObj, 'ggwBranchId', 0);
  const b = deps.user.branchId;
  const fromToken = b === null || b === undefined || b === '' ? 0 : Number(b);
  return Number.isFinite(fromToken) && fromToken > 0 ? fromToken : fromForm;
}

/** the id of the first activity group of a product (0 when there is none) */
async function firstActivityGroupId(deps: RestDeps, movementTypeId: number): Promise<number> {
  try {
    const response = body200(await get(deps, `/master-data/activity-groups?movementTypeId=${movementTypeId}`));
    if (jtrim(response) !== '') {
      const root = objectOf(response);
      if (!root) return 0;
      const result = root['result'];
      if (isArr(result) && result.length > 0) {
        const first = result[0];
        if (!isObj(first)) return 0;
        return optLong(first, 'id', 0);
      }
    }
  } catch {
    /* 0 */
  }
  return 0;
}

async function chatProspectCreate(deps: RestDeps, init: RequestInit | undefined): Promise<Response> {
  if (!deps.hasRole(ROLE.chatProspectCreate)) return json(403, { status: 403, message: 'ไม่มีสิทธิ์สร้างลูกค้าจากห้องแชท' });
  const text = bodyText(init);
  let inObj: JObj = {};
  if (text !== '') {
    const o = objectOf(text);
    if (!o) return json(500, { status: 500, message: BAD_JSON });
    inObj = o;
  }
  const name = jtrim(optString(inObj, 'name', ''));
  const tel = jtrim(optString(inObj, 'customerTel', ''));
  const movementTypeId = optLong(inObj, 'movementTypeId', 0);
  if (name === '' || tel === '' || movementTypeId <= 0) return json(400, { status: 400, message: 'name, customerTel, movementTypeId required' });

  // 1) the first step group of the product is the first step of the lead; 2) POST /prospects/chat
  const procedureGroupId = await firstActivityGroupId(deps, movementTypeId);
  const body: JObj = {
    name,
    customerTel: tel,
    marketingChanelId: optLong(inObj, 'marketingChanelId', 0),
    convenient: optString(inObj, 'convenient', ''),
    ggwBranchId: branchIdOf(deps, inObj),
    employeeId: optLong(inObj, 'employeeId', 0),
    assignToId: optLong(inObj, 'assignToId', 0),
    remark: optString(inObj, 'remark', ''),
    movementTypeId,
    procedureGroupId,
  };
  const response = await sendBody(deps, 'POST', '/prospects/chat', body);
  return textResponse(200, jtrim(response) === '' ? '{}' : response); // (the body of any status goes back with HTTP 200, as it did)
}

/* ---------------------------------------------------------------- POST /board/lead-create (LeadCreateServlet) */

/** saleGroupId default (CS01): the modal has no field for the sale group */
const DEFAULT_SALE_GROUP_ID = 1004400001;

const apiStatusOk = (o: JObj): boolean => {
  const s = optInt(o, 'status', optInt(o, 'code', 0));
  return s === 200 || s === 201 || s === 204;
};
const positiveId = (o: JObj | null): number => {
  if (!o) return 0;
  const id = optLong(o, 'leadId', 0);
  return id > 0 ? id : optLong(o, 'id', 0);
};
function extractLeadId(response: JObj): number {
  let id = positiveId(response);
  if (id > 0) return id;
  id = positiveId(optObject(response, 'result'));
  if (id > 0) return id;
  return positiveId(optObject(response, 'results'));
}

/** `assignCreatedLeadOwner`: POST /leads takes employeeId but does not assign; PATCH /leads/assign does — `ownerAssigned` tells the page whether it worked */
async function assignCreatedLeadOwner(deps: RestDeps, createResponse: string, employeeId: number): Promise<string> {
  const createJson = objectOf(createResponse);
  if (!createJson) return createResponse;
  if (!apiStatusOk(createJson)) return createResponse;
  const leadId = extractLeadId(createJson);
  if (leadId <= 0) {
    createJson['ownerAssigned'] = false;
    createJson['ownerAssignMessage'] = 'สร้าง Lead สำเร็จ แต่ response ไม่มี leadId จึงผูกผู้รับผิดชอบไม่ได้';
    return JSON.stringify(createJson);
  }
  try {
    const assignResponse = await sendBody(deps, 'PATCH', '/leads/assign', { leadId, employeeId });
    let assignJson: JObj = {};
    if (jtrim(assignResponse) !== '') {
      const o = objectOf(assignResponse);
      if (!o) throw new Error(BAD_JSON);
      assignJson = o;
    }
    const assigned = apiStatusOk(assignJson);
    createJson['ownerAssigned'] = assigned;
    if (!assigned) createJson['ownerAssignMessage'] = optString(assignJson, 'message', 'สร้าง Lead สำเร็จ แต่ผูกผู้รับผิดชอบไม่สำเร็จ');
  } catch {
    createJson['ownerAssigned'] = false;
    createJson['ownerAssignMessage'] = 'สร้าง Lead สำเร็จ แต่ผูกผู้รับผิดชอบไม่สำเร็จ';
  }
  return JSON.stringify(createJson);
}

/** `POST /board/lead-create`: the "create lead" modal of the customer list and of the customer form */
export function opportunityCreateRoutes(deps: RestDeps): RouteHandler {
  return async (path, _query, init) => {
    if (path !== '/board/lead-create') return null;
    if ((init?.method ?? 'GET').toUpperCase() !== 'POST') return methodNotAllowed();
    const raw = jtrim(bodyText(init));
    if (raw === '') return textResponse(400, '{"status":400,"message":"body required"}');
    const inObj = objectOf(raw);
    if (!inObj) return textResponse(500, JSON.stringify({ status: 500, message: BAD_JSON }));
    const prospectId = optLong(inObj, 'prospectId', 0);
    const movementTypeId = optLong(inObj, 'movementTypeId', 0);
    if (prospectId <= 0 || movementTypeId <= 0) return textResponse(400, JSON.stringify({ status: 400, message: 'prospectId และ movementTypeId จำเป็น' }));
    const saleGroupId = optLong(inObj, 'saleGroupId', 0);
    const body: JObj = { prospectId, movementTypeId, saleGroupId: saleGroupId > 0 ? saleGroupId : DEFAULT_SALE_GROUP_ID };
    // optional — only what has a value (> 0); employeeId is set afterwards, by PATCH /leads/assign
    const procedureGroupId = optLong(inObj, 'procedureGroupId', 0);
    if (procedureGroupId > 0) body['procedureGroupId'] = procedureGroupId;
    const assignToId = optLong(inObj, 'assignToId', 0);
    if (assignToId > 0) body['assignToId'] = assignToId;

    let result = await sendBody(deps, 'POST', '/leads', body);
    if (jtrim(result) === '') result = '{"status":502,"message":"backend ไม่ตอบ"}';
    else if (optLong(inObj, 'employeeId', 0) > 0) result = await assignCreatedLeadOwner(deps, result, optLong(inObj, 'employeeId', 0));
    return textResponse(200, result);
  };
}

/* ---------------------------------------------------------------- the routes */

/** the prospect servlets; `io` = how the file server is reached (the global fetch; a stand-in in the specs) */
export function prospectRoutes(deps: RestDeps, io: FileIo = browserFileIo, sections: string = FULL_SECTIONS): RouteHandler {
  return async (path, query, init) => {
    const method = (init?.method ?? 'GET').toUpperCase();
    switch (path) {
      case '/board/prospect-list': {
        if (method !== 'GET') return methodNotAllowed();
        const q: ListQuery = {
          page: intParam(query, 'page', 1),
          perPage: intParam(query, 'perPage', 20),
          searchText: trimParam(query, 'searchText'),
          sortKey: trimParam(query, 'sortBy'),
          currentCountryId: trimParam(query, 'currentCountryId'),
          currentCityId: trimParam(query, 'currentCityId'),
          currentDistrictId: trimParam(query, 'currentDistrictId'),
          salePersonId: trimParam(query, 'salePersonId'),
          status: trimParam(query, 'status'),
          fromDate: trimParam(query, 'fromDate'),
          toDate: trimParam(query, 'toDate'),
          enrich: trimParam(query, 'enrich') === '1',
          lang: deps.lang(),
          marketingChannelIds: [],
        };
        const channels = trimParam(query, 'marketingChannelIds');
        if (channels !== '') for (const id of channels.split(',')) if (jtrim(id) !== '') q.marketingChannelIds.push(jtrim(id));
        try {
          return json(200, { status: 200, message: 'success', result: await fetchPage(deps, q) });
        } catch {
          return json(500, { status: 500, message: 'โหลดรายชื่อลูกค้าไม่สำเร็จ' });
        }
      }
      case '/board/prospect-enrich': {
        if (method !== 'GET') return methodNotAllowed();
        const ids: string[] = [];
        const raw = query.get('ids');
        if (raw !== null) for (const id of raw.split(',')) if (jtrim(id) !== '' && ids.length < 200) ids.push(jtrim(id));
        try {
          return json(200, { status: 200, message: 'success', result: await fetchDetails(deps, ids, deps.lang()) });
        } catch {
          return json(500, { status: 500, message: 'โหลดรายละเอียดลูกค้าไม่สำเร็จ' });
        }
      }
      case '/board/prospect':
        if (method !== 'GET') return methodNotAllowed();
        return textResponse(200, await fetchProspectByIdJson(deps, trimParam(query, 'id'), sections));
      case '/board/prospect-leads':
        if (method !== 'GET') return methodNotAllowed();
        return prospectLeads(deps, query);
      case '/board/prospect/save':
        if (method !== 'POST') return methodNotAllowed();
        return prospectSave(deps, init);
      case '/board/prospect/update':
        if (method !== 'POST') return methodNotAllowed();
        return prospectUpdate(init);
      case '/board/prospect/attachments':
        if (method === 'GET') return attachmentsList(deps, query);
        if (method === 'POST') return attachmentsUpload(deps, io, init);
        if (method === 'DELETE') return attachmentsDelete(deps, query);
        return methodNotAllowed();
      case '/board/prospect/avatar':
        if (method !== 'POST') return methodNotAllowed();
        return prospectAvatar(deps, init);
      case '/board/prospect/rv-attachments':
        if (method !== 'GET') return methodNotAllowed();
        return rvAttachments(deps, query);
      case '/board/chat-prospect-create':
        if (method !== 'POST') return methodNotAllowed();
        return chatProspectCreate(deps, init);
      case '/docproxy':
        if (method !== 'GET') return methodNotAllowed();
        return docProxy(io, query.get('url'));
      default:
        return null;
    }
  };
}
