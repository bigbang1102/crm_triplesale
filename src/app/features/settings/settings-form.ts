import { ChangeDetectionStrategy, Component, ElementRef, Injector, afterNextRender, computed, inject, input, linkedSignal, output, signal } from '@angular/core';
import { I18n } from '@core/i18n/i18n.service';
import { TsIcon } from '@shared/ui/icon/icon';
import { ToastService } from '@shared/ui/notify/toast.service';
import { ConfigTab, ConfigTable, FieldOption, RowsTab, localText } from './settings-config.model';
import {
  FormState,
  RowValues,
  buildPayload,
  emptyRow,
  firstTabWithError,
  formKey,
  initialState,
  rowKey,
  stateFromValues,
  tabErrorCount,
  validate,
} from './settings-form.logic';
import { SettingsField } from './settings-field';

/**
 * Modal ของตาราง — แท็บมาจาก config (`table.tabs`): `form` = ช่อง input, `rows` = ตารางลูกที่เพิ่มแถวได้.
 * mode `create` (ว่าง หรือมี `values` = คัดลอกจากรายการเดิม — บอก `copyFrom` เพื่อแสดง "คัดลอกจาก …"): ยังไม่มี API บันทึก — เมื่อข้อมูลครบ `saved` ส่ง payload (รูปที่เสนอให้ backend) ออกไปให้หน้าตัดสินใจ.
 * mode `edit`: เปิดแก้ไขรายการที่มีอยู่ทันที (ช่องปลดล็อก, หัวเป็น "รหัส · ชื่อ", ปุ่มยกเลิก / บันทึก).
 * mode `view`: เปิดมาอ่านอย่างเดียว แสดงค่าจาก `values` (ช่องล็อก ไม่มีปุ่มเพิ่ม/ลบแถว); กด "แก้ไข" ใน modal นี้เองจะปลดล็อกช่อง
 * และแสดงปุ่มเพิ่ม/ลบแถวทั้งหมด (ปุ่มท้ายเป็น ยกเลิก / บันทึก เหมือนตอนสร้าง); `copy` ให้หน้าตัดสินใจ.
 */
@Component({
  selector: 'ts-settings-form',
  imports: [TsIcon, SettingsField],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { '(document:keydown.escape)': 'closed.emit()' },
  templateUrl: './settings-form.html',
  styleUrl: './settings-form.scss',
})
export class SettingsForm {
  private readonly i18n = inject(I18n);
  protected readonly t = this.i18n.t;
  private readonly toast = inject(ToastService);
  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef);
  private readonly injector = inject(Injector);

  readonly table = input.required<ConfigTable>();
  /** ชื่อที่แสดงของตาราง */
  readonly title = input.required<string>();
  /** รายการของ `Reference` ตาม key (master data) */
  readonly refOptions = input<(ref: string) => FieldOption[]>(() => []);
  readonly mode = input<'create' | 'view' | 'edit'>('create');
  /** ค่าของรายการที่เปิดดู (ชื่อฟิลด์ → ค่า) */
  readonly values = input<Record<string, string>>();
  /** รหัสของรายการต้นทางเมื่อเป็นการคัดลอก (mode `create` + `values`) */
  readonly copyFrom = input<string>();
  readonly closed = output<void>();
  readonly saved = output<Record<string, unknown>>();
  readonly copy = output<void>();

  protected readonly viewing = computed(() => this.mode() === 'view');
  /** กด "แก้ไข" ใน modal ดูแล้ว */
  private readonly editing = signal(false);
  /** ช่องถูกล็อกอยู่ (ดูอย่างเดียว) */
  protected readonly locked = computed(() => this.viewing() && !this.editing());
  protected readonly subtitle = computed(() => {
    const src = this.copyFrom();
    return src ? `${this.t('app.settings.form.copyFrom', src)} · ${this.table().name}` : this.table().name;
  });
  protected readonly heading = computed(() => {
    const v = this.values();
    return this.mode() !== 'create' && v ? `${v['code'] ?? ''} · ${v['name'] ?? ''}` : this.t('app.settings.form.title', this.title());
  });

  protected readonly state = linkedSignal<{ table: ConfigTable; values: Record<string, string> | undefined }, FormState>({
    source: () => ({ table: this.table(), values: this.values() }),
    computation: ({ table, values }) => (values ? stateFromValues(table, values) : initialState(table)),
  });
  private readonly activeId = linkedSignal<ConfigTable, string>({ source: this.table, computation: (t) => t.tabs[0]?.id ?? '' });
  protected readonly submitted = signal(false);

  protected readonly active = computed<ConfigTab | undefined>(() => this.table().tabs.find((t) => t.id === this.activeId()));
  /** ช่องที่ยังไม่ผ่านทั้งหมด (แสดงเฉพาะหลังกดบันทึก) */
  private readonly errors = computed(() => validate(this.table(), this.state()));

  constructor() {
    afterNextRender(() => this.host.nativeElement.querySelector<HTMLElement>('input:not(:disabled), select:not(:disabled)')?.focus());
  }

  protected text = (v: Parameters<typeof localText>[0]): string => localText(v, this.i18n.lang());

  protected startEdit(): void {
    this.editing.set(true);
    afterNextRender(() => this.host.nativeElement.querySelector<HTMLElement>('input:not(:disabled), select:not(:disabled)')?.focus(), { injector: this.injector });
  }

  protected select(id: string): void {
    this.activeId.set(id);
  }

  protected value(tab: string, field: string): string {
    return this.state().forms[tab]?.[field] ?? '';
  }

  protected setValue(tab: string, field: string, value: string): void {
    this.state.update((s) => ({ ...s, forms: { ...s.forms, [tab]: { ...s.forms[tab], [field]: value } } }));
  }

  protected rows(tab: RowsTab): RowValues[] {
    return this.state().rows[tab.id] ?? [];
  }

  protected setCell(tab: string, index: number, field: string, value: string): void {
    this.state.update((s) => ({ ...s, rows: { ...s.rows, [tab]: s.rows[tab].map((r, i) => (i === index ? { ...r, [field]: value } : r)) } }));
  }

  protected addRow(tab: RowsTab): void {
    this.state.update((s) => ({ ...s, rows: { ...s.rows, [tab.id]: [...(s.rows[tab.id] ?? []), emptyRow(tab.fields)] } }));
  }

  protected removeRow(tab: string, index: number): void {
    this.state.update((s) => ({ ...s, rows: { ...s.rows, [tab]: s.rows[tab].filter((_, i) => i !== index) } }));
  }

  protected bad(tab: string, field: string): boolean {
    return this.submitted() && this.errors().has(formKey(tab, field));
  }

  protected badCell(tab: string, row: number, field: string): boolean {
    return this.submitted() && this.errors().has(rowKey(tab, row, field));
  }

  protected tabErrors(tab: ConfigTab): number {
    return this.submitted() ? tabErrorCount(tab, this.errors()) : 0;
  }

  protected save(): void {
    this.submitted.set(true);
    const errors = this.errors();
    if (errors.size) {
      const tab = firstTabWithError(this.table(), errors);
      if (tab) this.activeId.set(tab.id);
      this.toast.error(this.t('app.settings.form.needFields'));
      return;
    }
    this.saved.emit(buildPayload(this.table(), this.state()));
  }
}
