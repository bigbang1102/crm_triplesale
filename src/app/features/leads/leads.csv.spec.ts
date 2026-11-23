import { describe, expect, it } from 'vitest';
import { IMPORT_COLUMNS, checkImport, importTemplateCsv, parseCsv, phoneKey, toCsv } from './leads.csv';

describe('the CSV of the Lead menu', () => {
  it('should read cells with quotes, commas, new lines and a BOM', () => {
    expect(parseCsv('﻿a,"b,1","c ""q"""\r\nx,y,z\n\n')).toEqual([['a', 'b,1', 'c "q"'], ['x', 'y', 'z']]);
  });

  it('should compare phone numbers by their digits, with or without the leading 0 / 66', () => {
    expect(phoneKey('081-234-5601')).toBe('812345601');
    expect(phoneKey('+66 81 234 5601')).toBe('812345601');
    expect(phoneKey('')).toBe('');
  });

  it('should check each row: new, already a lead, repeated in the file, no phone', () => {
    const rows = parseCsv(`${IMPORT_COLUMNS.join(',')}\nสมชาย,ใจดี,0811111111,,\nสมหญิง,ดี,0822222222,,\nสมศรี,ซ้ำ,082-222-2222,,\nไม่มี,เบอร์,,,\n`);
    const checked = checkImport(rows, [{ phone: '0811111111' }]);
    expect(checked.map((r) => r.state)).toEqual(['exists', 'new', 'duplicate', 'noPhone']);
    expect(checked[1]).toMatchObject({ no: 2, firstName: 'สมหญิง', lastName: 'ดี' });
  });

  it('should write a file Excel reads (BOM, quotes) and a template that reads back', () => {
    expect(toCsv(['ชื่อ', 'หมายเหตุ'], [['ก', 'a,"b"']])).toBe('﻿ชื่อ,หมายเหตุ\r\nก,"a,""b"""\r\n');
    expect(parseCsv(importTemplateCsv())[0]).toEqual([...IMPORT_COLUMNS]);
  });
});
