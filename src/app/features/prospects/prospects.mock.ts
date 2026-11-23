/**
 * Deterministic fake backend of the Prospects page (dev / `mock: true`, tests and the Java-vs-Angular comparison).
 *
 * It answers in exactly the shapes the servlets of the Java page answered (ProspectListServlet + ProspectListService, ProspectEnrichServlet,
 * the master-data servlets, LeadCreateServlet, ProspectAttachmentsServlet, DocProxy — see prospects-backend.ts): the list is paged, sorted,
 * searched and filtered on the "server" like the real one, the rows carry only what the REAL list carries (no customer code, no e-mail … —
 * the page asks /board/prospect-enrich for the rest), a created lead / uploaded document is remembered. The customers are the cast of
 * `@core/mock/crm-seed` (`seedProspect(n)`), so the person you see here is the person the other pages show; "today" is `SEED_TODAY`.
 *
 * A few SEARCH TEXTS are test hooks of the fake (the real service would answer them with its error / empty / odd paths — they let the page and
 * the comparison reach those states by typing into the search box): X-ERR-500, X-ERR-403, X-ERR-404, X-ERR-502, X-ERR-0 (the list fails),
 * X-EMPTY, X-FULL (rows carry everything: no enrich request), X-NOMETA (no paging meta), X-ENRICH-FAIL (rows whose enrich request fails),
 * X-SLOW (the answer takes 3 s: the skeleton stays on screen). A few FILE NAMES are hooks of the upload: *FAIL* (backend error), *UNVERIFIED*
 * (stored but not reachable), *SLOW* (takes 3 s: the upload button stays busy), and *missing* in the name of a stored file makes /docproxy answer
 * 502 UPSTREAM_404. The lead products 'ประกันภัย' (validation error) and 'บริการเสริม' (HTTP 500) fail on purpose.
 *
 * Framework-free on purpose (no Angular imports): the comparison harness loads this file in Node.
 */
import { SEED_EMPLOYEES, SEED_GROUPS, SEED_PROSPECT_COUNT, SEED_PROVINCES, SEED_SOURCES, SEED_TODAY, isKnownProspect, prospectIds, seedHash, seedProspect } from '@core/mock/crm-seed';
import { reference, msg } from '@core/mock/reference';
import { prospectPatchOf, upsertSharedLead } from '@core/mock/shared-db';
import { isInQueue, ownerOf, sendToQueue, setResponsible } from '@core/mock/waitlist';
import type { ProspectRow, ProspectsBackend, ProspectsInitial } from './prospects-backend';
import { UPLOAD_ACCEPT_EXT, ALLOWED_UPLOAD_EXT } from './prospects.constants';
import { journaledBackend } from '@core/mockup/mockup-journal';
import { base64Upload, fetchStored, storageIdOf, storedRef } from '@core/mockup/mockup-uploads';

export interface MockProspectsOptions {
  /** simulated network time per request (ms); the skeleton rows of the page need a little */
  delayMs?: number;
  /** UI language of the session: the country of an address is translated for 'th' (ProspectListService.countryNameOf) */
  lang?: 'th' | 'en';
  /** how many marketing channels the master data has (the source filter shows a search box above 10; default 12) */
  channels?: number;
}

/* ===================================================================================================================== master data */
const EXTRA_CHANNELS = reference('prospects.extraChannels', ['Instagram', 'TikTok', 'YouTube', 'Google Ads', 'งานอีเวนต์', 'พันธมิตร']);
const CHANNEL_BASE = 1004400100;
const channelNames = (n: number): string[] => [...SEED_SOURCES, ...EXTRA_CHANNELS].slice(0, Math.max(1, n));

const PROVINCES = [...SEED_PROVINCES, ...reference('prospects.moreProvinces', ['นนทบุรี', 'ปทุมธานี', 'สมุทรปราการ', 'ระยอง', 'สงขลา', 'อุดรธานี', 'พิษณุโลก', 'นครปฐม', 'ลำปาง', 'สุราษฎร์ธานี', 'เชียงราย', 'พระนครศรีอยุธยา', 'ราชบุรี', 'อุบลราชธานี'])];
const PROVINCE_BASE = 1004401000;
const DISTRICT_BASE = 1004402000;
const BKK = 'กรุงเทพมหานคร';
const DISTRICTS_BKK = reference('prospects.districtsBangkok', ['เขตบางรัก', 'เขตปทุมวัน', 'เขตจตุจักร', 'เขตบางนา']);
const DISTRICTS_OTHER = reference('prospects.districtsOther', ['เมือง', 'บางใหญ่', 'สันทราย', 'ศรีราชา', 'ถลาง', 'ชุมแพ', 'หางดง', 'ปากเกร็ด']);
const districtsOf = (provinceIdx: number): string[] => (PROVINCES[provinceIdx] === BKK ? DISTRICTS_BKK : [0, 1, 2, 3].map((k) => DISTRICTS_OTHER[(provinceIdx + k * 2) % DISTRICTS_OTHER.length]));
const SUBDISTRICTS = reference('prospects.subDistricts', ['คลองเตย', 'สีลม', 'ลาดพร้าว', 'บางนา', 'ช้างคลาน', 'ในเมือง', 'หนองหอย', 'แม่เหียะ']);
const ROADS = reference('prospects.roads', ['สุขุมวิท', 'พหลโยธิน', 'ราชพฤกษ์', 'เพชรเกษม', 'นิมมานเหมินท์', 'มิตรภาพ', 'ศรีนครินทร์', 'ลาดพร้าว']);
/** how the customer is reachable (the form picks by index; '' = no preference) */
const CONVENIENT_TIMES = reference('prospects.convenientTimes', ['ช่วงเช้า', 'ช่วงบ่าย', 'ช่วงเย็น', '']);
/** the lists of the create-OPP window: the sales lines and the wait lists (the second has no name: the page shows a blank) */
const SALES_LINES = reference('prospects.salesLines', [{ id: 'sl-1', name: 'สายงานขาย A' }, { id: 'sl-2', name: 'สายงานขาย B' }]);
const WAITLISTS = reference<Array<{ id: string; name: string | null }>>('prospects.waitlists', [{ id: 'w-1', name: 'คิวทดสอบในเครื่อง' }, { id: 'w-2', name: null }]);

interface Foreign {
  code: string;
  en: string;
  th: string;
  city: string;
  cc: string;
  address: string;
}
const FOREIGN: Foreign[] = reference<Foreign[]>('prospects.foreign', [
  { code: 'JPN', en: 'Japan', th: 'ญี่ปุ่น', city: 'Tokyo', cc: '+81', address: '1-2-3 Shibuya' },
  { code: 'GBR', en: 'United Kingdom', th: 'สหราชอาณาจักร', city: 'London', cc: '+44', address: '10 Baker Street' },
  { code: 'SGP', en: 'Singapore', th: 'สิงคโปร์', city: 'Singapore', cc: '+65', address: '8 Marina Boulevard' },
  { code: 'USA', en: 'United States', th: 'สหรัฐอเมริกา', city: 'Seattle', cc: '+1', address: '400 Pine Street' },
  { code: 'MYS', en: 'Malaysia', th: 'มาเลเซีย', city: 'Kuala Lumpur', cc: '+60', address: '55 Jalan Ampang' },
]);

const EMP_BASE = 100; // E101 → id 101
const empId = (e: { code: string }): number => EMP_BASE + Number(e.code.slice(1)) - 100;
/** the account of the comparison harness / the mock login ('demo', employee 1001): in the owner list so that "yourself" is the default */
const ME = reference('prospects.me', { id: 1001, code: 'E001', name: 'สมชาย ใจดี (ทดลอง)' });

// The English name of a product is what the master-data dictionary (`masterdata_en.properties` = public/assets/i18n/master-data.en.json) says of its
// CODE — the service itself sends Thai names only; a code the dictionary does not know keeps its Thai name in English. The codes below are the
// ones the dictionary has (LD-WFS-A / B / D) with its English text, and two that it does not have (so the live backend, which looks the code up,
// and this fake say the same in English).
const PRODUCTS = reference('prospects.products', [
  { id: 1004400740, code: 'LD-WFS-A', name: 'สินเชื่อบ้านต่างประเทศ', en: 'Product A (with WorkFlow Step)', usesWorkflowStep: true, groups: SEED_GROUPS.map((g) => g.id) },
  { id: 1004400741, code: 'LD-WFS-B', name: 'ประกันภัย', en: 'Product B (with WorkFlow Step)', usesWorkflowStep: true, groups: [...new Set([SEED_GROUPS[0].id, (SEED_GROUPS[2] ?? SEED_GROUPS[SEED_GROUPS.length - 1]).id])] }, // creating its lead fails (validation)
  // the flag says "no workflow" but it HAS groups: the page believes the groups it can load
  { id: 1004400742, code: 'LD-WFS-D', name: 'คอร์สผิวพรรณ', en: 'Skincare Course (Laser/Treatment)', usesWorkflowStep: false, groups: [(SEED_GROUPS[1] ?? SEED_GROUPS[0]).id] },
  { id: 1004400743, code: 'LD04', name: 'สินเชื่อรถยนต์', en: 'สินเชื่อรถยนต์', usesWorkflowStep: false, groups: [] as number[] }, // no step groups: not required
  { id: 1004400744, code: 'LD05', name: 'บริการเสริม', en: 'บริการเสริม', usesWorkflowStep: false, groups: [] as number[] }, // creating its lead answers HTTP 500
]);
/** who works in which activity group (ids of SEED_GROUPS) */
const GROUP_EMP: Record<number, string[]> = reference<Record<number, string[]>>('prospects.groupEmployees', {
  101: ['E101', 'E102', 'E103', 'E104'],
  102: ['E105', 'E106'],
  103: ['E103', 'E107'],
  104: ['E105', 'E108'],
  105: ['E106'],
  106: ['E107', 'E108'],
  107: ['E102', 'E104'],
});

/** a pipeline the "create opportunity" dialog offers: the first group of the pipeline and the people of that group (who may be in charge) */
export interface PipelineChoice {
  id: number;
  name: string;
  firstGroupId: number;
  members: { code: string; name: string }[];
}

/** the pipelines that have a group, with who can take them (a pipeline with no group or nobody in its first group is left out) */
export function pipelineChoices(): PipelineChoice[] {
  const nameOf = new Map(SEED_EMPLOYEES.map((e) => [e.code, e.name]));
  const choices: PipelineChoice[] = [];
  for (const p of PRODUCTS) {
    const firstGroupId = p.groups[0];
    const members = (GROUP_EMP[firstGroupId] ?? []).map((code) => ({ code, name: nameOf.get(code) ?? code }));
    if (firstGroupId !== undefined && members.length) choices.push({ id: p.id, name: p.name, firstGroupId, members });
  }
  return choices;
}

/* ===================================================================================================================== the customers */
interface Full {
  id: number;
  code: string;
  name: string;
  /** yyyy-MM-dd */
  contact: string;
  sourceIdx: number;
  source: string;
  channelId: number;
  tel: string;
  phonecc: string;
  countrycode: string;
  provinceIdx: number;
  province: string;
  provinceId: number;
  district: string;
  districtId: number;
  address: string;
  subDistrict: string;
  postId: string;
  countryEn: string;
  countryCode: string;
  sale: { id: number; code: string; name: string } | null;
  team: string;
  recorder: string;
  avatar: string;
  sex: string;
  type: string;
  email: string;
  line: string;
  fb: string;
  x: string;
  ig: string;
  convenient: string;
}

const pad = (n: number, w: number): string => String(n).padStart(w, '0');
const AVATAR_COLORS = reference('prospects.avatarColors', ['#35236A', '#00C08B', '#0D61CF', '#DA6624', '#C92A76']);
/** a small round picture as a data URI (no network: both sides of the comparison show the same pixels) */
const avatarOf = (name: string, n: number): string =>
  `data:image/svg+xml;utf8,${encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" width="68" height="68"><circle cx="34" cy="34" r="34" fill="${AVATAR_COLORS[n % AVATAR_COLORS.length]}"/><text x="34" y="44" font-size="28" text-anchor="middle" fill="#fff" font-family="sans-serif">${name.slice(0, 1)}</text></svg>`)}`;

/** the customer as the cast has it, with the phone the user changed (shared-db.ts: the name, the province, the source come through `seedProspect`) */
function full(n: number, channels: number): Full {
  const f = fullOfSeed(n, channels);
  const phone = prospectPatchOf(n)?.phone;
  return phone ? { ...f, tel: phone.replace(/\D/g, '') } : f;
}

function fullOfSeed(n: number, channels: number): Full {
  const p = seedProspect(n);
  const h = (salt: number): number => seedHash(n, 100 + salt);
  const provinceIdx = Math.max(0, PROVINCES.indexOf(p.province));
  const districts = districtsOf(provinceIdx);
  const di = h(1) % districts.length;
  const foreign = n % 9 === 0 ? FOREIGN[h(2) % FOREIGN.length] : null;
  const noCountry = !foreign && n % 13 === 0;
  const sourceIdx = n % 11 === 0 ? SEED_SOURCES.length + (h(3) % EXTRA_CHANNELS.length) : Math.max(0, (SEED_SOURCES as readonly string[]).indexOf(p.source));
  const names = channelNames(channels);
  const idx = Math.min(sourceIdx, names.length - 1);
  // the one owner every page shows (the Wait List's `ownerOf`: the person chosen or given the customer, else the cast's); none while it waits in the queue
  const ownerCode = ownerOf('prospect', n);
  const sale = SEED_EMPLOYEES.find((e) => e.code === ownerCode) ?? null;
  const rec = n % 7 === 0 ? null : SEED_EMPLOYEES[h(5) % SEED_EMPLOYEES.length];
  const sub = SUBDISTRICTS[h(6) % SUBDISTRICTS.length];
  return {
    id: n,
    code: p.code,
    name: p.fullName,
    contact: p.createdDate,
    sourceIdx: idx,
    source: names[idx],
    channelId: CHANNEL_BASE + idx,
    tel: n % 17 === 0 ? '' : foreign ? pad(h(7) % 1_000_000_000, 9) : `0${8 + (h(7) % 2)}${pad(h(8) % 100_000_000, 8)}`,
    phonecc: foreign ? foreign.cc : n % 5 === 0 ? '' : '+66',
    countrycode: foreign ? foreign.code : n % 4 === 0 ? '' : 'THA',
    provinceIdx,
    province: foreign ? foreign.city : p.province,
    provinceId: PROVINCE_BASE + provinceIdx,
    district: foreign ? '' : districts[di],
    districtId: DISTRICT_BASE + provinceIdx * 10 + di,
    address: foreign ? foreign.address : `${1 + (h(9) % 299)}/${1 + (h(10) % 39)} ถนน${ROADS[h(11) % ROADS.length]}`,
    subDistrict: foreign ? '' : sub,
    postId: foreign ? '' : pad(10000 + (h(12) % 89999), 5),
    countryEn: foreign ? foreign.en : noCountry ? '' : 'Thailand',
    countryCode: foreign ? foreign.code : noCountry ? '' : 'THA',
    sale: sale ? { id: 200 + SEED_EMPLOYEES.indexOf(sale), code: `GGW-${pad(SEED_EMPLOYEES.indexOf(sale) + 1, 3)}`, name: sale.name } : null,
    team: n % 4 === 0 || !sale ? '' : sale.team,
    recorder: rec ? rec.name : '',
    // the picture the user chose in the form (kept by the shared database) wins over the one of the seed
    avatar: prospectPatchOf(n)?.avatar || (n % 6 === 1 ? avatarOf(p.firstName, n) : ''),
    sex: h(13) % 2 ? 'ชาย' : 'หญิง',
    type: n % 10 === 0 ? 'องค์กร' : 'บุคคลธรรมดา',
    email: p.email,
    line: `line_${p.code.toLowerCase()}`,
    fb: n % 2 ? `fb.${p.firstName}${n}` : '',
    x: n % 3 === 0 ? `@x_${p.code.toLowerCase()}` : '',
    ig: n % 4 === 0 ? `ig_${p.code.toLowerCase()}` : '',
    convenient: CONVENIENT_TIMES[h(14) % CONVENIENT_TIMES.length],
  };
}

/** ContractBean.formatSubDistrict: แขวง in a district that starts with เขต, ตำบล elsewhere, unless the name has one already */
const subDistrictOf = (p: { subDistrict: string; district: string }): string => {
  const sub = p.subDistrict.trim();
  if (sub && !/^(แขวง|ตำบล|ต\.)/.test(sub)) return (p.district.startsWith('เขต') ? 'แขวง' : 'ตำบล') + sub;
  return sub;
};

/** ContractBean.getFull_address: address, sub-district (แขวง in Bangkok / ตำบล elsewhere), district, province, post code — blanks skipped */
function fullAddress(p: Full): string {
  let sub = p.subDistrict.trim();
  if (sub && !/^(แขวง|ตำบล|ต\.)/.test(sub)) sub = (p.district.startsWith('เขต') ? 'แขวง' : 'ตำบล') + sub;
  return [p.address, sub, p.district, p.province, p.postId].map((s) => s.trim()).filter(Boolean).join(' ');
}

/** the countries master (/board/chat-master-data?type=countries): Thailand + the foreign ones of the seed; the id is what `currentCountryId` carries */
const COUNTRY_BASE = 900;
const COUNTRIES = [{ code: 'THA', en: 'Thailand', th: 'ไทย' }, ...FOREIGN.map((f) => ({ code: f.code, en: f.en, th: f.th }))];
const TH_COUNTRY: Record<string, string> = Object.fromEntries([...FOREIGN.map((f) => [f.code, f.th]), ['THA', 'ไทย']]);
/** ProspectListService.countryNameOf: the English name from the backend, the Thai one from masterdata_th for the Thai UI */
const countryName = (p: Full, lang: string): string => (lang === 'en' || !p.countryEn ? p.countryEn : (TH_COUNTRY[p.countryCode] ?? p.countryEn));

const isoToView = (iso: string): string => `${iso.slice(8, 10)}/${iso.slice(5, 7)}/${iso.slice(0, 4)}`;

/** ProspectListService.toRowJson of a bean that has only what the LIST of the REST service carries */
function listRow(p: Full, lang: string): ProspectRow {
  return {
    id: p.id,
    code: '',
    name: p.name,
    date: isoToView(p.contact),
    source: p.source,
    phone: p.tel || '-',
    phonecc: p.phonecc,
    countrycode: p.countrycode,
    addr: fullAddress(p),
    province: p.province,
    district: p.district,
    subdistrict: subDistrictOf(p),
    country: countryName(p, lang),
    agentcode: p.sale?.code ?? '',
    agent: p.sale?.name ?? '',
    team: p.team,
    recorder: p.recorder,
    // the RESPONSIBLE person (what the panel and the list show as owner), not who recorded the customer
    owner: p.sale?.name ?? '',
    ownerid: ownerRefOf(p),
    avatar: p.avatar,
    gender: '',
    type: '',
    email: '',
    line: '',
    fb: '',
    x: '',
    ig: '',
    availtime: '',
    availchannel: '',
  };
}

/** toEnrichJson: what GET /prospects/{id}/quick-view adds (it has no contactBackName: "availchannel" stays empty) */
/** the id the options give the responsible person (`r-<n>`, n = place in the cast): what the panel selects and sends back */
const ownerRefOf = (p: Full): string => (p.sale ? `r-${p.sale.id - 200}` : ''); // the sale person id is 200 + the place in the cast

function enrichJson(p: Full, lang: string): Omit<ProspectRow, 'id' | 'name' | 'date' | 'source' | 'phone' | 'phonecc' | 'countrycode' | 'avatar'> {
  return {
    code: p.code,
    gender: p.sex,
    type: p.type,
    email: p.email,
    line: p.line,
    fb: p.fb,
    x: p.x,
    ig: p.ig,
    availtime: p.convenient,
    availchannel: '',
    addr: fullAddress(p),
    province: p.province,
    district: p.district,
    subdistrict: subDistrictOf(p),
    country: countryName(p, lang),
    agentcode: p.sale?.code ?? '',
    agent: p.sale?.name ?? '',
    team: p.team,
    recorder: p.recorder,
    // the RESPONSIBLE person (what the panel and the list show as owner), not who recorded the customer
    owner: p.sale?.name ?? '',
    ownerid: ownerRefOf(p),
  };
}

/** the three customers that the enrich hook returns: ids ≥ 900 — their enrich request fails */
export const BROKEN_FROM = 900;
function brokenFull(i: number, channels: number): Full {
  const base = full(10 + i, channels);
  return { ...base, id: BROKEN_FROM + i, code: `P9${pad(i, 4)}`, name: msg('ทดสอบ เอ็นริชล้ม {0}', i) };
}

/** one customer of the cast with everything the fake knows of it (what the REST service would hold) */
export type MockProspect = Full;
/**
 * The customer `id` of the cast (1..SEED_PROSPECT_COUNT, or 900+ for the enrich-fail hook), null for an unknown id. For the fake REST service of the
 * LIVE comparison (tools/compare/pages/prospects): the page, the Java replica and that service all start from this same data.
 */
export function mockProspect(id: number, channels = 12): MockProspect | null {
  if (id > BROKEN_FROM && id <= BROKEN_FROM + 3) return brokenFull(id - BROKEN_FROM, channels);
  return isKnownProspect(id) ? full(id, channels) : null;
}

/* ===================================================================================================================== documents (state) */
interface Att {
  detailOrderNo: number;
  attachFile: string;
  description: string;
  attachFileTypeCode: string;
}
const DOC_CATALOGUE = reference('prospects.documentNames', ['บัตรประชาชน.pdf', 'สำเนาทะเบียนบ้าน.png', 'สัญญาเงินกู้.docx', 'ตารางผ่อนชำระ.xlsx', 'เอกสารแนบ.zip', 'หมายเหตุ.txt', 'รูปถ่าย.jpg', 'งบการเงิน.csv']);
/** the file server keeps the documents under prospect/<epoch>/<name> (the real service answers a full address; a relative one keeps this fake off the network) */
const FILE_HOST = 'prospect';
const epochOf = (n: number, k: number): number => 1_760_000_000_000 + n * 3_600_000 + k * 60_000;

function initialAttachments(n: number): Att[] {
  const out: Att[] = [];
  if (n % 3 === 1) {
    const count = 2 + (n % 4);
    for (let k = 0; k < count; k++) {
      const name = DOC_CATALOGUE[(n + k * 3) % DOC_CATALOGUE.length];
      out.push({ detailOrderNo: k + 1, attachFile: `${FILE_HOST}/${epochOf(n, k)}/${name}`, description: name, attachFileTypeCode: 'DOC' });
    }
    // the profile picture is in the same table: the page must not list it as a document
    out.splice(1, 0, { detailOrderNo: 90, attachFile: `${FILE_HOST}/${epochOf(n, 99)}/profile.png`, description: 'profile.png', attachFileTypeCode: 'PROFILE' });
  }
  return out;
}

interface Shared {
  attachments: Map<number, Att[]>;
  nextDetail: number;
  leads: number;
}
let shared: Shared | null = null;
const state = (): Shared => (shared ??= { attachments: new Map(), nextDetail: 100, leads: 0 });
const attsOf = (pid: number): Att[] => {
  const s = state();
  if (!s.attachments.has(pid)) s.attachments.set(pid, initialAttachments(pid));
  return s.attachments.get(pid)!;
};

/** forget everything the user changed (uploads, deletes, created leads: unit tests, the comparison harness) */
export function resetMockProspects(): void {
  shared = null;
}

/* ===================================================================================================================== answers */
const json = (body: unknown, status = 200): Response => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json; charset=UTF-8' } });
const envelope = (result: unknown): unknown => ({ status: 200, message: 'success', result });

function wait(ms: number, signal?: AbortSignal | null): Promise<void> {
  const aborted = (): DOMException => new DOMException('The operation was aborted.', 'AbortError');
  if (signal?.aborted) return Promise.reject(aborted());
  if (ms <= 0) return Promise.resolve();
  return new Promise((resolve, reject) => {
    const t = setTimeout(() => {
      signal?.removeEventListener('abort', onAbort);
      resolve();
    }, ms);
    const onAbort = (): void => {
      clearTimeout(t);
      reject(aborted());
    };
    signal?.addEventListener('abort', onAbort, { once: true });
  });
}

/** the list of ProspectListServlet: search, filters and sort on the "server", 20 rows a page */
function listAnswer(q: URLSearchParams, opts: Required<MockProspectsOptions>): Response {
  const search = (q.get('searchText') ?? '').trim();
  const hook = search.toUpperCase();
  const page = Math.max(1, parseInt(q.get('page') ?? '1', 10) || 1);
  const perPage = Math.min(200, Math.max(1, parseInt(q.get('perPage') ?? '20', 10) || 20));
  const enrich = q.get('enrich') === '1';
  switch (hook) {
    case 'X-ERR-500': // the servlet threw
      return json({ status: 500, message: 'โหลดรายชื่อลูกค้าไม่สำเร็จ' }, 500);
    case 'X-ERR-403':
    case 'X-ERR-404':
    case 'X-ERR-502':
    case 'X-ERR-0': // the REST service failed: the servlet answers 200 with result.error + the status of the service
      return json(envelope({ items: [], meta: {}, error: true, errorStatus: Number(hook.slice('X-ERR-'.length)) }));
    case 'X-EMPTY':
      return json(envelope({ items: [], meta: { page, perPage, total: 0, totalPages: 0 } }));
  }

  let all: Full[];
  if (hook === 'X-ENRICH-FAIL') all = [1, 2, 3].map((i) => brokenFull(i, opts.channels));
  else {
    all = prospectIds().map((id) => full(id, opts.channels));
    if (hook === 'X-FULL' || hook === 'X-NOMETA' || hook === 'X-SLOW') all = all.slice(0, hook === 'X-SLOW' ? SEED_PROSPECT_COUNT : 25);
    else if (search) {
      const s = search.toLowerCase();
      all = all.filter((p) => [p.name, p.code, p.tel, p.email].some((v) => v.toLowerCase().includes(s)));
    }
    const channelIds = (q.get('marketingChannelIds') ?? '').split(',').map((s) => s.trim()).filter(Boolean);
    if (channelIds.length) all = all.filter((p) => channelIds.includes(String(p.channelId)));
    const country = q.get('currentCountryId');
    if (country) all = all.filter((p) => String(COUNTRY_BASE + COUNTRIES.findIndex((c) => c.code === p.countryCode)) === country);
    const city = q.get('currentCityId');
    if (city) all = all.filter((p) => String(p.provinceId) === city);
    const dist = q.get('currentDistrictId');
    if (dist) all = all.filter((p) => String(p.districtId) === dist);
    const sp = q.get('salePersonId');
    if (sp) all = all.filter((p) => String(p.sale?.id ?? '') === sp);
  }
  const sort = q.get('sortBy') ?? '';
  const byDate = (a: Full, b: Full): number => a.contact.localeCompare(b.contact) || a.id - b.id;
  if (sort === 'date_desc' || sort === 'contactDate_desc') all.sort((a, b) => -byDate(a, b));
  else if (sort === 'date_asc' || sort === 'contactDate_asc') all.sort(byDate);
  else if (sort === 'name_asc' || sort === 'name_desc') all.sort((a, b) => (sort === 'name_asc' ? 1 : -1) * (a.name.localeCompare(b.name, 'th') || a.id - b.id));

  const total = all.length;
  const totalPages = Math.ceil(total / perPage);
  const rows = all.slice((page - 1) * perPage, page * perPage).map((p) => {
    const row = listRow(p, opts.lang);
    // enrich=1 (the suggestion list) and X-FULL: the row is complete
    return enrich || hook === 'X-FULL' ? { ...row, ...enrichJson(p, opts.lang) } : row;
  });
  const meta = hook === 'X-NOMETA' ? { page, perPage, total: -1, totalPages: -1 } : { page, perPage, total, totalPages };
  return json(envelope({ items: rows, meta }));
}

/** ProspectEnrichServlet: the fields the list does not carry, by id (at most 200) */
function enrichAnswer(q: URLSearchParams, opts: Required<MockProspectsOptions>): Response {
  const ids = (q.get('ids') ?? '').split(',').map((s) => s.trim()).filter(Boolean).slice(0, 200);
  const result: Record<string, unknown> = {};
  for (const raw of ids) {
    const id = parseInt(raw, 10);
    if (!(id > 0)) continue;
    // only the three made-up customers of the hook fail (a customer the user added has an id of 1000 and up)
    if (id >= BROKEN_FROM && id <= BROKEN_FROM + 3) return json({ status: 500, message: 'โหลดรายละเอียดลูกค้าไม่สำเร็จ' }, 500);
    if (!isKnownProspect(id)) continue;
    result[String(id)] = enrichJson(full(id, opts.channels), opts.lang);
  }
  return json(envelope(result));
}

/** LeadCreateServlet: validates like the servlet, then the REST service answers (the products have their own outcomes) */
/** the employee a page means by `r-<n>` (the people the options list) or by a code `E10n`; undefined = nobody it knows */
export function employeeOfRef(ref: unknown): { code: string; index: number } | undefined {
  const text = String(ref ?? '').trim();
  const byOption = /^r-(\d+)$/.exec(text);
  const index = byOption ? Number(byOption[1]) : SEED_EMPLOYEES.findIndex((e) => e.code === text);
  const employee = SEED_EMPLOYEES[index];
  return employee ? { code: employee.code, index } : undefined;
}

export type AssignmentOutcome = 'ok' | 'invalid';

/**
 * Who is responsible for the customer now: `{ destination: 'EMPLOYEE', responsibleEmployeeId: 'r-<n>' }` hands it to that person (out of the Wait List
 * when it waits there), `{ destination: 'WAITLIST' }` sends it to the queue. The Wait List keeps it (shared-db.ts), so the list, the side panel,
 * the detail page and the Wait List page all show the person that was chosen.
 */
export function applyProspectAssignment(prospectId: number, assignment: Record<string, unknown> | undefined): AssignmentOutcome {
  if (assignment?.['destination'] === 'WAITLIST') {
    if (!isInQueue('prospect', prospectId)) sendToQueue('prospect', prospectId, SEED_TODAY, ownerOf('prospect', prospectId));
    return 'ok';
  }
  const employee = employeeOfRef(assignment?.['responsibleEmployeeId']);
  if (!employee) return 'invalid';
  return setResponsible('prospect', prospectId, employee.code, '', `${SEED_TODAY} 00:00`);
}

const OUTCOME_FAILURE: Readonly<Record<Exclude<AssignmentOutcome, 'ok'>, { status: number; code: string; message: string }>> = {
  invalid: { status: 422, code: 'RESPONSIBLE_INVALID', message: 'ไม่พบผู้รับผิดชอบที่เลือก' },
};

function assignmentFailure(outcome: Exclude<AssignmentOutcome, 'ok'>): Response {
  const { status, code, message } = OUTCOME_FAILURE[outcome];
  return json({ status, message, error: { code, description: message } }, status);
}

/** the product of a lead: a number (the products of the old page) or `sl-<n>` (the sales line the new options give) */
function productIdOf(value: unknown): number {
  const text = String(value ?? '').trim();
  const line = /^sl-(\d+)$/.exec(text);
  return line ? Number(line[1]) : Number(text);
}

/** the employee of a sale person (`200 + n` in the options) */
function employeeOfSalePerson(value: unknown): { code: string; index: number } | undefined {
  const index = Number(value) - 200;
  const employee = Number.isInteger(index) ? SEED_EMPLOYEES[index] : undefined;
  return employee ? { code: employee.code, index } : undefined;
}

/** the id of the lead a user opens from a customer: one per customer and product (the page refuses a second), the same on every replay of the journal */
const leadIdOf = (prospectId: number, movementTypeId: number): number => 200_000 + prospectId * 100 + (movementTypeId % 100);

function leadCreate(body: Record<string, unknown>): Response {
  const prospectId = Number(body['prospectId'] ?? 0);
  const movementTypeId = productIdOf(body['movementTypeId']);
  if (!(prospectId > 0) || !(movementTypeId > 0)) return json({ status: 400, message: 'prospectId และ movementTypeId จำเป็น' }, 400);
  if (movementTypeId === PRODUCTS[1].id) {
    return json({ status: 400, message: 'Validation error', error: { code: 'VALIDATION_ERROR', message: 'Validation error', details: { movementTypeId: 'ผลิตภัณฑ์นี้ยังไม่เปิดให้สร้าง Lead' } } });
  }
  if (movementTypeId === PRODUCTS[4].id) return json({ status: 500, message: 'Internal Server Error' }, 500);
  const s = state();
  s.leads += 1;
  const id = leadIdOf(prospectId, movementTypeId);
  const result = { id, txNo: `LD${pad(260000 + s.leads, 6)}` };
  const out: Record<string, unknown> = { status: 201, message: 'Created', result };
  // the owner is set afterwards with PATCH /leads/assign (LeadCreateServlet.assignCreatedLeadOwner); employee 108 (E108) is the one it fails for
  // no owner chosen: the sale person's own employee is the owner (the service gives it to the one who sells)
  const owner = employeeOfRef(body['employeeId']) ?? employeeOfSalePerson(body['assignToId']);
  const refused = owner?.code === 'E108' || Number(body['employeeId']) === 108;
  // the lead is kept (shared-db.ts) with the owner chosen, so the Opportunities pages list it under that person
  upsertSharedLead(id, { prospectId, status: 'ACTIVE', interest: 'NEW', groupIdx: 0, createdDate: SEED_TODAY, ownerCode: owner && !refused ? owner.code : undefined }, true);
  if (owner || Number(body['employeeId']) > 0) {
    out['ownerAssigned'] = !refused;
    if (refused) out['ownerAssignMessage'] = 'ไม่สามารถมอบหมายให้พนักงานคนนี้ได้ (ทดสอบ)';
  }
  return json(out);
}

/** ProspectAttachmentsServlet */
function attachments(method: string, q: URLSearchParams, body: Record<string, unknown>): Response {
  if (method === 'GET') {
    const pid = Number(q.get('prospectId') ?? 0);
    if (!(pid > 0)) return json({ status: 400, message: 'prospectId required' }, 400);
    return json(envelope(attsOf(pid)));
  }
  if (method === 'POST') {
    const pid = Number(body['prospectId'] ?? 0);
    const b64 = String(body['fileContentBase64'] ?? '');
    // mockup: the bytes were already put in Storage/ (core/mockup/mockup-uploads.ts) and the call carries their id instead
    const storageId = String(body['storageId'] ?? '');
    const fileName = String(body['fileName'] ?? 'document');
    if (!(pid > 0) || (!b64.trim() && storageId === '')) return json({ status: 400, message: 'prospectId และไฟล์จำเป็นต้องมี' }, 400);
    const ext = fileName.lastIndexOf('.') > 0 ? fileName.slice(fileName.lastIndexOf('.')).toLowerCase() : '';
    if (!ALLOWED_UPLOAD_EXT.includes(ext)) return json({ status: 400, message: msg('ไม่รองรับไฟล์ประเภทนี้ (รองรับ: {0})', [...ALLOWED_UPLOAD_EXT].sort().join(', ')) }, 400);
    if (fileName.includes('FAIL')) return json({ status: 500, message: 'อัปโหลดไฟล์ไม่สำเร็จ', raw: '' }, 500);
    const s = state();
    const list = attsOf(pid);
    s.nextDetail += 1;
    const attachFile = storageId === '' ? `${FILE_HOST}/${epochOf(pid, s.nextDetail)}/${fileName}` : storedRef(storageId, fileName);
    list.push({ detailOrderNo: s.nextDetail, attachFile, description: String(body['description'] ?? fileName), attachFileTypeCode: 'DOC' });
    // the file server answers 404 for it (ProspectAttachmentsServlet.verifyFailMessage of a probe that got HTTP 404)
    const verified = !fileName.includes('UNVERIFIED');
    return json({
      status: 200,
      verified,
      verifyReason: verified ? 'OK' : 'HTTP_404',
      message: verified
        ? 'success'
        : 'อัปโหลดสำเร็จ แต่ตรวจสอบไฟล์บน O2O ไม่ผ่าน — ไม่พบไฟล์ที่ file server หลังอัปโหลด (ไฟล์อาจไม่ถูกเก็บ หรือที่อยู่ไฟล์ที่ระบบหลังบ้านตอบกลับชี้ผิดที่) ไฟล์อาจดาวน์โหลด/แสดงไม่ได้ กรุณาลองใหม่หรือแจ้งผู้ดูแลระบบ [HTTP_404]',
      result: { attachFile },
    });
  }
  if (method === 'DELETE') {
    const pid = Number(q.get('prospectId') ?? 0);
    const docNo = Number(q.get('docNo') ?? -1);
    if (!(pid > 0) || docNo < 0) return json({ status: 400, message: 'prospectId และ docNo จำเป็นต้องมี' }, 400);
    const list = attsOf(pid);
    const i = list.findIndex((a) => a.detailOrderNo === docNo);
    if (i < 0) return json({ status: 404, message: 'ลบเอกสารไม่สำเร็จ: not found' }, 404);
    list.splice(i, 1);
    return json({ status: 200, message: 'success' });
  }
  return json({ status: 405, message: 'method not allowed' }, 405);
}

/* ---- DocProxy: the bytes of a file, same-origin ---- */
const PNG_1X1 = Uint8Array.from(atob('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg=='), (c) => c.charCodeAt(0));
const PDF_BYTES = new TextEncoder().encode('%PDF-1.1\n1 0 obj<</Type/Catalog/Pages 2 0 R>>endobj\n2 0 obj<</Type/Pages/Kids[3 0 R]/Count 1>>endobj\n3 0 obj<</Type/Page/Parent 2 0 R/MediaBox[0 0 200 200]>>endobj\ntrailer<</Root 1 0 R>>\n%%EOF');
const INLINE: Record<string, [string, Uint8Array]> = {
  pdf: ['application/pdf', PDF_BYTES],
  png: ['image/png', PNG_1X1],
  jpg: ['image/jpeg', PNG_1X1],
  jpeg: ['image/jpeg', PNG_1X1],
  gif: ['image/gif', PNG_1X1],
  webp: ['image/webp', PNG_1X1],
};
async function docProxy(q: URLSearchParams): Promise<Response> {
  const url = q.get('url') ?? '';
  if (!url) return new Response('MISSING_URL', { status: 400, headers: { 'X-DocProxy-Reason': 'MISSING_URL', 'Content-Type': 'text/plain; charset=UTF-8' } });
  // a file the user uploaded in the mockup: its own bytes from Storage/ (inline for a preview, `download=1` for a "save as")
  const storedId = storageIdOf(url);
  if (storedId) {
    const stored = await fetchStored(storedId, decodeURIComponent(url.slice(url.lastIndexOf('/') + 1)), q.get('download') === '1');
    if (stored) return stored;
  }
  if (url.includes('missing')) return new Response('UPSTREAM_404', { status: 502, headers: { 'X-DocProxy-Reason': 'UPSTREAM_404', 'Content-Type': 'text/plain; charset=UTF-8' } });
  const name = decodeURIComponent(url.slice(url.lastIndexOf('/') + 1));
  const ext = name.includes('.') ? name.slice(name.lastIndexOf('.') + 1).toLowerCase() : '';
  const inline = INLINE[ext];
  if (inline) return new Response(inline[1] as BodyInit, { status: 200, headers: { 'Content-Type': inline[0], 'Content-Disposition': 'inline' } });
  return new Response(new TextEncoder().encode(`mock file ${name}\n`), {
    status: 200,
    headers: { 'Content-Type': 'application/octet-stream', 'Content-Disposition': `attachment; filename*=UTF-8''${encodeURIComponent(name)}` },
  });
}

/* ---- master data (LeadBoardView.fetchMasterArrayJson & friends) ---- */
function masterAnswer(path: string, q: URLSearchParams, opts: Required<MockProspectsOptions>): Response | null {
  switch (path) {
    case '/board/chat-master-data': {
      const type = q.get('type') ?? '';
      if (type === 'marketing-channels') return json(envelope(channelNames(opts.channels).map((name, i) => ({ id: CHANNEL_BASE + i, code: `MC${pad(i + 1, 2)}`, name }))));
      if (type === 'countries') return json(envelope(COUNTRIES.map((c, i) => ({ id: COUNTRY_BASE + i, code: c.code, name: c.en, nameTh: c.th }))));
      return json({ status: 400, message: 'invalid type (marketing-channels|employees|sale-persons|branches|products)' }, 400);
    }
    case '/board/prospect-options': {
      // several sets in one call (the create-OPP window; live: GET /api/v1/prospects/options?sets=salesLines,responsibles,waitlists,salePersons): { set: [...] }
      const several = (q.get('sets') ?? '').split(',').map((x) => x.trim()).filter((x) => x !== '');
      if (several.length > 0) {
        const all: Record<string, unknown[]> = {
          salesLines: SALES_LINES,
          // `salesLineId`: the people of one sales line (here the first two)
          responsibles: SEED_EMPLOYEES.map((e, i) => ({ id: `r-${i}`, name: e.name })).slice(0, q.get('salesLineId') ? 2 : undefined),
          waitlists: WAITLISTS,
          // a sale person says which employee it is (employeeId = the id of a responsible person)
          salePersons: SEED_EMPLOYEES.map((e, i) => ({ id: 200 + i, code: `GGW-${pad(i + 1, 3)}`, name: e.name, employeeId: `r-${i}` })),
        };
        return json(Object.fromEntries(several.map((x) => [x, all[x] ?? []])));
      }
      // the selects of the filter popup (live: GET /api/v1/prospects/options): the same lists, as bare arrays
      const set = q.get('set') ?? '';
      if (set === 'provinces') return masterAnswer('/board/provinces', q, opts);
      if (set === 'districts') return masterAnswer('/board/districts', q, opts);
      if (set === 'countries') return json(COUNTRIES.map((c, i) => ({ id: COUNTRY_BASE + i, code: c.code, name: c.en, nameTh: c.th })));
      if (set === 'waitlists') return json(WAITLISTS);
      if (set === 'responsibleFilter') return json(SEED_EMPLOYEES.map((e, i) => ({ id: 200 + i, name: e.name }))); // the ids of /board/sale-persons: what the mock list filters by
      return json({ status: 400, message: 'invalid set (provinces|districts|countries|responsibleFilter)' }, 400);
    }
    case '/board/provinces':
      return json(PROVINCES.map((name, i) => ({ id: PROVINCE_BASE + i, code: `P${pad(i + 1, 2)}`, name, nameTh: name })));
    case '/board/districts': {
      const pid = Number(q.get('provinceId') ?? 0);
      const idx = pid - PROVINCE_BASE;
      if (!(idx >= 0 && idx < PROVINCES.length)) return json([]);
      return json(districtsOf(idx).map((name, k) => ({ id: DISTRICT_BASE + idx * 10 + k, code: `D${pad(k + 1, 2)}`, name })));
    }
    case '/board/sale-persons':
      return json(
        SEED_EMPLOYEES.map((e, i) => ({ id: 200 + i, code: `GGW-${pad(i + 1, 3)}`, name: e.name, employee: { id: empId(e), code: e.code, name: e.name, nameTh: e.name } })),
      );
    case '/board/employees':
      return json([ME, ...SEED_EMPLOYEES.map((e) => ({ id: empId(e), code: e.code, name: e.name }))].map((e) => ({ ...e, attachFile: '' })));
    case '/board/movement-types':
      return json(PRODUCTS.map((p) => ({ id: p.id, code: p.code, name: opts.lang === 'en' ? p.en : p.name, usesWorkflowStep: p.usesWorkflowStep })));
    case '/board/master/activity-groups': {
      const id = Number(q.get('movementTypeId') ?? 0);
      if (!id) return json({ error: 'movementTypeId required' }, 400);
      const product = PRODUCTS.find((p) => p.id === id);
      return json(envelope((product?.groups ?? []).map((gid) => SEED_GROUPS.find((g) => g.id === gid)!).map((g) => ({ id: g.id, code: g.code, name: g.name }))));
    }
    case '/board/master/employees-by-activity-group': {
      const id = Number(q.get('activityGroupId') ?? 0);
      if (!id) return json({ error: 'activityGroupId required' }, 400);
      const codes = GROUP_EMP[id] ?? [];
      const people = [...(id === 101 ? [ME] : []), ...SEED_EMPLOYEES.filter((e) => codes.includes(e.code)).map((e) => ({ id: empId(e), code: e.code, name: e.name }))];
      return json(envelope(people));
    }
  }
  return null;
}

/** the changes of the user are kept in Datasource/journal.prospects.json (mockup file server) and replayed at the next start */
export function createMockProspects(options: MockProspectsOptions = {}): ProspectsBackend {
  // an uploaded document goes to Storage/prospects/<id>/ and the journal keeps its id, not the bytes
  const prepare = base64Upload(
    (input) => /\/board\/prospect\/attachments(\?|$)/.test(input),
    (body) => `prospects/${Number(body['prospectId'] ?? 0)}`,
    (name) => !name.includes('FAIL') && ALLOWED_UPLOAD_EXT.includes(name.lastIndexOf('.') > 0 ? name.slice(name.lastIndexOf('.')).toLowerCase() : ''),
  );
  return journaledBackend('prospects', makeMockProspects, options, prepare);
}

function makeMockProspects(options: MockProspectsOptions = {}): ProspectsBackend {
  const opts: Required<MockProspectsOptions> = { delayMs: options.delayMs ?? 150, lang: options.lang ?? 'th', channels: options.channels ?? 12 };
  return {
    async initial(): Promise<ProspectsInitial> {
      await wait(0);
      return { uploadAcceptExt: UPLOAD_ACCEPT_EXT };
    },
    async fetch(input: string, init?: RequestInit): Promise<Response> {
      const url = new URL(input, 'http://mock.local');
      const q = url.searchParams;
      const method = (init?.method ?? 'GET').toUpperCase();
      await wait(opts.delayMs, init?.signal);
      if ((q.get('searchText') ?? '').trim().toUpperCase() === 'X-SLOW') await wait(3000, init?.signal);
      switch (url.pathname) {
        case '/board/prospect-status-change': {
          // draft / release / block (live: POST /prospects/{id}/status-changes): a body with X-FAIL-409 as the key answers the 409
          if (method !== 'POST') return json({ status: 405, message: 'method not allowed' }, 405);
          let body: Record<string, unknown> = {};
          try {
            body = JSON.parse(String(init?.body ?? '{}')) as Record<string, unknown>;
          } catch {
            return json({ status: 400, message: 'body required' }, 400);
          }
          if (String(body['idempotencyKey'] ?? '').includes('X-FAIL-409')) return json({ status: 409, message: 'CONFLICT', error: { code: 'CONFLICT', description: 'status changed' } }, 409);
          // releasing says who is responsible from now on
          if (body['targetStatus'] === 'RELEASE' && typeof body['assignment'] === 'object' && body['assignment'] !== null) {
            const outcome = applyProspectAssignment(Number(body['prospectId'] ?? 0), body['assignment'] as Record<string, unknown>);
            if (outcome !== 'ok') return assignmentFailure(outcome);
          }
          return json({ status: 200, result: { id: body['prospectId'], usageStatus: body['targetStatus'] } });
        }
        case '/board/prospect-trash-action': {
          // restore from the trash (live: POST /prospects/{id}/trash-actions)
          if (method !== 'POST') return json({ status: 405, message: 'method not allowed' }, 405);
          let body: Record<string, unknown> = {};
          try {
            body = JSON.parse(String(init?.body ?? '{}')) as Record<string, unknown>;
          } catch {
            return json({ status: 400, message: 'body required' }, 400);
          }
          return json({ status: 200, result: { id: body['prospectId'], action: body['action'] } });
        }
        case '/board/prospect-assign': {
          // the change of the responsible person (live: POST /prospects/{id}/assignments): a body with X-FAIL-409 as the reason answers the 409
          if (method !== 'POST') return json({ status: 405, message: 'method not allowed' }, 405);
          let body: Record<string, unknown> = {};
          try {
            body = JSON.parse(String(init?.body ?? '{}')) as Record<string, unknown>;
          } catch {
            return json({ status: 400, message: 'body required' }, 400);
          }
          if (String(body['reason'] ?? '').includes('X-FAIL-409')) return json({ status: 409, message: 'CONFLICT', error: { code: 'RESPONSIBLE_CHANGED', description: 'responsible changed' } }, 409);
          const outcome = applyProspectAssignment(Number(body['prospectId'] ?? 0), body);
          if (outcome !== 'ok') return assignmentFailure(outcome);
          return json({ status: 200, result: { id: body['prospectId'], responsible: { id: body['responsibleEmployeeId'] } } });
        }
        case '/board/prospect-list':
          return listAnswer(q, opts);
        case '/board/prospect-enrich':
          return enrichAnswer(q, opts);
        case '/board/lead-create': {
          if (method !== 'POST') return json({ status: 405, message: 'method not allowed' }, 405);
          let body: Record<string, unknown> = {};
          try {
            body = JSON.parse(String(init?.body ?? '{}')) as Record<string, unknown>;
          } catch {
            return json({ status: 400, message: 'body required' }, 400);
          }
          return leadCreate(body);
        }
        case '/board/prospect/attachments': {
          let body: Record<string, unknown> = {};
          if (method === 'POST') {
            try {
              body = JSON.parse(String(init?.body ?? '{}')) as Record<string, unknown>;
            } catch {
              return json({ status: 500, message: 'อัปโหลดเอกสารไม่สำเร็จ: bad body' }, 500);
            }
            // a file whose name has SLOW in it takes 3 s to store: the upload button stays busy
            if (String(body['fileName'] ?? '').includes('SLOW')) await wait(3000, init?.signal);
          }
          return attachments(method, q, body);
        }
        case '/docproxy':
          return docProxy(q);
      }
      return masterAnswer(url.pathname, q, opts) ?? json({ error: 'not found', path: url.pathname }, 404);
    },
  };
}
