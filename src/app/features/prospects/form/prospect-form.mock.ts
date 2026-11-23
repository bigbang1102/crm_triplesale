/**
 * The fake backend of the prospect form (mock mode, tests and the Java-vs-Angular comparison): an in-memory `triplesale-service` for the REST
 * calls of `ProspectFormApi` and an in-memory BFF for the `fetch` of the page's own scripts, in the shape of the real ones.
 *
 * Framework-free and deterministic (no Date.now, no Math.random): the comparison harness loads this file into Node and both sides must see the
 * same data. The cast comes from `@core/mock/crm-seed` through the Prospects mock (`mockProspect(id)` = the customer of the list page, so the
 * customer you open is the customer you clicked); what the user saves is kept here, on top of that cast (module-level state, like a database).
 * The documents and the files (`/board/prospect/attachments`, `/docproxy`) ARE the Prospects mock's, so the list page and the form agree on them.
 *
 * What is deliberately varied so that every branch of the form is reached:
 *   - customers: every 5th has no phone code (the form picks the country's, else +66) · every 7th has a marketing channel by id only (the name
 *     is resolved from the list) · every 13th has a country by id only · every 11th has no birth date · every 20th is a legacy "company" ·
 *     the address is a Bangkok one (its sub-districts come from the metro file) except province index 2 (the service has sub-districts);
 *   - master data: a foreign "province" (dropped from the list unless the record has it), a Thai province twice (the larger id wins), a code
 *     with a leading tab (trimmed), two countries with the same phone code, one with none;
 *   - words in a field make the next call fail: name `X-FAIL` (500) · `X-INVALID` (400) · `X-NOREPLY` (no answer) · `X-DUP` (409 until the
 *     merge is confirmed) · remark `X-EXTRA-FAIL` (the extra-info call answers 500) · employee id 108 cannot be assigned as the owner of a lead.
 */
import { SEED_PROVINCES, SEED_TODAY, seedHash } from '@core/mock/crm-seed';
import { SEED_EMPLOYEES, SEED_TODAY as TODAY } from '@core/mock/crm-seed';
import { resetSharedDb, splitName, upsertSharedLead, upsertSharedProspect, type ProspectPatch } from '@core/mock/shared-db';
import { msg, reference } from '@core/mock/reference';
import { mockupEnabled } from '@core/mockup/mockup-datasource';
import { journaledMethods } from '@core/mockup/mockup-journal';
import { moveBase64ToStorage, resolveStoredUrl, storageIdOf, storedRef } from '@core/mockup/mockup-uploads';
import { applyProspectAssignment, createMockProspects, employeeOfRef, mockProspect } from '../prospects.mock';
import type { ProspectFormApi, ProspectFormBackend } from './prospect-form-backend';

export interface MockProspectFormOptions {
  /** how long every call takes (ms); the specs and the harness pass 0 */
  delayMs?: number;
}

type Doc = Record<string, unknown>;

const pad = (n: number, w: number): string => String(n).padStart(w, '0');
const wait = (ms: number): Promise<void> => (ms > 0 ? new Promise((r) => setTimeout(r, ms)) : Promise.resolve());
const envelope = (result: unknown, extra: Record<string, unknown> = {}, status = 200): string => JSON.stringify({ status, message: 'success', ...extra, result });
const failure = (status: number, message: string, detail?: string): string => JSON.stringify({ status, message, ...(detail ? { error: { message: detail } } : {}) });
const jsonResponse = (body: unknown, status = 200): Response => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json; charset=UTF-8' } });

/* ===================================================================================================================== master data */
const PROVINCE_CODES = reference<string[]>('prospectForm.provinceCodes', ['BKK', 'CNX', 'KKC', 'HKT', 'CBI', 'NMA']);
const PROVINCE_BASE = 100;
const DISTRICT_BASE = 1000;
const BKK_DISTRICTS = reference<string[]>('prospectForm.districtsBangkok', ['เขตพระนคร', 'เขตดุสิต', 'เขตบางรัก']);
/** the Thai provinces of the cast; the code of Chon Buri has a tab in front (27 rows of the real service are like that) */
const PROVINCES = SEED_PROVINCES.map((name, i) => ({ id: PROVINCE_BASE + i, code: i === 4 ? '\tCBI' : PROVINCE_CODES[i], name }));

const COUNTRIES = reference('prospectForm.countries', [
  { id: 1, code: 'THA', name: 'Thailand', nameTh: 'ไทย', phoneCountryCode: '+66', phoneNumberFormat: 'XX XXX XXXX / X XXXX XXXX' },
  { id: 2, code: 'MYS', name: 'Malaysia', nameTh: 'มาเลเซีย', phoneCountryCode: '+60', phoneNumberFormat: 'XX XXXX XXXX' },
  { id: 3, code: 'SGP', name: 'Singapore', nameTh: 'สิงคโปร์', phoneCountryCode: '+65', phoneNumberFormat: 'XXXX XXXX' },
  { id: 4, code: 'JPN', name: 'Japan', nameTh: 'ญี่ปุ่น', phoneCountryCode: '+81', phoneNumberFormat: 'XX XXXX XXXX' },
  { id: 5, code: 'USA', name: 'United States', nameTh: 'สหรัฐอเมริกา', phoneCountryCode: '+1', phoneNumberFormat: 'XXX XXX XXXX' },
  { id: 6, code: 'CAN', name: 'Canada', nameTh: '', phoneCountryCode: '+1', phoneNumberFormat: 'XXX XXX XX XXXX' },
  { id: 7, code: 'GBR', name: 'United Kingdom', nameTh: 'สหราชอาณาจักร', phoneCountryCode: '+44', phoneNumberFormat: 'XXXX XXXXXX' },
  { id: 8, code: 'ATA', name: 'Antarctica', nameTh: 'แอนตาร์กติกา', phoneCountryCode: '', phoneNumberFormat: '' },
]);
const CHANNELS = reference('prospectForm.channelNames', ['Facebook', 'LINE OA', 'Website', 'Walk-in', 'Referral', 'Call Center', 'Offline Store', 'E-Commerce']).map((name, i) => ({ id: 10 + i, code: `MKC-${pad(i + 1, 3)}`, name, marketingGroupId: 1 }));
const COMMUNICATION = reference('prospectForm.communication', [
  { id: 1, code: 'CT-01', name: 'โทรศัพท์', nameTh: 'โทรศัพท์' },
  { id: 2, code: 'CT-02', name: 'LINE', nameTh: 'LINE' },
  { id: 3, code: 'CT-03', name: 'อีเมล', nameTh: 'อีเมล' },
]);
const OCCUPATIONS = reference('prospectForm.occupations', ['พนักงานบริษัท', 'ข้าราชการ', 'เจ้าของกิจการ', 'ฟรีแลนซ์']).map((name, i) => ({ id: 20 + i, code: `OC-${pad(i + 1, 2)}`, name, nameTh: name }));
const BUSINESS_TYPES = reference('prospectForm.businessTypes', ['ค้าปลีก', 'ก่อสร้าง', 'บริการ']).map((name, i) => ({ id: 30 + i, code: `BT-${pad(i + 1, 2)}`, name, nameTh: name }));
const SALE_PERSONS = reference('prospectForm.salePersons', [
  { id: 101, code: 'GGW-001', name: 'สมชาย ใจดี' },
  { id: 102, code: 'GGW-002', name: 'สุดา รักงาน' },
  { id: 103, code: 'GGW-003', name: 'วิชัย มั่นคง' },
  { id: 200, code: 'GGW-100', name: 'พนักงานขาย ทดสอบ' },
]);
/** the products (ids of the Prospects mock): the flag says whether a step group is needed */
const MOVEMENT_TYPES = reference('prospectForm.movementTypes', [
  { id: 1004400740, code: 'LD-WFS-A', name: 'สินเชื่อบ้านต่างประเทศ', usesWorkflowStep: true },
  { id: 1004400741, code: 'LD-WFS-B', name: 'ประกันภัย', usesWorkflowStep: true },
  { id: 1004400742, code: 'LD-WFS-D', name: 'คอร์สผิวพรรณ', usesWorkflowStep: false },
  { id: 1004400743, code: 'LD04', name: 'สินเชื่อรถยนต์', usesWorkflowStep: false },
]);

const districtsOfProvince = (pi: number): Array<{ id: number; code: string; name: string }> =>
  (pi === 0 ? [...BKK_DISTRICTS] : [msg('อำเภอเมือง{0}', SEED_PROVINCES[pi]), msg('อำเภอ{0}ตะวันออก', SEED_PROVINCES[pi]), msg('อำเภอ{0}เหนือ', SEED_PROVINCES[pi])]).map((name, k) => ({
    id: DISTRICT_BASE + pi * 10 + k,
    code: `${PROVINCE_CODES[pi]}_${pad(k + 1, 2)}`,
    name,
  }));

/** the sub-districts the SERVICE has: only the first district of province 2 (the real service has none at all; the others come from the metro file) */
const API_SUB_DISTRICTS = reference<Record<string, Array<Record<string, unknown>>>>('prospectForm.apiSubDistricts', {
  [String(DISTRICT_BASE + 2 * 10)]: [
    { id: 50001, code: 'KKC_0101', name: 'ในเมือง', nameTh: 'ในเมือง' },
    { id: 50002, code: 'KKC_0102', name: 'สำราญ', nameTh: '' },
  ],
});
const apiSubDistricts = (districtId: number): Array<Record<string, unknown>> => API_SUB_DISTRICTS[String(districtId)] ?? [];

/** the metro file (the real one has 488 rows of six provinces; this is the three districts the cast lives in) */
const METRO: Array<[string, string, string, string]> = reference<Array<[string, string, string, string]>>('prospectForm.metro', [
  ['พระนคร', '100101', 'พระบรมมหาราชวัง', '10200'],
  ['พระนคร', '100102', 'วังบูรพาภิรมย์', '10200'],
  ['พระนคร', '100103', 'วัดราชบพิธ', '10200'],
  ['ดุสิต', '100201', 'ดุสิต', '10300'],
  ['ดุสิต', '100202', 'วชิรพยาบาล', '10300'],
  ['ดุสิต', '100203', 'สวนจิตรลดา', '10300'],
  ['บางรัก', '100401', 'มหาพฤฒาราม', '10500'],
  ['บางรัก', '100402', 'สีลม', '10500'],
  ['บางรัก', '100403', 'สุริยวงศ์', '10500'],
]);
const metroJson = (): string => JSON.stringify(METRO.map(([dn, s, sn, z]) => ({ p: '02', pid: 1, pn: 'กรุงเทพมหานคร', d: s.slice(0, 4), dn, s, sn, z })));

/** the answer of `GET /master-data/<path>?…` */
function masterAnswer(pathAndQuery: string): string {
  const q = new URL(`http://mock.local/${pathAndQuery}`);
  const path = q.pathname.replace(/^\//, '');
  const num = (k: string): number => Number(q.searchParams.get(k) ?? 0);
  switch (path) {
    case 'countries':
      return envelope(COUNTRIES);
    case 'provinces':
      // a foreign "province" and an older row of Bangkok (smaller id, same code): the form keeps the Thai names, one per code
      return envelope([...PROVINCES, { id: 900, code: 'KUL', name: 'Kuala Lumpur' }, { id: 90, code: 'BKK', name: 'กรุงเทพ (ซ้ำ)' }]);
    case 'districts': {
      const pi = num('provinceId') - PROVINCE_BASE;
      return envelope(pi >= 0 && pi < SEED_PROVINCES.length ? districtsOfProvince(pi) : []);
    }
    case 'sub-districts':
      return envelope(apiSubDistricts(num('districtId')));
    case 'business-types':
      return envelope(BUSINESS_TYPES);
    case 'occupations':
      return envelope(OCCUPATIONS);
    case 'marketing-channels':
      return envelope(CHANNELS.map((c) => ({ ...c, marketingGroupCode: 'MG-01', marketingGroupName: 'ออนไลน์' })));
    case 'communication-types':
      return envelope(COMMUNICATION);
    case 'sale-persons':
      return envelope(SALE_PERSONS);
    case 'movement-types/LD':
      return envelope(MOVEMENT_TYPES);
    default:
      return failure(404, `not found: ${path}`);
  }
}

/* ===================================================================================================================== the customers */
const shaped = (key: string, list: ReadonlyArray<{ id: number; code: string; name: string }>, i: number): Doc => {
  const x = list[i % list.length];
  return { [`${key}Id`]: x.id, [`${key}Code`]: x.code, [`${key}Name`]: x.name };
};

/** the customer `id` as `GET /prospects/{id}` answers (the `result`): the cast of the list page, with every field of the form */
export function mockFormDetail(id: number): Doc | null {
  const p = mockProspect(id);
  if (!p) return null;
  const h = (salt: number): number => seedHash(id, 200 + salt);
  const pi = Math.max(0, p.provinceIdx);
  const province = PROVINCES[pi];
  const districts = districtsOfProvince(pi);
  const district = districts[h(1) % districts.length];
  const foreign = p.countryCode !== '' && p.countryCode !== 'THA';
  const country = COUNTRIES.find((c) => c.code === p.countryCode);
  const juristic = p.type === 'องค์กร';
  const birth = id % 11 === 0 ? '' : `19${80 + (h(2) % 20)}-${pad(1 + (h(3) % 12), 2)}-${pad(1 + (h(4) % 28), 2)}T00:00:00.000+07:00`;
  const sale = p.sale;
  const channel = CHANNELS[p.sourceIdx % CHANNELS.length];
  const idOnlyChannel = id % 7 === 0;
  const sub = foreign || pi !== 0 ? '' : METRO.find((r) => msg('เขต{0}', r[0]) === district.name);
  const detail: Doc = {
    id,
    code: p.code,
    name: p.name,
    attachFile: p.avatar,
    customerTel: p.tel,
    phoneCountryCode: id % 5 === 0 ? '' : p.phonecc,
    sex: p.sex === 'ชาย' ? '1' : '2',
    age: 20 + (id % 40),
    idCard: `1${pad(h(5) % 1_000_000_000_000, 12)}`,
    nationality: 'ไทย',
    customerType: juristic ? (id % 20 === 0 ? 'company' : 'juristic') : 'person',
    refferal: id % 3 === 0 ? 'คุณแนะนำ ตัวอย่าง' : '',
    referralTel: id % 3 === 0 ? '0812345678' : '',
    referralRelate: id % 3 === 0 ? 'เพื่อน' : '',
    workplaceName: id % 2 === 0 ? 'บริษัท ตัวอย่าง จำกัด' : '',
    workplacePosition: id % 2 === 0 ? 'ผู้จัดการ' : '',
    workplaceAddress: id % 2 === 0 ? '99 ถนนสีลม' : '',
    workplaceTel: id % 2 === 0 ? '021234567' : '',
    taxId: juristic ? `0${pad(h(6) % 1_000_000_000_000, 12)}` : '',
    taxBranch: juristic ? '00000' : '',
    contactBusiness: juristic ? 'ติดต่อธุรกิจ' : '',
    contactPosition: juristic ? 'ผู้อำนวยการ' : '',
    contactDate: `${p.contact}T00:00:00.000+07:00`,
    convenient: p.convenient,
    birthdate: birth,
    ...(id % 6 === 0 ? { contactBackId: 0, contactBackCode: '', contactBackName: '' } : shaped('contactBack', COMMUNICATION, id)),
    country: id % 13 === 0 ? '' : p.countryCode,
    countryId: id % 13 === 0 ? 1 : (country?.id ?? 0),
    countryName: id % 13 === 0 ? '' : (country?.nameTh ?? ''),
    currentCountry: id % 13 === 0 ? '' : p.countryCode,
    prospectEmail: p.email,
    prospectLine: p.line,
    prospectFacebook: p.fb,
    prospectTwitter: p.x,
    prospectInstragram: p.ig,
    prospectPhone1: id % 4 === 0 ? '081-234-5678' : p.tel,
    prospectPhone2: id % 4 === 1 ? '0899999999' : '',
    prospectPhone3: '',
    prospectTel1: id % 2 === 0 ? '02-123 4567 #12' : '',
    prospectTel2: '',
    prospectTel3: '',
    prospectFax: id % 9 === 0 ? '02-765-4321' : '',
    salePersonId: sale?.id ?? 0,
    salePersonCode: sale?.code ?? '',
    salePersonName: sale?.name ?? '',
    ...shaped('occupation', OCCUPATIONS, id),
    ...shaped('businessType', BUSINESS_TYPES, id),
    currentAddress: p.address,
    currentPostId: sub ? sub[3] : p.postId,
    currentCity: province.name,
    currentCityId: province.id,
    currentCityCode: province.code,
    currentCityName: province.name,
    currentDistrict: district.name,
    currentDistrictCode: district.code,
    currentDistrictName: district.name,
    currentSubDistrictCode: sub ? sub[1] : '',
    currentSubDistrictName: sub ? sub[2] : '',
    currentCountryId: country?.id ?? 0,
    currentCountryCode: p.countryCode,
    currentCountryName: country?.nameTh ?? '',
    sendDocAddress: id % 2 === 0 ? p.address : msg('{0} ถนนเพชรบุรี', 100 + id),
    sendDocPostId: id % 2 === 0 ? p.postId : '10400',
    sendDocCityId: province.id,
    sendDocCityCode: province.code,
    sendDocCityName: province.name,
    sendDocCountryId: country?.id ?? 0,
    sendDocCountryCode: p.countryCode,
    sendDocCountryName: country?.nameTh ?? '',
    sendDocDistrict: district.name,
    sendDocDistrictCode: district.code,
    sendDocDistrictName: district.name,
    sendDocSubDistrictCode: sub ? sub[1] : '',
    sendDocSubDistrictName: sub ? sub[2] : '',
    saleGroupId: 1004400001,
    saleGroupCode: 'CS01',
    saleGroupName: 'กลุ่มขาย 1',
    ggwBranchId: 1,
    marketingChanelId: channel.id,
    marketingChanelCode: idOnlyChannel ? '' : channel.code,
    marketingChanelName: idOnlyChannel ? '' : channel.name,
    mainCustomerkeyId: 0,
    mainCustomerkeyCode: '',
    mainCustomerkeyName: '',
    remark: id % 4 === 0 ? 'หมายเหตุตัวอย่าง' : '',
    status: 'ACTIVE',
    usageStatus: 'release',
    createBy: 'system',
    createDate: '2026-01-01T00:00:00.000+07:00',
  };
  if (id % 3 === 1) {
    detail['sunProspectInfo'] = {
      researcher: 'E101',
      txDate: '2026-09-01T00:00:00.000+07:00',
      csLoanType: 'LT01',
      csTypeProperty: 'PT01',
      csLoanProperty: 'บ้านเดี่ยว',
      csDateTransOwnership: '',
      csDescriptionProperty: 'บ้าน 2 ชั้น',
      csTypeService: 'SV01',
      csDesiredLoanAmount: '3000000',
      csYearsLoan: '20',
      csCoBorrower: 'N',
    };
    detail['satisfaction'] = {};
  }
  return detail;
}

/* ===================================================================================================================== state */
interface Shared {
  /** what the user saved: the keys of the PUT / POST bodies, over the cast */
  saved: Map<number, Doc>;
  /** the sun info / satisfaction written by the extra-info calls */
  extra: Map<number, Doc>;
  created: Set<number>;
  nextId: number;
  nextLead: number;
  leads: Array<{ id: number; prospectId: number; movementTypeId: number; employeeId: number }>;
  nextFile: number;
}
let shared: Shared | null = null;
const state = (): Shared => (shared ??= { saved: new Map(), extra: new Map(), created: new Set(), nextId: 1000, nextLead: 7000, leads: [], nextFile: 1 });

/** forget everything the user saved (unit tests, the comparison harness) */
export function resetMockProspectForm(): void {
  shared = null;
  resetSharedDb(); // the customers / leads this mock put in the shared database go with it
}

/** the customer as the service holds it now (the cast + what was saved), null when there is none */
export function currentMockDetail(id: number): Doc | null {
  const s = state();
  const base = s.created.has(id) ? { id } : mockFormDetail(id);
  if (!base) return null;
  const merged: Doc = { ...base, ...(s.saved.get(id) ?? {}) };
  const extra = s.extra.get(id);
  if (extra) {
    if (extra['sunProspectInfo']) merged['sunProspectInfo'] = { ...(merged['sunProspectInfo'] as Doc | undefined), ...(extra['sunProspectInfo'] as Doc) };
    if (extra['satisfaction']) merged['satisfaction'] = { ...(merged['satisfaction'] as Doc | undefined), ...(extra['satisfaction'] as Doc) };
  }
  return merged;
}

const idOf = (v: number | string): number => Number(v);

/** `0812223333` → `081-222-3333` (a number of another shape is left as it is) */
function formatPhone(value: unknown): string {
  const phone = typeof value === 'string' ? value.trim() : '';
  return phone.replace(/^(\d{3})(\d{3})(\d{4})$/, '$1-$2-$3');
}

/** what a save of the form says about the customer, as the shared database holds it (every page shows the same customer) */
function sharedPatchOf(body: Doc): ProspectPatch {
  const text = (key: string): string => (typeof body[key] === 'string' ? body[key].trim() : '');
  const name = text('name');
  const phone = text('customerTel');
  return {
    ...(name ? { fullName: name, ...splitName(name) } : {}),
    code: text('code'),
    email: text('prospectEmail'),
    source: text('marketingChanelName'),
    phone: formatPhone(phone),
    // only a picture that is in Storage/ is shown by the list page (an address the file server does not have would be a broken image there)
    avatar: storageIdOf(text('attachFile')) ? resolveStoredUrl(text('attachFile')) : undefined,
  };
}

/** the employee a lead body means by `employeeId`: `r-<n>` / a code, or the number the old calls send (1..8 in the order of the cast, or 1001.. as the login numbers them) */
function employeeOfBodyId(value: unknown) {
  const byRef = employeeOfRef(value);
  if (byRef) return byRef;
  const n = Number(value);
  if (!Number.isInteger(n) || n <= 0) return undefined;
  const index = n >= 1001 ? n - 1001 : n - 1;
  return SEED_EMPLOYEES[index] ? { code: SEED_EMPLOYEES[index].code, index } : undefined;
}

/**
 * The bytes of the picture are already in Storage/ (`addProspectAttachment`) and the body carries its address: the journal keeps the address,
 * not a second copy of the picture as base64.
 */
export function withoutStoredBytes(args: unknown[]): unknown[] {
  return args.map((arg) => {
    if (typeof arg !== 'object' || arg === null || Array.isArray(arg)) return arg;
    const body = arg as Doc;
    if (typeof body['attachFile'] !== 'string' || !storageIdOf(body['attachFile']) || !('attachFileBase64' in body)) return arg;
    const rest: Doc = { ...body };
    delete rest['attachFileBase64'];
    return rest;
  });
}

/* ===================================================================================================================== the REST calls */
/** what the user saves is kept in Datasource/journal.prospect-form.json (mockup file server) and replayed at the next start */
export function createMockProspectFormApi(options: MockProspectFormOptions = {}): ProspectFormApi {
  return journaledMethods('prospect-form', makeMockProspectFormApi, options, ['createProspect', 'createProspectV2', 'updateProspect', 'putExtraInfo', 'createLead', 'assignLead'], async (_method, args) => {
    const slim = withoutStoredBytes(args);
    return slim.some((arg, i) => arg !== args[i]) ? slim : undefined;
  });
}

function makeMockProspectFormApi(options: MockProspectFormOptions = {}): ProspectFormApi {
  const delayMs = options.delayMs ?? 0;
  const files = createMockProspects({ delayMs: 0 });
  const s = state;
  return {
    async prospect(id) {
      await wait(delayMs);
      const n = idOf(id);
      const d = Number.isInteger(n) ? currentMockDetail(n) : null;
      return d ? envelope(d) : '';
    },
    async masterData(pathAndQuery) {
      await wait(delayMs);
      return masterAnswer(pathAndQuery);
    },
    async metroGeo() {
      await wait(delayMs);
      return metroJson();
    },
    async duplicateCheck(body) {
      await wait(delayMs);
      // a name with X-DUP-STRONG / X-DUP-BLOCKED / X-DUP-WEAK makes the matching verdict (the form's own X-DUP is the 409 of the save)
      const name = String(body['name'] ?? '');
      const kind = name.includes('X-DUP-BLOCKED') ? 'DUPLICATE_BLOCKED' : name.includes('X-DUP-STRONG') ? 'DUPLICATE_STRONG' : name.includes('X-DUP-WEAK') ? 'DUPLICATE_WEAK' : 'NONE';
      const matches = kind === 'DUPLICATE_STRONG' || kind === 'DUPLICATE_WEAK' ? [{ prospectId: '1', group: kind === 'DUPLICATE_STRONG' ? 'A' : 'B', fields: [kind === 'DUPLICATE_STRONG' ? 'MAIN_PHONE' : 'EMAIL'], preview: { code: 'P00001', name: 'จิราพร แสงทอง' } }] : [];
      return JSON.stringify({ status: 200, result: { result: kind, matches } });
    },
    async createProspectV2(body) {
      await wait(delayMs);
      const name = String((body['customer'] as Record<string, unknown> | undefined)?.['name'] ?? '');
      if (name.includes('X-NOREPLY')) return '';
      if (name.includes('X-FAIL')) return failure(422, 'VALIDATION_ERROR', 'invalid');
      // the customer is kept like one made with the old call: it is in the shared database, and a RELEASE opens its lead for the person chosen
      const st = s();
      const id = st.nextId++;
      const code = `P${pad(id, 5)}`;
      const customer = (body['customer'] ?? {}) as Doc;
      const fullName = [customer['name'], customer['lastname']].filter((v) => typeof v === 'string' && v.trim() !== '').join(' ');
      st.created.add(id);
      st.saved.set(id, { id, code, name: fullName, remark: customer['remark'] ?? '' });
      upsertSharedProspect(id, { fullName, code, phone: formatPhone(customer['mainPhone']), email: typeof customer['email'] === 'string' ? customer['email'] : '', createdDate: TODAY }, true);
      if (body['mode'] !== 'DRAFT') {
        const lead = { id: st.nextLead++, prospectId: id, movementTypeId: 0, employeeId: 0 };
        st.leads.push(lead);
        const assignment = body['assignment'] as Doc | undefined;
        // the person chosen is the owner of the customer AND of the lead opened for it (a queue: the customer waits there, the lead has no owner yet)
        const owner = assignment?.['destination'] === 'WAITLIST' ? undefined : employeeOfRef(assignment?.['responsibleEmployeeId']);
        upsertSharedLead(lead.id, { prospectId: id, status: 'ACTIVE', interest: 'NEW', groupIdx: 0, createdDate: TODAY, ownerCode: owner?.code }, true);
        if (owner) upsertSharedProspect(id, { ownerCode: owner.code });
        else if (assignment?.['destination'] === 'WAITLIST') applyProspectAssignment(id, assignment);
      }
      return JSON.stringify({ status: 201, message: 'created', result: { id: String(id), code, usageStatus: body['mode'] === 'DRAFT' ? 'DRAFT' : 'RELEASE' } });
    },
    async createProspect(body) {
      await wait(delayMs);
      const name = String(body['name'] ?? '');
      if (name.includes('X-NOREPLY')) return '';
      if (name.includes('X-FAIL')) return failure(500, 'Internal Server Error');
      if (name.includes('X-INVALID')) return failure(400, 'Bad Request', 'name is invalid');
      if (name.includes('X-DUP') && body['confirmMerge'] !== true) return failure(409, msg('พบลูกค้าที่ซ้ำกัน: ชื่อและเบอร์โทรตรงกับลูกค้ารหัส P00001'));
      const st = s();
      const id = st.nextId++;
      st.created.add(id);
      st.saved.set(id, { ...body, id, code: String(body['code'] ?? '') || `P${pad(id, 5)}` });
      // POST /prospects creates the lead of the product chosen in the modal
      const lead = { id: st.nextLead++, prospectId: id, movementTypeId: Number(body['movementTypeId'] ?? 0), employeeId: 0 };
      st.leads.push(lead);
      // the shared database: every page now has this customer, and the lead opened for it
      upsertSharedProspect(id, { ...sharedPatchOf(body), createdDate: TODAY }, true);
      upsertSharedLead(lead.id, { prospectId: id, status: 'ACTIVE', interest: 'NEW', groupIdx: 0, createdDate: TODAY }, true);
      return envelope({ id }, {}, 201);
    },
    async updateProspect(id, body) {
      await wait(delayMs);
      const n = idOf(id);
      if (!currentMockDetail(n)) return failure(404, 'Data notfound');
      if (String(body['name'] ?? '').includes('X-FAIL')) return failure(500, 'Internal Server Error');
      if (String(body['name'] ?? '').includes('X-INVALID')) return failure(400, 'Bad Request', 'name is invalid');
      if (String(body['name'] ?? '').includes('X-NOREPLY')) return '';
      s().saved.set(n, { ...(s().saved.get(n) ?? {}), ...body });
      upsertSharedProspect(n, sharedPatchOf(body));
      return envelope({ id: n });
    },
    async putExtraInfo(id, body) {
      await wait(delayMs);
      const n = idOf(id);
      if (String(currentMockDetail(n)?.['remark'] ?? '').includes('X-EXTRA-FAIL')) return failure(500, 'Internal Server Error');
      const st = s();
      const old = st.extra.get(n) ?? {};
      st.extra.set(n, { ...old, ...body, ...(body['sunProspectInfo'] ? { sunProspectInfo: { ...(old['sunProspectInfo'] as Doc | undefined), ...(body['sunProspectInfo'] as Doc) } } : {}) });
      return envelope({ id: n });
    },
    async prospectAttachments(id) {
      await wait(delayMs);
      const r = await files.fetch(`/board/prospect/attachments?prospectId=${idOf(id)}`);
      return r.ok ? await r.text() : '';
    },
    async addProspectAttachment(id, body) {
      await wait(delayMs);
      const n = idOf(id);
      if (!currentMockDetail(n)) return failure(404, 'Data notfound');
      const fileName = String(body['fileName'] ?? 'prospect-image.jpg');
      if (fileName.includes('FAIL')) return failure(500, msg('อัปโหลดไฟล์ไม่สำเร็จ'));
      // the service stores the file and answers its address; the picture of the customer is the address PUT /prospects/{id} stores afterwards
      const address = `prospect/${1_760_000_000_000 + n * 3_600_000 + s().nextFile++ * 60_000}/${fileName}`;
      // mockup: the picture is kept in Storage/ and its address is the one of the file server (otherwise nothing serves the address and the picture is broken)
      const moved = mockupEnabled() ? await moveBase64ToStorage(body, `prospects/${n}`, 'attachFileBase64', 'fileName') : undefined;
      const storageId = typeof moved?.['storageId'] === 'string' ? moved['storageId'] : '';
      return envelope({ attachFile: storageId === '' ? address : storedRef(storageId, fileName) });
    },
    async deleteProspectAttachment(id, detailOrderNo) {
      await wait(delayMs);
      const r = await files.fetch(`/board/prospect/attachments?prospectId=${idOf(id)}&docNo=${idOf(detailOrderNo)}`, { method: 'DELETE' });
      const j = (await r.json()) as { message?: string };
      return JSON.stringify(r.ok ? { success: true, message: 'success' } : { success: false, message: j.message ?? '' });
    },
    async createLead(body) {
      await wait(delayMs);
      const st = s();
      const lead = { id: st.nextLead++, prospectId: Number(body['prospectId'] ?? 0), movementTypeId: Number(body['movementTypeId'] ?? 0), employeeId: Number(body['employeeId'] ?? 0) };
      st.leads.push(lead);
      const owner = employeeOfBodyId(body['employeeId']);
      upsertSharedLead(lead.id, { prospectId: lead.prospectId, status: 'ACTIVE', interest: 'NEW', groupIdx: 0, createdDate: TODAY, ownerCode: owner?.code }, true);
      return envelope({ id: lead.id }, {}, 201);
    },
    async findLeads(query) {
      await wait(delayMs);
      const mt = Number(new URLSearchParams(query).get('movementTypeId') ?? 0);
      const items = [...s().leads].filter((l) => mt === 0 || l.movementTypeId === mt).reverse().slice(0, 50);
      return envelope({ leads: { items } });
    },
    async assignLead(body) {
      await wait(delayMs);
      if (Number(body['employeeId']) === 108) return failure(500, 'assign failed');
      const lead = s().leads.find((l) => l.id === Number(body['leadId']));
      if (!lead) return failure(404, 'Data notfound leadId');
      lead.employeeId = Number(body['employeeId']);
      // the owner chosen is the owner of the lead on every page, not only in this call
      const owner = employeeOfBodyId(body['employeeId']);
      if (owner) upsertSharedLead(lead.id, { ownerCode: owner.code });
      return envelope({ id: lead.id });
    },
  };
}

/* ===================================================================================================================== the backend */
/** `commonBean.ssEmployeeId` of the mock login (employee 1001, the account of the harness) */
export const MOCK_EMPLOYEE_ID = '1001';

export function createMockProspectForm(options: MockProspectFormOptions = {}): ProspectFormBackend {
  const delayMs = options.delayMs ?? 0;
  const bff = createMockProspects({ delayMs: 0 });
  const api = createMockProspectFormApi(options);
  return {
    async initial() {
      await wait(0);
      const p = await bff.initial();
      return { uploadAcceptExt: p.uploadAcceptExt, ssEmployeeId: MOCK_EMPLOYEE_ID };
    },
    api,
    async fetch(input: string, init?: RequestInit): Promise<Response> {
      const url = new URL(input, 'http://mock.local');
      const method = (init?.method ?? 'GET').toUpperCase();
      await wait(delayMs);
      switch (url.pathname.replace(/^\/?(\.\.\/)?/, '/')) {
        case '/board/prospect': {
          // ProspectDetailServlet: the `result` of the prospect, "{}" for anything else
          const n = Number((url.searchParams.get('id') ?? '').trim());
          const d = Number.isInteger(n) && n > 0 ? currentMockDetail(n) : null;
          return new Response(JSON.stringify(d ?? {}), { status: 200, headers: { 'Content-Type': 'application/json; charset=UTF-8' } });
        }
        case '/board/prospect/save': {
          if (method !== 'POST') return jsonResponse({ ok: false, message: 'method not allowed' }, 405);
          let body: Doc = {};
          try {
            body = JSON.parse(String(init?.body ?? '{}')) as Doc;
          } catch {
            return jsonResponse({ ok: false, message: 'missing/invalid prospectId or payload' }, 400);
          }
          const pid = Number(body['prospectId'] ?? 0);
          const extra = body['extraInfo'] as Doc | undefined;
          if (!(pid > 0) || !extra) return jsonResponse({ ok: false, message: 'missing/invalid prospectId or payload' }, 400);
          const answer = await api.putExtraInfo(pid, extra);
          const status = (JSON.parse(answer) as { status: number }).status;
          if (status < 200 || status >= 300) return jsonResponse({ ok: false, via: 'api', extraStatus: status, message: msg('API ตอบ {0} — {1}', status, answer) }, 502);
          return jsonResponse({ ok: true, via: 'api', status, extraStatus: status });
        }
        default:
          // the employees, the documents, the files: the Prospects mock's
          return bff.fetch(input, init);
      }
    },
  };
}

/** the day the mock calls today (the harness fixes the same clock on both sides) */
export const MOCK_TODAY = SEED_TODAY;
