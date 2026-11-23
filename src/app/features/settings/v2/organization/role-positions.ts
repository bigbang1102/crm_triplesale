import { ChangeDetectionStrategy, Component, computed, inject, output, signal } from '@angular/core';
import { I18n } from '@core/i18n/i18n.service';
import { employeesOfPosition, positionsOf, rolesOf, roleByCode, setPositionRoles } from '@core/mock/role-store';
import {
  RECEIVER_DOCS,
  ROLE_CATALOG,
  canReceive,
  lostReceivers,
  missingForReceiver,
  positionPermissions,
  warningsOf,
  type PositionRecord,
  type RoleRecord,
} from '@core/permissions/role-model';
import { DialogService } from '@shared/ui/notify/dialog.service';
import { ToastService } from '@shared/ui/notify/toast.service';
import { RoleReceive, RoleWarnings, lostText } from './role-warnings';

const short = (code: string): string => code.replace(/^Pipeline_/, '');

/**
 * ตำแหน่งงาน ↔ Role (ตั้งค่า › Role สิทธิ์): ตำแหน่งมีได้หลาย Role — พนักงานทุกคนในตำแหน่งได้สิทธิ์รวมกัน ;
 * แสดงว่า "เป็นผู้รับผิดชอบ Lead / Prospect / Opportunity ได้ไหม" (View + Edit ของเอกสารนั้น) พร้อมสิ่งที่ยังขาด ; เริ่มจากตำแหน่งตัวอย่างได้.
 */
@Component({
  selector: 'ts-role-positions',
  imports: [RoleReceive, RoleWarnings],
  changeDetection: ChangeDetectionStrategy.OnPush,
  styleUrl: './role-positions.scss',
  template: `
    <div class="tools">
      <input class="ts-input q" type="search" [placeholder]="t('app.settings.role.pos.search')" [attr.aria-label]="t('app.settings.role.pos.search')" [value]="query()" (input)="query.set($any($event.target).value)" />
    </div>
    <div class="tw">
      <table class="lt">
        <thead>
          <tr>
            <th>{{ t('app.settings.role.pos.col.code') }}</th>
            <th>{{ t('app.settings.role.pos.col.line') }}</th>
            <th>{{ t('app.settings.role.pos.col.parent') }}</th>
            <th>{{ t('app.settings.role.pos.col.holders') }}</th>
            <th>{{ t('app.settings.role.pos.col.roles') }}</th>
            <th>{{ t('app.settings.role.pos.col.receive') }}</th>
            <th>{{ t('app.settings.role.pos.col.warn') }}</th>
          </tr>
        </thead>
        <tbody>
          @for (r of rows(); track r.position.code) {
            <tr class="row" [class.open]="opened() === r.position.code" (click)="toggle(r.position.code)">
              <td class="code"><span class="chev" aria-hidden="true">›</span> {{ r.position.code }}</td>
              <td>{{ r.position.line }}</td>
              <td>{{ r.position.parent || '–' }}</td>
              <td>{{ r.holders || '–' }}</td>
              <td>
                @if (r.position.roleIds.length) {
                  {{ t('app.settings.role.pos.roleCount', r.position.roleIds.length) }}
                } @else {
                  <span class="badge b-block">{{ t('app.settings.role.pos.noRole') }}</span>
                }
              </td>
              <td><ts-role-receive [set]="r.set" /></td>
              <td>
                @if (r.warnCount) {
                  <span class="badge b-block">⚠ {{ r.warnCount }}</span>
                } @else {
                  –
                }
              </td>
            </tr>
            @if (opened() === r.position.code) {
              <tr class="detail">
                <td colspan="7">
                  <div class="dt">
                    <div class="tpl">
                      <span class="hint">{{ t('app.settings.role.pos.templates') }}</span>
                      @for (tp of templates; track tp.key) {
                        <button type="button" class="ts-btn ts-btn--ghost sm" (click)="applyTemplate(r.position, tp.key)">{{ tp.name }}</button>
                      }
                    </div>
                    <div class="chips">
                      @for (id of r.position.roleIds; track id) {
                        <span class="chip" [class.off]="!isReleased(id)">
                          {{ codeOf(id) }}
                          <button type="button" [attr.aria-label]="t('app.settings.role.pos.removeRole', codeOf(id))" (click)="remove(r.position, id)">×</button>
                        </span>
                      }
                      <select class="ts-input add" [attr.aria-label]="t('app.settings.role.pos.addRole')" (change)="add(r.position, $any($event.target))">
                        <option value="">{{ t('app.settings.role.pos.addRole') }}</option>
                        @for (o of addable(r.position); track o.id) {
                          <option [value]="o.id">{{ o.code }} · {{ o.name }}</option>
                        }
                      </select>
                    </div>
                    @if (suggest(); as sg) {
                      <div class="chips">
                        <span class="hint">{{ t('app.settings.role.pos.optional', sg.name) }}</span>
                        @for (c of sg.codes; track c) {
                          <button type="button" class="ts-btn ts-btn--ghost sm" (click)="addByCode(r.position, c)">+ {{ c }}</button>
                        }
                      </div>
                    }
                    <div class="rhead">
                      <b>{{ t('app.settings.role.pos.result') }}</b>
                      <span class="hint">{{ t('app.settings.role.pos.resultText', r.set.size, r.position.roleIds.length) }}</span>
                    </div>
                    <div class="cards">
                      @for (c of cards(r.position); track c.label) {
                        <div class="card" [class.on]="c.ok">
                          <div class="ch"><span class="dot" aria-hidden="true">{{ c.ok ? '✓' : '✕' }}</span><b>{{ t('app.settings.role.pos.ownerOf', c.label) }}</b></div>
                          <div>{{ t(c.ok ? 'app.settings.role.pos.canText' : 'app.settings.role.pos.cannotText', c.label) }}</div>
                          <div class="cs">{{ c.ok ? t('app.settings.role.pos.from', c.from) : t('app.settings.role.pos.missing', c.missing) }}</div>
                        </div>
                      }
                    </div>
                    @if (inactive(r.position); as bad) {
                      <div class="warnbar">{{ t('app.settings.role.pos.inactive', bad) }}</div>
                    }
                    <ts-role-warnings [items]="warningsOf(r.set)" />
                  </div>
                </td>
              </tr>
            }
          } @empty {
            <tr>
              <td colspan="7" class="empty">{{ t('app.settings.role.pos.empty') }}</td>
            </tr>
          }
        </tbody>
      </table>
    </div>
  `,
})
export class RolePositions {
  protected readonly t = inject(I18n).t;
  private readonly toast = inject(ToastService);
  private readonly dialogs = inject(DialogService);

  /** a role of a position changed: the parent refreshes the list of roles (where the positions are counted) */
  readonly changed = output();

  protected readonly query = signal('');
  protected readonly opened = signal('');
  /** the example position the user started from (its optional roles are offered) */
  private readonly template = signal('');
  private readonly version = signal(0);
  protected readonly templates = ROLE_CATALOG.templates;
  protected readonly warningsOf = warningsOf;

  protected readonly rows = computed(() => {
    this.version();
    const q = this.query().trim().toLowerCase();
    const roles = rolesOf();
    return positionsOf()
      .filter((p) => !q || `${p.code} ${p.line} ${p.parent}`.toLowerCase().includes(q))
      .map((position) => {
        const { set } = positionPermissions(position, roles);
        return { position, set, holders: employeesOfPosition(position.code).map((e) => e.name).join(', '), warnCount: warningsOf(set).length };
      });
  });

  protected readonly suggest = computed(() => {
    const tp = ROLE_CATALOG.templates.find((x) => x.key === this.template());
    return tp ? { name: tp.name, codes: tp.optional } : undefined;
  });

  protected toggle(code: string): void {
    this.opened.update((o) => (o === code ? '' : code));
    this.template.set('');
  }

  protected codeOf = (id: string): string => rolesOf().find((r) => r.id === id)?.code ?? id;
  protected isReleased = (id: string): boolean => rolesOf().find((r) => r.id === id)?.status === 'release';

  protected addable(position: PositionRecord): { id: string; code: string; name: string }[] {
    return rolesOf().filter((r) => r.status === 'release' && !position.roleIds.includes(r.id));
  }

  protected inactive(position: PositionRecord): string {
    return positionPermissions(position, rolesOf())
      .inactive.map((r) => r.code)
      .join(', ');
  }

  /** "can be owner of Lead / Prospect / Opportunity" cards: which Roles give it, or what is missing */
  protected cards(position: PositionRecord): { label: string; ok: boolean; from: string; missing: string }[] {
    const roles = rolesOf();
    const { set } = positionPermissions(position, roles);
    return RECEIVER_DOCS.map((d) => {
      const from = position.roleIds
        .map((id) => roles.find((r) => r.id === id))
        .filter((r): r is RoleRecord => r?.status === 'release' && d.required.some((c) => r.permissions.includes(c)))
        .map((r) => r.code)
        .join(', ');
      return { label: d.label, ok: canReceive(set, d.kind), from, missing: missingForReceiver(set, d.kind).map(short).join(' + ') };
    });
  }

  protected add(position: PositionRecord, select: HTMLSelectElement): void {
    const id = select.value;
    select.value = '';
    if (id) void this.setRoles(position, [...position.roleIds, id]);
  }

  protected addByCode(position: PositionRecord, code: string): void {
    const role = roleByCode(code);
    if (role && !position.roleIds.includes(role.id)) void this.setRoles(position, [...position.roleIds, role.id]);
  }

  protected remove(position: PositionRecord, id: string): void {
    void this.setRoles(position, position.roleIds.filter((x) => x !== id));
  }

  /** replaces every Role by the ones of an example position (the ones the company has not imported are told about) */
  protected applyTemplate(position: PositionRecord, key: string): void {
    const tp = ROLE_CATALOG.templates.find((x) => x.key === key);
    if (!tp) return;
    const have = tp.roles.map(roleByCode).flatMap((r) => (r ? [r.id] : []));
    const missing = tp.roles.length - have.length;
    this.template.set(key);
    void this.setRoles(position, have, this.t('app.settings.role.pos.templateApplied', have.length, tp.name) + (missing ? this.t('app.settings.role.pos.templateMissing', missing) : ''));
  }

  /** saves the Roles of a position, asking first when it could no longer receive work */
  private async setRoles(position: PositionRecord, ids: readonly string[], message?: string): Promise<void> {
    const before = positionsOf();
    const after = before.map((p) => (p.code === position.code ? { ...p, roleIds: ids } : p));
    const lost = lostReceivers(before, rolesOf(), after, rolesOf());
    if (lost.length) {
      const ok = await this.dialogs.confirm({ title: this.t('app.settings.role.lost.title'), text: lostText(this.t, lost), okText: this.t('app.settings.role.lost.ok'), danger: true, icon: 'warning' });
      if (!ok) return;
    }
    setPositionRoles(position.code, ids);
    this.version.update((n) => n + 1);
    this.changed.emit();
    this.toast.success(message ?? this.t('app.settings.role.pos.saved', position.code));
  }
}
