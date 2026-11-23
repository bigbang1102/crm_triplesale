import { ChangeDetectionStrategy, Component, ViewEncapsulation, computed, inject, signal } from '@angular/core';
import { AuthService } from '@core/auth/auth.service';
import { sharedDbVersion } from '@core/mock/shared-db';
import { ToastService } from '@shared/ui/notify/toast.service';
import { TsIcon } from '@shared/ui/icon/icon';
import { LeadAssignDialog } from './lead-assign-dialog';
import { MASK } from './leads.access';
import { formatPhone } from './leads.format';
import { LeadsStore, dmy, nowThai } from './leads.store';
import { candidatesFor, groupsOf, queueEmployeeName, queueRows, takeFromQueue, type QueueKind, type QueueRow } from '@core/mock/waitlist';
import { ROLE } from '@core/permissions/roles';
import { ActivityGroupMembersDialog } from './activity-group-members-dialog';
import { canGiveFromQueue, canSeeQueuePhone, employeeCodeOf, queueTabs, type QueueTab } from '@core/permissions/waitlist-access';
import { WaitlistGiveDialog } from './waitlist-give-dialog';

/**
 * เมนู Waitlist (`/crm/waitlist`) — คิวของใบที่ยังไม่มีเจ้าของ แยกแท็บตามชนิด: Lead · ลูกค้าเป้าหมาย · โอกาสขาย (flow §2.4, §3.5, §4.7, §5.7).
 * เห็นแท็บเมื่อมี `Pipeline_Wait_list_Access` + `Pipeline_<Doc>_View` · เรียงเก่าสุดก่อน · ทำได้อย่างเดียวคือมอบหมาย:
 * "รับงาน" ให้ตัวเอง หรือ "แจกให้…" คนอื่น (`Pipeline_<Doc>_Assign`, ทีละใบ คนแรกได้) · โอกาสขายมีคิวต่อกลุ่มกิจกรรม (กรองตามกลุ่มได้).
 * FAST-DEBT(REQ): ทุกคนที่มีสิทธิ์ถือว่าเป็นสมาชิก Sharing Group ของคิว Lead (ผู้รับ Prospect/โอกาสขายผ่านชุดสิทธิ์ขั้นต่ำแล้ว) · somyot · 2026-11-20
 */
@Component({
  selector: 'ts-lead-waitlist',
  imports: [TsIcon, LeadAssignDialog, WaitlistGiveDialog, ActivityGroupMembersDialog],
  changeDetection: ChangeDetectionStrategy.OnPush,
  encapsulation: ViewEncapsulation.None,
  providers: [LeadsStore],
  host: { class: 'ts-ds ts-leads', '(document:keydown.escape)': 'escape()' },
  template: `
    <div class="ld-layout">
      <section class="ld-main" aria-labelledby="ld-wl-title">
        <header class="ld-head">
          <h1 id="ld-wl-title">{{ t('app.leads.waitlistTitle') }}</h1>
        </header>
        @if (!tabs().length) {
          <div class="ld-empty"><strong>{{ t('app.leads.notFound') }}</strong></div>
        } @else {
          <div class="ld-bar">
            <div class="ld-pills" role="tablist" [attr.aria-label]="t('app.leads.waitlistTitle')">
              @for (tb of tabs(); track tb) {
                <button type="button" role="tab" class="ld-pill" [class.on]="active() === tb" [attr.aria-selected]="active() === tb" (click)="tab.set(tb)">{{ t('app.leads.waitlistTab.' + tb) }} ({{ countOf(tb) }})</button>
              }
            </div>
            @if (active() === 'opportunity') {
              <label class="ld-sort">{{ t('app.leads.activityGroup') }}
                <span class="ld-select">
                  <select [value]="group()" (change)="onGroup($event)" [attr.aria-label]="t('app.leads.activityGroup')">
                    <option value="0">{{ t('app.leads.allGroups') }}</option>
                    @for (g of myGroups(); track g.id) { <option [value]="g.id">{{ g.name }}</option> }
                  </select>
                </span>
              </label>
              @if (canManageGroups()) {
                <button type="button" class="ld-btn ld-btn-sm" (click)="managing.set(true)"><ts-icon name="user" [size]="14" />{{ t('app.leads.manageGroups') }}</button>
              }
            }
          </div>
          <p class="ld-hint ld-trash-hint">{{ t(active() === 'opportunity' ? (myGroups().length ? 'app.leads.waitlistHintGroup' : 'app.leads.noGroup') : 'app.leads.waitlistHint') }}</p>
          <div class="ld-table-wrap">
            <table class="ld-table">
              <thead>
                <tr>
                  <th>{{ t('app.leads.waitingSince') }}</th>
                  <th>{{ t('app.leads.waiting') }}</th>
                  @if (active() !== 'lead') { <th>{{ t('app.leads.code') }}</th> }
                  <th>{{ t(active() === 'lead' ? 'app.leads.col.name' : 'app.leads.customerName') }}</th>
                  <th>{{ t('app.leads.col.phone') }}</th>
                  @if (active() === 'opportunity') { <th>{{ t('app.leads.activityGroup') }}</th> } @else { <th>{{ t('app.leads.source') }}</th> }
                  <th></th>
                </tr>
              </thead>
              <tbody>
                @if (active() === 'lead') {
                  @for (l of store.queueRows(); track l.id) {
                    <tr>
                      <td>{{ dmy(l.createdDate) }}</td>
                      <td>{{ t('app.leads.days', daysWaiting(l.createdDate)) }}</td>
                      <td class="ld-name">{{ l.name }}</td>
                      <td>{{ phone(l.phoneCode, l.phone) }}</td>
                      <td>{{ l.source }}</td>
                      <td class="ld-row-end">
                        @if (store.menu().take) { <button type="button" class="ld-btn ld-btn-sm ld-btn-primary" (click)="store.take(l.id)">{{ t('app.leads.take') }}</button> }
                        @if (store.menu().give) { <button type="button" class="ld-btn ld-btn-sm" (click)="store.open({ kind: 'assign', mode: 'give', leadId: l.id })"><ts-icon name="user" [size]="14" />{{ t('app.leads.give') }}</button> }
                      </td>
                    </tr>
                  }
                } @else {
                  @for (r of rows(); track r.id) {
                    <tr>
                      <td>{{ dmy(r.since) }}</td>
                      <td>{{ t('app.leads.days', daysWaiting(r.since)) }}</td>
                      <td>{{ r.code }}</td>
                      <td class="ld-name">{{ r.name }}</td>
                      <td>{{ queuePhone(r.phone) }}</td>
                      <td>{{ active() === 'opportunity' ? r.group : r.source }}</td>
                      <td class="ld-row-end">
                        @if (canTake()) { <button type="button" class="ld-btn ld-btn-sm ld-btn-primary" (click)="take(r)">{{ t('app.leads.take') }}</button> }
                        @if (canGive()) { <button type="button" class="ld-btn ld-btn-sm" (click)="giving.set(r)"><ts-icon name="user" [size]="14" />{{ t('app.leads.give') }}</button> }
                      </td>
                    </tr>
                  }
                }
              </tbody>
            </table>
            @if (isEmpty()) {
              <div class="ld-empty"><strong>{{ t('app.leads.waitlistEmpty') }}</strong></div>
            }
          </div>
        }
      </section>
    </div>
    @if (store.dialog()?.kind === 'assign') {
      <ts-lead-assign-dialog />
    }
    @if (managing()) {
      <ts-activity-group-members-dialog (saved)="groupsSaved($event)" (closed)="managing.set(false)" />
    }
    @if (giving(); as g) {
      <ts-waitlist-give-dialog [name]="g.name" [owners]="candidates(g)" (chosen)="give(g, $event)" (closed)="giving.set(null)" />
    }
  `,
  styleUrl: './leads.scss',
})
export class LeadWaitlist {
  protected readonly store = inject(LeadsStore);
  private readonly auth = inject(AuthService);
  private readonly toast = inject(ToastService);
  protected readonly t = this.store.t;
  protected readonly dmy = dmy;
  protected readonly managing = signal(false);
  /** เบอร์ของ Lead สำหรับแสดง: ฟิลด์ที่ถูกปิดตามสิทธิ์ข้อมูลแสดงเป็น `***` */
  protected readonly phone = (code: string, phone: string): string => (phone === MASK ? MASK : formatPhone(code, phone));

  protected readonly tab = signal<QueueTab | null>(null);
  protected readonly group = signal('0');
  protected readonly giving = signal<QueueRow | null>(null);
  /** เพิ่มทุกครั้งที่คิวของลูกค้า/โอกาสขายเปลี่ยน (ข้อมูลอยู่ในฐานร่วม ไม่ใช่ signal) */
  private readonly rev = signal(0);

  protected readonly tabs = computed(() => queueTabs(this.store.viewer()));
  protected readonly active = computed<QueueTab | null>(() => {
    const t = this.tab();
    return t && this.tabs().includes(t) ? t : (this.tabs()[0] ?? null);
  });
  protected readonly rows = computed<QueueRow[]>(() => {
    this.rev();
    sharedDbVersion();
    const a = this.active();
    return a === 'prospect' || a === 'opportunity' ? queueRows(a as QueueKind, a === 'opportunity' ? Number(this.group()) : 0, a === 'opportunity' ? this.employeeCode() : undefined) : [];
  });
  protected readonly canGive = computed(() => {
    const a = this.active();
    return !!a && canGiveFromQueue(this.store.viewer(), a);
  });
  /** "รับ" ให้ตัวเอง: มีสิทธิ์แจก/รับ และมีรหัสพนักงานในผัง */
  protected readonly canTake = computed(() => this.canGive() && this.employeeCode() !== '');
  /** the activity groups the user belongs to: the only opportunity queues they see */
  protected readonly myGroups = computed(() => {
    this.rev();
    sharedDbVersion();
    return groupsOf(this.employeeCode());
  });
  /** Entity Configurator: sets who is in each activity group */
  protected readonly canManageGroups = computed(() => this.store.viewer().has(ROLE.configAll));
  protected readonly isEmpty = computed(() => (this.active() === 'lead' ? this.store.queueRows().length === 0 : this.rows().length === 0));

  protected countOf(tab: QueueTab): number {
    this.rev();
    return tab === 'lead' ? this.store.queueRows().length : queueRows(tab, 0, tab === 'opportunity' ? this.employeeCode() : undefined).length;
  }

  private employeeCode(): string {
    return employeeCodeOf(this.auth.session()?.employeeCode ?? '');
  }

  protected queuePhone(phone: string): string {
    const a = this.active();
    return a && canSeeQueuePhone(this.store.viewer(), a) ? formatPhone('+66', phone) : MASK;
  }

  /** who may be given this one: the members of its activity group (opportunity), every employee (customer) */
  protected candidates(r: QueueRow): { code: string; name: string }[] {
    const a = this.active();
    return a === 'prospect' || a === 'opportunity' ? candidatesFor(a, r.id) : [];
  }

  protected groupsSaved(result: { removed: number; returned: number }): void {
    this.managing.set(false);
    this.group.set('0');
    this.rev.update((n) => n + 1);
    this.toast.success(this.t('app.leads.groupMembersSaved', result.removed, result.returned));
  }

  protected onGroup(e: Event): void {
    this.group.set((e.target as HTMLSelectElement).value);
  }

  /** รับให้ตัวเอง */
  protected take(r: QueueRow): void {
    this.assign(r, this.employeeCode());
  }

  protected give(r: QueueRow, to: string): void {
    this.giving.set(null);
    this.assign(r, to);
  }

  private assign(r: QueueRow, to: string): void {
    const a = this.active();
    if (!a || a === 'lead' || !this.canGive()) return;
    const now = nowThai();
    const result = takeFromQueue(a, r.id, to, this.employeeCode(), `${now.date} ${now.time}`);
    this.rev.update((n) => n + 1);
    if (result === 'ok') this.toast.success(this.t(to === this.employeeCode() ? 'app.leads.takenGeneric' : 'app.leads.givenGeneric', queueEmployeeName(to)));
    else this.toast.error(this.t(result === 'notMember' ? 'app.leads.notMember' : result === 'notReceiver' ? 'app.leads.notReceiver' : 'app.leads.alreadyTaken'));
  }

  /** จำนวนวันที่ใบรออยู่ในคิว (นับจากวันที่เข้าคิว ถึงวันนี้ตามเวลาไทย) */
  protected daysWaiting(since: string): number {
    const today = new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Bangkok' });
    return Math.max(0, Math.round((Date.parse(today) - Date.parse(since)) / 86_400_000));
  }

  protected escape(): void {
    if (this.giving()) this.giving.set(null);
    else if (this.store.dialog()) this.store.open(null);
  }
}
