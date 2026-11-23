/* eslint-disable @typescript-eslint/no-explicit-any */
import { beforeEach, describe, expect, it } from 'vitest';
import { SEED_LEAD_COUNT } from '@core/mock/crm-seed';
import type { MockHomeConfig } from './home.mock';
import { createMockHome, resetMockHome } from './home.mock';

const HOUSE = '1004400740';
const CAR = '1004400741';
const ADVISER = '1004400742';
const EMPTY = '1004400743';

describe('CRM home mock backend (the BFF URLs of the Java page, in the shape of the servlets)', () => {
  const make = (config: MockHomeConfig = {}, can: (f: string) => boolean = () => true) => createMockHome({ delayMs: 0, can, config: { leadsExtraMs: 0, ...config } });
  let backend = make();
  const call = async (b: ReturnType<typeof make>, method: string, url: string, body?: unknown, signal?: AbortSignal) => {
    const r = await b.fetch(url, { method, body: body === undefined ? undefined : JSON.stringify(body), signal });
    const text = await r.text();
    return { status: r.status, body: text ? (JSON.parse(text) as any) : null };
  };
  const get = (url: string) => call(backend, 'GET', url);
  const post = (url: string, body: unknown) => call(backend, 'POST', url, body);
  const summary = async (q = '') => (await get('../dashboardapi?action=summary&page=1&perPage=100' + q)).body.result;
  const leadsUrl = (page: number, q = '') => `../board/leads?viewMode=list&${q.includes('activityGroupId=') ? '' : 'activityGroupId=0&'}sortBy=txdate_desc&page=${page}&perPage=20${q}`;
  const leads = async (page: number, q = '') => (await get(leadsUrl(page, q))).body;
  /** every row of the list (all pages) */
  const allItems = async (q = ''): Promise<any[]> => {
    const rows: any[] = [];
    for (let p = 1; p < 40; p++) {
      const r = await leads(p, q);
      rows.push(...r.leads.items);
      if (p >= r.leads.meta.totalPages) break;
    }
    return rows;
  };

  beforeEach(() => {
    resetMockHome();
    backend = make();
  });

  it('the product list: four products, one without a workflow step, one without any lead', async () => {
    const r = await get('../board/movement-types');
    expect(r.status).toBe(200);
    expect(r.body.map((p: any) => [p.id, p.usesWorkflowStep])).toEqual([[1004400740, true], [1004400741, true], [1004400742, false], [1004400743, true]]);
    expect(r.body[0]).toMatchObject({ code: 'LD-HL', name: 'สินเชื่อบ้าน' });
  });

  describe('GET dashboardapi?action=summary', () => {
    it('is the envelope of the service: stats, stepSummary and the first perPage items', async () => {
      const r = await get('../dashboardapi?action=summary&page=1&perPage=100');
      expect(r.status).toBe(200);
      expect(r.body).toMatchObject({ status: 200, message: 'success' });
      expect(Object.keys(r.body.result).sort()).toEqual(['items', 'stats', 'stepSummary']);
      expect(r.body.result.items).toHaveLength(100);
      expect(Object.keys(r.body.result.items[0]).sort()).toEqual(['attachFile', 'currentGroup', 'currentStep', 'customerTel', 'handlerName', 'leadStatus', 'prospectName']);
    });

    it('the figures add up and cover every lead of the filter', async () => {
      const s = (await summary()).stats;
      expect(s.total).toBe(SEED_LEAD_COUNT);
      expect(s.statusNew + s.statusSuccess + s.statusInactive + s.statusLost + s.statusActive).toBe(s.total);
      expect(s.activeHot + s.activeWarm + s.activeCold).toBe(s.statusActive);
      const house = (await summary('&movementTypeId=' + HOUSE)).stats;
      const car = (await summary('&movementTypeId=' + CAR)).stats;
      const adviser = (await summary('&movementTypeId=' + ADVISER)).stats;
      expect(house.total + car.total + adviser.total).toBe(s.total);
      expect((await summary('&movementTypeId=' + EMPTY)).stats).toMatchObject({ total: 0, statusNew: 0, statusActive: 0 });
    });

    it('the figure "New" is the number of rows the table ends with (same filter)', async () => {
      for (const [mt, range] of [[HOUSE, ''], [CAR, ''], [ADVISER, ''], [HOUSE, '&startDate=2026-03-01&endDate=2026-06-30']] as const) {
        const n = (await summary(`&movementTypeId=${mt}${range}`)).stats.statusNew;
        const rows = (await allItems(`&movementTypeId=${mt}${range.replace('startDate', 'dateRangeType=custom&dateFrom').replace('endDate', 'dateTo')}`)).filter((i) => i.leadStatus === 'NEW');
        expect(rows.length, `${mt} ${range}`).toBe(n);
      }
    });

    it('filters by date (the day the lead was made)', async () => {
      const all = (await summary('&movementTypeId=' + HOUSE)).stats.total;
      const part = (await summary(`&movementTypeId=${HOUSE}&startDate=2026-03-01&endDate=2026-06-30`)).stats.total;
      expect(part).toBeGreaterThan(0);
      expect(part).toBeLessThan(all);
      expect((await summary('&startDate=2020-01-01&endDate=2020-01-31')).stats.total).toBe(0);
    });

    it('counts the open leads per workflow STEP (the donut); a product without a workflow has none', async () => {
      const house = await summary('&movementTypeId=' + HOUSE);
      expect(house.stepSummary.length).toBeGreaterThan(8);
      const open = house.stats.total - house.stats.statusSuccess - house.stats.statusLost;
      expect(house.stepSummary.reduce((n: number, s: any) => n + s.count, 0)).toBe(open);
      expect(house.stepSummary[0]).toMatchObject({ name: expect.any(String), code: expect.any(String), id: expect.any(Number) });
      expect((await summary('&movementTypeId=' + ADVISER)).stepSummary).toEqual([]);
      expect((await summary('&movementTypeId=' + EMPTY)).stepSummary).toEqual([]);
      // the car product has fewer groups than the house product
      expect((await summary('&movementTypeId=' + CAR)).stepSummary.length).toBeLessThan(house.stepSummary.length);
    });

    it('answers 500 {"message":"internal error"} when asked to fail, 400 for an unknown action', async () => {
      const failing = make({ failSummary: true });
      expect(await call(failing, 'GET', '../dashboardapi?action=summary')).toEqual({ status: 500, body: { message: 'internal error' } });
      expect(await get('../dashboardapi?action=nope')).toEqual({ status: 400, body: { message: 'unknown action' } });
    });
  });

  describe('GET board/leads (viewMode=list)', () => {
    it('is the result object of /leads: statusSummary, wfStepSummary, leads{items, meta}', async () => {
      const r = await leads(1, '&movementTypeId=' + HOUSE);
      expect(Object.keys(r).sort()).toEqual(['activityGroupId', 'id', 'leads', 'statusSummary', 'usesWorkflowStep', 'wfStepSummary']);
      expect(r.usesWorkflowStep).toBe(true);
      expect(r.leads.items).toHaveLength(20);
      expect(r.leads.meta).toMatchObject({ page: 1, perPage: 20 });
      expect(r.leads.meta.totalPages).toBe(Math.ceil(r.leads.meta.total / 20));
      expect(r.wfStepSummary.map((g: any) => g.id)).toEqual([101, 102, 103, 104, 105, 106, 107]);
      const it = r.leads.items[0];
      for (const k of ['id', 'prospectName', 'prospectTel', 'phoneCountryCode', 'countryCode', 'leadStatus', 'activeStatus', 'forwardStatus', 'activityGroupId', 'procedureGroupId', 'saleGroupId', 'salePersonId', 'employeeId', 'employeeName', 'unassigned', 'txNo', 'txDate']) expect(it).toHaveProperty(k);
    });

    it('lists the open leads, newest first, page after page without a lead twice; showClosed=true lists the closed ones', async () => {
      const rows = await allItems('&movementTypeId=' + HOUSE);
      expect(new Set(rows.map((r) => r.id)).size).toBe(rows.length);
      expect(rows.some((r) => r.leadStatus === 'SUCCESS' || r.leadStatus === 'LOST')).toBe(false);
      expect(rows.map((r) => r.txDate)).toEqual([...rows.map((r) => r.txDate)].sort().reverse());
      const closed = await allItems('&showClosed=true&movementTypeId=' + HOUSE);
      expect(closed.length).toBeGreaterThan(0);
      expect(closed.every((r) => r.leadStatus === 'SUCCESS' || r.leadStatus === 'LOST')).toBe(true);
      const s = (await summary('&movementTypeId=' + HOUSE)).stats;
      expect(rows.length + closed.length).toBe(s.total);
    });

    it('the last page is short; a page beyond it is empty', async () => {
      const first = await leads(1, '&movementTypeId=' + HOUSE);
      const last = await leads(first.leads.meta.totalPages, '&movementTypeId=' + HOUSE);
      expect(last.leads.items.length).toBeGreaterThan(0);
      expect(last.leads.items.length).toBeLessThanOrEqual(20);
      expect((await leads(first.leads.meta.totalPages + 1, '&movementTypeId=' + HOUSE)).leads.items).toEqual([]);
    });

    it('filters by product, date range, employee, search and workflow group', async () => {
      const all = (await leads(1)).leads.meta.total;
      const sum = (await Promise.all([HOUSE, CAR, ADVISER, EMPTY].map(async (m) => (await leads(1, '&movementTypeId=' + m)).leads.meta.total))).reduce((a, b) => a + b, 0);
      expect(sum).toBe(all);
      expect((await leads(1, '&movementTypeId=' + EMPTY)).leads.items).toEqual([]);
      const dated = await allItems('&dateRangeType=custom&dateFrom=2026-03-01&dateTo=2026-06-30');
      expect(dated.length).toBeGreaterThan(0);
      expect(dated.every((r) => r.txDate >= '2026-03-01' && r.txDate <= '2026-06-30')).toBe(true);
      const mine = await allItems('&employeeId=1001');
      expect(mine.length).toBeGreaterThan(0);
      expect(mine.every((r) => r.employeeId === 1001)).toBe(true);
      const name = (await leads(1)).leads.items[3].prospectName as string;
      const found = await allItems('&search=' + encodeURIComponent(name.split(' ')[0]));
      expect(found.length).toBeGreaterThan(0);
      expect(found.every((r) => r.prospectName.includes(name.split(' ')[0]))).toBe(true);
      const group = await allItems('&movementTypeId=' + HOUSE + '&activityGroupId=102');
      expect(group.length).toBeGreaterThan(0);
      expect(group.every((r) => r.activityGroupId === 102)).toBe(true);
    });

    it('the NEW rows have the cases the table draws: nobody yet, an employee, the stuck flag, an id without a name', async () => {
      const rows = (await allItems()).filter((r) => r.leadStatus === 'NEW');
      expect(rows.some((r) => r.employeeId === null && r.unassigned)).toBe(true);
      expect(rows.some((r) => r.employeeId !== null && r.employeeName !== '' && !r.unassigned)).toBe(true);
      expect(rows.some((r) => r.employeeId !== null && r.unassigned)).toBe(true); // unassigned flag stuck at true
      expect(rows.some((r) => r.employeeId !== null && r.employeeName === '' && r.employeeCode === '')).toBe(true);
      expect(rows.some((r) => r.unassigned && r.saleGroupId !== null)).toBe(true); // the team is known
      expect(rows.some((r) => r.prospectAvatar.startsWith('data:image/svg+xml'))).toBe(true);
      expect(new Set(rows.map((r) => r.phoneCountryCode))).toEqual(new Set(['+66', '+81', null]));
    });

    it('a session without CRM_Lead_View gets "[]" (LeadsBoardServlet checks the role first)', async () => {
      const r = await call(make({}, (f) => f !== 'CRM_Lead_View'), 'GET', leadsUrl(1));
      expect(r).toEqual({ status: 200, body: [] });
    });

    it('can be made to fail (500), to fail once per page, to hide the NEW leads at the end of the list, and to find nothing for "~500"', async () => {
      expect((await call(make({ failLeads: true }), 'GET', leadsUrl(1))).status).toBe(500);
      const once = make({ failLeadsOnce: true });
      expect((await call(once, 'GET', leadsUrl(1))).status).toBe(500);
      expect((await call(once, 'GET', leadsUrl(1))).status).toBe(200);
      expect((await call(once, 'GET', leadsUrl(2))).status).toBe(500);
      expect((await get(leadsUrl(1, '&search=~500'))).status).toBe(500);
      const sparse = make({ sparseNew: true });
      const rows: any[] = [];
      for (let p = 1; p < 40; p++) {
        const r = (await call(sparse, 'GET', leadsUrl(p))).body;
        rows.push(...r.leads.items);
        if (p >= r.leads.meta.totalPages) break;
      }
      const firstNew = rows.findIndex((r) => r.leadStatus === 'NEW');
      expect(firstNew).toBeGreaterThanOrEqual(100); // five pages of twenty with no NEW lead: the page stops and offers "load more"
    });
  });

  describe('POST board/lead-assign', () => {
    const firstUnassigned = async () => (await allItems('&movementTypeId=' + HOUSE)).find((r) => r.leadStatus === 'NEW' && r.employeeId === null)!;

    it('gives the lead its employee: the next list has it assigned', async () => {
      const lead = await firstUnassigned();
      const r = await post('../board/lead-assign', { leadId: String(lead.id), employeeId: '1002', saleGroupId: '1004400001', salePersonId: '2002' });
      expect(r).toEqual({ status: 200, body: { status: 200, message: 'success' } });
      const after = (await allItems('&movementTypeId=' + HOUSE)).find((x) => x.id === lead.id);
      expect(after).toMatchObject({ employeeId: 1002, employeeName: 'สุดา รักงาน', saleGroupId: 1004400001, salePersonId: 2002, unassigned: false });
    });

    it('with an employee only, the backend flag stays "unassigned" (the quirk the page knows about)', async () => {
      const lead = await firstUnassigned();
      await post('../board/lead-assign', { leadId: String(lead.id), employeeId: '1003' });
      const after = (await allItems('&movementTypeId=' + HOUSE)).find((x) => x.id === lead.id);
      expect(after).toMatchObject({ employeeId: 1003, unassigned: true });
    });

    it('refuses an employee the backend does not accept (400 with the message the page prints), an unknown lead / employee, and a bad request', async () => {
      const lead = await firstUnassigned();
      const refused = await post('../board/lead-assign', { leadId: String(lead.id), employeeId: '1008' });
      expect(refused.status).toBe(400);
      expect(refused.body.error.message).toContain('ต้องส่งต่อ');
      expect((await post('../board/lead-assign', { leadId: '99999', employeeId: '1002' })).status).toBe(404);
      expect((await post('../board/lead-assign', { leadId: String(lead.id), employeeId: '55' })).status).toBe(400);
      expect((await call(backend, 'POST', '../board/lead-assign')).status).toBe(400);
      expect((await get('../board/lead-assign')).status).toBe(405);
      // nothing changed
      expect((await allItems('&movementTypeId=' + HOUSE)).find((x) => x.id === lead.id)?.employeeId).toBeNull();
    });

    it('answers 500 without a message when asked to', async () => {
      const r = await call(make({ assign500: true }), 'POST', '../board/lead-assign', { leadId: '1', employeeId: '1002' });
      expect(r.status).toBe(500);
      expect(r.body.error).toBe('ระบบขัดข้อง');
      expect(r.body.message).toBeUndefined();
    });
  });

  describe('GET dashboardapi?action=schedules', () => {
    const list = async (from: string, to: string, q = '') => (await get(`../dashboardapi?action=schedules&viewMode=list&dateFrom=${from}&dateTo=${to}${q}`)).body.result;

    it('viewMode=list: the appointments and the tasks of the month, by date', async () => {
      const r = await list('2026-10-01', '2026-10-31');
      expect(Object.keys(r.list).sort()).toEqual(['appointment', 'task']);
      const appts: any[] = r.list.appointment.items;
      const tasks: any[] = r.list.task.items;
      expect(appts.length).toBeGreaterThan(0);
      expect(tasks.length).toBeGreaterThan(0);
      for (const a of appts) {
        expect(a.scheduleType).toBe('appointment');
        expect(a.appointmentDate >= '2026-10-01' && a.appointmentDate <= '2026-10-31').toBe(true);
      }
      expect(appts.map((a) => a.appointmentDate)).toEqual([...appts.map((a) => a.appointmentDate)].sort());
      expect(Object.keys(appts[0]).sort()).toEqual(['activityGroupId', 'activityGroupName', 'activityStepName', 'allDay', 'appointmentDate', 'appointmentTime', 'detail', 'id', 'leadId', 'prospectImage', 'prospectName', 'scheduleType', 'status', 'topic']);
      expect(tasks.some((t) => t.allDay && t.appointmentTime === null)).toBe(true);
      expect(tasks.some((t) => !t.allDay && /^\d\d:\d\d:00$/.test(t.appointmentTime))).toBe(true);
    });

    it('is the same every time and has items in any month (a hash of the day number, not of "today")', async () => {
      const a = await list('2026-10-01', '2026-10-31');
      expect(await list('2026-10-01', '2026-10-31')).toEqual(a);
      for (const m of ['2025-01', '2026-02', '2027-07', '2030-12']) {
        const r = await list(`${m}-01`, `${m}-28`);
        expect(r.list.appointment.items.length + r.list.task.items.length, m).toBeGreaterThan(0);
      }
    });

    it('viewMode=year: the days with something (the dots of the calendar); viewMode=day: that day, appointments and tasks mixed', async () => {
      const month = await list('2026-10-01', '2026-10-31');
      const days = new Set([...month.list.appointment.items, ...month.list.task.items].map((i: any) => i.appointmentDate));
      const marks = (await get('../dashboardapi?action=schedules&viewMode=year&dateFrom=2026-10-01&dateTo=2026-10-31')).body.result.marks;
      expect(new Set(marks)).toEqual(days);
      const day = [...days][0];
      const items = (await get('../dashboardapi?action=schedules&viewMode=day&date=' + day)).body.result.items;
      expect(items.length).toBeGreaterThan(0);
      expect(items.every((i: any) => i.appointmentDate === day && ['appointment', 'task'].includes(i.scheduleType))).toBe(true);
      expect((await get('../dashboardapi?action=schedules&viewMode=day&date=2026-10-31')).body.result.items.length).toBe(
        month.list.appointment.items.concat(month.list.task.items).filter((i: any) => i.appointmentDate === '2026-10-31').length,
      );
    });

    it('belongs to the leads of the product; the product without a lead has none', async () => {
      const house = await list('2026-10-01', '2026-10-31', '&movementTypeId=' + HOUSE);
      const rows = await allItems('&showClosed=true&movementTypeId=' + HOUSE);
      const houseLeads = new Set([...rows.map((r) => r.id), ...(await allItems('&movementTypeId=' + HOUSE)).map((r) => r.id)]);
      for (const i of [...house.list.appointment.items, ...house.list.task.items]) expect(houseLeads.has(i.leadId)).toBe(true);
      const none = await list('2026-10-01', '2026-10-31', '&movementTypeId=' + EMPTY);
      expect(none.list.appointment.items).toEqual([]);
      expect(none.list.task.items).toEqual([]);
      expect((await get('../dashboardapi?action=schedules&viewMode=year&dateFrom=2026-10-01&dateTo=2026-10-31&movementTypeId=' + EMPTY)).body.result.marks).toEqual([]);
    });

    it('emptySchedules / failSchedules', async () => {
      const r = (await call(make({ emptySchedules: true }), 'GET', '../dashboardapi?action=schedules&viewMode=list&dateFrom=2026-10-01&dateTo=2026-10-31')).body.result;
      expect(r.list.appointment.items).toEqual([]);
      expect((await call(make({ failSchedules: true }), 'GET', '../dashboardapi?action=schedules&viewMode=list')).status).toBe(500);
    });
  });

  describe('the master data of the assign dialog', () => {
    it('sale groups, sale persons (with their employee) and employees, filtered by the team', async () => {
      const groups = (await get('../board/sale-groups')).body;
      expect(groups.map((g: any) => g.name)).toEqual(['ทีม A', 'ทีม B']);
      expect(Object.keys(groups[0]).sort()).toEqual(['attachFile', 'code', 'colorCode', 'id', 'name', 'nameTh', 'postCode']);
      const persons = (await get('../board/sale-persons')).body;
      expect(persons).toHaveLength(8);
      expect(persons[0]).toMatchObject({ id: 2001, employee: { id: 1001, code: 'E101' } });
      const teamA = (await get('../board/sale-persons?saleGroupId=1004400001')).body;
      expect(teamA.length).toBeGreaterThan(0);
      expect(teamA.length).toBeLessThan(8);
      const employees = (await get('../board/employees')).body;
      expect(employees).toHaveLength(8);
      expect((await get('../board/employees?saleGroupId=1004400002')).body.every((e: any) => ['E103', 'E104', 'E106', 'E108'].includes(e.code))).toBe(true);
      expect((await call(make({ employeesEmpty: true }), 'GET', '../board/employees')).body).toEqual([]);
    });
  });

  describe('the work modal (customer search mode) and the shell master data', () => {
    it('answers the endpoints of the modal: groups of the product, employees of a group, the lead of the search', async () => {
      const groups = (await get('../board/master/activity-groups?movementTypeId=' + HOUSE)).body;
      expect(groups.result.items.map((g: any) => g.id)).toEqual([101, 102, 103, 104, 105, 106, 107]);
      expect((await get('../board/master/activity-groups?movementTypeId=1')).status).toBe(404);
      expect((await get('../board/master/employees-by-activity-group?activityGroupId=102')).body.result.length).toBeGreaterThanOrEqual(4);
      const lead = (await leads(1, '&movementTypeId=' + HOUSE)).leads.items[0];
      const step = await get('../board/lead?id=' + lead.id);
      expect(step.body.currentStep.procedureGroupId).toBe(lead.activityGroupId);
      expect((await get('../board/lead?id=9999')).status).toBe(404);
    });

    it('saves an appointment / a task: the cards of the month have it; refuses what the backend refuses', async () => {
      const lead = (await leads(1, '&movementTypeId=' + CAR)).leads.items[0];
      const base = { leadId: lead.id, subject: 'นัดเซ็นสัญญา', detail: 'เอกสารตัวจริง', date: '2026-10-28', time: '14:30', type: 'APPOINTMENT', status: 'scheduled', allDay: false, procedureGroupId: lead.activityGroupId };
      const ok = await post('../board/schedule/add', base);
      expect(ok.status).toBe(200);
      expect(ok.body).toMatchObject({ status: 201, message: 'success' });
      const month = (await get('../dashboardapi?action=schedules&viewMode=list&dateFrom=2026-10-01&dateTo=2026-10-31&movementTypeId=' + CAR)).body.result;
      expect(month.list.appointment.items.find((a: any) => a.id === ok.body.result.id)).toMatchObject({ topic: 'นัดเซ็นสัญญา', appointmentDate: '2026-10-28', appointmentTime: '14:30:00', leadId: lead.id });
      const task = await post('../board/schedule/add', { ...base, type: 'TASK', allDay: true, time: undefined, subject: 'ส่งใบเสนอราคา' });
      expect(task.body.status).toBe(201);
      for (const [patch, text] of [[{ subject: '' }, 'subject'], [{ subject: 'x ~fail' }, '~fail'], [{ detail: '' }, 'detail'], [{ date: '28/10/2026' }, 'date'], [{ type: 'MEETING' }, 'type'], [{ procedureGroupId: 0 }, 'procedureGroupId'], [{ leadId: 99999 }, 'Lead']] as const) {
        const bad = await post('../board/schedule/add', { ...base, ...patch });
        expect(bad.status, text).toBe(400);
        expect(bad.body.message).toContain(text);
      }
      // an edit of what was added
      const edit = await call(backend, 'PATCH', '../board/schedule/edit', { id: ok.body.result.id, subject: 'แก้แล้ว', detail: 'x', date: '2026-10-29', time: '09:00', allDay: false, status: 'scheduled' });
      expect(edit.status).toBe(200);
      const after = (await get('../dashboardapi?action=schedules&viewMode=day&date=2026-10-29&movementTypeId=' + CAR)).body.result.items;
      expect(after.find((i: any) => i.id === ok.body.result.id)).toMatchObject({ topic: 'แก้แล้ว' });
      expect((await call(backend, 'PATCH', '../board/schedule/edit', { id: 12, subject: 'x' })).status).toBe(404);
    });

    it('the country master of TsPhone', async () => {
      const r = await get('../board/chat-master-data?type=countries');
      expect(r.body.result.some((c: any) => c.code === 'THA' && c.phoneCountryCode === '+66')).toBe(true);
    });

    it('anything else is "not mocked" (404)', async () => {
      expect((await get('../board/nope')).status).toBe(404);
    });
  });

  describe('network behaviour', () => {
    it('a request aborted by the page rejects with an AbortError, before or while it waits (the page cancels the requests of a filter it replaced)', async () => {
      const slow = createMockHome({ delayMs: 200, config: { leadsExtraMs: 0 } });
      const c = new AbortController();
      const p = slow.fetch('../board/movement-types', { signal: c.signal });
      setTimeout(() => c.abort(), 20);
      await expect(p).rejects.toMatchObject({ name: 'AbortError' });
      await expect(slow.fetch('../board/movement-types', { signal: c.signal })).rejects.toMatchObject({ name: 'AbortError' });
    });

    it('/board/leads takes longer than the rest (the heavy query), the delay of the options is the base', async () => {
      const t = async (b: ReturnType<typeof createMockHome>, url: string) => {
        const t0 = Date.now();
        await b.fetch(url);
        return Date.now() - t0;
      };
      const b = createMockHome({ delayMs: 0, config: { leadsExtraMs: 80 } });
      expect(await t(b, '../board/movement-types')).toBeLessThan(60);
      expect(await t(b, '../board/leads?viewMode=list')).toBeGreaterThanOrEqual(70);
    });

    it('reads its switches from sessionStorage "ts.mock.home.config" when no config is given', async () => {
      sessionStorage.setItem('ts.mock.home.config', JSON.stringify({ noProducts: true, leadsExtraMs: 0 }));
      expect((await call(createMockHome({ delayMs: 0 }), 'GET', '../board/movement-types')).body).toEqual([]);
      resetMockHome();
      sessionStorage.clear();
    });
  });
});
