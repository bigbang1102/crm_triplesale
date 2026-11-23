import { ChangeDetectionStrategy, Component, computed, effect, inject, input, signal, untracked } from '@angular/core';
import { I18n } from '@core/i18n/i18n.service';
import { ProspectFormView } from './prospect-form-view';

/**
 * the mode of the form: `add` for `new`, else `edit`. The read-only look at a record is its own page now (`/crm/prospects/:id/detail`, features/prospects/detail),
 * so a record opened here without `?action_type=edit` (a typed address, an old `?action_type=view` link) is shown open for editing.
 */
export function prospectActionType(id: string | undefined, _actionType: string | undefined): 'add' | 'edit' {
  if (!id || id === 'new') return 'add';
  return 'edit';
}

/**
 * Prospect form route (`/crm/prospects/:id`) — `pages/contracts_master_data.xhtml`: `:id` is `new` (add) or the id of the prospect, `?action_type=edit` (the same
 * page with the fields open; anything else with an id is the read-only view), `?pms=` the page mode of the menu link. `FEATURE_CRM_Prospect` for the route,
 * `Pipeline_Prospect_Create` or `Pipeline_Prospect_Edit` for the page (Java: `CRM_Prospect_View`; the view mode moved to prospect-detail).
 *
 * The backend is chosen by the host (`prospect-form-view.ts`): the sample data in mock mode, the REST services (`prospect-form.live.ts`) otherwise.
 */
@Component({
  selector: 'ts-prospect-form',
  imports: [ProspectFormView],
  changeDetection: ChangeDetectionStrategy.OnPush,
  // a new view instance = a fresh page (Java: location.reload(), another address)
  template: `
    @for (n of [epoch() + ':' + key()]; track n) {
      <ts-prospect-form-view [id]="id() ?? 'new'" [actionType]="mode()" [pms]="pms() ?? null" />
    }
  `,
})
export class ProspectForm {
  /** route parameter `:id`, query parameters `action_type` / `pms` */
  readonly id = input<string>();
  readonly action_type = input<string>();
  readonly pms = input<string>();
  protected readonly mode = computed(() => prospectActionType(this.id(), this.action_type()));
  protected readonly epoch = signal(0);
  protected readonly key = computed(() => `${this.id()}/${this.mode()}`);

  constructor() {
    // Java reloads the page on a language switch
    const i18n = inject(I18n);
    let first = true;
    effect(() => {
      i18n.lang();
      untracked(() => (first ? (first = false) : this.epoch.update((n) => n + 1)));
    });
  }
}
