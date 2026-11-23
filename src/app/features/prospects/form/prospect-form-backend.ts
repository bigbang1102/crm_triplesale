/**
 * What the prospect form needs from its backend — the contract the Java page (`contracts_master_data.xhtml` + `ContractView`) had with the
 * server. Two layers, as in the Java application:
 *
 *   1. `ProspectFormApi` — the REST calls `ContractView` itself made through `Data_API` / `TriplesaleApi` (the beans of the form talk to this
 *      one; one method per URL). A GET resolves with the body of a 200 answer and '' for anything else (`Data_API.sendGET`); a POST / PUT /
 *      PATCH / DELETE resolves with the body WHATEVER the status ('' = no answer at all). The logic above sees what the Java bean saw.
 *   2. `fetch(url, init)` — the requests of the page's OWN scripts (the "ข้อมูลเพิ่มเติม" tab and the documents tab):
 *        GET  ../board/prospect?id=              ProspectDetailServlet     (the full prospect, with `sunProspectInfo` and `satisfaction`)
 *        POST ../board/prospect/save             ProspectSaveServlet       ({prospectId, extraInfo, fields})
 *        GET  ../board/employees                 EmployeesServlet          (the researcher list)
 *        GET|POST|DELETE ../board/prospect/attachments                     (the documents tab)
 *        GET  /docproxy?url=                     the files of the documents tab
 *      The same URLs the Prospects list page uses (see prospects-backend.ts) — the live side is `prospectRoutes(deps)` of core/live.
 *
 * Two implementations: `prospect-form.mock.ts` (framework-free, in memory) and `prospect-form.live.ts` (HttpClient through `RestDeps`).
 */
import type { ProspectFormInitial } from './prospect-form-types';

export interface ProspectFormApi {
  /** `GET /prospects/{id}` (Java: `callContactsGetByIdApi`; the Java method returns an error body too — it is never read as a prospect) */
  prospect(id: string): Promise<string>;
  /**
   * `GET /master-data/<pathAndQuery>` — `countries?page=1&pageSize=1000` · `provinces?page=1&pageSize=3000` · `districts?provinceId=&page=1&pageSize=1000`
   * · `sub-districts?districtId=&page=1&pageSize=1000` · `business-types?…` · `occupations?…` · `marketing-channels?…` · `communication-types?…` ·
   * `sale-persons?…` · `movement-types/LD` (Java: `fetchBasicMasterDataList(pathAndQuery)` and the `api_*_list()` methods)
   */
  masterData(pathAndQuery: string): Promise<string>;
  /** `/metro_geo.json` of the class path (the file `MetroGeoServlet` serves too): '' when it cannot be read */
  metroGeo(): Promise<string>;
  /** `POST /prospects/duplicate-checks`: the check before a create / release / edit is saved (the answer text, '' when there is none) */
  duplicateCheck(body: Record<string, unknown>): Promise<string>;
  /** `POST /prospects` of the new service (PR-2: `{ mode, customer, assignment }`) with the `Idempotency-Key` header: the answer text, '' when there is none */
  createProspectV2(body: Record<string, unknown>, idempotencyKey: string): Promise<string>;
  /** `POST /prospects` in the shape of the old service (closed: see CREATE_PROSPECT_OPEN) */
  createProspect(body: Record<string, unknown>): Promise<string>;
  /** `PUT /prospects/{id}` */
  updateProspect(id: number | string, body: Record<string, unknown>): Promise<string>;
  /** `PUT /prospects/{id}/extra-info` */
  putExtraInfo(id: number | string, body: Record<string, unknown>): Promise<string>;
  /** `GET /prospects/{id}/attachments` */
  prospectAttachments(id: number | string): Promise<string>;
  /** `POST /prospects/{id}/attachments` (the profile picture: `{attachFileBase64, fileName, attachFileTypeCode, description}`) */
  addProspectAttachment(id: number | string, body: Record<string, unknown>): Promise<string>;
  /** `DELETE /prospects/{id}/attachments/{detailOrderNo}` */
  deleteProspectAttachment(id: number | string, detailOrderNo: number | string): Promise<string>;
  /** `POST /leads` */
  createLead(body: Record<string, unknown>): Promise<string>;
  /** `GET /leads?<query>` (the list of the newest leads of a movement type: how the new lead of a customer is found) */
  findLeads(query: string): Promise<string>;
  /** `PATCH /leads/assign` */
  assignLead(body: Record<string, unknown>): Promise<string>;
}

export interface ProspectFormBackend {
  /** the values the Java page got through EL */
  initial(): Promise<ProspectFormInitial>;
  /** the REST calls of the bean (`ContractView`) */
  api: ProspectFormApi;
  /**
   * The requests of the page script. `input` is what the script passed to `fetch`: the BFF path with its query (`../board/prospect?id=17`,
   * `/board/prospect/attachments?prospectId=17`). Answers like the servlet: status + JSON (or the bytes of `/docproxy`).
   */
  fetch(input: string, init?: RequestInit): Promise<Response>;
}
