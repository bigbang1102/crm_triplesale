import { describe, expect, it } from 'vitest';
import { formatPhone } from './leads.format';

describe('formatPhone', () => {
  it('should group a Thai mobile number written with a leading 0', () => {
    expect(formatPhone('+66', '0801234567')).toBe('+66 80 123 4567');
  });

  it('should group a Thai mobile number written with the country code', () => {
    expect(formatPhone('+66', '66801234567')).toBe('+66 80 123 4567');
  });

  it('should keep a number of another country as typed', () => {
    expect(formatPhone('+61', '412 345 678')).toBe('+61 412 345 678');
  });

  it('should show a dash when there is no number', () => {
    expect(formatPhone('+66', ' ')).toBe('-');
  });
});
