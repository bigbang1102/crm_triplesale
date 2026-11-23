import { describe, expect, it } from 'vitest';
import {
  SCRIPTS,
  apiErrorText,
  apiResponseOk,
  avatarSrc,
  buildCreateBody,
  buildLeadBody,
  buildSunInfo,
  buildUpdateBody,
  countryIdIn,
  digitsOnly,
  docsOfAnswer,
  ensureNotBlank,
  ensurePositiveInt,
  ensureUsageStatus,
  extractProspectId,
  formatTel,
  isThaiText,
  jsEscape,
  keepThaiProvinces,
  leadIdOfProspect,
  leadParamFlag,
  leadParamOr,
  listPhoneCode,
  lookupIdOrZero,
  metroRowsOf,
  metroSubDistrictsOf,
  metroZipOfSubDistrict,
  movementTypeUsesWorkflowStep,
  normalizeGeoName,
  parseApiIsoDate,
  parseApiStatus,
  parseMasterList,
  phoneCodeOfCountry,
  phoneFormatJson,
  positiveOr,
  resolveCreateAge,
  sanitizePhoneFields,
  sexToApi,
  sexToDisplay,
  telWithCode,
  toBasicBean,
  toPlainBean,
  trimGeoCodes,
  type FormLists,
} from './prospect-form.logic';
import { type BasicBean, newContractBean } from './prospect-form-types';

const bean = (id: number | null, code: string, name: string, extra: Partial<BasicBean> = {}): BasicBean => ({ id, code, name, nameTh: name, phoneCountryCode: '', phoneNumberFormat: '', ...extra });
const TODAY = '2026-10-20';
const lists = (o: Partial<FormLists> = {}): FormLists => ({
  country: [],
  province: [],
  district: [],
  subDistrict: [],
  district2: [],
  subDistrict2: [],
  businessType: [],
  occupation: [],
  marketingChanel: [],
  convenientTime: [],
  ...o,
});

describe('text helpers', () => {
  it('jsEscape: backslash and quote escaped, line breaks become spaces, null is empty', () => {
    expect(jsEscape("a'b\\c\nd\re")).toBe("a\\'b\\\\c d e");
    expect(jsEscape(null)).toBe('');
  });

  it('digitsOnly drops everything but 0-9 (also the blanks inside)', () => {
    expect(digitsOnly('081-234 5678 (ext.9)')).toBe('08123456789');
    expect(digitsOnly(null)).toBe('');
  });

  it('sexToDisplay reads every spelling a record kept; sexToApi gives "1" · "2" or nothing', () => {
    for (const [raw, shown] of [['1', 'ชาย'], ['M', 'ชาย'], ['m', 'ชาย'], ['ชาย', 'ชาย'], ['2', 'หญิง'], ['F', 'หญิง'], ['0', 'ไม่ระบุเพศ'], ['u', 'ไม่ระบุเพศ'], ['x', ''], ['', ''], [' 2 ', 'หญิง']] as const) {
      expect(sexToDisplay(raw), raw).toBe(shown);
    }
    expect(sexToDisplay(null)).toBe('');
    expect([sexToApi('ชาย'), sexToApi('f'), sexToApi('ไม่ระบุเพศ'), sexToApi(''), sexToApi(undefined)]).toEqual(['1', '2', undefined, undefined, undefined]);
  });

  it('parseApiIsoDate: the date of the wall clock, the zone cut; a prefix is enough; lenient like SimpleDateFormat', () => {
    expect(parseApiIsoDate('2026-07-16T00:00:00.000+07:00')).toBe('2026-07-16');
    expect(parseApiIsoDate('2026-07-16T23:59:59Z')).toBe('2026-07-16');
    expect(parseApiIsoDate('2026-07-16')).toBe('2026-07-16');
    expect(parseApiIsoDate('2026-07-16 10:00')).toBe('2026-07-16');
    expect(parseApiIsoDate('2026-02-30')).toBe('2026-03-02');
    expect(parseApiIsoDate('')).toBeNull();
    expect(parseApiIsoDate('16/07/2026')).toBeNull();
    expect(parseApiIsoDate(null)).toBeNull();
  });
});

describe('phones', () => {
  const countries = [
    bean(1, 'THA', 'Thailand', { phoneCountryCode: '+66', phoneNumberFormat: 'XX XXX XXXX / X XXXX XXXX' }),
    bean(2, 'MYS', 'Malaysia', { phoneCountryCode: '+60', phoneNumberFormat: 'XX XXXX XXXX' }),
    bean(5, 'USA', 'United States', { phoneCountryCode: '+1', phoneNumberFormat: 'XXX XXX XXXX' }),
    bean(6, 'CAN', 'Canada', { phoneCountryCode: '+1', phoneNumberFormat: 'XXX XXX XX XXXX' }),
    bean(8, 'ATA', 'Antarctica'),
  ];

  it('phoneFormatJson keeps, per phone code, the format with the most X; countries with no code or no format are left out', () => {
    expect(JSON.parse(phoneFormatJson(countries))).toEqual({ '+66': 'XX XXX XXXX / X XXXX XXXX', '+60': 'XX XXXX XXXX', '+1': 'XXX XXX XX XXXX' });
  });

  it('listPhoneCode: one country per code (the first), sorted by the number of the code', () => {
    expect(listPhoneCode(countries).map((c) => c.code)).toEqual(['USA', 'MYS', 'THA']);
  });

  it('phoneCodeOfCountry: by code ignoring case; the fallback for none', () => {
    expect(phoneCodeOfCountry(countries, 'tha', '+0')).toBe('+66');
    expect(phoneCodeOfCountry(countries, 'ATA', '+0')).toBe('+0');
    expect(phoneCodeOfCountry(countries, null, '+9')).toBe('+9');
  });

  it('formatTel groups by the FIRST format of the code; too long = the front digits are cut; no format = the digits', () => {
    const json = phoneFormatJson(countries);
    expect(formatTel('0812345678', '+66', json)).toBe('81-234-5678');
    expect(formatTel('812345678', '+66', json)).toBe('81-234-5678');
    expect(formatTel('81-234', '+66', json)).toBe('81-234');
    expect(formatTel('12', '+66', json)).toBe('12');
    expect(formatTel('0123456789', '+999', json)).toBe('0123456789');
    expect(formatTel('', '+66', json)).toBe('');
    expect(formatTel('0812345678', null, json)).toBe('0812345678');
  });

  it('telWithCode puts the code in front, only when there is a number', () => {
    const json = phoneFormatJson(countries);
    expect(telWithCode('0812345678', '+66', json)).toBe('+66 81-234-5678');
    expect(telWithCode('0812345678', '', json)).toBe('0812345678');
    expect(telWithCode('', '+66', json)).toBe('');
  });

  it('sanitizePhoneFields: the main phone and mobiles 1-3 become digits; the fixed lines keep every symbol', () => {
    const c = newContractBean(TODAY);
    Object.assign(c, { tel: '081-234-5678', prospect_phone1: '(02) 111', prospect_phone2: 'a1b2', prospect_phone3: '', prospect_tel1: '02-123 #4' });
    sanitizePhoneFields(c);
    expect([c.tel, c.prospect_phone1, c.prospect_phone2, c.prospect_phone3, c.prospect_tel1]).toEqual(['0812345678', '02111', '12', '', '02-123 #4']);
  });
});

describe('master data', () => {
  it('toBasicBean trims; the Thai name falls back to the name; toPlainBean trims nothing', () => {
    expect(toBasicBean({ id: '7', code: '\tCBI ', name: ' Chon Buri ', nameTh: '' })).toMatchObject({ id: 7, code: 'CBI', name: 'Chon Buri', nameTh: 'Chon Buri' });
    expect(toPlainBean({ id: 3, code: ' x ', name: 'n' })).toMatchObject({ id: 3, code: ' x ', name: 'n', nameTh: '' });
  });

  it('parseMasterList: no answer · not JSON · no result · a result that is not a list are empty; an element that is not an object ends the list', () => {
    expect(parseMasterList('', toBasicBean)).toEqual([]);
    expect(parseMasterList('nope', toBasicBean)).toEqual([]);
    expect(parseMasterList('{"status":200}', toBasicBean)).toEqual([]);
    expect(parseMasterList('{"result":null}', toBasicBean)).toEqual([]);
    expect(parseMasterList('{"result":"x"}', toBasicBean)).toEqual([]);
    expect(parseMasterList('{"result":[{"id":1,"code":"A"},5,{"id":2,"code":"B"}]}', toBasicBean).map((b) => b.code)).toEqual(['A']);
  });

  it('lookupIdOrZero: a given id wins; blank / N/A codes and unknown codes are 0; a row with no id is 0', () => {
    const l = [bean(4, 'A', 'a'), bean(null, 'M', 'm')];
    expect(lookupIdOrZero(9, 'A', l)).toBe(9);
    expect(lookupIdOrZero(0, 'A', l)).toBe(4);
    expect(lookupIdOrZero(null, 'M', l)).toBe(0);
    expect(lookupIdOrZero(null, 'N/A', l)).toBe(0);
    expect(lookupIdOrZero(null, '', l)).toBe(0);
    expect(lookupIdOrZero(null, 'Z', l)).toBe(0);
    expect(lookupIdOrZero(null, 'A', null)).toBe(0);
    expect([positiveOr(3, 8), positiveOr(0, 8), positiveOr(null, null)]).toEqual([3, 8, 0]);
  });

  it('countryIdIn: exact code first, then ignoring case and blanks', () => {
    const l = [bean(1, 'THA', 't'), bean(2, ' mys ', 'm'), bean(0, 'XXX', 'x')];
    expect([countryIdIn(l, 'THA'), countryIdIn(l, 'MYS'), countryIdIn(l, 'XXX'), countryIdIn(l, 'ZZZ'), countryIdIn([], 'THA')]).toEqual([1, 2, 0, 0, 0]);
  });

  it('isThaiText / keepThaiProvinces: Thai names only, one per code (the larger id), and the codes the record already has', () => {
    expect([isThaiText('กรุงเทพ มหานคร'), isThaiText('Kuala Lumpur'), isThaiText(' '), isThaiText('กรุงเทพ1')]).toEqual([true, false, false, false]);
    const all = [bean(90, 'BKK', 'กรุงเทพ (ซ้ำ)'), bean(100, 'BKK', 'กรุงเทพมหานคร'), bean(900, 'KUL', 'Kuala Lumpur'), bean(5, '', 'ไม่มีรหัส'), bean(104, 'CBI', 'ชลบุรี')];
    expect(keepThaiProvinces(all).map((p) => p.id)).toEqual([100, 104]);
    expect(keepThaiProvinces(all, ' KUL ', null).map((p) => p.id)).toEqual([100, 900, 104]);
    expect(keepThaiProvinces([])).toEqual([]);
  });
});

describe('the metro file', () => {
  const rows = metroRowsOf(
    JSON.stringify([
      { dn: 'พระนคร', s: '100101', sn: 'พระบรมมหาราชวัง', z: '10200' },
      { dn: 'พระนคร', s: '100102', sn: 'วังบูรพาภิรมย์', z: '10200' },
      { dn: 'หลักสี่', s: '101901', sn: 'ทุ่งสองห้อง', z: '10210' },
      { dn: 'ลำลูกกา', s: '130401', sn: 'คูคต', z: '12130' },
    ]),
  );

  it('normalizeGeoName: นิคหิต+สระอา = สระอำ; the prefix and all blanks go', () => {
    expect(normalizeGeoName('เขต พระนคร')).toBe('พระนคร');
    expect(normalizeGeoName('อ.ลําลูกกา')).toBe('ลำลูกกา');
    expect(normalizeGeoName('ตำบล บ้านใหม่')).toBe('บ้านใหม่');
    expect(normalizeGeoName(null)).toBe('');
  });

  it('metroRowsOf: unreadable text = no rows', () => {
    expect(metroRowsOf('')).toEqual([]);
    expect(metroRowsOf('{}')).toEqual([]);
    expect(rows).toHaveLength(4);
  });

  it('metroSubDistrictsOf: by the name of the district (the prefix of the backend is ignored); ids stay null', () => {
    const hit = metroSubDistrictsOf(rows, 'เขตพระนคร');
    expect(hit.map((b) => [b.id, b.code, b.name, b.nameTh])).toEqual([
      [null, '100101', 'พระบรมมหาราชวัง', 'พระบรมมหาราชวัง'],
      [null, '100102', 'วังบูรพาภิรมย์', 'วังบูรพาภิรมย์'],
    ]);
    expect(metroSubDistrictsOf(rows, 'อ.ลําลูกกา').map((b) => b.code)).toEqual(['130401']);
  });

  it('metroSubDistrictsOf: a name that is the start of exactly ONE district is that district (the typo of the backend); none or two = nothing', () => {
    expect(metroSubDistrictsOf(rows, 'เขตหลักสี').map((b) => b.code)).toEqual(['101901']);
    expect(metroSubDistrictsOf(rows, 'เขตพ')).toHaveLength(2);
    expect(metroSubDistrictsOf(rows, 'เขตล')).toHaveLength(1);
    expect(metroSubDistrictsOf(rows, '')).toEqual([]);
    expect(metroSubDistrictsOf(rows, 'เขตไม่มี')).toEqual([]);
    const two = metroRowsOf(JSON.stringify([{ dn: 'บางกอก1', s: 'a', sn: 'a', z: '1' }, { dn: 'บางกอก2', s: 'b', sn: 'b', z: '2' }]));
    expect(metroSubDistrictsOf(two, 'บางกอก')).toEqual([]);
  });

  it('metroZipOfSubDistrict: by the code of the sub-district; "" for none', () => {
    expect(metroZipOfSubDistrict(rows, '101901')).toBe('10210');
    expect(metroZipOfSubDistrict(rows, ' 100102 ')).toBe('10200');
    expect(metroZipOfSubDistrict(rows, 'zzz')).toBe('');
    expect(metroZipOfSubDistrict(rows, '')).toBe('');
  });
});

describe('the answers of the service', () => {
  it('parseApiStatus: status, else code, else 0', () => {
    expect([parseApiStatus('{"status":409}'), parseApiStatus('{"code":201}'), parseApiStatus('{}'), parseApiStatus(''), parseApiStatus('x')]).toEqual([409, 201, 0, 0, 0]);
  });

  it('apiResponseOk: 2xx is ok, 4xx and up is not, others say "success"; a text that is not JSON needs "success" and no error', () => {
    expect(apiResponseOk('{"status":201}')).toBe(true);
    expect(apiResponseOk('{"status":200}')).toBe(true);
    expect(apiResponseOk('{"status":400,"message":"success"}')).toBe(false);
    expect(apiResponseOk('{"status":302,"message":"success"}')).toBe(true);
    expect(apiResponseOk('{"status":302}')).toBe(false);
    expect(apiResponseOk('{"message":"nothing"}')).toBe(false);
    expect(apiResponseOk('{"message":"success"}')).toBe(true);
    expect(apiResponseOk('success')).toBe(true);
    expect(apiResponseOk('success "error"')).toBe(false);
    expect(apiResponseOk('')).toBe(false);
    expect(apiResponseOk(null)).toBe(false);
  });

  it('apiErrorText: "[status] message — detail" and no character that breaks a script', () => {
    expect(apiErrorText('{"status":400,"message":"Bad Request","error":{"message":"name is invalid"}}')).toBe('[400] Bad Request — name is invalid');
    expect(apiErrorText('{"status":500}')).toBe('[500] ');
    expect(apiErrorText('{"message":"it\'s \\"bad\\""}')).toBe('it s  bad ');
    expect(apiErrorText('')).toContain('ไม่มีการตอบกลับ');
    expect(apiErrorText('x'.repeat(300))).toHaveLength(200);
    expect(apiErrorText('{}')).toBe('{}');
  });

  it('extractProspectId: result.id, else id, else 0', () => {
    expect([extractProspectId('{"result":{"id":17}}'), extractProspectId('{"id":5}'), extractProspectId('{"result":{"id":0},"id":9}'), extractProspectId('x'), extractProspectId('')]).toEqual([17, 5, 9, 0, 0]);
  });

  it('docsOfAnswer: documents only (the profile picture is left out), newest first, the doubled host folded', () => {
    const text = JSON.stringify({
      result: [
        { detailOrderNo: 1, attachFile: 'http://h/http://h/prospect/1/a.pdf', description: 'a', attachFileTypeCode: 'DOC' },
        { detailOrderNo: 2, attachFile: 'prospect/2/p.png', description: 'p', attachFileTypeCode: 'profile' },
        { detailOrderNo: 3, attachFile: 'prospect/3/b.xlsx', description: 'b', attachFileTypeCode: 'DOC' },
      ],
    });
    expect(docsOfAnswer(text).map((d) => [d.no, d.attachfile, d.kind, d.filename])).toEqual([
      ['3', 'prospect/3/b.xlsx', 'excel', 'b.xlsx'],
      ['1', 'http://h/prospect/1/a.pdf', 'pdf', 'a.pdf'],
    ]);
    expect(docsOfAnswer('')).toEqual([]);
    expect(docsOfAnswer('{"result":"x"}')).toEqual([]);
  });

  it('avatarSrc: an absolute address goes through the proxy, anything else is shown as it is', () => {
    const proxy = (u: string): string => `/p?u=${u}`;
    expect(avatarSrc('http://h/http://h/a.jpg', proxy)).toBe('/p?u=http://h/a.jpg');
    expect(avatarSrc('prospect/1/a.jpg', proxy)).toBe('prospect/1/a.jpg');
    expect(avatarSrc('data:image/png;base64,AA', proxy)).toBe('data:image/png;base64,AA');
    expect(avatarSrc('', proxy)).toBe('');
    expect(avatarSrc(null, proxy)).toBe('');
  });

  it('movementTypeUsesWorkflowStep / leadIdOfProspect read the answers they are given', () => {
    const mt = JSON.stringify({ status: 200, result: [{ id: 5, usesWorkflowStep: true }, { id: 6, usesWorkflowStep: false }] });
    expect([movementTypeUsesWorkflowStep(mt, 5), movementTypeUsesWorkflowStep(mt, 6), movementTypeUsesWorkflowStep(mt, 7), movementTypeUsesWorkflowStep(mt, 0), movementTypeUsesWorkflowStep('', 5)]).toEqual([true, false, false, false, false]);
    expect(movementTypeUsesWorkflowStep('{"status":500,"result":[{"id":5,"usesWorkflowStep":true}]}', 5)).toBe(false);
    const leads = JSON.stringify({ result: { leads: { items: [{ id: 30, prospectId: 9 }, { id: 29, prospectId: 1 }] } } });
    expect([leadIdOfProspect(leads, 1), leadIdOfProspect(leads, 9), leadIdOfProspect(leads, 2), leadIdOfProspect('', 1), leadIdOfProspect('[]', 1)]).toEqual([29, 30, 0, 0, 0]);
  });
});

describe('the bodies', () => {
  it('ensureNotBlank / ensurePositiveInt / ensureUsageStatus', () => {
    const j: Record<string, unknown> = { a: '  ', b: 'null', c: 'x', d: 0, e: '5', f: 'weird' };
    ensureNotBlank(j, 'a', 'A');
    ensureNotBlank(j, 'b', 'B');
    ensureNotBlank(j, 'c', 'C');
    ensureNotBlank(j, 'missing', 'M');
    ensurePositiveInt(j, 'd', 7);
    ensurePositiveInt(j, 'e', 7);
    ensurePositiveInt(j, 'none', 0);
    j['usageStatus'] = j['f'];
    ensureUsageStatus(j);
    expect(j).toMatchObject({ a: 'A', b: 'B', c: 'x', missing: 'M', d: 7, e: '5', none: 0, usageStatus: 'release' });
    j['usageStatus'] = 'block';
    ensureUsageStatus(j);
    expect(j['usageStatus']).toBe('block');
  });

  it('lead parameters: whole numbers or the default; the flag is true / 1', () => {
    expect([leadParamOr({ a: ' 12 ' }, 'a', 0), leadParamOr({ a: 'x' }, 'a', 3), leadParamOr({}, 'a', 4), leadParamOr({ a: '' }, 'a', 5)]).toEqual([12, 3, 4, 5]);
    expect([leadParamFlag({ f: 'TRUE' }, 'f'), leadParamFlag({ f: '1' }, 'f'), leadParamFlag({ f: 'no' }, 'f'), leadParamFlag({}, 'f')]).toEqual([true, true, false, false]);
  });

  it('resolveCreateAge: the age typed, else the years since the birth date (by day of the year), else 1', () => {
    const c = newContractBean(TODAY);
    c.age = 30;
    expect(resolveCreateAge(c, TODAY)).toBe(30);
    c.age = null;
    c.birthdate = '1990-10-20';
    expect(resolveCreateAge(c, TODAY)).toBe(36);
    c.birthdate = '1990-10-21';
    expect(resolveCreateAge(c, TODAY)).toBe(35);
    c.birthdate = TODAY;
    expect(resolveCreateAge(c, TODAY)).toBe(1);
    c.birthdate = null;
    expect(resolveCreateAge(c, TODAY)).toBe(1);
  });

  it('buildSunInfo keeps the non-blank fields of the extra info (and the two dates, which Java never leaves null)', () => {
    const c = newContractBean(TODAY);
    expect(buildSunInfo(c)).toEqual({ txDate: TODAY, csDateTransOwnership: TODAY });
    c.researchcode = 'E101';
    c.loan_amount = ' ';
    c.vip = 'Y';
    c.research_date_cs = '2026-01-02';
    expect(buildSunInfo(c)).toEqual({ researcher: 'E101', txDate: '2026-01-02', csDateTransOwnership: TODAY, csVip: 'Y' });
  });

  describe('the update', () => {
    const provinces = [bean(1, 'BKK', 'กรุงเทพมหานคร'), bean(5, 'CBI', 'ชลบุรี')];
    const districts = [bean(11, 'BKK_01', 'เขตพระนคร')];
    const country = [bean(1, 'THA', 'Thailand', { nameTh: 'ไทย' })];
    const ctx = (l: Partial<FormLists> = {}) => ({ lists: lists({ province: provinces, district: districts, district2: districts, country, ...l }), today: TODAY, resolveCountryId: (code: string | null | undefined) => (code === 'THA' ? 1 : 0) });

    it('starts from the snapshot, writes the form over it, drops the audit keys and keeps only the keys of the DTO', () => {
      const c = newContractBean(TODAY);
      Object.assign(c, { id: 17, customer_name: 'สมชาย', tel: '081-234-5678', customer_type: 'company', sex: 'หญิง', date_save: '2026-07-16', birthdate: '1990-01-01', current_city_code: 'CBI', current_district_code: 'BKK_01', age: 33 });
      const snapshot = { id: 17, name: 'เก่า', remark: 'คงเดิม', createBy: 'x', createDate: 'y', updateBy: 'z', updateDate: 'w', removeStatus: 'N', notInTheDto: 1, birthdate: '1980-05-05T00:00:00.000+07:00', attachFile: 'http://h/http://h/prospect/1/a.jpg' };
      const body = buildUpdateBody(c, snapshot, ctx());
      expect(body).toMatchObject({
        id: 17,
        name: 'สมชาย',
        customerTel: '0812345678',
        customerType: 'juristic',
        sex: '2',
        contactDate: '2026-07-16',
        birthdate: '1990-01-01',
        remark: 'คงเดิม', // blank in the form = the stored value stays
        currentCityId: 5,
        currentCityCode: 'CBI',
        currentCityName: 'ชลบุรี',
        currentDistrictId: 11,
        age: 33,
        attachFile: 'prospect/1/a.jpg',
        taxBranch: '00000', // a juristic customer with no branch is the head office
      });
      for (const k of ['createBy', 'createDate', 'updateBy', 'updateDate', 'removeStatus', 'notInTheDto']) expect(body, k).not.toHaveProperty(k);
      expect(snapshot.name).toBe('เก่า'); // the snapshot itself is not changed
    });

    it('blanks fall back to the defaults the service needs; convenientTime is today (the bean never has none); a future birth date is not sent', () => {
      const c = newContractBean(TODAY);
      Object.assign(c, { id: 3, birthdate: '2030-01-01', marketingchanelcode: 'MKC-9', date_save: null });
      const body = buildUpdateBody(c, null, ctx());
      expect(body).toMatchObject({ id: 3, name: '-', customerTel: '000', idCard: '000', customerType: 'person', sex: '1', currentAddress: '-', referralRelate: '-', contactDate: TODAY, convenientTime: TODAY, usageStatus: 'release', countryId: 0, currentCityId: 0, marketingChanelId: 0, salePersonId: 0 });
      expect(body).not.toHaveProperty('birthdate');
      // the channel code that is not in the list is sent as both its code and its name
      expect(body).toMatchObject({ marketingChanelCode: 'MKC-9', marketingChanelName: 'MKC-9' });
    });

    it('the document district id is looked up in the list of the CURRENT address, its name in the second list (as Java does)', () => {
      const c = newContractBean(TODAY);
      Object.assign(c, { id: 3, senddoc_district_code: 'X_01' });
      const body = buildUpdateBody(c, null, ctx({ district: [bean(1, 'X_01', 'a')], district2: [bean(2, 'X_01', 'b')] }));
      expect(body).toMatchObject({ sendDocDistrictId: 2, sendDocDistrictCode: 'X_01', sendDocDistrictName: 'b' });
    });

    it('the country id comes from the list, else from the (refreshed) lookup; the Thai name of a country is sent for the countries', () => {
      const c = newContractBean(TODAY);
      Object.assign(c, { id: 3, country: 'THA', current_country_code: 'THA' });
      const body = buildUpdateBody(c, null, ctx());
      expect(body).toMatchObject({ countryId: 1, currentCountryId: 1, currentCountryCode: 'THA', currentCountryName: 'ไทย' });
    });
  });

  describe('the create', () => {
    const base = () => ({ lists: lists({ country: [bean(1, 'THA', 'Thailand')], marketingChanel: [bean(12, 'MKC-001', 'Facebook')], occupation: [bean(20, 'OC-01', 'พนักงาน')] }), today: TODAY, resolveCountryId: (code: string | null | undefined) => (code === 'THA' ? 1 : 0), params: {} as Record<string, string>, salePersons: [] as BasicBean[], sendEmployeeId: false });

    it('keys of ids that are 0 are REMOVED (org.json put(null)), the ids the service wants as a number stay 0, the constants are the constants', () => {
      const c = newContractBean(TODAY);
      Object.assign(c, { customer_name: 'ลูกค้าใหม่', customer_type: 'person', date_save: TODAY, country: 'THA', marketingchanelcode: 'MKC-001', occupationcode: 'OC-01', birthdate: '1990-10-20' });
      const { body, sunInfo } = buildCreateBody(c, base());
      expect(body).toMatchObject({
        name: 'ลูกค้าใหม่',
        customerType: 'person',
        convenientTime: '2025-07-04T10:00:00',
        contactDate: `${TODAY}T00:00:00`,
        countryId: 1,
        countryCode: 'THA',
        countryName: 'Thailand',
        marketingChanelId: 12,
        marketingChanelName: 'Facebook',
        occupationId: 20,
        age: 36,
        sex: '1',
        customerTel: '000',
        idCard: '000',
        currentAddress: '-',
        referralRelate: '-',
        usageStatus: 'release',
        movementTypeId: 0,
        confirmMerge: false,
        currentCityId: 0, // ensurePositiveInt writes the default (0) back
        salePersonId: 0,
      });
      expect(body).not.toHaveProperty('contactBackId'); // not chosen: removed, the code and name are ''
      expect(body).toMatchObject({ contactBackCode: '', contactBackName: '' });
      expect(body).not.toHaveProperty('ggwBranchId');
      expect(body).not.toHaveProperty('procedureGroupId');
      expect(body).not.toHaveProperty('assignToId');
      expect(body).not.toHaveProperty('employeeId');
      expect(sunInfo).toEqual({ txDate: TODAY, csDateTransOwnership: TODAY });
    });

    it('a channel code that is not in the list is sent as its own code and name', () => {
      const c = newContractBean(TODAY);
      Object.assign(c, { marketingchanelcode: 'MKC-X' });
      const { body } = buildCreateBody(c, base());
      // (no id: put(null) removed it, and ensurePositiveInt then writes the default, 0)
      expect(body).toMatchObject({ marketingChanelCode: 'MKC-X', marketingChanelName: 'MKC-X', marketingChanelId: 0 });
    });

    it('a country code not in the list is sent with an empty name', () => {
      const c = newContractBean(TODAY);
      Object.assign(c, { country: 'ZZZ' });
      const { body } = buildCreateBody(c, base());
      expect(body).toMatchObject({ countryCode: 'ZZZ', countryName: '', countryId: 0 });
    });

    it('the lead parameters of the modal: product, step group, owner (the sale person is the owner chosen), merge; the employee only when the config says so', () => {
      const c = newContractBean(TODAY);
      const params = { movementTypeId: '1004400740', procedureGroupId: '101', assignToId: '200', employeeId: '108', confirmMerge: 'true' };
      const salePersons = [bean(200, 'GGW-100', 'พนักงานขาย')];
      const off = buildCreateBody(c, { ...base(), params, salePersons }).body;
      expect(off).toMatchObject({ movementTypeId: 1004400740, procedureGroupId: 101, assignToId: 200, salePersonId: 200, salePersonCode: 'GGW-100', salePersonName: 'พนักงานขาย', confirmMerge: true });
      expect(off).not.toHaveProperty('employeeId');
      const on = buildCreateBody(c, { ...base(), params, salePersons, sendEmployeeId: true }).body;
      expect(on['employeeId']).toBe(108);
      const unknown = buildCreateBody(c, { ...base(), params: { assignToId: '999' } }).body;
      expect(unknown).toMatchObject({ salePersonId: 999, salePersonCode: '', salePersonName: '' });
    });

    it('buildLeadBody: product, group of sale (0 by default), and the optional ids when positive', () => {
      const c = newContractBean(TODAY);
      c.id = 17;
      expect(buildLeadBody(c, {})).toEqual({ prospectId: 17, saleGroupId: 0, movementTypeId: 0 });
      c.saleGroupId = 4;
      expect(buildLeadBody(c, { movementTypeId: '5', procedureGroupId: '6', assignToId: '7', employeeId: '8' })).toEqual({ prospectId: 17, saleGroupId: 4, movementTypeId: 5, procedureGroupId: 6, assignToId: 7, employeeId: 8 });
    });
  });

  it('trimGeoCodes trims the codes of the address and the country', () => {
    const c = newContractBean(TODAY);
    Object.assign(c, { current_city_code: '\tCBI', current_district_code: ' D ', senddoc_city_code: 'X\n', country: ' THA ' });
    trimGeoCodes(c);
    expect([c.current_city_code, c.current_district_code, c.senddoc_city_code, c.country]).toEqual(['CBI', 'D', 'X', 'THA']);
  });
});

describe('the scripts of the page', () => {
  it('are the strings the Java code builds (context path and escaped message in them)', () => {
    expect(SCRIPTS.updated('/triplesale')).toContain("window.location.href = '/triplesale/pages/contracts.face?pid=1&page_id=1&act=2&action_type=list'");
    expect(SCRIPTS.created('/x')).toContain("'/x/pages/contracts.face?pid=1&page_id=1&act=2&action_type=list'");
    expect(SCRIPTS.createdWithLead('/x')).toContain("'/x/pages/lead.face?pid=1&page_id=3&act=3&action_type=list'");
    expect(SCRIPTS.createFailed("bad 'x'")).toBe("swal({ title: 'บันทึกไม่สำเร็จ!', text: 'สร้างลูกค้าไม่สำเร็จ: bad \\'x\\'', icon: 'error' });");
    expect(SCRIPTS.mergeConfirm('a')).toBe("if (window.ctShowMergeConfirm) { ctShowMergeConfirm('a'); }");
    expect(SCRIPTS.imageSaved('a/b')).toContain("ctOnImageSaved('a/b')");
  });
});
