import { describe, expect, it } from 'vitest';
import { MOCK_DOC_COUNTS, createMockBoardFetch, createMockSupportingDocs, mockDocId } from './supporting-doc.mock';
import { AttachStore, DOC_LIST_MAX_PAGES, SupportingDocService, blobToBase64, parseJson } from './supporting-doc.service';
import { SUPPORTING_DOC_TYPES, supportingDocType } from './supporting-doc-types';
import type { BasicItem } from './supporting-doc.logic';

const T = (n: number) => SUPPORTING_DOC_TYPES[n - 1];

function setup(style = '') {
  const mock = createMockSupportingDocs({ delayMs: 0, formTypeStyle: style });
  const svc = new SupportingDocService(mock.api, new AttachStore());
  return { mock, svc };
}

describe('SupportingDocService over the mock backend', () => {
  it('serves the first page, then the next ones, of a family of 53', async () => {
    const { svc, mock } = setup();
    const p1 = await svc.fetchPage(T(1), 1, 20);
    expect(p1).toMatchObject({ total: 53, page: 1, perPage: 20 });
    expect(p1.items).toHaveLength(20);
    // the real service lists the oldest first; the rows are the window of that order
    expect(p1.items[0].id).toBe(mockDocId(1, 1));
    expect((await svc.fetchPage(T(1), 3, 20)).items).toHaveLength(13);
    expect((await svc.fetchPage(T(1), 4, 20)).items).toHaveLength(0);
    expect(mock.calls[0]).toBe('GET /documents?formType=formintent&page=1&pageSize=20');
  });

  it('clamps the page and the page size like SalesDocumentListService', async () => {
    const { svc, mock } = setup();
    await svc.fetchPage(T(1), 0, 0);
    await svc.fetchPage(T(1), 2, 5000);
    expect(mock.calls).toEqual(['GET /documents?formType=formintent&page=1&pageSize=20', 'GET /documents?formType=formintent&page=2&pageSize=100']);
  });

  it('reads the old envelope (result.result[], snake_case) of the second family as the new one', async () => {
    const { svc } = setup();
    const p = await svc.fetchPage(T(2), 1, 20);
    expect(p.total).toBe(20);
    expect(p.items).toHaveLength(20);
    expect(p.items[0]).toMatchObject({ id: mockDocId(2, 1), quotationNo: 'CA-00001' });
    expect(p.items[0].customerName).not.toBe('');
  });

  it('an empty family and an unknown formType are an empty page, not an error', async () => {
    const { svc, mock } = setup();
    expect(await svc.fetchPage(T(4), 1, 20)).toMatchObject({ items: [], total: 0 });
    expect(await mock.api.documents('nope', 1, 20)).toBe('');
    expect((await svc.viewQueryDataAPI(T(4)))).toEqual([]);
  });

  it('sends the PascalCase formType when the style is "new"', async () => {
    const { svc, mock } = setup('new');
    await svc.fetchPage(T(7), 1, 20);
    expect(mock.calls[0]).toBe('GET /documents?formType=CreditApplication&page=1&pageSize=20');
  });

  it('viewQueryDataAPI reads every page and sorts the newest first', async () => {
    const { svc, mock } = setup();
    const all = await svc.viewQueryDataAPI(T(1));
    expect(all).toHaveLength(MOCK_DOC_COUNTS[1]);
    expect(all[0].id).toBe(mockDocId(1, 53));
    expect(all.map((r) => r.id)).toEqual([...all.map((r) => r.id)].sort((a, b) => b - a));
    expect(mock.calls).toEqual(['GET /documents?formType=formintent&page=1&pageSize=100']); // a short page is the last one
    expect(DOC_LIST_MAX_PAGES).toBe(50);
  });

  it('viewQueryDataAPI stops at a page that brings no new row', async () => {
    const { svc } = setup();
    let calls = 0;
    // a backend that ignores `page` and always sends the same full page
    const row = (id: number) => ({ id, txNo: `N${id}` });
    const stuck = new SupportingDocService({
      ...setup().mock.api,
      async documents() {
        calls++;
        return JSON.stringify({ status: 200, result: { items: Array.from({ length: 100 }, (_x, i) => row(i + 1)) } });
      },
    });
    expect((await stuck.viewQueryDataAPI(T(1))).length).toBe(100);
    expect(calls).toBe(2);
    void svc;
  });

  it('viewQueryDataAPI keeps what it read before a page that is not JSON', async () => {
    let n = 0;
    const svc = new SupportingDocService({
      ...setup().mock.api,
      async documents() {
        n++;
        return n === 1 ? JSON.stringify({ result: { items: Array.from({ length: 100 }, (_x, i) => ({ id: i + 1 })) } }) : '<html>';
      },
    });
    expect((await svc.viewQueryDataAPI(T(1))).length).toBe(100);
  });

  it('searches the customers: 0-based pages of 20, by code or name, nothing for a bigger page', async () => {
    const { svc, mock } = setup();
    const p0 = await svc.searchProspects('', 0);
    const p1 = await svc.searchProspects('', 1);
    expect(p0).toHaveLength(20);
    expect(p1[0].id).toBe(21);
    expect((await svc.searchProspects(' P00007 ', 0)).map((b) => b.code)).toEqual(['P00007']);
    expect((await svc.searchProspects('', -3)).length).toBe(20); // page = max(page, 0)
    expect(await mock.api.searchProspects('', 0, 50)).toContain('"result":[]');
    expect(mock.calls[3]).toBe('GET /master-data/prospects/search?key=&page=0&perPage=20');
  });

  it('finds ids by code', async () => {
    const { svc, mock } = setup();
    const list: BasicItem[] = [{ id: 7, code: 'P00007', name: 'x' }];
    expect(await svc.prospectIdByCode('P00007', list)).toBe('7');
    expect(mock.calls).toEqual([]); // from the list: no call
    expect(await svc.prospectIdByCode('P00030', list)).toBe('30'); // asked for the code
    expect(await svc.prospectIdByCode('P0003', list)).toBe(''); // exact match only
    expect(await svc.prospectIdByCode('  ', list)).toBe('');
    const emps = await svc.loadEmployees();
    expect(emps).toHaveLength(8);
    expect(svc.employeeIdByCode('E103', emps)).toBe('3');
    expect(svc.employeeIdByCode('nope', emps)).toBe('');
  });

  it('puts the customer of the document into the list once', () => {
    const { svc } = setup();
    const list: BasicItem[] = [{ id: 1, code: 'P1', name: 'a' }];
    svc.ensureProspectInList(list, '2', 'P2', 'b');
    svc.ensureProspectInList(list, '2', 'P2', 'b');
    svc.ensureProspectInList(list, '', 'P3', 'c');
    svc.ensureProspectInList(list, 'abc', 'P3', 'c');
    expect(list.map((b) => b.id)).toEqual([1, 2]);
  });

  it('loads a document with the ids its dropdowns need', async () => {
    const { svc } = setup();
    const employees = await svc.loadEmployees();
    const prospects: BasicItem[] = [];
    const id = String(mockDocId(1, 8)); // has an attachment with a doubled host, a creator, a reference
    const d = (await svc.loadDetail(T(1), id, employees, prospects))!;
    expect(d.docId).toBe(id);
    expect(d.fields['txNo']).toBe('CA-00008');
    expect(d.fields['customerId']).not.toBe(''); // found from the customer code (the service sends no customerId)
    expect(prospects.map((p) => String(p.id))).toContain(d.fields['customerId']);
    expect(d.fields['receiveById']).toBe(svc.employeeIdByCode(d.fields['receiveByCode'], employees));
    expect(d.files.map((f) => f.remoteUrl)).toEqual([expect.stringMatching(/^http:\/\/files\.example\.test\/documents\//), 'http://files.example.test/documents/' + id + '/แนบท้าย-8.png']);
    expect(await svc.loadDetail(T(1), '999999', employees, prospects)).toBeUndefined();
  });

  it('chooses the receiver and the date once a customer is picked', async () => {
    const { svc } = setup();
    const employees = await svc.loadEmployees();
    // customer 3: the sale person is written with a title; customer 4: plainly; customer 5: none
    expect((await svc.onCustomerSelected('3', employees, '2026-10-20'))?.receiver?.name).toBe(employees[3 % 8].name);
    expect((await svc.onCustomerSelected('4', employees, '2026-10-20'))?.receiver?.name).toBe(employees[4 % 8].name);
    expect(await svc.onCustomerSelected('5', employees, '2026-10-20')).toEqual({ receiveDate: '2026-10-20', receiver: undefined });
    expect(await svc.onCustomerSelected('', employees, '2026-10-20')).toBeUndefined();
    expect((await svc.onCustomerSelected('99999', employees, '2026-10-20'))?.receiver).toBeUndefined();
  });

  it('creates a document and reads it back', async () => {
    const { svc, mock } = setup();
    const employees = await svc.loadEmployees();
    const prospects: BasicItem[] = [];
    const r = await svc.save(T(3), { docId: '', raw: null, fields: { customerId: '9', receiveById: '2', remark: 'ใหม่', description: 'd' }, txDate: '2026-10-01', refDate: '', receiveDate: '2026-10-20', files: [] }, employees, prospects);
    expect(r.redirect).toBe(true);
    expect(r.messages).toEqual([]);
    expect(r.detail?.fields).toMatchObject({ txNo: 'CS-00008', remark: 'ใหม่', customerCode: 'P00009' });
    expect(r.detail?.fields['description']).toBe('d');
    expect(r.detail?.docId).toBe(String(mockDocId(3, 8)));
    expect(mock.documents(T(3))).toHaveLength(8);
  });

  it('updates a document: the whole one goes back, the owned fields do not', async () => {
    const { svc, mock } = setup();
    const employees = await svc.loadEmployees();
    const prospects: BasicItem[] = [];
    const id = String(mockDocId(5, 2));
    const d = (await svc.loadDetail(T(5), id, employees, prospects))!;
    d.fields['remark'] = 'แก้แล้ว';
    d.fields['receiveById'] = '';
    const r = await svc.save(T(5), { docId: id, raw: d.raw, fields: d.fields, txDate: d.txDate, refDate: d.refDate, receiveDate: d.receiveDate, files: d.files }, employees, prospects);
    expect(r.redirect).toBe(true);
    expect(r.detail?.fields['remark']).toBe('แก้แล้ว');
    expect(r.detail?.fields['receiveByCode']).toBe(''); // cleared on purpose
    expect(mock.calls.some((c) => c.startsWith(`PUT /documents/${id}`))).toBe(true);
  });

  it('a missing customer or date moves on to the list with a warning (as Java did); a failed save stays', async () => {
    const { svc, mock } = setup();
    const st = { docId: '', raw: null, fields: {}, txDate: '', refDate: '', receiveDate: '2026-10-20', files: [] };
    const warn = await svc.save(T(1), st, [], []);
    expect(warn).toMatchObject({ redirect: true, messages: [{ severity: 'warn', detail: 'กรุณาเลือกลูกค้า' }] });
    expect(mock.calls).toEqual([]); // nothing was sent
    const noDate = await svc.save(T(1), { ...st, receiveDate: '', fields: { customerId: '3' } }, [], []);
    expect(noDate.messages[0].detail).toBe('กรุณาเลือกวันที่รับเอกสาร');
    for (const [remark, summary] of [['X-FAIL', 'บันทึกไม่สำเร็จ'], ['X-NOREPLY', 'บันทึกไม่สำเร็จ'], ['X-INVALID', 'บันทึกไม่สำเร็จ']]) {
      const bad = await svc.save(T(1), { ...st, fields: { customerId: '3', remark } }, [], []);
      expect(bad).toMatchObject({ redirect: false, messages: [{ severity: 'error', summary }] });
    }
  });

  it('sends the files only the browser has, and warns about the ones that failed', async () => {
    const { svc, mock } = setup();
    const file = (name: string, size = 3) => ({ filename: name, contentType: 'application/pdf', size, description: 'd', remoteUrl: '', content: new Blob([new Uint8Array(size)]) });
    const has = { filename: 'on-server.pdf', contentType: '', size: 0, description: '', remoteUrl: 'http://h/x.pdf' };
    const r = await svc.save(
      T(6),
      { docId: '', raw: null, fields: { customerId: '3' }, txDate: '', refDate: '', receiveDate: '2026-10-20', files: [file('ok.pdf'), file('will-fail.pdf'), file('empty.pdf', 0), has] },
      [],
      [],
    );
    expect(mock.calls.filter((c) => c.includes('/attachments')).map((c) => c.split('/attachments')[0])).toHaveLength(2); // ok + will-fail; not the empty one, not the one the backend has
    expect(r.messages).toEqual([{ severity: 'warn', summary: 'แนบไฟล์ไม่สำเร็จบางไฟล์', detail: 'will-fail.pdf — กดบันทึกอีกครั้งเพื่อลองใหม่' }]);
    expect(r.redirect).toBe(true);
    // after the reload: what the backend lists (ok.pdf), then the files of the browser it does not have by name
    expect(r.detail?.files.map((f) => f.filename)).toEqual(['ok.pdf', 'will-fail.pdf', 'empty.pdf', 'on-server.pdf']);
  });

  it('keeps the files of the browser in the store, by trimmed id', () => {
    const store = new AttachStore();
    store.put(' 5 ', [{ filename: 'a', contentType: '', size: 1, description: '', remoteUrl: '' }]);
    expect(store.get('5')).toHaveLength(1);
    store.put('', []);
    store.put(undefined, []);
    expect(store.get(undefined)).toBeUndefined();
    expect(store.get('6')).toBeUndefined();
  });

  it('encodes bytes as base64 like Base64.getEncoder', async () => {
    expect(await blobToBase64(new Blob([new TextEncoder().encode('hello')]))).toBe('aGVsbG8=');
    expect(await blobToBase64(new Blob([]))).toBe('');
    expect(parseJson('[1]')).toBeUndefined();
    expect(parseJson('{"a":1}')).toEqual({ a: 1 });
    expect(supportingDocType('credit-application')?.formType).toBe('formsun');
  });
});

describe('the master-data answers of the credit-application form', () => {
  const board = createMockBoardFetch();
  const json = async (url: string) => (await board(url)).json() as Promise<{ id: number; name: string; postCode?: string }[]>;

  it('lists provinces, then their districts, then their sub-districts with the post code', async () => {
    const provinces = await json('/triplesale/board/provinces');
    expect(provinces[0].name).toBe('กรุงเทพมหานคร');
    const districts = await json(`/triplesale/board/districts?provinceId=${provinces[0].id}`);
    expect(districts.map((d) => d.name)).toContain('เขตบางรัก');
    const subs = await json(`/triplesale/board/sub-districts?districtId=${districts[0].id}`);
    expect(subs.length).toBeGreaterThan(0);
    expect(subs[0].postCode).toMatch(/^\d{5}$/);
    expect(await json('/triplesale/board/districts')).toEqual([]);
    expect(await json('/triplesale/board/sub-districts?districtId=1')).toEqual([]);
    expect((await board('/triplesale/board/nothing')).status).toBe(404);
  });
});
