import { afterEach, describe, expect, it } from 'vitest';
import { SEED_LEAD_COUNT, SEED_PROSPECT_COUNT, isKnownLead, isKnownProspect, leadIds, prospectIds, seedLead, seedProspect } from './crm-seed';
import { resetSharedDb, setSharedDb, sharedDbVersion, splitName, upsertSharedLead, upsertSharedProspect } from './shared-db';

describe('the shared database over the cast of the seed', () => {
  afterEach(() => setSharedDb(undefined));

  it('should leave the cast as it is when nothing was changed', () => {
    setSharedDb(undefined);
    const before = seedProspect(7);
    expect(prospectIds()).toHaveLength(SEED_PROSPECT_COUNT);
    expect(leadIds()).toHaveLength(SEED_LEAD_COUNT);
    expect(seedProspect(7)).toEqual(before);
  });

  it('should show an edited customer, and the leads of that customer, everywhere', () => {
    const lead = seedLead(7);
    upsertSharedProspect(lead.prospectId, { fullName: 'ทดสอบ ระบบ', phone: '081-111-2222', email: 'x@example.com' });
    const p = seedProspect(lead.prospectId);
    expect(p).toMatchObject({ fullName: 'ทดสอบ ระบบ', firstName: 'ทดสอบ', lastName: 'ระบบ', phone: '081-111-2222', email: 'x@example.com' });
    expect(seedLead(7)).toMatchObject({ customerName: 'ทดสอบ ระบบ', phone: '081-111-2222', code: lead.code });
  });

  it('should add a customer and a lead the user opened, known to every list', () => {
    upsertSharedProspect(1000, { fullName: 'ลูกค้า ใหม่', code: 'P01000' }, true);
    upsertSharedLead(7000, { prospectId: 1000, status: 'ACTIVE', interest: 'NEW', groupIdx: 0, ownerCode: 'E102' }, true);
    expect(isKnownProspect(1000)).toBe(true);
    expect(isKnownProspect(1001)).toBe(false);
    expect(prospectIds().at(-1)).toBe(1000);
    expect(isKnownLead(7000)).toBe(true);
    expect(seedProspect(1000)).toMatchObject({ fullName: 'ลูกค้า ใหม่', code: 'P01000' });
    expect(seedLead(7000)).toMatchObject({ prospectId: 1000, customerName: 'ลูกค้า ใหม่', status: 'ACTIVE', interest: 'NEW', ownerCode: 'E102' });
  });

  it('should be an upsert: the same write twice changes nothing more (a journal replay)', () => {
    upsertSharedProspect(1000, { fullName: 'ลูกค้า ใหม่' }, true);
    upsertSharedProspect(1000, { fullName: 'ลูกค้า ใหม่' }, true);
    expect(prospectIds().filter((id) => id === 1000)).toHaveLength(1);
  });

  it('should not blank a field with an empty value, and should move its version on a change', () => {
    upsertSharedProspect(5, { phone: '081-000-0000' });
    const v = sharedDbVersion();
    upsertSharedProspect(5, { phone: '' });
    expect(seedProspect(5).phone).toBe('081-000-0000');
    expect(sharedDbVersion()).toBeGreaterThan(v);
  });

  it('should forget everything on reset', () => {
    upsertSharedProspect(1000, { fullName: 'x' }, true);
    resetSharedDb();
    expect(isKnownProspect(1000)).toBe(false);
  });

  it('should split a name into its first word and the rest', () => {
    expect(splitName('  สมชาย   ใจ ดี ')).toEqual({ firstName: 'สมชาย', lastName: 'ใจ ดี' });
    expect(splitName('')).toEqual({ firstName: '', lastName: '' });
  });
});
