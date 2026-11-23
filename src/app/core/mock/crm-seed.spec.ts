import { afterEach, describe, expect, it } from 'vitest';
import {
  SEED_EMPLOYEES,
  SEED_GROUPS,
  SEED_INTERESTS,
  SEED_LEAD_COUNT,
  SEED_PROSPECT_COUNT,
  SEED_TODAY,
  type CastDocument,
  leadIds,
  prospectIds,
  seedDate,
  seedLead,
  seedProspect,
  setCastDocument,
} from './crm-seed';

describe('crm seed', () => {
  it('is deterministic', () => {
    expect(seedLead(17)).toEqual(seedLead(17));
    expect(seedProspect(5)).toEqual(seedProspect(5));
  });

  it('gives every lead a real customer, owner, group and interest', () => {
    const codes = new Set<string>(SEED_EMPLOYEES.map((e) => e.code));
    const ids = new Set<number>(SEED_GROUPS.map((g) => g.id));
    for (let n = 1; n <= SEED_LEAD_COUNT; n++) {
      const l = seedLead(n);
      expect(l.id).toBe(n);
      expect(l.prospectId).toBeGreaterThanOrEqual(1);
      expect(l.prospectId).toBeLessThanOrEqual(SEED_PROSPECT_COUNT);
      expect(l.customerName).toBe(seedProspect(l.prospectId).fullName);
      expect(codes.has(l.ownerCode)).toBe(true);
      expect(ids.has(l.groupId)).toBe(true);
      expect(SEED_INTERESTS).toContain(l.interest);
      // a closed lead shows its closing as the interest (CLAUDE.md §3), an open one never does
      expect(l.status === 'ACTIVE').toBe(l.interest !== 'SUCCESS' && l.interest !== 'LOST');
      expect(l.createdDate <= SEED_TODAY).toBe(true);
      expect(l.lastContactDate >= l.createdDate).toBe(true);
    }
  });

  it('mixes open and closed leads', () => {
    const status = new Set(Array.from({ length: SEED_LEAD_COUNT }, (_, i) => seedLead(i + 1).status));
    expect([...status].sort()).toEqual(['ACTIVE', 'LOST', 'SUCCESS']);
  });

  it('counts dates back from today', () => {
    expect(seedDate(0)).toBe(SEED_TODAY);
    expect(seedDate(20)).toBe('2026-09-30');
  });
});

describe('the cast taken from a document of the shared Datasource (seed.crm.json)', () => {
  afterEach(() => setCastDocument(undefined));

  /** the cast as the formulas make it, in the shape of the document */
  const formulas = (): CastDocument => ({
    prospects: Array.from({ length: SEED_PROSPECT_COUNT }, (_x, i) => {
      const { id, code, firstName, lastName, fullName, phone, email, province, source, createdDate } = seedProspect(i + 1);
      return { id, code, firstName, lastName, fullName, phone, email, province, source, createdDate };
    }),
    leads: Array.from({ length: SEED_LEAD_COUNT }, (_x, i) => {
      const { id, code, prospectId, ownerCode, groupIdx, interest, status, createdDate, lastContactDate, amount } = seedLead(i + 1);
      return { id, code, prospectId, ownerCode, groupIdx, interest, status, createdDate, lastContactDate, amount };
    }),
  });

  it('should give the same cast as the formulas when the document is what the formulas made', () => {
    const before = [seedProspect(7), seedLead(7), seedLead(240)];
    expect(setCastDocument(formulas())).toBeUndefined();
    expect([seedProspect(7), seedLead(7), seedLead(240)]).toEqual(before);
  });

  it('should show what the document says, and keep the customer of a lead and the names of its owner and group live', () => {
    const doc = formulas();
    doc.prospects[6].fullName = 'ลูกค้า ทดสอบ';
    doc.prospects[6].phone = '099-000-0000';
    doc.leads[6].ownerCode = 'E108';
    doc.leads[6].groupIdx = 3;
    doc.leads[6].amount = 123_456;
    expect(setCastDocument(doc)).toBeUndefined();
    expect(seedProspect(7)).toMatchObject({ fullName: 'ลูกค้า ทดสอบ', phone: '099-000-0000' });
    const lead = seedLead(7);
    expect(lead).toMatchObject({ ownerCode: 'E108', ownerName: SEED_EMPLOYEES[7].name, groupIdx: 3, groupId: SEED_GROUPS[3].id, amount: 123_456 });
    expect(lead.customerName).toBe(seedProspect(lead.prospectId).fullName);
  });

  it('should refuse a document that does not fit, whole, and go on with the formulas', () => {
    const before = seedLead(5);
    const empty = formulas();
    empty.leads = [];
    expect(setCastDocument(empty)).toMatch(/at least one customer and one lead/);
    const gap = formulas();
    gap.leads.splice(3, 1);
    expect(setCastDocument(gap)).toMatch(/does not fit/);
    const stranger = formulas();
    stranger.leads[4].ownerCode = 'E999';
    expect(setCastDocument(stranger)).toMatch(/does not fit/);
    const status = formulas();
    status.leads[4].status = 'MAYBE';
    expect(setCastDocument(status)).toMatch(/does not fit/);
    expect(setCastDocument({ prospects: 1, leads: 2 })).toMatch(/must be lists/);
    expect(seedLead(5)).toEqual(before);
  });

  it('should take a cast of any size and count it, then go back to 180 / 240 when the document goes', () => {
    const doc = formulas();
    doc.prospects = doc.prospects.slice(0, 10);
    doc.leads = doc.leads.slice(0, 12).map((l) => ({ ...l, prospectId: 1 + (l.prospectId % 10) }));
    expect(setCastDocument(doc)).toBeUndefined();
    expect([SEED_PROSPECT_COUNT, SEED_LEAD_COUNT]).toEqual([10, 12]);
    expect(prospectIds()).toHaveLength(10);
    expect(leadIds()).toHaveLength(12);
    setCastDocument(undefined);
    expect([SEED_PROSPECT_COUNT, SEED_LEAD_COUNT]).toEqual([180, 240]);
  });

  it('should go back to the formulas when the document goes', () => {
    const doc = formulas();
    doc.leads[0].amount = 1;
    setCastDocument(doc);
    expect(seedLead(1).amount).toBe(1);
    setCastDocument(undefined);
    expect(seedLead(1).amount).not.toBe(1);
  });
});
