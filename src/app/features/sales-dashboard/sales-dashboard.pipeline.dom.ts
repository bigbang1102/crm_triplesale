/**
 * Writes the "Pipeline & ยอดขาย" figures (`sales-dashboard.pipeline.logic.ts`) into the generated markup. Every element it adds is a CLONE of one
 * the snapshot already has (the generated CSS selects on `data-c-*` attributes a new element would not carry); each widget is found by its heading.
 */
import { stepperColor } from '@shared/constants/palettes';
import { colour, repeat, setText } from './sales-dashboard.lead.dom';
import type { DealRow, FunnelRow, GroupBar, MonthBar, PipeCard, WaitingList } from './sales-dashboard.pipeline.logic';

const EXPECTED_LABEL_SPACE = 30;
const pct = (n: number): string => `${Number(n.toFixed(4))}%`;
const dayText = (days: number): string => `${days} วัน`;

/** the card of the widget whose heading is `title` */
function widget(root: ParentNode, title: string): Element | undefined {
  const heading = [...root.querySelectorAll('ts-db-card h3')].find((h) => h.textContent?.trim() === title);
  return heading?.closest('ts-db-card') ?? undefined;
}

export function applyPipelineCards(root: ParentNode, cards: readonly PipeCard[]): void {
  for (const card of cards) {
    const label = [...root.querySelectorAll('ts-db-trend-card .l')].find((el) => el.textContent?.trim() === card.label);
    const button = label?.closest('.c');
    if (!button) continue;
    button.setAttribute('aria-label', `${card.label} ${card.value}`);
    setText(button.querySelector('.v'), card.value);
    const delta = button.querySelector('.dl');
    setText(delta, ` ${card.delta} `);
    delta?.classList.toggle('good', card.good);
    delta?.classList.toggle('bad', !card.good);
  }
}

/** the rows of a horizontal bar list: label, bar width, value */
function applyBarRows(list: Element | null | undefined, rows: readonly (GroupBar | FunnelRow)[]): void {
  const holder = list?.querySelector('.hbar');
  if (!holder) return;
  repeat(holder, '.hb-row', rows.length).forEach((row, i) => {
    const data = rows[i];
    row.setAttribute('aria-label', `${data.label} ${data.value}`);
    row.style.setProperty('--c', colour(i));
    const label = row.querySelector<HTMLElement>('.hb-l');
    setText(label, `${data.label} `);
    if (label) label.title = data.label;
    const fill = row.querySelector<HTMLElement>('.hb-f');
    if (fill) fill.style.width = pct(data.share);
    setText(row.querySelector('.hb-v'), data.value);
  });
}

export function applyGroupBars(root: ParentNode, rows: readonly GroupBar[]): void {
  applyBarRows(widget(root, 'ดีลที่เปิดอยู่ตามกลุ่มขั้นตอน'), rows);
}

export function applyFunnel(root: ParentNode, rows: readonly FunnelRow[]): void {
  applyBarRows(widget(root, 'อัตราผ่านแต่ละกลุ่มขั้นตอน'), rows);
}

const groupColour = (idx: number, total: number): string => stepperColor(total, idx);

export function applyTopDeals(root: ParentNode, rows: readonly DealRow[], groupCount: number): void {
  const body = widget(root, 'ดีลใหญ่ 5 อันดับ')?.querySelector('tbody');
  if (!body) return;
  repeat(body, 'tr', rows.length).forEach((tr, i) => {
    const row = rows[i];
    const rank = tr.querySelector('.rk');
    setText(rank, String(i + 1));
    if (rank) rank.className = `rk r${i + 1}`;
    setText(tr.querySelector('.nmw'), row.customer);
    const group = tr.querySelector<HTMLElement>('.grp');
    setText(group, row.groupCode);
    group?.style.setProperty('--gc', groupColour(row.groupIdx, groupCount));
    const amount = tr.querySelector<HTMLElement>('.amt');
    setText(amount, `฿${row.amount.toLocaleString('en-US')}`);
    amount?.style.setProperty('--w', String(Math.round(row.share)));
    setText(tr.querySelector('.pill'), dayText(row.days));
  });
}

/** the table of a list widget ("ดีลค้างนานเกินกำหนด" / "ดีลที่ขาดการติดตาม"): its summary line and one row per deal */
export function applyWaitingList(root: ParentNode, title: string, list: WaitingList, groupCount: number): void {
  const card = widget(root, title);
  const hint = card?.querySelector('p.hint');
  setText(hint, ` ${list.count} ดีล · มูลค่ารวม ${list.total} `);
  const body = card?.querySelector('tbody');
  if (!body) return;
  repeat(body, 'tr', list.rows.length).forEach((tr, i) => {
    const row = list.rows[i];
    setText(tr.querySelector('td .nm'), row.customer);
    const group = tr.querySelector<HTMLElement>('.grp');
    setText(group, row.groupCode);
    group?.style.setProperty('--gc', groupColour(row.groupIdx, groupCount));
    const owner = tr.querySelectorAll('td')[1];
    setText(owner, row.owner);
    setText(tr.querySelector('.pill'), dayText(row.days));
  });
}

export function applyExpectedClose(root: ParentNode, months: readonly MonthBar[]): void {
  const chart = widget(root, 'ดีลคาดปิดตามเดือน')?.querySelector('ts-db-bar-chart');
  const plot = chart?.querySelector('.vb-plot');
  const axis = chart?.querySelector('.vb-x');
  if (!plot || !axis) return;
  repeat(plot, '.vb-col', months.length).forEach((col, i) => {
    const m = months[i];
    col.setAttribute('aria-label', `${m.label} ${m.value}`);
    col.style.setProperty('--c', colour(i));
    col.classList.toggle('hi', i === 0);
    setText(col.querySelector('.vb-v'), m.value);
    const bar = col.querySelector<HTMLElement>('.vb-b');
    if (bar) bar.style.height = `max(3px, ${pct(m.share)} - ${Number(((EXPECTED_LABEL_SPACE * m.share) / 100).toFixed(4))}px)`;
  });
  repeat(axis, 'span', months.length).forEach((span, i) => {
    span.textContent = months[i].label;
    span.style.setProperty('--c', colour(i));
    span.classList.toggle('hi', i === 0);
  });
}
