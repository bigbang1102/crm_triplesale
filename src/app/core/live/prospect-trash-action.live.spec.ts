import { describe, expect, it } from 'vitest';
import { prospectTrashActionRoutes } from './prospect-trash-action.live';
import { composeRoutes } from './rest';
import { fakeRest, type FakeAnswer, type FakeCall } from './rest-fake';

const ID = '019b0000-0000-7000-8000-000000009401';

function setup(answer: (c: FakeCall) => FakeAnswer) {
  const { deps, calls } = fakeRest(answer);
  const route = composeRoutes(prospectTrashActionRoutes(deps));
  return {
    calls,
    post: async (body: unknown) => {
      const r = await route('/board/prospect-trash-action', { method: 'POST', body: JSON.stringify(body) });
      return { status: r.status, text: await r.text() };
    },
    route,
  };
}

describe('POST /board/prospect-trash-action (restore from the trash)', () => {
  it('posts { action } to /prospects/{id}/trash-actions: the id is the path, not the body', async () => {
    const s = setup(() => ({ status: 200, result: { id: ID } }));
    const r = await s.post({ prospectId: ID, action: 'RESTORE' });
    expect(r.status).toBe(200);
    expect(s.calls.map((c) => [c.method, c.path, c.body])).toEqual([['POST', `/prospects/${ID}/trash-actions`, { action: 'RESTORE' }]]);
  });

  it('the status and the body of the service are passed on (403, 404, 409, 422 reach the page as they are)', async () => {
    for (const status of [403, 404, 409, 422]) {
      const s = setup(() => ({ status, text: JSON.stringify({ status, error: { code: 'X', description: 'why' } }) }));
      const r = await s.post({ prospectId: ID, action: 'RESTORE' });
      expect(r.status).toBe(status);
      expect(JSON.parse(r.text)).toMatchObject({ error: { description: 'why' } });
    }
  });

  it('no answer is a 502; no prospect id is a 400 and no call; only POST; other paths are not its business', async () => {
    expect((await setup(() => null).post({ prospectId: ID, action: 'RESTORE' })).status).toBe(502);
    const s = setup(() => ({ status: 200, text: '{}' }));
    expect((await s.post({ action: 'RESTORE' })).status).toBe(400);
    expect(s.calls).toHaveLength(0);
    expect((await s.route('/board/prospect-trash-action', { method: 'GET' })).status).toBe(405);
    expect((await s.route('/board/prospect-assign')).status).toBe(404);
  });
});
