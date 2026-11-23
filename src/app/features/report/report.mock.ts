/**
 * Deterministic fake backend of the Report page (dev / `mock: true`, tests and the Java-vs-Angular comparison).
 *
 * It answers the requests of the page script in the shapes the Java servlets answered: the page's own data file (the report list +
 * filter definitions), the master data of the filters (`ChatMasterDataServlet` wraps the answer of the API in
 * `{ status, message, result }`, `EmployeesServlet` returns a bare array) and the report PDF (`ReportPdfServlet`).
 *
 * Framework-free on purpose (no Angular imports): the comparison harness loads this file in Node.
 */
import { reference } from '@core/mock/reference';
import { SEED_EMPLOYEES, SEED_SOURCES, seedProspect } from '@core/mock/crm-seed';
import { REPORT_CODES, reportRole } from '@core/permissions/report-roles';
import type { ReportBackend, ReportInitial } from './report-backend';
import { REPORT_DATA } from './report.data.generated';

const COMMUNICATION_TYPES = reference('report.communicationTypes', [
  { code: 'PHONE', name: 'โทรศัพท์' },
  { code: 'LINE', name: 'LINE' },
  { code: 'EMAIL', name: 'อีเมล' },
  { code: 'VISIT', name: 'เข้าพบ' },
  { code: 'CHAT', name: 'แชท' },
]);

/** `/board/chat-master-data?type=<type>`: the lists the report filters use */
function masterData(type: string): { code: string; name: string }[] | null {
  switch (type) {
    case 'sale-persons':
      return SEED_EMPLOYEES.map((e, i) => ({ code: `SA-${String(i + 1).padStart(3, '0')}`, name: e.name }));
    case 'communication-types':
      return COMMUNICATION_TYPES;
    case 'prospects':
      return Array.from({ length: 12 }, (_, i) => ({ code: `P26-${String(i + 101).padStart(5, '0')}`, name: seedProspect(i + 1).fullName }));
    case 'marketing-channels':
      return SEED_SOURCES.map((name, i) => ({ code: `MC${i + 1}`, name }));
    default:
      return null;
  }
}

const json = (body: unknown, status = 200): Response =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json;charset=UTF-8' } });

/** a one-page PDF with the lines as text (Helvetica: ASCII only) — enough for a new tab to show something real */
export function tinyPdf(lines: string[]): Uint8Array {
  const esc = (s: string) => s.replace(/[^\x20-\x7e]/g, '?').replace(/([\\()])/g, '\\$1');
  const text = lines.map((l, i) => `BT /F1 12 Tf 50 ${780 - i * 18} Td (${esc(l)}) Tj ET`).join('\n');
  const objs = [
    '<< /Type /Catalog /Pages 2 0 R >>',
    '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
    '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Contents 4 0 R /Resources << /Font << /F1 5 0 R >> >> >>',
    `<< /Length ${text.length} >>\nstream\n${text}\nendstream`,
    '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>',
  ];
  let pdf = '%PDF-1.4\n';
  const offsets: number[] = [];
  objs.forEach((o, i) => {
    offsets.push(pdf.length);
    pdf += `${i + 1} 0 obj\n${o}\nendobj\n`;
  });
  const xref = pdf.length;
  pdf += `xref\n0 ${objs.length + 1}\n0000000000 65535 f \n${offsets.map((o) => `${String(o).padStart(10, '0')} 00000 n \n`).join('')}`;
  pdf += `trailer\n<< /Size ${objs.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF`;
  return new TextEncoder().encode(pdf);
}

export interface MockReportOptions {
  /** simulated network latency, ms */
  delayMs?: number;
}

export function createMockReport(opts: MockReportOptions = {}): ReportBackend {
  const delayMs = opts.delayMs ?? 0;
  const later = async <T>(v: T): Promise<T> => {
    if (delayMs) await new Promise((r) => setTimeout(r, delayMs));
    return v;
  };

  const pdfLines = (url: URL): string[] => ['Triple Sale - report (mock)', ...[...url.searchParams].map(([k, v]) => `${k} = ${v}`)];

  return {
    reportUrl(input) {
      // a local PDF: there is no report engine behind the mock (the lines say which report and which filters were asked for)
      return URL.createObjectURL(new Blob([tinyPdf(pdfLines(new URL(input, 'http://mock.local'))) as BlobPart], { type: 'application/pdf' }));
    },

    initial(who): ReportInitial {
      return { reportPermJson: Object.fromEntries(REPORT_CODES.map((code) => [code, who.hasRole(reportRole(code))])) };
    },

    async fetch(input) {
      const url = new URL(input, 'http://mock.local');
      const path = url.pathname;
      if (path.endsWith('/resources/mock/report_mock.json')) return later(json(REPORT_DATA));
      if (path.endsWith('/board/chat-master-data')) {
        const list = masterData(url.searchParams.get('type') ?? '');
        return later(list ? json({ status: 200, message: 'success', result: list }) : json({ status: 400, message: 'unknown type' }, 400));
      }
      if (path.endsWith('/board/employees')) return later(json(SEED_EMPLOYEES.map((e) => ({ code: e.code, name: e.name, team: e.team }))));
      if (path.endsWith('/report-pdf')) {
        return later(new Response(tinyPdf(pdfLines(url)) as BlobPart, { status: 200, headers: { 'content-type': 'application/pdf' } }));
      }
      return later(json({ status: 404, message: `no mock for ${path}` }, 404));
    },
  };
}
