import { beforeEach, describe, expect, it } from 'vitest';
import { resetMockProspects } from '../prospects.mock';
import { ProspectFormView, ProspectSession, parseViewDate, type ProspectFormOptions } from './prospect-form.bean';
import { ProspectFormService } from './prospect-form.service';
import { createMockProspectForm, currentMockDetail, resetMockProspectForm } from './prospect-form.mock';
import { SCRIPTS } from './prospect-form.logic';

const TODAY = '2026-10-20';
const USER = { id: 1001, code: 'E001', name: 'สมชาย ใจดี (ทดลอง)' };

function setup(o: ProspectFormOptions = {}) {
  const backend = createMockProspectForm();
  const session = new ProspectSession();
  const bean = new ProspectFormView(new ProspectFormService(backend.api), { today: () => TODAY, user: USER, session, ...o });
  return { backend, session, bean, api: backend.api };
}
const scriptsOf = (bean: ProspectFormView): string[] => bean.takeScripts();

beforeEach(() => {
  resetMockProspectForm();
  resetMockProspects();
});

describe('init: view', () => {
  it('opens a customer read only: the detail, the phone shown with its code, the documents, the lists the view needs', async () => {
    const { bean } = setup();
    await bean.init({ action_type: 'view', id: '1', pms: 'detail' });
    expect(bean.action_type).toBe('view');
    expect(bean.contractid).toBe('1');
    expect(bean.page_mode_status).toBe('detail');
    const c = bean.contractBean;
    expect(c).toMatchObject({ id: 1, customer_name: 'จิราพร แสงทอง', customer_type: 'person', tel: '0947421463', phone_country_code: '+66', country: 'THA', marketingchanelcode: 'MKC-005' });
    expect(bean.telDisplay).toBe('94-742-1463');
    expect(bean.telWithCode(c.tel)).toBe('+66 94-742-1463');
    expect(bean.formatTel('0812345678')).toBe('81-234-5678');
    expect(bean.prospectDocs.length).toBeGreaterThan(0);
    expect(bean.prospectDocs.every((d) => d.typecode !== 'PROFILE')).toBe(true);
    // view loads the channels, the provinces and the districts of the record, not the business types / occupations
    expect(bean.listMarketingChanelBean.length).toBeGreaterThan(0);
    expect(bean.listProvinceBean.map((p) => p.code)).toEqual(['BKK', 'CNX', 'KKC', 'HKT', 'CBI', 'NMA']); // foreign one dropped, doubled Bangkok folded, the tab trimmed
    expect(bean.listDistrictBean.map((d) => d.code)).toEqual(['HKT_01', 'HKT_02', 'HKT_03']);
    expect(bean.listBusinessTypeBean).toEqual([]);
    expect(bean.listOccupationBean).toEqual([]);
    expect(bean.listPhoneCodeBean.map((p) => p.phoneCountryCode)).toEqual(['+1', '+44', '+60', '+65', '+66', '+81']);
    expect(JSON.parse(bean.phoneFormatJson)['+66']).toBe('XX XXX XXXX / X XXXX XXXX');
  });

  it('masterLists: false (the detail page) opens the record and its documents but asks for no country / province / district / channel list', async () => {
    const asked: string[] = [];
    const { backend } = setup();
    const api = { ...backend.api, masterData: async (p: string) => (asked.push(p), backend.api.masterData(p)) };
    const bean = new ProspectFormView(new ProspectFormService(api), { today: () => TODAY, user: USER, session: new ProspectSession(), masterLists: false });
    await bean.init({ action_type: 'view', id: '1', pms: 'detail' });
    expect(bean.contractBean.id).toBe(1);
    expect(bean.prospectDocs.length).toBeGreaterThan(0);
    expect(asked).toEqual([]);
    expect([bean.listCountryBean, bean.listProvinceBean, bean.listDistrictBean, bean.listMarketingChanelBean]).toEqual([[], [], [], []]);
  });

  it('a record with no phone code gets the one of its country; a legacy "company" is a juristic customer; a juristic one has its tax branch', async () => {
    const { bean } = setup();
    await bean.init({ action_type: 'view', id: '5' });
    expect(bean.contractBean.phone_country_code).toBe('+66');
    const b2 = setup().bean;
    await b2.init({ action_type: 'view', id: '20' });
    expect(b2.contractBean.customer_type).toBe('juristic');
    expect(b2.contractBean.taxbranch).toBe('00000');
  });

  it('a channel and a country given by id only are named from the lists', async () => {
    const { bean } = setup();
    await bean.init({ action_type: 'edit', id: '7' });
    expect(bean.contractBean.marketingchanelid).toBeGreaterThan(0);
    // the detail carried the id only: code and name are those of the row of the list with that id
    const row = bean.listMarketingChanelBean.find((b) => b.id === bean.contractBean.marketingchanelid)!;
    expect(bean.contractBean.marketingchanelcode).toBe(row.code);
    expect(bean.contractBean.marketingchanelname).toBe(row.name);
    expect(row.code).not.toBe('');
    const b2 = setup().bean;
    await b2.init({ action_type: 'view', id: '13' });
    expect(b2.contractBean).toMatchObject({ country: 'THA', country_name: 'ไทย' });
  });

  it('a customer that does not exist leaves an empty bean (and the default phone code, Thailand)', async () => {
    const { bean } = setup();
    await bean.init({ action_type: 'view', id: '99999' });
    expect(bean.contractBean).toMatchObject({ id: 0, customer_name: '', phone_country_code: '+66', country: 'THA', country_name: 'ไทย' });
    expect(bean.prospectDocs).toEqual([]);
  });

  it('the session can force the page mode (ss_page_mode_status)', async () => {
    const { bean, session } = setup();
    session.ss_page_mode_status = 'chat';
    await bean.init({ action_type: 'view', id: '1', pms: 'detail' });
    expect(bean.page_mode_status).toBe('chat');
  });
});

describe('init: edit', () => {
  it('loads every list, and the sub-districts of a Bangkok district come from the metro file (the service has none)', async () => {
    const { bean } = setup();
    await bean.init({ action_type: 'edit', id: '10' });
    expect(bean.contractBean.current_district_code).toBe('BKK_03');
    expect(bean.listBusinessTypeBean).toHaveLength(3);
    expect(bean.listOccupationBean).toHaveLength(4);
    expect(bean.listConvenientTimeBean).toHaveLength(3);
    expect(bean.listSubDistrictBean.map((s) => [s.id, s.code, s.name])).toEqual([
      [null, '100401', 'มหาพฤฒาราม'],
      [null, '100402', 'สีลม'],
      [null, '100403', 'สุริยวงศ์'],
    ]);
    expect(bean.listSubDistrict2Bean.length).toBe(3);
  });

  it('keeps the snapshot of the detail for the update, and the contract bean in the session', async () => {
    const { bean, session } = setup();
    await bean.init({ action_type: 'edit', id: '1' });
    expect(JSON.parse(session.contactDetailOriginalJson!)).toMatchObject({ id: 1, name: 'จิราพร แสงทอง' });
    expect(session.contractBean).toBe(bean.contractBean);
  });
});

describe('init: add', () => {
  it('a blank form: no type chosen, status new, the signed-in employee as sale person, today, Thailand with +66', async () => {
    const { bean } = setup();
    await bean.init({ action_type: 'add' });
    expect(bean.contractBean).toMatchObject({ id: 0, customer_code: '', customer_type: '', usagestatus: 'new', salepersonid: 1001, salepersoncode: 'E001', salepersonname: USER.name, date_save: TODAY, country: 'THA', phone_country_code: '+66', birthdate: TODAY });
    expect(bean.listCountryBean.length).toBe(8);
    expect(bean.listProvinceBean.length).toBe(6);
    expect(bean.listDistrictBean).toEqual([]); // no province chosen yet
    expect(bean.prospectDocs).toEqual([]);
  });

  it('with no signed-in employee the sale person is empty', async () => {
    const { bean } = setup({ user: { id: 0, code: '', name: '' } });
    await bean.init({ action_type: 'add' });
    expect(bean.contractBean).toMatchObject({ salepersonid: 0, salepersoncode: '', salepersonname: '' });
  });

  it('the list mode of the shared bean loads nothing', async () => {
    const { bean } = setup();
    await bean.init({});
    expect(bean.action_type).toBe('list');
    expect(bean.contractid).toBe('');
    expect(bean.listCountryBean).toEqual([]);
  });
});

describe('a posted value', () => {
  it('assign: text · int · date', async () => {
    const { bean } = setup();
    await bean.init({ action_type: 'add' });
    bean.assign('#{contractView.contractBean.customer_name}', 'สมศรี', 'text');
    bean.assign('#{contractView.contractBean.age}', '41', 'int');
    bean.assign('#{contractView.contractBean.birthdate}', '05/03/1985', 'date');
    bean.assign('#{contractView.contractBean.date_save}', '', 'date');
    expect(bean.contractBean).toMatchObject({ customer_name: 'สมศรี', age: 41, birthdate: '1985-03-05', date_save: null });
    bean.assign('#{contractView.contractBean.age}', '', 'int');
    expect(bean.contractBean.age).toBeNull();
    bean.assign('#{contractView.contractBean.age}', 'abc', 'int'); // fails the converter: the value stays
    expect(bean.contractBean.age).toBeNull();
    expect(() => bean.assign('#{contractView.nope}', 'x', 'text')).toThrow();
    expect(() => bean.assign('#{contractView.contractBean.nope}', 'x', 'text')).toThrow();
  });

  it('parseViewDate reads dd/MM/yyyy only', () => {
    expect([parseViewDate('05/03/1985'), parseViewDate(' 1/2/2000 '), parseViewDate('1985-03-05'), parseViewDate('')]).toEqual(['1985-03-05', '2000-02-01', null, null]);
  });
});

describe('the ajax listeners', () => {
  it('changeUpdate: the numbers come back as digits and the main phone is kept in the session', async () => {
    const { bean, session } = setup();
    await bean.init({ action_type: 'add' });
    bean.assign('#{contractView.contractBean.tel}', '081-234 5678', 'text');
    bean.assign('#{contractView.contractBean.prospect_phone1}', '(02) 111', 'text');
    bean.assign('#{contractView.contractBean.prospect_tel1}', '02-111 #3', 'text');
    bean.changeUpdate();
    expect(bean.contractBean).toMatchObject({ tel: '0812345678', prospect_phone1: '02111', prospect_tel1: '02-111 #3' });
    expect(session.ss_tel).toBe('0812345678');
  });

  it('onTelChange strips the symbols; onCountryChange sets the phone code of the country (none = empty)', async () => {
    const { bean } = setup();
    await bean.init({ action_type: 'add' });
    bean.assign('#{contractView.contractBean.tel}', '+66 (81)', 'text');
    bean.onTelChange();
    expect(bean.contractBean.tel).toBe('6681');
    bean.assign('#{contractView.contractBean.country}', 'MYS', 'select');
    await bean.onCountryChange();
    expect(bean.contractBean.phone_country_code).toBe('+60');
    bean.assign('#{contractView.contractBean.country}', 'ATA', 'select');
    await bean.onCountryChange();
    expect(bean.contractBean.phone_country_code).toBe('');
    bean.assign('#{contractView.contractBean.country}', '', 'select');
    await bean.onCountryChange();
    expect(bean.contractBean.phone_country_code).toBe('');
  });

  it('the address cascade: the province clears the rest and loads the districts; the district loads the sub-districts; the sub-district fills the post code', async () => {
    const { bean } = setup();
    await bean.init({ action_type: 'add' });
    bean.assign('#{contractView.contractBean.current_city_code}', 'BKK', 'select');
    await bean.onCurrentProvinceChange();
    expect(bean.listDistrictBean.map((d) => d.code)).toEqual(['BKK_01', 'BKK_02', 'BKK_03']);
    expect(bean.listSubDistrictBean).toEqual([]);
    bean.assign('#{contractView.contractBean.current_district_code}', 'BKK_03', 'select');
    await bean.onCurrentDistrictChange();
    expect(bean.listSubDistrictBean.map((s) => s.code)).toEqual(['100401', '100402', '100403']);
    bean.assign('#{contractView.contractBean.current_sub_district_code}', '100402', 'select');
    await bean.onCurrentSubDistrictChange();
    expect(bean.contractBean.current_postid).toBe('10500');
    // a new province clears them again
    bean.assign('#{contractView.contractBean.current_city_code}', 'CNX', 'select');
    await bean.onCurrentProvinceChange();
    expect(bean.contractBean).toMatchObject({ current_district_code: '', current_sub_district_code: '', current_postid: '' });
    expect(bean.listSubDistrictBean).toEqual([]);
  });

  it('a sub-district the service has beats the metro file; one with no zip in the file leaves the post code alone', async () => {
    const { bean } = setup();
    await bean.init({ action_type: 'add' });
    bean.assign('#{contractView.contractBean.current_city_code}', 'KKC', 'select');
    await bean.onCurrentProvinceChange();
    bean.assign('#{contractView.contractBean.current_district_code}', 'KKC_01', 'select');
    await bean.onCurrentDistrictChange();
    expect(bean.listSubDistrictBean.map((s) => [s.id, s.code])).toEqual([[50001, 'KKC_0101'], [50002, 'KKC_0102']]);
    bean.assign('#{contractView.contractBean.current_postid}', '40000', 'text');
    bean.assign('#{contractView.contractBean.current_sub_district_code}', 'KKC_0101', 'select');
    await bean.onCurrentSubDistrictChange();
    expect(bean.contractBean.current_postid).toBe('40000');
  });

  it('the same cascade for the document address', async () => {
    const { bean } = setup();
    await bean.init({ action_type: 'add' });
    bean.assign('#{contractView.contractBean.senddoc_city_code}', 'BKK', 'select');
    await bean.onSendDocProvinceChange();
    bean.assign('#{contractView.contractBean.senddoc_district_code}', 'BKK_01', 'select');
    await bean.onSendDocDistrictChange();
    expect(bean.listSubDistrict2Bean).toHaveLength(3);
    bean.assign('#{contractView.contractBean.senddoc_sub_district_code}', '100101', 'select');
    await bean.onSendDocSubDistrictChange();
    expect(bean.contractBean.senddoc_postid).toBe('10200');
  });

  it('copyAddress copies the current address to the document address and reads its lists again', async () => {
    const { bean } = setup();
    await bean.init({ action_type: 'add' });
    Object.assign(bean.contractBean, { current_address: '1 ถนนสีลม', current_city_code: 'BKK', current_city_name: 'กรุงเทพมหานคร', current_district_code: 'BKK_03', current_district_name: 'เขตบางรัก', current_sub_district_code: '100402', current_sub_district_name: 'สีลม', current_postid: '10500', current_country_code: 'THA' });
    await bean.copyAddress();
    expect(bean.contractBean).toMatchObject({ senddoc_address: '1 ถนนสีลม', senddoc_city_code: 'BKK', senddoc_district_code: 'BKK_03', senddoc_sub_district_code: '100402', senddoc_postid: '10500', senddoc_country_code: 'THA' });
    expect(bean.listDistrict2Bean.map((d) => d.code)).toEqual(['BKK_01', 'BKK_02', 'BKK_03']);
    expect(bean.listSubDistrict2Bean).toHaveLength(3);
  });

  it('announces a change to the host', async () => {
    let n = 0;
    const { bean } = setup({ onChange: () => n++ });
    await bean.init({ action_type: 'add' });
    const after = n;
    bean.changeUpdate();
    expect(n).toBe(after + 1);
  });
});

describe('textAlert', () => {
  it('C does nothing; U needs an id and a name', async () => {
    const { bean } = setup();
    await bean.init({ action_type: 'add' });
    await bean.textAlert('C');
    expect(bean.takeScripts()).toEqual([]);
    await bean.textAlert('U');
    expect(scriptsOf(bean)).toEqual([SCRIPTS.noId]);
    const b2 = setup().bean;
    await b2.init({ action_type: 'edit', id: '1' });
    b2.assign('#{contractView.contractBean.customer_name}', '   ', 'text');
    await b2.textAlert('U');
    expect(scriptsOf(b2)).toEqual([SCRIPTS.needName]);
  });

  it('U: the PUT carries the form over the snapshot, the extra info is written, the page is told to go on', async () => {
    const { bean } = setup();
    await bean.init({ action_type: 'edit', id: '1' });
    bean.assign('#{contractView.contractBean.customer_name}', 'จิราพร ใหม่', 'text');
    bean.assign('#{contractView.contractBean.tel}', '081-111-2222', 'text');
    bean.assign('#{contractView.contractBean.remark}', 'แก้ไขแล้ว', 'text');
    bean.changeUpdate();
    await bean.textAlert('U');
    expect(scriptsOf(bean)).toEqual([SCRIPTS.updated('/triplesale')]);
    const saved = currentMockDetail(1)!;
    expect(saved).toMatchObject({ name: 'จิราพร ใหม่', customerTel: '0811112222', remark: 'แก้ไขแล้ว', code: 'P00001' });
    // the extra info the form carries was PUT too: the date of the research the record had, and today for the date it had none (as in Java)
    expect(saved['sunProspectInfo']).toMatchObject({ txDate: '2026-09-01', csDateTransOwnership: TODAY, researcher: 'E101' });
    expect(bean.lastApiError).toBe('');
  });

  it('U: a refusal of the service shows its message; a refusal of the extra info says the main data was saved', async () => {
    const { bean } = setup();
    await bean.init({ action_type: 'edit', id: '1' });
    bean.assign('#{contractView.contractBean.customer_name}', 'X-FAIL', 'text');
    await bean.textAlert('U');
    expect(scriptsOf(bean)).toEqual([SCRIPTS.updateFailed('[500] Internal Server Error')]);

    const b2 = setup().bean;
    await b2.init({ action_type: 'edit', id: '1' });
    b2.assign('#{contractView.contractBean.remark}', 'X-EXTRA-FAIL', 'text');
    await b2.textAlert('U');
    expect(scriptsOf(b2)).toEqual([SCRIPTS.updateFailed('บันทึกข้อมูลหลักสำเร็จ แต่ข้อมูลเพิ่มเติมไม่สำเร็จ: [500] Internal Server Error')]);
  });

  it('the main phone of the session replaces the phone of the form when it is not empty (a stale value of another page too — Java does)', async () => {
    const { bean, session } = setup();
    await bean.init({ action_type: 'edit', id: '1' });
    session.ss_tel = '0999999999';
    await bean.textAlert('U');
    expect(bean.contractBean.tel).toBe('0999999999');
    expect(currentMockDetail(1)!['customerTel']).toBe('0999999999');
  });

  it('P: creates the customer, with the extra info, and tells the page to go to the list', async () => {
    const { bean } = setup();
    await bean.init({ action_type: 'add' });
    bean.assign('#{contractView.contractBean.customer_name}', 'ลูกค้าใหม่ ทดสอบ', 'text');
    bean.assign('#{contractView.contractBean.customer_type}', 'person', 'radio');
    bean.assign('#{contractView.contractBean.tel}', '0812223333', 'text');
    bean.assign('#{contractView.contractBean.marketingchanelcode}', 'MKC-001', 'select');
    await bean.textAlert('P');
    expect(scriptsOf(bean)).toEqual([SCRIPTS.created('/triplesale')]);
    expect(bean.contractBean.id).toBe(1000);
    const saved = currentMockDetail(1000)!;
    expect(saved).toMatchObject({ name: 'ลูกค้าใหม่ ทดสอบ', customerTel: '0812223333', customerType: 'person', marketingChanelId: 10, countryId: 1, usageStatus: 'release', convenientTime: '2025-07-04T10:00:00' });
    expect(saved['sunProspectInfo']).toMatchObject({ txDate: TODAY });
  });

  it('P: needs a name; a failure keeps the data and says why', async () => {
    const { bean } = setup();
    await bean.init({ action_type: 'add' });
    await bean.textAlert('P');
    expect(scriptsOf(bean)).toEqual([SCRIPTS.needName]);
    bean.assign('#{contractView.contractBean.customer_name}', 'X-INVALID', 'text');
    await bean.textAlert('P');
    expect(scriptsOf(bean)).toEqual([SCRIPTS.createFailed('[400] Bad Request — name is invalid')]);
    expect(bean.contractBean.customer_name).toBe('X-INVALID');
    expect(bean.contractBean.id).toBe(0);
  });

  it('L: creates the customer (the service creates the lead) and moves the owner; L2 opens the success dialog whatever happens', async () => {
    const { bean, api } = setup();
    await bean.init({ action_type: 'add' });
    bean.assign('#{contractView.contractBean.customer_name}', 'ลูกค้าลีด', 'text');
    bean.request = { movementTypeId: '1004400743', employeeId: '103' };
    await bean.textAlert('L');
    expect(scriptsOf(bean)).toEqual([SCRIPTS.createdWithLead('/triplesale')]);
    const leads = JSON.parse(await api.findLeads('movementTypeId=1004400743')) as { result: { leads: { items: Array<{ prospectId: number; employeeId: number }> } } };
    expect(leads.result.leads.items[0]).toMatchObject({ prospectId: 1000, employeeId: 103 });

    const b2 = setup().bean;
    await b2.init({ action_type: 'view', id: '1' });
    await b2.textAlert('L2'); // POST /leads of the saved customer
    expect(scriptsOf(b2)).toEqual([SCRIPTS.openCreateLeadSuccess]);
    const b3 = setup().bean;
    await b3.init({ action_type: 'add' });
    b3.assign('#{contractView.contractBean.customer_name}', 'ยังไม่บันทึก', 'text');
    await b3.textAlert('L2'); // no id: the lead call fails, the dialog opens all the same
    expect(scriptsOf(b3)).toEqual([SCRIPTS.openCreateLeadSuccess]);
    expect(b3.lastApiError).toBe('ต้องบันทึกข้อมูลลูกค้าก่อนจึงสร้าง Lead ได้');
  });

  it('with the config that the customer call does not create the lead, POST /leads follows (and its failure is shown)', async () => {
    const { bean } = setup({ prospectCreatesLead: false });
    await bean.init({ action_type: 'add' });
    bean.assign('#{contractView.contractBean.customer_name}', 'ลูกค้าลีด 2', 'text');
    bean.request = { movementTypeId: '1004400743', procedureGroupId: '5' };
    await bean.textAlert('L');
    expect(scriptsOf(bean)).toEqual([SCRIPTS.createdWithLead('/triplesale')]);
  });
});

describe('saveProspectAndLead', () => {
  it('a product with workflow steps needs a step group', async () => {
    const { bean } = setup();
    await bean.init({ action_type: 'add' });
    bean.assign('#{contractView.contractBean.customer_name}', 'ลูกค้า', 'text');
    bean.request = { movementTypeId: '1004400740' };
    await bean.saveProspectAndLead();
    expect(scriptsOf(bean)).toEqual([SCRIPTS.needStepGroup]);
    expect(bean.contractBean.id).toBe(0); // nothing was sent
    bean.request = { movementTypeId: '1004400740', procedureGroupId: '101' };
    await bean.saveProspectAndLead();
    expect(scriptsOf(bean)).toEqual([SCRIPTS.leadSaved]);
    expect(bean.contractBean.id).toBe(1000);
  });

  it('a name is needed; a 409 asks to merge, the answer "merge" goes through; another failure shows its message', async () => {
    const { bean } = setup();
    await bean.init({ action_type: 'add' });
    await bean.saveProspectAndLead();
    expect(scriptsOf(bean)).toEqual([SCRIPTS.needName]);
    bean.assign('#{contractView.contractBean.customer_name}', 'X-DUP', 'text');
    bean.request = {};
    await bean.saveProspectAndLead();
    expect(bean.lastApiStatus).toBe(409);
    expect(scriptsOf(bean)).toEqual([SCRIPTS.mergeConfirm('[409] พบลูกค้าที่ซ้ำกัน: ชื่อและเบอร์โทรตรงกับลูกค้ารหัส P00001')]);
    bean.request = { confirmMerge: 'true' };
    await bean.saveProspectAndLead();
    expect(scriptsOf(bean)).toEqual([SCRIPTS.leadSaved]);

    const b2 = setup().bean;
    await b2.init({ action_type: 'add' });
    b2.assign('#{contractView.contractBean.customer_name}', 'X-FAIL', 'text');
    await b2.saveProspectAndLead();
    expect(scriptsOf(b2)).toEqual([SCRIPTS.createFailed('[500] Internal Server Error')]);
  });

  it('the owner chosen in the modal is the sale person of the new customer and the owner of its lead', async () => {
    const { bean, api } = setup();
    await bean.init({ action_type: 'add' });
    bean.assign('#{contractView.contractBean.customer_name}', 'มีผู้รับผิดชอบ', 'text');
    bean.request = { movementTypeId: '1004400743', assignToId: '200', employeeId: '102' };
    await bean.saveProspectAndLead();
    expect(currentMockDetail(1000)).toMatchObject({ salePersonId: 200, salePersonCode: 'GGW-100', salePersonName: 'พนักงานขาย ทดสอบ' });
    const leads = JSON.parse(await api.findLeads('movementTypeId=1004400743')) as { result: { leads: { items: Array<{ employeeId: number }> } } };
    expect(leads.result.leads.items[0].employeeId).toBe(102);
  });
});

describe('the picture', () => {
  it('of a saved customer: stored, linked with PUT, read back, shown; the snapshot of the next update carries it', async () => {
    const { bean, session } = setup();
    await bean.init({ action_type: 'edit', id: '2' });
    bean.request = { imgB64: 'data:image/jpeg;base64,QUJD', imgName: 'me.jpg' };
    await bean.uploadProspectImage();
    const scripts = scriptsOf(bean);
    expect(scripts).toHaveLength(1);
    expect(scripts[0]).toContain('บันทึกรูปสำเร็จ!');
    expect(bean.contractBean.avatar).toMatch(/^prospect\/\d+\/me\.jpg$/);
    expect(currentMockDetail(2)!['attachFile']).toBe(bean.contractBean.avatar);
    expect(JSON.parse(session.contactDetailOriginalJson!)['attachFile']).toBe(bean.contractBean.avatar);
    // the update that follows does not put the old picture back
    await bean.textAlert('U');
    expect(currentMockDetail(2)!['attachFile']).toBe(bean.contractBean.avatar);
  });

  it('of a customer not saved yet: kept until the create gives an id, then uploaded without a dialog', async () => {
    const { bean } = setup();
    await bean.init({ action_type: 'add' });
    bean.request = { imgB64: 'QUJD', imgName: 'new.jpg' };
    await bean.uploadProspectImage();
    expect(scriptsOf(bean)).toEqual([]);
    bean.assign('#{contractView.contractBean.customer_name}', 'มีรูป', 'text');
    bean.request = {};
    await bean.textAlert('P');
    expect(scriptsOf(bean)).toEqual([SCRIPTS.created('/triplesale')]); // no picture dialog over it
    expect(String(currentMockDetail(1000)!['attachFile'])).toMatch(/^prospect\/\d+\/new\.jpg$/);
  });

  it('a picture the service refuses is reported; no picture sent is ignored', async () => {
    const { bean } = setup();
    await bean.init({ action_type: 'edit', id: '2' });
    bean.request = {};
    await bean.uploadProspectImage();
    bean.request = { imgB64: ' ' };
    await bean.uploadProspectImage();
    expect(scriptsOf(bean)).toEqual([]);
    bean.request = { imgB64: 'QUJD', imgName: 'FAIL.jpg' };
    await bean.uploadProspectImage();
    expect(scriptsOf(bean)).toEqual([]); // the POST was refused: no address came back, Java ends there too
  });

  it('avatarSrc: an absolute address goes through the proxy of the page, a relative one is shown as it is', async () => {
    const { bean } = setup();
    expect(bean.avatarSrc('http://files/prospect/1/a.jpg')).toBe('/triplesale/docproxy?url=http%3A%2F%2Ffiles%2Fprospect%2F1%2Fa.jpg');
    expect(bean.avatarSrc('prospect/1/a.jpg')).toBe('prospect/1/a.jpg');
    const live = setup({ docProxy: (u) => u }).bean;
    expect(live.avatarSrc('http://files/a.jpg')).toBe('http://files/a.jpg');
  });
});

describe('the documents', () => {
  it('deleteProspectDocument deletes the row of docNo and reads the list again; a refused delete shows the real list', async () => {
    const { bean } = setup();
    await bean.init({ action_type: 'view', id: '1' });
    const before = bean.prospectDocs.map((d) => d.no);
    expect(before.length).toBeGreaterThan(1);
    bean.request = { docNo: before[0] };
    await bean.deleteProspectDocument();
    expect(bean.prospectDocs.map((d) => d.no)).toEqual(before.filter((n) => n !== before[0]));
    expect(bean.lastApiError).toBe('');
    bean.request = { docNo: '99999' };
    await bean.deleteProspectDocument();
    expect(bean.lastApiError).toContain('ลบเอกสารไม่สำเร็จ');
    expect(bean.prospectDocs.map((d) => d.no)).toEqual(before.filter((n) => n !== before[0]));
  });

  it('no id, no docNo, or a docNo that is not a number: nothing is deleted', async () => {
    const { bean } = setup();
    await bean.init({ action_type: 'add' });
    bean.request = { docNo: '3' };
    await bean.deleteProspectDocument();
    const b2 = setup().bean;
    await b2.init({ action_type: 'view', id: '1' });
    const n = b2.prospectDocs.length;
    b2.request = {};
    await b2.deleteProspectDocument();
    b2.request = { docNo: 'abc' };
    await b2.deleteProspectDocument();
    expect(b2.prospectDocs).toHaveLength(n);
  });
});
