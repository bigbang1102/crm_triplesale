/**
 * What the supporting-document screens need from the REST API of `triplesale-service` — the calls `Sales_DocumentView` /
 * `SalesDocumentListService` made through `Data_API` / `TriplesaleApi`, one method each. Nothing else: the bean's own logic (paging, filter,
 * the body of a save, the lookups) is `supporting-doc.service.ts`, written once for the mock and the live backend.
 *
 * Two implementations: `supporting-doc.mock.ts` (framework-free, in memory) and `supporting-doc.live.ts` (HttpClient through `RestDeps`).
 * Both answer in the shape of the real service: the list as `{ status, result: { items | result: [], total } }`, a detail / save as
 * `{ status, result }`, the master-data lists as `{ result: [...] }`. A method resolves with the body of a 200 answer and `''` for anything
 * else (`Data_API.sendGET` does the same: a failing call is just an empty body), so the logic above sees what the Java bean saw.
 */

export interface SupportingDocApi {
  /** `triplesale.api.documents.formtype.style` of config.properties: `new` = PascalCase `formType`, anything else = the lowercase spelling */
  readonly formTypeStyle: string;

  /** `GET /api/v1/documents?formType=&page=&pageSize=` — the body (JSON text) of a 200 answer, '' otherwise */
  documents(formType: string, page: number, pageSize: number): Promise<string>;
  /** `GET /api/v1/documents/{id}?formType=` */
  document(formType: string, id: string): Promise<string>;
  /** `POST /api/v1/documents` (id undefined) or `PUT /api/v1/documents/{id}?formType=` — the body of the answer WHATEVER its status ('' = no answer) */
  save(formType: string, id: string | undefined, body: Record<string, unknown>): Promise<string>;
  /** `POST /api/v1/documents/{id}/attachments?formType=` — the body of the answer WHATEVER its status */
  attach(formType: string, id: string, body: Record<string, unknown>): Promise<string>;
  /** `GET /api/v1/master-data/prospects/search?key=&page=&perPage=` */
  searchProspects(key: string, page: number, perPage: number): Promise<string>;
  /** `GET /api/v1/master-data/employees` */
  employees(): Promise<string>;
  /** `GET /api/v1/prospects/{id}` */
  prospect(id: string): Promise<string>;
}

/** the fetch the form of the credit application (sub_7) gives its script for `/board/provinces`, `/board/districts`, `/board/sub-districts` */
export type BoardFetch = (input: string, init?: RequestInit) => Promise<Response>;
