/**
 * The pure half of the live receipt backend: ports of the text handling of `RvApiService` — what it made of the answers of the REST
 * service before the servlet wrote them to the page (`safeJson`, `parseOrWrap`, `rvLeadsJson` / `materialsJson` row mapping …).
 *
 * No Angular and no I/O: every function takes the text of an answer and gives back what the Java code would have put into the JSON it
 * sent to the page. The Java code read the answers with the shaded org.json of PrimeFaces: `@core/live/org-json` reproduces its getters.
 */
import { isArr, isObj, optLong, optString, orgGetDouble, parseJson, type JObj } from '@core/live/org-json';
import { javaTrim } from './java-text';

/** the message of the error envelope the servlet writes when the service gave nothing usable */
export const REST_FAIL_MESSAGE = 'backend ไม่ตอบหรือ response ไม่ใช่ JSON';

/** `RvApiService.safeJson`: an answer that does not start with `{` (no answer, not 200, an HTML page, an array …) becomes the 502 envelope */
export function safeJson(raw: string | null): string {
  if (raw != null && javaTrim(raw).startsWith('{')) return raw;
  return JSON.stringify({ status: 502, message: REST_FAIL_MESSAGE });
}

/**
 * `RvApiService.parseOrWrap`: the answer as an object when it is one; otherwise the 502 envelope with the text that came
 * (`raw`, '' when there was none) — so the page can still show what the service said
 */
export function parseOrWrap(raw: string | null): JObj {
  if (raw != null && javaTrim(raw).startsWith('{')) {
    const o = parseJson(raw);
    if (isObj(o)) return o;
  }
  return { status: 502, message: REST_FAIL_MESSAGE, raw: raw ?? '' };
}

/**
 * `RvApiService.rvLeadsJson`, the rows: `result.content[]` of `GET /rv/leads` → `{leadId, code, name, txNo, employeeName, leadStatus}`;
 * a row without a `prospectCode` is skipped. Throws where `new JSONObject(text)` threw (no answer / not an object): the caller makes it `[]`.
 */
export function leadRows(text: string): JObj[] {
  const resp = parseJson(text);
  if (!isObj(resp)) throw new Error('not a JSONObject');
  const result = resp['result'];
  const content = isObj(result) ? result['content'] : undefined;
  const out: JObj[] = [];
  if (!isArr(content)) return out;
  for (const item of content) {
    if (!isObj(item)) continue;
    const code = javaTrim(optString(item, 'prospectCode', ''));
    if (code === '') continue;
    out.push({
      leadId: optLong(item, 'id', 0),
      code,
      name: optString(item, 'prospectName', code),
      txNo: optString(item, 'leadTxNo', ''),
      employeeName: optString(item, 'employeeName', ''),
      leadStatus: optString(item, 'leadStatus', ''),
    });
  }
  return out;
}

/** what one page of `master-data/materials` gave: the new rows, and whether the scan goes on */
export interface MaterialsPage {
  /** `false` = the scan ends here (an empty page, no new code, a short page) */
  more: boolean;
  /** `true` = the answer was not usable (`new JSONObject` threw, a price that is not a finite number): the scan is abandoned, not cached */
  failed: boolean;
}

/**
 * `RvApiService.materialsJson`, one page: adds the rows of `result[]` that have a new `code` to `into` as `{code, name, salePrice}`
 * (`salePrice` = `optDouble("standardSalePrice", 0)`); `seen` is the set of codes so far.
 */
export function addMaterialsPage(text: string, pageSize: number, seen: Set<string>, into: JObj[]): MaterialsPage {
  const resp = parseJson(text);
  if (!isObj(resp)) return { more: false, failed: true }; // new JSONObject("") of a failed call
  const items = resp['result'];
  if (!isArr(items) || items.length === 0) return { more: false, failed: false };
  let added = 0;
  for (const item of items) {
    if (!isObj(item)) continue;
    const code = javaTrim(optString(item, 'code', ''));
    if (code === '' || seen.has(code)) continue;
    seen.add(code);
    const price = orgGetDouble(item['standardSalePrice']) ?? 0;
    // JSONObject.put(key, double) refuses NaN / Infinity: the Java scan was abandoned there (the code was already remembered)
    if (!Number.isFinite(price)) return { more: false, failed: true };
    into.push({ code, name: optString(item, 'name', code), salePrice: price });
    added++;
  }
  return { more: !(added === 0 || items.length < pageSize), failed: false };
}

/** `RvApiService.fetchTotal`, the number: `result.total` of the answer, -1 when there is none or the answer is not a JSON object */
export function totalOf(text: string): number {
  const resp = parseJson(text);
  if (!isObj(resp)) return -1;
  const result = resp['result'];
  return isObj(result) ? optLong(result, 'total', -1) : -1;
}

/** `RvApiService.fetchAttachCount`, the number: how many `result.attach_items` the receipt has, -1 when it has none / the answer is no object */
export function attachCountOf(text: string): number {
  const resp = parseJson(text);
  if (!isObj(resp)) return -1;
  const result = resp['result'];
  const attachments = isObj(result) ? result['attach_items'] : undefined;
  return isArr(attachments) ? attachments.length : -1;
}

/** `new JSONObject(body).optString("remark", "").trim()` of a create request; '' when the body is not a JSON object */
export function remarkOf(body: string): string {
  const o = parseJson(body);
  return isObj(o) ? javaTrim(optString(o, 'remark', '')) : '';
}
