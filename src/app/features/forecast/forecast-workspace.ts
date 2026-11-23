import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import { ForecastAdjust } from './forecast-adjust';
import { ForecastClose } from './forecast-close';
import { ForecastConfigForm } from './forecast-config-form';
import { ForecastSelect, ForecastTip } from './forecast-controls';
import { ForecastTarget } from './forecast-target';
import { ForecastStore, L2, L2_TABS, STATUS_CHIP, STATUS_LABEL } from './forecast.store';

/**
 * Sales Forecast Configuration — workspace ของ Configuration 1 รายการ : แถบสลับ Config + ปุ่มบันทึกเดียว + เมนูย่อย
 * Configuration · Sales Target · Adjustment · Close Forecast Period (ต้นแบบ : `wsHeader()`).
 */
@Component({
  selector: 'ts-forecast-workspace',
  imports: [ForecastTip, ForecastSelect, ForecastConfigForm, ForecastTarget, ForecastAdjust, ForecastClose],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './forecast-workspace.html',
})
export class ForecastWorkspace {
  protected readonly store = inject(ForecastStore);
  protected readonly t = this.store.t;
  protected readonly tabs = L2_TABS;
  protected readonly STATUS_LABEL = STATUS_LABEL;
  protected readonly STATUS_CHIP = STATUS_CHIP;

  protected readonly cfg = this.store.wsCfg;
  protected readonly isNew = computed(() => !this.store.cfgId());
  protected readonly list = computed(() => [...this.store.configs()].sort((a, b) => b.year - a.year));

  protected readonly canSave = computed(() => {
    const p = this.store.perms();
    const c = this.cfg();
    return (p.canConfig || p.canTarget || p.canAdjust) && !!c && c.status !== 'block';
  });

  /** สิ่งที่ยังไม่บันทึก แยกตามแท็บ */
  protected readonly parts = computed(() => {
    const p = this.store.pending();
    return [
      p.cfg ? (this.isNew() ? this.t('app.forecast.ws.partCfgNew') : this.t('app.forecast.ws.partCfg', p.cfg)) : '',
      p.tg ? this.t('app.forecast.ws.partTarget', p.tg) : '',
      p.adj ? this.t('app.forecast.ws.partAdj', p.adj) : '',
    ].filter(Boolean);
  });

  protected readonly saveLabel = computed(() => {
    const c = this.cfg();
    if (!c) return '';
    if (this.isNew() || c.status === 'draft') return this.t('app.forecast.ws.saveDraft');
    return this.store.pending().cfg ? this.t('app.forecast.ws.saveVersion', c.versionNo + 1) : this.t('app.forecast.ws.save');
  });

  /** จุดสีส้มบนแท็บที่มีการแก้ไขค้าง */
  protected dirty(tab: L2): boolean {
    const p = this.store.pending();
    return (tab === 'setup' && p.cfg > 0) || (tab === 'target' && p.tg > 0) || (tab === 'adjust' && p.adj > 0);
  }
}
