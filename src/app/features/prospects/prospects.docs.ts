/**
 * The document tab's server side: what `ContractView` did for the two p:remoteCommand of contracts.xhtml.
 *
 *   rc_ctLoadDocs   panelLoadProspectDocs()    → loadProspectDocs(): GET /prospects/{id}/attachments, the profile picture left out, the rows
 *                                                of `toDocRow` (no, attachfile, description, typecode, kind, filename), newest first
 *   rc_ctDeleteDoc  panelDeleteProspectDocument() → deleteProspectDocument(): DELETE …/attachments/{docNo}, then the list again
 *
 * Here the same two operations go through the attachments servlet (`/board/prospect/attachments`), which is what the page uses for the upload
 * and what the REST service sits behind. Framework-free: the host, the mock tests and the comparison harness (it renders the list the way JSF
 * did) load this file.
 */
/** one row of the document list, as ContractView.toDocRow gives it (no, attachfile, description, typecode, kind, filename) */
export interface ProspectDoc {
  no: string;
  attachfile: string;
  description: string;
  typecode: string;
  kind: string;
  filename: string;
}

type Fetch = (input: string, init?: RequestInit) => Promise<Response>;

/** attachFileTypeCode of the profile picture (stored in the same table, not a document) */
export const ATTACH_TYPE_PROFILE = 'PROFILE';

/** ContractView.docKind: the kind of file from its extension (which icon / which preview) */
export function docKind(fileName: string | null | undefined): string {
  const low = (fileName ?? '').toLowerCase();
  if (/.*\.(jpg|jpeg|png|gif|bmp|webp)$/.test(low)) return 'image';
  if (low.endsWith('.pdf')) return 'pdf';
  if (/.*\.(doc|docx)$/.test(low)) return 'word';
  if (/.*\.(xls|xlsx|csv)$/.test(low)) return 'excel';
  return 'file';
}

/** ContractView.toDocRow: one ProspectAttachmentResDTO → the map the page binds to */
export function toDocRow(a: { detailOrderNo?: number; docNo?: string; attachFile?: string; description?: string; attachFileTypeCode?: string; fileName?: string }): ProspectDoc {
  const file = collapseHost(a.attachFile ?? '');
  const slash = file.lastIndexOf('/');
  return {
    // `docNo` = the uuid of an attachment of `GET /api/v1/prospects/{id}?sections=ATTACHMENTS`; `detailOrderNo` = the number of the old service
    no: a.docNo ? a.docNo : String(a.detailOrderNo ?? 0),
    attachfile: file,
    description: a.description ?? '',
    typecode: a.attachFileTypeCode ?? '',
    kind: docKind(a.fileName || file),
    // the new service keeps no file name: the page shows the description (or the type) instead of the last part of the address
    filename: a.fileName ? a.fileName : slash >= 0 ? file.slice(slash + 1) : file,
  };
}

/** AttachUrl.collapse: "http://h/http://h/a.jpg" → "http://h/a.jpg" */
export function collapseHost(raw: string): string {
  let url = (raw ?? '').trim();
  while (url) {
    const rest = url.replace(/^https?:\/\/[^/]+\//, '');
    if (rest === url || !/^https?:\/\//i.test(rest)) break;
    url = rest;
  }
  return url;
}

/** ContractView.loadProspectDocs: the documents of one prospect, newest first (the API lists them oldest first) */
export async function loadProspectDocs(fetchFn: Fetch, pid: unknown): Promise<ProspectDoc[]> {
  // a number (the old service) or a uuid (the new one)
  const id = String(pid ?? '').trim();
  if (id === '' || id === '0' || id === 'undefined' || id === 'null' || id === 'NaN') return [];
  try {
    const res = await fetchFn(`/board/prospect/attachments?prospectId=${encodeURIComponent(id)}`, { credentials: 'same-origin' });
    const body = (await res.json()) as { result?: Array<Record<string, unknown>> };
    const items = Array.isArray(body?.result) ? body.result : [];
    return items
      .filter((a) => String(a?.['attachFileTypeCode'] ?? '').toUpperCase() !== ATTACH_TYPE_PROFILE)
      .map((a) => toDocRow(a))
      .reverse();
  } catch {
    return [];
  }
}

/** ContractView.deleteProspectDocument: delete one, then list what is left (a failed delete shows the real list again) */
export async function deleteProspectDoc(fetchFn: Fetch, pid: unknown, docNo: unknown): Promise<ProspectDoc[]> {
  const id = Number(pid);
  const no = String(docNo ?? '').trim();
  if (!(id > 0) || !no) return [];
  try {
    await fetchFn(`/board/prospect/attachments?prospectId=${id}&docNo=${encodeURIComponent(no)}`, { method: 'DELETE', credentials: 'same-origin' });
  } catch {
    /* the bean logs the failure and shows the list it gets */
  }
  return loadProspectDocs(fetchFn, id);
}
