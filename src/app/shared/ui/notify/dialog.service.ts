import { Injectable, signal } from '@angular/core';

export interface DialogOptions {
  title: string;
  text?: string;
  okText?: string;
  cancelText?: string;
  /** red confirm button (delete / sign out …) */
  danger?: boolean;
  /** the badge above the title (SweetAlert's `icon`): `warning` / `error` look like the danger badge */
  icon?: 'info' | 'warning' | 'success' | 'error';
}

export interface PromptOptions extends DialogOptions {
  placeholder?: string;
}

export interface DialogState extends DialogOptions {
  kind: 'confirm' | 'alert' | 'prompt';
  placeholder?: string;
  resolve: (confirmed: boolean, value?: string) => void;
}

/**
 * Promise based confirm/alert dialogs — the replacement for SweetAlert (`swal(...)`) that the
 * Java pages use ~38 times. Rendered by <ts-dialog-host/> in the shell.
 *
 *   if (await dialog.confirm({ title: t('app.logout.title'), danger: true })) { … }
 */
@Injectable({ providedIn: 'root' })
export class DialogService {
  readonly state = signal<DialogState | null>(null);

  confirm(options: DialogOptions): Promise<boolean> {
    return new Promise((resolve) => this.open({ ...options, kind: 'confirm', resolve }));
  }

  async alert(options: DialogOptions): Promise<void> {
    await new Promise<boolean>((resolve) => this.open({ ...options, kind: 'alert', resolve }));
  }

  /**
   * A confirm with a text box — `swal({ content: { element: 'input' } })`. Resolves the text (possibly empty) when confirmed,
   * `null` when cancelled.
   */
  prompt(options: PromptOptions): Promise<string | null> {
    return new Promise((resolve) =>
      this.open({ ...options, kind: 'prompt', resolve: (confirmed, value) => resolve(confirmed ? (value ?? '') : null) }),
    );
  }

  close(confirmed: boolean, value?: string): void {
    const current = this.state();
    this.state.set(null);
    current?.resolve(confirmed, value);
  }

  private open(state: DialogState): void {
    // a dialog replaced by a newer one counts as "cancelled"
    this.state()?.resolve(false);
    this.state.set(state);
  }
}
