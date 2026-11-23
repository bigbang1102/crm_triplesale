import { ChangeDetectionStrategy, Component, computed, inject, input, output, signal } from '@angular/core';
import { I18n } from '@core/i18n/i18n.service';
import { PERMISSIONS, PERMISSION_GROUPS, RECEIVER_DOCS, dependenciesOf, missingForReceiver, setOfRole, warningsOf, type PermissionDef } from '@core/permissions/role-model';
import { applyPlan, planGroupPermissions, planRolePermission, roleById, type PermissionPlan } from '@core/mock/role-store';
import { DialogService } from '@shared/ui/notify/dialog.service';
import { ToastService } from '@shared/ui/notify/toast.service';
import { RoleReceive, RoleWarnings, lostText } from './role-warnings';

const short = (code: string): string => code.replace(/^Pipeline_/, '');

/**
 * รายการ Permission ของ Role หนึ่ง (แถวขยายใต้รายการ Role): กลุ่มพับได้ · ติ๊ก Yes/No แล้วบันทึกทันที ·
 * ติ๊กตัวที่ต้องมีอย่างอื่นก่อน ระบบติ๊กให้ · เอาออกแล้วเอาตัวที่พึ่งพาออกด้วย · ถ้าการแก้ทำให้ตำแหน่งใดเป็นผู้รับงานไม่ได้ ถามก่อนบันทึก.
 */
@Component({
  selector: 'ts-role-panel',
  imports: [RoleReceive, RoleWarnings],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './role-panel.html',
  styleUrl: './role-panel.scss',
})
export class RolePanel {
  protected readonly t = inject(I18n).t;
  private readonly toast = inject(ToastService);
  private readonly dialogs = inject(DialogService);

  readonly roleId = input.required<string>();
  /** the parent bumps it when the role changed elsewhere (the form) */
  readonly revision = input(0);
  readonly editable = input(true);
  readonly changed = output();

  private readonly version = signal(0);
  protected readonly query = signal('');
  protected readonly onlyYes = signal(false);
  private readonly opened = signal<ReadonlySet<string>>(new Set());

  protected readonly set = computed(() => {
    this.version();
    this.revision();
    return setOfRole(roleById(this.roleId()));
  });
  protected readonly count = computed(() => this.set().size);
  protected readonly total = PERMISSIONS.length;
  protected readonly short = short;
  protected readonly warnings = computed(() => warningsOf(this.set()));
  protected readonly receive = computed(() =>
    RECEIVER_DOCS.map((d) => ({ label: d.label, missing: missingForReceiver(this.set(), d.kind).map(short) })),
  );

  /** the groups with the rows that match the search / the Yes filter */
  protected readonly groups = computed(() => {
    const q = this.query().trim().toLowerCase();
    const only = this.onlyYes();
    const set = this.set();
    return PERMISSION_GROUPS.flatMap((g) => {
      const all = PERMISSIONS.filter((p) => p.group === g.id);
      const rows = all.filter((p) => (!only || set.has(p.code)) && (!q || `${p.code} ${p.description}`.toLowerCase().includes(q)));
      if (!rows.length) return [];
      const on = all.filter((p) => set.has(p.code)).length;
      const open = this.opened().has(g.id) || q !== '' || only;
      return [{ ...g, rows, on, total: all.length, open, full: on === all.length }];
    });
  });

  protected needs(p: PermissionDef): string {
    return dependenciesOf(p.code)
      .filter((d) => !d.startsWith('MODULE_') && d !== 'AI_ACCESS_USE')
      .map(short)
      .join(', ');
  }

  protected firstLine = (p: PermissionDef): string => p.description.split('\n')[0];

  protected toggleOpen(id: string): void {
    this.opened.update((s) => {
      const next = new Set(s);
      if (!next.delete(id)) next.add(id);
      return next;
    });
  }

  protected async tick(code: string): Promise<void> {
    if (!this.editable()) return;
    const on = !this.set().has(code);
    const plan = planRolePermission(this.roleId(), code, on);
    if (!(await this.commit(plan))) return;
    const alongside = on ? (plan?.added.slice(1) ?? []) : (plan?.removed.slice(1) ?? []);
    if (alongside.length) this.toast.info(on ? this.t('app.settings.role.toast.addedWith', alongside.map(short).join(', ')) : this.t('app.settings.role.toast.removedWith', alongside.map(short).join(', '), short(code)));
    else this.toast.success(this.t(on ? 'app.settings.role.toast.yes' : 'app.settings.role.toast.no', short(code)));
  }

  protected async tickGroup(id: string, full: boolean): Promise<void> {
    if (!this.editable()) return;
    const plan = planGroupPermissions(this.roleId(), id, !full);
    if (!(await this.commit(plan))) return;
    this.opened.update((s) => new Set(s).add(id));
    this.toast.success(this.t(full ? 'app.settings.role.toast.groupOff' : 'app.settings.role.toast.groupOn', (full ? plan?.removed : plan?.added)?.length ?? 0));
  }

  /** saves a plan, asking first when a position would lose the right to receive work */
  private async commit(plan: PermissionPlan | undefined): Promise<boolean> {
    if (!plan) return false;
    if (plan.lost.length) {
      const ok = await this.dialogs.confirm({ title: this.t('app.settings.role.lost.title'), text: lostText(this.t, plan.lost), okText: this.t('app.settings.role.lost.ok'), danger: true, icon: 'warning' });
      if (!ok) return false;
    }
    applyPlan(plan);
    this.version.update((n) => n + 1);
    this.changed.emit();
    return true;
  }
}
