import { afterEach, describe, expect, it } from 'vitest';
import { SEED_EMPLOYEES, SEED_GROUPS, SEED_LEAD_COUNT, SEED_PROSPECT_COUNT, leadIds, prospectIds, seedLead, seedProspect, setCastDocument } from './crm-seed';
import { setOrgDocument } from './org-seed';
import { buildWorkbookCast, buildWorkbookLeadRef, type WorkbookCrmDocument, type WorkbookMaster } from './workbook-cast';

const A1 = 'businessentity (code)';
const master: WorkbookMaster = {
  '05_positionorganize': [{ code: 'A1-PO-SALES', name: 'ฝ่ายขาย', [A1]: 'A1' }],
  '08_position': [
    { code: 'A1-SM', name: 'ผู้จัดการฝ่ายขาย', employee_level: 'ผู้จัดการ', 'positionorganize (code)': 'A1-PO-SALES', [A1]: 'A1' },
    { code: 'A1-SR', name: 'พนักงานขาย', employee_level: 'พนักงาน', 'positionorganize (code)': 'A1-PO-SALES', [A1]: 'A1' },
  ],
  '11_employee': [
    { code: 'A1-E001', name: 'ธนวัฒน์ ศักดิ์สิทธิ์', [A1]: 'A1' },
    { code: 'A1-E002', name: 'พิมพ์ชนก วงศ์ไพศาล', [A1]: 'A1' },
    { code: 'B1-E001', name: 'คนบริษัทอื่น', [A1]: 'B1' },
  ],
  '12_employee_position': [
    { 'employee (code)': 'A1-E001', 'position (code)': 'A1-SM', [A1]: 'A1' },
    { 'employee (code)': 'A1-E002', 'position (code)': 'A1-SR', [A1]: 'A1' },
  ],
  '16_salegroup': [{ code: 'A1-SG-01', name: 'ทีมมังกร', [A1]: 'A1' }],
  '17_saleperson': [{ code: 'A1-SP-002', 'employee (code)': 'A1-E002', 'salegroup (code)': 'A1-SG-01', [A1]: 'A1' }],
  '20_activitygroup': [
    { code: 'A1-AG-CAR', name: 'ขายรถ', [A1]: 'A1' },
    { code: 'A1-AG-INS', name: 'ประกันภัย', [A1]: 'A1' },
  ],
  '21_activitygroup_position': [{ 'activitygroup (code)': 'A1-AG-CAR', 'position (code)': 'A1-SR', [A1]: 'A1' }],
  '22_activity': [
    { code: 'A1-AG-CAR-01', name: 'ยังไม่ได้ติดต่อ', 'activitygroup (code)': 'A1-AG-CAR', [A1]: 'A1' },
    { code: 'A1-AG-CAR-02', name: 'เสนอรถ', 'activitygroup (code)': 'A1-AG-CAR', [A1]: 'A1' },
    { code: 'A1-AG-INS-01', name: 'เสนอประกัน', 'activitygroup (code)': 'A1-AG-INS', [A1]: 'A1' },
  ],
  '23_opportunityconfig': [{ code: 'A1-OC-CAR', name: 'ขายรถ', [A1]: 'A1' }],
  '24_oc_grouppipeline': [
    { 'opportunityconfig (code)': 'A1-OC-CAR', orderno: 2, 'activitygroup (code)': 'A1-AG-INS', [A1]: 'A1' },
    { 'opportunityconfig (code)': 'A1-OC-CAR', orderno: 1, 'activitygroup (code)': 'A1-AG-CAR', [A1]: 'A1' },
  ],
  '37_marketingchanel': [{ code: 'A1-MC-03', name: 'LINE OA', [A1]: 'A1' }],
};

const crm: WorkbookCrmDocument = {
  company: 'A1',
  prospects: [
    { code: 'PSA1-0001', name: 'นันทิดา', lastname: 'บุญมา', customertel: '0662681867', prospect_email: 'a@x.th', current_city: 'SPK', marketingchanel: 'A1-MC-03', contact_date: '2026-04-21' },
    { code: 'PSA1-0002', name: 'อนุชา', lastname: 'ทองมา', prospect_phone1: '0811111111', marketingchanel: 'unknown-channel' },
  ],
  leads: [],
  opportunities: [
    { txNo: 'OPA1-1', createtime: '2026-04-21 09:30:00', opp_status: 'sold', prospect: 'PSA1-0001', amount: 1000, employee: 'A1-E002', responsible: ['A1-E002'], currentStep: { activitygroup: 'A1-AG-INS' }, activityStatus: [{ changedate: '2026-04-22 13:20:00' }] },
    { txNo: 'OPA1-2', createtime: '2026-05-01 10:00:00', opp_status: 'hot', prospect: 'PSA1-0002', amount: 2000, employee: 'A1-E001', responsible: ['NOBODY'], currentStep: { activitygroup: 'A1-AG-CAR' }, activityStatus: [] },
    { txNo: 'OPA1-3', createtime: '2026-05-02 10:00:00', opp_status: 'lost', prospect: 'PS-MISSING', amount: 3000, responsible: [] },
  ],
};

describe('workbook cast', () => {
  afterEach(() => {
    setCastDocument(undefined);
    setOrgDocument(undefined);
  });

  it('should give nothing for a company without customers, employees or groups', () => {
    expect(buildWorkbookCast('A1', undefined, master)).toBeUndefined();
    expect(buildWorkbookCast('A1', { ...crm, prospects: [] }, master)).toBeUndefined();
    expect(buildWorkbookCast('Z9', crm, master)).toBeUndefined();
  });

  it('should make the employees of the company only, with the team of the sale group and a manager as Sup', () => {
    const { org } = buildWorkbookCast('A1', crm, master) ?? { org: { employees: [] } };
    expect(org.employees).toEqual([
      { code: 'A1-E001', name: 'ธนวัฒน์ ศักดิ์สิทธิ์', team: 'ฝ่ายขาย', role: 'Sup' },
      { code: 'A1-E002', name: 'พิมพ์ชนก วงศ์ไพศาล', team: 'ทีมมังกร', role: 'Staff' },
    ]);
  });

  it('should make the groups with ids of the company, the steps of each and who is in each', () => {
    const made = buildWorkbookCast('A1', crm, master);
    expect(made?.org.groups).toEqual([
      { id: 2101, code: 'CAR', name: 'ขายรถ' },
      { id: 2102, code: 'INS', name: 'ประกันภัย' },
    ]);
    expect(made?.shared.groupSteps).toEqual({ CAR: ['ยังไม่ได้ติดต่อ', 'เสนอรถ'], INS: ['เสนอประกัน'] });
    expect(made?.org.groupMembers).toEqual({ '2101': ['A1-E002'], '2102': [] });
    expect(made?.org.employeePositions).toEqual({ 'A1-E001': ['ผู้จัดการฝ่ายขาย'], 'A1-E002': ['พนักงานขาย'] });
  });

  it('should make the customers 1..n with the name of the channel and the opportunities that have a customer', () => {
    const made = buildWorkbookCast('A1', crm, master);
    expect(made?.cast.prospects.map((p) => [p.id, p.code, p.fullName, p.phone, p.source, p.province, p.createdDate])).toEqual([
      [1, 'PSA1-0001', 'นันทิดา บุญมา', '0662681867', 'LINE OA', 'SPK', '2026-04-21'],
      [2, 'PSA1-0002', 'อนุชา ทองมา', '0811111111', 'unknown-channel', 'กรุงเทพมหานคร', '2026-01-01'],
    ]);
    expect(made?.cast.leads).toHaveLength(2);
    expect(made?.skipped).toBe(1);
    expect(made?.cast.leads[0]).toMatchObject({ id: 1, code: 'OPA1-1', prospectId: 1, ownerCode: 'A1-E002', groupIdx: 1, interest: 'SUCCESS', status: 'SUCCESS', createdDate: '2026-04-21', lastContactDate: '2026-04-22', amount: 1000 });
    // an owner who is not an employee of the company falls back to the employee of the opportunity, then to the first one
    expect(made?.cast.leads[1]).toMatchObject({ ownerCode: 'A1-E001', groupIdx: 0, interest: 'HOT', status: 'ACTIVE' });
  });

  it('should make the products of the pipelines with the groups in the order of the pipeline', () => {
    const made = buildWorkbookCast('A1', crm, master);
    expect(made?.shared.products).toMatchObject([{ code: 'A1-OC-CAR', name: 'ขายรถ', usesWorkflowStep: true, groupIds: [2101, 2102] }]);
    // the team of a manager that is no sale group (his department) is one too: the pages look the group of an employee up by the name of the team
    expect(made?.shared.saleGroups).toMatchObject([{ code: 'A1-SG-01', name: 'ทีมมังกร' }, { code: 'A1-TEAM-1', name: 'ฝ่ายขาย' }]);
    for (const e of made?.org.employees ?? []) expect(made?.shared.saleGroups.some((g) => g['name'] === e.team)).toBe(true);
  });

  it('should be taken by the pages: the lists of the cast become the company, and the formulas come back', () => {
    const made = buildWorkbookCast('A1', crm, master);
    expect(setOrgDocument(made?.org)).toBeUndefined();
    expect(setCastDocument(made?.cast)).toBeUndefined();
    expect(SEED_EMPLOYEES.map((e) => e.code)).toEqual(['A1-E001', 'A1-E002']);
    expect(SEED_GROUPS.map((g) => g.id)).toEqual([2101, 2102]);
    expect([SEED_PROSPECT_COUNT, SEED_LEAD_COUNT]).toEqual([2, 2]);
    expect(prospectIds()).toEqual([1, 2]);
    expect(leadIds()).toEqual([1, 2]);
    expect(seedLead(1)).toMatchObject({ customerName: 'นันทิดา บุญมา', ownerName: 'พิมพ์ชนก วงศ์ไพศาล', groupId: 2102, status: 'SUCCESS' });
    expect(seedProspect(2).fullName).toBe('อนุชา ทองมา');
    setCastDocument(undefined);
    setOrgDocument(undefined);
    expect(SEED_EMPLOYEES[0]?.code).toBe('E101');
    expect(SEED_LEAD_COUNT).toBe(240);
  });
});

describe('workbook cast — the Lead menu', () => {
  const lpoCrm: WorkbookCrmDocument = {
    ...crm,
    leads: [
      { code: 'LD-1', name: 'นันทิดา บุญมา', contact_date: '2026-04-15', leadsource: 'LINE OA', lead_status: 'converted', res_employee: 'A1-E002', mobilephone: '0662681867', email: 'a@x.th', address: '203/31', city: 'SPK', district: 'SPK 3', postid: '10540', country: 'THA' },
      { code: 'LD-2', firstname: 'อนุชา', lastname: 'ทองมา', lead_status: 'duplicate', res_employee: 'A1-E001', leadsource: 'Facebook' },
      { code: 'LD-3', name: 'ในคิว', lead_status: 'new', waitlist_status: 'wait', res_employee: 'A1-E001' },
      { code: 'LD-4', name: 'ไม่มีเจ้าของ', lead_status: 'contacting', res_employee: 'NOBODY' },
    ],
  };
  const withCommanders: WorkbookMaster = {
    ...master,
    '08_position': [
      { code: 'A1-SM', name: 'ผู้จัดการฝ่ายขาย', employee_level: 'ผู้จัดการ', 'positionorganize (code)': 'A1-PO-SALES', [A1]: 'A1' },
      { code: 'A1-SR', name: 'พนักงานขาย', employee_level: 'พนักงาน', 'positionorganize (code)': 'A1-PO-SALES', 'commander_position1 (code)': 'A1-SM', [A1]: 'A1' },
    ],
    '04_branch': [{ code: 'A1-BR-HQ', name: 'สำนักงานใหญ่', [A1]: 'A1' }],
  };

  it('should make the leads of the menu with its statuses, the owner as an employee code and the queue without an owner', () => {
    const made = buildWorkbookCast('A1', lpoCrm, withCommanders);
    const ref = buildWorkbookLeadRef('A1', lpoCrm, withCommanders, made as NonNullable<typeof made>);
    expect(ref.leads.map((l) => [l['id'], l['code'], l['status'], l['ownerCode']])).toEqual([
      [100, 'LD-1', 'converted', 'A1-E002'],
      [101, 'LD-2', 'disqualified', 'A1-E001'],
      [102, 'LD-3', 'new', ''],
      [103, 'LD-4', 'contacting', ''],
    ]);
    expect(ref.leads[0]).toMatchObject({ name: 'นันทิดา บุญมา', phone: '0662681867', source: 'LINE OA', province: 'SPK', district: 'SPK 3', postcode: '10540', firstContactDate: '2026-04-15', contacts: [], items: [] });
    expect(ref.leads[1]?.['name']).toBe('อนุชา ทองมา');
  });

  it('should make the owners, the identity map of the employees and who is above whom from the commander positions', () => {
    const made = buildWorkbookCast('A1', lpoCrm, withCommanders);
    const ref = buildWorkbookLeadRef('A1', lpoCrm, withCommanders, made as NonNullable<typeof made>);
    expect(ref.owners.map((o) => o.code)).toEqual(['A1-E001', 'A1-E002']);
    expect(ref.ownerOfEmployee).toEqual({ 'A1-E001': 'A1-E001', 'A1-E002': 'A1-E002' });
    expect(ref.superiors).toEqual({ 'A1-E002': ['A1-E001'] });
    expect(ref.sources).toEqual(['LINE OA', 'Facebook']);
    expect(ref.salesLines).toEqual(['สายงานขาย A1']);
    expect(ref.salesTeams['สายงานขาย A1']).toContain('ทีมมังกร');
  });
});
