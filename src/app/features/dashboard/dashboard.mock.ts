/**
 * Deterministic fake backend of the Dashboard (dev / `mock: true`, tests and the Java-vs-Angular comparison).
 *
 * It answers in exactly the shapes the page script reads — the JSON `DashboardView` rendered into the Java page and the
 * responses of `/dashboard/*` (BFF) and `/dashboard/api/v1/sundashboard/*` (the dashboard service, wrapped as
 * `{ status, result }`). Every answer is computed from ONE seeded set of leads, so the filters of the page (year, month,
 * date range, channel, country, employee …) really change the numbers and every tab agrees with the others.
 *
 * Framework-free on purpose (no Angular imports): the comparison harness loads this file in Node.
 */
import { SEED_EMPLOYEES } from '@core/mock/crm-seed';
import { reference, msg } from '@core/mock/reference';
import type { CalendarFrameData, DashboardBackend, DashboardInitial, FrameContext } from './dashboard-backend';
import { MOCK_TODAY, createGoldMock, type GoldMock } from './dashboard.mock.gold';
import { journaledBackend } from '@core/mockup/mockup-journal';

export { MOCK_TODAY };

type Group = 'CS' | 'AN' | 'PLS' | 'LS' | 'FI' | 'LE' | 'CRM';
const GROUPS: readonly Group[] = ['CS', 'AN', 'PLS', 'LS', 'FI', 'LE', 'CRM'];
const SLA_DAYS: Record<Group, number> = reference('dashboard.slaDays', { CS: 3, AN: 5, PLS: 4, LS: 7, FI: 5, LE: 10, CRM: 14 });

/** the months dropdown of the page: Java normalizeMasterData shows the Thai abbreviation (THAI_MONTH_ABBREV) */
const MONTHS_ABBR = reference('dashboard.monthsAbbreviated', ['ม.ค.', 'ก.พ.', 'มี.ค.', 'เม.ย.', 'พ.ค.', 'มิ.ย.', 'ก.ค.', 'ส.ค.', 'ก.ย.', 'ต.ค.', 'พ.ย.', 'ธ.ค.']);
const MONTHS_TH = reference('dashboard.monthsFull', ['มกราคม', 'กุมภาพันธ์', 'มีนาคม', 'เมษายน', 'พฤษภาคม', 'มิถุนายน', 'กรกฎาคม', 'สิงหาคม', 'กันยายน', 'ตุลาคม', 'พฤศจิกายน', 'ธันวาคม']);

/** the people of the cast (`seed.org.json`: code, name, team) */
const EMPLOYEES = SEED_EMPLOYEES;
const EMP_NAME = new Map<string, string>(EMPLOYEES.map((e) => [e.code, e.name]));
const EMP_TEAM = new Map<string, string>(EMPLOYEES.map((e) => [e.code, e.team]));

/** who works which department */
const DEPT_EMP: Record<Group, string[]> = reference('dashboard.deptEmployees', {
  CS: ['E101', 'E102', 'E103', 'E104'],
  AN: ['E105', 'E106'],
  PLS: ['E103', 'E107'],
  LS: ['E105', 'E108'],
  FI: ['E106'],
  LE: ['E107', 'E108'],
  CRM: ['E102', 'E104'],
});

const STEPS: Record<Group, { code: string; name: string }[]> = reference('dashboard.steps', {
  CS: [
    { code: 'CS01', name: 'รับลีดใหม่' },
    { code: 'CS02', name: 'โทรติดต่อลูกค้า' },
    { code: 'CS03', name: 'นัดหมายพบลูกค้า' },
    { code: 'CS04', name: 'ส่งต่อทีมวิเคราะห์' },
  ],
  AN: [
    { code: 'AN01', name: 'ตรวจสอบเอกสาร' },
    { code: 'AN02', name: 'วิเคราะห์ความเสี่ยง' },
    { code: 'AN03', name: 'สรุปผลวิเคราะห์' },
  ],
  PLS: [
    { code: 'PL01', name: 'คัดกรองเบื้องต้น' },
    { code: 'PL02', name: 'ประเมินวงเงิน' },
    { code: 'PL03', name: 'เสนอผลิตภัณฑ์' },
  ],
  LS: [
    { code: 'LS01', name: 'ยื่นคำขอสินเชื่อ' },
    { code: 'LS02', name: 'พิจารณาอนุมัติ' },
    { code: 'LS03', name: 'แจ้งผลอนุมัติ' },
  ],
  FI: [
    { code: 'FI01', name: 'ตรวจสอบบัญชีผู้รับเงิน' },
    { code: 'FI02', name: 'จัดเตรียมการโอนเงิน' },
  ],
  LE: [
    { code: 'LE01', name: 'ทำสัญญาสินเชื่อ' },
    { code: 'LE02', name: 'จดทะเบียนหลักประกัน' },
  ],
  CRM: [
    { code: 'CR01', name: 'ติดตามหลังการขาย' },
    { code: 'CR02', name: 'สำรวจความพึงพอใจ' },
  ],
});

const COUNTRIES_FOREIGN: [string, number][] = reference('dashboard.foreignCountries', [['ญี่ปุ่น', 30], ['เกาหลีใต้', 22], ['สิงคโปร์', 14], ['จีน', 14], ['สหรัฐอเมริกา', 10], ['อังกฤษ', 6], ['เยอรมนี', 4]]);
const PROVINCES = reference('dashboard.provinces', ['กรุงเทพมหานคร', 'เชียงใหม่', 'ขอนแก่น', 'ภูเก็ต', 'ชลบุรี', 'นครราชสีมา']);
const OCCUPATIONS = reference('dashboard.occupations', ['พนักงานบริษัท', 'เจ้าของกิจการ', 'ข้าราชการ', 'ฟรีแลนซ์', 'แพทย์/พยาบาล', 'วิศวกร', 'เกษตรกร']);
const POSITIONS = reference('dashboard.positions', ['ผู้จัดการ', 'เจ้าของ', 'พนักงานอาวุโส', 'หัวหน้างาน', 'เจ้าหน้าที่']);
const BUSINESS = reference('dashboard.business', ['ค้าปลีก', 'บริการ', 'การผลิต', 'เกษตรกรรม', 'อสังหาริมทรัพย์']);
const DISTRICTS = reference('dashboard.districts', ['เมือง', 'บางรัก', 'สัตหีบ', 'ถลาง', 'หางดง', 'ปากช่อง', 'พล']);
const CHANNELS = reference('dashboard.channels', ['Facebook', 'LINE OA', 'Website', 'Walk-in', 'Referral', 'Call Center']);
const MOVEMENTS = reference('dashboard.movements', [
  { value: '01', label: 'ลีดใหม่' },
  { value: '02', label: 'ลีดเดิม' },
  { value: '03', label: 'ส่งต่อจากสาขา' },
]);
const TH_FIRST = reference('dashboard.thFirstNames', ['สมชาย', 'สมหญิง', 'วิชัย', 'นภา', 'ธนากร', 'พิมพ์ชนก', 'อนุชา', 'ปรียา', 'กิตติ', 'มาลี', 'ประเสริฐ', 'จิราพร', 'ภานุ', 'สุภาพร', 'ณัฐวุฒิ', 'รัตนา', 'เอกชัย', 'วราภรณ์', 'ชัยวัฒน์', 'ศิริพร']);
const TH_LAST = reference('dashboard.thLastNames', ['ใจดี', 'รักษา', 'มั่นคง', 'สุขสวัสดิ์', 'เจริญผล', 'แสงทอง', 'พงษ์ศิริ', 'ทองดี', 'บุญมา', 'ศรีสุข', 'วงศ์ไทย', 'อินทร์แก้ว']);
const EN_FIRST = reference('dashboard.enFirstNames', ['Kenji', 'Yuki', 'Min-jun', 'Wei', 'John', 'Emma', 'Hans', 'Lena', 'Akira', 'Ji-woo']);
const EN_LAST = reference('dashboard.enLastNames', ['Tanaka', 'Kim', 'Chen', 'Smith', 'Brown', 'Mueller', 'Sato', 'Lee', 'Wang', 'Park']);

// ---- dates ------------------------------------------------------------------------------------------------------------
const dayNum = (iso: string): number => Math.floor(Date.UTC(+iso.slice(0, 4), +iso.slice(5, 7) - 1, +iso.slice(8, 10)) / 86_400_000);
const isoOf = (n: number): string => new Date(n * 86_400_000).toISOString().slice(0, 10);
const TODAY_N = dayNum(MOCK_TODAY);
const pad2 = (n: number): string => (n < 10 ? '0' : '') + n;
const round1 = (n: number): number => Math.round(n * 10) / 10;
const fmtInt = (n: number): string => Number(n || 0).toLocaleString('en-US');

// ---- the seeded leads --------------------------------------------------------------------------------------------------
interface Stint {
  group: Group;
  emp: string;
  /** one entry per step visited, in order */
  steps: { code: string; name: string; enter: string; exit: string | null }[];
}
interface Lead {
  txno: string;
  code: string;
  first: string;
  last: string;
  country: string;
  province: string;
  occupation: string;
  position: string;
  business: string;
  district: string;
  channel: string;
  movement: string;
  contact: string;
  /** payment / collection date of a closed lead */
  collection: string;
  /** current group and step */
  group: Group;
  step: string;
  /** the department employee who owns the lead now / first took it (CS) */
  assigned: string;
  cs: string;
  latestContact: string;
  closed: boolean;
  lost: boolean;
  blocked: boolean;
  stints: Stint[];
}

function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function buildLeads(): Lead[] {
  const rnd = mulberry32(20261020);
  const pick = <T>(a: readonly T[]): T => a[Math.floor(rnd() * a.length)];
  const weighted = <T>(a: readonly (readonly [T, number])[]): T => {
    const sum = a.reduce((s, x) => s + x[1], 0);
    let r = rnd() * sum;
    for (const [v, w] of a) {
      r -= w;
      if (r < 0) return v;
    }
    return a[a.length - 1][0];
  };
  const leads: Lead[] = [];
  for (let i = 0; i < 260; i++) {
    const in2025 = rnd() < 0.15;
    const start = dayNum(in2025 ? '2025-01-01' : '2026-01-01');
    const span = in2025 ? 364 : TODAY_N - start;
    const reach = weighted<number>([[0, 30], [1, 12], [2, 15], [3, 15], [4, 8], [5, 10], [6, 10]]);
    const closed = reach >= 5 || (reach === 4 && rnd() < 0.5);
    const contactN = start + Math.floor(rnd() * Math.max(1, span - (reach * 8 + 12)));
    const foreign = rnd() < 0.35;
    const first = foreign ? pick(EN_FIRST) : pick(TH_FIRST);
    const last = foreign ? pick(EN_LAST) : pick(TH_LAST);
    const country = foreign ? weighted(COUNTRIES_FOREIGN) : 'ไทย';
    const occupation = pick(OCCUPATIONS);

    // the path through the departments
    const stints: Stint[] = [];
    let cursor = contactN + Math.floor(rnd() * 3);
    for (let g = 0; g <= reach; g++) {
      const group = GROUPS[g];
      const all = STEPS[group];
      const visited = g < reach ? all.length : 1 + Math.floor(rnd() * all.length);
      const stint: Stint = { group, emp: pick(DEPT_EMP[group]), steps: [] };
      for (let s = 0; s < visited; s++) {
        const enter = Math.min(cursor, TODAY_N);
        cursor += 1 + Math.floor(rnd() * 8);
        stint.steps.push({ code: all[s].code, name: all[s].name, enter: isoOf(enter), exit: null });
      }
      stints.push(stint);
    }
    // each step ends where the next one begins; the last one ends at the payment (closed lead) or stays open
    const flat = stints.flatMap((s) => s.steps);
    for (let k = 0; k < flat.length - 1; k++) flat[k].exit = flat[k + 1].enter;
    const lastStep = flat[flat.length - 1];
    let collection = '';
    if (closed) {
      collection = isoOf(Math.min(dayNum(lastStep.enter) + 1 + Math.floor(rnd() * 5), TODAY_N));
      lastStep.exit = collection;
    }
    const lastStint = stints[stints.length - 1];
    const year = in2025 ? 2025 : 2026;
    leads.push({
      txno: `LD${year}-${String(i + 1).padStart(6, '0')}`,
      code: `PS${String(year).slice(2)}-${String(i + 1).padStart(5, '0')}`,
      first,
      last,
      country,
      province: foreign ? '' : pick(PROVINCES),
      occupation,
      position: pick(POSITIONS),
      business: pick(BUSINESS),
      district: pick(DISTRICTS),
      channel: pick(CHANNELS),
      movement: weighted<string>([['01', 70], ['02', 20], ['03', 10]]),
      contact: isoOf(contactN),
      collection,
      group: lastStint.group,
      step: lastStep.name,
      assigned: lastStint.emp,
      cs: stints[0].emp,
      latestContact: lastStep.enter,
      closed,
      lost: !closed && rnd() < 0.08,
      blocked: rnd() < 0.06,
      stints,
    });
  }
  return leads;
}

let LEADS_CACHE: Lead[] | null = null;
const leads = (): Lead[] => (LEADS_CACHE ??= buildLeads());

// ---- request filters ---------------------------------------------------------------------------------------------------
interface Filters {
  year: string;
  month: string;
  fromdate: string;
  todate: string;
  datebasis: string;
  employee: string;
  chanel: string;
  country: string;
  occupation: string;
  province: string;
  activitygroup: string;
  movementtype: string;
}
const ALL = 'all';
const DEFAULT_FILTERS: Filters = {
  year: '2026', month: ALL, fromdate: ALL, todate: ALL, datebasis: 'contact', employee: ALL, chanel: ALL, country: ALL,
  occupation: ALL, province: ALL, activitygroup: ALL, movementtype: ALL,
};

function filtersOf(q: URLSearchParams): Filters {
  const g = (k: string, d: string): string => {
    const v = q.get(k);
    return v == null || v === '' ? d : v;
  };
  return {
    year: g('year', ALL), month: g('month', ALL), fromdate: g('fromdate', ALL), todate: g('todate', ALL), datebasis: g('datebasis', 'contact'),
    employee: g('employee', ALL), chanel: g('chanel', ALL), country: g('country', ALL), occupation: g('occupation', ALL),
    province: g('province', ALL), activitygroup: g('activitygroup', ALL), movementtype: g('movementtype', ALL),
  };
}

type GroupMode = 'current' | 'reached' | 'none';
interface SelectOptions {
  /** how `activitygroup` narrows the leads */
  groupMode?: GroupMode;
  /** `employee` is the owner of the lead (overview) or ignored (department tables filter by their own employee) */
  employeeScope?: 'lead' | 'none';
}

function select(f: Filters, opt: SelectOptions = {}): Lead[] {
  const groupMode = opt.groupMode ?? 'current';
  const employees = f.employee === ALL ? null : new Set(f.employee.split(',').filter(Boolean));
  return leads().filter((l) => {
    const d = f.datebasis === 'wfs' ? l.latestContact : l.contact;
    if (f.year !== ALL && d.slice(0, 4) !== f.year) return false;
    if (f.month !== ALL && Number(d.slice(5, 7)) !== Number(f.month)) return false;
    if (f.fromdate !== ALL && d < f.fromdate) return false;
    if (f.todate !== ALL && d > f.todate) return false;
    if (employees && (opt.employeeScope ?? 'lead') === 'lead' && !employees.has(l.cs)) return false;
    if (f.chanel !== ALL && l.channel !== f.chanel) return false;
    if (f.country !== ALL && l.country !== f.country) return false;
    if (f.occupation !== ALL && l.occupation !== f.occupation) return false;
    if (f.province !== ALL && l.province !== f.province) return false;
    if (f.movementtype !== ALL && l.movement !== f.movementtype) return false;
    if (f.activitygroup !== ALL && groupMode === 'current' && l.group !== f.activitygroup) return false;
    if (f.activitygroup !== ALL && groupMode === 'reached' && !l.stints.some((s) => s.group === f.activitygroup)) return false;
    return true;
  });
}

const fullName = (l: Lead): string => `${l.first} ${l.last}`.trim();
const daysBetween = (aIso: string, bIso: string): number => Math.max(0, dayNum(bIso) - dayNum(aIso));

function countBy<T>(items: readonly T[], key: (t: T) => string): Map<string, number> {
  const m = new Map<string, number>();
  for (const it of items) m.set(key(it), (m.get(key(it)) ?? 0) + 1);
  return m;
}
const topN = (m: Map<string, number>, n: number): [string, number][] =>
  [...m.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0], 'th')).slice(0, n);

// ---- overview charts ---------------------------------------------------------------------------------------------------
function trendData(f: Filters): { xAxis: string[]; series: number[] } {
  const m = countBy(select(f), (l) => (f.datebasis === 'wfs' ? l.latestContact : l.contact));
  const days = [...m.keys()].sort();
  return { xAxis: days, series: days.map((d) => m.get(d) ?? 0) };
}

function groupData(f: Filters): { name: string; value: number }[] {
  const m = countBy(select(f), (l) => l.group);
  return GROUPS.filter((g) => m.has(g)).map((g) => ({ name: g, value: m.get(g) ?? 0 }));
}

function barData(m: Map<string, number>, n: number): { yAxis: string[]; values: number[]; total: number } {
  const top = topN(m, n);
  return { yAxis: top.map((x) => x[0]), values: top.map((x) => x[1]), total: [...m.values()].reduce((a, b) => a + b, 0) };
}

interface FunnelRow {
  name: string;
  total: number;
  closed: number;
  sharePct: number;
  barPct: number;
  closedOnly: boolean;
}
function funnelData(ls: Lead[], key: (l: Lead) => string, n: number): FunnelRow[] {
  const m = new Map<string, { total: number; closed: number }>();
  for (const l of ls) {
    const k = key(l);
    const cur = m.get(k) ?? { total: 0, closed: 0 };
    cur.total++;
    if (l.closed) cur.closed++;
    m.set(k, cur);
  }
  const rows = [...m.entries()].sort((a, b) => b[1].total - a[1].total || a[0].localeCompare(b[0], 'th')).slice(0, n);
  const max = rows.length ? rows[0][1].total : 1;
  const grand = rows.reduce((s, r) => s + r[1].total, 0);
  return rows.map(([name, v]) => ({
    name,
    total: v.total,
    closed: v.closed,
    sharePct: grand > 0 ? round1((v.total * 100) / grand) : 0,
    barPct: round1((v.total * 100) / max),
    closedOnly: false,
  }));
}
/** Java: getSourceFunnelSubtitle() = formatInt(totalClosed) + " ลีดที่ปิดได้" */
const funnelSubtitle = (ls: Lead[]): string => msg('{0} ลีดที่ปิดได้', fmtInt(ls.filter((l) => l.closed).length));

function leadBreakdown(f: Filters): Record<string, unknown> {
  const ls = select(f);
  const bucket = (key: (l: Lead) => string): Record<string, unknown> => {
    const m = new Map<string, { lead: number; success: number; lost: number }>();
    for (const l of ls) {
      const k = key(l) || '-';
      const cur = m.get(k) ?? { lead: 0, success: 0, lost: 0 };
      cur.lead++;
      if (l.closed) cur.success++;
      if (l.lost) cur.lost++;
      m.set(k, cur);
    }
    const items = [...m.entries()]
      .sort((a, b) => b[1].lead - a[1].lead || a[0].localeCompare(b[0], 'th'))
      .map(([name, v]) => ({
        name, lead: v.lead, success: v.success, lost: v.lost,
        successRate: v.lead ? round1((v.success * 100) / v.lead) : 0,
        lostRate: v.lead ? round1((v.lost * 100) / v.lead) : 0,
      }));
    return {
      items,
      totalLead: ls.length,
      totalSuccess: items.reduce((s, i) => s + i.success, 0),
      totalLost: items.reduce((s, i) => s + i.lost, 0),
    };
  };
  return {
    occupation: bucket((l) => l.occupation),
    businesstype: bucket((l) => l.business),
    district: bucket((l) => l.district),
    channel: bucket((l) => l.channel),
    team: bucket((l) => EMP_TEAM.get(l.cs) ?? ''),
    saleperson: bucket((l) => EMP_NAME.get(l.cs) ?? l.cs),
  };
}

// ---- tabs: steps / status ----------------------------------------------------------------------------------------------
function groupPanels(f: Filters): unknown[] {
  const ls = select(f, { groupMode: 'none' });
  return GROUPS.map((g) => {
    const here = ls.filter((l) => l.group === g);
    const m = topN(countBy(here, (l) => l.step), 99);
    return {
      code: g,
      total: here.length,
      steps: m.map(([name, count], i) => ({ rank: i + 1, name, count, pct: here.length ? round1((count * 100) / here.length) : 0 })),
    };
  });
}

/** a lead's time in one department */
interface StintInfo {
  lead: Lead;
  stint: Stint;
  first: string;
  open: boolean;
  /** days waiting (open) or days until it moved on (done) */
  days: number;
}
function stintsOf(ls: Lead[], group: Group, includeBlocked: boolean): StintInfo[] {
  const out: StintInfo[] = [];
  for (const lead of ls) {
    if (lead.blocked && !includeBlocked) continue;
    const stint = lead.stints.find((s) => s.group === group);
    if (!stint) continue;
    const lastStep = stint.steps[stint.steps.length - 1];
    const open = lastStep.exit === null;
    const first = stint.steps[0].enter;
    out.push({ lead, stint, first, open, days: daysBetween(first, open ? MOCK_TODAY : (lastStep.exit as string)) });
  }
  return out;
}
const avg = (a: number[]): number => (a.length ? round1(a.reduce((s, x) => s + x, 0) / a.length) : 0);

function statusKpis(f: Filters, includeBlocked: boolean): unknown[] {
  const ls = select(f, { groupMode: 'none', employeeScope: 'none' });
  return GROUPS.map((g) => {
    const all = stintsOf(ls, g, includeBlocked);
    const pending = all.filter((s) => s.open);
    const done = all.filter((s) => !s.open);
    const pendingAvg = avg(pending.map((s) => s.days));
    const completedAvg = avg(done.map((s) => s.days));
    return {
      code: g, name: g, pending: pending.length, pendingAvg, completed: done.length, completedAvg,
      slaDriftPending: pending.length ? round1(pendingAvg - SLA_DAYS[g]) : null,
      slaDriftCompleted: done.length ? round1(completedAvg - SLA_DAYS[g]) : null,
      sla: SLA_DAYS[g],
    };
  });
}

/** employee rows of one department, as the service answers (before the page normalizes them) */
function performanceRows(f: Filters, group: Group, includeBlocked: boolean): Record<string, unknown>[] {
  const ls = select(f, { groupMode: 'none', employeeScope: 'none' });
  const employees = f.employee === ALL ? null : new Set(f.employee.split(',').filter(Boolean));
  const byEmp = new Map<string, StintInfo[]>();
  for (const s of stintsOf(ls, group, includeBlocked)) {
    if (employees && !employees.has(s.stint.emp)) continue;
    byEmp.set(s.stint.emp, [...(byEmp.get(s.stint.emp) ?? []), s]);
  }
  return [...byEmp.entries()].map(([emp, list]) => {
    const pending = list.filter((s) => s.open);
    const done = list.filter((s) => !s.open);
    const pendingAvg = avg(pending.map((s) => s.days));
    const completedAvg = avg(done.map((s) => s.days));
    return {
      group,
      employeeCode: emp,
      employeeName: EMP_NAME.get(emp) ?? emp,
      totalLead: list.length,
      pendingCount: pending.length,
      avgPendingDays: pendingAvg,
      slaDriftPending: pending.length ? round1(pendingAvg - SLA_DAYS[group]) : null,
      completedCount: done.length,
      avgCompletedDays: completedAvg,
      slaDriftCompleted: done.length ? round1(completedAvg - SLA_DAYS[group]) : null,
      transition: done.length,
    };
  });
}

function performanceSteps(f: Filters, group: Group, empCode: string, includeBlocked: boolean): Record<string, unknown>[] {
  const ls = select(f, { groupMode: 'none', employeeScope: 'none' });
  const rows = stintsOf(ls, group, includeBlocked).filter((s) => s.stint.emp === empCode);
  return STEPS[group].map((step) => {
    const entries = rows.flatMap((r) => r.stint.steps.filter((x) => x.code === step.code));
    const open = entries.filter((e) => e.exit === null);
    const done = entries.filter((e) => e.exit !== null);
    const pendingAvg = avg(open.map((e) => daysBetween(e.enter, MOCK_TODAY)));
    const completedAvg = avg(done.map((e) => daysBetween(e.enter, e.exit as string)));
    return {
      procedureName: step.name,
      totalLead: entries.length,
      pendingCount: open.length,
      avgPendingDays: pendingAvg,
      slaDriftPending: open.length ? round1(pendingAvg - SLA_DAYS[group]) : null,
      completedCount: done.length,
      avgCompletedDays: completedAvg,
      slaDriftCompleted: done.length ? round1(completedAvg - SLA_DAYS[group]) : null,
      transition: done.length,
    };
  });
}

const personRow = (s: StintInfo, mode: 'pending' | 'completed' | 'step'): Record<string, unknown> => {
  const lastStep = s.stint.steps[s.stint.steps.length - 1];
  return {
    prospectCode: s.lead.code,
    prospectName: s.lead.first,
    prospectLastname: s.lead.last,
    procedureName: lastStep.name,
    stepEntryDate: mode === 'step' ? lastStep.enter : s.first,
    lastContactDate: s.lead.latestContact,
    assignedTo: EMP_NAME.get(s.stint.emp) ?? s.stint.emp,
    daysInStep: s.days,
    daysPending: s.days,
    daysToComplete: s.days,
    occupation: s.lead.occupation,
    country: s.lead.country,
  };
};

interface Page<T> {
  currentPage: number;
  totalPages: number;
  totalRecords: number;
  pageSize: number;
  data: T[];
}
function paged<T>(rows: T[], page: number, perPage: number): Page<T> {
  const totalPages = Math.max(1, Math.ceil(rows.length / perPage));
  const p = Math.min(Math.max(1, page), totalPages);
  return { currentPage: p, totalPages, totalRecords: rows.length, pageSize: perPage, data: rows.slice((p - 1) * perPage, p * perPage) };
}

// ---- tab: pipeline ------------------------------------------------------------------------------------------------------
function pipelineTable(f: Filters, page: number): Record<string, unknown> {
  const years = [...new Set(leads().map((l) => l.contact.slice(0, 4)))].sort().reverse();
  const year = years[Math.min(Math.max(page, 1), years.length) - 1];
  const ls = select({ ...f, year, activitygroup: ALL }, { groupMode: 'none' });
  const months = MONTHS_TH.map((label, i) => {
    const mm = pad2(i + 1);
    const inMonth = ls.filter((l) => l.contact.slice(5, 7) === mm);
    const values: Record<string, number> = {};
    for (const g of GROUPS) values[g] = inMonth.filter((l) => l.stints.some((s) => s.group === g)).length;
    // Java: monthLabel = MONTH_TH[m] + "  " + year
    return { month: mm, label: `${label}  ${year}`, monthLabel: `${label}  ${year}`, values, total: inMonth.length };
  }).filter((r) => r.total > 0 || f.month === ALL);
  const totals: Record<string, number> = {};
  for (const g of GROUPS) totals[g] = months.reduce((s, r) => s + (r.values[g] ?? 0), 0);
  // the shape DashboardView.buildPipelineTableJson / fetchPipelineFromApi writes: the same list under months and rows, the groups under groups and departments
  const deptColors = { CS: '#00d4a8', AN: '#9C6F63', PLS: '#4f7cff', LS: '#ffb84d', FI: '#ef4444', LE: '#a26bff', CRM: '#f01685' };
  return {
    groups: [...GROUPS], departments: [...GROUPS], deptColors, months, rows: months, totals, grandTotal: ls.length,
    currentPage: Math.min(Math.max(page, 1), years.length), totalPages: years.length, year,
  };
}

function pipelineDetail(f: Filters, group: Group, month: string, page: number): Record<string, unknown> {
  const ls = select({ ...f, month: ALL, activitygroup: ALL }, { groupMode: 'none' }).filter((l) => month === ALL || Number(l.contact.slice(5, 7)) === Number(month));
  const rows = stintsOf(ls, group, true).sort((a, b) => a.lead.contact.localeCompare(b.lead.contact) || a.lead.code.localeCompare(b.lead.code));
  const p = paged(rows.map((r) => personRow(r, 'step')), page, 20);
  return { result: p };
}

// ---- tabs: customer by step group / status by customer -----------------------------------------------------------------
interface Cell {
  dateIn: string;
  dateout: string | null;
  assignToName: string;
  dateTotal: number;
}
const cellOf = (stint: Stint, from = 0, to = stint.steps.length - 1): Cell => {
  const a = stint.steps[from];
  const b = stint.steps[to];
  return { dateIn: a.enter, dateout: b.exit, assignToName: EMP_NAME.get(stint.emp) ?? stint.emp, dateTotal: daysBetween(a.enter, b.exit ?? MOCK_TODAY) };
};
const matches = (l: Lead, search: string): boolean => !search || (fullName(l) + ' ' + l.code).toLowerCase().includes(search.toLowerCase());

function customerStepGroups(f: Filters, search: string, page: number, perPage: number): Record<string, unknown> {
  const ls = select(f, { groupMode: 'reached' }).filter((l) => matches(l, search));
  const columnName = ['ติดต่อครั้งแรก', 'รหัส', 'ชื่อลูกค้า', 'อาชีพ', 'ประเทศ', 'ผู้รับผิดชอบล่าสุด', ...GROUPS];
  const customerList = ls.map((l) => {
    const row: Record<string, unknown> = {
      firstContact: l.contact, code: l.code, name: fullName(l), occupation: l.occupation, country: l.country,
      latestAssignToName: EMP_NAME.get(l.assigned) ?? l.assigned, total: 0,
    };
    let total = 0;
    for (const s of l.stints) {
      const c = cellOf(s);
      row[s.group] = c;
      total += c.dateTotal;
    }
    row['total'] = total;
    return row;
  });
  const p = paged(customerList, page, perPage);
  return { currentPage: p.currentPage, totalPages: p.totalPages, totalRecords: p.totalRecords, pageSize: perPage, columnName, customerList: p.data };
}

function customerStatusList(f: Filters, search: string, page: number, perPage: number, stepSel: string): Record<string, unknown> {
  const group = (GROUPS as readonly string[]).includes(f.activitygroup) ? (f.activitygroup as Group) : 'CS';
  const wanted = stepSel === ALL ? STEPS[group] : STEPS[group].filter((s) => stepSel.split(',').includes(s.code));
  const ls = select({ ...f, activitygroup: ALL }, { groupMode: 'none' }).filter(
    (l) => matches(l, search) && l.stints.some((s) => s.group === group && (stepSel === ALL || s.steps.some((x) => wanted.some((w) => w.code === x.code)))),
  );
  const columnName = ['ชื่อลูกค้า', 'รหัส', 'อาชีพ', 'ประเทศ', ...wanted.map((w) => w.name)];
  const customerList = ls.map((l) => {
    const stint = l.stints.find((s) => s.group === group) as Stint;
    const row: Record<string, unknown> = { name: fullName(l), code: l.code, occupation: l.occupation, country: l.country, total: 0 };
    let total = 0;
    wanted.forEach((w, i) => {
      const idx = stint.steps.findIndex((x) => x.code === w.code);
      if (idx < 0) return;
      const c = cellOf(stint, idx, idx);
      row[`step${i + 1}`] = c;
      total += c.dateTotal;
    });
    row['total'] = total;
    return row;
  });
  const p = paged(customerList, page, perPage);
  return { currentPage: p.currentPage, totalPages: p.totalPages, totalRecords: p.totalRecords, pageSize: perPage, columnName, customerList: p.data };
}

// ---- tab: lead table ----------------------------------------------------------------------------------------------------
const leadService = (l: Lead): Record<string, unknown> => ({
  leadTxno: l.txno,
  contactDate: l.contact,
  prospectCode: l.code,
  prospectName: l.first,
  prospectLastname: l.last,
  country: l.country,
  province: l.province,
  channel: l.channel,
  csName: EMP_NAME.get(l.cs) ?? l.cs,
  collectionDate: l.collection,
  group: l.group,
  latestStep: l.step,
  occupation: l.occupation,
  workplacePosition: l.position,
  latestAssignToName: EMP_NAME.get(l.assigned) ?? l.assigned,
  latestContactDate: l.latestContact,
});

/** the row the page keeps after `_sunLeadRows` — used for the server-rendered first paint */
const leadRow = (l: Lead): Record<string, string> => {
  const v = (x: string): string => (x === '' ? '-' : x);
  return {
    contact_date: l.contact, code: l.code, name: fullName(l), country: v(l.country), province: v(l.province), source: l.channel,
    cs: EMP_NAME.get(l.cs) ?? l.cs, payment_date: v(l.collection), group: l.group, last_step: l.step, job: l.occupation, position: l.position,
    latest_assigned: EMP_NAME.get(l.assigned) ?? l.assigned, latest_contact_date: l.latestContact,
  };
};

function leadList(f: Filters, search: string, page: number, perPage: number): { rows: Lead[]; paged: Page<Lead> } {
  const q = search.trim().toLowerCase();
  const rows = select(f)
    .filter((l) => !q || [fullName(l), l.code, l.country, l.occupation, EMP_NAME.get(l.cs) ?? '', EMP_NAME.get(l.assigned) ?? ''].join(' ').toLowerCase().includes(q))
    .sort((a, b) => b.contact.localeCompare(a.contact) || a.code.localeCompare(b.code));
  return { rows, paged: paged(rows, page, perPage) };
}

function leadTimeline(code: string): Record<string, unknown>[] {
  const l = leads().find((x) => x.code === code);
  if (!l) return [];
  return l.stints.flatMap((s) =>
    s.steps.map((x) => ({
      contactDate: l.contact, leadTxno: l.txno, procedureGroupCode: s.group, procedureName: x.name,
      assignToName: EMP_NAME.get(s.emp) ?? s.emp, changeDate: x.enter,
    })),
  );
}

// ---- overview KPI --------------------------------------------------------------------------------------------------------
function overview(f: Filters): Record<string, unknown> {
  const ls = select(f);
  const closed = ls.filter((l) => l.closed);
  const lost = ls.filter((l) => l.lost);
  const open = ls.length - closed.length - lost.length;
  const pct = (n: number): number => (ls.length ? round1((n * 100) / ls.length) : 0);
  const countries = countBy(ls, (l) => l.country);
  const top = topN(countries, 1)[0];
  return {
    status: 200,
    message: 'OK',
    result: {
      alllead: { total: ls.length },
      close_success: { total: closed.length, percent: pct(closed.length) },
      avgDaysToClose: { total: avg(closed.map((l) => daysBetween(l.contact, l.collection))) },
      country: { countryCount: countries.size, topCountry: top ? top[0] : '' },
      cs_close: { total: closed.length },
      milestones: [
        { label: 'ปิดการขายสำเร็จ', total: closed.length, percent: pct(closed.length) },
        { label: 'อยู่ระหว่างดำเนินการ', total: open, percent: pct(open) },
        { label: 'เสียโอกาส', total: lost.length, percent: pct(lost.length) },
      ],
    },
  };
}

// ---- master data ---------------------------------------------------------------------------------------------------------
const opt = (a: readonly string[]): { value: string; label: string }[] => a.map((x) => ({ value: x, label: x }));
function masterData(): Record<string, { value: string; label: string }[]> {
  const ls = leads();
  const used = (k: (l: Lead) => string): string[] => [...new Set(ls.map(k).filter(Boolean))].sort((a, b) => a.localeCompare(b, 'th'));
  return {
    years: opt(['2026', '2025']),
    months: MONTHS_ABBR.map((label, i) => ({ value: String(i + 1), label })),
    province: opt(used((l) => l.province)),
    occupation: opt(used((l) => l.occupation)),
    employee: EMPLOYEES.map((e) => ({ value: e.code, label: e.name })),
    country: opt(used((l) => l.country)),
    chanel: opt(used((l) => l.channel)),
    activity_group: GROUPS.map((g) => ({ value: g, label: g })),
    movementtype: MOVEMENTS,
  };
}
function monthsOf(year: string): { value: string; label: string }[] {
  const set = new Set(leads().filter((l) => l.contact.startsWith(year)).map((l) => Number(l.contact.slice(5, 7))));
  return MONTHS_ABBR.map((label, i) => ({ value: String(i + 1), label })).filter((m) => set.has(Number(m.value)));
}

// ---- the contract --------------------------------------------------------------------------------------------------------
function buildInitial(): DashboardInitial {
  const f = DEFAULT_FILTERS;
  const ls = select(f);
  const md = masterData();
  const overviewResult = (overview(f)['result'] as { alllead: { total: number }; country: { countryCount: number; topCountry: string } });
  const statusEmployees: Record<string, unknown[]> = {};
  for (const g of GROUPS) {
    statusEmployees[g] = performanceRows(f, g, false).map((r) => ({
      code: r['employeeCode'], name: r['employeeName'], total: r['totalLead'], pending: r['pendingCount'], pendingAvg: r['avgPendingDays'],
      slaDriftPending: r['slaDriftPending'], completed: r['completedCount'], completedAvg: r['avgCompletedDays'],
      slaDriftCompleted: r['slaDriftCompleted'], transition: r['transition'],
      steps: performanceSteps(f, g, String(r['employeeCode']), false).map((s) => ({
        name: s['procedureName'], total: s['totalLead'], pending: s['pendingCount'], pendingAvg: s['avgPendingDays'],
        slaDriftPending: s['slaDriftPending'], completed: s['completedCount'], completedAvg: s['avgCompletedDays'],
        slaDriftCompleted: s['slaDriftCompleted'],
      })),
    }));
  }
  const firstPage = leadList(f, '', 1, 20);
  return {
    trendJson: trendData(f),
    groupJson: groupData(f),
    csJson: barData(countBy(ls, (l) => EMP_NAME.get(l.cs) ?? l.cs), 8),
    topCountriesJson: barData(countBy(ls, (l) => l.country), 10),
    stepJson: barData(countBy(ls, (l) => l.step), 10),
    sourceFunnelJson: funnelData(ls, (l) => l.channel, 8),
    csFunnelJson: funnelData(ls, (l) => EMP_NAME.get(l.cs) ?? l.cs, 8),
    countryFunnelJson: funnelData(ls, (l) => l.country, 10),
    yearsJson: md['years'],
    monthsJson: md['months'],
    provinceJson: md['province'],
    occupationJson: md['occupation'],
    employeeJson: md['employee'],
    countryMasterJson: md['country'],
    chanelJson: md['chanel'],
    activityGroupJson: md['activity_group'],
    movementtypeJson: md['movementtype'],
    groupPanelsJson: groupPanels(f),
    pipelineTableJson: pipelineTable(f, 1),
    pipelinePeopleJson: {},
    statusKpisJson: statusKpis(f, false),
    statusEmployeesJson: statusEmployees,
    statusPopupJson: {},
    leadsTableJson: {
      rows: firstPage.paged.data.map(leadRow),
      totalRows: firstPage.paged.totalRecords,
      currentPage: 1,
      totalPages: firstPage.paged.totalPages,
      pageSize: 20,
    },
    kpiTotalFmt: fmtInt(overviewResult.alllead.total),
    kpiCountries: String(overviewResult.country.countryCount),
    kpiTopCountry: overviewResult.country.topCountry,
    sourceFunnelSubtitle: funnelSubtitle(ls),
    csFunnelSubtitle: funnelSubtitle(ls),
    countryFunnelSubtitle: funnelSubtitle(ls),
  };
}

export interface MockDashboardOptions {
  /** simulated network time per request (ms); the loading skeletons of the page need a little */
  delayMs?: number;
  /** base path of the dashboard service the two iframes call (default: the dev proxy path) */
  goldApi?: string;
}

const json = (body: unknown, status = 200): Response =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });

function wait(ms: number, signal?: AbortSignal | null): Promise<void> {
  const aborted = (): DOMException => new DOMException('The operation was aborted.', 'AbortError');
  if (signal?.aborted) return Promise.reject(aborted());
  if (ms <= 0) return Promise.resolve();
  return new Promise((resolve, reject) => {
    const t = setTimeout(() => {
      signal?.removeEventListener('abort', onAbort);
      resolve();
    }, ms);
    const onAbort = (): void => {
      clearTimeout(t);
      reject(aborted());
    };
    signal?.addEventListener('abort', onAbort, { once: true });
  });
}

/**
 * What the user changes while the page is open (the widget layout, calendar tasks, KPI rows) lives here, not in one backend
 * object: the page "reloads" itself (refresh button, language switch) by starting a new backend, and the real service would still
 * have the data.
 */
interface Shared {
  gold: GoldMock;
  widgets: unknown[];
}
let shared: Shared | null = null;
const state = (): Shared => (shared ??= { gold: createGoldMock(), widgets: [] });

/** forget everything the user changed (unit tests, the comparison harness) */
export function resetMockDashboard(): void {
  shared = null;
}

/** the widget layout and what the iframes save are kept in Datasource/journal.dashboard.json (mockup file server) and replayed at the next start */
export function createMockDashboard(options: MockDashboardOptions = {}): DashboardBackend {
  return journaledBackend('dashboard', makeMockDashboard, options);
}

function makeMockDashboard(options: MockDashboardOptions = {}): DashboardBackend {
  const delay = options.delayMs ?? 150;
  const goldApi = options.goldApi ?? '/dashboard-triplesale-service/api/v1';

  function answer(url: URL, init?: RequestInit): Response {
    // the dashboard service of the two iframes (calendar, KPI)
    if (url.pathname.startsWith(goldApi + '/')) {
      return state().gold.answer(url.pathname.slice(goldApi.length), url, init) ?? json({ error: 'not found', path: url.pathname }, 404);
    }
    const q = url.searchParams;
    const path = url.pathname.replace(/^\/dashboard/, '');
    const f = filtersOf(q);
    const num = (k: string, d: number): number => {
      const n = parseInt(q.get(k) ?? '', 10);
      return Number.isFinite(n) && n > 0 ? n : d;
    };
    const includeBlocked = q.get('includeBlocked') === 'true';
    const group = ((GROUPS as readonly string[]).includes(q.get('group') ?? '') ? q.get('group') : 'CS') as Group;

    switch (path) {
      case '/masterdata-all':
        return json(masterData());
      case '/months':
        return json(monthsOf(q.get('year') ?? '2026'));
      case '/masterdata-activitystep': {
        const g = ((GROUPS as readonly string[]).includes(q.get('activitygroup') ?? '') ? q.get('activitygroup') : 'CS') as Group;
        return json(STEPS[g].map((s) => ({ value: s.code, label: s.name })));
      }
      case '/widget-layout':
        if ((init?.method ?? 'GET').toUpperCase() === 'POST') {
          try {
            const body = JSON.parse(String(init?.body ?? '{}')) as { widgets?: unknown[] };
            state().widgets = Array.isArray(body.widgets) ? body.widgets : [];
            return json({ ok: true });
          } catch {
            return json({ ok: false, error: 'bad body' }, 400);
          }
        }
        return json({ widgets: state().widgets });
      case '/chart-single':
        return json(chart(q.get('chart') ?? '', f, includeBlocked));
      default:
    }

    const prefix = '/api/v1/sundashboard/';
    if (!path.startsWith(prefix)) return json({ error: 'not found', path }, 404);
    switch (path.slice(prefix.length)) {
      case 'overview':
        return json(overview(f));
      case 'pipeline':
        return json({ status: 200, result: pipelineTable(f, num('page', 1)) });
      case 'pipeline/detail':
        return json({ status: 200, ...pipelineDetail({ ...f, year: q.get('year') ?? f.year }, ((GROUPS as readonly string[]).includes(q.get('group') ?? '') ? q.get('group') : 'CS') as Group, q.get('month') ?? ALL, num('page', 1)) });
      case 'customer_step_groups':
        return json({ status: 200, result: customerStepGroups(f, q.get('search') ?? '', num('page', 1), num('perPage', 50)) });
      case 'customer_status_list':
        return json({ status: 200, result: customerStatusList(f, q.get('search') ?? '', num('page', 1), num('perPage', 50), q.get('activitystep') ?? ALL) });
      case 'employee_performance':
        return json({ status: 200, result: performanceRows(f, group, includeBlocked) });
      case 'employee_performance/steps':
        return json({ status: 200, result: performanceSteps(f, group, q.get('employeeCode') ?? '', includeBlocked) });
      case 'employee_performance/pending_list':
      case 'employee_performance/completed_list': {
        const pending = path.endsWith('pending_list');
        const ls = select({ ...f, employee: ALL }, { groupMode: 'none' });
        const rows = stintsOf(ls, group, includeBlocked)
          .filter((s) => s.stint.emp === (q.get('employee') ?? '') && s.open === pending)
          .sort((a, b) => b.days - a.days || a.lead.code.localeCompare(b.lead.code));
        return json({ status: 200, result: paged(rows.map((r) => personRow(r, pending ? 'pending' : 'completed')), num('page', 1), num('perPage', 50)) });
      }
      case 'lead_list': {
        const { paged: p } = leadList(f, q.get('search') ?? '', num('page', 1), num('perPage', 20));
        return json({
          status: 200, message: 'OK',
          result: { currentPage: p.currentPage, totalPages: p.totalPages, totalRecords: p.totalRecords, pageSize: p.pageSize, data: p.data.map(leadService) },
          meta: { page: p.currentPage, perPage: p.pageSize, total: p.totalRecords, totalPages: p.totalPages },
        });
      }
      case 'lead_list/detail': {
        const rows = leadTimeline(q.get('prospectCode') ?? '');
        return json({ status: 200, message: 'OK', result: rows, meta: { page: 1, perPage: rows.length, total: rows.length, totalPages: 1 } });
      }
      default:
        return json({ error: 'not found', path }, 404);
    }
  }

  /** `/dashboard/chart-single?chart=…` — the BFF answers the page-ready shape of each chart */
  function chart(name: string, f: Filters, includeBlocked: boolean): Record<string, unknown> {
    const ls = (): Lead[] => select(f);
    switch (name) {
      case 'trend': return { chart: name, data: trendData(f) };
      case 'group': return { chart: name, data: groupData(f) };
      case 'cs': return { chart: name, data: barData(countBy(ls(), (l) => EMP_NAME.get(l.cs) ?? l.cs), 8) };
      case 'topCountries': return { chart: name, data: barData(countBy(ls(), (l) => l.country), 10) };
      case 'step': return { chart: name, data: barData(countBy(ls(), (l) => l.step), 10) };
      case 'sourceFunnel': return { chart: name, data: funnelData(ls(), (l) => l.channel, 8), subtitle: funnelSubtitle(ls()) };
      case 'csFunnel': return { chart: name, data: funnelData(ls(), (l) => EMP_NAME.get(l.cs) ?? l.cs, 8), subtitle: funnelSubtitle(ls()) };
      case 'countryFunnel': return { chart: name, data: funnelData(ls(), (l) => l.country, 10), subtitle: funnelSubtitle(ls()) };
      case 'leadBreakdown': return { chart: name, data: leadBreakdown(f) };
      case 'groupPanels': return { chart: name, data: groupPanels(f) };
      case 'statusKpis': return { chart: name, data: statusKpis(f, includeBlocked) };
      default: return { chart: name, data: null, error: `unknown chart "${name}"` };
    }
  }

  return {
    async initial(_ggwBranch: string): Promise<DashboardInitial> {
      await wait(delay);
      return buildInitial();
    },
    async calendarFrame(ctx: FrameContext): Promise<CalendarFrameData> {
      await wait(delay);
      return state().gold.calendarValues(ctx.goldApi, ctx.employeeCode) as unknown as CalendarFrameData;
    },
    async kpiFrame(_ctx: FrameContext): Promise<string> {
      await wait(delay);
      return state().gold.kpiListDataJson();
    },
    async fetch(input: string, init?: RequestInit): Promise<Response> {
      await wait(delay, init?.signal);
      return answer(new URL(input, 'http://mock.local'), init);
    },
  };
}
