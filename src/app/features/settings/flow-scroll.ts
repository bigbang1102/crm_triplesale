import { ChangeDetectionStrategy, Component, DestroyRef, ElementRef, afterNextRender, effect, inject, input, output, signal, viewChild } from '@angular/core';
import { I18n } from '@core/i18n/i18n.service';
import { TsIcon } from '@shared/ui/icon/icon';

/**
 * แถบขั้นตอนที่เลื่อนแนวนอนได้ (หน้า Configuration & Master data) — ตาม mockup master-setup final (30-10-2026) :
 * ล้นความกว้างแล้วมีปุ่มกลม ‹ › ที่ขอบ + เฟดขอบ (แสดงเฉพาะด้านที่ยังมีเนื้อหาให้เลื่อน) ; เนื้อหา (กลุ่มขั้นตอน) ฉายเข้ามาจากหน้า.
 * `selected` = stepKey ของขั้นที่เลือก (คลาส `.step.sel` ที่หน้าใส่) — เปลี่ยนแล้วถ้าส่วนหัวของขั้นนั้นอยู่นอกจอจะเลื่อนมาให้เห็น (เช่นกดจาก tip "ต้องตั้งค่าก่อน").
 */
@Component({
  selector: 'ts-flow-scroll',
  imports: [TsIcon],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { '(window:resize)': 'update()' },
  template: `
    <span class="fade l" [hidden]="!canPrev()"></span>
    <span class="fade r" [hidden]="!canNext()"></span>
    <button type="button" class="fnav l" [hidden]="!canPrev()" [attr.aria-label]="t('app.settings.flow.prev')" (click)="page(-1)">
      <ts-icon name="chevronLeft" [size]="18" />
    </button>
    <button type="button" class="fnav r" [hidden]="!canNext()" [attr.aria-label]="t('app.settings.flow.next')" (click)="page(1)">
      <ts-icon name="chevronRight" [size]="18" />
    </button>
    <div class="flow" #flow (scroll)="onScroll()"><ng-content /></div>
  `,
  styleUrl: './flow-scroll.scss',
})
export class FlowScroll {
  protected readonly t = inject(I18n).t;
  private readonly flow = viewChild.required<ElementRef<HTMLElement>>('flow');

  /** stepKey ของขั้นที่เลือก */
  readonly selected = input<string | null | undefined>(null);
  /** เลื่อนเอง (หน้าใช้ปิด tip ที่ลอยอยู่) */
  readonly scrolled = output<void>();

  protected readonly canPrev = signal(false);
  protected readonly canNext = signal(false);
  private revealTimer: ReturnType<typeof setTimeout> | undefined;

  constructor() {
    const destroyRef = inject(DestroyRef);
    afterNextRender(() => {
      const el = this.flow().nativeElement;
      // เนื้อหาเปลี่ยน (ขั้นเพิ่ม/ลด · ชิปตารางย่อยโผล่) หรือกรอบเปลี่ยนขนาด → คำนวณว่ายังเลื่อนได้ด้านไหน
      const ro = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(() => this.update());
      ro?.observe(el);
      const mo = new MutationObserver(() => this.update());
      mo.observe(el, { childList: true, subtree: true, characterData: true });
      destroyRef.onDestroy(() => {
        ro?.disconnect();
        mo.disconnect();
      });
      this.update();
    });

    // เลือกขั้นใหม่ → ถ้าส่วนหัวของขั้นอยู่นอกจอ เลื่อนมาให้เห็น
    effect(() => {
      this.selected();
      clearTimeout(this.revealTimer);
      this.revealTimer = setTimeout(() => this.reveal());
    });
    destroyRef.onDestroy(() => clearTimeout(this.revealTimer));
  }

  protected update(): void {
    const el = this.flow().nativeElement;
    this.canPrev.set(el.scrollLeft > 4);
    this.canNext.set(el.scrollLeft + el.clientWidth < el.scrollWidth - 4);
  }

  protected onScroll(): void {
    this.update();
    this.scrolled.emit();
  }

  protected page(dir: -1 | 1): void {
    const el = this.flow().nativeElement;
    el.scrollBy({ left: dir * Math.max(240, el.clientWidth * 0.7), behavior: 'smooth' });
  }

  private reveal(): void {
    const el = this.flow().nativeElement;
    const head = el.querySelector<HTMLElement>('.step.sel .sh');
    if (!head) return;
    const f = el.getBoundingClientRect();
    const h = head.getBoundingClientRect();
    if (h.left < f.left || h.right > f.right) el.scrollTo({ left: Math.max(0, el.scrollLeft + h.left - f.left - 40), behavior: 'smooth' });
  }
}
