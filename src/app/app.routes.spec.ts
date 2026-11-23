import { Route } from '@angular/router';
import { routes } from './app.routes';

const children = (): Route[] => routes.find((r) => r.component)!.children!;
const find = (path: string) => children().find((r) => r.path === path);

describe('route table', () => {
  it('no redirect points at its own path (it would loop and hide the page below it)', () => {
    for (const r of children().filter((c) => c.redirectTo)) {
      expect(r.redirectTo, `${r.path} redirects to itself`).not.toBe(r.path);
    }
  });

  it('the opportunity pages are served at /crm/opportunities and /crm/opportunities/:opportunityId', () => {
    expect(find('crm/opportunities')?.loadComponent).toBeTypeOf('function');
    expect(find('crm/opportunities/:opportunityId')?.loadComponent).toBeTypeOf('function');
    expect(find('crm/opportunities/:opportunityId')?.redirectTo).toBeUndefined();
  });

  it('the old /crm/leads addresses redirect to the new ones', () => {
    expect(find('crm/leads')?.redirectTo).toBe('crm/opportunities');
    expect(find('crm/leads/:opportunityId')?.redirectTo).toBe('crm/opportunities/:opportunityId');
  });
});
