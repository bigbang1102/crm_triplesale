/**
 * What the Lead detail page needs from its backend — the contract the Java page had with `CommonBean` (the one value the server
 * rendered into the markup with EL) and with the BFF servlets under `/board/*` (the requests the page script makes).
 *
 * Two implementations: `lead-detail.mock.ts` (dev / tests / the Java-vs-Angular comparison: deterministic fake data in exactly the
 * shapes the servlets answer) and `lead-detail.live.ts` (the LIVE backend: it answers the requests below by calling `triplesale-service`
 * directly — the logic of the Java servlets, listed in INTEGRATION.md, composed from `core/live/*`). The page script
 * (`opportunity-detail.engine.ts`, generated) never knows which one it talks to.
 */

/** the values the Java server rendered into the page with EL (besides the messages, the features and the session, which the host gives) */
export interface OpportunityDetailInitial {
  /** `commonBean.uploadAcceptExt`: the accept list of the attachment file input (FileServerAccess.ALLOWED_EXT) */
  uploadAcceptExt: string;
}

export interface OpportunityDetailBackend {
  /** the values of `OpportunityDetailInitial` */
  initial(): Promise<OpportunityDetailInitial>;
  /**
   * The requests of the page script. `input` is what the script passed to `fetch`: a path RELATIVE TO THE PAGE exactly as the Java page
   * wrote it — `../board/lead?id=7&activityGroupId=101`, `../board/prospect/attachments?prospectId=…`, `../docproxy?url=…` (the page lives
   * at `<context>/pages/lead_detail.face`, so `../board/…` is `<context>/board/…`).
   */
  fetch(input: string, init?: RequestInit): Promise<Response>;
}
