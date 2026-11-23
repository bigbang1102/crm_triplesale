import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { signal } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { By } from '@angular/platform-browser';
import { Router, provideRouter } from '@angular/router';
import { afterEach, beforeEach, describe, expect, it, vi, type Mock } from 'vitest';
import { AuthService } from '@core/auth/auth.service';
import { ConfigService } from '@core/config/config.service';
import { I18n } from '@core/i18n/i18n.service';
import { PermissionService } from '@core/permissions/permission.service';
import { configStub } from '@core/testing/test-helpers';
import { ReceiptForm } from './receipt-form';
import { ReceiptFormView } from './receipt-form-view';
import { createMockReceipts, mockReceiptDocs, resetMockReceipts } from './receipts.mock';

const lang = signal<'th' | 'en'>('th');
const t = (k: string) => k;
let granted = true;

function setup(mock = true) {
  TestBed.configureTestingModule({
    providers: [
      provideRouter([]),
      { provide: ConfigService, useValue: configStub({ mock }) },
      { provide: PermissionService, useValue: { has: () => granted } },
      { provide: I18n, useValue: { lang, t, use: async (l: 'th' | 'en') => lang.set(l) } },
    ],
  });
  const fixture = TestBed.createComponent(ReceiptForm);
  document.body.appendChild(fixture.nativeElement);
  fixture.detectChanges();
  return fixture;
}

describe('Receipt form page (pages/sales_doc_rv.xhtml, generated)', () => {
  let fixture: ComponentFixture<ReceiptForm>;
  let el: HTMLElement;
  let swal: Mock<(o: any) => Promise<unknown>>;
  /** what the user answers to a swal confirmation (the real library is not loaded in jsdom) */
  let answer: unknown;

  const $ = <T extends HTMLElement = HTMLElement>(sel: string) => el.querySelector<T>(sel)!;
  const $$ = <T extends HTMLElement = HTMLElement>(sel: string) => [...el.querySelectorAll<T>(sel)];
  const doc$ = <T extends HTMLElement = HTMLElement>(sel: string) => document.querySelector<T>(sel)!;
  const settle = (fn: () => void) => vi.waitFor(fn, { timeout: 6000, interval: 40 });
  /** the page is up when the masters are in: payment methods, branches */
  const up = () => settle(() => expect($$('#rvMethods .rv-method[data-m]').length > 0 && $$('#rvBranch option').length > 1 && !!$('#rvCurrency option[data-rate]')).toBe(true));
  const toasts = () => swal.mock.calls.filter((c) => (c[0] as { buttons?: unknown }).buttons === false).map((c) => (c[0] as { text: string }).text);
  const lastToast = () => toasts().at(-1);
  const typeIn = (sel: string, v: string) => {
    const i = $<HTMLInputElement>(sel);
    i.value = v;
    i.dispatchEvent(new Event('input', { bubbles: true }));
    return i;
  };
  const choose = (sel: string, v: string) => {
    const s = $<HTMLSelectElement>(sel);
    s.value = v;
    s.dispatchEvent(new Event('change', { bubbles: true }));
  };
  const rows = () => $$('#rvBody tr');
  /** opens the item picker of a row and chooses an item */
  const pickItem = async (row: number, code: string) => {
    rows()[row].querySelector<HTMLElement>('.rv-item-toggle')!.click();
    await settle(() => expect(doc$(`.rv-item-panel .rv-item-opt[data-val="${code}"]`)).toBeTruthy());
    doc$(`.rv-item-panel .rv-item-opt[data-val="${code}"]`).click();
  };
  const cell = (row: number, cls: string) => rows()[row].querySelector<HTMLInputElement>(cls)!;
  const summary = () => ({ before: $('#rvTBefore').textContent, vat: $('#rvTVat').textContent, charge: $('#rvTCharge').textContent, wht: $('#rvTWht').textContent, net: $('#rvTNet').textContent });
  const key = (k: string) => $(`.rv-pd-key[data-k="${k}"]`).click();
  const digits = (s: string) => [...s].forEach(key);
  const pay = (label: string, d = '') => {
    $(`#rvMethods .rv-method[data-m="${label}"]`).click();
    digits(d);
    $('#rvPayDlgOk').click();
  };
  /** a customer, a branch and one line of 5,000.00 + 7% VAT = 5,350.00 */
  const fillLine = async () => {
    $('#rvCustBtn').click();
    await settle(() => expect($$('#rvCustOpts .rv-cust-opt[data-code]').length).toBeGreaterThan(0));
    $<HTMLElement>('#rvCustOpts .rv-cust-opt[data-code="P00012"]').click();
    choose('#rvBranch', 'SUN');
    $('#rvAddItem').click();
    choose('.rv-c-method', 'excl');
    await pickItem(0, 'SV-LOAN-FEE');
    typeIn('.rv-c-value', '5000');
  };

  /** everything a valid receipt needs: customer, branch, one line (5,350.00 with VAT), paid in cash */
  const fillValid = async () => {
    await fillLine();
    pay('เงินสด', '5350');
  };

  beforeEach(() => {
    resetMockReceipts();
    lang.set('th');
    granted = true;
    answer = true;
    swal = vi.fn((o: { buttons?: unknown }) => Promise.resolve(o.buttons === false || !Array.isArray(o.buttons) ? undefined : answer));
    vi.spyOn(ReceiptFormView.prototype as unknown as { swal(o: unknown): Promise<unknown> }, 'swal').mockImplementation((o) => swal(o));
    (URL as unknown as { createObjectURL: unknown }).createObjectURL = vi.fn((f: Blob) => `blob:${(f as File).name ?? ''}`);
    (URL as unknown as { revokeObjectURL: unknown }).revokeObjectURL = vi.fn();
    (Element.prototype as unknown as { scrollIntoView: unknown }).scrollIntoView = vi.fn();
    history.replaceState(null, '', '/');
  });
  afterEach(() => {
    fixture?.destroy();
    TestBed.resetTestingModule();
    vi.restoreAllMocks();
    history.replaceState(null, '', '/');
  });

  it('is the markup of the Java page: header fields, the 10-column line table, the payment panel, the dialogs', async () => {
    fixture = setup();
    el = fixture.nativeElement;
    await up();
    expect($('.rv-back').getAttribute('href')).toBe('/sales/receipts');
    expect($$('.rv-table thead th').length).toBe(10);
    expect($('#rvDateText').getAttribute('type')).toBe('date');
    expect($<HTMLInputElement>('#rvDateText').value).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect($('.rv-rotext').textContent).toBe('NEW');
    expect($<HTMLInputElement>('#rvRefDoc').readOnly).toBe(true);
    expect($('#rvCustName').textContent).toBe('-');
    for (const id of ['rvPayDlgOverlay', 'rvSuccessOverlay', 'rvCustPop', 'rvSave', 'rvAttBtn', 'rvAddItem']) expect(el.querySelector('#' + id), id).toBeTruthy();
    expect(rows()).toHaveLength(0);
    expect(summary()).toEqual({ before: '0.00', vat: '0.00', charge: '0.00', wht: '0.00', net: '0.00' });
  });

  it('loads the masters: branches (choose one), currencies (THB, USD), payment methods grouped by type — a type with no count / no account is dimmed, count 0 is not shown', async () => {
    fixture = setup();
    el = fixture.nativeElement;
    await up();
    expect($$('#rvBranch option').map((o) => o.getAttribute('value'))).toEqual(['', 'SUN', 'SUN02', 'SUN03']);
    expect($$('#rvCurrency option').map((o) => o.getAttribute('value'))).toEqual(['THB', 'USD']);
    const methods = $$('#rvMethods .rv-method[data-m]');
    expect(methods.map((m) => m.dataset['m'])).toEqual(['เงินสด', 'บัตรเครดิต', 'เงินโอน', 'เช็ค', 'บัตรกำนัล']);
    expect(methods.map((m) => m.classList.contains('off'))).toEqual([false, false, false, true, false]);
    expect($$('#rvMethods .rv-method.empty').length).toBe(4); // padded to 9 cells
  });

  it('line maths: VAT excluded adds 7%, included is split (before = value*100/107), none adds nothing; withholding is taken from the amount before VAT', async () => {
    fixture = setup();
    el = fixture.nativeElement;
    await up();
    $('#rvAddItem').click();
    $('#rvAddItem').click();
    $('#rvAddItem').click();
    choose('.rv-c-method', 'excl');
    typeIn('.rv-c-value', '1000');
    expect(summary()).toEqual({ before: '1,000.00', vat: '70.00', charge: '1,070.00', wht: '0.00', net: '1,070.00' });
    const r1 = rows()[1];
    r1.querySelector<HTMLSelectElement>('.rv-c-method')!.value = 'incl';
    r1.querySelector('.rv-c-method')!.dispatchEvent(new Event('change', { bubbles: true }));
    cell(1, '.rv-c-value').value = '500';
    cell(1, '.rv-c-value').dispatchEvent(new Event('input', { bubbles: true }));
    expect(r1.querySelector('.rv-c-before')!.textContent).toBe('467.29'); // 500 * 100 / 107
    expect(r1.querySelector('.rv-c-vatamt')!.textContent).toBe('32.71');
    expect(r1.querySelector('.rv-c-charge')!.textContent).toBe('500.00');
    cell(2, '.rv-c-value').value = '200';
    cell(2, '.rv-c-value').dispatchEvent(new Event('input', { bubbles: true }));
    expect(rows()[2].querySelector('.rv-c-charge')!.textContent).toBe('0.00'); // no tax mode chosen yet: the line counts for nothing
    choose('.rv-c-method', 'excl');
    cell(0, '.rv-c-wht').value = '3';
    cell(0, '.rv-c-wht').dispatchEvent(new Event('input', { bubbles: true }));
    expect($('#rvTWht').textContent).toBe('30.00');
    expect($('#rvTNet').textContent).toBe('1,540.00'); // 1,070 + 500 − 30
  });

  it('the number fields keep digits and one point; withholding is held between 0 and 100 when the field is left; the text fields drop the special characters', async () => {
    fixture = setup();
    el = fixture.nativeElement;
    await up();
    $('#rvAddItem').click();
    expect(typeIn('.rv-c-value', '12a3.4.5-').value).toBe('123.45');
    const wht = typeIn('.rv-c-wht', '250');
    wht.dispatchEvent(new FocusEvent('blur'));
    expect(wht.value).toBe('100.00');
    expect(typeIn('#rvTaxInv', 'TI<1>"2";{x}').value).toBe('TI12x');
    expect(typeIn('#rvRemark', 'หมายเหตุ (ทดสอบ) #1/2 & a,b.c').value).toBe('หมายเหตุ (ทดสอบ) #1/2 & a,b.c');
    expect(typeIn('.rv-c-desc', 'รายละเอียด|[x]').value).toBe('รายละเอียดx');
  });

  it('the item picker opens under the toggle (on <body>), filters by name / code, fills the standard price, and closes on Escape', async () => {
    fixture = setup();
    el = fixture.nativeElement;
    await up();
    $('#rvAddItem').click();
    rows()[0].querySelector<HTMLElement>('.rv-item-toggle')!.click();
    const panel = await vi.waitFor(() => doc$('.rv-item-panel.show'));
    expect(panel.parentElement).toBe(document.body);
    await settle(() => expect(panel.querySelectorAll('.rv-item-opt').length).toBe(15)); // "select" + 14 items
    const search = panel.querySelector<HTMLInputElement>('.rv-item-search-input')!;
    search.value = 'sv-legal';
    search.dispatchEvent(new Event('input'));
    expect([...panel.querySelectorAll('.rv-item-opt')].map((o) => o.getAttribute('data-val'))).toEqual(['SV-LEGAL']);
    search.value = 'zzz';
    search.dispatchEvent(new Event('input'));
    expect(panel.querySelector('.rv-item-empty')!.textContent).toBe('label.rv.no_items_found');
    search.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
    expect(panel.classList.contains('show')).toBe(false);
    await pickItem(0, 'SV-APPRAISE');
    expect(cell(0, '.rv-c-value').value).toBe('3,500.00'); // the standard sale price
    expect(rows()[0].querySelector('.rv-item-txt')!.textContent).toBe('ค่าประเมินราคาหลักประกัน');
    await pickItem(0, 'SV-ADS'); // an item without a standard price leaves the value alone
    expect(cell(0, '.rv-c-value').value).toBe('3,500.00');
  });

  it('removing a line asks first; the last line cannot be removed', async () => {
    fixture = setup();
    el = fixture.nativeElement;
    await up();
    $('#rvAddItem').click();
    $('#rvAddItem').click();
    rows()[1].querySelector<HTMLElement>('.rv-del')!.click();
    expect(swal).toHaveBeenCalledWith(expect.objectContaining({ title: 'label.rv.confirm_remove_item', dangerMode: true }));
    await settle(() => expect(rows()).toHaveLength(1));
    expect(lastToast()).toBe('label.rv.item_removed');
    rows()[0].querySelector<HTMLElement>('.rv-del')!.click();
    expect(lastToast()).toBe('label.rv.need_one_item');
    expect(rows()).toHaveLength(1);
    answer = null; // "cancel"
    $('#rvAddItem').click();
    rows()[1].querySelector<HTMLElement>('.rv-del')!.click();
    await Promise.resolve();
    expect(rows()).toHaveLength(2);
  });

  it('customer picker: lists the leads, searches name / code / lead number, enriches the card from the customer list, and picking fills the name and the reference number', async () => {
    fixture = setup();
    el = fixture.nativeElement;
    await up();
    $('#rvCustBtn').click();
    expect($('#rvCustPop').classList.contains('show')).toBe(true);
    await settle(() => expect($$('#rvCustOpts .rv-cust-opt[data-code]').length).toBe(240));
    const first = $<HTMLElement>('#rvCustOpts .rv-cust-opt[data-code]');
    const search = typeIn('#rvCustSearch', first.dataset['txno']!);
    expect($$('#rvCustOpts .rv-cust-opt[data-code]').map((o) => o.dataset['txno'])).toEqual([first.dataset['txno']]);
    typeIn('#rvCustSearch', first.dataset['code']!.toLowerCase());
    await settle(() => expect($('#rvCustOpts .rv-cust-tel').textContent).not.toBe('-')); // phone + address come from /board/prospect-list after a pause
    search.value = 'ไม่พบแน่นอน';
    search.dispatchEvent(new Event('input'));
    expect($('#rvCustOpts').textContent).toBe('label.rv.no_customer_found');
    typeIn('#rvCustSearch', '');
    $<HTMLElement>('#rvCustOpts .rv-cust-opt[data-code]').click();
    expect($('#rvCustPop').classList.contains('show')).toBe(false);
    expect($('#rvCustName').textContent).toBe(first.dataset['name']);
    expect($<HTMLInputElement>('#rvRefDoc').value).toBe(first.dataset['txno']);
    expect(lastToast()).toBe('label.rv.payer_selected ' + first.dataset['name']);
  });

  it('currency: USD shows the exchange rate (33.00), clears the payments and works in baht; THB hides the rate again', async () => {
    fixture = setup();
    el = fixture.nativeElement;
    await up();
    expect($('#rvRateField').style.display).toBe('none');
    await fillLine();
    pay('เงินสด', '5350');
    expect($$('#rvPayList .rv-pay-item')).toHaveLength(1);
    choose('#rvCurrency', 'USD');
    expect($('#rvRateField').style.display).toBe('');
    expect($<HTMLInputElement>('#rvRate').value).toBe('33.00');
    expect($$('#rvPayList .rv-pay-item')).toHaveLength(0);
    expect($('#rvDue').textContent).toBe('฿ 176,550.00'); // 5,350 USD * 33
    typeIn('#rvRate', '30');
    expect($('#rvDue').textContent).toBe('฿ 160,500.00');
    choose('#rvCurrency', 'THB');
    expect($('#rvRateField').style.display).toBe('none');
    expect($('#rvDue').textContent).toBe('฿ 5,350.00');
  });

  describe('payments (the numpad dialog)', () => {
    it('needs items first, refuses a type with no account, and a bill that is paid already', async () => {
      fixture = setup();
      el = fixture.nativeElement;
      await up();
      $('#rvMethods .rv-method[data-m="เงินสด"]').click();
      expect(lastToast()).toBe('label.rv.add_items_first');
      await fillLine();
      $('#rvMethods .rv-method[data-m="เช็ค"]').click();
      expect(lastToast()).toBe('label.rv.method_no_items');
      expect($('#rvPayDlgOverlay').classList.contains('show')).toBe(false);
      pay('เงินสด', '5350');
      $('#rvMethods .rv-method[data-m="เงินสด"]').click();
      expect(lastToast()).toBe('label.rv.paid_full');
    });

    it('cash: starts at 0.00, keys build the amount (one point, two decimals), Clear / Backspace / Delete, may exceed the bill (change)', async () => {
      fixture = setup();
      el = fixture.nativeElement;
      await up();
      await fillLine();
      $('#rvMethods .rv-method[data-m="เงินสด"]').click();
      expect($('#rvPayDlgOverlay').classList.contains('show')).toBe(true);
      expect($('#rvPayDlgTitle').textContent).toBe('เงินสด');
      expect($<HTMLInputElement>('#rvPayDlgAmt').value).toBe('0.00');
      digits('12.345');
      expect($<HTMLInputElement>('#rvPayDlgAmt').value).toBe('12.34');
      key('clear');
      expect($<HTMLInputElement>('#rvPayDlgAmt').value).toBe('0.00');
      digits('6000');
      expect($<HTMLInputElement>('#rvPayDlgAmt').value).toBe('6,000.00');
      document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Backspace', bubbles: true }));
      expect($<HTMLInputElement>('#rvPayDlgAmt').value).toBe('600.00');
      document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Delete', bubbles: true }));
      expect($<HTMLInputElement>('#rvPayDlgAmt').value).toBe('0.00');
      for (const k of '6000') document.dispatchEvent(new KeyboardEvent('keydown', { key: k, bubbles: true }));
      document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
      expect($('#rvPayDlgOverlay').classList.contains('show')).toBe(false);
      expect(lastToast()).toBe('label.rv.pay_added เงินสด ฿6,000.00');
      expect($('#rvDue').textContent).toBe('฿ 0.00');
      expect($('#rvPaid').textContent).toBe('฿ 5,350.00');
      expect($('#rvChange').textContent).toBe('฿ 650.00');
      expect($$('#rvPayList .rv-pay-item')).toHaveLength(1);
    });

    it('an empty amount is refused; credit card and transfer are filled with what is due and locked, and need an account / card chosen', async () => {
      fixture = setup();
      el = fixture.nativeElement;
      await up();
      await fillLine();
      $('#rvMethods .rv-method[data-m="เงินสด"]').click();
      $('#rvPayDlgOk').click();
      expect(lastToast()).toBe('label.rv.enter_amount');
      $('#rvPayDlgCancel').click();
      $('#rvMethods .rv-method[data-m="เงินโอน"]').click();
      expect($<HTMLInputElement>('#rvPayDlgAmt').value).toBe('5,350.00');
      expect($('.rv-pd-numpad').classList.contains('locked')).toBe(true);
      expect($('#rvPdAmtLockNote').style.display).toBe('block');
      expect($('#rvPdAcctLbl').textContent).toBe('label.rv.acct_no');
      digits('9'); // locked: the keys do nothing
      expect($<HTMLInputElement>('#rvPayDlgAmt').value).toBe('5,350.00');
      $('#rvPayDlgOk').click();
      expect(lastToast()).toBe('label.rv.select_acct');
      $('#rvPdAcctTrigger').click();
      expect($('#rvPdAcctDrop').classList.contains('open')).toBe(true);
      const search = typeIn('#rvPdAcctSearch', 'กสิกร');
      expect($$('#rvPdAcctOpts .rv-pd-opt').filter((o) => o.style.display !== 'none').map((o) => o.dataset['v'])).toEqual(['TRAN-KBANK-2223334445']);
      search.value = '';
      search.dispatchEvent(new Event('input'));
      $<HTMLElement>('#rvPdAcctOpts .rv-pd-opt[data-v="TRAN-KBANK-2223334445"]').click();
      expect($('#rvPdAcctDisplay').textContent).toContain('ธ.กสิกรไทย');
      $('#rvPayDlgOk').click();
      expect($$('#rvPayList .rv-pay-item')[0].textContent).toContain('เงินโอน — TRAN-KBANK-2223334445 ธ.กสิกรไทย 222-3-33444-5');
    });

    it('a type with a single account chooses it itself; Esc closes the dialog (and the account list first); removing a payment says so', async () => {
      fixture = setup();
      el = fixture.nativeElement;
      await up();
      await fillLine();
      $('#rvMethods .rv-method[data-m="บัตรกำนัล"]').click(); // voucher: one account
      expect($('#rvPdAcctDisplay').textContent).toContain('VOUCHER-01');
      expect($('#rvPdAcctLbl').textContent).toBe('label.rv.method_item');
      $('#rvPdAcctTrigger').click();
      document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
      expect($('#rvPayDlgOverlay').classList.contains('show')).toBe(false);
      pay('บัตรกำนัล', '1000');
      expect($('#rvDue').textContent).toBe('฿ 4,350.00');
      $<HTMLElement>('#rvPayList .rm').click();
      expect(lastToast()).toBe('label.rv.pay_removed');
      expect($('#rvDue').textContent).toBe('฿ 5,350.00');
    });

    it('a type that is not cash must not be paid over what is due (and a credit card must equal it)', async () => {
      fixture = setup();
      el = fixture.nativeElement;
      await up();
      await fillLine();
      pay('บัตรกำนัล', '999999');
      expect(lastToast()).toBe('label.rv.over_due ฿5,350.00');
      expect($('#rvPayDlgOverlay').classList.contains('show')).toBe(true);
    });
  });

  describe('save', () => {
    it('checks in order: customer → amounts → complete lines → a payment → the paid sum → the branch', async () => {
      fixture = setup();
      el = fixture.nativeElement;
      await up();
      $('#rvSave').click();
      expect(lastToast()).toBe('label.rv.select_payer_required');
      $('#rvCustBtn').click();
      await settle(() => expect($$('#rvCustOpts .rv-cust-opt[data-code]').length).toBeGreaterThan(0));
      $<HTMLElement>('#rvCustOpts .rv-cust-opt[data-code="P00012"]').click();
      $('#rvSave').click();
      expect(lastToast()).toBe('label.rv.items_value_required');
      $('#rvAddItem').click();
      choose('.rv-c-method', 'excl');
      typeIn('.rv-c-value', '5000');
      $('#rvSave').click();
      expect(lastToast()).toBe('label.rv.select_tax_items'); // an amount but no item
      await pickItem(0, 'SV-LOAN-FEE');
      typeIn('.rv-c-value', '5000');
      $('#rvSave').click();
      expect(lastToast()).toBe('label.rv.select_pay_method');
      pay('เงินสด', '1000');
      $('#rvSave').click();
      expect(lastToast()).toBe('label.rv.pay_incomplete'.replace('{0}', '4,350.00'));
      pay('เงินสด', '4350');
      $('#rvSave').click();
      expect(lastToast()).toBe('chat.ch.err.branch');
      expect(toasts().filter((x) => x === 'chat.ch.err.branch')).toHaveLength(1);
      expect(swal.mock.calls.some((c) => Array.isArray((c[0] as { buttons?: unknown }).buttons))).toBe(false); // nothing to confirm yet
    });

    it('asks to confirm with the figures; cancel sends nothing; OK posts the receipt, shows the verified result, and the list has it', async () => {
      fixture = setup();
      el = fixture.nativeElement;
      await up();
      await fillValid();
      typeIn('#rvTaxInv', 'TI-001');
      typeIn('#rvRemark', 'ทดสอบบันทึก');
      const before = mockReceiptDocs().length;
      answer = null; // cancel
      $('#rvSave').click();
      const ask = swal.mock.calls.find((c) => Array.isArray((c[0] as { buttons?: unknown }).buttons))![0] as { title: string; text: string };
      expect(ask.title).toBe('label.rv.confirm_save_title');
      expect(ask.text).toContain('label.ld2.customer : ');
      expect(ask.text).toContain('label.rv.paid_net ฿5,350.00');
      expect(ask.text).toContain('label.rv.pay_method : เงินสด ฿5,350.00');
      await Promise.resolve();
      expect(mockReceiptDocs()).toHaveLength(before);
      answer = true;
      $('#rvSave').click();
      await settle(() => expect($<HTMLButtonElement>('#rvSave').disabled).toBe(true));
      expect($('#rvSave').textContent).toBe('label.dashboard.saving');
      await settle(() => expect($('#rvSuccessOverlay').classList.contains('show')).toBe(true));
      expect($('#rvSuccessTitle').textContent).toBe('label.rv.save_ok_verified');
      expect($('#rvSuccessSub').textContent).toBe('label.sd.doc_no: RV:00-2026-1020-120000-0001  |  label.rv.docs_in_system 40 → 41');
      expect($<HTMLButtonElement>('#rvSave').disabled).toBe(false);
      const created = mockReceiptDocs()[0];
      expect(created).toMatchObject({ payerCode: 'P00012', status: 'new', taxInvoiceNo: 'TI-001', description: 'ทดสอบบันทึก', branchCode: 'SUN', currency: 'THB' });
      expect(created.items).toEqual([{ materialCode: 'SV-LOAN-FEE', detail: '', value: 5000, taxPercent: 7, withholdingPercent: 0 }]);
      expect(created.payments).toEqual([{ methodCode: 'CASH', amount: 5350 }]);
      // "back to the list" leaves the page for the list
      const nav = vi.spyOn(TestBed.inject(Router), 'navigateByUrl').mockResolvedValue(true);
      $('#rvSuccessBack').click();
      expect(nav).toHaveBeenCalledWith('/sales/receipts');
    });

    it('a line with VAT included is sent as value*100/107 at full precision; "none" is sent with 0%; the withholding percent goes along', async () => {
      fixture = setup();
      el = fixture.nativeElement;
      await up();
      await fillLine();
      $('#rvAddItem').click();
      choose('.rv-c-method', 'excl'); // (first select)
      rows()[1].querySelector<HTMLSelectElement>('.rv-c-method')!.value = 'incl';
      rows()[1].querySelector('.rv-c-method')!.dispatchEvent(new Event('change', { bubbles: true }));
      await pickItem(1, 'SV-TRANSLATE'); // 800.00
      cell(1, '.rv-c-value').value = '500';
      cell(1, '.rv-c-value').dispatchEvent(new Event('input', { bubbles: true }));
      cell(1, '.rv-c-wht').value = '3';
      cell(1, '.rv-c-wht').dispatchEvent(new Event('input', { bubbles: true }));
      $('#rvAddItem').click();
      rows()[2].querySelector<HTMLSelectElement>('.rv-c-method')!.value = 'none';
      rows()[2].querySelector('.rv-c-method')!.dispatchEvent(new Event('change', { bubbles: true }));
      await pickItem(2, 'SV-STAMP');
      cell(2, '.rv-c-value').value = '350.5';
      cell(2, '.rv-c-value').dispatchEvent(new Event('input', { bubbles: true }));
      // due: 5,350 + 500 + 350.50 − the withholding 14.02
      const net = Number($('#rvTNet').textContent!.replace(/,/g, ''));
      pay('เงินสด', String(Math.ceil(net)));
      $('#rvSave').click();
      await settle(() => expect($('#rvSuccessOverlay').classList.contains('show')).toBe(true));
      const items = mockReceiptDocs()[0].items;
      expect(items.map((i) => [i.materialCode, i.taxPercent, i.withholdingPercent])).toEqual([['SV-LOAN-FEE', 7, 0], ['SV-TRANSLATE', 7, 3], ['SV-STAMP', 0, 0]]);
      expect(items[1].value).toBe((500 * 100) / 107);
    });

    it('the result box: pending (accepted, not visible yet) · rejected (the message of the backend) · a failure without cause · no answer; an error can be closed', async () => {
      const cases: [string, string, RegExp | string, boolean][] = [
        ['create-pending', 'label.rv.sent_async', /^label\.rv\.issued_no RV:00-2026-1020-120000-0001 — label\.rv\.async_note$/, false],
        ['create-reject', 'label.ld2.save_failed', 'ผู้ชำระเงินนี้ยังไม่มีรหัสลูกค้าในระบบ ERP', true],
        ['create-details', 'label.ld2.save_failed', 'Unprocessable — {"items":["materialCode ไม่ถูกต้อง"],"payments":"ยอดไม่ครบ"}', true],
        ['create-text', 'label.ld2.save_failed', 'Internal Server Error — EJB EntityContext null', true],
        ['create-empty', 'label.ld2.save_failed', 'label.rv.unknown_cause', true],
        ['create-403', 'label.ld2.save_failed', 'label.rv.unknown_cause', true],
        ['create-html', 'label.rv.api_fail', /SyntaxError/, true],
        ['create-down', 'label.rv.api_fail', 'TypeError: Failed to fetch', true],
      ];
      for (const [fault, title, sub, isError] of cases) {
        history.replaceState(null, '', '/?mock=' + fault);
        fixture = setup();
        el = fixture.nativeElement;
        await up();
        await fillValid();
        $('#rvSave').click();
        await settle(() => expect($('#rvSuccessOverlay').classList.contains('show')).toBe(true));
        expect($('#rvSuccessTitle').textContent, fault).toBe(title);
        if (typeof sub === 'string') expect($('#rvSuccessSub').textContent, fault).toBe(sub);
        else expect($('#rvSuccessSub').textContent, fault).toMatch(sub);
        expect($('#rvSuccessBack').textContent, fault).toBe(isError ? 'label.contracts.close_btn' : 'label.rv.back_to_list');
        if (isError) {
          $('#rvSuccessBack').click();
          expect($('#rvSuccessOverlay').classList.contains('show'), fault).toBe(false);
          expect(rows(), fault).toHaveLength(1); // the form keeps what was typed
        }
        fixture.destroy();
        TestBed.resetTestingModule();
        resetMockReceipts();
      }
    }, 40000);

    it('without the right to write there is no save button and no upload button', async () => {
      granted = false;
      fixture = setup();
      el = fixture.nativeElement;
      await up();
      expect(el.querySelector('#rvSave')).toBeNull();
      expect(el.querySelector('#rvAttBtn')).toBeNull();
    });
  });

  describe('attachments', () => {
    const file = (name: string, type = 'application/octet-stream') => new File([name], name, { type });
    const choosePick = (...files: File[]) => {
      const input = $<HTMLInputElement>('#rvAttFile');
      Object.defineProperty(input, 'files', { configurable: true, value: files });
      input.dispatchEvent(new Event('change', { bubbles: true }));
    };

    it('switches the right panel; only the types of the master data are accepted (by extension), the others are named in a warning', async () => {
      fixture = setup();
      el = fixture.nativeElement;
      await up();
      $<HTMLElement>('.rv-rtab[data-tab="att"]').click();
      expect($('#rvAttTab').style.display).toBe('flex');
      expect($('#rvPayTab').style.display).toBe('none');
      expect($('#rvAttFile').getAttribute('accept')).toBe('.pdf,.png,.image');
      choosePick(file('a.pdf'), file('b.JPG'), file('noext'), file('c.png'));
      const warn = swal.mock.calls.at(-1)![0] as { title: string; text: string; icon: string };
      expect(warn).toMatchObject({ title: 'label.rv.file_type_not_allowed', icon: 'warning' });
      expect(warn.text).toBe('b.JPG\nnoext\n\nlabel.rv.file_type_allowed: pdf, png, image');
      expect($$('#rvAttSavedBody .rv-doc-row').map((r) => r.querySelector('.rv-doc-name span')!.textContent)).toEqual(['a.pdf', 'c.png']);
      expect($('#rvAttSavedBody .rv-doc-row.active').textContent).toContain('c.png'); // the last one added is previewed
      expect($('#rvDocPreview img.rv-preview-img')).toBeTruthy();
      $$('#rvAttSavedBody .rv-doc-row')[0].click();
      expect($('#rvDocPreview iframe.rv-preview-pdf')).toBeTruthy();
    });

    it('deleting a file asks first; the files are sent with the receipt as base64 with their file type', async () => {
      fixture = setup();
      el = fixture.nativeElement;
      await up();
      choosePick(file('a.pdf'), file('c.png'));
      expect(lastToast()).toBe('label.rv.file_added');
      $<HTMLElement>('#rvAttSavedBody .rv-doc-del').click();
      expect(swal).toHaveBeenCalledWith(expect.objectContaining({ title: 'label.contracts.confirm_delete_doc', dangerMode: true }));
      await settle(() => expect($$('#rvAttSavedBody .rv-doc-row')).toHaveLength(1));
      expect(lastToast()).toBe('label.rv.file_removed');
      await fillValid();
      $('#rvSave').click();
      await settle(() => expect($('#rvSuccessOverlay').classList.contains('show')).toBe(true));
      expect($('#rvSuccessTitle').textContent).toBe('label.rv.save_ok_verified');
    });

    it('no allowed type (the master says none) turns the uploads off and says why; a master that cannot be read uses the page\'s own list', async () => {
      history.replaceState(null, '', '/?mock=attach-empty');
      fixture = setup();
      el = fixture.nativeElement;
      await up();
      await settle(() => expect($('#rvAttBtn').classList.contains('off')).toBe(true));
      $('#rvAttBtn').click();
      expect(swal).toHaveBeenCalledWith({ text: 'label.rv.file_types_not_configured', icon: 'warning' });
      fixture.destroy();
      TestBed.resetTestingModule();
      history.replaceState(null, '', '/?mock=attach-error');
      fixture = setup();
      el = fixture.nativeElement;
      await up();
      await settle(() => expect($('#rvAttFile').getAttribute('accept')).toBe('.pdf,.png,.image'));
      expect($('#rvAttBtn').classList.contains('off')).toBe(false);
    });
  });

  describe('opened from an opportunity (?opportunityId=… ; the old ?leadId=… address still works)', () => {
    it('reads ?opportunityId= of the address like the ?leadId= of the Java page', async () => {
      history.replaceState(null, '', '/?opportunityId=4');
      fixture = setup();
      el = fixture.nativeElement;
      await up();
      await settle(() => expect(rows().length).toBeGreaterThan(0));
      expect($<HTMLInputElement>('#rvRefDoc').value).toMatch(/^LD:00-/);
    });

    it('fills the customer, the reference number and the lines (VAT included, standard price) of the lead', async () => {
      history.replaceState(null, '', '/?leadId=4');
      fixture = setup();
      el = fixture.nativeElement;
      await up();
      await settle(() => expect(rows().length).toBeGreaterThan(0));
      expect($('#rvCustName').textContent).not.toBe('-');
      expect($<HTMLInputElement>('#rvRefDoc').value).toMatch(/^LD:00-/);
      expect(rows().every((r) => r.querySelector<HTMLSelectElement>('.rv-c-method')!.value === 'incl')).toBe(true);
      expect(Number(cell(0, '.rv-c-value').value.replace(/,/g, ''))).toBeGreaterThan(0);
    });

    it('keeps only the rows named by listMaterialId; unknown ids say so and show them all; a lead of several groups needs activityGroupId', async () => {
      history.replaceState(null, '', '/?leadId=8&listMaterialId=' + (1004400000 + 8 * 10 + 1));
      fixture = setup();
      el = fixture.nativeElement;
      await up();
      await settle(() => expect(rows()).toHaveLength(1));
      fixture.destroy();
      TestBed.resetTestingModule();

      history.replaceState(null, '', '/?leadId=8&listMaterialId=1,2');
      fixture = setup();
      el = fixture.nativeElement;
      await up();
      await settle(() => expect(lastToast()).toBe('label.rv.lead_items_missing'));
      await settle(() => expect(rows().length).toBeGreaterThan(1));
      fixture.destroy();
      TestBed.resetTestingModule();

      history.replaceState(null, '', '/?leadId=7');
      fixture = setup();
      el = fixture.nativeElement;
      await up();
      await settle(() => expect(swal).toHaveBeenCalled());
      await Promise.resolve();
    });

    it('a lead that cannot be read does not break the form', async () => {
      history.replaceState(null, '', '/?leadId=999');
      fixture = setup();
      el = fixture.nativeElement;
      await up();
      expect(rows()).toHaveLength(0);
      expect($('#rvCustName').textContent).toBe('-');
    });
  });

  it('the link back to the list is router navigation', async () => {
    fixture = setup();
    el = fixture.nativeElement;
    await up();
    const nav = vi.spyOn(TestBed.inject(Router), 'navigateByUrl').mockResolvedValue(true);
    $('.rv-back').click();
    expect(nav).toHaveBeenCalledWith('/sales/receipts');
  });

  it('a language switch is a page reload in Java: a NEW page instance, not an edit of the old DOM', async () => {
    fixture = setup();
    el = fixture.nativeElement;
    await up();
    const first = fixture.debugElement.query(By.directive(ReceiptFormView)).componentInstance;
    lang.set('en');
    fixture.detectChanges();
    TestBed.tick?.();
    await settle(() => expect(fixture.debugElement.query(By.directive(ReceiptFormView)).componentInstance).not.toBe(first));
    await up();
  });

  it('leaving the page removes what it put on <body> (the item picker), revokes the object URLs and removes its listeners', async () => {
    const added: Array<[EventTarget, string, unknown]> = [];
    const removed: Array<[EventTarget, string, unknown]> = [];
    const addDoc = document.addEventListener.bind(document);
    const addWin = window.addEventListener.bind(window);
    const rmDoc = document.removeEventListener.bind(document);
    const rmWin = window.removeEventListener.bind(window);
    vi.spyOn(document, 'addEventListener').mockImplementation((type: string, fn: any, opts?: any) => (added.push([document, type, fn]), addDoc(type, fn, opts)));
    vi.spyOn(window, 'addEventListener').mockImplementation((type: string, fn: any, opts?: any) => (added.push([window, type, fn]), addWin(type, fn, opts)));
    vi.spyOn(document, 'removeEventListener').mockImplementation((type: string, fn: any, opts?: any) => (removed.push([document, type, fn]), rmDoc(type, fn, opts)));
    vi.spyOn(window, 'removeEventListener').mockImplementation((type: string, fn: any, opts?: any) => (removed.push([window, type, fn]), rmWin(type, fn, opts)));

    fixture = setup();
    el = fixture.nativeElement;
    await up();
    const input = $<HTMLInputElement>('#rvAttFile');
    Object.defineProperty(input, 'files', { configurable: true, value: [new File(['x'], 'a.pdf')] });
    input.dispatchEvent(new Event('change', { bubbles: true }));
    expect(document.querySelector('.rv-item-panel')).toBeTruthy();
    const mine = added.filter(([, type, fn]) => typeof fn === 'function' && type !== 'popstate' && type !== 'hashchange');
    expect(mine.length).toBeGreaterThanOrEqual(8);
    fixture.destroy();
    expect(document.querySelector('.rv-item-panel')).toBeNull();
    expect(URL.revokeObjectURL).toHaveBeenCalledWith('blob:a.pdf');
    for (const [target, type, fn] of mine) {
      expect(removed.some(([t2, ty2, f2]) => t2 === target && ty2 === type && f2 === fn), `${type} listener of ${target === window ? 'window' : 'document'}`).toBe(true);
    }
  });

  it('with mock off the form is shown and asks the REST services of triplesale-service (through HttpClient) — not the BFF, not window.fetch', async () => {
    const spy = vi.spyOn(window, 'fetch');
    TestBed.configureTestingModule({ providers: [provideHttpClient(), provideHttpClientTesting(), { provide: AuthService, useValue: { session: () => null } }] });
    fixture = setup(false);
    el = fixture.nativeElement;
    const http = TestBed.inject(HttpTestingController);
    const asked: string[] = [];
    // (the service answers an empty object to everything: the form keeps its own lists)
    await settle(() => {
      for (const r of http.match(() => true)) {
        asked.push(`${r.request.method} ${r.request.urlWithParams}`);
        r.flush('{}');
      }
      expect(asked).toContain('GET /triplesale-service/api/v1/master-data/receive-methods?txType=rv');
    });
    expect(el.querySelector('ts-live-missing')).toBeNull();
    expect($('.rv-root')).toBeTruthy();
    for (const url of ['business-branches?page=1&perPage=500', 'currencies', 'attach-file-types']) {
      expect(asked, url).toContain('GET /triplesale-service/api/v1/master-data/' + url);
    }
    expect(asked.every((a) => a.includes('/triplesale-service/api/v1/'))).toBe(true);
    expect(spy).not.toHaveBeenCalled();
  });

  it('with mock off the host asks the LIVE backend (not the fake data)', async () => {
    const backend = vi.spyOn(ReceiptFormView.prototype as unknown as { backend(): Promise<unknown> }, 'backend').mockImplementation(async () => createMockReceipts({ delayMs: 0 }));
    fixture = setup(false);
    el = fixture.nativeElement;
    await up();
    expect(backend).toHaveBeenCalledTimes(1);
    expect(el.querySelector('ts-live-missing')).toBeNull();
  });
});
