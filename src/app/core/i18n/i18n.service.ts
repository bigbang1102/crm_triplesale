import { HttpClient } from '@angular/common/http';
import { Injectable, inject, signal } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import { Lang } from '../config/app-config';
import { ConfigService } from '../config/config.service';
import { PrefsService } from '../prefs/prefs.service';

type Dict = Record<string, string>;

/**
 * Translation service.
 *
 *  - `assets/i18n/{lang}.json`        converted 1:1 from the Java `messages_{lang}.properties`
 *                                     (`npm run i18n:convert` — never edit by hand)
 *  - `assets/i18n/app.{lang}.json`    keys that only exist in the Angular app (prefix `app.`)
 *  - `assets/i18n/master-data.{lang}.json`  code → name overrides for backend data
 *                                     (provinces, districts, countries; see MasterDataI18n)
 *
 * Lookup order: active language → Thai → the key itself (so a missing key is visible on screen,
 * exactly like the Java `commonBean.msg['key']`). `{0}`, `{1}` placeholders are replaced.
 *
 * Templates use the arrow property:  `protected readonly t = inject(I18n).t;`  →  `{{ t('label.topbar.lead') }}`
 */
@Injectable({ providedIn: 'root' })
export class I18n {
  private readonly http = inject(HttpClient);
  private readonly prefs = inject(PrefsService);
  private readonly config = inject(ConfigService);

  private readonly messages = signal<Partial<Record<Lang, Dict>>>({});
  private readonly masterData = signal<Partial<Record<Lang, Dict>>>({});

  readonly lang = this.prefs.lang.asReadonly();

  /** Loads the fallback (th) and the active language. Awaited by the app initializer. */
  async init(): Promise<void> {
    this.prefs.applyDefaultLang(this.config.value.defaultLang);
    await Promise.all([this.ensure('th'), this.ensure(this.prefs.lang())]);
  }

  /** Switches language after its dictionary is available (no page reload needed). */
  async use(lang: Lang): Promise<void> {
    await this.ensure(lang);
    this.prefs.setLang(lang);
  }

  readonly t = (key: string, ...args: (string | number)[]): string => {
    const all = this.messages();
    const text = all[this.prefs.lang()]?.[key] ?? all['th']?.[key] ?? key;
    return args.length ? text.replace(/\{(\d+)\}/g, (m, i: string) => String(args[+i] ?? m)) : text;
  };

  /** Name override for a backend `code` (province.<CODE>, district.<CODE>, country codes …) or the original text. */
  readonly master = (code: string, original = ''): string => {
    const dict = this.masterData()[this.prefs.lang()];
    return dict?.[code] ?? original;
  };

  /** The raw master-data text of a key in ONE language (`MasterDataI18n`: the live backends translate by the language the Java code asked for, not the one on screen). */
  readonly masterRaw = (lang: Lang, key: string): string | undefined => this.masterData()[lang]?.[key];

  private readonly inflight = new Map<Lang, Promise<void>>();

  /** Loads a language once, even when asked for twice at the same time. */
  private ensure(lang: Lang): Promise<void> {
    if (this.messages()[lang]) return Promise.resolve();
    let pending = this.inflight.get(lang);
    if (!pending) {
      pending = this.fetchLanguage(lang).finally(() => this.inflight.delete(lang));
      this.inflight.set(lang, pending);
    }
    return pending;
  }

  private async fetchLanguage(lang: Lang): Promise<void> {
    const get = (file: string) =>
      firstValueFrom(this.http.get<Dict>(`assets/i18n/${file}`)).catch((): Dict => ({}));
    const [legacy, app, master] = await Promise.all([
      get(`${lang}.json`),
      get(`app.${lang}.json`),
      get(`master-data.${lang}.json`),
    ]);
    this.messages.update((m) => ({ ...m, [lang]: { ...legacy, ...app } }));
    this.masterData.update((m) => ({ ...m, [lang]: master }));
  }
}
