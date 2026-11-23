import { AI_TOOL_ROLE } from '@core/permissions/ai-hub-roles';

/**
 * Hub home: drop the tool cards the user has no `AI_*_USE` for (Permission Dic.xlsx), fix the "N เครื่องมือ" of each group and the total,
 * and drop a group that has no tool left. A card the dictionary does not name (e.g. the link to the translator) is left alone.
 * Plain DOM — the markup is the Java page's, generated (`ai-hub.html`).
 */
export function applyAiToolPermissions(root: ParentNode, has: (role: string) => boolean): void {
  const total = root.querySelector<HTMLElement>('[data-tool-count]');
  let shown = 0;
  for (const group of Array.from(root.querySelectorAll<HTMLElement>('.aih-group'))) {
    for (const card of Array.from(group.querySelectorAll<HTMLAnchorElement>('a.aih-tool'))) {
      const tool = /^\/ai\/hub\/([\w-]+)$/.exec(card.getAttribute('href') ?? '')?.[1];
      const role = tool ? AI_TOOL_ROLE[tool] : undefined;
      if (role && !has(role)) card.remove();
    }
    const left = group.querySelectorAll('a.aih-tool').length;
    if (left === 0) {
      group.remove();
      continue;
    }
    shown += left;
    const count = group.querySelector<HTMLElement>('.aih-group-count');
    if (count) count.textContent = count.textContent!.replace(/\d+/, String(left));
  }
  if (total) total.textContent = String(shown);
}
