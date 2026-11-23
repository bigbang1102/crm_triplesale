import { beforeEach, describe, expect, it } from 'vitest';
import { clearOptionCache } from './options-cache';
import { boardOf, customerOf, dialCode, legacyDetail, phoneDigits, legacyItem, listOf, opportunityDetailV2Routes, opportunityV2Routes } from './opportunities-v2.live';
import { composeRoutes } from './rest';
import { fakeRest, type FakeAnswer, type FakeCall } from './rest-fake';

const LINES = [{ id: 'sl-1', code: 'A', name: 'สายงาน หนึ่ง' }, { id: 'sl-2', code: 'B', name: 'สายงาน สอง' }];

function setup(opportunities: FakeAnswer, opts: { roles?: string[] } = { roles: ['CRM_Lead_View'] }) {
  const { deps, calls } = fakeRest((c: FakeCall) => (c.path.startsWith('/prospects/options') ? { status: 200, result: { salesLines: LINES } } : opportunities), opts);
  const route = composeRoutes(opportunityV2Routes(deps));
  return { calls, get: async (url: string) => route(url, undefined) };
}

describe('GET /opportunities (the board) and the sales lines (the products)', () => {
  beforeEach(() => clearOptionCache());

  it('the products are the sales lines of options, as the envelope the page reads', async () => {
    const s = setup({ status: 200, result: [] });
    const r = await s.get('/board/master/movement-types?type=LD');
    expect(await r!.json()).toEqual({ status: 200, message: 'success', result: { items: [{ id: 'sl-1', code: 'A', name: 'สายงาน หนึ่ง' }, { id: 'sl-2', code: 'B', name: 'สายงาน สอง' }] } });
  });

  it('the first paint (no product chosen): opportunityConfigId is the first sales line; view BOARD; tab ALL', async () => {
    const s = setup({ status: 200, result: { items: [] } });
    await s.get('/board/leads?viewMode=board&page=1&perPage=20');
    const call = s.calls.find((c) => c.path.startsWith('/opportunities'))!;
    expect(call.method).toBe('GET');
    expect(call.path).toBe('/opportunities?opportunityConfigId=sl-1&view=BOARD&tab=ALL&closed=false');
  });

  it('the phone of a card: the digits of prospect.mainPhone with the dial code (and the country) of the prospect, for TsPhone to shape with the format of the countries of the session', () => {
    expect(legacyItem({ prospect: { mainPhone: '081-234 5678', phoneCountryCode: '+66', countryCode: 'THA' } })).toEqual(
      expect.objectContaining({ prospectTel: '0812345678', phone: '0812345678', phoneCountryCode: '+66', countryCode: 'THA' }),
    );
    // no dial code: the digits alone, nothing added; a code that came on the card itself is kept
    const bare = legacyItem({ prospect: { mainPhone: '0812345678' } }) as Record<string, unknown>;
    expect(bare['phoneCountryCode']).toBeUndefined();
    expect((legacyItem({ phoneCountryCode: '+1', prospect: { phoneCountryCode: '+66' } }) as Record<string, unknown>)['phoneCountryCode']).toBe('+1');
  });

  it('status is the one status: leadStatus and activeStatus both get it (an activeStatus that came is kept)', () => {
    expect(legacyItem({ status: 'HOT' })).toEqual(expect.objectContaining({ leadStatus: 'HOT', activeStatus: 'HOT' }));
    expect(legacyItem({ status: 'ACTIVE', activeStatus: 'WARM' })).toEqual(expect.objectContaining({ leadStatus: 'ACTIVE', activeStatus: 'WARM' }));
    expect((legacyItem({}) as Record<string, unknown>)['activeStatus']).toBeUndefined();
  });

  it('a column carries sumAmount (the total of the whole column) as a number, and a card amount sent as a text is a number', () => {
    const board = boardOf({ columns: [{ step: { id: 's1', name: 'ขั้น A1' }, count: 5, sumAmount: '150000.50', cards: [{ id: 'o1', amount: '100000.50' }, { id: 'o2', amount: '50000.00' }, { id: 'o3', amount: null }] }] }) as { kanban: Array<Record<string, any>> };
    expect(board.kanban[0]['sumAmount']).toBe(150000.5);
    expect(board.kanban[0]['items'].map((i: Record<string, unknown>) => i['amount'])).toEqual([100000.5, 50000, null]);
    const none = boardOf({ columns: [{ step: { id: 's2', name: 'B' }, count: 1, cards: [{ id: 'o4' }] }] }) as { kanban: Array<Record<string, any>> };
    expect('sumAmount' in none.kanban[0]).toBe(false);
  });

  it('closed is always sent: false by default; true only when the switch of closed opportunities is on (showClosed=true) — for the board and for the list', async () => {
    const off = setup({ status: 200, result: { items: [] } });
    await off.get('/board/leads?viewMode=board&showClosed=false');
    await off.get('/board/leads?viewMode=list');
    expect(off.calls.filter((c) => c.path.startsWith('/opportunities?')).map((c) => c.path)).toEqual([
      '/opportunities?opportunityConfigId=sl-1&view=BOARD&tab=ALL&closed=false',
      '/opportunities?opportunityConfigId=sl-1&tab=ALL&closed=false',
    ]);
    const on = setup({ status: 200, result: { items: [] } });
    await on.get('/board/leads?viewMode=board&showClosed=true');
    await on.get('/board/leads?viewMode=list&showClosed=true&page=2');
    expect(on.calls.filter((c) => c.path.startsWith('/opportunities?')).map((c) => c.path)).toEqual([
      '/opportunities?opportunityConfigId=sl-1&view=BOARD&tab=ALL&closed=true',
      '/opportunities?opportunityConfigId=sl-1&tab=ALL&closed=true&page=2',
    ]);
  });

  it('a product chosen (movementTypeId) is the opportunityConfigId', async () => {
    const s = setup({ status: 200, result: { items: [] } });
    await s.get('/board/leads?viewMode=board&movementTypeId=sl-2');
    expect(s.calls.find((c) => c.path.startsWith('/opportunities'))!.path).toBe('/opportunities?opportunityConfigId=sl-2&view=BOARD&tab=ALL&closed=false');
  });

  it('the cards are grouped by their step into the columns of the board (the summary goes through)', async () => {
    const s = setup({
      status: 200,
      result: { items: [{ id: 'o1', stepId: 's1', stepName: 'ขั้น 1' }, { id: 'o2', stage: { id: 's2', name: 'ขั้น 2' } }, { id: 'o3', stepId: 's1', stepName: 'ขั้น 1' }], summary: { total: 3 } },
    });
    const body = await (await s.get('/board/leads?viewMode=board'))!.json();
    expect(body.kanban.map((c: { stepId: string; items: unknown[] }) => [c.stepId, c.items.length])).toEqual([['s1', 2], ['s2', 1]]);
    expect(body.summary).toEqual({ total: 3 });
  });

  it('the next cards of a column: activityId (its step) and page, as two params; only that column comes back', async () => {
    const s = setup({
      status: 200,
      result: { columns: [{ step: { id: 's-1', name: 'A' }, count: 45, cards: [{ id: 'o21' }] }, { step: { id: 's-2', name: 'B' }, count: 0, cards: [] }] },
      meta: { page: 2, cardsPerColumn: 20 },
    } as FakeAnswer);
    const body = await (await s.get('/board/leads?viewMode=board&movementTypeId=sl-1&activityStepId=s-1&page=2&perPage=20'))!.json();
    expect(s.calls.find((c) => c.path.startsWith('/opportunities'))!.path).toBe('/opportunities?opportunityConfigId=sl-1&view=BOARD&tab=ALL&closed=false&activityId=s-1&page=2');
    expect(body.kanban).toHaveLength(1);
    expect(body.kanban[0]).toMatchObject({ stepId: 's-1', items: [{ id: 'o21' }], meta: { page: 2, perPage: 20, total: 45, totalPages: 3 } });
  });

  it('the tab list: GET /opportunities?opportunityConfigId=&tab=ALL (no view); the next page adds page; the rows and the paging go to leads.items / leads.meta', async () => {
    const s = setup({ status: 200, result: { items: [{ id: 'o1' }, { id: 'o2' }], total: 45 }, meta: { page: 1 } } as FakeAnswer);
    const body = await (await s.get('/board/leads?viewMode=list&page=1&perPage=20'))!.json();
    expect(s.calls.find((c) => c.path.startsWith('/opportunities'))!.path).toBe('/opportunities?opportunityConfigId=sl-1&tab=ALL&closed=false');
    expect(body).toEqual({ leads: { items: [{ id: 'o1' }, { id: 'o2' }], meta: { page: 1, perPage: 20, total: 45, totalPages: 3 } } });
    await s.get('/board/leads?viewMode=list&movementTypeId=sl-2&page=2&perPage=20');
    expect(s.calls.filter((c) => c.path.startsWith('/opportunities')).at(-1)!.path).toBe('/opportunities?opportunityConfigId=sl-2&tab=ALL&closed=false&page=2');
    expect(listOf([])).toEqual({ leads: { items: [], meta: { page: 1, perPage: 20, total: 0, totalPages: 1 } } });
  });

  it('a full page of 20 with no total (or hasMore) means a next page: the page asks for it when the last row scrolls into view', () => {
    const rows = Array.from({ length: 20 }, (_, i) => ({ id: i }));
    expect((listOf({ items: rows }, { page: 1 })['leads'] as { meta: { totalPages: number } }).meta.totalPages).toBe(2);
    expect((listOf({ items: rows.slice(0, 7) }, { page: 2 })['leads'] as { meta: { totalPages: number } }).meta.totalPages).toBe(2); // the last page: no more
    expect((listOf({ items: rows.slice(0, 5), hasMore: true }, { page: 1 })['leads'] as { meta: { totalPages: number } }).meta.totalPages).toBe(2);
    const col = (boardOf({ columns: [{ step: { id: 'a', name: 'A' }, count: 0, hasMore: true, cards: rows }] }, { page: 1, cardsPerColumn: 20 })['kanban'] as { meta: { totalPages: number } }[])[0];
    expect(col.meta.totalPages).toBe(2);
  });

  it('the board of DEV: result.columns[{ step: { id, name }, count, cards }] + meta; an empty column keeps its name', async () => {
    const answer = {
      status: 200,
      result: { columns: [{ step: { id: 's-2', name: 'ขั้น A2' }, count: 0, sumAmount: null, hasMore: false, cards: [] }, { step: { id: 's-1', name: 'ขั้น A1' }, count: 45, sumAmount: null, hasMore: true, cards: [{ id: 'o1' }] }] },
      meta: { page: 1, cardsPerColumn: 20, maskedFields: ['sumAmount', 'amount'] },
    };
    const s = setup(answer as FakeAnswer);
    const body = await (await s.get('/board/leads?viewMode=board'))!.json();
    expect(body.kanban).toEqual([
      expect.objectContaining({ stepId: 's-2', stepName: 'ขั้น A2', items: [], meta: { page: 1, perPage: 20, total: 0, totalPages: 1 } }),
      expect.objectContaining({ stepId: 's-1', stepName: 'ขั้น A1', items: [{ id: 'o1' }], meta: { page: 1, perPage: 20, total: 45, totalPages: 3 } }),
    ]);
  });

  it('columns that come ready (columns | stages | steps | kanban with items) keep their cards', () => {
    expect(boardOf({ stages: [{ id: 'a', name: 'A', items: [{ id: 1 }] }, { id: 'b', name: 'B', items: [] }] })).toEqual({
      kanban: [
        { id: 'a', name: 'A', items: [{ id: 1 }], stepId: 'a', stepName: 'A', meta: { page: 1, perPage: 20, total: 1, totalPages: 1 } },
        { id: 'b', name: 'B', items: [], stepId: 'b', stepName: 'B', meta: { page: 1, perPage: 20, total: 0, totalPages: 1 } },
      ],
    });
    expect(boardOf([])).toEqual({ kanban: [] });
  });

  it('the status of the service is passed on when it fails; no right to see the board: [] and the service is not asked', async () => {
    const failing = setup({ status: 403, text: '{"status":403}' });
    expect((await failing.get('/board/leads?viewMode=board'))!.status).toBe(403);
    const denied = setup({ status: 200, result: { items: [] } }, { roles: [] });
    expect(await (await denied.get('/board/leads?viewMode=board'))!.text()).toBe('[]');
    expect(denied.calls.some((c) => c.path.startsWith('/opportunities'))).toBe(false);
  });

  it('other addresses are not its business', async () => {
    expect((await setup({ status: 200, result: [] }).get('/board/tags'))!.status).toBe(404); // no list in the answer: nobody owns it here (the page composes the others)
    expect((await setup({ status: 200, result: [] }).get('/board/leads-x'))!.status).toBe(404);
  });

  it('filter-options: the four lists of the filter popup come from ONE call, shared by the four old addresses', async () => {
    const s = setup({
      status: 200,
      result: { tags: [{ id: 't1', name: 'VIP', colorCode: '#fff' }], saleGroups: { items: [{ id: 'g1', name: 'ทีม A' }] }, provinces: [{ id: 'p1', name: 'กรุงเทพ' }], responsibleFilter: [{ id: 'e1', name: 'สมหญิง' }] },
    });
    const bodies = await Promise.all(['/board/tags', '/board/sale-groups', '/board/provinces', '/board/employees'].map(async (u) => (await s.get(u))!.json()));
    expect(bodies).toEqual([[{ id: 't1', name: 'VIP', colorCode: '#fff' }], [{ id: 'g1', name: 'ทีม A' }], [{ id: 'p1', name: 'กรุงเทพ' }], [{ id: 'e1', name: 'สมหญิง' }]]);
    await s.get('/board/tags');
    expect(s.calls.filter((c) => c.path === '/opportunities/filter-options?sets=pipelines%2Ctags%2CsaleGroups%2CsalePersons%2CresponsibleFilter%2CfiscalYears')).toHaveLength(1);
  });

  it('filter-options: fiscalYears are asked with the other lists, kept in the session, and not asked again', async () => {
    const answer = { tags: [{ id: 't1', name: 'VIP' }], fiscalYears: [{ id: 'y1', name: '2026' }] };
    const first = setup({ status: 200, result: answer });
    await first.get('/board/tags');
    const asked = first.calls.filter((c) => c.path.startsWith('/opportunities/filter-options'));
    expect(asked).toHaveLength(1);
    expect(decodeURIComponent(asked[0].path)).toContain('fiscalYears');
    expect(JSON.parse(sessionStorage.getItem(Object.keys(sessionStorage).find((k) => k.endsWith(':fiscalYears')) ?? '') ?? 'null')).toEqual([{ id: 'y1', name: '2026' }]);
    const again = setup({ status: 200, result: answer });
    await again.get('/board/tags');
    const sets = again.calls.filter((c) => c.path.startsWith('/opportunities/filter-options')).map((c) => decodeURIComponent(c.path));
    expect(sets.every((p) => !p.includes('fiscalYears'))).toBe(true);
  });

  it('countries: asked of /prospects/options?sets=countries with the filter lists, kept in the session, not asked again', async () => {
    const make = () => {
      const { deps, calls } = fakeRest((c: FakeCall) =>
        c.path.startsWith('/prospects/options?sets=countries')
          ? { status: 200, result: [{ id: 'c1', name: 'Thailand', nameTh: 'ไทย' }] }
          : c.path.startsWith('/opportunities/filter-options')
            ? { status: 200, result: { tags: [{ id: 't1', name: 'VIP' }] } }
            : { status: 200, result: [] },
      );
      const route = composeRoutes(opportunityV2Routes(deps));
      return { calls, get: async (url: string) => route(url, undefined) };
    };
    const first = make();
    await first.get('/board/tags');
    expect(first.calls.filter((c) => c.path === '/prospects/options?sets=countries')).toHaveLength(1);
    expect(JSON.parse(sessionStorage.getItem(Object.keys(sessionStorage).find((k) => k.endsWith(':countries')) ?? '') ?? 'null')).toEqual([{ id: 'c1', name: 'Thailand', nameTh: 'ไทย' }]);
    const again = make();
    await again.get('/board/tags');
    expect(again.calls.some((c) => c.path.startsWith('/prospects/options?sets=countries'))).toBe(false);
  });

  it('every list of the filter popup is kept in the session (and the next visit does not ask for them)', async () => {
    const lists = { pipelines: [{ id: 'pl1' }], tags: [{ id: 't1' }], saleGroups: [{ id: 'g1' }], salePersons: [{ id: 'sp1' }], responsibleFilter: [{ id: 'e1' }], fiscalYears: [{ id: 'y1' }] };
    const make = () => {
      const { deps, calls } = fakeRest((c: FakeCall) =>
        c.path.startsWith('/prospects/options?sets=countries') ? { status: 200, result: [{ id: 'c1', name: 'Thailand' }] } : c.path.startsWith('/opportunities/filter-options') ? { status: 200, result: lists } : { status: 200, result: [] },
      );
      const route = composeRoutes(opportunityV2Routes(deps));
      return { calls, get: async (url: string) => route(url, undefined) };
    };
    await make().get('/board/tags');
    const kept = Object.keys(sessionStorage).map((k) => k.split(':').pop());
    expect(kept.sort()).toEqual(['countries', 'fiscalYears', 'pipelines', 'responsibleFilter', 'saleGroups', 'salePersons', 'tags']);
    const again = make();
    await again.get('/board/tags');
    expect(again.calls.filter((c) => c.path.startsWith('/opportunities/filter-options') || c.path.startsWith('/prospects/options'))).toHaveLength(0);
  });

  it('the phone of a card / row is its digits only ("-" and " " taken out); a masked phone is kept', () => {
    expect(phoneDigits('081-234 5678')).toBe('0812345678');
    expect(phoneDigits('+66 81-234-5678')).toBe('66812345678');
    expect(phoneDigits('****')).toBe('****');
    expect(phoneDigits(null)).toBe('');
    expect(legacyItem({ prospect: { mainPhone: '081-234 5678' } })).toEqual(expect.objectContaining({ prospectTel: '0812345678', phone: '0812345678' }));
    expect(legacyItem({ customerPhone: '081 234 5678' })).toEqual(expect.objectContaining({ prospectTel: '0812345678' }));
  });

  it('the detail: the phone of the customer (mainPhone, digits only) is given as prospect.customerTel with its dial code and country', () => {
    const d = legacyDetail({ header: { id: 'o-1', prospect: { id: 'p1', name: 'ก', mainPhone: '081-234 5678', phoneCountryCode: '+66', countryCode: 'THA' } }, steps: { groups: [] } }) as Record<string, any>;
    expect(d['prospect']).toMatchObject({ customerTel: '0812345678', phoneCountryCode: '+66', countryCode: 'THA' });
    const none = legacyDetail({ header: { id: 'o-1', prospect: { id: 'p1', name: 'ก' } }, steps: { groups: [] } }) as Record<string, any>;
    expect(none['prospect']['customerTel']).toBeUndefined();
  });

  it('the detail: the code of the customer is prospectInfo.customerCode; the address is the country only when it is not Thailand, else the province and the district', () => {
    const header = (prospect: Record<string, unknown>) => ({ header: { id: 'o-1', prospect: { id: 'p1', name: 'ก', code: 'C-001', ...prospect } }, steps: { groups: [] } });
    const thai = legacyDetail(header({ currentCountry: { id: 'c1', code: 'THA', name: 'ไทย' }, currentProvince: { id: 'v1', name: 'กรุงเทพมหานคร' }, currentDistrict: { id: 'd1', name: 'บางรัก' } })) as Record<string, any>;
    expect(thai['prospectInfo']).toMatchObject({ customerCode: 'C-001' });
    expect(thai['prospect']).toMatchObject({ currentCountryCode: 'THA', currentCountryName: 'ไทย', currentCityName: 'กรุงเทพมหานคร', currentDistrictName: 'บางรัก' });
    const abroad = legacyDetail(header({ currentCountry: { id: 'c2', code: 'JPN', name: 'ญี่ปุ่น' }, currentProvince: { name: 'โตเกียว' } })) as Record<string, any>;
    expect(abroad['prospect']).toMatchObject({ currentCountryCode: 'JPN', currentCountryName: 'ญี่ปุ่น' });
    expect(customerOf({ id: 'p', currentCityName: 'เดิม', currentProvince: { name: 'ใหม่' } })['currentCityName']).toBe('เดิม');
    const withInfo = legacyDetail({ header: { id: 'o-1', prospect: { id: 'p1', code: 'C-9' } }, prospectInfo: { fullName: 'x' }, steps: { groups: [] } }) as Record<string, any>;
    expect(withInfo['prospectInfo']).toMatchObject({ fullName: 'x', customerCode: 'C-9' });
  });

  it('a dial code is always with its "+" (66 → +66); a masked or empty one is kept; the customer of the detail carries it so', () => {
    expect([dialCode('66'), dialCode('+66'), dialCode(' 1 '), dialCode('****'), dialCode(null)]).toEqual(['+66', '+66', '+1', '****', '']);
    expect(customerOf({ id: 'p', phoneCountryCode: '66' })['phoneCountryCode']).toBe('+66');
  });

  it('filter-options: a failed call is not kept (asked again next time) and a list that is not in the answer falls through (null)', async () => {
    const s = setup({ status: 500, text: '{}' });
    expect((await s.get('/board/provinces'))!.status).toBe(404);
    await s.get('/board/provinces');
    expect(s.calls.filter((c) => c.path === '/opportunities/filter-options?sets=pipelines%2Ctags%2CsaleGroups%2CsalePersons%2CresponsibleFilter%2CfiscalYears')).toHaveLength(2);
    const partial = setup({ status: 200, result: { tags: [] } });
    expect((await partial.get('/board/employees'))!.status).toBe(404);
  });

  it('the fields of the new service are given the names the page reads (txno → txNo, prospect.name → prospectName …); a field already named for the page is kept', async () => {
    const item = {
      id: 'o1', txno: 'OPP-001', txdate: '2026-11-16', status: 'HOT', currentActivity: { id: 'a1', name: 'นัดพบ' },
      salePerson: 'สมชาย', saleGroup: { id: 'g1', name: 'ทีม A' }, responsibleEmployee: { id: 'e1', code: 'E01', name: 'สมหญิง' },
      prospect: { id: 'p1', code: 'P01', name: 'บริษัท ก' },
    };
    const s = setup({ status: 200, result: { items: [item] }, meta: { total: 1 } } as FakeAnswer);
    const row = (await (await s.get('/board/leads?viewMode=list'))!.json()).leads.items[0];
    expect(row).toEqual(expect.objectContaining({
      id: 'o1', txNo: 'OPP-001', lastUpdatedAt: '2026-11-16', leadStatus: 'HOT', stepName: 'นัดพบ', salePersonName: 'สมชาย', saleGroupName: 'ทีม A',
      employeeName: 'สมหญิง', employeeCode: 'E01', employeeId: 'e1', prospectName: 'บริษัท ก', prospectCode: 'P01',
    }));
    expect(row.txno).toBe('OPP-001');
    expect(legacyItem({ id: 'x', txno: 'A', txNo: 'B' })).toEqual({ id: 'x', txno: 'A', txNo: 'B' });
  });
});

describe('GET /opportunities/{opportunityId} (the detail page: /board/lead)', () => {
  const route = (answer: FakeAnswer, roles: string[] = ['CRM_Lead_View']) => {
    const { deps, calls } = fakeRest(() => answer, { roles });
    const r = composeRoutes(opportunityDetailV2Routes(deps));
    return { calls, get: (url: string) => r(url, undefined) };
  };

  it('asks the service for the opportunity by id (activityGroupId as a param) and gives the page the names it reads', async () => {
    const s = route({ status: 200, result: { id: 'u-1', txno: 'OPP-1', responsibleEmployee: { id: 'e1', name: 'สมหญิง' }, tags: [{ id: 't1' }], prospect: { name: 'บริษัท ก' } } });
    const r = await s.get('/board/lead?id=u-1&activityGroupId=7');
    expect(s.calls[0].path).toBe('/opportunities/u-1?activityGroupId=7');
    expect(await r!.json()).toEqual(expect.objectContaining({ id: 'u-1', txNo: 'OPP-1', employee: { id: 'e1', name: 'สมหญิง' }, employeeName: 'สมหญิง', tagList: [{ id: 't1' }], prospectName: 'บริษัท ก' }));
  });

  it('no activityGroupId: no param; no right: 403 and no call; no id: 502', async () => {
    const s = route({ status: 200, result: { id: 'u-1' } });
    await s.get('/board/lead?id=u-1');
    expect(s.calls[0].path).toBe('/opportunities/u-1');
    const denied = route({ status: 200, result: {} }, []);
    expect((await denied.get('/board/lead?id=u-1'))!.status).toBe(403);
    expect(denied.calls).toHaveLength(0);
    expect((await s.get('/board/lead'))!.status).toBe(502);
  });

  it('an error of the service is the body the page reads (error.message = the first detail)', async () => {
    const s = route({ status: 400, text: JSON.stringify({ status: 400, message: 'BAD_REQUEST', error: { code: 'BAD_REQUEST', description: 'The request is invalid', details: [{ field: 'opportunityId', message: 'Invalid data type.' }] } }) });
    const r = await s.get('/board/lead?id=x');
    expect(r!.status).toBe(400);
    expect((await r!.json()).error.message).toBe('Invalid data type.');
  });

  it('legacyDetail keeps what the page already has; other methods and addresses are not its business', async () => {
    expect(legacyDetail({ employee: { id: 1 }, responsibleEmployee: { id: 2 } })).toEqual(expect.objectContaining({ employee: { id: 1 } }));
    const { deps } = fakeRest(() => ({ status: 200, result: {} }));
    expect(await opportunityDetailV2Routes(deps)('/board/lead', new URLSearchParams('id=1'), { method: 'POST' })).toBeNull();
    expect(await opportunityDetailV2Routes(deps)('/board/leads', new URLSearchParams(), undefined)).toBeNull();
  });
});

describe('legacyItem: the last activity and the phone', () => {
  it('lastActivityAt is the date of the card (before txdate); customerPhone is the phone; names already there are kept', () => {
    expect(legacyItem({ txdate: '2026-11-01', lastActivityAt: '2026-11-16T09:30:00', customerPhone: '0812345678' })).toEqual(
      expect.objectContaining({ lastUpdatedAt: '2026-11-16 09:30:00', prospectTel: '0812345678', phone: '0812345678' }),
    );
    expect(legacyItem({ txdate: '2026-11-01' })).toEqual(expect.objectContaining({ lastUpdatedAt: '2026-11-01' }));
    expect(legacyItem({ lastActivityAt: 'x', lastUpdatedAt: 'kept', customerPhone: '1', prospectTel: '2' })).toEqual(expect.objectContaining({ lastUpdatedAt: 'kept', prospectTel: '2' }));
  });
});

describe('legacyDetail: the real answer of GET /opportunities/{id} (DEV, 17/11)', () => {
  const g = (n: number, name: string) => ({ id: `g${n}`, name });
  const REAL = {
    header: {
      id: 'o-1', txno: 'FCS-2611-003', txdate: '2026-11-04', status: 'HOT', targetMonth: 11, targetYear: { id: 'y1', name: null }, demand: null, amount: null,
      prospect: { id: 'p1', name: '****' }, saleGroup: null, salePerson: null, responsibleEmployee: { id: 'e1', name: 'ทดสอบ สอง' },
      currentActivityGroup: g(1, 'A'), currentActivity: { id: 'a2', name: 'A2' }, people: [],
    },
    maskedFields: ['amount'],
    steps: {
      current: { activityGroup: g(1, 'A'), activity: { id: 'a2', name: 'A2' } },
      groups: [{ activityGroup: g(1, 'A'), orderNo: 1, steps: [] }, { activityGroup: g(2, 'B'), orderNo: 2, steps: [] }],
      history: [{ id: 'h1', orderNo: 1 }],
    },
  };

  it('the header goes flat with the names the page reads; the current step, the groups and the status', () => {
    const d = legacyDetail(REAL) as Record<string, unknown>;
    expect(d).toEqual(expect.objectContaining({
      id: 'o-1', txNo: 'FCS-2611-003', leadStatus: 'HOT', targetMonth: 11, targetYear: '', employee: { id: 'e1', name: 'ทดสอบ สอง' }, employeeName: 'ทดสอบ สอง',
      prospect: { id: 'p1', name: '****' }, prospectName: '****', prospectInfo: { fullName: '****', firstContactDate: '2026-11-04' }, maskedFields: ['amount'], usesWorkflowStep: false, // USES_WORKFLOW_STEP is off for now: the groups still come as activeSteps, the step bar is not drawn
      currentStep: { procedureGroupId: 'g1', procedureGroupName: 'A', procedureId: 'a2', procedureName: 'A2', assigneeId: 'e1', assigneeName: 'ทดสอบ สอง', canReturn: false },
      activeSteps: [{ procedureGroupId: 'g1', procedureGroupName: 'A' }, { procedureGroupId: 'g2', procedureGroupName: 'B' }],
      stepHistory: [{ id: 'h1', orderNo: 1 }],
    }));
    expect('header' in d).toBe(false);
    expect(d['accessors']).toBeUndefined(); // people is empty
  });

  it('a year with a name is the year; the demand and the people are given the names the page reads', () => {
    const d = legacyDetail({ header: { ...REAL.header, targetYear: { id: 'y', yearValue: '2026' }, demand: 'ต้องการบ้าน', people: [{ id: 'x' }] }, steps: { groups: [] } }) as Record<string, unknown>;
    expect(d).toEqual(expect.objectContaining({ targetYear: '2026', leadDemand: 'ต้องการบ้าน', accessors: [{ id: 'x' }], usesWorkflowStep: false, activeSteps: [] }));
  });
});
