/**
 * The server side of the prospect form that is plain I/O — the `api_*_list()` loaders, `view_Query_Data_Detail_API`, the documents, the metro
 * file — over the REST calls of `ProspectFormApi`. One class for the mock backend and the live one: they differ only in who answers the REST
 * calls. Framework-free (the comparison harness runs this very code as "the server" of the Java replica). It holds no page state — that is
 * `ProspectFormView` (the `@ViewScoped` bean); the only thing kept here is the metro file, which Java held in a static field.
 *
 * Not ported (decided with the rest of the prospect screens, docs/integration/prospects-live.md §3.1–3.2): the database reads / writes of
 * `ContractView` — `SunProspectInfoBoDao.loadByProspectId` (→ `sunInfoMap`, always empty here: the "ข้อมูลเพิ่มเติม" values come from the
 * `sunProspectInfo` object of the detail) and `ensureSunRecord` (the row the service wanted before `/attachments`).
 */
import { type JObj, isObj, optInt, optString, parseJson } from '@core/live/org-json';
import { normalizeCustomerType } from '@core/live/prospect-payload.live';
import { normalizeProspectV2 } from '@core/live/prospect-v2.live';
import type { ProspectDoc } from '../prospects.docs';
import type { ProspectFormApi } from './prospect-form-backend';
import {
  type MetroRow,
  digitsOnly,
  docsOfAnswer,
  keepThaiProvinces,
  keyOfCode,
  metroRowsOf,
  metroSubDistrictsOf,
  nameOfCode,
  parseApiIsoDate,
  parseMasterList,
  sexToDisplay,
  toBasicBean,
  toPlainBean,
} from './prospect-form.logic';
import { type BasicBean, type ContractBean, newContractBean } from './prospect-form-types';

/** `view_Query_Data_Detail_API`'s mapping of the answer of `GET /prospects/{id}` to a `ContractBean` (`today`: the defaults Java made with `new Date()`) */
export function detailToContract(r: JObj, today: string): ContractBean {
  const c = newContractBean(today);
  const s = (key: string): string => optString(r, key, '');
  const n = (key: string): number => optInt(r, key, 0);
  c.id = n('id');
  c.customer_name = s('name');
  c.customer_code = s('code');
  c.avatar = s('attachFile');
  c.tel = digitsOnly(s('customerTel'));
  c.phone_country_code = s('phoneCountryCode');
  c.sex = sexToDisplay(s('sex'));
  c.age = n('age');
  c.id_card = s('idCard');
  c.nationality = s('nationality');
  c.customer_type = normalizeCustomerType(s('customerType'));
  c.refferal = s('refferal');
  c.refferal_tel = s('referralTel');
  c.refferal_relate = s('referralRelate');
  c.workplace_name = s('workplaceName');
  c.workplace_position = s('workplacePosition');
  c.workplace_address = s('workplaceAddress');
  c.workplace_tel = s('workplaceTel');
  c.taxid = s('taxId');
  c.taxbranch = s('taxBranch');
  c.contract_business = s('contactBusiness');
  c.contract_position = s('contactPosition');
  const contactDate = parseApiIsoDate(s('contactDate'));
  if (contactDate !== null) c.date_save = contactDate;
  c.convenient_text = s('convenient');
  const birthdate = parseApiIsoDate(s('birthdate'));
  if (birthdate !== null) c.birthdate = birthdate;
  c.contact_backid = n('contactBackId');
  c.contact_backcode = s('contactBackCode');
  c.contact_backname = s('contactBackName');
  c.country = s('country');
  c.country_id = n('countryId');
  c.country_name = s('countryName');
  c.current_country_code = s('currentCountry');
  c.prospect_email = s('prospectEmail');
  c.prospect_line = s('prospectLine');
  c.prospect_facebook = s('prospectFacebook');
  c.prospect_twitter = s('prospectTwitter');
  c.prospect_instragram = s('prospectInstragram');
  c.prospect_phone1 = digitsOnly(s('prospectPhone1'));
  c.prospect_phone2 = digitsOnly(s('prospectPhone2'));
  c.prospect_phone3 = digitsOnly(s('prospectPhone3'));
  c.prospect_tel1 = s('prospectTel1');
  c.prospect_tel2 = s('prospectTel2');
  c.prospect_tel3 = s('prospectTel3');
  c.prospect_fax = s('prospectFax');
  c.salepersonid = n('salePersonId');
  c.salepersoncode = s('salePersonCode');
  c.salepersonname = s('salePersonName');
  c.occupationid = n('occupationId');
  c.occupationcode = s('occupationCode');
  c.occupationname = s('occupationName');
  c.businesstypeid = n('businessTypeId');
  c.businesstypecode = s('businessTypeCode');
  c.businesstypename = s('businessTypeName');
  c.senddoc_city_id = n('sendDocCityId');
  c.senddoc_city_code = s('sendDocCityCode');
  c.senddoc_city_name = s('sendDocCityName');
  c.senddoc_country_id = n('sendDocCountryId');
  c.senddoc_country_code = s('sendDocCountryCode');
  c.senddoc_country_name = s('sendDocCountryName');
  c.current_address = s('currentAddress');
  c.current_postid = s('currentPostId');
  c.current_city = s('currentCity');
  c.current_city_code = s('currentCityCode');
  c.current_city_name = s('currentCityName');
  c.current_district = s('currentDistrict');
  c.current_district_code = s('currentDistrictCode');
  c.current_district_name = s('currentDistrictName');
  c.current_sub_district_code = s('currentSubDistrictCode');
  c.current_sub_district_name = s('currentSubDistrictName');
  c.current_country_name = s('currentCountryName');
  const currentCountryCode = s('currentCountryCode');
  if (currentCountryCode !== '') c.current_country_code = currentCountryCode;
  c.senddoc_address = s('sendDocAddress');
  c.senddoc_postid = s('sendDocPostId');
  c.senddoc_district = s('sendDocDistrict');
  c.senddoc_district_code = s('sendDocDistrictCode');
  c.senddoc_district_name = s('sendDocDistrictName');
  c.senddoc_sub_district_code = s('sendDocSubDistrictCode');
  c.senddoc_sub_district_name = s('sendDocSubDistrictName');
  c.saleGroupId = n('saleGroupId');
  c.saleGroupCode = s('saleGroupCode');
  c.saleGroupName = s('saleGroupName');
  c.ggwBranchId = n('ggwBranchId');
  c.marketingchanelid = n('marketingChanelId');
  c.marketingchanelcode = s('marketingChanelCode');
  c.marketingchanelname = s('marketingChanelName');
  c.mainCustomerkeyId = n('mainCustomerkeyId');
  c.mainCustomerkeyCode = s('mainCustomerkeyCode');
  c.mainCustomerkeyName = s('mainCustomerkeyName');
  c.remark = s('remark');
  c.status = s('status');
  c.current_country_id = n('currentCountryId');
  c.senddoc_city = s('sendDocCity');
  c.senddoc_country = s('sendDocCountry');

  const sun = r['sunProspectInfo'];
  if (isObj(sun)) {
    const t = (key: string): string => optString(sun, key, '');
    c.researchcode = t('researcher');
    c.loantypeinitialcode = t('csLoanType');
    c.propertytypecode = t('csTypeProperty');
    c.property_to_pledge = t('csLoanProperty');
    c.property_description = t('csDescriptionProperty');
    c.confirm_servicetype_code = t('csTypeService');
    c.loan_amount = t('csDesiredLoanAmount');
    c.loan_term_years = t('csYearsLoan');
    c.has_co_borrower = t('csCoBorrower');
    c.relation_to_borrower = t('csMbRelationship');
    c.translate = t('csTranslate');
    c.vip = t('csVip');
    c.borrower_incometype_code = t('csIncomeType');
    c.thai_female_foreignincome_code = t('csTwoMenWoIncome');
    c.thai_co_borrower = t('csThaiCoBorrower');
    c.thai_co_borrowerjob_code = t('csJobCoBorrower');
    const research = parseApiIsoDate(t('txDate'));
    if (research !== null) c.research_date_cs = research;
    const transfer = parseApiIsoDate(t('csDateTransOwnership'));
    if (transfer !== null) c.estimated_transfer_ownership_date_cs = transfer;
  }
  return c;
}

// (the flattening of a record of the new service moved to core/live/prospect-v2.live.ts: the list reads it too)
export { normalizeProspectV2 };

/** what `view_Query_Data_Detail_API` leaves behind: the bean and the snapshot of the answer (`ss_contact_detail_original_json`) */
export interface LoadedDetail {
  contract: ContractBean;
  /** the `result` object of the answer, as the text Java kept in the session */
  snapshot: string;
}

export class ProspectFormService {
  readonly api: ProspectFormApi;
  private metro: MetroRow[] | null = null;

  constructor(api: ProspectFormApi) {
    this.api = api;
  }

  /* ---- master data */
  /** `api_country_list()` (the Thai names are translated by the API layer, `MasterDataI18n.translateTh`) */
  async countries(): Promise<BasicBean[]> {
    return parseMasterList(await this.api.masterData('countries?page=1&pageSize=1000'), toBasicBean);
  }

  /** `fetchBasicMasterDataList(path)` */
  private async basic(pathAndQuery: string): Promise<BasicBean[]> {
    return parseMasterList(await this.api.masterData(pathAndQuery), toBasicBean);
  }

  /** `api_province_list()`: the Thai provinces, one per code, plus the provinces the record already has */
  async provinces(currentCityCode: string | null | undefined, sendDocCityCode: string | null | undefined): Promise<BasicBean[]> {
    return keepThaiProvinces(await this.basic('provinces?page=1&pageSize=3000'), currentCityCode, sendDocCityCode);
  }

  /** `apiDistrictsOf(provinceCode)` — the province is found in `provinces` by code */
  async districtsOf(provinceCode: string | null | undefined, provinces: readonly BasicBean[]): Promise<BasicBean[]> {
    if (provinceCode == null || provinceCode.trim() === '') return [];
    const provinceId = keyOfCode(provinceCode.trim(), provinces);
    if (!provinceId) return [];
    return this.basic(`districts?provinceId=${provinceId}&page=1&pageSize=1000`);
  }

  /** `apiSubDistrictsOf(districtCode, districts)`: the service's rows, else the metro file's (it has the six metropolitan provinces) */
  async subDistrictsOf(districtCode: string | null | undefined, districts: readonly BasicBean[]): Promise<BasicBean[]> {
    if (districtCode == null || districtCode.trim() === '') return [];
    const districtId = keyOfCode(districtCode.trim(), districts);
    if (!districtId) return [];
    const fromApi = await this.basic(`sub-districts?districtId=${districtId}&page=1&pageSize=1000`);
    if (fromApi.length > 0) return fromApi;
    return metroSubDistrictsOf(await this.metroRows(), nameOfCode(districtCode, districts));
  }

  async businessTypes(): Promise<BasicBean[]> {
    return parseMasterList(await this.api.masterData('business-types?page=1&pageSize=1000'), toPlainBean);
  }
  async occupations(): Promise<BasicBean[]> {
    return parseMasterList(await this.api.masterData('occupations?page=1&pageSize=1000'), toPlainBean);
  }
  /** `api_marketing_chanel_list()` (no `nameTh`) */
  async marketingChannels(): Promise<BasicBean[]> {
    return parseMasterList(await this.api.masterData('marketing-channels?page=1&pageSize=1000'), (o) => ({ ...toPlainBean(o), nameTh: '' }));
  }
  /** `api_get_basic_data_list()`: the communication types (the "ช่องทางติดต่อกลับ" dropdown) */
  async communicationTypes(): Promise<BasicBean[]> {
    return parseMasterList(await this.api.masterData('communication-types?page=1&pageSize=1000'), toPlainBean);
  }
  async salePersons(): Promise<BasicBean[]> {
    return parseMasterList(await this.api.masterData('sale-persons?page=1&pageSize=1000'), toPlainBean);
  }

  /** `metroRows()`: read once (Java: a static field) */
  async metroRows(): Promise<MetroRow[]> {
    if (this.metro === null) this.metro = metroRowsOf(await this.api.metroGeo());
    return this.metro;
  }

  /* ---- the prospect */
  /**
   * `view_Query_Data_Detail_API(id)`: the bean of `GET /prospects/{id}` — undefined when there is none (no answer, not 200, no `result`, an
   * empty `result`): Java then leaves the bean it has (`contractBean = new ContractBean()` in init)
   */
  async detail(id: string, today: string): Promise<LoadedDetail | undefined> {
    const text = await this.api.prospect(id);
    if (!text || text.trim() === '') return undefined;
    const root = parseJson(text);
    if (!isObj(root) || Object.keys(root).length === 0) return undefined;
    const status = optInt(root, 'status', optInt(root, 'code', 0));
    let results: JObj | null = null;
    if (isObj(root['result'])) results = root['result'];
    else if (isObj(root['results'])) results = root['results'];
    if (status !== 200 || results === null || Object.keys(results).length === 0) return undefined;
    const flat = normalizeProspectV2(results);
    const contract = detailToContract(flat, today);
    // the new service says the state as DRAFT / RELEASE / BLOCK (the form keeps it in lower case)
    const usage = optString(flat, 'usageStatus', '').toLowerCase();
    if (usage !== '') contract.usagestatus = usage;
    return { contract, snapshot: JSON.stringify(results) };
  }

  /** `POST /prospects/duplicate-checks`: the text of the answer (a verdict is read by `parseDuplicateVerdict`) */
  async duplicateCheck(body: JObj): Promise<string> {
    return this.api.duplicateCheck(body);
  }

  /* ---- documents */
  /** `loadProspectDocs()`: the documents of a prospect (an unreadable answer is an empty list). `prospectId`: a number (old service) or the uuid */
  async docs(prospectId: number | string): Promise<ProspectDoc[]> {
    if (typeof prospectId === 'number' ? !(prospectId > 0) : prospectId.trim() === '') return [];
    return docsOfAnswer(await this.api.prospectAttachments(prospectId));
  }

  /**
   * `deleteProspectDocument()`: DELETE one. `success` of the answer says whether it worked; an answer that is not a JSON object throws in Java
   * and the method ends there — the list is NOT read again (`reload` false)
   */
  async deleteDoc(prospectId: number, no: number): Promise<{ ok: boolean; error: string; reload: boolean }> {
    const r = parseJson(await this.api.deleteProspectAttachment(prospectId, no));
    if (!isObj(r)) return { ok: false, error: 'ลบเอกสารไม่สำเร็จ: ', reload: false };
    const ok = r['success'] === true || r['success'] === 'true';
    return { ok, error: ok ? '' : `ลบเอกสารไม่สำเร็จ: ${optString(r, 'message', '')}`, reload: true };
  }
}
