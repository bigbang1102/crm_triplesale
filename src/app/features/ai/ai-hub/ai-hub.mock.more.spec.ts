import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { mockAiHubFetch } from './ai-hub.mock';
import { MORE_RESULTS } from './ai-hub.mock.more';

const API = '/triplesale/aihub';

async function request(url: string, init?: RequestInit): Promise<any> {
  const pending = mockAiHubFetch(url, init, API);
  await vi.advanceTimersByTimeAsync(2000);
  return (await pending).json();
}

const post = (tool: string, fields: Record<string, string> = {}) => {
  const body = new FormData();
  for (const [k, v] of Object.entries(fields)) body.append(k, v);
  return request(`${API}/tools/${tool}`, { method: 'POST', body });
};

describe('AI HUB mock — tools added after the first port', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it('answers every added tool with ok and a non-empty result', async () => {
    for (const tool of Object.keys(MORE_RESULTS)) {
      const j = await post(tool);
      expect(j.ok, tool).toBe(true);
      expect(Object.keys(j.result).length, tool).toBeGreaterThan(0);
    }
  });

  it('keeps the contracts the renderers rely on', async () => {
    const check = (await post('doc-check')).result;
    expect(check.score.total).toBe(check.checks.length);

    const plan = (await post('project-plan')).result;
    expect(plan.plan.every((t: { startWeek: number; weeks: number }) => t.startWeek + t.weeks <= plan.weeks)).toBe(true);

    const decision = (await post('decision')).result;
    const options = decision.matrix.options as { scores: number[] }[];
    expect(options.every((o) => o.scores.length === decision.matrix.criteria.length)).toBe(true);

    const preview = (await post('customer-brief', { preview: '1' })).result;
    expect(preview.customer).toBeTruthy();
  });

  it('runs the Claude Code key flow: request → issue → rename → reveal → revoke', async () => {
    const first = (await post('claude-code', { action: 'status' })).result;
    expect(first.me.status).toBe('NONE');

    expect((await post('claude-code', { action: 'request', note: 'x' })).result.me.status).toBe('ACTIVE');

    const issued = (await post('claude-code', { action: 'issue-key', name: 'โน้ตบุ๊ก' })).result;
    expect(issued.secret).toMatch(/^sk-mock-/);
    expect(issued.me.keys).toHaveLength(1);

    const renamed = (await post('claude-code', { action: 'rename-key', keyId: issued.keyId, name: 'คอมที่ทำงาน' })).result;
    expect(renamed.me.keys[0].name).toBe('คอมที่ทำงาน');
    expect((await post('claude-code', { action: 'reveal-key', keyId: issued.keyId })).result.secret).toBe(issued.secret);

    expect((await post('claude-code', { action: 'revoke-key', keyId: issued.keyId })).result.me.keys).toHaveLength(0);
  });

  it('serves the CRM customer search the customer brief calls, filtered by the typed text', async () => {
    const all = await request('/board/prospect-list?page=1&perPage=8&searchText=');
    expect(all.result.items.length).toBeGreaterThan(1);
    const some = await request('/board/prospect-list?page=1&perPage=8&searchText=' + encodeURIComponent('เชียงใหม่'));
    expect(some.result.items).toHaveLength(0); // matches name / code only, not the city
    const one = await request('/board/prospect?id=p-1002');
    expect(one.result.code).toBe('C-0002');
  });
});
