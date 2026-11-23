/**
 * The logic of `Sales_DocumentView` / `Sales_DocumentBean` / `SalesDocumentListServlet` / `SalesDocumentListService` that decides what the
 * supporting-document screens show and send — ported function by function so that a reader can put the two side by side. Pure and
 * framework-free (the comparison harness and the specs load it into Node): no Angular, no I/O, no clock.
 *
 * Where the port differs on purpose it says so:
 *   - no `/docproxy` servlet: `AttachUrl.proxySrc` is the (collapsed) address itself (see core/live/prospect-list.live.ts, the same decision);
 *   - dates are `yyyy-MM-dd` strings where Java held `java.util.Date` (`p:calendar`); `dd/MM/yyyy` is how they are shown.
 */
import { collapse } from '@core/live/prospect-payload.live';
import type { FacesMessage } from '../../shared/primefaces/faces-message';
import type { SupportingFormType } from './supporting-doc-types';

/* ================================================================================================ rows of the list */

/** a row as `SalesDocumentListServlet.normalizeRow` answers it (what `sales_doc_list.js` draws) — the contract of the list */
export interface SupportingDocRow {
  id: number;
  quotationNo: string;
  /** ISO `yyyy-MM-dd` as the backend wrote it ('' when it has none) */
  quotationDate: string;
  customerCode: string;
  customerName: string;
  /** the address of the customer's picture ('' = the default avatar) */
  customerAvatar: string;
  salesperson: string;
  receiveDate: string;
  status: string;
}

export type RawRecord = Record<string, unknown>;

/** `JSONObject.optString(key, "")`: a string as it is, a number / boolean as text, null / missing / an object → '' (org.json would print the object; the backend sends scalars) */
export function optString(o: RawRecord | null | undefined, key: string): string {
  const v = o?.[key];
  if (v === null || v === undefined) return '';
  if (typeof v === 'string') return v;
  if (typeof v === 'number' || typeof v === 'boolean') return String(v);
  return '';
}

/** `JSONObject.optInt(key)`: a number, or a numeric string, else 0 */
export function optInt(o: RawRecord | null | undefined, key: string): number {
  const v = o?.[key];
  if (typeof v === 'number') return Number.isFinite(v) ? Math.trunc(v) : 0;
  if (typeof v === 'string') {
    const n = Number.parseInt(v.trim(), 10);
    return Number.isNaN(n) ? 0 : n;
  }
  return 0;
}

/** `Sales_DocumentView.optStr`: two spellings of one field (camelCase of the new backend / snake_case of the old), the first that is not empty */
export function optStr(o: RawRecord, primaryKey: string, fallbackKey: string): string {
  const v = optString(o, primaryKey);
  return v === '' ? optString(o, fallbackKey) : v;
}

/** `SalesDocumentListServlet.normalizeRow` (without the docproxy: the address itself) */
export function normalizeRow(q: RawRecord): SupportingDocRow {
  let receiver = optStr(q, 'receiveByName', 'receive_by_name');
  if (receiver === '') receiver = optStr(q, 'createdBy', 'created_by');
  return {
    id: optInt(q, 'id'),
    quotationNo: optStr(q, 'txNo', 'txno'),
    quotationDate: optStr(q, 'txDate', 'txdate'),
    customerCode: optStr(q, 'customerCode', 'customer_code'),
    customerName: optStr(q, 'customerName', 'customer_name'),
    customerAvatar: collapse(optStr(q, 'customerAvatar', 'customer_avatar')),
    salesperson: receiver === '0' || receiver === '' ? '-' : receiver,
    receiveDate: optStr(q, 'receiveDate', 'receive_date'),
    status: optString(q, 'status'),
  };
}

/** `Sales_DocumentBean.getStatusDisplay` (= `sunStatusText` = `statusDisplay` of sales_doc_list.js) */
export function statusDisplay(status: string | null | undefined): string {
  switch (status) {
    case 'ACTIVE':
      return 'สำเร็จ';
    case 'WAIT_APPROVE':
      return 'รออนุมัติ';
    case 'REJECTED':
      return 'ไม่อนุมัติ';
    case 'new':
      return 'สร้างใหม่';
    case 'cancel':
      return 'ยกเลิก';
    default:
      return status ?? '';
  }
}

/** `Sales_DocumentBean.getStatusClass` */
export function statusClass(status: string | null | undefined): string {
  switch (status) {
    case 'ACTIVE':
      return 'status-success';
    case 'REJECTED':
    case 'cancel':
      return 'status-rejected';
    case 'new':
      return 'status-new';
    default:
      return 'status-pending'; // WAIT_APPROVE and anything else (also null)
  }
}

/** the badge rule of the page of the credit-application list (see `SupportingDocType.legacyStatusBadge`) */
export function statusClassLegacy(status: string | null | undefined): string {
  return status === 'ACTIVE' ? 'status-success' : status === 'WAIT_APPROVE' ? 'status-pending' : 'status-rejected';
}

const two = (n: number): string => String(n).padStart(2, '0');

/**
 * `parseDocDate(s)` then `Sales_DocumentBean.getFormattedQuotationDate` (`dd/MM/yyyy`): the date of a `yyyy-MM-dd…` text, '' when it is
 * empty or not a date (`SimpleDateFormat` is lenient about a short month / day and ignores what follows the day).
 */
export function formatDocDate(s: string | null | undefined): string {
  const m = /^\s*(\d{4})-(\d{1,2})-(\d{1,2})/.exec(s ?? '');
  if (!m) return '';
  const [y, mo, d] = [Number(m[1]), Number(m[2]), Number(m[3])];
  if (mo < 1 || mo > 12 || d < 1 || d > 31) return '';
  return `${two(d)}/${two(mo)}/${y}`;
}

/** `isoToView` of sales_doc_list.js: the rows the script adds show `dd/MM/yyyy` for `y-m-d` and the text as it is for anything else */
export function isoToView(iso: string | null | undefined): string {
  if (!iso) return '';
  const p = String(iso).split('-');
  return p.length === 3 ? `${p[2]}/${p[1]}/${p[0]}` : String(iso);
}

/** `yyyy-MM-dd` of the date part of a text, '' when there is none (what `p:calendar` holds as a `Date`) */
export function docDate(s: string | null | undefined): string {
  const m = /^\s*(\d{4})-(\d{1,2})-(\d{1,2})/.exec(s ?? '');
  return m ? `${m[1]}-${two(Number(m[2]))}-${two(Number(m[3]))}` : '';
}

/** `dd/MM/yyyy` of a `yyyy-MM-dd` ('' when empty): the pattern of `p:calendar` and of `sd_field_ro`'s `dateVal` */
export const viewDate = (iso: string | null | undefined): string => formatDocDate(iso);

/** `yyyy-MM-dd` of a `dd/MM/yyyy` text (what the user typed into a `p:calendar`), '' when it is not a date */
export function parseViewDate(text: string | null | undefined): string {
  const m = /^\s*(\d{1,2})\/(\d{1,2})\/(\d{4})\s*$/.exec(text ?? '');
  if (!m) return '';
  const [d, mo, y] = [Number(m[1]), Number(m[2]), Number(m[3])];
  const dt = new Date(Date.UTC(y, mo - 1, d));
  return dt.getUTCFullYear() === y && dt.getUTCMonth() === mo - 1 && dt.getUTCDate() === d ? `${y}-${two(mo)}-${two(d)}` : '';
}

/* ================================================================================================ filter + pager (the bean) */

/** the six boxes of the filter panel (`filterDocNo` …); `null` / '' = not used */
export interface SupportingDocFilters {
  docNo: string;
  customerCode: string;
  customerName: string;
  responsible: string;
  status: string;
  docDate: string;
}
export const NO_FILTERS: SupportingDocFilters = { docNo: '', customerCode: '', customerName: '', responsible: '', status: '', docDate: '' };

const used = (f: string | null | undefined): f is string => f !== null && f !== undefined && f.trim() !== '';

/** `Sales_DocumentView.applyFilters` after the rows were fetched: a row passes when every used box is contained in its field (case-insensitive; the date is a plain substring of `dd/MM/yyyy`) */
export function filterRows(rows: readonly SupportingDocRow[], f: SupportingDocFilters): SupportingDocRow[] {
  return rows.filter((r) => {
    if (used(f.docNo) && !r.quotationNo.toLowerCase().includes(f.docNo.toLowerCase())) return false;
    if (used(f.customerCode) && !r.customerCode.toLowerCase().includes(f.customerCode.toLowerCase())) return false;
    if (used(f.customerName) && !r.customerName.toLowerCase().includes(f.customerName.toLowerCase())) return false;
    if (used(f.responsible) && !r.salesperson.toLowerCase().includes(f.responsible.toLowerCase())) return false;
    if (used(f.status) && !statusDisplay(r.status).toLowerCase().includes(f.status.toLowerCase())) return false;
    if (used(f.docDate) && !formatDocDate(r.quotationDate).includes(f.docDate)) return false;
    return true;
  });
}

/** `getTotalPages` */
export const totalPages = (count: number, perPage: number): number => Math.ceil(count / perPage);

/** `getPagedQuotationList`: the rows of `page` (clamped to 1 … max(1, total pages)) and the page it is */
export function pageOf<T>(rows: readonly T[], page: number, perPage: number): { rows: T[]; page: number } {
  if (!rows.length) return { rows: [], page };
  const maxPage = Math.max(1, totalPages(rows.length, perPage));
  const p = Math.min(Math.max(page, 1), maxPage);
  const from = (p - 1) * perPage;
  return { rows: rows.slice(from, Math.min(from + perPage, rows.length)), page: p };
}

/** `getPageInfo`: "1-20 จาก 53" / "0 รายการ" */
export function pageInfo(count: number, page: number, perPage: number): string {
  if (count === 0) return '0 รายการ';
  return `${(page - 1) * perPage + 1}-${Math.min(page * perPage, count)} จาก ${count}`;
}

/** the id order of `viewQueryDataAPI` (newest first = the greater id first; a missing id is 0) */
export const newestFirst = (a: SupportingDocRow, b: SupportingDocRow): number => b.id - a.id;

/** the paging of `SalesDocumentListService.fetchPage`: page ≥ 1, perPage clamped to 1 … 100 (a missing / zero one is 20) */
export function listPaging(page: number, perPage: number): { page: number; perPage: number } {
  return { page: page < 1 ? 1 : page, perPage: perPage < 1 ? 20 : Math.min(perPage, 100) };
}

/* ================================================================================================ formType of the API */

/** `triplesale.api.documents.formtype.style` = `new` sends PascalCase, anything else the old lowercase spelling (Java: `apiFormType`) */
export function apiFormType(formType: SupportingFormType, apiFormTypeNew: string, style: string | null | undefined): string {
  return String(style ?? '').toLowerCase() === 'new' ? apiFormTypeNew : formType;
}

/* ================================================================================================ the form (detail) */

/** one attached file (`Sales_DocumentView.DocumentFile`) */
export interface SupportingDocFile {
  filename: string;
  contentType: string;
  size: number;
  description: string;
  /** the address of the file at the file server (empty = only in the browser, not sent to the backend yet) */
  remoteUrl: string;
  /** the bytes of a file that was just chosen (not persisted yet) */
  content?: Blob;
}

/** what `loadDetailAPI` leaves in the bean — the whole state of the form */
export interface SupportingDocDetail {
  /** `sunDetail`: text fields; formsun's borrower / coBorrower / guarantor are prefixed `b_` / `c_` / `g_` */
  fields: Record<string, string>;
  txDate: string;
  refDate: string;
  receiveDate: string;
  files: SupportingDocFile[];
  /** the document as the backend answered (`sunRaw`), kept to send back whole */
  raw: RawRecord | null;
  /** the id of the document being edited (`sunDocId`), '' for a new one */
  docId: string;
}

export const EMPTY_DETAIL: SupportingDocDetail = { fields: {}, txDate: '', refDate: '', receiveDate: '', files: [], raw: null, docId: '' };

/** `putAllPrefixed`: every field of a sub-form object under a prefix (values as text: `optString`) */
export function prefixed(obj: RawRecord | null | undefined, prefix: string): Record<string, string> {
  const out: Record<string, string> = {};
  if (!obj) return out;
  for (const k of Object.keys(obj)) out[prefix + k] = optString(obj, k);
  return out;
}

/** the file name of an attachment path (`attachFile`): after the last `/` or `\` */
export function fileNameOf(path: string): string {
  const slash = Math.max(path.lastIndexOf('/'), path.lastIndexOf('\\'));
  return slash >= 0 ? path.slice(slash + 1) : path;
}

/**
 * `loadDetailAPI` without the lookups: the fields, the dates and the files of the document `r` (`result` of `GET /documents/{id}`).
 * `customerId` / `receiveById` need the prospect and employee lists — the backend adapter fills them (`resolveDetail`).
 */
export function detailOf(r: RawRecord, formType: SupportingFormType, docId: string): SupportingDocDetail {
  const fields: Record<string, string> = {
    txNo: optString(r, 'txNo'),
    statusText: statusDisplay(optString(r, 'status')),
    referenceDocNo: optString(r, 'referenceDocNo'),
    remark: optString(r, 'remark'),
    customerName: optString(r, 'customerName'),
    customerCode: optString(r, 'customerCode'),
    receiveByName: optString(r, 'receiveByName'),
    receiveByCode: optString(r, 'receiveByCode'),
    description: optString(r, 'description'),
    existsTxNo: optString(r, 'existsTxNo'),
    flowRefDocType: optString(r, 'flowRefDocType'),
    flowRefDocNo: optString(r, 'flowRefDocNo'),
  };
  if (formType === 'formsun') {
    const formsun = (r['formsun'] ?? null) as RawRecord | null;
    Object.assign(fields, prefixed((formsun?.['borrower'] ?? null) as RawRecord | null, 'b_'));
    Object.assign(fields, prefixed((formsun?.['coBorrower'] ?? null) as RawRecord | null, 'c_'));
    Object.assign(fields, prefixed((formsun?.['guarantor'] ?? null) as RawRecord | null, 'g_'));
  }
  const files: SupportingDocFile[] = [];
  const attach = r['attachItems'];
  if (Array.isArray(attach)) {
    attach.forEach((a, i) => {
      if (!a || typeof a !== 'object') return;
      const path = collapse(optString(a as RawRecord, 'attachFile'));
      const name = fileNameOf(path);
      files.push({ filename: name === '' ? `เอกสาร ${i + 1}` : name, contentType: '', size: 0, description: optString(a as RawRecord, 'description'), remoteUrl: path });
    });
  }
  return {
    fields,
    txDate: docDate(optString(r, 'txDate')),
    refDate: docDate(optString(r, 'referenceDocDate')),
    receiveDate: docDate(optString(r, 'receiveDate')),
    files,
    raw: r,
    docId,
  };
}

/** `loadDetailAPI`: the files that are only in the browser store (not at the backend by name) follow the ones the backend lists */
export function mergeLocalFiles(backend: readonly SupportingDocFile[], local: readonly SupportingDocFile[] | undefined): SupportingDocFile[] {
  const names = new Set(backend.map((f) => f.filename));
  return [...backend, ...(local ?? []).filter((f) => !names.has(f.filename))];
}

/** `normalizePersonName`: trimmed, runs of white space (nbsp too) folded, lower-case, one leading title (นางสาว · น.ส. · นาย · นาง · คุณ · mr · mrs · ms) cut */
export function normalizePersonName(s: string | null | undefined): string {
  if (!s) return '';
  let n = s.replace(/\u00a0/g, ' ').trim().replace(/\s+/g, ' ').toLowerCase();
  for (const t of ['นางสาว', 'น.ส.', 'นาย', 'นาง', 'คุณ', 'mrs.', 'mrs ', 'mr.', 'mr ', 'ms.', 'ms ']) {
    if (n.startsWith(t) && n.length > t.length) {
      n = n.slice(t.length).trim();
      break;
    }
  }
  return n;
}

/** an item of the "ลูกค้า" / "ผู้รับเอกสาร" lists (`BasicBean`: id / code / name) */
export interface BasicItem {
  id: number;
  code: string;
  name: string;
}

/** `selectReceiverBySalePersonName`: the employee whose normalised name equals the customer's sale person (the first one on a tie), undefined for none */
export function receiverBySalePerson(salePersonName: string, employees: readonly BasicItem[]): BasicItem | undefined {
  const key = normalizePersonName(salePersonName);
  if (key === '') return undefined;
  return employees.find((b) => key === normalizePersonName(b.name));
}

/** `listProspectBean` / `listReceiveByBean` entry from a master-data row (`id`, `code`, `name` or `nameTh`) */
export function basicItem(o: RawRecord): BasicItem {
  return { id: optInt(o, 'id'), code: optString(o, 'code'), name: o['name'] !== undefined && o['name'] !== null ? optString(o, 'name') : optString(o, 'nameTh') };
}

/** the label of a customer in the dropdown (`#{_pros.code} #{_pros.name}`) */
export const prospectLabel = (b: BasicItem): string => `${b.code} ${b.name}`;
/** the label of an employee in the dropdown (`#{empty _emp.name ? _emp.code : _emp.name}`) */
export const employeeLabel = (b: BasicItem): string => (b.name === '' ? b.code : b.name);

/* ================================================================================================ save */

/** a `FacesMessage` of the growl (the type lives with the growl: shared/primefaces/faces-message.ts) */
export type { FacesMessage } from '../../shared/primefaces/faces-message';

/** `saveDocument`'s checks before anything is sent; undefined = go on */
export function checkBeforeSave(a: { isUpdate: boolean; customerId: string; receiveDate: string }): FacesMessage | undefined {
  if (!a.isUpdate && a.customerId.trim() === '') return { severity: 'warn', summary: 'ข้อความแจ้งเตือน', detail: 'กรุณาเลือกลูกค้า' };
  if (a.receiveDate === '') return { severity: 'warn', summary: 'ข้อความแจ้งเตือน', detail: 'กรุณาเลือกวันที่รับเอกสาร' };
  return undefined;
}

/** fields the backend manages itself; an update does not send them back (`saveDocument`: `strip`) */
export const STRIP_ON_UPDATE = ['id', 'txNo', 'status', 'createBy', 'customerCode', 'customerName', 'customerAvatar', 'receiveByCode', 'receiveByName', 'receiveByAvatar', 'attachItems'] as const;

/** `Integer.parseInt(x.trim())` when it is one, else the trimmed text (what `saveDocument` puts for ids) */
const intOrText = (x: string): number | string => {
  const t = x.trim();
  return /^[+-]?\d+$/.test(t) && Number.isSafeInteger(Number(t)) ? Number(t) : t;
};

/** `overrideSubFormFromMap`: every `prefix…` field written back (prefix cut) into `formsun[subKey]`, over what the backend sent */
function overrideSubForm(formsun: RawRecord, subKey: string, prefix: string, fields: Record<string, string>): void {
  let sub = formsun[subKey] as RawRecord | undefined | null;
  if (!sub || typeof sub !== 'object') {
    sub = {};
    formsun[subKey] = sub;
  }
  for (const [k, v] of Object.entries(fields)) if (k.startsWith(prefix)) sub[k.slice(prefix.length)] = v;
}

/**
 * The body of `POST /documents` (new) or `PUT /documents/{id}` (update) — `Sales_DocumentView.saveDocument`.
 * An update starts from a deep copy of what the backend sent (`raw`: the PUT replaces the document, so what the form does not show must
 * go back) without the fields the backend owns, then the form's values are laid over it.
 */
export function buildSaveBody(a: {
  formType: SupportingFormType;
  apiFormType: string;
  isUpdate: boolean;
  raw: RawRecord | null;
  fields: Record<string, string>;
  txDate: string;
  refDate: string;
  receiveDate: string;
}): RawRecord {
  const get = (k: string): string => a.fields[k] ?? '';
  let body: RawRecord = {};
  if (a.isUpdate && a.raw) {
    body = JSON.parse(JSON.stringify(a.raw)) as RawRecord;
    for (const k of STRIP_ON_UPDATE) delete body[k];
  }
  body['formType'] = a.apiFormType;
  if (a.txDate !== '') body['txDate'] = a.txDate;
  if (a.refDate !== '') body['referenceDocDate'] = a.refDate;
  if (a.receiveDate !== '') body['receiveDate'] = a.receiveDate;
  body['remark'] = get('remark');
  body['referenceDocNo'] = get('referenceDocNo');
  body['description'] = get('description');
  body['existsTxNo'] = get('existsTxNo');
  body['flowRefDocType'] = get('flowRefDocType');
  body['flowRefDocNo'] = get('flowRefDocNo');

  let recv = get('receiveById');
  if (recv.trim() === '') recv = get('receiveBy'); // the binding of the old page
  if (recv.trim() !== '') body['receiveById'] = intOrText(recv);
  else if (a.isUpdate) body['receiveById'] = null; // cleared on purpose: the old value must not stay

  const cust = get('customerId');
  if (cust.trim() !== '') body['customerId'] = intOrText(cust);

  if (a.formType === 'formsun') {
    let formsun = body['formsun'] as RawRecord | undefined | null;
    if (!formsun || typeof formsun !== 'object') {
      formsun = {};
      body['formsun'] = formsun;
    }
    overrideSubForm(formsun, 'borrower', 'b_', a.fields);
    overrideSubForm(formsun, 'coBorrower', 'c_', a.fields);
    overrideSubForm(formsun, 'guarantor', 'g_', a.fields);
  }
  return body;
}

/** the outcome of the answer to the save (`status` of the envelope, `result.id` / `result.txNo`) */
export function saveOutcome(text: string): { ok: boolean; status: number; id: string; txNo: string } {
  let status = -1;
  let id = '';
  let txNo = '';
  try {
    const root = text ? (JSON.parse(text) as RawRecord) : null;
    if (root && typeof root === 'object') {
      const st = root['status'];
      status = typeof st === 'number' ? Math.trunc(st) : typeof st === 'string' && /^\s*[+-]?\d+\s*$/.test(st) ? Number(st) : -1; // optInt("status", -1)
      if (status === 200) {
        const result = root['result'] as RawRecord | undefined;
        if (result && typeof result === 'object') {
          txNo = optString(result, 'txNo');
          id = optString(result, 'id');
        }
      }
    }
  } catch {
    /* the text is not JSON: the save failed */
  }
  return { ok: status === 200, status, id, txNo };
}

/* ================================================================================================ files */

/** the extensions the upload accepts (`p:fileUpload allowTypes` of the forms) */
export const UPLOAD_ALLOW = /(\.|\/)(pdf|docx?|xlsx?|pptx?|csv|txt|jpe?g|png|gif|bmp|webp|heic|tiff?|zip|rar|7z)$/i;
/** the text of the "type not allowed" alert (`SD_UPLOAD_ALLOW_TYPES`) */
export const UPLOAD_ALLOW_TEXT = 'PDF, DOC(X), XLS(X), PPT(X), CSV, TXT, JPG, JPEG, PNG, GIF, BMP, WEBP, HEIC, TIF(F), ZIP, RAR, 7Z';
