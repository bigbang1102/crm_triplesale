import { afterEach, describe, expect, it, vi } from 'vitest';

const copy = <T>(v: T): T => JSON.parse(JSON.stringify(v)) as T;

afterEach(() => {
  vi.restoreAllMocks();
  vi.resetModules(); // the copies of the modules that the tests made with the file layer on must not stay for the next file
});

/** the lists of the code as the documents of the shared Datasource, from modules that loaded with no document */
async function defaults(): Promise<Record<string, Record<string, any>>> {
  vi.resetModules();
  await import('../../layout/ai-fab/ai-fab.mock');
  await import('../http/mock-countries');
  await import('../../features/dashboard/dashboard.mock.gold');
  await import('../../features/ai/translator/translator.mock');
  await import('../../features/opportunity-detail/opportunity-detail.mock');
  await import('../../features/receipts/receipts.mock');
  await import('../../features/settings/settings.master-mock');
  const { referenceDefaults } = await import('./reference');
  return copy(referenceDefaults()) as Record<string, Record<string, any>>;
}

async function withDocument(docs: Record<string, unknown>): Promise<void> {
  vi.resetModules();
  const datasource = await import('../mockup/mockup-datasource');
  datasource.setDatasource(docs, true);
}

describe('more lists of the mock pages taken from the shared Datasource', () => {
  it('should ask for the lists a document can replace (so the export writes them)', async () => {
    const lists = await defaults();
    expect(Object.keys(lists['aiFab']).sort()).toEqual(['fallback', 'topics']);
    expect(Object.keys(lists['dashboard'])).toEqual(expect.arrayContaining(['goldMasters', 'goldCalendars', 'goldCalendarTasks', 'goldKpiColumns', 'goldStatusOptions']));
    expect(Object.keys(lists['translator'])).toEqual(expect.arrayContaining(['statusLabels', 'statStyles', 'timelineSteps', 'languages', 'thaiMonths']));
    expect(Object.keys(lists['opportunityDetail'])).toEqual(expect.arrayContaining(['extraGroups', 'channels', 'notes']));
    expect(Object.keys(lists['receipts'])).toContain('receiveMethodsOld');
    expect(Object.keys(lists['settings'])).toContain('entities');
    expect(Object.keys(lists['shared'])).toContain('phoneCountries');
  });

  it('should answer the help assistant from the topics of the document, filling in the page and the question', async () => {
    const doc = (await defaults())['aiFab'];
    doc['topics'][0].answer = 'ตอบจากไฟล์กลาง: {title}{page}';
    doc['fallback'] = 'ไม่รู้เรื่อง {q}';
    await withDocument({ 'ref.aiFab': doc });
    const { mockHelpAnswer } = await import('../../layout/ai-fab/ai-fab.mock');
    expect(mockHelpAnswer({ question: 'หน้านี้ใช้งานยังไง', page: '/crm/home', pageTitle: 'Home' }).json.answer).toBe('ตอบจากไฟล์กลาง: Home (`/crm/home`)');
    expect(mockHelpAnswer({ question: 'หน้านี้ใช้งานยังไง' }).json.answer).toBe('ตอบจากไฟล์กลาง: ไม่ทราบชื่อหน้า');
    expect(mockHelpAnswer({ question: 'zzz' }).json.answer).toBe('ไม่รู้เรื่อง zzz');
  });

  it('should answer the help assistant as before when there is no document', async () => {
    vi.resetModules();
    const { mockHelpAnswer } = await import('../../layout/ai-fab/ai-fab.mock');
    const a = mockHelpAnswer({ question: 'เมนูอะไรบ้าง' }).json;
    expect(a.answer).toContain('**CRM**');
    expect(mockHelpAnswer({ question: 'สั่งแปล' }).json.images).toEqual(['images/ai-translator-flow.svg']);
    expect(mockHelpAnswer({ question: 'zzz' }).json.answer).toBe('ยังไม่พบเรื่อง "zzz" ในคู่มือครับ\n\nลองถามเรื่องเมนูต่าง ๆ ของระบบ หรือกดปุ่ม "ถามด่วน" ด้านบนช่องพิมพ์ได้เลย');
  });

  it('should give the phone page the countries of the document', async () => {
    const doc = (await defaults())['shared'];
    doc['phoneCountries'] = [{ code: 'FRA', phoneCountryCode: '+33', phoneNumberFormat: 'X XX XX XX XX' }];
    await withDocument({ 'ref.shared': doc });
    const { MOCK_COUNTRIES } = await import('../http/mock-countries');
    expect(MOCK_COUNTRIES.map((c) => c.code)).toEqual(['FRA']);
  });

  it('should show the text of ref.messages.json for a message of a mock, and the text itself when there is none (or it is empty)', async () => {
    vi.resetModules();
    const none = await import('./reference');
    expect(none.msg('ไม่พบ Lead')).toBe('ไม่พบ Lead');
    await withDocument({ 'ref.messages': { 'ไม่พบ Lead': 'ไม่เจอ Lead นี้', 'ไม่พบผลิตภัณฑ์': '' } });
    const { msg } = await import('./reference');
    expect(msg('ไม่พบ Lead')).toBe('ไม่เจอ Lead นี้');
    expect(msg('ไม่พบผลิตภัณฑ์')).toBe('ไม่พบผลิตภัณฑ์');
    expect(msg('ข้อความอื่น')).toBe('ข้อความอื่น');
  });

  it('should put the values of the mock into {0} {1} of a message, wherever the document wants them', async () => {
    vi.resetModules();
    const none = await import('./reference');
    expect(none.msg('ส่งต่องานไปยัง {0}', 'CS')).toBe('ส่งต่องานไปยัง CS');
    expect(none.msg('{0} ไฟล์ ({1} หน้า)', 2, 14)).toBe('2 ไฟล์ (14 หน้า)');
    await withDocument({ 'ref.messages': { 'ส่งต่องานไปยัง {0}': 'ย้ายงานให้ {0} แล้ว ({1})', '{0} ไฟล์ ({1} หน้า)': '{1} หน้า / {0} ไฟล์' } });
    const { msg } = await import('./reference');
    expect(msg('ส่งต่องานไปยัง {0}', 'CS')).toBe('ย้ายงานให้ CS แล้ว ({1})'); // a place with no value is left as it is
    expect(msg('{0} ไฟล์ ({1} หน้า)', 2, 14)).toBe('14 หน้า / 2 ไฟล์');
  });

  it('should keep the login accounts companies of the code, and take the document when it fits', async () => {
    vi.resetModules();
    const plain = await import('../http/auth-api.mock');
    expect(Object.keys(plain.mockBranches())).toEqual(expect.arrayContaining(['multi', 'multimix', 'nobranch', 'expire']));
    await withDocument({ 'ref.login': { branches: { multi: [{ id: 7, code: 'ONE', name: 'Only One' }], nobranch: [] } } });
    const taken = await import('../http/auth-api.mock');
    expect(taken.mockBranches()['multi']).toEqual([{ id: 7, code: 'ONE', name: 'Only One' }]);
  });

  it('should keep the countries of the code when the document does not fit', async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    const doc = (await defaults())['shared'];
    doc['phoneCountries'] = [{ code: 'FRA' }];
    await withDocument({ 'ref.shared': doc });
    const { MOCK_COUNTRIES } = await import('../http/mock-countries');
    expect(MOCK_COUNTRIES.length).toBeGreaterThan(5);
  });
});
