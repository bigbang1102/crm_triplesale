/**
 * What the CRM home page needs from its backend.
 *
 * The page script (`home.engine.ts`, generated from `resources/js/dashboard.js`) calls the BFF URLs of the Java page — `../dashboardapi`,
 * `../board/movement-types`, `../board/leads`, `../board/lead-assign` … — through `env.fetch`. In Java those were servlets that called the REST
 * service `triplesale-service` with the bearer token of the session and did a little work of their own (listed in INTEGRATION.md).
 * This phase has no live adapter: the contract is `HomeBackend.fetch(url, init)`, which answers a BFF URL in the shape the servlet answered.
 * Implementations: `home.mock.ts` (dev: data from the shared cast, in these shapes) and, later, the live adapter — which can be written
 * against the table below without reading the page script.
 *
 * | URL the page calls (relative to /triplesale/pages/)                      | Java                                  | REST of triplesale-service / the servlet's own work |
 * | ------------------------------------------------------------------------ | ------------------------------------- | --------------------------------------------------- |
 * | GET ../dashboardapi?action=summary&page=1&perPage=100[&movementTypeId&startDate&endDate] | DashboardApiServlet → DashboardApiService.summaryJson | GET /dashboard (envelope passed through; `items[].attachFile` filled from GET /prospects?page=1&pageSize=500 by name) |
 * | GET ../dashboardapi?action=schedules&viewMode=list|year|day[&date|dateFrom&dateTo][&movementTypeId] | DashboardApiServlet → DashboardApiService.schedulesJson | GET /dashboard/schedules (envelope passed through) |
 * | GET ../board/movement-types                                              | MovementTypesServlet → LeadBoardView.fetchMovementTypesJson | GET /master-data/movement-types/LD → `[{id, code, name, usesWorkflowStep}]`; English names through MasterDataI18n when the UI is English |
 * | GET ../board/leads?viewMode=list&activityGroupId=0&sortBy=txdate_desc&page&perPage=20[&movementTypeId&dateRangeType=custom&dateFrom&dateTo] (+ `search`, `showClosed=false`, `employeeId` from the work modal's customer search) | LeadsBoardServlet → LeadBoardView.fetchLeadsJson | GET /leads?… → the `result` object; `[]` when the session lacks CRM_Lead_View (no call to the service); province / district / country names localised by language |
 * | GET ../board/master/activity-groups?movementTypeId=                      | MasterActivityGroupsServlet           | GET /master-data/activity-groups?movementTypeId= (envelope `result.items`) |
 * | GET ../board/sale-groups · ../board/sale-persons[?saleGroupId=] · ../board/employees[?saleGroupId=] | SaleGroupsServlet · SalePersonsServlet · EmployeesServlet | GET /master-data/sale-groups · sale-persons · employees (normalised by MasterDataItemBean to `{id, code, name, nameTh, colorCode, attachFile, postCode}`; a sale person also carries `employee{id, code, name, nameTh}`) |
 * | POST ../board/lead-assign `{leadId, saleGroupId?, salePersonId?, employeeId?}` | AssignLeadServlet                  | PATCH /leads/assign — body forwarded as it is, the service's envelope answered as it is |
 * | work modal: POST ../board/schedule/add · PATCH ../board/schedule/edit · GET ../board/master/employees-by-activity-group · ../board/employees · ../board/lead?id=&activityGroupId= | AddScheduleServlet · EditScheduleServlet · MasterEmployeesByActivityGroupServlet · LeadDetailServlet | see src/app/shared/work-modal/work-modal.mock.ts |
 * | GET ../board/chat-master-data?type=countries (TsPhone, the shell's)      | ChatMasterDataServlet                 | the country master of the phone masks — answered by the shell (`PhoneFormat`), not by this backend |
 *
 * Mock-only switches (the comparison harness and the tests use them): `home.mock.ts` `MockHomeConfig`.
 */

/** the envelope of triplesale-service: `{ status, message, result }`, on failure `{ status, message, error: { code, message } }` */
export interface RestEnvelope<T = unknown> {
  status: number;
  message?: string;
  result?: T;
  error?: { code?: number; message?: string };
}

/** `result` of `GET /dashboard` — what `mapSummary()` of the page reads */
export interface DashboardSummary {
  stats: { total: number; statusNew: number; statusSuccess: number; statusInactive: number; statusLost: number; statusActive: number; activeHot: number; activeWarm: number; activeCold: number };
  /** customers counted per workflow STEP (the donut); empty for a product without a workflow */
  stepSummary: { id: number; code: string; name: string; count: number }[];
  /** the first `perPage` leads of the filter (only a fallback of the page uses them: the table is loaded from `/board/leads`) */
  items: { prospectName: string; customerTel: string; handlerName: string; currentGroup: string; currentStep: string; leadStatus: string; attachFile: string }[];
}

/** one appointment or task of `GET /dashboard/schedules` */
export interface ScheduleItem {
  id: number;
  scheduleType: 'appointment' | 'task';
  leadId: number;
  prospectName: string;
  prospectImage: string;
  topic: string;
  detail: string;
  /** yyyy-MM-dd */
  appointmentDate: string;
  /** HH:mm:ss, null for an all-day item */
  appointmentTime: string | null;
  allDay: boolean;
  status: string;
  activityGroupId: number | null;
  activityGroupName: string;
  activityStepName: string;
}

/** The BFF contract of the page: answers the URLs of the Java page (`../board/…`, `../dashboardapi`) in the shape of the servlets. */
export interface HomeBackend {
  fetch(input: string, init?: RequestInit): Promise<Response>;
}
