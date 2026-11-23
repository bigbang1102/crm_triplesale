import { NgTemplateOutlet } from '@angular/common';
import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import { ForecastTip } from './forecast-controls';
import { ForecastFilter, ForecastFilters } from './forecast-filters';
import { ForecastScenario } from './forecast-scenario';
import { B, CATEGORIES, CATEGORY_CHIP, CATEGORY_COLOR, CATEGORY_LABEL, dcls, sgn } from './forecast.format';
import { ForecastStore } from './forecast.store';
import { CategoryAmounts, ForecastCategory, OpportunityItem } from './forecast.types';

/**
 * Forecast Overview — สรุป Forecast ที่บันทึกแล้วของงวด แยกตามทีม พนักงาน และหมวด ; คลิกแถวเพื่อดู Opportunity ที่ประกอบเป็นยอด
 * (ต้นแบบ : `pOverview()`).
 */
@Component({
  selector: 'ts-forecast-overview',
  imports: [NgTemplateOutlet, ForecastTip, ForecastFilters, ForecastScenario],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './forecast-overview.html',
})
export class ForecastOverview {
  protected readonly store = inject(ForecastStore);
  protected readonly t = this.store.t;
  protected readonly B = B;
  protected readonly sgn = sgn;
  protected readonly dcls = dcls;
  protected readonly min = Math.min;
  protected readonly CATEGORIES = CATEGORIES;
  protected readonly CATEGORY_LABEL = CATEGORY_LABEL;
  protected readonly CATEGORY_COLOR = CATEGORY_COLOR;
  protected readonly CATEGORY_CHIP = CATEGORY_CHIP;
  /** คอลัมน์หมวดของตารางทีม / พนักงาน */
  protected readonly SHOWN: readonly ForecastCategory[] = ['closed', 'committed', 'bestcase', 'pipeline'];
  protected readonly filters: readonly ForecastFilter[] = ['month', 'pipe', 'team'];

  /** ยอดตามหมวดของขอบเขตที่กรอง (หลัง Judgment) */
  protected readonly cats = computed<CategoryAmounts>(() => {
    const out: CategoryAmounts = { committed: 0, bestcase: 0, pipeline: 0, closed: 0, omitted: 0 };
    for (const c of this.store.ovSummary()?.categories ?? []) out[c.category] = c.after;
    return out;
  });

  /** ชื่อของแถวที่คลิก (หัวตาราง Opportunity) */
  protected readonly pickName = computed(() => {
    const pick = this.store.ovPick();
    if (pick?.startsWith('t:')) return this.store.teamName(pick.slice(2));
    if (pick?.startsWith('e:')) return this.store.empOf(pick.slice(2))?.name ?? pick.slice(2);
    return this.t('app.forecast.ov.all');
  });

  /** หมวด / มูลค่า / % ที่ใช้คำนวณของดีล (`eff(d,'saved')` ของต้นแบบ) */
  protected eff(d: OpportunityItem): { cat: ForecastCategory; amount: number; prob: number } {
    if (d.status === 'won') return { cat: 'closed', amount: d.original.amount, prob: 100 };
    if (d.status === 'lost') return { cat: 'omitted', amount: d.original.amount, prob: 0 };
    const j = d.judgment;
    if (!j) return { cat: d.original.category, amount: d.original.amount, prob: d.original.probability };
    return { cat: j.in ? j.category : 'omitted', amount: j.amount, prob: j.probability };
  }
}
