/**
 * What the Opportunities page (Board + List) needs from its backend — the contract the Java page had with `LeadBoardView` (the value the
 * server rendered into the page with EL) and with the servlets under `/board/*` (the requests the page script makes).
 *
 * The page script (`opportunities.engine.ts`, generated) calls `fetch` with the addresses the Java page wrote ('../board/leads?viewMode=board…')
 * and reads the answers in the shapes the servlets gave. Two implementations are possible behind it:
 *
 *   - `leads.mock.ts`   dev (`mock: true`): deterministic fake data in exactly these shapes — the only one in phase A
 *   - a live adapter    (phase B, NOT built yet): moves the logic of the servlets to TypeScript and calls triplesale-service
 *                       directly (no BFF). What it has to do is listed in INTEGRATION.md ("servlets that the live phase ports").
 *
 * The page never knows which one it talks to.
 */

/** the values `LeadBoardView` exposed to EL */
export interface OpportunitiesInitial {
  /**
   * `#{leadBoardView.savedFilterJson}`: the filter state that `POST /board/filter-state` stored in the HttpSession the last time the
   * page loaded leads (null when the session has none): `{ mid, product, agid, search, showClosed, dateFrom, dateTo, tagIds, province,
   * district, activeStatus, saleGroup, owner, fGroup, fStep, sort, tab }`
   */
  savedFilterJson: unknown;
}

export interface OpportunitiesBackend {
  /** `LeadBoardView.init()` of the Java page: what the first paint needs (the saved filter state) — no network in Java either */
  initial(): Promise<OpportunitiesInitial>;
  /**
   * The requests of the page script. `input` is what the script passed to `fetch`: the address as the Java page wrote it
   * (`../board/leads?viewMode=board&…`, `../board/master/movement-types?type=LD`, `../board/tags`, `/triplesale/board/prospect-list?…`).
   * Answers are `Response`s with the status, content type and body the servlets gave.
   */
  fetch(input: string, init?: RequestInit): Promise<Response>;
}
