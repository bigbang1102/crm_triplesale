#!/usr/bin/env node
/**
 * gen-master-schema — ออกแบบตาราง Configuration & Master data จาก 3 ไฟล์ต้นทาง
 *
 *   1. master-setup final mock up *.html   (TABLES / ST / TNAME / TLV / SYS  = โครงข้อมูลที่หน้าจอใช้จริง)
 *   2. Triple_Sales_Config_MasterData_Spec_*.xlsx  ชีต 8_Field_Spec  (ชนิด/ความยาว/ช่วงค่า ของทุกฟิลด์)
 *   3. TripleSales_MasterData_SetupFlow.drawio     (ลำดับการคีย์ + "ต้องมีก่อน" — ใช้ตรวจเทียบกับ ST ในข้อ 1)
 *
 * ผลลัพธ์ (docs/masterservice/):
 *   01-schema.sql                 DDL PostgreSQL (ตาราง + ข้อจำกัด + FK + index + view + ฟังก์ชัน)
 *   02-setup-metadata.sql         ข้อมูลตั้งต้นของตาราง setup_* / master_* (ลำดับ step, ต้องมีก่อน, ทะเบียนตาราง, ทะเบียน FK)
 *   er-by-phase.md                ER diagram (Mermaid) แยกตามหมวด 0–5
 *   master-model.generated.json   โมเดลที่ normalize แล้ว (ใช้ต่อกับ API / ฝั่ง Angular ได้)
 *   README.md                     แทนที่เฉพาะบล็อก <!-- gen:... --> (ส่วนที่เหลือเขียนมือ)
 *
 * ใช้:  node tools/gen-master-schema.mjs [--src "<โฟลเดอร์ไฟล์ต้นทาง>"] [--html f] [--xlsx f] [--drawio f]
 * ไฟล์ต้นทางเป็นอ่านอย่างเดียว — สคริปต์ไม่แก้ไฟล์ต้นทาง
 */
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import zlib from 'node:zlib';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const OUT = path.join(ROOT, 'docs', 'masterservice');
const argv = Object.fromEntries(
  process.argv
    .slice(2)
    .map((a, i, all) => (a.startsWith('--') ? [a.slice(2), all[i + 1]] : null))
    .filter(Boolean),
);
const SRC = argv.src ?? 'C:/Krittikorn/ai/demo/New folder';
const HTML_FILE = argv.html ?? path.join(SRC, 'master-setup final mock up 30-10-2026.html');
const XLSX_FILE = argv.xlsx ?? path.join(SRC, 'Triple_Sales_Config_MasterData_Spec_v1.2_FeatureList1.3.xlsx');
const DRAWIO_FILE = argv.drawio ?? path.join(SRC, 'TripleSales_MasterData_SetupFlow.drawio');
const SCHEMA = 'masterdata';
/** ชื่อตารางจริงทุกตารางที่สร้างใน 01-schema.sql = TABLE_PREFIX + ชื่อใน mockup (ชื่อใน mockup/API/metadata ไม่มี prefix) */
const TABLE_PREFIX = 'con_master_';
const P = (name) => TABLE_PREFIX + name;
/** ตาราง metadata (ไม่มีใน mockup) — ตัดคำ master ออกจากชื่อ (master_table_registry → table_registry, master_ref → table_ref) เพื่อไม่ให้ซ้ำกับ prefix */
const META = {
  phase: P('setup_phase'),
  step: P('setup_step'),
  stepTable: P('setup_step_table'),
  dep: P('setup_step_dependency'),
  registry: P('table_registry'),
  ref: P('table_ref'),
};

const problems = []; // ข้อผิดพลาดที่ทำให้ DDL ไม่น่าเชื่อถือ → ต้องหยุด
const notes = []; // ข้อสังเกตที่ไม่ใช่ข้อผิดพลาด
const fail = (m) => problems.push(m);

/* ───────────────────────── 1) HTML mockup ───────────────────────── */
function loadMockup() {
  const html = fs.readFileSync(HTML_FILE, 'utf8');
  const tStart = html.indexOf('var TABLES=');
  if (tStart < 0) throw new Error('ไม่พบ var TABLES= ใน HTML');
  const tEnd = html.indexOf('\n', tStart);
  const TABLES = JSON.parse(html.slice(tStart + 'var TABLES='.length, tEnd).replace(/;\s*$/, ''));
  const a = html.indexOf('var PH=');
  const b = html.indexOf('var ENTS=');
  if (a < 0 || b < 0) throw new Error('ไม่พบบล็อก PH/ST/TLV/TNAME/SYS ใน HTML');
  const ctx = {};
  vm.createContext(ctx);
  // บล็อกนี้มีแต่ค่าคงที่ (ไม่แตะ DOM) — รันใน sandbox ที่ไม่มี global อื่น
  vm.runInContext(html.slice(a, b).replace(/\bvar /g, 'globalThis.'), ctx, { timeout: 2000 });
  const { PH, ST, TLV, TNAME, SYS } = ctx;
  const steps = ST.map((s, i) => ({
    no: i + 1,
    code: s[0],
    phase: s[1],
    name: s[2],
    tables: s[3],
    who: s[4],
    golive: !!s[5],
    deps: s[6],
    note: s[7] || '',
    optional: s[8] || [],
    permFields: s[9] || null, // ≠ null → step "สิทธิ์เริ่มต้น" (แก้ฟิลด์ใน businessentity)
  }));
  return {
    TABLES,
    phases: PH.map((p, i) => ({ code: p[0], name: p[1], sort: i + 1 })),
    steps,
    TLV,
    TNAME,
    SYS,
  };
}

/* ───────────────────────── 2) xlsx (Field_Spec) ───────────────────────── */
function unzip(file) {
  const buf = fs.readFileSync(file);
  let eocd = -1;
  for (let i = buf.length - 22; i >= 0; i--) {
    if (buf.readUInt32LE(i) === 0x06054b50) {
      eocd = i;
      break;
    }
  }
  if (eocd < 0) throw new Error('ไม่ใช่ไฟล์ zip/xlsx');
  const count = buf.readUInt16LE(eocd + 10);
  let p = buf.readUInt32LE(eocd + 16);
  const files = new Map();
  for (let n = 0; n < count; n++) {
    if (buf.readUInt32LE(p) !== 0x02014b50) throw new Error('central directory เสีย');
    const method = buf.readUInt16LE(p + 10);
    const csize = buf.readUInt32LE(p + 20);
    const nlen = buf.readUInt16LE(p + 28);
    const elen = buf.readUInt16LE(p + 30);
    const clen = buf.readUInt16LE(p + 32);
    const lho = buf.readUInt32LE(p + 42);
    const name = buf.toString('utf8', p + 46, p + 46 + nlen);
    const dataStart = lho + 30 + buf.readUInt16LE(lho + 26) + buf.readUInt16LE(lho + 28);
    const raw = buf.subarray(dataStart, dataStart + csize);
    files.set(name, () => (method === 8 ? zlib.inflateRawSync(raw) : raw));
    p += 46 + nlen + elen + clen;
  }
  return files;
}
const xmlDecode = (s) =>
  s
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&#(\d+);/g, (_, d) => String.fromCodePoint(+d))
    .replace(/&#x([0-9a-f]+);/gi, (_, h) => String.fromCodePoint(parseInt(h, 16)))
    .replace(/&amp;/g, '&');
function readSheetRows(file, sheetName) {
  const z = unzip(file);
  const text = (n) => z.get(n)().toString('utf8');
  const shared = z.has('xl/sharedStrings.xml')
    ? [...text('xl/sharedStrings.xml').matchAll(/<si>([\s\S]*?)<\/si>/g)].map((m) =>
        xmlDecode([...m[1].matchAll(/<t[^>]*>([\s\S]*?)<\/t>/g)].map((x) => x[1]).join('')),
      )
    : [];
  const wb = text('xl/workbook.xml');
  const sh = [...wb.matchAll(/<sheet\b[^>]*>/g)].map((m) => m[0]).find((t) => xmlDecode(/name="([^"]*)"/.exec(t)[1]) === sheetName);
  if (!sh) throw new Error(`ไม่พบชีต ${sheetName}`);
  const rid = /r:id="([^"]*)"/.exec(sh)[1];
  const rels = text('xl/_rels/workbook.xml.rels');
  const relTag = [...rels.matchAll(/<Relationship\b[^>]*>/g)].map((m) => m[0]).find((t) => new RegExp(`Id="${rid}"`).test(t));
  let target = /Target="([^"]*)"/.exec(relTag)[1];
  target = target.startsWith('/') ? target.slice(1) : target.startsWith('xl/') ? target : `xl/${target}`;
  const sheet = text(target);
  const colIdx = (ref) => [...ref.replace(/\d+/g, '')].reduce((n, ch) => n * 26 + ch.charCodeAt(0) - 64, 0) - 1;
  const rows = [];
  for (const rm of sheet.matchAll(/<row\b[^>]*>([\s\S]*?)<\/row>/g)) {
    const cells = [];
    for (const cm of rm[1].matchAll(/<c\b([^>]*?)(?:\/>|>([\s\S]*?)<\/c>)/g)) {
      const attrs = cm[1];
      const ref = /\br="([A-Z]+\d+)"/.exec(attrs)[1];
      const t = /\bt="([^"]*)"/.exec(attrs)?.[1];
      const body = cm[2] ?? '';
      let val = '';
      if (t === 'inlineStr') val = xmlDecode([...body.matchAll(/<t[^>]*>([\s\S]*?)<\/t>/g)].map((x) => x[1]).join(''));
      else {
        const v = /<v>([\s\S]*?)<\/v>/.exec(body)?.[1];
        if (v !== undefined) val = t === 's' ? shared[+v] : xmlDecode(v);
      }
      cells[colIdx(ref)] = val.replace(/\r?\n/g, ' / ');
    }
    rows.push(cells);
  }
  return rows;
}
function loadSpec() {
  const rows = readSheetRows(XLSX_FILE, '8_Field_Spec');
  const h = rows.findIndex((r) => r[0] === 'Master' && r[1] === 'ตาราง');
  if (h < 0) throw new Error('ไม่พบหัวตารางของ 8_Field_Spec');
  const hdr = rows[h];
  const col = (prefix) => {
    const i = hdr.findIndex((x) => x?.startsWith(prefix));
    if (i < 0) throw new Error(`ไม่พบคอลัมน์ ${prefix} ใน 8_Field_Spec`);
    return i;
  };
  const I = {
    table: col('ตาราง'),
    tab: col('ส่วน'),
    field: col('ชื่อฟิลด์'),
    cls: col('ประเภท'),
    req: col('บังคับ'),
    format: col('รูปแบบ'),
    len: col('ความยาว'),
    allowed: col('อักขระ'),
    ref: col('อ้างอิง'),
  };
  const idx = new Map();
  const sysCols = new Map(); // table → ฟิลด์ระบบ (ข้อมูลหลัก (ระบบ))
  for (const r of rows.slice(h + 1)) {
    if (!r[I.table] || !r[I.field]) continue;
    const row = {
      table: r[I.table],
      tab: r[I.tab] ?? '',
      field: r[I.field],
      cls: r[I.cls] ?? '',
      required: (r[I.req] ?? '') === 'ใช่',
      format: r[I.format] ?? '',
      len: r[I.len] ?? '',
      allowed: r[I.allowed] ?? '',
      ref: r[I.ref] ?? '',
    };
    if (row.tab.includes('(ระบบ)')) {
      (sysCols.get(row.table) ?? sysCols.set(row.table, []).get(row.table)).push(row.field);
      continue;
    }
    const item = /\((\w+)\)\s*$/.exec(row.tab)?.[1];
    idx.set(`${row.table}|${row.tab.startsWith('ข้อมูลรายการ') ? item : 'main'}|${row.field}`, row);
  }
  return { idx, sysCols };
}

/* ───────────────────────── 3) drawio ───────────────────────── */
function loadDrawio() {
  const xml = fs.readFileSync(DRAWIO_FILE, 'utf8');
  const dec = (s) =>
    s.replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&amp;/g, '&').replace(/&nbsp;/g, ' ');
  const cells = [];
  for (const m of xml.matchAll(/<mxCell\s([^>]*?)(?:\/>|>)/g)) {
    const get = (k) => new RegExp(`(?:^|\\s)${k}="([^"]*)"`).exec(m[1])?.[1];
    const v = get('value');
    cells.push({
      id: get('id'),
      style: get('style') ?? '',
      text: v === undefined ? '' : dec(dec(v)).replace(/<br\s*\/?>/gi, ' | ').replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim(),
    });
  }
  const num = (ch) => {
    const c = ch.codePointAt(0);
    return c >= 0x2460 && c <= 0x2473 ? c - 0x2460 + 1 : c >= 0x3251 && c <= 0x325f ? c - 0x3251 + 21 : null;
  };
  const steps = {};
  for (const c of cells) {
    const h = /^st_(\w+)_h$/.exec(c.id);
    if (h)
      steps[h[1]] = {
        no: num(c.text[0]),
        name: c.text.slice(1).split('|')[0].replace('★', '').trim(),
        star: c.text.includes('★'),
        fill: /fillColor=(#[0-9A-Fa-f]+)/.exec(c.style)?.[1],
        tabs: [],
        dep: [],
      };
  }
  for (const c of cells) {
    const t = /^(\w+)_t(\d+)$/.exec(c.id);
    if (t && steps[t[1]]) steps[t[1]].tabs[+t[2]] = c.text.replace(/^\d+\.\s*/, '').split('|')[0].trim();
    const d = /^st_(\w+)_dep$/.exec(c.id);
    if (d && steps[d[1]]) steps[d[1]].dep = [...c.text.matchAll(/[\u2460-\u2473\u3251-\u325F]/g)].map((x) => num(x[0]));
  }
  return steps;
}

/* ───────────────────────── 4) โมเดล ───────────────────────── */
const mock = loadMockup();
const spec = loadSpec();
const draw = loadDrawio();
const { TABLES, TNAME, TLV, SYS, steps, phases } = mock;
const stepByCode = Object.fromEntries(steps.map((s) => [s.code, s]));
const isSys = (t) => !!SYS[t];

// ลำดับตาราง = ตามลำดับ step / แท็บย่อย (businessentity โผล่ครั้งแรกใน step ① ส่วน step ㉒ ใช้ฟิลด์เดิม)
const tableOrder = [];
const homeStep = {}; // ตาราง → step ที่ "เป็นเจ้าของ"
for (const s of steps) {
  if (s.permFields) continue;
  s.tables.forEach((t, i) => {
    if (!homeStep[t]) {
      homeStep[t] = { step: s.code, seq: i + 1, optional: s.optional.includes(t) };
      tableOrder.push(t);
    }
  });
}
for (const t of Object.keys(TABLES)) if (!homeStep[t]) fail(`ตาราง ${t} ไม่อยู่ใน step ใดเลย`);
const level = (t) => TLV[t] || 'E';

const maxLen = (s) => {
  const m = /(\d[\d,]*)\s*ตัวอักษร/.exec(s);
  return m ? +m[1].replace(/,/g, '') : null;
};
const maxNum = (s) => {
  const m = /[–-]\s*([\d,]+(?:\.\d+)?)\s*$/.exec(s);
  return m ? +m[1].replace(/,/g, '') : null;
};

/** แปลงฟิลด์ (HTML + spec) → นิยามคอลัมน์ SQL */
function buildColumn(tableKey, itemKey, c) {
  const sp = spec.idx.get(`${tableKey}|${itemKey ?? 'main'}|${c.n}`);
  const where = `${tableKey}${itemKey ? '/' + itemKey : ''}.${c.n}`;
  if (!sp) fail(`${where}: ไม่พบใน 8_Field_Spec`);
  const col = {
    name: c.n,
    label: c.l,
    ref: c.r || null,
    required: !!c.q || c.n === 'usagestatus',
    options: c.o ? c.o.map((o) => o[0]) : null,
    optionLabels: c.o ? c.o.map((o) => o[1]) : null,
    sql: null,
    checks: [],
    default: null,
    specClass: sp?.cls,
    specFormat: sp?.format,
    specLen: sp?.len,
  };
  const f = sp?.format;
  if (col.ref) {
    col.sql = 'BIGINT';
    if (!TABLES[col.ref]) fail(`${where}: อ้างถึงตาราง ${col.ref} ที่ไม่มีใน TABLES`);
  } else if (col.options) {
    const w = Math.max(...col.options.map((o) => o.length));
    col.sql = w === 1 ? 'CHAR(1)' : `VARCHAR(${Math.max(10, Math.ceil(w / 10) * 10)})`;
    if (c.n === 'usagestatus') col.default = `'release'`;
  } else if (f === 'ข้อความ' || f === 'ข้อความสั้น' || f === 'ข้อความยาว' || f === 'อีเมล' || f === 'URL') {
    const n = maxLen(sp.len);
    if (!n) fail(`${where}: ความยาวอ่านไม่ได้ "${sp.len}"`);
    col.sql = `VARCHAR(${n})`;
    if (f === 'อีเมล') col.checks.push({ suffix: 'fmt', expr: `${c.n} ~ '^[^@[:space:]]+@[^@[:space:]]+[.][^@[:space:]]+$'` });
    if (f === 'URL') col.checks.push({ suffix: 'fmt', expr: `${c.n} ~* '^https?://'` });
  } else if (f === 'เบอร์โทร') {
    col.sql = `VARCHAR(${maxLen(sp.len) ?? 15})`;
    col.checks.push({ suffix: 'fmt', expr: `${c.n} ~ '^[0-9+ -]{9,15}$'` });
  } else if (f === 'วันที่') {
    col.sql = 'DATE';
  } else if (f === 'จำนวนเต็ม') {
    col.sql = 'INTEGER';
    col.checks.push({ suffix: 'range', expr: `${c.n} BETWEEN 0 AND ${maxNum(sp.len) ?? 999999999}` });
  } else if (f === 'ทศนิยม') {
    const mx = maxNum(sp.len) ?? 999999999.99;
    col.sql = mx <= 100 ? 'NUMERIC(5,2)' : 'NUMERIC(11,2)';
    col.checks.push({ suffix: 'range', expr: `${c.n} BETWEEN 0 AND ${mx}` });
  } else if (f === 'ไฟล์') {
    col.sql = 'VARCHAR(500)'; // เก็บ path/URL ของไฟล์ใน object storage (≤ 5 MB, .jpg .png .pdf)
  } else if (f === 'ใช่/ไม่ใช่') {
    col.sql = 'BOOLEAN';
    col.required = true;
    col.default = 'FALSE';
  } else {
    fail(`${where}: แปลงชนิดไม่ได้ (format="${f}", class="${sp?.cls}")`);
    col.sql = 'TEXT';
  }
  if (c.n === 'code') {
    col.required = true;
    col.checks.push({ suffix: 'fmt', expr: `code ~ '^[A-Za-z0-9._-]+$'` });
  }
  if (c.n === 'name' && f === 'ข้อความ') col.checks.push({ suffix: 'notblank', expr: `btrim(name) <> ''` });
  return col;
}

const tables = {}; // key → model
for (const key of tableOrder) {
  const t = TABLES[key];
  const sys = isSys(key);
  const cols = t.cols.map((c) => buildColumn(key, null, c));
  const items = t.items.map((it) => {
    const parentCol = `${key}id`;
    const icols = it.cols.map((c) => buildColumn(key, it.t, c));
    if (icols.some((c) => c.name === parentCol)) fail(`${it.t}: คอลัมน์ ${parentCol} ชนกับ FK ไปตารางแม่`);
    return { name: it.t, parent: key, parentCol, cols: icols };
  });
  tables[key] = {
    key,
    label: TNAME[key] ?? key,
    scope: sys ? 'SYS' : 'ENT',
    level: level(key),
    home: homeStep[key],
    cols,
    items,
  };
  for (const c of cols) if (['id', 'created_at', 'created_by', 'updated_at', 'updated_by', 'row_version', ...(sys ? [] : ['entitygroupid', 'businessentityid'])].includes(c.name)) fail(`${key}.${c.name}: ชื่อคอลัมน์ชนกับคอลัมน์ระบบ`);
  for (const need of ['code', 'name']) if (!cols.some((c) => c.name === need)) fail(`${key}: ไม่มีคอลัมน์ ${need}`);
}

// ฟิลด์ระบบ (entitygroup/businessentity) ใน spec ต้องตรงกับ SYS ของ mockup
for (const key of tableOrder) {
  const has = spec.sysCols.has(key);
  if (has === isSys(key)) fail(`${key}: scope ใน mockup (SYS=${isSys(key)}) ไม่ตรงกับ spec (มีฟิลด์ระบบ=${has})`);
}

/* ───── 4.1) ส่วนขยายที่ "ไม่อยู่ใน mockup/สเปก" — ตัดสินใจโดยเจ้าของงาน 5 พ.ย. 2026 ─────
 * ③ ช่องทางและเอกสาร: ให้ผูกกันจริงเป็นสายเดียว ช่องทางที่สะดวก → ประเภทการติดต่อ → ประเภทไฟล์แนบ
 * (ประเภทงานเอกสาร / กลุ่ม Master ไม่ถูกกล่าวถึง จึงไม่ผูก)
 * required: true  = FK บังคับ (NOT NULL) → ต้องมีแม่ก่อนจึงบันทึกลูกได้ · เปลี่ยนเป็น false ถ้าอยากให้เว้นว่างได้
 * ต้องไปเพิ่มฟิลด์นี้ใน mockup + สเปก 8_Field_Spec + settings.tables.ts ด้วย ไม่งั้นหน้าจอกับ DB ไม่ตรงกัน */
const EXTENSIONS = [
  { table: 'contacttype', name: 'communicationtypeid', label: 'ช่องทางที่สะดวก', ref: 'communicationtype', required: true },
  { table: 'attachfiletype', name: 'contacttypeid', label: 'ประเภทการติดต่อ', ref: 'contacttype', required: true },
];
for (const x of EXTENSIONS) {
  const t = tables[x.table];
  if (!t || !tables[x.ref]) {
    fail(`EXTENSIONS: ไม่พบตาราง ${x.table} หรือ ${x.ref}`);
    continue;
  }
  if (t.cols.some((c) => c.name === x.name)) fail(`EXTENSIONS: ${x.table}.${x.name} มีอยู่แล้วในต้นทาง — ลบออกจาก EXTENSIONS`);
  t.cols.push({
    name: x.name,
    label: x.label,
    ref: x.ref,
    required: x.required,
    options: null,
    optionLabels: null,
    sql: 'BIGINT',
    checks: [],
    default: null,
    extension: true,
  });
}

/* ───────────────────────── 5) กฎเฉพาะตาราง ───────────────────────── */
const extraChecks = {}; // table → [{name, expr}]
const extraUnique = {}; // table → [{name, cols, where}]
const addCheck = (t, name, expr) => (extraChecks[t] ??= []).push({ name, expr });
const addUnique = (t, name, cols, where) => (extraUnique[t] ??= []).push({ name, cols, where });
addCheck(
  'position',
  'ratio_sum',
  `(competency_ratio IS NULL AND kpi_ratio IS NULL AND attendance_ratio IS NULL) OR ` +
    `(COALESCE(competency_ratio,0) + COALESCE(kpi_ratio,0) + COALESCE(attendance_ratio,0) = 100)`,
); // V06
addCheck('employeecoverforitem', 'valid_range', 'valid_to IS NULL OR valid_from IS NULL OR valid_to >= valid_from'); // V12
addCheck('coupon', 'valid_range', 'expired_date IS NULL OR validfrom IS NULL OR expired_date >= validfrom'); // V12
addUnique('employeesubpositionitem', 'one_main', ['employeeid'], `is_main = 'Y'`); // พนักงานมีตำแหน่งหลักได้ไม่เกิน 1

/* ───────────────────────── 6) กราฟ FK ───────────────────────── */
const fks = []; // {holder, item|null, col, ref, required, ownerTable, ownerCol}
for (const key of tableOrder) {
  const t = tables[key];
  t.cols.forEach((c) => c.ref && fks.push({ holder: key, item: null, col: c.name, ref: c.ref, required: c.required, owner: key, ownerCol: null, ...(c.extension ? { extension: true } : {}) }));
  t.items.forEach((it) =>
    it.cols.forEach((c) => c.ref && fks.push({ holder: it.name, item: it.name, col: c.name, ref: c.ref, required: c.required, owner: key, ownerCol: it.parentCol })),
  );
}
const fkMain = fks.filter((f) => !f.item);
const selfRefs = fks.filter((f) => f.holder === f.ref || (f.item && f.owner === f.ref));
const stepOfTable = (t) => homeStep[t]?.step;

// วงจร (ไม่นับ self-ref)
function findCycles() {
  const adj = new Map(tableOrder.map((t) => [t, new Set()]));
  fks.forEach((f) => f.owner !== f.ref && adj.get(f.owner).add(f.ref));
  const color = new Map();
  const stack = [];
  const out = [];
  const dfs = (u) => {
    color.set(u, 1);
    stack.push(u);
    for (const v of adj.get(u)) {
      if (color.get(v) === 1) out.push([...stack.slice(stack.indexOf(v)), v]);
      else if (!color.get(v)) dfs(v);
    }
    stack.pop();
    color.set(u, 2);
  };
  tableOrder.forEach((t) => !color.get(t) && dfs(t));
  return out;
}
const cycles = findCycles();
const isolated = tableOrder.filter((t) => !fks.some((f) => f.owner === t || f.ref === t));

// self-ref ต้องห้ามอ้างตัวเอง (spec: "อ้างตัวเองไม่ได้")
for (const f of selfRefs) {
  if (!f.item) addCheck(f.holder, `${f.col}_not_self`, `${f.col} <> id`);
  else addCheck(f.holder, `${f.col}_not_self`, `${f.col} <> ${f.ownerCol}`);
}

// UNIQUE ของรายการลูก (V08): เฉพาะ item ที่มี reference เดียว และไม่มีช่วงวันที่ → (แม่, reference นั้น) ห้ามซ้ำ
const itemUniqueSkipped = [];
for (const key of tableOrder) {
  for (const it of tables[key].items) {
    const refs = it.cols.filter((c) => c.ref);
    const hasRange = it.cols.some((c) => c.sql === 'DATE');
    if (refs.length === 1 && !hasRange) addUnique(it.name, 'main_ref', [it.parentCol, refs[0].name]);
    else itemUniqueSkipped.push({ item: it.name, refs: refs.map((r) => r.name), reason: hasRange ? 'มีช่วงวันที่' : refs.length === 0 ? 'ไม่มี reference' : 'มี reference หลายตัว' });
  }
}

/* ───────────────────────── 7) ตรวจเทียบ 3 แหล่ง ───────────────────────── */
const crossCheck = [];
{
  const closure = (code) => {
    const out = new Set();
    const q = [...stepByCode[code].deps];
    while (q.length) {
      const x = q.pop();
      if (out.has(x)) continue;
      out.add(x);
      q.push(...stepByCode[x].deps);
    }
    return out;
  };
  for (const s of steps) {
    const d = draw[s.code];
    if (!d) {
      crossCheck.push(`${s.code}: ไม่พบกล่องใน drawio`);
      continue;
    }
    if (d.no !== s.no) crossCheck.push(`${s.code}: เลข step drawio=${d.no} / HTML=${s.no}`);
    if (d.name !== s.name) crossCheck.push(`${s.code}: ชื่อ drawio="${d.name}" / HTML="${s.name}"`);
    if (d.star !== s.golive) crossCheck.push(`${s.code}: ★ drawio=${d.star} / HTML golive=${s.golive}`);
    if (!s.permFields) {
      const want = s.tables.map((t) => TNAME[t] + (s.optional.includes(t) ? ' (ไม่บังคับ)' : ''));
      if (JSON.stringify(want) !== JSON.stringify(d.tabs)) crossCheck.push(`${s.code}: แท็บย่อยไม่ตรง drawio=${JSON.stringify(d.tabs)} / HTML=${JSON.stringify(want)}`);
    }
    const hd = s.deps.filter((x) => x !== 'entity').map((x) => stepByCode[x].no).sort((a, b) => a - b);
    const dd = [...d.dep].sort((a, b) => a - b);
    if (JSON.stringify(hd) !== JSON.stringify(dd)) crossCheck.push(`${s.code}: ต้องมีก่อน drawio=[${dd}] / HTML=[${hd}]`);
  }
  s_loop: for (const f of fks) {
    // FK บังคับ ต้องถูกครอบคลุมด้วย "ต้องมีก่อน" (ตรง/ทอดเดียว) หรืออยู่ใน step เดียวกัน
    if (!f.required) continue;
    const from = stepOfTable(f.owner);
    const to = stepOfTable(f.ref);
    if (!from || !to || from === to) continue s_loop;
    if (!closure(from).has(to)) crossCheck.push(`FK บังคับ ${f.holder}.${f.col} → ${f.ref} (step ${to}) ไม่อยู่ใน "ต้องมีก่อน" ของ step ${from}`);
  }
}
// ลำดับแท็บย่อยใน step เดียวกันต้องไม่ขัดกับทิศ FK (ตารางที่ถูกอ้างต้องมาก่อน) ยกเว้นวงจร/self-ref
const orderViolations = [];
for (const f of fks) {
  const from = homeStep[f.owner];
  const to = homeStep[f.ref];
  if (!from || !to || from.step !== to.step || f.owner === f.ref) continue;
  if (to.seq > from.seq) orderViolations.push(`${f.item ?? f.holder}.${f.col} (${f.owner} แท็บ ${from.seq}) → ${f.ref} (แท็บ ${to.seq})${f.required ? ' [บังคับ]' : ' [ไม่บังคับ]'}`);
}
// FK ไม่บังคับที่ข้าม step โดยไม่อยู่ใน "ต้องมีก่อน"
const softGaps = [];
{
  const closure = (code) => {
    const out = new Set();
    const q = [...stepByCode[code].deps];
    while (q.length) {
      const x = q.pop();
      if (out.has(x)) continue;
      out.add(x);
      q.push(...stepByCode[x].deps);
    }
    return out;
  };
  const seen = new Set();
  for (const f of fks) {
    if (f.required) continue;
    const from = stepOfTable(f.owner);
    const to = stepOfTable(f.ref);
    if (!from || !to || from === to || closure(from).has(to)) continue;
    const key = `${from}>${to}`;
    const e = softGaps.find((g) => g.key === key);
    const lbl = `${f.item ?? f.holder}.${f.col}`;
    if (e) e.cols.push(lbl);
    else softGaps.push({ key, from, to, cols: [lbl] });
    seen.add(key);
  }
}

/* ───────────────────────── 8) SQL ───────────────────────── */
const hardReserved = new Set(['user', 'order', 'group', 'table', 'column', 'default', 'check', 'limit', 'offset', 'primary', 'references', 'select', 'from', 'where', 'end', 'all', 'analyse', 'analyze', 'and', 'any', 'array', 'as', 'asc', 'both', 'case', 'cast', 'collate', 'constraint', 'create', 'current_date', 'current_time', 'current_timestamp', 'current_user', 'desc', 'distinct', 'do', 'else', 'except', 'false', 'fetch', 'for', 'foreign', 'grant', 'having', 'in', 'initially', 'intersect', 'into', 'leading', 'localtime', 'localtimestamp', 'not', 'null', 'on', 'only', 'or', 'placing', 'returning', 'session_user', 'some', 'symmetric', 'then', 'to', 'trailing', 'true', 'union', 'unique', 'using', 'variadic', 'when', 'window', 'with']);
const allIdents = [];
tableOrder.forEach((k) => {
  allIdents.push(k, ...tables[k].cols.map((c) => c.name));
  tables[k].items.forEach((it) => allIdents.push(it.name, it.parentCol, ...it.cols.map((c) => c.name)));
});
for (const id of new Set(allIdents)) if (hardReserved.has(id)) fail(`ชื่อ "${id}" เป็นคำสงวนของ PostgreSQL — ต้องใส่ quote หรือเปลี่ยนชื่อ`);

// ชื่อตารางจริง (prefix + ชื่อ) ต้องไม่เกิน 63 ตัวอักษร (ขีดจำกัด identifier ของ PostgreSQL) และไม่ซ้ำกัน
{
  const seen = new Map();
  const names = [...tableOrder, ...tableOrder.flatMap((k) => tables[k].items.map((it) => it.name)), ...Object.values(META).map((m) => m.slice(TABLE_PREFIX.length))];
  for (const n of names) {
    if (P(n).length > 63) fail(`ชื่อตาราง ${P(n)} ยาว ${P(n).length} ตัวอักษร เกิน 63`);
    if (seen.has(n)) fail(`ชื่อตารางซ้ำ: ${n}`);
    seen.set(n, true);
  }
}
const usedIdent = new Map();
function ident(raw) {
  let s = raw;
  if (s.length > 63) s = `${raw.slice(0, 54)}_${crypto.createHash('sha1').update(raw).digest('hex').slice(0, 8)}`;
  if (usedIdent.has(s) && usedIdent.get(s) !== raw) fail(`ชื่อ constraint/index ชนกัน: ${s}`);
  usedIdent.set(s, raw);
  return s;
}
const lit = (s) => `'${String(s).replace(/'/g, "''")}'`;

const padName = (n) => n.padEnd(Math.max(26, n.length + 1));
function colDdl(c) {
  let s = `  ${padName(c.name)}${c.sql}`;
  if (c.required) s += ' NOT NULL';
  if (c.default) s += ` DEFAULT ${c.default}`;
  return s;
}
function colChecks(table, c) {
  const out = [];
  if (c.options) out.push({ name: `ck_${table}_${c.name}`, expr: c.required ? `${c.name} IN (${c.options.map(lit).join(', ')})` : `${c.name} IS NULL OR ${c.name} IN (${c.options.map(lit).join(', ')})` });
  c.checks.forEach((k) => out.push({ name: `ck_${table}_${c.name}_${k.suffix}`, expr: c.required ? k.expr : `${c.name} IS NULL OR ${k.expr}` }));
  return out;
}

const AUDIT = [
  '  created_at                TIMESTAMPTZ NOT NULL DEFAULT now()',
  '  created_by                VARCHAR(100)',
  '  updated_at                TIMESTAMPTZ NOT NULL DEFAULT now()',
  '  updated_by                VARCHAR(100)',
  '  row_version               INTEGER NOT NULL DEFAULT 0',
];

function emitTable(t) {
  const pn = P(t.key);
  const tenant = t.scope === 'ENT';
  const lines = ['  id                        BIGINT GENERATED BY DEFAULT AS IDENTITY PRIMARY KEY'];
  if (tenant) lines.push('  entitygroupid             BIGINT NOT NULL', '  businessentityid          BIGINT NOT NULL');
  t.cols.forEach((c) => lines.push(colDdl(c)));
  lines.push(...AUDIT);
  const cons = [];
  t.cols.forEach((c) => colChecks(pn, c).forEach((k) => cons.push(`  CONSTRAINT ${ident(k.name)} CHECK (${k.expr})`)));
  (extraChecks[t.key] ?? []).forEach((k) => cons.push(`  CONSTRAINT ${ident(`ck_${pn}_${k.name}`)} CHECK (${k.expr})`));
  cons.push(tenant ? `  CONSTRAINT ${ident(`uq_${pn}_code`)} UNIQUE (businessentityid, code)` : `  CONSTRAINT ${ident(`uq_${pn}_code`)} UNIQUE (code)`);
  if (tenant) cons.push(`  CONSTRAINT ${ident(`uq_${pn}_be_id`)} UNIQUE (businessentityid, id)`);
  if (t.key === 'businessentity') cons.push(`  CONSTRAINT ${ident(`uq_${pn}_id_group`)} UNIQUE (id, entitygroupid)`);
  const tag = `${stepTag(t.home.step)} · ${t.scope === 'SYS' ? 'ข้อมูลกลาง (SYS)' : 'แยกตามนิติบุคคล (ENT)'} · ผู้คีย์ ${t.level} · แท็บ ${t.home.seq}${t.home.optional ? ' (ไม่บังคับ)' : ''}`;
  return `-- ${t.label} (${t.key})  ${tag}\nCREATE TABLE ${pn} (\n${[...lines, ...cons].join(',\n')}\n);`;
}
function emitItem(it) {
  const pn = P(it.name);
  const lines = [
    '  id                        BIGINT GENERATED BY DEFAULT AS IDENTITY PRIMARY KEY',
    '  businessentityid          BIGINT NOT NULL',
    `  ${padName(it.parentCol)}BIGINT NOT NULL`,
  ];
  it.cols.forEach((c) => lines.push(colDdl(c)));
  const cons = [];
  it.cols.forEach((c) => colChecks(pn, c).forEach((k) => cons.push(`  CONSTRAINT ${ident(k.name)} CHECK (${k.expr})`)));
  (extraChecks[it.name] ?? []).forEach((k) => cons.push(`  CONSTRAINT ${ident(`ck_${pn}_${k.name}`)} CHECK (${k.expr})`));
  return `-- รายการลูกของ ${it.parent} (ข้อมูลรายการ · ${it.name})\nCREATE TABLE ${pn} (\n${[...lines, ...cons].join(',\n')}\n);`;
}
function stepTag(code) {
  const s = stepByCode[code];
  return `${circled(s.no)} ${s.name}`;
}
function circled(n) {
  return n <= 20 ? String.fromCodePoint(0x2460 + n - 1) : String.fromCodePoint(0x3251 + n - 21);
}

/** ตัวช่วยสร้างคำสั่ง FK — table / refTable เป็นชื่อ "ใน mockup" (ไม่มี prefix) ; suffix = ส่วนท้ายของชื่อ constraint */
function fkSql() {
  const out = [];
  const add = (table, suffix, cols, refTable, refCols, action) =>
    out.push(`ALTER TABLE ${P(table)} ADD CONSTRAINT ${ident(`fk_${P(table)}_${suffix}`)}\n  FOREIGN KEY (${cols.join(', ')}) REFERENCES ${P(refTable)} (${refCols.join(', ')})${action ? ' ' + action : ''};`);
  for (const key of tableOrder) {
    const t = tables[key];
    if (t.scope === 'ENT') {
      add(key, 'businessentity', ['businessentityid', 'entitygroupid'], 'businessentity', ['id', 'entitygroupid'], 'ON DELETE RESTRICT');
    }
    for (const c of t.cols) {
      if (!c.ref) continue;
      const target = tables[c.ref];
      if (target.scope === 'SYS') add(key, c.name, [c.name], c.ref, ['id'], 'ON DELETE RESTRICT');
      else if (t.scope === 'ENT') add(key, c.name, ['businessentityid', c.name], c.ref, ['businessentityid', 'id'], 'ON DELETE RESTRICT');
      else if (key === 'businessentity') add(key, c.name, ['id', c.name], c.ref, ['businessentityid', 'id'], 'ON DELETE RESTRICT'); // สกุลเงินต้องเป็นของนิติบุคคลนี้เอง
      else fail(`${key}.${c.name}: ตาราง SYS อ้างถึงตาราง ENT ${c.ref} — ไม่รู้จะผูกนิติบุคคลอย่างไร`);
    }
    for (const it of t.items) {
      add(it.name, it.parentCol, ['businessentityid', it.parentCol], key, ['businessentityid', 'id'], 'ON DELETE CASCADE');
      for (const c of it.cols) {
        if (!c.ref) continue;
        const target = tables[c.ref];
        if (target.scope === 'SYS') add(it.name, c.name, [c.name], c.ref, ['id'], 'ON DELETE RESTRICT');
        else add(it.name, c.name, ['businessentityid', c.name], c.ref, ['businessentityid', 'id'], 'ON DELETE RESTRICT');
      }
    }
  }
  return out;
}
function indexSql() {
  const out = [];
  for (const key of tableOrder) {
    const t = tables[key];
    const tenant = t.scope === 'ENT';
    for (const c of t.cols.filter((x) => x.ref)) {
      const cols = tenant ? `businessentityid, ${c.name}` : c.name;
      out.push(`CREATE INDEX ${ident(`ix_${P(key)}_${c.name}`)} ON ${P(key)} (${cols}) WHERE ${c.name} IS NOT NULL;`);
    }
    for (const it of t.items) {
      out.push(`CREATE INDEX ${ident(`ix_${P(it.name)}_${it.parentCol}`)} ON ${P(it.name)} (businessentityid, ${it.parentCol});`);
      for (const c of it.cols.filter((x) => x.ref)) {
        const tt = tables[c.ref].scope === 'ENT';
        out.push(`CREATE INDEX ${ident(`ix_${P(it.name)}_${c.name}`)} ON ${P(it.name)} (${tt ? 'businessentityid, ' : ''}${c.name}) WHERE ${c.name} IS NOT NULL;`);
      }
    }
  }
  return out;
}
function uniqueSql() {
  const out = [];
  for (const [table, list] of Object.entries(extraUnique)) {
    for (const u of list) {
      const name = ident(`uq_${P(table)}_${u.name}`);
      if (u.where) out.push(`CREATE UNIQUE INDEX ${name} ON ${P(table)} (${u.cols.join(', ')}) WHERE ${u.where};`);
      else out.push(`ALTER TABLE ${P(table)} ADD CONSTRAINT ${name} UNIQUE (${u.cols.join(', ')});`);
    }
  }
  return out;
}
function commentSql() {
  const out = [];
  for (const key of tableOrder) {
    const t = tables[key];
    out.push(`COMMENT ON TABLE ${P(key)} IS ${lit(`${t.label} (${key}) · ${stepTag(t.home.step)} · ${t.scope} · ผู้คีย์ ${t.level}`)};`);
    t.cols.forEach((c) => out.push(`COMMENT ON COLUMN ${P(key)}.${c.name} IS ${lit(c.extension ? `${c.label} [เพิ่มนอกสเปก: ผูก ③ ตามที่เจ้าของงานตัดสิน]` : c.label)};`));
    for (const it of t.items) {
      out.push(`COMMENT ON TABLE ${P(it.name)} IS ${lit(`รายการลูกของ ${t.label} (${it.name})`)};`);
      it.cols.forEach((c) => out.push(`COMMENT ON COLUMN ${P(it.name)}.${c.name} IS ${lit(c.label)};`));
    }
  }
  return out;
}

/* views / function — อ่านจาก metadata (con_master_setup_*, con_master_table_registry, con_master_ref)
 * หมายเหตุ: ค่าในคอลัมน์ table_name / holder_table / ref_table ฯลฯ เป็น "ชื่อใน mockup/API" (ไม่มี prefix)
 *           ส่วนชื่อตารางจริงใน SQL = ${TABLE_PREFIX} + ชื่อนั้น */
function viewSql() {
  const arms = tableOrder.map((k) => {
    const t = tables[k];
    return t.scope === 'ENT'
      ? `  SELECT businessentityid, ${lit(k)}::text AS table_name, count(*)::int AS release_count\n    FROM ${P(k)} WHERE usagestatus = 'release' GROUP BY businessentityid`
      : `  SELECT be.id AS businessentityid, ${lit(k)}::text AS table_name,\n         (SELECT count(*)::int FROM ${P(k)} WHERE usagestatus = 'release') AS release_count\n    FROM ${P('businessentity')} be`;
  });
  return `-- จำนวนรายการ release ต่อ (นิติบุคคล, ตาราง) · ตาราง SYS นับทั้งระบบ (ใช้ร่วมทุกนิติบุคคล)
-- table_name = ชื่อใน mockup/API (ไม่มี prefix ${TABLE_PREFIX})
CREATE VIEW v_master_release_count AS
${arms.join('\n  UNION ALL\n')};

-- step ไหน "เสร็จ" แล้วสำหรับนิติบุคคลหนึ่ง (ตรรกะเดียวกับ stepDone() ใน mockup)
CREATE VIEW v_setup_step_status AS
SELECT be.id AS businessentityid, s.code AS step_code, s.step_no, s.required_for_golive,
       CASE s.done_rule
         WHEN 'ENTITY_PERMISSIONS' THEN (be.default_permission_lead IS NOT NULL AND be.default_permission_prospect IS NOT NULL)
         ELSE NOT EXISTS (
           SELECT 1 FROM ${META.stepTable} t
            WHERE t.step_code = s.code AND NOT t.is_optional
              AND COALESCE((SELECT c.release_count FROM v_master_release_count c
                             WHERE c.businessentityid = be.id AND c.table_name = t.table_name), 0) = 0)
       END AS is_done
  FROM ${P('businessentity')} be CROSS JOIN ${META.step} s;

-- V13: step ที่ยังขาด "ต้องมีก่อน" → ปุ่ม "สร้าง" ต้องกดไม่ได้ + แสดงเครื่องหมาย !
CREATE VIEW v_setup_step_blocker AS
SELECT be.id AS businessentityid, d.step_code, d.requires_step_code AS missing_step_code
  FROM ${P('businessentity')} be
  JOIN ${META.dep} d ON TRUE
  JOIN v_setup_step_status rs ON rs.businessentityid = be.id AND rs.step_code = d.requires_step_code
 WHERE NOT rs.is_done;

-- V14: ฟิลด์บังคับที่อ้างตารางซึ่งยังไม่มีรายการ release → ฟอร์มเปิดได้ แต่บันทึกไม่ผ่าน (แถบเหลือง)
CREATE VIEW v_field_prerequisite AS
SELECT be.id AS businessentityid, r.holder_table, r.holder_column, r.ref_table
  FROM ${P('businessentity')} be
  JOIN ${META.ref} r ON r.is_required AND r.owner_column IS NULL
 WHERE COALESCE((SELECT c.release_count FROM v_master_release_count c
                  WHERE c.businessentityid = be.id AND c.table_name = r.ref_table), 0) = 0;

-- แถบ "พร้อมเปิดใช้งาน x/y"
CREATE VIEW v_go_live_progress AS
SELECT businessentityid,
       count(*) FILTER (WHERE is_done)::int AS done_steps,
       count(*)::int                        AS total_steps
  FROM v_setup_step_status
 WHERE required_for_golive
 GROUP BY businessentityid;

-- V15 + แท็บ "ใช้อยู่ใน": ใครอ้างถึงรายการ (p_ref_table, p_ref_id) อยู่บ้าง
--   • p_ref_table = ชื่อใน mockup/API (เช่น 'communicationtype') — ฟังก์ชันเติม prefix ${TABLE_PREFIX} เอง
--   • ถ้าตารางที่ถูกอ้างเป็น ENT → นับเฉพาะนิติบุคคล p_businessentityid
--   • ถ้าเป็น SYS (ข้อมูลกลาง) → นับทุกนิติบุคคล (ไม่งั้นลบแล้วชน FK ข้ามนิติบุคคล)
CREATE FUNCTION fn_master_used_by(p_businessentityid BIGINT, p_ref_table TEXT, p_ref_id BIGINT)
RETURNS TABLE (owner_table TEXT, owner_id BIGINT, owner_code TEXT, owner_name TEXT, via_column TEXT)
LANGUAGE plpgsql STABLE AS $fn$
DECLARE
  r RECORD;
  ref_scope TEXT;
  q TEXT;
BEGIN
  SELECT scope INTO ref_scope FROM ${META.registry} WHERE table_name = p_ref_table;
  IF ref_scope IS NULL THEN
    RAISE EXCEPTION 'ไม่รู้จักตาราง master: %', p_ref_table;
  END IF;
  FOR r IN SELECT * FROM ${META.ref} WHERE ref_table = p_ref_table ORDER BY holder_table, holder_column LOOP
    IF r.owner_column IS NULL THEN
      q := format('SELECT DISTINCT %L::text, o.id, o.code::text, o.name::text, %L::text FROM %I o WHERE o.%I = $1',
                  r.owner_table, r.holder_column, '${TABLE_PREFIX}' || r.owner_table, r.holder_column);
      IF ref_scope = 'ENT' AND r.tenant_column IS NOT NULL THEN
        q := q || format(' AND o.%I = $2', r.tenant_column);
      END IF;
    ELSE
      q := format('SELECT DISTINCT %L::text, o.id, o.code::text, o.name::text, %L::text FROM %I h JOIN %I o ON o.id = h.%I WHERE h.%I = $1',
                  r.owner_table, r.holder_table || '.' || r.holder_column, '${TABLE_PREFIX}' || r.holder_table, '${TABLE_PREFIX}' || r.owner_table, r.owner_column, r.holder_column);
      IF ref_scope = 'ENT' THEN
        q := q || ' AND h.businessentityid = $2';
      END IF;
    END IF;
    RETURN QUERY EXECUTE q USING p_ref_id, p_businessentityid;
  END LOOP;
END
$fn$;`;
}

function metaTablesSql() {
  return `-- ═══ ทะเบียนลำดับการตั้งค่า (metadata) — ให้หน้าจอคำนวณ stepper / ปุ่มสร้าง / เครื่องหมาย ! จากฐานข้อมูล ═══
CREATE TABLE ${META.phase} (
  code        VARCHAR(10)  PRIMARY KEY,
  name_th     VARCHAR(100) NOT NULL,
  sort_order  SMALLINT     NOT NULL UNIQUE
);
COMMENT ON TABLE ${META.phase} IS 'หมวด 0–5 ใน drawio / tabbar บนหน้าจอ';

CREATE TABLE ${META.step} (
  code                 VARCHAR(30)  PRIMARY KEY,
  phase_code           VARCHAR(10)  NOT NULL REFERENCES ${META.phase} (code),
  step_no              SMALLINT     NOT NULL UNIQUE CHECK (step_no BETWEEN 1 AND 99),
  name_th              VARCHAR(100) NOT NULL,
  required_for_golive  BOOLEAN      NOT NULL,
  done_rule            VARCHAR(20)  NOT NULL DEFAULT 'TABLES' CHECK (done_rule IN ('TABLES', 'ENTITY_PERMISSIONS')),
  note_th              VARCHAR(500)
);
COMMENT ON TABLE  ${META.step} IS 'เมนูย่อยบน stepper ① → ㉛ (1 แถว = 1 กรอบใน drawio)';
COMMENT ON COLUMN ${META.step}.required_for_golive IS '★ = ต้องมีข้อมูล release ก่อนเปิดใช้งานระบบ';
COMMENT ON COLUMN ${META.step}.done_rule IS 'TABLES = ทุกตารางที่ไม่ใช่ไม่บังคับมี release ≥ 1 · ENTITY_PERMISSIONS = นิติบุคคลตั้งสิทธิ์เริ่มต้น Lead/Prospect แล้ว';

CREATE TABLE ${META.registry} (
  table_name     VARCHAR(63)  PRIMARY KEY,
  physical_name  VARCHAR(63)  NOT NULL UNIQUE,
  label_th       VARCHAR(100) NOT NULL,
  scope          CHAR(3)      NOT NULL CHECK (scope IN ('SYS', 'ENT')),
  owner_level    CHAR(1)      NOT NULL CHECK (owner_level IN ('S', 'E', 'U', 'K')),
  home_step      VARCHAR(30)  NOT NULL REFERENCES ${META.step} (code)
);
COMMENT ON TABLE  ${META.registry} IS 'ทะเบียนตาราง master ทั้ง 72 ตาราง (ตรงกับ TABLES / TNAME / TLV / SYS ใน mockup)';
COMMENT ON COLUMN ${META.registry}.table_name IS 'ชื่อใน mockup/API (ไม่มี prefix) — ใช้เป็นกุญแจใน metadata และ view ทั้งหมด';
COMMENT ON COLUMN ${META.registry}.physical_name IS 'ชื่อตารางจริงในฐานข้อมูล = ${TABLE_PREFIX} + table_name';
COMMENT ON COLUMN ${META.registry}.scope IS 'SYS = ข้อมูลกลางใช้ร่วมทุกนิติบุคคล · ENT = แยกตามนิติบุคคล (มี businessentityid)';
COMMENT ON COLUMN ${META.registry}.owner_level IS 'S = System Configurator (ACE) · E = Entity Configurator · U = Master data user · K = KPI (SUN เท่านั้น)';

CREATE TABLE ${META.stepTable} (
  step_code    VARCHAR(30) NOT NULL REFERENCES ${META.step} (code),
  table_name   VARCHAR(63) NOT NULL REFERENCES ${META.registry} (table_name),
  seq          SMALLINT    NOT NULL,
  is_optional  BOOLEAN     NOT NULL DEFAULT FALSE,
  PRIMARY KEY (step_code, table_name),
  UNIQUE (step_code, seq)
);
COMMENT ON TABLE  ${META.stepTable} IS 'แท็บย่อยในแต่ละ step — seq = ลำดับที่ "แนะนำ" ให้คีย์ (ลูกศรเทาใน drawio) ไม่ได้บังคับด้วย FK';
COMMENT ON COLUMN ${META.stepTable}.is_optional IS '(ไม่บังคับ) = ข้ามได้ ไม่ทำให้ step ไม่ครบ';

CREATE TABLE ${META.dep} (
  step_code           VARCHAR(30) NOT NULL REFERENCES ${META.step} (code),
  requires_step_code  VARCHAR(30) NOT NULL REFERENCES ${META.step} (code),
  PRIMARY KEY (step_code, requires_step_code),
  CHECK (step_code <> requires_step_code)
);
COMMENT ON TABLE ${META.dep} IS '"ต้องมีก่อน" ระดับ step (V13) — ถ้ายังไม่ครบ ปุ่ม "สร้าง" กดไม่ได้ · ไม่ใช่ FK ของข้อมูล';

CREATE TABLE ${META.ref} (
  holder_table   VARCHAR(63) NOT NULL,
  holder_column  VARCHAR(63) NOT NULL,
  owner_table    VARCHAR(63) NOT NULL REFERENCES ${META.registry} (table_name),
  owner_column   VARCHAR(63),
  tenant_column  VARCHAR(63),
  ref_table      VARCHAR(63) NOT NULL REFERENCES ${META.registry} (table_name),
  is_required    BOOLEAN     NOT NULL,
  PRIMARY KEY (holder_table, holder_column)
);
COMMENT ON TABLE  ${META.ref} IS 'ทะเบียน FK ทุกเส้นระหว่าง master (ใช้ทำแท็บ "ใช้อยู่ใน", V14, V15) — ต้องตรงกับ FK จริงในฐานข้อมูล · ชื่อตารางเป็นชื่อใน mockup/API (ไม่มี prefix)';
COMMENT ON COLUMN ${META.ref}.holder_table  IS 'ตารางที่ถือคอลัมน์ FK (อาจเป็นตารางรายการลูก)';
COMMENT ON COLUMN ${META.ref}.owner_table   IS 'master ที่ผู้ใช้เห็นเป็น "เจ้าของ" แถวนั้น (ของรายการลูก = ตารางแม่)';
COMMENT ON COLUMN ${META.ref}.owner_column  IS 'คอลัมน์ในตารางรายการลูกที่ชี้ไปตารางแม่ (NULL = holder คือ master เอง)';
COMMENT ON COLUMN ${META.ref}.tenant_column IS 'คอลัมน์ที่ใช้กรองนิติบุคคล (NULL = ตาราง SYS ไม่ต้องกรอง)';`;
}

function metaInsertSql() {
  const out = [];
  out.push('-- ═══ ข้อมูลตั้งต้นของ metadata (สร้างจาก mockup + drawio — อย่าแก้ด้วยมือ) ═══');
  out.push(`SET search_path = ${SCHEMA}, public;`);
  out.push(`INSERT INTO ${META.phase} (code, name_th, sort_order) VALUES\n${phases.map((p) => `  (${lit(p.code)}, ${lit(p.name)}, ${p.sort})`).join(',\n')};`);
  out.push(
    `INSERT INTO ${META.step} (code, phase_code, step_no, name_th, required_for_golive, done_rule, note_th) VALUES\n${steps
      .map((s) => `  (${lit(s.code)}, ${lit(s.phase)}, ${s.no}, ${lit(s.name)}, ${s.golive ? 'TRUE' : 'FALSE'}, ${lit(s.permFields ? 'ENTITY_PERMISSIONS' : 'TABLES')}, ${s.note ? lit(s.note) : 'NULL'})`)
      .join(',\n')};`,
  );
  out.push(
    `INSERT INTO ${META.registry} (table_name, physical_name, label_th, scope, owner_level, home_step) VALUES\n${tableOrder
      .map((k) => `  (${lit(k)}, ${lit(P(k))}, ${lit(tables[k].label)}, ${lit(tables[k].scope)}, ${lit(tables[k].level)}, ${lit(tables[k].home.step)})`)
      .join(',\n')};`,
  );
  const stepTables = [];
  for (const s of steps) {
    const list = s.permFields ? [] : s.tables;
    list.forEach((t, i) => stepTables.push(`  (${lit(s.code)}, ${lit(t)}, ${i + 1}, ${s.optional.includes(t) ? 'TRUE' : 'FALSE'})`));
  }
  out.push(`INSERT INTO ${META.stepTable} (step_code, table_name, seq, is_optional) VALUES\n${stepTables.join(',\n')};`);
  const deps = [];
  for (const s of steps) s.deps.forEach((d) => deps.push(`  (${lit(s.code)}, ${lit(d)})`));
  out.push(`INSERT INTO ${META.dep} (step_code, requires_step_code) VALUES\n${deps.join(',\n')};`);
  const refs = fks.map((f) => {
    const holderTenant = f.item ? 'businessentityid' : tables[f.holder].scope === 'ENT' ? 'businessentityid' : f.holder === 'businessentity' ? 'id' : null;
    return `  (${lit(f.holder)}, ${lit(f.col)}, ${lit(f.owner)}, ${f.ownerCol ? lit(f.ownerCol) : 'NULL'}, ${holderTenant ? lit(holderTenant) : 'NULL'}, ${lit(f.ref)}, ${f.required ? 'TRUE' : 'FALSE'})`;
  });
  out.push(`INSERT INTO ${META.ref} (holder_table, holder_column, owner_table, owner_column, tenant_column, ref_table, is_required) VALUES\n${refs.join(',\n')};`);
  return out.join('\n\n');
}

function buildSchemaSql() {
  const head = `-- ════════════════════════════════════════════════════════════════════════════
-- Triple Sales · Configuration & Master data  —  DDL (PostgreSQL 14+)
-- GENERATED โดย tools/gen-master-schema.mjs — อย่าแก้ด้วยมือ (แก้ที่ต้นทางแล้วรันใหม่)
--   ต้นทาง: ${path.basename(HTML_FILE)} · ${path.basename(XLSX_FILE)} (8_Field_Spec) · ${path.basename(DRAWIO_FILE)}
--   ${tableOrder.length} ตาราง master (SYS ${tableOrder.filter((k) => tables[k].scope === 'SYS').length} · ENT ${tableOrder.filter((k) => tables[k].scope === 'ENT').length})
--   + ${tableOrder.reduce((n, k) => n + tables[k].items.length, 0)} ตารางรายการลูก (…item) + 6 ตาราง metadata + 4 view + 1 ฟังก์ชัน
--
-- หลักการ (อ่านคู่กับ README.md):
--   1) ทุกตาราง ENT มี entitygroupid + businessentityid (ระบบเติมจาก "ใช้กับ") · code ห้ามซ้ำภายในนิติบุคคล (รวม draft/block)
--   2) FK ระหว่าง master เป็น composite (businessentityid, <คอลัมน์>) → อ้างข้ามนิติบุคคลไม่ได้ · ตาราง SYS ใช้ FK ธรรมดา
--   3) FK ไม่บังคับ = คอลัมน์ NULL ได้ ; FK บังคับ (ช่อง *) = NOT NULL · ลบรายการที่ถูกอ้างอยู่ไม่ได้ (RESTRICT, V15)
--   4) "ต้องมีก่อน" ระดับ step และ "ลำดับแท็บย่อยที่แนะนำ" ไม่ใช่ FK — เก็บเป็นข้อมูลใน ${META.step} ฯลฯ (ดู 02-setup-metadata.sql)
--   0) ชื่อตารางจริงทุกตัวขึ้นต้น ${TABLE_PREFIX} (เช่น ${P('employee')}) — ชื่อใน mockup/API/metadata คือชื่อหลังตัด prefix ; view/ฟังก์ชันชื่อเดิม
--   5) ส่วนขยายนอก mockup/สเปก ${EXTENSIONS.length} คอลัมน์ (ผูก ③ ช่องทาง → ประเภทติดต่อ → ไฟล์แนบ): ${EXTENSIONS.map((x) => `${x.table}.${x.name}`).join(', ')}
-- ════════════════════════════════════════════════════════════════════════════
CREATE SCHEMA IF NOT EXISTS ${SCHEMA};
SET search_path = ${SCHEMA}, public;
`;
  const body = [];
  body.push('-- ═══ 1) ตาราง master + ตารางรายการลูก (เรียงตามลำดับ step ①→㉛) ═══');
  for (const key of tableOrder) {
    body.push(emitTable(tables[key]));
    tables[key].items.forEach((it) => body.push(emitItem(it)));
  }
  body.push('-- ═══ 2) ข้อจำกัดเพิ่มเติม (UNIQUE ของรายการลูก) ═══\n' + uniqueSql().join('\n'));
  body.push('-- ═══ 3) Foreign keys (แยกไว้ท้าย เพราะมีวงจรที่ต้องเติมทีหลัง: แผนก↔ตำแหน่ง, กลุ่มขั้นตอน↔ขั้นตอน, นิติบุคคล↔สกุลเงิน) ═══\n' + fkSql().join('\n'));
  body.push('-- ═══ 4) Index ของคอลัมน์ FK (ให้ "ใช้อยู่ใน" / ตรวจก่อนลบ เร็ว) ═══\n' + indexSql().join('\n'));
  body.push('-- ═══ 5) Comment ภาษาไทยของตาราง/คอลัมน์ ═══\n' + commentSql().join('\n'));
  body.push(metaTablesSql());
  body.push('-- ═══ 6) View / ฟังก์ชันที่หน้าจอเรียกใช้ ═══\n' + viewSql());
  return head + '\n' + body.join('\n\n') + '\n';
}

/* ───────────────────────── 9) Mermaid ───────────────────────── */
const phaseTitle = Object.fromEntries(phases.map((p) => [p.code, p.name]));
function erForPhase(ph) {
  const stepsIn = steps.filter((s) => s.phase === ph && !s.permFields);
  const inPhase = new Set();
  const lines = ['erDiagram'];
  const blocks = [];
  const rels = [];
  const entityRow = (n, type, keys, cm) => `    ${type} ${n}${keys ? ' ' + keys : ''}${cm ? ` "${cm}"` : ''}`;
  for (const s of stepsIn) {
    for (const key of s.tables) {
      if (homeStep[key].step !== s.code) continue;
      inPhase.add(key);
      const t = tables[key];
      const rows = [entityRow('id', 'bigint', 'PK'), entityRow('code', 'varchar', 'UK', t.scope === 'ENT' ? 'unique ต่อนิติบุคคล' : 'unique ทั้งระบบ'), entityRow('name', 'varchar')];
      t.cols.filter((c) => c.ref).forEach((c) => rows.push(entityRow(c.name, 'bigint', 'FK', c.required ? 'บังคับ' : '')));
      blocks.push(`  ${key} {\n${rows.join('\n')}\n  }`);
      t.cols.filter((c) => c.ref).forEach((c) => rels.push(`  ${c.ref} ${c.required ? '||' : '|o'}--o{ ${key} : "${c.name}"`));
      for (const it of t.items) {
        const irows = [entityRow('id', 'bigint', 'PK'), entityRow(it.parentCol, 'bigint', 'FK', 'แม่')];
        it.cols.filter((c) => c.ref).forEach((c) => irows.push(entityRow(c.name, 'bigint', 'FK', c.required ? 'บังคับ' : '')));
        blocks.push(`  ${it.name} {\n${irows.join('\n')}\n  }`);
        rels.push(`  ${key} ||--o{ ${it.name} : "${it.parentCol}"`);
        it.cols.filter((c) => c.ref).forEach((c) => rels.push(`  ${c.ref} ${c.required ? '||' : '|o'}--o{ ${it.name} : "${c.name}"`));
      }
    }
  }
  return [...lines, ...blocks, ...rels].join('\n');
}

const ownerClass = (code) => ({ '#FFE599': 'S', '#B4CCF0': 'E', '#E6E8EC': 'U', '#B9DDB0': 'K' })[draw[code]?.fill] ?? 'U';
function stepFlowMermaid() {
  const L = ['flowchart LR'];
  for (const p of phases) {
    L.push(`  subgraph ${p.code}["หมวด ${p.sort - 1} · ${p.name}"]`);
    steps.filter((s) => s.phase === p.code).forEach((s) => L.push(`    s${s.no}["${circled(s.no)} ${s.name}${s.golive ? ' ★' : ''}"]:::${ownerClass(s.code)}`));
    L.push('  end');
  }
  for (const s of steps) for (const d of s.deps) if (d !== 'entity') L.push(`  s${stepByCode[d].no} --> s${s.no}`);
  L.push('  classDef S fill:#FFE599,stroke:#B38F00,color:#000');
  L.push('  classDef E fill:#B4CCF0,stroke:#3D6FB6,color:#000');
  L.push('  classDef U fill:#F2F3F5,stroke:#8A8F98,color:#000');
  L.push('  classDef K fill:#B9DDB0,stroke:#5C9A4B,color:#000');
  return L.join('\n');
}

/* ───────────────────────── 10) ผลลัพธ์ ───────────────────────── */
if (problems.length) {
  console.error('✗ สร้างไม่ได้ — พบปัญหา ' + problems.length + ' จุด:\n  - ' + problems.join('\n  - '));
  process.exit(1);
}
fs.mkdirSync(OUT, { recursive: true });
const write = (f, s) => fs.writeFileSync(path.join(OUT, f), s.endsWith('\n') ? s : s + '\n', 'utf8');

write('01-schema.sql', buildSchemaSql());
write('02-setup-metadata.sql', metaInsertSql());
write(
  'er-by-phase.md',
  `# ER diagram แยกตามหมวด (0–5)

> GENERATED โดย \`tools/gen-master-schema.mjs\` — อย่าแก้ด้วยมือ

อ่านอย่างไร
- แสดงเฉพาะ **คอลัมน์กุญแจ** (PK / UK / FK) ของแต่ละตาราง เพื่อให้เห็นความสัมพันธ์ — ฟิลด์ครบทุกตัวอยู่ใน \`01-schema.sql\`
- เส้น \`||--o{\` = FK **บังคับ** (ช่อง *, NOT NULL) · เส้น \`|o--o{\` = FK **ไม่บังคับ** (NULL ได้ คีย์ทีหลังได้)
- **ชื่อในแผนภาพคือชื่อใน mockup/API** — ชื่อตารางจริงในฐานข้อมูลขึ้นต้นด้วย \`${TABLE_PREFIX}\` (เช่น \`employee\` = \`${P('employee')}\`)
- ตารางที่ไม่มีรายละเอียดคอลัมน์ในกรอบ = ตารางของหมวดอื่นที่ถูกอ้างถึง
- ตาราง ENT ทุกตารางมี \`entitygroupid\` + \`businessentityid\` (ไม่วาดเส้นเพื่อไม่ให้รก) — ดู README §3
- ตารางที่ลงท้าย \`…item\` = ข้อมูลรายการ (แท็บลูกในหน้า modal) ผูกกับแม่ด้วย ON DELETE CASCADE

${phases.map((p) => `## หมวด ${p.sort - 1} · ${p.name}\n\n\`\`\`mermaid\n${erForPhase(p.code)}\n\`\`\`\n`).join('\n')}`,
);
write(
  'master-model.generated.json',
  JSON.stringify(
    {
      generatedFrom: [path.basename(HTML_FILE), path.basename(XLSX_FILE), path.basename(DRAWIO_FILE)],
      schema: SCHEMA,
      phases,
      steps: steps.map((s) => ({ no: s.no, code: s.code, phase: s.phase, name: s.name, golive: s.golive, deps: s.deps, tables: s.permFields ? [] : s.tables, optional: s.optional, doneRule: s.permFields ? 'ENTITY_PERMISSIONS' : 'TABLES', permFields: s.permFields })),
      tables: tableOrder.map((k) => ({
        key: k,
        label: tables[k].label,
        physicalName: P(k),
        scope: tables[k].scope,
        level: tables[k].level,
        homeStep: tables[k].home.step,
        columns: tables[k].cols.map((c) => ({ name: c.name, label: c.label, sql: c.sql, required: c.required, ref: c.ref, options: c.options, ...(c.extension ? { extension: true } : {}) })),
        items: tables[k].items.map((it) => ({ name: it.name, physicalName: P(it.name), parentColumn: it.parentCol, columns: it.cols.map((c) => ({ name: c.name, label: c.label, sql: c.sql, required: c.required, ref: c.ref, options: c.options })) })),
      })),
      references: fks,
    },
    null,
    1,
  ),
);

/* README: แทนเฉพาะบล็อก gen */
const stats = {
  tables: tableOrder.length,
  sys: tableOrder.filter((k) => tables[k].scope === 'SYS').length,
  ent: tableOrder.filter((k) => tables[k].scope === 'ENT').length,
  items: tableOrder.reduce((n, k) => n + tables[k].items.length, 0),
  cols: tableOrder.reduce((n, k) => n + tables[k].cols.length + tables[k].items.reduce((m, it) => m + it.cols.length, 0), 0),
  fk: fks.length,
  fkMain: fkMain.length,
  fkItem: fks.length - fkMain.length,
  fkReq: fks.filter((f) => f.required).length,
};
const genBlocks = {
  stats: `| รายการ | จำนวน |\n|---|---:|\n| ตาราง master | ${stats.tables} (ข้อมูลกลาง SYS ${stats.sys} · แยกตามนิติบุคคล ENT ${stats.ent}) |\n| ตารางรายการลูก (\`…item\`) | ${stats.items} |\n| คอลัมน์ข้อมูล (ไม่นับ id/audit/tenant) | ${stats.cols} |\n| FK ระหว่าง master | ${stats.fk} (ตารางหลัก ${stats.fkMain} · รายการลูก ${stats.fkItem}) |\n| ในนั้นเป็น FK **บังคับ** (ช่อง *) | ${stats.fkReq} |\n| FK อ้างตัวเอง | ${selfRefs.length}: ${selfRefs.map((f) => `\`${f.item ?? f.holder}.${f.col}\``).join(', ')} |\n| วงจรอ้างกัน | ${cycles.length}: ${cycles.map((c) => c.map((x) => `\`${x}\``).join(' → ')).join(' · ')} |\n| ตารางที่ไม่มี FK เข้า/ออกเลย | ${isolated.length}: ${isolated.map((x) => `\`${x}\``).join(', ')} |`,
  'step-flow': '```mermaid\n' + stepFlowMermaid() + '\n```',
  crosscheck: crossCheck.length
    ? crossCheck.map((x) => `- ⚠ ${x}`).join('\n')
    : `ตรวจแล้ว **ตรงกันทั้งหมด** — ${steps.length}/${steps.length} step (เลขที่ · ชื่อ · ★ · แท็บย่อยและลำดับ · "ต้องมีก่อน") ระหว่าง drawio กับ \`ST\` ใน mockup, และ FK บังคับทุกเส้นข้าม step อยู่ใน "ต้องมีก่อน"`,
  extensions:
    '| คอลัมน์ที่เพิ่ม | อ้างถึง | บังคับ | ต้องไปแก้ที่ไหนอีก |\n|---|---|---|---|\n' +
    EXTENSIONS.map((x) => `| \`${x.table}.${x.name}\` (${x.label}) | \`${x.ref}\` | ${x.required ? 'บังคับ (NOT NULL)' : 'ไม่บังคับ'} | mockup · สเปก 8_Field_Spec · \`settings.tables.ts\` |`).join('\n'),
  'required-fk':
    '| # | คอลัมน์บังคับ (NOT NULL) | อ้างถึง | step ของผู้ถือ | step ของตารางที่ถูกอ้าง | ใครการันตีว่าต้องมีก่อน |\n|---:|---|---|---|---|---|\n' +
    fks
      .filter((f) => f.required)
      .map((f, i) => {
        const a = homeStep[f.owner];
        const b = homeStep[f.ref];
        const same = a.step === b.step;
        const guard = same ? `แท็บย่อยลำดับ ${b.seq} → ${a.seq} (ลำดับแนะนำ) + ฟอร์มบันทึกไม่ผ่านถ้าไม่เลือก` : `"ต้องมีก่อน" ระดับ step + ฟอร์มบันทึกไม่ผ่านถ้าไม่เลือก`;
        return `| ${i + 1} | \`${f.item ?? f.holder}.${f.col}\`${f.extension ? ' ✱' : ''} | \`${f.ref}\` | ${stepTag(a.step)} | ${stepTag(b.step)} | ${guard} |`;
      })
      .join('\n'),
  'order-violations': orderViolations.length
    ? orderViolations.map((x) => `- ${x}`).join('\n')
    : '- ไม่มี',
  'soft-gaps': softGaps.length
    ? '| step ที่ถือ FK | ชี้ไป step | คอลัมน์ (ไม่บังคับ) |\n|---|---|---|\n' +
      softGaps.map((g) => `| ${circled(stepByCode[g.from].no)} ${stepByCode[g.from].name} | ${circled(stepByCode[g.to].no)} ${stepByCode[g.to].name} | ${g.cols.map((c) => `\`${c}\``).join(', ')} |`).join('\n')
    : 'ไม่มี',
  'item-unique': `| ตารางรายการลูก | เหตุที่ไม่ใส่ UNIQUE |\n|---|---|\n${itemUniqueSkipped.map((x) => `| \`${x.item}\` | ${x.reason}${x.refs.length ? ` (${x.refs.map((r) => `\`${r}\``).join(', ')})` : ''} |`).join('\n')}`,
};
const readme = path.join(OUT, 'README.md');
if (fs.existsSync(readme)) {
  let md = fs.readFileSync(readme, 'utf8');
  for (const [name, body] of Object.entries(genBlocks)) {
    const re = new RegExp(`(<!-- gen:${name} -->)[\\s\\S]*?(<!-- /gen:${name} -->)`);
    if (!re.test(md)) notes.push(`README ไม่มีบล็อก gen:${name}`);
    else md = md.replace(re, (_, a, b) => `${a}\n${body}\n${b}`);
  }
  fs.writeFileSync(readme, md, 'utf8');
} else notes.push('ยังไม่มี README.md — ข้ามการเติมบล็อก gen');

console.log(`✓ ${tableOrder.length} ตาราง master · ${stats.items} ตารางรายการลูก · FK ${stats.fk} (บังคับ ${stats.fkReq}) · วงจร ${cycles.length}`);
console.log(`  drawio ↔ mockup: ${crossCheck.length ? crossCheck.length + ' จุดไม่ตรง' : 'ตรงกันทั้งหมด'}`);
if (crossCheck.length) crossCheck.forEach((x) => console.log('   - ' + x));
if (notes.length) notes.forEach((x) => console.log('  หมายเหตุ: ' + x));
console.log('  เขียนที่ ' + path.relative(ROOT, OUT));
