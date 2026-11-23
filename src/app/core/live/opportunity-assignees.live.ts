/**
 * OP08 — the people an opportunity can be handed to: `GET /opportunities/{opportunityId}/assignee-options` (no query parameter: the service answers 400 to any).
 * Used for the dropdown "ผู้รับผิดชอบ" of the modal "เพิ่ม / เปลี่ยนผู้รับผิดชอบ" of the opportunity detail, which asks `GET /board/employees?leadId=<id>`.
 *
 * ★ A GUESS: no sample of the answer has been seen. Read from `result.assignees` (else `result` as a list, else `result.items`), each `{ id, code, name }`; the answer also
 * carries `salePersons` (the people for OP12), which this dropdown does not use. The list is the one of the opportunity: not kept in the session.
 * A `/board/employees` call without `leadId` is not answered here (the next route answers). A call the service refuses answers `[]` (the dropdown stays empty).
 */
import { get, jsonResponse, type RestDeps, type RouteHandler } from './rest';

type Obj = Record<string, unknown>;
const isObj = (v: unknown): v is Obj => typeof v === 'object' && v !== null && !Array.isArray(v);
const str = (v: unknown): string => (typeof v === 'string' || typeof v === 'number' ? String(v).trim() : '');

/** the rows of the answer as `[{ id, code, name }]` */
export function assigneeRows(json: unknown): Obj[] {
  const result = isObj(json) && 'result' in json ? (json as Obj)['result'] : json;
  const list = Array.isArray(result) ? result : isObj(result) ? (Array.isArray(result['assignees']) ? result['assignees'] : Array.isArray(result['items']) ? result['items'] : []) : [];
  return list.filter(isObj).map((r) => ({ ...r, id: r['id'], code: str(r['code']), name: str(r['name']) || str(r['nameTh']) || str(r['fullName']) || str(r['code']) }));
}

export function opportunityAssigneesRoutes(deps: RestDeps): RouteHandler {
  return async (path, query, init) => {
    if (path !== '/board/employees' || (init?.method ?? 'GET').toUpperCase() !== 'GET') return null;
    const id = (query.get('leadId') ?? '').trim();
    if (id === '') return null;
    const u = await get(deps, `/opportunities/${encodeURIComponent(id)}/assignee-options`);
    if (!u.ok) {
      console.warn('[assignee-options] ' + u.status + ' for opportunity ' + id);
      return jsonResponse(200, []);
    }
    return jsonResponse(200, assigneeRows(u.json));
  };
}
