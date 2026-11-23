import { beforeEach, describe, expect, it } from 'vitest';
import { ApiError } from '@core/http/api-error';
import { MOCK_ENTITIES, MasterMock } from './settings.master-mock';
import type { ApiFormDef, ApiRow, ApiSetup, ApiTable } from './settings.api';

const ENT = MOCK_ENTITIES[0].id;
const create = (m: MasterMock, table: string, values: Record<string, unknown>) => m.post(`/master-tables/${table}/records`, { entityId: ENT, values });
const codeOf = (fn: () => unknown): string | undefined => {
  try {
    fn();
    return undefined;
  } catch (e) {
    return ((e as ApiError).options.body as { error: { code: string } }).error.code;
  }
};

describe('the Master-data service of the mockup', () => {
  let m: MasterMock;
  beforeEach(() => (m = new MasterMock()));

  it('should list the legal entities', () => {
    expect((m.get('/master-setup/entities').result as unknown[]).length).toBe(2);
  });

  it('should lay the set-up out from the tree of the page: a step is locked until the steps it depends on are done', () => {
    const setup = m.get('/master-setup/steps', { entityId: ENT }).result as ApiSetup;
    const steps = setup.phases.flatMap((p) => p.steps);
    const entity = steps.find((s) => s.stepKey === 'entity');
    const channel = steps.find((s) => s.stepKey === 'channel');
    expect(entity).toMatchObject({ done: false, locked: false });
    expect(channel).toMatchObject({ done: false, locked: true, missingSteps: ['entity'] });
    expect(setup.goLiveTotal).toBeGreaterThan(0);
    expect(setup.goLiveDone).toBeLessThan(setup.goLiveTotal);
  });

  it('should take the step of the Roles from the role store: done while a Role is released, after the legal entity', () => {
    const roleStep = () => (m.get('/master-setup/steps', { entityId: ENT }).result as ApiSetup).phases.flatMap((p) => p.steps).find((s) => s.stepKey === 'role');
    expect(roleStep()).toMatchObject({ phaseKey: 'p1', done: true, locked: true, missingSteps: ['entity'] });
    expect(roleStep()?.tables).toMatchObject([{ tableKey: 'role', hasRelease: true }]);
  });

  it('should refuse a create while a step it depends on is not done, and say which', () => {
    expect(codeOf(() => create(m, 'communicationtype', { code: 'X', name: 'X' }))).toBe('PREREQUISITE_NOT_MET');
    const form = m.get('/master-tables/communicationtype/form', { mode: 'create', entityId: ENT }).result as ApiFormDef;
    expect(form.precheck).toMatchObject({ canCreate: false, missingSteps: [{ stepKey: 'entity' }] });
  });

  it('should unlock the next steps when every table of a step has a released row', () => {
    create(m, 'entitygroup', { code: 'G1', name: 'กลุ่ม 1' });
    expect(((m.get('/master-setup/steps', { entityId: ENT }).result as ApiSetup).phases.flatMap((p) => p.steps).find((s) => s.stepKey === 'entity'))?.done).toBe(false);
    create(m, 'businessentity', { code: 'SUN', name: 'SUN GATEWAY' });
    const steps = (m.get('/master-setup/steps', { entityId: ENT }).result as ApiSetup).phases.flatMap((p) => p.steps);
    expect(steps.find((s) => s.stepKey === 'entity')?.done).toBe(true);
    expect(steps.find((s) => s.stepKey === 'channel')?.locked).toBe(false);
    expect(create(m, 'communicationtype', { code: 'LINE', name: 'LINE' }).status).toBe(201);
  });

  it('should check the required fields of a write (422 with the fields)', () => {
    let error: ApiError | undefined;
    try {
      create(m, 'entitygroup', { code: '' });
    } catch (e) {
      error = e as ApiError;
    }
    expect(error?.status).toBe(422);
    expect((error?.options.body as { error: { details: { field: string }[] } }).error.details.map((d) => d.field)).toEqual(['code', 'name']);
  });

  it('should create, list (search · sort · pages), edit and delete a row', () => {
    for (const [code, name] of [['B', 'บี'], ['A', 'เอ'], ['C', 'ซี']]) create(m, 'entitygroup', { code, name });
    const table = m.get('/master-tables/entitygroup').result as ApiTable;
    expect(table.columns.map((c) => c.field)).toContain('usagestatus');
    const page = m.get('/master-tables/entitygroup/records', { entityId: ENT, perPage: 2, sort: 'code,asc' });
    expect((page.result as ApiRow[]).map((r) => r['code'])).toEqual(['A', 'B']);
    expect(page.meta).toMatchObject({ total: 3, totalPages: 2 });
    expect((m.get('/master-tables/entitygroup/records', { entityId: ENT, q: 'ซี' }).result as ApiRow[]).map((r) => r['code'])).toEqual(['C']);

    const id = (page.result as ApiRow[])[0].id;
    expect(m.put(`/master-tables/entitygroup/records/${id}`, { entityId: ENT, values: { code: 'A', name: 'เอ แก้แล้ว' } }).status).toBe(200);
    expect((m.get(`/master-tables/entitygroup/records/${id}`, { entityId: ENT }).result as { values: { name: string } }).values.name).toBe('เอ แก้แล้ว');
    m.delete(`/master-tables/entitygroup/records/${id}`, { entityId: ENT });
    expect(codeOf(() => m.get(`/master-tables/entitygroup/records/${id}`, { entityId: ENT }))).toBe('RECORD_NOT_FOUND');
  });

  it('should answer 404 for an unknown table and an unknown field', () => {
    expect(codeOf(() => m.get('/master-tables/nosuchtable'))).toBe('MASTER_TABLE_NOT_FOUND');
    expect(codeOf(() => m.get('/master-tables/businessentity/fields/code/options', { entityId: ENT }))).toBe('FIELD_NOT_FOUND');
  });
});
