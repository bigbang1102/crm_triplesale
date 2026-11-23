import { beforeEach, describe, expect, it } from 'vitest';
import { SEED_PROSPECT_COUNT, seedProspect } from '@core/mock/crm-seed';
import type { ProspectRow, ProspectsBackend } from './prospects-backend';
import { UPLOAD_ACCEPT_EXT } from './prospects.constants';
import { ATTACH_TYPE_PROFILE, collapseHost, deleteProspectDoc, docKind, loadProspectDocs, toDocRow } from './prospects.docs';
import { leadPatchOf, resetSharedDb } from '@core/mock/shared-db';
import { createMockProspects, mockProspect, resetMockProspects } from './prospects.mock';

interface ListAnswer {
  status: number;
  message?: string;
  result: { items: ProspectRow[]; meta: { page?: number; perPage?: number; total?: number; totalPages?: number }; error?: boolean; errorStatus?: number };
}

describe('Prospects mock backend (the servlets of contracts.xhtml)', () => {
  let b: ProspectsBackend;
  beforeEach(() => {
    resetSharedDb();
    resetMockProspects();
    b = createMockProspects({ delayMs: 0 });
  });
  const get = async <T = any>(path: string): Promise<{ status: number; body: T; res: Response }> => {
    const res = await b.fetch(path);
    return { status: res.status, body: (await res.clone().json()) as T, res };
  };
  const list = async (query = ''): Promise<ListAnswer['result']> =>
    (await get<ListAnswer>(`/board/prospect-list?page=1${query.includes('perPage=') ? '' : '&perPage=20'}${query}`)).body.result;
  const post = async (path: string, body: unknown) => {
    const res = await b.fetch(path, { method: 'POST', body: JSON.stringify(body) });
    return { status: res.status, body: (await res.json()) as any };
  };

  it('gives the value the page rendered with EL: the accept of the file input', async () => {
    expect(await b.initial()).toEqual({ uploadAcceptExt: UPLOAD_ACCEPT_EXT });
    expect(UPLOAD_ACCEPT_EXT.split(',')).toEqual(expect.arrayContaining(['.pdf', '.docx', '.7z']));
    expect([...UPLOAD_ACCEPT_EXT.split(',')].sort().join(',')).toBe(UPLOAD_ACCEPT_EXT);
  });

  describe('GET /board/prospect-list', () => {
    it('answers { status, message, result: { items, meta } }: 20 rows of the 180 customers of the seed, 9 pages', async () => {
      const { body } = await get<ListAnswer>('/board/prospect-list?page=1&perPage=20&sortBy=date_desc');
      expect(body.status).toBe(200);
      expect(body.message).toBe('success');
      expect(body.result.items).toHaveLength(20);
      expect(body.result.meta).toEqual({ page: 1, perPage: 20, total: SEED_PROSPECT_COUNT, totalPages: 9 });
      expect(Object.keys(body.result.items[0])).toEqual([
        'id', 'code', 'name', 'date', 'source', 'phone', 'phonecc', 'countrycode', 'addr', 'province', 'district', 'subdistrict', 'country', 'agentcode', 'agent', 'team', 'recorder', 'owner', 'ownerid', 'avatar',
        'gender', 'type', 'email', 'line', 'fb', 'x', 'ig', 'availtime', 'availchannel',
      ]);
    });

    it('the rows are the customers of the other pages (name from seedProspect), dated dd/MM/yyyy, newest first', async () => {
      const { items } = await list('&sortBy=date_desc');
      for (const r of items) {
        const p = seedProspect(r.id);
        expect(r.name).toBe(p.fullName);
        expect(r.date).toBe(`${p.createdDate.slice(8, 10)}/${p.createdDate.slice(5, 7)}/${p.createdDate.slice(0, 4)}`);
      }
      const iso = items.map((r) => r.date.split('/').reverse().join('-'));
      expect([...iso].sort().reverse()).toEqual(iso);
    });

    it('carries only what the REAL list carries: no customer code, gender, type, e-mail, socials — the page asks /prospect-enrich for them', async () => {
      const { items } = await list();
      for (const r of items) {
        expect(r.code).toBe('');
        for (const k of ['gender', 'type', 'email', 'line', 'fb', 'x', 'ig', 'availtime', 'availchannel'] as const) expect(r[k], k).toBe('');
        expect(r.addr).not.toBe('');
      }
    });

    it('pages: page 9 is the last full page, page 10 is empty; perPage is capped at 200', async () => {
      const p9 = (await get<ListAnswer>('/board/prospect-list?page=9&perPage=20')).body.result;
      expect(p9.items).toHaveLength(20);
      expect((await get<ListAnswer>('/board/prospect-list?page=10&perPage=20')).body.result.items).toEqual([]);
      const big = (await get<ListAnswer>('/board/prospect-list?page=1&perPage=500')).body.result;
      expect(big.items).toHaveLength(180);
      expect(big.meta.perPage).toBe(200);
      const ids = (await get<ListAnswer>('/board/prospect-list?page=1&perPage=200')).body.result.items.map((r) => r.id);
      expect(new Set(ids).size).toBe(180);
    });

    it('sorts by date (both ways) and by name (Thai order, both ways)', async () => {
      const asc = (await list('&sortBy=date_asc')).items.map((r) => r.date.split('/').reverse().join('-'));
      expect([...asc].sort()).toEqual(asc);
      const names = (await list('&sortBy=name_asc')).items.map((r) => r.name);
      expect([...names].sort((a, c) => a.localeCompare(c, 'th'))).toEqual(names);
      const desc = (await list('&sortBy=name_desc')).items.map((r) => r.name);
      expect([...desc].sort((a, c) => c.localeCompare(a, 'th'))).toEqual(desc);
    });

    it('searches name, code, phone and e-mail (any case); nothing found = an empty list', async () => {
      const hit = await list('&searchText=P00009');
      expect(hit.items.map((r) => r.id)).toEqual([9]);
      const byName = await list(`&searchText=${encodeURIComponent(seedProspect(33).firstName.toLowerCase())}`);
      expect(byName.items.some((r) => r.id === 33)).toBe(true);
      expect((await list('&searchText=customer17%40')).items.map((r) => r.id)).toEqual([17]);
      expect((await list('&searchText=zzzz')).items).toEqual([]);
      expect((await list('&searchText=zzzz')).meta.total).toBe(0);
    });

    it('filters by source (several ids), province, district and sale person — and the filters add up', async () => {
      const channels = (await get<any>('/board/chat-master-data?type=marketing-channels')).body.result as { id: number; name: string }[];
      const one = await list(`&marketingChannelIds=${channels[0].id}&perPage=200`);
      expect(one.items.length).toBeGreaterThan(0);
      expect(one.items.every((r) => r.source === channels[0].name)).toBe(true);
      const two = await list(`&marketingChannelIds=${channels[0].id},${channels[1].id}&perPage=200`);
      expect(two.items.length).toBeGreaterThan(one.items.length);
      expect(two.items.every((r) => [channels[0].name, channels[1].name].includes(r.source))).toBe(true);

      const provinces = (await get<any[]>('/board/provinces')).body;
      const bkk = provinces.find((p) => p.name === 'กรุงเทพมหานคร');
      const inBkk = await list(`&currentCityId=${bkk.id}&perPage=200`);
      expect(inBkk.items.length).toBeGreaterThan(0);
      expect(inBkk.items.every((r) => r.province === 'กรุงเทพมหานคร' || r.country !== 'ไทย')).toBe(true);
      const districts = (await get<any[]>(`/board/districts?provinceId=${bkk.id}`)).body;
      const inDistrict = await list(`&currentCityId=${bkk.id}&currentDistrictId=${districts[0].id}&perPage=200`);
      expect(inDistrict.items.length).toBeGreaterThan(0);
      expect(inDistrict.items.length).toBeLessThan(inBkk.items.length);
      expect(inDistrict.items.every((r) => r.district === districts[0].name)).toBe(true);

      const sales = (await get<any[]>('/board/sale-persons')).body;
      const bySale = await list(`&salePersonId=${sales[1].id}&perPage=200`);
      expect(bySale.items.length).toBeGreaterThan(0);
      expect(bySale.items.every((r) => r.agentcode === sales[1].code && r.agent === sales[1].name)).toBe(true);
      const both = await list(`&salePersonId=${sales[1].id}&marketingChannelIds=${channels[0].id}&perPage=200`);
      expect(both.items.length).toBeLessThanOrEqual(bySale.items.length);
    });

    it('writes the country by the language: a foreign address in Thai or English; Thai addresses "ไทย" / "Thailand"; the phone shows "-" when empty', async () => {
      const th = (await get<ListAnswer>('/board/prospect-list?page=1&perPage=200&searchText=P00009')).body.result.items[0];
      const en = (await createMockProspects({ delayMs: 0, lang: 'en' }).fetch('/board/prospect-list?page=1&perPage=200&searchText=P00009').then((r) => r.json())) as ListAnswer;
      expect(th.country).not.toBe(en.result.items[0].country);
      expect(/^[A-Za-z ]+$/.test(en.result.items[0].country)).toBe(true);
      const thai = (await list('&searchText=P00001')).items[0];
      expect(thai.country).toBe('ไทย');
      const noPhone = (await list('&searchText=P00017')).items[0];
      expect(noPhone.phone).toBe('-');
    });

    it('the suggestion list (enrich=1) has complete rows', async () => {
      const r = (await get<ListAnswer>('/board/prospect-list?page=1&perPage=8&enrich=1&searchText=P0000')).body.result.items;
      expect(r.length).toBeGreaterThan(0);
      for (const row of r) {
        expect(row.code).toMatch(/^P\d{5}$/);
        expect(row.email).not.toBe('');
      }
    });

    it('is the same on every call and every instance (fixed seed)', async () => {
      const a = await (await b.fetch('/board/prospect-list?page=2&perPage=20&sortBy=name_asc')).text();
      const c = await (await createMockProspects({ delayMs: 0 }).fetch('/board/prospect-list?page=2&perPage=20&sortBy=name_asc')).text();
      expect(a).toBe(c);
    });

    it('the hooks: errors of the servlet and of the service, empty, complete rows, no meta, rows that cannot be enriched', async () => {
      const e500 = await get<any>('/board/prospect-list?searchText=X-ERR-500');
      expect(e500.status).toBe(500);
      expect(e500.body).toEqual({ status: 500, message: 'โหลดรายชื่อลูกค้าไม่สำเร็จ' });
      for (const code of [403, 404, 502, 0]) {
        const r = await get<ListAnswer>(`/board/prospect-list?searchText=X-ERR-${code}`);
        expect(r.status).toBe(200);
        expect(r.body.result).toMatchObject({ items: [], error: true, errorStatus: code });
      }
      expect((await list('&searchText=X-EMPTY')).items).toEqual([]);
      const full = await list('&searchText=X-FULL');
      expect(full.items).toHaveLength(20);
      expect(full.items.every((r) => r.code && r.email)).toBe(true);
      const noMeta = (await get<ListAnswer>('/board/prospect-list?page=2&perPage=20&searchText=X-NOMETA')).body.result;
      expect(noMeta.items).toHaveLength(5);
      expect(noMeta.meta).toMatchObject({ total: -1, totalPages: -1 });
      const broken = await list('&searchText=X-ENRICH-FAIL');
      expect(broken.items.map((r) => r.id)).toEqual([901, 902, 903]);
    });

    it('X-SLOW answers after 3 seconds (the skeleton stays on screen)', async () => {
      const slow = createMockProspects({ delayMs: 0 });
      const t0 = Date.now();
      await slow.fetch('/board/prospect-list?searchText=X-SLOW');
      expect(Date.now() - t0).toBeGreaterThanOrEqual(2900);
    }, 6000);
  });

  describe('GET /board/prospect-enrich', () => {
    it('gives the fields the list lacks, by id: code, gender, type, e-mail, socials, address …', async () => {
      const { body } = await get<{ status: number; result: Record<string, any> }>('/board/prospect-enrich?ids=1,2,3');
      expect(Object.keys(body.result)).toEqual(['1', '2', '3']);
      const one = body.result['1'];
      expect(one).toMatchObject({ code: 'P00001', email: 'customer1@example.com' });
      expect(['ชาย', 'หญิง']).toContain(one.gender);
      expect(['องค์กร', 'บุคคลธรรมดา']).toContain(one.type);
      // quick-view has no contactBackName: the contact channel stays empty
      expect(one.availchannel).toBe('');
      expect(Object.keys(one).sort()).toEqual(
        ['addr', 'agent', 'agentcode', 'availchannel', 'availtime', 'code', 'country', 'district', 'email', 'fb', 'gender', 'ig', 'line', 'owner', 'ownerid', 'province', 'recorder', 'subdistrict', 'team', 'type', 'x'].sort(),
      );
    });

    it('skips unknown ids, answers {} for none, and fails (500) for the ids of the broken customers', async () => {
      expect((await get<any>('/board/prospect-enrich?ids=500,abc')).body.result).toEqual({});
      expect((await get<any>('/board/prospect-enrich?ids=')).body.result).toEqual({});
      const bad = await get<any>('/board/prospect-enrich?ids=1,901');
      expect(bad.status).toBe(500);
      expect(bad.body).toEqual({ status: 500, message: 'โหลดรายละเอียดลูกค้าไม่สำเร็จ' });
    });

    it('takes at most 200 ids', async () => {
      const ids = Array.from({ length: 300 }, (_, i) => i + 1).join(',');
      const r = (await get<any>(`/board/prospect-enrich?ids=${ids}`)).body.result;
      expect(Object.keys(r)).toHaveLength(180);
    });
  });

  describe('the master data of the filter and of the create-lead modal', () => {
    it('marketing channels: 12 by default (the source filter then shows its search box), fewer on demand', async () => {
      const ch = (await get<any>('/board/chat-master-data?type=marketing-channels')).body;
      expect(ch.result).toHaveLength(12);
      expect(Object.keys(ch.result[0])).toEqual(['id', 'code', 'name']);
      const few = createMockProspects({ delayMs: 0, channels: 8 });
      expect(((await (await few.fetch('/board/chat-master-data?type=marketing-channels')).json()) as any).result).toHaveLength(8);
      expect((await get('/board/chat-master-data?type=nope')).status).toBe(400);
    });

    it('provinces (an array) and their districts: Bangkok has "เขต…" districts, the others a few of their own', async () => {
      const provinces = (await get<any[]>('/board/provinces')).body;
      expect(provinces.length).toBeGreaterThanOrEqual(20);
      expect(new Set(provinces.map((p) => p.id)).size).toBe(provinces.length);
      expect(Object.keys(provinces[0])).toEqual(['id', 'code', 'name', 'nameTh']);
      const bkk = provinces.find((p) => p.name === 'กรุงเทพมหานคร');
      expect((await get<any[]>(`/board/districts?provinceId=${bkk.id}`)).body.every((d: { name: string }) => d.name.startsWith('เขต'))).toBe(true);
      expect((await get<any[]>(`/board/districts?provinceId=${provinces[10].id}`)).body).toHaveLength(4);
      expect((await get<any[]>('/board/districts?provinceId=1')).body).toEqual([]);
      expect((await get<any[]>('/board/districts')).body).toEqual([]);
    });

    it('sale persons carry their employee; employees include the signed-in demo account (the default owner)', async () => {
      const sp = (await get<any[]>('/board/sale-persons')).body;
      expect(sp).toHaveLength(8);
      expect(sp[0]).toMatchObject({ id: 200, code: 'GGW-001', employee: { id: 101, code: 'E101' } });
      const emps = (await get<any[]>('/board/employees')).body;
      expect(emps.find((e) => e.id === 1001)).toBeTruthy();
    });

    it('products (movement types) with usesWorkflowStep, in English on demand; their step groups; the people of a group', async () => {
      const th = (await get<any[]>('/board/movement-types')).body;
      expect(th).toHaveLength(5);
      expect(th[0]).toMatchObject({ code: 'LD-WFS-A', usesWorkflowStep: true });
      const en = (await createMockProspects({ delayMs: 0, lang: 'en' }).fetch('/board/movement-types').then((r) => r.json())) as any[];
      expect(en[0].name).not.toBe(th[0].name);
      const groups = (await get<any>(`/board/master/activity-groups?movementTypeId=${th[0].id}`)).body.result;
      expect(groups).toHaveLength(7);
      expect((await get<any>(`/board/master/activity-groups?movementTypeId=${th[3].id}`)).body.result).toEqual([]);
      expect((await get<any>('/board/master/activity-groups')).status).toBe(400);
      const people = (await get<any>('/board/master/employees-by-activity-group?activityGroupId=101')).body.result;
      expect(people.map((p: { id: number }) => p.id)).toEqual([1001, 101, 102, 103, 104]);
      expect((await get<any>('/board/master/employees-by-activity-group?activityGroupId=105')).body.result).toHaveLength(1);
    });
  });

  describe('POST /board/lead-create', () => {
    it('requires prospectId and movementTypeId (400, the message of the servlet)', async () => {
      const r = await post('/board/lead-create', { prospectId: 0, movementTypeId: 0 });
      expect(r.status).toBe(400);
      expect(r.body).toEqual({ status: 400, message: 'prospectId และ movementTypeId จำเป็น' });
    });

    it('creates a lead: 201 with the lead id and tx number; the owner flag only when an owner was asked for', async () => {
      const ok = await post('/board/lead-create', { prospectId: 5, movementTypeId: 1004400743, procedureGroupId: 0, assignToId: 0, employeeId: 0 });
      expect(ok.status).toBe(200);
      expect(ok.body).toMatchObject({ status: 201, message: 'Created', result: { id: 200_543 } }); // one lead per customer and product: 200000 + customer * 100 + product % 100
      expect('ownerAssigned' in ok.body).toBe(false);
      expect((await post('/board/lead-create', { prospectId: 5, movementTypeId: 1004400743, employeeId: 102 })).body.ownerAssigned).toBe(true);
      const failed = (await post('/board/lead-create', { prospectId: 5, movementTypeId: 1004400743, employeeId: 108 })).body;
      expect(failed.ownerAssigned).toBe(false);
      expect(failed.ownerAssignMessage).toBeTruthy();
    });

    it('the products that fail on purpose: a validation error with details (status 400 inside a 200), an HTTP 500', async () => {
      const v = await post('/board/lead-create', { prospectId: 5, movementTypeId: 1004400741 });
      expect(v.status).toBe(200);
      expect(v.body).toMatchObject({ status: 400, message: 'Validation error', error: { details: expect.anything() } });
      const e = await post('/board/lead-create', { prospectId: 5, movementTypeId: 1004400744 });
      expect(e.status).toBe(500);
    });
  });

  describe('the responsible person (the one the user chose is the one every page shows)', () => {
    const ownerName = (id: number) => mockProspect(id)?.sale?.name;

    /** anybody of the list but the current owner: `r-<n>` is the n-th person of the cast */
    const others = (id: number) => (['r-0', 'r-1', 'r-2', 'r-3', 'r-4', 'r-5', 'r-6', 'r-7'] as const).map((ref, i) => ({ ref, name: ['สมชาย ใจดี', 'สุดา รักงาน', 'วิชัย มั่นคง', 'พิมพ์ใจ สุขสม', 'ธนากร เจริญผล', 'กมลชนก ศรีสุข', 'อนุชา พงษ์ศิริ', 'ปรียา แสงทอง'][i] })).filter((e) => e.name !== ownerName(id));

    it('should keep the person chosen in the side panel (POST /board/prospect-assign), as the owner the list shows', async () => {
      const target = others(7)[4]; // a person who has no right to receive customers is chosen on purpose: what the user picks is what is kept
      const r = await post('/board/prospect-assign', { prospectId: 7, destination: 'EMPLOYEE', responsibleEmployeeId: target.ref, expectedResponsibleId: null, reason: null });
      expect(r.body).toMatchObject({ status: 200 });
      expect(ownerName(7)).toBe(target.name);
      const row = (await list('&searchText=' + encodeURIComponent(mockProspect(7)!.code))).items[0];
      expect(row.agent).toBe(target.name);
    });

    it('should give the owner of a customer as the responsible person and its option id, not the one who recorded it', async () => {
      const sale = mockProspect(7)!.sale!;
      const { body } = await get<{ result: Record<string, { owner: string; ownerid: string; agent: string }> }>('/board/prospect-enrich?ids=7');
      expect(body.result['7']).toMatchObject({ owner: sale.name, agent: sale.name });
      expect(body.result['7'].ownerid).toMatch(/^r-\d$/);
    });

    it('should refuse a person it does not know with a 422, and change nothing', async () => {
      const before = ownerName(7);
      const r = await post('/board/prospect-assign', { prospectId: 7, destination: 'EMPLOYEE', responsibleEmployeeId: 'r-99' });
      expect(r.status).toBe(422);
      expect(r.body.error.code).toBe('RESPONSIBLE_INVALID');
      expect(ownerName(7)).toBe(before);
    });

    it('should give a customer released with a person to that person', async () => {
      const [target] = others(8);
      await post('/board/prospect-status-change', { prospectId: 8, targetStatus: 'RELEASE', assignment: { destination: 'EMPLOYEE', responsibleEmployeeId: target.ref } });
      expect(ownerName(8)).toBe(target.name);
    });

    it('should open a lead for the customer, kept with the owner chosen, when an opportunity is created', async () => {
      const r = await post('/board/lead-create', { prospectId: 9, movementTypeId: 1004400743, assignToId: 0, employeeId: 'r-6' });
      expect(r.body).toMatchObject({ status: 201, ownerAssigned: true });
      expect(leadPatchOf(r.body.result.id)).toMatchObject({ prospectId: 9, status: 'ACTIVE', ownerCode: 'E107' });
    });

    it('should create the opportunity for a sales line of the new options (`sl-<n>`), owned by the person chosen or else by the sale person', async () => {
      const chosen = await post('/board/lead-create', { prospectId: 10, movementTypeId: 'sl-1', assignToId: '202', employeeId: 'r-3' });
      expect(chosen.body).toMatchObject({ status: 201, ownerAssigned: true });
      expect(leadPatchOf(chosen.body.result.id)).toMatchObject({ prospectId: 10, ownerCode: 'E104' });
      const bySale = await post('/board/lead-create', { prospectId: 11, movementTypeId: 'sl-2', assignToId: '202', employeeId: '' });
      expect(leadPatchOf(bySale.body.result.id)?.ownerCode).toBe('E103');
      expect((await post('/board/lead-create', { prospectId: 11, movementTypeId: '' })).body.status).toBe(400);
    });

    it('should open the same lead again for the same customer and product (no second one), and not give the owner it refuses', async () => {
      const a = await post('/board/lead-create', { prospectId: 9, movementTypeId: 1004400743, employeeId: 'r-7' });
      const c = await post('/board/lead-create', { prospectId: 9, movementTypeId: 1004400743, employeeId: 'r-7' });
      expect(c.body.result.id).toBe(a.body.result.id);
      expect(a.body.ownerAssigned).toBe(false); // E108 is the one the mock fails for
      expect(leadPatchOf(a.body.result.id)?.ownerCode).toBeUndefined();
    });
  });

  describe('/board/prospect/attachments and the document list of ContractView', () => {
    it('lists the documents (oldest first, the profile picture in the same table); only a third of the customers have any', async () => {
      const all = (await get<any>('/board/prospect/attachments?prospectId=7')).body.result as Array<{ attachFileTypeCode: string; detailOrderNo: number }>;
      expect(all.length).toBe(1 + 5);
      expect(all.filter((a) => a.attachFileTypeCode === ATTACH_TYPE_PROFILE)).toHaveLength(1);
      expect((await get<any>('/board/prospect/attachments?prospectId=2')).body.result).toEqual([]);
      expect((await get<any>('/board/prospect/attachments')).status).toBe(400);
    });

    it('loadProspectDocs: the profile picture is not a document, the rows are toDocRow, newest first', async () => {
      const docs = await loadProspectDocs((i, n) => b.fetch(i, n), 7);
      expect(docs).toHaveLength(5);
      expect(docs.map((d) => d.typecode)).toEqual(['DOC', 'DOC', 'DOC', 'DOC', 'DOC']);
      expect(docs[0]).toEqual(expect.objectContaining({ no: expect.stringMatching(/^\d+$/), attachfile: expect.stringMatching(/^prospect\/\d+\/.+/), kind: expect.any(String) }));
      expect(Number(docs[0].no)).toBeGreaterThan(Number(docs[4].no));
      expect(docs.map((d) => d.kind).sort()).toEqual(['excel', 'excel', 'file', 'pdf', 'word']);
      expect(await loadProspectDocs((i, n) => b.fetch(i, n), 0)).toEqual([]);
    });

    it('upload adds a document with the next number; the name decides what is accepted (extension, FAIL, UNVERIFIED)', async () => {
      const f = (i: string, n?: RequestInit) => b.fetch(i, n);
      const up = (fileName: string) => post('/board/prospect/attachments', { prospectId: 2, fileContentBase64: 'data:application/pdf;base64,AAAA', fileName, description: fileName });
      const ok = await up('รายงาน.pdf');
      expect(ok.body).toMatchObject({ status: 200, verified: true, message: 'success', result: { attachFile: expect.stringMatching(/รายงาน\.pdf$/) } });
      expect((await loadProspectDocs(f, 2)).map((d) => d.filename)).toEqual(['รายงาน.pdf']);
      const bad = await up('virus.exe');
      expect(bad.status).toBe(400);
      expect(bad.body.message).toContain('ไม่รองรับไฟล์ประเภทนี้');
      expect((await up('FAIL.pdf')).status).toBe(500);
      const unverified = await up('UNVERIFIED.pdf');
      expect(unverified.body).toMatchObject({ status: 200, verified: false });
      expect(unverified.body).toMatchObject({ verifyReason: 'HTTP_404' });
      expect(unverified.body.message).toContain('ไม่พบไฟล์ที่ file server หลังอัปโหลด');
      expect(unverified.body.message.endsWith('[HTTP_404]')).toBe(true);
      expect((await post('/board/prospect/attachments', { prospectId: 0, fileContentBase64: '' })).status).toBe(400);
    });

    it('delete removes one document and lists what is left; an unknown number is 404 and the list stays', async () => {
      const f = (i: string, n?: RequestInit) => b.fetch(i, n);
      const before = await loadProspectDocs(f, 4);
      expect(before).toHaveLength(2);
      const after = await deleteProspectDoc(f, 4, before[0].no);
      expect(after.map((d) => d.no)).toEqual([before[1].no]);
      expect((await b.fetch('/board/prospect/attachments?prospectId=4&docNo=9999', { method: 'DELETE' })).status).toBe(404);
      expect((await deleteProspectDoc(f, 4, '9999')).map((d) => d.no)).toEqual([before[1].no]);
      expect((await b.fetch('/board/prospect/attachments?prospectId=4', { method: 'DELETE' })).status).toBe(400);
    });

    it('resetMockProspects forgets uploads, deletes and created leads', async () => {
      const f = (i: string, n?: RequestInit) => b.fetch(i, n);
      await deleteProspectDoc(f, 4, (await loadProspectDocs(f, 4))[0].no);
      expect(await loadProspectDocs(f, 4)).toHaveLength(1);
      resetMockProspects();
      expect(await loadProspectDocs(f, 4)).toHaveLength(2);
    });

    it('toDocRow / docKind / collapseHost are the helpers of ContractView', () => {
      expect(docKind('a.JPG')).toBe('image');
      expect(docKind('a.pdf')).toBe('pdf');
      expect(docKind('a.docx')).toBe('word');
      expect(docKind('a.csv')).toBe('excel');
      expect(docKind('a.zip')).toBe('file');
      expect(docKind(null)).toBe('file');
      expect(collapseHost('http://h/http://h/a/b.jpg')).toBe('http://h/a/b.jpg');
      expect(collapseHost('a/b.jpg')).toBe('a/b.jpg');
      expect(toDocRow({ detailOrderNo: 3, attachFile: 'http://h/http://h/x/y.pdf', description: 'd', attachFileTypeCode: 'DOC' })).toEqual({
        no: '3', attachfile: 'http://h/x/y.pdf', description: 'd', typecode: 'DOC', kind: 'pdf', filename: 'y.pdf',
      });
    });
  });

  describe('/docproxy', () => {
    it('serves a file by its extension: a PDF and images inline, anything else as a download', async () => {
      const pdf = await b.fetch('/docproxy?url=' + encodeURIComponent('prospect/1/a.pdf'));
      expect(pdf.headers.get('content-type')).toBe('application/pdf');
      expect(pdf.headers.get('content-disposition')).toBe('inline');
      expect(new TextDecoder().decode((await pdf.arrayBuffer()).slice(0, 5))).toBe('%PDF-');
      expect((await b.fetch('/docproxy?url=' + encodeURIComponent('x/y.png'))).headers.get('content-type')).toBe('image/png');
      const zip = await b.fetch('/docproxy?url=' + encodeURIComponent('x/ข้อมูล.zip'));
      expect(zip.headers.get('content-type')).toBe('application/octet-stream');
      expect(zip.headers.get('content-disposition')).toContain("attachment; filename*=UTF-8''");
    });

    it('says why when it cannot: 502 UPSTREAM_404 in X-DocProxy-Reason for a missing file, 400 MISSING_URL', async () => {
      const missing = await b.fetch('/docproxy?url=' + encodeURIComponent('prospect/1/missing.pdf'));
      expect(missing.status).toBe(502);
      expect(missing.headers.get('x-docproxy-reason')).toBe('UPSTREAM_404');
      const none = await b.fetch('/docproxy');
      expect(none.status).toBe(400);
      expect(none.headers.get('x-docproxy-reason')).toBe('MISSING_URL');
    });
  });

  it('an unknown path is 404, and a request can be aborted', async () => {
    expect((await b.fetch('/board/nothing')).status).toBe(404);
    const slow = createMockProspects({ delayMs: 200 });
    const ctl = new AbortController();
    const pending = slow.fetch('/board/provinces', { signal: ctl.signal });
    ctl.abort();
    await expect(pending).rejects.toMatchObject({ name: 'AbortError' });
  });
});
