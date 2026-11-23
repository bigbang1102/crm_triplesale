import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { FormControl, FormGroup, ReactiveFormsModule } from '@angular/forms';
import { I18n } from '@core/i18n/i18n.service';
import { AI_TOOL_ROLE } from '@core/permissions/ai-hub-roles';
import { ToastService } from '@shared/ui/notify/toast.service';
import { AiAdminApi } from './ai-admin.api';
import {
  SCOPE_NONE,
  describeError,
  formatDateTime,
  formatNumber,
  monthOf,
  type ScopeRef,
} from './ai-admin.logic';
import type { AuditFilter, AuditResponse, DownloadedFile } from './ai-admin.types';
import { AsyncState } from './parts/aad-async';
import { AadScopePicker } from './parts/aad-scope-picker';

const PAGE_SIZE = 50;
const DAY_CHOICES = [1, 7, 30, 90] as const;
const DEFAULT_DAYS = 7;
const REVOKE_DELAY_MS = 1000;

/** Page 3 — audit of the real usage of every user (token numbers only), with filters, paging, CSV export and admin actions. */
@Component({
  selector: 'ts-ai-admin-audit',
  imports: [AadScopePicker, ReactiveFormsModule],
  templateUrl: './ai-admin-audit.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AiAdminAudit {
  protected readonly t = inject(I18n).t;
  private readonly api = inject(AiAdminApi);
  private readonly toast = inject(ToastService);

  protected readonly formatNumber = formatNumber;
  protected readonly formatDateTime = formatDateTime;
  protected readonly dayChoices = DAY_CHOICES;
  protected readonly toolIds = Object.keys(AI_TOOL_ROLE);
  /** only used to feed the picker's option lists (the audit itself has no month) */
  protected readonly month = monthOf(new Date());
  protected readonly canExport = this.api.canExport;

  protected readonly scope = signal<ScopeRef>(SCOPE_NONE);
  protected readonly offset = signal(0);
  protected readonly exporting = signal(false);
  protected readonly state = new AsyncState<AuditResponse>(this.t);
  protected readonly data = this.state.data;
  protected readonly form = new FormGroup({
    days: new FormControl<number>(DEFAULT_DAYS, { nonNullable: true }),
    tool: new FormControl('', { nonNullable: true }),
    q: new FormControl('', { nonNullable: true }),
  });

  protected readonly range = computed(() => {
    const data = this.data();
    if (!data || data.total === 0) return '';
    return this.t(
      'app.aiAdmin.audit.range',
      formatNumber(data.offset + 1),
      formatNumber(data.offset + data.rows.length),
      formatNumber(data.total),
    );
  });
  protected readonly hasPrev = computed(() => this.offset() > 0);
  protected readonly hasNext = computed(() => {
    const data = this.data();
    return !!data && data.offset + data.rows.length < data.total;
  });

  constructor() {
    void this.load();
  }

  protected search(): void {
    this.offset.set(0);
    void this.load();
  }

  protected onDays(value: string): void {
    this.form.controls.days.setValue(Number(value) || DEFAULT_DAYS);
  }

  protected onTool(value: string): void {
    this.form.controls.tool.setValue(value);
  }

  protected page(direction: 1 | -1): void {
    this.offset.set(Math.max(0, this.offset() + direction * PAGE_SIZE));
    void this.load();
  }

  protected async download(): Promise<void> {
    if (this.exporting()) return;
    this.exporting.set(true);
    try {
      saveFile(await this.api.auditExport(this.filter(0)));
      this.toast.success(this.t('app.aiAdmin.audit.exported'));
    } catch (error) {
      this.toast.error(describeError(error, this.t));
    } finally {
      this.exporting.set(false);
    }
  }

  private load(): Promise<void> {
    return this.state.run(() => this.api.audit(this.filter(this.offset())));
  }

  private filter(offset: number): AuditFilter {
    const { company, department, user } = this.scope();
    const { days, tool, q } = this.form.getRawValue();
    return {
      days,
      company: company?.code ?? '',
      department: department?.code ?? '',
      user: user?.code ?? '',
      tool,
      q: q.trim(),
      limit: PAGE_SIZE,
      offset,
    };
  }
}

/** hand a downloaded blob to the browser */
function saveFile(file: DownloadedFile): void {
  const url = URL.createObjectURL(file.blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = file.fileName;
  document.body.append(anchor);
  anchor.click();
  anchor.remove();
  setTimeout(() => URL.revokeObjectURL(url), REVOKE_DELAY_MS);
}
