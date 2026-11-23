import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { resetMockupForTests, setDatasource } from '@core/mockup/mockup-datasource';
import { referenceDefaults } from '@core/mock/reference';
import { mockChatFetch, mockChatSocket, pushMockIncoming, registerReferenceLists, resetMockChat } from './chat.mock';

const CTX = '/triplesale';
const CHAT = `${CTX}/chat-api/api/v1`;
const ME = { employeeId: '1001', branchId: '1' };

async function call(url: string, method = 'GET', body?: unknown): Promise<{ status: number; json: any }> {
  const res = await mockChatFetch(url, { method, body: body === undefined ? undefined : JSON.stringify(body) }, CTX, ME);
  const text = await res.text();
  return { status: res.status, json: text ? JSON.parse(text) : null };
}
const get = (path: string) => call(`${CHAT}${path}`);

describe('Chat mock backend', () => {
  beforeEach(() => resetMockChat());

  it('lists conversations 20 per page, newest message first, with the meta the page uses to stop loading', async () => {
    const p1 = await get('/conversations?page=1&perPage=20');
    expect(p1.json.result).toHaveLength(20);
    expect(p1.json.meta).toMatchObject({ page: 1, perPage: 20, total: 24, totalPages: 2 });
    const times = p1.json.result.map((c: any) => Date.parse(c.lastMessageAt));
    expect([...times].sort((a, b) => b - a)).toEqual(times);

    const p2 = await get('/conversations?page=2&perPage=20');
    expect(p2.json.result).toHaveLength(4);
    // a linked room carries the customer name / code the way the real service joins them in
    const linked = p1.json.result.find((c: any) => c.prospectName);
    expect(linked.prospectCode).toMatch(/^CUS-/);
  });

  it('filters by search, unread, starred and link state, and sorts like the sort menu', async () => {
    const unread = await get('/conversations?unread=true&perPage=100');
    expect(unread.json.result.length).toBeGreaterThan(0);
    expect(unread.json.result.every((c: any) => c.unreadCount > 0)).toBe(true);

    const starred = await get('/conversations?starred=true&perPage=100');
    expect(starred.json.result.every((c: any) => c.starred)).toBe(true);

    const linked = await get('/conversations?linked=true&perPage=100');
    const unlinked = await get('/conversations?linked=false&perPage=100');
    expect(linked.json.result.length + unlinked.json.result.length).toBe(24);

    const byName = await get(`/conversations?q=${encodeURIComponent('kevin')}&perPage=100`);
    expect(byName.json.result.map((c: any) => c.profileName)).toEqual(['Kevin Lee']);

    const team = await get('/conversations?sort=team&perPage=100');
    expect(team.json.result[0].starred).toBe(true);
  });

  it('counts per platform for the tab badges (and follows the filters)', async () => {
    const all = (await get('/conversations/counts')).json.result;
    expect(all.ALL).toBe(24);
    expect(all.LINE + all.FACEBOOK + all.INSTAGRAM + all.WHATSAPP + all.TIKTOK).toBe(24);
    expect(all.TIKTOK).toBe(0);
    const unread = (await get('/conversations/counts?unread=true')).json.result;
    expect(unread.ALL).toBeLessThan(all.ALL);
  });

  it('lists the accounts of a platform with their room / unread totals', async () => {
    const line = (await get('/conversations/channels?platform=LINE')).json.result;
    expect(line.map((c: any) => c.botBasicId)).toEqual(['@triplesale', '@ts-chiangmai']);
    expect(line.reduce((n: number, c: any) => n + c.total, 0)).toBe((await get('/conversations/counts')).json.result.LINE);
  });

  it('pages messages newest-first, accepts sends (text, note, sticker) and marks a room read', async () => {
    const first = await get('/conversations/1/messages?page=1&perPage=20');
    expect(first.json.result).toHaveLength(20);
    expect(first.json.meta.total).toBeGreaterThan(40);
    const msgs = first.json.result;
    expect(Date.parse(msgs[0].sentAt)).toBeGreaterThanOrEqual(Date.parse(msgs[1].sentAt));
    expect(first.json.result.map((m: any) => m.msgType)).toContain('TEXT');

    const sent = await call(`${CHAT}/conversations/1/messages`, 'POST', { message: 'สวัสดีค่ะ', msgType: 'TEXT', clientMessageId: 'web-1' });
    expect(sent.json.result).toMatchObject({ providerMessageId: 'web-1', deliveryStatus: 'SENT' });
    const note = await call(`${CHAT}/conversations/1/messages`, 'POST', { message: 'โน้ต', msgType: 'TEXT', internalNote: true, clientMessageId: 'web-2' });
    expect(note.status).toBe(200);
    const sticker = await call(`${CHAT}/conversations/1/messages`, 'POST', { msgType: 'STICKER', attachments: JSON.stringify({ packageId: '11537', stickerId: '52002734' }), clientMessageId: 'web-3' });
    expect(sticker.status).toBe(200);

    const after = (await get('/conversations/1/messages?page=1&perPage=5')).json.result;
    expect(after.map((m: any) => m.providerMessageId)).toEqual(expect.arrayContaining(['web-1', 'web-2', 'web-3']));
    expect(after.find((m: any) => m.providerMessageId === 'web-2').meta).toEqual({ internal: true });
    expect(after.find((m: any) => m.providerMessageId === 'web-3').attachments).toEqual({ packageId: '11537', stickerId: '52002734' });
    expect(after[0]).toMatchObject({ direction: 'OUT', senderType: 'AGENT', senderEmployeeId: '1001' });

    expect((await get('/conversations?perPage=100')).json.result.find((c: any) => c.id === 1).unreadCount).toBe(2);
    await call(`${CHAT}/conversations/1/read`, 'PATCH');
    expect((await get('/conversations?perPage=100')).json.result.find((c: any) => c.id === 1).unreadCount).toBe(0);
  });

  it('stars a room, and the room list preview follows the message type (internal notes get the pencil)', async () => {
    await call(`${CHAT}/conversations/4/star?starred=true`, 'PATCH');
    const rooms = (await get('/conversations?perPage=100')).json.result;
    expect(rooms.find((c: any) => c.id === 4)).toMatchObject({ starred: true, lastMessageType: 'STICKER', lastMessageDirection: 'IN' });
    await call(`${CHAT}/conversations/2/messages`, 'POST', { message: 'ติดตามพรุ่งนี้', msgType: 'TEXT', internalNote: true, clientMessageId: 'n1' });
    expect((await get('/conversations?perPage=100')).json.result.find((c: any) => c.id === 2).lastMessagePreview).toBe('📝 ติดตามพรุ่งนี้');
  });

  it('chatbot: 3 layers (global → page → room); the room switch cycles inherit → on → off → inherit', async () => {
    expect((await get('/chatbot/status')).json.result).toEqual({ globalEnabled: true, serviceReachable: true });
    const switches = (await get('/chatbot/switches')).json.result;
    expect(switches.map((s: any) => s.scope)).toEqual(expect.arrayContaining(['BRANCH', 'PLATFORM']));
    const off = await call(`${CHAT}/chatbot/switches/PLATFORM/LINE`, 'PATCH', { enabled: false });
    expect(off.json.result.enabled).toBe(false);
    const pages = (await get('/chatbot/channels')).json.result;
    expect(pages.find((c: any) => c.id === 1).chatbotEnabled).toBe(true);
    expect((await call(`${CHAT}/chatbot/channels/1`, 'PATCH', { enabled: false })).json.result.chatbotEnabled).toBe(false);

    // room 3 belongs to the Instagram page, whose bot is off
    expect((await get('/chatbot/conversations/3')).json.result).toEqual({ conversationId: 3, chatbotEnabled: null, effectiveEnabled: false });
    expect((await call(`${CHAT}/chatbot/conversations/3`, 'PATCH', { enabled: true })).json.result).toMatchObject({ chatbotEnabled: true, effectiveEnabled: true });
    expect((await call(`${CHAT}/chatbot/conversations/3`, 'PATCH', { enabled: null })).json.result.chatbotEnabled).toBeNull();
  });

  it('links a room to a customer and unlinks it again; the customer detail and leads come from /board', async () => {
    const check = (await get('/prospect-social/check?pageId=104938475601234&socialId=fb-2222bbbb')).json.result;
    expect(check).toMatchObject({ linked: true, name: 'ณัฐพงษ์ พรหมมา', prospectId: 502 });

    const room = (await get('/conversations?q=jiratchaya&perPage=5')).json.result[0];
    const contacts = (await get('/prospect-social/contacts?perPage=100')).json.result;
    expect(contacts.length).toBeGreaterThanOrEqual(5);
    const linked = await call(`${CHAT}/prospect-social/link`, 'POST', { prospectId: 504, channelType: room.channelType, socialId: room.userId, pageId: room.pageId });
    expect(linked.json.result).toMatchObject({ linked: true, name: 'อรุณี ศรีสุข' });
    expect((await get('/conversations?q=jiratchaya&perPage=5')).json.result[0].prospectName).toBe('อรุณี ศรีสุข');
    const unlinked = await call(`${CHAT}/prospect-social/link?pageId=${room.pageId}&socialId=${room.userId}`, 'DELETE');
    expect(unlinked.json.result).toEqual({ linked: false });

    const p = (await call(`${CTX}/board/prospect?id=501`)).json.result;
    expect(p).toMatchObject({ code: 'CUS-000501', customerType: 'person' });
    expect((await call(`${CTX}/board/prospect-leads?prospectId=501`)).json.result).toHaveLength(2);
    const created = await call(`${CTX}/board/chat-prospect-create`, 'POST', { name: 'ลูกค้าใหม่', customerTel: '080-000-0000' });
    expect(created.json).toMatchObject({ status: 201, result: { id: expect.any(Number) } });
    expect((await call(`${CTX}/board/chat-master-data?type=products`)).json.result.length).toBeGreaterThan(0);
    expect((await call(`${CTX}/board/employees`)).json[0]).toMatchObject({ id: 1001 });
  });

  it('account registry: list without secrets, add / edit (page id moves the rooms) / check / secrets / access / delete', async () => {
    const list = (await get('/chat-channels?page=1&perPage=100')).json.result;
    expect(list).toHaveLength(6);
    expect(list[0]).not.toHaveProperty('accessToken');
    expect(list[0]).toMatchObject({ hasAccessToken: true, ggwBranchCode: 'GGW-BKK' });

    expect((await get('/chat-channels/1/secrets')).json.result.accessToken).toBe('mock-access-token-1');
    expect((await call(`${CHAT}/chat-channels/1/check`, 'POST')).json.result.ok).toBe(true);
    expect((await get('/chat-channels/webhook-info')).json.result.map((h: any) => h.channelType)).toEqual(['LINE', 'FACEBOOK', 'INSTAGRAM', 'WHATSAPP', 'TIKTOK']);

    const added = await call(`${CHAT}/chat-channels`, 'POST', { channelType: 'LINE', pageId: 'Unew', displayName: 'OA ใหม่', ggwBranchId: 2, accessToken: 't', channelSecret: 's', isActive: true });
    expect(added.status).toBe(201);
    const id = added.json.result.id;
    expect((await call(`${CHAT}/chat-channels/${id}`, 'PATCH', { displayName: 'OA ใหม่ (แก้)', ggwBranchId: 1 })).json.result).toMatchObject({ displayName: 'OA ใหม่ (แก้)', ggwBranchCode: 'GGW-BKK' });
    // moving the page id takes the existing rooms along
    await call(`${CHAT}/chat-channels/2`, 'PATCH', { pageId: 'U-moved' });
    expect((await get('/conversations?perPage=100')).json.result.filter((c: any) => c.pageId === 'U-moved').length).toBeGreaterThan(0);
    expect((await call(`${CHAT}/chat-channels/${id}`, 'DELETE')).status).toBe(204);
    expect((await get('/chat-channels')).json.result).toHaveLength(6);

    expect((await get('/chat-channels/1/access')).json.result).toHaveLength(1);
    await call(`${CHAT}/chat-channels/1/access`, 'POST', { employeeId: '1003', employeeCode: 'EMP-1003', employeeName: 'ประเสริฐ มั่นคง' });
    expect((await get('/chat-channels/1/access')).json.result).toHaveLength(2);
    await call(`${CHAT}/chat-channels/1/access/1002`, 'DELETE');
    expect((await get('/chat-channels/1/access')).json.result.map((a: any) => a.employeeId)).toEqual(['1003']);
    expect((await call(`${CHAT}/chat-channels/probe`, 'POST', { channelType: 'LINE', accessToken: 'x' })).json.result.botBasicId).toBe('@mockoa');
  });

  it('knowledge base: scopes with counts, paged lists per branch / account, CRUD, and the "try the bot" box', async () => {
    const scopes = (await get('/ai-companies/scopes')).json.result;
    expect(scopes.map((s: any) => s.branchCode)).toEqual(['GGW-BKK', 'GGW-CNX']);
    expect(scopes[0].counts).toMatchObject({ profile: 2, rule: 2, activeProfile: 2, activeRule: 1 });
    expect(scopes[0].channels.map((c: any) => c.channelType)).not.toContain('TIKTOK');

    const rules = (await get('/ai-companies?type=RULE&branchId=1&page=1&perPage=50')).json;
    expect(rules.result.map((r: any) => r.name)).toEqual(['ห้ามรับปากอนุมัติ', 'ลูกค้าถามราคา']);
    expect(rules.meta.totalPages).toBe(1);
    expect((await get('/ai-companies?type=PROFILE&channelId=1')).json.result.map((r: any) => r.name)).toEqual(['โปรโมชันประจำเดือน']);
    expect((await get(`/ai-companies?type=PROFILE&branchId=1&q=${encodeURIComponent('เวลา')}`)).json.result).toHaveLength(1);

    const created = (await call(`${CHAT}/ai-companies`, 'POST', { type: 'PROFILE', name: 'ที่อยู่', description: 'กรุงเทพฯ', channelId: 0, branchId: 1, active: true })).json.result;
    expect(created.id).toBeGreaterThan(0);
    expect((await call(`${CHAT}/ai-companies/${created.id}`, 'PATCH', { active: false })).json.result.active).toBe(false);
    expect((await call(`${CHAT}/ai-companies/${created.id}`, 'DELETE')).status).toBe(204);

    const tried = (await call(`${CHAT}/ai-companies/try`, 'POST', { message: 'เปิดกี่โมง', branchId: 1 })).json.result;
    expect(tried.reply).toContain('เปิดกี่โมง');
  });

  it('quick messages: per-branch scopes and lists, CRUD, and the active ones offered inside a room', async () => {
    const scopes = (await get('/quick-messages/scopes')).json.result;
    expect(scopes[0]).toMatchObject({ branchCode: 'GGW-BKK', total: 4, active: 3, channelCount: 3 });
    const rows = (await get('/quick-messages?branchId=1&page=1&perPage=50')).json;
    expect(rows.result).toHaveLength(4);
    const room = (await get('/conversations/1/quick-messages')).json.result;
    expect(room).toMatchObject({ branchId: 1, branchCode: 'GGW-BKK' });
    expect(room.items).toHaveLength(3); // the disabled one is not offered

    const created = (await call(`${CHAT}/quick-messages`, 'POST', { branchId: 1, title: 'ลา', message: 'ขอบคุณค่ะ', active: true })).json.result;
    expect((await get('/conversations/1/quick-messages')).json.result.items).toHaveLength(4);
    await call(`${CHAT}/quick-messages/${created.id}`, 'PATCH', { active: false });
    expect((await get('/conversations/1/quick-messages')).json.result.items).toHaveLength(3);
    expect((await call(`${CHAT}/quick-messages/${created.id}`, 'DELETE')).status).toBe(204);
  });

  it('analytics: a linked customer gets purchase history, scores and charts; an unlinked room gets the "not linked" shape', async () => {
    const linked = (await call(`${CTX}/ai-api/api/analytics/customer`, 'POST', { conversationId: 1 })).json;
    expect(linked.customer).toMatchObject({ matchedBy: 'CODE', linked: true, hasPurchaseHistory: true });
    expect(linked.scores).toMatchObject({ level: 'VIP', overall: 86 });
    expect(linked.scores.notes).toHaveLength(5);
    expect(linked.charts.purchaseTrend).toHaveLength(6);
    expect(linked.purchase.topProducts.length).toBeGreaterThan(0);

    const unlinked = (await call(`${CTX}/ai-api/api/analytics/customer`, 'POST', { conversationId: 3 })).json;
    expect(unlinked.customer).toMatchObject({ matchedBy: 'NONE', linked: false });
    expect(unlinked.scores.level).toBe('NEW');

    const topics = (await call(`${CTX}/ai-api/api/analytics/customer/topics`, 'POST', { conversationId: 1 })).json;
    expect(topics.topics.map((t: any) => t.status)).toEqual(['OK', 'OK', 'EMPTY', 'ERROR']);
    const skipped = (await call(`${CTX}/ai-api/api/analytics/customer/topics`, 'POST', { conversationId: 3 })).json;
    expect(skipped.topics.every((t: any) => t.status === 'SKIPPED')).toBe(true);

    const insight = (await call(`${CTX}/ai-api/api/analytics/customer/insight`, 'POST', { conversationId: 1 })).json;
    expect(insight.recommendations.map((r: any) => r.priority)).toEqual(['HIGH', 'MEDIUM', 'LOW']);
    expect((await call(`${CTX}/ai-api/api/analytics/customer/ask`, 'POST', { conversationId: 1, question: 'ซื้อซ้ำไหม' })).json.answer).toContain('ซื้อซ้ำไหม');
    expect((await call(`${CTX}/ai-api/api/analytics/customer`, 'POST', { conversationId: 999 })).status).toBe(404);
  });

  it('profile name: an agent can rename an unlinked room and restore the provider name; a linked room answers 409', async () => {
    const rooms = (await get('/conversations?perPage=100')).json.result;
    const free = rooms.find((c: any) => !c.prospectName);
    const linked = rooms.find((c: any) => c.prospectName);
    expect(free.profileNameManual).toBe(false);

    const saved = await call(`${CHAT}/conversations/${free.id}/profile-name`, 'PATCH', { profileName: '  ชื่อใหม่  ' });
    expect(saved.status).toBe(200);
    expect(saved.json.result).toMatchObject({ profileName: 'ชื่อใหม่', providerProfileName: free.profileName });
    const again = (await get('/conversations?perPage=100')).json.result.find((c: any) => c.id === free.id);
    expect(again).toMatchObject({ profileName: 'ชื่อใหม่', profileNameManual: true, providerProfileName: free.profileName });

    expect((await call(`${CHAT}/conversations/${free.id}/profile-name`, 'PATCH', { profileName: '   ' })).status).toBe(400);
    expect((await call(`${CHAT}/conversations/${linked.id}/profile-name`, 'PATCH', { profileName: 'x' })).status).toBe(409);

    const back = await call(`${CHAT}/conversations/${free.id}/profile-name`, 'DELETE');
    expect(back.json.result.profileName).toBe(free.profileName);
    expect((await get('/conversations?perPage=100')).json.result.find((c: any) => c.id === free.id).profileNameManual).toBe(false);
  });

  it('by-prospect lists the rooms of one customer (LINE first); link-preview describes a page', async () => {
    const linked = (await get('/conversations?linked=true&perPage=100')).json.result[0];
    const rows = (await get('/conversations?linked=true&perPage=100')).json.result.filter((c: any) => c.prospectCode === linked.prospectCode);
    const pid = (await get('/prospect-social/check?pageId=' + linked.pageId + '&socialId=' + linked.userId)).json.result.prospectId;
    const mine = await get('/conversations/by-prospect?prospectId=' + pid);
    expect(mine.json.result.length).toBeGreaterThan(0);
    expect(mine.json.result.length).toBeLessThanOrEqual(rows.length);
    expect((await get('/conversations/by-prospect?prospectId=999999')).json.result).toEqual([]);

    const pv = await get('/link-preview?url=' + encodeURIComponent('https://example.com/promo'));
    expect(pv.json.result).toMatchObject({ domain: 'example.com', title: expect.stringContaining('example.com') });
    expect((await get('/link-preview?url=nope')).status).toBe(400);
  });

  it('unknown calls are 404s, not silent successes', async () => {
    expect((await get('/nope')).status).toBe(404);
    expect((await get('/conversations/999/messages')).status).toBe(404);
    expect((await call(`${CTX}/elsewhere`)).status).toBe(404);
  });

  it('the fake socket connects, records what the page emits, and pushes a customer message to every listener', async () => {
    const socket = mockChatSocket('http://x', {});
    const onMessage = vi.fn();
    const onConv = vi.fn();
    const onConnect = vi.fn();
    socket.on('connect', onConnect).on('message:new', onMessage).on('conversation:update', onConv);
    expect(socket.connected).toBe(false);
    await vi.waitFor(() => expect(onConnect).toHaveBeenCalled());
    expect(socket.connected).toBe(true);

    socket.emit('conversation:join', '1');
    expect(socket.emitted).toEqual([{ event: 'conversation:join', args: ['1'] }]);

    await get('/conversations'); // builds the sample data
    pushMockIncoming(1, 'สวัสดีผ่าน socket');
    expect(onMessage).toHaveBeenCalledWith(expect.objectContaining({ conversationId: 1, direction: 'IN', body: 'สวัสดีผ่าน socket' }));
    expect(onConv).toHaveBeenCalledWith(expect.objectContaining({ id: 1, unreadCount: 3, lastMessagePreview: 'สวัสดีผ่าน socket' }));

    socket.disconnect();
    onMessage.mockClear();
    pushMockIncoming(1, 'หลังตัดการเชื่อมต่อ');
    expect(onMessage).not.toHaveBeenCalled();
  });
});

describe('Chat mock — the rooms and messages taken from the shared Datasource (ref.chat.json › state)', () => {
  // a frozen clock: two builds are the same minute to the millisecond
  beforeEach(() => {
    (globalThis as any).__CHAT_MOCK_NOW = '2026-11-20T09:00:00.000Z';
    resetMockChat();
  });
  afterEach(() => {
    delete (globalThis as any).__CHAT_MOCK_NOW;
    resetMockupForTests();
    resetMockChat();
  });

  /** the document the export writes, as the Datasource would hold it */
  const exported = (): Record<string, unknown> => {
    registerReferenceLists();
    return referenceDefaults()['chat'];
  };

  it('should give the very same rooms and messages as the formulas when the document is what the formulas made', async () => {
    const before = [await get('/conversations?page=1&perPage=100'), await get('/conversations/1/messages?perPage=100'), await get('/conversations/6/messages?perPage=100')];
    const doc = exported();
    setDatasource({ 'ref.chat': doc }, true);
    resetMockChat();
    const after = [await get('/conversations?page=1&perPage=100'), await get('/conversations/1/messages?perPage=100'), await get('/conversations/6/messages?perPage=100')];
    expect(after).toEqual(before);
  });

  it('should show what the document says: a renamed customer and a new message, with ids given in the order of the list', async () => {
    const doc = exported() as any;
    doc.state.convs[1].profileName = 'ลูกค้าจากไฟล์กลาง';
    doc.state.convs[1].messages.push({ ...doc.state.convs[1].messages[0], body: 'ข้อความจากไฟล์กลาง', minsAgo: 1 });
    setDatasource({ 'ref.chat': doc }, true);
    resetMockChat();
    const list = await get('/conversations?page=1&perPage=100');
    expect(list.json.result.find((c: any) => c.id === 2).profileName).toBe('ลูกค้าจากไฟล์กลาง');
    const msgs = await get('/conversations/2/messages?perPage=100');
    expect(msgs.json.result.map((m: any) => m.body)).toContain('ข้อความจากไฟล์กลาง');
    const ids = (await get('/conversations/1/messages?perPage=100')).json.result.map((m: any) => m.id).sort((a: number, b: number) => a - b);
    expect(ids[0]).toBe(100000);
  });

  it('should go on with the formulas when the document does not fit', async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    const before = (await get('/conversations?page=1&perPage=100')).json.result.length;
    resetMockChat();
    setDatasource({ 'ref.chat': { state: { convs: 'nothing' } } }, true);
    expect((await get('/conversations?page=1&perPage=100')).json.result).toHaveLength(before);
  });
});
