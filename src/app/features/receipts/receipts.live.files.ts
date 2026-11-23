/**
 * `file(url)` of the LIVE receipt backend: what opens in the new tab for `/rvreport?txno=[&format=png]` and `/rvreceipt?id=`.
 *
 * Java: `RvJasperReportServlet` asked the JasperReports server (`triplesale.report.base`, no token) for the ERP form RV-01 and streamed the
 * PDF (or its first page as a PNG, rasterised with PDFBox); `RvReceiptPdfServlet` drew a PDF with OpenPDF + THSarabunNew from
 * `RvApiService.detailJson`. There is no servlet any more and NO REST endpoint replaces them (nothing to call with the Bearer token), so
 * nothing is invented here: the new tab shows a plain text that says why — in the words of the servlet's own error answers ("เชื่อมต่อ
 * ระบบรายงานไม่ได้: …" with status 502) — and what the page asked for. What can still be decided without a service is decided as the
 * servlet did: the `txno` pattern and its 400, the missing `id` and its 400. The questions to the backend owners (which endpoint, how
 * the PDF is fetched with a Bearer token, who rasterises) are in INTEGRATION.md.
 *
 * Pure (no Angular, no I/O): the comparison harness loads it in Node, so only erasable TypeScript syntax and `import type` here.
 */
import type { ReceiptFile } from './receipts-backend';

/** `RvJasperReportServlet.TXNO_PATTERN` — what a document number may contain (keeps odd characters out of the report's SQL where) */
const TXNO_PATTERN = /^[A-Za-z0-9:-]+$/;

const TEXT = 'text/plain; charset=UTF-8';
const text = (status: number, body: string): ReceiptFile => ({ status, type: TEXT, body: new TextEncoder().encode(body) });

/** the Java servlet's own `String.trim()` of a request parameter */
const trimmed = (v: string | null): string => (v ?? '').replace(/^[\u0000- ]+|[\u0000- ]+$/g, '');

/**
 * @param url   the address the page opens: `/rvreport?txno=RV:M13-2610-00031[&format=png]` or `/rvreceipt?id=905` (the context path of the
 *              Java app, `/triplesale`, may precede it)
 * @param lang  the language of the page (the text of the 400 is the servlet's Thai one in any language)
 */
export function liveReceiptFile(url: string, lang: 'th' | 'en'): ReceiptFile {
  const u = new URL(url, 'http://page.local');
  const path = u.pathname.replace(/^.*\/(rvreport|rvreceipt)$/, '/$1');
  const en = lang === 'en';
  if (path === '/rvreport') {
    const txno = trimmed(u.searchParams.get('txno'));
    if (!txno || !TXNO_PATTERN.test(txno)) return text(400, 'ต้องระบุ txno (เลขที่เอกสาร RV) ให้ถูกต้อง');
    return text(
      502,
      en
        ? `Cannot connect to the report system: the report service (JasperReports) is not connected to this app yet — waiting for the backend owners to confirm how to call it. (RV-01 of ${txno})`
        : `เชื่อมต่อระบบรายงานไม่ได้: ยังไม่ได้เชื่อมระบบรายงาน (JasperReports) เข้ากับหน้านี้ — รอเจ้าของระบบยืนยันช่องทางเรียกใช้ (ฟอร์ม RV-01 ของ ${txno})`,
    );
  }
  if (path === '/rvreceipt') {
    const id = trimmed(u.searchParams.get('id'));
    if (!id) return text(400, 'missing id');
    return text(
      502,
      en
        ? `Cannot make the PDF of the receipt: there is no service that makes it for this app yet — waiting for the backend owners to confirm how to get it. (receipt id ${id})`
        : `สร้างไฟล์ PDF ของใบรับเงินไม่ได้: ยังไม่มีบริการสร้างไฟล์ที่ต่อกับหน้านี้ — รอเจ้าของระบบยืนยันช่องทาง (ใบรับเงิน id ${id})`,
    );
  }
  return text(404, 'not found ' + url);
}
