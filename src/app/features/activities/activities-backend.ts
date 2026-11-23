/**
 * What the Activities page needs from its backend.
 *
 * The page script (`activities.engine.ts`, generated) calls the BFF URLs of the Java page — `../board/activity-list`,
 * `../board/activity-detail`, `../board/contact-activities`, `../board/lead-assign`, `../board/schedule/add` … — through
 * `env.fetch`. In Java those were servlets (`ActivityListServlet`, `ActivityDetailServlet`, `ContactActivitiesServlet` …) that called
 * the REST service `triplesale-service` and did the aggregation / mapping themselves (`ContactActivityApiService`, `LeadBoardView`).
 *
 * Two layers:
 *
 *   ActivitiesBackend  the BFF contract: `fetch(url, init)` answers a BFF URL in the shape the servlet answered.
 *                      Implementations: `activities.mock.ts` (dev: seeded data in these shapes) and `activities.live.ts` (the REST services).
 *   ActivitiesRest     the three GET calls of `triplesale-service` the servlets made (transport only: the status and the body text, as
 *                      `Data_API` saw them). The logic of the servlets — `core/live/activities.live.parse.ts`, the port of
 *                      ContactActivityApiService / LeadBoardView — runs on top of it: the mock implements ActivitiesRest from the seed,
 *                      the live adapter (`core/live/activities.live.ts`) implements it with the app's HttpClient; the code is the same.
 *
 * The types of the REST shapes live in `core/live/activities.live.parse.ts` (the live module of the core uses them); they are re-exported here.
 */
export type {
  ActivitiesRest,
  ContactActivitiesQuery,
  ContactActivitiesResult,
  ContactActivityItem,
  ContactHistoryEntry,
  OpportunityByIdResult,
  RestEnvelope,
  RestText,
} from '@core/live/activities.live.parse';

/** The BFF contract of the page: answers the URLs of the Java page (`../board/…`) in the shape of the servlets. */
export interface ActivitiesBackend {
  fetch(input: string, init?: RequestInit): Promise<Response>;
}
