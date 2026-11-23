import { signal } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { I18n } from '@core/i18n/i18n.service';
import { ToastService } from '@shared/ui/notify/toast.service';
import { DASHBOARD_TABS } from './sales-dashboard.logic';
import { SalesDashboard } from './sales-dashboard';

describe('SalesDashboard (/dashboard, generated from the designer snapshot)', () => {
  let fixture: ComponentFixture<SalesDashboard>;
  let el: HTMLElement;
  const info = vi.fn();

  const panel = () => el.querySelector('#db-panel');
  const tabButton = (tab: string) => el.querySelector<HTMLButtonElement>(`#db-tab-${tab}`);

  beforeEach(() => {
    info.mockReset();
    TestBed.configureTestingModule({
      providers: [
        { provide: I18n, useValue: { lang: signal('th'), t: (key: string) => key } },
        { provide: ToastService, useValue: { info } },
      ],
    });
    fixture = TestBed.createComponent(SalesDashboard);
    el = fixture.nativeElement;
    document.body.appendChild(el);
    fixture.detectChanges();
  });

  afterEach(() => el.remove());

  it('should show the overview panel when the page opens', () => {
    expect(el.hasAttribute('data-h-sales-dashboard')).toBe(true);
    expect(panel()?.getAttribute('aria-labelledby')).toBe('db-tab-overview');
    expect(tabButton('overview')?.getAttribute('aria-selected')).toBe('true');
    expect(tabButton('overview')?.tabIndex).toBe(0);
    expect(tabButton('lead')?.tabIndex).toBe(-1);
  });

  it('should render the panel of every tab when its button is clicked', () => {
    for (const tab of DASHBOARD_TABS) {
      tabButton(tab)?.click();
      fixture.detectChanges();
      expect(panel()?.getAttribute('aria-labelledby'), tab).toBe(`db-tab-${tab}`);
      expect(tabButton(tab)?.getAttribute('aria-selected'), tab).toBe('true');
      expect(el.querySelectorAll('[aria-selected="true"][role="tab"]').length, tab).toBe(1);
    }
  });

  it('should move to the next tab when ArrowRight is pressed on the tab strip', () => {
    tabButton('overview')?.dispatchEvent(
      new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true }),
    );
    fixture.detectChanges();
    expect(panel()?.getAttribute('aria-labelledby')).toBe('db-tab-lead');
  });

  it('should press one chip of a group when a chip is clicked', () => {
    const chips = [...el.querySelectorAll<HTMLButtonElement>('ts-db-chips .chip')].slice(0, 2);
    expect(chips.length).toBe(2);
    chips[1]?.click();
    expect(chips.map((c) => c.getAttribute('aria-pressed'))).toEqual(['false', 'true']);
  });

  it('should tell the user it is not ready when a head button that has no behaviour yet is clicked', () => {
    el.querySelector<HTMLButtonElement>('.cbtn')?.click();
    el.querySelector<HTMLButtonElement>('.fbtn')?.click();
    expect(info).toHaveBeenCalledTimes(2);
    expect(info).toHaveBeenCalledWith('app.salesDashboard.notReady');
  });
});
