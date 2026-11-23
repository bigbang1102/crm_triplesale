import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { ForecastInputValue, ForecastSelect, ForecastTip } from './forecast-controls';
import { ForecastFilter, ForecastFilters } from './forecast-filters';
import { B, CATEGORY_CHIP, CATEGORY_COLOR, CATEGORY_LABEL, dcls, sgn } from './forecast.format';
import { Emp, ForecastStore, L3_TABS } from './forecast.store';

/**
 * แท็บ Adjustment — สมการยอด (ก่อนปรับ + Judgment + Manager Adj. = Final) และสองตาราง: Opportunity Judgment (ปรับรายดีล)
 * กับ Manager Adjustment (ปรับยอดรวมรายพนักงานต่อ Pipeline) — ต้นแบบ : `pAdjust()` / `summaryBox()` / `judgmentView()` /
 * `jRow()` / `managerView()` / `mRow()`. ทุกการแก้เป็นร่างจนกดปุ่มบันทึกของ workspace แล้วยืนยันในหน้าตรวจสอบ.
 */
@Component({
  selector: 'ts-forecast-adjust',
  imports: [ForecastTip, ForecastSelect, ForecastInputValue, ForecastFilters],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './forecast-adjust.html',
})
export class ForecastAdjust {
  protected readonly store = inject(ForecastStore);
  protected readonly t = this.store.t;
  protected readonly B = B;
  protected readonly sgn = sgn;
  protected readonly dcls = dcls;
  protected readonly round = Math.round;
  protected readonly CATEGORY_LABEL = CATEGORY_LABEL;
  protected readonly CATEGORY_COLOR = CATEGORY_COLOR;
  protected readonly CATEGORY_CHIP = CATEGORY_CHIP;
  protected readonly l3Tabs = L3_TABS;
  protected readonly filters: readonly ForecastFilter[] = ['month', 'pipe', 'team', 'emp'];

  /** ดีลที่ติ๊กไว้สำหรับ "OUT ที่เลือก" / "IN ที่เลือก" */
  protected readonly picked = signal<ReadonlySet<string>>(new Set());

  private readonly openIds = computed(() => this.store.opps().filter((d) => d.status === 'open').map((d) => d.id));
  protected readonly allPicked = computed(() => this.openIds().length > 0 && this.openIds().every((id) => this.picked().has(id)));

  /** ปุ่มเลือกพนักงานเหนือตาราง Judgment : ทุกคนในทีมที่กรอง */
  protected readonly chipEmps = computed(() => this.store.visibleEmps().filter((e) => this.store.team() === 'all' || e.team === this.store.team()));

  /** ทีมของตาราง Manager Adjustment : พนักงานตามตัวกรอง + ทั้งทีมสำหรับแถวรวม */
  protected readonly mgrTeams = computed(() => {
    const scope = this.store.scopeEmps();
    return this.store
      .teams()
      .filter((t) => this.store.team() === 'all' || t.id === this.store.team())
      .map((t) => ({ id: t.id, name: t.name, manager: t.manager ?? '', emps: scope.filter((e) => e.team === t.id), all: t.employees.map((e) => e.id) }))
      .filter((t) => t.emps.length > 0);
  });

  protected readonly scopeIds = computed(() => this.store.scopeEmps().map((e: Emp) => e.id));

  /** แถบเตือนของงวด (`noCfgBan()` ของต้นแบบ) */
  protected readonly ban = computed<{ cls: string; text: string } | null>(() => {
    const m = this.store.month();
    const w = this.store.curCfg();
    if (w && w.status === 'draft') return { cls: 'warn', text: this.t('app.forecast.ban.draft', w.code) };
    const c = this.store.cfgFor(m);
    if (c.status === 'none') return { cls: 'warn', text: this.t('app.forecast.ban.none', this.store.year(m.slice(0, 4))) };
    if (c.status === 'block') return { cls: 'lockban', text: '⛔ ' + this.t('app.forecast.ban.block', c.code) };
    return null;
  });

  protected pick(id: string, on: boolean): void {
    const next = new Set(this.picked());
    if (on) next.add(id);
    else next.delete(id);
    this.picked.set(next);
  }

  protected pickAll(on: boolean): void {
    this.picked.set(new Set(on ? this.openIds() : []));
  }

  protected bulk(inOut: 'in' | 'out'): void {
    const visible = new Set(this.openIds());
    this.store.bulk([...this.picked()].filter((id) => visible.has(id)), inOut);
  }

  protected adjDirty(key: string): boolean {
    return JSON.stringify(this.store.adjSaved()[key]) !== JSON.stringify(this.store.adjDraft()[key]);
  }
}
