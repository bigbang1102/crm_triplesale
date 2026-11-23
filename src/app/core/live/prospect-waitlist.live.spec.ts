import { describe, expect, it } from 'vitest';
import { prospectWaitlistRoutes } from './prospect-waitlist.live';
import { composeRoutes } from './rest';
import { fakeRest, type FakeAnswer, type FakeCall } from './rest-fake';

const W = '019b0000-0000-7000-8000-000000009501';

function setup(answer: (c: FakeCall) => FakeAnswer) {
  const { deps, calls } = fakeRest(answer);
  const route = composeRoutes(prospectWaitlistRoutes(deps));
  return { calls, route, ask: async (url: string) => { const r = await route(url); return { status: r.status, text: await r.text() }; } };
}

describe('GET /board/prospect-waitlist (SD-4: the prospects waiting in a queue)', () => {
  it('asks /waitlists/{id}/prospects with page, perPage and q; the answer is passed on as it is', async () => {
    const answer = { status: 200, result: [{ id: 'p1', name: 'สยาม' }], meta: { page: 1, perPage: 20, total: 1 } };
    const s = setup(() => answer);
    const r = await s.ask(`/board/prospect-waitlist?waitlistId=${W}&page=1&perPage=20&q=%20%E0%B8%AA%E0%B8%A2%E0%B8%B2%E0%B8%A1%20`);
    expect(r.status).toBe(200);
    expect(JSON.parse(r.text)).toMatchObject({ result: [{ id: 'p1' }], meta: { total: 1 } });
    expect(s.calls.map((c) => [c.method, c.path])).toEqual([['GET', `/waitlists/${W}/prospects?page=1&perPage=20&q=${encodeURIComponent('สยาม')}`]]);
  });

  it('never sends a sort (the service answers 400); a blank q, a page of 0 or a text page are left out', async () => {
    const s = setup(() => ({ status: 200, result: [] }));
    await s.ask(`/board/prospect-waitlist?waitlistId=${W}&sort=-createdAt&q=%20&page=0&perPage=x`);
    expect(s.calls.map((c) => c.path)).toEqual([`/waitlists/${W}/prospects`]);
  });

  it('the status and the body of the service are passed on: 403 (q while the name is hidden) and 404 (not a prospect queue / other company) reach the page', async () => {
    for (const status of [403, 404]) {
      const s = setup(() => ({ status, text: JSON.stringify({ status, error: { code: 'X', description: 'why' } }) }));
      const r = await s.ask(`/board/prospect-waitlist?waitlistId=${W}&q=a`);
      expect(r.status).toBe(status);
      expect(JSON.parse(r.text)).toMatchObject({ error: { description: 'why' } });
    }
  });

  it('no waitlistId is a 400 and no call; no answer from the service is a 502; only GET; other paths are not its business', async () => {
    const s = setup(() => ({ status: 200, text: '{}' }));
    expect((await s.ask('/board/prospect-waitlist?page=1')).status).toBe(400);
    expect(s.calls).toHaveLength(0);
    expect((await setup(() => null).ask(`/board/prospect-waitlist?waitlistId=${W}`)).status).toBe(502);
    expect((await s.route(`/board/prospect-waitlist?waitlistId=${W}`, { method: 'POST' })).status).toBe(405);
    expect((await s.ask('/board/prospect-list')).status).toBe(404);
  });
});
