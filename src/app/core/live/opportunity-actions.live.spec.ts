import { describe, expect, it } from 'vitest';
import { NO_CONTENT, javaBlank, opportunityActionRoutes } from './opportunity-actions.live';
import { composeRoutes } from './rest';
import { fakeRest, SERVICE_API, type FakeAnswer, type FakeCall, type FakeOptions } from './rest-fake';

/** the servlets looked at no role: the user of the specs has none */
function setup(answer: (c: FakeCall) => FakeAnswer, o: FakeOptions = {}) {
  const { deps, calls } = fakeRest(answer, { roles: [], ...o });
  const route = composeRoutes(opportunityActionRoutes(deps));
  return {
    calls,
    ask: async (url: string, init?: RequestInit) => {
      const r = await route(url, init);
      return { status: r.status, text: await r.text(), type: r.headers.get('content-type') };
    },
  };
}
const post = (body: unknown): RequestInit => ({ method: 'POST', body: typeof body === 'string' ? body : JSON.stringify(body), headers: { 'Content-Type': 'application/json; charset=UTF-8' } });
const JSON_TYPE = 'application/json; charset=UTF-8';
/** what every call with a body sent (`Data_API.sendPOST`) */
const JSON_HEADERS = { Accept: 'application/json', 'Content-Type': JSON_TYPE };
const ACCEPT = { Accept: 'application/json' };
const STAND_IN = '{"status":204,"message":"no content"}';
const ok = { status: 200, message: 'OK' };

describe('String.isBlank (what the servlets asked of an answer)', () => {
  it('empty and Character.isWhitespace characters only; the no-break spaces are not whitespace', () => {
    for (const blank of ['', ' ', '\t\r\n', '\u000b\f\u001c\u001f', '        　']) expect(javaBlank(blank), JSON.stringify(blank)).toBe(true);
    for (const text of ['x', ' x ', ' ', ' ', ' ', '﻿', '​', '{}']) expect(javaBlank(text), JSON.stringify(text)).toBe(false);
    expect(javaBlank(null)).toBe(true);
    expect(javaBlank(undefined)).toBe(true);
  });
});

describe('POST /board/lead/close (LeadCloseServlet → POST /leads/{leadId}/close)', () => {
  it('sold / lost: the lead is in the path, the body is {"outcome":…}; the body of the service goes back with HTTP 200', async () => {
    const s = setup(() => ({ ...ok, result: { id: 1 } }));
    expect(await s.ask('../board/lead/close', post({ leadId: 1004400076, outcome: 'sold' }))).toEqual({ status: 200, text: JSON.stringify({ ...ok, result: { id: 1 } }), type: JSON_TYPE });
    await s.ask('/board/lead/close', post({ leadId: '77', outcome: 'lost', ignored: true }));
    expect(s.calls.map(({ method, url, body, headers }) => ({ method, url, body, headers }))).toEqual([
      { method: 'POST', url: `${SERVICE_API}/leads/1004400076/close`, body: '{"outcome":"sold"}', headers: JSON_HEADERS },
      { method: 'POST', url: `${SERVICE_API}/leads/77/close`, body: '{"outcome":"lost"}', headers: JSON_HEADERS },
    ]);
  });

  it('writes the lead id as the JSON value says (number or string, not trimmed)', async () => {
    const s = setup(() => ok);
    await s.ask('/board/lead/close', post('{"leadId": 12, "outcome":"sold"}'));
    await s.ask('/board/lead/close', post({ leadId: ' 13 ', outcome: 'sold' }));
    await s.ask('/board/lead/close', post({ leadId: true, outcome: 'sold' }));
    expect(s.calls.map((c) => c.path)).toEqual(['/leads/12/close', '/leads/ 13 /close', '/leads/true/close']);
  });

  it('400 {"status":400,"message":"missing params: leadId, outcome (sold|lost)"} without a call: no body, no JSON object, no / null / blank lead, no known outcome', async () => {
    const bad = '{"status":400,"message":"missing params: leadId, outcome (sold|lost)"}';
    const s = setup(() => ok);
    for (const init of [
      post(''),
      post('not json'),
      post('[1]'),
      post('null'),
      post({ outcome: 'sold' }),
      post({ leadId: null, outcome: 'sold' }),
      post({ leadId: 'null', outcome: 'sold' }),
      post({ leadId: '', outcome: 'sold' }),
      post({ leadId: ' \t', outcome: 'sold' }),
      post({ leadId: '　', outcome: 'sold' }), // Character.isWhitespace
      post({ leadId: 5 }),
      post({ leadId: 5, outcome: null }),
      post({ leadId: 5, outcome: 'SOLD' }),
      post({ leadId: 5, outcome: 'won' }),
      post({ leadId: 5, outcome: ['sold'] }),
      { method: 'POST' },
    ]) {
      expect(await s.ask('/board/lead/close', init), JSON.stringify(init.body)).toEqual({ status: 400, text: bad, type: JSON_TYPE });
    }
    expect(s.calls).toHaveLength(0);
  });

  it('a lead id of no-break spaces is not blank (Java isBlank): it is asked for', async () => {
    const s = setup(() => ok);
    await s.ask('/board/lead/close', post({ leadId: ' ', outcome: 'sold' }));
    expect(s.calls).toHaveLength(1);
  });

  it('the body of ANY status goes back (sendPOST): the error of the service is what the page reads', async () => {
    const err = { status: 400, message: 'Validation error', error: { code: 400, message: 'ปิดไม่ได้' } };
    const s = setup(() => ({ status: 400, text: JSON.stringify(err) }));
    expect(await s.ask('/board/lead/close', post({ leadId: 1, outcome: 'sold' }))).toEqual({ status: 200, text: JSON.stringify(err), type: JSON_TYPE });
  });

  it('a blank answer (nothing, whitespace, 204, no answer at all) is the stand-in {"status":204,"message":"no content"}', async () => {
    for (const answer of [{ status: 204, text: '' }, { status: 200, text: ' \n ' }, { status: 502, text: '' }, null]) {
      const s = setup(() => answer);
      expect(await s.ask('/board/lead/close', post({ leadId: 1, outcome: 'lost' }))).toEqual({ status: 200, text: STAND_IN, type: JSON_TYPE });
    }
    expect(NO_CONTENT).toBe(STAND_IN);
  });

  it('only POST: another method is a JSON 405', async () => {
    const s = setup(() => ok);
    expect(await s.ask('/board/lead/close')).toEqual({ status: 405, text: '{"status":405,"message":"Method Not Allowed"}', type: 'application/json;charset=UTF-8' });
    expect(s.calls).toHaveLength(0);
  });
});

describe('POST /board/lead/close-step (LeadCloseStepServlet → POST /leads/{leadId}/close-step)', () => {
  it('sends {wfsId, remark}; wfsId is a long (a numeric string counts), the remark is "" when missing or null', async () => {
    const s = setup(() => ok);
    await s.ask('/board/lead/close-step', post({ leadId: 5, wfsId: 123, remark: 'ปิดแก้ไขกลุ่มขั้นตอน' }));
    await s.ask('/board/lead/close-step', post({ leadId: '5', wfsId: '124' }));
    await s.ask('/board/lead/close-step', post({ leadId: 5, wfsId: 125.9, remark: null }));
    expect(s.calls.map(({ url, body, headers }) => ({ url, body, headers }))).toEqual([
      { url: `${SERVICE_API}/leads/5/close-step`, body: '{"wfsId":123,"remark":"ปิดแก้ไขกลุ่มขั้นตอน"}', headers: JSON_HEADERS },
      { url: `${SERVICE_API}/leads/5/close-step`, body: '{"wfsId":124,"remark":""}', headers: JSON_HEADERS },
      { url: `${SERVICE_API}/leads/5/close-step`, body: '{"wfsId":125,"remark":""}', headers: JSON_HEADERS },
    ]);
  });

  it('400 "missing params: leadId, wfsId" for no lead, or a wfsId that is missing, 0, negative or not a number', async () => {
    const bad = '{"status":400,"message":"missing params: leadId, wfsId"}';
    const s = setup(() => ok);
    for (const init of [post(''), post({ wfsId: 1 }), post({ leadId: 1 }), post({ leadId: 1, wfsId: 0 }), post({ leadId: 1, wfsId: -3 }), post({ leadId: 1, wfsId: 'abc' }), post({ leadId: 1, wfsId: true }), post({ leadId: 'null', wfsId: 4 })]) {
      expect(await s.ask('/board/lead/close-step', init), JSON.stringify(init.body)).toEqual({ status: 400, text: bad, type: JSON_TYPE });
    }
    expect(s.calls).toHaveLength(0);
  });

  it('passes the answer of the service on (any status), the stand-in for a blank one', async () => {
    let answer: FakeAnswer = { status: 500, text: '{"status":500,"message":"boom"}' };
    const s = setup(() => answer);
    expect((await s.ask('/board/lead/close-step', post({ leadId: 1, wfsId: 1 }))).text).toBe('{"status":500,"message":"boom"}');
    answer = { status: 200, text: '' };
    expect((await s.ask('/board/lead/close-step', post({ leadId: 1, wfsId: 1 }))).text).toBe(STAND_IN);
  });
});

describe('POST /board/lead/forward (LeadForwardServlet → POST /leads/{leadId}/forward)', () => {
  const targets = [
    { activityGroupId: 11, activityStepId: 111, assigneeEmployeeId: 850 },
    { activityGroupId: 12, activityStepId: 121, assigneeEmployeeId: 851 },
  ];

  it('sends the targets as they came; currentActivityGroupId only when > 0, remark only when not blank', async () => {
    const s = setup(() => ok);
    await s.ask('/board/lead/forward', post({ leadId: 1004400068, targets, currentActivityGroupId: 10, remark: 'ฝากต่อ' }));
    await s.ask('/board/lead/forward', post({ leadId: 1, targets }));
    await s.ask('/board/lead/forward', post({ leadId: 1, targets, currentActivityGroupId: 0, remark: ' 　 ' }));
    await s.ask('/board/lead/forward', post({ leadId: 1, targets, currentActivityGroupId: '7', remark: ' ' }));
    expect(s.calls.map(({ method, url, body, headers }) => ({ method, url, body: JSON.parse(body as string), headers }))).toEqual([
      { method: 'POST', url: `${SERVICE_API}/leads/1004400068/forward`, body: { targets, currentActivityGroupId: 10, remark: 'ฝากต่อ' }, headers: JSON_HEADERS },
      { method: 'POST', url: `${SERVICE_API}/leads/1/forward`, body: { targets }, headers: JSON_HEADERS },
      { method: 'POST', url: `${SERVICE_API}/leads/1/forward`, body: { targets }, headers: JSON_HEADERS },
      { method: 'POST', url: `${SERVICE_API}/leads/1/forward`, body: { targets, currentActivityGroupId: 7, remark: ' ' }, headers: JSON_HEADERS }, // (U+00A0 is not whitespace to isBlank)
    ]);
  });

  it('a remark with a quote or a line break is sent as the text it is', async () => {
    const s = setup(() => ok);
    await s.ask('/board/lead/forward', post({ leadId: 1, targets, remark: 'a "b"\nc' }));
    expect(JSON.parse(s.calls[0].body as string).remark).toBe('a "b"\nc');
  });

  it('400 "missing params: leadId, targets" for no lead, or targets that are missing, null, not an array or empty', async () => {
    const bad = '{"status":400,"message":"missing params: leadId, targets"}';
    const s = setup(() => ok);
    for (const init of [post(''), post({ targets }), post({ leadId: 1 }), post({ leadId: 1, targets: null }), post({ leadId: 1, targets: {} }), post({ leadId: 1, targets: 'x' }), post({ leadId: 1, targets: [] }), post({ leadId: ' ', targets })]) {
      expect(await s.ask('/board/lead/forward', init), JSON.stringify(init.body)).toEqual({ status: 400, text: bad, type: JSON_TYPE });
    }
    expect(s.calls).toHaveLength(0);
  });

  it('passes the answer of the service on (any status); a blank one is the stand-in', async () => {
    let answer: FakeAnswer = { status: 403, text: '{"status":403,"message":"no"}' };
    const s = setup(() => answer);
    expect(await s.ask('/board/lead/forward', post({ leadId: 1, targets }))).toEqual({ status: 200, text: '{"status":403,"message":"no"}', type: JSON_TYPE });
    answer = null;
    expect((await s.ask('/board/lead/forward', post({ leadId: 1, targets }))).text).toBe(STAND_IN);
  });
});

describe('POST /board/lead/return (LeadReturnServlet → POST /leads/{leadId}/return)', () => {
  it('sends {currentActivityGroupId, returnToActivityGroupId, remark}; the remark is "" when missing', async () => {
    const s = setup(() => ok);
    await s.ask('/board/lead/return', post({ leadId: 1004400076, currentActivityGroupId: 1004500001, returnToActivityGroupId: 1004500002, remark: 'ส่งกลับให้แก้ไข' }));
    await s.ask('/board/lead/return', post({ leadId: 2, currentActivityGroupId: '5', returnToActivityGroupId: 4 }));
    expect(s.calls.map(({ url, body, headers }) => ({ url, body, headers }))).toEqual([
      { url: `${SERVICE_API}/leads/1004400076/return`, body: '{"currentActivityGroupId":1004500001,"returnToActivityGroupId":1004500002,"remark":"ส่งกลับให้แก้ไข"}', headers: JSON_HEADERS },
      { url: `${SERVICE_API}/leads/2/return`, body: '{"currentActivityGroupId":5,"returnToActivityGroupId":4,"remark":""}', headers: JSON_HEADERS },
    ]);
  });

  it('400 "missing params: leadId, currentActivityGroupId, returnToActivityGroupId" unless the lead and both groups are there (> 0)', async () => {
    const bad = '{"status":400,"message":"missing params: leadId, currentActivityGroupId, returnToActivityGroupId"}';
    const s = setup(() => ok);
    for (const init of [
      post(''),
      post({ currentActivityGroupId: 1, returnToActivityGroupId: 2 }),
      post({ leadId: 1, returnToActivityGroupId: 2 }),
      post({ leadId: 1, currentActivityGroupId: 1 }),
      post({ leadId: 1, currentActivityGroupId: 0, returnToActivityGroupId: 2 }),
      post({ leadId: 1, currentActivityGroupId: 1, returnToActivityGroupId: -2 }),
      post({ leadId: 1, currentActivityGroupId: 'x', returnToActivityGroupId: 2 }),
    ]) {
      expect(await s.ask('/board/lead/return', init), JSON.stringify(init.body)).toEqual({ status: 400, text: bad, type: JSON_TYPE });
    }
    expect(s.calls).toHaveLength(0);
  });

  it('passes the answer of the service on (any status); a blank one is the stand-in', async () => {
    let answer: FakeAnswer = { status: 409, text: '{"status":409,"message":"already"}' };
    const s = setup(() => answer);
    const send = () => s.ask('/board/lead/return', post({ leadId: 1, currentActivityGroupId: 1, returnToActivityGroupId: 2 }));
    expect((await send()).text).toBe('{"status":409,"message":"already"}');
    answer = { status: 204, text: '' };
    expect((await send()).text).toBe(STAND_IN);
  });
});

describe('POST /board/lead/accessor-add (LeadAccessorAddServlet → POST /leads/{leadId}/accessors)', () => {
  it('the lead comes from the query (trimmed); the body is sent as it was posted (line breaks gone, ends trimmed)', async () => {
    const s = setup(() => ({ ...ok, result: { added: 2 } }));
    const r = await s.ask('../board/lead/accessor-add?leadId=%201004400063%20', post('  {"employeeIds":[\r\n850,851]}\n'));
    expect(r).toEqual({ status: 200, text: JSON.stringify({ ...ok, result: { added: 2 } }), type: JSON_TYPE });
    expect(s.calls.map(({ method, url, body, headers }) => ({ method, url, body, headers }))).toEqual([
      { method: 'POST', url: `${SERVICE_API}/leads/1004400063/accessors`, body: '{"employeeIds":[850,851]}', headers: JSON_HEADERS },
    ]);
  });

  it('400 "missing param: leadId" without a lead (checked first), 400 "body required" without a body — no call', async () => {
    const s = setup(() => ok);
    expect(await s.ask('/board/lead/accessor-add', post('{"employeeIds":[1]}'))).toEqual({ status: 400, text: '{"status":400,"message":"missing param: leadId"}', type: JSON_TYPE });
    expect((await s.ask('/board/lead/accessor-add?leadId=%20', post(''))).text).toBe('{"status":400,"message":"missing param: leadId"}');
    expect(await s.ask('/board/lead/accessor-add?leadId=5', post(' \r\n '))).toEqual({ status: 400, text: '{"status":400,"message":"body required"}', type: JSON_TYPE });
    expect((await s.ask('/board/lead/accessor-add?leadId=5', { method: 'POST' })).text).toBe('{"status":400,"message":"body required"}');
    expect(s.calls).toHaveLength(0);
  });

  it('the body is NOT looked into: text that is not JSON goes on too; the body of ANY status comes back; a blank answer is {}', async () => {
    let answer: FakeAnswer = { status: 500, text: '{"status":500,"message":"ไม่สามารถเพิ่มผู้มีสิทธิ์ได้"}' };
    const s = setup(() => answer);
    expect((await s.ask('/board/lead/accessor-add?leadId=5', post('plain text'))).text).toBe('{"status":500,"message":"ไม่สามารถเพิ่มผู้มีสิทธิ์ได้"}');
    expect(s.calls[0].body).toBe('plain text');
    answer = { status: 200, text: ' \n' };
    expect(await s.ask('/board/lead/accessor-add?leadId=5', post('{}'))).toEqual({ status: 200, text: '{}', type: JSON_TYPE });
    answer = null;
    expect((await s.ask('/board/lead/accessor-add?leadId=5', post('{}'))).text).toBe('{}');
  });

  it('only POST', async () => {
    const s = setup(() => ok);
    expect((await s.ask('/board/lead/accessor-add?leadId=5')).status).toBe(405);
  });
});

describe('GET /board/lead/contact-history (LeadContactHistoryServlet → GET /leads/{leadId}/contact-history)', () => {
  it('asks the service for the lead (trimmed) and answers the body of the 200 as it is', async () => {
    const history = { status: 200, result: [{ id: 1 }] };
    const s = setup(() => history);
    expect(await s.ask('../board/lead/contact-history?leadId=%201004400063')).toEqual({ status: 200, text: JSON.stringify(history), type: JSON_TYPE });
    expect(s.calls.map(({ method, url, headers }) => ({ method, url, headers }))).toEqual([{ method: 'GET', url: `${SERVICE_API}/leads/1004400063/contact-history`, headers: ACCEPT }]);
  });

  it('400 {"error":"leadId required"} without a lead — no call', async () => {
    const s = setup(() => ok);
    expect(await s.ask('/board/lead/contact-history')).toEqual({ status: 400, text: '{"error":"leadId required"}', type: JSON_TYPE });
    expect((await s.ask('/board/lead/contact-history?leadId=%20%09')).text).toBe('{"error":"leadId required"}');
    expect(s.calls).toHaveLength(0);
  });

  it('anything but a 200 answer is {} (sendGET): an error status, 204, no answer, a blank body', async () => {
    for (const answer of [{ status: 500, text: '{"status":500}' }, { status: 404, text: '{"x":1}' }, { status: 204, text: '' }, { status: 201, text: '{"x":1}' }, { status: 200, text: '  ' }, null]) {
      const s = setup(() => answer);
      expect(await s.ask('/board/lead/contact-history?leadId=3'), JSON.stringify(answer)).toEqual({ status: 200, text: '{}', type: JSON_TYPE });
    }
  });

  it('only GET', async () => {
    const s = setup(() => ok);
    expect((await s.ask('/board/lead/contact-history?leadId=3', post('{}'))).status).toBe(405);
  });
});

describe('GET /board/lead/forward-groups and /board/lead/return-groups (→ GET /leads/{leadId}/forward-groups | return-groups)', () => {
  const groups = { status: 200, message: 'OK', result: [{ id: 11, name: 'ขาย' }] };

  it('asks with currentActivityGroupId only when it is not blank (trimmed, URLEncoder-encoded)', async () => {
    const s = setup(() => groups);
    expect(await s.ask('../board/lead/forward-groups?leadId=7&currentActivityGroupId=1004500001')).toEqual({ status: 200, text: JSON.stringify(groups), type: JSON_TYPE });
    await s.ask('/board/lead/forward-groups?leadId=7');
    await s.ask('/board/lead/forward-groups?leadId=7&currentActivityGroupId=%20');
    await s.ask('/board/lead/return-groups?leadId=%207%20&currentActivityGroupId=%2012%20');
    await s.ask('/board/lead/return-groups?leadId=7&currentActivityGroupId=a%20b%26%E0%B8%81');
    await s.ask('/board/lead/return-groups?leadId=7');
    expect(s.calls.map((c) => [c.method, c.path, c.headers])).toEqual([
      ['GET', '/leads/7/forward-groups?currentActivityGroupId=1004500001', ACCEPT],
      ['GET', '/leads/7/forward-groups', ACCEPT],
      ['GET', '/leads/7/forward-groups', ACCEPT],
      ['GET', '/leads/7/return-groups?currentActivityGroupId=12', ACCEPT],
      ['GET', '/leads/7/return-groups?currentActivityGroupId=a+b%26%E0%B8%81', ACCEPT],
      ['GET', '/leads/7/return-groups', ACCEPT],
    ]);
  });

  it('400 {"status":400,"message":"missing param: leadId"} without a lead — no call', async () => {
    const s = setup(() => groups);
    for (const path of ['/board/lead/forward-groups', '/board/lead/return-groups']) {
      expect(await s.ask(`${path}?currentActivityGroupId=1`)).toEqual({ status: 400, text: '{"status":400,"message":"missing param: leadId"}', type: JSON_TYPE });
      expect((await s.ask(`${path}?leadId=%20`)).status).toBe(400);
    }
    expect(s.calls).toHaveLength(0);
  });

  it('anything but a 200 answer, or a blank (Java isBlank) 200 body, is {"status":204,"message":"no content"} with HTTP 200', async () => {
    for (const answer of [{ status: 500, text: '{"status":500,"message":"x"}' }, { status: 403, text: '{"error":1}' }, { status: 204, text: '' }, { status: 200, text: '' }, { status: 200, text: ' 　\n' }, null]) {
      const s = setup(() => answer);
      for (const path of ['/board/lead/forward-groups', '/board/lead/return-groups']) {
        expect(await s.ask(`${path}?leadId=3`), `${path} ${JSON.stringify(answer)}`).toEqual({ status: 200, text: STAND_IN, type: JSON_TYPE });
      }
    }
    // (a no-break space is not whitespace to isBlank: that body is passed on)
    const s = setup(() => ({ status: 200, text: ' ' }));
    expect((await s.ask('/board/lead/forward-groups?leadId=3')).text).toBe(' ');
  });

  it('only GET', async () => {
    const s = setup(() => groups);
    expect((await s.ask('/board/lead/forward-groups?leadId=3', post('{}'))).status).toBe(405);
    expect((await s.ask('/board/lead/return-groups?leadId=3', { method: 'DELETE' })).status).toBe(405);
  });
});

describe('GET /board/lead/forward-employees (LeadForwardEmployeesServlet → GET /leads/{leadId}/forward-employees)', () => {
  const people = { status: 200, message: 'OK', result: [{ id: 850, name: 'สมชาย' }] };

  it('asks with activityGroupId, then currentActivityGroupId — each only when it is not blank', async () => {
    const s = setup(() => people);
    expect(await s.ask('../board/lead/forward-employees?leadId=7&activityGroupId=11&currentActivityGroupId=10')).toEqual({ status: 200, text: JSON.stringify(people), type: JSON_TYPE });
    await s.ask('/board/lead/forward-employees?currentActivityGroupId=10&activityGroupId=%2011%20&leadId=%207%20'); // (the order of the page's query does not matter)
    await s.ask('/board/lead/forward-employees?leadId=7&activityGroupId=11');
    await s.ask('/board/lead/forward-employees?leadId=7&currentActivityGroupId=10&activityGroupId=');
    await s.ask('/board/lead/forward-employees?leadId=7&activityGroupId=%20&currentActivityGroupId=%20');
    await s.ask('/board/lead/forward-employees?leadId=7&activityGroupId=a+b');
    expect(s.calls.map((c) => c.path)).toEqual([
      '/leads/7/forward-employees?activityGroupId=11&currentActivityGroupId=10',
      '/leads/7/forward-employees?activityGroupId=11&currentActivityGroupId=10',
      '/leads/7/forward-employees?activityGroupId=11',
      '/leads/7/forward-employees?currentActivityGroupId=10',
      '/leads/7/forward-employees',
      '/leads/7/forward-employees?activityGroupId=a+b',
    ]);
  });

  it('400 "missing param: leadId"; a failed or blank answer is the 204 stand-in', async () => {
    const s = setup(() => ({ status: 500, text: '{"status":500}' }));
    expect(await s.ask('/board/lead/forward-employees?activityGroupId=11')).toEqual({ status: 400, text: '{"status":400,"message":"missing param: leadId"}', type: JSON_TYPE });
    expect(s.calls).toHaveLength(0);
    expect(await s.ask('/board/lead/forward-employees?leadId=7')).toEqual({ status: 200, text: STAND_IN, type: JSON_TYPE });
  });
});

describe('GET /board/lead/accessors (LeadAccessorsSearchServlet → GET /leads/{leadId}/accessors?all=true)', () => {
  it('always asks for all of them; answers the body of the 200', async () => {
    const list = { status: 200, result: [{ id: 850 }, { id: 851 }] };
    const s = setup(() => list);
    expect(await s.ask('../board/lead/accessors?leadId=%207%20&all=true&page=2&searchText=x')).toEqual({ status: 200, text: JSON.stringify(list), type: JSON_TYPE });
    await s.ask('/board/lead/accessors?leadId=7');
    expect(s.calls.map((c) => [c.method, c.path])).toEqual([
      ['GET', '/leads/7/accessors?all=true'],
      ['GET', '/leads/7/accessors?all=true'],
    ]);
  });

  it('400 "missing param: leadId"; a failed or blank answer is the 204 stand-in', async () => {
    const s = setup(() => ({ status: 404, text: '{"status":404}' }));
    expect(await s.ask('/board/lead/accessors')).toEqual({ status: 400, text: '{"status":400,"message":"missing param: leadId"}', type: JSON_TYPE });
    expect(await s.ask('/board/lead/accessors?leadId=7')).toEqual({ status: 200, text: STAND_IN, type: JSON_TYPE });
    expect(s.calls).toHaveLength(1);
  });
});

describe('routing', () => {
  it('knows only its own URLs (another servlet of the page is another module); the Java context path in front is ignored', async () => {
    const s = setup(() => ({ status: 200, message: 'OK' }));
    expect((await s.ask('/board/lead?id=7')).status).toBe(404); // LeadDetailServlet: lead-core.live.ts
    expect((await s.ask('/board/lead/unknown')).status).toBe(404);
    expect((await s.ask('/triplesale/board/lead/close', post({ leadId: 1, outcome: 'sold' }))).status).toBe(200);
    expect(s.calls.map((c) => c.path)).toEqual(['/leads/1/close']);
  });

  it('needs no role: a user with none still reaches the service (it decides)', async () => {
    const s = setup(() => ({ status: 200, message: 'OK' }), { roles: [] });
    expect((await s.ask('/board/lead/accessors?leadId=7')).text).toBe(JSON.stringify({ status: 200, message: 'OK' }));
  });
});
