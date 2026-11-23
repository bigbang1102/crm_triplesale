import { ChangeDetectionStrategy, Component, computed, inject, input } from '@angular/core';
import { RouterLink } from '@angular/router';
import { I18n } from '@core/i18n/i18n.service';
import { aiToolRequires } from '@core/permissions/ai-hub-roles';
import { PermissionService } from '@core/permissions/permission.service';
import { ROLE } from '@core/permissions/roles';
import { AiAdmin } from '../ai-admin/ai-admin';
import { AiHubView } from './ai-hub-view';

/**
 * AI HUB route (`/ai/hub` = hub home, `/ai/hub/:tool` = one tool) — pages/ai_hub.xhtml.
 * Shows the "AI HUB is switched off" notice when the feature flag (`aihub.menu.enabled`) is off.
 */
@Component({
  selector: 'ts-ai-hub',
  imports: [AiAdmin, AiHubView, RouterLink],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @if (enabled && !allowed()) {
      <div style="max-width:560px;margin:72px auto;padding:36px 28px;text-align:center;border:1px solid #E4E7EC;border-radius:18px;background:#FFFFFF;">
        <div style="width:64px;height:64px;margin:0 auto 16px;border-radius:18px;display:flex;align-items:center;justify-content:center;color:#FFFFFF;background:linear-gradient(135deg,#6043B6,#A78BFA);font-size:28px;">
          <i class="fa-solid fa-lock"></i>
        </div>
        <h2 style="margin:0 0 8px;font-size:20px;color:#101828;">{{ t('app.aiHub.noPermTitle') }}</h2>
        <p style="margin:0 0 20px;color:#475467;line-height:1.7;">{{ t('app.aiHub.noPermText') }}</p>
        <a routerLink="/ai/hub" style="display:inline-block;padding:9px 18px;border-radius:10px;background:#6043B6;color:#FFFFFF;text-decoration:none;font-weight:600;">{{ t('app.aiHub.backHub') }}</a>
      </div>
    } @else if (enabled) {
      @if (tool() === 'admin') {
        <!-- the token Admin is hand-written (3 pages, token numbers only), not the generated Java Admin section -->
        <ts-ai-admin />
      } @else {
        <!-- keyed by the tool: switching tools rebuilds the view, like the page reload of the Java app -->
        @for (key of keys(); track key) {
          <ts-ai-hub-view [tool]="key" />
        }
      }
    } @else {
      <div style="max-width:560px;margin:72px auto;padding:36px 28px;text-align:center;border:1px solid #E4E7EC;border-radius:18px;background:#FFFFFF;">
        <div style="width:64px;height:64px;margin:0 auto 16px;border-radius:18px;display:flex;align-items:center;justify-content:center;color:#FFFFFF;background:linear-gradient(135deg,#6043B6,#A78BFA);font-size:28px;">
          <i class="fa-solid fa-power-off"></i>
        </div>
        <h2 style="margin:0 0 8px;font-size:20px;color:#101828;">{{ t('app.aiHub.disabledTitle') }}</h2>
        <p style="margin:0 0 20px;color:#475467;line-height:1.7;">{{ t('app.aiHub.disabledText') }}</p>
        <a routerLink="/crm/home" style="display:inline-block;padding:9px 18px;border-radius:10px;background:#6043B6;color:#FFFFFF;text-decoration:none;font-weight:600;">{{ t('app.aiHub.backHome') }}</a>
      </div>
    }
  `,
})
export class AiHub {
  /** route parameter `:tool`; absent on `/ai/hub` */
  readonly tool = input<string>();

  protected readonly t = inject(I18n).t;
  protected readonly enabled = inject(PermissionService).flag('aiHubEnabled');
  protected readonly keys = computed(() => [this.tool() ?? '']);
  private readonly perm = inject(PermissionService);
  /** `AI_ACCESS_USE` + the permission of the tool in the URL (Permission Dic.xlsx); the hub home needs only the first */
  protected readonly allowed = computed(() => this.perm.has(ROLE.aiAccessUse) && this.perm.has(aiToolRequires(this.tool())));
}
