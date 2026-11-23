import { afterEach, describe, expect, it } from 'vitest';
import { resetMockupForTests } from '@core/mockup/mockup-datasource';
import {
  currentLetterhead,
  emptyLetterhead,
  letterheadLines,
  letterheadLinesEn,
  letterheadOf,
  resetLetterheads,
  saveLetterhead,
} from './company-letterhead';

const PNG = 'data:image/png;base64,iVBORw0KGgo=';

describe('company letterhead (Datasource)', () => {
  afterEach(() => {
    resetLetterheads();
    resetMockupForTests();
    localStorage.removeItem('ts.settings.entity');
  });

  it('should give no letterhead when none was saved', () => {
    expect(currentLetterhead()).toBeUndefined();
  });

  it('should keep one letterhead per company and give the company chosen in the settings', () => {
    saveLetterhead('e1', { ...emptyLetterhead(), nameTh: 'บริษัท หนึ่ง จำกัด' });
    saveLetterhead('e2', { ...emptyLetterhead(), nameTh: 'บริษัท สอง จำกัด' });
    localStorage.setItem('ts.settings.entity', 'e2');
    expect(currentLetterhead()?.nameTh).toBe('บริษัท สอง จำกัด');
    expect(letterheadOf('e1')?.nameTh).toBe('บริษัท หนึ่ง จำกัด');
  });

  it('should give the first saved letterhead when the chosen company has none', () => {
    saveLetterhead('e1', { ...emptyLetterhead(), nameTh: 'บริษัท หนึ่ง จำกัด' });
    localStorage.setItem('ts.settings.entity', 'other');
    expect(currentLetterhead()?.nameTh).toBe('บริษัท หนึ่ง จำกัด');
  });

  it('should keep an image data URL as the logo and drop anything else', () => {
    saveLetterhead('e1', { ...emptyLetterhead(), logo: PNG });
    expect(letterheadOf('e1')?.logo).toBe(PNG);
    saveLetterhead('e1', { ...emptyLetterhead(), logo: 'javascript:alert(1)' });
    expect(letterheadOf('e1')?.logo).toBeNull();
  });

  it('should write the head office and the contacts under the name like the prototype', () => {
    const lines = letterheadLines({
      ...emptyLetterhead(),
      taxId: '0105562175851',
      branchNo: '00000',
      addressTh: '555 ถนนพระราม 3 กรุงเทพฯ',
      tel: '02-231-6799',
      fax: '02-231-6796',
    });
    expect(lines).toEqual([
      'เลขประจำตัวผู้เสียภาษี: 0105562175851 (สำนักงานใหญ่)',
      '555 ถนนพระราม 3 กรุงเทพฯ',
      'โทร: 02-231-6799  ·  แฟกซ์: 02-231-6796',
    ]);
  });

  it('should put the address parts of MYCOMPANY on one line, and the country only when it is not Thailand', () => {
    const base = {
      ...emptyLetterhead(),
      addressTh: '555 ซอยโชคชัยจงเจริญ',
      subdistrictTh: 'แขวงบางโพงพาง',
      districtTh: 'เขตยานนาวา',
      provinceTh: 'กรุงเทพมหานคร',
      zipcode: '10120',
    };
    expect(letterheadLines({ ...base, countryTh: 'ไทย' })).toEqual([
      '555 ซอยโชคชัยจงเจริญ แขวงบางโพงพาง เขตยานนาวา กรุงเทพมหานคร 10120',
    ]);
    expect(letterheadLines({ ...base, countryTh: 'ลาว' })[0]).toMatch(/10120 ลาว$/);
  });

  it('should write the English lines with the English address, or the Thai one when there is none', () => {
    const l = {
      ...emptyLetterhead(),
      taxId: '0105562175851',
      branchNo: '00000',
      addressTh: '555 ซอยโชคชัย',
      addressEn: '555 Soi Chokchai, Bangkok',
      zipcode: '10120',
      tel: '02-231-6799',
    };
    expect(letterheadLinesEn(l)).toEqual([
      'Tax ID: 0105562175851 (Head office)',
      '555 Soi Chokchai, Bangkok 10120',
      'Tel: 02-231-6799',
    ]);
    expect(letterheadLinesEn({ ...l, addressEn: '' })[1]).toBe('555 ซอยโชคชัย 10120');
  });
});
