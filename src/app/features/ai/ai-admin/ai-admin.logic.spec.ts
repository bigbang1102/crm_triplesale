import { describe, expect, it } from 'vitest';
import {
  DRILL_ROOT,
  barWidths,
  breadcrumb,
  canDrill,
  dayOfMonth,
  describeError,
  drillInto,
  drillUp,
  formatDateTime,
  formatNumber,
  formatPercent,
  formatTokens,
  levelOf,
  monthLabel,
  monthOf,
  nearLimitRows,
  overviewRequest,
  percentOf,
  quotaStatus,
  quotaStatusOf,
  scopeFromParams,
  scopeKeyOf,
  scopeLevelOf,
  scopeToParams,
  shiftMonth,
  tightestQuota,
} from './ai-admin.logic';
import type { QuotaChainItem, QuotaInfo } from './ai-admin.types';

const quota = (over: Partial<QuotaInfo>): QuotaInfo => ({
  limit: 1000,
  used: 0,
  remaining: 1000,
  percent: 0,
  warnPercent: 80,
  enabled: true,
  ...over,
});

describe('formatting', () => {
  it('should abbreviate large token counts and keep small ones exact', () => {
    expect(formatTokens(0)).toBe('0');
    expect(formatTokens(950)).toBe('950');
    expect(formatTokens(9_999)).toBe('9,999');
    expect(formatTokens(12_345)).toBe('12.3K');
    expect(formatTokens(1_234_567)).toBe('1.2M');
    expect(formatTokens(3_400_000_000)).toBe('3.4B');
  });

  it('should treat missing or invalid numbers as zero', () => {
    expect(formatTokens(undefined)).toBe('0');
    expect(formatTokens(Number.NaN)).toBe('0');
    expect(formatNumber(null)).toBe('0');
    expect(formatPercent(undefined)).toBe('0%');
  });

  it('should format exact numbers with thousands separators and percentages with one decimal', () => {
    expect(formatNumber(1_234_567.4)).toBe('1,234,567');
    expect(formatPercent(12.345)).toBe('12.3%');
    expect(percentOf(1, 4)).toBe(25);
    expect(percentOf(5, 0)).toBe(0);
  });

  it('should write a Thai-time timestamp as dd/MM/yyyy HH:mm and leave garbage as it is', () => {
    expect(formatDateTime('2026-11-21T09:12:33+07:00')).toBe('21/11/2026 09:12');
    expect(formatDateTime('2026-11-21T02:05:00Z')).toBe('21/11/2026 09:05');
    expect(formatDateTime('nope')).toBe('nope');
  });
});

describe('months', () => {
  it('should take the month in Thai time (a late UTC evening is already next day)', () => {
    expect(monthOf(new Date('2026-11-30T20:00:00Z'))).toBe('2026-12');
    expect(monthOf(new Date('2026-11-15T05:00:00Z'))).toBe('2026-11');
  });

  it('should shift across year boundaries in both directions', () => {
    expect(shiftMonth('2026-11', 1)).toBe('2026-12');
    expect(shiftMonth('2026-12', 1)).toBe('2027-01');
    expect(shiftMonth('2026-01', -1)).toBe('2025-12');
    expect(shiftMonth('2026-11', -5)).toBe('2026-06');
  });

  it('should label a month in Thai (Buddhist year) or English', () => {
    expect(monthLabel('2026-11', 'th')).toContain('2569');
    expect(monthLabel('2026-11', 'en')).toContain('2026');
    expect(monthLabel('x', 'en')).toBe('x');
    expect(dayOfMonth('2026-11-05')).toBe('5');
  });
});

describe('quota status', () => {
  it('should be ok below the warn level, warn from it, full at 100%', () => {
    expect(quotaStatusOf(79.9, 80)).toBe('ok');
    expect(quotaStatusOf(80, 80)).toBe('warn');
    expect(quotaStatusOf(99.9, 80)).toBe('warn');
    expect(quotaStatusOf(100, 80)).toBe('full');
    expect(quotaStatusOf(250, 80)).toBe('full');
  });

  it('should never warn for a disabled or missing quota', () => {
    expect(quotaStatusOf(150, 80, false)).toBe('ok');
    expect(quotaStatus(null)).toBe('ok');
    expect(quotaStatus(quota({ percent: 90 }))).toBe('warn');
  });

  it('should find the chain item with the least tokens left among enabled quotas', () => {
    const chain: QuotaChainItem[] = [
      { level: 'COMPANY', key: 'A1', name: 'A', quota: quota({ remaining: 900 }) },
      { level: 'DEPARTMENT', key: 'D', name: 'D', quota: quota({ remaining: 40 }) },
      { level: 'USER', key: 'U', name: 'U', quota: quota({ remaining: 5, enabled: false }) },
    ];
    expect(tightestQuota(chain)?.key).toBe('D');
    expect(tightestQuota([])).toBeUndefined();
    expect(tightestQuota([{ level: 'USER', key: 'U', name: 'U', quota: null }])).toBeUndefined();
  });

  it('should list quota warnings worst first', () => {
    const rows = [
      { id: 'a', quota: quota({ percent: 85 }) },
      { id: 'b', quota: quota({ percent: 10 }) },
      { id: 'c', quota: quota({ percent: 120 }) },
      { id: 'd', quota: null },
    ];
    expect(nearLimitRows(rows).map((r) => r.id)).toEqual(['c', 'a']);
  });
});

describe('drill-down', () => {
  const company = { key: 'A1', name: 'Alpha' };
  const department = { key: 'A1-X', name: 'Sales' };

  it('should go company → department → employee and stop at the employee level', () => {
    expect(levelOf(DRILL_ROOT)).toBe('company');
    const inCompany = drillInto(DRILL_ROOT, company);
    expect(inCompany).toEqual({ company: { code: 'A1', name: 'Alpha' }, department: null });
    expect(levelOf(inCompany)).toBe('department');
    const inDepartment = drillInto(inCompany, department);
    expect(levelOf(inDepartment)).toBe('user');
    expect(canDrill(inDepartment)).toBe(false);
    expect(drillInto(inDepartment, { key: 'E1', name: 'Somchai' })).toBe(inDepartment);
  });

  it('should go back up through the breadcrumb', () => {
    const deep = drillInto(drillInto(DRILL_ROOT, company), department);
    expect(drillUp(deep, 1)).toEqual({ company: { code: 'A1', name: 'Alpha' }, department: null });
    expect(drillUp(deep, 0)).toBe(DRILL_ROOT);
    expect(breadcrumb(deep, 'All').map((c) => c.label)).toEqual(['All', 'Alpha', 'Sales']);
    expect(breadcrumb(DRILL_ROOT, 'All')).toEqual([{ label: 'All', depth: 0 }]);
  });

  it('should build the overview request of a state', () => {
    expect(overviewRequest('2026-11', DRILL_ROOT)).toEqual({ month: '2026-11', level: 'company' });
    const deep = drillInto(drillInto(DRILL_ROOT, company), department);
    expect(overviewRequest('2026-11', deep)).toEqual({
      month: '2026-11',
      level: 'user',
      company: 'A1',
      department: 'A1-X',
    });
  });

  it('should size bars against the biggest row', () => {
    expect(barWidths([{ tokens: 50 }, { tokens: 100 }, { tokens: 0 }])).toEqual([50, 100, 0]);
    expect(barWidths([])).toEqual([]);
    expect(barWidths([{ tokens: 0 }])).toEqual([0]);
  });
});

describe('scope in the URL', () => {
  it('should round-trip a scope through query params, names containing a bar included', () => {
    const scope = {
      company: { code: 'A1', name: 'Alpha | Beta' },
      department: { code: 'D', name: 'Sales' },
      user: { code: 'E1', name: 'Somchai' },
    };
    const params = scopeToParams(scope);
    expect(scopeFromParams((name) => params[name])).toEqual(scope);
    expect(scopeLevelOf(scope)).toBe('user');
    expect(scopeKeyOf(scope)).toBe('E1');
  });

  it('should ignore a department or user without its parent', () => {
    const scope = scopeFromParams((name) => ({ department: 'D|Sales', user: 'E1|Somchai' })[name]);
    expect(scope).toEqual({ company: null, department: null, user: null });
    expect(scopeLevelOf(scope)).toBeNull();
    expect(scopeKeyOf(scope)).toBe('');
  });
});

describe('describeError', () => {
  const t = (key: string) => key;

  it('should say the service is unreachable for status 0, ignoring the message', () => {
    expect(describeError(Object.assign(new Error('x'), { status: 0 }), t)).toBe(
      'app.aiAdmin.err.network',
    );
  });

  it('should show the service message, else a generic one per status', () => {
    expect(describeError(Object.assign(new Error('ไม่มีสิทธิ์'), { status: 403 }), t)).toBe(
      'ไม่มีสิทธิ์',
    );
    expect(describeError(Object.assign(new Error(''), { status: 403 }), t)).toBe(
      'app.aiAdmin.err.forbidden',
    );
    expect(describeError(Object.assign(new Error(''), { status: 500 }), t)).toBe(
      'app.aiAdmin.err.generic',
    );
    expect(describeError('boom', t)).toBe('app.aiAdmin.err.generic');
  });
});
