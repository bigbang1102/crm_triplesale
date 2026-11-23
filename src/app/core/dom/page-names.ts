/**
 * The Java page(s) a registry entry replaces, by name: `pages/lead_detail.xhtml` → "lead_detail".
 *
 * The Java DOM scripts (no_autofill.js, input_guard.js) decide per page from the URL file name (`…/lead.face` → "lead").
 * In the SPA a route is not a file name, so the registry's `legacy` list (the source files of the page) stands in for it.
 * Only top-level pages count: `pages/components/…` are fragments included by a page, `css/…` / `resources/…` are assets.
 */
export function javaPageNames(legacy: readonly string[] | null | undefined): string[] {
  const names: string[] = [];
  for (const entry of legacy ?? []) {
    const m = /^pages\/([A-Za-z0-9_]+)\.xhtml/.exec(entry.trim());
    if (m) names.push(m[1].toLowerCase());
  }
  return names;
}
