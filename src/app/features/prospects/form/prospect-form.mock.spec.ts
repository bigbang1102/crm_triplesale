import { beforeEach, describe, expect, it } from 'vitest';
import { resetMockProspects } from '../prospects.mock';
import { prospectPatchOf } from '@core/mock/shared-db';
import { MOCK_EMPLOYEE_ID, createMockProspectForm, currentMockDetail, mockFormDetail, resetMockProspectForm, withoutStoredBytes } from './prospect-form.mock';

const backend = () => createMockProspectForm();
const json = (s: string): Record<string, any> => JSON.parse(s);
const result = (s: string): any => json(s)['result'];

beforeEach(() => {
  resetMockProspectForm();
  resetMockProspects();
});

describe('master data (GET /master-data/…)', () => {
  it('answers in the envelope of the service: status, message, result', async () => {
    const { api } = backend();
    for (const path of ['countries?page=1&pageSize=1000', 'provinces?page=1&pageSize=3000', 'business-types?page=1&pageSize=1000', 'occupations?page=1&pageSize=1000', 'marketing-channels?page=1&pageSize=1000', 'communication-types?page=1&pageSize=1000', 'sale-persons?page=1&pageSize=1000', 'movement-types/LD']) {
      const r = json(await api.masterData(path));
      expect(r, path).toMatchObject({ status: 200, message: 'success' });
      expect(Array.isArray(r['result']), path).toBe(true);
      expect(r['result'].length, path).toBeGreaterThan(0);
    }
    expect(json(await api.masterData('nope?x=1'))).toMatchObject({ status: 404 });
  });

  it('the provinces carry the traps the form must handle: a foreign one, a Thai one twice, a code with a tab', async () => {
    const rows = result(await backend().api.masterData('provinces?page=1&pageSize=3000')) as Array<{ id: number; code: string; name: string }>;
    expect(rows.find((r) => r.code === 'KUL')).toMatchObject({ name: 'Kuala Lumpur' });
    expect(rows.filter((r) => r.code === 'BKK').map((r) => r.id).sort((a, b) => a - b)).toEqual([90, 100]);
    expect(rows.some((r) => r.code === '\tCBI')).toBe(true);
  });

  it('countries: two share a phone code, one has none; districts follow the province; the service has sub-districts for one district only', async () => {
    const { api } = backend();
    const countries = result(await api.masterData('countries?page=1&pageSize=1000')) as Array<{ code: string; phoneCountryCode: string }>;
    expect(countries.filter((c) => c.phoneCountryCode === '+1').map((c) => c.code)).toEqual(['USA', 'CAN']);
    expect(countries.find((c) => c.code === 'ATA')!.phoneCountryCode).toBe('');
    expect((result(await api.masterData('districts?provinceId=100&page=1&pageSize=1000')) as Array<{ name: string }>).map((d) => d.name)).toEqual(['เขตพระนคร', 'เขตดุสิต', 'เขตบางรัก']);
    expect(result(await api.masterData('districts?provinceId=7&page=1&pageSize=1000'))).toEqual([]);
    expect(result(await api.masterData('sub-districts?districtId=1020&page=1&pageSize=1000'))).toHaveLength(2);
    expect(result(await api.masterData('sub-districts?districtId=1000&page=1&pageSize=1000'))).toEqual([]);
  });

  it('the metro file is the rows of the districts of Bangkok in the shape of the real file', async () => {
    const rows = JSON.parse(await backend().api.metroGeo()) as Array<Record<string, string>>;
    expect(rows).toHaveLength(9);
    expect(Object.keys(rows[0]).sort()).toEqual(['d', 'dn', 'p', 'pid', 'pn', 's', 'sn', 'z']);
  });
});

describe('GET /prospects/{id}', () => {
  it('is the customer of the list page with every field of the form', async () => {
    const d = result(await backend().api.prospect('1')) as Record<string, unknown>;
    expect(d).toMatchObject({ id: 1, code: 'P00001', name: 'จิราพร แสงทอง', customerType: 'person', currentCityCode: 'HKT', country: 'THA' });
    for (const k of ['customerTel', 'phoneCountryCode', 'sex', 'idCard', 'contactDate', 'birthdate', 'currentAddress', 'sendDocAddress', 'marketingChanelCode', 'saleGroupCode', 'ggwBranchId', 'prospectPhone1', 'prospectTel1']) expect(d, k).toHaveProperty(k);
  });

  it('is deterministic and varies: extra info on every 3rd+1, a legacy company, a channel by id only, a country by id only, no birth date', () => {
    expect(mockFormDetail(1)).toEqual(mockFormDetail(1));
    expect(mockFormDetail(1)!['sunProspectInfo']).toBeTruthy();
    expect(mockFormDetail(2)!['sunProspectInfo']).toBeUndefined();
    expect(mockFormDetail(20)!['customerType']).toBe('company');
    expect(mockFormDetail(10)!['customerType']).toBe('juristic');
    expect(mockFormDetail(7)).toMatchObject({ marketingChanelCode: '', marketingChanelName: '' });
    expect(mockFormDetail(7)!['marketingChanelId']).toBeGreaterThan(0);
    expect(mockFormDetail(13)).toMatchObject({ country: '', countryId: 1 });
    expect(mockFormDetail(11)!['birthdate']).toBe('');
    expect(mockFormDetail(5)!['phoneCountryCode']).toBe('');
    expect(mockFormDetail(0)).toBeNull();
    expect(mockFormDetail(99999)).toBeNull();
  });

  it('an unknown or malformed id is an empty answer (Data_API: not 200 = "")', async () => {
    const { api } = backend();
    expect(await api.prospect('99999')).toBe('');
    expect(await api.prospect('abc')).toBe('');
    expect(await api.prospect('')).toBe('');
  });
});

describe('writes', () => {
  it('POST /prospects: a new id from 1000, the lead of the product is created; special names fail on purpose', async () => {
    const { api } = backend();
    const a = json(await api.createProspect({ name: 'A', movementTypeId: 5 }));
    const b = json(await api.createProspect({ name: 'B' }));
    expect([a['status'], a['result'].id, b['result'].id]).toEqual([201, 1000, 1001]);
    expect(currentMockDetail(1000)).toMatchObject({ id: 1000, name: 'A', code: 'P01000' });
    const leads = result(await api.findLeads('movementTypeId=5')) as { leads: { items: Array<{ prospectId: number }> } };
    expect(leads.leads.items.map((l) => l.prospectId)).toEqual([1000]);
    expect(await api.createProspect({ name: 'X-NOREPLY' })).toBe('');
    expect(json(await api.createProspect({ name: 'X-FAIL' }))).toMatchObject({ status: 500 });
    expect(json(await api.createProspect({ name: 'X-INVALID' }))).toMatchObject({ status: 400, error: { message: 'name is invalid' } });
    expect(json(await api.createProspect({ name: 'X-DUP' }))['status']).toBe(409);
    expect(json(await api.createProspect({ name: 'X-DUP', confirmMerge: true }))['status']).toBe(201);
  });

  it('PUT /prospects/{id} merges what was sent over the cast; an unknown customer is 404; the special names fail', async () => {
    const { api } = backend();
    expect(json(await api.updateProspect(1, { name: 'ใหม่', remark: 'r' }))['status']).toBe(200);
    expect(currentMockDetail(1)).toMatchObject({ name: 'ใหม่', remark: 'r', code: 'P00001' });
    expect(json(await api.updateProspect(99999, { name: 'x' }))['status']).toBe(404);
    expect(json(await api.updateProspect(1, { name: 'X-FAIL' }))['status']).toBe(500);
    expect(json(await api.updateProspect(1, { name: 'X-INVALID' }))['status']).toBe(400);
    expect(await api.updateProspect(1, { name: 'X-NOREPLY' })).toBe('');
    expect(currentMockDetail(1)!['name']).toBe('ใหม่');
  });

  it('PUT /prospects/{id}/extra-info merges the sun info and the satisfaction; a remark of X-EXTRA-FAIL refuses', async () => {
    const { api } = backend();
    await api.putExtraInfo(1, { sunProspectInfo: { csVip: 'Y' }, satisfaction: { customerStatus: 'ok' } });
    expect(currentMockDetail(1)).toMatchObject({ sunProspectInfo: { researcher: 'E101', csVip: 'Y' }, satisfaction: { customerStatus: 'ok' } });
    await api.updateProspect(2, { remark: 'X-EXTRA-FAIL' });
    expect(json(await api.putExtraInfo(2, { sunProspectInfo: { csVip: 'Y' } }))['status']).toBe(500);
  });

  it('the documents are the Prospects mock\'s: listed, the picture is stored without joining them, a delete says success', async () => {
    const { api } = backend();
    const docs = result(await api.prospectAttachments(1)) as Array<{ detailOrderNo: number; attachFileTypeCode: string }>;
    expect(docs.length).toBeGreaterThan(1);
    const added = json(await api.addProspectAttachment(1, { attachFileBase64: 'QUJD', fileName: 'me.jpg', attachFileTypeCode: 'PROFILE' }));
    expect(added['result'].attachFile).toMatch(/^prospect\/\d+\/me\.jpg$/);
    expect(result(await api.prospectAttachments(1))).toHaveLength(docs.length);
    expect(json(await api.addProspectAttachment(1, { fileName: 'FAIL.jpg' }))['status']).toBe(500);
    expect(json(await api.addProspectAttachment(99999, { fileName: 'a.jpg' }))['status']).toBe(404);
    const first = docs.find((d) => d.attachFileTypeCode === 'DOC')!;
    expect(json(await api.deleteProspectAttachment(1, first.detailOrderNo))).toEqual({ success: true, message: 'success' });
    expect(json(await api.deleteProspectAttachment(1, first.detailOrderNo))).toMatchObject({ success: false });
  });

  it('leads: POST /leads, the newest first, PATCH /leads/assign (employee 108 cannot be assigned)', async () => {
    const { api } = backend();
    await api.createLead({ prospectId: 3, movementTypeId: 9 });
    await api.createLead({ prospectId: 4, movementTypeId: 9 });
    const items = (result(await api.findLeads('viewMode=list&movementTypeId=9')) as { leads: { items: Array<{ id: number; prospectId: number }> } }).leads.items;
    expect(items.map((l) => l.prospectId)).toEqual([4, 3]);
    expect(json(await api.assignLead({ leadId: items[0].id, employeeId: 101 }))['status']).toBe(200);
    expect(json(await api.assignLead({ leadId: items[0].id, employeeId: 108 }))['status']).toBe(500);
    expect(json(await api.assignLead({ leadId: 1, employeeId: 101 }))['status']).toBe(404);
  });
});

describe('the fetch of the page\'s own scripts', () => {
  it('GET ../board/prospect?id= is the result of the prospect, "{}" for none', async () => {
    const b = backend();
    expect(await (await b.fetch('../board/prospect?id=1')).json()).toMatchObject({ id: 1, name: 'จิราพร แสงทอง' });
    expect(await (await b.fetch('../board/prospect?id=99999')).json()).toEqual({});
    expect(await (await b.fetch('../board/prospect?id=')).json()).toEqual({});
  });

  it('POST ../board/prospect/save puts the extra info; a bad body is 400; a refusal is 502', async () => {
    const b = backend();
    const ok = await b.fetch('../board/prospect/save', { method: 'POST', body: JSON.stringify({ prospectId: 1, extraInfo: { sunProspectInfo: { csVip: 'Y' } } }) });
    expect(ok.status).toBe(200);
    expect(await ok.json()).toMatchObject({ ok: true, via: 'api' });
    expect(currentMockDetail(1)!['sunProspectInfo']).toMatchObject({ csVip: 'Y' });
    expect((await b.fetch('../board/prospect/save', { method: 'POST', body: '{}' })).status).toBe(400);
    expect((await b.fetch('../board/prospect/save', { method: 'POST', body: 'x' })).status).toBe(400);
    expect((await b.fetch('../board/prospect/save', { method: 'GET' })).status).toBe(405);
    await b.api.updateProspect(2, { remark: 'X-EXTRA-FAIL' });
    const bad = await b.fetch('../board/prospect/save', { method: 'POST', body: JSON.stringify({ prospectId: 2, extraInfo: { sunProspectInfo: { csVip: 'Y' } } }) });
    expect(bad.status).toBe(502);
    expect(await bad.json()).toMatchObject({ ok: false, via: 'api' });
  });

  it('the employees, the documents and the files are the Prospects mock\'s', async () => {
    const b = backend();
    expect((await b.fetch('../board/employees')).ok).toBe(true);
    const docs = await (await b.fetch('/board/prospect/attachments?prospectId=1')).json();
    expect(docs.result.length).toBeGreaterThan(0);
    expect((await b.fetch('/docproxy?url=' + encodeURIComponent(docs.result[0].attachFile))).status).toBeGreaterThanOrEqual(200);
  });

  it('initial: the accepted file types and the signed-in employee', async () => {
    const i = await backend().initial();
    expect(i.ssEmployeeId).toBe(MOCK_EMPLOYEE_ID);
    expect(i.uploadAcceptExt).toContain('.pdf');
  });

  it('what is saved is forgotten by resetMockProspectForm', async () => {
    const { api } = backend();
    await api.updateProspect(1, { name: 'ใหม่' });
    resetMockProspectForm();
    expect(currentMockDetail(1)!['name']).toBe('จิราพร แสงทอง');
  });
});

describe('the picture of the customer (mockup: kept in Storage/)', () => {
  const STORED = 'mockup-storage/0123456789abcdef/me.jpg';

  it('should show a picture that is in Storage/ on the list page too (the shared database holds its address)', async () => {
    const { api } = backend();
    await api.updateProspect(1, { name: 'A B', attachFile: STORED, downloadAttachFile: STORED });
    expect(prospectPatchOf(1)?.avatar).toMatch(/\/storage\/0123456789abcdef$/);
  });

  it('should not show an address the file server does not have (it would be a broken image)', async () => {
    const { api } = backend();
    await api.updateProspect(1, { name: 'A B', attachFile: 'prospect/1763600180000/me.jpg' });
    expect(prospectPatchOf(1)?.avatar).toBeUndefined();
  });

  it('should keep the address in the journal and drop the bytes once the picture is in Storage/', () => {
    const body = { name: 'A B', attachFile: STORED, attachFileBase64: 'QUJD' };
    const [slim] = withoutStoredBytes([body]) as Array<Record<string, unknown>>;
    expect(slim).toEqual({ name: 'A B', attachFile: STORED });
    expect(body.attachFileBase64).toBe('QUJD'); // the argument of the call is not changed
  });

  it('should leave a call alone when its picture is not in Storage/ (the bytes are all there is)', () => {
    const args = [1, { attachFile: 'prospect/1/me.jpg', attachFileBase64: 'QUJD' }];
    expect(withoutStoredBytes(args)).toEqual(args);
  });
});
