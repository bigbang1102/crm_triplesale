import { ChangeDetectionStrategy, Component, DestroyRef, ElementRef, computed, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { I18n } from '@core/i18n/i18n.service';
import { TsIcon } from '@shared/ui/icon/icon';
import { FlowScroll } from './flow-scroll';
import { MasterList } from './list/master-list';
import { ApiStep } from './settings.api';
import { SettingsFailure, failureMessage } from './settings.errors';
import { SettingsStore } from './settings.store';

/**
 * Configuration & Master data — โครงตาม mockup master-setup final (30-10-2026):
 * แท็บหมวด → แถบขั้นตอน (ขั้นที่ตั้งได้ทันที / ขั้นที่ต้องมีข้อมูลอื่นก่อน) → รายการของตาราง.
 *
 * ข้อมูลทั้งหมดมาจาก DB ผ่าน API ของโปรเจกต์ configmaster (settings.store.ts / list/master-list.ts) — ไม่มีข้อมูลจำลอง ไม่มีโครงขั้นตอนฝังในโค้ด :
 * หมวด ขั้นตอน ชื่อ หมายเหตุ ลำดับ ขั้นที่ต้องมีก่อน ตารางในแต่ละขั้น ความคืบหน้า และรายการ ล้วนมาจาก API.
 * ต้องรัน configmaster (ไม่ว่า `mock` ใน app-config จะเป็นอะไร) ; ไม่มี API = แสดงข้อความผิดพลาดพร้อมปุ่มลองใหม่.
 * ฟอร์ม สร้าง/แก้ไข/ดู/คัดลอกเป็นรายการใหม่ และปุ่มลบ ต่อแล้ว ; นำเข้า Excel ยังไม่ทำ ; ยังไม่เช็กสิทธิ์ของเมนู (รอกำหนด key).
 */
@Component({
  selector: 'ts-settings',
  imports: [RouterLink, TsIcon, MasterList, FlowScroll],
  changeDetection: ChangeDetectionStrategy.OnPush,
  // `ts-ds` = ชุดสี Design System (src/styles/_ds-page.scss)
  host: { class: 'ts-ds', '(window:scroll)': 'tip.set(null)' },
  templateUrl: './settings.html',
  styleUrl: './settings.scss',
})
export class Settings {
  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef);
  protected readonly t = inject(I18n).t;
  protected readonly store = inject(SettingsStore);

  // ───────────────────────── ที่ผู้ใช้เลือก (ค่าเริ่มต้นเป็นตัวแรกใน DB) ─────────────────────────

  private readonly chosenPhase = signal<string | null>(null);
  private readonly chosenStep = signal<string | null>(null);
  private readonly chosenTable = signal<string | null>(null);

  /** หมวดที่เลือก : ที่เลือกไว้ (ถ้ายังมี) ไม่งั้นหมวดแรก */
  protected readonly phase = computed(() => {
    const phases = this.store.phases();
    const p = this.chosenPhase();
    return p && phases.some((x) => x.key === p) ? p : (phases[0]?.key ?? '');
  });

  /** ขั้นที่เลือก : ที่เลือกไว้ (ถ้าอยู่ในหมวดนี้) ไม่งั้นขั้นแรกของหมวด */
  protected readonly step = computed<ApiStep | undefined>(() => {
    const inPhase = this.store.phases().find((p) => p.key === this.phase())?.steps ?? [];
    return inPhase.find((s) => s.stepKey === this.chosenStep()) ?? inPhase[0];
  });

  /** ตารางที่กำลังดู : ที่เลือกไว้ (ถ้าอยู่ในขั้นนี้) → ตารางแรกที่ยังว่างและไม่ใช่ optional → ตารางแรก */
  protected readonly table = computed(() => {
    const step = this.step();
    if (!step) return '';
    const tab = this.chosenTable();
    return tab && step.tables.some((t) => t.tableKey === tab) ? tab : this.store.defaultTable(step);
  });

  /** ขั้นสิทธิ์เริ่มต้นตั้งเป็นฟิลด์ของนิติบุคคล ไม่ใช่รายการ → ไม่มีรายการให้ดึง */
  protected readonly isPermStep = computed(() => (this.step()?.permFields.length ?? 0) > 0);

  protected readonly groups = computed(() => this.store.groupsOf(this.phase()));

  /** tip ของเครื่องหมายตกใจ — เรนเดอร์ครั้งเดียวแบบ fixed นอก .flow (ที่ overflow เลื่อนอยู่) จึงต้องคำนวณตำแหน่งเอง */
  protected readonly tip = signal<{ step: ApiStep; left: number; top: number } | null>(null);
  private tipTimer: ReturnType<typeof setTimeout> | undefined;

  constructor() {
    inject(DestroyRef).onDestroy(() => clearTimeout(this.tipTimer));
  }

  protected selectPhase(key: string): void {
    this.chosenPhase.set(key);
    this.chosenStep.set(null);
    this.chosenTable.set(null);
  }

  protected selectStep(key: string): void {
    const step = this.store.step(key);
    if (step) this.chosenPhase.set(step.phaseKey);
    this.chosenStep.set(key);
    this.chosenTable.set(null);
  }

  protected selectTable(table: string): void {
    this.chosenTable.set(table);
  }

  protected setEntity(id: string): void {
    this.store.setEntity(id);
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
    this.selectStep(key);
  }

  /** ข้อความของความผิดพลาดที่แปลงแล้ว (key + {0}) */
  protected failureText(f: SettingsFailure): string {
    return failureMessage(this.t, f);
  }
}
