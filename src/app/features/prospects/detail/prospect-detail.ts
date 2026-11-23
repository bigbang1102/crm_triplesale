import { NgTemplateOutlet } from '@angular/common';
import { ChangeDetectionStrategy, Component, computed, DestroyRef, effect, inject, Injector, input, signal, untracked, viewChild } from '@angular/core';
import { Router } from '@angular/router';
import { ConfigService } from '@core/config/config.service';
import { browserFileUrl } from '@core/http/file-url';
import { I18n } from '@core/i18n/i18n.service';
import { retryEmptyOptions } from '@core/live/prospect-options.live';
import { restDepsOf } from '@core/live/rest-deps';
import type { AccessButtonCode } from '@core/permissions/access-buttons';
import { PermissionService } from '@core/permissions/permission.service';
import { ROLE } from '@core/permissions/roles';
import { AuthService } from '@core/auth/auth.service';
import type { ProspectDoc } from '../prospects.docs';
import { prospectSession, ProspectFormView as ProspectFormBean } from '../form/prospect-form.bean';
import type { ProspectFormBackend } from '../form/prospect-form-backend';
import { ProspectFormService } from '../form/prospect-form.service';
import { QueueOwnerBar } from '@shared/ui/queue-owner/queue-owner-bar';
import { isKnownProspect } from '@core/mock/crm-seed';
import { isInQueue } from '@core/mock/waitlist';
import { ProspectDocsView } from './docs/prospect-docs-view';
import { ProspectHistory } from './history/prospect-history';
import { mockProspectHistory, type ProspectHistoryEntry } from './history/prospect-history.model';
import type { PipelineChoice } from '../prospects.mock';
import { CreateOpportunityDialog } from './create-opportunity/create-opportunity-dialog';
import { ProspectOpportunities } from './opportunities/prospect-opportunities';
import { mockProspectOpportunities, type ProspectOpportunity } from './opportunities/prospect-opportunities.model';
import { ProspectExtraView } from './extra/prospect-extra-view';
import {
  codeAndName,
  customerKind,
  dash,
  dmy,
  socialChannels,
  usageStatus,
} from './prospect-detail.format';

type Tab = 'main' | 'extra' | 'docs' | 'opps' | 'history';

/**
 * Prospect detail route (`/crm/prospects/:id/detail`) — the read-only page of one prospect (no form). It reads the same services the
 * prospect form's view mode did: the bean (`ProspectFormBean`, `action_type = view`) for the record, `/board/prospect?id=` for the extra
 * info and the documents of the form. Add / edit stay on `/crm/prospects/:id` (prospect-form); the edit button goes there.
 *
 * No API exists yet for: the opportunities of a prospect, the edit history, the date a social account was connected, and the
 * waitlist / suspend / delete actions — those parts show an empty state / a disabled item (see docs/integration/prospect-form.md).
 */
@Component({
  selector: 'ts-prospect-detail',
  imports: [NgTemplateOutlet, CreateOpportunityDialog, ProspectExtraView, ProspectDocsView, ProspectOpportunities, ProspectHistory, QueueOwnerBar],
  templateUrl: './prospect-detail.html',
  styleUrl: './prospect-detail.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ProspectDetail {
  /** route parameter `:id` */
  readonly id = input.required<string>();
  /** query parameter `trash=1`: the record is one of the TRASH (the link of the "deleted" tab of the list): it is read from `GET /prospects/trash/{id}` */
  readonly trash = input<string>('');
  protected readonly isTrash = computed(() => this.trash() === '1');

  protected readonly t = inject(I18n).t;
  protected readonly perm = inject(PermissionService);
  private readonly router = inject(Router);
  private readonly config = inject(ConfigService);
  private readonly auth = inject(AuthService);
  private readonly injector = inject(Injector);
  private destroyed = false;

  protected readonly ROLE = ROLE;
  protected readonly loading = signal(true);
  protected readonly failed = signal(false);
  protected readonly tab = signal<Tab>('main');
  protected readonly menuOpen = signal(false);
  protected readonly collapsed = signal<Record<string, boolean>>({});
  protected readonly docs = signal<ProspectDoc[]>([]);
  /** the opportunities of the prospect: no API yet (E07 of prospect-endpoints-v2.html), so the sample data in both modes */
  protected readonly opportunities = signal<ProspectOpportunity[]>([]);
  /** the edit history of the prospect: no API yet, so the sample data in both modes */
  protected readonly history = signal<ProspectHistoryEntry[]>([]);
  /** the extra-info tab is built the first time it is opened and then kept (what was typed stays when another tab is shown) */
  protected readonly extraOpened = signal(false);
  /** the documents tab is built the first time it is opened too */
  protected readonly docsOpened = signal(false);
  /** `commonBean.uploadAcceptExt`: the `accept` of the file input of the documents tab */
  protected readonly uploadAcceptExt = signal('');
  protected readonly extraView = viewChild(ProspectExtraView);
  /** bumped when the bean changes: the page is OnPush and the bean is a plain object */
  private readonly version = signal(0);
  private bean: ProspectFormBean | undefined;
  private backendRef: ProspectFormBackend | undefined;

  constructor() {
    inject(DestroyRef).onDestroy(() => (this.destroyed = true));
    // another prospect / another language = read it again (Java reloads the page on a language switch)
    const i18n = inject(I18n);
    effect(() => {
      const id = this.id();
      i18n.lang();
      untracked(() => void this.load(id));
    });
  }

  /* ------------------------------------------------------------------------------------------------------------------ data */
  protected async backend(): Promise<ProspectFormBackend> {
    if (this.config.value.mock) return (await import('../form/prospect-form.mock')).createMockProspectForm({ delayMs: 0 });
    return (await import('../form/prospect-form.live')).createLiveProspectFormBackend(restDepsOf(this.injector), undefined, { trash: this.trash() === '1' });
  }

  private async load(id: string): Promise<void> {
    retryEmptyOptions(); // a new visit: the lists that came empty last time are asked again
    this.loading.set(true);
    this.failed.set(false);
    try {
      const backend = await this.backend();
      this.backendRef = backend;
      void backend.initial().then((i) => this.uploadAcceptExt.set(i.uploadAcceptExt));
      const s = this.auth.session();
      const two = (n: number): string => String(n).padStart(2, '0');
      const bean = new ProspectFormBean(new ProspectFormService(backend.api), {
        user: s?.employeeId ? { id: s.employeeId, code: s.employeeCode, name: s.profileName } : undefined,
        today: () => {
          const d = new Date();
          return `${d.getFullYear()}-${two(d.getMonth() + 1)}-${two(d.getDate())}`;
        },
        ctxPath: '',
        // the record carries its own names; the old master lists (countries, provinces, marketing-channels) are not asked
        masterLists: false,
        docProxy: (url) => this.fileUrl(url),
        session: prospectSession,
        onChange: () => this.version.update((n) => n + 1),
      });
      await bean.init({ action_type: 'view', id });
      if (this.destroyed || id !== this.id()) return;
      // the new service has uuids (no numeric id): the record is there when it has a code or a name
      const found = bean.contractBean;
      if (!(found.id || found.customer_code || found.customer_name)) {
        this.failed.set(true);
        this.loading.set(false);
        return;
      }
      this.bean = bean;
      this.version.update((n) => n + 1);
      this.loading.set(false);
      // the documents tab (the form loaded them with its own script)
      // FAST-DEBT(API): ยังไม่มี API ของ OPP ของ prospect และประวัติการแก้ไข · ใช้ข้อมูลจำลองแม้โหมด live (ค่าที่เห็นไม่ใช่ข้อมูลจริง) · เมื่อมี API ให้ต่อแทน mockProspectOpportunities / mockProspectHistory · somyot · 2026-11-19
      this.opportunities.set(mockProspectOpportunities());
      this.history.set(mockProspectHistory());
      // `init()` has read them already (they came with the record): no second call
      this.docs.set([...bean.prospectDocs]);
    } catch {
      if (!this.destroyed) {
        this.failed.set(true);
        this.loading.set(false);
      }
    }
  }

  /* ------------------------------------------------------------------------------------------------------------- view model */
  /** the record (re-read when the bean changes) */
  protected readonly c = computed(() => {
    this.version();
    return this.bean?.contractBean;
  });
  protected readonly kind = computed(() => (this.c() ? customerKind(this.c()!) : 'person'));
  protected readonly status = computed(() => (this.c() ? usageStatus(this.c()!) : 'release'));
  protected readonly avatar = computed(() => {
    this.version();
    const raw = this.c()?.avatar;
    return raw && this.bean ? this.bean.avatarSrc(raw) : '';
  });
  protected readonly phone = computed(() => (this.c() && this.bean ? dash(this.bean.telWithCode(this.c()!.tel)) : '-'));
  protected readonly owner = computed(() => (this.c() ? codeAndName(this.c()!.salepersoncode, this.c()!.salepersonname) : '-'));
  protected readonly social = computed(() => (this.c() ? socialChannels(this.c()!) : []));
  protected readonly canViewPage = computed(() => this.perm.has(ROLE.pipelineProspectView));
  protected readonly canExtra = computed(() => this.perm.has(ROLE.pipelineProspectView));
  /** the three items of the "⋮" menu: each is a role check; the icon is drawn when the user holds any of them */
  /** the customer waits in the Wait List: it cannot be edited and gets no opportunity until it is given to someone (flow §4.7) */
  protected readonly queued = computed(() => {
    this.version();
    return /^\d+$/.test(this.id()) && isKnownProspect(Number(this.id())) && isInQueue('prospect', Number(this.id()));
  });

  protected onQueueChanged(): void {
    this.version.update((n) => n + 1);
  }
  protected readonly canSuspend = computed(() => this.perm.has(ROLE.pipelineProspectEdit));
  protected readonly canTrash = computed(() => this.perm.has(ROLE.pipelineProspectTrash));
  // a record of the trash cannot be edited, sent to a queue, suspended or deleted again: the buttons are not there
  protected readonly canMenu = computed(() => !this.isTrash() && (this.canSuspend() || this.canTrash()));
  protected readonly canOpps = computed(() => this.perm.has(ROLE.pipelineOpportunityView));
  protected readonly canDocs =computed(() => this.perm.has(ROLE.pipelineProspectAttachmentView));

  /** the Font Awesome class of a channel (the form's own: fab fa-line · fa-facebook · fa-instagram; X is an svg) */
  protected socialIcon(key: string): string {
    return { line: 'fab fa-line', facebook: 'fab fa-facebook', instagram: 'fab fa-instagram' }[key] ?? 'fas fa-link';
  }

  /** the address of a stored file for the browser (through the dev proxy when the host of the file is the UAT one — see core/http/file-url.ts) */
  protected fileUrl(url: string): string {
    return browserFileUrl(url, this.config.value.apiOrigin, location);
  }

  /** the picture did not load: the default one, as the form and the list do (`onerror` → default_avatar.svg) */
  protected avatarFailed(ev: Event): void {
    const img = ev.target as HTMLImageElement;
    console.warn('[prospect-detail] the picture did not load:', img.currentSrc || img.src);
    if (!img.src.endsWith('default_avatar.svg')) img.src = this.defaultAvatar;
  }

  protected readonly defaultAvatar = 'assets/images/icon/default_avatar.svg';
  protected dash = dash;
  protected dmy = dmy;

  /** the button registry (core/permissions/access-buttons.ts): may the user use the button */
  protected access(code: string): boolean {
    return this.perm.canUse(code as AccessButtonCode);
  }

  /* ------------------------------------------------------------------------------------------------------------------ actions */
  protected back(): void {
    void this.router.navigateByUrl('/crm/prospects');
  }
  protected edit(): void {
    void this.router.navigate(['/crm/prospects', this.id()], { queryParams: { action_type: 'edit' } });
  }
  /** the "create opportunity" dialog (sample data only: the real service has no such call yet) */
  protected readonly creating = signal(false);
  protected pipelines: PipelineChoice[] = [];
  protected readonly prospectNumber = computed(() => Number(this.id()));
  protected readonly canCreateOpportunity = computed(() => this.config.value.mock && Number.isInteger(this.prospectNumber()) && this.prospectNumber() > 0);

  protected async openCreateOpportunity(): Promise<void> {
    this.pipelines = (await import('../prospects.mock')).pipelineChoices();
    this.creating.set(true);
  }

  protected opportunityCreated(id: number): void {
    this.creating.set(false);
    void this.router.navigate(['/crm/opportunities', id]);
  }

  /** "ไปหน้าโอกาสขาย": the page of the opportunity */
  protected openOpportunity(id: string): void {
    void this.router.navigate(['/crm/opportunities', id]);
  }
  protected selectTab(tab: Tab): void {
    if (tab === 'extra') this.extraOpened.set(true);
    if (tab === 'docs') this.docsOpened.set(true);
    this.tab.set(tab);
  }
  /** the requests of the extra-info script: the BFF contract goes to the backend of the page (the form's `fetchBrowser`), anything else is the network */
  protected readonly extraRequest = (input: string, init?: RequestInit): Promise<Response> => {
    const url = String(input).replace(/^\.\.\//, '/');
    return url.startsWith('/board/') || url.startsWith('/docproxy') ? this.backendRef!.fetch(url, init) : fetch(input, init);
  };
  /** `rc_reloadProspectDocs`: the list again (after an upload) */
  protected async reloadDocs(): Promise<void> {
    if (!this.bean) return;
    await this.bean.loadProspectDocs();
    this.docs.set([...this.bean.prospectDocs]);
  }
  /** `rc_deleteProspectDoc`: the bean deletes the document (`docNo` of the request) and reads the list again */
  protected async removeDoc(no: string): Promise<void> {
    if (!this.bean) return;
    this.bean.request['docNo'] = no;
    await this.bean.deleteProspectDocument();
    this.docs.set([...this.bean.prospectDocs]);
  }
  protected readonly provinces = computed(() => {
    this.version();
    return this.bean?.listProvinceBean ?? [];
  });
  /** the "อัปเดตข้อมูล" button under the form of the extra-info tab */
  protected saveExtra(): void {
    void this.extraView()?.save();
  }
  protected toggle(section: string): void {
    this.collapsed.update((m) => ({ ...m, [section]: !m[section] }));
  }
  protected isOpen(section: string): boolean {
    return !this.collapsed()[section];
  }
  protected toggleMenu(): void {
    this.menuOpen.update((v) => !v);
  }
  protected closeMenu(): void {
    this.menuOpen.set(false);
  }
}
