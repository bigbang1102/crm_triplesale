/**
 * The customer list of the Java board, answered in the browser: `ProspectListService` (the list of `GET /prospects`, the per-row detail of
 * `GET /prospects/{id}/quick-view`, the `ContractBean` the rows go through, `toRowJson` / `toEnrichJson`) behind `ProspectListServlet`
 * (`/board/prospect-list`) and `ProspectEnrichServlet` (`/board/prospect-enrich`). Pure but for the calls it makes through `RestDeps`.
 *
 * What is kept to the letter:
 *   - the query of the list: `page` (at least 1), `perPage` (1..200, 20 when ≤ 0), then the filters in the order of the servlet, each
 *     trimmed and form-encoded, blank ones left out, one `marketingChannelIds=` per id, `sortBy` last (`date_desc` → `contactDate_desc` …);
 *   - a list that fails is NOT an HTTP error: `result.error = true` + `result.errorStatus` (the status of the service, 0 = no answer);
 *   - the rows: the fields the LIST carries; the customer code, gender, e-mail, social ids … come from `quick-view` (enrich=1, or the page asks
 *     `/board/prospect-enrich` for the whole page), which OVERWRITES what the list gave (code, gender, type, e-mail, social, convenient time,
 *     contact channel) and fills the address / sale person / team / recorder only where the list had none;
 *   - one `quick-view` at a time (`contracts.list.enrich.threads=1` — the back-end team asked for no parallel calls), each given 15 s.
 *
 * Not ported (performance, not behaviour): the 120 s cache of the enrich answers (`DETAIL_CACHE`; a browser asks again, so an edit shows at once).
 * One visible difference follows: Java also cached an enrich that FAILED (an empty detail) for 2 minutes.
 * Changed on purpose: `avatarSrc` — Java sent http(s) pictures through its own `/docproxy` servlet; there is none, the row carries the address
 * of the file itself (an `<img>` needs no CORS; the file server must answer https, see INTEGRATION.md).
 */
import { translateTh } from './board-master.live';
import { collapse, isJuristic, jtrim, optObject } from './prospect-payload.live';
import { keepAttachments, normalizeProspectV2 } from './prospect-v2.live';
import { isArr, isObj, optInt, optString, parseJson, type JObj } from './org-json';
import { get, type Query, type RestDeps } from './rest';

export const DEFAULT_PER_PAGE = 20;
const MAX_PER_PAGE = 100;
/** `contracts.list.enrich.threads` of config.properties */
export const ENRICH_THREADS = 1;
/** READ_TIMEOUT of the GET of the service */
const READ_TIMEOUT_MS = 15000;
const SORT_BY: Readonly<Record<string, string>> = {
  date_desc: '-createdAt',
  date_asc: 'createdAt',
  name_asc: 'name',
  name_desc: '-name',
};

/** the conditions of one request: what `ProspectListServlet` read from the page */
export interface ListQuery {
  page: number;
  perPage: number;
  searchText: string;
  sortKey: string;
  marketingChannelIds: string[];
  /** not in the Java servlet: the country filter of the filter popup (sent only when chosen) */
  currentCountryId?: string;
  currentCityId: string;
  currentDistrictId: string;
  salePersonId: string;
  /** the status chip of the page: active | draft | suspended | deleted ('' = all) */
  status?: string;
  /** yyyy-MM-dd, the range of the date saved */
  fromDate?: string;
  toDate?: string;
  enrich: boolean;
  lang: string;
}

/* ---------------------------------------------------------------- ContractBean (the fields the list uses) */

/** a day, as `java.util.Date` + `SimpleDateFormat` would carry it */
interface Day {
  y: number;
  m: number;
  d: number;
}

/** `ContractBean`: every text starts as "" (a fresh bean is what an id without a row becomes) */
export interface ProspectBean {
  customerId: number;
  /** `GET /api/v1/prospects` ids are uuids: the id the row carries to the page (customerId stays 0 for them, so no per-row quick-view is asked) */
  rowId: string;
  /** DRAFT · RELEASE · BLOCK of `usageStatus` (the list of the old service had none) */
  usageStatus: string;
  customerCode: string;
  customerName: string;
  gender: string;
  customerType: string;
  prospectEmail: string;
  prospectLine: string;
  prospectFacebook: string;
  prospectTwitter: string;
  prospectInstagram: string;
  convenientText: string;
  contactBackname: string;
  avatar: string;
  dateSave: Day | null;
  source: string;
  tel: string;
  phoneCountryCode: string;
  country: string;
  currentAddress: string;
  currentSubDistrictName: string;
  currentDistrictName: string;
  currentCityName: string;
  currentPostId: string;
  currentCountryName: string;
  currentCountryCode: string;
  salepersoncode: string;
  salepersonname: string;
  employeeSales: string;
  saleGroupCode: string;
  saleGroupName: string;
  createby: string;
  /** the responsible person of the row ("ผู้รับผิดชอบ"): the service sends it as employeeName, the same value as the recorder */
  owner: string;
  /** the uuid of the responsible person (`responsible.id`): what the change of the responsible person says it expects to replace */
  ownerId: string;
  /** `ContractBean.district` (the fallback of the full address; nothing here sets it) */
  district: string;
}

export const newBean = (): ProspectBean => ({
  customerId: 0,
  rowId: '',
  usageStatus: '',
  customerCode: '',
  customerName: '',
  gender: '',
  customerType: '',
  prospectEmail: '',
  prospectLine: '',
  prospectFacebook: '',
  prospectTwitter: '',
  prospectInstagram: '',
  convenientText: '',
  contactBackname: '',
  avatar: '',
  dateSave: null,
  source: '',
  tel: '',
  phoneCountryCode: '',
  country: '',
  currentAddress: '',
  currentSubDistrictName: '',
  currentDistrictName: '',
  currentCityName: '',
  currentPostId: '',
  currentCountryName: '',
  currentCountryCode: '',
  salepersoncode: '',
  salepersonname: '',
  employeeSales: '',
  saleGroupCode: '',
  saleGroupName: '',
  createby: '',
  owner: '',
  ownerId: '',
  district: '',
});

/** `ProspectListService.nameOnlyLabel`: the name, else the code (both trimmed), else "" */
export function nameOnlyLabel(code: string | null | undefined, name: string | null | undefined): string {
  const n = jtrim(name ?? '');
  return n !== '' ? n : jtrim(code ?? '');
}

const isBlank = (v: string | null | undefined): boolean => v == null || jtrim(v) === '';

/** `sexToDisplay`: 1 / M → ชาย, 2 / F → หญิง, anything else → "" */
export function sexToDisplay(sex: string | null | undefined): string {
  switch (sex == null ? '' : jtrim(sex)) {
    case '1':
    case 'M':
    case 'm':
    case 'MALE':
      return 'ชาย';
    case '2':
    case 'F':
    case 'f':
    case 'FEMALE':
      return 'หญิง';
    default:
      return '';
  }
}

/** `customerTypeToDisplay`: blank → "", juristic / company → องค์กร, any other → บุคคลธรรมดา */
export function customerTypeToDisplay(customerType: string | null | undefined): string {
  const v = customerType == null ? '' : jtrim(customerType);
  if (v === '') return '';
  return isJuristic(v) ? 'องค์กร' : 'บุคคลธรรมดา';
}

/**
 * `AppUtils.stringToDate(text, "yyyy-MM-dd", ENGLISH)`: `SimpleDateFormat` is lenient and reads only the front of the text — a time after the
 * day is ignored, a month 13 rolls into the next year. null where Java threw (nothing to parse / not a date).
 */
export function stringToDate(text: string): Day | null {
  if (jtrim(text) === '') return null;
  const m = /^[\s]*(\d+)-(\d+)-(\d+)/.exec(text);
  if (!m) return null;
  const dt = new Date(0);
  dt.setUTCFullYear(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
  return { y: dt.getUTCFullYear(), m: dt.getUTCMonth() + 1, d: dt.getUTCDate() };
}

/** `AppUtils.dateToString(date, "dd/MM/yyyy", ENGLISH)` */
export const dateToView = (d: Day): string => `${String(d.d).padStart(2, '0')}/${String(d.m).padStart(2, '0')}/${String(d.y).padStart(4, '0')}`;

/** `ContractBean.formatSubDistrict`: the sub-district gets แขวง (district starts with เขต) or ตำบล in front unless it has one already */
function formatSubDistrict(b: ProspectBean): string {
  const sub = jtrim(b.currentSubDistrictName);
  if (sub === '' || sub.startsWith('แขวง') || sub.startsWith('ตำบล') || sub.startsWith('ต.')) return sub;
  return (jtrim(b.currentDistrictName).startsWith('เขต') ? 'แขวง' : 'ตำบล') + sub;
}

/** `ContractBean.getFull_address`: address, sub-district, district, province, post code — blanks skipped, one space between; none → `district` */
export function fullAddress(b: ProspectBean): string {
  let out = '';
  for (const part of [b.currentAddress, formatSubDistrict(b), b.currentDistrictName, b.currentCityName, b.currentPostId]) {
    if (jtrim(part) === '') continue;
    out += (out.length > 0 ? ' ' : '') + jtrim(part);
  }
  const full = jtrim(out);
  return full !== '' ? full : jtrim(b.district);
}

/**
 * `ProspectListService.avatarSrc`: the address the page loads the picture from. Java: a relative path as it is, an http(s) address through
 * `<ctx>/docproxy?url=`. There is no servlet to proxy: the (collapsed) address itself.
 */
export const avatarSrc = (raw: string | null | undefined): string => (raw == null ? '' : jtrim(raw));

/** `countryNameOf`: the English name of the service; in Thai the name of `masterdata_th` by the country code (the English one where there is none) */
export function countryNameOf(deps: RestDeps, b: ProspectBean, lang: string): string {
  const english = b.currentCountryName;
  if (lang.toLowerCase() === 'en' || english === '') return english;
  return translateTh(deps, b.currentCountryCode, english);
}

/* ---------------------------------------------------------------- the list → beans → rows */

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const isUuid = (v: string): boolean => UUID.test(v);

/** a value the service hides: only asterisks (`****`) */
export const isMasked = (v: string | null | undefined): boolean => /^\*+$/.test(jtrim(v ?? ''));

/** `mapListRow`: one row of `GET /api/v1/prospects` (view=FULL; a row that is not an object is an empty bean). Fields the service hides stay as it sends them (`****`) */
export function mapListRow(row: JObj | null): ProspectBean {
  const b = newBean();
  if (!row) return b;
  b.rowId = optString(row, 'id', '');
  b.customerName = optString(row, 'name', '');
  b.customerCode = optString(row, 'code', '');
  b.usageStatus = optString(row, 'usageStatus', '');
  b.gender = sexToDisplay(optString(row, 'sex', ''));
  b.customerType = customerTypeToDisplay(optString(row, 'customerType', ''));
  const day = stringToDate(optString(row, 'contactDate', '') || optString(row, 'createdAt', ''));
  if (day) b.dateSave = day;
  // the phone: the dial code and the number as the service gives them. A dial code the service hides (`****`) hides the number too: the row shows `****`
  b.phoneCountryCode = optString(row, 'phoneCountryCode', '');
  const phone = ['mainPhone', 'customerTel', 'phone', 'tel'].map((k) => jtrim(optString(row, k, ''))).find((v) => v !== '') ?? '';
  b.tel = isMasked(b.phoneCountryCode) ? '****' : phone === '' ? '-' : phone;

  const area = optObject(row, 'currentArea');
  if (area) {
    b.currentSubDistrictName = optString(area, 'subDistrict', '');
    b.currentDistrictName = optString(area, 'district', '');
    b.currentCityName = optString(area, 'province', '');
    b.currentCountryName = optString(area, 'country', '');
    b.currentPostId = optString(area, 'postCode', '');
  }
  // the current address as the service names it now: `currentCountry` · `currentProvince` · `currentDistrict` (· `currentSubDistrict`), each `{ id, code?, name }` (or the name as a
  // text). Read after `currentArea`, which it replaces where it is sent. The page shows the country alone when it is not Thailand, else "province, district"
  const place = (key: string): { name: string; code: string } | null => {
    const o = optObject(row, key);
    if (o) return { name: optString(o, 'name', ''), code: optString(o, 'code', '') };
    const text = optString(row, key, '');
    return text === '' ? null : { name: text, code: '' };
  };
  const country = place('currentCountry');
  if (country) {
    b.currentCountryName = country.name;
    b.currentCountryCode = country.code;
  }
  const province = place('currentProvince');
  if (province) b.currentCityName = province.name;
  const district = place('currentDistrict');
  if (district) b.currentDistrictName = district.name;
  const subDistrict = place('currentSubDistrict');
  if (subDistrict) b.currentSubDistrictName = subDistrict.name;
  // the source column: `marketingChannel` as an object ({ id, name }) or as the text itself
  const channel = optObject(row, 'marketingChannel');
  b.source = channel ? optString(channel, 'name', '') : optString(row, 'marketingChannel', '');
  const back = optObject(row, 'contactBack');
  if (back) b.contactBackname = optString(back, 'name', '');

  // the recorder and the responsible person: the name alone, else the code
  const rec = optObject(row, 'recorder');
  if (rec) b.createby = nameOnlyLabel(optString(rec, 'code', ''), optString(rec, 'name', ''));
  // the list names the responsible person `responsibleEmployee` (`responsible` is the older name: still read when it is the one that came)
  const res = optObject(row, 'responsibleEmployee') ?? optObject(row, 'responsible');
  if (res) {
    b.owner = nameOnlyLabel(optString(res, 'code', ''), optString(res, 'name', ''));
    b.ownerId = optString(res, 'id', '');
  }
  // the sale-person column of the page is the responsible person; the team column is the queue the prospect waits in
  b.salepersoncode = res ? optString(res, 'code', '') : '';
  b.salepersonname = res ? optString(res, 'name', '') : '';
  b.employeeSales = b.salepersonname;
  const wl = optObject(row, 'waitlist');
  if (wl) b.saleGroupName = optString(wl, 'name', '');
  return b;
}

/** the text of the status column (the page colours it by the words ร่าง / ระงับ / เปิด): DRAFT → แบบร่าง, BLOCK → ระงับใช้งาน, RELEASE → เปิดใช้งาน; unknown → "" (the page then says เปิดใช้งาน) */
export function statusText(deps: RestDeps, usageStatus: string): string {
  switch (jtrim(usageStatus).toUpperCase()) {
    case 'DRAFT':
      return deps.message('app.prospects.statusDraft');
    case 'BLOCK':
      return deps.message('app.prospects.statusSuspended');
    case 'TRASH':
      return deps.message('app.prospects.statusDeleted');
    case 'RELEASE':
      return deps.message('app.prospects.statusActive');
    default:
      return '';
  }
}

/** `toRowJson`: the row the page draws (the keys are the `data-*` of the table row) */
export function toRowJson(deps: RestDeps, b: ProspectBean, lang: string): JObj {
  return {
    id: b.rowId !== '' ? b.rowId : b.customerId,
    code: b.customerCode,
    name: b.customerName,
    date: b.dateSave === null ? '' : dateToView(b.dateSave),
    status: statusText(deps, b.usageStatus),
    source: b.source,
    phone: b.tel,
    phonecc: b.phoneCountryCode,
    countrycode: b.country,
    addr: fullAddress(b),
    province: b.currentCityName,
    district: b.currentDistrictName,
    subdistrict: formatSubDistrict(b),
    country: countryNameOf(deps, b, lang),
    agentcode: b.salepersoncode,
    agent: nameOnlyLabel(b.salepersoncode, b.employeeSales),
    team: b.saleGroupName,
    recorder: b.createby,
    owner: b.owner,
    ownerid: b.ownerId,
    avatar: avatarSrc(b.avatar),
    gender: b.gender,
    type: b.customerType,
    email: b.prospectEmail,
    line: b.prospectLine,
    fb: b.prospectFacebook,
    x: b.prospectTwitter,
    ig: b.prospectInstagram,
    availtime: b.convenientText,
    availchannel: b.contactBackname,
  };
}

/** `toEnrichJson`: only what the list does not carry (the page lays it over the row) */
export function toEnrichJson(deps: RestDeps, b: ProspectBean, lang: string): JObj {
  return {
    code: b.customerCode,
    gender: b.gender,
    type: b.customerType,
    email: b.prospectEmail,
    line: b.prospectLine,
    fb: b.prospectFacebook,
    x: b.prospectTwitter,
    ig: b.prospectInstagram,
    availtime: b.convenientText,
    availchannel: b.contactBackname,
    addr: fullAddress(b),
    province: b.currentCityName,
    district: b.currentDistrictName,
    subdistrict: formatSubDistrict(b),
    country: countryNameOf(deps, b, lang),
    agentcode: b.salepersoncode,
    agent: nameOnlyLabel(b.salepersoncode, b.employeeSales),
    team: b.saleGroupName,
    recorder: b.createby,
    owner: b.owner,
  };
}

/* ---------------------------------------------------------------- the calls */

/** the result of one GET of the service as `ProspectListService.httpGetWithStatus` gave it: the status, the body only of a 2xx answer */
interface HttpResult {
  status: number;
  body: string;
}

/** a GET with the 15 s of the Java client; no answer (or too late) = status 0 and no body */
async function httpGetWithStatus(deps: RestDeps, path: string, query?: Query): Promise<HttpResult> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const late = new Promise<null>((resolve) => {
    timer = setTimeout(() => resolve(null), READ_TIMEOUT_MS);
  });
  try {
    const u = await Promise.race([get(deps, path, query), late]);
    if (!u || u.status === 0) return { status: 0, body: '' };
    return { status: u.status, body: u.ok ? u.text : '' };
  } finally {
    clearTimeout(timer);
  }
}

const clampPerPage = (perPage: number): number => (perPage <= 0 ? DEFAULT_PER_PAGE : Math.min(perPage, MAX_PER_PAGE));

/**
 * Does `GET /api/v1/prospects` take the country filter of the popup? Yes: as `countryId` (the page and `ListQuery` still call it `currentCountryId`, the
 * name the old service used). Its value is the uuid of a country of `GET /prospects/options?sets=countries`. Set this to false to stop sending it.
 */
export const LIST_TAKES_COUNTRY = true;

/** the status chips of the page -> `usageStatus` of the service (deleted is not one: it is the trash, `GET /prospects/trash`) */
const USAGE_STATUS: Readonly<Record<string, string>> = { active: 'RELEASE', draft: 'DRAFT', suspended: 'BLOCK' };

/** the chip "deleted" asks the trash list, every other state the list of the prospects */
export const listPathOf = (q: ListQuery): string => (jtrim(q.status ?? '') === 'deleted' ? '/prospects/trash' : '/prospects');

const isDay = (v: string): boolean => /^\d{4}-\d{2}-\d{2}$/.test(v);

/**
 * The query of `GET /api/v1/prospects`. The service answers 400 to a name it does not know and to a malformed value, so only what it takes is
 * sent: `q` from 2 characters, the ids of the filters only when they are uuids (the master data of the old board gave numbers), no country
 * filter by `countryId` while `LIST_TAKES_COUNTRY` is on, `perPage` at most 100, the dates only as yyyy-MM-dd, `usageStatus` from the status chip.
 * The trash (`GET /prospects/trash`) takes `page`, `perPage` and `q` only (a `sort` is a 400).
 */
export function listQueryOf(q: ListQuery, opts: { country?: boolean } = {}): Query {
  const text = jtrim(q.searchText);
  const base = { page: Math.max(1, q.page), perPage: clampPerPage(q.perPage), q: text.length >= 2 ? text : '' };
  if (listPathOf(q) === '/prospects/trash') return base;
  const uuid = (v: string): string => (isUuid(jtrim(v)) ? jtrim(v) : '');
  const day = (v: string | undefined): string => (isDay(jtrim(v ?? '')) ? jtrim(v ?? '') : '');
  return {
    ...base,
    sort: SORT_BY[jtrim(q.sortKey)] ?? '',
    marketingChannelIds: q.marketingChannelIds.map(uuid).filter((id) => id !== ''),
    currentProvinceId: uuid(q.currentCityId),
    currentDistrictId: uuid(q.currentDistrictId),
    responsibleEmployeeId: uuid(q.salePersonId),
    usageStatus: USAGE_STATUS[jtrim(q.status ?? '')] ?? '',
    fromDate: day(q.fromDate),
    toDate: day(q.toDate),
    // ready for the day the service takes it: until then the name is unknown to it (400), so it is not sent
    countryId: (opts.country ?? LIST_TAKES_COUNTRY) ? uuid(q.currentCountryId ?? '') : '',
  };
}

/** `enrichFromDetail`: `GET /prospects/{id}/quick-view` → the bean (an answer that is missing or not an object leaves it as it is) */
async function enrichFromDetail(deps: RestDeps, b: ProspectBean): Promise<void> {
  const { body } = await httpGetWithStatus(deps, `/prospects/${b.customerId}/quick-view`);
  if (jtrim(body) === '') return;
  const root = parseJson(body);
  if (!isObj(root)) return;
  const detail = optObject(root, 'result');
  if (!detail) return;
  b.customerCode = optString(detail, 'code', '');
  b.gender = sexToDisplay(optString(detail, 'sex', ''));
  b.customerType = customerTypeToDisplay(optString(detail, 'customerType', ''));
  b.prospectEmail = optString(detail, 'prospectEmail', '');
  b.prospectLine = optString(detail, 'prospectLine', '');
  b.prospectFacebook = optString(detail, 'prospectFacebook', '');
  b.prospectTwitter = optString(detail, 'prospectTwitter', '');
  b.prospectInstagram = optString(detail, 'prospectInstagram', optString(detail, 'prospectInstragram', ''));
  b.convenientText = optString(detail, 'convenient', '');
  b.contactBackname = optString(detail, 'contactBackName', '');
  const overwriteIfPresent = (key: string, set: (v: string) => void): void => {
    const value = optString(detail, key, '');
    if (jtrim(value) !== '') set(value);
  };
  overwriteIfPresent('currentAddress', (v) => (b.currentAddress = v));
  overwriteIfPresent('currentSubDistrictName', (v) => (b.currentSubDistrictName = v));
  overwriteIfPresent('currentDistrictName', (v) => (b.currentDistrictName = v));
  overwriteIfPresent('currentCityName', (v) => (b.currentCityName = v));
  overwriteIfPresent('currentPostId', (v) => (b.currentPostId = v));
  overwriteIfPresent('currentCountryName', (v) => (b.currentCountryName = v));
  overwriteIfPresent('currentCountryCode', (v) => (b.currentCountryCode = v));
  // sale person / team / recorder: only where the list had none
  if (isBlank(b.employeeSales)) {
    const spCode = jtrim(optString(detail, 'salePersonCode', ''));
    const spName = jtrim(optString(detail, 'salePersonName', ''));
    if (spCode !== '' || spName !== '') {
      b.salepersoncode = spCode;
      b.salepersonname = spName;
      b.employeeSales = spName;
    }
  }
  if (isBlank(b.saleGroupName)) {
    const sgName = jtrim(optString(detail, 'saleGroupName', ''));
    if (sgName !== '') {
      b.saleGroupCode = jtrim(optString(detail, 'saleGroupCode', ''));
      b.saleGroupName = sgName;
    }
  }
  if (isBlank(b.createby)) {
    const recorder = nameOnlyLabel(jtrim(optString(detail, 'employeeCode', '')), jtrim(optString(detail, 'employeeName', '')));
    if (recorder !== '') {
      b.createby = recorder;
      b.owner = recorder;
    }
  }
}

/** `enrichParallel`: the detail of every bean that has an id — `ENRICH_THREADS` at a time (one: the calls follow each other in the order of the rows) */
async function enrichParallel(deps: RestDeps, beans: ProspectBean[]): Promise<void> {
  const targets = beans.filter((b) => b.customerId > 0);
  if (targets.length === 0) return;
  const threads = Math.max(1, Math.min(ENRICH_THREADS, targets.length));
  let next = 0;
  const worker = async (): Promise<void> => {
    for (;;) {
      const i = next++;
      if (i >= targets.length) return;
      try {
        await enrichFromDetail(deps, targets[i]);
      } catch {
        /* Java logged it: the bean stays as the list gave it */
      }
    }
  };
  await Promise.all(Array.from({ length: threads }, worker));
}

/**
 * `ProspectListService.fetchPage`: one page of the list as `{ items, meta }` — or, when the service did not answer in a way that holds a list,
 * the same with `error: true` and `errorStatus` (the status of the service, 0 when it did not answer at all).
 */
export async function fetchPage(deps: RestDeps, q: ListQuery): Promise<JObj> {
  const items: JObj[] = [];
  const meta: JObj = {};
  const out: JObj = { items, meta };
  const failed = (status: number): JObj => ({ ...out, error: true, errorStatus: status });

  const trash = listPathOf(q) === '/prospects/trash';
  const list = await httpGetWithStatus(deps, listPathOf(q), listQueryOf(q));
  if (jtrim(list.body) === '') return failed(list.status); // not "no customers": the service failed
  const json = parseJson(list.body);
  if (!isObj(json)) return failed(list.status);
  const rows = isArr(json['result']) ? json['result'] : isArr(json['results']) ? json['results'] : null;
  if (rows === null) return failed(list.status);

  const apiMeta = optObject(json, 'meta');
  if (apiMeta) {
    meta['page'] = optInt(apiMeta, 'page', q.page);
    meta['perPage'] = optInt(apiMeta, 'perPage', q.perPage);
    meta['total'] = optInt(apiMeta, 'total', rows.length);
    meta['totalPages'] = optInt(apiMeta, 'totalPages', 0);
  } else {
    // no paging meta: the page guesses "a full page = there is more"
    meta['page'] = q.page;
    meta['perPage'] = q.perPage;
    meta['total'] = -1;
    meta['totalPages'] = -1;
  }

  const beans = rows.map((r) => mapListRow(isObj(r) ? r : null));
  if (trash) for (const b of beans) b.usageStatus = 'TRASH';
  // `q.enrich` (the suggestion list under the search box) needs nothing more: a row of the service carries the panel data, ids are uuids
  for (const b of beans) items.push(toRowJson(deps, b, q.lang));
  return out;
}

/**
 * The record of the new service (`GET /prospects/{id}?sections=BASE,SOCIAL,ATTACHMENTS,OPPORTUNITIES`) as the side panel of the list shows it: the keys of `/board/prospect-enrich`
 * (what the list does not carry: sex, type, e-mail, the social accounts, the contact times, the address, the people), plus `source`, `phone`, `phonecc`,
 * `owner` and `ownerid`. A value the service hides stays as it came (`****`); a key with nothing in it is '' (the page leaves what it has).
 */
export function enrichOfV2(deps: RestDeps, result: JObj, lang: string): JObj {
  const flat = normalizeProspectV2(result);
  const s = (k: string): string => optString(flat, k, '');
  const person = (...keys: string[]): JObj | null => {
    for (const k of keys) if (isObj(flat[k])) return flat[k] as JObj;
    return null;
  };
  const b = newBean();
  b.customerCode = s('code');
  b.gender = sexToDisplay(s('sex'));
  b.customerType = customerTypeToDisplay(s('customerType'));
  b.prospectEmail = s('email') || s('prospectEmail');
  b.convenientText = s('convenient') || s('convenientTime');
  b.contactBackname = s('contactBackName');
  b.currentAddress = s('currentAddress');
  b.currentSubDistrictName = s('currentSubDistrictName');
  b.currentDistrictName = s('currentDistrictName');
  b.currentCityName = s('currentCityName');
  b.currentPostId = s('currentPostId');
  b.currentCountryName = s('currentCountryName');
  b.currentCountryCode = s('currentCountryCode');
  b.salepersoncode = s('salePersonCode');
  b.salepersonname = s('salePersonName');
  b.employeeSales = b.salepersonname;
  const rec = person('recorder');
  if (rec) b.createby = nameOnlyLabel(optString(rec, 'code', ''), optString(rec, 'name', ''));
  const res = person('responsible', 'responsibleEmployee');
  if (res) {
    b.owner = nameOnlyLabel(optString(res, 'code', ''), optString(res, 'name', ''));
    b.ownerId = optString(res, 'id', '');
  }
  const wl = person('waitlist');
  if (wl) b.saleGroupName = optString(wl, 'name', '');
  // the social accounts: `[{ channelType, accountId | displayName }]` (as `socialAccounts`, `social` or `socials`)
  const list = ['socialAccounts', 'social', 'socials'].map((k) => flat[k]).find((v) => isArr(v)) as unknown[] | undefined;
  for (const item of list ?? []) {
    if (!isObj(item)) continue;
    const value = jtrim(optString(item, 'accountId', '') || optString(item, 'displayName', '') || optString(item, 'pageId', ''));
    if (value === '') continue;
    switch (optString(item, 'channelType', '').toUpperCase()) {
      case 'LINE':
        b.prospectLine = value;
        break;
      case 'FACEBOOK':
        b.prospectFacebook = value;
        break;
      case 'INSTAGRAM':
        b.prospectInstagram = value;
        break;
      case 'X':
      case 'TWITTER':
        b.prospectTwitter = value;
        break;
    }
  }
  const dial = s('phoneCountryCode');
  const phone = ['mainPhone', 'customerTel', 'phone', 'tel'].map((k) => jtrim(s(k))).find((v) => v !== '') ?? '';
  return { ...toEnrichJson(deps, b, lang), source: s('marketingChanelName'), phone: isMasked(dial) ? '****' : phone, phonecc: dial, ownerid: b.ownerId };
}

/** `ProspectListService.fetchDetails`: `{ "<id>": detail }` for the given ids (an id that is not a positive int or a uuid is skipped) */
export async function fetchDetails(deps: RestDeps, ids: readonly string[], lang: string): Promise<JObj> {
  const out: JObj = {};
  if (ids.length === 0) return out;
  // a row of the new service: its id is a uuid (an id that is not one — the numbers of the old service — is skipped: no quick-view is asked)
  const uuids = ids.map((raw) => jtrim(raw)).filter((id) => isUuid(id));
  // uuid rows: the record with its sections, one at a time (the back-end team asked for no parallel calls); a record that does not come leaves its row as the list gave it
  for (const id of uuids) {
    const r = await httpGetWithStatus(deps, `/prospects/${encodeURIComponent(id)}`, { sections: 'BASE,SOCIAL,ATTACHMENTS,OPPORTUNITIES' });
    const root = parseJson(r.body);
    const result = isObj(root) && isObj(root['result']) ? root['result'] : null;
    if (result) {
      out[id] = enrichOfV2(deps, result, lang);
      keepAttachments(id, r.body); // the documents tab of the panel takes them: no call of its own the first time
    }
  }
  return out;
}
