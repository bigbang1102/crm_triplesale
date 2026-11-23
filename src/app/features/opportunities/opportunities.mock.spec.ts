import { beforeEach, describe, expect, it } from 'vitest';
import { SEED_LEAD_COUNT } from '@core/mock/crm-seed';
import { resetSharedDb, upsertSharedLead } from '@core/mock/shared-db';
import { OpportunitiesBackend } from './opportunities-backend';
import { MOCK_PRODUCTS, MOCK_TAGS, MockLeadsOptions, createMockLeads, resetMockLeads } from './opportunities.mock';

/** the answer of one request as the page script reads it */
const get = async <T = any>(b: OpportunitiesBackend, path: string): Promise<T> => (await b.fetch(path)).json();
const post = (b: OpportunitiesBackend, path: string, body: unknown) =>
  b.fetch(path, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: typeof body === 'string' ? body : JSON.stringify(body) });
const board = (extra = '') => `../board/leads?viewMode=board&showClosed=false&sortBy=txdate_desc&page=1&perPage=20${extra}`;
const list = (extra = '') => `../board/leads?viewMode=list&activityGroupId=0&showClosed=false&sortBy=txdate_desc&page=1&perPage=20${extra}`;
const ALL = (o: Partial<MockLeadsOptions> = {}) => createMockLeads({ delayMs: 0, ...o });

describe('Opportunities mock backend (the fake of LeadBoardView + the /board/* servlets of lead.xhtml)', () => {
  let b: OpportunitiesBackend;
  beforeEach(() => {
    resetMockLeads();
    b = ALL();
  });

  describe('products (GET /board/master/movement-types?type=LD)', () => {
    it('is the raw envelope of the master-data service: { status, result: { items: [{ id, code, name }] } }', async () => {
      const r = await get(b, '../board/master/movement-types?type=LD');
      expect(r.status).toBe(200);
      expect(r.result.items.map((p: { code: string }) => p.code)).toEqual(MOCK_PRODUCTS.map((p) => p.code));
      for (const p of r.result.items) expect(Object.keys(p).sort()).toEqual(['code', 'id', 'name']);
    });

    it('answers no product when the switch says so (the page then hides its product / group dropdowns)', async () => {
      const r = await get(ALL({ config: { noProducts: true } }), '../board/master/movement-types?type=LD');
      expect(r.result.items).toEqual([]);
    });
  });

  describe('the board (GET /board/leads?viewMode=board)', () => {
    it('answers the result of /leads: product, group, summary, workflow groups and the columns of the default group', async () => {
      const r = await get(b, board());
      expect(r.id).toBe(MOCK_PRODUCTS[0].id);
      expect(r.usesWorkflowStep).toBe(true);
      expect(r.activityGroupId).toBe(101);
      expect(r.wfStepSummary.map((g: { id: number }) => g.id)).toEqual([101, 102, 103, 104, 105]);
      expect(r.kanban.map((c: { stepName: string }) => c.stepName)).toEqual(['รับลีดใหม่', 'โทรติดต่อลูกค้า', 'นัดหมายพบลูกค้า', 'ส่งต่อทีมวิเคราะห์']);
      for (const c of r.kanban) {
        expect(c.meta).toEqual({ page: 1, perPage: 20, total: c.items.length, totalPages: 1 });
        expect(typeof c.stepId).toBe('number');
      }
    });

    it('the summary is the numbers of the group on show: total = new + success + lost + inactive + active', async () => {
      const s = (await get(b, board())).statusSummary;
      expect(s.total).toBe(s.new + s.success + s.lost + s.inactive + s.active.total);
      expect(s.active.total).toBe(s.active.hot + s.active.warm + s.active.cold);
    });

    it('open leads only by default; showClosed=true shows the closed ones (SUCCESS · LOST) and nothing else', async () => {
      const open = await get(b, board());
      const closed = await get(b, board('&showClosed=true').replace('showClosed=false&', ''));
      const badges = (r: any) => r.kanban.flatMap((c: any) => c.items.map((i: any) => (i.leadStatus === 'ACTIVE' ? i.activeStatus : i.leadStatus)));
      expect(badges(open).every((x: string) => ['NEW', 'INACTIVE', 'HOT', 'WARM', 'COLD'].includes(x))).toBe(true);
      expect(badges(closed).length).toBeGreaterThan(0);
      expect(badges(closed).every((x: string) => x === 'SUCCESS' || x === 'LOST')).toBe(true);
    });

    it('a workflow group asks for its own columns; an unknown group falls back to the first', async () => {
      const an = await get(b, board('&activityGroupId=102'));
      expect(an.activityGroupId).toBe(102);
      expect(an.kanban.map((c: any) => c.stepName)).toEqual(['ตรวจสอบเอกสาร', 'วิเคราะห์ความเสี่ยง', 'สรุปผลวิเคราะห์']);
      expect((await get(b, board('&activityGroupId=999'))).activityGroupId).toBe(101);
    });

    it('a product without workflow has one pipeline and no group', async () => {
      const r = await get(b, board('&movementTypeId=33'));
      expect(r.usesWorkflowStep).toBe(false);
      expect(r.activityGroupId).toBeNull();
      expect(r.wfStepSummary).toEqual([]);
      expect(r.kanban.map((c: any) => c.stepName)).toEqual(['ลีดใหม่', 'ติดตามลูกค้า', 'เสนอราคา']);
    });

    it('pages each column on its own: page 1 holds perPage items, activityStepId + page asks for ONE column', async () => {
      const first = await get(b, board('&movementTypeId=33'));
      const col = first.kanban[0];
      expect(col.items).toHaveLength(20);
      expect(col.meta.total).toBeGreaterThan(20);
      expect(col.meta.totalPages).toBe(Math.ceil(col.meta.total / 20));
      const next = await get(b, board(`&movementTypeId=33&activityStepId=${col.stepId}`).replace('page=1', 'page=2'));
      expect(next.kanban).toHaveLength(1);
      expect(next.kanban[0].stepId).toBe(col.stepId);
      expect(next.kanban[0].meta.page).toBe(2);
      expect(next.kanban[0].items).toHaveLength(col.meta.total - 20);
      // no card twice
      const ids = [...col.items, ...next.kanban[0].items].map((i: any) => i.id);
      expect(new Set(ids).size).toBe(ids.length);
    });

    it('the server may cap the page size whatever perPage asks (config.maxPerPage)', async () => {
      const r = await get(ALL({ config: { maxPerPage: 3 } }), board('&movementTypeId=33'));
      expect(r.kanban[0].items).toHaveLength(3);
      expect(r.kanban[0].meta.perPage).toBe(3);
    });

    it('the item has every field the page reads: customer, amount, owner, team, place, tags, accessors …', async () => {
      const it = (await get(b, board())).kanban[0].items[0];
      for (const k of ['id', 'txNo', 'prospectCode', 'prospectName', 'prospectTel', 'amount', 'leadStatus', 'activeStatus', 'forwardStatus', 'activityGroupId', 'saleGroupName', 'salePersonName', 'employeeId', 'employeeName', 'lastUpdatedAt', 'leadDemand', 'tags', 'accessors', 'currentCityName', 'currentDistrictName']) {
        expect(it, k).toHaveProperty(k);
      }
      expect(it.lastUpdatedAt).toMatch(/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/);
      expect(it.forwardStatus).toContain(' - ');
    });

    it('is the cast of the other pages: lead n is seedLead(n) — same customer, same owner', async () => {
      const all = (await get(b, list())).leads.items as any[];
      expect(all.length).toBeGreaterThan(0);
      for (const i of all.slice(0, 5)) {
        expect(i.id).toBeGreaterThanOrEqual(1);
        expect(i.id).toBeLessThanOrEqual(SEED_LEAD_COUNT);
        if (i.unassigned) continue; // in the queue: no owner until somebody takes it (the next test)
        expect(i.employeeCode).toMatch(/^E10\d$/);
        expect(i.employeeId).toBe(1000 + Number(i.employeeCode.slice(2)));
      }
    });

    it('shows an opportunity in the queue without an owner (design 6.5), and refuses to move it or a closed one (409)', async () => {
      const queued = (await get(b, list())).leads.items.find((i: any) => i.unassigned) as any;
      expect(queued, 'the seed has opportunities in the queue').toBeDefined();
      expect(queued.employeeCode).toBe('');
      expect(queued.employeeName).toBe('');
      const move = await b.fetch('board/contact-activities', { method: 'POST', body: JSON.stringify({ leadId: queued.id, channel: 'line', content: 'x' }) });
      expect(move.status).toBe(409);
    });
  });

  describe('the list (GET /board/leads?viewMode=list)', () => {
    it('answers leads: { items, meta } for every group of the product, 20 a page', async () => {
      const r = await get(b, list());
      expect(r.leads.items).toHaveLength(20);
      expect(r.leads.meta.perPage).toBe(20);
      expect(r.leads.meta.totalPages).toBe(Math.ceil(r.leads.meta.total / 20));
      expect(r.kanban).toBeUndefined();
      const groups = new Set(r.leads.items.map((i: any) => i.activityGroupId));
      expect(groups.size).toBeGreaterThan(1);
    });

    it('activityGroupId / activityStepId narrow it; the second page continues the first', async () => {
      const group = await get(b, list().replace('activityGroupId=0', 'activityGroupId=102'));
      expect(group.leads.items.every((i: any) => i.activityGroupId === 102)).toBe(true);
      const step = await get(b, list().replace('activityGroupId=0', 'activityGroupId=102') + '&activityStepId=1022');
      expect(step.leads.items.every((i: any) => i.forwardStatus.endsWith(' - วิเคราะห์ความเสี่ยง'))).toBe(true);
      const p1 = await get(b, list());
      const p2 = await get(b, list().replace('page=1', 'page=2'));
      const ids = [...p1.leads.items, ...p2.leads.items].map((i: any) => i.id);
      expect(new Set(ids).size).toBe(40);
    });

    it('sorts: date desc / asc, number asc / desc, status', async () => {
      const ids = async (s: string) => (await get(b, list().replace('sortBy=txdate_desc', `sortBy=${s}`))).leads.items.map((i: any) => i.id);
      const asc = await ids('id_asc');
      expect([...asc].sort((x, y) => x - y)).toEqual(asc);
      const desc = await ids('id_desc');
      expect([...desc].sort((x, y) => y - x)).toEqual(desc);
      const byDate = (await get(b, list().replace('sortBy=txdate_desc', 'sortBy=txdate_asc'))).leads.items.map((i: any) => i.txDate);
      expect([...byDate].sort()).toEqual(byDate);
      const status = (await get(b, list().replace('sortBy=txdate_desc', 'sortBy=status'))).leads.items.map((i: any) => (i.leadStatus === 'ACTIVE' ? i.activeStatus : i.leadStatus));
      const rank = ['NEW', 'HOT', 'WARM', 'COLD', 'INACTIVE', 'SUCCESS', 'LOST'];
      expect(status.map((s: string) => rank.indexOf(s))).toEqual([...status.map((s: string) => rank.indexOf(s))].sort((x: number, y: number) => x - y));
    });
  });

  describe('an opportunity opened from the Prospects page', () => {
    beforeEach(() => resetSharedDb());

    it('should be listed under the person it was given to (some product of the board holds it)', async () => {
      upsertSharedLead(300_201, { prospectId: 5, status: 'ACTIVE', interest: 'NEW', groupIdx: 0, createdDate: '2026-10-20', ownerCode: 'E103' }, true);
      const found: any[] = [];
      for (const product of MOCK_PRODUCTS) {
        const r = await get(ALL(), list(`&movementTypeId=${product.id}&perPage=100`));
        found.push(...(r.leads?.items ?? []).filter((i: any) => i.id === 300_201));
      }
      expect(found).toHaveLength(1);
      expect(found[0]).toMatchObject({ employeeCode: 'E103' });
    });
  });

  describe('filters of the dialog and the search box', () => {
    const total = async (extra: string, base = list()) => (await get(b, base + extra)).leads.meta.total as number;

    it('search matches the name, the code, the tx number, the phone or the owner', async () => {
      const all = await total('');
      const one = (await get(b, list())).leads.items[0];
      const hit = await get(b, list(`&search=${encodeURIComponent(one.prospectName.split(' ')[0])}`));
      expect(hit.leads.meta.total).toBeGreaterThan(0);
      expect(hit.leads.meta.total).toBeLessThan(all);
      expect(await total('&search=zzzz')).toBe(0);
      expect(await total(`&search=${one.txNo}`)).toBe(1);
    });

    it('owner, sale group, province, district, status, tags and the date range each narrow the set', async () => {
      const all = await total('');
      expect(await total('&employeeId=1003')).toBeLessThan(all);
      expect(await total('&saleGroupId=12')).toBeLessThan(all);
      expect(await total('&provinceId=1')).toBeLessThan(all);
      expect(await total('&provinceId=1&districtId=102')).toBeLessThan(await total('&provinceId=1'));
      expect(await total('&activeStatus=HOT')).toBeLessThan(all);
      expect(await total('&tagIds=1,2')).toBeLessThan(all);
      expect(await total('&dateRangeType=custom&dateFrom=2026-03-01&dateTo=2026-08-31')).toBeLessThan(all);
      // a range with one end only is ignored (the page does not send it either)
      expect(await total('&dateFrom=2026-03-01')).toBe(all);
    });

    it('a filter that matches nothing gives empty columns (the columns stay), not an error', async () => {
      const r = await get(b, board('&employeeId=1008&provinceId=4&activeStatus=COLD'));
      expect(r.kanban.length).toBeGreaterThan(0);
      expect(r.kanban.every((c: any) => c.items.length === 0 && c.meta.total === 0 && c.meta.totalPages === 1)).toBe(true);
    });
  });

  describe('master data of the filter dialog', () => {
    it('tags carry colours (one without, one the lead item does not repeat), as plain arrays with the normalised fields', async () => {
      const tags = await get(b, '../board/tags');
      expect(tags).toHaveLength(MOCK_TAGS.length);
      for (const t of tags) expect(Object.keys(t).sort()).toEqual(['attachFile', 'code', 'colorCode', 'id', 'name', 'nameTh', 'postCode']);
      expect(tags.some((t: any) => t.colorCode === '')).toBe(true);
      // a pill colour that only the master has: the lead items of that tag come without colorCode
      const items = (await get(b, list())).leads.items.flatMap((i: any) => i.tags);
      expect(items.some((t: any) => t.id === 5 && !('colorCode' in t))).toBe(true);
    });

    it('sale groups, provinces, employees (ids 1001…), districts of a province', async () => {
      expect((await get(b, '../board/sale-groups')).map((g: any) => g.name)).toEqual(['ทีม A', 'ทีม B']);
      expect((await get(b, '../board/provinces')).map((p: any) => p.name)[0]).toBe('กรุงเทพมหานคร');
      expect((await get(b, '../board/employees')).map((e: any) => e.id)).toEqual([1001, 1002, 1003, 1004, 1005, 1006, 1007, 1008]);
      expect((await get(b, '../board/districts?provinceId=1')).map((d: any) => d.name)).toEqual(['พระนคร', 'บางรัก', 'จตุจักร']);
      expect(await get(b, '../board/districts?provinceId=99')).toEqual([]);
    });

    it('place names follow the UI language (the servlet translates them): English → Bangkok / Phra Nakhon …', async () => {
      const en = ALL({ lang: () => 'en' });
      const places = (await get(en, list())).leads.items.map((i: any) => i.currentCityName);
      expect(places).toContain('Bangkok');
      expect(places).not.toContain('กรุงเทพมหานคร');
      const th = (await get(b, list())).leads.items.map((i: any) => i.currentCityName);
      expect(th).toContain('กรุงเทพมหานคร');
    });

    it('a customer abroad shows the country and the dial code of that country', async () => {
      const all = (await get(b, '../board/leads?viewMode=list&activityGroupId=0&showClosed=false&sortBy=id_asc&page=1&perPage=200')).leads.items as any[];
      const jp = all.find((i) => i.currentCountryName === 'ญี่ปุ่น');
      expect(jp.phoneCountryCode).toBe('+81');
      expect(jp.countryCode).toBe('JPN');
    });
  });

  describe('permission and failure switches', () => {
    it('without CRM_Lead_View the servlet answers "[]" and never calls the backend', async () => {
      const r = await get(ALL({ can: (f) => f !== 'CRM_Lead_View' }), board());
      expect(r).toEqual([]);
    });

    it('English place names are the ones of the dictionary (MasterDataI18n): "… District" for the Bangkok codes, the Thai name where it has none', async () => {
      const all = (await get(ALL({ lang: () => 'en' }), '../board/leads?viewMode=list&activityGroupId=0&showClosed=false&sortBy=id_asc&page=1&perPage=200')).leads.items as any[];
      const seen = new Map<string, string>(all.filter((i) => i.currentDistrictCode).map((i) => [i.currentDistrictCode, i.currentDistrictName]));
      expect(seen.get('BKK_01')).toBe('Phra Nakhon District');
      expect(seen.get('BKK_04')).toBe('Bang Rak District');
      expect(seen.get('BKK_30')).toBe('Chatuchak District');
      expect(seen.get('CMI-MU')).toBe('เมืองเชียงใหม่'); // no dictionary entry: the servlet kept the Thai name
    });

    it('delayLeadsOnly holds back only /board/leads (the master lists answer at once)', async () => {
      const slow = ALL({ config: { delayMs: 120, delayLeadsOnly: true } });
      const took = async (path: string): Promise<number> => {
        const t = Date.now();
        await slow.fetch(path);
        return Date.now() - t;
      };
      expect(await took('../board/tags')).toBeLessThan(60);
      expect(await took('../board/master/movement-types?type=LD')).toBeLessThan(60);
      expect(await took(board())).toBeGreaterThanOrEqual(100);
      const all = ALL({ config: { delayMs: 120 } }); // (without the switch everything waits)
      const t = Date.now();
      await all.fetch('../board/tags');
      expect(Date.now() - t).toBeGreaterThanOrEqual(100);
    });

    it('blankLeads answers [] with 200 — what the servlet gave when the service failed (failLeads is a 500 of the servlet itself)', async () => {
      const r = await ALL({ config: { blankLeads: true } }).fetch(board());
      expect(r.status).toBe(200);
      expect(await r.json()).toEqual([]);
    });

    it('failLeads answers 500; emptyBoard answers a result without any column', async () => {
      expect((await ALL({ config: { failLeads: true } }).fetch(board())).status).toBe(500);
      const r = await get(ALL({ config: { emptyBoard: true } }), board());
      expect(r.kanban).toEqual([]);
      expect(r.statusSummary.total).toBeGreaterThan(0);
    });

    it('the switches can also come from sessionStorage (how the comparison harness hands them to the page)', async () => {
      sessionStorage.setItem('ts.mock.leads.config', JSON.stringify({ noProducts: true }));
      expect((await get(createMockLeads({ delayMs: 0 }), '../board/master/movement-types?type=LD')).result.items).toEqual([]);
    });

    it('an unknown request is a 501 that says what is missing', async () => {
      const r = await b.fetch('../board/nothing');
      expect(r.status).toBe(501);
      expect((await r.json()).message).toContain('GET /board/nothing');
    });
  });

  describe('the filter state the session keeps (POST / GET /board/filter-state, savedFilterJson)', () => {
    it('nothing saved: initial() is null and GET answers the text "null"', async () => {
      expect((await b.initial()).savedFilterJson).toBeNull();
      expect(await (await b.fetch('../board/filter-state')).text()).toBe('null');
    });

    it('POST stores the JSON (204); the next load gets it back, also from a new instance (the tab keeps it)', async () => {
      const state = { mid: '33', product: 'x', tab: 'list', sort: 'id_asc', tagIds: ['1'] };
      const r = await post(b, '../board/filter-state', state);
      expect(r.status).toBe(204);
      expect((await b.initial()).savedFilterJson).toEqual(state);
      expect((await ALL().initial()).savedFilterJson).toEqual(state);
      expect(await (await b.fetch('../board/filter-state')).json()).toEqual(state);
    });

    it('an empty body is ignored (the servlet stores only text)', async () => {
      await post(b, '../board/filter-state', '{"tab":"board"}');
      await post(b, '../board/filter-state', '');
      expect((await b.initial()).savedFilterJson).toEqual({ tab: 'board' });
    });

    it('resetMockLeads forgets it', async () => {
      await post(b, '../board/filter-state', { tab: 'list' });
      resetMockLeads();
      expect((await ALL().initial()).savedFilterJson).toBeNull();
    });
  });

  describe('moving a card (POST /board/contact-activities — the move-step modal)', () => {
    const firstCard = async () => (await get(b, board())).kanban[0].items[0];

    it('puts the lead into the step: the next board shows it in the new column and the counts follow', async () => {
      const lead = await firstCard();
      const before = await get(b, board());
      const target = before.kanban[1];
      const r = await post(b, '../board/contact-activities', { leadId: lead.id, channel: 'manual', content: 'ย้าย', procedureGroupId: 101, procedureId: target.stepId });
      expect(r.ok).toBe(true);
      const after = await get(b, board());
      expect(after.kanban[0].items.map((i: any) => i.id)).not.toContain(lead.id);
      expect(after.kanban[1].items.map((i: any) => i.id)).toContain(lead.id);
      expect(after.kanban[1].meta.total).toBe(target.meta.total + 1);
      expect(after.kanban[1].items.find((i: any) => i.id === lead.id).forwardStatus).toBe(`ฝ่ายบริการลูกค้า - ${target.stepName}`);
    });

    it('a move survives a new instance (the tab keeps it) until resetMockLeads', async () => {
      const lead = await firstCard();
      const target = (await get(b, board())).kanban[2];
      await post(b, '../board/contact-activities', { leadId: lead.id, channel: 'line', content: '', procedureId: target.stepId });
      expect((await get(ALL(), board())).kanban[2].items.map((i: any) => i.id)).toContain(lead.id);
      resetMockLeads();
      expect((await get(ALL(), board())).kanban[0].items.map((i: any) => i.id)).toContain(lead.id);
    });

    it('moves inside a product without workflow too (no group)', async () => {
      const first = await get(b, board('&movementTypeId=33'));
      const lead = first.kanban[0].items[0];
      await post(b, '../board/contact-activities', { leadId: lead.id, channel: 'manual', content: '', procedureId: first.kanban[2].stepId });
      expect((await get(b, board('&movementTypeId=33'))).kanban[2].items.map((i: any) => i.id)).toContain(lead.id);
    });

    it('answers what the servlet answers to a bad request: 400 for broken JSON / no leadId / a step of another group, 404 for an unknown lead', async () => {
      expect((await post(b, '../board/contact-activities', 'nope')).status).toBe(400);
      expect((await (await post(b, '../board/contact-activities', {})).json()).error).toBe('leadId required');
      const lead = await firstCard();
      expect((await post(b, '../board/contact-activities', { leadId: lead.id, procedureGroupId: 101, procedureId: 1022 })).status).toBe(400);
      expect((await post(b, '../board/contact-activities', { leadId: 99999, content: '' })).status).toBe(404);
    });

    it('a note that is exactly "!fail" is answered with 500 (so the error dialog can be seen)', async () => {
      const lead = await firstCard();
      const r = await post(b, '../board/contact-activities', { leadId: lead.id, channel: 'manual', content: '!fail', procedureId: lead.activityGroupId * 10 + 2 });
      expect(r.status).toBe(500);
      expect((await r.json()).error.message).toBeTruthy();
    });

    it('owner rule: CRM_ContactActivity_Create moves only the user\'s own leads, the _Sup key any lead, neither is 403', async () => {
      const rows = (await get(b, list().replace('perPage=20', 'perPage=200'))).leads.items as any[];
      const mine = rows.find((i) => i.employeeId === 1001);
      const theirs = rows.find((i) => i.employeeId !== 1001);
      const step = (l: any) => ({ leadId: l.id, channel: 'manual', content: '', procedureGroupId: l.activityGroupId, procedureId: l.activityGroupId * 10 + 1 });
      const own = ALL({ can: (f) => f === 'CRM_ContactActivity_Create', employeeId: 1001 });
      expect((await post(own, '../board/contact-activities', step(mine))).ok).toBe(true);
      expect((await post(own, '../board/contact-activities', step(theirs))).status).toBe(403);
      const sup = ALL({ can: (f) => f === 'CRM_ContactActivity_Create_Sup' });
      expect((await post(sup, '../board/contact-activities', step(theirs))).ok).toBe(true);
      expect((await post(ALL({ can: () => false }), '../board/contact-activities', step(mine))).status).toBe(403);
    });
  });

  describe('the suggestion card under the search box (GET /board/prospect-list)', () => {
    it('answers { status, result: { items: [{ id, code, name, phone, addr, avatar }] } }, at most perPage rows', async () => {
      const r = await get(b, '/triplesale/board/prospect-list?page=1&perPage=8&enrich=1&searchText=' + encodeURIComponent('สม'));
      expect(r.result.items.length).toBeGreaterThan(0);
      expect(r.result.items.length).toBeLessThanOrEqual(8);
      expect(Object.keys(r.result.items[0]).sort()).toEqual(['addr', 'avatar', 'code', 'id', 'name', 'phone']);
      expect(r.result.items.every((i: any) => (i.name + i.code + i.phone + i.addr).includes('สม'))).toBe(true);
    });
  });

  describe('addresses', () => {
    it('a relative address, the context path and a full URL all mean the same servlet', async () => {
      const a = await get(b, '../board/tags');
      expect(await get(b, '/triplesale/board/tags')).toEqual(a);
      expect(await get(b, 'http://127.0.0.1:4200/triplesale/board/tags')).toEqual(a);
      expect(await get(b, '/board/tags')).toEqual(a);
    });

    it('is deterministic: two instances give the same answer', async () => {
      expect(await get(ALL(), list())).toEqual(await get(b, list()));
    });
  });
});
