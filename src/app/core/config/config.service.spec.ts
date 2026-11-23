import { TestBed } from '@angular/core/testing';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ConfigService } from './config.service';

const withConfig = async (json: object | null) => {
  vi.stubGlobal('fetch', vi.fn(async () => (json ? new Response(JSON.stringify(json), { status: 200 }) : new Response('', { status: 404 }))));
  const config = TestBed.inject(ConfigService);
  await config.load();
  return config;
};

describe('ConfigService', () => {
  afterEach(() => {
    TestBed.resetTestingModule();
    vi.unstubAllGlobals();
  });

  it('defaults to the four REST APIs at the same origin (the dev proxy / reverse proxy forwards them)', async () => {
    const config = await withConfig(null);
    expect(config.value.api).toEqual({
      auth: '/triplesale-auth/api/v1',
      service: '/triplesale-service/api/v1',
      dashboard: '/dashboard-triplesale-service/api/v1',
      master: '/master-service/api/v1',
    });
    expect(config.masterUrl('/master-setup/steps')).toBe('/master-service/api/v1/master-setup/steps');
    expect(config.masterUrl('master-tables/branch')).toBe('/master-service/api/v1/master-tables/branch');
    expect(config.isBackendUrl('/master-service/api/v1/master-tables/branch')).toBe(true); // takes the Bearer token and the ApiError mapping too
    expect(config.isBackendUrl('/master-servicex/api/v1/x')).toBe(false); // a prefix needs its slash
    expect(config.authUrl('/auth/login')).toBe('/triplesale-auth/api/v1/auth/login');
    expect(config.serviceUrl('me/roles')).toBe('/triplesale-service/api/v1/me/roles');
    expect(config.dashboardUrl('/sundashboard/overview')).toBe('/dashboard-triplesale-service/api/v1/sundashboard/overview');
  });

  it('app-config.json can move one API (e.g. to a gateway that allows the origin) and keeps the default of the other', async () => {
    const config = await withConfig({ api: { service: 'https://gw.example.test/triplesale-service/api/v1' } });
    expect(config.value.api.auth).toBe('/triplesale-auth/api/v1');
    expect(config.serviceUrl('/me/roles')).toBe('https://gw.example.test/triplesale-service/api/v1/me/roles');
    expect(config.isBackendUrl('https://gw.example.test/triplesale-service/api/v1/me/roles')).toBe(true);
    expect(config.isBackendUrl('/triplesale-service/api/v1/me/roles')).toBe(false); // that prefix is no longer an API
  });

  it('tells the REST APIs from the old BFF and from assets', async () => {
    const config = await withConfig({});
    expect(config.isBackendUrl('/triplesale-auth/api/v1/auth/login')).toBe(true);
    expect(config.isBackendUrl('/triplesale-service/api/v1/leads')).toBe(true);
    expect(config.isBackendUrl('/dashboard-triplesale-service/api/v1/sundashboard/overview')).toBe(true); // the dashboard service takes the Bearer token too
    expect(config.isBackendUrl('/triplesale/board/x')).toBe(false);
    expect(config.isBffUrl('/triplesale/board/x')).toBe(true);
    expect(config.isApiUrl('/triplesale/board/x')).toBe(true);
    expect(config.isApiUrl('/triplesale-service/api/v1/leads')).toBe(true);
    expect(config.isApiUrl('assets/i18n/th.json')).toBe(false);
    expect(config.isApiUrl('/triplesale-servicex/y')).toBe(false); // a prefix needs its slash
  });
});
