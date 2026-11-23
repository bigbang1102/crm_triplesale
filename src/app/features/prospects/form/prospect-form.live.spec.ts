import { beforeEach, describe, expect, it } from 'vitest';
import { clearOptionCache } from '@core/live/options-cache';
import { type FakeAnswer, type FakeCall, fakeRest } from '@core/live/rest-fake';
import { ProspectFormView, ProspectSession } from './prospect-form.bean';
import { createLiveProspectFormApi, createLiveProspectFormBackend } from './prospect-form.live';
import { ProspectFormService } from './prospect-form.service';

const ok = (result: unknown): string => JSON.stringify({ status: 200, message: 'success', result });

// the lists of the dropdowns are kept in sessionStorage for the session: every test starts without them
beforeEach(() => {
  sessionStorage.clear();
  clearOptionCache();
});

describe('the REST calls of the form', () => {
  it('GET /prospects/{id}: the id is encoded; the body of a 200 only', async () => {
    const { deps, calls } = fakeRest((c) => (c.path.includes('missing') ? { status: 404, text: '{"status":404}' } : ok({ id: 17 })));
    const api = createLiveProspectFormApi(deps);
    expect(await api.prospect(' 17 ')).toBe(ok({ id: 17 }));
    expect(await api.prospect('missing')).toBe('');
    await api.prospect('a b/c');
    const q = '?sections=BASE%2CSOCIAL%2CATTACHMENTS%2COPPORTUNITIES'; // the documents come with the record: there is no list of attachments of its own
    expect(calls.map((c) => [c.method, c.path])).toEqual([['GET', `/prospects/17${q}`], ['GET', `/prospects/missing${q}`], ['GET', `/prospects/a%20b%2Fc${q}`]]);
    expect(calls[0].headers).toMatchObject({ Accept: 'application/json' });
  });

  it('the lists of the dropdowns are GET /prospects/options?sets=... (no /master-data/...): the countries keep the Thai names of the dictionary; the others as the service gave them', async () => {
    const { deps, calls } = fakeRest((c) => (c.path.includes('countries') ? ok({ countries: [{ id: 'c1', code: 'THA', name: 'Thailand', nameTh: 'ไทย (service)' }] }) : ok({ provinces: [{ id: 'p1', code: 'BKK', name: 'x', nameTh: 'ไทย (service)' }] })), { master: { th: { THA: 'ไทย (พจนานุกรม)' } } });
    const api = createLiveProspectFormApi(deps);
    const countries = JSON.parse(await api.masterData('countries?page=1&pageSize=1000')) as { result: Array<{ nameTh: string }> };
    expect(countries.result[0].nameTh).toBe('ไทย (พจนานุกรม)');
    const provinces = JSON.parse(await api.masterData('provinces?page=1&pageSize=3000')) as { result: Array<{ nameTh: string; id: string }> };
    expect(provinces.result[0]).toMatchObject({ nameTh: 'ไทย (service)', id: 'p1' });
    expect(calls.map((c) => c.path)).toEqual(['/prospects/options?sets=countries', '/prospects/options?sets=provinces']);
    // kept for the session: asked again, no call
    await api.masterData('countries?page=1&pageSize=1000');
    expect(calls).toHaveLength(2);
  });

  it('every list of the form has its set; the districts and sub-districts are narrowed by the uuid; movement-types stay on master-data', async () => {
    const { deps, calls } = fakeRest(() => ok({}));
    const api = createLiveProspectFormApi(deps);
    for (const path of ['occupations?page=1&pageSize=1000', 'business-types?page=1&pageSize=1000', 'marketing-channels?page=1&pageSize=1000', 'communication-types?page=1&pageSize=1000', 'sale-persons?page=1&pageSize=1000']) await api.masterData(path);
    await api.masterData('districts?provinceId=p1&page=1&pageSize=1000');
    await api.masterData('sub-districts?districtId=d1&page=1&pageSize=1000');
    expect(await api.masterData('districts?provinceId=&page=1&pageSize=1000')).toBe(''); // no province, no districts, no call
    await api.masterData('movement-types/LD');
    expect(calls.map((c) => c.path)).toEqual([
      '/prospects/options?sets=occupations',
      '/prospects/options?sets=businessTypes',
      '/prospects/options?sets=marketingChannels',
      '/prospects/options?sets=communicationTypes',
      '/prospects/options?sets=salePersons',
      '/prospects/options?sets=districts&provinceId=p1',
      '/prospects/options?sets=subdistricts&districtId=d1',
      '/master-data/movement-types/LD',
    ]);
  });

  it('a list that does not answer 2xx is an empty body (the list is then empty) and is not kept', async () => {
    const { deps, calls } = fakeRest(() => ({ status: 500, text: '{}' }));
    const api = createLiveProspectFormApi(deps);
    expect(await api.masterData('countries?page=1&pageSize=1000')).toBe('');
    expect(await api.masterData('countries?page=1&pageSize=1000')).toBe('');
    expect(calls).toHaveLength(2);
  });

  it('the metro file is the asset the metro servlet served; none is empty', async () => {
    expect(await createLiveProspectFormApi(fakeRest(() => '', { assets: { 'assets/data/metro-geo.json': '[{"dn":"x"}]' } }).deps).metroGeo()).toBe('[{"dn":"x"}]');
    expect(await createLiveProspectFormApi(fakeRest(() => '').deps).metroGeo()).toBe('');
  });

  it('POST /prospects · PUT /prospects/{id} · PUT …/extra-info: the body of the answer whatever its status, "" for no answer', async () => {
    const { deps, calls } = fakeRest((c) => (c.method === 'PUT' && c.path.endsWith('/extra-info') ? null : { status: 400, text: '{"status":400,"message":"bad"}' }));
    const api = createLiveProspectFormApi(deps);
    // (the create, POST /prospects, is closed for now: see CREATE_PROSPECT_OPEN and prospect-form.duplicate.spec.ts)
    expect(await api.updateProspect(5, { id: 5 })).toBe('{"status":400,"message":"bad"}');
    expect(await api.putExtraInfo(5, { sunProspectInfo: {} })).toBe('');
    expect(calls.map((c) => [c.method, c.path, c.body])).toEqual([
      ['PUT', '/prospects/5', { id: 5 }],
      ['PUT', '/prospects/5/extra-info', { sunProspectInfo: {} }],
    ]);
  });

  it('the documents: GET (200 only) · POST · DELETE …/attachments/{no}', async () => {
    const { deps, calls } = fakeRest((c) => (c.method === 'GET' ? ok([]) : { status: 201, text: '{"status":201}' }));
    const api = createLiveProspectFormApi(deps);
    expect(await api.prospectAttachments(7)).toBe('{"status":200,"result":[]}');
    expect(await api.addProspectAttachment(7, { fileName: 'a.jpg' })).toBe('{"status":201}');
    expect(await api.deleteProspectAttachment(7, 3)).toBe('{"status":201}');
    expect(calls.map((c) => [c.method, c.path])).toEqual([['GET', '/prospects/7?sections=ATTACHMENTS'], ['POST', '/prospects/7/attachments'], ['DELETE', '/prospects/7/attachments/3']]);
  });

  it('the leads: POST /leads · GET /leads?<query> · PATCH /leads/assign', async () => {
    const { deps, calls } = fakeRest(() => ok({}));
    const api = createLiveProspectFormApi(deps);
    await api.createLead({ prospectId: 1 });
    await api.findLeads('viewMode=list&sortBy=txdate_desc&page=1&perPage=50&movementTypeId=5');
    await api.assignLead({ leadId: 9, employeeId: 3 });
    expect(calls.map((c) => [c.method, c.path, c.body])).toEqual([
      ['POST', '/leads', { prospectId: 1 }],
      ['GET', '/leads?viewMode=list&sortBy=txdate_desc&page=1&perPage=50&movementTypeId=5', undefined],
      ['PATCH', '/leads/assign', { leadId: 9, employeeId: 3 }],
    ]);
  });
});

describe('the new service: GET /prospects/{id}?sections=BASE,SOCIAL,ATTACHMENTS,OPPORTUNITIES', () => {
  const v2 = {
    id: '01a1d32d-952b-7a6a-8e2c-1e4d75e13905',
    code: 'P001',
    name: 'Somchai',
    customerType: 'PERSON',
    sex: 'MALE',
    usageStatus: 'BLOCK',
    occupation: { id: 'o1', name: 'Teacher' },
    currentAddress: { subDistrict: { id: 's1', name: 'Suthep' }, district: { id: 'd1', name: 'Mueang' }, province: { id: 'p1', code: '50', name: 'Chiang Mai' }, country: { id: 'c1', code: 'THA', name: 'Thailand' }, postCode: '50200' },
    marketingChannel: { id: 'm1', code: 'FB', name: 'Facebook' },
    contactBack: { id: 'b1', name: 'Phone' },
    salePerson: { id: 'e1', code: 'E011', name: 'Somsri' },
    attachments: [
      { id: 'a-1', type: { id: 't1', name: 'ID card' }, description: 'copy of ID', createdAt: '2026-11-12T08:31:00.120Z', downloadUrl: '/api/v1/prospects/x/attachments/a-1' },
      { id: 'a-2', type: { id: 't2', name: 'Contract' }, description: '', createdAt: '2026-11-13T08:31:00Z', downloadUrl: '/api/v1/prospects/x/attachments/a-2' },
    ],
  };

  it('the record and its documents come from ONE call; the names are in the answer (no master list asked)', async () => {
    const { deps, calls } = fakeRest(() => ok(v2));
    const bean = new ProspectFormView(new ProspectFormService(createLiveProspectFormApi(deps)), { today: () => '2026-10-20', session: new ProspectSession(), masterLists: false });
    await bean.init({ action_type: 'view', id: v2.id });
    expect(calls.map((c) => c.path)).toEqual([`/prospects/${v2.id}?sections=BASE%2CSOCIAL%2CATTACHMENTS%2COPPORTUNITIES`]);
    expect(bean.contractBean).toMatchObject({
      customer_code: 'P001',
      customer_name: 'Somchai',
      customer_type: 'person',
      sex: 'ชาย',
      usagestatus: 'block',
      occupationname: 'Teacher',
      current_sub_district_name: 'Suthep',
      current_district_name: 'Mueang',
      current_city_code: '50',
      current_city_name: 'Chiang Mai',
      current_country_code: 'THA',
      current_country_name: 'Thailand',
      current_postid: '50200',
      marketingchanelcode: 'FB',
      marketingchanelname: 'Facebook',
      contact_backname: 'Phone',
      salepersoncode: 'E011',
      salepersonname: 'Somsri',
    });
    // newest first; no file name: the description (else the type) is shown, the download address is kept as the service gave it
    expect(bean.prospectDocs.map((d) => [d.no, d.filename, d.attachfile, d.typecode])).toEqual([
      ['a-2', 'Contract', '/api/v1/prospects/x/attachments/a-2', 'Contract'],
      ['a-1', 'copy of ID', '/api/v1/prospects/x/attachments/a-1', 'ID card'],
    ]);
  });

  it('with sections= the record is under result.base and the documents under result.attachments: the record is found', async () => {
    const { attachments, ...record } = v2;
    const { deps } = fakeRest(() => ok({ base: { ...record, responsibleEmployee: { id: 'e2', name: 'Somsri' }, waitlist: null }, attachments }));
    const bean = new ProspectFormView(new ProspectFormService(createLiveProspectFormApi(deps)), { today: () => '2026-10-20', session: new ProspectSession(), masterLists: false });
    await bean.init({ action_type: 'view', id: v2.id });
    expect(bean.contractBean).toMatchObject({ customer_code: 'P001', customer_name: 'Somchai', current_city_name: 'Chiang Mai', usagestatus: 'block' });
    expect(bean.prospectDocs.map((d) => d.no)).toEqual(['a-2', 'a-1']);
  });

  it('the documents may also come as result.attachments.items', async () => {
    const { deps } = fakeRest(() => ok({ base: { id: v2.id, code: 'P001' }, attachments: { items: v2.attachments } }));
    const api = createLiveProspectFormApi(deps);
    await api.prospect(v2.id);
    expect(JSON.parse(await api.prospectAttachments(v2.id)).result).toHaveLength(2);
  });

  it('the extra-info tab (/board/prospect?id=) uses the record the page has just read: one GET, flat keys; used once, and a save drops it', async () => {
    const { deps, calls } = fakeRest(() => ok({ base: { id: v2.id, code: 'P001', name: 'Somchai', currentAddress: v2.currentAddress }, attachments: [] }));
    const b = createLiveProspectFormBackend(deps);
    await b.api.prospect(v2.id);
    const first = (await (await b.fetch(`/board/prospect?id=${v2.id}`)).json()) as Record<string, unknown>;
    expect(calls).toHaveLength(1);
    expect(first).toMatchObject({ code: 'P001', name: 'Somchai', currentCityName: 'Chiang Mai' });
    expect(first).not.toHaveProperty('base');
    await b.fetch(`/board/prospect?id=${v2.id}`); // used once: the second read goes to the service
    expect(calls).toHaveLength(2);
    await b.api.prospect(v2.id);
    await b.api.updateProspect(v2.id, {});
    await b.fetch(`/board/prospect?id=${v2.id}`);
    // the record read again after the page's own read, then dropped by the PUT: this last read goes to the service
    expect(calls.filter((c) => c.method === 'GET')).toHaveLength(4);
  });

  it('a record of the TRASH is read from GET /prospects/trash/{id} (no sections), never from /prospects/{id}; its documents are what came with it, no call of their own', async () => {
    const { deps, calls } = fakeRest(() => ok({ base: { id: v2.id, code: 'P001', name: 'Somchai' }, attachments: v2.attachments }));
    const b = createLiveProspectFormBackend(deps, undefined, { trash: true });
    const bean = new ProspectFormView(new ProspectFormService(b.api), { today: () => '2026-10-20', session: new ProspectSession(), masterLists: false });
    await bean.init({ action_type: 'view', id: v2.id });
    expect(calls.map((c) => c.path)).toEqual([`/prospects/trash/${v2.id}`]);
    expect(bean.contractBean).toMatchObject({ customer_code: 'P001', customer_name: 'Somchai' });
    expect(bean.prospectDocs).toHaveLength(2);
    // a later read of the documents does not go to /prospects/{id}?sections=ATTACHMENTS (a 404 for the trash)
    expect(JSON.parse(await b.api.prospectAttachments(v2.id)).result).toHaveLength(0);
    expect(calls).toHaveLength(1);
  });

  it('a later read of the documents asks again (sections=ATTACHMENTS), the first one uses what came with the record', async () => {
    const { deps, calls } = fakeRest(() => ok(v2));
    const api = createLiveProspectFormApi(deps);
    await api.prospect(v2.id);
    expect(JSON.parse(await api.prospectAttachments(v2.id)).result).toHaveLength(2);
    expect(calls).toHaveLength(1);
    expect(JSON.parse(await api.prospectAttachments(v2.id)).result).toHaveLength(2);
    expect(calls.map((c) => c.path)).toEqual([`/prospects/${v2.id}?sections=BASE%2CSOCIAL%2CATTACHMENTS%2COPPORTUNITIES`, `/prospects/${v2.id}?sections=ATTACHMENTS`]);
  });
});

describe('the backend of the form on the live service', () => {
  it('initial: the accepted file types and the signed-in employee', async () => {
    const b = createLiveProspectFormBackend(fakeRest(() => '', { user: { employeeId: 1001 } }).deps);
    const i = await b.initial();
    expect(i.ssEmployeeId).toBe('1001');
    expect(i.uploadAcceptExt).toContain('.pdf');
    expect((await createLiveProspectFormBackend(fakeRest(() => '', { user: { employeeId: null } }).deps).initial()).ssEmployeeId).toBe('');
  });

  it('fetch answers the URLs of the page\'s scripts from the service: the prospect, the employees, the metro file', async () => {
    const { deps, calls } = fakeRest((c) => (c.path.startsWith('/prospects/17') ? ok({ id: 17, name: 'a' }) : c.path.startsWith('/prospects/options') ? ok({ responsibles: [{ id: 'e1', name: 'n' }] }) : null), {
      assets: { 'assets/data/metro-geo.json': '[]' },
    });
    const b = createLiveProspectFormBackend(deps);
    expect(await (await b.fetch('../board/prospect?id=17')).json()).toMatchObject({ id: 17 });
    expect((await (await b.fetch('/board/employees')).json()) as unknown[]).toHaveLength(1);
    expect(await (await b.fetch('/board/metro-geo')).text()).toBe('[]');
    // the owners are the options of the new service, not master-data/employees
    expect(calls.map((c) => c.path.replace(/\?.*$/, ''))).toEqual(['/prospects/17', '/prospects/options']);
  });
});

/** a scripted service for the whole form: a customer with a snapshot, the master data, and a log of what was written */
function scripted() {
  const writes: Array<{ method: string; path: string; body: unknown }> = [];
  const detail = { id: 17, code: 'P00017', name: 'สมชาย', customerTel: '081-234-5678', phoneCountryCode: '+66', customerType: 'person', sex: '1', country: 'THA', currentCityCode: 'BKK', currentCityId: 1, marketingChanelId: 12, createBy: 'x', attachFile: 'http://f/http://f/prospect/1/a.jpg' };
  const answer = (c: FakeCall): FakeAnswer => {
    // the duplicate check is a POST that writes nothing: it is not one of the writes the tests look at
    if (c.method !== 'GET' && !c.path.endsWith('/duplicate-checks')) writes.push({ method: c.method, path: c.path, body: c.body });
    if (c.method === 'PUT' && c.path === '/prospects/17') return ok({ id: 17 });
    if (c.method === 'PUT') return ok({});
    if (c.path.split('?')[0] === '/prospects/17') return ok(detail);
    if (c.path.startsWith('/prospects/options')) {
      // numeric ids as text: the record of this script is numeric too (a record of the new service has uuids and its names in it)
      const sets = new URLSearchParams(c.path.split('?')[1]).get('sets');
      if (sets === 'countries') return ok({ countries: [{ id: '1', code: 'THA', name: 'Thailand', nameTh: 'ไทย', phoneCountryCode: '+66', phoneNumberFormat: 'XX XXX XXXX' }] });
      if (sets === 'provinces') return ok({ provinces: [{ id: '1', code: 'BKK', name: 'กรุงเทพมหานคร' }] });
      if (sets === 'districts') return ok({ districts: [{ id: '11', code: 'BKK_01', name: 'เขตพระนคร' }] });
      if (sets === 'marketingChannels') return ok({ marketingChannels: [{ id: '12', code: 'MKC-001', name: 'Facebook' }] });
    }
    return ok([]);
  };
  return { answer, writes };
}

describe('the form on the live service (scripted)', () => {
  it('opens a customer in view mode: only the calls the view needs, in the order Java made them', async () => {
    const s = scripted();
    const { deps, calls } = fakeRest(s.answer);
    const bean = new ProspectFormView(new ProspectFormService(createLiveProspectFormApi(deps)), { today: () => '2026-10-20', session: new ProspectSession() });
    await bean.init({ action_type: 'view', id: '17' });
    expect(bean.contractBean).toMatchObject({ id: 17, customer_name: 'สมชาย', tel: '0812345678', marketingchanelcode: 'MKC-001', marketingchanelname: 'Facebook' });
    expect(bean.telDisplay).toBe('81-234-5678');
    expect(calls.map((c) => c.path.replace(/\?.*$/, ''))).toEqual([
      '/prospects/17', // the documents are in this answer (sections=BASE,SOCIAL,ATTACHMENTS,OPPORTUNITIES): no call of their own
      '/prospects/options',
      '/prospects/options',
      '/prospects/options',
      // (the document address has no province, so no district call; the countries are read once, for the phone code and the country default)
      '/prospects/options',
    ]);
    expect(calls.some((c) => c.method !== 'GET')).toBe(false);
  });

  it('the update PUTs the snapshot with the form written over it, then the extra info, and folds the doubled host of the picture', async () => {
    const s = scripted();
    const { deps, calls } = fakeRest(s.answer);
    const bean = new ProspectFormView(new ProspectFormService(createLiveProspectFormApi(deps)), { today: () => '2026-10-20', session: new ProspectSession() });
    await bean.init({ action_type: 'edit', id: '17' });
    bean.assign('#{contractView.contractBean.customer_name}', 'สมชาย ใหม่', 'text');
    await bean.textAlert('U');
    expect(bean.takeScripts()[0]).toContain('อัปเดต ลูกค้า เรียบร้อย');
    expect(calls.filter((c) => c.method === 'POST').map((c) => c.path)).toEqual(['/prospects/duplicate-checks']); // asked before the PUT
    expect(s.writes.map((w) => `${w.method} ${w.path}`)).toEqual(['PUT /prospects/17', 'PUT /prospects/17/extra-info']);
    expect(s.writes[0].body).toMatchObject({ id: 17, name: 'สมชาย ใหม่', customerTel: '0812345678', marketingChanelId: 12, currentCityId: 1, attachFile: 'prospect/1/a.jpg' });
    expect(s.writes[0].body).not.toHaveProperty('createBy');
    expect(s.writes[1].body).toEqual({ sunProspectInfo: { txDate: '2026-10-20', csDateTransOwnership: '2026-10-20' } });
  });

  it('a service that does not answer is a failure message, not an exception', async () => {
    const s = scripted();
    const { deps } = fakeRest((c) => (c.method === 'PUT' ? null : s.answer(c)));
    const bean = new ProspectFormView(new ProspectFormService(createLiveProspectFormApi(deps)), { today: () => '2026-10-20', session: new ProspectSession() });
    await bean.init({ action_type: 'edit', id: '17' });
    await bean.textAlert('U');
    expect(bean.takeScripts()[0]).toContain('ไม่มีการตอบกลับจากเซิร์ฟเวอร์');
  });
});
