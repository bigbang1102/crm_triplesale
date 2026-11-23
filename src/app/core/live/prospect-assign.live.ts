/**
 * The change of the person responsible for a prospect, answered from `POST /api/v1/prospects/{prospectId}/assignments` (change the responsible person /
 * return to the queue; merged on DEV). The page script asks for it at one address of its own:
 *
 *   POST /board/prospect-assign   { prospectId, destination, responsibleEmployeeId, expectedResponsibleId, reason }
 *     → POST /prospects/{prospectId}/assignments   { destination, responsibleEmployeeId, expectedResponsibleId, reason }
 *
 * `destination: "EMPLOYEE"` hands the prospect to the person in `responsibleEmployeeId`; `expectedResponsibleId` is who the page believes is responsible NOW
 * (the service answers 409 when somebody changed it meanwhile). The status and the body of the service are passed on untouched: the page reads 403 (no right),
 * 409 (changed meanwhile), 422 (the receiver has no right) from them. `X-Expected-Company` is added to every call to the service by the HTTP interceptor.
 * The other destination (the queue) is not asked here: its body is not known yet.
 */
import { jtrim } from './prospect-payload.live';
import { bodyOf, passThrough, service, type RestDeps, type RouteHandler, jsonResponse } from './rest';

export function prospectAssignRoutes(deps: RestDeps): RouteHandler {
  return async (path, _query, init) => {
    if (path !== '/board/prospect-assign') return null;
    if ((init?.method ?? 'GET').toUpperCase() !== 'POST') return jsonResponse(405, { status: 405, message: 'method not allowed' });
    const { prospectId, ...body } = bodyOf(init);
    const id = typeof prospectId === 'string' || typeof prospectId === 'number' ? jtrim(String(prospectId)) : '';
    if (id === '') return jsonResponse(400, { status: 400, message: 'prospectId required' });
    const u = await service(deps, 'POST', `/prospects/${encodeURIComponent(id)}/assignments`, { body });
    return passThrough(u);
  };
}
