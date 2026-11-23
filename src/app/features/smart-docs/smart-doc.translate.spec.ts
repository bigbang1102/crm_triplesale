import { afterEach, describe, expect, it } from 'vitest';
import { PageTranslator, translator } from './smart-doc.translate';

const DICT = {
  ใบเสนอราคา: 'Quotation',
  บันทึก: 'Save',
  แสดง: 'Showing',
  จาก: 'of',
  รายการ: 'items',
  ค้นหาลูกค้า: 'Find customer',
  สถานะ: 'Status',
  คัน: 'unit',
};

describe('translator (Thai of the prototype → English)', () => {
  const t = translator(DICT);

  it('should give the English of a known text and keep its spaces around', () => {
    expect(t(' บันทึก ')).toBe(' Save ');
  });

  it('should put a message with numbers together from its known pieces', () => {
    expect(t('แสดง 1–20 จาก 45 รายการ')).toBe('Showing 1–20 of 45 items');
    expect(t('ใบเสนอราคา (QT)')).toBe('Quotation (QT)');
  });

  it('should leave a name or an address with unknown Thai as it is', () => {
    expect(t('ฟิล์มกรองแสงรอบคัน')).toBeNull();
    expect(t('บริษัท เอเชีย ทรานสปอร์ต จำกัด')).toBeNull();
  });

  it('should leave a text without Thai', () => {
    expect(t('QT:M00-2611-00013')).toBeNull();
  });
});

describe('PageTranslator', () => {
  let root: HTMLElement;
  afterEach(() => root?.remove());

  function page(html: string): PageTranslator {
    root = document.createElement('div');
    root.innerHTML = html;
    document.body.appendChild(root);
    return new PageTranslator(root, translator(DICT), new Set(['สถานะ']));
  }

  it('should show the page in English and give the Thai back when the language is Thai again', () => {
    const p = page('<button title="ค้นหาลูกค้า">บันทึก</button><span>สมชาย ใจดี</span>');
    p.setEnglish(true);
    expect(root.querySelector('button')?.textContent).toBe('Save');
    expect(root.querySelector('button')?.title).toBe('Find customer');
    expect(root.querySelector('span')?.textContent).toBe('สมชาย ใจดี');
    p.setEnglish(false);
    expect(root.querySelector('button')?.textContent).toBe('บันทึก');
    expect(root.querySelector('button')?.title).toBe('ค้นหาลูกค้า');
  });

  it('should put in English what the script writes after', async () => {
    const p = page('<div id="x"></div>');
    p.setEnglish(true);
    root.querySelector('#x')!.innerHTML = '<b>ค้นหาลูกค้า</b>';
    await Promise.resolve();
    expect(root.querySelector('b')?.textContent).toBe('Find customer');
    p.stop();
  });

  it('should keep an attribute the script looks elements up by, and the text of a textarea', () => {
    const p = page('<section aria-label="สถานะ"></section><textarea>บันทึก</textarea>');
    p.setEnglish(true);
    expect(root.querySelector('section')?.getAttribute('aria-label')).toBe('สถานะ');
    expect(root.querySelector('textarea')?.value).toBe('บันทึก');
  });

  it('should use the wording of the place a word is in', () => {
    root = document.createElement('div');
    root.innerHTML = '<span class="bdg">ยกเลิก</span><button>ยกเลิก</button>';
    document.body.appendChild(root);
    const p = new PageTranslator(root, translator({ ยกเลิก: 'Cancel' }), new Set(), [
      { selector: '.bdg', words: { ยกเลิก: 'Cancelled' } },
    ]);
    p.setEnglish(true);
    expect(root.querySelector('.bdg')?.textContent).toBe('Cancelled');
    expect(root.querySelector('button')?.textContent).toBe('Cancel');
  });
});
