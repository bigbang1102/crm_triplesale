import { ApplicationRef, Component, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { Router, provideRouter } from '@angular/router';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { PAGES } from '../navigation/page-registry';
import { ConfigService } from '../config/config.service';
import { I18n } from '../i18n/i18n.service';
import { configStub } from '../testing/test-helpers';
import { DomGuards } from './dom-guards';
import { javaPageNames } from './page-names';
import { PhoneFormat } from './phone-format.service';

@Component({ template: '' })
class Blank {}

const MESSAGES = { th: 'ไม่อนุญาตให้ใช้อักขระพิเศษ', en: 'Special characters are not allowed' };

describe('javaPageNames', () => {
  it('takes the top-level pages of a registry entry, not fragments or assets', () => {
    expect(javaPageNames(['pages/lead_detail.xhtml', 'pages/components/lead_detail/*.xhtml (8 modals)', 'pages/components/work_modal.xhtml', 'css/lead_detail.css'])).toEqual(['lead_detail']);
    expect(javaPageNames(['pages/dashboard.xhtml', 'pages/dashboard_company.xhtml (7.5k บรรทัด)'])).toEqual(['dashboard', 'dashboard_company']);
    expect(javaPageNames(['web/index.xhtml', 'resources/js/dashboard.js'])).toEqual([]);
    expect(javaPageNames(['pages/Schedule.xhtml'])).toEqual(['schedule']);
    expect(javaPageNames(undefined)).toEqual([]);
  });

  it('sees schedule and the lead family in the real registry, and nothing else that no_autofill.js excludes', () => {
    const excluded = (page: string) => page === 'schedule' || page === 'lead' || page.startsWith('lead_');
    const hit = PAGES.filter((p) => javaPageNames(p.legacy).some(excluded)).map((p) => p.id);
    expect(hit).toEqual(['opportunities', 'opportunity-detail', 'schedule']);
  });
});

describe('DomGuards (what the Shell starts)', () => {
  const lang = signal<'th' | 'en'>('th');
  let guards: DomGuards;
  let router: Router;
  const field = (html = '<input type="text">') => {
    const t = document.createElement('template');
    t.innerHTML = html;
    const el = t.content.firstElementChild as HTMLInputElement;
    document.body.appendChild(el);
    return el;
  };
  const settle = () => new Promise((r) => setTimeout(r, 0));
  const typeChar = (el: Element, data: string) => {
    const ev = new InputEvent('beforeinput', { data, inputType: 'insertText', cancelable: true, bubbles: true });
    el.dispatchEvent(ev);
    return ev.defaultPrevented;
  };

  beforeEach(() => {
    lang.set('th');
    TestBed.configureTestingModule({
      providers: [
        provideRouter([
          { path: 'prospects', component: Blank, data: { page: { legacy: ['pages/contracts.xhtml'] } } },
          { path: 'leads', component: Blank, data: { page: { legacy: ['pages/lead.xhtml', 'pages/components/lead/filter_modal.xhtml'] } } },
          { path: 'schedule', component: Blank, data: { page: { legacy: ['pages/schedule.xhtml'] } } },
          { path: 'nopage', component: Blank },
        ]),
        { provide: ConfigService, useValue: configStub({ mock: true }) },
        {
          provide: I18n,
          useValue: {
            // the keys that are not listed come back as themselves, like the real service
            t: (k: string) => (k === 'label.guard.special_char' ? MESSAGES[lang()] : k === 'label.ods.select' ? (lang() === 'th' ? 'เลือก' : 'Select') : k),
            lang,
          },
        },
      ],
    });
    guards = TestBed.inject(DomGuards);
    router = TestBed.inject(Router);
  });
  afterEach(() => {
    guards.stop();
    document.body.innerHTML = '';
  });

  it('start() turns the three scripts on; stop() turns them off and takes window.TsPhone away', () => {
    expect(window.TsPhone).toBeUndefined();
    guards.start();
    guards.start(); // idempotent
    expect(window.TsPhone).toBe(TestBed.inject(PhoneFormat).api);
    const el = field();
    expect(typeChar(el, '<')).toBe(true);
    guards.stop();
    expect(window.TsPhone).toBeUndefined();
    expect(typeChar(el, '<')).toBe(false);
  });

  it('the warning follows the language at once (Java: reload the page and read it again)', () => {
    guards.start();
    const el = field();
    typeChar(el, '<');
    expect(document.getElementById('ig-warn-tip')?.textContent).toBe(`${MESSAGES.th}  <`);
    lang.set('en');
    typeChar(el, '"');
    expect(document.getElementById('ig-warn-tip')?.textContent).toBe(`${MESSAGES.en}  "`);
  });

  it('autocomplete="off" follows the active route: lead pages and schedule keep the browser history, the rest do not', async () => {
    guards.start();
    const result: Record<string, string | null> = {};
    for (const [key, path] of [['prospects', '/prospects'], ['leads', '/leads'], ['schedule', '/schedule'], ['nopage', '/nopage'], ['prospects again', '/prospects']]) {
      await router.navigateByUrl(path);
      const el = field();
      await settle();
      result[key] = el.getAttribute('autocomplete');
    }
    expect(result).toEqual({
      prospects: 'off',
      leads: null,
      schedule: null,
      nopage: 'off', // a route without a registry page: nothing is excluded
      'prospects again': 'off', // leaving an excluded page switches it back on
    });
  });

  it('start() also turns on the system dropdown (open_down_select.js): every select is replaced, window.odsDate is there; stop() undoes it', async () => {
    guards.start();
    expect(typeof (window as any).odsDate).toBe('function');
    const wrap = document.createElement('div');
    wrap.innerHTML = '<select><option value="">x</option><option value="1">One</option></select>';
    document.body.appendChild(wrap);
    await settle();
    await new Promise((r) => setTimeout(r, 120)); // the scan is debounced by 80 ms
    expect(wrap.querySelector('.ods-btn')).toBeTruthy();
    guards.stop();
    expect(wrap.querySelector('.ods-btn')).toBeNull();
    expect((window as any).odsDate).toBeUndefined();
  });

  it('the dropdown texts follow the language switch without a reload', async () => {
    guards.start();
    const wrap = document.createElement('div');
    wrap.innerHTML = '<select><option value="">x</option><option value="1">One</option></select>';
    document.body.appendChild(wrap);
    await new Promise((r) => setTimeout(r, 140));
    expect(wrap.querySelector('.ods-txt')?.textContent).toBe('เลือก');
    lang.set('en');
    TestBed.inject(ApplicationRef).tick(); // the effect of DomGuards repaints the buttons
    expect(wrap.querySelector('.ods-txt')?.textContent).toBe('Select');
  });

  it('PhoneFormat.load() reads the (mock) master once and TsPhone works with it', async () => {
    guards.start();
    const phone = TestBed.inject(PhoneFormat);
    expect(phone.ready()).toBe(false);
    await phone.load();
    expect(phone.ready()).toBe(true);
    expect(window.TsPhone?.display('0812345678', '+66', 'THA')).toBe('+66 81-234-5678');
    expect(phone.api.resolve('+1', null).pick).toBe('CAN'); // longest mask; CAN before USA on a tie
  });
});
