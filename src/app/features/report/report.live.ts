/**
 * The LIVE backend of the Report page: what the Java web app answered with `ReportPdfServlet`, `ChatMasterDataServlet`, `EmployeesServlet`,
 * the static data file and `CommonBean.getReportPermJson`, done in the browser.
 *
 *   /resources/mock/report_mock.json        the report list + filter definitions: a static file of the Java web app → `report.data.generated.ts`
 *   /board/chat-master-data?type=…          options of a filter  → `core/live/board-master.live.ts`
 *   /board/employees                        options of a filter  → `core/live/board-master.live.ts`
 *   /report-pdf?code=…&filters              the PDF the new tab shows  → NOT AVAILABLE: see below
 *   reportPermJson                          which reports the user may open: the roles `Report_<CODE>_View` of the session
 *
 * THE PDF IS NOT PORTED, ON PURPOSE. `ReportPdfServlet` did not call a REST API: it turned the filters into an SQL `WHERE` fragment
 * (`externalSQLWhere`, `col = '<value>'`) and fetched the PDF from a separate JasperReports host (`<report.base>/red/rpt/jasperReport?…`,
 * configured in `report_config.properties`, no token). A browser must not do that itself: the address (and the SQL the report host runs) would be
 * in the user's hands, and editing `externalSQLWhere` in the address bar would run any SQL on the report database. The report needs a REST
 * endpoint on the backend (the user's decision — an open question in docs/integration/report.md). Until then the servlet's own answers for a
 * request it cannot serve are kept: 400 for a bad code, 403 without `Report_<CODE>_View`, and 501 (the servlet's answer when a report is not
 * configured) with a text that says the report service is not connected.
 */
import { REPORT_CODES, reportRole } from '@core/permissions/report-roles';
import { boardMasterRoutes } from '@core/live/board-master.live';
import { composeRoutes, jsonResponse, textResponse, type RestDeps, type RouteHandler } from '@core/live/rest';
import type { ReportBackend, ReportInitial } from './report-backend';
import { REPORT_DATA } from './report.data.generated';

/** `ReportPdfServlet.CODE_PATTERN` */
const CODE_PATTERN = /^[A-Za-z0-9_-]{2,24}$/;

/** the message of a report that cannot be served (HTTP 501, text/plain — what a tab shows) */
export const reportNotConnectedText = (code: string): string =>
  `ยังไม่ได้เชื่อมระบบรายงาน ${code}\nระบบสร้างรายงาน PDF ยังไม่มี REST API ให้เรียกจาก browser — ต้องให้ผู้ดูแล backend เปิด endpoint ก่อน`;

/** what `ReportPdfServlet.doGet` answers, as far as it can be done without the report host: the code check, the role check, then 501 */
export function reportPdfAnswer(deps: RestDeps, query: URLSearchParams): { status: number; body: string } {
  const code = (query.get('code') ?? '').trim();
  if (!code || !CODE_PATTERN.test(code)) return { status: 400, body: 'ต้องระบุรหัสรายงาน (code) ให้ถูกต้อง' };
  if (!deps.hasRole(`Report_${code}_View`)) return { status: 403, body: `ไม่มีสิทธิ์เรียกดูรายงาน ${code}` };
  return { status: 501, body: reportNotConnectedText(code) };
}

const reportPdf = (deps: RestDeps, query: URLSearchParams): Response => {
  const a = reportPdfAnswer(deps, query);
  return textResponse(a.status, a.body, 'text/plain; charset=UTF-8');
};

const reportRoutes = (deps: RestDeps): RouteHandler => async (path, query) => {
  switch (path) {
    case '/resources/mock/report_mock.json':
      return jsonResponse(200, REPORT_DATA);
    case '/report-pdf':
      return reportPdf(deps, query);
    default:
      return null;
  }
};

export function createLiveReport(deps: RestDeps): ReportBackend {
  const route = composeRoutes(boardMasterRoutes(deps), reportRoutes(deps));
  return {
    initial(who): ReportInitial {
      return { reportPermJson: Object.fromEntries(REPORT_CODES.map((code) => [code, who.hasRole(reportRole(code))])) };
    },
    fetch: (input, init) => route(input, init),
    reportUrl(input) {
      // the tab cannot send a Bearer header, so there is no address to load a PDF from: it shows what the servlet would have answered
      const a = reportPdfAnswer(deps, new URL(input, 'http://page.local').searchParams);
      return URL.createObjectURL(new Blob([a.body], { type: 'text/plain;charset=UTF-8' }));
    },
  };
}
