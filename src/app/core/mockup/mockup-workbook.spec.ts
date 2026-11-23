import { describe, expect, it } from 'vitest';
import { WORKBOOK_MASTER_DOC, applyWorkbookCast, workbookCrmDoc } from './mockup-workbook';

const A1 = 'businessentity (code)';
const master = {
  '11_employee': [{ code: 'A1-E001', name: 'ธนวัฒน์', [A1]: 'A1' }],
  '20_activitygroup': [{ code: 'A1-AG-CAR', name: 'ขายรถ', [A1]: 'A1' }],
  '22_activity': [{ code: 'A1-AG-CAR-01', name: 'ติดต่อ', 'activitygroup (code)': 'A1-AG-CAR', [A1]: 'A1' }],
  '23_opportunityconfig': [{ code: 'A1-OC-CAR', name: 'ขายรถ', [A1]: 'A1' }],
  '24_oc_grouppipeline': [{ 'opportunityconfig (code)': 'A1-OC-CAR', orderno: 1, 'activitygroup (code)': 'A1-AG-CAR', [A1]: 'A1' }],
};
const crm = {
  company: 'A1',
  prospects: [{ code: 'PS-1', name: 'นันทิดา', lastname: 'บุญมา' }],
  leads: [],
  opportunities: [{ txNo: 'OP-1', createtime: '2026-04-21 09:30:00', opp_status: 'hot', prospect: 'PS-1', amount: 5, employee: 'A1-E001', currentStep: { activitygroup: 'A1-AG-CAR' } }],
};

describe('mockup workbook cast', () => {
  it('should name the document of a company in lower case', () => {
    expect(workbookCrmDoc('B2')).toBe('seed.workbook.crm.b2');
  });

  it('should replace seed.org, seed.crm and the lists of ref.shared, keeping the steps of the formulas', () => {
    const all: Record<string, unknown> = { [workbookCrmDoc('A1')]: crm, [WORKBOOK_MASTER_DOC]: master, 'ref.shared': { groupSteps: { CS: ['รับลีด'] }, apptSubjects: ['x'] } };
    expect(applyWorkbookCast(all, 'A1')).toEqual({ company: 'A1', prospects: 1, leads: 1, skipped: 0 });
    expect((all['seed.org'] as { employees: { code: string }[] }).employees[0]?.code).toBe('A1-E001');
    expect((all['seed.crm'] as { leads: unknown[] }).leads).toHaveLength(1);
    const shared = all['ref.shared'] as { groupSteps: Record<string, string[]>; apptSubjects: string[] };
    expect(shared.groupSteps).toEqual({ CS: ['รับลีด'], CAR: ['ติดต่อ'] });
    expect(shared.apptSubjects).toEqual(['x']);
  });

  it('should give the pages that keep their own lists the products, steps, teams and people of the company, keeping the keys of the formulas', () => {
    const all: Record<string, unknown> = {
      [workbookCrmDoc('A1')]: crm,
      [WORKBOOK_MASTER_DOC]: master,
      'ref.opportunities': { products: [], saleGroups: [], groupSteps: { '101': ['x'] } },
      'ref.prospects': { products: [], groupEmployees: { '101': ['E101'] } },
      'ref.leads': { leads: [], owners: [], ownerOfEmployee: { E101: 'CS0001' }, superiors: { CS0002: ['CS0001'] }, salesTeams: { 'สายงานขาย A': ['ทีม A1'] } },
    };
    applyWorkbookCast(all, 'A1');
    const opp = all['ref.opportunities'] as { products: { groups: number[] }[]; groupSteps: Record<string, string[]> };
    expect(opp.groupSteps['101']).toEqual(['x']);
    expect(Object.keys(opp.groupSteps)).toContain('2101');
    expect(opp.products[0]?.groups).toEqual([2101]);
    const prospects = all['ref.prospects'] as { groupEmployees: Record<string, string[]> };
    expect(prospects.groupEmployees['101']).toEqual(['E101']);
    const leads = all['ref.leads'] as { leads: unknown[]; ownerOfEmployee: Record<string, string>; superiors: Record<string, string[]>; salesTeams: Record<string, string[]> };
    expect(leads.ownerOfEmployee).toMatchObject({ E101: 'CS0001', 'A1-E001': 'A1-E001' });
    expect(Object.keys(leads.superiors)).toContain('CS0002');
    expect(Object.keys(leads.salesTeams)).toEqual(['สายงานขาย A', 'สายงานขาย A1']);
    expect(all['ref.opportunityDetail']).toBeDefined();
  });

  it('should give the detail page the probability of each step by its name (a step of 100 / 0 closes the opportunity)', () => {
    const withSteps = { ...master, '25_oc_steppipeline': [{ 'activity (code)': 'A1-AG-CAR-01', probability: 100, [A1]: 'A1' }, { 'activity (code)': 'nobody', probability: 0, [A1]: 'A1' }] };
    const all: Record<string, unknown> = { [workbookCrmDoc('A1')]: crm, [WORKBOOK_MASTER_DOC]: withSteps };
    applyWorkbookCast(all, 'A1');
    expect((all['ref.opportunityDetail'] as { stepProbability: Record<string, number> }).stepProbability).toEqual({ ติดต่อ: 100 });
  });

  it('should leave the documents alone for a company with no workbook cast', () => {
    const all: Record<string, unknown> = { [workbookCrmDoc('A1')]: crm, [WORKBOOK_MASTER_DOC]: master };
    expect(applyWorkbookCast(all, 'SUN')).toBeUndefined();
    expect(applyWorkbookCast(all, '')).toBeUndefined();
    expect(applyWorkbookCast({ [WORKBOOK_MASTER_DOC]: master }, 'A1')).toBeUndefined();
    expect(Object.keys(all)).toEqual([workbookCrmDoc('A1'), WORKBOOK_MASTER_DOC]);
  });
});
