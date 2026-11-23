import { afterEach, describe, expect, it } from 'vitest';
import { isKnownProspect, isKnownLead, seedProspect } from '@core/mock/crm-seed';
import { resetSharedDb } from '@core/mock/shared-db';
import { LeadsMock } from './leads.mock';
import type { LeadForm, LeadQuery } from './leads.types';

const ALL: LeadQuery = { status: '', search: '', sort: 'newest', filter: { sources: [], ownerCode: '', dateFrom: '', dateTo: '' } };
const form = (over: Partial<LeadForm> = {}): LeadForm => ({
  name: 'ทดสอบ ลีด', phoneCode: '+66', phone: '0899990000', email: '', source: 'Facebook', ownerCode: 'CS0001', address: '', country: 'ไทย', province: '', district: '', subdistrict: '', postcode: '', taxId: '', ...over,
});

describe('the mock of the Lead menu', () => {
  afterEach(() => resetSharedDb());

  it('should start with the 95 leads of the design, counted by status', () => {
    const { rows, counts } = new LeadsMock().list(ALL);
    expect(rows).toHaveLength(95);
    expect(counts).toEqual({ all: 95, new: 3, contacting: 10, inactive: 2, disqualified: 20, converted: 60 });
    expect(rows[0].createdDate).toBe('2026-11-04');
  });

  it('should filter by status, search by name / phone / code, filter by source and owner, and sort', () => {
    const m = new LeadsMock();
    expect(m.list({ ...ALL, status: 'contacting' }).rows).toHaveLength(10);
    const first = m.list(ALL).rows[0];
    expect(m.list({ ...ALL, search: first.phone }).rows.map((r) => r.id)).toContain(first.id);
    expect(m.list({ ...ALL, search: 'ไม่มีชื่อนี้แน่นอน' }).rows).toHaveLength(0);
    const src = first.source;
    expect(m.list({ ...ALL, filter: { ...ALL.filter, sources: [src] } }).rows.every((r) => r.source === src)).toBe(true);
    const named = m.list({ ...ALL, sort: 'name' }).rows.map((r) => r.name);
    expect(named).toEqual([...named].sort((a, b) => a.localeCompare(b, 'th')));
    const oldest = m.list({ ...ALL, sort: 'oldest' }).rows;
    expect(oldest[0].createdDate <= oldest.at(-1)!.createdDate).toBe(true);
  });

  it('should add, edit, change the status of and delete a lead', () => {
    const m = new LeadsMock();
    const lead = m.create(form(), '2026-11-20');
    expect(lead).toMatchObject({ status: 'new', createdDate: '2026-11-20', name: 'ทดสอบ ลีด' });
    expect(m.list(ALL).rows).toHaveLength(96);
    expect(m.update(lead.id, form({ name: 'แก้ชื่อ' }))?.name).toBe('แก้ชื่อ');
    expect(m.setStatus(lead.id, 'contacting')).toBeUndefined(); // New → Contacting happens only by logging a contact
    expect(m.setStatus(lead.id, 'disqualified')?.status).toBe('disqualified');
    expect(m.setStatus(lead.id, 'converted')).toBeUndefined();
    expect(m.remove(lead.id)).toBe(true);
    expect(m.remove(lead.id)).toBe(false);
    expect(m.get(lead.id)).toBeUndefined();
    expect(m.list(ALL).rows).toHaveLength(95);
  });

  it('should move a Lead to the trash, not delete it, and never trash a converted one', () => {
    const m = new LeadsMock();
    const converted = m.list({ ...ALL, status: 'converted' }).rows[0];
    expect(m.remove(converted.id)).toBe(false);
    const first = m.list({ ...ALL, status: 'contacting' }).rows[0];
    m.remove(first.id);
    expect(m.list({ ...ALL, search: first.code }).rows).toHaveLength(0);
  });

  it('should hide the Leads the viewer may not see from the list and the counts, and skip masked fields in the search', () => {
    const m = new LeadsMock();
    const mine = m.list(ALL).rows.filter((l) => l.ownerCode === 'CS0002');
    const q = { ...ALL, canSee: (l: { ownerCode: string }) => l.ownerCode === 'CS0002' };
    const seen = m.list(q);
    expect(seen.rows).toHaveLength(mine.length);
    expect(seen.counts.all).toBe(mine.length);
    const phone = mine[0].phone;
    expect(m.list({ ...q, search: phone }).rows.length).toBeGreaterThan(0);
    expect(m.list({ ...q, search: phone, searchContacts: false }).rows).toHaveLength(0);
  });

  it('should move a Lead to Contacting when a contact is logged, but not a converted or disqualified one', () => {
    const m = new LeadsMock();
    const fresh = m.create(form(), '2026-11-20');
    m.addContact(fresh.id, 'callOut', 'โทรหา', '2026-11-20 10:00', 'CS0001');
    expect(m.get(fresh.id)?.status).toBe('contacting');
    const dq = m.list({ ...ALL, status: 'disqualified' }).rows[0];
    m.addContact(dq.id, 'note', 'x', '2026-11-20 10:00', 'CS0001');
    expect(m.get(dq.id)?.status).toBe('disqualified');
    const done = m.list({ ...ALL, status: 'converted' }).rows[0];
    m.addContact(done.id, 'note', 'x', '2026-11-20 10:00', 'CS0001');
    expect(m.get(done.id)?.contacts.some((c) => c.text === 'x')).toBe(false);
  });

  it('should import only the new rows', () => {
    const m = new LeadsMock();
    const added = m.importRows(
      [
        { no: 1, firstName: 'ก', lastName: 'ข', phone: '0811111111', email: '', address: '', state: 'new' },
        { no: 2, firstName: 'ค', lastName: 'ง', phone: '0811111111', email: '', address: '', state: 'duplicate' },
        { no: 3, firstName: 'จ', lastName: '', phone: '', email: '', address: '', state: 'noPhone' },
      ],
      'Event & Exhibition',
      'CS0001',
      '2026-11-20',
    );
    expect(added).toBe(1);
    expect(m.list({ ...ALL, search: '0811111111' }).rows).toHaveLength(1);
  });

  it('should keep contacts and appointments of a lead', () => {
    const m = new LeadsMock();
    const id = m.create(form(), '2026-11-20').id;
    m.addContact(id, 'note', 'ชมรถที่โชว์รูม', '2026-11-20 10:00', 'CS0001');
    m.addItem(id, { kind: 'task', title: 'โทรกลับ', date: '2026-11-21', time: '', allDay: true, detail: '', status: 'งาน' });
    const lead = m.get(id)!;
    expect(lead.contacts).toMatchObject([{ kind: 'note', text: 'ชมรถที่โชว์รูม' }]);
    expect(lead.items).toMatchObject([{ kind: 'task', title: 'โทรกลับ' }]);
  });

  it('should turn a lead into a customer of every page (the Lead stays as Converted), and open an opportunity', () => {
    const m = new LeadsMock();
    const lead = m.get(m.list({ ...ALL, status: 'new' }).rows[0].id)!;
    const prospectId = m.convert(lead.id, { salesLine: 'สายงานขาย A', team: '', salesPerson: '', ownerCode: 'CS0001' }, '2026-11-20');
    expect(prospectId).toBeDefined();
    expect(isKnownProspect(prospectId!)).toBe(true);
    expect(seedProspect(prospectId!)).toMatchObject({ fullName: lead.name, phone: lead.phone });
    expect(m.get(lead.id)).toMatchObject({ status: 'converted', prospectId, convertedAt: '2026-11-20' });
    expect(m.convert(lead.id, { salesLine: '', team: '', salesPerson: '', ownerCode: 'CS0001' }, '2026-11-20')).toBeUndefined();

    const other = m.list({ ...ALL, status: 'new' }).rows[0];
    const opp = m.createOpportunity(other.id, { salesLine: 'สายงานขาย A', team: '', salesPerson: '', ownerCode: 'CS0002' }, '2026-11-20');
    expect(isKnownProspect(opp!.prospectId)).toBe(true);
    expect(isKnownLead(opp!.opportunityId)).toBe(true);
  });
});

describe('the queue (Wait List) and the trash of the Lead menu', () => {
  const m = () => new LeadsMock();
  const QUEUE: LeadQuery = { ...ALL, scope: 'queue' };

  it('should keep queued Leads out of the list and give them to the queue, oldest first', () => {
    const mock = m();
    const queue = mock.list(QUEUE).rows;
    expect(queue.length).toBeGreaterThan(0);
    expect(queue.every((l) => l.ownerCode === '')).toBe(true);
    expect(queue.map((l) => l.createdDate)).toEqual([...queue.map((l) => l.createdDate)].sort());
    expect(mock.list(ALL).rows.some((l) => l.ownerCode === '')).toBe(false);
  });

  it('should let the first person take a queued Lead and refuse the second', () => {
    const mock = m();
    const id = mock.list(QUEUE).rows[0].id;
    expect(mock.assign(id, 'take', 'CS0002', 'CS0002', '2026-11-20 10:00')?.ownerCode).toBe('CS0002');
    expect(mock.assign(id, 'take', 'CS0003', 'CS0003', '2026-11-20 10:01')).toBeUndefined();
    expect(mock.get(id)?.history?.at(-1)).toMatchObject({ action: 'take', fromCode: '', toCode: 'CS0002', byCode: 'CS0002' });
    expect(mock.list(QUEUE).rows.some((l) => l.id === id)).toBe(false);
  });

  it('should give a queued Lead to someone else, and change the owner only of an open Lead that has one', () => {
    const mock = m();
    const queued = mock.list(QUEUE).rows[0].id;
    expect(mock.assign(queued, 'change', 'CS0003', 'CS0001', '2026-11-20 10:00')).toBeUndefined(); // no owner yet: it can only be given
    expect(mock.assign(queued, 'give', 'CS0003', 'CS0001', '2026-11-20 10:00')?.ownerCode).toBe('CS0003');
    expect(mock.assign(queued, 'change', 'CS0003', 'CS0001', '2026-11-20 10:01')).toBeUndefined(); // the same owner
    expect(mock.assign(queued, 'change', 'CS0004', 'CS0001', '2026-11-20 10:02', 'ย้ายทีม')?.ownerCode).toBe('CS0004');
    const closed = mock.list({ ...ALL, status: 'converted' }).rows[0].id;
    expect(mock.assign(closed, 'change', 'CS0004', 'CS0001', '2026-11-20 10:03')).toBeUndefined();
  });

  it('should return a Lead to the queue only with a reason, and keep its contacts', () => {
    const mock = m();
    const lead = mock.create(form({ ownerCode: 'CS0002' }), '2026-11-20');
    mock.addContact(lead.id, 'note', 'คุยแล้ว', '2026-11-20 10:00', 'CS0002');
    expect(mock.returnToQueue(lead.id, 'CS0002', '2026-11-20 11:00', '  ')).toBeUndefined();
    const back = mock.returnToQueue(lead.id, 'CS0002', '2026-11-20 11:00', 'ลูกค้าอยู่คนละเขต');
    expect(back).toMatchObject({ ownerCode: '' });
    expect(back?.contacts).toHaveLength(1);
    expect(back?.history?.at(-1)).toMatchObject({ action: 'return', fromCode: 'CS0002', toCode: '', reason: 'ลูกค้าอยู่คนละเขต' });
    expect(mock.list(QUEUE).rows.map((l) => l.id)).toContain(lead.id);
  });

  it('should put a Lead created without an owner into the queue and write the first history line', () => {
    const mock = m();
    const lead = mock.create(form({ ownerCode: '' }), '2026-11-20');
    expect(lead.history).toMatchObject([{ action: 'queueIn' }]);
    expect(mock.list(QUEUE).rows.map((l) => l.id)).toContain(lead.id);
  });

  it('should list a trashed Lead only in the trash and restore it as it was', () => {
    const mock = m();
    const lead = mock.create(form({ ownerCode: 'CS0002', phone: '0877001122' }), '2026-11-20');
    expect(mock.remove(lead.id, 'CS0002', '2026-11-20 09:00')).toBe(true);
    expect(mock.list({ ...ALL, scope: 'trash' }).rows.map((l) => l.id)).toEqual([lead.id]);
    expect(mock.list({ ...ALL, search: lead.code }).rows).toHaveLength(0);
    expect(mock.restore(lead.id, 'CS0002', '2026-11-20 09:05')).toBe('ok');
    expect(mock.get(lead.id)).toMatchObject({ ownerCode: 'CS0002', status: 'new', trashed: false });
    expect(mock.restore(lead.id, 'CS0002', '2026-11-20 09:06')).toBe('missing');
  });

  it('should refuse to restore a Lead whose phone number now belongs to an active Lead', () => {
    const mock = m();
    const first = mock.create(form({ phone: '0866000111' }), '2026-11-20');
    mock.remove(first.id, 'CS0001', '2026-11-20 09:00');
    mock.create(form({ phone: '086-600-0111', name: 'คนใหม่' }), '2026-11-20');
    expect(mock.restore(first.id, 'CS0001', '2026-11-20 09:10')).toBe('duplicate');
    expect(mock.list({ ...ALL, scope: 'trash' }).rows.map((l) => l.id)).toContain(first.id);
  });

  it('should send a Lead trashed while queued back to the queue when it is restored', () => {
    const mock = m();
    const id = mock.list(QUEUE).rows[0].id;
    mock.remove(id, 'CS0001', '2026-11-20 09:00');
    expect(mock.restore(id, 'CS0001', '2026-11-20 09:01')).toBe('ok');
    expect(mock.list(QUEUE).rows.map((l) => l.id)).toContain(id);
  });
});
