import { NgTemplateOutlet } from '@angular/common';
import { ChangeDetectionStrategy, Component, computed, input, output } from '@angular/core';
import { seriesColor } from './chart-geometry';

export interface BarItem {
  key: string;
  label: string;
  value: number;
  /** text shown at the end of the bar (already formatted) */
  valueText: string;
  /** small second line under the label */
  hint?: string;
}

/**
 * Horizontal bars, one per item, as real buttons (keyboard + screen reader friendly). With `clickable` a bar emits `pick(key)`.
 * The bars always sit next to a table with the same numbers, so the chart itself only carries the `aria-label`.
 */
@Component({
  selector: 'ts-bar-chart',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <ul class="tsbc" role="list" [attr.aria-label]="ariaLabel()">
      @for (bar of bars(); track bar.item.key) {
        <li>
          @if (clickable()) {
            <button
              type="button"
              class="tsbc-row"
              [class.is-active]="bar.item.key === activeKey()"
              (click)="pick.emit(bar.item.key)"
            >
              <ng-container *ngTemplateOutlet="row; context: { $implicit: bar }" />
            </button>
          } @else {
            <div class="tsbc-row">
              <ng-container *ngTemplateOutlet="row; context: { $implicit: bar }" />
            </div>
          }
        </li>
      }
    </ul>
    <ng-template #row let-bar>
      <span class="tsbc-label" [title]="bar.item.label">
        {{ bar.item.label }}
        @if (bar.item.hint) {
          <small>{{ bar.item.hint }}</small>
        }
      </span>
      <span class="tsbc-track"
        ><span class="tsbc-fill" [style.width.%]="bar.width" [style.background]="bar.color"></span
      ></span>
      <span class="tsbc-value">{{ bar.item.valueText }}</span>
    </ng-template>
  `,
  styles: `
    :host {
      display: block;
    }
    .tsbc {
      list-style: none;
      margin: 0;
      padding: 0;
      display: grid;
      gap: 4px;
    }
    .tsbc-row {
      display: grid;
      grid-template-columns: minmax(90px, 30%) 1fr auto;
      align-items: center;
      gap: 10px;
      width: 100%;
      padding: 5px 8px;
      border: 0;
      border-radius: var(--ts-radius-sm);
      background: transparent;
      color: var(--ts-text);
      font: inherit;
      font-size: var(--ts-fs-small);
      text-align: left;
    }
    button.tsbc-row {
      cursor: pointer;
    }
    button.tsbc-row:hover,
    .tsbc-row.is-active {
      background: var(--ts-surface-hover);
    }
    button.tsbc-row:focus-visible {
      outline: 2px solid var(--ts-primary-fg);
      outline-offset: 1px;
    }
    .tsbc-label {
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }
    .tsbc-label small {
      display: block;
      color: var(--ts-text-muted);
      font-size: var(--ts-fs-mini);
    }
    .tsbc-track {
      height: 12px;
      border-radius: var(--ts-radius-pill);
      background: var(--ts-surface-2);
      overflow: hidden;
    }
    .tsbc-fill {
      display: block;
      height: 100%;
      min-width: 2px;
      border-radius: var(--ts-radius-pill);
    }
    .tsbc-value {
      min-width: 52px;
      text-align: right;
      font-variant-numeric: tabular-nums;
      color: var(--ts-text-header);
      font-weight: 600;
    }
  `,
  imports: [NgTemplateOutlet],
})
export class BarChart {
  readonly items = input.required<readonly BarItem[]>();
  readonly ariaLabel = input.required<string>();
  readonly clickable = input(false);
  readonly activeKey = input<string | null>(null);
  /** one colour for all bars (a token / `var(--…)`); default = a colour per bar from the series palette */
  readonly color = input<string | null>(null);
  readonly pick = output<string>();

  protected readonly bars = computed(() => {
    const items = this.items();
    const max = items.reduce((m, i) => Math.max(m, i.value), 0);
    return items.map((item, index) => ({
      item,
      width: max > 0 ? (item.value / max) * 100 : 0,
      color: this.color() ?? seriesColor(index),
    }));
  });
}
