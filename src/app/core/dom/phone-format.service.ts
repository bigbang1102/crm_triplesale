import { Injectable, Injector, inject, signal } from '@angular/core';
import { ConfigService } from '../config/config.service';
import { fetchOptionRows } from '../live/prospect-options.live';
import { dialCode } from '../live/opportunities-v2.live';
import { restDepsOf } from '../live/rest-deps';
import { TsPhone, createTsPhone } from './phone-format';

/**
 * Phone numbers: dial code (`phoneCountryCode`) + mask (`phoneNumberFormat`) of the country master data — the typed home of
 * `window.TsPhone` (phone_format.js). The master is fetched once, on the first `load()`; until then every number is shown
 * raw (same as the Java pages).
 *
 *   await phone.load();
 *   phone.api.display('0812345678', '+66', 'THA')     // "+66 81-234-5678"
 *   phone.api.applyInput(input, phone.api.resolve(pcc, country).fmt, true)   // while typing
 *   payload.tel = phone.api.digits(input.value)       // digits only when saving
 *
 * The shell also exposes the instance as `window.TsPhone` (DomGuards), for screens that were generated from the Java pages.
 */
@Injectable({ providedIn: 'root' })
export class PhoneFormat {
  private readonly config = inject(ConfigService);
  private readonly injector = inject(Injector);

  readonly api: TsPhone = createTsPhone({
    apiBase: this.config.value.apiBase,
    fetch: (input, init) => this.fetch(input, init),
  });

  /** true once the master data has arrived (or has been given up on) */
  readonly ready = signal(false);

  /** Loads the country master once; the promise is shared. */
  async load(): Promise<void> {
    await this.api.load();
    this.ready.set(true);
  }

  private async fetch(input: string, init?: RequestInit): Promise<Response> {
    if (this.config.value.mock) {
      // the fake master is its own chunk: only loaded (and shipped to the browser) when `mock: true`
      return (await import('../http/mock-countries')).mockCountriesResponse();
    }
    // live: the countries of `GET /prospects/options?sets=countries` — read from the session first, asked once when it is not there (fetchOptionRows).
    // A row carries `phoneCountryCode` and `phoneNumberFormat` when the service has them; a country without them is a country with no mask, so the number
    // is shown as its digits in a row. The call never fails here: no answer = no countries = every number is shown as it came.
    const asked = await fetchOptionRows(restDepsOf(this.injector), 'countries');
    return new Response(JSON.stringify(asked.ok ? asked.rows.map((row) => (typeof row['phoneCountryCode'] === 'string' ? { ...row, phoneCountryCode: dialCode(row['phoneCountryCode']) } : row)) : []), { status: 200, headers: { 'Content-Type': 'application/json' } });
  }
}
