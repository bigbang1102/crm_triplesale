/**
 * Response / request shapes of `POST {apiBase}/aihub/tools/admin-tokens` — mirrors docs/ai-admin-token-api.md.
 * TOKEN data only: there is deliberately no cost / price / credit / status / latency field anywhere.
 * Mappers must tolerate extra fields (the service may add more), so every interface lists only what the page reads.
 */

export type ScopeLevel = 'company' | 'department' | 'user';
export type QuotaLevel = 'COMPANY' | 'DEPARTMENT' | 'USER';
export type QuotaStatus = 'ok' | 'warn' | 'full';

export interface NameRef {
  code: string;
  name: string;
}

/** the same token fields on every summary row */
export interface TokenTotals {
  tokens: number;
  inputTokens: number;
  outputTokens: number;
  runs: number;
  users: number;
}

export interface QuotaInfo {
  limit: number;
  used: number;
  remaining: number;
  percent: number;
  warnPercent: number;
  enabled: boolean;
  level?: QuotaLevel;
}

export interface OverviewScope extends TokenTotals {
  label: string;
  headcount: number;
  quota: QuotaInfo | null;
}

export interface OverviewRow extends TokenTotals {
  key: string;
  name: string;
  headcount?: number;
  share: number;
  quota: QuotaInfo | null;
  /** level = user only */
  username?: string;
}

export interface DailyPoint {
  date: string;
  tokens: number;
  inputTokens?: number;
  outputTokens?: number;
}

export interface MonthPoint {
  month: string;
  tokens: number;
}

export interface OverviewResponse {
  ok: true;
  month: string;
  level: ScopeLevel;
  company: NameRef | null;
  department: NameRef | null;
  scope: OverviewScope;
  rows: OverviewRow[];
  daily: DailyPoint[];
  dailyByRow: Record<string, DailyPoint[]>;
  months: MonthPoint[];
}

export interface QuotaChainItem {
  level: QuotaLevel;
  key: string;
  name: string;
  quota: QuotaInfo | null;
}

export interface ToolUsage extends TokenTotals {
  toolId: string;
  title: string;
  group: string;
  groupTitle: string;
  share: number;
}

export interface GroupUsage {
  group: string;
  groupTitle: string;
  tokens: number;
  runs: number;
}

export interface ModelUsage {
  modelKey: string;
  modelId: string;
  label: string;
  tokens: number;
  inputTokens: number;
  outputTokens: number;
  runs: number;
  share: number;
}

export interface ToolModelUsage {
  toolId: string;
  modelKey: string;
  tokens: number;
  runs: number;
}

export interface DetailChild {
  key: string;
  name: string;
  tokens: number;
  quota: QuotaInfo | null;
}

export interface DetailResponse {
  ok: true;
  month: string;
  level: ScopeLevel;
  key: string;
  name: string;
  company: NameRef | null;
  department: NameRef | null;
  totals: TokenTotals;
  quota: QuotaInfo | null;
  quotaChain: QuotaChainItem[];
  byTool: ToolUsage[];
  byGroup: GroupUsage[];
  byModel: ModelUsage[];
  toolModel: ToolModelUsage[];
  daily: DailyPoint[];
  children: DetailChild[];
}

export interface QuotaRow {
  level: QuotaLevel;
  key: string;
  name: string;
  company: NameRef | null;
  department: NameRef | null;
  monthlyTokens: number;
  warnPercent: number;
  enabled: boolean;
  note: string;
  used: number;
  remaining: number;
  percent: number;
  status: QuotaStatus;
  updatedBy?: string;
  updatedAt?: string;
}

export interface QuotaListResponse {
  ok: true;
  month: string;
  quotas: QuotaRow[];
}

export interface AuditRow {
  id: number;
  at: string;
  employeeId: string;
  username: string;
  name: string;
  company: NameRef | null;
  department: NameRef | null;
  toolId: string;
  toolTitle: string;
  groupTitle: string;
  modelKey: string;
  modelLabel: string;
  inputTokens: number;
  outputTokens: number;
  tokens: number;
  task: string;
}

export interface AuditEvent {
  at: string;
  actor: string;
  action: string;
  target: string;
  detail: string;
}

export interface AuditResponse {
  ok: true;
  total: number;
  limit: number;
  offset: number;
  rows: AuditRow[];
  events: AuditEvent[];
}

/* ---- requests ---- */

export interface OverviewRequest {
  month: string;
  level: ScopeLevel;
  company?: string;
  department?: string;
}

export interface DetailRequest {
  month: string;
  level: ScopeLevel;
  key: string;
  company?: string;
  department?: string;
}

export interface QuotaSaveRequest {
  level: QuotaLevel;
  key: string;
  company: string;
  department?: string;
  monthlyTokens: number;
  warnPercent: number;
  enabled: boolean;
  note: string;
}

export interface QuotaDeleteRequest {
  level: QuotaLevel;
  key: string;
  company: string;
}

export interface AuditFilter {
  days: number;
  company: string;
  department: string;
  user: string;
  tool: string;
  q: string;
  limit: number;
  offset: number;
}

/** what the service says the caller may do (from the `X-Ts-*` identity headers) — used by the mock and the UI */
export interface AdminCaps {
  /** may set / delete quotas (AI_ADMIN_QUOTA_MANAGE or super_admin) */
  quotaAdmin: boolean;
  /** sees every company (AI_ADMIN_USAGE_ALL_BRANCH or super_admin) */
  allBranch: boolean;
  /** the caller's own company code (the only one visible without `allBranch`) */
  branchCode: string;
}

/** a file the page hands to the browser */
export interface DownloadedFile {
  blob: Blob;
  fileName: string;
}
