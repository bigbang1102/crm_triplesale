import { describe, expect, it } from 'vitest';
import type { CastLeadRow, CastProspectRow } from './crm-seed';
import type { OrgDocument } from './org-seed';
import { buildWorkbookForecast } from './workbook-forecast';

const org = {
  employees: [
    { code: 'A1-E1', name: 'สมศรี', team: 'ทีมขาย 1', role: 'Staff' },
    { code: 'A1-E2', name: 'ผู้จัดการ', team: 'ทีมขาย 1', role: 'Sup' },
    { code: 'A1-E3', name: 'วิชัย', team: 'ทีมขาย 2', role: 'Staff' },
  ],
} as unknown as OrgDocument;
const prospects = [{ id: 1, fullName: 'ลูกค้า หนึ่ง' }, { id: 2, fullName: 'ลูกค้า สอง' }] as CastProspectRow[];
const lead = (o: Partial<CastLeadRow>): CastLeadRow => ({ id: 1, code: 'OP-1', prospectId: 1, ownerCode: 'A1-E1', groupIdx: 0, interest: 'HOT', status: 'ACTIVE', createdDate: '2026-03-10', lastContactDate: '2026-03-10', amount: 1_000_000, ...o });

describe('forecast of a workbook company', () => {
  it('should turn leads into deals with category, probability and a month that is not in the past for open ones', () => {
    const made = buildWorkbookForecast('A1', org, prospects, [
      lead({}),
      lead({ code: 'OP-2', status: 'SUCCESS', interest: 'SUCCESS', ownerCode: 'A1-E3', prospectId: 2, createdDate: '2026-05-02' }),
      lead({ code: 'OP-3', status: 'LOST', interest: 'LOST' }),
      lead({ code: 'OP-4', amount: 0 }),
    ]);
    expect(made?.deals).toHaveLength(3);
    expect(made?.deals[0]).toEqual(['OP-1', 'ลูกค้า หนึ่ง', 'A1-E1', 'committed', 80, 1_000_000, '2026-11', 'open', 'เจรจาเสนอราคา']);
    expect(made?.deals[1]).toEqual(['OP-2', 'ลูกค้า สอง', 'A1-E3', 'closed', 100, 1_000_000, '2026-05', 'won', 'ตกลงซื้อ']);
    expect(made?.deals[2]?.[7]).toBe('lost');
  });

  it('should key the teams from A so the manager role finds a team, and name the manager of each', () => {
    const made = buildWorkbookForecast('A1', org, prospects, [lead({}), lead({ code: 'OP-2', ownerCode: 'A1-E3' })]);
    expect(made?.teams).toEqual({ A: { name: 'ทีมขาย 1', mgr: 'ผู้จัดการ' }, B: { name: 'ทีมขาย 2', mgr: 'ทีมขาย 2' } });
    expect(made?.employees.map((e) => [e.id, e.team])).toEqual([['A1-E1', 'A'], ['A1-E3', 'B']]);
    expect(made?.companies).toEqual([['A1', 'A1']]);
  });

  it('should give each salesperson a monthly target, at least the minimum', () => {
    const made = buildWorkbookForecast('A1', org, prospects, [lead({ amount: 120_000_000 }), lead({ code: 'OP-2', ownerCode: 'A1-E3', amount: 100 })]);
    expect(made?.monthlyTargets).toEqual({ 'A1-E1': 10_000_000, 'A1-E3': 300_000 });
  });

  it('should make nothing when no owner is an employee or no lead has an amount', () => {
    expect(buildWorkbookForecast('A1', org, prospects, [lead({ ownerCode: 'X' })])).toBeUndefined();
    expect(buildWorkbookForecast('A1', org, prospects, [lead({ amount: 0 })])).toBeUndefined();
    expect(buildWorkbookForecast('A1', org, prospects, [])).toBeUndefined();
  });
});
