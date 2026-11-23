/**
 * Writes the "Lead & การตลาด" figures (`sales-dashboard.lead.logic.ts`) into the generated markup. Every element it adds is a CLONE of one the
 * snapshot already has — the generated CSS selects on `data-c-*` / `data-h-*` attributes, which a new element would not carry.
 */
import type { DailyLine, LeadCard, SourceRow } from './sales-dashboard.lead.logic';

const THAI_MONTHS_ABBREVIATED = ['ม.ค.', 'ก.พ.', 'มี.ค.', 'เม.ย.', 'พ.ค.', 'มิ.ย.', 'ก.ค.', 'ส.ค.', 'ก.ย.', 'ต.ค.', 'พ.ย.', 'ธ.ค.'];
/** the colours of the snapshot's series, in its order (`--db-r2` first) */
const SERIES_COLOURS = [2, 3, 4, 5, 6, 1];
const RING_CIRCUMFERENCE = 2 * Math.PI * 62;
const RING_GAP = 3;
const LINE_LEFT = 30;
const LINE_RIGHT = 490;
const LINE_BASE = 160;
const LINE_TOP = 36;
const VIEW_WIDTH = 520;
const VIEW_HEIGHT = 176;
const LABEL_EVERY = 4;
const BAR_LABEL_SPACE = 46;

export const colour = (i: number): string => `var(--db-r${SERIES_COLOURS[i % SERIES_COLOURS.length]})`;
const pct = (n: number): string => `${Number(n.toFixed(4))}%`;

/** makes `parent` hold exactly `count` elements of `selector`, cloning the first one; returns them */
export function repeat(parent: Element, selector: string, count: number): HTMLElement[] {
  const found = [...parent.querySelectorAll<HTMLElement>(`:scope > ${selector}`)];
  const template = found[0];
  if (!template) return [];
  for (const extra of found.slice(count)) extra.remove();
  let last = found[Math.min(found.length, count) - 1] ?? template;
  while (found.length < count) {
    const copy = template.cloneNode(true) as HTMLElement;
    last.after(copy);
    last = copy;
    found.push(copy);
  }
  return found.slice(0, count);
}

export function setText(el: Element | null | undefined, text: string): void {
  if (el) el.textContent = text;
}

/** replaces the text that follows the icon of a `.sd` chip */
function setChipText(chip: Element | undefined, text: string): void {
  const last = chip?.lastChild;
  if (last?.nodeType === Node.TEXT_NODE) last.textContent = text;
}

export function applyLeadCards(root: ParentNode, cards: readonly LeadCard[]): void {
  for (const card of cards) {
    const heading = [...root.querySelectorAll('ts-db-lead-card .hd b')].find((b) => b.textContent?.trim() === card.label);
    const button = heading?.closest('.c');
    if (!button) continue;
    button.setAttribute('aria-label', `${card.label} ${card.value}`);
    setText(button.querySelector('.v'), card.value);
    const chip = button.querySelector('.dl');
    setText(chip, card.delta);
    chip?.classList.toggle('good', card.good);
    chip?.classList.toggle('bad', !card.good);
    setText(button.querySelector('.note'), card.note);
    const [first, second] = [...button.querySelectorAll('.side .sd')];
    setChipText(first, card.side[0]);
    setChipText(second, card.side[1]);
  }
}

export function applySources(root: ParentNode, sources: readonly SourceRow[]): void {
  const plot = root.querySelector('ts-db-pair-bars .plot');
  const axis = root.querySelector('ts-db-pair-bars .xs');
  if (!plot || !axis) return;
  const callTemplate = plot.querySelector('.call')?.cloneNode(true);
  for (const old of plot.querySelectorAll('.call')) old.remove();
  const max = Math.max(...sources.map((s) => s.leads), 1);
  const rates = sources.map((s) => (s.leads > 0 ? s.sold / s.leads : 0));
  const bestRate = Math.max(...rates, 0);
  const best = bestRate > 0 ? rates.indexOf(bestRate) : -1;
  repeat(plot, '.col', sources.length).forEach((col, i) => {
    const row = sources[i];
    const share = (row.leads / max) * 100;
    col.setAttribute('aria-label', `${row.name} ${row.leads} · ${row.sold}`);
    col.style.setProperty('--c', colour(i));
    col.classList.toggle('best', i === best);
    const value = col.querySelector('.v');
    if (value) {
      const sold = value.querySelector('b');
      if (value.firstChild?.nodeType === Node.TEXT_NODE) value.firstChild.textContent = `${row.leads} · `;
      setText(sold, String(row.sold));
    }
    const bar = col.querySelector<HTMLElement>('.b');
    if (bar) bar.style.height = `max(3px, ${pct(share)} - ${Number(((BAR_LABEL_SPACE * share) / 100).toFixed(4))}px)`;
    const inner = col.querySelector<HTMLElement>('.in');
    if (inner) inner.style.height = pct(rates[i] * 100);
    if (i === best && callTemplate instanceof HTMLElement) {
      const call = callTemplate.cloneNode(true) as HTMLElement;
      call.textContent = `ปิดได้สูงสุด ${Number((bestRate * 100).toFixed(1))}%`;
      col.prepend(call);
    }
  });
  repeat(axis, 'span', sources.length).forEach((span, i) => {
    span.textContent = sources[i].name;
    span.title = sources[i].name;
  });
}

export function applyDonut(root: ParentNode, sources: readonly SourceRow[]): void {
  const donut = root.querySelector('ts-db-donut');
  if (!donut) return;
  const total = sources.reduce((s, r) => s + r.leads, 0);
  setText(donut.querySelector('.mid b'), String(total));
  const ring = donut.querySelector('.ring svg');
  if (ring) {
    let offset = 0;
    repeat(ring, '.seg', sources.length).forEach((seg, i) => {
      const length = total > 0 ? (sources[i].leads / total) * RING_CIRCUMFERENCE : 0;
      const dash = Math.max(length - RING_GAP, 0);
      seg.setAttribute('stroke-dasharray', `${dash} ${RING_CIRCUMFERENCE - dash}`);
      seg.setAttribute('stroke-dashoffset', String(-offset));
      seg.style.stroke = colour(i);
      offset += length;
    });
  }
  const legend = donut.querySelector('.lg');
  if (!legend) return;
  repeat(legend, '.lg-r', sources.length).forEach((row, i) => {
    const share = total > 0 ? Math.round((sources[i].leads / total) * 100) : 0;
    row.setAttribute('aria-label', `${sources[i].name} ${sources[i].leads} ${share}%`);
    row.querySelector<HTMLElement>('i')?.style.setProperty('background', colour(i));
    const label = row.querySelector<HTMLElement>('.lg-l');
    setText(label, sources[i].name);
    if (label) label.title = sources[i].name;
    setText(row.querySelector('.lg-v'), String(sources[i].leads));
    const percent = row.querySelector<HTMLElement>('.lg-p');
    setText(percent, `${share}%`);
    percent?.style.setProperty('--c', colour(i));
  });
}

/** `M x,y C … ` through the points, flat at each point like the snapshot's curve */
function curve(points: readonly (readonly [number, number])[]): string {
  return points
    .map(([x, y], i) => {
      if (i === 0) return `M${x},${y}`;
      const [px, py] = points[i - 1];
      const dx = (x - px) / 3;
      return `C${Number((px + dx).toFixed(1))},${py} ${Number((x - dx).toFixed(1))},${y} ${x},${y}`;
    })
    .join(' ');
}

export function applyDailyLine(root: ParentNode, daily: DailyLine, monthLabel: number): void {
  const chart = root.querySelector('ts-db-multi-line .lc');
  const plot = chart?.querySelector('.plot');
  const svg = plot?.querySelector('svg');
  if (!chart || !plot || !svg) return;
  const max = Math.max(...daily.now, ...daily.before, 1);
  const step = daily.days > 1 ? (LINE_RIGHT - LINE_LEFT) / (daily.days - 1) : 0;
  const xOf = (i: number): number => Number((LINE_LEFT + i * step).toFixed(1));
  const yOf = (v: number): number => Number((LINE_BASE - (v / max) * (LINE_BASE - LINE_TOP)).toFixed(1));
  const line = (series: number[]): string => curve(series.map((v, i) => [xOf(i), yOf(v)] as const));
  const paths = [...svg.querySelectorAll('path')];
  const lastX = xOf(daily.days - 1);
  paths[0]?.setAttribute('d', `${line(daily.now)} L${lastX},${LINE_BASE} L${LINE_LEFT},${LINE_BASE} Z`);
  paths[1]?.setAttribute('d', line(daily.now));
  paths[2]?.setAttribute('d', line(daily.before));
  const lastNow = daily.now[daily.days - 1] ?? 0;
  const lastBefore = daily.before[daily.days - 1] ?? 0;
  for (const marker of plot.querySelectorAll<HTMLElement>('.dot, .tag')) {
    marker.style.left = pct((lastX / VIEW_WIDTH) * 100);
    marker.style.top = pct((yOf(lastNow) / VIEW_HEIGHT) * 100);
  }
  setText(plot.querySelector('.tag'), String(lastNow));
  const width = (step / VIEW_WIDTH) * 100;
  repeat(plot, '.hit', daily.days).forEach((hit, i) => {
    const label = `${i + 1} ${THAI_MONTHS_ABBREVIATED[monthLabel]} · ${daily.now[i]}`;
    hit.title = label;
    hit.setAttribute('aria-label', label);
    hit.style.left = pct((xOf(i) / VIEW_WIDTH) * 100 - width / 2);
    hit.style.width = pct(width);
  });
  const labelled = Array.from({ length: daily.days }, (_, i) => i).filter((i) => i % LABEL_EVERY === 0 || i === daily.days - 1);
  const axis = chart.querySelector('.xs');
  if (axis) {
    repeat(axis, 'span', labelled.length).forEach((span, k) => {
      span.textContent = String(labelled[k] + 1);
      span.style.left = pct((xOf(labelled[k]) / VIEW_WIDTH) * 100);
    });
  }
  const [nowBox, beforeBox] = [...chart.querySelectorAll('.legend b')];
  setText(nowBox, String(lastNow));
  setText(beforeBox, String(lastBefore));
}
