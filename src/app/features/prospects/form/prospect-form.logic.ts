/**
 * The logic of `ContractView` / `ContractBean` / `ProspectApiPayload` that decides what the prospect form shows and what it sends — ported
 * function by function so that a reader can put the two side by side. Pure and framework-free (the comparison harness and the specs load it
 * into Node): no Angular, no I/O, no clock (a day is a parameter).
 *
 * Where the port differs on purpose it says so:
 *   - dates are `yyyy-MM-dd` texts (Java: `java.util.Date`); the time of day of a `new Date()` default is dropped, so the create body's
 *     `contactDate` is `<date>T00:00:00` where Java sent the current time (the service reads the date only);
 *   - `org.json` `put(key, null)` REMOVES the key — `put()` below does the same, the create body relies on it (`marketingChanelId` = null when 0);
 *   - `AttachUrl.proxySrc` is an option (`docProxy`) — the live build has no `/docproxy` servlet (see the bean).
 */
import { type JObj, has, isArr, isObj, optInt, optString, parseJson } from '@core/live/org-json';
import { CUSTOMER_TYPE_PERSON, collapse, ensureTaxBranchForJuristic, extraInfoBody, isAbsolute, jtrim, mainBody, normalizeCustomerType, toRelativeIn } from '@core/live/prospect-payload.live';
import { ATTACH_TYPE_PROFILE, type ProspectDoc, toDocRow } from '../prospects.docs';
import type { BasicBean, ContractBean } from './prospect-form-types';

/* ================================================================================================ text helpers */

/** `ContractView.jsEscape` — what goes inside a single-quoted JavaScript string of an executed script */
export function jsEscape(s: string | null | undefined): string {
  if (s == null) return '';
  return s.replace(/\\/g, '\\\\').replace(/'/g, "\\'").replace(/\n/g, ' ').replace(/\r/g, ' ');
}

/** `digitsOnly`: every character that is not 0-9 goes (dashes, brackets and ALL spaces) */
export const digitsOnly = (s: string | null | undefined): string => (s == null ? '' : s.replace(/[^0-9]/g, ''));

/** `nz` */
export const nz = (s: string | null | undefined): string => (s == null ? '' : s);

/** `trimOrEmpty` */
export const trimOrEmpty = (s: string | null | undefined): string => (s == null ? '' : jtrim(s));

/** `countX`: the number of X in a phone format ("XX XXX XXXX" = 9) */
export function countX(format: string): number {
  let n = 0;
  for (const ch of format) if (ch === 'X' || ch === 'x') n++;
  return n;
}

/** `sexToDisplay`: any spelling a record kept → the text of the radio group ('' = none ticked) */
export function sexToDisplay(raw: string | null | undefined): string {
  if (raw == null) return '';
  const s = jtrim(raw);
  if (s === '') return '';
  if (s === 'ชาย' || s.toLowerCase() === 'm' || s === '1') return 'ชาย';
  if (s === 'หญิง' || s.toLowerCase() === 'f' || s === '2') return 'หญิง';
  if (s === 'ไม่ระบุเพศ' || s.toLowerCase() === 'u' || s === '0') return 'ไม่ระบุเพศ';
  return '';
}

/** the sex the service takes: "1" · "2" · undefined (the update leaves the stored value, the create falls back to "1") */
export function sexToApi(s: string | null | undefined): '1' | '2' | undefined {
  if (s == null || s === '') return undefined;
  if (s === 'ชาย' || s.toLowerCase() === 'm' || s === '1') return '1';
  if (s === 'หญิง' || s.toLowerCase() === 'f' || s === '2') return '2';
  return undefined;
}

/**
 * `parseApiIsoDate`: "2026-07-16T00:00:00.000+07:00" → the wall-clock DATE `2026-07-16` (zone suffix cut, parsed as GMT, shown as GMT) —
 * null where Java's three patterns fail. `SimpleDateFormat.parse(String)` reads a prefix and is lenient: "2026-02-30" rolls over to March 2nd.
 */
export function parseApiIsoDate(s: string | null | undefined): string | null {
  if (s == null || jtrim(s) === '') return null;
  const wall = jtrim(s).replace(/(Z|[+-]\d{2}:?\d{2})$/, '');
  const m = /^(\d+)-(\d+)-(\d+)/.exec(wall);
  if (!m) return null;
  const d = new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3])));
  if (Number.isNaN(d.getTime())) return null;
  const p = (n: number, w: number): string => String(n).padStart(w, '0');
  return `${p(d.getUTCFullYear(), 4)}-${p(d.getUTCMonth() + 1, 2)}-${p(d.getUTCDate(), 2)}`;
}

/* ================================================================================================ master data */

/** `idOrZero` */
export const idOrZero = (b: BasicBean | null | undefined): number => (b != null && b.id != null ? b.id : 0);

/** `toBasicBean` (countries, provinces, districts, sub-districts): codes and names trimmed, the Thai name falls back to the name */
export function uidOf(item: JObj): string | undefined {
  const raw = item['id'];
  return typeof raw === 'string' && raw.trim() !== '' && !/^[+-]?\d+$/.test(raw.trim()) ? raw.trim() : undefined;
}

export function toBasicBean(item: JObj): BasicBean {
  const name = jtrim(optString(item, 'name', ''));
  const nameTh = jtrim(optString(item, 'nameTh', ''));
  return {
    id: optInt(item, 'id', 0),
    ...(uidOf(item) ? { uid: uidOf(item) } : {}),
    code: jtrim(optString(item, 'code', '')),
    name,
    nameTh: nameTh === '' ? name : nameTh,
    phoneCountryCode: jtrim(optString(item, 'phoneCountryCode', '')),
    phoneNumberFormat: jtrim(optString(item, 'phoneNumberFormat', '')),
  };
}

/** the other lists (marketing channels, business types, occupations, communication types, sale persons) — nothing trimmed, `nameTh` as given */
export function toPlainBean(item: JObj): BasicBean {
  return { id: optInt(item, 'id', 0), ...(uidOf(item) ? { uid: uidOf(item) } : {}), code: optString(item, 'code', ''), name: optString(item, 'name', ''), nameTh: optString(item, 'nameTh', ''), phoneCountryCode: '', phoneNumberFormat: '' };
}

/**
 * The `result[]` of a master-data answer as beans: '' / not JSON / no `result` → []; an element that is not an object ends the list (Java:
 * `getJSONObject(i)` throws and the method's own catch returns what it had).
 */
export function parseMasterList(text: string, make: (item: JObj) => BasicBean): BasicBean[] {
  const out: BasicBean[] = [];
  if (!text) return out;
  const root = parseJson(text);
  if (!isObj(root) || !has(root, 'result') || root['result'] === null) return out;
  const arr = root['result'];
  if (!isArr(arr)) return out;
  for (const item of arr) {
    if (!isObj(item)) break;
    out.push(make(item));
  }
  return out;
}

/** `lookupIdOrZero(existingId, code, list)` */
export function lookupIdOrZero(existingId: number | null | undefined, code: string | null | undefined, list: readonly BasicBean[] | null | undefined): number {
  if (existingId != null && existingId !== 0) return existingId;
  if (code == null || code === '' || code === 'N/A' || list == null) return 0;
  const hit = list.find((b) => b.code != null && b.code === code);
  return hit?.id ?? 0;
}

/** the key a list is narrowed by (`provinceId` of the districts …): the uuid of the record with that code on the new service, else its number; '' when there is none */
export function keyOfCode(code: string | null | undefined, list: readonly BasicBean[] | null | undefined): string {
  if (code == null || code === '' || code === 'N/A' || list == null) return '';
  const hit = list.find((b) => b.code != null && b.code === code);
  if (!hit) return '';
  if (hit.uid) return hit.uid;
  return hit.id != null && hit.id > 0 ? String(hit.id) : '';
}

/** `positiveOr` */
export const positiveOr = (first: number | null | undefined, second: number | null | undefined): number => (first != null && first > 0 ? first : (second ?? 0));

/** `nameOfCode` */
export function nameOfCode(code: string | null | undefined, list: readonly BasicBean[] | null | undefined): string {
  if (code == null || list == null) return '';
  const key = jtrim(code);
  for (const b of list) if (b != null && key === (b.code == null ? '' : jtrim(b.code))) return b.name == null ? '' : b.name;
  return '';
}

/** `countryIdIn`: the id of a country code — an exact match first, then ignoring case and blanks */
export function countryIdIn(list: readonly BasicBean[] | null | undefined, code: string): number {
  if (!list || list.length === 0) return 0;
  for (const b of list) if (b != null && code === b.code && idOrZero(b) > 0) return idOrZero(b);
  for (const b of list) if (b != null && b.code != null && code.toLowerCase() === jtrim(b.code).toLowerCase() && idOrZero(b) > 0) return idOrZero(b);
  return 0;
}

/** `isThaiText`: letters of the Thai block (and blanks) only */
export function isThaiText(text: string | null | undefined): boolean {
  if (text == null || jtrim(text) === '') return false;
  for (const ch of text) {
    if (/\s/.test(ch)) continue;
    const c = ch.codePointAt(0)!;
    if (c < 0x0e00 || c > 0x0e7f) return false;
  }
  return true;
}

/** `keepThaiProvinces`: the Thai-named provinces, one per code (the larger id wins), plus the provinces the record already has */
export function keepThaiProvinces(all: readonly BasicBean[], ...keepCodes: Array<string | null | undefined>): BasicBean[] {
  if (all.length === 0) return [];
  const keep = new Set<string>();
  for (const c of keepCodes) if (c != null && jtrim(c) !== '') keep.add(jtrim(c));
  const byCode = new Map<string, BasicBean>();
  for (const b of all) {
    const code = b.code == null ? '' : jtrim(b.code);
    if (code === '') continue;
    if (!isThaiText(b.name) && !keep.has(code)) continue;
    const already = byCode.get(code);
    if (already === undefined || idOrZero(b) > idOrZero(already)) byCode.set(code, b);
  }
  return [...byCode.values()];
}

/* ---- metro_geo.json: the sub-districts the service does not have */

/** [district name (normalised), sub-district code, sub-district name, zip] */
export type MetroRow = readonly [string, string, string, string];

/** `normalizeGeoName`: นิคหิต+สระอา → สระอำ, the prefix (เขต · อำเภอ · อ. · แขวง · ตำบล · ต.) and every blank go */
export function normalizeGeoName(raw: string | null | undefined): string {
  if (raw == null) return '';
  let s = jtrim(raw.split('ํา').join('ำ'));
  for (const p of ['เขต', 'อำเภอ', 'อ.', 'แขวง', 'ตำบล', 'ต.']) {
    if (s.startsWith(p)) {
      s = jtrim(s.substring(p.length));
      break;
    }
  }
  return s.replace(/\s+/g, '');
}

/** `metroRows()`: the rows of `metro_geo.json` ('' / unreadable = no rows) */
export function metroRowsOf(text: string): MetroRow[] {
  const root = parseJson(text);
  if (!isArr(root)) return [];
  const rows: MetroRow[] = [];
  for (const o of root) {
    if (!isObj(o)) break;
    rows.push([normalizeGeoName(optString(o, 'dn', '')), optString(o, 's', ''), optString(o, 'sn', ''), optString(o, 'z', '')]);
  }
  return rows;
}

/** `metroSubDistrictsOf(districtName)`: by name; else the ONE district whose name starts with it (a typo of the backend), else none */
export function metroSubDistrictsOf(rows: readonly MetroRow[], districtName: string): BasicBean[] {
  const key = normalizeGeoName(districtName);
  if (key === '') return [];
  let hit = rows.filter((r) => r[0] === key);
  if (hit.length === 0) {
    const candidates = new Set(rows.filter((r) => r[0].startsWith(key)).map((r) => r[0]));
    if (candidates.size === 1) {
      const only = [...candidates][0];
      hit = rows.filter((r) => r[0] === only);
    }
  }
  // id stays null on purpose: the backend has no such row to resolve to an id
  return hit.map((r) => ({ id: null, code: r[1], name: r[2], nameTh: r[2], phoneCountryCode: '', phoneNumberFormat: '' }));
}

/** `metroZipOfSubDistrict` */
export function metroZipOfSubDistrict(rows: readonly MetroRow[], subDistrictCode: string | null | undefined): string {
  if (subDistrictCode == null || jtrim(subDistrictCode) === '') return '';
  const key = jtrim(subDistrictCode);
  for (const r of rows) if (key === r[1]) return r[3];
  return '';
}

/* ================================================================================================ phones */

/** `phoneCodeAsNumber` (the sort key of the code list): the digits of "+66" as a number, MAX for none */
export function phoneCodeAsNumber(b: BasicBean | null | undefined): number {
  const raw = b == null || b.phoneCountryCode == null ? '' : b.phoneCountryCode;
  const digits = raw.replace(/[^0-9]/g, '');
  if (digits === '') return 2147483647;
  const n = Number(digits);
  return n > 2147483647 ? 2147483647 : n;
}

/** `getListPhoneCodeBean`: one country per phone code (the first), sorted by the number of the code */
export function listPhoneCode(countries: readonly BasicBean[]): BasicBean[] {
  const uniq = new Map<string, BasicBean>();
  for (const c of countries) {
    const code = c == null || c.phoneCountryCode == null ? '' : jtrim(c.phoneCountryCode);
    if (code === '' || uniq.has(code)) continue;
    uniq.set(code, c);
  }
  // List.sort is stable in Java as in JS
  return [...uniq.values()].sort((a, b) => phoneCodeAsNumber(a) - phoneCodeAsNumber(b));
}

/** `phoneCodeOfCountry(countryCode, fallback)` over a loaded list */
export function phoneCodeOfCountry(countries: readonly BasicBean[], countryCode: string | null | undefined, fallback: string): string {
  if (countryCode != null) {
    for (const c of countries) {
      if (c != null && countryCode.toLowerCase() === (c.code ?? '').toLowerCase() && c.phoneCountryCode != null && jtrim(c.phoneCountryCode) !== '') return jtrim(c.phoneCountryCode);
    }
  }
  return fallback;
}

/** `getPhoneFormatJson`: {"+66":"XX XXX XXXX", …} — per phone code the format with the most X, as the JSON text the page reads */
export function phoneFormatJson(countries: readonly BasicBean[]): string {
  const fmt = new Map<string, string>();
  for (const c of countries) {
    if (c == null || c.phoneCountryCode == null || jtrim(c.phoneCountryCode) === '') continue;
    const code = jtrim(c.phoneCountryCode);
    const f = c.phoneNumberFormat == null ? '' : jtrim(c.phoneNumberFormat);
    if (f === '') continue;
    const old = fmt.get(code);
    if (old === undefined || countX(f) > countX(old)) fmt.set(code, f);
  }
  return JSON.stringify(Object.fromEntries(fmt));
}

/**
 * `formatTel(raw)`: digits grouped with "-" by the format of the chosen phone code ("81-234-5678"); longer than the format = the FRONT digits
 * are cut (0812345678 → 81-234-5678); no format for the code = the digits as they are
 */
export function formatTel(raw: string | null | undefined, phoneCode: string | null | undefined, formatJson: string): string {
  let digits = digitsOnly(raw);
  if (digits === '') return '';
  let fmt = '';
  if (phoneCode != null && jtrim(phoneCode) !== '') {
    const map = parseJson(formatJson);
    if (isObj(map)) fmt = optString(map, jtrim(phoneCode), '');
  }
  const groups: number[] = [];
  let total = 0;
  for (const chunk of String(fmt).split(' / ')[0].split(' ')) {
    const n = countX(chunk);
    if (n > 0) {
      groups.push(n);
      total += n;
    }
  }
  if (groups.length === 0) return digits;
  if (digits.length > total) digits = digits.substring(digits.length - total);
  let out = '';
  let i = 0;
  for (let k = 0; k < groups.length && i < digits.length; k++) {
    if (out.length > 0) out += '-';
    out += digits.substring(i, Math.min(i + groups[k], digits.length));
    i += groups[k];
  }
  return out;
}

/** `telWithCode(raw)`: "+66 81-234-5678" */
export function telWithCode(raw: string | null | undefined, phoneCode: string | null | undefined, formatJson: string): string {
  const tel = formatTel(raw, phoneCode, formatJson);
  if (tel === '') return '';
  return phoneCode == null || jtrim(phoneCode) === '' ? tel : `${jtrim(phoneCode)} ${tel}`;
}

/** `sanitizePhoneFields`: the four number fields that the page shows formatted come back as digits (`prospect_tel1-3` keep every symbol) */
export function sanitizePhoneFields(c: ContractBean): void {
  c.tel = digitsOnly(c.tel);
  c.prospect_phone1 = digitsOnly(c.prospect_phone1);
  c.prospect_phone2 = digitsOnly(c.prospect_phone2);
  c.prospect_phone3 = digitsOnly(c.prospect_phone3);
}

/** `trimGeoCodesOnBean` (the phone-code fallback needs the country list, so it is the bean's) */
export function trimGeoCodes(c: ContractBean): void {
  c.current_city_code = trimOrEmpty(c.current_city_code);
  c.current_district_code = trimOrEmpty(c.current_district_code);
  c.current_sub_district_code = trimOrEmpty(c.current_sub_district_code);
  c.current_country_code = trimOrEmpty(c.current_country_code);
  c.senddoc_city_code = trimOrEmpty(c.senddoc_city_code);
  c.senddoc_district_code = trimOrEmpty(c.senddoc_district_code);
  c.senddoc_sub_district_code = trimOrEmpty(c.senddoc_sub_district_code);
  c.senddoc_country_code = trimOrEmpty(c.senddoc_country_code);
  c.country = trimOrEmpty(c.country);
}

/* ================================================================================================ the answers of the service */

/** `parseApiStatus`: `status`, else `code`, else 0 */
export function parseApiStatus(resp: string | null | undefined): number {
  if (resp == null || jtrim(resp) === '') return 0;
  const j = parseJson(resp);
  if (!isObj(j)) return 0;
  return optInt(j, 'status', optInt(j, 'code', 0));
}

/** `apiResponseOk`: 2xx in the body is ok, 4xx+ is not; anything else is ok when the text says "success" */
export function apiResponseOk(resp: string | null | undefined): boolean {
  if (resp == null || jtrim(resp) === '') return false;
  const j = parseJson(resp);
  if (isObj(j)) {
    const st = optInt(j, 'status', optInt(j, 'code', -1));
    if (st >= 200 && st < 300) return true;
    if (st >= 400) return false;
    return resp.toLowerCase().includes('success');
  }
  const low = resp.toLowerCase();
  return low.includes('success') && !low.includes('"error"') && !low.includes('exception');
}

/** `apiErrorText`: "[400] message — detail" with the characters that would break a JavaScript string taken out */
export function apiErrorText(resp: string | null | undefined): string {
  let msg: string;
  if (resp == null || jtrim(resp) === '') {
    msg = 'ไม่มีการตอบกลับจากเซิร์ฟเวอร์ (อาจเชื่อมต่อ API ไม่ได้)';
  } else {
    const j = parseJson(resp);
    if (isObj(j)) {
      const st = optInt(j, 'status', optInt(j, 'code', 0));
      const m = optString(j, 'message', '');
      const err = j['error'];
      const detail = isObj(err) ? optString(err, 'message', '') : '';
      const composed = (st > 0 ? `[${st}] ` : '') + m + (detail === '' ? '' : ` — ${detail}`);
      msg = jtrim(composed) === '' ? resp : composed;
    } else {
      msg = resp.length > 200 ? resp.substring(0, 200) : resp;
    }
  }
  return msg.replace(/\\/g, ' ').replace(/'/g, ' ').replace(/"/g, ' ').replace(/\n/g, ' ').replace(/\r/g, ' ');
}

/** `extractProspectId`: `result.id`, else `id`, else 0 */
export function extractProspectId(resp: string | null | undefined): number {
  if (resp == null || jtrim(resp) === '') return 0;
  const j = parseJson(resp);
  if (!isObj(j)) return 0;
  const r = j['result'];
  if (isObj(r)) {
    const id = Number(optInt(r, 'id', 0));
    if (id > 0) return id;
  }
  return optInt(j, 'id', 0);
}

/** `loadProspectDocs` over the answer of `GET /prospects/{id}/attachments`: documents only (not the profile picture), newest first */
export function docsOfAnswer(text: string): ProspectDoc[] {
  const root = parseJson(text);
  if (!isObj(root) || !isArr(root['result'])) return [];
  const out: ProspectDoc[] = [];
  for (const a of root['result'] as unknown[]) {
    if (!isObj(a)) continue;
    if (optString(a, 'attachFileTypeCode', '').toLowerCase() === ATTACH_TYPE_PROFILE.toLowerCase()) continue;
    out.push(toDocRow({ detailOrderNo: optInt(a, 'detailOrderNo', 0), docNo: optString(a, 'docNo', ''), fileName: optString(a, 'fileName', ''), attachFile: optString(a, 'attachFile', ''), description: optString(a, 'description', ''), attachFileTypeCode: optString(a, 'attachFileTypeCode', '') }));
  }
  return out.reverse(); // the API lists them oldest first
}

/** `AttachUrl.proxySrc` with the proxy as an option: an absolute address goes through it, anything else is shown as it is */
export function avatarSrc(raw: string | null | undefined, docProxy: (absoluteUrl: string) => string): string {
  const url = collapse(raw);
  if (url === '' || !isAbsolute(url)) return url;
  return docProxy(url);
}

/* ================================================================================================ duplicate-checks */

/** why the check is made: a create / release is RELEASE, a change of a record is EDIT (DRAFT only warns; UNBLOCK / RESTORE are other screens) */
export type DuplicatePurpose = 'DRAFT' | 'RELEASE' | 'EDIT' | 'UNBLOCK' | 'RESTORE';
export type DuplicateKind = 'NONE' | 'DUPLICATE_WEAK' | 'DUPLICATE_STRONG' | 'DUPLICATE_HIDDEN' | 'DUPLICATE_BLOCKED';
export interface DuplicateMatch {
  code: string;
  name: string;
  fields: string[];
  group: string;
}
export interface DuplicateVerdict {
  kind: DuplicateKind;
  matches: DuplicateMatch[];
}

/** a value the service hides: only asterisks (`****`). It is never sent back: the field is locked on the form and left out of every body */
export const isMaskedValue = (v: unknown): boolean => typeof v === 'string' && /^\*+$/.test(v.trim());

/** the body without the hidden values: a key whose value is `****` is removed (an object, at any depth); an item of a list is null (the slots keep their place) */
export function stripMasked<T>(v: T): T {
  if (Array.isArray(v)) return v.map((e) => (isMaskedValue(e) ? null : stripMasked(e))) as unknown as T;
  if (v !== null && typeof v === 'object') {
    const o = v as Record<string, unknown>;
    for (const k of Object.keys(o)) {
      if (isMaskedValue(o[k])) delete o[k];
      else o[k] = stripMasked(o[k]);
    }
  }
  return v;
}

const orNull = (v: string | null | undefined): string | null => {
  const t = v == null ? '' : jtrim(v);
  return t === '' || isMaskedValue(t) ? null : t;
};
const digitsOrNull = (v: string | null | undefined): string | null => orNull(digitsOnly(v));

/** the stored name as the form draws it in two fields: the first part up to the first space, the rest is the surname (null when there is none) */
export function splitName(full: string | null | undefined): { first: string | null; last: string | null } {
  const t = full == null ? '' : jtrim(full);
  const i = t.indexOf(' ');
  if (i < 0) return { first: orNull(t), last: null };
  return { first: orNull(t.slice(0, i)), last: orNull(t.slice(i + 1)) };
}

/**
 * The body of `POST /api/v1/prospects/duplicate-checks` from what the form holds: the keys of group A (id card, tax id, main phone, social accounts)
 * and of group B (backup and home phone, e-mail, name and surname: the form keeps one name and draws it in two at the first space). A field the form has
 * no value for is null (the service ignores a blank or an incomplete one); the form has no separate passport field (it is one "id card / passport" field,
 * sent as `idCard`) and the phone country is left to the service. The three mobile and the three fixed-line slots go as lists.
 */
export function duplicateCheckBody(c: ContractBean, purpose: DuplicatePurpose, excludeProspectId: string | null): JObj {
  const { first, last } = splitName(c.customer_name);
  const social: JObj[] = [];
  const account = (channelType: string, value: string | null | undefined): void => {
    const v = orNull(value);
    if (v !== null) social.push({ channelType, pageId: null, accountId: v });
  };
  account('LINE', c.prospect_line);
  account('FACEBOOK', c.prospect_facebook);
  account('INSTAGRAM', c.prospect_instragram);
  return {
    checkFor: purpose,
    excludeProspectId: excludeProspectId === null || jtrim(excludeProspectId) === '' ? null : jtrim(excludeProspectId),
    phoneCountryId: null,
    mainPhone: digitsOrNull(c.tel),
    idCard: orNull(c.id_card),
    taxId: orNull(c.taxid),
    backupPhone: digitsOrNull(c.prospect_phone1),
    homePhone: digitsOrNull(c.prospect_tel1),
    mobilePhones: [digitsOrNull(c.prospect_phone1), digitsOrNull(c.prospect_phone2), digitsOrNull(c.prospect_phone3)],
    telephones: [digitsOrNull(c.prospect_tel1), digitsOrNull(c.prospect_tel2), digitsOrNull(c.prospect_tel3)],
    email: orNull(c.prospect_email),
    name: first,
    lastname: last,
    passport: null,
    socialAccounts: social,
  };
}

const DUPLICATE_KINDS: ReadonlySet<string> = new Set(['NONE', 'DUPLICATE_WEAK', 'DUPLICATE_STRONG', 'DUPLICATE_HIDDEN', 'DUPLICATE_BLOCKED']);

/** the answer of the check as a verdict; null when there is no usable answer (no answer, an error, not the shape): the save then goes on and the service checks again */
export function parseDuplicateVerdict(text: string): DuplicateVerdict | null {
  if (!text) return null;
  const root = parseJson(text);
  if (!isObj(root) || isObj(root['error'])) return null;
  const status = optInt(root, 'status', 200);
  if (status < 200 || status >= 300) return null;
  const result = root['result'];
  const inner = isObj(result) ? result : null;
  const kindRaw = typeof result === 'string' ? result : inner ? optString(inner, 'result', optString(inner, 'kind', '')) : '';
  const kind = kindRaw.trim().toUpperCase();
  if (!DUPLICATE_KINDS.has(kind)) return null;
  const matches: DuplicateMatch[] = [];
  const list = inner && isArr(inner['matches']) ? (inner['matches'] as unknown[]) : [];
  for (const m of list) {
    if (!isObj(m)) continue;
    const preview = isObj(m['preview']) ? m['preview'] : null;
    matches.push({
      code: preview ? optString(preview, 'code', '') : '',
      name: preview ? optString(preview, 'name', '') : '',
      group: optString(m, 'group', ''),
      fields: isArr(m['fields']) ? (m['fields'] as unknown[]).map((f) => String(f)) : [],
    });
  }
  return { kind: kind as DuplicateKind, matches };
}

/**
 * A refusal of the check that must stop the save, as the text to show: 403 (no permission) and 422 (the data is malformed) — the service says no, the save
 * would be said no too. Anything else that is not a verdict (5xx, no answer, another shape) is null: the save goes on and the service checks again.
 */
export function duplicateRefusal(text: string): string | null {
  if (!text) return null;
  const root = parseJson(text);
  if (!isObj(root)) return null;
  const status = optInt(root, 'status', optInt(root, 'code', 0));
  if (status !== 403 && status !== 422) return null;
  const err = isObj(root['error']) ? root['error'] : null;
  const why = (err ? optString(err, 'description', optString(err, 'message', '')) : '') || optString(root, 'message', '');
  const head = status === 403 ? 'ไม่มีสิทธิ์ตรวจสอบข้อมูลซ้ำ ไม่สามารถบันทึกได้' : 'ข้อมูลไม่ถูกต้อง ไม่สามารถตรวจสอบข้อมูลซ้ำได้';
  return `[${status}] ${head}${jtrim(why) === '' ? '' : `\n${jtrim(why)}`}`;
}

const DUPLICATE_FIELD_LABELS: Readonly<Record<string, string>> = {
  ID_CARD: 'เลขบัตรประชาชน',
  TAX_ID: 'เลขผู้เสียภาษี',
  PASSPORT: 'พาสปอร์ต',
  MAIN_PHONE: 'เบอร์โทรหลัก',
  SOCIAL: 'บัญชีโซเชียล',
  BACKUP_PHONE: 'เบอร์สำรอง',
  HOME_PHONE: 'เบอร์บ้าน',
  EMAIL: 'อีเมล',
  NAME: 'ชื่อ-นามสกุล',
};

/**
 * What the save must say when it cannot go on, or null when it can. BLOCKED (a blocked record matches) and HIDDEN (a match the user may not see) and
 * STRONG (a key of group A matches) stop the save; WEAK (group B only) and NONE let it through (the service decides again when it saves).
 * BLOCKED and HIDDEN say nothing about the other record: the service sends no detail for them.
 */
export function duplicateStopText(v: DuplicateVerdict): string | null {
  if (v.kind === 'DUPLICATE_BLOCKED') return 'พบลูกค้าซ้ำที่ถูกระงับใช้งานอยู่ ไม่สามารถบันทึกได้';
  if (v.kind === 'DUPLICATE_HIDDEN') return 'พบลูกค้าซ้ำในระบบ แต่คุณไม่มีสิทธิ์ดูรายละเอียด ไม่สามารถบันทึกได้';
  if (v.kind !== 'DUPLICATE_STRONG') return null;
  const lines = v.matches.map((m) => {
    const who = [m.code, m.name].map((x) => x.trim()).filter(Boolean).join(' ');
    const by = m.fields.map((f) => DUPLICATE_FIELD_LABELS[f] ?? f).join(', ');
    return [who, by ? `(${by})` : ''].filter(Boolean).join(' ');
  }).filter(Boolean);
  return ['พบลูกค้าซ้ำในระบบ ไม่สามารถบันทึกได้', ...lines].join('\n');
}

/* ================================================================================================ POST /api/v1/prospects (PR-2) */

/** `assignment` of the create from the choice of the owner field: a person (uuid) → EMPLOYEE, a queue (`wl:<id>`) → WAITLIST (the body of this one is a guess), none → null */
export function assignmentOf(owner: string | null | undefined): JObj | null {
  const v = owner == null ? '' : jtrim(owner);
  if (v === '') return null;
  return v.startsWith('wl:') ? { destination: 'WAITLIST', waitlistId: v.slice(3) } : { destination: 'EMPLOYEE', responsibleEmployeeId: v };
}

/** the uuid of the country that carries the dial code the form holds ("+66"): the first country with that code (as `listPhoneCode` picks), null when none */
export function phoneCountryUid(code: string | null | undefined, countries: readonly BasicBean[]): string | null {
  const k = code == null ? '' : jtrim(code);
  if (k === '') return null;
  return countries.find((b) => b.phoneCountryCode != null && jtrim(b.phoneCountryCode) === k && b.uid)?.uid ?? null;
}

/**
 * The body of `POST /api/v1/prospects` from what the form holds: `{ mode, customer, assignment }`. `mode` is DRAFT (a draft: no assignment) or RELEASE (the
 * customer is made and handed to a person or a queue). The ids of the lists are the uuids of the service (`BasicBean.uid`, found by the CODE the form holds);
 * what has none is null. The form has no calling name; the phone country is left null (the service's countries come without a dial code); a company has no
 * surname. The three mobile and the three fixed-line slots go as lists, as in the check of duplicates.
 */
export function buildCreateV2Body(c: ContractBean, lists: FormLists, mode: 'DRAFT' | 'RELEASE', assignment: JObj | null): JObj {
  const uid = (code: string | null | undefined, list: readonly BasicBean[]): string | null => {
    const k = code == null ? '' : jtrim(code);
    if (k === '' || k === 'N/A') return null;
    return list.find((b) => b.code === k)?.uid ?? null;
  };
  const day = (v: string | null | undefined): string | null => (typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v) ? v : null);
  const juristic = normalizeCustomerType(c.customer_type) === 'juristic';
  const { first, last } = splitName(c.customer_name);
  const sex = c.sex === 'ชาย' ? 'MALE' : c.sex === 'หญิง' ? 'FEMALE' : null;
  const social: JObj[] = [];
  for (const [channelType, value] of [['LINE', c.prospect_line], ['FACEBOOK', c.prospect_facebook], ['INSTAGRAM', c.prospect_instragram]] as const) {
    const v = orNull(value);
    if (v !== null) social.push({ channelType, accountId: v });
  }
  const address = (line: string, province: string, district: string, sub: string, country: string, post: string, d: readonly BasicBean[], s: readonly BasicBean[]): JObj => ({
    address: orNull(line),
    provinceId: uid(province, lists.province),
    districtId: uid(district, d),
    subdistrictId: uid(sub, s),
    countryId: uid(country, lists.country),
    postcode: orNull(post),
  });
  const customer: JObj = {
    customerType: juristic ? 'JURISTIC' : 'PERSON',
    name: first,
    lastname: juristic ? null : last,
    callingName: null,
    phoneCountryId: phoneCountryUid(c.phone_country_code, lists.country),
    countryId: uid(c.country, lists.country),
    mainPhone: digitsOrNull(c.tel),
    mobilePhones: [digitsOrNull(c.prospect_phone1), digitsOrNull(c.prospect_phone2), digitsOrNull(c.prospect_phone3)],
    telephones: [digitsOrNull(c.prospect_tel1), digitsOrNull(c.prospect_tel2), digitsOrNull(c.prospect_tel3)],
    fax: digitsOrNull(c.prospect_fax),
    email: orNull(c.prospect_email),
    idCard: orNull(c.id_card),
    birthdate: day(c.birthdate),
    sex,
    occupationId: uid(c.occupationcode, lists.occupation),
    nationality: orNull(c.nationality),
    marketingChannelId: uid(c.marketingchanelcode, lists.marketingChanel),
    contactBackId: uid(c.contact_backcode, lists.convenientTime),
    convenient: orNull(c.convenient_text),
    contactDate: day(c.date_save),
    remark: orNull(c.remark),
    currentAddress: address(c.current_address, c.current_city_code, c.current_district_code, c.current_sub_district_code, c.current_country_code, c.current_postid, lists.district, lists.subDistrict),
    documentAddress: address(c.senddoc_address, c.senddoc_city_code, c.senddoc_district_code, c.senddoc_sub_district_code, c.senddoc_country_code, c.senddoc_postid, lists.district2, lists.subDistrict2),
    socialAccounts: social,
  };
  const body: JObj = { mode, customer };
  if (mode === 'RELEASE' && assignment) body['assignment'] = assignment;
  return body;
}

/* ================================================================================================ the bodies */

/** org.json `JSONObject.put(key, value)`: a null value REMOVES the key */
function put(j: JObj, key: string, value: unknown): void {
  if (value === null || value === undefined) delete j[key];
  else j[key] = value;
}

export const DEFAULT_COUNTRY_ID = 0;
export const DEFAULT_CITY_ID = 0;
export const DEFAULT_MARKETING_CHANEL_ID = 0;
export const DEFAULT_SALE_PERSON_ID = 0;
export const DEFAULT_LEAD_SALEGROUP_ID = 0;
export const DEFAULT_LEAD_MOVEMENTTYPE_ID = 0;
export const DEFAULT_USAGE_STATUS = 'release';
export const FALLBACK_AGE = 1;

/** `ensureNotBlank`: a missing / blank / "null" value becomes the default */
export function ensureNotBlank(j: JObj, key: string, def: string): void {
  const v = j[key];
  const s = v === undefined || v === null ? '' : jtrim(String(v));
  if (s === '' || s.toLowerCase() === 'null') j[key] = def;
}

/** `ensurePositiveInt` (every default is 0 in this deployment: the key is written as 0) */
export function ensurePositiveInt(j: JObj, key: string, def: number): void {
  if (optInt(j, key, 0) <= 0) j[key] = def;
}

/** `ensureUsageStatus`: draft · release · block · remove, else "release" */
export function ensureUsageStatus(j: JObj): void {
  const v = optString(j, 'usageStatus', '');
  if (v !== 'draft' && v !== 'release' && v !== 'block' && v !== 'remove') j['usageStatus'] = DEFAULT_USAGE_STATUS;
}

const overwriteStr = (j: JObj, key: string, value: string | null | undefined): void => {
  if (value != null && jtrim(value) !== '' && !isMaskedValue(value)) j[key] = value;
};
const overwriteInt = (j: JObj, key: string, value: number | null | undefined): void => {
  if (value != null && value > 0) j[key] = value;
};

/** `overwriteMasterData`: id + code + name of the chosen row of a list (nothing is written when the code is not in the list) */
function overwriteMasterData(j: JObj, idKey: string, codeKey: string, nameKey: string, code: string | null | undefined, list: readonly BasicBean[] | null | undefined, preferTh: boolean): void {
  if (code == null || jtrim(code) === '' || code.toLowerCase() === 'n/a' || list == null) return;
  const match = list.find((b) => b.code != null && b.code === code);
  if (!match) return;
  if (match.id != null && match.id > 0) j[idKey] = match.id;
  if (match.code != null && match.code !== '') j[codeKey] = match.code;
  const nm = preferTh && match.nameTh != null && match.nameTh !== '' ? match.nameTh : match.name;
  if (nm != null && nm !== '') j[nameKey] = nm;
}

/** the lists the bodies are made from */
export interface FormLists {
  country: readonly BasicBean[];
  province: readonly BasicBean[];
  district: readonly BasicBean[];
  subDistrict: readonly BasicBean[];
  district2: readonly BasicBean[];
  subDistrict2: readonly BasicBean[];
  businessType: readonly BasicBean[];
  occupation: readonly BasicBean[];
  marketingChanel: readonly BasicBean[];
  convenientTime: readonly BasicBean[];
}

/** `buildSunInfoForExtraApi` / the `sunInfo_var` of the create: the extra-info the form's own fields carry (only the non-blank ones) */
export function buildSunInfo(c: ContractBean): JObj {
  const sun: JObj = {};
  const set = (key: string, value: string | null | undefined): void => {
    if (value != null && jtrim(value) !== '') sun[key] = value;
  };
  set('researcher', c.researchcode);
  set('txDate', c.research_date_cs);
  set('csLoanType', c.loantypeinitialcode);
  set('csTypeProperty', c.propertytypecode);
  set('csLoanProperty', c.property_to_pledge);
  set('csDateTransOwnership', c.estimated_transfer_ownership_date_cs);
  set('csDescriptionProperty', c.property_description);
  set('csTypeService', c.confirm_servicetype_code);
  set('csDesiredLoanAmount', c.loan_amount);
  set('csYearsLoan', c.loan_term_years);
  set('csCoBorrower', c.has_co_borrower);
  set('csMbRelationship', c.relation_to_borrower);
  set('csTranslate', c.translate);
  set('csVip', c.vip);
  set('csIncomeType', c.borrower_incometype_code);
  set('csTwoMenWoIncome', c.thai_female_foreignincome_code);
  set('csThaiCoBorrower', c.thai_co_borrower);
  set('csJobCoBorrower', c.thai_co_borrowerjob_code);
  return sun;
}

/** `PUT /prospects/{id}/extra-info` body of the form's fields (null = nothing to send) */
export const extraInfoOfForm = (c: ContractBean): JObj | null => {
  const body = extraInfoBody(buildSunInfo(c), null);
  return body === null ? null : stripMasked(body);
};

/** the same for a `sunProspectInfo` already made (the create keeps the one it built before the POST) */
export const extraInfoOfSun = (sun: JObj): JObj | null => extraInfoBody(sun, null);

/** `resolveCountryId` without the reload of the list: the id of a code in the list as it is (0 for a blank / N/A code) */
export function resolveCountryIdIn(list: readonly BasicBean[], code: string | null | undefined): number {
  if (code == null || jtrim(code) === '' || code === 'N/A') return 0;
  return countryIdIn(list, jtrim(code));
}

export interface BodyContext {
  lists: FormLists;
  /** `yyyy-MM-dd` of today (Java: `new Date()`) */
  today: string;
  /** `resolveCountryId(code)` over the (already refreshed) country list — the bean warms it before the body is made */
  resolveCountryId(code: string | null | undefined): number;
}

/**
 * `update_prospect_query_Data_API` up to the PUT: the snapshot of the detail the page was opened with (`ss_contact_detail_original_json`) is the base,
 * what the form holds is written over it, blanks fall back to defaults, and `ProspectApiPayload.mainBody` keeps the keys the service takes.
 * @param original the snapshot (null = Java found none in the session: the body then carries the form's values only)
 */
export function buildUpdateBody(c: ContractBean, original: JObj | null, ctx: BodyContext): JObj {
  const j: JObj = original ? structuredClone(original) : {};
  const { lists, today } = ctx;
  j['id'] = c.id;
  overwriteStr(j, 'code', c.customer_code);
  overwriteStr(j, 'name', c.customer_name);
  overwriteStr(j, 'customerTel', digitsOnly(c.tel));
  if (c.customer_type != null && c.customer_type !== '') j['customerType'] = normalizeCustomerType(c.customer_type);
  if (c.sex != null && c.sex !== '') {
    const sex = sexToApi(c.sex);
    if (sex !== undefined) j['sex'] = sex;
  }
  if (c.date_save != null) j['contactDate'] = c.date_save;
  if (c.convenient_time != null) j['convenientTime'] = c.convenient_time;
  if (c.birthdate != null && c.birthdate <= today) j['birthdate'] = c.birthdate;

  overwriteStr(j, 'convenient', c.convenient_text);
  overwriteStr(j, 'country', c.country);
  overwriteStr(j, 'currentAddress', c.current_address);
  overwriteStr(j, 'currentPostId', c.current_postid);
  overwriteStr(j, 'remark', c.remark);
  overwriteStr(j, 'idCard', c.id_card);
  overwriteStr(j, 'nationality', c.nationality);
  overwriteStr(j, 'refferal', c.refferal);
  overwriteStr(j, 'referralTel', c.refferal_tel);
  overwriteStr(j, 'referralRelate', c.refferal_relate);
  overwriteStr(j, 'workplaceName', c.workplace_name);
  overwriteStr(j, 'workplacePosition', c.workplace_position);
  overwriteStr(j, 'workplaceAddress', c.workplace_address);
  overwriteStr(j, 'workplaceTel', c.workplace_tel);
  overwriteStr(j, 'taxId', c.taxid);
  overwriteStr(j, 'taxBranch', c.taxbranch);
  overwriteStr(j, 'contactBusiness', c.contract_business);
  overwriteStr(j, 'contactPosition', c.contract_position);
  overwriteStr(j, 'sendDocAddress', c.senddoc_address);
  overwriteStr(j, 'sendDocPostId', c.senddoc_postid);
  overwriteStr(j, 'prospectEmail', c.prospect_email);
  overwriteStr(j, 'prospectLine', c.prospect_line);
  overwriteStr(j, 'prospectFacebook', c.prospect_facebook);
  overwriteStr(j, 'prospectTwitter', c.prospect_twitter);
  overwriteStr(j, 'prospectInstragram', c.prospect_instragram);
  overwriteStr(j, 'prospectFax', c.prospect_fax);
  overwriteStr(j, 'phoneCountryCode', c.phone_country_code);
  overwriteStr(j, 'prospectPhone1', digitsOnly(c.prospect_phone1));
  overwriteStr(j, 'prospectPhone2', digitsOnly(c.prospect_phone2));
  overwriteStr(j, 'prospectPhone3', digitsOnly(c.prospect_phone3));
  overwriteStr(j, 'prospectTel1', c.prospect_tel1);
  overwriteStr(j, 'prospectTel2', c.prospect_tel2);
  overwriteStr(j, 'prospectTel3', c.prospect_tel3);

  overwriteInt(j, 'salePersonId', c.salepersonid);
  overwriteInt(j, 'saleGroupId', c.saleGroupId);
  overwriteInt(j, 'ggwBranchId', c.ggwBranchId);
  overwriteInt(j, 'contactBackId', lookupIdOrZero(c.contact_backid, c.contact_backcode, lists.convenientTime));
  overwriteInt(j, 'marketingChanelId', lookupIdOrZero(c.marketingchanelid, c.marketingchanelcode, lists.marketingChanel));
  overwriteInt(j, 'countryId', positiveOr(lookupIdOrZero(c.country_id, c.country, lists.country), ctx.resolveCountryId(c.country)));
  overwriteInt(j, 'occupationId', lookupIdOrZero(c.occupationid, c.occupationcode, lists.occupation));
  overwriteInt(j, 'businessTypeId', lookupIdOrZero(c.businesstypeid, c.businesstypecode, lists.businessType));
  overwriteInt(j, 'currentCityId', lookupIdOrZero(null, c.current_city_code, lists.province));
  overwriteInt(j, 'currentCountryId', positiveOr(lookupIdOrZero(c.current_country_id, c.current_country_code, lists.country), ctx.resolveCountryId(c.current_country_code)));
  overwriteInt(j, 'currentDistrictId', lookupIdOrZero(null, c.current_district_code, lists.district));
  overwriteInt(j, 'sendDocCityId', lookupIdOrZero(c.senddoc_city_id, c.senddoc_city_code, lists.province));
  overwriteInt(j, 'sendDocCountryId', positiveOr(lookupIdOrZero(c.senddoc_country_id, c.senddoc_country_code, lists.country), ctx.resolveCountryId(c.senddoc_country_code)));
  // (Java looks the document district up in the list of the CURRENT address here and in the second list for its name below — kept)
  overwriteInt(j, 'sendDocDistrictId', lookupIdOrZero(null, c.senddoc_district_code, lists.district));

  overwriteMasterData(j, 'contactBackId', 'contactBackCode', 'contactBackName', c.contact_backcode, lists.convenientTime, false);
  overwriteMasterData(j, 'occupationId', 'occupationCode', 'occupationName', c.occupationcode, lists.occupation, false);
  overwriteMasterData(j, 'businessTypeId', 'businessTypeCode', 'businessTypeName', c.businesstypecode, lists.businessType, false);
  overwriteMasterData(j, 'currentCityId', 'currentCityCode', 'currentCityName', c.current_city_code, lists.province, false);
  overwriteMasterData(j, 'currentDistrictId', 'currentDistrictCode', 'currentDistrictName', c.current_district_code, lists.district, false);
  overwriteMasterData(j, 'currentCountryId', 'currentCountryCode', 'currentCountryName', c.current_country_code, lists.country, true);
  overwriteMasterData(j, 'sendDocCityId', 'sendDocCityCode', 'sendDocCityName', c.senddoc_city_code, lists.province, false);
  overwriteMasterData(j, 'sendDocDistrictId', 'sendDocDistrictCode', 'sendDocDistrictName', c.senddoc_district_code, lists.district2, false);
  overwriteMasterData(j, 'sendDocCountryId', 'sendDocCountryCode', 'sendDocCountryName', c.senddoc_country_code, lists.country, true);
  overwriteMasterData(j, 'currentSubDistrictId', 'currentSubDistrictCode', 'currentSubDistrictName', c.current_sub_district_code, lists.subDistrict, false);
  overwriteMasterData(j, 'sendDocSubDistrictId', 'sendDocSubDistrictCode', 'sendDocSubDistrictName', c.senddoc_sub_district_code, lists.subDistrict2, false);

  if (c.age != null && c.age > 0) j['age'] = c.age;

  for (const k of ['createBy', 'createDate', 'updateBy', 'updateDate', 'removeStatus']) delete j[k];

  ensureNotBlank(j, 'name', '-');
  ensureNotBlank(j, 'customerTel', '000');
  ensureNotBlank(j, 'idCard', '000');
  ensureNotBlank(j, 'customerType', CUSTOMER_TYPE_PERSON);
  ensureNotBlank(j, 'sex', '1');
  ensureNotBlank(j, 'currentAddress', '-');
  ensureNotBlank(j, 'referralRelate', '-');
  ensureNotBlank(j, 'contactDate', today);
  ensureNotBlank(j, 'convenientTime', today);
  ensurePositiveInt(j, 'countryId', DEFAULT_COUNTRY_ID);
  ensurePositiveInt(j, 'currentCityId', DEFAULT_CITY_ID);
  ensurePositiveInt(j, 'marketingChanelId', DEFAULT_MARKETING_CHANEL_ID);
  ensurePositiveInt(j, 'salePersonId', DEFAULT_SALE_PERSON_ID);
  ensureUsageStatus(j);

  const body = mainBody(j, c.id);
  toRelativeIn(body, 'attachFile', 'downloadAttachFile');
  const mkSel = nz(c.marketingchanelcode);
  if (mkSel !== '' && mkSel.toLowerCase() !== 'n/a') {
    body['marketingChanelCode'] = mkSel;
    body['marketingChanelName'] = mkSel;
  }
  return stripMasked(body); // what the service hid (`****`) is not sent back, not even the copy of the original record
}

/** the request parameters the lead part of the page sends with `rc_createLead` (Java: `leadParamOr` / `leadParamFlag`) */
export function leadParamOr(params: Readonly<Record<string, string>>, key: string, def: number): number {
  const v = params[key];
  if (v === undefined || jtrim(v) === '') return def;
  return /^[+-]?\d+$/.test(jtrim(v)) ? Number(jtrim(v)) : def;
}
export const leadParamFlag = (params: Readonly<Record<string, string>>, key: string): boolean => {
  const v = params[key];
  return v !== undefined && (v.toLowerCase() === 'true' || v === '1');
};

/** `resolveCreateAge`: the age typed, else the years since the birth date, else 1 */
export function resolveCreateAge(c: ContractBean, today: string): number {
  if (c.age != null && c.age > 0) return c.age;
  if (c.birthdate != null) {
    const [by, bm, bd] = c.birthdate.split('-').map(Number);
    const [ty, tm, td] = today.split('-').map(Number);
    let years = ty - by;
    // (Java compares the day of the year)
    const doy = (y: number, m: number, d: number): number => Math.round((Date.UTC(y, m - 1, d) - Date.UTC(y, 0, 1)) / 86400000) + 1;
    if (doy(ty, tm, td) < doy(by, bm, bd)) years--;
    if (years > 0) return years;
  }
  return FALLBACK_AGE;
}

export interface CreateContext extends BodyContext {
  /** the request parameters of the remote command (movementTypeId, procedureGroupId, assignToId, employeeId, confirmMerge) */
  params: Readonly<Record<string, string>>;
  /** `api_saleperson_list()` — read only when a sale person was chosen in the lead modal (`assignToId`) */
  salePersons: readonly BasicBean[];
  /** `triplesale.api.prospect_send_employee_id` (off: the service answers 500 when it finds the employee) */
  sendEmployeeId: boolean;
}

/** the id / code / name triple of the create body (null id when 0, as Java's `put(key, id != 0 ? id : null)`) */
function triple(j: JObj, idKey: string, codeKey: string, nameKey: string, id: number, code: string, name: string): void {
  put(j, idKey, id !== 0 ? id : null);
  put(j, codeKey, code);
  put(j, nameKey, name);
}

const chosen = (code: string | null | undefined): code is string => code != null && code !== '' && code !== 'N/A';

/**
 * `save_prospect_query_Data_API` up to the POST: the body of `POST /prospects` from the form. Returns the body and the `sunProspectInfo` to
 * PUT afterwards (`PUT /prospects/{id}/extra-info`). `convenientTime` is the constant "2025-07-04T10:00:00" in Java — the code compares the
 * codes of the list with a Date and never matches — and so it is here.
 */
export function buildCreateBody(c: ContractBean, ctx: CreateContext): { body: JObj; sunInfo: JObj } {
  const j: JObj = {};
  const { lists, today, params } = ctx;
  put(j, 'code', c.customer_code);
  put(j, 'salePersonId', c.salepersonid);
  put(j, 'salePersonCode', c.salepersoncode);
  put(j, 'salePersonName', c.salepersonname);
  put(j, 'usageStatus', c.usagestatus);
  put(j, 'customerType', normalizeCustomerType(c.customer_type));
  put(j, 'name', c.customer_name);
  put(j, 'customerTel', digitsOnly(c.tel));
  put(j, 'sex', c.sex ? (sexToApi(c.sex) ?? null) : null);

  let id = 0;
  let code = '';
  let name = '';
  if (chosen(c.contact_backcode)) {
    const m = lists.convenientTime.find((d) => d.code === c.contact_backcode);
    if (m) {
      id = idOrZero(m);
      code = m.code;
      name = m.name;
    }
  }
  triple(j, 'contactBackId', 'contactBackCode', 'contactBackName', id, code, name);
  put(j, 'convenientTime', '2025-07-04T10:00:00');
  put(j, 'contactDate', c.date_save != null ? `${c.date_save}T00:00:00` : null);
  put(j, 'convenient', c.convenient_text);

  id = 0;
  code = '';
  name = '';
  if (chosen(c.marketingchanelcode)) {
    const m = lists.marketingChanel.find((d) => d.code === c.marketingchanelcode);
    if (m) {
      id = idOrZero(m);
      code = m.code;
      name = m.name;
    } else {
      code = c.marketingchanelcode;
      name = c.marketingchanelcode;
    }
  }
  triple(j, 'marketingChanelId', 'marketingChanelCode', 'marketingChanelName', id, code, name);

  id = 0;
  code = '';
  name = '';
  if (chosen(c.country)) {
    id = ctx.resolveCountryId(c.country);
    const m = lists.country.find((d) => d.code != null && d.code === c.country);
    code = m ? m.code : c.country;
    name = m ? m.name : '';
  }
  put(j, 'countryId', id !== 0 ? id : null);
  put(j, 'countryCode', code);
  put(j, 'countryName', name);

  put(j, 'remark', c.remark);
  put(j, 'prospectPhone1', digitsOnly(c.prospect_phone1));
  put(j, 'prospectPhone2', digitsOnly(c.prospect_phone2));
  put(j, 'prospectPhone3', digitsOnly(c.prospect_phone3));
  put(j, 'phoneCountryCode', c.phone_country_code);
  put(j, 'prospectTel1', c.prospect_tel1);
  put(j, 'prospectTel2', c.prospect_tel2);
  put(j, 'prospectTel3', c.prospect_tel3);
  put(j, 'prospectEmail', c.prospect_email);
  put(j, 'prospectLine', c.prospect_line);
  put(j, 'prospectFacebook', c.prospect_facebook);
  put(j, 'prospectTwitter', c.prospect_twitter);
  put(j, 'prospectInstragram', c.prospect_instragram);
  put(j, 'prospectFax', c.prospect_fax);
  put(j, 'idCard', c.id_card);
  put(j, 'birthdate', c.birthdate);
  put(j, 'age', resolveCreateAge(c, today));

  const simple = (src: string, list: readonly BasicBean[], idKey: string, codeKey: string, nameKey: string): void => {
    let i = 0;
    let cd = '';
    let nm = '';
    if (chosen(src)) {
      const m = list.find((d) => d.code === src);
      if (m) {
        i = idOrZero(m);
        cd = m.code;
        nm = m.name;
      }
    }
    triple(j, idKey, codeKey, nameKey, i, cd, nm);
  };
  simple(c.occupationcode, lists.occupation, 'occupationId', 'occupationCode', 'occupationName');
  put(j, 'nationality', c.nationality);
  put(j, 'refferal', c.refferal);
  put(j, 'workplaceName', c.workplace_name);
  put(j, 'workplacePosition', c.workplace_position);
  put(j, 'workplaceAddress', c.workplace_address);
  put(j, 'workplaceTel', c.workplace_tel);
  put(j, 'referralTel', c.refferal_tel);
  put(j, 'referralRelate', c.refferal_relate);
  put(j, 'taxId', c.taxid);
  put(j, 'contactBusiness', c.contract_business);
  put(j, 'taxBranch', c.taxbranch);
  put(j, 'contactPosition', c.contract_position);
  simple(c.businesstypecode, lists.businessType, 'businessTypeId', 'businessTypeCode', 'businessTypeName');

  put(j, 'currentAddress', c.current_address);
  put(j, 'currentPostId', c.current_postid);
  simple(c.current_city_code, lists.province, 'currentCityId', 'currentCityCode', 'currentCityName');
  {
    let i = 0;
    let cd = '';
    let nm = '';
    if (chosen(c.current_country_code)) {
      const m = lists.country.find((d) => d.code === c.current_country_code);
      if (m) {
        i = ctx.resolveCountryId(c.current_country_code);
        cd = m.code;
        nm = m.name;
      }
    }
    triple(j, 'currentCountryId', 'currentCountryCode', 'currentCountryName', i, cd, nm);
  }
  simple(c.current_sub_district_code, lists.subDistrict, 'currentSubDistrictId', 'currentSubDistrictCode', 'currentSubDistrictName');
  simple(c.current_district_code, lists.district, 'currentDistrictId', 'currentDistrictCode', 'currentDistrictName');

  put(j, 'sendDocAddress', c.senddoc_address);
  put(j, 'sendDocPostId', c.senddoc_postid);
  simple(c.senddoc_city_code, lists.province, 'sendDocCityId', 'sendDocCityCode', 'sendDocCityName');
  {
    let i = 0;
    let cd = '';
    let nm = '';
    if (chosen(c.senddoc_country_code)) {
      const m = lists.country.find((d) => d.code === c.senddoc_country_code);
      if (m) {
        i = ctx.resolveCountryId(c.senddoc_country_code);
        cd = m.code;
        nm = m.name;
      }
    }
    triple(j, 'sendDocCountryId', 'sendDocCountryCode', 'sendDocCountryName', i, cd, nm);
  }
  // (Java looks the document district and sub-district up in the lists of the CURRENT address here — kept)
  simple(c.senddoc_district_code, lists.district, 'sendDocDistrictId', 'sendDocDistrictCode', 'sendDocDistrictName');
  simple(c.senddoc_sub_district_code, lists.subDistrict, 'sendDocSubDistrictId', 'sendDocSubDistrictCode', 'sendDocSubDistrictName');

  put(j, 'ggwBranchId', null);
  put(j, 'ggwBranchCode', '');
  put(j, 'ggwBranchName', '');
  put(j, 'saleGroupId', null);
  put(j, 'saleGroupCode', '');
  put(j, 'saleGroupName', '');
  const sunInfo = buildSunInfo(c);

  ensureNotBlank(j, 'name', '-');
  ensureNotBlank(j, 'customerTel', '000');
  ensureNotBlank(j, 'idCard', '000');
  ensureNotBlank(j, 'customerType', CUSTOMER_TYPE_PERSON);
  ensureNotBlank(j, 'sex', '1');
  ensureNotBlank(j, 'currentAddress', '-');
  ensureNotBlank(j, 'referralRelate', '-');
  ensureTaxBranchForJuristic(j);
  ensureNotBlank(j, 'contactDate', today);
  ensureNotBlank(j, 'convenientTime', today);
  applySelectedSalePerson(j, params, ctx.salePersons);
  ensurePositiveInt(j, 'countryId', DEFAULT_COUNTRY_ID);
  ensurePositiveInt(j, 'currentCityId', DEFAULT_CITY_ID);
  ensurePositiveInt(j, 'marketingChanelId', DEFAULT_MARKETING_CHANEL_ID);
  ensurePositiveInt(j, 'salePersonId', DEFAULT_SALE_PERSON_ID);
  ensureUsageStatus(j);

  j['movementTypeId'] = leadParamOr(params, 'movementTypeId', DEFAULT_LEAD_MOVEMENTTYPE_ID);
  const putPositive = (key: string, value: number): void => {
    if (value > 0) j[key] = value;
  };
  putPositive('procedureGroupId', leadParamOr(params, 'procedureGroupId', 0));
  putPositive('assignToId', leadParamOr(params, 'assignToId', 0));
  if (ctx.sendEmployeeId) putPositive('employeeId', leadParamOr(params, 'employeeId', 0));
  j['confirmMerge'] = leadParamFlag(params, 'confirmMerge');
  return { body: j, sunInfo };
}

/** `applySelectedSalePerson`: the owner chosen in the lead modal (`assignToId`) is the sale person of the new customer */
export function applySelectedSalePerson(j: JObj, params: Readonly<Record<string, string>>, salePersons: readonly BasicBean[]): void {
  const selected = leadParamOr(params, 'assignToId', 0);
  if (selected <= 0) return;
  j['salePersonId'] = selected;
  const match = salePersons.find((b) => idOrZero(b) === selected);
  if (match) {
    j['salePersonCode'] = nz(match.code);
    j['salePersonName'] = nz(match.name);
  } else {
    j['salePersonCode'] = '';
    j['salePersonName'] = '';
  }
}

/** the body of `POST /leads` (`save_lead_query_Data_API`, used when the prospect call does not create the lead itself) */
export function buildLeadBody(c: ContractBean, params: Readonly<Record<string, string>>): JObj {
  const saleGroup = c.saleGroupId != null && c.saleGroupId > 0 ? c.saleGroupId : DEFAULT_LEAD_SALEGROUP_ID;
  const body: JObj = { prospectId: c.id, saleGroupId: saleGroup, movementTypeId: leadParamOr(params, 'movementTypeId', DEFAULT_LEAD_MOVEMENTTYPE_ID) };
  const proc = leadParamOr(params, 'procedureGroupId', 0);
  const assign = leadParamOr(params, 'assignToId', 0);
  const emp = leadParamOr(params, 'employeeId', 0);
  if (proc > 0) body['procedureGroupId'] = proc;
  if (assign > 0) body['assignToId'] = assign;
  if (emp > 0) body['employeeId'] = emp;
  return body;
}

/** `movementTypeUsesWorkflowStep(id)` over the answer of `GET /master-data/movement-types/LD` (Java: `fetchMovementTypesJson` hands over the `result`) */
export function movementTypeUsesWorkflowStep(text: string, movementTypeId: number): boolean {
  if (movementTypeId <= 0) return false;
  const root = parseJson(text);
  if (!isObj(root) || optInt(root, 'status', 0) !== 200 || !isArr(root['result'])) return false;
  for (const o of root['result'] as unknown[]) {
    if (isObj(o) && Number(o['id']) === movementTypeId) return o['usesWorkflowStep'] === true;
  }
  return false;
}

/** `findLeadIdByProspect` over the answer of the list of the newest leads: the id of the lead of this prospect, 0 when it is not there */
export function leadIdOfProspect(text: string, prospectId: number): number {
  if (text == null || !jtrim(text).startsWith('{')) return 0;
  const root = parseJson(text);
  if (!isObj(root)) return 0;
  const result = root['result'];
  const leads = isObj(result) ? result['leads'] : undefined;
  const items = isObj(leads) ? leads['items'] : undefined;
  if (!isArr(items)) return 0;
  for (const it of items) {
    if (isObj(it) && Number(it['prospectId']) === prospectId) return Number(it['id']) || 0;
  }
  return 0;
}

/** the swal scripts `textAlert` / `saveProspectAndLead` / `doUploadProspectImage` execute (strings exactly as the Java code builds them) */
export const SCRIPTS = {
  noId: "swal('ข้อผิดพลาด!', 'ไม่พบรหัสลูกค้า ไม่สามารถอัปเดตได้', 'error');",
  needName: "swal({ title: 'ข้อความแจ้งเตือน!', text: 'กรุณากรอกชื่อ-สกุล!', icon: 'warning', timer: 3000, buttons: false });",
  needStepGroup: "swal({ title: 'ข้อความแจ้งเตือน!', text: 'กรุณาเลือกกลุ่มขั้นตอน!', icon: 'warning', timer: 3000, buttons: false });",
  updated: (ctx: string): string =>
    "swal({ title: 'บันทึกสำเร็จ!', text: 'อัปเดต ลูกค้า เรียบร้อย!', icon: 'success', timer: 2500, buttons: false })" +
    `.then(function(){ if (window.gotoViewMode) { gotoViewMode(); } else { window.location.href = '${ctx}/pages/contracts.face?pid=1&page_id=1&act=2&action_type=list'; } });`,
  updateFailed: (err: string): string => `swal({ title: 'บันทึกไม่สำเร็จ!', text: 'อัปเดตข้อมูลไม่สำเร็จ: ${jsEscape(err)}', icon: 'error' });`,
  created: (ctx: string): string =>
    `swal({ title: 'บันทึกสำเร็จ!', text: 'สร้างลูกค้าเรียบร้อย!', icon: 'success', timer: 2500, buttons: false }).then(function(){ window.location.href = '${ctx}/pages/contracts.face?pid=1&page_id=1&act=2&action_type=list';});`,
  createFailed: (err: string): string => `swal({ title: 'บันทึกไม่สำเร็จ!', text: 'สร้างลูกค้าไม่สำเร็จ: ${jsEscape(err)}', icon: 'error' });`,
  createdWithLead: (ctx: string): string =>
    `swal({ title: 'บันทึกสำเร็จ!', text: 'สร้าง Lead และ ลูกค้า เรียบร้อย!', icon: 'success', timer: 2500, buttons: false }).then(function(){ window.location.href = '${ctx}/pages/lead.face?pid=1&page_id=3&act=3&action_type=list';});`,
  leadFailedAfterCreate: (err: string): string => `swal({ title: 'บันทึกไม่สำเร็จ!', text: 'สร้างลูกค้าสำเร็จ แต่สร้าง Lead ไม่สำเร็จ: ${jsEscape(err)}', icon: 'error' });`,
  openCreateLeadSuccess: 'if (window.openCreateLeadSuccess) { openCreateLeadSuccess(); }',
  duplicateRefused: (text: string): string => `swal({ title: 'ตรวจสอบข้อมูลซ้ำไม่สำเร็จ', text: '${jsEscape(text)}', icon: 'error' });`,
  duplicateStop: (text: string): string => `swal({ title: 'พบข้อมูลซ้ำ', text: '${jsEscape(text)}', icon: 'warning' });`,
  mergeConfirm: (err: string): string => `if (window.ctShowMergeConfirm) { ctShowMergeConfirm('${jsEscape(err)}'); }`,
  leadWarn: (err: string): string => `swal({ title: 'บันทึกลูกค้าแล้ว แต่สร้าง Lead ไม่สำเร็จ', text: '${jsEscape(err)}', icon: 'warning' });`,
  leadSaved: 'if (window.ctOnLeadSaved) { ctOnLeadSaved(); }',
  imageSaved: (src: string): string => `if(window.ctOnImageSaved){ctOnImageSaved('${jsEscape(src)}');}swal({title:'บันทึกรูปสำเร็จ!',icon:'success',timer:1500,buttons:false});`,
  imageFailed: (reason: string): string => `swal({title:'บันทึกรูปไม่สำเร็จ',text:'${jsEscape(reason)}',icon:'warning'});`,
} as const;

/**
 * `f:convertDateTime pattern="dd/MM/yyyy"` (`DateTimeConverter.getAsString`): null → '', a date (here its `yyyy-MM-dd`) → `dd/MM/yyyy`, any other String
 * unmodified — the view mode shows `'-'` for a missing date through the same converter.
 */
export function viewDate(v: string | null | undefined): string {
  if (v == null) return '';
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(v);
  return m ? `${m[3]}/${m[2]}/${m[1]}` : v;
}
