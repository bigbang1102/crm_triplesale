/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * The pure part of the contact-activity servlets of the Java board (no Angular, no I/O of its own — the REST calls come in through
 * `ActivitiesRest`, so the live backend, the mock backend, the specs and the comparison harness all run the very same code):
 *
 *   ActivityListServlet   → `fetchActivityList()`   ← ContactActivityApiService.fetchActivityListJson (+ LeadBoardView.acMapSummary, acBadgeStatus,
 *                                                     acIso2Thai, acChannelKey, acIsContactChannel, acBuildHistoryGroups, acSortByChangeDateDesc,
 *                                                     fetchContactHistoryArr, AttachUrl.collapse)
 *   ActivityDetailServlet → `fetchActivityDetail()` ← LeadBoardView.fetchActivityDetailResult (the mapping of `GET /leads/{id}` for the right panel)
 *   ContactActivitiesServlet → `contactChannelLabel()` (ContactChannel.toO2oLabel, applied to the body before it is forwarded)
 *
 * What the Java code did, to the letter (Java is the truth — the first TypeScript port of this file was audited against it):
 *   - the service answers are read the way `Data_API` gave them: `sendGET` = the body of an HTTP 200, "" for anything else (the error body of
 *     the service was only logged — so a 403 of /contact-activities is NOT the message of the service but "ไม่ได้รับข้อมูลจาก API การติดต่อ");
 *     `sendGETWithStatus` (GET /leads/{id}) = the status and the body, also of an error;
 *   - JSON is org.json (`org-json.ts`): `optString` / `optInt` / `optLong`, `optJSONObject` (only an object), `optJSONArray` (only an array);
 *   - `String.trim()` cuts every character ≤ U+0020 (not the no-break space), `String.split` drops the trailing empty strings,
 *     `String.compareTo` compares UTF-16 code units — `javaTrim` / `javaSplit` / `cmp` below;
 *   - the avatar addresses go through `AttachUrl.collapse` (a host that was glued in front of a host).
 *
 * Not ported: the fallback mode `activity.list.source=aggregate` (config.properties says `api`) and the 60 s timeout of the worker threads
 * (the browser decides how long a call may take).
 */
import { opportunityErrorJson as leadErrorText, opportunityErrorResult, unwrapLeadResult, type OpportunityResult } from './opportunity-core.live';
import { summaryItemOf } from './activities-summary.live';
import { has, isArr, isObj, optInt, optLong, optString, parseJson, type JObj } from './org-json';

type Obj = Record<string, any>;

/**
 * An id of the page: a whole number stays a number (the old model), anything else that is not empty is kept as the text it came as (the ids of the new service are
 * uuids — `optLong` would make every one of them 0 and the rows would collapse into one); 0 when there is none.
 */
export function optId(o: JObj, key: string): number | string {
  const v = o[key];
  if (typeof v === 'string' && v.trim() !== '' && !/^[+-]?\d+$/.test(v)) return v.trim();
  return optLong(o, key, 0);
}

/* ------------------------------------------------------------------ the REST seam */

/** the envelope of triplesale-service: `{ status, message, result }`, on failure `{ status, message, error: { code, message } }` */
export interface RestEnvelope<T = unknown> {
  status: number;
  message?: string;
  result?: T;
  error?: { code?: number; message?: string };
}

/** `GET /contact-activities` — ContactActivityListReqDTO (the request names `pageNo` / `pageSize`, the response meta `page` / `perPage`) */
export interface ContactActivitiesQuery {
  groupBy: 'lead' | 'group';
  movementTypeId?: string;
  leadId?: string;
  saleGroupId?: string;
  /** substring of the NAME of the responsible employee */
  employeeName?: string;
  /** substring of the NAME of the contact person (the BFF sends the search box here) */
  contactName?: string;
  activeStatus?: string;
  /** yyyy-MM-dd */
  lastContactFrom?: string;
  lastContactTo?: string;
  assignDateFrom?: string;
  assignDateTo?: string;
  /** 'true' | 'false' — absent = the backend default (false: closed leads are left out of `items`, still counted in `statusSummary`) */
  showClosed?: string;
  /** lastContactDate_desc | lastContactDate_asc | prospectName_asc | prospectName_desc */
  sortBy?: string;
  /** 0-based; absent = the first page */
  pageNo?: number;
  pageSize: number;
}

/** one item of `result.items` of `GET /contact-activities` (groupBy=lead: one per lead; groupBy=group: one per lead × workflow group) */
export interface ContactActivityItem {
  leadId: number;
  contactCode: string;
  /** id of the employee named by contactCode / contactName (`responsible.id` of the list) */
  contactId?: number | string;
  contactName: string;
  contactAvatar?: string;
  prospectName: string;
  prospectAvatar?: string;
  prospectId: number;
  prospectCode: string;
  prospectTel: string;
  txNo: string;
  leadDemand: string;
  procedureGroupId: number;
  procedureGroupName?: string;
  procedureId: number;
  procedureName: string;
  wfsId?: number;
  groupCount: number;
  leadStatus: string;
  activeStatus: string;
  tags?: { id: number; code: string; name: string; colorCode: string }[];
  /** ISO date/time */
  lastContactDate: string;
  assignDate: string;
  lastAppointmentDate?: string;
  /** channel counters (facebook → the `fb` column of the table) */
  note: number;
  line: number;
  facebook: number;
  whatsapp: number;
  email: number;
  sms: number;
  call: number;
  visit: number;
}

export interface ContactActivitiesResult {
  items: ContactActivityItem[];
  meta: { page: number; perPage: number; total: number; totalPages: number };
  statusSummary: { total: number; new: number; success: number; lost: number; inactive: number; active: { total: number; hot: number; warm: number; cold: number } };
  usesWorkflowStep: boolean;
  wfStepSummary: { id: number; code: string; name: string; count: number }[];
  movementTypeId: number;
}

/** one entry of the contact history of a lead (`/leads/{id}/contact-history` after flattening, and `contactHistoryList` of `/leads/{id}`) */
export interface ContactHistoryEntry {
  id?: number;
  /** ISO date/time */
  changeDate: string;
  /** the channel label ('Call Out', 'Line' …) or 'system' for the events the workflow writes (create / forward / return) */
  channel: string;
  type?: string;
  content: string;
  contactTxNo?: string;
  procedureGroupId: number;
  procedureGroupName?: string;
  procedureId?: number;
  procedureName?: string;
  salePerson?: { code: string; name: string };
  employee?: { code: string; name: string };
}

/** `result` of `GET /leads/{id}` — only the parts the Activities page reads */
export interface OpportunityByIdResult {
  prospect: { name?: string; attachFile?: string; currentDistrictName?: string; currentCityName?: string; customerTel?: string; phoneCountryCode?: string; countryCode?: string };
  prospectInfo?: { fullName?: string; firstContactDate?: string; contactInfo?: { mobile1?: string } };
  salePerson?: { id?: number; code?: string; name?: string };
  saleGroup?: { name?: string };
  employee?: { id?: number; code?: string; name?: string };
  leadStatus: string;
  activeStatus?: string;
  contactDate?: string;
  currentStep?: { procedureGroupId?: number; procedureGroupName?: string; procedureName?: string };
  contactHistoryList: ContactHistoryEntry[];
  appointmentList: { id: number; subject: string; date: string; time: string; status?: string; procedureGroupName?: string; procedureName?: string }[];
  taskList: { id: number; completed: boolean; date: string; time: string; allDay: boolean; subject: string; description: string; procedureGroupName?: string; procedureName?: string }[];
}

/** what a REST call gave: the HTTP status (0 = no answer at all) and the body text ('' when there is none) — the raw material `Data_API` worked from */
export type RestText = OpportunityResult;

/** the three GET calls of triplesale-service that the BFF of the Activities page makes — transport only: the Java logic is in this file */
export interface ActivitiesRest {
  /** the list is ONE call (`view=BY_OPPORTUNITY` with the children of every item): no second call for the groups, no contact history to fill them up */
  singleView?: boolean;
  /** `GET /contact-activities` */
  contactActivities(q: ContactActivitiesQuery): Promise<RestText>;
  /** `GET /leads/{id}/contact-history` */
  contactHistory(leadId: string): Promise<RestText>;
  /** `GET /leads/{id}[?activityGroupId=]` (`Data_API.sendGETWithStatus`: the status and the body also of an error) */
  leadById(id: string, activityGroupId?: string): Promise<RestText>;
}

/* ------------------------------------------------------------------ Java helpers */

/** `String.trim()`: every character up to U+0020 */
export const javaTrim = (s: string): string => s.replace(/^[\u0000- ]+/, '').replace(/[\u0000- ]+$/, '');
/** `String.split(sep)` for a literal separator: nothing to split = the string itself, the trailing empty strings are dropped */
export function javaSplit(s: string, sep: string): string[] {
  if (!s.includes(sep)) return [s];
  const parts = s.split(sep);
  while (parts.length > 0 && parts[parts.length - 1] === '') parts.pop();
  return parts;
}
/** `String.compareTo` (UTF-16 code units) */
const cmp = (a: string, b: string): number => (a < b ? -1 : a > b ? 1 : 0);
/** `Integer.parseInt(text)`: an int in decimal text, else a NumberFormatException (here: undefined) */
export function javaParseInt(text: string): number | undefined {
  if (!/^[+-]?\d+$/.test(text)) return undefined;
  const n = Number(text);
  return n >= -2147483648 && n <= 2147483647 ? n : undefined;
}
/** `Long.parseLong(text)` */
export function javaParseLong(text: string): number | undefined {
  if (!/^[+-]?\d+$/.test(text)) return undefined;
  const n = BigInt(text);
  return n >= -9223372036854775808n && n <= 9223372036854775807n ? Number(n) : undefined;
}
/** `JSONObject.optBoolean(key, def)` */
export function optBool(o: JObj | null | undefined, key: string, def = false): boolean {
  const v = o?.[key];
  if (v === true) return true;
  if (v === false) return false;
  if (typeof v === 'string') {
    const t = v.toLowerCase();
    if (t === 'true') return true;
    if (t === 'false') return false;
  }
  return def;
}
const trimToNull = (v: string | undefined | null): string | undefined => (v == null || javaTrim(v) === '' ? undefined : javaTrim(v));
const objOf = (v: unknown): JObj | null => (isObj(v) ? v : null);
const arrOf = (v: unknown): unknown[] | null => (isArr(v) ? v : null);

/* ------------------------------------------------------------------ AttachUrl / ContactChannel / LeadBoardView helpers */

const HOST_PREFIX = /^https?:\/\/[^/]+\//;
/** `AttachUrl.isAbsolute` */
const isAbsolute = (s: string): boolean => {
  const low = javaTrim(s).toLowerCase();
  return low.startsWith('http://') || low.startsWith('https://');
};
/** `AttachUrl.collapse`: "http://h/http://h/a.jpg" → "http://h/a.jpg" (the host of a host is glued in front by the backend on every save), "a.jpg" and "http://h/a.jpg" stay */
export function collapseAttachUrl(raw: string | null | undefined): string {
  if (raw == null) return '';
  let url = javaTrim(raw);
  while (url !== '') {
    const rest = url.replace(HOST_PREFIX, '');
    if (rest === url || !isAbsolute(rest)) break; // not absolute any more, or what is left is a real path: this layer is the answer
    url = rest;
  }
  return url;
}

/** ContactChannel.normalizeKey: lower case, only a-z0-9 */
export const normalizeKey = (raw: string | null | undefined): string => (raw == null ? '' : raw.toLowerCase().replace(/[^a-z0-9]/g, ''));

const O2O_LABEL: Record<string, string> = { manual: 'Manual', callin: 'Call In', callout: 'Call Out', sms: 'SMS', email: 'Email', facebook: 'Facebook', line: 'Line', whatsapp: 'WhatsApp' };
/** ContactChannel.toO2oLabel: 'call_out' → 'Call Out'; an unknown value passes through (trimmed) */
export function contactChannelLabel(raw: string): string {
  const trimmed = javaTrim(raw);
  const key = normalizeKey(trimmed);
  return Object.hasOwn(O2O_LABEL, key) ? O2O_LABEL[key] : trimmed;
}

/** the name of a group when a contact has neither procedureGroupName nor procedureName (LeadBoardView.AC_GROUP_FALLBACK) */
export const AC_GROUP_FALLBACK = 'การติดต่อ';
/** LeadBoardView.AC_CH_SYSTEM / AC_CH_FORWARD_NOTE */
const AC_CH_SYSTEM = 'system';
const AC_CH_FORWARD_NOTE = 'forward_note';
/** LeadBoardView.AC_CH_COLS */
const AC_CH_COLS = ['note', 'line', 'fb', 'whatsapp', 'email', 'sms', 'call', 'visit'];
/** channel counters: key of the backend → key of the table (ContactActivityApiService.CHANNEL_KEYS) */
const CHANNEL_KEYS: [string, string][] = [['note', 'note'], ['line', 'line'], ['facebook', 'fb'], ['whatsapp', 'whatsapp'], ['email', 'email'], ['sms', 'sms'], ['call', 'call'], ['visit', 'visit']];

/** LeadBoardView.acIsForwardNote */
export const isForwardNote = (ch: string): boolean => normalizeKey(ch) === normalizeKey(AC_CH_FORWARD_NOTE);
/** LeadBoardView.acIsContactChannel: a real way of contacting (not the system events of the workflow, not the forward note) */
export const isContactChannel = (ch: string): boolean => {
  const key = normalizeKey(ch);
  return key !== '' && key !== normalizeKey(AC_CH_SYSTEM) && !isForwardNote(ch);
};
/** LeadBoardView.acChannelKey: channel → column of the table */
export function channelKey(ch: string | null | undefined): string {
  const c = (ch ?? '').toUpperCase();
  if (c.includes('LINE') || c.includes('ไลน์')) return 'line';
  if (c.includes('WHATSAPP')) return 'whatsapp';
  if (c.includes('FACEBOOK') || c === 'FB' || c.includes('เฟซ')) return 'fb';
  if (c.includes('MAIL') || c.includes('อีเมล')) return 'email';
  if (c.includes('SMS')) return 'sms';
  if (c.includes('CALL') || c.includes('PHONE') || c.includes('โทร')) return 'call';
  if (c.includes('VISIT') || c.includes('เยี่ยม')) return 'visit';
  return 'note';
}
/** LeadBoardView.acIso2Thai: yyyy-mm-dd[…] → dd/mm/yyyy */
export function isoToThai(iso: string | null | undefined): string {
  if (iso == null || iso === '') return '';
  const s = javaSplit(javaSplit(iso, 'T')[0], ' ')[0];
  const p = javaSplit(s, '-');
  return p.length === 3 ? `${p[2]}/${p[1]}/${p[0]}` : iso;
}
/** LeadBoardView.acBadgeStatus: leadStatus (+ activeStatus when ACTIVE) → the badge */
export function badgeStatus(it: JObj): string {
  let st = optString(it, 'leadStatus', '').toUpperCase();
  if (st === 'ACTIVE') st = optString(it, 'activeStatus', '').toUpperCase();
  return st === '' ? 'NEW' : st;
}
/** LeadBoardView.acMapSummary: statusSummary of the backend → summary of the page */
export function mapSummary(ss: unknown): Obj {
  const s = objOf(ss) ?? {};
  // `active` is { total, hot, warm, cold }; the new service may send it as the plain count with hot / warm / cold next to it
  const act = objOf(s['active']) ?? s;
  return {
    total: optInt(s, 'total', 0),
    new: optInt(s, 'new', 0),
    // the new service names the closed ones `closeSuccess` / `closeLoss`
    success: optInt(s, 'success', optInt(s, 'closeSuccess', 0)),
    lost: optInt(s, 'lost', optInt(s, 'closeLoss', 0)),
    inactive: optInt(s, 'inactive', 0),
    active: objOf(s['active']) ? optInt(act, 'total', 0) : optInt(s, 'active', 0),
    active_high: optInt(act, 'hot', 0),
    active_medium: optInt(act, 'warm', 0),
    active_low: optInt(act, 'cold', 0),
  };
}
/** LeadBoardView.acEmptyListJson: every key of the summary is present (the page prints them) */
export const emptyListJson = (): Obj => ({ summary: mapSummary(null), rows: [], wfStepSummary: [], usesWorkflowStep: false });

/** LeadBoardView.acHm: HH:mm:ss → HH:mm */
function hm(t: string): string {
  if (!t) return '';
  const p = javaSplit(t, ':');
  return p.length >= 2 ? `${p[0]}:${p[1]}` : t;
}
/** LeadBoardView.acFmtDateTime: ISO → "dd/mm/yyyy hh:mm AM" */
export function fmtDateTime(iso: string | null | undefined): string {
  if (iso == null || iso === '') return '';
  const dpart = javaSplit(javaSplit(iso, 'T')[0], ' ')[0];
  let tpart = '';
  if (iso.includes('T')) tpart = iso.substring(iso.indexOf('T') + 1);
  else if (iso.includes(' ')) tpart = iso.substring(iso.indexOf(' ') + 1);
  let out = isoToThai(dpart);
  if (tpart !== '') {
    const t = javaSplit(tpart, ':');
    // Integer.parseInt(t[0]) — a NumberFormatException / an empty array are swallowed by the Java code (the time is left out)
    const h = t.length > 0 ? javaParseInt(t[0]) : undefined;
    if (h !== undefined) {
      const m = t.length > 1 ? t[1] : '00';
      let h12 = h % 12;
      if (h12 === 0) h12 = 12;
      out += ` ${h12 < 10 ? '0' : ''}${h12}:${m} ${h < 12 ? 'AM' : 'PM'}`;
    }
  }
  return out;
}
/** LeadBoardView.acHistIcon: channel / type → icon of the history panel */
function histIcon(ch: string, type: string): string {
  if (!isContactChannel(ch)) {
    const t = javaTrim(type ?? '').toLowerCase();
    if (t === 'forward' || t === 'return') return t;
    if (isForwardNote(ch)) return 'forward';
    return AC_CH_SYSTEM;
  }
  const key = channelKey(ch);
  return key === '' ? 'note' : key;
}

/** LeadBoardView.acSortByChangeDateDesc: newest first (the order of `contactHistoryList` of /leads/{id}); what is not an object is dropped */
export function sortByChangeDateDesc(arr: readonly unknown[] | null | undefined): JObj[] {
  const list = (arr ?? []).filter(isObj);
  return list.slice().sort((a, b) => cmp(optString(b, 'changeDate', ''), optString(a, 'changeDate', '')));
}

/**
 * LeadBoardView.acBuildHistoryGroups: the entries → history[] of the right panel
 * `[{ group, category, procedureGroupId, items:[{ text, time, by, icon }] }]` in the order the entries come
 * @param wfsFilter  > 0 = only that procedureGroupId ; 0 = every group
 * @param txNoFilter not empty = only the entry whose contactTxNo matches (wins over wfsFilter)
 */
export function buildHistoryGroups(entries: readonly unknown[] | null | undefined, wfsFilter: number, txNoFilter: string): Obj[] {
  const hist: Obj[] = [];
  if (!entries) return hist;
  const txNo = txNoFilter ?? '';
  const hmap = new Map<string, Obj>();
  for (const c of entries) {
    if (!isObj(c)) continue;
    if (txNo !== '') {
      if (txNo !== optString(c, 'contactTxNo', '')) continue;
    } else if (wfsFilter > 0 && optId(c, 'procedureGroupId') !== wfsFilter) continue;
    let g = optString(c, 'procedureGroupName', '');
    if (g === '') g = optString(c, 'procedureName', '');
    if (g === '') g = AC_GROUP_FALLBACK;
    const cat = optString(c, 'procedureName', '');
    const key = `${g}|${cat}`;
    const emp = objOf(c['salePerson']) ?? objOf(c['employee']);
    const by = emp == null ? '' : javaTrim(`${optString(emp, 'code', '')} ${optString(emp, 'name', '')}`);
    const item = { text: optString(c, 'content', ''), time: fmtDateTime(optString(c, 'changeDate', '')), by, icon: histIcon(optString(c, 'channel', ''), optString(c, 'type', '')) };
    let h = hmap.get(key);
    if (!h) {
      h = { group: g, category: cat, procedureGroupId: optId(c, 'procedureGroupId'), items: [] };
      hmap.set(key, h);
      hist.push(h);
    }
    h['items'].push(item);
  }
  return hist;
}

/* ------------------------------------------------------------------ contact history of a lead */

const HIST_BRANCH = ['groups', 'steps', 'procedures'];
const HIST_LEAF = ['items', 'contactHistoryList', 'list'];

/** LeadBoardView.acCollectHistoryItems: groups[].steps[].items[] / groups[].items[] / items[] → the flat list of contacts */
function collectHistoryItems(node: unknown, out: JObj[], depth: number): void {
  if (!isObj(node) || depth > 4) return;
  let descended = false;
  for (const branch of HIST_BRANCH) {
    const arr = arrOf(node[branch]);
    if (!arr || arr.length === 0) continue;
    descended = true;
    for (const child of arr) collectHistoryItems(child, out, depth + 1);
  }
  if (descended) return;
  for (const leaf of HIST_LEAF) {
    const arr = arrOf(node[leaf]);
    if (arr) for (const it of arr) if (isObj(it)) out.push(it);
  }
}

/** LeadBoardView.fetchContactHistoryArr: `GET /leads/{id}/contact-history` → the flat list ([] when anything fails) — `sendGET`: only a 200 body counts */
export async function fetchContactHistoryArr(rest: ActivitiesRest, leadId: string | null | undefined): Promise<unknown[]> {
  try {
    if (leadId == null || javaTrim(leadId) === '') return [];
    const r = await rest.contactHistory(javaTrim(leadId));
    const text = r.status === 200 ? r.body : '';
    if (!javaTrim(text).startsWith('{')) return [];
    const obj = parseJson(text);
    if (!isObj(obj)) return [];
    if (optInt(obj, 'status', 0) === 200 && has(obj, 'result') && obj['result'] !== null) {
      const res = obj['result'];
      if (isArr(res)) return res; // the old shape: a flat array
      if (isObj(res)) {
        const flat: JObj[] = [];
        collectHistoryItems(res, flat, 0); // the new shape: { groups[].steps[].items[] }
        return flat;
      }
    }
  } catch {
    /* a lead whose history cannot be read has no history */
  }
  return [];
}

/* ------------------------------------------------------------------ the list (ContactActivityApiService) */

/** ContactActivityApiService.DEFAULT_PER_PAGE / MAX_PER_PAGE and LeadBoardView.acMaxRows() default */
export const DEFAULT_PER_PAGE = 20;
const MAX_PER_PAGE = 200;
const MAX_ROWS = 1000;

export interface ListQuery {
  /** the tab: `lead` (the list of the page) or `group` (asked when the tab "by step group" is opened) */
  groupBy?: 'lead' | 'group';
  movementTypeId?: string;
  saleGroupId?: string;
  employeeName?: string;
  /** the search box → contactName of the backend */
  search?: string;
  /** date_desc | date_asc | name_asc | name_desc */
  sortBy?: string;
  activeStatus?: string;
  lastContactFrom?: string;
  lastContactTo?: string;
  assignDateFrom?: string;
  assignDateTo?: string;
  showClosed?: string;
  page: number;
  perPage: number;
}

/** ContactActivityApiService.apiSortBy */
function apiSortBy(uiSort: string | undefined): string | undefined {
  switch (javaTrim(uiSort ?? '')) {
    case 'date_desc': return 'lastContactDate_desc';
    case 'date_asc': return 'lastContactDate_asc';
    case 'name_asc': return 'prospectName_asc';
    case 'name_desc': return 'prospectName_desc';
    default: return undefined;
  }
}

/** the keys of `ContactActivitiesQuery` in the order `ContactActivityApiService.fetchPage` appended them to the URL */
export const CONTACT_ACTIVITIES_PARAMS: (keyof ContactActivitiesQuery)[] = [
  'groupBy', 'movementTypeId', 'leadId', 'saleGroupId', 'employeeName', 'contactName', 'activeStatus', 'lastContactFrom', 'lastContactTo', 'assignDateFrom', 'assignDateTo', 'showClosed', 'sortBy', 'pageSize', 'pageNo',
];

interface PageSet {
  result: JObj;
  items: JObj[];
  error?: string;
  hasMore: boolean;
  total: number;
  totalPages: number;
}

/** ContactActivityApiService.errorMessage: error.message first, then message */
function errorMessage(obj: JObj): string {
  const err = objOf(obj['error']);
  if (err) {
    const m = optString(err, 'message', '');
    if (javaTrim(m) !== '') return javaTrim(m);
  }
  const m = optString(obj, 'message', '');
  return javaTrim(m) === '' ? 'โหลดข้อมูลการติดต่อไม่สำเร็จ' : javaTrim(m);
}

/** ContactActivityApiService.fetchOnePage + fetchPage + addItems */
async function fetchOnePage(rest: ActivitiesRest, base: ContactActivitiesQuery, page: number): Promise<PageSet> {
  const out: PageSet = { result: {}, items: [], hasMore: false, total: 0, totalPages: 1 };
  const r = await rest.contactActivities({ ...base, pageNo: page <= 1 ? undefined : page - 1 });
  // Data_API.sendGET: the body of an HTTP 200, "" for anything else
  const response = r.status === 200 ? r.body : '';
  if (!javaTrim(response).startsWith('{')) {
    out.error = 'ไม่ได้รับข้อมูลจาก API การติดต่อ';
    return out;
  }
  const obj = parseJson(response);
  // `new JSONObject(response)` throws on a body that starts with "{" but is not JSON: the caller turns it into emptyJson(message)
  if (!isObj(obj)) throw new Error('org.primefaces.shaded.json.JSONException: the answer of /contact-activities is not valid JSON');
  if (rest.singleView) return pageOf(summaryEnvelope(obj), page, out);
  return pageOf(obj, page, out);
}

const SUMMARY_ITEM_KEYS = ['items', 'data', 'content', 'rows', 'list', 'opportunities', 'summaries'];

/**
 * The answer of `GET /contact-activity-summaries` as the envelope the old list had (`{ status: 200, result: { items, meta, statusSummary … } }`). The new service may not write `status`
 * in the body (an HTTP 200 is the success), may put `meta` / `summary` next to `result`, and may call the rows something else (`SUMMARY_ITEM_KEYS`); a failure (`error`) goes on as it is,
 * and an answer whose rows cannot be found says what it had instead of showing its `message` ("success") as the reason.
 */
function summaryEnvelope(obj: JObj): JObj {
  if (objOf(obj['error'])) return obj;
  const raw = obj['result'] ?? obj['data'] ?? obj;
  const result: JObj | null = Array.isArray(raw) ? { items: raw } : objOf(raw) ? { ...(raw as JObj) } : null;
  const key = result ? (Array.isArray(result['items']) ? 'items' : SUMMARY_ITEM_KEYS.find((k) => Array.isArray(result[k]))) : undefined;
  if (!result || !key) return { status: 502, message: `ไม่พบรายการในคำตอบของ contact-activity-summaries (มี: ${Object.keys(objOf(raw) ?? obj).join(', ')})` };
  // the fields of an item are named as the new service names them (`activity.name` …): `summaryItemOf` gives the names of the old list
  result['items'] = (result[key] as unknown[]).map(summaryItemOf);
  if (result['meta'] === undefined && objOf(obj['meta'])) result['meta'] = obj['meta'];
  // the strip of statuses: `meta.summary` (next to `result`, or inside it), else the summaries the old list had
  const metaOf = (o: JObj): JObj | null => objOf(o['meta']);
  result['statusSummary'] = metaOf(obj)?.['summary'] ?? metaOf(result)?.['summary'] ?? result['statusSummary'] ?? result['summary'] ?? obj['summary'];
  return { status: 200, result };
}

/** the rows of one answer (the envelope of the old list) as a `PageSet` */
function pageOf(obj: JObj, page: number, out: PageSet): PageSet {
  if (optInt(obj, 'status', 0) !== 200) {
    out.error = errorMessage(obj);
    return out;
  }
  const result = objOf(obj['result']);
  if (!result) {
    out.error = errorMessage(obj);
    return out;
  }
  out.result = result;
  const items = arrOf(result['items']) ?? [];
  const meta = objOf(result['meta']);
  out.totalPages = meta ? Math.max(1, optInt(meta, 'totalPages', 1)) : 1;
  out.total = meta ? optLong(meta, 'total', items.length) : items.length;
  out.hasMore = page < out.totalPages;
  // addItems: the same lead + workflow step + group once
  const seen = new Set<string>();
  for (let i = 0; i < items.length && out.items.length < MAX_ROWS; i++) {
    const it = items[i];
    if (!isObj(it)) continue;
    const key = `${optId(it, 'leadId')}|${optLong(it, 'wfsId', 0)}|${optId(it, 'procedureGroupId')}`;
    if (!seen.has(key)) {
      seen.add(key);
      out.items.push(it);
    }
  }
  return out;
}

/** ContactActivityApiService.groupNameByLead: leadId → the first workflow group name of the groupBy=group answer */
function groupNameByLead(groupItems: JObj[]): Map<string, string> {
  const map = new Map<string, string>();
  for (const it of groupItems ?? []) {
    const name = optString(it, 'procedureGroupName', '');
    if (javaTrim(name) === '') continue;
    const k = String(optId(it, 'leadId'));
    if (!map.has(k)) map.set(k, javaTrim(name));
  }
  return map;
}

interface ChildrenResult {
  map: Map<string, JObj[]> | null;
  fromHistory: Set<string>;
  history: Map<string, unknown[]>;
}

/** ContactActivityApiService.childrenFromHistory: contact history → the child rows (one per group, counts per channel) */
function childrenFromHistory(hist: readonly unknown[]): JObj[] {
  const out: JObj[] = [];
  if (!hist || hist.length === 0) return out;
  const byGroup = new Map<string, JObj>();
  const latestIso = new Map<string, string>();
  for (const c of hist) {
    if (!isObj(c)) continue;
    let group = optString(c, 'procedureGroupName', '');
    if (group === '') group = optString(c, 'procedureName', '');
    if (group === '') group = AC_GROUP_FALLBACK;
    let acc = byGroup.get(group);
    if (!acc) {
      acc = { procedureGroupName: group, procedureGroupId: optId(c, 'procedureGroupId') };
      for (const [k] of CHANNEL_KEYS) acc[k] = 0;
      byGroup.set(group, acc);
    }
    // the system events of the workflow and the forward note are not contacts
    const chRaw = optString(c, 'channel', optString(c, 'type', ''));
    if (!isContactChannel(chRaw)) continue;
    const tableKey = channelKey(chRaw);
    const key = CHANNEL_KEYS.find((p) => p[1] === tableKey)?.[0] ?? tableKey;
    acc[key] = optInt(acc, key, 0) + 1;
    const iso = optString(c, 'changeDate', '');
    const prev = latestIso.get(group);
    if (prev == null || cmp(iso, prev) > 0) latestIso.set(group, iso);
  }
  for (const [g, acc] of byGroup) {
    const iso = latestIso.get(g);
    if (iso != null && iso !== '') acc['lastContactDate'] = iso;
    out.push(acc);
  }
  return out;
}

/** ContactActivityApiService.childrenByLead (+ fetchHistoryOfMultiGroup + topUpFromHistory; `activity.list.group.topup` is true in config.properties) */
async function childrenByLead(rest: ActivitiesRest, leadItems: JObj[], group: PageSet): Promise<ChildrenResult> {
  const multi = leadItems.some((it) => optInt(it, 'groupCount', 1) > 1);
  if (!multi) return { map: null, fromHistory: new Set(), history: new Map() };
  const map = new Map<string, JObj[]>();
  if (!group.error) {
    for (const it of group.items) {
      const k = String(optId(it, 'leadId'));
      const list = map.get(k) ?? [];
      list.push(it);
      map.set(k, list);
    }
  }
  // contact-history of every lead with groupCount > 1 (once), in parallel
  const ids = [...new Set(leadItems.filter((it) => optInt(it, 'groupCount', 1) > 1).map((it) => String(optId(it, 'leadId'))))];
  const histories = await Promise.all(ids.map((id) => fetchContactHistoryArr(rest, id)));
  const history = new Map<string, unknown[]>();
  ids.forEach((id, i) => {
    if (histories[i].length > 0) history.set(id, histories[i]);
  });
  // topUpFromHistory: a lead whose groupBy=group rows are fewer than its groupCount gets the rows built from its history
  const filled = new Set<string>();
  for (const it of leadItems) {
    const want = optInt(it, 'groupCount', 1);
    if (want <= 1) continue;
    const leadId = String(optId(it, 'leadId'));
    const haveSize = map.get(leadId)?.length ?? 0;
    if (haveSize >= want) continue;
    const hist = history.get(leadId);
    if (!hist) continue;
    const built = childrenFromHistory(hist);
    if (built.length > haveSize) {
      map.set(leadId, built);
      filled.add(leadId);
    }
  }
  return { map: map.size === 0 ? null : map, fromHistory: filled, history };
}

/** the children of an item of `include=CHILDREN` as items of their own (the lead of the parent when a child does not say it) */
function childItemsOf(item: JObj): JObj[] {
  const kids = arrOf(item['children']) ?? [];
  return kids.filter(isObj).map((kid) => ({ leadId: item['leadId'], ...kid }));
}

/** the children map the rows are built from, taken from the items themselves (no contact history is read to fill them up) */
function childrenFromItems(childItems: JObj[]): ChildrenResult {
  const map = new Map<string, JObj[]>();
  for (const kid of childItems) {
    const key = String(optId(kid, 'leadId'));
    map.set(key, [...(map.get(key) ?? []), kid]);
  }
  return { map: map.size === 0 ? null : map, fromHistory: new Set(), history: new Map() };
}

/** ContactActivityApiService.putChannels */
function putChannels(target: Obj, src: JObj): void {
  for (const [k, tk] of CHANNEL_KEYS) target[tk] = optInt(src, k, 0);
}

/** ContactActivityApiService.stepGroupOf: the workflow group name of the parent row */
function stepGroupOf(it: JObj, leadId: string, groupNames: Map<string, string>): string {
  const name = optString(it, 'procedureGroupName', '');
  if (javaTrim(name) !== '') return javaTrim(name);
  const fromGroup = groupNames.get(leadId);
  if (fromGroup != null && javaTrim(fromGroup) !== '') return javaTrim(fromGroup);
  return javaTrim(optString(it, 'procedureName', ''));
}

/** ContactActivityApiService.buildChildren */
function buildChildren(leadItem: JObj, leadId: string, childrenMap: Map<string, JObj[]> | null, contactDate: string, assignDate: string, agentCode: string, agentName: string, agentAvatar: string, custName: string, custAvatar: string): Obj[] {
  const src = childrenMap?.get(leadId) ?? [leadItem];
  return src.map((c) => {
    let group = optString(c, 'procedureGroupName', '');
    if (group === '') group = optString(c, 'procedureName', '');
    if (group === '') group = AC_GROUP_FALLBACK;
    const cr: Obj = {};
    const cDate = isoToThai(optString(c, 'lastContactDate', ''));
    cr['date'] = cDate === '' ? contactDate : cDate;
    cr['agent_code'] = optString(c, 'contactCode', agentCode);
    if (c['contactId'] !== undefined) cr['agent_id'] = optId(c, 'contactId');
    cr['agent_name'] = optString(c, 'contactName', agentName);
    cr['agent_avatar'] = agentAvatar;
    cr['customer_name'] = custName;
    cr['customer_avatar'] = custAvatar;
    cr['group'] = group;
    cr['procedureGroupId'] = optId(c, 'procedureGroupId');
    // the child's own assignment and status when it has them (the new service writes them on every child), else the parent's
    const cAssign = isoToThai(optString(c, 'assignDate', ''));
    cr['due_date'] = cAssign === '' ? assignDate : cAssign;
    if (optString(c, 'leadStatus', '') !== '') cr['interest'] = badgeStatus(c);
    putChannels(cr, c);
    return cr;
  });
}

/** ContactActivityApiService.maxChannelsWithChildren: the parent shows max(backend, sum of the children) per channel */
function maxChannelsWithChildren(row: Obj, childRows: Obj[]): void {
  for (const [, tableKey] of CHANNEL_KEYS) {
    let sum = 0;
    for (const c of childRows) sum += optInt(c, tableKey, 0);
    row[tableKey] = Math.max(optInt(row, tableKey, 0), sum);
  }
}

/** ContactActivityApiService.mapRow: 1 item of the API → 1 row of the table */
function mapRow(it: JObj, movementTypeId: number, children: ChildrenResult, groupNames: Map<string, string>): Obj {
  const leadId = String(optId(it, 'leadId'));
  const agentCode = optString(it, 'contactCode', '');
  const agentName = optString(it, 'contactName', '');
  const custName = optString(it, 'prospectName', '');
  const custAvatar = collapseAttachUrl(optString(it, 'prospectAvatar', ''));
  const agentAvatar = collapseAttachUrl(optString(it, 'contactAvatar', ''));
  const contactDate = isoToThai(optString(it, 'lastContactDate', ''));
  const assignDate = isoToThai(optString(it, 'assignDate', ''));

  const row: Obj = {};
  row['id'] = optId(it, 'leadId');
  row['date'] = contactDate;
  row['agent_code'] = agentCode;
  row['agent_id'] = optId(it, 'contactId'); // the employee the panel saves a contact under (createById): the list is the only place it is told
  row['agent_name'] = agentName;
  row['agent_avatar'] = agentAvatar;
  row['customer_name'] = custName;
  row['customer_avatar'] = custAvatar;
  row['group'] = optString(it, 'leadDemand', ''); // "ความต้องการ"
  row['step_group'] = stepGroupOf(it, leadId, groupNames);
  row['current_step'] = optString(it, 'procedureName', '');
  row['due_date'] = assignDate;
  row['assign_date'] = assignDate;
  row['contact_date'] = contactDate;
  row['appointment_date'] = isoToThai(optString(it, 'lastAppointmentDate', ''));
  row['interest'] = badgeStatus(it);
  row['tags'] = arrOf(it['tags']) ?? [];
  row['activeStatus'] = optString(it, 'activeStatus', '');
  row['leadStatus'] = optString(it, 'leadStatus', '');
  row['movementTypeId'] = movementTypeId;
  row['procedureGroupId'] = optId(it, 'procedureGroupId');
  row['groupCount'] = optInt(it, 'groupCount', 1);
  row['procedureId'] = optId(it, 'procedureId');
  row['prospectId'] = optId(it, 'prospectId');
  row['prospect_code'] = optString(it, 'prospectCode', '');
  row['prospect_tel'] = optString(it, 'prospectTel', '');
  row['tx_no'] = optString(it, 'txNo', '');
  putChannels(row, it);

  const childrenMap = children.map;
  const childRows = buildChildren(it, leadId, childrenMap, contactDate, assignDate, agentCode, agentName, agentAvatar, custName, custAvatar);
  // a child that names no employee of its own saves under the one of the row (same as its name / code, which fall back to the row's)
  for (const c of childRows) if (c['agent_id'] === undefined) c['agent_id'] = row['agent_id'];
  row['children'] = childRows;

  const hasChildrenRows = !!childrenMap && childrenMap.has(leadId);
  if (hasChildrenRows || children.fromHistory.has(leadId)) maxChannelsWithChildren(row, childRows);

  const rawHist = children.history.get(leadId);
  if (rawHist && rawHist.length > 0) {
    const groups = buildHistoryGroups(sortByChangeDateDesc(rawHist), 0, '');
    if (groups.length > 0) row['history'] = groups;
  }
  return row;
}

/** ContactActivityApiService.emptyJson: an empty answer that says why (the page prints it instead of "no data") */
const emptyJson = (error: string | undefined, workflow = false): Obj => {
  const out = emptyListJson();
  if (workflow) {
    out['usesWorkflowStep'] = true;
    out['noWfStep'] = true;
  }
  if (error != null && javaTrim(error) !== '') out['error'] = javaTrim(error);
  return out;
};

/**
 * `GET /board/activity-list` — ContactActivityApiService.fetchActivityListJson(viewMode, query):
 * `{ summary, usesWorkflowStep, wfStepSummary, rows[], meta:{page,perPage,total,totalPages,hasMore}, rowCount, totalRows, maxRows }`;
 * `{ …the empty list, error }` when the backend could not be read.
 */
export async function fetchActivityList(rest: ActivitiesRest, query: ListQuery): Promise<Obj> {
  try {
    const q = query;
    const mt = trimToNull(q.movementTypeId);
    const page = Math.max(1, q.page);
    const perPage = Math.min(Math.max(1, q.perPage), MAX_PER_PAGE);
    const base: ContactActivitiesQuery = {
      groupBy: 'lead',
      movementTypeId: mt,
      saleGroupId: trimToNull(q.saleGroupId),
      employeeName: trimToNull(q.employeeName),
      contactName: trimToNull(q.search),
      activeStatus: trimToNull(q.activeStatus),
      lastContactFrom: trimToNull(q.lastContactFrom),
      lastContactTo: trimToNull(q.lastContactTo),
      assignDateFrom: trimToNull(q.assignDateFrom),
      assignDateTo: trimToNull(q.assignDateTo),
      showClosed: trimToNull(q.showClosed),
      sortBy: apiSortBy(q.sortBy),
      pageSize: perPage,
    };
    // the two views are asked at the same time (neither needs the answer of the other); Java read the lead answer first, then the group one
    let lead: PageSet;
    let group: PageSet;
    let children: ChildrenResult;
    if (rest.singleView) {
      const byGroup = q.groupBy === 'group';
      lead = await fetchOnePage(rest, { ...base, groupBy: byGroup ? 'group' : 'lead' }, page);
      if (lead.error) return emptyJson(lead.error, true);
      // the step-group view: every item is a row of its own (no children to open); the list: the children are the rows of the second tab, taken from the items
      group = { ...lead, items: byGroup ? [] : lead.items.flatMap(childItemsOf) };
      children = childrenFromItems(group.items);
    } else {
      const [leadTask, groupTask] = await Promise.allSettled([fetchOnePage(rest, { ...base, groupBy: 'lead' }, page), fetchOnePage(rest, { ...base, groupBy: 'group' }, page)]);
      if (leadTask.status === 'rejected') throw leadTask.reason;
      lead = leadTask.value;
      if (lead.error) return emptyJson(lead.error);
      if (groupTask.status === 'rejected') throw groupTask.reason;
      group = groupTask.value;
      children = await childrenByLead(rest, lead.items, group);
    }
    const result = lead.result;
    const out: Obj = {};
    out['summary'] = mapSummary(result['statusSummary']);
    // the list of the new service always has the two tabs (the step group is asked when its tab is opened), so the page is the one with a workflow
    out['usesWorkflowStep'] = rest.singleView ? true : optBool(result, 'usesWorkflowStep', false);
    // no workflow step in this list: the view by tag (🏷) is off, the two tabs stay
    if (rest.singleView) out['noWfStep'] = true;
    out['wfStepSummary'] = arrOf(result['wfStepSummary']) ?? [];
    const movementTypeId = optLong(result, 'movementTypeId', 0);
    const groupNames = groupNameByLead(group.items);
    const rows = lead.items.map((it) => mapRow(it, movementTypeId, children, groupNames));
    out['rows'] = rows;
    out['meta'] = { page, perPage, total: lead.total, totalPages: lead.totalPages, hasMore: lead.hasMore };
    out['rowCount'] = rows.length;
    out['totalRows'] = lead.total;
    out['maxRows'] = MAX_ROWS;
    return out;
  } catch (e) {
    return emptyJson((e as Error)?.message);
  }
}

/* ------------------------------------------------------------------ the detail panel (LeadBoardView.fetchActivityDetailResult) */

/** LeadBoardView.opportunityErrorJson as an object: the error body the page reads (`error.message`) */
export const opportunityErrorJson = (status: number, message: string): Obj => ({ status, message: message ?? '', error: { code: status, message: message ?? '' } });

export interface DetailArgs {
  leadId: string;
  /** > 0: only the history of that workflow group */
  wfsId: number;
  /** not empty: only that contact */
  txNo: string;
  /** every group of the lead (a click on the parent row) */
  allGroups: boolean;
  /** attached to GET /leads/{id} (a lead with several groups working needs it) ; 0 = not attached */
  activityGroupId: number;
}

/**
 * `GET /board/activity-detail` — the mapping of `GET /leads/{id}` for the right panel:
 * `{ customer_name, customer_avatar, location, interest, phone, …, history[], events[], appointments[], tasks[] }`.
 * Anything else than a success is the status and the body of the backend (`error.message` is what the page shows in its popup).
 * @returns the status and the body TEXT (`Data_API.PostResult`)
 */
export async function fetchActivityDetail(rest: ActivitiesRest, a: DetailArgs, errDefaultMsg: string): Promise<{ status: number; body: string }> {
  try {
    const agid = a.activityGroupId > 0 ? String(a.activityGroupId) : undefined;
    let lr = await rest.leadById(a.leadId, agid);
    // the group that was attached is not usable: try without it, as before
    if (unwrapLeadResult(lr) === null && agid) {
      const lr2 = await rest.leadById(a.leadId, undefined);
      if (unwrapLeadResult(lr2) !== null) lr = lr2;
    }
    const dJson = unwrapLeadResult(lr);
    if (dJson === null) return opportunityErrorResult(lr, errDefaultMsg);
    const d = parseJson(dJson);
    if (!isObj(d)) throw new Error('org.primefaces.shaded.json.JSONException: the lead is not a JSONObject');
    const pr = objOf(d['prospect']) ?? {};
    const pi = objOf(d['prospectInfo']) ?? {};
    const sp = objOf(d['salePerson']) ?? {};
    const sg = objOf(d['saleGroup']) ?? {};

    const out: Obj = {};
    const nm = javaTrim(optString(pr, 'name', optString(pi, 'fullName', '')));
    out['customer_name'] = nm;
    out['customer_avatar'] = collapseAttachUrl(optString(pr, 'attachFile', ''));
    const dist = optString(pr, 'currentDistrictName', '');
    const city = optString(pr, 'currentCityName', '');
    out['location'] = dist === '' ? city : city === '' ? dist : `${dist}, ${city}`;
    let st = optString(d, 'leadStatus', '').toUpperCase();
    if (st === 'ACTIVE') st = optString(d, 'activeStatus', '').toUpperCase();
    out['interest'] = st === '' ? 'NEW' : st;
    let phone = optString(pr, 'customerTel', '');
    if (phone === '') {
      const ci = objOf(pi['contactInfo']);
      if (ci) phone = optString(ci, 'mobile1', '');
    }
    out['phone'] = phone;
    out['phoneCountryCode'] = optString(pr, 'phoneCountryCode', '');
    out['countryCode'] = optString(pr, 'countryCode', '');
    out['first_contact'] = isoToThai(optString(d, 'contactDate', optString(pi, 'firstContactDate', '')));
    out['team'] = optString(sg, 'name', '');
    out['owner'] = javaTrim(`${optString(sp, 'code', '')} ${optString(sp, 'name', '')}`);
    out['sale_person_name'] = javaTrim(optString(sp, 'name', ''));
    out['due_date'] = isoToThai(optString(d, 'contactDate', ''));
    const cs = objOf(d['currentStep']);
    const currentGroupId = cs ? optInt(cs, 'procedureGroupId', 0) : 0;
    out['procedureGroupId'] = currentGroupId;
    out['movement_type_name'] = cs ? optString(cs, 'procedureGroupName', '') : '';
    out['current_step'] = cs ? optString(cs, 'procedureName', '') : '';
    const empObj = objOf(d['employee']);
    const employeeId = empObj ? optLong(empObj, 'id', 0) : 0;
    const salePersonId = optLong(sp, 'id', 0);
    out['employeeId'] = employeeId;
    out['salePersonId'] = salePersonId;
    out['createById'] = employeeId > 0 ? employeeId : salePersonId;
    out['employeeName'] = empObj ? javaTrim(`${optString(empObj, 'code', '')} ${optString(empObj, 'name', '')}`) : '';
    out['employeeCode'] = empObj ? optString(empObj, 'code', '') : '';
    out['employeeNameOnly'] = empObj ? optString(empObj, 'name', '') : '';
    out['salePersonName'] = optString(out, 'owner', '');
    out['wfsId'] = a.wfsId;
    const effectiveWfsId = a.wfsId > 0 ? a.wfsId : a.allGroups ? 0 : currentGroupId;
    const txNoFilter = javaTrim(a.txNo ?? '');

    const chl = arrOf(d['contactHistoryList']);
    out['history'] = buildHistoryGroups(chl, effectiveWfsId, txNoFilter);

    // events: one row per workflow group (counts per channel), for the child rows of the table
    const events: Obj[] = [];
    if (chl) {
      const egrp = new Map<string, Record<string, number>>();
      const egrpDate = new Map<string, string>();
      const egrpId = new Map<string, number>();
      for (const c of chl) {
        if (!isObj(c)) continue;
        let g = optString(c, 'procedureGroupName', '');
        if (g === '') g = optString(c, 'procedureName', '');
        if (g === '') g = AC_GROUP_FALLBACK;
        if (!egrp.has(g)) egrp.set(g, Object.fromEntries(AC_CH_COLS.map((cc) => [cc, 0])));
        const iso = optString(c, 'changeDate', '');
        const prevDate = egrpDate.get(g);
        if (prevDate == null || cmp(iso, prevDate) > 0) egrpDate.set(g, iso);
        const pgId = optLong(c, 'procedureGroupId', 0);
        if (pgId > 0 && !egrpId.has(g)) egrpId.set(g, pgId);
        const chRaw = optString(c, 'channel', optString(c, 'type', ''));
        if (!isContactChannel(chRaw)) continue;
        const k = channelKey(chRaw);
        egrp.get(g)![k] = (egrp.get(g)![k] ?? 0) + 1;
      }
      for (const [g, counts] of egrp) {
        const gDateIso = egrpDate.get(g);
        const evDate = gDateIso == null || gDateIso === '' ? '' : isoToThai(gDateIso);
        const ev: Obj = {
          date: evDate,
          agent_code: optString(sp, 'code', ''),
          agent_name: optString(sp, 'name', ''),
          agent_avatar: '',
          customer_name: nm,
          customer_avatar: optString(out, 'customer_avatar', ''),
          group: g,
          procedureGroupId: egrpId.get(g) ?? 0,
        };
        for (const cc of AC_CH_COLS) ev[cc] = counts[cc];
        ev['due_date'] = evDate;
        events.push(ev);
      }
    }
    out['events'] = events;

    // appointments and tasks (as the right panel shows them: no id / status for the appointments)
    const appts: Obj[] = [];
    for (const a2 of arrOf(d['appointmentList']) ?? []) {
      if (!isObj(a2)) continue;
      appts.push({ title: optString(a2, 'subject', ''), date: isoToThai(optString(a2, 'date', '')), time: hm(optString(a2, 'time', '')), group: optString(a2, 'procedureGroupName', ''), step: optString(a2, 'procedureName', '') });
    }
    out['appointments'] = appts;
    const tasks: Obj[] = [];
    for (const t of arrOf(d['taskList']) ?? []) {
      if (!isObj(t)) continue;
      const allDay = optBool(t, 'allDay', false);
      const tl2 = hm(optString(t, 'time', ''));
      tasks.push({
        id: optLong(t, 'id', 0),
        completed: optBool(t, 'completed', false),
        date: isoToThai(optString(t, 'date', '')),
        time_label: allDay ? 'ทั้งวัน' : tl2 === '' ? 'ทั้งวัน' : tl2,
        title: optString(t, 'subject', ''),
        detail: optString(t, 'description', ''),
        group: optString(t, 'procedureGroupName', ''),
        step: optString(t, 'procedureName', ''),
      });
    }
    out['tasks'] = tasks;
    return { status: 200, body: JSON.stringify(out) };
  } catch {
    return { status: 500, body: leadErrorText(500, errDefaultMsg) };
  }
}
