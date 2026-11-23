import { beforeEach, describe, expect, it } from 'vitest';
import { seedProspect } from '@core/mock/crm-seed';
import type { ReceiptsBackend, RvCreateRequest, RvDetail, RvListItem } from './receipts-backend';
import { createMockReceipts, docTotals, mockLeadRows, mockReceiptDocs, mockReceiptFile, mockRvDetailRaw, resetMockReceipts } from './receipts.mock';

const get = async <T = any>(b: ReceiptsBackend, path: string): Promise<T> => (await b.fetch(path)).json();
const post = async (b: ReceiptsBackend, path: string, body = '{}') => b.fetch(path, { method: 'POST', body });
const listAll = async (b: ReceiptsBackend, extra = ''): Promise<RvListItem[]> => (await get(b, `/rvapi?action=list&page=1&pageSize=500${extra}`)).result.items;

describe('Receipts mock backend (the fake of RvApiServlet + ProspectListServlet + the report servlets)', () => {
  let b: ReceiptsBackend;
  beforeEach(() => {
    resetMockReceipts();
    b = createMockReceipts({ delayMs: 0 });
  });

  describe('GET list', () => {
    it('answers { result: { items, total, page, pageSize } } with the 40 seeded receipts, newest first', async () => {
      const r = await get(b, '/rvapi?action=list&page=1&pageSize=500');
      expect(r.status).toBe(200);
      expect(r.result.total).toBe(40);
      expect(r.result.items).toHaveLength(40);
      const dates = r.result.items.map((i: RvListItem) => i.txdate);
      expect([...dates].sort().reverse()).toEqual(dates);
    });

    it('pages: page 2 of size 15 is the next 15 rows', async () => {
      const all = await listAll(b);
      const p2 = (await get(b, '/rvapi?action=list&page=2&pageSize=15')).result;
      expect(p2.items.map((i: RvListItem) => i.id)).toEqual(all.slice(15, 30).map((i) => i.id));
      expect(p2.page).toBe(2);
    });

    it('filters by status, date range and search text (number, payer, description, maker)', async () => {
      const all = await listAll(b);
      expect((await listAll(b, '&status=cancel')).every((i) => i.status === 'cancel')).toBe(true);
      const from = all[10].txdate;
      expect((await listAll(b, `&dateFrom=${from}`)).every((i) => i.txdate >= from)).toBe(true);
      expect((await listAll(b, `&dateTo=${from}`)).every((i) => i.txdate <= from)).toBe(true);
      const payer = all[3].payername ?? all[3].payer ?? '';
      const hit = await listAll(b, `&search=${encodeURIComponent(payer.toLowerCase())}`);
      expect(hit.length).toBeGreaterThan(0);
      expect(hit.some((i) => i.id === all[3].id)).toBe(true);
      expect(await listAll(b, '&search=zzzzzz-nothing')).toEqual([]);
    });

    it('gives every shape the page reads: all 8 statuses plus one it does not know, ERP and CRM numbers, the old field names on some rows', async () => {
      const all = await listAll(b);
      expect(new Set(all.map((i) => i.status))).toEqual(new Set(['new', 'new1', 'waitToFlow', 'ActionWaitProcess', 'active', 'active1', 'active2', 'cancel', 'pendingReview']));
      expect(all.some((i) => /^RV:M\d+-/.test(i.txno))).toBe(true);
      expect(all.some((i) => /^RV:00-/.test(i.txno))).toBe(true);
      expect(all.some((i) => i.created_by && !i.createbyname)).toBe(true);
      expect(all.some((i) => i.payer_code && !i.payercode)).toBe(true);
      expect(all.some((i) => (i.print_forms ?? []).length === 0)).toBe(true);
      expect(all.some((i) => (i.print_forms ?? []).length === 2)).toBe(true);
    });

    it('the ERP number of a row is in print_forms[].url (txno=), and RV_01_M13 is the form to use', async () => {
      const two = (await listAll(b)).find((i) => (i.print_forms ?? []).length === 2)!;
      expect(two.print_forms!.map((f) => f.code)).toEqual(['RV_02_M13', 'RV_01_M13']);
      for (const f of two.print_forms!) expect(f.url).toMatch(/[?&]txno=RV%3AM\d+-\d{4}-\d{5}/);
    });

    it('every receipt is for a customer of the shared cast (code P…, a name of seedProspect)', async () => {
      for (const i of await listAll(b)) {
        const code = i.payercode ?? i.payer_code ?? '';
        const id = Number(code.slice(1));
        expect(seedProspect(id).code).toBe(code);
      }
    });
  });

  describe('GET detail', () => {
    it('is normalized like RvApiService.detailJson: currency symbol, remark, amounts of the payments, totals and change', async () => {
      const r: { result: RvDetail } = await get(b, '/rvapi?action=detail&id=905');
      const d = r.result;
      expect(d.txno).toBe('RV:M14-2607-00035');
      expect(d.currency_symbol).toBe('฿');
      expect(d.payment_items).toHaveLength(2);
      expect(d.payment_items!.every((p) => p.amount_available === true && typeof p.amount === 'number')).toBe(true);
      expect(d.payments_total).toBeCloseTo(d.netamount_after_vat!, 2);
      expect(d.change_amount).toBe(0);
    });

    it('a cash receipt that was paid with more than the bill has change; a USD receipt has the symbol "USD "', async () => {
      const cash = (await get(b, '/rvapi?action=detail&id=910')).result as RvDetail;
      expect(cash.change_amount).toBeGreaterThan(0);
      // the amount of this one is sent as text ("1,234.50") and still read
      expect(typeof (await get(b, '/rvapi?action=detail&id=910')).result.payment_items[0].amount).toBe('number');
      expect(((await get(b, '/rvapi?action=detail&id=913')).result as RvDetail).currency_symbol).toBe('USD ');
    });

    it('the amounts add up: items before VAT + VAT = the bill; withholding is taken from the amount before VAT', async () => {
      for (const d of mockReceiptDocs()) {
        const t = docTotals(d);
        expect(t.netAfterVat).toBeCloseTo(t.before + t.vat, 2);
        expect(t.pay).toBeCloseTo(t.netAfterVat - t.withholding, 2);
        const r = ((await get(b, `/rvapi?action=detail&id=${d.id}`)).result) as RvDetail;
        expect(r.netamount_after_vat).toBe(t.netAfterVat);
        expect(r.material_items!.reduce((s, m) => s + (m.netamount_after_vat ?? 0), 0)).toBeCloseTo(t.netAfterVat, 2);
      }
    });

    it('an id that does not exist answers 200 with an empty result (the backend does), not 404', async () => {
      const res = await b.fetch('/rvapi?action=detail&id=424242');
      expect(res.status).toBe(200);
      expect((await res.json()).result.txno).toBeUndefined();
    });
  });

  describe('GET leads / products / masters', () => {
    it('leads: { result: [{ leadId, code, name, txNo, employeeName, leadStatus }] }, newest first; search filters', async () => {
      const r = await get(b, '/rvapi?action=leads');
      expect(Array.isArray(r.result)).toBe(true);
      expect(r.result.length).toBe(240);
      expect(Object.keys(r.result[0]).sort()).toEqual(['code', 'employeeName', 'leadId', 'leadStatus', 'name', 'txNo']);
      const one = r.result[7];
      const hit = (await get(b, `/rvapi?action=leads&search=${encodeURIComponent(one.txNo)}`)).result;
      expect(hit.map((x: any) => x.txNo)).toEqual([one.txNo]);
    });

    it('the lead number of a list row (merged by the page through the prospect code) is the reference number of its detail', async () => {
      const leads: { code: string; txNo: string }[] = (await get(b, '/rvapi?action=leads')).result;
      const first = new Map<string, string>();
      for (const l of leads) if (!first.has(l.code)) first.set(l.code, l.txNo);
      for (const i of (await listAll(b)).slice(0, 10)) {
        const d = (await get(b, `/rvapi?action=detail&id=${i.id}`)).result as RvDetail;
        expect(d.reference_docno).toBe(first.get(d.payer_code!));
      }
    });

    it('products: movement types LD, three of them map to M13 / M14 / M15 on the page', async () => {
      const r = (await get(b, '/rvapi?action=products')).result as { code: string; name: string }[];
      expect(r.map((p) => p.code)).toEqual(expect.arrayContaining(['LD-WFS-A', 'LD-WFS-B', 'LD-WFS']));
    });

    it('materials, branches, currencies, receive methods and attachment types answer in the shapes the form reads', async () => {
      expect((await get(b, '/rvapi?action=materials')).result[0]).toEqual(expect.objectContaining({ code: expect.any(String), name: expect.any(String), salePrice: expect.any(Number) }));
      expect((await get(b, '/rvapi?action=branches')).result[0]).toEqual({ branchId: 1, branchCode: 'SUN', branchName: expect.any(String) });
      const cur = (await get(b, '/rvapi?action=currencies')).result;
      expect(cur.baseCurrency).toBe('THB');
      expect(cur.items.map((c: any) => c.code)).toEqual(['THB', 'USD']);
      const methods = (await get(b, '/rvapi?action=receiveMethods')).result;
      expect(methods.map((m: any) => m.type)).toEqual(['cash', 'creditcard', 'transfer', 'cheque', 'voucher', 'thirdparty']);
      expect(methods.find((m: any) => m.type === 'cheque').items).toEqual([]);
      expect(methods.find((m: any) => m.type === 'thirdparty').count).toBe(0);
      expect((await get(b, '/rvapi?action=attachFileTypes')).result.map((t: any) => t.name)).toEqual(['pdf', 'png', 'image']);
    });

    it('an unknown action answers 400 { message: "unknown action" } like the servlet', async () => {
      const r = await b.fetch('/rvapi?action=nope');
      expect(r.status).toBe(400);
      expect(await r.json()).toEqual({ message: 'unknown action' });
    });

    it('the context path of the Java app is accepted in front of the path', async () => {
      expect((await get(b, '/triplesale/rvapi?action=products')).result.length).toBeGreaterThan(0);
    });
  });

  describe('POST approve', () => {
    const approve = async (txno: string) => (await (await post(b, `/rvapi?action=approve&txno=${encodeURIComponent(txno)}`)).json()).result;

    it('a receipt at new1 is approved: hopDone true, and the list shows it as active1 afterwards', async () => {
      const it = (await listAll(b)).find((i) => i.status === 'new1')!;
      expect(await approve(it.txno)).toMatchObject({ result: true, status: 200, hopDone: true, txno: it.txno });
      expect((await listAll(b)).find((i) => i.id === it.id)!.status).toBe('active1');
    });

    it('a receipt that cannot be approved yet answers hopDone false and stays as it is', async () => {
      const it = (await listAll(b)).find((i) => i.status === 'new')!;
      expect(await approve(it.txno)).toMatchObject({ result: true, hopDone: false });
      expect((await listAll(b)).find((i) => i.id === it.id)!.status).toBe('new');
    });

    it('an unknown number: result false / status 404; no number: 400', async () => {
      expect(await approve('RV:NOPE')).toMatchObject({ result: false, status: 404 });
      const r = await post(b, '/rvapi?action=approve');
      expect(r.status).toBe(400);
    });
  });

  describe('POST with a GET-only action and the prospect list', () => {
    it('POST list is an unknown action', async () => {
      expect((await post(b, '/rvapi?action=list')).status).toBe(400);
    });

    it('prospect-list (enrich): { result: { items, meta } } filtered by searchText, 8 per page', async () => {
      const r = await get(b, '/board/prospect-list?page=1&perPage=8&enrich=1&searchText=');
      expect(r.result.items).toHaveLength(8);
      expect(r.result.meta).toMatchObject({ page: 1, perPage: 8, total: 180 });
      expect(Object.keys(r.result.items[0])).toEqual(expect.arrayContaining(['id', 'code', 'name', 'phone', 'addr', 'avatar']));
      const hit = await get(b, `/board/prospect-list?page=1&perPage=8&enrich=1&searchText=${encodeURIComponent(r.result.items[3].code)}`);
      expect(hit.result.items.map((x: any) => x.code)).toContain(r.result.items[3].code);
    });
  });

  describe('POST create (RvApiService.createAndVerifyJson)', () => {
    const body = (over: Partial<RvCreateRequest> = {}): RvCreateRequest => ({
      payerCode: 'P00012', txDate: '2026-10-20', referenceDocNo: 'LD:00-1', taxInvoiceNo: 'TI-1', remark: 'ทดสอบ', branchCode: 'SUN', currencyCode: 'THB', exchangeRate: 1,
      items: [{ materialCode: 'SV-LOAN-FEE', detail: '', value: 5000, taxPercent: 7, withholdingPercent: 3 }],
      payments: [{ methodCode: 'CASH', amount: 5350 }],
      ...over,
    });
    const create = async (req: RvCreateRequest, fb = b) => (await fb.fetch('/rvapi?action=create', { method: 'POST', body: JSON.stringify(req) })).json();

    it('creates the receipt: { api: { status 200, result: { result, txno } }, verify: { totalBefore, totalAfter, persisted } } and the list has it on top as "new"', async () => {
      const r = await create(body());
      expect(r.api).toMatchObject({ status: 200, result: { result: true, txno: 'RV:00-2026-1020-120000-0001' } });
      expect(r.verify).toEqual({ totalBefore: 40, totalAfter: 41, foundByRemark: 1, persisted: true });
      const top = (await listAll(b))[0];
      expect(top).toMatchObject({ txno: 'RV:00-2026-1020-120000-0001', status: 'new', payername: seedProspect(12).fullName, payercode: 'P00012', description: 'ทดสอบ' });
      expect(top.print_forms).toEqual([]); // not in the ERP yet
      const d = (await get(b, `/rvapi?action=detail&id=${top.id}`)).result as RvDetail;
      expect(d).toMatchObject({ reference_docno: 'LD:00-1', taxinvoice_txno: 'TI-1', currency_code: 'THB', netamount_before_vat: 5000, vat_amount: 350, netamount_after_vat: 5350, pay_amount: 5200 });
      expect(d.payments_total).toBe(5350);
    });

    it('numbers the receipts in turn and keeps the amounts of a line with VAT included exactly (value*100/107 + 7% = the bill)', async () => {
      const incl = 500;
      const r = await create(body({ items: [{ materialCode: 'SV-LEGAL', detail: 'x', value: (incl * 100) / 107, taxPercent: 7, withholdingPercent: 0 }], payments: [{ methodCode: 'CASH', amount: 500 }] }));
      expect(r.api.result.txno).toBe('RV:00-2026-1020-120000-0001');
      expect((await create(body())).api.result.txno).toBe('RV:00-2026-1020-120000-0002');
      const d = (await get(b, `/rvapi?action=detail&id=${(await listAll(b))[1].id}`)).result as RvDetail;
      expect(d.netamount_after_vat).toBe(500);
      expect(d.vat_amount).toBe(32.71);
    });

    it('accepts the ERP code of a customer (CUS…) and turns a rejected receipt into { api.error.message } without saving anything', async () => {
      expect((await create(body({ payerCode: 'CUS00012' }))).api.status).toBe(200);
      const cases: [Partial<RvCreateRequest>, string][] = [
        [{ payerCode: 'X' }, 'ไม่พบผู้ชำระเงิน'],
        [{ branchCode: 'NOPE' }, 'ไม่พบสาขา'],
        [{ items: [] }, 'รายการสินค้า'],
        [{ items: [{ materialCode: 'NOPE', detail: '', value: 1, taxPercent: 7, withholdingPercent: 0 }] }, 'รายการสินค้า'],
        [{ payments: [] }, 'รับชำระ'],
        [{ attachments: [{ fileName: 'a.jpg', fileType: 'jpg', contentBase64: 'eA==' }] }, 'ประเภทไฟล์แนบ'],
      ];
      const before = (await listAll(b)).length;
      for (const [over, text] of cases) {
        const r = await create(body(over));
        expect(r.api.status, text).toBe(400);
        expect(r.api.error.message, text).toContain(text);
        expect(r.verify.persisted, text).toBe(false);
      }
      expect((await listAll(b)).length).toBe(before);
    });

    it('faults: pending (accepted, not visible), reject / details / text / empty answers, 403, html, no answer, echo', async () => {
      const fb = (fault: string) => createMockReceipts({ delayMs: 0, fault });
      const pending = await create(body(), fb('create-pending'));
      expect(pending.api.result.result).toBe(true);
      expect(pending.verify.persisted).toBe(false);
      expect((await listAll(b)).length).toBe(40);
      expect((await create(body(), fb('create-reject'))).api.error.message).toMatch(/ERP/);
      expect((await create(body(), fb('create-details'))).api.error.details.items[0]).toMatch(/materialCode/);
      expect((await create(body(), fb('create-text'))).api.error).toBe('EJB EntityContext null');
      expect((await create(body(), fb('create-empty'))).api).toEqual({});
      const r403 = await fb('create-403').fetch('/rvapi?action=create', { method: 'POST', body: '{}' });
      expect(r403.status).toBe(403);
      expect((await fb('create-html').fetch('/rvapi?action=create', { method: 'POST', body: '{}' })).status).toBe(502);
      await expect(fb('create-down').fetch('/rvapi?action=create', { method: 'POST', body: '{}' })).rejects.toThrow('Failed to fetch');
      const echo = await create(body(), fb('create-echo'));
      expect(JSON.parse(echo.api.error.message)).toEqual(body());
      expect((await listAll(b)).length).toBe(40);
    });

    it('a body that is not JSON is an internal error (500), like the servlet', async () => {
      const r = await b.fetch('/rvapi?action=create', { method: 'POST', body: '{nope' });
      expect(r.status).toBe(500);
    });
  });

  describe('prefill from a lead (/board/lead, /board/prospect)', () => {
    it('GET lead: the lead with its prospect and materialList; the txNo is the one the lead list shows', async () => {
      const l = await get(b, '/board/lead?id=4');
      expect(l).toMatchObject({ id: 4, prospect: { id: 4, name: seedProspect(4).fullName } });
      expect(l.txNo).toMatch(/^LD:00-\d{4}-\d{4}-\d{6}-\d{4}$/);
      expect(l.materialList.map((m: any) => m.id)).toEqual([1004400040, 1004400041]);
      const fromList = (await get(b, '/rvapi?action=leads')).result.find((x: any) => x.leadId === 4);
      expect(fromList.txNo).toBe(l.txNo);
    });

    it('a lead of several groups answers 400 unless the group is given; an unknown lead 404; some leads have no items, one has an item the master does not know', async () => {
      const no = await b.fetch('/board/lead?id=7');
      expect(no.status).toBe(400);
      expect((await no.json()).error.code).toBe('ACTIVITY_GROUP_REQUIRED');
      expect((await b.fetch('/board/lead?id=7&activityGroupId=101')).status).toBe(200);
      expect((await b.fetch('/board/lead?id=999')).status).toBe(404);
      expect((await get(b, '/board/lead?id=10')).materialList).toEqual([]);
      expect((await get(b, '/board/lead?id=11')).materialList.map((m: any) => m.code)).toContain('SV-LEGACY');
    });

    it('GET prospect: the code the form sends as payerCode — "CUS…" (an ERP code) for every 5th customer, "P…" for the rest', async () => {
      expect((await get(b, '/board/prospect?id=5')).code).toBe('CUS00005');
      expect((await get(b, '/board/prospect?id=4')).code).toBe('P00004');
      expect((await b.fetch('/board/prospect?id=0')).status).toBe(404);
    });

    it('faults: lead-down / prospect-down have no answer, lead-error answers 500 with error.message', async () => {
      await expect(createMockReceipts({ delayMs: 0, fault: 'lead-down' }).fetch('/board/lead?id=4')).rejects.toThrow('Failed to fetch');
      await expect(createMockReceipts({ delayMs: 0, fault: 'prospect-down' }).fetch('/board/prospect?id=4')).rejects.toThrow('Failed to fetch');
      const r = await createMockReceipts({ delayMs: 0, fault: 'lead-error' }).fetch('/board/lead?id=4');
      expect(r.status).toBe(500);
      expect((await r.json()).error.message).toBeTruthy();
    });
  });

  describe('masters under fault', () => {
    const fb = (fault: string) => createMockReceipts({ delayMs: 0, fault });
    it('materials: 500 / empty; branches: html / 409 with the reason / a single one; currencies 500; methods html / empty / old shape; attachment types empty / 500 / html', async () => {
      expect((await fb('materials-error').fetch('/rvapi?action=materials')).status).toBe(500);
      expect((await (await fb('materials-empty').fetch('/rvapi?action=materials')).json()).result).toEqual([]);
      expect((await fb('branches-error').fetch('/rvapi?action=branches')).status).toBe(502);
      const c409 = await fb('branches-409').fetch('/rvapi?action=branches');
      expect(c409.status).toBe(409);
      expect((await c409.json()).error.message).toBeTruthy();
      expect((await (await fb('branches-one').fetch('/rvapi?action=branches')).json()).result).toHaveLength(1);
      expect((await fb('currencies-error').fetch('/rvapi?action=currencies')).status).toBe(500);
      expect((await fb('methods-error').fetch('/rvapi?action=receiveMethods')).status).toBe(502);
      expect((await (await fb('methods-empty').fetch('/rvapi?action=receiveMethods')).json()).result).toEqual([]);
      expect((await (await fb('methods-old').fetch('/rvapi?action=receiveMethods')).json()).result[0]).toEqual(expect.objectContaining({ code: 'CASH', label: 'เงินสด', type: 'cash' }));
      expect((await (await fb('attach-empty').fetch('/rvapi?action=attachFileTypes')).json()).result).toEqual([]);
      expect((await fb('attach-error').fetch('/rvapi?action=attachFileTypes')).status).toBe(500);
      expect((await fb('attach-html').fetch('/rvapi?action=attachFileTypes')).status).toBe(502);
    });
  });

  describe('faults (?mock=…)', () => {
    const fb = (fault: string) => createMockReceipts({ delayMs: 0, fault });

    it('empty: no receipts', async () => {
      expect((await (await fb('empty').fetch('/rvapi?action=list')).json()).result.items).toEqual([]);
    });
    it('list-html answers an HTML page (the page cannot parse it), list-down has no answer at all', async () => {
      const r = await fb('list-html').fetch('/rvapi?action=list');
      expect(r.status).toBe(502);
      // (the page shows this text: it is worded like a network response's — no "Failed to execute 'json' on 'Response'" prefix)
      const err: unknown = await r.json().catch((e: unknown) => e);
      expect(err).toBeInstanceOf(SyntaxError);
      expect((err as Error).message).not.toContain('Failed to execute');
      await expect(fb('list-down').fetch('/rvapi?action=list')).rejects.toThrow('Failed to fetch');
    });
    it('leads-error / products-error answer 500 with the servlet body', async () => {
      for (const [fault, action] of [['leads-error', 'leads'], ['products-error', 'products']]) {
        const r = await fb(fault).fetch(`/rvapi?action=${action}`);
        expect(r.status).toBe(500);
        expect(await r.json()).toEqual({ message: 'internal error' });
      }
    });
    it('detail-missing answers an empty result, detail-error an HTML page', async () => {
      expect((await (await fb('detail-missing').fetch('/rvapi?action=detail&id=901')).json()).result.txno).toBeUndefined();
      expect((await fb('detail-error').fetch('/rvapi?action=detail&id=901')).status).toBe(502);
    });
    it('approve-403 / approve-500 / approve-down', async () => {
      const r = await fb('approve-403').fetch('/rvapi?action=approve&txno=RV:1', { method: 'POST' });
      expect(r.status).toBe(403);
      expect((await r.json()).status).toBe(403);
      expect((await fb('approve-500').fetch('/rvapi?action=approve&txno=RV:1', { method: 'POST' })).status).toBe(500);
      await expect(fb('approve-down').fetch('/rvapi?action=approve&txno=RV:1', { method: 'POST' })).rejects.toThrow('Failed to fetch');
    });
  });

  describe('rest-* faults (what RvApiService answers when the REST call under an action fails) and what the fake REST service of the live comparison reads', () => {
    const fb = (fault: string) => createMockReceipts({ delayMs: 0, fault });
    const ENVELOPE = { status: 502, message: 'backend ไม่ตอบหรือ response ไม่ใช่ JSON' };

    it('a failed read is the 502 envelope with HTTP 200; leads and materials swallow it into an empty list', async () => {
      const table: [string, string][] = [['rest-list', 'list'], ['rest-list-down', 'list'], ['rest-detail', 'detail&id=901'], ['rest-products', 'products'], ['rest-branches', 'branches'], ['rest-branches-409', 'branches'], ['rest-currencies', 'currencies'], ['rest-methods', 'receiveMethods'], ['rest-attach', 'attachFileTypes']];
      for (const [fault, action] of table) {
        const r = await fb(fault).fetch(`/rvapi?action=${action}`);
        expect([fault, r.status, await r.json()]).toEqual([fault, 200, ENVELOPE]);
      }
      for (const [fault, action] of [['rest-leads', 'leads'], ['rest-materials', 'materials']]) {
        const r = await fb(fault).fetch(`/rvapi?action=${action}`);
        expect([fault, r.status, await r.json()]).toEqual([fault, 200, { result: [] }]);
      }
    });

    it('a rest-* fault belongs to ONE action: the other actions answer as usual', async () => {
      expect((await (await fb('rest-list').fetch('/rvapi?action=products')).json()).result).toHaveLength(4);
    });

    it('approve: the body of the failed REST call goes on (HTTP 200); no answer is the envelope', async () => {
      const ask = (fault: string) => fb(fault).fetch('/rvapi?action=approve&txno=RV:1', { method: 'POST' });
      expect([(await ask('rest-approve-500')).status, await (await ask('rest-approve-500')).json()]).toEqual([200, { status: 500, message: 'Internal Server Error' }]);
      expect(await (await ask('rest-approve-403')).json()).toEqual({ status: 403, message: 'Forbidden' });
      expect(await (await ask('rest-approve-down')).json()).toEqual(ENVELOPE);
    });

    it('create: the POST failed — api is the envelope with the text that came, the totals did not move', async () => {
      const body = JSON.stringify({ payerCode: 'P00012', remark: '' });
      const html = await (await fb('rest-create-html').fetch('/rvapi?action=create', { method: 'POST', body })).json();
      expect(html.api).toEqual({ ...ENVELOPE, raw: expect.stringContaining('502') });
      expect(html.verify).toEqual({ totalBefore: 40, totalAfter: 40, foundByRemark: -1, persisted: false });
      const down = await (await fb('rest-create-down').fetch('/rvapi?action=create', { method: 'POST', body })).json();
      expect(down.api).toEqual({ ...ENVELOPE, raw: '' });
      expect(mockReceiptDocs()).toHaveLength(40);
    });

    it('mockRvDetailRaw is the service answer before the normaliser; mockLeadRows the leads of the cast, newest first', async () => {
      const raw = mockRvDetailRaw('905');
      expect(raw).toMatchObject({ status: 200, message: 'success', result: { id: 905 } });
      expect(raw.result).not.toHaveProperty('currency_symbol');
      expect(mockRvDetailRaw('424242').result).toEqual({});
      const bff = (await get(b, '/rvapi?action=detail&id=905')).result;
      expect(bff.currency_symbol).toBe('฿');
      expect(mockLeadRows().length).toBeGreaterThan(100);
    });
  });

  describe('report files (/rvreport, /rvreceipt)', () => {
    const text = (f: { body: Uint8Array }) => new TextDecoder().decode(f.body);

    it('rvreport?txno= of an ERP number is a PDF; the PNG is a PNG; both are valid files', () => {
      const synced = mockReceiptDocs().find((d) => d.erpTxno)!;
      const pdf = mockReceiptFile(`/rvreport?txno=${encodeURIComponent(synced.erpTxno)}`);
      expect(pdf.status).toBe(200);
      expect(pdf.type).toBe('application/pdf');
      expect(text(pdf).startsWith('%PDF-1.4')).toBe(true);
      expect(text(pdf)).toContain('%%EOF');
      expect(text(pdf)).toContain(synced.erpTxno.replace(/[()\\]/g, ''));
      const png = mockReceiptFile(`/triplesale/rvreport?txno=${encodeURIComponent(synced.erpTxno)}&format=png`);
      expect(png.type).toBe('image/png');
      expect([...png.body.slice(0, 8)]).toEqual([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
      expect(String.fromCharCode(...png.body.slice(-8, -4))).toBe('IEND');
    });

    it('the PDF cross-reference table points at the real object offsets', () => {
      const pdf = text(mockReceiptFile(`/rvreport?txno=${encodeURIComponent(mockReceiptDocs().find((d) => d.erpTxno)!.erpTxno)}`));
      const xref = Number(/startxref\n(\d+)/.exec(pdf)![1]);
      expect(pdf.slice(xref, xref + 4)).toBe('xref');
      const offsets = [...pdf.slice(xref).matchAll(/^(\d{10}) 00000 n $/gm)].map((m) => Number(m[1]));
      expect(offsets).toHaveLength(5);
      offsets.forEach((o, i) => expect(pdf.slice(o, o + `${i + 1} 0 obj`.length)).toBe(`${i + 1} 0 obj`));
    });

    it('errors are plain text like the servlets: 400 without / with a bad txno, 502 for a number the ERP does not know, 404 for an unknown id', () => {
      expect(mockReceiptFile('/rvreport').status).toBe(400);
      expect(mockReceiptFile('/rvreport?txno=a%20b;drop').status).toBe(400);
      const unknown = mockReceiptFile('/rvreport?txno=RV:NOPE-1');
      expect(unknown.status).toBe(502);
      expect(unknown.type).toMatch(/^text\/plain/);
      expect(mockReceiptFile('/rvreceipt').status).toBe(400);
      expect(mockReceiptFile('/rvreceipt?id=424242').status).toBe(404);
      expect(mockReceiptFile('/rvreceipt?id=905').type).toBe('application/pdf');
    });

    it('the same address gives the same bytes (both sides of the comparison get one file)', () => {
      const a = mockReceiptFile('/rvreceipt?id=905').body;
      const c = mockReceiptFile('/rvreceipt?id=905').body;
      expect(a).toEqual(c);
      expect(mockReceiptFile('/rvreceipt?id=906').body).not.toEqual(a);
    });

    it('the backend exposes the same function as file()', () => {
      expect(b.file('/rvreceipt?id=905').type).toBe('application/pdf');
    });
  });
});
