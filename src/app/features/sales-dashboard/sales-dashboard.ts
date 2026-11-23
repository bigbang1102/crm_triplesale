import {
  CUSTOM_ELEMENTS_SCHEMA,
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  Injector,
  ViewEncapsulation,
  afterNextRender,
  inject,
  signal,
} from '@angular/core';
import { I18n } from '@core/i18n/i18n.service';
import { SEED_EMPLOYEES, SEED_GROUPS, SEED_TODAY, leadIds, seedLead } from '@core/mock/crm-seed';
import { ToastService } from '@shared/ui/notify/toast.service';
import { applyKpis, buildKpis } from './sales-dashboard.kpi.logic';
import { applyDailyLine, applyDonut, applyLeadCards, applySources } from './sales-dashboard.lead.dom';
import { buildDaily, buildLeadCards, buildSources } from './sales-dashboard.lead.logic';
import { applyExpectedClose, applyFunnel, applyGroupBars, applyPipelineCards, applyTopDeals, applyWaitingList } from './sales-dashboard.pipeline.dom';
import { type PipeLead, buildPipeline } from './sales-dashboard.pipeline.logic';
import { type DashboardTab, nextScrollLeft, tabAfterKey } from './sales-dashboard.logic';

/**
 * แดชบอร์ด (`/dashboard`) — the new dashboard design (6 tabs: ภาพรวม · Lead & การตลาด · Pipeline & ยอดขาย · ทีมขาย · กิจกรรม · แชท),
 * in place of the dashboard ported from Java (`features/dashboard`, kept in the code, no longer routed).
 *
 * `sales-dashboard.html` / `.css` are GENERATED from the designer's snapshot by `tools/sync-sales-dashboard.mjs` (the source of the
 * designer's build was not handed over): the markup keeps the snapshot's custom elements (`ts-db-card`, `ts-db-frame` …) because the
 * CSS selects on them — hence CUSTOM_ELEMENTS_SCHEMA — and the snapshot's encapsulation attributes renamed to `data-h-*` / `data-c-*`.
 * This host only drives what the snapshot could not carry: the tab strip, the chips of a card, the arrow of a scrolling frame.
 *
 * FAST-DEBT(API): static numbers of the snapshot — the period / salesperson filters, "ปรับแดชบอร์ด", "ตัวกรอง", the "i" purpose
 *   pop-ups and the drill-down of a bar / row do nothing yet (buttons of the head say so with a toast) · BIG · 2026-11-20
 */
@Component({
  selector: 'ts-sales-dashboard',
  templateUrl: './sales-dashboard.html',
  styleUrl: './sales-dashboard.css',
  // the generated CSS scopes itself with the data-h-* / data-c-* attributes of the snapshot
  encapsulation: ViewEncapsulation.None,
  // the snapshot's text nodes are laid out with their spaces (" i ", "ปรับแดชบอร์ด ")
  preserveWhitespaces: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  schemas: [CUSTOM_ELEMENTS_SCHEMA],
  host: { 'data-h-sales-dashboard': '', '(click)': 'onPanelClick($event)' },
})
export class SalesDashboard {
  protected readonly tab = signal<DashboardTab>('overview');
  private readonly t = inject(I18n).t;
  private readonly toast = inject(ToastService);
  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef);
  private readonly injector = inject(Injector);

  private leads: PipeLead[] = [];

  constructor() {
    afterNextRender(() => this.showCompany(), { injector: this.injector });
  }

  /** the salesperson list and the key figures of the company the user signed in to (the rest of the snapshot keeps its design numbers) */
  private showCompany(): void {
    const root = this.host.nativeElement;
    this.leads = leadIds().map((id) => seedLead(id));
    const select = root.querySelector<HTMLSelectElement>('label.own select');
    if (select) {
      select.replaceChildren(new Option('ทั้งหมด', ''), ...SEED_EMPLOYEES.map((e) => new Option(e.name, e.code)));
      select.addEventListener('change', () => this.refreshFigures());
    }
    this.refreshFigures();
  }

  /** the panel of a tab is built when the tab is opened, so its figures are written after every change of tab (and of salesperson) */
  private refreshFigures(): void {
    const root = this.host.nativeElement;
    const owner = root.querySelector<HTMLSelectElement>('label.own select')?.value ?? '';
    const leads = owner ? this.leads.filter((l) => l.ownerCode === owner) : this.leads;
    applyKpis(root, buildKpis(leads, SEED_TODAY));
    const sources = buildSources(leads, SEED_TODAY);
    applyLeadCards(root, buildLeadCards(leads, SEED_TODAY));
    applySources(root, sources);
    applyDonut(root, sources);
    applyDailyLine(root, buildDaily(leads, SEED_TODAY), Number(SEED_TODAY.slice(5, 7)) - 1);
    const pipeline = buildPipeline(leads, SEED_GROUPS, SEED_TODAY);
    applyPipelineCards(root, pipeline.cards);
    applyGroupBars(root, pipeline.groups);
    applyTopDeals(root, pipeline.top, SEED_GROUPS.length);
    applyWaitingList(root, 'ดีลค้างนานเกินกำหนด', pipeline.stuck, SEED_GROUPS.length);
    applyFunnel(root, pipeline.funnel);
    applyExpectedClose(root, pipeline.expected);
    applyWaitingList(root, 'ดีลที่ขาดการติดตาม', pipeline.neglected, SEED_GROUPS.length);
  }

  private showFiguresAfterRender(): void {
    afterNextRender(() => this.refreshFigures(), { injector: this.injector });
  }

  protected select(tab: DashboardTab): void {
    this.tab.set(tab);
    this.showFiguresAfterRender();
  }

  protected onTabKey(event: KeyboardEvent): void {
    const next = tabAfterKey(this.tab(), event.key);
    if (!next) return;
    event.preventDefault();
    this.tab.set(next);
    this.showFiguresAfterRender();
    // the selected tab takes the focus (WAI-ARIA tabs); the button is the same element before and after the change
    afterNextRender(
      () => this.host.nativeElement.querySelector<HTMLElement>(`#db-tab-${next}`)?.focus(),
      {
        injector: this.injector,
      },
    );
  }

  protected notReady(): void {
    this.toast.info(this.t('app.salesDashboard.notReady'));
  }

  /** clicks inside the generated panels: a chip of a card's view switch, the arrow of a scrolling frame */
  protected onPanelClick(event: MouseEvent): void {
    const target = event.target instanceof Element ? event.target : null;
    const chip = target?.closest('ts-db-chips .chip');
    if (chip) {
      pressChip(chip);
      return;
    }
    const arrow = target?.closest('ts-db-frame .fr-arrow');
    const track = arrow?.closest('ts-db-frame')?.querySelector('.fr-track');
    if (track instanceof HTMLElement)
      track.scrollTo({ left: nextScrollLeft(track), behavior: 'smooth' });
  }
}

/** one pressed chip per group, like the designer's view switch (the chart under it keeps the snapshot's view) */
function pressChip(chip: Element): void {
  for (const other of chip.closest('.chips')?.querySelectorAll('.chip') ?? []) {
    other.setAttribute('aria-pressed', String(other === chip));
  }
}
