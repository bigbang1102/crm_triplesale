import { Component } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { Router, provideRouter } from '@angular/router';
import { beforeEach, describe, expect, it } from 'vitest';
import { ApiLogPageTracker } from './api-log-page.tracker';
import { ApiLogService } from './api-log.service';

@Component({ template: '' })
class Blank {}

const entry = { page: 'x', via: '', method: 'GET', url: '/u', status: 200, ms: 1, reqBody: '', resBody: '' };

describe('ApiLogPageTracker (ApiLog.pageOf / onPageNavigate)', () => {
  let router: Router;
  let log: ApiLogService;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [
        provideRouter([
          { path: 'crm/home', component: Blank, data: { page: { legacy: ['pages/index.xhtml', 'resources/js/dashboard.js'] } } },
          { path: 'crm/opportunities', component: Blank, data: { page: { legacy: ['pages/lead.xhtml'] } } },
          { path: 'settings', component: Blank, data: { page: { legacy: ['mockup.html'] } } },
          { path: 'plain', component: Blank },
        ]),
      ],
    });
    router = TestBed.inject(Router);
    log = TestBed.inject(ApiLogService);
    TestBed.inject(ApiLogPageTracker);
  });

  it('names the page of the calls like the Java file (index.face), before the page opens', async () => {
    await router.navigateByUrl('/crm/home');
    expect(log.currentPage).toBe('index.face');
    await router.navigateByUrl('/crm/opportunities?tab=board');
    expect(log.currentPage).toBe('lead.face');
  });

  it('names a page without a Java file by its route', async () => {
    await router.navigateByUrl('/settings');
    expect(log.currentPage).toBe('/settings');
    await router.navigateByUrl('/plain');
    expect(log.currentPage).toBe('/plain');
  });

  it('empties the Log when another page opens, not when only the query string changes, and not on the first page', async () => {
    log.record(entry);
    await router.navigateByUrl('/crm/home');
    expect(log.entries()).toHaveLength(1); // the first page: nothing was open before it

    await router.navigateByUrl('/crm/home?x=1');
    expect(log.entries()).toHaveLength(1);

    await router.navigateByUrl('/crm/opportunities');
    expect(log.entries()).toHaveLength(0);

    log.record(entry);
    await router.navigateByUrl('/crm/opportunities#top');
    expect(log.entries()).toHaveLength(1);
  });
});
