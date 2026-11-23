import { ChangeDetectionStrategy, Component, computed, inject, input } from '@angular/core';
import { ForecastTip } from './forecast-controls';
import { B } from './forecast.format';
import { ForecastStore } from './forecast.store';

/** การ์ด "ฉากทัศน์ยอดขาย" — ขั้นต่ำ (Commit) · คาดการณ์ (Final) · สูงสุด (Best Case) เทียบ Target (ต้นแบบ : `scenBox()`) */
@Component({
  selector: 'ts-forecast-scenario',
  imports: [ForecastTip],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="card">
      <div class="card-h">
        <h3>{{ t('app.forecast.scen.title') }}<ts-forecast-tip k="sc_box" /></h3>
        <span class="sub">{{ t('app.forecast.scen.vsTarget', B(target())) }}</span>
      </div>
      <div class="card-b">
        <div class="kpis k3">
          @for (c of cards(); track c.tip) {
            <div class="kpi" [style.--c]="c.color">
              <div class="l">{{ c.label }}<ts-forecast-tip [k]="c.tip" /></div>
              <div class="v">{{ B(c.value) }}</div>
              <div class="s sub">{{ c.pct }}</div>
              <div class="bar mt6"><i [style.width.%]="c.width" [style.background]="c.color"></i></div>
            </div>
          }
        </div>
      </div>
    </div>
  `,
})
export class ForecastScenario {
  readonly min = input.required<number>();
  readonly final = input.required<number>();
  readonly max = input.required<number>();
  readonly target = input.required<number>();

  protected readonly t = inject(ForecastStore).t;
  protected readonly B = B;

  protected readonly cards = computed(() => {
    const target = this.target();
    const card = (label: string, tip: string, value: number, color: string) => ({
      label,
      tip,
      value,
      color,
      pct: target ? this.t('app.forecast.scen.ofTarget', ((value / target) * 100).toFixed(0)) : '—',
      width: Math.min(100, target ? (value / target) * 100 : 0),
    });
    return [
      card(this.t('app.forecast.scen.min'), 'sc_min', this.min(), 'var(--fc-cat-closed)'),
      card(this.t('app.forecast.scen.final'), 'sc_final', this.final(), 'var(--fc-cat-committed)'),
      card(this.t('app.forecast.scen.max'), 'sc_max', this.max(), 'var(--fc-cat-bestcase)'),
    ];
  });
}
