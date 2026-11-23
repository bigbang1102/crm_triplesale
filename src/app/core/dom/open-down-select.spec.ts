import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { startOpenDownSelect, type OdsTexts, type OpenDownSelect } from './open-down-select';

const TH: OdsTexts = {
  select: 'เลือก',
  search: 'ค้นหา...',
  noData: 'ไม่พบข้อมูล',
  today: 'วันนี้',
  ok: 'ตกลง',
  clear: 'ล้าง',
  months: ['มกราคม', 'กุมภาพันธ์', 'มีนาคม', 'เมษายน', 'พฤษภาคม', 'มิถุนายน', 'กรกฎาคม', 'สิงหาคม', 'กันยายน', 'ตุลาคม', 'พฤศจิกายน', 'ธันวาคม'],
  dow: ['อา', 'จ', 'อ', 'พ', 'พฤ', 'ศ', 'ส'],
};
const EN: OdsTexts = { ...TH, select: 'Select', search: 'Search...', today: 'Today', clear: 'Clear', months: TH.months.map((_, i) => `Month ${i + 1}`) };

let texts: OdsTexts;
let ods: OpenDownSelect;

const mount = (html: string): HTMLElement => {
  const box = document.createElement('div');
  box.innerHTML = html;
  document.body.appendChild(box);
  return box;
};
/** fields added after the start are picked up by a scan that is debounced by 80 ms */
const settle = () => new Promise((r) => setTimeout(r, 140));
const open = (sel = '.ods-list.open') => document.querySelector<HTMLElement>(sel)!;

const STATUS = `<select id="st"><option value="">เลือกสถานะ</option><option value="a">รอแปล</option><option value="b">กำลังแปล</option><option value="c">เสร็จสมบูรณ์</option></select>`;

describe('open_down_select.js (the system dropdown, calendar and autocomplete)', () => {
  beforeEach(() => {
    texts = TH;
    ods = startOpenDownSelect({ text: () => texts, defaultAvatar: 'assets/images/default_avatar.svg' });
  });
  afterEach(() => {
    ods.destroy();
    document.body.innerHTML = '';
  });

  it('turns a native <select> into a button with a list that opens downwards: placeholder first, the chosen label after', async () => {
    const box = mount(STATUS);
    await settle();
    const sel = box.querySelector<HTMLSelectElement>('select')!;
    const btn = box.querySelector<HTMLElement>('.ods-btn')!;
    expect(sel.style.display).toBe('none');
    // value "" is the placeholder whatever its option says — the page that wants another text writes it itself
    expect(btn.querySelector('.ods-txt')?.textContent).toBe('เลือก');
    expect(btn.querySelector('.ods-txt')?.classList.contains('ods-ph')).toBe(true);

    const changed = vi.fn();
    sel.addEventListener('change', changed);
    btn.click();
    expect(open().classList.contains('ods-list')).toBe(true);
    expect(btn.classList.contains('open')).toBe(true);
    expect([...open().querySelectorAll('.ods-item')].map((i) => i.textContent)).toEqual(['เลือกสถานะ', 'รอแปล', 'กำลังแปล', 'เสร็จสมบูรณ์']);

    open().querySelector<HTMLElement>('[data-v="b"]')!.click();
    expect(sel.value).toBe('b');
    expect(changed).toHaveBeenCalledTimes(1);
    expect(btn.querySelector('.ods-txt')?.textContent).toBe('กำลังแปล');
    expect(btn.querySelector('.ods-txt')?.classList.contains('ods-ph')).toBe(false);
    expect(document.querySelector('.ods-list.open')).toBeNull();
  });

  it('searches inside the list, closes on Escape and on a click anywhere else, and follows a value set from code', async () => {
    const box = mount(STATUS);
    await settle();
    const sel = box.querySelector<HTMLSelectElement>('select')!;
    const btn = box.querySelector<HTMLElement>('.ods-btn')!;

    btn.click();
    const search = open().querySelector<HTMLInputElement>('.ods-search')!;
    expect(search.placeholder).toBe('ค้นหา...');
    search.value = 'แปล';
    search.dispatchEvent(new Event('input'));
    const visible = () => [...open().querySelectorAll<HTMLElement>('.ods-item')].filter((i) => i.style.display !== 'none').map((i) => i.textContent);
    expect(visible()).toEqual(['รอแปล', 'กำลังแปล']);
    search.value = 'zzz';
    search.dispatchEvent(new Event('input'));
    expect(open().querySelector('.ods-empty')?.textContent).toBe('ไม่พบข้อมูล');

    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
    expect(document.querySelector('.ods-list.open')).toBeNull();
    btn.click();
    expect(document.querySelector('.ods-list.open')).toBeTruthy();
    document.body.click();
    expect(document.querySelector('.ods-list.open')).toBeNull();

    // the page sets .value and fires change (what the translator does to restore its filter): the button label follows
    sel.value = 'c';
    sel.dispatchEvent(new Event('change', { bubbles: true }));
    expect(btn.querySelector('.ods-txt')?.textContent).toBe('เสร็จสมบูรณ์');
    // a disabled select does not open
    sel.disabled = true;
    await Promise.resolve();
    await new Promise((r) => setTimeout(r, 0));
    btn.click();
    expect(document.querySelector('.ods-list.open')).toBeNull();
  });

  it('leaves alone the selects that opt out, are multiple, or are already hidden', async () => {
    const box = mount(`<select id="a" data-ods-skip="1"><option>x</option></select><select id="b" multiple><option>x</option></select><select id="c" style="display:none"><option>x</option></select>`);
    await settle();
    expect(box.querySelectorAll('.ods-btn')).toHaveLength(0);
  });

  it('shows the texts of the active language and repaints them after a switch (Java reloads the page)', async () => {
    const box = mount(STATUS);
    await settle();
    expect(box.querySelector('.ods-txt')?.textContent).toBe('เลือก');
    texts = EN;
    ods.refresh();
    expect(box.querySelector('.ods-txt')?.textContent).toBe('Select');
    // a text that is missing (the i18n returns the key) falls back to Thai instead of showing "label.ods.select"
    texts = { ...EN, select: 'label.ods.select' };
    ods.refresh();
    expect(box.querySelector('.ods-txt')?.textContent).toBe('เลือก');
  });

  it('input.ods-date is the calendar: dd/MM/yyyy, month and weekday names of the language, Today / Clear', async () => {
    const box = mount('<input type="text" class="ods-date" id="d" value="15/03/2026">');
    await settle();
    const input = box.querySelector<HTMLInputElement>('#d')!;
    expect(input.readOnly).toBe(true);
    const events: string[] = [];
    input.addEventListener('change', () => events.push(input.value));

    input.click();
    const cal = open('.ods-list.ods-cal.open');
    const heading = (c: HTMLElement) => [...c.querySelectorAll('.ods-cal-dtrig')].map((b) => b.textContent); // the month and the year buttons
    expect(heading(cal)).toEqual(['มีนาคม', '2026']);
    expect([...cal.querySelectorAll('.ods-cal-dow')].map((d) => d.textContent)).toEqual(['Wk', ...TH.dow]);
    expect(cal.querySelector('.ods-cal-day.sel')?.textContent).toBe('15');

    cal.querySelector<HTMLElement>('.ods-cal-day[data-d="2026-3-20"]')!.click();
    expect(input.value).toBe('20/03/2026');
    expect(events).toEqual(['20/03/2026']);
    expect(document.querySelector('.ods-list.open')).toBeNull();

    input.click();
    open('.ods-list.ods-cal.open').querySelector<HTMLElement>('.ods-cal-nav[data-nav="1"]')!.click();
    expect(heading(open('.ods-list.ods-cal.open'))).toEqual(['เมษายน', '2026']);
    open('.ods-list.ods-cal.open').querySelector<HTMLElement>('.ods-cal-btn[data-act="clear"]')!.click();
    expect(input.value).toBe('');

    input.click();
    open('.ods-list.ods-cal.open').querySelector<HTMLElement>('.ods-cal-btn[data-act="today"]')!.click();
    const d = new Date();
    expect(input.value).toBe(`${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}/${d.getFullYear()}`);
  });

  it('odsAutoComplete: suggestions under the field, arrow keys + Enter pick, a click picks, the page decides what a pick does', async () => {
    const box = mount('<input type="text" id="q">');
    const input = box.querySelector<HTMLInputElement>('#q')!;
    const rows = [
      { value: 'Somchai', search: 'somchai 102', html: '<b>Somchai</b>', row: { id: 102 } },
      { value: 'Somsak', search: 'somsak 103', html: '<b>Somsak</b>', row: { id: 103 } },
      { value: 'Other', search: 'other', html: '<b>Other</b>', row: { id: 9 } },
    ];
    const picked = vi.fn();
    (window as any).odsAutoComplete(input, () => rows, { onPick: picked });
    input.focus(); // the user is typing in it (picking calls focus() again — a no-op in a browser when it already has it)

    input.value = 'som';
    input.dispatchEvent(new Event('input', { bubbles: true }));
    const list = open('.ods-list.ods-ac.open');
    expect([...list.querySelectorAll('.ods-item.ods-rich')].map((i) => i.textContent)).toEqual(['Somchai', 'Somsak']); // "Other" does not match

    input.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true }));
    input.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true }));
    expect(list.querySelector('.ods-item.hl')?.textContent).toBe('Somsak');
    input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true }));
    expect(picked).toHaveBeenCalledWith(rows[1], 'Somsak');
    expect(input.value).toBe('Somsak');
    expect(document.querySelector('.ods-list.ods-ac.open')).toBeNull();

    input.value = 'somc';
    input.dispatchEvent(new Event('input', { bubbles: true }));
    open('.ods-list.ods-ac.open').querySelector<HTMLElement>('.ods-item')!.click();
    expect(picked).toHaveBeenLastCalledWith(rows[0], 'Somchai');
  });

  it('puts the dropdown globals on window for the screens generated from Java, and takes everything away on destroy', async () => {
    const box = mount(`${STATUS}<input type="text" class="ods-date" value="01/01/2026">`);
    await settle();
    for (const g of ['odsEnhance', 'odsAutoEnhance', 'odsAutoComplete', 'odsProspectSuggest', 'odsDate', 'odsDateEnhanceAll']) {
      expect(typeof (window as any)[g], g).toBe('function');
    }
    box.querySelector<HTMLElement>('.ods-btn')!.click();
    expect(document.getElementById('odsCss')).toBeTruthy();
    expect(document.querySelectorAll('.ods-list').length).toBeGreaterThan(0);

    ods.destroy();
    expect(document.querySelectorAll('.ods-btn, .ods-list')).toHaveLength(0);
    expect(document.getElementById('odsCss')).toBeNull();
    expect(box.querySelector<HTMLSelectElement>('select')!.style.display).toBe('');
    expect(box.querySelector('select')!.hasAttribute('data-ods')).toBe(false);
    expect((window as any).odsDate).toBeUndefined();
    // nothing reacts any more: a field added now stays native
    mount(STATUS);
    await settle();
    expect(document.querySelectorAll('.ods-btn')).toHaveLength(0);
    // and the document-level listeners are gone (no error when the old handlers would have fired)
    document.body.click();
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
  });

  it('an autocomplete list or calendar of a screen that is gone is cleaned up with the next scan', async () => {
    const box = mount('<input type="text" id="q"><input type="text" class="ods-date" id="d">');
    await settle();
    (window as any).odsAutoComplete(box.querySelector('#q'), () => []);
    expect(document.querySelectorAll('.ods-list.ods-ac, .ods-list.ods-cal')).toHaveLength(2);
    box.remove();
    mount('<select id="trigger"><option>x</option></select>'); // a new field wakes the scan
    await settle();
    expect(document.querySelectorAll('.ods-list.ods-ac, .ods-list.ods-cal')).toHaveLength(0);
  });
});
