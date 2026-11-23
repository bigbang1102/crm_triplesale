import { describe, expect, it } from 'vitest';
import { emptyLetterhead, resetLetterheads, saveLetterhead } from '@core/mock/company-letterhead';
import { afterEach } from 'vitest';
import { amountInWordsEn, englishPaper, numberInWordsEn } from './smart-doc.print';

describe('amount in words (English print)', () => {
  it('should write whole baht with "Only"', () => {
    expect(amountInWordsEn(903496)).toBe(
      'Nine Hundred Three Thousand Four Hundred Ninety-Six Baht Only',
    );
    expect(amountInWordsEn(1_000_000)).toBe('One Million Baht Only');
    expect(amountInWordsEn(0)).toBe('Zero Baht Only');
  });

  it('should write the satang after the baht', () => {
    expect(amountInWordsEn(1994533.19)).toBe(
      'One Million Nine Hundred Ninety-Four Thousand Five Hundred Thirty-Three Baht and Nineteen Satang',
    );
    expect(amountInWordsEn(0.5)).toBe('Fifty Satang');
  });

  it('should leave out the empty thousands', () => {
    expect(numberInWordsEn(2_000_015)).toBe('Two Million Fifteen');
  });
});

describe('englishPaper', () => {
  it('should put the labels, the amount in words and the company name in English and keep the data', () => {
    const paper = document.createElement('div');
    paper.innerHTML =
      '<div class="pp-coname" data-en="Gold Gateway Co., Ltd.">บริษัท โกลด์ เกทเวย์ จำกัด</div>' +
      '<span>ลูกค้า</span><b>พิมพ์ชนก ศรีสุข</b>' +
      '<div class="pp-words" data-amount="12500">( หนึ่งหมื่นสองพันห้าร้อยบาทถ้วน )</div>';
    const box = document.createElement('div');
    box.innerHTML = englishPaper(paper);
    expect(box.querySelector('.pp-coname')?.textContent).toBe('Gold Gateway Co., Ltd.');
    expect(box.querySelector('span')?.textContent).toBe('Customer');
    expect(box.querySelector('b')?.textContent).toBe('พิมพ์ชนก ศรีสุข');
    expect(box.querySelector('.pp-words')?.textContent).toBe(
      '( Twelve Thousand Five Hundred Baht Only )',
    );
    // the page's own print view is not touched
    expect(paper.querySelector('span')?.textContent).toBe('ลูกค้า');
  });

  afterEach(() => resetLetterheads());

  it('should write the English address of the letterhead under the company name', () => {
    saveLetterhead('e1', {
      ...emptyLetterhead(),
      nameTh: 'บริษัท โกลด์ เกทเวย์ จำกัด',
      nameEn: 'Gold Gateway Co., Ltd.',
      taxId: '0105562175851',
      branchNo: '00000',
      addressTh: '555 ซอยโชคชัย',
      addressEn: '555 Soi Chokchai, Bangkok',
    });
    const paper = document.createElement('div');
    paper.innerHTML =
      '<div class="pp-co"><div class="pp-coname" data-en="Gold Gateway Co., Ltd.">บริษัท โกลด์ เกทเวย์ จำกัด</div><div>เลขประจำตัวผู้เสียภาษี: 0105562175851<br>555 ซอยโชคชัย</div></div>';
    const box = document.createElement('div');
    box.innerHTML = englishPaper(paper);
    expect(box.querySelector('.pp-co > div:last-child')?.innerHTML).toBe(
      'Tax ID: 0105562175851 (Head office)<br>555 Soi Chokchai, Bangkok',
    );
  });

  it('should put the cancelled mark of the paper in English', () => {
    const paper = document.createElement('div');
    paper.innerHTML =
      '<div class="pp-cx">ยกเลิก</div><div class="pp-cxnote"><b>เอกสารถูกยกเลิกแล้ว</b> · <span>ผู้ยกเลิก</span> <span>สมชาย</span></div>';
    const box = document.createElement('div');
    box.innerHTML = englishPaper(paper);
    expect(box.querySelector('.pp-cx')?.textContent).toBe('Cancelled');
    expect(box.querySelector('.pp-cxnote')?.textContent).toBe(
      'The document is cancelled · Cancelled by สมชาย',
    );
  });
});
