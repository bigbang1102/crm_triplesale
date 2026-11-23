import { ChangeDetectionStrategy, Component, computed, inject, input, output, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { AuthService } from '@core/auth/auth.service';
import { I18n } from '@core/i18n/i18n.service';
import { SEED_GROUPS, isKnownLead, isKnownProspect, seedLead, seedProspect } from '@core/mock/crm-seed';
import { sharedDbVersion } from '@core/mock/shared-db';
import { type QueueKind, candidatesFor, groupIdOfOpportunity, reassign, historyOf, isInQueue, ownerOf, queueEmployeeName, queueEntryOf, returnToQueue } from '@core/mock/waitlist';
import { PermissionService } from '@core/permissions/permission.service';
import { ownerBarActions, queueTabs, employeeCodeOf } from '@core/permissions/waitlist-access';
import { ToastService } from '../notify/toast.service';
import { QueueAssignDialog } from './queue-assign-dialog';

/**
 * Who has this customer / opportunity — and what the person may do about it (flow §4.7 · §5.7): the owner, or "in the Wait List since …";
 * "เปลี่ยนผู้รับผิดชอบ" and "คืนเข้าคิว" (`Pipeline_<Doc>_Change_Assign`, for the owner or a head of the owner); the history of the assignments.
 * A customer / opportunity in the queue can only be given to someone (the Waitlist page) — here it shows that and the way there.
 * Shown only for a customer / opportunity of the mock (`isKnownProspect` / `isKnownLead`): the live pages have no queue API yet.
 * FAST-DEBT(API): the queue lives in the shared mock database (core/mock/waitlist.ts) · somyot · 2026-11-20
 */
@Component({
  selector: 'ts-queue-owner-bar',
  imports: [RouterLink, QueueAssignDialog],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @if (known()) {
      <div class="qb" role="group" [attr.aria-label]="t('app.queue.owner')">
        <span class="qb-owner">
          {{ t('app.queue.owner') }}:
          @if (inQueue()) {
            <b class="qb-queue">{{ t('app.queue.inQueue') }}</b> <span class="qb-muted">({{ t('app.queue.since', since()) }})</span>
          } @else {
            <b>{{ ownerLabel() }}</b>
          }
          @if (groupName()) { <span class="qb-muted"> · {{ t('app.leads.activityGroup') }}: {{ groupName() }}</span> }
        </span>
        @if (inQueue()) {
          <span class="qb-muted">{{ t('app.queue.inQueueHint') }}</span>
          @if (canSeeQueue()) { <a class="qb-link" routerLink="/crm/waitlist">{{ t('app.queue.openWaitlist') }}</a> }
        }
        @if (actions().changeOwner) { <button type="button" class="qb-btn" (click)="dialog.set('change')">{{ t('app.leads.changeOwner') }}</button> }
        @if (actions().returnToQueue) { <button type="button" class="qb-btn" (click)="dialog.set('return')">{{ t('app.leads.returnToQueue') }}</button> }
        <button type="button" class="qb-link" [attr.aria-expanded]="showHistory()" (click)="showHistory.set(!showHistory())">{{ t('app.leads.assignHistory') }} ({{ history().length }})</button>
      </div>
      @if (showHistory()) {
        <ul class="qb-history">
          @for (h of history(); track $index) {
            <li><b>{{ t('app.leads.hist.' + h.action) }}</b> {{ move(h.fromCode, h.toCode, h.action) }}@if (h.reason) { — {{ t('app.leads.reason') }}: {{ h.reason }} }<span class="qb-muted"> · {{ h.at }}@if (h.byCode) { · {{ h.byCode }} }</span></li>
          } @empty {
            <li class="qb-muted">{{ t('app.leads.noAssignHistory') }}</li>
          }
        </ul>
      }
      @if (dialog(); as mode) {
        <ts-queue-assign-dialog [mode]="mode" [name]="name()" [currentOwner]="owner()" [owners]="candidates()" (confirmed)="confirm(mode, $event)" (closed)="dialog.set(null)" />
      }
    }
  `,
  styles: `
    :host { display: block; }
    .qb { display: flex; flex-wrap: wrap; align-items: center; gap: 10px 14px; padding: 8px 14px; border: 1px solid var(--ts-line, #eaeaea); border-radius: 10px; background: var(--ts-surface, #fff); color: var(--ts-text, #383838); font-size: 13px; }
    .qb-owner { margin-right: auto; }
    .qb-queue { color: var(--ts-amber-ink, #8a5a00); }
    .qb-muted { color: var(--ts-text-secondary, #7c848d); }
    .qb-btn { min-height: 32px; padding: 0 12px; border: 1px solid var(--ts-border, #d1d5db); border-radius: 8px; background: transparent; color: inherit; font: inherit; font-weight: 600; cursor: pointer; }
    .qb-link { padding: 0; border: 0; background: transparent; color: var(--ts-primary-fg, #35236a); font: inherit; font-weight: 600; text-decoration: underline; cursor: pointer; }
    .qb-history { margin: 6px 0 0; padding: 8px 14px 8px 28px; border: 1px solid var(--ts-line, #eaeaea); border-radius: 10px; background: var(--ts-surface, #fff); color: var(--ts-text, #383838); font-size: 13px; }
  `,
})
export class QueueOwnerBar {
  readonly kind = input.required<QueueKind>();
  /** the id of the customer / opportunity (a route parameter: text) */
  readonly id = input.required<string>();
  /** the owner changed or the item went to the queue: a page that shows the owner / locks its buttons reads it again */
  readonly changed = output();

  protected readonly t = inject(I18n).t;
  private readonly perm = inject(PermissionService);
  private readonly auth = inject(AuthService);
  private readonly toast = inject(ToastService);

  protected readonly dialog = signal<'change' | 'return' | null>(null);
  protected readonly showHistory = signal(false);
  /** bumped after a write: the data is in the shared mock database, not in a signal */
  private readonly rev = signal(0);

  private readonly num = computed(() => (/^\d+$/.test(this.id()) ? Number(this.id()) : 0));
  protected readonly known = computed(() => (this.kind() === 'prospect' ? isKnownProspect(this.num()) : isKnownLead(this.num())));

  private readonly state = computed(() => {
    this.rev();
    sharedDbVersion();
    const kind = this.kind();
    const id = this.num();
    return { inQueue: isInQueue(kind, id), owner: ownerOf(kind, id), since: queueEntryOf(kind, id)?.since ?? '', history: historyOf(kind, id) };
  });
  protected readonly inQueue = computed(() => this.state().inQueue);
  protected readonly owner = computed(() => this.state().owner);
  protected readonly since = computed(() => this.state().since.split('-').reverse().join('/'));
  protected readonly history = computed(() => this.state().history);
  protected readonly ownerLabel = computed(() => queueEmployeeName(this.owner()));
  /** the activity group of an opportunity (its queue and its members) */
  protected readonly groupName = computed(() => (this.kind() === 'opportunity' && this.known() ? (SEED_GROUPS.find((g) => g.id === groupIdOfOpportunity(this.num()))?.name ?? '') : ''));
  /** who may own it: the members of its activity group (opportunity) · every employee (customer) */
  protected readonly candidates = computed(() => {
    this.rev();
    sharedDbVersion();
    return candidatesFor(this.kind(), this.num());
  });
  protected readonly name = computed(() => (this.kind() === 'prospect' ? seedProspect(this.num()).fullName : seedLead(this.num()).customerName));
  protected readonly canSeeQueue = computed(() => queueTabs(this.perm).includes(this.kind() === 'prospect' ? 'prospect' : 'opportunity'));
  protected readonly actions = computed(() => ownerBarActions(this.perm, this.kind(), this.owner(), this.employeeCode(), this.inQueue()));

  private employeeCode(): string {
    return employeeCodeOf(this.auth.session()?.employeeCode ?? '');
  }

  protected move(from: string, to: string, action: string): string {
    if (action === 'queueIn') return '';
    const who = (c: string): string => (c ? queueEmployeeName(c) : this.t('app.leads.queueName'));
    return `${who(from)} → ${who(to)}`;
  }

  protected confirm(mode: 'change' | 'return', value: { owner: string; reason: string }): void {
    const now = new Date();
    const date = now.toLocaleDateString('en-CA', { timeZone: 'Asia/Bangkok' });
    const time = now.toLocaleTimeString('en-GB', { timeZone: 'Asia/Bangkok', hour: '2-digit', minute: '2-digit', hour12: false });
    const at = `${date} ${time}`;
    const by = this.employeeCode();
    const result = mode === 'change' ? reassign(this.kind(), this.num(), value.owner, by, at, value.reason) : returnToQueue(this.kind(), this.num(), by, at, value.reason);
    this.dialog.set(null);
    this.rev.update((n) => n + 1);
    this.changed.emit();
    if (result === 'ok') this.toast.success(mode === 'change' ? this.t('app.leads.ownerChanged', queueEmployeeName(value.owner)) : this.t('app.queue.returned'));
    else this.toast.error(this.t(result === 'closed' ? 'app.queue.closed' : result === 'notMember' ? 'app.queue.notMember' : result === 'notReceiver' ? 'app.queue.notReceiver' : 'app.queue.cannot'));
  }
}
