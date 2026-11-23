import { NgComponentOutlet } from '@angular/common';
import { ChangeDetectionStrategy, Component, DestroyRef, ElementRef, Type, computed, effect, inject, input, resource, signal, untracked } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { I18n } from '@core/i18n/i18n.service';
import { PAGES } from '@core/navigation/page-registry';
import { TsIcon } from '@shared/ui/icon/icon';
import { FlowScroll } from '../../flow-scroll';
import { ApiStep } from '../../settings.api';
import { SettingsFailure, failureMessage } from '../../settings.errors';
import { SettingsStore } from '../../settings.store';
import { SvContext } from './sv-context';

/** key ของขั้น → โหลดหน้าของขั้นนั้น (แต่ละหมวดประกาศเองในโฟลเดอร์ของตน) ; ขั้นที่ไม่มีไฟล์ของตัวเองใช้รายการกลาง `SvList` */
export type SvPages = Readonly<Record<string, () => Promise<Type<unknown>>>>;

/** route ของหน้า v2 ของหมวด (ไม่มี = หมวดนี้ยังไม่มีหน้า v2 → ไม่แสดงในเมนู) */
const v2Link = (phaseKey: string): string | null => {
  const page = PAGES.find((p) => p.id === `settings-v2-${phaseKey}`);
  return page ? `/${page.route}` : null;
};

/**
 * กรอบของหน้าตั้งค่า v2 — หน้าตาเดียวกับ v1 (mockup): หัวหน้า + ความพร้อมเปิดใช้งาน + เมนูหมวด +
 * แถบขั้นตอน (วงกลม ลูกศร จุดเตือน + tip · ชิปตารางย่อยในขั้นที่เลือก) · พื้นที่เนื้อหาของแท็บ.
 * ทุกอย่าง (หมวด ขั้นตอน ชื่อ หมายเหตุ ความคืบหน้า รายการ) มาจาก DB ผ่าน SettingsStore ตัวเดียวกับหน้าหลัก — ไม่มีข้อมูลจำลอง ไม่มีโครงขั้นตอนฝังในโค้ด ;
 * เนื้อหาของแต่ละแท็บคือคอมโพเนนต์ที่หมวดส่งเข้ามา (`pages`) โดยเปลี่ยนตามขั้นที่เลือก (?tab=<stepKey>).
 */
@Component({
  selector: 'ts-sv-frame',
  imports: [NgComponentOutlet, RouterLink, TsIcon, FlowScroll],
  changeDetection: ChangeDetectionStrategy.OnPush,
  // `ts-ds` = ชุดสี Design System (src/styles/_ds-page.scss)
  host: { class: 'ts-ds', '(window:scroll)': 'tip.set(null)' },
  templateUrl: './sv-frame.html',
  styleUrl: './sv-frame.scss',
})
export class SvFrame {
  protected readonly t = inject(I18n).t;
  protected readonly ctx = inject(SvContext);
  protected readonly store = inject(SettingsStore);
  private readonly router = inject(Router);
  private readonly route = inject(ActivatedRoute);
  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef);

  readonly phase = input.required<string>();
  readonly pages = input.required<SvPages>();

  /** เมนูหมวด : หมวดที่ API ส่งมา และมีหน้า v2 */
  protected readonly menu = computed(() =>
    this.store.phases().flatMap((p) => {
      const link = v2Link(p.key);
      return link ? [{ key: p.key, title: p.title, link }] : [];
    }),
  );

  private readonly steps = computed<ApiStep[]>(() => this.store.phases().find((p) => p.key === this.phase())?.steps ?? []);
  private readonly tabParam = toSignal(this.route.queryParamMap);

  /** ขั้นที่เลือก: ?tab=<stepKey> ถ้าไม่มี/ไม่ถูกต้อง → ขั้นแรกของหมวด */
  protected readonly step = computed<ApiStep | undefined>(() => {
    const key = this.tabParam()?.get('tab');
    return this.steps().find((s) => s.stepKey === key) ?? this.steps()[0];
  });
  protected readonly stepKey = computed(() => this.step()?.stepKey ?? '');
  protected readonly isPermStep = computed(() => (this.step()?.permFields.length ?? 0) > 0);

  private readonly tableChoice = signal<string | null>(null);
  /** ตารางย่อยที่กำลังดู : ที่เลือกไว้ (ถ้าอยู่ในขั้นนี้) → ตารางแรกที่ยังว่างและไม่ใช่ optional → ตารางแรก */
  protected readonly table = computed(() => {
    const step = this.step();
    if (!step) return '';
    const choice = this.tableChoice();
    return choice && step.tables.some((t) => t.tableKey === choice) ? choice : this.store.defaultTable(step);
  });

  protected readonly page = resource({
    params: () => this.stepKey() || undefined,
    loader: ({ params }) => (this.pages()[params] ?? (() => import('./sv-list').then((m) => m.SvList)))(),
  });

  protected readonly groups = computed(() => this.store.groupsOf(this.phase()));

  /** tip ของเครื่องหมายตกใจ — fixed นอก .flow (ที่ overflow เลื่อนอยู่) จึงต้องคำนวณตำแหน่งเอง */
  protected readonly tip = signal<{ step: ApiStep; left: number; top: number } | null>(null);
  private tipTimer: ReturnType<typeof setTimeout> | undefined;

  constructor() {
    // ตารางย่อยที่เลือก → ให้หน้าของแท็บอ่าน
    effect(() => this.ctx.table.set(this.table()));
    effect(() => this.ctx.stepTitle.set(this.step()?.title ?? ''));
    // เปลี่ยนขั้นแล้วเริ่มที่ตารางแรกใหม่
    effect(() => {
      this.stepKey();
      untracked(() => this.tableChoice.set(null));
    });
    this.ctx.goStep = (key) => this.goTo(key);
    inject(DestroyRef).onDestroy(() => {
      clearTimeout(this.tipTimer);
      this.ctx.goStep = () => undefined;
    });
  }

  protected selectTable(table: string): void {
    this.tableChoice.set(table);
  }

  /** เปลี่ยนขั้น: ขั้นในหมวดนี้ → แก้ ?tab ; ขั้นของหมวดอื่น → ไป route ของหมวดนั้น */
  protected select(key: string): void {
    const step = this.store.step(key);
    if (!step) return;
    const link = step.phaseKey === this.phase() ? null : v2Link(step.phaseKey);
    void this.router.navigate(link ? [link] : [], { relativeTo: link ? undefined : this.route, queryParams: { tab: key }, replaceUrl: true });
  }

  protected showTip(ev: Event, step: ApiStep): void {
    clearTimeout(this.tipTimer);
    const r = (ev.currentTarget as HTMLElement).getBoundingClientRect();
    const width = 250;
    // ขอบซ้ายต้องไม่ล้ำแถบเมนูซ้าย: ใช้ขอบซ้ายของเนื้อหาหน้านี้เป็นขั้นต่ำ
    const min = this.host.nativeElement.getBoundingClientRect().left + 8;
    const left = Math.max(min, Math.min(r.right - width + 10, window.innerWidth - width - 8));
    this.tip.set({ step, left, top: r.bottom + 8 });
  }

  /** หน่วงเล็กน้อยเพื่อให้เมาส์ข้ามจากปุ่มไปที่ tip ได้ */
  protected hideTip(): void {
    clearTimeout(this.tipTimer);
    this.tipTimer = setTimeout(() => this.tip.set(null), 150);
  }

  protected keepTip(): void {
    clearTimeout(this.tipTimer);
  }

  protected goTo(key: string): void {
    this.tip.set(null);
    this.select(key);
  }

  protected failureText(f: SettingsFailure): string {
    return failureMessage(this.t, f);
  }
}
