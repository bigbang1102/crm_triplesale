import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { ConfigService } from '@core/config/config.service';
import { configStub } from '@core/testing/test-helpers';
import { SettingsApi } from './settings.api';

const MASTER = '/master-service/api/v1';
const ENTITY = '0192f0a0-0000-7000-8000-0000000000e1';
const ok = <T>(result: T, meta?: object) => ({ status: 200, message: 'success', result, ...(meta ? { meta } : {}) });

describe('SettingsApi (master-service)', () => {
  let http: HttpTestingController;
  let api: SettingsApi;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [provideHttpClient(), provideHttpClientTesting(), { provide: ConfigService, useValue: configStub({ mock: false }) }],
    });
    http = TestBed.inject(HttpTestingController);
    api = TestBed.inject(SettingsApi);
  });
  afterEach(() => http.verify());

  it('entities() reads the "ใช้กับ" list and gives [] when the service sends none', async () => {
    const p = api.entities();
    const req = http.expectOne(`${MASTER}/master-setup/entities`);
    expect(req.request.method).toBe('GET');
    req.flush(ok([{ id: ENTITY, code: 'K29C2', name: 'บริษัททดสอบ' }]));
    expect(await p).toEqual([{ id: ENTITY, code: 'K29C2', name: 'บริษัททดสอบ' }]);

    const q = api.entities();
    http.expectOne(`${MASTER}/master-setup/entities`).flush({ status: 200, result: null });
    expect(await q).toEqual([]);
  });

  it('setup() sends the entity and returns the steps as the API computed them (done / locked / go-live)', async () => {
    const p = api.setup(ENTITY);
    const req = http.expectOne((r) => r.url === `${MASTER}/master-setup/steps`);
    expect(req.request.params.get('entityId')).toBe(ENTITY);
    const body = { phases: [{ key: 'p1', title: 'องค์กรและคน', steps: [{ stepKey: 'branch', done: false, locked: true, missingSteps: ['entity'] }] }], goLiveDone: 3, goLiveTotal: 20 };
    req.flush(ok(body));
    expect(await p).toEqual(body);
  });

  it('table() and records() build the URLs from the table key (encoded) and send only the filled query values', async () => {
    const t = api.table('branch');
    http.expectOne(`${MASTER}/master-tables/branch`).flush(ok({ table: 'branch', columns: [] }));
    expect((await t).table).toBe('branch');

    const r = api.records('branch', { entityId: ENTITY, page: 2, q: 'ลาดพร้าว' });
    const req = http.expectOne((x) => x.url === `${MASTER}/master-tables/branch/records`);
    expect(req.request.params.get('entityId')).toBe(ENTITY);
    expect(req.request.params.get('page')).toBe('2');
    expect(req.request.params.get('q')).toBe('ลาดพร้าว');
    expect(req.request.params.has('perPage')).toBe(false); // not sent: the server uses the config default
    expect(req.request.params.has('sort')).toBe(false);
    const meta = { page: 2, perPage: 20, total: 41, totalPages: 3 };
    req.flush(ok([{ id: 'a', code: 'B01' }], meta));
    expect(await r).toEqual({ rows: [{ id: 'a', code: 'B01' }], meta });

    const odd = api.table('a/b'); // never lets a key change the path
    http.expectOne(`${MASTER}/master-tables/a%2Fb`).flush(ok({ table: 'a/b', columns: [] }));
    await odd;
  });

  it('records() makes a meta of its own when the answer has none', async () => {
    const r = api.records('branch', { entityId: ENTITY });
    http.expectOne((x) => x.url.endsWith('/records')).flush(ok([{ id: 'a' }, { id: 'b' }]));
    expect((await r).meta).toEqual({ page: 1, perPage: 2, total: 2, totalPages: 1 });
  });

  it('form() asks for the create form with the entity (the pre-check), and for edit / view without it', async () => {
    const p = api.form('branch', 'create', ENTITY);
    const req = http.expectOne((x) => x.url === `${MASTER}/master-tables/branch/form`);
    expect(req.request.params.get('mode')).toBe('create');
    expect(req.request.params.get('entityId')).toBe(ENTITY);
    req.flush(ok({ table: 'branch', canEdit: true, writeEnabled: true, precheck: { canCreate: false, missingSteps: [{ stepKey: 'entity', title: 'นิติบุคคล' }], missingReferences: [] } }));
    expect((await p).precheck?.missingSteps[0].stepKey).toBe('entity');

    const v = api.form('branch', 'view');
    const view = http.expectOne((x) => x.url === `${MASTER}/master-tables/branch/form`);
    expect(view.request.params.get('mode')).toBe('view');
    expect(view.request.params.has('entityId')).toBe(false);
    view.flush(ok({ table: 'branch', canEdit: true, writeEnabled: true })); // the role's right, whatever the mode
    expect((await v).canEdit).toBe(true);
  });

  it('record() reads one row of the entity by id', async () => {
    const p = api.record('branch', 'r-1', ENTITY);
    const req = http.expectOne((x) => x.url === `${MASTER}/master-tables/branch/records/r-1`);
    expect(req.request.params.get('entityId')).toBe(ENTITY);
    req.flush(ok({ id: 'r-1', values: { code: 'B01' }, items: {} }));
    expect((await p).values['code']).toBe('B01');
  });

  it('options() names the tab and the field, pins the selected value, and returns the items with their paging', async () => {
    const p = api.options('salegroup', 'branchid', { entityId: ENTITY, section: 'main', q: 'ลาด', selected: 'b-1', excludeId: 'self', perPage: 1 });
    const req = http.expectOne((x) => x.url === `${MASTER}/master-tables/salegroup/fields/branchid/options`);
    expect(req.request.params.get('entityId')).toBe(ENTITY);
    expect(req.request.params.get('section')).toBe('main');
    expect(req.request.params.get('q')).toBe('ลาด');
    expect(req.request.params.get('selected')).toBe('b-1');
    expect(req.request.params.get('excludeId')).toBe('self');
    expect(req.request.params.get('perPage')).toBe('1');
    expect(req.request.params.has('page')).toBe(false);
    const meta = { page: 1, perPage: 1, total: 3, totalPages: 3 };
    req.flush(ok([{ id: 'b-1', code: 'B01', name: 'ลาดพร้าว' }], meta));
    expect(await p).toEqual({ items: [{ id: 'b-1', code: 'B01', name: 'ลาดพร้าว' }], meta });
  });

  it('create() POSTs the body as it is and returns the new id; update() PUTs to the row', async () => {
    const body = { entityId: ENTITY, values: { code: 'B01' }, items: { branches: [] } };
    const c = api.create('branch', body);
    const post = http.expectOne((x) => x.method === 'POST' && x.url === `${MASTER}/master-tables/branch/records`);
    expect(post.request.body).toEqual(body);
    post.flush(ok({ id: 'new-1' }), { status: 201, statusText: 'Created' });
    expect(await c).toBe('new-1');

    const u = api.update('branch', 'r-1', body);
    const put = http.expectOne((x) => x.method === 'PUT' && x.url === `${MASTER}/master-tables/branch/records/r-1`);
    expect(put.request.body).toEqual(body);
    put.flush(ok({ id: 'r-1' }));
    expect(await u).toBe('r-1');
  });

  it('a failed call rejects (the app interceptors turn it into an ApiError; here the raw HTTP error)', async () => {
    const p = api.setup(ENTITY);
    http.expectOne((x) => x.url.endsWith('/master-setup/steps')).flush({ status: 403 }, { status: 403, statusText: 'Forbidden' });
    await expect(p).rejects.toMatchObject({ status: 403 });
  });
});
