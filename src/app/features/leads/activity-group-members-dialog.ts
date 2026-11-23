import { ChangeDetectionStrategy, Component, ViewEncapsulation, inject, output, signal } from '@angular/core';
import { I18n } from '@core/i18n/i18n.service';
import { SEED_GROUPS } from '@core/mock/crm-seed';
import { queueEmployees, membersOf, updateGroupMembers } from '@core/mock/waitlist';
import { LeadDialogFrame } from './lead-dialog-frame';

/**
 * หน้าต่าง "จัดการสมาชิกกลุ่มกิจกรรม" (Entity Configurator — `CONFIG_ALL`): ติ๊กพนักงานที่เป็นสมาชิกของแต่ละกลุ่ม.
 * สมาชิกกลุ่ม = สมาชิก Wait List ของกลุ่มนั้น (1:1 แก้แยกไม่ได้) ; ถอนคนที่ยังถือโอกาสขายที่ดึงจากคิวไป → ใบนั้นกลับเข้าคิว (flow §5.7 · OP-31).
 */
@Component({
  selector: 'ts-activity-group-members-dialog',
  imports: [LeadDialogFrame],
  changeDetection: ChangeDetectionStrategy.OnPush,
  encapsulation: ViewEncapsulation.None,
  template: `
    <ts-lead-dialog-frame [title]="t('app.leads.groupMembersTitle')" [width]="860" (closed)="closed.emit()">
      <p class="ld-hint">{{ t('app.leads.groupMembersHint') }}</p>
      <div class="ld-members">
        @for (g of groups; track g.id) {
          <fieldset class="ld-member-group">
            <legend>{{ g.name }} <small>({{ countOf(g.id) }})</small></legend>
            @for (e of employees; track e.code) {
              <label class="ld-check"><input type="checkbox" [checked]="has(g.id, e.code)" (change)="toggle(g.id, e.code)" />{{ e.code }} {{ e.name }}</label>
            }
          </fieldset>
        }
      </div>
      <ng-container foot>
        <button type="button" class="ld-btn" (click)="closed.emit()">{{ t('app.common.cancel') }}</button>
        <button type="button" class="ld-btn ld-btn-primary" (click)="save()">{{ t('app.leads.save') }}</button>
      </ng-container>
    </ts-lead-dialog-frame>
  `,
})
export class ActivityGroupMembersDialog {
  protected readonly t = inject(I18n).t;
  protected readonly groups = SEED_GROUPS;
  protected readonly employees = queueEmployees();
  /** รหัสพนักงานของ `SEED_EMPLOYEES` ที่ติ๊กอยู่ ต่อกลุ่ม */
  private readonly picked = signal<Record<number, readonly string[]>>(Object.fromEntries(SEED_GROUPS.map((g) => [g.id, [...membersOf(g.id)]])));

  /** ผู้ทำรายการ (จดในประวัติของใบที่กลับเข้าคิว) และเวลา — ส่งมาจากหน้า */
  readonly actor = 'ระบบ';
  readonly saved = output<{ removed: number; returned: number }>();
  readonly closed = output();

  protected has(groupId: number, code: string): boolean {
    return (this.picked()[groupId] ?? []).includes(code);
  }

  protected countOf(groupId: number): number {
    return (this.picked()[groupId] ?? []).length;
  }

  protected toggle(groupId: number, code: string): void {
    this.picked.update((all) => {
      const now = all[groupId] ?? [];
      return { ...all, [groupId]: now.includes(code) ? now.filter((c) => c !== code) : [...now, code] };
    });
  }

  protected save(): void {
    const now = new Date();
    const at = `${now.toLocaleDateString('en-CA', { timeZone: 'Asia/Bangkok' })} ${now.toLocaleTimeString('en-GB', { timeZone: 'Asia/Bangkok', hour: '2-digit', minute: '2-digit', hour12: false })}`;
    let removed = 0;
    let returned = 0;
    for (const g of this.groups) {
      const change = updateGroupMembers(g.id, this.picked()[g.id] ?? [], this.actor, at);
      removed += change.removed.length;
      returned += change.returned.length;
    }
    this.saved.emit({ removed, returned });
  }
}
