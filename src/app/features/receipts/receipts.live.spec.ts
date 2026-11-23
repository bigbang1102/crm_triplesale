import { describe, expect, it } from 'vitest';
import type { RestResult } from '@core/live/rest';
import { fakeRest, type FakeCall, type FakeOptions } from '@core/live/rest-fake';
import { javaTrim, urlEncode } from './java-text';
import { createLiveReceipts } from './receipts.live';
import { liveReceiptFile } from './receipts.live.files';

const SERVICE = '/triplesale-service/api/v1';
const WRITE = 'CRM_RV_View,CRM_RV_Edit,FEATURE_CRM_Document';
const ENVELOPE = '{"status":502,"message":"backend ไม่ตอบหรือ response ไม่ใช่ JSON"}';
const CT = 'application/json; charset=UTF-8';

type Answer = RestResult | object | string | null;

/** a scripted service: `answer(call)` = what the REST service says (the path is below /api/v1); `calls` = what was asked */
function fake(answer: (c: FakeCall) => Answer | Promise<Answer>, o: FakeOptions = { roles: ['FEATURE_CRM_Document'] }) {
  const { deps, calls } = fakeRest(answer, o);
  return { deps, calls, backend: createLiveReceipts(deps) };
}
type Fake = ReturnType<typeof fake>;

const ask = async (f: Fake, url: string, init?: RequestInit) => {
  const res = await f.backend.fetch(url, init);
  return { status: res.status, type: res.headers.get('content-type'), text: await res.text() };
};
const get = (f: Fake, query: string) => ask(f, `/rvapi?${query}`);
const post = (f: Fake, query: string, body = '{}') => ask(f, `/rvapi?${query}`, { method: 'POST', body });
const paths = (f: Fake) => f.calls.map((c) => `${c.method} ${c.path}`);
const json = (t: string) => JSON.parse(t);
/** the REST service says this and nothing else: a body of any kind with a status */
const status = (s: number, text = ''): RestResult => ({ status: s, text });

describe('RvApiServlet / RvApiService, live', () => {
  describe('the servlet', () => {
    it('answers JSON in UTF-8, HTTP 200 for a good call', async () => {
      const f = fake(() => '{"status":200}');
      const r = await get(f, 'action=currencies');
      expect(r.status).toBe(200);
      expect(r.type).toBe(CT);
    });

    it('an unknown or missing action is 400 {"message":"unknown action"} — for GET and for POST — and the service is not asked', async () => {
      const f = fake(() => '{}');
      for (const q of ['action=nope', '', 'action=', 'action=create', 'action=approve&txno=x', 'action=attach&id=1']) {
        const r = await get(f, q);
        expect(r, q).toEqual({ status: 400, type: CT, text: '{"message":"unknown action"}' });
      }
      for (const q of ['action=list', 'action=detail&id=1', 'action=nope', '']) {
        const r = await post(f, q);
        expect(r, q).toEqual({ status: 400, type: CT, text: '{"message":"unknown action"}' });
      }
      expect(f.calls).toHaveLength(0);
    });

    it('the action is trimmed', async () => {
      const f = fake(() => '{"status":200}');
      expect((await get(f, 'action=%20currencies%20')).status).toBe(200);
      expect(paths(f)).toEqual([`GET /master-data/currencies`]);
    });

    it('a path that is not /rvapi is not its business (404); a method it has no handler for is 405', async () => {
      const f = fake(() => '{}');
      expect((await ask(f, '/rvapi2?action=list')).status).toBe(404);
      expect((await ask(f, '/rvapi?action=list', { method: 'PUT' })).status).toBe(405);
      expect((await ask(f, '/rvapi?action=list', { method: 'DELETE' })).status).toBe(405);
      expect(f.calls).toHaveLength(0);
    });

    it('the context path of the Java app in front of the address is ignored', async () => {
      const f = fake(() => '{"status":200}');
      expect((await ask(f, '/triplesale/rvapi?action=products')).status).toBe(200);
      expect(paths(f)).toEqual(['GET /master-data/movement-types/LD']);
    });

    it('an exception inside it is 500 {"message":"internal error"}', async () => {
      const f = fake(() => {
        throw new Error('boom');
      });
      expect(await get(f, 'action=list')).toEqual({ status: 500, type: CT, text: '{"message":"internal error"}' });
      expect(await post(f, 'action=approve&txno=X')).toEqual({ status: 500, type: CT, text: '{"message":"internal error"}' });
    });

    it('reading needs no role: a user with none still lists, reads a detail, the masters', async () => {
      const f = fake(() => '{"status":200}', { roles: [] });
      for (const q of ['action=list', 'action=detail&id=1', 'action=leads', 'action=materials', 'action=products', 'action=branches', 'action=currencies', 'action=receiveMethods', 'action=attachFileTypes']) {
        expect((await get(f, q)).status, q).toBe(200);
      }
    });

    describe('the roles of the writes (CRM_RV_View, CRM_RV_Edit or FEATURE_CRM_Document — any one is enough)', () => {
      const denied = (list = WRITE) => ({ status: 403, type: CT, text: `{"status":403,"message":"forbidden: ${list} required"}` });

      it('create, attach and approve are refused with 403 and that text, and the service is not asked', async () => {
        const f = fake(() => '{}', { roles: ['Something_Else'] });
        expect(await post(f, 'action=create', '{"payerCode":"P1"}')).toEqual(denied());
        expect(await post(f, 'action=attach&id=5')).toEqual(denied());
        expect(await post(f, 'action=approve&txno=RV:1')).toEqual(denied());
        expect(f.calls).toHaveLength(0);
      });

      it('each of the three roles opens them', async () => {
        for (const role of ['CRM_RV_View', 'CRM_RV_Edit', 'FEATURE_CRM_Document']) {
          const f = fake(() => '{"status":200}', { roles: [role] });
          expect((await post(f, 'action=create', '{}')).status, role).toBe(200);
          expect((await post(f, 'action=attach&id=5', '{}')).status, role).toBe(200);
          expect((await post(f, 'action=approve&txno=RV:1')).status, role).toBe(200);
        }
      });

      it('the check of approve comes before the check of txno: no role and no txno is 403, not 400', async () => {
        const f = fake(() => '{}', { roles: [] });
        expect((await post(f, 'action=approve')).status).toBe(403);
      });

      it('calculate has no role check', async () => {
        const f = fake(() => '{"status":200}', { roles: [] });
        expect((await post(f, 'action=calculate', '{"items":[]}')).status).toBe(200);
        expect(paths(f)).toEqual(['POST /rv/calculate']);
      });
    });
  });

  describe('list — GET /rv', () => {
    it('sends search, status, dateFrom, dateTo, page, pageSize in this order, trimmed and URL-encoded like URLEncoder (a space is +)', async () => {
      const f = fake(() => '{"status":200}');
      await get(f, 'action=list&search=%20ab%20c%20&status=new1&dateFrom=2026-01-01&dateTo=2026-01-31&page=2&pageSize=500');
      expect(f.calls[0]).toMatchObject({ method: 'GET', url: `${SERVICE}/rv?search=ab+c&status=new1&dateFrom=2026-01-01&dateTo=2026-01-31&page=2&pageSize=500`, headers: { Accept: 'application/json' } });
    });

    it('a parameter that is blank (or missing) is not sent at all; no parameter at all is /rv with no query', async () => {
      const f = fake(() => '{"status":200}');
      await get(f, 'action=list&search=%20%20&status=&pageSize=500');
      await get(f, 'action=list');
      expect(paths(f)).toEqual(['GET /rv?pageSize=500', 'GET /rv']);
    });

    it('Thai and special characters are percent-encoded as UTF-8; ! ~ * stay as URLEncoder leaves them', async () => {
      const f = fake(() => '{"status":200}');
      await get(f, 'action=list&search=' + encodeURIComponent('สมชาย & !~*\'()'));
      expect(f.calls[0].path).toBe('/rv?search=%E0%B8%AA%E0%B8%A1%E0%B8%8A%E0%B8%B2%E0%B8%A2+%26+%21%7E*%27%28%29');
    });

    it('passes the answer on as it came — also what the page does not know — with the whitespace around it', async () => {
      const body = ' {"status":200,"message":"x","result":{"items":[{"id":1}],"total":1,"extra":[1,2]}} ';
      const f = fake(() => body);
      expect(await get(f, 'action=list')).toEqual({ status: 200, type: CT, text: body });
    });

    it('the servlet read the answer line by line: a pretty-printed body reaches the page without its line breaks', async () => {
      const f = fake(() => '{\r\n  "status": 200,\n  "result": {\r  "total": 1\n  }\n}\n');
      expect((await get(f, 'action=list')).text).toBe('{  "status": 200,  "result": {  "total": 1  }}');
    });

    it('every answer that is not a JSON object is the 502 envelope with HTTP 200: not 200, 200 with HTML or an array or nothing, no answer', async () => {
      for (const a of [status(500, '{"status":500}'), status(404, '{"message":"x"}'), status(201, '{"a":1}'), status(204, ''), '<html>502</html>', '[1,2]', '', 'null', status(0, ''), null]) {
        const f = fake(() => a);
        expect(await get(f, 'action=list'), JSON.stringify(a)).toEqual({ status: 200, type: CT, text: ENVELOPE });
      }
    });
  });

  describe('detail — GET /rv/{id}, normalised', () => {
    const detail = async (result: object | string, id = '905') => {
      const f = fake(() => ({ status: 200, message: 'success', result }));
      const r = await get(f, `action=detail&id=${id}`);
      return { ...r, body: json(r.text), call: f.calls[0] };
    };

    it('asks /rv/{id} with the id trimmed and URL-encoded; an id that is missing is /rv/', async () => {
      const f = fake(() => '{}');
      await get(f, 'action=detail&id=%20905%20');
      await get(f, 'action=detail&id=a%20b%2Fc');
      await get(f, 'action=detail');
      expect(paths(f)).toEqual(['GET /rv/905', 'GET /rv/a+b%2Fc', 'GET /rv/']);
    });

    it('adds the currency symbol: THB or none = the baht sign, another currency its upper-case code and a space', async () => {
      expect((await detail({})).body.result.currency_symbol).toBe('฿');
      expect((await detail({ currency_code: 'THB' })).body.result.currency_symbol).toBe('฿');
      expect((await detail({ currency_code: ' usd ' })).body.result.currency_symbol).toBe('USD ');
    });

    it('fills the remark from the description (trimmed) when the remark is blank', async () => {
      expect((await detail({ description: '  ค่ามัดจำ ' })).body.result.remark).toBe('ค่ามัดจำ');
      expect((await detail({ remark: 'จริง', description: 'x' })).body.result.remark).toBe('จริง');
      expect((await detail({ remark: '  ', description: 'x' })).body.result.remark).toBe('x');
      expect((await detail({ description: '  ' })).body.result).not.toHaveProperty('remark');
    });

    it('reads every payment amount from medium_amount, then amount; a text with commas is a number; none is 0 and amount_available false', async () => {
      const r = (
        await detail({
          netamount_after_vat: 100,
          payment_items: [{ medium_amount: '27,300.00' }, { amount: 40 }, { medium_amount: 0, amount: 999 }, { medium_amount: 'abc' }, { medium_amount: null }, {}],
        })
      ).body.result;
      expect(r.payment_items.map((p: any) => [p.amount, p.amount_available])).toEqual([[27300, true], [40, true], [0, true], [0, false], [0, false], [0, false]]);
      expect(r.payments_total).toBe(27340);
      expect(r.change_amount).toBe(27240);
    });

    it('change = received − bill when more than half a satang, else 0; the bill is netamount_after_vat, pay_amount when that is not positive', async () => {
      expect((await detail({ netamount_after_vat: 100, payment_items: [{ medium_amount: 100.004 }] })).body.result.change_amount).toBe(0);
      expect((await detail({ netamount_after_vat: 100, payment_items: [{ medium_amount: 150 }] })).body.result.change_amount).toBe(50);
      expect((await detail({ netamount_after_vat: 0, pay_amount: 90, payment_items: [{ medium_amount: 100 }] })).body.result.change_amount).toBe(10);
      // a TEXT in the bill field is read by Double.parseDouble: "1,000.00" is not a number there, so the amount to pay is used
      expect((await detail({ netamount_after_vat: '1,000.00', pay_amount: 90, payment_items: [{ medium_amount: 100 }] })).body.result.change_amount).toBe(10);
      expect((await detail({ netamount_after_vat: '1000.00', pay_amount: 90, payment_items: [{ medium_amount: 1500 }] })).body.result.change_amount).toBe(500);
    });

    it('a receipt without payment_items gets no totals; payment_items that is not an array is left alone', async () => {
      const a = (await detail({ txno: 'RV:1' })).body.result;
      expect(a).not.toHaveProperty('payments_total');
      expect(a).not.toHaveProperty('change_amount');
      expect((await detail({ payment_items: 'x' })).body.result.payment_items).toBe('x');
    });

    it('an element of payment_items that is not an object is skipped untouched', async () => {
      const r = (await detail({ netamount_after_vat: 10, payment_items: [5, null, [1], { medium_amount: 10 }] })).body.result;
      expect(r.payment_items).toEqual([5, null, [1], { medium_amount: 10, amount_available: true, amount: 10 }]);
      expect(r.payments_total).toBe(10);
    });

    it('keeps every other field as the service sent it', async () => {
      const r = (await detail({ id: 905, txno: 'RV:M13-2610-00031', material_items: [{ materialcode: 'A', amount: 1.5 }] })).body;
      expect(r).toMatchObject({ status: 200, message: 'success', result: { id: 905, txno: 'RV:M13-2610-00031', material_items: [{ materialcode: 'A', amount: 1.5 }] } });
    });

    it('an answer without an object result is returned as the service wrote it (no normalising)', async () => {
      for (const body of ['{"status":200,"message":"nothing"}', '{"status":200,"result":null}', '{"status":200,"result":[1]}', '{"status":200,"result":"x"}', ' {"status": 200 , "result" : 5}']) {
        const f = fake(() => body);
        expect((await get(f, 'action=detail&id=1')).text, body).toBe(body);
      }
    });

    it('text that starts with { but is not JSON is returned as it came', async () => {
      const f = fake(() => '{oops');
      expect((await get(f, 'action=detail&id=1')).text).toBe('{oops');
    });

    it('a service that does not answer 200 (or not JSON) is the 502 envelope', async () => {
      for (const a of [status(404, '{"message":"x"}'), status(500, ''), '<html></html>', null]) {
        const f = fake(() => a);
        expect((await get(f, 'action=detail&id=1')).text).toBe(ENVELOPE);
      }
    });

    it('an amount that is not a finite number ("NaN", "Infinity") makes the servlet give up normalising: the answer goes on raw', async () => {
      const raw = '{"status":200,"result":{"payment_items":[{"medium_amount":"NaN"}]}}';
      const f = fake(() => raw);
      expect((await get(f, 'action=detail&id=1')).text).toBe(raw);
      const raw2 = '{"status":200,"result":{"payment_items":[{"medium_amount":"Infinity"}]}}';
      const g = fake(() => raw2);
      expect((await get(g, 'action=detail&id=1')).text).toBe(raw2);
    });
  });

  describe('leads — GET /rv/leads', () => {
    const content = [
      { id: 7, leadTxNo: 'LD:00-1', prospectCode: ' P00001 ', prospectName: 'สมชาย', employeeCode: 'E1', employeeName: 'พนักงาน', leadStatus: 'open' },
      { id: 8, leadTxNo: 'LD:00-2', prospectCode: '', prospectName: 'ไม่มีรหัส' },
      { id: 9, prospectCode: 'P00002' },
      'not an object',
      { prospectCode: '   ', prospectName: 'blank code' },
      { prospectCode: 'P00003', prospectName: '' },
    ];

    it('asks page=0&pageSize=500 and maps result.content to {leadId, code, name, txNo, employeeName, leadStatus}; a row without a prospectCode is skipped', async () => {
      const f = fake(() => ({ result: { content, totalPages: 1 } }));
      const r = await get(f, 'action=leads');
      expect(f.calls[0].path).toBe('/rv/leads?page=0&pageSize=500');
      expect(r.status).toBe(200);
      expect(json(r.text)).toEqual({
        result: [
          { leadId: 7, code: 'P00001', name: 'สมชาย', txNo: 'LD:00-1', employeeName: 'พนักงาน', leadStatus: 'open' },
          // (no name: the code; no lead number / employee / status: "")
          { leadId: 9, code: 'P00002', name: 'P00002', txNo: '', employeeName: '', leadStatus: '' },
          // (a name that is there but empty stays empty)
          { leadId: 0, code: 'P00003', name: '', txNo: '', employeeName: '', leadStatus: '' },
        ],
      });
      expect(Object.keys(json(r.text).result[0])).toEqual(['leadId', 'code', 'name', 'txNo', 'employeeName', 'leadStatus']);
    });

    it('adds &search= (trimmed, URL-encoded) only when there is a search text', async () => {
      const f = fake(() => ({ result: { content: [] } }));
      await get(f, 'action=leads&search=%20%E0%B8%AA%E0%B8%A1%20');
      await get(f, 'action=leads&search=%20%20');
      expect(paths(f)).toEqual(['GET /rv/leads?page=0&pageSize=500&search=%E0%B8%AA%E0%B8%A1', 'GET /rv/leads?page=0&pageSize=500']);
    });

    it('whatever goes wrong is {"result":[]} with HTTP 200 (never an error status)', async () => {
      for (const a of [status(500, '{"x":1}'), status(0), null, '', '<html>', '[1]', '{"result":null}', '{"result":{}}', '{"result":{"content":"x"}}', '{"result":[]}']) {
        const f = fake(() => a);
        expect(await get(f, 'action=leads'), JSON.stringify(a)).toEqual({ status: 200, type: CT, text: '{"result":[]}' });
      }
    });
  });

  describe('materials — master-data/materials, every page', () => {
    const rows = (from: number, n: number) => Array.from({ length: n }, (_, i) => ({ code: `M${from + i}`, name: `สินค้า ${from + i}`, standardSalePrice: from + i }));
    const pageOf = (c: FakeCall) => Number(new URL('http://x' + c.path).searchParams.get('page'));

    it('one short page: {code, name, salePrice} with the standard sale price, one call', async () => {
      const f = fake(() => ({ result: [{ code: 'A', name: 'ก', standardSalePrice: 350.5, other: 1 }, { code: 'B' }, { code: 'C', name: 'ค', standardSalePrice: '12.5' }, { code: 'D', standardSalePrice: 'x' }, { code: 'E', name: null }] }));
      const r = await get(f, 'action=materials');
      expect(paths(f)).toEqual(['GET /master-data/materials?page=1&pageSize=30']);
      expect(r).toEqual({
        status: 200,
        type: CT,
        text: '{"result":[{"code":"A","name":"ก","salePrice":350.5},{"code":"B","name":"B","salePrice":0},{"code":"C","name":"ค","salePrice":12.5},{"code":"D","name":"D","salePrice":0},{"code":"E","name":"E","salePrice":0}]}',
      });
    });

    it('goes on while a page is full of new codes, and stops at the first page that has fewer than 30', async () => {
      const f = fake((c) => ({ result: pageOf(c) === 1 ? rows(1, 30) : pageOf(c) === 2 ? rows(31, 30) : rows(61, 5) }));
      const r = await get(f, 'action=materials');
      expect(paths(f)).toEqual(['GET /master-data/materials?page=1&pageSize=30', 'GET /master-data/materials?page=2&pageSize=30', 'GET /master-data/materials?page=3&pageSize=30']);
      expect(json(r.text).result).toHaveLength(65);
    });

    it('stops at an empty page, at a page with no new code (the service does not page: the same list again), and a blank code is skipped, a repeated code once', async () => {
      const f1 = fake((c) => ({ result: pageOf(c) === 1 ? rows(1, 30) : [] }));
      expect(json((await get(f1, 'action=materials')).text).result).toHaveLength(30);
      expect(f1.calls).toHaveLength(2);

      const same = rows(1, 30);
      const f2 = fake(() => ({ result: same }));
      expect(json((await get(f2, 'action=materials')).text).result).toHaveLength(30);
      expect(f2.calls).toHaveLength(2);

      const f3 = fake(() => ({ result: [{ code: '  ', name: 'x' }, { code: ' A ', name: 'a' }, { code: 'A', name: 'again' }, 7, null] }));
      expect(json((await get(f3, 'action=materials')).text).result).toEqual([{ code: 'A', name: 'a', salePrice: 0 }]);
    });

    it('never asks for more than 40 pages', async () => {
      const f = fake((c) => ({ result: rows(pageOf(c) * 100, 30) }));
      const r = await get(f, 'action=materials');
      expect(f.calls).toHaveLength(40);
      expect(json(r.text).result).toHaveLength(1200);
    });

    it('a failure is {"result": what was read so far} with HTTP 200 — nothing if it was the first page', async () => {
      for (const a of [status(500, '{"x":1}'), status(0), null, '', '<html>', '[1]']) {
        const f = fake(() => a);
        expect(await get(f, 'action=materials'), JSON.stringify(a)).toEqual({ status: 200, type: CT, text: '{"result":[]}' });
        expect(f.calls).toHaveLength(1);
      }
      const f = fake((c) => (pageOf(c) === 1 ? { result: rows(1, 30) } : status(500, '{"x":1}')));
      expect(json((await get(f, 'action=materials')).text).result).toHaveLength(30);
      expect(f.calls).toHaveLength(2);
    });

    it('a result that is missing or not an array ends the scan (nothing found)', async () => {
      for (const a of ['{"status":200}', '{"result":null}', '{"result":{"a":1}}', '{"result":[]}']) {
        const f = fake(() => a);
        expect((await get(f, 'action=materials')).text, a).toBe('{"result":[]}');
      }
    });

    it('a price that is not a finite number ("NaN") abandons the scan: the rows before it stay', async () => {
      const f = fake(() => ({ result: [{ code: 'A', standardSalePrice: 5 }, { code: 'B', standardSalePrice: 'NaN' }, { code: 'C' }] }));
      expect(json((await get(f, 'action=materials')).text).result).toEqual([{ code: 'A', name: 'A', salePrice: 5 }]);
    });
  });

  describe('the masters passed on as the service sends them', () => {
    const table: [string, string][] = [
      ['products', '/master-data/movement-types/LD'],
      ['branches', '/master-data/business-branches?page=1&perPage=500'],
      ['currencies', '/master-data/currencies'],
      ['receiveMethods', '/master-data/receive-methods?txType=rv'],
      ['attachFileTypes', '/master-data/attach-file-types'],
    ];

    it.each(table)('%s: GET %s, the body untouched', async (action, path) => {
      const body = '{"status":200,"message":"success","result":[{"code":"A","extra":{"x":[1]}}]}';
      const f = fake(() => body);
      expect(await get(f, `action=${action}`)).toEqual({ status: 200, type: CT, text: body });
      expect(paths(f)).toEqual([`GET ${path}`]);
    });

    it.each(table)('%s: a refusal (409 with its reason), a failure, HTML, nothing at all — the 502 envelope, never the reason of the service', async (action) => {
      for (const a of [status(409, '{"status":409,"error":{"message":"กรุณาเลือกบริษัทก่อนใช้งาน"}}'), status(500, ''), '<html>', null, status(0)]) {
        const f = fake(() => a);
        expect(await get(f, `action=${action}`), JSON.stringify(a)).toEqual({ status: 200, type: CT, text: ENVELOPE });
      }
    });

    it('an empty result list is passed on (it means something to the page: no attachment types allowed)', async () => {
      const f = fake(() => '{"status":200,"result":[]}');
      expect((await get(f, 'action=attachFileTypes')).text).toBe('{"status":200,"result":[]}');
    });
  });

  describe('create — POST /rv and the check that it was saved', () => {
    const SAVED = '{"payerCode":"P00012","remark":"","items":[{"value":4672.0467289719625}]}';
    /** a service that counts receipts: `total` goes up by `grow` when the POST comes */
    const counting = (grow: number, api: Answer = { status: 200, message: 'success', result: { result: true, txno: 'RV:00-1' } }) => {
      let total = 40;
      return fake((c) => {
        if (c.method === 'POST') {
          total += grow;
          return api;
        }
        return { status: 200, result: { total, page: 1, pageSize: 1 } };
      });
    };

    it('counts, posts the body as it came (JSON, UTF-8), counts again — and says it was saved', async () => {
      const f = counting(1);
      const r = await post(f, 'action=create', SAVED);
      expect(paths(f)).toEqual(['GET /rv?page=1&pageSize=1', 'POST /rv', 'GET /rv?page=1&pageSize=1']);
      expect(f.calls[1]).toMatchObject({ body: SAVED, headers: { Accept: 'application/json', 'Content-Type': CT } });
      expect(r.status).toBe(200);
      expect(json(r.text)).toEqual({ api: { status: 200, message: 'success', result: { result: true, txno: 'RV:00-1' } }, verify: { totalBefore: 40, totalAfter: 41, foundByRemark: -1, persisted: true } });
    });

    it('a service that answers 200 but saves nothing (totals equal) is NOT persisted', async () => {
      const f = counting(0);
      expect(json((await post(f, 'action=create', SAVED)).text).verify).toEqual({ totalBefore: 40, totalAfter: 40, foundByRemark: -1, persisted: false });
    });

    it('a remark is searched too (trimmed, encoded): found = persisted even when the totals did not move; not found = what the totals say', async () => {
      const found = fake((c) => (c.method === 'POST' ? { status: 200 } : { result: { total: c.path.includes('search=') ? 2 : 40 } }));
      const r = await post(found, 'action=create', '{"remark":"  ค่า A  "}');
      expect(paths(found)).toEqual(['GET /rv?page=1&pageSize=1', 'POST /rv', 'GET /rv?page=1&pageSize=1', 'GET /rv?search=%E0%B8%84%E0%B9%88%E0%B8%B2+A&page=1&pageSize=1']);
      expect(json(r.text).verify).toEqual({ totalBefore: 40, totalAfter: 40, foundByRemark: 2, persisted: true });

      const none = fake((c) => (c.method === 'POST' ? { status: 200 } : { result: { total: c.path.includes('search=') ? 0 : 40 } }));
      expect(json((await post(none, 'action=create', '{"remark":"x"}')).text).verify).toEqual({ totalBefore: 40, totalAfter: 40, foundByRemark: 0, persisted: false });
    });

    it('a body that is not a JSON object is posted all the same, with no remark search', async () => {
      const f = counting(1);
      await post(f, 'action=create', 'not json');
      await post(f, 'action=create', '["remark"]');
      expect(f.calls.filter((c) => c.method === 'POST').map((c) => c.body)).toEqual(['not json', '["remark"]']);
      expect(f.calls.some((c) => c.path.includes('search='))).toBe(false);
    });

    it('the body is read as lines put together: the line breaks are gone', async () => {
      const f = counting(1);
      await post(f, 'action=create', '{"a":\r\n1,\n"b":2\r}');
      expect(f.calls.find((c) => c.method === 'POST')!.body).toBe('{"a":1,"b":2}');
    });

    it('the answer of the service is wrapped whatever its status: a refusal arrives as api, with the reason', async () => {
      const refusal = { status: 400, message: 'Validation error', error: { code: 'VALIDATION_ERROR', message: 'ไม่พบสาขา' } };
      const f = fake((c) => (c.method === 'POST' ? status(400, JSON.stringify(refusal)) : { result: { total: 40 } }));
      const r = json((await post(f, 'action=create', SAVED)).text);
      expect(r.api).toEqual(refusal);
      expect(r.verify.persisted).toBe(false);
    });

    it('an answer that is not a JSON object (HTML, nothing, a broken object) is {status:502, message, raw}; no answer at all has raw ""', async () => {
      const wrap = async (a: Answer) => {
        const f = fake((c) => (c.method === 'POST' ? a : { result: { total: 40 } }));
        return json((await post(f, 'action=create', SAVED)).text).api;
      };
      expect(await wrap('<html>502</html>')).toEqual({ status: 502, message: 'backend ไม่ตอบหรือ response ไม่ใช่ JSON', raw: '<html>502</html>' });
      expect(await wrap(status(500, ''))).toEqual({ status: 502, message: 'backend ไม่ตอบหรือ response ไม่ใช่ JSON', raw: '' });
      expect(await wrap('{broken')).toEqual({ status: 502, message: 'backend ไม่ตอบหรือ response ไม่ใช่ JSON', raw: '{broken' });
      // (what the HttpClient makes of a failed connection is not a body of the service)
      expect(await wrap(status(0, '{"isTrusted":true}'))).toEqual({ status: 502, message: 'backend ไม่ตอบหรือ response ไม่ใช่ JSON', raw: '' });
    });

    it('a total that cannot be read is -1; the totals text counts as a number ("41")', async () => {
      const f = fake((c) => (c.method === 'POST' ? { status: 200 } : status(500, '{"x":1}')));
      expect(json((await post(f, 'action=create', SAVED)).text).verify).toEqual({ totalBefore: -1, totalAfter: -1, foundByRemark: -1, persisted: false });
      let n = 40;
      const g = fake((c) => (c.method === 'POST' ? (n++, { status: 200 }) : { result: { total: String(n) } }));
      expect(json((await post(g, 'action=create', SAVED)).text).verify).toEqual({ totalBefore: 40, totalAfter: 41, foundByRemark: -1, persisted: true });
    });
  });

  describe('attach — POST /rv/{id}/attachments and the check', () => {
    it('counts attach_items of the receipt before and after', async () => {
      let n = 1;
      const f = fake((c) => {
        if (c.method === 'POST') {
          n++;
          return { status: 200 };
        }
        return { result: { attach_items: new Array(n).fill({}) } };
      });
      const r = await post(f, 'action=attach&id=%20905%20', '{"fileName":"a.pdf"}');
      expect(paths(f)).toEqual(['GET /rv/905', 'POST /rv/905/attachments', 'GET /rv/905']);
      expect(f.calls[1]).toMatchObject({ body: '{"fileName":"a.pdf"}', headers: { 'Content-Type': CT } });
      expect(json(r.text)).toEqual({ api: { status: 200 }, verify: { attachCountBefore: 1, attachCountAfter: 2, persisted: true } });
    });

    it('not persisted when nothing was added, or when the count cannot be read (-1)', async () => {
      const same = fake((c) => (c.method === 'POST' ? { status: 200 } : { result: { attach_items: [{}] } }));
      expect(json((await post(same, 'action=attach&id=1')).text).verify).toEqual({ attachCountBefore: 1, attachCountAfter: 1, persisted: false });
      const unreadable = fake((c) => (c.method === 'POST' ? { status: 200 } : { result: {} }));
      expect(json((await post(unreadable, 'action=attach&id=1')).text).verify).toEqual({ attachCountBefore: -1, attachCountAfter: -1, persisted: false });
    });
  });

  describe('calculate — POST /rv/calculate', () => {
    it('passes the body on and the answer back, or the 502 envelope', async () => {
      const f = fake(() => '{"status":200,"result":{"total":107}}');
      expect(await post(f, 'action=calculate', '{"items":[{"value":100}]}')).toEqual({ status: 200, type: CT, text: '{"status":200,"result":{"total":107}}' });
      expect(f.calls[0]).toMatchObject({ method: 'POST', path: '/rv/calculate', body: '{"items":[{"value":100}]}' });
      const bad = fake(() => status(500, ''));
      expect((await post(bad, 'action=calculate')).text).toBe(ENVELOPE);
    });
  });

  describe('approve — POST /rv/approve?txno=', () => {
    it('posts "{}" with the number as a query parameter (trimmed, URL-encoded), and passes the body on', async () => {
      const body = '{"status":200,"message":"success","result":{"result":true,"status":200,"hopDone":true,"message":"อนุมัติสำเร็จ","txno":"RV:00-1"}}';
      const f = fake(() => body);
      const r = await post(f, 'action=approve&txno=%20RV%3A00-2026%20');
      expect(r).toEqual({ status: 200, type: CT, text: body });
      expect(f.calls).toHaveLength(1);
      expect(f.calls[0]).toMatchObject({ method: 'POST', url: `${SERVICE}/rv/approve?txno=RV%3A00-2026`, body: '{}', headers: { 'Content-Type': CT } });
    });

    it('without a txno (missing or blank) it is 400 {"message":"txno required"} and the service is not asked', async () => {
      const f = fake(() => '{}');
      for (const q of ['action=approve', 'action=approve&txno=', 'action=approve&txno=%20%20']) {
        expect(await post(f, q), q).toEqual({ status: 400, type: CT, text: '{"message":"txno required"}' });
      }
      expect(f.calls).toHaveLength(0);
    });

    it('the body of a failed call goes on as it is (HTTP 200 of /rvapi): the page reads the status in it', async () => {
      for (const [a, text] of [
        [status(500, '{"status":500,"message":"Internal Server Error"}'), '{"status":500,"message":"Internal Server Error"}'],
        [status(403, '{"status":403,"message":"Forbidden"}'), '{"status":403,"message":"Forbidden"}'],
        [status(404, '{"status":404}'), '{"status":404}'],
      ] as const) {
        const f = fake(() => a);
        expect(await post(f, 'action=approve&txno=X')).toEqual({ status: 200, type: CT, text });
      }
    });

    it('a body that is not a JSON object, or no answer at all, is the 502 envelope', async () => {
      for (const a of [status(502, '<html>502</html>'), status(500, ''), null, status(0, '{"isTrusted":true}')]) {
        const f = fake(() => a);
        expect((await post(f, 'action=approve&txno=X')).text, JSON.stringify(a)).toBe(ENVELOPE);
      }
    });
  });

  describe('composed with the lead servlet the form uses', () => {
    it('/board/lead is answered by the shared lead routes (CRM_Lead_View, GET /leads/{id})', async () => {
      const lead = { id: 4, txNo: 'LD:1', prospect: { id: 9, name: 'ก' }, materialList: [] };
      const f = fake(() => ({ status: 200, result: lead }), { roles: ['CRM_Lead_View'] });
      const r = await ask(f, '/board/lead?id=4&activityGroupId=101');
      expect(r.status).toBe(200);
      expect(f.calls[0].path).toBe('/leads/4?activityGroupId=101');
      expect(json(r.text)).toMatchObject({ id: 4, txNo: 'LD:1', prospect: { id: 9, name: 'ก' } });
      const denied = fake(() => ({}), { roles: [] });
      expect((await ask(denied, '/board/lead?id=4')).status).toBe(403);
      expect(denied.calls).toHaveLength(0);
    });
  });
});

describe('the report files (RvJasperReportServlet, RvReceiptPdfServlet): no REST endpoint, a clear text', () => {
  const text = (f: { body: Uint8Array }) => new TextDecoder().decode(f.body);

  it('/rvreport: a txno that is missing or has other characters than letters, digits, : and - is 400 with the servlet\'s Thai text', () => {
    for (const url of ['/rvreport', '/rvreport?txno=', '/rvreport?txno=%20%20', '/rvreport?txno=a%20b', '/rvreport?txno=RV%3AM13%3Bdrop', '/rvreport?txno=a_b', '/rvreport?txno=RV%3AM13-1%27']) {
      const f = liveReceiptFile(url, 'th');
      expect(f.status, url).toBe(400);
      expect(f.type).toBe('text/plain; charset=UTF-8');
      expect(text(f), url).toBe('ต้องระบุ txno (เลขที่เอกสาร RV) ให้ถูกต้อง');
    }
  });

  it('/rvreport with a good txno (also with format=png and the context path): a 502 text that says the report system is not connected, and for which document', () => {
    for (const url of ['/rvreport?txno=RV%3AM13-2610-00031', '/triplesale/rvreport?txno=%20RV%3AM13-2610-00031%20&format=png']) {
      const th = liveReceiptFile(url, 'th');
      expect(th.status).toBe(502);
      expect(th.type).toBe('text/plain; charset=UTF-8');
      expect(text(th)).toMatch(/^เชื่อมต่อระบบรายงานไม่ได้: /);
      expect(text(th)).toContain('RV:M13-2610-00031');
      const en = liveReceiptFile(url, 'en');
      expect(text(en)).toMatch(/^Cannot connect to the report system: /);
      expect(text(en)).toContain('RV:M13-2610-00031');
    }
  });

  it('/rvreceipt: no id is 400 "missing id"; an id gets the 502 text with that id (Thai / English)', () => {
    expect(liveReceiptFile('/rvreceipt', 'th')).toMatchObject({ status: 400, type: 'text/plain; charset=UTF-8' });
    expect(text(liveReceiptFile('/rvreceipt?id=%20', 'th'))).toBe('missing id');
    const th = liveReceiptFile('/rvreceipt?id=905', 'th');
    expect(th.status).toBe(502);
    expect(text(th)).toContain('905');
    expect(text(th)).toMatch(/^สร้างไฟล์ PDF ของใบรับเงินไม่ได้/);
    expect(text(liveReceiptFile('/triplesale/rvreceipt?id=905', 'en'))).toMatch(/^Cannot make the PDF of the receipt.*905/);
  });

  it('another address is a 404 text', () => {
    expect(liveReceiptFile('/somethingelse?x=1', 'th')).toMatchObject({ status: 404 });
  });

  it('file() of the backend takes the language of the page', () => {
    const th = fake(() => '{}', { roles: [], lang: 'th' });
    const en = fake(() => '{}', { roles: [], lang: 'en' });
    expect(text(th.backend.file('/rvreport?txno=RV%3A1'))).toMatch(/^เชื่อมต่อระบบรายงานไม่ได้/);
    expect(text(en.backend.file('/rvreport?txno=RV%3A1'))).toMatch(/^Cannot connect to the report system/);
    expect(th.calls).toHaveLength(0); // (nothing is asked from any service)
  });
});

describe('the two JVM string behaviours', () => {
  it('trim() removes every character up to U+0020 and nothing else (a no-break space stays)', () => {
    expect(javaTrim(' \t\n\r\u0000\u001f x  ')).toBe('x');
    expect(javaTrim(' x ')).toBe(' x ');
    expect(javaTrim(' x')).toBe(' x');
  });
  it('URLEncoder.encode: a space is +, only A-Za-z0-9 . - * _ stay', () => {
    expect(urlEncode('a b')).toBe('a+b');
    expect(urlEncode('A-z_0.9*')).toBe('A-z_0.9*');
    expect(urlEncode("!'()~")).toBe('%21%27%28%29%7E');
    expect(urlEncode('RV:00/1&x=ก')).toBe('RV%3A00%2F1%26x%3D%E0%B8%81');
    expect(urlEncode(null)).toBe('');
  });
});
