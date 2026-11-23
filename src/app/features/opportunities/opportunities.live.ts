/**
 * The LIVE backend of the Opportunities page (Board + List): what the servlets under `/board/*` and `LeadBoardView` did on the server, done in the
 * browser. The page script keeps asking the addresses of the Java page (`../board/leads?viewMode=board…`, `../board/tags`, `../board/filter-state`,
 * `../board/contact-activities` …); `fetch()` answers each with a real `Response` built from REST calls to triplesale-service through the app's
 * HttpClient (Bearer token; a 401 ends the session; the API log of the top bar).
 *
 * The routes come from the shared modules of `core/live`:
 *   boardMasterRoutes   /board/master/movement-types (the products), /board/tags, /board/sale-groups, /board/provinces, /board/employees,
 *                       /board/districts … (the filter dialog)
 *   opportunityCoreRoutes      /board/lead, /board/schedule/add|edit (not used by this page, composed for completeness: the same set as the other lead pages)
 *   opportunitiesRoutes         /board/leads (the board and the list), /board/filter-state, /board/contact-activities (the move-step modal),
 *                       and the lead servlets the lead pages share (lead-assign, lead-update, lead-materials, detail-filter-state)
 *   prospectRoutes      /board/prospect-list (the suggestion card under the search box) — a placeholder until the prospects module is merged
 *
 * `initial()` is `LeadBoardView.init()`: the filter state that `POST /board/filter-state` stored (the HttpSession of the Java app; here the
 * sessionStorage of the tab, per signed-in user), handed to the page to restore.
 *
 * Not ported: `../docproxy?url=` (the mixed-content image proxy — an `<img src>` cannot go through `fetch`: the host's `env.docProxy` hands the engine
 * the address the service gave; see INTEGRATION.md).
 */
import { boardMasterRoutes } from '@core/live/board-master.live';
import { opportunityCoreRoutes } from '@core/live/opportunity-core.live';
import { opportunitiesRoutes, savedFilterState } from '@core/live/opportunities.live';
import { prospectRoutes } from '@core/live/prospect.live';
import { opportunityDetailV2Routes, opportunityV2Routes } from '@core/live/opportunities-v2.live';
import { prospectOptionRoutes } from '@core/live/prospect-options.live';
import { composeRoutes, jsonResponse, textResponse, type RestDeps, type RouteHandler } from '@core/live/rest';
import type { OpportunitiesBackend, OpportunitiesInitial } from './opportunities-backend';

/** `LeadBoardView.getSavedFilterJson`: the saved text parsed for the page (the Java page wrote it straight into the script: `var SAVED_FILTER = …;`) */
export function savedFilterOf(deps: RestDeps): unknown {
  const text = savedFilterState(deps);
  if (text === null) return null;
  try {
    return JSON.parse(text);
  } catch {
    return null; // text that is not JSON would have been a script error in Java; the page just starts with its defaults
  }
}

/**
 * The old master-data and board calls this page used to make are gone from the service (404): they are not asked any more.
 * The tags and the sale groups answer empty at once (the lists of the filter stay empty); the provinces and the employees of the filter come from `options`
 * (`prospectOptionRoutes`); the products (the sales lines) and the board come from `GET /opportunities` (`opportunityV2Routes`).
 */
function goneRoutes(): RouteHandler {
  return async (path) => {
    if (path === '/board/tags' || path === '/board/sale-groups') return textResponse(200, '[]');
    return null;
  };
}

/** the live backend: `deps` = the app's REST plumbing (`restDepsOf(injector)` in the host) */
export function createLiveOpportunities(deps: RestDeps): OpportunitiesBackend {
  const route = composeRoutes(opportunityV2Routes(deps), opportunityDetailV2Routes(deps), goneRoutes(), prospectOptionRoutes(deps), boardMasterRoutes(deps), opportunityCoreRoutes(deps), opportunitiesRoutes(deps), prospectRoutes(deps));
  return {
    async initial(): Promise<OpportunitiesInitial> {
      return { savedFilterJson: savedFilterOf(deps) };
    },
    fetch: (input: string, init?: RequestInit): Promise<Response> => route(input, init),
  };
}
