import { Injectable, computed, inject, signal } from '@angular/core';
import { AuthService } from '@core/auth/auth.service';
import { persistedState } from '@core/mockup/mockup-datasource';
import {
  type NotificationFilter,
  type NotificationItem,
  type NotificationMarks,
  type NotificationTab,
  bangkokDay,
  seedNotifications,
  unreadCount,
  visibleNotifications,
} from './notification.model';

/** what is kept of the notifications: each user's own read / hidden marks (the notifications themselves are the seed of the mockup) */
interface NotificationState {
  users: Record<string, NotificationMarks>;
}

const FALLBACK_USER = 'guest';
/** the panel opens on the last three months (the range of the design) */
const DEFAULT_RANGE_DAYS = 90;
const MS_PER_DAY = 86_400_000;

/**
 * The bell of the top bar and its panel. The notifications are the mockup's seed (there is no notification API yet); what a user marks read or
 * hidden is kept per user in `state.notifications` (so it is there after a reload, scoped to the company like the other mock state).
 */
@Injectable({ providedIn: 'root' })
export class NotificationService {
  private readonly auth = inject(AuthService);
  private readonly state = persistedState<NotificationState>('notifications', () => ({ users: {} }));
  private readonly all: readonly NotificationItem[] = seedNotifications();
  private readonly version = signal(0);

  readonly panelOpen = signal(false);
  readonly tab = signal<NotificationTab>('all');
  /** `yyyy-MM-dd` or '' */
  readonly from = signal(bangkokDay(new Date(Date.now() - DEFAULT_RANGE_DAYS * MS_PER_DAY)));
  readonly to = signal(bangkokDay(new Date()));

  private readonly marks = computed<NotificationMarks>(() => {
    this.version();
    return this.state.get().users[this.user()] ?? { read: [], hidden: [] };
  });
  readonly unread = computed(() => unreadCount(this.all, this.marks()));
  readonly readIds = computed(() => this.marks().read);
  readonly items = computed(() => {
    const filter: NotificationFilter = { tab: this.tab(), from: this.from(), to: this.to() };
    return visibleNotifications(this.all, this.marks(), filter);
  });

  private user(): string {
    return this.auth.session()?.username || FALLBACK_USER;
  }

  toggle(): void {
    this.panelOpen.update((open) => !open);
  }

  close(): void {
    this.panelOpen.set(false);
  }

  isRead(id: string): boolean {
    return this.marks().read.includes(id);
  }

  markRead(id: string): void {
    this.change((m) => ({ ...m, read: m.read.includes(id) ? m.read : [...m.read, id] }));
  }

  markAllRead(): void {
    this.change((m) => ({ ...m, read: this.all.map((n) => n.id) }));
  }

  hide(id: string): void {
    this.change((m) => ({ ...m, hidden: m.hidden.includes(id) ? m.hidden : [...m.hidden, id] }));
  }

  private change(edit: (marks: NotificationMarks) => NotificationMarks): void {
    const current = this.state.get();
    const user = this.user();
    current.users[user] = edit(current.users[user] ?? { read: [], hidden: [] });
    this.state.touch();
    this.version.update((n) => n + 1);
  }
}
