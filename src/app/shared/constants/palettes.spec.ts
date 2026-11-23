import { describe, expect, it } from 'vitest';
import {
  STEPPER_PALETTE,
  TAG_PALETTE,
  groupPillColor,
  groupPillStyle,
  hexToRgba,
  interestColor,
  stepperColor,
} from './palettes';

describe('stepper palette', () => {
  it('has one row per step count 1..12 with exactly that many colours', () => {
    for (let n = 1; n <= 12; n++) expect(STEPPER_PALETTE[n].length).toBe(n);
  });

  it('picks colours left → right for a given total', () => {
    expect(stepperColor(3, 0)).toBe('#0C8E6A');
    expect(stepperColor(3, 1)).toBe('#0D61CF');
    expect(stepperColor(3, 2)).toBe('#6043B6');
  });

  it('uses row 12 when there are more than 12 groups and clamps idx to the last colour', () => {
    expect(stepperColor(20, 0)).toBe('#0C8E6A');
    expect(stepperColor(20, 99)).toBe('#B7A4EF');
  });
});

describe('interest colour', () => {
  it('maps every status, case-insensitively', () => {
    expect(interestColor('HOT')).toBe('#EB5050');
    expect(interestColor('warm')).toBe('#FF8E4E');
    expect(interestColor(' Cold ')).toBe('#4B84FF');
  });

  it('treats SOLD and SUCCESS as the same green', () => {
    expect(interestColor('SOLD')).toBe('#008B5A');
    expect(interestColor('SUCCESS')).toBe(interestColor('SOLD'));
  });

  it('falls back to the LOST grey for unknown / empty values', () => {
    expect(interestColor('???')).toBe('#8A92A6');
    expect(interestColor(null)).toBe('#8A92A6');
  });
});

describe('tag palette', () => {
  it('has 20 colours', () => {
    expect(TAG_PALETTE.length).toBe(20);
  });

  it('is deterministic and stays inside the palette', () => {
    const a = groupPillColor('CRM');
    expect(groupPillColor('CRM')).toBe(a);
    expect(TAG_PALETTE).toContain(a);
    expect(TAG_PALETTE).toContain(groupPillColor('กลุ่มขั้นตอนทดสอบ'));
  });

  it('returns the first colour for an empty name', () => {
    expect(groupPillColor('')).toBe(TAG_PALETTE[0]);
    expect(groupPillColor(undefined)).toBe(TAG_PALETTE[0]);
  });

  it('matches the reference hash (h*31 + code, 32-bit) for a known name', () => {
    // "SUN" → ((83*31)+85)*31+78 = 82476 → 82476 % 20 = 16
    expect(groupPillColor('SUN')).toBe(TAG_PALETTE[16]);
    expect(groupPillColor('SUN')).toBe('#A15D37');
  });
});

describe('hexToRgba / groupPillStyle', () => {
  it('converts hex to rgba', () => {
    expect(hexToRgba('#0C8E6A', 0.2)).toBe('rgba(12,142,106,0.2)');
  });

  it('builds a 20 % background with a full-colour text', () => {
    const style = groupPillStyle('LS');
    expect(style.color).toBe(groupPillColor('LS'));
    expect(style.background).toBe(hexToRgba(style.color, 0.2));
  });
});
