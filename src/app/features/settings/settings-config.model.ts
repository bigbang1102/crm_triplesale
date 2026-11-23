/**
 * สัญญาของ config หน้าตั้งค่า (Configuration & Master data) — รูปเดียวกับที่ backend จะส่งมาจาก `GET /config/settings`
 * (ตัวอย่างจริงอยู่ที่ settings.config.response.json = docs/integration/settings-config.json) ไม่มีข้อมูลแถวจริง
 * ฟิลด์ของแต่ละตารางไม่อยู่ในก้อนนี้ — ตอนกดสร้าง/ดู/แก้ไขจึงยิง `GET /config/settings/tables/{name}` (ตัวอย่าง settings.tables.response.json = docs/integration/settings-tables.json)
 *
 * ต้นไม้ `nodes`: tab (phase) → subtab (step) → ตาราง; step ที่มีตารางเดียวใส่ `table` ที่ step เลย, หลายตารางใส่ `children`.
 * ตารางหนึ่งมี popup สร้าง/แก้ไขเป็นแท็บ: `form` (ช่อง input) หรือ `rows` (ตารางลูกที่เพิ่มแถวได้).
 * ฟิลด์ทุกชนิดใช้ shape เดียวกัน (`ConfigField`); `type` ตามเอกสาร Excel ของ backend.
 */

export type Lang = 'th' | 'en';

/** ข้อความสองภาษา — `en` ไม่มีให้ใช้ `th` แทน */
export interface LocalText {
  th: string;
  en?: string;
}

export type FieldType =
  | 'String'
  | 'int'
  | 'long'
  | 'double'
  | 'Timestamp'
  | 'Time'
  | 'boolean'
  | 'Address'
  | 'Date'
  | 'Upload'
  | 'Select:String'
  | 'Select:int'
  | 'Radio:String'
  | 'Radio:int'
  | 'Reference';

export interface ConfigField {
  /** ชื่อฟิลด์ใน backend (ไม่ซ้ำในแท็บเดียวกัน) */
  name: string;
  label: LocalText;
  type: FieldType;
  /** มี = ช่องบังคับ (แสดงดอกจัน) */
  required?: true;
  /**
   * `Select:` / `Radio:` → ตัวเลือกเป็นสตริง `ข้อความ,ค่า|ข้อความ,ค่า` (ใช้ `parseOptions`)
   * `Reference` → key ของ master data ที่ต้องยิง API ไปเอารายการ (ชื่อตารางของ backend)
   */
  ref?: string;
}

export interface FormTab {
  id: string;
  kind: 'form';
  name: LocalText;
  fields: ConfigField[];
}

export interface RowsTab {
  id: string;
  kind: 'rows';
  name: LocalText;
  /** ชื่อตารางลูกใน backend */
  table: string;
  fields: ConfigField[];
}

export type ConfigTab = FormTab | RowsTab;

/** ตารางในต้นไม้ `nodes` — พอแสดงรายการได้ ยังไม่มีแท็บ/ฟิลด์ของ popup (ขอเพิ่มทีหลังด้วย `GET /config/settings/tables/{name}`) */
export interface ConfigTableSummary {
  /** ชื่อตารางใน backend (ไม่ซ้ำทั้งระบบ) — ใช้เป็น key ของ `deps` ไม่ได้ (deps ชี้ step) แต่ใช้เป็น `ref` ของฟิลด์อื่น */
  name: string;
  /** `system` = ข้อมูลกลางไม่ผูกนิติบุคคล */
  scope: 'system' | 'entity';
  /** ฟิลด์ (ของแท็บ form) ที่แสดงเป็นคอลัมน์ในรายการ นอกเหนือจากรหัส / ชื่อ / สถานะ — ส่งนิยามฟิลด์มาเลย รายการจะได้ไม่ต้องรอคำตอบของตาราง */
  listColumns: ConfigField[];
}

/** คำตอบของ `GET /config/settings/tables/{name}` — แท็บ/ฟิลด์ของ popup สร้าง/ดู/แก้ไข */
export interface ConfigTable {
  name: string;
  tabs: ConfigTab[];
}

export interface ConfigNode {
  id: string;
  name: LocalText;
  /** step: ต้องเสร็จก่อนเปิดใช้งานระบบ */
  goLive?: boolean;
  /** step: `id` ของ step ที่ต้องมีข้อมูลก่อน */
  deps?: string[];
  note?: LocalText;
  /** ตารางที่ปล่อยว่างได้ */
  optional?: true;
  /** step ที่ตั้งเป็นฟิลด์ของ businessentity ไม่ใช่รายการ */
  permFields?: string[];
  table?: ConfigTableSummary;
  children?: ConfigNode[];
}

export interface SettingsConfigResponse {
  /** เปลี่ยนเมื่อ config เปลี่ยน — ใช้เทียบ cache */
  version: string;
  nodes: ConfigNode[];
}

// ---- รูปที่หน้านี้ใช้ (แบนจากต้นไม้) -----------------------------------------------------------------------------

export interface SettingsPhase {
  id: string;
  name: LocalText;
}

export interface SettingsStep {
  id: string;
  phase: string;
  name: LocalText;
  /** ตารางของ step ตามลำดับที่ต้องกรอก (ว่างเมื่อเป็น step `permFields`) */
  tables: string[];
  optional: string[];
  goLive: boolean;
  deps: string[];
  note?: LocalText;
  permFields?: string[];
}

export interface SettingsModel {
  version: string;
  phases: SettingsPhase[];
  steps: SettingsStep[];
  tables: Record<string, ConfigTableSummary>;
  /** ชื่อที่แสดงของตาราง (ชื่อ node) */
  tableNames: Record<string, LocalText>;
}

/** แบนต้นไม้ `nodes` เป็น phases / steps / tables ที่หน้าใช้ */
export function buildSettingsModel(response: SettingsConfigResponse): SettingsModel {
  const model: SettingsModel = { version: response.version, phases: [], steps: [], tables: {}, tableNames: {} };
  for (const phase of response.nodes) {
    model.phases.push({ id: phase.id, name: phase.name });
    for (const node of phase.children ?? []) {
      const step: SettingsStep = {
        id: node.id,
        phase: phase.id,
        name: node.name,
        tables: [],
        optional: [],
        goLive: node.goLive === true,
        deps: node.deps ?? [],
        note: node.note,
        permFields: node.permFields,
      };
      const leaves = node.table ? [node] : (node.children ?? []);
      for (const leaf of leaves) {
        if (!leaf.table) continue;
        step.tables.push(leaf.table.name);
        if (leaf.optional) step.optional.push(leaf.table.name);
        model.tables[leaf.table.name] = leaf.table;
        model.tableNames[leaf.table.name] = leaf.name;
      }
      model.steps.push(step);
    }
  }
  return model;
}

export const localText = (text: LocalText | undefined, lang: Lang): string => (text ? (text[lang] || text.th) : '');

export interface FieldOption {
  label: string;
  value: string;
}

/** แตก `ข้อความ,ค่า|ข้อความ,ค่า` (ค่าคือส่วนหลังเครื่องหมาย , ตัวสุดท้ายของแต่ละคู่) */
export function parseOptions(ref: string | undefined): FieldOption[] {
  if (!ref) return [];
  return ref
    .split('|')
    .filter(Boolean)
    .map((pair) => {
      const i = pair.lastIndexOf(',');
      return i < 0 ? { label: pair, value: pair } : { label: pair.slice(0, i), value: pair.slice(i + 1) };
    });
}

export const isChoice = (f: ConfigField): boolean => f.type.startsWith('Select:') || f.type.startsWith('Radio:');

/** ฟิลด์ของแท็บ form ตัวแรก (ข้อมูลหลัก) */
export function mainFields(table: ConfigTable | undefined): ConfigField[] {
  return table?.tabs.find((t): t is FormTab => t.kind === 'form')?.fields ?? [];
}

const isText = (v: unknown): v is string => typeof v === 'string' && v.trim() !== '';
const isObject = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);
const isLocal = (v: unknown): boolean => isObject(v) && isText(v['th']);

/**
 * Why a structure of the page (the tree of phases → steps → tables, `GET /config/settings`) cannot be used, or `undefined` when it can: every
 * phase and step needs an id (once) and a Thai name, every table a name (once) and a scope, and a step may only depend on a step that exists.
 */
export function settingsConfigProblem(doc: unknown): string | undefined {
  if (!isObject(doc) || !isText(doc['version']) || !Array.isArray(doc['nodes']) || doc['nodes'].length === 0) return 'needs a version and a list of phases';
  const steps: string[] = [];
  const deps: string[] = [];
  const tables: string[] = [];
  for (const phase of doc['nodes'] as unknown[]) {
    if (!isObject(phase) || !isText(phase['id']) || !isLocal(phase['name']) || !Array.isArray(phase['children'])) return 'every phase needs an id, a name (th) and a list of steps';
    for (const step of phase['children'] as unknown[]) {
      if (!isObject(step) || !isText(step['id']) || !isLocal(step['name'])) return 'every step needs an id and a name (th)';
      steps.push(step['id']);
      if (Array.isArray(step['deps'])) deps.push(...(step['deps'] as string[]));
      const leaves = isObject(step['table']) ? [step] : Array.isArray(step['children']) ? (step['children'] as unknown[]) : [];
      for (const leaf of leaves) {
        const table = isObject(leaf) ? leaf['table'] : undefined;
        if (!isObject(table) || !isText(table['name']) || !['system', 'entity'].includes(String(table['scope'])) || !Array.isArray(table['listColumns'])) return 'every table needs a name, a scope (system / entity) and listColumns';
        tables.push(table['name']);
      }
    }
  }
  if (new Set(steps).size !== steps.length) return 'a step id is repeated';
  if (new Set(tables).size !== tables.length) return 'a table name is repeated';
  const missing = deps.find((d) => !steps.includes(d));
  return missing ? `a step depends on "${missing}", which is not a step` : undefined;
}

/** Why the definitions of the tables (`GET /config/settings/tables/{name}`) cannot be used, or `undefined`: each needs its name as key and tabs with fields */
export function settingsTablesProblem(doc: unknown): string | undefined {
  if (!isObject(doc) || Object.keys(doc).length === 0) return 'needs a table per name';
  for (const [key, table] of Object.entries(doc)) {
    if (!isObject(table) || table['name'] !== key || !Array.isArray(table['tabs'])) return `table "${key}" needs "name" (= its key) and "tabs"`;
    for (const tab of table['tabs'] as unknown[]) {
      if (!isObject(tab) || !isText(tab['id']) || !['form', 'rows'].includes(String(tab['kind'])) || !isLocal(tab['name']) || !Array.isArray(tab['fields'])) return `a tab of "${key}" needs id, kind (form / rows), name (th) and fields`;
      if (!(tab['fields'] as unknown[]).every((f) => isObject(f) && isText(f['name']) && isLocal(f['label']) && isText(f['type']))) return `a field of "${key}" needs name, label (th) and type`;
    }
  }
  return undefined;
}
