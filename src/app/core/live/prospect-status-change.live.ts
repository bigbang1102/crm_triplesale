/**
 * The change of the state of a prospect (draft / release / block), answered from `POST /api/v1/prospects/{prospectId}/status-changes`. The page script
 * asks at one address of its own:
 *
 *   POST /board/prospect-status-change   { prospectId, targetStatus, assignment?, idempotencyKey }
 *     → POST /prospects/{prospectId}/status-changes   { targetStatus, assignment? }   with the header `Idempotency-Key: <idempotencyKey>`
 *
 * `targetStatus`: RELEASE | BLOCK (| DRAFT). Going to RELEASE says who is responsible: `assignment: { destination: "EMPLOYEE", responsibleEmployeeId }`.
 * The page makes the Idempotency-Key once per action (a retry of the same action sends the same key, so the service does it once); one is made here when
 * the page sent none. The status and the body of the service are passed on untouched. `X-Expected-Company` is added by the HTTP interceptor.
 */
import { jtrim } from './prospect-payload.live';
import { bodyOf, jsonResponse, passThrough, service, type RestDeps, type RouteHandler } from './rest';

const newKey = (): string => (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function' ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(16).slice(2)}`);

export function prospectStatusChangeRoutes(deps: RestDeps): RouteHandler {
  return async (path, _query, init) => {
    if (path !== '/board/prospect-status-change') return null;
    if ((init?.method ?? 'GET').toUpperCase() !== 'POST') return jsonResponse(405, { status: 405, message: 'method not allowed' });
    const { prospectId, idempotencyKey, ...body } = bodyOf(init);
    const id = typeof prospectId === 'string' || typeof prospectId === 'number' ? jtrim(String(prospectId)) : '';
    if (id === '') return jsonResponse(400, { status: 400, message: 'prospectId required' });
    const key = typeof idempotencyKey === 'string' && jtrim(idempotencyKey) !== '' ? jtrim(idempotencyKey) : newKey();
    return passThrough(await service(deps, 'POST', `/prospects/${encodeURIComponent(id)}/status-changes`, { body, headers: { 'Idempotency-Key': key } }));
  };
}
