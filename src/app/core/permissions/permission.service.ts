import { Injectable, computed, inject } from '@angular/core';
import { AuthService } from '../auth/auth.service';
import { ConfigService } from '../config/config.service';
import { ACCESS_BUTTON_REGISTRY, AccessButtonCode } from './access-buttons';
import { FeatureFlag, ROLE_BYPASSED_BY, SUPER_ADMIN_ALIASES } from './roles';

/**
 * Role checks — behaviour-compatible with `SessionRoles` / `commonBean.hasFeature()`:
 *  - `has('A,B')` is OR (any of the listed keys), exact case-sensitive match
 *  - a super-admin alias passes every check; a role in `ROLE_BYPASSED_BY` passes the checks of the roles it stands in for
 *  - no roles ⇒ nothing is visible (fail-closed); an empty/null requirement ⇒ allowed
 *
 * Methods read signals, so templates using them update automatically:
 *   @if (perm.has(ROLE.leadEdit)) { … }
 */
@Injectable({ providedIn: 'root' })
export class PermissionService {
  private readonly auth = inject(AuthService);
  private readonly config = inject(ConfigService);
  private readonly buttons = inject(ACCESS_BUTTON_REGISTRY);

  /** the roles the backend sent */
  private readonly roleSet = computed(() => new Set<string>(this.auth.session()?.roles ?? []));

  readonly isSuperAdmin = computed(() =>
    [...this.roleSet()].some((r) => SUPER_ADMIN_ALIASES.has(r.trim().toLowerCase())),
  );

  /** `spec` = one key or a comma separated OR-list. Empty spec means "no requirement". */
  has(spec: string | null | undefined): boolean {
    if (!spec || !spec.trim()) return true;
    if (this.isSuperAdmin()) return true;
    const roles = this.roleSet();
    return spec.split(',').some((raw) => {
      const key = raw.trim();
      return roles.has(key) || (ROLE_BYPASSED_BY[key] ?? []).some((r) => roles.has(r));
    });
  }

  /**
   * A button of the registry (`ACCESS_BUTTONS`): usable when the user holds ANY of the roles it hangs under (so a super-admin passes
   * too). A code with no entry, or a button that is under no role yet, is hidden — fail-closed, like `has()` with no roles.
   */
  canUse(code: AccessButtonCode): boolean {
    const roles = this.buttons[code]?.roles ?? [];
    return roles.some((role) => this.has(role));
  }

  hasAll(keys: readonly string[]): boolean {
    return keys.every((k) => this.has(k));
  }

  /** Any role starting with `prefix` (e.g. 'Report_' shows the Report menu). */
  hasPrefix(prefix: string): boolean {
    if (this.isSuperAdmin()) return true;
    return [...this.roleSet()].some((r) => r.startsWith(prefix));
  }

  /**
   * Action on a record that has an owner (schedule / activity / assign / rework / close):
   * allowed with the `_Sup` key, or with the base key when the signed-in employee owns the record.
   */
  canAct(baseKey: string, ownerEmployeeId: number | null | undefined): boolean {
    if (this.has(`${baseKey}_Sup`)) return true;
    const me = this.auth.session()?.employeeId;
    return this.has(baseKey) && me != null && ownerEmployeeId != null && me === ownerEmployeeId;
  }

  flag(name: FeatureFlag): boolean {
    return this.config.value.features[name];
  }
}
