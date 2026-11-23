import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import { groupPillStyle } from '@shared/constants/palettes';

/**
 * Tag / badge for items with an unlimited set of names (activity group, source …):
 * background = palette colour at 20 %, text = the full colour. Same name → same colour everywhere
 * (CLAUDE.md §6, `TAG_PALETTE` + `groupPillColor`).
 */
@Component({
  selector: 'ts-group-tag',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { '[style.background]': 'style().background', '[style.color]': 'style().color' },
  template: `{{ name() }}`,
  styles: `
    :host {
      display: inline-block;
      max-width: 100%;
      padding: 2px 10px;
      border-radius: 999px;
      font-size: var(--ts-fs-small);
      font-weight: 500;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }
  `,
})
export class GroupTag {
  readonly name = input.required<string | null | undefined>();
  protected readonly style = computed(() => groupPillStyle(this.name()));
}
