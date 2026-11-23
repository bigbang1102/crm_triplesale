import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { I18n } from '@core/i18n/i18n.service';
import { deleteRole, importStandardRoles, lostIfStatus, positionsUsing, rolesOf, saveRole } from '@core/mock/role-store';
import { ROLE_CATALOG, setOfRole, type RoleRecord, type RoleStatus } from '@core/permissions/role-model';
import { DialogService } from '@shared/ui/notify/dialog.service';
import { ToastService } from '@shared/ui/notify/toast.service';
import { TsIcon } from '@shared/ui/icon/icon';
import { RoleFormDialog, type RoleFormMode } from './role-form-dialog';
import { RolePanel } from './role-panel';
import { RolePositions } from './role-positions';
import { RoleReceive, lostText } from './role-warnings';

const PAGE_SIZE = 20;
const LAYERS = [1, 2, 3, 4] as const;
const RULES = [1, 2, 3, 4, 5, 6] as const;

type SortKey = 'code' | 'name' | 'category' | 'count' | 'status';

/**
 * ขั้น "Role สิทธิ์" ของตั้งค่า › องค์กรและคน (ตามต้นแบบ master-setup_role-permission_v4):
 *  - แท็บ Role: รายการ Role + แถวขยายติ๊ก Permission (Yes/No บันทึกทันที · ติ๊กตัวที่ต้องมีก่อนให้อัตโนมัติ) + สร้าง/ดู/แก้ไข/คัดลอก/ลบ + นำเข้า Role มาตรฐาน
 *  - แท็บ ตำแหน่งงาน ↔ Role: ผูก Role กับตำแหน่ง ดูว่าตำแหน่งนั้น "เป็นผู้รับผิดชอบ Lead / Prospect / Opportunity ได้ไหม"
 * ข้อมูลอยู่ที่ `core/mock/role-store.ts` (ฐานร่วม) — ผู้รับงานของคิว/Lead ใช้ชุดเดียวกัน (ชุดสิทธิ์ขั้นต่ำของผู้รับ).
 */
@Component({
  selector: 'ts-sv-role',
  imports: [TsIcon, RoleFormDialog, RolePanel, RolePositions, RoleReceive],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './role.html',
  styleUrl: './role.scss',
})
export class RoleStep {
  protected readonly t = inject(I18n).t;
  private readonly toast = inject(ToastService);
  private readonly dialogs = inject(DialogService);

  protected readonly layers = LAYERS;
  protected readonly rules = RULES;
  protected readonly standardCount = ROLE_CATALOG.roles.length;
  protected readonly view = signal<'roles' | 'positions'>('roles');
  protected readonly introOpen = signal(true);
  protected readonly query = signal('');
  protected readonly page = signal(1);
  protected readonly sort = signal<{ key: SortKey; dir: 1 | -1 }>({ key: 'code', dir: 1 });
  /** the role whose permissions are open under its row (one at a time) */
  protected readonly opened = signal('');
  protected readonly form = signal<{ mode: RoleFormMode; id: string } | null>(null);
  /** grows with every change, so the lists (and the open panel) read the store again */
  protected readonly version = signal(0);

  private readonly all = computed(() => {
    this.version();
    return rolesOf().map((role) => ({
      role,
      count: role.permissions.length,
      used: positionsUsing(role.id).map((p) => p.code),
      set: setOfRole(role),
    }));
  });

  private readonly filtered = computed(() => {
    const q = this.query().trim().toLowerCase();
    const { key, dir } = this.sort();
    const value = (r: { role: RoleRecord; count: number }): string | number => (key === 'count' ? r.count : r.role[key]);
    return this.all()
      .filter((r) => !q || `${r.role.code} ${r.role.name}`.toLowerCase().includes(q))
      .sort((a, b) => {
        const x = value(a);
        const y = value(b);
        const order = typeof x === 'number' && typeof y === 'number' ? x - y : String(x).localeCompare(String(y), 'th', { numeric: true });
        return order * dir;
      });
  });

  protected readonly pageCount = computed(() => Math.max(1, Math.ceil(this.filtered().length / PAGE_SIZE)));
  protected readonly rows = computed(() => {
    const from = (Math.min(this.page(), this.pageCount()) - 1) * PAGE_SIZE;
    return this.filtered().slice(from, from + PAGE_SIZE);
  });
  protected readonly pageInfo = computed(() => {
    const total = this.filtered().length;
    const from = (Math.min(this.page(), this.pageCount()) - 1) * PAGE_SIZE;
    return { from: total ? from + 1 : 0, to: Math.min(total, from + PAGE_SIZE), total };
  });
  protected readonly pages = computed(() => Array.from({ length: this.pageCount() }, (_x, i) => i + 1));

  protected setSearch(value: string): void {
    this.query.set(value);
    this.page.set(1);
  }

  protected sortBy(key: SortKey): void {
    this.sort.update((s) => ({ key, dir: s.key === key ? (s.dir === 1 ? -1 : 1) : 1 }));
  }

  protected sortMark(key: SortKey): string {
    const s = this.sort();
    return s.key === key ? (s.dir === 1 ? '▲' : '▼') : '';
  }

  protected ariaSort(key: SortKey): 'ascending' | 'descending' | 'none' {
    const s = this.sort();
    return s.key !== key ? 'none' : s.dir === 1 ? 'ascending' : 'descending';
  }

  protected toggle(id: string): void {
    this.opened.update((o) => (o === id ? '' : id));
  }

  protected refresh(): void {
    this.version.update((n) => n + 1);
  }

  protected importStandard(): void {
    const n = importStandardRoles();
    this.refresh();
    if (n) this.toast.success(this.t('app.settings.role.imported', n));
    else this.toast.info(this.t('app.settings.role.importedNone'));
  }

  protected onSaved(result: { id: string; code: string; lostCount: number }): void {
    this.form.set(null);
    this.refresh();
    this.toast.success(this.t('app.settings.role.form.saved', result.code));
  }

  /** a role a position still holds cannot be deleted — offer to block it; a free one is deleted after a confirm */
  protected async remove(role: RoleRecord): Promise<void> {
    const used = positionsUsing(role.id).map((p) => p.code);
    if (used.length) {
      if (role.status === 'block') {
        await this.dialogs.alert({ title: this.t('app.settings.role.del.title', `${role.code} · ${role.name}`), text: this.t('app.settings.role.del.used', used.join(', ')), icon: 'error' });
        return;
      }
      const block = await this.dialogs.confirm({ title: this.t('app.settings.role.del.title', `${role.code} · ${role.name}`), text: this.t('app.settings.role.del.used', used.join(', ')), okText: this.t('app.settings.role.del.block'), danger: true, icon: 'warning' });
      if (block) await this.block(role);
      return;
    }
    const ok = await this.dialogs.confirm({ title: this.t('app.settings.role.del.title', `${role.code} · ${role.name}`), text: this.t('app.settings.role.del.text'), okText: this.t('app.settings.delete'), danger: true, icon: 'warning' });
    if (!ok || !deleteRole(role.id).ok) return;
    if (this.opened() === role.id) this.opened.set('');
    this.refresh();
    this.toast.success(this.t('app.settings.role.del.done', role.code));
  }

  private async block(role: RoleRecord): Promise<void> {
    const status: RoleStatus = 'block';
    const lost = lostIfStatus(role.id, status);
    if (lost.length) {
      const ok = await this.dialogs.confirm({ title: this.t('app.settings.role.lost.title'), text: lostText(this.t, lost), okText: this.t('app.settings.role.lost.ok'), danger: true, icon: 'warning' });
      if (!ok) return;
    }
    saveRole({ id: role.id, code: role.code, name: role.name, status });
    this.refresh();
    this.toast.success(this.t('app.settings.role.blocked', role.code));
  }
}
