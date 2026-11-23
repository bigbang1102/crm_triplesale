import { describe, expect, it } from 'vitest';
import { opportunitySalePersonRoutes, rememberOpportunityVersion } from './opportunity-sale-person.live';
import { fakeRest, type FakeAnswer } from './rest-fake';

const form = (s: string): RequestInit => ({ method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: s });
const q = (): URLSearchParams => new URLSearchParams();

describe('OP12 change the sales person', () => {
  it('assign with a person → POST /opportunities/{id}/sale-person { version, salePersonId } with an Idempotency-Key; the version is renewed', async () => {
    const { deps, calls } = fakeRest(() => ({ status: 200, text: JSON.stringify({ result: { version: 5 } }) }) as FakeAnswer);
    rememberOpportunityVersion('o-1', { header: { version: 4 } });
    const route = opportunitySalePersonRoutes(deps);
    const r = await route('/board/lead-update', q(), form('action=assign&leadId=o-1&saleGroupId=g1&salePersonId=p9'));
    expect(r!.status).toBe(200);
    expect(calls[0].method).toBe('POST');
    expect(calls[0].path).toBe('/opportunities/o-1/sale-person');
    expect(calls[0].body).toEqual({ version: 4, salePersonId: 'p9' });
    expect(calls[0].headers?.['Idempotency-Key']).toMatch(/\S{8,}/);
    await route('/board/lead-update', q(), form('action=assign&leadId=o-1&salePersonId=p8'));
    expect(calls[1].body).toEqual({ version: 5, salePersonId: 'p8' });
    expect(calls[1].headers?.['Idempotency-Key']).not.toBe(calls[0].headers?.['Idempotency-Key']);
  });

  it('the version is read from result.header.version, else result.version, else meta.version', async () => {
    const { deps, calls } = fakeRest(() => ({ status: 200, text: '{}' }) as FakeAnswer);
    const route = opportunitySalePersonRoutes(deps);
    rememberOpportunityVersion('o-3', { version: 7 });
    rememberOpportunityVersion('o-4', {}, { version: '9' });
    await route('/board/lead-update', new URLSearchParams(), form('action=assign&leadId=o-3&salePersonId=p1'));
    await route('/board/lead-update', new URLSearchParams(), form('action=assign&leadId=o-4&salePersonId=p1'));
    expect([calls[0].body, calls[1].body]).toEqual([{ version: 7, salePersonId: 'p1' }, { version: 9, salePersonId: 'p1' }]);
  });

  it('OP11: assign marked op=responsible with an employee → POST /opportunities/{id}/responsible { version, responsibleEmployeeId }; the sales-person save (same employeeId, no mark) is still OP12', async () => {
    const { deps, calls } = fakeRest(() => ({ status: 200, text: '{}' }) as FakeAnswer);
    const route = opportunitySalePersonRoutes(deps);
    rememberOpportunityVersion('o-5', { header: { version: 2 } });
    await route('/board/lead-update', new URLSearchParams(), form('action=assign&op=responsible&leadId=o-5&saleGroupId=g1&salePersonId=p1&employeeId=e9'));
    expect(calls[0].path).toBe('/opportunities/o-5/responsible');
    expect(calls[0].body).toEqual({ version: 2, responsibleEmployeeId: 'e9' });
    expect(calls[0].headers?.['Idempotency-Key']).toMatch(/\S{8,}/);
    await route('/board/lead-update', new URLSearchParams(), form('action=assign&leadId=o-5&salePersonId=p2&employeeId=e9'));
    expect(calls[1].path).toBe('/opportunities/o-5/sale-person');
    expect(calls[1].body).toEqual({ version: 3, salePersonId: 'p2' }); // the version was renewed by the first call
    expect(await route('/board/lead-update', new URLSearchParams(), form('action=assign&op=responsible&leadId=o-5'))).toBeNull(); // no employee
  });

  it('no version known → the field is left out; an error of the service is passed on', async () => {
    const { deps, calls } = fakeRest(() => ({ status: 409, text: '{"message":"stale"}' }) as FakeAnswer);
    const r = await opportunitySalePersonRoutes(deps)('/board/lead-update', q(), form('action=assign&leadId=o-2&salePersonId=p1'));
    expect(r!.status).toBe(409);
    expect(calls[0].body).toEqual({ salePersonId: 'p1' });
  });

  it('other calls (another action, no person, GET) are not answered here', async () => {
    const { deps, calls } = fakeRest(() => ({ status: 200 }) as FakeAnswer);
    const route = opportunitySalePersonRoutes(deps);
    expect(await route('/board/lead-update', q(), form('action=tags&leadId=o-1&salePersonId=p1'))).toBeNull();
    expect(await route('/board/lead-update', q(), form('action=assign&leadId=o-1&saleGroupId=g1'))).toBeNull();
    expect(await route('/board/lead-update', q(), { method: 'GET' })).toBeNull();
    expect(calls).toHaveLength(0);
  });
});
