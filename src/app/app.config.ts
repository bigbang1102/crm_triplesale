import { provideHttpClient, withFetch, withInterceptors } from '@angular/common/http';
import { ApplicationConfig, Injector, inject, provideAppInitializer, provideBrowserGlobalErrorListeners } from '@angular/core';
import { TitleStrategy, provideRouter, withComponentInputBinding } from '@angular/router';
import { AuthService } from '@core/auth/auth.service';
import { ConfigService } from '@core/config/config.service';
import { ApiLogPageTracker } from '@core/http/api-log-page.tracker';
import { ApiLogService } from '@core/http/api-log.service';
import { apiErrorInterceptor, apiLogInterceptor, bearerInterceptor, credentialsInterceptor } from '@core/http/interceptors';
import { mockBackendInterceptor } from '@core/http/mock-backend.interceptor';
import { I18n } from '@core/i18n/i18n.service';
import { startMockup } from '@core/mockup/mockup-bootstrap';
import { AppTitleStrategy } from '@core/navigation/title.strategy';
import { routes } from './app.routes';

export const appConfig: ApplicationConfig = {
  providers: [
    provideBrowserGlobalErrorListeners(),
    provideRouter(routes, withComponentInputBinding()),
    // order = outermost first: errors are normalised after the mock/real call has run
    provideHttpClient(
      withFetch(),
      withInterceptors([apiLogInterceptor, apiErrorInterceptor, bearerInterceptor, credentialsInterceptor, mockBackendInterceptor]),
    ),
    { provide: TitleStrategy, useExisting: AppTitleStrategy },

    // 1) runtime config  2) dictionaries  3) does this tab still hold a live sign-in (token in sessionStorage)?
    //  4) the Log window (features.apiLog): follow the page of every call before the first navigation
    provideAppInitializer(() => {
      const config = inject(ConfigService);
      const i18n = inject(I18n);
      const auth = inject(AuthService);
      const injector = inject(Injector);
      return config
        .load()
        // the mockup: Datasource/ + Storage/ through the local file server (before the accounts and the pages ask for their data)
        .then(() => (config.value.mock && config.value.features.mockupServer ? startMockup() : false))
        .then(() => i18n.init())
        .then(() => auth.restore())
        .then(() => {
          if (config.value.features.apiLog) {
            injector.get(ApiLogPageTracker);
            injector.get(ApiLogService).watchAuthCalls(); // the Keycloak calls of the sign-in (plain fetch) for the Token tab
          }
        });
    }),
  ],
};
