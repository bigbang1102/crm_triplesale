/**
 * The body builders of the prospect REST resource, ported from the Java `ProspectApiPayload` (the filter of the bodies of
 * `POST|PUT /prospects`, `PUT /prospects/{id}/extra-info`, the customer type and the head-office default of the tax branch) and
 * `AttachUrl` (the file addresses: `collapse` before a file is shown or fetched, `toRelative` before it is sent). Pure: no Angular, no I/O.
 *
 * The key lists below are COPIED from `ProspectApiPayload.java` (MAIN_KEYS 104, SATISFACTION_KEYS 34, EXTRA_INFO_KEYS 488); they are what the
 * backend accepts ("a key outside the list is dropped silently by the service"), so a key added to the Java list must be added here too.
 */
import { has, hasVal, isObj, optString, type JObj } from './org-json';

/** Java `String.trim()`: every character up to U+0020 goes (JS `trim()` also removes no-break spaces and the like) */
export const jtrim = (s: string): string => s.replace(/^[\u0000- ]+|[\u0000- ]+$/g, '');

/* ---------------------------------------------------------------- AttachUrl */

/** scheme + host, one layer: "http://h/" */
const HOST_PREFIX = /^https?:\/\/[^/]+\//;

/** `AttachUrl.isAbsolute`: starts with http:// or https:// (any case, after trim) */
export function isAbsolute(s: string | null | undefined): boolean {
  if (s == null) return false;
  const low = jtrim(s).toLowerCase();
  return low.startsWith('http://') || low.startsWith('https://');
}

/** `AttachUrl.collapse`: "http://h/http://h/a/b.jpg" → "http://h/a/b.jpg"; a relative path or a single host is returned as it is */
export function collapse(raw: string | null | undefined): string {
  if (raw == null) return '';
  let url = jtrim(raw);
  while (url !== '') {
    const rest = url.replace(HOST_PREFIX, '');
    if (rest === url || !isAbsolute(rest)) break; // not an absolute URL any more, or the rest is the real path
    url = rest; // the rest is a whole URL again: the outer host is a fake one
  }
  return url;
}

/** `AttachUrl.toRelative`: the path without scheme and host (the API adds the host itself when it reads) */
export const toRelative = (raw: string | null | undefined): string => collapse(raw).replace(HOST_PREFIX, '');

/** `AttachUrl.toRelativeIn`: the given keys of a body that hold a non-blank text become relative paths (in place) */
export function toRelativeIn(body: JObj, ...keys: string[]): void {
  for (const key of keys) {
    if (!hasVal(body, key)) continue;
    const val = body[key];
    if (typeof val !== 'string' || jtrim(val) === '') continue;
    body[key] = toRelative(val);
  }
}

/* ---------------------------------------------------------------- ProspectApiPayload */

export const CUSTOMER_TYPE_PERSON = 'person';
export const CUSTOMER_TYPE_JURISTIC = 'juristic';
/** the value before 31/08/2026: read, never sent */
export const CUSTOMER_TYPE_JURISTIC_LEGACY = 'company';
/** the registration branch of the head office, the default of a juristic customer */
export const TAX_BRANCH_HEAD_OFFICE = '00000';

/** `normalizeCustomerType`: '' stays '', juristic / company (any case) → juristic, anything else → person */
export function normalizeCustomerType(value: string | null | undefined): string {
  const v = value == null ? '' : jtrim(value);
  if (v === '') return '';
  const low = v.toLowerCase();
  if (low === CUSTOMER_TYPE_JURISTIC || low === CUSTOMER_TYPE_JURISTIC_LEGACY) return CUSTOMER_TYPE_JURISTIC;
  return CUSTOMER_TYPE_PERSON;
}

/** `isJuristic`: juristic or the legacy company */
export const isJuristic = (value: string | null | undefined): boolean => normalizeCustomerType(value) === CUSTOMER_TYPE_JURISTIC;

/** `ensureTaxBranchForJuristic`: a juristic customer with a blank (or "null") tax branch gets the head office (in place) */
export function ensureTaxBranchForJuristic(body: JObj | null): void {
  if (!body || !isJuristic(optString(body, 'customerType', ''))) return;
  const branch = jtrim(optString(body, 'taxBranch', ''));
  if (branch === '' || branch.toLowerCase() === 'null') body['taxBranch'] = TAX_BRANCH_HEAD_OFFICE;
}

export const MAIN_KEYS: readonly string[] = [
  'code', 'status', 'confirmMerge', 'createBy', 'removeStatus', 'name',
  'usageStatus', 'sex', 'customerTel', 'contactDate', 'convenientTime', 'currentAddress',
  'currentPostId', 'prospectEmail', 'prospectLine', 'prospectFacebook', 'prospectTwitter', 'prospectInstragram',
  'customerType', 'convenient', 'country', 'remark', 'prospectPhone1', 'prospectPhone2',
  'prospectPhone3', 'prospectTel1', 'prospectTel2', 'prospectTel3', 'prospectFax', 'phoneCountryCode',
  'idCard', 'birthdate', 'age', 'nationality', 'refferal', 'referralTel',
  'workplaceName', 'workplacePosition', 'workplaceAddress', 'workplaceTel', 'referralRelate', 'taxId',
  'taxBranch', 'contactBusiness', 'contactPosition', 'sendDocAddress', 'sendDocPostId', 'occupationId',
  'occupationCode', 'occupationName', 'marketingChanelId', 'marketingChanelCode', 'marketingChanelName', 'salePersonId',
  'salePersonCode', 'salePersonName', 'countryId', 'countryCode', 'countryName', 'contactBackId',
  'contactBackCode', 'contactBackName', 'currentCityId', 'currentCityCode', 'currentCityName', 'currentCountryId',
  'currentCountryCode', 'currentCountryName', 'sendDocCityId', 'sendDocCityCode', 'sendDocCityName', 'sendDocCountryId',
  'sendDocCountryCode', 'sendDocCountryName', 'sendDocDistrictId', 'sendDocDistrictCode', 'sendDocDistrictName', 'sendDocSubDistrictId',
  'sendDocSubDistrictCode', 'sendDocSubDistrictName', 'saleGroupId', 'saleGroupCode', 'saleGroupName', 'currentDistrictId',
  'currentDistrictCode', 'currentDistrictName', 'currentSubDistrictId', 'currentSubDistrictCode', 'currentSubDistrictName', 'ggwBranchId',
  'ggwBranchCode', 'ggwBranchName', 'businessTypeId', 'businessTypeCode', 'businessTypeName', 'attachFile',
  'downloadAttachFile', 'attachFileBase64', 'movementTypeId', 'movementTypeCode', 'movementTypeName', 'procedureGroupId',
  'assignToId', 'employeeId',
];

export const SATISFACTION_KEYS: readonly string[] = [
  'customerGender', 'customerAge', 'customerStatus', 'customerCountry', 'customerJob', 'customerMarketingChannel1',
  'customerMarketingChannel2', 'customerMarketingChannel3', 'customerMarketingChannel4', 'customerMarketingChannel5', 'customerMarketingChannel6', 'customerMarketingChannel7',
  'customerMarketingOther', 'customerReason1', 'customerReason2', 'customerReason3', 'customerReason4', 'customerReason5',
  'customerReason6', 'customerReasonOther', 'satisfactionSuggestion', 'satisfactionMarketing', 'satisfactionDocument', 'satisfactionContact',
  'satisfactionFee', 'satisfactionPaymentService', 'satisfactionManners', 'satisfactionServiceMind', 'satisfactionKnowledge', 'satisfactionServiceStandard',
  'satisfactionHonest', 'satisfactionCustomerTracking', 'satisfactionPublicRelations', 'satisfactionComment',
];

export const EXTRA_INFO_KEYS: readonly string[] = [
  'cbAge', 'cbAgeMt60', 'cbBaOwnNameLeast12m', 'cbBaOwnNameLeast6m', 'cbBusinessType', 'cbCareer',
  'cbCompany', 'cbCompanyBaLeast12m', 'cbCompanyPayTax', 'cbEducation', 'cbEmpRetireMoney', 'cbForeignResidenceDocs',
  'cbGender', 'cbHouseholdExpenses', 'cbIncome', 'cbIncomeStm', 'cbMaritalStatus', 'cbMarriedNational',
  'cbOperationLeast2y', 'cbOwnNamePayTax', 'cbOwnerFreelance', 'cbOwnerRetireMoney', 'cbPaySlipLeast6m', 'cbPayTax',
  'cbPersonalExpenses', 'cbPhotoCompany', 'cbPresentPosition', 'cbPresentYearsWork', 'cbRegTradeOwnName', 'cbRetireReceiveDocs',
  'cbSalaryCerti', 'cbSalaryTransferBa', 'cbSpouseAge', 'cbSpouseCareer', 'cbSpouseEducation', 'cbSpouseRemark',
  'cbTypeMarriedRegis', 'crmCollateralResidents', 'crmContractPersonForeign1', 'crmContractPersonForeign2', 'crmContractPersonThai1', 'crmContractPersonThai2',
  'crmContractPersonThai3', 'crmCustomerClosesAccountBankDate', 'crmCustomerNotifiescancellationServiceDate', 'crmCustomersPayThroughCompanyNo', 'crmForeignHomePhone1', 'crmForeignHomePhone2',
  'crmForeignLine1', 'crmForeignLine2', 'crmForeignPhone1', 'crmForeignPhone2', 'crmForeignRelations1', 'crmForeignRelations2',
  'crmInstallmentCustomerpayingHimselfDate', 'crmPurchasePurpose', 'crmRelationsBorrower', 'crmSendingFirstInstallmentBankDate', 'crmThaiHomePhone1', 'crmThaiHomePhone2',
  'crmThaiHomePhone3', 'crmThaiLine1', 'crmThaiLine2', 'crmThaiLine3', 'crmThaiPhone1', 'crmThaiPhone2',
  'crmThaiPhone3', 'crmThaiRelations1', 'crmThaiRelations2', 'crmThaiRelations3', 'crmTypepaymentService', 'csChannelAcquisition',
  'csCoBorrower', 'csDateTransOwnership', 'csDescriptionProperty', 'csDesiredLoanAmount', 'csIncomeType', 'csJobCoBorrower',
  'csLoanProperty', 'csLoanType', 'csMbRelationship', 'csPopularGatheringPlace', 'csPopularThaiRestauran', 'csThaiCoBorrower',
  'csThaiTempleFestival', 'csTranslate', 'csTwoMenWoIncome', 'csTypeProperty', 'csTypeService', 'csUsePantip',
  'csVip', 'csYearsLoan', 'cusAge', 'cusCoborrowerContactPersonInThai', 'cusCoborrowerContactPersonInThaiMobile', 'cusCoborrowerContactPersonInThaiRelate',
  'cusCoborrowerContactPersonInThaiTel', 'cusCode', 'cusComfortTimeCallback', 'cusContactPersonForeign', 'cusContactPersonForeignMobile', 'cusContactPersonForeignRelate',
  'cusContactPersonForeignTel', 'cusContactPersonInThai', 'cusContactPersonInThaiMobile', 'cusContactPersonInThaiRelate', 'cusContactPersonInThaiTel', 'cusCountry',
  'cusCreateby', 'cusCrmBigcompany', 'cusCrmBorrowerIdcardPassportNo', 'cusCrmBorrowerName', 'cusCrmBorrowerThaiPermanentAddress', 'cusCrmCoborrowerCountry',
  'cusCrmCoborrowerIdcardPassportNo', 'cusCrmCoborrowerMobile', 'cusCrmCoborrowerName', 'cusCrmCoborrowerRelate', 'cusCrmCoborrowerTel', 'cusCrmCoborrowerThaiPermanentAddress',
  'cusCrmCollateralAddress', 'cusCrmCollateralHaveResident', 'cusCrmCollateralMapSheetNumber', 'cusCrmCollateralNumberOfResident', 'cusCrmCollateralRemark', 'cusCrmCollateralResident1Mobile',
  'cusCrmCollateralResident1Name', 'cusCrmCollateralResident1Relate', 'cusCrmCollateralResident1Tel', 'cusCrmCollateralResident2Mobile', 'cusCrmCollateralResident2Name', 'cusCrmCollateralResident2Relate',
  'cusCrmCollateralResident2Tel', 'cusCrmCollateralTitleDeeds', 'cusCrmCollateralType', 'cusCrmCouponCode', 'cusCrmCrmCode', 'cusCrmOccupation',
  'cusCrmOtherEmail', 'cusCrmOtherTel1', 'cusCrmOtherTel1Remark', 'cusCrmOtherTel2', 'cusCrmOtherTel2Remark', 'cusCrmOtherTel3',
  'cusCrmOtherTel3Remark', 'cusCrmPaymentBank', 'cusCrmPaymentType', 'cusCrmPosition', 'cusCrmReferenceFamilyAddress', 'cusCrmReferenceFamilyEmail',
  'cusCrmReferenceFamilyMobile', 'cusCrmReferenceFamilyPerson', 'cusCrmReferenceFamilyRelate', 'cusCrmReferenceFamilyTel', 'cusCrmReferenceForeignAddress', 'cusCrmReferenceForeignEmail',
  'cusCrmReferenceForeignMobile', 'cusCrmReferenceForeignPerson', 'cusCrmReferenceForeignRelate', 'cusCrmReferenceForeignTel', 'cusCrmReferenceThaiAddress', 'cusCrmReferenceThaiEmail',
  'cusCrmReferenceThaiMobile', 'cusCrmReferenceThaiPerson', 'cusCrmReferenceThaiRelate', 'cusCrmReferenceThaiTel', 'cusCrmReferenceWorkplaceAddress', 'cusCrmReferenceWorkplaceEmail',
  'cusCrmReferenceWorkplaceMobile', 'cusCrmReferenceWorkplacePerson', 'cusCrmReferenceWorkplaceRelate', 'cusCrmReferenceWorkplaceTel', 'cusCrmWorkplaceAddress', 'cusCrmWorkplaceName',
  'cusCrmWorkplaceTel', 'cusCs', 'cusDataRemark', 'cusDocAttachDescription1', 'cusDocAttachDescription2', 'cusDocAttachDescription3',
  'cusDocAttachDescription4', 'cusDocAttachFile1', 'cusDocAttachFile2', 'cusDocAttachFile3', 'cusDocAttachFile4', 'cusDocAttachType1',
  'cusDocAttachType2', 'cusDocAttachType3', 'cusDocAttachType4', 'cusEducation', 'cusEmail', 'cusFacebook',
  'cusFax', 'cusForeignMailingAddress', 'cusForiegnPresentResidence', 'cusIssueLoanAmount', 'cusLineId', 'cusLoanAmountInform',
  'cusLoanHaveRelateForCoborrower', 'cusLoanInfomBy', 'cusLoanInformDate', 'cusLoanNeed', 'cusLoanRequireAmount', 'cusLoanRequireAmountAfterAnalyst',
  'cusLoanRequireYear', 'cusLoanResultFrom', 'cusLoanYearInform', 'cusMarriageType', 'cusMobile1', 'cusMobile2',
  'cusMobile3', 'cusName', 'cusNameFirstContact', 'cusNickname', 'cusProjectBuyFrom', 'cusProjectBuyName',
  'cusProjectSaleMobile', 'cusProjectSaleRemark', 'cusProjectSaleTel', 'cusPropertyContactTel', 'cusPropertyHaveAsset', 'cusPropertyHaveAssetStatus',
  'cusPropertyHaveDeed', 'cusPropertyHaveDescription', 'cusPropertyHaveDesign', 'cusPropertyHaveDistrict', 'cusPropertyHaveLandOwner', 'cusPropertyHaveMonth',
  'cusPropertyHavePlanTransfer', 'cusPropertyHavePrice', 'cusPropertyHaveProject', 'cusPropertyHaveProvince', 'cusPropertyHaveYear', 'cusPropertyInterestArea',
  'cusPropertyInterestBedroom', 'cusPropertyInterestCodecision', 'cusPropertyInterestContactRelate', 'cusPropertyInterestData', 'cusPropertyInterestDecision', 'cusPropertyInterestDescription',
  'cusPropertyInterestDistrict', 'cusPropertyInterestFactorChoose', 'cusPropertyInterestFinishMonth', 'cusPropertyInterestFinishYear', 'cusPropertyInterestHave', 'cusPropertyInterestLand',
  'cusPropertyInterestMaxDownAmount', 'cusPropertyInterestNearPlace', 'cusPropertyInterestNearPlace2', 'cusPropertyInterestNearPlace3', 'cusPropertyInterestNearPlaceObjective', 'cusPropertyInterestNearPlaceObjective2',
  'cusPropertyInterestNearPlaceObjective3', 'cusPropertyInterestNumberOfResident', 'cusPropertyInterestObjective', 'cusPropertyInterestPrice', 'cusPropertyInterestProject', 'cusPropertyInterestProjectContact',
  'cusPropertyInterestProjectPros', 'cusPropertyInterestProjectReason', 'cusPropertyInterestProvince', 'cusPropertyInterestRemark', 'cusPropertyInterestRequire', 'cusPropertyInterestReserveAmount',
  'cusPropertyInterestStatus', 'cusPropertyInterestToilet', 'cusPropertyInterestType', 'cusPropertyInterestVisit', 'cusPropertySummaryDate', 'cusPropertySummaryRemark',
  'cusPropertySummaryResult', 'cusPropertyTypeLoan', 'cusProvinceBirthplace', 'cusProvinceResidence', 'cusProvinceVocation', 'cusReceiveDocument',
  'cusResidentDocument', 'cusSaleCon', 'cusSaleSur', 'cusServiceType', 'cusSex', 'cusSources',
  'cusSpouseAge', 'cusSpouseEducation', 'cusSpouseOccupation', 'cusSpouseRace', 'cusSpouseRemark', 'cusStatus',
  'cusSurveyCoborrowerAge', 'cusSurveyCoborrowerEducation', 'cusSurveyCoborrowerMarriageType', 'cusSurveyCoborrowerName', 'cusSurveyCoborrowerQ11', 'cusSurveyCoborrowerQ12',
  'cusSurveyCoborrowerQ13', 'cusSurveyCoborrowerQ14', 'cusSurveyCoborrowerQ15', 'cusSurveyCoborrowerQ16', 'cusSurveyCoborrowerQ17', 'cusSurveyCoborrowerQ17_1',
  'cusSurveyCoborrowerQ18', 'cusSurveyCoborrowerQ19_1_1', 'cusSurveyCoborrowerQ19_1_2', 'cusSurveyCoborrowerQ19_1_3', 'cusSurveyCoborrowerQ19_1_4', 'cusSurveyCoborrowerQ19_1_5',
  'cusSurveyCoborrowerQ19_1_6', 'cusSurveyCoborrowerQ19_2_1', 'cusSurveyCoborrowerQ19_2_2', 'cusSurveyCoborrowerQ19_2_3', 'cusSurveyCoborrowerQ19_2_3_1', 'cusSurveyCoborrowerQ19_2_4',
  'cusSurveyCoborrowerQ19_2_5', 'cusSurveyCoborrowerQ19_2_5_1', 'cusSurveyCoborrowerQ19_2_6', 'cusSurveyCoborrowerQ19_2_7', 'cusSurveyCoborrowerQ19_2_8', 'cusSurveyCoborrowerRelate',
  'cusSurveyCoborrowerResidentDocument', 'cusSurveyCoborrowerSex', 'cusSurveyCoborrowerSpouseAge', 'cusSurveyCoborrowerSpouseEducation', 'cusSurveyCoborrowerSpouseOccupation', 'cusSurveyCoborrowerSpouseRace',
  'cusSurveyCoborrowerSpouseRemark', 'cusSurveyCoborrowerStatus', 'cusSurveyCoborrowerTel', 'cusSurveyHaveCoborrower', 'cusSurveyQ10_1', 'cusSurveyQ11',
  'cusSurveyQ12', 'cusSurveyQ13', 'cusSurveyQ14', 'cusSurveyQ15', 'cusSurveyQ16', 'cusSurveyQ17',
  'cusSurveyQ17_1', 'cusSurveyQ18', 'cusSurveyQ19_1_1', 'cusSurveyQ19_1_2', 'cusSurveyQ19_1_3', 'cusSurveyQ19_1_4',
  'cusSurveyQ19_1_5', 'cusSurveyQ19_1_6', 'cusSurveyQ19_2_1', 'cusSurveyQ19_2_2', 'cusSurveyQ19_2_3', 'cusSurveyQ19_2_3_1',
  'cusSurveyQ19_2_4', 'cusSurveyQ19_2_5', 'cusSurveyQ19_2_5_1', 'cusSurveyQ19_2_6', 'cusSurveyQ19_2_7', 'cusSurveyQ19_2_8',
  'cusTel1', 'cusTel2', 'cusTel3', 'docContactActualCallDate', 'docContactActualCallTime', 'docContactCancelToContact',
  'docContactDetail', 'docContactFirstContactDate', 'docContactInterestStatus', 'docContactLastContactDate', 'docContactLastStatus', 'docContactNextstep',
  'docContactPayFeeDate', 'docContactPreparationDate', 'docContactPreparationTime', 'docContactResearchDate', 'docContactStepcontact', 'docContactStepprocess',
  'docContactSuccessCall', 'docContactType', 'docContactTypeCall', 'downloadcusDocAttachFile1', 'downloadcusDocAttachFile2', 'downloadcusDocAttachFile3',
  'downloadcusDocAttachFile4', 'leApproveAmount2', 'leFirstPayment', 'leGuarantee', 'leGuaranteeAmount', 'leLoanAccountNo',
  'leLoanLimit', 'leOther', 'leOtherAmount', 'leOwnershipTransferDate', 'leSignContractThai', 'lsAppraisalCompanyPrice',
  'lsAppraisalNumber', 'lsAppraisalPrice', 'lsBankApprovalDate', 'lsBankStatus', 'lsConditionsLegalAct', 'lsCostEstimate',
  'lsCountry', 'lsDistrict', 'lsLoanAmount', 'lsLoanApproval', 'lsLoanPeriod', 'lsLoanType',
  'lsMarriedCouple', 'lsNumberCoBorrowers', 'lsOpenHouseNumber', 'lsPrice', 'lsProjectName', 'lsPropertyCondition',
  'lsProvince', 'lsPurchaseRelatives', 'lsRecEmailBankDate', 'lsRelationsRelative', 'lsSellerCompany', 'lsSellerContractNumber',
  'lsSellerDetail', 'lsSgJointLoan', 'lsStatusPropertyLoan', 'lsTransOwnership', 'lsTypeProperty', 'mbAge',
  'mbAgeMt60', 'mbBaOwnNameLeast6m', 'mbBaOwnnameLeast12m', 'mbBusinessType', 'mbCareer', 'mbCompany',
  'mbCompanyBaLeast12m', 'mbCompanyPayTax', 'mbEducation', 'mbEmpRetireMoney', 'mbForeignResidenceDocs', 'mbGender',
  'mbHouseholdExpenses', 'mbIncome', 'mbIncomeStm', 'mbMaritalStatus', 'mbMarriedNational', 'mbOperationLeast2y',
  'mbOwnNamePayTax', 'mbOwnerFreelance', 'mbOwnerRetireMoney', 'mbPaySlipLeast6m', 'mbPayTax', 'mbPersonalExpenses',
  'mbPhotoCompany', 'mbPresentPosition', 'mbPresentYearsWork', 'mbRegTradeOwnName', 'mbRetireReceiveDocs', 'mbSalaryCerti',
  'mbSalaryTransferBa', 'mbSpouseAge', 'mbSpouseCareer', 'mbSpouseEducation', 'mbSpouseRemark', 'mbTypeMarriedRegis',
  'name', 'plsApprovalDate', 'plsJobCoBorrower', 'plsLoanApproval', 'plsLoanPeriod', 'plsRecEmailBankDate',
  'plsResultCustomer', 'plsStatus', 'plsThaiCoBorrower', 'plsTransfer', 'plsTwoWoIncome', 'plsTxNo',
  'plsTypeIncome', 'plsUrgency', 'plsVip', 'prospectcode', 'prospectid', 'prospectname',
  'researcher', 'roleOwner', 'slaCs01PlsDate', 'slaFi0101Invoice', 'slaFi0102Receive', 'slaLe01Oversea',
  'slaLs0101ExportParcels', 'slaLs0102ToBank', 'slaLs02Bank', 'slaPls01Kpi', 'slaPls02Kpi', 'slaPls03ToBank',
  'txDate', 'usageStatus',
];

/**
 * the key of the request DTO (left) that the response / the form spells another way (right): when the left one is not in the source the
 * right one is read (the address for the documents: GET answers `senddocAddress` …)
 */
const GET_KEY_FALLBACK: Readonly<Record<string, string>> = {
  sendDocAddress: 'senddocAddress',
  sendDocPostId: 'senddocPostId',
  sendDocDistrictId: 'senddocDistrictId',
  sendDocDistrictCode: 'senddocDistrictCode',
  sendDocDistrictName: 'senddocDistrictName',
  sendDocSubDistrictId: 'senddocSubDistrictId',
  sendDocSubDistrictCode: 'senddocSubDistrictCode',
  sendDocSubDistrictName: 'senddocSubDistrictName',
};

/** the keys that lose their time before they are sent (the backend takes a date-time but answers 400 when it gets its own value back) */
const DATE_KEYS: ReadonlySet<string> = new Set(['contactDate', 'convenientTime', 'birthdate']);

/**
 * `mainBody(source, id)`: the body of `POST /prospects` / `PUT /prospects/{id}` from a whole prospect (the answer of GET, or the form
 * merged into it): only the keys of the DTO, the document-address keys read under their other spelling, `yyyy-MM-ddT…` cut to the date, the
 * `id`, the file addresses relative, a juristic customer with a tax branch. The source is not changed.
 */
export function mainBody(source: JObj | null, id: number | string | null): JObj {
  const clean: JObj = {};
  if (!source) return clean;
  for (const key of MAIN_KEYS) {
    let val: unknown;
    if (hasVal(source, key)) val = source[key];
    else {
      const alt = Object.hasOwn(GET_KEY_FALLBACK, key) ? GET_KEY_FALLBACK[key] : undefined;
      if (alt !== undefined && hasVal(source, alt)) val = source[alt];
    }
    if (val === undefined) continue;
    if (DATE_KEYS.has(key) && typeof val === 'string' && val.length >= 10 && val.indexOf('T') === 10) val = val.substring(0, 10);
    clean[key] = val;
  }
  if (id != null) clean['id'] = id;
  toRelativeIn(clean, 'attachFile', 'downloadAttachFile');
  ensureTaxBranchForJuristic(clean);
  return clean;
}

/** `hasAnyValue`: at least one key whose value is not null and, for a text, not blank */
export function hasAnyValue(obj: JObj | null): boolean {
  if (!obj) return false;
  for (const k of Object.keys(obj)) {
    const v = obj[k];
    if (v === null) continue;
    if (typeof v === 'string') {
      if (jtrim(v) !== '') return true;
    } else return true;
  }
  return false;
}

/** `filterExtraInfoKeys`: only the keys of SunProspectInfoDTO, and only those that have a value (partial is fine) */
function filterExtraInfoKeys(src: JObj | null): JObj {
  const out: JObj = {};
  if (!src) return out;
  for (const key of EXTRA_INFO_KEYS) if (hasVal(src, key)) out[key] = src[key];
  return out;
}

/** `normalizeSatisfaction`: every key of SatisfactionDTO, as text ('' where the source has none) — the service answers 500 when one is missing or null */
function normalizeSatisfaction(src: JObj | null): JObj {
  const out: JObj = {};
  for (const key of SATISFACTION_KEYS) out[key] = src && has(src, key) ? optString(src, key, '') : '';
  return out;
}

/** `extraInfoBody`: the body of `PUT /prospects/{id}/extra-info` — only the parts that carry data; null when there is nothing to send */
export function extraInfoBody(sunProspectInfo: JObj | null, satisfaction: JObj | null): JObj | null {
  const filteredSun = filterExtraInfoKeys(sunProspectInfo);
  const hasSun = hasAnyValue(filteredSun);
  const hasSatisfaction = hasAnyValue(satisfaction);
  if (!hasSun && !hasSatisfaction) return null;
  const body: JObj = {};
  if (hasSun) body['sunProspectInfo'] = filteredSun;
  if (hasSatisfaction) body['satisfaction'] = normalizeSatisfaction(satisfaction);
  return body;
}

/** `JSONObject.optJSONObject(key)`: the value when it is an object, else null */
export const optObject = (o: JObj | null, key: string): JObj | null => {
  const v = o?.[key];
  return isObj(v) ? v : null;
};
