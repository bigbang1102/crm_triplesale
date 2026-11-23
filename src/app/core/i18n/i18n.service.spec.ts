import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { beforeEach, describe, expect, it } from 'vitest';
import { ConfigService } from '../config/config.service';
import { configStub } from '../testing/test-helpers';
import { I18n } from './i18n.service';

describe('I18n', () => {
  let http: HttpTestingController;
  let i18n: I18n;

  beforeEach(() => {
    localStorage.clear();
    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        { provide: ConfigService, useValue: configStub() },
      ],
    });
    http = TestBed.inject(HttpTestingController);
    i18n = TestBed.inject(I18n);
  });

  /** answers the 3 requests per language */
  function flushLanguage(lang: 'th' | 'en', messages: Record<string, string>, app: Record<string, string> = {}, master = {}) {
    http.expectOne(`assets/i18n/${lang}.json`).flush(messages);
    http.expectOne(`assets/i18n/app.${lang}.json`).flush(app);
    http.expectOne(`assets/i18n/master-data.${lang}.json`).flush(master);
  }

  async function ready() {
    const init = i18n.init();
    flushLanguage('th', { 'label.topbar.lead': 'โอกาสขาย', 'label.hello': 'สวัสดี {0} และ {1}', onlyTh: 'เฉพาะไทย' }, { 'app.name': 'Triple Sale' }, { 'province.BKK': 'x', LAO: 'ลาว' });
    await init;
  }

  it('loads th once (no duplicate requests) and translates', async () => {
    await ready();
    http.verify();
    expect(i18n.t('label.topbar.lead')).toBe('โอกาสขาย');
    expect(i18n.t('app.name')).toBe('Triple Sale');
  });

  it('shows the key itself when it is missing everywhere (visible on screen, like the Java app)', async () => {
    await ready();
    expect(i18n.t('label.does.not.exist')).toBe('label.does.not.exist');
  });

  it('replaces {0}, {1} placeholders', async () => {
    await ready();
    expect(i18n.t('label.hello', 'A', 2)).toBe('สวัสดี A และ 2');
  });

  it('switches language after loading it and falls back to Thai for missing keys', async () => {
    await ready();
    const switching = i18n.use('en');
    flushLanguage('en', { 'label.topbar.lead': 'Lead' });
    await switching;

    expect(i18n.lang()).toBe('en');
    expect(i18n.t('label.topbar.lead')).toBe('Lead');
    expect(i18n.t('onlyTh')).toBe('เฉพาะไทย'); // not in en → th
    expect(localStorage.getItem('ts.lang')).toBe('en');
  });

  it('master() returns the override for a code, else the original text', async () => {
    await ready();
    expect(i18n.master('LAO', 'Laos')).toBe('ลาว');
    expect(i18n.master('XXX', 'Original')).toBe('Original');
  });
});
