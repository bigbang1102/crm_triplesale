import { describe, expect, it } from 'vitest';
import { IMPLEMENTED } from '../../app.routes';
import { TOP_TAB_GROUPS, MenuLink, RAIL_ITEMS } from './nav.config';
import { PAGES, PHASES } from './page-registry';

/** '/crm/drilldown/:code' → /^\/crm\/drilldown\/[^/]+$/ */
const toRegex = (route: string) => new RegExp(`^/${route.replace(/:[^/]+/g, '[^/]+')}$`);

function collectRoutes(links: readonly MenuLink[]): string[] {
  return links.flatMap((l) => [...(l.route ? [l.route] : []), ...collectRoutes(l.children ?? [])]);
}

describe('page registry', () => {
  it('has unique ids and unique routes', () => {
    expect(new Set(PAGES.map((p) => p.id)).size).toBe(PAGES.length);
    expect(new Set(PAGES.map((p) => p.route)).size).toBe(PAGES.length);
  });

  it('only uses phases that exist', () => {
    const ids = new Set(PHASES.map((p) => p.id));
    for (const page of PAGES) expect(ids.has(page.phase), page.id).toBe(true);
  });

  it('every page lists its legacy source', () => {
    for (const page of PAGES) expect(page.legacy.length, page.id).toBeGreaterThan(0);
  });

  it('`implemented` agrees with the loaders in app.routes.ts', () => {
    for (const page of PAGES) {
      expect(page.implemented, `${page.id}: implemented flag vs IMPLEMENTED map`).toBe(page.id in IMPLEMENTED);
    }
  });

  it('navGroup / navTab point at tabs that really exist in nav.config.ts', () => {
    for (const page of PAGES) {
      if (!page.navGroup) continue;
      expect(TOP_TAB_GROUPS[page.navGroup], `${page.id}: unknown group ${page.navGroup}`).toBeDefined();
      if (page.navTab) {
        const ids = TOP_TAB_GROUPS[page.navGroup].map((t) => t.id);
        expect(ids, `${page.id}: tab ${page.navTab} not in group ${page.navGroup}`).toContain(page.navTab);
      }
    }
  });

  it('every menu / tab / rail link resolves to a registered route', () => {
    const regexes = PAGES.map((p) => toRegex(p.route));
    const links = [
      ...RAIL_ITEMS.map((i) => i.route),
      ...Object.values(TOP_TAB_GROUPS).flatMap((tabs) => collectRoutes(tabs)),
    ];
    for (const link of links) {
      expect(
        regexes.some((rx) => rx.test(link)),
        `no page registered for link ${link}`,
      ).toBe(true);
    }
  });
});
