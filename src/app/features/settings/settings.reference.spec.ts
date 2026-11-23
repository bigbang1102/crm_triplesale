import { afterEach, describe, expect, it, vi } from 'vitest';
import type { ApiSetup } from './settings.api';
import { settingsConfigProblem, settingsTablesProblem } from './settings-config.model';
import config from './settings.config.response.json';
import tables from './settings.tables.response.json';

const copy = <T>(v: T): T => JSON.parse(JSON.stringify(v)) as T;
const ENT = 'ent-sun';

afterEach(() => {
  vi.restoreAllMocks();
  vi.resetModules(); // the copies of the modules that the tests made with the file layer on must not stay for the next file
});

describe('the structure of the settings page taken from the shared Datasource (ref.settingsConfig.json)', () => {
  it('should accept the structure and the table definitions the code has', () => {
    expect(settingsConfigProblem(config)).toBeUndefined();
    expect(settingsTablesProblem(tables)).toBeUndefined();
  });

  it('should refuse a structure that cannot work, and say why', () => {
    expect(settingsConfigProblem(null)).toMatch(/needs a version/);
    expect(settingsConfigProblem({ version: '1', nodes: [] })).toMatch(/needs a version/);
    const noName = copy(config) as any;
    delete noName.nodes[0].name;
    expect(settingsConfigProblem(noName)).toMatch(/phase needs/);
    const twice = copy(config) as any;
    twice.nodes[0].children.push(copy(twice.nodes[0].children[0]));
    expect(settingsConfigProblem(twice)).toMatch(/repeated/);
    const lost = copy(config) as any;
    lost.nodes[1].children[0].deps = ['nowhere'];
    expect(settingsConfigProblem(lost)).toMatch(/depends on "nowhere"/);
    const noScope = copy(config) as any;
    noScope.nodes[1].children[0].table.scope = 'moon';
    expect(settingsConfigProblem(noScope)).toMatch(/scope/);
  });

  it('should refuse table definitions that cannot work', () => {
    expect(settingsTablesProblem({})).toMatch(/needs a table/);
    const renamed = copy(tables) as any;
    renamed.branch.name = 'other';
    expect(settingsTablesProblem(renamed)).toMatch(/"branch"/);
    const noType = copy(tables) as any;
    delete noType.branch.tabs[0].fields[0].type;
    expect(settingsTablesProblem(noType)).toMatch(/field of "branch"/);
  });

  it('should build the setup of the page from the structure of the document: a renamed step, a new step', async () => {
    vi.resetModules();
    const datasource = await import('@core/mockup/mockup-datasource');
    const doc = copy(config) as any;
    const branch = doc.nodes[1].children.find((s: any) => s.id === 'branch');
    branch.name.th = 'สาขา (จากไฟล์กลาง)';
    doc.nodes[1].children.push({ id: 'extrastep', name: { th: 'ขั้นตอนที่ไฟล์เพิ่ม', en: 'Extra' }, goLive: false, deps: ['branch'], table: { name: 'extra_table', scope: 'entity', listColumns: [] } });
    const defs = copy(tables) as any;
    defs['extra_table'] = { ...copy(defs.branch), name: 'extra_table' };
    datasource.setDatasource({ 'ref.settingsConfig': { response: doc, tables: defs } }, true);
    const { MasterMock } = await import('./settings.master-mock');
    const setup = new MasterMock().get('/master-setup/steps', { entityId: ENT }).result as ApiSetup;
    const steps = setup.phases.flatMap((p) => p.steps);
    expect(steps.find((s) => s.stepKey === 'branch')?.title).toBe('สาขา (จากไฟล์กลาง)');
    expect(steps.find((s) => s.stepKey === 'extrastep')).toMatchObject({ phaseKey: 'p1', dependsOn: ['branch'] });
  });

  it('should keep the structure of the code when the document does not fit', async () => {
    vi.resetModules();
    vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    const datasource = await import('@core/mockup/mockup-datasource');
    datasource.setDatasource({ 'ref.settingsConfig': { response: { version: 'x', nodes: [] }, tables: {} } }, true);
    const { MasterMock } = await import('./settings.master-mock');
    const steps = (new MasterMock().get('/master-setup/steps', { entityId: ENT }).result as ApiSetup).phases.flatMap((p) => p.steps);
    expect(steps.map((s) => s.stepKey)).toContain('branch');
  });
});
