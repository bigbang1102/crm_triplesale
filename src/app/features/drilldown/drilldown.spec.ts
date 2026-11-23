import { signal } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { By } from '@angular/platform-browser';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ConfigService } from '@core/config/config.service';
import { I18n } from '@core/i18n/i18n.service';
import { configStub } from '@core/testing/test-helpers';
import { Drilldown } from './drilldown';
import { DrilldownView } from './drilldown-view';
import { createMockDrilldown } from './drilldown.mock';

const lang = signal<'th' | 'en'>('th');
const t = (k: string) => k;

/** a ResizeObserver that records what the page observes and disconnects (jsdom has none) */
class FakeResizeObserver {
  static all: FakeResizeObserver[] = [];
  observed: Element[] = [];
  disconnected = false;
  constructor(public cb: () => void) {
    FakeResizeObserver.all.push(this);
  }
  observe(el: Element): void {
    this.observed.push(el);
  }
  disconnect(): void {
    this.disconnected = true;
  }
  unobserve(): void {}
}

describe('DrillDown page (pages/drilldown.xhtml, generated)', () => {
  let fixture: ComponentFixture<Drilldown>;
  let el: HTMLElement;
  let delayMs = 0;

  const $ = <T extends HTMLElement = HTMLElement>(sel: string) => el.querySelector<T>(sel)!;
  const $$ = <T extends HTMLElement = HTMLElement>(sel: string) => [...el.querySelectorAll<T>(sel)];
  const text = (sel: string) => ($(sel)?.textContent ?? '').trim();
  const settle = (fn: () => void) => vi.waitFor(fn, { timeout: 4000, interval: 20 });
  const up = () => settle(() => expect($$('#ddBody tr[data-row], #ddBody td.dd-msg').length).toBeGreaterThan(0));
  const caret = (label: string) => $$('#ddHead th').find((th) => th.textContent!.trim() === label)!.querySelector<HTMLElement>('.dd-cf')!;

  async function create(code = 'T-CS-01', mock = true): Promise<void> {
    TestBed.configureTestingModule({
      providers: [
        { provide: ConfigService, useValue: configStub({ mock }) },
        { provide: I18n, useValue: { lang, t, use: async (l: 'th' | 'en') => lang.set(l) } },
      ],
    });
    fixture = TestBed.createComponent(Drilldown);
    fixture.componentRef.setInput('code', code);
    document.body.appendChild(fixture.nativeElement);
    fixture.detectChanges();
    el = fixture.nativeElement as HTMLElement;
  }

  beforeEach(() => {
    lang.set('th');
    delayMs = 0;
    FakeResizeObserver.all = [];
    vi.stubGlobal('ResizeObserver', FakeResizeObserver);
    vi.spyOn(DrilldownView.prototype as unknown as { backend(): Promise<unknown> }, 'backend').mockImplementation(async () => createMockDrilldown({ delayMs }));
  });
  afterEach(() => {
    fixture?.destroy();
    TestBed.resetTestingModule();
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it('is the markup of the Java page and draws the first page of the report from the backend', async () => {
    await create();
    await up();
    expect(text('#ddCodeTxt')).toBe('T-CS-01');
    expect(text('#ddCountTxt')).toBe('( 64 )');
    expect($$('#ddBody tr[data-row]')).toHaveLength(64);
    // the header: the number column + the 17 columns of the report, a filter caret on every one but the long text
    expect($$('#ddHead th')).toHaveLength(18);
    expect($$('#ddHead .dd-cf')).toHaveLength(16);
    expect($('#ddHead th.dd-long').textContent!.trim()).toBe('รายละเอียดติดต่อ');
    // the sample-data pill is shown (the backend says mock: true), the error bar is not
    expect($('#ddMockPill').style.display).toBe('');
    expect($('#ddError').classList.contains('show')).toBe(false);
    // the pager: first, previous, page 1, next, last
    expect($$('#ddPager .dd-pg-btn').map((b) => b.dataset['nav'] ?? b.dataset['page'])).toEqual(['first', 'prev', '1', 'next', 'last']);
    expect($$('#ddPager .dd-pg-btn').filter((b) => b.hasAttribute('disabled')).length).toBe(4);
    // the texts come from t('label.drilldown.…')
    expect(text('#ddExportBtn')).toBe('label.drilldown.excel');
    expect($('#ddExportBtn').getAttribute('title')).toBe('label.drilldown.export');
    expect($('#ddFMenuSearch').getAttribute('placeholder')).toBe('label.drilldown.filter_search');
    expect(text('#ddFMenuApply')).toBe('label.drilldown.apply');
  });

  it('sets the window title like the Java page does: "DrillDown <code>"', async () => {
    await create('T-LS-02');
    await up();
    expect(document.title).toBe('DrillDown T-LS-02');
  });

  it('upper-cases the code of the address; an unknown report shows the message of the service in the error bar and a message row', async () => {
    await create('t-ls-02');
    await up();
    expect(text('#ddCodeTxt')).toBe('T-LS-02');
    fixture.destroy();
    TestBed.resetTestingModule();

    await create('T-ZZ-99');
    await up();
    expect($('#ddError').classList.contains('show')).toBe(true);
    expect(text('#ddErrorTxt')).toBe('ไม่รู้จักรายงาน: T-ZZ-99');
    expect(text('#ddBody td.dd-msg')).toBe('ไม่รู้จักรายงาน: T-ZZ-99');
    expect($('#ddMockPill').style.display).toBe('none');
    expect(text('#ddCountTxt')).toBe('');
  });

  it('a failed answer (not JSON) is reported with the load-failed text and the page keeps working', async () => {
    await create('X-ERR-BAD');
    await up();
    expect(text('#ddErrorTxt')).toMatch(/^label\.drilldown\.load_fail — SyntaxError/);
    expect(text('#ddBody td.dd-msg')).toBe('label.drilldown.load_fail');
    // the pager is drawn anyway (one disabled page) and the page can still be asked for another page
    expect($$('#ddPager .dd-pg-btn')).toHaveLength(5);
  });

  it('shows the empty message when the report has no rows, and Excel does nothing', async () => {
    await create('X-EMPTY');
    await up();
    expect(text('#ddBody td.dd-msg')).toBe('label.drilldown.no_data');
    const created = vi.fn(() => 'blob:x');
    (URL as unknown as Record<string, unknown>)['createObjectURL'] = created;
    $('#ddExportBtn').click();
    expect(created).not.toHaveBeenCalled();
  });

  it('pages: 100 rows per page, the number column continues, the buttons go to the page they name', async () => {
    await create('T-PLS-02'); // 110 rows
    await up();
    expect($$('#ddBody tr[data-row]')).toHaveLength(100);
    expect(text('#ddCountTxt')).toBe('( 110 )');
    $('#ddPager .dd-pg-btn[data-page="2"]').click();
    await settle(() => expect($$('#ddBody tr[data-row]')).toHaveLength(10));
    expect($('#ddBody tr[data-row] td.dd-no').textContent).toBe('101');
    expect($('#ddPager .dd-pg-btn.active').textContent).toBe('2');
    $('#ddPager .dd-pg-btn[data-nav="first"]').click();
    await settle(() => expect($$('#ddBody tr[data-row]')).toHaveLength(100));
    expect($('#ddBody tr[data-row] td.dd-no').textContent).toBe('1');
  });

  it('the pager shows a window of 10 page numbers that follows the current page', async () => {
    await create('X-BIG'); // 1,234 rows = 13 pages
    await up();
    const numbers = () => $$('#ddPager .dd-pg-btn[data-page]').map((b) => Number(b.dataset['page']));
    expect(numbers()).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
    $('#ddPager .dd-pg-btn[data-nav="last"]').click();
    await settle(() => expect($('#ddPager .dd-pg-btn.active')?.textContent).toBe('13'));
    expect(numbers()).toEqual([4, 5, 6, 7, 8, 9, 10, 11, 12, 13]);
    expect($$('#ddBody tr[data-row]')).toHaveLength(34);
  });

  describe('the column filter', () => {
    it('opens a list of the distinct values of the column; ticking a value and "apply" hides the other rows and marks the caret', async () => {
      await create();
      await up();
      const rows = $$('#ddBody tr[data-row]');
      caret('ประเทศ').click();
      expect($('#ddFMenu').classList.contains('show')).toBe(true);
      expect($('#ddFMenu').classList.contains('date-mode')).toBe(false);
      const values = $$('#ddFMenuList .dd-fmenu-item').map((i) => i.textContent!.trim());
      expect(values.length).toBeGreaterThan(1);
      expect([...values].sort((a, b) => a.localeCompare(b, 'th'))).toEqual(values);
      $$<HTMLInputElement>('#ddFMenuList .dd-fmenu-item input')[0].click();
      $('#ddFMenuApply').click();
      expect($('#ddFMenu').classList.contains('show')).toBe(false);
      expect(caret('ประเทศ').classList.contains('on')).toBe(true);
      const shown = rows.filter((r) => r.style.display !== 'none');
      expect(shown.length).toBeGreaterThan(0);
      expect(shown.length).toBeLessThan(rows.length);
      // the stripes are counted again over the rows that are shown
      expect(shown.map((r) => r.classList.contains('dd-alt'))).toEqual(shown.map((_, i) => i % 2 === 1));
      // …and nothing ticked + apply removes the filter again
      caret('ประเทศ').click();
      $$<HTMLInputElement>('#ddFMenuList .dd-fmenu-item input')[0].click();
      $('#ddFMenuApply').click();
      expect(rows.every((r) => r.style.display !== 'none')).toBe(true);
      expect(caret('ประเทศ').classList.contains('on')).toBe(false);
    });

    it('the search box narrows the list; no match → the "no results" text; Escape and a click outside close the menu', async () => {
      await create();
      await up();
      caret('ประเทศ').click();
      const q = $<HTMLInputElement>('#ddFMenuSearch');
      q.value = 'zzzz';
      q.dispatchEvent(new Event('input', { bubbles: true }));
      expect(text('#ddFMenuList .dd-fmenu-empty')).toBe('label.drilldown.no_search_results');
      document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
      expect($('#ddFMenu').classList.contains('show')).toBe(false);
      caret('ประเทศ').click();
      document.dispatchEvent(new MouseEvent('click', { bubbles: true }));
      expect($('#ddFMenu').classList.contains('show')).toBe(false);
      // a click inside the menu does not close it; the same caret again does
      caret('ประเทศ').click();
      $('#ddFMenuList').click();
      expect($('#ddFMenu').classList.contains('show')).toBe(true);
      caret('ประเทศ').click();
      expect($('#ddFMenu').classList.contains('show')).toBe(false);
    });

    it('a date column opens a calendar instead of a list; a day filters the column at once', async () => {
      await create();
      await up();
      caret('วันที่รับแจก').click();
      expect($('#ddFMenu').classList.contains('date-mode')).toBe(true);
      expect($$('#ddFMenuCal .dd-cal-day')).toHaveLength(42);
      // the day of the first filled cell of the column
      const idx = $$('#ddHead th').findIndex((th) => th.textContent!.trim() === 'วันที่รับแจก');
      const cells = $$('#ddBody tr[data-row]').map((r) => r.children[idx].textContent!.trim());
      const first = cells.find(Boolean)!;
      const [d, m, y] = first.split('/');
      const iso = `${y}-${m}-${d}`;
      for (let i = 0; i < 160 && !$(`#ddFMenuCal .dd-cal-day[data-date="${iso}"]:not(.other)`); i++) $('#ddFMenuCal .dd-cal-nav[data-move="-1"]').click();
      for (let i = 0; i < 160 && !$(`#ddFMenuCal .dd-cal-day[data-date="${iso}"]:not(.other)`); i++) $('#ddFMenuCal .dd-cal-nav[data-move="1"]').click();
      $(`#ddFMenuCal .dd-cal-day[data-date="${iso}"]:not(.other)`).click();
      expect($('#ddFMenu').classList.contains('show')).toBe(false);
      expect(caret('วันที่รับแจก').classList.contains('on')).toBe(true);
      const shown = $$('#ddBody tr[data-row]').filter((r) => r.style.display !== 'none');
      expect(shown.length).toBeGreaterThan(0);
      expect(shown.every((r) => r.children[idx].textContent!.trim() === first)).toBe(true);
      // "clear" in the calendar removes the filter
      caret('วันที่รับแจก').click();
      expect($('#ddFMenuCal .dd-cal-day.sel')?.dataset['date']).toBe(iso);
      $('#ddFMenuCal [data-clear]').click();
      expect(caret('วันที่รับแจก').classList.contains('on')).toBe(false);
      expect($$('#ddBody tr[data-row]').every((r) => r.style.display !== 'none')).toBe(true);
    });

    it('the calendar takes its locale from the language: Gregorian years in Thai, short day names in English', async () => {
      await create();
      await up();
      caret('วันที่รับแจก').click();
      const th = text('#ddFMenuCal .dd-cal-title');
      expect(th).toMatch(/2569|2026/); // th-TH-u-ca-gregory: the year of the data (2026), not the Buddhist 2569
      expect(th).not.toMatch(/2569/);
      expect($$('#ddFMenuCal thead th').slice(1).map((c) => c.textContent)).toHaveLength(7);
      fixture.destroy();
      TestBed.resetTestingModule();
      lang.set('en');
      await create();
      await up();
      caret('วันที่รับแจก').click();
      expect($$('#ddFMenuCal thead th').slice(1).map((c) => c.textContent)).toEqual(['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']);
    });
  });

  describe('Excel (the CSV of the page that is on screen)', () => {
    let blobs: Blob[];
    let downloads: { download: string; href: string }[];
    let revoked: string[];
    beforeEach(() => {
      blobs = [];
      downloads = [];
      revoked = [];
      (URL as unknown as Record<string, unknown>)['createObjectURL'] = vi.fn((b: Blob) => (blobs.push(b), `blob:csv-${blobs.length}`));
      (URL as unknown as Record<string, unknown>)['revokeObjectURL'] = vi.fn((u: string) => void revoked.push(u));
      vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(function (this: HTMLAnchorElement) {
        downloads.push({ download: this.download, href: this.href });
      });
    });

    it('downloads "<code>-<yyyymmddhhmm>.csv": BOM, CRLF, the titles, every cell quoted, dates as dd/mm/yyyy, money with thousands separators', async () => {
      await create('T-LS-01');
      await up();
      $('#ddExportBtn').click();
      expect(downloads).toHaveLength(1);
      expect(downloads[0].download).toMatch(/^T-LS-01-\d{12}\.csv$/);
      expect(downloads[0].href).toMatch(/^blob:csv-1/);
      expect(blobs[0].type).toBe('text/csv;charset=utf-8;');
      // Blob.text() drops a BOM, so look at the bytes: EF BB BF
      const bytes = new Uint8Array(await blobs[0].arrayBuffer());
      expect([...bytes.slice(0, 3)]).toEqual([0xef, 0xbb, 0xbf]);
      const csv = new TextDecoder('utf-8', { ignoreBOM: true }).decode(bytes);
      expect(csv.charCodeAt(0)).toBe(0xfeff);
      const lines = csv.slice(1).split('\r\n');
      expect(lines).toHaveLength(1 + 100);
      const titles = $$('#ddHead th').slice(1).map((th) => th.textContent!.trim());
      expect(lines[0]).toBe(titles.map((x) => `"${x}"`).join(','));
      // the first data row: the cells as they are shown (a date is dd/mm/yyyy, the price has a thousands separator)
      const shown = $$('#ddBody tr[data-row]')[0];
      const cells = [...shown.children].slice(1).map((c) => c.textContent!.trim());
      expect(lines[1]).toBe(cells.map((x) => `"${x.replace(/"/g, '""')}"`).join(','));
      expect(cells.some((c) => /^\d{2}\/\d{2}\/\d{4}$/.test(c))).toBe(true);
      expect(cells.some((c) => /^\d{1,3}(,\d{3})+$/.test(c))).toBe(true);
    });

    it('exports the page, not the filter: rows hidden by a column filter are still in the file', async () => {
      await create();
      await up();
      caret('ประเทศ').click();
      $$<HTMLInputElement>('#ddFMenuList .dd-fmenu-item input')[0].click();
      $('#ddFMenuApply').click();
      $('#ddExportBtn').click();
      expect((await blobs[0].text()).split('\r\n')).toHaveLength(1 + 64);
    });

    it('revokes the blob URL a second later, or at once when the screen is left', async () => {
      vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
      try {
        await create();
        await vi.waitFor(() => expect($$('#ddBody tr[data-row]').length).toBeGreaterThan(0), { timeout: 4000, interval: 20 });
        $('#ddExportBtn').click();
        expect(revoked).toEqual([]);
        vi.advanceTimersByTime(1000);
        expect(revoked).toEqual(['blob:csv-1']);
        $('#ddExportBtn').click();
        fixture.destroy();
        expect(revoked).toEqual(['blob:csv-1', 'blob:csv-2']);
      } finally {
        vi.useRealTimers();
      }
    });
  });

  it('a language switch is a page reload in Java; so is a link to another report: a NEW page instance', async () => {
    await create();
    await up();
    const first = fixture.debugElement.query(By.directive(DrilldownView)).componentInstance;
    lang.set('en');
    fixture.detectChanges();
    TestBed.tick?.();
    await settle(() => expect(fixture.debugElement.query(By.directive(DrilldownView)).componentInstance).not.toBe(first));
    await up();
    const second = fixture.debugElement.query(By.directive(DrilldownView)).componentInstance;
    fixture.componentRef.setInput('code', 'T-PLS-01');
    fixture.detectChanges();
    await settle(() => expect(fixture.debugElement.query(By.directive(DrilldownView)).componentInstance).not.toBe(second));
    await settle(() => expect(text('#ddCodeTxt')).toBe('T-PLS-01'));
    await up();
    expect(text('#ddCodeTxt')).toBe('T-PLS-01');
  });

  describe('leaving the page', () => {
    it('removes every listener, observer and timer it put on the document / window, and the drag-scroll classes', async () => {
      const added: [object, string, unknown][] = [];
      const removed: [object, string, unknown][] = [];
      const track = (target: EventTarget, name: string): void => {
        const add = target.addEventListener.bind(target);
        const rm = target.removeEventListener.bind(target);
        vi.spyOn(target, 'addEventListener').mockImplementation(((type: string, fn: unknown, opts?: unknown) => (added.push([target, type, fn]), add(type, fn as never, opts as never))) as never);
        vi.spyOn(target, 'removeEventListener').mockImplementation(((type: string, fn: unknown, opts?: unknown) => (removed.push([target, type, fn]), rm(type, fn as never, opts as never))) as never);
        void name;
      };
      const timers = new Set<unknown>();
      const st = window.setTimeout.bind(window);
      const ct = window.clearTimeout.bind(window);
      vi.spyOn(window, 'setTimeout').mockImplementation(((fn: () => void, ms?: number, ...a: unknown[]) => {
        const h = st(() => (timers.delete(h), fn()), ms, ...a);
        if (ms === 120 || ms === 1000) timers.add(h);
        return h;
      }) as never);
      vi.spyOn(window, 'clearTimeout').mockImplementation(((h: never) => (timers.delete(h), ct(h))) as never);

      track(document, 'document');
      track(window, 'window');
      await create();
      await up();
      // the page registered its global listeners (click / keydown on the document, resize on the window, the drag-scroll mouse events)
      const types = new Set(added.map(([, type]) => type));
      for (const type of ['click', 'keydown', 'resize', 'mousemove', 'mouseup']) expect(types.has(type), type).toBe(true);
      // use everything the page registers: a resize (schedules the 120 ms re-measure), an open menu, an export
      window.dispatchEvent(new Event('resize'));
      caret('ประเทศ').click();
      const wrap = $('#ddScroll');
      expect(wrap.getAttribute('data-ds-bound')).toBe('1');
      expect(wrap.classList.contains('ds-scroll')).toBe(true);
      expect(timers.size).toBeGreaterThan(0);

      fixture.destroy();
      expect(timers.size).toBe(0);
      expect(FakeResizeObserver.all.length).toBeGreaterThan(0);
      expect(FakeResizeObserver.all.every((o) => o.disconnected)).toBe(true);
      // the drag-scroll of the table is undone too
      expect(wrap.hasAttribute('data-ds-bound')).toBe(false);
      expect(wrap.classList.contains('ds-scroll')).toBe(false);
      // what was added on document / window while the page was up has been removed again (the page's own listeners)
      const open = added.filter(([tg, type, fn]) => !removed.some(([rt, rtype, rfn]) => rt === tg && rtype === type && rfn === fn));
      expect(open.map(([, type]) => type)).toEqual([]);
    });

    it('an answer that comes after the page was left paints nothing (it never settles)', async () => {
      delayMs = 120;
      await create();
      await settle(() => expect($('#ddBody .dd-skel')).toBeTruthy()); // the request is out
      const body = $('#ddBody');
      fixture.destroy();
      await new Promise((r) => setTimeout(r, 400));
      expect(body.querySelector('tr[data-row]')).toBeNull();
      expect(body.querySelector('.dd-skel')).toBeTruthy();
    });
  });

  it('with mock off the host asks the LIVE backend (not the sample data) and draws what it answers', async () => {
    const backend = vi.spyOn(DrilldownView.prototype as unknown as { backend(): Promise<unknown> }, 'backend');
    await create('T-CS-01', false);
    await up();
    expect(backend).toHaveBeenCalledTimes(1);
    expect(el.querySelector('ts-live-missing')).toBeNull();
    expect(el.querySelector('.ct-root')).toBeTruthy();
  });
});
