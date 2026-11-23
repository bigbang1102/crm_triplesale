/**
 * The live backend of the supporting-document screens: the REST calls `Sales_DocumentView` / `SalesDocumentListService` made with
 * `Data_API` / `TriplesaleApi`, through the app's HttpClient (`RestDeps.call`: Bearer token, "session ended" on a 401, the API log).
 * The servlets of the Java side that stood between the page and the service are gone (ADR-001):
 *
 *   /board/sales-document-list   SalesDocumentListServlet  → `SupportingDocService.fetchPage` (supporting-doc.service.ts)
 *   /docattach                   DocAttachServlet          → the files of the browser (`AttachStore`; the bytes never left the page)
 *   /docproxy                    DocProxy                  → the address of the file itself (see supporting-doc.logic.ts)
 *   /board/provinces …           the master-data servlets  → `boardMasterRoutes` (core/live/board-master.live.ts)
 *
 * Every method answers like `Data_API`: `sendGET` = the body of a 200 answer and '' for any other status; `sendPOST` / `sendPUT` = the body
 * WHATEVER the status. Nothing here decides anything — what to send and what to make of the answer is `SupportingDocService`.
 *
 * What could not be checked: there is no test account for the service, so this is proved against a scripted service (`fakeRest` in the spec)
 * that answers the way the Java code expects — not against real data.
 */
import { type RestDeps, body200, composeRoutes, get, service } from '@core/live/rest';
import { boardMasterRoutes } from '@core/live/board-master.live';
import type { BoardFetch, SupportingDocApi } from './supporting-doc-backend';

/** `triplesale.api.documents.formtype.style` of Java's config.properties (the file of this deployment says `old`) */
export const DOCUMENT_FORMTYPE_STYLE = 'old';

/** `URLEncoder.encode(s, UTF-8)` is `application/x-www-form-urlencoded`: a space is `+` — the same text `URLSearchParams` writes */
const formEncode = (s: string): string => new URLSearchParams({ k: s }).toString().slice(2);

export function createLiveSupportingDocApi(deps: RestDeps, formTypeStyle: string = DOCUMENT_FORMTYPE_STYLE): SupportingDocApi {
  return {
    formTypeStyle,
    documents: async (formType, page, pageSize) => body200(await get(deps, '/documents', { formType, page, pageSize })),
    document: async (formType, id) => body200(await get(deps, `/documents/${id}`, { formType })),
    save: async (formType, id, body) =>
      (id === undefined ? await service(deps, 'POST', '/documents', { body }) : await service(deps, 'PUT', `/documents/${id}`, { query: { formType }, body })).text,
    attach: async (formType, id, body) => (await service(deps, 'POST', `/documents/${id.trim()}/attachments`, { query: { formType }, body })).text,
    // key= is always sent, even empty (toQuery would leave it out)
    searchProspects: async (key, page, perPage) =>
      body200(await get(deps, `/master-data/prospects/search?key=${formEncode(key.trim())}&page=${Math.max(page, 0)}&perPage=${perPage}`)),
    employees: async () => body200(await get(deps, '/master-data/employees')),
    prospect: async (id) => body200(await get(deps, `/prospects/${id}`)),
  };
}

/** the master-data servlets the credit-application form's script calls (`/board/provinces` …), answered from the REST service */
export function createLiveBoardFetch(deps: RestDeps): BoardFetch {
  return composeRoutes(boardMasterRoutes(deps));
}
