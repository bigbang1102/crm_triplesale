import { afterEach, describe, expect, it, vi } from 'vitest';
import { AuthCallReport, setAuthTracer, tracedFetch } from './auth-trace';

const answer = (status: number, body: string) => new Response(body, { status });

describe('tracedFetch (the calls of the sign-in for the Token tab)', () => {
  afterEach(() => {
    setAuthTracer(null);
    vi.unstubAllGlobals();
  });

  it('with no listener it is plain fetch: same call, same answer, nothing read from the body', async () => {
    const res = answer(200, '{"a":1}');
    const fetchMock = vi.fn().mockResolvedValue(res);
    vi.stubGlobal('fetch', fetchMock);
    const init = { method: 'GET', headers: { Accept: 'application/json' } };
    expect(await tracedFetch('x', 'https://kc/x', init)).toBe(res);
    expect(fetchMock).toHaveBeenCalledWith('https://kc/x', init);
    expect(res.bodyUsed).toBe(false);
  });

  it('with a listener it reports what was sent (form body as text) and what came back, and still returns a readable answer', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(answer(200, '{"access_token":"t"}')));
    const seen: AuthCallReport[] = [];
    setAuthTracer((c) => seen.push(c));
    const res = await tracedFetch('Keycloak token', 'https://kc/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ grant_type: 'authorization_code', code: 'abc' }),
    });
    expect(await res.json()).toEqual({ access_token: 't' });
    expect(seen).toHaveLength(1);
    expect(seen[0]).toMatchObject({
      label: 'Keycloak token',
      method: 'POST',
      url: 'https://kc/token',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: 'grant_type=authorization_code&code=abc',
      status: 200,
      resBody: '{"access_token":"t"}',
    });
    expect(seen[0].ms).toBeGreaterThanOrEqual(0);
  });

  it('an error status is reported too; a call that gets no answer is reported with status 0 and the error still reaches the caller', async () => {
    const seen: AuthCallReport[] = [];
    setAuthTracer((c) => seen.push(c));
    vi.stubGlobal('fetch', vi.fn().mockResolvedValueOnce(answer(401, '{"error":"invalid_grant"}')).mockRejectedValueOnce(new TypeError('offline')));
    await tracedFetch('a', 'https://kc/a', { method: 'POST', headers: {} });
    await expect(tracedFetch('b', 'https://kc/b', { method: 'GET', headers: {} })).rejects.toThrow('offline');
    expect(seen.map((c) => [c.label, c.status])).toEqual([
      ['a', 401],
      ['b', 0],
    ]);
  });

  it('a listener that throws does not break the sign-in, and a long answer is clipped', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(answer(200, 'x'.repeat(5000))));
    let kept = '';
    setAuthTracer((c) => {
      kept = c.resBody;
      throw new Error('boom');
    });
    const res = await tracedFetch('a', 'https://kc/a', { method: 'GET', headers: {} });
    expect(res.status).toBe(200);
    expect(kept.startsWith('x'.repeat(4000))).toBe(true);
    expect(kept).toContain('ตัดออก 1000 ตัวอักษร จากทั้งหมด 5000');
  });
});
