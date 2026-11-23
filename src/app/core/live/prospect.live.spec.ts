import { describe, expect, it } from 'vitest';
import { ROLE } from '../permissions/roles';
import { opportunityCreateRoutes, prospectRoutes } from './prospect.live';
import type { FileIo } from './prospect-files.live';
import { composeRoutes } from './rest';
import { fakeRest, type FakeAnswer, type FakeCall, type FakeOptions } from './rest-fake';

/**
 * ProspectDetailServlet, ProspectLeadsServlet, ProspectSaveServlet, ProspectUpdateServlet, ProspectAttachmentsServlet, ProspectAvatarServlet,
 * RvAttachmentsServlet, ChatProspectCreateServlet, DocProxy and LeadCreateServlet, read line by line. The list / enrich servlets are in
 * prospect-list.live.spec.ts. Every expectation is what the Java code did (and the status / body it wrote), not what the port happens to do.
 */
interface FileCall {
  method: string;
  url: string;
}
function setup(answer: (c: FakeCall) => FakeAnswer | Promise<FakeAnswer>, o: FakeOptions = {}, files: (c: FileCall) => Response | Error = () => new Response(null, { status: 200 })) {
  const { deps, calls } = fakeRest(answer, o);
  const fileCalls: FileCall[] = [];
  const io: FileIo = {
    fetch: async (url, init) => {
      const c = { method: init?.method ?? 'GET', url };
      fileCalls.push(c);
      const r = files(c);
      if (r instanceof Error) throw r;
      return r;
    },
  };
  const route = composeRoutes(prospectRoutes(deps, io), opportunityCreateRoutes(deps));
  return {
    calls,
    fileCalls,
    ask: async (url: string, init?: RequestInit) => {
      const r = await route(url, init);
      return { status: r.status, type: r.headers.get('content-type'), text: await r.text(), res: r };
    },
    json: async (url: string, init?: RequestInit) => {
      const r = await route(url, init);
      return { status: r.status, body: JSON.parse(await r.text()) as Record<string, any> };
    },
  };
}
const post = (body: unknown): RequestInit => ({ method: 'POST', body: typeof body === 'string' ? body : JSON.stringify(body) });
const env = (result: unknown, status = 200) => ({ status, message: 'OK', result });
const at = (calls: FakeCall[], i: number) => `${calls[i].method} ${calls[i].path}`;

describe('GET /board/prospect (ProspectDetailServlet)', () => {
  it('answers the result of GET /prospects/{id} as it is (compact JSON text)', async () => {
    const s = setup(() => env({ id: 7, name: 'สมชาย', sunProspectInfo: { csVip: 'Y' }, amount: 1.5 }));
    const r = await s.ask('/board/prospect?id=%207%20');
    expect(r).toMatchObject({ status: 200, type: 'application/json; charset=UTF-8', text: '{"id":7,"name":"สมชาย","sunProspectInfo":{"csVip":"Y"},"amount":1.5}' });
    expect(at(s.calls, 0)).toBe('GET /prospects/7');
  });

  it('is "{}" (HTTP 200) for a blank id (no call), a non-200 answer, an answer that is not JSON, an envelope that is not status 200 or has no result', async () => {
    expect((await setup(() => env({})).ask('/board/prospect?id=')).text).toBe('{}');
    expect((await setup(() => env({})).ask('/board/prospect')).text).toBe('{}');
    expect(setup(() => env({})).calls).toHaveLength(0);
    for (const a of [{ status: 404, text: '{"status":200,"result":{"id":1}}' }, { status: 200, text: '<html/>' }, { status: 200, text: '[{"id":1}]' }, { status: 200, text: '{"status":404,"result":{"id":1}}' }, { status: 200, text: '{"status":200}' }, { status: 200, text: '' }, null] as FakeAnswer[]) {
      const r = await setup(() => a).ask('/board/prospect?id=1');
      expect([r.status, r.text]).toEqual([200, '{}']);
    }
  });

  it('a result that is a text is the text itself, one that is null is the text null (org.json toString)', async () => {
    expect((await setup(() => ({ status: 200, result: 'plain' })).ask('/board/prospect?id=1')).text).toBe('plain');
    expect((await setup(() => ({ status: 200, result: null })).ask('/board/prospect?id=1')).text).toBe('null');
    expect((await setup(() => ({ status: '200', result: [1, 2] })).ask('/board/prospect?id=1')).text).toBe('[1,2]');
  });

  it('only GET', async () => {
    expect((await setup(() => env({})).ask('/board/prospect?id=1', post({}))).status).toBe(405);
  });
});

describe('GET /board/prospect-leads (ProspectLeadsServlet)', () => {
  const lead = (o: Record<string, unknown>) => ({ id: 1, prospectId: 7, txNo: 'LD1', txDate: '2026-09-01', leadStatus: 'ACTIVE', activeStatus: 'Y', movementTypeName: 'สินเชื่อ', employeeName: 'พนง', salePersonName: 'ขาย', saleGroupName: 'ทีม', amount: 1500.5, ...o });
  const leadsPage = (items: unknown[], extra: Record<string, unknown> = {}) => env({ leads: { items }, ...extra });

  it('needs prospectId: 400 with the Thai message and no call', async () => {
    const s = setup(() => ({}));
    expect(await s.json('/board/prospect-leads')).toEqual({ status: 400, body: { status: 400, message: 'ต้องระบุ prospectId' } });
    expect((await s.json('/board/prospect-leads?prospectId=%20%20')).status).toBe(400);
    expect(s.calls).toHaveLength(0);
  });

  it('asks every product (movement types LD), and of a product every step group that has leads — in this order, with these addresses', async () => {
    const s = setup((c) => {
      if (c.path === '/master-data/movement-types/LD') return env([{ id: 11 }, { id: 22 }]);
      if (c.path.includes('movementTypeId=11') && !c.path.includes('activityGroupId')) {
        return leadsPage([lead({ id: 1 })], { activityGroupId: 101, wfStepSummary: [{ id: 101, count: 4 }, { id: 102, count: 2 }, { id: 103, count: 0 }, { id: 104, count: 1 }] });
      }
      if (c.path.includes('activityGroupId=102')) return leadsPage([lead({ id: 2, txDate: '2026-10-01' })]);
      if (c.path.includes('activityGroupId=104')) return leadsPage([lead({ id: 4, txDate: '2026-08-01' })]);
      if (c.path.includes('movementTypeId=22')) return leadsPage([lead({ id: 3, txDate: '2026-09-15' })]);
      return leadsPage([]);
    });
    const r = await s.json('/board/prospect-leads?prospectId=7');
    expect(s.calls.map((c) => c.path)).toEqual([
      '/master-data/movement-types/LD',
      '/leads?viewMode=list&page=1&perPage=100&movementTypeId=11',
      '/leads?viewMode=list&page=1&perPage=100&movementTypeId=11&activityGroupId=102',
      '/leads?viewMode=list&page=1&perPage=100&movementTypeId=11&activityGroupId=104',
      '/leads?viewMode=list&page=1&perPage=100&movementTypeId=22',
    ]);
    // newest first by txDate
    expect(r.body['result'].map((x: { id: number }) => x.id)).toEqual([2, 3, 1, 4]);
    expect(r.body['status']).toBe(200);
    expect(r.body['total']).toBe(4);
  });

  it('the keyword is added form-encoded; the answer keeps the first copy of a lead and only the leads of this customer', async () => {
    const s = setup((c) => {
      if (c.path === '/master-data/movement-types/LD') return env([{ id: 11 }]);
      return leadsPage([lead({ id: 1 }), lead({ id: 2, prospectId: 8 }), lead({ id: 1, txNo: 'DUP' }), lead({ id: 3, prospectId: '7' }), lead({ id: 4, prospectId: 77 })]);
    });
    const r = await s.json('/board/prospect-leads?prospectId=7&keyword=%20P26-0001%20%E0%B8%AA%E0%B8%A1%20');
    expect(s.calls[1].path).toBe('/leads?viewMode=list&page=1&perPage=100&movementTypeId=11&search=P26-0001+%E0%B8%AA%E0%B8%A1');
    expect(r.body['result'].map((x: { id: number; txNo: string }) => [x.id, x.txNo])).toEqual([[1, 'LD1'], [3, 'LD1']]);
  });

  it('the row has only the fields of the Java servlet; amount is kept as the service sent it (absent / null / number); activityGroupId only when it is a real group', async () => {
    const items = [
      lead({ id: 1, amount: undefined, activityGroupId: 101, txDate: '2026-01-03' }),
      lead({ id: 2, amount: null, activityGroupId: 0, procedureGroupId: 55, txDate: '2026-01-02' }),
      lead({ id: 3, activityGroupId: null, procedureGroupId: 55, txDate: '2026-01-01', secret: 'x' }),
      lead({ id: 4, activityGroupId: ' 0 ', txDate: '2025-12-31' }),
      lead({ id: 5, activityGroupId: 7, procedureGroupId: 55, txDate: '2025-12-30' }),
    ];
    const s = setup((c) => (c.path === '/master-data/movement-types/LD' ? env([{ id: 11 }]) : leadsPage(items)));
    const rows = (await s.json('/board/prospect-leads?prospectId=7')).body['result'] as Record<string, unknown>[];
    expect(rows[0]).toEqual({ id: 1, txNo: 'LD1', txDate: '2026-01-03', leadStatus: 'ACTIVE', activeStatus: 'Y', movementTypeName: 'สินเชื่อ', employeeName: 'พนง', salePersonName: 'ขาย', saleGroupName: 'ทีม', activityGroupId: '101' });
    // activityGroupId 0 means "every group", not a real id — and procedureGroupId is read only when activityGroupId is missing or null (not for 0)
    expect(rows[1]).toMatchObject({ id: 2, amount: null });
    expect(rows[1]).not.toHaveProperty('activityGroupId');
    expect(rows[2]).toMatchObject({ id: 3, amount: 1500.5, activityGroupId: '55' });
    expect(rows[2]).not.toHaveProperty('secret');
    expect(rows[3]).not.toHaveProperty('activityGroupId'); // "0" after a trim
    expect(rows[3]['id']).toBe(4);
    expect(rows[4]).toMatchObject({ id: 5, activityGroupId: '7' });
  });

  it('equal dates keep the order they were found in', async () => {
    const items = [lead({ id: 1, txDate: '2026-01-01' }), lead({ id: 2, txDate: '2026-01-01' }), lead({ id: 3, txDate: '2026-02-01' })];
    const s = setup((c) => (c.path === '/master-data/movement-types/LD' ? env([{ id: 11 }]) : leadsPage(items)));
    expect((await s.json('/board/prospect-leads?prospectId=7')).body['result'].map((x: { id: number }) => x.id)).toEqual([3, 1, 2]);
  });

  it('the leads can be at result, result.leads.items or result.items', async () => {
    for (const shape of [[lead({ id: 1 })], { leads: { items: [lead({ id: 1 })] } }, { items: [lead({ id: 1 })] }]) {
      const s = setup((c) => (c.path === '/master-data/movement-types/LD' ? env([{ id: 11 }]) : env(shape)));
      expect((await s.json('/board/prospect-leads?prospectId=7')).body['total']).toBe(1);
    }
  });

  it('without products the service picks one: one call without movementTypeId; a product that fails is skipped and the next one is asked', async () => {
    const none = setup((c) => (c.path.startsWith('/leads') ? leadsPage([lead({ id: 1 })]) : { status: 500, text: '' }));
    expect((await none.json('/board/prospect-leads?prospectId=7')).body['total']).toBe(1);
    expect(none.calls.map((c) => c.path)).toEqual(['/master-data/movement-types/LD', '/leads?viewMode=list&page=1&perPage=100']);
    const flaky = setup((c) => {
      if (c.path === '/master-data/movement-types/LD') return env([{ id: 11 }, { id: 22 }, { id: 33 }]);
      if (c.path.includes('movementTypeId=11')) return { status: 500, text: 'boom' };
      if (c.path.includes('movementTypeId=22')) return { status: 200, text: 'not json' };
      return leadsPage([lead({ id: 9 })]);
    });
    const r = await flaky.json('/board/prospect-leads?prospectId=7');
    expect(r.body['result'].map((x: { id: number }) => x.id)).toEqual([9]);
    expect(flaky.calls).toHaveLength(4);
  });

  it('a step group that has leads and was not loaded is asked with the id the service gave; the loaded one, an empty one and a group without id are not', async () => {
    const s = setup((c) => {
      if (c.path === '/master-data/movement-types/LD') return env([{ id: 11 }]);
      if (c.path.includes('activityGroupId=')) return leadsPage([]);
      return leadsPage([lead({ id: 1 })], { activityGroupId: 5, wfStepSummary: [{ id: 5, count: 9 }, { count: 3 }, { id: 6, count: '2' }, { id: 7, count: 0 }, 'x', { id: 8, count: -1 }] });
    });
    await s.json('/board/prospect-leads?prospectId=7');
    // {count:3} has no id: String.valueOf(null) = "null" is what Java asks for
    expect(s.calls.slice(2).map((c) => c.path)).toEqual([
      '/leads?viewMode=list&page=1&perPage=100&movementTypeId=11&activityGroupId=null',
      '/leads?viewMode=list&page=1&perPage=100&movementTypeId=11&activityGroupId=6',
    ]);
  });
});

describe('POST /board/prospect/save (ProspectSaveServlet)', () => {
  const ok = { status: 200, text: '{"status":200,"message":"OK"}' };

  it('only POST', async () => {
    expect((await setup(() => ok).ask('/board/prospect/save')).status).toBe(405);
  });

  it('is 400 for a body that is not JSON, without prospectId, or with nothing to save — and asks the service for nothing', async () => {
    const s = setup(() => ok);
    const msg = { ok: false, message: 'missing/invalid prospectId or payload' };
    expect(await s.json('/board/prospect/save', post('not json'))).toEqual({ status: 400, body: msg });
    expect((await s.json('/board/prospect/save', post({ prospect: { name: 'x' } }))).status).toBe(400);
    expect((await s.json('/board/prospect/save', post({ prospectId: 0, prospect: { name: 'x' } }))).status).toBe(400);
    expect((await s.json('/board/prospect/save', post({ prospectId: 9 }))).status).toBe(400);
    expect((await s.json('/board/prospect/save', post({ prospectId: 9, extraInfo: { sunProspectInfo: { unknown: 'x' }, satisfaction: {} } }))).status).toBe(400);
    expect(s.calls).toHaveLength(0);
    // …but the legacy "fields" alone passes the check (and then fails below: there is no database fallback)
    expect((await s.json('/board/prospect/save', post({ prospectId: 9, fields: { CS_LOANTYPE: 'x' } }))).status).toBe(502);
  });

  it('main data: PUT /prospects/{id} with the filtered body; 200 { status, api, ok, via }', async () => {
    const s = setup(() => ok);
    const r = await s.json('/board/prospect/save', post({ prospectId: 9, prospect: { name: 'สมชาย', unknownKey: 1, contactDate: '2026-09-15T00:00:00', customerType: 'company' }, fields: {} }));
    expect(r).toEqual({ status: 200, body: { status: 200, api: { status: 200, message: 'OK' }, ok: true, via: 'api' } });
    expect(s.calls).toHaveLength(1);
    expect(at(s.calls, 0)).toBe('PUT /prospects/9');
    expect(s.calls[0].body).toEqual({ name: 'สมชาย', contactDate: '2026-09-15', customerType: 'company', taxBranch: '00000', id: 9 });
  });

  it('extra info only: PUT /prospects/{id}/extra-info, and its status is the result', async () => {
    const s = setup((c) => (c.path.endsWith('/extra-info') ? { status: 204, text: '' } : ok));
    const r = await s.json('/board/prospect/save', post({ prospectId: 9, extraInfo: { sunProspectInfo: { csVip: 'Y', bogus: 1 }, satisfaction: { customerGender: 'F' } } }));
    expect(s.calls.map((c) => at([c], 0))).toEqual(['PUT /prospects/9/extra-info']);
    expect(Object.keys((s.calls[0].body as Record<string, Record<string, string>>)['satisfaction'])).toHaveLength(34);
    expect((s.calls[0].body as Record<string, unknown>)['sunProspectInfo']).toEqual({ csVip: 'Y' });
    expect(r.status).toBe(200);
    expect(r.body).toEqual({ status: 204, extraStatus: 204, extraApi: '', ok: true, via: 'api' });
  });

  it('an old caller can put the extra info inside "prospect": it is split off (and not in the main body)', async () => {
    const s = setup(() => ok);
    await s.json('/board/prospect/save', post({ prospectId: 9, prospect: { name: 'x', sunProspectInfo: { csVip: 'Y' }, satisfaction: { customerGender: 'M' } } }));
    expect(s.calls.map((c) => at([c], 0))).toEqual(['PUT /prospects/9', 'PUT /prospects/9/extra-info']);
    expect(s.calls[0].body).toEqual({ name: 'x', id: 9 });
    expect((s.calls[1].body as Record<string, unknown>)['sunProspectInfo']).toEqual({ csVip: 'Y' });
  });

  it('both: main first, extra only when main was 2xx; extra failing is 502 with both statuses and the message of the service', async () => {
    const s = setup((c) => (c.path.endsWith('/extra-info') ? { status: 500, text: '{"error":"broken"}' } : { status: 201, text: '{"status":201}' }));
    const r = await s.json('/board/prospect/save', post({ prospectId: 9, prospect: { name: 'x' }, extraInfo: { sunProspectInfo: { csVip: 'Y' } } }));
    expect(r.status).toBe(502);
    expect(r.body).toEqual({ status: 201, api: { status: 201 }, extraStatus: 500, extraApi: { error: 'broken' }, ok: false, via: 'api', message: 'API ตอบ 500 — {"error":"broken"}' });
    expect(s.calls.map((c) => at([c], 0))).toEqual(['PUT /prospects/9', 'PUT /prospects/9/extra-info']);
  });

  it('main failing: 502 and the extra info is NOT sent; the message has the status and what the service said (cut at 300 characters)', async () => {
    const long = 'x'.repeat(400);
    const s = setup(() => ({ status: 500, text: long }));
    const r = await s.json('/board/prospect/save', post({ prospectId: 9, prospect: { name: 'x' }, extraInfo: { sunProspectInfo: { csVip: 'Y' } } }));
    expect(r.status).toBe(502);
    expect(r.body).toMatchObject({ status: 500, api: long, ok: false, via: 'api', message: `API ตอบ 500 — ${'x'.repeat(300)}…` });
    expect(r.body).not.toHaveProperty('extraStatus');
    expect(s.calls).toHaveLength(1);
    const noBody = await setup(() => ({ status: 403, text: '' })).json('/board/prospect/save', post({ prospectId: 9, prospect: { name: 'x' } }));
    expect(noBody.body['message']).toBe('API ตอบ 403');
  });

  it('no answer at all is status -1 and the message says the service could not be reached', async () => {
    const s = setup(() => null);
    const r = await s.json('/board/prospect/save', post({ prospectId: 9, prospect: { name: 'x' } }));
    expect(r.status).toBe(502);
    expect(r.body).toMatchObject({ status: -1, api: '', ok: false, via: 'api', message: 'เชื่อมต่อ API ไม่ได้ (บันทึกผ่าน API เท่านั้น ไม่มีการเขียนฐานข้อมูลสำรอง)' });
  });
});

describe('POST /board/prospect/update (ProspectUpdateServlet — not ported)', () => {
  it('validates like the servlet, then says it cannot: it wrote the database and the service has no resource for that', async () => {
    const s = setup(() => ({}));
    expect(await s.json('/board/prospect/update', post('x'))).toEqual({ status: 400, body: { ok: false, message: 'missing/invalid body or id' } });
    expect((await s.json('/board/prospect/update', post({ id: 0 }))).status).toBe(400);
    expect((await s.json('/board/prospect/update', post({ id: 5, name: 'x' }))).status).toBe(501);
    expect((await s.ask('/board/prospect/update')).status).toBe(405);
    expect(s.calls).toHaveLength(0);
  });
});

describe('/board/prospect/attachments (ProspectAttachmentsServlet)', () => {
  describe('GET', () => {
    it('needs prospectId > 0 (400 { status, message })', async () => {
      const s = setup(() => ({}));
      for (const q of ['', '?prospectId=0', '?prospectId=x', '?prospectId=-1']) expect(await s.json('/board/prospect/attachments' + q)).toEqual({ status: 400, body: { status: 400, message: 'prospectId required' } });
      expect(s.calls).toHaveLength(0);
    });

    it('lists GET /prospects/{id}/attachments and folds the doubled hosts of every attachFile', async () => {
      const s = setup(() => env([{ detailOrderNo: 1, attachFile: 'http://h/http://h/prospect/1/a.pdf' }, { detailOrderNo: 2, attachFile: 'prospect/2/b.png', description: 'x' }, { detailOrderNo: 3, attachFile: null }, { detailOrderNo: 4 }, 'not an object']));
      const r = await s.json('/board/prospect/attachments?prospectId=%2012%20');
      expect(at(s.calls, 0)).toBe('GET /prospects/12/attachments');
      expect(r.status).toBe(200);
      expect(r.body['result']).toEqual([{ detailOrderNo: 1, attachFile: 'http://h/prospect/1/a.pdf' }, { detailOrderNo: 2, attachFile: 'prospect/2/b.png', description: 'x' }, { detailOrderNo: 3, attachFile: '' }, { detailOrderNo: 4 }, 'not an object']);
    });

    it('is "{}" when the service gave nothing (non-200 / no answer), the text as it is when it is not a JSON object or has no result array', async () => {
      for (const a of [{ status: 500, text: 'x' }, null, { status: 200, text: '' }] as FakeAnswer[]) expect((await setup(() => a).ask('/board/prospect/attachments?prospectId=1')).text).toBe('{}');
      expect((await setup(() => ({ status: 200, text: '<html/>' })).ask('/board/prospect/attachments?prospectId=1')).text).toBe('<html/>');
      expect((await setup(() => ({ status: 200, text: '{"status":200,"result":{"a":1}}' })).ask('/board/prospect/attachments?prospectId=1')).text).toBe('{"status":200,"result":{"a":1}}');
    });
  });

  describe('POST (upload)', () => {
    const upload = (o: Record<string, unknown> = {}) => post({ prospectId: 12, fileContentBase64: 'data:application/pdf;base64,QUJD', fileName: 'สัญญา 1.pdf', description: 'สัญญา', ...o });
    const stored = (attachFile: string) => ({ status: 201, message: 'Created', result: { attachFile } });

    it('400 for a missing prospect or content, 400 with the list of the extensions for a file that may not be uploaded — before anything goes to the service', async () => {
      const s = setup(() => ({}));
      const need = { status: 400, message: 'prospectId และไฟล์จำเป็นต้องมี' };
      expect(await s.json('/board/prospect/attachments', upload({ prospectId: 0 }))).toEqual({ status: 400, body: need });
      expect(await s.json('/board/prospect/attachments', upload({ fileContentBase64: '  ' }))).toEqual({ status: 400, body: need });
      expect(await s.json('/board/prospect/attachments', post({ prospectId: 3 }))).toEqual({ status: 400, body: need });
      const ext = await s.json('/board/prospect/attachments', upload({ fileName: 'virus.exe' }));
      expect(ext.status).toBe(400);
      expect(ext.body['message']).toBe('ไม่รองรับไฟล์ประเภทนี้ (รองรับ: .7z, .csv, .doc, .docx, .gif, .jpeg, .jpg, .pdf, .png, .ppt, .pptx, .rar, .txt, .webp, .xls, .xlsx, .zip)');
      // no fileName = "document" = no extension
      expect((await s.json('/board/prospect/attachments', post({ prospectId: 3, fileContentBase64: 'QUJD' }))).body['message']).toContain('ไม่รองรับไฟล์ประเภทนี้');
      expect(s.calls).toHaveLength(0);
    });

    it('a body that is not a JSON object is 500 "อัปโหลดเอกสารไม่สำเร็จ: …"', async () => {
      const r = await setup(() => ({})).json('/board/prospect/attachments', post('<<<'));
      expect(r.status).toBe(500);
      expect(r.body['status']).toBe(500);
      expect(r.body['message']).toMatch(/^อัปโหลดเอกสารไม่สำเร็จ: /);
    });

    it('POST /prospects/{id}/attachments with the content WITHOUT the data URL prefix, type DOC, the description (the file name when none); then the file is checked', async () => {
      const s = setup(() => stored('http://f/http://f/prospect/1760/สัญญา 1.pdf'));
      const r = await s.json('/board/prospect/attachments', upload());
      expect(at(s.calls, 0)).toBe('POST /prospects/12/attachments');
      expect(s.calls[0].body).toEqual({ fileContentBase64: 'QUJD', fileName: 'สัญญา 1.pdf', attachFileTypeCode: 'DOC', description: 'สัญญา' });
      // the check asks the file server for the folded address, with the Thai name and the space encoded
      expect(s.fileCalls).toEqual([{ method: 'HEAD', url: 'http://f/prospect/1760/%E0%B8%AA%E0%B8%B1%E0%B8%8D%E0%B8%8D%E0%B8%B2%201.pdf' }]);
      expect(r).toEqual({ status: 200, body: { status: 200, verified: true, verifyReason: 'OK', message: 'success', result: { attachFile: 'http://f/prospect/1760/สัญญา 1.pdf' } } });
      const noDesc = setup(() => stored('http://f/p/a.pdf'));
      await noDesc.json('/board/prospect/attachments', post({ prospectId: 3, fileContentBase64: 'QUJD', fileName: 'a.pdf' }));
      expect((noDesc.calls[0].body as Record<string, string>)['description']).toBe('a.pdf');
      // a content that is not a data URL stays; a data URL without a comma stays as it is
      const raw = setup(() => stored('http://f/p/a.pdf'));
      await raw.json('/board/prospect/attachments', upload({ fileContentBase64: 'data:nocomma' }));
      expect((raw.calls[0].body as Record<string, string>)['fileContentBase64']).toBe('data:nocomma');
    });

    it('stored but the file server cannot show it: HTTP 200 with verified false, the reason and the message the page shows', async () => {
      const s = setup(() => stored('http://f/prospect/1/a.pdf'), {}, () => new Response(null, { status: 404 }));
      const r = await s.json('/board/prospect/attachments', upload({ fileName: 'a.pdf' }));
      expect(r.status).toBe(200);
      expect(r.body).toMatchObject({ status: 200, verified: false, verifyReason: 'HTTP_404', result: { attachFile: 'http://f/prospect/1/a.pdf' } });
      expect(r.body['message']).toBe(
        'อัปโหลดสำเร็จ แต่ตรวจสอบไฟล์บน O2O ไม่ผ่าน — ไม่พบไฟล์ที่ file server หลังอัปโหลด (ไฟล์อาจไม่ถูกเก็บ หรือที่อยู่ไฟล์ที่ระบบหลังบ้านตอบกลับชี้ผิดที่) ไฟล์อาจดาวน์โหลด/แสดงไม่ได้ กรุณาลองใหม่หรือแจ้งผู้ดูแลระบบ [HTTP_404]',
      );
      const down = await setup(() => stored('http://f/prospect/1/a.pdf'), {}, () => new TypeError('Failed to fetch')).json('/board/prospect/attachments', upload({ fileName: 'a.pdf' }));
      expect(down.body).toMatchObject({ verified: false, verifyReason: 'NETWORK' });
      // an address that is not an address of a file is not even asked
      const odd = setup(() => stored('prospect/1/a.pdf'));
      expect((await odd.json('/board/prospect/attachments', upload({ fileName: 'a.pdf' }))).body).toMatchObject({ verified: false, verifyReason: 'BAD_URL' });
      expect(odd.fileCalls).toHaveLength(0);
    });

    it('no address in the answer is 500: the message of the service (+ error.message), a default, and the raw answer', async () => {
      const long = await setup(() => ({ status: 400, text: JSON.stringify({ status: 400, message: 'Malformed request body', error: { message: 'String value length (20051112) exceeds the maximum' } }) })).json('/board/prospect/attachments', upload());
      expect(long.status).toBe(500);
      expect(long.body).toMatchObject({ status: 500, message: 'Malformed request body — String value length (20051112) exceeds the maximum' });
      expect(long.body['raw']).toContain('Malformed request body');
      const onlyDetail = await setup(() => ({ status: 400, text: '{"error":{"message":"too big"}}' })).json('/board/prospect/attachments', upload());
      expect(onlyDetail.body['message']).toBe('too big');
      const plain = await setup(() => ({ status: 502, text: '<html>bad gateway</html>' })).json('/board/prospect/attachments', upload());
      expect(plain.body).toEqual({ status: 500, message: 'อัปโหลดไฟล์ไม่สำเร็จ', raw: '<html>bad gateway</html>' });
      const none = await setup(() => null).json('/board/prospect/attachments', upload());
      expect(none.body).toEqual({ status: 500, message: 'อัปโหลดไฟล์ไม่สำเร็จ', raw: '' });
      const noAddress = await setup(() => ({ status: 201, text: '{"message":"Created","result":{"attachFile":""}}' })).json('/board/prospect/attachments', upload());
      expect(noAddress.body).toMatchObject({ status: 500, message: 'Created' });
    });
  });

  describe('DELETE', () => {
    it('needs prospectId and docNo (400); docNo 0 is a number', async () => {
      const s = setup(() => ({ status: 200, text: '' }));
      const need = { status: 400, message: 'prospectId และ docNo จำเป็นต้องมี' };
      expect(await s.json('/board/prospect/attachments?prospectId=1', { method: 'DELETE' })).toEqual({ status: 400, body: need });
      expect((await s.json('/board/prospect/attachments?docNo=1', { method: 'DELETE' })).status).toBe(400);
      expect((await s.json('/board/prospect/attachments?prospectId=1&docNo=-2', { method: 'DELETE' })).status).toBe(400);
      expect(s.calls).toHaveLength(0);
      expect((await s.json('/board/prospect/attachments?prospectId=1&docNo=0', { method: 'DELETE' })).status).toBe(200);
      expect(at(s.calls, 0)).toBe('DELETE /prospects/1/attachments/0');
    });

    it('a 2xx answer (the service gives an empty body) is { status: 200, message: "success" }', async () => {
      for (const st of [200, 204]) {
        const s = setup(() => ({ status: st, text: '' }));
        expect(await s.json('/board/prospect/attachments?prospectId=12&docNo=3', { method: 'DELETE' })).toEqual({ status: 200, body: { status: 200, message: 'success' } });
        expect(at(s.calls, 0)).toBe('DELETE /prospects/12/attachments/3');
      }
    });

    it('a failure keeps the status of the service as the HTTP status and says why; no answer is 502 with status -1', async () => {
      const gone = await setup(() => ({ status: 404, text: 'not found' })).json('/board/prospect/attachments?prospectId=12&docNo=3', { method: 'DELETE' });
      expect(gone).toEqual({ status: 404, body: { status: 404, message: 'ลบเอกสารไม่สำเร็จ: not found' } });
      const none = await setup(() => null).json('/board/prospect/attachments?prospectId=12&docNo=3', { method: 'DELETE' });
      expect(none).toEqual({ status: 502, body: { status: -1, message: 'ลบเอกสารไม่สำเร็จ: ' } });
    });
  });

  it('another method is 405', async () => {
    expect((await setup(() => ({})).ask('/board/prospect/attachments?prospectId=1', { method: 'PUT' })).status).toBe(405);
  });
});

describe('POST /board/prospect/avatar (ProspectAvatarServlet)', () => {
  const avatar = (o: Record<string, unknown> = {}) => post({ prospectId: 5, fileContentBase64: 'data:image/png;base64,QUJD', fileName: 'me.png', ...o });
  const uploaded = { status: 201, result: { attachFile: 'http://f/http://f/prospect/1760/me.png' } };
  const current = { id: 5, name: 'สมชาย', customerType: 'person', attachFile: 'http://f/prospect/old.png', senddocAddress: 'ส่งที่นี่', ignored: 1 };

  /** the service: upload → stored; GET → the customer (with the new picture after the PUT); PUT → ok */
  function service(o: { put?: FakeAnswer; getBefore?: FakeAnswer; verifyAfter?: Record<string, unknown> } = {}) {
    let putDone = false;
    return (c: FakeCall): FakeAnswer => {
      if (c.method === 'POST') return uploaded;
      if (c.method === 'PUT') {
        putDone = true;
        return o.put ?? { status: 200, text: '{"status":200,"message":"OK"}' };
      }
      if (!putDone) return o.getBefore ?? env(current);
      return env({ ...current, attachFile: 'http://f/prospect/1760/me.png', ...o.verifyAfter });
    };
  }

  it('400 for a missing prospect or picture', async () => {
    const s = setup(service());
    const need = { ok: false, message: 'prospectId และไฟล์จำเป็นต้องมี' };
    expect(await s.json('/board/prospect/avatar', avatar({ prospectId: 0 }))).toEqual({ status: 400, body: need });
    expect((await s.json('/board/prospect/avatar', avatar({ fileContentBase64: '' }))).status).toBe(400);
    expect((await s.json('/board/prospect/avatar', post('x'))).status).toBe(400);
    expect(s.calls).toHaveLength(0);
    expect((await s.ask('/board/prospect/avatar')).status).toBe(405);
  });

  it('uploads as type PROFILE (attachFileBase64, the file name or prospect-image.jpg), puts the customer back with the new relative address, reads it again', async () => {
    const s = setup(service());
    const r = await s.json('/board/prospect/avatar', avatar());
    expect(s.calls.map((c) => at([c], 0))).toEqual(['POST /prospects/5/attachments', 'GET /prospects/5', 'PUT /prospects/5', 'GET /prospects/5']);
    expect(s.calls[0].body).toEqual({ attachFileBase64: 'QUJD', fileName: 'me.png', attachFileTypeCode: 'PROFILE', description: 'รูปโปรไฟล์ลูกค้า' });
    expect(s.calls[2].body).toEqual({
      id: 5, name: 'สมชาย', customerType: 'person', sendDocAddress: 'ส่งที่นี่', attachFile: 'prospect/1760/me.png', downloadAttachFile: 'prospect/1760/me.png', attachFileBase64: 'QUJD',
    });
    expect(r).toEqual({ status: 200, body: { ok: true, persisted: true, verified: true, attachFile: 'http://f/prospect/1760/me.png', message: '' } });
    const named = setup(service());
    await named.json('/board/prospect/avatar', post({ prospectId: 5, fileContentBase64: 'QUJD' }));
    expect((named.calls[0].body as Record<string, string>)['fileName']).toBe('prospect-image.jpg');
  });

  it('no address in the answer is 500 { ok: false, message }', async () => {
    const withMsg = await setup(() => ({ status: 400, text: '{"message":"too big"}' })).json('/board/prospect/avatar', avatar());
    expect(withMsg).toEqual({ status: 500, body: { ok: false, message: 'too big' } });
    expect((await setup(() => null).json('/board/prospect/avatar', avatar())).body).toEqual({ ok: false, message: 'อัปโหลดรูปไม่สำเร็จ' });
  });

  it('the service refusing the PUT: ok false, persisted false, and what it said in the message', async () => {
    const s = setup(service({ put: { status: 400, text: '{"status":400,"message":"bad"}' } }));
    const r = await s.json('/board/prospect/avatar', avatar());
    expect(r.status).toBe(200);
    expect(r.body).toMatchObject({ ok: false, persisted: false, message: 'บันทึกลิงก์รูปไม่สำเร็จ (API): {"status":400,"message":"bad"}' });
  });

  it('a PUT whose answer says success in words counts as saved; one that is not JSON is an error', async () => {
    const words = await setup(service({ put: { status: 200, text: '{"result":"Success"}' } })).json('/board/prospect/avatar', avatar());
    expect(words.body).toMatchObject({ persisted: true });
    const html = await setup(service({ put: { status: 502, text: '<html/>' } })).json('/board/prospect/avatar', avatar());
    expect(html.body).toMatchObject({ ok: false, persisted: false });
    expect(html.body['message']).toMatch(/^บันทึกลิงก์รูปไม่สำเร็จ \(API\): /);
  });

  it('a customer that cannot be read before the PUT: no PUT, the message says so', async () => {
    const s = setup(service({ getBefore: env(null) }));
    const r = await s.json('/board/prospect/avatar', avatar());
    expect(r.body).toMatchObject({ ok: false, persisted: false, message: 'บันทึกลิงก์รูปไม่สำเร็จ (API): อ่านข้อมูลลูกค้ากลับมาไม่ได้ก่อนบันทึกรูป' });
    expect(s.calls.some((c) => c.method === 'PUT')).toBe(false);
    const down = await setup(service({ getBefore: { status: 500, text: '' } })).json('/board/prospect/avatar', avatar());
    expect(down.body).toMatchObject({ ok: false, persisted: false });
    expect(down.body['message']).toMatch(/^บันทึกลิงก์รูปไม่สำเร็จ \(API\): /);
  });

  it('saved but the customer does not show the new file: persisted true, verified false, the warning', async () => {
    const s = setup(service({ verifyAfter: { attachFile: 'http://f/prospect/old.png' } }));
    const r = await s.json('/board/prospect/avatar', avatar());
    expect(r.body).toEqual({ ok: false, persisted: true, verified: false, attachFile: 'http://f/prospect/1760/me.png', message: 'อัปโหลดไฟล์สำเร็จ แต่ยืนยันลิงก์รูปในระบบไม่ได้ — เครื่องอื่นอาจไม่เห็นรูป' });
  });
});

describe('GET /board/prospect/rv-attachments (RvAttachmentsServlet)', () => {
  it('needs prospectId (400); asks GET /rv/attachments?prospectId= and gives the body of a 200 answer as it is', async () => {
    const s = setup(() => ({ status: 200, text: '{"status":200,"result":[{"title":"RV1"}]}' }));
    expect(await s.json('/board/prospect/rv-attachments')).toEqual({ status: 400, body: { status: 400, message: 'prospectId required' } });
    expect((await s.json('/board/prospect/rv-attachments?prospectId=%20')).status).toBe(400);
    expect(s.calls).toHaveLength(0);
    const r = await s.ask('/board/prospect/rv-attachments?prospectId=%20P%2F1%20');
    expect(at(s.calls, 0)).toBe('GET /rv/attachments?prospectId=P%2F1');
    expect(r.text).toBe('{"status":200,"result":[{"title":"RV1"}]}');
  });

  it('is "{}" when the service gave nothing', async () => {
    for (const a of [{ status: 404, text: 'x' }, null, { status: 200, text: '  ' }] as FakeAnswer[]) expect((await setup(() => a).ask('/board/prospect/rv-attachments?prospectId=1')).text).toBe('{}');
  });
});

describe('POST /board/chat-prospect-create (ChatProspectCreateServlet)', () => {
  const form = (o: Record<string, unknown> = {}) =>
    post({ name: ' สมชาย ', customerTel: ' 0812345678 ', marketingChanelId: '3', convenient: 'เช้า', ggwBranchId: 77, employeeId: 5, assignToId: '6', remark: 'หมายเหตุ', movementTypeId: 9, ...o });
  const roles = { roles: [ROLE.chatProspectCreate] };
  const service = (c: FakeCall): FakeAnswer => (c.method === 'GET' ? env([{ id: 301 }, { id: 302 }]) : { status: 201, text: '{"status":201,"result":{"id":99}}' });

  it('needs Chat_Prospect_Create: 403 with the Thai message and no call', async () => {
    const s = setup(service, { roles: [] });
    expect(await s.json('/board/chat-prospect-create', form())).toEqual({ status: 403, body: { status: 403, message: 'ไม่มีสิทธิ์สร้างลูกค้าจากห้องแชท' } });
    expect(s.calls).toHaveLength(0);
    expect((await setup(service, roles).ask('/board/chat-prospect-create')).status).toBe(405);
  });

  it('400 when name, phone or product is missing', async () => {
    const s = setup(service, roles);
    const need = { status: 400, message: 'name, customerTel, movementTypeId required' };
    expect(await s.json('/board/chat-prospect-create', form({ name: '  ' }))).toEqual({ status: 400, body: need });
    expect((await s.json('/board/chat-prospect-create', form({ customerTel: '' }))).status).toBe(400);
    expect((await s.json('/board/chat-prospect-create', form({ movementTypeId: 0 }))).status).toBe(400);
    expect((await s.json('/board/chat-prospect-create', post({}))).status).toBe(400);
    expect((await s.json('/board/chat-prospect-create', { method: 'POST' })).status).toBe(400); // an empty body is an empty object
    expect(s.calls).toHaveLength(0);
  });

  it('a body that is not a JSON object is 500', async () => {
    const r = await setup(service, roles).json('/board/chat-prospect-create', post('<<<'));
    expect(r.status).toBe(500);
    expect(r.body['status']).toBe(500);
  });

  it('first step group of the product, then POST /prospects/chat; the branch is the branch of the signed-in user, not the form\'s; the answer goes back as it came', async () => {
    const s = setup(service, { ...roles, user: { branchId: 12 } });
    const r = await s.ask('/board/chat-prospect-create', form());
    expect(s.calls.map((c) => at([c], 0))).toEqual(['GET /master-data/activity-groups?movementTypeId=9', 'POST /prospects/chat']);
    expect(s.calls[1].body).toEqual({
      name: 'สมชาย', customerTel: '0812345678', marketingChanelId: 3, convenient: 'เช้า', ggwBranchId: 12, employeeId: 5, assignToId: 6, remark: 'หมายเหตุ', movementTypeId: 9, procedureGroupId: 301,
    });
    expect([r.status, r.text]).toEqual([200, '{"status":201,"result":{"id":99}}']);
  });

  it('the form\'s branch is used when the user has none; no step group (or a failing call) is procedureGroupId 0; an answer that is blank is "{}"; an error answer still comes back with HTTP 200', async () => {
    const noBranch = setup(service, { ...roles, user: { branchId: null } });
    await noBranch.ask('/board/chat-prospect-create', form());
    expect((noBranch.calls[1].body as Record<string, number>)['ggwBranchId']).toBe(77);
    const zero = setup(service, { ...roles, user: { branchId: 0 } });
    await zero.ask('/board/chat-prospect-create', form({ ggwBranchId: undefined }));
    expect((zero.calls[1].body as Record<string, number>)['ggwBranchId']).toBe(0);
    for (const groups of [env([]), { status: 500, text: '' }, { status: 200, text: '<html/>' }, env(['x'])] as FakeAnswer[]) {
      const s = setup((c) => (c.method === 'GET' ? groups : { status: 200, text: '{}' }), roles);
      await s.ask('/board/chat-prospect-create', form());
      expect((s.calls[1].body as Record<string, number>)['procedureGroupId']).toBe(0);
    }
    expect((await setup((c) => (c.method === 'GET' ? env([{ id: 1 }]) : { status: 200, text: '  ' }), roles).ask('/board/chat-prospect-create', form())).text).toBe('{}');
    const refused = await setup((c) => (c.method === 'GET' ? env([{ id: 1 }]) : { status: 400, text: '{"status":400,"message":"นี่คือข้อผิดพลาด"}' }), roles).ask('/board/chat-prospect-create', form());
    expect([refused.status, refused.text]).toEqual([200, '{"status":400,"message":"นี่คือข้อผิดพลาด"}']);
  });
});

describe('POST /board/lead-create (LeadCreateServlet)', () => {
  const create = (o: Record<string, unknown> = {}) => post({ prospectId: '7', movementTypeId: 1004400740, procedureGroupId: '101', assignToId: 0, employeeId: 0, ...o });
  const created = { status: 201, message: 'Created', result: { id: 5001, txNo: 'LD260001' } };

  it('only POST; 400 for an empty body (a literal text), without prospectId or movementTypeId; 500 for a body that is not JSON', async () => {
    const s = setup(() => created);
    expect((await s.ask('/board/lead-create')).status).toBe(405);
    const empty = await s.ask('/board/lead-create', { method: 'POST', body: '  ' });
    expect([empty.status, empty.text]).toEqual([400, '{"status":400,"message":"body required"}']);
    expect(await s.json('/board/lead-create', create({ prospectId: 0 }))).toEqual({ status: 400, body: { status: 400, message: 'prospectId และ movementTypeId จำเป็น' } });
    expect((await s.json('/board/lead-create', create({ movementTypeId: '' }))).status).toBe(400);
    expect((await s.json('/board/lead-create', post('<<<'))).status).toBe(500);
    expect(s.calls).toHaveLength(0);
  });

  it('POST /leads with saleGroupId (1004400001 unless given) and only the optional ids that are > 0; the answer of the service goes back as it came', async () => {
    const s = setup(() => ({ status: 201, text: JSON.stringify(created) }));
    const r = await s.ask('/board/lead-create', create());
    expect(at(s.calls, 0)).toBe('POST /leads');
    expect(s.calls[0].body).toEqual({ prospectId: 7, movementTypeId: 1004400740, saleGroupId: 1004400001, procedureGroupId: 101 });
    expect([r.status, r.text]).toEqual([200, JSON.stringify(created)]);
    const withAll = setup(() => ({ status: 201, text: '{"status":201}' }));
    await withAll.ask('/board/lead-create', create({ saleGroupId: 5, procedureGroupId: 0, assignToId: '8' }));
    expect(withAll.calls[0].body).toEqual({ prospectId: 7, movementTypeId: 1004400740, saleGroupId: 5, assignToId: 8 });
    expect(withAll.calls).toHaveLength(1); // employeeId 0: no assignment
  });

  it('a blank answer is the stand-in { status: 502 }, HTTP 200; an error answer of the service goes back as it came (HTTP 200)', async () => {
    const blank = await setup(() => null).ask('/board/lead-create', create({ employeeId: 5 }));
    expect([blank.status, blank.text]).toEqual([200, '{"status":502,"message":"backend ไม่ตอบ"}']);
    const refused = await setup(() => ({ status: 400, text: '{"status":400,"message":"Validation error"}' })).ask('/board/lead-create', create({ employeeId: 5 }));
    expect([refused.status, refused.text]).toEqual([200, '{"status":400,"message":"Validation error"}']);
  });

  it('with employeeId the owner is set afterwards by PATCH /leads/assign { leadId, employeeId }; ownerAssigned tells the page how it went', async () => {
    const s = setup((c) => (c.method === 'POST' ? { status: 201, text: JSON.stringify(created) } : { status: 200, text: '{"status":200}' }));
    const r = await s.json('/board/lead-create', create({ employeeId: '12' }));
    expect(s.calls.map((c) => at([c], 0))).toEqual(['POST /leads', 'PATCH /leads/assign']);
    expect(s.calls[1].body).toEqual({ leadId: 5001, employeeId: 12 });
    expect(r.body).toEqual({ ...created, ownerAssigned: true });
  });

  it('an assignment that fails: ownerAssigned false and the message of the service (or the default); one that does not answer or is not JSON gets the default', async () => {
    const msg = (assign: FakeAnswer) => setup((c) => (c.method === 'POST' ? { status: 201, text: JSON.stringify(created) } : assign)).json('/board/lead-create', create({ employeeId: 12 }));
    expect((await msg({ status: 400, text: '{"status":400,"message":"ไม่สามารถมอบหมาย"}' })).body).toMatchObject({ ownerAssigned: false, ownerAssignMessage: 'ไม่สามารถมอบหมาย' });
    expect((await msg({ status: 400, text: '{"status":400}' })).body).toMatchObject({ ownerAssigned: false, ownerAssignMessage: 'สร้าง Lead สำเร็จ แต่ผูกผู้รับผิดชอบไม่สำเร็จ' });
    expect((await msg({ status: 502, text: '<html/>' })).body).toMatchObject({ ownerAssigned: false, ownerAssignMessage: 'สร้าง Lead สำเร็จ แต่ผูกผู้รับผิดชอบไม่สำเร็จ' });
    // no answer = an empty object = no status 200/201/204 = not assigned (the message of the service is missing: the default)
    expect((await msg(null)).body).toMatchObject({ ownerAssigned: false, ownerAssignMessage: 'สร้าง Lead สำเร็จ แต่ผูกผู้รับผิดชอบไม่สำเร็จ' });
    expect((await msg({ status: 204, text: '' })).body).toMatchObject({ ownerAssigned: false });
    expect((await msg({ status: 200, text: '{"code":204}' })).body).toMatchObject({ ownerAssigned: true });
  });

  it('the lead id is read from leadId / id, then result, then results; none is ownerAssigned false with its own message and no PATCH', async () => {
    for (const shape of [{ status: 200, id: 4 }, { status: 201, leadId: 4 }, { status: 201, result: { leadId: 4 } }, { status: 201, results: { id: 4 } }]) {
      const s = setup((c) => (c.method === 'POST' ? { status: 201, text: JSON.stringify(shape) } : { status: 200, text: '{"status":200}' }));
      await s.ask('/board/lead-create', create({ employeeId: 1 }));
      expect((s.calls[1].body as Record<string, number>)['leadId']).toBe(4);
    }
    const s = setup(() => ({ status: 201, text: '{"status":201,"result":{"txNo":"x"}}' }));
    const r = await s.json('/board/lead-create', create({ employeeId: 1 }));
    expect(r.body).toMatchObject({ ownerAssigned: false, ownerAssignMessage: 'สร้าง Lead สำเร็จ แต่ response ไม่มี leadId จึงผูกผู้รับผิดชอบไม่ได้' });
    expect(s.calls).toHaveLength(1);
  });

  it('a create answer that is not a success, or not a JSON object, is returned untouched and nobody is assigned', async () => {
    for (const text of ['{"status":400,"message":"no"}', '<html>x</html>', '[1]', '{"status":500}']) {
      const s = setup(() => ({ status: 200, text }));
      expect((await s.ask('/board/lead-create', create({ employeeId: 3 }))).text).toBe(text);
      expect(s.calls).toHaveLength(1);
    }
  });
});

describe('GET /docproxy (through the routes)', () => {
  it('answers from the file server; only GET', async () => {
    const s = setup(() => ({}), {}, () => new Response('PDFDATA', { status: 200 }));
    const r = await s.ask('/docproxy?url=' + encodeURIComponent('http://f/http://f/prospect/1/a.pdf'));
    expect([r.status, r.res.headers.get('Content-Type'), r.text]).toEqual([200, 'application/pdf', 'PDFDATA']);
    expect(s.fileCalls).toEqual([{ method: 'GET', url: 'http://f/prospect/1/a.pdf' }]);
    expect(s.calls).toHaveLength(0); // the file server, never the REST service (it would get the Bearer token)
    expect((await s.ask('/docproxy?url=x', post({}))).status).toBe(405);
  });
});

describe('the routes', () => {
  it('a path that is not a prospect servlet is not answered (null → the next handler)', async () => {
    const { deps } = fakeRest(() => ({}));
    const h = prospectRoutes(deps);
    expect(await h('/board/leads', new URLSearchParams(), undefined)).toBeNull();
    expect(await h('/board/prospect-lists', new URLSearchParams(), undefined)).toBeNull();
    expect(await opportunityCreateRoutes(deps)('/board/prospect', new URLSearchParams(), undefined)).toBeNull();
  });
});
