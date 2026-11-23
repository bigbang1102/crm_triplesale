import { describe, expect, it } from 'vitest';
import { buildAccounts, resolveRoles, type MockupBranch, type MockupRoleGroup, type MockupUser } from './mockup-users';

const KNOWN = ['MODULE_CRM', 'CRM_Lead_View', 'CRM_Lead_Assign', 'CRM_Lead_Assign_Sup', 'Pipeline_Lead_Trash', 'Report_A_View', 'Report_B_View'];

const GROUPS: MockupRoleGroup[] = [
  { code: 'sales', name: 'Sales', grant: ['MODULE_CRM', 'CRM_*', 'Pipeline_*'], deny: ['*_Sup', '*_Trash'] },
  { code: 'reports', name: 'Reports', grant: ['Report_*_View'] },
  { code: 'root', name: 'Root', grant: ['super_admin'] },
];

const user = (over: Partial<MockupUser> = {}): MockupUser => ({ username: 'Anna', password: 'x', profileName: 'Anna', employeeId: 1, roleGroups: ['sales'], ...over });

describe('resolveRoles', () => {
  it('should expand a pattern over the known keys and drop what a deny pattern matches', () => {
    expect(resolveRoles(user(), GROUPS, KNOWN).sort()).toEqual(['CRM_Lead_Assign', 'CRM_Lead_View', 'MODULE_CRM']);
  });

  it('should join several groups and add the extra roles of the user', () => {
    const roles = resolveRoles(user({ roleGroups: ['sales', 'reports'], extraRoles: ['CRM_Lead_Assign_Sup'] }), GROUPS, KNOWN);
    expect(roles).toContain('Report_A_View');
    expect(roles).toContain('Report_B_View');
    // the extra role is a Sup key, and the group denies *_Sup: deny wins over every grant
    expect(roles).not.toContain('CRM_Lead_Assign_Sup');
  });

  it('should grant an exact key the app does not know as it is (super_admin)', () => {
    expect(resolveRoles(user({ roleGroups: ['root'] }), GROUPS, KNOWN)).toEqual(['super_admin']);
  });

  it('should give nothing for a group that does not exist', () => {
    expect(resolveRoles(user({ roleGroups: ['nope'] }), GROUPS, KNOWN)).toEqual([]);
  });

  it('should not read a dot in a pattern as any character', () => {
    const roles = resolveRoles(user({ roleGroups: ['dots'] }), [{ code: 'dots', name: 'd', grant: ['Report.A*'] }], ['Report.A', 'ReportXA']);
    expect(roles).toEqual(['Report.A']);
  });
});

describe('buildAccounts', () => {
  const branches: MockupBranch[] = [
    { id: 1, code: 'SUN', name: 'Sun' },
    { id: 2, code: 'ACE', name: 'Ace' },
  ];
  const accounts = buildAccounts([user({ branches: ['SUN', 'ACE', 'GONE'] })], GROUPS, branches, KNOWN);

  it('should find a user by name, whatever the case and the spaces', () => {
    expect(accounts.find('  anna ')?.username).toBe('Anna');
    expect(accounts.find('bob')).toBeUndefined();
  });

  it('should list the companies of a user in the order given and leave out one that is not in the catalogue', () => {
    expect(accounts.branchesOf(accounts.find('anna')!).map((b) => b.code)).toEqual(['SUN', 'ACE']);
  });
});

describe('membershipSession (one employee and one set of rights per company)', () => {
  const multi = user({
    username: 'multi',
    employeeId: 5,
    employeeCode: 'E105',
    roleGroups: ['sales'],
    branches: ['SUN', 'ACE'],
    memberships: [
      { company: 'SUN', employeeId: 5, employeeCode: 'E105', roleGroups: ['sales'] },
      { company: 'ACE', employeeId: 12, employeeCode: 'E112', roleGroups: ['reports'] },
    ],
  });
  const accounts = buildAccounts([multi, user({ username: 'plain', branches: ['SUN'] })], GROUPS, [], KNOWN);

  it('should give each company its own employee and rights', () => {
    const sun = accounts.membershipSession('multi', 'SUN');
    const ace = accounts.membershipSession('multi', 'ACE');
    expect(sun).toMatchObject({ employeeId: 5, employeeCode: 'E105' });
    expect(sun?.roles).toContain('CRM_Lead_View');
    expect(ace).toMatchObject({ employeeId: 12, employeeCode: 'E112' });
    expect(ace?.roles.sort()).toEqual(['Report_A_View', 'Report_B_View']);
  });

  it('should fall back to its own employee and groups when there are no memberships, and refuse a company the user is not in', () => {
    expect(accounts.membershipSession('plain', 'SUN')).toMatchObject({ employeeId: 1, roles: expect.arrayContaining(['MODULE_CRM']) });
    expect(accounts.membershipSession('plain', 'ACE')).toBeUndefined();
    expect(accounts.membershipSession('nobody', 'SUN')).toBeUndefined();
  });
});
