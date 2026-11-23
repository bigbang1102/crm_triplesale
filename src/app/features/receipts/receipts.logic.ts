/**
 * Business logic of the receipt (RV) screens that lived on the SERVER side of the Java app and that the pages depend on.
 *
 * Framework-free (the comparison harness loads it in Node, the mock uses it, and the live backend uses it as it is): every function
 * here is a line-by-line port of a Java method, named in its comment, and unit-tested in `receipts.logic.spec.ts`.
 *
 *   currencySymbol        RvDetailNormalizer.currencySymbol
 *   normalizeRvDetail     RvDetailNormalizer.normalizeResult (what makes ONE shape of GET /api/v1/rv/{id} for the modal, the PNG and the PDF)
 *   normalizeRvDetailJson RvDetailNormalizer.normalizeJson   (the same, on the TEXT of the answer — what RvApiService.detailJson returned)
 *   rvApproveReply        the answer of POST /api/v1/rv/approve as the page has to read it (RvApiService.approveJson comment)
 *
 * The Java code read the answer with the shaded org.json of PrimeFaces (`optString`, `optDouble`, `Double.valueOf` of a text …): the
 * helpers of `@core/live/org-json` reproduce those getters, so a value that is not typed as the service documents (a number sent as text,
 * a text sent as a number …) is read the way the servlet read it.
 */
import { isArr, isObj, javaParseDouble, optString, type JObj } from '@core/live/org-json';
import { javaTrim } from './java-text';

const AMOUNT_EPSILON = 0.005; // RvDetailNormalizer.AMOUNT_EPSILON — sums closer than this are the same money
const PAYMENT_AMOUNT_KEYS = ['medium_amount', 'amount'] as const; // RvDetailNormalizer.PAYMENT_AMOUNT_KEYS (read in this order)

/** `JSONObject.put(key, double)` refuses NaN / Infinity (a JSONException): the whole normalisation is then given up (see normalizeJson) */
class NonFiniteNumber extends Error {}
const putNumber = (o: JObj, key: string, n: number): void => {
  if (!Number.isFinite(n)) throw new NonFiniteNumber(key);
  o[key] = n;
};

/**
 * `JSONObject.optDouble(key, def)`: a number, or a TEXT that `Double.parseDouble` takes (no thousands separator: "27,300.00" is not a number
 * here — only the payment amounts accept it, see toDouble); anything else is the default.
 */
function optDouble(o: JObj, key: string, def: number): number {
  const v = o[key];
  if (typeof v === 'number') return v;
  if (typeof v === 'string') return javaParseDouble(v) ?? def;
  return def;
}

/**
 * RvDetailNormalizer.toDouble — a number, or a string such as "27300.00" / "27,300.00" (every comma is dropped); anything else null.
 * (A boolean, an object or an array has a `String.valueOf` that `Double.valueOf` refuses, so it is null as well.)
 */
function toDouble(raw: unknown): number | null {
  if (typeof raw === 'number') return raw;
  if (typeof raw !== 'string') return null;
  const text = javaTrim(raw).replace(/,/g, '');
  if (!text) return null;
  return javaParseDouble(text) ?? null;
}

/** RvDetailNormalizer.readAmount — the first known amount field that has a value (0 is a real value); null = none was sent */
function readAmount(item: JObj): number | null {
  for (const key of PAYMENT_AMOUNT_KEYS) {
    if (!Object.hasOwn(item, key) || item[key] === null) continue;
    const v = toDouble(item[key]);
    if (v !== null) return v;
  }
  return null;
}

/** RvDetailNormalizer.currencySymbol — THB (or none) = ฿; any other currency is written with its code so "USD 1,000.00" cannot be misread */
export function currencySymbol(currencyCode: string | null | undefined): string {
  const code = javaTrim(currencyCode ?? '').toUpperCase();
  return !code || code === 'THB' ? '฿' : code + ' ';
}

/** RvDetailNormalizer.fillRemarkFromDescription — the list calls the remark "description", the create call "remark": the detail may use either */
function fillRemarkFromDescription(result: JObj): void {
  if (javaTrim(optString(result, 'remark', '')) !== '') return;
  const description = javaTrim(optString(result, 'description', ''));
  if (description !== '') result['remark'] = description;
}

/** RvDetailNormalizer.normalizePaymentItems — the items are copied first (the caller's object is never changed) */
function normalizePaymentItems(result: JObj): void {
  const raw = result['payment_items'];
  if (!isArr(raw)) return; // optJSONArray: only an array
  const items = raw.map((item) => (isObj(item) ? { ...item } : item));
  result['payment_items'] = items;
  let total = 0;
  for (const item of items) {
    if (!isObj(item)) continue; // optJSONObject: an element that is not an object is left alone
    const amount = readAmount(item);
    item['amount_available'] = amount !== null;
    putNumber(item, 'amount', amount ?? 0);
    if (amount !== null) total += amount;
  }
  // the bill is the net amount after VAT (what the create form uses to work out the change), the amount to pay when that is missing
  let billTotal = optDouble(result, 'netamount_after_vat', 0);
  if (billTotal <= 0) billTotal = optDouble(result, 'pay_amount', 0);
  const change = total - billTotal;
  putNumber(result, 'payments_total', total);
  putNumber(result, 'change_amount', change > AMOUNT_EPSILON ? change : 0);
}

/** RvDetailNormalizer.normalizeResult — fills the fields the screens read; may throw NonFiniteNumber */
function normalizeResult(result: JObj): void {
  result['currency_symbol'] = currencySymbol(optString(result, 'currency_code', ''));
  fillRemarkFromDescription(result);
  normalizePaymentItems(result);
}

/**
 * RvDetailNormalizer.normalizeJson on an already parsed reply — the fields the screens read, whatever the backend called them:
 *   currency_symbol           ฿ / "USD "
 *   remark                    filled from `description` when the backend only sent that (the list calls the remark "description")
 *   payment_items[].amount    always a number (`medium_amount` first, then `amount`); `amount_available: false` = the backend sent none
 *   payments_total            what was received in total
 *   change_amount             received − bill (0 when nothing is to be given back)
 * A reply without an object `result` is returned as it is. The input is not modified.
 */
export function normalizeRvDetail<T extends object>(reply: T): T {
  const result = (reply as { result?: unknown } | null)?.result;
  if (!isObj(result)) return reply;
  const out: JObj = { ...result };
  try {
    normalizeResult(out);
  } catch (e) {
    if (e instanceof NonFiniteNumber) return reply; // (the Java code sent the raw answer on any exception)
    throw e;
  }
  return { ...reply, result: out };
}

/**
 * RvDetailNormalizer.normalizeJson — on the TEXT of the answer of `GET /rv/{id}`: text that is not a JSON object, an answer without an
 * object `result`, or a normalisation that throws is returned as it came.
 */
export function normalizeRvDetailJson(rawJson: string): string {
  if (!javaTrim(rawJson).startsWith('{')) return rawJson;
  let root: unknown;
  try {
    root = JSON.parse(rawJson);
  } catch {
    return rawJson;
  }
  if (!isObj(root) || !isObj(root['result'])) return rawJson;
  const normalized = normalizeRvDetail(root);
  return normalized === root ? rawJson : JSON.stringify(normalized);
}

/** the inner `result` of POST /api/v1/rv/approve — the backend answers HTTP 200 always; the page decides from these fields */
export interface RvApproveResult {
  result: boolean;
  status: number;
  hopDone?: boolean;
  message: string;
  txno?: string;
}

/**
 * What the approve call answers for a receipt in a given state (RvApiService.approveJson):
 *   new1                      → approved now (the flow engine moves it to active1): hopDone = true
 *   new · waitToFlow          → the call went through but nothing was approved (the scheduler has not pushed it to new1 yet): hopDone = false
 *   ActionWaitProcess · active* → already approved (the flow is still running / finished): hopDone = false
 *   cancel                    → nothing to approve: hopDone = false
 *   not found                 → result = false, status 404 ("process instance not found")
 */
export function rvApproveReply(status: string | null, txno: string): RvApproveResult {
  if (status === null) return { result: false, status: 404, message: `ไม่พบ process instance ของ RV: ${txno}`, txno };
  if (status === 'new1') return { result: true, status: 200, hopDone: true, message: 'อนุมัติสำเร็จ', txno };
  if (status === 'new' || status === 'waitToFlow') return { result: true, status: 200, hopDone: false, message: 'ยังไม่ถึงขั้นอนุมัติ: สถานะยังไม่เป็น new1 (รอระบบประมวลผล)', txno };
  if (status === 'cancel') return { result: true, status: 200, hopDone: false, message: 'เอกสารถูกยกเลิกแล้ว ไม่สามารถอนุมัติได้', txno };
  return { result: true, status: 200, hopDone: false, message: 'เอกสารนี้อนุมัติไปแล้ว', txno };
}
