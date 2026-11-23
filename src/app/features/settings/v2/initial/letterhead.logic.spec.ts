import { describe, expect, it } from 'vitest';
import { fitWithin } from './letterhead.logic';

describe('fitWithin (the size a picked logo is kept at)', () => {
  it('should scale a large logo down so that its longest side is the maximum', () => {
    expect(fitWithin(1600, 800, 400)).toEqual({ width: 400, height: 200 });
    expect(fitWithin(300, 900, 400)).toEqual({ width: 133, height: 400 });
  });

  it('should keep a small logo at its own size', () => {
    expect(fitWithin(120, 80, 400)).toEqual({ width: 120, height: 80 });
  });
});
