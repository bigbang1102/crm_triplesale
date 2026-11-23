/** Pure geometry of the small SVG charts (bars, line / area, donut) — framework-free so it is tested in Node. */

export interface Point {
  x: number;
  y: number;
}

/** 1 / 2 / 5 × 10ⁿ ceiling of the biggest value, so the axis ends on a round number */
export function niceMax(value: number): number {
  if (!(value > 0)) return 1;
  const exp = Math.floor(Math.log10(value));
  const base = 10 ** exp;
  const fraction = value / base;
  const step = fraction <= 1 ? 1 : fraction <= 2 ? 2 : fraction <= 5 ? 5 : 10;
  return step * base;
}

/** the y-axis ticks: 0 … max in `count` steps */
export function axisTicks(max: number, count = 4): number[] {
  return Array.from({ length: count + 1 }, (_, i) => (max / count) * i);
}

/** values → points inside a `width × height` plot (x evenly spread, y inverted) */
export function linePoints(
  values: readonly number[],
  width: number,
  height: number,
  max: number,
): Point[] {
  const last = Math.max(values.length - 1, 1);
  return values.map((v, i) => ({
    x: (i / last) * width,
    y: height - (max > 0 ? (v / max) * height : 0),
  }));
}

export function linePath(points: readonly Point[]): string {
  return points.map((p, i) => `${i === 0 ? 'M' : 'L'}${round(p.x)},${round(p.y)}`).join(' ');
}

/** the area under the line, closed down to the baseline */
export function areaPath(points: readonly Point[], height: number): string {
  if (points.length === 0) return '';
  const first = points[0];
  const last = points[points.length - 1];
  return `${linePath(points)} L${round(last.x)},${height} L${round(first.x)},${height} Z`;
}

export interface DonutArc {
  /** index of the value in the input */
  index: number;
  /** SVG path of the ring segment */
  path: string;
  share: number;
}

const FULL_TURN = Math.PI * 2;
/** a segment of exactly 360° has no defined arc: stop a hair before */
const MAX_SWEEP = FULL_TURN - 0.0001;

/** ring segments (centre 0,0) for `values`; zero / negative values get no segment */
export function donutArcs(values: readonly number[], outer: number, inner: number): DonutArc[] {
  const total = values.reduce((sum, v) => sum + Math.max(v, 0), 0);
  if (total <= 0) return [];
  let start = -Math.PI / 2;
  const arcs: DonutArc[] = [];
  values.forEach((value, index) => {
    if (value <= 0) return;
    const share = value / total;
    const sweep = Math.min(share * FULL_TURN, MAX_SWEEP);
    arcs.push({ index, share, path: ringPath(start, start + sweep, outer, inner) });
    start += share * FULL_TURN;
  });
  return arcs;
}

function ringPath(from: number, to: number, outer: number, inner: number): string {
  const large = to - from > Math.PI ? 1 : 0;
  const at = (angle: number, radius: number) =>
    `${round(Math.cos(angle) * radius)},${round(Math.sin(angle) * radius)}`;
  return [
    `M${at(from, outer)}`,
    `A${outer},${outer} 0 ${large} 1 ${at(to, outer)}`,
    `L${at(to, inner)}`,
    `A${inner},${inner} 0 ${large} 0 ${at(from, inner)}`,
    'Z',
  ].join(' ');
}

function round(n: number): number {
  return Math.round(n * 100) / 100;
}

const SERIES_COUNT = 6;

/** series colour: the six "Resource colour" tokens of the design system (`--ds-res-1…6`), repeated */
export function seriesColor(index: number): string {
  return `var(--ds-res-${(Math.abs(index) % SERIES_COUNT) + 1})`;
}
