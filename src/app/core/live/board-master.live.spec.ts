import { describe, expect, it } from 'vitest';
import { boardMasterRoutes, keepThaiProvincesOnly, masterItem, translate, translateDistrict, translateEnvelopeResult, translateProvince } from './board-master.live';
import { composeRoutes } from './rest';
import { fakeRest, type FakeAnswer, type FakeCall, type FakeOptions } from './rest-fake';

/** the master routes over a scripted service */
function setup(answer: (c: FakeCall) => FakeAnswer, o: FakeOptions = {}) {
  const { deps, calls } = fakeRest(answer, o);
  const fetchPage = composeRoutes(boardMasterRoutes(deps));
  return {
    deps,
    calls,
    ask: async (url: string) => {
      const r = await fetchPage(url);
      return { status: r.status, text: await r.text(), type: r.headers.get('content-type') };
    },
  };
}
const ok = (result: unknown) => ({ status: 200, message: 'OK', result });

describe('MasterDataItemBean', () => {
  it('keeps id / code / name / nameTh / colorCode / attachFile / postCode, typed like the bean (id a number, the rest text, null = empty)', () => {
    expect(masterItem({ id: '12', code: 7, name: null, extra: 'x', colorCode: '#fff' })).toEqual({
      id: 12,
      code: '7',
      name: '',
      nameTh: '',
      colorCode: '#fff',
      attachFile: '',
      postCode: '',
    });
    expect(masterItem({ id: 'abc' })).toMatchObject({ id: 0 });
  });

  it('adds `employee` (one level, normalised) only when the row has one', () => {
    const o = masterItem({ id: 1, name: 'ขาย', employee: { id: 9, code: 'E9', name: 'สมชาย', secret: 1 } });
    expect(o['employee']).toEqual({ id: 9, code: 'E9', name: 'สมชาย', nameTh: '', colorCode: '', attachFile: '', postCode: '' });
    expect('employee' in masterItem({ id: 1, employee: 'x' })).toBe(false);
    expect('employee' in masterItem({ id: 1 })).toBe(false);
  });
});

describe('MasterDataI18n', () => {
  const { deps } = fakeRest(() => ({}), { master: { en: { SALE: 'Sales', 'province.BKK': 'Bangkok', 'district.1001': 'Phra Nakhon', BLANK: '  ' }, th: { X: 'เอ็กซ์' } } });

  it('translate: the English name of the code (trimmed), else the fallback — also for a blank code or a blank translation', () => {
    expect(translate(deps, ' SALE ', 'ขาย')).toBe('Sales');
    expect(translate(deps, 'NOPE', 'ขาย')).toBe('ขาย');
    expect(translate(deps, '', 'ขาย')).toBe('ขาย');
    expect(translate(deps, null, 'ขาย')).toBe('ขาย');
    expect(translate(deps, 'BLANK', 'ขาย')).toBe('ขาย');
    expect(translateProvince(deps, 'BKK', 'กรุงเทพ')).toBe('Bangkok');
    expect(translateDistrict(deps, '1001', 'พระนคร')).toBe('Phra Nakhon');
    expect(translateProvince(deps, '', 'กรุงเทพ')).toBe('กรุงเทพ');
  });

  it('translateEnvelopeResult changes only `result[].name` and only in English; an unknown shape passes as it is', () => {
    const body = JSON.stringify({ status: 200, result: [{ code: 'SALE', name: 'ขาย' }, { code: 'ZZ', name: 'อื่น' }, 'x'] });
    expect(translateEnvelopeResult(deps, body, 'th')).toBe(body);
    expect(JSON.parse(translateEnvelopeResult(deps, body, 'en')).result).toEqual([{ code: 'SALE', name: 'Sales' }, { code: 'ZZ', name: 'อื่น' }, 'x']);
    expect(translateEnvelopeResult(deps, '{"status":200}', 'en')).toBe('{"status":200}');
    expect(translateEnvelopeResult(deps, 'not json', 'en')).toBe('not json');
    expect(translateEnvelopeResult(deps, '', 'en')).toBe('');
  });
});

describe('keepThaiProvincesOnly', () => {
  const row = (id: number, code: string, name: string) => ({ id, code, name });
  it('drops foreign / blank names and blank codes; of a repeated code the higher id wins and keeps the first place', () => {
    const out = keepThaiProvincesOnly([
      row(1, 'BKK', 'กรุงเทพมหานคร'),
      row(2, '\tCNX', 'เชียงใหม่'), // the code is trimmed: a tab in front is the same code as the clean row below
      row(3, 'CNX', 'เชียงใหม่ ใหม่'),
      row(4, 'TYO', 'Tokyo'),
      row(5, 'MIX', 'กรุงเทพ Bangkok'),
      row(6, '', 'ภูเก็ต'),
      row(7, 'BKK', 'กรุงเทพมหานคร'),
      row(8, 'NBS', 'ภูเก็ต '), // a no-break space is not white space for Java
      row(9, 'SPC', '  สระบุรี '),
      row(10, 'EMP', '   '),
    ]);
    expect(out.map((o) => [o['id'], o['code']])).toEqual([
      [7, 'BKK'],
      [3, 'CNX'],
      [9, 'SPC'],
    ]);
  });
});

describe('the master routes of the board', () => {
  describe('movement-types', () => {
    it('is the `result` of movement-types/LD as it came', async () => {
      const s = setup(() => ok([{ id: 1, code: 'LD-A', name: 'ผลิตภัณฑ์ A', usesWorkflowStep: true }]));
      const r = await s.ask('/board/movement-types');
      expect(r.status).toBe(200);
      expect(r.type).toBe('application/json; charset=UTF-8');
      expect(JSON.parse(r.text)).toEqual([{ id: 1, code: 'LD-A', name: 'ผลิตภัณฑ์ A', usesWorkflowStep: true }]);
      expect(s.calls.map((c) => [c.method, c.path])).toEqual([['GET', '/master-data/movement-types/LD']]);
    });

    it('is [] for anything that is not `status: 200` with a result (an error status, text, null result, a wrong status in the body)', async () => {
      for (const answer of [{ status: 403, text: '{"status":403}' }, { status: 500, text: '' }, 'plain text', '', '{"status":200,"result":null}', '{"status":204,"result":[]}', null]) {
        const s = setup(() => answer as FakeAnswer);
        expect(await s.ask('/board/movement-types')).toMatchObject({ status: 200, text: '[]' });
      }
    });

    it('renames by the English dictionary in English only (the Thai name stays where there is none)', async () => {
      const master = { en: { 'LD-A': 'Product A' } };
      const rows = ok([{ id: 1, code: 'LD-A', name: 'ผลิตภัณฑ์ A' }, { id: 2, code: 'LD-Z', name: 'อื่น' }]);
      expect(JSON.parse((await setup(() => rows, { master, lang: 'th' }).ask('/board/movement-types')).text).map((x: { name: string }) => x.name)).toEqual(['ผลิตภัณฑ์ A', 'อื่น']);
      expect(JSON.parse((await setup(() => rows, { master, lang: 'en' }).ask('/board/movement-types')).text).map((x: { name: string }) => x.name)).toEqual(['Product A', 'อื่น']);
    });

    it('English with a `result` that is not an array: the servlet failed after the call — 500 with the text it had', async () => {
      const s = setup(() => ok({ items: [] }), { lang: 'en' });
      expect(await s.ask('/board/movement-types')).toMatchObject({ status: 500, text: '{"items":[]}' });
    });
  });

  describe('master/movement-types', () => {
    it('forwards the type (LD by default) and answers the body of the service, or the 204 stand-in when there is none', async () => {
      const s = setup((c) => (c.path.endsWith('/LD') ? '{"status":200,"result":{"items":[1]}}' : { status: 404, text: '{"status":404}' }));
      expect((await s.ask('/board/master/movement-types')).text).toBe('{"status":200,"result":{"items":[1]}}');
      expect((await s.ask('/board/master/movement-types?type=%20%20')).text).toBe('{"status":200,"result":{"items":[1]}}');
      expect(await s.ask('/board/master/movement-types?type=XX')).toMatchObject({ status: 200, text: '{"status":204,"message":"no content","result":{"items":[]}}' });
      expect(s.calls.map((c) => c.path)).toEqual(['/master-data/movement-types/LD', '/master-data/movement-types/LD', '/master-data/movement-types/XX']);
    });
  });

  describe('lists through MasterDataItemBean', () => {
    const cases: [string, string][] = [
      ['/board/employees', '/master-data/employees'],
      ['/board/employees?saleGroupId=%203%20', '/master-data/employees?saleGroupId=3'],
      ['/board/sale-persons', '/master-data/sale-persons'],
      ['/board/sale-persons?saleGroupId=4', '/master-data/sale-persons?saleGroupId=4'],
      ['/board/sale-groups', '/master-data/sale-groups'],
      ['/board/tags', '/master-data/tags?key='],
      ['/board/fiscal-years', '/master-data/fiscal-years'],
      ['/board/material-groups', '/master-data/material-groups'],
      ['/board/materials?groupId=12', '/master-data/material-groups/12/materials'],
      ['/board/districts?provinceId=1', '/master-data/districts?provinceId=1'],
      ['/board/districts?provinceId=a%20b%2Fc', '/master-data/districts?provinceId=a+b%2Fc'],
      ['/board/sub-districts?districtId=1042', '/master-data/sub-districts?districtId=1042'],
    ];
    for (const [url, path] of cases) {
      it(`${url} asks ${path} and answers the normalised rows`, async () => {
        const s = setup(() => ok([{ id: 5, code: 'C', name: 'N', nameTh: 'T', colorCode: '#abc', attachFile: 'u.png', postCode: '10200', junk: 1 }, 'skip me', null]));
        const r = await s.ask(url);
        expect(r.status).toBe(200);
        expect(JSON.parse(r.text)).toEqual([{ id: 5, code: 'C', name: 'N', nameTh: 'T', colorCode: '#abc', attachFile: 'u.png', postCode: '10200' }]);
        expect(s.calls.map((c) => c.path)).toEqual([path]);
      });
    }

    it('without the id of the parent there is nothing to ask: [] and no call (materials, districts, sub-districts)', async () => {
      const s = setup(() => ok([{ id: 1 }]));
      for (const url of ['/board/materials', '/board/materials?groupId=%20', '/board/districts', '/board/sub-districts?districtId=']) {
        expect(await s.ask(url)).toMatchObject({ status: 200, text: '[]' });
      }
      expect(s.calls).toHaveLength(0);
    });

    it('is [] (status 200) when the service fails or answers something else — the dropdown stays empty', async () => {
      const bad: FakeAnswer[] = [
        { status: 500, text: '{"status":500}' },
        { status: 403, text: '{"status":403,"result":[{"id":1}]}' },
        '',
        '<html></html>',
        '[{"id":1}]',
        '{"status":200}',
        '{"status":"200","result":{"a":1}}',
        '{"status":201,"result":[{"id":1}]}',
        '{"result":[{"id":1}]}',
        null,
      ];
      for (const answer of bad) expect(await setup(() => answer).ask('/board/employees'), JSON.stringify(answer)).toMatchObject({ status: 200, text: '[]' });
      // (`status` as text "200" is read like org.json's getInt does)
      expect(JSON.parse((await setup(() => '{"status":"200","result":[{"id":1}]}').ask('/board/employees')).text)).toHaveLength(1);
    });

    it('provinces: only the Thai ones, once per code', async () => {
      const s = setup(() => ok([{ id: 1, code: 'BKK', name: 'กรุงเทพมหานคร' }, { id: 2, code: 'TYO', name: 'Tokyo' }, { id: 3, code: 'BKK', name: 'กรุงเทพมหานคร' }]));
      expect(JSON.parse((await s.ask('/board/provinces')).text).map((p: { id: number }) => p.id)).toEqual([3]);
      expect(s.calls.map((c) => c.path)).toEqual(['/master-data/provinces']);
    });
  });

  describe('metro-geo', () => {
    it('is the static file, 500 with [] when the app has none', async () => {
      expect(await setup(() => ({}), { assets: { 'assets/data/metro-geo.json': '[{"p":"02"}]' } }).ask('/board/metro-geo')).toMatchObject({ status: 200, text: '[{"p":"02"}]' });
      expect(await setup(() => ({}), { assets: { 'assets/data/metro-geo.json': '' } }).ask('/board/metro-geo')).toMatchObject({ status: 200, text: '[]' });
      expect(await setup(() => ({})).ask('/board/metro-geo')).toMatchObject({ status: 500, text: '[]' });
    });
  });

  describe('activity groups of a movement type / employees of an activity group', () => {
    const groups = '{"status":200,"result":[{"id":1,"code":"AG1","name":"กลุ่มหนึ่ง"}]}';

    it('is 400 without its parameter', async () => {
      const s = setup(() => groups);
      expect(await s.ask('/board/master/activity-groups')).toMatchObject({ status: 400, text: '{"error":"movementTypeId required"}' });
      expect(await s.ask('/board/master/employees-by-activity-group?activityGroupId=%20')).toMatchObject({ status: 400, text: '{"error":"activityGroupId required"}' });
      expect(s.calls).toHaveLength(0);
    });

    it('passes the body of the service as it is in Thai, renames `result[].name` in English, and is {} when there is no body', async () => {
      const th = setup(() => groups, { master: { en: { AG1: 'Group one' } } });
      expect((await th.ask('/board/master/activity-groups?movementTypeId=%205%20')).text).toBe(groups);
      expect(th.calls.map((c) => c.path)).toEqual(['/master-data/activity-groups?movementTypeId=5']);
      const en = setup(() => groups, { master: { en: { AG1: 'Group one' } }, lang: 'en' });
      expect(JSON.parse((await en.ask('/board/master/employees-by-activity-group?activityGroupId=7')).text).result[0].name).toBe('Group one');
      expect(en.calls.map((c) => c.path)).toEqual(['/master-data/employees/by-activity-group?activityGroupId=7']);
      expect(await setup(() => ({ status: 500, text: 'x' })).ask('/board/master/activity-groups?movementTypeId=1')).toMatchObject({ status: 200, text: '{}' });
    });
  });

  describe('chat master data', () => {
    it('knows its ten types and refuses another with 400', async () => {
      const s = setup(() => '{"status":200,"result":[]}');
      for (const type of ['marketing-channels', 'employees', 'sale-persons', 'branches', 'products', 'countries', 'business-types', 'occupations', 'communication-types', 'prospects']) {
        expect((await s.ask(`/board/chat-master-data?type=${type}`)).status).toBe(200);
      }
      expect(s.calls.map((c) => c.path)).toEqual([
        '/master-data/marketing-channels',
        '/master-data/employees',
        '/master-data/sale-persons',
        '/master-data/branches',
        '/master-data/movement-types/LD',
        '/master-data/countries?page=1&pageSize=1000',
        '/master-data/business-types?page=1&pageSize=1000',
        '/master-data/occupations?page=1&pageSize=1000',
        '/master-data/communication-types?page=1&pageSize=1000',
        '/master-data/prospects/search',
      ]);
      for (const url of ['/board/chat-master-data', '/board/chat-master-data?type=nope', '/board/chat-master-data?type=constructor']) {
        expect((await s.ask(url)).status).toBe(400);
      }
    });

    it('countries get their `nameTh` from the Thai dictionary (whatever the language of the page); the other types pass as they are; no body is {}', async () => {
      const body = '{"status":200,"result":[{"code":"JPN","name":"Japan","nameTh":"?"},{"code":"ZZZ","name":"Z","nameTh":"เดิม"}]}';
      const s = setup(() => body, { master: { th: { JPN: 'ญี่ปุ่น' } }, lang: 'en' });
      expect(JSON.parse((await s.ask('/board/chat-master-data?type=countries')).text).result.map((c: { nameTh: string }) => c.nameTh)).toEqual(['ญี่ปุ่น', 'เดิม']);
      expect((await s.ask('/board/chat-master-data?type=employees')).text).toBe(body);
      expect(await setup(() => ({ status: 500, text: 'x' })).ask('/board/chat-master-data?type=branches')).toMatchObject({ status: 200, text: '{}' });
    });
  });

  it('answers nothing (null → the composed backend gives 404) for a route that is not a master list', async () => {
    const s = setup(() => ok([]));
    expect((await s.ask('/board/leads')).status).toBe(404);
    expect(s.calls).toHaveLength(0);
  });
});
