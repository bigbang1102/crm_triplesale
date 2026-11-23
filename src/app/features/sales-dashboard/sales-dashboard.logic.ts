/**
 * What the dashboard host decides by itself (framework-free so the spec runs in Node): which tab a key moves to, and where a frame's
 * arrow scrolls its track. The markup / CSS are generated from the designer's snapshot (`tools/sync-sales-dashboard.mjs`).
 */

/** The tabs in the order of the tab strip — `#db-tab-<tab>` in the generated template. */
export const DASHBOARD_TABS = ['overview', 'lead', 'pipeline', 'team', 'activity', 'chat'] as const;
export type DashboardTab = (typeof DASHBOARD_TABS)[number];

export const isDashboardTab = (value: string | null | undefined): value is DashboardTab =>
  (DASHBOARD_TABS as readonly string[]).includes(value ?? '');

/** WAI-ARIA tabs: ← / → move (and wrap around), Home / End jump to the ends; any other key does nothing. */
export function tabAfterKey(current: DashboardTab, key: string): DashboardTab | undefined {
  const at = DASHBOARD_TABS.indexOf(current);
  const last = DASHBOARD_TABS.length - 1;
  switch (key) {
    case 'ArrowRight':
      return DASHBOARD_TABS[at === last ? 0 : at + 1];
    case 'ArrowLeft':
      return DASHBOARD_TABS[at === 0 ? last : at - 1];
    case 'Home':
      return DASHBOARD_TABS[0];
    case 'End':
      return DASHBOARD_TABS[last];
    default:
      return undefined;
  }
}

export interface ScrollBox {
  readonly scrollLeft: number;
  readonly clientWidth: number;
  readonly scrollWidth: number;
}

/**
 * Where a frame's arrow takes its track: one visible width further, back to the start once the end is reached.
 * FAST-DEBT(REQ): the snapshot shows only the right arrow (the designer's frame added a left one after scrolling — not captured), so
 *   the right arrow wraps around instead · BIG · 2026-11-20
 */
export function nextScrollLeft(track: ScrollBox): number {
  const end = track.scrollWidth - track.clientWidth;
  if (end <= 0) return 0;
  // 1px of slack: fractional scroll positions of a scaled page never quite reach the end
  return track.scrollLeft >= end - 1 ? 0 : Math.min(end, track.scrollLeft + track.clientWidth);
}
