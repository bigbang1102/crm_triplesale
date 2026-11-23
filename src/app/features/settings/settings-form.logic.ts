/**
 * ตรรกะของ modal สร้าง/แก้ไข (framework-free): สถานะเริ่มต้น · ตรวจช่องบังคับ · ประกอบ payload
 * ทุกค่าเก็บเป็นสตริง (ค่าของ input) แล้วแปลงเป็นชนิดจริงตอนประกอบ payload
 */
import { ConfigField, ConfigTab, ConfigTable, isChoice, parseOptions } from './settings-config.model';

export type RowValues = Record<string, string>;

export type FieldKind = 'text' | 'number' | 'date' | 'datetime' | 'time' | 'check' | 'file' | 'radio' | 'select';

/** Select:/Radio: ที่มีตัวเลือกน้อยกว่านี้แสดงเป็น radio; ตั้งแต่นี้ขึ้นไปเป็น dropdown */
export const RADIO_BELOW = 3;

/**
 * วิธีแสดงช่อง — ตาม `type` ที่ backend ส่ง:
 * Select:/Radio: (มาแบบไหนก็ปฏิบัติเหมือนกัน) → ตัวเลือก 1–2 ตัว = radio, ตั้งแต่ 3 ตัว = dropdown · Reference → dropdown เสมอ
 */
export function fieldKind(f: ConfigField, optionCount: number): FieldKind {
  switch (f.type) {
    case 'int':
    case 'long':
    case 'double':
      return 'number';
    case 'Date':
      return 'date';
    case 'Timestamp':
      return 'datetime';
    case 'Time':
      return 'time';
    case 'boolean':
      return 'check';
    case 'Upload':
      return 'file';
    case 'Reference':
      return 'select';
    case 'Select:String':
    case 'Select:int':
    case 'Radio:String':
    case 'Radio:int':
      return optionCount >= 1 && optionCount < RADIO_BELOW ? 'radio' : 'select';
    default:
      return 'text';
  }
}

export interface FormState {
  /** แท็บ `form`: tab id → ชื่อฟิลด์ → ค่า */
  forms: Record<string, RowValues>;
  /** แท็บ `rows`: tab id → แถว */
  rows: Record<string, RowValues[]>;
}

/** ค่าเริ่มต้นของฟิลด์: `usagestatus` เริ่มที่ release ถ้ามีในตัวเลือก ที่เหลือว่าง */
export function defaultValue(f: ConfigField): string {
  if (f.name === 'usagestatus' && isChoice(f) && parseOptions(f.ref).some((o) => o.value === 'release')) return 'release';
  return '';
}

export const emptyRow = (fields: readonly ConfigField[]): RowValues => Object.fromEntries(fields.map((f) => [f.name, defaultValue(f)]));

export function initialState(table: ConfigTable): FormState {
  const state: FormState = { forms: {}, rows: {} };
  for (const tab of table.tabs) {
    if (tab.kind === 'form') state.forms[tab.id] = emptyRow(tab.fields);
    else state.rows[tab.id] = [];
  }
  return state;
}

/** สถานะเริ่มต้นจากค่าของรายการที่มีอยู่ (ชื่อฟิลด์ → ค่า): ใช้กับ modal ดู — ตารางลูกยังไม่มีข้อมูลจึงว่าง */
export function stateFromValues(table: ConfigTable, values: Readonly<Record<string, string>>): FormState {
  const state = initialState(table);
  for (const tab of table.tabs) {
    if (tab.kind !== 'form') continue;
    for (const f of tab.fields) state.forms[tab.id][f.name] = values[f.name] ?? '';
  }
  return state;
}

/**
 * ค่าของรายการใหม่ที่คัดลอกจากรายการเดิม (ตาม mockup): ล้างรหัส · ชื่อต่อท้าย `suffix` (เช่น " (สำเนา)") · สถานะเป็น draft ·
 * ฟิลด์อื่นคัดลอกมาทั้งหมด
 */
export function copyValues(values: Readonly<Record<string, string>>, suffix: string): Record<string, string> {
  return { ...values, code: '', name: `${values['name'] ?? ''}${suffix}`, usagestatus: 'draft' };
}

const isEmpty = (v: string | undefined): boolean => !v || !v.trim();

/** key ของช่องที่ยังไม่ผ่าน: `tab.field` (form) หรือ `tab[แถว].field` (rows) */
export const formKey = (tab: string, field: string): string => `${tab}.${field}`;
export const rowKey = (tab: string, row: number, field: string): string => `${tab}[${row}].${field}`;

export function validate(table: ConfigTable, state: FormState): Set<string> {
  const errors = new Set<string>();
  for (const tab of table.tabs) {
    if (tab.kind === 'form') {
      for (const f of tab.fields) if (f.required && isEmpty(state.forms[tab.id]?.[f.name])) errors.add(formKey(tab.id, f.name));
    } else {
      (state.rows[tab.id] ?? []).forEach((row, i) => {
        for (const f of tab.fields) if (f.required && isEmpty(row[f.name])) errors.add(rowKey(tab.id, i, f.name));
      });
    }
  }
  return errors;
}

/** แท็บแรก (ตามลำดับ) ที่มีช่องไม่ผ่าน */
export function firstTabWithError(table: ConfigTable, errors: ReadonlySet<string>): ConfigTab | undefined {
  return table.tabs.find((tab) => [...errors].some((k) => k.startsWith(`${tab.id}.`) || k.startsWith(`${tab.id}[`)));
}

export function tabErrorCount(tab: ConfigTab, errors: ReadonlySet<string>): number {
  return [...errors].filter((k) => k.startsWith(`${tab.id}.`) || k.startsWith(`${tab.id}[`)).length;
}

function typed(f: ConfigField, v: string): string | number | boolean | null {
  if (f.type === 'boolean') return v === 'true';
  if (isEmpty(v)) return null;
  if (f.type === 'int' || f.type === 'long' || f.type === 'double') {
    const n = Number(v);
    return Number.isFinite(n) ? n : null;
  }
  return v;
}

/**
 * payload ที่จะส่งตอนบันทึก: ฟิลด์ของแท็บ form อยู่ระดับบน, แถวของแท็บ rows อยู่ใต้ `items.<ชื่อตารางลูก>`
 * (รูปที่เสนอให้ backend — ยังไม่มี API บันทึกจริง)
 */
export function buildPayload(table: ConfigTable, state: FormState): Record<string, unknown> {
  const payload: Record<string, unknown> = {};
  const items: Record<string, unknown[]> = {};
  for (const tab of table.tabs) {
    if (tab.kind === 'form') {
      for (const f of tab.fields) payload[f.name] = typed(f, state.forms[tab.id]?.[f.name] ?? '');
    } else {
      items[tab.table] = (state.rows[tab.id] ?? []).map((row) => Object.fromEntries(tab.fields.map((f) => [f.name, typed(f, row[f.name] ?? '')])));
    }
  }
  if (Object.keys(items).length) payload['items'] = items;
  return payload;
}
