/**
 * What the Dashboard page needs from its backend — the contract the Java page had with `DashboardView` (the JSON the server
 * rendered into the page with EL) and with the servlets under `/dashboard/*` (the requests the page script makes).
 *
 * Two implementations: `dashboard.mock.ts` (dev: deterministic fake data in exactly these shapes) and, for the real services,
 * `dashboard.live.ts`. The page script (`dashboard.engine.ts`, generated) never knows which one it talks to.
 */

/** the values `DashboardView` exposed to EL — JSON that the Java page spliced into its script, plus the texts of the KPI cards */
export interface DashboardInitial {
  /** ECharts payloads of the overview charts */
  trendJson: unknown;
  groupJson: unknown;
  csJson: unknown;
  topCountriesJson: unknown;
  stepJson: unknown;
  sourceFunnelJson: unknown;
  csFunnelJson: unknown;
  countryFunnelJson: unknown;
  /** master data of the header dropdowns: arrays of { value, label } */
  yearsJson: unknown;
  monthsJson: unknown;
  provinceJson: unknown;
  occupationJson: unknown;
  employeeJson: unknown;
  countryMasterJson: unknown;
  chanelJson: unknown;
  activityGroupJson: unknown;
  movementtypeJson: unknown;
  /** the other tabs */
  groupPanelsJson: unknown;
  pipelineTableJson: unknown;
  pipelinePeopleJson: unknown;
  statusKpisJson: unknown;
  statusEmployeesJson: unknown;
  statusPopupJson: unknown;
  leadsTableJson: unknown;
  /** text of the KPI cards / funnel subtitles */
  kpiTotalFmt: string;
  kpiCountries: string;
  kpiTopCountry: string;
  sourceFunnelSubtitle: string;
  csFunnelSubtitle: string;
  countryFunnelSubtitle: string;
}

/**
 * What the live backend (`dashboard.live.ts`) gets from the app. The Java page asked servlets that called the dashboard service
 * (`TriplesaleApi` token, `Data_API`); here the same calls are made from the browser through the app's HttpClient, so the bearer
 * token, the "session ended" handling on a 401 and the API log of the top bar come for free.
 */
export interface LiveDeps {
  /** one HTTP call. Resolves with the status and the body text of the answer, whatever the status (0 = no answer at all) */
  call(method: string, url: string, body?: unknown, headers?: Record<string, string>): Promise<{ status: number; text: string }>;
  /** base of the dashboard service, e.g. `/dashboard-triplesale-service/api/v1` */
  dashboardApi: string;
  /** the page of the app that is open (for log lines) */
  user?: { username: string; employeeCode: string };
}

/** who is asking: what the iframe beans (CalendarDashboardView) took from the session */
export interface FrameContext {
  /** ss_branch_code */
  ggwBranch: string;
  /** base of the dashboard service, e.g. /dashboard-triplesale-service/api/v1 */
  goldApi: string;
  /** the signed-in employee (calendar: the `employee` query parameter) */
  employeeCode: string;
  username: string;
}

/** what CalendarDashboardView rendered into dashboard_calendar_frame.xhtml (JSON values are strings, as in the page) */
export interface CalendarFrameData {
  calendarDataJson: string;
  calendarApiUrl: string;
  employeeCode: string;
  myTaskListJson: string;
  calendarTaskCreateUrl: string;
  myCalendarListJson: string;
  myTaskCalendarListJson: string;
}

export interface DashboardBackend {
  /** `DashboardView.init()` of the Java page: everything the first paint needs */
  initial(ggwBranch: string): Promise<DashboardInitial>;
  /** the values of the calendar iframe (tab ปฏิทินงาน) */
  calendarFrame(ctx: FrameContext): Promise<CalendarFrameData>;
  /** `kpiListDataJson` of the KPI iframe (tab KPI-EventMovement): `{ columns, statusOptions, records, total, masters }` */
  kpiFrame(ctx: FrameContext): Promise<string>;
  /**
   * The requests of the page script. `input` is what the script passed to `fetch`: a path below the contract base
   * (`/dashboard/chart-single?chart=trend&year=2026…`, `/dashboard/api/v1/sundashboard/overview?…`, `/dashboard/months?year=`).
   */
  fetch(input: string, init?: RequestInit): Promise<Response>;
}
