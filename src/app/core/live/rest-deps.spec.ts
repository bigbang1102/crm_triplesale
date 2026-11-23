import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { HttpClient } from '@angular/common/http';
import { afterEach, describe, expect, it } from 'vitest';
import { createRestDeps } from './rest-deps';

function setup() {
  TestBed.configureTestingModule({ providers: [provideHttpClient(), provideHttpClientTesting()] });
  const http = TestBed.inject(HttpClient);
  const deps = createRestDeps({
    http,
    api: { service: '/triplesale-service/api/v1', dashboard: '/dashboard-triplesale-service/api/v1' },
    session: () => null,
    hasRole: () => true,
    lang: () => 'th',
    masterText: () => undefined,
    message: (k) => k,
  });
  return { deps, ctl: TestBed.inject(HttpTestingController) };
}

describe('createRestDeps.call (what a servlet saw of an upstream answer)', () => {
  afterEach(() => TestBed.resetTestingModule());

  it('resolves with the status and the text of a 2xx answer', async () => {
    const { deps, ctl } = setup();
    const p = deps.call('GET', '/triplesale-service/api/v1/x');
    ctl.expectOne('/triplesale-service/api/v1/x').flush('{"a":1}', { status: 200, statusText: 'OK' });
    expect(await p).toEqual({ status: 200, text: '{"a":1}' });
  });

  it('resolves — never rejects — with the status and the raw body of an error answer', async () => {
    const { deps, ctl } = setup();
    const p = deps.call('GET', '/triplesale-service/api/v1/x');
    ctl.expectOne('/triplesale-service/api/v1/x').flush('{"status":403,"message":"no"}', { status: 403, statusText: 'Forbidden' });
    expect(await p).toEqual({ status: 403, text: '{"status":403,"message":"no"}' });
  });

  it('no answer at all (status 0) is an EMPTY text — not the ProgressEvent as JSON', async () => {
    const { deps, ctl } = setup();
    const p = deps.call('POST', '/triplesale-service/api/v1/x', { a: 1 });
    ctl.expectOne('/triplesale-service/api/v1/x').error(new ProgressEvent('error'));
    expect(await p).toEqual({ status: 0, text: '' });
  });

  it('posts an object as JSON', async () => {
    const { deps, ctl } = setup();
    const p = deps.call('PATCH', '/triplesale-service/api/v1/schedules/1', { title: 'x' });
    const req = ctl.expectOne('/triplesale-service/api/v1/schedules/1');
    expect(req.request.method).toBe('PATCH');
    expect(req.request.body).toEqual({ title: 'x' });
    req.flush('', { status: 200, statusText: 'OK' });
    await p;
  });
});
