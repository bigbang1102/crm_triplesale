import { afterEach, describe, expect, it } from 'vitest';
import { seedLead, seedProspect } from '@core/mock/crm-seed';
import { resetSharedDb } from '@core/mock/shared-db';
import { ROLE } from '@core/permissions/roles';
import { LeadsMock } from '@features/leads/leads.mock';
import { canReceiveWork, resetRoleModel, roleByCode, setRolePermission } from './role-store';
import { setResponsible, queueEmployees, candidatesFor, groupIdOfOpportunity, groupsOf, historyOf, isHeadOf, isInQueue, isMember, membersOf, ownerOf, queueRows, reassign, returnToQueue, sendToQueue, takeFromQueue, updateGroupMembers } from './waitlist';
import { canGiveFromQueue, canSeeQueuePhone, employeeCodeOf, ownerBarActions, queueTabs } from '../permissions/waitlist-access';

describe('the Wait List of customers and opportunities', () => {
  afterEach(() => resetSharedDb());

  it('should give a customer to the person chosen whoever that is (no right of the receiver is asked), and every page then reads that person', () => {
    const id = 7;
    const other = queueEmployees().find((e) => e.code !== ownerOf('prospect', id) && !canReceiveWork('prospect', e.code))!;
    expect(setResponsible('prospect', id, other.code, '', '2026-11-21 00:00')).toBe('ok');
    expect(ownerOf('prospect', id)).toBe(other.code);
    expect(seedProspect(id).ownerCode).toBe(other.code);
    expect(historyOf('prospect', id).at(-1)).toMatchObject({ action: 'change', toCode: other.code });
  });

  it('should take a customer out of the queue when it is given to somebody, and keep what is not an employee out', () => {
    const waiting = queueRows('prospect')[0];
    expect(setResponsible('prospect', waiting.id, 'E103', 'E101', '2026-11-21 00:00')).toBe('ok');
    expect(isInQueue('prospect', waiting.id)).toBe(false);
    expect(ownerOf('prospect', waiting.id)).toBe('E103');
    expect(setResponsible('prospect', 7, 'E999', '', '2026-11-21 00:00')).toBe('invalid');
  });

  it('should start with four customers and four opportunities waiting, oldest first', () => {
    for (const kind of ['prospect', 'opportunity'] as const) {
      const rows = queueRows(kind);
      expect(rows).toHaveLength(4);
      expect(rows.map((r) => r.since)).toEqual([...rows.map((r) => r.since)].sort());
    }
  });

  it('should read the customer and the opportunity from the shared seed', () => {
    const p = queueRows('prospect')[0];
    expect(p).toMatchObject({ name: seedProspect(p.id).fullName, code: seedProspect(p.id).code });
    const o = queueRows('opportunity')[0];
    expect(o).toMatchObject({ name: seedLead(o.id).customerName, groupId: seedLead(o.id).groupId });
  });

  it('should filter the opportunity queue by activity group (one queue per group)', () => {
    const all = queueRows('opportunity');
    const groupId = all[0].groupId;
    const one = queueRows('opportunity', groupId);
    expect(one.length).toBeGreaterThan(0);
    expect(one.every((r) => r.groupId === groupId)).toBe(true);
    expect(one.length).toBeLessThanOrEqual(all.length);
  });

  it('should let the first person take a customer and refuse the second, and show the owner on every page', () => {
    const id = queueRows('prospect')[0].id;
    expect(takeFromQueue('prospect', id, 'E102')).toBe('ok');
    expect(takeFromQueue('prospect', id, 'E103')).toBe('taken');
    expect(seedProspect(id).ownerCode).toBe('E102');
    expect(queueRows('prospect').map((r) => r.id)).not.toContain(id);
  });

  it('should give an opportunity to someone and show them as its owner', () => {
    const id = queueRows('opportunity')[0].id;
    const member = membersOf(groupIdOfOpportunity(id))[0];
    expect(takeFromQueue('opportunity', id, member)).toBe('ok');
    expect(seedLead(id)).toMatchObject({ ownerCode: member });
    expect(queueRows('opportunity').map((r) => r.id)).not.toContain(id);
  });

  it('should refuse a receiver who is not an employee and keep the item waiting', () => {
    const id = queueRows('prospect')[0].id;
    expect(takeFromQueue('prospect', id, 'CS0001')).toBe('invalid');
    expect(queueRows('prospect').map((r) => r.id)).toContain(id);
    expect(queueEmployees().length).toBeGreaterThan(0);
  });

  it('should put a customer into the queue when a Lead is converted without an owner', () => {
    const mock = new LeadsMock();
    const lead = mock.list({ status: 'new', search: '', sort: 'newest', filter: { sources: [], ownerCode: '', dateFrom: '', dateTo: '' } }).rows[0];
    const prospectId = mock.convert(lead.id, { salesLine: '', team: '', salesPerson: '', ownerCode: '' }, '2026-11-20', 'CS0001')!;
    expect(queueRows('prospect').map((r) => r.id)).toContain(prospectId);
    expect(queueRows('prospect').find((r) => r.id === prospectId)).toMatchObject({ since: '2026-11-20', fromCode: lead.ownerCode });
  });

  it('should not queue a customer converted with an owner', () => {
    const mock = new LeadsMock();
    const lead = mock.list({ status: 'new', search: '', sort: 'newest', filter: { sources: [], ownerCode: '', dateFrom: '', dateTo: '' } }).rows[0];
    const before = queueRows('prospect').length;
    mock.convert(lead.id, { salesLine: '', team: '', salesPerson: '', ownerCode: 'CS0002' }, '2026-11-20');
    expect(queueRows('prospect')).toHaveLength(before);
    sendToQueue('prospect', 5, '2026-11-01');
    expect(queueRows('prospect')).toHaveLength(before + 1);
  });
});

describe('permissions of the Wait List tabs (flow §2.4 · permission-visibility §5.1)', () => {
  const has = (...keys: string[]) => ({ has: (k: string) => keys.includes(k) });

  it('should show a tab only with Pipeline_Wait_list_Access and the View key of that document', () => {
    expect(queueTabs(has(ROLE.pipelineLeadView, ROLE.pipelineProspectView))).toEqual([]);
    expect(queueTabs(has(ROLE.pipelineWaitListAccess, ROLE.pipelineProspectView))).toEqual(['prospect']);
    expect(queueTabs(has(ROLE.pipelineWaitListAccess, ROLE.pipelineLeadView, ROLE.pipelineOpportunityView))).toEqual(['lead', 'opportunity']);
  });

  it('should need the Assign key of the same document to take or give', () => {
    const v = has(ROLE.pipelineWaitListAccess, ROLE.pipelineProspectView, ROLE.pipelineOpportunityAssign);
    expect(canGiveFromQueue(v, 'prospect')).toBe(false);
    expect(canGiveFromQueue(has(ROLE.pipelineWaitListAccess, ROLE.pipelineProspectView, ROLE.pipelineProspectAssign), 'prospect')).toBe(true);
    expect(canGiveFromQueue(v, 'opportunity')).toBe(false); // no View of opportunities
  });

  it('should hide the phone without the PDPA key of that document, and map an employee code to the chart', () => {
    expect(canSeeQueuePhone(has(), 'prospect')).toBe(false);
    expect(canSeeQueuePhone(has(ROLE.pipelineProspectCustomerPdpaData), 'prospect')).toBe(true);
    expect(canSeeQueuePhone(has(ROLE.pipelineProspectCustomerPdpaData), 'opportunity')).toBe(false);
    expect(employeeCodeOf('E102')).toBe('E102');
    expect(employeeCodeOf('E999')).toBe('');
  });
});

describe('change owner and return to the queue of a customer / an opportunity (flow §4.7, §5.7)', () => {
  afterEach(() => resetSharedDb());
  const AT = '2026-11-20 10:00';

  it('should have an owner for every customer and opportunity that is not waiting', () => {
    expect(ownerOf('prospect', 1)).toMatch(/^E10\d$/);
    expect(ownerOf('opportunity', 1)).toBe(seedLead(1).ownerCode);
    const queued = queueRows('prospect')[0].id;
    expect(ownerOf('prospect', queued)).toBe('');
    expect(isInQueue('prospect', queued)).toBe(true);
  });

  it('should return a customer to the queue with the old owner on record, and an optional reason', () => {
    const owner = ownerOf('prospect', 5);
    expect(returnToQueue('prospect', 5, owner, AT, '  ลูกค้าย้ายพื้นที่ ')).toBe('ok');
    expect(isInQueue('prospect', 5)).toBe(true);
    expect(ownerOf('prospect', 5)).toBe('');
    expect(queueRows('prospect').find((r) => r.id === 5)).toMatchObject({ since: '2026-11-20', fromCode: owner });
    expect(historyOf('prospect', 5).at(-1)).toMatchObject({ action: 'return', fromCode: owner, toCode: '', reason: 'ลูกค้าย้ายพื้นที่' });
    expect(returnToQueue('prospect', 5, owner, AT)).toBe('queued');
    expect(returnToQueue('prospect', 6, 'E101', AT)).toBe('ok'); // no reason is fine
  });

  it('should change the owner at once and refuse the same person, a stranger and an item in the queue', () => {
    const owner = ownerOf('opportunity', 3);
    const other = candidatesFor('opportunity', 3).find((e) => e.code !== owner)!.code;
    expect(reassign('opportunity', 3, owner, 'E101', AT)).toBe('same');
    expect(reassign('opportunity', 3, 'CS0001', 'E101', AT)).toBe('invalid');
    expect(reassign('opportunity', 3, other, 'E101', AT, 'ย้ายทีม')).toBe('ok');
    expect(seedLead(3).ownerCode).toBe(other);
    expect(historyOf('opportunity', 3).at(-1)).toMatchObject({ action: 'change', fromCode: owner, toCode: other, byCode: 'E101' });
    returnToQueue('opportunity', 3, other, AT);
    expect(reassign('opportunity', 3, owner, 'E101', AT)).toBe('queued');
  });

  it('should not move a closed opportunity', () => {
    const closed = Array.from({ length: 240 }, (_x, i) => i + 1).find((n) => seedLead(n).status !== 'ACTIVE')!;
    expect(returnToQueue('opportunity', closed, 'E101', AT)).toBe('closed');
    expect(reassign('opportunity', closed, 'E102', 'E101', AT)).toBe('closed');
  });

  it('should keep the whole story: from the queue to an owner, back to the queue, and to another owner', () => {
    const id = queueRows('prospect')[0].id;
    takeFromQueue('prospect', id, 'E102', 'E102', '2026-11-20 09:00');
    returnToQueue('prospect', id, 'E102', '2026-11-20 09:30', 'ไม่ใช่ลูกค้าของเรา');
    takeFromQueue('prospect', id, 'E103', 'E101', '2026-11-20 09:45');
    expect(historyOf('prospect', id).map((h) => h.action)).toEqual(['take', 'return', 'give']);
    expect(historyOf('prospect', id).at(-1)).toMatchObject({ byCode: 'E101', toCode: 'E103' });
  });

  it('should know the head of a team (the Sup of the same team) and nobody else', () => {
    expect(isHeadOf('E101', 'E102')).toBe(true);
    expect(isHeadOf('E101', 'E103')).toBe(false); // team B
    expect(isHeadOf('E101', 'E101')).toBe(false);
    expect(isHeadOf('E102', 'E105')).toBe(false); // not a Sup
  });
});

describe('who may change the owner or return to the queue (owner bar)', () => {
  const has = (...keys: string[]) => ({ has: (k: string) => keys.includes(k) });
  const KEY = ROLE.pipelineProspectChangeAssign;

  it('should need Pipeline_<Doc>_Change_Assign and to be the owner or a head of the owner', () => {
    expect(ownerBarActions(has(), 'prospect', 'E102', 'E102', false)).toEqual({ changeOwner: false, returnToQueue: false });
    expect(ownerBarActions(has(KEY), 'prospect', 'E102', 'E102', false)).toEqual({ changeOwner: true, returnToQueue: true });
    expect(ownerBarActions(has(KEY), 'prospect', 'E102', 'E101', false)).toEqual({ changeOwner: true, returnToQueue: true });
    expect(ownerBarActions(has(KEY), 'prospect', 'E102', 'E103', false)).toEqual({ changeOwner: false, returnToQueue: false });
    expect(ownerBarActions(has(KEY), 'prospect', 'E102', '', false).changeOwner).toBe(false);
  });

  it('should offer nothing for an item in the queue', () => {
    expect(ownerBarActions(has(KEY), 'prospect', '', 'E102', true)).toEqual({ changeOwner: false, returnToQueue: false });
  });

  it('should let an Entity Admin act on a customer but never on an opportunity', () => {
    expect(ownerBarActions(has(KEY, ROLE.masterEditAll), 'prospect', 'E102', 'E103', false).changeOwner).toBe(true);
    expect(ownerBarActions(has(ROLE.pipelineOpportunityChangeAssign, ROLE.masterEditAll), 'opportunity', 'E102', 'E103', false).changeOwner).toBe(false);
  });
});

describe('the members of the activity groups (flow §5.7)', () => {
  afterEach(() => resetSharedDb());
  const AT = '2026-11-20 10:00';
  const oppIn = (groupId: number) => queueRows('opportunity').find((r) => r.groupId === groupId)!.id;

  it('should start with members for every group, and know the groups of an employee', () => {
    expect(membersOf(101)).toContain('E101');
    expect(groupsOf('E104').map((g) => g.id)).toEqual([102, 105, 107]);
    expect(groupsOf('')).toEqual([]);
    expect(isMember(106, 'E101')).toBe(false);
  });

  it('should show the queue of a group only to its members', () => {
    const all = queueRows('opportunity');
    const group = all[0].groupId;
    const member = membersOf(group)[0];
    const outsider = queueEmployees().find((e) => !membersOf(group).includes(e.code))!.code;
    expect(queueRows('opportunity', 0, member).map((r) => r.id)).toContain(all[0].id);
    expect(queueRows('opportunity', 0, outsider).map((r) => r.id)).not.toContain(all[0].id);
    expect(queueRows('opportunity', 0, '')).toEqual([]);
    expect(queueRows('prospect', 0, '')).toHaveLength(4); // customers have no group: everyone with the permission sees them
  });

  it('should refuse a receiver who is not in the group, and leave the opportunity waiting', () => {
    const id = queueRows('opportunity')[0].id;
    const group = groupIdOfOpportunity(id);
    const outsider = queueEmployees().find((e) => !membersOf(group).includes(e.code))!.code;
    expect(takeFromQueue('opportunity', id, outsider)).toBe('notMember');
    expect(isInQueue('opportunity', id)).toBe(true);
    // the members of the group who can also receive opportunities (E107 is marketing only)
    expect(candidatesFor('opportunity', id).map((e) => e.code)).toEqual(membersOf(group).filter((c) => canReceiveWork('opportunity', c)).sort());
    expect(candidatesFor('prospect', 1).map((e) => e.code)).toEqual(['E101', 'E102', 'E103']);
  });

  it('should keep a new owner of an opportunity inside its group', () => {
    const id = 3;
    const group = groupIdOfOpportunity(id);
    const outsider = queueEmployees().find((e) => !membersOf(group).includes(e.code) && e.code !== ownerOf('opportunity', id))!.code;
    expect(reassign('opportunity', id, outsider, 'E101', AT)).toBe('notMember');
    expect(reassign('prospect', 3, queueEmployees().find((e) => e.code !== ownerOf('prospect', 3))!.code, 'E101', AT)).toBe('ok'); // a customer has no group: anyone
  });

  it('should send back to the queue the opportunity of someone taken out of the group, only when they pulled it from the queue', () => {
    const id = oppIn(103);
    takeFromQueue('opportunity', id, 'E102', 'E102', AT);
    expect(ownerOf('opportunity', id)).toBe('E102');
    // an opportunity of the cast that E102 owns from the start stays with E102
    const own = Array.from({ length: 240 }, (_x, i) => i + 1).find((n) => n !== id && seedLead(n).groupId === 103 && seedLead(n).ownerCode === 'E102' && seedLead(n).status === 'ACTIVE' && !isInQueue('opportunity', n));
    const change = updateGroupMembers(103, membersOf(103).filter((c) => c !== 'E102'), 'ระบบ', '2026-11-20 11:00');
    expect(change.removed).toEqual(['E102']);
    expect(change.returned).toEqual([id]);
    expect(isInQueue('opportunity', id)).toBe(true);
    expect(historyOf('opportunity', id).at(-1)).toMatchObject({ action: 'return', fromCode: 'E102', reason: 'ถอนออกจากกลุ่มกิจกรรม' });
    if (own) expect(ownerOf('opportunity', own)).toBe('E102');
    expect(isMember(103, 'E102')).toBe(false);
  });

  it('should add a member and ignore a code that is not an employee', () => {
    const change = updateGroupMembers(106, [...membersOf(106), 'E101', 'X999'], 'ระบบ', AT);
    expect(change).toEqual({ removed: [], returned: [] });
    expect(membersOf(106)).toContain('E101');
    expect(membersOf(106)).not.toContain('X999');
  });
});

describe('the minimum permissions of a receiver (BR-LDP-16 / OP-31)', () => {
  afterEach(() => resetSharedDb());
  const AT = '2026-11-20 10:00';

  it('should refuse to give a customer to someone whose position has no View + Edit of a Prospect, and leave it waiting', () => {
    const id = queueRows('prospect')[0].id;
    expect(takeFromQueue('prospect', id, 'E104')).toBe('notReceiver'); // analyst: opportunities only
    expect(isInQueue('prospect', id)).toBe(true);
    expect(takeFromQueue('prospect', id, 'E103')).toBe('ok'); // customer service
  });

  it('should refuse a new owner who is not a receiver, and keep the owner', () => {
    expect(reassign('prospect', 3, 'E104', 'E101', AT)).toBe('notReceiver');
    expect(reassign('prospect', 3, 'E103', 'E101', AT)).toBe('ok');
  });

  it('should follow the roles of the positions: a position that loses its Edit can no longer take', () => {
    const id = queueRows('prospect')[0].id;
    setRolePermission(roleByCode('PROSPECT_RESPONSIBLE')!.id, 'Pipeline_Prospect_Edit', false);
    expect(takeFromQueue('prospect', id, 'E103')).toBe('notReceiver');
    resetRoleModel();
    expect(takeFromQueue('prospect', id, 'E103')).toBe('ok');
  });
});
