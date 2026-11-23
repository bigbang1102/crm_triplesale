import { beforeEach, describe, expect, it } from 'vitest';
import { ROLE_CRM_LEAD_VIEW } from './opportunity-core.live';
import {
  DETAIL_FILTER_STATE_KEY,
  FILTER_STATE_KEY,
  fetchLeadsJson,
  javaDecimalLiteral,
  javaParseLong,
  javaTrim,
  javaUrlEncode,
  opportunitiesRoutes,
  localizeLocationNames,
  readBody,
  savedFilterState,
  toO2oLabel,
} from './opportunities.live';
import { composeRoutes } from './rest';
import { fakeRest, SERVICE_API, type FakeAnswer, type FakeCall, type FakeOptions } from './rest-fake';

function setup(answer: (c: FakeCall) => FakeAnswer, o: FakeOptions = {}) {
  const { deps, calls } = fakeRest(answer, { roles: [ROLE_CRM_LEAD_VIEW], ...o });
  const route = composeRoutes(opportunitiesRoutes(deps));
  return {
    deps,
    calls,
    ask: async (url: string, init?: RequestInit) => {
      const r = await route(url, init);
      return { status: r.status, text: await r.text(), type: r.headers.get('content-type') };
    },
  };
}
const post = (body: string, headers: Record<string, string> = {}): RequestInit => ({ method: 'POST', body, headers });
const JSON_TYPE = 'application/json; charset=UTF-8';
const env = (result: unknown, status = 200) => ({ status, message: 'OK', result });
/** what every body-carrying call of the servlets sent */
const JSON_HEADERS = { Accept: 'application/json', 'Content-Type': JSON_TYPE };

beforeEach(() => {
  sessionStorage.clear();
});

describe('Java helpers the servlets relied on', () => {
  it('String.trim removes every character up to U+0020 and nothing else (no-break space stays)', () => {
    expect(javaTrim(' \t\r\n\u0001 abc  ')).toBe('abc');
    expect(javaTrim(' abc ')).toBe(' abc ');
    expect(javaTrim('')).toBe('');
  });

  it('URLEncoder.encode(…, "UTF-8"): a space is +, * . - _ stay, the rest is percent-encoded UTF-8 (upper-case hex)', () => {
    expect(javaUrlEncode('a b')).toBe('a+b');
    expect(javaUrlEncode('A-z_0.9*')).toBe('A-z_0.9*');
    expect(javaUrlEncode('~!\'()&+=%/?#')).toBe('%7E%21%27%28%29%26%2B%3D%25%2F%3F%23');
    expect(javaUrlEncode('สม')).toBe('%E0%B8%AA%E0%B8%A1');
    expect(javaUrlEncode('é')).toBe('%C3%A9');
    expect(javaUrlEncode('😀')).toBe('%F0%9F%98%80'); // a surrogate pair is one 4-byte character
    expect(javaUrlEncode('\ud83d')).toBe('%3F'); // a lone surrogate is written as ?
  });

  it('Long.parseLong: a sign and digits within the long range; anything else is a NumberFormatException', () => {
    expect(javaParseLong('42')).toBe(42n);
    expect(javaParseLong('+7')).toBe(7n);
    expect(javaParseLong('-007')).toBe(-7n);
    expect(javaParseLong('9223372036854775807')).toBe(9223372036854775807n);
    expect(javaParseLong('9223372036854775808')).toBeUndefined();
    for (const bad of ['', ' 1', '1 ', '1.5', '1e3', 'abc', '0x10', '+', '-']) expect(javaParseLong(bad), bad).toBeUndefined();
  });

  it('new BigDecimal(text) as a JSON number: the same value without sign, leading or trailing zeros; text it rejects is undefined', () => {
    expect(javaDecimalLiteral('12.50')).toBe('12.5');
    expect(javaDecimalLiteral('+7')).toBe('7');
    expect(javaDecimalLiteral('-0.0')).toBe('0');
    expect(javaDecimalLiteral('007.100')).toBe('7.1');
    expect(javaDecimalLiteral('.5')).toBe('0.5');
    expect(javaDecimalLiteral('5.')).toBe('5');
    expect(javaDecimalLiteral('1e3')).toBe('1e3');
    expect(javaDecimalLiteral('1E+3')).toBe('1e3');
    expect(javaDecimalLiteral('12345678901234567890.123')).toBe('12345678901234567890.123'); // no precision lost
    for (const bad of ['', '.', 'e5', '1,000', 'abc', '1.2.3', '0x10', 'NaN', 'Infinity', ' 5']) expect(javaDecimalLiteral(bad), bad).toBeUndefined();
  });

  it('the body of a request is read like readLine() does: the line breaks go, the ends are trimmed', () => {
    expect(readBody({ body: ' {"a":\r\n1,\n"b":2}\r ' })).toBe('{"a":1,"b":2}');
    expect(readBody({})).toBe('');
    expect(readBody({ body: new URLSearchParams({ a: '1 2' }) })).toBe('a=1+2');
  });
});

describe('GET /board/leads (LeadsBoardServlet → LeadBoardView.fetchLeadsJson)', () => {
  const board = { id: 31, statusSummary: { total: 2 }, kanban: [{ stepId: 1, items: [] }] };

  it('needs CRM_Lead_View: without it the answer is [] and the service is not asked', async () => {
    const s = setup(() => env(board), { roles: [] });
    expect(await s.ask('/board/leads?viewMode=board')).toEqual({ status: 200, text: '[]', type: JSON_TYPE });
    expect(s.calls).toHaveLength(0);
  });

  it('asks GET /leads with only the defaults when the page sends nothing; answers the `result` as JSON text', async () => {
    const s = setup(() => env(board));
    const r = await s.ask('/board/leads');
    expect(s.calls.map(({ method, url, headers }) => ({ method, url, headers }))).toEqual([
      { method: 'GET', url: `${SERVICE_API}/leads?viewMode=board&sortBy=txdate_desc&page=1&perPage=20`, headers: { Accept: 'application/json' } },
    ]);
    expect(r).toEqual({ status: 200, text: JSON.stringify(board), type: JSON_TYPE });
  });

  it('passes every parameter on in the order of the Java URL, trimmed and as they are; only `search` is URL-encoded (URLEncoder rules)', async () => {
    const s = setup(() => env(board));
    await s.ask(
      '/board/leads?' +
        [
          'viewMode=list', 'movementTypeId=%2031', 'activityGroupId=101', 'activityStepId=1012', 'search=%20%E0%B8%AA%E0%B8%A1%20a*b%20', 'showClosed=true', 'dateRangeType=custom',
          'dateFrom=2026-01-01', 'dateTo=2026-01-31', 'provinceId=1', 'districtId=101', 'activeStatus=HOT', 'saleGroupId=11', 'salePersonId=9', 'employeeId=1003', 'tagIds=1,2',
          'sortBy=status', 'page=3', 'perPage=50',
        ].join('&'),
    );
    expect(s.calls[0].path).toBe(
      '/leads?viewMode=list&movementTypeId=31&activityGroupId=101&activityStepId=1012&search=%E0%B8%AA%E0%B8%A1+a*b&showClosed=true&dateRangeType=custom' +
        '&dateFrom=2026-01-01&dateTo=2026-01-31&provinceId=1&districtId=101&activeStatus=HOT&saleGroupId=11&employeeId=1003&tagIds=1,2&sortBy=status&page=3&perPage=50',
    );
    // (salePersonId of the page is not forwarded: the servlet sends employeeId only)
    expect(s.calls[0].path).not.toContain('salePersonId');
  });

  it('leaves out every blank parameter; a blank viewMode / sortBy is the default', async () => {
    const s = setup(() => env(board));
    await s.ask('/board/leads?viewMode=%20&movementTypeId=&search=%20%20&provinceId=%09&sortBy=');
    expect(s.calls[0].path).toBe('/leads?viewMode=board&sortBy=txdate_desc&page=1&perPage=20');
  });

  it('page and perPage: Integer.parseInt of the trimmed value; blank / not an int is the default; below 1 is 1 and 20; no upper limit', async () => {
    const s = setup(() => env(board));
    const asked = async (q: string) => {
      s.calls.length = 0;
      await s.ask(`/board/leads?${q}`);
      return s.calls[0].path.replace(/^.*&page=/, 'page=');
    };
    expect(await asked('page=0&perPage=-3')).toBe('page=1&perPage=20');
    expect(await asked('page=abc&perPage=1.5')).toBe('page=1&perPage=20');
    expect(await asked('page=%20&perPage=')).toBe('page=1&perPage=20');
    expect(await asked('page=%2B7&perPage=%20500%20')).toBe('page=7&perPage=500');
    // above the int range Integer.parseInt throws: the default, not the maximum
    expect(await asked('page=2147483648&perPage=99999999999')).toBe('page=1&perPage=20');
    expect(await asked('page=2147483647&perPage=2147483647')).toBe('page=2147483647&perPage=2147483647');
    expect(await asked('page=1&perPage=0')).toBe('page=1&perPage=20');
  });

  it('the result of the envelope is the answer, whatever it is: an object, an array, null, a string', async () => {
    expect((await setup(() => env([{ id: 1 }])).ask('/board/leads')).text).toBe('[{"id":1}]');
    expect((await setup(() => ({ status: '200', result: { a: 1 } })).ask('/board/leads')).text).toBe('{"a":1}'); // status as text still counts (optInt)
    expect((await setup(() => env(null)).ask('/board/leads')).text).toBe('null');
    expect((await setup(() => env('abc')).ask('/board/leads')).text).toBe('abc');
    expect((await setup(() => env('')).ask('/board/leads')).text).toBe('[]'); // an empty text is [] again
  });

  it('every way the service can fail is [] with status 200 (the page never sees the error): not 200, no answer, not JSON, not an object, envelope says no, no result', async () => {
    for (const answer of [
      { status: 500, text: '{"status":500,"message":"boom"}' },
      { status: 404, text: JSON.stringify(env(board)) }, // (a 404 body is dropped: sendGET gives "" for anything but 200)
      { status: 201, text: JSON.stringify(env(board)) },
      null,
      'not json',
      '<html>gateway</html>',
      '[1,2]',
      '{bad json',
      env(board, 404),
      env(board, 500),
      { status: 200, message: 'no result' },
      { result: board },
    ] as FakeAnswer[]) {
      const r = await setup(() => answer).ask('/board/leads?viewMode=list');
      expect(r, JSON.stringify(answer)).toEqual({ status: 200, text: '[]', type: JSON_TYPE });
    }
  });

  it('only GET', async () => {
    const s = setup(() => env(board));
    expect((await s.ask('/board/leads', { method: 'POST' })).status).toBe(405);
    expect(s.calls).toHaveLength(0);
  });

  describe('place names in the language of the page (localizeLocationNames)', () => {
    const item = (o: Record<string, unknown> = {}) => ({
      id: 1,
      currentCityName: 'กรุงเทพมหานคร',
      currentCityCode: 'BKK',
      currentDistrictName: 'พระนคร',
      currentDistrictCode: 'BKK_01',
      currentCountryName: 'Thailand',
      currentCountryCode: 'THA',
      ...o,
    });
    const result = (o?: Record<string, unknown>) => ({ leads: { items: [item(o)], meta: { page: 1 } }, kanban: [{ stepId: 5, items: [item(o), item({ id: 2 })] }, { stepId: 6, items: [] }] });
    const master = { en: { 'province.BKK': 'Bangkok', 'district.BKK_01': 'Phra Nakhon District' }, th: { THA: 'ไทย', JPN: 'ญี่ปุ่น' } };
    const items = (text: string) => {
      const j = JSON.parse(text);
      return [...j.leads.items, ...j.kanban.flatMap((c: { items: unknown[] }) => c.items)] as Record<string, string>[];
    };

    it('Thai: the country comes from the Thai dictionary by its code; the city and the district stay as the service named them', async () => {
      const r = await setup(() => env(result()), { master }).ask('/board/leads');
      for (const it of items(r.text)) expect(it).toMatchObject({ currentCityName: 'กรุงเทพมหานคร', currentDistrictName: 'พระนคร', currentCountryName: 'ไทย' });
      // a code the dictionary does not know keeps the name of the service
      const r2 = await setup(() => env(result({ currentCountryName: 'Japan', currentCountryCode: 'XXX' })), { master }).ask('/board/leads');
      expect(items(r2.text)[0]['currentCountryName']).toBe('Japan');
      // no code at all: also kept
      const r3 = await setup(() => env(result({ currentCountryName: 'Japan', currentCountryCode: null })), { master }).ask('/board/leads');
      expect(items(r3.text)[0]['currentCountryName']).toBe('Japan');
    });

    it('English: city and district come from the English dictionary by their codes (province.<code> / district.<code>); the country is left as it is', async () => {
      const r = await setup(() => env(result()), { master, lang: 'en' }).ask('/board/leads');
      for (const it of items(r.text)) expect(it).toMatchObject({ currentCityName: 'Bangkok', currentDistrictName: 'Phra Nakhon District', currentCountryName: 'Thailand' });
      // no entry for the code = the Thai name stays; no code = it stays
      const r2 = await setup(() => env(result({ currentCityCode: 'ZZZ', currentDistrictCode: '' })), { master, lang: 'en' }).ask('/board/leads');
      expect(items(r2.text)[0]).toMatchObject({ currentCityName: 'กรุงเทพมหานคร', currentDistrictName: 'พระนคร' });
    });

    it('blank names are not touched in either language; items that are not objects and results that are not objects pass', async () => {
      const blankNames = result({ currentCityName: '  ', currentDistrictName: '', currentCountryName: ' ' });
      const en = await setup(() => env(blankNames), { master, lang: 'en' }).ask('/board/leads');
      expect(items(en.text)[0]).toMatchObject({ currentCityName: '  ', currentDistrictName: '', currentCountryName: ' ' });
      const th = await setup(() => env(blankNames), { master }).ask('/board/leads');
      expect(items(th.text)[0]).toMatchObject({ currentCountryName: ' ' });

      const odd = { kanban: [null, 5, 'x', { items: [null, 7, item()] }, { items: 'no' }], leads: [1] };
      const r = await setup(() => env(odd), { master }).ask('/board/leads');
      expect(JSON.parse(r.text).kanban[3].items[2].currentCountryName).toBe('ไทย');
      expect((await setup(() => env([item()]), { master, lang: 'en' }).ask('/board/leads')).text).toBe(JSON.stringify([item()]));
    });

    it('the text of a result that is not a JSON object goes back as it is', () => {
      const { deps } = fakeRest(() => ({}), { master });
      for (const text of ['[]', '[1]', 'null', 'abc', '5', '{bad']) expect(localizeLocationNames(deps, text)).toBe(text);
    });
  });

  it('fetchLeadsJson with a few fields only (the short overloads of the Java bean): the rest is left out, page 1 of 20', async () => {
    const s = setup(() => env(board));
    expect(await fetchLeadsJson(s.deps, { viewMode: ' list ', movementTypeId: '31' })).toBe(JSON.stringify(board));
    expect(s.calls[0].path).toBe('/leads?viewMode=list&movementTypeId=31&sortBy=txdate_desc&page=1&perPage=20');
    await fetchLeadsJson(s.deps);
    expect(s.calls[1].path).toBe('/leads?viewMode=board&sortBy=txdate_desc&page=1&perPage=20');
    await fetchLeadsJson(s.deps, { salePersonId: '7', employeeId: '8', page: 0, perPage: 0 });
    expect(s.calls[2].path).toBe('/leads?viewMode=board&salePersonId=7&employeeId=8&sortBy=txdate_desc&page=1&perPage=20');
  });
});

describe('GET|POST /board/filter-state (FilterStateServlet) — the HttpSession of Java is the sessionStorage of the tab, one entry per user', () => {
  it('answers the text "null" while nothing was saved', async () => {
    expect(await setup(() => ({})).ask('/board/filter-state')).toEqual({ status: 200, text: 'null', type: JSON_TYPE });
  });

  it('POST keeps the body (line breaks joined, trimmed) and answers 204 with no body; GET gives it back', async () => {
    const s = setup(() => ({}));
    const saved = await s.ask('/board/filter-state', post(' {"tab":"list",\n"search":"สม"}\n'));
    expect(saved).toMatchObject({ status: 204, text: '' });
    expect(await s.ask('/board/filter-state')).toMatchObject({ status: 200, text: '{"tab":"list","search":"สม"}' });
    expect(sessionStorage.getItem(`${FILTER_STATE_KEY}:u`)).toBe('{"tab":"list","search":"สม"}');
    expect(savedFilterState(s.deps)).toBe('{"tab":"list","search":"สม"}');
    expect(s.calls).toHaveLength(0); // no REST call at all
  });

  it('an empty POST keeps what was saved (the board never clears its state); the text "null" is kept as it is', async () => {
    const s = setup(() => ({}));
    await s.ask('/board/filter-state', post('{"tab":"board"}'));
    await s.ask('/board/filter-state', post('   \n '));
    expect((await s.ask('/board/filter-state')).text).toBe('{"tab":"board"}');
    await s.ask('/board/filter-state', post('null'));
    expect((await s.ask('/board/filter-state')).text).toBe('null');
    expect(savedFilterState(s.deps)).toBe('null'); // (the bean hands the page "null" either way)
  });

  it('each signed-in user has a state of their own', async () => {
    const a = setup(() => ({}), { user: { username: 'anna' } });
    const b = setup(() => ({}), { user: { username: 'ben' } });
    await a.ask('/board/filter-state', post('{"tab":"list"}'));
    expect((await b.ask('/board/filter-state')).text).toBe('null');
    await b.ask('/board/filter-state', post('{"tab":"board"}'));
    expect((await a.ask('/board/filter-state')).text).toBe('{"tab":"list"}');
    expect(savedFilterState(b.deps)).toBe('{"tab":"board"}');
  });

  it('no saved state (or a blank one) is null for the page; other methods are 405', async () => {
    const s = setup(() => ({}));
    expect(savedFilterState(s.deps)).toBeNull();
    sessionStorage.setItem(`${FILTER_STATE_KEY}:u`, '  ');
    expect(savedFilterState(s.deps)).toBeNull();
    expect((await s.ask('/board/filter-state')).text).toBe('null');
    expect((await s.ask('/board/filter-state', { method: 'DELETE' })).status).toBe(405);
  });
});

describe('GET|POST /board/detail-filter-state (DetailFilterStateServlet)', () => {
  it('has its own state, apart from the board one; POST of "null" or an empty body removes it', async () => {
    const s = setup(() => ({}));
    expect(await s.ask('/board/detail-filter-state')).toEqual({ status: 200, text: 'null', type: JSON_TYPE });
    await s.ask('/board/filter-state', post('{"tab":"list"}'));
    expect(await s.ask('/board/detail-filter-state', post('{"leadId":"5","selectChannal":"call"}'))).toMatchObject({ status: 204, text: '' });
    expect((await s.ask('/board/detail-filter-state')).text).toBe('{"leadId":"5","selectChannal":"call"}');
    expect(sessionStorage.getItem(`${DETAIL_FILTER_STATE_KEY}:u`)).toBe('{"leadId":"5","selectChannal":"call"}');
    expect((await s.ask('/board/filter-state')).text).toBe('{"tab":"list"}');

    await s.ask('/board/detail-filter-state', post('null'));
    expect((await s.ask('/board/detail-filter-state')).text).toBe('null');
    expect(sessionStorage.getItem(`${DETAIL_FILTER_STATE_KEY}:u`)).toBeNull();
    await s.ask('/board/detail-filter-state', post('{"a":1}'));
    await s.ask('/board/detail-filter-state', post('  '));
    expect((await s.ask('/board/detail-filter-state')).text).toBe('null');
    expect((await s.ask('/board/detail-filter-state', { method: 'PUT' })).status).toBe(405);
  });
});

describe('POST /board/lead-assign (AssignLeadServlet)', () => {
  it('needs a body: an empty one is 400 {"error":"body required"} and nothing is sent', async () => {
    const s = setup(() => ({}));
    expect(await s.ask('/board/lead-assign', post('  \n '))).toEqual({ status: 400, text: '{"error":"body required"}', type: JSON_TYPE });
    expect((await s.ask('/board/lead-assign', { method: 'POST' })).status).toBe(400);
    expect(s.calls).toHaveLength(0);
  });

  it('PATCH /leads/assign with the text the page posted, untouched (only the line breaks are lost); the answer of the service goes back whatever its status', async () => {
    const s = setup(() => ({ status: 200, text: '{"status":200,"success":true}' }));
    const r = await s.ask('/board/lead-assign', post(' {"leadId":5,\n"employeeId":9,"extra":"keeps"}\n'));
    expect(r).toEqual({ status: 200, text: '{"status":200,"success":true}', type: JSON_TYPE });
    expect(s.calls.map((c) => [c.method, c.url, c.body, c.headers])).toEqual([['PATCH', `${SERVICE_API}/leads/assign`, '{"leadId":5,"employeeId":9,"extra":"keeps"}', JSON_HEADERS]]);

    const bad = '{"status":403,"message":"no","error":{"message":"ไม่มีสิทธิ์"}}';
    expect(await setup(() => ({ status: 403, text: bad })).ask('/board/lead-assign', post('{"leadId":5}'))).toMatchObject({ status: 200, text: bad });
    expect(await setup(() => ({ status: 500, text: '<html/>' })).ask('/board/lead-assign', post('{"leadId":5}'))).toMatchObject({ status: 200, text: '<html/>' });
  });

  it('nothing back (an empty body, no answer at all) is {}', async () => {
    expect(await setup(() => ({ status: 204, text: '' })).ask('/board/lead-assign', post('{"leadId":5}'))).toMatchObject({ status: 200, text: '{}' });
    expect(await setup(() => null).ask('/board/lead-assign', post('{"leadId":5}'))).toMatchObject({ status: 200, text: '{}' });
  });

  it('only POST', async () => {
    expect((await setup(() => ({})).ask('/board/lead-assign')).status).toBe(405);
  });
});

describe('ContactChannel.toO2oLabel', () => {
  it('the channel of the CRM buttons (snake_case) and of the history filter become the labels of the o2o combo; an unknown one is only trimmed', () => {
    const cases: [string, string][] = [
      ['manual', 'Manual'], ['call_in', 'Call In'], ['call_out', 'Call Out'], ['Call out', 'Call Out'], ['CALL-OUT', 'Call Out'], ['callin', 'Call In'], ['sms', 'SMS'], ['SMS', 'SMS'],
      ['email', 'Email'], ['e-mail', 'Email'], ['facebook', 'Facebook'], ['line', 'Line'], ['whatsapp', 'WhatsApp'], ['  call_out ', 'Call Out'], ['system', 'system'], [' System ', 'System'],
      ['fb', 'fb'], ['', ''],
    ];
    for (const [raw, label] of cases) expect(toO2oLabel(raw), JSON.stringify(raw)).toBe(label);
  });
});

describe('POST /board/contact-activities (ContactActivitiesServlet)', () => {
  const ok = { status: 201, text: '{"status":201,"message":"success","result":{"id":9}}' };

  it('a body that is not a JSON object is 400 invalid json body (nothing sent)', async () => {
    const s = setup(() => ok);
    for (const body of ['', 'abc', '[1]', 'null', '"x"', '{bad']) {
      expect(await s.ask('/board/contact-activities', post(body)), JSON.stringify(body)).toEqual({ status: 400, text: '{"error":"invalid json body"}', type: JSON_TYPE });
    }
    expect((await s.ask('/board/contact-activities', { method: 'POST' })).status).toBe(400);
    expect(s.calls).toHaveLength(0);
  });

  it('a body without leadId (or with null) is 400 leadId required', async () => {
    const s = setup(() => ok);
    expect(await s.ask('/board/contact-activities', post('{"channel":"line"}'))).toEqual({ status: 400, text: '{"error":"leadId required"}', type: JSON_TYPE });
    expect((await s.ask('/board/contact-activities', post('{"leadId":null}'))).text).toBe('{"error":"leadId required"}');
    expect(s.calls).toHaveLength(0);
  });

  it('POST /leads/{leadId}/contact-activities: leadId moves to the path (not in the body), the channel becomes the o2o label, the rest goes as it is', async () => {
    const s = setup(() => ok);
    const r = await s.ask('/board/contact-activities', post(JSON.stringify({ leadId: '12', channel: 'call_out', content: 'โทรแล้ว', procedureGroupId: 101, procedureId: 1012, workRecordDate: '2026-10-01T09:30:00' })));
    expect(r).toEqual({ status: 201, text: ok.text, type: JSON_TYPE });
    expect(s.calls.map((c) => [c.method, c.url, c.headers])).toEqual([['POST', `${SERVICE_API}/leads/12/contact-activities`, JSON_HEADERS]]);
    expect(JSON.parse(s.calls[0].body as string)).toEqual({ channel: 'Call Out', content: 'โทรแล้ว', procedureGroupId: 101, procedureId: 1012, workRecordDate: '2026-10-01T09:30:00' });
    // a number is the same path; the other channels
    await s.ask('/board/contact-activities', post('{"leadId":7,"channel":"whatsapp"}'));
    await s.ask('/board/contact-activities', post('{"leadId":7,"channel":" system "}'));
    await s.ask('/board/contact-activities', post('{"leadId":7,"channel":"   "}'));
    await s.ask('/board/contact-activities', post('{"leadId":7,"content":"no channel"}'));
    await s.ask('/board/contact-activities', post('{"leadId":7,"channel":5}'));
    await s.ask('/board/contact-activities', post('{"leadId":7,"channel":null}'));
    expect(s.calls.slice(1).map((c) => [c.url.replace(SERVICE_API, ''), JSON.parse(c.body as string)])).toEqual([
      ['/leads/7/contact-activities', { channel: 'WhatsApp' }],
      ['/leads/7/contact-activities', { channel: 'system' }],
      ['/leads/7/contact-activities', { channel: '   ' }],
      ['/leads/7/contact-activities', { content: 'no channel' }],
      ['/leads/7/contact-activities', { channel: '5' }],
      ['/leads/7/contact-activities', { channel: null }],
    ]);
  });

  it('the status and the body of the service go back as they are (a rejection must not look like a success); an empty body is {}', async () => {
    const reject = '{"status":422,"message":"x","error":{"code":422,"message":"ขั้นตอนไม่ถูกต้อง"}}';
    expect(await setup(() => ({ status: 422, text: reject })).ask('/board/contact-activities', post('{"leadId":1}'))).toMatchObject({ status: 422, text: reject });
    expect(await setup(() => ({ status: 500, text: '<html>oops</html>' })).ask('/board/contact-activities', post('{"leadId":1}'))).toMatchObject({ status: 500, text: '<html>oops</html>' });
    expect(await setup(() => ({ status: 403, text: '' })).ask('/board/contact-activities', post('{"leadId":1}'))).toMatchObject({ status: 403, text: '{}' });
    expect(await setup(() => ({ status: 200, text: '  ' })).ask('/board/contact-activities', post('{"leadId":1}'))).toMatchObject({ status: 200, text: '{}' });
    // a status that carries no body has none
    const none = await setup(() => ({ status: 204, text: '' })).ask('/board/contact-activities', post('{"leadId":1}'));
    expect(none).toMatchObject({ status: 204, text: '' });
  });

  it('no answer at all (status 0) is 502 with {}', async () => {
    expect(await setup(() => null).ask('/board/contact-activities', post('{"leadId":1}'))).toEqual({ status: 502, text: '{}', type: JSON_TYPE });
  });

  it('only POST', async () => {
    expect((await setup(() => ok).ask('/board/contact-activities')).status).toBe(405);
  });
});

describe('POST /board/lead-update (LeadUpdateServlet)', () => {
  const form = (body: string): RequestInit => ({ method: 'POST', body, headers: { 'Content-Type': 'application/x-www-form-urlencoded;charset=UTF-8' } });
  const ok = { status: 200, text: '{"status":200,"message":"updated"}' };
  const only = (s: ReturnType<typeof setup>) => s.calls.map((c) => [c.method, c.path, JSON.parse(c.body as string)]);

  it('reads the parameters of the form body (the lead page posts them there) or of the query string; the query comes first', async () => {
    const s = setup(() => ok);
    await s.ask('/board/lead-update', form('action=demand&leadId=5&demand=%E0%B8%95%E0%B9%89%E0%B8%AD%E0%B8%87%E0%B8%81%E0%B8%B2%E0%B8%A3'));
    await s.ask('/board/lead-update?action=active-status&leadId=6', post('activeStatus=HOT')); // no form content type: the body is not read
    await s.ask('/board/lead-update?action=active-status&leadId=6&activeStatus=COLD', form('leadId=99&activeStatus=HOT'));
    expect(only(s)).toEqual([
      ['PATCH', '/leads/demand', { leadId: 5, demand: 'ต้องการ' }],
      ['PATCH', '/leads/active-status', { leadId: 6, activeStatus: '' }],
      ['PATCH', '/leads/active-status', { leadId: 6, activeStatus: 'COLD' }],
    ]);
    expect(s.calls.every((c) => JSON.stringify(c.headers) === JSON.stringify(JSON_HEADERS))).toBe(true);
  });

  it('target-year: PATCH /leads/target-year {leadId, yearCode}; a leadId that is not a long is 0; values are trimmed', async () => {
    const s = setup(() => ok);
    expect(await s.ask('/board/lead-update', form('action=target-year&leadId=%205%20&yearCode=%202026%20'))).toEqual({ status: 200, text: ok.text, type: JSON_TYPE });
    await s.ask('/board/lead-update', form('action=target-year&leadId=abc&yearCode='));
    await s.ask('/board/lead-update', form('action=target-year'));
    expect(only(s)).toEqual([
      ['PATCH', '/leads/target-year', { leadId: 5, yearCode: '2026' }],
      ['PATCH', '/leads/target-year', { leadId: 0, yearCode: '' }],
      ['PATCH', '/leads/target-year', { leadId: 0, yearCode: '' }],
    ]);
  });

  it('target-month: the month is (int) of a long (it wraps)', async () => {
    const s = setup(() => ok);
    await s.ask('/board/lead-update', form('action=target-month&leadId=5&month=3'));
    await s.ask('/board/lead-update', form('action=target-month&leadId=5&month=4294967297'));
    await s.ask('/board/lead-update', form('action=target-month&leadId=5&month=x'));
    expect(only(s).map((c) => c[2])).toEqual([{ leadId: 5, month: 3 }, { leadId: 5, month: 1 }, { leadId: 5, month: 0 }]);
  });

  it('amount: new BigDecimal(text), ZERO when it cannot be read', async () => {
    const s = setup(() => ok);
    for (const amount of ['12.50', '+7', '.5', '1e3', '1,000', 'abc', '', '12345678901234567890.5']) await s.ask('/board/lead-update', form(`action=amount&leadId=5&amount=${encodeURIComponent(amount)}`));
    expect(s.calls.map((c) => c.body)).toEqual([
      '{"leadId":5,"amount":12.5}',
      '{"leadId":5,"amount":7}',
      '{"leadId":5,"amount":0.5}',
      '{"leadId":5,"amount":1e3}',
      '{"leadId":5,"amount":0}',
      '{"leadId":5,"amount":0}',
      '{"leadId":5,"amount":0}',
      '{"leadId":5,"amount":12345678901234567890.5}',
    ]);
    expect(s.calls.every((c) => c.path === '/leads/amount')).toBe(true);
  });

  it('tags: PUT /leads/{leadId}/tags {tagIds:[…]} — entries that are not longs are skipped; no tags is an empty list; no leadId is /leads/0', async () => {
    const s = setup(() => ok);
    await s.ask('/board/lead-update', form('action=tags&leadId=5&tagIds=1,1005099003,, x ,3,2.5,-4'));
    await s.ask('/board/lead-update', form('action=tags&leadId=5&tagIds='));
    await s.ask('/board/lead-update', form('action=tags&tagIds=9'));
    expect(s.calls.map((c) => [c.method, c.path, c.body])).toEqual([
      ['PUT', '/leads/5/tags', '{"tagIds":[1,1005099003,3,-4]}'],
      ['PUT', '/leads/5/tags', '{"tagIds":[]}'],
      ['PUT', '/leads/0/tags', '{"tagIds":[9]}'],
    ]);
  });

  it('assign: PATCH /leads/assign with only the ids that were given; an id that is not a long is a server error (nothing is sent)', async () => {
    const s = setup(() => ok);
    await s.ask('/board/lead-update', form('action=assign&leadId=5&saleGroupId=11&salePersonId=&employeeId=1003'));
    await s.ask('/board/lead-update', form('action=assign&leadId=5'));
    expect(only(s)).toEqual([
      ['PATCH', '/leads/assign', { leadId: 5, saleGroupId: 11, employeeId: 1003 }],
      ['PATCH', '/leads/assign', { leadId: 5 }],
    ]);
    const bad = await s.ask('/board/lead-update', form('action=assign&leadId=5&saleGroupId=11&employeeId=abc'));
    expect(bad).toEqual({ status: 500, text: '{"status":500,"message":"server error"}', type: JSON_TYPE });
    expect(s.calls).toHaveLength(2);
  });

  it('active-status and demand: PATCH with the text as it was posted (trimmed)', async () => {
    const s = setup(() => ok);
    await s.ask('/board/lead-update', form('action=active-status&leadId=5&activeStatus=WARM'));
    await s.ask('/board/lead-update', form('action=demand&leadId=5&demand=%20%22quoted%22%20%E0%B8%A3%E0%B8%B2%E0%B8%84%E0%B8%B2%20'));
    expect(s.calls.map((c) => [c.path, c.body])).toEqual([
      ['/leads/active-status', '{"leadId":5,"activeStatus":"WARM"}'],
      ['/leads/demand', '{"leadId":5,"demand":"\\"quoted\\" ราคา"}'],
    ]);
  });

  it('an unknown action is 400 {status, message: "unknown action: …"} (the text as posted, trimmed) and nothing is sent', async () => {
    const s = setup(() => ok);
    expect(await s.ask('/board/lead-update', form('action=%20nope%20&leadId=5'))).toEqual({ status: 400, text: '{"status":400,"message":"unknown action: nope"}', type: JSON_TYPE });
    expect((await s.ask('/board/lead-update', form('leadId=5'))).text).toBe('{"status":400,"message":"unknown action: "}');
    expect((await s.ask('/board/lead-update', { method: 'POST' })).status).toBe(400); // (a POST with no parameters at all: the same)
    expect(s.calls).toHaveLength(0);
  });

  it('the body of the service goes back whatever its status; nothing back is {}', async () => {
    const reject = '{"status":404,"message":"no lead"}';
    expect(await setup(() => ({ status: 404, text: reject })).ask('/board/lead-update', form('action=demand&leadId=5&demand=x'))).toMatchObject({ status: 200, text: reject });
    expect(await setup(() => ({ status: 204, text: '' })).ask('/board/lead-update', form('action=demand&leadId=5&demand=x'))).toMatchObject({ status: 200, text: '{}' });
    expect(await setup(() => null).ask('/board/lead-update', form('action=tags&leadId=5&tagIds=1'))).toMatchObject({ status: 200, text: '{}' });
  });

  it('only POST', async () => {
    const s = setup(() => ok);
    expect((await s.ask('/board/lead-update?action=demand&leadId=5')).status).toBe(405);
    expect(s.calls).toHaveLength(0);
  });
});

describe('POST|DELETE /board/lead-materials (LeadMaterialsServlet)', () => {
  it('POST /leads/materials with the body of the page; the answer of the service goes back whatever its status; nothing back is {}', async () => {
    const s = setup(() => ({ status: 201, text: '{"status":201,"success":true}' }));
    const r = await s.ask('/board/lead-materials', post(' {"leadId":5,\n"materialId":7} '));
    expect(r).toEqual({ status: 200, text: '{"status":201,"success":true}', type: JSON_TYPE });
    expect(s.calls.map((c) => [c.method, c.url, c.body, c.headers])).toEqual([['POST', `${SERVICE_API}/leads/materials`, '{"leadId":5,"materialId":7}', JSON_HEADERS]]);
    expect(await setup(() => ({ status: 400, text: '{"status":400}' })).ask('/board/lead-materials', post('{}'))).toMatchObject({ status: 200, text: '{"status":400}' });
    expect(await setup(() => ({ status: 200, text: '' })).ask('/board/lead-materials', post('{}'))).toMatchObject({ status: 200, text: '{}' });
    expect(await setup(() => null).ask('/board/lead-materials', post('{}'))).toMatchObject({ status: 200, text: '{}' });
    // an empty body is sent as it is (the servlet did not look at it)
    const e = setup(() => ({}));
    await e.ask('/board/lead-materials', { method: 'POST' });
    expect(e.calls[0].body).toBe('');
  });

  it('DELETE /leads/materials WITH a body; the answer (trimmed, also an error body) goes back with 200; no body is {}', async () => {
    const s = setup(() => ({ status: 200, text: ' {"status":200,"success":true}\n' }));
    const r = await s.ask('/board/lead-materials', { method: 'DELETE', body: '{"leadId":5,"detailOrderNo":3}' });
    expect(r).toEqual({ status: 200, text: '{"status":200,"success":true}', type: JSON_TYPE });
    expect(s.calls.map((c) => [c.method, c.url, c.body, c.headers])).toEqual([['DELETE', `${SERVICE_API}/leads/materials`, '{"leadId":5,"detailOrderNo":3}', JSON_HEADERS]]);
    expect(await setup(() => ({ status: 404, text: '{"status":404,"message":"gone"}' })).ask('/board/lead-materials', { method: 'DELETE', body: '{}' })).toMatchObject({ status: 200, text: '{"status":404,"message":"gone"}' });
    expect(await setup(() => ({ status: 204, text: '' })).ask('/board/lead-materials', { method: 'DELETE', body: '{}' })).toMatchObject({ status: 200, text: '{}' });
  });

  it('DELETE with no answer from the service is the 500 of the servlet\'s own connection (the body is {}); other methods are 405', async () => {
    expect(await setup(() => null).ask('/board/lead-materials', { method: 'DELETE', body: '{}' })).toEqual({ status: 500, text: '{}', type: JSON_TYPE });
    expect((await setup(() => ({})).ask('/board/lead-materials')).status).toBe(405);
    expect((await setup(() => ({})).ask('/board/lead-materials', { method: 'PUT' })).status).toBe(405);
  });
});

describe('routes of other servlets', () => {
  it('a path that is not one of the lead board servlets is not answered (null → the next module of the page answers)', async () => {
    const { deps } = fakeRest(() => ({}));
    expect(await opportunitiesRoutes(deps)('/board/tags', new URLSearchParams(), undefined)).toBeNull();
    expect(await opportunitiesRoutes(deps)('/board/lead', new URLSearchParams(), undefined)).toBeNull();
  });
});
