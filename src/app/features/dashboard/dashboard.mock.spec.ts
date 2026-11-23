import { beforeEach, describe, expect, it } from 'vitest';
import { DashboardBackend } from './dashboard-backend';
import { MOCK_TODAY, createMockDashboard, resetMockDashboard } from './dashboard.mock';

/** the answer of one request as the page script reads it */
const get = async <T = any>(b: DashboardBackend, path: string, init?: RequestInit): Promise<T> => (await b.fetch(path, init)).json();
const SUN = '/dashboard/api/v1/sundashboard';
const GOLD = '/dashboard-triplesale-service/api/v1';
const ALL = 'year=all&month=all&fromdate=all&todate=all&datebasis=contact&employee=all&chanel=all&country=all&occupation=all&province=all&activitygroup=all&movementtype=all';
const q = (over: Record<string, string> = {}) => {
  const p = new URLSearchParams(ALL);
  for (const [k, v] of Object.entries(over)) p.set(k, v);
  return p.toString();
};
const sum = (a: number[]) => a.reduce((s, x) => s + x, 0);

describe('Dashboard mock backend (the fake of DashboardView + /dashboard/* + the dashboard service)', () => {
  let b: DashboardBackend;
  beforeEach(() => {
    resetMockDashboard();
    b = createMockDashboard({ delayMs: 0 });
  });

  describe('first paint (initial)', () => {
    it('gives every value the Java page read through EL: 24 JSON values + the texts of the KPI cards', async () => {
      const ini = (await b.initial('SUN')) as unknown as Record<string, unknown>;
      const json = Object.keys(ini).filter((k) => k.endsWith('Json'));
      expect(json).toHaveLength(24);
      for (const k of json) expect(ini[k], k).not.toBeUndefined();
      for (const k of ['kpiTotalFmt', 'kpiCountries', 'kpiTopCountry', 'sourceFunnelSubtitle', 'csFunnelSubtitle', 'countryFunnelSubtitle']) expect(typeof ini[k], k).toBe('string');
    });

    it('is the same on every call and every instance (fixed seed, fixed "today")', async () => {
      const a = await b.initial('SUN');
      const c = await createMockDashboard({ delayMs: 0 }).initial('SUN');
      expect(JSON.stringify(a)).toBe(JSON.stringify(c));
      expect(MOCK_TODAY).toBe('2026-10-20');
    });

    it('draws the first paint for the default filters (year 2026): the KPI text is the number the overview answers', async () => {
      const ini = await b.initial('SUN');
      const ov = await get(b, `${SUN}/overview?${q({ year: '2026' })}`);
      expect(ini.kpiTotalFmt).toBe(Number(ov.result.alllead.total).toLocaleString('en-US'));
      expect(ini.kpiCountries).toBe(String(ov.result.country.countryCount));
      expect(ini.sourceFunnelSubtitle).toMatch(/ ลีดที่ปิดได้$/);
    });
  });

  describe('master data (/dashboard/masterdata-all, months, activity steps)', () => {
    it('answers the nine dropdown lists as { value, label }', async () => {
      const md = await get(b, '/dashboard/masterdata-all?ggwBranch=SUN');
      expect(Object.keys(md).sort()).toEqual(['activity_group', 'chanel', 'country', 'employee', 'months', 'movementtype', 'occupation', 'province', 'years']);
      for (const list of Object.values(md) as { value: string; label: string }[][]) {
        expect(list.length).toBeGreaterThan(0);
        for (const it of list) expect(Object.keys(it).sort()).toEqual(['label', 'value']);
      }
    });

    it('labels the months with the Thai abbreviations, value = the month number (Java: THAI_MONTH_ABBREV)', async () => {
      const md = await get(b, '/dashboard/masterdata-all');
      expect(md.months.map((m: any) => `${m.value}=${m.label}`)).toEqual(['1=ม.ค.', '2=ก.พ.', '3=มี.ค.', '4=เม.ย.', '5=พ.ค.', '6=มิ.ย.', '7=ก.ค.', '8=ส.ค.', '9=ก.ย.', '10=ต.ค.', '11=พ.ย.', '12=ธ.ค.']);
    });

    it('months of a year: only the months that have data (2026 stops at today)', async () => {
      const m26 = await get(b, '/dashboard/months?year=2026');
      expect(Math.max(...m26.map((m: any) => Number(m.value)))).toBeLessThanOrEqual(10);
      expect((await get(b, '/dashboard/months?year=2025')).length).toBeGreaterThan(0);
    });

    it('lists the steps of a department', async () => {
      const cs = await get(b, '/dashboard/masterdata-activitystep?activitygroup=CS');
      expect(cs.map((s: any) => s.value)).toEqual(['CS01', 'CS02', 'CS03', 'CS04']);
      expect(await get(b, '/dashboard/masterdata-activitystep?activitygroup=nonsense')).toEqual(cs); // Java default: CS
    });
  });

  describe('overview charts (/dashboard/chart-single)', () => {
    const CHARTS = ['trend', 'group', 'cs', 'topCountries', 'sourceFunnel', 'step', 'csFunnel', 'countryFunnel', 'leadBreakdown', 'groupPanels', 'statusKpis'];

    it.each(CHARTS)('chart "%s" answers { chart, data }', async (chart) => {
      const r = await get(b, `/dashboard/chart-single?chart=${chart}&${q({ year: '2026' })}`);
      expect(r.chart).toBe(chart);
      expect(r.data).not.toBeNull();
    });

    it('an unknown chart is an error body, not a crash (the page logs "server error" and keeps its data)', async () => {
      const r = await get(b, '/dashboard/chart-single?chart=nope');
      expect(r.error).toMatch(/unknown chart/);
    });

    it('the filters really narrow the numbers, and every chart agrees with the others', async () => {
      const total = async (qs: string) => sum((await get(b, `/dashboard/chart-single?chart=cs&${qs}`)).data.values) + 0;
      const groupSum = async (qs: string) => sum((await get(b, `/dashboard/chart-single?chart=group&${qs}`)).data.map((g: any) => g.value));
      const all = await groupSum(q());
      const y26 = await groupSum(q({ year: '2026' }));
      const y25 = await groupSum(q({ year: '2025' }));
      expect(y26 + y25).toBe(all);
      expect(y25).toBeGreaterThan(0);
      expect(await groupSum(q({ year: '2026', country: 'ญี่ปุ่น' }))).toBeLessThan(y26);
      // the "cs" chart keeps its top 8 owners: never more than the leads of the same selection
      expect(await total(q({ year: '2026' }))).toBeLessThanOrEqual(y26);
    });

    it('a date range narrows the daily trend to the days inside it', async () => {
      const r = await get(b, `/dashboard/chart-single?chart=trend&${q({ year: '2026', month: '3', fromdate: '2026-03-10', todate: '2026-03-20' })}`);
      expect(r.data.xAxis.length).toBeGreaterThan(0);
      for (const d of r.data.xAxis) expect(d >= '2026-03-10' && d <= '2026-03-20').toBe(true);
      expect(r.data.series).toHaveLength(r.data.xAxis.length);
    });

    it('a funnel row is { name, total, closed, sharePct, barPct } and its subtitle counts the closed leads', async () => {
      const r = await get(b, `/dashboard/chart-single?chart=sourceFunnel&${q({ year: '2026' })}`);
      expect(Object.keys(r.data[0]).sort()).toEqual(['barPct', 'closed', 'closedOnly', 'name', 'sharePct', 'total']);
      expect(r.data[0].barPct).toBe(100);
      expect(r.subtitle).toMatch(/^[\d,]+ ลีดที่ปิดได้$/);
    });

    it('lead breakdown has the six buckets the page draws, with success / lost counts', async () => {
      const r = await get(b, `/dashboard/chart-single?chart=leadBreakdown&${q({ year: '2026' })}`);
      expect(Object.keys(r.data).sort()).toEqual(['businesstype', 'channel', 'district', 'occupation', 'saleperson', 'team']);
      expect(r.data.saleperson.items[0]).toMatchObject({ lead: expect.any(Number), success: expect.any(Number), lost: expect.any(Number) });
      expect(r.data.saleperson.totalLead).toBe(sum(r.data.saleperson.items.map((i: any) => i.lead)));
    });
  });

  describe('overview KPI (the dashboard service)', () => {
    it('answers { result: { alllead, close_success, country, milestones … } }', async () => {
      const r = await get(b, `${SUN}/overview?${q({ year: '2026' })}`);
      expect(r.result.alllead.total).toBeGreaterThan(0);
      expect(r.result.milestones.map((m: any) => m.label)).toEqual(['ปิดการขายสำเร็จ', 'อยู่ระหว่างดำเนินการ', 'เสียโอกาส']);
      const ms = sum(r.result.milestones.map((m: any) => m.total));
      expect(ms).toBe(r.result.alllead.total);
    });
  });

  describe('pipeline', () => {
    it('pages are years: page 1 = the newest year, the footer total is the unique leads of that year', async () => {
      const p1 = (await get(b, `${SUN}/pipeline?${q({ year: 'all' })}&page=1`)).result;
      const p2 = (await get(b, `${SUN}/pipeline?${q({ year: 'all' })}&page=2`)).result;
      expect(p1.year).toBe('2026');
      expect(p2.year).toBe('2025');
      expect(p1.totalPages).toBe(2);
      expect(p1.months).toHaveLength(12);
      expect(p1.months[0].label).toBe('มกราคม  2026');
      expect(sum(p1.months.map((m: any) => m.total))).toBe(p1.grandTotal);
      expect(p1.groups).toEqual(['CS', 'AN', 'PLS', 'LS', 'FI', 'LE', 'CRM']);
    });

    it('a cell opens the list behind it: detail has the same people as the cell counts', async () => {
      const p = (await get(b, `${SUN}/pipeline?${q({ year: '2026' })}&page=1`)).result;
      const row = p.months.find((m: any) => m.values.CS > 0);
      const d = (await get(b, `${SUN}/pipeline/detail?${q({ year: '2026', month: String(Number(row.month)) })}&group=CS&page=1`)).result;
      expect(d.totalRecords).toBe(row.values.CS);
      expect(d.pageSize).toBe(20);
      expect(d.data.length).toBe(Math.min(20, d.totalRecords));
    });
  });

  describe('employee performance (สถานะตามกลุ่มขั้นตอน)', () => {
    it('the counts of a row are the lengths of its pending / completed lists', async () => {
      const rows = (await get(b, `${SUN}/employee_performance?${q({ year: '2026' })}&group=CS&includeBlocked=false`)).result;
      expect(rows.length).toBeGreaterThan(0);
      for (const r of rows.slice(0, 3)) {
        expect(r.pendingCount + r.completedCount).toBe(r.totalLead);
        const pend = (await get(b, `${SUN}/employee_performance/pending_list?${q({ year: '2026', employee: r.employeeCode })}&group=CS&page=1&perPage=50&includeBlocked=false`)).result;
        const done = (await get(b, `${SUN}/employee_performance/completed_list?${q({ year: '2026', employee: r.employeeCode })}&group=CS&page=1&perPage=50&includeBlocked=false`)).result;
        expect(pend.totalRecords).toBe(r.pendingCount);
        expect(done.totalRecords).toBe(r.completedCount);
      }
    });

    it('the steps of an employee add up to the employee', async () => {
      const [r] = (await get(b, `${SUN}/employee_performance?${q({ year: '2026' })}&group=CS&includeBlocked=false`)).result;
      const steps = (await get(b, `${SUN}/employee_performance/steps?${q({ year: '2026' })}&group=CS&employeeCode=${r.employeeCode}&includeBlocked=false`)).result;
      expect(steps.map((s: any) => s.procedureName)).toEqual(['รับลีดใหม่', 'โทรติดต่อลูกค้า', 'นัดหมายพบลูกค้า', 'ส่งต่อทีมวิเคราะห์']);
      expect(sum(steps.map((s: any) => s.pendingCount))).toBeGreaterThanOrEqual(r.pendingCount);
    });

    it('"include blocked" adds the blocked leads', async () => {
      const count = async (blocked: boolean) =>
        sum((await get(b, `${SUN}/employee_performance?${q({ year: '2026' })}&group=CS&includeBlocked=${blocked}`)).result.map((r: any) => r.totalLead));
      expect(await count(true)).toBeGreaterThanOrEqual(await count(false));
    });
  });

  describe('customer tabs (ลูกค้าตามกลุ่มขั้นตอน / สถานะตามลูกค้า)', () => {
    it('customer_step_groups: fixed columns first, then one column group per department; paged by 50', async () => {
      const r = (await get(b, `${SUN}/customer_step_groups?${q({ year: '2026' })}&search=&page=1&perPage=50`)).result;
      expect(r.columnName.slice(0, 6)).toEqual(['ติดต่อครั้งแรก', 'รหัส', 'ชื่อลูกค้า', 'อาชีพ', 'ประเทศ', 'ผู้รับผิดชอบล่าสุด']);
      expect(r.columnName.slice(6)).toEqual(['CS', 'AN', 'PLS', 'LS', 'FI', 'LE', 'CRM']);
      expect(r.customerList.length).toBeLessThanOrEqual(50);
      expect(r.totalPages).toBe(Math.ceil(r.totalRecords / 50));
      expect(r.customerList[0].CS).toMatchObject({ dateIn: expect.any(String), assignToName: expect.any(String), dateTotal: expect.any(Number) });
    });

    it('search narrows by name or code', async () => {
      const all = (await get(b, `${SUN}/customer_step_groups?${q({ year: '2026' })}&search=&page=1&perPage=50`)).result;
      const code = all.customerList[0].code;
      const one = (await get(b, `${SUN}/customer_step_groups?${q({ year: '2026' })}&search=${encodeURIComponent(code)}&page=1&perPage=50`)).result;
      expect(one.totalRecords).toBe(1);
      expect(one.customerList[0].code).toBe(code);
    });

    it('customer_status_list: the step columns follow the department and the step filter', async () => {
      const all = (await get(b, `${SUN}/customer_status_list?${q({ year: '2026', activitygroup: 'CS' })}&search=&page=1&perPage=50&activitystep=all`)).result;
      expect(all.columnName).toEqual(['ชื่อลูกค้า', 'รหัส', 'อาชีพ', 'ประเทศ', 'รับลีดใหม่', 'โทรติดต่อลูกค้า', 'นัดหมายพบลูกค้า', 'ส่งต่อทีมวิเคราะห์']);
      const some = (await get(b, `${SUN}/customer_status_list?${q({ year: '2026', activitygroup: 'CS' })}&search=&page=1&perPage=50&activitystep=CS01,CS03`)).result;
      expect(some.columnName.slice(4)).toEqual(['รับลีดใหม่', 'นัดหมายพบลูกค้า']);
      expect(some.totalRecords).toBeLessThanOrEqual(all.totalRecords);
    });
  });

  describe('lead table (ตารางลีดทั้งหมด)', () => {
    it('pages of 20, newest contact first, with the fields of the service', async () => {
      const r = await get(b, `${SUN}/lead_list?${q({ year: '2026' })}&search=&page=1&perPage=20`);
      expect(r.result.data).toHaveLength(20);
      expect(r.result.pageSize).toBe(20);
      expect(r.meta.total).toBe(r.result.totalRecords);
      const dates = r.result.data.map((l: any) => l.contactDate);
      expect([...dates].sort().reverse()).toEqual(dates);
      expect(Object.keys(r.result.data[0])).toContain('latestAssignToName');
    });

    it('the first-paint table is page 1 of the same list', async () => {
      const ini = await b.initial('SUN');
      const r = await get(b, `${SUN}/lead_list?${q({ year: '2026' })}&search=&page=1&perPage=20`);
      expect((ini.leadsTableJson as any).rows.map((x: any) => x.code)).toEqual(r.result.data.map((x: any) => x.prospectCode));
      expect((ini.leadsTableJson as any).totalRows).toBe(r.result.totalRecords);
    });

    it('the timeline of a lead lists the steps it went through, in order', async () => {
      const r = await get(b, `${SUN}/lead_list?${q({ year: '2026' })}&search=&page=1&perPage=20`);
      const code = r.result.data[0].prospectCode;
      const d = await get(b, `${SUN}/lead_list/detail?prospectCode=${code}`);
      expect(d.result.length).toBeGreaterThan(0);
      expect(d.result[0].procedureGroupCode).toBe('CS');
      const dates = d.result.map((t: any) => t.changeDate);
      expect([...dates].sort()).toEqual(dates);
    });
  });

  describe('widget layout (edit mode of the overview)', () => {
    it('is empty at first, then keeps what the page saved — also for the next page that opens (a "reload")', async () => {
      expect(await get(b, '/dashboard/widget-layout?page=overview')).toEqual({ widgets: [] });
      const widgets = [{ id: 'chartTrend', visible: false, order: 3 }];
      const ok = await get(b, '/dashboard/widget-layout?page=overview', { method: 'POST', body: JSON.stringify({ widgets }) });
      expect(ok).toEqual({ ok: true });
      expect(await get(createMockDashboard({ delayMs: 0 }), '/dashboard/widget-layout?page=overview')).toEqual({ widgets });
      resetMockDashboard();
      expect(await get(createMockDashboard({ delayMs: 0 }), '/dashboard/widget-layout?page=overview')).toEqual({ widgets: [] });
    });

    it('refuses a body that is not JSON', async () => {
      const r = await b.fetch('/dashboard/widget-layout?page=overview', { method: 'POST', body: 'x' });
      expect(r.status).toBe(400);
    });
  });

  describe('requests', () => {
    it('an unknown path is a 404 with a JSON body', async () => {
      const r = await b.fetch('/dashboard/nope');
      expect(r.status).toBe(404);
      expect((await r.json()).error).toBe('not found');
    });

    it('a request that the page aborts (a newer filter) rejects with AbortError', async () => {
      const slow = createMockDashboard({ delayMs: 50 });
      const ctrl = new AbortController();
      const p = slow.fetch('/dashboard/chart-single?chart=trend', { signal: ctrl.signal });
      ctrl.abort();
      await expect(p).rejects.toMatchObject({ name: 'AbortError' });
      await expect(slow.fetch('/dashboard/months', { signal: ctrl.signal })).rejects.toMatchObject({ name: 'AbortError' });
    });
  });

  describe('the dashboard service of the two iframes', () => {
    it('calendar: lists the calendars with their tasks, filtered by the ticked calendar names', async () => {
      const all = await get(b, `${GOLD}/calendar?calendartype=all&page=1&perPage=20`);
      expect(all.result.map((c: any) => c.name)).toEqual(['งานของฉัน', 'ติดตามลูกค้า', 'งานทีม']);
      const one = await get(b, `${GOLD}/calendar?calendartype=${encodeURIComponent('งานทีม')}`);
      expect(one.result.map((c: any) => c.name)).toEqual(['งานทีม']);
    });

    it('creating a calendar and a task shows up in the next read; editing changes the task', async () => {
      expect((await b.fetch(`${GOLD}/calendar`, { method: 'POST', body: JSON.stringify({ name: 'ใหม่' }) })).status).toBe(200);
      const cals = (await get(b, `${GOLD}/calendar`)).result;
      const mine = cals.find((c: any) => c.name === 'ใหม่');
      expect(mine).toBeTruthy();
      const created = await get(b, `${GOLD}/calendar-task`, {
        method: 'POST',
        body: JSON.stringify({ title_task: 'งานทดสอบ', calendarmasterid: String(mine.id), start_repeat: '2026-10-21', repeat_time: '09:30:00', status: 'doing', schedule_type: 'task' }),
      });
      const after = (await get(b, `${GOLD}/calendar`)).result.find((c: any) => c.name === 'ใหม่');
      expect(after.task_list).toHaveLength(1);
      expect(after.task_list[0]).toMatchObject({ id: created.result.id, title_task: 'งานทดสอบ', appointment_date: '2026-10-21' });
      await b.fetch(`${GOLD}/calendar-task`, { method: 'PUT', body: JSON.stringify({ id: created.result.id, title_task: 'แก้แล้ว', status: 'done' }) });
      const edited = (await get(b, `${GOLD}/calendar`)).result.find((c: any) => c.name === 'ใหม่').task_list[0];
      expect(edited).toMatchObject({ title_task: 'แก้แล้ว', status: 'done' });
      expect((await b.fetch(`${GOLD}/calendar-task`, { method: 'PUT', body: JSON.stringify({ id: 99999 }) })).status).toBe(404);
    });

    it('the lookups of the sidebar and the KPI masters', async () => {
      expect((await get(b, `${GOLD}/my-calendar-list`)).result.map((x: any) => x.name)).toEqual(['งานของฉัน', 'ติดตามลูกค้า']);
      expect((await get(b, `${GOLD}/my-task-list`)).result.map((x: any) => x.name)).toEqual(['งานทีม']);
      expect((await get(b, `${GOLD}/masters/levels?ggwBranch=SUN`)).result[0]).toMatchObject({ sla: 4, kpiUnitCode: 'Hour' });
      expect((await get(b, `${GOLD}/masters/branches`)).result.map((x: any) => x.code)).toEqual(['SUN', 'GOLD', 'ACE']);
      expect((await b.fetch(`${GOLD}/masters/unknown`)).status).toBe(404);
    });

    it('KPI event movements: filter, create, patch, delete', async () => {
      const list = async (qs = '') => (await get(b, `${GOLD}/eventmovements?search=${qs}`)).result as any[];
      const all = await list();
      expect(all.length).toBeGreaterThan(10);
      expect((await get(b, `${GOLD}/eventmovements?eventStatus=Done`)).result.every((e: any) => e.eventStatus === 'Done')).toBe(true);
      const created = await get(b, `${GOLD}/eventmovements`, { method: 'POST', body: JSON.stringify({ detail: 'รายการใหม่', eventStatus: 'Open', startDate: '2026-10-20 09:00:00' }) });
      expect((await list()).length).toBe(all.length + 1);
      expect((await list())[0]).toMatchObject({ id: created.result.id, detail: 'รายการใหม่' });
      await b.fetch(`${GOLD}/eventmovements/${created.result.id}`, { method: 'PATCH', body: JSON.stringify({ eventStatus: 'Done' }) });
      expect((await list())[0].eventStatus).toBe('Done');
      expect((await b.fetch(`${GOLD}/eventmovements/${created.result.id}`, { method: 'DELETE' })).status).toBe(200);
      expect((await list()).length).toBe(all.length);
      expect((await b.fetch(`${GOLD}/eventmovements/${created.result.id}`, { method: 'DELETE' })).status).toBe(404);
    });

    it('the frames start from the same data the service answers', async () => {
      const cal = await b.calendarFrame({ ggwBranch: 'SUN', goldApi: GOLD, employeeCode: 'E101', username: 'demo' });
      expect(cal.calendarApiUrl).toBe(`${GOLD}/calendar`);
      expect(cal.calendarTaskCreateUrl).toBe(`${GOLD}/calendar-task`);
      const data = JSON.parse(cal.calendarDataJson);
      expect(data.today).toBe(MOCK_TODAY);
      expect(data.events.length).toBe(sum((await get(b, `${GOLD}/calendar`)).result.map((c: any) => c.task_list.length)));
      const kpi = JSON.parse(await b.kpiFrame({ ggwBranch: 'SUN', goldApi: GOLD, employeeCode: 'E101', username: 'demo' }));
      expect(kpi.columns).toHaveLength(19);
      expect(kpi.records).toHaveLength(kpi.total);
      expect(kpi.records[0]).toMatchObject({ _rid: '0', eventId: expect.any(String), txno: expect.stringMatching(/^KPI-2026-/) });
    });
  });
});
