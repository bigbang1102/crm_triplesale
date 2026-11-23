/**
 * `ContractView` as the prospect form (`contracts_master_data.xhtml`) uses it — the JSF bean of the page, written once for both uses: the
 * Angular host holds one, and the comparison harness runs the same class as "the server" of the Java replica (a JSF page keeps its state on the
 * server; here it is this class).
 *
 * THE INTERFACE FOR THE HOST (the generated template reads `bean.<name>`, the replica evaluates `#{contractView.<name>}` against this object)
 *
 *   state the page binds to        action_type · contractid · page_mode_status · contractBean (the snake_case fields of `ContractBean`) ·
 *                                  listCountryBean · listProvinceBean · listDistrictBean · listSubDistrictBean · listDistrict2Bean ·
 *                                  listSubDistrict2Bean · listBusinessTypeBean · listOccupationBean · listMarketingChanelBean ·
 *                                  listConvenientTimeBean · prospectDocs · lastApiError
 *   getters of the EL              telDisplay · phoneFormatJson · listPhoneCodeBean
 *   functions of the EL            telWithCode(raw) · formatTel(raw) · avatarSrc(raw)
 *   ajax listeners (all async —    changeUpdate() · onTelChange() · onCountryChange() · onCurrentProvinceChange() · onCurrentDistrictChange() ·
 *   `await` them, then render)     onCurrentSubDistrictChange() · onSendDocProvinceChange() · onSendDocDistrictChange() ·
 *                                  onSendDocSubDistrictChange() · copyAddress() · textAlert(type) · saveProspectAndLead() ·
 *                                  uploadProspectImage() · loadProspectDocs() · deleteProspectDocument()
 *   a posted value                 assign(el, value, kind) — what "apply request values" does for one input: `el` is the EL text of the
 *                                  component's value (`#{contractView.contractBean.tel}`), kind = text | int | date | select | radio
 *                                  (a `date` is the `dd/MM/yyyy` text the picker posts)
 *   the request                    `request` is the request parameter map of the current JSF request (what `PF.ab(… args)` / a
 *                                  remote command sent: imgB64 · imgName · docNo · movementTypeId · procedureGroupId · assignToId · employeeId ·
 *                                  confirmMerge) — set it before calling a listener
 *   what a listener answers with   `scripts`: the JavaScript `PrimeFaces.current().executeScript(…)` queued — run them in order after the
 *                                  response (`takeScripts()`); the ones that move the browser (`window.location.href = '<ctx>/pages/X.face?…'`)
 *                                  must go through `javaLinkToRoute`
 *   the HTTP session               `session` (`ss_tel`, `ss_page_mode_status`, the snapshot of the detail `ss_contact_detail_original_json`):
 *                                  one object for the whole browser session, like the Java session — see `prospectSession`
 *
 * Differences from Java, on purpose:
 *   - `getPhoneFormatJson()` / `getListPhoneCodeBean()` / `phoneCodeOfCountry()` load the countries LAZILY in Java (at render, when the list is
 *     empty); here `init()` and the listeners that need them call `ensureCountries()` first, so a failed country call is retried by the next
 *     listener, not by every render;
 *   - the database steps are not ported (SunProspectInfoBoDao: `sunInfoMap` is empty, `ensureSunRecord` is skipped) — see the service;
 *   - `ProspectListService.invalidateDetail` (a cache) has nothing to invalidate; `appendLocalSavedContract` (a copy kept in the session after a
 *     failed create) is not kept: the bean still holds what the user typed.
 *
 * Framework-free: no Angular, no `enum`, no parameter properties. A change is announced with `onChange` (the host marks its view).
 */
import { type JObj, isObj, optString, parseJson } from '@core/live/org-json';
import { jtrim, mainBody, toRelative } from '@core/live/prospect-payload.live';
import { resolveStoredUrl } from '@core/mockup/mockup-uploads';
import type { ProspectDoc } from '../prospects.docs';
import {
  type CreateContext,
  type FormLists,
  SCRIPTS,
  apiErrorText,
  apiResponseOk,
  avatarSrc as avatarSrcOf,
  buildCreateBody,
  buildLeadBody,
  assignmentOf,
  buildCreateV2Body,
  buildUpdateBody,
  duplicateCheckBody,
  duplicateRefusal,
  duplicateStopText,
  parseDuplicateVerdict,
  type DuplicatePurpose,
  countryIdIn,
  digitsOnly,
  extraInfoOfForm,
  extraInfoOfSun,
  extractProspectId,
  formatTel,
  idOrZero,
  leadIdOfProspect,
  leadParamOr,
  listPhoneCode,
  metroZipOfSubDistrict,
  movementTypeUsesWorkflowStep,
  parseApiStatus,
  phoneCodeOfCountry,
  phoneFormatJson,
  resolveCountryIdIn,
  sanitizePhoneFields,
  telWithCode,
  trimGeoCodes,
} from './prospect-form.logic';
import { ProspectFormService } from './prospect-form.service';
import { type BasicBean, type ContractBean, type ProspectFormUser, newContractBean } from './prospect-form-types';

/** the HTTP session attributes this page reads and writes (Java: `getSession` / `addSession` / `removeSession`) */
export class ProspectSession {
  /** `ss_tel`: the digits of the main phone as `changeUpdate` last saw them — `textAlert` / `saveProspectAndLead` put it back in the bean when it is not empty */
  ss_tel: string | undefined = undefined;
  /** `ss_page_mode_status` */
  ss_page_mode_status: string | undefined = undefined;
  /** `ss_contact_detail_original_json`: the `result` of the detail the page was opened with — the base of the PUT body */
  contactDetailOriginalJson: string | undefined = undefined;
  /** `ss_contractBean` */
  contractBean: ContractBean | undefined = undefined;
}

/** the session of this browser (a module-level instance, like the Java session attribute) */
export const prospectSession = new ProspectSession();

export interface ProspectFormOptions {
  /** the signed-in employee (`ssoemp_id` / `ssoemp_code` / `ssoemp_name`): the sale person of a NEW customer */
  user?: ProspectFormUser;
  /** `yyyy-MM-dd` of today (the clock stays outside: the harness gives a fixed day) */
  today?: () => string;
  /** `getRequestContextPath()` — the prefix of the addresses in the scripts (`/triplesale`) */
  ctxPath?: string;
  /** the address of a file for an `<img>`: Java sends an absolute address through `<ctx>/docproxy?url=` (the live build has no such servlet: identity) */
  docProxy?: (absoluteUrl: string) => string;
  session?: ProspectSession;
  onChange?: () => void;
  /** `triplesale.api.prospect_send_employee_id` (default off: the service answers 500 when it finds the employee) */
  sendProspectEmployeeId?: boolean;
  /** `triplesale.api.prospect_creates_lead` (default on: `POST /prospects` creates the lead itself) */
  prospectCreatesLead?: boolean;
  /**
   * Whether the view / edit modes read the master lists (countries, provinces, districts, marketing channels) to put a name to an id. Default
   * true (Java). The detail page turns it off: `GET /api/v1/prospects/{id}` carries the names itself, and the old `/master-data/…` lists
   * (countries, provinces, marketing-channels) are gone from the service (404).
   */
  masterLists?: boolean;
}

/** the request parameters `init()` reads (Java: `getRequestParameterMap()`) */
export interface ProspectFormParams {
  action_type?: string | null;
  id?: string | null;
  pms?: string | null;
  /** the legacy `pid` / `page_id` of the menu link: the Angular route has neither, so they default to the values of this page (1 / 1) */
  pid?: string | null;
  page_id?: string | null;
}

const BEAN_PATH = /^#\{contractView\.contractBean\.([A-Za-z_0-9]+)\}$/;
const NUMERIC_FIELDS: ReadonlySet<string> = new Set(['age']);

/** `dd/MM/yyyy` (what the picker posts) → `yyyy-MM-dd`; '' / unreadable → null */
export function parseViewDate(v: string): string | null {
  const m = /^\s*(\d{1,2})\/(\d{1,2})\/(\d{1,4})\s*$/.exec(v);
  if (!m) return null;
  const d = new Date(Date.UTC(Number(m[3]), Number(m[2]) - 1, Number(m[1])));
  if (Number.isNaN(d.getTime())) return null;
  const p = (n: number, w: number): string => String(n).padStart(w, '0');
  return `${p(d.getUTCFullYear(), 4)}-${p(d.getUTCMonth() + 1, 2)}-${p(d.getUTCDate(), 2)}`;
}

export class ProspectFormView {
  private readonly svc: ProspectFormService;
  private readonly opts: ProspectFormOptions;
  private readonly onChange: () => void;
  readonly session: ProspectSession;

  action_type = 'list';
  contractid = '';
  page_mode_status = 'detail';
  pid_var = '';
  page_id = '';
  contractBean: ContractBean;

  listCountryBean: BasicBean[] = [];
  listProvinceBean: BasicBean[] = [];
  listDistrictBean: BasicBean[] = [];
  listSubDistrictBean: BasicBean[] = [];
  listDistrict2Bean: BasicBean[] = [];
  listSubDistrict2Bean: BasicBean[] = [];
  listBusinessTypeBean: BasicBean[] = [];
  listOccupationBean: BasicBean[] = [];
  listMarketingChanelBean: BasicBean[] = [];
  listConvenientTimeBean: BasicBean[] = [];
  prospectDocs: ProspectDoc[] = [];

  /** the request parameter map of the current request (see the header) */
  request: Record<string, string> = {};
  /** the scripts queued by `PrimeFaces.current().executeScript` (see `takeScripts`) */
  scripts: string[] = [];
  lastApiError = '';
  lastApiStatus = 0;

  private pendingImgB64: string | null = null;
  private pendingImgName: string | null = null;
  /** `resolveCountryId` of the body being made: warmed by `warmCountryIds` (Java reloads the country list in the middle of the method) */
  private countryIds = new Map<string, number>();

  constructor(svc: ProspectFormService, opts: ProspectFormOptions = {}) {
    this.svc = svc;
    this.opts = opts;
    this.onChange = opts.onChange ?? ((): void => undefined);
    this.session = opts.session ?? prospectSession;
    this.contractBean = newContractBean(this.today());
  }

  private today(): string {
    return this.opts.today ? this.opts.today() : '1970-01-01';
  }
  private get ctx(): string {
    return this.opts.ctxPath ?? '/triplesale';
  }
  private executeScript(js: string): void {
    this.scripts.push(js);
  }
  /** the queued scripts, once */
  takeScripts(): string[] {
    const s = this.scripts;
    this.scripts = [];
    return s;
  }

  /* ================================================================================================ init */
  /** `@PostConstruct init()` of the form page (add · view · edit; the list mode of the shared bean has nothing to load here) */
  async init(p: ProspectFormParams = {}): Promise<void> {
    const today = this.today();
    this.contractBean = newContractBean(today);
    this.page_mode_status = p.pms != null ? p.pms : 'detail';
    if (this.session.ss_page_mode_status != null) this.page_mode_status = this.session.ss_page_mode_status;
    this.action_type = p.action_type != null ? p.action_type : 'list';
    this.contractid = '';
    if (this.action_type !== 'list' && p.id != null) this.contractid = p.id;
    this.pid_var = p.pid != null ? p.pid : '1';
    this.page_id = p.page_id != null ? p.page_id : '1';

    // (the same bean serves other pages — promotion*.xhtml — whose lists are not this page's: out of scope here)
    const isContractsPage = this.pid_var === '1' && ['1', '2', '3'].includes(this.page_id);
    if (isContractsPage) {
      if (this.action_type === 'add') {
        this.contractBean.customer_code = await this.api_genJobNumber_Prospectcode();
        // the user must choose the type of customer (a banner asks until then)
        this.contractBean.customer_type = '';
        this.contractBean.usagestatus = 'new';
        const u = this.opts.user;
        if (u && u.id > 0) {
          this.contractBean.salepersonid = u.id;
          this.contractBean.salepersoncode = u.code;
          this.contractBean.salepersonname = u.name;
        } else {
          this.contractBean.salepersonid = 0; // DEFAULT_SALE_PERSON_ID
          this.contractBean.salepersoncode = '';
          this.contractBean.salepersonname = '';
        }
        this.contractBean.date_save = today;
        this.listCountryBean = await this.svc.countries();
        this.contractBean.country = 'THA';
        this.contractBean.phone_country_code = await this.phoneCodeOf('THA', '+66');
        await this.loadEditLists();
      } else if (this.action_type === 'edit') {
        if (this.contractid !== '') await this.view_Query_Data_Detail_API(this.contractid);
        this.listCountryBean = await this.svc.countries();
        await this.loadEditLists();
      } else if (this.action_type === 'view') {
        if (this.contractid !== '') await this.view_Query_Data_Detail_API(this.contractid);
      }
    }
    const lists = this.opts.masterLists !== false;
    if (isContractsPage && this.action_type === 'view' && lists) {
      // view mode shows the chosen values of these three; the branch above does not load them
      this.listMarketingChanelBean = await this.svc.marketingChannels();
      await this.api_province_list();
      await this.api_district_list();
    }
    if (this.action_type === 'view' || this.action_type === 'edit') {
      // loadCsFromSunInfo(): sunInfoMap is the database read that is not ported — nothing to copy
      await this.loadProspectDocs();
      if (lists) {
        await this.refreshSendDocGeoLists();
        await this.resolveMasterNamesFromIds();
        await this.ensureCountryDefault();
      }
    }
    this.onChange();
  }

  /** the lists of the add and edit modes (after the country list): provinces → districts → sub-districts, business types, occupations, channels, contact types */
  private async loadEditLists(): Promise<void> {
    await this.api_province_list();
    await this.api_district_list();
    await this.api_sub_district_list();
    this.listBusinessTypeBean = await this.svc.businessTypes();
    this.listOccupationBean = await this.svc.occupations();
    this.listMarketingChanelBean = await this.svc.marketingChannels();
    this.listConvenientTimeBean = await this.svc.communicationTypes();
  }

  /** `api_genJobNumber_Prospectcode()`: the code is made by the service on save — the field starts empty */
  async api_genJobNumber_Prospectcode(): Promise<string> {
    return '';
  }

  /* ---- master data (the `api_*_list()` loaders keep their result in the field, like Java) */
  async api_province_list(): Promise<BasicBean[]> {
    this.listProvinceBean = await this.svc.provinces(this.contractBean.current_city_code, this.contractBean.senddoc_city_code);
    return this.listProvinceBean;
  }
  async api_district_list(): Promise<BasicBean[]> {
    this.listDistrictBean = await this.svc.districtsOf(this.contractBean.current_city_code, this.listProvinceBean);
    return this.listDistrictBean;
  }
  async api_sub_district_list(): Promise<BasicBean[]> {
    this.listSubDistrictBean = await this.svc.subDistrictsOf(this.contractBean.current_district_code, this.listDistrictBean);
    return this.listSubDistrictBean;
  }
  /** `refreshSendDocGeoLists()` */
  async refreshSendDocGeoLists(): Promise<void> {
    this.listDistrict2Bean = await this.svc.districtsOf(this.contractBean.senddoc_city_code, this.listProvinceBean);
    this.listSubDistrict2Bean = await this.svc.subDistrictsOf(this.contractBean.senddoc_district_code, this.listDistrict2Bean);
  }
  /** the countries, loaded when there are none (Java does this inside the getters) */
  async ensureCountries(): Promise<void> {
    if (this.opts.masterLists === false) return;
    if (this.listCountryBean.length === 0) this.listCountryBean = await this.svc.countries();
  }
  private async phoneCodeOf(countryCode: string | null | undefined, fallback: string): Promise<string> {
    await this.ensureCountries();
    return phoneCodeOfCountry(this.listCountryBean, countryCode, fallback);
  }

  /* ---- the detail */
  /** `view_Query_Data_Detail_API(id)`: the bean of the customer; the snapshot of the answer is kept for the update */
  async view_Query_Data_Detail_API(id: string): Promise<void> {
    const loaded = await this.svc.detail(id, this.today());
    if (loaded) {
      this.contractBean = loaded.contract;
      this.session.contractBean = loaded.contract;
      this.session.contactDetailOriginalJson = loaded.snapshot;
    }
    await this.trimGeoCodesOnBean();
  }

  /** `trimGeoCodesOnBean()`: the codes of the address trimmed; a record with no phone code gets the one of its country, else +66 */
  private async trimGeoCodesOnBean(): Promise<void> {
    const c = this.contractBean;
    trimGeoCodes(c);
    if (c.phone_country_code == null || jtrim(c.phone_country_code) === '') {
      const byCountry = await this.phoneCodeOf(c.country, '');
      c.phone_country_code = byCountry === '' ? await this.phoneCodeOf('THA', '+66') : byCountry;
    }
  }

  /** `resolveMasterNamesFromIds()`: a detail that has only the id of a channel / country gets its code and name from the lists */
  private async resolveMasterNamesFromIds(): Promise<void> {
    const c = this.contractBean;
    const mcName = c.marketingchanelname;
    const mcId = c.marketingchanelid;
    if ((mcName == null || jtrim(mcName) === '') && mcId != null && mcId !== 0) {
      const mc = this.listMarketingChanelBean.find((b) => idOrZero(b) === mcId);
      if (mc) {
        c.marketingchanelcode = mc.code;
        c.marketingchanelname = mc.name;
      }
    }
    const ctry = c.country;
    const ctryId = c.country_id;
    if ((ctry == null || jtrim(ctry) === '') && ctryId != null && ctryId !== 0) {
      await this.ensureCountries();
      const cb = this.listCountryBean.find((b) => idOrZero(b) === ctryId);
      if (cb) {
        c.country = cb.code;
        c.country_name = cb.nameTh != null && jtrim(cb.nameTh) !== '' ? cb.nameTh : cb.name;
      }
    }
  }

  /** `ensureCountryDefault()`: a record whose country is empty or not in the list is Thailand */
  private async ensureCountryDefault(): Promise<void> {
    const c = this.contractBean;
    await this.ensureCountries();
    const ctry = c.country;
    const valid = ctry != null && jtrim(ctry) !== '' && this.listCountryBean.some((b) => ctry === b.code);
    if (!valid) {
      c.country = 'THA';
      const tha = this.listCountryBean.find((b) => b.code === 'THA');
      c.country_name = tha ? (tha.nameTh != null && jtrim(tha.nameTh) !== '' ? tha.nameTh : tha.name) : 'ไทย';
      if (c.phone_country_code == null || jtrim(c.phone_country_code) === '') c.phone_country_code = phoneCodeOfCountry(this.listCountryBean, 'THA', '+66');
    }
  }

  /* ================================================================================================ the EL of the page */
  get telDisplay(): string {
    return this.formatTel(this.contractBean.tel);
  }
  get phoneFormatJson(): string {
    return phoneFormatJson(this.listCountryBean);
  }
  get listPhoneCodeBean(): BasicBean[] {
    return listPhoneCode(this.listCountryBean);
  }
  formatTel(raw: string | null | undefined): string {
    return formatTel(raw, this.contractBean.phone_country_code, this.phoneFormatJson);
  }
  telWithCode(raw: string | null | undefined): string {
    return telWithCode(raw, this.contractBean.phone_country_code, this.phoneFormatJson);
  }
  avatarSrc(raw: string | null | undefined): string {
    // a picture the user chose in the mockup is in Storage/: it is shown from the file server (the address of the service would not be served)
    return resolveStoredUrl(avatarSrcOf(raw, this.opts.docProxy ?? ((url) => `${this.ctx}/docproxy?url=${new URLSearchParams({ k: url }).toString().slice(2)}`)));
  }

  /* ================================================================================================ a posted value */
  /**
   * What "apply request values" does for one input: lays the posted value into the bean. `el` is the EL of the value
   * (`#{contractView.contractBean.tel}`); kind: text · int · date · select · radio.
   */
  assign(el: string, value: string | boolean, kind: string): void {
    const m = BEAN_PATH.exec(el.trim());
    if (!m) throw new Error(`cannot assign ${el}`);
    const field = m[1];
    const c = this.contractBean as unknown as Record<string, unknown>;
    if (!(field in c)) throw new Error(`cannot assign ${el}`);
    const text = typeof value === 'boolean' ? String(value) : value;
    if (kind === 'date') c[field] = parseViewDate(text);
    else if (kind === 'int' || NUMERIC_FIELDS.has(field)) {
      // Integer converter: empty = null, anything else that is not a whole number fails validation (the field keeps its value)
      if (text.trim() === '') c[field] = null;
      else if (/^[+-]?\d+$/.test(text.trim())) c[field] = Number(text.trim());
    } else c[field] = text;
  }

  /* ================================================================================================ ajax listeners */
  /** `changeUpdate()`: the listener every input shares — the phone numbers come back as digits, and the main phone is kept in the session */
  changeUpdate(): void {
    sanitizePhoneFields(this.contractBean);
    this.session.ss_tel = digitsOnly(this.contractBean.tel);
    this.onChange();
  }

  /** `onTelChange()` */
  onTelChange(): void {
    const raw = this.contractBean.tel;
    if (raw != null) {
      const digits = raw.replace(/[^0-9]/g, '');
      if (digits !== raw) this.contractBean.tel = digits;
    }
    this.changeUpdate();
  }

  /** `onCountryChange()`: the phone code follows the country */
  async onCountryChange(): Promise<void> {
    const countryCode = this.contractBean.country;
    const phoneCode = countryCode == null || jtrim(countryCode) === '' ? '' : await this.phoneCodeOf(jtrim(countryCode), '');
    this.contractBean.phone_country_code = phoneCode;
    this.changeUpdate();
  }

  async onCurrentProvinceChange(): Promise<void> {
    const c = this.contractBean;
    this.listDistrictBean = await this.svc.districtsOf(c.current_city_code, this.listProvinceBean);
    c.current_district_code = '';
    c.current_district_name = '';
    c.current_sub_district_code = '';
    c.current_sub_district_name = '';
    c.current_postid = '';
    this.listSubDistrictBean = [];
    this.onChange();
  }
  async onCurrentDistrictChange(): Promise<void> {
    const c = this.contractBean;
    this.listSubDistrictBean = await this.svc.subDistrictsOf(c.current_district_code, this.listDistrictBean);
    c.current_sub_district_code = '';
    c.current_sub_district_name = '';
    c.current_postid = '';
    this.onChange();
  }
  /** the post code of the chosen sub-district, from the metro file (only the six metropolitan provinces have one) */
  async onCurrentSubDistrictChange(): Promise<void> {
    const zip = metroZipOfSubDistrict(await this.svc.metroRows(), this.contractBean.current_sub_district_code);
    if (zip !== '') this.contractBean.current_postid = zip;
    this.onChange();
  }
  async onSendDocProvinceChange(): Promise<void> {
    const c = this.contractBean;
    this.listDistrict2Bean = await this.svc.districtsOf(c.senddoc_city_code, this.listProvinceBean);
    c.senddoc_district_code = '';
    c.senddoc_district_name = '';
    c.senddoc_sub_district_code = '';
    c.senddoc_sub_district_name = '';
    c.senddoc_postid = '';
    this.listSubDistrict2Bean = [];
    this.onChange();
  }
  async onSendDocDistrictChange(): Promise<void> {
    const c = this.contractBean;
    this.listSubDistrict2Bean = await this.svc.subDistrictsOf(c.senddoc_district_code, this.listDistrict2Bean);
    c.senddoc_sub_district_code = '';
    c.senddoc_sub_district_name = '';
    c.senddoc_postid = '';
    this.onChange();
  }
  async onSendDocSubDistrictChange(): Promise<void> {
    const zip = metroZipOfSubDistrict(await this.svc.metroRows(), this.contractBean.senddoc_sub_district_code);
    if (zip !== '') this.contractBean.senddoc_postid = zip;
    this.onChange();
  }

  /** `copyAddress()`: the document address becomes a copy of the current one (and its district lists are read again) */
  async copyAddress(): Promise<void> {
    const c = this.contractBean;
    c.senddoc_address = c.current_address;
    c.senddoc_country_code = c.current_country_code;
    c.senddoc_country_name = c.current_country_name;
    c.senddoc_city = c.current_city;
    c.senddoc_city_code = c.current_city_code;
    c.senddoc_city_name = c.current_city_name;
    c.senddoc_district = c.current_district;
    c.senddoc_district_code = c.current_district_code;
    c.senddoc_sub_district_code = c.current_sub_district_code;
    c.senddoc_district_name = c.current_district_name;
    c.senddoc_sub_district_name = c.current_sub_district_name;
    c.senddoc_postid = c.current_postid;
    await this.refreshSendDocGeoLists();
    this.onChange();
  }

  /* ================================================================================================ save */
  /** `lists` for the bodies */
  private lists(): FormLists {
    return {
      country: this.listCountryBean,
      province: this.listProvinceBean,
      district: this.listDistrictBean,
      subDistrict: this.listSubDistrictBean,
      district2: this.listDistrict2Bean,
      subDistrict2: this.listSubDistrict2Bean,
      businessType: this.listBusinessTypeBean,
      occupation: this.listOccupationBean,
      marketingChanel: this.listMarketingChanelBean,
      convenientTime: this.listConvenientTimeBean,
    };
  }

  /** `resolveCountryId(code)`: the id of a country code; reloads the country list once when the code is not in it */
  private async resolveCountryIdAsync(code: string | null | undefined): Promise<number> {
    if (code == null || jtrim(code) === '' || code === 'N/A') return 0;
    const want = jtrim(code);
    let id = countryIdIn(this.listCountryBean, want);
    if (id > 0) return id;
    const fresh = await this.svc.countries();
    if (fresh.length > 0) {
      this.listCountryBean = fresh;
      id = countryIdIn(fresh, want);
      if (id > 0) return id;
    }
    return 0;
  }
  private async warmCountryIds(codes: Array<string | null | undefined>): Promise<void> {
    this.countryIds = new Map();
    for (const code of codes) this.countryIds.set(code ?? '', await this.resolveCountryIdAsync(code));
  }
  private resolveCountryId = (code: string | null | undefined): number => this.countryIds.get(code ?? '') ?? resolveCountryIdIn(this.listCountryBean, code);

  /** `textAlert(type)`: C = cancel · U = update · P = create · L = create + lead · L2 = lead of a customer already saved */
  async textAlert(type: string): Promise<void> {
    const c = this.contractBean;
    const ssTel = this.session.ss_tel;
    if (ssTel != null && ssTel !== '') c.tel = ssTel;
    const name = c.customer_name != null ? jtrim(c.customer_name) : '';
    if (type === 'C') return;

    if (type === 'U') {
      if (c.id == null || c.id === 0) {
        this.executeScript(SCRIPTS.noId);
        return;
      }
      if (name === '') {
        this.executeScript(SCRIPTS.needName);
        return;
      }
      if (!(await this.duplicateOk('EDIT'))) return;
      const ok = await this.update_prospect_query_Data_API();
      this.executeScript(ok ? SCRIPTS.updated(this.ctx) : SCRIPTS.updateFailed(this.lastApiError));
      this.onChange();
      return;
    }
    if (name === '') {
      this.executeScript(SCRIPTS.needName);
      return;
    }
    // the check before a create is saved (the lead of "L2" is made for a customer that is saved already: no check)
    if ((type === 'P' || type === 'L') && !(await this.duplicateOk('RELEASE'))) return;
    if (type === 'P') {
      const ok = await this.save_prospect_query_Data_API();
      this.executeScript(ok ? SCRIPTS.created(this.ctx) : SCRIPTS.createFailed(this.lastApiError));
    } else if (type === 'L') {
      const okP = await this.save_prospect_query_Data_API();
      if (!okP) {
        this.executeScript(SCRIPTS.createFailed(this.lastApiError));
        this.onChange();
        return;
      }
      // POST /prospects creates the lead itself: a second POST /leads would make two
      const okL = this.opts.prospectCreatesLead !== false ? true : await this.save_lead_query_Data_API();
      if (okL) {
        await this.assignOwnerToCreatedLead(c.id);
        this.executeScript(SCRIPTS.createdWithLead(this.ctx));
      } else {
        this.executeScript(SCRIPTS.leadFailedAfterCreate(this.lastApiError));
      }
    } else if (type === 'L2') {
      // best effort: the success dialog opens whether or not the lead was created
      await this.save_lead_query_Data_API();
      this.executeScript(SCRIPTS.openCreateLeadSuccess);
    }
    this.onChange();
  }

  /** `saveProspectAndLead()`: the custom modal "บันทึกและสร้าง Lead" (the page closes the modal and moves on by itself: `ctOnLeadSaved`) */
  async saveProspectAndLead(): Promise<void> {
    const c = this.contractBean;
    const ssTel = this.session.ss_tel;
    if (ssTel != null && ssTel !== '') c.tel = ssTel;
    const name = c.customer_name != null ? jtrim(c.customer_name) : '';
    if (name === '') {
      this.executeScript(SCRIPTS.needName);
      return;
    }
    // a product with workflow steps needs a step group (the page asks too; a late answer of an earlier product may have changed it)
    if (leadParamOr(this.request, 'procedureGroupId', 0) <= 0 && (await this.movementTypeUsesWorkflowStepAsync(leadParamOr(this.request, 'movementTypeId', 0)))) {
      this.executeScript(SCRIPTS.needStepGroup);
      return;
    }
    // a merge the user has confirmed (`confirmMerge`) is not checked again
    const confirmed = this.request['confirmMerge'] != null && this.request['confirmMerge'] !== 'false';
    // the check was made at the button with this very data: not again (used once)
    const already = this.duplicateCleared !== null && this.duplicateCleared === JSON.stringify(duplicateCheckBody(c, 'RELEASE', null));
    this.duplicateCleared = null;
    if (!confirmed && !already && !(await this.duplicateOk('RELEASE'))) return;
    const okP = await this.save_prospect_query_Data_API();
    if (!okP) {
      if (this.lastApiStatus === 409) {
        this.executeScript(SCRIPTS.mergeConfirm(this.lastApiError));
        return;
      }
      this.executeScript(SCRIPTS.createFailed(this.lastApiError));
      return;
    }
    const okL = this.opts.prospectCreatesLead !== false ? true : await this.save_lead_query_Data_API();
    if (!okL) this.executeScript(SCRIPTS.leadWarn(this.lastApiError));
    if (okL) await this.assignOwnerToCreatedLead(c.id);
    this.executeScript(SCRIPTS.leadSaved);
    this.onChange();
  }

  /**
   * `POST /prospects/duplicate-checks` before a save: true = go on. A verdict that stops the save (blocked, hidden, strong) is shown and the save does
   * not happen; none / weak, an error, no answer: go on (the service checks again when it saves, so a failed check never loses the user's work).
   */
  /**
   * The "save" button of the add form: its window (product, step group, sale person …) opens only after this check (`POST /prospects/duplicate-checks`,
   * before the window, as the spec draws it). true = open it. The body that passed is remembered: the save of the window does not ask the same again.
   */
  async checkDuplicateBeforeSave(): Promise<boolean> {
    const c = this.contractBean;
    const ssTel = this.session.ss_tel;
    if (ssTel != null && ssTel !== '') c.tel = ssTel;
    const purpose: DuplicatePurpose = this.action_type === 'edit' ? 'EDIT' : 'RELEASE';
    const ok = await this.duplicateOk(purpose);
    this.duplicateCleared = ok ? JSON.stringify(duplicateCheckBody(c, purpose, this.duplicateExclude(purpose))) : null;
    return ok;
  }

  /** the key of the create in hand: the same data again (a retry) is the same action, so it keeps its key */
  private createKey = '';
  private createKeyFor = '';

  /**
   * "Save draft" (mode DRAFT, nobody is assigned) and the "Save" of the window (mode RELEASE, `owner` = the choice of its owner field: a person or a queue) —
   * `POST /api/v1/prospects` (PR-2). The duplicate check comes first (a draft is only warned). Success: the success message and the list; a refusal: its reason.
   */
  async createProspectV2(mode: 'DRAFT' | 'RELEASE', owner: string): Promise<boolean> {
    const c = this.contractBean;
    const ssTel = this.session.ss_tel;
    if (ssTel != null && ssTel !== '') c.tel = ssTel;
    if ((c.customer_name != null ? jtrim(c.customer_name) : '') === '') {
      this.executeScript(SCRIPTS.needName);
      return false;
    }
    if (!(await this.duplicateOk(mode))) return false;
    const body = buildCreateV2Body(c, this.lists(), mode, mode === 'RELEASE' ? assignmentOf(owner) : null);
    const text = JSON.stringify(body);
    if (this.createKeyFor !== text) {
      this.createKeyFor = text;
      this.createKey = typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function' ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(16).slice(2)}`;
    }
    const response = await this.svc.api.createProspectV2(body, this.createKey);
    this.lastApiStatus = parseApiStatus(response);
    if (!apiResponseOk(response)) {
      this.lastApiError = apiErrorText(response);
      this.executeScript(SCRIPTS.createFailed(this.lastApiError));
      this.onChange();
      return false;
    }
    this.createKeyFor = '';
    this.lastApiError = '';
    // a picture chosen before the customer had an id waits for it: without this the picture of a new customer is lost without a word
    const newId = extractProspectId(response);
    if (newId > 0) await this.flushPendingProspectImage(newId);
    this.executeScript(SCRIPTS.created(this.ctx));
    this.onChange();
    return true;
  }

  /** the body of the check that passed at the button (null: none, or it was used) */
  private duplicateCleared: string | null = null;

  private duplicateExclude(purpose: DuplicatePurpose): string | null {
    return purpose === 'EDIT' && this.contractid !== '' ? this.contractid : null;
  }

  private async duplicateOk(purpose: DuplicatePurpose): Promise<boolean> {
    const exclude = this.duplicateExclude(purpose);
    const answer = await this.svc.duplicateCheck(duplicateCheckBody(this.contractBean, purpose, exclude));
    // the service said no (403 no permission, 422 malformed): the save does not go on, whatever the user is shown is the service's own reason
    const refusal = duplicateRefusal(answer);
    if (refusal !== null) {
      this.executeScript(SCRIPTS.duplicateRefused(refusal));
      this.onChange();
      return false;
    }
    const verdict = parseDuplicateVerdict(answer);
    if (verdict === null) return true;
    // a draft is only warned (the service answers for the draft to warn, the user keeps going)
    if (purpose === 'DRAFT') return true;
    const stop = duplicateStopText(verdict);
    if (stop === null) return true;
    this.executeScript(SCRIPTS.duplicateStop(stop));
    this.onChange();
    return false;
  }

  private async movementTypeUsesWorkflowStepAsync(movementTypeId: number): Promise<boolean> {
    if (movementTypeId <= 0) return false;
    return movementTypeUsesWorkflowStep(await this.svc.api.masterData('movement-types/LD'), movementTypeId);
  }

  /** `update_prospect_query_Data_API()`: PUT /prospects/{id}, then PUT /prospects/{id}/extra-info */
  async update_prospect_query_Data_API(): Promise<boolean> {
    const c = this.contractBean;
    let original: JObj | null = null;
    if (this.session.contactDetailOriginalJson != null) {
      const o = parseJson(this.session.contactDetailOriginalJson);
      original = isObj(o) ? o : {};
    }
    // Java's 3 country-id lookups run (and may reload the list) before the body is made
    await this.warmCountryIds([c.country, c.current_country_code, c.senddoc_country_code]);
    const body = buildUpdateBody(c, original, { lists: this.lists(), today: this.today(), resolveCountryId: this.resolveCountryId });
    const response = await this.svc.api.updateProspect(c.id, body);
    if (!apiResponseOk(response)) {
      this.lastApiError = apiErrorText(response);
      return false;
    }
    if (!(await this.putProspectExtraInfo(c.id, extraInfoOfForm(c)))) {
      this.lastApiError = `บันทึกข้อมูลหลักสำเร็จ แต่ข้อมูลเพิ่มเติมไม่สำเร็จ: ${this.lastApiError}`;
      return false;
    }
    this.lastApiError = '';
    return true;
  }

  /** `putProspectExtraInfo(pid, …)`: nothing to send is a success */
  private async putProspectExtraInfo(pid: number, body: JObj | null): Promise<boolean> {
    if (pid <= 0) {
      this.lastApiError = 'ไม่พบรหัสลูกค้า จึงบันทึกข้อมูลเพิ่มเติมไม่ได้';
      return false;
    }
    if (body === null) return true;
    const response = await this.svc.api.putExtraInfo(pid, body);
    if (!apiResponseOk(response)) {
      this.lastApiError = apiErrorText(response);
      return false;
    }
    return true;
  }

  /** `save_prospect_query_Data_API()`: POST /prospects (creates the lead too), then the extra info and the picture waiting for an id */
  async save_prospect_query_Data_API(): Promise<boolean> {
    const c = this.contractBean;
    const params = this.request;
    const codes: Array<string | null | undefined> = [];
    const isChosen = (v: string | null | undefined): v is string => v != null && v !== '' && v !== 'N/A';
    if (isChosen(c.country)) codes.push(c.country);
    if (isChosen(c.current_country_code) && this.listCountryBean.some((b) => b.code === c.current_country_code)) codes.push(c.current_country_code);
    if (isChosen(c.senddoc_country_code) && this.listCountryBean.some((b) => b.code === c.senddoc_country_code)) codes.push(c.senddoc_country_code);
    await this.warmCountryIds(codes);
    const salePersons = leadParamOr(params, 'assignToId', 0) > 0 ? await this.svc.salePersons() : [];
    const ctx: CreateContext = { lists: this.lists(), today: this.today(), resolveCountryId: this.resolveCountryId, params, salePersons, sendEmployeeId: this.opts.sendProspectEmployeeId === true };
    const { body, sunInfo } = buildCreateBody(c, ctx);
    const response = await this.svc.api.createProspect(body);
    this.lastApiStatus = parseApiStatus(response);
    if (!apiResponseOk(response)) {
      this.lastApiError = apiErrorText(response);
      return false;
    }
    const newId = extractProspectId(response);
    if (newId > 0) {
      c.id = newId;
      await this.flushPendingProspectImage(newId);
      await this.putProspectExtraInfo(newId, extraInfoOfSun(sunInfo));
    }
    this.lastApiError = '';
    return true;
  }

  /** `save_lead_query_Data_API()`: POST /leads for the saved customer */
  async save_lead_query_Data_API(): Promise<boolean> {
    const c = this.contractBean;
    const leadProspectId = c.id != null ? c.id : 0;
    if (leadProspectId <= 0) {
      this.lastApiError = 'ต้องบันทึกข้อมูลลูกค้าก่อนจึงสร้าง Lead ได้';
      return false;
    }
    const response = await this.svc.api.createLead(buildLeadBody(c, this.request));
    const ok = apiResponseOk(response);
    this.lastApiError = ok ? '' : apiErrorText(response);
    return ok;
  }

  /** `assignOwnerToCreatedLead(prospectId)`: the owner chosen in the modal becomes the owner of the lead the service just created */
  private async assignOwnerToCreatedLead(prospectId: number): Promise<void> {
    const employeeId = leadParamOr(this.request, 'employeeId', 0);
    if (employeeId <= 0 || prospectId <= 0) return;
    const query = `viewMode=list&sortBy=txdate_desc&page=1&perPage=50&movementTypeId=${leadParamOr(this.request, 'movementTypeId', 0)}`;
    const leadId = leadIdOfProspect(await this.svc.api.findLeads(query), prospectId);
    if (leadId <= 0) return;
    await this.svc.api.assignLead({ leadId, employeeId });
  }

  /* ================================================================================================ the picture */
  /** `uploadProspectImage()`: the resized picture of the file chooser (`imgB64`, `imgName`); a new customer's picture waits for its id */
  async uploadProspectImage(): Promise<void> {
    let base64 = this.request['imgB64'];
    const fileName = this.request['imgName'];
    if (base64 == null || jtrim(base64) === '') return;
    if (base64.startsWith('data:')) {
      const comma = base64.indexOf(',');
      if (comma > -1) base64 = base64.substring(comma + 1);
    }
    const prospectId = this.contractBean != null ? String(this.contractBean.id) : '';
    if (prospectId === '' || prospectId === '0' || prospectId === 'null') {
      this.pendingImgB64 = base64;
      this.pendingImgName = fileName ?? null;
      return;
    }
    await this.doUploadProspectImage(prospectId, base64, fileName ?? null, true);
    this.onChange();
  }

  private async flushPendingProspectImage(prospectId: number): Promise<void> {
    if (this.pendingImgB64 == null || this.pendingImgB64 === '') return;
    // showUi = false: no dialog over the dialog that shows the result of the save
    await this.doUploadProspectImage(String(prospectId), this.pendingImgB64, this.pendingImgName, false);
    this.pendingImgB64 = null;
    this.pendingImgName = null;
  }

  /** `doUploadProspectImage`: POST the file, store its address with PUT /prospects/{id}, read it back to verify, tell the page */
  private async doUploadProspectImage(prospectId: string, base64: string, fileName: string | null, showUi: boolean): Promise<void> {
    // (ensureSunRecord(pid): a database insert, not ported)
    const posted = await this.svc.api.addProspectAttachment(prospectId, {
      attachFileBase64: base64,
      fileName: fileName != null && fileName !== '' ? fileName : 'prospect-image.jpg',
      attachFileTypeCode: 'PROFILE',
      description: 'รูปโปรไฟล์ลูกค้า',
    });
    const root = parseJson(posted);
    const res = isObj(root) && isObj(root['result']) ? root['result'] : null;
    const attachUrl = res ? optString(res, 'attachFile', '') : '';
    if (attachUrl === '') return;
    const rel = toRelative(attachUrl);
    const fileOnly = rel.substring(rel.lastIndexOf('/') + 1);
    let persistErr = '';
    const persisted = await this.persistProspectAvatarViaApi(Number(prospectId), rel, base64);
    if (!persisted) persistErr = this.lastApiError;
    if (persisted) this.syncAvatarIntoSessionDetail(rel);
    let verified = false;
    const dj = parseJson(await this.svc.api.prospect(prospectId));
    if (isObj(dj) && isObj(dj['result'])) {
      const saved = optString(dj['result'], 'attachFile', '');
      verified = fileOnly !== '' && saved.includes(fileOnly);
    }
    this.contractBean.avatar = attachUrl;
    if (!showUi) return;
    if (persisted && verified) this.executeScript(SCRIPTS.imageSaved(this.avatarSrc(attachUrl)));
    else {
      const reason = !persisted ? `บันทึกลิงก์รูปไม่สำเร็จ (API): ${persistErr}` : 'อัปโหลดไฟล์สำเร็จ แต่ยืนยันลิงก์รูปในระบบไม่ได้ — โปรดลองใหม่หรือติดต่อผู้ดูแลระบบ';
      this.executeScript(SCRIPTS.imageFailed(reason));
    }
  }

  /** `persistProspectAvatarViaApi`: GET the whole prospect, put the picture address in it, PUT it back (the service replaces the whole record) */
  private async persistProspectAvatarViaApi(pid: number, rel: string, base64: string): Promise<boolean> {
    if (pid <= 0) {
      this.lastApiError = 'ไม่พบรหัสลูกค้า';
      return false;
    }
    const got = await this.svc.api.prospect(String(pid));
    const root = parseJson(got);
    if (!isObj(root)) {
      this.lastApiError = 'อ่านข้อมูลลูกค้าไม่สำเร็จ: ';
      return false;
    }
    const current = isObj(root['result']) ? root['result'] : null;
    if (current === null) {
      this.lastApiError = 'อ่านข้อมูลลูกค้ากลับมาไม่ได้ก่อนบันทึกรูป';
      return false;
    }
    const body = mainBody(current, pid);
    body['attachFile'] = toRelative(rel);
    body['downloadAttachFile'] = toRelative(rel);
    if (base64 != null && base64 !== '') body['attachFileBase64'] = base64;
    const response = await this.svc.api.updateProspect(pid, body);
    if (!apiResponseOk(response)) {
      this.lastApiError = apiErrorText(response);
      return false;
    }
    this.lastApiError = '';
    return true;
  }

  /** `syncAvatarIntoSessionDetail(rel)`: the snapshot the next update starts from must carry the new picture, or the update puts the old one back */
  private syncAvatarIntoSessionDetail(rel: string): void {
    const snapshot = this.session.contactDetailOriginalJson;
    if (snapshot == null) return;
    const snap = parseJson(snapshot);
    if (!isObj(snap)) return;
    snap['attachFile'] = rel;
    snap['downloadAttachFile'] = rel;
    this.session.contactDetailOriginalJson = JSON.stringify(snap);
  }

  /* ================================================================================================ documents */
  /** `loadProspectDocs()` */
  async loadProspectDocs(): Promise<void> {
    const pid = this.contractBean != null && this.contractBean.id != null ? this.contractBean.id : 0;
    // the new service has uuids: a record without a number is read by the id the page was opened with
    this.prospectDocs = pid > 0 ? await this.svc.docs(pid) : this.contractid !== '' ? await this.svc.docs(this.contractid) : [];
    this.onChange();
  }

  /** `deleteProspectDocument()` (`docNo` of the request): delete one, then read the list again */
  async deleteProspectDocument(): Promise<void> {
    const no = this.request['docNo'];
    const pid = this.contractBean != null && this.contractBean.id != null ? this.contractBean.id : 0;
    if (pid <= 0 || no == null || jtrim(no) === '') return;
    if (!/^[+-]?\d+$/.test(jtrim(no))) {
      // Long.parseLong throws: the method ends with the error
      this.lastApiError = 'ลบเอกสารไม่สำเร็จ: ';
      return;
    }
    const r = await this.svc.deleteDoc(pid, Number(jtrim(no)));
    this.lastApiError = r.error;
    if (r.reload) await this.loadProspectDocs();
    this.onChange();
  }
}
