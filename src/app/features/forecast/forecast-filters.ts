import { ChangeDetectionStrategy, Component, computed, inject, input } from '@angular/core';
import { ForecastSelect, ForecastTip } from './forecast-controls';
import { ForecastStore } from './forecast.store';

export type ForecastFilter = 'month' | 'pipe' | 'team' | 'emp';

/**
 * ตัวกรองที่หลายแท็บใช้ร่วมกัน : งวด Forecast · สายงานขาย (Pipeline) · ทีม · พนักงาน
 * (ต้นแบบ : `monthSel()` / `pipeSel()` / `teamSel()` / `empSel()`). ผู้ใช้ที่เห็นทีมเดียว / คนเดียวไม่มีตัวเลือก "ทั้งหมด".
 */
@Component({
  selector: 'ts-forecast-filters',
  imports: [ForecastTip, ForecastSelect],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @if (has('month')) {
      <div class="fld">
        <span>{{ t('app.forecast.filter.month') }}<ts-forecast-tip k="f_month" /></span>
        <select class="sel" data-ods-nosearch="1" [attr.aria-label]="t('app.forecast.filter.month')" [tsFcValue]="store.month()" (tsFcChange)="store.setMonth($event)">
          @for (m of store.wsMonths(); track m) {
            <option [value]="m">{{ store.mName(m) }}{{ store.periodClosed(m) ? t('app.forecast.filter.closedSuffix') : '' }}</option>
          }
        </select>
      </div>
    }
    @if (has('pipe')) {
      <div class="fld">
        <span>{{ t('app.forecast.filter.pipe') }}<ts-forecast-tip k="f_pipe" /></span>
        <select class="sel" data-ods-nosearch="1" [attr.aria-label]="t('app.forecast.filter.pipe')" [tsFcValue]="store.pipe()" (tsFcChange)="store.setPipe($event)">
          <option value="all">{{ t('app.forecast.filter.allPipes') }}</option>
          @for (p of store.pipelines(); track p.id) {
            <option [value]="p.id">{{ p.name }}</option>
          }
        </select>
      </div>
    }
    @if (has('team')) {
      <div class="fld">
        <span>{{ t('app.forecast.filter.team') }}<ts-forecast-tip k="f_team" /></span>
        <select class="sel" data-ods-nosearch="1" [attr.aria-label]="t('app.forecast.filter.team')" [tsFcValue]="store.team()" (tsFcChange)="store.setTeam($event)">
          @if (store.teams().length > 1) {
            <option value="all">{{ t('app.forecast.filter.allTeams') }}</option>
          }
          @for (team of store.teams(); track team.id) {
            <option [value]="team.id">{{ team.name }}</option>
          }
        </select>
      </div>
    }
    @if (has('emp')) {
      <div class="fld">
        <span>{{ t('app.forecast.filter.emp') }}<ts-forecast-tip k="f_emp" /></span>
        <select class="sel" [attr.aria-label]="t('app.forecast.filter.emp')" [tsFcValue]="store.emp()" (tsFcChange)="store.setEmp($event)">
          @if (emps().length > 1) {
            <option value="all">{{ t('app.forecast.filter.allEmps') }}</option>
          }
          @for (e of emps(); track e.id) {
            <option [value]="e.id">{{ e.name }}</option>
          }
        </select>
      </div>
    }
  `,
})
export class ForecastFilters {
  readonly show = input.required<readonly ForecastFilter[]>();
  protected readonly store = inject(ForecastStore);
  protected readonly t = this.store.t;

  /** พนักงานของทีมที่เลือก */
  protected readonly emps = computed(() => this.store.visibleEmps().filter((e) => this.store.team() === 'all' || e.team === this.store.team()));

  protected has(f: ForecastFilter): boolean {
    return this.show().includes(f);
  }
}
