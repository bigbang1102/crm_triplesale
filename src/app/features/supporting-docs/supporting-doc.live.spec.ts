import { describe, expect, it } from 'vitest';
import { fakeRest } from '@core/live/rest-fake';
import { SupportingDocService } from './supporting-doc.service';
import { createLiveBoardFetch, createLiveSupportingDocApi, DOCUMENT_FORMTYPE_STYLE } from './supporting-doc.live';
import { SUPPORTING_DOC_TYPES } from './supporting-doc-types';

const ok = (result: unknown) => JSON.stringify({ status: 200, message: 'success', result });

describe('the live backend of the supporting documents', () => {
  it('asks for the formType of Java\'s config (old = lowercase)', () => {
    expect(DOCUMENT_FORMTYPE_STYLE).toBe('old');
    expect(createLiveSupportingDocApi(fakeRest(() => '').deps).formTypeStyle).toBe('old');
  });

  it('GET /documents: formType, page, pageSize in that order; the body of a 200 only', async () => {
    const { deps, calls } = fakeRest((c) => (c.path.includes('page=2') ? { status: 500, text: '{"status":500}' } : { items: [{ id: 1 }] }));
    const api = createLiveSupportingDocApi(deps);
    expect(await api.documents('formintent', 1, 20)).toBe('{"items":[{"id":1}]}');
    expect(await api.documents('formintent', 2, 20)).toBe(''); // Data_API.sendGET: not 200 = empty
    expect(calls.map((c) => [c.method, c.path])).toEqual([
      ['GET', '/documents?formType=formintent&page=1&pageSize=20'],
      ['GET', '/documents?formType=formintent&page=2&pageSize=20'],
    ]);
    expect(calls[0].headers).toMatchObject({ Accept: 'application/json' });
  });

  it('GET /documents/{id}?formType= keeps the id as it is written', async () => {
    const { deps, calls } = fakeRest(() => ok({ id: 7 }));
    await createLiveSupportingDocApi(deps).document('formsun', '1007');
    expect(calls[0].path).toBe('/documents/1007?formType=formsun');
  });

  it('POST /documents for a new one, PUT /documents/{id}?formType= for an update; the body of the answer whatever its status', async () => {
    const { deps, calls } = fakeRest((c) => (c.method === 'PUT' ? { status: 400, text: '{"status":400,"message":"bad"}' } : ok({ id: 5, txNo: 'N' })));
    const api = createLiveSupportingDocApi(deps);
    expect(await api.save('formintent', undefined, { formType: 'formintent' })).toContain('"id":5');
    expect(await api.save('formintent', '5', { formType: 'formintent' })).toBe('{"status":400,"message":"bad"}');
    expect(calls.map((c) => [c.method, c.path, c.body])).toEqual([
      ['POST', '/documents', { formType: 'formintent' }],
      ['PUT', '/documents/5?formType=formintent', { formType: 'formintent' }],
    ]);
  });

  it('no answer at all is an empty body (a failing save is read from it)', async () => {
    const { deps } = fakeRest(() => null);
    expect(await createLiveSupportingDocApi(deps).save('formintent', undefined, {})).toBe('');
  });

  it('POST /documents/{id}/attachments?formType= with the trimmed id', async () => {
    const { deps, calls } = fakeRest(() => ok({}));
    await createLiveSupportingDocApi(deps).attach('formloan', ' 12 ', { fileName: 'a.pdf', contentBase64: 'AA==' });
    expect(calls[0]).toMatchObject({ method: 'POST', path: '/documents/12/attachments?formType=formloan', body: { fileName: 'a.pdf', contentBase64: 'AA==' } });
  });

  it('searches the customers with key= always present and a form-encoded key (a space is +)', async () => {
    const { deps, calls } = fakeRest(() => ok([]));
    const api = createLiveSupportingDocApi(deps);
    await api.searchProspects('', 0, 20);
    await api.searchProspects('สมชาย ใจดี', 2, 20);
    await api.searchProspects('a&b=c', 0, 20);
    expect(calls.map((c) => c.path)).toEqual([
      '/master-data/prospects/search?key=&page=0&perPage=20',
      `/master-data/prospects/search?key=${new URLSearchParams({ k: 'สมชาย ใจดี' }).toString().slice(2)}&page=2&perPage=20`,
      '/master-data/prospects/search?key=a%26b%3Dc&page=0&perPage=20',
    ]);
    expect(calls[1].path).toContain('key=%E0%B8%AA'); // UTF-8
    expect(calls[1].path).toContain('+'); // the space
  });

  it('reads the employees and one customer', async () => {
    const { deps, calls } = fakeRest(() => ok([]));
    const api = createLiveSupportingDocApi(deps);
    await api.employees();
    await api.prospect('30');
    expect(calls.map((c) => c.path)).toEqual(['/master-data/employees', '/prospects/30']);
  });

  it('runs the whole bean over a scripted service: list page, document, save', async () => {
    const t = SUPPORTING_DOC_TYPES[0];
    const { deps, calls } = fakeRest((c) => {
      if (c.method === 'GET' && c.path.startsWith('/documents?')) return ok({ items: [{ id: 3, txNo: 'N3', status: 'ACTIVE' }, { id: 2 }], total: 2 });
      if (c.method === 'GET' && c.path.startsWith('/documents/3')) return ok({ id: 3, txNo: 'N3', status: 'ACTIVE', customerCode: 'P00001', customerName: 'ก', receiveByCode: 'E1', receiveDate: '2026-10-01', attachItems: [] });
      if (c.path.startsWith('/master-data/prospects/search')) return ok([{ id: 1, code: 'P00001', name: 'ก' }]);
      if (c.path === '/master-data/employees') return ok([{ id: 9, code: 'E1', name: 'ผู้รับ' }]);
      if (c.method === 'PUT') return ok({ id: 3, txNo: 'N3' });
      return null;
    });
    const svc = new SupportingDocService(createLiveSupportingDocApi(deps));
    expect((await svc.fetchPage(t, 1, 20)).items.map((r) => r.id)).toEqual([3, 2]);
    const employees = await svc.loadEmployees();
    const prospects = await svc.searchProspects('', 0);
    const d = (await svc.loadDetail(t, '3', employees, prospects))!;
    expect(d.fields).toMatchObject({ customerId: '1', receiveById: '9' });
    const r = await svc.save(t, { docId: '3', raw: d.raw, fields: { ...d.fields, remark: 'x' }, txDate: d.txDate, refDate: d.refDate, receiveDate: d.receiveDate, files: [] }, employees, prospects);
    expect(r.redirect).toBe(true);
    const put = calls.find((c) => c.method === 'PUT')!;
    expect(put.path).toBe('/documents/3?formType=formintent');
    expect(put.body).toMatchObject({ formType: 'formintent', remark: 'x', customerId: 1, receiveById: 9, receiveDate: '2026-10-01' });
    expect(put.body).not.toHaveProperty('txNo');
  });

  it('the master-data routes of the credit application are the board servlets answered from the service', async () => {
    const { deps, calls } = fakeRest((c) => (c.path.startsWith('/master-data/districts') ? ok([{ id: 1, name: 'เขตบางรัก' }]) : ok([])));
    const board = createLiveBoardFetch(deps);
    const res = await board('/triplesale/board/districts?provinceId=10');
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject([{ id: 1, name: 'เขตบางรัก' }]); // the servlet's cleaning adds the empty fields
    expect(calls[0].path).toContain('/master-data/districts');
    expect((await board('/triplesale/board/nothing')).status).toBe(404);
  });
});
