import { afterEach, describe, expect, it } from 'vitest';
import { PERMISSIONS } from '../permissions/role-model';
import { canReceiveWork, deleteRole, employeesOfPosition, importStandardRoles, permissionsOfEmployee, positionByCode, positionsOfEmployee, receiversOf, resetRoleModel, roleByCode, rolesOf, saveRole, setGroupPermissions, setPositionRoles, setRolePermission } from './role-store';

afterEach(() => resetRoleModel());

const idOf = (r: ReturnType<typeof saveRole>): string => (r as { id: string }).id;

describe('who can receive work (the minimum set of a receiver)', () => {
  it('should start from the seed: the cast is spread over the positions of the chart', () => {
    expect(rolesOf()).toHaveLength(69);
    expect(positionsOfEmployee('E101').map((p) => p.code)).toEqual(['CS-Sup']);
    expect(positionsOfEmployee('E102').map((p) => p.code)).toEqual(['CS', 'Online']);
    expect(positionsOfEmployee('E999')).toEqual([]);
    expect(employeesOfPosition('CS').map((e) => e.code)).toEqual(['E102', 'E103']);
    expect(permissionsOfEmployee('E999').size).toBe(0);
  });

  it('should let the customer service receive customers, the others receive opportunities and marketing receive leads', () => {
    expect(receiversOf('prospect').map((e) => e.code)).toEqual(['E101', 'E102', 'E103']);
    expect(receiversOf('lead').map((e) => e.code)).toEqual(['E102', 'E107']); // E102 holds two positions
    expect(receiversOf('opportunity').map((e) => e.code)).toEqual(['E101', 'E102', 'E103', 'E104', 'E105', 'E106', 'E108']);
    expect(canReceiveWork('lead', 'E101')).toBe(false);
    expect(canReceiveWork('opportunity', 'E107')).toBe(false); // marketing only
    expect(canReceiveWork('opportunity', 'E999')).toBe(false);
  });

  it('should follow a change of the roles of a position, and tell which receiver is lost', () => {
    const analyst = positionByCode('AN')!;
    // OPP_COLLABORATOR has View + Edit of the opportunity too, so it counts as well (note 5 of Default_Role_by_Action_v8)
    const gone = [roleByCode('OPP_RESPONSIBLE')!.id, roleByCode('OPP_COLLABORATOR')!.id];
    const result = setPositionRoles('AN', analyst.roleIds.filter((id) => !gone.includes(id)));
    expect(result.ok).toBe(true);
    expect(result.lost.map((l) => l.position.code)).toEqual(['AN']);
    expect(canReceiveWork('opportunity', 'E104')).toBe(false);
    expect(canReceiveWork('opportunity', 'E105')).toBe(true);
    expect(setPositionRoles('NOPE', []).ok).toBe(false);
  });

  it('should give nothing for a role that is not released', () => {
    for (const code of ['OPP_RESPONSIBLE', 'OPP_COLLABORATOR']) {
      const role = roleByCode(code)!;
      expect(saveRole({ id: role.id, code: role.code, name: role.name, status: 'block' }).ok).toBe(true);
    }
    expect(canReceiveWork('opportunity', 'E104')).toBe(false);
  });
});

describe('the roles', () => {
  it('should add a role, refuse a code that is taken or missing, and keep the permissions of an edited one', () => {
    const made = saveRole({ code: 'TEST_ROLE', name: 'ทดสอบ', status: 'draft' });
    expect(made).toMatchObject({ ok: true });
    expect(saveRole({ code: 'TEST_ROLE', name: 'ซ้ำ', status: 'draft' })).toEqual({ ok: false, error: 'codeTaken' });
    expect(saveRole({ code: ' ', name: 'x', status: 'draft' })).toEqual({ ok: false, error: 'codeRequired' });
    expect(saveRole({ code: 'X', name: ' ', status: 'draft' })).toEqual({ ok: false, error: 'nameRequired' });
    expect(saveRole({ id: 'role-nope', code: 'Y', name: 'y', status: 'draft' })).toEqual({ ok: false, error: 'unknown' });
    const id = idOf(made);
    setRolePermission(id, 'Pipeline_Lead_View', true);
    saveRole({ id, code: 'TEST_ROLE', name: 'เปลี่ยนชื่อ', status: 'release' });
    expect(roleByCode('TEST_ROLE')).toMatchObject({ name: 'เปลี่ยนชื่อ', status: 'release' });
    expect(roleByCode('TEST_ROLE')!.permissions).toContain('Pipeline_Lead_View');
  });

  it('should tick a permission with what it needs, and untick it with what needs it', () => {
    const id = idOf(saveRole({ code: 'T2', name: 'T2', status: 'release' }));
    const on = setRolePermission(id, 'Pipeline_Lead_Edit', true)!;
    expect(on.added).toEqual(expect.arrayContaining(['Pipeline_Lead_Edit', 'Pipeline_Lead_View', 'MODULE_Pipeline']));
    const off = setRolePermission(id, 'Pipeline_Lead_View', false)!;
    expect(off.removed).toEqual(expect.arrayContaining(['Pipeline_Lead_View', 'Pipeline_Lead_Edit']));
    expect(roleByCode('T2')!.permissions).toEqual(['MODULE_Pipeline']);
    expect(setRolePermission('nope', 'MODULE_Pipeline', true)).toBeUndefined();
  });

  it('should tick and untick a whole group', () => {
    const id = idOf(saveRole({ code: 'T3', name: 'T3', status: 'release' }));
    setGroupPermissions(id, 'lead', true);
    const leadPerms = PERMISSIONS.filter((p) => p.group === 'lead').map((p) => p.code);
    expect(leadPerms.every((c) => roleByCode('T3')!.permissions.includes(c))).toBe(true);
    setGroupPermissions(id, 'lead', false);
    expect(roleByCode('T3')!.permissions.some((c) => leadPerms.includes(c))).toBe(false);
  });

  it('should tell which positions lose the right to receive when the last Edit of a role goes, and follow it', () => {
    const role = roleByCode('PROSPECT_RESPONSIBLE')!;
    const change = setRolePermission(role.id, 'Pipeline_Prospect_Edit', false)!;
    expect(change.lost.map((l) => l.position.code)).toEqual(expect.arrayContaining(['CS', 'CS-Sup']));
    expect(canReceiveWork('prospect', 'E102')).toBe(false);
  });

  it('should refuse to delete a role a position holds, and delete a free one', () => {
    expect(deleteRole(roleByCode('OPP_RESPONSIBLE')!.id).ok).toBe(false);
    const id = idOf(saveRole({ code: 'T4', name: 'T4', status: 'draft' }));
    expect(deleteRole(id)).toEqual({ ok: true });
    expect(roleByCode('T4')).toBeUndefined();
  });

  it('should import only the standard roles that are missing', () => {
    expect(importStandardRoles()).toBe(0);
    const id = roleByCode('PROSPECT_PDPA_DATA')!.id;
    expect(deleteRole(id).ok).toBe(false); // positions hold it
    setPositionRoles('CS-Sup', []);
    setPositionRoles('CS', []);
    expect(deleteRole(id).ok).toBe(true);
    expect(importStandardRoles()).toBe(1);
    expect(roleByCode('PROSPECT_PDPA_DATA')).toBeDefined();
  });
});
