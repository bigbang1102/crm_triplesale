/* eslint-disable @typescript-eslint/no-explicit-any */
import { beforeEach, describe, expect, it } from 'vitest';
import { SEED_LEAD_COUNT } from '@core/mock/crm-seed';
import { createMockActivities, resetMockActivities } from './activities.mock';

const HOUSE = '1004400740';
const CAR = '1004400741';
const ADVISER = '1004400742';
const EMPTY = '1004400743';
const FORBIDDEN = '1004400744';

describe('Activities mock backend (the BFF URLs of the Java page, in the shape of the servlets)', () => {
  const backend = createMockActivities({ delayMs: 0 });
  const get = async (url: string) => {
    const r = await backend.fetch(url);
    return { status: r.status, body: (await r.json()) as any };
  };
  const send = async (method: string, url: string, body: unknown) => {
    const r = await backend.fetch(url, { method, body: JSON.stringify(body) });
    return { status: r.status, body: (await r.json()) as any };
  };
  const list = async (q = '', mt = HOUSE) => (await get(`../board/activity-list?viewMode=list&movementTypeId=${mt}${q}&page=1&perPage=20`)).body;
  const allRows = async (q = '', mt = HOUSE) => {
    const rows: any[] = [];
    for (let p = 1; p < 50; p++) {
      const r = (await get(`../board/activity-list?viewMode=list&movementTypeId=${mt}${q}&page=${p}&perPage=20`)).body;
      rows.push(...r.rows);
      if (!r.meta.hasMore) break;
    }
    return rows;
  };

  beforeEach(() => resetMockActivities());

  it('the product list: 5 products, one without a workflow step', async () => {
    const r = await get('../board/movement-types');
    expect(r.status).toBe(200);
    expect(r.body.map((p: any) => [p.id, p.usesWorkflowStep])).toEqual([[1004400740, true], [1004400741, true], [1004400742, false], [1004400743, true], [1004400744, true]]);
    expect(r.body[0]).toMatchObject({ code: 'LD-HL', name: 'สินเชื่อบ้าน' });
  });

  describe('GET activity-list', () => {
    it('is the shape of ActivityListServlet: summary, usesWorkflowStep, wfStepSummary, rows, meta', async () => {
      const r = await list();
      expect(Object.keys(r).sort()).toEqual(['maxRows', 'meta', 'rowCount', 'rows', 'summary', 'totalRows', 'usesWorkflowStep', 'wfStepSummary']);
      expect(r.usesWorkflowStep).toBe(true);
      expect(r.rows).toHaveLength(20);
      expect(r.meta).toMatchObject({ page: 1, perPage: 20, hasMore: true, totalPages: 5 });
      const row = r.rows[0];
      for (const k of ['id', 'date', 'agent_code', 'agent_name', 'customer_name', 'group', 'step_group', 'current_step', 'due_date', 'interest', 'tags', 'leadStatus', 'procedureGroupId', 'groupCount', 'note', 'line', 'fb', 'whatsapp', 'email', 'sms', 'call', 'visit', 'children']) expect(row).toHaveProperty(k);
    });

    it('the statistics count the whole filtered set, closed leads included; the rows leave the closed leads out', async () => {
      const r = await list();
      const s = r.summary;
      expect(s.total).toBe(120);
      expect(s.new + s.success + s.lost + s.inactive + s.active).toBe(s.total);
      expect(s.active_high + s.active_medium + s.active_low).toBe(s.active);
      expect(r.wfStepSummary.reduce((n: number, g: any) => n + g.count, 0)).toBe(s.total);
      const rows = await allRows();
      expect(rows).toHaveLength(s.total - s.success - s.lost);
      expect(rows.some((x) => x.interest === 'SUCCESS' || x.interest === 'LOST')).toBe(false);
      // …and with showClosed=true everybody is there
      expect(await allRows('&showClosed=true')).toHaveLength(s.total);
    });

    it('every page is new rows (no lead twice) and the last page says there is no more', async () => {
      const rows = await allRows();
      const ids = rows.map((x) => x.id);
      expect(new Set(ids).size).toBe(ids.length);
      const last = (await get(`../board/activity-list?viewMode=list&movementTypeId=${HOUSE}&page=5&perPage=20`)).body;
      expect(last.meta.hasMore).toBe(false);
      expect(last.rows.length).toBeLessThan(20);
    });

    it('sorts by the last contact (newest first by default) and by the customer name', async () => {
      const byDate = await allRows('&sortBy=date_desc');
      const d = (x: string) => x.split('/').reverse().join('-');
      expect(byDate.map((r) => d(r.date))).toEqual([...byDate.map((r) => d(r.date))].sort().reverse());
      const asc = await allRows('&sortBy=date_asc');
      expect(asc.map((r) => d(r.date))).toEqual([...asc.map((r) => d(r.date))].sort());
      const names = (await allRows('&sortBy=name_asc')).map((r) => r.customer_name);
      expect(names).toEqual([...names].sort((a, b) => a.localeCompare(b, 'th')));
    });

    it('filters: sale group, employee name, contact name, last contact dates', async () => {
      const all = (await list()).summary.total;
      const a = (await list('&saleGroupId=1004400001')).summary.total;
      const b = (await list('&saleGroupId=1004400002')).summary.total;
      expect(a + b).toBe(all);
      expect(a).toBeGreaterThan(0);
      expect(b).toBeGreaterThan(0);
      const owner = (await list('&employeeName=' + encodeURIComponent('ธนากร'))).rows;
      expect(owner.length).toBeGreaterThan(0);
      expect(owner.every((r: any) => r.agent_name.includes('ธนากร'))).toBe(true);
      const search = (await list('&search=' + encodeURIComponent('วิชัย'))).rows;
      expect(search.every((r: any) => r.agent_name.includes('วิชัย'))).toBe(true);
      const dated = await allRows('&lastContactFrom=2026-09-20&lastContactTo=2026-10-05');
      expect(dated.length).toBeGreaterThan(0);
      expect(dated.every((r) => { const [dd, mm, yy] = r.date.split('/'); const iso = `${yy}-${mm}-${dd}`; return iso >= '2026-09-20' && iso <= '2026-10-05'; })).toBe(true);
      // a customer's name is not searched (the contact is): nothing comes back — as the real list does
      expect((await list('&search=' + encodeURIComponent('ปรียา ใจดี'))).rows).toEqual([]);
    });

    it('a lead with several groups carries its children, its history and the counters of all its groups', async () => {
      const rows = await allRows();
      const multi = rows.find((r) => r.groupCount > 1)!;
      expect(multi.children.length).toBe(multi.groupCount);
      expect(multi.history.length).toBeGreaterThan(0);
      for (const ch of ['note', 'line', 'fb', 'whatsapp', 'email', 'sms', 'call', 'visit']) {
        expect(multi[ch]).toBeGreaterThanOrEqual(multi.children.reduce((n: number, c: any) => n + c[ch], 0));
      }
      const single = rows.find((r) => r.groupCount === 1)!;
      expect(single.children).toHaveLength(1);
      expect(single.history).toBeUndefined();
    });

    it('the product without a workflow: flat rows, no workflow summary', async () => {
      const r = await list('', ADVISER);
      expect(r.usesWorkflowStep).toBe(false);
      expect(r.wfStepSummary).toEqual([]);
      expect(r.rows.length).toBeGreaterThan(0);
      expect(r.rows.every((x: any) => x.procedureGroupId === 0 && x.groupCount === 1 && x.current_step)).toBe(true);
    });

    it('the second product has other groups (the colours are indexed by position) and leaves the group name out of the lead rows', async () => {
      const r = await list('', CAR);
      expect(r.wfStepSummary.map((g: any) => g.code)).toEqual(['CS', 'AN', 'PLS', 'LS', 'FI']);
      expect(r.rows.every((x: any) => x.step_group !== '')).toBe(true);
    });

    it('a product without leads gives an empty list with zero statistics', async () => {
      const r = await list('', EMPTY);
      expect(r.rows).toEqual([]);
      expect(r.summary.total).toBe(0);
      expect(r.meta.hasMore).toBe(false);
    });

    it('a product the backend refuses (HTTP 403): no rows and the generic reason — Data_API.sendGET gave "" for an error, the message of the service never reached the table', async () => {
      const r = await list('', FORBIDDEN);
      expect(r.rows).toEqual([]);
      expect(r.error).toBe('ไม่ได้รับข้อมูลจาก API การติดต่อ');
    });

    it('the special inputs: "~500" fails like an exception of the servlet, "~err" is refused by the backend', async () => {
      const bad = await get(`../board/activity-list?viewMode=list&movementTypeId=${HOUSE}&search=${encodeURIComponent('~500')}&page=1&perPage=20`);
      expect(bad.status).toBe(500);
      expect(bad.body.rows).toEqual([]);
      const refused = await list('&search=' + encodeURIComponent('~err'));
      expect(refused.error).toBe('ไม่ได้รับข้อมูลจาก API การติดต่อ');
    });
  });

  describe('GET activity-detail', () => {
    it('is the shape of ActivityDetailServlet', async () => {
      const { status, body } = await get('../board/activity-detail?id=1&all=1&activityGroupId=101');
      expect(status).toBe(200);
      for (const k of ['customer_name', 'location', 'interest', 'phone', 'phoneCountryCode', 'first_contact', 'team', 'sale_person_name', 'due_date', 'procedureGroupId', 'employeeId', 'salePersonId', 'createById', 'employeeName', 'employeeNameOnly', 'history', 'events', 'appointments', 'tasks']) expect(body).toHaveProperty(k);
      expect(body.appointments[0]).not.toHaveProperty('id'); // as the Java mapping: no id / status for the appointments
      expect(body.tasks[0]).toHaveProperty('id');
    });
    it('the history is the current group unless the whole lead or a group is asked for', async () => {
      const row = (await allRows()).find((r) => r.groupCount > 1)!;
      const g = (q: string) => get(`../board/activity-detail?id=${row.id}&activityGroupId=${row.procedureGroupId}${q}`).then((r) => r.body.history.map((h: any) => h.group));
      const current = await g('');
      const all = await g('&all=1');
      expect(new Set(current).size).toBe(1);
      expect(new Set(all).size).toBeGreaterThan(1);
      const other = row.children.find((c: any) => c.procedureGroupId !== row.procedureGroupId);
      expect(new Set(await g('&wfsId=' + other.procedureGroupId))).toEqual(new Set([other.group]));
    });
    it('errors: an unknown lead is 404, lead 53 fails (500) with the message the page shows, a lead with several groups needs the group', async () => {
      expect((await get('../board/activity-detail?id=99999')).status).toBe(404);
      const down = await get('../board/activity-detail?id=53');
      expect(down.status).toBe(500);
      expect(down.body.error.message).toContain('ระบบขัดข้อง');
      const rows = await allRows();
      let found = 0;
      for (const r of rows.filter((x) => x.groupCount > 1)) {
        const noGroup = await get(`../board/activity-detail?id=${r.id}&all=1`);
        if (noGroup.status === 400) {
          found++;
          expect(noGroup.body.error.message).toContain('activityGroupId');
          expect((await get(`../board/activity-detail?id=${r.id}&all=1&activityGroupId=${r.procedureGroupId}`)).status).toBe(200);
        }
      }
      expect(found).toBeGreaterThan(0);
    });
  });

  describe('writes', () => {
    it('POST contact-activities adds a contact: the counters, the last contact date and the history change', async () => {
      const before = (await list()).rows.find((r: any) => r.id === 1);
      const detail0 = (await get('../board/activity-detail?id=1&all=1&activityGroupId=' + before.procedureGroupId)).body;
      const { status, body } = await send('POST', '../board/contact-activities', { leadId: 1, channel: 'call_out', content: 'โทรหาลูกค้า', procedureGroupId: before.procedureGroupId, createById: 1001, workRecordDate: '2026-10-19T10:30:00' });
      expect([status, body.status]).toEqual([201, 201]);
      const after = (await list()).rows.find((r: any) => r.id === 1) ?? (await allRows()).find((r) => r.id === 1);
      expect(after.call).toBe(before.call + 1);
      const detail1 = (await get('../board/activity-detail?id=1&all=1&activityGroupId=' + before.procedureGroupId)).body;
      const items = (d: any) => d.history.flatMap((h: any) => h.items);
      expect(items(detail1)).toHaveLength(items(detail0).length + 1);
      expect(items(detail1)[0]).toMatchObject({ text: 'โทรหาลูกค้า', time: '19/10/2026 10:30 AM', icon: 'call' });
    });
    it('POST contact-activities is refused like the backend: no text, no owner, no group (a lead in a workflow), "~fail"', async () => {
      const ok = { leadId: 1, channel: 'manual', content: 'x', procedureGroupId: 101, createById: 1001 };
      const row = (await list()).rows.find((r: any) => r.id === 1);
      ok.procedureGroupId = row.procedureGroupId;
      for (const bad of [{ content: ' ' }, { createById: 0 }, { procedureGroupId: 0 }, { content: 'x ~fail' }, { leadId: 999999 }]) {
        const r = await send('POST', '../board/contact-activities', { ...ok, ...bad });
        expect(r.status, JSON.stringify(bad)).toBeGreaterThanOrEqual(400);
        expect(r.body.error.message ?? r.body.error).toBeTruthy();
      }
      expect((await send('POST', '../board/contact-activities', { channel: 'manual' })).body).toEqual({ error: 'leadId required' });
    });
    it('POST lead-assign gives a lead without an owner its employee', async () => {
      const rows = await allRows();
      const nobody = rows.find((r) => !r.agent_name)!;
      const detail = (await get(`../board/activity-detail?id=${nobody.id}&activityGroupId=${nobody.procedureGroupId}`)).body;
      expect(detail.employeeId).toBe(0);
      expect(detail.createById).toBe(detail.salePersonId);
      expect((await send('POST', '../board/lead-assign', { leadId: nobody.id, employeeId: detail.salePersonId, salePersonId: detail.salePersonId })).body.status).toBe(200);
      const after = (await get(`../board/activity-detail?id=${nobody.id}&activityGroupId=${nobody.procedureGroupId}`)).body;
      expect(after.employeeId).toBe(detail.salePersonId);
      expect((await send('POST', '../board/lead-assign', { leadId: nobody.id, employeeId: 5 })).status).toBe(400);
    });
    it('schedule add / edit (the work modal): validated like the backend, shown by the next detail', async () => {
      const row = (await list()).rows.find((r: any) => r.id === 1);
      const d0 = (await get('../board/activity-detail?id=1&activityGroupId=' + row.procedureGroupId)).body;
      const add = { leadId: 1, taskAssigneeId: 1001, subject: 'นัดใหม่', detail: 'รายละเอียด', date: '2026-10-30', time: '13:00', type: 'APPOINTMENT', status: 'scheduled', allDay: false, remark: '', procedureGroupId: row.procedureGroupId };
      for (const bad of [{ subject: ' ' }, { detail: '' }, { date: '30/10/2026' }, { type: 'X' }, { subject: '~fail' }, { procedureGroupId: 0 }, { leadId: 99999 }]) {
        const r = await send('POST', '../board/schedule/add', { ...add, ...bad });
        expect(r.status, JSON.stringify(bad)).toBe(400);
        expect(r.body.message).toBeTruthy();
      }
      expect((await send('POST', '../board/schedule/add', { ...add, movementTypeId: 1, activityGroupId: undefined })).body.status).toBe(201);
      expect((await send('POST', '../board/schedule/add', { ...add, type: 'TASK', allDay: true, time: null, subject: 'งานใหม่', status: 'doing' })).status).toBe(200);
      const d1 = (await get('../board/activity-detail?id=1&activityGroupId=' + row.procedureGroupId)).body;
      expect(d1.appointments).toHaveLength(d0.appointments.length + 1);
      expect(d1.tasks).toHaveLength(d0.tasks.length + 1);
      expect(d1.appointments.at(-1)).toMatchObject({ title: 'นัดใหม่', date: '30/10/2026', time: '13:00' });
      expect(d1.tasks.at(-1)).toMatchObject({ title: 'งานใหม่', time_label: 'ทั้งวัน', completed: false });
      // edit: PATCH with the id of the task
      const taskId = d1.tasks.at(-1).id;
      expect((await send('PATCH', '../board/schedule/edit', { id: taskId, subject: 'งานที่แก้', detail: 'x', date: '2026-10-31', time: null, status: 'success', allDay: true, remark: '' })).body.status).toBe(200);
      const d2 = (await get('../board/activity-detail?id=1&activityGroupId=' + row.procedureGroupId)).body;
      expect(d2.tasks.at(-1)).toMatchObject({ title: 'งานที่แก้', date: '31/10/2026', completed: true });
      expect((await send('PATCH', '../board/schedule/edit', { id: 1, subject: 'x' })).status).toBe(404);
      expect((await send('PATCH', '../board/schedule/edit', { id: taskId, subject: '~fail' })).status).toBe(400);
    });
    it('reset puts the seed back', async () => {
      await send('POST', '../board/lead-assign', { leadId: 74, employeeId: 1002 });
      expect((await get('../board/activity-detail?id=74&activityGroupId=102')).body.employeeId).toBe(1002);
      resetMockActivities();
      expect((await get('../board/activity-detail?id=74&activityGroupId=102')).body.employeeId).toBe(0);
    });
  });

  describe('master data', () => {
    it('tags, sale groups, provinces, districts, employees, activity groups, the employees of a group', async () => {
      expect((await get('../board/tags')).body[0]).toMatchObject({ id: 1, code: 'VIP', colorCode: '#EB5050' });
      expect((await get('../board/sale-groups')).body.map((g: any) => g.name)).toEqual(['ทีม A', 'ทีม B']);
      const prov = (await get('../board/provinces')).body;
      expect(prov).toHaveLength(6);
      expect((await get(`../board/districts?provinceId=${prov[0].id}`)).body).toHaveLength(3);
      expect((await get('../board/districts?provinceId=')).body).toEqual([]);
      const emps = (await get('../board/employees')).body;
      expect(emps).toHaveLength(8);
      expect(emps[0]).toMatchObject({ id: 1001, code: 'E101' });
      expect((await get('../board/employees?saleGroupId=1004400001')).body.every((e: any) => ['E101', 'E102', 'E105', 'E107'].includes(e.code))).toBe(true);
      const groups = (await get(`../board/master/activity-groups?movementTypeId=${HOUSE}`)).body;
      expect(groups.status).toBe(200);
      expect(groups.result.items.map((g: any) => g.code)).toEqual(['CS', 'AN', 'PLS', 'LS', 'FI', 'LE', 'CRM']);
      expect((await get('../board/master/activity-groups')).status).toBe(400);
      expect((await get('../board/master/employees-by-activity-group?activityGroupId=102')).body.result.length).toBeGreaterThan(0);
      expect((await get('../board/master/employees-by-activity-group')).status).toBe(400);
    });
    it('the customer search of the work modal (Schedule mode): the leads of a product, searched by name, by pages; the step of a lead', async () => {
      const first = (await get(`../board/leads?viewMode=list&sortBy=txdate_desc&showClosed=false&page=1&perPage=20&movementTypeId=${HOUSE}`)).body;
      expect(first.leads.items).toHaveLength(20);
      expect(first.leads.meta).toMatchObject({ page: 1, perPage: 20 });
      expect(first.leads.meta.totalPages).toBeGreaterThan(1);
      expect(first.leads.items[0]).toMatchObject({ prospectCode: expect.any(String), saleGroupName: expect.any(String), forwardStatus: expect.stringContaining(' - '), activityGroupId: expect.any(Number) });
      const found = (await get(`../board/leads?viewMode=list&search=${encodeURIComponent(first.leads.items[0].prospectName)}&page=1&perPage=20`)).body.leads.items;
      expect(found.some((l: any) => l.id === first.leads.items[0].id)).toBe(true);
      // someone who is not a supervisor only sees what he owns
      const mine = (await get('../board/leads?viewMode=list&employeeId=1001&page=1&perPage=100')).body.leads.items;
      expect(mine.length).toBeGreaterThan(0);
      expect(mine.every((l: any) => l.employeeId === 1001)).toBe(true);
      const step = (await get(`../board/lead?id=${first.leads.items[0].id}&activityGroupId=${first.leads.items[0].activityGroupId}`)).body;
      expect(step.currentStep.procedureGroupId).toBe(first.leads.items[0].activityGroupId);
      expect((await get('../board/lead?id=53')).status).toBe(500);
      expect((await get('../board/lead?id=99999')).status).toBe(404);
    });
    it('the prospect suggestions (odsProspectSuggest) and the country master of TsPhone', async () => {
      const r = (await get('../board/prospect-list?page=1&perPage=8&enrich=1&searchText=' + encodeURIComponent('สม'))).body;
      expect(r.status).toBe(200);
      expect(r.result.items.length).toBeGreaterThan(0);
      expect(r.result.items.length).toBeLessThanOrEqual(8);
      expect(r.result.items[0]).toMatchObject({ code: expect.stringMatching(/^P\d+/), phone: expect.any(String) });
      expect((await get('../board/chat-master-data?type=countries')).body.result.some((c: any) => c.code === 'THA')).toBe(true);
      expect((await get('../board/not-here')).status).toBe(404);
    });
  });

  it('the cast is the shared one: lead n here is seedLead(n) of every page, and there are as many as the seed has', async () => {
    let total = 0;
    for (const mt of [HOUSE, CAR, ADVISER, EMPTY, FORBIDDEN]) total += (await list('', mt)).summary?.total ?? 0;
    expect(total).toBe(SEED_LEAD_COUNT);
  });
});
