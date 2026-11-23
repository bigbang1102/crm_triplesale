import { ChangeDetectionStrategy, Component, ElementRef, effect, inject, viewChild } from '@angular/core';
import { I18n } from '@core/i18n/i18n.service';
import { TsIcon } from '../icon/icon';
import { DialogService } from './dialog.service';

@Component({
  selector: 'ts-dialog-host',
  imports: [TsIcon],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { '(document:keydown.escape)': 'cancel()' },
  template: `
    @if (dialog.state(); as d) {
      <div class="backdrop" (click)="onBackdrop($event)">
        <div class="box" role="alertdialog" aria-modal="true" aria-labelledby="ts-dlg-title">
          <span class="badge" [class.danger]="d.danger || d.icon === 'error' || d.icon === 'warning'" [class.success]="d.icon === 'success'">
            <ts-icon [name]="d.danger || d.icon === 'error' || d.icon === 'warning' ? 'alert' : d.icon === 'success' ? 'check' : 'info'" [size]="26" />
          </span>
          <h2 id="ts-dlg-title">{{ d.title }}</h2>
          @if (d.text) {
            <p>{{ d.text }}</p>
          }
          @if (d.kind === 'prompt') {
            <input
              #field
              class="field"
              type="text"
              [attr.placeholder]="d.placeholder ?? null"
              (keydown.enter)="accept()"
            />
          }
          <div class="actions">
            @if (d.kind !== 'alert') {
              <button class="btn ghost" (click)="dialog.close(false)">{{ d.cancelText ?? t('app.common.cancel') }}</button>
            }
            <button #ok class="btn" [class.danger]="d.danger" (click)="accept()">
              {{ d.okText ?? t('app.common.ok') }}
            </button>
          </div>
        </div>
      </div>
    }
  `,
  styles: `
    .backdrop {
      position: fixed;
      inset: 0;
      z-index: var(--ts-z-dialog);
      display: grid;
      place-items: center;
      padding: 16px;
      background: rgba(17, 20, 24, 0.55);
      animation: fade 0.15s ease-out;
    }
    .box {
      width: min(400px, 100%);
      padding: 28px 24px 20px;
      border-radius: var(--ts-radius);
      background: var(--ts-surface);
      box-shadow: var(--ts-shadow-pop);
      text-align: center;
    }
    .badge {
      display: inline-grid;
      place-items: center;
      width: 52px;
      height: 52px;
      margin-bottom: 12px;
      border-radius: 50%;
      background: color-mix(in srgb, var(--ts-info) 14%, transparent);
      color: var(--ts-info);
    }
    .badge.success {
      background: color-mix(in srgb, var(--ts-accent) 14%, transparent);
      color: var(--ts-accent);
    }
    .badge.danger {
      background: color-mix(in srgb, var(--ts-danger) 14%, transparent);
      color: var(--ts-danger);
    }
    h2 {
      font-size: var(--ts-fs-2);
      font-weight: 600;
      color: var(--ts-text-header);
    }
    p {
      margin-top: 8px;
      color: var(--ts-text-muted);
      white-space: pre-line; // pages write multi-line texts, SweetAlert style
    }
    .field {
      width: 100%;
      margin-top: 14px;
      padding: 9px 12px;
      border: 1px solid var(--ts-border);
      border-radius: 6px;
      background: var(--ts-surface);
      color: var(--ts-text);
      text-align: left;
    }
    .actions {
      display: flex;
      justify-content: center;
      gap: 10px;
      margin-top: 22px;
    }
    .btn {
      min-width: 96px;
      padding: 9px 18px;
      border-radius: 6px;
      background: var(--ts-info);
      color: #fff;
      font-weight: 500;
    }
    .btn:hover {
      filter: brightness(0.92);
    }
    .btn.danger {
      background: var(--ts-danger);
    }
    .btn.ghost {
      border: 1px solid var(--ts-border);
      background: transparent;
      color: var(--ts-text);
    }
    @keyframes fade {
      from {
        opacity: 0;
      }
    }
  `,
})
export class DialogHost {
  protected readonly dialog = inject(DialogService);
  protected readonly t = inject(I18n).t;
  private readonly ok = viewChild<ElementRef<HTMLButtonElement>>('ok');
  private readonly field = viewChild<ElementRef<HTMLInputElement>>('field');

  constructor() {
    // focus the text box (prompt) or the confirm button whenever a dialog opens
    effect(() => {
      const el = this.field()?.nativeElement ?? this.ok()?.nativeElement;
      if (el) queueMicrotask(() => el.focus());
    });
  }

  protected accept(): void {
    this.dialog.close(true, this.field()?.nativeElement.value);
  }

  protected cancel(): void {
    if (this.dialog.state()) this.dialog.close(false);
  }

  protected onBackdrop(event: MouseEvent): void {
    if (event.target === event.currentTarget) this.cancel();
  }
}
