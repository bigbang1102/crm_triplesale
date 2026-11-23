import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import { ForecastInputValue, ForecastSelect, ForecastTip } from './forecast-controls';
import { B, monthShort } from './forecast.format';
import { ForecastStore, STATUS_LABEL } from './forecast.store';

/**
 * แท็บ Sales Target — เลือก Pipeline → เลือกเดือน → กรอก Target ต่อพนักงานต่อเดือน (ต้นแบบ : `pTarget()` / `pipePick()` /
 * `monthPicker()` / `topdown()`). ค่าที่กรอกรออยู่ในร่างจนกดปุ่มบันทึกของ workspace.
 */
@Component({
  selector: 'ts-forecast-target',
  imports: [ForecastTip, ForecastSelect, ForecastInputValue],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './forecast-target.html',
})
export class ForecastTarget {
  protected readonly store = inject(ForecastStore);
  protected readonly t = this.store.t;
  protected readonly B = B;
  protected readonly STATUS_LABEL = STATUS_LABEL;
  protected readonly quarters = [1, 2, 3, 4];

  /** เดือนที่เลือกเฉพาะของปีนี้ = คอลัมน์ของตาราง */
  protected readonly months = computed(() => this.store.targetMonths().filter((m) => m.startsWith(String(this.store.wsYear()))));
  protected readonly yearList = computed(() => [...this.store.configs()].sort((a, b) => a.year - b.year));
  protected readonly can = computed(() => this.store.perms().canTarget && this.store.wsCfg()?.status !== 'block');

  protected mShort(m: string): string {
    return monthShort(m, this.store.lang());
  }

  protected quarterOn(q: number): boolean {
    const ms = this.store.targetMonths();
    return this.store.quarterMonths(q).every((m) => ms.includes(m));
  }

  private empIds(teamId: string): string[] {
    return this.store.teams().find((t) => t.id === teamId)?.employees.map((e) => e.id) ?? [];
  }

  /** ผลรวม Target ของลูกทีมในเดือนนั้น (รวมค่าที่ยังไม่บันทึก) */
  protected teamSum(teamId: string, m: string): number {
    return this.empIds(teamId).reduce((s, id) => s + this.store.tgVal(this.store.tgKey(m, id)), 0);
  }

  /** ตั้ง Target ทีมไว้และไม่เท่าผลรวมลูกทีม → "แบ่งแล้ว … (เกิน/ขาด …)" */
  protected teamGap(teamId: string, m: string): { sum: number; diff: number; over: boolean } | null {
    const set = this.store.ttVal(this.store.tgKey(m, teamId));
    const sum = this.teamSum(teamId, m);
    return set == null || set === sum ? null : { sum, diff: Math.abs(set - sum), over: sum > set };
  }

  protected teamTotal(teamId: string): number {
    return this.months().reduce((s, m) => s + (this.store.ttVal(this.store.tgKey(m, teamId)) ?? this.teamSum(teamId, m)), 0);
  }

  protected empTotal(empId: string): number {
    return this.months().reduce((s, m) => s + this.store.tgVal(this.store.tgKey(m, empId)), 0);
  }
}
