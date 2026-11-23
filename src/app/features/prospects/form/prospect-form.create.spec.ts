import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fakeRest } from '@core/live/rest-fake';
import { resetMockProspects } from '../prospects.mock';
import { ProspectFormView, ProspectSession } from './prospect-form.bean';
import { assignmentOf, buildCreateV2Body, duplicateCheckBody, isMaskedValue, stripMasked, type FormLists } from './prospect-form.logic';
import { createLiveProspectFormApi } from './prospect-form.live';
import { createMockProspectForm, resetMockProspectForm } from './prospect-form.mock';
import { ProspectFormService } from './prospect-form.service';
import { newContractBean, type BasicBean } from './prospect-form-types';

const bean = (code: string, uid: string): BasicBean => ({ id: 0, uid, code, name: code, nameTh: code, phoneCountryCode: '', phoneNumberFormat: '' });
const LISTS: FormLists = {
  country: [{ ...bean('THA', 'c-tha'), phoneCountryCode: '+66' }, { ...bean('JPN', 'c-jpn'), phoneCountryCode: '+81' }],
  province: [bean('CNX', 'p-cnx'), bean('BKK', 'p-bkk')],
  district: [bean('CNX_01', 'd-cnx-1')],
  subDistrict: [bean('CNX_01_01', 's-cnx-1')],
  district2: [bean('BKK_01', 'd-bkk-1')],
  subDistrict2: [bean('BKK_01_01', 's-bkk-1')],
  businessType: [],
  occupation: [bean('TEACHER', 'o-teacher')],
  marketingChanel: [bean('FB', 'm-fb')],
  convenientTime: [bean('PHONE', 'cb-phone')],
};

function person() {
  const c = newContractBean('2026-11-16');
  Object.assign(c, {
    customer_type: 'person',
    customer_name: 'สมชาย ทดสอบ',
    tel: '081-234 5678',
    prospect_phone1: '089-000 1111',
    prospect_phone3: '086-555 2222',
    prospect_tel1: '02 111 2222',
    prospect_fax: '02 111 2223',
    prospect_email: 'somchai.test@example.com',
    id_card: '1-1001-00999-99-1',
    birthdate: '1990-05-01',
    date_save: '2026-11-16',
    sex: 'ชาย',
    nationality: 'ไทย',
    convenient_text: 'หลัง 18:00',
    remark: 'ข้อมูลทดสอบ',
    country: 'THA',
    phone_country_code: '+66',
    occupationcode: 'TEACHER',
    marketingchanelcode: 'FB',
    contact_backcode: 'PHONE',
    current_address: '99/9 ถนนทดสอบ',
    current_city_code: 'CNX',
    current_district_code: 'CNX_01',
    current_sub_district_code: 'CNX_01_01',
    current_country_code: 'THA',
    current_postid: '50200',
    senddoc_address: '99/9 (ส่งเอกสาร)',
    senddoc_city_code: 'BKK',
    senddoc_district_code: 'BKK_01',
    senddoc_sub_district_code: 'BKK_01_01',
    senddoc_country_code: 'THA',
    senddoc_postid: '10110',
    prospect_line: 'U0000001',
    prospect_facebook: '100000000000001',
    prospect_twitter: 'ignored',
  });
  return c;
}

describe('buildCreateV2Body (POST /api/v1/prospects: { mode, customer, assignment })', () => {
  it('a person: the keys of the service, the uuids found by the codes of the form, phones as digits, three slots of each kind', () => {
    const body = buildCreateV2Body(person(), LISTS, 'RELEASE', { destination: 'EMPLOYEE', responsibleEmployeeId: 'e-1' });
    expect(body).toEqual({
      mode: 'RELEASE',
      customer: {
        customerType: 'PERSON',
        name: 'สมชาย',
        lastname: 'ทดสอบ',
        callingName: null,
        phoneCountryId: 'c-tha',
        countryId: 'c-tha',
        mainPhone: '0812345678',
        mobilePhones: ['0890001111', null, '0865552222'],
        telephones: ['021112222', null, null],
        fax: '021112223',
        email: 'somchai.test@example.com',
        idCard: '1-1001-00999-99-1',
        birthdate: '1990-05-01',
        sex: 'MALE',
        occupationId: 'o-teacher',
        nationality: 'ไทย',
        marketingChannelId: 'm-fb',
        contactBackId: 'cb-phone',
        convenient: 'หลัง 18:00',
        contactDate: '2026-11-16',
        remark: 'ข้อมูลทดสอบ',
        currentAddress: { address: '99/9 ถนนทดสอบ', provinceId: 'p-cnx', districtId: 'd-cnx-1', subdistrictId: 's-cnx-1', countryId: 'c-tha', postcode: '50200' },
        documentAddress: { address: '99/9 (ส่งเอกสาร)', provinceId: 'p-bkk', districtId: 'd-bkk-1', subdistrictId: 's-bkk-1', countryId: 'c-tha', postcode: '10110' },
        socialAccounts: [
          { channelType: 'LINE', accountId: 'U0000001' },
          { channelType: 'FACEBOOK', accountId: '100000000000001' },
        ],
      },
      assignment: { destination: 'EMPLOYEE', responsibleEmployeeId: 'e-1' },
    });
  });

  it('a draft has no assignment even when one is given; a company has no surname', () => {
    const c = person();
    c.customer_type = 'juristic';
    c.customer_name = 'บริษัท ทดสอบ จำกัด';
    const body = buildCreateV2Body(c, LISTS, 'DRAFT', { destination: 'EMPLOYEE', responsibleEmployeeId: 'e-1' });
    expect(body['mode']).toBe('DRAFT');
    expect(body).not.toHaveProperty('assignment');
    expect(body['customer']).toMatchObject({ customerType: 'JURISTIC', name: 'บริษัท', lastname: null });
  });

  it('the phone country is the uuid of the country with the dial code of the form; none matching is null', () => {
    const c = person();
    c.phone_country_code = '+81';
    expect(buildCreateV2Body(c, LISTS, 'DRAFT', null)['customer']).toMatchObject({ phoneCountryId: 'c-jpn' });
    c.phone_country_code = '+999';
    expect(buildCreateV2Body(c, LISTS, 'DRAFT', null)['customer']).toMatchObject({ phoneCountryId: null });
  });

  it('a code with no uuid (the old service, or nothing chosen, or N/A) is null; sex without a value is null; a date that is not yyyy-MM-dd is null', () => {
    const c = person();
    Object.assign(c, { country: 'N/A', occupationcode: 'UNKNOWN', marketingchanelcode: '', sex: 'ไม่ระบุเพศ', birthdate: '01/05/1990', date_save: '' });
    const customer = buildCreateV2Body(c, { ...LISTS, province: [{ ...bean('CNX', 'x'), uid: undefined }] }, 'DRAFT', null)['customer'] as Record<string, unknown>;
    expect(customer).toMatchObject({ countryId: null, occupationId: null, marketingChannelId: null, sex: null, birthdate: null, contactDate: null });
    expect((customer['currentAddress'] as Record<string, unknown>)['provinceId']).toBeNull();
  });
});

describe('assignmentOf (the choice of the owner field)', () => {
  it('a person is EMPLOYEE, a queue (wl:<id>) is WAITLIST, nothing is null', () => {
    expect(assignmentOf(' e-1 ')).toEqual({ destination: 'EMPLOYEE', responsibleEmployeeId: 'e-1' });
    expect(assignmentOf('wl:w-9')).toEqual({ destination: 'WAITLIST', waitlistId: 'w-9' });
    expect(assignmentOf('')).toBeNull();
    expect(assignmentOf(undefined)).toBeNull();
  });
});

describe('the bean: createProspectV2 (Save draft = DRAFT, the Save of the window = RELEASE)', () => {
  beforeEach(() => {
    resetMockProspectForm();
    resetMockProspects();
  });

  async function setup() {
    const backend = createMockProspectForm();
    const view = new ProspectFormView(new ProspectFormService(backend.api), { today: () => '2026-11-16', session: new ProspectSession() });
    await view.init({ action_type: 'add' });
    view.contractBean.customer_type = 'person';
    view.contractBean.customer_name = 'สมชาย ทดสอบ';
    return { backend, view, post: vi.spyOn(backend.api, 'createProspectV2') };
  }

  it('DRAFT: mode DRAFT, no assignment, an Idempotency-Key; success says so', async () => {
    const { view, post } = await setup();
    expect(await view.createProspectV2('DRAFT', '')).toBe(true);
    expect(post).toHaveBeenCalledTimes(1);
    const [body, key] = post.mock.calls[0];
    expect(body).toMatchObject({ mode: 'DRAFT', customer: { name: 'สมชาย', lastname: 'ทดสอบ' } });
    expect(body).not.toHaveProperty('assignment');
    expect(String(key).length).toBeGreaterThan(8);
    expect(view.takeScripts().join('\n')).toContain('บันทึกสำเร็จ');
  });

  it('a picture chosen before the save is uploaded once the customer has its id (and not lost)', async () => {
    const { backend, view } = await setup();
    const upload = vi.spyOn(backend.api, 'addProspectAttachment');
    view.request = { imgB64: 'QUJD', imgName: 'new.jpg' };
    await view.uploadProspectImage(); // no id yet: kept
    expect(upload).not.toHaveBeenCalled();
    expect(await view.createProspectV2('DRAFT', '')).toBe(true);
    expect(upload).toHaveBeenCalledTimes(1);
    const [id, body] = upload.mock.calls[0];
    expect(Number(id)).toBeGreaterThan(0);
    expect(body).toMatchObject({ fileName: 'new.jpg', attachFileTypeCode: 'PROFILE', attachFileBase64: 'QUJD' });
  });

  it('RELEASE: a person is EMPLOYEE, a queue is WAITLIST', async () => {
    const { view, post } = await setup();
    await view.createProspectV2('RELEASE', 'e-7');
    await view.createProspectV2('RELEASE', 'wl:w-1');
    expect(post.mock.calls.map((c) => c[0]['assignment'])).toEqual([{ destination: 'EMPLOYEE', responsibleEmployeeId: 'e-7' }, { destination: 'WAITLIST', waitlistId: 'w-1' }]);
  });

  it('a name is needed: nothing is asked', async () => {
    const { view, post } = await setup();
    view.contractBean.customer_name = '  ';
    expect(await view.createProspectV2('DRAFT', '')).toBe(false);
    expect(post).not.toHaveBeenCalled();
    expect(view.takeScripts().join('\n')).toContain('กรุณากรอกชื่อ-สกุล');
  });

  it('the duplicate check comes first: a strong duplicate stops RELEASE, a draft is only warned (it goes on)', async () => {
    const { view, post } = await setup();
    view.contractBean.customer_name = 'X-DUP-STRONG ทดสอบ';
    expect(await view.createProspectV2('RELEASE', 'e-1')).toBe(false);
    expect(post).not.toHaveBeenCalled();
    expect(view.takeScripts().join('\n')).toContain('พบข้อมูลซ้ำ');
    expect(await view.createProspectV2('DRAFT', '')).toBe(true);
    expect(post).toHaveBeenCalledTimes(1);
  });

  it('a refusal shows its reason; the same data again keeps the key (a retry is one action), other data or a success takes a new one', async () => {
    const { view, post } = await setup();
    view.contractBean.customer_name = 'X-FAIL ทดสอบ';
    expect(await view.createProspectV2('DRAFT', '')).toBe(false);
    expect(view.takeScripts().join('\n')).toContain('สร้างลูกค้าไม่สำเร็จ');
    await view.createProspectV2('DRAFT', '');
    const keys = post.mock.calls.map((c) => c[1]);
    expect(keys[0]).toBe(keys[1]); // the same data: the same action
    view.contractBean.customer_name = 'อีกคน ทดสอบ';
    await view.createProspectV2('DRAFT', '');
    expect(post.mock.calls[2][1]).not.toBe(keys[0]);
    await view.createProspectV2('DRAFT', ''); // the same data after a success: a new action
    expect(post.mock.calls[3][1]).not.toBe(post.mock.calls[2][1]);
  });
});

describe('POST /prospects (live) with the Idempotency-Key', () => {
  it('posts the body as it is with the header; the answer text whatever the status; the old shape stays closed', async () => {
    const { deps, calls } = fakeRest(() => ({ status: 422, text: '{"status":422}' }));
    const api = createLiveProspectFormApi(deps);
    expect(await api.createProspectV2({ mode: 'DRAFT', customer: { name: 'a' } }, 'key-1')).toBe('{"status":422}');
    expect(calls).toHaveLength(1);
    expect([calls[0].method, calls[0].path, calls[0].body]).toEqual(['POST', '/prospects', { mode: 'DRAFT', customer: { name: 'a' } }]);
    expect(calls[0].headers).toMatchObject({ 'Idempotency-Key': 'key-1' });
    await api.createProspect({ name: 'old shape' });
    expect(calls).toHaveLength(1); // closed
  });
});

describe('a value the service hides (****) is never sent', () => {
  it('isMaskedValue: only asterisks', () => {
    expect([isMaskedValue('****'), isMaskedValue(' ** '), isMaskedValue('a****'), isMaskedValue(''), isMaskedValue(null)]).toEqual([true, true, false, false, false]);
  });

  it('stripMasked removes the key at any depth and nulls the slot of a list (the slots keep their place)', () => {
    const body = { email: '****', name: 'a', currentAddress: { address: '****', postcode: '10110' }, mobilePhones: ['****', null, '0812345678'] };
    expect(stripMasked(body)).toEqual({ name: 'a', currentAddress: { postcode: '10110' }, mobilePhones: [null, null, '0812345678'] });
  });

  it('the create body and the duplicate check leave a hidden value out (null)', () => {
    const c = person();
    Object.assign(c, { prospect_email: '****', id_card: '****', tel: '****', prospect_phone1: '****' });
    const customer = buildCreateV2Body(c, LISTS, 'DRAFT', null)['customer'] as Record<string, unknown>;
    expect(customer).toMatchObject({ email: null, idCard: null, mainPhone: null });
    expect(customer['mobilePhones']).toEqual([null, null, '0865552222']);
    expect(JSON.stringify(duplicateCheckBody(c, 'SAVE_RELEASE' as never, null))).not.toContain('****');
  });
});
