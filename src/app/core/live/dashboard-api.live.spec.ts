import { describe, expect, it } from 'vitest';
import { dashboardApiRoutes } from './dashboard-api.live';
import { composeRoutes } from './rest';
import { fakeRest, type FakeAnswer, type FakeCall } from './rest-fake';

const BAD = '{"status":502,"message":"backend ไม่ตอบหรือ response ไม่ใช่ JSON"}';

function setup(answer: (c: FakeCall) => FakeAnswer) {
  const { deps, calls } = fakeRest(answer);
  const route = composeRoutes(dashboardApiRoutes(deps));
  return {
    calls,
    ask: async (url: string, init?: RequestInit) => {
      const r = await route(url, init);
      return { status: r.status, text: await r.text() };
    },
  };
}
const summary = (items: object[]) => ({ status: 200, result: { stats: { total: items.length }, items } });

describe('GET /dashboardapi?action=summary (DashboardApiService.summaryJson)', () => {
  it('GET /dashboard with movementTypeId, startDate, endDate, page, perPage in this order (blank left out, trimmed, encoded)', async () => {
    const s = setup(() => summary([]));
    await s.ask('/dashboardapi?action=summary&page=1&perPage=100&movementTypeId=%207%20&startDate=2026-01-01&endDate=');
    await s.ask('/dashboardapi?action=summary');
    expect(s.calls.map((c) => c.path)).toEqual(['/dashboard?movementTypeId=7&startDate=2026-01-01&page=1&perPage=100', '/dashboard']);
  });

  it('passes the envelope through (the text as it came) when there is nothing to enrich — and asks for no prospects', async () => {
    const body = '{"status":200,"result":{"stats":{"total":0},"items":[]}}';
    const s = setup(() => body);
    expect(await s.ask('/dashboardapi?action=summary')).toEqual({ status: 200, text: body });
    expect(s.calls).toHaveLength(1);
    // a result without items / without a result: as it is
    expect((await setup(() => '{"status":200,"result":{"stats":{}}}').ask('/dashboardapi?action=summary')).text).toBe('{"status":200,"result":{"stats":{}}}');
    expect((await setup(() => '{"status":401,"message":"x"}').ask('/dashboardapi?action=summary')).text).toBe('{"status":401,"message":"x"}');
  });

  it('fills the missing attachFile of an item with the picture of the prospect of the same name (the first picture of a name)', async () => {
    const s = setup((c) =>
      c.path.startsWith('/prospects')
        ? { status: 200, result: [{ name: 'สมชาย', attachFile: 'a.png' }, { name: 'สมชาย', attachFile: 'b.png' }, { name: 'สมหญิง', attachFile: '' }, { name: 'ก', attachFile: 'k.png' }, 'x'] }
        : summary([{ prospectName: 'สมชาย', attachFile: '' }, { prospectName: 'สมหญิง' }, { prospectName: 'ก', attachFile: 'own.png' }, { prospectName: 'ไม่มี', attachFile: null }]),
    );
    const r = await s.ask('/dashboardapi?action=summary&page=1&perPage=100');
    expect(JSON.parse(r.text).result.items.map((i: { attachFile?: string | null }) => i.attachFile)).toEqual(['a.png', undefined, 'own.png', null]);
    expect(s.calls.map((c) => c.path)).toEqual(['/dashboard?page=1&perPage=100', '/prospects?page=1&pageSize=500']);
  });

  it('leaves the answer alone when no prospect can be matched or the prospects call fails', async () => {
    const dash = '{"status":200,"result":{"items":[{"prospectName":"ก","attachFile":""}]}}';
    for (const prospects of [{ status: 500, text: '{}' }, '{"status":200,"result":[]}', '{"status":200,"result":[{"name":"ข","attachFile":"x.png"}]}', 'not json', null]) {
      const s = setup((c) => (c.path.startsWith('/prospects') ? (prospects as FakeAnswer) : dash));
      expect((await s.ask('/dashboardapi?action=summary')).text, JSON.stringify(prospects)).toBe(dash);
    }
  });

  it('an answer that is not a JSON object (or any non-200) is {status:502,…} with HTTP 200', async () => {
    for (const a of ['', 'oops', '[1]', { status: 500, text: '{"status":500}' }, null]) {
      expect(await setup(() => a as FakeAnswer).ask('/dashboardapi?action=summary')).toEqual({ status: 200, text: BAD });
    }
  });
});

describe('GET /dashboardapi?action=schedules (DashboardApiService.schedulesJson)', () => {
  it('GET /dashboard/schedules with viewMode, date, dateFrom, dateTo, movementTypeId in this order, the envelope as it came', async () => {
    const body = '{"status":200,"result":{"marks":[{"date":"2026-10-01","count":2}]}}';
    const s = setup(() => body);
    expect(await s.ask('/dashboardapi?action=schedules&viewMode=year&dateFrom=2026-01-01&dateTo=2026-12-31&movementTypeId=3&date=')).toEqual({ status: 200, text: body });
    expect(s.calls.map((c) => c.path)).toEqual(['/dashboard/schedules?viewMode=year&dateFrom=2026-01-01&dateTo=2026-12-31&movementTypeId=3']);
  });

  it('the same {status:502} stand-in for a bad answer', async () => {
    expect(await setup(() => ({ status: 403, text: '{"status":403}' })).ask('/dashboardapi?action=schedules&viewMode=list')).toEqual({ status: 200, text: BAD });
  });
});

describe('the servlet itself', () => {
  it('an unknown action is 400 {"message":"unknown action"}; a missing one too; a POST is a 405; another path is not its own', async () => {
    const s = setup(() => ({}));
    expect(await s.ask('/dashboardapi?action=nope')).toEqual({ status: 400, text: '{"message":"unknown action"}' });
    expect(await s.ask('/dashboardapi')).toEqual({ status: 400, text: '{"message":"unknown action"}' });
    expect((await s.ask('/dashboardapi?action=summary', { method: 'POST' })).status).toBe(405);
    expect((await s.ask('/board/leads')).status).toBe(404);
    expect(s.calls).toHaveLength(0);
  });
});
