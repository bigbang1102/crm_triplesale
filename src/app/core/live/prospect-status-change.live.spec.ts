import { describe, expect, it } from 'vitest';
import { prospectStatusChangeRoutes } from './prospect-status-change.live';
import { composeRoutes } from './rest';
import { fakeRest, type FakeAnswer, type FakeCall } from './rest-fake';

const ID = '019b0000-0000-7000-8000-000000009910';
const EMP = '019b0000-0000-7000-8000-000000009901';
const KEY = '78b2f72d-6e9e-4b34-abf2-b2d63b314b4e';

function setup(answer: (c: FakeCall) => FakeAnswer) {
  const { deps, calls } = fakeRest(answer);
  const route = composeRoutes(prospectStatusChangeRoutes(deps));
  return {
    calls,
    route,
    post: async (body: unknown) => {
      const r = await route('/board/prospect-status-change', { method: 'POST', body: JSON.stringify(body) });
      return { status: r.status, text: await r.text() };
    },
  };
}

describe('POST /board/prospect-status-change (draft / release / block)', () => {
  it('posts { targetStatus, assignment } to /prospects/{id}/status-changes with the Idempotency-Key header; the id and the key are not in the body', async () => {
    const s = setup(() => ({ status: 200, result: { id: ID } }));
    const r = await s.post({ prospectId: ID, targetStatus: 'RELEASE', assignment: { destination: 'EMPLOYEE', responsibleEmployeeId: EMP }, idempotencyKey: KEY });
    expect(r.status).toBe(200);
    expect(s.calls).toHaveLength(1);
    expect([s.calls[0].method, s.calls[0].path, s.calls[0].body]).toEqual(['POST', `/prospects/${ID}/status-changes`, { targetStatus: 'RELEASE', assignment: { destination: 'EMPLOYEE', responsibleEmployeeId: EMP } }]);
    expect(s.calls[0].headers).toMatchObject({ 'Idempotency-Key': KEY });
  });

  it('a block has no assignment; with no key from the page one is made (a uuid-like text, different each time)', async () => {
    const s = setup(() => ({ status: 200, text: '{}' }));
    await s.post({ prospectId: ID, targetStatus: 'BLOCK' });
    await s.post({ prospectId: ID, targetStatus: 'BLOCK' });
    expect(s.calls[0].body).toEqual({ targetStatus: 'BLOCK' });
    const keys = s.calls.map((c) => (c.headers as Record<string, string>)['Idempotency-Key']);
    expect(keys.every((k) => typeof k === 'string' && k.length >= 8)).toBe(true);
    expect(keys[0]).not.toBe(keys[1]);
  });

  it('the status and the body of the service are passed on (403, 409, 422 reach the page as they are); no answer is 502', async () => {
    for (const status of [403, 409, 422]) {
      const s = setup(() => ({ status, text: JSON.stringify({ status, error: { code: 'X', description: 'why' } }) }));
      const r = await s.post({ prospectId: ID, targetStatus: 'BLOCK', idempotencyKey: KEY });
      expect(r.status).toBe(status);
      expect(JSON.parse(r.text)).toMatchObject({ error: { description: 'why' } });
    }
    expect((await setup(() => null).post({ prospectId: ID, targetStatus: 'BLOCK' })).status).toBe(502);
  });

  it('no prospect id is a 400 and no call; only POST; other paths are not its business', async () => {
    const s = setup(() => ({ status: 200, text: '{}' }));
    expect((await s.post({ targetStatus: 'BLOCK' })).status).toBe(400);
    expect(s.calls).toHaveLength(0);
    expect((await s.route('/board/prospect-status-change', { method: 'GET' })).status).toBe(405);
    expect((await s.route('/board/prospect-assign')).status).toBe(404);
  });
});
