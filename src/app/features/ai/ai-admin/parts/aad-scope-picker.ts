import {
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  inject,
  input,
  model,
  signal,
  untracked,
} from '@angular/core';
import { I18n } from '@core/i18n/i18n.service';
import { AiAdminApi } from '../ai-admin.api';
import { SCOPE_NONE, type ScopeRef } from '../ai-admin.logic';
import type { NameRef, OverviewRequest } from '../ai-admin.types';

/**
 * Company → department → employee choice with the same hierarchy as the drill-down of page 1. The deepest select that has a value
 * is the scope. `depth` = how many selects (1 company, 2 + department, 3 + employee). The options come from `overview`.
 * Native selects (`data-ods-skip`): the options change from code, which the shell's dropdown conversion does not redraw.
 */
@Component({
  selector: 'ts-aad-scope-picker',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="aad-picker" role="group" [attr.aria-label]="t('app.aiAdmin.picker.label')">
      <label>
        <span>{{ t('app.aiAdmin.picker.company') }}</span>
        <select data-ods-skip="1" (change)="pickCompany($any($event.target).value)">
          @if (!value().company || !autoSelect()) {
            <option value="" [selected]="!value().company">
              {{
                autoSelect() ? t('app.aiAdmin.picker.choose') : t('app.aiAdmin.picker.allCompanies')
              }}
            </option>
          }
          @for (c of companies(); track c.code) {
            <option [value]="c.code" [selected]="c.code === value().company?.code">
              {{ c.name }}
            </option>
          }
        </select>
      </label>
      @if (depth() >= 2) {
        <label>
          <span>{{ t('app.aiAdmin.picker.department') }}</span>
          <select
            data-ods-skip="1"
            [disabled]="!value().company"
            (change)="pickDepartment($any($event.target).value)"
          >
            <option value="" [selected]="!value().department">
              {{ t('app.aiAdmin.picker.allDepartments') }}
            </option>
            @for (d of departments(); track d.code) {
              <option [value]="d.code" [selected]="d.code === value().department?.code">
                {{ d.name }}
              </option>
            }
          </select>
        </label>
      }
      @if (depth() >= 3) {
        <label>
          <span>{{ t('app.aiAdmin.picker.employee') }}</span>
          <select
            data-ods-skip="1"
            [disabled]="!value().department"
            (change)="pickUser($any($event.target).value)"
          >
            <option value="" [selected]="!value().user">
              {{ t('app.aiAdmin.picker.allEmployees') }}
            </option>
            @for (u of users(); track u.code) {
              <option [value]="u.code" [selected]="u.code === value().user?.code">
                {{ u.name }}
              </option>
            }
          </select>
        </label>
      }
      @if (failed()) {
        <span class="aad-error" role="alert">{{ t('app.aiAdmin.err.picker') }}</span>
      }
    </div>
  `,
})
export class AadScopePicker {
  readonly month = input.required<string>();
  readonly depth = input<1 | 2 | 3>(3);
  /** pick the first company when none is set (the detail page needs one); off = "all companies" is a valid choice (audit filter) */
  readonly autoSelect = input(true);
  readonly value = model<ScopeRef>(SCOPE_NONE);

  protected readonly t = inject(I18n).t;
  private readonly api = inject(AiAdminApi);
  protected readonly companies = signal<NameRef[]>([]);
  protected readonly departments = signal<NameRef[]>([]);
  protected readonly users = signal<NameRef[]>([]);
  protected readonly failed = signal(false);

  private readonly companyCode = computed(() => this.value().company?.code ?? '');
  private readonly departmentCode = computed(() => this.value().department?.code ?? '');

  constructor() {
    effect(() => {
      const month = this.month();
      untracked(() => void this.loadCompanies(month));
    });
    effect(() => {
      const company = this.companyCode();
      const month = this.month();
      untracked(() => void this.loadDepartments(month, company));
    });
    effect(() => {
      const department = this.departmentCode();
      const company = this.companyCode();
      const month = this.month();
      untracked(() => void this.loadUsers(month, company, department));
    });
  }

  protected pickCompany(code: string): void {
    const company = this.companies().find((c) => c.code === code) ?? null;
    this.value.set({ company, department: null, user: null });
  }

  protected pickDepartment(code: string): void {
    const department = this.departments().find((d) => d.code === code) ?? null;
    this.value.set({ company: this.value().company, department, user: null });
  }

  protected pickUser(code: string): void {
    const user = this.users().find((u) => u.code === code) ?? null;
    this.value.set({ ...this.value(), user });
  }

  private async options(request: OverviewRequest): Promise<NameRef[]> {
    try {
      const response = await this.api.overview(request);
      this.failed.set(false);
      return response.rows.map((row) => ({ code: row.key, name: row.name }));
    } catch {
      this.failed.set(true);
      return [];
    }
  }

  private async loadCompanies(month: string): Promise<void> {
    const list = await this.options({ month, level: 'company' });
    this.companies.set(list);
    const only = list[0];
    if (this.autoSelect() && !this.value().company && only)
      this.value.set({ company: only, department: null, user: null });
  }

  private async loadDepartments(month: string, company: string): Promise<void> {
    this.departments.set(
      this.depth() >= 2 && company
        ? await this.options({ month, level: 'department', company })
        : [],
    );
  }

  private async loadUsers(month: string, company: string, department: string): Promise<void> {
    this.users.set(
      this.depth() >= 3 && company && department
        ? await this.options({ month, level: 'user', company, department })
        : [],
    );
  }
}
