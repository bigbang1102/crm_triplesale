/**
 * The LIVE backend of the Prospects page: what the servlets behind `pages/contracts.xhtml` did on the server, done in the browser. The page
 * script keeps asking its old addresses (`/board/prospect-list?page=1&perPage=20&sortBy=date_desc`, `/board/prospect-enrich?ids=1,2,3` …);
 * `fetch()` answers them with real `Response`s built from the calls to `triplesale-service` that the servlets made (through the app's
 * HttpClient: Bearer token, "session ended" on a 401, the API log of the top bar).
 *
 *   /board/prospect-list · /board/prospect-enrich · /board/prospect/attachments · /docproxy        prospectRoutes   (core/live/prospect.live.ts)
 *   /board/prospect-options (the selects of the filter popup)                                    prospectOptionRoutes (core/live/prospect-options.live.ts)
 *   /board/lead-create                                                                          opportunityCreateRoutes (the same file)
 *   /board/chat-master-data · /board/provinces · /board/districts · /board/sale-persons ·
 *   /board/employees · /board/movement-types · /board/master/…                                  boardMasterRoutes (core/live/board-master.live.ts)
 *
 * The one value the server rendered into the page with EL, `commonBean.uploadAcceptExt`, is `FileServerAccess.uploadAcceptAttr()`.
 * Not ported / changed on purpose: see the header of core/live/prospect.live.ts and INTEGRATION.md.
 */
import { boardMasterRoutes } from '@core/live/board-master.live';
import { prospectAssignRoutes } from '@core/live/prospect-assign.live';
import { prospectStatusChangeRoutes } from '@core/live/prospect-status-change.live';
import { prospectTrashActionRoutes } from '@core/live/prospect-trash-action.live';
import { prospectOptionRoutes } from '@core/live/prospect-options.live';
import { opportunityCreateRoutes, prospectRoutes } from '@core/live/prospect.live';
import { uploadAcceptAttr, type FileIo } from '@core/live/prospect-files.live';
import { composeRoutes, type RestDeps } from '@core/live/rest';
import type { ProspectsBackend } from './prospects-backend';

/** the live backend; `deps` = the app's REST plumbing (`restDepsOf(injector)` in the host), `io` = how the file server is reached (the global fetch) */
export function createLiveProspects(deps: RestDeps, io?: FileIo): ProspectsBackend {
  const route = composeRoutes(prospectOptionRoutes(deps), prospectAssignRoutes(deps), prospectTrashActionRoutes(deps), prospectStatusChangeRoutes(deps), prospectRoutes(deps, io), opportunityCreateRoutes(deps), boardMasterRoutes(deps));
  return {
    initial: async () => ({ uploadAcceptExt: uploadAcceptAttr() }),
    fetch: (input, init) => route(input, init),
  };
}
