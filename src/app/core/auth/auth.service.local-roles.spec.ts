import { HttpInterceptorFn, provideHttpClient, withInterceptors } from '@angular/common/http';
import { Component } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { beforeEach, describe, expect, it } from 'vitest';
import { ConfigService } from '../config/config.service';
import {
  apiErrorInterceptor,
  bearerInterceptor,
  credentialsInterceptor,
} from '../http/interceptors';
import { mockBackendInterceptor } from '../http/mock-backend.interceptor';
import { KNOWN_ROLES } from '../permissions/all-roles';
import { PermissionService } from '../permissions/permission.service';
import { ROLE } from '../permissions/roles';
import { configStub } from '../testing/test-helpers';
import { AuthService } from './auth.service';

@Component({ template: '' })
class Blank {}

const SERVICE = '/triplesale-service/api/v1';

/** TEMPORARY: at sign-in the session gets all the roles the app knows, because the backend has not started to give out the roles */
describe('AuthService: the roles set in the app go into the session (mock REST APIs)', () => {
  let auth: AuthService;
  let seen: string[];

  const signIn = async (username: string) => {
    expect((await auth.proxy({ username, password: 'x' })).data?.['responseCode']).toBe('COMPLETE');
    await auth.completeSignIn();
  };

  beforeEach(() => {
    seen = [];
    const probe: HttpInterceptorFn = (req, next) => {
      seen.push(req.url);
      return next(req);
    };
    sessionStorage.clear();
    TestBed.configureTestingModule({
      providers: [
        provideRouter([{ path: 'login', component: Blank }]),
        provideHttpClient(
          withInterceptors([
            probe,
            apiErrorInterceptor,
            bearerInterceptor,
            credentialsInterceptor,
            mockBackendInterceptor,
          ]),
        ),
        { provide: ConfigService, useValue: configStub({ mock: true }) },
      ],
    });
    auth = TestBed.inject(AuthService);
  });

  it('puts every role the app knows into the session, whoever signs in', async () => {
    await signIn('viewer'); // the fake account that holds 5 roles only
    const roles = auth.session()?.roles ?? [];
    expect(new Set(roles)).toEqual(new Set(KNOWN_ROLES));
    expect(roles).toContain(ROLE.featureReport); // one the viewer does not have
    expect(roles).toHaveLength(new Set(roles).size);
  });

  it('still reads the user and the roles from the backend: what was sent stays in the session', async () => {
    await signIn('admin'); // super_admin, which is not one of the roles the app knows
    expect(seen).toContain(`${SERVICE}/me/roles`);
    expect(seen).toContain(`${SERVICE}/auth/user-detail`);
    expect(auth.session()?.roles).toContain('super_admin');
    expect(auth.session()?.roles).toContain(ROLE.featureReport);
    expect(auth.session()?.profileName).toBe('ผู้ดูแลระบบ (ทดลอง)');
  });

  it('is what PermissionService works from: the viewer can open everything, and is still no super-admin', async () => {
    await signIn('viewer');
    const perm = TestBed.inject(PermissionService);
    expect(perm.has(ROLE.featureReport)).toBe(true);
    expect(perm.hasPrefix('Report_')).toBe(true);
    expect(perm.isSuperAdmin()).toBe(false);
    expect(perm.has('Some_Role_Nobody_Named')).toBe(false);
  });
});
