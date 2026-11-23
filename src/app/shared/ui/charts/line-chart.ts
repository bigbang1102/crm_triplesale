import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import { areaPath, axisTicks, linePath, linePoints, niceMax, seriesColor } from './chart-geometry';

export interface LineSeries {
  name: string;
  values: readonly number[];
}

const WIDTH = 640;
const HEIGHT = 190;
const PAD = { left: 46, right: 10, top: 10, bottom: 22 };
const MAX_X_LABELS = 8;

/**
 * Line / area chart over a shared x axis (`labels`). The first series is drawn as an area. Pure inline SVG, colours from the
 * design-system series tokens; the numbers are also in the table next to it (`ariaLabel` describes the chart for screen readers).
 */
@Component({
  selector: 'ts-line-chart',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <svg
      class="tslc"
      [attr.viewBox]="'0 0 ' + width + ' ' + height"
      role="img"
      [attr.aria-label]="ariaLabel()"
      preserveAspectRatio="xMidYMid meet"
    >
      <g [attr.transform]="'translate(' + pad.left + ',' + pad.top + ')'">
        @for (tick of plot().ticks; track tick.y) {
          <line
            class="tslc-grid"
            x1="0"
            [attr.x2]="plot().w"
            [attr.y1]="tick.y"
            [attr.y2]="tick.y"
          />
          <text class="tslc-axis" x="-6" [attr.y]="tick.y + 3" text-anchor="end">
            {{ tick.text }}
          </text>
        }
        @for (label of plot().xLabels; track label.x) {
          <text class="tslc-axis" [attr.x]="label.x" [attr.y]="plot().h + 15" text-anchor="middle">
            {{ label.text }}
          </text>
        }
        @for (line of plot().lines; track line.name) {
          @if (line.area) {
            <path [attr.d]="line.area" [attr.fill]="line.color" fill-opacity="0.14" />
          }
          <path
            [attr.d]="line.path"
            fill="none"
            [attr.stroke]="line.color"
            stroke-width="2"
            stroke-linejoin="round"
          />
        }
      </g>
    </svg>
    @if (series().length > 1) {
      <ul class="tslc-legend">
        @for (line of plot().lines; track line.name) {
          <li><i [style.background]="line.color"></i>{{ line.name }}</li>
        }
      </ul>
    }
  `,
  styles: `
    :host {
      display: block;
    }
    .tslc {
      width: 100%;
      height: auto;
      display: block;
    }
    .tslc-grid {
      stroke: var(--ts-line);
      stroke-width: 1;
    }
    .tslc-axis {
      fill: var(--ts-text-muted);
      font-size: 10px;
      font-family: var(--ts-font);
    }
    .tslc-legend {
      list-style: none;
      display: flex;
      flex-wrap: wrap;
      gap: 14px;
      margin: 4px 0 0;
      padding: 0;
      font-size: var(--ts-fs-small);
      color: var(--ts-text-secondary);
    }
    .tslc-legend i {
      display: inline-block;
      width: 10px;
      height: 10px;
      margin-right: 6px;
      border-radius: 2px;
    }
  `,
})
export class LineChart {
  readonly labels = input.required<readonly string[]>();
  readonly series = input.required<readonly LineSeries[]>();
  readonly ariaLabel = input.required<string>();
  /** formats a y-axis tick */
  readonly format = input<(value: number) => string>((value) => String(Math.round(value)));

  protected readonly width = WIDTH;
  protected readonly height = HEIGHT;
  protected readonly pad = PAD;

  protected readonly plot = computed(() => {
    const w = WIDTH - PAD.left - PAD.right;
    const h = HEIGHT - PAD.top - PAD.bottom;
    const all = this.series();
    const max = niceMax(all.reduce((m, s) => Math.max(m, ...s.values), 0));
    const format = this.format();
    const ticks = axisTicks(max).map((value) => ({
      y: h - (value / max) * h,
      text: format(value),
    }));
    const lines = all.map((s, index) => {
      const points = linePoints(s.values, w, h, max);
      return {
        name: s.name,
        color: seriesColor(index),
        path: linePath(points),
        area: index === 0 ? areaPath(points, h) : '',
      };
    });
    const labels = this.labels();
    const step = Math.max(1, Math.ceil(labels.length / MAX_X_LABELS));
    const last = Math.max(labels.length - 1, 1);
    const xLabels = labels.flatMap((text, i) =>
      i % step === 0 ? [{ x: (i / last) * w, text }] : [],
    );
    return { w, h, ticks, lines, xLabels };
  });
}
