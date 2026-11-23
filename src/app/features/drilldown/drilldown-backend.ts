/**
 * What the DrillDown page needs from its backend — the contract the Java page had with the servlet `/board/drilldown`
 * (DrilldownApiServlet -> DrilldownApiService).
 *
 * The page has NO data that the server rendered into it with EL (no bean): the only server-side values are the texts and the
 * language, which the host takes from `I18n`. Everything else is the one request the page script makes:
 *
 *   GET <api>?action=data&code=T-CS-01&page=1&pageSize=100
 *
 * Two implementations: `drilldown.mock.ts` (dev: deterministic sample data in exactly this shape — the same sample mode the Java
 * service has behind `drilldown.mock=true`) and, in the next phase, a live adapter (the work of DrilldownApiService: GET
 * `{triplesale-service}/api/v1/drilldown/<apiPath>` with the Bearer token, then the column planning of `drilldown.columns.ts`). The
 * page script (`drilldown.engine.ts`, generated) never knows which one it talks to.
 */

/** one column of the table: `key` is the field of the rows, `label` the title; `mapped` = the title came from the dictionary */
export interface DrilldownColumn {
  key: string;
  label: string;
  mapped: boolean;
}

/** `data` of the answer (the object is `{}` when the report is unknown / the call failed) */
export interface DrilldownData {
  code: string;
  supportsDateRange: boolean;
  /** true in the sample-data mode: the page shows the "ข้อมูลตัวอย่าง" pill */
  mock?: boolean;
  columns: DrilldownColumn[];
  /** every value is a string ('' = empty); dates arrive as ISO text (the page formats them) */
  rows: Record<string, string>[];
  page: number;
  pageSize: number;
  total: number;
}

/** the envelope of the team's API standard: `{ success, message, data }` */
export interface DrilldownEnvelope {
  success: boolean;
  message: string;
  data: DrilldownData | Record<string, never>;
}

/** `GET ?action=reports`: the list for a report picker (the page does not use it) */
export interface DrilldownReportInfo {
  code: string;
  apiPath: string;
  supportsDateRange: boolean;
}

export interface DrilldownBackend {
  /**
   * The request of the page script. `input` is what the script passed to `fetch`: the servlet path with its query
   * (`/board/drilldown?action=data&code=T-CS-01&page=1&pageSize=100`). Answers like the servlet: status + JSON envelope.
   */
  fetch(input: string, init?: RequestInit): Promise<Response>;
}
