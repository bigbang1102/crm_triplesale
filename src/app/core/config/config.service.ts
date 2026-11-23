import { Injectable, isDevMode } from '@angular/core';
import { AppConfig, DEFAULT_CONFIG } from './app-config';

/**
 * Holds the runtime configuration. `load()` is awaited by the app initializer so every other
 * service can read `config.value` synchronously.
 *
 * Operations can change hosts/flags by editing `config/app-config.json` in the deployed
 * folder — no rebuild needed. Secrets never belong here (the bundle is public).
 */
@Injectable({ providedIn: 'root' })
export class ConfigService {
  private current: AppConfig = DEFAULT_CONFIG;

  get value(): AppConfig {
    return this.current;
  }

  async load(url = 'config/app-config.json'): Promise<void> {
    let loaded: Partial<AppConfig> = {};
    try {
      const response = await fetch(url, { cache: 'no-store' });
      if (response.ok) loaded = (await response.json()) as Partial<AppConfig>;
      else console.warn(`[config] ${url} -> HTTP ${response.status}, using defaults`);
    } catch (err) {
      console.warn('[config] could not load app-config.json, using defaults', err);
    }

    this.current = {
      ...DEFAULT_CONFIG,
      ...loaded,
      api: { ...DEFAULT_CONFIG.api, ...loaded.api },
      keycloak: { ...DEFAULT_CONFIG.keycloak!, ...loaded.keycloak },
      features: { ...DEFAULT_CONFIG.features, ...loaded.features },
      upload: { ...DEFAULT_CONFIG.upload, ...loaded.upload },
      branding: { ...DEFAULT_CONFIG.branding, ...loaded.branding },
    };

    // developer switch: localStorage['ts.dev.mock'] = '1' | '0' (dev builds only)
    if (isDevMode()) {
      try {
        const flag = localStorage.getItem('ts.dev.mock');
        if (flag === '1' || flag === '0') this.current = { ...this.current, mock: flag === '1' };
      } catch {
        /* storage blocked */
      }
    }
  }

  /** URL of an auth API route, e.g. authUrl('/auth/login') -> '/triplesale-auth/api/v1/auth/login'. */
  authUrl(path: string): string {
    return `${this.current.api.auth}${path.startsWith('/') ? path : `/${path}`}`;
  }

  /** URL of a dashboard-triplesale-service route, e.g. dashboardUrl('/sundashboard/overview'). */
  dashboardUrl(path: string): string {
    return `${this.current.api.dashboard}${path.startsWith('/') ? path : `/${path}`}`;
  }

  /** URL of a Master-data API route (the configmaster service), e.g. masterUrl('/master-setup/steps') -> '/master-service/api/v1/master-setup/steps'. */
  masterUrl(path: string): string {
    return `${this.current.api.master}${path.startsWith('/') ? path : `/${path}`}`;
  }

  /** URL of a triplesale-service route, e.g. serviceUrl('/me/roles') -> '/triplesale-service/api/v1/me/roles'. */
  serviceUrl(path: string): string {
    return `${this.current.api.service}${path.startsWith('/') ? path : `/${path}`}`;
  }

  /** True for requests to the REST APIs — these carry the Bearer token and never the cookies. */
  isBackendUrl(url: string): boolean {
    const { auth, service, dashboard, master } = this.current.api;
    return url.startsWith(`${auth}/`) || url.startsWith(`${service}/`) || url.startsWith(`${dashboard}/`) || url.startsWith(`${master}/`);
  }

  /** LEGACY: absolute-path URL of a BFF route, e.g. apiUrl('/board/leads') -> '/triplesale/board/leads'. */
  apiUrl(path: string): string {
    return `${this.current.apiBase}${path.startsWith('/') ? path : `/${path}`}`;
  }

  /** True for requests that target the old BFF (assets and config files are not touched by interceptors). */
  isBffUrl(url: string): boolean {
    return url.startsWith(`${this.current.apiBase}/`);
  }

  /** True for any call to a backend (REST APIs or the old BFF): what the log, error and mock interceptors look at. */
  isApiUrl(url: string): boolean {
    return this.isBackendUrl(url) || this.isBffUrl(url);
  }
}
