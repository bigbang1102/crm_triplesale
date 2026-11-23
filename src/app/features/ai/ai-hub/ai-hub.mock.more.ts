import { reference, msg } from '@core/mock/reference';
/**
 * Sample answers of the AI HUB tools added after the first port (document compare / extract / check, social, article, voice-over,
 * code & writing helpers, quiz, FAQ, project plan, decision matrix, customer brief, Claude Code) for `mock: true`.
 *
 * Each entry answers the JSON the matching renderer of `ai-hub.engine.ts` reads (`RENDER[tool]` + its title/meta function).
 * Framework-free like `ai-hub.mock.ts`; every name, figure and key below is invented.
 */

export type Json = Record<string, unknown>;
export type Field = (key: string) => string;

const section = (heading: string, rest: Json): Json => ({ heading, ...rest });
const level = (lv: 'high' | 'medium' | 'low' | 'info', title: string, detail: string): Json => ({ level: lv, title, detail });
const withKind = (f: Field, key: string, fallback: string): string => f(key) || fallback;

// ---------------------------------------------------------------------------------------------- code & text helpers

const JAVA_SNIPPET = `public BigDecimal discount(BigDecimal price, int qty) {
    if (price == null || qty <= 0) {
        return BigDecimal.ZERO;
    }
    BigDecimal rate = qty >= 10 ? new BigDecimal("0.10") : BigDecimal.ZERO;
    return price.multiply(rate).setScale(2, RoundingMode.HALF_UP);
}`;

const codeReview = (): Json => fresh(SAMPLES['codeReview']);

const sqlAssist = (f: Field): Json => ({ ...fresh(SAMPLES['sqlAssist']), mode: withKind(f, 'mode', String(SAMPLES['sqlAssist']['mode'])), dialect: withKind(f, 'dialect', String(SAMPLES['sqlAssist']['dialect'])) });

const logDoctor = (): Json => fresh(SAMPLES['logDoctor']);

const codeDocs = (f: Field): Json => ({ ...fresh(SAMPLES['codeDocs']), kind: withKind(f, 'kind', String(SAMPLES['codeDocs']['kind'])) });

const quiz = (f: Field): Json => ({ ...fresh(SAMPLES['quiz']), mode: withKind(f, 'mode', String(SAMPLES['quiz']['mode'])) });

const letterSection = (heading: string, text: string): Json => section(heading, { text });

const formalWriter = (f: Field): Json => ({ ...fresh(SAMPLES['formalWriter']), kind: withKind(f, 'kind', String(SAMPLES['formalWriter']['kind'])), lang: withKind(f, 'lang', String(SAMPLES['formalWriter']['lang'])) });

const article = (f: Field): Json => ({ ...fresh(SAMPLES['article']), kind: withKind(f, 'kind', String(SAMPLES['article']['kind'])), lang: withKind(f, 'lang', String(SAMPLES['article']['lang'])) });

const replyDraft = (f: Field): Json => ({ ...fresh(SAMPLES['replyDraft']), channel: withKind(f, 'channel', String(SAMPLES['replyDraft']['channel'])) });

const hrDocs = (f: Field): Json => ({ ...fresh(SAMPLES['hrDocs']), kind: withKind(f, 'kind', String(SAMPLES['hrDocs']['kind'])) });

const faq = (f: Field): Json => ({ ...fresh(SAMPLES['faq']), audience: withKind(f, 'audience', String(SAMPLES['faq']['audience'])) });

// ---------------------------------------------------------------------------------------------- structured results

const docCompare = (): Json => fresh(SAMPLES['docCompare']);

const docExtract = (): Json => fresh(SAMPLES['docExtract']);

const docCheck = (): Json => fresh(SAMPLES['docCheck']);

const projectPlan = (): Json => fresh(SAMPLES['projectPlan']);

const decision = (): Json => fresh(SAMPLES['decision']);

const social = (): Json => fresh(SAMPLES['social']);

const voiceover = (): Json => fresh(SAMPLES['voiceover']);

const customerBrief = (f: Field): Json => fresh(SAMPLES[f('preview') ? 'customerBriefPreview' : 'customerBrief']);

/** result bodies by tool id — the entry point `ai-hub.mock.ts` merges into its own table */
// ---------------------------------------------------------------------------------------------- the sample answers (data)

/** what a tool answers when nothing is typed in: `ref.aiHub.json` › `moreSamples` of the shared Datasource when it has them (the page and the code only mix the input in, `withKind`) */
const isRecord = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);
const fresh = <T>(v: T): T => JSON.parse(JSON.stringify(v)) as T;
const samplesNames = ['customerBriefPreview', 'customerBrief', 'codeReview', 'sqlAssist', 'logDoctor', 'codeDocs', 'quiz', 'formalWriter', 'article', 'replyDraft', 'hrDocs', 'faq', 'docCompare', 'docExtract', 'docCheck', 'projectPlan', 'decision', 'social', 'voiceover'];
const SAMPLES = reference<Record<string, Json>>(
  'aiHub.moreSamples',
  {
    customerBriefPreview: {
      customer: { type: 'องค์กร', stage: 'เจรจา', leads: 2, note: 'ข้อมูลที่ตัดชื่อ เบอร์โทร อีเมล และ LINE ออกแล้ว (mock)' },
    },
    customerBrief: {
  code: 'C-0001',
  leads: 2,
  headline: 'ลูกค้าสนใจแพ็กเกจรายปี รอใบเสนอราคาฉบับปรับ',
  temperature: 'warm',
  temperatureWhy: 'ตอบกลับภายใน 1 วัน และขอใบเสนอราคาเพิ่ม',
  stage: 'เจรจา',
  summary: 'ลูกค้าองค์กรขนาดกลาง ติดต่อมา 3 ครั้งใน 2 สัปดาห์ ประเด็นหลักคือราคาและระยะเวลาติดตั้ง (ข้อมูลสมมติ)',
  nextActions: [
    { action: 'ส่งใบเสนอราคาฉบับปรับ', why: 'ลูกค้ารอเทียบกับคู่แข่ง', when: 'ภายในพรุ่งนี้' },
    { action: 'นัดสาธิตระบบ', why: 'ผู้ตัดสินใจยังไม่เคยเห็นของจริง', when: 'สัปดาห์นี้' },
  ],
  drafts: [{ channel: 'line', text: 'สวัสดีครับ ส่งใบเสนอราคาฉบับปรับให้แล้วนะครับ สะดวกให้โทรอธิบายช่วงไหนบอกได้เลย' }, { channel: 'email', subject: 'ใบเสนอราคาฉบับปรับ', text: 'เรียน [ชื่อลูกค้า] แนบใบเสนอราคาฉบับปรับตามที่ได้คุยกันครับ' }],
  callScript: { opening: 'สวัสดีครับ ติดตามเรื่องใบเสนอราคาที่ส่งไป', questions: ['งบประมาณที่ตั้งไว้เท่าไร', 'ต้องการเริ่มใช้เมื่อไร'], objections: [{ concern: 'ราคาสูงกว่าที่คาด', reply: 'ปรับแพ็กเกจให้ตรงงบได้ครับ' }], close: 'ขอนัดสาธิตวันพฤหัสได้ไหมครับ' },
  facts: [{ label: 'ประเภท', value: 'องค์กร' }, { label: 'ผู้ดูแล', value: 'ทีมขายกรุงเทพ' }],
  needs: ['ระบบติดตามลูกค้า', 'รายงานรายสัปดาห์'],
  concerns: ['ระยะเวลาติดตั้ง'],
  timeline: [{ date: '2026-11-10', event: 'ส่งใบเสนอราคาฉบับแรก' }, { date: '2026-11-14', event: 'ลูกค้าขอปรับราคา' }],
  missing: ['งบประมาณที่แท้จริง'],
    },
    codeReview: {
  title: 'ผลรีวิวโค้ด',
  summary: 'พบ 1 ประเด็นสำคัญเรื่องการจัดการค่า null และ 2 ข้อสังเกตเรื่องความอ่านง่าย (ข้อมูลตัวอย่าง mock)',
  sections: [
    section('ปัญหาที่พบ', {
      items: [
        level('high', 'ไม่ตรวจค่า null ของ price', 'บรรทัด 12 เรียก price.multiply โดยไม่ตรวจ null — เสี่ยง NullPointerException ตอนราคาว่าง'),
        level('medium', 'ตัวเลขคงที่ฝังในโค้ด', 'อัตราส่วนลด 0.10 และจำนวน 10 ควรยกเป็นค่าคงที่ที่มีชื่อ'),
        level('low', 'ชื่อตัวแปร rate คลุมเครือ', 'ใช้ discountRate จะอ่านง่ายกว่า'),
      ],
    }),
    section('โค้ดที่แนะนำ', { code: { language: 'java', content: JAVA_SNIPPET } }),
  ],
  notes: ['ตรวจจากโค้ดที่วางมาเท่านั้น ไม่ได้รันหรือคอมไพล์'],
    },
    sqlAssist: {
  title: 'ยอดขายรายเดือนแยกสาขา',
  mode: 'write',
  dialect: 'postgresql',
  summary: 'รวมยอดใบเสนอราคาที่อนุมัติแล้วต่อเดือนและสาขา เรียงเดือนล่าสุดก่อน',
  sections: [
    section('คำสั่ง SQL', {
      code: {
        language: 'sql',
        content: `SELECT date_trunc('month', q.approved_at) AS month,\n       b.code AS branch,\n       SUM(q.total_amount) AS total\nFROM quotation q\nJOIN branch b ON b.id = q.branch_id\nWHERE q.status = 'APPROVED'\nGROUP BY 1, 2\nORDER BY 1 DESC, 2;`,
      },
    }),
    section('อธิบาย', { bullets: ['กรองเฉพาะสถานะ APPROVED', 'จัดกลุ่มตามเดือนและสาขา', 'ควรมี index ที่ (status, approved_at)'] }),
  ],
    },
    logDoctor: {
  title: 'ผลวิเคราะห์ log',
  summary: 'สาเหตุหลักคือการเชื่อมต่อฐานข้อมูลหมดเวลา (connection timeout) หลังจาก pool เต็ม',
  sections: [
    section('สาเหตุที่เป็นไปได้', {
      items: [
        level('high', 'Connection pool เต็ม', 'พบ "Timeout waiting for connection" ซ้ำ 14 ครั้งในช่วง 09:02–09:05'),
        level('medium', 'Query ช้า', 'คำสั่งค้นหาลูกค้าใช้เวลา 8.4 วินาที'),
      ],
    }),
    section('วิธีแก้', { bullets: ['เพิ่ม maxPoolSize ชั่วคราวและตรวจ connection ที่ไม่ถูกคืน', 'เพิ่ม index ให้คอลัมน์ที่ใช้ค้นหา', 'ตั้ง alert เมื่อ pool ใช้เกิน 80%'] }),
  ],
    },
    codeDocs: {
  title: 'Unit test ของ discount()',
  kind: 'tests',
  summary: 'ชุดทดสอบครอบคลุมกรณีปกติ ขอบเขต และค่าว่าง',
  sections: [
    section('JUnit', {
      code: {
        language: 'java',
        content: `@Test\nvoid noDiscountBelowTen() {\n    assertEquals(new BigDecimal("0.00"), svc.discount(new BigDecimal("100"), 9));\n}\n\n@Test\nvoid tenPercentFromTen() {\n    assertEquals(new BigDecimal("10.00"), svc.discount(new BigDecimal("100"), 10));\n}`,
      },
    }),
  ],
    },
    quiz: {
  title: 'แบบทดสอบความรู้เรื่องใบเสนอราคา',
  mode: 'quiz',
  summary: 'ตัวอย่าง 2 ข้อ (mock)',
  sections: [
    section('ปรนัย', {
      qa: [
        { q: 'เอกสารใดออกก่อนใบสั่งขาย', choices: ['ใบเสนอราคา', 'ใบเสร็จรับเงิน', 'ใบรับคืน'], answer: 'ใบเสนอราคา', explain: 'ใบเสนอราคาเป็นขั้นแรกของการขาย' },
        { q: 'สถานะใดแปลว่าลูกค้าตกลงแล้ว', choices: ['รออนุมัติ', 'อนุมัติ', 'ยกเลิก'], answer: 'อนุมัติ', explain: '' },
      ],
    }),
  ],
    },
    formalWriter: {
  title: 'หนังสือขอเลื่อนกำหนดส่งมอบ',
  kind: 'letter',
  lang: 'th',
  summary: 'ร่างหนังสือถึงลูกค้า เติมข้อมูลใน [วงเล็บเหลี่ยม] ก่อนส่ง',
  sections: [
    letterSection('เนื้อหา', 'เรียน [ชื่อผู้รับ]\n\nตามที่บริษัทฯ ได้กำหนดส่งมอบสินค้าวันที่ [วันที่เดิม] นั้น บริษัทฯ ขอเรียนแจ้งขอเลื่อนเป็นวันที่ [วันที่ใหม่] เนื่องจาก [เหตุผล] จึงเรียนมาเพื่อโปรดพิจารณา\n\nขอแสดงความนับถือ'),
  ],
    },
    article: {
  title: '5 เคล็ดลับติดตามลูกค้าให้ปิดการขายเร็วขึ้น',
  kind: 'blog',
  lang: 'th',
  summary: 'บทความบล็อกความยาวประมาณ 600 คำ (ตัวอย่าง mock)',
  sections: [
    letterSection('บทนำ', 'การติดตามลูกค้าที่ดีไม่ใช่การโทรถามซ้ำ แต่คือการให้ข้อมูลที่ลูกค้ายังขาดในเวลาที่เหมาะสม'),
    section('เคล็ดลับ', { bullets: ['นัดขั้นตอนถัดไปทุกครั้งที่คุยจบ', 'สรุปสิ่งที่ตกลงเป็นข้อความสั้น ๆ', 'ส่งตัวอย่างงานที่ตรงกับปัญหาของลูกค้า'] }),
  ],
    },
    replyDraft: {
  title: 'ตอบลูกค้าเรื่องขอลดราคา',
  channel: 'email',
  variants: 2,
  summary: 'ร่างข้อความ 2 แบบ น้ำเสียงสุภาพ ไม่สัญญาส่วนลดที่ไม่ได้ระบุ',
  sections: [
    letterSection('ร่างที่ 1 — กระชับ', 'สวัสดีครับ คุณ[ชื่อลูกค้า] ขอบคุณที่สนใจครับ ราคานี้เป็นราคาพิเศษสำหรับรอบนี้แล้ว หากสั่งจำนวนมากขึ้นผมขอปรึกษาทีมเรื่องเงื่อนไขเพิ่มเติมให้ครับ'),
    letterSection('ร่างที่ 2 — เป็นกันเอง', 'ขอบคุณมากครับ เดี๋ยวผมเช็กเงื่อนไขกับทีมแล้วรีบแจ้งกลับภายในพรุ่งนี้นะครับ'),
  ],
    },
    hrDocs: {
  title: 'Job Description — พนักงานขายอาวุโส',
  kind: 'jd',
  summary: 'ร่างตำแหน่งงานตัวอย่าง ให้ฝ่ายบุคคลตรวจกับระเบียบบริษัท',
  sections: [
    section('หน้าที่หลัก', { bullets: ['ดูแลลูกค้าองค์กรและติดตามโอกาสขาย', 'จัดทำใบเสนอราคาและต่อรองเงื่อนไข', 'รายงานผลการขายรายสัปดาห์'] }),
    section('คุณสมบัติ', { bullets: ['ประสบการณ์ขาย B2B 3 ปีขึ้นไป', 'สื่อสารภาษาอังกฤษได้'] }),
  ],
    },
    faq: {
  title: 'คำถามที่พบบ่อยเรื่องการสั่งซื้อ',
  audience: 'customer',
  summary: 'สร้างจากเอกสารที่ให้มา 2 ข้อ (mock)',
  sections: [
    section('การสั่งซื้อ', {
      qa: [
        { q: 'ชำระเงินได้กี่ช่องทาง', answer: 'โอนเงินและบัตรเครดิต', explain: '' },
        { q: 'ยกเลิกคำสั่งซื้อได้เมื่อไร', answer: 'ก่อนวันส่งมอบอย่างน้อย 3 วันทำการ', explain: 'ตามข้อ 4.2 ของเงื่อนไข' },
      ],
    }),
  ],
    },
    docCompare: {
  docId: 'mock-cmp-1',
  verdict: 'minor',
  highImpact: 1,
  documents: [{ name: 'สัญญาเช่า-ฉบับเดิม.pdf', pages: 6 }, { name: 'สัญญาเช่า-ฉบับแก้ไข.pdf', pages: 7 }],
  summary: 'ฉบับใหม่ปรับค่าเช่าและเพิ่มข้อกำหนดค่าปรับ โดยเนื้อหาส่วนอื่นแทบไม่เปลี่ยน',
  changes: [
    { type: 'changed', topic: 'ค่าเช่ารายเดือน', where: 'ข้อ 3', impact: 'high', before: '25,000 บาท', after: '27,500 บาท', note: 'เพิ่มขึ้น 10%' },
    { type: 'added', topic: 'ค่าปรับชำระล่าช้า', where: 'ข้อ 8.1', impact: 'medium', before: '', after: 'ร้อยละ 1.5 ต่อเดือนของยอดที่ค้าง', note: '' },
    { type: 'removed', topic: 'สิทธิ์ต่ออายุอัตโนมัติ', where: 'ข้อ 12', impact: 'low', before: 'ต่ออายุอัตโนมัติ 1 ปี', after: '', note: '' },
  ],
  risks: ['ภาระค่าเช่าเพิ่มขึ้นตลอดอายุสัญญา', 'ไม่มีสิทธิ์ต่ออายุอัตโนมัติ'],
  questions: ['ขอผ่อนผันค่าปรับช่วง 3 เดือนแรกได้หรือไม่'],
  unchanged: ['ระยะเวลาเช่า 3 ปี', 'เงินประกัน 2 เดือน'],
    },
    docExtract: {
  title: 'ข้อมูลใบแจ้งหนี้',
  rows: 3,
  columns: 4,
  mode: 'documents',
  summary: 'ดึงข้อมูลจากใบแจ้งหนี้ 3 ฉบับ',
  sections: [
    section('ตาราง', {
      table: {
        columns: ['เลขที่เอกสาร', 'วันที่', 'ลูกค้า', 'ยอดรวม'],
        rows: [['INV-0001', '2026-10-02', 'บริษัท ตัวอย่าง จำกัด', '12,500.00'], ['INV-0002', '2026-10-09', 'ห้างหุ้นส่วนสมมติ', '8,900.00'], ['INV-0003', '2026-10-15', '', '4,200.00']],
      },
    }),
  ],
    },
    docCheck: {
  title: 'ผลตรวจสัญญา',
  summary: 'ผ่าน 2 จาก 4 ข้อ (ตัวอย่าง mock)',
  score: { pass: 2, fail: 1, missing: 1, unclear: 0, total: 4 },
  checks: [
    { status: 'pass', item: 'ระบุคู่สัญญาครบ', evidence: 'ระหว่างบริษัท ก จำกัด และบริษัท ข จำกัด', where: 'หน้า 1', note: '' },
    { status: 'pass', item: 'ระบุมูลค่าสัญญา', evidence: 'มูลค่ารวม 1,200,000 บาท', where: 'ข้อ 2', note: '' },
    { status: 'fail', item: 'มีเงื่อนไขการชำระเงิน', evidence: '', where: 'ข้อ 4', note: 'ไม่ระบุกำหนดวันชำระ' },
    { status: 'missing', item: 'มีข้อกำหนดการรักษาความลับ', evidence: '', where: '', note: 'ไม่พบข้อความในเอกสาร' },
  ],
  sections: [],
    },
    projectPlan: {
  title: 'แผนติดตั้งระบบ CRM',
  start: '2026-11-02',
  end: '2026-12-11',
  weeks: 6,
  summary: 'แผน 6 สัปดาห์ แบ่ง 3 ระยะ',
  plan: [
    { phase: 'เตรียมงาน', task: 'เก็บความต้องการ', owner: 'ทีมวิเคราะห์', start: '2026-11-02', end: '2026-11-13', startWeek: 0, weeks: 2, deliverable: 'เอกสารความต้องการ' },
    { phase: 'พัฒนา', task: 'ตั้งค่าระบบและย้ายข้อมูล', owner: 'ทีมพัฒนา', start: '2026-11-16', end: '2026-12-04', startWeek: 2, weeks: 3, deliverable: 'ระบบพร้อมทดสอบ' },
    { phase: 'ส่งมอบ', task: 'อบรมและเปิดใช้งาน', owner: 'ทีมฝึกอบรม', start: '2026-12-07', end: '2026-12-11', startWeek: 5, weeks: 1, deliverable: 'รายงานปิดโครงการ' },
  ],
  milestones: [{ name: 'ลงนามรับความต้องการ', week: 2, date: '2026-11-13' }, { name: 'เปิดใช้งานจริง', week: 6, date: '2026-12-11' }],
  sections: [section('ความเสี่ยง', { bullets: ['ข้อมูลเดิมไม่สะอาด ใช้เวลาล้างข้อมูลเพิ่ม'] })],
    },
    decision: {
  title: 'เลือกผู้ให้บริการคลาวด์',
  summary: 'เปรียบเทียบ 2 ตัวเลือกจาก 3 เกณฑ์',
  matrix: {
    criteria: [{ name: 'ราคา', weight: 40 }, { name: 'ความปลอดภัย', weight: 35 }, { name: 'การสนับสนุน', weight: 25 }],
    options: [
      { name: 'ผู้ให้บริการ A', scores: [4, 5, 3], total: 82, rank: 1, pros: ['ราคาคุ้ม', 'ใบรับรองครบ'], cons: ['ซัพพอร์ตตอบช้า'] },
      { name: 'ผู้ให้บริการ B', scores: [3, 4, 5], total: 78, rank: 2, pros: ['ซัพพอร์ตดี'], cons: ['ราคาสูงกว่า'] },
    ],
  },
  sections: [],
    },
    social: {
  mode: 'posts',
  title: 'โพสต์เปิดตัวบริการใหม่',
  angle: 'เน้นความง่ายในการเริ่มต้นใช้งานภายในวันเดียว',
  channels: ['facebook', 'line'],
  posts: [
    { channel: 'facebook', format: 'image', bestTime: '19:00', caption: 'เริ่มใช้งานได้ภายในวันเดียว ไม่ต้องติดตั้งอะไรเพิ่ม', hashtags: ['#บริการใหม่', '#เริ่มง่าย'], visual: 'ภาพหน้าจอระบบพร้อมข้อความสั้น' },
    { channel: 'line', format: 'story', bestTime: '12:00', caption: 'ลองใช้ฟรี 14 วัน แค่ตอบแชทนี้', hashtags: [], visual: '' },
  ],
  tips: ['โพสต์ช่วงหลังเลิกงานได้ผลดีกว่า'],
    },
    voiceover: {
  title: 'พากย์โฆษณา 15 วินาที',
  voiceLabel: 'เปรมวดี',
  providerName: 'Azure Speech',
  chars: 84,
  audio: { fileId: 'mock-wav', seconds: 14 },
  paragraphs: [{ text: 'พบกับบริการใหม่ที่ทำให้งานขายของคุณง่ายขึ้น', fileId: 'mock-wav', seconds: 6 }, { text: 'เริ่มต้นวันนี้ได้ทันที', fileId: 'mock-wav', seconds: 3 }],
  changes: ['เปลี่ยน "CRM" เป็น "ซีอาร์เอ็ม" เพื่ออ่านออกเสียงถูก'],
    },
  },
  undefined,
  // the answers have each their own shape (rows with different fields), so only the outline is checked: an object per tool
  (doc) => isRecord(doc) && samplesNames.every((k) => isRecord(doc[k])),
);

export const MORE_RESULTS: Record<string, (f: Field) => Json> = {
  'code-review': codeReview,
  'sql-assist': sqlAssist,
  'log-doctor': logDoctor,
  'code-docs': codeDocs,
  quiz,
  'formal-writer': formalWriter,
  article,
  'reply-draft': replyDraft,
  'hr-docs': hrDocs,
  faq,
  'doc-compare': docCompare,
  'doc-extract': docExtract,
  'doc-check': docCheck,
  'project-plan': projectPlan,
  decision,
  social,
  voiceover,
  'customer-brief': customerBrief,
};

// ---------------------------------------------------------------------------------------------- Claude Code (me side)

interface CcKey {
  id: string;
  name: string;
  hint: string;
  createdAt: string;
  lastUsedAt: string | null;
  requests: number;
  copyable: boolean;
  costUsd: number;
  inputTokens: number;
  outputTokens: number;
  cacheReadTokens: number;
  cacheWriteTokens: number;
  budgetUsd: number;
}

const ccState = { status: 'NONE', note: '', keys: [] as CcKey[], seq: 0 };

const ccDaily = () =>
  [1, 2, 3, 4].map((d) => ({
    day: `2026-11-0${d}`,
    date: `2026-11-0${d}`,
    tokensKnown: true,
    requests: 12 * d,
    errors: 0,
    inputTokens: 4000 * d,
    outputTokens: 1500 * d,
    cacheReadTokens: 30000 * d,
    cacheWriteTokens: 2000 * d,
    totalTokens: 37500 * d,
    costUsd: 0.42 * d,
  }));

const ccStatus = (): Json => ({
  enabled: true,
  identified: true,
  admin: false,
  pending: 0,
  month: '2026-11',
  maxKeys: 5,
  region: 'us-east-1',
  models: { sonnet: 'mock.sonnet', haiku: 'mock.haiku', opus: 'mock.opus' },
  prices: { sonnet: { input: 3, output: 15 }, haiku: { input: 1, output: 5 }, opus: { input: 15, output: 75 } },
  me: {
    status: ccState.status,
    name: 'ผู้ใช้ตัวอย่าง',
    branchName: 'SUN GATEWAY',
    note: ccState.note,
    requestedAt: '2026-11-04T09:00:00',
    families: ['sonnet', 'haiku'],
    budgetUsd: 50,
    keys: ccState.keys,
    usage: {
      costUsd: 4.2,
      requests: 120,
      errors: 0,
      lastUsedAt: '2026-11-04T10:30:00',
      inputTokens: 40000,
      outputTokens: 15000,
      cacheReadTokens: 300000,
      cacheWriteTokens: 20000,
      byFamily: { sonnet: 3.6, haiku: 0.6 },
      byDay: { '01': 0.42, '02': 0.84, '03': 1.26, '04': 1.68 },
      daily: ccDaily(),
    },
  },
});

const ccNewKey = (name: string): CcKey => {
  const n = ++ccState.seq;
  return {
    id: `mock-key-${n}`,
    name: name.trim() || msg('เครื่องที่ {0}', n),
    hint: `sk-mock-…${String(1000 + n)}`,
    createdAt: new Date().toISOString(),
    lastUsedAt: null,
    requests: 0,
    copyable: true,
    costUsd: 0,
    inputTokens: 0,
    outputTokens: 0,
    cacheReadTokens: 0,
    cacheWriteTokens: 0,
    budgetUsd: 0,
  };
};

function claudeCode(f: Field): Json {
  const keyId = f('keyId');
  switch (f('action')) {
    case 'request':
      ccState.note = f('note');
      // a sample approval so the whole key flow can be tried without an admin account
      ccState.status = 'ACTIVE';
      return ccStatus();
    case 'issue-key': {
      const existing = ccState.keys.find((k) => k.id === keyId);
      const key = existing ?? ccNewKey(f('name'));
      if (!existing) ccState.keys.push(key);
      return { ...ccStatus(), secret: `sk-mock-${key.id}-0000000000`, keyId: key.id, keyName: key.name };
    }
    case 'reveal-key': {
      const key = ccState.keys.find((k) => k.id === keyId);
      return { ...ccStatus(), secret: key ? `sk-mock-${key.id}-0000000000` : '', keyId, keyName: key?.name ?? '' };
    }
    case 'revoke-key':
      ccState.keys = ccState.keys.filter((k) => k.id !== keyId);
      return ccStatus();
    case 'rename-key':
      ccState.keys = ccState.keys.map((k) => (k.id === keyId ? { ...k, name: f('name') } : k));
      return ccStatus();
    default:
      return ccStatus();
  }
}

// ---------------------------------------------------------------------------------------------- small service endpoints

const VOICES = [
  { id: 'th-TH-PremwadeeNeural', label: 'เปรมวดี', provider: 'azure', gender: 'female' },
  { id: 'th-TH-NiwatNeural', label: 'นิวัฒน์', provider: 'azure', gender: 'male' },
];

/** answers of the non-AI endpoints the page calls (`POST /tools/<id>`); `undefined` = not one of them */
export function serviceEndpoint(tool: string, f: Field): Json | undefined {
  switch (tool) {
    case 'claude-code':
      return claudeCode(f);
    case 'connect':
      return {};
    case 'chat-history':
      return { sessions: [] };
    case 'image-template':
      return { templates: [], canManage: false, max: 60 };
    case 'voiceover-voices':
      return { enabled: true, providers: { azure: true }, voices: VOICES };
    default:
      return undefined;
  }
}

/** a few invented customers for the customer search of `customer-brief` (`/board/prospect-list`, `/board/prospect`) */
const PROSPECTS = reference('aiHub.customers', [
  { id: 'p-1001', code: 'C-0001', name: 'บริษัท ตัวอย่างเทรดดิ้ง จำกัด', currentCityName: 'กรุงเทพมหานคร', salePersonName: 'ทีมขายกรุงเทพ' },
  { id: 'p-1002', code: 'C-0002', name: 'ห้างหุ้นส่วนสมมติ', currentCityName: 'เชียงใหม่', salePersonName: 'ทีมขายเหนือ' },
]);

export function prospectEndpoint(path: string, query: URLSearchParams): Json | undefined {
  if (path.endsWith('/board/prospect-list')) {
    const term = (query.get('searchText') ?? '').toLowerCase();
    return { result: { items: PROSPECTS.filter((p) => !term || p.name.toLowerCase().includes(term) || p.code.toLowerCase().includes(term)) } };
  }
  if (path.endsWith('/board/prospect')) {
    return { result: PROSPECTS.find((p) => p.id === query.get('id')) ?? PROSPECTS[0] };
  }
  return undefined;
}
