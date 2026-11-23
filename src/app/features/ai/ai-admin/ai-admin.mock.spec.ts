import { beforeEach, describe, expect, it } from 'vitest';
import { adminTokensMock, resetAdminMock } from './ai-admin.mock';
import type {
  AuditResponse,
  DetailResponse,
  OverviewResponse,
  QuotaListResponse,
} from './ai-admin.types';

const TODAY = '2026-11-21';
const MONTH = '2026-11';
const ADMIN = { quotaAdmin: true, allBranch: true, branchCode: 'A1' };
const VIEWER = { quotaAdmin: false, allBranch: false, branchCode: 'A1' };

const call = <T>(params: Record<string, string>, caps = ADMIN) => {
  const reply = adminTokensMock({ month: MONTH, ...params }, caps, TODAY);
  return {
    status: reply.status,
    body: reply.body as T & { ok: boolean; error?: string },
    csv: reply.csv,
  };
};

/** the customer sees tokens only: nothing in an answer may mention money, errors or timing */
const MONEY = /cost|price|usd|thb|credit|baht|latency|elapsed|duration|success|"status":"error"/i;

beforeEach(() => resetAdminMock());

describe('admin-tokens mock — overview', () => {
  it('should total the companies and make the rows add up to the scope', () => {
    const { body } = call<OverviewResponse>({ action: 'overview', level: 'company' });
    expect(body.rows.map((r) => r.key).sort()).toEqual(['A1', 'B2']);
    expect(body.rows.reduce((s, r) => s + r.tokens, 0)).toBe(body.scope.tokens);
    expect(body.scope.tokens).toBe(body.scope.inputTokens + body.scope.outputTokens);
    expect(body.rows.reduce((s, r) => s + r.share, 0)).toBeGreaterThan(99);
    expect(body.rows[0].tokens).toBeGreaterThanOrEqual(body.rows[1].tokens);
    expect(body.months).toHaveLength(6);
    expect(body.months.at(-1)?.month).toBe(MONTH);
  });

  it('should have a daily point per day up to today and the same total as the rows', () => {
    const { body } = call<OverviewResponse>({ action: 'overview', level: 'company' });
    expect(body.daily).toHaveLength(21);
    expect(body.daily.reduce((s, d) => s + d.tokens, 0)).toBe(body.scope.tokens);
    expect(Object.keys(body.dailyByRow).sort()).toEqual(['A1', 'B2']);
  });

  it('should drill to departments of a company and to employees of a department, listing idle ones too', () => {
    const departments = call<OverviewResponse>({
      action: 'overview',
      level: 'department',
      company: 'A1',
    }).body;
    expect(departments.rows.map((r) => r.key).sort()).toEqual(['A1-IT', 'A1-MKT', 'A1-SALES']);
    expect(departments.company?.code).toBe('A1');
    expect(departments.scope.headcount).toBe(10);
    const users = call<OverviewResponse>({
      action: 'overview',
      level: 'user',
      company: 'A1',
      department: 'A1-SALES',
    }).body;
    expect(users.rows).toHaveLength(4);
    expect(users.rows[0].username).toBeTruthy();
    expect(users.department?.code).toBe('A1-SALES');
  });

  it('should attach the quota with used / remaining to the rows that have one', () => {
    const { body } = call<OverviewResponse>({
      action: 'overview',
      level: 'department',
      company: 'A1',
    });
    const sales = body.rows.find((r) => r.key === 'A1-SALES');
    expect(sales?.quota?.limit).toBe(2_000_000);
    expect(sales?.quota?.used).toBe(sales?.tokens);
    expect(sales?.quota?.remaining).toBe(Math.max(0, 2_000_000 - (sales?.tokens ?? 0)));
    expect(body.rows.find((r) => r.key === 'A1-IT')?.quota).toBeNull();
  });

  it('should force a viewer without all-branch to their own company', () => {
    const { body } = call<OverviewResponse>(
      { action: 'overview', level: 'company', company: 'B2' },
      VIEWER,
    );
    expect(body.rows.map((r) => r.key)).toEqual(['A1']);
    const departments = call<OverviewResponse>(
      { action: 'overview', level: 'department', company: 'B2' },
      VIEWER,
    ).body;
    expect(departments.rows.every((r) => r.key.startsWith('A1'))).toBe(true);
  });

  it('should be deterministic', () => {
    const a = call<OverviewResponse>({ action: 'overview', level: 'company' }).body;
    resetAdminMock();
    const b = call<OverviewResponse>({ action: 'overview', level: 'company' }).body;
    expect(b).toEqual(a);
  });
});

describe('admin-tokens mock — detail', () => {
  it('should break a department down by tool, module and model with matching totals', () => {
    const { body } = call<DetailResponse>({
      action: 'detail',
      level: 'department',
      key: 'A1-SALES',
      company: 'A1',
    });
    expect(body.byTool.reduce((s, t) => s + t.tokens, 0)).toBe(body.totals.tokens);
    expect(body.byModel.reduce((s, m) => s + m.tokens, 0)).toBe(body.totals.tokens);
    expect(body.byGroup.reduce((s, g) => s + g.tokens, 0)).toBe(body.totals.tokens);
    expect(body.toolModel.reduce((s, c) => s + c.tokens, 0)).toBe(body.totals.tokens);
    expect(body.children).toHaveLength(4);
    expect(body.children.reduce((s, c) => s + c.tokens, 0)).toBe(body.totals.tokens);
  });

  it('should give the quota chain from company down to the employee, only levels that have a quota', () => {
    const { body } = call<DetailResponse>({
      action: 'detail',
      level: 'user',
      key: 'A1-Esales1',
      company: 'A1',
      department: 'A1-SALES',
    });
    expect(body.quotaChain.map((c) => c.level)).toEqual(['COMPANY', 'DEPARTMENT', 'USER']);
    expect(body.children).toEqual([]);
    const idle = call<DetailResponse>({
      action: 'detail',
      level: 'department',
      key: 'A1-IT',
      company: 'A1',
    }).body;
    expect(idle.quotaChain.map((c) => c.level)).toEqual(['COMPANY']);
  });

  it('should refuse an unknown scope with 400', () => {
    const { status, body } = call<DetailResponse>({
      action: 'detail',
      level: 'company',
      key: 'ZZ',
    });
    expect(status).toBe(400);
    expect(body.ok).toBe(false);
  });
});

describe('admin-tokens mock — quotas', () => {
  it('should list quotas with used / remaining / percent / status and filter by level', () => {
    const all = call<QuotaListResponse>({ action: 'quota-list' }).body;
    expect(all.quotas.length).toBeGreaterThanOrEqual(4);
    const user = call<QuotaListResponse>({ action: 'quota-list', level: 'USER' }).body;
    expect(user.quotas.every((q) => q.level === 'USER')).toBe(true);
    for (const q of all.quotas) {
      expect(q.remaining).toBe(Math.max(0, q.monthlyTokens - q.used));
      expect(['ok', 'warn', 'full']).toContain(q.status);
    }
  });

  it('should save a quota then list it, update it in place and delete it', () => {
    const base = {
      action: 'quota-save',
      level: 'DEPARTMENT',
      key: 'A1-IT',
      company: 'A1',
      department: 'A1-IT',
      monthlyTokens: '1500000',
      warnPercent: '75',
      enabled: 'true',
      note: 'ทดสอบ',
    };
    expect(call({ ...base }).status).toBe(200);
    const saved = call<QuotaListResponse>({ action: 'quota-list' }).body.quotas.find(
      (q) => q.key === 'A1-IT',
    );
    expect(saved).toMatchObject({
      monthlyTokens: 1_500_000,
      warnPercent: 75,
      note: 'ทดสอบ',
      name: 'ฝ่ายไอที',
    });
    call({ ...base, monthlyTokens: '2500000' });
    expect(
      call<QuotaListResponse>({ action: 'quota-list' }).body.quotas.filter(
        (q) => q.key === 'A1-IT',
      ),
    ).toHaveLength(1);
    expect(
      call({ action: 'quota-delete', level: 'DEPARTMENT', key: 'A1-IT', company: 'A1' }).status,
    ).toBe(200);
    expect(
      call<QuotaListResponse>({ action: 'quota-list' }).body.quotas.some((q) => q.key === 'A1-IT'),
    ).toBe(false);
    expect(
      call({ action: 'quota-delete', level: 'DEPARTMENT', key: 'A1-IT', company: 'A1' }).status,
    ).toBe(400);
  });

  it('should reject bad values with 400 and a Thai message', () => {
    const bad = { action: 'quota-save', level: 'COMPANY', key: 'A1', company: 'A1' };
    expect(call({ ...bad, monthlyTokens: '0' }).status).toBe(400);
    expect(call({ ...bad, monthlyTokens: 'abc' }).status).toBe(400);
    expect(call({ ...bad, monthlyTokens: '100', warnPercent: '150' }).status).toBe(400);
    expect(call({ ...bad, monthlyTokens: '100', key: '' }).body.error).toBeTruthy();
  });

  it('should refuse a caller without the quota right with 403, and another company without all-branch', () => {
    const save = {
      action: 'quota-save',
      level: 'COMPANY',
      key: 'A1',
      company: 'A1',
      monthlyTokens: '100',
    };
    expect(call(save, VIEWER).status).toBe(403);
    expect(
      call({ action: 'quota-delete', level: 'COMPANY', key: 'A1', company: 'A1' }, VIEWER).status,
    ).toBe(403);
    const otherCompany = { ...save, key: 'B2', company: 'B2' };
    expect(
      call(otherCompany, { quotaAdmin: true, allBranch: false, branchCode: 'A1' }).status,
    ).toBe(403);
  });

  it('should record the admin action in the audit events', () => {
    call({
      action: 'quota-save',
      level: 'COMPANY',
      key: 'B2',
      company: 'B2',
      monthlyTokens: '6000000',
    });
    const { body } = call<AuditResponse>({ action: 'audit' });
    expect(body.events[0]).toMatchObject({ action: 'ตั้งโควตา', target: 'COMPANY B2' });
  });
});

describe('admin-tokens mock — audit', () => {
  it('should page newest first with total, limit and offset', () => {
    const first = call<AuditResponse>({ action: 'audit', days: '30', limit: '10' }).body;
    expect(first.total).toBeGreaterThan(10);
    expect(first.rows).toHaveLength(10);
    expect(first.rows[0].at >= first.rows[9].at).toBe(true);
    const second = call<AuditResponse>({
      action: 'audit',
      days: '30',
      limit: '10',
      offset: '10',
    }).body;
    expect(second.rows[0].id).not.toBe(first.rows[0].id);
    expect(second.offset).toBe(10);
  });

  it('should filter by company, department, user, tool and text, and by days', () => {
    const seven = call<AuditResponse>({ action: 'audit', days: '7', limit: '200' }).body;
    const thirty = call<AuditResponse>({ action: 'audit', days: '30', limit: '200' }).body;
    expect(thirty.total).toBeGreaterThan(seven.total);
    const dept = call<AuditResponse>({
      action: 'audit',
      days: '30',
      limit: '200',
      department: 'A1-MKT',
    }).body;
    expect(dept.rows.every((r) => r.department?.code === 'A1-MKT')).toBe(true);
    const tool = call<AuditResponse>({
      action: 'audit',
      days: '30',
      limit: '200',
      tool: 'image',
    }).body;
    expect(tool.rows.every((r) => r.toolId === 'image')).toBe(true);
    const user = call<AuditResponse>({
      action: 'audit',
      days: '30',
      limit: '200',
      user: 'b2.crd1',
    }).body;
    expect(user.rows.length).toBeGreaterThan(0);
    expect(user.rows.every((r) => r.username === 'b2.crd1')).toBe(true);
    const text = call<AuditResponse>({
      action: 'audit',
      days: '30',
      limit: '200',
      q: 'สัญญาเช่าซื้อ',
    }).body;
    expect(text.rows.every((r) => r.task.includes('สัญญาเช่าซื้อ'))).toBe(true);
    expect(call<AuditResponse>({ action: 'audit', q: 'no-such-thing-xyz' }).body.rows).toEqual([]);
  });

  it('should cap the page size at 200 and keep a row total = input + output', () => {
    const { body } = call<AuditResponse>({ action: 'audit', days: '90', limit: '9999' });
    expect(body.limit).toBe(200);
    expect(body.rows.every((r) => r.tokens === r.inputTokens + r.outputTokens)).toBe(true);
  });

  it('should hide other companies from a viewer without all-branch', () => {
    const { body } = call<AuditResponse>(
      { action: 'audit', days: '30', limit: '200', company: 'B2' },
      VIEWER,
    );
    expect(body.rows.every((r) => r.company?.code === 'A1')).toBe(true);
  });

  it('should export the same filter as a BOM-prefixed CSV without cost columns', () => {
    const filter = { days: '7', department: 'A1-MKT' };
    const { csv } = call({ action: 'audit-export', ...filter });
    const lines = (csv ?? '').split('\n');
    expect(csv?.startsWith('﻿')).toBe(true);
    expect(lines[0]).toContain('"เวลา"');
    expect(lines[0]).toContain('"รวม"');
    expect(lines[0].split(',')).toHaveLength(11);
    const rows = call<AuditResponse>({ action: 'audit', ...filter, limit: '200' }).body.total;
    expect(lines.length - 1).toBe(rows);
  });
});

describe('admin-tokens mock — token only', () => {
  it('should never put money, error-rate, latency or success-status in any answer', () => {
    const answers = [
      call({ action: 'overview', level: 'company' }),
      call({ action: 'overview', level: 'user', company: 'A1', department: 'A1-SALES' }),
      call({
        action: 'detail',
        level: 'user',
        key: 'A1-Esales1',
        company: 'A1',
        department: 'A1-SALES',
      }),
      call({ action: 'quota-list' }),
      call({ action: 'audit', days: '30', limit: '200' }),
      call({ action: 'audit-export', days: '30' }),
    ];
    for (const answer of answers) {
      expect(JSON.stringify(answer.body) + (answer.csv ?? '')).not.toMatch(MONEY);
    }
  });

  it('should answer an unknown action with 400', () => {
    expect(call({ action: 'nope' }).status).toBe(400);
  });
});
