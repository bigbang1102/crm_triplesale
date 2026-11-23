/**
 * Deterministic fake backend of the receipt (RV) screens — the list `sales/receipts` and the form `sales/receipts/:id` (dev /
 * `mock: true`, the unit tests and the Java-vs-Angular comparison).
 *
 * It answers in exactly the shapes the Java servlets answered (RvApiServlet → RvApiService, RvDetailNormalizer, ProspectListServlet,
 * the lead / prospect servlets) and keeps its state at module level, so what the form creates is what the list shows next:
 * ONE set of seeded receipts, ONE set of masters (materials, branches, currencies, receive methods, attachment types) and the
 * people / leads of the shared cast (`@core/mock/crm-seed`): the customer you pick in the form is a customer of the list.
 *
 * Framework-free on purpose (no Angular imports): the comparison harness loads this file in Node.
 *
 * Faults (the page address carries `?mock=<name>` in mock mode; the harness passes the same to the Java side) — to see the screens'
 * error and empty states:
 *   empty              the list has no receipts                      list-down      the list request fails (no answer at all)
 *   list-html          the list answers an HTML error page           leads-error    GET leads answers 500 (the "Lead no." column stays "-")
 *   products-error     GET products answers 500                      detail-error   GET detail answers an HTML error page
 *   detail-missing     GET detail answers 200 with an empty result   approve-403    POST approve is refused (no permission)
 *   approve-500        POST approve answers 500                      approve-down   POST approve fails (no answer at all)
 *   slow               every answer takes 3 s more (the loading state)  slow-detail  GET detail takes 3 s (the skeleton of the modal)
 * and for the form:
 *   materials-error / materials-empty / slow-materials     the items of the picker (500 / no items / 3 s)
 *   branches-error / branches-409 / branches-one           the branches (HTML page / "choose a company first" / a single branch, chosen by itself)
 *   currencies-error                                        the currency list (the page keeps THB / USD)
 *   methods-error / methods-empty / methods-old             the payment methods (the page falls back to its four; the old one-row-per-account shape)
 *   attach-empty / attach-error / attach-html               the attachment types (none allowed = uploads off / the page's fallback list)
 *   create-403 / create-down / create-html / create-pending / create-reject / create-details / create-text / create-empty     the save
 *   create-echo                                             the save is rejected with the payload it received as the message (the comparison reads it)
 *   lead-down / lead-error / prospect-down                  the prefill from a lead
 * and, for the LIVE comparison (`run.mjs --live`), the faults of a REST service as the SERVLET reported them — RvApiService turns every
 * failed call (no answer, not 200, not JSON) into the same answers, HTTP 200 always; the fake REST service of the harness plays the
 * failure behind the same name:
 *   rest-list · rest-list-down · rest-detail · rest-products · rest-branches · rest-branches-409 · rest-currencies · rest-methods ·
 *   rest-attach        the answer is { status: 502, message: "backend ไม่ตอบหรือ response ไม่ใช่ JSON" }
 *   rest-leads · rest-materials                       the answer is { result: [] } (those two methods swallow every failure)
 *   rest-approve-500 · rest-approve-403               the body of the failed REST call, passed on as it came (HTTP 200)
 *   rest-approve-down                                 the 502 envelope (the POST got no answer)
 *   rest-create-html · rest-create-down               { api: <502 envelope with the raw text>, verify } — the receipt was not saved
 */
import { msg, reference } from '@core/mock/reference';
import { SEED_BRANCH, SEED_EMPLOYEES, SEED_PROSPECT_COUNT, isKnownLead, isKnownProspect, leadIds, prospectIds, seedDate, seedHash, seedLead, seedProspect } from '@core/mock/crm-seed';
import { makePdf, makePng, textBody } from './receipts.files';
import { normalizeRvDetail, rvApproveReply } from './receipts.logic';
import type { ReceiptFile, ReceiptsBackend, RvCreateRequest, RvListItem } from './receipts-backend';
import { journaledBackend } from '@core/mockup/mockup-journal';

export interface MockReceiptsOptions {
  /** latency of every answer (the comparison harness passes 0 and delays by itself) */
  delayMs?: number;
  /** a fault to show, see the list above */
  fault?: string;
}

const pad = (n: number, w: number): string => String(n).padStart(w, '0');
const round2 = (n: number): number => Math.round((n + Number.EPSILON) * 100) / 100;

/* ------------------------------------------------------------------------------------------------ masters */

/** GET materials → [{code, name, salePrice}] (the items of the form; salePrice = standardSalePrice, 0 = none) */
export const MOCK_MATERIALS = reference('receipts.materials', [
  { code: 'SV-LOAN-FEE', name: 'ค่าธรรมเนียมสินเชื่อ', salePrice: 5000 },
  { code: 'SV-APPRAISE', name: 'ค่าประเมินราคาหลักประกัน', salePrice: 3500 },
  { code: 'SV-LEGAL', name: 'ค่านิติกรรมและจดทะเบียน', salePrice: 2500 },
  { code: 'SV-PRELOAN', name: 'ค่าบริการ Pre-Loan', salePrice: 1500 },
  { code: 'SV-TRANSLATE', name: 'ค่าแปลเอกสาร', salePrice: 800 },
  { code: 'SV-INSURE', name: 'ค่าเบี้ยประกันภัยทรัพย์สิน', salePrice: 4200 },
  { code: 'SV-ADS', name: 'บริการด้านโฆษณา', salePrice: 0 },
  { code: 'SV-ADS2', name: 'บริการด้านโฆษณา 2', salePrice: 0 },
  { code: 'SV-ADVISE', name: 'ค่าบริการที่ปรึกษาด้านสินเชื่อและการรีไฟแนนซ์ครบวงจร (แพ็กเกจพิเศษ ประจำปี 2569 สำหรับลูกค้าเดิม)', salePrice: 12500 },
  { code: 'SV-FEE-1000', name: 'ค่า FEE ต่อชิ้น /1000 บาท', salePrice: 1000 },
  { code: 'SV-STAMP', name: 'ค่าอากรแสตมป์', salePrice: 350.5 },
  { code: 'TRADING', name: 'Trading Goods', salePrice: 9999.99 },
  { code: 'SV-MEMBER', name: 'รายได้ค่าสมาชิก', salePrice: 600 },
  { code: 'SV-OVERDUE', name: 'รายได้ค่าปรับล่าช้า', salePrice: 200 },
] as const);
const materialName = (code: string): string => MOCK_MATERIALS.find((m) => m.code === code)?.name ?? code;

/** GET products = movement-types/LD */
const PRODUCTS = reference('receipts.products', [
  { id: 11, code: 'LD-WFS-A', name: 'สินเชื่อบ้านและที่ดิน (A)', usesWorkflowStep: true },
  { id: 12, code: 'LD-WFS-B', name: 'สินเชื่อทะเบียนรถ (B)', usesWorkflowStep: true },
  { id: 13, code: 'LD-WFS', name: 'สินเชื่อส่วนบุคคล (C)', usesWorkflowStep: false },
  { id: 14, code: 'LD-OTHER', name: 'ผลิตภัณฑ์อื่น ๆ', usesWorkflowStep: false },
]);

/** GET branches = master-data/business-branches */
const BRANCHES = reference('receipts.branches', [
  { branchId: 1, branchCode: 'SUN', branchName: 'SUN GATEWAY สำนักงานใหญ่' },
  { branchId: 2, branchCode: 'SUN02', branchName: 'สาขาเชียงใหม่' },
  { branchId: 3, branchCode: 'SUN03', branchName: 'สาขาขอนแก่น' },
]);

/** GET currencies */
const CURRENCIES = reference('receipts.currencies', {
  baseCurrency: 'THB',
  items: [
    { code: 'THB', name: 'THB - บาทไทย', exchangeRate: 1 },
    { code: 'USD', name: 'USD - ดอลลาร์สหรัฐ', exchangeRate: 33 },
  ],
});

/** a document of receive methods: `count` is missing on purpose in some rows (the button is shown dimmed), so "the fields of the first row" is not the rule */
const receiveMethodsFit = (doc: unknown): boolean =>
  Array.isArray(doc) &&
  doc.every(
    (g) =>
      typeof g === 'object' && g !== null && ['type', 'label', 'icon'].every((k) => typeof g[k] === 'string') && typeof g.orderNo === 'number' && Array.isArray(g.items) &&
      g.items.every((i: unknown) => typeof i === 'object' && i !== null && typeof (i as { code?: unknown }).code === 'string' && typeof (i as { name?: unknown }).name === 'string'),
  );
/** GET receiveMethods (txType=rv): one row per TYPE with its accounts / cards as `items` (the form of 22/09/2026) */
const RECEIVE_METHODS = reference('receipts.receiveMethods', [
  { type: 'cash', label: 'เงินสด', icon: 'cash', orderNo: 1, count: 1, items: [{ code: 'CASH', name: 'เงินสดหน้าร้าน' }] },
  {
    type: 'creditcard', label: 'บัตรเครดิต', icon: 'creditcard', orderNo: 2, count: 2,
    items: [{ code: 'CC-VISA', name: 'บัตรเครดิต VISA ผ่านเครื่อง EDC-01' }, { code: 'CC-MC', name: 'บัตรเครดิต MasterCard ผ่านเครื่อง EDC-02' }],
  },
  {
    type: 'transfer', label: 'เงินโอน', icon: 'transfer', orderNo: 3, count: 3,
    items: [
      { code: 'TRAN-SCB-0123456789', name: 'ธ.ไทยพาณิชย์ 012-3-45678-9' },
      { code: 'TRAN-KBANK-2223334445', name: 'ธ.กสิกรไทย 222-3-33444-5' },
      { code: 'TRAN-BBL-1112223334', name: 'ธ.กรุงเทพ 111-2-22333-4' },
    ],
  },
  // (no `count` and no items: the button is shown dimmed — there is no account to receive on yet)
  { type: 'cheque', label: 'เช็ค', icon: 'cheque', orderNo: 4, items: [] },
  { type: 'voucher', label: 'บัตรกำนัล', icon: 'voucher', orderNo: 5, count: 1, items: [{ code: 'VOUCHER-01', name: 'บัตรกำนัลร้านค้า' }] },
  // (count 0: the backend says there is nothing to receive on — the page does not show the button at all)
  { type: 'thirdparty', label: 'รับชำระเงินแทน', icon: 'thirdparty', orderNo: 6, count: 0, items: [] },
], undefined, receiveMethodsFit);
/** the shape before 22/09/2026: one row per account — the page groups them by label */
const RECEIVE_METHODS_OLD = reference('receipts.receiveMethodsOld', [
  { code: 'CASH', name: 'เงินสดหน้าร้าน', type: 'cash', label: 'เงินสด', orderNo: 1 },
  { code: 'CC-VISA', name: 'บัตรเครดิต VISA', type: 'creditcard', label: 'บัตรเครดิต', orderNo: 2 },
  { code: 'TRAN-SCB-0123456789', name: 'ธ.ไทยพาณิชย์ 012-3-45678-9', type: 'transfer', label: 'เงินโอน', orderNo: 3 },
  { code: 'TRAN-KBANK-2223334445', name: 'ธ.กสิกรไทย 222-3-33444-5', type: 'transfer', label: 'เงินโอน', orderNo: 3 },
]);
const METHOD_NAME = new Map<string, string>(RECEIVE_METHODS.flatMap((g) => g.items.map((i) => [i.code, i.name] as [string, string])));

/** GET attachFileTypes = master-data/attach-file-types */
const ATTACH_FILE_TYPES = reference('receipts.attachFileTypes', [
  { id: 1, code: 'pdf', name: 'pdf', nameTh: 'เอกสาร PDF' },
  { id: 2, code: 'png', name: 'png', nameTh: 'รูปภาพ PNG' },
  { id: 3, code: 'image', name: 'image', nameTh: 'รูปภาพ' },
]);

/* ------------------------------------------------------------------------------------------------ the cast */

export interface MockLead {
  leadId: number;
  code: string;
  name: string;
  txNo: string;
  employeeName: string;
  leadStatus: string;
  createdDate: string;
}

const leadTxNo = (n: number, createdDate: string): string =>
  `LD:00-${createdDate.slice(0, 4)}-${createdDate.slice(5, 7)}${createdDate.slice(8, 10)}-${pad(seedHash(n, 31) % 24, 2)}${pad(seedHash(n, 32) % 60, 2)}${pad(seedHash(n, 33) % 60, 2)}-${pad(seedHash(n, 34) % 10000, 4)}`;

/** the leads of the cast, the newest first (the order GET /rv/leads answers in) */
function allLeads(): MockLead[] {
  const out: MockLead[] = [];
  for (const n of leadIds()) {
    const l = seedLead(n);
    out.push({ leadId: n, code: seedProspect(l.prospectId).code, name: l.customerName, txNo: leadTxNo(n, l.createdDate), employeeName: l.ownerName, leadStatus: l.status, createdDate: l.createdDate });
  }
  return out.sort((a, b) => (a.createdDate < b.createdDate ? 1 : a.createdDate > b.createdDate ? -1 : b.leadId - a.leadId));
}

/** the prospect (customer) address line of the suggestions: made from the id so that it is stable */
export const prospectAddress = (id: number): string => `${10 + (id % 90)}/${1 + (id % 9)} หมู่ ${1 + (id % 8)} ต.ในเมือง อ.เมือง จ.${seedProspect(id).province}`;

/* ------------------------------------------------------------------------------------------------ the receipts */

interface RvItemRow { materialCode: string; detail: string; value: number; taxPercent: number; withholdingPercent: number }
interface RvPayRow { methodCode: string; amount: number }
interface RvDoc {
  id: number;
  txno: string;
  erpTxno: string;
  txdate: string;
  status: string;
  createByName: string;
  createByCode: string;
  /** which of the field names the list answers with (the backend renamed some on 11/08) */
  oldNames: boolean;
  payerCode: string;
  payerName: string;
  leadTxNo: string;
  taxInvoiceNo: string;
  currency: string;
  exchangeRate: number;
  description: string;
  branchCode: string;
  items: RvItemRow[];
  payments: RvPayRow[];
}

const DESCRIPTIONS = reference('receipts.descriptions', ['ค่ามัดจำสินเชื่อ', 'ค่าบริการประเมินราคา', '', 'ชำระงวดที่ 1', 'ค่าธรรมเนียมนิติกรรม', '', 'ค่าแปลเอกสารประกอบการกู้', 'ค่าเบี้ยประกันภัยประจำปี']);
/** the product code of the number: M13 / M14 / M15 are ERP numbers; 'CRM' = a number the CRM issued (not in the ERP yet) */
const NUMBER_KINDS = ['M13', 'M14', 'M15', 'M13', 'M13', 'M14', 'CRM'] as const;
const STATUS_CYCLE = ['new1', 'active1', 'new', 'active', 'waitToFlow', 'ActionWaitProcess', 'active2', 'cancel', 'new1', 'active1'];
const SEED_DOC_COUNT = 40;

/** receipt `i` (1 = the oldest of the seed) — everything derives from i and the cast */
function seedDoc(i: number, leadByProspect: Map<string, MockLead>): RvDoc {
  const prospect = seedProspect(((i * 11) % SEED_PROSPECT_COUNT) + 1);
  const date = seedDate(2 + (SEED_DOC_COUNT - i) * 3 + (seedHash(i, 41) % 3));
  const kind = NUMBER_KINDS[i % NUMBER_KINDS.length];
  const yymm = date.slice(2, 4) + date.slice(5, 7);
  const crmNo = `RV:00-${date.slice(0, 4)}-${date.slice(5, 7)}${date.slice(8, 10)}-${pad(seedHash(i, 42) % 24, 2)}${pad(seedHash(i, 43) % 60, 2)}${pad(seedHash(i, 44) % 60, 2)}-${pad(1000 + (seedHash(i, 45) % 9000), 4)}`;
  const erpNo = kind === 'CRM' ? '' : `RV:${kind}-${yymm}-${pad(i * 7, 5)}`;
  const status = i === 17 ? 'pendingReview' : STATUS_CYCLE[(i - 1) % STATUS_CYCLE.length];
  const employee = SEED_EMPLOYEES[i % SEED_EMPLOYEES.length];
  const usd = i % 9 === 4;
  const items: RvItemRow[] = [];
  const count = 1 + (i % 3);
  for (let k = 0; k < count; k++) {
    const m = MOCK_MATERIALS[(i + k * 3) % MOCK_MATERIALS.length];
    items.push({
      materialCode: m.code,
      detail: k === 0 && i % 2 ? msg('งวดที่ {0}', 1 + (i % 4)) : '',
      value: round2(m.salePrice > 0 ? m.salePrice : 1000 + (seedHash(i, 50 + k) % 40) * 50),
      taxPercent: (i + k) % 5 === 0 ? 0 : 7,
      withholdingPercent: (i + k) % 6 === 0 ? 3 : 0,
    });
  }
  const doc: RvDoc = {
    id: 900 + i,
    // the number the table shows: the ERP number for most receipts of an ERP product, the CRM number (and the ERP one only in print_forms) for the rest
    txno: erpNo && i % 3 !== 0 ? erpNo : crmNo,
    erpTxno: erpNo && status !== 'cancel' && i % 5 !== 0 ? erpNo : '',
    txdate: date,
    status,
    createByName: i % 9 === 0 || i % 13 === 0 ? '' : employee.name,
    createByCode: i % 13 === 0 ? '' : employee.code,
    oldNames: i % 19 === 0,
    payerCode: prospect.code,
    payerName: i % 11 === 0 ? '' : prospect.fullName,
    leadTxNo: leadByProspect.get(prospect.code)?.txNo ?? '',
    taxInvoiceNo: i % 4 === 1 ? `TI-${date.slice(2, 4)}${pad(i, 4)}` : '',
    currency: usd ? 'USD' : 'THB',
    exchangeRate: usd ? 33 : 1,
    description: i === 8 ? 'ค่าที่ปรึกษาสินเชื่อรายเดือน งวดที่ 3 ของสัญญาเลขที่ 2569/0013 ตามข้อตกลงที่ทำไว้กับลูกค้า (รวมค่าเดินทางไปสำรวจพื้นที่)' : DESCRIPTIONS[i % DESCRIPTIONS.length],
    branchCode: BRANCHES[i % BRANCHES.length].branchCode,
    items,
    payments: [],
  };
  const total = docTotals(doc).netAfterVat;
  const method = i % 3 === 0 ? ['TRAN-SCB-0123456789'] : i % 3 === 1 ? ['CASH'] : ['CASH', 'CC-VISA'];
  if (method.length === 1) doc.payments = [{ methodCode: method[0], amount: method[0] === 'CASH' && i % 2 === 0 ? Math.ceil(total / 100) * 100 : total }];
  else {
    const first = round2(Math.floor(total / 2));
    doc.payments = [{ methodCode: 'CASH', amount: first }, { methodCode: 'CC-VISA', amount: round2(total - first) }];
  }
  return doc;
}

/** the amounts of a receipt: `value` is BEFORE VAT (the ERP rule), the withholding tax is taken from the amount before VAT */
export function docTotals(d: { items: RvItemRow[] }): { before: number; vat: number; netAfterVat: number; withholding: number; pay: number } {
  let before = 0;
  let vat = 0;
  let wht = 0;
  for (const it of d.items) {
    before += it.value;
    vat += round2((it.value * it.taxPercent) / 100);
    wht += round2((it.value * it.withholdingPercent) / 100);
  }
  const netAfterVat = round2(before + vat);
  return { before: round2(before), vat: round2(vat), netAfterVat, withholding: round2(wht), pay: round2(netAfterVat - wht) };
}

/* ------------------------------------------------------------------------------------------------ state */

interface Store {
  docs: RvDoc[]; // newest first
  leads: MockLead[];
  leadByProspect: Map<string, MockLead>;
  nextId: number;
  nextSeq: number;
}
let store: Store | undefined;

function state(): Store {
  if (!store) {
    const leads = allLeads();
    const leadByProspect = new Map<string, MockLead>();
    for (const l of leads) if (!leadByProspect.has(l.code)) leadByProspect.set(l.code, l);
    const docs: RvDoc[] = [];
    for (let i = SEED_DOC_COUNT; i >= 1; i--) docs.push(seedDoc(i, leadByProspect));
    store = { docs, leads, leadByProspect, nextId: 1000, nextSeq: 1 };
  }
  return store;
}

/** the state back to the seed (tests, and one fresh backend per scenario of the comparison) */
export function resetMockReceipts(): void {
  store = undefined;
}

/* ------------------------------------------------------------------------------------------------ answers */

const JSON_TYPE = 'application/json; charset=UTF-8';
/**
 * A Response built in the page words a JSON syntax error with a "Failed to execute 'json' on 'Response': " prefix, a Response that came
 * over the network (what the live backend gives, and what the Java page gets) does not — the page shows that text to the user, so the mock
 * answers like the network does.
 */
const asNetwork = (res: Response): Response => {
  Object.defineProperty(res, 'json', { value: () => res.text().then((t) => JSON.parse(t)) });
  return res;
};
const json = (body: unknown, status = 200): Response => asNetwork(new Response(JSON.stringify(body), { status, headers: { 'content-type': JSON_TYPE } }));
const ok = (result: unknown): Response => json({ status: 200, message: 'success', result });
const down = (): never => {
  throw new TypeError('Failed to fetch');
};
const htmlError = (status: number): Response =>
  asNetwork(new Response('<html><body><h1>' + status + '</h1></body></html>', { status, headers: { 'content-type': 'text/html' } }));

/** what `RvApiService.safeJson` makes of an answer that is not a JSON object (no answer, not 200, an HTML page …): HTTP 200 and this */
export const REST_FAIL_ENVELOPE = { status: 502, message: 'backend ไม่ตอบหรือ response ไม่ใช่ JSON' };
/** the page a gateway answers with when the service behind it is down (the fake REST service of the live comparison sends it) */
export const REST_HTML_502 = '<html><body><h1>502 Bad Gateway</h1></body></html>';
/** the action each `rest-*` fault belongs to (see the head of this file) */
const REST_FAULT_ACTION: Record<string, string> = {
  'rest-list': 'list',
  'rest-list-down': 'list',
  'rest-detail': 'detail',
  'rest-leads': 'leads',
  'rest-products': 'products',
  'rest-materials': 'materials',
  'rest-branches': 'branches',
  'rest-branches-409': 'branches',
  'rest-currencies': 'currencies',
  'rest-methods': 'receiveMethods',
  'rest-attach': 'attachFileTypes',
};
/** the body of the REST service when an approve fails with a status of its own (RvApiService.approveJson passes any body on, HTTP 200) */
export const REST_APPROVE_ERRORS: Record<string, { status: number; message: string }> = {
  'rest-approve-500': { status: 500, message: 'Internal Server Error' },
  'rest-approve-403': { status: 403, message: 'Forbidden' },
};

/** GET list — GET /api/v1/rv passed through: search · status · dateFrom · dateTo · page · pageSize (the page asks for page 1 / 500) */
function listItems(s: Store, q: URLSearchParams): { items: RvListItem[]; total: number; page: number; pageSize: number } {
  const search = (q.get('search') ?? '').trim().toLowerCase();
  const status = (q.get('status') ?? '').trim();
  const from = (q.get('dateFrom') ?? '').trim();
  const to = (q.get('dateTo') ?? '').trim();
  const page = Math.max(1, Number(q.get('page')) || 1);
  const pageSize = Math.max(1, Number(q.get('pageSize')) || 20);
  const hit = s.docs.filter(
    (d) =>
      (!search || [d.txno, d.payerCode, d.payerName, d.description, d.createByName].join(' ').toLowerCase().includes(search)) &&
      (!status || d.status === status) &&
      (!from || d.txdate >= from) &&
      (!to || d.txdate <= to),
  );
  return { items: hit.slice((page - 1) * pageSize, page * pageSize).map(toListItem), total: hit.length, page, pageSize };
}

function toListItem(d: RvDoc): RvListItem {
  const forms = d.erpTxno
    ? [
        ...(d.id % 4 === 0 ? [{ code: 'RV_02_M13', name: 'RV-02', url: `http://report.example.invalid:8180/report?form=RV_02_M13&exportTo=pdf&txno=${encodeURIComponent(d.erpTxno)}x` }] : []),
        { code: 'RV_01_M13', name: 'RV-01', url: `http://report.example.invalid:8180/report?form=RV_01_M13&exportTo=pdf&txno=${encodeURIComponent(d.erpTxno)}` },
      ]
    : [];
  const base: RvListItem = { id: d.id, txno: d.txno, txdate: d.txdate, status: d.status, print_forms: forms, description: d.description };
  if (d.oldNames) return { ...base, created_by: d.createByName || 'ผู้ใช้เดิม', payer: d.payerName, payer_code: d.payerCode };
  return { ...base, createbyname: d.createByName, createbycode: d.createByCode, payername: d.payerName, payercode: d.payerCode };
}

/**
 * GET /api/v1/rv/{id} as the service answers it, BEFORE the normalizer (the fake REST service of the live comparison answers with this;
 * the BFF answer of `detail` is `normalizeRvDetail` of it, like RvApiService.detailJson). An id that does not exist is a 200 with an empty result.
 */
export function mockRvDetailRaw(id: string): { status: number; message: string; result: Record<string, unknown> } {
  const d = state().docs.find((x) => String(x.id) === id);
  return { status: 200, message: 'success', result: d ? rawDetail(d) : {} };
}

/** GET detail&id= — the raw backend answer (the normalizer is applied by the caller, like RvApiService.detailJson) */
function rawDetail(d: RvDoc): Record<string, unknown> {
  const t = docTotals(d);
  return {
    id: d.id,
    txno: d.txno,
    txdate: d.txdate,
    reference_docno: d.leadTxNo,
    taxinvoice_txno: d.taxInvoiceNo,
    payer_code: d.payerCode,
    payer_name: d.payerName,
    currency_code: d.currency,
    netamount_before_vat: t.before,
    vat_amount: t.vat,
    netamount_after_vat: t.netAfterVat,
    pay_amount: t.pay,
    description: d.description,
    material_items: d.items.map((it) => {
      const vat = round2((it.value * it.taxPercent) / 100);
      return { materialcode: it.materialCode, materialname: materialName(it.materialCode), detail: it.detail, amount: it.value, tax_percent: it.taxPercent, netamount_before_vat: it.value, vat_amount: vat, netamount_after_vat: round2(it.value + vat) };
    }),
    payment_items: d.payments.map((p, k) => ({
      detailorderno: k + 1,
      receivemethodcode: p.methodCode,
      receivemethodname: METHOD_NAME.get(p.methodCode) ?? p.methodCode,
      // the field really is called medium_amount; the odd receipts carry it as text ("1,234.50") to exercise the normalizer
      medium_amount: d.id % 7 === 0 ? p.amount.toLocaleString('en-US', { minimumFractionDigits: 2 }) : p.amount,
      paymedium_date: d.txdate,
    })),
  };
}

/* ------------------------------------------------------------------------------------------------ routes */

const unknown = (): Response => json({ message: 'unknown action' }, 400);
const internal = (): Response => json({ message: 'internal error' }, 500);

async function rvapi(method: string, q: URLSearchParams, init: RequestInit | undefined, fault: string): Promise<Response> {
  const s = state();
  const action = (q.get('action') ?? '').trim();
  if (method === 'GET') {
    // the REST call under the action failed: what RvApiService answers then (leads / materials swallow it: an empty list)
    if (REST_FAULT_ACTION[fault] === action) return json(action === 'leads' || action === 'materials' ? { result: [] } : REST_FAIL_ENVELOPE);
    switch (action) {
      case 'list': {
        if (fault === 'list-down') return down();
        if (fault === 'list-html') return htmlError(502);
        if (fault === 'empty') return ok({ items: [], total: 0, page: 1, pageSize: Number(q.get('pageSize')) || 20 });
        return ok(listItems(s, q));
      }
      case 'detail': {
        if (fault === 'slow-detail') await sleep(3000);
        if (fault === 'detail-error') return htmlError(502);
        const id = (q.get('id') ?? '').trim();
        const d = fault === 'detail-missing' ? undefined : s.docs.find((x) => String(x.id) === id);
        return json(normalizeRvDetail({ status: 200, message: 'success', result: d ? rawDetail(d) : {} }));
      }
      case 'leads': {
        if (fault === 'leads-error') return internal();
        const search = (q.get('search') ?? '').trim().toLowerCase();
        const leads = s.leads
          .filter((l) => !search || [l.name, l.code, l.txNo].join(' ').toLowerCase().includes(search))
          .map(({ leadId, code, name, txNo, employeeName, leadStatus }) => ({ leadId, code, name, txNo, employeeName, leadStatus }));
        return json({ result: leads });
      }
      case 'products':
        return fault === 'products-error' ? internal() : ok(PRODUCTS);
      case 'materials':
        if (fault === 'slow-materials') await sleep(3000);
        if (fault === 'materials-error') return internal();
        if (fault === 'materials-empty') return json({ result: [] });
        return json({ result: MOCK_MATERIALS.map((m) => ({ code: m.code, name: m.name, salePrice: m.salePrice })) });
      case 'branches':
        if (fault === 'branches-error') return htmlError(502);
        // a super admin who has not chosen a company yet: no result, the reason in error.message
        if (fault === 'branches-409') return json({ status: 409, message: 'conflict', error: { code: 'COMPANY_NOT_SELECTED', message: 'กรุณาเลือกบริษัทก่อนใช้งาน' } }, 409);
        return ok(fault === 'branches-one' ? BRANCHES.slice(0, 1) : BRANCHES);
      case 'currencies':
        return fault === 'currencies-error' ? internal() : ok(CURRENCIES);
      case 'receiveMethods':
        if (fault === 'methods-error') return htmlError(502);
        if (fault === 'methods-empty') return ok([]);
        if (fault === 'methods-old') return ok(RECEIVE_METHODS_OLD);
        return ok(RECEIVE_METHODS);
      case 'attachFileTypes':
        if (fault === 'attach-empty') return ok([]);
        if (fault === 'attach-error') return internal();
        if (fault === 'attach-html') return htmlError(502);
        return ok(ATTACH_FILE_TYPES);
      default:
        return unknown();
    }
  }
  if (method === 'POST') {
    switch (action) {
      case 'approve': {
        if (fault === 'rest-approve-down') return json(REST_FAIL_ENVELOPE);
        if (REST_APPROVE_ERRORS[fault]) return json(REST_APPROVE_ERRORS[fault]);
        if (fault === 'approve-down') return down();
        if (fault === 'approve-403') return json({ status: 403, message: 'forbidden: CRM_RV_View,CRM_RV_Edit,FEATURE_CRM_Document required' }, 403);
        if (fault === 'approve-500') return internal();
        const txno = (q.get('txno') ?? '').trim();
        if (!txno) return json({ message: 'txno required' }, 400);
        const d = s.docs.find((x) => x.txno === txno);
        const reply = rvApproveReply(d ? d.status : null, txno);
        if (d && reply.hopDone) d.status = 'active1';
        return json({ status: 200, message: 'success', result: reply });
      }
      case 'create':
        return create(s, init?.body, fault);
      default:
        return unknown();
    }
  }
  return unknown();
}

/* ------------------------------------------------------------------------------------------------ create */

/** the prospect a payer code stands for: `P00012` (the cast) or `CUS00012` (the ERP code of the same person) */
function prospectByCode(code: string): { id: number; code: string; name: string } | undefined {
  const m = /^(?:P|CUS)(\d{5})$/.exec(code);
  const id = m ? Number(m[1]) : 0;
  return isKnownProspect(id) ? { id, code, name: seedProspect(id).fullName } : undefined;
}

/** the answer of the backend for a rejected receipt: { api: { status, message, error: { code, message } }, verify } */
function rejected(message: string): Response {
  return json({ api: { status: 400, message: 'Validation error', error: { code: 'VALIDATION_ERROR', message } }, verify: { totalBefore: -1, totalAfter: -1, foundByRemark: -1, persisted: false } });
}

/**
 * POST create (RvApiService.createAndVerifyJson): the backend creates the receipt, then the facade counts the receipts before and after
 * and reports `verify` (the backend once answered success without saving anything). Faults: create-403 (the servlet refuses),
 * create-down (no answer), create-html (an HTML page), create-pending (accepted but not visible yet), create-reject (a validation error),
 * create-details (an error with field details), create-text (an error that is a plain string), create-empty (an answer without a cause).
 */
function create(s: Store, body: BodyInit | null | undefined, fault: string): Response {
  if (fault === 'create-down') return down();
  if (fault === 'create-403') return json({ status: 403, message: 'forbidden: CRM_RV_View,CRM_RV_Edit,FEATURE_CRM_Document required' }, 403);
  if (fault === 'create-html') return htmlError(502);
  let req: Partial<RvCreateRequest> = {};
  try {
    req = JSON.parse(String(body ?? '{}')) as Partial<RvCreateRequest>;
  } catch {
    return json({ message: 'internal error' }, 500);
  }
  const totalBefore = s.docs.length;
  const verify = (after: number, persisted: boolean, remark: number) => ({ totalBefore, totalAfter: after, foundByRemark: remark, persisted });
  if (fault === 'rest-create-html' || fault === 'rest-create-down') {
    // the POST to the service failed (an HTML page of the gateway / no answer at all): RvApiService.parseOrWrap wraps what it got, and the
    // counts before / after and the search by the remark are made as always — nothing was saved, so the totals stay
    const remark = String(req.remark ?? '').trim();
    const found = remark ? listItems(s, new URLSearchParams({ search: remark, page: '1', pageSize: '1' })).total : -1;
    return json({ api: { ...REST_FAIL_ENVELOPE, raw: fault === 'rest-create-html' ? REST_HTML_502 : '' }, verify: verify(totalBefore, found > 0, found) });
  }
  if (fault === 'create-reject') return rejected(msg('ผู้ชำระเงินนี้ยังไม่มีรหัสลูกค้าในระบบ ERP'));
  // (for the comparison: the rejection says what the backend received, so the result box shows the payload both sides sent)
  if (fault === 'create-echo') return rejected(JSON.stringify(req));
  if (fault === 'create-details') return json({ api: { status: 422, message: 'Unprocessable', error: { details: { items: ['materialCode ไม่ถูกต้อง'], payments: 'ยอดไม่ครบ' } } }, verify: verify(totalBefore, false, -1) });
  if (fault === 'create-text') return json({ api: { status: 500, message: 'Internal Server Error', error: 'EJB EntityContext null' }, verify: verify(totalBefore, false, -1) });
  if (fault === 'create-empty') return json({ api: {}, verify: verify(totalBefore, false, -1) });

  const payer = prospectByCode(String(req.payerCode ?? '').trim());
  if (!payer) return rejected(msg('ไม่พบผู้ชำระเงิน (payerCode)'));
  if (!BRANCHES.some((b) => b.branchCode === req.branchCode)) return rejected(msg('ไม่พบสาขา (branchCode)'));
  const items = (req.items ?? []).filter((it) => it && MOCK_MATERIALS.some((m) => m.code === it.materialCode) && Number(it.value) > 0);
  if (!items.length || items.length !== (req.items ?? []).length) return rejected(msg('รายการสินค้าไม่ถูกต้อง'));
  if (!(req.payments ?? []).length) return rejected(msg('ต้องมีรายการรับชำระอย่างน้อย 1 รายการ'));
  const allowed = new Set(ATTACH_FILE_TYPES.map((t) => t.name));
  if ((req.attachments ?? []).some((a) => !allowed.has(String(a.fileType)))) return rejected(msg('ประเภทไฟล์แนบไม่ได้รับอนุญาต'));

  const seq = s.nextSeq++;
  const employee = SEED_EMPLOYEES[0];
  const date = String(req.txDate ?? '').slice(0, 10) || '2026-10-20';
  const doc: RvDoc = {
    id: s.nextId++,
    txno: `RV:00-2026-1020-120000-${pad(seq, 4)}`,
    erpTxno: '',
    txdate: date,
    status: 'new',
    createByName: employee.name,
    createByCode: employee.code,
    oldNames: false,
    payerCode: payer.code,
    payerName: payer.name,
    leadTxNo: String(req.referenceDocNo ?? ''),
    taxInvoiceNo: String(req.taxInvoiceNo ?? ''),
    currency: String(req.currencyCode ?? 'THB') || 'THB',
    exchangeRate: Number(req.exchangeRate) || 1,
    description: String(req.remark ?? ''),
    branchCode: String(req.branchCode),
    items: items.map((it) => ({ materialCode: it.materialCode, detail: String(it.detail ?? ''), value: Number(it.value), taxPercent: Number(it.taxPercent) || 0, withholdingPercent: Number(it.withholdingPercent) || 0 })),
    payments: (req.payments ?? []).map((p) => ({ methodCode: String(p.methodCode), amount: Number(p.amount) })),
  };
  s.docs.unshift(doc);
  const remark = doc.description ? s.docs.filter((d) => d.description === doc.description).length : -1;
  if (fault === 'create-pending') {
    // the backend answers success but the receipt is not in the list yet (it is issued asynchronously)
    s.docs.shift();
    return json({ api: { status: 200, message: 'success', result: { result: true, txno: doc.txno } }, verify: verify(totalBefore, false, -1) });
  }
  return json({ api: { status: 200, message: 'success', result: { result: true, txno: doc.txno } }, verify: verify(s.docs.length, true, remark) });
}

/* ------------------------------------------------------------------------------------------------ prefill from a lead */

/**
 * GET /board/lead?id=[&activityGroupId=] (LeadDetailServlet): the lead the receipt is made from. A lead that works in more than one
 * activity group at once answers 400 unless the group is given (every 7th lead of the cast does).
 */
function leadDetail(q: URLSearchParams, fault: string): Response {
  if (fault === 'lead-down') return down();
  const id = Number(q.get('id'));
  if (fault === 'lead-error') return json({ status: 500, message: 'internal error', error: { code: 'INTERNAL', message: 'ระบบขัดข้อง ลองใหม่อีกครั้ง' } }, 500);
  if (!isKnownLead(id)) return json({ status: 404, message: 'not found', error: { code: 'LEAD_NOT_FOUND', message: 'ไม่พบข้อมูลลีด' } }, 404);
  if (id % 7 === 0 && !(q.get('activityGroupId') ?? '').trim()) {
    return json({ status: 400, message: 'bad request', error: { code: 'ACTIVITY_GROUP_REQUIRED', message: 'ต้องระบุ activityGroupId — ลีดนี้ทำงานอยู่หลายกลุ่มขั้นตอนพร้อมกัน' } }, 400);
  }
  const l = seedLead(id);
  const materialList: { id: number; code: string; name: string }[] = [];
  if (id % 5 !== 0) {
    for (let k = 0; k <= id % 3; k++) {
      const m = MOCK_MATERIALS[(id + k) % MOCK_MATERIALS.length];
      materialList.push({ id: 1004400000 + id * 10 + k, code: m.code, name: m.name });
    }
    // a product of the lead that is not in the master data of the form (closed for sale): the form adds it to its list
    if (id % 11 === 0) materialList.push({ id: 1004400000 + id * 10 + 9, code: 'SV-LEGACY', name: 'บริการเดิม (ไม่อยู่ใน master)' });
  }
  return json({ id, txNo: leadTxNo(id, l.createdDate), prospect: { id: l.prospectId, name: l.customerName }, materialList });
}

/** GET /board/prospect?id= (ProspectDetailServlet → the prospect, `code` is what the form sends as payerCode; every 5th has an ERP code "CUS…") */
function prospectDetail(q: URLSearchParams, fault: string): Response {
  if (fault === 'prospect-down') return down();
  const id = Number(q.get('id'));
  if (!isKnownProspect(id)) return json({ status: 404, message: 'not found' }, 404);
  const p = seedProspect(id);
  return json({ id, code: id % 5 === 0 ? `CUS${pad(id, 5)}` : p.code, name: p.fullName, phone: p.phone, email: p.email });
}

/** GET /board/prospect-list (enrich=1): the suggestions under the search field — { status, message, result: { items, meta } } */
function prospectList(q: URLSearchParams): Response {
  const text = (q.get('searchText') ?? '').trim().toLowerCase();
  const page = Math.max(1, Number(q.get('page')) || 1);
  const perPage = Math.max(1, Number(q.get('perPage')) || 20);
  const rows = [];
  for (const id of prospectIds()) {
    const p = seedProspect(id);
    const addr = prospectAddress(id);
    if (text && ![p.code, p.fullName, p.phone, p.email, addr].join(' ').toLowerCase().includes(text)) continue;
    rows.push({ id, code: p.code, name: p.fullName, phone: p.phone, email: p.email, addr, province: p.province, avatar: '' });
  }
  const items = rows.slice((page - 1) * perPage, page * perPage);
  return json({ status: 200, message: 'success', result: { items, meta: { page, perPage, total: rows.length, totalPages: Math.ceil(rows.length / perPage) } } });
}

/* ------------------------------------------------------------------------------------------------ files */

/**
 * `/rvreport?txno=[&format=png]` (RvJasperReportServlet) and `/rvreceipt?id=` (RvReceiptPdfServlet). The path may carry the context
 * path of the Java app (`/triplesale/rvreport?…`).
 */
export function mockReceiptFile(url: string): ReceiptFile {
  const u = new URL(url, 'http://x');
  const path = u.pathname.replace(/^.*\/(rvreport|rvreceipt)$/, '/$1');
  if (path === '/rvreport') {
    const txno = (u.searchParams.get('txno') ?? '').trim();
    if (!txno || !/^[A-Za-z0-9:-]+$/.test(txno)) return { status: 400, type: 'text/plain; charset=UTF-8', body: textBody('ต้องระบุ txno (เลขที่เอกสาร RV) ให้ถูกต้อง') };
    // the ERP knows only its own numbers: a CRM number comes back as a blank form in the real system — here it is "not found"
    const doc = state().docs.find((d) => d.erpTxno === txno);
    if (!doc) return { status: 502, type: 'text/plain; charset=UTF-8', body: textBody('ระบบรายงานไม่คืน PDF: Error: document not found ' + txno) };
    if ((u.searchParams.get('format') ?? '').toLowerCase() === 'png') return { status: 200, type: 'image/png', body: makePng(doc.id) };
    const t = docTotals(doc);
    return { status: 200, type: 'application/pdf', body: makePdf('RV-01 RECEIPT ' + txno, [`Date ${doc.txdate}`, `Payer ${doc.payerCode}`, `Net amount ${t.netAfterVat.toFixed(2)} ${doc.currency}`, '(sample file of the mock backend)']) };
  }
  if (path === '/rvreceipt') {
    const id = (u.searchParams.get('id') ?? '').trim();
    if (!id) return { status: 400, type: 'text/plain; charset=UTF-8', body: textBody('missing id') };
    const doc = state().docs.find((d) => String(d.id) === id);
    if (!doc) return { status: 404, type: 'text/plain; charset=UTF-8', body: textBody('receipt not found') };
    const t = docTotals(doc);
    return { status: 200, type: 'application/pdf', body: makePdf('RECEIPT ' + doc.txno, [`Date ${doc.txdate}`, `Payer ${doc.payerCode}`, `Net amount ${t.netAfterVat.toFixed(2)} ${doc.currency}`, '(made from the CRM data)']) };
  }
  return { status: 404, type: 'text/plain; charset=UTF-8', body: textBody('not found ' + url) };
}

/* ------------------------------------------------------------------------------------------------ entry */

const sleep = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms));

/** a backend for one screen: `fetch` answers the BFF requests of the page, `file` the report addresses */
export function createMockReceipts(options: MockReceiptsOptions = {}): ReceiptsBackend {
  // the changes of the user are kept in Datasource/journal.receipts.json (mockup file server) and replayed at the next start
  return journaledBackend('receipts', makeMockReceipts, options);
}

function makeMockReceipts(options: MockReceiptsOptions = {}): ReceiptsBackend {
  const delayMs = options.delayMs ?? 150;
  const fault = options.fault ?? '';
  return {
    async fetch(input: string, init?: RequestInit): Promise<Response> {
      if (delayMs) await sleep(delayMs);
      if (fault === 'slow') await sleep(3000);
      const url = new URL(String(input), 'http://x');
      const method = (init?.method ?? 'GET').toUpperCase();
      // the paths may carry the context path of the Java app
      const path = url.pathname.replace(/^\/triplesale(?=\/)/, '');
      if (path === '/rvapi') return rvapi(method, url.searchParams, init, fault);
      if (path === '/board/prospect-list') return prospectList(url.searchParams);
      if (path === '/board/lead') return leadDetail(url.searchParams, fault);
      if (path === '/board/prospect') return prospectDetail(url.searchParams, fault);
      return json({ message: 'not found ' + path }, 404);
    },
    file: mockReceiptFile,
  };
}

/** the receipt rows as the form needs to find them (tests, the create handler of receipt-form) */
export const mockReceiptDocs = (): readonly RvDoc[] => state().docs;
/** the leads of the cast, newest first (what GET /rv/leads is made from — the fake REST service of the live comparison) */
export const mockLeadRows = (): readonly MockLead[] => state().leads;
export const MOCK_BRANCH = SEED_BRANCH;
