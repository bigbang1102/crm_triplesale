import { Injectable, computed, inject, signal } from '@angular/core';
import { I18n } from '@core/i18n/i18n.service';
import { DialogService } from '@shared/ui/notify/dialog.service';
import { ForecastBackend } from './forecast.backend';
import { B, CATEGORIES, CATEGORY_LABEL, Lang, addMonths, clientMonth, monthName, yearLabel, yearMonths } from './forecast.format';
import { MOCK_COMPANIES, MOCK_ROLES, MockRole } from './forecast.mock';
import {
  AdjustmentWrite,
  ConfigFields,
  ConfigStatus,
  ConfigVersion,
  ConfigWrite,
  DashboardLevel,
  DashboardResponse,
  ForecastCategory,
  ForecastConfig,
  ForecastPeriod,
  HistoryItem,
  HistoryType,
  JudgmentWrite,
  Lookups,
  OpportunityItem,
  SummaryEmployee,
  SummaryResponse,
  TargetWrite,
  TeamTargetWrite,
} from './forecast.types';

export type L1 = 'list' | 'config' | 'overview' | 'dashboard' | 'history';
export type L2 = 'setup' | 'target' | 'adjust' | 'close';
export type L3 = 'judgment' | 'manager';

/** แท็บของต้นแบบ (`L1` / `L2` / `L3`) ไม่รวม "แผนภาพฐานข้อมูล (ERD)" และ "Endpoint ที่ใช้" — สองแท็บนั้นเป็นเอกสารของต้นแบบ */
export const L1_TABS: readonly { id: L1; label: string; icon: string }[] = [
  { id: 'list', label: 'Sales Forecast Listing', icon: '☰' },
  { id: 'config', label: 'Sales Forecast Configuration', icon: '⚙' },
  { id: 'overview', label: 'Forecast Overview', icon: '▤' },
  { id: 'dashboard', label: 'Forecast Dashboard', icon: '▥' },
  { id: 'history', label: 'Forecast Change History', icon: '◷' },
];
export const L2_TABS: readonly { id: L2; label: string }[] = [
  { id: 'setup', label: 'Configuration' },
  { id: 'target', label: 'Sales Target' },
  { id: 'adjust', label: 'Adjustment' },
  { id: 'close', label: 'Close Forecast Period' },
];
export const L3_TABS: readonly { id: L3; label: string }[] = [
  { id: 'judgment', label: 'Opportunity Judgment' },
  { id: 'manager', label: 'Manager Adjustment' },
];

export const STATUS_LABEL: Record<ConfigStatus, string> = { draft: 'Draft', release: 'Release', block: 'Block' };
export const STATUS_CHIP: Record<ConfigStatus | 'none', string> = { draft: 'c-warn', release: 'c-good', block: 'c-bad', none: 'c-grey' };

/** ฟิลด์ที่นับเป็น "การแก้ไข Configuration" (`CFG_FIELDS` ของต้นแบบ) */
export const CFG_KEYS: readonly (keyof ConfigFields)[] = [
  'code', 'name', 'year', 'periodType', 'hierarchyType', 'openFormula', 'overdueRule', 'allowJudgment', 'allowCategoryOverride', 'allowManagerAdjustment',
];

/** Configuration ที่กำลังแก้ในหน้า (id = null → ยังไม่บันทึก) */
export interface CfgEdit extends ConfigFields {
  id: string | null;
  status: ConfigStatus;
  versionNo: number;
  everReleased: boolean;
  rowVersion?: number;
}

/** ร่างการปรับราย OPP — ช่องตัวเลขเป็น '' ได้ระหว่างพิมพ์ (ตรวจตอนบันทึก) */
export interface JDraft {
  in: boolean;
  prob: number | '';
  amount: number | '';
  cat: ForecastCategory;
  reason: string;
}
export interface ADraft {
  delta: number;
  reason: string;
}
export type Change = { kind: 'judg'; key: string; a?: JDraft; b?: JDraft } | { kind: 'adj'; key: string; a?: ADraft; b?: ADraft };

export type Modal =
  | { kind: 'review' }
  | { kind: 'leave'; n: number }
  | { kind: 'period'; m: string; open: boolean }
  | { kind: 'cfgst'; id: string; to: 'release' | 'block' }
  | { kind: 'cfghist'; id: string };

/** Config ที่มีผลกับงวด : Release → Block → ไม่มี (`DEFCFG` ของต้นแบบ) */
export interface EffCfg {
  id: string | null;
  code: string;
  status: ConfigStatus | 'none';
  openFormula: 'weighted' | 'full';
  allowJudgment: boolean;
  allowCategoryOverride: boolean;
  allowManagerAdjustment: boolean;
}
const NONE_CFG: EffCfg = { id: null, code: '-', status: 'none', openFormula: 'weighted', allowJudgment: false, allowCategoryOverride: false, allowManagerAdjustment: false };

export interface Emp {
  id: string;
  name: string;
  team: string;
  teamName: string;
}

/** ตัวเลขของ 1 พนักงาน / ทีม ในตาราง Manager Adjustment */
export interface Row {
  target: number;
  base: number;
  judged: number;
  jd: number;
  adj: number;
  final: number;
}

const clone = <T>(o: T): T => JSON.parse(JSON.stringify(o)) as T;
const same = (a: unknown, b: unknown): boolean => JSON.stringify(a) === JSON.stringify(b);
const PREVIEW_DELAY = 200;
const TOAST_MS = 2600;

/**
 * สถานะและพฤติกรรมของหน้า Forecast — ย้ายมาจาก `S` + ตัวจัดการ event ของต้นแบบ (click / input / change) ทีละกรณี.
 * ต่างจากต้นแบบที่จุดเดียว : ต้นแบบคำนวณจากข้อมูลทั้งหมดในหน้า ; ที่นี่ตัวเลขทุกตัวมาจาก ForecastBackend (API จริง → ข้อมูลจำลอง)
 * ตามแท็บ "Endpoint ที่ใช้" — สิ่งที่คิดในหน้าเองมีแค่ร่างที่ยังไม่บันทึก (ค่าในแถวที่กำลังแก้ และ Final = หลัง Judgment + Δ)
 * ส่วนยอดรวม Preview ขอจาก EP-08 พร้อมร่าง (หน่วง 200 ms ระหว่างพิมพ์).
 */
@Injectable()
export class ForecastStore {
  private readonly backend = inject(ForecastBackend);
  private readonly i18n = inject(I18n);
  private readonly dialog = inject(DialogService);

  readonly t = this.i18n.t;
  readonly lang = computed<Lang>(() => (this.i18n.lang() === 'en' ? 'en' : 'th'));
  /** มีคำขอที่ตอบจากข้อมูลจำลอง (API ยังใช้งานไม่ได้) */
  readonly offline = this.backend.offline;

  // ───────────────────────── สถานะ (ต้นแบบ : S) ─────────────────────────
  readonly l1 = signal<L1>('list');
  readonly l2 = signal<L2>('setup');
  readonly l3 = signal<L3>('judgment');
  readonly month = signal(clientMonth());
  readonly pipe = signal('all');
  readonly team = signal('all');
  readonly emp = signal('all');
  readonly cfgId = signal<string | null>(null);
  readonly cfgEdit = signal<CfgEdit | null>(null);
  readonly cfgYear = signal('all');
  readonly cfgStatus = signal('all');
  readonly targetMonths = signal<string[]>([clientMonth()]);
  readonly tgPipe = signal('');
  readonly tgDraft = signal<Record<string, number | null>>({});
  readonly ttDraft = signal<Record<string, number | null>>({});
  readonly histType = signal('all');
  readonly ovPick = signal<string | null>(null);
  readonly dType = signal<DashboardLevel>('month');
  readonly dYear = signal(Number(clientMonth().slice(0, 4)));
  readonly dQ = signal(Math.floor((Number(clientMonth().slice(5)) - 1) / 3) + 1);
  readonly dMonth = signal(clientMonth());
  readonly modal = signal<Modal | null>(null);
  readonly toastText = signal('');
  readonly roOpen = signal(false);
  /** โหลดข้อมูลตั้งต้นเสร็จ (lookups + รายการ Configuration) */
  readonly ready = signal(false);
  /** บริษัท / บทบาทจำลองของต้นแบบ (ใช้กับข้อมูลจำลองเท่านั้น) */
  readonly mockCompany = signal('SUN');
  readonly mockRole = signal<MockRole>('config');
  readonly mockCompanies = MOCK_COMPANIES;
  readonly mockRoles = Object.entries(MOCK_ROLES) as [MockRole, string][];

  // ───────────────────────── ข้อมูลจาก backend ─────────────────────────
  readonly lookups = signal<Lookups | null>(null);
  readonly configs = signal<ForecastConfig[]>([]);
  readonly listRows = signal<ForecastConfig[]>([]);
  /** configId → งวดทั้งปี */
  readonly periods = signal<Record<string, ForecastPeriod[]>>({});
  /** งวดของ Configuration ที่เปิดอยู่พร้อมยอด (แท็บ Close Forecast Period) */
  readonly closeRows = signal<ForecastPeriod[]>([]);
  /** `เดือน|พนักงาน|pipeline` → Target ที่บันทึกแล้ว (สะสมจาก EP-07 ที่โหลดมา) */
  readonly tgSaved = signal<Record<string, number>>({});
  /** `เดือน|ทีม|pipeline` → Target ทีมที่บันทึกแล้ว */
  readonly ttSaved = signal<Record<string, number>>({});
  private readonly tgLoaded = signal<ReadonlySet<string>>(new Set());
  private readonly pipeFilled = signal<Record<string, number>>({});
  readonly summarySaved = signal<SummaryResponse | null>(null);
  readonly summaryPreview = signal<SummaryResponse | null>(null);
  readonly opps = signal<OpportunityItem[]>([]);
  private readonly dealIndex = signal<Record<string, OpportunityItem>>({});
  readonly judgSaved = signal<Record<string, JDraft>>({});
  readonly judgDraft = signal<Record<string, JDraft>>({});
  readonly adjSaved = signal<Record<string, ADraft>>({});
  readonly adjDraft = signal<Record<string, ADraft>>({});
  readonly ovSummary = signal<SummaryResponse | null>(null);
  readonly ovOpps = signal<OpportunityItem[]>([]);
  readonly dash = signal<DashboardResponse | null>(null);
  readonly historyRows = signal<HistoryItem[]>([]);
  /** ประวัติ Version ของ Config ในหน้าต่าง (null = กำลังโหลด) */
  readonly versions = signal<ConfigVersion[] | null>(null);

  private leaveFn: (() => void) | null = null;
  private toastTimer: ReturnType<typeof setTimeout> | undefined;
  private previewTimer: ReturnType<typeof setTimeout> | undefined;
  private readonly tokens: Record<string, number> = {};

  // ───────────────────────── ค่าที่คิดจากสถานะ ─────────────────────────

  /** งวดปัจจุบัน (`CUR` ของต้นแบบ) : ของ server ถ้าส่งมา ไม่งั้นนาฬิกาเครื่อง */
  readonly cur = computed(() => this.lookups()?.currentMonth ?? clientMonth());
  readonly perms = computed(() => this.lookups()?.permissions ?? { canConfig: false, canTarget: false, canAdjust: false, canClose: false, canReopen: false });
  readonly pipelines = computed(() => this.lookups()?.pipelines ?? []);
  readonly teams = computed(() => this.lookups()?.teams ?? []);
  readonly visibleEmps = computed<Emp[]>(() => this.teams().flatMap((t) => t.employees.map((e) => ({ id: e.id, name: e.name, team: t.id, teamName: t.name }))));
  readonly visibleTeams = computed(() => this.teams().map((t) => t.id));

  readonly curCfg = computed(() => this.configs().find((c) => c.id === this.cfgId()) ?? null);
  readonly inWs = computed(() => this.l1() === 'config' && !!(this.cfgId() || (this.cfgEdit() && !this.cfgEdit()!.id)));
  /** Configuration ของ workspace : ที่บันทึกแล้ว หรือร่างของรายการใหม่ */
  readonly wsCfg = computed<CfgEdit | ForecastConfig | null>(() => (this.cfgId() ? this.curCfg() : this.cfgEdit()));
  readonly wsYear = computed(() => Number(this.wsCfg()?.year ?? this.cur().slice(0, 4)));
  /** เดือนของตัวเลือกงวดนอก workspace (`GLOBAL_MONTHS` ของต้นแบบ = ก.ค. 69 – มิ.ย. 70 เมื่องวดปัจจุบันคือ พ.ย. 69) */
  readonly globalMonths = computed(() => Array.from({ length: 12 }, (_, i) => addMonths(this.cur(), i - 4)));
  readonly wsMonths = computed(() => (this.inWs() ? yearMonths(this.wsYear()) : this.globalMonths()));

  /** ร่างที่ต่างจากค่าที่บันทึกแล้ว (`changes()` ของต้นแบบ) */
  readonly changes = computed<Change[]>(() => {
    const out: Change[] = [];
    const js = this.judgSaved();
    const jd = this.judgDraft();
    for (const id of new Set([...Object.keys(js), ...Object.keys(jd)])) if (!same(js[id], jd[id])) out.push({ kind: 'judg', key: id, a: js[id], b: jd[id] });
    const as = this.adjSaved();
    const ad = this.adjDraft();
    for (const k of new Set([...Object.keys(as), ...Object.keys(ad)])) if (!same(as[k], ad[k])) out.push({ kind: 'adj', key: k, a: as[k], b: ad[k] });
    return out;
  });

  /** ทุกอย่างที่แก้ใน workspace รอปุ่มบันทึกเดียวด้านบน (`wsPending()` ของต้นแบบ) */
  readonly pending = computed(() => {
    const edit = this.cfgEdit();
    const cur = this.curCfg();
    const cfg = !this.perms().canConfig || !edit ? 0 : !this.cfgId() ? 1 : cur ? this.cfgDiff(cur, edit).length : 0;
    const tgS = this.tgSaved();
    const ttS = this.ttSaved();
    const tgD = this.tgDraft();
    const ttD = this.ttDraft();
    const tg = Object.keys(tgD).filter((k) => tgD[k] !== (tgS[k] ?? null)).length + Object.keys(ttD).filter((k) => ttD[k] !== (ttS[k] ?? null)).length;
    const adj = this.changes().length;
    return { cfg, tg, adj, total: cfg + tg + adj };
  });

  // ───────────────────────── เริ่มหน้า ─────────────────────────

  async init(): Promise<void> {
    try {
      await this.loadLookups();
      const cur = this.cur();
      this.month.set(cur);
      this.targetMonths.set([cur]);
      this.dYear.set(Number(cur.slice(0, 4)));
      this.dQ.set(Math.floor((Number(cur.slice(5)) - 1) / 3) + 1);
      this.dMonth.set(cur);
      await this.reloadConfigs();
      await this.loadGlobalPeriods();
    } catch (err) {
      this.fail(err);
    }
    this.ready.set(true);
    await this.refresh();
  }

  dispose(): void {
    clearTimeout(this.toastTimer);
    clearTimeout(this.previewTimer);
  }

  private async loadLookups(): Promise<void> {
    const lk = await this.backend.lookups();
    this.lookups.set(lk);
    if (!lk.pipelines.some((p) => p.id === this.tgPipe())) this.tgPipe.set(lk.pipelines[0]?.id ?? '');
    if (this.pipe() !== 'all' && !lk.pipelines.some((p) => p.id === this.pipe())) this.pipe.set('all');
    const session = this.backend.mock.session;
    this.mockCompany.set(session.company);
    this.mockRole.set(session.role);
    this.fitScope();
  }

  /** ผู้ใช้เห็นทีมเดียว / คนเดียว → ตัวกรองไม่มี "ทั้งหมด" (ต้นแบบ : ตอนเปลี่ยนบทบาท) */
  private fitScope(): void {
    const ts = this.visibleTeams();
    const es = this.visibleEmps();
    this.team.set(ts.length > 1 ? 'all' : (ts[0] ?? 'all'));
    this.emp.set(es.length > 1 ? 'all' : (es[0]?.id ?? 'all'));
  }

  private async reloadConfigs(): Promise<void> {
    const { items } = await this.backend.configs();
    this.configs.set(items);
    if (this.cfgId() && !items.some((c) => c.id === this.cfgId())) {
      this.cfgId.set(null);
      this.cfgEdit.set(null);
    }
  }

  /** งวดของ Config ที่ตัวเลือกงวดนอก workspace ต้องใช้ (ปีของ `globalMonths`) */
  private async loadGlobalPeriods(): Promise<void> {
    const ids = new Set<string>();
    for (const m of this.globalMonths()) {
      const c = this.cfgForPeriods(m, false);
      if (c) ids.add(c.id);
    }
    await Promise.all([...ids].map((id) => this.loadPeriods(id)));
  }

  private async loadPeriods(id: string): Promise<void> {
    const { items } = await this.backend.periods(id);
    this.periods.update((p) => ({ ...p, [id]: items }));
  }

  // ───────────────────────── Configuration ที่มีผล / งวด / สิทธิ์ ─────────────────────────

  /** `cfgFor()` ของต้นแบบ : Config ของปีนั้นที่ Release ไม่งั้น Block ไม่งั้น "ไม่มี" */
  cfgFor(m: string = this.month()): EffCfg {
    const y = Number(String(m).slice(0, 4));
    const cs = this.configs().filter((c) => c.year === y);
    return cs.find((c) => c.status === 'release') ?? cs.find((c) => c.status === 'block') ?? NONE_CFG;
  }

  /** Config ที่เป็นเจ้าของงวดของเดือนนั้น : ใน workspace = Config ที่เปิดอยู่ ; นอกนั้น Release → Block → รายการแรกของปี */
  private cfgForPeriods(m: string, useWs = true): ForecastConfig | null {
    const y = Number(m.slice(0, 4));
    if (useWs && this.inWs()) {
      const c = this.curCfg();
      if (c && c.year === y) return c;
    }
    const cs = this.configs().filter((c) => c.year === y);
    return cs.find((c) => c.status === 'release') ?? cs.find((c) => c.status === 'block') ?? cs[0] ?? null;
  }

  periodOf(m: string): ForecastPeriod | null {
    const c = this.cfgForPeriods(m);
    return (c && this.periods()[c.id]?.find((p) => p.start.slice(0, 7) === m)) || null;
  }

  periodClosed(m: string): boolean {
    return this.periodOf(m)?.status === 'closed';
  }

  /** `periodOpen()` ของต้นแบบ */
  periodOpen(m: string = this.month()): boolean {
    return !this.periodClosed(m) && this.cfgFor(m).status !== 'block';
  }

  canJudge(): boolean {
    return this.perms().canAdjust && this.cfgFor().allowJudgment && this.periodOpen();
  }

  canAdjEmp(id: string): boolean {
    return this.periodOpen() && this.perms().canAdjust && this.cfgFor().allowManagerAdjustment && this.visibleEmps().some((e) => e.id === id);
  }

  cfgDiff(a: ConfigFields, b: ConfigFields): (keyof ConfigFields)[] {
    return CFG_KEYS.filter((k) => !same(a[k], b[k]));
  }

  // ───────────────────────── ข้อความ ─────────────────────────

  mName(m: string): string {
    return monthName(m, this.lang());
  }

  year(y: number | string): string {
    return yearLabel(y, this.lang());
  }

  pipeName(id: string): string {
    return this.pipelines().find((p) => p.id === id)?.name ?? id;
  }

  empOf(id: string): Emp | undefined {
    return this.visibleEmps().find((e) => e.id === id);
  }

  teamName(id: string): string {
    return this.teams().find((t) => t.id === id)?.name ?? id;
  }

  statusLabel(s: ConfigStatus | 'none'): string {
    return s === 'none' ? this.t('app.forecast.status.none') : STATUS_LABEL[s];
  }

  /** ชื่อฟิลด์ของ Config ในประวัติ Version ; key ที่ไม่รู้จักแสดงตามที่ server ส่ง */
  fieldLabel(key: string): string {
    return (CFG_KEYS as readonly string[]).includes(key) ? this.t('app.forecast.field.' + key) : key;
  }

  toast(text: string): void {
    this.toastText.set(text);
    clearTimeout(this.toastTimer);
    this.toastTimer = setTimeout(() => this.toastText.set(''), TOAST_MS);
  }

  private fail(err: unknown): void {
    const msg = (err as { message?: unknown } | null)?.message;
    this.toast(typeof msg === 'string' && msg ? msg : this.t('app.forecast.error.generic'));
  }

  // ───────────────────────── โหลดข้อมูลของมุมมองที่เปิดอยู่ ─────────────────────────

  /** คำขอรุ่นล่าสุดของ `key` เท่านั้นที่เขียนผลลง signal (คำตอบที่มาช้ากว่าตัวกรองใหม่ถูกทิ้ง) */
  private latest(key: string): () => boolean {
    const mine = (this.tokens[key] = (this.tokens[key] ?? 0) + 1);
    return () => this.tokens[key] === mine;
  }

  async refresh(): Promise<void> {
    try {
      switch (this.l1()) {
        case 'list':
          return await this.loadListing();
        case 'config':
          if (this.inWs()) await this.loadWorkspace();
          return;
        case 'overview':
          return await this.loadOverview();
        case 'dashboard':
          return await this.loadDashboard();
        case 'history':
          return await this.loadHistory();
      }
    } catch (err) {
      this.fail(err);
    }
  }

  private async loadListing(): Promise<void> {
    const ok = this.latest('list');
    const year = this.cfgYear() === 'all' ? undefined : Number(this.cfgYear());
    const status = this.cfgStatus() === 'all' ? undefined : (this.cfgStatus() as ConfigStatus);
    const { items } = await this.backend.configs({ year, status });
    if (!ok()) return;
    this.listRows.set(items);
    if (year == null && !status) this.configs.set(items);
  }

  private async loadWorkspace(): Promise<void> {
    const id = this.cfgId();
    if (id && !this.periods()[id]) await this.loadPeriods(id);
    switch (this.l2()) {
      case 'target':
        return this.loadTargets();
      case 'adjust':
        return this.loadAdjust();
      case 'close':
        return this.loadClose();
    }
  }

  private async loadTargets(): Promise<void> {
    const id = this.cfgId();
    const pipe = this.tgPipe();
    const ms = this.targetMonths().filter((m) => m.startsWith(String(this.wsYear())));
    const byPeriod = new Map(ms.map((m) => [this.periodOf(m)?.periodId, m] as const).filter((x): x is [string, string] => !!x[0]));
    if (!id || !pipe || !byPeriod.size) return;
    const ok = this.latest('targets');
    const res = await this.backend.targets(id, { periodIds: [...byPeriod.keys()], pipelineId: pipe });
    if (!ok()) return;
    const tg = { ...this.tgSaved() };
    const tt = { ...this.ttSaved() };
    const put = (map: Record<string, number>, key: string, v: number | null | undefined) => {
      if (v == null) delete map[key];
      else map[key] = v;
    };
    for (const [pid, m] of byPeriod) {
      for (const r of res.rows) put(tg, `${m}|${r.employeeId}|${pipe}`, r.cells[pid]);
      for (const r of res.teamRows) put(tt, `${m}|${r.teamId}|${pipe}`, r.cells[pid]?.amount);
    }
    this.tgSaved.set(tg);
    this.ttSaved.set(tt);
    this.tgLoaded.update((s) => new Set([...s, ...ms.map((m) => `${pipe}|${m}`)]));
    this.pipeFilled.set(Object.fromEntries(res.pipelineSummary.map((p) => [p.pipelineId, p.employeesWithTarget])));
  }

  private scope(): { pipelineId: string; teamId?: string; employeeId?: string } {
    return { pipelineId: this.pipe(), teamId: this.team() === 'all' ? undefined : this.team(), employeeId: this.emp() === 'all' ? undefined : this.emp() };
  }

  private async loadAdjust(): Promise<void> {
    const ok = this.latest('adjust');
    const m = this.month();
    const p = this.periodOf(m);
    if (!p) {
      // Config ใหม่ที่ยังไม่บันทึก / ปีที่ไม่มีงวด : ยังไม่มีข้อมูลให้คำนวณ (ต้นแบบแสดงยอด 0)
      const empty = this.emptySummary();
      this.summarySaved.set(empty);
      this.summaryPreview.set(empty);
      this.opps.set([]);
      return;
    }
    const q = { periodId: p.periodId, ...this.scope() };
    const [sum, opp] = await Promise.all([this.backend.summary(q), this.backend.opportunities(q)]);
    if (!ok()) return;
    this.absorb(m, sum, opp.items);
    this.summarySaved.set(sum);
    this.opps.set(opp.items);
    if (this.changes().length) await this.loadPreview();
    else this.summaryPreview.set(sum);
  }

  /** ค่าที่บันทึกแล้วจาก server → `saved` ; ร่างของแถวที่ผู้ใช้ยังไม่ได้แตะตามค่าใหม่ไปด้วย */
  private absorb(m: string, sum: SummaryResponse, items: OpportunityItem[]): void {
    const index = { ...this.dealIndex() };
    const js = { ...this.judgSaved() };
    const jd = { ...this.judgDraft() };
    for (const it of items) {
      index[it.id] = it;
      const dirty = !same(js[it.id], jd[it.id]);
      const j = it.judgment;
      const next: JDraft | undefined = j ? { in: j.in, prob: j.probability, amount: j.amount, cat: j.category, reason: j.reason } : undefined;
      if (next) js[it.id] = next;
      else delete js[it.id];
      if (!dirty) {
        if (next) jd[it.id] = clone(next);
        else delete jd[it.id];
      }
    }
    this.dealIndex.set(index);
    this.judgSaved.set(js);
    this.judgDraft.set(jd);

    const pipe = this.pipe();
    if (pipe === 'all') return;
    const as = { ...this.adjSaved() };
    const ad = { ...this.adjDraft() };
    for (const t of sum.teams) {
      for (const e of t.employees) {
        const k = `${m}|${e.employeeId}|${pipe}`;
        const dirty = !same(as[k], ad[k]);
        const next: ADraft | undefined = e.adjustment ? { delta: e.adjustment.delta, reason: e.adjustment.reason } : undefined;
        if (next) as[k] = next;
        else delete as[k];
        if (!dirty) {
          if (next) ad[k] = clone(next);
          else delete ad[k];
        }
      }
    }
    this.adjSaved.set(as);
    this.adjDraft.set(ad);
  }

  /** ร่างปัจจุบันในรูปที่ API รับ (EP-08 `draft` / EP-10) */
  private writes(): { judgments: JudgmentWrite[]; adjustments: AdjustmentWrite[] } {
    const judgments: JudgmentWrite[] = [];
    const adjustments: AdjustmentWrite[] = [];
    for (const c of this.changes()) {
      if (c.kind === 'judg') {
        judgments.push(
          c.b
            ? { opportunityId: c.key, in: c.b.in, probability: Number(c.b.prob) || 0, amount: Number(c.b.amount) || 0, category: c.b.cat, reason: c.b.reason }
            : { opportunityId: c.key, reset: true },
        );
      } else {
        const [, employeeId, pipelineId] = c.key.split('|');
        adjustments.push(c.b ? { employeeId, pipelineId, delta: c.b.delta, reason: c.b.reason } : { employeeId, pipelineId, reset: true });
      }
    }
    return { judgments, adjustments };
  }

  private async loadPreview(): Promise<void> {
    const p = this.periodOf(this.month());
    if (!p) return;
    if (!this.changes().length) {
      this.summaryPreview.set(this.summarySaved());
      return;
    }
    const ok = this.latest('preview');
    try {
      const res = await this.backend.summary({ periodId: p.periodId, ...this.scope(), draft: this.writes() });
      if (ok()) this.summaryPreview.set(res);
    } catch (err) {
      this.fail(err);
    }
  }

  /** ระหว่างพิมพ์ : ขอ Preview หลังหยุดพิมพ์ครู่หนึ่ง */
  private schedulePreview(): void {
    clearTimeout(this.previewTimer);
    this.previewTimer = setTimeout(() => void this.loadPreview(), PREVIEW_DELAY);
  }

  private async flushPreview(): Promise<void> {
    clearTimeout(this.previewTimer);
    await this.loadPreview();
  }

  private emptySummary(): SummaryResponse {
    const zero = () => ({
      target: 0, base: 0, judged: 0, judgmentDelta: 0, managerDelta: 0, final: 0, gap: 0, closed: 0,
      categories: { committed: 0, bestcase: 0, pipeline: 0, closed: 0, omitted: 0 },
    });
    return {
      totals: { target: 0, base: 0, judgmentDelta: 0, managerDelta: 0, final: 0, closed: 0, open: 0, gap: 0, coverage: 0 },
      scenario: { min: 0, expected: 0, max: 0 },
      categories: CATEGORIES.map((category) => ({ category, before: 0, after: 0 })),
      teams: this.teams()
        .filter((t) => this.team() === 'all' || t.id === this.team())
        .map((t) => ({ teamId: t.id, name: t.name, manager: t.manager, ...zero(), employees: t.employees.map((e) => ({ employeeId: e.id, name: e.name, ...zero(), adjustment: null })) })),
      warnings: [],
      configStatus: this.cfgFor().status,
    };
  }

  private async loadClose(): Promise<void> {
    const id = this.cfgId();
    if (!id) {
      // Config ใหม่ : ยังไม่มีงวดใน server — แสดงงวดทั้งปีแบบเปิดอยู่ ยอด 0 (เหมือนต้นแบบ)
      this.closeRows.set(
        yearMonths(this.wsYear()).map((m, i) => ({ periodId: '', periodNo: i + 1, start: `${m}-01`, end: `${m}-28`, status: 'open', target: 0, finalNow: 0, snapshotFinal: null })),
      );
      return;
    }
    const ok = this.latest('close');
    const { items } = await this.backend.periods(id, true);
    if (!ok()) return;
    this.closeRows.set(items);
    this.periods.update((p) => ({ ...p, [id]: items }));
  }

  private async loadOverview(): Promise<void> {
    const ok = this.latest('overview');
    const p = this.periodOf(this.month());
    if (!p) {
      this.ovSummary.set(this.emptySummary());
      this.ovOpps.set([]);
      return;
    }
    const teamId = this.team() === 'all' ? undefined : this.team();
    const pick = this.ovPick();
    const drill = pick?.startsWith('t:') ? { teamId: pick.slice(2) } : pick?.startsWith('e:') ? { employeeId: pick.slice(2) } : { teamId };
    const [sum, opp] = await Promise.all([
      this.backend.summary({ periodId: p.periodId, pipelineId: this.pipe(), teamId }),
      this.backend.opportunities({ periodId: p.periodId, pipelineId: this.pipe(), ...drill }),
    ]);
    if (!ok()) return;
    this.ovSummary.set(sum);
    this.ovOpps.set(opp.items);
  }

  private async loadDashboard(): Promise<void> {
    const ok = this.latest('dashboard');
    const res = await this.backend.dashboard({
      level: this.dType(),
      year: this.dYear(),
      quarter: this.dType() === 'quarter' ? this.dQ() : undefined,
      month: this.dType() === 'month' ? Number(this.dMonth().slice(5)) : undefined,
      pipelineId: this.pipe(),
      teamId: this.team() === 'all' ? undefined : this.team(),
    });
    if (ok()) this.dash.set(res);
  }

  private historyType(): HistoryType | undefined {
    const v = this.histType();
    return v === 'all' ? undefined : (v as HistoryType);
  }

  private async loadHistory(): Promise<void> {
    const ok = this.latest('history');
    const res = await this.backend.history({ type: this.historyType() });
    if (ok()) this.historyRows.set(res.items);
  }

  // ───────────────────────── นำทาง (ต้นแบบ : data-l1 / data-l2 / data-l3) ─────────────────────────

  /** มีการแก้ไขค้าง → ถามก่อนออก ; ไม่มี → ล้างร่างแล้วไปต่อ (`guardLeave()` ของต้นแบบ) */
  guardLeave(fn: () => void): void {
    const n = this.pending().total;
    if (!n) {
      this.dropDrafts();
      fn();
      return;
    }
    this.leaveFn = fn;
    this.modal.set({ kind: 'leave', n });
  }

  private dropDrafts(): void {
    this.judgDraft.set(clone(this.judgSaved()));
    this.adjDraft.set(clone(this.adjSaved()));
    this.tgDraft.set({});
    this.ttDraft.set({});
    const c = this.cfgId() ? this.curCfg() : null;
    this.cfgEdit.set(c ? toEdit(c) : null);
    this.summaryPreview.set(this.summarySaved());
  }

  setL1(v: L1): void {
    this.guardLeave(() => {
      this.l1.set(v);
      if (v === 'config') this.ensureCfg();
      if (v !== 'config') {
        this.emp.set('all');
        this.ovPick.set(null);
        if (!this.globalMonths().includes(this.month())) this.month.set(this.cur());
      } else if (this.cfgId()) {
        const y = String(this.wsYear());
        if (!this.month().startsWith(y)) this.month.set(this.cur().startsWith(y) ? this.cur() : y + '-01');
      }
      this.fixMonth();
      void this.refresh();
    });
  }

  setL2(v: L2): void {
    this.l2.set(v);
    void this.refresh();
  }

  setL3(v: L3): void {
    this.l3.set(v);
  }

  /** เข้าเมนู Sales Forecast Configuration ตรง ๆ → เปิด Config ของปีปัจจุบันที่ Release (`ensureCfg()` / `defCfgId()`) */
  private ensureCfg(): void {
    if (this.l1() !== 'config' || this.inWs()) return;
    const cs = this.configs();
    const y = Number(this.cur().slice(0, 4));
    const c = cs.find((x) => x.year === y && x.status === 'release') ?? cs.find((x) => x.status === 'release') ?? [...cs].sort((a, b) => b.year - a.year)[0];
    if (c) this.openCfg(c.id);
  }

  /** งวดต้องอยู่ในปีของ workspace (ต้นแบบ : ต้น `page()`) */
  private fixMonth(): void {
    if (!this.inWs()) return;
    const ms = this.wsMonths();
    if (!ms.includes(this.month())) this.month.set(ms.includes(this.cur()) ? this.cur() : ms[0]);
  }

  private openCfg(id: string): void {
    const c = this.configs().find((x) => x.id === id);
    if (!c) return;
    this.cfgId.set(id);
    this.cfgEdit.set(toEdit(c));
    const cur = this.cur();
    this.month.set(cur.startsWith(String(c.year)) ? cur : `${c.year}-01`);
    this.targetMonths.set([this.month()]);
    this.emp.set('all');
    this.ovPick.set(null);
    void this.loadDetail(id);
  }

  /** EP-03 : ค่าล่าสุด + rowVersion ที่ต้องส่งกลับตอนบันทึก */
  private async loadDetail(id: string): Promise<void> {
    try {
      const { config } = await this.backend.configDetail(id);
      const before = this.configs().find((c) => c.id === id);
      const untouched = !!before && !!this.cfgEdit() && this.cfgId() === id && !this.cfgDiff(before, this.cfgEdit()!).length;
      this.configs.update((cs) => cs.map((c) => (c.id === id ? { ...c, ...config } : c)));
      if (untouched) this.cfgEdit.set(toEdit({ ...before, ...config }));
    } catch (err) {
      this.fail(err);
    }
  }

  /** กดแถว / ปุ่มเปิดในรายการ */
  open(id: string): void {
    this.guardLeave(() => {
      this.openCfg(id);
      this.l1.set('config');
      this.l2.set('setup');
      void this.refresh();
    });
  }

  switchCfg(id: string, l2?: L2): void {
    if (!id) return;
    this.guardLeave(() => {
      this.openCfg(id);
      if (l2) this.l2.set(l2);
      void this.refresh();
    });
  }

  goAdjust(): void {
    const c = this.cfgFor(this.month());
    if (c.id) {
      this.openCfg(c.id);
      this.month.set(this.cur());
    }
    this.l1.set('config');
    this.l2.set('adjust');
    this.fixMonth();
    void this.refresh();
  }

  seeJudgment(empId: string): void {
    this.l3.set('judgment');
    this.emp.set(empId);
    void this.refresh();
  }

  // ───────────────────────── ตัวกรอง (ต้นแบบ : change) ─────────────────────────

  setMonth(v: string): void {
    this.guardLeave(() => {
      this.month.set(v);
      void this.refresh();
    });
  }

  setTeam(v: string): void {
    this.team.set(v);
    this.emp.set('all');
    this.ovPick.set(null);
    void this.refresh();
  }

  setPipe(v: string): void {
    this.pipe.set(v);
    this.ovPick.set(null);
    void this.refresh();
  }

  setEmp(v: string): void {
    this.emp.set(v);
    void this.refresh();
  }

  setOvPick(v: string): void {
    this.ovPick.set(v);
    void this.refresh();
  }

  setHistType(v: string): void {
    this.histType.set(v);
    void this.refresh();
  }

  setCfgYear(v: string): void {
    this.cfgYear.set(v);
    void this.refresh();
  }

  setCfgStatus(v: string): void {
    this.cfgStatus.set(v);
    void this.refresh();
  }

  setDType(v: DashboardLevel): void {
    this.dType.set(v);
    if (v === 'month' && this.dMonth().slice(0, 4) !== String(this.dYear())) this.dMonth.set(this.dYear() + '-01');
    void this.refresh();
  }

  setDYear(v: string): void {
    this.dYear.set(Number(v));
    this.dMonth.set(this.dYear() + '-' + this.dMonth().slice(5));
    void this.refresh();
  }

  setDQ(v: string): void {
    this.dQ.set(Number(v));
    void this.refresh();
  }

  setDMonth(v: string): void {
    this.dMonth.set(v);
    void this.refresh();
  }

  setCompany(v: string): void {
    this.guardLeave(() => {
      this.backend.setMockSession({ company: v });
      this.cfgId.set(null);
      this.cfgEdit.set(null);
      this.ovPick.set(null);
      void this.reloadSession(true);
    });
  }

  setRole(v: MockRole): void {
    this.guardLeave(() => {
      this.backend.setMockSession({ role: v });
      this.ovPick.set(null);
      void this.reloadSession(false);
    });
  }

  /** เปลี่ยนบริษัท / บทบาทจำลอง : ข้อมูลทุกอย่างเป็นของ "ผู้ใช้" คนใหม่ */
  private async reloadSession(company: boolean): Promise<void> {
    try {
      this.judgSaved.set({});
      this.judgDraft.set({});
      this.adjSaved.set({});
      this.adjDraft.set({});
      this.tgSaved.set({});
      this.ttSaved.set({});
      this.tgLoaded.set(new Set());
      this.dealIndex.set({});
      this.periods.set({});
      await this.loadLookups();
      await this.reloadConfigs();
      await this.loadGlobalPeriods();
      if (company) this.ensureCfg();
      else if (this.cfgId() && this.curCfg()) this.cfgEdit.set(toEdit(this.curCfg()!));
      this.fixMonth();
    } catch (err) {
      this.fail(err);
    }
    await this.refresh();
  }

  // ───────────────────────── รายการ Configuration ─────────────────────────

  years(): number[] {
    return [...new Set(this.configs().map((c) => c.year))].sort((a, b) => b - a);
  }

  cfgNew(): void {
    const used = this.configs().map((c) => c.year);
    let y = Number(this.cur().slice(0, 4));
    while (used.includes(y)) y++;
    this.l1.set('config');
    this.cfgId.set(null);
    this.cfgEdit.set({
      id: null, code: 'FC-' + y, name: 'Sales Forecast ปี ' + y, year: y, status: 'draft', versionNo: 1, everReleased: false,
      periodType: 'monthly', hierarchyType: 'orgchart', openFormula: 'weighted', overdueRule: 'separate',
      allowJudgment: true, allowCategoryOverride: true, allowManagerAdjustment: true,
    });
    this.l2.set('setup');
    this.fixMonth();
  }

  async cfgCopy(id: string): Promise<void> {
    const src = this.configs().find((c) => c.id === id);
    if (!src) return;
    let y = src.year + 1;
    while (this.configs().some((c) => c.year === y)) y++;
    try {
      const { config } = await this.backend.createConfig({
        config: { ...this.configWrite(pickFields(src)), code: 'FC-' + y, name: 'Sales Forecast ปี ' + y, ...this.yearWrite(y) },
        copyFromId: src.id,
      });
      await this.afterConfigChange();
      this.toast(this.t('app.forecast.toast.copied', config.code, src.code));
    } catch (err) {
      this.fail(err);
    }
  }

  async cfgDelete(id: string): Promise<void> {
    const c = this.configs().find((x) => x.id === id);
    if (!c) return;
    const yes = await this.dialog.confirm({ title: this.t('app.forecast.confirm.delete', c.code), danger: true, icon: 'warning' });
    if (!yes) return;
    try {
      await this.backend.configStatus(id, { action: 'delete', rowVersion: c.rowVersion ?? 0 });
      if (this.cfgId() === id) {
        this.cfgId.set(null);
        this.cfgEdit.set(null);
      }
      await this.afterConfigChange();
      this.toast(this.t('app.forecast.toast.deleted'));
    } catch (err) {
      this.fail(err);
    }
  }

  async cfgHistory(id: string): Promise<void> {
    this.versions.set(null);
    this.modal.set({ kind: 'cfghist', id });
    try {
      const res = await this.backend.configDetail(id, 'versions');
      this.versions.set(res.versions ?? []);
    } catch (err) {
      this.versions.set([]);
      this.fail(err);
    }
  }

  cfgStatusAsk(id: string, to: 'release' | 'block'): void {
    this.modal.set({ kind: 'cfgst', id, to });
  }

  /** ยืนยัน Release / Block / ปลด Block (`docfgst` ของต้นแบบ) */
  async cfgStatusDo(reason: string): Promise<void> {
    const m = this.modal();
    if (m?.kind !== 'cfgst') return;
    const c = this.configs().find((x) => x.id === m.id);
    if (!c) return;
    const r = reason.trim();
    if (m.to === 'block' && !r) return this.toast(this.t('app.forecast.toast.reasonRequired'));
    if (m.to === 'release') {
      const other = this.configs().find((x) => x.id !== c.id && x.year === c.year && x.status === 'release');
      if (other) return this.toast(this.t('app.forecast.toast.releaseExists', this.year(c.year), other.code));
    }
    try {
      const action = m.to === 'block' ? 'block' : c.status === 'block' ? 'unblock' : 'release';
      await this.backend.configStatus(c.id, { action, reason: r || undefined, rowVersion: c.rowVersion ?? 0 });
      await this.afterConfigChange();
      if (this.cfgId() === c.id && this.curCfg()) this.cfgEdit.set(toEdit(this.curCfg()!));
      this.modal.set(null);
      this.toast(c.code + ' → ' + STATUS_LABEL[m.to]);
    } catch (err) {
      this.fail(err);
    }
  }

  private async afterConfigChange(): Promise<void> {
    await this.reloadConfigs();
    await this.loadGlobalPeriods();
    const id = this.cfgId();
    if (id) await this.loadPeriods(id);
    void this.loadLookups();
    await this.refresh();
  }

  // ───────────────────────── ฟอร์ม Configuration ─────────────────────────

  editCfg<K extends keyof ConfigFields>(key: K, value: ConfigFields[K]): void {
    const c = this.cfgEdit();
    if (!c) return;
    this.cfgEdit.set({ ...c, [key]: value });
    if (key === 'year' && !c.id) this.targetMonths.set([]);
    if (key === 'year') this.fixMonth();
  }

  private yearWrite(year: number): Pick<ConfigWrite, 'fiscalYearId' | 'year'> {
    return { fiscalYearId: this.lookups()?.fiscalYears.find((f) => f.year === year)?.id, year };
  }

  private configWrite(c: Partial<ConfigFields>): ConfigWrite {
    const { year, ...rest } = c;
    return year == null ? rest : { ...rest, ...this.yearWrite(year) };
  }

  // ───────────────────────── Sales Target ─────────────────────────

  private wsTargetMonths(): string[] {
    return this.targetMonths().filter((m) => m.startsWith(String(this.wsYear())));
  }

  toggleMonth(m: string): void {
    const ms = this.targetMonths();
    this.targetMonths.set(ms.includes(m) ? ms.filter((x) => x !== m) : [...ms, m].sort());
    void this.refresh();
  }

  quarterMonths(q: number): string[] {
    const y = this.wsYear();
    return [0, 1, 2].map((i) => `${y}-${String((q - 1) * 3 + i + 1).padStart(2, '0')}`);
  }

  toggleQuarter(q: number): void {
    const mm = this.quarterMonths(q);
    const ms = this.targetMonths();
    this.targetMonths.set(mm.every((m) => ms.includes(m)) ? ms.filter((m) => !mm.includes(m)) : [...new Set([...ms, ...mm])].sort());
    void this.refresh();
  }

  targetWholeYear(): void {
    this.targetMonths.set(yearMonths(this.wsYear()));
    void this.refresh();
  }

  targetClear(): void {
    this.targetMonths.set([]);
  }

  setTgPipe(v: string): void {
    this.tgPipe.set(v);
    void this.refresh();
  }

  tgKey(m: string, who: string, pipe = this.tgPipe()): string {
    return `${m}|${who}|${pipe}`;
  }

  /** ค่าในช่อง ('' = ไม่มี Target) */
  tgRaw(k: string): number | '' {
    const d = this.tgDraft();
    const v = k in d ? d[k] : this.tgSaved()[k];
    return v == null ? '' : v;
  }

  tgVal(k: string): number {
    return Number(this.tgRaw(k) || 0);
  }

  tgChanged(k: string): boolean {
    const d = this.tgDraft();
    return k in d && d[k] !== (this.tgSaved()[k] ?? null);
  }

  ttVal(k: string): number | null {
    const d = this.ttDraft();
    return (k in d ? d[k] : this.ttSaved()[k]) ?? null;
  }

  ttChanged(k: string): boolean {
    const d = this.ttDraft();
    return k in d && d[k] !== (this.ttSaved()[k] ?? null);
  }

  setTarget(k: string, value: string): void {
    this.tgDraft.update((d) => ({ ...d, [k]: value === '' ? null : Number(value) }));
  }

  setTeamTarget(k: string, value: string): void {
    this.ttDraft.update((d) => ({ ...d, [k]: value === '' ? null : Number(value) }));
  }

  /** จำนวนพนักงานที่มี Target ของ Pipeline ในเดือนที่เลือก (ป้ายในตัวเลือก Pipeline) */
  pipeFilledCount(pipe: string): number {
    const ms = this.wsTargetMonths();
    const loaded = this.tgLoaded();
    if (!this.cfgId() || ms.every((m) => loaded.has(`${pipe}|${m}`))) {
      return this.visibleEmps().filter((e) => ms.some((m) => this.tgRaw(this.tgKey(m, e.id, pipe)) !== '')).length;
    }
    return this.pipeFilled()[pipe] ?? 0;
  }

  // ───────────────────────── Adjustment (ต้นแบบ : setJ / setAdj / validate) ─────────────────────────

  /** ค่าที่ใช้กับดีลตอนนี้ : ร่าง ไม่งั้นค่าเดิมจาก OPP */
  jEff(d: OpportunityItem): JDraft {
    return this.judgDraft()[d.id] ?? { in: true, prob: d.original.probability, amount: d.original.amount, cat: d.original.category, reason: '' };
  }

  jDirty(id: string): boolean {
    return !same(this.judgSaved()[id], this.judgDraft()[id]);
  }

  jHas(id: string): boolean {
    return !!this.judgDraft()[id];
  }

  /** Forecast Value หลังปรับของแถว : ยังไม่แตะ = ค่าของ server ; กำลังแก้ = คิดจากร่างทันที (สูตรเดียวกับ `val()` ของต้นแบบ) */
  jAfter(d: OpportunityItem): number {
    if (d.status !== 'open' || !this.jDirty(d.id)) return d.valueAfter;
    const e = this.jEff(d);
    if (!e.in || d.overdue?.rule === 'separate') return 0;
    const amount = Number(e.amount) || 0;
    return this.cfgFor().openFormula === 'weighted' ? (amount * (Number(e.prob) || 0)) / 100 : amount;
  }

  setJ(id: string, k: 'in' | 'prob' | 'amount' | 'cat' | 'reason', v: string): void {
    const d = this.dealIndex()[id];
    if (!d) return;
    const cur: JDraft = { ...this.jEff(d) };
    if (k === 'in') cur.in = v === '1';
    else if (k === 'prob' || k === 'amount') cur[k] = v === '' ? '' : Number(v);
    else if (k === 'cat') cur.cat = v as ForecastCategory;
    else cur.reason = v;
    const o = d.original;
    const unchanged = cur.in && cur.prob === o.probability && cur.amount === o.amount && cur.cat === o.category;
    this.judgDraft.update((dr) => {
      const next = { ...dr };
      if (unchanged && !this.judgSaved()[id]) delete next[id];
      else next[id] = cur;
      return next;
    });
    if (k !== 'reason') this.schedulePreview();
  }

  jReset(id: string): void {
    this.judgDraft.update((dr) => {
      const next = { ...dr };
      delete next[id];
      return next;
    });
    this.schedulePreview();
  }

  bulk(ids: string[], inOut: 'in' | 'out'): void {
    if (!ids.length) return this.toast(this.t('app.forecast.toast.pickOpp'));
    for (const id of ids) this.setJ(id, 'in', inOut === 'in' ? '1' : '0');
  }

  adjKey(empId: string): string {
    return `${this.month()}|${empId}|${this.pipe()}`;
  }

  setAdj(key: string, k: 'delta' | 'final' | 'reason', v: string, judged = 0): void {
    const cur: ADraft = { ...(this.adjDraft()[key] ?? { delta: 0, reason: '' }) };
    if (k === 'delta') cur.delta = v === '' ? 0 : Number(v);
    else if (k === 'final') {
      if (v === '') return;
      cur.delta = Number(v) - judged;
    } else cur.reason = v;
    this.adjDraft.update((dr) => {
      const next = { ...dr };
      if (!cur.delta && !cur.reason && !this.adjSaved()[key]) delete next[key];
      else next[key] = cur;
      return next;
    });
    if (k !== 'reason') this.schedulePreview();
  }

  aReset(key: string): void {
    this.adjDraft.update((dr) => {
      const next = { ...dr };
      delete next[key];
      return next;
    });
    this.schedulePreview();
  }

  /** แถวพนักงานของ Preview ล่าสุด */
  private sumEmp(id: string): SummaryEmployee | undefined {
    for (const t of this.summaryPreview()?.teams ?? []) {
      const e = t.employees.find((x) => x.employeeId === id);
      if (e) return e;
    }
    return undefined;
  }

  /** ตัวเลขของพนักงานในตาราง Manager Adjustment : Δ ของ Pipeline ที่เลือกใช้ร่างในหน้า (เห็นผลทันที) */
  empRow(id: string): Row {
    const e = this.sumEmp(id);
    const target = e?.target ?? 0;
    const base = e?.base ?? 0;
    const judged = e?.judged ?? 0;
    const adj = this.pipe() === 'all' ? (e?.managerDelta ?? 0) : Number(this.adjDraft()[this.adjKey(id)]?.delta || 0);
    return { target, base, judged, jd: judged - base, adj, final: judged + adj };
  }

  sumRows(ids: string[]): Row {
    const r: Row = { target: 0, base: 0, judged: 0, jd: 0, adj: 0, final: 0 };
    for (const id of ids) {
      const c = this.empRow(id);
      r.target += c.target;
      r.base += c.base;
      r.judged += c.judged;
      r.adj += c.adj;
      r.final += c.final;
    }
    r.jd = r.judged - r.base;
    return r;
  }

  /** พนักงานตามตัวกรองทีม / พนักงาน (`scopeEmps()` ของต้นแบบ) */
  scopeEmps(): Emp[] {
    let es = this.visibleEmps();
    if (this.team() !== 'all') es = es.filter((e) => e.team === this.team());
    if (this.emp() !== 'all') es = es.filter((e) => e.id === this.emp());
    return es;
  }

  changeLabel(c: Change): string {
    if (c.kind === 'judg') return c.key;
    const [m, id, p] = c.key.split('|');
    return (this.empOf(id)?.name ?? id) + ' · ' + this.mName(m) + (p ? ' · ' + this.pipeName(p) : '');
  }

  /** `descJ()` ของต้นแบบ */
  descJ(x: JDraft | undefined, id: string): string {
    const d = this.dealIndex()[id];
    if (!x) return d ? `IN · ${d.original.probability}% · ${B(d.original.amount)} · ${CATEGORY_LABEL[d.original.category]} ${this.t('app.forecast.review.original')}` : '';
    return `${x.in ? 'IN' : 'OUT'} · ${x.prob}% · ${B(x.amount)} · ${CATEGORY_LABEL[x.cat]}`;
  }

  validate(): string[] {
    const errs: string[] = [];
    for (const c of this.changes()) {
      if (c.kind === 'judg' && c.b) {
        if (c.b.prob === '' || c.b.prob < 0 || c.b.prob > 100) errs.push(this.t('app.forecast.err.prob', c.key));
        if (c.b.amount === '' || c.b.amount < 0) errs.push(this.t('app.forecast.err.amount', c.key));
        if (!String(c.b.reason || '').trim()) errs.push(this.t('app.forecast.err.reason', c.key));
      }
      if (c.kind === 'adj' && c.b && c.b.delta && !String(c.b.reason || '').trim()) errs.push(this.t('app.forecast.err.adjReason', this.changeLabel(c)));
    }
    return errs;
  }

  // ───────────────────────── บันทึก workspace (ต้นแบบ : wssave / wsdiscard / commit) ─────────────────────────

  wsDiscard(): void {
    const isNew = !this.cfgId();
    this.dropDrafts();
    if (isNew) this.l1.set('list');
    this.toast(this.t(isNew ? 'app.forecast.toast.cancelNew' : 'app.forecast.toast.discarded'));
    void this.refresh();
  }

  async wsSave(): Promise<void> {
    const c = this.cfgEdit();
    const isNew = !this.cfgId();
    const cur = this.curCfg();
    const msg: string[] = [];
    const tgD = this.tgDraft();
    const ttD = this.ttDraft();
    for (const k in tgD) if (tgD[k] != null && !(tgD[k]! >= 0)) return this.toast(this.t('app.forecast.toast.targetMin'));
    for (const k in ttD) if (ttD[k] != null && !(ttD[k]! >= 0)) return this.toast(this.t('app.forecast.toast.teamTargetMin'));

    const diff = c && cur ? this.cfgDiff(cur, c) : [];
    const saveCfg = this.perms().canConfig && !!c && (isNew || diff.length > 0);
    if (saveCfg) {
      if (!String(c!.code).trim() || !String(c!.name).trim()) {
        this.l2.set('setup');
        return this.toast(this.t('app.forecast.toast.codeName'));
      }
      if (this.configs().some((x) => x.id !== c!.id && x.code.toLowerCase() === String(c!.code).trim().toLowerCase())) {
        this.l2.set('setup');
        return this.toast(this.t('app.forecast.toast.codeDup'));
      }
    }
    const tgS = this.tgSaved();
    const ttS = this.ttSaved();
    const tk = Object.keys(tgD).filter((k) => tgD[k] !== (tgS[k] ?? null));
    const tt = Object.keys(ttD).filter((k) => ttD[k] !== (ttS[k] ?? null));
    const period = (m: string): Pick<TargetWrite, 'periodId' | 'periodNo'> => (isNew ? { periodNo: Number(m.slice(5)) } : { periodId: this.periodOf(m)?.periodId, periodNo: Number(m.slice(5)) });
    const targets: TargetWrite[] = tk.map((k) => {
      const [m, employeeId, pipelineId] = k.split('|');
      return { ...period(m), employeeId, pipelineId, amount: tgD[k] };
    });
    const teamKey = (c?.hierarchyType ?? 'orgchart') === 'salegroup' ? 'saleGroupId' : 'positionId';
    const teamTargets: TeamTargetWrite[] = tt.map((k) => {
      const [m, teamId, pipelineId] = k.split('|');
      return { ...period(m), pipelineId, [teamKey]: teamId, amount: ttD[k] };
    });
    const nTargets = targets.length + teamTargets.length;
    /** มีอะไรไปถึง server ไหม (มีแต่ร่าง Judgment / Adjustment = ยังไม่ส่งอะไร ไปหน้าตรวจสอบได้เลย) */
    const sends = (saveCfg && isNew) || ((saveCfg || nTargets > 0) && !!cur);

    try {
      if (saveCfg && isNew) {
        const { config } = await this.backend.createConfig({
          config: this.configWrite(pickFields(c!)),
          ...(targets.length ? { targets } : {}),
          ...(teamTargets.length ? { teamTargets } : {}),
        });
        const keep = { l2: this.l2(), tm: this.targetMonths() };
        await this.reloadConfigs();
        this.openCfg(config.id);
        this.l2.set(keep.l2);
        this.targetMonths.set(keep.tm);
        msg.push(this.t('app.forecast.msg.created', config.code));
      } else if ((saveCfg || nTargets) && cur) {
        const changed = Object.fromEntries(diff.map((k) => [k, c![k]])) as Partial<ConfigFields>;
        const { config } = await this.backend.saveWorkspace(cur.id, {
          rowVersion: cur.rowVersion ?? 0,
          ...(saveCfg ? { config: this.configWrite(changed) } : {}),
          ...(targets.length ? { targets } : {}),
          ...(teamTargets.length ? { teamTargets } : {}),
        });
        if (saveCfg) msg.push(cur.status === 'release' ? this.t('app.forecast.msg.cfgVersion', config.versionNo) : 'Configuration');
        await this.reloadConfigs();
        if (this.curCfg()) this.cfgEdit.set(toEdit(this.curCfg()!));
      }
      if (nTargets) msg.push(this.t('app.forecast.msg.target', nTargets));
      this.tgDraft.set({});
      this.ttDraft.set({});
      if (sends) {
        this.tgLoaded.set(new Set());
        const id = this.cfgId();
        await Promise.all([id ? this.loadPeriods(id) : null, this.loadGlobalPeriods()]);
        void this.loadLookups();
        await this.refresh();
      }
    } catch (err) {
      return this.fail(err);
    }
    const done = msg.join(' · ');
    if (this.changes().length) {
      await this.flushPreview();
      this.modal.set({ kind: 'review' });
      return this.toast(msg.length ? this.t('app.forecast.toast.savedReview', done) : this.t('app.forecast.toast.review'));
    }
    this.toast(msg.length ? this.t('app.forecast.toast.saved', done) : this.t('app.forecast.toast.noChange'));
  }

  /** ยืนยันในหน้าตรวจสอบ : บันทึก Judgment / Manager Adjustment ทั้งชุด (EP-10) */
  async commit(): Promise<void> {
    if (this.validate().length) return;
    const p = this.periodOf(this.month());
    const ch = this.changes();
    if (!p || !ch.length) return;
    try {
      await this.backend.saveAdjustments({ periodId: p.periodId, ...this.writes() });
      this.judgSaved.set(clone(this.judgDraft()));
      this.adjSaved.set(clone(this.adjDraft()));
      this.modal.set(null);
      this.toast(this.t('app.forecast.toast.committed', ch.length));
      await this.refresh();
    } catch (err) {
      this.fail(err);
    }
  }

  // ───────────────────────── Close Forecast Period ─────────────────────────

  periodAsk(m: string, open: boolean): void {
    this.modal.set({ kind: 'period', m, open });
  }

  /** ยืนยันปิดงวด / เปิดงวดอีกครั้ง (`dop` ของต้นแบบ) */
  async periodDo(reason: string): Promise<void> {
    const md = this.modal();
    if (md?.kind !== 'period') return;
    const r = reason.trim();
    if (!r) return this.toast(this.t('app.forecast.toast.reasonRequired'));
    const p = this.closeRows().find((x) => x.start.slice(0, 7) === md.m) ?? this.periodOf(md.m);
    if (!p?.periodId) return;
    try {
      await this.backend.periodStatus(p.periodId, { action: md.open ? 'reopen' : 'close', reason: r, rowVersion: p.rowVersion ?? 0 });
      if (!md.open) {
        // ปิดงวด = ใช้เฉพาะค่าที่บันทึกแล้ว : ร่างการปรับถูกทิ้ง
        this.judgDraft.set(clone(this.judgSaved()));
        this.adjDraft.set(clone(this.adjSaved()));
      }
      this.modal.set(null);
      this.toast(this.t('app.forecast.toast.done'));
      await this.loadGlobalPeriods();
      await this.refresh();
    } catch (err) {
      this.fail(err);
    }
  }

  // ───────────────────────── หน้าต่าง / อื่น ๆ ─────────────────────────

  async review(): Promise<void> {
    await this.flushPreview();
    this.modal.set({ kind: 'review' });
  }

  closeModal(): void {
    this.modal.set(null);
    this.leaveFn = null;
  }

  leaveOk(): void {
    const fn = this.leaveFn;
    this.leaveFn = null;
    this.modal.set(null);
    this.dropDrafts();
    fn?.();
  }

  /** Export ประวัติ (EP-14 `format=xlsx`) ; API ยังไม่พร้อม = ข้อความเดียวกับต้นแบบ */
  async exportHistory(): Promise<Blob | null> {
    try {
      const file = await this.backend.historyExport({ type: this.historyType() });
      if (!file) this.toast(this.t('app.forecast.toast.exportMock'));
      return file;
    } catch (err) {
      this.fail(err);
      return null;
    }
  }
}

function toEdit(c: ForecastConfig): CfgEdit {
  return { ...pickFields(c), id: c.id, status: c.status, versionNo: c.versionNo, everReleased: c.everReleased, rowVersion: c.rowVersion };
}

function pickFields(c: ConfigFields): ConfigFields {
  return Object.fromEntries(CFG_KEYS.map((k) => [k, c[k]])) as unknown as ConfigFields;
}
