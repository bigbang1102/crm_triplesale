/**
 * What the list of the sales documents (`pages/sales_doc_type_list.xhtml`, route `sales/docs/:type`) needs from its backend.
 *
 * The Java page has NO list API yet: its script ends with `list.render([])` ("ยังไม่มี API รายการเอกสาร → ตารางว่าง") — so the contract is
 * one call that gives the rows of a type, and the mock answers an empty list exactly like the Java page shows. The day the REST API
 * of the documents exists, a live adapter answers with the rows (`SalesDocRow`: `{ no, date, customer, ref, employee, total, status, isNew }`,
 * the shape `SalesDocListMockup.render` documents) and the generated engine needs no change (`list.render(env.rows)`).
 *
 * Live phase: nothing of the Java side to port — `sales_doc_type_list.xhtml` calls no servlet.
 */
// FAST-DEBT(API): ยังไม่มี API รายการเอกสารงานขาย · รายการว่างเสมอเหมือนหน้า Java (`list.render([])`) · เมื่อมี REST ให้ทำ live adapter ส่งแถวตาม SalesDocRow · somyot · 2026-11-19
import type { SalesDocRow, SalesDocType } from '../sales-doc-types';

export interface SalesDocListBackend {
  /** the rows of the table of a document type */
  list(type: SalesDocType): Promise<SalesDocRow[]>;
}
