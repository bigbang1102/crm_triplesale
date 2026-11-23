import { TestBed } from '@angular/core/testing';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { StoredAuth, TokenStore } from './token.store';

const auth = (over: Partial<StoredAuth> = {}): StoredAuth => ({
  accessToken: 'tok',
  refreshToken: 'ref',
  expiresAt: Date.now() + 60_000,
  session: { username: 'demo', profileName: 'Demo', employeeId: 7, employeeCode: 'E007', branch: { id: 1, code: 'SUN', name: 'SUN' }, branchCode: 'SUN', roles: ['A'], lang: 'th' },
  ...over,
});

describe('TokenStore', () => {
  let store: TokenStore;

  beforeEach(() => {
    sessionStorage.clear();
    store = TestBed.inject(TokenStore);
  });
  afterEach(() => {
    TestBed.resetTestingModule();
    vi.restoreAllMocks();
  });

  it('keeps the sign-in in sessionStorage (this tab only) and hands it back after a reload', () => {
    store.write(auth());
    expect(JSON.parse(sessionStorage.getItem('ts_auth')!)).toMatchObject({ accessToken: 'tok', refreshToken: 'ref' });
    expect(localStorage.getItem('ts_auth')).toBeNull(); // never in localStorage

    TestBed.resetTestingModule(); // a new page load: new service instance, same sessionStorage
    expect(TestBed.inject(TokenStore).read()).toMatchObject({ accessToken: 'tok', session: { username: 'demo', employeeId: 7 } });
  });

  it('clear() forgets it everywhere', () => {
    store.write(auth());
    store.clear();
    expect(store.read()).toBeNull();
    expect(sessionStorage.getItem('ts_auth')).toBeNull();
  });

  it('isLive() is "a token whose time has not run out" (Java: ss_access_token present and now < ss_token_expires)', () => {
    expect(store.isLive()).toBe(false);
    store.write(auth({ expiresAt: 1000 }));
    expect(store.isLive(999)).toBe(true);
    expect(store.isLive(1000)).toBe(false);
  });

  it.each([['not JSON', 'not json'], ['no token', JSON.stringify({ expiresAt: 1, session: {} })], ['no expiry', JSON.stringify({ accessToken: 'x', session: {} })], ['no session', JSON.stringify({ accessToken: 'x', expiresAt: 1 })]])(
    'a stored value that is not ours (%s) is ignored',
    (_name, raw) => {
      sessionStorage.setItem('ts_auth', raw);
      expect(store.read()).toBeNull();
    },
  );

  it('still works for this tab when storage is blocked (memory copy)', () => {
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('blocked');
    });
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('blocked');
    });
    vi.spyOn(Storage.prototype, 'removeItem').mockImplementation(() => {
      throw new Error('blocked');
    });
    store.write(auth());
    expect(store.read()?.accessToken).toBe('tok');
    expect(() => store.clear()).not.toThrow();
    expect(store.read()).toBeNull();
  });
});
