/**
 * The live backend of the prospect form: the REST calls `ContractView` made with `Data_API` / `TriplesaleApi`, through the app's HttpClient
 * (`RestDeps.call`: Bearer token, "session ended" on a 401, the API log), and the servlets the page's own scripts call, answered in the browser:
 *
 *   /board/prospect · /board/prospect/save · /board/prospect/attachments · /board/prospect/avatar · /docproxy      `prospectRoutes` (core/live/prospect.live.ts)
 *   /board/employees · /board/provinces · /board/districts · /board/metro-geo …                                    `boardMasterRoutes` (core/live/board-master.live.ts)
 *
 * Every REST method answers like `Data_API`: `sendGET` = the body of a 200 answer and '' for any other status; `sendPOST` / `sendPUT` /
 * `sendPATCH` / `sendDELETE` = the body WHATEVER the status. Nothing here decides anything — what to send and what to make of the answer is
 * `ProspectFormView` / `ProspectFormService`.
 *
 * What could not be checked: there is no test account for the service, so this is proved against a scripted service (`fakeRest` in the spec) that
 * answers the way the Java code expects — not against real data. The two database steps of `ContractView` (`SunProspectInfoBoDao`) have no REST
 * counterpart and are not ported (docs/integration/prospects-live.md §3.1–3.2).
 */
import { boardMasterRoutes, translateEnvelopeResultTh } from '@core/live/board-master.live';
import { type JObj, isArr, isObj, optString, parseJson } from '@core/live/org-json';
import { type FileIo, browserFileIo, uploadAcceptAttr } from '@core/live/prospect-files.live';
import { attachmentsEnvelope } from '@core/live/prospect-v2.live';
import { fetchOptionRows, optionsRequestOf, prospectOptionRoutes } from '@core/live/prospect-options.live';
import { opportunityCreateRoutes, prospectRoutes } from '@core/live/prospect.live';
import { type RestDeps, type RouteHandler, body200, composeRoutes, get, sendBody, service, textResponse } from '@core/live/rest';
import type { ProspectFormApi, ProspectFormBackend } from './prospect-form-backend';
import { normalizeProspectV2 } from './prospect-form.service';

const enc = (id: number | string): string => encodeURIComponent(String(id).trim());

/**
 * `result` of the record as the flat object the old `/board/prospect?id=` gave (`normalizeProspectV2`), kept per id by `createLiveProspectFormApi`
 * for the first `/board/prospect?id=` that follows (the "extra info" tab of the detail page asks for the same record the page has just read).
 */
export { attachmentsEnvelope };

export type KeptRecords = Map<string, string>;

/**
 * Is `POST /api/v1/prospects` (create) open? Not yet: while it is closed a create runs the duplicate check, and then answers a message instead of
 * sending the POST (so a try with the real service creates nothing). Set it to true to open the create; the update (PUT) is not affected.
 */
export const CREATE_PROSPECT_OPEN = false;
const CREATE_PROSPECT_CLOSED_ANSWER = JSON.stringify({ status: 503, message: 'ปิดการสร้างลูกค้าไว้ชั่วคราว (ยังไม่ได้เปิด POST /prospects) — ตรวจข้อมูลซ้ำผ่านแล้ว' });

/** what the live form is opened for: a record of the TRASH (the detail page of a deleted prospect) is read from `GET /prospects/trash/{id}` */
export interface LiveFormOptions {
  trash?: boolean;
}

export function createLiveProspectFormApi(deps: RestDeps, records: KeptRecords = new Map(), opts: LiveFormOptions = {}): ProspectFormApi {
  // the attachments came with the record: the first read of the documents after `prospect(id)` uses them (no second call); a later one asks again
  const withRecord = new Map<string, string>();
  return {
    prospect: async (id) => {
      // GET /prospects/{id} is a 404 for a record of the trash: it has its own address
      const body = opts.trash ? body200(await get(deps, `/prospects/trash/${enc(id)}`)) : body200(await get(deps, `/prospects/${enc(id)}`, { sections: 'BASE,SOCIAL,ATTACHMENTS,OPPORTUNITIES' }));
      if (body !== '') {
        withRecord.set(String(id).trim(), attachmentsEnvelope(body));
        const root = parseJson(body);
        if (isObj(root) && isObj(root['result'])) records.set(String(id).trim(), JSON.stringify(normalizeProspectV2(root['result'])));
      }
      return body;
    },
    masterData: async (pathAndQuery) => {
      // the lists of the dropdowns come from `GET /prospects/options` (kept for the session); `/master-data/…` of these is gone from the service (404).
      // Same answer shape as before ({ status, result: [...] }); a failed call is '' (the list is then empty), as a master-data call that was not 200 was
      const option = optionsRequestOf(pathAndQuery);
      if (option) {
        if (option.sets === 'districts' && option.params['provinceId'] === '') return '';
        const got = await fetchOptionRows(deps, option.sets, option.params);
        if (!got.ok) return '';
        const body = JSON.stringify({ status: 200, message: 'success', result: got.rows });
        // api_country_list(): MasterDataI18n.translateTh(code, nameTh) on every country
        return option.sets === 'countries' ? translateEnvelopeResultTh(deps, body) : body;
      }
      const body = body200(await get(deps, `/master-data/${pathAndQuery}`));
      // api_country_list(): MasterDataI18n.translateTh(code, nameTh) on every country
      return pathAndQuery.startsWith('countries') && body !== '' ? translateEnvelopeResultTh(deps, body) : body;
    },
    // the classpath file /metro_geo.json is the file MetroGeoServlet serves: assets/data/metro-geo.json
    metroGeo: async () => (await deps.asset('assets/data/metro-geo.json')) ?? '',
    // whatever the status: a 4xx says what is wrong with the data; the caller reads the verdict from a 2xx only
    duplicateCheck: (body) => sendBody(deps, 'POST', '/prospects/duplicate-checks', body),
    // the create of the new service: the body of PR-2 and its Idempotency-Key (one per action: a retry of the same data sends the same key, the service does it once)
    createProspectV2: async (body, key) => (await service(deps, 'POST', '/prospects', { body, headers: { 'Idempotency-Key': key } })).text,
    // the old shape is closed (the old save path asks the duplicate check and stops here): see CREATE_PROSPECT_OPEN
    createProspect: async (body) => (CREATE_PROSPECT_OPEN ? sendBody(deps, 'POST', '/prospects', body) : CREATE_PROSPECT_CLOSED_ANSWER),
    // a write makes what was kept stale
    updateProspect: (id, body) => (records.delete(String(id).trim()), sendBody(deps, 'PUT', `/prospects/${enc(id)}`, body)),
    putExtraInfo: (id, body) => (records.delete(String(id).trim()), sendBody(deps, 'PUT', `/prospects/${enc(id)}/extra-info`, body)),
    prospectAttachments: async (id) => {
      const key = String(id).trim();
      const kept = withRecord.get(key);
      if (kept !== undefined) {
        withRecord.delete(key);
        return kept;
      }
      // (the trash has no list of documents of its own: what came with the record is all there is)
      if (opts.trash) return attachmentsEnvelope('');
      return attachmentsEnvelope(body200(await get(deps, `/prospects/${enc(id)}`, { sections: 'ATTACHMENTS' })));
    },
    addProspectAttachment: (id, body) => sendBody(deps, 'POST', `/prospects/${enc(id)}/attachments`, body),
    deleteProspectAttachment: (id, no) => sendBody(deps, 'DELETE', `/prospects/${enc(id)}/attachments/${enc(no)}`),
    createLead: (body) => sendBody(deps, 'POST', '/leads', body),
    findLeads: async (query) => body200(await get(deps, `/leads?${query}`)),
    assignLead: (body) => sendBody(deps, 'PATCH', '/leads/assign', body),
  };
}

/** the backend of the form on the live service (`io`: how the documents' files are fetched — the browser's `fetch`) */
export function createLiveProspectFormBackend(deps: RestDeps, io: FileIo = browserFileIo, opts: LiveFormOptions = {}): ProspectFormBackend {
  const records: KeptRecords = new Map();
  // `/board/prospect?id=` (the extra-info tab) first uses the record the page has just read: no second GET /prospects/{id}; used once, a write drops it
  const keptRecord: RouteHandler = async (path, query) => {
    if (path !== '/board/prospect') return null;
    const id = (query.get('id') ?? '').trim();
    const kept = records.get(id);
    if (kept === undefined) return null;
    records.delete(id);
    return textResponse(200, kept);
  };
  const dropKept: RouteHandler = async (path) => {
    if (path === '/board/prospect/save' || path === '/board/prospect/update') records.clear();
    return null;
  };
  return {
    initial: async () => ({ uploadAcceptExt: uploadAcceptAttr(), ssEmployeeId: deps.user.employeeId == null ? '' : String(deps.user.employeeId) }),
    api: createLiveProspectFormApi(deps, records, opts),
    fetch: composeRoutes(dropKept, keptRecord, prospectOptionRoutes(deps), prospectRoutes(deps, io), opportunityCreateRoutes(deps), boardMasterRoutes(deps)),
  };
}
