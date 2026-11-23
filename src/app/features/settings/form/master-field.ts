import { ChangeDetectionStrategy, Component, DestroyRef, computed, effect, inject, input, model, signal, untracked } from '@angular/core';
import { I18n } from '@core/i18n/i18n.service';
import { TsIcon } from '@shared/ui/icon/icon';
import { ApiField, ApiOption, SettingsApi } from '../settings.api';
import { FieldValue } from './master-form.logic';

/** ที่อยู่ของช่อง reference : ใช้ถามตัวเลือกจาก API */
export interface FieldContext {
  table: string;
  /** แท็บที่ช่องอยู่ (main หรือชื่อแท็บ item) */
  section: string;
  entityId: string;
  /** id ของแถวที่กำลังแก้ (ช่องที่ `excludeSelf` ตัดแถวนี้ออกจากตัวเลือก) */
  selfId?: string | null;
}

const SEARCH_DELAY_MS = 250;
const OPTIONS_PER_PAGE = 20;

/** "รหัส · ชื่อ" ของตัวเลือก (รหัสหรือชื่ออาจว่าง) */
export const optionLabel = (o: ApiOption): string => [o.code, o.name].filter((x): x is string => !!x && !!x.trim()).join(' · ') || o.id;

/**
 * 1 ช่องของฟอร์ม Master ตามชนิด control ที่ API ส่งมา (text · textarea · number · date · select · segment · radio · checkbox ·
 * reference · file) — ฟอร์มวางช่องเหล่านี้ตามลำดับที่ API ส่งมา ไม่รู้จักตารางใดเป็นพิเศษ.
 * reference = ช่องค้นหา : แสดง "รหัส · ชื่อ" ค่าที่บันทึกคือ id ; ป้ายของค่าเดิมหาจาก options?selected=<id> (server ใส่แถวนั้นเป็นแถวแรก)
 */
@Component({
  selector: 'ts-master-field',
  imports: [TsIcon],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { '[class.compact]': 'compact()' },
  templateUrl: './master-field.html',
  styleUrl: './master-field.scss',
})
export class MasterField {
  private readonly api = inject(SettingsApi);
  protected readonly t = inject(I18n).t;

  readonly field = input.required<ApiField>();
  /** prefix ของ id (ผูก label กับช่อง) */
  readonly uid = input.required<string>();
  readonly value = model<FieldValue>(null);
  /** ข้อความผิดพลาดที่แปลงแล้ว (null = ไม่มี) */
  readonly error = input<string | null>(null);
  readonly disabled = input(false);
  readonly ctx = input<FieldContext | null>(null);
  /** อยู่ในเซลล์ของตารางแถวย่อย : ไม่โชว์ชื่อช่อง (หัวคอลัมน์บอกแล้ว — ยังอยู่ให้โปรแกรมอ่านหน้าจอ) และไม่โชว์คำแนะนำใต้ช่อง */
  readonly compact = input(false);
  /** ฟิลด์ระบบ (`control: 'readonly'`) : ค่าที่แสดง (null = ยังไม่มีค่า → ตอนสร้างแสดงข้อความ "ระบบบันทึกให้เมื่อกดบันทึก" ตอนแก้ไข/ดูแสดง –) */
  readonly systemText = input<string | null>(null);
  /** กำลังสร้างรายการใหม่ (ฟิลด์ระบบที่ยังไม่มีค่าแสดงข้อความแทน) */
  readonly creating = input(false);

  protected readonly text = computed(() => (typeof this.value() === 'string' ? (this.value() as string) : ''));
  protected readonly checked = computed(() => this.value() === true);
  /** ข้อความในช่องระบบ : ค่าจริง ถ้าไม่มี = placeholder (ตอนสร้าง) หรือ – (ตอนแก้ไข/ดู) */
  protected readonly sysValue = computed(() => this.systemText() ?? (this.creating() ? '' : '–'));
  protected readonly sysPlaceholder = computed(() => (this.creating() ? this.t('app.settings.form.sysPlaceholder') : ''));
  /** ข้อความใต้ช่องระบบ (ไอคอนกุญแจ + ข้อความ) ตามชนิด ; ข้อมูลกลาง (ใช้ร่วมทุกนิติบุคคล) ไม่มีข้อความใต้ช่อง */
  protected readonly sysNote = computed<string | null>(() => {
    switch (this.field().system) {
      case 'ENTITYGROUP':
      case 'ENTITY':
        return this.t('app.settings.form.sysScope');
      case 'UPDATED_AT':
      case 'CREATED_AT':
        return this.t('app.settings.form.sysTime');
      case 'UPDATED_BY':
      case 'CREATED_BY':
        return this.t('app.settings.form.sysUser');
      default:
        return null;
    }
  });
  protected readonly describedBy = computed(() => (this.error() ? `${this.uid()}-err` : null));

  // ───────────────────────── reference ─────────────────────────

  protected readonly open = signal(false);
  protected readonly query = signal('');
  protected readonly items = signal<ApiOption[]>([]);
  protected readonly total = signal(0);
  protected readonly active = signal(-1);
  protected readonly busy = signal(false);
  protected readonly failed = signal(false);
  private readonly labels = signal<Record<string, string>>({});
  private timer: ReturnType<typeof setTimeout> | undefined;
  private seq = 0;

  /** ป้ายของค่าที่เลือกอยู่ ('' ถ้ายังไม่เลือก/ยังหาไม่เจอ) */
  protected readonly label = computed(() => {
    const v = this.value();
    return typeof v === 'string' && v ? (this.labels()[v] ?? '') : '';
  });

  constructor() {
    inject(DestroyRef).onDestroy(() => clearTimeout(this.timer));
    // ค่าเดิมที่โหลดมาเป็น id อย่างเดียว → ขอป้าย "รหัส · ชื่อ" (ครั้งเดียวต่อ id)
    effect(() => {
      const v = this.value();
      if (this.field().control !== 'reference' || typeof v !== 'string' || !v) return;
      if (untracked(() => v in this.labels())) return;
      untracked(() => void this.resolveLabel(v));
    });
  }

  protected setText(v: string): void {
    this.value.set(v);
  }

  protected setChecked(v: boolean): void {
    this.value.set(v);
  }

  // ───────────────────────── reference : เปิด / ค้นหา / เลือก ─────────────────────────

  protected openList(): void {
    if (this.disabled()) return;
    this.open.set(true);
    this.query.set('');
    void this.load('');
  }

  protected closeList(): void {
    this.open.set(false);
    this.query.set('');
    clearTimeout(this.timer);
  }

  protected onQuery(v: string): void {
    this.query.set(v);
    this.open.set(true);
    clearTimeout(this.timer);
    this.timer = setTimeout(() => void this.load(v.trim()), SEARCH_DELAY_MS);
  }

  protected pick(o: ApiOption): void {
    this.labels.update((m) => ({ ...m, [o.id]: optionLabel(o) }));
    this.value.set(o.id);
    this.closeList();
  }

  protected clear(): void {
    this.value.set(null);
    this.closeList();
  }

  protected onKey(ev: KeyboardEvent): void {
    const n = this.items().length;
    if (ev.key === 'ArrowDown') {
      ev.preventDefault();
      if (!this.open()) this.openList();
      else this.active.set(n ? (this.active() + 1) % n : -1);
    } else if (ev.key === 'ArrowUp') {
      ev.preventDefault();
      this.active.set(n ? (this.active() - 1 + n) % n : -1);
    } else if (ev.key === 'Enter' && this.open() && this.active() >= 0) {
      ev.preventDefault();
      this.pick(this.items()[this.active()]);
    } else if (ev.key === 'Escape' && this.open()) {
      ev.stopPropagation(); // ปิดแค่รายการ ไม่ปิดทั้งฟอร์ม
      this.closeList();
    }
  }

  protected optionLabel = optionLabel;

  private async load(q: string): Promise<void> {
    const ctx = this.ctx();
    const ref = this.field().reference;
    if (!ctx || !ref) return;
    const mine = ++this.seq;
    this.busy.set(true);
    this.failed.set(false);
    try {
      const v = this.value();
      const page = await this.api.options(ctx.table, this.field().field, {
        entityId: ctx.entityId,
        section: ctx.section,
        q: q || undefined,
        selected: typeof v === 'string' && v ? v : undefined,
        excludeId: ref.excludeSelf && ctx.selfId ? ctx.selfId : undefined,
        perPage: OPTIONS_PER_PAGE,
      });
      if (mine !== this.seq) return; // มีคำค้นใหม่กว่าแล้ว
      this.items.set(page.items);
      this.total.set(page.meta.total);
      this.active.set(-1);
    } catch {
      if (mine === this.seq) {
        this.items.set([]);
        this.total.set(0);
        this.failed.set(true);
      }
    } finally {
      if (mine === this.seq) this.busy.set(false);
    }
  }

  private async resolveLabel(id: string): Promise<void> {
    const ctx = this.ctx();
    if (!ctx) return;
    this.labels.update((m) => ({ ...m, [id]: id })); // กันขอซ้ำ ; ระหว่างรอแสดง id ไปก่อน
    try {
      const page = await this.api.options(ctx.table, this.field().field, { entityId: ctx.entityId, section: ctx.section, selected: id, perPage: 1 });
      const hit = page.items.find((o) => o.id === id);
      if (hit) this.labels.update((m) => ({ ...m, [id]: optionLabel(hit) }));
    } catch {
      /* ไม่มีป้าย : แสดง id ต่อไป */
    }
  }
}
