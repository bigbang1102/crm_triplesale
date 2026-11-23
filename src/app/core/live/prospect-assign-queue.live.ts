/**
 * Taking a prospect from a queue / handing it from a queue to a person (NC-2), answered from `POST /api/v1/prospects/{prospectId}/assign`.
 * READY BUT NOT WIRED: `prospectRoutes` (`prospect.live.ts`) does not list it and no page asks for it, so nothing calls the service until the day it is added there.
 * (`POST /prospects/{id}/assignments`, NC-1, is the other one: change the responsible person / return to the queue — `prospect-assign.live.ts`, wired.)
 *
 *   POST /board/prospect-assign-from-queue   { prospectId, …the body of the service… }
 *     → POST /prospects/{prospectId}/assign   { …the body of the service… }
 *
 * The body of the service is NOT KNOWN here (no sample, no spec of it yet): everything but `prospectId` is passed on untouched, so the page decides what it sends the day
 * it uses this. The status and the body of the service are passed on untouched too (the page reads 403 no right · 404 not a queue member · 409 changed meanwhile …
 * from them, as it does for NC-1). `X-Expected-Company` is added to every call to the service by the HTTP interceptor.
 */
import { jtrim } from './prospect-payload.live';
import { bodyOf, jsonResponse, noAnswer, passThrough, service, type RestDeps, type RouteHandler } from './rest';

export const ASSIGN_FROM_QUEUE_PATH = '/board/prospect-assign-from-queue';

export function prospectAssignQueueRoutes(deps: RestDeps): RouteHandler {
  return async (path, _query, init) => {
    if (path !== ASSIGN_FROM_QUEUE_PATH) return null;
    if ((init?.method ?? 'GET').toUpperCase() !== 'POST') return jsonResponse(405, { status: 405, message: 'method not allowed' });
    const { prospectId, ...body } = bodyOf(init);
    const id = typeof prospectId === 'string' || typeof prospectId === 'number' ? jtrim(String(prospectId)) : '';
    if (id === '') return jsonResponse(400, { status: 400, message: 'prospectId required' });
    const u = await service(deps, 'POST', `/prospects/${encodeURIComponent(id)}/assign`, { body });
    return u.status === 0 ? noAnswer('prospect assign from queue') : passThrough(u);
  };
}
