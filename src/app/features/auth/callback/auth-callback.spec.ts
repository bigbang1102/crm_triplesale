import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { Router, provideRouter } from '@angular/router';
import { RouterTestingHarness } from '@angular/router/testing';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AuthService } from '@core/auth/auth.service';
import { AuthCallback } from './auth-callback';

describe('AuthCallback (/auth/callback)', () => {
  let completeKeycloak: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    completeKeycloak = vi.fn().mockResolvedValue('/crm/opportunities');
    TestBed.configureTestingModule({
      providers: [
        provideRouter([
          { path: 'auth/callback', component: AuthCallback },
          { path: 'login', children: [] },
          { path: 'crm/opportunities', children: [] },
        ]),
        { provide: AuthService, useValue: { companyChoice: signal(null), signInBlocked: signal(null), signOutBlocked: vi.fn(), completeKeycloak, takeReloadAfterChoice: () => false } },
      ],
    });
  });
  afterEach(() => history.replaceState(null, '', '/'));

  const open = async (search: string) => {
    history.replaceState(null, '', `/auth/callback${search}`);
    const harness = await RouterTestingHarness.create();
    await harness.navigateByUrl('/auth/callback', AuthCallback);
    await harness.fixture.whenStable();
    return { harness, router: TestBed.inject(Router) };
  };

  it('the address Keycloak returns to after a logout (nothing with it) opens the login page and finishes no sign-in', async () => {
    const { router } = await open('');
    expect(completeKeycloak).not.toHaveBeenCalled();
    expect(router.url).toBe('/login');
  });

  it('?code&state: finishes the sign-in with those parameters and opens the page the user came for', async () => {
    const { router } = await open('?code=abc&state=xyz');
    expect(completeKeycloak).toHaveBeenCalledTimes(1);
    expect((completeKeycloak.mock.calls[0][0] as URLSearchParams).get('code')).toBe('abc');
    expect(router.url).toBe('/crm/opportunities');
  });

  it('?error=…: Keycloak refused the sign-in — it is told to the user, not turned into a login redirect', async () => {
    completeKeycloak.mockRejectedValue(new Error('access_denied'));
    const { harness, router } = await open('?error=access_denied');
    expect(completeKeycloak).toHaveBeenCalledTimes(1);
    expect(router.url).toBe('/auth/callback');
    expect((harness.routeNativeElement as HTMLElement).textContent).toContain('access_denied');
  });
});
