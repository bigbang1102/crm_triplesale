import { ComponentFixture, TestBed } from '@angular/core/testing';
import { Type, signal } from '@angular/core';
import { provideRouter } from '@angular/router';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AuthService } from '@core/auth/auth.service';
import { SessionInfo } from '@core/auth/auth.models';
import { ConfigService } from '@core/config/config.service';
import { I18n } from '@core/i18n/i18n.service';
import { PermissionService } from '@core/permissions/permission.service';
import { configStub } from '@core/testing/test-helpers';
import { SalesDocBackend } from './sales-doc-backend';
import { SalesDocFormBase } from './sales-doc-form-base';
import { SalesDocBkView } from './sales-doc-bk-view';
import { SalesDocObView } from './sales-doc-ob-view';
import { SalesDocQtView } from './sales-doc-qt-view';
import { createSalesDocLibs, createSalesDocRuntime } from './sales-doc-libs.engine';
import { createMockSalesDoc, resetMockSalesDoc } from './sales-doc.mock';

/*
 * The business logic of the sales documents: the lines (quantity x price, discount in baht or %, VAT included / excluded / exempt, the discount
 * of the whole document spread over the lines), the totals, the baht text of the printed form. The expected numbers are worked out by hand
 * below each case (they are the rules of sales_doc_items.js: half-up rounding of every amount to the satang, VAT 7 %).
 */

// the page runs real timers against the fake backend (latency, 80 ms scans of the dropdowns …): more than vitest's 5 s when the machine is busy
vi.setConfig({ testTimeout: 30000 });

const lang = signal<'th' | 'en'>('th');
const session = signal<SessionInfo | null>({
  username: 'demo', profileName: 'สมชาย ใจดี (ทดลอง)', employeeId: 1001, employeeCode: 'E1001', branch: { id: 1004400123, code: 'SUN', name: 'SUN GATEWAY' }, branchCode: 'SUN', roles: ['super_admin'],
});

class FakeIntersectionObserver {
  observe(): void {}
  unobserve(): void {}
  disconnect(): void {}
}

describe('Sales-document calculations', () => {
  let fixture: ComponentFixture<unknown>;
  let el: HTMLElement;

  // the pop-ups are moved to <body> by the scripts: look in the page first, then in the document
  const $ = <T extends HTMLElement = HTMLElement>(sel: string) => (el.querySelector<T>(sel) ?? document.querySelector<T>(sel))!;
  const settle = (fn: () => void) => vi.waitFor(fn, { timeout: 5000, interval: 25 });
  const fire = (e: Element, ...types: string[]) => types.forEach((n) => e.dispatchEvent(n === 'focusout' || n === 'focusin' ? new FocusEvent(n, { bubbles: true }) : new Event(n, { bubbles: true })));
  /** what a user does in a field: type it and leave it */
  const typ = (e: HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement, v: string) => {
    fire(e, 'focusin');
    e.value = v;
    fire(e, 'input', 'change', 'focusout');
  };
  const pick = (e: HTMLSelectElement, v: string) => {
    e.value = v;
    fire(e, 'change');
  };

  async function mount(view: Type<SalesDocFormBase> = SalesDocQtView, p = 'qt'): Promise<void> {
    TestBed.configureTestingModule({
      providers: [
        provideRouter([]),
        { provide: ConfigService, useValue: configStub({ mock: true }) },
        { provide: I18n, useValue: { lang, t: (k: string) => k, use: async (l: 'th' | 'en') => lang.set(l) } },
        { provide: AuthService, useValue: { session } },
        { provide: PermissionService, useValue: { has: () => true } },
      ],
    });
    fixture = TestBed.createComponent(view);
    document.body.appendChild(fixture.nativeElement);
    fixture.detectChanges();
    el = fixture.nativeElement as HTMLElement;
    await settle(() => expect(el.querySelectorAll(`#${p}Items tr`).length).toBe(1));
    await settle(() => expect([...$<HTMLSelectElement>(`#${p}Items [data-f="item"]`).options].map((o) => o.value)).toContain('ACC-A001'));
  }

  beforeEach(() => {
    resetMockSalesDoc();
    lang.set('th');
    vi.stubGlobal('IntersectionObserver', FakeIntersectionObserver);
    Element.prototype.scrollIntoView = vi.fn();
    const proto = SalesDocFormBase.prototype as unknown as { backend(f: string): Promise<SalesDocBackend>; loadHelpers(): Promise<unknown>; swal(o: Record<string, unknown>): Promise<unknown> };
    vi.spyOn(proto, 'backend').mockImplementation(async (fault: string) => createMockSalesDoc({ delayMs: 0, fault }));
    vi.spyOn(proto, 'loadHelpers').mockResolvedValue(undefined);
    vi.spyOn(proto, 'swal').mockResolvedValue(undefined);
  });
  afterEach(() => {
    fixture?.destroy();
    fixture?.nativeElement.remove();
    TestBed.resetTestingModule();
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  const rows = () => [...el.querySelectorAll<HTMLTableRowElement>('#qtItems tr')];
  const field = (tr: HTMLElement, f: string) => tr.querySelector<HTMLInputElement & HTMLSelectElement>(`[data-f="${f}"]`)!;
  /** a line: product, quantity, VAT mode, discount ('' = none) */
  const line = (i: number, o: { item: string; qty: string; mode?: string; disc?: string; price?: string }) => {
    while (rows().length <= i) $('#qtAddRow').click();
    const tr = rows()[i];
    pick(field(tr, 'item'), o.item);
    typ(field(tr, 'qty'), o.qty);
    if (o.price != null) typ(field(tr, 'price'), o.price);
    if (o.mode) pick(field(tr, 'vat'), o.mode);
    if (o.disc) typ(field(tr, 'disc'), o.disc);
  };
  const totals = () => ({
    amount: $('#qtSumAmt').textContent,
    discount: $('#qtSumDisc').textContent,
    base: $('#qtBeforeVat').textContent,
    vat: $('#qtVat').textContent,
    grand: $('#qtGrand').textContent,
  });

  describe('the lines and the totals (quotation)', () => {
    it('picking a product fills its price (standard sale price of the master), 1 piece, VAT included', async () => {
      await mount();
      line(0, { item: 'ACC-A001', qty: '1' });
      const tr = rows()[0];
      expect(field(tr, 'price').value).toBe('1,092.50');
      expect(field(tr, 'qty').value).toBe('1');
      expect(field(tr, 'vat').value).toBe('include');
      // included: 1,092.50 is the total; the base is 1,092.50 / 1.07 = 1,021.03 and the VAT the rest
      expect(totals()).toEqual({ amount: '1,092.50', discount: '0.00', base: '1,021.03', vat: '71.47', grand: '1,092.50' });
    });

    it('VAT included, 2 pieces: 2,185.00 / 1.07 = 2,042.06 base + 142.94 VAT', async () => {
      await mount();
      line(0, { item: 'ACC-A001', qty: '2' });
      expect(totals()).toEqual({ amount: '2,185.00', discount: '0.00', base: '2,042.06', vat: '142.94', grand: '2,185.00' });
      expect(rows()[0].querySelector('[data-amt]')!.textContent).toBe('2,185.00');
    });

    it('VAT excluded: 7 % on top, and 1,092.50 x 7 % = 76.475 is rounded half up to 76.48 (not 76.47)', async () => {
      await mount();
      line(0, { item: 'ACC-A001', qty: '1', mode: 'exclude' });
      expect(totals()).toEqual({ amount: '1,092.50', discount: '0.00', base: '1,092.50', vat: '76.48', grand: '1,168.98' });
    });

    it('VAT excluded, 7 pieces of the same: 7,647.50 + 535.33 (535.325 half up) = 8,182.83', async () => {
      await mount();
      line(0, { item: 'ACC-A001', qty: '7', mode: 'exclude' });
      expect(totals()).toEqual({ amount: '7,647.50', discount: '0.00', base: '7,647.50', vat: '535.33', grand: '8,182.83' });
    });

    it('VAT exempt: no VAT at all', async () => {
      await mount();
      line(0, { item: 'ACC-A001', qty: '2', mode: 'exempt' });
      expect(totals()).toEqual({ amount: '2,185.00', discount: '0.00', base: '2,185.00', vat: '0.00', grand: '2,185.00' });
    });

    it('a discount in percent comes off the line before VAT: 10 % of 2,185.00 = 218.50, 1,966.50 / 1.07 = 1,837.85 + 128.65', async () => {
      await mount();
      line(0, { item: 'ACC-A001', qty: '2', disc: '10%' });
      expect(field(rows()[0], 'disc').value).toBe('10%');
      expect(totals()).toEqual({ amount: '2,185.00', discount: '218.50', base: '1,837.85', vat: '128.65', grand: '1,966.50' });
    });

    it('a discount in baht, shown with two decimals once the field is left', async () => {
      await mount();
      line(0, { item: 'ACC-A001', qty: '2', disc: '185' });
      expect(field(rows()[0], 'disc').value).toBe('185.00');
      expect(totals().grand).toBe('2,000.00');
    });

    it('a discount cannot be more than the line: it is cut at the line (and the field says so)', async () => {
      await mount();
      line(0, { item: 'ACC-A001', qty: '2', disc: '5000' });
      expect(totals()).toEqual({ amount: '2,185.00', discount: '2,185.00', base: '0.00', vat: '0.00', grand: '0.00' });
      await settle(() => expect(field(rows()[0], 'disc').classList.contains('qm-invalid')).toBe(true));
    });

    it('the discount of the whole document is spread over the lines before VAT: 2,185.00 - 100.00 = 2,085.00 / 1.07 = 1,948.60 + 136.40', async () => {
      await mount();
      line(0, { item: 'ACC-A001', qty: '2' });
      typ($<HTMLInputElement>('#qtDiscount'), '100');
      expect(totals()).toEqual({ amount: '2,185.00', discount: '0.00', base: '1,948.60', vat: '136.40', grand: '2,085.00' });
    });

    it('two lines with different VAT modes: each by its own rule, the totals are the sums', async () => {
      await mount();
      line(0, { item: 'ACC-A001', qty: '1', mode: 'include' });
      line(1, { item: 'ACC-A001', qty: '1', mode: 'exclude' });
      // 1,092.50 included (1,021.03 + 71.47) and 1,092.50 excluded (1,092.50 + 76.48)
      expect(totals()).toEqual({ amount: '2,185.00', discount: '0.00', base: '2,113.53', vat: '147.95', grand: '2,261.48' });
    });

    it('a fractional quantity, a discount and a document discount together: 3.5 x 1,890.00 = 6,615.00 − 10 % − 100.00 = 5,853.50 + 409.75', async () => {
      await mount();
      line(0, { item: 'PT-OIL5W30', qty: '3.5', mode: 'exclude', disc: '10%' });
      typ($<HTMLInputElement>('#qtDiscount'), '100');
      expect(totals()).toEqual({ amount: '6,615.00', discount: '661.50', base: '5,853.50', vat: '409.75', grand: '6,263.25' });
    });

    it('the price can be changed by hand and the line follows', async () => {
      await mount();
      line(0, { item: 'ACC-A001', qty: '3', price: '1000' });
      expect(field(rows()[0], 'price').value).toBe('1,000.00');
      expect(totals().amount).toBe('3,000.00');
    });

    it('a free item (price 0) counts as a line of 0.00', async () => {
      await mount();
      line(0, { item: 'FREE-GIFT', qty: '1' });
      expect(totals()).toEqual({ amount: '0.00', discount: '0.00', base: '0.00', vat: '0.00', grand: '0.00' });
    });

    it('removing a line takes it out of the totals', async () => {
      await mount();
      line(0, { item: 'ACC-A001', qty: '1' });
      line(1, { item: 'ACC-A003', qty: '1' });
      expect(totals().amount).toBe('9,992.50');
      rows()[1].querySelector<HTMLElement>('.qt-del')!.click();
      expect(rows()).toHaveLength(1);
      expect(totals().amount).toBe('1,092.50');
    });

    it('letters cannot be typed into the quantity (the mask empties it: 0.00), zero is flagged under the field, a valid quantity clears it', async () => {
      await mount();
      line(0, { item: 'ACC-A001', qty: '1' });
      typ(field(rows()[0], 'qty'), 'abc');
      expect(totals().amount).toBe('0.00');
      expect(field(rows()[0], 'qty').classList.contains('qm-invalid')).toBe(false);
      typ(field(rows()[0], 'qty'), '0');
      await settle(() => expect(field(rows()[0], 'qty').classList.contains('qm-invalid')).toBe(true));
      expect(totals().amount).toBe('0.00');
      typ(field(rows()[0], 'qty'), '2');
      await settle(() => expect(field(rows()[0], 'qty').classList.contains('qm-invalid')).toBe(false));
      expect(totals().amount).toBe('2,185.00');
    });

    it('the whole-document VAT mode applies to every line, and the head of the price column tells which', async () => {
      await mount();
      line(0, { item: 'ACC-A001', qty: '1' });
      line(1, { item: 'ACC-A001', qty: '1' });
      pick($<HTMLSelectElement>('#qtVatMode'), 'exclude');
      expect(rows().map((tr) => field(tr, 'vat').value)).toEqual(['exclude', 'exclude']);
      expect(totals()).toEqual({ amount: '2,185.00', discount: '0.00', base: '2,185.00', vat: '152.96', grand: '2,337.96' });
      expect($('#qtPriceTag').textContent).toBeTruthy();
    });
  });

  describe('the payment of the document (quotation)', () => {
    const text = (id: string) => $(`#qt${id}`).textContent!.trim();
    const open = async (method: string) => {
      await mount();
      line(0, { item: 'ACC-A001', qty: '2' }); // 2,185.00
      typ($<HTMLInputElement>('#qtDocDate'), '2026-10-20');
      pick($<HTMLSelectElement>('#qtCType'), method);
    };
    const prow = (i: number, f: string) => $<HTMLInputElement & HTMLSelectElement>('#qtPsRows').querySelectorAll('tr')[i].querySelector<HTMLInputElement & HTMLSelectElement>(`[data-p="${f}"]`)!;
    const submit = () => $('#qtPsSubmit').click();

    it('credit term: the due date is the date of the document plus the days (20/10/2026 + 45 days = 04/12/2026)', async () => {
      await open('credit_term');
      await settle(() => expect($('#qtCrModal').classList.contains('qm-open')).toBe(true));
      typ($<HTMLInputElement>('#qtCrDays'), '45');
      expect(text('CrDue')).toBe('04/12/2026');
      typ($<HTMLInputElement>('#qtCrDays'), '30');
      expect(text('CrDue')).toBe('19/11/2026');
    });

    it('contract instalments: the sum of the table is held against the total of the document, a short sum is refused', async () => {
      await open('schedule');
      await settle(() => expect($('#qtPsModal').classList.contains('qm-open')).toBe(true));
      expect(text('PsDoc')).toBe('2,185.00');
      // an amount of 1,000.00 (VAT included): base 1,000 / 1.07 = 934.58, VAT 65.42
      typ(prow(0, 'gross'), '1000');
      expect(prow(0, 'net').value).toBe('934.58');
      expect(text('PsSum')).toBe('1,000.00');
      expect(text('PsDiff')).toBe('1,185.00');
      expect(text('PsMsg')).toBe('label.pm.msg_equal_bad');
      submit();
      expect($('#qtPsModal').classList.contains('qm-open')).toBe(true);
      expect(text('PsErr')).toBe('label.pm.err_equal');
      // the second instalment takes the rest: 1,185.00 = 1,107.48 + 77.52
      $('#qtPsAdd').click();
      typ(prow(1, 'gross'), '1185');
      expect(prow(1, 'net').value).toBe('1,107.48');
      expect(text('PsSum')).toBe('2,185.00');
      expect(text('PsDiff')).toBe('0.00');
      expect(text('PsMsg')).toBe('label.pm.msg_equal_ok');
      submit();
      expect($('#qtPsModal').classList.contains('qm-open')).toBe(false);
      // the summary adds the instalments up to the document: base 934.58 + 1,107.48, VAT 65.42 + 77.52
      const summary = text('PayBox');
      expect(summary).toContain('2,042.06');
      expect(summary).toContain('142.94');
      expect(summary).toContain('2,185.00');
      expect($('#qtPayEdit').hidden).toBe(false);
    });

    it('an instalment of the net amount: 2,000.00 net at 7 % is 2,140.00', async () => {
      await open('schedule');
      await settle(() => expect($('#qtPsModal').classList.contains('qm-open')).toBe(true));
      typ(prow(0, 'net'), '2000');
      expect(prow(0, 'gross').value).toBe('2,140.00');
      expect(text('PsDiff')).toBe('45.00');
    });
  });

  describe('the validation of the fields (SalesDocValidate)', () => {
    const V = () => (window as unknown as { SalesDocValidate: { check(el: Element, o?: object): string } }).SalesDocValidate;

    it('a date the user left half typed is reported (the browser says badInput: a script cannot type that)', async () => {
      await mount();
      const date = $<HTMLInputElement>('#qtDocDate');
      expect(V().check(date)).toBe('');
      date.value = ''; // (a half-typed date has no value)
      Object.defineProperty(date, 'validity', { value: { badInput: true }, configurable: true });
      expect(V().check(date)).toBe('label.vl.date_bad');
    });

    it('the formats that mask what is typed never see a letter; the ones that cannot be masked answer with their message', async () => {
      await mount();
      const price = field(rows()[0], 'price');
      for (const [text, bad] of [['12.50', false], ['1,092.50', false], ['12.505', true], ['1.2.3', true]] as const) {
        price.value = text;
        expect(V().check(price) !== '', text).toBe(bad);
      }
    });
  });

  describe('the delivery note and the booking use the same lines', () => {
    it.each([
      [SalesDocBkView, 'bk'],
      [SalesDocObView, 'ob'],
    ] as const)('%s: 2 x 1,092.50 VAT included = 2,185.00 (2,042.06 + 142.94)', async (view, p) => {
      await mount(view, p);
      const tr = el.querySelector<HTMLElement>(`#${p}Items tr`)!;
      pick(field(tr, 'item'), 'ACC-A001');
      typ(field(tr, 'qty'), '2');
      expect(el.querySelector(`#${p}BeforeVat`)!.textContent).toBe('2,042.06');
      expect(el.querySelector(`#${p}Vat`)!.textContent).toBe('142.94');
      expect(el.querySelector(`#${p}Grand`)!.textContent).toBe('2,185.00');
    });
  });

  describe('the baht text of the printed form (SalesDocPrint.bahtText)', () => {
    let bahtText: (amount: unknown) => string;
    let rt: ReturnType<typeof createSalesDocRuntime>;
    beforeEach(() => {
      rt = createSalesDocRuntime({ listen: (t: EventTarget, type: string, fn: EventListener, o?: unknown) => t.addEventListener(type, fn, o as never), tmo: setTimeout, track: (o: unknown) => o });
      createSalesDocLibs({ fetch: () => Promise.reject(new Error('no network')), swal: () => Promise.resolve(), navigate: () => undefined }, rt, ['print']);
      bahtText = (window as unknown as { SalesDocPrint: { bahtText: (a: unknown) => string } }).SalesDocPrint.bahtText;
    });
    afterEach(() => {
      rt.destroy();
      delete (window as unknown as Record<string, unknown>)['SalesDocPrint'];
    });

    it.each([
      [0, 'ศูนย์บาทถ้วน'],
      [1, 'หนึ่งบาทถ้วน'],
      [10, 'สิบบาทถ้วน'],
      [11, 'สิบเอ็ดบาทถ้วน'],
      [20, 'ยี่สิบบาทถ้วน'],
      [21, 'ยี่สิบเอ็ดบาทถ้วน'],
      [101, 'หนึ่งร้อยเอ็ดบาทถ้วน'],
      [111, 'หนึ่งร้อยสิบเอ็ดบาทถ้วน'],
      [1000, 'หนึ่งพันบาทถ้วน'],
      [2185, 'สองพันหนึ่งร้อยแปดสิบห้าบาทถ้วน'],
      [100000, 'หนึ่งแสนบาทถ้วน'],
      [1000000, 'หนึ่งล้านบาทถ้วน'],
      [1000001, 'หนึ่งล้านเอ็ดบาทถ้วน'],
      [21000000, 'ยี่สิบเอ็ดล้านบาทถ้วน'],
      [1234567.89, 'หนึ่งล้านสองแสนสามหมื่นสี่พันห้าร้อยหกสิบเจ็ดบาทแปดสิบเก้าสตางค์'],
    ])('%s → %s', (amount, text) => {
      expect(bahtText(amount)).toBe(text);
    });

    it('satang: 0.25, 0.01, 1.50, and an amount of the floor (the satang are rounded, not cut)', () => {
      expect(bahtText(0.25)).toBe('ศูนย์บาทยี่สิบห้าสตางค์');
      expect(bahtText(0.01)).toBe('ศูนย์บาทหนึ่งสตางค์');
      expect(bahtText(1.5)).toBe('หนึ่งบาทห้าสิบสตางค์');
      expect(bahtText(1234.5)).toBe('หนึ่งพันสองร้อยสามสิบสี่บาทห้าสิบสตางค์');
      expect(bahtText(0.999)).toBe('หนึ่งบาทถ้วน');
    });

    it('takes the text of a field (thousand separators) and negative amounts; anything else is empty', () => {
      expect(bahtText('1,092.50')).toBe('หนึ่งพันเก้าสิบสองบาทห้าสิบสตางค์');
      expect(bahtText(-5)).toBe('ลบห้าบาทถ้วน');
      for (const v of ['', null, undefined, 'abc', NaN]) expect(bahtText(v), String(v)).toBe('');
    });
  });
});
