import { describe, expect, it } from 'vitest';
import { badgeText, bangkokDateTime, bangkokDay, sectionOf, seedNotifications, unreadCount, visibleNotifications } from './notification.model';

const NOW = new Date('2026-11-20T08:00:00.000Z'); // 15:00 in Bangkok
const none = { read: [], hidden: [] };

describe('notification model', () => {
  it('should read the day and the time in Asia/Bangkok whatever the machine zone is', () => {
    expect(bangkokDay('2026-11-19T18:30:00.000Z')).toBe('2026-11-20');
    expect(bangkokDateTime('2026-11-19T18:30:00.000Z')).toBe('20/11/2026 01:30');
  });

  it('should seed the four notifications of the design first, today and earlier, with the newest at the top', () => {
    const seed = seedNotifications(NOW);
    expect(seed.length).toBeGreaterThanOrEqual(4);
    expect(seed.slice(0, 2).map((n) => sectionOf(n, NOW))).toEqual(['today', 'today']);
    expect(seed.slice(2).every((n) => sectionOf(n, NOW) === 'earlier')).toBe(true);
    expect(bangkokDateTime(seed[0]?.at ?? '')).toBe('20/11/2026 13:30');
    expect(visibleNotifications(seed, none, { tab: 'all', from: '', to: '' })[0]?.id).toBe('n-follow-up');
  });

  it('should hide the hidden ones, keep only the unread ones on the unread tab, and count them', () => {
    const seed = seedNotifications(NOW);
    const marks = { read: ['n-follow-up'], hidden: ['n-quote-approved'] };
    expect(unreadCount(seed, marks)).toBe(seed.length - 2);
    const unread = visibleNotifications(seed, marks, { tab: 'unread', from: '', to: '' }).map((n) => n.id);
    expect(unread).not.toContain('n-follow-up');
    expect(unread).not.toContain('n-quote-approved');
    expect(visibleNotifications(seed, marks, { tab: 'all', from: '', to: '' }).map((n) => n.id)).toContain('n-follow-up');
  });

  it('should include both days of the range and accept an open end', () => {
    const seed = seedNotifications(NOW);
    const today = visibleNotifications(seed, none, { tab: 'all', from: '2026-11-20', to: '2026-11-20' });
    expect(today.map((n) => n.id)).toEqual(['n-follow-up', 'n-quote-approved']);
    expect(visibleNotifications(seed, none, { tab: 'all', from: '2026-11-20', to: '' })).toHaveLength(2);
    expect(visibleNotifications(seed, none, { tab: 'all', from: '2030-01-01', to: '' })).toEqual([]);
  });

  it('should cap the badge text at 99+', () => {
    expect(badgeText(7)).toBe('7');
    expect(badgeText(99)).toBe('99');
    expect(badgeText(100)).toBe('99+');
  });
});
