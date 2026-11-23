import { AI_HUB_ROLE } from './ai-hub-roles';

/**
 * Role keys returned by `GET /triplesale-service/api/v1/me/roles` and used by the Java frontend
 * (`commonBean.hasFeature('A,B')`). Source: docs/analysis/02-backend-auth-api-i18n.md §2.6.
 *
 * Three layers:
 *   MODULE_* / FEATURE_*   menu visibility + page guard
 *   CRM_<Area>_<Action>    buttons / fields inside a page ("_Sup" = supervisor override)
 *   Chat_* / Report_*      chat and report specific keys
 *   Pipeline_<Area>_…      the backend's newer names; buttons hang under them through `ACCESS_BUTTONS` (access-buttons.ts)
 *
 * `// Confirm` after a role = the product team confirmed that name: the `Pipeline_*` roles that confirmed buttons hang under
 * (see `ROLE_BUTTONS`), the six `MODULE_*` roles given for the left rail, and `Pipeline_Dashboard_Access` for the dashboard tab of
 * the CRM module. A role without it is the backend's list as it was handed over, or a name the team chose that is not confirmed (the
 * notes on the groups below say which).
 */
export const ROLE = {
  // modules & features (menu + page guard)
  moduleCrm: 'MODULE_CRM',
  moduleChat: 'MODULE_CHATBOX',
  featureDashboard: 'FEATURE_CRM_Dashboard',
  featureProspect: 'FEATURE_CRM_Prospect',
  featureLead: 'FEATURE_CRM_Lead',
  featureContactActivity: 'FEATURE_CRM_ContactActivity',
  featureCalendar: 'FEATURE_CRM_Calendar',
  featureDocument: 'FEATURE_CRM_Document',
  featureReport: 'FEATURE_CRM_Report',

  // fine grained
  dashboardView: 'CRM_Dashboard_View',
  prospectView: 'CRM_Prospect_View',
  prospectCreate: 'CRM_Prospect_Create',
  prospectEdit: 'CRM_Prospect_Edit',
  leadView: 'CRM_Lead_View',
  leadEdit: 'CRM_Lead_Edit',
  leadAssign: 'CRM_Lead_Assign',
  leadAssignSup: 'CRM_Lead_Assign_Sup',
  leadSalesPersonAssign: 'CRM_Lead_Sales_Person_Assign',
  leadClose: 'CRM_Lead_Close',
  leadCloseSup: 'CRM_Lead_Close_Sup',
  leadStepClose: 'CRM_Lead_WorkflowStep_Close',
  leadStepCloseSup: 'CRM_Lead_WorkflowStep_Close_Sup',
  leadStepRework: 'CRM_Lead_WorkflowStep_Rework',
  leadStepReworkSup: 'CRM_Lead_WorkflowStep_Rework_Sup',
  contactActivityView: 'CRM_ContactActivity_View',
  contactActivityCreate: 'CRM_ContactActivity_Create',
  contactActivityCreateSup: 'CRM_ContactActivity_Create_Sup',
  scheduleView: 'CRM_Schedule_View',
  scheduleCreate: 'CRM_Schedule_Create',
  scheduleCreateSup: 'CRM_Schedule_Create_Sup',
  scheduleEdit: 'CRM_Schedule_Edit',
  rvView: 'CRM_RV_View',
  rvEdit: 'CRM_RV_Edit',

  // in the backend's real `/me/roles` answer of 2026-10-28 (core/testing/me-roles.sample.ts) but in none of the lists above
  moduleDocument: 'MODULE_DOCUMENT',
  leadCreate: 'CRM_Lead_Create',
  leadMovementType: 'CRM_Lead_MovementType',
  leadActivityGroupAdmin: 'CRM_Lead_ActivityGroup_Admin',
  leadActivityGroupUser: 'CRM_Lead_ActivityGroup_User',
  prospectDelete: 'CRM_Prospect_Delete',
  documentRvCreate: 'Document_RV_Create',
  documentRvApprove: 'Document_RV_Approve',
  customerSupportLeadAllViewOnly: 'Customer_Support_Lead_All_View_Only',

  // the backend's full role list (2026-10-28) — everything in it that the groups above do not already hold
  // modules — the backend's new names
  moduleDashboard: 'MODULE_DASHBOARD', // Confirm
  modulePipeline: 'MODULE_Pipeline', // Confirm
  moduleSmartDoc: 'MODULE_Smart_Doc', // Confirm
  moduleChatBox: 'MODULE_Chat_Box', // Confirm
  moduleReport: 'MODULE_Report', // Confirm
  moduleConfig: 'MODULE_Config', // Confirm

  // pipeline · lead — the NEW Lead feature (features/leads ; the Lead the app had is now Opportunity, below); only pipelineLeadView is used so far (menu tab + page)
  pipelineLeadView: 'Pipeline_Lead_View',
  pipelineLeadCustomerPdpaData: 'Pipeline_Lead_Customer_PDPA_Data',
  pipelineLeadCustomerCriticalData: 'Pipeline_Lead_Customer_Critical_Data',
  pipelineLeadCompanyFinancialData: 'Pipeline_Lead_Company_Financial_Data',
  pipelineLeadCompanyStrategicData: 'Pipeline_Lead_Company_Strategic_Data',
  pipelineLeadCreate: 'Pipeline_Lead_Create',
  pipelineLeadEdit: 'Pipeline_Lead_Edit',
  pipelineLeadContactView: 'Pipeline_Lead_Contact_View',
  pipelineLeadContactActivityCreate: 'Pipeline_Lead_Contact_Activity_Create',
  pipelineLeadAssign: 'Pipeline_Lead_Assign',
  pipelineLeadChangeAssign: 'Pipeline_Lead_Change_Assign',
  pipelineLeadClose: 'Pipeline_Lead_Close',
  pipelineLeadBlock: 'Pipeline_Lead_Block',
  pipelineLeadResponsiblePerson: 'Pipeline_Lead_Responsible_Person',
  pipelineLeadAttachmentView: 'Pipeline_Lead_Attachment_View',
  pipelineLeadAttachmentDownload: 'Pipeline_Lead_Attachment_Download',
  pipelineLeadAttachmentDelete: 'Pipeline_Lead_Attachment_Delete',
  pipelineLeadAttachmentUpload: 'Pipeline_Lead_Attachment_Upload',
  pipelineLeadTrash: 'Pipeline_Lead_Trash',
  pipelineLeadConvertProspect: 'Pipeline_Lead_Convert_Prospect',

  // pipeline · prospect
  pipelineProspectView: 'Pipeline_Prospect_View', // Confirm
  pipelineProspectCustomerPdpaData: 'Pipeline_Prospect_Customer_PDPA_Data',
  pipelineProspectCustomerCriticalData: 'Pipeline_Prospect_Customer_Critical_Data',
  pipelineProspectCompanyFinancialData: 'Pipeline_Prospect_Company_Financial_Data',
  pipelineProspectCompanyStrategicData: 'Pipeline_Prospect_Company_Strategic_Data',
  pipelineProspectCreate: 'Pipeline_Prospect_Create', // Confirm
  pipelineProspectEdit: 'Pipeline_Prospect_Edit', // Confirm
  pipelineProspectAssign: 'Pipeline_Prospect_Assign',
  pipelineProspectChangeAssign: 'Pipeline_Prospect_Change_Assign',
  pipelineProspectResponsiblePerson: 'Pipeline_Prospect_Responsible_Person', // Confirm
  pipelineProspectAttachmentView: 'Pipeline_Prospect_Attachment_View', // Confirm
  pipelineProspectAttachmentDownload: 'Pipeline_Prospect_Attachment_Download', // Confirm
  pipelineProspectAttachmentDelete: 'Pipeline_Prospect_Attachment_Delete', // Confirm
  pipelineProspectAttachmentUpload: 'Pipeline_Prospect_Attachment_Upload', // Confirm
  pipelineProspectTrash: 'Pipeline_Prospect_Trash', // Confirm

  // pipeline · opportunity — what the app called Lead (CRM_Lead_*, the "โอกาสขาย" pages), confirmed by the product team
  pipelineOpportunityCreate: 'Pipeline_Opportunity_Create', // Confirm
  pipelineOpportunityEdit: 'Pipeline_Opportunity_Edit', // Confirm
  pipelineOpportunityContactView: 'Pipeline_Opportunity_Contact_View', // Confirm
  pipelineOpportunityContactActivityCreate: 'Pipeline_Opportunity_Contact_Activity_Create', // Confirm
  pipelineOpportunityAssign: 'Pipeline_Opportunity_Assign',
  pipelineOpportunityChangeAssign: 'Pipeline_Opportunity_Change_Assign', // Confirm
  pipelineOpportunityChangeSalesPerson: 'Pipeline_Opportunity_Change_Sales_Person', // Confirm
  pipelineOpportunityShareSharingEmployee: 'Pipeline_Opportunity_Share_Sharing_Employee', // Confirm
  pipelineOpportunityRevokeSharingEmployee: 'Pipeline_Opportunity_Revoke_Sharing_Employee',
  pipelineOpportunityRevokeOppSharingGroup: 'Pipeline_Opportunity_Revoke_OPP_Sharing_Group',
  pipelineOpportunityRevokeLatestPeering: 'Pipeline_Opportunity_Revoke_Latest_Peering',
  pipelineOpportunityRevokeExResponsiblePerson: 'Pipeline_Opportunity_Revoke_Ex_Responsible_Person',
  pipelineOpportunityCustomerPdpaData: 'Pipeline_Opportunity_Customer_PDPA_Data',
  pipelineOpportunityCustomerCriticalData: 'Pipeline_Opportunity_Customer_Critical_Data',
  pipelineOpportunityCompanyFinancialData: 'Pipeline_Opportunity_Company_Financial_Data',
  pipelineOpportunityCompanyStrategicData: 'Pipeline_Opportunity_Company_Strategic_Data',
  pipelineOpportunityWorkflowStepRework: 'Pipeline_Opportunity_WorkflowStep_Rework', // Confirm
  pipelineOpportunityWorkflowStepClose: 'Pipeline_Opportunity_WorkflowStep_Close', // Confirm
  pipelineOpportunityClose: 'Pipeline_Opportunity_Close', // Confirm
  pipelineOpportunityActivityGroupAdmin: 'Pipeline_Opportunity_Activity_Group_Admin',
  pipelineOpportunityResponsiblePerson: 'Pipeline_Opportunity_Responsible_Person', // Confirm
  pipelineOpportunityAttachmentView: 'Pipeline_Opportunity_Attachment_View', // Confirm
  pipelineOpportunityAttachmentDownload: 'Pipeline_Opportunity_Attachment_Download', // Confirm
  pipelineOpportunityAttachmentDelete: 'Pipeline_Opportunity_Attachment_Delete', // Confirm
  pipelineOpportunityAttachmentUpload: 'Pipeline_Opportunity_Attachment_Upload', // Confirm

  // pipeline · schedule
  pipelineScheduleAppointmentView: 'Pipeline_Schedule_Appointment_View', // Confirm
  pipelineScheduleAppointmentAddEdit: 'Pipeline_Schedule_Appointment_Add_Edit', // Confirm
  pipelineScheduleAppointmentAddEditForOther: 'Pipeline_Schedule_Appointment_Add_Edit_For_Other', // Confirm
  pipelineScheduleTaskView: 'Pipeline_Schedule_Task_View', // Confirm
  pipelineScheduleTaskAddEdit: 'Pipeline_Schedule_Task_Add_Edit', // Confirm
  pipelineScheduleTaskAddEditForOther: 'Pipeline_Schedule_Task_Add_Edit_For_Other', // Confirm

  // pipeline · supporting documents: Pipeline_Document_<Type>_{View|Create|Edit|Block}. The View / Create / Edit ones are also built by pipelineDocRole()
  // below (same strings); _Block is in the backend's list but no button uses it yet. Which page a role opens is set in access-buttons.ts, not by its name
  // LetterofIntent
  pipelineDocumentLetterofIntentView: 'Pipeline_Document_LetterofIntent_View', // Confirm
  pipelineDocumentLetterofIntentCreate: 'Pipeline_Document_LetterofIntent_Create', // Confirm
  pipelineDocumentLetterofIntentEdit: 'Pipeline_Document_LetterofIntent_Edit', // Confirm
  pipelineDocumentLetterofIntentBlock: 'Pipeline_Document_LetterofIntent_Block',
  // LegalCreditServiceRequest
  pipelineDocumentLegalCreditServiceRequestView: 'Pipeline_Document_LegalCreditServiceRequest_View', // Confirm
  pipelineDocumentLegalCreditServiceRequestCreate: 'Pipeline_Document_LegalCreditServiceRequest_Create', // Confirm
  pipelineDocumentLegalCreditServiceRequestEdit: 'Pipeline_Document_LegalCreditServiceRequest_Edit', // Confirm
  pipelineDocumentLegalCreditServiceRequestBlock: 'Pipeline_Document_LegalCreditServiceRequest_Block',
  // Servicecontract
  pipelineDocumentServicecontractView: 'Pipeline_Document_Servicecontract_View', // Confirm
  pipelineDocumentServicecontractCreate: 'Pipeline_Document_Servicecontract_Create', // Confirm
  pipelineDocumentServicecontractEdit: 'Pipeline_Document_Servicecontract_Edit', // Confirm
  pipelineDocumentServicecontractBlock: 'Pipeline_Document_Servicecontract_Block',
  // LoanAgreement
  pipelineDocumentLoanAgreementView: 'Pipeline_Document_LoanAgreement_View', // Confirm
  pipelineDocumentLoanAgreementCreate: 'Pipeline_Document_LoanAgreement_Create', // Confirm
  pipelineDocumentLoanAgreementEdit: 'Pipeline_Document_LoanAgreement_Edit', // Confirm
  pipelineDocumentLoanAgreementBlock: 'Pipeline_Document_LoanAgreement_Block',
  // PreliminaryCreditApproval
  pipelineDocumentPreliminaryCreditApprovalView: 'Pipeline_Document_PreliminaryCreditApproval_View', // Confirm
  pipelineDocumentPreliminaryCreditApprovalCreate: 'Pipeline_Document_PreliminaryCreditApproval_Create', // Confirm
  pipelineDocumentPreliminaryCreditApprovalEdit: 'Pipeline_Document_PreliminaryCreditApproval_Edit', // Confirm
  pipelineDocumentPreliminaryCreditApprovalBlock: 'Pipeline_Document_PreliminaryCreditApproval_Block',
  // PropertyProjectContract
  pipelineDocumentPropertyProjectContractView: 'Pipeline_Document_PropertyProjectContract_View', // Confirm
  pipelineDocumentPropertyProjectContractCreate: 'Pipeline_Document_PropertyProjectContract_Create', // Confirm
  pipelineDocumentPropertyProjectContractEdit: 'Pipeline_Document_PropertyProjectContract_Edit', // Confirm
  pipelineDocumentPropertyProjectContractBlock: 'Pipeline_Document_PropertyProjectContract_Block',
  // CreditApplication
  pipelineDocumentCreditApplicationView: 'Pipeline_Document_CreditApplication_View', // Confirm
  pipelineDocumentCreditApplicationCreate: 'Pipeline_Document_CreditApplication_Create', // Confirm
  pipelineDocumentCreditApplicationEdit: 'Pipeline_Document_CreditApplication_Edit', // Confirm
  pipelineDocumentCreditApplicationBlock: 'Pipeline_Document_CreditApplication_Block',

  // pipeline · the top tabs of the CRM module (nav.config.ts). The dashboard tab has the name the backend gave; Opportunity,
  // Contact_Activity and Supporting_Document are names the team chose, not in the backend's list yet; the other tabs use the backend's
  // own Pipeline_Prospect_View and Pipeline_Schedule_{Appointment,Task}_View above
  pipelineDashboardAccess: 'Pipeline_Dashboard_Access', // Confirm
  pipelineOpportunityView: 'Pipeline_Opportunity_View', // Confirm
  pipelineContactActivityView: 'Pipeline_Contact_Activity_View',
  pipelineSupportingDocumentView: 'Pipeline_Supporting_Document_View',

  // pipeline · other
  pipelineWaitListAccess: 'Pipeline_Wait_list_Access',
  // lead · delete one's own contact-log entry (permission-visibility-design.md §4)
  pipelineLeadContactActivityDelete: 'Pipeline_Lead_Contact_Activity_Delete',
  // company-wide (ENTITY) permissions (permission-visibility-design.md §4, §8): Entity Viewer = VIEW_ALL, Entity Admin = all three edit/view ones
  viewAll: 'VIEW_ALL',
  masterEditAll: 'MASTER_EDIT_ALL',
  transactionEditAll: 'TRANSACTION_EDIT_ALL',
  configAll: 'CONFIG_ALL',
  // (renamed by the backend: was Pipeline_Customer_Support_Lead_All_View_Only — Lead became Opportunity)
  pipelineCustomerSupportOpportunityAllViewOnly:
    'Pipeline_Customer_Support_Opportunity_All_View_Only',

  // chat / crm names that are new in the list
  chatView: 'Chat_View',
  chatViewAssigned: 'Chat_View_Assigned',
  chatReplyAssigned: 'Chat_Reply_Assigned',
  chatSupView: 'Chat_Sup_View',
  leadSocialAdmin: 'CRM_Lead_Social_Admin_View',
  // in the backend's list of 2026-10-29 (Chat_Assigner is the new one; the old Chat_Assigner_View is `chatAssignerView` below)
  chatAssigner: 'Chat_Assigner',
  chatChangeAssigned: 'Chat_Change_Assigned',
  chatRevokeAssigned: 'Chat_Revoke_Assigned',
  // in the backend's list of 2026-11-05 (the Chat_AI_* names above are the older spelling of the two Chat_Open_AI_* ones)
  chatViewUnassigned: 'Chat_View_Unassigned',
  chatReplyUnassigned: 'Chat_Reply_Unassigned',
  chatNewAssigner: 'Chat_New_Assigner',
  chatOpenAiChatBot: 'Chat_Open_AI_Chat_Bot',
  chatOpenAiAnalyticsAi: 'Chat_Open_AI_Analytics_AI',

  // chat
  chatReply: 'Chat_Reply',
  chatProspectCreate: 'Chat_Prospect_Create',
  chatAiChatBot: 'Chat_AI_Chat_Bot',
  chatSocialAdmin: 'Chat_Social_Admin_View',
  chatAssignerView: 'Chat_Assigner_View',
  chatAnalytics: 'Chat_AI_Analytics_AI',

  // AI HUB (Permission Dic.xlsx): AI_ACCESS_USE · one AI_*_USE per tool · AI_*_MANAGE · AI_ADMIN_* — see ai-hub-roles.ts
  ...AI_HUB_ROLE,
} as const;

export type RoleKey = (typeof ROLE)[keyof typeof ROLE];

/**
 * A role that stands in for others: whoever holds the key passes every check of the roles listed (a button or a feature that hangs under
 * `Pipeline_Schedule_Appointment_View` is also open to `…_Add_Edit_For_Other`). Only the pairs below, on purpose; `PermissionService.has` reads it.
 */
export const ROLE_BYPASSED_BY: Readonly<Record<string, readonly string[]>> = bypassTable([
  // …_For_Other of the Schedule: its own pair only (Appointment with Appointment, Task with Task)
  [ROLE.pipelineScheduleAppointmentAddEditForOther, [ROLE.pipelineScheduleAppointmentView, ROLE.pipelineScheduleAppointmentAddEdit]],
  [ROLE.pipelineScheduleTaskAddEditForOther, [ROLE.pipelineScheduleTaskView, ROLE.pipelineScheduleTaskAddEdit]],
  // the pages that still ask for the old CRM keys (page-registry.json: FEATURE_CRM_*) are opened by the new Pipeline_* permission of the same thing:
  // the Permission Dictionary (Seed Workbook) has only the new names, so without this its users see a menu tab but are refused the page
  [ROLE.pipelineProspectView, [ROLE.featureProspect, ROLE.prospectView]],
  [ROLE.pipelineOpportunityView, [ROLE.featureLead, ROLE.leadView]],
  [ROLE.pipelineOpportunityContactView, [ROLE.featureContactActivity]],
  [ROLE.pipelineScheduleAppointmentView, [ROLE.featureCalendar]],
  [ROLE.pipelineScheduleTaskView, [ROLE.featureCalendar]],
  [ROLE.pipelineDashboardAccess, [ROLE.featureDashboard, ROLE.dashboardView]],
  [ROLE.modulePipeline, [ROLE.moduleCrm]],
  // the responsible person of a prospect: sees, edits, sees the attachments of it, and views / replies to the chats assigned to them
  [
    ROLE.pipelineProspectResponsiblePerson,
    [ROLE.pipelineProspectView, ROLE.pipelineProspectEdit, ROLE.pipelineProspectAttachmentView, ROLE.chatViewAssigned, ROLE.chatReplyAssigned],
  ],
  // the responsible person of an opportunity: the opportunity (view, edit, contacts, contact activity, attachments, close a workflow step), its schedule and the assigned chats
  [
    ROLE.pipelineOpportunityResponsiblePerson,
    [
      ROLE.pipelineOpportunityView,
      ROLE.pipelineOpportunityEdit,
      ROLE.pipelineOpportunityContactView,
      ROLE.pipelineOpportunityContactActivityCreate,
      ROLE.pipelineOpportunityAttachmentView,
      ROLE.pipelineOpportunityWorkflowStepClose,
      ROLE.pipelineScheduleAppointmentView,
      ROLE.pipelineScheduleAppointmentAddEdit,
      ROLE.pipelineScheduleTaskView,
      ROLE.pipelineScheduleTaskAddEdit,
      ROLE.chatViewAssigned,
      ROLE.chatReplyAssigned,
    ],
  ],
]);

/** `[holder, [the roles it stands in for]]` → `{ role: [holders…] }` (a role may be stood in for by several holders) */
function bypassTable(pairs: ReadonlyArray<readonly [string, readonly string[]]>): Record<string, string[]> {
  const out: Record<string, string[]> = {};
  for (const [holder, roles] of pairs) for (const r of roles) (out[r] ??= []).push(holder);
  return out;
}

/** Supporting documents have their own View/Create/Edit triplets. */
export const SUPPORTING_DOC_ROLE_PREFIX = {
  'letter-of-intent': 'CRM_Document_LetterofIntent',
  'legal-credit-request': 'CRM_Document_LegalCreditServiceRequest',
  'service-contract': 'CRM_Document_Servicecontract',
  'loan-agreement': 'CRM_Document_LoanAgreement',
  'preliminary-credit-approval': 'CRM_Document_PreliminaryCreditApproval',
  'property-project-contract': 'CRM_Document_PropertyProjectContract',
  'credit-application': 'CRM_Document_CreditApplication',
} as const;

export type SupportingDocAction = 'View' | 'Create' | 'Edit';
export type SupportingDocRoleKey =
  `${(typeof SUPPORTING_DOC_ROLE_PREFIX)[keyof typeof SUPPORTING_DOC_ROLE_PREFIX]}_${SupportingDocAction}`;

/** The role of one action on one supporting document: `supportingDocRole('loan-agreement', 'Edit')` = `CRM_Document_LoanAgreement_Edit`. */
export const supportingDocRole = (
  doc: keyof typeof SUPPORTING_DOC_ROLE_PREFIX,
  action: SupportingDocAction,
): SupportingDocRoleKey => `${SUPPORTING_DOC_ROLE_PREFIX[doc]}_${action}` as SupportingDocRoleKey;

/**
 * The new names of the same roles: the backend renamed `CRM_Document_<Type>_{View|Create|Edit}` to
 * `Pipeline_Document_<Type>_{View|Create|Edit}` (same seven document types, same three actions).
 */
type DocTypeName<P> = P extends `CRM_Document_${infer N}` ? N : never;
export type PipelineDocRoleKey =
  `Pipeline_Document_${DocTypeName<(typeof SUPPORTING_DOC_ROLE_PREFIX)[keyof typeof SUPPORTING_DOC_ROLE_PREFIX]>}_${SupportingDocAction}`;

/** `pipelineDocRole('loan-agreement', 'Edit')` = `Pipeline_Document_LoanAgreement_Edit` */
export const pipelineDocRole = (
  doc: keyof typeof SUPPORTING_DOC_ROLE_PREFIX,
  action: SupportingDocAction,
): PipelineDocRoleKey =>
  `Pipeline_Document_${SUPPORTING_DOC_ROLE_PREFIX[doc].slice('CRM_Document_'.length)}_${action}` as PipelineDocRoleKey;

/** all 21 of them (7 document types × View / Create / Edit) */
export const PIPELINE_DOC_ROLES: readonly PipelineDocRoleKey[] = (
  Object.keys(SUPPORTING_DOC_ROLE_PREFIX) as (keyof typeof SUPPORTING_DOC_ROLE_PREFIX)[]
).flatMap((doc) =>
  (['View', 'Create', 'Edit'] as const).map((action) => pipelineDocRole(doc, action)),
);

/** Every role key the app names: an entry of `ROLE`, or one of the supporting-document View / Create / Edit roles (old or new name). */
export type AnyRoleKey = RoleKey | SupportingDocRoleKey | PipelineDocRoleKey;

/** Case-insensitive aliases that pass every check (SessionRoles.java). */
export const SUPER_ADMIN_ALIASES: ReadonlySet<string> = new Set([
  'super_admin',
  'superadmin',
  'super admin',
  'role_super_admin',
  'super_super_crm',
]);

/** Feature flags that can hide a menu / route independent of roles. */
export type FeatureFlag = 'aiHubEnabled';
