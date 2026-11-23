import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createMockXhr, mockAitranDocument, mockTranslatorFetch, resetMockTranslator } from './translator.mock';

const BASE = '/triplesale';
const NOW = new Date(2026, 9, 20, 10, 30).toISOString();

const get = async (path: string) => mockTranslatorFetch(`${BASE}${path}`, undefined, BASE);
const post = async (path: string, fields: Record<string, string | File> = {}) => {
  const fd = new FormData();
  for (const [k, v] of Object.entries(fields)) fd.append(k, v);
  return mockTranslatorFetch(`${BASE}${path}`, { method: 'POST', body: fd }, BASE);
};
const list = async () => (await (await get('/aitran?action=list')).json()) as { ok: boolean; stats: any[]; documents: any[] };
const doc = async (no: string) => (await list()).documents.find((d) => d.no === no);

describe('AI translator fake backend', () => {
  beforeEach(() => {
    (globalThis as any).__AIT_MOCK_NOW = NOW;
    resetMockTranslator();
  });
  afterEach(() => delete (globalThis as any).__AIT_MOCK_NOW);

  it('lists documents with Thai dates (Buddhist year) and 8 statistic cards that count them', async () => {
    const { ok, stats, documents } = await list();
    expect(ok).toBe(true);
    expect(documents).toHaveLength(14);
    // "8 ก.ย. 2569 09:44" — what the servlet sends and the page parses back with thaiToNum()
    expect(documents[0].createdAt).toMatch(/^\d{1,2} \S+ 2569 \d{2}:\d{2}$/);
    expect(stats.map((s) => s.key)).toEqual(['all', 'quoted', 'pending', 'translating', 'reviewing', 'sent', 'approved', 'done']);
    expect(stats[0].value).toBe(13); // the cancelled one is not counted
    expect(stats.find((s) => s.key === 'pending').value).toBe(2);
    expect(documents.find((d: any) => d.no === 'QT-2026-00012')).toMatchObject({ rejectCount: 2, status: 'pending' });
  });

  it('keeps the real status flow: each button moves the document one step, a stale click is a 409 conflict', async () => {
    expect((await post('/aitran?action=confirm', { no: 'QT-2026-00014' })).status).toBe(200);
    expect((await doc('QT-2026-00014')).status).toBe('pending');
    const again = await post('/aitran?action=confirm', { no: 'QT-2026-00014' });
    expect(again.status).toBe(409);
    expect(await again.json()).toMatchObject({ ok: false, conflict: true });

    await post('/aitran?action=send', { no: 'QT-2026-00009' });
    await post('/aitran?action=approve', { no: 'QT-2026-00009' });
    await post('/aitran?action=complete', { no: 'QT-2026-00009' });
    expect((await doc('QT-2026-00009')).status).toBe('done');
  });

  it('rejecting and cancelling need a reason; a rejected document goes back to "pending" with the reason and a count', async () => {
    expect((await post('/aitran?action=reject', { no: 'QT-2026-00009' })).status).toBe(400);
    expect((await post('/aitran?action=reject', { no: 'QT-2026-00009', reason: 'ตกหน้า 3' })).status).toBe(200);
    expect(await doc('QT-2026-00009')).toMatchObject({ status: 'pending', rejectReason: 'ตกหน้า 3', rejectCount: 1 });

    expect((await post('/aitran?action=cancel', { no: 'QT-2026-00009', reason: '  ' })).status).toBe(400);
    expect((await post('/aitran?action=cancel', { no: 'QT-2026-00009', reason: 'ลูกค้าเปลี่ยนใจ' })).status).toBe(200);
    expect(await doc('QT-2026-00009')).toMatchObject({ status: 'cancelled', cancelReason: 'ลูกค้าเปลี่ยนใจ' });
    // a finished document cannot be cancelled or edited
    expect((await post('/aitran?action=cancel', { no: 'QT-2026-00004', reason: 'x' })).status).toBe(409);
    expect((await post('/aitran?action=edit', { no: 'QT-2026-00004', dueAt: '' })).status).toBe(409);
  });

  it('a document sent to translation comes back as "reviewing" after two more list calls (what the polling waits for)', async () => {
    await post('/aitran?action=translate', { no: 'QT-2026-00013' });
    expect((await doc('QT-2026-00013')).status).toBe('translating'); // list call 1
    expect((await doc('QT-2026-00013')).status).toBe('reviewing'); // list call 2
    // the documents that were already being translated stay so (a seed document has no clock)
    expect((await doc('QT-2026-00011')).status).toBe('translating');
  });

  it('edit takes the due date as dd/mm/yyyy only, and skips languages that are not sent', async () => {
    const bad = await post('/aitran?action=edit', { no: 'QT-2026-00014', dueAt: '2026-10-25' });
    expect(bad.status).toBe(400);
    expect((await bad.json()).error).toContain('dd/mm/yyyy');

    const ok = await post('/aitran?action=edit', { no: 'QT-2026-00014', dueAt: '25/10/2026', contact: 'คุณทดสอบ', docType: 'เอกสารเทคนิค', srcLang: 'th', dstLang: '', remark: 'ด่วน' });
    expect(ok.status).toBe(200);
    expect(await doc('QT-2026-00014')).toMatchObject({ dueAt: '25 ต.ค. 2569', contact: 'คุณทดสอบ', docType: 'เอกสารเทคนิค', srcLang: 'TH', dstLang: 'TH', remark: 'ด่วน' });
  });

  it('save creates the quotation: pages from the files, price = max(pages × 150, 500), on top of the list', async () => {
    const pdf = new File(['x'.repeat(2048)], 'a.pdf');
    const png = new File(['y'.repeat(1024)], 'b.png');
    const res = await post('/aitran?action=save', { customerId: '103', customerName: 'คุณกัญญารัตน์ วงศ์สกุล', salesAgent: 'S000', file_0: pdf, path_0: 'docs/a.pdf', file_1: png, path_1: 'b.png' });
    const body = await res.json();
    expect(body).toMatchObject({ ok: true, files: 2, pages: 5, price: 750 });
    expect(body.quoteNo).toBe('QT-2026-00015');
    const created = (await list()).documents[0];
    expect(created).toMatchObject({ no: 'QT-2026-00015', status: 'quoted', customer: 'คุณกัญญารัตน์ วงศ์สกุล', files: 2 });
    expect(created.docFiles.map((f: any) => f.name)).toEqual(['a.pdf', 'b.png']);

    expect((await post('/aitran?action=save', { customerName: 'x' })).status).toBe(400); // no files
    expect((await post('/aitran?action=save', { file_0: pdf, path_0: 'a.pdf' })).status).toBe(400); // no customer
  });

  it('lists the translated files only once there are some, with the quality verdict', async () => {
    expect((await (await get('/aitran?action=translated&no=QT-2026-00013')).json()).files).toEqual([]);
    const { files } = await (await get('/aitran?action=translated&no=QT-2026-00009')).json();
    expect(files.map((f: any) => f.ext)).toEqual(['docx', 'pdf', 'docx', 'pdf']);
    expect(files[0].quality).toMatchObject({ passed: true });
    expect(files[2].quality).toMatchObject({ passed: false, missing: expect.any(Array) });
  });

  it('the translator assistant answers about the selected document and says so when none is selected', async () => {
    const chat = async (message: string, quoteNo = '') => {
      const r = await mockTranslatorFetch(`${BASE}/aitran?action=chat`, { method: 'POST', body: new URLSearchParams({ message, quoteNo }).toString() }, BASE);
      return { status: r.status, json: await r.json() };
    };
    expect((await chat('สรุปใบนี้ให้หน่อย', 'QT-2026-00013')).json.reply).toContain('QT-2026-00013');
    expect((await chat('ราคารวมเท่าไหร่', 'QT-2026-00013')).json.reply).toContain('2,100');
    expect((await chat('สรุป', '')).json.reply).toContain('ยังไม่ได้เลือกเอกสาร');
    expect((await chat('ทดสอบล่ม', 'QT-2026-00013')).status).toBe(502);
  });

  it('searches customers like /board/prospect-list (code, name, phone, e-mail, address)', async () => {
    const find = async (q: string) => (await (await get(`/board/prospect-list?page=1&perPage=8&enrich=1&searchText=${encodeURIComponent(q)}`)).json()).result.items;
    expect((await find('เอซีอี')).map((c: any) => c.code)).toEqual(['CUS-000101']);
    expect((await find('somchai')).map((c: any) => c.id)).toEqual([102]);
    expect((await find('092-333')).map((c: any) => c.name)).toEqual(['Michael Brown']);
    expect(await find('zzzz')).toEqual([]);
    expect((await find('')).length).toBe(6);
  });

  it('opens a stand-in page for the quotation / a translated file', () => {
    const q = mockAitranDocument('/triplesale/aitran?action=quotation&no=QT-2026-00013');
    expect(q.type).toContain('text/html');
    expect(q.data).toContain('<title>ใบเสนอราคา QT-2026-00013</title>');
    expect(mockAitranDocument('/triplesale/aitran?action=file&no=QT-2026-00009&kind=trans&name=Invoice.docx').data).toContain('<title>Invoice.docx QT-2026-00009</title>');
  });

  it('XMLHttpRequest stand-in: reports upload progress, then answers like the fetch; abort() silences it', async () => {
    const xhr = createMockXhr(BASE);
    const events: string[] = [];
    xhr.upload.onprogress = (e: any) => events.push(`${e.loaded}/${e.total}`);
    const done = new Promise<void>((resolve) => (xhr.onload = () => resolve()));
    const fd = new FormData();
    fd.append('no', 'QT-2026-00014');
    xhr.open('POST', `${BASE}/aitran?action=confirm`, true);
    xhr.send(fd);
    await done;
    expect(xhr.status).toBe(200);
    expect(JSON.parse(xhr.responseText)).toMatchObject({ ok: true });
    expect(events.length).toBe(2);
    expect(events[1].split('/')[0]).toBe(events[1].split('/')[1]); // 100 %

    const aborted = createMockXhr(BASE);
    let fired = false;
    aborted.onload = () => (fired = true);
    aborted.open('POST', `${BASE}/aitran?action=confirm`, true);
    aborted.send(fd);
    aborted.abort();
    await new Promise((r) => setTimeout(r, 300));
    expect(fired).toBe(false);
  });
});
