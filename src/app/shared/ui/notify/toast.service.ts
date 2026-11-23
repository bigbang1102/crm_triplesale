import { Injectable, signal } from '@angular/core';

export type ToastKind = 'success' | 'error' | 'info';

export interface Toast {
  id: number;
  kind: ToastKind;
  text: string;
}

/** Short messages (auto-dismiss) — replaces the swal timer toasts. Rendered by <ts-toast-host/>. */
@Injectable({ providedIn: 'root' })
export class ToastService {
  readonly toasts = signal<Toast[]>([]);
  private seq = 0;

  success(text: string, ms = 2500): void {
    this.push('success', text, ms);
  }

  error(text: string, ms = 5000): void {
    this.push('error', text, ms);
  }

  info(text: string, ms = 3000): void {
    this.push('info', text, ms);
  }

  dismiss(id: number): void {
    this.toasts.update((list) => list.filter((t) => t.id !== id));
  }

  private push(kind: ToastKind, text: string, ms: number): void {
    const toast: Toast = { id: ++this.seq, kind, text };
    this.toasts.update((list) => [...list.slice(-3), toast]);
    setTimeout(() => this.dismiss(toast.id), ms);
  }
}
