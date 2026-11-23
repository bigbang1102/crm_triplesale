import { describe, expect, it } from 'vitest';
import { fullAddress, mapListRow, newBean, nameOnlyLabel, sexToDisplay, customerTypeToDisplay, stringToDate, dateToView, listQueryOf, listPathOf, LIST_TAKES_COUNTRY, type ListQuery } from './prospect-list.live';
import { prospectRoutes } from './prospect.live';
import { composeRoutes } from './rest';
import { fakeRest, type FakeAnswer, type FakeCall, type FakeOptions } from './rest-fake';

/** ProspectListService.java + ProspectListServlet.java + ProspectEnrichServlet.java, read line by line: what is expected below is what they did */
function setup(answer: (c: FakeCall) => FakeAnswer, o: FakeOptions = {}) {
  const { deps, calls } = fakeRest(answer, o);
  const route = composeRoutes(prospectRoutes(deps));
  return {
    calls,
    ask: async (url: string) => {
      const r = await route(url);
      return { status: r.status, type: r.headers.get('content-type'), text: await r.text() };
    },
  };
}
const body = (text: string) => JSON.parse(text) as { status: number; message: string; result: { items: Record<string, unknown>[]; meta: Record<string, unknown>; error?: boolean; errorStatus?: number } };
const envelope = (rows: unknown[], meta?: Record<string, unknown>) => ({ status: 200, message: 'OK', result: rows, ...(meta ? { meta } : {}) });

/** a row of GET /api/v1/prospects (view=FULL) */
const row = (o: Record<string, unknown> = {}) => ({
  id: '0193a000-0000-7000-8000-000000000007',
  code: 'P007',
  name: 'สมชาย',
  customerType: 'PERSON',
  sex: 'MALE',
  usageStatus: 'RELEASE',
  contactDate: '2026-11-02',
  createdAt: '2026-11-02T09:15:00+07:00',
  currentArea: { subDistrict: 'คลองเตย', district: 'เขตคลองเตย', province: 'กรุงเทพมหานคร', country: 'ไทย', postCode: '10110' },
  contactBack: { id: '0193a000-0000-7000-8000-0000000000c1', name: 'โทรศัพท์' },
  recorder: { id: '0193a000-0000-7000-8000-0000000000e1', code: 'E001', name: 'ธนพร' },
  responsible: { id: '0193a000-0000-7000-8000-0000000000e2', code: 'E011', name: 'สมศรี' },
  waitlist: { id: '0193a000-0000-7000-8000-0000000000d1', name: 'คิวกรุงเทพ' },
  ...o,
});
const ID7 = '0193a000-0000-7000-8000-000000000007';
const U1 = '0193a000-0000-7000-8000-0000000000a1';
const U2 = '0193a000-0000-7000-8000-0000000000a2';
const U3 = '0193a000-0000-7000-8000-0000000000a3';

const query = (o: Partial<ListQuery> = {}): ListQuery => ({
  page: 1,
  perPage: 20,
  searchText: '',
  sortKey: '',
  marketingChannelIds: [],
  currentCityId: '',
  currentDistrictId: '',
  salePersonId: '',
  enrich: false,
  lang: 'th',
  ...o,
});

describe('helpers of ProspectListService', () => {
  it('nameOnlyLabel: the name, else the code, both trimmed', () => {
    expect(nameOnlyLabel('C1', ' N ')).toBe('N');
    expect(nameOnlyLabel(' C1 ', '  ')).toBe('C1');
    expect(nameOnlyLabel(null, null)).toBe('');
  });

  it('sexToDisplay: 1 M m → ชาย, 2 F f → หญิง, the rest nothing', () => {
    expect(['1', 'M', 'm', ' M '].map(sexToDisplay)).toEqual(['ชาย', 'ชาย', 'ชาย', 'ชาย']);
    expect(['2', 'F', 'f'].map(sexToDisplay)).toEqual(['หญิง', 'หญิง', 'หญิง']);
    expect(['', 'x', 'ชาย', '3', 'male'].map(sexToDisplay)).toEqual(['', '', '', '', '']);
    expect(sexToDisplay(null)).toBe('');
  });

  it('customerTypeToDisplay: blank → "", juristic or company → องค์กร, anything else → บุคคลธรรมดา', () => {
    expect(['juristic', 'COMPANY', ' company '].map(customerTypeToDisplay)).toEqual(['องค์กร', 'องค์กร', 'องค์กร']);
    expect(['person', 'x'].map(customerTypeToDisplay)).toEqual(['บุคคลธรรมดา', 'บุคคลธรรมดา']);
    expect(customerTypeToDisplay('  ')).toBe('');
  });

  it('stringToDate reads yyyy-MM-dd like a lenient SimpleDateFormat: a time after it is ignored, a month 13 rolls over, rubbish is nothing', () => {
    expect(dateToView(stringToDate('2026-09-15')!)).toBe('15/09/2026');
    expect(dateToView(stringToDate('2026-09-15T23:59:59.000+07:00')!)).toBe('15/09/2026');
    expect(dateToView(stringToDate(' 2026-9-5')!)).toBe('05/09/2026');
    expect(dateToView(stringToDate('2026-13-01')!)).toBe('01/01/2027');
    expect(dateToView(stringToDate('2026-02-30')!)).toBe('02/03/2026');
    expect(dateToView(stringToDate('0026-01-02')!)).toBe('02/01/0026');
    expect(stringToDate('')).toBeNull();
    expect(stringToDate('15/09/2026')).toBeNull();
    expect(stringToDate('20260915')).toBeNull();
    expect(stringToDate('x')).toBeNull();
  });

  it('fullAddress: address, sub-district with แขวง (district starts with เขต) or ตำบล, district, province, post code; blanks skipped; nothing → the district field', () => {
    const b = newBean();
    b.currentAddress = ' 12/3 ถนนสุขุมวิท ';
    b.currentSubDistrictName = 'คลองเตย';
    b.currentDistrictName = 'เขตคลองเตย';
    b.currentCityName = 'กรุงเทพมหานคร';
    b.currentPostId = '10110';
    expect(fullAddress(b)).toBe('12/3 ถนนสุขุมวิท แขวงคลองเตย เขตคลองเตย กรุงเทพมหานคร 10110');
    b.currentSubDistrictName = 'ช้างคลาน';
    b.currentDistrictName = 'เมือง';
    expect(fullAddress(b)).toBe('12/3 ถนนสุขุมวิท ตำบลช้างคลาน เมือง กรุงเทพมหานคร 10110');
    for (const have of ['แขวงบางรัก', 'ตำบลหนองหอย', 'ต.แม่เหียะ']) {
      b.currentSubDistrictName = have;
      expect(fullAddress(b)).toContain(have);
      expect(fullAddress(b)).not.toContain('ตำบลต.');
    }
    const empty = newBean();
    expect(fullAddress(empty)).toBe('');
    empty.district = ' อำเภอสำรอง ';
    expect(fullAddress(empty)).toBe('อำเภอสำรอง');
    empty.currentPostId = '10200';
    expect(fullAddress(empty)).toBe('10200');
  });

});

describe('listQueryOf (GET /api/v1/prospects)', () => {
  it('page at least 1, perPage 20 when ≤ 0 and at most 100; q from 2 characters; only the names the service knows', () => {
    expect(listQueryOf(query({ page: -4, perPage: 0 }))).toMatchObject({ page: 1, perPage: 20 });
    expect(listQueryOf(query({ page: 3, perPage: 999 }))).toMatchObject({ page: 3, perPage: 100 });
    expect(listQueryOf(query({ searchText: ' ส ' }))).toMatchObject({ q: '' });
    expect(listQueryOf(query({ searchText: ' สม ' }))).toMatchObject({ q: 'สม' });
    expect(Object.keys(listQueryOf(query()))).toEqual(['page', 'perPage', 'q', 'sort', 'marketingChannelIds', 'currentProvinceId', 'currentDistrictId', 'responsibleEmployeeId', 'usageStatus', 'fromDate', 'toDate', 'countryId']);
  });

  it('ids of the filters are sent only when they are uuids (the old master data gave numbers: the service would answer 400)', () => {
    expect(listQueryOf(query({ currentCityId: '10', currentDistrictId: U2, salePersonId: '12', marketingChannelIds: ['1', U3] }))).toMatchObject({
      currentProvinceId: '',
      currentDistrictId: U2,
      responsibleEmployeeId: '',
      marketingChannelIds: [U3],
    });
  });

  it('the sort keys of the buttons: date_desc → -createdAt (the default), date_asc → createdAt, name_asc → name, name_desc → -name; unknown → none', () => {
    const sort = (k: string) => listQueryOf(query({ sortKey: k })).sort;
    expect(['date_desc', 'date_asc', 'name_asc', 'name_desc', 'bogus'].map(sort)).toEqual(['-createdAt', 'createdAt', 'name', '-name', '']);
  });
});

describe('listQueryOf: the status chips and the date range', () => {
  it('active / draft / suspended -> usageStatus RELEASE / DRAFT / BLOCK; all (or anything else) sends none', () => {
    const u = (status: string) => (listQueryOf(query({ status })) as Record<string, unknown>)['usageStatus'];
    expect(['active', 'draft', 'suspended', '', 'bogus'].map(u)).toEqual(['RELEASE', 'DRAFT', 'BLOCK', '', '']);
  });

  it('fromDate / toDate only as yyyy-MM-dd; anything else is left out', () => {
    expect(listQueryOf(query({ fromDate: '2026-11-01', toDate: ' 2026-11-30 ' }))).toMatchObject({ fromDate: '2026-11-01', toDate: '2026-11-30' });
    expect(listQueryOf(query({ fromDate: '01/11/2026', toDate: '2026-1-3' }))).toMatchObject({ fromDate: '', toDate: '' });
  });

  it('the country filter of the popup is sent as countryId when it is a uuid; a number (the old master data) is left out; the switch turns it off', () => {
    expect(LIST_TAKES_COUNTRY).toBe(true);
    expect(listQueryOf(query({ currentCountryId: U1 }))).toMatchObject({ countryId: U1 });
    expect(listQueryOf(query({ currentCountryId: '5' }))).toMatchObject({ countryId: '' });
    expect(listQueryOf(query({ currentCountryId: U1 }), { country: false })).toMatchObject({ countryId: '' });
  });

  it('deleted is the trash: GET /prospects/trash with page, perPage and q only (a sort or a filter would be a 400)', () => {
    expect(listPathOf(query({ status: 'deleted' }))).toBe('/prospects/trash');
    expect(listPathOf(query({ status: 'active' }))).toBe('/prospects');
    expect(listQueryOf(query({ status: 'deleted', page: 2, searchText: 'ab', sortKey: 'name_asc', fromDate: '2026-11-01', currentCityId: U1 }))).toEqual({ page: 2, perPage: 20, q: 'ab' });
  });
});

describe('GET /board/prospect-list: status and dates', () => {
  it('sends usageStatus, fromDate and toDate', async () => {
    const s = setup(() => envelope([]));
    await s.ask('/board/prospect-list?status=draft&fromDate=2026-11-01&toDate=2026-11-30');
    expect(s.calls[0].path).toBe('/prospects?page=1&perPage=20&usageStatus=DRAFT&fromDate=2026-11-01&toDate=2026-11-30');
  });

  it('the chip deleted reads the trash and the rows say deleted', async () => {
    const s = setup(() => envelope([row({ usageStatus: undefined })]));
    const { result } = body((await s.ask('/board/prospect-list?status=deleted&sortBy=name_asc')).text);
    expect(s.calls[0].path).toBe('/prospects/trash?page=1&perPage=20');
    expect(result.items[0]).toMatchObject({ status: 'app.prospects.statusDeleted' });
  });
});

describe('mapListRow (a row of GET /api/v1/prospects)', () => {
  it('a row that is not an object is an empty bean', () => {
    expect(mapListRow(null)).toEqual(newBean());
  });

  it('the current address: currentCountry / currentProvince / currentDistrict ({ id, code, name }, or a text) fill the country, the province and the district', () => {
    const thai = mapListRow(row({ currentArea: null, currentCountry: { id: 'c1', code: 'THA', name: 'ไทย' }, currentProvince: { id: 'v1', name: 'กรุงเทพมหานคร' }, currentDistrict: { id: 'd1', name: 'บางรัก' } }));
    expect(thai).toMatchObject({ currentCountryName: 'ไทย', currentCountryCode: 'THA', currentCityName: 'กรุงเทพมหานคร', currentDistrictName: 'บางรัก' });
    const abroad = mapListRow(row({ currentArea: null, currentCountry: { id: 'c2', code: 'JPN', name: 'ญี่ปุ่น' }, currentProvince: 'โตเกียว' }));
    expect(abroad).toMatchObject({ currentCountryName: 'ญี่ปุ่น', currentCountryCode: 'JPN', currentCityName: 'โตเกียว' });
    // a null (the service has no such place): what currentArea said stays; with neither, empty
    expect(mapListRow(row({ currentCountry: null, currentProvince: null, currentDistrict: null }))).toMatchObject({ currentCityName: 'กรุงเทพมหานคร', currentDistrictName: 'เขตคลองเตย' });
    expect(mapListRow(row({ currentArea: null, currentCountry: null }))).toMatchObject({ currentCountryName: '', currentCityName: '', currentDistrictName: '' });
  });

  it('the responsible person is `responsibleEmployee` (the older `responsible` still works); it fills the owner and the sale-person columns', () => {
    const person = { id: 'e9', code: 'E099', name: 'สมชาย' };
    expect(mapListRow(row({ responsible: null, responsibleEmployee: person }))).toMatchObject({ owner: 'สมชาย', ownerId: 'e9', salepersoncode: 'E099', employeeSales: 'สมชาย' });
    expect(mapListRow(row({ responsible: null, responsibleEmployee: { id: 'e8', code: 'E08' } }))).toMatchObject({ owner: 'E08', ownerId: 'e8' });
    expect(mapListRow(row({ responsible: person, responsibleEmployee: undefined }))).toMatchObject({ owner: 'สมชาย' });
    expect(mapListRow(row({ responsible: null, responsibleEmployee: null }))).toMatchObject({ owner: '', ownerId: '' });
  });

  it('reads the row: uuid id, code, name, sex, type, date, the area, the contact channel, the recorder and the responsible person', () => {
    expect(mapListRow(row())).toMatchObject({
      customerId: 0,
      rowId: ID7,
      customerCode: 'P007',
      customerName: 'สมชาย',
      gender: 'ชาย',
      customerType: 'บุคคลธรรมดา',
      currentSubDistrictName: 'คลองเตย',
      currentDistrictName: 'เขตคลองเตย',
      currentCityName: 'กรุงเทพมหานคร',
      currentCountryName: 'ไทย',
      currentPostId: '10110',
      contactBackname: 'โทรศัพท์',
      createby: 'ธนพร',
      owner: 'สมศรี',
      ownerId: '0193a000-0000-7000-8000-0000000000e2',
      salepersoncode: 'E011',
      employeeSales: 'สมศรี',
      saleGroupName: 'คิวกรุงเทพ',
      tel: '-',
    });
    expect(mapListRow(row()).dateSave).toEqual({ y: 2026, m: 11, d: 2 });
  });

  it('FEMALE → หญิง, a juristic person → องค์กร; a missing date falls back to createdAt; people and queue may be null', () => {
    const b = mapListRow(row({ sex: 'FEMALE', customerType: 'JURISTIC', contactDate: null, recorder: null, responsible: null, waitlist: null }));
    expect(b).toMatchObject({ gender: 'หญิง', customerType: 'องค์กร', createby: '', owner: '', employeeSales: '', saleGroupName: '' });
    expect(b.dateSave).toEqual({ y: 2026, m: 11, d: 2 });
  });

  it('the source is marketingChannel, as { id, name } or as text; none → ""', () => {
    expect(mapListRow(row({ marketingChannel: { id: U1, name: 'Facebook' } })).source).toBe('Facebook');
    expect(mapListRow(row({ marketingChannel: 'Line' })).source).toBe('Line');
    expect(mapListRow(row()).source).toBe('');
  });

  it('the phone: the dial code and the number as sent (mainPhone, customerTel, phone or tel); none → a dash; a dial code that is **** hides the number: ****', () => {
    expect(mapListRow(row({ phoneCountryCode: '+66', mainPhone: '0812345678' }))).toMatchObject({ phoneCountryCode: '+66', tel: '0812345678' });
    expect(mapListRow(row({ phoneCountryCode: '+66', customerTel: ' 0899990000 ' })).tel).toBe('0899990000');
    expect(mapListRow(row({ phoneCountryCode: '+66' })).tel).toBe('-');
    expect(mapListRow(row()).tel).toBe('-');
    expect(mapListRow(row({ phoneCountryCode: '****', mainPhone: '0812345678' }))).toMatchObject({ phoneCountryCode: '****', tel: '****' });
    expect(mapListRow(row({ phoneCountryCode: '****' })).tel).toBe('****');
  });

  it('the row the page draws carries the phone and its dial code (phone / phonecc), **** when the code is hidden', async () => {
    const s = setup(() => envelope([row({ phoneCountryCode: '+66', mainPhone: '0812345678' }), row({ id: U1, phoneCountryCode: '****', mainPhone: '0812345678' })]));
    const items = body((await s.ask('/board/prospect-list')).text).result.items;
    expect(items[0]).toMatchObject({ phone: '0812345678', phonecc: '+66' });
    expect(items[1]).toMatchObject({ phone: '****', phonecc: '****' });
  });

  it('a hidden field stays as the service sent it (****)', () => {
    expect(mapListRow(row({ name: '****' })).customerName).toBe('****');
  });
});

describe('GET /board/prospect-list (answered from GET /api/v1/prospects)', () => {
  it('asks GET /prospects with nothing but page and perPage when the page sends no filter', async () => {
    const s = setup(() => envelope([]));
    const r = await s.ask('/board/prospect-list');
    expect(r.status).toBe(200);
    expect(r.type).toBe('application/json; charset=UTF-8');
    expect(s.calls.map((c) => [c.method, c.path])).toEqual([['GET', '/prospects?page=1&perPage=20']]);
    expect(s.calls[0].headers).toMatchObject({ Accept: 'application/json' });
  });

  it('sends the filters it can: q, sort, one marketingChannelIds per uuid, province, district, responsible', async () => {
    const s = setup(() => envelope([]));
    await s.ask(`/board/prospect-list?page=2&perPage=50&searchText=%20%E0%B8%AA%E0%B8%A1%20&sortBy=name_asc&marketingChannelIds=${U1},${U2}&currentCityId=${U3}&currentDistrictId=7&salePersonId=${U1}&currentCountryId=${U2}`);
    expect(s.calls[0].path).toBe(
      `/prospects?page=2&perPage=50&q=%E0%B8%AA%E0%B8%A1&sort=name&marketingChannelIds=${U1}&marketingChannelIds=${U2}&currentProvinceId=${U3}&responsibleEmployeeId=${U1}&countryId=${U2}`,
    );
  });

  it('clamps: page < 1 or not a number is 1; perPage ≤ 0 or not a number is 20; above 100 is 100', async () => {
    const paths = async (q: string) => {
      const s = setup(() => envelope([]));
      await s.ask('/board/prospect-list?' + q);
      return s.calls[0].path;
    };
    expect(await paths('page=0&perPage=0')).toBe('/prospects?page=1&perPage=20');
    expect(await paths('page=abc&perPage=1.5')).toBe('/prospects?page=1&perPage=20');
    expect(await paths('page=%2B4&perPage=201')).toBe('/prospects?page=4&perPage=100');
    expect(await paths('page=5&perPage=100')).toBe('/prospects?page=5&perPage=100');
  });

  it('answers { status: 200, message: "success", result: { items, meta } } with the rows the page draws (the uuid is the id)', async () => {
    const s = setup(() => envelope([row()], { page: 1, perPage: 20, total: 271, totalPages: 14 }));
    const { status, result } = body((await s.ask('/board/prospect-list')).text);
    expect(status).toBe(200);
    expect(result.meta).toEqual({ page: 1, perPage: 20, total: 271, totalPages: 14 });
    expect(result.items).toHaveLength(1);
    expect(result.items[0]).toMatchObject({
      id: ID7,
      code: 'P007',
      name: 'สมชาย',
      date: '02/11/2026',
      gender: 'ชาย',
      type: 'บุคคลธรรมดา',
      province: 'กรุงเทพมหานคร',
      district: 'เขตคลองเตย',
      subdistrict: 'แขวงคลองเตย',
      country: 'ไทย',
      addr: 'แขวงคลองเตย เขตคลองเตย กรุงเทพมหานคร 10110',
      agentcode: 'E011',
      agent: 'สมศรี',
      owner: 'สมศรี',
      ownerid: '0193a000-0000-7000-8000-0000000000e2',
      recorder: 'ธนพร',
      team: 'คิวกรุงเทพ',
      availchannel: 'โทรศัพท์',
      status: 'app.prospects.statusActive',
    });
  });

  it('the status column follows usageStatus: DRAFT, BLOCK, RELEASE; another value is blank', async () => {
    const st = async (u: string) => body((await setup(() => envelope([row({ usageStatus: u })])).ask('/board/prospect-list')).text).result.items[0]['status'];
    expect([await st('DRAFT'), await st('BLOCK'), await st('RELEASE'), await st('x')]).toEqual(['app.prospects.statusDraft', 'app.prospects.statusSuspended', 'app.prospects.statusActive', '']);
  });

  it('asks no quick-view per row, even with enrich=1: the row already carries the panel data', async () => {
    const s = setup(() => envelope([row(), row({ id: U1 })]));
    await s.ask('/board/prospect-list?enrich=1');
    expect(s.calls).toHaveLength(1);
  });

  it('without meta it is { page, perPage as asked, -1, -1 }; "results" is read when there is no "result"; non-object entries are empty rows', async () => {
    const none = body((await setup(() => envelope([row()])).ask('/board/prospect-list?page=2&perPage=0')).text).result.meta;
    expect(none).toEqual({ page: 2, perPage: 0, total: -1, totalPages: -1 });
    const items = body((await setup(() => ({ status: 200, results: [row({ id: U2 }), 5, null] })).ask('/board/prospect-list')).text).result.items;
    expect(items.map((i) => i['id'])).toEqual([U2, 0, 0]);
  });

  it('a list that failed is HTTP 200 with result.error and the status of the service (0 = no answer) — not "no customers"', async () => {
    const failing = async (a: FakeAnswer) => body((await setup(() => a).ask('/board/prospect-list')).text);
    expect((await failing({ status: 403, text: '{"message":"no"}' })).result).toEqual({ items: [], meta: {}, error: true, errorStatus: 403 });
    expect((await failing({ status: 400, text: '{"error":{"code":"VALIDATION_ERROR"}}' })).result).toMatchObject({ error: true, errorStatus: 400 });
    expect((await failing(null)).result).toMatchObject({ error: true, errorStatus: 0 });
    expect((await failing({ status: 200, text: '<html>login</html>' })).result).toMatchObject({ error: true, errorStatus: 200 });
    expect(await failing({ status: 502, text: 'bad gateway' })).toMatchObject({ status: 200, message: 'success' });
  });

  it('only GET: another method is 405', async () => {
    const { deps } = fakeRest(() => ({}));
    const r = await composeRoutes(prospectRoutes(deps))('/board/prospect-list', { method: 'POST' });
    expect(r.status).toBe(405);
  });
});

describe('GET /board/prospect-enrich: a row of the new service (uuid) asks the record with its sections', () => {
  const REC = {
    status: 200,
    result: {
      base: {
        id: ID7,
        code: 'P007',
        name: 'สมชาย',
        sex: 'MALE',
        customerType: 'PERSON',
        email: 'somchai@mail.com',
        convenient: 'หลัง 18:00',
        contactBack: { id: 'c1', name: 'โทรศัพท์' },
        currentAddress: { address: '12/3 ถนนสุขุมวิท', subDistrict: { name: 'คลองเตย' }, district: { name: 'เขตคลองเตย' }, province: { name: 'กรุงเทพมหานคร' }, country: { code: 'THA', name: 'Thailand' }, postCode: '10110' },
        marketingChannel: { id: 'm1', name: 'Facebook' },
        phoneCountryCode: '+66',
        mainPhone: '0812345678',
        recorder: { id: 'e1', code: 'E001', name: 'ธนพร' },
        responsible: { id: 'e2', code: 'E011', name: 'สมศรี' },
        waitlist: { id: 'w1', name: 'คิวกรุงเทพ' },
      },
      socialAccounts: [
        { channelType: 'LINE', accountId: 'Usample0001' },
        { channelType: 'FACEBOOK', displayName: 'Somchai FB' },
        { channelType: 'INSTAGRAM', accountId: 'somchai.ig' },
        { channelType: 'TIKTOK', accountId: 'ignored' },
      ],
    },
  };

  it('asks GET /prospects/{id}?sections=BASE,SOCIAL,ATTACHMENTS,OPPORTUNITIES once and answers the keys of the panel', async () => {
    const s = setup(() => REC);
    const r = await s.ask(`/board/prospect-enrich?ids=${ID7}`);
    expect(s.calls.map((c) => [c.method, c.path])).toEqual([['GET', `/prospects/${ID7}?sections=BASE%2CSOCIAL%2CATTACHMENTS%2COPPORTUNITIES`]]);
    expect(JSON.parse(r.text).result[ID7]).toMatchObject({
      code: 'P007',
      gender: 'ชาย',
      type: 'บุคคลธรรมดา',
      email: 'somchai@mail.com',
      line: 'Usample0001',
      fb: 'Somchai FB',
      ig: 'somchai.ig',
      x: '',
      availtime: 'หลัง 18:00',
      availchannel: 'โทรศัพท์',
      addr: 'แขวงคลองเตย เขตคลองเตย กรุงเทพมหานคร 10110'.replace('แขวงคลองเตย', '12/3 ถนนสุขุมวิท แขวงคลองเตย'),
      province: 'กรุงเทพมหานคร',
      subdistrict: 'แขวงคลองเตย',
      source: 'Facebook',
      phone: '0812345678',
      phonecc: '+66',
      recorder: 'ธนพร',
      owner: 'สมศรี',
      ownerid: 'e2',
      team: 'คิวกรุงเทพ',
    });
  });

  it('a dial code that is **** hides the phone: ****; a record that does not come leaves the row as the list gave it (no key for it)', async () => {
    const hidden = setup(() => ({ status: 200, result: { ...REC.result, base: { ...REC.result.base, phoneCountryCode: '****' } } }));
    expect(JSON.parse((await hidden.ask(`/board/prospect-enrich?ids=${ID7}`)).text).result[ID7]).toMatchObject({ phone: '****', phonecc: '****' });
    const missing = setup(() => ({ status: 404, text: '{}' }));
    expect(JSON.parse((await missing.ask(`/board/prospect-enrich?ids=${ID7}`)).text).result).toEqual({});
  });

  it('several rows are asked one after the other (no parallel calls); a number among the uuids is skipped', async () => {
    const s = setup((c) => (c.path.startsWith('/prospects/7/quick-view') ? { status: 200, result: { code: 'OLD' } } : REC));
    const r = await s.ask(`/board/prospect-enrich?ids=7,${ID7},${U1}`);
    expect(s.calls.map((c) => c.path)).toEqual([`/prospects/${ID7}?sections=BASE%2CSOCIAL%2CATTACHMENTS%2COPPORTUNITIES`, `/prospects/${U1}?sections=BASE%2CSOCIAL%2CATTACHMENTS%2COPPORTUNITIES`]);
    expect(Object.keys(JSON.parse(r.text).result).sort()).toEqual([ID7, U1].sort());
  });
});

describe('the documents tab of the panel: what came with the record (sections=...,ATTACHMENTS)', () => {
  const ATT = [
    { id: 'a-1', type: { id: 't1', name: 'บัตรประชาชน' }, description: 'สำเนาบัตร', createdAt: '2026-11-12T08:31:00Z', downloadUrl: '/api/v1/prospects/x/attachments/a-1' },
    { id: 'a-2', type: { id: 't2', name: 'สัญญา' }, description: '', createdAt: '2026-11-13T08:31:00Z', downloadUrl: '/api/v1/prospects/x/attachments/a-2' },
  ];

  it('the first read of /board/prospect/attachments?prospectId=<uuid> takes the documents of the enrich (no call); a later one asks the record with every section', async () => {
    const id = '019b0000-0000-7000-8000-000000009420';
    const s = setup(() => ({ status: 200, result: { base: { id, code: 'P020' }, attachments: ATT } }));
    await s.ask(`/board/prospect-enrich?ids=${id}`);
    expect(s.calls).toHaveLength(1);
    const first = JSON.parse((await s.ask(`/board/prospect/attachments?prospectId=${id}`)).text) as { result: Array<Record<string, unknown>> };
    expect(s.calls).toHaveLength(1); // no call of its own
    expect(first.result.map((a) => [a['docNo'], a['fileName'], a['attachFile']])).toEqual([
      ['a-1', 'สำเนาบัตร', '/api/v1/prospects/x/attachments/a-1'],
      ['a-2', 'สัญญา', '/api/v1/prospects/x/attachments/a-2'],
    ]);
    const later = JSON.parse((await s.ask(`/board/prospect/attachments?prospectId=${id}`)).text) as { result: unknown[] };
    expect(s.calls.map((c) => c.path)).toEqual([`/prospects/${id}?sections=BASE%2CSOCIAL%2CATTACHMENTS%2COPPORTUNITIES`, `/prospects/${id}?sections=BASE%2CSOCIAL%2CATTACHMENTS%2COPPORTUNITIES`]);
    expect(later.result).toHaveLength(2);
  });
});

describe('GET /board/prospect-enrich (ProspectEnrichServlet)', () => {
  it('an id that is not a uuid (the numbers of the old service) is skipped: no quick-view, an empty result', async () => {
    const s = setup(() => ({ status: 200, result: { code: 'P00007' } }));
    const r = await s.ask('/board/prospect-enrich?ids=%207%20,,0,-3,x,2147483648,007,7,1.5');
    expect(r.status).toBe(200);
    expect(JSON.parse(r.text)).toEqual({ status: 200, message: 'success', result: {} });
    expect(s.calls).toHaveLength(0);
  });

  it('no ids is an empty result and no call', async () => {
    const none = setup(() => ({ status: 200, result: {} }));
    expect(JSON.parse((await none.ask('/board/prospect-enrich')).text)).toEqual({ status: 200, message: 'success', result: {} });
    expect(none.calls).toHaveLength(0);
  });

  it('only GET', async () => {
    const { deps } = fakeRest(() => ({}));
    expect((await composeRoutes(prospectRoutes(deps))('/board/prospect-enrich?ids=1', { method: 'POST' })).status).toBe(405);
  });
});
