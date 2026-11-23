import { ChangeDetectionStrategy, Component, computed, inject, input, signal } from '@angular/core';
import { Router } from '@angular/router';
import { I18n } from '@core/i18n/i18n.service';
import { DialogService } from '@shared/ui/notify/dialog.service';
import { ToastService } from '@shared/ui/notify/toast.service';
import { deleteSalesDoc, findSalesDoc, updateSalesDoc } from '../sales-doc-store';
import { type SalesDocType } from '../sales-doc-types';

/**
 * A saved sales document (`/sales/docs/:type/:id`, `:id` = its number): what the form showed when it was saved, with the actions the list needs —
 * edit (the columns of the list and the fields of the form), delete. The Java forms only create (there is no load mode and no save API), so this
 * page is the mockup's own way to open a document again; the form itself cannot be re-opened.
 */
@Component({
  selector: 'ts-sales-doc-detail',
  changeDetection: ChangeDetectionStrategy.OnPush,
  styles: `
    :host { display: block; padding: var(--ts-content-pad); }
    .card { border: 1px solid var(--ts-border); border-radius: var(--ts-radius-lg); padding: 16px 20px; margin-bottom: 16px; }
    h1 { font-size: var(--ts-fs-5); margin: 0 0 4px; }
    .sub { color: var(--ts-muted); margin-bottom: 12px; }
    .bar { display: flex; gap: 8px; flex-wrap: wrap; margin-bottom: 16px; }
    button { border: 1px solid var(--ts-border-strong); background: var(--ts-input-bg); color: inherit; border-radius: var(--ts-radius); padding: 6px 14px; cursor: pointer; font: inherit; }
    button.primary { background: var(--ts-primary); color: var(--ts-primary-fg); border-color: var(--ts-primary); }
    button.danger { color: var(--ts-danger); border-color: var(--ts-danger); }
    dl { display: grid; grid-template-columns: minmax(160px, 260px) 1fr; gap: 6px 16px; margin: 0; }
    dt { color: var(--ts-muted); }
    dd { margin: 0; word-break: break-word; }
    input { font: inherit; width: 100%; box-sizing: border-box; padding: 4px 8px; border: 1px solid var(--ts-border-strong); border-radius: var(--ts-radius); background: var(--ts-input-bg); color: inherit; }
    table { width: 100%; border-collapse: collapse; }
    th, td { border-bottom: 1px solid var(--ts-line); padding: 6px 8px; text-align: left; }
    h2 { font-size: var(--ts-fs-4); margin: 0 0 8px; }
  `,
  template: `
    @if (doc(); as d) {
      <h1>{{ d.row.no }}</h1>
      <div class="sub">{{ t('app.salesDoc.detail.savedNote') }}</div>
      <div class="bar">
        <button type="button" (click)="back()">{{ t('app.common.back') }}</button>
        @if (editing()) {
          <button type="button" class="primary" (click)="save()">{{ t('app.salesDoc.detail.save') }}</button>
          <button type="button" (click)="cancel()">{{ t('app.common.cancel') }}</button>
        } @else {
          <button type="button" class="primary" (click)="edit()">{{ t('app.salesDoc.detail.edit') }}</button>
        }
        <button type="button" class="danger" (click)="remove()">{{ t('app.salesDoc.detail.delete') }}</button>
      </div>
      <section class="card">
        <h2>{{ t('app.salesDoc.detail.header') }}</h2>
        <dl>
          @for (c of columns(); track c.key) {
            <dt>
              <label [attr.for]="'sd-col-' + c.key">{{ t(c.label) }}</label>
            </dt>
            <dd>
              @if (editing()) {
                <input [id]="'sd-col-' + c.key" [value]="draft()[c.key]" (input)="setColumn(c.key, $any($event.target).value)" />
              } @else {
                {{ shown(c.key) }}
              }
            </dd>
          }
        </dl>
      </section>
      @if (fields().length) {
        <section class="card">
          <h2>{{ t('app.salesDoc.detail.fields') }}</h2>
          <dl>
            @for (f of fields(); track $index) {
              <dt>
                <label [attr.for]="'sd-f-' + $index">{{ f.label }}</label>
              </dt>
              <dd>
                @if (editing()) {
                  <input [id]="'sd-f-' + $index" [value]="f.value" (input)="setField($index, $any($event.target).value)" />
                } @else {
                  {{ f.value }}
                }
              </dd>
            }
          </dl>
        </section>
      }
      <section class="card">
        <h2>{{ t('app.salesDoc.detail.lines') }}</h2>
        @if (lineRows().length) {
          <table>
            <thead>
              <tr>
                @for (c of lineColumns(); track $index) {
                  <th>{{ c }}</th>
                }
              </tr>
            </thead>
            <tbody>
              @for (r of lineRows(); track $index) {
                <tr>
                  @for (cell of r; track $index) {
                    <td>{{ cell }}</td>
                  }
                </tr>
              }
            </tbody>
          </table>
        } @else {
          <div class="sub">{{ t('app.salesDoc.detail.noLines') }}</div>
        }
      </section>
    } @else {
      <h1>{{ t('app.salesDoc.detail.notFound') }}</h1>
      <div class="bar">
        <button type="button" (click)="back()">{{ t('app.common.back') }}</button>
      </div>
    }
  `,
})
export class SalesDocDetail {
  readonly type = input.required<SalesDocType>();
  readonly no = input.required<string>();
  protected readonly t = inject(I18n).t;
  private readonly router = inject(Router);
  private readonly dialog = inject(DialogService);
  private readonly toast = inject(ToastService);
  private readonly version = signal(0);
  protected readonly editing = signal(false);
  protected readonly draft = signal<Record<string, string>>({});
  private readonly draftFields = signal<{ label: string; value: string }[] | null>(null);

  protected readonly doc = computed(() => {
    this.version();
    return findSalesDoc(this.type(), this.no());
  });
  protected readonly columns = computed(() => [
    { key: 'date', label: 'label.qt.quote_date' },
    { key: 'customer', label: 'label.pqt.customer' },
    ...(this.type() === 'bk' ? [{ key: 'ref', label: 'app.salesDoc.detail.ref' }] : []),
    { key: 'employee', label: 'label.qt.quote_employee' },
    { key: 'total', label: 'label.sv.grand' },
    { key: 'status', label: 'label.template.status' },
  ]);
  protected readonly fields = computed(() => this.draftFields() ?? this.doc()?.snapshot?.fields ?? []);
  protected readonly lineColumns = computed(() => this.doc()?.snapshot?.lines.columns ?? []);
  protected readonly lineRows = computed(() => this.doc()?.snapshot?.lines.rows ?? []);

  protected shown(key: string): string {
    const v = (this.doc()?.row as unknown as Record<string, unknown> | undefined)?.[key];
    return v === undefined || v === null || v === '' ? '-' : String(v);
  }

  protected edit(): void {
    const row = this.doc()?.row as unknown as Record<string, unknown> | undefined;
    this.draft.set(Object.fromEntries(this.columns().map((c) => [c.key, row?.[c.key] === undefined ? '' : String(row[c.key])])));
    this.draftFields.set((this.doc()?.snapshot?.fields ?? []).map((f) => ({ ...f })));
    this.editing.set(true);
  }

  protected cancel(): void {
    this.editing.set(false);
    this.draftFields.set(null);
  }

  protected setColumn(key: string, value: string): void {
    this.draft.update((d) => ({ ...d, [key]: value }));
  }

  protected setField(index: number, value: string): void {
    this.draftFields.update((fs) => (fs ?? []).map((f, i) => (i === index ? { ...f, value } : f)));
  }

  protected save(): void {
    const d = this.draft();
    const total = d['total'] ?? '';
    const numeric = Number(total.replace(/,/g, ''));
    const fields = this.draftFields();
    const row = updateSalesDoc(this.type(), this.no(), {
      date: d['date'],
      customer: d['customer'],
      employee: d['employee'],
      status: d['status'],
      total: total !== '' && Number.isFinite(numeric) ? numeric : total,
      ...(fields ? { fields } : {}),
    });
    if (!row) return;
    this.editing.set(false);
    this.draftFields.set(null);
    this.version.update((n) => n + 1);
    this.toast.success(this.t('app.salesDoc.detail.saved'));
  }

  protected async remove(): Promise<void> {
    const ok = await this.dialog.confirm({
      title: this.t('app.salesDoc.detail.deleteTitle'),
      text: `${this.no()} — ${this.t('app.salesDoc.detail.deleteText')}`,
      danger: true,
      icon: 'warning',
    });
    if (!ok) return;
    deleteSalesDoc(this.type(), this.no());
    this.toast.success(this.t('app.salesDoc.detail.deleted'));
    this.back();
  }

  protected back(): void {
    void this.router.navigate(['/sales/docs', this.type()]);
  }
}
