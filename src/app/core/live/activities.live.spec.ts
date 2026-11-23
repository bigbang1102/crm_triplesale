import { beforeEach, describe, expect, it, vi } from 'vitest';
import { activityRoutes, contactActivitiesPath, scheduleFilterStore, scheduleRoutes, savedFilterText, type FilterStore } from './activities.live';
import { composeRoutes } from './rest';
import { fakeRest, type FakeAnswer, type FakeCall, type FakeOptions } from './rest-fake';

/* The expectations of this file come from reading the Java servlets (ActivityListServlet, ActivityDetailServlet, ContactActivitiesServlet,
   AssignLeadServlet, ActivityGroupsServlet, ActivityStepsServlet, ForwardAssigneesServlet, ScheduleFetchServlet, ScheduleFilterStateServlet) and
   ContactActivityApiService / LeadBoardView — not from running this code. The fixtures are written from the Java code: nothing here was checked
   against the real service. */

const MESSAGES = { 'label.ld2.lead_load_failed_default': 'LOAD-FAILED' };
const env = (result: unknown, status = 200) => ({ status, message: 'OK', result });
const item = (o: Record<string, unknown>) => ({ leadId: 1, contactCode: 'E1', contactName: 'สมชาย', prospectName: 'ลูกค้า', procedureGroupId: 101, procedureName: 'ขั้นตอน', groupCount: 1, leadStatus: 'ACTIVE', activeStatus: 'HOT', lastContactDate: '2026-10-01T10:00:00', assignDate: '2026-09-01', ...o });
const page = (items: unknown[], extra: Record<string, unknown> = {}) =>
  env({ items, meta: { page: 0, perPage: 20, total: items.length, totalPages: 1 }, statusSummary: { total: items.length }, usesWorkflowStep: true, wfStepSummary: [], movementTypeId: 7, ...extra });

function setup(answer: (c: FakeCall) => FakeAnswer, o: FakeOptions & { legacyContactActivities?: boolean } = {}, store?: FilterStore) {
  const { deps, calls } = fakeRest(answer, { messages: MESSAGES, ...o });
  const route = composeRoutes(activityRoutes(deps, { legacyContactActivities: o.legacyContactActivities !== false }), scheduleRoutes(deps, store));
  return {
    deps,
    calls,
    ask: async (url: string, init?: RequestInit) => {
      const r = await route(url, init);
      return { status: r.status, text: await r.text(), type: r.headers.get('content-type') };
    },
  };
}
const post = (body: unknown, method = 'POST'): RequestInit => ({ method, body: typeof body === 'string' ? body : JSON.stringify(body) });

describe('GET /board/activity-list (ActivityListServlet → ContactActivityApiService)', () => {
  const answer = (c: FakeCall): FakeAnswer => (c.path.startsWith('/contact-activities') ? page([item({})]) : null);

  const parent = (o: Record<string, unknown> = {}) => item({ groupCount: 2, children: [item({ procedureGroupId: 'g-1', procedureGroupName: 'ขาย', line: 2 }), item({ procedureGroupId: 'g-2', procedureGroupName: 'บริการ', call: 1 })], ...o });
  const QUERY = 'view=BY_OPPORTUNITY&include=CHILDREN%2CSUMMARY';

  it('by default the list is ONE call, GET /contact-activity-summaries with view · include · opportunityConfigId · closed, and not GET /contact-activities', async () => {
    const s = setup((c) => (c.path.startsWith('/contact-activity-summaries') ? page([parent()]) : null), { legacyContactActivities: false });
    const r = await s.ask('/board/activity-list?viewMode=list&movementTypeId=7&page=1&perPage=20');
    expect(r.status).toBe(200);
    expect(s.calls.map((c) => c.path)).toEqual([`/contact-activity-summaries?${QUERY}&opportunityConfigId=7&closed=false`]);
    expect(JSON.parse(r.text).rows).toHaveLength(1);
  });

  it('the children of an item are the rows of the tab by step group (no second call, no contact history)', async () => {
    const s = setup((c) => (c.path.startsWith('/contact-activity-summaries') ? page([parent()]) : null), { legacyContactActivities: false });
    const row = JSON.parse((await s.ask('/board/activity-list?viewMode=list&movementTypeId=7')).text).rows[0];
    expect(row.children.map((k: { group: string }) => k.group)).toEqual(['ขาย', 'บริการ']);
    expect(s.calls).toHaveLength(1);
  });

  it('an answer with no `status` in the body (an HTTP 200 is the success), rows under `data` and `meta` next to `result` is read, and the page keeps both tabs (usesWorkflowStep)', async () => {
    const rows = [{ ...item({}), leadId: undefined, id: 'u-1' }, { ...item({}), leadId: undefined, id: 'u-2' }];
    const s = setup((c) => (c.path.startsWith('/contact-activity-summaries') ? { message: 'success', result: { data: rows }, meta: { page: 1, perPage: 20, total: 2, totalPages: 1 } } : null), { legacyContactActivities: false });
    const body = JSON.parse((await s.ask('/board/activity-list?viewMode=list&movementTypeId=7')).text);
    expect(body.rows.map((r: { id: string }) => r.id)).toEqual(['u-1', 'u-2']);
    expect(body.usesWorkflowStep).toBe(true);
    expect(body.meta.total).toBe(2);
  });

  it('the strip of statuses is `meta.summary` (active as a count with hot / warm / cold, or as { total, hot, warm, cold }), and the list says it has no workflow step (the tag view is off)', async () => {
    const answer = (summary: unknown) => ({ message: 'success', result: { items: [item({})] }, meta: { page: 1, perPage: 20, total: 1, totalPages: 1, summary } });
    const flat = setup((c) => (c.path.startsWith('/contact-activity-summaries') ? answer({ total: 5, new: 1, success: 1, lost: 1, inactive: 1, active: 1, hot: 1, warm: 0, cold: 0 }) : null), { legacyContactActivities: false });
    const a = JSON.parse((await flat.ask('/board/activity-list?viewMode=list&movementTypeId=7')).text);
    expect(a.summary).toMatchObject({ total: 5, new: 1, success: 1, lost: 1, inactive: 1, active: 1, active_high: 1 });
    expect(a.noWfStep).toBe(true);
    const nested = setup((c) => (c.path.startsWith('/contact-activity-summaries') ? answer({ total: 3, active: { total: 2, hot: 1, warm: 1, cold: 0 } }) : null), { legacyContactActivities: false });
    expect(JSON.parse((await nested.ask('/board/activity-list?viewMode=list&movementTypeId=7')).text).summary).toMatchObject({ total: 3, active: 2, active_high: 1, active_medium: 1 });
  });

  it('the strip of the answer as it was seen: closeSuccess / closeLoss are Success / Lost, active is a count with hot / warm / cold next to it', async () => {
    const seen = { total: 11, new: 2, active: 5, hot: 4, warm: 0, cold: 1, inactive: 0, closeSuccess: 3, closeLoss: 1 };
    const s = setup((c) => (c.path.startsWith('/contact-activity-summaries') ? { message: 'success', result: [item({})], meta: { page: 1, perPage: 20, total: 7, totalPages: 1, summary: seen } } : null), { legacyContactActivities: false });
    const body = JSON.parse((await s.ask('/board/activity-list?viewMode=list&movementTypeId=7')).text);
    expect(body.summary).toEqual({ total: 11, new: 2, success: 3, lost: 1, inactive: 0, active: 5, active_high: 4, active_medium: 0, active_low: 1 });
    expect(body.meta).toMatchObject({ total: 7, totalPages: 1 });
  });

  it('an answer whose rows cannot be found says what it had, and the page still has both tabs', async () => {
    const s = setup((c) => (c.path.startsWith('/contact-activity-summaries') ? { message: 'success', result: { foo: 1 } } : null), { legacyContactActivities: false });
    const body = JSON.parse((await s.ask('/board/activity-list?viewMode=list&movementTypeId=7')).text);
    expect(body.error).toContain('foo');
    expect(body.usesWorkflowStep).toBe(true);
  });

  it('the tab by step group asks the same call with view=BY_STEP_GROUP (only when asked: groupBy=group), and every item is a row of its own', async () => {
    const s = setup((c) => (c.path.startsWith('/contact-activity-summaries') ? page([item({ leadId: 1, procedureGroupName: 'ขาย' }), item({ leadId: 1, procedureGroupId: 102, procedureGroupName: 'บริการ' })]) : null), { legacyContactActivities: false });
    const rows = JSON.parse((await s.ask('/board/activity-list?viewMode=list&movementTypeId=7&groupBy=group')).text).rows;
    expect(s.calls.map((c) => c.path)).toEqual(['/contact-activity-summaries?view=BY_STEP_GROUP&include=SUMMARY&opportunityConfigId=7&closed=false']);
    expect(rows.map((r: { step_group: string }) => r.step_group)).toEqual(['ขาย', 'บริการ']);
  });

  it('closed is true only when the switch of closed opportunities is on (showClosed=true); with no product chosen the first sales line is the opportunityConfigId', async () => {
    const s = setup((c) => (c.path.startsWith('/prospects/options') ? { status: 200, result: { salesLines: [{ id: 'sl-1', name: 'สาย 1' }, { id: 'sl-2', name: 'สาย 2' }] } } : c.path.startsWith('/contact-activity-summaries') ? page([]) : null), { legacyContactActivities: false });
    await s.ask('/board/activity-list?viewMode=list&showClosed=true&movementTypeId=sl-2');
    expect(s.calls.filter((c) => c.path.startsWith('/contact-activity-summaries')).map((c) => c.path.split('?')[1])).toEqual([`${QUERY}&opportunityConfigId=sl-2&closed=true`]);
    s.calls.length = 0;
    await s.ask('/board/activity-list?viewMode=list&showClosed=false');
    expect(s.calls.filter((c) => c.path.startsWith('/contact-activity-summaries')).map((c) => c.path.split('?')[1])).toEqual([`${QUERY}&opportunityConfigId=sl-1&closed=false`]);
  });

  it('asks groupBy=lead and groupBy=group (page 1: no pageNo) with the filters in the order of the Java URL, each encoded like URLEncoder', async () => {
    const s = setup(answer);
    const r = await s.ask('/board/activity-list?viewMode=list&movementTypeId=7&saleGroupId=3&employeeName=a%20b*c~d&search=%E0%B8%98%E0%B8%99&sortBy=name_desc&activeStatus=hot&lastContactFrom=2026-09-01&lastContactTo=2026-09-30&assignDateFrom=2026-08-01&assignDateTo=2026-08-31&showClosed=true&page=1&perPage=50');
    expect(r.status).toBe(200);
    expect(r.type).toBe('application/json; charset=UTF-8');
    const tail = 'movementTypeId=7&saleGroupId=3&employeeName=a+b*c%7Ed&contactName=%E0%B8%98%E0%B8%99&activeStatus=hot&lastContactFrom=2026-09-01&lastContactTo=2026-09-30&assignDateFrom=2026-08-01&assignDateTo=2026-08-31&showClosed=true&sortBy=prospectName_desc&pageSize=50';
    expect(s.calls.map((c) => [c.method, c.path])).toEqual([
      ['GET', `/contact-activities?groupBy=lead&${tail}`],
      ['GET', `/contact-activities?groupBy=group&${tail}`],
    ]);
    expect(s.calls[0].headers).toEqual({ Accept: 'application/json' });
  });

  it('page n asks for pageNo n-1 after pageSize; blanks and unknown sorts are left out; page / perPage that are not an int are 1 / 20; perPage is clamped to 1…200', async () => {
    const s = setup(answer);
    await s.ask('/board/activity-list?page=3&perPage=999&movementTypeId=%20&sortBy=bogus&search=');
    expect(s.calls[0].path).toBe('/contact-activities?groupBy=lead&pageSize=200&pageNo=2');
    s.calls.length = 0;
    await s.ask('/board/activity-list?page=abc&perPage=1.5');
    expect(s.calls[0].path).toBe('/contact-activities?groupBy=lead&pageSize=20');
    s.calls.length = 0;
    await s.ask('/board/activity-list?page=-4&perPage=0');
    expect(s.calls[0].path).toBe('/contact-activities?groupBy=lead&pageSize=1');
    s.calls.length = 0;
    await s.ask('/board/activity-list?page=%2B2&perPage=%2010%20');
    expect(s.calls[0].path).toBe('/contact-activities?groupBy=lead&pageSize=10&pageNo=1');
  });

  it('answers the rows, the summary and the paging meta of the list (the shape the page reads)', async () => {
    const s = setup((c) => (c.path.startsWith('/contact-activities') ? page([item({ leadId: 5, call: 2, prospectAvatar: 'http://h/http://h/p.jpg' })], { statusSummary: { total: 9, active: { total: 4, hot: 2 } }, wfStepSummary: [{ id: 1 }] }) : null));
    const body = JSON.parse((await s.ask('/board/activity-list')).text);
    expect(body.summary).toMatchObject({ total: 9, active: 4, active_high: 2 });
    expect(body.rows).toHaveLength(1);
    expect(body.rows[0]).toMatchObject({ id: 5, call: 2, interest: 'HOT', date: '01/10/2026', customer_avatar: 'http://h/p.jpg' });
    expect(body.meta).toEqual({ page: 1, perPage: 20, total: 1, totalPages: 1, hasMore: false });
    expect(body.wfStepSummary).toEqual([{ id: 1 }]);
  });

  it('a lead that has several groups: the contact history of that lead is asked too (once, encoded id as the servlet wrote it)', async () => {
    const s = setup((c) => {
      if (c.path.startsWith('/contact-activities?groupBy=lead')) return page([item({ leadId: 5, groupCount: 2 }), item({ leadId: 5, groupCount: 2, procedureGroupId: 102 })]);
      if (c.path.startsWith('/contact-activities?groupBy=group')) return page([item({ leadId: 5, groupCount: 2, procedureGroupName: 'CS' })]);
      if (c.path === '/leads/5/contact-history') return env({ groups: [{ steps: [{ items: [{ channel: 'Line', procedureGroupName: 'CS', procedureGroupId: 101, changeDate: '2026-09-02T09:00:00' }, { channel: 'Call In', procedureGroupName: 'AN', procedureGroupId: 102, changeDate: '2026-09-03T09:00:00' }] }] }] });
      return null;
    });
    const body = JSON.parse((await s.ask('/board/activity-list?page=1')).text);
    expect(s.calls.map((c) => c.path).filter((p) => p.startsWith('/leads'))).toEqual(['/leads/5/contact-history']);
    expect(body.rows[0].children.map((c: Record<string, unknown>) => c['group'])).toEqual(['CS', 'AN']);
    expect(body.rows[0].history).toBeTruthy();
  });

  it('a service that does not answer 200 is "" (Data_API.sendGET): the empty list with the generic reason, HTTP 200', async () => {
    const empty = { summary: { total: 0, new: 0, success: 0, lost: 0, inactive: 0, active: 0, active_high: 0, active_medium: 0, active_low: 0 }, rows: [], wfStepSummary: [], usesWorkflowStep: false, error: 'ไม่ได้รับข้อมูลจาก API การติดต่อ' };
    for (const a of [{ status: 403, text: JSON.stringify({ status: 403, error: { message: 'ไม่มีสิทธิ์' } }) }, { status: 0, text: '' }, { status: 200, text: '<html/>' }, { status: 500, text: '' }]) {
      const r = await setup(() => a).ask('/board/activity-list');
      expect(r.status).toBe(200);
      expect(JSON.parse(r.text)).toEqual(empty);
    }
  });

  it('an HTTP 200 whose envelope says no gives the message of the service; a body that is not JSON gives the message of the exception', async () => {
    const no = await setup(() => ({ status: 403, message: 'Forbidden', error: { code: 403, message: 'ไม่มีสิทธิ์เข้าถึง' } })).ask('/board/activity-list');
    expect(JSON.parse(no.text).error).toBe('ไม่มีสิทธิ์เข้าถึง');
    const broken = await setup(() => '{"status": 200,').ask('/board/activity-list');
    expect(JSON.parse(broken.text).error).toMatch(/JSONException/);
    expect(JSON.parse(broken.text).rows).toEqual([]);
  });

  it('only GET: a POST is a 405', async () => {
    const s = setup(answer);
    expect((await s.ask('/board/activity-list', post({}))).status).toBe(405);
    expect(s.calls).toHaveLength(0);
  });
});

describe('contactActivitiesPath', () => {
  it('appends only what is there, in the order groupBy, movementTypeId, leadId, the filters, pageSize, pageNo', () => {
    expect(contactActivitiesPath({ groupBy: 'group', pageSize: 5 })).toBe('/contact-activities?groupBy=group&pageSize=5');
    expect(contactActivitiesPath({ pageNo: 0, pageSize: 200, leadId: '9', groupBy: 'lead', sortBy: 'x y', movementTypeId: '1' })).toBe('/contact-activities?groupBy=lead&movementTypeId=1&leadId=9&sortBy=x+y&pageSize=200&pageNo=0');
  });
});

describe('GET /board/activity-detail (ActivityDetailServlet → LeadBoardView.fetchActivityDetailResult)', () => {
  const lead = { prospect: { name: 'สมศรี' }, salePerson: { id: 3, code: 'E3', name: 'วิชัย' }, leadStatus: 'NEW', currentStep: { procedureGroupId: 102 }, contactHistoryList: [] };

  it('asks GET /leads/{id} with the group attached when there is one; wfsId / txNo / all are read like the servlet (Long.parseLong, "1" or "true")', async () => {
    const s = setup(() => env(lead));
    const r = await s.ask('/board/activity-detail?id=%209%20&activityGroupId=102&wfsId=101&txNo=%20T1%20&all=1');
    expect(r.status).toBe(200);
    expect(s.calls.map((c) => c.path)).toEqual(['/leads/9?activityGroupId=102']);
    const body = JSON.parse(r.text);
    expect(body).toMatchObject({ customer_name: 'สมศรี', interest: 'NEW', wfsId: 101, owner: 'E3 วิชัย' });
    // a group that is not a number, 0, or negative is not attached
    for (const q of ['activityGroupId=x', 'activityGroupId=0', 'activityGroupId=-3', 'activityGroupId=']) {
      s.calls.length = 0;
      await s.ask(`/board/activity-detail?id=9&${q}`);
      expect(s.calls.map((c) => c.path)).toEqual(['/leads/9']);
    }
    // "true" counts for all, "TRUE" too, " 1" and "yes" do not (the history of the current group only)
    const hist = async (all: string) => {
      const s2 = setup(() => env({ ...lead, contactHistoryList: [{ channel: 'Line', procedureGroupId: 101, procedureGroupName: 'CS', procedureName: 'a' }, { channel: 'Line', procedureGroupId: 102, procedureGroupName: 'AN', procedureName: 'b' }] }));
      return JSON.parse((await s2.ask(`/board/activity-detail?id=9&all=${all}`)).text).history.length;
    };
    expect([await hist('1'), await hist('true'), await hist('TRUE'), await hist('%201'), await hist('yes')]).toEqual([2, 2, 2, 1, 1]);
  });

  it('retries without the group when the one that was attached gives no lead', async () => {
    const s = setup((c) => (c.path.includes('activityGroupId') ? { status: 400, text: '{"status":400,"error":{"message":"bad group"}}' } : env(lead)));
    const r = await s.ask('/board/activity-detail?id=9&activityGroupId=5');
    expect(r.status).toBe(200);
    expect(s.calls.map((c) => c.path)).toEqual(['/leads/9?activityGroupId=5', '/leads/9']);
  });

  it('a failure: the status and the body of the backend, so that the page prints error.message', async () => {
    const body = '{"status":400,"message":"Validation error","error":{"code":400,"message":"ต้องระบุ activityGroupId"}}';
    const s = setup(() => ({ status: 400, text: body }));
    expect(await s.ask('/board/activity-detail?id=9')).toMatchObject({ status: 400, text: body });
    // HTTP 200 + an envelope that says no → its status; nothing usable → 502 with the default message of the language
    expect((await setup(() => ({ status: 200, text: body })).ask('/board/activity-detail?id=9')).status).toBe(400);
    const none = await setup(() => null).ask('/board/activity-detail?id=9');
    expect(none.status).toBe(502);
    expect(JSON.parse(none.text)).toEqual({ status: 502, message: 'LOAD-FAILED', error: { code: 502, message: 'LOAD-FAILED' } });
    // no id: no call at all
    const noId = setup(() => env(lead));
    expect((await noId.ask('/board/activity-detail')).status).toBe(502);
    expect(noId.calls).toHaveLength(0);
  });

  it('a result that is not an object is a 500 with the default message', async () => {
    const r = await setup(() => env([1, 2])).ask('/board/activity-detail?id=9');
    expect(r.status).toBe(500);
    expect(JSON.parse(r.text).error).toEqual({ code: 500, message: 'LOAD-FAILED' });
  });

  it('a status the browser cannot give a body to (204) goes on without a body; one that is no status at all is a 502', async () => {
    const r204 = await setup(() => ({ status: 204, text: '' })).ask('/board/activity-detail?id=9');
    expect(r204).toMatchObject({ status: 204, text: '' });
    const r0 = await setup(() => ({ status: 100, text: '' })).ask('/board/activity-detail?id=9');
    expect(r0.status).toBe(502);
  });
});

describe('POST /board/contact-activities (ContactActivitiesServlet)', () => {
  it('drops leadId (it is in the path), turns the channel into the o2o label and answers the status and the body of the service', async () => {
    const s = setup(() => ({ status: 201, text: '{"status":201,"result":{"id":7}}' }));
    const r = await s.ask('/board/contact-activities', post({ leadId: 106, channel: 'call_out', content: 'โทร', procedureGroupId: 101 }));
    expect(r).toMatchObject({ status: 201, text: '{"status":201,"result":{"id":7}}' });
    expect(s.calls).toHaveLength(1);
    expect(s.calls[0]).toMatchObject({ method: 'POST', path: '/leads/106/contact-activities', body: { channel: 'Call Out', content: 'โทร', procedureGroupId: 101 } });
    expect(s.calls[0].body).not.toHaveProperty('leadId');
  });

  it('a channel that is blank or unknown stays as it is (trimmed); a leadId that is a text goes into the path as it is', async () => {
    const s = setup(() => ({ status: 200, text: '{}' }));
    await s.ask('/board/contact-activities', post({ leadId: '7', channel: '  weird  ', content: 'x' }));
    await s.ask('/board/contact-activities', post({ leadId: 8, channel: '   ', content: 'x' }));
    await s.ask('/board/contact-activities', post({ leadId: 9, content: 'x' }));
    expect(s.calls.map((c) => c.path)).toEqual(['/leads/7/contact-activities', '/leads/8/contact-activities', '/leads/9/contact-activities']);
    expect(s.calls[0].body).toMatchObject({ channel: 'weird' });
    expect(s.calls[1].body).toMatchObject({ channel: '   ' });
    expect(s.calls[2].body).not.toHaveProperty('channel');
  });

  it('the status of the service is passed on, also an error (the page reads res.ok); an empty body is "{}"; no answer at all is 502', async () => {
    const err = '{"status":400,"message":"x","error":{"code":400,"message":"createById"}}';
    expect(await setup(() => ({ status: 400, text: err })).ask('/board/contact-activities', post({ leadId: 1 }))).toMatchObject({ status: 400, text: err });
    expect(await setup(() => ({ status: 200, text: '  ' })).ask('/board/contact-activities', post({ leadId: 1 }))).toMatchObject({ status: 200, text: '{}' });
    expect(await setup(() => null).ask('/board/contact-activities', post({ leadId: 1 }))).toMatchObject({ status: 502, text: '{}' });
  });

  it('the requests it refuses itself: a body that is not a JSON object, no leadId (or null) → 400 with the text of the servlet, and no call', async () => {
    const s = setup(() => ({ status: 200, text: '{}' }));
    expect(await s.ask('/board/contact-activities', post('nope'))).toMatchObject({ status: 400, text: '{"error":"invalid json body"}' });
    expect(await s.ask('/board/contact-activities', post(''))).toMatchObject({ status: 400, text: '{"error":"invalid json body"}' });
    expect(await s.ask('/board/contact-activities', post('[1]'))).toMatchObject({ status: 400, text: '{"error":"invalid json body"}' });
    expect(await s.ask('/board/contact-activities', post({ channel: 'line' }))).toMatchObject({ status: 400, text: '{"error":"leadId required"}' });
    expect(await s.ask('/board/contact-activities', post({ leadId: null }))).toMatchObject({ status: 400, text: '{"error":"leadId required"}' });
    expect(s.calls).toHaveLength(0);
    expect((await s.ask('/board/contact-activities')).status).toBe(405);
  });
});

describe('POST /board/lead-assign (AssignLeadServlet)', () => {
  it('PATCH /leads/assign with the body exactly as the page wrote it; the answer of the service whatever its status (HTTP 200 for the page)', async () => {
    const raw = '{"leadId": 5,\n "employeeId": 1002}';
    const s = setup(() => ({ status: 400, text: '{"status":400,"message":"no"}' }));
    const r = await s.ask('/board/lead-assign', post(raw));
    expect(r).toMatchObject({ status: 200, text: '{"status":400,"message":"no"}' });
    expect(s.calls[0]).toMatchObject({ method: 'PATCH', path: '/leads/assign', body: '{"leadId": 5, "employeeId": 1002}' });
    expect(s.calls[0].headers).toMatchObject({ 'Content-Type': 'application/json; charset=UTF-8' });
  });

  it('an empty body is a 400 "body required" without a call; an empty answer is "{}"', async () => {
    const s = setup(() => ({ status: 200, text: '' }));
    expect(await s.ask('/board/lead-assign', post('  '))).toMatchObject({ status: 400, text: '{"error":"body required"}' });
    expect(s.calls).toHaveLength(0);
    expect(await s.ask('/board/lead-assign', post({ leadId: 1 }))).toMatchObject({ status: 200, text: '{}' });
    expect((await s.ask('/board/lead-assign')).status).toBe(405);
  });
});

describe('GET /board/activity-groups · activity-steps · forward-assignees', () => {
  it('activity-groups: leadId is required (400), the service is asked for the groups of the lead, the names are the English ones in English', async () => {
    const s = setup(() => env({ items: [] }));
    expect(await s.ask('/board/activity-groups')).toMatchObject({ status: 400, text: '{"error":"leadId required"}' });
    expect(await s.ask('/board/activity-groups?leadId=%20')).toMatchObject({ status: 400 });
    expect(s.calls).toHaveLength(0);
    const th = await s.ask('/board/activity-groups?leadId=%2048%20');
    expect(s.calls.map((c) => c.path)).toEqual(['/leads/48/activity-groups']);
    expect(JSON.parse(th.text)).toEqual(env({ items: [] }));

    const groups = env([{ code: 'CS', name: 'ฝ่ายบริการลูกค้า' }, { code: 'ZZ', name: 'ไม่มีคำแปล' }]);
    const en = await setup(() => groups, { lang: 'en', master: { en: { CS: 'Customer Service' } } }).ask('/board/activity-groups?leadId=1');
    expect(JSON.parse(en.text).result.map((g: Record<string, unknown>) => g['name'])).toEqual(['Customer Service', 'ไม่มีคำแปล']);
    const thai = await setup(() => groups, { master: { en: { CS: 'Customer Service' } } }).ask('/board/activity-groups?leadId=1');
    expect(JSON.parse(thai.text).result[0].name).toBe('ฝ่ายบริการลูกค้า');
  });

  it('activity-groups: a service that does not answer 200 is "{}"', async () => {
    expect((await setup(() => ({ status: 404, text: '{"status":404}' })).ask('/board/activity-groups?leadId=1')).text).toBe('{}');
    expect((await setup(() => null).ask('/board/activity-groups?leadId=1')).text).toBe('{}');
  });

  it('activity-steps: 400 + [] without a leadId; the group is appended as it came; the rows are the normalised master-data items; [] when the service says no', async () => {
    const s = setup(() => env([{ id: 1, code: 'S1', name: 'ขั้นตอน', extra: 'x' }]));
    expect(await s.ask('/board/activity-steps')).toMatchObject({ status: 400, text: '[]' });
    const r = await s.ask('/board/activity-steps?leadId=7&activityGroupId=%2012%20');
    expect(s.calls.map((c) => c.path)).toEqual(['/leads/7/activity-steps?activityGroupId=12']);
    expect(JSON.parse(r.text)).toEqual([{ id: 1, code: 'S1', name: 'ขั้นตอน', nameTh: '', colorCode: '', attachFile: '', postCode: '' }]);
    await s.ask('/board/activity-steps?leadId=7&activityGroupId=');
    expect(s.calls[1].path).toBe('/leads/7/activity-steps');
    expect((await setup(() => ({ status: 500, text: '' })).ask('/board/activity-steps?leadId=7')).text).toBe('[]');
  });

  it('forward-assignees: 400 without an id; the body of the service as it is; a stand-in when it is empty or an error', async () => {
    const s = setup(() => ({ status: 200, text: '{"status":200,"result":[{"id":1,"code":"E1","name":"A","nameTh":"ก"}]}' }));
    expect(await s.ask('/board/forward-assignees')).toMatchObject({ status: 400, text: '{"error":"id required"}' });
    const r = await s.ask('/board/forward-assignees?id=7&activityStepId=%2033%20');
    expect(s.calls.map((c) => c.path)).toEqual(['/leads/7/forward-assignees?activityStepId=33']);
    expect(r.text).toBe('{"status":200,"result":[{"id":1,"code":"E1","name":"A","nameTh":"ก"}]}');
    await s.ask('/board/forward-assignees?id=7');
    expect(s.calls[1].path).toBe('/leads/7/forward-assignees');
    for (const a of [{ status: 403, text: '{"status":403}' }, { status: 200, text: '' }, null]) {
      expect((await setup(() => a).ask('/board/forward-assignees?id=7')).text).toBe('{"status":200,"result":[]}');
    }
  });
});

describe('GET /board/schedule/fetch (ScheduleFetchServlet)', () => {
  const body = '{"status":200,"message":"success","result":{"viewMode":"month","items":[{"id":1}]}}';

  it('month / week / day / year need viewMode, dateFrom and dateTo: the 400 of the servlet says which', async () => {
    const s = setup(() => ({ status: 200, text: body }));
    for (const q of ['', '?dateFrom=2026-10-01&dateTo=2026-10-31', '?viewMode=month', '?viewMode=month&dateFrom=2026-10-01', '?viewMode=week&dateTo=2026-10-31', '?viewMode=listing']) {
      const r = await s.ask('/board/schedule/fetch' + q);
      expect(r.status).toBe(400);
      expect(r.type).toBe('application/json; charset=UTF-8');
      expect(JSON.parse(r.text)).toEqual({ status: 400, message: 'missing params: viewMode, dateFrom, dateTo' });
    }
    expect(s.calls).toHaveLength(0);
  });

  it('list and board need only viewMode (any case): the message of the 400 then names viewMode alone — only a missing viewMode is a 400', async () => {
    const s = setup(() => ({ status: 200, text: body }));
    expect((await s.ask('/board/schedule/fetch?viewMode=LIST')).status).toBe(200);
    expect((await s.ask('/board/schedule/fetch?viewMode=Board&page=1')).status).toBe(200);
    expect(s.calls.map((c) => c.path)).toEqual(['/schedules?viewMode=LIST', '/schedules?viewMode=Board&page=1']);
    // an empty date is still a date (not null): the servlet only checks for null
    expect((await s.ask('/board/schedule/fetch?viewMode=month&dateFrom=&dateTo=')).status).toBe(200);
    expect(s.calls[2].path).toBe('/schedules?viewMode=month');
  });

  it('forwards the parameters in the order of the servlet, as they came (not encoded, blanks left out); only the search text is encoded', async () => {
    const s = setup(() => ({ status: 200, text: body }));
    const r = await s.ask(
      '/board/schedule/fetch?search=%E0%B8%99%E0%B8%B1%E0%B8%94%20x%26y&taskStatus=doing,success&appointmentStatus=scheduled,re-schedule&assignToId=1003&serviceId=1004400001&activityGroupId=101&movementTypeId=1004400740&perPage=20&page=2&sort=date_desc&dateTo=2026-10-31&dateFrom=2026-10-01&type=appointment&viewMode=month&unknown=1',
    );
    expect(r).toMatchObject({ status: 200, text: body });
    expect(s.calls).toHaveLength(1);
    expect(s.calls[0].method).toBe('GET');
    expect(s.calls[0].path).toBe(
      '/schedules?viewMode=month&type=appointment&dateFrom=2026-10-01&dateTo=2026-10-31&sort=date_desc&page=2&perPage=20&movementTypeId=1004400740&activityGroupId=101&serviceId=1004400001&assignToId=1003&appointmentStatus=scheduled,re-schedule&taskStatus=doing,success&search=%E0%B8%99%E0%B8%B1%E0%B8%94+x%26y',
    );
    s.calls.length = 0;
    await s.ask('/board/schedule/fetch?viewMode=list&type=%20&sort=&page=%09&search=%20');
    expect(s.calls[0].path).toBe('/schedules?viewMode=list');
  });

  it('the answer is the body of the service untouched, HTTP 200; anything but a 200 (or an empty body) is the "no content" stand-in of the servlet', async () => {
    const stand = (v: string) => `{"status":204,"message":"no content","result":{"viewMode":"${v}","items":[]}}`;
    for (const a of [{ status: 500, text: '{"status":500}' }, { status: 403, text: '{}' }, { status: 200, text: '' }, { status: 200, text: ' \n ' }, { status: 0, text: '' }]) {
      expect(await setup(() => a).ask('/board/schedule/fetch?viewMode=week&dateFrom=a&dateTo=b')).toMatchObject({ status: 200, text: stand('week') });
    }
    // a body that is not JSON (HTML of a proxy) is still the body: the servlet did not read it
    expect((await setup(() => '<html>x</html>').ask('/board/schedule/fetch?viewMode=list')).text).toBe('<html>x</html>');
    // an error inside the envelope of a 200 is the page's to read
    expect((await setup(() => ({ status: 200, text: '{"status":500,"message":"no"}' })).ask('/board/schedule/fetch?viewMode=list')).text).toBe('{"status":500,"message":"no"}');
  });

  it('only GET; a path that is not the servlet is not its route', async () => {
    const s = setup(() => ({ status: 200, text: body }));
    expect((await s.ask('/board/schedule/fetch?viewMode=list', post({}))).status).toBe(405);
    expect((await s.ask('/board/schedule/nope?viewMode=list')).status).toBe(404);
    expect(s.calls).toHaveLength(0);
  });
});

describe('/board/schedule-filter-state (ScheduleFilterStateServlet) and ScheduleView.getSavedFilterJson', () => {
  const memory = (): FilterStore & { text: string | null } => {
    const m = { text: null as string | null, get: () => m.text, set: (t: string) => void (m.text = t) };
    return m;
  };

  it('GET answers "null" until something was posted, then the text that was posted; the answer is never from the service', async () => {
    const store = memory();
    const s = setup(() => null, {}, store);
    expect(await s.ask('/board/schedule-filter-state')).toMatchObject({ status: 200, text: 'null', type: 'application/json; charset=UTF-8' });
    const posted = await s.ask('/board/schedule-filter-state', post('{"calView":"week","tab":"board"}'));
    expect(posted).toMatchObject({ status: 204, text: '' });
    expect((await s.ask('/board/schedule-filter-state')).text).toBe('{"calView":"week","tab":"board"}');
    expect(store.text).toBe('{"calView":"week","tab":"board"}');
    expect(savedFilterText(store)).toBe('{"calView":"week","tab":"board"}');
    expect(s.calls).toHaveLength(0);
  });

  it('POST keeps only a body that is not empty (trimmed, line ends dropped) and always answers 204; GET of a blank saved text is "null"', async () => {
    const store = memory();
    const s = setup(() => null, {}, store);
    await s.ask('/board/schedule-filter-state', post('{"a":1}'));
    expect((await s.ask('/board/schedule-filter-state', post('   '))).status).toBe(204);
    expect(store.text).toBe('{"a":1}');
    await s.ask('/board/schedule-filter-state', post('  {"b":\n 2}  '));
    expect(store.text).toBe('{"b": 2}');
    store.text = '  ';
    expect((await s.ask('/board/schedule-filter-state')).text).toBe('null');
    expect(savedFilterText(store)).toBe('null');
    expect((await s.ask('/board/schedule-filter-state', { method: 'DELETE' })).status).toBe(405);
  });

  describe('the store of the browser (sessionStorage, per signed-in user)', () => {
    beforeEach(() => sessionStorage.clear());

    it('keeps the state of one user apart from another', () => {
      const a = scheduleFilterStore(fakeRest(() => null, { user: { username: 'ann' } }).deps);
      const b = scheduleFilterStore(fakeRest(() => null, { user: { username: 'bob' } }).deps);
      expect(a.get()).toBeNull();
      a.set('{"tab":"list"}');
      expect(a.get()).toBe('{"tab":"list"}');
      expect(b.get()).toBeNull();
      expect(sessionStorage.getItem('ts.sc_filter_state.ann')).toBe('{"tab":"list"}');
    });

    it('falls back to memory when the storage is blocked', () => {
      const store = scheduleFilterStore(fakeRest(() => null, { user: { username: 'blocked' } }).deps);
      const blocked = (): never => {
        throw new Error('blocked');
      };
      vi.spyOn(Storage.prototype, 'getItem').mockImplementation(blocked);
      vi.spyOn(Storage.prototype, 'setItem').mockImplementation(blocked);
      try {
        expect(store.get()).toBeNull();
        store.set('{"x":1}');
        expect(store.get()).toBe('{"x":1}');
      } finally {
        vi.restoreAllMocks();
      }
    });
  });
});
