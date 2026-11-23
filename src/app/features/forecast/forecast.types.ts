/**
 * สัญญาของ API Sales Forecast — 14 endpoint ใต้ `/api/v1/forecast` ตามแท็บ "Endpoint ที่ใช้" ของต้นแบบ
 * (TripleSales_Forecast_Prototype_v19.html : EP-01 … EP-14). ชื่อฟิลด์ใช้ตามที่แท็บนั้นเขียน.
 *
 * แท็บนั้นบอกรายชื่อฟิลด์ ไม่ได้บอกรูป JSON ครบทุกชั้น — จุดที่ต้องตีความ/เพิ่มเองเพื่อให้หน้าแสดงได้เหมือนต้นแบบ
 * ติดป้าย `(เพิ่ม)` ไว้ที่ฟิลด์ : ถ้า backend จริงออกมาไม่ตรง แก้ที่ไฟล์นี้กับ forecast.mock.ts ที่เดียว.
 * framework-free (ใช้ทั้งใน Angular และใน forecast.mock.ts).
 */

export type ForecastCategory = 'committed' | 'bestcase' | 'pipeline' | 'closed' | 'omitted';
export type ConfigStatus = 'draft' | 'release' | 'block';
export type PeriodType = 'monthly' | 'quarterly';
export type HierarchyType = 'orgchart' | 'salegroup';
export type OpenFormula = 'weighted' | 'full';
export type OverdueRule = 'separate' | 'current' | 'exclude';
/** การกระทำต่อแถวที่ server คำนวณจากสถานะและสิทธิ์ (EP-02 `actions[]`) */
export type ConfigAction = 'open' | 'release' | 'delete' | 'block' | 'unblock' | 'history' | 'copy';

// ───────────────────────── EP-01  GET /lookups ─────────────────────────

export interface LookupsQuery {
  /** ถ้าส่ง ระบบคืนทีมตามโครงสร้างของ Config นั้น */
  configId?: string;
  /** เลือกเฉพาะส่วนที่ต้องการ เช่น pipelines,teams,mapping */
  include?: string;
}

export interface FiscalYear {
  id: string;
  /** ค.ศ. */
  year: number;
  hasConfig: boolean;
}

export interface ForecastPipeline {
  id: string;
  code: string;
  name: string;
}

export interface ForecastEmployee {
  id: string;
  name: string;
}

export interface ForecastTeam {
  id: string;
  name: string;
  /** (เพิ่ม) ชื่อหัวหน้าทีม — บรรทัดรองของแถว "รวม Team" ในตาราง Manager Adjustment */
  manager?: string;
  employees: ForecastEmployee[];
}

export interface StepMapping {
  step: string;
  probability: number;
  category: ForecastCategory;
}

export interface ForecastPermissions {
  canConfig: boolean;
  canTarget: boolean;
  canAdjust: boolean;
  canClose: boolean;
  canReopen: boolean;
}

export interface Lookups {
  fiscalYears: FiscalYear[];
  pipelines: ForecastPipeline[];
  /** ตามสิทธิ์ของผู้เรียก */
  teams: ForecastTeam[];
  stepMapping: StepMapping[];
  /** fiscalYearStart = เดือนเริ่มปีงบ (1–12) */
  company: { currency: string; fiscalYearStart: number };
  permissions: ForecastPermissions;
  /** (เพิ่ม) งวดปัจจุบันตามเวลาของ server รูป `YYYY-MM` — ไม่ส่งมา = ใช้นาฬิกาของเครื่อง */
  currentMonth?: string;
}

// ───────────────────────── EP-02 … EP-06  Configuration ─────────────────────────

export interface ConfigsQuery {
  year?: number;
  status?: ConfigStatus;
  /** ค่าเริ่มต้นปีล่าสุดก่อน */
  sort?: string;
}

/** ฟิลด์ที่ผู้ใช้ตั้งได้ (EP-04 `config`) */
export interface ConfigFields {
  code: string;
  name: string;
  /** ค.ศ. — คู่กับ `fiscalYearId` ตอนส่งบันทึก */
  year: number;
  periodType: PeriodType;
  hierarchyType: HierarchyType;
  openFormula: OpenFormula;
  overdueRule: OverdueRule;
  allowJudgment: boolean;
  allowCategoryOverride: boolean;
  allowManagerAdjustment: boolean;
}

export interface ForecastConfig extends ConfigFields {
  id: string;
  status: ConfigStatus;
  versionNo: number;
  everReleased: boolean;
  /** ISO date-time */
  updatedAt: string | null;
  updatedBy: string | null;
  /** ต้องส่งกลับมาตอนบันทึก (กันบันทึกทับกัน) */
  rowVersion?: number;
  actions?: ConfigAction[];
}

export interface ConfigsResponse {
  items: ForecastConfig[];
}

export interface ConfigVersion {
  versionNo: number;
  /** key ของฟิลด์ที่เปลี่ยน ; ว่าง = Release ครั้งแรก */
  changedFields: string[];
  configValues?: Partial<ConfigFields>;
  createdAt: string;
  createdBy: string;
}

export interface ConfigDetail {
  config: ForecastConfig;
  /** มีเมื่อขอ `include=versions` */
  versions?: ConfigVersion[];
}

/** ค่าที่ส่งตอนบันทึก : `year` ของหน้า → `fiscalYearId` ของ API */
export type ConfigWrite = Partial<Omit<ConfigFields, 'year'>> & { fiscalYearId?: string; year?: number };

export interface TargetWrite {
  /** EP-05 */
  periodId?: string;
  /** EP-04 (Config ยังไม่มี id งวด) */
  periodNo?: number;
  employeeId: string;
  pipelineId: string;
  /** null = ลบแถว */
  amount: number | null;
}

export interface TeamTargetWrite {
  periodId?: string;
  periodNo?: number;
  pipelineId: string;
  /** โครงสร้าง Sale Group */
  saleGroupId?: string;
  /** โครงสร้าง Entity Organize Chart */
  positionId?: string;
  amount: number | null;
}

export interface CreateConfigRequest {
  config: ConfigWrite;
  copyFromId?: string;
  targets?: TargetWrite[];
  teamTargets?: TeamTargetWrite[];
}

export interface CreateConfigResponse {
  config: ForecastConfig;
  periods?: ForecastPeriod[];
}

export interface SaveWorkspaceRequest {
  rowVersion: number;
  /** เฉพาะฟิลด์ที่เปลี่ยน */
  config?: ConfigWrite;
  targets?: TargetWrite[];
  teamTargets?: TeamTargetWrite[];
}

export interface SaveWorkspaceResponse {
  config: ForecastConfig;
  /** จำนวน Target ที่บันทึก/ลบ */
  saved: number;
  commitBatchId: string;
}

export interface ConfigStatusRequest {
  action: 'release' | 'block' | 'unblock' | 'delete';
  reason?: string;
  rowVersion: number;
}

export interface ConfigStatusResponse {
  config: ForecastConfig;
}

// ───────────────────────── EP-07  GET /configs/{id}/targets ─────────────────────────

export interface TargetsQuery {
  periodIds: string[];
  pipelineId: string;
  teamId?: string;
}

export interface TargetRow {
  employeeId: string;
  teamId: string;
  /** periodId → amount ; null = ไม่มี Target (ไม่ใช่ 0) */
  cells: Record<string, number | null>;
}

export interface TeamTargetRow {
  teamId: string;
  cells: Record<string, { amount: number | null; sumOfMembers: number }>;
}

export interface TargetsResponse {
  rows: TargetRow[];
  teamRows: TeamTargetRow[];
  pipelineSummary: { pipelineId: string; employeesWithTarget: number }[];
  periods: { periodId: string; status: 'open' | 'closed' }[];
}

// ───────────────────────── EP-08  POST /summary ─────────────────────────

export interface JudgmentValue {
  in: boolean;
  probability: number;
  amount: number;
  category: ForecastCategory;
  reason: string;
  rowVersion?: number;
}

export type JudgmentWrite =
  | ({ opportunityId: string } & JudgmentValue)
  | { opportunityId: string; reset: true; rowVersion?: number };

export type AdjustmentWrite =
  | { employeeId: string; pipelineId: string; delta: number; reason: string; rowVersion?: number }
  | { employeeId: string; pipelineId: string; reset: true; rowVersion?: number };

export interface SummaryRequest {
  periodId: string;
  /** `all` หรือ id */
  pipelineId: string;
  teamId?: string;
  employeeId?: string;
  /** ร่างที่ยังไม่บันทึก — ใช้คำนวณ Preview เท่านั้น */
  draft?: { judgments: JudgmentWrite[]; adjustments: AdjustmentWrite[] };
}

export type CategoryAmounts = Record<ForecastCategory, number>;

export interface SummaryNumbers {
  target: number;
  base: number;
  judged: number;
  judgmentDelta: number;
  managerDelta: number;
  final: number;
  gap: number;
  /** (เพิ่ม) Closed Success ของแถว */
  closed: number;
  /** (เพิ่ม) ยอดตามหมวด — คอลัมน์ Closed / Committed / Best Case / Pipeline ของตาราง Overview */
  categories: CategoryAmounts;
}

export interface SummaryEmployee extends SummaryNumbers {
  employeeId: string;
  name: string;
  /** (เพิ่ม) การปรับของพนักงานใน Pipeline ที่ขอ (มีเมื่อ pipelineId ≠ all) — ใช้เติมช่อง Δ / เหตุผล */
  adjustment?: { delta: number; reason: string; rowVersion?: number } | null;
}

export interface SummaryTeam extends SummaryNumbers {
  teamId: string;
  name: string;
  manager?: string;
  employees: SummaryEmployee[];
}

export interface SummaryResponse {
  totals: {
    target: number;
    base: number;
    judgmentDelta: number;
    managerDelta: number;
    final: number;
    closed: number;
    open: number;
    gap: number;
    coverage: number;
  };
  scenario: { min: number; expected: number; max: number };
  categories: { category: ForecastCategory; before: number; after: number }[];
  /** ทีม → พนักงานตามขอบเขตทีม (ไม่ถูกกรองด้วย employeeId : ใช้แสดงปุ่มเลือกพนักงานและตาราง) */
  teams: SummaryTeam[];
  warnings: string[];
  configStatus: ConfigStatus | 'none';
}

// ───────────────────────── EP-09  GET /opportunities ─────────────────────────

export interface OpportunitiesQuery {
  periodId: string;
  pipelineId?: string;
  teamId?: string;
  employeeId?: string;
  page?: number;
  pageSize?: number;
}

export interface OpportunityItem {
  id: string;
  txno: string;
  customer: string;
  owner: { id: string; name: string; teamId: string; teamName: string };
  pipeline: { id: string; name: string };
  stage: string;
  /** (เพิ่ม) ดีลที่ปิดแล้วแสดงเป็นป้าย Closed / Omitted แทนช่องปรับ */
  status: 'open' | 'won' | 'lost';
  original: { amount: number; probability: number; category: ForecastCategory };
  judgment: JudgmentValue | null;
  valueBefore: number;
  valueAfter: number;
  /** targetMonth รูป `YYYY-MM` */
  overdue: { targetMonth: string; rule: OverdueRule } | null;
  changedSinceJudgment: Record<string, string> | null;
  editable: boolean;
}

export interface OpportunitiesResponse {
  items: OpportunityItem[];
  total?: number;
}

// ───────────────────────── EP-10  POST /adjustments ─────────────────────────

export interface AdjustmentsRequest {
  periodId: string;
  judgments: JudgmentWrite[];
  adjustments: AdjustmentWrite[];
}

export interface AdjustmentsResponse {
  saved: number;
  commitBatchId: string;
  /** ยอดหลังบันทึก (เหมือน EP-08) */
  summary?: SummaryResponse;
}

// ───────────────────────── EP-11 / EP-12  Close Forecast Period ─────────────────────────

export interface ForecastPeriod {
  periodId: string;
  periodNo: number;
  /** ISO date `YYYY-MM-DD` */
  start: string;
  end: string;
  status: 'open' | 'closed';
  /** มีเมื่อขอ `includeTotals` */
  target?: number;
  finalNow?: number;
  snapshotFinal?: number | null;
  closedAt?: string | null;
  closedBy?: string | null;
  canClose?: boolean;
  canReopen?: boolean;
  rowVersion?: number;
}

export interface PeriodsResponse {
  items: ForecastPeriod[];
}

export interface PeriodStatusRequest {
  action: 'close' | 'reopen';
  reason: string;
  rowVersion: number;
}

export interface PeriodStatusResponse {
  period: ForecastPeriod;
}

// ───────────────────────── EP-13  GET /dashboard ─────────────────────────

export type DashboardLevel = 'year' | 'quarter' | 'month';

export interface DashboardQuery {
  level: DashboardLevel;
  year: number;
  quarter?: number;
  month?: number;
  /** `all` หรือ id */
  pipelineId: string;
  teamId?: string;
}

export interface DashboardResponse {
  /** month รูป `YYYY-MM` ; ระดับเดือน = 3 เดือนของไตรมาสนั้น · `inRange` (เพิ่ม) = เดือนที่อยู่ในช่วงที่เลือก */
  outlook: { month: string; target: number; final: number; closed: number; inRange?: boolean }[];
  teams: { team: string; name: string; target: number; final: number }[];
  health: { category: ForecastCategory; amount: number; share: number }[];
  bridge: { base: number; judgment: number; manager: number; final: number };
  /** (เพิ่ม) การ์ด "ฉากทัศน์ยอดขาย" ของหน้า Dashboard — รูปเดียวกับ EP-08 */
  scenario: { min: number; expected: number; max: number };
}

// ───────────────────────── EP-14  GET /history ─────────────────────────

export type HistoryType = 'config' | 'target' | 'judgment' | 'adjustment' | 'period';

export interface HistoryQuery {
  type?: HistoryType;
  configId?: string;
  periodId?: string;
  from?: string;
  to?: string;
  page?: number;
  pageSize?: number;
  /** json (ค่าเริ่มต้น) | xlsx */
  format?: 'json' | 'xlsx';
}

export interface HistoryItem {
  /** ISO date-time */
  at: string;
  actor: string;
  type: HistoryType;
  action?: string;
  label: string;
  oldValue: string;
  newValue: string;
  reason: string;
  commitBatchId?: string;
}

export interface HistoryResponse {
  items: HistoryItem[];
  total: number;
}
