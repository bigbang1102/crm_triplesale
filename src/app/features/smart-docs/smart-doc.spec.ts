import { ApplicationRef, signal } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { ActivatedRoute, Router, convertToParamMap } from '@angular/router';
import { BehaviorSubject } from 'rxjs';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AuthService } from '@core/auth/auth.service';
import { emptyLetterhead, resetLetterheads, saveLetterhead } from '@core/mock/company-letterhead';
import { resetMockupForTests } from '@core/mockup/mockup-datasource';
import { SmartDoc } from './smart-doc';
import { SAVE_DELAY_MS } from './smart-doc.logic';
import { resetSmartDocs, saveSmartDocs, savedSmartDocs } from './smart-doc.store';

describe('SmartDoc (/sales/smart-doc/:doc, generated from the BA prototype v14)', () => {
  let fixture: ComponentFixture<SmartDoc>;
  let el: HTMLElement;
  const params = new BehaviorSubject(convertToParamMap({ doc: 'qt' }));
  const navigate = vi.fn(async () => true);

  const $ = <T extends HTMLElement = HTMLElement>(id: string) =>
    document.getElementById(id) as T | null;
  const listRows = () => el.querySelectorAll('#listBody tr[data-no]');

  function open(doc: string) {
    params.next(convertToParamMap({ doc }));
    TestBed.configureTestingModule({
      providers: [
        {
          provide: ActivatedRoute,
          useValue: { paramMap: params, snapshot: { paramMap: params.value } },
        },
        { provide: Router, useValue: { navigate } },
        { provide: AuthService, useValue: { session: signal({ profileName: 'ผู้ทดสอบ' }) } },
      ],
    });
    fixture = TestBed.createComponent(SmartDoc);
    el = fixture.nativeElement;
    document.body.appendChild(el);
    fixture.detectChanges();
    TestBed.inject(ApplicationRef).tick();
  }

  beforeEach(() => {
    resetSmartDocs();
    navigate.mockClear();
  });

  afterEach(() => {
    fixture.destroy();
    el.remove();
    vi.useRealTimers();
    resetSmartDocs();
    resetMockupForTests();
  });

  it('should show the list of the document named in the URL when the page opens', () => {
    open('so');
    expect($('listView')?.hidden).toBe(false);
    expect($('listTitle')?.textContent).toContain('ใบจอง');
    expect(listRows().length).toBeGreaterThan(0);
    expect(navigate).not.toHaveBeenCalled();
  });

  it('should open the quotation list and fix the URL when the URL names no Smart Doc document', () => {
    open('bk');
    expect($('listTitle')?.textContent).toContain('ใบเสนอราคา');
    expect(navigate).toHaveBeenCalledWith(['/sales/smart-doc', 'qt'], { replaceUrl: true });
  });

  it('should switch to the list of another document when the shell menu changes the URL', () => {
    open('qt');
    params.next(convertToParamMap({ doc: 'rv' }));
    expect($('listTitle')?.textContent).toContain('ใบรับเงิน');
  });

  it('should move the URL and the shell menu to the referenced document when a reference link of the list is clicked', () => {
    // jsdom has no scrollIntoView; the list scrolls the referenced row into view
    Element.prototype.scrollIntoView ??= vi.fn();
    open('do');
    const link = el.querySelector<HTMLButtonElement>('#listBody .reflink[data-goto^="SO"]');
    expect(link).not.toBeNull();
    link?.click();
    expect($('listTitle')?.textContent).toContain('ใบจอง');
    expect(navigate).toHaveBeenCalledWith(['/sales/smart-doc', 'so'], { replaceUrl: true });
  });

  /** ยกเลิก (void) of the first quotation of the list, confirmed with a reason; gives its number */
  function cancelFirst(): string {
    const first = el.querySelector<HTMLButtonElement>('#listBody [data-menu]');
    const no = first?.getAttribute('data-menu') ?? '';
    first?.click();
    el.querySelector<HTMLButtonElement>('#rowMenu button[data-act="del"]')?.click();
    const reason = $<HTMLTextAreaElement>('lvDelReason');
    if (reason) reason.value = 'ออกเอกสารผิดลูกค้า';
    $<HTMLButtonElement>('lvDelOk')?.click();
    vi.advanceTimersByTime(SAVE_DELAY_MS + 10);
    return no;
  }

  it('should keep a cancelled quotation in the list with the status ยกเลิก when ยกเลิก is confirmed', () => {
    vi.useFakeTimers();
    open('qt');
    const before = listRows().length;
    const no = cancelFirst();

    expect(listRows().length).toBe(before);
    const row = el.querySelector(`#listBody tr[data-no="${no}"]`);
    expect(row?.classList.contains('lv-cx')).toBe(true);
    expect(row?.textContent).toContain('ยกเลิก');

    const saved = savedSmartDocs();
    const quotations = (saved?.['quotations'] ?? []) as { no: string }[];
    expect(quotations.some((q) => q.no === no)).toBe(false);
    const cancelled = (
      saved?.['cancelledDocs'] as Record<
        string,
        { no: string; cx: { by: string; reason: string } }[]
      >
    )['qt'];
    expect(cancelled?.[0]).toMatchObject({
      no,
      cx: { by: 'ผู้ทดสอบ', reason: 'ออกเอกสารผิดลูกค้า' },
    });
    expect((saved?.['deleteLog'] as { by: string }[])[0]?.by).toBe('ผู้ทดสอบ');
  });

  it('should offer only copy and print for a cancelled document when its row menu is opened', () => {
    vi.useFakeTimers();
    open('qt');
    const no = cancelFirst();
    el.querySelector<HTMLButtonElement>(`#listBody [data-menu="${no}"]`)?.click();
    const enabled = [...el.querySelectorAll('#rowMenu button[data-act]:not([disabled])')].map((b) =>
      b.getAttribute('data-act'),
    );
    expect(enabled).toEqual(['copy', 'print']);
  });

  it('should mark the print of a cancelled document with ยกเลิก and who, when and why', () => {
    vi.useFakeTimers();
    open('qt');
    const no = cancelFirst();
    el.querySelector<HTMLButtonElement>(`#listBody [data-menu="${no}"]`)?.click();
    el.querySelector<HTMLButtonElement>('#rowMenu button[data-act="print"]')?.click();
    const paper = $('paper');
    expect(paper?.querySelector('.pp-cx')?.textContent).toBe('ยกเลิก');
    const note = paper?.querySelector('.pp-cxnote')?.textContent ?? '';
    expect(note).toContain('ผู้ทดสอบ');
    expect(note).toContain('ออกเอกสารผิดลูกค้า');
  });

  it('should not mark the print of a document that is not cancelled', () => {
    open('qt');
    const row = [...listRows()].find((r) => !r.classList.contains('lv-cx'));
    const no = row?.getAttribute('data-no');
    el.querySelector<HTMLButtonElement>(`#listBody [data-menu="${no}"]`)?.click();
    el.querySelector<HTMLButtonElement>('#rowMenu button[data-act="print"]')?.click();
    expect($('paper')?.querySelector('.pp-cx')).toBeNull();
  });

  it('should list only the cancelled documents when the status filter is ยกเลิก', () => {
    vi.useFakeTimers();
    open('qt');
    const no = cancelFirst();
    const quick = $<HTMLSelectElement>('lvQuick');
    if (quick) {
      quick.value = 'cx';
      quick.dispatchEvent(new Event('change', { bubbles: true }));
    }
    expect([...listRows()].map((r) => r.getAttribute('data-no'))).toEqual([no]);
  });

  /** a new document of the list on screen, keyed in แบบแบ่ง section */
  function newInSections(doc: string) {
    open(doc);
    $<HTMLButtonElement>('newDoc')?.click();
    el.querySelector<HTMLButtonElement>('.kmode [data-km="sec"]')?.click();
  }
  const tabs = (nav: Element | null) =>
    [...(nav?.querySelectorAll('[data-kt]') ?? [])].map((b) => b.textContent?.trim());
  const shown = (doc: string) =>
    [...el.querySelectorAll(`#doc-${doc} .kpane:not([hidden])`)].map((p) =>
      p.getAttribute('data-kp'),
    );

  it('should show the document head in the upper tabs and its lines in a box of tabs under them when keyed in sections', () => {
    newInSections('qt');
    expect(tabs($('ksNav'))).toEqual(['ข้อมูลเอกสารและลูกค้า', 'เอกสารแนบ']);
    expect(tabs(el.querySelector('#doc-qt .klow-nav'))).toEqual(['รายการสินค้า', 'การชำระเงิน']);
    expect(shown('qt')).toEqual(['doc', 'items']);
    // the box comes after the upper sections
    expect(
      el.querySelector('#doc-qt .kmain > .klow')?.previousElementSibling?.getAttribute('data-kp'),
    ).toBe('att');
  });

  it('should hold the attachments only, across the whole width, in the เอกสารแนบ tab', () => {
    newInSections('qt');
    const pane = el.querySelector('#doc-qt .kpane[data-kp="att"]');
    expect(pane?.querySelector('[data-r="remark"]')).toBeNull();
    expect(pane?.querySelector('[data-r="attBody"]')?.closest('.kg4 > .s4')).not.toBeNull();
  });

  it('should show none of the prototype explanations on the list and a new document', () => {
    open('do');
    expect(el.querySelector('.mock-tag')).toBeNull();
    $<HTMLButtonElement>('newDoc')?.click();
    const text = el.textContent ?? '';
    for (const help of [
      'ส่วนลด: พิมพ์จำนวนเงิน',
      'เลือกแล้วระบบจะเปิดหน้าต่าง',
      'ช่องนี้แสดงผลอย่างเดียว',
      'เลือกลูกค้าแล้ว ระบบตั้งลูกค้าตามใบกำกับภาษี',
      'ไม่พบลูกค้าที่ต้องการ?',
      'แสดงเฉพาะใบจองที่อนุมัติแล้ว',
    ]) {
      expect(text).not.toContain(help);
    }
  });

  it('should hide the box of the lines when the เอกสารแนบ tab is open', () => {
    newInSections('rv');
    const box = el.querySelector<HTMLElement>('#doc-rv .klow');
    expect(box?.hidden).toBe(false);
    $('ksNav')?.querySelector<HTMLButtonElement>('[data-kt="att"]')?.click();
    expect(box?.hidden).toBe(true);
    $('ksNav')?.querySelector<HTMLButtonElement>('[data-kt="doc"]')?.click();
    expect(box?.hidden).toBe(false);
  });

  it('should put the remark under + เพิ่มรายการ in the tab of the lines', () => {
    newInSections('qt');
    const left = el.querySelector('#doc-qt .kpane[data-kp="items"] .kfoot .kfl');
    expect(left?.querySelector('[data-r="addItem"]')).not.toBeNull();
    expect(left?.querySelector('textarea[data-r="remark"]')).not.toBeNull();
  });

  it('should change only the section of its own set when a tab of either set is clicked', () => {
    newInSections('qt');
    el.querySelector<HTMLButtonElement>('#doc-qt .klow-nav [data-kt="pay"]')?.click();
    expect(shown('qt')).toEqual(['doc', 'pay']);
    $('ksNav')?.querySelector<HTMLButtonElement>('[data-kt="att"]')?.click();
    expect(shown('qt')).toEqual(['att', 'pay']);
  });

  it('should open the tab of the lines when its item of ก่อนบันทึก is clicked', () => {
    const scroll = vi.fn();
    const original = Element.prototype.scrollIntoView;
    Element.prototype.scrollIntoView = scroll;
    try {
      newInSections('qt');
      el.querySelector<HTMLButtonElement>('#doc-qt .klow-nav [data-kt="pay"]')?.click();
      el.querySelector<HTMLButtonElement>('#doc-qt .ksum [data-kgo="items"]')?.click();
      expect(shown('qt')).toEqual(['doc', 'items']);
    } finally {
      Element.prototype.scrollIntoView = original;
    }
  });

  it('should name the tabs of the lines of a receipt by what it receives', () => {
    newInSections('rv');
    expect(tabs(el.querySelector('#doc-rv .klow-nav'))).toEqual(['รายการรับชำระ', 'รับชำระโดย']);
  });

  /** sets a field of a receipt's form as the user would (typing, then leaving the field) */
  function key(field: HTMLInputElement | HTMLSelectElement | null | undefined, value: string) {
    if (!field) throw new Error('field not found');
    field.value = value;
    field.dispatchEvent(new Event('input', { bubbles: true }));
    field.dispatchEvent(new Event('change', { bubbles: true }));
  }
  const payRows = () => [...el.querySelectorAll('#doc-rv [data-r="pn-pay"] tr[data-t="pay"]')];

  /** a new receipt of one line of 1,000.00 */
  function receiptOf1000() {
    vi.useFakeTimers();
    open('rv');
    $<HTMLButtonElement>('newDoc')?.click();
    const line = el.querySelector('#doc-rv [data-r="itemBody"] tr[data-i="0"]');
    const code = line?.querySelector<HTMLSelectElement>('select[data-f="code"]');
    key(code, code?.options[1]?.value ?? '');
    key(
      el.querySelector<HTMLInputElement>(
        '#doc-rv [data-r="itemBody"] tr[data-i="0"] [data-f="amt"]',
      ),
      '1000',
    );
    vi.runAllTimers();
  }

  it('should show the value of a payment row read only, under the names มูลค่าสินค้า/บริการ and มูลค่าชำระครั้งนี้', () => {
    receiptOf1000();
    const head = [...el.querySelectorAll('#doc-rv [data-r="pn-pay"] thead th')].map((th) =>
      th.textContent?.trim(),
    );
    expect(head).toContain('มูลค่าสินค้า/บริการ');
    expect(head).toContain('มูลค่าชำระครั้งนี้');
    expect(head).not.toContain('มูลค่าที่ชำระ');
    const row = payRows()[0];
    expect(row?.querySelector('[data-k="amount"]')).toBeNull();
    expect(row?.querySelector('td.calc[data-pay-amt]')?.textContent).toBe('1,000.00');
    expect(row?.querySelector<HTMLInputElement>('[data-k="medium"]')?.value).toBe('1,000.00');
  });

  it('should split the value over the payment rows in their order when มูลค่าชำระครั้งนี้ is keyed', () => {
    receiptOf1000();
    key(payRows()[0]?.querySelector<HTMLInputElement>('[data-k="medium"]'), '600');
    vi.runAllTimers();
    el.querySelector<HTMLButtonElement>('#doc-rv [data-add="pay"]')?.click();
    key(payRows()[1]?.querySelector<HTMLInputElement>('[data-k="medium"]'), '500');
    vi.runAllTimers();
    expect(payRows().map((r) => r.querySelector('td.calc[data-pay-amt]')?.textContent)).toEqual([
      '600.00',
      '400.00',
    ]);
  });

  /** the quotation list opened again with its saved quotations copied up to `total` (numbers QT:T-001 …) */
  function openWithQuotations(total: number) {
    vi.useFakeTimers();
    open('qt');
    cancelFirst();
    const saved = savedSmartDocs() ?? {};
    const sample = (saved['quotations'] as Record<string, unknown>[])[0];
    const quotations = Array.from({ length: total }, (_, i) => ({
      ...sample,
      no: `QT:T-${String(i + 1).padStart(3, '0')}`,
    }));
    saveSmartDocs({ ...saved, quotations, cancelledDocs: {} });
    fixture.destroy();
    el.remove();
    TestBed.resetTestingModule();
    open('qt');
  }
  const pagerButtons = () =>
    [...el.querySelectorAll<HTMLButtonElement>('#lvPager button')].map((b) => b.textContent);

  it('should show 20 rows a page and a pager when the list has more than 20 documents', () => {
    openWithQuotations(25);
    expect(listRows().length).toBe(20);
    expect($('lvPager')?.hidden).toBe(false);
    expect(pagerButtons()).toEqual(['«', '1', '2', '»']);
    expect($('lvCount')?.textContent).toBe('แสดง 1–20 จาก 25 รายการ');

    el.querySelector<HTMLButtonElement>('#lvPager [data-page="2"]')?.click();
    expect(listRows().length).toBe(5);
    expect($('lvCount')?.textContent).toBe('แสดง 21–25 จาก 25 รายการ');
    expect(el.querySelector('#lvPager [aria-current="page"]')?.textContent).toBe('2');
    expect(el.querySelector<HTMLButtonElement>('#lvPager [aria-label="หน้าถัดไป"]')?.disabled).toBe(
      true,
    );
  });

  it('should go back to page 1 when the search changes', () => {
    openWithQuotations(25);
    el.querySelector<HTMLButtonElement>('#lvPager [data-page="2"]')?.click();
    const search = $<HTMLInputElement>('lvQ');
    if (search) {
      search.value = 'QT:T-0';
      search.dispatchEvent(new Event('input', { bubbles: true }));
    }
    expect($('lvCount')?.textContent).toBe('แสดง 1–20 จาก 25 รายการ');
  });

  it('should show no pager when the list has 20 documents or fewer', () => {
    openWithQuotations(20);
    expect(listRows().length).toBe(20);
    expect($('lvPager')?.hidden).toBe(true);
  });

  it('should show the company letterhead of the settings at the head of a new document', () => {
    saveLetterhead('e1', {
      ...emptyLetterhead(),
      nameTh: 'บริษัท ทดสอบหัวกระดาษ จำกัด',
      taxId: '0105500000001',
      branchNo: '00000',
      logo: 'data:image/png;base64,iVBORw0KGgo=',
    });
    try {
      open('qt');
      el.querySelector<HTMLButtonElement>('#newDoc')?.click();
      const head = el.querySelector('#doc-qt .co');
      expect(head?.querySelector('.co-name')?.textContent).toBe('บริษัท ทดสอบหัวกระดาษ จำกัด');
      expect(head?.textContent).toContain('0105500000001 (สำนักงานใหญ่)');
      expect(head?.querySelector('.logo img')?.getAttribute('src')).toBe(
        'data:image/png;base64,iVBORw0KGgo=',
      );
    } finally {
      resetLetterheads();
    }
  });

  it('should keep the prototype company at the head of a document when no letterhead is saved', () => {
    open('qt');
    el.querySelector<HTMLButtonElement>('#newDoc')?.click();
    expect(el.querySelector('#doc-qt .co .co-name')?.textContent).toBe(
      'บริษัท โกลด์ เกทเวย์ จำกัด',
    );
    expect(el.querySelector('#doc-qt .co .logo img')).toBeNull();
  });

  it('should start from the saved state when the page is opened again', () => {
    vi.useFakeTimers();
    open('qt');
    const no = cancelFirst();
    const count = listRows().length;
    fixture.destroy();
    el.remove();
    TestBed.resetTestingModule();

    open('qt');
    expect(listRows().length).toBe(count);
    expect(el.querySelector(`#listBody tr[data-no="${no}"]`)?.classList.contains('lv-cx')).toBe(
      true,
    );
  });
});
