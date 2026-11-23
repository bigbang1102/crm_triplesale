import { beforeEach, describe, expect, it } from 'vitest';
import { SEED_PROSPECT_COUNT, seedProspect } from '@core/mock/crm-seed';
import type { SalesDocBackend } from './sales-doc-backend';
import { MOCK_MATERIALS, MOCK_OCCUPATIONS, createMockSalesDoc, mockAttachments, prospectAddress, resetMockSalesDoc } from './sales-doc.mock';

const backend = (fault = ''): SalesDocBackend => createMockSalesDoc({ delayMs: 0, fault });
const get = async (b: SalesDocBackend, url: string) => {
  const res = await b.fetch(url);
  return { status: res.status, body: await res.json() };
};
const post = async (b: SalesDocBackend, url: string, body: unknown, method = 'POST') => {
  const res = await b.fetch(url, { method, body: typeof body === 'string' ? body : JSON.stringify(body) });
  return { status: res.status, body: await res.json() };
};
/** the 14-character stand-in of a file (base64 of "x") */
const FILE = 'eA==';

describe('sales-doc mock backend — the answers of the servlets the Java forms call', () => {
  beforeEach(() => resetMockSalesDoc());

  describe('GET /board/prospect-list (the customer pick: ProspectListServlet → ProspectListService)', () => {
    it('pages the customers the way the pager asks (page / perPage → items + meta)', async () => {
      const b = backend();
      const first = await get(b, '/board/prospect-list?page=1&perPage=10&enrich=1&searchText=');
      expect(first.status).toBe(200);
      expect(first.body.status).toBe(200);
      expect(first.body.result.items).toHaveLength(10);
      expect(first.body.result.meta).toEqual({ page: 1, perPage: 10, total: SEED_PROSPECT_COUNT, totalPages: Math.ceil(SEED_PROSPECT_COUNT / 10) });
      const second = await get(b, '/board/prospect-list?page=2&perPage=10&enrich=1&searchText=');
      expect(second.body.result.items[0].id).toBe(11);
      // the last page is partial, one past it is empty (the pager stops there)
      const last = Math.ceil(SEED_PROSPECT_COUNT / 10);
      const tail = await get(b, `/board/prospect-list?page=${last}&perPage=10`);
      expect(tail.body.result.items).toHaveLength(SEED_PROSPECT_COUNT - (last - 1) * 10);
      const past = await get(b, `/board/prospect-list?page=${last + 1}&perPage=10`);
      expect(past.body.result.items).toEqual([]);
    });

    it('rows have the keys of ProspectListService.toRow — and no tax id (the servlet has none: the customer form asks for it)', async () => {
      const { body } = await get(backend(), '/board/prospect-list?page=1&perPage=1&enrich=1');
      const row = body.result.items[0];
      expect(Object.keys(row).sort()).toEqual(
        ['addr', 'agent', 'agentcode', 'avatar', 'code', 'country', 'countrycode', 'date', 'district', 'email', 'gender', 'id', 'name', 'phone', 'phonecc', 'province', 'recorder', 'source', 'team', 'type'].sort(),
      );
      expect(row.name).toBe(seedProspect(1).fullName);
      expect(row.addr).toBe(prospectAddress(1));
      expect(row).not.toHaveProperty('taxId');
    });

    it('searches code, name, phone, e-mail and address; the search is case-insensitive and keeps the total of the matches', async () => {
      const b = backend();
      const name = seedProspect(3).fullName;
      const byName = await get(b, `/board/prospect-list?page=1&perPage=50&searchText=${encodeURIComponent(name.toUpperCase())}`);
      expect(byName.body.result.items.map((r: { id: number }) => r.id)).toContain(3);
      expect(byName.body.result.meta.total).toBe(byName.body.result.items.length);
      const byCode = await get(b, `/board/prospect-list?page=1&perPage=50&searchText=${encodeURIComponent(seedProspect(5).code)}`);
      expect(byCode.body.result.items.map((r: { id: number }) => r.id)).toContain(5);
      const none = await get(b, '/board/prospect-list?page=1&perPage=10&searchText=zzzz-no-such-customer');
      expect(none.body.result.items).toEqual([]);
      expect(none.body.result.meta.total).toBe(0);
    });

    it('accepts the context path of the Java app', async () => {
      const { status, body } = await get(backend(), '/triplesale/board/prospect-list?page=1&perPage=2');
      expect(status).toBe(200);
      expect(body.result.items).toHaveLength(2);
    });

    it('faults: empty · 500 with a message · no answer at all', async () => {
      expect((await get(backend('prospects-empty'), '/board/prospect-list?page=1&perPage=10')).body.result.items).toEqual([]);
      const err = await get(backend('prospects-error'), '/board/prospect-list?page=1&perPage=10');
      expect(err.status).toBe(500);
      expect(err.body.message).toBeTruthy();
      await expect(backend('prospects-down').fetch('/board/prospect-list?page=1')).rejects.toThrow('Failed to fetch');
    });
  });

  describe('GET /rvapi?action=materials (the products of the item rows)', () => {
    it('answers { result: [{ code, name, salePrice }] } with the prices the rounding cases need', async () => {
      const { status, body } = await get(backend(), '/rvapi?action=materials');
      expect(status).toBe(200);
      expect(body.result).toHaveLength(MOCK_MATERIALS.length);
      for (const m of body.result) expect(Object.keys(m).sort()).toEqual(['code', 'name', 'salePrice']);
      const price = (c: string) => body.result.find((m: { code: string }) => m.code === c).salePrice;
      expect(price('ACC-A001')).toBe(1092.5); // 7 % of it is 76.475: the edge of the VAT rounding
      expect(price('FREE-GIFT')).toBe(0);
    });

    it('is the one action of /rvapi the forms use', async () => {
      const r = await get(backend(), '/rvapi?action=receipts');
      expect(r.status).toBe(400);
    });

    it('faults: empty · 500', async () => {
      expect((await get(backend('materials-empty'), '/rvapi?action=materials')).body.result).toEqual([]);
      expect((await get(backend('materials-error'), '/rvapi?action=materials')).status).toBe(500);
    });
  });

  describe('/board/prospect/attachments (ProspectAttachmentsServlet)', () => {
    const url = '/board/prospect/attachments';
    const upload = (b: SalesDocBackend, over: Record<string, unknown> = {}) => post(b, url, { prospectId: 7, fileContentBase64: FILE, fileName: 'ใบเสนอ.pdf', description: 'ใบเสนอ.pdf', ...over });

    it('POST keeps the file under the customer; GET lists what was attached with the number of the file (detailOrderNo)', async () => {
      const b = backend();
      expect((await get(b, `${url}?prospectId=7`)).body.result).toEqual([]);
      const first = await upload(b);
      expect(first.status).toBe(200);
      expect(first.body.verified).toBe(true);
      await upload(b, { fileName: 'รูป.png', description: 'หน้ารถ' });
      const list = await get(b, `${url}?prospectId=7`);
      expect(list.body.result.map((r: { detailOrderNo: number }) => r.detailOrderNo)).toEqual([1, 2]);
      expect(list.body.result[1].description).toBe('หน้ารถ');
      expect(list.body.result[0].attachFile).toBe('/files/prospects/7/1-' + encodeURIComponent('ใบเสนอ.pdf'));
      // another customer has none of it
      expect((await get(b, `${url}?prospectId=8`)).body.result).toEqual([]);
      expect(mockAttachments(7).map((a) => a.fileName)).toEqual(['ใบเสนอ.pdf', 'รูป.png']);
    });

    it('DELETE removes one file by customer + number', async () => {
      const b = backend();
      await upload(b);
      await upload(b, { fileName: 'b.pdf' });
      const del = await post(b, `${url}?prospectId=7&docNo=1`, '', 'DELETE');
      expect(del.status).toBe(200);
      expect(mockAttachments(7).map((a) => a.fileName)).toEqual(['b.pdf']);
      expect((await post(b, `${url}?prospectId=7`, '', 'DELETE')).status).toBe(400);
    });

    it('answers 400 for what the servlet refuses: no customer, no file, a file type that is not allowed, a body that is not JSON', async () => {
      const b = backend();
      expect((await upload(b, { prospectId: 0 })).status).toBe(400);
      expect((await upload(b, { fileContentBase64: '  ' })).status).toBe(400);
      const bad = await upload(b, { fileName: 'virus.exe' });
      expect(bad.status).toBe(400);
      expect(bad.body.message).toContain('.pdf');
      expect((await post(b, url, '{not json')).status).toBe(400);
      expect((await get(b, url)).status).toBe(400); // GET without prospectId
      expect(mockAttachments(7)).toEqual([]);
    });

    it('other methods are 405', async () => {
      expect((await post(backend(), url, {}, 'PUT')).status).toBe(405);
    });

    it('faults: 500 · stored but not verified · no answer · 400 · refused delete · the list does not have it · the list fails', async () => {
      const failed = await upload(backend('attach-fail'));
      expect(failed.status).toBe(500);
      expect(mockAttachments(7)).toEqual([]);
      const unverified = await upload(backend('attach-unverified'));
      expect(unverified.status).toBe(200);
      expect(unverified.body.verified).toBe(false);
      await expect(upload(backend('attach-down'))).rejects.toThrow('Failed to fetch');
      expect((await upload(backend('attach-bad'))).status).toBe(400);
      resetMockSalesDoc();
      await upload(backend());
      expect((await post(backend('attach-delete-fail'), `${url}?prospectId=7&docNo=1`, '', 'DELETE')).status).toBe(502);
      expect(mockAttachments(7)).toHaveLength(1);
      expect((await get(backend('attach-list-empty'), `${url}?prospectId=7`)).body.result).toEqual([]);
      expect((await get(backend('attach-list-error'), `${url}?prospectId=7`)).status).toBe(500);
    });

    it('resetMockSalesDoc starts clean', async () => {
      await upload(backend());
      resetMockSalesDoc();
      expect(mockAttachments(7)).toEqual([]);
    });
  });

  describe('GET /board/chat-master-data (the occupation of the customer pop-up)', () => {
    it('answers result.items for the occupations, a 400 for any other type', async () => {
      const ok = await get(backend(), '/board/chat-master-data?type=occupations');
      expect(ok.body.result.items).toHaveLength(MOCK_OCCUPATIONS.length);
      expect(ok.body.result.items[0]).toEqual({ code: 'OC01', name: 'Government officer', nameTh: 'ข้าราชการ' });
      // an occupation without a Thai name is in the list too (the page falls back to the English one)
      expect(ok.body.result.items.some((i: { nameTh: string }) => i.nameTh === '')).toBe(true);
      expect((await get(backend(), '/board/chat-master-data?type=branches')).status).toBe(400);
    });

    it('faults: empty · 500', async () => {
      expect((await get(backend('jobs-empty'), '/board/chat-master-data?type=occupations')).body.result.items).toEqual([]);
      expect((await get(backend('jobs-error'), '/board/chat-master-data?type=occupations')).status).toBe(500);
    });
  });

  describe('GET /resources/mock/auto_dealer_master.json (the file the auto-dealer forms fetch)', () => {
    it('is the master data of the war: vehicles, accessories, finance, insurance, terms, income / expense items, payees, banks, EDC', async () => {
      const { status, body } = await get(backend(), '/resources/mock/auto_dealer_master.json');
      expect(status).toBe(200);
      for (const k of ['vehicles', 'accessories', 'financeCompanies', 'insuranceCompanies', 'insuranceTypes', 'terms', 'incomeItems', 'expenseItems', 'payees', 'bankAccounts', 'cardTerminals']) {
        expect(Array.isArray(body[k]), k).toBe(true);
        expect(body[k].length, k).toBeGreaterThan(0);
      }
      // every car is one of its type · series · colour (the cascade of the vehicle table)
      for (const v of body.vehicles) expect(Object.keys(v)).toEqual(expect.arrayContaining(['code', 'vtype', 'series', 'color', 'model', 'cc', 'year', 'price']));
      expect(new Set(body.vehicles.map((v: { code: string }) => v.code)).size).toBe(body.vehicles.length);
    });

    it('faults: 404 · no answer', async () => {
      expect((await backend('master-error').fetch('/resources/mock/auto_dealer_master.json')).status).toBe(404);
      await expect(backend('master-down').fetch('/resources/mock/auto_dealer_master.json')).rejects.toThrow('Failed to fetch');
    });
  });

  it('answers a JSON 404 for any other address (a request the Java forms never make)', async () => {
    const r = await get(backend(), '/board/nothing');
    expect(r.status).toBe(404);
    expect(r.body.message).toContain('/board/nothing');
  });
});
