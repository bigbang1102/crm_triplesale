import { afterEach, describe, expect, it, vi } from 'vitest';
import { referenceDefaults, resetReferenceRegistry } from '@core/mock/reference';
import { resetMockupForTests, setDatasource } from '@core/mockup/mockup-datasource';
import { SUPPORTING_DOC_TYPES } from './supporting-doc-types';
import { createMockSupportingDocs, registerReferenceLists } from './supporting-doc.mock';

afterEach(() => {
  resetMockupForTests();
  resetReferenceRegistry();
  vi.restoreAllMocks();
});

const allDocuments = (): Record<number, unknown[]> => {
  const mock = createMockSupportingDocs({ delayMs: 0 });
  return Object.fromEntries(SUPPORTING_DOC_TYPES.map((t) => [t.n, mock.documents(t)]));
};

describe('the supporting documents taken from the shared Datasource (ref.supportingDocs.json › documents)', () => {
  it('should give the very same documents of every family when the document is what the formulas made', () => {
    const before = allDocuments();
    registerReferenceLists();
    const doc = referenceDefaults()['supportingDocs'];
    setDatasource({ 'ref.supportingDocs': doc }, true);
    expect(allDocuments()).toEqual(before);
    expect(Object.values(before).map((d) => d.length)).toEqual([53, 20, 7, 0, 41, 3, 12]);
  });

  it('should show the documents the file says, and a family with none stays empty', () => {
    registerReferenceLists();
    const doc = referenceDefaults()['supportingDocs'] as { documents: Record<string, Record<string, unknown>[]> };
    doc.documents['3'][0]['txNo'] = 'จากไฟล์กลาง-1';
    doc.documents['3'].pop();
    setDatasource({ 'ref.supportingDocs': doc }, true);
    const mock = createMockSupportingDocs({ delayMs: 0 });
    const family = SUPPORTING_DOC_TYPES.find((t) => t.n === 3)!;
    expect(mock.documents(family)).toHaveLength(6);
    expect(mock.documents(family)[0]['txNo']).toBe('จากไฟล์กลาง-1');
    expect(mock.documents(SUPPORTING_DOC_TYPES.find((t) => t.n === 4)!)).toHaveLength(0);
  });

  it('should keep the formulas when the file does not fit (a family is missing)', () => {
    vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    const before = allDocuments();
    setDatasource({ 'ref.supportingDocs': { documents: { '1': [] } } }, true);
    expect(allDocuments()).toEqual(before);
  });
});
