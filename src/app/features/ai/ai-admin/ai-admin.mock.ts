import { quotaStatusOf, shiftMonth } from './ai-admin.logic';
import {
  MOCK_MODELS,
  MOCK_ORG,
  MOCK_TOOLS,
  buildUsage,
  type MockCompany,
  type MockDepartment,
  type MockEmployee,
  type MockUsage,
} from './ai-admin.mock.data';
import type {
  AdminCaps,
  AuditEvent,
  AuditRow,
  DailyPoint,
  DetailChild,
  QuotaInfo,
  QuotaLevel,
  QuotaRow,
  ScopeLevel,
  TokenTotals,
} from './ai-admin.types';

/**
 * Framework-free answer of `admin-tokens` from a small deterministic org + usage dataset: used by unit tests and by the mockup web
 * when `config.features.aiHubService` is off. It is NEVER a fallback for a real service error (the api only picks it up by config).
 */

export interface MockReply {
  status: number;
  body: unknown;
  /** `audit-export`: the CSV text instead of JSON */
  csv?: string;
}

type Params = Readonly<Record<string, string | undefined>>;

interface Flat extends MockUsage {
  company: MockCompany;
  dept: MockDepartment;
  emp: MockEmployee;
  tokens: number;
}

interface QuotaRecord {
  level: QuotaLevel;
  key: string;
  company: string;
  department: string;
  monthlyTokens: number;
  warnPercent: number;
  enabled: boolean;
  note: string;
  updatedBy: string;
  updatedAt: string;
}

const AUDIT_DEFAULT_LIMIT = 50;
const AUDIT_MAX_LIMIT = 200;
const EVENT_LIMIT = 20;
const DEFAULT_WARN = 80;
const LEVEL_OF: Record<QuotaLevel, ScopeLevel> = {
  COMPANY: 'company',
  DEPARTMENT: 'department',
  USER: 'user',
};

let cacheToday = '';
let cacheRows: Flat[] = [];
let quotas: QuotaRecord[] = seedQuotas();
let events: AuditEvent[] = [];

/** back to the seed (tests) */
export function resetAdminMock(): void {
  cacheToday = '';
  quotas = seedQuotas();
  events = [];
}

function seedQuotas(): QuotaRecord[] {
  const base = {
    warnPercent: DEFAULT_WARN,
    enabled: true,
    note: '',
    updatedBy: 'system',
    updatedAt: '2026-11-01T09:00:00+07:00',
  };
  return [
    {
      ...base,
      level: 'COMPANY',
      key: 'A1',
      company: 'A1',
      department: '',
      monthlyTokens: 9_000_000,
    },
    {
      ...base,
      level: 'DEPARTMENT',
      key: 'A1-SALES',
      company: 'A1',
      department: 'A1-SALES',
      monthlyTokens: 2_000_000,
    },
    {
      ...base,
      level: 'USER',
      key: 'A1-Esales1',
      company: 'A1',
      department: 'A1-SALES',
      monthlyTokens: 400_000,
    },
    {
      ...base,
      level: 'COMPANY',
      key: 'B2',
      company: 'B2',
      department: '',
      monthlyTokens: 5_000_000,
      warnPercent: 70,
    },
  ];
}

/** every usage row joined with its org entities */
function flat(today: string): Flat[] {
  if (cacheToday === today) return cacheRows;
  const employees = new Map<
    string,
    { company: MockCompany; dept: MockDepartment; emp: MockEmployee }
  >();
  for (const company of MOCK_ORG) {
    for (const dept of company.departments)
      for (const emp of dept.employees) employees.set(emp.id, { company, dept, emp });
  }
  cacheRows = buildUsage(today).flatMap((u) => {
    const who = employees.get(u.employeeId);
    return who ? [{ ...u, ...who, tokens: u.inputTokens + u.outputTokens }] : [];
  });
  cacheToday = today;
  return cacheRows;
}

function sum(rows: readonly Flat[]): TokenTotals {
  const inputTokens = rows.reduce((s, r) => s + r.inputTokens, 0);
  const outputTokens = rows.reduce((s, r) => s + r.outputTokens, 0);
  return {
    tokens: inputTokens + outputTokens,
    inputTokens,
    outputTokens,
    runs: rows.length,
    users: new Set(rows.map((r) => r.emp.id)).size,
  };
}

function matches(row: Flat, level: ScopeLevel, key: string): boolean {
  if (level === 'company') return row.company.code === key;
  if (level === 'department') return row.dept.code === key;
  return row.emp.id === key;
}

function quotaInfo(level: QuotaLevel, key: string, used: number): QuotaInfo | null {
  const rec = quotas.find((q) => q.level === level && q.key === key);
  if (!rec || rec.monthlyTokens <= 0) return null;
  const percent = Math.round((used / rec.monthlyTokens) * 1000) / 10;
  return {
    limit: rec.monthlyTokens,
    used,
    remaining: Math.max(0, rec.monthlyTokens - used),
    percent,
    warnPercent: rec.warnPercent,
    enabled: rec.enabled,
    level,
  };
}

function levelOfScope(level: ScopeLevel): QuotaLevel {
  return level === 'company' ? 'COMPANY' : level === 'department' ? 'DEPARTMENT' : 'USER';
}

function dailyOf(rows: readonly Flat[], month: string, today: string): DailyPoint[] {
  const lastDay = new Date(
    Date.UTC(Number(month.slice(0, 4)), Number(month.slice(5, 7)), 0),
  ).getUTCDate();
  const points: DailyPoint[] = [];
  for (let d = 1; d <= lastDay; d += 1) {
    const date = `${month}-${String(d).padStart(2, '0')}`;
    if (date > today) break;
    const day = sum(rows.filter((r) => r.date === date));
    points.push({
      date,
      tokens: day.tokens,
      inputTokens: day.inputTokens,
      outputTokens: day.outputTokens,
    });
  }
  return points;
}

const fail = (status: number, error: string): MockReply => ({ status, body: { ok: false, error } });
const ok = (body: Record<string, unknown>): MockReply => ({
  status: 200,
  body: { ok: true, ...body },
});

/** the entry: `params` = the form fields (`action`, `month`, …), `caps` = what the identity headers allow, `today` = `yyyy-MM-dd` */
export function adminTokensMock(
  params: Params,
  caps: AdminCaps,
  today = new Date().toISOString().slice(0, 10),
): MockReply {
  const month = params['month'] || today.slice(0, 7);
  const scoped = scopeToCaller(params, caps);
  switch (params['action']) {
    case 'overview':
      return overview(month, scoped, caps, today);
    case 'detail':
      return detail(month, scoped, caps, today);
    case 'quota-list':
      return quotaList(month, params['level'], caps, today);
    case 'quota-save':
      return quotaSave(params, caps);
    case 'quota-delete':
      return quotaDelete(params, caps);
    case 'audit':
    case 'audit-export':
      return audit(params, caps, today);
    default:
      return fail(400, 'ไม่รู้จักคำสั่งนี้');
  }
}

/** without `allBranch` the company is forced to the caller's own */
function scopeToCaller(params: Params, caps: AdminCaps): Params {
  return caps.allBranch ? params : { ...params, company: caps.branchCode };
}

function overview(month: string, p: Params, caps: AdminCaps, today: string): MockReply {
  const level = (p['level'] ?? 'company') as ScopeLevel;
  const rows = flat(today).filter((r) => r.date.startsWith(month) && visible(r, caps));
  const scopeRows = rows.filter(
    (r) =>
      (level === 'company' || r.company.code === p['company']) &&
      (level !== 'user' || r.dept.code === p['department']),
  );
  const entries = entriesOf(level, p, caps);
  const total = sum(scopeRows).tokens;
  const outRows = entries
    .map((e) => {
      const mine = scopeRows.filter((r) => matches(r, level, e.key));
      const t = sum(mine);
      return {
        key: e.key,
        name: e.name,
        ...t,
        headcount: e.headcount,
        share: total > 0 ? Math.round((t.tokens / total) * 1000) / 10 : 0,
        quota: quotaInfo(levelOfScope(level), e.key, t.tokens),
        ...(e.username ? { username: e.username } : {}),
      };
    })
    .sort((a, b) => b.tokens - a.tokens);
  const company = MOCK_ORG.find((c) => c.code === p['company']);
  const dept = company?.departments.find((d) => d.code === p['department']);
  const dailyByRow = Object.fromEntries(
    entries.map((e) => [
      e.key,
      dailyOf(
        scopeRows.filter((r) => matches(r, level, e.key)),
        month,
        today,
      ).map(({ date, tokens }) => ({ date, tokens })),
    ]),
  );
  return ok({
    month,
    level,
    company: company && level !== 'company' ? { code: company.code, name: company.name } : null,
    department: dept && level === 'user' ? { code: dept.code, name: dept.name } : null,
    scope: {
      label: dept?.name ?? company?.name ?? 'ทุกบริษัท',
      ...sum(scopeRows),
      headcount: entries.reduce((s, e) => s + e.headcount, 0),
      quota: scopeQuota(level, p, sum(scopeRows).tokens),
    },
    rows: outRows,
    daily: dailyOf(scopeRows, month, today),
    dailyByRow,
    months: Array.from({ length: 6 }, (_, i) => shiftMonth(month, i - 5)).map((m) => ({
      month: m,
      tokens: sum(
        flat(today).filter(
          (r) =>
            r.date.startsWith(m) &&
            visible(r, caps) &&
            (level === 'company' || r.company.code === p['company']) &&
            (level !== 'user' || r.dept.code === p['department']),
        ),
      ).tokens,
    })),
  });
}

function scopeQuota(level: ScopeLevel, p: Params, used: number): QuotaInfo | null {
  if (level === 'department') return quotaInfo('COMPANY', p['company'] ?? '', used);
  if (level === 'user') return quotaInfo('DEPARTMENT', p['department'] ?? '', used);
  return null;
}

function visible(row: Flat, caps: AdminCaps): boolean {
  return caps.allBranch || row.company.code === caps.branchCode;
}

interface Entry {
  key: string;
  name: string;
  headcount: number;
  username?: string;
}

function entriesOf(level: ScopeLevel, p: Params, caps: AdminCaps): Entry[] {
  const companies = MOCK_ORG.filter((c) => caps.allBranch || c.code === caps.branchCode);
  if (level === 'company')
    return companies.map((c) => ({
      key: c.code,
      name: c.name,
      headcount: c.departments.reduce((s, d) => s + d.employees.length, 0),
    }));
  const company = companies.find((c) => c.code === p['company']);
  if (level === 'department')
    return (company?.departments ?? []).map((d) => ({
      key: d.code,
      name: d.name,
      headcount: d.employees.length,
    }));
  const dept = company?.departments.find((d) => d.code === p['department']);
  return (dept?.employees ?? []).map((e) => ({
    key: e.id,
    name: e.name,
    headcount: 1,
    username: e.username,
  }));
}

function detail(month: string, p: Params, caps: AdminCaps, today: string): MockReply {
  const level = (p['level'] ?? 'company') as ScopeLevel;
  const key = p['key'] ?? '';
  const rows = flat(today).filter(
    (r) => r.date.startsWith(month) && visible(r, caps) && matches(r, level, key),
  );
  const sample = flat(today).find((r) => matches(r, level, key));
  if (!sample) return fail(400, 'ไม่พบข้อมูลของขอบเขตที่เลือก');
  const totals = sum(rows);
  const name =
    level === 'company'
      ? sample.company.name
      : level === 'department'
        ? sample.dept.name
        : sample.emp.name;
  const chain = [
    { level: 'COMPANY' as const, key: sample.company.code, name: sample.company.name },
    ...(level !== 'company'
      ? [{ level: 'DEPARTMENT' as const, key: sample.dept.code, name: sample.dept.name }]
      : []),
    ...(level === 'user'
      ? [{ level: 'USER' as const, key: sample.emp.id, name: sample.emp.name }]
      : []),
  ].map((c) => ({
    ...c,
    quota: quotaInfo(
      c.level,
      c.key,
      sum(
        flat(today).filter((r) => r.date.startsWith(month) && matches(r, LEVEL_OF[c.level], c.key)),
      ).tokens,
    ),
  }));
  return ok({
    month,
    level,
    key,
    name,
    company: level === 'company' ? null : { code: sample.company.code, name: sample.company.name },
    department: level === 'user' ? { code: sample.dept.code, name: sample.dept.name } : null,
    totals,
    quota: quotaInfo(levelOfScope(level), key, totals.tokens),
    quotaChain: chain.filter((c) => c.quota),
    ...breakdown(rows, totals.tokens),
    daily: dailyOf(rows, month, today).map(({ date, tokens }) => ({ date, tokens })),
    children: childrenOf(level, rows, sample),
  });
}

function breakdown(rows: readonly Flat[], total: number) {
  const share = (n: number) => (total > 0 ? Math.round((n / total) * 1000) / 10 : 0);
  const byTool = MOCK_TOOLS.map((t, i) => ({ t, mine: rows.filter((r) => r.toolIndex === i) }))
    .filter((x) => x.mine.length > 0)
    .map(({ t, mine }) => ({
      toolId: t.toolId,
      title: t.title,
      group: t.group,
      groupTitle: t.groupTitle,
      ...sum(mine),
      share: share(sum(mine).tokens),
    }))
    .sort((a, b) => b.tokens - a.tokens);
  const groups = new Map<
    string,
    { group: string; groupTitle: string; tokens: number; runs: number }
  >();
  for (const t of byTool) {
    const g = groups.get(t.group) ?? {
      group: t.group,
      groupTitle: t.groupTitle,
      tokens: 0,
      runs: 0,
    };
    groups.set(t.group, { ...g, tokens: g.tokens + t.tokens, runs: g.runs + t.runs });
  }
  const byModel = MOCK_MODELS.map((m, i) => ({ m, mine: rows.filter((r) => r.modelIndex === i) }))
    .filter((x) => x.mine.length > 0)
    .map(({ m, mine }) => ({ ...m, ...sum(mine), share: share(sum(mine).tokens) }))
    .sort((a, b) => b.tokens - a.tokens);
  const toolModel = MOCK_TOOLS.flatMap((t, ti) =>
    MOCK_MODELS.map((m, mi) => ({
      toolId: t.toolId,
      modelKey: m.modelKey,
      mine: rows.filter((r) => r.toolIndex === ti && r.modelIndex === mi),
    })),
  )
    .filter((x) => x.mine.length > 0)
    .map(({ mine, ...rest }) => ({ ...rest, tokens: sum(mine).tokens, runs: mine.length }));
  return {
    byTool,
    byGroup: [...groups.values()].sort((a, b) => b.tokens - a.tokens),
    byModel,
    toolModel,
  };
}

function childrenOf(level: ScopeLevel, rows: readonly Flat[], sample: Flat): DetailChild[] {
  if (level === 'user') return [];
  const kids: { key: string; name: string; level: ScopeLevel }[] =
    level === 'company'
      ? sample.company.departments.map((d) => ({ key: d.code, name: d.name, level: 'department' }))
      : sample.dept.employees.map((e) => ({ key: e.id, name: e.name, level: 'user' }));
  return kids
    .map((k) => {
      const tokens = sum(rows.filter((r) => matches(r, k.level, k.key))).tokens;
      return {
        key: k.key,
        name: k.name,
        tokens,
        quota: quotaInfo(levelOfScope(k.level), k.key, tokens),
      };
    })
    .sort((a, b) => b.tokens - a.tokens);
}

/* ------------------------------------------------------------- quotas */

function quotaRow(rec: QuotaRecord, month: string, today: string): QuotaRow {
  const used = sum(
    flat(today).filter((r) => r.date.startsWith(month) && matches(r, LEVEL_OF[rec.level], rec.key)),
  ).tokens;
  const company = MOCK_ORG.find((c) => c.code === rec.company);
  const dept = company?.departments.find((d) => d.code === rec.department);
  const percent = Math.round((used / rec.monthlyTokens) * 1000) / 10;
  const name =
    rec.level === 'COMPANY'
      ? company?.name
      : rec.level === 'DEPARTMENT'
        ? dept?.name
        : dept?.employees.find((e) => e.id === rec.key)?.name;
  return {
    level: rec.level,
    key: rec.key,
    name: name ?? rec.key,
    company: company ? { code: company.code, name: company.name } : null,
    department: dept ? { code: dept.code, name: dept.name } : null,
    monthlyTokens: rec.monthlyTokens,
    warnPercent: rec.warnPercent,
    enabled: rec.enabled,
    note: rec.note,
    used,
    remaining: Math.max(0, rec.monthlyTokens - used),
    percent,
    status: quotaStatusOf(percent, rec.warnPercent, rec.enabled),
    updatedBy: rec.updatedBy,
    updatedAt: rec.updatedAt,
  };
}

function quotaList(
  month: string,
  level: string | undefined,
  caps: AdminCaps,
  today: string,
): MockReply {
  const list = quotas
    .filter(
      (q) =>
        (!level || q.level === level.toUpperCase()) &&
        (caps.allBranch || q.company === caps.branchCode),
    )
    .map((q) => quotaRow(q, month, today));
  return ok({ month, quotas: list });
}

function logEvent(action: string, target: string, detail: string): void {
  events = [
    { at: new Date().toISOString(), actor: 'mock-admin', action, target, detail },
    ...events,
  ].slice(0, EVENT_LIMIT);
}

function quotaSave(p: Params, caps: AdminCaps): MockReply {
  if (!caps.quotaAdmin) return fail(403, 'ไม่มีสิทธิ์ตั้งโควตา');
  const level = (p['level'] ?? '').toUpperCase() as QuotaLevel;
  const key = p['key'] ?? '';
  const monthlyTokens = Number(p['monthlyTokens']);
  const warnPercent = Number(p['warnPercent'] || DEFAULT_WARN);
  if (!(level in LEVEL_OF) || !key || !p['company']) return fail(400, 'ข้อมูลไม่ครบ');
  if (!Number.isFinite(monthlyTokens) || monthlyTokens <= 0)
    return fail(400, 'จำนวน token ต่อเดือนต้องมากกว่า 0');
  if (warnPercent < 1 || warnPercent > 100)
    return fail(400, 'เปอร์เซ็นต์เตือนต้องอยู่ระหว่าง 1–100');
  if (!caps.allBranch && p['company'] !== caps.branchCode)
    return fail(403, 'ตั้งได้เฉพาะบริษัทของตนเอง');
  const record: QuotaRecord = {
    level,
    key,
    company: p['company'],
    department: p['department'] ?? '',
    monthlyTokens,
    warnPercent,
    enabled: p['enabled'] !== 'false',
    note: p['note'] ?? '',
    updatedBy: 'mock-admin',
    updatedAt: new Date().toISOString(),
  };
  quotas = [...quotas.filter((q) => !(q.level === level && q.key === key)), record];
  logEvent('ตั้งโควตา', `${level} ${key}`, `${monthlyTokens.toLocaleString('en-US')} token/เดือน`);
  return ok({ saved: true });
}

function quotaDelete(p: Params, caps: AdminCaps): MockReply {
  if (!caps.quotaAdmin) return fail(403, 'ไม่มีสิทธิ์ลบโควตา');
  const level = (p['level'] ?? '').toUpperCase();
  const before = quotas.length;
  quotas = quotas.filter(
    (q) =>
      !(
        q.level === level &&
        q.key === p['key'] &&
        (caps.allBranch || q.company === caps.branchCode)
      ),
  );
  if (quotas.length === before) return fail(400, 'ไม่พบโควตานี้');
  logEvent('ลบโควตา', `${level} ${p['key']}`, '');
  return ok({ deleted: true });
}

/* -------------------------------------------------------------- audit */

function auditRows(p: Params, caps: AdminCaps, today: string): AuditRow[] {
  const days = Math.min(90, Math.max(1, Number(p['days']) || 7));
  const from = new Date(Date.parse(`${today}T00:00:00Z`) - (days - 1) * 86_400_000)
    .toISOString()
    .slice(0, 10);
  const text = (p['q'] ?? '').trim().toLowerCase();
  return flat(today)
    .filter(
      (r) =>
        r.date >= from &&
        visible(r, caps) &&
        (!p['company'] || r.company.code === p['company']) &&
        (!p['department'] || r.dept.code === p['department']),
    )
    .filter((r) => !p['user'] || r.emp.id === p['user'] || r.emp.username === p['user'])
    .filter((r) => !p['tool'] || MOCK_TOOLS[r.toolIndex].toolId === p['tool'])
    .map((r, i) => toAuditRow(r, i))
    .filter(
      (r) =>
        !text ||
        [r.name, r.username, r.employeeId, r.task].some((v) => v.toLowerCase().includes(text)),
    )
    .sort((a, b) => b.at.localeCompare(a.at) || b.id - a.id);
}

function toAuditRow(r: Flat, id: number): AuditRow {
  const tool = MOCK_TOOLS[r.toolIndex];
  const model = MOCK_MODELS[r.modelIndex];
  return {
    id,
    at: `${r.date}T${r.time}+07:00`,
    employeeId: r.emp.id,
    username: r.emp.username,
    name: r.emp.name,
    company: { code: r.company.code, name: r.company.name },
    department: { code: r.dept.code, name: r.dept.name },
    toolId: tool.toolId,
    toolTitle: tool.title,
    groupTitle: tool.groupTitle,
    modelKey: model.modelKey,
    modelLabel: model.label,
    inputTokens: r.inputTokens,
    outputTokens: r.outputTokens,
    tokens: r.tokens,
    task: tool.task,
  };
}

function audit(p: Params, caps: AdminCaps, today: string): MockReply {
  const rows = auditRows(p, caps, today);
  if (p['action'] === 'audit-export') return { status: 200, body: null, csv: toCsv(rows) };
  const limit = Math.min(AUDIT_MAX_LIMIT, Math.max(1, Number(p['limit']) || AUDIT_DEFAULT_LIMIT));
  const offset = Math.max(0, Number(p['offset']) || 0);
  return ok({
    total: rows.length,
    limit,
    offset,
    rows: rows.slice(offset, offset + limit),
    events,
  });
}

function toCsv(rows: readonly AuditRow[]): string {
  const head = [
    'เวลา',
    'บริษัท',
    'ฝ่าย/แผนก',
    'พนักงาน',
    'username',
    'โมดูล',
    'เครื่องมือ',
    'โมเดล',
    'input',
    'output',
    'รวม',
  ];
  const cell = (v: string | number) => `"${String(v).replaceAll('"', '""')}"`;
  const lines = rows.map((r) =>
    [
      r.at,
      r.company?.name ?? '',
      r.department?.name ?? '',
      r.name,
      r.username,
      r.groupTitle,
      r.toolTitle,
      r.modelLabel,
      r.inputTokens,
      r.outputTokens,
      r.tokens,
    ]
      .map(cell)
      .join(','),
  );
  return `﻿${[head.map(cell).join(','), ...lines].join('\n')}`;
}
