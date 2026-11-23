import { describe, expect, it } from 'vitest';
import { fakeRest, SERVICE_API, type FakeAnswer, type FakeCall, type FakeOptions } from '@core/live/rest-fake';
import { createLiveHome } from './home.live';

/**
 * The composition of the live backend of the CRM home page: every address the page script (`dashboard.js` + the work modal it includes) asks
 * for is answered by the module that ported its servlet, and makes the REST call(s) the Java servlet made. The modules have their own specs
 * (`core/live/*.live.spec.ts`: every parameter, every error path) — what is proved HERE is the wiring: which module answers which URL of
 * THIS page, with the exact parameters this page sends (read from `index.xhtml`, `dashboard.js`, `work_modal.xhtml`; the expected REST calls
 * are read from the Java servlets and services: `DashboardApiService`, `LeadsBoardServlet` + `LeadBoardView.fetchLeadsJson`, `AssignLeadServlet`,
 * `LeadDetailServlet`, `AddScheduleServlet`, `EditScheduleServlet`, `MovementTypesServlet`, the master-data servlets).
 */

const ROLES = ['CRM_Lead_View'];
const env = (result: unknown, status = 200) => ({ status, message: 'success', result });

/** a scripted service: `answer(call)` = what the REST service says; `calls` = what was asked */
function setup(answer: (c: FakeCall) => FakeAnswer = () => env([]), o: FakeOptions = {}) {
  const { deps, calls } = fakeRest(answer, { roles: ROLES, ...o });
  const backend = createLiveHome(deps);
  return {
    calls,
    paths: () => calls.map((c) => `${c.method} ${c.path}`),
    ask: async (url: string, init?: RequestInit) => {
      const r = await backend.fetch(url, init);
      return { status: r.status, text: await r.text() };
    },
    backend,
  };
}

describe('the live backend of the CRM home page: one REST call per address of the page', () => {
  it('../dashboardapi?action=summary → GET /dashboard (movementTypeId, startDate, endDate, page, perPage) and, for the pictures, GET /prospects?page=1&pageSize=500', async () => {
    const s = setup((c) => (c.path.startsWith('/dashboard') ? env({ stats: { total: 1 }, items: [{ prospectName: 'สมชาย', attachFile: '' }] }) : env([{ name: 'สมชาย', attachFile: 'https://files.test/a.png' }])));
    // the URL summaryUrl() of the script writes
    const r = await s.ask('../dashboardapi?action=summary&page=1&perPage=100&movementTypeId=1004400740&startDate=2024-10-01&endDate=2026-10-21');
    expect(r.status).toBe(200);
    expect(s.paths()).toEqual(['GET /dashboard?movementTypeId=1004400740&startDate=2024-10-01&endDate=2026-10-21&page=1&perPage=100', 'GET /prospects?page=1&pageSize=500']);
    // DashboardApiService.enrichOpportunityImages: the item without a picture gets the one of the prospect with the same name
    expect(JSON.parse(r.text).result.items[0].attachFile).toBe('https://files.test/a.png');
  });

  it('the first load of a product-less page: no movementTypeId / startDate / endDate on the URL of the service', async () => {
    const s = setup(() => env({ stats: {}, items: [] }));
    await s.ask('../dashboardapi?action=summary&page=1&perPage=100');
    expect(s.paths()).toEqual(['GET /dashboard?page=1&perPage=100']);
  });

  it('../dashboardapi?action=schedules → GET /dashboard/schedules (viewMode, date, dateFrom, dateTo, movementTypeId) for the three views of the calendar', async () => {
    const list = '{"status":200,"message":"success","result":{"list":{"appointment":{"items":[]},"task":{"items":[]}}}}';
    const s = setup(() => list);
    // schedulesMonthUrl(): the month cards; loadMonthMarks(): the dots (viewMode=year); loadDay(): one day
    expect((await s.ask('../dashboardapi?action=schedules&viewMode=list&dateFrom=2026-10-01&dateTo=2026-10-31&movementTypeId=1004400740')).text).toBe(list);
    await s.ask('../dashboardapi?action=schedules&viewMode=year&dateFrom=2026-10-01&dateTo=2026-10-31');
    await s.ask('../dashboardapi?action=schedules&viewMode=day&date=2026-10-21&movementTypeId=1004400741');
    expect(s.paths()).toEqual([
      'GET /dashboard/schedules?viewMode=list&dateFrom=2026-10-01&dateTo=2026-10-31&movementTypeId=1004400740',
      'GET /dashboard/schedules?viewMode=year&dateFrom=2026-10-01&dateTo=2026-10-31',
      'GET /dashboard/schedules?viewMode=day&date=2026-10-21&movementTypeId=1004400741',
    ]);
  });

  it('../board/movement-types → GET /master-data/movement-types/LD, the `result` array as the page reads it', async () => {
    const rows = [{ id: 1004400740, code: 'LD-HL', name: 'สินเชื่อบ้าน', usesWorkflowStep: true }];
    const s = setup(() => env(rows));
    const r = await s.ask('../board/movement-types');
    expect(JSON.parse(r.text)).toEqual(rows);
    expect(s.paths()).toEqual(['GET /master-data/movement-types/LD']);
  });

  it('../board/leads (the opportunity table) → GET /leads?viewMode=list: the parameters in the order of LeadBoardView.fetchLeadsJson, groups = 0, the date range as custom', async () => {
    const result = { statusSummary: {}, wfStepSummary: [], leads: { items: [{ id: 1 }], meta: { total: 1, totalPages: 1 } } };
    const s = setup(() => env(result));
    // leadsUrl() of the script, with a product and a range
    const r = await s.ask('../board/leads?viewMode=list&activityGroupId=0&sortBy=txdate_desc&page=2&perPage=20&movementTypeId=1004400740&dateRangeType=custom&dateFrom=2024-10-01&dateTo=2026-10-21');
    expect(JSON.parse(r.text)).toEqual(result);
    expect(s.paths()).toEqual(['GET /leads?viewMode=list&movementTypeId=1004400740&activityGroupId=0&dateRangeType=custom&dateFrom=2024-10-01&dateTo=2026-10-21&sortBy=txdate_desc&page=2&perPage=20']);
  });

  it('../board/leads (the customer search of the work modal) → GET /leads: search URL-encoded, showClosed=false, employeeId of the user, product and group of the card', async () => {
    const s = setup(() => env({ leads: { items: [] } }));
    // wmCustUrl(): without CRM_Schedule_Create_Sup only the leads of the signed-in employee
    await s.ask('../board/leads?viewMode=list&sortBy=txdate_desc&search=%E0%B8%AA%E0%B8%A1%20%E0%B8%8A&showClosed=false&page=1&perPage=20&employeeId=1001&movementTypeId=1004400740&activityGroupId=2');
    await s.ask('../board/leads?viewMode=list&sortBy=txdate_desc&showClosed=false&page=1&perPage=20');
    expect(s.paths()).toEqual([
      'GET /leads?viewMode=list&movementTypeId=1004400740&activityGroupId=2&search=%E0%B8%AA%E0%B8%A1+%E0%B8%8A&showClosed=false&employeeId=1001&sortBy=txdate_desc&page=1&perPage=20',
      'GET /leads?viewMode=list&showClosed=false&sortBy=txdate_desc&page=1&perPage=20',
    ]);
  });

  it('../board/master/activity-groups → GET /master-data/activity-groups?movementTypeId= (the colour of the workflow-group tags)', async () => {
    const groups = { status: 200, message: 'success', result: { items: [{ id: 1, code: 'CS', name: 'ฝ่ายบริการลูกค้า' }] } };
    const s = setup(() => groups);
    expect(JSON.parse((await s.ask('../board/master/activity-groups?movementTypeId=1004400740')).text)).toEqual(groups);
    expect(s.paths()).toEqual(['GET /master-data/activity-groups?movementTypeId=1004400740']);
  });

  it('the assign dialog: ../board/sale-groups · sale-persons · employees → GET /master-data/…, with and without the team; each row reduced to the fields of MasterDataItemBean', async () => {
    const s = setup((c) => env([{ id: 5, code: 'X', name: 'ทีม', colorCode: '#fff', createdAt: '2026-01-01', employee: c.path.includes('sale-persons') ? { id: 9, code: 'E9', name: 'ก', secret: 1 } : undefined }]));
    const groups = JSON.parse((await s.ask('../board/sale-groups')).text);
    const persons = JSON.parse((await s.ask('../board/sale-persons?saleGroupId=1004400001')).text);
    const people = JSON.parse((await s.ask('../board/employees?saleGroupId=1004400001')).text);
    await s.ask('../board/sale-persons');
    await s.ask('../board/employees');
    expect(s.paths()).toEqual([
      'GET /master-data/sale-groups',
      'GET /master-data/sale-persons?saleGroupId=1004400001',
      'GET /master-data/employees?saleGroupId=1004400001',
      'GET /master-data/sale-persons',
      'GET /master-data/employees',
    ]);
    expect(groups[0]).toEqual({ id: 5, code: 'X', name: 'ทีม', nameTh: '', colorCode: '#fff', attachFile: '', postCode: '' });
    expect(persons[0].employee).toEqual({ id: 9, code: 'E9', name: 'ก', nameTh: '', colorCode: '', attachFile: '', postCode: '' });
    expect(people[0].employee).toBeUndefined();
  });

  it('../board/lead-assign → PATCH /leads/assign with the posted body untouched; the answer of the service whatever its status', async () => {
    const s = setup(() => ({ status: 400, text: '{"status":400,"message":"Validation error","error":{"code":400,"message":"ต้องส่งต่อ (forward)"}}' }));
    const body = '{"leadId":"7","saleGroupId":"1004400001","salePersonId":"2001","employeeId":"1001"}';
    const r = await s.ask('../board/lead-assign', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body });
    expect(s.calls.map((c) => [c.method, c.url, c.body])).toEqual([['PATCH', `${SERVICE_API}/leads/assign`, body]]);
    expect(r).toEqual({ status: 200, text: '{"status":400,"message":"Validation error","error":{"code":400,"message":"ต้องส่งต่อ (forward)"}}' });
    // no body: the servlet does not call the service
    const none = setup();
    expect(await none.ask('../board/lead-assign', { method: 'POST', body: '' })).toEqual({ status: 400, text: '{"error":"body required"}' });
    expect(none.calls).toHaveLength(0);
  });

  it('the work modal: ../board/lead?id=&activityGroupId= → GET /leads/{id}?activityGroupId=; the result of the lead, not the envelope', async () => {
    const lead = { id: 7, currentStep: { procedureGroupId: 2, procedureGroupName: 'ฝ่ายวิเคราะห์' } };
    const s = setup(() => env(lead));
    const r = await s.ask('../board/lead?id=7&activityGroupId=2');
    expect(JSON.parse(r.text)).toEqual(lead);
    expect(s.paths()).toEqual(['GET /leads/7?activityGroupId=2']);
    // a lead that cannot be loaded: the status and the body of the service go on (the modal prints error.message)
    const bad = setup(() => ({ status: 500, text: '{"status":500,"message":"x","error":{"code":500,"message":"ระบบขัดข้อง"}}' }));
    expect(await bad.ask('../board/lead?id=53')).toEqual({ status: 500, text: '{"status":500,"message":"x","error":{"code":500,"message":"ระบบขัดข้อง"}}' });
  });

  it('the work modal: the owner list → GET /master-data/employees/by-activity-group?activityGroupId= (or GET /master-data/employees without a group)', async () => {
    const people = { status: 200, message: 'success', result: [{ id: 1001, code: 'E101', name: 'สมชาย' }] };
    const s = setup(() => people);
    expect(JSON.parse((await s.ask('../board/master/employees-by-activity-group?activityGroupId=2')).text)).toEqual(people);
    await s.ask('../board/employees');
    expect(s.paths()).toEqual(['GET /master-data/employees/by-activity-group?activityGroupId=2', 'GET /master-data/employees']);
  });

  it('the work modal save: ../board/schedule/add → POST /schedules (movementTypeId dropped, activityGroupId → procedureGroupId); schedule/edit → PATCH /schedules/{id} (id into the path, leadId dropped)', async () => {
    const s = setup(() => ({ status: 201, text: '{"status":201,"message":"success","result":{"id":88}}' }));
    const add = await s.ask('../board/schedule/add', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json; charset=UTF-8' },
      body: JSON.stringify({ leadId: 7, type: 'APPOINTMENT', subject: 'นัด', detail: 'd', date: '2026-10-28', movementTypeId: 1004400740, activityGroupId: 2 }),
    });
    expect(add).toEqual({ status: 200, text: '{"status":201,"message":"success","result":{"id":88}}' });
    const edit = await s.ask('../board/schedule/edit', { method: 'PATCH', body: JSON.stringify({ id: 88, leadId: 7, subject: 'นัดใหม่' }) });
    // (an envelope status below 400 is HTTP 200 for the modal, which reads the body)
    expect(edit.status).toBe(200);
    expect(s.calls.map((c) => [c.method, c.path, c.body])).toEqual([
      ['POST', '/schedules', { leadId: 7, type: 'APPOINTMENT', subject: 'นัด', detail: 'd', date: '2026-10-28', procedureGroupId: 2 }],
      ['PATCH', '/schedules/88', { subject: 'นัดใหม่' }],
    ]);
    // the backend refuses (envelope status ≥ 400): that status is the HTTP status the modal sees, with the body (it prints error.message)
    const no = setup(() => ({ status: 400, text: '{"status":400,"message":"x","error":{"code":400,"message":"subject ต้องไม่ว่าง"}}' }));
    expect(await no.ask('../board/schedule/add', { method: 'POST', body: '{"leadId":7}' })).toEqual({ status: 400, text: '{"status":400,"message":"x","error":{"code":400,"message":"subject ต้องไม่ว่าง"}}' });
  });
});

describe('the roles and the languages', () => {
  it('without CRM_Lead_View the table answers [] and the service is not asked (LeadsBoardServlet); ../board/lead is refused with the message of the language', async () => {
    const s = setup(() => env({ leads: { items: [{ id: 1 }] } }), { roles: [], messages: { 'label.ld2.lead_no_permission': 'ไม่มีสิทธิ์' } });
    expect(await s.ask('../board/leads?viewMode=list&activityGroupId=0&sortBy=txdate_desc&page=1&perPage=20')).toEqual({ status: 200, text: '[]' });
    const lead = await s.ask('../board/lead?id=7');
    expect(lead.status).toBe(403);
    expect(JSON.parse(lead.text).error.message).toBe('ไม่มีสิทธิ์');
    expect(s.calls).toHaveLength(0);
  });

  it('the other addresses need no role of the page (the service decides): summary and the master lists are asked for without CRM_Lead_View', async () => {
    const s = setup(() => env({ stats: {}, items: [] }), { roles: [] });
    await s.ask('../dashboardapi?action=summary&page=1&perPage=100');
    await s.ask('../board/sale-groups');
    expect(s.paths()).toEqual(['GET /dashboard?page=1&perPage=100', 'GET /master-data/sale-groups']);
  });

  it('an English UI: the movement types and the activity groups take the English name of their code from the master-data dictionary (the Thai name where there is none)', async () => {
    const o: FakeOptions = { lang: 'en', master: { en: { 'LD-HL': 'Home loan', CS: 'Customer service' } } };
    const types = setup(() => env([{ id: 1, code: 'LD-HL', name: 'สินเชื่อบ้าน' }, { id: 2, code: 'LD-XX', name: 'อื่น ๆ' }]), o);
    expect(JSON.parse((await types.ask('../board/movement-types')).text).map((t: { name: string }) => t.name)).toEqual(['Home loan', 'อื่น ๆ']);
    // MasterDataI18n.translateEnvelopeResult renames only the rows of `result[]`; a `result.items` envelope goes on as it came
    const flat = setup(() => env([{ id: 1, code: 'CS', name: 'ฝ่ายบริการลูกค้า' }]), o);
    expect(JSON.parse((await flat.ask('../board/master/activity-groups?movementTypeId=1')).text).result[0].name).toBe('Customer service');
    const items = env({ items: [{ id: 1, code: 'CS', name: 'ฝ่ายบริการลูกค้า' }] });
    const nested = setup(() => items, o);
    expect(JSON.parse((await nested.ask('../board/master/activity-groups?movementTypeId=1')).text)).toEqual(items);
    // …and the Thai UI keeps what the service sent
    const th = setup(() => env([{ id: 1, code: 'LD-HL', name: 'สินเชื่อบ้าน' }]), { master: o.master });
    expect(JSON.parse((await th.ask('../board/movement-types')).text)[0].name).toBe('สินเชื่อบ้าน');
  });
});

describe('what the page reads when the service does not answer (the stand-ins of the servlets)', () => {
  const down = { status: 503, text: '<html>down</html>' };

  it('summary and schedules: any answer that is not a JSON object (also any non-200) is {status:502,…} with HTTP 200 — the page reads `result` and finds none', async () => {
    const s = setup(() => down);
    const bad = { status: 200, text: '{"status":502,"message":"backend ไม่ตอบหรือ response ไม่ใช่ JSON"}' };
    expect(await s.ask('../dashboardapi?action=summary&page=1&perPage=100')).toEqual(bad);
    expect(await s.ask('../dashboardapi?action=schedules&viewMode=list&dateFrom=2026-10-01&dateTo=2026-10-31')).toEqual(bad);
    // the pictures are not asked for when there is no summary
    expect(s.paths()).toEqual(['GET /dashboard?page=1&perPage=100', 'GET /dashboard/schedules?viewMode=list&dateFrom=2026-10-01&dateTo=2026-10-31']);
  });

  it('the product list and the lead table: [] with HTTP 200 (a dropdown that stays empty; a table with the warning) — never an error status', async () => {
    const s = setup(() => down);
    expect(await s.ask('../board/movement-types')).toEqual({ status: 200, text: '[]' });
    expect(await s.ask('../board/leads?viewMode=list&activityGroupId=0&sortBy=txdate_desc&page=1&perPage=20')).toEqual({ status: 200, text: '[]' });
    expect(await s.ask('../board/sale-groups')).toEqual({ status: 200, text: '[]' });
    expect(await s.ask('../board/employees')).toEqual({ status: 200, text: '[]' });
  });

  it('the activity groups: {} with HTTP 200 (the page then colours the tags by the hash of the name)', async () => {
    expect(await setup(() => down).ask('../board/master/activity-groups?movementTypeId=1')).toEqual({ status: 200, text: '{}' });
  });

  it('no answer at all (the network is down, status 0): the same stand-ins; the assign dialog gets {} and prints the generic failure', async () => {
    const s = setup(() => null);
    expect(await s.ask('../board/leads?viewMode=list&activityGroupId=0&sortBy=txdate_desc&page=1&perPage=20')).toEqual({ status: 200, text: '[]' });
    expect(await s.ask('../dashboardapi?action=summary')).toMatchObject({ status: 200 });
    expect(await s.ask('../board/lead-assign', { method: 'POST', body: '{"leadId":"1","employeeId":"2"}' })).toEqual({ status: 200, text: '{}' });
  });
});

describe('what is NOT an address of this page', () => {
  it('/board/prospect-list and the other prospect servlets are not composed (the page never asks: no suggestion card, the customer search is the lead list); /docproxy is an <img> and has no route', async () => {
    const s = setup();
    for (const url of ['../board/prospect-list?page=1&perPage=20', '../board/prospect-enrich', '../docproxy?url=http%3A%2F%2Ffiles.test%2Fa.png']) {
      const r = await s.ask(url);
      expect(r.status, url).toBe(404);
      expect(JSON.parse(r.text).message, url).toContain('no live route for');
    }
    expect(s.calls).toHaveLength(0);
  });

  it('the chat-master-data of the phone masks is routed too (the shell asks the same module itself): GET /master-data/countries?page=1&pageSize=1000', async () => {
    const s = setup(() => env([{ code: 'THA', phoneCountryCode: '+66', phoneNumberFormat: 'XX XXX XXXX' }]));
    const r = await s.ask('../board/chat-master-data?type=countries');
    expect(JSON.parse(r.text).result[0].code).toBe('THA');
    expect(s.paths()).toEqual(['GET /master-data/countries?page=1&pageSize=1000']);
  });
});

describe('fetch(…, { signal }) of the page: a request that a newer filter replaced', () => {
  it('rejects with an AbortError as soon as the signal fires (the REST call is not cancelled, the page just stops waiting), and not at all when the signal is already aborted', async () => {
    let release: (a: FakeAnswer) => void = () => undefined;
    const gate = new Promise<FakeAnswer>((r) => (release = r));
    const s = setup(() => gate);
    const ctrl = new AbortController();
    const pending = s.backend.fetch('../dashboardapi?action=summary&page=1&perPage=100', { signal: ctrl.signal });
    ctrl.abort();
    await expect(pending).rejects.toMatchObject({ name: 'AbortError' });
    release(env({ items: [] }));
    expect(s.calls).toHaveLength(1);

    const gone = new AbortController();
    gone.abort();
    await expect(s.backend.fetch('../board/sale-groups', { signal: gone.signal })).rejects.toMatchObject({ name: 'AbortError' });
    expect(s.calls).toHaveLength(1); // (no second call: an aborted fetch sends nothing)
  });

  it('an answer that comes before the abort resolves as usual, and a later abort does nothing', async () => {
    const s = setup(() => env([{ id: 1, code: 'A', name: 'a' }]));
    const ctrl = new AbortController();
    const r = await s.backend.fetch('../board/movement-types', { signal: ctrl.signal });
    ctrl.abort();
    expect(r.status).toBe(200);
    expect(JSON.parse(await r.text())).toEqual([{ id: 1, code: 'A', name: 'a' }]);
  });

  it('a request without a signal is just answered', async () => {
    const s = setup(() => env([]));
    expect((await s.backend.fetch('../board/sale-groups')).status).toBe(200);
  });
});
