import { beforeEach, describe, expect, it } from 'vitest';
import { SEED_LEAD_COUNT, seedLead } from '@core/mock/crm-seed';
import { GATEWAY_BODY, MOCK_UPLOAD_ACCEPT, SAVE_REFUSED_BODY, createMockLeadDetail, opportunityFacts, resetMockLeadDetail } from './opportunity-detail.mock';

const ME = 1001; // the "demo" account: E101
const backend = createMockLeadDetail({ delayMs: 0, employeeId: ME });
const get = async (url: string) => (await backend.fetch(url)).json();
const send = (url: string, method: string, body: unknown, type = 'application/json') =>
  backend.fetch(url, { method, body: typeof body === 'string' ? body : JSON.stringify(body), headers: { 'Content-Type': type } });

describe('Lead detail mock backend (the answers of the Java servlets under /board)', () => {
  beforeEach(() => resetMockLeadDetail());

  it('serves the one value the server rendered into the markup: the accept list of the attachment input', async () => {
    expect(await backend.initial()).toEqual({ uploadAcceptExt: MOCK_UPLOAD_ACCEPT });
    expect(MOCK_UPLOAD_ACCEPT.split(',')).toEqual([...MOCK_UPLOAD_ACCEPT.split(',')].sort());
  });

  it('the cast of the comparison scenarios is what the scenarios say it is (tools/compare/pages/opportunity-detail/scenarios.mjs)', () => {
    const f = (n: number) => opportunityFacts(n);
    expect(f(29)).toMatchObject({ usesWf: true, groups: 5, groupIdx: 4, hasOwner: true, hasTeam: true, hasHistory: true, status: 'ACTIVE', ownerId: ME, appts: 3, tasks: 2 });
    expect(f(7)).toMatchObject({ usesWf: true, groups: 5, groupIdx: 2, status: 'ACTIVE', ownerId: 1004 });
    expect(f(1)).toMatchObject({ groups: 7, groupIdx: 0 });
    expect(f(87).groups).toBe(2);
    expect(f(21).groups).toBe(3);
    expect(f(3)).toMatchObject({ groups: 7, groupIdx: 6 });
    expect(f(240).groups).toBe(12);
    expect(f(239).groups).toBe(1);
    expect([f(108).usesWf, f(27).usesWf]).toEqual([false, false]);
    expect([f(30).status, f(40).status, f(237).status]).toEqual(['SUCCESS', 'LOST', 'SOLD']);
    expect([f(44).hasOwner, f(52).hasTeam, f(35).hasHistory]).toEqual([false, false, false]);
    expect([f(129).appts, f(129).tasks]).toEqual([0, 0]);
    // the cast of the table view scenarios: a middle row, the last row of a middle group, the last row of the last group
    expect(f(7)).toMatchObject({ stepIdx: 1, steps: 3 });
    expect(f(59)).toMatchObject({ groupIdx: 0, groups: 3, stepIdx: 3, steps: 4 });
    expect(f(4)).toMatchObject({ groupIdx: 5, groups: 6, stepIdx: 1, steps: 2 });
  });

  it('the lead is the one the lists show: seedLead(n), its customer and its owner', async () => {
    const lead = await get('../board/lead?id=29&activityGroupId=105');
    const seed = seedLead(29);
    expect(lead).toMatchObject({ id: 29, leadStatus: seed.status, usesWorkflowStep: true, amount: seed.amount });
    expect(lead.prospect.id).toBe(seed.prospectId);
    expect(lead.prospect.name).toBe(seed.customerName);
    expect(lead.employee).toMatchObject({ id: ME, code: seed.ownerCode, name: seed.ownerName });
    expect(lead.currentStep).toMatchObject({ procedureGroupId: 105, canReturn: true });
    expect(lead.permissions.canAddContactActivity).toBe(true);
    for (const key of ['appointmentList', 'taskList', 'contactHistoryList', 'materialList', 'tagList', 'accessors', 'activeSteps']) expect(Array.isArray(lead[key])).toBe(true);
    // somebody else's lead: the signed-in employee may not add contact activities by role-less right
    expect((await get('../board/lead?id=7')).permissions.canAddContactActivity).toBe(false);
  });

  it('a lead without workflow step has no groups, no group in the current step, no stepbar data', async () => {
    const lead = await get('../board/lead?id=108');
    expect(lead.usesWorkflowStep).toBe(false);
    expect(lead.currentStep.procedureGroupId).toBeUndefined();
    expect(lead.activeSteps).toEqual([]);
    expect((await get('../board/activity-groups?leadId=108')).result).toEqual([]);
  });

  it('answers the activity groups as the servlet does (an envelope with result), the steps as a bare array', async () => {
    const groups = await get('../board/activity-groups?leadId=29');
    expect(groups.status).toBe(200);
    expect(groups.result.map((g: { id: number }) => g.id)).toEqual([101, 102, 103, 104, 105]);
    const steps = await get('../board/activity-steps?leadId=29&activityGroupId=101');
    expect(Array.isArray(steps)).toBe(true);
    expect(steps[0]).toMatchObject({ id: 10101, code: 'CS01' });
    expect((await backend.fetch('../board/activity-groups')).status).toBe(400);
  });

  it('the lead API fails on purpose for the ids the scenarios use: 403, 400, 500, an empty answer, 404', async () => {
    const r403 = await backend.fetch('../board/lead?id=900');
    expect(r403.status).toBe(403);
    expect((await r403.json()).error.message).toContain('ไม่มีสิทธิ์');
    expect((await backend.fetch('../board/lead?id=901')).status).toBe(400);
    expect((await backend.fetch('../board/lead?id=902')).status).toBe(500);
    expect(await get('../board/lead?id=903')).toEqual({});
    expect((await backend.fetch(`../board/lead?id=${SEED_LEAD_COUNT + 1}`)).status).toBe(404);
  });

  it('lead-update changes the lead: amount, target month / year, demand, interest, tags, the assignment', async () => {
    const post = (b: Record<string, unknown>) => send('../board/lead-update', 'POST', new URLSearchParams({ leadId: '29', ...(b as Record<string, string>) }).toString(), 'application/x-www-form-urlencoded');
    expect((await post({ action: 'amount', amount: '1234567.5' })).status).toBe(200);
    await post({ action: 'target-month', month: '3' });
    await post({ action: 'target-year', yearCode: '2028' });
    await post({ action: 'demand', demand: 'อยากได้บ้าน' });
    await post({ action: 'active-status', activeStatus: 'cold' });
    await post({ action: 'tags', tagIds: '4001,4003' });
    await post({ action: 'assign', saleGroupId: '2002', salePersonId: '3004' });
    const lead = await get('../board/lead?id=29');
    expect(lead).toMatchObject({ amount: 1234567.5, targetMonth: 3, targetYear: '2028', leadDemand: 'อยากได้บ้าน', activeStatus: 'cold' });
    expect(lead.tagList.map((t: { id: number }) => t.id)).toEqual([4001, 4003]);
    expect(lead.saleGroup).toMatchObject({ id: 2002 });
    expect(lead.employee.id).toBe(ME);
    expect((await post({ action: 'nope' })).status).toBe(400);
  });

  it('a contact activity lands at the top of the history; on another step it moves the lead there; "[500]" fails', async () => {
    const before = (await get('../board/lead?id=29')).contactHistoryList.length;
    const res = await send('../board/contact-activities', 'POST', { leadId: 29, channel: 'line', content: 'คุยกับลูกค้า', procedureGroupId: 105, procedureId: 10502, workRecordDate: '2026-10-18T09:30:00' });
    expect(res.status).toBe(200);
    const lead = await get('../board/lead?id=29');
    expect(lead.contactHistoryList.length).toBeGreaterThanOrEqual(before + 1); // (moving to another step also draws the steps passed on the way)
    expect(lead.contactHistoryList[0]).toMatchObject({ type: 'line', content: 'คุยกับลูกค้า', workRecordDate: '2026-10-18T09:30:00', procedureId: 10502 });
    expect(lead.currentStep.procedureId).toBe(10502);
    const bad = await send('../board/contact-activities', 'POST', { leadId: 29, channel: 'manual', content: 'x [500]' });
    expect(bad.status).toBe(500);
    expect((await bad.json()).error).toBeTruthy();
    expect((await send('../board/contact-activities', 'POST', { content: 'no lead' })).status).toBe(400);
  });

  it('forward moves the lead to the first target; return goes back; close-step locks the return; close ends the lead', async () => {
    expect((await send('../board/lead/forward', 'POST', { leadId: 7, targets: [] })).status).toBe(400);
    const fwd = await send('../board/lead/forward', 'POST', { leadId: 7, currentActivityGroupId: 103, remark: 'ไปต่อ', targets: [{ activityGroupId: 104, activityStepId: 10401, assigneeEmployeeId: 1005 }] });
    expect(fwd.status).toBe(200);
    let lead = await get('../board/lead?id=7');
    expect(lead.currentStep).toMatchObject({ procedureGroupId: 104, procedureId: 10401, assigneeId: 1005 });
    expect(lead.contactHistoryList[0]).toMatchObject({ type: 'forward', content: 'ไปต่อ' });
    expect((await send('../board/lead/forward', 'POST', { leadId: 7, remark: '[500]', targets: [{ activityGroupId: 104 }] })).status).toBe(500);

    const ret = await send('../board/lead/return', 'POST', { leadId: 7, currentActivityGroupId: 104, returnToActivityGroupId: 101, remark: 'เอกสารไม่ครบ' });
    expect(ret.status).toBe(200);
    lead = await get('../board/lead?id=7');
    expect(lead.currentStep.procedureGroupId).toBe(101);
    expect((await send('../board/lead/return', 'POST', { leadId: 7 })).status).toBe(400);

    expect((await send('../board/lead/close-step', 'POST', { leadId: 8, wfsId: 0 })).status).toBe(400);
    expect((await send('../board/lead/close-step', 'POST', { leadId: 21, wfsId: 5 })).status).toBe(500); // the multiples of 7 fail on purpose (lead 21 here, 7 itself too)
    expect((await send('../board/lead/close-step', 'POST', { leadId: 8, wfsId: 5, remark: 'ปิดแก้ไข' })).status).toBe(200);
    expect((await get('../board/lead?id=8')).currentStep.canReturn).toBe(false);

    expect((await send('../board/lead/close', 'POST', { leadId: 8, outcome: 'maybe' })).status).toBe(400);
    // the design has no close button: the system closes it on entering a step of 100% / 0% (see opportunity-detail.rules.spec.ts)
    const refused = await send('../board/lead/close', 'POST', { leadId: 8, outcome: 'lost' });
    expect(refused.status).toBe(422);
    expect((await get('../board/lead?id=8')).leadStatus).toBe('ACTIVE');
  });

  it('the return groups: the groups before the current one, each with the person it goes back to', async () => {
    const [wrapper] = (await get('../board/lead/return-groups?leadId=29&currentActivityGroupId=105')).result;
    expect(wrapper.returnDestinations.map((d: { activityGroupId: number }) => d.activityGroupId)).toEqual([101, 102, 103, 104]);
    expect(wrapper.returnDestinations[0]).toMatchObject({ activityGroupCode: 'CS', returnToCode: expect.any(String) });
    expect((await get('../board/lead/return-groups?leadId=1')).result[0].returnDestinations).toEqual([]);
  });

  it('the forward groups carry the order number (groups with the same number can be worked at the same time)', async () => {
    const groups = (await get('../board/lead/forward-groups?leadId=29&currentActivityGroupId=105')).result;
    expect(groups.map((g: { id: number }) => g.id)).toEqual([101, 102, 103, 104]);
    expect(groups.find((g: { id: number }) => g.id === 103).orderNo).toBe(groups.find((g: { id: number }) => g.id === 104).orderNo);
    const people = (await get('../board/lead/forward-employees?leadId=29&activityGroupId=102')).result;
    expect(people.map((p: { code: string }) => p.code)).toEqual(['E105', 'E106']);
  });

  it('products: the lists are served, but adding / deleting one is refused (read-only on the single opportunity)', async () => {
    const before = (await get('../board/lead?id=1')).materialList;
    expect(before.length).toBeGreaterThan(0);
    expect((await get('../board/material-groups')).length).toBe(3);
    expect((await get('../board/materials?groupId=5001')).map((m: { id: number }) => m.id)).toEqual([6001, 6002, 6003]);
    expect((await send('../board/lead-materials', 'POST', { leadId: 1, materialId: 6003 })).status).toBe(403);
    expect((await send('../board/lead-materials', 'DELETE', { leadId: 1, detailOrderNo: before[0].detailOrderNo })).status).toBe(403);
    expect((await get('../board/lead?id=1')).materialList).toHaveLength(before.length);
  });

  it('accessors: the lead has some, adding employees adds them, the backend refuses E108', async () => {
    const n = (await get('../board/lead/accessors?leadId=29&all=true')).result.length;
    expect((await send('../board/lead/accessor-add?leadId=29', 'POST', { employeeIds: [] })).status).toBe(400);
    expect((await send('../board/lead/accessor-add?leadId=29', 'POST', { employeeIds: [1008] })).status).toBe(500);
    expect((await send('../board/lead/accessor-add?leadId=29', 'POST', { employeeIds: [1002, 1003] })).status).toBe(200);
    expect((await get('../board/lead/accessors?leadId=29&all=true')).result.length).toBeGreaterThanOrEqual(n);
  });

  it('master data of the page: countries carry the phone masks, geo is a province → district → sub-district chain', async () => {
    const countries = (await get('../board/chat-master-data?type=countries')).result;
    // (the Thai name is the one of the Thai dictionary: ChatMasterDataServlet put it over the `nameTh` of the service)
    expect(countries.find((c: { code: string }) => c.code === 'THA')).toMatchObject({ phoneCountryCode: '+66', nameTh: 'ไทย', name: 'Thailand' });
    for (const type of ['business-types', 'occupations', 'marketing-channels', 'communication-types']) expect((await get(`../board/chat-master-data?type=${type}`)).result.length).toBeGreaterThan(2);
    expect((await backend.fetch('../board/chat-master-data?type=nope')).status).toBe(400);
    const provinces = (await get('../board/provinces')).result;
    const districts = (await get(`../board/districts?provinceId=${provinces[0].id}`)).result;
    const subs = (await get(`../board/sub-districts?districtId=${districts[0].id}`)).result;
    expect(subs[0].postCode).toMatch(/^\d{5}$/);
    const geo = await get('../board/metro-geo');
    expect(geo[0]).toEqual({ p: expect.any(String), pn: expect.any(String), pid: expect.any(Number), d: expect.any(String), dn: expect.any(String), s: expect.any(String), sn: expect.any(String), z: expect.any(String) });
  });

  it('the customer: the same person as the lead, saving keeps what was sent; "[500]" / "[net]" fail as the servlet fails', async () => {
    const pr = await get(`../board/prospect?id=${seedLead(29).prospectId}`);
    expect(pr.name).toBe(seedLead(29).customerName);
    expect(pr.sunProspectInfo.csLoanType).toBeTruthy();
    expect(pr.satisfaction.customerGender).toBeTruthy();
    const save = await send('../board/prospect/save', 'POST', { prospectId: pr.id, prospect: { ...pr, name: 'ชื่อใหม่' }, fields: {} });
    expect(await save.json()).toMatchObject({ ok: true });
    expect((await get(`../board/prospect?id=${pr.id}`)).name).toBe('ชื่อใหม่');
    expect((await get('../board/lead?id=29')).prospect.name).toBe('ชื่อใหม่');
    // a refusal of the service: ProspectSaveServlet answers HTTP 502 and the words of apiErrorMessage — "API ตอบ <status> — <body of the answer>"
    const refused = await send('../board/prospect/save', 'POST', { prospectId: pr.id, prospect: { remark: '[500]' } });
    expect(refused.status).toBe(502);
    expect(await refused.json()).toEqual({ ok: false, via: 'api', status: 500, message: 'API ตอบ 500 — ' + SAVE_REFUSED_BODY });
    const gateway = await send('../board/prospect/save', 'POST', { prospectId: pr.id, prospect: { remark: '#gw' } });
    expect(gateway.status).toBe(502);
    expect((await gateway.json()).message).toBe('API ตอบ 502 — ' + GATEWAY_BODY);
    const net = await send('../board/prospect/save', 'POST', { prospectId: pr.id, prospect: { remark: '[net]' } });
    expect(net.status).toBe(502);
    expect(await get('../board/prospect?id=99999')).toEqual({});
  });

  it('the photo: ok answers the file back, "fail" in the name fails, no file is a 400', async () => {
    expect(await (await send('../board/prospect/avatar', 'POST', { prospectId: 29, fileContentBase64: 'data:image/png;base64,AAAA', fileName: 'a.png' })).json()).toEqual({ ok: true, attachFile: 'data:image/png;base64,AAAA' });
    expect(await (await send('../board/prospect/avatar', 'POST', { prospectId: 29, fileContentBase64: 'x', fileName: 'fail.png' })).json()).toMatchObject({ ok: false });
    expect((await send('../board/prospect/avatar', 'POST', { prospectId: 29 })).status).toBe(400);
  });

  it('attachments: list, upload (a "bad" name fails, "unverified" is accepted but not verified), delete by number', async () => {
    const list = async () => (await get('../board/prospect/attachments?prospectId=29')).result;
    const n = (await list()).length;
    expect(await (await send('../board/prospect/attachments', 'POST', { prospectId: 29, fileContentBase64: 'x', fileName: 'a.pdf', description: 'a.pdf' })).json()).toMatchObject({ status: 200, verified: true, verifyReason: 'OK', message: 'success' });
    expect(await list()).toHaveLength(n + 1);
    expect(await (await send('../board/prospect/attachments', 'POST', { prospectId: 29, fileContentBase64: 'x', fileName: 'unverified.pdf' })).json()).toMatchObject({ status: 200, verified: false, verifyReason: 'HTTP_404', message: expect.stringMatching(/^อัปโหลดสำเร็จ แต่ตรวจสอบไฟล์บน O2O ไม่ผ่าน — .*\[HTTP_404\]$/) });
    expect((await send('../board/prospect/attachments', 'POST', { prospectId: 29, fileContentBase64: 'x', fileName: 'bad.pdf' })).status).toBe(500);
    expect((await send('../board/prospect/attachments', 'POST', { prospectId: 29 })).status).toBe(400);
    const docNo = (await list())[0].detailOrderNo;
    expect((await backend.fetch(`../board/prospect/attachments?prospectId=29&docNo=${docNo}`, { method: 'DELETE' })).status).toBe(200);
    expect((await backend.fetch('../board/prospect/attachments?prospectId=29&docNo=1', { method: 'DELETE' })).status).toBe(404);
    expect((await get('../board/prospect/rv-attachments?prospectId=29')).result.length).toBeGreaterThan(0);
    expect((await backend.fetch('../docproxy?url=https%3A%2F%2Ffiles.example.test%2Fa.pdf')).status).toBe(200);
  });

  it('the saved history filter is a document of its own: null until saved, the same document back', async () => {
    expect(await get('../board/detail-filter-state')).toBeNull();
    const state = { leadId: '29', procedureGroupId: '101', procedureId: '', employeesId: '', selectChannal: 'line,sms' };
    expect((await send('../board/detail-filter-state', 'POST', state)).status).toBe(200);
    expect(await get('../board/detail-filter-state')).toEqual(state);
    await send('../board/detail-filter-state', 'POST', 'null');
    expect(await get('../board/detail-filter-state')).toBeNull();
  });

  it('the contact history of the table view: one entry per group up to the current one, the current step marked', async () => {
    const { groups } = (await get('../board/lead/contact-history?leadId=29')).result;
    expect(groups).toHaveLength(5);
    expect(groups[0].steps.every((s: { status: string }) => s.status === 'done')).toBe(true);
    const last = groups[4].steps;
    expect(last[last.length - 1].status).toBe('current');
    expect(groups[0]).toMatchObject({ procedureGroupName: expect.any(String), sla: expect.any(Number), slaActual: expect.any(Number) });
  });

  it('the work modal: employees, the people of a group, an appointment / task is added (the lead shows it) and edited; "~fail" is refused', async () => {
    expect((await get('../board/employees')).map((e: { id: number }) => e.id)).toEqual([1001, 1002, 1003, 1004, 1005, 1006, 1007, 1008]);
    expect((await get('../board/master/employees-by-activity-group?activityGroupId=102')).result.map((e: { code: string }) => e.code)).toEqual(['E105', 'E106']);
    expect((await backend.fetch('../board/master/employees-by-activity-group')).status).toBe(400);

    const appts = (await get('../board/lead?id=29')).appointmentList.length;
    const body = { leadId: 29, taskAssigneeId: 1003, subject: 'นัดพบ', detail: 'รายละเอียด', date: '2026-10-28', time: '14:30', type: 'APPOINTMENT', status: 'scheduled', allDay: false, remark: '', procedureGroupId: 105 };
    const add = await send('../board/schedule/add', 'POST', body);
    expect(add.status).toBe(200);
    const { result } = await add.json();
    let lead = await get('../board/lead?id=29');
    expect(lead.appointmentList).toHaveLength(appts + 1);
    expect(lead.appointmentList.at(-1)).toMatchObject({ id: result.id, title: 'นัดพบ', date: '28/10/2026', time: '14:30:00', taskAssigneeId: 1003, status: 'scheduled' });
    // a lead with a workflow needs the group; an empty subject / "~fail" / a bad date are 400s the modal shows
    expect((await send('../board/schedule/add', 'POST', { ...body, procedureGroupId: undefined })).status).toBe(400);
    expect((await send('../board/schedule/add', 'POST', { ...body, subject: 'x ~fail' })).status).toBe(400);
    expect((await send('../board/schedule/add', 'POST', { ...body, date: '28/10/2026' })).status).toBe(400);

    // edit: the id is in the body, the lead is dropped; a created item and one of the lead's own can both be changed
    const edit = await send('../board/schedule/edit', 'PATCH', { id: result.id, taskAssigneeId: 1002, subject: 'นัดใหม่', detail: 'ใหม่', date: '2026-11-02', time: '10:15', status: 're-schedule', allDay: false, remark: '' });
    expect(edit.status).toBe(200);
    const own = lead.appointmentList[2]; // (lead 29: cancel · scheduled all-day · re-schedule)
    expect((await send('../board/schedule/edit', 'PATCH', { id: own.id, subject: own.title, detail: own.detail, date: own.date, time: null, status: 'cancel', allDay: true })).status).toBe(200);
    lead = await get('../board/lead?id=29');
    expect(lead.appointmentList.at(-1)).toMatchObject({ title: 'นัดใหม่', date: '02/11/2026', time: '10:15:00', taskAssigneeId: 1002, taskAssigneeName: expect.any(String), status: 're-schedule' });
    expect(lead.appointmentList[2]).toMatchObject({ status: 'cancel', allDay: true, time: '' });
    expect((await send('../board/schedule/edit', 'PATCH', { id: 123, subject: 'x', detail: 'y' })).status).toBe(404);
    expect((await send('../board/schedule/edit', 'PATCH', { subject: 'x' })).status).toBe(500);
  });

  it('a path of the page is accepted however it is spelled: ../board/…, /board/…, /triplesale/board/…', async () => {
    for (const p of ['../board/tags', '/board/tags', '/triplesale/board/tags']) expect((await get(p)).length).toBe(8);
    expect((await backend.fetch('../board/nope')).status).toBe(404);
  });
});
