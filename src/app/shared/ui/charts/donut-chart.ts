import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import { donutArcs, seriesColor } from './chart-geometry';

export interface DonutItem {
  label: string;
  value: number;
  /** the value as shown in the legend (already formatted) */
  valueText: string;
}

const OUTER = 56;
const INNER = 36;

/** Donut with a legend (label, value, share). The legend is the text equivalent of the ring. */
@Component({
  selector: 'ts-donut-chart',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="tsdc">
      <svg class="tsdc-ring" viewBox="-60 -60 120 120" role="img" [attr.aria-label]="ariaLabel()">
        <circle r="46" fill="none" stroke="var(--ts-surface-2)" stroke-width="20" />
        @for (arc of arcs(); track arc.index) {
          <path [attr.d]="arc.path" [attr.fill]="arc.color" />
        }
        <text class="tsdc-center" text-anchor="middle" y="4">{{ centerText() }}</text>
      </svg>
      <ul class="tsdc-legend">
        @for (row of legend(); track row.label) {
          <li>
            <i [style.background]="row.color"></i>
            <span class="tsdc-name" [title]="row.label">{{ row.label }}</span>
            <span class="tsdc-val">{{ row.valueText }}</span>
            <span class="tsdc-pct">{{ row.percent }}</span>
          </li>
        }
      </ul>
    </div>
  `,
  styles: `
    :host {
      display: block;
    }
    .tsdc {
      display: flex;
      align-items: center;
      gap: 16px;
      flex-wrap: wrap;
    }
    .tsdc-ring {
      width: 150px;
      height: 150px;
      flex: none;
    }
    .tsdc-center {
      fill: var(--ts-text-header);
      font-size: 11px;
      font-weight: 700;
      font-family: var(--ts-font);
    }
    .tsdc-legend {
      list-style: none;
      margin: 0;
      padding: 0;
      flex: 1;
      min-width: 180px;
      display: grid;
      gap: 6px;
      font-size: var(--ts-fs-small);
    }
    .tsdc-legend li {
      display: grid;
      grid-template-columns: 10px 1fr auto 46px;
      align-items: center;
      gap: 8px;
    }
    .tsdc-legend i {
      width: 10px;
      height: 10px;
      border-radius: 2px;
    }
    .tsdc-name {
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
      color: var(--ts-text);
    }
    .tsdc-val {
      font-weight: 600;
      color: var(--ts-text-header);
      font-variant-numeric: tabular-nums;
    }
    .tsdc-pct {
      text-align: right;
      color: var(--ts-text-muted);
      font-variant-numeric: tabular-nums;
    }
  `,
})
export class DonutChart {
  readonly items = input.required<readonly DonutItem[]>();
  readonly ariaLabel = input.required<string>();
  readonly centerText = input('');

  protected readonly arcs = computed(() =>
    donutArcs(
      this.items().map((i) => i.value),
      OUTER,
      INNER,
    ).map((arc) => ({ ...arc, color: seriesColor(arc.index) })),
  );

  protected readonly legend = computed(() => {
    const items = this.items();
    const total = items.reduce((sum, i) => sum + Math.max(i.value, 0), 0);
    return items.map((item, index) => ({
      label: item.label,
      valueText: item.valueText,
      color: seriesColor(index),
      percent: `${total > 0 ? Math.round((item.value / total) * 1000) / 10 : 0}%`,
    }));
  });
}
