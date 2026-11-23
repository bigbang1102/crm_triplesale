/**
 * ข้อมูลจำลองของหน้าตั้งค่า (framework-free) — เฉพาะตัวอย่างพอให้เห็นสถานะ "เสร็จ/ยังไม่เสร็จ" ของแต่ละขั้น
 * ข้อมูลจริงรอ API master data (ยังไม่มีสัญญา)
 */
import { reference } from '@core/mock/reference';
import { ConfigTableSummary } from './settings-config.model';

export type UsageStatus = 'release' | 'draft' | 'block';

export interface SettingsRow {
  id: string;
  code: string;
  name: string;
  status: UsageStatus;
  /** จำนวนรายการอื่นที่อ้างถึง */
  used: number;
  /** ค่าฟิลด์อื่น ๆ ตามนิยามใน settings.tables.ts (ref = id ของแถวที่อ้างถึง) */
  values?: Readonly<Record<string, string>>;
}

type Scope = 'SYS' | string;

const row = (code: string, name: string, status: UsageStatus = 'release', used = 0, values?: Record<string, string>): SettingsRow => ({ id: `${code}`, code, name, status, used, values });

const isRecord = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);
const isSettingsRow = (r: unknown): boolean =>
  isRecord(r) &&
  ['id', 'code', 'name'].every((k) => typeof r[k] === 'string') &&
  ['release', 'draft', 'block'].includes(String(r['status'])) &&
  typeof r['used'] === 'number' &&
  (r['values'] === undefined || (isRecord(r['values']) && Object.values(r['values']).every((v) => typeof v === 'string')));
/** a document of rows: scope → table → rows; the rows of a table have different `values`, so the "same fields as the first row" rule does not apply */
const rowsDocumentFits = (doc: unknown): boolean => isRecord(doc) && Object.values(doc).every((tables) => isRecord(tables) && Object.values(tables).every((rows) => Array.isArray(rows) && rows.every(isSettingsRow)));

const SEED: Readonly<Record<Scope, Readonly<Record<string, readonly SettingsRow[]>>>> = reference('settings.rows', {
  SYS: {
    entitygroup: [row('EG01', 'SUN GROUP', 'release', 2)],
    businessentity: [row('SUN', 'SUN GATEWAY', 'release', 9), row('GGW', 'GGW', 'release', 1)],
    systemname: [row('TS', 'Triple Sales', 'release', 3), row('ERP', 'RED ERP', 'draft')],
    country: [row('TH', 'ไทย', 'release', 2)],
    province: [row('10', 'กรุงเทพมหานคร'), row('12', 'นนทบุรี'), row('20', 'ชลบุรี')],
  },
  SUN: {
    currency: [row('THB', 'บาท', 'release', 1)],
    communicationtype: [row('TEL', 'โทรศัพท์'), row('LINE', 'LINE'), row('EMAIL', 'อีเมล')],
    branch: [row('BKK', 'กรุงเทพฯ', 'release', 4, { address: '99/9 ถ.รัชดาภิเษก', tel: '02-000-0000' }), row('CNX', 'เชียงใหม่', 'draft', 0, { address: '12 ถ.นิมมานเหมินท์' })],
    department: [row('D01', 'ฝ่ายขาย'), row('D02', 'ฝ่ายบริการ')],
    positionorganize: [row('ORG1', 'สำนักงานขาย', 'release', 0, { departmenttype: 'S' })],
  },
  GGW: {},
}, undefined, rowsDocumentFits);

/** แถวของตาราง — ตารางที่ `scope: 'system'` ไม่ผูกนิติบุคคล (ใช้ร่วมกันทุกนิติบุคคล) */
export function settingsRows(entity: string, table: string, scope: ConfigTableSummary['scope'] = 'entity'): readonly SettingsRow[] {
  const key: Scope = scope === 'system' ? 'SYS' : entity;
  return SEED[key]?.[table] ?? [];
}
