/**
 * What the Schedule page ("ปฏิทินงาน") needs from its backend — the contract the Java page had with `ScheduleView` (the value the server
 * rendered into the page with EL) and with the servlets under `/board/*` (the requests the page script makes).
 *
 * The page script (`schedule.engine.ts`, generated) calls `fetch` with the addresses the Java page wrote (`/board/schedule/fetch?viewMode=month…`,
 * `../board/schedule/add` of the work modal …) and reads the answers in the shapes the servlets gave. Two implementations are possible
 * behind it:
 *
 *   - `schedule.mock.ts`  dev (`mock: true`): deterministic fake data in exactly these shapes — the only one in phase A
 *   - a live adapter      (phase B, NOT built yet): moves the logic of the servlets to TypeScript and calls triplesale-service directly
 *                         (no BFF). What it has to do is listed in INTEGRATION.md ("servlets that the live phase ports").
 *
 * The page never knows which one it talks to.
 *
 * The addresses (all GET unless said otherwise; the BFF servlet in brackets answered them in Java):
 *   /board/schedule/fetch?viewMode=month|week|day&dateFrom&dateTo[&movementTypeId&activityGroupId&serviceId&assignToId&appointmentStatus&taskStatus&search]
 *       (ScheduleFetchServlet → triplesale-service GET /schedules)   result.items[]
 *   /board/schedule/fetch?viewMode=year&dateFrom=Y-01-01&dateTo=Y-12-31 …                          result.marks[] (yyyy-MM-dd of the days that have an item)
 *   /board/schedule/fetch?viewMode=board&sort&page&perPage[&type=appointment|task&appointmentStatus|taskStatus=<one status>]
 *       result.appointment[] / result.task[]  = { status, count, items[], meta } per status column, result.summary
 *   /board/schedule/fetch?viewMode=list&sort&page&perPage[&type=…]                                  result.list.appointment / .task = { items[], meta }, result.summary
 *   /board/master/movement-types?type=LD                      (MovementTypeServlet)   result.items[] = the products
 *   /board/master/activity-groups?movementTypeId=             (MasterActivityGroupsServlet)   result.items[] = the workflow groups of a product
 *   /board/sale-groups · /board/employees                      (SaleGroupsServlet · EmployeesServlet)   the options of the filter dialog
 *   /board/prospect-list?searchText&perPage&enrich=1           (ProspectListServlet)   the suggestion card of the search box
 *   POST /board/schedule-filter-state (sendBeacon, JSON body)  (ScheduleFilterStateServlet)   the HttpSession["sc_filter_state"] → `initial().savedFilterJson`
 *   the work modal (shared with the Activities page): POST /board/schedule/add · PATCH /board/schedule/edit · /board/employees ·
 *       /board/master/employees-by-activity-group · /board/leads?viewMode=list (customer search) · /board/lead?id=
 */

/** the values `ScheduleView` exposed to EL */
export interface ScheduleInitial {
  /**
   * `#{scheduleView.savedFilterJson}`: the state that `POST /board/schedule-filter-state` stored in the HttpSession the last time the page
   * changed something (null when the session has none): `{ movementTypeId, activityGroupId, calView, calYear, calMonth, calDay, tab,
   * filter: { saleGroup, owner, appt[], task[], apptAll, taskAll } | null, listSort, search }`
   */
  savedFilterJson: unknown;
}

export interface ScheduleBackend {
  /** `ScheduleView.getSavedFilterJson()` of the Java page: what the first paint needs (the saved state) — no network in Java either */
  initial(): Promise<ScheduleInitial>;
  /**
   * The requests of the page script. `input` is what the script passed to `fetch`: the address as the Java page wrote it
   * (`/board/schedule/fetch?…`, `../board/schedule/add`, …). Answers are `Response`s with the status, content type and body the servlets gave.
   */
  fetch(input: string, init?: RequestInit): Promise<Response>;
}
