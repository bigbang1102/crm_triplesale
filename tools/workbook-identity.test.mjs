import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { TEST_PASSWORD, buildBranches, buildGroups, buildRoles, buildUsers, mergeByKey, roleGroupsOfEmployees, rows, withExtraRoles } from './lib/workbook-identity.mjs';

/** a workbook of two companies: A1 (group EG-A) and B1 + B2 (group EG-B); `wor.t` is an employee of B1 and B2 */
const sheets = {
  '01_entitygroup': [['code', 'name'], ['EG-A', 'ไพรม์'], ['EG-B', 'บ้านดี']],
  '02_businessentity': [['code', 'name', 'name_eng', 'entitygroup (code)'], ['A1', 'ไพรม์ ออโต้', 'Prime Auto', 'EG-A'], ['B1', 'บ้านดี ๑', 'Baandee 1', 'EG-B'], ['B2', 'บ้านดี ๒', 'Baandee 2', 'EG-B']],
  '06_role': [['code', 'name', 'name_en', 'description', 'businessentity (code)'], ['ENTITY_ADMIN', 'แอดมิน', 'Admin', 'ทุกอย่าง', 'A1'], ['LEAD_VIEWER', 'ดู Lead', 'Lead viewer', 'อ่าน', 'A1'], ['ENTITY_ADMIN', 'แอดมิน', 'Admin', 'ทุกอย่าง', 'B1']],
  '07_rolepermission': [['role (code)', 'permission (code)', 'businessentity (code)'], ['ENTITY_ADMIN', 'View_All', 'A1'], ['ENTITY_ADMIN', 'MODULE_Pipeline', 'A1'], ['ENTITY_ADMIN', 'View_All', 'A1'], ['LEAD_VIEWER', 'Pipeline_Lead_View', 'A1'], ['ENTITY_ADMIN', 'View_All', 'B1']],
  '08_position': [['code', 'name'], ['A1-EXEC', 'ผู้บริหาร'], ['B1-EXEC', 'ผู้บริหาร'], ['B2-EXEC', 'ผู้บริหาร']],
  '10_position_role': [['position (code)', 'role (code)', 'businessentity (code)'], ['A1-EXEC', 'ENTITY_ADMIN', 'A1'], ['A1-EXEC', 'LEAD_VIEWER', 'A1'], ['B1-EXEC', 'ENTITY_ADMIN', 'B1']],
  '11_employee': [
    ['code', 'usagestatus', 'username (user)', 'businessentity (code)'],
    ['A1-E001', 'release', 'tha.s', 'A1'],
    ['B1-E001', 'release', 'wor.t', 'B1'],
    ['B2-E001', 'block', 'wor.t', 'B2'],
  ],
  '12_employee_position': [['employee (code)', 'position (code)', 'is_main', 'businessentity (code)'], ['A1-E001', 'A1-EXEC', 'Y', 'A1'], ['B1-E001', 'B1-EXEC', 'Y', 'B1'], ['B2-E001', 'B2-EXEC', 'Y', 'B2']],
  '15_user': [['username', 'display name', 'employee (code)'], ['tha.s', 'ธนวัฒน์', 'A1:A1-E001'], ['wor.t', 'วรพจน์', 'B1:B1-E001']],
};

describe('workbook identity', () => {
  it('should read a sheet as objects and refuse a missing sheet', () => {
    assert.deepEqual(rows(sheets, '01_entitygroup')[0], { code: 'EG-A', name: 'ไพรม์' });
    assert.throws(() => rows(sheets, 'nope'), /no sheet/);
  });

  it('should make a group per entity group and a company per business entity, with ids that do not clash', () => {
    const groups = buildGroups(sheets);
    assert.deepEqual(groups.map((g) => [g.code, g.internalCode]), [['EG-A', 'g2001'], ['EG-B', 'g2002']]);
    const branches = buildBranches(sheets);
    assert.deepEqual(branches.map((b) => b.code), ['A1', 'B1', 'B2']);
    assert.equal(new Set(branches.map((b) => b.id)).size, 3);
    assert.equal(branches[0].name, 'Prime Auto');
    assert.equal(branches[0].nameTh, 'ไพรม์ ออโต้');
  });

  it('should make one role group per company and role with its permissions once each', () => {
    const roles = buildRoles(sheets);
    assert.deepEqual(roles.map((r) => r.code), ['A1:ENTITY_ADMIN', 'A1:LEAD_VIEWER', 'B1:ENTITY_ADMIN']);
    assert.deepEqual(roles[0].grant, ['View_All', 'MODULE_Pipeline']);
    assert.deepEqual(roles[1].grant, ['Pipeline_Lead_View']);
  });

  it('should give an employee the roles of the position, company by company', () => {
    const groups = roleGroupsOfEmployees(sheets);
    assert.deepEqual(groups.get('A1-E001'), ['A1:ENTITY_ADMIN', 'A1:LEAD_VIEWER']);
    assert.deepEqual(groups.get('B2-E001'), []);
  });

  it('should make an account per user with a membership per company, the group of the home company and the test password', () => {
    const [single, multi] = buildUsers(sheets);
    assert.equal(single.password, TEST_PASSWORD);
    assert.equal(single.group, 'EG-A');
    assert.deepEqual(single.branches, ['A1']);
    assert.deepEqual(single.roleGroups, ['A1:ENTITY_ADMIN', 'A1:LEAD_VIEWER']);
    assert.match(single.note, /A1 · ผู้บริหาร \(A1-E001\)/);
    assert.equal(multi.group, 'EG-B');
    assert.deepEqual(multi.memberships.map((m) => [m.company, m.status]), [['B1', 'release'], ['B2', 'block']]);
    assert.notEqual(multi.memberships[0].employeeId, multi.memberships[1].employeeId);
  });

  it('should add only what the list does not have, whatever the case of the key', () => {
    const { list, added } = mergeByKey([{ code: 'sun' }], [{ code: 'SUN' }, { code: 'EG-A' }], 'code');
    assert.equal(added, 1);
    assert.deepEqual(list.map((e) => e.code), ['sun', 'EG-A']);
    assert.deepEqual(mergeByKey(undefined, [{ code: 'x' }], 'code').list, [{ code: 'x' }]);
  });
});

describe('withExtraRoles', () => {
  it('should give the OPP_CREATOR role to the A1 accounts that hold an OPP_ role, once, and nobody else', () => {
    assert.deepEqual(withExtraRoles('A1', ['A1:OPP_VIEWER']), ['A1:OPP_VIEWER', 'A1:OPP_CREATOR']);
    assert.deepEqual(withExtraRoles('A1', ['A1:OPP_VIEWER', 'A1:OPP_CREATOR']), ['A1:OPP_VIEWER', 'A1:OPP_CREATOR']);
    assert.deepEqual(withExtraRoles('A1', ['A1:LEAD_VIEWER']), ['A1:LEAD_VIEWER']);
    assert.deepEqual(withExtraRoles('B1', ['B1:OPP_VIEWER']), ['B1:OPP_VIEWER']);
  });
});
