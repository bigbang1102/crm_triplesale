import { HttpClient, provideHttpClient, withInterceptors } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { describe, expect, it } from 'vitest';
import { ConfigService } from '../config/config.service';
import { boardMasterRoutes } from '../live/board-master.live';
import { composeRoutes, jsonResponse } from '../live/rest';
import { createRestDeps } from '../live/rest-deps';
import { configStub } from '../testing/test-helpers';
import { ApiLogService } from './api-log.service';
import { currentVia, runVia } from './api-via';
import { apiLogInterceptor } from './interceptors';

const turn = () => new Promise<void>((resolve) => setTimeout(resolve));

describe('api-via (the servlet a REST call is made for)', () => {
  it('names the servlet for the code that runs inside runVia, in the same turn, and returns what it returns', () => {
    expect(currentVia()).toBe('');
    const seen = runVia('/board/leads', () => currentVia());
    expect(seen).toBe('/board/leads');
  });

  it('is empty again once that turn is over (a call made after an await is never put under another request)', async () => {
    runVia('/board/leads', () => undefined);
    await turn();
    expect(currentVia()).toBe('');
  });

  it('the second of two handlers in the same turn wins, and the first one clearing does not wipe it', async () => {
    let seen = 'not run';
    runVia('/a', () => undefined);
    queueMicrotask(() => (seen = currentVia())); // runs after the clearing of /a, before the clearing of /b
    runVia('/b', () => undefined);
    await turn();
    expect(seen).toBe('/b');
    expect(currentVia()).toBe('');
  });
});

describe('composeRoutes names the servlet URL of each handler it calls', () => {
  it('every handler sees its own path, the one after a handler that did not know the route too', async () => {
    const seen: string[] = [];
    const route = composeRoutes(
      async () => {
        seen.push(`first:${currentVia()}`);
        return null;
      },
      async () => {
        seen.push(`second:${currentVia()}`);
        return jsonResponse(200, { ok: true });
      },
    );
    expect((await route('/triplesale/board/movement-types?x=1')).status).toBe(200);
    expect(seen).toEqual(['first:/board/movement-types', 'second:/board/movement-types']);
  });
});

describe('end to end: a page asks a servlet URL of a live backend, the Log shows the REST call under it', () => {
  it('names /board/movement-types for the master-data call that servlet makes', async () => {
    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(withInterceptors([apiLogInterceptor])),
        provideHttpClientTesting(),
        { provide: ConfigService, useValue: configStub({ features: { aiHubEnabled: true, pageGuardEnabled: true, apiLog: true } }) },
      ],
    });
    const deps = createRestDeps({
      http: TestBed.inject(HttpClient),
      api: { service: '/triplesale-service/api/v1', dashboard: '/dashboard-triplesale-service/api/v1' },
      session: () => null,
      hasRole: () => true,
      lang: () => 'th',
      masterText: () => undefined,
      message: (k) => k,
    });
    const log = TestBed.inject(ApiLogService);
    const ctl = TestBed.inject(HttpTestingController);

    const answer = composeRoutes(boardMasterRoutes(deps))('/triplesale/board/movement-types');
    ctl.expectOne('/triplesale-service/api/v1/master-data/movement-types/LD').flush({ status: 200, result: [{ code: 'LD-01', name: 'x' }] });
    expect((await answer).status).toBe(200);

    expect(log.entries()).toHaveLength(1);
    expect(log.entries()[0]).toMatchObject({ via: '/board/movement-types', method: 'GET', url: '/triplesale-service/api/v1/master-data/movement-types/LD', status: 200 });
  });
});
