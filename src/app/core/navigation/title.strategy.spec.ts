import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { Title } from '@angular/platform-browser';
import { RouterStateSnapshot } from '@angular/router';
import { beforeEach, describe, expect, it } from 'vitest';
import { I18n } from '../i18n/i18n.service';
import { AppTitleStrategy } from './title.strategy';

const state = (data: Record<string, unknown>) => ({ root: { firstChild: null, data } }) as unknown as RouterStateSnapshot;

describe('AppTitleStrategy', () => {
  let strategy: AppTitleStrategy;
  const lang = signal<'th' | 'en'>('th');

  beforeEach(() => {
    lang.set('th');
    TestBed.configureTestingModule({ providers: [{ provide: I18n, useValue: { lang } }] });
    strategy = TestBed.inject(AppTitleStrategy);
  });

  it('"<page title> · Triple Sale" in the active language', () => {
    const page = { title: { th: 'ลูกค้า', en: 'Customers' } };
    strategy.updateTitle(state({ page }));
    expect(TestBed.inject(Title).getTitle()).toBe('ลูกค้า · Triple Sale');
    lang.set('en');
    strategy.updateTitle(state({ page }));
    expect(TestBed.inject(Title).getTitle()).toBe('Customers · Triple Sale');
  });

  it('a route can carry the title of its Java page as it is (the login page: "Triple Sales - ลงชื่อเข้าใช้")', () => {
    strategy.updateTitle(state({ page: { title: { th: 'ลงชื่อเข้าใช้', en: 'Sign in' } }, windowTitle: 'Triple Sales - ลงชื่อเข้าใช้' }));
    expect(TestBed.inject(Title).getTitle()).toBe('Triple Sales - ลงชื่อเข้าใช้');
    lang.set('en'); // the Java page is Thai whatever the language
    strategy.updateTitle(state({ windowTitle: 'Triple Sales - ลงชื่อเข้าใช้' }));
    expect(TestBed.inject(Title).getTitle()).toBe('Triple Sales - ลงชื่อเข้าใช้');
  });

  it('a route without a page falls back to the product name', () => {
    strategy.updateTitle(state({}));
    expect(TestBed.inject(Title).getTitle()).toBe('Triple Sale');
  });
});
