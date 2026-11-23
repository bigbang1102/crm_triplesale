import { afterEach, describe, expect, it } from 'vitest';
import { resetCompanyScopeForTests } from '@core/mock/company-scope';
import { LeadsMock } from './leads.mock';
import type { LeadQuery } from './leads.types';

const ALL: LeadQuery = { status: '', search: '', sort: 'newest', filter: { sources: [], ownerCode: '', dateFrom: '', dateTo: '' } };
const signIn = (branchCode: string): void => sessionStorage.setItem('ts_auth', JSON.stringify({ session: { branchCode } }));

/** the Lead menu starts each company with its own share of the leads (the rest is the other company's) */
describe('the leads of a company', () => {
  afterEach(() => {
    sessionStorage.clear();
    resetCompanyScopeForTests();
  });

  it('should split the seed leads between SUN and ACE with nobody in both', () => {
    const everyone = new LeadsMock().list(ALL).rows.map((l) => l.id);
    signIn('SUN');
    const sun = new LeadsMock().list(ALL).rows.map((l) => l.id);
    signIn('ACE');
    const ace = new LeadsMock().list(ALL).rows.map((l) => l.id);
    expect(sun.length).toBeGreaterThan(0);
    expect(ace.length).toBeGreaterThan(0);
    expect(sun.filter((id) => ace.includes(id))).toEqual([]);
    expect([...sun, ...ace].sort((a, b) => a - b)).toEqual([...everyone].sort((a, b) => a - b));
  });

  it('should count the statuses of the company only', () => {
    signIn('ACE');
    const { rows, counts } = new LeadsMock().list(ALL);
    expect(counts.all).toBe(rows.length);
    expect(counts.all).toBeLessThan(95);
  });
});
