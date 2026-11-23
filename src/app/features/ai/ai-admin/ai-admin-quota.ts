import {
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  Injector,
  afterNextRender,
  computed,
  effect,
  inject,
  input,
  output,
  signal,
  untracked,
} from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { FormControl, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { I18n } from '@core/i18n/i18n.service';
import { DialogService } from '@shared/ui/notify/dialog.service';
import { ToastService } from '@shared/ui/notify/toast.service';
import { AiAdminApi } from './ai-admin.api';
import {
  SCOPE_NONE,
  describeError,
  formatNumber,
  formatPercent,
  scopeNameOf,
  type ScopeRef,
} from './ai-admin.logic';
import type { QuotaInfo, QuotaLevel, QuotaListResponse, QuotaRow } from './ai-admin.types';
import { AsyncState } from './parts/aad-async';
import { AadQuotaBar } from './parts/aad-quota-bar';
import { AadScopePicker } from './parts/aad-scope-picker';

const LEVELS: readonly QuotaLevel[] = ['COMPANY', 'DEPARTMENT', 'USER'];
const DEFAULT_WARN = 80;
const DEPTH_OF: Record<QuotaLevel, 1 | 2 | 3> = { COMPANY: 1, DEPARTMENT: 2, USER: 3 };

/**
 * Quota management of the detail page: a table of the monthly token quotas of every level (used / remaining / % / status) and,
 * for a user who holds the quota-manage right, the add / edit / delete form. Others see the table only.
 */
@Component({
  selector: 'ts-ai-admin-quota',
  imports: [AadQuotaBar, AadScopePicker, ReactiveFormsModule],
  templateUrl: './ai-admin-quota.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AiAdminQuota {
  readonly month = input.required<string>();
  /** the scope chosen on the page — the form starts on it */
  readonly scope = input<ScopeRef>(SCOPE_NONE);
  /** a quota was saved or deleted (the page reloads its numbers) */
  readonly changed = output<void>();

  protected readonly t = inject(I18n).t;
  private readonly api = inject(AiAdminApi);
  private readonly dialog = inject(DialogService);
  private readonly toast = inject(ToastService);
  private readonly injector = inject(Injector);
  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef);

  protected readonly formatNumber = formatNumber;
  protected readonly formatPercent = formatPercent;
  protected readonly levels = LEVELS;
  protected readonly canEdit = computed(() => this.api.caps().quotaAdmin);
  protected readonly filter = signal<QuotaLevel | ''>('');
  protected readonly state = new AsyncState<QuotaListResponse>(this.t);
  protected readonly rows = computed(() => {
    const filter = this.filter();
    return (this.state.data()?.quotas ?? []).filter((q) => !filter || q.level === filter);
  });

  /** the key picker value of the form and the row being edited (the key of an existing quota cannot change) */
  protected readonly target = signal<ScopeRef>(SCOPE_NONE);
  protected readonly editing = signal<QuotaRow | null>(null);
  /** the add / edit form is a popup: open from the "add" button or the pen of a row */
  protected readonly formOpen = signal(false);
  protected readonly saving = signal(false);
  protected readonly formError = signal('');
  protected readonly form = new FormGroup({
    level: new FormControl<QuotaLevel>('DEPARTMENT', { nonNullable: true }),
    monthlyTokens: new FormControl<number | null>(null, [Validators.required, Validators.min(1)]),
    warnPercent: new FormControl<number>(DEFAULT_WARN, {
      nonNullable: true,
      validators: [Validators.required, Validators.min(1), Validators.max(100)],
    }),
    enabled: new FormControl(true, { nonNullable: true }),
    note: new FormControl('', { nonNullable: true }),
  });
  protected readonly formLevel = signal<QuotaLevel>('DEPARTMENT');
  protected readonly depth = computed(() => DEPTH_OF[this.formLevel()]);

  constructor() {
    effect(() => {
      const month = this.month();
      untracked(() => void this.load(month));
    });
    effect(() => {
      const scope = this.scope();
      untracked(() => {
        if (!this.editing() && scope.company) this.startAdd(scope);
      });
    });
    this.form.controls.level.valueChanges
      .pipe(takeUntilDestroyed())
      .subscribe((level) => this.onLevel(level));
  }

  protected reload(): void {
    void this.load(this.month());
  }

  protected onFilter(value: string): void {
    this.filter.set(LEVELS.find((l) => l === value) ?? '');
  }

  protected infoOf(quota: QuotaRow): QuotaInfo {
    return {
      limit: quota.monthlyTokens,
      used: quota.used,
      remaining: quota.remaining,
      percent: quota.percent,
      warnPercent: quota.warnPercent,
      enabled: quota.enabled,
      level: quota.level,
    };
  }

  protected whereOf(row: QuotaRow): string {
    return [row.company?.name, row.department?.name]
      .filter((v): v is string => !!v && v !== row.name)
      .join(' › ');
  }

  protected openAdd(): void {
    this.editing.set(null);
    this.formError.set('');
    this.startAdd(this.scope());
    this.showForm();
  }

  protected edit(row: QuotaRow): void {
    this.editing.set(row);
    this.formError.set('');
    this.formLevel.set(row.level);
    this.form.setValue({
      level: row.level,
      monthlyTokens: row.monthlyTokens,
      warnPercent: row.warnPercent,
      enabled: row.enabled,
      note: row.note,
    });
    this.target.set({
      company: row.company,
      department: row.level === 'COMPANY' ? null : row.department,
      user: row.level === 'USER' ? { code: row.key, name: row.name } : null,
    });
    this.showForm();
  }

  /** opens the popup and puts the cursor in it (so Esc closes it and the keyboard stays inside) */
  private showForm(): void {
    this.formOpen.set(true);
    afterNextRender(
      () =>
        this.host.nativeElement
          .querySelector<HTMLElement>('.aad-modal select:not([disabled]), .aad-modal input')
          ?.focus(),
      { injector: this.injector },
    );
  }

  /** closes the popup without saving (the button, Esc, a click on the dark area) */
  protected closeForm(): void {
    if (this.saving()) return;
    this.formOpen.set(false);
    this.editing.set(null);
    this.formError.set('');
    this.startAdd(this.scope());
  }

  private startAdd(scope: ScopeRef): void {
    const level: QuotaLevel = scope.user ? 'USER' : scope.department ? 'DEPARTMENT' : 'COMPANY';
    this.formLevel.set(level);
    this.form.reset({
      level,
      monthlyTokens: null,
      warnPercent: DEFAULT_WARN,
      enabled: true,
      note: '',
    });
    this.target.set(scope);
  }

  private onLevel(level: QuotaLevel): void {
    if (this.editing()) return;
    this.formLevel.set(level);
    // keep only as much of the choice as the new level needs
    const { company, department, user } = this.target();
    this.target.set({
      company,
      department: level === 'COMPANY' ? null : department,
      user: level === 'USER' ? user : null,
    });
  }

  /** the picked scope names exactly the level of the form (an employee for USER …) */
  protected readonly targetReady = computed(() => {
    const { company, department, user } = this.target();
    const level = this.formLevel();
    return level === 'COMPANY'
      ? !!company
      : level === 'DEPARTMENT'
        ? !!company && !!department
        : !!company && !!department && !!user;
  });

  protected async save(): Promise<void> {
    this.form.markAllAsTouched();
    if (this.form.invalid || !this.targetReady() || this.saving()) return;
    const target = this.target();
    const value = this.form.getRawValue();
    const level = this.formLevel();
    const key =
      level === 'COMPANY'
        ? target.company?.code
        : level === 'DEPARTMENT'
          ? target.department?.code
          : target.user?.code;
    this.saving.set(true);
    this.formError.set('');
    try {
      await this.api.quotaSave({
        level,
        key: key ?? '',
        company: target.company?.code ?? '',
        department: level === 'COMPANY' ? undefined : target.department?.code,
        monthlyTokens: Math.round(Number(value.monthlyTokens)),
        warnPercent: value.warnPercent,
        enabled: value.enabled,
        note: value.note.trim(),
      });
      this.toast.success(this.t('app.aiAdmin.quota.saved'));
      this.saving.set(false);
      this.closeForm();
      this.reload();
      this.changed.emit();
    } catch (error) {
      this.formError.set(describeError(error, this.t));
    } finally {
      this.saving.set(false);
    }
  }

  protected async remove(row: QuotaRow): Promise<void> {
    const confirmed = await this.dialog.confirm({
      title: this.t('app.aiAdmin.quota.deleteTitle'),
      text: this.t('app.aiAdmin.quota.deleteText', row.name),
      okText: this.t('app.aiAdmin.quota.delete'),
      cancelText: this.t('app.aiAdmin.cancel'),
      danger: true,
    });
    if (!confirmed) return;
    try {
      await this.api.quotaDelete({
        level: row.level,
        key: row.key,
        company: row.company?.code ?? '',
      });
      this.toast.success(this.t('app.aiAdmin.quota.deleted'));
      this.reload();
      this.changed.emit();
    } catch (error) {
      this.toast.error(describeError(error, this.t));
    }
  }

  protected readonly targetName = computed(() => scopeNameOf(this.target()));

  private async load(month: string): Promise<void> {
    await this.state.run(() => this.api.quotaList(month));
  }
}
