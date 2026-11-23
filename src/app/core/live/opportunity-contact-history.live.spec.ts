import { describe, expect, it } from 'vitest';
import { activityRows, channelsParam, historyEntryOf, opportunityContactHistoryRoutes } from './opportunity-contact-history.live';
import { fakeRest, type FakeAnswer } from './rest-fake';

const row = (o: Record<string, unknown> = {}) => ({
  id: 'a1',
  changeDate: '2026-11-18T09:30:00',
  channel: 'Call Out',
  content: 'โทรนัดพบ',
  activityGroup: { id: 'g1', name: 'ขาย' },
  activity: { id: 's1', name: 'นัดพบลูกค้า' },
  employee: { id: 'e1', code: 'E01', name: 'สมหญิง', attachFile: 'https://f/e1.png' },
  ...o,
});
const ASK = '/board/lead/contact-activities';

describe('OP04 contact history of an opportunity', () => {
  it('reads the activities from a list or a page of one', () => {
    expect(activityRows({ result: [row()] })).toHaveLength(1);
    expect(activityRows({ result: { items: [row(), row()] } })).toHaveLength(2);
    expect(activityRows({ result: {} })).toEqual([]);
    expect(activityRows(undefined)).toEqual([]);
  });

  it('an activity is the entry the page reads: date, channel, icon key, content, group, step, employee', () => {
    expect(historyEntryOf(row())).toEqual({
      id: 'a1',
      changeDate: '2026-11-18T09:30:00',
      channel: 'Call Out',
      type: 'call_out',
      content: 'โทรนัดพบ',
      procedureGroupId: 'g1',
      procedureGroupName: 'ขาย',
      procedureId: 's1',
      procedureName: 'นัดพบลูกค้า',
      employee: { id: 'e1', code: 'E01', name: 'สมหญิง', attachFile: 'https://f/e1.png' },
    });
  });

  it('other shapes are read too: the channel as { name }, a `type` of its own, flat group / step, another date / content / person name', () => {
    expect(historyEntryOf({ id: 1, contactedAt: 'd', channel: { name: 'Line' }, type: 'forward', detail: 'x', procedureGroupId: 7, procedureGroupName: 'G', procedureId: 9, procedureName: 'S', recorder: { name: 'ก' } })).toMatchObject({
      changeDate: 'd',
      channel: 'Line',
      type: 'forward',
      content: 'x',
      procedureGroupId: 7,
      procedureGroupName: 'G',
      procedureId: 9,
      procedureName: 'S',
      employee: { name: 'ก' },
    });
    expect(historyEntryOf({ id: 2 })).toMatchObject({ channel: '', type: '', content: '', procedureGroupId: null, procedureId: null, employee: {} });
  });

  it('the content (shown after the channel icon) is found on the activity, in an object of it, or in the entries of a list of it; the channel too', () => {
    expect(historyEntryOf({ id: 1, content: 'โทรนัดพบ', channel: 'Line' })).toMatchObject({ content: 'โทรนัดพบ', channel: 'Line', type: 'line' });
    expect(historyEntryOf({ id: 2, contact: { channel: 'Call Out', content: 'ข้อความใน contact' } })).toMatchObject({ content: 'ข้อความใน contact', channel: 'Call Out', type: 'call_out' });
    expect(historyEntryOf({ id: 3, items: [{ channel: 'Line', content: 'หนึ่ง' }, { channel: 'Call In', content: 'สอง' }, { content: '' }] })).toMatchObject({ content: 'หนึ่ง\nสอง', channel: 'Line' });
    expect(historyEntryOf({ id: 4, content: 'ของเอง', contact: { content: 'ข้างใน' } })['content']).toBe('ของเอง');
    // no text: "contacted via <channel>" (the label is the message of the app); no text and no channel: nothing
    expect(historyEntryOf({ id: 5, content: '   ', channel: 'Line' })['content']).toBe('ติดต่อด้วย Line');
    expect(historyEntryOf({ id: 6, content: null, channel: { name: 'Call Out' } }, 'Contacted via')['content']).toBe('Contacted via Call Out');
    expect(historyEntryOf({ id: 7 })['content']).toBe('');
  });

  it('workRecordDate (the reference time shown after the text) is given when the activity has it, and not otherwise', () => {
    expect(historyEntryOf(row({ workRecordDate: '2026-11-17T08:00:00' }))).toMatchObject({ workRecordDate: '2026-11-17T08:00:00' });
    expect(historyEntryOf(row({ workRecordedAt: '2026-11-16T08:00:00' }))).toMatchObject({ workRecordDate: '2026-11-16T08:00:00' });
    expect('workRecordDate' in historyEntryOf(row())).toBe(false);
    expect('workRecordDate' in historyEntryOf(row({ workRecordDate: null }))).toBe(false);
  });

  it('the person beside the time is the recorder; with none (null, or an empty object) it is the responsibleEmployee', () => {
    const recorder = { id: 'r1', code: 'R01', name: 'ผู้บันทึก' };
    const responsible = { id: 'e2', code: 'E02', name: 'ผู้รับผิดชอบ', attachFile: 'https://f/e2.png' };
    expect(historyEntryOf({ id: 1, recorder, responsibleEmployee: responsible })['employee']).toMatchObject({ id: 'r1', name: 'ผู้บันทึก' });
    expect(historyEntryOf({ id: 2, recorder: null, responsibleEmployee: responsible })['employee']).toMatchObject({ id: 'e2', name: 'ผู้รับผิดชอบ', attachFile: 'https://f/e2.png' });
    expect(historyEntryOf({ id: 3, recorder: {}, responsibleEmployee: responsible })['employee']).toMatchObject({ id: 'e2' });
    expect(historyEntryOf({ id: 4, recorder: null, responsibleEmployee: null })['employee']).toEqual({});
  });

  it('the channels of the filter modal are sent as the service wants them (CALL_IN,CALL_OUT); none → no channels param', async () => {
    expect(channelsParam('call in,Call out')).toBe('CALL_IN,CALL_OUT');
    expect(channelsParam('line, facebook ,LINE')).toBe('LINE,FACEBOOK');
    expect(channelsParam('')).toBe('');
    expect(channelsParam(null)).toBe('');
    const s = fakeRest(() => ({ status: 200, result: [] }) as FakeAnswer);
    const route = opportunityContactHistoryRoutes(s.deps);
    await route(ASK, new URLSearchParams('leadId=o-1&channels=Call%20out%2Cline'), undefined);
    await route(ASK, new URLSearchParams('leadId=o-1'), undefined);
    expect(s.calls.map((c) => c.path)).toEqual(['/opportunities/o-1/contact-activities?page=1&perPage=20&channels=CALL_OUT%2CLINE', '/opportunities/o-1/contact-activities?page=1&perPage=20']);
  });

  it('asks one page: GET /opportunities/{id}/contact-activities?page=&perPage=, answers { items, meta.count }', async () => {
    const full = Array.from({ length: 20 }, (_, i) => row({ id: 'a' + i }));
    const s = fakeRest(() => ({ status: 200, result: full }) as FakeAnswer);
    const route = opportunityContactHistoryRoutes(s.deps);
    const body = await (await route(ASK, new URLSearchParams('leadId=o-1'), undefined))!.json();
    expect(s.calls.map((c) => `${c.method} ${c.path}`)).toEqual(['GET /opportunities/o-1/contact-activities?page=1&perPage=20']);
    expect(body.meta).toEqual({ page: 1, perPage: 20, count: 20 });
    expect(body.items).toHaveLength(20);
    await route(ASK, new URLSearchParams('leadId=o-1&page=2&perPage=20'), undefined);
    expect(s.calls[1].path).toBe('/opportunities/o-1/contact-activities?page=2&perPage=20');
  });

  it('a short page is the last (count < perPage); a refusal is an empty page; no leadId → 400; other addresses are not its business', async () => {
    const short = fakeRest(() => ({ status: 200, result: [row()] }) as FakeAnswer);
    expect((await (await opportunityContactHistoryRoutes(short.deps)(ASK, new URLSearchParams('leadId=o-1&page=3'), undefined))!.json()).meta).toEqual({ page: 3, perPage: 20, count: 1 });
    const no = fakeRest(() => ({ status: 403, text: '{}' }) as FakeAnswer);
    expect(await (await opportunityContactHistoryRoutes(no.deps)(ASK, new URLSearchParams('leadId=o-1'), undefined))!.json()).toEqual({ items: [], meta: { page: 1, perPage: 20, count: 0 } });
    expect((await opportunityContactHistoryRoutes(no.deps)(ASK, new URLSearchParams(), undefined))!.status).toBe(400);
    expect(await opportunityContactHistoryRoutes(no.deps)('/board/lead/contact-history', new URLSearchParams('leadId=1'), undefined)).toBeNull();
    expect(await opportunityContactHistoryRoutes(no.deps)(ASK, new URLSearchParams('leadId=1'), { method: 'POST' })).toBeNull();
  });
});
