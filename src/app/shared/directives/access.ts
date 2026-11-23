import { Directive, TemplateRef, ViewContainerRef, effect, inject, input } from '@angular/core';
import { AccessButtonCode } from '@core/permissions/access-buttons';
import { PermissionService } from '@core/permissions/permission.service';

/**
 * Shows the element only when the signed-in user may use the button `code` of the access-button registry
 * (`PermissionService.canUse`: the one role the button hangs under). Hidden while the role is missing, unassigned or the
 * session is gone; follows the roles when they change.
 *
 *   <button *tsAccess="'PL-PR-LS-03'" (click)="create()">…</button>
 *
 * One component used by several pages, where a page may allow the action and another may not: the code belongs to the page, so
 * the page passes its own code in and the component hands it to `tsAccess` (one code per place, never a list of them):
 *
 *   <ts-row-menu accessCode="PL-SC-LT-05" />                      // in the list page
 *   <ts-row-menu accessCode="PL-SC-BD-05" />                      // in the board page
 *   // inside ts-row-menu:  accessCode = input.required<AccessButtonCode>();
 *   //                      <button *tsAccess="accessCode()">…</button>
 */
@Directive({ selector: '[tsAccess]' })
export class Access {
  private readonly perm = inject(PermissionService);
  private readonly template = inject<TemplateRef<unknown>>(TemplateRef);
  private readonly container = inject(ViewContainerRef);

  readonly tsAccess = input.required<AccessButtonCode>();

  private shown = false;

  constructor() {
    effect(() => {
      const allowed = this.perm.canUse(this.tsAccess());
      if (allowed === this.shown) return;
      this.shown = allowed;
      this.container.clear();
      if (allowed) this.container.createEmbeddedView(this.template);
    });
  }
}
