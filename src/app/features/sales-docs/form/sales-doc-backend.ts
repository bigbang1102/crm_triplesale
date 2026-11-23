/**
 * What the five sales-document forms (route `sales/docs/:type/:id` — quotation qt · booking bk · delivery note ob · auto-dealer quotation aq ·
 * auto-dealer booking ad) need from their backend — the contract the Java pages had with the BFF servlets of the war, in exactly the
 * shapes those servlets answered. There is NO save API yet: the Java forms validate, build the document payload (`SalesDocPayload`,
 * `console.debug`) and open the "saved" pop-up with a provisional document number and the notice "not saved into the system"; so does the port.
 *
 *   /board/prospect-list?page&perPage&enrich=1&searchText   ProspectListServlet → ProspectListService   the customer pick (10 rows a page, infinite scroll)
 *   /rvapi?action=materials                                 RvApiServlet → RvApiService.materialsJson    the products of the item rows → { result: [{ code, name, salePrice }] }
 *   /board/prospect/attachments                             ProspectAttachmentsServlet                   GET ?prospectId · POST { prospectId, fileContentBase64, fileName, description } · DELETE ?prospectId&docNo
 *   /board/chat-master-data?type=occupations                ChatMasterDataServlet                        the "occupation" list of the customer pop-up of the auto-dealer forms
 *   /resources/mock/auto_dealer_master.json                 a static file of the war                     the sample master data of aq / ad (vehicles, accessories, finance, insurance …)
 *
 * Two implementations are possible behind it: `sales-doc.mock.ts` (phase A, dev: deterministic fake data in exactly these shapes) and, in the
 * phase that follows, a live adapter that moves the logic of the servlets above into TypeScript and calls the REST services directly
 * (INTEGRATION.md lists what each of them does). The generated engines (`sales-doc-<type>.engine.ts`, `sales-doc-libs.engine.ts`) never
 * know which one they talk to.
 */
// FAST-DEBT(API): ยังไม่มี API บันทึกเอกสารงานขาย (QT/BK/OB/AQ/AD) · กดบันทึกแล้วแสดงเลขที่ชั่วคราวพร้อมข้อความ "ไม่ได้บันทึกเข้าระบบ" เหมือนหน้า Java · เมื่อมี REST ให้ทำ live adapter แทน sales-doc.mock.ts · somyot · 2026-11-19

export interface SalesDocBackend {
  /**
   * The requests of the page scripts. `input` is what the Java page passed to `fetch`, below the context path (`/board/prospect-list?page=1&…`,
   * `/rvapi?action=materials`, `/board/prospect/attachments` with POST / DELETE). Resolves with the answer of the servlet (status + JSON text);
   * rejects only when there was no answer (a network error).
   */
  fetch(input: string, init?: RequestInit): Promise<Response>;
}

/**
 * `commonBean.uploadAcceptExt` = `FileServerAccess.uploadAcceptAttr()` (ALLOWED_EXT sorted, joined with ", "): the `accept` the server writes into the file
 * input of the attachments table. The forms replace it at start-up (strict mode: pdf jpg jpeg png doc docx xls xlsx), it is what the markup carries.
 */
export const UPLOAD_ACCEPT_EXT = '.7z, .csv, .doc, .docx, .gif, .jpeg, .jpg, .pdf, .png, .ppt, .pptx, .rar, .txt, .webp, .xls, .xlsx, .zip';

/** `commonBean` / `sessionScope` values the Facelets markup prints (`#{commonBean.activeBranchName}` …) — the host fills them from the session */
export interface SalesDocIni {
  branchName: string;
  branchId: string;
  branchCode: string;
  username: string;
  /** the language of the session ('th' | 'en'): the company block of the header shows one language */
  lang: string;
  uploadAcceptExt: string;
  profileName: string;
  employeeId: string;
  /** `Set.toString()` of the roles: "[A, B]" */
  roles: string;
}
