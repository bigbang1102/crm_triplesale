/**
 * Deterministic in-memory org + usage dataset of the token Admin mock (framework-free).
 * Token numbers only — there is no money anywhere. The same inputs always give the same rows.
 */

export interface MockEmployee {
  id: string;
  name: string;
  username: string;
}

export interface MockDepartment {
  code: string;
  name: string;
  employees: MockEmployee[];
}

export interface MockCompany {
  code: string;
  name: string;
  departments: MockDepartment[];
}

export const NO_DEPARTMENT = { code: '-', name: 'ไม่ระบุฝ่าย/แผนก' };

export const MOCK_ORG: readonly MockCompany[] = [
  {
    code: 'A1',
    name: 'ไพรม์ ออโต้ อิมพอร์ต',
    departments: [
      {
        code: 'A1-SALES',
        name: 'ฝ่ายขาย',
        employees: emps('A1', 'sales', [
          'สมชาย ใจดี',
          'สมหญิง รักงาน',
          'ประเสริฐ มั่นคง',
          'วิไล สุขสม',
        ]),
      },
      {
        code: 'A1-MKT',
        name: 'ฝ่ายการตลาด',
        employees: emps('A1', 'mkt', ['กมล ศรีสุข', 'นภา แสงทอง', 'ธนา เจริญผล']),
      },
      {
        code: 'A1-IT',
        name: 'ฝ่ายไอที',
        employees: emps('A1', 'it', ['อนุชา พัฒนา', 'พิมพ์ใจ ดีเลิศ', 'ชัยวัฒน์ คงเดช']),
      },
    ],
  },
  {
    code: 'B2',
    name: 'บีทู ลีสซิ่ง',
    departments: [
      {
        code: 'B2-CRD',
        name: 'ฝ่ายสินเชื่อ',
        employees: emps('B2', 'crd', [
          'รัตนา ทองดี',
          'วิชัย เพ็ชรงาม',
          'สุดา บุญมา',
          'ปรีชา สว่างจิต',
        ]),
      },
      {
        code: 'B2-OPS',
        name: 'ฝ่ายปฏิบัติการ',
        employees: emps('B2', 'ops', ['มานะ อดทน', 'จินตนา ใจงาม', 'เอกชัย ยอดเยี่ยม']),
      },
    ],
  },
];

function emps(company: string, tag: string, names: string[]): MockEmployee[] {
  return names.map((name, i) => ({
    id: `${company}-E${tag}${i + 1}`,
    name,
    username: `${company.toLowerCase()}.${tag}${i + 1}`,
  }));
}

export const MOCK_TOOLS = [
  {
    toolId: 'doc-analyze',
    title: 'วิเคราะห์เอกสาร',
    group: 'document',
    groupTitle: 'Document AI',
    task: 'สัญญาเช่าซื้อรถยนต์.pdf',
  },
  {
    toolId: 'doc-summary',
    title: 'สรุปเอกสาร',
    group: 'document',
    groupTitle: 'Document AI',
    task: 'รายงานประชุมประจำเดือน.docx',
  },
  {
    toolId: 'image',
    title: 'สร้างภาพ',
    group: 'content',
    groupTitle: 'Content Creation',
    task: 'ภาพโปรโมชันปีใหม่',
  },
  {
    toolId: 'article',
    title: 'เขียนบทความ',
    group: 'content',
    groupTitle: 'Content Creation',
    task: 'บทความแนะนำสินเชื่อรถ',
  },
  {
    toolId: 'code-review',
    title: 'ตรวจโค้ด',
    group: 'developer',
    groupTitle: 'Developer AI',
    task: 'ProspectService.java',
  },
  {
    toolId: 'strategy',
    title: 'วางกลยุทธ์',
    group: 'knowledge',
    groupTitle: 'Knowledge & Strategy',
    task: 'แผนขายไตรมาสหน้า',
  },
] as const;

export const MOCK_MODELS = [
  { modelKey: 'sonnet', modelId: 'us.anthropic.claude-sonnet-5-5', label: 'Claude Sonnet 5.5' },
  { modelKey: 'haiku', modelId: 'us.anthropic.claude-haiku-4-5', label: 'Claude Haiku 4.5' },
  { modelKey: 'opus', modelId: 'us.anthropic.claude-opus-4-5', label: 'Claude Opus 4.5' },
] as const;

/** one AI job of one employee */
export interface MockUsage {
  /** `yyyy-MM-dd` (Thai calendar day) */
  date: string;
  /** `HH:mm:ss` */
  time: string;
  employeeId: string;
  toolIndex: number;
  modelIndex: number;
  inputTokens: number;
  outputTokens: number;
}

const DAY_MS = 86_400_000;
const HISTORY_DAYS = 190;

/** small deterministic hash → 0..1 (no Math.random: the same dataset on every run) */
export function unit(seed: string): number {
  let h = 2166136261;
  for (let i = 0; i < seed.length; i += 1) {
    h = Math.imul(h ^ seed.charCodeAt(i), 16777619);
  }
  return ((h >>> 0) % 10_000) / 10_000;
}

function isoDay(ms: number): string {
  return new Date(ms).toISOString().slice(0, 10);
}

/** the usage of every employee over the last ~6 months up to `today` (`yyyy-MM-dd`) */
export function buildUsage(today: string): MockUsage[] {
  const end = Date.parse(`${today}T00:00:00Z`);
  const rows: MockUsage[] = [];
  const everyone = MOCK_ORG.flatMap((c) => c.departments.flatMap((d) => d.employees));
  everyone.forEach((emp, empIndex) => {
    const appetite = 0.35 + unit(`app-${emp.id}`) * 1.4;
    for (let back = 0; back < HISTORY_DAYS; back += 1) {
      const date = isoDay(end - back * DAY_MS);
      const weekday = new Date(`${date}T00:00:00Z`).getUTCDay();
      if (weekday === 0 || weekday === 6) continue;
      const jobs = Math.floor(unit(`jobs-${emp.id}-${date}`) * 3 * appetite);
      for (let j = 0; j < jobs; j += 1) rows.push(oneJob(emp.id, empIndex, date, j));
    }
  });
  return rows;
}

function oneJob(employeeId: string, empIndex: number, date: string, n: number): MockUsage {
  const seed = `${employeeId}-${date}-${n}`;
  const input = 1_500 + Math.floor(unit(`in-${seed}`) * 24_000);
  const output = 600 + Math.floor(unit(`out-${seed}`) * 9_000);
  const hh = 8 + Math.floor(unit(`h-${seed}`) * 10);
  const mm = Math.floor(unit(`m-${seed}`) * 60);
  return {
    date,
    time: `${String(hh).padStart(2, '0')}:${String(mm).padStart(2, '0')}:00`,
    employeeId,
    toolIndex: Math.floor(unit(`t-${seed}`) * MOCK_TOOLS.length),
    modelIndex: Math.floor(unit(`mo-${seed}`) * (empIndex % 4 === 0 ? 3 : 2)),
    inputTokens: input,
    outputTokens: output,
  };
}
