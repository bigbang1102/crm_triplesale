/**
 * Deterministic fake backend of the sales-document forms (quotation · booking · delivery note · auto-dealer quotation · auto-dealer booking;
 * dev / `mock: true`, the unit tests and the Java-vs-Angular comparison).
 *
 * It answers in exactly the shapes the Java servlets answered (see sales-doc-backend.ts): the customers of the pick are the people of the shared
 * cast (`@core/mock/crm-seed`, prospect `n`), the products are a small catalogue with the prices the rounding edge cases need, the attachments
 * are kept per customer at module level (what you attach is what the next GET lists), and the master data of the auto-dealer forms is the
 * file the Java page fetches itself.
 *
 * Framework-free on purpose (no Angular imports): the comparison harness loads this file in Node.
 *
 * Faults (the page address carries `?mock=<name>` in mock mode; the harness passes the same to the Java side) — to see the error and empty
 * states of the screens:
 *   prospects-empty / prospects-error / prospects-down / slow-prospects    the customer pick: no customers / 500 / no answer at all / 3 s
 *   materials-empty / materials-error / slow-materials                      the items: no products / 500 / 3 s
 *   attach-fail / attach-unverified / attach-down / attach-bad / slow-attach  the upload: 500 + message / 200 but verified=false / no answer / 400 / 3 s
 *   attach-delete-fail / attach-list-empty / attach-list-error              the delete of an uploaded file: refused / the list has no such file / the list fails
 *   jobs-error / jobs-empty                                                 the occupations of the customer pop-up
 *   prospects-taxid                                                         the customer rows carry a `taxId` (the servlet of today sends none; the "no duplicate tax id" check of the quotation needs it)
 *   master-error / master-down                                              the master data of the auto-dealer forms
 */
import { reference } from '@core/mock/reference';
import { SEED_PROSPECT_COUNT, SEED_GROUPS, prospectIds, seedHash, seedProspect } from '@core/mock/crm-seed';
import { AUTO_DEALER_MASTER_JSON } from './auto-dealer-master';
import type { SalesDocBackend } from './sales-doc-backend';
import { journaledBackend } from '@core/mockup/mockup-journal';
import { mockupEnabled } from '@core/mockup/mockup-datasource';

export interface MockSalesDocOptions {
  /** latency of every answer (the comparison harness passes 0 and delays by itself) */
  delayMs?: number;
  /** a fault to show, see the list above */
  fault?: string;
}

/* ------------------------------------------------------------------------------------------------ masters */

/** GET /rvapi?action=materials → { result: [{ code, name, salePrice }] } (salePrice = standardSalePrice, 0 = none) */
export const MOCK_MATERIALS = reference('salesDoc.materials', [
  { code: 'ACC-A001', name: 'ผ้าคลุมรถยนต์ กันแดด กันฝน', salePrice: 1092.5 },
  { code: 'ACC-A002', name: 'กล้องติดรถยนต์ หน้า-หลัง', salePrice: 3290 },
  { code: 'ACC-A003', name: 'ฟิล์มกรองแสง เซรามิก (ทั้งคัน)', salePrice: 8900 },
  { code: 'ACC-A004', name: 'พรมปูพื้นรถยนต์ 5D', salePrice: 1590.99 },
  { code: 'ACC-A005', name: 'เซ็นเซอร์ถอยหลัง 4 จุด', salePrice: 1250 },
  { code: 'SV-INSPECT', name: 'ค่าบริการตรวจเช็คสภาพรถ', salePrice: 650.75 },
  { code: 'SV-REG', name: 'ค่าบริการจดทะเบียน', salePrice: 3500 },
  { code: 'SV-DELIVERY', name: 'ค่าบริการส่งมอบรถถึงบ้าน', salePrice: 2000 },
  { code: 'PT-OIL5W30', name: 'น้ำมันเครื่องสังเคราะห์แท้ 5W-30 (4 ลิตร)', salePrice: 1890 },
  { code: 'PT-BRAKE', name: 'ผ้าเบรกหน้า ชุดละ 4 ชิ้น', salePrice: 2450.25 },
  { code: 'PT-TIRE', name: 'ยางรถยนต์ 205/55 R16 (ต่อเส้น)', salePrice: 2790 },
  { code: 'FREE-GIFT', name: 'ของสมนาคุณ (ไม่คิดมูลค่า)', salePrice: 0 },
  { code: 'SV-LONGNAME', name: 'ค่าบริการที่ปรึกษาด้านการเงินและสินเชื่อรถยนต์ครบวงจร (แพ็กเกจพิเศษ ประจำปี 2569 สำหรับลูกค้าเดิมและลูกค้าใหม่)', salePrice: 12500 },
] as const);

/** GET /board/chat-master-data?type=occupations → result.items (the backend's `master-data/occupations` page) */
export const MOCK_OCCUPATIONS = reference('salesDoc.occupations', [
  { code: 'OC01', name: 'Government officer', nameTh: 'ข้าราชการ' },
  { code: 'OC02', name: 'Employee', nameTh: 'พนักงานบริษัท' },
  { code: 'OC03', name: 'Business owner', nameTh: 'เจ้าของกิจการ' },
  { code: 'OC04', name: 'Freelance', nameTh: 'อาชีพอิสระ' },
  { code: 'OC05', name: 'Farmer', nameTh: 'เกษตรกร' },
  { code: 'OC06', name: 'Student', nameTh: 'นักเรียน/นักศึกษา' },
  { code: 'OC07', name: 'No name in Thai', nameTh: '' },
] as const);

/** the address line of a customer of the pick: made from the id so that it is stable */
export const prospectAddress = (id: number): string => `${10 + (id % 90)}/${1 + (id % 9)} หมู่ ${1 + (id % 8)} ต.ในเมือง อ.เมือง จ.${seedProspect(id).province}`;

/** a valid Thai tax id (13 digits, check digit) made from the id of the customer: `1` + the id padded to 11 digits + the check digit */
export const taxIdOf = (id: number): string => {
  const base = '1' + String(id).padStart(11, '0');
  const sum = [...base].reduce((acc, d, i) => acc + Number(d) * (13 - i), 0);
  return base + String((11 - (sum % 11)) % 10);
};

/* ------------------------------------------------------------------------------------------------ state (the attachments) */

interface Attached {
  prospectId: number;
  /** detailOrderNo of the backend: 1, 2, 3 … per customer */
  docNo: number;
  fileName: string;
  description: string;
  url: string;
}
let attached: Attached[] = [];
/** a fresh start (tests, one scenario of the harness) */
export function resetMockSalesDoc(): void {
  attached = [];
}
/** what is attached to a customer (tests) */
export const mockAttachments = (prospectId: number): readonly Attached[] => attached.filter((a) => a.prospectId === prospectId);

/* ------------------------------------------------------------------------------------------------ answers */

const JSON_TYPE = 'application/json; charset=UTF-8';
/**
 * A Response built in the page words a JSON syntax error with a "Failed to execute 'json' on 'Response': " prefix, a Response that came
 * over the network (what the live backend gives, and what the Java page gets) does not — the pages show that text to the user, so the mock
 * answers like the network does.
 */
const asNetwork = (res: Response): Response => {
  Object.defineProperty(res, 'json', { value: () => res.text().then((t) => JSON.parse(t)) });
  return res;
};
const json = (body: unknown, status = 200): Response => asNetwork(new Response(JSON.stringify(body), { status, headers: { 'content-type': JSON_TYPE } }));
const down = (): never => {
  throw new TypeError('Failed to fetch');
};
const sleep = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms));

/** GET /board/prospect-list (enrich=1) → { status, message, result: { items, meta } } — the keys of ProspectListService.toRow */
function prospectList(q: URLSearchParams, fault: string): Response {
  if (fault === 'prospects-error') return json({ status: 500, message: 'โหลดรายชื่อลูกค้าไม่สำเร็จ' }, 500);
  const text = (q.get('searchText') ?? '').trim().toLowerCase();
  const page = Math.max(1, Number(q.get('page')) || 1);
  const perPage = Math.max(1, Number(q.get('perPage')) || 20);
  const rows: Record<string, unknown>[] = [];
  if (fault !== 'prospects-empty') {
    for (const id of prospectIds()) {
      const p = seedProspect(id);
      const addr = prospectAddress(id);
      if (text && ![p.code, p.fullName, p.phone, p.email, addr, fault === 'prospects-taxid' ? taxIdOf(id) : ''].join(' ').toLowerCase().includes(text)) continue;
      rows.push({
        id,
        code: p.code,
        name: p.fullName,
        date: p.createdDate,
        source: p.source,
        phone: p.phone,
        phonecc: '+66',
        countrycode: 'TH',
        addr,
        province: p.province,
        district: 'เมือง',
        country: 'ไทย',
        agentcode: 'E101',
        agent: 'สมชาย ใจดี',
        team: id % 7 === 0 ? '' : SEED_GROUPS[seedHash(id, 9) % SEED_GROUPS.length].name,
        recorder: 'demo',
        avatar: '',
        gender: id % 2 ? 'M' : 'F',
        type: 'P',
        email: p.email,
        ...(fault === 'prospects-taxid' ? { taxId: taxIdOf(id) } : {}),
      });
    }
  }
  const items = rows.slice((page - 1) * perPage, page * perPage);
  return json({ status: 200, message: 'success', result: { items, meta: { page, perPage, total: rows.length, totalPages: Math.ceil(rows.length / perPage) } } });
}

/** `/board/prospect/attachments`: POST upload · GET list · DELETE one */
function attachments(method: string, q: URLSearchParams, init: RequestInit | undefined, fault: string): Response {
  if (method === 'GET') {
    const pid = Number(q.get('prospectId'));
    if (!(pid > 0)) return json({ status: 400, message: 'prospectId required' }, 400);
    if (fault === 'attach-list-error') return json({ status: 500, message: 'Internal Server Error' }, 500);
    const rows = fault === 'attach-list-empty' ? [] : attached.filter((a) => a.prospectId === pid);
    return json({ status: 200, message: 'success', result: rows.map((a) => ({ detailOrderNo: a.docNo, attachFile: a.url, description: a.description, attachFileTypeCode: 'DOC' })) });
  }
  if (method === 'POST') {
    if (fault === 'attach-down') return down();
    let body: Record<string, unknown> = {};
    try {
      body = JSON.parse(String(init?.body ?? '{}')) as Record<string, unknown>;
    } catch {
      /* not JSON: the checks below answer 400 */
    }
    const pid = Number(body['prospectId']);
    const base64 = String(body['fileContentBase64'] ?? '');
    const fileName = String(body['fileName'] ?? 'document');
    if (fault === 'attach-bad' || !(pid > 0) || !base64.trim()) return json({ status: 400, message: 'prospectId และไฟล์จำเป็นต้องมี' }, 400);
    const ext = fileName.includes('.') ? fileName.slice(fileName.lastIndexOf('.')).toLowerCase() : '';
    if (!['.pdf', '.png', '.jpg', '.jpeg', '.gif', '.webp', '.doc', '.docx', '.xls', '.xlsx', '.csv', '.txt', '.ppt', '.pptx', '.zip', '.rar', '.7z'].includes(ext)) {
      return json({ status: 400, message: 'ไม่รองรับไฟล์ประเภทนี้ (รองรับ: .7z, .csv, .doc, .docx, .gif, .jpeg, .jpg, .pdf, .png, .ppt, .pptx, .rar, .txt, .webp, .xls, .xlsx, .zip)' }, 400);
    }
    if (fault === 'attach-fail') return json({ status: 500, message: 'อัปโหลดไฟล์ไม่สำเร็จ', raw: '{}' }, 500);
    const docNo = attached.filter((a) => a.prospectId === pid).length + 1;
    const url = `/files/prospects/${pid}/${docNo}-${encodeURIComponent(fileName)}`;
    attached.push({ prospectId: pid, docNo, fileName, description: String(body['description'] ?? fileName), url });
    const verified = fault !== 'attach-unverified';
    return json({ status: 200, verified, verifyReason: verified ? 'OK' : 'NOT_FOUND', message: verified ? 'success' : 'ไฟล์ถูกบันทึกแล้ว แต่ตรวจไม่พบไฟล์บนที่เก็บไฟล์', result: { attachFile: url } });
  }
  if (method === 'DELETE') {
    const pid = Number(q.get('prospectId'));
    // parseLong(req.getParameter("docNo"), -1): a missing or non-numeric number is -1 (refused)
    const rawNo = (q.get('docNo') ?? '').trim();
    const docNo = /^\d+$/.test(rawNo) ? Number(rawNo) : -1;
    if (!(pid > 0) || !(docNo >= 0)) return json({ status: 400, message: 'prospectId และ docNo จำเป็นต้องมี' }, 400);
    if (fault === 'attach-delete-fail') return json({ status: 502, message: 'ลบเอกสารไม่สำเร็จ: backend ไม่ตอบ' }, 502);
    attached = attached.filter((a) => !(a.prospectId === pid && a.docNo === docNo));
    return json({ status: 200, message: 'success' });
  }
  return json({ status: 405, message: 'method not allowed' }, 405);
}

/** GET /board/chat-master-data?type=… (only the types the sales documents use) */
function chatMasterData(q: URLSearchParams, fault: string): Response {
  const type = (q.get('type') ?? '').trim();
  if (type !== 'occupations') return json({ status: 400, message: 'invalid type (marketing-channels|employees|sale-persons|branches|products)' }, 400);
  if (fault === 'jobs-error') return json({ status: 500, message: 'Internal Server Error' }, 500);
  return json({ status: 200, message: 'success', result: { items: fault === 'jobs-empty' ? [] : MOCK_OCCUPATIONS } });
}

/* ------------------------------------------------------------------------------------------------ entry */

/** a backend for one screen: `fetch` answers the requests of the page scripts */
export function createMockSalesDoc(options: MockSalesDocOptions = {}): SalesDocBackend {
  // the changes of the user are kept in Datasource/journal.sales-doc.json (mockup file server) and replayed at the next start
  return journaledBackend('sales-doc', makeMockSalesDoc, options);
}

function makeMockSalesDoc(options: MockSalesDocOptions = {}): SalesDocBackend {
  const delayMs = options.delayMs ?? 150;
  // the mockup customers carry a tax id (the ob / aq / ad forms refuse a customer without one, and no save would ever happen)
  const fault = options.fault || (mockupEnabled() ? 'prospects-taxid' : '');
  return {
    async fetch(input: string, init?: RequestInit): Promise<Response> {
      if (delayMs) await sleep(delayMs);
      const url = new URL(String(input), 'http://x');
      const method = (init?.method ?? 'GET').toUpperCase();
      // the paths may carry the context path of the Java app
      const path = url.pathname.replace(/^\/triplesale(?=\/)/, '');
      if (path === '/board/prospect-list') {
        if (fault === 'prospects-down') return down();
        if (fault === 'slow-prospects') await sleep(3000);
        return prospectList(url.searchParams, fault);
      }
      if (path === '/rvapi') {
        if ((url.searchParams.get('action') ?? '') !== 'materials') return json({ message: 'unknown action' }, 400);
        if (fault === 'slow-materials') await sleep(3000);
        if (fault === 'materials-error') return json({ message: 'internal error' }, 500);
        if (fault === 'materials-empty') return json({ result: [] });
        return json({ result: MOCK_MATERIALS.map((m) => ({ code: m.code, name: m.name, salePrice: m.salePrice })) });
      }
      if (path === '/board/prospect/attachments') {
        if (fault === 'slow-attach' && method === 'POST') await sleep(3000);
        return attachments(method, url.searchParams, init, fault);
      }
      if (path === '/board/chat-master-data') return chatMasterData(url.searchParams, fault);
      if (path === '/resources/mock/auto_dealer_master.json') {
        if (fault === 'master-down') return down();
        if (fault === 'master-error') return new Response('Not Found', { status: 404 });
        return asNetwork(new Response(AUTO_DEALER_MASTER_JSON, { status: 200, headers: { 'content-type': JSON_TYPE } }));
      }
      return json({ message: 'not found ' + path }, 404);
    },
  };
}
