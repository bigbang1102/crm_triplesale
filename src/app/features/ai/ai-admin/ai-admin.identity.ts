import { InjectionToken, inject } from '@angular/core';
import { AuthService } from '@core/auth/auth.service';
import { PermissionService } from '@core/permissions/permission.service';
import { AI_ADMIN_ROLES, AI_HUB_ROLE } from '@core/permissions/ai-hub-roles';

/** The `X-Ts-*` identity headers the dev proxy turns into the service's caller (see tools/aihub-dev-proxy.cjs). */
export type AiAdminIdentity = () => Record<string, string>;

const encode = (value: string | number | null | undefined) =>
  encodeURIComponent(String(value ?? ''));

/**
 * HOOK for the lead: provide `AI_ADMIN_IDENTITY` with the shared `identityHeaders()` of `ai-hub-view.ts` once it is extracted;
 * until then this default builds the same headers plus the flags `admin-tokens` needs (`tokenAdmin`, `quotaAdmin`, `allBranch`).
 */
// FAST-DEBT(SEC): ตัวตน/สิทธิ์ admin มาจาก header ที่เบราว์เซอร์ส่ง (ปลอมได้) · ใช้ได้เฉพาะ dev proxy ที่เปิด AIHUB_CLIENT_IDENTITY=1 · production ให้ gateway ตัดสินจาก token (ADR-001) · somyot · 2026-11-21
export const AI_ADMIN_IDENTITY = new InjectionToken<AiAdminIdentity>('AI_ADMIN_IDENTITY', {
  providedIn: 'root',
  factory: () => {
    const auth = inject(AuthService);
    const perm = inject(PermissionService);
    const flag = (role: string) => (perm.has(role) ? '1' : '0');
    return () => {
      const headers: Record<string, string> = {
        'X-Ts-Super-Admin': perm.isSuperAdmin() ? '1' : '0',
        'X-Ts-Token-Admin': flag(AI_ADMIN_ROLES),
        'X-Ts-Quota-Admin': flag(AI_HUB_ROLE.aiAdminQuotaManage),
        'X-Ts-All-Branch': flag(AI_HUB_ROLE.aiAdminUsageAllBranch),
      };
      const session = auth.session();
      if (!session) return headers;
      headers['X-Ts-Actor'] = encode(session.profileName || session.username);
      headers['X-Ts-Actor-Id'] = encode(session.employeeCode || session.employeeId);
      headers['X-Ts-Actor-User'] = encode(session.username);
      headers['X-Ts-Branch-Id'] = encode(session.branch?.id);
      headers['X-Ts-Branch-Code'] = encode(session.branch?.code);
      headers['X-Ts-Branch-Name'] = encode(session.branch?.name);
      return headers;
    };
  },
});
