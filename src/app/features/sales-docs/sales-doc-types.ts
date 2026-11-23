/**
 * What the two screens of the sales documents (the list `sales/docs/:type` and the form `sales/docs/:type/:id`) agree on:
 * the five document types of the menu group "งานขาย" and the contract with the backend.
 */

/** `?doc=` of sales_doc_type_list.xhtml and the `X` of `sales_doc_X_form.xhtml`: quotation · booking · delivery note · auto-dealer quotation · auto-dealer booking */
export const SALES_DOC_TYPES = ['qt', 'bk', 'ob', 'aq', 'ad'] as const;
export type SalesDocType = (typeof SALES_DOC_TYPES)[number];

/** the type of an address segment, or '' for anything else (the Java page: `param.doc eq 'qt' or … ? param.doc : ''`) */
export function salesDocType(segment: string | null | undefined): SalesDocType | '' {
  return (SALES_DOC_TYPES as readonly string[]).includes(segment ?? '') ? (segment as SalesDocType) : '';
}

/** one row of the list table (resources/support/sales_doc_list_mockup.js: `list.render(rows)`) */
export interface SalesDocRow {
  /** document number */
  no: string;
  /** yyyy-MM-dd */
  date: string;
  customer: string;
  /** the quotation a booking refers to (bookings only) */
  ref?: string;
  employee: string;
  total: number | string;
  /** the text of the status column */
  status: string;
  /** the document that was just saved (light green row) */
  isNew?: boolean;
}
