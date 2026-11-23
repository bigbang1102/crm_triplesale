import { describe, expect, it } from 'vitest';
import { fakeRest, type FakeAnswer, type FakeCall } from '@core/live/rest-fake';
import { createLiveActivities } from './activities.live';

/* The composition of the live backend of the page: which servlet answers which address of the Java page. The logic of every servlet is
   specified next to it (core/live/*.spec.ts); here: that the page's addresses reach the right one, and nothing goes to the BFF. */

function setup(answer: (c: FakeCall) => FakeAnswer, roles: string[] = []) {
  const { deps, calls } = fakeRest(answer, { roles, messages: { 'label.ld2.lead_no_permission': 'NO', 'label.ld2.lead_load_failed_default': 'FAILED' } });
  const backend = createLiveActivities(deps);
  return {
    calls,
    ask: async (url: string, init?: RequestInit) => {
      const r = await backend.fetch(url, init);
      return { status: r.status, text: await r.text() };
    },
  };
}
const env = (result: unknown) => ({ status: 200, message: 'OK', result });

describe('the live backend of the Activities page', () => {
  it('answers the addresses of the Java page ("../board/…" as the page writes them) with the servlets of this family; the list is CA-G01 (two views), not GET /contact-activities', async () => {
    const s = setup((c) => {
      if (c.path.startsWith('/contact-activity-summaries')) return env({ items: [], meta: { page: 0, perPage: 20, total: 0, totalPages: 1 }, statusSummary: {}, usesWorkflowStep: false, wfStepSummary: [], movementTypeId: 7 });
      if (c.path === '/leads/9') return env({ prospect: { name: 'สมศรี' }, leadStatus: 'NEW' });
      if (c.path === '/leads/9/contact-activities') return { status: 201, text: '{"status":201}' };
      if (c.path === '/leads/assign') return '{"status":200}';
      return null;
    });
    expect((await s.ask('../board/activity-list?viewMode=list&movementTypeId=7&page=1&perPage=20')).status).toBe(200);
    expect(JSON.parse((await s.ask('../board/activity-detail?id=9')).text).customer_name).toBe('สมศรี');
    expect((await s.ask('../board/contact-activities', { method: 'POST', body: '{"leadId":9,"channel":"line","content":"x"}' })).status).toBe(201);
    expect((await s.ask('../board/lead-assign', { method: 'POST', body: '{"leadId":9,"employeeId":1}' })).text).toBe('{"status":200}');
    expect(s.calls.map((c) => c.method + ' ' + c.path.split('?')[0])).toEqual(['GET /contact-activity-summaries', 'GET /leads/9', 'POST /leads/9/contact-activities', 'PATCH /leads/assign']);
  });

  it('the products are the sales lines (movement-types/LD is gone and not asked)', async () => {
    const s = setup((c) => {
      if (c.path.startsWith('/prospects/options')) return env({ salesLines: [{ id: 'sl-1', code: 'A', name: 'สายงาน 1' }] });
      return null;
    });
    expect(JSON.parse((await s.ask('../board/movement-types')).text)).toEqual([{ id: 'sl-1', code: 'A', name: 'สายงาน 1' }]);
    expect(s.calls.map((c) => c.path)).not.toContain('/master-data/movement-types/LD');
  });

  it('the lists of the old filter (tags, sale groups, provinces, employees) are not asked: /master-data/* is gone, the page gets the empty list', async () => {
    const s = setup(() => null);
    for (const path of ['tags', 'sale-groups', 'provinces', 'employees']) expect(JSON.parse((await s.ask(`../board/${path}`)).text)).toEqual([]);
    expect(s.calls.filter((c) => c.path.startsWith('/master-data/'))).toEqual([]);
  });

  it('the workflow groups of a product (master/activity-groups) are not asked: GET /master-data/activity-groups is gone, the page gets the empty list', async () => {
    const s = setup(() => null);
    expect(JSON.parse((await s.ask('../board/master/activity-groups?movementTypeId=019a7c00-0002-7000-8000-000000000021')).text)).toEqual({ status: 200, result: [] });
    expect(s.calls).toEqual([]);
  });

  it('the work modal: the lead needs CRM_Lead_View (403 + the message), the schedule is added with procedureGroupId and edited by id', async () => {
    const s = setup((c) => (c.path === '/schedules' ? { status: 201, text: '{"status":201,"success":true}' } : c.path === '/schedules/5' ? '{"status":200}' : null), ['CRM_Lead_View']);
    expect(JSON.parse((await setup(() => null).ask('../board/lead?id=1')).text)).toMatchObject({ status: 403, message: 'NO' });
    expect((await s.ask('../board/schedule/add', { method: 'POST', body: '{"leadId":1,"movementTypeId":3,"activityGroupId":101,"subject":"นัด"}' })).status).toBe(200);
    expect(s.calls[0]).toMatchObject({ method: 'POST', path: '/schedules', body: { leadId: 1, procedureGroupId: 101, subject: 'นัด' } });
    expect((await s.ask('../board/schedule/edit', { method: 'PATCH', body: '{"id":5,"leadId":1,"status":"success"}' })).status).toBe(200);
    expect(s.calls[1]).toMatchObject({ method: 'PATCH', path: '/schedules/5', body: { status: 'success' } });
  });

  it('the customer search of the work modal (/board/leads) and the suggestion card of the search box (/board/prospect-list) are answered by the leads and prospects modules, each from its REST call', async () => {
    const s = setup((c) => {
      if (c.path.startsWith('/leads?')) return env({ leads: { items: [{ id: 5, prospectName: 'สมชาย' }], meta: { page: 1, perPage: 20, total: 1, totalPages: 1 } } });
      if (c.path.startsWith('/prospects?')) return { status: 200, result: [{ id: 7, name: 'สมศรี', code: 'P00007', customerTel: '0812345678', currentProvince: 'ชลบุรี', attachFile: '' }], meta: { page: 1, perPage: 8, total: 1, totalPages: 1 } };
      return null;
    }, ['CRM_Lead_View']);
    const leads = await s.ask('../board/leads?viewMode=list&search=a&page=1&perPage=20');
    expect(leads.status).toBe(200);
    expect(JSON.parse(leads.text).leads.items).toEqual([{ id: 5, prospectName: 'สมชาย' }]);
    const sug = JSON.parse((await s.ask('../board/prospect-list?page=1&perPage=8&enrich=1&searchText=a')).text);
    expect(sug.result.items).toEqual([expect.objectContaining({ id: '7', code: 'P00007', name: 'สมศรี', phone: '0812345678', addr: 'ชลบุรี' })]);
    expect(s.calls.map((c) => c.method + ' ' + c.path)).toEqual(['GET /leads?viewMode=list&search=a&sortBy=txdate_desc&page=1&perPage=20', 'GET /prospects?page=1&perPage=8']);
    // without CRM_Lead_View the customer search is the empty list and the service is not asked
    const denied = setup(() => env({}));
    expect((await denied.ask('../board/leads?viewMode=list')).text).toBe('[]');
    expect(denied.calls).toHaveLength(0);
  });

  it('an unknown path (or a servlet of another page) is a 404 — nothing is sent to the network', async () => {
    const s = setup(() => env({}));
    for (const url of ['../board/nothing', '/board/schedule/fetch?viewMode=list']) {
      const r = await s.ask(url);
      expect(r.status, url).toBe(404);
      expect(JSON.parse(r.text).message).toContain('no live route');
    }
    expect(s.calls).toHaveLength(0);
  });
});
