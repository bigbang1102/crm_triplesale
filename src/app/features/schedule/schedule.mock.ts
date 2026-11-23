/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * Deterministic fake backend of the Schedule page ("ปฏิทินงาน") — dev (`mock: true`), tests and the Java-vs-Angular comparison.
 *
 * It answers the BFF URLs of the Java page (`/board/schedule/fetch`, `/board/master/movement-types`, `/board/master/activity-groups`,
 * `/board/schedule-filter-state`, the work modal's `schedule/add` · `schedule/edit` · `employees` · `leads` …) in exactly the shapes the
 * servlets answered. The rows come from `@core/mock/schedule-seed` (the appointments and tasks of the leads of the shared cast: the lead
 * you meet in the calendar is lead `n` of every other page, and the items of the Activities page are in it too), so the numbers are
 * computed, not typed, and every part of the page agrees: the month cell, the week row, the board card and the list row of an item are the
 * same item, and filtering / searching / sorting / paging per column and editing really change what the page reads back.
 *
 * What the mock decides where the Java servlets only forward to triplesale-service (`GET /schedules`; the real rules live in the service —
 * listed in INTEGRATION.md): the filters (`movementTypeId`, `activityGroupId` — 0 / absent = every group —, `serviceId` = the sale group of
 * the lead's sale person, `assignToId` = the person responsible for the item, `appointmentStatus` / `taskStatus` = comma separated,
 * `search` = substring of subject, detail, customer, lead no., responsible person), the order (`sort`: date_desc | date_asc | order_asc
 * (id) | order_desc | status), 20 per page, the per-status columns of the board (`type=` + one status = one column, page n) and the
 * `summary` counters (of the filtered set).
 *
 * What the "HttpSession" of the mock remembers (sessionStorage in a browser, memory in Node): the filter state the page POSTs, and what the
 * user changed (added / edited items), so a reload of the page (F5, `location.reload()` after saving in the work modal) shows the same data.
 *
 * Mock-only switches (the comparison harness and the tests use them): `config` — `{ noProducts, failProducts, noGroups, failGroups, failCalendar,
 * failBoard, failList, failEdit, emptyAll, maxPerPage, delayMs, delayByView }` — from the options or from sessionStorage `ts.mock.schedule.config`;
 * a subject containing "~fail" is refused by the backend when added / edited (400 with a message, the convention of the work modal mocks).
 *
 * Framework-free on purpose (no Angular imports): the comparison harness loads this file in Node.
 */
import {
  PRODUCTS,
  SALE_GROUPS,
  SEED_LEAD_COUNT,
  SEED_TODAY,
  currentGroup,
  employeeByCode,
  employeeId,
  groupName,
  leadModel,
  leadTxNo,
  seedProspect,
  seedScheduleRows,
  teamOfLead,
  type ScheduleRow,
} from '@core/mock/schedule-seed';
import { SEED_EMPLOYEES, SEED_GROUPS, isKnownLead, leadIds, prospectIds } from '@core/mock/crm-seed';
import { handleWorkModalRequest, parseBffUrl, toResponse, type MockReply, type ScheduleEnvelope, type WorkModalData, type WorkModalEmployee } from '@shared/work-modal/work-modal.mock';
import type { ScheduleBackend, ScheduleInitial } from './schedule-backend';
import { msg } from '@core/mock/reference';

export const MOCK_TODAY = SEED_TODAY;

export interface MockScheduleConfig {
  /** `/board/master/movement-types` answers no product (the page hides the product / group dropdowns) */
  noProducts?: boolean;
  /** `/board/master/movement-types` answers 500 (the page shows its error screen) */
  failProducts?: boolean;
  /** `/board/master/activity-groups` answers no group (the page hides the group dropdown) */
  noGroups?: boolean;
  /** `/board/master/activity-groups` answers 500 */
  failGroups?: boolean;
  /** `/board/schedule/fetch` of the calendar views (month / week / day / year) answers 500 */
  failCalendar?: boolean;
  /** … of the board */
  failBoard?: boolean;
  /** … of the list */
  failList?: boolean;
  /** `PATCH /board/schedule/edit` answers 500 (the board's move fails) */
  failEdit?: boolean;
  /** `/board/schedule/fetch` answers no item at all */
  emptyAll?: boolean;
  /** the server never gives more than this many items per page, whatever `perPage` asks */
  maxPerPage?: number;
  /** ms every answer is delayed, instead of `delayMs` of the options */
  delayMs?: number;
  /** more ms for the answers of one view of `/board/schedule/fetch` (`{ board: 4000 }`): a slow list / board / week while the rest answers at once */
  delayByView?: Record<string, number>;
}

export interface MockScheduleOptions {
  /** ms every answer is delayed (default 150: a network) */
  delayMs?: number;
  config?: MockScheduleConfig;
}

/* ================================================================================== state (what the Java HttpSession / the backend remember) */
export interface MockScheduleState {
  /** item id → the fields the user changed (PATCH) */
  patches: Record<number, Partial<ScheduleRow>>;
  /** the items the user added (POST), with their ids */
  added: ScheduleRow[];
  /** the JSON text POSTed to /board/schedule-filter-state (HttpSession["sc_filter_state"]) */
  filterState: string | null;
}
const STATE_KEY = 'ts.mock.schedule.state';
const CONFIG_KEY = 'ts.mock.schedule.config';
const ADDED_BASE = 7_000_000;
const mem = new Map<string, string>(); // no sessionStorage in Node
const store = {
  get: (k: string): string | null => {
    try {
      if (typeof sessionStorage !== 'undefined') return sessionStorage.getItem(k);
    } catch {
      /* storage blocked */
    }
    return mem.get(k) ?? null;
  },
  set: (k: string, v: string | null): void => {
    try {
      if (typeof sessionStorage !== 'undefined') {
        if (v === null) sessionStorage.removeItem(k);
        else sessionStorage.setItem(k, v);
        return;
      }
    } catch {
      /* storage blocked: keep it in memory */
    }
    if (v === null) mem.delete(k);
    else mem.set(k, v);
  },
};
function loadState(): MockScheduleState {
  try {
    const raw = store.get(STATE_KEY);
    if (raw) return { patches: {}, added: [], filterState: null, ...(JSON.parse(raw) as Partial<MockScheduleState>) };
  } catch {
    /* damaged: start again */
  }
  return { patches: {}, added: [], filterState: null };
}
const saveState = (s: MockScheduleState): void => store.set(STATE_KEY, JSON.stringify(s));
function readConfig(options: MockScheduleOptions): MockScheduleConfig {
  if (options.config) return options.config;
  try {
    const raw = store.get(CONFIG_KEY);
    return raw ? (JSON.parse(raw) as MockScheduleConfig) : {};
  } catch {
    return {};
  }
}

/** back to the cast as seeded (tests, the comparison harness) */
export function resetMockSchedule(): void {
  mem.clear();
  store.set(STATE_KEY, null);
  store.set(CONFIG_KEY, null);
}

/* ================================================================================== the rows */
const pad = (n: number, w = 2): string => String(n).padStart(w, '0');
const APPT_STATUSES = ['scheduled', 're-schedule', 'success', 'cancel'];
const TASK_STATUSES = ['doing', 'success', 'cancel'];
const statusesOf = (kind: ScheduleRow['kind']): string[] => (kind === 'APPOINTMENT' ? APPT_STATUSES : TASK_STATUSES);

function allRows(state: MockScheduleState): ScheduleRow[] {
  return [...seedScheduleRows(), ...state.added].map((r) => (state.patches[r.id] ? { ...r, ...state.patches[r.id] } : r));
}

/** one row as the REST service answers it (`result.items[]` / `…list.appointment.items[]`) */
function itemOf(r: ScheduleRow): Record<string, unknown> {
  const lead = leadModel(r.leadId);
  const who = r.assigneeCode ? employeeByCode(r.assigneeCode) : undefined;
  return {
    id: r.id,
    scheduleType: r.kind === 'TASK' ? 'task' : 'appointment',
    topic: r.subject,
    detail: r.detail,
    remark: r.remark,
    appointmentDate: r.date,
    appointmentTime: r.time,
    allDay: r.allDay,
    status: r.status,
    createTime: r.createTime,
    activityGroupId: r.groupId || null,
    activityGroupName: r.groupId ? groupName(r.groupId) : '',
    activityStepName: r.stepName,
    prospectName: lead.seed.customerName,
    prospectImage: '',
    leadId: r.leadId,
    leadTxNo: leadTxNo(r.leadId),
    txNo: `SC-2026-${pad(Math.abs(r.id - 5_000_000), 6)}`,
    taskAssigneeId: who ? employeeId(who.code) : null,
    taskAssigneeCode: who?.code ?? '',
    taskAssigneeName: who?.name ?? '',
    productName: lead.product.name,
    serviceName: teamOfLead(lead).name,
    movementTypeId: lead.product.id,
    movementTypeName: lead.product.name,
    usesWorkflowStep: lead.product.usesWorkflowStep,
  };
}

/* ---------------------------------------------------------------------------------- the query */
interface Query {
  viewMode: string;
  type?: string;
  dateFrom?: string;
  dateTo?: string;
  sort: string;
  page: number;
  perPage: number;
  movementTypeId?: number;
  activityGroupId?: number;
  serviceId?: number;
  assignToId?: number;
  appointmentStatus?: string[];
  taskStatus?: string[];
  search?: string;
}
const num = (v: string | null): number | undefined => {
  const n = Number((v ?? '').trim());
  return v != null && v.trim() !== '' && Number.isFinite(n) ? n : undefined;
};
const list = (v: string | null): string[] | undefined => {
  const out = (v ?? '').split(',').map((s) => s.trim().toLowerCase()).filter(Boolean);
  return out.length ? out : undefined;
};
function queryOf(p: URLSearchParams, maxPerPage: number): Query {
  return {
    viewMode: (p.get('viewMode') ?? '').toLowerCase(),
    type: p.get('type')?.toLowerCase() || undefined,
    dateFrom: p.get('dateFrom') || undefined,
    dateTo: p.get('dateTo') || undefined,
    sort: p.get('sort') || 'date_desc',
    page: Math.max(1, num(p.get('page')) ?? 1),
    perPage: Math.min(Math.max(1, num(p.get('perPage')) ?? 20), maxPerPage),
    movementTypeId: num(p.get('movementTypeId')),
    activityGroupId: num(p.get('activityGroupId')),
    serviceId: num(p.get('serviceId')),
    assignToId: num(p.get('assignToId')),
    appointmentStatus: list(p.get('appointmentStatus')),
    taskStatus: list(p.get('taskStatus')),
    search: p.get('search')?.trim().toLowerCase() || undefined,
  };
}

/** the filters of the page except the status check boxes */
function passes(r: ScheduleRow, q: Query): boolean {
  const lead = leadModel(r.leadId);
  if (q.movementTypeId != null && lead.product.id !== q.movementTypeId) return false;
  if (q.activityGroupId && r.groupId !== q.activityGroupId) return false;
  if (q.serviceId != null && teamOfLead(lead).id !== q.serviceId) return false;
  if (q.assignToId != null && (!r.assigneeCode || employeeId(r.assigneeCode) !== q.assignToId)) return false;
  if (q.search) {
    const who = r.assigneeCode ? (employeeByCode(r.assigneeCode)?.name ?? '') : '';
    const hay = [r.subject, r.detail, lead.seed.customerName, leadTxNo(r.leadId), who].join('\n').toLowerCase();
    if (!hay.includes(q.search)) return false;
  }
  return true;
}
const statusPasses = (r: ScheduleRow, q: Query): boolean => {
  const allowed = r.kind === 'APPOINTMENT' ? q.appointmentStatus : q.taskStatus;
  return !allowed || allowed.includes(r.status);
};

const when = (r: ScheduleRow): string => `${r.date} ${r.time ?? '00:00:00'}`;
const rank = (r: ScheduleRow): number => statusesOf(r.kind).indexOf(r.status);
function sorter(sort: string): (a: ScheduleRow, b: ScheduleRow) => number {
  switch (sort) {
    case 'date_asc':
      return (a, b) => when(a).localeCompare(when(b)) || a.id - b.id;
    case 'order_asc':
      return (a, b) => a.id - b.id;
    case 'order_desc':
      return (a, b) => b.id - a.id;
    case 'status':
      return (a, b) => rank(a) - rank(b) || when(b).localeCompare(when(a)) || a.id - b.id;
    default:
      return (a, b) => when(b).localeCompare(when(a)) || a.id - b.id;
  }
}

function pageOf(rows: ScheduleRow[], q: Query): { items: Record<string, unknown>[]; meta: { page: number; perPage: number; total: number; totalPages: number } } {
  const totalPages = Math.max(1, Math.ceil(rows.length / q.perPage));
  return {
    items: rows.slice((q.page - 1) * q.perPage, q.page * q.perPage).map(itemOf),
    meta: { page: q.page, perPage: q.perPage, total: rows.length, totalPages },
  };
}

const envelope = (result: unknown): MockReply => ({ status: 200, body: { status: 200, message: 'success', result } });
const failure = (status: number, message: string): MockReply => ({ status, body: { status, message } });

/** `GET /board/schedule/fetch` — ScheduleFetchServlet → triplesale-service GET /schedules */
function scheduleFetch(p: URLSearchParams, state: MockScheduleState, cfg: MockScheduleConfig): MockReply {
  const q = queryOf(p, cfg.maxPerPage ?? Infinity);
  const isList = q.viewMode === 'list' || q.viewMode === 'board';
  if (!q.viewMode || (!isList && (!q.dateFrom || !q.dateTo))) return failure(400, `missing params: viewMode${isList ? '' : ', dateFrom, dateTo'}`);
  if ((isList ? (q.viewMode === 'list' ? cfg.failList : cfg.failBoard) : cfg.failCalendar)) return failure(500, msg('Internal Server Error (จำลอง)'));
  const rows = cfg.emptyAll ? [] : allRows(state).filter((r) => passes(r, q));
  const filtered = rows.filter((r) => statusPasses(r, q));
  const sort = sorter(q.sort);

  if (!isList) {
    if (q.viewMode === 'year') {
      const marks = [...new Set(filtered.filter((r) => r.date >= q.dateFrom! && r.date <= q.dateTo!).map((r) => r.date))].sort();
      return envelope({ viewMode: 'year', marks });
    }
    const items = filtered.filter((r) => r.date >= q.dateFrom! && r.date <= q.dateTo!).sort((a, b) => when(a).localeCompare(when(b)) || a.id - b.id);
    return envelope({ viewMode: q.viewMode, items: items.map(itemOf) });
  }

  const count = (kind: ScheduleRow['kind'], status: string): number => filtered.filter((r) => r.kind === kind && r.status === status).length;
  const summary = {
    appointment: Object.fromEntries(APPT_STATUSES.map((s) => [s, count('APPOINTMENT', s)])),
    task: Object.fromEntries(TASK_STATUSES.map((s) => [s, count('TASK', s)])),
  };
  if (q.viewMode === 'board') {
    // one group per status column; a request with `type` (+ the one status) is the next page of one column
    const column = (kind: ScheduleRow['kind'], status: string) => {
      const mine = rows.filter((r) => r.kind === kind && r.status === status && (q.type ? true : statusPasses(r, q))).sort(sort);
      const pg = pageOf(mine, q);
      return { status, count: mine.length, items: pg.items, meta: pg.meta };
    };
    const groups = (kind: ScheduleRow['kind'], wanted: string[] | undefined) => statusesOf(kind).filter((s) => !wanted || wanted.includes(s)).map((s) => column(kind, s));
    return envelope({
      viewMode: 'board',
      summary,
      appointment: q.type === 'task' ? [] : groups('APPOINTMENT', q.appointmentStatus),
      task: q.type === 'appointment' ? [] : groups('TASK', q.taskStatus),
    });
  }
  const section = (kind: ScheduleRow['kind']) => {
    const pg = pageOf(filtered.filter((r) => r.kind === kind).sort(sort), q);
    return { items: pg.items, meta: pg.meta };
  };
  const out: Record<string, unknown> = {};
  if (q.type !== 'task') out['appointment'] = section('APPOINTMENT');
  if (q.type !== 'appointment') out['task'] = section('TASK');
  return envelope({ viewMode: 'list', summary, list: out });
}

/* ================================================================================== the data of the work modal */
const EMPLOYEES: WorkModalEmployee[] = SEED_EMPLOYEES.map((e) => ({ id: employeeId(e.code), code: e.code, name: e.name, attachFile: '' }));
const unknownLead = (n: number): boolean => !isKnownLead(n);
const intParam = (p: URLSearchParams, name: string, d: number): number => {
  const v = p.get(name)?.trim();
  if (!v) return d;
  const n = parseInt(v, 10);
  return Number.isFinite(n) ? n : d;
};

function workModalData(state: MockScheduleState, cfg: MockScheduleConfig, commit: () => void): WorkModalData {
  const bad = (message: string): ScheduleEnvelope => ({ status: 400, message, error: { code: 400, message } });
  return {
    employees: (saleGroupId) => (saleGroupId ? EMPLOYEES.filter((e) => String(SALE_GROUPS.find((g) => g.name === employeeByCode(e.code)!.team)!.id) === saleGroupId) : EMPLOYEES),
    employeesByActivityGroup: (gid) => {
      const idx = SEED_GROUPS.findIndex((g) => String(g.id) === gid);
      // who works a group: every other employee, shifted by the group (at least four per group)
      return idx < 0 ? [] : EMPLOYEES.filter((_, i) => (i + idx) % 2 === 0);
    },
    activityGroups: (mt) => PRODUCTS.find((p) => String(p.id) === mt)?.groups.map((g) => ({ id: g.id, code: g.code, name: g.name })) ?? null,
    searchLeads: (p) => {
      const q = (p.get('search') ?? '').trim().toLowerCase();
      const mt = p.get('movementTypeId');
      const ag = Number(p.get('activityGroupId') ?? 0);
      const emp = p.get('employeeId');
      const per = intParam(p, 'perPage', 20);
      const page = intParam(p, 'page', 1);
      const hits: number[] = [];
      for (const n of leadIds()) {
        const l = leadModel(n);
        if (l.closed || (mt && String(l.product.id) !== mt) || (ag > 0 && currentGroup(l)?.id !== ag)) continue;
        if (emp && !(l.ownerCode && String(employeeId(l.ownerCode)) === emp)) continue;
        if (q && ![l.seed.customerName, l.seed.code, seedProspect(l.seed.prospectId).code].some((s) => s.toLowerCase().includes(q))) continue;
        hits.push(n);
      }
      const items = hits.slice((page - 1) * per, page * per).map((n) => {
        const l = leadModel(n);
        const g = currentGroup(l);
        const o = l.ownerCode ? employeeByCode(l.ownerCode) : undefined;
        return {
          id: n,
          prospectCode: seedProspect(l.seed.prospectId).code,
          prospectName: l.seed.customerName,
          saleGroupName: teamOfLead(l).name,
          employeeId: o ? employeeId(o.code) : null,
          employeeCode: o?.code ?? '',
          employeeName: o?.name ?? '',
          txNo: leadTxNo(n),
          forwardStatus: g ? `${g.name} - ${l.stepName}` : l.stepName,
          activityGroupId: g?.id ?? 0,
          activityGroupName: g?.name ?? '',
          movementTypeId: l.product.id,
        };
      });
      return { items, page, perPage: per, total: hits.length, totalPages: Math.ceil(hits.length / per) };
    },
    leadStep: (id, agid) => {
      const n = Number(id);
      if (unknownLead(n)) return { status: 404, body: { status: 404, message: 'ไม่พบข้อมูล Lead', error: { code: 404, message: 'ไม่พบข้อมูล Lead' } } };
      const l = leadModel(n);
      const g = (agid && l.groups.find((x) => String(x.id) === agid)) || currentGroup(l);
      // LeadDetailServlet answers the `result` of GET /leads/{id} itself (no envelope)
      return { status: 200, body: { id: n, leadStatus: l.closed ? 'SUCCESS' : 'ACTIVE', currentStep: { procedureGroupId: g?.id ?? 0, procedureGroupName: g?.name ?? '', procedureName: l.stepName } } };
    },
    addSchedule: (b) => {
      const n = Number(b['leadId']);
      if (unknownLead(n)) return bad(msg('ไม่พบ Lead ที่ระบุ'));
      if (!String(b['subject'] ?? '').trim()) return bad(msg('subject ต้องไม่ว่าง'));
      if (String(b['subject']).includes('~fail')) return bad(msg('จำลองข้อผิดพลาดจาก backend (subject มี ~fail)'));
      if (!String(b['detail'] ?? '').trim()) return bad(msg('detail ต้องไม่ว่าง'));
      if (!/^\d{4}-\d{2}-\d{2}$/.test(String(b['date'] ?? ''))) return bad(msg('date รูปแบบไม่ถูกต้อง (yyyy-MM-dd)'));
      if (b['type'] !== 'APPOINTMENT' && b['type'] !== 'TASK') return bad(msg('type ต้องเป็น APPOINTMENT หรือ TASK'));
      const lead = leadModel(n);
      const g = currentGroup(lead);
      if (g && !(Number(b['procedureGroupId']) > 0)) return bad(msg('ต้องระบุ procedureGroupId เพราะ Lead นี้มีขั้นตอน workflow ที่ทำงานอยู่'));
      const id = ADDED_BASE + state.added.length + 1;
      const kind = b['type'] as ScheduleRow['kind'];
      const time = b['allDay'] || !b['time'] ? null : /^\d\d:\d\d$/.test(String(b['time'])) ? `${String(b['time'])}:00` : String(b['time']);
      const who = EMPLOYEES.find((e) => e.id === Number(b['taskAssigneeId']));
      state.added.push({
        id,
        leadId: n,
        kind,
        subject: String(b['subject']).trim(),
        detail: String(b['detail']).trim(),
        date: String(b['date']),
        time,
        allDay: !!b['allDay'],
        status: String(b['status'] ?? (kind === 'TASK' ? 'doing' : 'scheduled')),
        groupId: Number(b['procedureGroupId']) || (g?.id ?? 0),
        stepName: lead.stepName,
        assigneeCode: who?.code ?? null,
        remark: String(b['remark'] ?? ''),
        createTime: `${SEED_TODAY} 09:30:00`,
      });
      commit();
      return { status: 201, message: 'success', result: { id } };
    },
    editSchedule: (id, b) => {
      if (cfg.failEdit) return { status: 500, message: 'Internal Server Error (จำลอง)', error: { code: 500, message: 'Internal Server Error (จำลอง)' } };
      if (String(b['subject'] ?? '').includes('~fail')) return bad(msg('จำลองข้อผิดพลาดจาก backend (subject มี ~fail)'));
      if (!allRows(state).some((r) => r.id === id)) return { status: 404, message: 'ไม่พบนัดหมาย/งาน', error: { code: 404, message: 'ไม่พบนัดหมาย/งาน' } };
      const patch: Partial<ScheduleRow> = { ...(state.patches[id] ?? {}) };
      if (b['subject'] != null) patch.subject = String(b['subject']);
      if (b['detail'] != null) patch.detail = String(b['detail']);
      if (b['date'] != null) patch.date = String(b['date']);
      if ('time' in b) patch.time = b['time'] ? (/^\d\d:\d\d$/.test(String(b['time'])) ? `${String(b['time'])}:00` : String(b['time'])) : null;
      if (b['allDay'] != null) patch.allDay = !!b['allDay'];
      if (b['status'] != null) patch.status = String(b['status']);
      if (b['remark'] != null) patch.remark = String(b['remark']);
      if (b['taskAssigneeId'] != null) patch.assigneeCode = EMPLOYEES.find((e) => e.id === Number(b['taskAssigneeId']))?.code ?? null;
      if (patch.allDay) patch.time = null;
      state.patches[id] = patch;
      const row = state.added.find((r) => r.id === id);
      if (row) {
        Object.assign(row, patch);
        delete state.patches[id];
      }
      commit();
      return { status: 200, message: 'success' };
    },
  };
}

/* ================================================================================== the BFF */
const json = (status: number, body: unknown): MockReply => ({ status, body });

/** the servlet layer: BFF URL → answer */
export function handleScheduleRequest(method: string, input: string, rawBody: string | undefined, state: MockScheduleState, cfg: MockScheduleConfig, commit: () => void): MockReply {
  const { path, params } = parseBffUrl(input);
  const m = method.toUpperCase();
  switch (path) {
    case 'board/schedule/fetch':
      return m === 'GET' ? scheduleFetch(params, state, cfg) : json(405, { error: 'method not allowed' });
    case 'board/master/movement-types': {
      if (cfg.failProducts) return failure(500, msg('Internal Server Error (จำลอง)'));
      return envelope({ items: cfg.noProducts ? [] : PRODUCTS.map((p) => ({ id: p.id, code: p.code, name: p.name, usesWorkflowStep: p.usesWorkflowStep })) });
    }
    case 'board/master/activity-groups': {
      if (cfg.failGroups) return json(500, {});
      if (cfg.noGroups) return envelope({ items: [] });
      break; // the work modal's servlet layer answers it (the 400 / 404 of MasterActivityGroupsServlet)
    }
    case 'board/schedule-filter-state': {
      if (m === 'GET') return json(200, state.filterState ?? 'null');
      if (m === 'POST') {
        const body = (rawBody ?? '').trim();
        if (body) {
          state.filterState = body;
          commit();
        }
        return json(204, '');
      }
      return json(405, { error: 'method not allowed' });
    }
    case 'board/sale-groups':
      return json(200, SALE_GROUPS.map((g) => ({ id: g.id, code: g.code, name: g.name })));
    case 'board/prospect-list': {
      const q = (params.get('searchText') ?? '').trim().toLowerCase();
      const per = intParam(params, 'perPage', 8);
      const items: any[] = [];
      for (const i of prospectIds()) {
        if (items.length >= per) break;
        const p = seedProspect(i);
        if (q && ![p.code, p.fullName, p.phone].some((s) => s.toLowerCase().includes(q))) continue;
        items.push({ id: p.id, code: p.code, name: p.fullName, phone: p.phone.replace(/\D/g, ''), addr: p.province, avatar: '' });
      }
      return envelope({ items, meta: { page: 1, perPage: per, total: items.length, totalPages: 1 } });
    }
    default:
      break;
  }
  const r = handleWorkModalRequest(m, path, params, rawBody, workModalData(state, cfg, commit));
  return r ?? json(404, { error: 'not mocked: ' + path });
}

/** The BFF contract of the page, answered from the seed (`mock: true`). */
export function createMockSchedule(options: MockScheduleOptions = {}): ScheduleBackend {
  const state = loadState();
  const commit = (): void => saveState(state);
  return {
    async initial(): Promise<ScheduleInitial> {
      let saved: unknown = null;
      try {
        saved = state.filterState ? JSON.parse(state.filterState) : null;
      } catch {
        saved = null;
      }
      return { savedFilterJson: saved };
    },
    async fetch(input: string, init?: RequestInit): Promise<Response> {
      const cfg = readConfig(options);
      let wait = cfg.delayMs ?? options.delayMs ?? 150;
      if (cfg.delayByView) {
        const u = parseBffUrl(String(input));
        if (u.path === 'board/schedule/fetch') wait += cfg.delayByView[(u.params.get('viewMode') ?? '').toLowerCase()] ?? 0;
      }
      if (wait > 0) await new Promise((r) => setTimeout(r, wait));
      const raw = typeof init?.body === 'string' ? init.body : undefined;
      const reply = handleScheduleRequest(init?.method ?? 'GET', String(input), raw, state, cfg, commit);
      if (reply.status === 204) return new Response(null, { status: 204 });
      return toResponse(reply);
    },
  };
}
