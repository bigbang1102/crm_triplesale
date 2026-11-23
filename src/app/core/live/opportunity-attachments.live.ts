/**
 * OP05 — the files attached to an opportunity: `GET /opportunities/{opportunityId}/attachments` (the tab "เอกสารประกอบ" of the opportunity detail).
 * The page asks `GET /board/lead/attachments?leadId=<id>` (its own address: the Java page asked the files of the PROSPECT, `/board/prospect/attachments`).
 *
 * ★ A GUESS: no sample of the answer has been seen. Read from `result` as a list (else `result.items` · `result.attachments`), each row given the names the page
 * reads: `attachFile` (the address of the file) ← attachFile | url | downloadUrl | fileUrl, `description` ← description | fileName | name | originalName,
 * `detailOrderNo` ← detailOrderNo | orderNo | no; everything else of a row goes through. A call the service refuses answers `[]`.
 * (Upload is OP22: not this call.)
 *
 * OP23 — delete one file: `DELETE /opportunities/{opportunityId}/attachments/{attachmentId}`. The page asks
 * `DELETE /board/lead/attachments?leadId=<id>&attachmentId=<id>` and gets `{status, message}` like the prospect servlet
 * (`/board/prospect/attachments`): 200 `success`; a refusal keeps the status of the service (502 when it did not answer) with the message.
 */
import { errorMessage, get, jsonResponse, service, type RestDeps, type RouteHandler } from './rest';

type Obj = Record<string, unknown>;
const isObj = (v: unknown): v is Obj => typeof v === 'object' && v !== null && !Array.isArray(v);
const firstOf = (o: Obj, keys: readonly string[]): unknown => {
  for (const k of keys) if (o[k] !== undefined && o[k] !== null && o[k] !== '') return o[k];
  return undefined;
};

/** the rows of the answer with the names the page reads */
export function attachmentRows(json: unknown): Obj[] {
  const result = isObj(json) && 'result' in json ? (json as Obj)['result'] : json;
  const list = Array.isArray(result) ? result : isObj(result) ? (Array.isArray(result['items']) ? result['items'] : Array.isArray(result['attachments']) ? result['attachments'] : []) : [];
  return list.filter(isObj).map((r) => {
    const out: Obj = { ...r };
    const put = (key: string, v: unknown): void => {
      if (v !== undefined && (out[key] === undefined || out[key] === null || out[key] === '')) out[key] = v;
    };
    put('attachFile', firstOf(r, ['url', 'downloadUrl', 'fileUrl']));
    put('description', firstOf(r, ['fileName', 'name', 'originalName']));
    put('detailOrderNo', firstOf(r, ['orderNo', 'no']));
    return out;
  });
}

const DELETE_FAILED = 'ลบเอกสารไม่สำเร็จ: ';
const NO_ANSWER_STATUS = 502;

async function deleteAttachment(deps: RestDeps, query: URLSearchParams): Promise<Response> {
  const id = (query.get('leadId') ?? '').trim();
  const attachmentId = (query.get('attachmentId') ?? '').trim();
  if (id === '' || attachmentId === '') return jsonResponse(400, { status: 400, message: 'leadId and attachmentId required' });
  const u = await service(deps, 'DELETE', `/opportunities/${encodeURIComponent(id)}/attachments/${encodeURIComponent(attachmentId)}`);
  if (u.ok) return jsonResponse(200, { status: 200, message: 'success' });
  const status = u.status > 0 ? u.status : NO_ANSWER_STATUS;
  return jsonResponse(status, { status, message: DELETE_FAILED + (errorMessage(u) || u.text) });
}

export function opportunityAttachmentsRoutes(deps: RestDeps): RouteHandler {
  return async (path, query, init) => {
    if (path !== '/board/lead/attachments') return null;
    const method = (init?.method ?? 'GET').toUpperCase();
    if (method === 'DELETE') return deleteAttachment(deps, query);
    if (method !== 'GET') return null;
    const id = (query.get('leadId') ?? '').trim();
    if (id === '') return jsonResponse(400, { status: 400, message: 'leadId required' });
    const u = await get(deps, `/opportunities/${encodeURIComponent(id)}/attachments`);
    if (!u.ok) return jsonResponse(200, []);
    return jsonResponse(200, attachmentRows(u.json));
  };
}
