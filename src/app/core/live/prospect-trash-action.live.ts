/**
 * What the "deleted" tab of the list does to a record of the trash, answered from `POST /api/v1/prospects/{prospectId}/trash-actions` (NC-4: trash /
 * restore). The page script asks at one address of its own:
 *
 *   POST /board/prospect-trash-action   { prospectId, action }   →   POST /prospects/{prospectId}/trash-actions   { action }
 *
 * `action: "RESTORE"` puts the record back (the plan names the action RESTORE; the other keys of the body are not known, so only `action` is sent). The status
 * and the body of the service are passed on untouched (the page shows the reason of a 4xx). `X-Expected-Company` is added by the HTTP interceptor.
 */
import { jtrim } from './prospect-payload.live';
import { bodyOf, jsonResponse, passThrough, service, type RestDeps, type RouteHandler } from './rest';

export function prospectTrashActionRoutes(deps: RestDeps): RouteHandler {
  return async (path, _query, init) => {
    if (path !== '/board/prospect-trash-action') return null;
    if ((init?.method ?? 'GET').toUpperCase() !== 'POST') return jsonResponse(405, { status: 405, message: 'method not allowed' });
    const { prospectId, ...body } = bodyOf(init);
    const id = typeof prospectId === 'string' || typeof prospectId === 'number' ? jtrim(String(prospectId)) : '';
    if (id === '') return jsonResponse(400, { status: 400, message: 'prospectId required' });
    return passThrough(await service(deps, 'POST', `/prospects/${encodeURIComponent(id)}/trash-actions`, { body }));
  };
}
