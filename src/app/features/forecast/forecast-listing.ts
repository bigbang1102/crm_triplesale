import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import { ForecastSelect, ForecastTip } from './forecast-controls';
import { dateTime } from './forecast.format';
import { ForecastStore, STATUS_CHIP, STATUS_LABEL } from './forecast.store';
import { ConfigAction, ForecastConfig } from './forecast.types';

/** Sales Forecast Listing — รายการ Configuration ทุกปีงบประมาณ (ต้นแบบ : `pCfgList()`) */
@Component({
  selector: 'ts-forecast-listing',
  imports: [ForecastTip, ForecastSelect],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './forecast-listing.html',
})
export class ForecastListing {
  protected readonly store = inject(ForecastStore);
  protected readonly t = this.store.t;
  protected readonly STATUS_LABEL = STATUS_LABEL;
  protected readonly STATUS_CHIP = STATUS_CHIP;
  protected readonly dateTime = dateTime;
  protected readonly curYear = computed(() => Number(this.store.cur().slice(0, 4)));

  /** ไอคอนของแถว : ตาม `actions[]` ที่ server คำนวณ ; server ไม่ส่งมา = คิดจากสถานะและสิทธิ์เหมือนต้นแบบ */
  protected can(c: ForecastConfig, action: ConfigAction): boolean {
    if (c.actions) return c.actions.includes(action);
    if (!this.store.perms().canConfig) return false;
    switch (action) {
      case 'release':
        return c.status === 'draft';
      case 'delete':
        return c.status === 'draft' && !c.everReleased;
      case 'block':
        return c.status === 'release';
      case 'unblock':
        return c.status === 'block';
      default:
        return true;
    }
  }
}
