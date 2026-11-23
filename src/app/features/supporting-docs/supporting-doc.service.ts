/**
 * The server side of the supporting-document screens — `Sales_DocumentView` (the JSF bean), `SalesDocumentListService` and
 * `SalesDocumentListServlet` — over the REST calls of `SupportingDocApi`. One class for the mock backend and the live one: they differ only
 * in who answers the REST calls. Framework-free (the comparison harness runs this very code as "the server" of the Java replica).
 *
 * The state of the bean (`@ViewScoped`) lives in the hosts; this class holds none of it, except the store of the files that were attached
 * in the browser (Java: the HttpSession attribute `salesDocAttachStore` that `DocAttachServlet` served).
 */
import type { SupportingDocApi } from './supporting-doc-backend';
import {
  type BasicItem,
  type FacesMessage,
  type RawRecord,
  type SupportingDocDetail,
  type SupportingDocFile,
  type SupportingDocRow,
  apiFormType,
  basicItem,
  buildSaveBody,
  checkBeforeSave,
  detailOf,
  listPaging,
  mergeLocalFiles,
  newestFirst,
  normalizeRow,
  optInt,
  optString,
  receiverBySalePerson,
  saveOutcome,
} from './supporting-doc.logic';
import type { SupportingDocType } from './supporting-doc-types';

/** `Sales_DocumentView.itemsPerPage`, `PROSPECT_SEARCH_PER_PAGE`, `DOC_LIST_PAGE_SIZE`, `DOC_LIST_MAX_PAGES` */
export const ITEMS_PER_PAGE = 20;
export const PROSPECT_SEARCH_PER_PAGE = 20;
export const DOC_LIST_PAGE_SIZE = 100;
export const DOC_LIST_MAX_PAGES = 50;

/** one page of the list as `SalesDocumentListServlet` answers it */
export interface ListPage {
  items: SupportingDocRow[];
  total: number;
  page: number;
  perPage: number;
}

/** the files attached in this browser, by document id (Java: the session's `salesDocAttachStore`) */
export class AttachStore {
  private readonly map = new Map<string, SupportingDocFile[]>();
  put(id: string | null | undefined, files: readonly SupportingDocFile[]): void {
    if (!id || id.trim() === '') return;
    this.map.set(id.trim(), [...files]);
  }
  get(id: string | null | undefined): SupportingDocFile[] | undefined {
    if (!id || id.trim() === '') return undefined;
    return this.map.get(id.trim());
  }
}

/** the store of the whole browser session — a module-level instance, like the Java session attribute */
export const attachStore = new AttachStore();

/** `JSON.parse` that gives undefined instead of throwing */
export function parseJson(text: string): RawRecord | undefined {
  if (!text) return undefined;
  try {
    const j = JSON.parse(text) as unknown;
    return j && typeof j === 'object' && !Array.isArray(j) ? (j as RawRecord) : undefined;
  } catch {
    return undefined;
  }
}

const isObject = (v: unknown): v is RawRecord => !!v && typeof v === 'object' && !Array.isArray(v);
const objects = (v: unknown): RawRecord[] => (Array.isArray(v) ? v.filter(isObject) : []);

/** `JSONObject.optLong(key, fallback)` */
function optLong(o: RawRecord, key: string, fallback: number): number {
  const v = o[key];
  if (typeof v === 'number') return Math.trunc(v);
  if (typeof v === 'string' && /^\s*[+-]?\d+\s*$/.test(v)) return Number(v);
  return fallback;
}

/** `Base64.getEncoder().encodeToString(bytes)` of a Blob */
export async function blobToBase64(blob: Blob): Promise<string> {
  const bytes = new Uint8Array(await blob.arrayBuffer());
  let binary = '';
  for (let i = 0; i < bytes.length; i += 0x8000) binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(binary);
}

/** what the save gives back to the page */
export interface SaveResult {
  /** the messages the growl shows (on this page, or on the list when the page moved on) */
  messages: FacesMessage[];
  /** false = an ERROR message: the page stays where it is (`saveDocumentAndList` returns null); true = it goes to the list */
  redirect: boolean;
  /** the document as the backend holds it after a successful save (`loadDetailAPI(savedId)`) */
  detail?: SupportingDocDetail;
}

export class SupportingDocService {
  readonly api: SupportingDocApi;
  readonly store: AttachStore;

  constructor(api: SupportingDocApi, store: AttachStore = attachStore) {
    this.api = api;
    this.store = store;
  }

  /** the `formType` sent to the backend (`Sales_DocumentView.apiFormType`) */
  apiFt(type: SupportingDocType): string {
    return apiFormType(type.formType, type.apiFormTypeNew, this.api.formTypeStyle);
  }

  /* ---------------------------------------------------------------------------------------- the list */

  /** `SalesDocumentListService.fetchPage` + the normalisation of `SalesDocumentListServlet` — one page of rows, `/board/sales-document-list` */
  async fetchPage(type: SupportingDocType, page: number, perPage: number): Promise<ListPage> {
    const { page: p, perPage: pp } = listPaging(page, perPage);
    const text = await this.api.documents(this.apiFt(type), p, pp);
    let raw: RawRecord[] = [];
    let total = 0;
    const root = parseJson(text);
    if (root) {
      const result = root['result'];
      if (isObject(result)) {
        // the new envelope (result.items[]) and the old one (result.result[])
        const arr = Array.isArray(result['items']) ? result['items'] : Array.isArray(result['result']) ? result['result'] : [];
        raw = objects(arr);
        total = optLong(result, 'total', Array.isArray(arr) ? arr.length : 0);
      }
    }
    return { items: raw.map(normalizeRow), total, page: p, perPage: pp };
  }

  /** `Sales_DocumentView.loadFirstPage`: the first page of the rows */
  async loadFirstPage(type: SupportingDocType): Promise<SupportingDocRow[]> {
    return (await this.fetchPage(type, 1, ITEMS_PER_PAGE)).items;
  }

  /**
   * `Sales_DocumentView.viewQueryDataAPI`: every row of the family, newest first — 100 a page, up to 50 pages, stopping at an empty page, a page
   * without a new row or a short page. What was read before an error (a body that is not JSON, a row that is not an object) is kept.
   */
  async viewQueryDataAPI(type: SupportingDocType): Promise<SupportingDocRow[]> {
    const ft = this.apiFt(type);
    const rows: SupportingDocRow[] = [];
    const seen = new Set<number>();
    try {
      for (let page = 1; page <= DOC_LIST_MAX_PAGES; page++) {
        const text = await this.api.documents(ft, page, DOC_LIST_PAGE_SIZE);
        if (!text) break;
        const root = JSON.parse(text) as unknown;
        if (!isObject(root)) throw new Error('not an object');
        const result = root['result'];
        let arr: unknown[] | null = null;
        if (isObject(result)) arr = Array.isArray(result['items']) ? result['items'] : Array.isArray(result['result']) ? result['result'] : null;
        if (!arr || arr.length === 0) break;
        let added = 0;
        for (const q of arr) {
          if (!isObject(q)) throw new Error('row is not an object'); // JSONArray.getJSONObject throws
          const id = optInt(q, 'id');
          if (id > 0 && seen.has(id)) continue;
          if (id > 0) seen.add(id);
          rows.push(normalizeRow(q));
          added++;
        }
        if (added === 0 || arr.length < DOC_LIST_PAGE_SIZE) break;
      }
    } catch {
      /* the bean logged it and went on with what it had */
    }
    return rows.sort(newestFirst);
  }

  /* ---------------------------------------------------------------------------------------- master data of the form */

  /** `searchProspects(key, page)`: the customers of the dropdown (page starts at 0, 20 a page) */
  async searchProspects(key: string, page: number): Promise<BasicItem[]> {
    const text = await this.api.searchProspects((key ?? '').trim(), Math.max(page, 0), PROSPECT_SEARCH_PER_PAGE);
    const root = parseJson(text);
    return objects(root?.['result']).map(basicItem);
  }

  /** `loadEmployeeList`: the people of the "ผู้รับเอกสาร" dropdown */
  async loadEmployees(): Promise<BasicItem[]> {
    const root = parseJson(await this.api.employees());
    return objects(root?.['result']).map(basicItem);
  }

  /** `prospectIdByCode`: the id of the customer with this code — from the list, else by asking for the code (exact match) */
  async prospectIdByCode(code: string, list: readonly BasicItem[]): Promise<string> {
    const c = (code ?? '').trim();
    if (c === '') return '';
    const hit = list.find((b) => b.code === c);
    if (hit) return String(hit.id);
    const found = (await this.searchProspects(code, 0)).find((b) => b.code === c);
    return found ? String(found.id) : '';
  }

  employeeIdByCode(code: string, employees: readonly BasicItem[]): string {
    const c = (code ?? '').trim();
    if (c === '') return '';
    const hit = employees.find((b) => b.code === c);
    return hit ? String(hit.id) : '';
  }

  /** `ensureProspectInList`: the customer of the document is in the list (at the end), whatever page of the search it was on */
  ensureProspectInList(list: BasicItem[], id: string, code: string, name: string): void {
    if (!id || id.trim() === '') return;
    if (!/^\s*[+-]?\d+\s*$/.test(id)) return;
    const n = Number(id.trim());
    if (list.some((b) => b.id === n)) return;
    list.push({ id: n, code, name });
  }

  /* ---------------------------------------------------------------------------------------- the document */

  /**
   * `loadDetailAPI(id)`: the document, with the ids the dropdowns need. `prospects` is the list of the customers dropdown and gets the
   * customer of the document when it was not in it. Undefined = nothing to show (no answer, or no `result`): the bean then keeps the id
   * and an empty set of fields.
   */
  async loadDetail(type: SupportingDocType, id: string, employees: readonly BasicItem[], prospects: BasicItem[]): Promise<SupportingDocDetail | undefined> {
    const docId = id.trim();
    const text = await this.api.document(this.apiFt(type), id);
    const root = parseJson(text);
    const r = root?.['result'];
    if (!isObject(r)) return undefined;
    const d = detailOf(r, type.formType, docId);
    // GET /documents/{id} has no customerId: it is found from the customer code
    let customerId = optString(r, 'customerId');
    if (customerId === '') customerId = await this.prospectIdByCode(optString(r, 'customerCode'), prospects);
    d.fields['customerId'] = customerId;
    if (customerId !== '') this.ensureProspectInList(prospects, customerId, optString(r, 'customerCode'), optString(r, 'customerName'));
    // …and no receiveById, only receiveByCode
    d.fields['receiveById'] = this.employeeIdByCode(optString(r, 'receiveByCode'), employees);
    d.files = mergeLocalFiles(d.files, this.store.get(id));
    return d;
  }

  /**
   * `onCustomerSelected` + `selectReceiverBySalePersonName`: after a customer is chosen the receive date is today and the receiver is the
   * employee named like the customer's sale person (the first of equal names), when there is one.
   */
  async onCustomerSelected(customerId: string, employees: readonly BasicItem[], today: string): Promise<{ receiveDate: string; receiver?: BasicItem } | undefined> {
    if (!customerId || customerId.trim() === '') return undefined;
    let receiver: BasicItem | undefined;
    try {
      const r = parseJson(await this.api.prospect(customerId.trim()))?.['result'];
      if (isObject(r)) receiver = receiverBySalePerson(optString(r, 'salePersonName'), employees);
    } catch {
      /* logged by the bean; the receiver stays */
    }
    return { receiveDate: today, receiver };
  }

  /** `persistPendingAttachments`: the files only the browser has go to the backend; the names of the ones that failed come back */
  async persistPendingAttachments(type: SupportingDocType, docId: string, files: readonly SupportingDocFile[]): Promise<string[]> {
    const failed: string[] = [];
    if (!files.length || !docId.trim()) return failed;
    for (const f of files) {
      if (f.remoteUrl && f.remoteUrl.trim() !== '') continue; // the backend has it
      if (!f.content || f.content.size === 0) continue; // nothing to send
      try {
        const body = { fileName: f.filename, fileType: f.contentType, detail: f.description, contentBase64: await blobToBase64(f.content) };
        const text = await this.api.attach(this.apiFt(type), docId.trim(), body);
        if (saveOutcome(text).status !== 200) failed.push(f.filename);
      } catch {
        failed.push(f.filename);
      }
    }
    return failed;
  }

  /**
   * `saveDocumentAndList` (= `saveDocument` + the redirect): validates, sends the body, sends the files, reloads the document.
   * `redirect` is false only when there is an ERROR message — a WARN (nothing chosen) still moves on to the list, as the Java page did.
   */
  async save(
    type: SupportingDocType,
    st: { docId: string; raw: RawRecord | null; fields: Record<string, string>; txDate: string; refDate: string; receiveDate: string; files: SupportingDocFile[] },
    employees: readonly BasicItem[],
    prospects: BasicItem[],
  ): Promise<SaveResult> {
    const messages: FacesMessage[] = [];
    try {
      const isUpdate = st.docId.trim() !== '';
      const stop = checkBeforeSave({ isUpdate, customerId: st.fields['customerId'] ?? '', receiveDate: st.receiveDate });
      if (stop) return { messages: [stop], redirect: true };
      const body = buildSaveBody({
        formType: type.formType,
        apiFormType: this.apiFt(type),
        isUpdate,
        raw: st.raw,
        fields: st.fields,
        txDate: st.txDate,
        refDate: st.refDate,
        receiveDate: st.receiveDate,
      });
      const text = await this.api.save(this.apiFt(type), isUpdate ? st.docId : undefined, body);
      const out = saveOutcome(text);
      if (!out.ok) {
        return { messages: [{ severity: 'error', summary: 'บันทึกไม่สำเร็จ', detail: 'ระบบไม่สามารถบันทึกเอกสารได้' }], redirect: false };
      }
      let savedId = st.docId;
      if (savedId === '') savedId = out.id;
      this.store.put(savedId, st.files);
      let detail: SupportingDocDetail | undefined;
      if (savedId !== '') {
        const failedUploads = await this.persistPendingAttachments(type, savedId, st.files);
        if (failedUploads.length) {
          messages.push({ severity: 'warn', summary: 'แนบไฟล์ไม่สำเร็จบางไฟล์', detail: `${failedUploads.join(', ')} — กดบันทึกอีกครั้งเพื่อลองใหม่` });
        }
        detail = await this.loadDetail(type, savedId, employees, prospects);
      }
      return { messages, redirect: true, detail };
    } catch (e) {
      return { messages: [{ severity: 'error', summary: 'เกิดข้อผิดพลาด', detail: String((e as Error)?.message ?? e) }], redirect: false };
    }
  }
}
