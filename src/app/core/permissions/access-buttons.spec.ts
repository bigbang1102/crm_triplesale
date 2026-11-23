import { TestBed } from '@angular/core/testing';
import { describe, expect, it } from 'vitest';
import { AuthService } from '../auth/auth.service';
import { ConfigService } from '../config/config.service';
import { ME_ROLES_SAMPLE } from '../testing/me-roles.sample';
import { authStub, configStub } from '../testing/test-helpers';
import {
  ACCESS_BUTTON_LABELS,
  ACCESS_BUTTON_REGISTRY,
  ACCESS_BUTTONS,
  AccessButtonCode,
  AccessButtonEntry,
  ROLE_BUTTONS,
  registryOf,
} from './access-buttons';
import { PermissionService } from './permission.service';
import { PIPELINE_DOC_ROLES, ROLE, SUPPORTING_DOC_ROLE_PREFIX } from './roles';

describe('ACCESS_BUTTONS (registry)', () => {
  const entries = Object.entries(ACCESS_BUTTONS) as [string, AccessButtonEntry][];

  it('lists every code as <module>-<page>-<area>-<nn>', () => {
    expect(entries.length).toBeGreaterThan(0);
    const bad = entries
      .map(([code]) => code)
      .filter((code) => !/^[A-Z]{2}-[A-Z]{2}-[A-Z]{2}-\d{2}$/.test(code));
    expect(bad).toEqual([]);
  });

  it('hangs every assigned button under a role the app knows', () => {
    const known = new Set<string>([
      ...Object.values(ROLE),
      ...PIPELINE_DOC_ROLES,
      ...Object.values(SUPPORTING_DOC_ROLE_PREFIX).flatMap((p) => [
        `${p}_View`,
        `${p}_Create`,
        `${p}_Edit`,
      ]),
    ]);
    const unknown = entries
      .filter(([, e]) => e.roles.some((r) => !known.has(r)))
      .map(([code]) => code);
    expect(unknown).toEqual([]);
  });

  it('says what every button does', () => {
    expect(entries.filter(([, e]) => !e.label?.trim()).map(([code]) => code)).toEqual([]);
  });

  // a label writes the popup / page its button opens as `(<page>-<area>)`, e.g. `(SC-AD)` = PL-SC-AD, `(PL-IT-DT)`
  it('opens only areas that have buttons of their own', () => {
    const areas = new Set(entries.map(([code]) => code.slice(0, 8)));
    const notListedYet = new Set(['PL-OP-CL']); // the "close opportunity" popup: its buttons are not in the list yet
    const missing = entries.flatMap(([code, e]) =>
      [...(e.label ?? '').matchAll(/\((?:PL-)?([A-Z]{2}-[A-Z]{2})\)/g)]
        .map((m) => `PL-${m[1]}`)
        .filter((area) => !areas.has(area) && !notListedYet.has(area))
        .map((area) => `${code} → ${area}`),
    );
    expect(missing).toEqual([]);
    expect([...notListedYet].filter((area) => areas.has(area))).toEqual([]);
  });

  it('has every Pipeline_Document_* role in ROLE, the same strings that pipelineDocRole() builds', () => {
    const values = new Set<string>(Object.values(ROLE));
    expect(PIPELINE_DOC_ROLES.filter((r) => !values.has(r))).toEqual([]);
  });

  it('has a registry entry for every button of the list, and only those', () => {
    expect(Object.keys(ACCESS_BUTTONS)).toEqual(Object.keys(ACCESS_BUTTON_LABELS));
  });

  it('puts every button under a role, except the sign-in ones (no roles exist before sign-in)', () => {
    expect(entries.filter(([, e]) => e.roles.length === 0).map(([code]) => code)).toEqual([
      'LG-LI-MN-01',
      'LG-LI-MN-02',
      'LG-LI-MN-03',
    ]);
  });

  // the table must be made of roles that the backend sends, or its buttons never show: today's names (the real /me/roles answer), or
  // the new Pipeline_* names that the product team moves the buttons to, page by page (the backend does not send those yet)
  it('uses the role names the backend sends today, or a Pipeline_* name', () => {
    const sent = new Set<string>(ME_ROLES_SAMPLE.result);
    const never = [...new Set(ROLE_BUTTONS.map((r) => r.role))].filter((role) => !sent.has(role) && !role.startsWith('Pipeline_'));
    expect(never).toEqual([]);
  });

  it('the prospect list: search, search go, clear, filter, the 3 dots of a row and "ล้างค่า" / "กรอง" of the filter popup (PL-PR-LS-01 … 04, 06, 07, 08) hang under Pipeline_Prospect_View; "+ เพิ่มใหม่" (05) under Pipeline_Prospect_Create', () => {
    for (const code of ['PL-PR-LS-01', 'PL-PR-LS-02', 'PL-PR-LS-03', 'PL-PR-LS-04', 'PL-PR-LS-06', 'PL-PR-LS-07', 'PL-PR-LS-08'] as const) {
      expect(ACCESS_BUTTONS[code].roles, code).toEqual([ROLE.pipelineProspectView]);
    }
    expect(ACCESS_BUTTONS['PL-PR-LS-05'].roles).toEqual([ROLE.pipelineProspectCreate]);
    expect(ACCESS_BUTTONS['PL-PR-LS-09'].roles).toEqual([ROLE.pipelineOpportunityCreate]); // "+ สร้าง Opportunity" of the side panel
    expect(ACCESS_BUTTONS['PL-PR-LS-10'].roles).toEqual([ROLE.pipelineProspectAttachmentUpload]); // "อัปโหลด" of the side panel
    expect(ACCESS_BUTTONS['PL-PR-LS-11'].roles).toEqual([ROLE.pipelineProspectAttachmentDownload]); // "ดาวน์โหลด" of a document row
    expect(ACCESS_BUTTONS['PL-PR-LS-12'].roles).toEqual([ROLE.pipelineProspectAttachmentDelete]); // the trash icon of a document row
    expect(ACCESS_BUTTONS['PL-PR-CR-03'].roles).toEqual([ROLE.pipelineProspectAttachmentUpload]); // "อัปโหลดเอกสาร" of the add form
  });

  // a key marked `// Confirm` in ROLE_BUTTONS (and `// CONFIRMED → <role>` in ACCESS_BUTTON_LABELS) is one under a Pipeline_* role. Keep
  // them in step: when a page is confirmed, move its buttons under their Pipeline_* roles, mark them, and update this list
  it('the keys under a Pipeline_* role are exactly the ones marked as confirmed', () => {
    const confirmed = [
      ...new Set(ROLE_BUTTONS.filter((r) => r.role.startsWith('Pipeline_')).flatMap((r) => r.permission)),
    ].sort();
    expect(confirmed).toEqual([
      // the save button of the contact popup of the contact-activity list (AD-01), under Pipeline_Opportunity_Contact_Activity_Create
      'PL-CA-AD-01',
      // the contact-activity list (/crm/activities): the magnifier and the funnel of its top bar, "ล้างค่า" / "กรอง" of its filter panel, and the
      // expand-all arrow and the arrow of every row of its table, under Pipeline_Opportunity_Contact_View, the "ไปหน้าโอกาสขาย" of its panel (LS-07), under Pipeline_Opportunity_View, the filter icon of the history in that panel (LS-08), under Pipeline_Opportunity_Contact_View, its purple "+ เพิ่มการติดต่อ" (LS-09), under Pipeline_Opportunity_Contact_Activity_Create, and the links to the Schedule in its appointment and task tables (LS-10, LS-11) and the checkbox of a task (LS-12), under Pipeline_Schedule_Appointment_View / _Task_View / _Task_Add_Edit
      'PL-CA-LS-01',
      'PL-CA-LS-02',
      'PL-CA-LS-03',
      'PL-CA-LS-04',
      'PL-CA-LS-05',
      'PL-CA-LS-06',
      'PL-CA-LS-07',
      'PL-CA-LS-08',
      'PL-CA-LS-09',
      'PL-CA-LS-10',
      'PL-CA-LS-11',
      'PL-CA-LS-12',
      // its details: save and upload (DT-01, 02) and delete of an attachment (DT-04) under Pipeline_Document_CreditApplication_Edit, download (DT-03) under _View
      'PL-CP-DT-01',
      'PL-CP-DT-02',
      'PL-CP-DT-03',
      'PL-CP-DT-04',
      // the credit-application list (/crm/supporting-docs/credit-application): magnifier and eye (LS-01, 03) under Pipeline_Document_CreditApplication_View, "+ เพิ่มใหม่" (LS-02) under _Create
      'PL-CP-LS-01',
      'PL-CP-LS-02',
      'PL-CP-LS-03',
      // the dashboard of the CRM module (/crm/home): the five buttons of the cards and of the table, and the save button of the assign
      // dialog (AS-01); "+ มอบหมายงาน" (MN-03) and AS-01 are each under two roles
      'PL-DB-AS-01',
      'PL-DB-MN-01',
      'PL-DB-MN-02',
      'PL-DB-MN-03',
      'PL-DB-MN-04',
      'PL-DB-MN-05',
      // its details: save and upload (DT-01, 02) and delete of an attachment (DT-04) under Pipeline_Document_LetterofIntent_Edit, download (DT-03) under _View
      'PL-IT-DT-01',
      'PL-IT-DT-02',
      'PL-IT-DT-03',
      'PL-IT-DT-04',
      // the letter-of-intent list (/crm/supporting-docs/letter-of-intent): the magnifier and the eye of a row, under Pipeline_Document_LetterofIntent_View, and "+ เพิ่มใหม่" under Pipeline_Document_LetterofIntent_Create
      'PL-IT-LS-01',
      'PL-IT-LS-02',
      'PL-IT-LS-03',
      // the loan-agreement pages (/crm/supporting-docs/loan-agreement) hang under the Servicecontract roles: list magnifier and eye (LS-01, 03) and download (DT-03) under Pipeline_Document_Servicecontract_View, "+ เพิ่มใหม่" (LS-02) under _Create, save, upload and delete (DT-01, 02, 04) under _Edit
      'PL-LA-DT-01',
      'PL-LA-DT-02',
      'PL-LA-DT-03',
      'PL-LA-DT-04',
      'PL-LA-LS-01',
      'PL-LA-LS-02',
      'PL-LA-LS-03',
      // its details: save and upload (DT-01, 02) and delete of an attachment (DT-04) under Pipeline_Document_LegalCreditServiceRequest_Edit, download (DT-03) under _View
      'PL-LR-DT-01',
      'PL-LR-DT-02',
      'PL-LR-DT-03',
      'PL-LR-DT-04',
      // the legal-credit-request list (/crm/supporting-docs/legal-credit-request): the magnifier and the eye of a row, under Pipeline_Document_LegalCreditServiceRequest_View, and "+ เพิ่มใหม่" under _Create
      'PL-LR-LS-01',
      'PL-LR-LS-02',
      'PL-LR-LS-03',
      // the save button of the change-salesperson popup of an opportunity (AS-01), under Pipeline_Opportunity_Change_Sales_Person
      'PL-OP-AS-01',
      // the details of an opportunity (/crm/opportunities/:id): the pencil of the sales team, "+ เพิ่มพนักงานขาย / ผู้รับผิดชอบ", the "+" of the access
      // rights, "+ เพิ่ม/แก้ไข Tag", and the "+", the link and the card of the appointment table and of the task table; DT-01 and DT-02
      // are each under Pipeline_Opportunity_Change_Sales_Person, DT-02 under Change_Assign too
      ...['01', '02', '03', '04', '05', '06', '07', '08', '09', '10', '11', '12', '14', '15', '16', '17', '18', '19', '20', '21', '22', '23', '24', '25', '26', '27', '28', '29', '30', '31', '32'].map((n) => `PL-OP-DT-${n}`),
      // the opportunity list (/crm/opportunities): search icon, "ค้นหา", the filter funnel, "ล้างค่า" / "กรอง" of its dialog, and the drag of a card
      ...['01', '02', '03', '04', '05', '06'].map((n) => `PL-OP-LS-${n}`),
      // the create-opportunity popup (opened from the prospect list): its save button (NW-01) and the "ไปโอกาสขาย" of its success window (NW-02)
      'PL-OP-NW-01',
      'PL-OP-NW-02',
      // the save button of the tag popup of an opportunity (TG-01), under Pipeline_Opportunity_Edit
      'PL-OP-TG-01',
      // its details: save and upload (DT-01, 02) and delete of an attachment (DT-04) under Pipeline_Document_LoanAgreement_Edit, download (DT-03) under _View
      'PL-PA-DT-01',
      'PL-PA-DT-02',
      'PL-PA-DT-03',
      'PL-PA-DT-04',
      // the preliminary-credit-approval list (/crm/supporting-docs/preliminary-credit-approval) hangs under the LoanAgreement roles: magnifier and eye (LS-01, 03) under Pipeline_Document_LoanAgreement_View, "+ เพิ่มใหม่" (LS-02) under _Create
      'PL-PA-LS-01',
      'PL-PA-LS-02',
      'PL-PA-LS-03',
      // its details: save and upload (DT-01, 02) and delete of an attachment (DT-04) under Pipeline_Document_PreliminaryCreditApproval_Edit, download (DT-03) under _View
      'PL-PP-DT-01',
      'PL-PP-DT-02',
      'PL-PP-DT-03',
      'PL-PP-DT-04',
      // the property-project-contract list (/crm/supporting-docs/property-project-contract) hangs under the PreliminaryCreditApproval roles: magnifier and eye (LS-01, 03) under Pipeline_Document_PreliminaryCreditApproval_View, "+ เพิ่มใหม่" (LS-02) under _Create
      'PL-PP-LS-01',
      'PL-PP-LS-02',
      'PL-PP-LS-03',
      // the prospect form in add mode (/crm/prospects/new): the photo, "คัดลอกที่อยู่", the upload of documents and "บันทึกและสร้าง Opportunity", each under Pipeline_Prospect_Create and under Pipeline_Prospect_Edit
      'PL-PR-CR-01',
      'PL-PR-CR-02',
      'PL-PR-CR-03',
      'PL-PR-CR-04',
      // the prospect form in view / edit mode (/crm/prospects/:id): "คัดลอกที่อยู่" (DT-01) under Pipeline_Prospect_View, the upload (DT-02) under Pipeline_Prospect_Attachment_Upload, "แก้ไขข้อมูล" (DT-03) and "อัปเดตข้อมูล" (DT-05) under Pipeline_Prospect_Edit, "สร้าง Opportunity" (DT-04) under Pipeline_Opportunity_Create
      'PL-PR-DT-01',
      'PL-PR-DT-02',
      'PL-PR-DT-03',
      'PL-PR-DT-04',
      'PL-PR-DT-05',
      // the prospect list
      ...['01', '02', '03', '04', '05', '06', '07', '08', '09', '10', '11', '12'].map((n) => `PL-PR-LS-${n}`),
      // the Schedule (/crm/schedule): the magnifier and the funnel of its toolbar "วันนี้" and an item of the calendar (CL-04), a day of the year view with items (CL-05) an item of its pop-over (CL-06), and "ล้างค่า" / "กรอง" of the filter dialog (CL-07, CL-08) and the search, its X and the funnel of the List tab (LT-01 … 03), each under Pipeline_Schedule_Appointment_View and under Pipeline_Schedule_Task_View
      'PL-SC-AD-01',
      'PL-SC-AD-02',
      'PL-SC-BD-01',
      'PL-SC-BD-02',
      'PL-SC-BD-03',
      'PL-SC-BD-04',
      'PL-SC-BD-05',
      'PL-SC-BD-06',
      'PL-SC-BD-07',
      'PL-SC-BD-08',
      'PL-SC-CL-01',
      'PL-SC-CL-02',
      'PL-SC-CL-03',
      'PL-SC-CL-04',
      'PL-SC-CL-05',
      'PL-SC-CL-06',
      'PL-SC-CL-07',
      'PL-SC-CL-08',
      'PL-SC-ED-01',
      'PL-SC-ED-02',
      'PL-SC-LT-01',
      'PL-SC-LT-02',
      'PL-SC-LT-03',
      'PL-SC-LT-04',
      'PL-SC-LT-05',
      'PL-SC-LT-06',
      'PL-SC-LT-07',
      // its details: save and upload (DT-01, 02) and delete of an attachment (DT-04) under Pipeline_Document_PropertyProjectContract_Edit, download (DT-03) under _View
      'PL-SV-DT-01',
      'PL-SV-DT-02',
      'PL-SV-DT-03',
      'PL-SV-DT-04',
      // the service-contract list (/crm/supporting-docs/service-contract) hangs under the PropertyProjectContract roles: magnifier and eye (LS-01, 03) under Pipeline_Document_PropertyProjectContract_View, "+ เพิ่มใหม่" (LS-02) under _Create
      'PL-SV-LS-01',
      'PL-SV-LS-02',
      'PL-SV-LS-03',
    ]);
  });

  it('the opportunity list: the search icon, "ค้นหา", the filter funnel and "ล้างค่า" / "กรอง" of its dialog (PL-OP-LS-01 … 05) hang under Pipeline_Opportunity_View', () => {
    for (const code of ['PL-OP-LS-01', 'PL-OP-LS-02', 'PL-OP-LS-03', 'PL-OP-LS-04', 'PL-OP-LS-05'] as const) {
      expect(ACCESS_BUTTONS[code].roles, code).toEqual([ROLE.pipelineOpportunityView]);
    }
    // the tag popup: its "บันทึก" (TG-01) hangs under Opportunity_Edit, like the "+ เพิ่ม/แก้ไข Tag" that opens it (DT-04)
    expect(ACCESS_BUTTONS['PL-OP-TG-01'].roles).toEqual([ROLE.pipelineOpportunityEdit]);
    // the change-salesperson popup: its "บันทึก" (AS-01) hangs under Change_Sales_Person
    expect(ACCESS_BUTTONS['PL-OP-AS-01'].roles).toEqual([ROLE.pipelineOpportunityChangeSalesPerson]);
    // the create-opportunity popup: "สร้าง Lead" (NW-01) hangs under Opportunity_Create, "ไปโอกาสขาย" after it succeeded (NW-02) under Opportunity_View
    expect(ACCESS_BUTTONS['PL-OP-NW-01'].roles).toEqual([ROLE.pipelineOpportunityCreate]);
    expect(ACCESS_BUTTONS['PL-OP-NW-02'].roles).toEqual([ROLE.pipelineOpportunityView]);
    // the contact-activity list: the links to the Schedule of the appointment table (LS-10) and of the task table (LS-11), and the checkbox of a task (LS-12)
    expect(ACCESS_BUTTONS['PL-CA-LS-10'].roles).toEqual([ROLE.pipelineScheduleAppointmentView]);
    expect(ACCESS_BUTTONS['PL-CA-LS-11'].roles).toEqual([ROLE.pipelineScheduleTaskView]);
    expect(ACCESS_BUTTONS['PL-CA-LS-12'].roles).toEqual([ROLE.pipelineScheduleTaskAddEdit]);
    // the Schedule: the magnifier and the funnel of the toolbar and "วันนี้" are usable with either of the two view roles
    for (const code of ['PL-SC-CL-01', 'PL-SC-CL-02', 'PL-SC-CL-03', 'PL-SC-CL-04', 'PL-SC-CL-05', 'PL-SC-CL-06', 'PL-SC-CL-07', 'PL-SC-CL-08', 'PL-SC-LT-01', 'PL-SC-LT-02', 'PL-SC-LT-03', 'PL-SC-BD-01', 'PL-SC-BD-02', 'PL-SC-BD-03'] as const) {
      expect(ACCESS_BUTTONS[code].roles, code).toEqual([ROLE.pipelineScheduleAppointmentView, ROLE.pipelineScheduleTaskView]);
    }
    // the "+ เพิ่ม" and the three dots of the appointment table of the list tab: usable with the appointment add/edit role or the appointment view role
    for (const code of ['PL-SC-LT-04', 'PL-SC-LT-05', 'PL-SC-BD-04', 'PL-SC-BD-05'] as const) {
      expect(ACCESS_BUTTONS[code].roles, code).toEqual([ROLE.pipelineScheduleAppointmentAddEdit, ROLE.pipelineScheduleAppointmentView]);
    }
    expect(ACCESS_BUTTONS['PL-SC-BD-06'].roles).toEqual([ROLE.pipelineScheduleAppointmentAddEdit, ROLE.pipelineScheduleTaskAddEdit]); // drag & drop of a board card
    for (const code of ['PL-SC-AD-01', 'PL-SC-AD-02', 'PL-SC-ED-01', 'PL-SC-ED-02'] as const) {
      expect(ACCESS_BUTTONS[code].roles, code).toEqual([ROLE.pipelineScheduleAppointmentAddEdit, ROLE.pipelineScheduleTaskAddEdit]);
    }
    for (const code of ['PL-SC-LT-06', 'PL-SC-LT-07', 'PL-SC-BD-07', 'PL-SC-BD-08'] as const) {
      expect(ACCESS_BUTTONS[code].roles, code).toEqual([ROLE.pipelineScheduleTaskAddEdit, ROLE.pipelineScheduleTaskView]);
    }
    // the contact-activity list: "ไปหน้าโอกาสขาย →" of the panel of a row goes to the opportunity (LS-07)
    expect(ACCESS_BUTTONS['PL-CA-LS-07'].roles).toEqual([ROLE.pipelineOpportunityView]);
    // dragging a card to another column saves a contact activity (POST /board/contact-activities, as the button of the detail page does)
    expect(ACCESS_BUTTONS['PL-OP-LS-06'].roles).toEqual([ROLE.pipelineOpportunityContactActivityCreate]);
  });

  it('the details of an opportunity: the pencil of the sales team (PL-OP-DT-01), "+ เพิ่มพนักงานขาย / ผู้รับผิดชอบ" (02, under two roles: usable with either), the "+" of the access rights (03) and "+ เพิ่ม/แก้ไข Tag" (04)', () => {
    expect(ACCESS_BUTTONS['PL-OP-DT-01'].roles).toEqual([ROLE.pipelineOpportunityChangeSalesPerson]);
    expect(ACCESS_BUTTONS['PL-OP-DT-02'].roles).toEqual([
      ROLE.pipelineOpportunityChangeAssign,
      ROLE.pipelineOpportunityChangeSalesPerson,
    ]);
    expect(ACCESS_BUTTONS['PL-OP-DT-03'].roles).toEqual([ROLE.pipelineOpportunityShareSharingEmployee]);
    expect(ACCESS_BUTTONS['PL-OP-DT-04'].roles).toEqual([ROLE.pipelineOpportunityEdit]);
    // the appointment table: "+" (05) like the "+" of the dashboard card, the link to the Schedule (06) like the link of that card
    expect(ACCESS_BUTTONS['PL-OP-DT-05'].roles).toEqual([ROLE.pipelineScheduleAppointmentAddEdit]);
    expect(ACCESS_BUTTONS['PL-OP-DT-06'].roles).toEqual([ROLE.pipelineScheduleAppointmentView]);
    // a click on the appointment card opens the view / edit popup (SC-ED): the team put it under Add_Edit, not under _View
    expect(ACCESS_BUTTONS['PL-OP-DT-07'].roles).toEqual([ROLE.pipelineScheduleAppointmentAddEdit]);
    // the task table, the same three: "+" (08) and the card (10) under Task_Add_Edit, the link (09) under Task_View
    expect(ACCESS_BUTTONS['PL-OP-DT-08'].roles).toEqual([ROLE.pipelineScheduleTaskAddEdit]);
    expect(ACCESS_BUTTONS['PL-OP-DT-09'].roles).toEqual([ROLE.pipelineScheduleTaskView]);
    expect(ACCESS_BUTTONS['PL-OP-DT-10'].roles).toEqual([ROLE.pipelineScheduleTaskAddEdit]);
    // the products: "+ เพิ่มผลิตภัณฑ์" (11) and "สร้างใบเสนอราคา ▾" (12, the one of the head and the one of every row) under Opportunity_Edit
    expect(ACCESS_BUTTONS['PL-OP-DT-11'].roles).toEqual([ROLE.pipelineOpportunityEdit]);
    expect(ACCESS_BUTTONS['PL-OP-DT-12'].roles).toEqual([ROLE.pipelineOpportunityEdit]);
    // the forward block and "บันทึก" (14 the trash of a card, 15 "+ ส่งต่องานคนที่ N", 16 the switch, 17 the save button) under Change_Assign
    for (const code of ['PL-OP-DT-14', 'PL-OP-DT-15', 'PL-OP-DT-16', 'PL-OP-DT-17'] as const) {
      expect(ACCESS_BUTTONS[code].roles, code).toEqual([ROLE.pipelineOpportunityChangeAssign]);
    }
    // the footer: "ส่งกลับแก้ไข" (18), "ปิดแก้ไขกลุ่มขั้นตอน" (19) and "ปิดโอกาสขาย" (20, the footer and the table view)
    expect(ACCESS_BUTTONS['PL-OP-DT-18'].roles).toEqual([ROLE.pipelineOpportunityWorkflowStepRework]);
    expect(ACCESS_BUTTONS['PL-OP-DT-19'].roles).toEqual([ROLE.pipelineOpportunityWorkflowStepClose]);
    expect(ACCESS_BUTTONS['PL-OP-DT-20'].roles).toEqual([ROLE.pipelineOpportunityClose]);
    // the main-info tab: the pencil on the profile picture changes the picture of the customer (a prospect), so it hangs under Prospect_Edit
    expect(ACCESS_BUTTONS['PL-OP-DT-21'].roles).toEqual([ROLE.pipelineProspectEdit]);
    // … and so does "อัปเดตข้อมูล" of the tab (22), which saves the data of the customer
    expect(ACCESS_BUTTONS['PL-OP-DT-22'].roles).toEqual([ROLE.pipelineProspectEdit]);
    // the supporting documents: "อัปโหลด" (23) and the "ดาวน์โหลด" of every row (24) hang under Prospect_Edit too
    expect(ACCESS_BUTTONS['PL-OP-DT-23'].roles).toEqual([ROLE.pipelineOpportunityAttachmentUpload]);
    expect(ACCESS_BUTTONS['PL-OP-DT-24'].roles).toEqual([ROLE.pipelineOpportunityAttachmentDownload]);
    // the "เอกสารงานขาย" tab: the download icon of its cards (25), the only button of the tab, hangs under Prospect_Edit as well
    expect(ACCESS_BUTTONS['PL-OP-DT-25'].roles).toEqual([ROLE.pipelineProspectEdit]);
    // the table view: "+ เพิ่มการติดต่อ" (26) and "จบขั้นตอน" (27) of the current step save a contact activity, like the drag of a card (PL-OP-LS-06)
    for (const code of ['PL-OP-LS-06', 'PL-OP-DT-26', 'PL-OP-DT-27', 'PL-CA-LS-09', 'PL-CA-AD-01'] as const) {
      expect(ACCESS_BUTTONS[code].roles, code).toEqual([ROLE.pipelineOpportunityContactActivityCreate]);
    }
    // the three icons in the head of the contact history (28 the filter funnel, 29 the side panel, 30 the table view) and the two buttons of the
    // filter popup (31 "ล้างค่า", 32 "กรองข้อมูล") under Contact_View
    // (and the six buttons of the contact-activity list, PL-CA-LS-01 … 06, which the same role opens)
    for (const code of ['PL-OP-DT-28', 'PL-OP-DT-29', 'PL-OP-DT-30', 'PL-OP-DT-31', 'PL-OP-DT-32', 'PL-CA-LS-01', 'PL-CA-LS-02', 'PL-CA-LS-03', 'PL-CA-LS-04', 'PL-CA-LS-05', 'PL-CA-LS-06', 'PL-CA-LS-08'] as const) {
      expect(ACCESS_BUTTONS[code].roles, code).toEqual([ROLE.pipelineOpportunityContactView]);
    }
  });

  it('the dashboard: the appointment card (PL-DB-MN-01 "+", 02 link) hangs under Pipeline_Schedule_Appointment_*, the task card (04 "+", 05 link) under Pipeline_Schedule_Task_*', () => {
    expect(ACCESS_BUTTONS['PL-DB-MN-01'].roles).toEqual([ROLE.pipelineScheduleAppointmentAddEdit]);
    expect(ACCESS_BUTTONS['PL-DB-MN-02'].roles).toEqual([ROLE.pipelineScheduleAppointmentView]);
    expect(ACCESS_BUTTONS['PL-DB-MN-04'].roles).toEqual([ROLE.pipelineScheduleTaskAddEdit]);
    // "+ มอบหมายงาน" of the dashboard table and "มอบหมายงาน" of its assign dialog hang under two roles: usable with either
    for (const code of ['PL-DB-MN-03', 'PL-DB-AS-01'] as const) {
      expect(ACCESS_BUTTONS[code].roles, code).toEqual([
        ROLE.pipelineOpportunityChangeAssign,
        ROLE.pipelineOpportunityChangeSalesPerson,
      ]);
    }
    expect(ACCESS_BUTTONS['PL-DB-MN-05'].roles).toEqual([ROLE.pipelineScheduleTaskView]);
  });
});

describe('registryOf (role → buttons becomes button → role)', () => {
  it('gives every button of a role that role, and keeps the labels', () => {
    const reg = registryOf([
      { role: ROLE.pipelineLeadCreate, permission: ['PL-PR-LS-01', 'PL-PR-LS-02'] },
      { role: ROLE.pipelineLeadAssign, permission: ['PL-PR-LS-03'] },
    ]);
    expect(reg['PL-PR-LS-01'].roles).toEqual([ROLE.pipelineLeadCreate]);
    expect(reg['PL-PR-LS-02'].roles).toEqual([ROLE.pipelineLeadCreate]);
    expect(reg['PL-PR-LS-03'].roles).toEqual([ROLE.pipelineLeadAssign]);
    expect(reg['PL-PR-LS-01'].label).toBe(ACCESS_BUTTON_LABELS['PL-PR-LS-01']);
  });

  it('leaves a button that is under no role with role null', () => {
    const reg = registryOf([{ role: ROLE.pipelineLeadCreate, permission: ['PL-PR-LS-01'] }]);
    expect(reg['PL-PR-LS-04'].roles).toEqual([]);
    expect(Object.keys(reg)).toEqual(Object.keys(ACCESS_BUTTON_LABELS));
  });

  it('a button listed under two roles gets both, in the order of the table', () => {
    const reg = registryOf([
      { role: ROLE.pipelineLeadCreate, permission: ['PL-PR-LS-01'] },
      { role: ROLE.pipelineLeadEdit, permission: ['PL-PR-LS-01', 'PL-PR-LS-02'] },
    ]);
    expect(reg['PL-PR-LS-01'].roles).toEqual([ROLE.pipelineLeadCreate, ROLE.pipelineLeadEdit]);
    expect(reg['PL-PR-LS-02'].roles).toEqual([ROLE.pipelineLeadEdit]);
  });

  it('throws when the same button is listed twice under the same role (a typo)', () => {
    expect(() =>
      registryOf([{ role: ROLE.pipelineLeadCreate, permission: ['PL-PR-LS-01', 'PL-PR-LS-01'] }]),
    ).toThrow(/PL-PR-LS-01 is listed twice under Pipeline_Lead_Create/);
  });

  it('throws on a code that is not in the list (a typo that got past the types)', () => {
    expect(() =>
      registryOf([
        { role: ROLE.pipelineLeadCreate, permission: ['PL-XX-YY-01' as AccessButtonCode] },
      ]),
    ).toThrow(/PL-XX-YY-01/);
  });

  it('accepts the real ROLE_BUTTONS (it was built at load: no button twice, none unknown)', () => {
    expect(() => registryOf(ROLE_BUTTONS)).not.toThrow();
  });
});

describe('PermissionService.canUse', () => {
  const REGISTRY: Partial<Record<AccessButtonCode, AccessButtonEntry>> = {
    'PL-PR-LS-01': { roles: [ROLE.pipelineLeadCreate] },
    'PL-PR-LS-02': { roles: [ROLE.pipelineLeadCreate] }, // buttons may share a role
    'PL-PR-LS-03': { roles: [ROLE.pipelineLeadAssign] },
    'PL-PR-LS-04': { roles: [] }, // not assigned yet
  };

  function setup(roles: string[] | null) {
    TestBed.configureTestingModule({
      providers: [
        { provide: AuthService, useValue: authStub(roles) },
        {
          provide: ConfigService,
          useValue: configStub({ features: { aiHubEnabled: false, pageGuardEnabled: true } }),
        },
        { provide: ACCESS_BUTTON_REGISTRY, useValue: REGISTRY },
      ],
    });
    return TestBed.inject(PermissionService);
  }

  it('allows a button when the user holds the role it hangs under', () => {
    const perm = setup([ROLE.pipelineLeadCreate]);
    expect(perm.canUse('PL-PR-LS-01')).toBe(true);
    expect(perm.canUse('PL-PR-LS-02')).toBe(true);
    expect(perm.canUse('PL-PR-LS-03')).toBe(false);
  });

  it('matches the role exactly: a look-alike key opens nothing', () => {
    expect(
      setup([ROLE.leadEdit, 'pipeline_lead_create', 'Pipeline_Lead_Create ']).canUse('PL-PR-LS-01'),
    ).toBe(false);
  });

  it('is fail-closed: no session, no roles, a button without a role, a code that is not in the registry', () => {
    expect(setup(null).canUse('PL-PR-LS-01')).toBe(false);
    TestBed.resetTestingModule();
    const perm = setup([ROLE.pipelineLeadCreate]);
    expect(perm.canUse('PL-PR-LS-04')).toBe(false);
    expect(perm.canUse('PL-PR-LS-05')).toBe(false);
  });

  it('lets a super-admin use every assigned button, but not one with no role yet', () => {
    const perm = setup(['super_admin']);
    expect(perm.canUse('PL-PR-LS-01')).toBe(true);
    expect(perm.canUse('PL-PR-LS-03')).toBe(true);
    expect(perm.canUse('PL-PR-LS-04')).toBe(false);
  });
});

// the table is kept in the front end; the backend sends role names only: a role it sends opens every button under that role
describe('a role the backend sends opens all the buttons under it', () => {
  const TABLE = registryOf([
    {
      role: ROLE.pipelineLeadCreate,
      permission: ['PL-PR-LS-01', 'PL-PR-LS-02', 'PL-PR-CR-01'],
    },
    { role: ROLE.pipelineLeadAssign, permission: ['PL-PR-LS-03'] },
  ]);
  const ALL = ['PL-PR-LS-01', 'PL-PR-LS-02', 'PL-PR-CR-01', 'PL-PR-LS-03'] as const;

  function canUseOf(roles: string[]) {
    TestBed.configureTestingModule({
      providers: [
        { provide: AuthService, useValue: authStub(roles) },
        {
          provide: ConfigService,
          useValue: configStub({ features: { aiHubEnabled: false, pageGuardEnabled: true } }),
        },
        { provide: ACCESS_BUTTON_REGISTRY, useValue: TABLE },
      ],
    });
    const perm = TestBed.inject(PermissionService);
    return ALL.filter((code) => perm.canUse(code));
  }

  it('opens every button of the role, and only those', () => {
    expect(canUseOf([ROLE.pipelineLeadCreate])).toEqual([
      'PL-PR-LS-01',
      'PL-PR-LS-02',
      'PL-PR-CR-01',
    ]);
    TestBed.resetTestingModule();
    expect(canUseOf([ROLE.pipelineLeadAssign])).toEqual(['PL-PR-LS-03']);
  });

  it('opens the buttons of every role the backend sent', () => {
    expect(canUseOf([ROLE.pipelineLeadAssign, ROLE.pipelineLeadCreate])).toEqual([...ALL]);
  });

  it('opens nothing when the role is not sent', () => {
    expect(canUseOf([ROLE.pipelineLeadEdit])).toEqual([]);
  });
});

describe('a button under two roles is usable with either', () => {
  const TWO = registryOf([
    { role: ROLE.pipelineOpportunityChangeAssign, permission: ['PL-DB-MN-03'] },
    { role: ROLE.pipelineOpportunityChangeSalesPerson, permission: ['PL-DB-MN-03'] },
  ]);

  function canUseWith(roles: string[]) {
    TestBed.configureTestingModule({
      providers: [
        { provide: AuthService, useValue: authStub(roles) },
        {
          provide: ConfigService,
          useValue: configStub({ features: { aiHubEnabled: false, pageGuardEnabled: true } }),
        },
        { provide: ACCESS_BUTTON_REGISTRY, useValue: TWO },
      ],
    });
    return TestBed.inject(PermissionService).canUse('PL-DB-MN-03');
  }

  it.each([
    [[ROLE.pipelineOpportunityChangeAssign], true],
    [[ROLE.pipelineOpportunityChangeSalesPerson], true],
    [[ROLE.pipelineOpportunityChangeAssign, ROLE.pipelineOpportunityChangeSalesPerson], true],
    [[ROLE.pipelineOpportunityAssign], false],
    [[], false],
  ])('with %j → %s', (roles, usable) => {
    expect(canUseWith(roles)).toBe(usable);
  });
});
