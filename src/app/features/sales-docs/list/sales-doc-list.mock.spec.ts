import { describe, expect, it } from 'vitest';
import { SALES_DOC_TYPES, salesDocType } from '../sales-doc-types';
import { createMockSalesDocList } from './sales-doc-list.mock';

describe('sales-doc-list mock (the Java page has no list API yet: every table is empty)', () => {
  it('answers no rows for each of the five types', async () => {
    const backend = createMockSalesDocList();
    for (const type of SALES_DOC_TYPES) expect(await backend.list(type), type).toEqual([]);
  });

  it('keeps nothing between calls (a fresh array each time)', async () => {
    const backend = createMockSalesDocList();
    const a = await backend.list('qt');
    a.push({ no: 'x', date: '2026-01-01', customer: 'c', employee: 'e', total: 1, status: 's' });
    expect(await backend.list('qt')).toEqual([]);
  });
});

describe('salesDocType (`param.doc eq …` of the Java page)', () => {
  it('knows exactly the five types, in lower case', () => {
    expect(SALES_DOC_TYPES).toEqual(['qt', 'bk', 'ob', 'aq', 'ad']);
    for (const t of SALES_DOC_TYPES) expect(salesDocType(t)).toBe(t);
  });

  it('turns everything else into the legacy list (empty string)', () => {
    for (const v of ['QT', 'Qt', 'so', 'qt ', '', undefined, null, 'qt/new', '../qt']) expect(salesDocType(v as string), String(v)).toBe('');
  });
});
