import { describe, expect, it } from 'vitest';
import {
  DASHBOARD_TABS,
  isDashboardTab,
  nextScrollLeft,
  tabAfterKey,
} from './sales-dashboard.logic';

describe('sales dashboard logic', () => {
  describe('tabAfterKey', () => {
    it('should move to the next / previous tab when an arrow key is pressed', () => {
      expect(tabAfterKey('overview', 'ArrowRight')).toBe('lead');
      expect(tabAfterKey('lead', 'ArrowLeft')).toBe('overview');
    });

    it('should wrap around when moving past either end', () => {
      expect(tabAfterKey('chat', 'ArrowRight')).toBe('overview');
      expect(tabAfterKey('overview', 'ArrowLeft')).toBe('chat');
    });

    it('should jump to the first / last tab when Home / End is pressed', () => {
      expect(tabAfterKey('team', 'Home')).toBe('overview');
      expect(tabAfterKey('team', 'End')).toBe('chat');
    });

    it('should do nothing when any other key is pressed', () => {
      expect(tabAfterKey('team', 'Enter')).toBeUndefined();
      expect(tabAfterKey('team', 'a')).toBeUndefined();
    });
  });

  describe('nextScrollLeft', () => {
    it('should advance one visible width when there is more to the right', () => {
      expect(nextScrollLeft({ scrollLeft: 0, clientWidth: 400, scrollWidth: 1000 })).toBe(400);
    });

    it('should stop at the end instead of overshooting', () => {
      expect(nextScrollLeft({ scrollLeft: 400, clientWidth: 400, scrollWidth: 1000 })).toBe(600);
    });

    it('should go back to the start when the end is reached (also within 1px)', () => {
      expect(nextScrollLeft({ scrollLeft: 600, clientWidth: 400, scrollWidth: 1000 })).toBe(0);
      expect(nextScrollLeft({ scrollLeft: 599.5, clientWidth: 400, scrollWidth: 1000 })).toBe(0);
    });

    it('should stay at 0 when the track does not overflow', () => {
      expect(nextScrollLeft({ scrollLeft: 0, clientWidth: 400, scrollWidth: 400 })).toBe(0);
    });
  });

  it('isDashboardTab should accept only the six tabs', () => {
    for (const tab of DASHBOARD_TABS) expect(isDashboardTab(tab)).toBe(true);
    expect(isDashboardTab('kpi')).toBe(false);
    expect(isDashboardTab(null)).toBe(false);
  });
});
