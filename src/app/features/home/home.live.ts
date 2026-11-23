/**
 * The LIVE backend of the CRM home page: what the servlets behind the page (`/dashboardapi`, `/board/*`) did on the server, done in the
 * browser (ADR-001: no Tomcat, no BFF). The page script keeps asking the addresses of the Java page (`../dashboardapi?action=summary…`,
 * `../board/movement-types`, `../board/leads?viewMode=list…`, `../board/lead-assign` …); `fetch()` answers each with a real `Response`
 * built from REST calls to triplesale-service (`{api}` = `/triplesale-service/api/v1`) through the app's HttpClient — Bearer token, "session
 * ended" on a 401, the API log of the top bar.
 *
 * Every URL the page (and the work modal and the shell's phone mask) asks for, and the module that answers it — nothing here is new code:
 *
 *   ../dashboardapi?action=summary|schedules          dashboardApiRoutes   GET /dashboard (+ the pictures from GET /prospects), GET /dashboard/schedules
 *   ../board/movement-types                           boardMasterRoutes    GET /master-data/movement-types/LD (English names for an English UI)
 *   ../board/master/activity-groups                   boardMasterRoutes    GET /master-data/activity-groups   (the colour of a workflow-group tag)
 *   ../board/master/employees-by-activity-group       boardMasterRoutes    GET /master-data/employees/by-activity-group   (work modal)
 *   ../board/sale-groups · sale-persons · employees   boardMasterRoutes    GET /master-data/{sale-groups,sale-persons,employees}   (assign dialog, work modal)
 *   ../board/chat-master-data?type=countries          boardMasterRoutes    GET /master-data/countries — asked by the shell's `PhoneFormat` (TsPhone), not by this backend
 *   ../board/leads?viewMode=list                      opportunitiesRoutes          GET /leads — no CRM_Lead_View = `[]` without a call; the opportunity table and the work modal's customer search
 *   ../board/lead-assign                              opportunitiesRoutes          PATCH /leads/assign
 *   ../board/lead?id=&activityGroupId=                opportunityCoreRoutes       GET /leads/{id}   (work modal: the workflow group of the customer picked)
 *   ../board/schedule/add · schedule/edit             opportunityCoreRoutes       POST /schedules · PATCH /schedules/{id}   (work modal save)
 *
 * NOT composed, on purpose: `prospectRoutes` (`/board/prospect-list`, `/board/prospect-*`, `/docproxy`). The page never asks for them — the
 * suggestion card under a search box (`odsProspectSuggest`) is not on this page and its customer search is the lead list above; the pictures
 * of the summary come from `GET /prospects` inside `dashboardApiRoutes`. (The other lead pages compose it because THEIR scripts ask for it.)
 *
 * `../docproxy?url=` (the servlet that fetched an `http://` picture of the file server so that an https page could show it) is an `<img src>`, not
 * a `fetch`: no live backend can answer it. The host gives the engine the address of the picture itself (`env.docProxy = (url) => url`, like
 * the Opportunities and Activities pages) — see INTEGRATION.md.
 *
 * One thing is the contract of `fetch()` itself and so lives here: the page cancels the requests of a filter it replaced
 * (`AbortController` — `loadDashboard()`), and a real `fetch` rejects with an `AbortError` as soon as its signal fires (and not at all when it
 * is aborted before the call). The REST calls cannot be cancelled (`RestDeps.call` has no signal) — the servlet did not cancel its upstream call
 * either — but the page must see the rejection.
 */
import { boardMasterRoutes } from '@core/live/board-master.live';
import { dashboardApiRoutes } from '@core/live/dashboard-api.live';
import { opportunityCoreRoutes } from '@core/live/opportunity-core.live';
import { opportunitiesRoutes } from '@core/live/opportunities.live';
import { composeRoutes, type RestDeps } from '@core/live/rest';
import type { HomeBackend } from './home-backend';

/** what `fetch()` rejects with when its signal is aborted */
const abortError = (): Error => new DOMException('The operation was aborted.', 'AbortError');

/** `answer` as `fetch(…, { signal })` gives it: already aborted = no call at all; aborted meanwhile = the promise rejects with an AbortError */
function honouringSignal(call: () => Promise<Response>, signal: AbortSignal | null | undefined): Promise<Response> {
  if (!signal) return call();
  if (signal.aborted) return Promise.reject(abortError());
  return new Promise<Response>((resolve, reject) => {
    const onAbort = (): void => reject(abortError());
    signal.addEventListener('abort', onAbort, { once: true });
    call().then(
      (r) => {
        signal.removeEventListener('abort', onAbort);
        resolve(r);
      },
      (e: unknown) => {
        signal.removeEventListener('abort', onAbort);
        reject(e);
      },
    );
  });
}

/** the live backend: `deps` = the app's REST plumbing (`restDepsOf(injector)` in the host) */
export function createLiveHome(deps: RestDeps): HomeBackend {
  // (the routes are disjoint — the first one that knows an address answers; none = 404 JSON "no live route")
  const route = composeRoutes(dashboardApiRoutes(deps), boardMasterRoutes(deps), opportunityCoreRoutes(deps), opportunitiesRoutes(deps));
  return { fetch: (input, init) => honouringSignal(() => route(String(input), init), init?.signal) };
}
