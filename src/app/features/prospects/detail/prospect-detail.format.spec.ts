import { describe, expect, it } from 'vitest';
import { newContractBean } from '../form/prospect-form-types';
import { codeAndName, customerKind, dash, dmy, socialChannels, usageStatus } from './prospect-detail.format';

describe('prospect-detail.format', () => {
  it('dash / dmy', () => {
    expect(dash('')).toBe('-');
    expect(dash(null)).toBe('-');
    expect(dash(0)).toBe('0');
    expect(dmy('2026-11-04T10:00:00+07:00')).toBe('04/11/2026');
    expect(dmy('')).toBe('-');
  });
  it('customer kind and status', () => {
    expect(customerKind({ customer_type: 'juristic' })).toBe('juristic');
    expect(customerKind({ customer_type: 'person' })).toBe('person');
    expect(customerKind({ customer_type: '' })).toBe('person');
    expect(usageStatus({ usagestatus: 'Block' })).toBe('block');
    expect(usageStatus({ usagestatus: '' })).toBe('release');
  });
  it('names', () => {
    expect(codeAndName('CS001', 'ชวัญจิรา')).toBe('CS001 ชวัญจิรา');
    expect(codeAndName('', '')).toBe('-');
  });
  it('social channels keep the order of the form', () => {
    const c = { ...newContractBean('2026-01-01'), prospect_line: ' malica ', prospect_instragram: 'ig' };
    expect(socialChannels(c)).toEqual([
      { key: 'line', value: 'malica' },
      { key: 'facebook', value: '' },
      { key: 'x', value: '' },
      { key: 'instagram', value: 'ig' },
    ]);
  });
});
