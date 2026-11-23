import { beforeEach, describe, expect, it } from 'vitest';
import { clearOptionCache } from './options-cache';
import { composeRoutes } from './rest';
import { fakeRest, type FakeAnswer, type FakeCall } from './rest-fake';
import { ensureSets, keepFilterSets, peopleOfTeam, saleTeamRoutes } from './sale-team.live';

const GROUPS = [{ id: 'g1', code: 'T01', name: 'ทีม A' }, { id: 'g2', code: 'T02', name: 'ทีม B' }];
const PEOPLE = [
  { id: 'p1', name: 'สมชาย', saleGroup: { id: 'g1', code: 'T01' } },
  { id: 'p2', name: 'สมหญิง', saleGroupCode: 'T02' },
  { id: 'p3', name: 'ไม่มีรหัส', saleGroupId: 'g1' },
];

describe('sales teams and people of the change-salesperson modal', () => {
  beforeEach(() => clearOptionCache());

  it('the people of a team are those with the code of the team (by id when a person has no team code)', () => {
    expect(peopleOfTeam(GROUPS, PEOPLE, 'g1')!.map((p) => p['id'])).toEqual(['p1', 'p3']);
    expect(peopleOfTeam(GROUPS, PEOPLE, 'g2')!.map((p) => p['id'])).toEqual(['p2']);
    expect(peopleOfTeam(GROUPS, PEOPLE, 'zzz')).toBeNull();
  });

  it('asks filter-options only for the sets that are not in the session, then keeps them', async () => {
    const answer = (c: FakeCall): FakeAnswer => ({ status: 200, result: c.path.includes('salePersons') ? { salePersons: PEOPLE } : { saleGroups: GROUPS } }) as FakeAnswer;
    const { deps, calls } = fakeRest(answer);
    const route = composeRoutes(saleTeamRoutes(deps));
    const r = await route('/board/sale-persons?saleGroupId=g2', undefined);
    expect((await r!.json()).map((p: { id: string }) => p.id)).toEqual(['p1', 'p2', 'p3']); // not filtered by the team for now
    expect(calls.map((c) => c.path.match(/sets=([^&]*)/)?.[1])).toEqual(['salePersons']); // only the one that is missing
    await route('/board/sale-persons', undefined);
    expect(calls).toHaveLength(1); // now kept
  });

  it('a list that cannot be had → null (the next route answers); no team → null', async () => {
    const { deps } = fakeRest(() => ({ status: 400, message: 'x' }) as FakeAnswer);
    const route = saleTeamRoutes(deps);
    expect(await route('/board/sale-groups', new URLSearchParams(), undefined)).toBeNull();
    expect(await route('/board/sale-persons', new URLSearchParams('saleGroupId=g1'), undefined)).toBeNull();
    expect(await route('/board/sale-persons', new URLSearchParams(), undefined)).toBeNull();
  });

  it('a set that is kept is not asked again; a list that came EMPTY is not kept, so it is asked again at the next visit', async () => {
    const { deps, calls } = fakeRest(() => ({ status: 200, result: { tags: [], saleGroups: GROUPS } }) as FakeAnswer);
    keepFilterSets(deps, { pipelines: [{ id: 'p' }] });
    const got = await ensureSets(deps, ['pipelines', 'tags', 'saleGroups']);
    expect(calls.map((c) => c.path.match(/sets=([^&]*)/)?.[1])).toEqual(['tags%2CsaleGroups']); // pipelines was kept
    expect(got['tags']).toBeNull(); // empty = not kept
    expect(got['saleGroups']).not.toBeNull();
    await ensureSets(deps, ['pipelines', 'tags', 'saleGroups']);
    expect(calls.map((c) => c.path.match(/sets=([^&]*)/)?.[1])).toEqual(['tags%2CsaleGroups', 'tags']); // only the empty one again
  });

  it('the years of the target month: /board/fiscal-years is the list fiscalYears (value = id, label = name); from the session, else filter-options?sets=fiscalYears, asked once', async () => {
    const { deps, calls } = fakeRest((): FakeAnswer => ({ status: 200, result: { fiscalYears: [{ id: 'y26', yearValue: '2026' }, { id: 'y27', yearValue: '2027' }] } }) as FakeAnswer);
    const route = composeRoutes(saleTeamRoutes(deps));
    const years = await (await route('/board/fiscal-years', undefined))!.json();
    expect(years.map((y: { code: string; name: string }) => [y.code, y.name])).toEqual([['y26', '2026'], ['y27', '2027']]);
    await route('/board/fiscal-years', undefined);
    expect(calls.map((c) => c.path)).toEqual(['/opportunities/filter-options?sets=fiscalYears']);
    const none = fakeRest((): FakeAnswer => ({ status: 500, text: '{}' }) as FakeAnswer);
    clearOptionCache();
    expect(await composeRoutes(saleTeamRoutes(none.deps))('/board/fiscal-years', undefined).then((r) => r.status)).toBe(404); // nobody owns it: the next route answers []
  });

  it('the responsibles of the modal "เพิ่มผู้รับผิดชอบ" are the list responsibleFilter: from the session, else filter-options?sets=responsibleFilter', async () => {
    const { deps, calls } = fakeRest(() => ({ status: 200, result: { responsiblies: [{ id: 'e1', code: 'E01', name: 'สมหญิง' }] } }) as FakeAnswer);
    const route = saleTeamRoutes(deps);
    const r = await route('/board/employees', new URLSearchParams(), undefined);
    expect(await r!.json()).toEqual([{ id: 'e1', code: 'E01', name: 'สมหญิง' }]);
    expect(calls.map((c) => c.path.match(/sets=([^&]*)/)?.[1])).toEqual(['responsibleFilter']);
    await route('/board/employees', new URLSearchParams(), undefined);
    expect(calls).toHaveLength(1); // kept in the session
  });
});
