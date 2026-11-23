/**
 * The BFF of the Activities page — what the Java servlets did between the page and `triplesale-service` (ActivityListServlet →
 * ContactActivityApiService, ActivityDetailServlet → LeadBoardView.fetchActivityDetailResult, ContactActivitiesServlet → ContactChannel).
 *
 * The code moved to `core/live/activities.live.parse.ts` when the live backend was built (the core module `activities.live.ts` runs it on the
 * real REST calls; core may not import a feature): this file keeps the names the mock backend and the specs of the page import. Framework-free.
 */
export * from '@core/live/activities.live.parse';
