/**
 * The types of the prospect form (`web/pages/contracts_master_data.xhtml`, three modes in one page) — the names are those of the Java side,
 * because the Facelets page reads them through EL (`#{contractView.contractBean.customer_type}`) and the generated template reads
 * `bean.contractBean.customer_type`. Framework-free (the comparison harness loads this file into Node).
 */

/** `action_type` of the page: add (a new customer) · view (read only) · edit */
export type ProspectMode = 'add' | 'view' | 'edit';

/**
 * `BasicBean`: one row of a master-data list. `id` is null on purpose for the rows that come from `metro_geo.json` (Java: "id left null — the
 * backend has no such row to resolve to an id; the payload sends subDistrictId = null with the real code / name").
 */
export interface BasicBean {
  id: number | null;
  /** the uuid of the record on the new service (`GET /prospects/options`): `id` is a number only on the old one */
  uid?: string;
  code: string;
  name: string;
  nameTh: string;
  phoneCountryCode: string;
  phoneNumberFormat: string;
}

/**
 * `ContractBean` — the fields the prospect form reads / writes (Java's has ~400; the rest belong to the other screens that share the class).
 * Dates are `yyyy-MM-dd` texts where Java held a `java.util.Date` (the same decision as the supporting-document port); the time of day Java
 * kept in `new Date()` defaults is not modelled, see the notes in prospect-form.logic.ts (`buildCreateBody`).
 */
export interface ContractBean {
  id: number;
  /** `date_save`: the date of the first contact (null = not set) */
  date_save: string | null;
  customer_code: string;
  customer_name: string;
  /** the picture of the customer as the service gave it (a full address) */
  avatar: string;
  /** `tel`: the main phone, digits only after the first ajax */
  tel: string;
  phone_country_code: string;
  customer_type: string;
  /** Java: `new Date()` — the default is today and it is NEVER null (the update body therefore always carries `convenientTime` = today) */
  convenient_time: string | null;
  convenient_text: string;
  contact_backid: number;
  contact_backcode: string;
  contact_backname: string;
  usagestatus: string;
  salepersonid: number;
  salepersoncode: string;
  salepersonname: string;
  marketingchanelid: number;
  marketingchanelcode: string;
  marketingchanelname: string;
  country_id: number;
  country: string;
  country_name: string;
  remark: string;
  prospect_phone1: string;
  prospect_phone2: string;
  prospect_phone3: string;
  prospect_tel1: string;
  prospect_tel2: string;
  prospect_tel3: string;
  prospect_fax: string;
  prospect_email: string;
  prospect_line: string;
  prospect_facebook: string;
  prospect_twitter: string;
  prospect_instragram: string;
  id_card: string;
  /** Java: `new Date()` by default (a customer with no birth date shows today's date and is saved with it) */
  birthdate: string | null;
  /** Java `Integer`: null after the field is cleared (the page then shows nothing; a 0 shows "0") */
  age: number | null;
  occupationid: number;
  occupationcode: string;
  occupationname: string;
  nationality: string;
  refferal: string;
  refferal_tel: string;
  refferal_relate: string;
  workplace_name: string;
  workplace_position: string;
  workplace_address: string;
  workplace_tel: string;
  taxid: string;
  taxbranch: string;
  businesstypeid: number;
  businesstypecode: string;
  businesstypename: string;
  contract_business: string;
  contract_position: string;
  current_address: string;
  current_district: string;
  current_city: string;
  current_postid: string;
  current_country_id: number;
  current_country_code: string;
  current_country_name: string;
  senddoc_address: string;
  senddoc_district: string;
  senddoc_city: string;
  senddoc_postid: string;
  senddoc_country_id: number;
  senddoc_country: string;
  senddoc_country_name: string;
  senddoc_country_code: string;
  current_district_code: string;
  current_district_name: string;
  current_sub_district_code: string;
  current_sub_district_name: string;
  senddoc_district_code: string;
  senddoc_district_name: string;
  senddoc_sub_district_code: string;
  senddoc_sub_district_name: string;
  /** shown text: ชาย · หญิง · ไม่ระบุเพศ (the radio group of the page) */
  sex: string;
  current_city_code: string;
  current_city_name: string;
  senddoc_city_id: number;
  senddoc_city_code: string;
  senddoc_city_name: string;
  saleGroupId: number;
  saleGroupCode: string;
  saleGroupName: string;
  mainCustomerkeyId: number;
  mainCustomerkeyCode: string;
  mainCustomerkeyName: string;
  ggwBranchId: number;
  status: string;
  /* ---- "ข้อมูลเพิ่มเติม" read from `sunProspectInfo` of the detail (they are written back by PUT /prospects/{id}/extra-info) */
  researchcode: string;
  /** Java: `new Date()` by default (the extra-info body therefore always carries `txDate` = today) */
  research_date_cs: string | null;
  loantypeinitialcode: string;
  propertytypecode: string;
  property_to_pledge: string;
  property_description: string;
  /** Java: `new Date()` by default (`csDateTransOwnership` = today) */
  estimated_transfer_ownership_date_cs: string | null;
  confirm_servicetype_code: string;
  loan_amount: string;
  loan_term_years: string;
  has_co_borrower: string;
  relation_to_borrower: string;
  translate: string;
  vip: string;
  borrower_incometype_code: string;
  thai_female_foreignincome_code: string;
  thai_co_borrower: string;
  thai_co_borrowerjob_code: string;
}

/** `ContractBean` as `new ContractBean()` builds it; `today` is the `yyyy-MM-dd` of the defaults Java made with `new Date()` */
export function newContractBean(today: string): ContractBean {
  return {
    id: 0,
    date_save: null,
    customer_code: '',
    customer_name: '',
    avatar: '',
    tel: '',
    phone_country_code: '',
    customer_type: '',
    convenient_time: today,
    convenient_text: '',
    contact_backid: 0,
    contact_backcode: '',
    contact_backname: '',
    usagestatus: '',
    salepersonid: 0,
    salepersoncode: '',
    salepersonname: '',
    marketingchanelid: 0,
    marketingchanelcode: '',
    marketingchanelname: '',
    country_id: 0,
    country: '',
    country_name: '',
    remark: '',
    prospect_phone1: '',
    prospect_phone2: '',
    prospect_phone3: '',
    prospect_tel1: '',
    prospect_tel2: '',
    prospect_tel3: '',
    prospect_fax: '',
    prospect_email: '',
    prospect_line: '',
    prospect_facebook: '',
    prospect_twitter: '',
    prospect_instragram: '',
    id_card: '',
    birthdate: today,
    age: 0,
    occupationid: 0,
    occupationcode: '',
    occupationname: '',
    nationality: '',
    refferal: '',
    refferal_tel: '',
    refferal_relate: '',
    workplace_name: '',
    workplace_position: '',
    workplace_address: '',
    workplace_tel: '',
    taxid: '',
    taxbranch: '',
    businesstypeid: 0,
    businesstypecode: '',
    businesstypename: '',
    contract_business: '',
    contract_position: '',
    current_address: '',
    current_district: '',
    current_city: '',
    current_postid: '',
    current_country_id: 0,
    current_country_code: '',
    current_country_name: '',
    senddoc_address: '',
    senddoc_district: '',
    senddoc_city: '',
    senddoc_postid: '',
    senddoc_country_id: 0,
    senddoc_country: '',
    senddoc_country_name: '',
    senddoc_country_code: '',
    current_district_code: '',
    current_district_name: '',
    current_sub_district_code: '',
    current_sub_district_name: '',
    senddoc_district_code: '',
    senddoc_district_name: '',
    senddoc_sub_district_code: '',
    senddoc_sub_district_name: '',
    sex: '',
    current_city_code: '',
    current_city_name: '',
    senddoc_city_id: 0,
    senddoc_city_code: '',
    senddoc_city_name: '',
    saleGroupId: 0,
    saleGroupCode: '',
    saleGroupName: '',
    mainCustomerkeyId: 0,
    mainCustomerkeyCode: '',
    mainCustomerkeyName: '',
    ggwBranchId: 0,
    status: '',
    researchcode: '',
    research_date_cs: today,
    loantypeinitialcode: '',
    propertytypecode: '',
    property_to_pledge: '',
    property_description: '',
    estimated_transfer_ownership_date_cs: today,
    confirm_servicetype_code: '',
    loan_amount: '',
    loan_term_years: '',
    has_co_borrower: '',
    relation_to_borrower: '',
    translate: '',
    vip: '',
    borrower_incometype_code: '',
    thai_female_foreignincome_code: '',
    thai_co_borrower: '',
    thai_co_borrowerjob_code: '',
  };
}

/** the values `CommonBean` rendered into the page with EL (the host gives them to the engine) */
export interface ProspectFormInitial {
  /** `commonBean.uploadAcceptExt` */
  uploadAcceptExt: string;
  /** `commonBean.ssEmployeeId` — the signed-in employee (the page's script reads it as the default owner of a new lead) */
  ssEmployeeId: string;
}

/** the signed-in employee (Java: the session attributes `ssoemp_id` / `ssoemp_code` / `ssoemp_name`) */
export interface ProspectFormUser {
  id: number;
  code: string;
  name: string;
}
