import { describe, expect, it } from 'vitest';
import { channelCounts, summaryItemOf } from './activities-summary.live';

const card = (o: Record<string, unknown> = {}) => ({
  lastActivityAt: '2026-11-18T10:30:00+07:00',
  assignedAt: '2026-11-01T09:00:00+07:00',
  responsible: { id: 'e-1', code: 'E01', name: 'สมชาย' },
  prospect: { id: 'p-1', code: 'P01', name: 'ลูกค้า ก' },
  activity: { id: 'a-1', name: 'นัดพบ', summary: {} },
  opportunity: { id: '019a7c00-0001', status: 'HOT', txno: 'OP-1' },
  ...o,
});

describe('summaryItemOf (an item of GET /contact-activity-summaries as the item of the old list)', () => {
  it('should map the columns of the tab by opportunity from the fields of the service', () => {
    expect(summaryItemOf(card())).toMatchObject({
      leadId: '019a7c00-0001',
      txNo: 'OP-1',
      lastContactDate: '2026-11-18T10:30:00',
      contactName: 'สมชาย',
      prospectName: 'ลูกค้า ก',
      procedureName: 'นัดพบ',
      assignDate: '2026-11-01T09:00:00',
      leadStatus: 'HOT',
      activeStatus: 'HOT',
    });
  });

  it('should read the status from an object { code | name }', () => {
    expect(summaryItemOf(card({ opportunity: { id: 'o', status: { code: 'COLD', name: 'เย็น' } } }))).toMatchObject({ leadStatus: 'COLD' });
  });

  it('should keep what the item already says under the names of the old list, and give back what is not an object as it is', () => {
    expect(summaryItemOf(card({ contactName: 'เดิม' }))).toMatchObject({ contactName: 'เดิม' });
    expect(summaryItemOf(7)).toBe(7);
  });

  it('should map the items of children the same way', () => {
    const out = summaryItemOf(card({ children: [card({ prospect: { name: 'ลูก' } })] })) as { children: { prospectName: string }[] };
    expect(out.children[0].prospectName).toBe('ลูก');
  });
});

describe('summaryItemOf (the opportunity with no dates of its own, and the counters on the item)', () => {
  const kid = (o: Record<string, unknown>) => ({ opportunity: { id: 'k', status: 'NEW' }, children: null, ...o });

  it('should leave a date that is null on the parent empty (it is not taken from a child)', () => {
    const out = summaryItemOf({ lastActivityAt: null, assignedAt: null, opportunity: { id: 'o' }, children: [kid({ lastActivityAt: '2026-11-17T08:36:18Z', assignedAt: '2026-11-10T00:00:00Z' })] }) as Record<string, string>;
    expect(out['lastContactDate']).toBeUndefined();
    expect(out['assignDate']).toBeUndefined();
  });

  it('should keep the own date of the parent, and give a child its own status and assignment', () => {
    const out = summaryItemOf({ lastActivityAt: '2026-11-20T00:00:00Z', opportunity: { id: 'o', status: 'HOT' }, children: [kid({ assignedAt: '2026-11-17T08:36:18Z' })] }) as { lastContactDate: string; children: Record<string, string>[] };
    expect(out.lastContactDate).toBe('2026-11-20T07:00:00');
    expect(out.children[0]).toMatchObject({ leadStatus: 'NEW', assignDate: '2026-11-17T15:36:18' });
  });

  it('should read the counters from the fields of the item (visitCount …), else from its summary by name', () => {
    expect(summaryItemOf({ opportunity: { id: 'o' }, visitCount: 2, callCount: 1 })).toMatchObject({ visit: 2, call: 1, note: 0 });
    expect(summaryItemOf({ opportunity: { id: 'o' }, summary: { opportunityId: 'o', lineCount: 4 } })).toMatchObject({ line: 4, note: 0 });
  });
});

describe('summaryItemOf (an answer of the service as it was seen)', () => {
  const real = {
    opportunity: { id: '01a1e792-488b-7394-a935-40e0ea5f21f2', number: 'FCS-2611-001', status: 'HOT', demand: null },
    prospect: { id: 'p', code: 'DUPSAMPLE-R1', name: 'สมชาย', avatarUrl: null },
    responsible: { id: 'e', code: 'QA-001', name: 'ทดสอบ หนึ่ง' },
    activityGroup: { id: 'g', name: 'สายงานทดสอบ OP-2 A' },
    activity: { id: 'a', name: 'ขั้นทดสอบ OP-2 A1' },
    lastActivityAt: '2026-11-14T08:00:00.000Z',
    assignedAt: null,
    visitCount: 3,
    summary: { opportunityId: 'x', lastContactAt: null, noteCount: 1, lineCount: 0, facebookCount: 0, whatsappCount: 0, emailCount: 0, smsCount: 0, callCount: 1, totalCount: 2 },
    children: [{ opportunity: { id: 'x', status: 'HOT' }, assignedAt: '2026-11-12T08:36:18.091Z', lastActivityAt: '2026-11-14T08:00:00.000Z', summary: { noteCount: 1 }, children: null }],
  };

  it('should keep visitCount of the item together with the counters of its summary (each channel takes the larger)', () => {
    expect(summaryItemOf(real)).toMatchObject({ note: 1, call: 1, visit: 3, line: 0 });
  });

  it('should show the date as the day in Thailand: 23:00Z is already the next day there', () => {
    expect(summaryItemOf({ lastActivityAt: '2026-11-14T23:30:00.000Z', opportunity: { id: 'o' } })).toMatchObject({ lastContactDate: '2026-11-15T06:30:00' });
    expect(summaryItemOf({ lastActivityAt: '2026-11-14', opportunity: { id: 'o' } })).toMatchObject({ lastContactDate: '2026-11-14' });
  });

  it('should map the step, the status and the contact of the row, and leave an assignment that is null empty', () => {
    expect(summaryItemOf(real)).not.toHaveProperty('assignDate');
    expect(summaryItemOf(real)).toMatchObject({ procedureName: 'ขั้นทดสอบ OP-2 A1', leadStatus: 'HOT', contactName: 'ทดสอบ หนึ่ง' });
  });

  it('should leave the contact empty when the responsible is null on the item and on every child (the data has none)', () => {
    expect(summaryItemOf({ responsible: null, opportunity: { id: 'o' }, children: [{ responsible: null, children: null }] })).not.toHaveProperty('contactName');
  });
});

describe('summaryItemOf (who is responsible)', () => {
  it('should use the responsible of the first child when the item has none', () => {
    const out = summaryItemOf({ responsible: null, opportunity: { id: 'o' }, children: [{ responsible: null }, { responsible: { code: 'QA-002', name: 'ทดสอบ สอง' } }] });
    expect(out).toMatchObject({ contactCode: 'QA-002', contactName: 'ทดสอบ สอง' });
  });

  it('should prefer the responsible of the item itself, and leave the name empty when nobody has one', () => {
    expect(summaryItemOf({ responsible: { name: 'เจ้าของ' }, children: [{ responsible: { name: 'ลูก' } }] })).toMatchObject({ contactName: 'เจ้าของ' });
    expect(summaryItemOf({ responsible: null, children: [] })).not.toHaveProperty('contactName');
  });

  it('should carry the id of the responsible (the panel saves a contact under it), of the item or of its first child', () => {
    expect(summaryItemOf({ responsible: { id: 1004, code: 'E04', name: 'ก' } })).toMatchObject({ contactId: 1004 });
    expect(summaryItemOf({ responsible: null, children: [{ responsible: { id: 1005, name: 'ข' } }] })).toMatchObject({ contactId: 1005 });
  });
});

describe('channelCounts (activity.summary → the counters of the eight channels)', () => {
  const ZERO = { note: 0, line: 0, facebook: 0, whatsapp: 0, email: 0, sms: 0, call: 0, visit: 0 };

  it('should read an object by the name of the channel (fb = facebook)', () => {
    expect(channelCounts({ note: 2, line: 1, fb: 3, call: 4 })).toEqual({ ...ZERO, note: 2, line: 1, facebook: 3, call: 4 });
  });

  it('should read a list of { channel, count } and add up a channel that comes twice', () => {
    expect(channelCounts([{ channel: 'Call Out', count: 2 }, { channel: 'call_in', count: 1 }, { type: 'WhatsApp', total: 5 }])).toEqual({ ...ZERO, call: 3, whatsapp: 5 });
  });

  it('should put the values in the columns in order when no name is a channel (a list of numbers, or an object of other names)', () => {
    expect(channelCounts([1, 2, 3])).toEqual({ ...ZERO, note: 1, line: 2, facebook: 3 });
    expect(channelCounts({ a: 4, b: 5 })).toEqual({ ...ZERO, note: 4, line: 5 });
  });

  it('should know visitCount / call_total as the counters of a channel, and not put a list of other names in order when it is told not to', () => {
    expect(channelCounts({ visitCount: 3, call_total: 2 })).toEqual({ ...ZERO, visit: 3, call: 2 });
    expect(channelCounts({ opportunityId: 'x', a: 4 }, false)).toEqual(ZERO);
  });

  it('should be all zero when there is no summary or a count is not a number', () => {
    expect(channelCounts(undefined)).toEqual(ZERO);
    expect(channelCounts({ note: 'x', line: null })).toEqual(ZERO);
  });
});
