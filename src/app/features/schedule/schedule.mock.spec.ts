/* eslint-disable @typescript-eslint/no-explicit-any */
import { beforeEach, describe, expect, it } from 'vitest';
import { SEED_LEAD_COUNT, SEED_TODAY } from '@core/mock/crm-seed';
import { baseRowsOfLead, currentGroup, extraRows, leadModel, seedScheduleRows } from '@core/mock/schedule-seed';
import type { OpportunityByIdResult } from '../activities/activities-backend';
import { createMockRest } from '../activities/activities.mock';
import type { ScheduleBackend } from './schedule-backend';
import { MockScheduleConfig, createMockSchedule, resetMockSchedule } from './schedule.mock';

const HOUSE = 1004400740;
const CAR = 1004400741;
const ADVISER = 1004400742;
const NEW_PRODUCT = 1004400743;

/** the answer of one request as the page script reads it */
const get = async <T = any>(b: ScheduleBackend, path: string): Promise<{ status: number; body: T }> => {
  const r = await b.fetch(path);
  return { status: r.status, body: (await r.json()) as T };
};
const send = async (b: ScheduleBackend, method: string, path: string, body: unknown) => {
  const r = await b.fetch(path, { method, headers: { 'Content-Type': 'application/json' }, body: typeof body === 'string' ? body : JSON.stringify(body) });
  return { status: r.status, body: r.status === 204 ? null : await r.json() };
};
const make = (config?: MockScheduleConfig) => createMockSchedule({ delayMs: 0, config });
const FETCH = '/board/schedule/fetch';
const month = (extra = '') => `${FETCH}?viewMode=month&dateFrom=2026-10-01&dateTo=2026-10-31${extra}`;
const board = (extra = '') => `${FETCH}?viewMode=board&sort=date_desc&page=1&perPage=20${extra}`;
const list = (extra = '') => `${FETCH}?viewMode=list&sort=date_desc&page=1&perPage=20${extra}`;
const HOUSE_CS = `&movementTypeId=${HOUSE}&activityGroupId=101`;

describe('Schedule mock backend (the fake of ScheduleFetchServlet + the /board/* servlets of schedule.xhtml)', () => {
  let b: ScheduleBackend;
  beforeEach(() => {
    resetMockSchedule();
    b = make();
  });

  describe('master data', () => {
    it('products: the raw envelope of the master-data service, { status, result: { items: [{ id, code, name, usesWorkflowStep }] } }', async () => {
      const r = await get(b, '/board/master/movement-types?type=LD');
      expect(r.status).toBe(200);
      expect(r.body.status).toBe(200);
      expect(r.body.result.items.map((p: any) => p.id)).toEqual([HOUSE, CAR, ADVISER, NEW_PRODUCT]);
      expect(r.body.result.items.map((p: any) => p.usesWorkflowStep)).toEqual([true, true, false, true]);
    });

    it('products: the switches say none (the page hides its dropdowns) or an error (the page shows its error screen)', async () => {
      expect((await get(make({ noProducts: true }), '/board/master/movement-types?type=LD')).body.result.items).toEqual([]);
      const failed = await get(make({ failProducts: true }), '/board/master/movement-types?type=LD');
      expect(failed.status).toBe(500);
      expect(failed.body.status).toBe(500);
    });

    it('workflow groups of a product (MasterActivityGroupsServlet): the first group is the default of the page; unknown product 404; no product 400', async () => {
      const r = await get(b, `/board/master/activity-groups?movementTypeId=${HOUSE}`);
      expect(r.body.result.items.map((g: any) => g.id)).toEqual([101, 102, 103, 104, 105, 106, 107]);
      expect((await get(b, `/board/master/activity-groups?movementTypeId=${CAR}`)).body.result.items).toHaveLength(5);
      expect((await get(b, `/board/master/activity-groups?movementTypeId=${ADVISER}`)).body.result.items).toEqual([]);
      expect((await get(b, '/board/master/activity-groups?movementTypeId=5')).status).toBe(404);
      expect((await get(b, '/board/master/activity-groups')).status).toBe(400);
      expect((await get(make({ noGroups: true }), `/board/master/activity-groups?movementTypeId=${HOUSE}`)).body.result.items).toEqual([]);
      expect((await get(make({ failGroups: true }), `/board/master/activity-groups?movementTypeId=${HOUSE}`)).status).toBe(500);
    });

    it('the options of the filter dialog: the sale groups and the employees', async () => {
      expect((await get(b, '/board/sale-groups')).body.map((g: any) => g.name)).toEqual(['ทีม A', 'ทีม B']);
      const emps = (await get(b, '/board/employees')).body;
      expect(emps).toHaveLength(8);
      expect(emps[0]).toMatchObject({ id: 1001, code: 'E101' });
    });

    it('the suggestion card of the search box (prospect-list): the customers that match', async () => {
      const r = (await get(b, '/board/prospect-list?searchText=P00001&perPage=8&enrich=1')).body;
      expect(r.result.items[0].code).toBe('P00001');
    });
  });

  describe('the calendar (viewMode=month | week | day | year)', () => {
    it('month: the items of the range, in date and time order, in the shape of the REST service', async () => {
      const r = (await get(b, month(HOUSE_CS))).body.result;
      expect(r.viewMode).toBe('month');
      expect(r.items.length).toBeGreaterThan(40);
      const keys = r.items.map((i: any) => `${i.appointmentDate} ${i.appointmentTime ?? '00:00:00'}`);
      expect(keys).toEqual([...keys].sort());
      expect(r.items.every((i: any) => i.appointmentDate >= '2026-10-01' && i.appointmentDate <= '2026-10-31')).toBe(true);
      expect(Object.keys(r.items[0]).sort()).toEqual(
        ['activityGroupId', 'activityGroupName', 'activityStepName', 'allDay', 'appointmentDate', 'appointmentTime', 'createTime', 'detail', 'id', 'leadId', 'leadTxNo', 'movementTypeId', 'movementTypeName',
          'productName', 'prospectImage', 'prospectName', 'remark', 'scheduleType', 'serviceName', 'status', 'taskAssigneeCode', 'taskAssigneeId', 'taskAssigneeName', 'topic', 'txNo', 'usesWorkflowStep'].sort(),
      );
    });

    it('week and day are the same service with another range; the days around today are dense', async () => {
      const week = (await get(b, `${FETCH}?viewMode=week&dateFrom=2026-10-18&dateTo=2026-10-24${HOUSE_CS}`)).body.result.items;
      const day = (await get(b, `${FETCH}?viewMode=day&dateFrom=${SEED_TODAY}&dateTo=${SEED_TODAY}${HOUSE_CS}`)).body.result.items;
      expect(day.length).toBeGreaterThan(5);
      expect(week.filter((i: any) => i.appointmentDate === SEED_TODAY)).toEqual(day);
    });

    it('today has three appointments at 10:00, an all-day appointment and an all-day task, a task at 00:30 and an appointment at 23:30', async () => {
      const day = (await get(b, `${FETCH}?viewMode=day&dateFrom=${SEED_TODAY}&dateTo=${SEED_TODAY}${HOUSE_CS}`)).body.result.items;
      expect(day.filter((i: any) => i.appointmentTime === '10:00:00' && i.scheduleType === 'appointment')).toHaveLength(3);
      expect(day.filter((i: any) => i.allDay).map((i: any) => i.topic)).toEqual(expect.arrayContaining(['นัดตลอดวัน', 'งานตลอดวัน']));
      expect(day.filter((i: any) => i.allDay).every((i: any) => i.appointmentTime === null)).toBe(true);
      expect(day.some((i: any) => i.appointmentTime === '00:30:00')).toBe(true);
      expect(day.some((i: any) => i.appointmentTime === '23:30:00')).toBe(true);
    });

    it('year: the marks are the days that have an item, once each', async () => {
      const marks = (await get(b, `${FETCH}?viewMode=year&dateFrom=2026-01-01&dateTo=2026-12-31${HOUSE_CS}`)).body.result.marks;
      expect(marks).toEqual([...new Set(marks)].sort());
      expect(marks).toContain(SEED_TODAY);
      expect(marks).toContain('2026-12-31');
      expect(marks).not.toContain('2027-01-01');
      const items = (await get(b, `${FETCH}?viewMode=month&dateFrom=2026-10-01&dateTo=2026-10-31${HOUSE_CS}`)).body.result.items;
      for (const d of new Set(items.map((i: any) => i.appointmentDate))) expect(marks).toContain(d);
    });

    it('the filters: product, workflow group (0 = every group), sale group, who is responsible, statuses, search', async () => {
      const total = async (extra: string) => (await get(b, month(extra))).body.result.items.length as number;
      const all = await total('');
      const house = await total(`&movementTypeId=${HOUSE}`);
      const cs = await total(HOUSE_CS);
      expect(all).toBeGreaterThan(house);
      expect(house).toBeGreaterThan(cs);
      expect(await total(`&movementTypeId=${HOUSE}&activityGroupId=0`)).toBe(house);
      expect(await total(`&movementTypeId=${NEW_PRODUCT}`)).toBe(0);
      const adviser = (await get(b, month(`&movementTypeId=${ADVISER}`))).body.result.items;
      expect(adviser.length).toBeGreaterThan(0);
      expect(adviser.every((i: any) => i.usesWorkflowStep === false && i.activityGroupId === null && i.activityGroupName === '')).toBe(true);
      const teamA = await total(`${HOUSE_CS}&serviceId=1004400001`);
      const teamB = await total(`${HOUSE_CS}&serviceId=1004400002`);
      expect(teamA + teamB).toBe(cs);
      const mine = (await get(b, month(`${HOUSE_CS}&assignToId=1002`))).body.result.items;
      expect(mine.length).toBeGreaterThan(0);
      expect(mine.every((i: any) => i.taskAssigneeId === 1002)).toBe(true);
      const onlyScheduled = (await get(b, month(`${HOUSE_CS}&appointmentStatus=scheduled&taskStatus=doing`))).body.result.items;
      expect(onlyScheduled.every((i: any) => (i.scheduleType === 'appointment' ? i.status === 'scheduled' : i.status === 'doing'))).toBe(true);
      expect(await total(`${HOUSE_CS}&search=${encodeURIComponent('นัดซ้อนเวลา')}`)).toBe(3);
      expect(await total(`${HOUSE_CS}&search=${encodeURIComponent('ไม่มีข้อมูลนี้แน่นอน')}`)).toBe(0);
    });

    it('the REST service answers 400 without the range, and the switches make it fail or answer nothing', async () => {
      expect((await get(b, `${FETCH}?viewMode=month`)).status).toBe(400);
      expect((await get(b, `${FETCH}?dateFrom=2026-10-01&dateTo=2026-10-31`)).status).toBe(400);
      expect((await get(make({ failCalendar: true }), month())).status).toBe(500);
      expect((await get(make({ emptyAll: true }), month())).body.result.items).toEqual([]);
      expect((await get(make({ emptyAll: true }), `${FETCH}?viewMode=year&dateFrom=2026-01-01&dateTo=2026-12-31`)).body.result.marks).toEqual([]);
    });
  });

  describe('the board (viewMode=board)', () => {
    it('one group per status column, in the order of the page, each with its count, its first page and its meta', async () => {
      const r = (await get(b, board(HOUSE_CS))).body.result;
      expect(r.appointment.map((g: any) => g.status)).toEqual(['scheduled', 're-schedule', 'success', 'cancel']);
      expect(r.task.map((g: any) => g.status)).toEqual(['doing', 'success', 'cancel']);
      for (const g of [...r.appointment, ...r.task]) {
        expect(g.items.length).toBe(Math.min(20, g.count));
        expect(g.meta).toEqual({ page: 1, perPage: 20, total: g.count, totalPages: Math.max(1, Math.ceil(g.count / 20)) });
        expect(g.items.every((i: any) => i.status === g.status)).toBe(true);
      }
      expect(r.appointment[0].count).toBeGreaterThan(20); // the default column pages
    });

    it('the summary of the page is the count of every column', async () => {
      const r = (await get(b, board(HOUSE_CS))).body.result;
      expect(r.summary.appointment).toEqual(Object.fromEntries(r.appointment.map((g: any) => [g.status, g.count])));
      expect(r.summary.task).toEqual(Object.fromEntries(r.task.map((g: any) => [g.status, g.count])));
    });

    it('type + one status asks for the next page of ONE column; the page after the last is empty', async () => {
      const first = (await get(b, board(HOUSE_CS))).body.result.appointment[0];
      const p2 = (await get(b, board(`${HOUSE_CS}&type=appointment&appointmentStatus=scheduled`).replace('page=1', 'page=2'))).body.result;
      expect(p2.task).toEqual([]);
      expect(p2.appointment).toHaveLength(1);
      expect(p2.appointment[0].status).toBe('scheduled');
      expect(p2.appointment[0].meta.page).toBe(2);
      const ids = new Set([...first.items, ...p2.appointment[0].items].map((i: any) => i.id));
      expect(ids.size).toBe(first.items.length + p2.appointment[0].items.length);
      const last = (await get(b, board(`${HOUSE_CS}&type=appointment&appointmentStatus=scheduled`).replace('page=1', 'page=99'))).body.result.appointment[0];
      expect(last.items).toEqual([]);
    });

    it('the status check boxes keep only the columns that are ticked; the sort changes the order inside a column', async () => {
      const r = (await get(b, board(`${HOUSE_CS}&appointmentStatus=scheduled,cancel&taskStatus=doing`))).body.result;
      expect(r.appointment.map((g: any) => g.status)).toEqual(['scheduled', 'cancel']);
      expect(r.task.map((g: any) => g.status)).toEqual(['doing']);
      const desc = (await get(b, board(HOUSE_CS))).body.result.appointment[0].items.map((i: any) => `${i.appointmentDate} ${i.appointmentTime ?? ''}`);
      const asc = (await get(b, board(HOUSE_CS).replace('date_desc', 'date_asc'))).body.result.appointment[0].items.map((i: any) => `${i.appointmentDate} ${i.appointmentTime ?? ''}`);
      expect(desc).toEqual([...desc].sort().reverse());
      expect(asc).toEqual([...asc].sort());
      expect(asc[0] < desc[0]).toBe(true);
    });

    it('the switches: an error, nothing, short pages', async () => {
      expect((await get(make({ failBoard: true }), board())).status).toBe(500);
      expect((await get(make({ failList: true }), board())).status).toBe(200);
      const none = (await get(make({ emptyAll: true }), board())).body.result;
      expect(none.appointment.every((g: any) => g.count === 0 && g.items.length === 0)).toBe(true);
      const short = (await get(make({ maxPerPage: 4 }), board(HOUSE_CS))).body.result.appointment[0];
      expect(short.items).toHaveLength(4);
      expect(short.meta.totalPages).toBe(Math.ceil(short.count / 4));
    });
  });

  describe('the list (viewMode=list)', () => {
    it('both kinds with their first page, the meta and the summary', async () => {
      const r = (await get(b, list(HOUSE_CS))).body.result;
      expect(r.list.appointment.items).toHaveLength(20);
      expect(r.list.task.items).toHaveLength(20);
      expect(r.list.appointment.meta.totalPages).toBeGreaterThan(1);
      expect(r.list.appointment.meta.total).toBe(Object.values(r.summary.appointment).reduce((a: number, n: any) => a + n, 0));
    });

    it('type asks for the next page of one kind only; pages never repeat an item', async () => {
      const p1 = (await get(b, list(HOUSE_CS))).body.result.list.appointment.items;
      const p2 = (await get(b, list(`${HOUSE_CS}&type=appointment`).replace('page=1', 'page=2'))).body.result.list;
      expect(Object.keys(p2)).toEqual(['appointment']);
      expect(p2.appointment.meta.page).toBe(2);
      const ids = [...p1, ...p2.appointment.items].map((i: any) => i.id);
      expect(new Set(ids).size).toBe(ids.length);
    });

    it('sorts: newest / oldest date, id ascending / descending, by status', async () => {
      const items = async (sort: string) => (await get(b, list(HOUSE_CS).replace('date_desc', sort))).body.result.list.appointment.items as any[];
      const when = (i: any) => `${i.appointmentDate} ${i.appointmentTime ?? '00:00:00'}`;
      const newest = await items('date_desc');
      const oldest = await items('date_asc');
      expect(newest.map(when)).toEqual(newest.map(when).sort().reverse());
      expect(oldest.map(when)).toEqual(oldest.map(when).sort());
      const idsAsc = (await items('order_asc')).map((i) => i.id);
      expect(idsAsc).toEqual([...idsAsc].sort((x, y) => x - y));
      const idsDesc = (await items('order_desc')).map((i) => i.id);
      expect(idsDesc).toEqual([...idsDesc].sort((x, y) => y - x));
      const ranks = ['scheduled', 're-schedule', 'success', 'cancel'];
      const byStatus = (await items('status')).map((i) => ranks.indexOf(i.status));
      expect(byStatus).toEqual([...byStatus].sort((x, y) => x - y));
    });

    it('search narrows the list and the summary; the switches fail it or empty it', async () => {
      const r = (await get(b, list(`${HOUSE_CS}&search=${encodeURIComponent('นัดซ้อนเวลา')}`))).body.result;
      expect(r.list.appointment.meta.total).toBe(3);
      expect(r.summary.appointment.scheduled).toBe(3);
      expect((await get(make({ failList: true }), list())).status).toBe(500);
      expect((await get(make({ emptyAll: true }), list())).body.result.list.task.items).toEqual([]);
    });
  });

  describe('one cast: the same item in the calendar, the board and the list', () => {
    it('an item has the same fields wherever the page reads it, and belongs to a lead of the shared cast', async () => {
      const fromList = (await get(b, list(HOUSE_CS))).body.result.list.appointment.items[0];
      const fromMonth = (await get(b, `${FETCH}?viewMode=month&dateFrom=${fromList.appointmentDate}&dateTo=${fromList.appointmentDate}${HOUSE_CS}`)).body.result.items.find((i: any) => i.id === fromList.id);
      expect(fromMonth).toEqual(fromList);
      const lead = leadModel(fromList.leadId);
      expect(fromList.prospectName).toBe(lead.seed.customerName);
      expect(fromList.movementTypeId).toBe(lead.product.id);
    });

    it('the rows of the Activities mock are in the seed with the same ids, subjects, dates, times and statuses (so the work done there is the work here)', async () => {
      const rest = createMockRest();
      let checked = 0;
      for (let n = 1; n <= SEED_LEAD_COUNT; n++) {
        if (n % 53 === 0) continue; // that lead fails to open in the Activities mock
        const lead = leadModel(n);
        // the REST answer as `Data_API` sees it: the status and the JSON text
        const answer = await rest.leadById(String(n), String(currentGroup(lead)?.id ?? ''));
        const detail = (answer.body ? JSON.parse(answer.body) : null)?.result as OpportunityByIdResult | undefined;
        if (!detail) continue;
        const mine = baseRowsOfLead(n);
        const appts = mine.filter((r) => r.kind === 'APPOINTMENT');
        const tasks = mine.filter((r) => r.kind === 'TASK');
        expect(detail.appointmentList.map((a) => [a.id, a.subject, a.date, a.time, a.status]), `lead ${n} appointments`).toEqual(appts.map((r) => [r.id, r.subject, r.date, r.time ?? '', r.status]));
        expect(detail.taskList.map((t) => [t.id, t.subject, t.date, t.time, t.allDay, t.completed]), `lead ${n} tasks`).toEqual(tasks.map((r) => [r.id, r.subject, r.date, r.time ?? '', r.allDay, r.status === 'success']));
        checked += mine.length;
      }
      expect(checked).toBeGreaterThan(300);
    });

    it('the ids are unique, and the extra rows (6_000_000+) are the Schedule-only ones', () => {
      const rows = seedScheduleRows();
      expect(new Set(rows.map((r) => r.id)).size).toBe(rows.length);
      expect(extraRows().every((r) => r.id >= 6_000_000)).toBe(true);
      expect(rows.length).toBeGreaterThan(600);
    });
  });

  describe('writing (the work modal and the move of a card)', () => {
    const addBody = (over: Record<string, unknown> = {}) => ({ leadId: 43, taskAssigneeId: 1002, subject: 'นัดทดสอบ', detail: 'รายละเอียด', date: '2026-10-21', time: '13:30', type: 'APPOINTMENT', status: 'scheduled', allDay: false, remark: '', ...over });
    const leadOfHouseCs = (): number => {
      for (let n = 1; n <= SEED_LEAD_COUNT; n++) {
        const l = leadModel(n);
        if (l.product.id === HOUSE && !l.closed && currentGroup(l)?.id === 101) return n;
      }
      throw new Error('no lead');
    };

    it('add: the item appears in the calendar, the board and the list; the counters move', async () => {
      const n = leadOfHouseCs();
      const before = (await get(b, board(HOUSE_CS))).body.result.summary.appointment.scheduled;
      const r = await send(b, 'POST', '../board/schedule/add', addBody({ leadId: n, procedureGroupId: 101, date: '2026-10-21', subject: 'นัดที่เพิ่มใหม่' }));
      expect(r.status).toBe(200);
      expect(r.body).toMatchObject({ status: 201, message: 'success' });
      const day = (await get(b, `${FETCH}?viewMode=day&dateFrom=2026-10-21&dateTo=2026-10-21${HOUSE_CS}`)).body.result.items;
      const added = day.find((i: any) => i.topic === 'นัดที่เพิ่มใหม่');
      expect(added).toMatchObject({ id: r.body.result.id, leadId: n, scheduleType: 'appointment', appointmentTime: '13:30:00', taskAssigneeId: 1002, activityGroupId: 101, status: 'scheduled' });
      expect((await get(b, board(HOUSE_CS))).body.result.summary.appointment.scheduled).toBe(before + 1);
      expect((await get(b, list(`${HOUSE_CS}&search=${encodeURIComponent('นัดที่เพิ่มใหม่')}`))).body.result.list.appointment.meta.total).toBe(1);
    });

    it('add: an all-day task has no time; the backend refuses what the real one refuses (400 with its message)', async () => {
      const n = leadOfHouseCs();
      const ok = await send(b, 'POST', '../board/schedule/add', addBody({ leadId: n, procedureGroupId: 101, type: 'TASK', status: 'doing', allDay: true, time: null }));
      expect(ok.body.status).toBe(201);
      const day = (await get(b, `${FETCH}?viewMode=day&dateFrom=2026-10-21&dateTo=2026-10-21`)).body.result.items;
      expect(day.find((i: any) => i.id === ok.body.result.id)).toMatchObject({ scheduleType: 'task', allDay: true, appointmentTime: null });
      for (const [over, text] of [
        [{ leadId: 99999 }, 'ไม่พบ Lead'],
        [{ subject: ' ' }, 'subject'],
        [{ subject: 'x ~fail' }, '~fail'],
        [{ detail: '' }, 'detail'],
        [{ date: '21/10/2026' }, 'date'],
        [{ type: 'MEETING' }, 'type'],
        [{ leadId: n }, 'procedureGroupId'],
      ] as const) {
        const r = await send(b, 'POST', '../board/schedule/add', addBody(over));
        expect(r.status, JSON.stringify(over)).toBe(400);
        expect(r.body.message).toContain(text);
      }
    });

    it('edit (also the move of a card): the status, the title, the date and the time change; the board counters follow', async () => {
      const col = (await get(b, board(HOUSE_CS))).body.result;
      const card = col.appointment[0].items[0];
      const r = await send(b, 'PATCH', '../board/schedule/edit', { id: card.id, leadId: card.leadId, subject: card.topic, detail: card.detail, date: card.appointmentDate, time: card.appointmentTime.slice(0, 5), status: 'success', allDay: false, remark: '' });
      expect(r.body).toMatchObject({ status: 200 });
      const after = (await get(b, board(HOUSE_CS))).body.result;
      expect(after.summary.appointment.scheduled).toBe(col.summary.appointment.scheduled - 1);
      expect(after.summary.appointment.success).toBe(col.summary.appointment.success + 1);
      await send(b, 'PATCH', '../board/schedule/edit', { id: card.id, subject: 'หัวข้อใหม่', date: '2026-10-22', time: '08:15', allDay: false });
      const moved = (await get(b, `${FETCH}?viewMode=day&dateFrom=2026-10-22&dateTo=2026-10-22${HOUSE_CS}`)).body.result.items.find((i: any) => i.id === card.id);
      expect(moved).toMatchObject({ topic: 'หัวข้อใหม่', appointmentTime: '08:15:00', status: 'success' });
    });

    it('edit: unknown item 404, ~fail 400, no id 500 (the servlet), the switch 500', async () => {
      expect((await send(b, 'PATCH', '../board/schedule/edit', { id: 1, status: 'success' })).status).toBe(404);
      expect((await send(b, 'PATCH', '../board/schedule/edit', { id: 5000010, subject: 'x ~fail' })).status).toBe(400);
      expect((await send(b, 'PATCH', '../board/schedule/edit', { status: 'success' })).status).toBe(500);
      const failing = make({ failEdit: true });
      const r = await send(failing, 'PATCH', '../board/schedule/edit', { id: 5000010, status: 'success' });
      expect(r.status).toBe(500);
    });

    it('what was written is remembered like a server session: a new backend (a page reload) sees it; reset forgets it', async () => {
      const n = leadOfHouseCs();
      await send(b, 'POST', '../board/schedule/add', addBody({ leadId: n, procedureGroupId: 101, subject: 'จำไว้' }));
      const again = make();
      expect((await get(again, month(`${HOUSE_CS}&search=${encodeURIComponent('จำไว้')}`))).body.result.items).toHaveLength(1);
      resetMockSchedule();
      expect((await get(make(), month(`${HOUSE_CS}&search=${encodeURIComponent('จำไว้')}`))).body.result.items).toHaveLength(0);
    });
  });

  describe('the work modal customer search (Schedule switches it on)', () => {
    it('leads the user may pick: open ones, filtered by product / group / owner / text, 20 per page', async () => {
      const r = (await get(b, `/board/leads?viewMode=list&sortBy=txdate_desc&showClosed=false&page=1&perPage=20&movementTypeId=${HOUSE}&activityGroupId=101`)).body.leads;
      expect(r.items.length).toBeGreaterThan(5);
      expect(r.items.every((l: any) => l.activityGroupId === 101 && l.movementTypeId === HOUSE)).toBe(true);
      expect(Object.keys(r.items[0]).sort()).toEqual(['activityGroupId', 'activityGroupName', 'employeeCode', 'employeeId', 'employeeName', 'forwardStatus', 'id', 'movementTypeId', 'prospectCode', 'prospectName', 'saleGroupName', 'txNo'].sort());
      const mine = (await get(b, `/board/leads?viewMode=list&page=1&perPage=20&employeeId=1001`)).body.leads.items;
      expect(mine.every((l: any) => l.employeeId === 1001)).toBe(true);
      const step = await get(b, `/board/lead?id=${r.items[0].id}`);
      expect(step.body.currentStep.procedureGroupId).toBe(101);
      expect((await get(b, '/board/lead?id=9999')).status).toBe(404);
    });
  });

  describe('the filter state of the HttpSession', () => {
    it('is what the last POST (sendBeacon) said; a new page reads it back with initial(); nothing before', async () => {
      expect((await b.initial()).savedFilterJson).toBeNull();
      const state = { movementTypeId: HOUSE, activityGroupId: 101, calView: 'week', calYear: 2026, calMonth: 9, calDay: 14, tab: 'board', filter: null, listSort: 'status', search: 'x' };
      const r = await send(b, 'POST', '/board/schedule-filter-state', JSON.stringify(state));
      expect(r.status).toBe(204);
      expect(await (await b.fetch('/board/schedule-filter-state')).json()).toEqual(state);
      expect((await make().initial()).savedFilterJson).toEqual(state);
      resetMockSchedule();
      expect((await make().initial()).savedFilterJson).toBeNull();
    });

    it('an empty body does not erase it', async () => {
      await send(b, 'POST', '/board/schedule-filter-state', JSON.stringify({ tab: 'list' }));
      await send(b, 'POST', '/board/schedule-filter-state', '  ');
      expect((await b.initial()).savedFilterJson).toEqual({ tab: 'list' });
    });
  });

  it('answers 404 for an address it does not know, 405 for the wrong method', async () => {
    expect((await get(b, '/board/nothing')).status).toBe(404);
    expect((await send(b, 'POST', FETCH, {})).status).toBe(405);
  });
});
