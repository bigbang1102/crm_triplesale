/**
 * The servlets of the contact-activity family and of the schedule page of the Java board (`/board/…`), answered in the browser:
 *
 *   `activityRoutes(deps)`   ActivityListServlet (`/board/activity-list`)           → GET /contact-activities ×2 (+ contact-history of the multi-group leads)
 *                            ActivityDetailServlet (`/board/activity-detail`)       → GET /leads/{id}[?activityGroupId=]
 *                            ContactActivitiesServlet (`POST /board/contact-activities`) → POST /leads/{id}/contact-activities
 *                            AssignLeadServlet (`POST /board/lead-assign`)          → PATCH /leads/assign
 *                            ActivityGroupsServlet (`/board/activity-groups`)       → GET /leads/{id}/activity-groups (+ MasterDataI18n)
 *                            ActivityStepsServlet (`/board/activity-steps`)         → GET /leads/{id}/activity-steps
 *                            ForwardAssigneesServlet (`/board/forward-assignees`)   → GET /leads/{id}/forward-assignees
 *   `scheduleRoutes(deps)`   ScheduleFetchServlet (`/board/schedule/fetch`)         → GET /schedules (the body of the service as it came)
 *                            ScheduleFilterStateServlet (`/board/schedule-filter-state`) + ScheduleView.getSavedFilterJson → the browser's sessionStorage
 *
 * The logic that is more than forwarding (ContactActivityApiService, LeadBoardView.fetchActivityDetailResult …) is in
 * `activities.live.parse.ts`; the master-data servlets of the board are `board-master.live.ts`, the lead servlet and the work modal's
 * schedule writes are `lead-core.live.ts` — a page composes them (`composeRoutes(…)` of `rest.ts`).
 *
 * What a servlet did is kept to the letter, also what looks odd: the values of the parameters are appended to the URL of the service as they
 * came (`ScheduleFetchServlet` encoded only `search`), a service that does not answer 200 gives "" (`Data_API.sendGET`) and so the stand-ins below,
 * the answers to a request that is not valid are the ones the servlet wrote.
 *
 * Not ported: `ContactActivitiesListServlet` (`/api/v1/contact-activities`: a copy of the service for Postman, no page calls it),
 * `ScheduleStatusServlet` (`/board/schedule/status`: no page calls it), the config `activity.list.source=aggregate`, an HTTP 500 for an
 * exception inside a servlet (none can be thrown here), and the HttpSession of the filter state (see `scheduleFilterStore`).
 * What differs from a servlet container on purpose: a wrong HTTP method is a JSON 405 (the container's own page).
 */
import {
  CONTACT_ACTIVITIES_PARAMS,
  DEFAULT_PER_PAGE,
  contactChannelLabel,
  fetchActivityDetail,
  fetchActivityList,
  javaParseInt,
  javaParseLong,
  javaTrim,
  type ActivitiesRest,
  type ContactActivitiesQuery,
  type ListQuery,
} from './activities.live.parse';
import { fetchMasterArray, translateEnvelopeResult } from './board-master.live';
import { fetchLeadByIdResult } from './opportunity-core.live';
import { firstSalesLineId } from './opportunities-v2.live';
import { has, isObj, optString, parseJson } from './org-json';
import { body200, get, jsonResponse, service, textResponse, type RestDeps, type RouteHandler } from './rest';

/* ---------------------------------------------------------------- helpers */

/** `URLEncoder.encode(v, UTF_8)` — the form encoding of the browser is the same set of characters (space = "+", `*-._` stay) */
const urlEncode = (v: string): string => new URLSearchParams([['x', v]]).toString().slice(2);

/** `String.isBlank()`: empty or only `Character.isWhitespace` characters */
const JAVA_WHITESPACE = '\t\n\u000B\f\r\u001C-\u001F   -  -    　';
const JAVA_BLANK = new RegExp(`^[${JAVA_WHITESPACE}]*$`);
const isBlank = (s: string | null | undefined): boolean => s == null || JAVA_BLANK.test(s);

/** `req.getParameter(name)` as a trimmed non-empty text, else undefined (what the services of this family did with a parameter they pass on) */
const blankToUndefined = (v: string | null): string | undefined => (v == null || javaTrim(v) === '' ? undefined : v);

/** `_intParam`: an int in the text, else the default */
function intParam(q: URLSearchParams, name: string, def: number): number {
  const v = q.get(name);
  if (v == null || javaTrim(v) === '') return def;
  return javaParseInt(javaTrim(v)) ?? def;
}
/** `Long.parseLong(trimmed)`; 0 when it is not a number (the servlets ignored the NumberFormatException) */
function longParam(q: URLSearchParams, name: string): number {
  const v = q.get(name);
  if (v == null || javaTrim(v) === '') return 0;
  return javaParseLong(javaTrim(v)) ?? 0;
}

/** the body the page posted, read the way the servlets did: line by line without the line ends, trimmed */
function bodyText(init: RequestInit | undefined): string {
  const b = init?.body;
  return typeof b === 'string' ? javaTrim(b.replace(/\r\n|\r|\n/g, '')) : '';
}

const methodNotAllowed = (): Response => jsonResponse(405, { status: 405, message: 'Method Not Allowed' });

/**
 * the answer with a status that comes from the service (`resp.setStatus(n)`): a servlet container writes whatever status it is told to; `Response`
 * only accepts 200–599 and no body for 204 / 205 / 304 — such a status is passed on without a body, one that no answer can have is 502
 */
function answer(status: number, text: string): Response {
  const s = status >= 200 && status <= 599 ? status : 502;
  return s === 204 || s === 205 || s === 304 ? new Response(null, { status: s }) : textResponse(s, text);
}

/* ---------------------------------------------------------------- the REST calls of the activity list and detail */

/** the URL of one page of `GET /contact-activities` below `/api/v1`: the parameters in the order of `ContactActivityApiService.fetchPage`, each encoded */
export function contactActivitiesPath(q: ContactActivitiesQuery): string {
  let qs = '';
  for (const k of CONTACT_ACTIVITIES_PARAMS) {
    const v = q[k];
    if (v === undefined || v === null) continue;
    qs += `${qs ? '&' : '?'}${k}=${urlEncode(String(v))}`;
  }
  return `/contact-activities${qs}`;
}

/**
 * The list of the page is ONE call per tab, `GET /contact-activity-summaries?view=BY_OPPORTUNITY&include=CHILDREN,SUMMARY&opportunityConfigId=&closed=`: the rows are the opportunities, each with its
 * children (one per step group — the tab "by step group" is drawn from them) and the summary of the statuses. `opportunityConfigId` is the product / sales line the page chose (the first
 * sales line when it has none yet); `closed` is `false` unless the filter's switch of closed opportunities is on. The other filters of the old list (team, employee, search, dates, sort, page)
 * are not parameters of this call.
 * ★ A GUESS: the answer has not been seen; it goes to the parser of the old list as it is (`{ items, meta, statusSummary … }`, the children of an item under `children`).
 */
export const SUMMARY_QUERIES = {
  lead: { view: 'BY_OPPORTUNITY', include: 'CHILDREN,SUMMARY' },
  // the tab "by step group" asks the same call when it is opened, with its own view and without the children
  group: { view: 'BY_STEP_GROUP', include: 'SUMMARY' },
} as const;

/** `ActivitiesRest` whose list call is CA-G01 (the other calls are the real ones) */
export function summaryRestOf(deps: RestDeps): ActivitiesRest {
  return {
    ...activitiesRestOf(deps),
    singleView: true,
    contactActivities: async (q) => {
      const opportunityConfigId = (q.movementTypeId ?? '').trim() || (await firstSalesLineId(deps));
      const closed = (q.showClosed ?? '').trim().toLowerCase() === 'true' ? 'true' : 'false';
      const u = await get(deps, '/contact-activity-summaries', { ...SUMMARY_QUERIES[q.groupBy], opportunityConfigId, closed });
      return { status: u.status, body: u.text };
    },
  };
}

/** the calls `activities.live.parse.ts` needs, made through the app's HttpClient */
export function activitiesRestOf(deps: RestDeps): ActivitiesRest {
  return {
    contactActivities: async (q) => {
      const u = await get(deps, contactActivitiesPath(q));
      return { status: u.status, body: u.text };
    },
    contactHistory: async (leadId) => {
      const u = await get(deps, `/leads/${javaTrim(leadId)}/contact-history`);
      return { status: u.status, body: u.text };
    },
    leadById: (id, activityGroupId) => fetchLeadByIdResult(deps, id, activityGroupId ?? ''),
  };
}

/* ---------------------------------------------------------------- the contact-activity servlets */

/** the contact-activity servlets of the board; compose them into the backend of a page */
export function activityRoutes(deps: RestDeps, options: { legacyContactActivities?: boolean } = {}): RouteHandler {
  const rest = activitiesRestOf(deps);
  // the list: CA-G01 (summaryRestOf); the old `GET /contact-activities` only when `legacyContactActivities` is on (the specs of the port of the servlet)
  const listRest = options.legacyContactActivities ? rest : summaryRestOf(deps);
  return async (path, query, init) => {
    const method = (init?.method ?? 'GET').toUpperCase();
    switch (path) {
      case '/board/activity-list': {
        if (method !== 'GET') return methodNotAllowed();
        const q: ListQuery = {
          movementTypeId: query.get('movementTypeId') ?? undefined,
          saleGroupId: query.get('saleGroupId') ?? undefined,
          employeeName: query.get('employeeName') ?? undefined,
          search: query.get('search') ?? undefined,
          sortBy: query.get('sortBy') ?? undefined,
          activeStatus: query.get('activeStatus') ?? undefined,
          lastContactFrom: query.get('lastContactFrom') ?? undefined,
          lastContactTo: query.get('lastContactTo') ?? undefined,
          assignDateFrom: query.get('assignDateFrom') ?? undefined,
          assignDateTo: query.get('assignDateTo') ?? undefined,
          showClosed: query.get('showClosed') ?? undefined,
          groupBy: query.get('groupBy') === 'group' ? 'group' : 'lead',
          page: intParam(query, 'page', 1),
          perPage: intParam(query, 'perPage', DEFAULT_PER_PAGE),
        };
        // (viewMode is read by the servlet and not used by the service)
        return textResponse(200, JSON.stringify(await fetchActivityList(listRest, q)));
      }

      case '/board/activity-detail': {
        if (method !== 'GET') return methodNotAllowed();
        const id = javaTrim(query.get('id') ?? '');
        const all = query.get('all');
        const res = await fetchActivityDetail(
          rest,
          { leadId: id, wfsId: longParam(query, 'wfsId'), txNo: javaTrim(query.get('txNo') ?? ''), allGroups: all === '1' || all?.toLowerCase() === 'true', activityGroupId: longParam(query, 'activityGroupId') },
          deps.message('label.ld2.lead_load_failed_default'),
        );
        // not 200: the status and the body of the backend go on (the page prints error.message in a popup)
        return answer(res.status, javaTrim(res.body) === '' ? '{}' : res.body);
      }

      case '/board/contact-activities': {
        if (method !== 'POST') return methodNotAllowed();
        const parsed = parseJson(bodyText(init));
        if (!isObj(parsed)) return textResponse(400, '{"error":"invalid json body"}');
        if (!has(parsed, 'leadId') || parsed['leadId'] === null) return textResponse(400, '{"error":"leadId required"}');
        const leadId = parsed['leadId'];
        delete parsed['leadId']; // it is in the path of the service
        // the buttons of the page send snake_case, the backend writes the value into a combo that has the o2o labels
        const channel = optString(parsed, 'channel', '');
        if (javaTrim(channel) !== '') parsed['channel'] = contactChannelLabel(channel);
        const u = await service(deps, 'POST', `/leads/${String(leadId)}/contact-activities`, { body: parsed });
        // the status of the backend is passed on (it used to be swallowed); no answer at all = 502
        return answer(u.status >= 100 ? u.status : 502, isBlank(u.text) ? '{}' : u.text);
      }

      case '/board/lead-assign': {
        if (method !== 'POST') return methodNotAllowed();
        const requestBody = bodyText(init);
        if (requestBody === '') return textResponse(400, '{"error":"body required"}');
        // the body goes on as the page wrote it (the servlet did not read it); the answer of the service whatever its status
        const u = await service(deps, 'PATCH', '/leads/assign', { body: requestBody, headers: { 'Content-Type': 'application/json; charset=UTF-8' } });
        return textResponse(200, isBlank(u.text) ? '{}' : u.text);
      }

      case '/board/activity-groups': {
        if (method !== 'GET') return methodNotAllowed();
        const leadId = query.get('leadId');
        if (leadId == null || javaTrim(leadId) === '') return textResponse(400, '{"error":"leadId required"}');
        const body = body200(await get(deps, `/leads/${javaTrim(leadId)}/activity-groups`));
        return textResponse(200, translateEnvelopeResult(deps, isBlank(body) ? '{}' : body, deps.lang()));
      }

      case '/board/activity-steps': {
        if (method !== 'GET') return methodNotAllowed();
        const leadId = query.get('leadId');
        if (leadId == null || javaTrim(leadId) === '') return textResponse(400, '[]');
        const ag = blankToUndefined(query.get('activityGroupId'));
        const items = await fetchMasterArray(deps, `/leads/${javaTrim(leadId)}/activity-steps${ag === undefined ? '' : `?activityGroupId=${javaTrim(ag)}`}`);
        return textResponse(200, JSON.stringify(items));
      }

      case '/board/forward-assignees': {
        if (method !== 'GET') return methodNotAllowed();
        const id = query.get('id');
        if (id == null || javaTrim(id) === '') return textResponse(400, '{"error":"id required"}');
        const step = blankToUndefined(query.get('activityStepId'));
        const r = body200(await get(deps, `/leads/${javaTrim(id)}/forward-assignees${step === undefined ? '' : `?activityStepId=${javaTrim(step)}`}`));
        return textResponse(200, isBlank(r) ? '{"status":200,"result":[]}' : r);
      }

      default:
        return null;
    }
  };
}

/* ---------------------------------------------------------------- the schedule servlets */

/** where the state of the filter of the schedule page is kept (Java: `HttpSession["sc_filter_state"]`) */
export interface FilterStore {
  get(): string | null;
  set(text: string): void;
}

const memory = new Map<string, string>();
/** the session of the browser tab, per signed-in user (sessionStorage; memory when the storage is blocked — a spec, a private window) */
export function scheduleFilterStore(deps: RestDeps): FilterStore {
  const key = (): string => `ts.sc_filter_state.${deps.user.username}`;
  return {
    get: () => {
      try {
        return sessionStorage.getItem(key());
      } catch {
        return memory.get(key()) ?? null;
      }
    },
    set: (text) => {
      try {
        sessionStorage.setItem(key(), text);
      } catch {
        memory.set(key(), text);
      }
    },
  };
}

/** `ScheduleView.getSavedFilterJson()` / `GET /board/schedule-filter-state`: the state the page posted last, "null" when there is none */
export function savedFilterText(store: FilterStore): string {
  const saved = store.get();
  return saved != null && javaTrim(saved) !== '' ? saved : 'null';
}

/** the schedule servlets of the board; compose them into the backend of the Schedule page */
export function scheduleRoutes(deps: RestDeps, store: FilterStore = scheduleFilterStore(deps)): RouteHandler {
  return async (path, query, init) => {
    const method = (init?.method ?? 'GET').toUpperCase();
    switch (path) {
      case '/board/schedule/fetch': {
        if (method !== 'GET') return methodNotAllowed();
        const viewMode = query.get('viewMode');
        const dateFrom = query.get('dateFrom');
        const dateTo = query.get('dateTo');
        // viewMode=list|board need no dates ; the other views need both
        const isList = viewMode != null && ['list', 'board'].includes(viewMode.toLowerCase());
        if (viewMode == null || (!isList && (dateFrom == null || dateTo == null))) {
          return textResponse(400, `{"status":400,"message":"missing params: viewMode${isList ? '' : ', dateFrom, dateTo'}"}`);
        }
        // the values go to the service as they came (only the search text is encoded), in this order, the blank ones left out
        let url = `/schedules?viewMode=${viewMode}`;
        const add = (name: string): void => {
          const v = query.get(name);
          if (v != null && !isBlank(v)) url += `&${name}=${name === 'search' ? urlEncode(v) : v}`;
        };
        for (const name of ['type', 'dateFrom', 'dateTo', 'sort', 'page', 'perPage', 'movementTypeId', 'activityGroupId', 'serviceId', 'assignToId', 'appointmentStatus', 'taskStatus', 'search']) add(name);
        // Data_API.pull_JsonObject = sendGET: the body of a 200, "" for anything else → "no content" (an error of the service is an empty list here)
        const result = body200(await get(deps, url));
        return textResponse(200, isBlank(result) ? `{"status":204,"message":"no content","result":{"viewMode":"${viewMode}","items":[]}}` : result);
      }

      case '/board/schedule-filter-state': {
        if (method === 'GET') return textResponse(200, savedFilterText(store));
        if (method === 'POST') {
          const body = bodyText(init);
          if (body !== '') store.set(body);
          return new Response(null, { status: 204 });
        }
        return methodNotAllowed();
      }

      default:
        return null;
    }
  };
}
