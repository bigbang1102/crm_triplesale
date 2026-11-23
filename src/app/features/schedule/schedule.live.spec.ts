import { beforeEach, describe, expect, it } from 'vitest';
import { fakeRest, type FakeAnswer, type FakeCall } from '@core/live/rest-fake';
import { createLiveSchedule } from './schedule.live';

/* The composition of the live backend of the page: which servlet answers which address of the Java page (the logic of every servlet is specified
   next to it, core/live/*.spec.ts), and the first-paint value of the page (`ScheduleView.savedFilterJson`). */

const KEY = 'ts.sc_filter_state.demo';
function setup(answer: (c: FakeCall) => FakeAnswer, roles: string[] = []) {
  const { deps, calls } = fakeRest(answer, { roles, user: { username: 'demo' } });
  const backend = createLiveSchedule(deps);
  return {
    backend,
    calls,
    ask: async (url: string, init?: RequestInit) => {
      const r = await backend.fetch(url, init);
      return { status: r.status, text: await r.text() };
    },
  };
}
const env = (result: unknown) => ({ status: 200, message: 'OK', result });

describe('the live backend of the Schedule page', () => {
  beforeEach(() => sessionStorage.clear());

  it('answers the addresses of the Java page: the schedules, the products and the groups of the dropdowns, the filter dialog lists, the work modal', async () => {
    const s = setup((c) => {
      if (c.path.startsWith('/schedules?')) return env({ viewMode: 'month', items: [{ id: 1 }] });
      if (c.path === '/master-data/movement-types/LD') return env({ items: [{ id: 1 }] });
      if (c.path === '/master-data/activity-groups?movementTypeId=1') return env({ items: [{ id: 101 }] });
      if (c.path === '/master-data/sale-groups') return env([{ id: 3, code: 'TA', name: 'ทีม A' }]);
      if (c.path === '/master-data/employees') return env([{ id: 4, code: 'E4', name: 'สมชาย' }]);
      if (c.path === '/master-data/employees/by-activity-group?activityGroupId=101') return env([{ id: 4 }]);
      return null;
    });
    expect(JSON.parse((await s.ask('/board/schedule/fetch?viewMode=month&dateFrom=2026-10-01&dateTo=2026-10-31')).text).result.items).toEqual([{ id: 1 }]);
    expect(JSON.parse((await s.ask('/board/master/movement-types?type=LD')).text).result.items).toEqual([{ id: 1 }]);
    expect(JSON.parse((await s.ask('/board/master/activity-groups?movementTypeId=1')).text).result.items).toEqual([{ id: 101 }]);
    expect(JSON.parse((await s.ask('/board/sale-groups')).text)[0]).toMatchObject({ id: 3, name: 'ทีม A' });
    expect(JSON.parse((await s.ask('/board/employees')).text)[0]).toMatchObject({ id: 4, name: 'สมชาย' });
    expect(JSON.parse((await s.ask('../board/master/employees-by-activity-group?activityGroupId=101')).text).result).toEqual([{ id: 4 }]);
    expect(s.calls.map((c) => c.path)).toEqual([
      '/schedules?viewMode=month&dateFrom=2026-10-01&dateTo=2026-10-31',
      '/master-data/movement-types/LD',
      '/master-data/activity-groups?movementTypeId=1',
      '/master-data/sale-groups',
      '/master-data/employees',
      '/master-data/employees/by-activity-group?activityGroupId=101',
    ]);
  });

  it('the work modal writes: the schedule is added (activityGroupId → procedureGroupId) and edited by id', async () => {
    const s = setup((c) => (c.path === '/schedules' ? { status: 201, text: '{"status":201,"success":true}' } : '{"status":200}'));
    await s.ask('../board/schedule/add', { method: 'POST', body: '{"leadId":1,"activityGroupId":101,"subject":"งาน"}' });
    await s.ask('/board/schedule/edit', { method: 'PATCH', body: '{"id":9,"leadId":1,"status":"success"}' });
    expect(s.calls.map((c) => [c.method, c.path, c.body])).toEqual([
      ['POST', '/schedules', { leadId: 1, procedureGroupId: 101, subject: 'งาน' }],
      ['PATCH', '/schedules/9', { status: 'success' }],
    ]);
  });

  describe('initial() — ScheduleView.getSavedFilterJson', () => {
    it('is null until the page has posted its state', async () => {
      expect(await setup(() => null).backend.initial()).toEqual({ savedFilterJson: null });
    });

    it('is the state the page posted last (sendBeacon of the page = POST /board/schedule-filter-state), kept in the sessionStorage of the tab for this user', async () => {
      const s = setup(() => null);
      const state = { movementTypeId: 1004400740, activityGroupId: 101, calView: 'week', tab: 'board', filter: { saleGroup: '3', appt: ['scheduled'] }, listSort: 'status', search: 'นัด' };
      expect((await s.ask('/board/schedule-filter-state', { method: 'POST', body: JSON.stringify(state) })).status).toBe(204);
      expect(sessionStorage.getItem(KEY)).toBe(JSON.stringify(state));
      expect(await s.backend.initial()).toEqual({ savedFilterJson: state });
      // the page is opened again (a language switch, F5): a new backend reads the same state
      expect(await setup(() => null).backend.initial()).toEqual({ savedFilterJson: state });
      expect(s.calls).toHaveLength(0);
    });

    it('a state that is not JSON would have been a syntax error in the page script: here there is none', async () => {
      sessionStorage.setItem(KEY, '{broken');
      expect(await setup(() => null).backend.initial()).toEqual({ savedFilterJson: null });
      sessionStorage.setItem(KEY, '   ');
      expect(await setup(() => null).backend.initial()).toEqual({ savedFilterJson: null });
    });
  });

  it('the customer search of the work modal (/board/leads) and the suggestion card (/board/prospect-list) are answered by the leads and prospects modules, each from its REST call', async () => {
    const s = setup((c) => {
      if (c.path.startsWith('/leads?')) return env({ leads: { items: [{ id: 5, prospectName: 'สมชาย' }], meta: { page: 1, perPage: 20, total: 1, totalPages: 1 } } });
      if (c.path.startsWith('/prospects?')) return { status: 200, result: [{ id: 7, name: 'สมศรี', code: 'P00007', customerTel: '0812345678', currentProvince: 'ชลบุรี' }], meta: { page: 1, perPage: 8, total: 1, totalPages: 1 } };
      return null;
    }, ['CRM_Lead_View']);
    const leads = await s.ask('../board/leads?viewMode=list&search=a&page=1&perPage=20');
    expect(JSON.parse(leads.text).leads.items).toEqual([{ id: 5, prospectName: 'สมชาย' }]);
    // (no enrich=1: the list as it is, no quick-view)
    // (a search of one letter is not sent: the service takes `q` of two letters or more — see listQueryOf)
    const sug = JSON.parse((await s.ask('../board/prospect-list?page=1&perPage=8&searchText=a')).text);
    expect(sug.result.items).toEqual([expect.objectContaining({ id: '7', code: 'P00007', name: 'สมศรี', phone: '0812345678', addr: 'ชลบุรี' })]);
    expect(s.calls.map((c) => c.method + ' ' + c.path)).toEqual(['GET /leads?viewMode=list&search=a&sortBy=txdate_desc&page=1&perPage=20', 'GET /prospects?page=1&perPage=8']);
  });

  it('an unknown path (or a servlet of another page) is a 404 — nothing is sent to the network', async () => {
    const s = setup(() => env({}));
    for (const url of ['../board/nothing', '/board/activity-list']) expect((await s.ask(url)).status, url).toBe(404);
    expect(s.calls).toHaveLength(0);
  });
});
