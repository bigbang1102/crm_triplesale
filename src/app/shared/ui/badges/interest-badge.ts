import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import { interestColor } from '@shared/constants/palettes';

/**
 * Lead interest / closing status (HOT, WARM, COLD, INACTIVE, NEW, LOST, SUCCESS, SOLD).
 * Colours come from INT_COLOR_MAP (CLAUDE.md §3) — never pass your own colour.
 *
 *   <ts-interest-badge status="HOT" />            solid pill (lists, cards)
 *   <ts-interest-badge status="HOT" variant="dot" label="ร้อน" />   dot + text
 */
@Component({
  selector: 'ts-interest-badge',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { '[class.dot]': "variant() === 'dot'", '[style.--c]': 'color()' },
  template: `
    @if (variant() === 'dot') {
      <span class="d"></span>
    }
    {{ text() }}
  `,
  styles: `
    :host {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      gap: 6px;
      min-width: 100px;
      padding: 0.3em 0.5rem;
      border-radius: 7px;
      background: var(--c);
      color: #fff;
      font-size: var(--ts-fs-small);
      font-weight: 700;
      letter-spacing: 0.3px;
      text-transform: uppercase;
      white-space: nowrap;
    }
    :host(.dot) {
      min-width: 0;
      padding: 0;
      background: none;
      color: var(--ts-text);
      font-weight: 500;
      text-transform: none;
    }
    .d {
      width: 8px;
      height: 8px;
      border-radius: 50%;
      background: var(--c);
    }
  `,
})
export class InterestBadge {
  readonly status = input.required<string | null | undefined>();
  readonly label = input<string>();
  readonly variant = input<'solid' | 'dot'>('solid');

  protected readonly color = computed(() => interestColor(this.status()));
  protected readonly text = computed(() => this.label() ?? String(this.status() ?? '').toUpperCase());
}
