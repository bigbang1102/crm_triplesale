import { Injectable, effect, inject, untracked } from '@angular/core';
import { ActivatedRouteSnapshot, Router } from '@angular/router';
import { I18n } from '../i18n/i18n.service';
import type { PageDef } from '../navigation/page-registry';
import { startInputGuard } from './input-guard';
import { loadScript } from './load-script';
import { loadSwal } from './swal';
import { startNoAutofill } from './no-autofill';
import { startOpenDownSelect, type OdsTexts, type OpenDownSelect } from './open-down-select';
import { javaPageNames } from './page-names';
import { PhoneFormat } from './phone-format.service';
import type { TsPhone } from './phone-format';

declare global {
  interface Window {
    /** phone_format.js — for screens generated from the Java pages (they call `window.TsPhone`) */
    TsPhone?: TsPhone;
  }
}

/**
 * The page-wide DOM behaviours that `template.xhtml` loads for every signed-in page of the Java app:
 *
 *   no_autofill.js   autocomplete="off" on every text field (and every field added later) — except the pages in its list
 *   input_guard.js   special characters (< > " ' ` \ ; | { } [ ] $ ^ ~) cannot be typed or pasted into text fields —
 *                    except `data-allow-special` / `data-block-chars` fields
 *   phone_format.js  window.TsPhone (dial codes + masks; lazy — nothing is fetched until a page calls `load()`)
 *   open_down_select.js  every native <select> becomes the system dropdown (opens downwards, searchable); `window.odsDate`
 *                    / `odsAutoComplete` / `odsEnhance` for the pages generated from Java (opt out: `data-ods-skip="1"`)
 *
 * They are generated from the Java files (`npm run dom:sync`). The Shell starts them, so — like in Java — the login page,
 * which does not use the template, is not affected. Both scripts decide per page; here "the page" is the Java page(s) of
 * the active route (registry `legacy`), read at the moment a field is touched because routes change without a reload.
 */
@Injectable({ providedIn: 'root' })
export class DomGuards {
  private readonly router = inject(Router);
  private readonly i18n = inject(I18n);
  private readonly phone = inject(PhoneFormat);
  private stops: Array<() => void> = [];
  private ods: OpenDownSelect | null = null;

  constructor() {
    // the placeholder / calendar texts follow the language switch at once (Java reloads the page)
    effect(() => {
      this.i18n.lang();
      untracked(() => this.ods?.refresh());
    });
  }

  start(): void {
    if (this.stops.length) return;
    const env = { pageNames: () => this.pageNames() };
    this.stops = [
      startNoAutofill(env),
      // the message follows the language switch at once (Java reloads the page and re-reads it)
      startInputGuard({ ...env, message: () => this.i18n.t('label.guard.special_char') }),
    ];
    this.ods = startOpenDownSelect({ text: () => this.odsTexts(), defaultAvatar: 'assets/images/default_avatar.svg' });
    this.stops.push(() => this.ods?.destroy());
    window.TsPhone = this.phone.api;
    // template.xhtml also loads SweetAlert and crm_error_popup.js (window.crmShowError / crmErrText / crmLeadFetchFailed) for every page
    loadSwal()
      .then(() => loadScript('assets/java-js/crm_error_popup.js'))
      .catch(() => {
        /* offline / blocked: a page that needs a dialog shows nothing, like Java without the library */
      });
  }

  stop(): void {
    this.stops.splice(0).forEach((stop) => stop());
    this.ods = null;
    if (window.TsPhone === this.phone.api) delete window.TsPhone;
  }

  /** window.ODS_I18N of the Java template, in the active language */
  private odsTexts(): Partial<OdsTexts> {
    const t = this.i18n.t;
    return {
      select: t('label.ods.select'),
      search: t('label.ods.search_ph'),
      noData: t('label.ods.no_data'),
      today: t('label.ods.today'),
      ok: t('label.ods.ok'),
      clear: t('label.ods.clear'),
      months: Array.from({ length: 12 }, (_, i) => t(`label.month.${i + 1}`)),
      dow: Array.from({ length: 7 }, (_, i) => t(`label.dow.${i + 1}`)),
    };
  }

  /** Java page names of the active route ("lead", "lead_detail" …) */
  private pageNames(): string[] {
    let route: ActivatedRouteSnapshot = this.router.routerState.snapshot.root;
    while (route.firstChild) route = route.firstChild;
    return javaPageNames((route.data['page'] as PageDef | undefined)?.legacy);
  }
}
