// FAST-DEBT(STD): ไฟล์ mock 600+ บรรทัด (ai-hub.mock.more.ts อีก 450+) เกินขนาดไฟล์ ≤ ~400 · harness ใช้ไฟล์เดียวกัน จึงยังไม่แยก · เมื่อแตะให้แยกตามเครื่องมือ · somyot · 2026-11-19
/**
 * Fake of the AI HUB servlet (`/aihub/*` → AiHubProxyServlet → ai-hub service → Bedrock) for `mock: true`.
 *
 * It answers the same JSON contract `ai_hub.js` uses (GET /tools · GET /usage · POST /tools/{tool}) with plausible
 * Thai sample data so every tool screen can be demonstrated without Tomcat or AWS. Deliberately dependency-free
 * (standard Response / FormData only) so the very same module can also feed the Java reference harness.
 */

import { msg, reference } from '@core/mock/reference';
import { MORE_RESULTS, prospectEndpoint, serviceEndpoint } from './ai-hub.mock.more';

type Json = Record<string, unknown>;

interface ModelOption {
  key: string;
  label: string;
  vendor: string;
  logo: string;
  recommended?: boolean;
  note: string;
  traits: string[];
}

const json = (body: unknown, status = 200): Response =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });

const failure = (error: string, status = 200): Response => json({ ok: false, error }, status);

const wait = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

// ---------------------------------------------------------------------------------------------- models

const M = reference('aiHub.models', {
  sonnet: { key: 'mock.claude-sonnet', label: 'Claude Sonnet', vendor: 'Anthropic', logo: 'claude', recommended: true, note: 'สมดุลระหว่างคุณภาพและความเร็ว เหมาะกับงานเอกสารภาษาไทย', traits: ['vision', 'reasoning'] },
  haiku: { key: 'mock.claude-haiku', label: 'Claude Haiku', vendor: 'Anthropic', logo: 'claude', note: 'ตอบไว ราคาประหยัด เหมาะกับงานสั้น ๆ', traits: ['fast', 'vision'] },
  novaPro: { key: 'mock.nova-pro', label: 'Amazon Nova Pro', vendor: 'Amazon', logo: 'nova', note: 'อ่านรูปและเอกสารได้ดี ราคาคุ้ม', traits: ['vision'] },
  llama: { key: 'mock.llama-70b', label: 'Llama 3.3 70B', vendor: 'Meta', logo: 'meta', note: 'model แบบเปิด ใช้เป็นตัวเลือกสำรอง', traits: ['open'] },
  deepseek: { key: 'mock.deepseek-r1', label: 'DeepSeek R1', vendor: 'DeepSeek', logo: 'deepseek', note: 'คิดก่อนตอบ เหมาะกับโจทย์วิเคราะห์ที่ซับซ้อน', traits: ['reasoning', 'open'] },
  qwenCoder: { key: 'mock.qwen-coder', label: 'Qwen3 Coder', vendor: 'Alibaba', logo: 'qwen', recommended: true, note: 'เชี่ยวชาญการเขียนและรีวิวโค้ด', traits: ['code', 'open'] },
  mistral: { key: 'mock.mistral-large', label: 'Mistral Large', vendor: 'Mistral AI', logo: 'mistral', note: 'เขียนโค้ดและวิเคราะห์ได้ดี', traits: ['code'] },
  sdxl: { key: 'mock.stability-ultra', label: 'Stable Image Ultra', vendor: 'Stability AI', logo: 'stability', recommended: true, note: 'ภาพคุณภาพสูง รายละเอียดคม', traits: [] },
  novaCanvas: { key: 'mock.nova-canvas', label: 'Amazon Nova Canvas', vendor: 'Amazon', logo: 'nova', note: 'ภาพประกอบโฆษณาและโซเชียล', traits: [] },
} satisfies Record<string, ModelOption>);

/** the models of a tool are kept by name (a key of `aiHub.models`), a name the document does not know is left out */
const modelsOf = (names: readonly string[]): ModelOption[] => names.map((n) => (M as Record<string, ModelOption | undefined>)[n]).filter((m): m is ModelOption => m !== undefined);
const TEXT_MODELS = modelsOf(reference<string[]>('aiHub.textModels', ['sonnet', 'haiku', 'novaPro', 'llama']));

const TOOL_MODEL_NAMES = reference<Record<string, string[]>>('aiHub.toolModels', {
  'doc-analyze': ['sonnet', 'novaPro', 'haiku'],
  'doc-summary': ['sonnet', 'haiku', 'novaPro', 'llama'],
  'data-analyze': ['sonnet', 'deepseek', 'haiku', 'novaPro'],
  meeting: ['sonnet', 'haiku'],
  slides: ['sonnet', 'haiku', 'novaPro', 'llama'],
  image: ['sdxl', 'novaCanvas'],
  video: ['sonnet', 'haiku'],
  music: ['sonnet', 'haiku', 'novaPro', 'llama'],
  code: ['qwenCoder', 'mistral', 'sonnet', 'deepseek'],
  strategy: ['sonnet', 'deepseek', 'haiku', 'novaPro'],
  howto: ['sonnet', 'haiku', 'novaPro', 'llama'],
  diagram: ['sonnet', 'haiku', 'novaPro'],
  'library-ask': ['sonnet', 'haiku'],
  chat: ['sonnet', 'haiku', 'llama'],
});
const TOOL_MODELS: Record<string, ModelOption[]> = Object.fromEntries(Object.entries(TOOL_MODEL_NAMES).map(([tool, names]) => [tool, modelsOf(names)]));

// tools added after the first port: same model list as the other text tools (the voice-over picks a voice, not a model)
for (const id of Object.keys(MORE_RESULTS)) if (id !== 'voiceover') TOOL_MODELS[id] ??= TEXT_MODELS;

// ---------------------------------------------------------------------------------------------- files

const svgImage = (n: number): string => {
  const pairs = [['#0EA5E9', '#35236A'], ['#34D399', '#0C8E6A'], ['#F59E0B', '#C92A76'], ['#6043B6', '#14A2D0']];
  const [a, b] = pairs[(n - 1) % pairs.length];
  return (
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 640 400"><defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1">` +
    `<stop offset="0" stop-color="${a}"/><stop offset="1" stop-color="${b}"/></linearGradient></defs>` +
    `<rect width="640" height="400" fill="url(#g)"/><circle cx="500" cy="110" r="52" fill="#fff" fill-opacity=".55"/>` +
    `<path d="M0 290 Q160 220 330 270 T640 250 V400 H0Z" fill="#111827" fill-opacity=".28"/>` +
    `<rect x="210" y="200" width="190" height="110" fill="#111827" fill-opacity=".5"/><path d="M190 208 L305 140 L420 208Z" fill="#111827" fill-opacity=".62"/>` +
    `<text x="24" y="376" font-size="18" fill="#fff" fill-opacity=".8" font-family="sans-serif">ภาพตัวอย่าง (mock) #${n}</text></svg>`
  );
};

const wav = (): Uint8Array => {
  const rate = 8000;
  const notes = [262, 330, 392, 330, 262, 392, 523, 392];
  const samples = rate * 4;
  const out = new Uint8Array(44 + samples);
  const view = new DataView(out.buffer);
  const text = (o: number, s: string) => [...s].forEach((c, i) => view.setUint8(o + i, c.charCodeAt(0)));
  text(0, 'RIFF'); view.setUint32(4, 36 + samples, true); text(8, 'WAVE'); text(12, 'fmt ');
  view.setUint32(16, 16, true); view.setUint16(20, 1, true); view.setUint16(22, 1, true);
  view.setUint32(24, rate, true); view.setUint32(28, rate, true); view.setUint16(32, 1, true); view.setUint16(34, 8, true);
  text(36, 'data'); view.setUint32(40, samples, true);
  for (let i = 0; i < samples; i++) {
    const f = notes[Math.floor(i / (samples / notes.length))];
    const env = 1 - ((i % (samples / notes.length)) / (samples / notes.length)) * 0.8;
    out[44 + i] = 128 + Math.round(Math.sin((2 * Math.PI * f * i) / rate) * 60 * env);
  }
  return out;
};

/** bytes of a mock file (shared with the reference harness, which serves them over HTTP) */
export function mockAiHubFile(id: string): { type: string; data: string | Uint8Array } {
  if (id.startsWith('mock-img-')) return { type: 'image/svg+xml', data: svgImage(Number(id.slice(9)) || 1) };
  if (id === 'mock-wav') return { type: 'audio/wav', data: wav() };
  if (id === 'mock-mid') return { type: 'audio/midi', data: new Uint8Array([0x4d, 0x54, 0x68, 0x64, 0, 0, 0, 6, 0, 0, 0, 1, 0, 96]) };
  if (id === 'mock-pptx') return { type: 'text/plain;charset=utf-8', data: 'ไฟล์สไลด์ตัวอย่าง (mock) — บริการจริงสร้างไฟล์ .pptx' };
  return { type: 'text/plain;charset=utf-8', data: msg('ไฟล์ตัวอย่าง (mock): {0}', id) };
}

const blobUrls = new Map<string, string>();

const DOWNLOAD_NAMES: Record<string, string> = reference<Record<string, string>>('aiHub.downloadNames', {
  'mock-wav': 'song.wav',
  'mock-mid': 'song.mid',
  'mock-pptx': 'slides.pptx',
  'mock-md': 'minutes.md',
  'mock-txt': 'transcript.txt',
});

/**
 * URL of a mock file for the browser (blob: URLs, because data: links cannot be opened in a new tab). A download link
 * carries its file name in the fragment (`#dl=name`); AiHubView turns a click on it into a real download.
 */
export function mockAiHubFileUrl(id: string, download = false): string {
  let url = blobUrls.get(id);
  if (!url) {
    const f = mockAiHubFile(id);
    url = URL.createObjectURL(new Blob([f.data as BlobPart], { type: f.type }));
    blobUrls.set(id, url);
  }
  return download ? `${url}#dl=${encodeURIComponent(DOWNLOAD_NAMES[id] ?? `${id}.svg`)}` : url;
}

export const mockAiHubLibraryUrl = (id: string): string => mockAiHubFileUrl(`library-${id}`);

// ---------------------------------------------------------------------------------------------- results

const doc = (name: string, pages: number) => ({ name, pages, pagesEstimated: false, imagePages: 0, skippedPages: 0 });

/** what each tool answers when nothing is typed in: `ref.aiHub.json` › `samples` of the shared Datasource when it has them — the code below only mixes the input of the user in */
const isRecord = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);
const fresh = <T>(v: T): T => JSON.parse(JSON.stringify(v)) as T;
const SAMPLE_TOOLS = ['doc-analyze', 'doc-summary', 'data-analyze', 'meeting', 'slides', 'image', 'video', 'music', 'code', 'strategy', 'howto', 'diagram'];
const SAMPLES = reference<Record<string, Json>>(
  'aiHub.samples',
  {
    'doc-analyze': {
    docId: 'mock-doc-1',
    documentType: 'สัญญาซื้อขายรถยนต์',
    confidence: 92,
    documents: [doc('สัญญาซื้อขายรถยนต์-ตัวอย่าง.pdf', 8)],
    summary: 'สัญญาซื้อขายรถยนต์ใหม่ระหว่างบริษัทผู้ขายและลูกค้าบุคคลธรรมดา ราคารวม 1,250,000 บาท ชำระเงินดาวน์ 250,000 บาท ส่วนที่เหลือผ่อน 60 งวด มีเงื่อนไขการส่งมอบภายใน 30 วันนับจากวันที่ชำระเงินดาวน์',
    answerToQuestion: 'ค่าธรรมเนียมการโอนและภาษีเป็นความรับผิดชอบของผู้ซื้อ ตามข้อ 6.2 ของสัญญา',
    fields: [
      { label: 'คู่สัญญาฝ่ายขาย', value: 'บริษัท เอซ มอเตอร์ จำกัด', important: true, page: 1 },
      { label: 'คู่สัญญาฝ่ายซื้อ', value: 'นายสมชาย ใจดี', important: true, page: 1 },
      { label: 'ราคารวม', value: '1,250,000 บาท', important: true, page: 2 },
      { label: 'เงินดาวน์', value: '250,000 บาท (20%)', page: 2 },
      { label: 'จำนวนงวด', value: '60 งวด งวดละ 21,540 บาท', page: 3 },
      { label: 'กำหนดส่งมอบ', value: 'ภายใน 30 วัน', page: 4 },
    ],
    risks: [
      { level: 'high', title: 'ค่าปรับผิดนัดสูงกว่าเกณฑ์', detail: 'ข้อ 9.1 กำหนดเบี้ยปรับ 1.5% ต่อเดือนของยอดค้างชำระ ควรตรวจสอบกับฝ่ายกฎหมาย', page: 6 },
      { level: 'medium', title: 'เงื่อนไขการส่งมอบไม่ระบุกรณีสินค้าขาดตลาด', detail: 'ไม่มีข้อกำหนดชดเชยหากส่งมอบล่าช้าเกินกำหนด', page: 4 },
      { level: 'low', title: 'ที่อยู่คู่สัญญาไม่ครบถ้วน', detail: 'ไม่มีรหัสไปรษณีย์ในหน้าแรก', page: 1 },
    ],
    completeness: [
      { status: 'present', item: 'ลายมือชื่อคู่สัญญา', note: 'ครบทั้งสองฝ่าย' },
      { status: 'missing', item: 'ภาคผนวกรายการอุปกรณ์เสริม', note: 'อ้างถึงในข้อ 3 แต่ไม่แนบมา' },
      { status: 'unclear', item: 'วันที่มีผลบังคับใช้', note: 'ระบุเพียงเดือน ไม่ระบุวัน' },
    ],
    },
    'doc-summary': {
    docId: 'mock-doc-2',
    title: 'สรุปรายงานผลการดำเนินงานไตรมาส 3',
    lead: 'ยอดขายรวมไตรมาส 3 อยู่ที่ 184 ล้านบาท เพิ่มขึ้น 12% จากไตรมาสก่อน นำโดยกลุ่มรถยนต์ SUV และลูกค้าองค์กร ขณะที่ต้นทุนการตลาดสูงกว่าแผน 8%',
    readMinutes: 2,
    originalReadMinutes: 18,
    documents: [doc('รายงานไตรมาส3-2569.pdf', 36)],
    keyPoints: [
      'ยอดขายรวม 184 ล้านบาท เพิ่มขึ้น 12% จากไตรมาสก่อน',
      'กลุ่ม SUV เติบโตสูงสุด 21% และมีสัดส่วน 38% ของยอดขาย',
      'ต้นทุนการตลาดสูงกว่าแผน 8% จากแคมเปญช่วงปลายไตรมาส',
      'อัตราปิดการขายของลีดคุณภาพดีขึ้นจาก 14% เป็น 17%',
    ],
    actions: [
      { task: 'ทบทวนงบการตลาดไตรมาส 4', owner: 'ฝ่ายการตลาด', due: '31 ต.ค.' },
      { task: 'เพิ่มสต็อกรุ่น SUV ขายดี', owner: 'ฝ่ายจัดซื้อ', due: '15 พ.ย.' },
      { task: 'อบรมทีมขายเรื่องการติดตามลีด', owner: '', due: '' },
    ],
    keywords: ['ยอดขาย', 'SUV', 'ต้นทุนการตลาด', 'อัตราปิดการขาย'],
    },
    'data-analyze': {
    title: 'ผลการวิเคราะห์ยอดขายรายเดือน',
    summary: 'ยอดขายรวม 12 เดือนอยู่ที่ 1,420 ล้านบาท เติบโตต่อเนื่องโดยเดือนพฤศจิกายนสูงสุด และสาขากรุงเทพฯ สร้างรายได้เกือบครึ่งหนึ่งของทั้งหมด',
    answerToQuestion: 'สาขากรุงเทพฯ มียอดขายสูงสุด 48% ของยอดรวม รองลงมาคือเชียงใหม่ 22%',
    file: { name: 'sales-2569.xlsx', sheets: ['ยอดขาย', 'ต้นทุน'], sheet: 'ยอดขาย', rows: 1240, columns: 5 },
    insights: [
      { tone: 'good', title: 'ยอดขายโตต่อเนื่อง 4 ไตรมาส', detail: 'ค่าเฉลี่ยการเติบโตรายเดือน 3.1%' },
      { tone: 'warn', title: 'สาขาภูเก็ตต่ำกว่าเป้า', detail: 'ต่ำกว่าเป้าหมาย 18% ติดต่อกัน 3 เดือน' },
      { tone: 'info', title: 'รุ่น SUV ขายดีที่สุด', detail: 'สัดส่วน 38% ของจำนวนคันที่ขาย' },
    ],
    charts: [
      { type: 'bar', title: 'ยอดขายรายเดือน', x: 'เดือน', y: 'ยอดขาย (ล้านบาท)', agg: 'sum', labels: ['ม.ค.', 'ก.พ.', 'มี.ค.', 'เม.ย.', 'พ.ค.', 'มิ.ย.'], data: [{ name: 'ยอดขาย', values: [96, 104, 111, 108, 121, 129] }] },
      { type: 'pie', title: 'สัดส่วนยอดขายตามสาขา', x: 'สาขา', agg: 'sum', y: 'ยอดขาย', labels: ['กรุงเทพฯ', 'เชียงใหม่', 'ขอนแก่น', 'ภูเก็ต'], data: [{ name: 'ยอดขาย', values: [680, 312, 258, 170] }] },
      { type: 'line', title: 'แนวโน้มจำนวนคันที่ขาย', x: 'เดือน', y: 'จำนวนคัน', agg: 'sum', labels: ['ม.ค.', 'ก.พ.', 'มี.ค.', 'เม.ย.', 'พ.ค.', 'มิ.ย.'], data: [{ name: 'SUV', values: [31, 34, 38, 36, 42, 45] }, { name: 'ซีดาน', values: [22, 21, 24, 23, 25, 24] }] },
      { type: 'hbar', title: 'ยอดขายตามพนักงานขาย (10 อันดับแรก)', x: 'พนักงานขาย', y: 'ยอดขาย', agg: 'sum', hidden: true, labels: ['คุณสมศรี', 'คุณวิชัย', 'คุณมานะ', 'คุณปรีชา'], data: [{ name: 'ยอดขาย', values: [38400000, 33100000, 29800000, 26500000] }] },
    ],
    recommendations: ['เพิ่มงบการตลาดในสาขากรุงเทพฯ และเชียงใหม่ซึ่งตอบสนองดี', 'จัดแคมเปญเฉพาะสาขาภูเก็ตเพื่อดึงยอดให้ถึงเป้า', 'ทบทวนสต็อกรุ่น SUV ก่อนเดือนพฤศจิกายน'],
    caveats: ['พบเซลล์ว่าง 14 แห่งในคอลัมน์ต้นทุน', 'ข้อมูลเดือนมิถุนายนอาจยังไม่ครบ'],
    columns: [
      { name: 'เดือน', type: 'date', filled: 1240, missing: 0, first: '2569-01', last: '2569-12' },
      { name: 'สาขา', type: 'text', filled: 1240, missing: 0, top: [{ value: 'กรุงเทพฯ', count: 590 }, { value: 'เชียงใหม่', count: 310 }, { value: 'ขอนแก่น', count: 220 }] },
      { name: 'ยอดขาย', type: 'number', filled: 1226, missing: 14, sum: 1420000000, mean: 1158000, min: 120000, max: 9800000 },
    ],
    preview: { headers: ['เดือน', 'สาขา', 'ยอดขาย'], rows: [['2569-01', 'กรุงเทพฯ', '1,250,000'], ['2569-01', 'เชียงใหม่', '980,000'], ['2569-02', 'กรุงเทพฯ', '1,410,000']] },
    },
    meeting: {
    status: 'done',
    title: 'รายงานการประชุมทีมขายประจำสัปดาห์',
    fileName: 'ประชุมทีมขาย-สัปดาห์ที่-42.mp3',
    durationSeconds: 2184,
    speakerCount: 3,
    language: 'th-TH',
    summary: 'ทีมทบทวนยอดขายสัปดาห์ที่ผ่านมา ตกลงเร่งติดตามลีดที่ค้างเกิน 7 วัน และเตรียมแคมเปญสิ้นปี โดยมอบหมายผู้รับผิดชอบพร้อมกำหนดส่งแล้ว',
    decisions: ['เริ่มแคมเปญสิ้นปีวันที่ 1 พฤศจิกายน', 'ลีดที่ไม่มีความเคลื่อนไหวเกิน 7 วัน ให้หัวหน้าทีมติดตามเอง'],
    actions: [
      { task: 'จัดทำสื่อแคมเปญสิ้นปี', owner: 'คุณสมศรี', due: '25 ต.ค.' },
      { task: 'สรุปรายชื่อลีดค้างเกิน 7 วัน', owner: 'คุณวิชัย', due: '22 ต.ค.' },
    ],
    topics: [
      { title: 'ผลการขายสัปดาห์ที่ผ่านมา', points: ['ยอดขายสะสม 92% ของเป้าเดือน', 'SUV ยังเป็นรุ่นขายดีที่สุด'] },
      { title: 'แคมเปญสิ้นปี', points: ['เน้นข้อเสนอดอกเบี้ยพิเศษ', 'ต้องได้รับอนุมัติงบจากฝ่ายการเงิน'] },
    ],
    openQuestions: ['งบแคมเปญสิ้นปีได้รับอนุมัติเท่าไร'],
    speakers: [{ label: 'ผู้พูด 1', name: 'คุณสมศรี', role: 'หัวหน้าทีมขาย' }, { label: 'ผู้พูด 2', name: 'คุณวิชัย', role: '' }, { label: 'ผู้พูด 3', name: '', role: '' }],
    utterances: [
      { speaker: 'ผู้พูด 1', start: 4, text: 'เริ่มประชุมกันเลยนะคะ วันนี้มีสามเรื่องหลัก' },
      { speaker: 'ผู้พูด 2', start: 21, text: 'ยอดขายสัปดาห์ที่แล้วอยู่ที่ประมาณเก้าสิบสองเปอร์เซ็นต์ของเป้าครับ' },
      { speaker: 'ผู้พูด 3', start: 48, text: 'ส่วนลีดที่ค้างอยู่ ผมจะรวบรวมรายชื่อส่งให้ภายในวันพุธ' },
    ],
    minutesFileId: 'mock-md',
    transcriptFileId: 'mock-txt',
    },
    slides: {
    title: 'แคมเปญสินเชื่อรถยนต์ดอกเบี้ยพิเศษสิ้นปี',
    theme: 'violet',
    fileId: 'mock-pptx',
    slides: [
      { layout: 'cover', kicker: 'แคมเปญสิ้นปี 2569', title: 'สินเชื่อรถยนต์ดอกเบี้ยพิเศษ', subtitle: 'ผ่อนสบาย เริ่มต้น 0.99% ต่อปี', bullets: [], notes: 'เปิดด้วยการทักทายและบอกวัตถุประสงค์' },
      { layout: 'content', kicker: 'ภาพรวม', title: 'ทำไมต้องเป็นเรา', subtitle: '', bullets: ['อนุมัติไวภายใน 24 ชั่วโมง', 'ดอกเบี้ยคงที่ตลอดสัญญา', 'ฟรีประกันภัยปีแรก'], notes: '' },
      { layout: 'chart', kicker: 'ผลลัพธ์', title: 'ยอดขายเติบโตต่อเนื่อง', subtitle: '', bullets: ['ไตรมาส 1 ถึง 4 เพิ่มขึ้นทุกไตรมาส'], chart: { values: [42, 55, 61, 78] }, notes: 'อ้างอิงข้อมูลภายใน' },
      { layout: 'closing', kicker: 'ขั้นตอนต่อไป', title: 'พร้อมเริ่มแล้ววันนี้', subtitle: 'ติดต่อทีมขายสาขาใกล้บ้านคุณ', bullets: [], notes: '' },
    ],
    },
    image: {
    ratio: '16:9',
    requested: 2,
    prompt: 'บ้านสวยริมทะเลยามเย็น',
    englishPrompt: 'A beautiful seaside house at sunset, warm light, photorealistic, wide angle',
    negative: '',
    images: [{ fileId: 'mock-img-1' }, { fileId: 'mock-img-2' }],
    },
    video: {
    title: 'คลิปโปรโมตบ้านเดี่ยวโครงการใหม่',
    duration: 30,
    channel: 'Reels',
    narration: 'ค้นพบบ้านที่ใช่ในโครงการใหม่ใจกลางเมือง ใกล้รถไฟฟ้า พร้อมสวนส่วนกลางกว้างขวาง นัดชมบ้านตัวอย่างวันนี้',
    music: 'ดนตรีป๊อปสดใส จังหวะกลาง',
    cta: 'โทรนัดชมบ้านตัวอย่าง',
    scenes: [
      { start: 0, end: 6, title: 'เปิดโครงการ', visual: 'มุมสูงของโครงการยามเช้า แสงทองส่องกระทบหลังคา', narration: 'ค้นพบบ้านที่ใช่', caption: 'บ้านใหม่ใจกลางเมือง' },
      { start: 6, end: 16, title: 'ภายในบ้านตัวอย่าง', visual: 'ครอบครัวเดินเข้าห้องนั่งเล่นโปร่ง แสงธรรมชาติ', narration: 'พื้นที่ใช้สอยกว้างขวาง', caption: 'ห้องนั่งเล่นโปร่งโล่ง' },
      { start: 16, end: 30, title: 'สวนส่วนกลาง', visual: 'เด็ก ๆ วิ่งเล่นในสวน พ่อแม่นั่งยิ้มที่ม้านั่ง', narration: 'นัดชมวันนี้', caption: 'โทรนัดชมบ้านตัวอย่าง' },
    ],
    render: { status: 'queued', jobId: 'mock-video-1', message: 'ส่งงานเรนเดอร์คลิปแล้ว กำลังรอคิว…' },
    },
    music: {
    title: 'เส้นทางบ้านของเรา',
    concept: 'เพลงจิงเกิลสั้น ๆ เล่าเรื่องการเริ่มต้นชีวิตใหม่ในบ้านหลังแรก',
    genre: 'pop',
    mood: 'happy',
    lead: 'piano',
    harmony: 'strings',
    instrumental: false,
    seconds: 96,
    bpm: 96,
    key: 'C Major',
    audio: { fileId: 'mock-wav' },
    midi: { fileId: 'mock-mid' },
    styleTags: 'upbeat thai pop, warm piano, light strings, 96 bpm, female vocal',
    productionNotes: ['บันทึกเสียงร้องท่อนฮุกซ้อนสองแทร็กให้เสียงหนา', 'ลดความดังของเครื่องสายในท่อนเวิร์ส'],
    sections: [
      { label: 'Intro', start: 0, chords: ['C', 'G'], lyrics: [] },
      { label: 'Verse 1', start: 8, chords: ['C', 'G', 'Am', 'F'], lyrics: ['วันนี้ฉันมีบ้านหลังเล็กของเรา', 'มีแสงตะวันอบอุ่นทุกเช้า'] },
      { label: 'Chorus', start: 32, chords: ['F', 'C', 'G', 'Am'], lyrics: ['บ้านของเรา บ้านที่ใช่', 'ทุกก้าวที่เดินมีเธออยู่ข้างกาย'] },
    ],
    },
    code: {
    language: 'Java',
    summary: 'สร้างคลาสคำนวณค่างวดผ่อนชำระรายเดือนพร้อมชุดทดสอบ',
    files: [
      {
        name: 'InstallmentCalculator.java',
        content: [
          'package com.example.finance;', '', 'import java.math.BigDecimal;', 'import java.math.MathContext;', 'import java.math.RoundingMode;', '',
          '/** คำนวณค่างวดผ่อนชำระรายเดือน */', 'public final class InstallmentCalculator {', '',
          '    private InstallmentCalculator() { }', '',
          '    public static BigDecimal monthly(BigDecimal principal, BigDecimal annualRate, int months) {',
          '        if (months <= 0) {', '            throw new IllegalArgumentException("months must be greater than 0");', '        }',
          '        BigDecimal r = annualRate.divide(BigDecimal.valueOf(1200), MathContext.DECIMAL64);',
          '        if (r.signum() == 0) {', '            return principal.divide(BigDecimal.valueOf(months), 2, RoundingMode.HALF_UP);', '        }',
          '        BigDecimal factor = BigDecimal.ONE.add(r).pow(months, MathContext.DECIMAL64);',
          '        return principal.multiply(r).multiply(factor)', '                .divide(factor.subtract(BigDecimal.ONE), 2, RoundingMode.HALF_UP);', '    }', '}',
        ].join('\n'),
      },
      {
        name: 'InstallmentCalculatorTest.java',
        content: [
          'package com.example.finance;', '', 'import static org.junit.jupiter.api.Assertions.assertEquals;', 'import java.math.BigDecimal;',
          'import org.junit.jupiter.api.Test;', '', 'class InstallmentCalculatorTest {', '', '    @Test', '    void zeroInterestSplitsEvenly() {',
          '        assertEquals(new BigDecimal("1000.00"),', '                InstallmentCalculator.monthly(new BigDecimal("12000"), BigDecimal.ZERO, 12));', '    }', '}',
        ].join('\n'),
      },
    ],
    explanation: ['คำนวณด้วยสูตรเงินงวดเท่ากัน (annuity) ใช้ BigDecimal เพื่อไม่ให้เกิดความคลาดเคลื่อนของทศนิยม', 'กรณีดอกเบี้ย 0% จะหารเท่ากันทุกงวด'],
    usage: 'BigDecimal m = InstallmentCalculator.monthly(new BigDecimal("1000000"), new BigDecimal("6.5"), 60);',
    review: [{ severity: 'low', where: 'monthly()', issue: 'ยังไม่ตรวจค่า null ของ principal', fix: 'ใส่ Objects.requireNonNull' }],
    notes: ['ปัดเศษแบบ HALF_UP ทศนิยม 2 ตำแหน่ง'],
    },
    strategy: {
    title: 'ขยายตลาดสินเชื่อรถยนต์มือสอง',
    framework: 'swot',
    horizon: '1y',
    summary: 'บริษัทมีฐานลูกค้าและเครือข่ายสาขาแข็งแรง ควรใช้จุดแข็งนี้ขยายสินเชื่อรถมือสองในภูมิภาค โดยควบคุมความเสี่ยงด้านหนี้เสียอย่างใกล้ชิด',
    quadrants: [
      { key: 's', title: 'จุดแข็ง', items: ['ฐานลูกค้าเดิมกว่า 40,000 ราย', 'ระบบอนุมัติสินเชื่อรวดเร็ว'] },
      { key: 'w', title: 'จุดอ่อน', items: ['ทีมขายรถมือสองยังมีน้อย', 'ข้อมูลประเมินราคารถกระจัดกระจาย'] },
      { key: 'o', title: 'โอกาส', items: ['ความต้องการรถมือสองเพิ่มขึ้น 15% ต่อปี', 'พันธมิตรเต็นท์รถในภูมิภาค'] },
      { key: 't', title: 'อุปสรรค', items: ['ดอกเบี้ยนโยบายยังสูง', 'คู่แข่งใช้ราคาตัดราคา'] },
    ],
    recommendations: [
      { title: 'ตั้งทีมสินเชื่อรถมือสอง', detail: 'คัดสรรพนักงานขาย 8 คนและอบรมการประเมินราคา', horizon: '3 เดือน', priority: 'high' },
      { title: 'ร่วมมือกับเต็นท์รถ 20 แห่ง', detail: 'ให้ค่าแนะนำตามยอดที่อนุมัติ', priority: 'medium' },
    ],
    kpis: [{ label: 'ยอดสินเชื่อใหม่', target: '300 ล้านบาท', note: 'ภายใน 12 เดือน' }, { label: 'อัตราหนี้เสีย', target: 'ไม่เกิน 2.5%' }],
    risks: ['ราคารถมือสองผันผวน กระทบมูลค่าหลักประกัน'],
    assumptions: ['ดอกเบี้ยนโยบายไม่เปลี่ยนแปลงมากกว่า 0.5%'],
    },
    howto: {
    title: 'วิธีเปิดใบเสนอราคาให้ลูกค้า',
    summary: 'คู่มือสั้น ๆ สำหรับพนักงานใหม่ ใช้เวลาประมาณ 5 นาทีต่อใบเสนอราคา',
    readMinutes: 3,
    prerequisites: ['มีสิทธิ์ใช้งานเมนู "งานขาย"', 'ข้อมูลลูกค้าอยู่ในระบบแล้ว'],
    steps: [
      { title: 'เปิดเมนูงานขาย', detail: 'เลือกแท็บ "ใบเสนอราคา" แล้วกดปุ่มสร้างใหม่', tip: 'กดปุ่ม / เพื่อค้นหาลูกค้าได้เร็วขึ้น' },
      { title: 'เลือกลูกค้าและรุ่นรถ', detail: 'ค้นหาจากชื่อหรือเบอร์โทร แล้วเลือกรุ่นที่ลูกค้าสนใจ' },
      { title: 'ใส่ส่วนลดและเงื่อนไข', detail: 'ตรวจสอบราคาสุทธิและยอดผ่อนต่องวดให้ถูกต้อง', warning: 'ส่วนลดเกิน 5% ต้องรออนุมัติจากหัวหน้า' },
      { title: 'บันทึกและส่งให้ลูกค้า', detail: 'กดบันทึก แล้วเลือกส่งทางอีเมลหรือ LINE' },
    ],
    glossary: [{ term: 'ใบเสนอราคา', meaning: 'เอกสารแจ้งราคาและเงื่อนไขก่อนทำสัญญา' }, { term: 'ยอดผ่อนต่องวด', meaning: 'จำนวนเงินที่ชำระทุกเดือน' }],
    },
    diagram: {
    title: 'ขั้นตอนขออนุมัติส่วนลดพิเศษ',
    type: 'flowchart',
    typeLabel: 'ผังงาน',
    summary: 'พนักงานขายยื่นคำขอส่วนลด หัวหน้าทีมพิจารณา และผู้จัดการอนุมัติหากเกินวงเงิน',
    nodes: [{ id: 'a' }, { id: 'b' }, { id: 'c' }, { id: 'd' }],
    edges: [{ from: 'a', to: 'b' }, { from: 'b', to: 'c' }, { from: 'c', to: 'd' }],
    lanes: [],
    notes: ['สมมติว่าวงเงินที่หัวหน้าทีมอนุมัติเองได้คือ 5%'],
    xml:
      '<mxfile><diagram name="Page-1"><mxGraphModel><root><mxCell id="0"/><mxCell id="1" parent="0"/>' +
      '<mxCell id="a" value="ยื่นคำขอส่วนลด" style="rounded=1;whiteSpace=wrap;html=1;" vertex="1" parent="1"><mxGeometry x="40" y="40" width="140" height="50" as="geometry"/></mxCell>' +
      '<mxCell id="b" value="หัวหน้าทีมพิจารณา" style="rounded=1;whiteSpace=wrap;html=1;" vertex="1" parent="1"><mxGeometry x="40" y="140" width="140" height="50" as="geometry"/></mxCell>' +
      '<mxCell id="e1" style="edgeStyle=orthogonalEdgeStyle;" edge="1" parent="1" source="a" target="b"><mxGeometry relative="1" as="geometry"/></mxCell>' +
      '</root></mxGraphModel></diagram></mxfile>',
    },
  },
  undefined,
  // the answers have each their own shape (rows with different fields): only the outline is checked, an object per tool
  (doc) => isRecord(doc) && SAMPLE_TOOLS.every((k) => isRecord(doc[k])),
);

const RESULTS: Record<string, (f: (k: string) => string) => Json> = {
  'doc-analyze': (f) => {
    const { answerToQuestion, ...base } = fresh(SAMPLES['doc-analyze']);
    return { ...base, ...(f('question') ? { question: f('question'), answer: answerToQuestion } : {}) };
  },
  'doc-summary': () => fresh(SAMPLES['doc-summary']),
  'data-analyze': (f) => {
    const { answerToQuestion, ...base } = fresh(SAMPLES['data-analyze']);
    return { ...base, ...(f('question') ? { question: f('question'), answer: answerToQuestion } : {}) };
  },
  meeting: () => fresh(SAMPLES['meeting']),
  slides: (f) => {
    const base = fresh(SAMPLES['slides']);
    return { ...base, title: f('topic') || String(base['title']), slides: (base['slides'] as Json[]).map((sl, k) => (k === 0 && f('topic') ? { ...sl, title: f('topic') } : sl)) };
  },
  image: (f) => {
    const base = fresh(SAMPLES['image']);
    return { ...base, ratio: f('ratio') || String(base['ratio']), requested: Number(f('count')) || 2, prompt: f('prompt') || String(base['prompt']), negative: f('negative') || String(base['negative']), images: (base['images'] as unknown[]).slice(0, Math.max(1, Math.min(2, Number(f('count')) || 2))) };
  },
  video: () => fresh(SAMPLES['video']),
  music: (f) => {
    const base = fresh(SAMPLES['music']);
    return { ...base, title: f('topic') || String(base['title']), genre: f('genre') || String(base['genre']), mood: f('mood') || String(base['mood']) };
  },
  code: () => fresh(SAMPLES['code']),
  strategy: (f) => {
    const base = fresh(SAMPLES['strategy']);
    return { ...base, title: f('topic') || String(base['title']), framework: f('framework') || String(base['framework']), horizon: f('horizon') || String(base['horizon']) };
  },
  howto: (f) => {
    const base = fresh(SAMPLES['howto']);
    return { ...base, title: f('topic') || String(base['title']) };
  },
  diagram: (f) => {
    const base = fresh(SAMPLES['diagram']);
    return { ...base, title: f('topic') || String(base['title']) };
  },
};

// ---------------------------------------------------------------------------------------------- library

interface LibDoc {
  id: string;
  title: string;
  fileName: string;
  ext: string;
  category: string;
  scope: 'all' | 'branches';
  branches: string[];
  pages: number;
  scannedPages: number;
  sizeKb: number;
  uploadedBy: string;
  uploadedAt: string;
  note: string;
  stale: boolean;
  chunks: number;
}

const library: LibDoc[] = reference<LibDoc[]>('aiHub.library', [
  { id: 'd1', title: 'นโยบายการลาและวันหยุด 2569', fileName: 'leave-policy-2569.pdf', ext: 'pdf', category: 'นโยบายบุคคล', scope: 'all', branches: [], pages: 12, scannedPages: 0, sizeKb: 840, uploadedBy: 'ผู้ดูแลระบบ', uploadedAt: '2026-10-02T09:10:00', note: '', stale: false, chunks: 38 },
  { id: 'd2', title: 'ขั้นตอนการอนุมัติส่วนลด', fileName: 'discount-approval.docx', ext: 'docx', category: 'ขั้นตอนงานขาย', scope: 'branches', branches: ['B01', 'B02'], pages: 5, scannedPages: 0, sizeKb: 210, uploadedBy: 'ผู้ดูแลระบบ', uploadedAt: '2026-10-10T14:30:00', note: 'ใช้แทนฉบับปี 2568', stale: false, chunks: 14 },
  { id: 'd3', title: 'คู่มือความปลอดภัยของข้อมูลลูกค้า', fileName: 'data-security.pdf', ext: 'pdf', category: 'นโยบายบุคคล', scope: 'all', branches: [], pages: 20, scannedPages: 4, sizeKb: 2310, uploadedBy: 'ผู้ดูแลระบบ', uploadedAt: '2026-09-21T11:05:00', note: '', stale: true, chunks: 61 },
]);

const libraryStats = () => ({
  chunks: library.reduce((a, d) => a + d.chunks, 0),
  sizeMb: Math.round((library.reduce((a, d) => a + d.sizeKb, 0) / 1024) * 10) / 10,
});

// ---------------------------------------------------------------------------------------------- jobs

const jobs = new Map<string, number>();
let seq = 0;

const ok = (result: Json, extra: Json = {}, tool = ''): Response => {
  const model = (TOOL_MODELS[tool] ?? TEXT_MODELS)[0];
  return json({
    ok: true,
    result,
    elapsedMs: 2400,
    usage: { inputTokens: 1840, outputTokens: 960 },
    model: { label: model.label, logo: model.logo },
    models: [model.key],
    ...extra,
  });
};

async function runTool(tool: string, form: FormData): Promise<Response> {
  const f = (k: string) => String(form.get(k) ?? '');
  const service = serviceEndpoint(tool, f);
  if (service) {
    await wait(250);
    return ok(service, {}, tool);
  }
  // status polls and library bookkeeping are quick; model calls take a moment so the loading animation is visible
  const quick = ['library-docs', 'library-update', 'library-delete', 'meeting-status', 'video-status'].includes(tool);
  await wait(quick ? 300 : tool === 'chat' || tool === 'doc-ask' ? 700 : 1400);

  if (MORE_RESULTS[tool]) return ok(MORE_RESULTS[tool](f), {}, tool);

  if (RESULTS[tool]) {
    if (tool === 'meeting') {
      const file = form.get('files');
      const name = file instanceof File ? file.name : 'meeting.mp3';
      const jobId = `mock-meet-${++seq}`;
      jobs.set(jobId, 0);
      return ok({ async: true, jobId, status: 'transcribing', fileName: name, sizeMb: 12.4, elapsedSeconds: 0 }, {}, tool);
    }
    return ok(RESULTS[tool](f), {}, tool);
  }

  switch (tool) {
    case 'meeting-status': {
      const jobId = f('jobId');
      const n = (jobs.get(jobId) ?? 0) + 1;
      jobs.set(jobId, n);
      if (n >= 2) return ok(RESULTS['meeting'](f), {}, 'meeting');
      return ok({ status: 'summarizing', jobId, fileName: 'ประชุมทีมขาย-สัปดาห์ที่-42.mp3', elapsedSeconds: 38 }, {}, 'meeting');
    }
    case 'video-status': {
      const jobId = f('jobId');
      const n = (jobs.get(jobId) ?? 0) + 1;
      jobs.set(jobId, n);
      if (n >= 2) return ok({ status: 'completed', total: 3, clips: [], message: 'เรนเดอร์เสร็จครบ 3 ฉาก (โหมดตัวอย่างไม่มีไฟล์วิดีโอจริง)' }, {}, 'video');
      return ok({ status: 'rendering', message: 'กำลังเรนเดอร์ฉากที่ 1 จาก 3…', clips: [] }, {}, 'video');
    }
    case 'doc-ask':
      return ok({ question: f('question'), answer: 'ผู้ซื้อเป็นผู้รับผิดชอบค่าธรรมเนียมการโอนและภาษี ตามข้อ 6.2 ของสัญญา', citations: [{ page: 5, quote: 'ค่าธรรมเนียมการโอนและภาษีทุกประเภทเป็นภาระของผู้ซื้อ' }] }, {}, 'doc-analyze');
    case 'chat':
      return ok({ reply: msg('รับทราบครับ ผมช่วยเรื่อง "{0}" ได้ ดังนี้\n- สรุปประเด็นสำคัญจากผลลัพธ์บนจอ\n- **ข้อแนะนำ**: ตรวจสอบตัวเลขอีกครั้งก่อนนำไปใช้จริง\n\n(คำตอบจากโหมดตัวอย่าง)', f('message').slice(0, 60)) }, {}, 'chat');
    case 'library-docs':
      return ok({ docs: library, categories: [...new Set(library.map((d) => d.category))], admin: true, stats: libraryStats() }, {}, 'library-ask');
    case 'library-upload': {
      const added: Json[] = [];
      for (const file of form.getAll('files')) {
        if (!(file instanceof File)) continue;
        const d: LibDoc = {
          id: `d${library.length + 1}-${++seq}`,
          title: f('title') || file.name.replace(/\.[^.]+$/, ''),
          fileName: file.name,
          ext: (file.name.split('.').pop() ?? '').toLowerCase(),
          category: f('category'),
          scope: f('scope') === 'branches' ? 'branches' : 'all',
          branches: f('branches') ? f('branches').split(',').map((b) => b.trim()) : [],
          pages: 3,
          scannedPages: 0,
          sizeKb: Math.max(1, Math.round(file.size / 1024)),
          uploadedBy: 'ผู้ใช้ทดลอง',
          uploadedAt: new Date().toISOString().slice(0, 19),
          note: f('note'),
          stale: false,
          chunks: 9,
        };
        library.unshift(d);
        added.push(d as unknown as Json);
      }
      return ok({ added, failed: [], warnings: [] }, {}, 'library-ask');
    }
    case 'library-update': {
      const d = library.find((x) => x.id === f('docId'));
      if (!d) return failure(msg('ไม่พบเอกสาร'));
      Object.assign(d, { title: f('title') || d.title, category: f('category'), note: f('note'), scope: f('scope'), branches: f('branches') ? f('branches').split(',').map((b) => b.trim()) : [] });
      return ok({}, {}, 'library-ask');
    }
    case 'library-delete': {
      const i = library.findIndex((x) => x.id === f('docId'));
      if (i >= 0) library.splice(i, 1);
      return ok({}, {}, 'library-ask');
    }
    case 'library-ask': // reached only when RESULTS has no entry (it has none on purpose)
      break;
  }
  return failure(msg('ไม่รู้จักเครื่องมือ {0}', tool));
}

function libraryAnswer(f: (k: string) => string): Json {
  return {
    question: f('question'),
    answer:
      'พนักงานมีสิทธิ์ลาพักร้อนปีละ **10 วันทำงาน** เมื่อทำงานครบ 1 ปี [1]\n- ต้องแจ้งหัวหน้าล่วงหน้าอย่างน้อย 3 วัน [1]\n- ลาป่วยเกิน 3 วันต้องแนบใบรับรองแพทย์ [2]',
    found: true,
    category: f('category'),
    searched: { docs: library.length },
    sources: [
      { n: 1, docId: 'd1', ext: 'pdf', page: 4, title: library[0]?.title ?? 'นโยบายการลา', where: 'ข้อ 4.1', category: 'นโยบายบุคคล', fileName: 'leave-policy-2569.pdf', snippet: 'พนักงานที่ทำงานครบ 1 ปี มีสิทธิ์ลาพักร้อนปีละ 10 วันทำงาน โดยต้องแจ้งล่วงหน้า…', used: true },
      { n: 2, docId: 'd1', ext: 'pdf', page: 7, title: library[0]?.title ?? 'นโยบายการลา', where: 'ข้อ 5.2', category: 'นโยบายบุคคล', fileName: 'leave-policy-2569.pdf', snippet: 'การลาป่วยตั้งแต่ 3 วันขึ้นไป ต้องแนบใบรับรองแพทย์…', used: true },
      { n: 3, docId: 'd3', ext: 'pdf', page: 2, title: 'คู่มือความปลอดภัยของข้อมูลลูกค้า', where: 'หน้า 2', category: 'นโยบายบุคคล', fileName: 'data-security.pdf', snippet: 'ข้อมูลส่วนบุคคลของพนักงานเก็บรักษาตามนโยบายความเป็นส่วนตัว…', used: false },
    ],
    followUps: ['ลาพักร้อนข้ามปีได้หรือไม่', 'ลากิจต้องแจ้งล่วงหน้ากี่วัน'],
  };
}

const usage = () => ({
  ok: true,
  enabled: true,
  month: '2026-10',
  me: {
    runs: 14,
    totalTokens: 48200,
    inputTokens: 31200,
    outputTokens: 17000,
    images: 6,
    videoSeconds: 30,
    audioSeconds: 2184,
    byGroup: { document: 7, content: 4, developer: 1, knowledge: 2 },
    byModel: [
      { kind: 'text', model: M.sonnet.key, label: M.sonnet.label, vendor: M.sonnet.vendor, logo: M.sonnet.logo, runs: 9, inputTokens: 21000, outputTokens: 12000 },
      { kind: 'text', model: M.qwenCoder.key, label: M.qwenCoder.label, vendor: M.qwenCoder.vendor, logo: M.qwenCoder.logo, runs: 1, inputTokens: 4200, outputTokens: 2600 },
      { kind: 'image', model: M.sdxl.key, label: M.sdxl.label, vendor: M.sdxl.vendor, logo: M.sdxl.logo, runs: 3, images: 6 },
    ],
    recent: [
      { tool: 'doc-analyze', label: 'สัญญาซื้อขายรถยนต์-ตัวอย่าง.pdf', model: M.sonnet.label, logo: M.sonnet.logo, tokens: 5200, at: '2026-10-19T09:41:00' },
      { tool: 'image', label: 'บ้านสวยริมทะเลยามเย็น', model: M.sdxl.label, logo: M.sdxl.logo, images: 2, at: '2026-10-18T16:20:00' },
      { tool: 'chat', label: 'ถามต่อจากผลวิเคราะห์', model: M.haiku.label, logo: M.haiku.logo, tokens: 900, at: '2026-10-17T11:02:00' },
    ],
  },
  branch: { code: 'SUN', name: 'SUN GATEWAY', runs: 86, users: 9, totalTokens: 312000 },
});

// ---------------------------------------------------------------------------------------------- entry

/**
 * fetch() replacement used by the engine in mock mode. Anything that is not under `<apiBase>` (e.g. the sample
 * diagram in /assets) is passed through to the real fetch.
 */
export async function mockAiHubFetch(input: string, init: RequestInit | undefined, apiBase: string): Promise<Response> {
  // the customer search of `customer-brief` asks the CRM BFF, not the AI HUB servlet
  const [crmPath, crmQuery = ''] = input.split('?');
  const prospect = prospectEndpoint(crmPath, new URLSearchParams(crmQuery));
  if (prospect) {
    await wait(250);
    return json(prospect);
  }
  if (!input.includes(apiBase)) return fetch(input, init);

  const path = input.slice(input.indexOf(apiBase) + apiBase.length).split('?')[0];
  const method = (init?.method ?? 'GET').toUpperCase();

  if (method === 'GET' && path === '/tools') {
    await wait(300);
    return json({
      ok: true,
      version: 'mock-1.0',
      models: { main: M.sonnet.label },
      tools: Object.entries(TOOL_MODELS).map(([id, modelOptions]) => ({ id, modelOptions })),
      diagram: { editorUrl: 'https://embed.diagrams.net/', lang: 'th' },
      library: { enabled: true },
    });
  }
  if (method === 'GET' && path === '/usage') {
    await wait(400);
    return json(usage());
  }
  if (method === 'POST' && path.startsWith('/tools/')) {
    const tool = path.slice('/tools/'.length);
    const form = init?.body instanceof FormData ? init.body : new FormData();
    if (tool === 'library-ask') {
      await wait(1200);
      return ok(libraryAnswer((k) => String(form.get(k) ?? '')), {}, tool);
    }
    return runTool(tool, form);
  }
  return failure(`Mock AI HUB: ${method} ${path} is not implemented`, 501);
}
