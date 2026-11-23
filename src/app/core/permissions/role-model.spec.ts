import { afterEach, describe, expect, it } from 'vitest';
import { PERMISSIONS, PERMISSION_GROUPS, ROLE_CATALOG, canReceive, closed, dependenciesOf, grant, lostReceivers, positionPermissions, receiverMissing, revoke, setOfRole, setRoleCatalog, standardPositions, standardRoles, warningsOf, type RoleCatalog } from './role-model';

describe('the catalog of roles and permissions', () => {
  it('should hold the 186 permissions in 11 groups, every one in a known group', () => {
    expect(PERMISSIONS).toHaveLength(186);
    expect(PERMISSION_GROUPS).toHaveLength(11);
    const groups = new Set(PERMISSION_GROUPS.map((g) => g.id));
    expect(PERMISSIONS.every((p) => groups.has(p.group))).toBe(true);
  });

  it('should hold the 69 standard roles with only known permissions, and 25 positions with known roles', () => {
    const codes = new Set(PERMISSIONS.map((p) => p.code));
    expect(ROLE_CATALOG.roles).toHaveLength(69);
    expect(ROLE_CATALOG.roles.every((r) => r.permissions.every((c) => codes.has(c)))).toBe(true);
    const roleCodes = new Set(ROLE_CATALOG.roles.map((r) => r.code));
    expect(standardPositions()).toHaveLength(25);
    expect(ROLE_CATALOG.positions.every((p) => p.roles.every((c) => roleCodes.has(c)))).toBe(true);
  });
});

describe('what a permission needs first', () => {
  it('should need the module, the view and the wait list for the matching actions', () => {
    expect(dependenciesOf('Pipeline_Lead_Edit')).toEqual(expect.arrayContaining(['MODULE_Pipeline', 'Pipeline_Lead_View']));
    expect(dependenciesOf('Pipeline_Lead_Assign')).toContain('Pipeline_Wait_list_Access');
    expect(dependenciesOf('Pipeline_Lead_Attachment_Upload')).toContain('Pipeline_Lead_Attachment_View');
    expect(dependenciesOf('Pipeline_Lead_View')).toEqual(['MODULE_Pipeline']);
    expect(dependenciesOf('MODULE_Pipeline')).toEqual([]);
    expect(dependenciesOf('unknown')).toEqual([]);
  });

  it('should tick what is needed with a permission, in order, and not twice', () => {
    const first = grant(new Set(), 'Pipeline_Prospect_Edit');
    expect(first.added[0]).toBe('Pipeline_Prospect_Edit');
    expect(first.added).toEqual(expect.arrayContaining(['Pipeline_Prospect_View', 'MODULE_Pipeline']));
    expect(grant(first.set, 'Pipeline_Prospect_Edit').added).toEqual([]);
    expect(grant(new Set(), 'nothing').added).toEqual([]);
  });

  it('should take out what needs a permission when it goes, and leave the rest', () => {
    const { set } = grant(new Set(), 'Pipeline_Prospect_Attachment_Upload');
    const out = revoke(set, 'Pipeline_Prospect_View');
    expect(out.removed[0]).toBe('Pipeline_Prospect_View');
    expect(out.removed).toEqual(expect.arrayContaining(['Pipeline_Prospect_Attachment_Upload', 'Pipeline_Prospect_Attachment_View']));
    expect(out.set.has('MODULE_Pipeline')).toBe(true);
    expect(revoke(set, 'Chat_View_Assigned').removed).toEqual([]);
  });

  it('should close a list of codes with what they need and drop unknown ones', () => {
    const set = new Set(closed(['Pipeline_Lead_Edit', 'NOT_A_PERMISSION']));
    expect(set.has('Pipeline_Lead_View')).toBe(true);
    expect(set.has('MODULE_Pipeline')).toBe(true);
    expect(set.has('NOT_A_PERMISSION')).toBe(false);
  });
});

describe('the minimum permissions of a receiver (BR-LDP-16 / OP-31)', () => {
  const roles = standardRoles();
  const byCode = (c: string) => roles.find((r) => r.code === c)!;

  it('should count a person as able to receive a document with its View + Edit', () => {
    expect(canReceive(setOfRole(byCode('LEAD_RESPONSIBLE')), 'lead')).toBe(true);
    expect(canReceive(setOfRole(byCode('PROSPECT_RESPONSIBLE')), 'prospect')).toBe(true);
    expect(canReceive(setOfRole(byCode('OPP_RESPONSIBLE')), 'opportunity')).toBe(true);
  });

  it('should not count View alone, or the Edit of another document', () => {
    expect(canReceive(setOfRole(byCode('LEAD_VIEWER')), 'lead')).toBe(false);
    expect(receiverMissing(setOfRole(byCode('LEAD_VIEWER'))).lead).toEqual(['Pipeline_Lead_Edit']);
    expect(canReceive(setOfRole(byCode('PROSPECT_RESPONSIBLE')), 'opportunity')).toBe(false);
  });

  it('should add the permissions of every released role of a position and tell about the others', () => {
    const cs = byCode('PROSPECT_RESPONSIBLE');
    const draft = { ...byCode('OPP_RESPONSIBLE'), status: 'draft' as const };
    const result = positionPermissions({ roleIds: [cs.id, draft.id] }, [cs, draft]);
    expect(canReceive(result.set, 'prospect')).toBe(true);
    expect(canReceive(result.set, 'opportunity')).toBe(false);
    expect(result.inactive.map((r) => r.code)).toEqual(['OPP_RESPONSIBLE']);
  });

  it('should follow the default roles of the positions: MKT receives Leads, CS receives customers, the others receive opportunities', () => {
    const positions = standardPositions();
    const can = (code: string, kind: 'lead' | 'prospect' | 'opportunity') => canReceive(positionPermissions(positions.find((p) => p.code === code)!, roles).set, kind);
    expect(can('Online', 'lead')).toBe(true);
    expect(can('Online', 'opportunity')).toBe(false);
    expect(can('CS', 'prospect')).toBe(true);
    expect(can('CS', 'opportunity')).toBe(true);
    expect(can('AN', 'prospect')).toBe(false);
    expect(can('AN', 'opportunity')).toBe(true);
    expect(can('AMD', 'lead')).toBe(false);
  });

  it('should find the positions that lose the right to receive when a role changes, and only those', () => {
    const positions = standardPositions();
    const after = roles.map((r) => (r.permissions.includes('Pipeline_Opportunity_Edit') ? { ...r, permissions: r.permissions.filter((c) => c !== 'Pipeline_Opportunity_Edit') } : r));
    const lost = lostReceivers(positions, roles, positions, after);
    expect(lost.length).toBeGreaterThan(0);
    expect(lost.every((l) => l.kinds.includes('opportunity') && l.missing.opportunity.includes('Pipeline_Opportunity_Edit'))).toBe(true);
    expect(lost.find((l) => l.position.code === 'Online')).toBeUndefined();
    expect(lostReceivers(positions, roles, positions, roles)).toEqual([]);
  });
});

describe('the warnings of a combined set', () => {
  it('should warn about a wait list with nothing to see, and about a chat without a document', () => {
    const wl = warningsOf(new Set(['Pipeline_Wait_list_Access']));
    expect(wl.find((w) => w.level === 'error')?.finding).toContain('Wait_list_Access');
    const view = warningsOf(new Set(['Pipeline_Lead_View']));
    expect(view.map((w) => w.finding).join()).toContain('Chat_View_Assigned');
  });

  it('should say nothing about a role that is fine', () => {
    expect(warningsOf(new Set())).toEqual([]);
  });
});

describe('the catalog taken from a document of the shared Datasource (seed.roles.json)', () => {
  afterEach(() => setRoleCatalog(undefined));

  const builtIn = (): RoleCatalog => JSON.parse(JSON.stringify(ROLE_CATALOG)) as RoleCatalog;

  it('should change nothing when the document is what the code has', () => {
    const before = builtIn();
    expect(setRoleCatalog(builtIn())).toBeUndefined();
    expect(builtIn()).toEqual(before);
  });

  it('should replace the lists in place and work out the dependencies of a new permission by the rules of the code', () => {
    const permissions = PERMISSIONS;
    const doc = builtIn();
    doc.permissions.push({ code: 'Pipeline_Lead_Archive', group: 'lead', description: 'เก็บ Lead เข้าคลัง' });
    doc.roles[0].name = 'ชื่อจากไฟล์กลาง';
    expect(setRoleCatalog(doc)).toBeUndefined();
    expect(PERMISSIONS).toBe(permissions);
    expect(PERMISSIONS).toHaveLength(187);
    expect(dependenciesOf('Pipeline_Lead_Archive')).toEqual(expect.arrayContaining(['MODULE_Pipeline', 'Pipeline_Lead_View']));
    expect(grant(new Set(), 'Pipeline_Lead_Archive').added).toEqual(expect.arrayContaining(['Pipeline_Lead_Archive', 'Pipeline_Lead_View']));
    expect(standardRoles()[0].name).toBe('ชื่อจากไฟล์กลาง');
  });

  it('should refuse a document that does not fit, whole, and keep the catalog of the code', () => {
    const noGroupOfIt = builtIn();
    noGroupOfIt.permissions[0].group = 'nowhere';
    expect(setRoleCatalog(noGroupOfIt)).toMatch(/permission needs/);
    const unknownInRole = builtIn();
    unknownInRole.roles[0].permissions.push('NOT_THERE');
    expect(setRoleCatalog(unknownInRole)).toMatch(/role needs/);
    const unknownRole = builtIn();
    unknownRole.positions[0].roles.push('NO_ROLE');
    expect(setRoleCatalog(unknownRole)).toMatch(/position needs/);
    const twice = builtIn();
    twice.permissions.push({ ...twice.permissions[0] });
    expect(setRoleCatalog(twice)).toMatch(/permission needs/);
    expect(setRoleCatalog({ groups: [] })).toMatch(/must be lists/);
    expect(setRoleCatalog('x')).toMatch(/must be lists/);
    expect(PERMISSIONS).toHaveLength(186);
  });

  it('should go back to the catalog of the code when the document goes', () => {
    const doc = builtIn();
    doc.permissions.pop();
    doc.roles.forEach((r) => (r.permissions = r.permissions.filter((c) => c !== PERMISSIONS[PERMISSIONS.length - 1].code)));
    setRoleCatalog(doc);
    expect(PERMISSIONS).toHaveLength(185);
    setRoleCatalog(undefined);
    expect(PERMISSIONS).toHaveLength(186);
  });
});
