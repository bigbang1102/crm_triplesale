import {
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  inject,
  signal,
  untracked,
} from '@angular/core';
import { ActivatedRoute } from '@angular/router';
import { I18n } from '@core/i18n/i18n.service';
import { BarChart, type BarItem } from '@shared/ui/charts/bar-chart';
import { DonutChart, type DonutItem } from '@shared/ui/charts/donut-chart';
import { LineChart, type LineSeries } from '@shared/ui/charts/line-chart';
import { AiAdminApi } from './ai-admin.api';
import { AiAdminQuota } from './ai-admin-quota';
import {
  dayOfMonth,
  formatNumber,
  formatPercent,
  formatTokens,
  monthOf,
  scopeFromParams,
  scopeKeyOf,
  scopeLevelOf,
  tightestQuota,
  type ScopeRef,
} from './ai-admin.logic';
import type { DetailChild, DetailRequest, DetailResponse } from './ai-admin.types';
import { AsyncState } from './parts/aad-async';
import { AadMonth } from './parts/aad-month';
import { AadQuotaBar } from './parts/aad-quota-bar';
import { AadScopePicker } from './parts/aad-scope-picker';
import { AadTiles, type AadTile } from './parts/aad-tiles';

/** Page 2 — which modules / AI models a company, department or employee used, and the quotas. */
@Component({
  selector: 'ts-ai-admin-detail',
  imports: [
    AadMonth,
    AadQuotaBar,
    AadScopePicker,
    AadTiles,
    AiAdminQuota,
    BarChart,
    DonutChart,
    LineChart,
  ],
  templateUrl: './ai-admin-detail.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AiAdminDetail {
  protected readonly t = inject(I18n).t;
  private readonly api = inject(AiAdminApi);
  private readonly route = inject(ActivatedRoute);

  protected readonly formatNumber = formatNumber;
  protected readonly formatPercent = formatPercent;
  protected readonly formatTokens = formatTokens;
  protected readonly month = signal(monthOf(new Date()));
  /** starts on the scope of the link (`?company=A1|name&department=…`) from page 1 */
  protected readonly scope = signal<ScopeRef>(
    scopeFromParams((name) => this.route.snapshot.queryParamMap.get(name)),
  );
  protected readonly state = new AsyncState<DetailResponse>(this.t);
  protected readonly data = this.state.data;

  protected readonly blocking = computed(() => tightestQuota(this.data()?.quotaChain ?? []));
  protected readonly tiles = computed<AadTile[]>(() => {
    const totals = this.data()?.totals;
    if (!totals) return [];
    return [
      {
        label: this.t('app.aiAdmin.tile.total'),
        value: formatTokens(totals.tokens),
        hint: formatNumber(totals.tokens),
      },
      {
        label: this.t('app.aiAdmin.tile.input'),
        value: formatTokens(totals.inputTokens),
        hint: formatNumber(totals.inputTokens),
      },
      {
        label: this.t('app.aiAdmin.tile.output'),
        value: formatTokens(totals.outputTokens),
        hint: formatNumber(totals.outputTokens),
      },
      { label: this.t('app.aiAdmin.tile.runs'), value: formatNumber(totals.runs) },
      { label: this.t('app.aiAdmin.tile.activeUsers'), value: formatNumber(totals.users) },
    ];
  });

  protected readonly toolBars = computed<BarItem[]>(() =>
    (this.data()?.byTool ?? []).map((tool) => ({
      key: tool.toolId,
      label: tool.title,
      hint: tool.groupTitle,
      value: tool.tokens,
      valueText: formatTokens(tool.tokens),
    })),
  );
  protected readonly groupItems = computed<DonutItem[]>(() =>
    (this.data()?.byGroup ?? []).map((g) => ({
      label: g.groupTitle,
      value: g.tokens,
      valueText: formatTokens(g.tokens),
    })),
  );
  protected readonly modelItems = computed<DonutItem[]>(() =>
    (this.data()?.byModel ?? []).map((m) => ({
      label: m.label,
      value: m.tokens,
      valueText: formatTokens(m.tokens),
    })),
  );

  /** tools × models, tokens in every cell (`toolModel`) */
  protected readonly matrix = computed(() => {
    const data = this.data();
    if (!data) return { models: [], rows: [] };
    const cells = new Map(data.toolModel.map((c) => [`${c.toolId}|${c.modelKey}`, c.tokens]));
    return {
      models: data.byModel,
      rows: data.byTool.map((tool) => ({
        tool,
        cells: data.byModel.map((m) => cells.get(`${tool.toolId}|${m.modelKey}`) ?? 0),
      })),
    };
  });

  protected readonly dailyLabels = computed(() =>
    (this.data()?.daily ?? []).map((d) => dayOfMonth(d.date)),
  );
  protected readonly dailySeries = computed<LineSeries[]>(() => [
    {
      name: this.t('app.aiAdmin.tile.total'),
      values: (this.data()?.daily ?? []).map((d) => d.tokens),
    },
  ]);

  constructor() {
    effect(() => {
      const request = this.requestOf(this.month(), this.scope());
      untracked(() => {
        if (request) void this.state.run(() => this.api.detail(request));
      });
    });
  }

  protected reload(): void {
    const request = this.requestOf(this.month(), this.scope());
    if (request) void this.state.run(() => this.api.detail(request));
  }

  /** a department / employee row of the table: go one level down */
  protected openChild(child: DetailChild): void {
    const current = this.scope();
    const ref = { code: child.key, name: child.name };
    this.scope.set(
      current.department ? { ...current, user: ref } : { ...current, department: ref, user: null },
    );
  }

  protected childKindKey(): string {
    return this.scope().department ? 'app.aiAdmin.level.user' : 'app.aiAdmin.level.department';
  }

  private requestOf(month: string, scope: ScopeRef): DetailRequest | null {
    const level = scopeLevelOf(scope);
    if (!level) return null;
    return {
      month,
      level,
      key: scopeKeyOf(scope),
      company: scope.company?.code,
      department: scope.department?.code,
    };
  }
}
