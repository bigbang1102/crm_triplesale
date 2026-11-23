import { currentCompany } from '@core/mock/company-scope';
import { reference, msg } from '@core/mock/reference';
import type {
  AdjustmentsRequest,
  AdjustmentsResponse,
  CategoryAmounts,
  ConfigAction,
  ConfigDetail,
  ConfigFields,
  ConfigStatus,
  ConfigStatusRequest,
  ConfigStatusResponse,
  ConfigWrite,
  ConfigsQuery,
  ConfigsResponse,
  CreateConfigRequest,
  CreateConfigResponse,
  DashboardQuery,
  DashboardResponse,
  ForecastCategory,
  ForecastConfig,
  ForecastPeriod,
  HistoryQuery,
  HistoryResponse,
  HistoryType,
  Lookups,
  LookupsQuery,
  OpportunitiesQuery,
  OpportunitiesResponse,
  PeriodStatusRequest,
  PeriodStatusResponse,
  PeriodsResponse,
  SaveWorkspaceRequest,
  SaveWorkspaceResponse,
  SummaryNumbers,
  SummaryRequest,
  SummaryResponse,
  TargetWrite,
  TargetsQuery,
  TargetsResponse,
  TeamTargetWrite,
} from './forecast.types';

/**
 * "Server" จำลองของ Sales Forecast — ตอบ 14 endpoint ของ forecast.types.ts จากข้อมูลชุดเดียวกับต้นแบบ
 * (TripleSales_Forecast_Prototype_v19.html : `seed()` + ฟังก์ชันคำนวณ `eff / val / empCalc / catTotals / scen …` ย้ายมาบรรทัดต่อบรรทัด).
 * ForecastBackend ใช้ไฟล์นี้เมื่อเรียก API จริงไม่สำเร็จ. เก็บสถานะในหน่วยความจำ (บันทึกแล้วเห็นผลจนกว่าจะโหลดหน้าใหม่) เหมือนต้นแบบ.
 *
 * framework-free และใช้ไวยากรณ์ที่ลบ type ออกได้ตรง ๆ (ไม่มี enum / parameter property) — รันใน Node ผ่าน vitest / esbuild ได้ (ขอรายการอ้างอิงจาก `@core/mock/reference` = Datasource `ref.forecast.json`).
 * สิ่งที่ต้นแบบมีบนแถบบน (บริษัท · บทบาทจำลอง) = `session` ของ server จำลองนี้ : API จริงรู้จาก token ของผู้ใช้.
 */

export type MockRole = 'config' | 'exec' | 'manager' | 'sales';

export const MOCK_ROLES: Record<MockRole, string> = reference('forecast.roles', {
  config: 'System Configurator',
  exec: 'Executive',
  manager: 'Sales Manager (Team A)',
  sales: 'Salesperson (สมชาย)',
});
const BASE_COMPANIES: readonly (readonly [string, string])[] = reference('forecast.companies', [
  ['SUN', 'SUN GATEWAY'],
  ['GGW', 'GGW'],
]);
/** the companies of the sample data: the two of the prototype and ACE (a company the user can sign in to: its figures are its own) */
export const MOCK_COMPANIES: readonly (readonly [string, string])[] = BASE_COMPANIES.some(([code]) => code === 'ACE') ? BASE_COMPANIES : [...BASE_COMPANIES, ['ACE', 'ACE CLOUD']];
/** งวดปัจจุบันของข้อมูลจำลอง (`CUR` ของต้นแบบ) */
export const MOCK_CURRENT_MONTH = reference('forecast.currentMonth', '2026-11');

/** ความผิดพลาดตามกติกาที่ server จริงจะตอบ (409 / 422 / 423 / 403 / 404) — `message` แสดงให้ผู้ใช้ได้เลย */
export class ForecastMockError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.name = 'ForecastMockError';
    this.status = status;
  }
}

// ───────────────────────── ข้อมูล (ต้นแบบ : Mock data) ─────────────────────────

const CATS: readonly (readonly [ForecastCategory, string])[] = reference('forecast.categories', [
  ['committed', 'Committed'],
  ['bestcase', 'Best Case'],
  ['pipeline', 'Pipeline'],
  ['closed', 'Closed'],
  ['omitted', 'Omitted'],
]);
const CAT_LABEL = Object.fromEntries(CATS) as Record<ForecastCategory, string>;
const MONTHS: string[] = [];
for (let y = 2026; y <= 2027; y++) for (let m = 1; m <= 12; m++) MONTHS.push(`${y}-${String(m).padStart(2, '0')}`);
const CUR = MOCK_CURRENT_MONTH;
const PIPES = reference('forecast.pipelines', [
  { id: 'P1', name: 'ขายโครงการ' },
  { id: 'P2', name: 'ขายปลีก' },
] as const);
const pipeName = (id: string): string => PIPES.find((p) => p.id === id)?.name ?? id;
const STEP_MAPPING: readonly (readonly [string, number, ForecastCategory])[] = reference('forecast.stepMapping', [
  ['เริ่มติดต่อ', 20, 'pipeline'],
  ['ประเมินความต้องการ', 40, 'pipeline'],
  ['ส่งข้อเสนอ', 60, 'bestcase'],
  ['เจรจาเสนอราคา', 80, 'committed'],
  ['ตกลงซื้อ', 100, 'closed'],
  ['ไม่สนใจ', 0, 'omitted'],
]);
/** ชื่อฟิลด์ในข้อความประวัติ (`CFG_FIELDS` ของต้นแบบ) */
const CFG_FIELDS: Record<keyof ConfigFields, string> = reference('forecast.configFields', {
  code: 'รหัส',
  name: 'ชื่อ',
  year: 'ปีงบประมาณ',
  periodType: 'รอบ Forecast',
  hierarchyType: 'โครงสร้างรวมยอด',
  openFormula: 'สูตร',
  overdueRule: 'OPP เลยกำหนด',
  allowJudgment: 'Opportunity Judgment',
  allowCategoryOverride: 'ย้ายหมวด',
  allowManagerAdjustment: 'Manager Adjustment',
});
const CFG_KEYS = Object.keys(CFG_FIELDS) as (keyof ConfigFields)[];
const STATUS_LABEL: Record<ConfigStatus, string> = reference('forecast.statusLabels', { draft: 'Draft', release: 'Release', block: 'Block' });

interface Emp {
  id: string;
  name: string;
  team: string;
}
interface Deal {
  id: string;
  name: string;
  owner: string;
  cat: ForecastCategory;
  prob: number;
  amount: number;
  month: string;
  status: 'open' | 'won' | 'lost';
  stage: string;
  closedMonth: string | null;
  pipe: string;
}
interface Judg {
  in: boolean;
  prob: number;
  amount: number;
  cat: ForecastCategory;
  reason: string;
}
interface Adj {
  delta: number;
  reason: string;
}
interface Layer {
  judg: Record<string, Judg>;
  adj: Record<string, Adj>;
}
type LayerName = 'sys' | 'saved' | 'draft';
interface MockPeriod {
  status: 'open' | 'closed';
  by?: string;
  at?: string;
  snap?: { final: number };
}
interface MockVersion {
  v: number;
  at: string;
  by: string;
  /** key ของฟิลด์ (หรือข้อความเดิมของต้นแบบ) ; ว่าง = Release ครั้งแรก */
  fields: string[];
}
interface MockConfig extends ConfigFields {
  id: string;
  status: ConfigStatus;
  versionNo: number;
  everReleased: boolean;
  updatedAt: string | null;
  updatedBy: string | null;
  rowVersion: number;
  versions: MockVersion[];
}
interface Hist {
  at: string;
  by: string;
  type: 'config' | 'target' | 'judgment' | 'adjust' | 'period';
  obj: string;
  old: string;
  nw: string;
  reason: string;
}
interface Db {
  emps: Emp[];
  teams: Record<string, { name: string; mgr: string }>;
  deals: Deal[];
  targets: Record<string, number>;
  teamTargets: Record<string, number>;
  saved: Layer;
  periods: Record<string, MockPeriod>;
  configs: MockConfig[];
  history: Hist[];
}
/** Config ของปีที่ยังไม่มี Release / Block (`DEFCFG` ของต้นแบบ) */
interface EffConfig {
  id: string | null;
  code: string;
  status: ConfigStatus | 'none';
  openFormula: 'weighted' | 'full';
  overdueRule: 'separate' | 'current' | 'exclude';
  allowJudgment: boolean;
  allowCategoryOverride: boolean;
  allowManagerAdjustment: boolean;
}
const DEFCFG: EffConfig = reference('forecast.defaultConfig', {
  id: null,
  code: '-',
  status: 'none',
  openFormula: 'weighted',
  overdueRule: 'separate',
  allowJudgment: false,
  allowCategoryOverride: false,
  allowManagerAdjustment: false,
} as EffConfig);
const NEW_CFG: Omit<ConfigFields, 'code' | 'name' | 'year'> = reference('forecast.newConfig', {
  periodType: 'monthly',
  hierarchyType: 'orgchart',
  openFormula: 'weighted',
  overdueRule: 'separate',
  allowJudgment: true,
  allowCategoryOverride: true,
  allowManagerAdjustment: true,
});

const clone = <T>(o: T): T => JSON.parse(JSON.stringify(o)) as T;
const B = (n: number | string | null | undefined): string => Number(n || 0).toLocaleString('en-US', { maximumFractionDigits: 0 });
function sgn(v: number): string {
  const n = Math.round(v);
  return (n > 0 ? '+' : n < 0 ? '−' : '±') + B(Math.abs(n));
}
/** `พ.ย. 69` — ป้ายงวดในข้อความประวัติ (ข้อมูลของ server จำลองเป็นภาษาไทยเหมือนต้นแบบ) */
function mName(m: string): string {
  const [y, mm] = m.split('-').map(Number);
  return new Date(y, mm - 1, 1).toLocaleDateString('th-TH', { month: 'short', year: '2-digit' });
}
const z = (n: number): string => String(n).padStart(2, '0');
/** `dd/MM/yyyy HH:mm` ของต้นแบบ → ISO (API ส่งเวลาเป็น ISO ; หน้าจัดรูปกลับเป็น dd/MM/yyyy HH:mm) */
function iso(dmy: string): string {
  const [d, t] = dmy.split(' ');
  const [dd, mm, yy] = d.split('/');
  return `${yy}-${mm}-${dd}T${t}:00`;
}
function nowIso(): string {
  const d = new Date();
  return `${d.getFullYear()}-${z(d.getMonth() + 1)}-${z(d.getDate())}T${z(d.getHours())}:${z(d.getMinutes())}:00`;
}
const yearMonths = (y: number): string[] => Array.from({ length: 12 }, (_, i) => `${y}-${z(i + 1)}`);
const monthEnd = (m: string): string => {
  const [y, mm] = m.split('-').map(Number);
  return `${m}-${z(new Date(y, mm, 0).getDate())}`;
};

/** a company of the Seed Workbook has its own teams and people, so those maps are accepted whatever their keys */
const isPlainObject = (doc: unknown): boolean => typeof doc === 'object' && doc !== null && !Array.isArray(doc);

function seed(co: string, nextId: () => string): Db {
  const f = co === 'GGW' ? 0.45 : co === 'ACE' ? 0.6 : 1;
  const emps: Emp[] = reference('forecast.employees', [
    { id: 'E01', name: 'สมชาย ใจดี', team: 'A' },
    { id: 'E02', name: 'วิภา ทองดี', team: 'A' },
    { id: 'E03', name: 'อนันต์ กิตติ', team: 'B' },
    { id: 'E04', name: 'พิมพ์ชนก แก้วใจ', team: 'B' },
  ]);
  const teams = reference('forecast.teams', { A: { name: 'Team A', mgr: 'ผู้จัดการทีม A' }, B: { name: 'Team B', mgr: 'ผู้จัดการทีม B' } }, undefined, isPlainObject);
  const raw: [string, string, string, ForecastCategory, number, number, string, Deal['status'], string, string?][] = reference('forecast.deals', [
    ['OPP-001', 'บริษัท อัลฟา จำกัด', 'E01', 'committed', 80, 1250000, '2026-11', 'open', 'เจรจาเสนอราคา'],
    ['OPP-002', 'บริษัท เบต้า จำกัด', 'E01', 'pipeline', 40, 700000, '2026-11', 'open', 'ประเมินความต้องการ'],
    ['OPP-003', 'บริษัท แกมม่า จำกัด', 'E02', 'bestcase', 60, 950000, '2026-11', 'open', 'ส่งข้อเสนอ'],
    ['OPP-004', 'บริษัท เดลต้า จำกัด', 'E02', 'closed', 100, 550000, '2026-11', 'won', 'ตกลงซื้อ'],
    ['OPP-005', 'บริษัท เอปซิลอน จำกัด', 'E04', 'committed', 80, 1000000, '2026-11', 'open', 'เจรจาเสนอราคา'],
    ['OPP-006', 'บริษัท ซีต้า จำกัด', 'E04', 'omitted', 0, 300000, '2026-11', 'lost', 'ไม่สนใจ'],
    ['OPP-007', 'บริษัท อีต้า จำกัด', 'E03', 'pipeline', 20, 2000000, '2026-11', 'open', 'เริ่มติดต่อ'],
    ['OPP-008', 'บริษัท ทีต้า จำกัด', 'E03', 'committed', 80, 800000, '2026-11', 'open', 'เจรจาเสนอราคา'],
    ['OPP-009', 'บริษัท ไอโอต้า จำกัด', 'E02', 'bestcase', 60, 450000, '2026-12', 'open', 'ส่งข้อเสนอ'],
    ['OPP-010', 'บริษัท แคปปา จำกัด', 'E01', 'committed', 80, 900000, '2026-12', 'open', 'เจรจาเสนอราคา'],
    ['OPP-011', 'บริษัท แลมบ์ดา จำกัด', 'E03', 'pipeline', 40, 1200000, '2026-12', 'open', 'ประเมินความต้องการ'],
    ['OPP-012', 'บริษัท มิว จำกัด', 'E04', 'bestcase', 60, 650000, '2027-01', 'open', 'ส่งข้อเสนอ'],
    ['OPP-013', 'บริษัท นิว จำกัด', 'E04', 'committed', 80, 700000, '2027-02', 'open', 'เจรจาเสนอราคา'],
    ['OPP-014', 'บริษัท โอไมครอน จำกัด', 'E03', 'bestcase', 60, 600000, '2026-09', 'open', 'ส่งข้อเสนอ'],
    ['OPP-015', 'บริษัท ซิกม่า จำกัด', 'E01', 'closed', 100, 480000, '2026-10', 'won', 'ตกลงซื้อ', '2026-11'],
  ]);
  const deals: Deal[] = raw.map((r, i) => ({
    id: r[0],
    name: r[1],
    owner: r[2],
    cat: r[3],
    prob: r[4],
    amount: Math.round(r[5] * f),
    month: r[6],
    status: r[7],
    stage: r[8],
    closedMonth: r[9] || (r[7] !== 'open' ? r[6] : null),
    pipe: i % 2 ? 'P2' : 'P1',
  }));
  let n = 100;
  MONTHS.filter((m) => m < '2026-11').forEach((m, i) =>
    emps.forEach((e, j) => {
      const amt = Math.round(((900000 + ((i * 7 + j * 13) % 9) * 110000) * f) / 1000) * 1000;
      deals.push({
        id: 'OPP-' + n++,
        name: 'ลูกค้าเดิม ' + m.slice(5) + '-' + e.id,
        owner: e.id,
        cat: 'closed',
        prob: 100,
        amount: amt,
        month: m,
        closedMonth: m,
        status: 'won',
        stage: 'ตกลงซื้อ',
        pipe: j % 2 ? 'P2' : 'P1',
      });
      if ((i + j) % 3 === 0) {
        deals.push({
          id: 'OPP-' + n++,
          name: 'ลูกค้าเสีย ' + m.slice(5) + '-' + e.id,
          owner: e.id,
          cat: 'omitted',
          prob: 0,
          amount: Math.round(400000 * f),
          month: m,
          status: 'lost',
          stage: 'ไม่สนใจ',
          closedMonth: m,
          pipe: j % 2 ? 'P1' : 'P2',
        });
      }
    }),
  );
  const base: Record<string, number> = reference('forecast.monthlyTargets', { E01: 1500000, E02: 1400000, E03: 1300000, E04: 1500000 }, undefined, isPlainObject);
  const targets: Record<string, number> = {};
  MONTHS.forEach((m, i) =>
    emps.forEach((e) => {
      const t = base[e.id] * f * (1 + i * 0.012);
      if (e.id === 'E02') {
        targets[m + '|' + e.id + '|P2'] = Math.round(t / 1000) * 1000;
        return;
      }
      targets[m + '|' + e.id + '|P1'] = Math.round((t * 0.6) / 1000) * 1000;
      targets[m + '|' + e.id + '|P2'] = Math.round((t * 0.4) / 1000) * 1000;
    }),
  );
  const saved: Layer = { judg: {}, adj: {} };
  // what the managers have already saved (the amounts are for the company of the biggest figures: the other one scales them with `f`)
  const judgments = reference<Record<string, { in: boolean; prob: number; amount: number; cat: ForecastCategory; reason: string }>>('forecast.savedJudgments', {
    'OPP-002': { in: true, prob: 55, amount: 850000, cat: 'pipeline', reason: 'ลูกค้าเพิ่ม Scope' },
  });
  for (const [id, j] of Object.entries(judgments)) saved.judg[id] = { ...j, amount: Math.round(j.amount * f) };
  const adjustments = reference<Record<string, { delta: number; reason: string }>>('forecast.savedAdjustments', {
    '2026-11|E04|P1': { delta: 150000, reason: 'คาดว่าลูกค้าเพิ่มคำสั่งซื้อปลายเดือน' },
  });
  for (const [key, a] of Object.entries(adjustments)) saved.adj[key] = { ...a, delta: Math.round(a.delta * f) };
  const periods: Record<string, MockPeriod> = {};
  MONTHS.forEach((m) => {
    periods[m] =
      m < CUR
        ? {
            status: 'closed',
            by: 'System Configurator',
            at: iso(
              '01/' +
                String((Number(m.slice(5)) % 12) + 1).padStart(2, '0') +
                '/' +
                (m.slice(5) === '12' ? Number(m.slice(0, 4)) + 1 : m.slice(0, 4)) +
                ' 09:00',
            ),
          }
        : { status: 'open' };
  });
  const mk = (o: Partial<MockConfig> & Pick<MockConfig, 'code' | 'name' | 'year' | 'status' | 'versionNo'>): MockConfig => ({
    ...NEW_CFG,
    everReleased: false,
    updatedAt: null,
    updatedBy: null,
    rowVersion: 1,
    versions: [],
    ...o,
    id: nextId(),
  });
  const SC = 'System Configurator';
  interface ConfigRow {
    code: string;
    name: string;
    year: number;
    status: ConfigStatus;
    versionNo: number;
    everReleased: boolean;
    updatedAt: string;
    updatedBy: string;
    overdueRule?: ConfigFields['overdueRule'];
    versions: { v: number; at: string; by: string; fields: string[] }[];
  }
  // dates are `dd/MM/yyyy HH:mm` text (as the prototype writes them)
  const configRows = reference<ConfigRow[]>('forecast.configs', [
    {
      code: 'FC-2025', name: 'Sales Forecast ปี 2025', year: 2025, status: 'block', versionNo: 2, everReleased: true, updatedAt: '05/01/2026 10:00', updatedBy: SC,
      versions: [
        { v: 1, at: '02/01/2025 09:00', by: SC, fields: [] },
        { v: 2, at: '15/06/2025 14:20', by: SC, fields: ['openFormula'] },
      ],
    },
    {
      code: 'FC-2026', name: 'Sales Forecast ปี 2026', year: 2026, overdueRule: 'current', status: 'release', versionNo: 3, everReleased: true, updatedAt: '28/10/2026 11:05', updatedBy: SC,
      versions: [
        { v: 1, at: '05/01/2026 10:00', by: SC, fields: [] },
        { v: 2, at: '12/03/2026 15:30', by: SC, fields: ['Pipeline'] },
        { v: 3, at: '28/10/2026 11:05', by: SC, fields: ['allowJudgment'] },
      ],
    },
    { code: 'FC-2027', name: 'Sales Forecast ปี 2027', year: 2027, status: 'draft', versionNo: 1, everReleased: false, updatedAt: '09/11/2026 16:00', updatedBy: SC, versions: [] },
  ]);
  const configs: MockConfig[] = configRows.map(({ updatedAt, versions, ...row }) => mk({ ...row, updatedAt: iso(updatedAt), versions: versions.map((v) => ({ ...v, at: iso(v.at) })) }));
  // the amounts of the sample history are written as {baseAmount} and scaled like the deals of the company (`f`)
  const scaled = (text: string): string => text.replace(/\{(\d+)\}/g, (_m, n: string) => B(Math.round(Number(n) * f)));
  const history: Hist[] = reference<Hist[]>('forecast.history', [
    { at: '05/11/2026 10:12', by: 'Sales Manager (Team B)', type: 'adjust', obj: 'พิมพ์ชนก แก้วใจ · พ.ย. 69', old: '±0', nw: '+{150000}', reason: 'คาดว่าลูกค้าเพิ่มคำสั่งซื้อปลายเดือน' },
    { at: '04/11/2026 16:40', by: 'Sales Manager (Team A)', type: 'judgment', obj: 'OPP-002', old: '40% · {700000}', nw: '55% · {850000}', reason: 'ลูกค้าเพิ่ม Scope' },
    { at: '01/11/2026 09:00', by: 'System Configurator', type: 'period', obj: 'ต.ค. 69', old: 'เปิดอยู่', nw: 'ปิดแล้ว', reason: 'ปิดงวดประจำเดือน' },
    { at: '28/10/2026 11:05', by: 'System Configurator', type: 'config', obj: 'FC-2026', old: 'v2', nw: 'v3', reason: 'แก้ไข: Opportunity Judgment' },
  ]).map((h) => ({ ...h, at: iso(h.at), old: scaled(h.old), nw: scaled(h.nw) }));
  return { emps, teams, deals, targets, teamTargets: {}, saved, periods, configs, history };
}

// ───────────────────────── คำนวณ (ต้นแบบ : Calculation) ─────────────────────────

interface Calc {
  target: number;
  base: number;
  judged: number;
  jd: number;
  adj: number;
  final: number;
  won: number;
}

/** ฟังก์ชันคำนวณของต้นแบบ ผูกกับฐานข้อมูล · บทบาท · Pipeline ที่ขอ · ชั้นร่าง (`draft` = saved + ร่างที่ส่งมากับคำขอ) */
function engine(db: Db, role: MockRole, pipe: string, draft: Layer) {
  const layer = (l: LayerName): Layer | null => (l === 'sys' ? null : l === 'saved' ? db.saved : draft);
  const cfgFor = (m: string | null): EffConfig | MockConfig => {
    const y = Number(String(m).slice(0, 4));
    const cs = db.configs.filter((c) => c.year === y);
    return cs.find((c) => c.status === 'release') || cs.find((c) => c.status === 'block') || DEFCFG;
  };
  const visibleEmps = (): Emp[] => {
    if (role === 'manager') return db.emps.filter((e) => e.team === 'A');
    if (role === 'sales') return db.emps.filter((e) => e.id === db.emps[0]?.id);
    return db.emps;
  };
  const visibleTeams = (): string[] => [...new Set(visibleEmps().map((e) => e.team))];
  const periodOpen = (m: string): boolean => db.periods[m]?.status !== 'closed' && cfgFor(m).status !== 'block';
  const odRule = () => cfgFor(CUR).overdueRule || 'separate';
  const isOverdue = (d: Deal): boolean => d.status === 'open' && d.month < CUR;
  const dealMonth = (d: Deal): string | null => {
    if (d.status !== 'open') return d.closedMonth || d.month;
    if (d.month >= CUR) return d.month;
    return odRule() === 'exclude' ? null : CUR;
  };
  const eff = (d: Deal, l: LayerName): { in: boolean; prob: number; amount: number; cat: ForecastCategory } => {
    if (d.status === 'won') return { in: true, prob: 100, amount: d.amount, cat: 'closed' };
    if (d.status === 'lost') return { in: false, prob: 0, amount: d.amount, cat: 'omitted' };
    const j = layer(l)?.judg[d.id];
    return j ? { in: j.in, prob: j.prob, amount: j.amount, cat: j.cat } : { in: true, prob: d.prob, amount: d.amount, cat: d.cat };
  };
  const val = (d: Deal, l: LayerName): number => {
    const e = eff(d, l);
    if (d.status === 'lost' || !e.in) return 0;
    if (isOverdue(d) && odRule() === 'separate') return 0;
    if (d.status === 'won') return d.amount;
    return cfgFor(dealMonth(d)).openFormula === 'weighted' ? ((Number(e.amount) || 0) * (Number(e.prob) || 0)) / 100 : Number(e.amount) || 0;
  };
  const dealsIn = (month: string, empIds: string[], p = pipe): Deal[] =>
    db.deals.filter((d) => dealMonth(d) === month && empIds.includes(d.owner) && (p === 'all' || d.pipe === p));
  const tgtOf = (m: string, id: string, p = pipe): number =>
    p === 'all' ? PIPES.reduce((s, x) => s + (db.targets[m + '|' + id + '|' + x.id] || 0), 0) : db.targets[m + '|' + id + '|' + p] || 0;
  const empCalc = (id: string, l: LayerName, m: string): Calc => {
    const ds = dealsIn(m, [id]);
    const base = ds.reduce((s, d) => s + val(d, 'sys'), 0);
    const judged = l === 'sys' ? base : ds.reduce((s, d) => s + val(d, l), 0);
    const AJ = layer(l)?.adj || {};
    const adj =
      l === 'sys'
        ? 0
        : pipe === 'all'
          ? PIPES.reduce((s, p) => s + Number(AJ[m + '|' + id + '|' + p.id]?.delta || 0), 0)
          : Number(AJ[m + '|' + id + '|' + pipe]?.delta || 0);
    const won = ds.filter((d) => d.status === 'won').reduce((s, d) => s + d.amount, 0);
    return { target: tgtOf(m, id), base, judged, jd: judged - base, adj, final: judged + adj, won };
  };
  const sum = (ids: string[], l: LayerName, m: string): Calc => {
    const r: Calc = { target: 0, base: 0, judged: 0, jd: 0, adj: 0, final: 0, won: 0 };
    ids.forEach((id) => {
      const c = empCalc(id, l, m);
      r.target += c.target;
      r.base += c.base;
      r.judged += c.judged;
      r.adj += c.adj;
      r.final += c.final;
      r.won += c.won;
    });
    r.jd = r.judged - r.base;
    return r;
  };
  const teamIds = (t: string): string[] => visibleEmps().filter((e) => e.team === t).map((e) => e.id);
  const scopeIds = (team: string, emp: string): string[] => {
    let es = visibleEmps();
    if (team !== 'all') es = es.filter((e) => e.team === team);
    if (emp !== 'all') es = es.filter((e) => e.id === emp);
    return es.map((e) => e.id);
  };
  const catTotals = (l: LayerName, m: string, ids: string[]): CategoryAmounts => {
    const t: CategoryAmounts = { committed: 0, bestcase: 0, pipeline: 0, closed: 0, omitted: 0 };
    dealsIn(m, ids).forEach((d) => {
      const e = eff(d, l);
      if (d.status === 'lost' || !e.in) {
        t.omitted += d.amount;
        return;
      }
      t[e.cat] += val(d, l);
    });
    return t;
  };
  const scen = (l: LayerName, ms: string[], ids: string[]): { min: number; max: number } => {
    let min = 0;
    let max = 0;
    ms.forEach((m) =>
      dealsIn(m, ids).forEach((d) => {
        const e = eff(d, l);
        if (d.status === 'lost' || !e.in) return;
        const a = Number(e.amount) || 0;
        if (d.status === 'won' || e.cat === 'committed') {
          min += a;
          max += a;
        } else if (e.cat === 'bestcase') max += a;
      }),
    );
    return { min, max };
  };
  const openAmount = (l: LayerName, m: string, ids: string[]): number =>
    dealsIn(m, ids)
      .filter((d) => d.status === 'open' && eff(d, l).in)
      .reduce((s, d) => s + (Number(eff(d, l).amount) || 0), 0);
  return { cfgFor, visibleEmps, visibleTeams, periodOpen, odRule, isOverdue, eff, val, dealsIn, tgtOf, empCalc, sum, teamIds, scopeIds, catTotals, scen, openAmount };
}

// ───────────────────────── Server จำลอง ─────────────────────────

export class ForecastMock {
  private seq = 1;
  private readonly nextId = (): string => 'C' + this.seq++;
  private readonly dbs: Record<string, Db> = Object.fromEntries(
    // the two companies of the prototype share the ids of the configurations (what the specs of the prototype count on); any other company numbers its own — ids are looked up inside one company only
    MOCK_COMPANIES.map(([code]) => {
      if (code === 'SUN' || code === 'GGW') return [code, seed(code, this.nextId)];
      let own = 1;
      return [code, seed(code, () => 'C' + own++)];
    }),
  );
  private batch = 1;

  /** บริษัท + บทบาทของ "ผู้ใช้ที่ล็อกอิน" (ต้นแบบ : ตัวเลือกบนแถบบน) */
  session: { company: string; role: MockRole } = { company: MOCK_COMPANIES.some(([code]) => code === currentCompany()) ? currentCompany() : 'SUN', role: 'config' };

  private get db(): Db {
    return this.dbs[this.session.company];
  }
  private get actor(): string {
    return MOCK_ROLES[this.session.role];
  }
  private eng(pipe = 'all', draft?: Layer) {
    return engine(this.db, this.session.role, pipe, draft ?? this.db.saved);
  }
  private can(...roles: MockRole[]): boolean {
    return roles.includes(this.session.role);
  }
  private log(type: Hist['type'], obj: string, old: string, nw: string, reason: string): void {
    this.db.history.unshift({ at: nowIso(), by: this.actor, type, obj, old, nw, reason });
  }
  private cfg(id: string): MockConfig {
    const c = this.db.configs.find((x) => x.id === id);
    if (!c) throw new ForecastMockError(404, 'ไม่พบ Configuration');
    return c;
  }
  private period(periodId: string): { cfg: MockConfig; month: string } {
    const i = periodId.indexOf('-');
    const month = periodId.slice(i + 1);
    if (i < 1 || !/^\d{4}-\d{2}$/.test(month)) throw new ForecastMockError(404, 'ไม่พบงวด');
    return { cfg: this.cfg(periodId.slice(0, i)), month };
  }
  private actions(c: MockConfig): ConfigAction[] {
    const can = this.can('config');
    const st: ConfigAction[] = !can
      ? []
      : c.status === 'draft'
        ? ['release', ...(!c.everReleased ? (['delete'] as const) : [])]
        : c.status === 'release'
          ? ['block']
          : ['unblock'];
    return ['open', ...st, 'history', ...(can ? (['copy'] as const) : [])];
  }
  private view(c: MockConfig): ForecastConfig {
    const out = clone({ ...c, actions: this.actions(c) }) as ForecastConfig & { versions?: unknown };
    delete out.versions;
    return out;
  }
  private periodView(c: MockConfig, m: string, totals: boolean): ForecastPeriod {
    const db = this.db;
    const e = this.eng('all');
    const p = db.periods[m] || (db.periods[m] = { status: m < CUR ? 'closed' : 'open' });
    const out: ForecastPeriod = { periodId: `${c.id}-${m}`, periodNo: Number(m.slice(5)), start: `${m}-01`, end: monthEnd(m), status: p.status, rowVersion: 1 };
    if (!totals) return out;
    const fin = db.emps.reduce((s, x) => s + e.empCalc(x.id, 'saved', m).final, 0);
    const can = this.can('config', 'exec');
    const cf = e.cfgFor(m);
    return {
      ...out,
      target: db.emps.reduce((s, x) => s + e.tgtOf(m, x.id, 'all'), 0),
      finalNow: fin,
      snapshotFinal: p.status === 'closed' ? (p.snap?.final ?? fin) : null,
      closedAt: p.at ?? null,
      closedBy: p.by ?? null,
      canClose: can && cf.status === 'release' && p.status !== 'closed',
      canReopen: this.can('config') && cf.status === 'release' && p.status === 'closed',
    };
  }

  // EP-01
  lookups(_q: LookupsQuery = {}): Lookups {
    const db = this.db;
    const e = this.eng();
    return clone({
      fiscalYears: [2025, 2026, 2027, 2028].map((y) => ({ id: 'FY' + y, year: y, hasConfig: db.configs.some((c) => c.year === y) })),
      pipelines: PIPES.map((p) => ({ id: p.id, code: p.id, name: p.name })),
      teams: e.visibleTeams().map((t) => ({
        id: t,
        name: db.teams[t].name,
        manager: db.teams[t].mgr,
        employees: e.visibleEmps().filter((x) => x.team === t).map((x) => ({ id: x.id, name: x.name })),
      })),
      stepMapping: STEP_MAPPING.map(([step, probability, category]) => ({ step, probability, category })),
      company: { currency: 'THB', fiscalYearStart: 1 },
      permissions: {
        canConfig: this.can('config'),
        canTarget: this.can('config', 'exec'),
        canAdjust: this.can('config', 'exec', 'manager'),
        canClose: this.can('config', 'exec'),
        canReopen: this.can('config'),
      },
      currentMonth: CUR,
    });
  }

  // EP-02
  configs(q: ConfigsQuery = {}): ConfigsResponse {
    const items = this.db.configs
      .filter((c) => (q.year == null || c.year === Number(q.year)) && (!q.status || c.status === q.status))
      .sort((a, b) => b.year - a.year)
      .map((c) => this.view(c));
    return { items };
  }

  // EP-03
  config(id: string, include?: string): ConfigDetail {
    const c = this.cfg(id);
    const out: ConfigDetail = { config: this.view(c) };
    if (include?.split(',').includes('versions')) {
      out.versions = c.versions.map((v) => ({ versionNo: v.v, changedFields: [...v.fields], createdAt: v.at, createdBy: v.by }));
    }
    return out;
  }

  // EP-04
  createConfig(req: CreateConfigRequest): CreateConfigResponse {
    if (!this.can('config')) throw new ForecastMockError(403, 'เฉพาะ System Configurator');
    const db = this.db;
    const src = req.copyFromId ? this.cfg(req.copyFromId) : null;
    const w = req.config || {};
    const year = Number(w.year ?? String(w.fiscalYearId ?? '').replace(/\D/g, ''));
    const fields: ConfigFields = { ...NEW_CFG, ...(src ? pick(src) : {}), ...(strip(w) as Partial<ConfigFields>), code: String(w.code ?? '').trim(), name: String(w.name ?? '').trim(), year };
    if (!fields.code || !fields.name) throw new ForecastMockError(422, 'ต้องระบุรหัสและชื่อ');
    if (!year) throw new ForecastMockError(422, 'ต้องระบุปีงบประมาณ');
    if (db.configs.some((x) => x.code.toLowerCase() === fields.code.toLowerCase())) throw new ForecastMockError(422, 'รหัสนี้มีอยู่แล้ว');
    this.checkTargets(req.targets, req.teamTargets);
    const nc: MockConfig = { ...fields, id: this.nextId(), status: 'draft', versionNo: 1, everReleased: false, updatedAt: nowIso(), updatedBy: this.actor, rowVersion: 1, versions: [] };
    db.configs.push(nc);
    this.log('config', nc.code, '—', 'สร้าง Draft', src ? 'คัดลอกจาก ' + src.code : 'สร้างใหม่');
    this.writeTargets(nc, req.targets, req.teamTargets);
    return { config: this.view(nc), periods: yearMonths(nc.year).map((m) => this.periodView(nc, m, false)) };
  }

  // EP-05
  saveWorkspace(id: string, req: SaveWorkspaceRequest): SaveWorkspaceResponse {
    const db = this.db;
    const c = this.cfg(id);
    if (c.status === 'block') throw new ForecastMockError(423, 'Configuration ถูก Block แก้ไขไม่ได้');
    if (req.rowVersion !== c.rowVersion) throw new ForecastMockError(409, 'ข้อมูลถูกแก้ไขไปก่อนแล้ว กรุณาโหลดใหม่');
    const w = strip(req.config || {}) as Partial<ConfigFields>;
    if (req.config?.year != null) w.year = Number(req.config.year);
    const changed = CFG_KEYS.filter((k) => k in w && JSON.stringify(w[k]) !== JSON.stringify(c[k]));
    const hasTargets = !!(req.targets?.length || req.teamTargets?.length);
    if (changed.length) {
      if (!this.can('config')) throw new ForecastMockError(403, 'เฉพาะ System Configurator');
      const next = { ...c, ...w };
      if (!String(next.code).trim() || !String(next.name).trim()) throw new ForecastMockError(422, 'ต้องระบุรหัสและชื่อ');
      if (db.configs.some((x) => x.id !== c.id && x.code.toLowerCase() === String(next.code).trim().toLowerCase())) throw new ForecastMockError(422, 'รหัสนี้มีอยู่แล้ว');
      if (c.everReleased && changed.includes('year')) throw new ForecastMockError(422, 'เปลี่ยนปีไม่ได้เมื่อเคย Release');
    }
    if (hasTargets && !this.can('config', 'exec')) throw new ForecastMockError(403, 'ไม่มีสิทธิ์ตั้ง Target');
    this.checkTargets(req.targets, req.teamTargets);
    if (changed.length) {
      const note = 'แก้ไข: ' + changed.map((k) => CFG_FIELDS[k]).join(', ');
      Object.assign(c, w, { updatedAt: nowIso(), updatedBy: this.actor });
      if (c.status === 'release') {
        const old = c.versionNo;
        c.versionNo = old + 1;
        c.versions.push({ v: c.versionNo, at: nowIso(), by: this.actor, fields: changed });
        this.log('config', c.code, 'v' + old, 'v' + c.versionNo, note);
      } else {
        this.log('config', c.code, 'Draft', 'Draft', note);
      }
    }
    const saved = this.writeTargets(c, req.targets, req.teamTargets);
    c.rowVersion++;
    return { config: this.view(c), saved, commitBatchId: 'B' + this.batch++ };
  }

  // EP-06
  configStatus(id: string, req: ConfigStatusRequest): ConfigStatusResponse {
    if (!this.can('config')) throw new ForecastMockError(403, 'เฉพาะ System Configurator');
    const db = this.db;
    const c = this.cfg(id);
    const r = String(req.reason ?? '').trim();
    if (req.action === 'delete') {
      if (c.status !== 'draft' || c.everReleased) throw new ForecastMockError(422, 'ลบได้เฉพาะ Draft ที่ไม่เคย Release');
      db.configs = db.configs.filter((x) => x.id !== c.id);
      this.log('config', c.code, 'Draft', 'ลบ', 'ลบ Draft ที่ไม่เคย Release');
      return { config: this.view(c) };
    }
    const to: ConfigStatus = req.action === 'block' ? 'block' : 'release';
    const from: ConfigStatus = req.action === 'block' ? 'release' : req.action === 'unblock' ? 'block' : 'draft';
    if (c.status !== from) throw new ForecastMockError(422, 'เปลี่ยนสถานะไม่ได้จากสถานะปัจจุบัน');
    if (to === 'block' && !r) throw new ForecastMockError(422, 'ต้องระบุเหตุผล');
    if (to === 'release') {
      const other = db.configs.find((x) => x.id !== c.id && x.year === c.year && x.status === 'release');
      if (other) throw new ForecastMockError(409, 'ปี ' + (c.year + 543) + ' มี ' + other.code + ' Release อยู่แล้ว · Block รายการนั้นก่อน');
    }
    const old = c.status;
    c.status = to;
    c.updatedAt = nowIso();
    c.updatedBy = this.actor;
    if (to === 'release' && !c.everReleased) {
      c.everReleased = true;
      c.versions.push({ v: c.versionNo, at: nowIso(), by: this.actor, fields: [] });
    }
    c.rowVersion++;
    this.log('config', c.code, STATUS_LABEL[old], STATUS_LABEL[to], r || '-');
    return { config: this.view(c) };
  }

  // EP-07
  targets(id: string, q: TargetsQuery): TargetsResponse {
    const db = this.db;
    this.cfg(id); // 404 เมื่อไม่พบ
    const e = this.eng();
    const ms = (q.periodIds || []).map((p) => ({ periodId: p, month: this.period(p).month }));
    const emps = e.visibleEmps().filter((x) => !q.teamId || x.team === q.teamId);
    const teams = e.visibleTeams().filter((t) => !q.teamId || t === q.teamId);
    const key = (m: string, who: string, p = q.pipelineId) => m + '|' + who + '|' + p;
    return clone({
      rows: emps.map((x) => ({
        employeeId: x.id,
        teamId: x.team,
        cells: Object.fromEntries(ms.map((m) => [m.periodId, db.targets[key(m.month, x.id)] ?? null])),
      })),
      teamRows: teams.map((t) => ({
        teamId: t,
        cells: Object.fromEntries(
          ms.map((m) => [
            m.periodId,
            {
              amount: db.teamTargets[key(m.month, t)] ?? null,
              sumOfMembers: e.visibleEmps().filter((x) => x.team === t).reduce((s, x) => s + (db.targets[key(m.month, x.id)] ?? 0), 0),
            },
          ]),
        ),
      })),
      pipelineSummary: PIPES.map((p) => ({
        pipelineId: p.id,
        employeesWithTarget: e.visibleEmps().filter((x) => ms.some((m) => db.targets[key(m.month, x.id, p.id)] != null)).length,
      })),
      periods: ms.map((m) => ({ periodId: m.periodId, status: db.periods[m.month]?.status === 'closed' ? ('closed' as const) : ('open' as const) })),
    });
  }

  // EP-08
  summary(req: SummaryRequest): SummaryResponse {
    const { month } = this.period(req.periodId);
    return this.summaryOf(month, req);
  }

  private summaryOf(month: string, req: Omit<SummaryRequest, 'periodId'>): SummaryResponse {
    const db = this.db;
    const pipe = req.pipelineId || 'all';
    const draft = req.draft ? this.overlay(month, req.draft.judgments, req.draft.adjustments) : null;
    const e = this.eng(pipe, draft ?? db.saved);
    const after: LayerName = draft ? 'draft' : 'saved';
    const team = req.teamId || 'all';
    const ids = e.scopeIds(team, req.employeeId || 'all');
    const b = e.sum(ids, 'sys', month);
    const a = e.sum(ids, after, month);
    const cb = e.catTotals('sys', month, ids);
    const ca = e.catTotals(after, month, ids);
    const sc = e.scen(after, [month], ids);
    const numbers = (c: Calc, cats: CategoryAmounts): SummaryNumbers => ({
      target: c.target,
      base: c.base,
      judged: c.judged,
      judgmentDelta: c.jd,
      managerDelta: c.adj,
      final: c.final,
      gap: c.final - c.target,
      closed: c.won,
      categories: cats,
    });
    const AJ = (draft ?? db.saved).adj;
    const teams = (team === 'all' ? e.visibleTeams() : [team]).map((t) => {
      const tids = e.teamIds(t);
      return {
        teamId: t,
        name: db.teams[t].name,
        manager: db.teams[t].mgr,
        ...numbers(e.sum(tids, after, month), e.catTotals(after, month, tids)),
        employees: tids.map((id) => ({
          employeeId: id,
          name: db.emps.find((x) => x.id === id)!.name,
          ...numbers(e.empCalc(id, after, month), e.catTotals(after, month, [id])),
          adjustment: pipe === 'all' ? null : (AJ[month + '|' + id + '|' + pipe] ?? null),
        })),
      };
    });
    const warnings: string[] = [];
    if (Math.round(a.final) < Math.round(a.won)) warnings.push('Final ต่ำกว่ายอดปิดแล้ว');
    return clone({
      totals: {
        target: a.target,
        base: b.base,
        judgmentDelta: a.judged - a.base,
        managerDelta: a.adj,
        final: a.final,
        closed: a.won,
        open: e.openAmount(after, month, ids),
        gap: a.final - a.target,
        coverage: a.target ? (a.final / a.target) * 100 : 0,
      },
      scenario: { min: sc.min, expected: a.final, max: sc.max },
      categories: CATS.map(([k]) => ({ category: k, before: cb[k], after: ca[k] })),
      teams,
      warnings,
      configStatus: e.cfgFor(month).status,
    });
  }

  /** saved + ร่างของคำขอ (judgment ราย OPP · Δ รายพนักงานต่อ Pipeline ของงวดนั้น) */
  private overlay(month: string, judgments: AdjustmentsRequest['judgments'], adjustments: AdjustmentsRequest['adjustments']): Layer {
    const out = clone(this.db.saved);
    for (const j of judgments || []) {
      if ('reset' in j) delete out.judg[j.opportunityId];
      else out.judg[j.opportunityId] = { in: j.in, prob: j.probability, amount: j.amount, cat: j.category, reason: j.reason };
    }
    for (const a of adjustments || []) {
      const k = month + '|' + a.employeeId + '|' + a.pipelineId;
      if ('reset' in a) delete out.adj[k];
      else out.adj[k] = { delta: a.delta, reason: a.reason };
    }
    return out;
  }

  // EP-09
  opportunities(q: OpportunitiesQuery): OpportunitiesResponse {
    const db = this.db;
    const { month } = this.period(q.periodId);
    const e = this.eng(q.pipelineId || 'all');
    const canJudge = this.can('config', 'exec', 'manager') && e.cfgFor(month).allowJudgment && e.periodOpen(month);
    const items = e.dealsIn(month, e.scopeIds(q.teamId || 'all', q.employeeId || 'all')).map((d) => {
      const o = db.emps.find((x) => x.id === d.owner)!;
      const j = db.saved.judg[d.id];
      return {
        id: d.id,
        txno: d.id,
        customer: d.name,
        owner: { id: o.id, name: o.name, teamId: o.team, teamName: db.teams[o.team].name },
        pipeline: { id: d.pipe, name: pipeName(d.pipe) },
        stage: d.stage,
        status: d.status,
        original: { amount: d.amount, probability: d.prob, category: d.cat },
        judgment: j && d.status === 'open' ? { in: j.in, probability: j.prob, amount: j.amount, category: j.cat, reason: j.reason, rowVersion: 1 } : null,
        valueBefore: e.val(d, 'sys'),
        valueAfter: e.val(d, 'saved'),
        overdue: e.isOverdue(d) ? { targetMonth: d.month, rule: e.odRule() } : null,
        changedSinceJudgment: null,
        editable: d.status === 'open' && canJudge,
      };
    });
    return clone({ items, total: items.length });
  }

  // EP-10
  saveAdjustments(req: AdjustmentsRequest): AdjustmentsResponse {
    const db = this.db;
    const { month } = this.period(req.periodId);
    const e = this.eng();
    const cf = e.cfgFor(month);
    if (cf.status !== 'release') throw new ForecastMockError(423, 'Configuration ของปีนี้ไม่ใช่ Release');
    if (db.periods[month]?.status === 'closed') throw new ForecastMockError(423, 'งวด ' + mName(month) + ' ปิดแล้ว ไม่สามารถปรับได้');
    if (!this.can('config', 'exec', 'manager')) throw new ForecastMockError(403, 'ไม่มีสิทธิ์ปรับ Forecast');
    const visible = e.visibleEmps().map((x) => x.id);
    const errs: string[] = [];
    for (const j of req.judgments || []) {
      const d = db.deals.find((x) => x.id === j.opportunityId);
      if (!d || d.status !== 'open') errs.push(j.opportunityId + ': ปรับไม่ได้');
      else if (!('reset' in j)) {
        if (!(j.probability >= 0 && j.probability <= 100)) errs.push(j.opportunityId + ': Probability ต้องอยู่ระหว่าง 0–100');
        if (!(j.amount >= 0)) errs.push(j.opportunityId + ': Amount ต้องไม่ติดลบ');
        if (!String(j.reason || '').trim()) errs.push(j.opportunityId + ': ต้องระบุเหตุผล');
      }
    }
    for (const a of req.adjustments || []) {
      if (!visible.includes(a.employeeId)) throw new ForecastMockError(403, 'ปรับพนักงานนอกทีมไม่ได้');
      if (!('reset' in a) && a.delta && !String(a.reason || '').trim()) errs.push(this.adjLabel(month, a.employeeId, a.pipelineId) + ': ต้องระบุเหตุผลการปรับ');
    }
    if (errs.length) throw new ForecastMockError(422, errs.join(' · '));
    const descJ = (x: Judg | undefined, d: Deal): string =>
      x ? `${x.in ? 'IN' : 'OUT'} · ${x.prob}% · ${B(x.amount)} · ${CAT_LABEL[x.cat]}` : msg('IN · {0}% · {1} · {2} (ค่าเดิม)', d.prob, B(d.amount), CAT_LABEL[d.cat]);
    for (const j of req.judgments || []) {
      const d = db.deals.find((x) => x.id === j.opportunityId)!;
      const old = db.saved.judg[d.id];
      const nw: Judg | undefined = 'reset' in j ? undefined : { in: j.in, prob: j.probability, amount: j.amount, cat: j.category, reason: j.reason };
      this.log('judgment', d.id, descJ(old, d), descJ(nw, d), nw?.reason || 'คืนค่าเดิม');
      if (nw) db.saved.judg[d.id] = nw;
      else delete db.saved.judg[d.id];
    }
    for (const a of req.adjustments || []) {
      const k = month + '|' + a.employeeId + '|' + a.pipelineId;
      const old = db.saved.adj[k];
      const nw: Adj | undefined = 'reset' in a ? undefined : { delta: a.delta, reason: a.reason };
      this.log('adjust', this.adjLabel(month, a.employeeId, a.pipelineId), sgn(old?.delta || 0), sgn(nw?.delta || 0), nw?.reason || 'ลบการปรับ');
      if (nw) db.saved.adj[k] = nw;
      else delete db.saved.adj[k];
    }
    return { saved: (req.judgments?.length || 0) + (req.adjustments?.length || 0), commitBatchId: 'B' + this.batch++ };
  }

  private adjLabel(month: string, empId: string, pipe: string): string {
    return (this.db.emps.find((x) => x.id === empId)?.name ?? empId) + ' · ' + mName(month) + (pipe ? ' · ' + pipeName(pipe) : '');
  }

  // EP-11
  periods(id: string, includeTotals = false): PeriodsResponse {
    const c = this.cfg(id);
    return clone({ items: yearMonths(c.year).map((m) => this.periodView(c, m, includeTotals)) });
  }

  // EP-12
  periodStatus(periodId: string, req: PeriodStatusRequest): PeriodStatusResponse {
    const db = this.db;
    const { cfg, month } = this.period(periodId);
    const e = this.eng('all');
    const r = String(req.reason ?? '').trim();
    if (!r) throw new ForecastMockError(422, 'ต้องระบุเหตุผล');
    const p = db.periods[month] || (db.periods[month] = { status: month < CUR ? 'closed' : 'open' });
    if (req.action === 'reopen') {
      if (!this.can('config')) throw new ForecastMockError(403, 'เปิดงวดใหม่ได้เฉพาะ System Configurator');
      if (p.status !== 'closed') throw new ForecastMockError(409, 'งวดเปิดอยู่แล้ว');
      p.status = 'open';
      this.log('period', mName(month), 'ปิดแล้ว', 'เปิดอยู่', r);
    } else {
      if (!this.can('config', 'exec')) throw new ForecastMockError(403, 'ปิดงวดได้เฉพาะ System Configurator และ Executive');
      if (e.cfgFor(month).status !== 'release') throw new ForecastMockError(422, 'Configuration ไม่ใช่ Release');
      if (p.status === 'closed') throw new ForecastMockError(409, 'งวดปิดอยู่แล้ว');
      p.status = 'closed';
      p.by = this.actor;
      p.at = nowIso();
      p.snap = { final: db.emps.reduce((s, x) => s + e.empCalc(x.id, 'saved', month).final, 0) };
      this.log('period', mName(month), 'เปิดอยู่', 'ปิดแล้ว', r);
    }
    return { period: this.periodView(cfg, month, true) };
  }

  // EP-13
  dashboard(q: DashboardQuery): DashboardResponse {
    const db = this.db;
    const e = this.eng(q.pipelineId || 'all');
    const y = Number(q.year);
    const all = yearMonths(y);
    const ms = q.level === 'year' ? all : q.level === 'quarter' ? all.slice((Number(q.quarter) - 1) * 3, Number(q.quarter) * 3) : [`${y}-${z(Number(q.month))}`];
    let axis = ms;
    if (q.level === 'month') {
      const qq = Math.floor((Number(q.month) - 1) / 3);
      axis = Array.from({ length: 3 }, (_, i) => `${y}-${z(qq * 3 + i + 1)}`);
    }
    const team = q.teamId || 'all';
    const ids = e.scopeIds(team, 'all');
    const ct: CategoryAmounts = { committed: 0, bestcase: 0, pipeline: 0, closed: 0, omitted: 0 };
    const sc: Calc = { target: 0, base: 0, judged: 0, jd: 0, adj: 0, final: 0, won: 0 };
    ms.forEach((m) => {
      const c = e.catTotals('saved', m, ids);
      for (const [k] of CATS) ct[k] += c[k];
      const s = e.sum(ids, 'saved', m);
      sc.target += s.target;
      sc.base += s.base;
      sc.judged += s.judged;
      sc.adj += s.adj;
      sc.final += s.final;
      sc.won += s.won;
    });
    const open: ForecastCategory[] = ['committed', 'bestcase', 'pipeline', 'closed'];
    const total = open.reduce((s, k) => s + ct[k], 0) || 1;
    const scen = e.scen('saved', ms, ids);
    return clone({
      outlook: axis.map((m) => {
        const c = e.sum(ids, 'saved', m);
        return { month: m, target: c.target, final: c.final, closed: c.won, inRange: ms.includes(m) };
      }),
      teams: (team === 'all' ? e.visibleTeams() : [team]).map((t) => {
        const r = { team: t, name: db.teams[t].name, target: 0, final: 0 };
        ms.forEach((m) => {
          const c = e.sum(e.teamIds(t), 'saved', m);
          r.final += c.final;
          r.target += c.target;
        });
        return r;
      }),
      health: CATS.map(([k]) => ({ category: k, amount: ct[k], share: k === 'omitted' ? 0 : ct[k] / total })),
      bridge: { base: sc.base, judgment: sc.judged - sc.base, manager: sc.adj, final: sc.final },
      scenario: { min: scen.min, expected: sc.final, max: scen.max },
    });
  }

  // EP-14
  history(q: HistoryQuery = {}): HistoryResponse {
    const type = (t: Hist['type']): HistoryType => (t === 'adjust' ? 'adjustment' : t);
    const items = this.db.history
      .filter((h) => !q.type || type(h.type) === q.type)
      .map((h) => ({ at: h.at, actor: h.by, type: type(h.type), label: h.obj, oldValue: h.old, newValue: h.nw, reason: h.reason }));
    return clone({ items, total: items.length });
  }

  // ---- Target (ใช้ร่วมกันของ EP-04 / EP-05) ----

  private monthOf(c: MockConfig, w: { periodId?: string; periodNo?: number }): string {
    return w.periodId ? this.period(w.periodId).month : `${c.year}-${z(Number(w.periodNo))}`;
  }

  private checkTargets(targets?: TargetWrite[], teamTargets?: TeamTargetWrite[]): void {
    for (const t of [...(targets || []), ...(teamTargets || [])]) {
      if (t.amount != null && !(t.amount >= 0)) throw new ForecastMockError(422, 'Target ต้องเป็นเลข 0 ขึ้นไป');
      if (t.periodId && this.db.periods[this.period(t.periodId).month]?.status === 'closed') throw new ForecastMockError(423, 'งวดปิดแล้ว แก้ Target ไม่ได้');
    }
  }

  private writeTargets(c: MockConfig, targets?: TargetWrite[], teamTargets?: TeamTargetWrite[]): number {
    const db = this.db;
    const months = new Set<string>();
    let n = 0;
    for (const t of targets || []) {
      const m = this.monthOf(c, t);
      const k = m + '|' + t.employeeId + '|' + t.pipelineId;
      if (t.amount == null) delete db.targets[k];
      else db.targets[k] = t.amount;
      months.add(m);
      n++;
    }
    for (const t of teamTargets || []) {
      const m = this.monthOf(c, t);
      const k = m + '|' + (t.saleGroupId ?? t.positionId) + '|' + t.pipelineId;
      if (t.amount == null) delete db.teamTargets[k];
      else db.teamTargets[k] = t.amount;
      months.add(m);
      n++;
    }
    if (n) this.log('target', [...months].sort().map(mName).join(', '), '—', 'บันทึก ' + n + ' ค่า', c.code);
    return n;
  }
}

function pick(c: ConfigFields): ConfigFields {
  return Object.fromEntries(CFG_KEYS.map((k) => [k, c[k]])) as unknown as ConfigFields;
}

/** ค่าที่ส่งมาบันทึก → เฉพาะฟิลด์ของ Config (ตัด fiscalYearId / year ที่จัดการแยก) */
function strip(w: ConfigWrite): Partial<ConfigFields> {
  const out: Record<string, unknown> = {};
  for (const k of CFG_KEYS) if (k !== 'year' && k in w && (w as Record<string, unknown>)[k] !== undefined) out[k] = (w as Record<string, unknown>)[k];
  return out as Partial<ConfigFields>;
}

/** asks for every list once, so the export of the Datasource documents (tools/mockup-export-seed.mjs) can write them */
export const registerReferenceLists = (): void => void seed('SUN', () => 'id');
