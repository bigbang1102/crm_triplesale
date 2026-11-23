/**
 * The state of the page (`Sales_DocumentView` is `@ViewScoped`: one instance per open page) — the two beans of the supporting-document
 * screens, written once for both uses: the Angular hosts hold one each, and the comparison harness runs the same class as "the server" of
 * the Java replica (a JSF page keeps its state on the server; here it is the class).
 *
 * The members are named as the EL of the Java page names them (`action_type`, `sunDetail`, `sunBool`, `pagedQuotationList`, `pageInfo`,
 * `filterActive`, `listProspectBean` …): the generated template reads `bean.<name>`, the replica evaluates `#{sales_documentView.<name>}`
 * against the same object.
 *
 * Framework-free: no Angular, no `enum`, no parameter properties. A change is announced with `onChange` (the host marks its view).
 */
import {
  type BasicItem,
  type FacesMessage,
  type RawRecord,
  type SupportingDocDetail,
  type SupportingDocFile,
  type SupportingDocFilters,
  type SupportingDocRow,
  filterRows,
  formatDocDate,
  pageInfo,
  pageOf,
  parseViewDate,
  statusClass,
  statusClassLegacy,
  statusDisplay,
  totalPages,
} from './supporting-doc.logic';
import { ITEMS_PER_PAGE, PROSPECT_SEARCH_PER_PAGE, type SaveResult, type SupportingDocService } from './supporting-doc.service';
import type { SupportingActionType, SupportingDocType } from './supporting-doc-types';

/* ================================================================================================ the list */

/** a row as the template reads it (`Sales_DocumentBean`: the fields plus its formatted getters) */
export interface QuotationView extends SupportingDocRow {
  formattedQuotationDate: string;
  formattedReceiveDate: string;
  statusDisplay: string;
  statusClass: string;
}

export const quotationView = (r: SupportingDocRow, legacyBadge = false): QuotationView => ({
  ...r,
  formattedQuotationDate: formatDocDate(r.quotationDate),
  formattedReceiveDate: formatDocDate(r.receiveDate),
  statusDisplay: statusDisplay(r.status),
  statusClass: legacyBadge ? statusClassLegacy(r.status) : statusClass(r.status),
});

/** `Sales_DocumentView` as the list pages (`sales_document*.xhtml`) use it */
export class SupportingListBean {
  readonly type: SupportingDocType;
  private readonly svc: SupportingDocService;
  private readonly onChange: () => void;
  private original: SupportingDocRow[] = [];
  private filtered: SupportingDocRow[] = [];
  /** `quotationList` — what the table starts with (the first page) */
  quotationList: SupportingDocRow[] = [];
  filterActive = false;
  private page = 1;
  readonly itemsPerPage = ITEMS_PER_PAGE;
  filterDocNo = '';
  filterDocDate = '';
  filterCustomerCode = '';
  filterCustomerName = '';
  filterResponsible = '';
  filterStatus = '';
  /** the messages of the growl (`FacesContext.addMessage`) */
  messages: FacesMessage[] = [];

  constructor(type: SupportingDocType, svc: SupportingDocService, onChange: () => void = () => undefined) {
    this.type = type;
    this.svc = svc;
    this.onChange = onChange;
  }

  /** `@PostConstruct init()` of a list page: the first page of rows */
  async init(): Promise<void> {
    await this.loadFirstPage();
  }

  private async loadFirstPage(): Promise<void> {
    this.quotationList = await this.svc.loadFirstPage(this.type);
    this.original = [...this.quotationList];
    this.filtered = [...this.quotationList];
    this.currentPage = 1;
    this.onChange();
  }

  /* ---- the EL of the page */
  get pagedQuotationList(): QuotationView[] {
    return pageOf(this.filtered, this.page, this.itemsPerPage).rows.map((r) => quotationView(r, this.type.legacyStatusBadge));
  }
  get totalPages(): number {
    return totalPages(this.filtered.length, this.itemsPerPage);
  }
  get totalRecords(): number {
    return this.filtered.length;
  }
  /** the page, clamped to the rows there are (Java: `getPagedQuotationList()` stores the clamped page as it is read; the page reads it first) */
  get currentPage(): number {
    return pageOf(this.filtered, this.page, this.itemsPerPage).page;
  }
  set currentPage(v: number) {
    this.page = v;
  }
  get pageInfo(): string {
    return pageInfo(this.filtered.length, this.currentPage, this.itemsPerPage);
  }
  get filters(): SupportingDocFilters {
    return { docNo: this.filterDocNo, customerCode: this.filterCustomerCode, customerName: this.filterCustomerName, responsible: this.filterResponsible, status: this.filterStatus, docDate: this.filterDocDate };
  }

  firstPage(): void {
    this.currentPage = 1;
  }
  previousPage(): void {
    if (this.currentPage > 1) this.currentPage--;
  }
  nextPage(): void {
    if (this.currentPage < this.totalPages) this.currentPage++;
  }
  lastPage(): void {
    this.currentPage = this.totalPages;
  }

  /** `applyFilters()`: every row is fetched, then filtered; the pager takes over from the scroll */
  async applyFilters(): Promise<void> {
    this.original = await this.svc.viewQueryDataAPI(this.type);
    this.filtered = filterRows(this.original, this.filters);
    this.currentPage = 1;
    this.filterActive = true;
    this.onChange();
  }

  /** `clearFilters()`: the boxes are emptied and the table goes back to the first page */
  async clearFilters(): Promise<void> {
    this.filterDocNo = this.filterDocDate = this.filterCustomerCode = this.filterCustomerName = this.filterResponsible = this.filterStatus = '';
    this.filterActive = false;
    await this.loadFirstPage();
  }

  /** `SalesDocumentListServlet` for the scroll: one page of rows */
  fetchPage(page: number, perPage: number) {
    return this.svc.fetchPage(this.type, page, perPage);
  }

  /** the servlet answers for the `formType` the script sends (always this page's family, but the address names it) */
  fetchPageOf(type: SupportingDocType, page: number, perPage: number) {
    return this.svc.fetchPage(type, page, perPage);
  }

  /** `value="#{sales_documentView.filterDocNo}"`: a posted value of the filter overlay laid into the bean */
  assign(el: string, value: string): void {
    const m = /^#\{sales_documentView\.(filter(?:DocNo|DocDate|CustomerCode|CustomerName|Responsible|Status))\}$/.exec(el.trim());
    if (!m) throw new Error(`cannot assign ${el}`);
    (this as unknown as Record<string, string>)[m[1]] = value;
  }
}

/* ================================================================================================ the form */

/** the dropdown item of a file row as the template reads it */
export interface FileView extends SupportingDocFile {
  /** `docProxyUrl(remoteUrl)`: the address itself (no proxy servlet) */
  proxyUrl: string;
}

/** what `loadProspectPageAjax` hands the script (`prosJson`) */
export interface ProspectPage {
  items: { id: number; code: string; name: string }[];
  hasMore: boolean;
  page: number;
  gen: string;
  keepId: string;
}

const BOOL_TRUE = /^(true|1|y)$/i;

/** `Sales_DocumentView` as the form pages (`sales_document_sub_N.xhtml`) use it */
export class SupportingFormBean {
  readonly type: SupportingDocType;
  readonly action_type: SupportingActionType;
  private readonly svc: SupportingDocService;
  private readonly onChange: () => void;
  private readonly today: () => string;
  /** `sunDetail`'s map (the template reads it through the proxy below, which answers '' for a key nobody set) */
  fields: Record<string, string> = {};
  sunTxDate = '';
  sunRefDate = '';
  sunReceiveDate = '';
  sunDocId = '';
  raw: RawRecord | null = null;
  listProspectBean: BasicItem[] = [];
  listReceiveByBean: BasicItem[] = [];
  files: SupportingDocFile[] = [];
  messages: FacesMessage[] = [];
  /** the messages that go with the move to the list after a save (`Flash.setKeepMessages`) */
  flash: FacesMessage[] = [];

  /** @param today  `yyyy-MM-dd` of today (the clock stays outside: the harness gives a fixed day) */
  constructor(type: SupportingDocType, actionType: SupportingActionType, svc: SupportingDocService, onChange: () => void = () => undefined, today: () => string = () => '') {
    this.type = type;
    this.action_type = actionType;
    this.svc = svc;
    this.onChange = onChange;
    this.today = today;
  }

  /** `@PostConstruct init()` of a form page */
  async init(quotationId: string | undefined): Promise<void> {
    const isDetailOrEdit = this.action_type === 'detail' || this.action_type === 'edit';
    const isAdd = this.action_type === 'add';
    const isEdit = this.action_type === 'edit';
    this.files = [];
    // employees first: loadDetailAPI finds receiveById from receiveByCode
    if (isDetailOrEdit || isAdd) this.listReceiveByBean = await this.svc.loadEmployees();
    // …and the customers before the document: its customer is found by code from this list
    if (isAdd || isEdit) this.listProspectBean = await this.svc.searchProspects('', 0);
    if (quotationId && quotationId.trim() !== '' && isDetailOrEdit) await this.loadDetail(quotationId);
    this.onChange();
  }

  /** `loadDetailAPI(id)` */
  async loadDetail(id: string): Promise<void> {
    this.sunDocId = id.trim();
    this.fields = {};
    const d = await this.svc.loadDetail(this.type, id, this.listReceiveByBean, this.listProspectBean);
    if (d) this.apply(d);
    this.onChange();
  }

  private apply(d: SupportingDocDetail): void {
    this.fields = d.fields;
    this.sunTxDate = d.txDate;
    this.sunRefDate = d.refDate;
    this.sunReceiveDate = d.receiveDate;
    this.files = d.files;
    this.raw = d.raw;
    this.sunDocId = d.docId;
  }

  /* ---- the EL of the page */
  /** `sunDetail.x` — '' for a key nobody set (an input shows an empty value, `sd_field_ro` a dash) */
  // `any`: the template reads `bean.sunDetail.b_loantype` — one of 270 keys the page names, not a member a type could list
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  readonly sunDetail: any = new Proxy({} as Record<string, string>, {
    get: (_t, k) => (typeof k === 'string' ? (this.fields[k] ?? '') : undefined),
    has: () => true,
  });
  /** `sunBool['x']` — the text field "true" / "1" / "Y" as a boolean */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  readonly sunBool: any = new Proxy({} as Record<string, boolean>, {
    get: (_t, k) => (typeof k === 'string' ? BOOL_TRUE.test(this.fields[k] ?? '') : undefined),
  });
  get uploadedFiles(): FileView[] {
    return this.files.map((f) => ({ ...f, proxyUrl: this.docProxyUrl(f.remoteUrl) }));
  }
  /** `docProxyUrl(raw)` without a proxy: relative and absolute addresses are used as they are */
  docProxyUrl(raw: string | null | undefined): string {
    return raw && raw.trim() !== '' ? raw.trim() : '';
  }

  /* ---- writing a value of the form (what a post of the form does) */
  /** `value="#{sales_documentView.sunDetail.x}"` etc.: lays one posted value into the bean. kind: text | date | select | checkbox */
  assign(el: string, value: string | boolean, kind: string): void {
    const m = /^#\{sales_documentView\.(.+)\}$/.exec(el.trim());
    if (!m) throw new Error(`cannot assign ${el}`);
    const path = m[1];
    let mm: RegExpExecArray | null;
    if ((mm = /^sunDetail\.(\w+)$/.exec(path))) {
      this.fields[mm[1]] = String(value ?? '');
    } else if ((mm = /^sunBool\['(\w+)'\]$/.exec(path))) {
      this.fields[mm[1]] = value === true || value === 'true' ? 'true' : 'false';
    } else if (path === 'sunTxDate' || path === 'sunRefDate' || path === 'sunReceiveDate') {
      this[path] = kind === 'date' ? parseViewDate(String(value)) : String(value);
    } else {
      throw new Error(`cannot assign ${el}`);
    }
  }

  /* ---- ajax */
  /** `onCustomerSelected`: the receive date is today; the receiver is the employee named like the customer's sale person */
  async onCustomerSelected(): Promise<void> {
    const r = await this.svc.onCustomerSelected(this.fields['customerId'] ?? '', this.listReceiveByBean, this.today());
    if (!r) return;
    this.sunReceiveDate = r.receiveDate;
    if (r.receiver) {
      this.fields['receiveById'] = String(r.receiver.id);
      this.fields['receiveByName'] = r.receiver.name;
    }
    this.onChange();
  }

  /** `loadProspectPageAjax` (the remote command `sdProsLoad`): one page of the customers dropdown; the answer is `prosJson` */
  async loadProspectPageAjax(key: string, page: number, gen: string): Promise<ProspectPage> {
    const p = Math.max(0, page);
    const got = await this.svc.searchProspects(key, p);
    const selId = this.fields['customerId'] ?? '';
    const keep = selId === '' ? undefined : this.listProspectBean.find((b) => String(b.id) === selId.trim());
    if (p === 0) this.listProspectBean = [];
    this.listProspectBean.push(...got);
    if (keep) this.svc.ensureProspectInList(this.listProspectBean, selId, keep.code, keep.name);
    return { items: got.map((b) => ({ id: b.id, code: b.code, name: b.name })), hasMore: got.length >= PROSPECT_SEARCH_PER_PAGE, page: p, gen, keepId: selId };
  }

  /* ---- files */
  /** `handleUpload`: a file chosen in the browser joins the list (and the browser store) */
  handleUpload(file: { name: string; type: string; size: number; blob: Blob }): void {
    this.files.push({ filename: file.name, contentType: file.type, size: file.size, description: '', remoteUrl: '', content: file.blob });
    this.svc.store.put(this.sunDocId, this.files);
    this.messages.push({ severity: 'info', summary: 'สำเร็จ', detail: `อัพโหลดไฟล์ ${file.name} เรียบร้อยแล้ว` });
    this.onChange();
  }

  /** `removeFile(file)` (the row's index in the list) */
  removeFile(index: number): void {
    const f = this.files[index];
    if (f) this.files.splice(index, 1);
    this.svc.store.put(this.sunDocId, this.files);
    this.messages.push({ severity: 'info', summary: 'สำเร็จ', detail: `ลบไฟล์ ${f ? f.filename : '(null)'} เรียบร้อยแล้ว` });
    this.onChange();
  }

  /** the text of a file that was chosen here (not at the backend): what `DocAttachServlet` served, from the browser store */
  localFile(index: number): SupportingDocFile | undefined {
    return this.files[index];
  }

  /* ---- save */
  /** `saveDocumentAndList()`: the result says whether the page moves to the list (and which messages go with it) */
  async saveDocumentAndList(): Promise<SaveResult> {
    const r = await this.svc.save(
      this.type,
      { docId: this.sunDocId, raw: this.raw, fields: this.fields, txDate: this.sunTxDate, refDate: this.sunRefDate, receiveDate: this.sunReceiveDate, files: this.files },
      this.listReceiveByBean,
      this.listProspectBean,
    );
    if (r.detail) this.apply(r.detail);
    this.messages = r.messages;
    if (r.redirect) this.flash = r.messages;
    this.onChange();
    return r;
  }
}

