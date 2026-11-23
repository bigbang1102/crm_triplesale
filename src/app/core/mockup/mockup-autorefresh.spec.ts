import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { DELAY_MS, QUIET_MS, RETRY_MS, isSafeToRefresh, scheduleAutoRefresh, stopAutoRefresh, typedAtForTests } from './mockup-autorefresh';

const LONG_AGO = 0;
let originalPath = '';

beforeEach(() => {
  originalPath = `${location.pathname}${location.search}`;
  sessionStorage.clear();
  localStorage.removeItem('ts.mockup.autoRefresh');
  typedAtForTests(LONG_AGO);
});
afterEach(() => {
  stopAutoRefresh();
  vi.useRealTimers();
  document.body.innerHTML = '';
  (document.activeElement as HTMLElement | null)?.blur();
  history.replaceState(null, '', originalPath);
});

describe('when the page may load itself again after a change of somebody else', () => {
  it('should be safe on a quiet page', () => {
    expect(isSafeToRefresh()).toBe(true);
  });

  it('should not be safe while a field has the focus', () => {
    document.body.innerHTML = '<input id="f" />';
    (document.getElementById('f') as HTMLInputElement).focus();
    expect(isSafeToRefresh()).toBe(false);
  });

  it('should not be safe with a dialog open, a field the user changed, or a form in the address', () => {
    document.body.innerHTML = '<div role="dialog">x</div>';
    expect(isSafeToRefresh()).toBe(false);
    document.body.innerHTML = '<input class="ng-dirty" />';
    expect(isSafeToRefresh()).toBe(false);
    document.body.innerHTML = '';
    history.replaceState(null, '', '/crm/lead/new');
    expect(isSafeToRefresh()).toBe(false);
    history.replaceState(null, '', '/sales/doc?action_type=edit');
    expect(isSafeToRefresh()).toBe(false);
  });

  it('should wait for the user to be quiet for a while after typing', () => {
    const now = Date.now();
    typedAtForTests(now - 2000);
    expect(isSafeToRefresh(now)).toBe(false);
    expect(isSafeToRefresh(now - 2000 + QUIET_MS + 1)).toBe(true);
  });

  it('should not load again twice in a row (never a loop)', () => {
    sessionStorage.setItem('ts.mockup.autoRefreshAt', String(Date.now()));
    expect(isSafeToRefresh()).toBe(false);
    sessionStorage.setItem('ts.mockup.autoRefreshAt', String(Date.now() - 60000));
    expect(isSafeToRefresh()).toBe(true);
  });
});

describe('loading the page again', () => {
  it('should load it after a short delay when it is safe, and say so', () => {
    vi.useFakeTimers();
    const reload = vi.fn();
    const told = vi.fn();
    scheduleAutoRefresh({ reload, told });
    expect(told).toHaveBeenCalledWith('soon');
    vi.advanceTimersByTime(DELAY_MS - 1);
    expect(reload).not.toHaveBeenCalled();
    vi.advanceTimersByTime(2);
    expect(reload).toHaveBeenCalledTimes(1);
  });

  it('should wait while it is not safe, and load it as soon as it is', () => {
    vi.useFakeTimers();
    document.body.innerHTML = '<div role="dialog">x</div>';
    const reload = vi.fn();
    const told = vi.fn();
    scheduleAutoRefresh({ reload, told });
    expect(told).toHaveBeenCalledWith('waiting');
    vi.advanceTimersByTime(RETRY_MS * 3);
    expect(reload).not.toHaveBeenCalled();
    document.body.innerHTML = ''; // the dialog was closed
    vi.advanceTimersByTime(RETRY_MS + DELAY_MS + 10);
    expect(reload).toHaveBeenCalledTimes(1);
  });

  it('should look again just before it loads (the user started to type in the delay)', () => {
    vi.useFakeTimers();
    const reload = vi.fn();
    scheduleAutoRefresh({ reload });
    document.body.innerHTML = '<input id="f" />';
    (document.getElementById('f') as HTMLInputElement).focus();
    vi.advanceTimersByTime(DELAY_MS + 10);
    expect(reload).not.toHaveBeenCalled();
  });

  it('should make one load of a burst of changes', () => {
    vi.useFakeTimers();
    const reload = vi.fn();
    scheduleAutoRefresh({ reload });
    scheduleAutoRefresh({ reload });
    scheduleAutoRefresh({ reload });
    vi.advanceTimersByTime(DELAY_MS + 10);
    expect(reload).toHaveBeenCalledTimes(1);
  });

  it('should do nothing when the user turned it off', () => {
    vi.useFakeTimers();
    localStorage.setItem('ts.mockup.autoRefresh', 'off');
    const reload = vi.fn();
    scheduleAutoRefresh({ reload });
    vi.advanceTimersByTime(60000);
    expect(reload).not.toHaveBeenCalled();
  });
});
