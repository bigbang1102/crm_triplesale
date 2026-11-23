import { afterEach, describe, expect, it } from 'vitest';
import { resetMockupForTests, setDatasource } from '@core/mockup/mockup-datasource';
import { SMART_DOC_KEYS, smartDocKey } from './smart-doc.logic';
import { resetSmartDocs, saveSmartDocs, savedSmartDocs } from './smart-doc.store';

describe('smart doc logic', () => {
  it('smartDocKey should accept the four documents of the URL', () => {
    for (const key of SMART_DOC_KEYS) expect(smartDocKey(key)).toBe(key);
  });

  it('smartDocKey should give undefined when the URL names no Smart Doc document', () => {
    expect(smartDocKey('bk')).toBeUndefined();
    expect(smartDocKey('')).toBeUndefined();
    expect(smartDocKey(null)).toBeUndefined();
  });
});

describe('smart doc store (Datasource state.smart-docs)', () => {
  afterEach(() => {
    resetSmartDocs();
    resetMockupForTests();
  });

  it('should have no saved state when Datasource holds none (the prototype samples are used)', () => {
    resetSmartDocs();
    expect(savedSmartDocs()).toBeUndefined();
  });

  it('should restore the state that Datasource holds', () => {
    setDatasource(
      { 'state.smart-docs': { data: { version: 1, quotations: [{ no: 'QT:1' }] } } },
      false,
    );
    resetSmartDocs();
    setDatasource(
      { 'state.smart-docs': { data: { version: 1, quotations: [{ no: 'QT:1' }] } } },
      false,
    );
    expect(savedSmartDocs()).toEqual({ version: 1, quotations: [{ no: 'QT:1' }] });
  });

  it('should give a copy when saved data is changed by its user afterwards', () => {
    const data = { version: 1, quotations: [{ no: 'QT:2' }] };
    saveSmartDocs(data);
    data.quotations.push({ no: 'QT:3' });
    const first = savedSmartDocs();
    expect(first).toEqual({ version: 1, quotations: [{ no: 'QT:2' }] });
    (first?.['quotations'] as unknown[]).length = 0;
    expect(savedSmartDocs()).toEqual({ version: 1, quotations: [{ no: 'QT:2' }] });
  });
});
