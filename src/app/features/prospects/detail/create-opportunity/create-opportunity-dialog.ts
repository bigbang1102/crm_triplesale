import { ChangeDetectionStrategy, Component, computed, inject, input, output, signal } from '@angular/core';
import { I18n } from '@core/i18n/i18n.service';
import { SEED_EMPLOYEES } from '@core/mock/crm-seed';
import { type CreateOpportunityResult, createOpportunity, openOpportunitiesOf } from '@core/mock/opportunity-create';
import type { PipelineChoice } from '../../prospects.mock';

/**
 * "สร้าง Opportunity" of the customer page (opportunity-complete-design.md §6.1): the pipeline (the sales line), the person in charge (a member of the
 * first group of that pipeline) and the sales person — all three are needed. The rules are those of `core/mock/opportunity-create.ts`; the answer is
 * shown in the dialog, and the new opportunity's number is handed back so the page can open it.
 */
@Component({
  selector: 'ts-create-opportunity-dialog',
  changeDetection: ChangeDetectionStrategy.OnPush,
  styles: `
    .backdrop { position: fixed; inset: 0; background: rgba(0, 0, 0, 0.4); display: flex; align-items: center; justify-content: center; z-index: 1000; }
    .box { background: var(--ts-surface); color: var(--ts-text); border-radius: var(--ts-radius-lg); padding: 20px 24px; width: min(440px, calc(100vw - 32px)); box-shadow: var(--ts-shadow-lg, 0 8px 32px rgba(0, 0, 0, 0.25)); }
    h2 { margin: 0 0 4px; font-size: var(--ts-fs-4); }
    .hint { color: var(--ts-muted); margin: 0 0 12px; }
    .warn { color: var(--ts-warn, var(--ts-muted)); margin: 0 0 12px; }
    label { display: block; margin: 10px 0 4px; }
    select { width: 100%; padding: 6px 8px; border: 1px solid var(--ts-border-strong); border-radius: var(--ts-radius); background: var(--ts-input-bg); color: inherit; font: inherit; }
    .error { color: var(--ts-danger); margin-top: 10px; }
    .bar { display: flex; justify-content: flex-end; gap: 8px; margin-top: 16px; }
    button { border: 1px solid var(--ts-border-strong); background: var(--ts-input-bg); color: inherit; border-radius: var(--ts-radius); padding: 6px 14px; cursor: pointer; font: inherit; }
    button.primary { background: var(--ts-primary); color: #fff; border-color: var(--ts-primary); }
  `,
  template: `
    <div class="backdrop" (click)="closed.emit()">
      <div class="box" role="dialog" aria-modal="true" aria-labelledby="co-title" (click)="$event.stopPropagation()" (keydown.escape)="closed.emit()">
        <h2 id="co-title">{{ t('app.prospects.createOpportunity') }}</h2>
        <p class="hint">{{ t('app.prospects.createOpportunityHint') }}</p>
        @if (open() > 0) {
          <p class="warn" role="status">{{ t('app.prospects.createOpportunityOpenWarn') }} ({{ open() }})</p>
        }
        <label for="co-pipeline">{{ t('app.prospects.createOpportunityPipeline') }}</label>
        <select id="co-pipeline" [value]="pipelineId()" (change)="choosePipeline($any($event.target).value)">
          <option value="">—</option>
          @for (c of choices(); track c.id) {
            <option [value]="c.id">{{ c.name }}</option>
          }
        </select>
        <label for="co-responsible">{{ t('app.prospects.createOpportunityResponsible') }}</label>
        <select id="co-responsible" [value]="responsible()" (change)="chooseResponsible($any($event.target).value)">
          <option value="">—</option>
          @for (m of members(); track m.code) {
            <option [value]="m.code">{{ m.code }} {{ m.name }}</option>
          }
        </select>
        <label for="co-sale">{{ t('app.prospects.createOpportunitySalePerson') }}</label>
        <select id="co-sale" [value]="salePerson()" (change)="salePerson.set($any($event.target).value)">
          <option value="">—</option>
          @for (e of employees; track e.code) {
            <option [value]="e.code">{{ e.code }} {{ e.name }}</option>
          }
        </select>
        @if (error()) {
          <div class="error" role="alert">{{ error() }}</div>
        }
        <div class="bar">
          <button type="button" (click)="closed.emit()">{{ t('app.common.cancel') }}</button>
          <button type="button" class="primary" (click)="save()">{{ t('app.prospects.createOpportunity') }}</button>
        </div>
      </div>
    </div>
  `,
})
export class CreateOpportunityDialog {
  readonly prospectId = input.required<number>();
  readonly choices = input.required<readonly PipelineChoice[]>();
  readonly closed = output<void>();
  readonly created = output<number>();
  protected readonly t = inject(I18n).t;
  protected readonly employees = SEED_EMPLOYEES;
  protected readonly pipelineId = signal('');
  protected readonly responsible = signal('');
  protected readonly salePerson = signal('');
  protected readonly error = signal('');
  protected readonly open = computed(() => openOpportunitiesOf(this.prospectId()));
  private readonly chosen = computed(() => this.choices().find((c) => String(c.id) === this.pipelineId()));
  protected readonly members = computed(() => this.chosen()?.members ?? []);

  protected choosePipeline(id: string): void {
    this.pipelineId.set(id);
    this.responsible.set('');
  }

  /** the person in charge is the sales person too, unless somebody else was chosen (design 6.1: the system fills it, it can be changed) */
  protected chooseResponsible(code: string): void {
    if (this.salePerson() === '' || this.salePerson() === this.responsible()) this.salePerson.set(code);
    this.responsible.set(code);
  }

  protected save(): void {
    const pick = this.chosen();
    const result = createOpportunity({
      prospectId: this.prospectId(),
      pipelineId: pick?.id ?? null,
      firstGroupId: pick?.firstGroupId ?? null,
      responsibleCode: this.responsible(),
      salePersonCode: this.salePerson(),
    });
    if (result.ok) this.created.emit(result.opportunityId);
    else this.error.set(this.messageOf(result));
  }

  private messageOf(result: Exclude<CreateOpportunityResult, { ok: true }>): string {
    if (result.code === 'NOT_FOUND') return this.t('app.prospects.createOpportunityNotFound');
    if (result.code === 'PROSPECT_NOT_AVAILABLE') return this.t('app.prospects.createOpportunityQueued');
    return this.t('app.prospects.createOpportunityMissing');
  }
}
