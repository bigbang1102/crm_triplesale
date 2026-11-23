import { describe, expect, it } from 'vitest';
import { opportunityHeaderRoutes } from './opportunity-header.live';
import { rememberOpportunityVersion } from './opportunity-sale-person.live';
import { fakeRest, type FakeAnswer } from './rest-fake';

const form = (s: string): RequestInit => ({ method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: s });
const q = (): URLSearchParams => new URLSearchParams();
const ok = (version: number): FakeAnswer => ({ status: 200, text: JSON.stringify({ result: { id: 'o', version, updatedAt: 'x' } }) }) as FakeAnswer;

describe('OP10 PATCH /opportunities/{id}: one field + version', () => {
  it('demand · amount · status go as ONE field with the version, and the version is renewed from the answer', async () => {
    const { deps, calls } = fakeRest(() => ok(8));
    rememberOpportunityVersion('o-1', { header: { version: 7 } });
    const route = opportunityHeaderRoutes(deps);
    expect((await route('/board/lead-update', q(), form('action=demand&leadId=o-1&demand=%E0%B8%81')))!.status).toBe(200);
    await route('/board/lead-update', q(), form('action=amount&leadId=o-1&amount=150000.5'));
    await route('/board/lead-update', q(), form('action=active-status&leadId=o-1&activeStatus=hot'));
    expect(calls.map((c) => `${c.method} ${c.path}`)).toEqual(['PATCH /opportunities/o-1', 'PATCH /opportunities/o-1', 'PATCH /opportunities/o-1']);
    expect(calls[0].body).toEqual({ version: 7, demand: 'ก' });
    expect(calls[1].body).toEqual({ version: 8, amount: '150000.5' });
    expect(calls[2].body).toEqual({ version: 8, status: 'HOT' });
  });

  it('a value the service would refuse is answered 422 and not sent: masked / empty amount, SOLD / LOST, more than 5 tags', async () => {
    const { deps, calls } = fakeRest(() => ok(1));
    const route = opportunityHeaderRoutes(deps);
    for (const body of ['action=amount&leadId=o&amount=*****', 'action=amount&leadId=o&amount=', 'action=active-status&leadId=o&activeStatus=sold', 'action=active-status&leadId=o&activeStatus=lost', 'action=tags&leadId=o&tagIds=1,2,3,4,5,6']) {
      expect((await route('/board/lead-update', q(), form(body)))!.status, body).toBe(422);
    }
    expect(calls).toHaveLength(0);
  });

  it('month and year go as a PAIR with what the detail carried; tags as the whole set', async () => {
    let v = 2;
    const { deps, calls } = fakeRest(() => ok(++v)); // each answer renews the version
    rememberOpportunityVersion('o-2', { header: { version: 2, targetMonth: 11, targetYear: { id: 'y26', name: '2026' } } });
    const route = opportunityHeaderRoutes(deps);
    await route('/board/lead-update', q(), form('action=target-month&leadId=o-2&month=12'));
    await route('/board/lead-update', q(), form('action=target-year&leadId=o-2&yearCode=y27'));
    await route('/board/lead-update', q(), form('action=tags&leadId=o-2&tagIds=t1,t2'));
    await route('/board/lead-update', q(), form('action=tags&leadId=o-2&tagIds='));
    expect(calls.map((c) => c.body)).toEqual([
      { version: 2, targetMonth: 12, targetYearId: 'y26' },
      { version: 3, targetMonth: 11, targetYearId: 'y27' },
      { version: 4, tagIds: ['t1', 't2'] },
      { version: 5, tagIds: [] },
    ]);
    expect((await route('/board/lead-update', q(), form('action=target-month&leadId=o-unknown&month=3')))!.status).toBe(422); // the year is not known
  });

  it('assign and the other actions are not its business', async () => {
    const { deps, calls } = fakeRest(() => ok(1));
    const route = opportunityHeaderRoutes(deps);
    expect(await route('/board/lead-update', q(), form('action=assign&leadId=o&salePersonId=p'))).toBeNull();
    expect(await route('/board/lead-update', q(), { method: 'GET' })).toBeNull();
    expect(calls).toHaveLength(0);
  });
});
