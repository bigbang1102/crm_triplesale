import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import { ForecastSelect, ForecastTip } from './forecast-controls';
import { ForecastFilter, ForecastFilters } from './forecast-filters';
import { ForecastScenario } from './forecast-scenario';
import { B, CATEGORY_COLOR, CATEGORY_LABEL, dcls, monthLong, monthShort, sgn, yearMonths } from './forecast.format';
import { ForecastStore } from './forecast.store';
import { DashboardLevel, ForecastCategory } from './forecast.types';

/** ขนาดของกราฟเส้น (viewBox ของต้นแบบ) */
const W = 560;
const H = 220;
const RING = 2 * Math.PI * 70;

/**
 * Forecast Dashboard — กราฟสรุปผลตามช่วงเวลา (ปี / ไตรมาส / เดือน) : Sales Outlook · Team Performance · Pipeline Health ·
 * Forecast Bridge (ต้นแบบ : `pDashboard()`). ตัวเลขมาจาก EP-13 ; ที่นี่คิดแค่ตำแหน่งบนกราฟ.
 */
@Component({
  selector: 'ts-forecast-dashboard',
  imports: [ForecastTip, ForecastSelect, ForecastFilters, ForecastScenario],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './forecast-dashboard.html',
})
export class ForecastDashboard {
  protected readonly store = inject(ForecastStore);
  protected readonly t = this.store.t;
  protected readonly B = B;
  protected readonly sgn = sgn;
  protected readonly dcls = dcls;
  protected readonly CATEGORY_LABEL = CATEGORY_LABEL;
  protected readonly CATEGORY_COLOR = CATEGORY_COLOR;
  protected readonly levels: readonly DashboardLevel[] = ['year', 'quarter', 'month'];
  protected readonly quarters = [1, 2, 3, 4];
  protected readonly filters: readonly ForecastFilter[] = ['pipe', 'team'];

  /** ปีที่มี Configuration (+ ปีที่เลือกอยู่) */
  protected readonly years = computed(() => {
    const ys = new Set(this.store.configs().map((c) => c.year));
    ys.add(this.store.dYear());
    return [...ys].sort((a, b) => a - b);
  });

  protected readonly months = computed(() => yearMonths(this.store.dYear()).map((m, i) => ({ value: m, label: monthLong(i + 1, this.store.lang()) })));

  protected readonly label = computed(() => {
    const y = this.store.year(this.store.dYear());
    if (this.store.dType() === 'year') return this.t('app.forecast.yearN', y);
    if (this.store.dType() === 'quarter') return 'Q' + this.store.dQ() + ' / ' + y;
    return this.store.mName(this.store.dMonth());
  });

  protected readonly view = computed(() => {
    const d = this.store.dash();
    if (!d) return null;
    const lang = this.store.lang();
    const inRange = d.outlook.filter((o) => o.inRange !== false);
    const target = inRange.reduce((s, o) => s + o.target, 0);
    const won = inRange.reduce((s, o) => s + o.closed, 0);
    const { base, judgment, manager, final } = d.bridge;

    // Sales Outlook : เส้น Target (ประ) · Final · Closed Success
    const n = d.outlook.length;
    const max = Math.max(1, ...d.outlook.flatMap((o) => [o.target, o.final, o.closed])) * 1.15;
    const x = (i: number) => (n === 1 ? W / 2 : 50 + (i * (W - 80)) / (n - 1));
    const y = (v: number) => H - 30 - (v / max) * (H - 50);
    const line = (key: 'target' | 'final' | 'closed') => ({
      key,
      d: d.outlook.map((o, i) => (i ? 'L' : 'M') + x(i) + ',' + y(o[key])).join(' '),
      points: d.outlook.map((o, i) => ({ x: x(i), y: y(o[key]), r: o.inRange !== false ? 5 : 3.5, title: this.store.mName(o.month) + ' ' + B(o[key]) })),
    });
    const outlook = {
      grid: [0, 1, 2, 3, 4].map((j) => y((max * j) / 4)),
      series: [line('target'), line('final'), line('closed')],
      labels: d.outlook.map((o, i) => ({ x: x(i), text: monthShort(o.month, lang), on: o.inRange !== false })),
    };

    // Team Performance : แท่ง = Final · ขีด = Target
    const tmax = Math.max(1, ...d.teams.flatMap((t) => [t.final, t.target])) * 1.1;
    const teams = d.teams.map((t) => ({ id: t.team, name: t.name, value: t.final, final: (t.final / tmax) * 100, target: (t.target / tmax) * 100 }));

    // Pipeline Health : Omitted อยู่ในรายการ แต่ไม่นับในวงกลม
    const amount = (k: ForecastCategory) => d.health.find((h) => h.category === k)?.amount ?? 0;
    const ringCats: ForecastCategory[] = ['committed', 'bestcase', 'pipeline', 'closed'];
    const sum = ringCats.reduce((s, k) => s + amount(k), 0) || 1;
    let off = 0;
    const donut = ringCats.map((k) => {
      const len = (amount(k) / sum) * RING;
      const seg = { category: k, amount: amount(k), dash: `${len} ${RING}`, offset: -off };
      off += len;
      return seg;
    });
    const health = [...ringCats, 'omitted' as const].map((k) => ({ category: k, amount: amount(k) }));

    // Forecast Bridge : ก่อนปรับ → Judgment → Manager Adjustment → Final
    const bmax = Math.max(1, base, final, base + judgment) * 1.1;
    const bar = (key: string, label: string, value: number, color: string, delta: boolean) => ({ key, label, value, color, delta, width: (Math.abs(value) / bmax) * 100 });
    const bridge = [
      bar('base', this.t('app.forecast.before'), base, 'var(--fc-cat-bestcase)', false),
      bar('judgment', 'Judgment', judgment, 'var(--fc-kpi-gap)', true),
      bar('manager', 'Manager Adjustment', manager, 'var(--fc-cat-closed)', true),
      bar('final', 'Final', final, 'var(--fc-cat-committed)', false),
    ];

    return { target, won, final, base, scenario: d.scenario ?? { min: 0, expected: final, max: 0 }, outlook, teams, donut, health, bridge };
  });
}
