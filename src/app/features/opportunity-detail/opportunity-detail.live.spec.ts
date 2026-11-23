import { describe, expect, it } from 'vitest';
import { fakeRest, SERVICE_API, type FakeAnswer, type FakeCall } from '@core/live/rest-fake';
import { createLiveOpportunityDetail } from './opportunity-detail.live';
import { MOCK_UPLOAD_ACCEPT } from './opportunity-detail.mock';

/** the live backend of the page against a scripted REST service: the user has every role of the page */
function setup(answer: (c: FakeCall) => FakeAnswer) {
  const { deps, calls } = fakeRest(answer, { roles: ['CRM_Lead_View'] });
  const files: string[] = [];
  const backend = createLiveOpportunityDetail(deps, {
    fetch: async (url, init) => {
      files.push(`${init?.method ?? 'GET'} ${url}`);
      return new Response('bytes', { status: 200 });
    },
  });
  return { backend, calls, files };
}
const post = (body: unknown): RequestInit => ({ method: 'POST', body: JSON.stringify(body), headers: { 'Content-Type': 'application/json' } });
const ok = { status: 200, message: 'OK' };

describe('the live backend of the Lead detail page (createLiveOpportunityDetail)', () => {
  it('serves the one value the server rendered into the markup: the accept list of the file input (FileServerAccess.uploadAcceptAttr — the extensions sorted, joined with ",")', async () => {
    const { backend } = setup(() => ok);
    expect(await backend.initial()).toEqual({ uploadAcceptExt: MOCK_UPLOAD_ACCEPT });
    expect((await backend.initial()).uploadAcceptExt.split(',')).toContain('.pdf');
  });

  it('entering the page asks filter-options for the sets the session does not hold (all of them the first time); the years then come from the session', async () => {
    const { backend, calls } = setup((c) => (c.path.includes('filter-options') ? { status: 200, result: { fiscalYears: [{ id: 'y26', yearValue: '2026' }], tags: [{ id: 't1', name: 'VIP' }] } } : ok) as FakeAnswer);
    await backend.initial();
    const years = await (await backend.fetch('../board/fiscal-years')).json();
    expect(years).toMatchObject([{ id: 'y26', code: 'y26', name: '2026' }]);
    const sets = (c: { path: string }): string[] => decodeURIComponent(c.path.split('sets=')[1] ?? '').split(',');
    expect(sets(calls[0])).toEqual(['pipelines', 'tags', 'saleGroups', 'salePersons', 'responsibleFilter', 'fiscalYears']);
    // the next entry: only the sets that did not come (the two that came are in the session)
    await backend.initial();
    expect(calls).toHaveLength(2);
    expect(sets(calls[1])).toEqual(['pipelines', 'saleGroups', 'salePersons', 'responsibleFilter']);
  });

  it('the contact history is OP04: one page of GET /opportunities/{id}/contact-activities per call (page and perPage come from the page)', async () => {
    const { backend, calls } = setup((c) => (c.path.includes('contact-activities') ? { status: 200, result: [{ id: 'a1', channel: 'Line', content: 'x', activity: { id: 's1', name: 'นัดพบ' }, activityGroup: { id: 'g1', name: 'ขาย' } }] } : ok) as FakeAnswer);
    const body = await (await backend.fetch('../board/lead/contact-activities?leadId=7&page=2&perPage=20')).json();
    expect(calls.map((c) => c.path)).toEqual(['/opportunities/7/contact-activities?page=2&perPage=20']);
    expect(body).toMatchObject({ meta: { page: 2, perPage: 20, count: 1 }, items: [{ channel: 'Line', type: 'line', content: 'x', procedureGroupName: 'ขาย', procedureName: 'นัดพบ' }] });
  });

  it('the master data the service no longer has (tags, countries, business-types, occupations, marketing-channels, communication-types) is not asked: [] at once', async () => {
    const { backend, calls } = setup(() => ok);
    for (const u of ['../board/tags', ...['countries', 'business-types', 'occupations', 'marketing-channels', 'communication-types'].map((t) => `../board/chat-master-data?type=${t}`)]) {
      expect(await (await backend.fetch(u)).text()).toBe('[]');
    }
    expect(await (await backend.fetch('../board/provinces')).text()).toBe('[]');
    expect(await (await backend.fetch('../board/activity-groups?leadId=7')).text()).toBe('{}');
    for (const u of ['districts?provinceId=1', 'sub-districts?districtId=1', 'sale-groups', 'sale-persons', 'employees', 'material-groups', 'materials?groupId=1', 'activity-steps?leadId=7&activityGroupId=1']) {
      expect(await (await backend.fetch(`../board/${u}`)).text(), u).toBe('[]');
    }
    expect(await (await backend.fetch('../board/lead/contact-history?leadId=7')).text()).toBe('{}'); // the table view (the grip icon) is not asked of the service (CA-G01 is the Activities page)
    expect(await (await backend.fetch('../board/prospect/rv-attachments?prospectId=5')).text()).toBe('{}');
    for (const u of ['lead/forward-groups?leadId=7', 'lead/return-groups?leadId=7', 'lead/forward-employees?leadId=7', 'lead/accessors?leadId=7', 'master/activity-groups?movementTypeId=1']) {
      expect(await (await backend.fetch(`../board/${u}`)).text(), u).toBe('{"status":204,"message":"no content"}');
    }
    // the only calls: the sales teams and the sales people of the modal "change the sales employee" are asked of filter-options (sale-team.live.ts); nothing else is asked
    expect(calls.map((c) => c.path)).toEqual(['/opportunities/filter-options?sets=saleGroups', '/opportunities/filter-options?sets=salePersons', '/opportunities/filter-options?sets=responsibleFilter']);
  });

  it('composes the servlets of the page: every address the page asks is answered by REST calls, in the order the Java page asked', async () => {
    const lead = { id: 7, prospect: { currentCityName: 'x' } };
    const { backend, calls } = setup((c) => {
      if (c.path === '/opportunities/7') return { status: 200, message: 'OK', result: lead };
      return ok;
    });
    const asks: [string, RequestInit | undefined][] = [
      ['../board/lead?id=7', undefined], // lead-core: LeadDetailServlet
      ['../board/lead/accessor-add?leadId=7', post({ employeeIds: [1002] })],
      ['../board/lead/forward', post({ leadId: 7, targets: [{ activityGroupId: 102, activityStepId: 1021, assigneeEmployeeId: 1002 }], currentActivityGroupId: 101, remark: 'r' })],
      ['../board/lead/return', post({ leadId: 7, currentActivityGroupId: 102, returnToActivityGroupId: 101, remark: 'r' })],
      ['../board/lead/close-step', post({ leadId: 7, wfsId: 70, remark: 'r' })],
      ['../board/lead/close', post({ leadId: 7, outcome: 'lost' })],
      ['../board/contact-activities', post({ leadId: 7, channel: 'call_out', content: 'c' })], // leads: ContactActivitiesServlet
      ['../board/lead-update', { method: 'POST', body: 'action=target-year&leadId=7&yearCode=2027', headers: { 'Content-Type': 'application/x-www-form-urlencoded' } }], // OP10: a year goes with the month of the opportunity (not known here): 422, no call
      ['../board/lead-materials', post({ leadId: 7, materialId: 6001 })],
      ['../board/prospect?id=5', undefined], // prospect
      ['../board/schedule/edit', { method: 'PATCH', body: JSON.stringify({ id: 9, leadId: 7, status: 'success' }) }], // lead-core: EditScheduleServlet
    ];
    for (const [url, init] of asks) {
      const r = await backend.fetch(url, init);
      expect(r.status, url).not.toBe(404);
    }
    expect(calls.map((c) => `${c.method} ${c.path}`)).toEqual([
      'GET /opportunities/7',
      'GET /opportunities/7/appointments', // OP06: the tables of appointments and tasks of the page
      'GET /opportunities/7/tasks',
      'POST /leads/7/accessors',
      'POST /leads/7/forward',
      'POST /leads/7/return',
      'POST /leads/7/close-step',
      'POST /leads/7/close',
      'POST /leads/7/contact-activities',
      'POST /leads/materials',
      'GET /prospects/5',
      'PATCH /schedules/9',
    ]);
  });

  it('a prospect of the new service (uuid): ONE call, WITHOUT the section ATTACHMENTS (the documents of this page are the opportunity\'s: OP05)', async () => {
    const id = '01a1d32d-952b-7154-ac0d-500b2492ee28';
    const { backend, calls } = setup((c) => (c.path.startsWith(`/prospects/${id}`) ? { status: 200, message: 'success', result: { base: { id, name: 'ก' } } } : ok));
    const rec = await (await backend.fetch(`../board/prospect?id=${id}`)).json();
    expect(rec).toMatchObject({ id, name: 'ก' });
    expect(calls.map((c) => `${c.method} ${c.path}`)).toEqual([`GET /prospects/${id}?sections=BASE%2CSOCIAL%2COPPORTUNITIES`]);
  });

  it('the lead of the card is the `result` of the envelope, with the places named for the language (LeadDetailServlet); the lead actions do not look at the role', async () => {
    const { deps } = fakeRest(() => ({ status: 200, message: 'OK', result: { id: 7 } }), { roles: [] });
    const backend = createLiveOpportunityDetail(deps);
    // no CRM_Lead_View: the servlet answered 403 and did not ask the service
    const denied = await backend.fetch('../board/lead?id=7');
    expect(denied.status).toBe(403);
    // the actions (close, forward …) have no role gate of their own — the service decides
    expect((await backend.fetch('../board/lead/close', post({ leadId: 7, outcome: 'sold' }))).status).toBe(200);
  });

  it('the detail filter of the history is kept in the sessionStorage of the tab, per user (HttpSession["ld_detail_filter_state"] of Java)', async () => {
    sessionStorage.clear();
    const { backend, calls } = setup(() => ok);
    expect(await (await backend.fetch('../board/detail-filter-state')).text()).toBe('null');
    expect((await backend.fetch('../board/detail-filter-state', post({ group: '101' }))).status).toBe(204);
    expect(await (await backend.fetch('../board/detail-filter-state')).text()).toBe('{"group":"101"}');
    expect(calls).toHaveLength(0); // no REST call: the service has no such resource
    expect(sessionStorage.getItem('ts.lead-detail.filter-state:u')).toBe('{"group":"101"}');
  });

  it('the documents are fetched from the file server by the browser (the live /docproxy), not through the service', async () => {
    const { backend, calls, files } = setup(() => ok);
    const r = await backend.fetch('../docproxy?url=' + encodeURIComponent('https://files.test/docs/5/id-card-5.pdf'));
    expect(r.status).toBe(200);
    expect(files).toEqual(['GET https://files.test/docs/5/id-card-5.pdf']);
    expect(calls).toHaveLength(0);
  });

  it('an address of no servlet of the page is a JSON 404, not a call to the service', async () => {
    const { backend, calls } = setup(() => ok);
    const r = await backend.fetch('../board/something-else');
    expect(r.status).toBe(404);
    expect(calls).toHaveLength(0);
    void SERVICE_API;
  });
});
