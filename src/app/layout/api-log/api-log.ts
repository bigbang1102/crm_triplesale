import { ChangeDetectionStrategy, Component, ElementRef, OnDestroy, ViewEncapsulation, computed, effect, inject, signal, untracked, viewChild } from '@angular/core';
import { AuthService } from '@core/auth/auth.service';
import { TokenStore } from '@core/auth/token.store';
import { ConfigService } from '@core/config/config.service';
import { claimsOf } from '@core/auth/keycloak';
import { ApiLogEntry, ApiLogService, BODY_LIMIT, TokenEvent, clipBody, clock, curlOrigin } from '@core/http/api-log.service';
import type { AuthCall } from '@core/http/auth-trace';
import { PermissionService } from '@core/permissions/permission.service';
import { SUPER_ADMIN_ALIASES } from '@core/permissions/roles';

type Tab = 'api' | 'roles' | 'tokens';

/** a row of the list: the call, and whether the page heading goes above it */
interface Row {
  d: ApiLogEntry;
  head: boolean;
}

/** what the "สิทธิ์" tab shows (Java: `GET /board/api-log?view=roles`) */
interface RolesView {
  username: string;
  superAdmin: boolean;
  /** the roles that make the user a super admin — listed first */
  superNames: readonly string[];
  roles: readonly string[];
}

const AUTO_MS = 3000;
/** how much of the window must stay on the screen when it is dragged (Java: 120 × 60 px) */
const KEEP_X = 120;
const KEEP_Y = 60;

/** `shortUrl` of api_log.xhtml: the path of a URL, the host left out */
const shortUrl = (u: string): string => /^https?:\/\/[^/]+(\/.*)$/.exec(u)?.[1] ?? u;

/** `pretty` of api_log.xhtml: JSON text indented, anything else as it is, '(ว่าง)' when empty */
function pretty(s: string): string {
  const t = s.trim();
  if (!t) return '(ว่าง)';
  if (t.startsWith('{') || t.startsWith('[')) {
    try {
      return JSON.stringify(JSON.parse(t), null, 2);
    } catch {
      /* not JSON after all: shown as it is */
    }
  }
  return t;
}

const byName = (a: string, b: string): number => {
  const x = a.toLowerCase();
  const y = b.toLowerCase();
  return x < y ? -1 : x > y ? 1 : 0;
};

/**
 * The "Log การเรียก API" window — `web/WEB-INF/pages/api_log.xhtml` of the Java app (Log UI v4), opened by the "Log" button of the top bar
 * (`ApiLogService.open()` ↔ `algOpen()`): a dark overlay with a panel that can be dragged by its head (double click = back to the middle,
 * the place is kept while the page is open), two tabs —
 *
 *   API ที่ยิงออกไป      every REST call of the page (`ApiLogService`), grouped under the page they belong to, filtered by page and by text,
 *                      a click on a row opens the servlet, the URL, both bodies and the curl (with the Bearer token) to copy into Postman;
 *                      "อัตโนมัติ" re-reads the list every 3 seconds, "ล้าง" empties it
 *   สิทธิ์ของผู้ใช้ (Role)  the roles the session holds (`/me/roles` of the sign-in), the super-admin ones first, searchable
 *
 * Differences that cannot be avoided: there is no server in between, so the calls are the ones the browser made itself and "เรียกจาก servlet"
 * is the servlet URL the page asked of the live backend (api-via.ts, empty when it is not known). The CSS is the one of api_log.xhtml
 * (`api-log.scss`, global on purpose: every class starts with `alg-`).
 */
@Component({
  selector: 'ts-api-log',
  changeDetection: ChangeDetectionStrategy.OnPush,
  encapsulation: ViewEncapsulation.None,
  templateUrl: './api-log.html',
  styleUrl: './api-log.scss',
  host: { '(document:keydown.escape)': 'onEscape()' },
})
export class ApiLogWindow implements OnDestroy {
  protected readonly log = inject(ApiLogService);
  private readonly auth = inject(AuthService);
  private readonly perm = inject(PermissionService);
  private readonly config = inject(ConfigService);
  private readonly tokens = inject(TokenStore);
  private readonly panel = viewChild<ElementRef<HTMLElement>>('panel');

  protected readonly tab = signal<Tab>('api');
  /** the list as it was when it was last read (Java: `DATA` — a new call shows after "รีเฟรช" / "อัตโนมัติ") */
  protected readonly data = signal<readonly ApiLogEntry[]>([]);
  protected readonly rolesView = signal<RolesView | null>(null);
  protected readonly page = signal('');
  protected readonly search = signal('');
  protected readonly roleSearch = signal('');
  /** the rows whose detail is open (Java: `OPEN`) */
  protected readonly openRows = signal<ReadonlySet<number>>(new Set());
  protected readonly auto = signal(false);
  /** the key of the copy button that just copied (curl-<#> / a token) */
  protected readonly copied = signal('');
  /** where the window was dragged to: distance from the middle of the screen */
  protected readonly pos = signal({ x: 0, y: 0 });

  /** the pages that have calls, in the order they first appear, with how many (the dropdown) */
  protected readonly pages = computed(() => {
    const counts = new Map<string, number>();
    for (const d of this.data()) counts.set(d.page, (counts.get(d.page) ?? 0) + 1);
    return [...counts].map(([name, n]) => ({ name, n }));
  });

  protected readonly rows = computed<Row[]>(() => {
    const page = this.page();
    const q = this.search().trim().toLowerCase();
    const list = this.data().filter((d) => {
      if (page && d.page !== page) return false;
      if (!q) return true;
      return `${d.url} ${d.method} ${d.via} ${this.reqText(d)} ${this.resText(d)}`.toLowerCase().includes(q);
    });
    return list.map((d, i) => ({ d, head: i === 0 || list[i - 1].page !== d.page }));
  });

  /** the roles that match the search of the "สิทธิ์" tab (all of them when it is empty) */
  protected readonly shownRoles = computed(() => {
    const q = this.roleSearch().trim().toLowerCase();
    const roles = this.rolesView()?.roles ?? [];
    return roles.map((name) => ({ name, hit: !!q && name.toLowerCase().includes(q), show: !q || name.toLowerCase().includes(q) }));
  });

  protected readonly count = computed(() => {
    if (this.tab() === 'roles') return String(this.shownRoles().filter((r) => r.show).length);
    if (this.tab() === 'tokens') return String(this.log.tokenEvents().length);
    return `${this.rows().length} / ${this.data().length}`;
  });

  private timer: ReturnType<typeof setInterval> | null = null;

  constructor() {
    effect(() => {
      const open = this.log.isOpen();
      untracked(() => {
        document.body.style.overflow = open ? 'hidden' : '';
        if (open) this.refresh();
        else this.stopAuto();
      });
    });
  }

  ngOnDestroy(): void {
    this.stopAuto();
    document.body.style.overflow = '';
  }

  /* ------------------------------------------------------------------ what a row shows */
  protected readonly short = shortUrl;
  protected readonly pretty = pretty;

  protected statusClass(status: number): string {
    return status >= 200 && status < 300 ? 'ok' : status >= 400 && status < 500 ? 'warn' : 'err';
  }

  /** the URL of the call as the API sees it (Java: the full upstream URL) */
  protected fullUrl(d: ApiLogEntry): string {
    return `${curlOrigin(d.url, this.config, location.origin)}${d.url}`;
  }

  protected reqText(d: ApiLogEntry): string {
    return clipBody(d.reqBody, BODY_LIMIT);
  }

  protected resText(d: ApiLogEntry): string {
    return d.resBody;
  }

  /** the curl with the access token of this tab — made when it is shown, never kept in the entry */
  protected curlOf(d: ApiLogEntry): string {
    return this.log.curl(d, curlOrigin(d.url, this.config, location.origin), this.tokens.read()?.accessToken);
  }

  /* ------------------------------------------------------------------ the buttons */
  protected close(): void {
    this.log.close();
  }

  protected onOverlay(event: MouseEvent): void {
    if (event.target === event.currentTarget) this.close();
  }

  protected onEscape(): void {
    if (this.log.isOpen()) this.close();
  }

  protected setTab(tab: Tab): void {
    this.tab.set(tab);
    if (tab !== 'api') this.stopAuto();
    this.refresh();
  }

  /** "รีเฟรช" — shared by both tabs */
  protected refresh(): void {
    if (this.tab() === 'roles') this.loadRoles();
    else if (this.tab() === 'api') this.loadApi(); // the Token tab shows the list as it is, always
  }

  protected toggleAuto(): void {
    if (this.timer) {
      this.stopAuto();
      return;
    }
    this.timer = setInterval(() => this.loadApi(), AUTO_MS);
    this.auto.set(true);
    this.loadApi();
  }

  protected clear(): void {
    this.log.clear();
    this.data.set([]);
    this.openRows.set(new Set());
    this.page.set('');
  }

  protected toggleRow(seq: number): void {
    this.openRows.update((open) => {
      const next = new Set(open);
      if (!next.delete(seq)) next.add(seq);
      return next;
    });
  }

  protected copy(d: ApiLogEntry): Promise<void> {
    return this.copyText(this.curlOf(d), `curl-${d.id}`);
  }

  /** copies `text`; the button that has `key` says "คัดลอกแล้ว" for a moment */
  protected async copyText(text: string, key: string): Promise<void> {
    try {
      await navigator.clipboard.writeText(text);
    } catch {
      if (!this.copyFallback(text)) return; // the user can still copy from the box
    }
    this.copied.set(key);
    setTimeout(() => this.copied.update((k) => (k === key ? '' : k)), 1400);
  }

  /* ------------------------------------------------------------------ the "Token" tab (not in the Java Log) */
  /** whether this is the token the tab sends now (a later refresh makes the earlier ones history) */
  protected isCurrentToken(t: TokenEvent): boolean {
    return this.tokens.read()?.accessToken === t.accessToken;
  }

  /** when the access token ends: `HH:mm:ss.SSS` of issue time + `expires_in` */
  protected expiresAt(t: TokenEvent): string {
    return clock(new Date(t.issuedAt + t.expiresIn * 1000));
  }

  /** the curl of one call of the sign-in (see ApiLogService.authCurl) */
  protected authCurl(c: AuthCall): string {
    return this.log.authCurl(c);
  }

  protected sourceLabel(t: TokenEvent): string {
    return t.source === 'keycloak' ? 'Keycloak' : 'auth service (POST /auth/login)';
  }

  /** what the access token says (its payload, indented); a token that is not a JWT says so */
  protected claimsText(t: TokenEvent): string {
    const claims = claimsOf(t.accessToken);
    return Object.keys(claims).length ? JSON.stringify(claims, null, 2) : '(ไม่ใช่ JWT — อ่านข้อมูลในตัว token ไม่ได้)';
  }

  /** for a context where the clipboard API is not available (a page opened over http that is not localhost) */
  private copyFallback(text: string): boolean {
    const ta = document.createElement('textarea');
    ta.value = text;
    ta.style.cssText = 'position:fixed;left:-9999px;top:0;';
    document.body.appendChild(ta);
    ta.select();
    try {
      return document.execCommand('copy');
    } catch {
      return false;
    } finally {
      document.body.removeChild(ta);
    }
  }

  /* ------------------------------------------------------------------ the two tabs read their data */
  private loadApi(): void {
    this.data.set(this.log.entries());
    // the page that was chosen has no call any more: back to "ทุกหน้า"
    if (this.page() && !this.pages().some((p) => p.name === this.page())) this.page.set('');
  }

  private loadRoles(): void {
    const session = this.auth.session();
    const roles = [...(session?.roles ?? [])].sort(byName);
    const isSuper = (r: string) => SUPER_ADMIN_ALIASES.has(r.trim().toLowerCase());
    const superNames = roles.filter(isSuper);
    this.rolesView.set({
      username: session?.username ?? '',
      superAdmin: this.perm.isSuperAdmin(),
      superNames,
      roles: [...superNames, ...roles.filter((r) => !isSuper(r))],
    });
  }

  private stopAuto(): void {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
    this.auto.set(false);
  }

  protected isSuperName(role: string): boolean {
    return this.rolesView()?.superNames.includes(role) ?? false;
  }

  /* ------------------------------------------------------------------ drag the window by its head */
  protected onHeadPointerDown(event: PointerEvent): void {
    // a button / field / dropdown of the head is used, not dragged
    if ((event.target as HTMLElement).closest('button, input, select, a') || event.button !== 0) return;
    const head = event.currentTarget as HTMLElement;
    const panel = this.panel()?.nativeElement;
    if (!panel) return;
    const start = { x: event.clientX, y: event.clientY };
    const base = this.pos();
    head.setPointerCapture(event.pointerId);
    document.body.classList.add('alg-dragging');

    const move = (ev: PointerEvent) => {
      // keep at least 120 × 60 px of the window on the screen, or it could not be got back
      const r = panel.getBoundingClientRect();
      const curX = r.left - this.pos().x;
      const curY = r.top - this.pos().y;
      const minX = -(curX + r.width - KEEP_X);
      const maxX = window.innerWidth - curX - KEEP_X;
      const minY = -curY;
      const maxY = window.innerHeight - curY - KEEP_Y;
      this.pos.set({
        x: Math.max(minX, Math.min(maxX, base.x + (ev.clientX - start.x))),
        y: Math.max(minY, Math.min(maxY, base.y + (ev.clientY - start.y))),
      });
    };
    const up = () => {
      head.releasePointerCapture(event.pointerId);
      head.removeEventListener('pointermove', move);
      head.removeEventListener('pointerup', up);
      head.removeEventListener('pointercancel', up);
      document.body.classList.remove('alg-dragging');
    };
    head.addEventListener('pointermove', move);
    head.addEventListener('pointerup', up);
    head.addEventListener('pointercancel', up);
    event.preventDefault();
  }

  /** double click on the head = back to the middle of the screen */
  protected onHeadDblClick(event: MouseEvent): void {
    if (!(event.target as HTMLElement).closest('button, input, select, a')) this.pos.set({ x: 0, y: 0 });
  }
}
