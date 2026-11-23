/**
 * The LIVE backend of the Schedule page ("ปฏิทินงาน"): what the servlets of the Java page (`ScheduleFetchServlet`,
 * `ScheduleFilterStateServlet`, `MovementTypeServlet`, `MasterActivityGroupsServlet`, `SaleGroupsServlet`, `EmployeesServlet`, the work
 * modal's `AddScheduleServlet` / `EditScheduleServlet` …) and the bean `ScheduleView` (`savedFilterJson`) did on the server, done in the
 * browser. The page script keeps asking its old addresses (`/board/schedule/fetch?viewMode=…`, `../board/schedule/add` …); `fetch()` answers
 * them with real `Response`s built from REST calls to `triplesale-service` through the app's HttpClient.
 *
 *   schedule/fetch · schedule-filter-state                                                 core/live/activities.live.ts (`scheduleRoutes`)
 *   master/movement-types · master/activity-groups · master/employees-by-activity-group
 *   · sale-groups · employees                                                              core/live/board-master.live.ts
 *   lead · schedule/add · schedule/edit (the work modal)                                    core/live/opportunity-core.live.ts
 *   leads (the customer search of the work modal) · prospect-list (the suggestion card)    placeholders of the leads / prospects workers
 *
 * The state of the filter (Java: `HttpSession["sc_filter_state"]`) is kept in the sessionStorage of the tab, per signed-in user
 * (`scheduleFilterStore`); `initial()` = `ScheduleView.getSavedFilterJson()`.
 */
import { scheduleFilterStore, scheduleRoutes, savedFilterText } from '@core/live/activities.live';
import { boardMasterRoutes } from '@core/live/board-master.live';
import { opportunityCoreRoutes } from '@core/live/opportunity-core.live';
import { opportunitiesRoutes } from '@core/live/opportunities.live';
import { prospectRoutes } from '@core/live/prospect.live';
import { composeRoutes, type RestDeps } from '@core/live/rest';
import type { ScheduleBackend, ScheduleInitial } from './schedule-backend';

/** the live backend: `deps` = the app's REST plumbing (`restDepsOf(injector)` in the host) */
export function createLiveSchedule(deps: RestDeps): ScheduleBackend {
  const store = scheduleFilterStore(deps);
  const route = composeRoutes(scheduleRoutes(deps, store), boardMasterRoutes(deps), opportunityCoreRoutes(deps), opportunitiesRoutes(deps), prospectRoutes(deps));
  return {
    async initial(): Promise<ScheduleInitial> {
      // the page wrote this text into its script (`var SC_SAVED_STATE = …`): a state that is not JSON would have been a syntax error there; here it is "none"
      let saved: unknown = null;
      try {
        saved = JSON.parse(savedFilterText(store));
      } catch {
        saved = null;
      }
      return { savedFilterJson: saved };
    },
    fetch: (input, init) => route(String(input), init),
  };
}
