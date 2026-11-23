import { describe, expect, it } from 'vitest';
import { ConfigTable } from './settings-config.model';
import { buildPayload, copyValues, emptyRow, fieldKind, firstTabWithError, initialState, rowKey, stateFromValues, tabErrorCount, validate } from './settings-form.logic';
import { SETTINGS_TABLE_RESPONSES } from './settings.config.mock';

const model = { tables: SETTINGS_TABLE_RESPONSES };
const position = model.tables['position'];
const pdpa = model.tables['dataattributeroleconfig'];

describe('settings form logic', () => {
  it('starts with one empty form per form tab, no rows, and usagestatus on release', () => {
    const s = initialState(position);
    expect(Object.keys(s.forms)).toEqual(['main']);
    expect(s.forms['main']['code']).toBe('');
    expect(s.forms['main']['usagestatus']).toBe('release');
    expect(s.rows).toEqual({ branchitem: [], parentpositionitem: [], rolepositionitem: [] });
  });

  it('flags empty required fields of the form, and nothing else', () => {
    const errors = validate(position, initialState(position));
    expect([...errors].sort()).toEqual(['main.code', 'main.name']);
  });

  it('a blank (spaces only) required field still fails; a filled one passes', () => {
    const s = initialState(position);
    s.forms['main']['code'] = '   ';
    s.forms['main']['name'] = 'Sales manager';
    expect([...validate(position, s)]).toEqual(['main.code']);
    s.forms['main']['code'] = 'P01';
    expect(validate(position, s).size).toBe(0);
  });

  it('checks required fields of every row (branch is required in the branch tab)', () => {
    const s = initialState(position);
    s.forms['main']['code'] = 'P01';
    s.forms['main']['name'] = 'Sales manager';
    const branch = position.tabs.find((t) => t.id === 'branchitem')!;
    s.rows['branchitem'] = [emptyRow(branch.fields), { branch: '10' }, emptyRow(branch.fields)];
    expect([...validate(position, s)].sort()).toEqual([rowKey('branchitem', 0, 'branch'), rowKey('branchitem', 2, 'branch')].sort());
  });

  it('finds the first tab with an error and counts errors per tab', () => {
    const s = initialState(position);
    s.forms['main']['code'] = 'P01';
    s.forms['main']['name'] = 'x';
    s.rows['branchitem'] = [emptyRow(position.tabs[1].fields)];
    const errors = validate(position, s);
    expect(firstTabWithError(position, errors)?.id).toBe('branchitem');
    expect(tabErrorCount(position.tabs[0], errors)).toBe(0);
    expect(tabErrorCount(position.tabs[1], errors)).toBe(1);
  });

  it('builds the payload: form fields on top, rows under items.<child table>, values typed', () => {
    const s = initialState(position);
    Object.assign(s.forms['main'], { code: 'P01', name: 'Sales manager', commander_position1: '', kpi_ratio: '12.5', allbranch: 'Y' });
    s.rows['branchitem'] = [{ branch: '10' }];
    const p = buildPayload(position, s);
    expect(p).toMatchObject({ code: 'P01', name: 'Sales manager', usagestatus: 'release', commander_position1: null, kpi_ratio: 12.5, allbranch: 'Y' });
    expect(p['items']).toEqual({
      positionbranchitem: [{ branch: '10' }],
      positionparentpositionitem: [],
      positionrolepositionitem: [],
    });
  });

  it('a boolean row field becomes true/false', () => {
    const s = initialState(position);
    s.rows['parentpositionitem'] = [{ parent_position: '5', is_main: 'true' }, { parent_position: '6', is_main: '' }];
    const items = buildPayload(position, s)['items'] as Record<string, { is_main: boolean }[]>;
    expect(items['positionparentpositionitem'].map((r) => r.is_main)).toEqual([true, false]);
  });

  it('a table with only form tabs has no items in the payload', () => {
    const marketing = model.tables['marketinggroup'];
    expect(buildPayload(marketing, initialState(marketing))['items']).toBeUndefined();
  });

  it('every table of the config can start a form and passes validation once required fields are filled', () => {
    for (const table of Object.values(model.tables) as ConfigTable[]) {
      const s = initialState(table);
      for (const tab of table.tabs) {
        if (tab.kind !== 'form') continue;
        for (const f of tab.fields) if (f.required) s.forms[tab.id][f.name] = 'x';
      }
      expect(validate(table, s).size, table.name).toBe(0);
    }
  });

  it('personal-data table: the four row tabs are independent lists', () => {
    const s = initialState(pdpa);
    expect(Object.keys(s.rows)).toHaveLength(4);
  });
});

describe('fieldKind (how a field is shown)', () => {
  const f = (type: string) => ({ name: 'x', label: { th: 'x' }, type }) as never;

  it('Select/Radio: 1–2 options → radio, 3 or more → dropdown, whichever type the backend sent', () => {
    for (const type of ['Select:String', 'Select:int', 'Radio:String', 'Radio:int']) {
      expect(fieldKind(f(type), 1), type).toBe('radio');
      expect(fieldKind(f(type), 2), type).toBe('radio');
      expect(fieldKind(f(type), 3), type).toBe('select');
      expect(fieldKind(f(type), 5), type).toBe('select');
    }
  });

  it('Reference is always a dropdown, even with no or one option', () => {
    for (const n of [0, 1, 2, 3, 40]) expect(fieldKind(f('Reference'), n)).toBe('select');
  });

  it('usagestatus (release / draft / block) is a dropdown; Yes / No is radio', () => {
    const status = position.tabs[0].fields.find((x) => x.name === 'usagestatus')!;
    const allbranch = position.tabs[0].fields.find((x) => x.name === 'allbranch')!;
    expect(fieldKind(status, 3)).toBe('select');
    expect(fieldKind(allbranch, 2)).toBe('radio');
  });

  it('the other types map to plain inputs', () => {
    expect(['String', 'Address'].map((t) => fieldKind(f(t), 0))).toEqual(['text', 'text']);
    expect(['int', 'long', 'double'].map((t) => fieldKind(f(t), 0))).toEqual(['number', 'number', 'number']);
    expect(fieldKind(f('Date'), 0)).toBe('date');
    expect(fieldKind(f('Timestamp'), 0)).toBe('datetime');
    expect(fieldKind(f('Time'), 0)).toBe('time');
    expect(fieldKind(f('boolean'), 0)).toBe('check');
    expect(fieldKind(f('Upload'), 0)).toBe('file');
  });
});

describe('stateFromValues (view mode)', () => {
  const country = model.tables['country'];

  it('fills the form fields from the record and leaves unknown fields empty', () => {
    const s = stateFromValues(country, { code: 'TH', name: 'ไทย', usagestatus: 'release', phonecountry_code: '+66' });
    expect(s.forms['main']).toMatchObject({ code: 'TH', name: 'ไทย', usagestatus: 'release', phonecountry_code: '+66', name_l3: '' });
  });

  it('child tables start empty (no data for them yet)', () => {
    const s = stateFromValues(position, { code: 'P01', name: 'x' });
    expect(s.rows).toEqual({ branchitem: [], parentpositionitem: [], rolepositionitem: [] });
    expect(s.forms['main']['usagestatus']).toBe('');
  });

  it('round-trips into the payload', () => {
    const s = stateFromValues(country, { code: 'TH', name: 'ไทย', usagestatus: 'release' });
    expect(buildPayload(country, s)).toMatchObject({ code: 'TH', name: 'ไทย', usagestatus: 'release' });
  });
});

describe('copyValues', () => {
  it('clears the code, marks the name as a copy, sets draft and keeps the other fields', () => {
    const copy = copyValues({ code: 'TH', name: 'ไทย', usagestatus: 'release', phonecountry_code: '+66' }, ' (สำเนา)');
    expect(copy).toEqual({ code: '', name: 'ไทย (สำเนา)', usagestatus: 'draft', phonecountry_code: '+66' });
  });

  it('feeds a create form whose code is still required', () => {
    const country = model.tables['country'];
    const s = stateFromValues(country, copyValues({ code: 'TH', name: 'ไทย', usagestatus: 'release' }, ' (copy)'));
    expect(s.forms['main']).toMatchObject({ code: '', name: 'ไทย (copy)', usagestatus: 'draft' });
    expect([...validate(country, s)]).toEqual(['main.code']);
  });
});

