import { beforeEach, describe, expect, it } from 'vitest';
import { FILTER_STATE_KEY } from '@core/live/opportunities.live';
import { fakeRest, SERVICE_API, type FakeAnswer, type FakeCall, type FakeOptions } from '@core/live/rest-fake';
import { createLiveOpportunities, savedFilterOf } from './opportunities.live';

const setup = (answer: (c: FakeCall) => FakeAnswer = () => ({}), o: FakeOptions = {}) => {
  const { deps, calls } = fakeRest(answer, { roles: ['CRM_Lead_View'], ...o });
  return { deps, calls, backend: createLiveOpportunities(deps) };
};
const text = async (r: Promise<Response>) => (await r).text();

beforeEach(() => sessionStorage.clear());

describe('the live backend of the Opportunities page', () => {
  it('initial(): `savedFilterJson` is the filter state that POST /board/filter-state stored — parsed, null when there is none', async () => {
    const s = setup();
    expect(await s.backend.initial()).toEqual({ savedFilterJson: null });
    // the page saves its state through env.beacon → backend.fetch (the address as the Java page wrote it)
    const saved = await s.backend.fetch('../board/filter-state', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{"tab":"list","sort":"id_asc","tagIds":[1,2]}' });
    expect(saved.status).toBe(204);
    expect(await s.backend.initial()).toEqual({ savedFilterJson: { tab: 'list', sort: 'id_asc', tagIds: [1, 2] } });
    expect(s.calls).toHaveLength(0);
  });

  it('a saved text that is not JSON (a script error in Java) is null for the page; the state of another user is not seen', async () => {
    const a = setup(() => ({}), { user: { username: 'anna' } });
    sessionStorage.setItem(`${FILTER_STATE_KEY}:anna`, '{not json');
    expect(savedFilterOf(a.deps)).toBeNull();
    sessionStorage.setItem(`${FILTER_STATE_KEY}:anna`, '{"tab":"board"}');
    expect(savedFilterOf(a.deps)).toEqual({ tab: 'board' });
    expect(savedFilterOf(setup(() => ({}), { user: { username: 'ben' } }).deps)).toBeNull();
  });

  it('the old calls are not asked any more: the tags and the sale groups come from filter-options (one call; empty when it has none); the contact activity still goes to the service', async () => {
    const s = setup(() => ({ status: 201, text: '{"status":201}' }) as FakeAnswer);
    expect(await text(s.backend.fetch('../board/tags'))).toBe('[]');
    expect(await text(s.backend.fetch('../board/sale-groups'))).toBe('[]');
    // filter-options (with the fiscal years) plus the countries of the phone codes: asked together, once, for both lists
    expect(s.calls.map((c) => `${c.method} ${c.url}`)).toEqual([
      `GET ${SERVICE_API}/opportunities/filter-options?sets=pipelines%2Ctags%2CsaleGroups%2CsalePersons%2CresponsibleFilter%2CfiscalYears`,
      `GET ${SERVICE_API}/prospects/options?sets=countries`,
    ]);
    s.calls.length = 0;
    const moved = await s.backend.fetch('../board/contact-activities', { method: 'POST', body: '{"leadId":"7","channel":"call_out","content":"x","procedureId":"1012"}' });
    expect(moved.status).toBe(201);
    expect(s.calls.map((c) => `${c.method} ${c.url}`)).toEqual([`POST ${SERVICE_API}/leads/7/contact-activities`]);
    expect(JSON.parse(s.calls[0].body as string)).toEqual({ channel: 'Call Out', content: 'x', procedureId: '1012' });
  });

  it('the permission to see the board is checked here: without CRM_Lead_View the board is [] and the service is not asked', async () => {
    const s = setup(() => ({ status: 200, result: { kanban: [] } }), { roles: [] });
    expect(await text(s.backend.fetch('../board/leads?viewMode=board'))).toBe('[]');
    expect(s.calls).toHaveLength(0);
  });

  it('an address nobody knows is a 404 JSON (there is no BFF to forward it to)', async () => {
    const s = setup();
    const r = await s.backend.fetch('/triplesale/board/no-such-servlet');
    expect(r.status).toBe(404);
    expect(await r.json()).toEqual({ status: 404, message: 'no live route for /board/no-such-servlet' });
    expect(s.calls).toHaveLength(0);
  });
});
