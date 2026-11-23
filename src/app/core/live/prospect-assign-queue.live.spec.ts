import { describe, expect, it } from 'vitest';
import { ASSIGN_FROM_QUEUE_PATH, prospectAssignQueueRoutes } from './prospect-assign-queue.live';
import { prospectRoutes } from './prospect.live';
import { composeRoutes } from './rest';
import { fakeRest, type FakeAnswer, type FakeCall } from './rest-fake';

const P = '019b0000-0000-7000-8000-000000009601';

function setup(answer: (c: FakeCall) => FakeAnswer) {
  const { deps, calls } = fakeRest(answer);
  const route = composeRoutes(prospectAssignQueueRoutes(deps));
  const post = async (body: unknown) => {
    const r = await route(ASSIGN_FROM_QUEUE_PATH, { method: 'POST', body: JSON.stringify(body) });
    return { status: r.status, text: await r.text() };
  };
  return { calls, route, post, deps };
}

describe('POST /board/prospect-assign-from-queue (NC-2: take / hand a prospect from a queue)', () => {
  it('asks POST /prospects/{id}/assign with the body the page sent (prospectId taken out); the answer is passed on as it is', async () => {
    const s = setup(() => ({ status: 200, result: { id: P } }));
    const r = await s.post({ prospectId: P, responsibleEmployeeId: 'e-1', reason: 'x' });
    expect(r.status).toBe(200);
    expect(JSON.parse(r.text)).toMatchObject({ result: { id: P } });
    expect(s.calls.map((c) => [c.method, c.path])).toEqual([['POST', `/prospects/${P}/assign`]]);
    expect(s.calls[0].body).toEqual({ responsibleEmployeeId: 'e-1', reason: 'x' });
  });

  it('the status and the body of the service reach the page: 403 · 404 · 409', async () => {
    for (const status of [403, 404, 409]) {
      const s = setup(() => ({ status, text: JSON.stringify({ status, error: { code: 'X', description: 'why' } }) }));
      const r = await s.post({ prospectId: P });
      expect(r.status).toBe(status);
      expect(JSON.parse(r.text)).toMatchObject({ error: { description: 'why' } });
    }
  });

  it('no prospectId is a 400 and no call; no answer from the service is a 502; only POST; other paths are not its business', async () => {
    const s = setup(() => ({ status: 200, text: '{}' }));
    expect((await s.post({ reason: 'x' })).status).toBe(400);
    expect((await s.post({ prospectId: '  ' })).status).toBe(400);
    expect(s.calls).toHaveLength(0);
    expect((await s.route(ASSIGN_FROM_QUEUE_PATH))!.status).toBe(405);
    expect((await s.route('/board/prospect-assign', { method: 'POST', body: '{}' }))!.status).toBe(404);
    expect((await setup(() => null).post({ prospectId: P })).status).toBe(502);
  });

  it('it is not wired: the routes of the prospect page do not know it (nothing calls the service until it is added there)', async () => {
    const { deps, calls } = fakeRest(() => ({ status: 200, text: '{}' }));
    const r = await composeRoutes(prospectRoutes(deps))(ASSIGN_FROM_QUEUE_PATH, { method: 'POST', body: JSON.stringify({ prospectId: P }) });
    expect(r.status).toBe(404);
    expect(calls).toHaveLength(0);
  });
});
