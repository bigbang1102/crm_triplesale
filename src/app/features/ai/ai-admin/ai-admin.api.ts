import { Injectable, InjectionToken, computed, inject } from '@angular/core';
import { AuthService } from '@core/auth/auth.service';
import { ConfigService } from '@core/config/config.service';
import { AI_HUB_ROLE } from '@core/permissions/ai-hub-roles';
import { PermissionService } from '@core/permissions/permission.service';
import { AI_ADMIN_IDENTITY } from './ai-admin.identity';
import type {
  AdminCaps,
  AuditFilter,
  AuditResponse,
  DetailRequest,
  DetailResponse,
  DownloadedFile,
  OverviewRequest,
  OverviewResponse,
  QuotaDeleteRequest,
  QuotaListResponse,
  QuotaLevel,
  QuotaSaveRequest,
} from './ai-admin.types';

/** the browser's `fetch` (replaceable in specs) */
export const AI_ADMIN_FETCH = new InjectionToken<typeof fetch>('AI_ADMIN_FETCH', {
  providedIn: 'root',
  factory: () => (input, init) => fetch(input, init),
});

/** a failed call: `status` 0 = the service could not be reached; `message` is the service's Thai text when it sent one */
export class AiAdminError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
    this.name = 'AiAdminError';
  }
}

const EXPORT_NAME = 'aihub_token_audit.csv';

type Fields = Record<string, string | number | boolean | undefined>;

/**
 * Every call of the token Admin: `POST {apiBase}/aihub/tools/admin-tokens` as multipart form (`action` + fields), the way the
 * AI HUB engine talks to the service — `fetch` with `same-origin` credentials, NO Bearer; the `X-Ts-*` identity comes from
 * `AI_ADMIN_IDENTITY`. A real service error is always thrown to the page; the in-memory mock answers only when
 * `mock: true` and `features.aiHubService` is off (the mockup web without the service).
 */
@Injectable({ providedIn: 'root' })
export class AiAdminApi {
  private readonly config = inject(ConfigService);
  private readonly auth = inject(AuthService);
  private readonly perm = inject(PermissionService);
  private readonly doFetch = inject(AI_ADMIN_FETCH);
  private readonly identity = inject(AI_ADMIN_IDENTITY);

  /** what this session may do — decides which controls the pages show (the service enforces the same) */
  readonly caps = computed<AdminCaps>(() => ({
    quotaAdmin: this.perm.has(AI_HUB_ROLE.aiAdminQuotaManage),
    allBranch: this.perm.has(AI_HUB_ROLE.aiAdminUsageAllBranch),
    branchCode: this.auth.session()?.branch?.code ?? '',
  }));

  /** may download the audit CSV (`AI_ADMIN_USAGE_EXPORT`) */
  readonly canExport = computed(() => this.perm.has(AI_HUB_ROLE.aiAdminUsageExport));

  overview(request: OverviewRequest): Promise<OverviewResponse> {
    return this.call<OverviewResponse>('overview', { ...request });
  }

  detail(request: DetailRequest): Promise<DetailResponse> {
    return this.call<DetailResponse>('detail', { ...request });
  }

  quotaList(month: string, level?: QuotaLevel): Promise<QuotaListResponse> {
    return this.call<QuotaListResponse>('quota-list', { month, level });
  }

  async quotaSave(request: QuotaSaveRequest): Promise<void> {
    await this.call('quota-save', { ...request });
  }

  async quotaDelete(request: QuotaDeleteRequest): Promise<void> {
    await this.call('quota-delete', { ...request });
  }

  audit(filter: AuditFilter): Promise<AuditResponse> {
    return this.call<AuditResponse>('audit', { ...filter });
  }

  /** the CSV of the same filter: the response itself (blob) or, like the old export, `{fileId}` to download */
  async auditExport(filter: AuditFilter): Promise<DownloadedFile> {
    if (this.useMock()) {
      const reply = await this.mockReply('audit-export', { ...filter });
      if (reply.status !== 200 || reply.csv === undefined)
        throw new AiAdminError(errorOf(reply.body), reply.status);
      return {
        blob: new Blob([reply.csv], { type: 'text/csv;charset=utf-8' }),
        fileName: EXPORT_NAME,
      };
    }
    const response = await this.send('audit-export', {
      ...filter,
      limit: undefined,
      offset: undefined,
    });
    if (!(response.headers.get('Content-Type') ?? '').includes('json')) {
      if (!response.ok) throw new AiAdminError(`HTTP ${response.status}`, response.status);
      return { blob: await response.blob(), fileName: fileNameOf(response) };
    }
    const body = unwrap(await response.json()) as {
      ok?: boolean;
      error?: string;
      fileId?: string;
      fileName?: string;
    };
    if (!response.ok || body.ok === false || !body.fileId)
      throw new AiAdminError(body.error ?? `HTTP ${response.status}`, response.status);
    const file = await this.doFetch(
      `${this.base()}/files/${encodeURIComponent(body.fileId)}?download=1`,
      { credentials: 'same-origin', headers: this.identity() },
    );
    if (!file.ok) throw new AiAdminError(`HTTP ${file.status}`, file.status);
    return { blob: await file.blob(), fileName: body.fileName ?? EXPORT_NAME };
  }

  /* -------------------------------------------------------------- */

  private base(): string {
    return `${this.config.value.apiBase}/aihub`;
  }

  private useMock(): boolean {
    const { mock, features } = this.config.value;
    return mock && !features.aiHubService;
  }

  private async call<T>(action: string, fields: Fields): Promise<T> {
    if (this.useMock()) {
      const reply = await this.mockReply(action, fields);
      if (reply.status !== 200) throw new AiAdminError(errorOf(reply.body), reply.status);
      return reply.body as T;
    }
    const response = await this.send(action, fields);
    const body = (await response.json().catch(() => null)) as {
      ok?: boolean;
      error?: string;
    } | null;
    if (!response.ok || !body || body.ok === false)
      throw new AiAdminError(body?.error ?? `HTTP ${response.status}`, response.status);
    return unwrap(body) as T;
  }

  private async send(action: string, fields: Fields): Promise<Response> {
    const form = new FormData();
    form.append('action', action);
    for (const [name, value] of Object.entries(fields)) {
      if (value !== undefined) form.append(name, String(value));
    }
    try {
      return await this.doFetch(`${this.base()}/tools/admin-tokens`, {
        method: 'POST',
        body: form,
        credentials: 'same-origin',
        headers: { Accept: 'application/json', ...this.identity() },
      });
    } catch {
      throw new AiAdminError('', 0);
    }
  }

  /** the fake service is its own chunk: only loaded when it is used */
  private async mockReply(action: string, fields: Fields) {
    const { adminTokensMock } = await import('./ai-admin.mock');
    const params = Object.fromEntries(
      Object.entries(fields)
        .filter(([, v]) => v !== undefined)
        .map(([k, v]) => [k, String(v)]),
    );
    return adminTokensMock({ ...params, action }, this.caps());
  }
}

/**
 * The hub wraps a tool's answer as `{ ok, tool, usage, …, result: { … } }` (the contract's body is the `result`); the fake service
 * and an older/other host answer the body itself. A body without a `result` object is returned as it is.
 */
export function unwrap(body: unknown): unknown {
  if (typeof body !== 'object' || body === null) return body;
  const result = (body as { result?: unknown }).result;
  return typeof result === 'object' && result !== null && !Array.isArray(result) ? result : body;
}

function errorOf(body: unknown): string {
  return typeof body === 'object' && body !== null && 'error' in body
    ? String((body as { error: unknown }).error)
    : '';
}

function fileNameOf(response: Response): string {
  const match = /filename\*?=(?:UTF-8'')?"?([^";]+)"?/i.exec(
    response.headers.get('Content-Disposition') ?? '',
  );
  return match ? decodeURIComponent(match[1]) : EXPORT_NAME;
}
