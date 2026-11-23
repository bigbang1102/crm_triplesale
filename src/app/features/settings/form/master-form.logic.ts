import { ApiField, ApiFormDef, ApiRecord, ApiSection, ApiWrite } from '../settings.api';

/**
 * ตรรกะล้วนของฟอร์ม Master (ไม่แตะ Angular — ทดสอบแยกได้) : ค่าเริ่มต้น · แปลงค่าจาก/ไปยัง API · ตรวจช่องบังคับ · ตำแหน่งของ error.
 * Server เป็นผู้ตัดสินสุดท้ายเสมอ (ความยาว/รูปแบบ/ช่วงค่า/รหัสซ้ำ/reference ผ่านด่าน ⑦–⑧ ของ API) — ฝั่งนี้ตรวจแค่ "ช่องบังคับว่าง"
 * เพื่อไม่ให้ยิงคำขอที่รู้อยู่แล้วว่าไม่ผ่าน ; รูปแบบ path ตรงกับที่ API ใช้ใน `error.details[].field`.
 */

/** ค่าของ 1 ช่องในฟอร์ม : ข้อความ (รวมตัวเลข/วันที่/ค่าตัวเลือก/id ของ reference) · boolean (checkbox) · null (reference ที่ยังไม่เลือก) */
export type FieldValue = string | boolean | null;
export type RowState = Record<string, FieldValue>;

export interface FormState {
  /** แท็บหลัก : field → ค่า */
  values: RowState;
  /** แท็บ item : sectionKey → แถว */
  items: Record<string, RowState[]>;
}

const TRUE_WORDS = new Set(['y', 'yes', 'true']);
const FALSE_WORDS = new Set(['n', 'no', 'false']);

export const isOptionList = (f: ApiField): boolean => f.control === 'select' || f.control === 'segment' || f.control === 'radio';

/** boolean ที่ใช้ checkbox (ค่าเป็น true/false จริง) — ต่างจาก boolean ที่ใช้ตัวเลือก Y/N (ค่าเป็นข้อความของตัวเลือก) */
export const isCheckbox = (f: ApiField): boolean => f.type === 'boolean' && !isOptionList(f);

/** ช่องที่ผู้ใช้กรอกเอง (ฟิลด์ระบบ `readonly` ไม่อยู่ในค่าของฟอร์มและไม่ส่งตอนบันทึก) */
export const isInput = (f: ApiField): boolean => f.control !== 'readonly';

export const mainSection = (def: ApiFormDef): ApiSection | undefined => def.sections.find((s) => s.kind === 'main');
export const itemSections = (def: ApiFormDef): ApiSection[] => def.sections.filter((s) => s.kind === 'item');

/** ค่าตัวเลือกที่แทน true / false ของช่อง boolean ที่ใช้ตัวเลือก (Y/N · yes/no · true/false) ; ไม่มี = null */
export function optionFor(f: ApiField, value: boolean): string | null {
  const words = value ? TRUE_WORDS : FALSE_WORDS;
  return f.options?.find((o) => words.has(o.value.trim().toLowerCase()))?.value ?? null;
}

/** ค่าเริ่มต้นตอนสร้าง (`defaultValue` จาก API) */
export function defaultValue(f: ApiField): FieldValue {
  if (f.control === 'file' || f.control === 'readonly') return null;
  const d = f.defaultValue;
  if (f.type === 'boolean') {
    const b = d !== undefined && d.trim().toLowerCase() === 'true';
    if (isCheckbox(f)) return b;
    return d === undefined ? '' : (optionFor(f, b) ?? '');
  }
  if (d !== undefined && d !== null) return d;
  return f.control === 'reference' ? null : '';
}

/** ค่าจาก API (หน้าแก้ไข/ดู) → ค่าในฟอร์ม */
export function fromServer(f: ApiField, v: unknown): FieldValue {
  if (f.control === 'file' || f.control === 'readonly') return null;
  if (v === null || v === undefined) return isCheckbox(f) ? false : f.control === 'reference' ? null : '';
  if (isCheckbox(f)) return v === true || String(v).toLowerCase() === 'true';
  if (f.type === 'boolean' && typeof v === 'boolean') return optionFor(f, v) ?? '';
  return typeof v === 'string' ? v : String(v);
}

/** ค่าในฟอร์ม → ค่าที่ส่ง API ; `undefined` = ไม่ส่งช่องนี้ (ไฟล์อัปโหลดผ่าน endpoint นี้ไม่ได้) */
export function toServer(f: ApiField, v: FieldValue | undefined): unknown {
  if (f.control === 'file' || f.control === 'readonly') return undefined;
  if (isCheckbox(f)) return v === true;
  if (v === null || v === undefined) return null;
  const s = typeof v === 'boolean' ? String(v) : v;
  if (s.trim() === '') return null;
  return f.control === 'number' ? s.trim() : s; // ตัวเลขส่งเป็นข้อความ : ไม่เสียความละเอียด ; server แปลงเป็น BigDecimal เอง
}

export function blankRow(section: ApiSection): RowState {
  const row: RowState = {};
  for (const f of section.fields) row[f.field] = defaultValue(f);
  return row;
}

/** ค่าเริ่มต้นของฟอร์ม : สร้าง = ค่าเริ่มต้นของแต่ละช่อง ไม่มีแถว item ; แก้ไข/ดู = ค่าของแถวที่โหลดมา */
export function initialState(def: ApiFormDef, record?: ApiRecord): FormState {
  const values: RowState = {};
  for (const f of (mainSection(def)?.fields ?? []).filter(isInput)) values[f.field] = record ? fromServer(f, record.values[f.field]) : defaultValue(f);
  const items: Record<string, RowState[]> = {};
  for (const sec of itemSections(def)) {
    items[sec.key] = (record?.items[sec.key] ?? []).map((r) => {
      const row: RowState = {};
      for (const f of sec.fields) row[f.field] = fromServer(f, r[f.field]);
      return row;
    });
  }
  return { values, items };
}

/** สถานะของรายการที่คัดลอก (วงจรสถานะใน mockup : "สำเนา = draft" — ยังไม่ใช้งานจนกว่าผู้ใช้จะตรวจแล้วเปลี่ยนเป็น release) */
export const COPY_STATUS = 'draft';
/** ต่อท้ายชื่อของรายการที่คัดลอก (mockup v33 : `cloneRec` → ชื่อ + " (สำเนา)") */
export const COPY_NAME_SUFFIX = ' (สำเนา)';

/** ชื่อของสำเนา : ชื่อเดิม + " (สำเนา)" ; ยาวเกินที่ช่องรับ (`maxLength`) → ตัดส่วนชื่อเดิมให้พอดี ไม่ตัดคำว่า (สำเนา) */
export function copyName(name: string, maxLength?: number): string {
  if (!maxLength || name.length + COPY_NAME_SUFFIX.length <= maxLength) return name + COPY_NAME_SUFFIX;
  const keep = maxLength - COPY_NAME_SUFFIX.length;
  return keep > 0 ? name.slice(0, keep).trimEnd() + COPY_NAME_SUFFIX : name.slice(0, maxLength);
}

/**
 * ค่าเริ่มต้นของฟอร์ม "คัดลอกเป็นรายการใหม่" : ค่าทุกช่องที่ผู้ใช้กรอกเองของแถวต้นฉบับ (แท็บหลัก + ทุกแถวของแท็บ item) ยกเว้น
 * - **รหัส** (`format: 'code'` — มีช่องเดียวต่อ Master) : API ห้ามรหัสซ้ำ (ในนิติบุคคลหรือทั้งระบบ นับทุกสถานะ) คัดลอกไปตรง ๆ บันทึกไม่ผ่านแน่นอน → เว้นว่างให้กรอกใหม่
 * - **ชื่อ** (`name`) : ต่อท้าย " (สำเนา)" ตาม mockup v33 (ตัดชื่อเดิมให้พอดีถ้าเกินความยาวที่ช่องรับ)
 * - **สถานะ** (`usagestatus`) : เป็น draft ถ้า Master นี้มีตัวเลือกนี้ (ไม่ให้สำเนาขึ้นสถานะใช้งานเอง)
 * - ไฟล์ · ฟิลด์ระบบ : ไม่คัดลอก (เหมือนหน้าแก้ไข — ไม่ใช่ค่าที่ผู้ใช้กรอก)
 * แถว item ไม่มี id ติดไปด้วย (`initialState` เก็บเฉพาะช่องที่ฟอร์มมี) และ body ของ POST ไม่มี id ใด ๆ → บันทึกแล้วเป็นแถวใหม่ทั้งหมด ไม่แตะแถวต้นฉบับ
 * `cleared` = ช่องที่เว้นว่างไว้ให้กรอกใหม่ (ใช้บอกผู้ใช้)
 */
export function copyState(def: ApiFormDef, record: ApiRecord): { state: FormState; cleared: ApiField[] } {
  const state = initialState(def, record);
  const cleared: ApiField[] = [];
  for (const f of (mainSection(def)?.fields ?? []).filter(isInput)) {
    if (f.format === 'code') {
      state.values[f.field] = '';
      cleared.push(f);
    } else if (f.field === 'name' && typeof state.values[f.field] === 'string' && state.values[f.field] !== '') {
      state.values[f.field] = copyName(state.values[f.field] as string, f.maxLength);
    } else if (f.field === 'usagestatus' && isOptionList(f) && f.options?.some((o) => o.value === COPY_STATUS)) {
      state.values[f.field] = COPY_STATUS;
    }
  }
  return { state, cleared };
}

/**
 * รูปแบบสำหรับเทียบว่า "ผู้ใช้แก้อะไรไว้ที่ยังไม่บันทึกไหม" : ตัดค่าว่าง (ข้อความว่าง · null · false) และแถวที่ว่างทั้งแถวทิ้ง
 * → พิมพ์แล้วลบกลับ · ติ๊กแล้วเอาออก · เพิ่มแถวเปล่า ๆ ไว้ ไม่นับว่าแก้ (ตาม mockup v30)
 */
export function dirtyKey(state: FormState): string {
  const clean = (o: unknown): unknown => {
    if (Array.isArray(o)) {
      const a = o.map(clean).filter((x) => x !== undefined);
      return a.length ? a : undefined;
    }
    if (o && typeof o === 'object') {
      const r: Record<string, unknown> = {};
      for (const k of Object.keys(o).sort()) {
        const v = clean((o as Record<string, unknown>)[k]);
        if (v !== undefined) r[k] = v;
      }
      return Object.keys(r).length ? r : undefined;
    }
    if (o === '' || o === null || o === undefined || o === false || o === 'false') return undefined;
    return String(o);
  };
  return JSON.stringify(clean(state)) ?? '';
}

/** body ของ POST / PUT (แท็บ item ส่งครบทุกแท็บ : ฝั่ง API แทนที่ทั้งแท็บ) */
export function toWrite(def: ApiFormDef, state: FormState, entityId: string): ApiWrite {
  const values: Record<string, unknown> = {};
  for (const f of mainSection(def)?.fields ?? []) {
    const v = toServer(f, state.values[f.field]);
    if (v !== undefined) values[f.field] = v;
  }
  const items: Record<string, Record<string, unknown>[]> = {};
  for (const sec of itemSections(def)) {
    items[sec.key] = (state.items[sec.key] ?? []).map((row) => {
      const out: Record<string, unknown> = {};
      for (const f of sec.fields) {
        const v = toServer(f, row[f.field]);
        if (v !== undefined) out[f.field] = v;
      }
      return out;
    });
  }
  return { entityId, values, items };
}

/** 1 กลุ่มข้อมูล (section) ของแท็บหลัก : ช่องตามลำดับที่ API ส่งมา ; `systemOnly` = มีแต่ฟิลด์ระบบ (วาดกรอบเส้นประ + "ระบบใส่ให้") */
export interface FormGroup {
  seq: number;
  title: string;
  fields: ApiField[];
  systemOnly: boolean;
}

/**
 * กลุ่มข้อมูลของแท็บ (เรียงตามเลขกลุ่ม) ; null = API ไม่ส่งผังฟอร์ม (`groups` ว่าง/ไม่มี) → วางช่องเป็นกริดเดียวแบบเดิม.
 * ช่องที่ไม่มีเลขกลุ่ม หรือเลขที่ไม่อยู่ใน groups ไปต่อท้ายกลุ่มแรก (กันช่องหายถ้า API กับผังไม่ตรงกัน)
 */
export function groupsOf(section: ApiSection | undefined): FormGroup[] | null {
  const groups = section?.groups;
  if (!section || !groups?.length) return null;
  const known = new Set(groups.map((g) => g.seq));
  const out: FormGroup[] = groups.map((g) => ({ seq: g.seq, title: g.title, fields: section.fields.filter((f) => f.group === g.seq), systemOnly: false }));
  out[0].fields.push(...section.fields.filter((f) => f.group === undefined || !known.has(f.group)));
  for (const g of out) g.systemOnly = g.fields.length > 0 && g.fields.every((f) => !isInput(f));
  return out.filter((g) => g.fields.length);
}

/** ตำแหน่งของช่อง ตรงกับ `error.details[].field` ของ API */
export const mainPath = (field: string): string => `values.${field}`;
export const itemPath = (section: string, row: number, field: string): string => `items.${section}[${row}].${field}`;

const empty = (v: FieldValue | undefined): boolean => v === null || v === undefined || (typeof v === 'string' && v.trim() === '');

/** ช่องบังคับที่ยังว่าง : path → 'required' (checkbox/ไฟล์ไม่ตรวจ — false เป็นค่าที่ใช้ได้, ไฟล์ส่งผ่านฟอร์มนี้ไม่ได้) */
export function missingRequired(def: ApiFormDef, state: FormState): Record<string, string> {
  const out: Record<string, string> = {};
  const needs = (f: ApiField) => f.required && f.control !== 'file' && f.control !== 'readonly' && !isCheckbox(f);
  for (const f of mainSection(def)?.fields ?? []) if (needs(f) && empty(state.values[f.field])) out[mainPath(f.field)] = 'required';
  for (const sec of itemSections(def)) {
    (state.items[sec.key] ?? []).forEach((row, i) => {
      for (const f of sec.fields) if (needs(f) && empty(row[f.field])) out[itemPath(sec.key, i, f.field)] = 'required';
    });
  }
  return out;
}

export interface PlacedErrors {
  /** path → ข้อความจาก API (ช่องเดียวอาจผิดหลายข้อ) */
  byPath: Record<string, string[]>;
  /** ข้อผิดพลาดที่ไม่ผูกกับช่อง (เช่น entityId) */
  loose: string[];
}

/** `error.details[]` ของ 422 → จัดตามช่อง */
export function placeErrors(details: { field: string; message: string }[]): PlacedErrors {
  const out: PlacedErrors = { byPath: {}, loose: [] };
  for (const d of details) {
    if (d.field.startsWith('values.') || d.field.startsWith('items.')) (out.byPath[d.field] ??= []).push(d.message);
    else out.loose.push(d.message);
  }
  return out;
}
