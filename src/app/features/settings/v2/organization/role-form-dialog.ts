import { ChangeDetectionStrategy, Component, ElementRef, afterNextRender, computed, inject, input, output, signal } from '@angular/core';
import { I18n } from '@core/i18n/i18n.service';
import { lostIfStatus, roleById, roleByCode, saveRole, type RoleInput } from '@core/mock/role-store';
import type { RoleStatus } from '@core/permissions/role-model';
import { DialogService } from '@shared/ui/notify/dialog.service';
import { lostText } from './role-warnings';

export type RoleFormMode = 'create' | 'view' | 'edit' | 'copy';

const STATUSES: readonly RoleStatus[] = ['release', 'draft', 'block'];
let seq = 0;

/**
 * หน้าต่างสร้าง / ดู / แก้ไข / คัดลอก Role — ฟิลด์ตามต้นแบบ: รหัส · ชื่อ · สถานะ · คำอธิบาย (Permission ติ๊กที่แถวขยายของรายการ).
 * ปิดด้วยปุ่ม ยกเลิก / ✕ / Esc.
 */
@Component({
  selector: 'ts-role-form-dialog',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { '(document:keydown.escape)': 'closed.emit()' },
  template: `
    <div class="rf-overlay">
      <div class="rf" role="dialog" aria-modal="true" [attr.aria-labelledby]="titleId">
        <header class="rf-head">
          <div>
            <h2 [id]="titleId">{{ title() }}</h2>
            @if (mode() === 'view') {
              <span class="rf-ro">{{ t('app.settings.role.panel.readonly') }}</span>
            }
          </div>
          <button type="button" class="rf-x" [attr.aria-label]="t('app.common.close')" (click)="closed.emit()">✕</button>
        </header>
        <div class="rf-grid">
          <label class="rf-f">
            <span>{{ t('app.settings.role.form.code') }} <i class="rf-rq">*</i></span>
            <input class="rf-in" [value]="code()" [disabled]="readonly()" maxlength="100" (input)="code.set($any($event.target).value)" />
            @if (err().code; as e) {
              <small class="rf-err">{{ t(e) }}</small>
            }
          </label>
          <label class="rf-f">
            <span>{{ t('app.settings.role.form.name') }} <i class="rf-rq">*</i></span>
            <input class="rf-in" [value]="name()" [disabled]="readonly()" maxlength="200" (input)="name.set($any($event.target).value)" />
            @if (err().name; as e) {
              <small class="rf-err">{{ t(e) }}</small>
            }
          </label>
          <label class="rf-f">
            <span>{{ t('app.settings.role.form.nameEn') }}</span>
            <input class="rf-in" [value]="nameEn()" [disabled]="readonly()" maxlength="200" (input)="nameEn.set($any($event.target).value)" />
          </label>
          <fieldset class="rf-f" [disabled]="readonly()">
            <legend>{{ t('app.settings.role.form.status') }} <i class="rf-rq">*</i></legend>
            <div class="rf-seg">
              @for (s of statuses; track s) {
                <button type="button" [attr.aria-pressed]="status() === s" [disabled]="readonly()" (click)="status.set(s)">{{ s }}</button>
              }
            </div>
          </fieldset>
          <label class="rf-f rf-wide">
            <span>{{ t('app.settings.role.form.description') }}</span>
            <textarea class="rf-in" rows="3" [value]="description()" [disabled]="readonly()" maxlength="1000" (input)="description.set($any($event.target).value)"></textarea>
          </label>
        </div>
        <footer class="rf-foot">
          @if (mode() === 'view') {
            <button type="button" class="rf-btn" (click)="closed.emit()">{{ t('app.common.close') }}</button>
          } @else {
            <button type="button" class="rf-btn" (click)="closed.emit()">{{ t('app.common.cancel') }}</button>
            <button type="button" class="rf-btn rf-primary" (click)="save()">{{ t('app.leads.save') }}</button>
          }
        </footer>
      </div>
    </div>
  `,
  styles: `
    .rf-overlay { position: fixed; inset: 0; z-index: var(--ts-z-dialog, 3000); display: grid; place-items: center; padding: 16px; background: var(--ts-overlay, rgba(20, 18, 40, 0.38)); }
    .rf { box-sizing: border-box; display: flex; flex-direction: column; gap: 14px; width: min(720px, 100%); max-height: 92vh; overflow: auto; padding: 18px 22px; border-radius: 12px; background: var(--ts-surface, #fff); color: var(--ts-text, #383838); box-shadow: 0 18px 40px rgba(25, 18, 70, 0.18); font-size: 14px; line-height: 1.45; }
    .rf-head { display: flex; align-items: flex-start; justify-content: space-between; gap: 12px; }
    .rf-head h2 { margin: 0; font-size: 18px; }
    .rf-ro { color: var(--ts-muted, #7c848d); font-size: 12px; }
    .rf-x { border: 0; background: transparent; color: inherit; font-size: 18px; cursor: pointer; }
    .rf-grid { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 12px 16px; }
    .rf-f { display: flex; flex-direction: column; gap: 4px; min-width: 0; margin: 0; padding: 0; border: 0; }
    .rf-f > span, .rf-f legend { padding: 0; color: var(--ts-text-secondary, #7c848d); }
    .rf-wide { grid-column: 1 / -1; }
    .rf-rq { color: var(--ts-req, #e24c4c); font-style: normal; }
    .rf-in { box-sizing: border-box; width: 100%; padding: 8px 12px; border: 1px solid var(--ts-border, #d1d5db); border-radius: 8px; background: var(--ts-input-bg, #fff); color: inherit; font: inherit; }
    .rf-in:disabled { background: var(--ts-surface-2, #f4f5f9); }
    .rf-err { color: var(--ts-req, #e24c4c); }
    .rf-seg { display: inline-flex; overflow: hidden; border: 1px solid var(--ts-border, #d1d5db); border-radius: 8px; }
    .rf-seg button { padding: 8px 16px; border: 0; background: var(--ts-surface, #fff); color: inherit; font: inherit; cursor: pointer; }
    .rf-seg button[aria-pressed='true'] { background: var(--ts-violet-soft, #e5e0f6); color: var(--ts-selected-text, #35236a); font-weight: 600; }
    .rf-foot { display: flex; justify-content: flex-end; gap: 10px; }
    .rf-btn { min-height: 38px; padding: 0 16px; border: 1px solid var(--ts-border, #d1d5db); border-radius: 8px; background: var(--ts-surface, #fff); color: inherit; font: inherit; font-weight: 600; cursor: pointer; }
    .rf-primary { border-color: var(--ts-selected-bar, #35236a); background: var(--ts-selected-bar, #35236a); color: #fff; }
    @media (max-width: 560px) { .rf-grid { grid-template-columns: 1fr; } }
  `,
})
export class RoleFormDialog {
  protected readonly t = inject(I18n).t;
  private readonly dialogs = inject(DialogService);
  readonly mode = input.required<RoleFormMode>();
  /** the role to look at / edit / copy */
  readonly roleId = input('');
  readonly saved = output<{ id: string; code: string; lostCount: number }>();
  readonly closed = output();

  protected readonly statuses = STATUSES;
  protected readonly titleId = `rf-title-${++seq}`;
  protected readonly code = signal('');
  protected readonly name = signal('');
  protected readonly nameEn = signal('');
  protected readonly description = signal('');
  protected readonly status = signal<RoleStatus>('draft');
  protected readonly err = signal<{ code?: string; name?: string }>({});
  protected readonly readonly = computed(() => this.mode() === 'view');
  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef);

  protected readonly title = computed(() => {
    const role = roleById(this.roleId());
    if (this.mode() === 'create') return this.t('app.settings.role.form.create');
    if (this.mode() === 'copy') return this.t('app.settings.role.form.copy', role?.code ?? '');
    return role ? `${role.code} · ${role.name}` : '';
  });

  constructor() {
    afterNextRender(() => {
      const role = roleById(this.roleId());
      if (role && this.mode() !== 'create') {
        const copy = this.mode() === 'copy';
        this.code.set(copy ? '' : role.code);
        this.name.set(copy ? `${role.name} (สำเนา)` : role.name);
        this.nameEn.set(role.nameEn);
        this.description.set(role.description);
        this.status.set(copy ? 'draft' : role.status);
      }
      this.host.nativeElement.querySelector<HTMLElement>('input:not([disabled])')?.focus();
    });
  }

  protected save(): void {
    void this.persist();
  }

  private async persist(): Promise<void> {
    const code = this.code().trim();
    const name = this.name().trim();
    const existing = this.mode() === 'edit' ? roleById(this.roleId()) : undefined;
    const taken = roleByCode(code);
    this.err.set({
      code: !code ? 'app.settings.role.form.codeRequired' : taken && taken.id !== existing?.id ? 'app.settings.role.form.codeTaken' : undefined,
      name: !name ? 'app.settings.role.form.nameRequired' : undefined,
    });
    if (this.err().code || this.err().name) return;
    if (existing && existing.status !== this.status()) {
      const lost = lostIfStatus(existing.id, this.status());
      if (lost.length && !(await this.dialogs.confirm({ title: this.t('app.settings.role.lost.title'), text: lostText(this.t, lost), okText: this.t('app.settings.role.lost.ok'), danger: true, icon: 'warning' }))) return;
    }
    const source = this.mode() === 'copy' ? roleById(this.roleId()) : undefined;
    const input: RoleInput = {
      id: existing?.id,
      code,
      name,
      nameEn: this.nameEn(),
      description: this.description(),
      status: this.status(),
      category: source?.category,
      permissions: source?.permissions,
    };
    const result = saveRole(input);
    if (result.ok) this.saved.emit({ id: result.id, code, lostCount: result.lost.length });
  }
}
