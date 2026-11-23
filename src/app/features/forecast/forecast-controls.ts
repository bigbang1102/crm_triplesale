import {
  ChangeDetectionStrategy,
  Component,
  Directive,
  ElementRef,
  Injectable,
  SecurityContext,
  afterEveryRender,
  effect,
  inject,
  input,
  output,
} from '@angular/core';
import { DomSanitizer } from '@angular/platform-browser';
import { I18n } from '@core/i18n/i18n.service';

/**
 * กล่องคำอธิบายของปุ่ม i (ต้นแบบ : `showTip()` / `hideTip()`) — กล่องเดียวทั้งหน้า วางแบบ fixed ใต้ปุ่ม (พลิกขึ้นเมื่อล้นจอ).
 * ข้อความเป็น HTML จาก app.{th,en}.json (`<b>` · `<br>` · `<span class="o">`) ผ่าน sanitizer ของ Angular ก่อนใส่.
 */
@Injectable()
export class ForecastTips {
  private readonly sanitizer = inject(DomSanitizer);
  private box: HTMLElement | null = null;

  show(anchor: HTMLElement, html: string): void {
    this.hide();
    if (!html) return;
    const box = document.createElement('div');
    box.className = 'tipbox';
    box.setAttribute('role', 'tooltip');
    box.innerHTML = this.sanitizer.sanitize(SecurityContext.HTML, html) ?? '';
    // อยู่ใน <ts-forecast> เพื่อให้สไตล์ของหน้า (ขอบเขต ts-forecast) มีผล
    const page = anchor.closest('ts-forecast');
    (page ?? document.body).appendChild(box);
    this.box = box;
    const r = anchor.getBoundingClientRect();
    const w = box.offsetWidth;
    const h = box.offsetHeight;
    // ขอบซ้ายไม่ล้ำแถบเมนูซ้ายของ shell : ใช้ขอบซ้ายของหน้านี้เป็นขั้นต่ำ
    const min = Math.max(0, page?.getBoundingClientRect().left ?? 0) + 8;
    const left = Math.min(window.innerWidth - w - 8, Math.max(min, r.left + r.width / 2 - w / 2));
    let top = r.bottom + 8;
    if (top + h > window.innerHeight - 8) top = r.top - h - 8;
    box.style.left = left + 'px';
    box.style.top = Math.max(8, top) + 'px';
  }

  hide(): void {
    this.box?.remove();
    this.box = null;
  }
}

/** ปุ่ม i ข้างหัวข้อ / ช่อง : `<ts-forecast-tip k="pg_list" />` → ข้อความ `app.forecast.tip.pg_list` */
@Component({
  selector: 'ts-forecast-tip',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `<i
    class="tip"
    tabindex="0"
    role="button"
    [attr.aria-label]="t('app.forecast.tipAria')"
    (mouseenter)="show($event)"
    (mouseleave)="tips.hide()"
    (focus)="show($event)"
    (blur)="tips.hide()"
    (click)="$event.stopPropagation(); $event.preventDefault()"
    >i</i
  >`,
})
export class ForecastTip {
  readonly k = input.required<string>();
  protected readonly t = inject(I18n).t;
  protected readonly tips = inject(ForecastTips);

  protected show(ev: Event): void {
    this.tips.show(ev.currentTarget as HTMLElement, this.t('app.forecast.tip.' + this.k()));
  }
}

/**
 * `<select [tsFcValue]="ค่าในสถานะ" (tsFcChange)="…">` — ผูก select กับสถานะของหน้าแบบทางเดียว:
 *  - ผู้ใช้เลือก → `tsFcChange` (เฉพาะเมื่อค่าต่างจากสถานะ)
 *  - หลังทุกรอบวาด ค่าใน DOM ถูกดึงกลับให้ตรงสถานะ (เช่น ผู้ใช้เลือกแล้วหน้าถามยืนยันก่อน และยังไม่เปลี่ยนจริง)
 * dropdown กลางของระบบ (open_down_select — แปลงทุก select ใน shell) วาดป้ายของมันใหม่เมื่อ option ถูกเพิ่ม/ลบ หรือได้ยิน `change`
 * ที่ select เท่านั้น : เมื่อค่าถูกดึงกลับ หรือข้อความของ option เปลี่ยน (เช่น "· ปิดแล้ว" ที่มาทีหลัง · สลับภาษา) จึงส่ง `change` แบบไม่
 * bubble ให้มันวาดใหม่ (ค่าตรงสถานะอยู่แล้ว จึงไม่ยิง `tsFcChange` ซ้ำ).
 */
@Directive({ selector: 'select[tsFcValue]', host: { '(change)': 'changed()' } })
export class ForecastSelect {
  readonly tsFcValue = input.required<string | number>();
  readonly tsFcChange = output<string>();
  private readonly el = inject<ElementRef<HTMLSelectElement>>(ElementRef).nativeElement;
  /** ข้อความของ option ทั้งหมดตอนวาดรอบก่อน */
  private texts: string | null = null;

  constructor() {
    afterEveryRender(() => this.sync());
  }

  protected changed(): void {
    const v = this.el.value;
    if (v !== String(this.tsFcValue())) this.tsFcChange.emit(v);
  }

  private sync(): void {
    const want = String(this.tsFcValue());
    let repaint = false;
    if (this.el.value !== want) {
      this.el.value = want;
      repaint = this.el.value === want;
    }
    const texts = Array.from(this.el.options, (o) => o.value + '\u0001' + o.text).join('\u0002');
    if (this.texts !== null && texts !== this.texts) repaint = true;
    this.texts = texts;
    if (repaint) this.el.dispatchEvent(new Event('change'));
  }
}

/**
 * `<input [tsFcVal]="ค่าในสถานะ">` — เขียนค่าลงช่องเมื่อสถานะเปลี่ยน แต่ไม่เขียนทับสิ่งที่ผู้ใช้กำลังพิมพ์
 * (ช่องตัวเลขที่พิมพ์ค้างเป็น "5." มีค่าเชิงตัวเลขเท่ากับสถานะ 5 → ปล่อยไว้).
 */
@Directive({ selector: 'input[tsFcVal]' })
export class ForecastInputValue {
  readonly tsFcVal = input.required<string | number | null | undefined>();

  constructor() {
    const el = inject<ElementRef<HTMLInputElement>>(ElementRef).nativeElement;
    effect(() => {
      const want = this.tsFcVal();
      const text = want == null ? '' : String(want);
      if (el.value === text) return;
      if (document.activeElement === el && el.type === 'number' && el.value !== '' && text !== '' && Number(el.value) === Number(text)) return;
      el.value = text;
    });
  }
}
