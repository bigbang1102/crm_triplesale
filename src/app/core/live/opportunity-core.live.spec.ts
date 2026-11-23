import { describe, expect, it } from 'vitest';
import { fetchLeadByIdResult, opportunityCoreRoutes, opportunityErrorJson, opportunityErrorResult, ROLE_CRM_LEAD_VIEW, unwrapLeadResult } from './opportunity-core.live';
import { composeRoutes } from './rest';
import { fakeRest, type FakeAnswer, type FakeCall, type FakeOptions } from './rest-fake';

const MESSAGES = { 'label.ld2.lead_no_permission': 'NO-PERMISSION', 'label.ld2.lead_load_failed_default': 'LOAD-FAILED' };

function setup(answer: (c: FakeCall) => FakeAnswer, o: FakeOptions = {}) {
  const { deps, calls } = fakeRest(answer, { roles: [ROLE_CRM_LEAD_VIEW], messages: MESSAGES, ...o });
  const route = composeRoutes(opportunityCoreRoutes(deps));
  return {
    deps,
    calls,
    ask: async (url: string, init?: RequestInit) => {
      const r = await route(url, init);
      return { status: r.status, text: await r.text() };
    },
  };
}
const lead = { id: 5, txNo: 'TX-1', prospect: { id: 9, name: 'สมชาย', currentCityName: 'กรุงเทพ', currentCityCode: 'BKK', currentDistrictName: 'พระนคร', currentDistrictCode: '1001', currentCountryName: 'Japan', currentCountryCode: 'JPN' } };
const env = (result: unknown, status = 200) => ({ status, message: 'OK', result });

describe('LeadBoardView helpers', () => {
  it('opportunityErrorJson has the shape of the backend: status, message and error {code, message}', () => {
    expect(JSON.parse(opportunityErrorJson(403, 'no'))).toEqual({ status: 403, message: 'no', error: { code: 403, message: 'no' } });
    expect(JSON.parse(opportunityErrorJson(500, null))).toEqual({ status: 500, message: '', error: { code: 500, message: '' } });
  });

  it('unwrapLeadResult: only an HTTP 200 body with envelope status 200 and a result gives the result text', () => {
    const ok = (body: string, status = 200) => unwrapLeadResult({ status, body });
    expect(ok('{"status":200,"result":{"id":1}}')).toBe('{"id":1}');
    expect(ok('{"status":"200","result":[1]}')).toBe('[1]');
    expect(ok('{"status":200,"result":"x"}')).toBe('x');
    expect(ok('{"status":200}')).toBeNull();
    expect(ok('{"status":404,"result":{}}')).toBeNull();
    expect(ok('{"status":200,"result":{}}', 201)).toBeNull();
    expect(ok('[1]')).toBeNull();
    expect(ok('{bad')).toBeNull();
    expect(unwrapLeadResult(null)).toBeNull();
  });

  it('opportunityErrorResult: a JSON body goes on as it is; the envelope status (≥ 400) replaces a backend 200; nothing to say is 502 with a built body', () => {
    expect(opportunityErrorResult({ status: 404, body: '{"status":404,"error":{"message":"gone"}}' }, 'D')).toEqual({ status: 404, body: '{"status":404,"error":{"message":"gone"}}' });
    expect(opportunityErrorResult({ status: 200, body: '{"status":403,"error":{"message":"x"}}' }, 'D').status).toBe(403);
    expect(opportunityErrorResult({ status: 200, body: '{"status":200}' }, 'D').status).toBe(502);
    expect(opportunityErrorResult({ status: 200, body: '{"status":302}' }, 'D').status).toBe(502);
    expect(opportunityErrorResult({ status: 0, body: '' }, 'D')).toEqual({ status: 502, body: opportunityErrorJson(502, 'D') });
    expect(opportunityErrorResult({ status: 500, body: '<html/>' }, 'D')).toEqual({ status: 500, body: opportunityErrorJson(500, 'D') });
    expect(opportunityErrorResult(null, 'D').status).toBe(502);
  });

  it('fetchLeadByIdResult: GET /leads/{id} (+ ?activityGroupId=), the status and body also of an error; no id = no call', async () => {
    const { deps, calls } = fakeRest(() => ({ status: 404, text: '{"status":404}' }));
    expect(await fetchLeadByIdResult(deps, ' 7 ', ' 3 ')).toEqual({ status: 404, body: '{"status":404}' });
    expect(await fetchLeadByIdResult(deps, '7', '')).toMatchObject({ status: 404 });
    expect(await fetchLeadByIdResult(deps, ' ', '3')).toEqual({ status: 0, body: '' });
    expect(calls.map((c) => c.path)).toEqual(['/leads/7?activityGroupId=3', '/leads/7']);
  });
});

describe('GET /board/lead (LeadDetailServlet)', () => {
  it('needs CRM_Lead_View: 403 with the message of the language, and no call to the service', async () => {
    const s = setup(() => env(lead), { roles: [] });
    const r = await s.ask('/board/lead?id=5');
    expect(r.status).toBe(403);
    expect(JSON.parse(r.text)).toEqual({ status: 403, message: 'NO-PERMISSION', error: { code: 403, message: 'NO-PERMISSION' } });
    expect(s.calls).toHaveLength(0);
  });

  it('answers the result of GET /leads/{id}; in Thai the prospect gets the Thai country name from the dictionary and the other names as they are', async () => {
    const s = setup(() => env(lead), { master: { th: { JPN: 'ญี่ปุ่น' }, en: { 'province.BKK': 'Bangkok', 'district.1001': 'Phra Nakhon' } } });
    const r = await s.ask('/board/lead?id=5&activityGroupId=3');
    expect(r.status).toBe(200);
    expect(s.calls.map((c) => c.path)).toEqual(['/leads/5?activityGroupId=3']);
    const p = JSON.parse(r.text).prospect;
    expect(p).toMatchObject({ name: 'สมชาย', currentCityNameI18n: 'กรุงเทพ', currentDistrictNameI18n: 'พระนคร', currentCountryNameI18n: 'ญี่ปุ่น' });
    expect(JSON.parse(r.text).txNo).toBe('TX-1');
  });

  it('in English the city and district come from the English dictionary and the country stays as the service named it', async () => {
    const s = setup(() => env(lead), { lang: 'en', master: { th: { JPN: 'ญี่ปุ่น' }, en: { 'province.BKK': 'Bangkok', 'district.1001': 'Phra Nakhon' } } });
    const p = JSON.parse((await s.ask('/board/lead?id=5')).text).prospect;
    expect(p).toMatchObject({ currentCityNameI18n: 'Bangkok', currentDistrictNameI18n: 'Phra Nakhon', currentCountryNameI18n: 'Japan' });
  });

  it('a result without a prospect (or one that is not an object) passes untouched', async () => {
    expect((await setup(() => env({ id: 1 })).ask('/board/lead?id=1')).text).toBe('{"id":1}');
    expect((await setup(() => env([1, 2])).ask('/board/lead?id=1')).text).toBe('[1,2]');
  });

  it('passes the backend error on with its status (the page shows error.message)', async () => {
    const body = '{"status":404,"message":"not found","error":{"code":404,"message":"ไม่พบ lead"}}';
    expect(await setup(() => ({ status: 404, text: body })).ask('/board/lead?id=5')).toMatchObject({ status: 404, text: body });
    // an envelope that says no inside an HTTP 200: its own status goes on
    expect(await setup(() => ({ status: 200, text: body })).ask('/board/lead?id=5')).toMatchObject({ status: 404, text: body });
  });

  it('builds its own error when the backend said nothing usable: 502 for no answer / no id / HTML, the backend status otherwise', async () => {
    const built = (status: number) => opportunityErrorJson(status, 'LOAD-FAILED');
    expect(await setup(() => null).ask('/board/lead?id=5')).toMatchObject({ status: 502, text: built(502) });
    const none = setup(() => env(lead));
    expect(await none.ask('/board/lead')).toMatchObject({ status: 502, text: built(502) });
    expect(none.calls).toHaveLength(0);
    expect(await setup(() => ({ status: 500, text: '<html>oops</html>' })).ask('/board/lead?id=5')).toMatchObject({ status: 500, text: built(500) });
  });

  it('only GET', async () => {
    expect((await setup(() => env(lead)).ask('/board/lead?id=5', { method: 'POST' })).status).toBe(405);
  });
});

describe('POST /board/schedule/add (AddScheduleServlet)', () => {
  const post = (body: unknown): RequestInit => ({ method: 'POST', body: typeof body === 'string' ? body : JSON.stringify(body) });

  it('POST /schedules without movementTypeId, with activityGroupId renamed procedureGroupId (unless the page sent one)', async () => {
    const s = setup(() => ({ status: 201, text: '{"status":201,"success":true,"result":{"id":77}}' }));
    const r = await s.ask('/board/schedule/add', post({ leadId: 5, movementTypeId: 1, activityGroupId: 3, title: 'โทร' }));
    expect(r).toMatchObject({ status: 200, text: '{"status":201,"success":true,"result":{"id":77}}' });
    expect(s.calls.map((c) => [c.method, c.path, c.body])).toEqual([['POST', '/schedules', { leadId: 5, title: 'โทร', procedureGroupId: 3 }]]);
    await s.ask('/board/schedule/add', post({ activityGroupId: 3, procedureGroupId: 8 }));
    await s.ask('/board/schedule/add', post({ activityGroupId: null }));
    expect(s.calls.slice(1).map((c) => c.body)).toEqual([{ procedureGroupId: 8 }, {}]);
  });

  it('an empty answer is the stand-in {"status":201,"success":true}; an envelope status ≥ 400 becomes the HTTP status, the body as it came', async () => {
    expect(await setup(() => ({ status: 201, text: '' })).ask('/board/schedule/add', post({}))).toMatchObject({ status: 200, text: '{"status":201,"success":true}' });
    const bad = '{"status":422,"message":"invalid","error":{"message":"วันที่ไม่ถูกต้อง"}}';
    expect(await setup(() => ({ status: 422, text: bad })).ask('/board/schedule/add', post({}))).toMatchObject({ status: 422, text: bad });
    // a text answer that is not JSON passes with 200 (the servlet only looked at `{…}`)
    expect(await setup(() => ({ status: 500, text: 'Internal error' })).ask('/board/schedule/add', post({}))).toMatchObject({ status: 200, text: 'Internal error' });
    // no answer from the service at all = an empty body
    expect(await setup(() => null).ask('/board/schedule/add', post({}))).toMatchObject({ status: 200, text: '{"status":201,"success":true}' });
  });

  it('a body that is not a JSON object is a 500; a GET is a 405', async () => {
    const s = setup(() => ({}));
    expect((await s.ask('/board/schedule/add', post('not json'))).status).toBe(500);
    expect((await s.ask('/board/schedule/add', post('[1]'))).status).toBe(500);
    expect((await s.ask('/board/schedule/add')).status).toBe(405);
    expect(s.calls).toHaveLength(0);
  });
});

describe('PATCH /board/schedule/edit (EditScheduleServlet)', () => {
  const patch = (body: unknown, method = 'PATCH'): RequestInit => ({ method, body: JSON.stringify(body) });

  it('PATCH /schedules/{id} with the rest of the body (leadId and id removed); POST works too', async () => {
    const s = setup(() => ({ status: 200, text: '{"status":200,"success":true}' }));
    expect(await s.ask('/board/schedule/edit', patch({ id: 12, leadId: 5, title: 'ใหม่' }))).toMatchObject({ status: 200, text: '{"status":200,"success":true}' });
    await s.ask('/board/schedule/edit', patch({ id: '13', note: 'x' }, 'POST'));
    expect(s.calls.map((c) => [c.method, c.path, c.body])).toEqual([
      ['PATCH', '/schedules/12', { title: 'ใหม่' }],
      ['PATCH', '/schedules/13', { note: 'x' }],
    ]);
  });

  it('an empty answer is {"status":200,"success":true}; an envelope status ≥ 400 is the HTTP status', async () => {
    expect(await setup(() => ({ status: 204, text: '' })).ask('/board/schedule/edit', patch({ id: 1 }))).toMatchObject({ status: 200, text: '{"status":200,"success":true}' });
    expect(await setup(() => ({ status: 404, text: '{"status":404,"message":"no"}' })).ask('/board/schedule/edit', patch({ id: 1 }))).toMatchObject({ status: 404 });
  });

  it('no id (or not a number) is a 500 and nothing is sent; a GET is a 405', async () => {
    const s = setup(() => ({}));
    expect((await s.ask('/board/schedule/edit', patch({ title: 'x' }))).status).toBe(500);
    expect((await s.ask('/board/schedule/edit', patch({ id: 'abc' }))).status).toBe(500);
    expect((await s.ask('/board/schedule/edit')).status).toBe(405);
    expect(s.calls).toHaveLength(0);
  });
});
