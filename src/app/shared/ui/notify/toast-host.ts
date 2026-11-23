import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { TsIcon } from '../icon/icon';
import { ToastService } from './toast.service';

@Component({
  selector: 'ts-toast-host',
  imports: [TsIcon],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="stack" aria-live="polite">
      @for (toast of toasts.toasts(); track toast.id) {
        <div class="toast" [class]="toast.kind" role="status">
          <ts-icon [name]="toast.kind === 'success' ? 'check' : toast.kind === 'error' ? 'alert' : 'info'" [size]="18" />
          <span>{{ toast.text }}</span>
          <button class="x" aria-label="close" (click)="toasts.dismiss(toast.id)"><ts-icon name="x" [size]="14" /></button>
        </div>
      }
    </div>
  `,
  styles: `
    .stack {
      position: fixed;
      bottom: 44px;
      left: 50%;
      z-index: var(--ts-z-toast);
      display: flex;
      flex-direction: column;
      gap: 8px;
      width: min(420px, calc(100vw - 24px));
      transform: translateX(-50%);
    }
    .toast {
      display: flex;
      align-items: center;
      gap: 10px;
      padding: 10px 12px;
      border-left: 4px solid var(--ts-info);
      border-radius: 8px;
      background: var(--ts-surface);
      box-shadow: var(--ts-shadow-pop);
      animation: rise 0.18s ease-out;
    }
    .toast span {
      flex: 1;
    }
    .toast.success {
      border-left-color: var(--ts-accent);
      ts-icon {
        color: var(--ts-accent);
      }
    }
    .toast.error {
      border-left-color: var(--ts-danger);
      ts-icon {
        color: var(--ts-danger);
      }
    }
    .toast.info ts-icon {
      color: var(--ts-info);
    }
    .x {
      display: grid;
      place-items: center;
      width: 22px;
      height: 22px;
      border-radius: 50%;
      color: var(--ts-text-muted);
    }
    .x:hover {
      background: var(--ts-surface-hover);
    }
    @keyframes rise {
      from {
        opacity: 0;
        transform: translateY(8px);
      }
    }
  `,
})
export class ToastHost {
  protected readonly toasts = inject(ToastService);
}
