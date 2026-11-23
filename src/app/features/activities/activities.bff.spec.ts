import { describe, expect, it } from 'vitest';
import type { ActivitiesRest, ContactActivitiesQuery, ContactActivityItem, ContactHistoryEntry, OpportunityByIdResult, RestText } from './activities-backend';
import {
  badgeStatus,
  buildHistoryGroups,
  channelKey,
  collapseAttachUrl,
  contactChannelLabel,
  fetchActivityDetail,
  fetchActivityList,
  fetchContactHistoryArr,
  fmtDateTime,
  isContactChannel,
  isoToThai,
  javaSplit,
  javaTrim,
  mapSummary,
  sortByChangeDateDesc,
} from './activities.bff';

/* The BFF of the page is a port of ContactActivityApiService / LeadBoardView / AttachUrl: these tests pin the arithmetic that the totals depend on,
   with a hand-made REST service (no seed), so that a change of the port shows up here and not only in the comparison with the Java page.
   The expectations were written from the Java source, not from the output of this code. */

const item = (o: Partial<ContactActivityItem> & { leadId: number }): ContactActivityItem => ({
  contactCode: 'E1', contactName: 'สมชาย', prospectName: 'ลูกค้า ' + o.leadId, prospectId: o.leadId, prospectCode: 'P' + o.leadId, prospectTel: '', txNo: 'T' + o.leadId, leadDemand: '',
  procedureGroupId: 101, procedureId: 1011, procedureName: 'ขั้นตอน', groupCount: 1, leadStatus: 'ACTIVE', activeStatus: 'HOT', lastContactDate: '2026-10-01T10:00:00', assignDate: '2026-09-01',
  note: 0, line: 0, facebook: 0, whatsapp: 0, email: 0, sms: 0, call: 0, visit: 0, ...o,
});
/** what `Data_API` saw: the HTTP status and the body text */
const text = (status: number, body: unknown): RestText => ({ status, body: typeof body === 'string' ? body : body == null ? '' : JSON.stringify(body) });
const ok = <T>(result: T): RestText => text(200, { status: 200, message: 'success', result });
const statusSummary = { total: 9, new: 1, success: 2, lost: 1, inactive: 1, active: { total: 4, hot: 2, warm: 1, cold: 1 } };

function rest(parts: { lead?: ContactActivityItem[]; group?: ContactActivityItem[]; meta?: { totalPages: number; total: number }; history?: Record<string, unknown>; leadById?: (id: string, g?: string) => RestText; seen?: ContactActivitiesQuery[]; extra?: Record<string, unknown> }): ActivitiesRest {
  return {
    async contactActivities(q) {
      parts.seen?.push(q);
      const items = (q.groupBy === 'lead' ? parts.lead : parts.group) ?? [];
      return ok({ items, meta: { page: q.pageNo ?? 0, perPage: q.pageSize, total: parts.meta?.total ?? items.length, totalPages: parts.meta?.totalPages ?? 1 }, statusSummary, usesWorkflowStep: true, wfStepSummary: [{ id: 101, code: 'CS', name: 'CS', count: 3 }], movementTypeId: 7, ...parts.extra });
    },
    async contactHistory(id) {
      return ok(parts.history?.[id] ?? { groups: [] });
    },
    async leadById(id, g) {
      return parts.leadById ? parts.leadById(id, g) : text(404, { status: 404, message: 'x', error: { code: 404, message: 'ไม่พบ' } });
    },
  };
}

describe('the small mappings of the Java BFF', () => {
  it('isoToThai: yyyy-mm-dd[…] → dd/mm/yyyy, anything else as it is', () => {
    expect(isoToThai('2026-10-14T09:30:00')).toBe('14/10/2026');
    expect(isoToThai('2026-10-14 09:30')).toBe('14/10/2026');
    expect(isoToThai('')).toBe('');
    expect(isoToThai('soon')).toBe('soon');
    expect(isoToThai('2026-10')).toBe('2026-10');
  });
  it('fmtDateTime: 12-hour clock with AM / PM; a time that is not a number is left out; trailing empty parts are dropped like String.split', () => {
    expect(fmtDateTime('2026-10-14T00:05:00')).toBe('14/10/2026 12:05 AM');
    expect(fmtDateTime('2026-10-14T09:30:00')).toBe('14/10/2026 09:30 AM');
    expect(fmtDateTime('2026-10-14T12:00:00')).toBe('14/10/2026 12:00 PM');
    expect(fmtDateTime('2026-10-14T23:59:00')).toBe('14/10/2026 11:59 PM');
    expect(fmtDateTime('2026-10-14')).toBe('14/10/2026');
    expect(fmtDateTime('2026-10-14T09')).toBe('14/10/2026 09:00 AM');
    expect(fmtDateTime('2026-10-14T09:')).toBe('14/10/2026 09:00 AM'); // "09:".split(":") is ["09"] in Java
    expect(fmtDateTime('2026-10-14 17:45:10')).toBe('14/10/2026 05:45 PM');
    expect(fmtDateTime('2026-10-14T9x:30')).toBe('14/10/2026'); // Integer.parseInt fails: the time is dropped
  });
  it('badgeStatus: ACTIVE shows the activeStatus, no status = NEW', () => {
    expect(badgeStatus({ leadStatus: 'active', activeStatus: 'warm' })).toBe('WARM');
    expect(badgeStatus({ leadStatus: 'LOST' })).toBe('LOST');
    expect(badgeStatus({})).toBe('NEW');
    expect(badgeStatus({ leadStatus: 'ACTIVE' })).toBe('NEW');
  });
  it('mapSummary: the nested active block is flattened, missing keys are 0, a text number is read like org.json', () => {
    expect(mapSummary(statusSummary)).toEqual({ total: 9, new: 1, success: 2, lost: 1, inactive: 1, active: 4, active_high: 2, active_medium: 1, active_low: 1 });
    expect(mapSummary(null)).toEqual({ total: 0, new: 0, success: 0, lost: 0, inactive: 0, active: 0, active_high: 0, active_medium: 0, active_low: 0 });
    expect(mapSummary({ total: '7', active: 'x' })).toMatchObject({ total: 7, active: 0 });
  });
  it('channelKey / isContactChannel: the columns of the table, system events are not contacts', () => {
    expect(['Line', 'WhatsApp', 'Facebook', 'Email', 'SMS', 'Call Out', 'Visit', 'Manual', 'ไลน์', 'โทรออก'].map(channelKey)).toEqual(['line', 'whatsapp', 'fb', 'email', 'sms', 'call', 'visit', 'note', 'line', 'call']);
    expect(isContactChannel('Call Out')).toBe(true);
    expect(isContactChannel('system')).toBe(false);
    expect(isContactChannel('forward_note')).toBe(false);
    expect(isContactChannel('บันทึกโทรออก')).toBe(false); // nothing of a-z0-9 is left: the Java code counts it nowhere
  });
  it('contactChannelLabel: the buttons of the page send snake_case, the backend wants the o2o labels', () => {
    expect(['manual', 'call_out', 'call_in', 'sms', 'email', 'facebook', 'line', 'whatsapp', 'carrier pigeon', ' CALL-OUT '].map(contactChannelLabel)).toEqual(['Manual', 'Call Out', 'Call In', 'SMS', 'Email', 'Facebook', 'Line', 'WhatsApp', 'carrier pigeon', 'Call Out']);
    expect(contactChannelLabel('constructor')).toBe('constructor');
  });
  it('AttachUrl.collapse: one host stays, a host glued in front of a host goes, a path stays', () => {
    expect(collapseAttachUrl('http://h/http://h/http://h/a/b.jpg')).toBe('http://h/a/b.jpg');
    expect(collapseAttachUrl('http://h/a/b.jpg')).toBe('http://h/a/b.jpg');
    expect(collapseAttachUrl('https://h:51774/https://h:51774/prospect/x.png')).toBe('https://h:51774/prospect/x.png');
    expect(collapseAttachUrl(' a/b.jpg ')).toBe('a/b.jpg');
    expect(collapseAttachUrl('')).toBe('');
    expect(collapseAttachUrl(null)).toBe('');
    expect(collapseAttachUrl('HTTP://h/a.jpg')).toBe('HTTP://h/a.jpg'); // the regex is lower case
  });
  it('the Java string helpers: trim cuts up to U+0020 only, split drops the trailing empty strings, compareTo is by code unit', () => {
    expect(javaTrim('\u0001 a  ')).toBe('a ');
    expect(javaSplit('a:b::', ':')).toEqual(['a', 'b']);
    expect(javaSplit('', ':')).toEqual(['']);
    expect(javaSplit(':', ':')).toEqual([]);
    expect(javaSplit(':x', ':')).toEqual(['', 'x']);
  });
  it('sortByChangeDateDesc: newest first by code unit ("T" sorts after " "), what is not an object is dropped, ties keep their order', () => {
    const e = (d: string, n: string): ContactHistoryEntry => ({ changeDate: d, channel: 'Line', content: n, procedureGroupId: 1 });
    const sorted = sortByChangeDateDesc([e('2026-10-01 09:00:00', 'a'), null, e('2026-10-01T09:00:00', 'b'), 5, e('2026-10-02T00:00:00', 'c'), e('2026-10-01T09:00:00', 'd')]);
    expect(sorted.map((x) => x['content'])).toEqual(['c', 'b', 'd', 'a']);
  });
});

describe('buildHistoryGroups', () => {
  const e = (o: Partial<ContactHistoryEntry>): ContactHistoryEntry => ({ changeDate: '2026-10-01T10:00:00', channel: 'Call In', content: 'c', procedureGroupId: 101, procedureGroupName: 'CS', procedureName: 'step 1', ...o });

  it('groups by group + step in the order the entries come, with the icon, time and the person', () => {
    const h = buildHistoryGroups(
      [e({ content: 'a', salePerson: { code: 'E1', name: 'สมชาย' } }), e({ content: 'b', channel: 'Line' }), e({ content: 'c', procedureName: 'step 2' }), e({ content: 'd', procedureGroupId: 102, procedureGroupName: 'AN' })],
      0,
      '',
    );
    expect(h.map((g) => [g['group'], g['category'], g['items'].length])).toEqual([['CS', 'step 1', 2], ['CS', 'step 2', 1], ['AN', 'step 1', 1]]);
    expect(h[0]['items'][0]).toEqual({ text: 'a', time: '01/10/2026 10:00 AM', by: 'E1 สมชาย', icon: 'call' });
    expect(h[0]['items'][1]['icon']).toBe('line');
    expect(h[0]['procedureGroupId']).toBe(101);
  });
  it('the person is the salePerson, else the employee; only an object counts; a missing code leaves the name trimmed', () => {
    const h = buildHistoryGroups([e({ employee: { code: 'E9', name: 'อุษา' } }), e({ salePerson: 'x' as never, employee: { code: '', name: 'วิชัย' } }), e({})], 0, '');
    expect(h[0]['items'].map((i: Record<string, unknown>) => i['by'])).toEqual(['E9 อุษา', 'วิชัย', '']);
  });
  it('wfsFilter keeps one group; a txNo wins over it', () => {
    const list = [e({ content: 'a', contactTxNo: 'X1' }), e({ content: 'b', procedureGroupId: 102, procedureGroupName: 'AN', contactTxNo: 'X2' })];
    expect(buildHistoryGroups(list, 102, '').map((g) => g['group'])).toEqual(['AN']);
    expect(buildHistoryGroups(list, 102, 'X1').map((g) => g['group'])).toEqual(['CS']);
  });
  it('an entry without a group name falls back to its step, then to "การติดต่อ"; system events get their own icon', () => {
    const h = buildHistoryGroups([e({ procedureGroupName: '', procedureName: 'step 9' }), e({ procedureGroupName: '', procedureName: '', channel: 'system', type: 'forward' })], 0, '');
    expect(h.map((g) => g['group'])).toEqual(['step 9', 'การติดต่อ']);
    expect(h[1]['items'][0]['icon']).toBe('forward');
    const icons = buildHistoryGroups([e({ channel: 'system', type: 'return' }), e({ channel: 'system', type: 'create', procedureName: 'b' }), e({ channel: 'forward_note', procedureName: 'c' })], 0, '');
    expect(icons.map((g) => g['items'][0]['icon'])).toEqual(['return', 'system', 'forward']);
  });
});

describe('fetchContactHistoryArr (LeadBoardView.fetchContactHistoryArr)', () => {
  const ask = async (answer: RestText | (() => RestText | Promise<RestText>), id: string | null = '5') =>
    fetchContactHistoryArr({ ...rest({}), contactHistory: async () => (typeof answer === 'function' ? answer() : answer) }, id);
  const entry = { channel: 'Line', procedureGroupId: 1 };

  it('flattens groups[].steps[].items[], groups[].items[] and a flat items[]; a level that has branches does not count its own leaves twice', async () => {
    expect(await ask(ok({ groups: [{ steps: [{ items: [entry, entry] }, { items: [entry] }] }, { items: [entry] }] }))).toHaveLength(4);
    expect(await ask(ok({ items: [entry, 5, null, entry], contactHistoryList: [entry] }))).toHaveLength(3);
    expect(await ask(ok({ groups: [{ items: [entry] }], items: [entry, entry] }))).toHaveLength(1);
  });
  it('a result that is already an array is returned as it is (the old shape)', async () => {
    expect(await ask(ok([entry, 3]))).toEqual([entry, 3]);
  });
  it('[] for anything that is not a 200 body with status 200 and a result: no id, HTTP error, no answer, HTML, a null result, a failure envelope', async () => {
    expect(await ask(ok([entry]), '  ')).toEqual([]);
    expect(await ask(ok([entry]), null)).toEqual([]);
    expect(await ask(text(403, { status: 200, result: [entry] }))).toEqual([]);
    expect(await ask(text(0, ''))).toEqual([]);
    expect(await ask(text(200, '<html/>'))).toEqual([]);
    expect(await ask(text(200, '{bad'))).toEqual([]);
    expect(await ask(text(200, { status: 200, result: null }))).toEqual([]);
    expect(await ask(text(200, { status: 500, result: [entry] }))).toEqual([]);
    expect(await ask(() => Promise.reject(new Error('x')))).toEqual([]);
  });
});

describe('fetchActivityList (ContactActivityApiService.fetchActivityListJson)', () => {
  it('maps the items to rows, the summary and the paging meta', async () => {
    const out = await fetchActivityList(rest({ lead: [item({ leadId: 1, call: 2 }), item({ leadId: 2, leadStatus: 'LOST', activeStatus: '' })], meta: { totalPages: 3, total: 41 } }), { page: 1, perPage: 20 });
    expect(out['summary']).toEqual(mapSummary(statusSummary));
    expect(out['usesWorkflowStep']).toBe(true);
    expect(out['wfStepSummary']).toEqual([{ id: 101, code: 'CS', name: 'CS', count: 3 }]);
    expect(out['rows'].map((r: Record<string, unknown>) => [r['id'], r['interest'], r['call'], r['date']])).toEqual([[1, 'HOT', 2, '01/10/2026'], [2, 'LOST', 0, '01/10/2026']]);
    expect(out['meta']).toEqual({ page: 1, perPage: 20, total: 41, totalPages: 3, hasMore: true });
    expect(out['rowCount']).toBe(2);
    expect(out['totalRows']).toBe(41);
    expect(out['maxRows']).toBe(1000);
  });
  it('hasMore is false on the last page; page 2 asks the backend for pageNo 1 (0-based), page 1 for none; perPage is capped at 200 and at least 1', async () => {
    const seen: ContactActivitiesQuery[] = [];
    const out = await fetchActivityList(rest({ lead: [item({ leadId: 1 })], meta: { totalPages: 2, total: 21 }, seen }), { page: 2, perPage: 5000 });
    expect(out['meta'].hasMore).toBe(false);
    expect(seen.every((q) => q.pageNo === 1 && q.pageSize === 200)).toBe(true);
    expect(seen.map((q) => q.groupBy).sort()).toEqual(['group', 'lead']);
    seen.length = 0;
    await fetchActivityList(rest({ seen }), { page: 0, perPage: 0 });
    expect(seen.every((q) => q.pageNo === undefined && q.pageSize === 1)).toBe(true);
  });
  it('sends the filters of the page under the names of ContactActivityListReqDTO, trimmed; a blank one is left out', async () => {
    const seen: ContactActivitiesQuery[] = [];
    await fetchActivityList(rest({ seen }), { movementTypeId: ' 7 ', saleGroupId: '3', employeeName: 'สม', search: 'ธน', sortBy: 'name_desc', lastContactFrom: '2026-09-01', lastContactTo: '2026-09-30', showClosed: 'true', activeStatus: '  ', page: 1, perPage: 20 });
    expect(seen[0]).toMatchObject({ movementTypeId: '7', saleGroupId: '3', employeeName: 'สม', contactName: 'ธน', sortBy: 'prospectName_desc', lastContactFrom: '2026-09-01', lastContactTo: '2026-09-30', showClosed: 'true', pageNo: undefined });
    expect(seen[0].activeStatus).toBeUndefined();
    await fetchActivityList(rest({ seen }), { sortBy: 'unknown', page: 1, perPage: 20 });
    expect(seen[seen.length - 1].sortBy).toBeUndefined();
  });
  it('the service says no with an HTTP error: Data_API.sendGET gave "" so the table prints the generic reason, not the message of the service', async () => {
    const refusing: ActivitiesRest = { ...rest({}), contactActivities: async () => text(403, { status: 403, message: 'Forbidden', error: { code: 403, message: 'ไม่มีสิทธิ์' } }) };
    const out = await fetchActivityList(refusing, { page: 1, perPage: 20 });
    expect(out['rows']).toEqual([]);
    expect(out['error']).toBe('ไม่ได้รับข้อมูลจาก API การติดต่อ');
    expect(out['summary']['total']).toBe(0);
    expect(out['usesWorkflowStep']).toBe(false);
    expect(out['wfStepSummary']).toEqual([]);
  });
  it('an HTTP 200 whose envelope says no: error.message first, then message, then the default', async () => {
    const says = (body: unknown): ActivitiesRest => ({ ...rest({}), contactActivities: async () => text(200, body) });
    const err = async (body: unknown) => (await fetchActivityList(says(body), { page: 1, perPage: 20 }))['error'];
    expect(await err({ status: 403, message: 'Forbidden', error: { code: 403, message: ' ไม่มีสิทธิ์ ' } })).toBe('ไม่มีสิทธิ์');
    expect(await err({ status: 403, message: ' Forbidden ' })).toBe('Forbidden');
    expect(await err({ status: 500, error: { message: ' ' } })).toBe('โหลดข้อมูลการติดต่อไม่สำเร็จ');
    expect(await err({ status: 200 })).toBe('โหลดข้อมูลการติดต่อไม่สำเร็จ'); // no result
    expect(await err({ status: 200, result: [] })).toBe('โหลดข้อมูลการติดต่อไม่สำเร็จ'); // a result that is not an object
  });
  it('no answer at all / HTML / a status that is not a JSON object: the empty list with the generic message', async () => {
    const answers = [text(0, ''), text(200, ''), text(200, '<html>x</html>'), text(200, '[1]')];
    for (const a of answers) {
      const down: ActivitiesRest = { ...rest({}), contactActivities: async () => a };
      expect((await fetchActivityList(down, { page: 1, perPage: 20 }))['error']).toBe('ไม่ได้รับข้อมูลจาก API การติดต่อ');
    }
  });
  it('a body that starts with "{" but is not JSON is an exception in Java: the empty list that carries the message of the exception', async () => {
    const broken: ActivitiesRest = { ...rest({}), contactActivities: async () => text(200, '{"status": 200, ') };
    const out = await fetchActivityList(broken, { page: 1, perPage: 20 });
    expect(out['rows']).toEqual([]);
    expect(out['error']).toMatch(/JSONException/);
  });
  it('the lead answer decides first: its error wins over a broken group answer; a broken group answer alone is an error too', async () => {
    const base = rest({ lead: [item({ leadId: 1 })] });
    const leadDown: ActivitiesRest = { ...base, contactActivities: async (q) => (q.groupBy === 'lead' ? text(500, '') : text(200, '{bad')) };
    expect((await fetchActivityList(leadDown, { page: 1, perPage: 20 }))['error']).toBe('ไม่ได้รับข้อมูลจาก API การติดต่อ');
    const groupBroken: ActivitiesRest = { ...base, contactActivities: async (q) => (q.groupBy === 'group' ? text(200, '{bad') : base.contactActivities(q)) };
    expect((await fetchActivityList(groupBroken, { page: 1, perPage: 20 }))['error']).toMatch(/JSONException/);
    // a group answer that is merely refused is no error: the lead rows are still shown
    const groupRefused: ActivitiesRest = { ...base, contactActivities: async (q) => (q.groupBy === 'group' ? text(403, '{}') : base.contactActivities(q)) };
    expect((await fetchActivityList(groupRefused, { page: 1, perPage: 20 }))['rows']).toHaveLength(1);
  });
  it('the same lead + step + group once (dedupe); items that are not objects are skipped; at most 1000 rows', async () => {
    const out = await fetchActivityList(rest({ lead: [item({ leadId: 1 }), item({ leadId: 1 }), 7 as never, item({ leadId: 1, procedureGroupId: 102 })] }), { page: 1, perPage: 20 });
    expect(out['rows']).toHaveLength(2);
    const many = Array.from({ length: 1200 }, (_, i) => item({ leadId: i + 1 }));
    expect((await fetchActivityList(rest({ lead: many }), { page: 1, perPage: 200 }))['rows']).toHaveLength(1000);
  });
  it('the avatars of the customer and of the contact are collapsed; tags that are not an array become []; usesWorkflowStep is read like optBoolean', async () => {
    const out = await fetchActivityList(
      rest({ lead: [item({ leadId: 1, prospectAvatar: 'http://h/http://h/p/a.jpg', contactAvatar: 'http://h/http://h/e/b.jpg', tags: 'x' as never })], extra: { usesWorkflowStep: 'TRUE' } }),
      { page: 1, perPage: 20 },
    );
    expect(out['usesWorkflowStep']).toBe(true);
    expect(out['rows'][0]).toMatchObject({ customer_avatar: 'http://h/p/a.jpg', agent_avatar: 'http://h/e/b.jpg', tags: [] });
    expect(out['rows'][0]['children'][0]).toMatchObject({ customer_avatar: 'http://h/p/a.jpg', agent_avatar: 'http://h/e/b.jpg' });
  });

  describe('the group of a row and its child rows', () => {
    it('stepGroupOf: the name of the item, else the groupBy=group answer, else the step', async () => {
      const out = await fetchActivityList(
        rest({ lead: [item({ leadId: 1, procedureGroupName: 'CS' }), item({ leadId: 2 }), item({ leadId: 3 })], group: [item({ leadId: 2, procedureGroupName: 'AN' })] }),
        { page: 1, perPage: 20 },
      );
      expect(out['rows'].map((r: Record<string, unknown>) => r['step_group'])).toEqual(['CS', 'AN', 'ขั้นตอน']);
    });
    it('a lead with one group: its only child row is built from the item itself', async () => {
      const out = await fetchActivityList(rest({ lead: [item({ leadId: 1, procedureGroupName: 'CS', note: 3 })] }), { page: 1, perPage: 20 });
      expect(out['rows'][0]['children']).toEqual([expect.objectContaining({ group: 'CS', note: 3, procedureGroupId: 101, agent_name: 'สมชาย' })]);
      expect(out['rows'][0]['history']).toBeUndefined();
    });
    it('a lead with several groups: the groupBy=group rows are topped up from the contact history, the parent counts max(backend, sum of the groups) and the history is attached', async () => {
      const hist: ContactHistoryEntry[] = [
        { changeDate: '2026-09-01T09:00:00', channel: 'system', type: 'create', content: 'สร้าง', procedureGroupId: 101, procedureGroupName: 'CS', procedureName: 's1' },
        { changeDate: '2026-09-02T09:00:00', channel: 'Call Out', content: 'a', procedureGroupId: 101, procedureGroupName: 'CS', procedureName: 's1' },
        { changeDate: '2026-09-03T09:00:00', channel: 'Call In', content: 'b', procedureGroupId: 101, procedureGroupName: 'CS', procedureName: 's1' },
        { changeDate: '2026-09-04T09:00:00', channel: 'Line', content: 'c', procedureGroupId: 102, procedureGroupName: 'AN', procedureName: 's2' },
        { changeDate: '2026-09-05T09:00:00', channel: 'forward_note', content: 'โน้ต', procedureGroupId: 102, procedureGroupName: 'AN', procedureName: 's2' },
      ];
      const out = await fetchActivityList(
        rest({
          // the backend counts only the current group (AN: 1 line) and answers ONE groupBy=group row for the lead
          lead: [item({ leadId: 5, groupCount: 2, procedureGroupId: 102, line: 1 })],
          group: [item({ leadId: 5, groupCount: 2, procedureGroupId: 102, procedureGroupName: 'AN', line: 1 })],
          history: { '5': { groups: [{ steps: [{ items: hist.slice(0, 3) }] }, { steps: [{ items: hist.slice(3) }] }] } },
        }),
        { page: 1, perPage: 20 },
      );
      const row = out['rows'][0];
      expect(row['children'].map((c: Record<string, unknown>) => [c['group'], c['call'], c['line'], c['date']])).toEqual([['CS', 2, 0, '03/09/2026'], ['AN', 0, 1, '04/09/2026']]);
      expect([row['call'], row['line'], row['note']]).toEqual([2, 1, 0]); // the forward note and the create event count nowhere
      expect(row['history'].map((g: Record<string, unknown>) => g['group'])).toEqual(['AN', 'CS']); // newest first
    });
    it('when the groupBy=group rows are complete the history is still fetched (and attached), but nothing is topped up; the parent still counts max(backend, sum)', async () => {
      const calls: string[] = [];
      const hist = [{ changeDate: '2026-09-02T09:00:00', channel: 'Call Out', content: 'a', procedureGroupId: 101, procedureGroupName: 'CS', procedureName: 's1' }];
      const base = rest({
        lead: [item({ leadId: 5, groupCount: 2, call: 0 })],
        group: [item({ leadId: 5, groupCount: 2, procedureGroupName: 'CS', call: 4 }), item({ leadId: 5, groupCount: 2, procedureGroupId: 102, procedureGroupName: 'AN', line: 1 })],
        history: { '5': { items: hist } },
      });
      const out = await fetchActivityList({ ...base, contactHistory: async (id) => (calls.push(id), base.contactHistory(id)) }, { page: 1, perPage: 20 });
      expect(calls).toEqual(['5']);
      expect(out['rows'][0]['children']).toHaveLength(2);
      expect(out['rows'][0]['call']).toBe(4);
      expect(out['rows'][0]['history']).toHaveLength(1);
    });
    it('a lead whose history cannot be read keeps the child rows the backend sent and gets no history; a failed groupBy=group is covered by the history', async () => {
      const hist = [{ changeDate: '2026-09-02T09:00:00', channel: 'Line', content: 'a', procedureGroupId: 101, procedureGroupName: 'CS', procedureName: 's1' }, { changeDate: '2026-09-03T09:00:00', channel: 'Line', content: 'b', procedureGroupId: 102, procedureGroupName: 'AN', procedureName: 's2' }];
      const lead = [item({ leadId: 5, groupCount: 2 })];
      const noHistory = await fetchActivityList({ ...rest({ lead, group: [item({ leadId: 5, groupCount: 2, procedureGroupName: 'CS' })] }), contactHistory: async () => text(500, '') }, { page: 1, perPage: 20 });
      expect(noHistory['rows'][0]['children']).toHaveLength(1);
      expect(noHistory['rows'][0]['history']).toBeUndefined();
      const base = rest({ lead, history: { '5': { items: hist } } });
      const groupDown = await fetchActivityList({ ...base, contactActivities: async (q) => (q.groupBy === 'group' ? text(500, '') : base.contactActivities(q)) }, { page: 1, perPage: 20 });
      expect(groupDown['rows'][0]['children'].map((c: Record<string, unknown>) => c['group'])).toEqual(['CS', 'AN']);
    });
  });
});

describe('fetchActivityDetail (LeadBoardView.fetchActivityDetailResult)', () => {
  const lead = (): OpportunityByIdResult => ({
    prospect: { name: 'สมศรี ใจดี', attachFile: '', currentDistrictName: 'เมือง', currentCityName: 'ชลบุรี', customerTel: '0812345678', phoneCountryCode: '+66', countryCode: 'THA' },
    prospectInfo: { fullName: 'x', firstContactDate: '2026-08-01' },
    salePerson: { id: 3, code: 'E3', name: 'วิชัย' },
    saleGroup: { name: 'ทีม B' },
    employee: { id: 1001, code: 'E101', name: 'สมชาย' },
    leadStatus: 'ACTIVE',
    activeStatus: 'COLD',
    contactDate: '2026-08-02',
    currentStep: { procedureGroupId: 102, procedureGroupName: 'AN', procedureName: 'วิเคราะห์' },
    contactHistoryList: [
      { changeDate: '2026-09-04T09:00:00', channel: 'Line', content: 'c', procedureGroupId: 102, procedureGroupName: 'AN', procedureName: 'วิเคราะห์' },
      { changeDate: '2026-09-03T09:00:00', channel: 'Call In', content: 'b', procedureGroupId: 101, procedureGroupName: 'CS', procedureName: 'รับลีด' },
      { changeDate: '2026-09-02T09:00:00', channel: 'Call Out', content: 'a', procedureGroupId: 101, procedureGroupName: 'CS', procedureName: 'รับลีด' },
    ],
    appointmentList: [{ id: 1, subject: 'นัด', date: '2026-10-25', time: '09:30:00', procedureGroupName: 'AN', procedureName: 'วิเคราะห์' }],
    taskList: [
      { id: 2, completed: true, date: '2026-10-26', time: '10:00:00', allDay: false, subject: 'งาน', description: 'ทำ' },
      { id: 3, completed: false, date: '2026-10-27', time: '', allDay: false, subject: 'งานไม่มีเวลา', description: '' },
    ],
  });
  const R = (l: unknown, calls?: string[]): ActivitiesRest =>
    rest({ leadById: (id, g) => (calls?.push(`${id}:${g ?? ''}`), l ? ok(l) : text(500, { status: 500, message: 'boom', error: { code: 500, message: 'ระบบขัดข้อง' } })) });
  const args = { leadId: '9', wfsId: 0, txNo: '', allGroups: false, activityGroupId: 0 };
  const detail = async (r: ActivitiesRest, a = args, def = 'x') => {
    const out = await fetchActivityDetail(r, a, def);
    return { status: out.status, text: out.body, body: JSON.parse(out.body) as Record<string, any> }; // eslint-disable-line @typescript-eslint/no-explicit-any
  };

  it('maps the lead to the fields of the right panel', async () => {
    const r = await detail(R(lead()));
    expect(r.status).toBe(200);
    expect(r.body).toMatchObject({
      customer_name: 'สมศรี ใจดี', location: 'เมือง, ชลบุรี', interest: 'COLD', phone: '0812345678', phoneCountryCode: '+66', countryCode: 'THA', first_contact: '02/08/2026', team: 'ทีม B', owner: 'E3 วิชัย',
      sale_person_name: 'วิชัย', due_date: '02/08/2026', procedureGroupId: 102, movement_type_name: 'AN', current_step: 'วิเคราะห์', employeeId: 1001, salePersonId: 3, createById: 1001, employeeName: 'E101 สมชาย', employeeCode: 'E101', employeeNameOnly: 'สมชาย',
      salePersonName: 'E3 วิชัย', wfsId: 0,
    });
    expect(r.body['appointments']).toEqual([{ title: 'นัด', date: '25/10/2026', time: '09:30', group: 'AN', step: 'วิเคราะห์' }]);
    expect(r.body['tasks']).toEqual([
      expect.objectContaining({ id: 2, completed: true, date: '26/10/2026', time_label: '10:00', title: 'งาน', detail: 'ทำ' }),
      expect.objectContaining({ id: 3, completed: false, time_label: 'ทั้งวัน' }),
    ]);
  });
  it('the fallbacks: the name from prospectInfo, the phone from contactInfo, the date from firstContactDate, the location from whichever part exists, a text boolean', async () => {
    const l = lead() as unknown as Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any
    delete l['prospect'].name;
    delete l['prospect'].customerTel;
    delete l['prospect'].currentDistrictName;
    delete l['contactDate'];
    l['prospectInfo'] = { fullName: '  ชื่อเต็ม  ', firstContactDate: '2026-07-07T10:00:00', contactInfo: { mobile1: '0999' } };
    l['taskList'][0].completed = 'true';
    l['taskList'][0].allDay = 'true';
    const r = await detail(R(l));
    expect(r.body).toMatchObject({ customer_name: 'ชื่อเต็ม', phone: '0999', first_contact: '07/07/2026', due_date: '', location: 'ชลบุรี' });
    expect(r.body['tasks'][0]).toMatchObject({ completed: true, time_label: 'ทั้งวัน' });
  });
  it('the customer picture is collapsed (a host glued in front of a host)', async () => {
    const l = lead();
    l.prospect.attachFile = 'http://h/http://h/prospect/x.png';
    const r = await detail(R(l));
    expect(r.body['customer_avatar']).toBe('http://h/prospect/x.png');
    expect(r.body['events'][0]['customer_avatar']).toBe('http://h/prospect/x.png');
  });
  it('the history is the current group unless the whole lead / a group / a contact is asked for; the events are one row per group', async () => {
    const groups = async (a: Partial<typeof args>) => (await detail(R(lead()), { ...args, ...a })).body['history'].map((h: Record<string, unknown>) => h['group']);
    expect(await groups({})).toEqual(['AN']);
    expect(await groups({ allGroups: true })).toEqual(['AN', 'CS']);
    expect(await groups({ wfsId: 101 })).toEqual(['CS']);
    expect(await groups({ wfsId: 101, allGroups: true })).toEqual(['CS']);
    const events = (await detail(R(lead()))).body['events'];
    expect(events.map((e: Record<string, unknown>) => [e['group'], e['line'], e['call'], e['date'], e['procedureGroupId']])).toEqual([['AN', 1, 0, '04/09/2026', 102], ['CS', 0, 2, '03/09/2026', 101]]);
  });
  it('a lead without an employee: createById falls back to the sale person', async () => {
    const l = lead();
    delete l.employee;
    const r = await detail(R(l));
    expect(r.body).toMatchObject({ employeeId: 0, createById: 3, employeeName: '', employeeNameOnly: '', employeeCode: '' });
  });
  it('asks for the group first and without it when that fails', async () => {
    const calls: string[] = [];
    const flaky: ActivitiesRest = { ...R(lead()), leadById: async (id, g) => (calls.push(`${id}:${g ?? ''}`), g ? text(400, { status: 400, message: 'bad' }) : ok(lead())) };
    const r = await detail(flaky, { ...args, activityGroupId: 102 });
    expect(r.status).toBe(200);
    expect(calls).toEqual(['9:102', '9:']);
  });
  it('when both asks fail the error of the FIRST ask (with the group) is what the page gets', async () => {
    const both: ActivitiesRest = { ...R(lead()), leadById: async (_id, g) => (g ? text(400, { status: 400, message: 'bad', error: { code: 400, message: 'ต้องระบุกลุ่ม' } }) : text(500, { status: 500, error: { message: 'อีกอัน' } })) };
    const r = await detail(both, { ...args, activityGroupId: 102 });
    expect(r.status).toBe(400);
    expect(r.body['error'].message).toBe('ต้องระบุกลุ่ม');
  });
  it('a failure is passed on with its status and body (the page prints error.message); no body → the default message', async () => {
    const bad = await detail(R(null), args, 'default');
    expect(bad.status).toBe(500);
    expect(bad.body['error'].message).toBe('ระบบขัดข้อง');
    const none = await detail({ ...R(null), leadById: async () => text(0, '') }, args, 'ไม่ได้');
    expect(none.status).toBe(502);
    expect(none.body).toEqual({ status: 502, message: 'ไม่ได้', error: { code: 502, message: 'ไม่ได้' } });
    const html = await detail({ ...R(null), leadById: async () => text(502, '<html/>') }, args, 'D');
    expect(html).toMatchObject({ status: 502, body: { error: { message: 'D' } } });
    // HTTP 200 with an envelope that says no: its own status (≥ 400) goes on
    const envNo = await detail({ ...R(null), leadById: async () => text(200, { status: 403, error: { message: 'ไม่มีสิทธิ์' } }) }, args, 'D');
    expect(envNo.status).toBe(403);
  });
  it('a result that is not a JSON object is a 500 with the default message (new JSONObject threw); no lead id = 502', async () => {
    const notObj = await detail({ ...R(null), leadById: async () => ok([1]) }, args, 'ขัดข้อง');
    expect(notObj).toMatchObject({ status: 500, body: { status: 500, error: { code: 500, message: 'ขัดข้อง' } } });
    const noId = await detail({ ...R(null), leadById: async () => text(0, '') }, { ...args, leadId: '' }, 'D');
    expect(noId.status).toBe(502);
  });
  it('lists that are not arrays and entries that are not objects are skipped', async () => {
    const l = lead() as unknown as Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any
    l['appointmentList'] = [null, 4, { subject: 'ok' }];
    l['taskList'] = 'x';
    l['contactHistoryList'] = { not: 'a list' };
    const r = await detail(R(l));
    expect(r.body['appointments']).toEqual([{ title: 'ok', date: '', time: '', group: '', step: '' }]);
    expect(r.body['tasks']).toEqual([]);
    expect(r.body['history']).toEqual([]);
    expect(r.body['events']).toEqual([]);
  });
});
