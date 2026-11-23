import { msg, reference } from '@core/mock/reference';
/* eslint-disable */
/**
 * Fake backend for the AI Document Translator screen — served when `mock: true` (npm start) and by the unit tests.
 *
 * It answers every call the page script makes, with the same JSON shapes as the real services:
 *   GET  <ctx>/aitran?action=list              { ok, stats[], documents[] }            (servlet AiTranProxyServlet -> aitran-service)
 *   GET  <ctx>/aitran?action=translated&no=    { ok, files[] }
 *   POST <ctx>/aitran?action=save              multipart  customerId/…/file_i/path_i   -> { ok, quoteNo, files, pages, price }
 *   POST <ctx>/aitran?action=edit              multipart  no/contact/tel/email/docType/srcLang/dstLang/dueAt/remark
 *   POST <ctx>/aitran?action=confirm|translate|send|approve|reject|complete|cancel   multipart  no[, reason]
 *   POST <ctx>/aitran?action=chat              form       message, quoteNo             -> { ok, reply }
 *   GET  <ctx>/aitran?action=quotation|file    a document for window.open (see mockAitranDocument)
 *   GET  <ctx>/board/prospect-list?…           customer search                         -> { status, message, result:{ items, meta } }
 * and a fake XMLHttpRequest (`createMockXhr`) so the upload progress path runs too.
 *
 * The status flow is the real one (quoted → pending → translating → reviewing → sent → approved → done, cancelled), the
 * transitions are checked like the server does (409 + conflict when the status moved on), and a document sent to translation
 * comes back as "reviewing" after two more list calls — what the polling of the page waits for.
 *
 * Standalone on purpose (no Angular imports, only erasable TypeScript): the Node harness that compares this screen with the
 * Java one imports this very file, so both pages are fed identical data.
 * Set `globalThis.__AIT_MOCK_NOW` (ISO string) to freeze the clock the sample data is laid out against.
 */

type Json = any;

const DAY = 86_400_000;
const nowMs = (): number => {
  const frozen = (globalThis as any).__AIT_MOCK_NOW;
  return frozen ? Date.parse(frozen) : Date.now();
};

function res(body: Json, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
}

/* ─────────────────────────────────────────────────────────────── Thai dates ("8 ก.ย. 2569 09:44") */
const TH_MON = reference('translator.thaiMonths', ['ม.ค.', 'ก.พ.', 'มี.ค.', 'เม.ย.', 'พ.ค.', 'มิ.ย.', 'ก.ค.', 'ส.ค.', 'ก.ย.', 'ต.ค.', 'พ.ย.', 'ธ.ค.']);
const pad = (n: number): string => String(n).padStart(2, '0');
function thaiDate(ms: number): string {
  const d = new Date(ms);
  return `${d.getDate()} ${TH_MON[d.getMonth()]} ${d.getFullYear() + 543}`;
}
function thaiDateTime(ms: number): string {
  const d = new Date(ms);
  return `${thaiDate(ms)} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

/* ─────────────────────────────────────────────────────────────── reference data */
const STATUS_ORDER = reference('translator.statusOrder', ['quoted', 'pending', 'translating', 'reviewing', 'sent', 'approved', 'done']);
const STATUS_LABEL: Record<string, string> = reference<Record<string, string>>('translator.statusLabels', {
  quoted: 'เสนอราคา',
  pending: 'รอแปล',
  translating: 'กำลังแปล',
  reviewing: 'ตรวจงานแปล',
  sent: 'ส่งรับรองงานแปล',
  approved: 'อนุมัติงานแปล',
  done: 'เสร็จสมบูรณ์',
  cancelled: 'ยกเลิก',
});
const STAT_STYLE: Record<string, { color: string; icon: string }> = reference<Record<string, { color: string; icon: string }>>('translator.statStyles', {
  all: { color: '#6043B6', icon: 'fa-regular fa-file-lines' },
  quoted: { color: '#0EA5E9', icon: 'fa-regular fa-envelope' },
  pending: { color: '#FF8E4E', icon: 'fa-regular fa-clock' },
  translating: { color: '#4B84FF', icon: 'fa-solid fa-spinner' },
  reviewing: { color: '#D97706', icon: 'fa-regular fa-circle-user' },
  sent: { color: '#0D9488', icon: 'fa-regular fa-paper-plane' },
  approved: { color: '#6D28D9', icon: 'fa-regular fa-circle-check' },
  done: { color: '#008B5A', icon: 'fa-regular fa-circle-check' },
});
const TIMELINE_STEPS = reference('translator.timelineSteps', ['สร้างเอกสาร', 'เสนอราคา', 'ลูกค้าตอบรับ', 'รอแปล', 'กำลังแปล', 'ตรวจงานแปล', 'ส่งรับรองงานแปล', 'อนุมัติงานแปล', 'เสร็จสมบูรณ์']);
/** index in TIMELINE_STEPS reached by each status */
const STEP_OF: Record<string, number> = reference('translator.stepOfStatus', { quoted: 1, pending: 3, translating: 4, reviewing: 5, sent: 6, approved: 7, done: 8 });
const LANG: Record<string, string> = reference('translator.languages', { AUTO: 'ตรวจอัตโนมัติ', TH: 'ไทย', EN: 'อังกฤษ', ZH: 'จีน', JA: 'ญี่ปุ่น' });

const CUSTOMERS = reference('translator.customers', [
  { id: 101, code: 'CUS-000101', name: 'บริษัท เอซีอี โซลูชั่น จำกัด', phone: '081-234-5678', email: 'sakol@ace-solution.example.com', addr: '123/45 อาคารซันเชอร์ ชั้น 10 ถ.สาทรเหนือ แขวงสีลม เขตบางรัก กรุงเทพฯ 10500', district: 'บางรัก', province: 'กรุงเทพมหานคร', type: 'นิติบุคคล', source: 'เว็บไซต์', agent: 'S000 S000', availtime: '09:00-17:00', line: 'ace.solution', fb: '', ig: '' },
  { id: 102, code: 'CUS-000102', name: 'Somchai Industrial Co., Ltd.', phone: '02-555-0102', email: 'purchasing@somchai-ind.example.com', addr: '88 Moo 4 Bangna-Trad Rd., Bangplee, Samutprakan 10540', district: 'บางพลี', province: 'สมุทรปราการ', type: 'นิติบุคคล', source: 'แนะนำ', agent: 'S001 Sales One', availtime: '-', line: '', fb: 'somchai.industrial', ig: '' },
  { id: 103, code: 'CUS-000103', name: 'คุณกัญญารัตน์ วงศ์สกุล', phone: '089-765-4321', email: 'kanyarat.w@example.com', addr: '45/6 ซ.ลาดพร้าว 71 เขตวังทองหลาง กรุงเทพฯ 10310', district: 'วังทองหลาง', province: 'กรุงเทพมหานคร', type: 'บุคคลธรรมดา', source: 'LINE', agent: 'S000 S000', availtime: 'หลัง 18:00', line: 'kanyarat.w', fb: 'kanyarat.wongsakul', ig: 'kanyarat.w' },
  { id: 104, code: 'CUS-000104', name: 'ห้างหุ้นส่วนจำกัด ธนวัฒน์ เทรดดิ้ง', phone: '053-211-304', email: 'sales@thanawat-trading.example.com', addr: '9 ถ.ห้วยแก้ว ต.สุเทพ อ.เมือง เชียงใหม่ 50200', district: 'เมืองเชียงใหม่', province: 'เชียงใหม่', type: 'นิติบุคคล', source: 'Facebook', agent: 'S002 Sales Two', availtime: '08:30-16:30', line: '', fb: 'thanawat.trading', ig: '' },
  { id: 105, code: 'CUS-000105', name: 'Michael Brown', phone: '092-333-4444', email: 'michael.brown@example.com', addr: '55 Sukhumvit 31, Khlong Toei Nuea, Watthana, Bangkok 10110', district: 'วัฒนา', province: 'กรุงเทพมหานคร', type: 'บุคคลธรรมดา', source: 'เว็บไซต์', agent: '', availtime: '-', line: '', fb: '', ig: 'mbrown_bkk' },
  { id: 106, code: 'CUS-000106', name: 'บริษัท สยามเอ็นจิเนียริ่ง จำกัด', phone: '02-777-0106', email: '', addr: '300 ถ.พระราม 3 เขตบางคอแหลม กรุงเทพฯ 10120', district: 'บางคอแหลม', province: 'กรุงเทพมหานคร', type: 'นิติบุคคล', source: 'โทรศัพท์', agent: 'S001 Sales One', availtime: '-', line: '', fb: '', ig: '' },
]);

/* ─────────────────────────────────────────────────────────────── state */
interface Doc {
  no: string;
  customerId: number;
  customer: string;
  status: string;
  files: number;
  pages: number;
  price: number;
  createdMs: number;
  dueMs: number | null;
  docType: string;
  srcLang: string;
  dstLang: string;
  contact: string;
  agent: string;
  tel: string;
  email: string;
  sizeMb: number;
  remark: string;
  fileNames: string[];
  rejectReason: string;
  rejectCount: number;
  cancelReason: string;
  /** list calls left until a document that is being translated is finished (-1 = a seed document, stays) */
  ticks: number;
  history: { atMs: number; by: string; text: string }[];
  /** the status the document had when it was cancelled (the timeline shows how far it got) */
  stoppedAt: string;
}

let seq = 0;
let docs: Doc[] = [];

function doc(p: Partial<Doc> & Pick<Doc, 'no' | 'customerId' | 'status' | 'files' | 'pages' | 'price'> & { daysAgo: number; dueIn?: number | null }): Doc {
  const c = CUSTOMERS.find((x) => x.id === p.customerId)!;
  const createdMs = nowMs() - p.daysAgo * DAY - 3 * 3_600_000;
  const names = ['Invoice_2026_Q1.pdf', 'PO_Company_A.pdf', 'Contract_Summary.pdf', 'Passport_Scan.jpg', 'Bank_Statement.pdf', 'Company_Cert.pdf', 'Annex_1.png', 'Annex_2.png'];
  const d: Doc = {
    customer: c.name,
    createdMs,
    dueMs: p.dueIn === null ? null : createdMs + (p.dueIn ?? 3) * DAY,
    docType: 'เอกสารธุรกิจ',
    srcLang: 'EN',
    dstLang: 'TH',
    contact: '',
    agent: c.agent,
    tel: c.phone,
    email: c.email,
    sizeMb: Math.round(p.files * 3.1 * 100) / 100,
    remark: '',
    fileNames: names.slice(0, p.files),
    rejectReason: '',
    rejectCount: 0,
    cancelReason: '',
    ticks: -1,
    history: [],
    stoppedAt: '',
    ...p,
  } as Doc;
  d.history = [{ atMs: createdMs, by: d.agent || 'ระบบ', text: msg('สร้างรายการและอัปโหลดเอกสาร {0} ไฟล์ ({1} หน้า)', d.files, d.pages) }];
  const reached = STEP_OF[d.status] ?? 1;
  if (reached >= 2) d.history.unshift({ atMs: createdMs + 40 * 60_000, by: 'ระบบ', text: 'ลูกค้าตอบรับใบเสนอราคา' });
  if (reached >= 4) d.history.unshift({ atMs: createdMs + 2 * 3_600_000, by: 'ระบบ AI', text: msg('เริ่มแปลเอกสาร {0} ไฟล์ ({1} หน้า)', d.files, d.pages) });
  if (reached >= 5) d.history.unshift({ atMs: createdMs + 2.5 * 3_600_000, by: 'ระบบ AI', text: 'แปลเอกสารเสร็จ รอผู้ตรวจ' });
  if (reached >= 6) d.history.unshift({ atMs: createdMs + 3 * 3_600_000, by: d.agent || 'ผู้ตรวจ', text: 'ตรวจงานแปลแล้ว ส่งรับรองงานแปลให้ลูกค้า' });
  if (reached >= 7) d.history.unshift({ atMs: createdMs + 20 * 3_600_000, by: 'ระบบ', text: 'ลูกค้าอนุมัติงานแปล' });
  if (reached >= 8) d.history.unshift({ atMs: createdMs + 21 * 3_600_000, by: d.agent || 'ผู้ใช้', text: 'ปิดงาน' });
  return d;
}

export function resetMockTranslator(): void {
  seq = 14;
  docs = [
    doc({ no: 'QT-2026-00014', customerId: 101, status: 'quoted', files: 3, pages: 26, price: 3900, daysAgo: 0, dueIn: 4, contact: 'คุณสกล นามสมมติ' }),
    doc({ no: 'QT-2026-00013', customerId: 102, status: 'pending', files: 2, pages: 14, price: 2100, daysAgo: 1, dueIn: 3, docType: 'เอกสารเทคนิค' }),
    doc({ no: 'QT-2026-00012', customerId: 103, status: 'pending', files: 1, pages: 4, price: 600, daysAgo: 2, dueIn: 2, docType: 'เอกสารส่วนตัว', rejectReason: 'คำศัพท์เฉพาะทางแปลผิด ตกหน้า 3', rejectCount: 2 }),
    doc({ no: 'QT-2026-00011', customerId: 104, status: 'translating', files: 4, pages: 38, price: 5700, daysAgo: 3, dueIn: 5 }),
    doc({ no: 'QT-2026-00010', customerId: 105, status: 'translating', files: 1, pages: 6, price: 900, daysAgo: 4, dueIn: 2, srcLang: 'EN', dstLang: 'TH', docType: 'เอกสารส่วนตัว' }),
    doc({ no: 'QT-2026-00009', customerId: 101, status: 'reviewing', files: 2, pages: 18, price: 2700, daysAgo: 5, dueIn: 3 }),
    doc({ no: 'QT-2026-00008', customerId: 106, status: 'reviewing', files: 3, pages: 22, price: 3300, daysAgo: 7, dueIn: 1, docType: 'เอกสารวิศวกรรม', srcLang: 'TH', dstLang: 'EN' }),
    doc({ no: 'QT-2026-00007', customerId: 102, status: 'sent', files: 2, pages: 12, price: 1800, daysAgo: 9, dueIn: 2 }),
    doc({ no: 'QT-2026-00006', customerId: 103, status: 'sent', files: 1, pages: 3, price: 500, daysAgo: 11, dueIn: 1, docType: 'เอกสารส่วนตัว' }),
    doc({ no: 'QT-2026-00005', customerId: 104, status: 'approved', files: 5, pages: 44, price: 6600, daysAgo: 14, dueIn: 6 }),
    doc({ no: 'QT-2026-00004', customerId: 105, status: 'done', files: 1, pages: 8, price: 1200, daysAgo: 18, dueIn: 2, remark: 'ลูกค้าขอด่วน' }),
    doc({ no: 'QT-2026-00003', customerId: 101, status: 'done', files: 3, pages: 30, price: 4500, daysAgo: 22, dueIn: 5 }),
    doc({ no: 'QT-2026-00002', customerId: 106, status: 'cancelled', files: 2, pages: 10, price: 1500, daysAgo: 26, dueIn: 3, cancelReason: 'ลูกค้าไม่ตอบรับใบเสนอราคา', stoppedAt: 'quoted' }),
    doc({ no: 'QT-2026-00001', customerId: 102, status: 'done', files: 2, pages: 16, price: 2400, daysAgo: 48, dueIn: 4 }),
  ];
}
resetMockTranslator();

/* ─────────────────────────────────────────────────────────────── shapes */
const sizeText = (mb: number): string => (mb >= 1 ? mb.toFixed(2) + ' MB' : Math.max(1, Math.round(mb * 1024)) + ' KB');

function shape(d: Doc): Json {
  const reached = d.status === 'cancelled' ? STEP_OF[d.stoppedAt] ?? 1 : STEP_OF[d.status] ?? 1;
  const timeline = TIMELINE_STEPS.map((label, i) => {
    const state = d.status === 'done' || i < reached ? 'done' : i === reached && d.status !== 'cancelled' ? 'current' : 'future';
    const at = state === 'future' ? '-' : thaiDateTime(d.createdMs + i * 25 * 60_000);
    return { label, at, state };
  });
  const progress = d.status === 'done' || d.status === 'approved' || d.status === 'sent' ? 100 : d.status === 'reviewing' ? 90 : d.status === 'translating' ? 45 : 0;
  return {
    no: d.no,
    customerId: String(d.customerId),
    customer: d.customer,
    status: d.status,
    files: d.files,
    pages: d.pages,
    createdAt: thaiDateTime(d.createdMs),
    dueAt: d.dueMs === null ? '' : thaiDate(d.dueMs),
    price: d.price,
    docType: d.docType,
    langPair: `${LANG[d.srcLang] ?? d.srcLang} → ${LANG[d.dstLang] ?? d.dstLang}`,
    srcLang: d.srcLang,
    dstLang: d.dstLang,
    contact: d.contact,
    agent: d.agent,
    tel: d.tel,
    email: d.email,
    size: sizeText(d.sizeMb),
    progress,
    remark: d.remark,
    rejectReason: d.rejectReason,
    rejectCount: d.rejectCount,
    cancelReason: d.cancelReason,
    timeline,
    docFiles: d.fileNames.map((name, i) => ({
      name,
      ext: name.split('.').pop(),
      size: sizeText(d.sizeMb / Math.max(1, d.files)),
      pages: Math.max(1, Math.round(d.pages / Math.max(1, d.files)) + (i === 0 ? d.pages % Math.max(1, d.files) : 0)),
    })),
    history: d.history.map((h) => ({ at: thaiDateTime(h.atMs), by: h.by, text: h.text })),
  };
}

function stats(): Json[] {
  const live = docs.filter((d) => d.status !== 'cancelled');
  const count = (k: string) => (k === 'all' ? live.length : docs.filter((d) => d.status === k).length);
  return ['all', ...STATUS_ORDER].map((key) => ({
    key,
    label: key === 'all' ? 'ทั้งหมด' : STATUS_LABEL[key],
    value: count(key),
    unit: 'รายการ',
    icon: STAT_STYLE[key].icon,
    color: STAT_STYLE[key].color,
  }));
}

/* ─────────────────────────────────────────────────────────────── actions */
const fail = (status: number, error: string, extra: Json = {}): Response => res({ ok: false, error, ...extra }, status);
const field = (body: any, k: string): string => {
  const v = body && typeof body.get === 'function' ? body.get(k) : null;
  return v === null || v === undefined ? '' : String(v);
};
const isFinal = (s: string): boolean => s === 'done' || s === 'cancelled';

const FLOW: Record<string, { from: string[]; to: string; message: string; history: string }> = {
  confirm: { from: ['quoted'], to: 'pending', message: 'บันทึกว่าลูกค้าตอบรับใบเสนอราคาแล้ว', history: 'ลูกค้าตอบรับใบเสนอราคา' },
  translate: { from: ['pending'], to: 'translating', message: 'ส่งเอกสารเข้าคิวแปลแล้ว', history: 'ส่งเอกสารเข้าคิวแปล' },
  send: { from: ['reviewing'], to: 'sent', message: 'ส่งรับรองงานแปลให้ลูกค้าแล้ว', history: 'ส่งรับรองงานแปลให้ลูกค้า' },
  approve: { from: ['sent'], to: 'approved', message: 'บันทึกว่าลูกค้าอนุมัติงานแปลแล้ว', history: 'ลูกค้าอนุมัติงานแปล' },
  complete: { from: ['approved'], to: 'done', message: 'ปิดงานเรียบร้อย', history: 'ปิดงาน' },
};

function flow(action: string, body: any): Response {
  const no = field(body, 'no');
  const d = docs.find((x) => x.no === no);
  if (!d) return fail(404, msg('ไม่พบเอกสาร ') + no);
  const reason = field(body, 'reason').trim();
  if (action === 'reject') {
    if (!['reviewing', 'sent'].includes(d.status)) return fail(409, msg('สถานะของเอกสารเปลี่ยนไปแล้ว — กรุณารีเฟรชก่อนทำรายการ'), { conflict: true });
    if (!reason) return fail(400, msg('กรุณากรอกเหตุผลที่ไม่อนุมัติ'));
    const fromCustomer = d.status === 'sent';
    d.status = 'pending';
    d.rejectReason = reason;
    d.rejectCount += 1;
    d.history.unshift({ atMs: nowMs(), by: 'ผู้ใช้', text: (fromCustomer ? 'ลูกค้าขอแก้ไข: ' : 'ไม่อนุมัติงานแปล: ') + reason });
    return res({ ok: true, message: 'ส่งกลับให้แปลใหม่แล้ว' });
  }
  if (action === 'cancel') {
    if (isFinal(d.status)) return fail(409, msg('สถานะของเอกสารเปลี่ยนไปแล้ว — กรุณารีเฟรชก่อนทำรายการ'), { conflict: true });
    if (!reason) return fail(400, msg('กรุณากรอกเหตุผลที่ยกเลิก'));
    d.stoppedAt = d.status;
    d.status = 'cancelled';
    d.cancelReason = reason;
    d.history.unshift({ atMs: nowMs(), by: 'ผู้ใช้', text: 'ยกเลิกงาน: ' + reason });
    return res({ ok: true, message: 'ยกเลิกงานเรียบร้อย' });
  }
  const f = FLOW[action];
  if (!f) return fail(400, msg('ไม่รู้จักการทำรายการ ') + action);
  if (!f.from.includes(d.status)) return fail(409, msg('สถานะของเอกสารเปลี่ยนไปแล้ว — กรุณารีเฟรชก่อนทำรายการ'), { conflict: true });
  d.status = f.to;
  if (action === 'translate') d.ticks = 2;
  d.history.unshift({ atMs: nowMs(), by: 'ผู้ใช้', text: f.history });
  return res({ ok: true, message: f.message });
}

function edit(body: any): Response {
  const no = field(body, 'no');
  const d = docs.find((x) => x.no === no);
  if (!d) return fail(404, msg('ไม่พบเอกสาร ') + no);
  if (isFinal(d.status)) return fail(409, msg('งานนี้จบแล้ว แก้ไขไม่ได้'), { conflict: true });
  const due = field(body, 'dueAt').trim();
  let dueMs: number | null = null;
  if (due) {
    const m = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/.exec(due);
    if (!m) return fail(400, msg('วันที่กำหนดส่งต้องเป็นรูปแบบ dd/mm/yyyy'));
    dueMs = new Date(+m[3], +m[2] - 1, +m[1]).getTime();
  }
  d.contact = field(body, 'contact');
  d.tel = field(body, 'tel');
  d.email = field(body, 'email');
  d.docType = field(body, 'docType');
  if (field(body, 'srcLang')) d.srcLang = field(body, 'srcLang').toUpperCase();
  if (field(body, 'dstLang')) d.dstLang = field(body, 'dstLang').toUpperCase();
  d.dueMs = dueMs;
  d.remark = field(body, 'remark');
  d.history.unshift({ atMs: nowMs(), by: 'ผู้ใช้', text: 'แก้ไขข้อมูลเอกสาร' });
  return res({ ok: true, message: 'บันทึกการแก้ไขแล้ว' });
}

function save(body: any): Response {
  const customerId = Number(field(body, 'customerId')) || 0;
  const customer = field(body, 'customerName');
  if (!customer) return fail(400, msg('กรุณาเลือกลูกค้า'));
  const names: string[] = [];
  let bytes = 0;
  for (let i = 0; ; i++) {
    const f = body.get('file_' + i);
    if (!f) break;
    names.push(String(body.get('path_' + i) ?? f.name));
    bytes += f.size ?? 0;
  }
  if (!names.length) return fail(400, msg('ไม่พบไฟล์ที่อัปโหลด'));
  const pages = names.reduce((n, nm) => n + (/\.pdf$/i.test(nm) ? 4 : 1), 0);
  const price = Math.max(500, pages * 150);
  const no = 'QT-2026-' + String(++seq).padStart(5, '0');
  const d = doc({ no, customerId: CUSTOMERS.some((c) => c.id === customerId) ? customerId : 101, status: 'quoted', files: names.length, pages, price, daysAgo: 0, dueIn: 5 });
  d.createdMs = nowMs();
  d.dueMs = nowMs() + 5 * DAY;
  d.customer = customer;
  d.agent = field(body, 'salesAgent');
  d.tel = field(body, 'tel');
  d.email = field(body, 'email');
  d.sizeMb = Math.round((bytes / 1048576) * 100) / 100;
  d.fileNames = names.map((n) => n.split('/').pop() as string);
  d.history = [{ atMs: d.createdMs, by: d.agent || 'ผู้ใช้', text: msg('สร้างรายการและอัปโหลดเอกสาร {0} ไฟล์ ({1} หน้า)', d.files, d.pages) }];
  docs.unshift(d);
  return res({ ok: true, quoteNo: no, files: names.length, pages, price });
}

function list(): Response {
  // a document sent to translation finishes after two more list calls (the polling of the page)
  for (const d of docs) {
    if (d.status === 'translating' && d.ticks > 0 && --d.ticks === 0) {
      d.status = 'reviewing';
      d.ticks = -1;
      d.history.unshift({ atMs: nowMs(), by: 'ระบบ AI', text: 'แปลเอกสารเสร็จ รอผู้ตรวจ' });
    }
  }
  return res({ ok: true, stats: stats(), documents: docs.map(shape) });
}

function translated(no: string): Response {
  const d = docs.find((x) => x.no === no);
  if (!d) return fail(404, msg('ไม่พบเอกสาร ') + no);
  if (!['reviewing', 'sent', 'approved', 'done'].includes(d.status)) return res({ ok: true, files: [] });
  const files = d.fileNames.flatMap((name, i) => {
    const base = name.replace(/\.[^.]+$/, '') + '_TH';
    const pages = Math.max(1, Math.round(d.pages / Math.max(1, d.files)));
    return [
      {
        name: base + '.docx',
        ext: 'docx',
        size: sizeText(d.sizeMb / Math.max(1, d.files) / 2),
        pages,
        at: thaiDateTime(d.createdMs + 3 * 3_600_000),
        quality: i % 2 === 0 ? { passed: true, summary: msg('{0} หน้า — ข้อความครบ ฟอนต์ฝังครบ', pages) } : { passed: false, summary: 'พบข้อความตกหล่น 2 ก้อน', missing: ['หน้า 2 บรรทัด 4', 'หน้า 3 ตารางที่ 1'] },
      },
      { name: base + '.pdf', ext: 'pdf', size: sizeText(d.sizeMb / Math.max(1, d.files)), pages, at: thaiDateTime(d.createdMs + 3 * 3_600_000) },
    ];
  });
  return res({ ok: true, files });
}

function chat(body: URLSearchParams): Response {
  const q = String(body.get('message') ?? '');
  if (q.includes('ทดสอบล่ม')) return fail(502, msg('ติดต่อผู้ช่วยแปลไม่ได้'));
  const no = String(body.get('quoteNo') ?? '');
  const d = docs.find((x) => x.no === no);
  if (!d) return res({ ok: true, reply: 'ยังไม่ได้เลือกเอกสารครับ — เลือกใบจากตารางก่อน แล้วถามเรื่องใบนั้นได้เลย' });
  const baht = d.price.toLocaleString('th-TH');
  if (q.includes('สรุป')) return res({ ok: true, reply: msg('ใบ {0} ของ {1}\nสถานะ: {2}\n- {3} ไฟล์ {4} หน้า\n- ราคาเสนอ {5} บาท\n- คู่ภาษา {6} → {7}', d.no, d.customer, STATUS_LABEL[d.status], d.files, d.pages, baht, LANG[d.srcLang] ?? d.srcLang, LANG[d.dstLang] ?? d.dstLang) });
  if (q.includes('ราคา')) return res({ ok: true, reply: msg('ราคารวม {0} บาท ครับ คิดจากค่าที่มากกว่าระหว่าง (ราคาต่อหน้า × {1} หน้า) กับค่าบริการขั้นต่ำ', baht, d.pages) });
  if (q.includes('ไฟล์') || q.includes('หน้า')) return res({ ok: true, reply: msg('ใบนี้มี {0} ไฟล์ รวม {1} หน้า ครับ', d.files, d.pages) });
  if (q.includes('ร่าง')) return res({ ok: true, reply: msg('เรียนลูกค้า {0}\nใบเสนอราคา {1} ราคา {2} บาท ขณะนี้อยู่ในขั้น "{3}" ครับ', d.customer, d.no, baht, STATUS_LABEL[d.status]) });
  return res({ ok: true, reply: 'ผมตอบได้เรื่องใบเสนอราคาที่เลือกอยู่ เช่น สรุปใบ ราคา และจำนวนไฟล์/หน้า ครับ' });
}

function prospects(url: URL): Response {
  const q = (url.searchParams.get('searchText') ?? '').trim().toLowerCase();
  const per = Number(url.searchParams.get('perPage') ?? 8) || 8;
  const hit = CUSTOMERS.filter((c) => !q || [c.code, c.name, c.phone, c.email, c.addr].join(' ').toLowerCase().includes(q));
  return res({ status: 200, message: 'OK', result: { items: hit.slice(0, per), meta: { page: 1, perPage: per, total: hit.length } } });
}

/** a document for window.open(…) — the real service returns the PDF / the translated file */
export function mockAitranDocument(url: string): { type: string; data: string } {
  const u = new URL(url, 'http://x');
  const no = u.searchParams.get('no') ?? '';
  const d = docs.find((x) => x.no === no);
  const title = u.searchParams.get('action') === 'quotation' ? 'ใบเสนอราคา' : u.searchParams.get('name') ?? 'เอกสาร';
  return {
    type: 'text/html; charset=utf-8',
    data: `<!doctype html><meta charset="utf-8"><title>${title} ${no}</title><body style="font-family:sans-serif;padding:32px"><h2>${title}</h2><p>เลขที่เอกสาร ${no}</p><p>${d ? d.customer + ' — ' + d.price.toLocaleString('th-TH') + ' บาท' : ''}</p><p style="color:#6B7280">(ตัวอย่างของโหมดทดสอบ — ไม่ใช่ไฟล์จริง)</p></body>`,
  };
}

/* ─────────────────────────────────────────────────────────────── entry points */
/**
 * The fetch of the page in dev mode: `<ctx>/aitran?action=…` and `<ctx>/board/prospect-list`.
 * `body` is a FormData (multipart POST), a URLSearchParams / string (form POST) or undefined.
 */
export async function mockTranslatorFetch(input: string, init: RequestInit | undefined, apiBase: string): Promise<Response> {
  const url = new URL(String(input).replace(apiBase, ''), 'http://x');
  const method = (init?.method ?? 'GET').toUpperCase();
  if (url.pathname === '/board/prospect-list') return prospects(url);
  if (url.pathname !== '/aitran') return fail(404, msg('ไม่รู้จักเส้นทางนี้: ') + url.pathname);
  const action = url.searchParams.get('action') ?? '';
  const rawBody = init?.body as any;
  const form = rawBody && typeof rawBody.get === 'function' ? rawBody : new URLSearchParams(typeof rawBody === 'string' ? rawBody : '');
  if (method === 'GET') {
    if (action === 'list') return list();
    if (action === 'translated') return translated(url.searchParams.get('no') ?? '');
    return fail(404, msg('ไม่รู้จัก action ') + action);
  }
  if (action === 'chat') return chat(form);
  if (action === 'save') return save(form);
  if (action === 'edit') return edit(form);
  return flow(action, form);
}

/**
 * XMLHttpRequest stand-in for the dev mode: the same events the page uses (upload.onprogress, onload, onerror, status,
 * responseText, abort). The body is a FormData; the answer comes from mockTranslatorFetch.
 */
export function createMockXhr(apiBase: string): any {
  let method = 'GET';
  let url = '';
  let aborted = false;
  const x: any = {
    status: 0,
    responseText: '',
    upload: {} as any,
    onload: null as any,
    onerror: null as any,
    open(m: string, u: string) {
      method = m;
      url = u;
    },
    abort() {
      aborted = true;
    },
    send(body: any) {
      const total = body && typeof body.entries === 'function' ? [...body.entries()].reduce((n: number, [, v]: any) => n + (typeof v === 'string' ? v.length : v.size ?? 0), 0) : 0;
      const step = (loaded: number) => {
        if (aborted) return;
        if (typeof x.upload.onprogress === 'function') x.upload.onprogress({ lengthComputable: total > 0, loaded, total });
      };
      const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));
      void (async () => {
        await wait(60);
        step(Math.round(total / 2));
        await wait(60);
        step(total);
        await wait(60);
        if (aborted) return;
        const r = await mockTranslatorFetch(url, { method, body }, apiBase);
        x.status = r.status;
        x.responseText = await r.text();
        if (!aborted && typeof x.onload === 'function') x.onload();
      })();
    },
  };
  return x;
}
