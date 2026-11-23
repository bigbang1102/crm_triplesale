import { Injectable, effect, signal } from '@angular/core';
import { Lang } from '../config/app-config';

export type Theme = 'light' | 'dark';
/** A- / A / A+ buttons in the top bar → -2px / 0 / +2px on every font size token. */
export type FontStep = -1 | 0 | 1;

const KEY = { theme: 'ts.theme', font: 'ts.fontStep', lang: 'ts.lang' } as const;

function read(key: string): string | null {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

function write(key: string, value: string): void {
  try {
    localStorage.setItem(key, value);
  } catch {
    /* private mode / blocked storage: preferences just won't persist */
  }
}

/**
 * User interface preferences (replaces `TS_PREF` / ui_pref.js of the Java app):
 * theme, font-size step and language. Persisted in localStorage and applied to <html>.
 */
@Injectable({ providedIn: 'root' })
export class PrefsService {
  private readonly savedLang = read(KEY.lang) as Lang | null;

  readonly theme = signal<Theme>(read(KEY.theme) === 'dark' ? 'dark' : 'light');
  readonly fontStep = signal<FontStep>(this.parseFont(read(KEY.font)));
  readonly lang = signal<Lang>(this.savedLang === 'en' ? 'en' : 'th');

  constructor() {
    effect(() => {
      const root = document.documentElement;
      root.dataset['theme'] = this.theme();
      root.style.setProperty('--ts-fs-adj', `${this.fontStep() * 2}px`);
      root.lang = this.lang();
      write(KEY.theme, this.theme());
      write(KEY.font, String(this.fontStep()));
    });
  }

  toggleTheme(): void {
    this.theme.update((t) => (t === 'light' ? 'dark' : 'light'));
  }

  setFontStep(step: FontStep): void {
    this.fontStep.set(step);
  }

  /** Called by I18nService after the dictionary for `lang` has been loaded. */
  setLang(lang: Lang): void {
    this.lang.set(lang);
    write(KEY.lang, lang);
  }

  /** Applies the configured default language only if the user never chose one. */
  applyDefaultLang(lang: Lang): void {
    if (!this.savedLang) this.lang.set(lang);
  }

  private parseFont(raw: string | null): FontStep {
    return raw === '-1' ? -1 : raw === '1' ? 1 : 0;
  }
}
