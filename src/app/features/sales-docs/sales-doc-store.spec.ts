import { afterEach, describe, expect, it, vi } from 'vitest';
import { captureSalesDocSaves, recordSalesDoc, resetSalesDocStore, storedSalesDocRows } from './sales-doc-store';

const payload = (over: Record<string, unknown> = {}) => ({ header: { doc_no: 'NEW', doc_date: '2026-11-20', prospect_name: 'จิราพร แสงทอง', saleperson: 'ผู้ดูแลระบบ', refdocno: null, netamount_after_vat: 1092.5, ...over }, lines: [] });

describe('the sales documents saved in the mockup', () => {
  afterEach(() => resetSalesDocStore());

  it('should keep a document as a row of the list of its type, newest first, with its own numbers', () => {
    const a = recordSalesDoc('qt', payload());
    const b = recordSalesDoc('qt', payload({ prospect_name: 'อีกคน' }));
    recordSalesDoc('bk', payload({ refdocno: 'QT:M00-2611-00001' }));
    expect(a?.no).toBe('QT:M00-2611-00001');
    expect(b?.no).toBe('QT:M00-2611-00002');
    expect(storedSalesDocRows('qt').map((r) => r.customer)).toEqual(['อีกคน', 'จิราพร แสงทอง']);
    expect(storedSalesDocRows('bk')).toMatchObject([{ no: 'BK:M00-2611-00001', ref: 'QT:M00-2611-00001', total: 1092.5, status: 'บันทึกแล้ว' }]);
    expect(storedSalesDocRows('ob')).toEqual([]);
  });

  it('should read the sale person from { name } and the customer from the screen when the payload has no customer name (sales order)', () => {
    document.body.innerHTML = '<div id="bkCName">อนุชา แสงทอง</div>';
    const row = recordSalesDoc('bk', payload({ prospect_name: undefined, saleperson: { id: 1, name: 'ผู้ดูแลระบบ' } }));
    expect(row).toMatchObject({ customer: 'อนุชา แสงทอง', employee: 'ผู้ดูแลระบบ' });
    document.body.innerHTML = '';
  });

  it('should ignore something that is not a payload', () => {
    expect(recordSalesDoc('qt', null)).toBeUndefined();
    expect(recordSalesDoc('qt', { nothing: 1 })).toBeUndefined();
    expect(storedSalesDocRows('qt')).toEqual([]);
  });

  it('should take the payload from the line the forms write to console.debug, and stop when asked', () => {
    const original = console.debug;
    const spy = vi.fn();
    console.debug = spy;
    const stop = captureSalesDocSaves();
    console.debug('[qt] document payload', payload());
    console.debug('something else', payload());
    stop();
    console.debug('[qt] document payload', payload());
    console.debug = original;
    expect(storedSalesDocRows('qt')).toHaveLength(1);
    expect(spy).toHaveBeenCalledTimes(3);
  });
});

describe('the forms that write no payload (ob · aq · ad)', () => {
  afterEach(() => {
    resetSalesDocStore();
    document.body.innerHTML = '';
  });

  const screenOf = (p: string, over: Record<string, string> = {}): void => {
    document.body.innerHTML = `
      <input id="${p}DocDate" value="${over['date'] ?? '20/11/2026'}">
      <div id="${p}CName">${over['customer'] ?? 'จิราพร แสงทอง'}</div>
      <input id="${p}RefNo" value="">
      <select id="${p}DocEmployee"><option>ผู้ดูแลระบบ</option></select>
      <span id="${p}${p === 'ob' ? 'Grand' : 'NetPrice'}">฿ 1,234.50</span>
      <div id="${p}SavedNo"></div>`;
  };

  it('should read the document from the screen when the pop-up writes its number, and read it as the list wants it', async () => {
    const stop = captureSalesDocSaves();
    screenOf('aq');
    document.getElementById('aqSavedNo')!.textContent = 'AQ:M00-2611-00000';
    await Promise.resolve();
    await new Promise((r) => setTimeout(r));
    stop();
    expect(storedSalesDocRows('aq')).toMatchObject([{ no: 'AQ:M00-2611-00001', date: '2026-11-20', customer: 'จิราพร แสงทอง', employee: 'ผู้ดูแลระบบ', total: 1234.5 }]);
  });

  it('should use the total field of the type, and keep nothing when the listening is stopped', async () => {
    const stop = captureSalesDocSaves();
    screenOf('ob');
    document.getElementById('obSavedNo')!.textContent = 'OB:x';
    await new Promise((r) => setTimeout(r));
    stop();
    expect(storedSalesDocRows('ob')).toMatchObject([{ total: 1234.5 }]);
    document.getElementById('obSavedNo')!.textContent = 'OB:y';
    await new Promise((r) => setTimeout(r));
    expect(storedSalesDocRows('ob')).toHaveLength(1);
  });
});
