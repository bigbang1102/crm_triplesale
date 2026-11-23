import {
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  inject,
  signal,
  untracked,
} from '@angular/core';
import {
  CompanyLetterhead,
  LOGO_MAX_BYTES,
  LOGO_MAX_PX,
  LOGO_TYPES,
  emptyLetterhead,
  letterheadOf,
  saveLetterhead,
} from '@core/mock/company-letterhead';
import { I18n } from '@core/i18n/i18n.service';
import { ToastService } from '@shared/ui/notify/toast.service';
import { SvContext } from '../shared/sv-context';
import { scaledLogo } from './letterhead.logic';

type TextField = Exclude<keyof CompanyLetterhead, 'logo'>;

/** the text fields of the form, in their order (label key = app.settings.letterhead.<field>) */
const FIELDS: { key: TextField; max: number; wide?: boolean }[] = [
  { key: 'nameTh', max: 150, wide: true },
  { key: 'nameEn', max: 150, wide: true },
  { key: 'taxId', max: 13 },
  { key: 'branchNo', max: 5 },
  { key: 'branchName', max: 50 },
  { key: 'tel', max: 50 },
  { key: 'fax', max: 50 },
  { key: 'email', max: 80 },
  { key: 'website', max: 80 },
  { key: 'addressTh', max: 250, wide: true },
  { key: 'addressEn', max: 250, wide: true },
  { key: 'subdistrictTh', max: 80 },
  { key: 'districtTh', max: 80 },
  { key: 'provinceTh', max: 80 },
  { key: 'zipcode', max: 10 },
  { key: 'countryTh', max: 80 },
];

/**
 * หัวกระดาษบริษัท (tab นิติบุคคล, chip นิติบุคคล): the name, tax id, address, contacts and logo of the company chosen in "ใช้กับ",
 * printed at the head of the Smart Doc documents. Kept in Datasource (core/mock/company-letterhead.ts).
 */
@Component({
  selector: 'ts-sv-letterhead',
  changeDetection: ChangeDetectionStrategy.OnPush,
  styleUrl: './letterhead.scss',
  template: `
    <section class="lh" [attr.aria-label]="t('app.settings.letterhead.title')">
      <header class="lh-head">
        <div>
          <h2>{{ t('app.settings.letterhead.title') }} · {{ entityName() }}</h2>
          <p class="lh-hint">{{ t('app.settings.letterhead.hint') }}</p>
        </div>
        <button
          type="button"
          class="ts-btn ts-btn--ghost"
          [attr.aria-expanded]="open()"
          (click)="open.set(!open())"
        >
          {{ open() ? t('app.settings.letterhead.hide') : t('app.settings.letterhead.edit') }}
        </button>
      </header>

      @if (open()) {
        <div class="lh-body">
          <div class="lh-logo">
            <span class="lh-label">{{ t('app.settings.letterhead.logo') }}</span>
            <div class="lh-logo-box">
              @if (form().logo; as logo) {
                <img [src]="logo" [alt]="t('app.settings.letterhead.logo')" />
              } @else {
                <span>{{ t('app.settings.letterhead.noLogo') }}</span>
              }
            </div>
            <div class="lh-logo-act">
              <label class="ts-btn ts-btn--ghost lh-pick">
                {{ t('app.settings.letterhead.logoPick') }}
                <input type="file" [accept]="accept" (change)="pick($event)" />
              </label>
              @if (form().logo) {
                <button type="button" class="ts-btn ts-btn--ghost" (click)="set('logo', null)">
                  {{ t('app.settings.letterhead.logoRemove') }}
                </button>
              }
            </div>
            <p class="lh-hint">{{ t('app.settings.letterhead.logoHint') }}</p>
          </div>

          <div class="lh-grid">
            @for (f of fields; track f.key) {
              <label class="lh-field" [class.wide]="f.wide">
                <span class="lh-label">{{ t('app.settings.letterhead.' + f.key) }}</span>
                <input
                  class="ts-input"
                  type="text"
                  [attr.maxlength]="f.max"
                  [value]="form()[f.key]"
                  (input)="set(f.key, $any($event.target).value)"
                />
              </label>
            }
          </div>
        </div>
        <footer class="lh-foot">
          <button type="button" class="ts-btn" [disabled]="!dirty()" (click)="save()">
            {{ t('app.settings.letterhead.save') }}
          </button>
        </footer>
      }
    </section>
  `,
})
export class SvLetterhead {
  protected readonly t = inject(I18n).t;
  private readonly ctx = inject(SvContext);
  private readonly toast = inject(ToastService);

  protected readonly fields = FIELDS;
  protected readonly accept = LOGO_TYPES.join(',');
  protected readonly open = signal(true);
  protected readonly form = signal<CompanyLetterhead>(emptyLetterhead());
  private readonly saved = signal('');
  protected readonly dirty = computed(() => JSON.stringify(this.form()) !== this.saved());

  protected readonly entityName = computed(
    () => this.ctx.store.entities().find((e) => e.id === this.ctx.entity())?.name ?? '',
  );

  constructor() {
    // another company in "ใช้กับ": its letterhead (a new one starts with the company's name)
    effect(() => {
      const id = this.ctx.entity();
      const name = this.entityName();
      untracked(() => {
        const current = letterheadOf(id) ?? { ...emptyLetterhead(), nameTh: name };
        this.form.set(current);
        this.saved.set(letterheadOf(id) ? JSON.stringify(current) : '');
      });
    });
  }

  protected set<K extends keyof CompanyLetterhead>(key: K, value: CompanyLetterhead[K]): void {
    this.form.update((f) => ({ ...f, [key]: value }));
  }

  protected async pick(event: Event): Promise<void> {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    input.value = ''; // the same file may be picked again
    if (!file) return;
    if (!LOGO_TYPES.includes(file.type)) {
      this.toast.error(this.t('app.settings.letterhead.logoType'));
      return;
    }
    if (file.size > LOGO_MAX_BYTES) {
      this.toast.error(this.t('app.settings.letterhead.logoSize'));
      return;
    }
    try {
      this.set('logo', await scaledLogo(file, LOGO_MAX_PX));
    } catch {
      this.toast.error(this.t('app.settings.letterhead.logoBad'));
    }
  }

  protected save(): void {
    const id = this.ctx.entity();
    if (!id) return;
    saveLetterhead(id, this.form());
    this.saved.set(JSON.stringify(this.form()));
    this.toast.success(this.t('app.settings.letterhead.saved'));
  }
}
