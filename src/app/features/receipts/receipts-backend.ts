/**
 * What the two receipt screens (ใบรับเงิน RV: the list `sales/receipts` and the form `sales/receipts/:id`) need from their backend —
 * the contract the Java pages had with the BFF servlets of the war, in exactly the shapes those servlets answered:
 *
 *   /rvapi?action=…            RvApiServlet → RvApiService → triplesale-service /api/v1/rv*  and  /api/v1/master-data/*
 *   /rvreport?txno=            RvJasperReportServlet  (the ERP form RV-01 as PDF, or PNG with &format=png)
 *   /rvreceipt?id=             RvReceiptPdfServlet    (a PDF made from the CRM data when the receipt is not in the ERP yet)
 *   /board/prospect-list       ProspectListServlet    (the customer suggestions under the search field, enrich=1)
 *   /board/lead · /board/prospect   (the prefill of the form when it is opened from a lead — see receipt-form)
 *
 * Two implementations are behind it: `receipts.mock.ts` (dev: deterministic fake data in exactly these shapes) and `receipts.live.ts`
 * (the logic of RvApiService / RvDetailNormalizer / RvApiServlet moved into TypeScript, calling the REST services directly through the
 * app's HttpClient — INTEGRATION.md lists what each servlet did and what is not ported). The page scripts (`receipts.engine.ts`,
 * `receipt-form.engine.ts`, generated) never know which one they talk to.
 *
 * Live mode has no REST endpoint for `/rvreport` and `/rvreceipt`: there `file()` makes a text that says why (receipts.live.files.ts).
 */

/** the file a report address stands for (what the servlet streamed back); the page opens it in a new tab */
export interface ReceiptFile {
  /** HTTP status of the servlet answer (200 = the file; 400 / 404 / 502 = the text the servlet printed) */
  status: number;
  /** content type: application/pdf · image/png · text/plain */
  type: string;
  body: Uint8Array;
}

export interface ReceiptsBackend {
  /**
   * The requests of the page scripts. `input` is what the Java page passed to `fetch`, below the context path:
   * `/rvapi?action=list&page=1&pageSize=500`, `/rvapi?action=approve&txno=…` (POST), `/board/prospect-list?page=1&perPage=8&enrich=1&searchText=…`.
   * Resolves with the answer of the servlet (status + JSON text); rejects only when there was no answer (a network error).
   */
  fetch(input: string, init?: RequestInit): Promise<Response>;

  /**
   * The file behind `/rvreport?txno=…[&format=png]` or `/rvreceipt?id=…`. Synchronous on purpose: the page opens it with
   * `window.open` inside the click handler (a popup that waits for a request is blocked by the browser).
   */
  file(url: string): ReceiptFile;
}

/* ------------------------------------------------------------------------------------------------ answers of /rvapi */

/** one row of `GET /api/v1/rv` as RvApiService.listJson passes it through (the page reads exactly these fields) */
export interface RvListItem {
  id: number;
  /** the number shown in the table; an ERP number looks like RV:M13-2610-00031, a CRM one like RV:00-2026-1020-120000-0001 */
  txno: string;
  /** ISO date yyyy-mm-dd */
  txdate: string;
  /** new · new1 · waitToFlow · ActionWaitProcess · active · active1 · active2 · cancel (anything else is shown as it is) */
  status: string;
  /** the ERP forms of the receipt; empty = not synced to the ERP yet. The page takes the ERP number from `url` (`txno=`) */
  print_forms?: { code: string; name?: string; url: string }[];
  createbyname?: string;
  createbycode?: string;
  /** the names the backend used before 11/08 (the page still reads them as a fallback) */
  created_by?: string;
  payername?: string;
  payercode?: string;
  payer?: string;
  payer_code?: string;
  description?: string;
}

/** `GET /api/v1/rv/{id}` after RvDetailNormalizer (receipts.logic.ts → normalizeRvDetail) */
export interface RvDetail {
  txno?: string;
  txdate?: string;
  reference_docno?: string;
  taxinvoice_txno?: string;
  payer_code?: string;
  payer_name?: string;
  currency_code?: string;
  /** added by the normalizer: ฿ for THB (or none), otherwise the code and a space ("USD ") */
  currency_symbol?: string;
  netamount_before_vat?: number;
  vat_amount?: number;
  netamount_after_vat?: number;
  pay_amount?: number;
  description?: string;
  remark?: string;
  material_items?: { materialcode?: string; materialname?: string; detail?: string; amount?: number; tax_percent?: number; netamount_before_vat?: number; vat_amount?: number; netamount_after_vat?: number }[];
  payment_items?: { detailorderno?: number; receivemethodcode?: string; receivemethodname?: string; medium_amount?: number | string; paymedium_date?: string; amount?: number; amount_available?: boolean }[];
  /** added by the normalizer: what was received in total, and the change (0 when none) */
  payments_total?: number;
  change_amount?: number;
}

/** the body of `POST /rvapi?action=create` (receipt-form) */
export interface RvCreateRequest {
  payerCode: string;
  txDate: string;
  referenceDocNo: string;
  taxInvoiceNo: string;
  remark: string;
  branchCode: string;
  currencyCode: string;
  exchangeRate: number;
  /** `value` is the amount BEFORE VAT (the ERP rule) — a "VAT included" line is sent as value*100/107 */
  items: { materialCode: string; detail: string; value: number; taxPercent: number; withholdingPercent: number }[];
  payments: { methodCode: string; amount: number }[];
  attachments?: { fileName: string; fileType: string; contentBase64: string }[];
}
