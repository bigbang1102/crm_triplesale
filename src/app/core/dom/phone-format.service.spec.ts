import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { afterEach, describe, expect, it } from 'vitest';
import { AuthService } from '../auth/auth.service';
import { ConfigService } from '../config/config.service';
import { I18n } from '../i18n/i18n.service';
import { PermissionService } from '../permissions/permission.service';
import { configStub } from '../testing/test-helpers';
import { PhoneFormat } from './phone-format.service';

const lang = signal<'th' | 'en'>('th');

function setup(mock: boolean) {
  TestBed.configureTestingModule({
    providers: [
      provideHttpClient(),
      provideHttpClientTesting(),
      { provide: ConfigService, useValue: configStub({ mock }) },
      { provide: AuthService, useValue: { session: () => null } },
      { provide: PermissionService, useValue: { has: () => true } },
      { provide: I18n, useValue: { lang, t: (k: string) => k, masterRaw: (l: string, k: string) => (l === 'th' && k === 'THA' ? 'ไทย' : undefined) } },
    ],
  });
  return { phone: TestBed.inject(PhoneFormat), http: TestBed.inject(HttpTestingController) };
}

describe('PhoneFormat (the country master of the phone masks)', () => {
  afterEach(() => TestBed.resetTestingModule());

  it('in live mode the master is the countries of /prospects/options (once; kept in the session): the mask is the phoneNumberFormat of the country', async () => {
    sessionStorage.clear();
    const { phone, http } = setup(false);
    const loading = phone.load();
    await new Promise((r) => setTimeout(r));
    const req = http.expectOne((r) => r.url.includes('/prospects/options') && r.url.includes('sets=countries'));
    req.flush({ status: 200, result: [{ id: 'c1', code: 'THA', name: 'Thailand', phoneCountryCode: '+66', phoneNumberFormat: 'XX XXX XXXX' }, { id: 'c2', code: 'KHM', name: 'Cambodia', phoneCountryCode: '+855' }] });
    await loading;
    expect(phone.ready()).toBe(true);
    expect(phone.api.formatOfCountry('THA')).toBe('XX XXX XXXX');
    expect(phone.api.formatOfCountry('KHM')).toBe(''); // no phoneNumberFormat: no mask
    http.verify();
    // the next load (another page) does not ask again: the session holds the countries
    TestBed.resetTestingModule();
    const again = setup(false);
    await again.phone.load();
    again.http.expectNone((r) => r.url.includes('/prospects/options'));
    expect(again.phone.api.formatOfCountry('THA')).toBe('XX XXX XXXX');
  });

  it('in mock mode it asks nothing at all (the fake master is a chunk of its own)', async () => {
    const { phone, http } = setup(true);
    await phone.load();
    http.verify();
    expect(phone.ready()).toBe(true);
  });
});
