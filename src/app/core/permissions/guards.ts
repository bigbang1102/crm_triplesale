import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { AuthService } from '../auth/auth.service';
import { documentsAreStale } from '../mock/company-scope';
import { ConfigService } from '../config/config.service';
import { PermissionService } from './permission.service';
import { FeatureFlag } from './roles';

/** Replaces `SessionTokenFilter` for pages: not signed in → /login?returnUrl=… */
export const authGuard: CanActivateFn = (_route, state) => {
  const auth = inject(AuthService);
  if (auth.isAuthenticated()) {
    // the documents of the mockup were loaded before the user chose a company (a sign-in does not reload the app): they are the wrong company's
    if (documentsAreStale()) {
      // the page that is open now may be one that cannot be loaded again (the sign-in callback with its one-time code): load the page asked for
      globalThis.location.replace(new URL(state.url.startsWith('/') ? state.url.slice(1) : state.url, document.baseURI).href);
      return false;
    }
    return true;
  }
  return inject(Router).createUrlTree(['/login'], { queryParams: { returnUrl: state.url } });
};

/**
 * Replaces `PageAccessRules`: route `data.requires` is an OR-list of role keys
 * (taken from page-registry.json); `data.flag` hides a page when its feature flag is off.
 * Pages that are not listed in the registry rules stay open to any signed-in user — same as Java.
 */
export const pageGuard: CanActivateFn = (route) => {
  const config = inject(ConfigService);
  const router = inject(Router);
  const perm = inject(PermissionService);

  const flag = route.data['flag'] as FeatureFlag | undefined;
  if (flag && !perm.flag(flag)) return router.createUrlTree(['/not-found']);

  if (!config.value.features.pageGuardEnabled) return true;
  const requires = route.data['requires'] as string | null | undefined;
  return perm.has(requires) ? true : router.createUrlTree(['/forbidden']);
};
