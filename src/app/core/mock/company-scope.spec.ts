import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { SEED_PROSPECT_COUNT, isKnownProspect, leadIds, prospectIds } from './crm-seed';
import { bucketBelongs, currentCompany, documentsAreStale, localDocName, markDocumentsLoaded, resetCompanyScopeForTests, serverDocName } from './company-scope';
import { resetSharedDb, upsertSharedProspect } from './shared-db';

const signIn = (branchCode: string): void => sessionStorage.setItem('ts_auth', JSON.stringify({ session: { branchCode } }));

describe('the company the mockup shows', () => {
  beforeEach(() => {
    sessionStorage.clear();
    resetCompanyScopeForTests();
  });
  afterEach(() => {
    sessionStorage.clear();
    resetCompanyScopeForTests();
    resetSharedDb();
  });

  it('should read the company from the session, and know none when there is no session', () => {
    expect(currentCompany()).toBe('');
    signIn('ace');
    expect(currentCompany()).toBe('ACE');
    signIn('SUN');
    expect(currentCompany()).toBe('SUN');
  });

  it('should split the cast between SUN and ACE with nobody in both, and filter nothing without a company', () => {
    expect(prospectIds()).toHaveLength(SEED_PROSPECT_COUNT);
    signIn('SUN');
    const sun = prospectIds();
    signIn('ACE');
    const ace = prospectIds();
    expect(sun.length).toBeGreaterThan(0);
    expect(ace.length).toBeGreaterThan(0);
    expect(sun.length + ace.length).toBe(SEED_PROSPECT_COUNT);
    expect(sun.filter((id) => ace.includes(id))).toEqual([]);
    expect(isKnownProspect(sun[0])).toBe(false); // the company now is ACE
    expect(isKnownProspect(ace[0])).toBe(true);
  });

  it('should give a lead to the company of its customer, and show all of the cast to a company with no share', () => {
    signIn('SUN');
    const sunLeads = leadIds();
    signIn('ACE');
    const aceLeads = leadIds();
    expect(sunLeads.length + aceLeads.length).toBe(240);
    signIn('GGW');
    expect(leadIds()).toHaveLength(240);
    expect(bucketBelongs('GGW', 5)).toBe(true);
  });

  it('should stamp what is added with the company, and show it to that company only', () => {
    signIn('ACE');
    upsertSharedProspect(5000, { fullName: 'ลูกค้า เอซ' }, true);
    expect(prospectIds()).toContain(5000);
    signIn('SUN');
    expect(prospectIds()).not.toContain(5000);
    expect(isKnownProspect(5000)).toBe(false);
  });

  it('should keep the documents of a company apart: the default company has the plain names, another one a suffix, the rest is shared', () => {
    signIn('SUN');
    expect(serverDocName('journal.leads')).toBe('journal.leads');
    expect(localDocName('journal.leads')).toBe('journal.leads');
    expect(localDocName('journal.leads__ace')).toBeUndefined();
    signIn('ACE');
    expect(serverDocName('journal.leads')).toBe('journal.leads__ace');
    expect(serverDocName('shared-db')).toBe('shared-db__ace');
    expect(serverDocName('ts.mock.home.state')).toBe('ts.mock.home.state__ace');
    expect(localDocName('journal.leads__ace')).toBe('journal.leads');
    expect(localDocName('journal.leads')).toBeUndefined(); // SUN's
    for (const shared of ['users', 'roles', 'seed.crm', 'ref.shared', 'groups']) {
      expect(serverDocName(shared)).toBe(shared);
      expect(localDocName(shared)).toBe(shared);
    }
  });

  it('should say the documents are stale only when the company changed to one with other documents', () => {
    markDocumentsLoaded(); // loaded before sign-in
    expect(documentsAreStale()).toBe(false);
    signIn('SUN'); // same documents as "no company"
    expect(documentsAreStale()).toBe(false);
    signIn('ACE');
    expect(documentsAreStale()).toBe(true);
    markDocumentsLoaded();
    expect(documentsAreStale()).toBe(false);
  });
});
