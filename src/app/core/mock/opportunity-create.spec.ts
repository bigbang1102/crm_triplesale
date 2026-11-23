import { afterEach, describe, expect, it } from 'vitest';
import { SEED_GROUPS, seedLead } from './crm-seed';
import { createOpportunity, openOpportunitiesOf } from './opportunity-create';
import { resetSharedDb } from './shared-db';
import { membersOf, sendToQueue } from './waitlist';

afterEach(() => resetSharedDb());

const group = SEED_GROUPS[0];
const member = membersOf(group.id)[0] ?? 'E101';
const base = { prospectId: 1, pipelineId: 1, firstGroupId: group.id, responsibleCode: member, salePersonCode: 'E101' };

describe('creating an opportunity from a customer (design 6.1)', () => {
  it('should start it NEW, with amount 0, on the first group, owned by the person in charge', () => {
    const made = createOpportunity(base, '2026-10-20');
    expect(made.ok).toBe(true);
    if (!made.ok) return;
    expect(seedLead(made.opportunityId)).toMatchObject({ status: 'ACTIVE', interest: 'NEW', amount: 0, prospectId: 1, ownerCode: member, createdDate: '2026-10-20', groupIdx: 0 });
  });

  it('should give each new opportunity its own number', () => {
    const a = createOpportunity(base);
    const b = createOpportunity(base);
    expect(a.ok && b.ok && a.opportunityId !== b.opportunityId).toBe(true);
  });

  it('should refuse a missing pipeline, person in charge or sales person with 422 naming the field', () => {
    expect(createOpportunity({ ...base, pipelineId: null })).toEqual({ ok: false, status: 422, code: 'VALIDATION_FAILED', field: 'opportunityConfigId' });
    expect(createOpportunity({ ...base, responsibleCode: '' })).toMatchObject({ status: 422, field: 'responsibleEmployeeId' });
    expect(createOpportunity({ ...base, salePersonCode: '' })).toMatchObject({ status: 422, field: 'salePersonId' });
  });

  it('should refuse a person in charge who is not in the group of the pipeline', () => {
    const outsider = ['E101', 'E102', 'E103', 'E104', 'E105', 'E106', 'E107', 'E108'].find((c) => !membersOf(group.id).includes(c));
    if (!outsider) return;
    expect(createOpportunity({ ...base, responsibleCode: outsider })).toMatchObject({ ok: false, status: 422, field: 'responsibleEmployeeId' });
  });

  it('should refuse an unknown customer with 404 and one waiting in the queue with 409', () => {
    expect(createOpportunity({ ...base, prospectId: 999_999 })).toMatchObject({ ok: false, status: 404, code: 'NOT_FOUND' });
    sendToQueue('prospect', 2, '2026-10-01');
    expect(createOpportunity({ ...base, prospectId: 2 })).toMatchObject({ ok: false, status: 409, code: 'PROSPECT_NOT_AVAILABLE' });
  });

  it('should warn of the opportunities still open for the customer but go on', () => {
    const before = openOpportunitiesOf(1);
    const made = createOpportunity(base);
    expect(made.ok && made.openOpportunities).toBe(before);
    expect(openOpportunitiesOf(1)).toBe(before + 1);
  });
});
