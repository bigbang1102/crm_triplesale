/** What the server rendered into `report.xhtml` with EL (`commonBean.reportPermJson`): which reports the signed-in user may see and open. */
export interface ReportInitial {
  /** `{ "<report code>": boolean }` for every code of the report registry */
  reportPermJson: Record<string, boolean>;
}

/**
 * The backend of the Report page: the answers the Java page got from the server, behind one contract so that the engine does not
 * know which one it talks to. Today only the mock exists (`report.mock.ts`); the live adapter is the next step — see the notes in
 * report-view.ts for what it has to port.
 */
export interface ReportBackend {
  /** the values `commonBean` rendered into the page; `hasRole` = SessionRoles.hasRole of the signed-in user */
  initial(who: { hasRole: (role: string) => boolean }): ReportInitial;
  /**
   * the requests of the page script, by the URL it builds (without the context path):
   *   /resources/mock/report_mock.json                  the report list and the filter definitions
   *   /board/chat-master-data?type=…                    options of a filter ({ status, message, result: [{ code, name }] })
   *   /board/employees                                  options of a filter (a plain array)
   *   /report-pdf?code=…&<filters>                      the PDF the new tab shows (ReportPdfServlet)
   */
  fetch(input: string, init?: RequestInit): Promise<Response>;
  /**
   * The address a new browser tab can load for the report URL the page built (`window.open(url, '_blank')` in Java, where `/report-pdf?…`
   * was a servlet of the same web app). It has to be known synchronously — the tab is opened inside the click or the browser blocks it.
   */
  reportUrl(url: string): string;
}
