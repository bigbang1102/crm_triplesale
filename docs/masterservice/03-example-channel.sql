-- ════════════════════════════════════════════════════════════════════════════
-- ตัวอย่างลงมือจริง: ③ ช่องทางและเอกสาร ★   (รันหลัง 01-schema.sql และ 02-setup-metadata.sql)
--
-- ไฟล์นี้เขียนมือ (ไม่ใช่ไฟล์ที่ถูกสร้าง) และถูกรันตรวจบน PostgreSQL แล้ว
-- ③ ถูกผูกกันจริงเป็นสาย (ส่วนขยายที่เจ้าของงานตัดสิน — ไม่อยู่ใน mockup/สเปกเดิม):
--     ช่องทางที่สะดวก ← ประเภทการติดต่อ ← ประเภทไฟล์แนบ
--     communicationtype ← contacttype.communicationtypeid (NOT NULL) ← attachfiletype.contacttypeid (NOT NULL)
-- ส่วน ประเภทงานเอกสาร / กลุ่ม Master ไม่ผูกกับใคร (ลำดับแท็บ 4–5 ยังเป็นแค่ "ลำดับแนะนำ")
--
-- ชื่อตารางจริงทุกตัวขึ้นต้น con_master_ (เช่น con_master_contacttype) ; แต่ค่าที่เก็บใน metadata และที่ส่งเป็นพารามิเตอร์
-- (table_name / holder_table / ref_table, อาร์กิวเมนต์ของ fn_master_used_by) เป็น "ชื่อใน mockup/API" ไม่มี prefix เช่น 'communicationtype'
-- ════════════════════════════════════════════════════════════════════════════
SET search_path = masterdata, public;

-- 0) ① นิติบุคคล (ข้อมูลกลาง SYS) — ทุกเมนูต้องมีก่อนเสมอ
INSERT INTO con_master_entitygroup (code, name) VALUES ('EG01', 'SUN GROUP');
INSERT INTO con_master_businessentity (code, name, entitygroupid)
VALUES ('SUN', 'SUN GATEWAY', (SELECT id FROM con_master_entitygroup WHERE code = 'EG01')),
       ('GGW', 'GGW',         (SELECT id FROM con_master_entitygroup WHERE code = 'EG01'));

-- 1) ข้ามลำดับไม่ได้แล้ว: สร้าง "ประเภทการติดต่อ" โดยยังไม่มี "ช่องทางที่สะดวก" → error (NOT NULL communicationtypeid)
--    (หน้าจอ: ฟอร์มเปิดได้พร้อมแถบเหลือง V14 แต่ dropdown ว่าง → บันทึกไม่ผ่าน V01)
-- INSERT INTO con_master_contacttype (entitygroupid, businessentityid, code, name)
--   SELECT entitygroupid, id, 'CALL', 'โทรติดตาม' FROM con_master_businessentity WHERE code = 'SUN';

-- 2) V14: หน้าจอรู้ว่าฟอร์มไหนยังขาดแม่ — ตอนนี้ contacttype ขาด communicationtype, attachfiletype ขาด contacttype
SELECT holder_table, holder_column, ref_table FROM v_field_prerequisite
 WHERE businessentityid = (SELECT id FROM con_master_businessentity WHERE code = 'SUN')
   AND holder_table IN ('contacttype', 'attachfiletype')
 ORDER BY holder_table;

-- 3) สร้างตามสายตั้งแต่ต้น: ช่องทางที่สะดวก → ประเภทการติดต่อ → ประเภทไฟล์แนบ
INSERT INTO con_master_communicationtype (entitygroupid, businessentityid, code, name)
SELECT be.entitygroupid, be.id, c.code, c.name FROM con_master_businessentity be, (VALUES ('TEL', 'โทรศัพท์'), ('LINE', 'LINE'), ('EMAIL', 'อีเมล')) AS c(code, name)
 WHERE be.code = 'SUN';

INSERT INTO con_master_contacttype (entitygroupid, businessentityid, code, name, communicationtypeid)
SELECT be.entitygroupid, be.id, 'CALL', 'โทรติดตาม',
       (SELECT id FROM con_master_communicationtype WHERE businessentityid = be.id AND code = 'TEL')
  FROM con_master_businessentity be WHERE be.code = 'SUN';

INSERT INTO con_master_attachfiletype (entitygroupid, businessentityid, code, name, contacttypeid)
SELECT be.entitygroupid, be.id, 'IDC', 'สำเนาบัตรประชาชน',
       (SELECT id FROM con_master_contacttype WHERE businessentityid = be.id AND code = 'CALL')
  FROM con_master_businessentity be WHERE be.code = 'SUN';

-- 4) ③ ยังไม่เสร็จ: ขาด "ประเภทงานเอกสาร" (กลุ่ม Master ไม่บังคับ) — ตารางอื่น ๆ ในกรอบเว้นลำดับได้
SELECT step_code, is_done FROM v_setup_step_status
 WHERE step_code = 'channel' AND businessentityid = (SELECT id FROM con_master_businessentity WHERE code = 'SUN');

-- 5) แท็บที่หน้าจอควรเปิดให้ = แท็บแรก (ตาม seq) ที่ยังไม่มี release และไม่ใช่ (ไม่บังคับ) → documentcategory (แท็บ 4)
SELECT t.seq, t.table_name, t.is_optional, COALESCE(c.release_count, 0) AS release_count
  FROM con_master_setup_step_table t
  LEFT JOIN v_master_release_count c
         ON c.table_name = t.table_name
        AND c.businessentityid = (SELECT id FROM con_master_businessentity WHERE code = 'SUN')
 WHERE t.step_code = 'channel'
 ORDER BY t.seq;

INSERT INTO con_master_documentcategory (entitygroupid, businessentityid, code, name)
SELECT entitygroupid, id, 'QT', 'ใบเสนอราคา' FROM con_master_businessentity WHERE code = 'SUN';

-- 6) ③ ของ SUN เสร็จแล้ว แต่ของ GGW ยังไม่เสร็จ — แยกตามนิติบุคคล
SELECT be.code AS entity, s.is_done
  FROM v_setup_step_status s JOIN con_master_businessentity be ON be.id = s.businessentityid
 WHERE s.step_code = 'channel' ORDER BY be.code;

-- 7) ใครอ้างถึง "ช่องทางที่สะดวก TEL" อยู่ (แท็บ "ใช้อยู่ใน" / ตรวจก่อนลบ V15) → ประเภทการติดต่อ CALL
--    ลบ TEL ตอนนี้จะ error (ON DELETE RESTRICT) → หน้าจอให้ "เปลี่ยนเป็น block" แทน
SELECT owner_table, owner_code, via_column FROM fn_master_used_by(
  (SELECT id FROM con_master_businessentity WHERE code = 'SUN'), 'communicationtype',
  (SELECT id FROM con_master_communicationtype WHERE code = 'TEL' AND businessentityid = (SELECT id FROM con_master_businessentity WHERE code = 'SUN')));

-- 8) แม่ต้องเป็นนิติบุคคลเดียวกัน: ประเภทการติดต่อของ GGW อ้างช่องทางของ SUN ไม่ได้ (composite FK)
--    (ข้างล่างสำเร็จเพราะ GGW สร้างช่องทางของตัวเองก่อน)
INSERT INTO con_master_communicationtype (entitygroupid, businessentityid, code, name)
SELECT entitygroupid, id, 'TEL', 'โทรศัพท์' FROM con_master_businessentity WHERE code = 'GGW';
INSERT INTO con_master_contacttype (entitygroupid, businessentityid, code, name, communicationtypeid)
SELECT be.entitygroupid, be.id, 'CALL', 'โทรติดตาม',
       (SELECT id FROM con_master_communicationtype WHERE businessentityid = be.id AND code = 'TEL')
  FROM con_master_businessentity be WHERE be.code = 'GGW';
