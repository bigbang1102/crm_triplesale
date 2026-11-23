import { provideHttpClient, withInterceptors } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { ConfigService } from '@core/config/config.service';
import { apiErrorInterceptor } from '@core/http/interceptors';
import { I18n } from '@core/i18n/i18n.service';
import { configStub } from '@core/testing/test-helpers';
import { ApiField, ApiFormDef, ApiRecord, FormMode } from '../settings.api';
import { MasterForm } from './master-form';

const MASTER = '/master-service/api/v1';
const ENTITY = '0192f0a0-0000-7000-8000-0000000000e1';
const ROW = '0192f0a0-0000-7000-8000-0000000000aa';
const PROVINCE = '0192f0a0-0000-7000-8000-0000000000b1';
const BRANCH = '0192f0a0-0000-7000-8000-0000000000c1';

const ok = <T>(result: T, meta?: object) => ({ status: 200, message: 'success', result, ...(meta ? { meta } : {}) });
const err = (status: number, code: string, description: string, details: object[] = []) => ({ status, message: code, error: { code, description, details } });
const f = (o: Partial<ApiField> & Pick<ApiField, 'field'>): ApiField => ({ label: o.field, control: 'text', type: 'text', required: false, ...o });

const FIELDS: ApiField[] = [
  f({ field: 'code', label: 'รหัส', required: true, maxLength: 20, hint: 'ห้ามซ้ำภายในนิติบุคคลเดียวกัน' }),
  f({ field: 'name', label: 'ชื่อ', required: true }),
  f({ field: 'usagestatus', label: 'สถานะ', control: 'segment', required: true, defaultValue: 'release', options: [{ value: 'release', text: 'release' }, { value: 'draft', text: 'draft' }] }),
  f({ field: 'province', label: 'จังหวัด', control: 'reference', type: 'uuid', required: true, reference: { table: 'province', scope: 'SHARED', excludeSelf: false } }),
  f({ field: 'note', label: 'หมายเหตุ', control: 'textarea', maxLength: 250, counter: true }),
];
const DEF = (o: Partial<ApiFormDef> = {}): ApiFormDef => ({
  table: 'department', title: 'หน่วยงาน', mode: 'create', editLevel: 'E', canEdit: true, writeEnabled: true, version: 1,
  sections: [
    { key: 'main', kind: 'main', title: 'ข้อมูลหลัก', fields: FIELDS },
    {
      key: 'branches', kind: 'item', title: 'สาขา',
      fields: [
        f({ field: 'branchid', label: 'สาขา', control: 'reference', type: 'uuid', required: true, reference: { table: 'branch', scope: 'ENTITY', excludeSelf: false } }),
        f({ field: 'is_main', label: 'สาขาหลัก', control: 'checkbox', type: 'boolean', defaultValue: 'false' }),
      ],
    },
  ],
  ...o,
});
const RECORD: ApiRecord = {
  id: ROW,
  values: { code: 'D01', name: 'ขาย', usagestatus: 'draft', province: PROVINCE, note: null },
  items: { branches: [{ id: 'i1', branchid: BRANCH, is_main: true }] },
};

describe('<ts-master-form> — create / edit / view from the form the API describes', () => {
  let http: HttpTestingController;
  let fixture: ComponentFixture<MasterForm>;
  let el: HTMLElement;
  let saved: { id: string; mode: string; code: string }[];
  let deleted: { id: string; code: string }[];
  let toBlocked: { id: string; code: string }[];
  let copies: number;
  let closed: number;
  let steps: string[];

  const open = (mode: FormMode, recordId: string | null = null, copyFrom: string | null = null, intent: 'delete' | null = null) => {
    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(withInterceptors([apiErrorInterceptor])),
        provideHttpClientTesting(),
        { provide: ConfigService, useValue: configStub({ mock: false }) },
        { provide: I18n, useValue: { t: (k: string, ...a: (string | number)[]) => (a.length ? `${k}|${a.join('|')}` : k) } },
      ],
    });
    http = TestBed.inject(HttpTestingController);
    fixture = TestBed.createComponent(MasterForm);
    saved = [];
    closed = 0;
    steps = [];
    fixture.componentInstance.saved.subscribe((s) => saved.push(s));
    fixture.componentInstance.closed.subscribe(() => closed++);
    fixture.componentInstance.goStep.subscribe((s) => steps.push(s));
    fixture.componentRef.setInput('table', 'department');
    fixture.componentRef.setInput('mode', mode);
    fixture.componentRef.setInput('entityId', ENTITY);
    fixture.componentRef.setInput('recordId', recordId);
    fixture.componentRef.setInput('copyFrom', copyFrom);
    fixture.componentRef.setInput('intent', intent);
    deleted = [];
    toBlocked = [];
    copies = 0;
    fixture.componentInstance.deleted.subscribe((d) => deleted.push(d));
    fixture.componentInstance.toBlocked.subscribe((d) => toBlocked.push(d));
    fixture.componentInstance.copy.subscribe(() => copies++);
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
  const url = (p: string) => (r: { url: string }) => r.url === `${MASTER}${p}`;
  /** "ใช้อยู่ใน" of the row that is open: asked after the form and the row came (edit / view only) */
  const USAGE0 = { total: 0, items: [] as object[] };
  const flushUsage = async (u: object | 'fail' = USAGE0) => {
    await settle();
    const r = http.expectOne(url(`/master-tables/department/records/${ROW}/usage`));
    expect(r.request.params.get('entityId')).toBe(ENTITY);
    if (u === 'fail') r.flush(err(500, 'INTERNAL', 'x'), { status: 500, statusText: 'Server Error' });
    else r.flush(ok(u));
    await settle();
  };
  const field = (label: string) => Array.from(el.querySelectorAll<HTMLElement>('.mf-field')).find((n) => n.querySelector('.mf-label')?.textContent?.includes(label))!;
  const control = (label: string) => field(label).querySelector<HTMLInputElement>('input, textarea, select')!;
  const type = async (label: string, value: string) => {
    const c = control(label);
    c.value = value;
    c.dispatchEvent(new Event('input', { bubbles: true }));
    await settle();
  };
  const button = (text: string) => Array.from(el.querySelectorAll<HTMLButtonElement>('button')).find((b) => b.textContent!.includes(text))!;
  /** the form of a create: the API's answer to GET …/form?mode=create */
  const loadCreate = async (def: ApiFormDef = DEF()) => {
    open('create');
    await settle();
    const req = http.expectOne(url('/master-tables/department/form'));
    expect(req.request.params.get('mode')).toBe('create');
    expect(req.request.params.get('entityId')).toBe(ENTITY);
    req.flush(ok({ ...def, precheck: def.precheck ?? { canCreate: true, missingSteps: [], missingReferences: [] } }));
    await settle();
  };
  /** types into the province picker and chooses the first option */
  const pickProvince = async () => {
    control('จังหวัด').dispatchEvent(new Event('focus'));
    await settle();
    const opts = http.expectOne(url('/master-tables/department/fields/province/options'));
    expect(opts.request.params.get('entityId')).toBe(ENTITY);
    expect(opts.request.params.get('section')).toBe('main');
    expect(opts.request.params.get('perPage')).toBe('20');
    expect(opts.request.params.has('selected')).toBe(false);
    opts.flush(ok([{ id: PROVINCE, code: 'P10', name: 'กรุงเทพฯ' }], { page: 1, perPage: 20, total: 1, totalPages: 1 }));
    await settle();
    const li = el.querySelector<HTMLElement>('.ref-list li[role=option]')!;
    expect(li.textContent).toBe('P10 · กรุงเทพฯ');
    li.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }));
    await settle();
  };

  afterEach(() => http.verify());

  describe('create', () => {
    it('draws the fields the API sent, in its order, with the defaults, and nothing is written yet', async () => {
      await loadCreate();
      expect(Array.from(el.querySelectorAll('.mf-label')).map((n) => n.textContent!.replace(/\s+/g, ' ').trim())).toEqual(['รหัส *', 'ชื่อ *', 'สถานะ *', 'จังหวัด *', 'หมายเหตุ']);
      expect(el.querySelector('h2')!.textContent).toBe('app.settings.form.titleCreate|หน่วยงาน');
      expect(el.querySelector('.seg-o.on')!.textContent).toBe('release'); // the default of the segment
      expect(el.querySelector('input[maxlength="20"]')).toBeTruthy(); // maxLength is the one the server checks
      // mockup v30: no helper text and no character counter under the fields (maxlength is still enforced on the textarea)
      expect(el.querySelector('.ctr, .hint')).toBeNull();
      expect(el.textContent).not.toContain('ห้ามซ้ำภายในนิติบุคคลเดียวกัน'); // the server's field.hint is not drawn
      expect(el.querySelector('textarea')!.getAttribute('maxlength')).toBe('250');
      http.expectNone((r) => r.method !== 'GET');
    });

    it('main data and each item table are tabs (one open at a time); a field that is wrong in another tab opens that tab', async () => {
      await loadCreate();
      const tabs = () => Array.from(el.querySelectorAll<HTMLElement>('.mtab'));
      const pane = (i: number) => el.querySelectorAll<HTMLElement>('.mf-pane')[i];
      expect(tabs().map((t) => t.textContent!.trim())).toEqual(['app.settings.form.tabMain', 'สาขา']);
      expect(el.querySelector('.mf-mode')).toBeNull(); // only the view form says "view only"
      expect(pane(0).hidden).toBe(false);
      expect(pane(1).hidden).toBe(true);

      tabs()[1].click();
      await settle();
      expect(tabs()[1].getAttribute('aria-selected')).toBe('true');
      expect(pane(0).hidden).toBe(true);
      expect(pane(1).hidden).toBe(false);

      // fill the main tab, add an item row and leave its required branch empty → saving opens the branch tab and marks it
      tabs()[0].click();
      await settle();
      await type('รหัส', 'D01');
      await type('ชื่อ', 'ขาย');
      await pickProvince();
      button('app.settings.form.addRow').click();
      await settle();
      button('app.settings.form.save').click();
      await settle();
      http.expectNone((r) => r.method === 'POST');
      expect(tabs()[1].getAttribute('aria-selected')).toBe('true');
      expect(tabs()[1].classList.contains('bad')).toBe(true);
      expect(tabs()[0].classList.contains('bad')).toBe(false);
      // the first wrong field (the branch picker) got the focus, so it opens its list
      http.expectOne(url('/master-tables/department/fields/branchid/options')).flush(ok([], { page: 1, perPage: 20, total: 0, totalPages: 1 }));
    });

    it('saves: validates the required fields locally, then POSTs the values and the item rows, and tells the page', async () => {
      await loadCreate();
      await type('รหัส', 'D01');
      await type('ชื่อ', 'ขาย');
      await pickProvince();

      button('app.settings.form.addRow').click(); // a row of the item tab
      await settle();
      control('สาขา').dispatchEvent(new Event('focus'));
      await settle();
      const opts = http.expectOne(url('/master-tables/department/fields/branchid/options'));
      expect(opts.request.params.get('section')).toBe('branches'); // the item tab is named, so the API looks at the right field
      opts.flush(ok([{ id: BRANCH, code: 'B01', name: 'ลาดพร้าว' }], { page: 1, perPage: 20, total: 1, totalPages: 1 }));
      await settle();
      el.querySelector<HTMLElement>('.mf-row .ref-list li[role=option]')!.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }));
      await settle();
      el.querySelector<HTMLInputElement>('.mf-row input[type=checkbox]')!.click();
      await settle();

      button('app.settings.form.save').click();
      await settle();
      const post = http.expectOne((r) => r.method === 'POST' && r.url === `${MASTER}/master-tables/department/records`);
      expect(post.request.body).toEqual({
        entityId: ENTITY,
        values: { code: 'D01', name: 'ขาย', usagestatus: 'release', province: PROVINCE, note: null },
        items: { branches: [{ branchid: BRANCH, is_main: true }] },
      });
      post.flush(ok({ id: ROW }), { status: 201, statusText: 'Created' });
      await settle();
      expect(saved).toEqual([{ id: ROW, mode: 'create', code: 'D01' }]);
    });

    it('a "radio" control is real radio buttons side by side (mockup v33) — a "segment" stays the split button — and the chosen option is what is saved', async () => {
      const def = DEF({
        sections: [
          { key: 'main', kind: 'main', title: 'ข้อมูลหลัก', fields: [...FIELDS, f({ field: 'allbranch', label: 'ทุกสาขาหรือไม่', control: 'radio', type: 'boolean', options: [{ value: 'Y', text: 'Yes' }, { value: 'N', text: 'No' }] })] },
          DEF().sections[1],
        ],
      });
      await loadCreate(def);
      const radios = () => Array.from(field('ทุกสาขาหรือไม่').querySelectorAll<HTMLInputElement>('.radios input[type=radio]'));
      expect(radios().map((r) => r.value)).toEqual(['Y', 'N']);
      expect(Array.from(field('ทุกสาขาหรือไม่').querySelectorAll('.radios label')).map((l) => l.textContent!.trim())).toEqual(['Yes', 'No']);
      expect(radios().some((r) => r.checked)).toBe(false);
      expect(new Set(radios().map((r) => r.name)).size).toBe(1); // one group: choosing one clears the other
      expect(field('ทุกสาขาหรือไม่').querySelector('.seg')).toBeNull();
      expect(field('สถานะ').querySelector('.seg')).toBeTruthy(); // the status field is still the segmented button
      radios()[1].click();
      await settle();
      expect(radios().map((r) => r.checked)).toEqual([false, true]);

      await type('รหัส', 'D01');
      await type('ชื่อ', 'ขาย');
      await pickProvince();
      button('app.settings.form.save').click();
      await settle();
      const post = http.expectOne((r) => r.method === 'POST');
      expect((post.request.body as { values: Record<string, unknown> }).values['allbranch']).toBe('N');
      post.flush(ok({ id: ROW }), { status: 201, statusText: 'Created' });
    });

    it('does not call the service while a required field is empty: it says which, under the field', async () => {
      await loadCreate();
      button('app.settings.form.save').click();
      await settle();
      http.expectNone((r) => r.method === 'POST');
      expect(field('รหัส').querySelector('.msg')!.textContent).toBe('app.settings.fe.required|รหัส');
      expect(field('จังหวัด').querySelector('.msg')!.textContent).toBe('app.settings.fe.required|จังหวัด');
      expect(el.querySelector('.mf-note.err')!.textContent).toContain('app.settings.form.checkFields|3');
      await type('รหัส', 'D01'); // fixing a field clears its own message
      expect(field('รหัส').querySelector('.msg')).toBeNull();
      expect(saved).toEqual([]);
    });

    it('a 422 puts each message under the field it names (and keeps the form open with what was typed)', async () => {
      await loadCreate();
      await type('รหัส', 'D01');
      await type('ชื่อ', 'ขาย');
      await pickProvince();
      button('app.settings.form.save').click();
      await settle();
      http.expectOne((r) => r.method === 'POST').flush(
        err(422, 'VALIDATION_ERROR', 'Validation failed', [
          { field: 'values.code', message: 'already exists' },
          { field: 'values.name', message: 'too long (max 5)' },
          { field: 'entityId', message: 'must not be null' },
        ]),
        { status: 422, statusText: 'Unprocessable Entity' },
      );
      await settle();
      expect(field('รหัส').querySelector('.msg')!.textContent).toBe('app.settings.fe.exists|รหัส');
      expect(field('ชื่อ').querySelector('.msg')!.textContent).toBe('app.settings.fe.tooLong|ชื่อ|5');
      expect(el.querySelector('.mf-note.err')!.textContent).toContain('app.settings.form.checkFields|2');
      expect(el.querySelector('.mf-note.err')!.textContent).toContain('must not be null'); // not tied to a field: shown as it is
      expect(control('รหัส').value).toBe('D01');
      expect(saved).toEqual([]);
      expect((button('app.settings.form.save') as HTMLButtonElement).disabled).toBe(false); // can fix and save again
    });

    it('a refusal of the whole request is explained at the top (here: a step to finish first)', async () => {
      await loadCreate();
      await type('รหัส', 'D01');
      await type('ชื่อ', 'ขาย');
      await pickProvince();
      button('app.settings.form.save').click();
      await settle();
      http.expectOne((r) => r.method === 'POST').flush(
        err(409, 'PREREQUISITE_NOT_MET', 'Prerequisite setup steps are not complete', [{ field: 'entity', message: 'นิติบุคคล' }]),
        { status: 409, statusText: 'Conflict' },
      );
      await settle();
      expect(el.querySelector('.mf-note.err')!.textContent).toContain('app.settings.err.prereq|นิติบุคคล');
      expect(saved).toEqual([]);
    });

    it('cannot create because a step is unfinished: shows the step instead of the form, with a link to it', async () => {
      await loadCreate(DEF({ precheck: { canCreate: false, missingSteps: [{ stepKey: 'branch', title: 'สาขา' }], missingReferences: [] } }));
      expect(el.querySelector('.mf-grid')).toBeNull();
      expect(el.querySelector('.mf-note.warn')!.textContent).toContain('app.settings.create.needSteps');
      expect(button('app.settings.form.save')).toBeUndefined(); // only "close"
      el.querySelector<HTMLButtonElement>('.mf-note .go-i')!.click();
      expect(steps).toEqual(['branch']);
    });

    it('explains a table that is not open for writing and a role that can only view', async () => {
      await loadCreate(DEF({ writeEnabled: false }));
      expect(el.querySelector('.mf-note.warn')!.textContent).toContain('app.settings.err.notWritable');
      expect(el.querySelector('.mf-grid')).toBeNull();
      TestBed.resetTestingModule();
      await loadCreate(DEF({ canEdit: false }));
      expect(el.querySelector('.mf-note.warn')!.textContent).toContain('app.settings.create.viewOnly');
    });

    it('a Master that is missing from the data it points to is only a warning: the form still opens', async () => {
      await loadCreate(DEF({ precheck: { canCreate: true, missingSteps: [], missingReferences: [{ tableKey: 'province', title: 'จังหวัด' }] } }));
      expect(el.querySelector('.mf-note.warn')!.textContent).toContain('app.settings.create.needRefs|จังหวัด');
      expect(el.querySelector('.mf-grid')).toBeTruthy();
    });

    it('a form that cannot load says why and can be retried', async () => {
      open('create');
      await settle();
      http.expectOne(url('/master-tables/department/form')).flush(err(404, 'MASTER_TABLE_NOT_FOUND', 'Master table not found: department'), { status: 404, statusText: 'Not Found' });
      await settle();
      expect(el.querySelector('.mf-note.err')!.textContent).toContain('app.settings.err.tableNotFound');
      button('app.settings.live.retry').click();
      await settle();
      http.expectOne(url('/master-tables/department/form')).flush(ok(DEF({ precheck: { canCreate: true, missingSteps: [], missingReferences: [] } })));
      await settle();
      expect(el.querySelector('.mf-grid')).toBeTruthy();
    });

    it('it is a page (no Escape, no ✕): "cancel" leaves at once when nothing was typed, and asks to confirm when something was', async () => {
      await loadCreate();
      document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
      expect(closed).toBe(0);
      expect(el.querySelector('.mf-x')).toBeNull();
      button('app.settings.form.cancel').click(); // nothing typed
      expect(closed).toBe(1);

      await type('รหัส', 'D01');
      button('app.settings.form.cancel').click();
      await settle();
      expect(closed).toBe(1); // asks first
      expect(el.querySelector('.mf-confirm h2')!.textContent).toBe('app.settings.discard.title');
      expect(el.querySelector('.pg-crumb b')!.textContent).toBe('app.settings.page.curDiscard');
      expect(el.querySelector<HTMLElement>('.mf-dialog:not(.mf-confirm)')!.hidden).toBe(true); // the form stays behind, with what was typed
      button('app.settings.discard.stay').click();
      await settle();
      expect(el.querySelector('.mf-confirm')).toBeNull();
      expect(control('รหัส').value).toBe('D01');

      el.querySelector<HTMLButtonElement>('.pg-back')!.click(); // the breadcrumb's back link asks the same
      await settle();
      expect(el.querySelector('.mf-confirm')).toBeTruthy();
      button('app.settings.discard.drop').click();
      expect(closed).toBe(2);
    });

    it('a field that is typed and then put back as it was is not "changed" (no confirmation)', async () => {
      await loadCreate();
      await type('รหัส', 'D01');
      await type('รหัส', '');
      button('app.settings.form.cancel').click();
      expect(closed).toBe(1);
    });

    it('under a picker whose Master has no release row yet: says so, with a link to the step that creates it (or who to ask)', async () => {
      const missing = DEF({ precheck: { canCreate: true, missingSteps: [], missingReferences: [{ tableKey: 'province', title: 'จังหวัด' }] } });
      open('create');
      fixture.componentRef.setInput('refStep', (t: string) => (t === 'province' ? 'geo' : null));
      await settle();
      http.expectOne(url('/master-tables/department/form')).flush(ok(missing));
      await settle();
      const hint = field('จังหวัด').closest('.mf-cell')!.querySelector('.fhint')!;
      expect(hint.textContent).toContain('app.settings.form.refHint|จังหวัด');
      hint.querySelector<HTMLButtonElement>('button')!.click();
      expect(steps).toEqual(['geo']);

      TestBed.resetTestingModule();
      await loadCreate(missing); // no step the user may enter
      const ask = field('จังหวัด').closest('.mf-cell')!.querySelector('.fhint')!;
      expect(ask.querySelector('button')).toBeNull();
      expect(ask.textContent).toContain('app.settings.form.refAsk');
      expect(field('รหัส').closest('.mf-cell')!.querySelector('.fhint')).toBeNull(); // only the picker of that Master
    });
  });

  describe('copy as new', () => {
    /** the real Masters mark their one unique code with `format: 'code'` */
    const COPY_DEF = DEF({
      sections: [{ key: 'main', kind: 'main', title: 'ข้อมูลหลัก', fields: FIELDS.map((x) => (x.field === 'code' ? { ...x, format: 'code' } : x)) }, DEF().sections[1]],
    });
    const SOURCE: ApiRecord = { ...RECORD, values: { ...RECORD.values, usagestatus: 'release' } };

    /** the button on a row opens the create form with `copyFrom` = that row: the create form + the row to copy are read together */
    const loadCopy = async () => {
      open('create', null, ROW);
      await settle();
      const form = http.expectOne(url('/master-tables/department/form'));
      expect(form.request.params.get('mode')).toBe('create'); // same checks as a new record (role · steps · open for writing)
      expect(form.request.params.get('entityId')).toBe(ENTITY);
      const rec = http.expectOne(url(`/master-tables/department/records/${ROW}`));
      expect(rec.request.params.get('entityId')).toBe(ENTITY);
      form.flush(ok({ ...COPY_DEF, precheck: { canCreate: true, missingSteps: [], missingReferences: [] } }));
      rec.flush(ok(SOURCE));
      await settle();
      for (const [field, section, id, label] of [
        ['province', 'main', PROVINCE, { code: 'P10', name: 'กรุงเทพฯ' }],
        ['branchid', 'branches', BRANCH, { code: 'B01', name: 'ลาดพร้าว' }],
      ] as const) {
        const o = http.expectOne((r) => r.url === `${MASTER}/master-tables/department/fields/${field}/options`);
        expect(o.request.params.get('selected')).toBe(id);
        expect(o.request.params.get('section')).toBe(section);
        o.flush(ok([{ id, ...label }], { page: 1, perPage: 1, total: 1, totalPages: 1 }));
      }
      await settle();
    };

    it('is the create form filled with the original: everything the user fills is copied, the code is left empty, the status is draft', async () => {
      await loadCopy();
      expect(el.querySelector('h2')!.textContent).toBe('app.settings.form.titleCreate|หน่วยงาน'); // mockup v33: a copy is titled like a new record …
      expect(el.querySelector('.mf-sub')!.textContent).toBe('app.settings.form.copyFrom|D01'); // … with "copied from <code>" under the title
      expect(el.querySelector('.pg-crumb b')!.textContent).toBe('app.settings.page.curCopy');
      expect(control('รหัส').value).toBe(''); // the code must not repeat — the user types a new one
      expect(control('ชื่อ').value).toBe('ขาย (สำเนา)'); // mockup v33: the name of a copy ends with " (สำเนา)"
      expect(el.querySelector('.seg-o.on')!.textContent).toBe('draft'); // the original is release
      expect(control('จังหวัด').value).toBe('P10 · กรุงเทพฯ');
      expect(el.querySelectorAll('.mf-row').length).toBe(1);
      expect(el.querySelector<HTMLInputElement>('.mf-row .ref input')!.value).toBe('B01 · ลาดพร้าว');
      expect(el.querySelector<HTMLInputElement>('.mf-row input[type=checkbox]')!.checked).toBe(true);
      expect(Array.from(el.querySelectorAll<HTMLInputElement>('.mf-body input')).every((i) => !i.disabled)).toBe(true); // it is a form to fill, not a view
    });

    it('says where the values come from only as the line under the title (the mockup has no banner)', async () => {
      await loadCopy();
      expect(el.querySelector('.mf-sub')!.textContent).toBe('app.settings.form.copyFrom|D01');
      expect(el.querySelector('.mf-note.info')).toBeNull();
    });

    it('saves a NEW record: POST of the copied values + item rows with the new code — no id, no PUT, the original is never written', async () => {
      await loadCopy();
      button('app.settings.form.save').click(); // the code is still empty
      await settle();
      http.expectNone((r) => r.method === 'POST');
      expect(field('รหัส').querySelector('.msg')!.textContent).toBe('app.settings.fe.required|รหัส');

      await type('รหัส', 'D02');
      button('app.settings.form.save').click();
      await settle();
      const post = http.expectOne((r) => r.method === 'POST' && r.url === `${MASTER}/master-tables/department/records`);
      expect(post.request.body).toEqual({
        entityId: ENTITY,
        values: { code: 'D02', name: 'ขาย (สำเนา)', usagestatus: 'draft', province: PROVINCE, note: null },
        items: { branches: [{ branchid: BRANCH, is_main: true }] },
      });
      post.flush(ok({ id: 'new-row' }), { status: 201, statusText: 'Created' });
      await settle();
      expect(saved).toEqual([{ id: 'new-row', mode: 'create', code: 'D02' }]);
      http.expectNone((r) => r.method === 'PUT' || r.method === 'DELETE' || r.url.endsWith(`/records/${ROW}`));
    });

    it('a code that is already taken comes back as a 422 under the code (the form stays open with the copy)', async () => {
      await loadCopy();
      await type('รหัส', 'D01'); // the original's code
      button('app.settings.form.save').click();
      await settle();
      http
        .expectOne((r) => r.method === 'POST')
        .flush(err(422, 'VALIDATION_ERROR', 'Validation failed', [{ field: 'values.code', message: 'already exists' }]), { status: 422, statusText: 'Unprocessable Entity' });
      await settle();
      expect(field('รหัส').querySelector('.msg')!.textContent).toBe('app.settings.fe.exists|รหัส');
      expect(el.querySelector('.mf-note.err')!.textContent).toContain('app.settings.form.dupTitle|D01|หน่วยงาน'); // the duplicate-code banner of the mockup, not the generic "check N fields"
      expect(el.querySelector('.mf-note.err')!.textContent).not.toContain('app.settings.form.checkFields');
      expect(control('รหัส').value).toBe('D01');
      expect(control('ชื่อ').value).toBe('ขาย (สำเนา)');
      expect(saved).toEqual([]);
    });

    it('"cancel" leaves at once while nothing was changed on the copy, and asks to confirm once something was', async () => {
      await loadCopy();
      button('app.settings.form.cancel').click();
      expect(closed).toBe(1);
      await type('ชื่อ', 'ขายปลีก');
      button('app.settings.form.cancel').click();
      await settle();
      expect(closed).toBe(1);
      expect(el.querySelector('.mf-confirm')).toBeTruthy();
    });

    it('cannot create (a step is unfinished): shows the step, not the copy — the same checks as "create"', async () => {
      open('create', null, ROW);
      await settle();
      http.expectOne(url('/master-tables/department/form')).flush(ok({ ...COPY_DEF, precheck: { canCreate: false, missingSteps: [{ stepKey: 's1', title: 'ตั้งค่าองค์กร' }], missingReferences: [] } }));
      http.expectOne(url(`/master-tables/department/records/${ROW}`)).flush(ok(SOURCE));
      await settle();
      expect(el.querySelector('.mf-note.warn')!.textContent).toContain('app.settings.create.needSteps');
      expect(el.querySelector('.mf-note.info')).toBeNull();
      expect(el.querySelector('.mf-grid')).toBeNull();
    });

    it('the original is gone (404): says so, and can be retried', async () => {
      open('create', null, ROW);
      await settle();
      http.expectOne(url('/master-tables/department/form')).flush(ok({ ...COPY_DEF, precheck: { canCreate: true, missingSteps: [], missingReferences: [] } }));
      http.expectOne(url(`/master-tables/department/records/${ROW}`)).flush(err(404, 'RECORD_NOT_FOUND', 'Record not found'), { status: 404, statusText: 'Not Found' });
      await settle();
      expect(el.querySelector('.mf-note.err')).toBeTruthy();
      expect(el.querySelector('.mf-grid')).toBeNull();
    });

    it('a plain "create" is unchanged: no row is read, no copy note', async () => {
      await loadCreate(); // http.verify() fails if a record had been requested
      expect(el.querySelector('.mf-note.info')).toBeNull();
      expect(el.querySelector('h2')!.textContent).toBe('app.settings.form.titleCreate|หน่วยงาน');
    });
  });

  describe('edit and view', () => {
    const load = async (mode: 'edit' | 'view', def: Partial<ApiFormDef> = {}, usage: object | 'fail' = USAGE0) => {
      open(mode, ROW);
      await settle();
      const form = http.expectOne(url('/master-tables/department/form'));
      expect(form.request.params.get('mode')).toBe(mode);
      expect(form.request.params.get('entityId')).toBe(ENTITY); // every mode sends it: create checks the prerequisites, edit/view show the entity in the system fields
      const rec = http.expectOne(url(`/master-tables/department/records/${ROW}`));
      expect(rec.request.params.get('entityId')).toBe(ENTITY);
      form.flush(ok(DEF({ mode, ...def })));
      rec.flush(ok(RECORD));
      await flushUsage(usage);
      // the stored value of a reference is an id: the label comes from the options, with that id pinned first
      for (const [field, section, id, label] of [
        ['province', 'main', PROVINCE, { code: 'P10', name: 'กรุงเทพฯ' }],
        ['branchid', 'branches', BRANCH, { code: 'B01', name: 'ลาดพร้าว' }],
      ] as const) {
        const o = http.expectOne((r) => r.url === `${MASTER}/master-tables/department/fields/${field}/options`);
        expect(o.request.params.get('selected')).toBe(id);
        expect(o.request.params.get('perPage')).toBe('1');
        expect(o.request.params.get('section')).toBe(section);
        o.flush(ok([{ id, ...label }], { page: 1, perPage: 1, total: 1, totalPages: 1 }));
      }
      await settle();
    };

    it('edit: fills the form from the row (with the label of each reference), and saves with PUT', async () => {
      await load('edit');
      expect(el.querySelector('h2')!.textContent).toBe('D01 · ขาย'); // mockup v30: the card is titled with the row, the table code is the chip beside it
      expect(control('รหัส').value).toBe('D01');
      expect(control('ชื่อ').value).toBe('ขาย');
      expect(el.querySelector('.seg-o.on')!.textContent).toBe('draft');
      expect(control('จังหวัด').value).toBe('P10 · กรุงเทพฯ');
      expect(el.querySelectorAll('.mf-row').length).toBe(1);
      expect(el.querySelector<HTMLInputElement>('.mf-row .ref input')!.value).toBe('B01 · ลาดพร้าว');
      expect(el.querySelector<HTMLInputElement>('.mf-row input[type=checkbox]')!.checked).toBe(true);

      await type('ชื่อ', 'ขายและบริการ');
      button('app.settings.form.save').click();
      await settle();
      const put = http.expectOne((r) => r.method === 'PUT' && r.url === `${MASTER}/master-tables/department/records/${ROW}`);
      expect(put.request.body).toEqual({
        entityId: ENTITY,
        values: { code: 'D01', name: 'ขายและบริการ', usagestatus: 'draft', province: PROVINCE, note: null },
        items: { branches: [{ branchid: BRANCH, is_main: true }] },
      });
      put.flush(ok({ id: ROW }));
      await settle();
      expect(saved).toEqual([{ id: ROW, mode: 'edit', code: 'D01' }]);
    });

    it('edit: a row of the item tab can be removed (the PUT then replaces the tab with what is left)', async () => {
      await load('edit');
      el.querySelector<HTMLButtonElement>('.mf-rm')!.click();
      await settle();
      expect(el.querySelectorAll('.mf-row').length).toBe(0);
      button('app.settings.form.save').click();
      await settle();
      const put = http.expectOne((r) => r.method === 'PUT');
      expect((put.request.body as { items: unknown }).items).toEqual({ branches: [] });
      put.flush(ok({ id: ROW }));
    });

    it('view: nothing can be changed and there is no save', async () => {
      await load('view');
      expect(el.querySelector('h2')!.textContent).toBe('D01 · ขาย');
      expect(Array.from(el.querySelectorAll<HTMLInputElement>('.mf-body input')).every((i) => i.disabled)).toBe(true);
      expect(el.querySelector<HTMLButtonElement>('.seg-o')!.disabled).toBe(true);
      expect(button('app.settings.form.save')).toBeUndefined();
      expect(button('app.settings.form.addRow')).toBeUndefined();
      expect(el.querySelector('.mf-rm')).toBeNull();
      expect(el.querySelector('.mf-mode')).toBeTruthy(); // "view only" badge in the header
    });

    it('view: the "edit" button asks the page to switch to editing — only when the role may edit and the table is open for writing', async () => {
      await load('view');
      let edits = 0;
      fixture.componentInstance.edit.subscribe(() => edits++);
      button('app.settings.edit').click();
      expect(edits).toBe(1);
      TestBed.resetTestingModule();
      await load('view', { canEdit: false });
      expect(button('app.settings.edit')).toBeUndefined();
      TestBed.resetTestingModule();
      await load('view', { writeEnabled: false });
      expect(button('app.settings.edit')).toBeUndefined();
    });

    it('edit by a role that can only view, or of a table not open for writing: opens read-only with the reason', async () => {
      await load('edit', { canEdit: false });
      expect(el.querySelector('.mf-note.warn')!.textContent).toContain('app.settings.create.viewOnly');
      expect(button('app.settings.form.save')).toBeUndefined();
    });

    it('the row is not there any more (404): says so', async () => {
      open('edit', ROW);
      await settle();
      http.expectOne(url('/master-tables/department/form')).flush(ok(DEF({ mode: 'edit' })));
      http.expectOne(url(`/master-tables/department/records/${ROW}`)).flush(err(404, 'RECORD_NOT_FOUND', 'Record not found'), { status: 404, statusText: 'Not Found' });
      await settle();
      expect(el.querySelector('.mf-note.err')!.textContent).toContain('app.settings.err.recordNotFound');
    });
  });

  describe('mockup v33 details: copy from the view, "ใช้อยู่ใน", block note, the delete page', () => {
    const USED = {
      total: 8,
      items: [
        { table: 'salegroup', title: 'กลุ่มการขาย', id: 'u1', code: 'SG1', name: 'กลุ่ม 1' },
        { table: 'employee', title: 'พนักงาน', id: 'u2', code: 'EMP1', name: null },
        ...Array.from({ length: 6 }, (_, i) => ({ table: 'saleperson', title: 'พนักงานขาย', id: `p${i}`, code: `SP${i}`, name: `คน ${i}` })),
      ],
    };
    /** a status control that offers block (the plain FIELDS only offer release / draft) */
    const BLOCKABLE: Partial<ApiFormDef> = {
      sections: [
        { ...DEF().sections[0], fields: FIELDS.map((x) => (x.field === 'usagestatus' ? { ...x, options: [{ value: 'release', text: 'release' }, { value: 'draft', text: 'draft' }, { value: 'block', text: 'block' }] } : x)) },
        DEF().sections[1],
      ],
    };
    const tabTitles = () => Array.from(el.querySelectorAll('.mtab')).map((n) => n.textContent!.trim());
    const seg = (text: string) => Array.from(el.querySelectorAll<HTMLButtonElement>('.seg-o')).find((b) => b.textContent!.trim() === text)!;
    const loadView = async (def: Partial<ApiFormDef> = {}, usage: object | 'fail' = USAGE0, mode: 'view' | 'edit' = 'view') => {
      open(mode, ROW);
      await settle();
      const form = http.expectOne(url('/master-tables/department/form'));
      const rec = http.expectOne(url(`/master-tables/department/records/${ROW}`));
      form.flush(ok(DEF({ mode, ...def })));
      rec.flush(ok(RECORD));
      await flushUsage(usage);
      for (const [fieldKey, section, id, label] of [['province', 'main', PROVINCE, { code: 'P10', name: 'กรุงเทพฯ' }], ['branchid', 'branches', BRANCH, { code: 'B01', name: 'ลาดพร้าว' }]] as const) {
        http.expectOne((r) => r.url === `${MASTER}/master-tables/department/fields/${fieldKey}/options` && r.params.get('section') === section).flush(ok([{ id, ...label }], { page: 1, perPage: 1, total: 1, totalPages: 1 }));
      }
      await settle();
    };

    it('view: "คัดลอก" sits beside "แก้ไข" (ปิด · คัดลอก · แก้ไข) and asks the page to copy this row', async () => {
      await loadView({ canEdit: true, writeEnabled: true });
      const labels = Array.from(el.querySelectorAll('.mf-act button')).map((b) => b.textContent!.trim());
      expect(labels).toEqual(['app.settings.form.close', 'app.settings.form.copy', 'app.settings.edit']);
      button('app.settings.form.copy').click();
      expect(copies).toBe(1);
    });

    it('view by a role that may not edit has no "คัดลอก" (it would open a form it cannot save)', async () => {
      await loadView({ canEdit: false });
      expect(button('app.settings.form.copy')).toBeUndefined();
    });

    it('edit / view: the last tab is "ใช้อยู่ใน" — the rows of other Masters that point to this one, 12 at most', async () => {
      await loadView({}, USED);
      expect(tabTitles()).toEqual(['app.settings.form.tabMain', 'สาขา', 'app.settings.form.tabUsed']);
      Array.from(el.querySelectorAll<HTMLButtonElement>('.mtab'))[2].click();
      await settle();
      const pane = Array.from(el.querySelectorAll<HTMLElement>('.mf-pane')).find((p) => !p.hidden)!;
      const chips = Array.from(pane.querySelectorAll('.used span')).map((n) => n.textContent!.trim());
      expect(chips.slice(0, 2)).toEqual(['กลุ่มการขาย · SG1 กลุ่ม 1', 'พนักงาน · EMP1']);
      expect(chips.length).toBe(8);
    });

    it('"ใช้อยู่ใน" of a row nobody uses says so; when the question cannot be answered there is no such tab and the form still works', async () => {
      await loadView();
      Array.from(el.querySelectorAll<HTMLButtonElement>('.mtab'))[2].click();
      await settle();
      expect(el.querySelector('.used-empty')!.textContent).toBe('app.settings.form.usedNone');
    });

    it('no "ใช้อยู่ใน" tab when the usage cannot be read (the form is not broken by it)', async () => {
      await loadView({}, 'fail');
      expect(tabTitles()).toEqual(['app.settings.form.tabMain', 'สาขา']);
      expect(control('รหัส').value).toBe('D01');
    });

    it('a new record has no "ใช้อยู่ใน" tab and never asks for it', async () => {
      await loadCreate(); // http.verify() fails if usage had been requested
      expect(tabTitles()).toEqual(['app.settings.form.tabMain', 'สาขา']);
    });

    it('edit: choosing block for a row that is used says it will no longer be selectable, and takes the note away when put back', async () => {
      await loadView(BLOCKABLE, USED, 'edit');
      expect(el.querySelector('.fnote')).toBeNull();
      seg('block').click();
      await settle();
      expect(el.querySelector('.fnote')!.textContent).toBe('app.settings.form.blockNote|8');
      seg('release').click();
      await settle();
      expect(el.querySelector('.fnote')).toBeNull();
    });

    it('edit: no block note for a row nobody uses', async () => {
      await loadView(BLOCKABLE, USAGE0, 'edit');
      seg('block').click();
      await settle();
      expect(el.querySelector('.fnote')).toBeNull();
    });

    /* ── the delete page ── */
    const loadDelete = async (usage: object | 'fail' = USAGE0, def: Partial<ApiFormDef> = {}, record: ApiRecord = RECORD) => {
      open('edit', ROW, null, 'delete');
      await settle();
      const form = http.expectOne(url('/master-tables/department/form'));
      expect(form.request.params.get('mode')).toBe('edit'); // "edit" so the form says whether this role may change the table
      const rec = http.expectOne(url(`/master-tables/department/records/${ROW}`));
      form.flush(ok(DEF({ mode: 'edit', ...def })));
      rec.flush(ok(record));
      await flushUsage(usage);
    };
    const actions = () => Array.from(el.querySelectorAll('.mf-act button')).map((b) => b.textContent!.trim());

    it('delete page, row nobody uses: "ลบ code · name", the breadcrumb ends with "ลบ", no tabs, a cancel and a red delete', async () => {
      await loadDelete();
      expect(el.querySelector('h2')!.textContent).toBe('app.settings.delete.pageTitle|D01 · ขาย');
      expect(el.querySelector('.pg-crumb b')!.textContent).toBe('app.settings.page.curDelete');
      expect(el.querySelector('.mf-mode')).toBeNull();
      expect(el.querySelector('.mtab')).toBeNull();
      expect(el.querySelector('.mf-body')!.textContent).toContain('app.settings.delete.body');
      expect(actions()).toEqual(['app.settings.form.cancel', 'app.settings.delete.ok']);
      expect(el.querySelector('.mf-act .mf-danger')!.textContent).toContain('app.settings.delete.ok');
    });

    it('delete page: "ลบ" sends DELETE for that row and entity and tells the page; nothing is sent before', async () => {
      await loadDelete();
      http.expectNone((r) => r.method === 'DELETE');
      button('app.settings.delete.ok').click();
      await settle();
      const del = http.expectOne((r) => r.method === 'DELETE' && r.url === `${MASTER}/master-tables/department/records/${ROW}`);
      expect(del.request.params.get('entityId')).toBe(ENTITY);
      del.flush(ok({ id: ROW }));
      await settle();
      expect(deleted).toEqual([{ id: ROW, code: 'D01' }]);
    });

    it('delete page, row that is used: "ลบไม่ได้ ใช้อยู่ใน N รายการ" with the first 6 users, and only "เปลี่ยนเป็น block" is offered', async () => {
      await loadDelete(USED);
      expect(el.querySelector('.del-no')!.textContent).toBe('app.settings.delete.inUse|8');
      expect(Array.from(el.querySelectorAll('.used span')).map((n) => n.textContent!.trim()).slice(0, 2)).toEqual(['กลุ่มการขาย · SG1 กลุ่ม 1', 'พนักงาน · EMP1']);
      expect(el.querySelectorAll('.used span').length).toBe(6);
      expect(actions()).toEqual(['app.settings.form.cancel', 'app.settings.delete.toBlock']);
    });

    it('delete page: "เปลี่ยนเป็น block" PUTs the row as it is with the status block — no item tabs are sent, so none is touched', async () => {
      await loadDelete(USED);
      button('app.settings.delete.toBlock').click();
      await settle();
      const put = http.expectOne((r) => r.method === 'PUT' && r.url === `${MASTER}/master-tables/department/records/${ROW}`);
      expect(put.request.body).toEqual({ entityId: ENTITY, values: { code: 'D01', name: 'ขาย', usagestatus: 'block', province: PROVINCE, note: null } });
      put.flush(ok({ id: ROW }));
      await settle();
      expect(toBlocked).toEqual([{ id: ROW, code: 'D01' }]);
      expect(deleted).toEqual([]);
    });

    it('delete page, row that is used and already block: nothing to offer but "ยกเลิก"', async () => {
      await loadDelete(USED, {}, { ...RECORD, values: { ...RECORD.values, usagestatus: 'block' } });
      expect(actions()).toEqual(['app.settings.form.cancel']);
    });

    it('delete page: a refusal (here the database says the row is still referenced, 409) is shown on the page and the row stays', async () => {
      await loadDelete();
      button('app.settings.delete.ok').click();
      await settle();
      http.expectOne((r) => r.method === 'DELETE').flush(err(409, 'RECORD_IN_USE', 'This record is in use by other records and cannot be deleted'), { status: 409, statusText: 'Conflict' });
      await settle();
      expect(el.querySelector('.mf-note.err')!.textContent).toContain('app.settings.err.inUse (HTTP 409)');
      expect(deleted).toEqual([]);
      expect((button('app.settings.delete.ok') as HTMLButtonElement).disabled).toBe(false);
    });

    it('delete page: a role that may not edit sees why and has no delete / block button', async () => {
      await loadDelete(USED, { canEdit: false });
      expect(el.querySelector('.mf-note.warn')!.textContent).toContain('app.settings.create.viewOnly');
      expect(actions()).toEqual(['app.settings.form.cancel']);
    });

    it('delete page: "ยกเลิก" leaves at once and asks nothing', async () => {
      await loadDelete();
      button('app.settings.form.cancel').click();
      expect(closed).toBe(1);
      http.expectNone((r) => r.method !== 'GET');
    });
  });

  describe('groups (sections) and the read-only system fields', () => {
    const sys = (o: Partial<ApiField> & Pick<ApiField, 'field'>): ApiField => f({ control: 'readonly', type: 'timestamp', ...o });
    const GROUPED = (): ApiFormDef =>
      DEF({
        sections: [
          {
            key: 'main', kind: 'main', title: 'ข้อมูลหลัก',
            groups: [{ seq: 1, title: 'ข้อมูลทั่วไป' }, { seq: 2, title: 'ประวัติ' }, { seq: 3, title: 'นิติบุคคล' }],
            fields: [
              ...FIELDS.map((x) => ({ ...x, group: 1 })),
              sys({ field: 'modify_date', label: 'แก้ไขเมื่อ', system: 'UPDATED_AT', group: 2 }),
              sys({ field: 'create_by', label: 'สร้างโดย', type: 'uuid', system: 'CREATED_BY', group: 2 }),
              sys({ field: 'entitygroupid', label: 'กลุ่มนิติบุคคล', type: 'uuid', system: 'ENTITYGROUP', shown: 'G1 · กลุ่มหนึ่ง', group: 3 }),
              sys({ field: 'businessentityid', label: 'นิติบุคคล', type: 'uuid', system: 'ENTITY_SHARED', group: 3 }),
            ],
          },
          DEF().sections[1],
        ],
      });
    // exact label: "นิติบุคคล" is also a part of "กลุ่มนิติบุคคล"
    const exact = (label: string) => Array.from(el.querySelectorAll<HTMLElement>('.mf-field')).find((n) => n.querySelector('.mf-label')?.textContent?.replace(/\s+/g, ' ').trim() === label)!;
    const sysInput = (label: string) => exact(label).querySelector<HTMLInputElement>('input')!;
    const note = (label: string) => exact(label).querySelector('.sys-note')?.textContent?.trim() ?? null;

    it('create: one card per group (number · title · count), the system-only groups are dashed, every field is one cell of the grid', async () => {
      await loadCreate(GROUPED());
      const cards = Array.from(el.querySelectorAll<HTMLElement>('.mf-grp'));
      expect(cards.map((c) => c.querySelector('.gn')!.textContent!.trim())).toEqual(['1', '2', '3']);
      expect(cards.map((c) => c.querySelector('b')!.textContent!.trim())).toEqual(['ข้อมูลทั่วไป', 'ประวัติ', 'นิติบุคคล']);
      // mockup v33: the count sits at the right of the header, and a system-only group says so right after it ("2 ฟิลด์ · ระบบใส่ให้")
      expect(cards.map((c) => c.querySelector('.gc')!.textContent!.replace(/\s+/g, ' ').trim())).toEqual([
        'app.settings.form.fieldCount|5',
        'app.settings.form.fieldCount|2 app.settings.form.sysGroup',
        'app.settings.form.fieldCount|2 app.settings.form.sysGroup',
      ]);
      expect(cards.map((c) => c.classList.contains('sys'))).toEqual([false, true, true]);
      expect(cards.map((c) => Array.from(c.querySelector('.mf-grp-h')!.children).map((n) => n.className))).toEqual([['gn', '', 'gc'], ['gn', '', 'gc'], ['gn', '', 'gc']]); // number · title · count, nothing else
      // the order inside the cards is the API's order
      expect(Array.from(cards[0].querySelectorAll('.mf-label')).map((n) => n.textContent!.replace(/\s+/g, ' ').trim())).toEqual(['รหัส *', 'ชื่อ *', 'สถานะ *', 'จังหวัด *', 'หมายเหตุ']);
      // mockup v33: a long-text field is one cell like the others (no full-row textarea)
      expect(field('หมายเหตุ').closest('.mf-cell')!.className).toBe('mf-cell');
      expect(field('ชื่อ').closest('.mf-cell')!.className).toBe('mf-cell');
    });

    it('create: the system fields are grey, locked, say who fills them, and have no value yet (the entity ones already show the selected entity)', async () => {
      await loadCreate(GROUPED());
      for (const label of ['แก้ไขเมื่อ', 'สร้างโดย', 'กลุ่มนิติบุคคล', 'นิติบุคคล']) {
        expect(sysInput(label).disabled).toBe(true);
        expect(sysInput(label).classList.contains('sys')).toBe(true);
      }
      expect(sysInput('แก้ไขเมื่อ').value).toBe('');
      expect(sysInput('แก้ไขเมื่อ').placeholder).toBe('app.settings.form.sysPlaceholder');
      expect(note('แก้ไขเมื่อ')).toBe('app.settings.form.sysTime');
      expect(note('สร้างโดย')).toBe('app.settings.form.sysUser');
      expect(sysInput('กลุ่มนิติบุคคล').value).toBe('G1 · กลุ่มหนึ่ง');
      expect(note('กลุ่มนิติบุคคล')).toBe('app.settings.form.sysScope');
      expect(sysInput('นิติบุคคล').value).toBe('app.settings.form.sysShared'); // shared data: used by every entity
      expect(note('นิติบุคคล')).toBeNull();
      expect(exact('แก้ไขเมื่อ').querySelector('.rq')).toBeNull();
    });

    it('the entity system fields carry the required star when the API says so (they are mandatory, filled by the system) and never block a save', async () => {
      const def = GROUPED();
      def.sections[0].fields = def.sections[0].fields.map((x) => (x.system === 'ENTITYGROUP' || x.system === 'ENTITY_SHARED' ? { ...x, required: true } : x));
      await loadCreate(def);
      expect(exact('กลุ่มนิติบุคคล *').querySelector('.rq')).toBeTruthy();
      expect(exact('นิติบุคคล *').querySelector('.rq')).toBeTruthy();
      expect(exact('แก้ไขเมื่อ').querySelector('.rq')).toBeNull();
      await type('รหัส', 'D01');
      await type('ชื่อ', 'ขาย');
      await pickProvince();
      button('app.settings.form.save').click();
      await settle();
      const post = http.expectOne((r) => r.method === 'POST'); // the starred system fields are not "missing"
      expect(Object.keys((post.request.body as { values: object }).values)).toEqual(['code', 'name', 'usagestatus', 'province', 'note']);
      post.flush(ok({ id: ROW }), { status: 201, statusText: 'Created' });
    });

    it('create: saving sends only the fields the user fills — never a system field', async () => {
      await loadCreate(GROUPED());
      await type('รหัส', 'D01');
      await type('ชื่อ', 'ขาย');
      await pickProvince();
      button('app.settings.form.save').click();
      await settle();
      const post = http.expectOne((r) => r.method === 'POST');
      expect(Object.keys((post.request.body as { values: object }).values)).toEqual(['code', 'name', 'usagestatus', 'province', 'note']);
      post.flush(ok({ id: ROW }));
    });

    it('edit / view: the time shows as dd/MM/yyyy HH:mm, the user as stored, and a value the row does not have shows –', async () => {
      open('view', ROW);
      await settle();
      const form = http.expectOne(url('/master-tables/department/form'));
      const rec = http.expectOne(url(`/master-tables/department/records/${ROW}`));
      form.flush(ok({ ...GROUPED(), mode: 'view' }));
      rec.flush(ok({ ...RECORD, system: { modify_date: '2026-11-12T03:04:05Z' } }));
      await flushUsage();
      for (const [fieldKey, section, id, label] of [
        ['province', 'main', PROVINCE, { code: 'P10', name: 'กรุงเทพฯ' }],
        ['branchid', 'branches', BRANCH, { code: 'B01', name: 'ลาดพร้าว' }],
      ] as const) {
        http.expectOne((r) => r.url === `${MASTER}/master-tables/department/fields/${fieldKey}/options` && r.params.get('section') === section).flush(ok([{ id, ...label }], { page: 1, perPage: 1, total: 1, totalPages: 1 }));
      }
      await settle();
      expect(sysInput('แก้ไขเมื่อ').value).toMatch(/^1[12]\/11\/2026 \d{2}:\d{2}$/); // 03:04Z is 12 Nov in UTC and Asia, 11 Nov in the Americas (the test machine's zone)
      expect(sysInput('แก้ไขเมื่อ').placeholder).toBe('');
      expect(sysInput('สร้างโดย').value).toBe('–');
    });

    it('a copy is a new record: it does not show the history of the original (the time is empty, to be filled on save)', async () => {
      open('create', null, ROW);
      await settle();
      const form = http.expectOne(url('/master-tables/department/form'));
      const rec = http.expectOne(url(`/master-tables/department/records/${ROW}`));
      form.flush(ok({ ...GROUPED(), precheck: { canCreate: true, missingSteps: [], missingReferences: [] } }));
      rec.flush(ok({ ...RECORD, system: { modify_date: '2026-11-12T03:04:05Z' } }));
      await settle();
      for (const [fieldKey, section, id, label] of [
        ['province', 'main', PROVINCE, { code: 'P10', name: 'กรุงเทพฯ' }],
        ['branchid', 'branches', BRANCH, { code: 'B01', name: 'ลาดพร้าว' }],
      ] as const) {
        http.expectOne((r) => r.url === `${MASTER}/master-tables/department/fields/${fieldKey}/options` && r.params.get('section') === section).flush(ok([{ id, ...label }], { page: 1, perPage: 1, total: 1, totalPages: 1 }));
      }
      await settle();
      expect(control('ชื่อ').value).toBe('ขาย (สำเนา)'); // it is the copy …
      expect(sysInput('แก้ไขเมื่อ').value).toBe(''); // … without the time the original was last changed
      expect(sysInput('แก้ไขเมื่อ').placeholder).toBe('app.settings.form.sysPlaceholder');
    });

    it('a form without groups (an API with no layout for the Master) is the one flat grid as before', async () => {
      await loadCreate();
      expect(el.querySelector('.mf-grp')).toBeNull();
      expect(el.querySelectorAll('.mf-body .mf-grid').length).toBe(1);
    });
  });
});
