import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { ForecastSelect, ForecastTip } from './forecast-controls';
import { dateTime } from './forecast.format';
import { ForecastStore } from './forecast.store';

/** ประเภทของประวัติ (ค่าที่ส่งให้ EP-14 `type`) → ชื่อบนจอ (ชื่อโมดูลเป็นคำเดียวกันทั้งสองภาษา) */
const TYPES: readonly (readonly [string, string])[] = [
  ['config', 'Configuration'],
  ['target', 'Target'],
  ['judgment', 'Opportunity Judgment'],
  ['adjustment', 'Manager Adjustment'],
  ['period', 'Close Period'],
];

/** Forecast Change History — ค่าเดิม → ค่าใหม่ ผู้ทำ เวลา และเหตุผล ; แก้หรือลบไม่ได้ (ต้นแบบ : `pHistory()`) */
@Component({
  selector: 'ts-forecast-history',
  imports: [ForecastTip, ForecastSelect],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="ph">
      <div>
        <h1>Forecast Change History<ts-forecast-tip k="pg_hist" /></h1>
        <p>{{ t('app.forecast.hist.sub') }}</p>
      </div>
      <div class="r">
        <button type="button" class="btn btn-g" (click)="export()">Export</button>
      </div>
    </div>
    <div class="filters">
      <div class="fld">
        <span>{{ t('app.forecast.hist.type') }}<ts-forecast-tip k="hi_type" /></span>
        <select class="sel" data-ods-nosearch="1" [attr.aria-label]="t('app.forecast.hist.type')" [tsFcValue]="store.histType()" (tsFcChange)="store.setHistType($event)">
          <option value="all">{{ t('app.forecast.hist.all') }}</option>
          @for (ty of types; track ty[0]) {
            <option [value]="ty[0]">{{ ty[1] }}</option>
          }
        </select>
      </div>
    </div>
    <div class="tw">
      <table>
        <thead>
          <tr>
            <th>{{ t('app.forecast.hist.at') }}</th>
            <th>{{ t('app.forecast.hist.by') }}</th>
            <th>{{ t('app.forecast.hist.type') }}</th>
            <th>{{ t('app.forecast.hist.item') }}</th>
            <th>{{ t('app.forecast.hist.old') }}</th>
            <th>{{ t('app.forecast.hist.new') }}</th>
            <th>{{ t('app.forecast.reason') }}</th>
          </tr>
        </thead>
        <tbody>
          @for (h of store.historyRows(); track $index) {
            <tr>
              <td>{{ dateTime(h.at) }}</td>
              <td>{{ h.actor }}</td>
              <td>
                <span class="chip c-grey">{{ typeLabel(h.type) }}</span>
              </td>
              <td>{{ h.label }}</td>
              <td class="sub">{{ h.oldValue }}</td>
              <td>
                <b>{{ h.newValue }}</b>
              </td>
              <td>{{ h.reason }}</td>
            </tr>
          } @empty {
            <tr>
              <td colspan="7" class="sub">{{ t('app.forecast.noRows') }}</td>
            </tr>
          }
        </tbody>
      </table>
    </div>
  `,
})
export class ForecastHistory {
  protected readonly store = inject(ForecastStore);
  protected readonly t = this.store.t;
  protected readonly dateTime = dateTime;
  protected readonly types = TYPES;

  protected typeLabel(type: string): string {
    return TYPES.find((x) => x[0] === type)?.[1] ?? type;
  }

  /** ไฟล์ Excel ตามตัวกรอง ; API ยังไม่พร้อม = store แจ้งผู้ใช้ (เหมือนต้นแบบ) */
  protected async export(): Promise<void> {
    const file = await this.store.exportHistory();
    if (!file) return;
    const url = URL.createObjectURL(file);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'forecast-history.xlsx';
    a.click();
    URL.revokeObjectURL(url);
  }
}
