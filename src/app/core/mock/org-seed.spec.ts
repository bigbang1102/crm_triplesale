import { afterEach, describe, expect, it } from 'vitest';
import { SEED_GROUP_MEMBERS } from './activity-group-seed';
import { SEED_EMPLOYEES, SEED_FIRST_NAMES, SEED_GROUPS, SEED_LAST_NAMES, SEED_PROVINCES, SEED_SOURCES, seedLead, seedProspect, setCastDocument } from './crm-seed';
import { type OrgDocument, setOrgDocument } from './org-seed';
import { SEED_EMPLOYEE_POSITIONS, receiversOf, resetRoleModel } from './role-store';
import { resetSharedDb } from './shared-db';
import { membersOf, queueEmployees } from './waitlist';

afterEach(() => {
  setOrgDocument(undefined);
  setCastDocument(undefined);
  resetSharedDb();
});

/** the lists of the code, in the shape of the document */
const builtIn = (): OrgDocument => ({
  employees: SEED_EMPLOYEES.map((e) => ({ ...e })),
  groups: SEED_GROUPS.map((g) => ({ ...g })),
  groupMembers: Object.fromEntries(Object.entries(SEED_GROUP_MEMBERS).map(([id, codes]) => [id, [...codes]])),
  employeePositions: Object.fromEntries(Object.entries(SEED_EMPLOYEE_POSITIONS).map(([code, list]) => [code, [...list]])),
  names: { firstNames: [...SEED_FIRST_NAMES], lastNames: [...SEED_LAST_NAMES], provinces: [...SEED_PROVINCES], sources: [...SEED_SOURCES] },
});

describe('the people and the groups taken from a document of the shared Datasource (seed.org.json)', () => {
  it('should change nothing when the document is what the code has', () => {
    const before = builtIn();
    expect(setOrgDocument(builtIn())).toBeUndefined();
    expect(builtIn()).toEqual(before);
  });

  it('should replace the employees and the groups IN PLACE, so every page that holds the lists sees the change', () => {
    const employees = SEED_EMPLOYEES;
    const doc = builtIn();
    doc.employees[1].name = 'พนักงาน จากไฟล์กลาง';
    doc.employees.push({ code: 'E109', name: 'คนใหม่', team: 'ทีม B', role: 'Staff' });
    doc.groups[0].name = 'กลุ่มจากไฟล์กลาง';
    expect(setOrgDocument(doc)).toBeUndefined();
    expect(SEED_EMPLOYEES).toBe(employees);
    expect(SEED_EMPLOYEES).toHaveLength(9);
    expect(SEED_EMPLOYEES[1].name).toBe('พนักงาน จากไฟล์กลาง');
    expect(SEED_GROUPS[0].name).toBe('กลุ่มจากไฟล์กลาง');
    // what is built from the lists when asked follows too
    expect(queueEmployees().map((e) => e.code)).toContain('E109');
  });

  it('should take the members of each group and the positions of each employee from it', () => {
    const doc = builtIn();
    doc.groupMembers = { ...doc.groupMembers, '101': ['E108'] };
    doc.employeePositions = { E108: ['Online'] };
    expect(setOrgDocument(doc)).toBeUndefined();
    // the shared database starts from the lists AFTER the document was applied (the app does it in that order)
    resetSharedDb();
    resetRoleModel();
    expect(membersOf(101)).toEqual(['E108']);
    expect(receiversOf('lead').map((e) => e.code)).toEqual(['E108']);
  });

  it('should refuse a document that does not fit, whole, and keep the lists of the code', () => {
    const before = builtIn();
    const noEmployees = { ...builtIn(), employees: [] };
    expect(setOrgDocument(noEmployees)).toMatch(/at least one row/);
    const twice = builtIn();
    twice.employees.push({ ...twice.employees[0] });
    expect(setOrgDocument(twice)).toMatch(/repeated/);
    const noName = builtIn();
    (noName.employees[0] as unknown as Record<string, unknown>)['name'] = '';
    expect(setOrgDocument(noName)).toMatch(/code, name, team and role/);
    const stranger = builtIn();
    stranger.groupMembers = { '101': ['E999'] };
    expect(setOrgDocument(stranger)).toMatch(/groupMembers/);
    const unknownGroup = builtIn();
    unknownGroup.groupMembers = { '999': ['E101'] };
    expect(setOrgDocument(unknownGroup)).toMatch(/groupMembers/);
    expect(setOrgDocument({ employees: 'x', groups: 'y' })).toMatch(/must be lists/);
    expect(setOrgDocument('nonsense')).toMatch(/must be lists/);
    expect(builtIn()).toEqual(before);
  });

  it('should take the pools of names, provinces and sources, which the sample customers are made from', () => {
    const before = seedProspect(7);
    const doc = builtIn();
    doc.names = { firstNames: ['กลาง'], lastNames: ['ไฟล์'], provinces: ['จังหวัดกลาง'], sources: ['แหล่งกลาง'] };
    expect(setOrgDocument(doc)).toBeUndefined();
    expect(seedProspect(7)).toMatchObject({ firstName: 'กลาง', lastName: 'ไฟล์', province: 'จังหวัดกลาง', source: 'แหล่งกลาง' });
    expect(setOrgDocument(undefined)).toBeUndefined();
    expect(seedProspect(7)).toEqual(before);
  });

  it('should refuse names that do not fit, and keep the pools of the code', () => {
    const doc = builtIn();
    doc.names = { firstNames: [], lastNames: ['x'], provinces: ['x'], sources: ['x'] };
    expect(setOrgDocument(doc)).toMatch(/names needs/);
    expect(SEED_FIRST_NAMES.length).toBeGreaterThan(1);
  });

  it('should go back to the lists of the code when the document goes', () => {
    const doc = builtIn();
    doc.employees[0].name = 'เปลี่ยน';
    setOrgDocument(doc);
    expect(SEED_EMPLOYEES[0].name).toBe('เปลี่ยน');
    expect(setOrgDocument(undefined)).toBeUndefined();
    expect(SEED_EMPLOYEES[0].name).toBe('สมชาย ใจดี');
  });

  it('should make the cast refuse an owner who is no longer an employee', () => {
    const doc = builtIn();
    doc.employees = doc.employees.filter((e) => e.code !== 'E108');
    setOrgDocument(doc);
    const lead = seedLead(1);
    expect(setCastDocument({ prospects: [], leads: [] })).toMatch(/at least one customer/);
    expect(lead.ownerCode).not.toBe('');
  });
});
