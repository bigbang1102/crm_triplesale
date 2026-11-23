import type { DashboardBackend, FrameContext } from './dashboard-backend';

/**
 * The two iframe tabs of the Dashboard (ปฏิทินงาน, KPI-EventMovement).
 *
 * Java fetched `dashboard_calendar_frame.xhtml` / `dashboard_kpi_frame.xhtml` as HTML text (JSF had already rendered the
 * `#{calendarDashboardView…}` values into it) and set it as the `srcdoc` of the iframe. Here the generated modules in `frames/`
 * hold the same two documents (`npm run dashboard:sync`) and this function renders them with the values the backend gives.
 */
export type FrameKind = 'calendar' | 'kpi';

export interface FrameOptions extends FrameContext {
  /** #{request.contextPath}: the Angular app is served from the root, the legacy context path is not part of the URLs */
  ctx: string;
}

export async function dashboardFrame(kind: FrameKind, backend: DashboardBackend, o: FrameOptions): Promise<string> {
  if (kind === 'calendar') {
    const [data, { calendarFrameHtml }] = await Promise.all([backend.calendarFrame(o), import('./frames/calendar-frame.generated')]);
    return calendarFrameHtml({ ...data, ggwBranch: o.ggwBranch, ctx: o.ctx, goldApi: o.goldApi });
  }
  const [kpiListDataJson, { kpiFrameHtml }] = await Promise.all([backend.kpiFrame(o), import('./frames/kpi-frame.generated')]);
  return kpiFrameHtml({ kpiListDataJson });
}

type FrameFetch = (input: string, init?: RequestInit) => Promise<Response>;
interface BridgeHost {
  __tsDashFetch?: FrameFetch;
}

/**
 * The frames are same-origin `srcdoc` documents; a small script at the top of each (see tools/sync-dashboard-frames.mjs)
 * sends their API calls to `window.parent.__tsDashFetch`. This installs that function (the backend of the page: the mock in
 * dev, the bearer-token client in live mode) for as long as the Dashboard is on screen and returns the function that removes it.
 */
export function installFrameBridge(fetchFn: FrameFetch): () => void {
  const host = window as unknown as BridgeHost;
  host.__tsDashFetch = fetchFn;
  return () => {
    if (host.__tsDashFetch === fetchFn) delete host.__tsDashFetch;
  };
}
