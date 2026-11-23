import type {
  NameRef,
  OverviewRequest,
  OverviewRow,
  QuotaChainItem,
  QuotaInfo,
  QuotaStatus,
  ScopeLevel,
} from './ai-admin.types';

/** Framework-free helpers of the token Admin pages (formatting, drill-down state, quota status). */

const BANGKOK = 'Asia/Bangkok';
const THOUSAND = 1_000;
const MILLION = 1_000_000;
const BILLION = 1_000_000_000;
const DEFAULT_WARN_PERCENT = 80;
const FULL_PERCENT = 100;

/** 1,234 · 12.3K · 1.2M · 3.4B — compact token count for tiles, axes and labels */
export function formatTokens(value: number | null | undefined): string {
  const n = Number(value);
  if (!Number.isFinite(n)) return '0';
  const abs = Math.abs(n);
  if (abs >= BILLION) return `${trim(n / BILLION)}B`;
  if (abs >= MILLION) return `${trim(n / MILLION)}M`;
  if (abs >= 10 * THOUSAND) return `${trim(n / THOUSAND)}K`;
  return formatNumber(n);
}

function trim(n: number): string {
  return (Math.round(n * 10) / 10).toString();
}

/** 1,234,567 — exact count for tables */
export function formatNumber(value: number | null | undefined): string {
  const n = Number(value);
  return Number.isFinite(n) ? Math.round(n).toLocaleString('en-US') : '0';
}

/** 12.5% (one decimal, never more) */
export function formatPercent(value: number | null | undefined): string {
  const n = Number(value);
  return `${Number.isFinite(n) ? trim(n) : '0'}%`;
}

/** part / total × 100, 0 when total is 0 */
export function percentOf(part: number, total: number): number {
  return total > 0 ? (part / total) * 100 : 0;
}

/** `yyyy-MM` of an instant in Thai time (the service's month boundary) */
export function monthOf(date: Date): string {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: BANGKOK,
    year: 'numeric',
    month: '2-digit',
  }).formatToParts(date);
  const pick = (type: string) => parts.find((p) => p.type === type)?.value ?? '';
  return `${pick('year')}-${pick('month')}`;
}

export function shiftMonth(month: string, delta: number): string {
  const [year, mon] = month.split('-').map(Number);
  const index = year * 12 + (mon - 1) + delta;
  return `${Math.floor(index / 12)}-${String((index % 12) + 1).padStart(2, '0')}`;
}

/** `2026-11` → `พ.ย. 2569` / `Nov 2026` */
export function monthLabel(month: string, lang: 'th' | 'en'): string {
  const [year, mon] = month.split('-').map(Number);
  if (!year || !mon) return month;
  const date = new Date(Date.UTC(year, mon - 1, 15));
  return new Intl.DateTimeFormat(lang === 'th' ? 'th-TH' : 'en-GB', {
    month: 'short',
    year: 'numeric',
    timeZone: 'UTC',
  }).format(date);
}

/** `2026-11-21T09:12:33+07:00` → `21/11/2026 09:12` in Thai time (the audit table) */
export function formatDateTime(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso;
  return new Intl.DateTimeFormat('en-GB', {
    timeZone: BANGKOK,
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  })
    .format(date)
    .replace(',', '');
}

/** `2026-11-05` → `5` (axis label) */
export function dayOfMonth(date: string): string {
  return String(Number(date.slice(8, 10)) || date);
}

/* ---------------------------------------------------------------- quota */

export function quotaStatusOf(percent: number, warnPercent: number, enabled = true): QuotaStatus {
  if (!enabled) return 'ok';
  if (percent >= FULL_PERCENT) return 'full';
  return percent >= (warnPercent || DEFAULT_WARN_PERCENT) ? 'warn' : 'ok';
}

export function quotaStatus(quota: QuotaInfo | null | undefined): QuotaStatus {
  return quota ? quotaStatusOf(quota.percent, quota.warnPercent, quota.enabled) : 'ok';
}

/** the chain item whose quota runs out first (smallest remaining among enabled quotas) — it blocks the user first */
export function tightestQuota(chain: readonly QuotaChainItem[]): QuotaChainItem | undefined {
  return chain
    .filter((item) => item.quota?.enabled && (item.quota?.limit ?? 0) > 0)
    .reduce<QuotaChainItem | undefined>(
      (best, item) =>
        !best || (item.quota?.remaining ?? 0) < (best.quota?.remaining ?? 0) ? item : best,
      undefined,
    );
}

/* ----------------------------------------------------------- drill-down */

/** where the user is in company → department → employee */
export interface DrillState {
  company: NameRef | null;
  department: NameRef | null;
}

export const DRILL_ROOT: DrillState = { company: null, department: null };

/** the level of the rows shown for this state */
export function levelOf(state: DrillState): ScopeLevel {
  if (state.department) return 'user';
  return state.company ? 'department' : 'company';
}

/** click a row: company → its departments → its employees (a user row is a leaf: the state stays) */
export function drillInto(state: DrillState, row: Pick<OverviewRow, 'key' | 'name'>): DrillState {
  const level = levelOf(state);
  if (level === 'company') return { company: { code: row.key, name: row.name }, department: null };
  if (level === 'department')
    return { company: state.company, department: { code: row.key, name: row.name } };
  return state;
}

/** breadcrumb depth: 0 = all companies, 1 = a company */
export function drillUp(state: DrillState, depth: 0 | 1): DrillState {
  if (depth === 0) return DRILL_ROOT;
  return { company: state.company, department: null };
}

export function canDrill(state: DrillState): boolean {
  return levelOf(state) !== 'user';
}

export function overviewRequest(month: string, state: DrillState): OverviewRequest {
  const request: OverviewRequest = { month, level: levelOf(state) };
  if (state.company) request.company = state.company.code;
  if (state.department) request.department = state.department.code;
  return request;
}

/** the breadcrumb: label of every step, the last one is the current scope */
export function breadcrumb(
  state: DrillState,
  rootLabel: string,
): { label: string; depth: 0 | 1 | 2 }[] {
  const steps: { label: string; depth: 0 | 1 | 2 }[] = [{ label: rootLabel, depth: 0 }];
  if (state.company) steps.push({ label: state.company.name, depth: 1 });
  if (state.department) steps.push({ label: state.department.name, depth: 2 });
  return steps;
}

/** width (%) of every row against the biggest one (bar widths) */
export function barWidths(rows: readonly { tokens: number }[]): number[] {
  const max = rows.reduce((m, r) => Math.max(m, r.tokens), 0);
  return rows.map((r) => percentOf(r.tokens, max));
}

/** the rows that deserve a warning at the top of page 1: quota warn / full, worst first */
export function nearLimitRows<T extends { quota: QuotaInfo | null }>(rows: readonly T[]): T[] {
  return rows
    .filter((r) => quotaStatus(r.quota) !== 'ok')
    .sort((a, b) => (b.quota?.percent ?? 0) - (a.quota?.percent ?? 0));
}

/* ---------------------------------------------------------------- scope */

/** a chosen company / department / employee (the deepest one set is the scope) */
export interface ScopeRef {
  company: NameRef | null;
  department: NameRef | null;
  user: NameRef | null;
}

export const SCOPE_NONE: ScopeRef = { company: null, department: null, user: null };

export function scopeLevelOf(scope: ScopeRef): ScopeLevel | null {
  if (scope.user) return 'user';
  if (scope.department) return 'department';
  return scope.company ? 'company' : null;
}

export function scopeKeyOf(scope: ScopeRef): string {
  return (scope.user ?? scope.department ?? scope.company)?.code ?? '';
}

export function scopeNameOf(scope: ScopeRef): string {
  return (scope.user ?? scope.department ?? scope.company)?.name ?? '';
}

/** the query params `?tab=detail&…` that open the detail page on a scope, and back */
export function scopeToParams(scope: ScopeRef): Record<string, string> {
  const params: Record<string, string> = {};
  if (scope.company) params['company'] = `${scope.company.code}|${scope.company.name}`;
  if (scope.department) params['department'] = `${scope.department.code}|${scope.department.name}`;
  if (scope.user) params['user'] = `${scope.user.code}|${scope.user.name}`;
  return params;
}

function refOf(value: string | null | undefined): NameRef | null {
  if (!value) return null;
  const [code, ...name] = value.split('|');
  return code ? { code, name: name.join('|') || code } : null;
}

export function scopeFromParams(get: (name: string) => string | null | undefined): ScopeRef {
  const company = refOf(get('company'));
  const department = company ? refOf(get('department')) : null;
  return { company, department, user: department ? refOf(get('user')) : null };
}

/** the scope of a drill state (company → department) as a picker value */
export function scopeOfDrill(state: DrillState): ScopeRef {
  return { company: state.company, department: state.department, user: null };
}

/** a message for the user from a failed call; `t` is the i18n function (keys `app.aiAdmin.err.*`) */
export function describeError(error: unknown, t: (key: string) => string): string {
  const status = (error as { status?: number } | null)?.status;
  const message = error instanceof Error ? error.message.trim() : '';
  if (status === 0) return t('app.aiAdmin.err.network');
  if (status === 403) return message || t('app.aiAdmin.err.forbidden');
  return message || t('app.aiAdmin.err.generic');
}
