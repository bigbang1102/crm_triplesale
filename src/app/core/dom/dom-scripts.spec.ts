import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { MOCK_COUNTRIES } from '../http/mock-countries';
import { startInputGuard } from './input-guard';
import { startNoAutofill } from './no-autofill';
import { createTsPhone } from './phone-format';

const field = (html: string, parent: HTMLElement = document.body): HTMLInputElement & HTMLTextAreaElement => {
  const t = document.createElement('template');
  t.innerHTML = html;
  const el = t.content.firstElementChild as HTMLInputElement & HTMLTextAreaElement;
  parent.appendChild(el);
  return el;
};
/** a `beforeinput` for typing one character; true = the guard cancelled it */
const typeChar = (el: Element, data: string, inputType = 'insertText') => {
  const ev = new InputEvent('beforeinput', { data, inputType, cancelable: true, bubbles: true });
  el.dispatchEvent(ev);
  return ev.defaultPrevented;
};
const paste = (el: HTMLInputElement, value: string, caret = value.length) => {
  el.value = value;
  el.setSelectionRange(caret, caret);
  el.dispatchEvent(new InputEvent('input', { bubbles: true, inputType: 'insertFromPaste' }));
};

describe('input_guard.js (core/dom/input-guard.ts)', () => {
  let stop: () => void;
  let pages: string[];
  beforeEach(() => {
    pages = ['contracts'];
    stop = startInputGuard({ message: () => 'ไม่อนุญาตให้ใช้อักขระพิเศษ', pageNames: () => pages });
  });
  afterEach(() => {
    stop();
    document.body.innerHTML = '';
  });

  it('cancels typing of < > " \' ` \\ ; | { } [ ] $ ^ ~ and lets everything else through', () => {
    const el = field('<input type="text">');
    for (const c of ['<', '>', '"', "'", '`', '\\', ';', '|', '{', '}', '[', ']', '$', '^', '~']) expect(typeChar(el, c), c).toBe(true);
    for (const c of ['a', 'ก', '-', '_', '.', ',', '/', ':', '(', ')', '@', '#', '&', '+', '=', '?', '!', '%', ' ']) expect(typeChar(el, c), c).toBe(false);
    expect(typeChar(el, 'ok<')).toBe(true); // one bad character in the typed text is enough
    expect(typeChar(el, '<', 'insertFromPaste')).toBe(false); // paste / drop are cleaned by the `input` handler instead
    expect(typeChar(el, '<', 'deleteContentBackward')).toBe(false);
  });

  it('shows the warning box with the message and the character, and hides it after 2.2 s', () => {
    vi.useFakeTimers();
    try {
      const el = field('<input type="text">');
      typeChar(el, '<');
      const tip = document.getElementById('ig-warn-tip') as HTMLElement;
      expect(tip.parentElement).toBe(document.body);
      expect(tip.getAttribute('role')).toBe('alert');
      expect(tip.textContent).toBe('ไม่อนุญาตให้ใช้อักขระพิเศษ  <');
      expect(tip.style.display).toBe('block');
      vi.advanceTimersByTime(2199);
      expect(tip.style.display).toBe('block');
      vi.advanceTimersByTime(2);
      expect(tip.style.display).toBe('none');
    } finally {
      vi.useRealTimers();
    }
  });

  it('cleans pasted / script-set values on `input` and keeps the caret where it was', () => {
    const el = field('<input type="text">');
    paste(el, 'ab<c>d"e;f', 7); // caret after `d"`
    expect(el.value).toBe('abcdef');
    expect(el.selectionStart).toBe(4); // 3 bad characters were before the caret
    paste(el, '<<abc', 3);
    expect([el.value, el.selectionStart]).toEqual(['abc', 1]);
    paste(el, 'abc', 1);
    expect([el.value, el.selectionStart]).toEqual(['abc', 1]); // nothing to remove → untouched, no warning change
  });

  it('does not touch a value while an IME is composing', () => {
    const el = field('<input type="text">');
    el.value = 'x<y';
    el.dispatchEvent(new InputEvent('input', { bubbles: true, isComposing: true, inputType: 'insertCompositionText' }));
    expect(el.value).toBe('x<y');
  });

  it('url / email fields (type, or id/name containing url, link, website, email) only block the dangerous few', () => {
    for (const html of ['<input type="email">', '<input type="url">', '<input type="text" id="my_link">', '<input type="text" name="WebSite">', '<input type="text" id="contactEmail">']) {
      const el = field(html);
      expect(typeChar(el, '<'), html).toBe(true);
      expect(typeChar(el, '"'), html).toBe(true);
      expect(typeChar(el, '['), html).toBe(false);
      expect(typeChar(el, '~'), html).toBe(false);
      expect(typeChar(el, '$'), html).toBe(false);
    }
    const mailing = field('<input type="text" id="mailingaddr">'); // "mail" alone does not count
    expect(typeChar(mailing, '['), 'mailing address').toBe(true);
  });

  it('data-block-chars sets the list per field; data-allow-special, read-only, disabled, password, number … are not guarded', () => {
    expect(typeChar(field('<input type="text" data-block-chars="&#">'), '&')).toBe(true);
    expect(typeChar(field('<input type="text" data-block-chars="&#">'), '<')).toBe(false);
    expect(typeChar(field('<input type="text" data-block-chars="">'), '<')).toBe(false);
    for (const html of [
      '<input type="text" data-allow-special>', '<textarea data-allow-special></textarea>', '<input type="text" readonly>', '<input type="text" disabled>',
      '<input type="password">', '<input type="number">', '<input type="date">', '<input type="checkbox">', '<input type="hidden">',
      '<input type="text" class="ods-search">', '<input type="text" class="ui-selectonemenu-filter">',
    ]) {
      expect(typeChar(field(html), '<'), html).toBe(false);
    }
    for (const html of ['<textarea></textarea>', '<input>', '<input type="search">', '<input type="tel">']) expect(typeChar(field(html), '<'), html).toBe(true);
    expect(typeChar(document.body, '<')).toBe(false); // not a field
  });

  it('follows the page: a page in EXCLUDED_PAGES (none today) would switch it off, others are guarded', () => {
    const el = field('<input type="text">');
    for (const p of [['lead'], ['schedule'], []]) {
      pages = p;
      expect(typeChar(el, '<'), p.join()).toBe(true);
    }
  });

  it('destroy() removes the listeners, the timer and the warning box', () => {
    const el = field('<input type="text">');
    typeChar(el, '<');
    expect(document.getElementById('ig-warn-tip')).toBeTruthy();
    stop();
    expect(document.getElementById('ig-warn-tip')).toBeNull();
    expect(typeChar(el, '<')).toBe(false);
    paste(el, 'a<b');
    expect(el.value).toBe('a<b');
    stop = startInputGuard({ message: () => '', pageNames: () => [] }); // so afterEach has something to stop
  });
});

describe('no_autofill.js (core/dom/no-autofill.ts)', () => {
  let stop: () => void;
  let pages: string[];
  const settle = () => new Promise((r) => setTimeout(r, 0)); // MutationObserver callbacks are microtasks
  beforeEach(() => {
    pages = ['contracts'];
  });
  afterEach(() => {
    stop?.();
    document.body.innerHTML = '';
  });

  it('sets autocomplete="off" on the fields that exist and on every field added later, nested ones included', async () => {
    const early = field('<input type="text">');
    stop = startNoAutofill({ pageNames: () => pages });
    expect(early.getAttribute('autocomplete')).toBe('off');

    const box = field('<div><section><input id="a"><textarea id="b"></textarea><input type="password" id="c"></section></div>') as unknown as HTMLElement;
    const late = field('<input type="email">');
    await settle();
    expect(box.querySelector('#a')?.getAttribute('autocomplete')).toBe('off');
    expect(box.querySelector('#b')?.getAttribute('autocomplete')).toBe('off');
    expect(box.querySelector('#c')?.getAttribute('autocomplete')).toBeNull(); // password managers are left alone
    expect(late.getAttribute('autocomplete')).toBe('off');
  });

  it('skips non-text inputs and keeps an autocomplete the page chose itself', async () => {
    stop = startNoAutofill({ pageNames: () => pages });
    const kept = field('<input type="text" autocomplete="on">');
    const empty = field('<input type="text" autocomplete="">');
    const others = ['hidden', 'checkbox', 'radio', 'file', 'submit', 'reset', 'button', 'image', 'range', 'color', 'password'].map((t) => field(`<input type="${t}">`));
    const select = field('<select></select>');
    const num = field('<input type="number">');
    await settle();
    expect(kept.getAttribute('autocomplete')).toBe('on');
    expect(empty.getAttribute('autocomplete')).toBe('');
    for (const el of others) expect(el.getAttribute('autocomplete'), el.type).toBeNull();
    expect(select.getAttribute('autocomplete')).toBeNull();
    expect(num.getAttribute('autocomplete')).toBe('off');
  });

  it('leaves the pages alone that Java excludes: schedule and the whole lead family (lead, lead_*) — checked when a field appears', async () => {
    stop = startNoAutofill({ pageNames: () => pages });
    const results: Record<string, string | null> = {};
    for (const page of ['schedule', 'lead', 'lead_detail', 'lead_step', 'lead_detail_sub1', 'leadership', 'schedules', 'contracts', 'activity']) {
      pages = [page];
      const el = field('<input type="text">');
      await settle();
      results[page] = el.getAttribute('autocomplete');
    }
    expect(results).toEqual({
      schedule: null, lead: null, lead_detail: null, lead_step: null, lead_detail_sub1: null,
      leadership: 'off', schedules: 'off', contracts: 'off', activity: 'off',
    });
    pages = ['contracts', 'lead']; // a route that replaces several pages: any excluded one counts
    const el = field('<input type="text">');
    await settle();
    expect(el.getAttribute('autocomplete')).toBeNull();
  });

  it('destroy() disconnects the observer', async () => {
    stop = startNoAutofill({ pageNames: () => pages });
    stop();
    const el = field('<input type="text">');
    await settle();
    expect(el.getAttribute('autocomplete')).toBeNull();
  });
});

describe('phone_format.js (core/dom/phone-format.ts → TsPhone)', () => {
  const countries = () => MOCK_COUNTRIES;
  const make = (fetchImpl?: () => Promise<Response>) =>
    createTsPhone({
      apiBase: '/triplesale',
      fetch: fetchImpl ?? (() => Promise.resolve(new Response(JSON.stringify({ status: 200, result: countries() }), { status: 200 }))),
    });

  it('digits / masks / format: rule 1 and 2 of the Java header', () => {
    const p = make();
    expect(p.digits('81-234 5678x')).toBe('812345678');
    expect(p.digits(null)).toBe('');
    expect(p.maskGroups('XX XXX XXXX / X XXXX XXXX')).toEqual([2, 3, 4]); // only what is before " / "
    expect(p.maskGroups('')).toEqual([]);
    expect(p.digitCount('XXX XXX XXXX')).toBe(10);
    expect(p.format('0812345678', 'XX XXX XXXX', true)).toBe('81-234-5678'); // from the DB: the front is cut
    expect(p.format('0812345678', 'XX XXX XXXX', false)).toBe('08-123-4567'); // while typing: the end is cut
    expect(p.format('8', 'XX XXX XXXX', false)).toBe('8');
    expect(p.format('123', '', true)).toBe('123'); // no mask: untouched
  });

  it('shows raw numbers until the master has arrived, then "+66 81-234-5678"', async () => {
    const p = make();
    expect(p.isReady()).toBe(false);
    expect(p.display('0812345678', '+66', 'THA')).toBe('0812345678');
    expect(p.display('', '+66', 'THA')).toBe('-');
    const html = document.createElement('div');
    html.innerHTML = p.html('0812345678', '+66', 'THA & "x"');
    const span = html.querySelector('.ts-tel')!;
    expect(span.getAttribute('data-cc')).toBe('THA & "x"');
    expect(span.textContent).toBe('0812345678');

    await p.load();
    expect(p.isReady()).toBe(true);
    expect(p.display('0812345678', '+66', 'THA')).toBe('+66 81-234-5678');
    expect(p.display('2125551234', '+1', 'USA')).toBe('+1 212-555-1234');
    expect(p.display('2125551', '+1', 'AIA')).toBe('+1 212-5551');
    expect(p.display('', '+66', 'THA')).toBe('-');
    expect(p.display(null, null, null)).toBe('-');
    p.refresh(html);
    expect(span.textContent).toBe('+66 81-234-5678'); // refresh() rewrites every .ts-tel
  });

  it('the master: sorted by dial code then country, countries without a dial code still exist (rule 3)', async () => {
    const p = make();
    await p.load();
    expect(p.entries().map((e) => e.country + e.phone)).toEqual(['AIA+1', 'CAN+1', 'USA+1', 'GBR+44', 'MYS+60', 'SGP+65', 'THA+66', 'JPN+81', 'VNM+84', 'KHM+855', 'LAO+856']);
    expect(p.phoneExists('+66')).toBe(true);
    expect(p.phoneExists('+999')).toBe(false);
    expect(p.countryExists('tha')).toBe(true);
    expect(p.countryExists('ATA')).toBe(true); // no dial code, but a real country
    expect(p.phoneOfCountry('ATA')).toBe('');
    expect(p.formatOfCountry('THA')).toBe('XX XXX XXXX / X XXXX XXXX');
  });

  it('resolve(): a dial code that exists wins, else the country\'s, else +66 / THA — and the mask comes from rule 4', async () => {
    const p = make();
    await p.load();
    expect(p.resolve('+66', 'THA')).toEqual({ phone: '+66', country: 'THA', pick: 'THA', fmt: 'XX XXX XXXX / X XXXX XXXX' });
    expect(p.resolve('+999', 'USA')).toMatchObject({ phone: '+1', country: 'USA', pick: 'USA' }); // a made-up code counts as none
    expect(p.resolve(null, 'JPN')).toMatchObject({ phone: '+81', country: 'JPN' });
    expect(p.resolve(null, null)).toMatchObject({ phone: '+66', country: 'THA' });
    expect(p.resolve('+1', null).pick).toBe('CAN'); // +1 is shared by USA / CAN (10 digits) and AIA (7): the longest mask, on a tie the first by country code
    expect(p.resolve('+1', 'AIA').pick).toBe('AIA'); // …unless the country itself uses this code
    expect(p.resolve('+855', 'KHM')).toMatchObject({ phone: '+855', pick: 'KHM', fmt: '' });
    expect(p.pickCountry('+999', 'THA')).toBe('');
  });

  it('applyInput keeps the caret on the same digit while the mask inserts dashes; typing past the mask is refused', () => {
    const p = make();
    const el = document.createElement('input');
    document.body.appendChild(el);
    let value = '';
    const seen: Array<[string, number | null]> = [];
    for (const ch of '081234567890') {
      el.value = value + ch;
      el.setSelectionRange(el.value.length, el.value.length);
      p.applyInput(el, 'XX XXX XXXX', true);
      value = el.value;
      seen.push([el.value, el.selectionStart]);
    }
    expect(seen[0]).toEqual(['0', 1]);
    expect(seen[2]).toEqual(['08-1', 4]);
    expect(seen[9]).toEqual(['08-123-4567', 11]);
    expect(seen[11]).toEqual(['08-123-4567', 11]); // the 11th and 12th digits are not accepted
    el.value = '81-2345-678';
    el.setSelectionRange(5, 5); // after the 4th digit
    p.applyInput(el, 'XX XXX XXXX', true);
    expect([el.value, el.selectionStart]).toEqual(['81-234-5678', 5]);
    el.value = '0812345678';
    p.applyInput(el, 'XX XXX XXXX', false); // a value from the DB: the leading 0 falls off
    expect(el.value).toBe('81-234-5678');
    expect(() => p.applyInput(null, 'XX XXX XXXX', true)).not.toThrow();
    el.remove();
  });

  it('load() asks the BFF once (shared promise); a failed call means an empty master and everything is +66 without a mask', async () => {
    const calls: string[] = [];
    const p = make(() => {
      calls.push('x');
      return Promise.reject(new Error('offline'));
    });
    await Promise.all([p.load(), p.load()]);
    expect(calls).toHaveLength(1);
    expect(p.isReady()).toBe(true);
    expect(p.entries()).toEqual([]);
    expect(p.resolve('+1', 'USA')).toEqual({ phone: '+66', country: 'THA', pick: '', fmt: '' });
    expect(p.display('0812345678', '+66', 'THA')).toBe('+66 0812345678');

    const urls: string[] = [];
    const q = createTsPhone({ apiBase: '/triplesale', fetch: (u) => { urls.push(u); return Promise.resolve(new Response('[]')); } });
    await q.load();
    expect(urls).toEqual(['/triplesale/board/chat-master-data?type=countries']);
  });
});
