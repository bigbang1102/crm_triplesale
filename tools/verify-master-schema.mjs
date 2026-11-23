#!/usr/bin/env node
/**
 * verify-master-schema — โหลด docs/masterservice/*.sql ลง PostgreSQL จริง (PGlite = Postgres 17 บน WASM, ไม่ต้องติดตั้งเซิร์ฟเวอร์)
 * แล้วทดสอบพฤติกรรมของแบบที่ออกแบบ: สายผูก ③ (ช่องทาง ← ประเภทติดต่อ ← ไฟล์แนบ), รหัสซ้ำ, อ้างข้ามนิติบุคคล, ลบที่ถูกอ้าง, view V13/V14, ฟังก์ชัน "ใช้อยู่ใน" ฯลฯ
 *
 * ใช้:   npm install --no-save @electric-sql/pglite     (ไม่แก้ package.json)
 *        node tools/verify-master-schema.mjs [--pglite-dir <โฟลเดอร์ที่มี node_modules/@electric-sql/pglite>]
 * ออกด้วยรหัส 1 ถ้ามีกรณีไม่ผ่าน
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const argIdx = process.argv.indexOf('--pglite-dir');
let PGlite;
try {
  const mod = argIdx > 0
    ? await import(pathToFileURL(path.join(process.argv[argIdx + 1], 'node_modules/@electric-sql/pglite/dist/index.js')).href)
    : await import('@electric-sql/pglite');
  PGlite = mod.PGlite;
} catch {
  console.error('ไม่พบ @electric-sql/pglite — รัน: npm install --no-save @electric-sql/pglite  (หรือส่ง --pglite-dir)');
  process.exit(2);
}
const DIR = path.join(HERE, '..', 'docs', 'masterservice') + '/';

const db = new PGlite();
let pass = 0;
let failN = 0;
const ok = (name, cond, extra = '') => {
  if (cond) pass++;
  else {
    failN++;
    console.log('  ✗ FAIL:', name, extra);
  }
};
// ชื่อตารางจริงขึ้นต้น con_master_ ; ข้อความ SQL ในไฟล์ทดสอบนี้เขียนด้วย "ชื่อใน mockup" (เช่น FROM employee)
// จึงแปลงเป็นชื่อจริงก่อนส่งเข้าฐานข้อมูล — เฉพาะหลังคำ FROM/INTO/UPDATE/JOIN/TABLE (ไม่แตะชื่อคอลัมน์หรือค่าที่เป็นสตริง)
const PREFIX = 'con_master_';
const model = JSON.parse(fs.readFileSync(DIR + 'master-model.generated.json', 'utf8'));
const NAMES = new Set(model.tables.flatMap((t) => [t.key, ...t.items.map((i) => i.name)]));
const META = { setup_phase: 'setup_phase', setup_step: 'setup_step', setup_step_table: 'setup_step_table', setup_step_dependency: 'setup_step_dependency', master_table_registry: 'table_registry', master_ref: 'table_ref' };
const fix = (sql) =>
  sql.replace(/\b(FROM|INTO|UPDATE|JOIN|TABLE)(\s+)([a-z_0-9]+)\b/g, (m, kw, sp, name) =>
    NAMES.has(name) ? `${kw}${sp}${PREFIX}${name}` : META[name] ? `${kw}${sp}${PREFIX}${META[name]}` : m);
const exec = async (sql) => db.exec(fix(sql));
const q = async (sql, params) => (await db.query(fix(sql), params)).rows;
async function mustFail(name, sql, pattern) {
  try {
    await db.exec(fix(sql));
    ok(name, false, '(ควร error แต่สำเร็จ)');
  } catch (e) {
    const m = String(e.message);
    ok(name, !pattern || pattern.test(m), `(error อื่น: ${m.slice(0, 160)})`);
  }
}
async function mustPass(name, sql) {
  try {
    await db.exec(fix(sql));
    ok(name, true);
  } catch (e) {
    ok(name, false, String(e.message).slice(0, 200));
  }
}

console.log('── โหลด DDL');
try { await db.exec(fs.readFileSync(DIR + '01-schema.sql', 'utf8')); } catch (e) { console.log('SQL ERROR:', e.message, '| position', e.position); process.exit(2); }
try { await db.exec(fs.readFileSync(DIR + '02-setup-metadata.sql', 'utf8')); } catch (e) { console.log('META ERROR:', e.message, '| position', e.position); process.exit(2); }
await db.exec('SET search_path = masterdata, public');

const nTables = (await q(`SELECT count(*)::int n FROM information_schema.tables WHERE table_schema='masterdata' AND table_type='BASE TABLE'`))[0].n;
console.log('  ตารางทั้งหมดใน schema:', nTables);
ok('จำนวนตาราง = 72 + 37 + 6 metadata', nTables === 72 + 37 + 6, String(nTables));
const noPrefix = (await q(`SELECT table_name FROM information_schema.tables WHERE table_schema='masterdata' AND table_type='BASE TABLE' AND table_name NOT LIKE 'con\\_master\\_%'`)).map((r) => r.table_name);
ok('ทุกตารางที่สร้างขึ้นต้นด้วย con_master_', noPrefix.length === 0, noPrefix.slice(0, 5).join(', '));
const physMismatch = await q(`SELECT table_name, physical_name FROM master_table_registry WHERE physical_name <> '${PREFIX}' || table_name OR to_regclass('masterdata.' || physical_name) IS NULL`);
ok('registry.physical_name = prefix + table_name และมีตารางนั้นจริง ครบ 72', physMismatch.length === 0 && (await q('SELECT count(*)::int n FROM master_table_registry'))[0].n === 72, JSON.stringify(physMismatch.slice(0, 3)));
const viewsOk = (await q(`SELECT count(*)::int n FROM information_schema.views WHERE table_schema='masterdata' AND table_name LIKE 'v\\_%'`))[0].n;
ok('view 5 ตัวยังชื่อเดิม (v_…)', viewsOk === 5, String(viewsOk));

console.log('── ทะเบียน FK (con_master_table_ref) ต้องตรงกับ FK จริง');
const real = await q(`
  SELECT c.conrelid::regclass::text AS holder, c.confrelid::regclass::text AS ref, c.confdeltype AS del,
         (SELECT array_agg(a.attname::text ORDER BY k.ord) FROM unnest(c.conkey) WITH ORDINALITY k(attnum, ord) JOIN pg_attribute a ON a.attrelid = c.conrelid AND a.attnum = k.attnum) AS cols
    FROM pg_constraint c JOIN pg_namespace n ON n.oid = c.connamespace
   WHERE c.contype = 'f' AND n.nspname = 'masterdata'`);
const norm = (s) => s.replace(/^masterdata\./, '').replace(/"/g, '').replace(/^con_master_/, '');
const registry = new Set((await q('SELECT table_name FROM master_table_registry')).map((r) => r.table_name));
// FK จริงที่เป็น "ข้อมูล" = ฝั่งตารางที่ถูกอ้างอยู่ใน registry และไม่ใช่ FK ของนิติบุคคล/แม่-ลูก
const realData = real
  .map((r) => ({ holder: norm(r.holder), ref: norm(r.ref), cols: r.cols, del: r.del }))
  .filter((r) => registry.has(r.ref))
  .map((r) => ({ ...r, col: r.cols[r.cols.length - 1] }));
const refs = await q('SELECT * FROM master_ref');
const key = (h, c, r) => `${h}.${c}->${r}`;
const realKeys = new Set();
for (const r of realData) {
  // FK ที่ชี้ businessentity จาก tenant (businessentityid+entitygroupid) และ FK ลูก→แม่ ไม่อยู่ใน master_ref
  if (r.ref === 'businessentity' && r.cols.join() === 'businessentityid,entitygroupid') continue;
  const isParent = r.del === 'c'; // ON DELETE CASCADE = ลิงก์รายการลูก→แม่
  if (isParent) continue;
  realKeys.add(key(r.holder, r.col, r.ref));
}
const metaKeys = new Set(refs.map((m) => key(m.holder_table, m.holder_column, m.ref_table)));
const onlyMeta = [...metaKeys].filter((k) => !realKeys.has(k));
const onlyReal = [...realKeys].filter((k) => !metaKeys.has(k));
ok('master_ref ไม่มีเส้นที่ไม่มีใน FK จริง', onlyMeta.length === 0, onlyMeta.slice(0, 5).join(' | '));
ok('FK จริงทุกเส้นอยู่ใน master_ref', onlyReal.length === 0, onlyReal.slice(0, 5).join(' | '));
console.log('  master_ref', refs.length, 'แถว · FK จริง (ข้อมูล)', realKeys.size);

console.log('── ตัวอย่าง ③ ช่องทางและเอกสาร + นิติบุคคล 2 ราย');
await exec(`
  INSERT INTO entitygroup (code, name) VALUES ('EG01', 'SUN GROUP');
  INSERT INTO businessentity (code, name, entitygroupid) VALUES ('SUN', 'SUN GATEWAY', 1), ('GGW', 'GGW', 1);
`);
const be = Object.fromEntries((await q('SELECT id, code FROM businessentity')).map((r) => [r.code, r.id]));
const SUN = be.SUN;
const GGW = be.GGW;
const ins = (t, b, code, name, extra = '', extraVal = '') =>
  `INSERT INTO ${t} (entitygroupid, businessentityid, code, name${extra}) VALUES (1, ${b}, '${code}', '${name}'${extraVal})`;

// ③ ผูกกันเป็นสาย (ส่วนขยายนอกสเปก): ช่องทางที่สะดวก ← ประเภทการติดต่อ ← ประเภทไฟล์แนบ
await mustFail('③ สร้าง "ประเภทการติดต่อ" โดยยังไม่มี "ช่องทางที่สะดวก" → ปฏิเสธ (NOT NULL)', ins('contacttype', SUN, 'CALL', 'โทรติดตาม'), /null value|not-null/i);
await mustFail('③ สร้าง "ประเภทไฟล์แนบ" โดยยังไม่มี "ประเภทการติดต่อ" → ปฏิเสธ (NOT NULL)', ins('attachfiletype', SUN, 'IDC', 'สำเนาบัตรประชาชน'), /null value|not-null/i);
const v14ch = await q(`SELECT holder_table, ref_table FROM v_field_prerequisite WHERE businessentityid=${SUN} AND holder_table IN ('contacttype','attachfiletype') ORDER BY holder_table`);
ok('V14: ③ บอกว่า attachfiletype ขาด contacttype และ contacttype ขาด communicationtype', JSON.stringify(v14ch) === JSON.stringify([{ holder_table: 'attachfiletype', ref_table: 'contacttype' }, { holder_table: 'contacttype', ref_table: 'communicationtype' }]), JSON.stringify(v14ch));
await mustPass('③ สร้างช่องทางที่สะดวก', ins('communicationtype', SUN, 'TEL', 'โทรศัพท์'));
const comSun = (await q(`SELECT id FROM communicationtype WHERE businessentityid=${SUN} AND code='TEL'`))[0].id;
await mustPass('③ สร้างประเภทการติดต่อ (มีแม่แล้ว)', `INSERT INTO contacttype (entitygroupid, businessentityid, code, name, communicationtypeid) VALUES (1, ${SUN}, 'CALL', 'โทรติดตาม', ${comSun})`);
const conSun = (await q(`SELECT id FROM contacttype WHERE businessentityid=${SUN} AND code='CALL'`))[0].id;
const st0 = await q(`SELECT is_done FROM v_setup_step_status WHERE businessentityid=${SUN} AND step_code='channel'`);
ok('③ ยังไม่เสร็จ (ขาด attachfiletype, documentcategory)', st0[0].is_done === false);
await mustPass('③ สร้างประเภทไฟล์แนบ (มีแม่แล้ว)', `INSERT INTO attachfiletype (entitygroupid, businessentityid, code, name, contacttypeid) VALUES (1, ${SUN}, 'IDC', 'สำเนาบัตรประชาชน', ${conSun})`);
const st1 = await q(`SELECT is_done FROM v_setup_step_status WHERE businessentityid=${SUN} AND step_code='channel'`);
ok('③ ยังไม่เสร็จ (ขาด documentcategory)', st1[0].is_done === false);
await mustPass('③ ประเภทงานเอกสารไม่ผูกกับใคร สร้างได้เลย', ins('documentcategory', SUN, 'QT', 'ใบเสนอราคา'));
const st2 = await q(`SELECT is_done FROM v_setup_step_status WHERE businessentityid=${SUN} AND step_code='channel'`);
ok('③ เสร็จเมื่อครบ 4 ตารางบังคับ (datamoduletype ไม่บังคับ)', st2[0].is_done === true);
const stG = await q(`SELECT is_done FROM v_setup_step_status WHERE businessentityid=${GGW} AND step_code='channel'`);
ok('③ ของ GGW ยังไม่เสร็จ (แยกตามนิติบุคคล)', stG[0].is_done === false);

console.log('── ความสมบูรณ์ของข้อมูล');
await mustFail('รหัสซ้ำในนิติบุคคลเดียวกัน (รวม draft/block)', ins('communicationtype', SUN, 'TEL', 'ซ้ำ'), /uq_con_master_communicationtype_code|unique/i);
await mustPass('รหัสเดียวกันต่างนิติบุคคลได้', ins('communicationtype', GGW, 'TEL', 'โทรศัพท์'));
const comGgw = (await q(`SELECT id FROM communicationtype WHERE businessentityid=${GGW} AND code='TEL'`))[0].id;
await mustFail('③ ประเภทการติดต่อของ SUN อ้างช่องทางของ GGW → ปฏิเสธ (composite FK)', `INSERT INTO contacttype (entitygroupid, businessentityid, code, name, communicationtypeid) VALUES (1, ${SUN}, 'X9', 'x', ${comGgw})`, /fk_con_master_contacttype_communicationtypeid/);
await mustFail('③ ลบช่องทางที่มีประเภทการติดต่ออ้างอยู่ (V15)', `DELETE FROM communicationtype WHERE id=${comSun}`, /violates RESTRICT|violates foreign key/);
await mustFail('③ ลบประเภทการติดต่อที่มีประเภทไฟล์แนบอ้างอยู่ (V15)', `DELETE FROM contacttype WHERE id=${conSun}`, /violates RESTRICT|violates foreign key/);
const usedCh = await q(`SELECT owner_table, owner_code FROM fn_master_used_by(${SUN}, 'communicationtype', ${comSun})`);
ok('ใช้อยู่ใน: ช่องทาง TEL ถูกประเภทการติดต่อ CALL อ้างอยู่', usedCh.length === 1 && usedCh[0].owner_table === 'contacttype' && usedCh[0].owner_code === 'CALL', JSON.stringify(usedCh));
const usedCt = await q(`SELECT owner_table, owner_code FROM fn_master_used_by(${SUN}, 'contacttype', ${conSun})`);
ok('ใช้อยู่ใน: ประเภทการติดต่อ CALL ถูกประเภทไฟล์แนบ IDC อ้างอยู่', usedCt.length === 1 && usedCt[0].owner_table === 'attachfiletype' && usedCt[0].owner_code === 'IDC', JSON.stringify(usedCt));
await mustFail('สถานะนอก release/draft/block', ins('communicationtype', SUN, 'X1', 'x', ', usagestatus', ", 'foo'"), /ck_con_master_communicationtype_usagestatus/);
await mustFail('รหัสมีอักขระต้องห้าม', ins('communicationtype', SUN, 'A B', 'x'), /ck_con_master_communicationtype_code_fmt/);
await mustFail('ชื่อเป็นช่องว่างล้วน', ins('communicationtype', SUN, 'X2', '   '), /ck_con_master_communicationtype_name_notblank/);
await mustFail('entitygroup ไม่ตรงกับ businessentity (composite FK)', `INSERT INTO communicationtype (entitygroupid, businessentityid, code, name) VALUES (999, ${SUN}, 'X3', 'x')`, /fk_con_master_communicationtype_businessentity/);

// FK บังคับ + อ้างข้ามนิติบุคคล
await mustFail('customertype ต้องมี companytype (NOT NULL)', ins('customertype', SUN, 'PS', 'บุคคล'), /null value|not-null/i);
await mustPass('companytype SUN', ins('companytype', SUN, 'RT', 'ร้านค้าปลีก'));
await mustPass('companytype GGW', ins('companytype', GGW, 'RT', 'ร้านค้าปลีก'));
const ctSun = (await q(`SELECT id FROM companytype WHERE businessentityid=${SUN}`))[0].id;
const ctGgw = (await q(`SELECT id FROM companytype WHERE businessentityid=${GGW}`))[0].id;
await mustPass('customertype ผูก companytype ของนิติบุคคลเดียวกัน', `INSERT INTO customertype (entitygroupid, businessentityid, code, name, companytypeid) VALUES (1, ${SUN}, 'PS', 'บุคคล', ${ctSun})`);
await mustFail('customertype ของ SUN อ้าง companytype ของ GGW → ถูกปฏิเสธ', `INSERT INTO customertype (entitygroupid, businessentityid, code, name, companytypeid) VALUES (1, ${SUN}, 'PS2', 'x', ${ctGgw})`, /fk_con_master_customertype_companytypeid/);
await mustFail('ลบ companytype ที่ถูกอ้างอยู่ (V15)', `DELETE FROM companytype WHERE id=${ctSun}`, /fk_con_master_customertype_companytypeid|violates foreign key/);

// V14 + V13 + fn_master_used_by
const v14 = await q(`SELECT holder_table, holder_column, ref_table FROM v_field_prerequisite WHERE businessentityid=${GGW} AND holder_table='customertype'`);
ok('V14: GGW มี companytype แล้ว → ไม่ต้องเตือน', v14.length === 0);
await exec(`DELETE FROM companytype WHERE id=${ctGgw}`);
const v14b = await q(`SELECT ref_table FROM v_field_prerequisite WHERE businessentityid=${GGW} AND holder_table='customertype'`);
ok('V14: GGW ไม่มี companytype → เตือนให้สร้างก่อน', v14b.length === 1 && v14b[0].ref_table === 'companytype');
const used = await q(`SELECT * FROM fn_master_used_by(${SUN}, 'companytype', ${ctSun})`);
ok('ใช้อยู่ใน: companytype ถูก customertype PS อ้างอยู่', used.length === 1 && used[0].owner_table === 'customertype' && used[0].owner_code === 'PS', JSON.stringify(used));
const blk = await q(`SELECT missing_step_code FROM v_setup_step_blocker WHERE businessentityid=${SUN} AND step_code='org'`);
ok('V13: ⑨ โครงสร้างองค์กร ถูกบล็อกเพราะ ⑧ สาขา ยังไม่มี', blk.length === 1 && blk[0].missing_step_code === 'branch', JSON.stringify(blk));
await exec(ins('branch', SUN, 'BKK', 'กรุงเทพฯ', ', address', ", '99/9 ถ.รัชดาภิเษก'"));
const blk2 = await q(`SELECT missing_step_code FROM v_setup_step_blocker WHERE businessentityid=${SUN} AND step_code='org'`);
ok('V13: สร้างสาขา (usagestatus=release) แล้วหายบล็อก', blk2.length === 0, JSON.stringify(blk2));
const blk3 = await q(`SELECT missing_step_code FROM v_setup_step_blocker WHERE businessentityid=${SUN} AND step_code='channel'`);
ok('V13: ③ ต้องมี ① (entity) — มี release แล้วจึงไม่บล็อก', blk3.length === 0, JSON.stringify(blk3));

console.log('── นิติบุคคล ↔ สกุลเงิน (วงจร) และ SYS');
await exec(`INSERT INTO currency (entitygroupid, businessentityid, code, name) VALUES (1, ${SUN}, 'THB', 'บาท'), (1, ${GGW}, 'THB', 'บาท')`);
const curSun = (await q(`SELECT id FROM currency WHERE businessentityid=${SUN}`))[0].id;
const curGgw = (await q(`SELECT id FROM currency WHERE businessentityid=${GGW}`))[0].id;
await mustFail('businessentity SUN ใช้สกุลเงินของ GGW → ถูกปฏิเสธ', `UPDATE businessentity SET currencyid=${curGgw} WHERE id=${SUN}`, /fk_con_master_businessentity_currencyid/);
await mustPass('businessentity SUN ใช้สกุลเงินของตัวเอง', `UPDATE businessentity SET currencyid=${curSun} WHERE id=${SUN}`);
await mustFail('ฟิลด์สิทธิ์เริ่มต้นนอกตัวเลือก', `UPDATE businessentity SET default_permission_lead='x' WHERE id=${SUN}`, /ck_con_master_businessentity_default_permission_lead/);
await mustPass('ตั้งสิทธิ์เริ่มต้น Lead/Prospect', `UPDATE businessentity SET default_permission_lead='private', default_permission_prospect='private' WHERE id=${SUN}`);
const dp = await q(`SELECT is_done FROM v_setup_step_status WHERE businessentityid=${SUN} AND step_code='defperm'`);
ok('step ㉒ เสร็จเมื่อตั้งสิทธิ์ครบ (done_rule ENTITY_PERMISSIONS)', dp[0].is_done === true);

console.log('── โครงสร้างองค์กร / พนักงาน / รายการลูก');
await exec(`
  INSERT INTO department (entitygroupid, businessentityid, code, name) VALUES (1, ${SUN}, 'D01', 'ฝ่ายขาย'), (1, ${GGW}, 'D01', 'ฝ่ายขาย');
  INSERT INTO positionorganize (entitygroupid, businessentityid, code, name, departmenttype) VALUES (1, ${SUN}, 'ORG1', 'สำนักงานขาย', 'S');
`);
const org = (await q(`SELECT id FROM positionorganize WHERE businessentityid=${SUN}`))[0].id;
await mustPass('position (คีย์เฉพาะที่จำเป็น)', `INSERT INTO position (entitygroupid, businessentityid, code, name, positionorganizeid) VALUES (1, ${SUN}, 'P01', 'ผู้จัดการ', ${org})`);
const pos = (await q(`SELECT id FROM position WHERE businessentityid=${SUN}`))[0].id;
await mustFail('position ผู้บังคับบัญชาเป็นตัวเอง', `UPDATE position SET commander_position1id=${pos} WHERE id=${pos}`, /commander_position1id_not_self/);
await mustFail('position สัดส่วนรวม ≠ 100', `UPDATE position SET competency_ratio=40, kpi_ratio=40, attendance_ratio=10 WHERE id=${pos}`, /ratio_sum/);
await mustPass('position สัดส่วนรวม = 100', `UPDATE position SET competency_ratio=40, kpi_ratio=40, attendance_ratio=20 WHERE id=${pos}`);
await mustPass('วงจร: แผนกอ้างตำแหน่งผ่านรายการอัตรากำลัง', `INSERT INTO positionorganizemanpoweritem (businessentityid, positionorganizeid, positionid, manpower) VALUES (${SUN}, ${org}, ${pos}, 3)`);
await exec(`INSERT INTO systemname (code, name, url) VALUES ('TS', 'Triple Sales', 'https://triplesales.app')`);
const sys = (await q(`SELECT id FROM systemname`))[0].id;
await mustFail('systemname url ต้องขึ้นต้น http(s)', `INSERT INTO systemname (code, name, url) VALUES ('X', 'x', 'ftp://a')`, /ck_con_master_systemname_url_fmt/);
const dSun = (await q(`SELECT id FROM department WHERE businessentityid=${SUN}`))[0].id;
const dGgw = (await q(`SELECT id FROM department WHERE businessentityid=${GGW}`))[0].id;
await mustFail('employee SUN อ้าง department ของ GGW → ถูกปฏิเสธ', `INSERT INTO employee (entitygroupid, businessentityid, code, name, departmentid) VALUES (1, ${SUN}, 'E99', 'x', ${dGgw})`, /fk_con_master_employee_departmentid/);
await mustFail('เบอร์โทรผิดรูปแบบ', `INSERT INTO employee (entitygroupid, businessentityid, code, name, phone_number) VALUES (1, ${SUN}, 'E98', 'x', 'abc')`, /ck_con_master_employee_phone_number_fmt/);
await mustPass('employee SUN', `INSERT INTO employee (entitygroupid, businessentityid, code, name, departmentid, phone_number) VALUES (1, ${SUN}, 'E01', 'สมชาย', ${dSun}, '02-123-4567')`);
const emp = (await q(`SELECT id FROM employee WHERE businessentityid=${SUN}`))[0].id;
await mustPass('employeesystemitem (ระบบที่ใช้)', `INSERT INTO employeesystemitem (businessentityid, employeeid, systemnameid) VALUES (${SUN}, ${emp}, ${sys})`);
await mustFail('employeesystemitem ซ้ำระบบเดิม (V08)', `INSERT INTO employeesystemitem (businessentityid, employeeid, systemnameid) VALUES (${SUN}, ${emp}, ${sys})`, /uq_con_master_employeesystemitem_main_ref/);
await mustPass('employeesubpositionitem ตำแหน่งหลัก', `INSERT INTO employeesubpositionitem (businessentityid, employeeid, positionid, is_main) VALUES (${SUN}, ${emp}, ${pos}, 'Y')`);
await mustPass('position ที่ 2', `INSERT INTO position (entitygroupid, businessentityid, code, name, positionorganizeid) VALUES (1, ${SUN}, 'P02', 'พนักงาน', ${org})`);
const pos2 = (await q(`SELECT id FROM position WHERE code='P02'`))[0].id;
await mustFail('ตำแหน่งหลักได้ไม่เกิน 1', `INSERT INTO employeesubpositionitem (businessentityid, employeeid, positionid, is_main) VALUES (${SUN}, ${emp}, ${pos2}, 'Y')`, /uq_con_master_employeesubpositionitem_one_main/);
const used2 = await q(`SELECT owner_table, owner_code, via_column FROM fn_master_used_by(${SUN}, 'systemname', ${sys})`);
ok('ใช้อยู่ใน: systemname (SYS) ถูกพนักงานผ่านรายการลูกอ้างอยู่', used2.some((r) => r.owner_table === 'employee' && r.owner_code === 'E01'), JSON.stringify(used2));
await mustFail('ลบ position ที่ถูกอ้างอยู่', `DELETE FROM position WHERE id=${pos}`, /violates RESTRICT|violates foreign key/);
await exec(`DELETE FROM employee WHERE id=${emp}`);
const left = (await q(`SELECT (SELECT count(*)::int FROM employeesystemitem) a, (SELECT count(*)::int FROM employeesubpositionitem) b`))[0];
ok('ลบ employee → รายการลูกถูกลบตาม (CASCADE)', left.a === 0 && left.b === 0, JSON.stringify(left));

console.log('── ความสอดคล้อง metadata');
const prog = await q(`SELECT done_steps, total_steps FROM v_go_live_progress WHERE businessentityid=${SUN}`);
console.log('  พร้อมเปิดใช้งาน SUN:', JSON.stringify(prog[0]));
ok('จำนวน step ★ ใน v_go_live_progress = 20', prog[0].total_steps === (await q(`SELECT count(*)::int n FROM setup_step WHERE required_for_golive`))[0].n);
ok('step 31 ขั้น', (await q('SELECT count(*)::int n FROM setup_step'))[0].n === 31);
ok('ทะเบียน 72 ตาราง', registry.size === 72);

console.log('── 03-example-channel.sql (บน DB ใหม่)');
{
  const db2 = new PGlite();
  await db2.exec(fs.readFileSync(DIR + '01-schema.sql', 'utf8'));
  await db2.exec(fs.readFileSync(DIR + '02-setup-metadata.sql', 'utf8'));
  const res = (await db2.exec(fs.readFileSync(DIR + '03-example-channel.sql', 'utf8'))).filter((r) => r.fields?.length);
  // ผลของ SELECT ตามลำดับในไฟล์: [0] V14 · [1] ③ ยังไม่เสร็จ · [2] แท็บ/seq · [3] SUN เสร็จ-GGW ไม่ · [4] ใช้อยู่ใน
  ok('ตัวอย่าง ③: ก่อนสร้างสาย V14 เตือน 2 จุด', res[0].rows.length === 2 && res[0].rows[0].holder_table === 'attachfiletype');
  ok('ตัวอย่าง ③: สร้างสายแล้ว ③ ยังไม่เสร็จ (ขาด documentcategory)', res[1].rows[0].is_done === false);
  const seq = Object.fromEntries(res[2].rows.map((r) => [r.table_name, r.release_count]));
  ok('ตัวอย่าง ③: แท็บแรกที่ว่างคือ documentcategory (seq 4)', seq.communicationtype === 3 && seq.contacttype === 1 && seq.attachfiletype === 1 && seq.documentcategory === 0 && res[2].rows[3].table_name === 'documentcategory');
  ok('ตัวอย่าง ③: SUN เสร็จ / GGW ยังไม่เสร็จ', res[3].rows.find((r) => r.entity === 'SUN').is_done === true && res[3].rows.find((r) => r.entity === 'GGW').is_done === false);
  ok('ตัวอย่าง ③: ช่องทาง TEL ถูกประเภทการติดต่อ CALL อ้างอยู่', res[4].rows.length === 1 && res[4].rows[0].owner_table === 'contacttype' && res[4].rows[0].owner_code === 'CALL');
}

console.log(`
ผล: ผ่าน ${pass} · ไม่ผ่าน ${failN}`);
process.exit(failN ? 1 : 0);
