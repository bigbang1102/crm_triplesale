import { ChangeDetectionStrategy, Component, DestroyRef, ViewEncapsulation, computed, effect, inject, signal } from '@angular/core';
import { ForecastSelect, ForecastTips } from './forecast-controls';
import { ForecastDashboard } from './forecast-dashboard';
import { ForecastHistory } from './forecast-history';
import { ForecastListing } from './forecast-listing';
import { ForecastOverview } from './forecast-overview';
import { ForecastWorkspace } from './forecast-workspace';
import { B, dateTime, dcls, sgn } from './forecast.format';
import { ForecastStore, L1_TABS, L2_TABS, L3_TABS, STATUS_LABEL } from './forecast.store';

/**
 * เมนู Forecast (`/forecast`) — หน้าใหม่เขียนด้วยมือจากต้นแบบ TripleSales_Forecast_Prototype_v19.html (ไม่มีหน้า Java ต้นทาง):
 * Sales Forecast Listing · Sales Forecast Configuration (Configuration / Sales Target / Adjustment / Close Forecast Period) ·
 * Forecast Overview · Forecast Dashboard · Forecast Change History. แท็บ "แผนภาพฐานข้อมูล (ERD)" กับ "Endpoint ที่ใช้" ของต้นแบบ
 * เป็นเอกสาร จึงไม่อยู่ในหน้า — path ของแท็บ Endpoint ไปอยู่ที่ forecast.api.ts.
 *
 * ข้อมูล : ForecastBackend เรียก API จริงก่อน แล้วตกไปใช้ข้อมูลจำลองของต้นแบบเมื่อ API ยังใช้งานไม่ได้ (forecast.backend.ts).
 * สไตล์ : forecast.scss ไม่ห่อ (ViewEncapsulation.None) ทุกกฎอยู่ใต้ `ts-forecast` — คอมโพเนนต์ลูกของหน้านี้จึงใช้ class ชุดเดียวกับ
 * ต้นแบบได้โดยไม่ต้องมีไฟล์สไตล์ของตัวเอง และกฎไม่รั่วไปหน้าอื่น.
 */
@Component({
  selector: 'ts-forecast',
  imports: [ForecastSelect, ForecastListing, ForecastWorkspace, ForecastOverview, ForecastDashboard, ForecastHistory],
  changeDetection: ChangeDetectionStrategy.OnPush,
  encapsulation: ViewEncapsulation.None,
  providers: [ForecastStore, ForecastTips],
  // `ts-ds` = ชุดสี Design System (src/styles/_ds-page.scss)
  host: { class: 'ts-ds', '(document:keydown.escape)': 'escape()' },
  templateUrl: './forecast.html',
  styleUrl: './forecast.scss',
})
export class Forecast {
  protected readonly store = inject(ForecastStore);
  private readonly tips = inject(ForecastTips);
  protected readonly t = this.store.t;
  protected readonly tabs = L1_TABS;
  protected readonly B = B;
  protected readonly sgn = sgn;
  protected readonly dcls = dcls;
  protected readonly dateTime = dateTime;

  /** เหตุผลในหน้าต่าง ปิดงวด / เปลี่ยนสถานะ */
  protected readonly reason = signal('');

  /** ตำแหน่งในเมนู (ต้นแบบ : `crumbs()`) */
  protected readonly crumbs = computed(() => {
    const s = this.store;
    const out = ['Sales Forecast', L1_TABS.find((x) => x.id === s.l1())?.label ?? ''];
    if (s.inWs()) {
      out.push(s.cfgId() ? (s.curCfg()?.code ?? '') : this.t('app.forecast.crumb.new'));
      out.push(L2_TABS.find((x) => x.id === s.l2())?.label ?? '');
      if (s.l2() === 'adjust') out.push(L3_TABS.find((x) => x.id === s.l3())?.label ?? '');
    }
    return out;
  });

  protected readonly title = computed(() => {
    const m = this.store.modal();
    switch (m?.kind) {
      case 'review':
        return this.t('app.forecast.review.title');
      case 'leave':
        return this.t('app.forecast.leave.title');
      case 'period':
        return this.t(m.open ? 'app.forecast.period.reopenTitle' : 'app.forecast.period.closeTitle', this.store.mName(m.m));
      case 'cfgst':
        return this.statusAction() + ' · ' + (this.cfgOf(m.id)?.code ?? '');
      case 'cfghist':
        return this.t('app.forecast.cfghist.title', this.cfgOf(m.id)?.code ?? '');
      default:
        return '';
    }
  });

  /** ปุ่มของหน้าต่างเปลี่ยนสถานะ : Release / Block / ปลด Block */
  protected readonly statusAction = computed(() => {
    const m = this.store.modal();
    if (m?.kind !== 'cfgst') return '';
    if (m.to === 'block') return STATUS_LABEL.block;
    return this.cfgOf(m.id)?.status === 'block' ? this.t('app.forecast.act.unblock') : STATUS_LABEL.release;
  });

  /** " · Configuration 2 ช่อง · Target 3 ค่า …" ต่อท้ายข้อความถามก่อนออก */
  protected readonly leaveParts = computed(() => {
    const p = this.store.pending();
    return [
      p.cfg ? ' · ' + (this.store.cfgId() ? this.t('app.forecast.ws.partCfg', p.cfg) : this.t('app.forecast.ws.partCfgNew')) : '',
      p.tg ? ' · ' + this.t('app.forecast.ws.partTarget', p.tg) : '',
      p.adj ? ' · ' + this.t('app.forecast.ws.partAdj', p.adj) : '',
    ].join('');
  });

  constructor() {
    // กล่องคำอธิบายหายเมื่อเลื่อน (ทุกกล่องเลื่อน : ฟังแบบ capture เหมือนต้นแบบ)
    const hide = () => this.tips.hide();
    document.addEventListener('scroll', hide, true);
    inject(DestroyRef).onDestroy(() => {
      document.removeEventListener('scroll', hide, true);
      this.tips.hide();
      this.store.dispose();
    });
    // เปิดหน้าต่างใหม่ = ช่องเหตุผลว่าง
    effect(() => {
      this.store.modal();
      this.reason.set('');
    });
    void this.store.init();
  }

  protected cfgOf(id: string) {
    return this.store.configs().find((c) => c.id === id);
  }

  /** "Release ครั้งแรก" หรือ "แก้ไข: สูตร, …" */
  protected versionNote(fields: string[]): string {
    return fields.length ? this.t('app.forecast.cfghist.edit', fields.map((f) => this.store.fieldLabel(f)).join(', ')) : this.t('app.forecast.cfghist.first');
  }

  protected backdrop(ev: MouseEvent): void {
    if (ev.target === ev.currentTarget) this.store.closeModal();
  }

  protected escape(): void {
    this.tips.hide();
    if (this.store.modal()) this.store.closeModal();
  }
}
