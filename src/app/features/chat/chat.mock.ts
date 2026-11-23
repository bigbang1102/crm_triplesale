/* eslint-disable */
import { reference, msg } from '@core/mock/reference';
// FAST-DEBT(STD): ไฟล์ mock 1,100+ บรรทัด ใช้ `any` / `as any` และปิด eslint ทั้งไฟล์ (ละเมิดขนาดไฟล์ ≤ ~400 และห้าม any) · ตั้งใจคงไว้เพราะ harness tools/compare นำเข้าไฟล์เดียวกัน · เมื่อแตะให้แยกเป็นโมดูลย่อยและใส่ type · somyot · 2026-11-19
/**
 * Fake backend for the Chat screen — served when `mock: true` (npm start) and by the unit tests.
 *
 * It answers every call the page script makes, with the same JSON shapes as the real services:
 *   <ctx>/chat-api/api/v1/*       triple_sale_chat      (conversations, messages, chatbot, chat-channels, KB, quick messages …)
 *   <ctx>/board/*                 BFF servlets          (prospect, prospect-leads, employees, chat-master-data, chat-prospect-create)
 *   <ctx>/ai-api/api/analytics/*  CHAT_BOT service      (customer analytics, topics, insight, ask)
 * and a fake Socket.IO client (`mockChatSocket`) so the realtime code path runs too.
 *
 * Standalone on purpose (no Angular imports, only erasable TypeScript): the Node harness that compares this screen with
 * the Java one imports this very file, so both pages are fed identical data. Its lists (`reference('chat.…')`, core/mock/reference.ts) and its
 * rooms / messages (`chat.state`) come from the shared Datasource (`ref.chat.json`) when it has them, else from the formulas here.
 * Set `globalThis.__CHAT_MOCK_NOW` (ISO string) to freeze the clock the sample data is laid out against.
 */

export interface MockSession {
  employeeId: string;
  branchId: string;
}

type Json = any;

/* ─────────────────────────────────────────────────────────────── helpers */
const MIN = 60_000;
const nowMs = (): number => {
  const frozen = (globalThis as any).__CHAT_MOCK_NOW;
  return frozen ? Date.parse(frozen) : Date.now();
};
const iso = (ms: number): string => new Date(ms).toISOString();

function res(body: Json, status = 200): Response {
  return new Response(body === undefined ? null : JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}
const ok = (result: Json, meta?: Json): Response => res(meta ? { result, meta } : { result });
const fail = (status: number, message: string): Response => res({ status, error: { message } }, status);

/** a small inline avatar so the screen needs no network for pictures */
function avatar(letter: string, bg: string): string {
  const svg =
    `<svg xmlns='http://www.w3.org/2000/svg' width='96' height='96'><rect width='96' height='96' fill='${bg}'/>` +
    `<text x='48' y='62' font-family='Arial' font-size='44' fill='white' text-anchor='middle'>${letter}</text></svg>`;
  return 'data:image/svg+xml;utf8,' + encodeURIComponent(svg);
}
function photo(label: string, a: string, b: string): string {
  const svg =
    `<svg xmlns='http://www.w3.org/2000/svg' width='480' height='320'><defs><linearGradient id='g' x1='0' y1='0' x2='1' y2='1'>` +
    `<stop offset='0' stop-color='${a}'/><stop offset='1' stop-color='${b}'/></linearGradient></defs><rect width='480' height='320' fill='url(#g)'/>` +
    `<text x='240' y='170' font-family='Arial' font-size='30' fill='white' text-anchor='middle'>${label}</text></svg>`;
  return 'data:image/svg+xml;utf8,' + encodeURIComponent(svg);
}

/* ─────────────────────────────────────────────────────────────── reference data */
const BRANCHES = reference('chat.branches', [
  { id: 1, code: 'GGW-BKK', name: 'สำนักงานใหญ่ กรุงเทพฯ' },
  { id: 2, code: 'GGW-CNX', name: 'สาขาเชียงใหม่' },
]);

const EMPLOYEES = reference('chat.employees', [
  { id: 1001, code: 'EMP-1001', name: 'สมชาย ใจดี' },
  { id: 1002, code: 'EMP-1002', name: 'วิภา รักงาน' },
  { id: 1003, code: 'EMP-1003', name: 'ประเสริฐ มั่นคง' },
  { id: 1004, code: 'EMP-1004', name: 'Napat Sales' },
]);

interface Channel {
  id: number;
  channelType: string;
  pageId: string;
  displayName: string;
  pictureUrl: string;
  botBasicId: string;
  isActive: boolean;
  chatbotEnabled: boolean;
  ggwBranchId: number;
  ggwBranchCode: string;
  ggwBranchName: string;
  hasChannelSecret: boolean;
  hasAccessToken: boolean;
  hasRefreshToken: boolean;
  chatMode: string;
  markAsReadMode: string;
  appId: string;
  channelSecret: string;
  accessToken: string;
  refreshToken: string;
}

function channel(id: number, type: string, pageId: string, name: string, basic: string, branch: number, bot: boolean, pic: string): Channel {
  const b = BRANCHES.find((x) => x.id === branch)!;
  return {
    id,
    channelType: type,
    pageId,
    displayName: name,
    pictureUrl: pic,
    botBasicId: basic,
    isActive: true,
    chatbotEnabled: bot,
    ggwBranchId: b.id,
    ggwBranchCode: b.code,
    ggwBranchName: b.name,
    hasChannelSecret: type === 'LINE' || type === 'TIKTOK',
    hasAccessToken: true,
    hasRefreshToken: type === 'TIKTOK',
    chatMode: type === 'LINE' ? 'bot' : '',
    markAsReadMode: type === 'LINE' ? 'manual' : '',
    appId: type === 'TIKTOK' ? 'aw8x6mock1appid' : '',
    channelSecret: type === 'LINE' || type === 'TIKTOK' ? 'mock-channel-secret-' + id : '',
    accessToken: 'mock-access-token-' + id,
    refreshToken: type === 'TIKTOK' ? 'mock-refresh-token-' + id : '',
  };
}

interface Prospect {
  id: number;
  code: string;
  name: string;
  customerTel: string;
  sex: string;
  convenientTime: string;
  convenient: string;
  currentAddress: string;
  currentCityName: string;
  prospectEmail: string;
  prospectLine: string;
  prospectFacebook: string;
  prospectTwitter: string;
  prospectInstagram: string;
  customerType: string;
  marketingChanelName: string;
  createBy: string;
}

const PROSPECTS: Prospect[] = reference('chat.prospects', [
  {
    id: 501,
    code: 'CUS-000501',
    name: 'กัญญารัตน์ วงศ์สกุล',
    customerTel: '081-234-5678',
    sex: '2',
    convenientTime: '09:00 - 12:00',
    convenient: 'LINE',
    currentAddress: '88/12 ถ.สุขุมวิท แขวงคลองเตย เขตคลองเตย',
    currentCityName: 'กรุงเทพมหานคร',
    prospectEmail: 'kanyarat.w@example.com',
    prospectLine: 'kanyarat.w',
    prospectFacebook: 'kanyarat.wongsakul',
    prospectTwitter: '',
    prospectInstagram: 'kanyarat.w',
    customerType: 'person',
    marketingChanelName: 'Facebook Ads',
    createBy: 'สมชาย ใจดี',
  },
  {
    id: 502,
    code: 'CUS-000502',
    name: 'ณัฐพงษ์ พรหมมา',
    customerTel: '089-876-5432',
    sex: '1',
    convenientTime: '13:00 - 17:00',
    convenient: 'Facebook',
    currentAddress: '14 ม.3 ต.หนองหอย อ.เมือง',
    currentCityName: 'เชียงใหม่',
    prospectEmail: 'nattapong.p@example.com',
    prospectLine: '',
    prospectFacebook: 'nattapong.prommma',
    prospectTwitter: '',
    prospectInstagram: '',
    customerType: 'person',
    marketingChanelName: 'Walk-in',
    createBy: 'วิภา รักงาน',
  },
  {
    id: 503,
    code: 'CUS-000503',
    name: 'บริษัท ธนวัฒน์ เทรดดิ้ง จำกัด',
    customerTel: '02-123-4567',
    sex: '',
    convenientTime: '',
    convenient: 'โทรศัพท์',
    currentAddress: '99 อาคารสยามทาวเวอร์ ชั้น 12 ถ.พระรามที่ 1',
    currentCityName: 'กรุงเทพมหานคร',
    prospectEmail: 'sales@thanawat-trading.example.com',
    prospectLine: '',
    prospectFacebook: '',
    prospectTwitter: 'thanawat_trade',
    prospectInstagram: '',
    customerType: 'company',
    marketingChanelName: 'แนะนำต่อ',
    createBy: 'ประเสริฐ มั่นคง',
  },
]);
/** customers without a chat room yet — shown in the "link a customer" list */
const EXTRA_CONTACTS = reference('chat.extraContacts', [
  { prospectId: 504, code: 'CUS-000504', name: 'อรุณี ศรีสุข', tel: '086-111-2222', linkedCount: 0 },
  { prospectId: 505, code: 'CUS-000505', name: 'Michael Brown', tel: '092-333-4444', linkedCount: 1 },
  { prospectId: 506, code: 'CUS-000506', name: 'ปรีชา ทองดี', tel: '064-555-6666', linkedCount: 0 },
]);
const LEADS: Record<number, Json[]> = reference('chat.leads', {
  501: [
    { id: 9001, txNo: 'LD-2026-000912', txDate: '12/10/2026', movementTypeName: 'ประกันภัยรถยนต์', employeeName: 'สมชาย ใจดี', activeStatus: 'HOT' },
    { id: 9002, txNo: 'LD-2026-000655', txDate: '02/08/2026', movementTypeName: 'ประกันสุขภาพ', employeeName: 'วิภา รักงาน', activeStatus: 'COLD' },
  ],
  502: [{ id: 9003, txNo: 'LD-2026-000870', txDate: '28/09/2026', movementTypeName: 'สินเชื่อทะเบียนรถ', employeeName: 'ประเสริฐ มั่นคง', activeStatus: 'WARM' }],
  503: [],
});

/* ─────────────────────────────────────────────────────────────── state */
interface Msg {
  id: number;
  conversationId: number;
  direction: 'IN' | 'OUT';
  msgType: string;
  body: string;
  attachments: Json;
  sentAt: string;
  createdAt: string;
  deliveryStatus: string;
  providerMessageId: string | null;
  senderType: string | null;
  senderUsername: string | null;
  senderEmployeeId: string | null;
  senderName: string | null;
  meta: Json;
}
interface Conv {
  id: number;
  channelType: string;
  pageId: string;
  userId: string;
  profileName: string;
  profileImage: string | null;
  prospectId: number | null;
  status: 'OPEN' | 'CLOSED';
  unreadCount: number;
  starred: boolean;
  location: string;
  contactEmail: string;
  contactPhone: string;
  note: string;
  botOverride: boolean | null;
  /** the profile name was typed by an agent (not the one the provider sent); `providerProfileName` = the name before the edit */
  profileNameManual?: boolean;
  providerProfileName?: string;
  messages: Msg[];
}
interface State {
  channels: Channel[];
  convs: Conv[];
  nextMsgId: number;
  nextChannelId: number;
  nextProspectId: number;
  nextKbId: number;
  nextQmId: number;
  botGlobal: boolean;
  switches: { scope: string; scopeKey: string; label: string; enabled: boolean; channels: number | null }[];
  access: Record<number, { employeeId: string; employeeCode: string; employeeName: string }[]>;
  kb: { id: number; type: string; name: string; description: string; active: boolean; channelId: number; branchId: number }[];
  qm: { id: number; branchId: number; title: string; message: string; active: boolean }[];
  prospects: Prospect[];
}

let state: State | null = null;
let socketHub: FakeSocket[] = [];

function txt(c: Conv, dir: 'IN' | 'OUT', minsAgo: number, body: string, extra: Partial<Msg> = {}): void {
  const at = iso(nowMs() - minsAgo * MIN);
  const s = state!;
  const m: Msg = {
    id: s.nextMsgId++,
    conversationId: c.id,
    direction: dir,
    msgType: 'TEXT',
    body,
    attachments: null,
    sentAt: at,
    createdAt: at,
    deliveryStatus: 'SENT',
    providerMessageId: 'prov-' + c.id + '-' + s.nextMsgId,
    senderType: dir === 'OUT' ? 'AGENT' : null,
    senderUsername: dir === 'OUT' ? 'demo' : null,
    senderEmployeeId: dir === 'OUT' ? '1001' : null,
    senderName: dir === 'OUT' ? 'สมชาย ใจดี' : null,
    meta: null,
    ...extra,
  };
  c.messages.push(m);
}

/** the sample state as the formulas below make it (the fallback, and what `registerReferenceLists` writes out as the document) */
function buildFromFormulas(): State {
  const s: State = {
    channels: [
      channel(1, 'LINE', 'U0a1b2c3d4e5f60718293a4b5c6d7e8f9', 'Triple Sale (สำนักงานใหญ่)', '@triplesale', 1, true, avatar('T', '#00B900')),
      channel(2, 'LINE', 'U9f8e7d6c5b4a39281706f5e4d3c2b1a0', 'Triple Sale เชียงใหม่', '@ts-chiangmai', 2, false, avatar('C', '#06C755')),
      channel(3, 'FACEBOOK', '104938475601234', 'Triple Sale Shop', '', 1, true, avatar('F', '#1877F2')),
      channel(4, 'INSTAGRAM', '17841405309211844', 'triplesale.th', '', 1, false, avatar('I', '#E1306C')),
      channel(5, 'WHATSAPP', '66812345678', 'Triple Sale TH (WhatsApp)', '', 2, false, avatar('W', '#25D366')),
      channel(6, 'TIKTOK', 'tt-7123456789012345678', 'triplesale_official', '', 1, false, avatar('K', '#010101')),
    ],
    convs: [],
    nextMsgId: 100000,
    nextChannelId: 7,
    nextProspectId: 600,
    nextKbId: 1,
    nextQmId: 1,
    botGlobal: true,
    switches: [
      { scope: 'BRANCH', scopeKey: '1', label: 'สำนักงานใหญ่ กรุงเทพฯ', enabled: true, channels: 3 },
      { scope: 'BRANCH', scopeKey: '2', label: 'สาขาเชียงใหม่', enabled: true, channels: 2 },
      { scope: 'PLATFORM', scopeKey: 'LINE', label: 'LINE', enabled: true, channels: 2 },
      { scope: 'PLATFORM', scopeKey: 'FACEBOOK', label: 'Facebook', enabled: true, channels: 1 },
    ],
    access: { 1: [{ employeeId: '1002', employeeCode: 'EMP-1002', employeeName: 'วิภา รักงาน' }] },
    kb: [],
    qm: [],
    prospects: PROSPECTS.map((p) => ({ ...p })),
  };
  state = s;

  const P = (i: number) => s.channels[i].pageId;
  const mk = (
    id: number, type: string, ch: number, name: string, user: string, unread: number, star: boolean, prospect: number | null,
    img: string | null, status: 'OPEN' | 'CLOSED' = 'OPEN',
  ): Conv => {
    const c: Conv = {
      id, channelType: type, pageId: P(ch), userId: user, profileName: name, profileImage: img, prospectId: prospect, status,
      unreadCount: unread, starred: star, location: '', contactEmail: '', contactPhone: '', note: '', botOverride: null, messages: [],
    };
    s.convs.push(c);
    return c;
  };

  // 1 — LINE, linked customer, long history (older messages load page by page), every message type
  const c1 = mk(1, 'LINE', 0, 'Kanyarat W.', 'U1111aaaa', 2, true, 501, avatar('K', '#6366F1'));
  for (let i = 0; i < 40; i++) {
    const m = 400 - i * 7;
    txt(c1, i % 2 === 0 ? 'IN' : 'OUT', m, i % 2 === 0 ? msg('สอบถามรายละเอียดแพ็กเกจข้อที่ {0} หน่อยค่ะ', i / 2 + 1) : msg('ได้เลยค่ะ ข้อที่ {0} มีรายละเอียดดังนี้ค่ะ', (i - 1) / 2 + 1));
  }
  txt(c1, 'IN', 120, 'สวัสดีค่ะ สนใจประกันรถยนต์ชั้น 1 ค่ะ');
  txt(c1, 'OUT', 118, 'สวัสดีค่ะ ยินดีให้บริการค่ะ รบกวนขอยี่ห้อ รุ่น และปีรถด้วยนะคะ', { senderType: 'BOT', senderEmployeeId: null, senderUsername: null, senderName: null });
  txt(c1, 'IN', 60, 'Toyota Yaris ปี 2022 ค่ะ');
  c1.messages.push({
    ...c1.messages[0], id: s.nextMsgId++, direction: 'IN', msgType: 'IMAGE', body: '',
    attachments: { originalContentUrl: photo('เล่มทะเบียน', '#0EA5E9', '#6366F1'), productName: '' },
    sentAt: iso(nowMs() - 58 * MIN), createdAt: iso(nowMs() - 58 * MIN), senderType: null, senderUsername: null, senderEmployeeId: null, senderName: null,
  });
  txt(c1, 'OUT', 55, 'ได้รับเล่มทะเบียนแล้วค่ะ กำลังคำนวณเบี้ยให้นะคะ');
  txt(c1, 'OUT', 50, 'ลูกค้ารายนี้สนใจชั้น 1 งบไม่เกิน 18,000 — โทรกลับ 16.00 น.', { meta: { internal: true } });
  c1.messages.push({
    ...c1.messages[0], id: s.nextMsgId++, direction: 'IN', msgType: 'STICKER', body: '',
    attachments: { packageId: '11537', stickerId: '52002734' }, sentAt: iso(nowMs() - 20 * MIN), createdAt: iso(nowMs() - 20 * MIN),
    senderType: null, senderUsername: null, senderEmployeeId: null, senderName: null,
  });
  txt(c1, 'IN', 6, 'ขอใบเสนอราคาด้วยนะคะ');
  txt(c1, 'IN', 2, 'แล้วถ้าผ่อน 0% ได้กี่เดือนคะ');

  // 2 — Facebook, linked
  const c2 = mk(2, 'FACEBOOK', 2, 'Nattapong P.', 'fb-2222bbbb', 1, false, 502, avatar('N', '#1877F2'));
  txt(c2, 'IN', 95, 'สวัสดีครับ อยากสมัครสินเชื่อทะเบียนรถครับ');
  txt(c2, 'OUT', 90, 'ยินดีค่ะ ขอทราบวงเงินที่ต้องการนะคะ');
  txt(c2, 'IN', 30, 'ประมาณ 200,000 ครับ');
  txt(c2, 'IN', 28, 'สั่งสินค้าไปยังบ้านครับ');

  // 3 — Instagram, not linked
  const c3 = mk(3, 'INSTAGRAM', 3, 'jiratchaya.official', 'ig-3333cccc', 3, false, null, null);
  txt(c3, 'IN', 70, 'สวัสดีค่ะ');
  txt(c3, 'IN', 66, 'ขอดูสีอื่นได้ไหมคะ');
  txt(c3, 'IN', 25, 'รบกวนตอบด้วยนะคะ');

  // 4 — LINE, last message is a sticker from the customer
  const c4 = mk(4, 'LINE', 0, 'สมหญิง ท.', 'U4444dddd', 0, false, null, avatar('ส', '#EC4899'));
  txt(c4, 'IN', 300, 'มีสินค้าใหม่อะไรบ้างคะ');
  txt(c4, 'OUT', 295, 'มีแพ็กเกจใหม่ 3 รายการค่ะ ส่งรายละเอียดให้ทางไลน์นะคะ');
  c4.messages.push({
    ...c4.messages[0], id: s.nextMsgId++, direction: 'IN', msgType: 'STICKER', body: '', attachments: { packageId: '11537', stickerId: '52002740' },
    sentAt: iso(nowMs() - 150 * MIN), createdAt: iso(nowMs() - 150 * MIN), senderType: null, senderUsername: null, senderEmployeeId: null, senderName: null,
  });

  // 5 — WhatsApp, last message is an image we sent
  const c5 = mk(5, 'WHATSAPP', 4, 'Kevin Lee', 'wa-5555eeee', 0, false, null, null);
  txt(c5, 'IN', 600, 'Do you ship internationally?');
  txt(c5, 'OUT', 590, 'Yes, we ship worldwide. Here is our rate card.');
  c5.messages.push({
    ...c5.messages[0], id: s.nextMsgId++, direction: 'OUT', msgType: 'IMAGE', body: '',
    attachments: { originalContentUrl: photo('Rate card', '#F59E0B', '#EF4444'), productName: 'Rate card 2026' },
    sentAt: iso(nowMs() - 588 * MIN), createdAt: iso(nowMs() - 588 * MIN), senderType: 'AGENT', senderUsername: 'demo', senderEmployeeId: '1001', senderName: 'สมชาย ใจดี',
  });

  // 6 — LINE Chiang Mai, linked company, unread 4
  const c6 = mk(6, 'LINE', 1, 'ธนวัฒน์ ส.', 'U6666ffff', 4, false, 503, avatar('ธ', '#0C8E6A'));
  txt(c6, 'IN', 45, 'รบกวนสอบถามเรื่องส่วนลดครับ');
  txt(c6, 'IN', 44, 'ถ้าซื้อ 10 ชุดได้ส่วนลดเท่าไหร่ครับ');
  txt(c6, 'IN', 43, 'ขอเป็นใบกำกับภาษีเต็มรูปแบบด้วยครับ');
  txt(c6, 'IN', 42, 'เมื่อไหร่จะได้รับใบเสนอราคาครับ');

  // 7 — Facebook, last message is a file
  const c7 = mk(7, 'FACEBOOK', 2, 'Pimchanok S.', 'fb-7777aaaa', 0, false, null, avatar('P', '#8B5CF6'));
  txt(c7, 'IN', 400, 'ต้องการใบกำกับภาษีคะ');
  c7.messages.push({
    ...c7.messages[0], id: s.nextMsgId++, direction: 'OUT', msgType: 'FILE', body: '',
    attachments: { fileName: 'ใบกำกับภาษี-2026-0412.pdf', fileSize: 183_450, url: '' },
    sentAt: iso(nowMs() - 380 * MIN), createdAt: iso(nowMs() - 380 * MIN), senderType: 'AGENT', senderUsername: 'demo', senderEmployeeId: '1002', senderName: 'วิภา รักงาน',
  });

  // 8 — LINE, resolved
  const c8 = mk(8, 'LINE', 0, 'Aung Aung', 'U8888bbbb', 0, false, null, null, 'CLOSED');
  txt(c8, 'IN', 1500, 'How much is the shipping?');
  txt(c8, 'OUT', 1490, 'Shipping is free for orders above 1,000 THB.');

  // 9 — Instagram
  const c9 = mk(9, 'INSTAGRAM', 3, 'nicha.w', 'ig-9999dddd', 1, false, null, avatar('N', '#F97316'));
  txt(c9, 'IN', 200, 'เมื่อไหร่จะมีโปรโมชั่นอีกคะ');

  // 10 — LINE Chiang Mai, last message is a location from the customer
  const c10 = mk(10, 'LINE', 1, 'พิชญา ก.', 'U1010eeee', 0, false, null, null);
  txt(c10, 'IN', 520, 'ราคาส่งเท่าไหร่คะ');
  txt(c10, 'OUT', 510, 'รบกวนแจ้งจำนวนที่ต้องการนะคะ');
  c10.messages.push({
    ...c10.messages[0], id: s.nextMsgId++, direction: 'IN', msgType: 'LOCATION', body: '',
    attachments: { title: 'ร้านกาแฟต้นไม้', address: '12 ถ.นิมมานเหมินท์ เชียงใหม่', latitude: 18.8, longitude: 98.97 },
    sentAt: iso(nowMs() - 505 * MIN), createdAt: iso(nowMs() - 505 * MIN), senderType: null, senderUsername: null, senderEmployeeId: null, senderName: null,
  });

  // 11-24 — fillers so the list needs a second page (LIST_PER = 20)
  const names = reference('chat.fillerNames', ['Somchai K.', 'ลลิตา ม.', 'Pailin R.', 'อนุชา ม.', 'Chayanin T.', 'วีระ น.', 'Mali S.', 'ชนากานต์ ว.', 'Peter Parker', 'ศศิธร พ.', 'Daniel K.', 'นภัสสร ว.', 'Tanaka H.', 'รุ่งนภา อ.']);
  const types = [['LINE', 0], ['FACEBOOK', 2], ['INSTAGRAM', 3], ['LINE', 1], ['WHATSAPP', 4]] as const;
  names.forEach((n, i) => {
    const [t, ch] = types[i % types.length];
    const c = mk(11 + i, t, ch, n, `Ufill${i}`, i % 5 === 0 ? 1 : 0, i % 7 === 3, null, i % 3 === 0 ? avatar(n.charAt(0), '#64748B') : null);
    txt(c, 'IN', 700 + i * 40, i % 2 ? 'สอบถามราคาหน่อยค่ะ' : 'Hello, is this still available?');
    if (i % 2 === 0) txt(c, 'OUT', 690 + i * 40, 'ยินดีให้บริการค่ะ');
  });

  // knowledge base (chat_ai_company) and quick messages, per branch
  const addKb = (type: string, name: string, description: string, channelId: number, branchId: number, active = true) =>
    s.kb.push({ id: s.nextKbId++, type, name, description, active, channelId, branchId });
  addKb('PROFILE', 'ชื่อกิจการ', 'Triple Sale ให้บริการประกันภัยและสินเชื่อ ดูแลลูกค้าด้วยทีมที่ปรึกษามืออาชีพ', 0, 1);
  addKb('PROFILE', 'เวลาทำการ', 'จันทร์–ศุกร์ 09:00–18:00 น. เสาร์ 09:00–13:00 น.', 0, 1);
  addKb('PROFILE', 'โปรโมชันประจำเดือน', 'ผ่อน 0% นาน 10 เดือน {{เงื่อนไข}}', 1, 1);
  addKb('RULE', 'ห้ามรับปากอนุมัติ', 'ห้ามยืนยันการอนุมัติสินเชื่อหรือเบี้ยประกันที่แน่นอน ให้นัดพนักงานโทรกลับ', 0, 1);
  addKb('RULE', 'ลูกค้าถามราคา', 'ถามยี่ห้อ รุ่น ปีรถ ก่อนเสนอราคา', 0, 1, false);
  addKb('PROFILE', 'เวลาทำการ', 'จันทร์–เสาร์ 08:30–17:30 น.', 0, 2);
  const addQm = (branchId: number, title: string, message: string, active = true) => s.qm.push({ id: s.nextQmId++, branchId, title, message, active });
  addQm(1, 'ทักทาย', 'สวัสดีค่ะ ยินดีให้บริการค่ะ มีอะไรให้ช่วยดูแลไหมคะ');
  addQm(1, 'ขอข้อมูลรถ', 'รบกวนขอยี่ห้อ รุ่น และปีรถของลูกค้าด้วยนะคะ');
  addQm(1, '', 'ขอบคุณที่ติดต่อมานะคะ หากมีข้อสงสัยเพิ่มเติมทักมาได้ตลอดเลยค่ะ');
  addQm(1, 'ปิดการขายเก่า', 'ข้อความนี้ถูกปิดใช้งาน', false);
  addQm(2, 'ทักทาย', 'สวัสดีค่ะ สาขาเชียงใหม่ยินดีให้บริการค่ะ');
  return s;
}

/**
 * The channels, the chat rooms with their messages, the switches, the access list, the knowledge base and the quick messages as one list of the
 * shared Datasource (`ref.chat.json` › `state`): the messages hold `minsAgo` (how long before "now" they were sent) instead of a clock, so the sample
 * conversations always look fresh. The ids of the messages are given again in the order of the list.
 */
function snapshotOf(s: State): Json {
  const now = nowMs();
  return {
    botGlobal: s.botGlobal,
    channels: s.channels,
    switches: s.switches,
    access: s.access,
    kb: s.kb,
    qm: s.qm,
    convs: s.convs.map((c) => ({ ...c, messages: c.messages.map(({ id: _id, conversationId: _conv, sentAt, createdAt: _created, ...m }) => ({ ...m, minsAgo: Math.round((now - Date.parse(sentAt)) / MIN) })) })),
  };
}

function stateFromSnapshot(d: Json): State {
  const now = nowMs();
  const s: State = {
    channels: d.channels,
    convs: [],
    nextMsgId: 100000,
    nextChannelId: Math.max(0, ...d.channels.map((c: Channel) => c.id)) + 1,
    nextProspectId: 600,
    nextKbId: Math.max(0, ...d.kb.map((k: { id: number }) => k.id)) + 1,
    nextQmId: Math.max(0, ...d.qm.map((q: { id: number }) => q.id)) + 1,
    botGlobal: d.botGlobal,
    switches: d.switches,
    access: d.access,
    kb: d.kb,
    qm: d.qm,
    prospects: PROSPECTS.map((p) => ({ ...p })),
  };
  for (const conv of d.convs) {
    const { messages, ...c } = conv;
    const out: Conv = { ...c, messages: [] };
    for (const { minsAgo, ...m } of messages) {
      const at = iso(now - minsAgo * MIN);
      out.messages.push({ ...m, id: s.nextMsgId++, conversationId: out.id, sentAt: at, createdAt: at });
    }
    s.convs.push(out);
  }
  return s;
}

function build(): State {
  const formulas = buildFromFormulas();
  const snapshot = snapshotOf(formulas);
  const data = reference('chat.state', snapshot);
  if (data === snapshot) return formulas;
  state = stateFromSnapshot(data);
  return state;
}

/** asks for every list once, so the export of the Datasource documents (tools/mockup-export-seed.mjs) can write them */
export const registerReferenceLists = (): void => {
  resetMockChat();
  S();
  resetMockChat();
};

export function resetMockChat(): void {
  state = null;
  socketHub = [];
}
const S = (): State => state ?? build();

/* ─────────────────────────────────────────────────────────────── response mappers */
const provName = (s: State, c: Conv): string => s.channels.find((x) => x.pageId === c.pageId)?.displayName ?? c.pageId;
function lastOf(c: Conv): Msg | undefined {
  return c.messages.length ? c.messages.reduce((a, b) => (Date.parse(b.sentAt) >= Date.parse(a.sentAt) ? b : a)) : undefined;
}
function previewOf(m: Msg | undefined): string {
  if (!m) return '';
  if (m.msgType === 'TEXT') return (m.meta?.internal ? '📝 ' : '') + m.body;
  const kind: Record<string, string> = { STICKER: '[สติกเกอร์]', IMAGE: '[รูปภาพ]', VIDEO: '[วิดีโอ]', AUDIO: '[เสียง]', FILE: '[ไฟล์]', LOCATION: '[ตำแหน่งที่ตั้ง]' };
  return kind[m.msgType] ?? '';
}
function convOut(s: State, c: Conv): Json {
  const last = lastOf(c);
  const p = c.prospectId ? s.prospects.find((x) => x.id === c.prospectId) : undefined;
  return {
    id: c.id,
    channelType: c.channelType,
    pageId: c.pageId,
    userId: c.userId,
    profileName: c.profileName,
    profileImage: c.profileImage,
    prospectName: p?.name ?? null,
    prospectCode: p?.code ?? null,
    lastMessageType: last?.msgType ?? null,
    lastMessageDirection: last?.direction ?? null,
    lastMessageAt: last?.sentAt ?? null,
    lastMessagePreview: previewOf(last),
    unreadCount: c.unreadCount,
    status: c.status,
    starred: c.starred,
    location: c.location || null,
    contactEmail: c.contactEmail || null,
    contactPhone: p?.customerTel ?? (c.contactPhone || null),
    note: c.note || null,
    profileNameManual: !!c.profileNameManual,
    providerProfileName: c.providerProfileName ?? null,
  };
}
function msgOut(m: Msg): Json {
  return { ...m };
}

/* ─────────────────────────────────────────────────────────────── analytics */
/** the short names of the months on the purchase trend of the analysis */
const THAI_MONTHS = reference('chat.thaiMonths', ['ม.ค.', 'ก.พ.', 'มี.ค.', 'เม.ย.', 'พ.ค.', 'มิ.ย.', 'ก.ค.', 'ส.ค.', 'ก.ย.', 'ต.ค.', 'พ.ย.', 'ธ.ค.']);
/**
 * The sample figures of the analysis of a customer (`ref.chat.json` › `analyticsSample` of the shared Datasource when it has them). A room linked to a
 * customer shows the `linked` figures, a room not linked the `new` ones; `daysAgo` is counted back from "now" so the room always looks fresh.
 * The level (VIP / GOLD / SILVER by customer 501 / 502 / the others, NEW when not linked) picks its label and overall score from `levels`.
 */
interface PurchaseSample {
  totalAmount: number;
  orderCount: number;
  itemCount: number;
  avgPerOrder: number;
  maxOrderAmount: number;
  daysSinceLastPurchase: number | null;
  avgDaysBetweenOrders: number | null;
  ordersPerMonth: number | null;
  trend: string;
  trendPercent: number;
  topProducts: Array<Record<string, unknown>>;
  recentOrders: Array<{ daysAgo: number; txNo: string; mainProduct: string; items: number; amount: number }>;
}
interface AnalyticsSample {
  purchase: { linked: PurchaseSample; new: PurchaseSample };
  interestedCategories: Array<{ word: string; count: number }>;
  topKeywords: Array<{ word: string; count: number }>;
  levels: Record<string, { label: string; overall: number }>;
  /** the notes of the score: the value and the note for a linked / a new customer (`noteNew` '' = the same note) */
  scoreNotes: Array<{ label: string; radarLabel: string; linked: number; new: number; note: string; noteNew: string }>;
  segments: { linked: Array<{ label: string; tone: string; reason: string }>; new: Array<{ label: string; tone: string; reason: string }> };
  categoryMix: Array<{ label: string; amount: number }>;
  purchaseTrend: { amounts: number[]; orders: number[] };
  chatActivity: Array<{ hour: number; count: number }>;
  orderGapHistogram: Array<{ label: string; count: number }>;
  interestTimeline: Array<{ label: string; messages: number; priceAsks: number }>;
}
const ANALYTICS_SAMPLE = reference<AnalyticsSample>('chat.analyticsSample', {
  purchase: {
    linked: {
      totalAmount: 66000, orderCount: 6, itemCount: 11, avgPerOrder: 11000, maxOrderAmount: 25200,
      daysSinceLastPurchase: 21, avgDaysBetweenOrders: 38, ordersPerMonth: 0.8, trend: 'UP', trendPercent: 24,
      topProducts: [
        { name: 'ประกันรถยนต์ชั้น 1', category: 'ประกันภัย', orders: 3, amount: 42000 },
        { name: 'พ.ร.บ. รถยนต์', category: 'ประกันภัย', orders: 2, amount: 6000 },
        { name: 'ประกันอุบัติเหตุส่วนบุคคล', category: 'ประกันภัย', orders: 1, amount: 18000 },
      ],
      recentOrders: [
        { daysAgo: 21, txNo: 'INV-2026-004112', mainProduct: 'ประกันรถยนต์ชั้น 1', items: 2, amount: 25200 },
        { daysAgo: 75, txNo: 'INV-2026-002871', mainProduct: 'พ.ร.บ. รถยนต์', items: 1, amount: 9600 },
      ],
    },
    new: {
      totalAmount: 0, orderCount: 0, itemCount: 0, avgPerOrder: 0, maxOrderAmount: 0,
      daysSinceLastPurchase: null, avgDaysBetweenOrders: null, ordersPerMonth: null, trend: 'FLAT', trendPercent: 0,
      topProducts: [], recentOrders: [],
    },
  },
  interestedCategories: [{ word: 'ประกันภัย', count: 7 }, { word: 'สินเชื่อ', count: 3 }],
  topKeywords: [{ word: 'ราคา', count: 5 }, { word: 'ผ่อน', count: 3 }, { word: 'ใบเสนอราคา', count: 2 }],
  levels: {
    VIP: { label: 'ลูกค้า VIP', overall: 86 },
    GOLD: { label: 'ลูกค้าระดับทอง', overall: 71 },
    SILVER: { label: 'ลูกค้าระดับเงิน', overall: 54 },
    BRONZE: { label: 'ลูกค้าระดับทองแดง', overall: 40 },
    NEW: { label: 'ลูกค้าใหม่', overall: 18 },
  },
  scoreNotes: [
    { label: 'มูลค่าการซื้อ', radarLabel: 'มูลค่า', linked: 82, new: 5, note: 'ยอดสะสม 66,000 บาท', noteNew: 'ยังไม่มีประวัติซื้อ' },
    { label: 'ความถี่', radarLabel: 'ความถี่', linked: 64, new: 10, note: 'ซื้อซ้ำทุก 38 วัน', noteNew: '' },
    { label: 'ความสดใหม่', radarLabel: 'ความสดใหม่', linked: 92, new: 20, note: 'ซื้อล่าสุด 21 วันก่อน', noteNew: '' },
    { label: 'การมีส่วนร่วมในแชท', radarLabel: 'แชท', linked: 78, new: 78, note: 'ตอบกลับภายใน 5 นาที', noteNew: '' },
    { label: 'ความสนใจซื้อ', radarLabel: 'ความสนใจ', linked: 70, new: 44, note: 'ถามราคาและเงื่อนไขผ่อน', noteNew: '' },
  ],
  segments: {
    linked: [{ label: 'ซื้อซ้ำ', tone: 'green', reason: 'ซื้อมากกว่า 3 ครั้ง' }, { label: 'ชอบผ่อน', tone: 'orange', reason: 'ถามผ่อน 0% บ่อย' }, { label: 'VIP', tone: 'gold', reason: 'ยอดสะสมสูง' }],
    new: [{ label: 'ลูกค้าใหม่', tone: 'blue', reason: 'ยังไม่เคยซื้อ' }],
  },
  categoryMix: [{ label: 'ประกันภัย', amount: 48000 }, { label: 'พ.ร.บ.', amount: 12000 }, { label: 'อื่น ๆ', amount: 6000 }],
  purchaseTrend: { amounts: [0, 12800, 0, 18400, 9600, 25200], orders: [0, 1, 0, 2, 1, 2] },
  chatActivity: [{ hour: 9, count: 2 }, { hour: 10, count: 4 }, { hour: 11, count: 3 }, { hour: 13, count: 5 }, { hour: 14, count: 2 }, { hour: 16, count: 6 }, { hour: 20, count: 7 }, { hour: 21, count: 3 }],
  orderGapHistogram: [{ label: '0-15', count: 1 }, { label: '16-30', count: 2 }, { label: '31-60', count: 3 }, { label: '60+', count: 1 }],
  interestTimeline: [{ label: 'สัปดาห์ 1', messages: 4, priceAsks: 1 }, { label: 'สัปดาห์ 2', messages: 9, priceAsks: 3 }, { label: 'สัปดาห์ 3', messages: 6, priceAsks: 2 }, { label: 'สัปดาห์ 4', messages: 12, priceAsks: 5 }],
});

function analytics(s: State, c: Conv): Json {
  const p = c.prospectId ? s.prospects.find((x) => x.id === c.prospectId) : undefined;
  const linked = !!p;
  const kind = linked ? 'linked' : 'new';
  const A = ANALYTICS_SAMPLE;
  const msgs = c.messages.filter((m) => m.direction === 'IN' && m.msgType === 'TEXT');
  const month = (n: number) => THAI_MONTHS[(((new Date(nowMs()).getMonth() - n) % 12) + 12) % 12];
  const trend = [0, 1, 2, 3, 4, 5].map((i) => ({ label: month(5 - i), amount: linked ? (A.purchaseTrend.amounts[i] ?? 0) : 0, orders: linked ? (A.purchaseTrend.orders[i] ?? 0) : 0 }));
  const levelKey = !linked ? 'NEW' : p!.id === 501 ? 'VIP' : p!.id === 502 ? 'GOLD' : 'SILVER';
  const level = A.levels[levelKey] ?? { label: levelKey, overall: 0 };
  const sample = A.purchase[kind];
  const daysAgo = (days: number): string => iso(nowMs() - days * 24 * 60 * MIN);
  const { recentOrders, ...purchaseFigures } = sample;
  return {
    customer: { matchedBy: linked ? 'CODE' : 'NONE', linked, hasPurchaseHistory: linked && p!.id !== 503, name: p?.name ?? c.profileName, code: p?.code ?? '' },
    purchase: {
      ...purchaseFigures,
      lastPurchaseDate: sample.daysSinceLastPurchase === null ? null : daysAgo(sample.daysSinceLastPurchase),
      recentOrders: recentOrders.map(({ daysAgo: days, ...order }) => ({ date: daysAgo(days), ...order })),
    },
    chat: {
      totalMessages: c.messages.length,
      interestedCategories: msgs.length ? A.interestedCategories : [],
      topKeywords: msgs.length ? A.topKeywords : [],
    },
    scores: {
      overall: level.overall, level: levelKey, levelLabel: level.label,
      notes: A.scoreNotes.map((n) => ({ label: n.label, value: n[kind], note: !linked && n.noteNew ? n.noteNew : n.note })),
    },
    segments: A.segments[kind],
    charts: {
      scoreRadar: A.scoreNotes.map((n) => ({ label: n.radarLabel, value: n[kind] })),
      purchaseTrend: trend,
      categoryMix: linked ? A.categoryMix : [],
      chatActivity: A.chatActivity,
      chatHeatmap: [1, 2, 3, 4, 5].flatMap((d) => [10, 14, 20].map((h) => ({ weekday: d, hour: h, count: ((d * h) % 5) + 1 }))),
      orderGapHistogram: A.orderGapHistogram,
      interestTimeline: A.interestTimeline,
    },
    insight: null,
    scope: {
      branchId: BRANCHES.find((b) => b.id === s.channels.find((x) => x.pageId === c.pageId)?.ggwBranchId)?.id ?? 1,
      branchName: BRANCHES.find((b) => b.id === s.channels.find((x) => x.pageId === c.pageId)?.ggwBranchId)?.name ?? '',
      branchCode: BRANCHES.find((b) => b.id === s.channels.find((x) => x.pageId === c.pageId)?.ggwBranchId)?.code ?? '',
      profileItems: s.kb.filter((k) => k.type === 'PROFILE' && k.active).length,
      ruleItems: s.kb.filter((k) => k.type === 'RULE' && k.active).length,
      prospectScope: 'OK',
    },
    meta: { salesRowsLoaded: -1 },
  };
}

/**
 * The topics of the customer data card (`ref.chat.json` › `topicsSample`): the `unlinked` list for a room not linked to a customer, the `linked` one
 * otherwise; the rows of "profile" (the customer himself) and "leads" are made from the customer and from `leadProducts` / `leadStatuses`.
 */
interface TopicSample {
  id: string;
  title: string;
  description: string;
  group: string;
  role: string;
  status: string;
  message: string;
  columns: Array<{ name: string; label: string; type: string }>;
  rows: Array<Record<string, unknown>>;
  rowCount: number;
  truncated: boolean;
}
const TOPICS_SAMPLE = reference<{ generatedAt: string; profileSince: string; profileGrade: string; leadProducts: string[]; leadStatuses: string[]; unlinked: TopicSample[]; linked: TopicSample[] }>('chat.topicsSample', {
  generatedAt: '2026-10-19T09:30:00',
  profileSince: '2024-03-18',
  profileGrade: 'HOT',
  leadProducts: ['ประกันรถยนต์ชั้น 1', 'สินเชื่อทะเบียนรถ'],
  leadStatuses: ['HOT', 'WARM', 'COLD'],
  unlinked: [
    { id: 'profile', title: 'ข้อมูลลูกค้า', description: 'ข้อมูลหลักของลูกค้า', group: 'ข้อมูลทั่วไป', role: 'CUSTOMER_PROFILE', status: 'SKIPPED', message: 'ห้องแชทนี้ยังไม่ได้ผูกกับลูกค้า', columns: [], rows: [], rowCount: 0, truncated: false },
    { id: 'leads', title: 'โอกาสขาย', description: '', group: 'การขาย', role: 'LIST', status: 'SKIPPED', message: 'ห้องแชทนี้ยังไม่ได้ผูกกับลูกค้า', columns: [], rows: [], rowCount: 0, truncated: false },
  ],
  linked: [
    {
      id: 'profile', title: 'ข้อมูลลูกค้า', description: 'ข้อมูลหลักของลูกค้าจากระบบ CRM', group: 'ข้อมูลทั่วไป', role: 'CUSTOMER_PROFILE', status: 'OK', message: '',
      columns: [{ name: 'name', label: 'ชื่อ', type: 'text' }, { name: 'tel', label: 'เบอร์โทร', type: 'text' }, { name: 'since', label: 'เป็นลูกค้าตั้งแต่', type: 'date' }, { name: 'grade', label: 'ระดับ', type: 'badge' }],
      rows: [], rowCount: 1, truncated: false,
    },
    {
      id: 'leads', title: 'โอกาสขาย', description: 'Lead ที่เปิดอยู่ของลูกค้ารายนี้', group: 'การขาย', role: 'LIST', status: 'OK', message: '',
      columns: [{ name: 'txno', label: 'เลขที่', type: 'text' }, { name: 'product', label: 'ผลิตภัณฑ์', type: 'text' }, { name: 'amount', label: 'มูลค่า', type: 'money' }, { name: 'rate', label: 'โอกาสปิด', type: 'percent' }, { name: 'at', label: 'อัปเดต', type: 'datetime' }, { name: 'st', label: 'สถานะ', type: 'badge' }],
      rows: [], rowCount: 11, truncated: true,
    },
    { id: 'debt', title: 'ยอดค้างชำระ', description: '', group: 'การเงิน', role: 'LIST', status: 'EMPTY', message: '', columns: [], rows: [], rowCount: 0, truncated: false },
    { id: 'claims', title: 'ประวัติเคลม', description: '', group: 'การเงิน', role: 'LIST', status: 'ERROR', message: 'ฐานข้อมูลเคลมตอบสนองช้า', columns: [], rows: [], rowCount: 0, truncated: false },
  ],
});
function topics(s: State, c: Conv): Json {
  const p = c.prospectId ? s.prospects.find((x) => x.id === c.prospectId) : undefined;
  const T = TOPICS_SAMPLE;
  if (!p) return { active: true, generatedAt: T.generatedAt, topics: T.unlinked };
  const rowsOf = (t: TopicSample): TopicSample['rows'] => {
    if (t.id === 'profile') return [{ name: p.name, tel: p.customerTel, since: T.profileSince, grade: T.profileGrade }];
    if (t.id !== 'leads') return t.rows;
    return Array.from({ length: t.rowCount }, (_, i) => ({
      txno: `LD-2026-${String(900 + i).padStart(6, '0')}`,
      product: T.leadProducts.length ? T.leadProducts[i % T.leadProducts.length] : '',
      amount: 12000 + i * 1850.5,
      rate: 30 + i * 5,
      at: `2026-10-${String(10 + i).padStart(2, '0')}T14:30:00`,
      st: T.leadStatuses.length ? T.leadStatuses[i % T.leadStatuses.length] : '',
    }));
  };
  return { active: true, generatedAt: T.generatedAt, topics: T.linked.map((t) => ({ ...t, rows: rowsOf(t) })) };
}

/** the sample insight of the AI on a customer: `headlineLinked` / `headlineNew` is picked by whether the room is linked to a customer */
const INSIGHT_SAMPLE = reference('chat.insightSample', {
  headlineLinked: 'ลูกค้าประจำที่พร้อมต่ออายุกรมธรรม์',
  headlineNew: 'ลูกค้าใหม่ที่กำลังเปรียบเทียบราคา',
  summary: 'ลูกค้าสอบถามรายละเอียดและเงื่อนไขการผ่อนอย่างต่อเนื่อง ตอบกลับเร็วและมีแนวโน้มปิดการขายภายใน 7 วันหากได้รับใบเสนอราคาเร็ว',
  persona: 'ผู้ซื้อที่ตัดสินใจเร็ว',
  tone: 'สุภาพ กระชับ',
  priceSensitivity: 'ปานกลาง',
  promoInterest: 'สนใจผ่อน 0%',
  bestContactTime: '10:00 – 12:00 น.',
  behaviour: ['ถามราคาก่อนทุกครั้ง', 'ตอบแชทภายใน 5 นาทีในเวลาทำการ'],
  risks: ['อาจเปรียบเทียบราคากับรายอื่น', 'งบประมาณจำกัดไม่เกิน 18,000 บาท'],
  recommendations: [
  { type: 'FOLLOW_UP', priority: 'HIGH', title: 'ส่งใบเสนอราคาภายในวันนี้', detail: 'ลูกค้าขอใบเสนอราคาแล้ว ควรส่งพร้อมตัวเลือกผ่อน 0%' },
  { type: 'CROSS_SELL', priority: 'MEDIUM', title: 'เสนอ พ.ร.บ. พร้อมกรมธรรม์', detail: 'ซื้อรวมลดเพิ่มได้ ช่วยปิดการขายง่ายขึ้น' },
  { type: 'TIMING', priority: 'LOW', title: 'โทรช่วง 10:00–12:00', detail: 'ช่วงที่ลูกค้าตอบเร็วที่สุด' },
  ],
});
function insight(c: Conv): Json {
  const linked = !!c.prospectId;
  const { headlineLinked, headlineNew, recommendations, ...text } = INSIGHT_SAMPLE;
  return {
    insight: {
      headline: linked ? headlineLinked : headlineNew,
      ...text,
      buyingProbability: linked ? 78 : 41,
      expectedNextPurchaseDays: linked ? 14 : 0,
    },
    recommendations,
    aiFallback: false,
    aiError: null,
  };
}

/* ─────────────────────────────────────────────────────────────── router */
let pending: Promise<unknown> = Promise.resolve();

export function mockChatFetch(input: string, init: RequestInit | undefined, ctx: string, me: MockSession): Promise<Response> {
  const url = new URL(input, 'http://mock.local');
  let path = url.pathname;
  if (ctx && path.startsWith(ctx + '/')) path = path.slice(ctx.length);
  const method = (init?.method ?? 'GET').toUpperCase();
  let body: Json = null;
  const raw = init?.body;
  if (typeof raw === 'string') {
    try {
      body = JSON.parse(raw);
    } catch {
      body = null;
    }
  } else if (raw) {
    body = raw; // FormData (uploads)
  }
  // a few milliseconds of latency, in order — so the "loading" states of the screen can be seen
  const run = () => new Promise<Response>((resolve) => setTimeout(() => resolve(route(path, method, url.searchParams, body, me)), 15));
  const p = run();
  pending = p;
  return p;
}

function page<T>(rows: T[], q: URLSearchParams): { slice: T[]; meta: Json } {
  const per = Math.max(1, Number(q.get('perPage')) || 20);
  const pageNo = Math.max(1, Number(q.get('page')) || 1);
  const total = rows.length;
  return { slice: rows.slice((pageNo - 1) * per, pageNo * per), meta: { page: pageNo, perPage: per, total, totalPages: Math.max(1, Math.ceil(total / per)) } };
}

function route(path: string, method: string, q: URLSearchParams, body: Json, me: MockSession): Response {
  const s = S();
  let m: RegExpExecArray | null;
  const API = '/chat-api/api/v1';

  /* ── board (BFF servlets) ── */
  if (path === '/board/employees') return res(EMPLOYEES);
  if (path === '/board/chat-master-data') {
    const type = q.get('type');
    if (type === 'branches') return ok(BRANCHES);
    if (type === 'marketing-channels') return ok([{ id: 1, name: 'Facebook Ads' }, { id: 2, name: 'Walk-in' }, { id: 3, name: 'แนะนำต่อ' }, { id: 4, name: 'LINE OA' }]);
    if (type === 'employees') return ok(EMPLOYEES.map((e) => ({ id: e.id, code: e.code, name: e.name })));
    if (type === 'sale-persons') return ok(EMPLOYEES.slice(0, 3).map((e) => ({ id: e.id, code: e.code, name: e.name })));
    if (type === 'products') return ok([{ id: 11, name: 'ประกันรถยนต์' }, { id: 12, name: 'ประกันสุขภาพ' }, { id: 13, name: 'สินเชื่อทะเบียนรถ' }]);
    return ok([]);
  }
  if (path === '/board/prospect' && method === 'GET') {
    const p = s.prospects.find((x) => x.id === Number(q.get('id')));
    return p ? ok(p) : res({ result: null });
  }
  if (path === '/board/prospect-leads') return ok(LEADS[Number(q.get('prospectId'))] ?? []);
  if (path === '/board/chat-prospect-create' && method === 'POST') {
    const id = s.nextProspectId++;
    s.prospects.push({
      id, code: 'CUS-' + String(id).padStart(6, '0'), name: body.name, customerTel: body.customerTel, sex: '', convenientTime: body.convenient || '', convenient: '',
      currentAddress: '', currentCityName: '', prospectEmail: '', prospectLine: '', prospectFacebook: '', prospectTwitter: '', prospectInstagram: '',
      customerType: 'person', marketingChanelName: '', createBy: 'สมชาย ใจดี',
    });
    return res({ status: 201, result: { id } });
  }

  /* ── analytics (CHAT_BOT) ── */
  if ((m = /^\/ai-api\/api\/analytics\/customer(?:\/(insight|topics|ask))?$/.exec(path))) {
    const c = s.convs.find((x) => x.id === Number(body?.conversationId));
    if (!c) return fail(404, 'conversation not found');
    if (!m[1]) return res(analytics(s, c));
    if (m[1] === 'topics') return res(topics(s, c));
    if (m[1] === 'insight') return res(insight(c));
    return res({ answer: msg('ตามข้อมูลของ {0}: ยอดซื้อสะสมสูงและสนใจผ่อน 0% — แนะนำส่งใบเสนอราคาภายในวันนี้ (คำถาม: {1})', c.profileName, body?.question ?? '') });
  }
  if (path.startsWith('/ai-api/')) return fail(404, 'not found');

  if (!path.startsWith(API)) return fail(404, 'not found');
  const p = path.slice(API.length);

  /* ── conversations ── */
  if (p === '/conversations' && method === 'GET') {
    let rows = s.convs.map((c) => ({ c, last: lastOf(c) }));
    const kw = (q.get('q') ?? '').toLowerCase();
    if (kw) {
      rows = rows.filter(({ c }) => {
        const pr = c.prospectId ? s.prospects.find((x) => x.id === c.prospectId) : undefined;
        return [c.profileName, pr?.name, pr?.customerTel, c.userId, lastOf(c)?.body].join(' ').toLowerCase().includes(kw);
      });
    }
    if (q.get('unread') === 'true') rows = rows.filter(({ c }) => c.unreadCount > 0);
    if (q.get('starred') === 'true') rows = rows.filter(({ c }) => c.starred);
    if (q.get('linked') === 'true') rows = rows.filter(({ c }) => c.prospectId != null);
    if (q.get('linked') === 'false') rows = rows.filter(({ c }) => c.prospectId == null);
    const at = (r: { last?: Msg }) => (r.last ? Date.parse(r.last.sentAt) : 0);
    const sort = q.get('sort');
    rows.sort((a, b) => {
      if (sort === 'unread') return Number(b.c.unreadCount > 0) - Number(a.c.unreadCount > 0) || at(b) - at(a);
      if (sort === 'starred') return Number(b.c.starred) - Number(a.c.starred) || at(b) - at(a);
      if (sort === 'team') return Number(b.c.starred) - Number(a.c.starred) || Number(b.c.unreadCount > 0) - Number(a.c.unreadCount > 0) || at(b) - at(a);
      return at(b) - at(a);
    });
    const { slice, meta } = page(rows, q);
    return ok(slice.map(({ c }) => convOut(s, c)), meta);
  }
  if (p === '/conversations/counts' && method === 'GET') {
    const kw = (q.get('q') ?? '').toLowerCase();
    const list = s.convs.filter((c) => {
      if (q.get('unread') === 'true' && !c.unreadCount) return false;
      if (q.get('starred') === 'true' && !c.starred) return false;
      if (q.get('linked') === 'true' && c.prospectId == null) return false;
      if (q.get('linked') === 'false' && c.prospectId != null) return false;
      return !kw || [c.profileName, lastOf(c)?.body].join(' ').toLowerCase().includes(kw);
    });
    const n = (t: string) => list.filter((c) => c.channelType === t).length;
    return ok({ ALL: list.length, LINE: n('LINE'), FACEBOOK: n('FACEBOOK'), INSTAGRAM: n('INSTAGRAM'), WHATSAPP: n('WHATSAPP'), TIKTOK: n('TIKTOK') });
  }
  if (p === '/conversations/channels' && method === 'GET') {
    const platform = (q.get('platform') ?? '').toUpperCase();
    return ok(
      s.channels.filter((c) => c.channelType === platform && c.isActive).map((c) => {
        const mine = s.convs.filter((v) => v.pageId === c.pageId);
        return { pageId: c.pageId, displayName: c.displayName, channelType: c.channelType, botBasicId: c.botBasicId, total: mine.length, unread: mine.reduce((a, v) => a + v.unreadCount, 0) };
      }),
    );
  }
  if ((m = /^\/conversations\/(\d+)\/messages$/.exec(p))) {
    const c = s.convs.find((x) => x.id === Number(m![1]));
    if (!c) return fail(404, 'conversation not found');
    if (method === 'GET') {
      const sorted = [...c.messages].sort((a, b) => Date.parse(b.sentAt) - Date.parse(a.sentAt) || b.id - a.id);
      const { slice, meta } = page(sorted, q);
      return ok(slice.map(msgOut), meta);
    }
    if (method === 'POST') {
      const att = typeof body.attachments === 'string' ? safeJson(body.attachments) : body.attachments ?? null;
      const t = nowMs();
      const msg: Msg = {
        id: s.nextMsgId++, conversationId: c.id, direction: 'OUT', msgType: body.msgType ?? 'TEXT', body: body.message ?? '', attachments: att,
        sentAt: iso(t), createdAt: iso(t), deliveryStatus: 'SENT', providerMessageId: body.clientMessageId ?? null,
        senderType: 'AGENT', senderUsername: 'demo', senderEmployeeId: me.employeeId || '1001', senderName: EMPLOYEES.find((e) => String(e.id) === me.employeeId)?.name ?? 'สมชาย ใจดี',
        meta: body.internalNote ? { internal: true } : null,
      };
      c.messages.push(msg);
      return ok({ id: msg.id, providerMessageId: msg.providerMessageId, deliveryStatus: msg.deliveryStatus });
    }
  }
  /* PATCH / DELETE /conversations/{id}/profile-name — only a room that is not linked to a customer (409 otherwise, like the chat service) */
  if ((m = /^\/conversations\/(\d+)\/profile-name$/.exec(p)) && (method === 'PATCH' || method === 'DELETE')) {
    const c = s.convs.find((x) => x.id === Number(m![1]));
    if (!c) return fail(404, 'conversation not found');
    if (c.prospectId != null) return fail(409, 'conversation is linked to a prospect');
    if (method === 'PATCH') {
      const name = String(body.profileName ?? '').trim();
      if (!name) return fail(400, 'profileName is required');
      if (!c.profileNameManual) c.providerProfileName = c.profileName;
      c.profileName = name.slice(0, 255);
      c.profileNameManual = true;
      return ok({ id: c.id, profileName: c.profileName, providerProfileName: c.providerProfileName ?? null });
    }
    if (c.profileNameManual && c.providerProfileName) c.profileName = c.providerProfileName;
    c.profileNameManual = false;
    c.providerProfileName = undefined;
    return ok({ id: c.id, profileName: c.profileName, profileImage: c.profileImage });
  }
  /* GET /conversations/by-prospect?prospectId= — the rooms of one customer, LINE first then Facebook (the quick-chat overlay opens the first) */
  if (p === '/conversations/by-prospect' && method === 'GET') {
    const pid = Number(q.get('prospectId'));
    const rank = (t: string): number => ['LINE', 'FACEBOOK'].indexOf(t) + 1 || 9;
    return ok(s.convs.filter((c) => c.prospectId === pid).sort((a, b) => rank(a.channelType) - rank(b.channelType)).map((c) => convOut(s, c)));
  }
  /* GET /link-preview?url= — title / description / image of a page the chat service read (the mock makes it up from the address) */
  if (p === '/link-preview' && method === 'GET') {
    try {
      const u = new URL(q.get('url') ?? '');
      return ok({ url: u.href, domain: u.hostname, siteName: u.hostname, title: `Preview of ${u.hostname}`, description: u.pathname === '/' ? '' : u.pathname, image: '' });
    } catch {
      return fail(400, 'invalid url');
    }
  }
  if ((m = /^\/conversations\/(\d+)\/read$/.exec(p)) && method === 'PATCH') {
    const c = s.convs.find((x) => x.id === Number(m![1]));
    if (c) c.unreadCount = 0;
    return ok({ id: Number(m[1]), unreadCount: 0 });
  }
  if ((m = /^\/conversations\/(\d+)\/star$/.exec(p)) && method === 'PATCH') {
    const c = s.convs.find((x) => x.id === Number(m![1]));
    if (!c) return fail(404, 'conversation not found');
    c.starred = q.get('starred') === 'true';
    return ok({ id: c.id, starred: c.starred });
  }
  if ((m = /^\/conversations\/(\d+)\/quick-messages$/.exec(p))) {
    const c = s.convs.find((x) => x.id === Number(m![1]));
    const ch = c && s.channels.find((x) => x.pageId === c.pageId);
    if (!c || !ch) return fail(404, 'conversation not found');
    return ok({ branchId: ch.ggwBranchId, branchCode: ch.ggwBranchCode, branchName: ch.ggwBranchName, items: s.qm.filter((x) => x.branchId === ch.ggwBranchId && x.active).map((x) => ({ id: x.id, title: x.title, message: x.message })) });
  }

  /* ── uploads ── */
  if (p === '/uploads' && method === 'POST') {
    const f = (body instanceof FormData ? body.get('file') : null) as File | null;
    const name = 'up-' + Date.now() + '-' + (f?.name ?? 'file').replace(/[^\w.\-]/g, '_');
    if (f) uploaded.set(name, f);
    return ok({ filename: name, url: 'https://chat.example.com/triplesale-chat/files/' + name, previewUrl: 'https://chat.example.com/triplesale-chat/files/' + name, size: f?.size ?? 0, contentType: f?.type ?? '' });
  }

  /* ── chatbot ── */
  if (p === '/chatbot/status') return ok({ globalEnabled: s.botGlobal, serviceReachable: true });
  if (p === '/chatbot/switches' && method === 'GET') return ok(s.switches);
  if ((m = /^\/chatbot\/switches\/([^/]+)\/([^/]+)$/.exec(p)) && method === 'PATCH') {
    const sw = s.switches.find((x) => x.scope === decodeURIComponent(m![1]) && x.scopeKey === decodeURIComponent(m![2]));
    if (!sw) return fail(404, 'switch not found');
    sw.enabled = !!body.enabled;
    return ok({ ...sw });
  }
  if (p === '/chatbot/channels' && method === 'GET') {
    return ok(s.channels.filter((c) => c.channelType !== 'TIKTOK').map((c) => ({ id: c.id, channelType: c.channelType, displayName: c.displayName, pageId: c.pageId, chatbotEnabled: c.chatbotEnabled })));
  }
  if ((m = /^\/chatbot\/channels\/(\d+)$/.exec(p)) && method === 'PATCH') {
    const ch = s.channels.find((x) => x.id === Number(m![1]));
    if (!ch) return fail(404, 'channel not found');
    ch.chatbotEnabled = !!body.enabled;
    return ok({ id: ch.id, chatbotEnabled: ch.chatbotEnabled });
  }
  if ((m = /^\/chatbot\/conversations\/(\d+)$/.exec(p))) {
    const c = s.convs.find((x) => x.id === Number(m![1]));
    const ch = c && s.channels.find((x) => x.pageId === c.pageId);
    if (!c || !ch) return fail(404, 'conversation not found');
    if (method === 'PATCH') c.botOverride = body.enabled === null || body.enabled === undefined ? null : !!body.enabled;
    const effective = s.botGlobal && (c.botOverride ?? ch.chatbotEnabled);
    return ok({ conversationId: c.id, chatbotEnabled: c.botOverride, effectiveEnabled: effective });
  }

  /* ── master data ── */
  if (p === '/master-data/branches') return ok(BRANCHES.map((b) => ({ id: b.id, code: b.code, name: b.name })));

  /* ── prospect ↔ social link ── */
  if (p === '/prospect-social/check') {
    const c = s.convs.find((x) => x.pageId === q.get('pageId') && x.userId === q.get('socialId'));
    const pr = c?.prospectId ? s.prospects.find((x) => x.id === c.prospectId) : undefined;
    return ok(pr ? { linked: true, name: pr.name, tel: pr.customerTel, prospectId: pr.id } : { linked: false });
  }
  if (p === '/prospect-social/contacts') {
    const kw = (q.get('q') ?? '').toLowerCase();
    const all = [
      ...s.prospects.map((x) => ({ prospectId: x.id, code: x.code, name: x.name, tel: x.customerTel, linkedCount: s.convs.filter((c) => c.prospectId === x.id).length })),
      ...EXTRA_CONTACTS,
    ];
    return ok(all.filter((x) => !kw || `${x.name} ${x.code} ${x.tel}`.toLowerCase().includes(kw)));
  }
  if (p === '/prospect-social/link') {
    if (method === 'POST') {
      const c = s.convs.find((x) => x.pageId === body.pageId && x.userId === body.socialId);
      const pr = s.prospects.find((x) => x.id === body.prospectId) ?? EXTRA_CONTACTS.find((x) => x.prospectId === body.prospectId);
      if (!c || !pr) return fail(404, 'not found');
      c.prospectId = (pr as any).id ?? (pr as any).prospectId;
      if (!s.prospects.find((x) => x.id === c.prospectId)) {
        s.prospects.push({ ...PROSPECTS[0], id: c.prospectId!, code: (pr as any).code, name: (pr as any).name, customerTel: (pr as any).tel });
      }
      return ok({ linked: true, name: (pr as any).name, tel: (pr as any).tel, prospectId: c.prospectId });
    }
    if (method === 'DELETE') {
      const c = s.convs.find((x) => x.pageId === q.get('pageId') && x.userId === q.get('socialId'));
      if (c) c.prospectId = null;
      return ok({ linked: false });
    }
  }

  /* ── chat-channels (account registry) ── */
  if (p === '/chat-channels/webhook-info') {
    const base = 'https://chat.example.com/webhooks';
    return ok([
      { channelType: 'LINE', callbackUrl: base + '/line', verifyToken: '', publicUrl: true, signatureCheck: true },
      { channelType: 'FACEBOOK', callbackUrl: base + '/facebook', verifyToken: 'mock-verify-token', publicUrl: true, signatureCheck: false },
      { channelType: 'INSTAGRAM', callbackUrl: base + '/instagram', verifyToken: 'mock-verify-token', publicUrl: true, signatureCheck: false },
      { channelType: 'WHATSAPP', callbackUrl: base + '/whatsapp', verifyToken: 'mock-verify-token', publicUrl: false, signatureCheck: false },
      { channelType: 'TIKTOK', callbackUrl: base + '/tiktok', verifyToken: '', oauthRedirectUrl: base + '/tiktok/oauth', authorizeUrl: 'https://www.tiktok.com/v2/auth/authorize/', scopes: 'user.info.basic', publicUrl: true, signatureCheck: true },
    ]);
  }
  if (p === '/chat-channels/probe' && method === 'POST') {
    const t = String(body.channelType);
    return ok({
      pageId: t === 'LINE' ? 'U' + 'e'.repeat(32) : body.pageId || '1234567890', displayName: 'Mock ' + t + ' account', pictureUrl: avatar('M', '#0EA5E9'),
      botBasicId: t === 'LINE' ? '@mockoa' : '', chatMode: t === 'LINE' ? 'bot' : '', markAsReadMode: t === 'LINE' ? 'manual' : '', chatModeWarning: '',
    });
  }
  if (p === '/chat-channels/tiktok/connect' && method === 'POST') {
    return ok({ pageId: 'tt-' + Date.now(), displayName: 'TikTok mock', pictureUrl: '', accessToken: 'tt-access', refreshToken: 'tt-refresh', accessTokenExpiresAt: Date.now() + 86_400_000, refreshTokenExpiresAt: Date.now() + 31_536_000_000 });
  }
  if (p === '/chat-channels' && method === 'GET') {
    const { slice, meta } = page(s.channels, q);
    return ok(slice.map(stripSecrets), meta);
  }
  if (p === '/chat-channels' && method === 'POST') {
    const b = BRANCHES.find((x) => x.id === Number(body.ggwBranchId)) ?? BRANCHES[0];
    const ch = channel(s.nextChannelId++, String(body.channelType ?? 'LINE'), String(body.pageId), String(body.displayName), String(body.botBasicId ?? ''), b.id, !!body.chatbotEnabled, String(body.pictureUrl ?? ''));
    Object.assign(ch, { isActive: body.isActive !== false, channelSecret: body.channelSecret ?? '', accessToken: body.accessToken ?? '', hasChannelSecret: !!body.channelSecret, hasAccessToken: !!body.accessToken });
    s.channels.push(ch);
    return res({ status: 201, result: stripSecrets(ch) }, 201);
  }
  if ((m = /^\/chat-channels\/(\d+)(?:\/(check|secrets|access)(?:\/([^/]+))?)?$/.exec(p))) {
    const id = Number(m[1]);
    const sub = m[2];
    const who = decodeURIComponent(m[3] ?? '');
    const ch = s.channels.find((x) => x.id === id);
    if (!ch) return fail(404, 'channel not found');
    if (!sub) {
      if (method === 'PATCH') {
        for (const k of ['displayName', 'pictureUrl', 'botBasicId', 'chatMode', 'markAsReadMode', 'isActive', 'chatbotEnabled', 'channelSecret', 'accessToken', 'refreshToken', 'appId'] as const) {
          if (body[k] !== undefined) (ch as any)[k] = body[k];
        }
        if (body.ggwBranchId) {
          const b = BRANCHES.find((x) => x.id === Number(body.ggwBranchId));
          if (b) Object.assign(ch, { ggwBranchId: b.id, ggwBranchCode: b.code, ggwBranchName: b.name });
        }
        if (body.pageId && body.pageId !== ch.pageId) {
          s.convs.filter((c) => c.pageId === ch.pageId).forEach((c) => (c.pageId = body.pageId));
          ch.pageId = body.pageId;
        }
        ch.hasChannelSecret = !!ch.channelSecret;
        ch.hasAccessToken = !!ch.accessToken;
        return ok(stripSecrets(ch));
      }
      if (method === 'DELETE') {
        s.channels = s.channels.filter((x) => x.id !== id);
        return new Response(null, { status: 204 });
      }
    }
    if (sub === 'check' && method === 'POST') {
      return ok(ch.channelType === 'WHATSAPP' ? { ok: true, message: 'เชื่อมต่อได้ — ' + ch.displayName, warning: 'Token ใกล้หมดอายุภายใน 7 วัน' } : { ok: true, message: 'เชื่อมต่อได้ — ' + ch.displayName });
    }
    if (sub === 'secrets') return ok({ channelSecret: ch.channelSecret, accessToken: ch.accessToken, refreshToken: ch.refreshToken });
    if (sub === 'access') {
      const list = (s.access[id] ??= []);
      if (method === 'GET') return ok(list);
      if (method === 'POST') {
        if (!list.some((x) => x.employeeId === String(body.employeeId))) list.push({ employeeId: String(body.employeeId), employeeCode: body.employeeCode ?? '', employeeName: body.employeeName ?? '' });
        return ok({ ok: true });
      }
      if (method === 'DELETE') {
        s.access[id] = list.filter((x) => x.employeeId !== who);
        return ok({ ok: true });
      }
    }
  }

  /* ── ai-companies (knowledge base the bot answers from) ── */
  if (p === '/ai-companies/scopes') {
    return ok(
      BRANCHES.map((b) => {
        const chans = s.channels.filter((c) => c.ggwBranchId === b.id && c.channelType !== 'TIKTOK');
        const own = (type: string, active?: boolean) => s.kb.filter((k) => k.branchId === b.id && k.channelId === 0 && k.type === type && (active === undefined || k.active === active)).length;
        return {
          branchId: b.id, branchCode: b.code, branchName: b.name,
          counts: { profile: own('PROFILE'), rule: own('RULE'), activeProfile: own('PROFILE', true), activeRule: own('RULE', true) },
          channels: chans.map((c) => {
            const mine = (type: string, active?: boolean) => s.kb.filter((k) => k.channelId === c.id && k.type === type && (active === undefined || k.active === active)).length;
            return {
              id: c.id, channelType: c.channelType, displayName: c.displayName, pageId: c.pageId, chatbotEnabled: c.chatbotEnabled,
              ready: own('PROFILE', true) + mine('PROFILE', true) > 0,
              counts: { profile: mine('PROFILE'), rule: mine('RULE'), activeProfile: mine('PROFILE', true), activeRule: mine('RULE', true) },
            };
          }),
        };
      }),
    );
  }
  if (p === '/ai-companies/try' && method === 'POST') {
    const hasKb = s.kb.some((k) => k.active);
    return ok(hasKb ? { sessionId: body.sessionId ?? 'try-' + Date.now(), reply: msg('ตอบจากข้อมูลของร้าน: {0}', body.message), reason: null } : { sessionId: null, reply: null, reason: 'NO_KNOWLEDGE' });
  }
  if (p === '/ai-companies' && method === 'GET') {
    let rows = s.kb.filter((k) => k.type === q.get('type'));
    if (q.get('channelId')) rows = rows.filter((k) => k.channelId === Number(q.get('channelId')));
    else if (q.get('branchId')) rows = rows.filter((k) => k.branchId === Number(q.get('branchId')) && k.channelId === 0);
    const kw = (q.get('q') ?? '').toLowerCase();
    if (kw) rows = rows.filter((k) => `${k.name} ${k.description}`.toLowerCase().includes(kw));
    const { slice, meta } = page(rows, q);
    return ok(slice, meta);
  }
  if (p === '/ai-companies' && method === 'POST') {
    const row = { id: s.nextKbId++, type: body.type, name: body.name, description: body.description, active: body.active !== false, channelId: Number(body.channelId) || 0, branchId: body.branchId ?? s.channels.find((c) => c.id === Number(body.channelId))?.ggwBranchId ?? 1 };
    s.kb.push(row);
    return res({ result: row }, 201);
  }
  if ((m = /^\/ai-companies\/(\d+)$/.exec(p))) {
    const row = s.kb.find((k) => k.id === Number(m![1]));
    if (!row) return fail(404, 'not found');
    if (method === 'PATCH') {
      Object.assign(row, body);
      if (body.channelId !== undefined) row.channelId = Number(body.channelId) || 0;
      return ok(row);
    }
    if (method === 'DELETE') {
      s.kb = s.kb.filter((k) => k.id !== row.id);
      return new Response(null, { status: 204 });
    }
  }

  /* ── quick-messages ── */
  if (p === '/quick-messages/scopes') {
    return ok(BRANCHES.map((b) => ({ branchId: b.id, branchCode: b.code, branchName: b.name, total: s.qm.filter((x) => x.branchId === b.id).length, active: s.qm.filter((x) => x.branchId === b.id && x.active).length, channelCount: s.channels.filter((c) => c.ggwBranchId === b.id && c.channelType !== 'TIKTOK').length })));
  }
  if (p === '/quick-messages' && method === 'GET') {
    let rows = s.qm.filter((x) => x.branchId === Number(q.get('branchId')));
    const kw = (q.get('q') ?? '').toLowerCase();
    if (kw) rows = rows.filter((x) => `${x.title} ${x.message}`.toLowerCase().includes(kw));
    const { slice, meta } = page(rows, q);
    return ok(slice, meta);
  }
  if (p === '/quick-messages' && method === 'POST') {
    const row = { id: s.nextQmId++, branchId: Number(body.branchId), title: body.title ?? '', message: body.message ?? '', active: body.active !== false };
    s.qm.push(row);
    return res({ result: row }, 201);
  }
  if ((m = /^\/quick-messages\/(\d+)$/.exec(p))) {
    const row = s.qm.find((x) => x.id === Number(m![1]));
    if (!row) return fail(404, 'not found');
    if (method === 'PATCH') return ok(Object.assign(row, body));
    if (method === 'DELETE') {
      s.qm = s.qm.filter((x) => x.id !== row.id);
      return new Response(null, { status: 204 });
    }
  }

  return fail(404, 'not found: ' + method + ' ' + path);
}

function stripSecrets(c: Channel): Json {
  const { channelSecret, accessToken, refreshToken, ...rest } = c;
  return rest;
}
function safeJson(t: string): Json {
  try {
    return JSON.parse(t);
  } catch {
    return null;
  }
}

/** files the page uploaded in this session (no server stores them) — image / video / file messages show them from memory */
const uploaded = new Map<string, File>();
const blobUrls = new Map<string, string>();
export function mockChatFileUrl(filename: string): string {
  const f = uploaded.get(filename);
  if (!f) return '';
  let u = blobUrls.get(filename);
  if (!u) {
    u = URL.createObjectURL(f);
    blobUrls.set(filename, u);
  }
  return u;
}

/* ─────────────────────────────────────────────────────────────── realtime */
export class FakeSocket {
  connected = false;
  readonly emitted: { event: string; args: any[] }[] = [];
  private handlers = new Map<string, ((...a: any[]) => void)[]>();
  constructor() {
    socketHub.push(this);
    setTimeout(() => {
      this.connected = true;
      this.fire('connect');
    }, 20);
  }
  on(event: string, fn: (...a: any[]) => void): this {
    this.handlers.set(event, [...(this.handlers.get(event) ?? []), fn]);
    return this;
  }
  emit(event: string, ...args: any[]): this {
    this.emitted.push({ event, args });
    return this;
  }
  disconnect(): this {
    this.connected = false;
    socketHub = socketHub.filter((x) => x !== this);
    return this;
  }
  fire(event: string, ...args: any[]): void {
    (this.handlers.get(event) ?? []).forEach((fn) => fn(...args));
  }
}
export function mockChatSocket(_url: string, _opts: unknown): FakeSocket {
  return new FakeSocket();
}

/**
 * A customer message arrives (what the chat service pushes over Socket.IO). Used by the unit tests and from the
 * browser console while `mock: true`:  `await (await import('…chat.mock')).pushMockIncoming(1, 'สวัสดี')`
 */
export function pushMockIncoming(conversationId: number, text: string): void {
  const s = S();
  const c = s.convs.find((x) => x.id === conversationId);
  if (!c) return;
  txt(c, 'IN', 0, text);
  c.unreadCount++;
  const m = c.messages[c.messages.length - 1];
  socketHub.forEach((sock) => {
    sock.fire('message:new', msgOut(m));
    sock.fire('conversation:update', convOut(s, c));
  });
}
