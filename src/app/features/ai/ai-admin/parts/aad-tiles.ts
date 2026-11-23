import { ChangeDetectionStrategy, Component, input } from '@angular/core';

export interface AadTile {
  label: string;
  /** the big number, already formatted */
  value: string;
  /** exact number / extra line in smaller text */
  hint?: string;
}

/** A row of KPI tiles (token totals). */
@Component({
  selector: 'ts-aad-tiles',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <dl class="aad-tiles">
      @for (tile of tiles(); track tile.label) {
        <div class="aad-tile">
          <dt>{{ tile.label }}</dt>
          <dd>{{ tile.value }}</dd>
          @if (tile.hint) {
            <dd class="aad-tile-hint">{{ tile.hint }}</dd>
          }
        </div>
      }
    </dl>
  `,
})
export class AadTiles {
  readonly tiles = input.required<readonly AadTile[]>();
}
