import { describe, expect, it } from 'vitest';
import { ApiField, ApiFormDef, ApiRecord, ApiSection } from '../settings.api';
import { fieldMessage } from './master-form.errors';
import { blankRow, copyName, copyState, defaultValue, dirtyKey, fromServer, groupsOf, initialState, isInput, missingRequired, optionFor, placeErrors, toServer, toWrite } from './master-form.logic';

const f = (o: Partial<ApiField> & Pick<ApiField, 'field'>): ApiField => ({ label: o.field, control: 'text', type: 'text', required: false, ...o });
const YN = [{ value: 'Y', text: 'ใช่' }, { value: 'N', text: 'ไม่ใช่' }];

const MAIN: ApiSection = {
  key: 'main', kind: 'main', title: 'ข้อมูลหลัก',
  fields: [
    f({ field: 'code', label: 'รหัส', required: true, maxLength: 20 }),
    f({ field: 'name', label: 'ชื่อ', required: true }),
    f({ field: 'usagestatus', label: 'สถานะ', control: 'segment', required: true, defaultValue: 'release', options: [{ value: 'release', text: 'release' }, { value: 'draft', text: 'draft' }] }),
    f({ field: 'ratio', label: 'สัดส่วน', control: 'number', type: 'numeric' }),
    f({ field: 'start', label: 'เริ่ม', control: 'date', type: 'date' }),
    f({ field: 'allbranch', label: 'ทุกสาขา', control: 'radio', type: 'boolean', options: YN, defaultValue: 'false' }),
    f({ field: 'use_ref', label: 'ใช้รหัสอ้างอิง', control: 'select', type: 'boolean', options: YN }),
    f({ field: 'main_flag', label: 'หลัก', control: 'checkbox', type: 'boolean', defaultValue: 'true' }),
    f({ field: 'province', label: 'จังหวัด', control: 'reference', type: 'uuid', required: true, reference: { table: 'province', scope: 'SHARED', excludeSelf: false } }),
    f({ field: 'picture', label: 'รูป', control: 'file' }),
  ],
};
const ITEM: ApiSection = {
  key: 'branches', kind: 'item', title: 'สาขาที่สังกัด',
  fields: [
    f({ field: 'branchid', label: 'สาขา', control: 'reference', type: 'uuid', required: true, reference: { table: 'branch', scope: 'ENTITY', excludeSelf: false } }),
    f({ field: 'is_main', label: 'สาขาหลัก', control: 'checkbox', type: 'boolean', defaultValue: 'false' }),
  ],
};
const DEF: ApiFormDef = { table: 'demo', title: 'ตัวอย่าง', mode: 'create', editLevel: 'E', canEdit: true, writeEnabled: true, version: 1, sections: [MAIN, ITEM] };
const field = (key: string) => MAIN.fields.find((x) => x.field === key)!;

describe('master-form.logic — defaults', () => {
  it('uses the default the API sent; a boolean with options maps true/false to the option (Y/N)', () => {
    expect(defaultValue(field('usagestatus'))).toBe('release');
    expect(defaultValue(field('code'))).toBe('');
    expect(defaultValue(field('province'))).toBeNull();
    expect(defaultValue(field('main_flag'))).toBe(true); // checkbox: a real boolean
    expect(defaultValue(field('allbranch'))).toBe('N'); // default 'false' → the option that means false
    expect(defaultValue(field('use_ref'))).toBe(''); // no default: the user chooses
    expect(defaultValue(field('picture'))).toBeNull();
  });

  it('optionFor understands Y/yes/true and N/no/false in any case', () => {
    expect(optionFor(f({ field: 'x', options: [{ value: 'yes', text: '' }, { value: 'No', text: '' }] }), true)).toBe('yes');
    expect(optionFor(f({ field: 'x', options: [{ value: 'yes', text: '' }, { value: 'No', text: '' }] }), false)).toBe('No');
    expect(optionFor(f({ field: 'x', options: [{ value: 'A', text: '' }] }), true)).toBeNull();
  });

  it('a new form has the defaults and no item rows; blankRow gives a row of defaults', () => {
    const s = initialState(DEF);
    expect(s.values['usagestatus']).toBe('release');
    expect(s.items['branches']).toEqual([]);
    expect(blankRow(ITEM)).toEqual({ branchid: null, is_main: false });
  });
});

describe('master-form.logic — from / to the API', () => {
  it('loads a record: numbers become text, UUIDs stay ids, booleans follow the control, nulls become empty', () => {
    const record: ApiRecord = {
      id: 'r1',
      values: { code: 'B01', name: null, usagestatus: 'draft', ratio: 12.5, start: '2026-11-10', allbranch: 'Y', use_ref: 'N', main_flag: false, province: 'p-1' },
      items: { branches: [{ id: 'i1', branchid: 'b-1', is_main: true }] },
    };
    const s = initialState(DEF, record);
    expect(s.values).toMatchObject({ code: 'B01', name: '', usagestatus: 'draft', ratio: '12.5', start: '2026-11-10', allbranch: 'Y', use_ref: 'N', main_flag: false, province: 'p-1', picture: null });
    expect(s.items['branches']).toEqual([{ branchid: 'b-1', is_main: true }]); // the row id is dropped: the API replaces the whole tab
  });

  it('a boolean column that arrives as a real boolean but is shown with options is mapped to the option', () => {
    expect(fromServer(field('allbranch'), true)).toBe('Y');
    expect(fromServer(field('allbranch'), false)).toBe('N');
  });

  it('toServer: blanks are null, numbers go as trimmed text, checkbox is a real boolean, files are not sent', () => {
    expect(toServer(field('code'), '  ')).toBeNull();
    expect(toServer(field('code'), 'B01')).toBe('B01');
    expect(toServer(field('ratio'), ' 12.50 ')).toBe('12.50');
    expect(toServer(field('ratio'), '')).toBeNull();
    expect(toServer(field('main_flag'), true)).toBe(true);
    expect(toServer(field('main_flag'), null)).toBe(false);
    expect(toServer(field('use_ref'), 'Y')).toBe('Y');
    expect(toServer(field('province'), null)).toBeNull();
    expect(toServer(field('picture'), null)).toBeUndefined();
  });

  it('toWrite builds the body of POST / PUT: entity, values, and every item tab', () => {
    const s = initialState(DEF);
    s.values = { ...s.values, code: ' B01 ', name: 'สาขา', province: 'p-1', ratio: '3' };
    s.items = { branches: [{ branchid: 'b-1', is_main: true }, { branchid: 'b-2', is_main: false }] };
    const body = toWrite(DEF, s, 'e-1');
    expect(body.entityId).toBe('e-1');
    expect(body.values).toMatchObject({ code: ' B01 ', name: 'สาขา', usagestatus: 'release', ratio: '3', province: 'p-1', allbranch: 'N', main_flag: true, use_ref: null });
    expect('picture' in body.values).toBe(false);
    expect(body.items).toEqual({ branches: [{ branchid: 'b-1', is_main: true }, { branchid: 'b-2', is_main: false }] });
  });

  it('a form with no item rows still sends the (empty) tab — on edit that clears it, as the user did', () => {
    expect(toWrite(DEF, initialState(DEF), 'e').items).toEqual({ branches: [] });
  });
});

describe('master-form.logic — copy as a new record (copyState)', () => {
  /** the real Masters mark their one unique code with `format: 'code'` (72 of 72 in the config) */
  const CODE_MAIN: ApiSection = { ...MAIN, fields: MAIN.fields.map((x) => (x.field === 'code' ? { ...x, format: 'code' } : x)) };
  const COPY_DEF: ApiFormDef = { ...DEF, sections: [CODE_MAIN, ITEM] };
  const SOURCE: ApiRecord = {
    id: 'r1',
    values: { code: 'B01', name: 'ลาดพร้าว', usagestatus: 'release', ratio: 12.5, start: '2026-11-10', allbranch: 'Y', use_ref: 'N', main_flag: false, province: 'p-1' },
    items: { branches: [{ id: 'i1', branchid: 'b-1', is_main: true }, { id: 'i2', branchid: 'b-2', is_main: false }] },
  };

  it('copies what the user fills (main values + every item row), but not the code, and makes the status draft', () => {
    const { state, cleared } = copyState(COPY_DEF, SOURCE);
    expect(state.values).toMatchObject({ code: '', name: 'ลาดพร้าว (สำเนา)', usagestatus: 'draft', ratio: '12.5', start: '2026-11-10', allbranch: 'Y', use_ref: 'N', main_flag: false, province: 'p-1', picture: null });
    expect(state.items['branches']).toEqual([{ branchid: 'b-1', is_main: true }, { branchid: 'b-2', is_main: false }]);
    expect(cleared.map((x) => x.field)).toEqual(['code']);
  });

  it('the name of a copy ends with " (สำเนา)" (mockup v33) — shortened to fit when the field is short, an empty name stays empty', () => {
    expect(copyName('ลาดพร้าว')).toBe('ลาดพร้าว (สำเนา)');
    expect(copyName('ลาดพร้าว', 50)).toBe('ลาดพร้าว (สำเนา)');
    const cut = copyName('ชื่อที่ยาวมากเกินไปจริง ๆ', 16);
    expect(cut.length).toBeLessThanOrEqual(16);
    expect(cut.endsWith(' (สำเนา)')).toBe(true);
    expect(copyName('abc', 4).length).toBeLessThanOrEqual(4); // no room for the suffix at all: just the start of the name
    const noName = copyState(COPY_DEF, { ...SOURCE, values: { ...SOURCE.values, name: null } });
    expect(noName.state.values['name']).toBe('');
  });

  it('what would be saved is a new record: no id anywhere in the body, and the original row is untouched', () => {
    const before = JSON.stringify(SOURCE);
    const { state } = copyState(COPY_DEF, SOURCE);
    state.values['code'] = 'B02';
    const body = toWrite(COPY_DEF, state, 'e-1');
    expect(body.values).toMatchObject({ code: 'B02', name: 'ลาดพร้าว (สำเนา)', usagestatus: 'draft', province: 'p-1' });
    expect(JSON.stringify(body)).not.toMatch(/"id"|r1|i1|i2/);
    expect(body.items).toEqual({ branches: [{ branchid: 'b-1', is_main: true }, { branchid: 'b-2', is_main: false }] });
    expect(JSON.stringify(SOURCE)).toBe(before);
  });

  it('editing the copy does not change the copied rows of the original (no shared objects)', () => {
    const { state } = copyState(COPY_DEF, SOURCE);
    state.items['branches'][0]['branchid'] = 'b-9';
    state.items['branches'].pop();
    expect(SOURCE.items['branches'].map((r) => r['branchid'])).toEqual(['b-1', 'b-2']);
  });

  it('a Master without a draft status keeps the status of the original; one without a code field clears nothing', () => {
    const noDraft: ApiSection = { ...CODE_MAIN, fields: CODE_MAIN.fields.map((x) => (x.field === 'usagestatus' ? { ...x, options: [{ value: 'release', text: 'release' }, { value: 'block', text: 'block' }] } : x)) };
    expect(copyState({ ...DEF, sections: [noDraft, ITEM] }, SOURCE).state.values['usagestatus']).toBe('release');
    const noCode = copyState(DEF, SOURCE); // the plain MAIN has no `format: 'code'`
    expect(noCode.cleared).toEqual([]);
    expect(noCode.state.values['code']).toBe('B01');
  });

  it('is not "changed" until the user changes something (the copy itself is the starting point)', () => {
    const { state } = copyState(COPY_DEF, SOURCE);
    expect(dirtyKey(state)).toBe(dirtyKey(copyState(COPY_DEF, SOURCE).state));
    const typed = copyState(COPY_DEF, SOURCE).state;
    typed.values['code'] = 'B02';
    expect(dirtyKey(typed)).not.toBe(dirtyKey(state));
  });
});

describe('master-form.logic — has the user changed anything? (dirtyKey)', () => {
  const start = () => initialState(DEF);

  it('is the same for a form nobody touched, and for blanks written differently (empty text · null · unchecked)', () => {
    const a = start();
    const b = start();
    b.values['code'] = ''; // already empty
    b.values['picture'] = null;
    b.values['main_flag'] = true; // the default is true → this is the untouched value
    expect(dirtyKey(b)).toBe(dirtyKey(a));
    const c = start();
    c.values['ratio'] = '   '.trim(); // blank text
    c.values['start'] = null;
    expect(dirtyKey(c)).toBe(dirtyKey(start()));
  });

  it('typing something differs ; typing it and erasing it again does not', () => {
    const typed = start();
    typed.values['code'] = 'D01';
    expect(dirtyKey(typed)).not.toBe(dirtyKey(start()));
    typed.values['code'] = '';
    expect(dirtyKey(typed)).toBe(dirtyKey(start()));
    const changedFlag = start();
    changedFlag.values['main_flag'] = false; // default was true
    expect(dirtyKey(changedFlag)).not.toBe(dirtyKey(start()));
  });

  it('an item row left completely blank is not a change ; a filled one is', () => {
    const blank = start();
    blank.items['branches'] = [blankRow(ITEM)];
    expect(dirtyKey(blank)).toBe(dirtyKey(start()));
    const filled = start();
    filled.items['branches'] = [{ branchid: 'b1', is_main: false }];
    expect(dirtyKey(filled)).not.toBe(dirtyKey(start()));
  });
});

describe('master-form.logic — required fields and the places of errors', () => {
  it('lists the empty required fields of the main tab and of each item row, by the same path the API uses', () => {
    const s = initialState(DEF);
    s.items = { branches: [{ branchid: null, is_main: false }, { branchid: 'b-1', is_main: false }] };
    expect(missingRequired(DEF, s)).toEqual({ 'values.code': 'required', 'values.name': 'required', 'values.province': 'required', 'items.branches[0].branchid': 'required' });
  });

  it('whitespace counts as empty; a required checkbox or file is never "missing"', () => {
    const def: ApiFormDef = { ...DEF, sections: [{ ...MAIN, fields: [f({ field: 'a', required: true }), f({ field: 'b', control: 'checkbox', type: 'boolean', required: true }), f({ field: 'c', control: 'file', required: true })] }] };
    expect(missingRequired(def, { values: { a: '   ', b: false, c: null }, items: {} })).toEqual({ 'values.a': 'required' });
  });

  it('placeErrors files the 422 details by field and keeps the rest as loose messages', () => {
    const p = placeErrors([
      { field: 'values.code', message: 'already exists' },
      { field: 'values.code', message: 'too long (max 20)' },
      { field: 'items.branches[1].branchid', message: 'reference not found, not release, or outside this entity' },
      { field: 'entityId', message: 'must not be null' },
    ]);
    expect(p.byPath['values.code']).toEqual(['already exists', 'too long (max 20)']);
    expect(p.byPath['items.branches[1].branchid']).toHaveLength(1);
    expect(p.loose).toEqual(['must not be null']);
  });
});

describe('master-form.errors — the API message as a sentence for the user', () => {
  // a translator that shows the key and the arguments, so the test reads what would be filled in
  const t = (key: string, ...a: (string | number)[]) => `${key.replace('app.settings.fe.', '')}(${a.join('|')})`;
  const code = f({ field: 'code', label: 'รหัส', errorText: 'รหัสใช้ได้เฉพาะ A–Z' });
  const say = (m: string) => fieldMessage(t, code, m, (k) => `«${k}»`);

  it('maps every message of the API validator to its own sentence with the numbers filled in', () => {
    expect(say('required')).toBe('required(รหัส)');
    expect(say('must not be blank')).toBe('blank(รหัส)');
    expect(say('too short (min 9)')).toBe('tooShort(รหัส|9)');
    expect(say('too long (max 250)')).toBe('tooLong(รหัส|250)');
    expect(say('must be one of [release, draft, block]')).toBe('oneOf(รหัส|release, draft, block)');
    expect(say('must be a number')).toBe('number(รหัส)');
    expect(say('must be an integer')).toBe('integer(รหัส)');
    expect(say('must be >= 1')).toBe('min(รหัส|1)');
    expect(say('must be <= 100')).toBe('max(รหัส|100)');
    expect(say('too many decimal places (max 2)')).toBe('decimals(รหัส|2)');
    expect(say('out of range')).toBe('range(รหัส)');
    expect(say('must be a date (yyyy-MM-dd)')).toBe('date(รหัส)');
    expect(say('duplicate selection (rows 1 and 3)')).toBe('duplicate(รหัส|1|3)');
    expect(say('too many rows (max 500)')).toBe('tooManyRows(รหัส|500)');
    expect(say('file upload is not supported by this endpoint')).toBe('file(รหัส)');
    expect(say('must not reference itself')).toBe('self(รหัส)');
    expect(say('reference not found, not release, or outside this entity')).toBe('refInvalid(รหัส)');
    expect(say('already exists')).toBe('exists(รหัส)');
  });

  it('cross-field messages name the other field by its Thai label', () => {
    expect(say('must not be before start')).toBe('notBefore(รหัส|«start»)');
    expect(say('sum of [competency_ratio, kpi_ratio] must equal 100 (now 90)')).toBe('sum(รหัส|«competency_ratio», «kpi_ratio»|100|90)');
  });

  it('a wrong format uses the field\'s own Thai text first; program errors are marked as such; unknown messages are shown as they are', () => {
    expect(say('invalid format (code)')).toBe('รหัสใช้ได้เฉพาะ A–Z');
    expect(fieldMessage(t, f({ field: 'x', label: 'ชื่อ' }), 'invalid format (phone)')).toBe('format(ชื่อ)');
    for (const m of ['unknown field', 'system field cannot be set', 'must be text', 'must be a uuid', 'must be true or false']) expect(say(m), m).toBe('program(รหัส)');
    expect(say('something new')).toBe('something new');
  });

  it('every message key it can produce exists in both dictionaries', async () => {
    const keys = ['required', 'blank', 'tooShort', 'tooLong', 'format', 'oneOf', 'number', 'integer', 'min', 'max', 'decimals', 'range', 'date', 'notBefore', 'sum', 'duplicate', 'tooManyRows', 'file', 'self', 'refInvalid', 'exists', 'program'];
    for (const lang of ['th', 'en']) {
      const dict = (await import(`../../../../../public/assets/i18n/app.${lang}.json`)).default as Record<string, string>;
      for (const k of keys) expect(dict[`app.settings.fe.${k}`], `${lang}: ${k}`).toBeTruthy();
    }
  });
});

describe('master-form.logic — groups (sections) and read-only system fields', () => {
  const sysField = (o: Partial<ApiField> & Pick<ApiField, 'field'>): ApiField => f({ control: 'readonly', type: 'timestamp', system: 'UPDATED_AT', ...o });
  const GROUPED: ApiSection = {
    key: 'main', kind: 'main', title: 'ข้อมูลหลัก',
    groups: [{ seq: 1, title: 'ข้อมูลทั่วไป' }, { seq: 2, title: 'ประวัติ' }, { seq: 4, title: 'นิติบุคคล' }],
    fields: [
      f({ field: 'code', group: 1, required: true }),
      f({ field: 'name', group: 1 }),
      sysField({ field: 'modify_date', group: 2 }),
      sysField({ field: 'entitygroupid', group: 4, system: 'ENTITYGROUP', type: 'uuid' }),
      sysField({ field: 'businessentityid', group: 4, system: 'ENTITY', type: 'uuid' }),
    ],
  };

  it('groupsOf: one group per declared number in order, keeping the API order of the fields; system-only groups are flagged', () => {
    const g = groupsOf(GROUPED)!;
    expect(g.map((x) => [x.seq, x.title, x.fields.map((y) => y.field), x.systemOnly])).toEqual([
      [1, 'ข้อมูลทั่วไป', ['code', 'name'], false],
      [2, 'ประวัติ', ['modify_date'], true],
      [4, 'นิติบุคคล', ['entitygroupid', 'businessentityid'], true],
    ]);
  });

  it('groupsOf: no groups from the API (or an empty list) = null → the flat grid; fields with no / unknown group are kept at the end of the first group', () => {
    expect(groupsOf(undefined)).toBeNull();
    expect(groupsOf({ ...GROUPED, groups: undefined })).toBeNull();
    expect(groupsOf({ ...GROUPED, groups: [] })).toBeNull();
    const odd: ApiSection = { ...GROUPED, fields: [...GROUPED.fields, f({ field: 'lost' }), f({ field: 'stray', group: 9 })] };
    expect(groupsOf(odd)![0].fields.map((x) => x.field)).toEqual(['code', 'name', 'lost', 'stray']);
  });

  it('groupsOf: a declared group that ends up with no field is not drawn', () => {
    const g = groupsOf({ ...GROUPED, groups: [...GROUPED.groups!, { seq: 7, title: 'ว่าง' }] })!;
    expect(g.map((x) => x.seq)).toEqual([1, 2, 4]);
  });

  it('a read-only field is not an input: no initial value, nothing sent, never "required"', () => {
    const def: ApiFormDef = { ...DEF, sections: [GROUPED] };
    expect(GROUPED.fields.filter(isInput).map((x) => x.field)).toEqual(['code', 'name']);
    expect(initialState(def).values).toEqual({ code: '', name: '' });
    expect(initialState(def, { id: 'r', values: { code: 'A', name: 'B' }, items: {}, system: { modify_date: '2026-11-12T03:04:05Z' } }).values).toEqual({ code: 'A', name: 'B' });
    expect(toServer(GROUPED.fields[2], 'x')).toBeUndefined();
    expect(toWrite(def, { values: { code: 'A', name: 'B' }, items: {} }, 'e1')).toEqual({ entityId: 'e1', values: { code: 'A', name: 'B' }, items: {} });
    expect(missingRequired({ ...def, sections: [{ ...GROUPED, fields: [...GROUPED.fields, sysField({ field: 'must', required: true })] }] }, { values: { code: 'A', name: '' }, items: {} })).toEqual({});
    expect(defaultValue(GROUPED.fields[2])).toBeNull();
    expect(fromServer(GROUPED.fields[2], '2026-11-12T03:04:05Z')).toBeNull();
  });
});
