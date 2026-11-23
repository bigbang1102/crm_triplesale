/**
 * CSV ของหน้า Lead: อ่านไฟล์นำเข้า (ตาม Template) · ตรวจแถว (ใหม่ / มีอยู่แล้ว / ซ้ำกันในไฟล์ / ไม่มีเบอร์โทร) · สร้างไฟล์ส่งออกและ Template.
 * ไม่ผูก framework.
 */
import type { ImportRow, Lead } from './leads.types';

const BOM = '﻿';
const QUOTE = '"';

/** คอลัมน์ของ Template นำเข้า (ลำดับตามนี้) */
export const IMPORT_COLUMNS = ['ชื่อ', 'นามสกุล', 'เบอร์โทร', 'อีเมล', 'ที่อยู่'] as const;

/** แตกข้อความ CSV เป็นแถว/เซลล์ (รองรับ "…" ที่มี , ขึ้นบรรทัดใหม่ และ "" ; ตัด BOM) */
export function parseCsv(text: string): string[][] {
  const src = text.startsWith(BOM) ? text.slice(1) : text;
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = '';
  let quoted = false;
  for (let i = 0; i < src.length; i++) {
    const c = src[i];
    if (quoted) {
      if (c === QUOTE && src[i + 1] === QUOTE) {
        cell += QUOTE;
        i++;
      } else if (c === QUOTE) quoted = false;
      else cell += c;
      continue;
    }
    if (c === QUOTE) quoted = true;
    else if (c === ',') {
      row.push(cell);
      cell = '';
    } else if (c === '\n' || c === '\r') {
      if (c === '\r' && src[i + 1] === '\n') i++;
      row.push(cell);
      rows.push(row);
      row = [];
      cell = '';
    } else cell += c;
  }
  if (cell !== '' || row.length) {
    row.push(cell);
    rows.push(row);
  }
  return rows.filter((r) => r.some((x) => x.trim() !== ''));
}

const digits = (v: string): string => v.replace(/\D/g, '');

/** เบอร์โทรเทียบซ้ำ: เฉพาะตัวเลข ตัด 0 หน้า / รหัสประเทศ 66 */
export function phoneKey(phone: string): string {
  const d = digits(phone);
  // "0000" is what the back end keeps for a phone that was not given: it is never used to look for a duplicate (flow 2.7)
  if (/^0+$/.test(d)) return '';
  return d.startsWith('66') && d.length > 9 ? d.slice(2) : d.replace(/^0/, '');
}

/**
 * แถวข้อมูลของไฟล์นำเข้า (แถวแรกที่มีหัวคอลัมน์ "ชื่อ" ถูกข้าม) พร้อมผลตรวจ:
 * `noPhone` ไม่มีเบอร์ · `exists` เบอร์ตรงกับ Lead ที่มีอยู่ · `duplicate` เบอร์ซ้ำกับแถวก่อนหน้าในไฟล์เดียวกัน · `new` นำเข้าได้
 */
export function checkImport(rows: readonly string[][], existing: readonly Pick<Lead, 'phone'>[]): ImportRow[] {
  const body = rows.length && rows[0][0]?.trim() === IMPORT_COLUMNS[0] ? rows.slice(1) : rows;
  const known = new Set(existing.map((l) => phoneKey(l.phone)).filter(Boolean));
  const seen = new Set<string>();
  return body.map((r, i) => {
    const [firstName = '', lastName = '', phone = '', email = '', address = ''] = r.map((x) => x.trim());
    const key = phoneKey(phone);
    let state: ImportRow['state'] = 'new';
    if (!key) state = 'noPhone';
    else if (known.has(key)) state = 'exists';
    else if (seen.has(key)) state = 'duplicate';
    if (key) seen.add(key);
    return { no: i + 1, firstName, lastName, phone, email, address, state };
  });
}

const needsQuote = (v: string): boolean => /[",\r\n]/.test(v);
const cellOf = (v: string): string => (needsQuote(v) ? `${QUOTE}${v.replace(/"/g, '""')}${QUOTE}` : v);

/** ข้อความ CSV (มี BOM เพื่อให้ Excel อ่านภาษาไทยถูก) */
export const toCsv = (header: readonly string[], rows: readonly (readonly string[])[]): string =>
  BOM + [header, ...rows].map((r) => r.map(cellOf).join(',')).join('\r\n') + '\r\n';

/** ไฟล์ Template นำเข้า (หัวคอลัมน์ + ตัวอย่าง 1 แถว) */
export const importTemplateCsv = (): string => toCsv(IMPORT_COLUMNS, [['สมชาย', 'ใจดี', '0812345678', 'somchai@example.com', 'บางรัก กรุงเทพมหานคร']]);

export const EXPORT_COLUMNS = ['วันที่สร้าง', 'เลขที่ Lead', 'สถานะ', 'ชื่อ Lead', 'เบอร์โทร', 'อีเมล', 'แหล่งที่มา', 'ที่อยู่', 'ผู้รับผิดชอบ'] as const;
