import { describe, expect, it } from 'vitest';
import { prospectAssignRoutes } from './prospect-assign.live';
import { composeRoutes } from './rest';
import { fakeRest, type FakeAnswer, type FakeCall } from './rest-fake';

const ID = '019b0000-0000-7000-8000-000000009401';
const NEW = '019b0000-0000-7000-8000-000000009302';
const OLD = '019b0000-0000-7000-8000-000000009301';

function setup(answer: (c: FakeCall) => FakeAnswer) {
  const { deps, calls } = fakeRest(answer);
  const route = composeRoutes(prospectAssignRoutes(deps));
  return {
    calls,
    post: async (body: unknown) => {
      const r = await route('/board/prospect-assign', { method: 'POST', body: JSON.stringify(body) });
      return { status: r.status, text: await r.text() };
    },
  };
}

describe('POST /board/prospect-assign (the change of the responsible person)', () => {
  it('posts { destination, responsibleEmployeeId, expectedResponsibleId, reason } to /prospects/{id}/assignments; the id of the prospect is the path, not the body', async () => {
    const s = setup(() => ({ status: 200, result: { id: ID } }));
    const r = await s.post({ prospectId: ID, destination: 'EMPLOYEE', responsibleEmployeeId: NEW, expectedResponsibleId: OLD, reason: 'ย้ายเขตการขาย' });
    expect(r.status).toBe(200);
    expect(s.calls.map((c) => [c.method, c.path, c.body])).toEqual([
      ['POST', `/prospects/${ID}/assignments`, { destination: 'EMPLOYEE', responsibleEmployeeId: NEW, expectedResponsibleId: OLD, reason: 'ย้ายเขตการขาย' }],
    ]);
  });

  it('the status and the body of the service are passed on: 403, 409 and 422 reach the page as they are', async () => {
    for (const status of [403, 409, 422]) {
      const s = setup(() => ({ status, text: JSON.stringify({ status, error: { code: 'X', description: 'why' } }) }));
      const r = await s.post({ prospectId: ID, destination: 'EMPLOYEE', responsibleEmployeeId: NEW });
      expect(r.status).toBe(status);
      expect(JSON.parse(r.text)).toMatchObject({ error: { description: 'why' } });
    }
  });

  it('no answer from the service is a 502; no prospect id is a 400 and no call; only POST; other paths are not its business', async () => {
    expect((await setup(() => null).post({ prospectId: ID })).status).toBe(502);
    const s = setup(() => ({ status: 200, text: '{}' }));
    expect((await s.post({ destination: 'EMPLOYEE' })).status).toBe(400);
    expect(s.calls).toHaveLength(0);
    const { deps } = fakeRest(() => ({}));
    const route = composeRoutes(prospectAssignRoutes(deps));
    expect((await route('/board/prospect-assign', { method: 'GET' })).status).toBe(405);
    expect((await route('/board/prospect-list')).status).toBe(404);
  });
});
