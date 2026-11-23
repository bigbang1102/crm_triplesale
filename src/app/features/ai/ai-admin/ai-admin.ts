import {
  ChangeDetectionStrategy,
  Component,
  ViewEncapsulation,
  computed,
  inject,
} from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { I18n } from '@core/i18n/i18n.service';
import { AI_ADMIN_AUDIT_ROLES, AI_ADMIN_USAGE_ROLES } from '@core/permissions/ai-hub-roles';
import { PermissionService } from '@core/permissions/permission.service';
import { AiAdminAudit } from './ai-admin-audit';
import { AiAdminDetail } from './ai-admin-detail';
import { AiAdminUsage } from './ai-admin-usage';

export type AiAdminTab = 'usage' | 'detail' | 'audit';

interface TabDef {
  id: AiAdminTab;
  icon: string;
  requires: string;
}

/** the three Admin pages (`/ai/hub/admin?tab=usage|detail|audit`) and the `AI_ADMIN_*` roles each one needs */
const TABS: readonly TabDef[] = [
  { id: 'usage', icon: 'fa-gauge-high', requires: AI_ADMIN_USAGE_ROLES },
  { id: 'detail', icon: 'fa-layer-group', requires: AI_ADMIN_USAGE_ROLES },
  { id: 'audit', icon: 'fa-clipboard-list', requires: AI_ADMIN_AUDIT_ROLES },
];

/**
 * AI HUB › Admin: token governance, token numbers only (no cost / price / status anywhere). Hand-written (the generated Java
 * Admin section of `ai-hub.html` is not used). The page is chosen by the `tab` query parameter; a tab the user may not open is
 * not offered and falls back to the first allowed one. Styles are global with the `aad-` prefix (`ai-admin.scss`).
 */
@Component({
  selector: 'ts-ai-admin',
  imports: [AiAdminAudit, AiAdminDetail, AiAdminUsage, RouterLink],
  templateUrl: './ai-admin.html',
  styleUrl: './ai-admin.scss',
  encapsulation: ViewEncapsulation.None,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AiAdmin {
  protected readonly t = inject(I18n).t;
  private readonly perm = inject(PermissionService);
  private readonly query = toSignal(inject(ActivatedRoute).queryParamMap);

  protected readonly tabs = computed(() => TABS.filter((tab) => this.perm.has(tab.requires)));
  protected readonly active = computed<AiAdminTab | null>(() => {
    const allowed = this.tabs();
    const wanted = this.query()?.get('tab');
    return (allowed.find((tab) => tab.id === wanted) ?? allowed[0])?.id ?? null;
  });
}
