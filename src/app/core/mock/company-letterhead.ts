/**
 * The letterhead of a company (หัวกระดาษบริษัท) — the name, tax id, address, contacts and logo printed at the head of the
 * Smart Doc documents (ใบเสนอราคา · ใบจอง · ใบส่งสินค้า · ใบรับเงิน). Kept in Datasource (`state.company-letterhead.json`),
 * one per company (businessentity id of the settings' "ใช้กับ").
 *
 * The fields are the param_codes of triplesales-api's letterhead — `system_parameter` MYCOMPANY (spec SMARTDOC_SPEC 2.7: COMPANY_NAME_TH
 * · NAME_EN · TAXID · BRANCHNO · BRANCHNAME · ADDRESS_TH · ADDRESS_EN · SUBDISTRICT_TH · DISTRICT_TH · PROVINCE_TH · ZIPCODE ·
 * COUNTRY_TH · TEL · FAX · EMAIL · WEBSITE · LOGO) = `SmartDocOptions.Company` (nameTh … website, logoUrl), so the page can switch to the
 * API without renaming.
 *
 * FAST-DEBT(API): Datasource stands in for system_parameter MYCOMPANY; the logo is a data URL in the JSON (≤ 400 px) instead of
 *   a file (COMPANY_LOGO) downloaded through the API — the API has no logo download yet (logoUrl = null) · BIG · 2026-11-23
 * FAST-DEBT(REQ): Smart Doc uses the letterhead of the company chosen in the settings ("ใช้กับ"), not of the session's company
 *   (the session holds no company id in the mockup) · BIG · 2026-11-23
 */
import { persistedState } from '@core/mockup/mockup-datasource';

export interface CompanyLetterhead {
  nameTh: string;
  nameEn: string;
  taxId: string;
  /** เลขที่สาขา: 00000 = สำนักงานใหญ่ */
  branchNo: string;
  branchName: string;
  addressTh: string;
  addressEn: string;
  subdistrictTh: string;
  districtTh: string;
  provinceTh: string;
  zipcode: string;
  countryTh: string;
  tel: string;
  fax: string;
  email: string;
  website: string;
  /** data:image/… or null = no logo (the document keeps its empty "โลโก้บริษัท" box) */
  logo: string | null;
}

/** the key of the settings' "ใช้กับ" (settings.store.ts SETTINGS_ENTITY_KEY) — read here so Smart Doc does not load the settings */
const SETTINGS_ENTITY_KEY = 'ts.settings.entity';

/** the largest side of a stored logo, in pixels */
export const LOGO_MAX_PX = 400;
/** the largest file accepted before it is scaled down */
export const LOGO_MAX_BYTES = 2 * 1024 * 1024;
export const LOGO_TYPES = ['image/png', 'image/jpeg', 'image/webp'];

const state = persistedState<{ byEntity: Record<string, CompanyLetterhead> }>(
  'company-letterhead',
  () => ({ byEntity: {} }),
);

export function emptyLetterhead(): CompanyLetterhead {
  return {
    nameTh: '',
    nameEn: '',
    taxId: '',
    branchNo: '',
    branchName: '',
    addressTh: '',
    addressEn: '',
    subdistrictTh: '',
    districtTh: '',
    provinceTh: '',
    zipcode: '',
    countryTh: '',
    tel: '',
    fax: '',
    email: '',
    website: '',
    logo: null,
  };
}

/** the letterhead of a company, a copy (undefined = none saved) */
export function letterheadOf(entityId: string): CompanyLetterhead | undefined {
  const saved = state.get().byEntity?.[entityId];
  return saved ? { ...emptyLetterhead(), ...saved } : undefined;
}

export function saveLetterhead(entityId: string, letterhead: CompanyLetterhead): void {
  if (!entityId) return;
  const logo = letterhead.logo && isImageDataUrl(letterhead.logo) ? letterhead.logo : null;
  const current = state.get();
  current.byEntity = { ...(current.byEntity ?? {}), [entityId]: { ...letterhead, logo } };
  state.touch();
}

/** the letterhead of the company chosen in the settings, else the only / first one saved, else undefined */
export function currentLetterhead(): CompanyLetterhead | undefined {
  const all = state.get().byEntity ?? {};
  const chosen = chosenEntity();
  const id = chosen && all[chosen] ? chosen : Object.keys(all)[0];
  return id ? letterheadOf(id) : undefined;
}

export function isImageDataUrl(value: string): boolean {
  return /^data:image\/(png|jpeg|webp);base64,[A-Za-z0-9+/=]+$/.test(value);
}

/** the address of the Thai letterhead on one line, as the prototype's header: address · sub-district · district · province · postcode (+ the country when it is not Thailand) */
export function addressTh(l: CompanyLetterhead): string {
  const home = ['ไทย', 'ประเทศไทย', 'thailand'];
  const country = home.includes(l.countryTh.trim().toLowerCase()) ? '' : l.countryTh;
  return [l.addressTh, l.subdistrictTh, l.districtTh, l.provinceTh, l.zipcode, country]
    .map((part) => part.trim())
    .filter(Boolean)
    .join(' ');
}

/** the lines under the company name, as on the prototype's header: tax id (+ branch) · address · tel / fax · email / website */
export function letterheadLines(l: CompanyLetterhead): string[] {
  const branch =
    l.branchName ||
    (l.branchNo === '00000' ? 'สำนักงานใหญ่' : l.branchNo ? `สาขาที่ ${l.branchNo}` : '');
  const tax = l.taxId ? `เลขประจำตัวผู้เสียภาษี: ${l.taxId}${branch ? ` (${branch})` : ''}` : '';
  const phone = [l.tel && `โทร: ${l.tel}`, l.fax && `แฟกซ์: ${l.fax}`]
    .filter(Boolean)
    .join('  ·  ');
  const web = [l.email && `อีเมล: ${l.email}`, l.website].filter(Boolean).join('  ·  ');
  return [tax, addressTh(l), phone, web].filter((line): line is string => !!line);
}

/** the same lines for the English print: the English address (ADDRESS_EN) and the postcode; none = the Thai address stays */
export function letterheadLinesEn(l: CompanyLetterhead): string[] {
  const branch =
    l.branchName ||
    (l.branchNo === '00000' ? 'Head office' : l.branchNo ? `Branch ${l.branchNo}` : '');
  const tax = l.taxId ? `Tax ID: ${l.taxId}${branch ? ` (${branch})` : ''}` : '';
  const address = l.addressEn.trim()
    ? [l.addressEn.trim(), l.zipcode.trim()].filter(Boolean).join(' ')
    : addressTh(l);
  const phone = [l.tel && `Tel: ${l.tel}`, l.fax && `Fax: ${l.fax}`].filter(Boolean).join('  ·  ');
  const web = [l.email && `Email: ${l.email}`, l.website].filter(Boolean).join('  ·  ');
  return [tax, address, phone, web].filter((line): line is string => !!line);
}

function chosenEntity(): string | null {
  try {
    return localStorage.getItem(SETTINGS_ENTITY_KEY) || null;
  } catch {
    return null;
  }
}

/** for tests: no letterhead */
export function resetLetterheads(): void {
  state.reset();
}
