import { beforeEach, describe, expect, it } from 'vitest';
import { optionRows, prospectOptionRoutes, retryEmptyOptions } from './prospect-options.live';
import { composeRoutes } from './rest';
import { clearOptionCache } from './options-cache';
import { fakeRest, type FakeAnswer, type FakeCall } from './rest-fake';

const P1 = '0193a000-0000-7000-8000-0000000000a1';
const P2 = '0193a000-0000-7000-8000-0000000000a2';

function setup(answer: (c: FakeCall) => FakeAnswer) {
  const { deps, calls } = fakeRest(answer);
  const route = composeRoutes(prospectOptionRoutes(deps));
  return {
    calls,
    ask: async (url: string) => {
      const r = await route(url);
      return { status: r.status, json: JSON.parse(await r.text()) as unknown };
    },
  };
}

describe('GET /board/prospect-options (the selects of the filter popup)', () => {
  beforeEach(() => {
    sessionStorage.clear();
    clearOptionCache();
  });

  it('provinces: GET /prospects/options?sets=provinces → a bare array of { id, code, name }', async () => {
    const s = setup(() => ({ status: 200, result: { provinces: [{ id: P1, code: '50', name: 'เชียงใหม่' }, { id: P2, name: 'ลำพูน' }] } }));
    const r = await s.ask('/board/prospect-options?set=provinces');
    expect(s.calls.map((c) => [c.method, c.path])).toEqual([['GET', '/prospects/options?sets=provinces']]);
    expect(r).toEqual({ status: 200, json: [{ id: P1, name: 'เชียงใหม่', code: '50' }, { id: P2, name: 'ลำพูน' }] });
  });

  it('districts: needs the province (none → [] and no call); sends provinceId', async () => {
    const s = setup(() => ({ status: 200, result: { districts: [{ id: P2, code: '5001', name: 'เมือง' }] } }));
    expect((await s.ask('/board/prospect-options?set=districts')).json).toEqual([]);
    expect(s.calls).toHaveLength(0);
    const r = await s.ask(`/board/prospect-options?set=districts&provinceId=${P1}`);
    expect(s.calls[0].path).toBe(`/prospects/options?sets=districts&provinceId=${P1}`);
    expect(r.json).toEqual([{ id: P2, name: 'เมือง', code: '5001' }]);
  });

  it('responsibleFilter: the people of the Agent select ({ id, name }, the name may be null)', async () => {
    const s = setup(() => ({ status: 200, result: { responsibleFilter: [{ id: P1, name: 'สมศรี' }, { id: P2, name: null }] } }));
    const r = await s.ask('/board/prospect-options?set=responsibleFilter');
    expect(s.calls[0].path).toBe('/prospects/options?sets=responsibleFilter');
    expect(r.json).toEqual([{ id: P1, name: 'สมศรี' }, { id: P2, name: '' }]);
  });

  it('an unknown set is 400 and no call; a failing service is an error status, not an empty list', async () => {
    const s = setup(() => ({ status: 403, text: '{}' }));
    expect((await s.ask('/board/prospect-options?set=occupations')).status).toBe(400);
    expect(s.calls).toHaveLength(0);
    expect((await s.ask('/board/prospect-options?set=countries')).status).toBe(403);
    expect((await setup(() => null).ask('/board/prospect-options?set=countries')).status).toBe(502);
  });

  it('optionRows reads result.<set>[] or result[]; rows without an id or not objects are dropped', () => {
    expect(optionRows({ result: [{ id: P1, name: 'a' }, { name: 'no id' }, 5] }, 'provinces')).toEqual([{ id: P1, name: 'a' }]);
    expect(optionRows({ result: {} }, 'provinces')).toEqual([]);
    expect(optionRows('x', 'provinces')).toEqual([]);
  });

  it('marketingChannels (the source chips): /prospects/options?sets=marketingChannels, also under type=marketing-channels', async () => {
    const s = setup(() => ({ status: 200, result: { marketingChannels: [{ id: P1, code: 'FB', name: 'Facebook' }, { id: P2, name: 'Line' }] } }));
    const want = [{ id: P1, name: 'Facebook', code: 'FB' }, { id: P2, name: 'Line' }];
    expect((await s.ask('/board/prospect-options?set=marketingChannels')).json).toEqual(want);
    expect((await s.ask('/board/chat-master-data?type=marketing-channels')).json).toEqual(want);
    // both addresses share one kept list: one call
    expect(s.calls.map((c) => c.path)).toEqual(['/prospects/options?sets=marketingChannels']);
  });

  it('/board/employees (the owners of the create-OPP window) is /prospects/options?sets=responsibles, not master-data/employees', async () => {
    const s = setup(() => ({ status: 200, result: { responsibles: [{ id: P1, name: 'Somsri' }, { id: P2, code: 'E2', name: 'Somchai' }] } }));
    const r = await s.ask('/board/employees');
    expect(s.calls.map((c) => c.path)).toEqual(['/prospects/options?sets=responsibles']);
    expect(r.json).toEqual([{ id: P1, name: 'Somsri' }, { id: P2, name: 'Somchai', code: 'E2' }]);
    await s.ask('/board/employees');
    expect(s.calls).toHaveLength(1); // kept for the session
  });

  it('/board/sale-persons (the owner select of the panel, the create-OPP window) is /prospects/options?sets=salePersons, not master-data/sale-persons; a saleGroupId is not sent', async () => {
    const s = setup(() => ({ status: 200, result: { salePersons: [{ id: P1, code: 'S1', name: 'Somsri' }] } }));
    const r = await s.ask('/board/sale-persons?saleGroupId=5');
    expect(s.calls.map((c) => c.path)).toEqual(['/prospects/options?sets=salePersons']);
    expect(r.json).toEqual([{ id: P1, name: 'Somsri', code: 'S1' }]);
    await s.ask('/board/sale-persons');
    expect(s.calls).toHaveLength(1); // kept for the session
  });

  it('/board/movement-types (the products of the create-OPP window, master-data/movement-types/LD) is an empty list and no call', async () => {
    const s = setup(() => ({ status: 404, text: '' }));
    expect(await s.ask('/board/movement-types')).toEqual({ status: 200, json: [] });
    expect(s.calls).toHaveLength(0);
  });

  it('waitlists: /prospects/options?sets=waitlists as { id, name } (the name may be null), kept for the session', async () => {
    const s = setup(() => ({ status: 200, result: { waitlists: [{ id: P1, name: 'คิวทดสอบในเครื่อง' }, { id: P2, name: null }] } }));
    const r = await s.ask('/board/prospect-options?set=waitlists');
    expect(s.calls.map((c) => c.path)).toEqual(['/prospects/options?sets=waitlists']);
    expect(r.json).toEqual([{ id: P1, name: 'คิวทดสอบในเครื่อง' }, { id: P2, name: '' }]);
    await s.ask('/board/prospect-options?set=waitlists');
    expect(s.calls).toHaveLength(1);
  });

  it('several sets in ONE call (the create-OPP window): ?sets=salesLines,responsibles,waitlists,salePersons -> one GET to the service, { set: rows } back', async () => {
    const s = setup(() => ({
      status: 200,
      result: {
        salesLines: [{ id: P1, code: 'L1', name: 'สายงานขาย A' }],
        responsibles: [{ id: P2, name: 'สมศรี' }],
        waitlists: [{ id: 'w1', name: 'คิวทดสอบในเครื่อง' }],
        salePersons: [{ id: 's1', code: 'S1', name: 'พนักงานขาย' }],
      },
    }));
    const r = await s.ask('/board/prospect-options?sets=salesLines,responsibles,waitlists,salePersons');
    expect(s.calls.map((c) => c.path)).toEqual(['/prospects/options?sets=salesLines%2Cresponsibles%2Cwaitlists%2CsalePersons']);
    expect(r).toEqual({
      status: 200,
      json: {
        salesLines: [{ id: P1, name: 'สายงานขาย A', code: 'L1' }],
        responsibles: [{ id: P2, name: 'สมศรี' }],
        waitlists: [{ id: 'w1', name: 'คิวทดสอบในเครื่อง' }],
        salePersons: [{ id: 's1', name: 'พนักงานขาย', code: 'S1' }],
      },
    });
  });

  it('salesLineId: the people of one line — asked with the line, kept per line (another line is another call), the sale persons keep their employeeId', async () => {
    const s = setup((c) => ({
      status: 200,
      result: c.path.includes('salesLineId=L1')
        ? { responsibles: [{ id: P1, name: 'ของสายงาน 1' }] }
        : { responsibles: [{ id: P2, name: 'ของสายงาน 2' }], salePersons: [{ id: 's1', name: 'พนักงานขาย', employeeId: P2 }, { id: 's2', name: 'อีกคน', employee: { id: P1, name: 'x' } }] },
    }));
    const a = await s.ask('/board/prospect-options?sets=responsibles&salesLineId=L1');
    expect(s.calls.map((c) => c.path)).toEqual(['/prospects/options?sets=responsibles&salesLineId=L1']);
    expect(a.json).toEqual({ responsibles: [{ id: P1, name: 'ของสายงาน 1' }] });
    await s.ask('/board/prospect-options?sets=responsibles&salesLineId=L1');
    expect(s.calls).toHaveLength(1); // kept for that line
    const b = await s.ask('/board/prospect-options?sets=responsibles&salesLineId=L2');
    expect(s.calls).toHaveLength(2); // another line is another call
    expect(b.json).toEqual({ responsibles: [{ id: P2, name: 'ของสายงาน 2' }] });
    const c = await s.ask('/board/prospect-options?sets=salePersons');
    expect((c.json as { salePersons: Array<Record<string, unknown>> }).salePersons.map((x) => x['employeeId'])).toEqual([P2, P1]);
  });

  it('sets already kept are not asked again: the second opening makes no call; when only some are kept the others go together in one call', async () => {
    const s = setup((c) => {
      const sets = new URLSearchParams(c.path.split('?')[1]).get('sets')!.split(',');
      return { status: 200, result: Object.fromEntries(sets.map((x) => [x, [{ id: P1, name: x }]])) };
    });
    await s.ask('/board/prospect-options?set=waitlists'); // kept by the page on entering (a single set)
    expect(s.calls).toHaveLength(1);
    const r = await s.ask('/board/prospect-options?sets=salesLines,responsibles,waitlists,salePersons');
    // the waitlists are not asked again: the other three go in one call
    expect(s.calls.map((c) => c.path)).toEqual(['/prospects/options?sets=waitlists', '/prospects/options?sets=salesLines%2Cresponsibles%2CsalePersons']);
    expect(Object.keys(r.json as object).sort()).toEqual(['responsibles', 'salePersons', 'salesLines', 'waitlists']);
    await s.ask('/board/prospect-options?sets=salesLines,responsibles,waitlists,salePersons');
    expect(s.calls).toHaveLength(2);
  });

  it('several sets: an unknown name is a 400 and no call; a failing service is its status (0 → 502), not a list of empty sets', async () => {
    const s = setup(() => ({ status: 403, text: '{}' }));
    expect((await s.ask('/board/prospect-options?sets=salesLines,nope')).status).toBe(400);
    expect(s.calls).toHaveLength(0);
    expect((await s.ask('/board/prospect-options?sets=salesLines,responsibles')).status).toBe(403);
    expect((await setup(() => null).ask('/board/prospect-options?sets=salesLines')).status).toBe(502);
  });

  it('the step groups of the old model of an opportunity are an empty list and no call (no 404 when a line is chosen)', async () => {
    const s = setup(() => ({ status: 404, text: '' }));
    for (const url of ['/board/master/activity-groups?movementTypeId=sl-1', '/board/master/employees-by-activity-group?activityGroupId=g1']) {
      expect(await s.ask(url)).toEqual({ status: 200, json: { status: 200, result: [] } });
    }
    expect(s.calls).toHaveLength(0);
  });

  it('another type of chat-master-data is left to the next route', async () => {
    const { deps } = fakeRest(() => ({}));
    expect(await prospectOptionRoutes(deps)('/board/chat-master-data', new URLSearchParams('type=countries'), undefined)).toBeNull();
  });

  it('a list with rows is kept for the session: the second ask makes no call; the districts are kept per province', async () => {
    const s = setup((c) => ({ status: 200, result: { [c.path.includes('districts') ? 'districts' : 'provinces']: [{ id: P1, name: 'x' }] } }));
    await s.ask('/board/prospect-options?set=provinces');
    await s.ask('/board/prospect-options?set=provinces');
    await s.ask(`/board/prospect-options?set=districts&provinceId=${P1}`);
    await s.ask(`/board/prospect-options?set=districts&provinceId=${P1}`);
    await s.ask(`/board/prospect-options?set=districts&provinceId=${P2}`);
    expect(s.calls.map((c) => c.path)).toEqual(['/prospects/options?sets=provinces', `/prospects/options?sets=districts&provinceId=${P1}`, `/prospects/options?sets=districts&provinceId=${P2}`]);
  });

  it('the same list asked at once is ONE call (the callers share it); asked after it came, it is read from the session', async () => {
    const s = setup(() => ({ status: 200, result: { countries: [{ id: P1, name: 'x' }] } }));
    const all = await Promise.all([s.ask('/board/prospect-options?set=countries'), s.ask('/board/prospect-options?set=countries'), s.ask('/board/prospect-options?set=countries')]);
    expect(all.map((r) => r.status)).toEqual([200, 200, 200]);
    expect(s.calls).toHaveLength(1);
  });

  it('an empty answer is remembered in memory (never in the storage) and not asked again until retryEmptyOptions(); a list with rows is not touched by it', async () => {
    const s = setup((c) => (c.path.includes('countries') ? { status: 200, result: { countries: [] } } : { status: 200, result: { provinces: [{ id: P1, name: 'x' }] } }));
    await Promise.all([s.ask('/board/prospect-options?set=countries'), s.ask('/board/prospect-options?set=countries')]);
    await s.ask('/board/prospect-options?set=countries');
    await s.ask('/board/prospect-options?set=provinces');
    expect(s.calls.map((c) => c.path)).toEqual(['/prospects/options?sets=countries', '/prospects/options?sets=provinces']);
    expect(Object.keys(sessionStorage).filter((k) => k.startsWith('ts.options:')).every((k) => k.endsWith(':provinces'))).toBe(true);
    // a new visit of the page, or the opening of a window that needs the list: the empty ones are asked again, the others are read from the session
    retryEmptyOptions();
    await s.ask('/board/prospect-options?set=countries');
    await s.ask('/board/prospect-options?set=provinces');
    expect(s.calls.map((c) => c.path)).toEqual(['/prospects/options?sets=countries', '/prospects/options?sets=provinces', '/prospects/options?sets=countries']);
  });

  it('a failed answer is not remembered (the next ask goes to the service); a list with rows is kept; sign-out forgets the lists', async () => {
    let answer: FakeAnswer = { status: 500, text: '' };
    const s = setup(() => answer);
    await s.ask('/board/prospect-options?set=countries');
    await s.ask('/board/prospect-options?set=countries');
    expect(s.calls).toHaveLength(2);
    answer = { status: 200, result: { countries: [{ id: P1, name: 'x' }] } };
    await s.ask('/board/prospect-options?set=countries');
    await s.ask('/board/prospect-options?set=countries');
    expect(s.calls).toHaveLength(3);
    clearOptionCache();
    await s.ask('/board/prospect-options?set=countries');
    expect(s.calls).toHaveLength(4);
  });

  it('the list may be wrapped: result.<set>.items, result.items, or the only list in result', () => {
    const rows = [{ id: P1, name: 'a' }];
    expect(optionRows({ result: { countries: { items: rows, meta: {} } } }, 'countries')).toHaveLength(1);
    expect(optionRows({ result: { items: rows } }, 'countries')).toHaveLength(1);
    expect(optionRows({ result: { whatever: rows, total: 1 } }, 'countries')).toHaveLength(1);
    expect(optionRows({ result: { a: rows, b: rows } }, 'countries')).toHaveLength(0); // two lists: which one is not guessed
  });

  it('with the storage refusing, the list is still kept in memory for the page: the second ask makes no call', async () => {
    const real = Storage.prototype.setItem;
    Storage.prototype.setItem = () => {
      throw new Error('full');
    };
    try {
      const s = setup(() => ({ status: 200, result: { countries: [{ id: P1, name: 'x' }] } }));
      await s.ask('/board/prospect-options?set=countries');
      await s.ask('/board/prospect-options?set=countries');
      expect(s.calls).toHaveLength(1);
    } finally {
      Storage.prototype.setItem = real;
    }
  });

  it('other paths are not its business', async () => {
    const { deps } = fakeRest(() => ({}));
    expect(await prospectOptionRoutes(deps)('/board/fiscal-years', new URLSearchParams(), undefined)).toBeNull();
  });
});
