import { signal } from '@angular/core';
import { describeError } from '../ai-admin.logic';

/**
 * Loading state of one request: `run()` ignores a slow answer that arrives after a newer `run()` (month / scope changed meanwhile).
 * A real service error is kept in `error` (shown to the user) — never swallowed, never replaced by sample data.
 */
export class AsyncState<T> {
  readonly data = signal<T | null>(null);
  readonly loading = signal(false);
  readonly error = signal('');
  private sequence = 0;

  constructor(private readonly t: (key: string) => string) {}

  async run(task: () => Promise<T>): Promise<void> {
    const mine = ++this.sequence;
    this.loading.set(true);
    this.error.set('');
    try {
      const result = await task();
      if (mine === this.sequence) this.data.set(result);
    } catch (error) {
      if (mine !== this.sequence) return;
      this.data.set(null);
      this.error.set(describeError(error, this.t));
    } finally {
      if (mine === this.sequence) this.loading.set(false);
    }
  }
}
