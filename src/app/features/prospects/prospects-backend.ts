/**
 * What the Prospects page needs from its backend — the contract the Java page (contracts.xhtml) had with the server:
 *
 *   the servlets it calls with fetch:
 *     GET  /board/prospect-list?page&perPage&sortBy&searchText&marketingChannelIds&currentCountryId&currentCityId&currentDistrictId&salePersonId[&enrich=1]
 *     GET  /board/prospect-enrich?ids=1,2,3
 *     GET  /board/chat-master-data?type=marketing-channels · GET /board/provinces · GET /board/districts?provinceId= · GET /board/sale-persons
 *     GET  /board/movement-types · GET /board/employees · GET /board/master/activity-groups?movementTypeId=
 *     GET  /board/master/employees-by-activity-group?activityGroupId=            (the last five: js/lead/lead_create_dropdowns.js)
 *     POST /board/lead-create                                                    (the "create lead" modal)
 *     GET|POST|DELETE /board/prospect/attachments                                (the document tab)
 *     GET  /docproxy?url=                                                        (avatars, preview and download of a document)
 *   and the one value the server rendered into the page with EL:
 *     commonBean.uploadAcceptExt                                                 (the `accept` of the file input)
 *
 * Two implementations: `prospects.mock.ts` (dev: deterministic fake data in exactly these shapes) and, in the next phase, a live adapter
 * (see the list of Java classes it replaces in INTEGRATION.md). The page script (`prospects.engine.ts`, generated) never knows which one it
 * talks to.
 */

/** the values `CommonBean` / the session rendered into the page */
export interface ProspectsInitial {
  /** `commonBean.uploadAcceptExt` = FileServerAccess.uploadAcceptAttr() */
  uploadAcceptExt: string;
}

export interface ProspectsBackend {
  /** the values the Java page got through EL */
  initial(): Promise<ProspectsInitial>;
  /**
   * The requests of the page script. `input` is what the script passed to `fetch`: the BFF path with its query
   * (`/board/prospect-list?page=1&perPage=20&sortBy=date_desc`). Answers like the servlet: status + JSON (or the bytes of `/docproxy`).
   */
  fetch(input: string, init?: RequestInit): Promise<Response>;
}

/** one row of `GET /board/prospect-list` (ProspectListService.toRowJson) — the keys are the `data-*` of the row */
export interface ProspectRow {
  id: number;
  code: string;
  name: string;
  /** dd/MM/yyyy */
  date: string;
  source: string;
  phone: string;
  phonecc: string;
  countrycode: string;
  addr: string;
  province: string;
  district: string;
  /** the sub-district with แขวง / ตำบล in front (ContractBean.formatSubDistrict) */
  subdistrict: string;
  country: string;
  agentcode: string;
  agent: string;
  team: string;
  recorder: string;
  /** "ผู้รับผิดชอบ" (employeeName of the service) */
  owner: string;
  /** the id of the responsible person in the options (`r-<n>`); empty = nobody */
  ownerid?: string;
  avatar: string;
  gender: string;
  type: string;
  email: string;
  line: string;
  fb: string;
  x: string;
  ig: string;
  availtime: string;
  availchannel: string;
}
