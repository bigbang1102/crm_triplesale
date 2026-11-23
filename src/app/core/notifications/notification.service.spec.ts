import { TestBed } from '@angular/core/testing';
import { signal } from '@angular/core';
import { beforeEach, describe, expect, it } from 'vitest';
import { AuthService } from '@core/auth/auth.service';
import { NotificationService } from './notification.service';

describe('NotificationService', () => {
  const username = signal('somchai');

  const create = (): NotificationService => {
    TestBed.configureTestingModule({ providers: [{ provide: AuthService, useValue: { session: () => ({ username: username() }) } }] });
    return TestBed.inject(NotificationService);
  };

  beforeEach(() => {
    TestBed.resetTestingModule();
    username.set('somchai');
  });

  it('should open and close the panel and start on the last three months', () => {
    const svc = create();
    expect(svc.panelOpen()).toBe(false);
    svc.toggle();
    expect(svc.panelOpen()).toBe(true);
    svc.close();
    expect(svc.panelOpen()).toBe(false);
    expect(svc.to() >= svc.from()).toBe(true);
  });

  it('should count the unread ones and drop one from the count when it is read or hidden', () => {
    const svc = create();
    const first = svc.unread();
    expect(first).toBeGreaterThan(2);
    const [a, b] = svc.items();
    svc.markRead(a?.id ?? '');
    svc.hide(b?.id ?? '');
    expect(svc.unread()).toBe(first - 2);
    expect(svc.isRead(a?.id ?? '')).toBe(true);
    expect(svc.items().map((n) => n.id)).not.toContain(b?.id);
  });

  it('should keep the marks of each user apart and read everything on "mark all"', () => {
    const svc = create();
    const first = svc.unread();
    svc.markAllRead();
    expect(svc.unread()).toBe(0);
    username.set('somying');
    expect(svc.unread()).toBe(first);
  });

  it('should show only the unread ones on the unread tab', () => {
    const svc = create();
    const [a] = svc.items();
    svc.markRead(a?.id ?? '');
    svc.tab.set('unread');
    expect(svc.items().map((n) => n.id)).not.toContain(a?.id);
  });
});
