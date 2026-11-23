import { provideHttpClient, withInterceptors } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting, TestRequest } from '@angular/common/http/testing';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { ConfigService } from '@core/config/config.service';
import { apiErrorInterceptor } from '@core/http/interceptors';
import { I18n } from '@core/i18n/i18n.service';
import { configStub } from '@core/testing/test-helpers';
import { DialogService } from '@shared/ui/notify/dialog.service';
import { ToastService } from '@shared/ui/notify/toast.service';
import { Settings } from './settings';
import { SETTINGS_ENTITY_KEY } from './settings.store';

const MASTER = '/master-service/api/v1';
const E1 = '0192f0a0-0000-7000-8000-0000000000e1';
const E2 = '0192f0a0-0000-7000-8000-0000000000e2';
const ok = <T>(result: T, meta?: object) => ({ status: 200, message: 'success', result, ...(meta ? { meta } : {}) });
/** the error body master-service sends (ApiErrorResponse) */
const err = (status: number, code: string, description: string, details: object[] = []) => ({ status, message: code, error: { code, description, details } });

const tbl = (tableKey: string, title: string, hasRelease = false, optional = false) => ({ tableKey, title, hasRelease, optional });
const step = (stepKey: string, phaseKey: string, title: string, o: Record<string, unknown> = {}) => ({
  stepKey, phaseKey, title, goLive: true, done: false, locked: false, missingSteps: [], tables: [], visible: true, editable: true,
  note: null, editLevel: 'E', dependsOn: [], permFields: [], ...o,
});

/** what the API sends: the whole structure of the page (phases, steps, names, notes, order, dependencies, tables) comes from here */
const SETUP = {
  phases: [
    {
      key: 'p1',
      title: 'องค์กรและคน',
      steps: [
        step('branch', 'p1', 'สาขา', { done: true, dependsOn: ['entity'], tables: [tbl('branch', 'สาขา', true)] }),
        step('org', 'p1', 'โครงสร้างองค์กร', {
          dependsOn: ['branch'],
          note: 'หน่วยงาน → แผนก → ตำแหน่งงาน',
          tables: [tbl('department', 'หน่วยงาน'), tbl('positionorganize', 'แผนก', false, true), tbl('position', 'ตำแหน่งงาน')],
        }),
        step('employee', 'p1', 'พนักงาน', {
          locked: true, missingSteps: ['org'], dependsOn: ['systemname', 'org'], note: 'พนักงานทุกคนต้องผูกระบบที่ใช้อย่างน้อย 1 ระบบ',
          tables: [tbl('employee', 'พนักงาน')],
        }),
      ],
    },
    {
      key: 'p3',
      title: 'ลูกค้าและการตลาด',
      steps: [
        step('defperm', 'p3', 'สิทธิ์เริ่มต้น Lead / Prospect', {
          done: true, dependsOn: ['opportunityconfig', 'leadstatus'], tables: [tbl('businessentity', 'นิติบุคคล')], permFields: ['default_permission_lead', 'customer_pdpa'],
        }),
      ],
    },
  ],
  goLiveDone: 3,
  goLiveTotal: 20,
};
const columns = (table: string) => ({
  table, title: table, scope: 'ENTITY', provisional: false, defaultSort: 'code,asc', perPage: 20, perPageMax: 100, searchFields: ['code', 'name'], version: 1,
  columns: [
    { field: 'code', label: 'รหัส', type: 'text', required: true, width: 120, sortable: true },
    { field: 'name', label: 'ชื่อ', type: 'text', required: true, width: 220, sortable: true },
    { field: 'usagestatus', label: 'สถานะ', type: 'enum', required: false, width: 100, sortable: true },
    { field: '[action]', label: '', type: 'action', required: false, width: 160, sortable: false },
  ],
});
const ROWS = [
  { id: 'r1', code: 'B01', name: 'ลาดพร้าว', usagestatus: 'release' },
  { id: 'r2', code: 'B02', name: 'บางนา', usagestatus: 'draft' },
];
const META = { page: 1, perPage: 20, total: 2, totalPages: 1 };

describe('Settings page (Configuration & Master data) — the data comes from the database through master-service', () => {
  let http: HttpTestingController;
  let fixture: ComponentFixture<Settings>;
  let el: HTMLElement;

  const configure = (mock = false) => {
    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(withInterceptors([apiErrorInterceptor])),
        provideHttpClientTesting(),
        provideRouter([]),
        { provide: ConfigService, useValue: configStub({ mock }) },
        { provide: I18n, useValue: { t: (k: string, ...a: (string | number)[]) => (a.length ? `${k}|${a.join('|')}` : k) } },
      ],
    });
    http = TestBed.inject(HttpTestingController);
    fixture = TestBed.createComponent(Settings);
    el = fixture.nativeElement as HTMLElement;
  };
  /** lets the resources start / finish and the page draw. (whenStable() would wait for the HTTP call still open on purpose.) */
  const settle = async () => {
    for (let i = 0; i < 4; i++) {
      fixture.detectChanges();
      await new Promise((r) => setTimeout(r, 0));
    }
    fixture.detectChanges();
  };
  const path = (p: string) => (r: TestRequest['request']) => r.url === `${MASTER}${p}`;
  const flush = (p: string, body: object, status = 200) => http.expectOne(path(p)).flush(body, { status, statusText: String(status) });
  /** entities → (steps + columns + rows of the first table of the first step) */
  const load = async (table = 'branch') => {
    await settle();
    flush('/master-setup/entities', ok([{ id: E1, code: 'K29C1', name: 'บริษัทหนึ่ง' }, { id: E2, code: null, name: 'บริษัทสอง' }]));
    await settle();
    flush('/master-setup/steps', ok(SETUP));
    await settle();
    flush(`/master-tables/${table}`, ok(columns(table)));
    flush(`/master-tables/${table}/records`, ok(ROWS, META));
    await settle();
  };
  const texts = (sel: string) => Array.from(el.querySelectorAll(sel)).map((n) => n.textContent!.replace(/\s+/g, ' ').trim());
  /** column headers without the sort arrows (▲ sorted ascending · ▼ descending · ▲▼ sortable) */
  const heads = () => texts('thead th').map((h) => h.replace(/[▲▼]/g, '').trim());
  const click = async (sel: string, nth = 0) => {
    el.querySelectorAll<HTMLElement>(sel)[nth].click();
    await settle();
  };
  const stepEl = (name: string) => Array.from(el.querySelectorAll<HTMLElement>('.step')).find((s) => s.querySelector('.sname')!.textContent === name)!;

  beforeEach(() => {
    localStorage.removeItem(SETTINGS_ENTITY_KEY); // the chosen "ใช้กับ" is remembered: every test starts without one
    configure();
  });
  afterEach(() => {
    http.verify();
    localStorage.removeItem(SETTINGS_ENTITY_KEY);
  });

  /** the page opened again (a refresh): a new injector over the same storage */
  const reopen = () => {
    http.match(() => true); // requests of the page that is gone
    TestBed.resetTestingModule();
    configure();
  };

  it('asks for the "ใช้กับ" list first and nothing else, then for the steps / columns / rows of the first entity', async () => {
    await settle();
    const entities = http.expectOne(path('/master-setup/entities'));
    http.expectNone((r) => r.url !== `${MASTER}/master-setup/entities`); // no entity yet: nothing else is asked
    entities.flush(ok([{ id: E1, code: 'K29C1', name: 'บริษัทหนึ่ง' }, { id: E2, code: null, name: 'บริษัทสอง' }]));
    await settle();

    const steps = http.expectOne(path('/master-setup/steps'));
    expect(steps.request.params.get('entityId')).toBe(E1);
    steps.flush(ok(SETUP));
    await settle();
    // the first step of the first phase (as the database lists it) is open, with the table it needs
    const rows = http.expectOne(path('/master-tables/branch/records'));
    expect(rows.request.params.get('entityId')).toBe(E1);
    expect(rows.request.params.get('page')).toBe('1');
    http.expectOne(path('/master-tables/branch')).flush(ok(columns('branch')));
    rows.flush(ok(ROWS, META));
    await settle();
    expect(texts('#settings-ent option')).toEqual(['K29C1 · บริษัทหนึ่ง', 'บริษัทสอง']); // code + name; a missing code is left out
  });

  it('menu from the database: draws the phases, steps, ticks and the go-live count exactly as the API describes them', async () => {
    await load();
    expect(texts('.ptab')).toEqual(['0 องค์กรและคน', 'ลูกค้าและการตลาด']); // titles from the database, in its order ; the second phase has all its steps done → a tick instead of its number
    expect(el.querySelector('.go b')!.textContent!.trim()).toBe('3/20');
    expect(texts('.step .sname')).toEqual(['สาขา', 'โครงสร้างองค์กร', 'พนักงาน']);
    expect(el.querySelectorAll('.step.done').length).toBe(1); // branch
    expect(el.querySelectorAll('.step .warn').length).toBe(1); // employee is locked
    // "free" steps (wait for nothing but the entity) and "dependent" ones are grouped by the dependencies the API sent
    expect(el.querySelectorAll('.sgrp').length).toBe(2);
    expect(texts('.sgrp:not(.dep) .sname')).toEqual(['สาขา']);
    expect(texts('.sgrp.dep .sname')).toEqual(['โครงสร้างองค์กร', 'พนักงาน']);
    expect(el.querySelectorAll('.sgrp.dep .arr').length).toBe(1); // org → employee are chained
    expect(el.querySelector('.sgrp:not(.dep)')!.getAttribute('title')).toBe('app.settings.group.free');
    expect(el.querySelector('.sgrp.dep')!.getAttribute('title')).toBe('app.settings.group.dep');
    // the check mark of a step circle means "done" only: the selected step that is not finished shows an empty (filled) circle
    expect(el.querySelector('.step.sel:not(.done) .num ts-icon')).toBeNull();
    expect(el.querySelector('.step.done .num ts-icon')).toBeTruthy();
  });

  it('the "!" tip names the steps to finish first (from the API) and shows the note of the step', async () => {
    await load();
    stepEl('พนักงาน').querySelector<HTMLElement>('.warn')!.dispatchEvent(new Event('mouseenter'));
    await settle();
    const pop = el.querySelector('.pop')!;
    expect(pop.textContent).toContain('app.settings.fillFirst');
    expect(texts('.pop .go-i')).toEqual(['โครงสร้างองค์กร']); // missingSteps: only the one still unfinished
    expect(pop.textContent).toContain('พนักงานทุกคนต้องผูกระบบที่ใช้อย่างน้อย 1 ระบบ');
    el.querySelector<HTMLElement>('.pop .go-i')!.click(); // goes to that step
    await settle();
    expect(el.querySelector('.step.sel .sname')!.textContent).toBe('โครงสร้างองค์กร');
    flush('/master-tables/department', ok(columns('department')));
    flush('/master-tables/department/records', ok([], { page: 1, perPage: 20, total: 0, totalPages: 1 }));
  });

  it('a step with several tables shows them as chips; choosing one loads that table', async () => {
    await load();
    await click('.step', 1); // org
    flush('/master-tables/department', ok(columns('department')));
    flush('/master-tables/department/records', ok([], { page: 1, perPage: 20, total: 0, totalPages: 1 }));
    await settle();
    expect(texts('.sub')).toEqual(['หน่วยงาน', 'แผนก', 'ตำแหน่งงาน']);
    await click('.sub', 2);
    flush('/master-tables/position', ok(columns('position')));
    flush('/master-tables/position/records', ok(ROWS, META));
    await settle();
    expect(el.querySelector('.sub.on')!.textContent!.trim()).toBe('ตำแหน่งงาน');
  });

  it('the "initial permissions" step is a set of fields of the entity: the note says so, and the entity table is still shown with its columns', async () => {
    await load();
    await click('.ptab', 1);
    expect(el.querySelector('.step.sel .sname')!.textContent).toBe('สิทธิ์เริ่มต้น Lead / Prospect');
    flush('/master-tables/businessentity', ok(columns('businessentity')));
    flush('/master-tables/businessentity/records', ok(ROWS, META));
    await settle();
    expect(el.querySelector('.work .note.warn')!.textContent).toContain('app.settings.permPending');
    expect(heads()).toEqual(['รหัส *', 'ชื่อ *', 'สถานะ', '', 'app.settings.actions']);
  });

  it('draws the columns the API sent (not the action column) and the rows, with the status as a badge', async () => {
    await load();
    expect(heads()).toEqual(['รหัส *', 'ชื่อ *', 'สถานะ', '', 'app.settings.actions']);
    expect(texts('tbody tr:nth-child(1) td').slice(0, 2)).toEqual(['B01', 'ลาดพร้าว']);
    expect(texts('tbody tr .badge')).toEqual(['release', 'draft']); // mockup v33: the badge shows the status value itself, like the status choice in the form
    expect(el.querySelector('.badge.b-release')).toBeTruthy();
    expect(el.querySelector('.pager .info')!.textContent).toContain('app.settings.live.pageInfo|1|2|2|20');
  });

  it('typing in the search box asks the server (once, after a short pause) and goes back to page 1', async () => {
    await load();
    const input = el.querySelector<HTMLInputElement>('.search input')!;
    for (const v of ['ลา', 'ลาด']) {
      input.value = v;
      input.dispatchEvent(new Event('input', { bubbles: true })); // the first keystroke must not make a call of its own
    }
    http.expectNone((r) => r.url.endsWith('/records'));
    await new Promise((r) => setTimeout(r, 380));
    await settle();
    const req = http.expectOne(path('/master-tables/branch/records'));
    expect(req.request.params.get('q')).toBe('ลาด');
    expect(req.request.params.get('page')).toBe('1');
    req.flush(ok([ROWS[0]], { page: 1, perPage: 20, total: 1, totalPages: 1 }));
    await settle();
    expect(texts('tbody tr').length).toBe(1);
  });

  it('the pager asks for the next page; changing the table starts again at page 1 with no search', async () => {
    await settle();
    flush('/master-setup/entities', ok([{ id: E1, code: 'K', name: 'x' }]));
    await settle();
    flush('/master-setup/steps', ok(SETUP));
    await settle();
    flush('/master-tables/branch', ok(columns('branch')));
    flush('/master-tables/branch/records', ok(ROWS, { page: 1, perPage: 2, total: 5, totalPages: 3 }));
    await settle();
    await click('.pager button:last-child'); // next
    const p2 = http.expectOne(path('/master-tables/branch/records'));
    expect(p2.request.params.get('page')).toBe('2');
    p2.flush(ok(ROWS, { page: 2, perPage: 2, total: 5, totalPages: 3 }));
    await settle();

    await click('.step', 1); // another step → its table, from page 1
    flush('/master-tables/department', ok(columns('department')));
    const other = http.expectOne(path('/master-tables/department/records'));
    expect(other.request.params.get('page')).toBe('1');
    expect(other.request.params.has('q')).toBe(false);
    other.flush(ok([], { page: 1, perPage: 20, total: 0, totalPages: 1 }));
  });

  it('another entity asks for its own steps and rows', async () => {
    await load();
    const select = el.querySelector<HTMLSelectElement>('#settings-ent')!;
    select.value = E2;
    select.dispatchEvent(new Event('change'));
    await settle();
    const steps = http.expectOne(path('/master-setup/steps'));
    expect(steps.request.params.get('entityId')).toBe(E2);
    steps.flush(ok(SETUP));
    await settle();
    // the steps of the new entity decide what is open, so the list area is built again for it
    http.expectOne(path('/master-tables/branch')).flush(ok(columns('branch')));
    const rows = http.expectOne(path('/master-tables/branch/records'));
    expect(rows.request.params.get('entityId')).toBe(E2);
    rows.flush(ok(ROWS, META));
  });

  it('remembers the entity that was chosen: opening the page again starts on it (not on the first one)', async () => {
    await load();
    const select = el.querySelector<HTMLSelectElement>('#settings-ent')!;
    select.value = E2;
    select.dispatchEvent(new Event('change'));
    await settle();
    expect(localStorage.getItem(SETTINGS_ENTITY_KEY)).toBe(E2);

    reopen();
    await settle();
    flush('/master-setup/entities', ok([{ id: E1, code: 'K29C1', name: 'บริษัทหนึ่ง' }, { id: E2, code: null, name: 'บริษัทสอง' }]));
    await settle();
    expect(http.expectOne(path('/master-setup/steps')).request.params.get('entityId')).toBe(E2);
  });

  it('an entity that was remembered but is not in the list any more (another user) is ignored: the first one is used', async () => {
    localStorage.setItem(SETTINGS_ENTITY_KEY, '0192f0a0-0000-7000-8000-00000000dead');
    reopen();
    await settle();
    flush('/master-setup/entities', ok([{ id: E1, code: 'K29C1', name: 'บริษัทหนึ่ง' }]));
    await settle();
    expect(http.expectOne(path('/master-setup/steps')).request.params.get('entityId')).toBe(E1);
  });

  it('a refusal from the service is explained on the page (here: the role cannot see this level)', async () => {
    await settle();
    flush('/master-setup/entities', ok([{ id: E1, code: 'K', name: 'x' }]));
    await settle();
    flush('/master-setup/steps', ok(SETUP));
    await settle();
    flush('/master-tables/branch', err(403, 'FORBIDDEN', 'Access denied'), 403);
    flush('/master-tables/branch/records', err(403, 'FORBIDDEN', 'Access denied'), 403);
    await settle();
    expect(el.querySelector('.note.err')!.textContent).toContain('app.settings.err.noRole');
    expect(el.querySelector('.note.err button')).toBeTruthy(); // retry
  });

  it('when the steps cannot be loaded it says so with a retry, and draws no steps of its own', async () => {
    await settle();
    flush('/master-setup/entities', ok([{ id: E1, code: 'K', name: 'x' }]));
    await settle();
    flush('/master-setup/steps', err(500, 'INTERNAL', 'boom'), 500);
    await settle();
    expect(el.querySelector('.note.err')!.textContent).toContain('app.settings.err.server');
    expect(el.querySelectorAll('.step').length).toBe(0); // nothing static to fall back on
    expect(el.querySelectorAll('.ptab').length).toBe(0);
    el.querySelector<HTMLButtonElement>('.note.err button')!.click();
    await settle();
    flush('/master-setup/entities', ok([{ id: E1, code: 'K', name: 'x' }]));
    await settle();
    flush('/master-setup/steps', ok(SETUP));
    await settle();
    flush('/master-tables/branch', ok(columns('branch')));
    flush('/master-tables/branch/records', ok(ROWS, META));
    await settle();
    expect(el.querySelectorAll('.step').length).toBe(3);
  });

  it('no entity for this user: says so (not an error)', async () => {
    await settle();
    flush('/master-setup/entities', ok([]));
    await settle();
    expect(el.querySelector('.note.warn')!.textContent).toContain('app.settings.live.noEntity');
    expect(el.querySelector('.note.err')).toBeNull();
    http.expectNone((r) => r.url !== `${MASTER}/master-setup/entities`);
  });

  it('does not matter what "mock" says in the app config: the page never shows sample data', async () => {
    TestBed.resetTestingModule();
    configure(true);
    await settle();
    flush('/master-setup/entities', ok([{ id: E1, code: 'K29C1', name: 'บริษัทหนึ่ง' }]));
    await settle();
    expect(texts('#settings-ent option')).toEqual(['K29C1 · บริษัทหนึ่ง']);
    http.expectOne(path('/master-setup/steps')).flush(ok({ phases: [], goLiveDone: 0, goLiveTotal: 0 }));
    await settle();
    expect(el.querySelectorAll('.step').length).toBe(0);
  });

  describe('create / view / edit', () => {
    const formDef = (o: object = {}) => ({
      table: 'branch', title: 'สาขา', mode: 'create', editLevel: 'E', canEdit: true, writeEnabled: true, version: 1,
      sections: [{ key: 'main', kind: 'main', title: 'ข้อมูลหลัก', fields: [{ field: 'code', label: 'รหัส', control: 'text', type: 'text', required: true }] }],
      precheck: { canCreate: true, missingSteps: [], missingReferences: [] },
      ...o,
    });
    const createButton = () => Array.from(el.querySelectorAll<HTMLButtonElement>('.tools button')).find((b) => b.textContent!.includes('app.settings.create'))!;

    it('"สร้าง" opens the form of the table (the form asks the API to check first)', async () => {
      await load();
      expect(el.querySelector('ts-master-form')).toBeNull();
      createButton().click();
      await settle();
      const form = http.expectOne((r) => r.url === `${MASTER}/master-tables/branch/form`);
      expect(form.request.params.get('mode')).toBe('create');
      expect(form.request.params.get('entityId')).toBe(E1);
      form.flush(ok(formDef()));
      await settle();
      expect(el.querySelector('ts-master-form .mf-dialog h2')!.textContent).toBe('app.settings.form.titleCreate|สาขา');
      // the form is a full page: the phase tabs and the step flow hide, a breadcrumb leads back to the list
      expect(el.querySelector('.tabbar')).toBeNull();
      expect(el.querySelector('.sechead')).toBeNull();
      expect(texts('.pg-crumb > span')).toEqual(['/', 'สาขา', '/', 'สาขา', '/']); // / step / table / current
      expect(el.querySelector('.pg-crumb b')!.textContent).toBe('app.settings.page.curCreate');
      el.querySelector<HTMLButtonElement>('.pg-back')!.click(); // nothing typed: back to the list at once
      await settle();
      expect(el.querySelector('ts-master-form')).toBeNull();
      expect(el.querySelector('.tabbar')).toBeTruthy();
      expect(el.querySelector('.tw')).toBeTruthy();
    });

    it('"สร้าง" with a step still to finish: the form says so and the link takes the user to that step (nothing is written)', async () => {
      await load();
      await click('.step', 1); // org
      flush('/master-tables/department', ok(columns('department')));
      flush('/master-tables/department/records', ok([], { page: 1, perPage: 20, total: 0, totalPages: 1 }));
      await settle();
      createButton().click();
      await settle();
      http.expectOne((r) => r.url === `${MASTER}/master-tables/department/form`).flush(
        ok(formDef({ table: 'department', precheck: { canCreate: false, missingSteps: [{ stepKey: 'branch', title: 'สาขา' }], missingReferences: [] } })),
      );
      await settle();
      const note = el.querySelector('ts-master-form .mf-note.warn')!;
      expect(note.textContent).toContain('app.settings.create.needSteps');
      const go = note.querySelector<HTMLButtonElement>('button.go-i')!;
      expect(go.textContent).toContain('สาขา');
      go.click(); // closes the form and goes to the step to finish first
      await settle();
      expect(el.querySelector('ts-master-form')).toBeNull();
      expect(el.querySelector('.step.sel .sname')!.textContent).toBe('สาขา');
      flush('/master-tables/branch', ok(columns('branch')));
      flush('/master-tables/branch/records', ok(ROWS, META));
      http.expectNone((r) => r.method !== 'GET');
    });

    it('"สร้าง" that the service refuses (here: 403) is explained inside the form', async () => {
      await load();
      createButton().click();
      await settle();
      http.expectOne((r) => r.url === `${MASTER}/master-tables/branch/form`).flush(err(403, 'FORBIDDEN', 'Access to this entity is not allowed'), { status: 403, statusText: 'Forbidden' });
      await settle();
      expect(el.querySelector('ts-master-form .mf-note.err')!.textContent).toContain('app.settings.err.noEntity');
    });

    it('the eye and the pencil of a row open it to view / edit (the row and the form are read together)', async () => {
      await load();
      for (const [index, mode] of [[0, 'view'], [2, 'edit']] as const) {
        el.querySelectorAll<HTMLButtonElement>('tbody tr:first-child .act button')[index].click();
        await settle();
        const form = http.expectOne((r) => r.url === `${MASTER}/master-tables/branch/form`);
        expect(form.request.params.get('mode')).toBe(mode);
        const rec = http.expectOne((r) => r.url === `${MASTER}/master-tables/branch/records/r1`);
        expect(rec.request.params.get('entityId')).toBe(E1);
        form.flush(ok(formDef({ mode, precheck: undefined })));
        rec.flush(ok({ id: 'r1', values: { code: 'B01' }, items: {} }));
        await settle();
        const used = http.expectOne((r) => r.url === `${MASTER}/master-tables/branch/records/r1/usage`); // who uses this row (the tab "ใช้อยู่ใน")
        expect(used.request.params.get('entityId')).toBe(E1);
        used.flush(ok({ total: 0, items: [] }));
        await settle();
        expect(el.querySelector<HTMLInputElement>('ts-master-form input')!.value).toBe('B01');
        el.querySelector<HTMLButtonElement>('ts-master-form .pg-back')!.click(); // ← back to the list
        await settle();
        expect(el.querySelector('ts-master-form')).toBeNull();
      }
    });

    it('the copy icon of a row opens a NEW record filled with that row (code left empty); saving POSTs a new row and the list reloads', async () => {
      await load();
      const copyIcon = el.querySelector<HTMLButtonElement>('tbody tr:first-child .act button.copy')!;
      copyIcon.click();
      await settle();
      expect(el.querySelector('ts-master-form')).toBeTruthy(); // not a toast any more, and the click did not also open the row to view
      const form = http.expectOne((r) => r.url === `${MASTER}/master-tables/branch/form`);
      expect(form.request.params.get('mode')).toBe('create'); // the checks of a new record: role, steps, open for writing
      const rec = http.expectOne((r) => r.url === `${MASTER}/master-tables/branch/records/r1`);
      expect(rec.request.params.get('entityId')).toBe(E1);
      form.flush(ok(formDef({ sections: [{ key: 'main', kind: 'main', title: 'ข้อมูลหลัก', fields: [
        { field: 'code', label: 'รหัส', control: 'text', type: 'text', required: true, format: 'code' },
        { field: 'name', label: 'ชื่อ', control: 'text', type: 'text', required: false },
      ] }] })));
      rec.flush(ok({ id: 'r1', values: { code: 'B01', name: 'ลาดพร้าว' }, items: {} }));
      await settle();
      expect(el.querySelector('ts-master-form .mf-dialog h2')!.textContent).toBe('app.settings.form.titleCreate|สาขา'); // mockup v33: a copy is titled like a new record
      const inputs = el.querySelectorAll<HTMLInputElement>('ts-master-form .mf-body input');
      expect(inputs[0].value).toBe(''); // code
      expect(inputs[1].value).toBe('ลาดพร้าว (สำเนา)');

      inputs[0].value = 'B03';
      inputs[0].dispatchEvent(new Event('input', { bubbles: true }));
      await settle();
      Array.from(el.querySelectorAll<HTMLButtonElement>('ts-master-form .mf-act button')).find((b) => b.textContent!.includes('app.settings.form.save'))!.click();
      await settle();
      const post = http.expectOne((r) => r.method === 'POST' && r.url === `${MASTER}/master-tables/branch/records`);
      expect(post.request.body).toEqual({ entityId: E1, values: { code: 'B03', name: 'ลาดพร้าว (สำเนา)' }, items: {} });
      post.flush(ok({ id: 'new' }), { status: 201, statusText: 'Created' });
      await settle();
      expect(el.querySelector('ts-master-form')).toBeNull();
      http.expectOne((r) => r.url === `${MASTER}/master-tables/branch/records` && r.method === 'GET').flush(ok(ROWS, META));
      http.expectOne((r) => r.url === `${MASTER}/master-setup/steps`).flush(ok(SETUP));
      await settle();
      http.expectNone((r) => r.method === 'PUT' || r.method === 'DELETE');
    });

    describe('delete (the trash icon opens the delete page of the row — mockup v33)', () => {
      const toasts = () => TestBed.inject(ToastService).toasts().map((t) => `${t.kind}:${t.text}`);
      const trash = (row = 1) => el.querySelector<HTMLButtonElement>(`tbody tr:nth-child(${row}) .act button.del`)!;
      const isDelete = (id = 'r1') => (r: TestRequest['request']) => r.method === 'DELETE' && r.url === `${MASTER}/master-tables/branch/records/${id}`;
      const sections = [{ key: 'main', kind: 'main', title: 'ข้อมูลหลัก', fields: [
        { field: 'code', label: 'รหัส', control: 'text', type: 'text', required: true },
        { field: 'name', label: 'ชื่อ', control: 'text', type: 'text', required: false },
      ] }];
      const NONE = { total: 0, items: [] };
      const USED = { total: 3, items: [
        { table: 'salegroup', title: 'กลุ่มการขาย', id: 'u1', code: 'SG1', name: 'กลุ่ม 1' },
        { table: 'saleperson', title: 'พนักงานขาย', id: 'u2', code: 'SP1', name: 'คน 1' },
        { table: 'saleperson', title: 'พนักงานขาย', id: 'u3', code: 'SP2', name: null },
      ] };
      /** the trash icon: the page reads the form (mode edit — it tells whether this role may change the table), the row and who uses it */
      const openDelete = async (usage: object = NONE, row = 1, id = 'r1', code = 'B01', name = 'ลาดพร้าว', def: object = {}) => {
        trash(row).click();
        await settle();
        const form = http.expectOne((r) => r.url === `${MASTER}/master-tables/branch/form`);
        expect(form.request.params.get('mode')).toBe('edit');
        const rec = http.expectOne((r) => r.url === `${MASTER}/master-tables/branch/records/${id}`);
        form.flush(ok(formDef({ mode: 'edit', precheck: undefined, sections, ...def })));
        rec.flush(ok({ id, values: { code, name, usagestatus: 'release' }, items: {} }));
        await settle();
        http.expectOne((r) => r.url === `${MASTER}/master-tables/branch/records/${id}/usage`).flush(ok(usage));
        await settle();
      };
      const pageButton = (text: string) => Array.from(el.querySelectorAll<HTMLButtonElement>('ts-master-form .mf-act button')).find((b) => b.textContent!.includes(text))!;

      it('opens the delete page of that row (a page with a breadcrumb, not a pop-up); the click does not also open the row, and "ยกเลิก" returns with nothing deleted', async () => {
        await load();
        await openDelete();
        expect(el.querySelector('ts-master-form .mf-dialog h2')!.textContent).toBe('app.settings.delete.pageTitle|B01 · ลาดพร้าว');
        expect(el.querySelector('.pg-crumb b')!.textContent).toBe('app.settings.page.curDelete');
        expect(el.querySelector('.tabbar')).toBeNull(); // a full page like the form: the phase tabs and the step flow hide
        expect(el.querySelector('ts-master-form .mf-body')!.textContent).toContain('app.settings.delete.body');
        http.expectNone((r) => r.method === 'DELETE');
        pageButton('app.settings.form.cancel').click();
        await settle();
        expect(el.querySelector('ts-master-form')).toBeNull();
        expect(el.querySelector('.tw')).toBeTruthy();
        http.expectNone((r) => r.method !== 'GET');
        expect(toasts()).toEqual([]);
      });

      it('"ลบ" removes exactly that row of the selected entity, says "ลบ <รหัส> แล้ว", and loads the list and the steps again', async () => {
        await load();
        await openDelete();
        pageButton('app.settings.delete.ok').click();
        await settle();
        const del = http.expectOne(isDelete('r1'));
        expect(del.request.params.get('entityId')).toBe(E1); // DELETE has no body: the entity goes in the query
        expect(del.request.body).toBeNull();
        del.flush(ok({ id: 'r1' }));
        await settle();
        expect(el.querySelector('ts-master-form')).toBeNull();
        expect(toasts()).toEqual(['success:app.settings.delete.done|B01']);
        http.expectOne((r) => r.url === `${MASTER}/master-tables/branch/records` && r.method === 'GET').flush(ok([ROWS[1]], { ...META, total: 1 }));
        http.expectOne((r) => r.url === `${MASTER}/master-setup/steps`).flush(ok(SETUP)); // a deleted release row can un-finish a step
        await settle();
        expect(texts('tbody tr .code')).toEqual(['B02']);
      });

      it('a row that other Masters use: "ลบไม่ได้ ใช้อยู่ใน N รายการ" + who uses it, and no delete button — only "เปลี่ยนเป็น block"', async () => {
        await load();
        await openDelete(USED);
        expect(el.querySelector('ts-master-form .del-no')!.textContent).toBe('app.settings.delete.inUse|3');
        expect(texts('ts-master-form .used span')).toEqual(['กลุ่มการขาย · SG1 กลุ่ม 1', 'พนักงานขาย · SP1 คน 1', 'พนักงานขาย · SP2']);
        expect(pageButton('app.settings.delete.ok')).toBeUndefined();
        expect(pageButton('app.settings.delete.toBlock')).toBeTruthy();
      });

      it('"เปลี่ยนเป็น block" saves the row with the status block (no item tab is sent), says so, and loads the list and the steps again', async () => {
        await load();
        await openDelete(USED);
        pageButton('app.settings.delete.toBlock').click();
        await settle();
        const put = http.expectOne((r) => r.method === 'PUT' && r.url === `${MASTER}/master-tables/branch/records/r1`);
        expect(put.request.body).toEqual({ entityId: E1, values: { code: 'B01', name: 'ลาดพร้าว' } }); // the form has no status field here, so nothing but the two fields; no items key
        put.flush(ok({ id: 'r1' }));
        await settle();
        expect(el.querySelector('ts-master-form')).toBeNull();
        expect(toasts()).toEqual(['success:app.settings.delete.blocked|B01']);
        http.expectOne((r) => r.url === `${MASTER}/master-tables/branch/records` && r.method === 'GET').flush(ok(ROWS, META));
        http.expectOne((r) => r.url === `${MASTER}/master-setup/steps`).flush(ok(SETUP));
        await settle();
      });

      it('when the database still refuses (409, e.g. a table the page does not know uses the row) the reason stays on the delete page and nothing is reloaded', async () => {
        await load();
        await openDelete();
        pageButton('app.settings.delete.ok').click();
        await settle();
        http.expectOne(isDelete('r1')).flush(err(409, 'RECORD_IN_USE', 'This record is in use by other records and cannot be deleted'), { status: 409, statusText: 'Conflict' });
        await settle();
        expect(el.querySelector('ts-master-form .mf-note.err')!.textContent).toContain('app.settings.err.inUse (HTTP 409)');
        expect(toasts()).toEqual([]);
        http.expectNone((r) => r.method === 'GET');
      });

      it('deleting the only row of page 2 goes back to page 1 (no empty page is left on screen)', async () => {
        await settle();
        flush('/master-setup/entities', ok([{ id: E1, code: 'K29C1', name: 'บริษัทหนึ่ง' }]));
        await settle();
        flush('/master-setup/steps', ok(SETUP));
        await settle();
        flush('/master-tables/branch', ok(columns('branch')));
        flush('/master-tables/branch/records', ok(ROWS, { page: 1, perPage: 20, total: 21, totalPages: 2 }));
        await settle();
        await click('.pgb', 2); // ‹ 1 2 › → "2"
        http.expectOne((r) => r.url === `${MASTER}/master-tables/branch/records` && r.params.get('page') === '2')
          .flush(ok([{ id: 'r21', code: 'B21', name: 'ปลายทาง', usagestatus: 'release' }], { page: 2, perPage: 20, total: 21, totalPages: 2 }));
        await settle();
        expect(texts('tbody tr .code')).toEqual(['B21']);

        await openDelete(NONE, 1, 'r21', 'B21', 'ปลายทาง');
        pageButton('app.settings.delete.ok').click();
        await settle();
        http.expectOne(isDelete('r21')).flush(ok({ id: 'r21' }));
        await settle();
        const back = http.expectOne((r) => r.url === `${MASTER}/master-tables/branch/records` && r.method === 'GET');
        expect(back.request.params.get('page')).toBe('1'); // not page 2 again (it would be empty)
        back.flush(ok(ROWS, { page: 1, perPage: 20, total: 20, totalPages: 1 }));
        http.expectOne((r) => r.url === `${MASTER}/master-setup/steps`).flush(ok(SETUP));
        await settle();
        expect(texts('tbody tr .code')).toEqual(['B01', 'B02']);
      });
    });

    it('clicking the row itself opens it to view, and "edit" in that form switches the same row to edit mode', async () => {
      await load();
      const open = async (mode: 'view' | 'edit') => {
        await settle();
        const form = http.expectOne((r) => r.url === `${MASTER}/master-tables/branch/form`);
        expect(form.request.params.get('mode')).toBe(mode);
        const rec = http.expectOne((r) => r.url === `${MASTER}/master-tables/branch/records/r1`);
        form.flush(ok(formDef({ mode, precheck: undefined })));
        rec.flush(ok({ id: 'r1', values: { code: 'B01' }, items: {} }));
        await settle();
        http.expectOne((r) => r.url === `${MASTER}/master-tables/branch/records/r1/usage`).flush(ok({ total: 0, items: [] }));
        await settle();
      };
      el.querySelector<HTMLElement>('tbody tr:first-child td')!.click(); // not a button: the whole row is the "view" target
      await open('view');
      expect(el.querySelector('ts-master-form .mf-dialog h2')!.textContent).toBe('app.settings.form.titleView|สาขา');
      Array.from(el.querySelectorAll<HTMLButtonElement>('ts-master-form .mf-act button')).find((b) => b.textContent!.includes('app.settings.edit'))!.click();
      await open('edit');
      expect(el.querySelector('ts-master-form .mf-dialog h2')!.textContent).toBe('app.settings.form.titleEdit|สาขา');
    });

    it('after a save the form closes and the list and the steps are loaded again (a new release row can finish a step)', async () => {
      await load();
      createButton().click();
      await settle();
      http.expectOne((r) => r.url === `${MASTER}/master-tables/branch/form`).flush(ok(formDef()));
      await settle();
      const input = el.querySelector<HTMLInputElement>('ts-master-form input')!;
      input.value = 'B03';
      input.dispatchEvent(new Event('input', { bubbles: true }));
      await settle();
      Array.from(el.querySelectorAll<HTMLButtonElement>('ts-master-form .mf-act button')).find((b) => b.textContent!.includes('app.settings.form.save'))!.click();
      await settle();
      const post = http.expectOne((r) => r.method === 'POST' && r.url === `${MASTER}/master-tables/branch/records`);
      expect(post.request.body).toMatchObject({ entityId: E1, values: { code: 'B03' } });
      post.flush(ok({ id: 'new' }), { status: 201, statusText: 'Created' });
      await settle();
      expect(el.querySelector('ts-master-form')).toBeNull();
      http.expectOne((r) => r.url === `${MASTER}/master-tables/branch/records` && r.method === 'GET').flush(ok(ROWS, META));
      http.expectOne((r) => r.url === `${MASTER}/master-setup/steps`).flush(ok(SETUP));
      await settle();
      expect(TestBed.inject(ToastService).toasts().map((t) => t.text)).toEqual(['app.settings.form.savedCode|B03']); // "บันทึก B03 แล้ว" (mockup v33)
    });

    it('a save that finishes a step names the steps it unlocked in the toast ("บันทึก … แล้ว · ตั้งค่า … ได้แล้ว")', async () => {
      await load();
      createButton().click();
      await settle();
      http.expectOne((r) => r.url === `${MASTER}/master-tables/branch/form`).flush(ok(formDef()));
      await settle();
      const input = el.querySelector<HTMLInputElement>('ts-master-form input')!;
      input.value = 'B03';
      input.dispatchEvent(new Event('input', { bubbles: true }));
      await settle();
      Array.from(el.querySelectorAll<HTMLButtonElement>('ts-master-form .mf-act button')).find((b) => b.textContent!.includes('app.settings.form.save'))!.click();
      await settle();
      http.expectOne((r) => r.method === 'POST').flush(ok({ id: 'new' }), { status: 201, statusText: 'Created' });
      await settle();
      http.expectOne((r) => r.url === `${MASTER}/master-tables/branch/records` && r.method === 'GET').flush(ok(ROWS, META));
      const unlocked = { ...SETUP, phases: SETUP.phases.map((p) => ({ ...p, steps: p.steps.map((st) => (st.stepKey === 'employee' ? { ...st, locked: false, missingSteps: [] } : st)) })) }; // the employee step was locked until now
      http.expectOne((r) => r.url === `${MASTER}/master-setup/steps`).flush(ok(unlocked));
      await settle();
      expect(TestBed.inject(ToastService).toasts().map((t) => t.text)).toEqual(['app.settings.form.savedUnlock|B03|พนักงาน']);
    });
  });
});
