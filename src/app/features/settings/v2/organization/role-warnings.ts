import { ChangeDetectionStrategy, Component, computed, inject, input } from '@angular/core';
import { I18n } from '@core/i18n/i18n.service';
import { RECEIVER_DOCS, docLabel, missingForReceiver, type LostReceiver, type PermissionWarning } from '@core/permissions/role-model';

const short = (code: string): string => code.replace(/^Pipeline_/, '');

const MAX_LOST_LINES = 8;

/** the text of the confirm "positions will no longer be able to receive work": one line per position (the first 8), then what happens to their documents */
export function lostText(t: (key: string, ...args: (string | number)[]) => string, lost: readonly LostReceiver[]): string {
  const lines = lost.slice(0, MAX_LOST_LINES).map((l) => t('app.settings.role.lost.item', l.position.code, l.kinds.map(docLabel).join(' · ')));
  if (lost.length > MAX_LOST_LINES) lines.push(t('app.settings.role.lost.more', lost.length - MAX_LOST_LINES));
  return [...lines, t('app.settings.role.lost.text')].join('\n');
}

/** กล่อง "คำเตือนของสิทธิ์รวม" — บันทึกได้ แค่บอกว่าจะเกิดอะไรขึ้น */
@Component({
  selector: 'ts-role-warnings',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @if (items().length) {
      <div class="wbox" role="status">
        <b>{{ t('app.settings.role.warn.title', items().length) }}</b>
        <span class="wnote">{{ t('app.settings.role.warn.note') }}</span>
        @for (w of items(); track w.finding) {
          <div class="wrow" [attr.data-level]="w.level">
            <span class="wi" aria-hidden="true">{{ w.level === 'error' ? '!' : w.level === 'info' ? 'i' : '⚠' }}</span>
            <div>
              <div class="wr">{{ w.effect }}</div>
              <div class="wc">{{ w.finding }}</div>
            </div>
          </div>
        }
      </div>
    }
  `,
  styles: `
    .wbox { display: flex; flex-direction: column; gap: 8px; padding: 12px 14px; border: 1px solid var(--ts-line); border-radius: 12px; background: var(--ts-surface); }
    .wnote { color: var(--ts-muted); font-size: var(--ts-fs-small); }
    .wrow { display: flex; gap: 10px; align-items: flex-start; }
    .wi { display: inline-grid; flex: none; place-items: center; width: 20px; height: 20px; border-radius: 50%; font-size: 12px; font-weight: 700; }
    .wrow[data-level='error'] .wi { background: var(--ts-pink-soft); color: var(--ts-pink-ink); }
    .wrow[data-level='warn'] .wi { background: var(--ts-badge-draft-bg); color: var(--ts-badge-draft); }
    .wrow[data-level='info'] .wi { background: var(--ts-blue-soft); color: var(--ts-blue-ink); }
    .wr { font-weight: 500; }
    .wc { color: var(--ts-muted); font-family: ui-monospace, Menlo, Consolas, monospace; font-size: var(--ts-fs-small); }
  `,
})
export class RoleWarnings {
  protected readonly t = inject(I18n).t;
  readonly items = input.required<readonly PermissionWarning[]>();
}

/** ชิป "รับงาน Lead / Prospect / Opportunity" — ✓ เมื่อสิทธิ์รวมมี View + Edit ของเอกสารนั้น (ชุดสิทธิ์ขั้นต่ำของผู้รับ) */
@Component({
  selector: 'ts-role-receive',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <span class="rdy">
      @for (c of chips(); track c.label) {
        <span class="rc" [class.ok]="c.ok" [class.no]="!c.ok" [title]="c.title">{{ c.ok ? '✓' : '✕' }} {{ prefix() ? t('app.settings.role.panel.receive', c.label) : c.label }}</span>
      }
    </span>
  `,
  styles: `
    .rdy { display: inline-flex; flex-wrap: wrap; gap: 4px; }
    .rc { display: inline-flex; padding: 2px 8px; border-radius: 9999px; font-size: var(--ts-fs-small); font-weight: 500; white-space: nowrap; }
    .rc.ok { background: var(--ts-badge-release-bg); color: var(--ts-badge-release); }
    .rc.no { background: var(--ts-surface-2); color: var(--ts-muted); }
  `,
})
export class RoleReceive {
  protected readonly t = inject(I18n).t;
  readonly set = input.required<ReadonlySet<string>>();
  /** true: "รับงาน Lead" (panel) · false: just the document name (table) */
  readonly prefix = input(false);
  /** only the documents it can receive (empty list shows "–") */
  readonly onlyOk = input(false);

  protected readonly chips = computed(() =>
    RECEIVER_DOCS.map((d) => {
      const missing = missingForReceiver(this.set(), d.kind);
      return { label: d.label, ok: missing.length === 0, title: missing.length ? this.t('app.settings.role.panel.receiveNo', d.label, missing.map(short).join(', ')) : this.t('app.settings.role.panel.receiveOk', d.label) };
    }).filter((c) => !this.onlyOk() || c.ok),
  );
}
