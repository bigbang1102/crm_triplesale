import { InjectionToken } from '@angular/core';
import { ROLE, pipelineDocRole, supportingDocRole, type AnyRoleKey } from './roles';

/**
 * Every button of the app: access-button code → what it does, in the product team's words (Thai). Code =
 * `<module>-<page>-<area>-<nn>` (e.g. `PL-PR-LS-03` = module PL · page PR · area LS · button 03), in the order the list was handed over.
 * The text in parentheses in a label (`SC-AD`, `OP-NW` …) is the popup or page that the button opens, written as `<page>-<area>`;
 * "(คาดว่า)" = the team was not sure either. This is the list the `AccessButtonCode` type comes from; it holds no permission.
 *
 * A comment `// CONFIRMED → <role>` after an entry = the product team confirmed that button, and the role is the one it hangs under
 * in `ROLE_BUTTONS` below (which lists all the confirmed keys). An entry without that comment is still the draft.
 */
export const ACCESS_BUTTON_LABELS = {
  'LG-LI-MN-01': 'สลับแสดง/ซ่อนรหัสผ่านที่พิมพ์',
  'LG-LI-MN-02': 'ตรวจสอบ Username/Password แล้วเข้าสู่ระบบ',
  'LG-LI-MN-03': 'ไปขั้นตอนลืม/รีเซ็ตรหัสผ่าน',
  'PL-DB-MN-01': '+ เพิ่มนัดหมาย (หน้าหลัก): เปิด popup สร้างนัดหมาย (SC-AD)', // CONFIRMED → Pipeline_Schedule_Appointment_Add_Edit, Pipeline_Schedule_Task_Add_Edit
  'PL-DB-MN-02': 'ไอคอนเปิดลิงก์ภายนอก (ข้างเพิ่มนัดหมาย): ไปหน้า Schedule ดูนัดหมายทั้งหมด', // CONFIRMED → Pipeline_Schedule_Appointment_View
  'PL-DB-MN-03': '+ มอบหมายงาน (หน้าหลัก): เปิด popup มอบหมายผู้รับผิดชอบ (DB-AS)', // CONFIRMED → Pipeline_Opportunity_Change_Assign, Pipeline_Opportunity_Change_Sales_Person
  'PL-DB-MN-04': '+ เพิ่มงาน (หน้าหลัก): เปิด popup สร้างงาน (SC-AD)', // CONFIRMED → Pipeline_Schedule_Task_Add_Edit
  'PL-DB-MN-05': 'ไอคอนเปิดลิงก์ภายนอก (ข้างเพิ่มงาน): ไปหน้า Schedule ดูตารางงานทั้งหมด', // CONFIRMED → Pipeline_Schedule_Task_View
  'PL-DB-AS-01':
    'มอบหมายงาน (popup มอบหมายผู้รับผิดชอบ): บันทึกการมอบหมายทีมขาย/พนักงานขาย/ผู้รับผิดชอบให้โอกาสขาย', // CONFIRMED → Pipeline_Opportunity_Change_Assign, Pipeline_Opportunity_Change_Sales_Person
  'PL-PR-LS-01': 'ไอคอนแว่นขยาย (ค้นหา): เปิดช่องค้นหาชื่อลูกค้า/รหัสลูกค้า', // CONFIRMED → Pipeline_Prospect_View
  'PL-PR-LS-02': 'ค้นหา: ค้นหารายการลูกค้าเป้าหมายตามคำค้น', // CONFIRMED → Pipeline_Prospect_View
  'PL-PR-LS-03': 'ไอคอน X (ล้างคำค้นหา): ล้างคำค้นหาและปิดช่องค้นหา', // CONFIRMED → Pipeline_Prospect_View
  'PL-PR-LS-04': 'ไอคอนกรวย (ตัวกรอง): เปิด popup ตัวกรองการค้นหา', // CONFIRMED → Pipeline_Prospect_View
  'PL-PR-LS-05': '+ เพิ่มใหม่: ไปหน้าเพิ่มข้อมูลลูกค้าเป้าหมาย (PR-CR)', // CONFIRMED → Pipeline_Prospect_Create
  'PL-PR-LS-06': 'ไอคอน 3 จุด (เมนูของแถวในตาราง): เปิดเมนูแก้ไข/ดูของลูกค้าแถวนั้น', // CONFIRMED → Pipeline_Prospect_View
  'PL-PR-LS-07': 'ล้างค่า (ใน popup ตัวกรอง): ล้างเงื่อนไขในตัวกรองการค้นหา', // CONFIRMED → Pipeline_Prospect_View
  'PL-PR-LS-08': 'กรอง (ใน popup ตัวกรอง): กรองรายการตามเงื่อนไขที่เลือก', // CONFIRMED → Pipeline_Prospect_View
  'PL-PR-LS-09':
    '+ สร้าง Opportunity (ในแผงด้านข้างของแถว): สร้าง Opportunity จากลูกค้าที่เลือก (คาดว่าเปิด popup OP-NW)', // CONFIRMED → Pipeline_Opportunity_Create
  'PL-PR-LS-10': 'อัปโหลด (ในแผงด้านข้างของแถว): อัปโหลดไฟล์เอกสารประกอบของลูกค้า', // CONFIRMED → Pipeline_Prospect_Attachment_Upload
  'PL-PR-LS-11': 'ดาวน์โหลด (แท็บเอกสารประกอบของแผงด้านข้าง): ดาวน์โหลดไฟล์เอกสารแถวนั้น', // CONFIRMED → Pipeline_Prospect_Attachment_Download
  'PL-PR-LS-12': 'ไอคอนถังขยะ (แท็บเอกสารประกอบของแผงด้านข้าง): ลบไฟล์เอกสารแถวนั้น', // CONFIRMED → Pipeline_Prospect_Attachment_Delete
  'PL-PR-CR-01': 'อัปโหลดรูปภาพลูกค้า (.jpg/.jpeg/.png ไม่เกิน 2 MB)', // CONFIRMED → Pipeline_Prospect_Create, Pipeline_Prospect_Edit
  'PL-PR-CR-02': 'คัดลอกที่อยู่ปัจจุบันไปเป็นที่อยู่ส่งเอกสาร', // CONFIRMED → Pipeline_Prospect_Create, Pipeline_Prospect_Edit
  'PL-PR-CR-03': 'อัปโหลดเอกสารประกอบของลูกค้า', // CONFIRMED → Pipeline_Prospect_Attachment_Upload
  'PL-PR-CR-04': 'เปิด popup สร้าง Opportunity (OP-NW) เพื่อบันทึกลูกค้าและสร้าง Opportunity', // CONFIRMED → Pipeline_Prospect_Create, Pipeline_Prospect_Edit
  'PL-PR-DT-01': 'คัดลอกที่อยู่ปัจจุบันไปเป็นที่อยู่ส่งเอกสาร', // CONFIRMED → Pipeline_Prospect_View
  'PL-PR-DT-02': 'อัปโหลดเอกสารประกอบของลูกค้า', // CONFIRMED → Pipeline_Prospect_Attachment_Upload
  'PL-PR-DT-03': 'เข้าสู่โหมดแก้ไขข้อมูลลูกค้าเป้าหมาย', // CONFIRMED → Pipeline_Prospect_Edit
  'PL-PR-DT-04': 'สร้าง Opportunity จากลูกค้ารายนี้ (คาดว่าเปิด popup OP-NW)', // CONFIRMED → Pipeline_Opportunity_Create
  'PL-PR-DT-05': 'บันทึกการแก้ไขข้อมูลลูกค้าเป้าหมาย', // CONFIRMED → Pipeline_Prospect_Edit
  'PL-OP-LS-01': 'เปิดช่องค้นหาโอกาสขาย', // CONFIRMED → Pipeline_Opportunity_View
  'PL-OP-LS-02': 'ค้นหาโอกาสขายตามคำค้น', // CONFIRMED → Pipeline_Opportunity_View
  'PL-OP-LS-03': 'เปิด popup ตัวกรองการค้นหา', // CONFIRMED → Pipeline_Opportunity_View
  'PL-OP-LS-04': 'ล้างเงื่อนไขในตัวกรองการค้นหา', // CONFIRMED → Pipeline_Opportunity_View
  'PL-OP-LS-05': 'ใช้ตัวกรองและแสดงรายการโอกาสขายตามเงื่อนไข', // CONFIRMED → Pipeline_Opportunity_View
  'PL-OP-LS-06': 'ลากการ์ดไปวางคอลัมน์อื่นเพื่อเปลี่ยนขั้นตอน/สถานะของโอกาสขาย', // CONFIRMED → Pipeline_Opportunity_Contact_Activity_Create
  'PL-OP-LS-07': 'โทรออกไปยังเบอร์ลูกค้า (คาดว่า)',
  'PL-OP-DT-01': 'เปิด popup เปลี่ยนพนักงานขาย (OP-AS)', // CONFIRMED → Pipeline_Opportunity_Change_Sales_Person
  'PL-OP-DT-02': 'เปิด popup เลือกพนักงานขาย/ผู้รับผิดชอบ (OP-AS)', // CONFIRMED → Pipeline_Opportunity_Change_Assign, Pipeline_Opportunity_Change_Sales_Person
  'PL-OP-DT-03': 'เปิด popup เพิ่มผู้มีสิทธิ์เข้าถึง (OP-AC)', // CONFIRMED → Pipeline_Opportunity_Share_Sharing_Employee
  'PL-OP-DT-04': 'เปิด popup เพิ่ม/แก้ไข Tag (OP-TG)', // CONFIRMED → Pipeline_Opportunity_Edit
  'PL-OP-DT-05': 'เปิด popup สร้างนัดหมาย (SC-AD)', // CONFIRMED → Pipeline_Schedule_Appointment_Add_Edit
  'PL-OP-DT-06': 'ไปหน้าปฏิทินนัดหมาย (Schedule) ของโอกาสขายนี้', // CONFIRMED → Pipeline_Schedule_Appointment_View
  'PL-OP-DT-07': 'เปิด popup ดู/แก้ไขนัดหมาย (SC-ED)', // CONFIRMED → Pipeline_Schedule_Appointment_Add_Edit
  'PL-OP-DT-08': 'เปิด popup สร้างงาน (SC-AD)', // CONFIRMED → Pipeline_Schedule_Task_Add_Edit
  'PL-OP-DT-09': 'ไปหน้ารายการงาน (Schedule) ของโอกาสขายนี้', // CONFIRMED → Pipeline_Schedule_Task_View
  'PL-OP-DT-10': 'เปิด popup ดู/แก้ไขงาน (SC-ED)', // CONFIRMED → Pipeline_Schedule_Task_Add_Edit
  'PL-OP-DT-11': 'เพิ่มผลิตภัณฑ์ที่สนใจให้โอกาสขาย', // CONFIRMED → Pipeline_Opportunity_Edit
  'PL-OP-DT-12': 'สร้างใบเสนอราคา (มีเมนูย่อย ▾)', // CONFIRMED → Pipeline_Opportunity_Edit
  'PL-OP-DT-13': 'บันทึกเสียงแปลงเป็นข้อความรายละเอียดติดต่อ',
  'PL-OP-DT-14': 'ลบแถวผู้รับส่งต่องาน', // CONFIRMED → Pipeline_Opportunity_Change_Assign
  'PL-OP-DT-15': 'เพิ่มแถวผู้รับส่งต่องานคนถัดไป', // CONFIRMED → Pipeline_Opportunity_Change_Assign
  'PL-OP-DT-16': 'เปิด/ปิดส่วนส่งต่องาน (Forward)', // CONFIRMED → Pipeline_Opportunity_Change_Assign
  'PL-OP-DT-17': 'บันทึกการติดต่อ และเปลี่ยนขั้นตอน/ส่งต่องานตามที่เลือก', // CONFIRMED → Pipeline_Opportunity_Change_Assign
  'PL-OP-DT-18': 'ตีกลับ (Return) โอกาสขายไปขั้นตอนก่อนหน้า', // CONFIRMED → Pipeline_Opportunity_WorkflowStep_Rework
  'PL-OP-DT-19': 'ปิดกลุ่มขั้นตอนปัจจุบัน', // CONFIRMED → Pipeline_Opportunity_WorkflowStep_Close
  'PL-OP-DT-20': 'เปิด popup ปิดโอกาสขาย (OP-CL)', // CONFIRMED → Pipeline_Opportunity_Close
  'PL-OP-DT-21': 'อัปโหลด/เปลี่ยนรูปลูกค้า (แท็บข้อมูลหลัก)', // CONFIRMED → Pipeline_Prospect_Edit
  'PL-OP-DT-22': 'บันทึกการแก้ไขข้อมูลหลักลูกค้า', // CONFIRMED → Pipeline_Prospect_Edit
  'PL-OP-DT-23': 'อัปโหลดไฟล์เอกสารประกอบ', // CONFIRMED → Pipeline_Opportunity_Attachment_Upload
  'PL-OP-DT-24': 'ดาวน์โหลดไฟล์เอกสารประกอบ (ต่อแถว)', // CONFIRMED → Pipeline_Opportunity_Attachment_Download
  'PL-OP-DT-25': 'ดาวน์โหลดเอกสารงานขาย เช่น ใบส่งสินค้า', // CONFIRMED → Pipeline_Prospect_Edit
  'PL-OP-DT-26': 'เปิด popup บันทึกการติดต่อของขั้นตอนปัจจุบัน (CA-AD)', // CONFIRMED → Pipeline_Opportunity_Contact_Activity_Create
  'PL-OP-DT-27': 'ปิดขั้นตอน (Close step) ปัจจุบัน', // CONFIRMED → Pipeline_Opportunity_Contact_Activity_Create
  'PL-OP-DT-28': 'เปิด popup ตัวกรองประวัติการติดต่อ', // CONFIRMED → Pipeline_Opportunity_Contact_View
  'PL-OP-DT-29': 'สลับ/ขยายแผงประวัติการติดต่อ (คาดว่า)', // CONFIRMED → Pipeline_Opportunity_Contact_View
  'PL-OP-DT-30': 'เปิดมุมมองรายการขั้นตอน/การติดต่อตามกลุ่มขั้นตอน (คาดว่า)', // CONFIRMED → Pipeline_Opportunity_Contact_View
  'PL-OP-DT-31': 'ล้างเงื่อนไขตัวกรองประวัติการติดต่อ', // CONFIRMED → Pipeline_Opportunity_Contact_View
  'PL-OP-DT-32': 'กรองประวัติการติดต่อตามกลุ่มขั้นตอน/ขั้นตอน/ผู้รับผิดชอบ/ช่องทาง', // CONFIRMED → Pipeline_Opportunity_Contact_View
  'PL-OP-AC-01': 'เพิ่มพนักงานที่เลือกเป็นผู้มีสิทธิ์เข้าถึง',
  'PL-OP-NW-01':
    'บันทึกลูกค้าเป้าหมายและสร้าง Opportunity ตามผลิตภัณฑ์/พนักงานขาย/กลุ่มขั้นตอน/ผู้รับผิดชอบที่เลือก', // CONFIRMED → Pipeline_Opportunity_Create
  'PL-OP-NW-02': 'ไปหน้ารายการ Opportunity (OP-LS) หลังสร้างสำเร็จ', // CONFIRMED → Pipeline_Opportunity_View
  'PL-OP-AS-01': 'บันทึกการเปลี่ยนทีมขาย/พนักงานขาย', // CONFIRMED → Pipeline_Opportunity_Change_Sales_Person
  'PL-OP-TG-01': 'บันทึก Tag ที่เลือกให้โอกาสขาย', // CONFIRMED → Pipeline_Opportunity_Edit
  'PL-CA-LS-01': 'เปิดช่องค้นหารายการการติดต่อ', // CONFIRMED → Pipeline_Opportunity_Contact_View
  'PL-CA-LS-02': 'เปิดแผงตัวกรองการค้นหา', // CONFIRMED → Pipeline_Opportunity_Contact_View
  'PL-CA-LS-03': 'ล้างเงื่อนไขในแผงตัวกรอง', // CONFIRMED → Pipeline_Opportunity_Contact_View
  'PL-CA-LS-04': 'ใช้ตัวกรองและโหลดรายการใหม่', // CONFIRMED → Pipeline_Opportunity_Contact_View
  'PL-CA-LS-05': 'ขยาย/ย่อแถวย่อยของทุกโอกาสขาย', // CONFIRMED → Pipeline_Opportunity_Contact_View
  'PL-CA-LS-06': 'ขยาย/ย่อแถวย่อยแยกตามกลุ่มขั้นตอนของลูกค้ารายนั้น', // CONFIRMED → Pipeline_Opportunity_Contact_View
  'PL-CA-LS-07': 'ไปหน้ารายละเอียด Opportunity (OP-DT) ของแถวที่เลือก', // CONFIRMED → Pipeline_Opportunity_View
  'PL-CA-LS-08': 'กรองประวัติการติดต่อในแผงขวา', // CONFIRMED → Pipeline_Opportunity_Contact_View
  'PL-CA-LS-09': 'เปิด popup บันทึกการติดต่อ (CA-AD)', // CONFIRMED → Pipeline_Opportunity_Contact_Activity_Create
  'PL-CA-LS-10': 'เปิดนัดหมายใน Schedule (ดู/เพิ่มนัดหมาย)', // CONFIRMED → Pipeline_Schedule_Appointment_View
  'PL-CA-LS-11': 'เปิดงานใน Schedule (ดู/เพิ่มงาน)', // CONFIRMED → Pipeline_Schedule_Task_View
  'PL-CA-LS-12': 'ทำเครื่องหมายงานเสร็จ', // CONFIRMED → Pipeline_Schedule_Task_Add_Edit
  'PL-CA-AD-01': 'บันทึกการติดต่อ (Note/โทรออก/โทรเข้า/SMS/อีเมล/Facebook ฯลฯ)', // CONFIRMED → Pipeline_Opportunity_Contact_Activity_Create
  'PL-SC-CL-01': 'เปิดช่องค้นหารายการนัดหมาย/งาน', // CONFIRMED → Pipeline_Schedule_Appointment_View, Pipeline_Schedule_Task_View
  'PL-SC-CL-02': 'เปิด popup ตัวกรองการค้นหา', // CONFIRMED → Pipeline_Schedule_Appointment_View, Pipeline_Schedule_Task_View
  'PL-SC-CL-03': 'เลื่อนปฏิทินกลับไปยังวันปัจจุบัน', // CONFIRMED → Pipeline_Schedule_Appointment_View, Pipeline_Schedule_Task_View
  'PL-SC-CL-04': 'คลิกเพื่อเปิด popup ดูรายละเอียดนัดหมาย/งาน (SC-ED)', // CONFIRMED → Pipeline_Schedule_Appointment_View, Pipeline_Schedule_Task_View
  'PL-SC-CL-05': 'คลิกเพื่อเปิดป๊อปโอเวอร์รายการนัดหมาย/งานของวันนั้น', // CONFIRMED → Pipeline_Schedule_Appointment_View, Pipeline_Schedule_Task_View
  'PL-SC-CL-06': 'คลิกเพื่อเปิด popup ดูรายละเอียดนัดหมาย/งาน (SC-ED)', // CONFIRMED → Pipeline_Schedule_Appointment_View, Pipeline_Schedule_Task_View
  'PL-SC-CL-07': 'ล้างเงื่อนไขในตัวกรอง (ทีมขาย/ผู้รับผิดชอบ/สถานะ) กลับเป็นค่าเริ่มต้น', // CONFIRMED → Pipeline_Schedule_Appointment_View, Pipeline_Schedule_Task_View
  'PL-SC-CL-08': 'ใช้ตัวกรองและแสดงรายการตามเงื่อนไข', // CONFIRMED → Pipeline_Schedule_Appointment_View, Pipeline_Schedule_Task_View
  'PL-SC-LT-01': 'ค้นหารายการตามคำค้น', // CONFIRMED → Pipeline_Schedule_Appointment_View, Pipeline_Schedule_Task_View
  'PL-SC-LT-02': 'ล้างคำค้นหาในช่องค้นหา', // CONFIRMED → Pipeline_Schedule_Appointment_View, Pipeline_Schedule_Task_View
  'PL-SC-LT-03': 'เปิด popup ตัวกรองการค้นหา', // CONFIRMED → Pipeline_Schedule_Appointment_View, Pipeline_Schedule_Task_View
  'PL-SC-LT-04': 'เปิด popup เพิ่มนัดหมาย (SC-AD)', // CONFIRMED → Pipeline_Schedule_Appointment_Add_Edit, Pipeline_Schedule_Appointment_View
  'PL-SC-LT-05': 'เปิดเมนูจัดการรายการนัดหมายของแถว', // CONFIRMED → Pipeline_Schedule_Appointment_Add_Edit, Pipeline_Schedule_Appointment_View
  'PL-SC-LT-06': 'เปิด popup เพิ่มงาน (SC-AD)', // CONFIRMED → Pipeline_Schedule_Task_Add_Edit, Pipeline_Schedule_Task_View
  'PL-SC-LT-07': 'เปิดเมนูจัดการรายการงานของแถว', // CONFIRMED → Pipeline_Schedule_Task_Add_Edit, Pipeline_Schedule_Task_View
  'PL-SC-BD-01': 'ค้นหารายการตามคำค้น', // CONFIRMED → Pipeline_Schedule_Appointment_View, Pipeline_Schedule_Task_View
  'PL-SC-BD-02': 'ล้างคำค้นหาในช่องค้นหา', // CONFIRMED → Pipeline_Schedule_Appointment_View, Pipeline_Schedule_Task_View
  'PL-SC-BD-03': 'เปิด popup ตัวกรองการค้นหา', // CONFIRMED → Pipeline_Schedule_Appointment_View, Pipeline_Schedule_Task_View
  'PL-SC-BD-04': 'เปิด popup เพิ่มนัดหมาย (SC-AD)', // CONFIRMED → Pipeline_Schedule_Appointment_Add_Edit, Pipeline_Schedule_Appointment_View
  'PL-SC-BD-05': 'เปิดเมนูจัดการการ์ดนัดหมาย', // CONFIRMED → Pipeline_Schedule_Appointment_Add_Edit, Pipeline_Schedule_Appointment_View
  'PL-SC-BD-06':
    'ย้ายการ์ดข้ามคอลัมน์เพื่อเปลี่ยนสถานะ นัดหมาย/เลื่อนนัด/สำเร็จ/ยกเลิก หรือ กำลังดำเนินการ/สำเร็จ/ยกเลิก', // CONFIRMED → Pipeline_Schedule_Appointment_Add_Edit
  'PL-SC-BD-07': 'เปิด popup เพิ่มงาน (SC-AD)', // CONFIRMED → Pipeline_Schedule_Task_Add_Edit, Pipeline_Schedule_Task_View
  'PL-SC-BD-08': 'เปิดเมนูจัดการการ์ดงาน', // CONFIRMED → Pipeline_Schedule_Task_Add_Edit, Pipeline_Schedule_Task_View
  'PL-SC-AD-01': 'บันทึกสร้างนัดหมายใหม่', // CONFIRMED → Pipeline_Schedule_Appointment_Add_Edit, Pipeline_Schedule_Task_Add_Edit
  'PL-SC-AD-02': 'บันทึกสร้างงานใหม่', // CONFIRMED → Pipeline_Schedule_Appointment_Add_Edit, Pipeline_Schedule_Task_Add_Edit
  'PL-SC-ED-01': 'สลับ popup จากโหมดดูเป็นโหมดแก้ไข', // CONFIRMED → Pipeline_Schedule_Appointment_Add_Edit, Pipeline_Schedule_Task_Add_Edit
  'PL-SC-ED-02': 'บันทึกการเปลี่ยนแปลง (โหมดดู: เปลี่ยนสถานะ / โหมดแก้ไข: บันทึกทุกช่อง)', // CONFIRMED → Pipeline_Schedule_Appointment_Add_Edit, Pipeline_Schedule_Task_Add_Edit
  'PL-IT-LS-01': 'เปิดช่องค้นหาเอกสารใบเจตจำนงค์', // CONFIRMED → Pipeline_Document_LetterofIntent_View
  'PL-IT-LS-02': 'ไปหน้ารายละเอียด (PL-IT-DT) เพื่อสร้างใบเจตจำนงค์ใหม่', // CONFIRMED → Pipeline_Document_LetterofIntent_Create
  'PL-IT-LS-03': 'เปิดหน้ารายละเอียด (PL-IT-DT) ของเอกสารในแถวนั้น', // CONFIRMED → Pipeline_Document_LetterofIntent_View
  'PL-IT-DT-01': 'บันทึกข้อมูลใบเจตจำนงค์ (แท็บข้อมูลหลัก)', // CONFIRMED → Pipeline_Document_LetterofIntent_Edit
  'PL-IT-DT-02': 'อัปโหลดไฟล์แนบเอกสาร (แท็บเอกสาร)', // CONFIRMED → Pipeline_Document_LetterofIntent_Edit
  'PL-IT-DT-03': 'ดาวน์โหลดไฟล์แนบในแถวนั้น', // CONFIRMED → Pipeline_Document_LetterofIntent_View
  'PL-IT-DT-04': 'ลบไฟล์แนบในแถวนั้น', // CONFIRMED → Pipeline_Document_LetterofIntent_Edit
  'PL-LR-LS-01': 'เปิดช่องค้นหาเอกสารใบขอใช้บริการนิติกรรมและสินเชื่อ', // CONFIRMED → Pipeline_Document_LegalCreditServiceRequest_View
  'PL-LR-LS-02': 'ไปหน้ารายละเอียด (PL-LR-DT) เพื่อสร้างใบขอใช้บริการนิติกรรมและสินเชื่อใหม่', // CONFIRMED → Pipeline_Document_LegalCreditServiceRequest_Create
  'PL-LR-LS-03': 'เปิดหน้ารายละเอียด (PL-LR-DT) ของเอกสารในแถวนั้น', // CONFIRMED → Pipeline_Document_LegalCreditServiceRequest_View
  'PL-LR-DT-01': 'บันทึกข้อมูลใบขอใช้บริการนิติกรรมและสินเชื่อ (แท็บข้อมูลหลัก)', // CONFIRMED → Pipeline_Document_LegalCreditServiceRequest_Edit
  'PL-LR-DT-02': 'อัปโหลดไฟล์แนบเอกสาร (แท็บเอกสาร)', // CONFIRMED → Pipeline_Document_LegalCreditServiceRequest_Edit
  'PL-LR-DT-03': 'ดาวน์โหลดไฟล์แนบในแถวนั้น', // CONFIRMED → Pipeline_Document_LegalCreditServiceRequest_View
  'PL-LR-DT-04': 'ลบไฟล์แนบในแถวนั้น', // CONFIRMED → Pipeline_Document_LegalCreditServiceRequest_Edit
  'PL-LA-LS-01': 'เปิดช่องค้นหาเอกสารสัญญาเงินกู้', // CONFIRMED → Pipeline_Document_Servicecontract_View
  'PL-LA-LS-02': 'ไปหน้ารายละเอียด (PL-LA-DT) เพื่อสร้างสัญญาเงินกู้ใหม่', // CONFIRMED → Pipeline_Document_Servicecontract_Create
  'PL-LA-LS-03': 'เปิดหน้ารายละเอียด (PL-LA-DT) ของเอกสารในแถวนั้น', // CONFIRMED → Pipeline_Document_Servicecontract_View
  'PL-LA-DT-01': 'บันทึกข้อมูลสัญญาเงินกู้ (แท็บข้อมูลหลัก)', // CONFIRMED → Pipeline_Document_Servicecontract_Edit
  'PL-LA-DT-02': 'อัปโหลดไฟล์แนบเอกสาร (แท็บเอกสาร)', // CONFIRMED → Pipeline_Document_Servicecontract_Edit
  'PL-LA-DT-03': 'ดาวน์โหลดไฟล์แนบในแถวนั้น', // CONFIRMED → Pipeline_Document_Servicecontract_View
  'PL-LA-DT-04': 'ลบไฟล์แนบในแถวนั้น', // CONFIRMED → Pipeline_Document_Servicecontract_Edit
  'PL-PA-LS-01': 'เปิดช่องค้นหาเอกสารใบอนุมัติวงเงินเบื้องต้น', // CONFIRMED → Pipeline_Document_LoanAgreement_View
  'PL-PA-LS-02': 'ไปหน้ารายละเอียด (PL-PA-DT) เพื่อสร้างใบอนุมัติวงเงินเบื้องต้นใหม่', // CONFIRMED → Pipeline_Document_LoanAgreement_Create
  'PL-PA-LS-03': 'เปิดหน้ารายละเอียด (PL-PA-DT) ของเอกสารในแถวนั้น', // CONFIRMED → Pipeline_Document_LoanAgreement_View
  'PL-PA-DT-01': 'บันทึกข้อมูลใบอนุมัติวงเงินเบื้องต้น (แท็บข้อมูลหลัก)', // CONFIRMED → Pipeline_Document_LoanAgreement_Edit
  'PL-PA-DT-02': 'อัปโหลดไฟล์แนบเอกสาร (แท็บเอกสาร)', // CONFIRMED → Pipeline_Document_LoanAgreement_Edit
  'PL-PA-DT-03': 'ดาวน์โหลดไฟล์แนบในแถวนั้น', // CONFIRMED → Pipeline_Document_LoanAgreement_View
  'PL-PA-DT-04': 'ลบไฟล์แนบในแถวนั้น', // CONFIRMED → Pipeline_Document_LoanAgreement_Edit
  'PL-PP-LS-01': 'เปิดช่องค้นหาเอกสารสัญญาโครงการอสังหาริมทรัพย์', // CONFIRMED → Pipeline_Document_PreliminaryCreditApproval_View
  'PL-PP-LS-02': 'ไปหน้ารายละเอียด (PL-PP-DT) เพื่อสร้างสัญญาโครงการอสังหาริมทรัพย์ใหม่', // CONFIRMED → Pipeline_Document_PreliminaryCreditApproval_Create
  'PL-PP-LS-03': 'เปิดหน้ารายละเอียด (PL-PP-DT) ของเอกสารในแถวนั้น', // CONFIRMED → Pipeline_Document_PreliminaryCreditApproval_View
  'PL-PP-DT-01': 'บันทึกข้อมูลสัญญาโครงการอสังหาริมทรัพย์ (แท็บข้อมูลหลัก)', // CONFIRMED → Pipeline_Document_PreliminaryCreditApproval_Edit
  'PL-PP-DT-02': 'อัปโหลดไฟล์แนบเอกสาร (แท็บเอกสาร)', // CONFIRMED → Pipeline_Document_PreliminaryCreditApproval_Edit
  'PL-PP-DT-03': 'ดาวน์โหลดไฟล์แนบในแถวนั้น', // CONFIRMED → Pipeline_Document_PreliminaryCreditApproval_View
  'PL-PP-DT-04': 'ลบไฟล์แนบในแถวนั้น', // CONFIRMED → Pipeline_Document_PreliminaryCreditApproval_Edit
  'PL-SV-LS-01': 'เปิดช่องค้นหาเอกสารServicecontract', // CONFIRMED → Pipeline_Document_PropertyProjectContract_View
  'PL-SV-LS-02': 'ไปหน้ารายละเอียด (PL-SV-DT) เพื่อสร้างServicecontractใหม่', // CONFIRMED → Pipeline_Document_PropertyProjectContract_Create
  'PL-SV-LS-03': 'เปิดหน้ารายละเอียด (PL-SV-DT) ของเอกสารในแถวนั้น', // CONFIRMED → Pipeline_Document_PropertyProjectContract_View
  'PL-SV-DT-01': 'บันทึกข้อมูลServicecontract (แท็บข้อมูลหลัก)', // CONFIRMED → Pipeline_Document_PropertyProjectContract_Edit
  'PL-SV-DT-02': 'อัปโหลดไฟล์แนบเอกสาร (แท็บเอกสาร)', // CONFIRMED → Pipeline_Document_PropertyProjectContract_Edit
  'PL-SV-DT-03': 'ดาวน์โหลดไฟล์แนบในแถวนั้น', // CONFIRMED → Pipeline_Document_PropertyProjectContract_View
  'PL-SV-DT-04': 'ลบไฟล์แนบในแถวนั้น', // CONFIRMED → Pipeline_Document_PropertyProjectContract_Edit
  'PL-CP-LS-01': 'เปิดช่องค้นหาเอกสารใบคำขอสินเชื่อ', // CONFIRMED → Pipeline_Document_CreditApplication_View
  'PL-CP-LS-02': 'ไปหน้ารายละเอียด (PL-CP-DT) เพื่อสร้างใบคำขอสินเชื่อใหม่', // CONFIRMED → Pipeline_Document_CreditApplication_Create
  'PL-CP-LS-03': 'เปิดหน้ารายละเอียด (PL-CP-DT) ของเอกสารในแถวนั้น', // CONFIRMED → Pipeline_Document_CreditApplication_View
  'PL-CP-DT-01': 'บันทึกข้อมูลใบคำขอสินเชื่อ', // CONFIRMED → Pipeline_Document_CreditApplication_Edit
  'PL-CP-DT-02': 'อัปโหลดไฟล์แนบเอกสาร (แท็บเอกสาร)', // CONFIRMED → Pipeline_Document_CreditApplication_Edit
  'PL-CP-DT-03': 'ดาวน์โหลดไฟล์แนบในแถวนั้น', // CONFIRMED → Pipeline_Document_CreditApplication_View
  'PL-CP-DT-04': 'ลบไฟล์แนบในแถวนั้น', // CONFIRMED → Pipeline_Document_CreditApplication_Edit
} as const satisfies Record<string, string>;

export type AccessButtonCode = keyof typeof ACCESS_BUTTON_LABELS;

/** One role and the buttons it opens (`permission`). */
export interface RoleButtons {
  readonly role: AnyRoleKey;
  readonly permission: readonly AccessButtonCode[];
}

/**
 * The table of the buttons, kept in the front end (the backend sends role names only): each role with the buttons it opens. A role
 * may open many buttons, and a button may hang under more than one role (list its code under each): it is usable with ANY of them.
 * Listing a code twice under the same role is a typo (`registryOf` throws). A button under no role stays hidden for everyone
 * (fail-closed).
 *
 * `// Confirm` after a key = the product team confirmed that button; every such key is under a `Pipeline_*` role. A key without it is
 * still the DRAFT (made from the button labels, under the old `CRM_*` names, not confirmed with the product team / backend). When a
 * page is confirmed: move its buttons under their `Pipeline_*` roles and mark them `// Confirm` (a key already under a `Pipeline_*`
 * role is not changed without asking). What a key is: see `ACCESS_BUTTON_LABELS` above.
 *
 * The draft roles are the names the backend sends today (the old `CRM_*` / `FEATURE_CRM_*`, see core/testing/me-roles.sample.ts); a button
 * moves to its `Pipeline_*` role when the product team confirms it, and nothing maps one name to the other: a user who holds only the old
 * names does not see a confirmed button until the backend sends its new `Pipeline_*` role, and a user who holds only the new names does not
 * see a draft one. The `_Sup` variants are not here: they are decided per record by
 * `PermissionService.canAct`. The sign-in buttons (`LG-*`) are left out: before sign-in there are no roles.
 */
export const ROLE_BUTTONS: readonly RoleButtons[] = [
  {
    role: ROLE.pipelineScheduleAppointmentAddEdit,
    permission: [
      'PL-DB-MN-01', // Confirm
      'PL-OP-DT-05', // Confirm
      'PL-OP-DT-07', // Confirm
      'PL-SC-LT-04', // Confirm
      'PL-SC-LT-05', // Confirm
      'PL-SC-BD-04', // Confirm
      'PL-SC-BD-05', // Confirm
      'PL-SC-BD-06', // Confirm
      'PL-SC-AD-01', // Confirm
      'PL-SC-AD-02', // Confirm
      'PL-SC-ED-01', // Confirm
      'PL-SC-ED-02', // Confirm
    ],
  },
  {
    role: ROLE.pipelineScheduleAppointmentView,
    permission: [
      'PL-DB-MN-02', // Confirm
      'PL-OP-DT-06', // Confirm
      'PL-CA-LS-10', // Confirm
      'PL-SC-CL-01', // Confirm
      'PL-SC-CL-02', // Confirm
      'PL-SC-CL-03', // Confirm
      'PL-SC-CL-04', // Confirm
      'PL-SC-CL-05', // Confirm
      'PL-SC-CL-06', // Confirm
      'PL-SC-CL-07', // Confirm
      'PL-SC-CL-08', // Confirm
      'PL-SC-LT-01', // Confirm
      'PL-SC-LT-02', // Confirm
      'PL-SC-LT-03', // Confirm
      'PL-SC-BD-01', // Confirm
      'PL-SC-BD-02', // Confirm
      'PL-SC-BD-03', // Confirm
      'PL-SC-LT-04', // Confirm
      'PL-SC-LT-05', // Confirm
      'PL-SC-BD-04', // Confirm
      'PL-SC-BD-05', // Confirm
    ],
  },
  {
    role: ROLE.pipelineScheduleTaskAddEdit,
    permission: [
      'PL-DB-MN-04', // Confirm
      'PL-OP-DT-08', // Confirm
      'PL-OP-DT-10', // Confirm
      'PL-CA-LS-12', // Confirm
      'PL-SC-LT-06', // Confirm
      'PL-SC-LT-07', // Confirm
      'PL-SC-BD-06', // Confirm
      'PL-SC-AD-01', // Confirm
      'PL-SC-AD-02', // Confirm
      'PL-SC-ED-01', // Confirm
      'PL-SC-ED-02', // Confirm
      'PL-SC-BD-07', // Confirm
      'PL-SC-BD-08', // Confirm
    ],
  },
  {
    role: ROLE.pipelineScheduleTaskView,
    permission: [
      'PL-DB-MN-05', // Confirm
      'PL-OP-DT-09', // Confirm
      'PL-CA-LS-11', // Confirm
      'PL-SC-CL-01', // Confirm
      'PL-SC-CL-02', // Confirm
      'PL-SC-CL-03', // Confirm
      'PL-SC-CL-04', // Confirm
      'PL-SC-CL-05', // Confirm
      'PL-SC-CL-06', // Confirm
      'PL-SC-CL-07', // Confirm
      'PL-SC-CL-08', // Confirm
      'PL-SC-LT-01', // Confirm
      'PL-SC-LT-02', // Confirm
      'PL-SC-LT-03', // Confirm
      'PL-SC-BD-01', // Confirm
      'PL-SC-BD-02', // Confirm
      'PL-SC-BD-03', // Confirm
      'PL-SC-LT-06', // Confirm
      'PL-SC-LT-07', // Confirm
      'PL-SC-BD-07', // Confirm
      'PL-SC-BD-08', // Confirm
    ],
  },
  {
    // "+ มอบหมายงาน" of the dashboard table and "มอบหมายงาน" of its assign dialog hang under both of these: usable with either
    role: ROLE.pipelineOpportunityChangeAssign,
    permission: [
      'PL-DB-MN-03', // Confirm
      'PL-DB-AS-01', // Confirm
      'PL-OP-DT-02', // Confirm
      'PL-OP-DT-14', // Confirm
      'PL-OP-DT-15', // Confirm
      'PL-OP-DT-16', // Confirm
      'PL-OP-DT-17', // Confirm
    ],
  },
  {
    role: ROLE.pipelineOpportunityChangeSalesPerson,
    permission: [
      'PL-DB-MN-03', // Confirm
      'PL-DB-AS-01', // Confirm
      'PL-OP-DT-01', // Confirm
      'PL-OP-DT-02', // Confirm
      'PL-OP-AS-01', // Confirm
    ],
  },
  {
    role: ROLE.leadAssign,
    permission: ['PL-OP-AC-01'],
  },
  {
    role: ROLE.pipelineProspectView,
    permission: [
      'PL-PR-DT-01', // Confirm
      'PL-PR-LS-01', // Confirm
      'PL-PR-LS-02', // Confirm
      'PL-PR-LS-03', // Confirm
      'PL-PR-LS-04', // Confirm
      'PL-PR-LS-06', // Confirm
      'PL-PR-LS-07', // Confirm
      'PL-PR-LS-08', // Confirm
    ],
  },
  {
    role: ROLE.pipelineProspectCreate,
    permission: [
      'PL-PR-LS-05', // Confirm
      'PL-PR-CR-01', // Confirm
      'PL-PR-CR-02', // Confirm
      'PL-PR-CR-04', // Confirm
    ],
  },
  {
    role: ROLE.pipelineOpportunityCreate,
    permission: [
      'PL-PR-LS-09', // Confirm
      'PL-PR-DT-04', // Confirm
      'PL-OP-NW-01', // Confirm
    ],
  },
  {
    role: ROLE.pipelineProspectAttachmentDownload,
    permission: [
      'PL-PR-LS-11', // Confirm
    ],
  },
  {
    role: ROLE.pipelineProspectAttachmentDelete,
    permission: [
      'PL-PR-LS-12', // Confirm
    ],
  },
  {
    role: ROLE.pipelineProspectAttachmentUpload,
    permission: [
      'PL-PR-LS-10', // Confirm
      'PL-PR-CR-03', // Confirm
      'PL-PR-DT-02', // Confirm
    ],
  },
  {
    role: ROLE.pipelineProspectEdit,
    permission: [
      'PL-PR-CR-01', // Confirm
      'PL-PR-CR-02', // Confirm
      'PL-PR-CR-04', // Confirm
      'PL-PR-DT-03', // Confirm
      'PL-PR-DT-05', // Confirm
      'PL-OP-DT-21', // Confirm
      'PL-OP-DT-22', // Confirm
      'PL-OP-DT-25', // Confirm
    ],
  },
  {
    role: ROLE.pipelineOpportunityAttachmentUpload,
    permission: [
      'PL-OP-DT-23', // Confirm
    ],
  },
  {
    role: ROLE.pipelineOpportunityAttachmentDownload,
    permission: [
      'PL-OP-DT-24', // Confirm
    ],
  },
  {
    role: ROLE.pipelineOpportunityView,
    permission: [
      'PL-OP-LS-01', // Confirm
      'PL-OP-LS-02', // Confirm
      'PL-OP-LS-03', // Confirm
      'PL-OP-LS-04', // Confirm
      'PL-OP-LS-05', // Confirm
      'PL-OP-NW-02', // Confirm
      'PL-CA-LS-07', // Confirm
    ],
  },
  {
    role: ROLE.pipelineOpportunityContactActivityCreate,
    permission: [
      'PL-OP-LS-06', // Confirm
      'PL-OP-DT-26', // Confirm
      'PL-OP-DT-27', // Confirm
      'PL-CA-LS-09', // Confirm
      'PL-CA-AD-01', // Confirm
    ],
  },
  {
    role: ROLE.pipelineOpportunityShareSharingEmployee,
    permission: [
      'PL-OP-DT-03', // Confirm
    ],
  },
  {
    role: ROLE.pipelineOpportunityWorkflowStepRework,
    permission: [
      'PL-OP-DT-18', // Confirm
    ],
  },
  {
    role: ROLE.pipelineOpportunityWorkflowStepClose,
    permission: [
      'PL-OP-DT-19', // Confirm
    ],
  },
  {
    role: ROLE.pipelineOpportunityClose,
    permission: [
      'PL-OP-DT-20', // Confirm
    ],
  },
  {
    role: ROLE.pipelineOpportunityContactView,
    permission: [
      'PL-OP-DT-28', // Confirm
      'PL-OP-DT-29', // Confirm
      'PL-OP-DT-30', // Confirm
      'PL-OP-DT-31', // Confirm
      'PL-OP-DT-32', // Confirm
      'PL-CA-LS-01', // Confirm
      'PL-CA-LS-02', // Confirm
      'PL-CA-LS-03', // Confirm
      'PL-CA-LS-04', // Confirm
      'PL-CA-LS-05', // Confirm
      'PL-CA-LS-06', // Confirm
      'PL-CA-LS-08', // Confirm
    ],
  },
  {
    role: ROLE.pipelineOpportunityEdit,
    permission: [
      'PL-OP-DT-04', // Confirm
      'PL-OP-DT-11', // Confirm
      'PL-OP-DT-12', // Confirm
      'PL-OP-TG-01', // Confirm
    ],
  },
  {
    role: ROLE.leadView,
    permission: [
      'PL-OP-LS-07',
    ],
  },
  {
    role: ROLE.contactActivityCreate,
    permission: [
      'PL-OP-DT-13',
    ],
  },
  {
    role: pipelineDocRole('letter-of-intent', 'View'),
    permission: [
      'PL-IT-LS-01', // Confirm
      'PL-IT-LS-03', // Confirm
      'PL-IT-DT-03', // Confirm
    ],
  },
  {
    role: pipelineDocRole('letter-of-intent', 'Create'),
    permission: [
      'PL-IT-LS-02', // Confirm
    ],
  },
  {
    role: pipelineDocRole('letter-of-intent', 'Edit'),
    permission: [
      'PL-IT-DT-01', // Confirm
      'PL-IT-DT-02', // Confirm
      'PL-IT-DT-04', // Confirm
    ],
  },
  {
    role: pipelineDocRole('legal-credit-request', 'View'),
    permission: [
      'PL-LR-LS-01', // Confirm
      'PL-LR-LS-03', // Confirm
      'PL-LR-DT-03', // Confirm
    ],
  },
  {
    role: pipelineDocRole('legal-credit-request', 'Create'),
    permission: [
      'PL-LR-LS-02', // Confirm
    ],
  },
  {
    role: pipelineDocRole('legal-credit-request', 'Edit'),
    permission: [
      'PL-LR-DT-01', // Confirm
      'PL-LR-DT-02', // Confirm
      'PL-LR-DT-04', // Confirm
    ],
  },
  {
    role: pipelineDocRole('service-contract', 'View'),
    permission: [
      'PL-LA-LS-01', // Confirm
      'PL-LA-LS-03', // Confirm
      'PL-LA-DT-03', // Confirm
    ],
  },
  {
    role: pipelineDocRole('service-contract', 'Create'),
    permission: [
      'PL-LA-LS-02', // Confirm
    ],
  },
  {
    role: pipelineDocRole('service-contract', 'Edit'),
    permission: [
      'PL-LA-DT-01', // Confirm
      'PL-LA-DT-02', // Confirm
      'PL-LA-DT-04', // Confirm
    ],
  },
  {
    role: pipelineDocRole('loan-agreement', 'View'),
    permission: [
      'PL-PA-LS-01', // Confirm
      'PL-PA-LS-03', // Confirm
      'PL-PA-DT-03', // Confirm
    ],
  },
  {
    role: pipelineDocRole('loan-agreement', 'Create'),
    permission: [
      'PL-PA-LS-02', // Confirm
    ],
  },
  {
    role: pipelineDocRole('loan-agreement', 'Edit'),
    permission: [
      'PL-PA-DT-01', // Confirm
      'PL-PA-DT-02', // Confirm
      'PL-PA-DT-04', // Confirm
    ],
  },
  {
    role: pipelineDocRole('preliminary-credit-approval', 'View'),
    permission: [
      'PL-PP-LS-01', // Confirm
      'PL-PP-LS-03', // Confirm
      'PL-PP-DT-03', // Confirm
    ],
  },
  {
    role: pipelineDocRole('preliminary-credit-approval', 'Create'),
    permission: [
      'PL-PP-LS-02', // Confirm
    ],
  },
  {
    role: pipelineDocRole('preliminary-credit-approval', 'Edit'),
    permission: [
      'PL-PP-DT-01', // Confirm
      'PL-PP-DT-02', // Confirm
      'PL-PP-DT-04', // Confirm
    ],
  },
  {
    role: pipelineDocRole('property-project-contract', 'View'),
    permission: [
      'PL-SV-LS-01', // Confirm
      'PL-SV-LS-03', // Confirm
      'PL-SV-DT-03', // Confirm
    ],
  },
  {
    role: pipelineDocRole('property-project-contract', 'Create'),
    permission: [
      'PL-SV-LS-02', // Confirm
    ],
  },
  {
    role: pipelineDocRole('property-project-contract', 'Edit'),
    permission: [
      'PL-SV-DT-01', // Confirm
      'PL-SV-DT-02', // Confirm
      'PL-SV-DT-04', // Confirm
    ],
  },
  {
    role: pipelineDocRole('credit-application', 'View'),
    permission: [
      'PL-CP-LS-01', // Confirm
      'PL-CP-LS-03', // Confirm
      'PL-CP-DT-03', // Confirm
    ],
  },
  {
    role: pipelineDocRole('credit-application', 'Create'),
    permission: [
      'PL-CP-LS-02', // Confirm
    ],
  },
  {
    role: pipelineDocRole('credit-application', 'Edit'),
    permission: [
      'PL-CP-DT-01', // Confirm
      'PL-CP-DT-02', // Confirm
      'PL-CP-DT-04', // Confirm
    ],
  },
];

export interface AccessButtonEntry {
  /**
   * The roles (keys of `/me/roles`, from `ROLE`) the button hangs under: it is usable with ANY of them. Usually one; empty = under no
   * role yet.
   */
  readonly roles: readonly AnyRoleKey[];
  readonly label?: string;
}

/**
 * Turns role → buttons into button → roles (plus the label), for the check by code. A button listed under more than one role gets all of
 * them, in the order of the table. Throws on a code that is not in the list, or one listed twice under the same role (a typo).
 */
export function registryOf(
  roleButtons: readonly RoleButtons[],
): Readonly<Record<AccessButtonCode, Required<AccessButtonEntry>>> {
  const rolesOf = new Map<AccessButtonCode, AnyRoleKey[]>();
  for (const { role, permission } of roleButtons) {
    for (const code of permission) {
      if (!(code in ACCESS_BUTTON_LABELS))
        throw new Error(`access button ${code} (under ${role}) is not in the list`);
      const roles = rolesOf.get(code) ?? [];
      if (roles.includes(role))
        throw new Error(`access button ${code} is listed twice under ${role}`);
      rolesOf.set(code, [...roles, role]);
    }
  }
  const codes = Object.keys(ACCESS_BUTTON_LABELS) as AccessButtonCode[];
  return Object.fromEntries(
    codes.map((code) => [
      code,
      { roles: rolesOf.get(code) ?? [], label: ACCESS_BUTTON_LABELS[code] },
    ]),
  ) as unknown as Record<AccessButtonCode, Required<AccessButtonEntry>>;
}

/** button → roles, built once from `ROLE_BUTTONS`. Whether a user may use a button is `PermissionService.canUse(code)` = `has` of any of its roles. */
export const ACCESS_BUTTONS = registryOf(ROLE_BUTTONS);

/** What `PermissionService.canUse()` reads. Tests (or a mock account) can provide a smaller or different one. */
export const ACCESS_BUTTON_REGISTRY = new InjectionToken<
  Readonly<Partial<Record<AccessButtonCode, AccessButtonEntry>>>
>('ts.accessButtonRegistry', { providedIn: 'root', factory: () => ACCESS_BUTTONS });
