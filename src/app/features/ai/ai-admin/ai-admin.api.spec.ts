import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { AuthService } from '@core/auth/auth.service';
import { ConfigService } from '@core/config/config.service';
import { PermissionService } from '@core/permissions/permission.service';
import { configStub } from '@core/testing/test-helpers';
import { AI_ADMIN_FETCH, AiAdminApi, AiAdminError, unwrap } from './ai-admin.api';
import { AI_ADMIN_IDENTITY } from './ai-admin.identity';
import type { AuditFilter } from './ai-admin.types';

const FILTER: AuditFilter = {
  days: 7,
  company: 'A1',
  department: '',
  user: '',
  tool: '',
  q: 'สัญญา',
  limit: 50,
  offset: 0,
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });

function setup(
  options: {
    mock?: boolean;
    service?: boolean;
    reply?: () => Promise<Response>;
    held?: string[];
  } = {},
) {
  const fetchStub = vi.fn((_input: RequestInfo | URL, _init?: RequestInit) =>
    options.reply ? options.reply() : Promise.resolve(json({ ok: true, rows: [] })),
  );
  const held = new Set(options.held ?? ['AI_ADMIN_QUOTA_MANAGE']);
  TestBed.configureTestingModule({
    providers: [
      {
        provide: ConfigService,
        useValue: configStub({
          mock: options.mock ?? false,
          apiBase: '/triplesale',
          features: { ...configStub().value.features, aiHubService: options.service ?? false },
        }),
      },
      { provide: AuthService, useValue: { session: signal({ branch: { code: 'A1' } }) } },
      { provide: PermissionService, useValue: { has: (role: string) => held.has(role) } },
      { provide: AI_ADMIN_FETCH, useValue: fetchStub },
      { provide: AI_ADMIN_IDENTITY, useValue: () => ({ 'X-Ts-Actor': 'tester' }) },
    ],
  });
  return { api: TestBed.inject(AiAdminApi), fetchStub };
}

const sent = (stub: ReturnType<typeof setup>['fetchStub']) => {
  const [url, init] = stub.mock.calls[0];
  const body = init?.body as FormData;
  return {
    url: String(url),
    init: init as RequestInit,
    fields: Object.fromEntries(body.entries()) as Record<string, string>,
  };
};

beforeEach(() => TestBed.resetTestingModule());

describe('AiAdminApi — real service', () => {
  it('should POST the action and fields as multipart to admin-tokens with identity headers and no Bearer', async () => {
    const { api, fetchStub } = setup();
    await api.overview({ month: '2026-11', level: 'department', company: 'A1' });
    const call = sent(fetchStub);
    expect(call.url).toBe('/triplesale/aihub/tools/admin-tokens');
    expect(call.init.method).toBe('POST');
    expect(call.init.credentials).toBe('same-origin');
    expect(call.fields).toEqual({
      action: 'overview',
      month: '2026-11',
      level: 'department',
      company: 'A1',
    });
    const headers = call.init.headers as Record<string, string>;
    expect(headers['X-Ts-Actor']).toBe('tester');
    expect(Object.keys(headers).map((h) => h.toLowerCase())).not.toContain('authorization');
  });

  it('should leave out undefined fields and send numbers and booleans as text', async () => {
    const { api, fetchStub } = setup();
    await api.quotaSave({
      level: 'USER',
      key: 'E1',
      company: 'A1',
      department: 'D1',
      monthlyTokens: 5000,
      warnPercent: 80,
      enabled: false,
      note: '',
    });
    expect(sent(fetchStub).fields).toEqual({
      action: 'quota-save',
      level: 'USER',
      key: 'E1',
      company: 'A1',
      department: 'D1',
      monthlyTokens: '5000',
      warnPercent: '80',
      enabled: 'false',
      note: '',
    });
    fetchStub.mockClear();
    await api.quotaList('2026-11');
    expect(sent(fetchStub).fields).toEqual({ action: 'quota-list', month: '2026-11' });
  });

  it('should return the parsed body and tolerate extra fields', async () => {
    const { api } = setup({
      reply: () =>
        Promise.resolve(
          json({ ok: true, total: 3, limit: 50, offset: 0, rows: [], events: [], newThing: 1 }),
        ),
    });
    const result = await api.audit(FILTER);
    expect(result.total).toBe(3);
  });

  it('should throw the Thai message and status of a service error and never fall back to the mock', async () => {
    const { api } = setup({
      reply: () => Promise.resolve(json({ ok: false, error: 'ไม่มีสิทธิ์ตั้งโควตา' }, 403)),
    });
    await expect(
      api.quotaDelete({ level: 'COMPANY', key: 'A1', company: 'A1' }),
    ).rejects.toMatchObject({ message: 'ไม่มีสิทธิ์ตั้งโควตา', status: 403 });
  });

  it('should treat ok:false on HTTP 200 as an error', async () => {
    const { api } = setup({
      reply: () => Promise.resolve(json({ ok: false, error: 'ข้อมูลไม่ครบ' })),
    });
    await expect(
      api.detail({ month: '2026-11', level: 'company', key: 'A1' }),
    ).rejects.toBeInstanceOf(AiAdminError);
  });

  it('should report status 0 when the service cannot be reached, and HTTP status for a non-JSON error page', async () => {
    const down = setup({ reply: () => Promise.reject(new TypeError('Failed to fetch')) });
    await expect(down.api.overview({ month: '2026-11', level: 'company' })).rejects.toMatchObject({
      status: 0,
    });
    TestBed.resetTestingModule();
    const html = setup({ reply: () => Promise.resolve(new Response('<html>', { status: 502 })) });
    await expect(html.api.overview({ month: '2026-11', level: 'company' })).rejects.toMatchObject({
      status: 502,
      message: 'HTTP 502',
    });
  });
});

describe('AiAdminApi — export', () => {
  it('should hand back the CSV body of the response with the file name of Content-Disposition', async () => {
    const { api, fetchStub } = setup({
      reply: () =>
        Promise.resolve(
          new Response('a,b', {
            headers: {
              'Content-Type': 'text/csv',
              'Content-Disposition': 'attachment; filename="usage_7d.csv"',
            },
          }),
        ),
    });
    const file = await api.auditExport(FILTER);
    expect(file.fileName).toBe('usage_7d.csv');
    expect(await file.blob.text()).toBe('a,b');
    expect(sent(fetchStub).fields['action']).toBe('audit-export');
    expect(sent(fetchStub).fields['limit']).toBeUndefined();
  });

  it('should follow {fileId} like the old export and download that file', async () => {
    let n = 0;
    const { api, fetchStub } = setup({
      reply: () =>
        Promise.resolve(
          n++ === 0
            ? json({ ok: true, fileId: 'f 1', fileName: 'x.csv' })
            : new Response('csv-body'),
        ),
    });
    const file = await api.auditExport(FILTER);
    expect(fetchStub.mock.calls[1][0]).toBe('/triplesale/aihub/files/f%201?download=1');
    expect(file.fileName).toBe('x.csv');
    expect(await file.blob.text()).toBe('csv-body');
  });

  it('should fail with the service message when the export is refused', async () => {
    const { api } = setup({
      reply: () => Promise.resolve(json({ ok: false, error: 'ไม่มีสิทธิ์ส่งออก' }, 403)),
    });
    await expect(api.auditExport(FILTER)).rejects.toMatchObject({
      message: 'ไม่มีสิทธิ์ส่งออก',
      status: 403,
    });
  });
});

describe('AiAdminApi — mock backend', () => {
  it('should answer from the in-memory dataset when mock is on and the service flag is off, without any fetch', async () => {
    const { api, fetchStub } = setup({
      mock: true,
      service: false,
      held: ['AI_ADMIN_QUOTA_MANAGE', 'AI_ADMIN_USAGE_ALL_BRANCH'],
    });
    const overview = await api.overview({
      month: new Date().toISOString().slice(0, 7),
      level: 'company',
    });
    expect(overview.rows.length).toBeGreaterThan(0);
    const file = await api.auditExport({ ...FILTER, company: '' });
    expect(file.fileName).toBe('aihub_token_audit.csv');
    expect(fetchStub).not.toHaveBeenCalled();
  });

  it('should use the real service when the service flag is on even in mock mode', async () => {
    const { api, fetchStub } = setup({ mock: true, service: true });
    await api.quotaList('2026-11');
    expect(fetchStub).toHaveBeenCalledTimes(1);
  });

  it('should enforce the quota right in the mock like the service does', async () => {
    const { api } = setup({ mock: true, held: [] });
    await expect(
      api.quotaSave({
        level: 'COMPANY',
        key: 'A1',
        company: 'A1',
        monthlyTokens: 1,
        warnPercent: 80,
        enabled: true,
        note: '',
      }),
    ).rejects.toMatchObject({ status: 403 });
  });
});

describe('AiAdminApi — caps', () => {
  it('should read the quota, all-branch and export rights and the own company from the session', () => {
    const { api } = setup({ held: ['AI_ADMIN_QUOTA_MANAGE', 'AI_ADMIN_USAGE_EXPORT'] });
    expect(api.caps()).toEqual({ quotaAdmin: true, allBranch: false, branchCode: 'A1' });
    expect(api.canExport()).toBe(true);
  });
});

describe('unwrap — the hub envelope', () => {
  it('should return the result object of a hub answer', () => {
    expect(unwrap({ ok: true, tool: 'admin-tokens', result: { ok: true, rows: [1] } })).toEqual({
      ok: true,
      rows: [1],
    });
  });

  it('should return a body that has no result object as it is', () => {
    const body = { ok: true, rows: [] };
    expect(unwrap(body)).toBe(body);
    expect(unwrap({ ok: true, result: [1] })).toEqual({ ok: true, result: [1] });
    expect(unwrap(null)).toBeNull();
  });
});
