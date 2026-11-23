/**
 * The LIVE backend of the Activities page: what the servlets of the Java page (`ActivityListServlet`, `ActivityDetailServlet`,
 * `ContactActivitiesServlet`, `AssignLeadServlet`, the master-data servlets, the work modal's `AddScheduleServlet` /
 * `EditScheduleServlet` …) did on the server, done in the browser. The page script keeps asking its old addresses
 * (`../board/activity-list?…`, `../board/activity-detail?id=`, …); `fetch()` answers them with real `Response`s built from REST calls to
 * `triplesale-service` through the app's HttpClient (Bearer token, "session ended" on a 401, the API log).
 *
 *   activity-list (CA-G01: GET /contact-activity-summaries, two views) · activity-detail · contact-activities · lead-assign · activity-groups / -steps · forward-assignees
 *                                                                                                                      core/live/activities.live.ts
 *   movement-types (the sales lines: GET /prospects/options?sets=salesLines)                                           here
 *   master/activity-groups (answered empty here: not asked) · master/employees-by-activity-group · employees · sale-groups · tags …                      core/live/board-master.live.ts
 *   lead · schedule/add · schedule/edit (the work modal)                                                                core/live/opportunity-core.live.ts
 *   leads (the customer search of the work modal) · prospect-list (the suggestion card of the search box)              placeholders of the
 *                                                                                                                      leads / prospects workers
 *
 * `../docproxy?url=` (the servlet that fetched an `http://` picture of the file server for the page) is not a route any more: the host
 * gives the page the address of the picture itself (see INTEGRATION.md).
 */
import { activityRoutes } from '@core/live/activities.live';
import { boardMasterRoutes } from '@core/live/board-master.live';
import { opportunityCoreRoutes } from '@core/live/opportunity-core.live';
import { opportunitiesRoutes } from '@core/live/opportunities.live';
import { fetchOptionRows } from '@core/live/prospect-options.live';
import { prospectRoutes } from '@core/live/prospect.live';
import { composeRoutes, jsonResponse, textResponse, type RestDeps, type RouteHandler } from '@core/live/rest';
import type { ActivitiesBackend } from './activities-backend';

/**
 * `GET /board/movement-types` (the products of the filter) are the sales lines of the service (`GET /prospects/options?sets=salesLines`, kept in the session): the page asked
 * `GET /master-data/movement-types/LD`, which is gone. The answer is the plain list the page read: `[{ id, code, name }]` (`[]` when the service does not answer).
 * The id of a sales line is what the list asks as `opportunityConfigId`.
 */
function salesLineProducts(deps: RestDeps): RouteHandler {
  return async (path, _query, init) => {
    if (path !== '/board/movement-types' || (init?.method ?? 'GET').toUpperCase() !== 'GET') return null;
    const got = await fetchOptionRows(deps, 'salesLines');
    const items = got.ok ? got.rows.map((row) => ({ id: row['id'], code: row['code'] ?? '', name: row['name'] || row['code'] || row['id'] })) : [];
    return textResponse(200, JSON.stringify(items));
  };
}

/**
 * `GET /board/master/activity-groups?movementTypeId=` (the workflow groups of a product) is not asked of the service any more: `GET /master-data/activity-groups` is gone.
 * The answer is the empty list the page reads (`{ status: 200, result: [] }`), nothing is sent; this answers before the master-data routes do.
 */
const noActivityGroups: RouteHandler = async (path, _query, init) =>
  path === '/board/master/activity-groups' && (init?.method ?? 'GET').toUpperCase() === 'GET' ? jsonResponse(200, { status: 200, result: [] }) : null;

/**
 * `GET /board/tags` · `/board/sale-groups` · `/board/provinces` · `/board/employees` (the lists of the old filter) are not asked of the service any more: the
 * `/master-data/*` addresses behind them are gone (404) and this page does not use the lists. They answer the empty list; this answers before the master-data routes do.
 */
const GONE_FILTER_LISTS: ReadonlySet<string> = new Set(['/board/tags', '/board/sale-groups', '/board/provinces', '/board/employees']);
const noFilterLists: RouteHandler = async (path, _query, init) =>
  GONE_FILTER_LISTS.has(path) && (init?.method ?? 'GET').toUpperCase() === 'GET' ? textResponse(200, '[]') : null;

/** the live backend: `deps` = the app's REST plumbing (`restDepsOf(injector)` in the host) */
export function createLiveActivities(deps: RestDeps): ActivitiesBackend {
  const route = composeRoutes(salesLineProducts(deps), noActivityGroups, noFilterLists, activityRoutes(deps), boardMasterRoutes(deps), opportunityCoreRoutes(deps), opportunitiesRoutes(deps), prospectRoutes(deps));
  return { fetch: (input, init) => route(String(input), init) };
}
