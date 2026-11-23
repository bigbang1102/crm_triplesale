import { ChangeDetectionStrategy, Component, computed, inject, input, output } from '@angular/core';
import { I18n } from '@core/i18n/i18n.service';
import { ConfigField, FieldOption, isChoice, localText, parseOptions } from './settings-config.model';
import { FieldKind, fieldKind } from './settings-form.logic';

/**
 * input หนึ่งช่องของ modal — วิธีแสดงตาม `type` ของ config:
 * String/Address → text · int/long/double → number · Date/Timestamp/Time · boolean → checkbox · Upload → ไฟล์ ·
 * Select:/Radio: → radio เมื่อมี 1–2 ตัวเลือก ตั้งแต่ 3 ตัวเป็น dropdown · Reference → dropdown เสมอ (รายการจาก master data `refOptions`)
 * ใช้ทั้งในฟอร์มและเป็นเซลล์ของตารางลูก (`compact`)
 */
@Component({
  selector: 'ts-settings-field',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { '[class.compact]': 'compact()', '[class.ro]': 'locked()' },
  templateUrl: './settings-field.html',
  styleUrl: './settings-field.scss',
})
export class SettingsField {
  private readonly i18n = inject(I18n);
  protected readonly t = this.i18n.t;

  private static seq = 0;
  /** ชื่อกลุ่ม radio ที่ไม่ซ้ำกันต่อช่อง (แถวหลายแถวใช้ฟิลด์เดียวกัน) */
  protected readonly group = `sf-${++SettingsField.seq}`;

  readonly field = input.required<ConfigField>();
  readonly value = input('');
  readonly invalid = input(false);
  /** รายการของ `Reference` ตาม key (master data) */
  readonly refOptions = input<(ref: string) => FieldOption[]>(() => []);
  readonly compact = input(false);
  /** อ่านอย่างเดียว (modal ดู) */
  readonly locked = input(false);
  readonly valueChange = output<string>();

  protected readonly label = computed(() => localText(this.field().label, this.i18n.lang()));

  protected readonly options = computed<FieldOption[]>(() => {
    const f = this.field();
    if (f.type === 'Reference') return f.ref ? this.refOptions()(f.ref) : [];
    return isChoice(f) ? parseOptions(f.ref) : [];
  });

  protected readonly kind = computed<FieldKind>(() => fieldKind(this.field(), this.options().length));

  protected readonly placeholder = computed(() =>
    this.field().type === 'Reference' ? this.t('app.settings.form.selectRef', this.label()) : this.t('app.settings.form.select'),
  );

  protected set(value: string): void {
    this.valueChange.emit(value);
  }

  protected setFile(ev: Event): void {
    this.set((ev.target as HTMLInputElement).files?.[0]?.name ?? '');
  }
}
