import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import { ForecastSelect, ForecastTip } from './forecast-controls';
import { CATEGORY_CHIP, CATEGORY_LABEL, monthLong } from './forecast.format';
import { ForecastStore } from './forecast.store';

/** แท็บ Configuration — กติกากลางของ Forecast ต่อบริษัทต่อปี (ต้นแบบ : `pCfgForm()`) */
@Component({
  selector: 'ts-forecast-config-form',
  imports: [ForecastTip, ForecastSelect],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './forecast-config-form.html',
})
export class ForecastConfigForm {
  protected readonly store = inject(ForecastStore);
  protected readonly t = this.store.t;
  protected readonly CATEGORY_LABEL = CATEGORY_LABEL;
  protected readonly CATEGORY_CHIP = CATEGORY_CHIP;

  /** แก้ได้ : System Configurator และ Config ไม่ถูก Block */
  protected readonly ed = computed(() => this.store.perms().canConfig && this.store.cfgEdit()?.status !== 'block');

  /** ปีงบประมาณจากข้อมูลอ้างอิง (+ ปีของ Config นี้เสมอ) */
  protected readonly years = computed(() => {
    const ys = new Set((this.store.lookups()?.fiscalYears ?? []).map((f) => f.year));
    const y = this.store.cfgEdit()?.year;
    if (y) ys.add(y);
    return [...ys].sort((a, b) => a - b);
  });

  /** "THB · มกราคม (ข้อมูลบริษัท)" */
  protected readonly company = computed(() => {
    const c = this.store.lookups()?.company;
    return c ? this.t('app.forecast.cfg.currencyValue', c.currency, monthLong(c.fiscalYearStart, this.store.lang())) : '';
  });
}
