/**
 * The prospects waiting in a queue (SD-4), answered from `GET /api/v1/waitlists/{waitlistId}/prospects`. READY BUT NOT WIRED: `prospectRoutes`
 * (`prospect.live.ts`) does not list it yet and no page asks for it, so nothing calls the service until the day it is added there.
 *
 *   GET /board/prospect-waitlist?waitlistId=<uuid>&page=1&perPage=20&q=สยาม
 *     → GET /waitlists/{waitlistId}/prospects?page=1&perPage=20&q=สยาม
 *
 * `waitlistId` comes from `GET /prospects/options?sets=waitlists`. `q` matches a name containing the text or a code starting with it. The service orders
 * by arrival (first in, first served) and answers 400 to a `sort`, so none is ever sent; it answers 404 to a queue that is not a prospect queue / does
 * not exist / belongs to another company. The status and the body of the service are passed on untouched. Known on DEV today: `q` answers 403 while the
 * customer name is hidden (waiting for the label fix of the owner of the service).
 */
import { jtrim } from './prospect-payload.live';
import { get, jsonResponse, noAnswer, numParam, passThrough, type RestDeps, type RouteHandler } from './rest';

export const WAITLIST_PROSPECTS_PATH = '/board/prospect-waitlist';

/** the query of the service: `page` and `perPage` as given (a number above 0), `q` only when it has text; never a `sort` */
export function waitlistProspectsQuery(q: URLSearchParams): Record<string, string | number> {
  const out: Record<string, string | number> = {};
  const page = numParam(q, 'page');
  const perPage = numParam(q, 'perPage');
  if (page !== undefined && page > 0) out['page'] = page;
  if (perPage !== undefined && perPage > 0) out['perPage'] = perPage;
  const text = jtrim(q.get('q') ?? '');
  if (text !== '') out['q'] = text;
  return out;
}

export function prospectWaitlistRoutes(deps: RestDeps): RouteHandler {
  return async (path, query, init) => {
    if (path !== WAITLIST_PROSPECTS_PATH) return null;
    if ((init?.method ?? 'GET').toUpperCase() !== 'GET') return jsonResponse(405, { status: 405, message: 'method not allowed' });
    const id = jtrim(query.get('waitlistId') ?? '');
    if (id === '') return jsonResponse(400, { status: 400, message: 'waitlistId required' });
    const u = await get(deps, `/waitlists/${encodeURIComponent(id)}/prospects`, waitlistProspectsQuery(query));
    return u.status === 0 ? noAnswer('prospect waitlist') : passThrough(u);
  };
}
