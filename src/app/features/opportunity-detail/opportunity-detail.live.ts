/**
 * The LIVE backend of the Lead detail page: what the servlets behind `pages/lead_detail.xhtml` did on the server, done in the browser. The page
 * script keeps asking the addresses of the Java page (`../board/lead?id=7&activityGroupId=101`, `../board/lead/close`, `../board/prospect/save` …);
 * `fetch()` answers each with a real `Response` built from REST calls to triplesale-service through the app's HttpClient (Bearer token; a 401 ends
 * the session; the API log of the top bar). There is no BFF, no servlet and no HttpSession any more (ADR-001).
 *
 * The routes come from the shared modules of `core/live` — the page only composes them (the first module that knows an address answers it):
 *   boardMasterRoutes   the master data of the cards, modals and the work modal: /board/employees, tags, sale-groups, sale-persons, fiscal-years,
 *                       material-groups, materials, provinces, districts, sub-districts, metro-geo, chat-master-data, master/activity-groups,
 *                       master/employees-by-activity-group
 *   opportunityCoreRoutes      /board/lead (LeadDetailServlet: the page load) and the work modal's writes /board/schedule/add|edit
 *   opportunitiesRoutes         /board/lead-update (every action of the cards), /board/lead-materials (the products), /board/detail-filter-state (the saved
 *                       filter of the history: HttpSession → sessionStorage of the tab, per user), /board/contact-activities, /board/leads (the
 *                       customer search of the work modal)
 *   prospectRoutes      /board/prospect, /board/prospect/save | attachments | avatar | rv-attachments and /docproxy (the customer tabs and documents)
 *   activityRoutes      /board/activity-groups, /board/activity-steps (the stepbar and the history filter)
 *   opportunityActionRoutes    /board/lead/close | close-step | forward | return | accessor-add | contact-history | forward-groups | forward-employees |
 *                       return-groups | accessors  (core/live/opportunity-actions.live.ts: the servlets only this page calls)
 *
 * The one value the server rendered into the markup with EL, `commonBean.uploadAcceptExt`, is `FileServerAccess.uploadAcceptAttr()`.
 *
 * Not answered here (see INTEGRATION.md): `../docproxy?url=` as the `src` of an `<img>` (an image request is not a `fetch`: the host's `env.docProxy`
 * hands the engine the address the service gave), `../rvreport?txno=` (a `window.open`: the host decides what opens).
 */
import { activityRoutes } from '@core/live/activities.live';
import { boardMasterRoutes } from '@core/live/board-master.live';
import { NO_CONTENT, opportunityActionRoutes } from '@core/live/opportunity-actions.live';
import { opportunityDetailV2Routes } from '@core/live/opportunities-v2.live';
import { opportunityCoreRoutes } from '@core/live/opportunity-core.live';
import { opportunitiesRoutes } from '@core/live/opportunities.live';
import { uploadAcceptAttr, type FileIo } from '@core/live/prospect-files.live';
import { prospectStatusChangeRoutes } from '@core/live/prospect-status-change.live';
import { prospectRoutes, SECTIONS_WITHOUT_ATTACHMENTS } from '@core/live/prospect.live';
import { opportunityAttachmentsRoutes } from '@core/live/opportunity-attachments.live';
import { opportunityContactHistoryRoutes } from '@core/live/opportunity-contact-history.live';
import { opportunityAssigneesRoutes } from '@core/live/opportunity-assignees.live';
import { opportunityHeaderRoutes } from '@core/live/opportunity-header.live';
import { opportunitySalePersonRoutes } from '@core/live/opportunity-sale-person.live';
import { ensureSets, FILTER_OPTION_SETS, saleTeamRoutes } from '@core/live/sale-team.live';
import { pipelineSteps, pipelinesDebug } from '@core/live/pipelines.live';
import { composeRoutes, textResponse, type RestDeps, type RouteHandler } from '@core/live/rest';
import type { OpportunityDetailBackend } from './opportunity-detail-backend';

/**
 * What the page asks of the OLD service (`/master-data/*`, `/leads/{id}/…`: 404 on the new one) is not asked: the answer is what the servlet gave when the
 * service had nothing — the page keeps working with empty lists. Only reads; the writes (close, forward, return, contact note …) still go to the service.
 *   [] lists:   tags · provinces · districts · sub-districts · sale-groups · sale-persons · employees · fiscal-years · material-groups · materials ·
 *               movement-types · activity-steps · chat-master-data (countries, business-types, occupations, marketing-channels, communication-types)
 *   {}          activity-groups (the page infers the groups from `activeSteps`) · lead/contact-history · prospect/rv-attachments (`/rv/attachments`: no sale documents)
 *   204 stand-in  lead/forward-groups · return-groups · forward-employees · accessors · master/activity-groups · master/employees-by-activity-group
 */
const GONE_CHAT_TYPES: ReadonlySet<string> = new Set(['countries', 'business-types', 'occupations', 'marketing-channels', 'communication-types']);
const GONE_LISTS: ReadonlySet<string> = new Set([
  '/board/tags', '/board/provinces', '/board/districts', '/board/sub-districts', '/board/sale-groups', '/board/sale-persons', '/board/employees',
  '/board/fiscal-years', '/board/material-groups', '/board/materials', '/board/movement-types', '/board/activity-steps',
]);
const GONE_EMPTY_OBJECT: ReadonlySet<string> = new Set(['/board/activity-groups', '/board/lead/contact-history', '/board/prospect/rv-attachments']);
const GONE_NO_CONTENT: ReadonlySet<string> = new Set([
  '/board/lead/forward-groups', '/board/lead/return-groups', '/board/lead/forward-employees', '/board/lead/accessors',
  '/board/master/activity-groups', '/board/master/employees-by-activity-group',
]);
export function goneRoutes(): RouteHandler {
  return async (path, query, init) => {
    if ((init?.method ?? 'GET').toUpperCase() !== 'GET') return null;
    if (GONE_LISTS.has(path)) return textResponse(200, '[]');
    if (GONE_EMPTY_OBJECT.has(path)) return textResponse(200, '{}');
    if (GONE_NO_CONTENT.has(path)) return textResponse(200, NO_CONTENT);
    if (path === '/board/chat-master-data' && GONE_CHAT_TYPES.has((query.get('type') ?? '').trim())) return textResponse(200, '[]');
    return null;
  };
}

/**
 * `/board/activity-steps` (the steps of the dropdown "ขั้นตอน" of the contact form): the old service has none for an opportunity (`goneRoutes` answers `[]`), so
 * they come from the pipeline of the activity group, kept in the session by the opportunities page (`filter-options`). No kept pipeline of that group → `null`
 * (`goneRoutes` answers as before).
 */
export function pipelineStepsRoute(deps: RestDeps): RouteHandler {
  return async (path, query, init) => {
    if (path !== '/board/activity-steps' || (init?.method ?? 'GET').toUpperCase() !== 'GET') return null;
    const group = (query.get('activityGroupId') ?? '').trim();
    const steps = pipelineSteps(deps, group);
    if (!steps) console.warn('[pipelines] no steps for activityGroupId=' + JSON.stringify(group) + ' — ' + pipelinesDebug(deps));
    return steps ? textResponse(200, JSON.stringify(steps)) : null;
  };
}

/**
 * the live backend; `deps` = the app's REST plumbing (`restDepsOf(injector)` in the host), `io` = how the file server is reached (the global fetch;
 * a stand-in in the specs)
 *
 * The ORDER matters where two modules answer the same address: `opportunitiesRoutes` before `activityRoutes` — both port `ContactActivitiesServlet`
 * (`POST /board/contact-activities`) and `AssignLeadServlet`; the lead board's port is the one the contact form of this page was written against.
 */
export function createLiveOpportunityDetail(deps: RestDeps, io?: FileIo): OpportunityDetailBackend {
  const route = composeRoutes(
    pipelineStepsRoute(deps),
    opportunityAssigneesRoutes(deps),
    opportunityAttachmentsRoutes(deps),
    opportunityContactHistoryRoutes(deps),
    saleTeamRoutes(deps),
    opportunitySalePersonRoutes(deps),
    opportunityHeaderRoutes(deps),
    goneRoutes(),
    opportunityDetailV2Routes(deps),
    boardMasterRoutes(deps),
    opportunityCoreRoutes(deps),
    opportunitiesRoutes(deps),
    prospectStatusChangeRoutes(deps), // the usage status of the customer (radios of the tab ข้อมูลหลัก)
    prospectRoutes(deps, io, SECTIONS_WITHOUT_ATTACHMENTS), // the documents of this page are the opportunity's (OP05): no section ATTACHMENTS
    activityRoutes(deps),
    opportunityActionRoutes(deps),
  );
  return {
    initial: async () => {
      // entering the page: the filter options (OP07) are asked now, only the sets the session does not hold (the dropdowns then open at once); not awaited
      void ensureSets(deps, FILTER_OPTION_SETS);
      return { uploadAcceptExt: uploadAcceptAttr() };
    },
    fetch: (input, init) => route(input, init),
  };
}
