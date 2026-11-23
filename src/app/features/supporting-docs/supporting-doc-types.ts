/**
 * What the screens of the supporting documents ("ข้อมูลประกอบ": list `crm/supporting-docs/:type`, form `crm/supporting-docs/:type/:id`)
 * agree on: the seven document families and what tells them apart.
 *
 * Java kept seven copies of one page (`sales_document.xhtml`, `sales_document_2` … `_7`, and the forms `sales_document_sub_1` … `_7`) that
 * `Sales_DocumentView` served by looking at the view id (`currentFormType()` / `currentDetailFormType()` / `currentListPageForSave()`). Here
 * the family is the route parameter `:type` and everything the copies differed in is one row of `SUPPORTING_DOC_TYPES`.
 *
 * Framework-free (the comparison harness loads it into Node): no Angular, no `enum`, no parameter properties.
 */
import { SUPPORTING_DOC_ROLE_PREFIX } from '@core/permissions/roles';

export const SUPPORTING_DOC_SLUGS = [
  'letter-of-intent',
  'legal-credit-request',
  'service-contract',
  'loan-agreement',
  'preliminary-credit-approval',
  'property-project-contract',
  'credit-application',
] as const;
export type SupportingDocSlug = (typeof SUPPORTING_DOC_SLUGS)[number];

/** the family in the code of a button of the registry (core/permissions/access-buttons.ts): `PL-IT-LS-01` is the first button of the list of the letter of intent */
const BUTTON_CODE: Record<SupportingDocSlug, string> = {
  'letter-of-intent': 'IT',
  'legal-credit-request': 'LR',
  'service-contract': 'SV',
  'loan-agreement': 'LA',
  'preliminary-credit-approval': 'PA',
  'property-project-contract': 'PP',
  'credit-application': 'CP',
};

/** the value the code uses inside (`Sales_DocumentView.currentFormType()`); the backend may want another spelling (`apiFormType`) */
export type SupportingFormType = 'formintent' | 'formloan' | 'servicecontract' | 'loanagreement' | 'preloanapprove' | 'propertycontract' | 'formsun';

export interface SupportingDocType {
  slug: SupportingDocSlug;
  /** 1 … 7: the `N` of `sales_document_sub_N` (the list is `sales_document` for 1 and `sales_document_N` for the others) */
  n: number;
  /** `sales_document` · `sales_document_2` … : the Java view id of the list (the `?action_type=list` page) */
  listPage: string;
  /** `sales_document_sub_N` */
  subPage: string;
  /** `acts` / `sub_id` of the Java menu parameters (acts = 70 + n) */
  acts: number;
  subId: number;
  formType: SupportingFormType;
  /** the spelling of `formType` when `triplesale.api.documents.formtype.style=new` (`Sales_DocumentView.FORM_TYPE_API_NEW`) */
  apiFormTypeNew: string;
  /** `CRM_Document_<Family>` — the role is `<prefix>_View` / `_Create` / `_Edit` */
  rolePrefix: string;
  /** the two letters of the family in the button registry (`PL-<code>-LS-01`, `PL-<code>-DT-01`): IT · LR · SV · LA · PA · PP · CP */
  buttonCode: string;
  /** the title of the page (`label.topbar.support_doc.*`) */
  titleKey: string;
  /** the "ประเภทเอกสาร" the form shows (`sd_field_ro` `val`) */
  docCode: string;
  /** the prefix of the section ids of the form (`sd-panel-1` for the first, `sd2-panel-1` …) */
  panel: string;
  /** the prefix of the ids of the receive-date / receiver controls (`sd1RcvDate`, `sd2RcvBy` …) */
  rcv: string;
  /**
   * the rows the page itself draws (the first page) take their badge from an older rule on the credit-application list
   * (`status == 'ACTIVE' ? success : (status == 'WAIT_APPROVE' ? pending : rejected)`), the other six lists from `Sales_DocumentBean.getStatusClass()`;
   * the rows the script adds always use the second — Java is inconsistent here and so is the port
   */
  legacyStatusBadge: boolean;
}

const T = (
  n: number,
  slug: SupportingDocSlug,
  formType: SupportingFormType,
  apiFormTypeNew: string,
  titleKey: string,
  docCode: string,
): SupportingDocType => ({
  slug,
  n,
  listPage: n === 1 ? 'sales_document' : `sales_document_${n}`,
  subPage: `sales_document_sub_${n}`,
  acts: 70 + n,
  subId: n,
  formType,
  apiFormTypeNew,
  rolePrefix: SUPPORTING_DOC_ROLE_PREFIX[slug],
  buttonCode: BUTTON_CODE[slug],
  titleKey,
  docCode,
  panel: n === 1 ? 'sd' : `sd${n}`,
  rcv: `sd${n}`,
  legacyStatusBadge: n === 7,
});

/** in the order of the menu (topbar.xhtml) */
export const SUPPORTING_DOC_TYPES: readonly SupportingDocType[] = [
  T(1, 'letter-of-intent', 'formintent', 'LetterofIntent', 'label.topbar.support_doc.intent', 'CA'),
  T(2, 'legal-credit-request', 'formloan', 'LegalCreditServiceRequest', 'label.topbar.support_doc.legal_credit', 'CA'),
  T(3, 'service-contract', 'servicecontract', 'Servicecontract', 'label.topbar.support_doc.service_contract', 'CS'),
  T(4, 'loan-agreement', 'loanagreement', 'LoanAgreement', 'label.topbar.support_doc.loan_contract', 'LA'),
  T(5, 'preliminary-credit-approval', 'preloanapprove', 'PreliminaryCreditApproval', 'label.topbar.support_doc.credit_approval', 'CP'),
  T(6, 'property-project-contract', 'propertycontract', 'PropertyProjectContract', 'label.topbar.support_doc.property_contract', 'PC'),
  T(7, 'credit-application', 'formsun', 'CreditApplication', 'label.topbar.support_doc.credit_request', 'LAF'),
];

/** the family of a route segment, or undefined for anything else (the route then shows "not found") */
export function supportingDocType(segment: string | null | undefined): SupportingDocType | undefined {
  return SUPPORTING_DOC_TYPES.find((t) => t.slug === segment);
}

/** what the form is for: `add` (new), `edit`, `detail` (read only) — Java `action_type` */
export type SupportingActionType = 'add' | 'edit' | 'detail';

/**
 * The mode of the form from its address. Java: `?action_type=add|edit|detail&quotation_id=N`. Here `:id` is `new` or the document id and
 * `?action_type=` says edit / detail; anything else with an id is `detail` (the row's default action is "view") and `new` is always `add`.
 */
export function supportingActionType(id: string | null | undefined, actionType: string | null | undefined): SupportingActionType {
  if (!id || id === 'new') return 'add';
  return actionType === 'edit' ? 'edit' : 'detail';
}

/** `CRM_Document_<Family>_View` / `_Create` / `_Edit` */
export const supportingRole = (t: SupportingDocType, kind: 'View' | 'Create' | 'Edit'): string => `${t.rolePrefix}_${kind}`;

/** `PL-<family>-LS-0n` (the list) / `PL-<family>-DT-0n` (the details): the button of the registry, e.g. `supportingButton(t, 'LS', 2)` = `PL-IT-LS-02` for the letter of intent */
export const supportingButton = (t: SupportingDocType, area: 'LS' | 'DT', n: number): string => `PL-${t.buttonCode}-${area}-${String(n).padStart(2, '0')}`;
