import { describe, expect, it } from 'vitest';
import {
  areaPath,
  axisTicks,
  donutArcs,
  linePath,
  linePoints,
  niceMax,
  seriesColor,
} from './chart-geometry';

describe('chart geometry', () => {
  it('should round the axis maximum up to 1, 2, 5 or 10 times a power of ten', () => {
    expect(niceMax(0)).toBe(1);
    expect(niceMax(-3)).toBe(1);
    expect(niceMax(0.7)).toBe(1);
    expect(niceMax(1.2)).toBe(2);
    expect(niceMax(3_400)).toBe(5_000);
    expect(niceMax(5_000)).toBe(5_000);
    expect(niceMax(7_000)).toBe(10_000);
  });

  it('should split the axis in equal steps from zero', () => {
    expect(axisTicks(100)).toEqual([0, 25, 50, 75, 100]);
    expect(axisTicks(10, 2)).toEqual([0, 5, 10]);
  });

  it('should map values to points with y inverted, and survive a single value or a zero max', () => {
    expect(linePoints([0, 50, 100], 200, 100, 100)).toEqual([
      { x: 0, y: 100 },
      { x: 100, y: 50 },
      { x: 200, y: 0 },
    ]);
    expect(linePoints([5], 200, 100, 10)).toEqual([{ x: 0, y: 50 }]);
    expect(linePoints([3, 4], 10, 10, 0).map((p) => p.y)).toEqual([10, 10]);
    expect(linePoints([], 10, 10, 1)).toEqual([]);
  });

  it('should write a line path and close the area down to the baseline', () => {
    const points = [
      { x: 0, y: 10 },
      { x: 5, y: 2 },
    ];
    expect(linePath(points)).toBe('M0,10 L5,2');
    expect(areaPath(points, 10)).toBe('M0,10 L5,2 L5,10 L0,10 Z');
    expect(areaPath([], 10)).toBe('');
  });

  it('should give each positive value a ring segment with its share, and none for zeros', () => {
    const arcs = donutArcs([30, 0, 70], 56, 36);
    expect(arcs.map((a) => a.index)).toEqual([0, 2]);
    expect(arcs.map((a) => a.share)).toEqual([0.3, 0.7]);
    expect(arcs[0].path.startsWith('M')).toBe(true);
    expect(donutArcs([0, 0], 56, 36)).toEqual([]);
    expect(donutArcs([], 56, 36)).toEqual([]);
  });

  it('should keep a single full-circle segment drawable (no NaN)', () => {
    const [arc] = donutArcs([100], 56, 36);
    expect(arc.path).not.toContain('NaN');
    expect(arc.share).toBe(1);
  });

  it('should cycle the six design-system series colours', () => {
    expect(seriesColor(0)).toBe('var(--ds-res-1)');
    expect(seriesColor(5)).toBe('var(--ds-res-6)');
    expect(seriesColor(6)).toBe('var(--ds-res-1)');
  });
});
