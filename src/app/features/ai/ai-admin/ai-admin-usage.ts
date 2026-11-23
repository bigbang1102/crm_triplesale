import {
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  inject,
  signal,
  untracked,
} from '@angular/core';
import { RouterLink } from '@angular/router';
import { I18n } from '@core/i18n/i18n.service';
import { PrefsService } from '@core/prefs/prefs.service';
import { BarChart, type BarItem } from '@shared/ui/charts/bar-chart';
import { DonutChart, type DonutItem } from '@shared/ui/charts/donut-chart';
import { LineChart, type LineSeries } from '@shared/ui/charts/line-chart';
import { AiAdminApi } from './ai-admin.api';
import {
  DRILL_ROOT,
  breadcrumb,
  canDrill,
  dayOfMonth,
  drillInto,
  drillUp,
  formatNumber,
  formatPercent,
  formatTokens,
  levelOf,
  monthLabel,
  monthOf,
  nearLimitRows,
  overviewRequest,
  scopeOfDrill,
  scopeToParams,
  type DrillState,
} from './ai-admin.logic';
import type { OverviewResponse, OverviewRow } from './ai-admin.types';
import { AsyncState } from './parts/aad-async';
import { AadMonth } from './parts/aad-month';
import { AadQuotaBar } from './parts/aad-quota-bar';
import { AadTiles, type AadTile } from './parts/aad-tiles';

const DONUT_TOP = 5;

/** Page 1 — who used how many tokens: company → department → employee as a table and charts, with drill-down. */
@Component({
  selector: 'ts-ai-admin-usage',
  imports: [AadMonth, AadQuotaBar, AadTiles, BarChart, DonutChart, LineChart, RouterLink],
  templateUrl: './ai-admin-usage.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AiAdminUsage {
  protected readonly t = inject(I18n).t;
  private readonly api = inject(AiAdminApi);
  private readonly prefs = inject(PrefsService);

  protected readonly formatNumber = formatNumber;
  protected readonly formatPercent = formatPercent;
  protected readonly formatTokens = formatTokens;
  protected readonly month = signal(monthOf(new Date()));
  protected readonly drill = signal<DrillState>(DRILL_ROOT);
  /** the row whose daily line is drawn next to the scope's total ('' = none) */
  protected readonly compareKey = signal('');
  protected readonly state = new AsyncState<OverviewResponse>(this.t);

  protected readonly data = this.state.data;
  protected readonly rows = computed(() => this.data()?.rows ?? []);
  protected readonly leaf = computed(() => !canDrill(this.drill()));
  protected readonly levelKey = computed(() => `app.aiAdmin.level.${levelOf(this.drill())}`);
  protected readonly crumbs = computed(() =>
    breadcrumb(this.drill(), this.t('app.aiAdmin.usage.allCompanies')),
  );
  protected readonly warnings = computed(() => nearLimitRows(this.rows()));

  protected readonly tiles = computed<AadTile[]>(() => {
    const scope = this.data()?.scope;
    if (!scope) return [];
    return [
      {
        label: this.t('app.aiAdmin.tile.total'),
        value: formatTokens(scope.tokens),
        hint: formatNumber(scope.tokens),
      },
      {
        label: this.t('app.aiAdmin.tile.input'),
        value: formatTokens(scope.inputTokens),
        hint: formatNumber(scope.inputTokens),
      },
      {
        label: this.t('app.aiAdmin.tile.output'),
        value: formatTokens(scope.outputTokens),
        hint: formatNumber(scope.outputTokens),
      },
      { label: this.t('app.aiAdmin.tile.runs'), value: formatNumber(scope.runs) },
      {
        label: this.t('app.aiAdmin.tile.activeUsers'),
        value: formatNumber(scope.users),
        hint: this.t('app.aiAdmin.tile.ofHeadcount', formatNumber(scope.headcount)),
      },
    ];
  });

  protected readonly barItems = computed<BarItem[]>(() =>
    this.rows().map((row) => ({
      key: row.key,
      label: row.name,
      value: row.tokens,
      valueText: formatTokens(row.tokens),
      hint: this.t('app.aiAdmin.usage.shareHint', formatPercent(row.share)),
    })),
  );

  protected readonly shareItems = computed<DonutItem[]>(() => {
    const rows = this.rows().filter((r) => r.tokens > 0);
    const top = rows
      .slice(0, DONUT_TOP)
      .map((r) => ({ label: r.name, value: r.tokens, valueText: formatTokens(r.tokens) }));
    const rest = rows.slice(DONUT_TOP).reduce((sum, r) => sum + r.tokens, 0);
    return rest > 0
      ? [
          ...top,
          { label: this.t('app.aiAdmin.usage.others'), value: rest, valueText: formatTokens(rest) },
        ]
      : top;
  });

  protected readonly dailyLabels = computed(() =>
    (this.data()?.daily ?? []).map((d) => dayOfMonth(d.date)),
  );
  protected readonly dailySeries = computed<LineSeries[]>(() => {
    const data = this.data();
    if (!data) return [];
    const series: LineSeries[] = [
      {
        name: this.t('app.aiAdmin.tile.input'),
        values: data.daily.map((d) => d.inputTokens ?? d.tokens),
      },
      {
        name: this.t('app.aiAdmin.tile.output'),
        values: data.daily.map((d) => d.outputTokens ?? 0),
      },
    ];
    const key = this.compareKey();
    const row = this.rows().find((r) => r.key === key);
    const byDate = new Map((data.dailyByRow[key] ?? []).map((p) => [p.date, p.tokens]));
    return row
      ? [...series, { name: row.name, values: data.daily.map((d) => byDate.get(d.date) ?? 0) }]
      : series;
  });

  protected readonly monthLabels = computed(() => {
    const lang = this.prefs.lang() === 'en' ? 'en' : 'th';
    return (this.data()?.months ?? []).map((m) => monthLabel(m.month, lang));
  });
  protected readonly monthSeries = computed<LineSeries[]>(() => [
    {
      name: this.t('app.aiAdmin.tile.total'),
      values: (this.data()?.months ?? []).map((m) => m.tokens),
    },
  ]);

  constructor() {
    effect(() => {
      const request = overviewRequest(this.month(), this.drill());
      untracked(() => {
        this.compareKey.set('');
        void this.state.run(() => this.api.overview(request));
      });
    });
  }

  protected reload(): void {
    void this.state.run(() => this.api.overview(overviewRequest(this.month(), this.drill())));
  }

  protected open(key: string): void {
    const row = this.rows().find((r) => r.key === key);
    if (row && canDrill(this.drill())) this.drill.set(drillInto(this.drill(), row));
  }

  protected goTo(depth: number): void {
    if (depth === 0 || depth === 1) this.drill.set(drillUp(this.drill(), depth));
  }

  protected onCompare(key: string): void {
    this.compareKey.set(key);
  }

  /** `?tab=detail&…` of a row: the scope of the row inside the scope being looked at */
  protected detailParams(row: OverviewRow): Record<string, string> {
    const state = this.drill();
    const next = canDrill(state) ? drillInto(state, row) : state;
    const scope = scopeOfDrill(next);
    const user = canDrill(state) ? null : { code: row.key, name: row.name };
    return { tab: 'detail', ...scopeToParams({ ...scope, user }) };
  }
}
