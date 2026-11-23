/**
 * `DashboardApiServlet` (`/dashboardapi?action=summary|schedules`) + `DashboardApiService` answered in the browser — the two calls of the
 * CRM home page (`GET /dashboard`, `GET /dashboard/schedules` of triplesale-service). Compose `dashboardApiRoutes(deps)` into the backend of
 * the page with `composeRoutes(…)`.
 *
 * What the service did on top of passing the envelope through: `safeJson` (an answer that is not a JSON object — including any non-200, since
 * `Data_API.sendGET` gave "" for those — becomes `{status:502, message:…}` with HTTP 200), and for the summary `enrichOpportunityImages`: the
 * items that have no `attachFile` get the picture of the prospect with the same name from `GET /prospects?page=1&pageSize=500`.
 */
import { isArr, isObj, optString, parseJson } from './org-json';
import { body200, get, textResponse, type RestDeps, type RouteHandler } from './rest';

const BAD_BACKEND = '{"status":502,"message":"backend ไม่ตอบหรือ response ไม่ใช่ JSON"}';

/** `DashboardApiService.safeJson` */
const safeJson = (raw: string): string => (raw.trim().startsWith('{') ? raw : BAD_BACKEND);

/** `fetchProspectImages`: prospect name → picture (the first non-empty one of a name wins) */
async function fetchProspectImages(deps: RestDeps): Promise<Map<string, string>> {
  const m = new Map<string, string>();
  const resp = body200(await get(deps, '/prospects', { page: 1, pageSize: 500 }));
  if (!resp.trim().startsWith('{')) return m;
  const root = parseJson(resp);
  const arr = isObj(root) ? root['result'] : undefined;
  if (!isArr(arr)) return m;
  for (const p of arr) {
    if (!isObj(p)) continue;
    const name = optString(p, 'name', '');
    const img = optString(p, 'attachFile', '');
    if (name && img && !m.has(name)) m.set(name, img);
  }
  return m;
}

/** `enrichOpportunityImages`: fill the missing `attachFile` of `result.items[]` */
async function enrichOpportunityImages(deps: RestDeps, dashJson: string): Promise<string> {
  const root = parseJson(dashJson);
  const result = isObj(root) ? root['result'] : undefined;
  if (!isObj(root) || !isObj(result)) return dashJson;
  const items = result['items'];
  if (!isArr(items) || items.length === 0) return dashJson;
  const imgByName = await fetchProspectImages(deps);
  if (imgByName.size === 0) return dashJson;
  let changed = false;
  for (const it of items) {
    if (!isObj(it)) continue;
    if (optString(it, 'attachFile', '') === '') {
      const img = imgByName.get(optString(it, 'prospectName', ''));
      if (img) {
        it['attachFile'] = img;
        changed = true;
      }
    }
  }
  return changed ? JSON.stringify(root) : dashJson;
}

/** `?a=1&b=2` with the non-blank trimmed values, in this order (`appendParam`) */
const q = (v: Record<string, string>): Record<string, string> => Object.fromEntries(Object.entries(v).map(([k, x]) => [k, x.trim()]));

export function dashboardApiRoutes(deps: RestDeps): RouteHandler {
  return async (path, query, init) => {
    if (path !== '/dashboardapi') return null;
    if ((init?.method ?? 'GET').toUpperCase() !== 'GET') return textResponse(405, '{"message":"Method Not Allowed"}');
    const p = (name: string): string => (query.get(name) ?? '').trim();
    try {
      switch (p('action')) {
        case 'summary': {
          const u = await get(deps, '/dashboard', q({ movementTypeId: p('movementTypeId'), startDate: p('startDate'), endDate: p('endDate'), page: p('page'), perPage: p('perPage') }));
          return textResponse(200, await enrichOpportunityImages(deps, safeJson(body200(u))));
        }
        case 'schedules': {
          const u = await get(deps, '/dashboard/schedules', q({ viewMode: p('viewMode'), date: p('date'), dateFrom: p('dateFrom'), dateTo: p('dateTo'), movementTypeId: p('movementTypeId') }));
          return textResponse(200, safeJson(body200(u)));
        }
        default:
          return textResponse(400, '{"message":"unknown action"}');
      }
    } catch {
      return textResponse(500, '{"message":"internal error"}');
    }
  };
}
