import { afterEach, describe, expect, it, vi } from 'vitest';

const API = '/triplesale/aihub';
const copy = <T>(v: T): T => JSON.parse(JSON.stringify(v)) as T;

afterEach(() => {
  vi.resetModules(); // the copies of the modules that the tests made with the file layer on must not stay for the next file
  vi.useRealTimers();
  vi.restoreAllMocks();
});

/** the lists of the code as the documents of the shared Datasource, taken from a module that has loaded with no document */
async function defaultsOf(): Promise<Record<string, Record<string, any>>> {
  vi.resetModules();
  await import('./ai-hub.mock');
  await import('../../leads/leads.options');
  await import('../../prospects/prospects.mock');
  await import('../../prospects/form/prospect-form.mock');
  const { referenceDefaults } = await import('@core/mock/reference');
  return copy(referenceDefaults()) as Record<string, Record<string, any>>;
}

async function callWith(docs: Record<string, unknown>, path: string, init?: RequestInit): Promise<any> {
  vi.resetModules();
  const datasource = await import('@core/mockup/mockup-datasource');
  datasource.setDatasource(docs, true);
  const mock = await import('./ai-hub.mock');
  vi.useFakeTimers();
  const pending = mock.mockAiHubFetch(`${API}${path}`, init, API);
  await vi.advanceTimersByTimeAsync(2000);
  return (await pending).json();
}

describe('the lists of the AI HUB mock, the Lead form and the Prospects mocks taken from the shared Datasource', () => {
  it('should ask for every list a document of the Datasource can replace (so the export writes it)', async () => {
    const lists = await defaultsOf();
    expect(Object.keys(lists['aiHub']).sort()).toEqual(expect.arrayContaining(['models', 'textModels', 'toolModels', 'downloadNames', 'library']));
    expect(Object.keys(lists['leads'])).toEqual(expect.arrayContaining(['phoneCodes', 'countries']));
    expect(Object.keys(lists['prospects']).sort()).toEqual(
      ['avatarColors', 'convenientTimes', 'districtsBangkok', 'districtsOther', 'documentNames', 'extraChannels', 'foreign', 'groupEmployees', 'me', 'moreProvinces', 'products', 'roads', 'salesLines', 'subDistricts', 'waitlists'].sort(),
    );
    expect(Object.keys(lists['prospectForm']).sort()).toEqual(
      ['apiSubDistricts', 'businessTypes', 'channelNames', 'communication', 'countries', 'districtsBangkok', 'metro', 'movementTypes', 'occupations', 'provinceCodes', 'salePersons'].sort(),
    );
  });

  it('should offer the models a document names for a tool, and drop a name it does not know', async () => {
    const doc = (await defaultsOf())['aiHub'];
    doc['models'].haiku.label = 'Haiku จากไฟล์กลาง';
    doc['toolModels']['doc-analyze'] = ['haiku', 'ไม่มีโมเดลนี้', 'sonnet'];
    const j = await callWith({ 'ref.aiHub': doc }, '/tools');
    const analyze = j.tools.find((t: { id: string }) => t.id === 'doc-analyze');
    expect(analyze.modelOptions.map((m: { label: string }) => m.label)).toEqual(['Haiku จากไฟล์กลาง', 'Claude Sonnet']);
  });

  it('should serve the documents of the library from the Datasource', async () => {
    const doc = (await defaultsOf())['aiHub'];
    doc['library'] = [{ ...doc['library'][0], id: 'z1', title: 'เอกสารจากไฟล์กลาง' }];
    const j = await callWith({ 'ref.aiHub': doc }, '/tools/library-docs', { method: 'POST', body: new FormData() });
    expect(j.result.docs.map((d: { title: string }) => d.title)).toEqual(['เอกสารจากไฟล์กลาง']);
  });

  it('should keep the models of the code when the document does not fit', async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    const doc = (await defaultsOf())['aiHub'];
    doc['toolModels'] = ['not', 'a', 'map'];
    const j = await callWith({ 'ref.aiHub': doc }, '/tools');
    expect(j.tools.find((t: { id: string }) => t.id === 'doc-analyze').modelOptions.length).toBe(3);
  });

  it('should give the Lead form the dial codes and countries of the document, the first being the default', async () => {
    vi.resetModules();
    const datasource = await import('@core/mockup/mockup-datasource');
    datasource.setDatasource({ 'ref.leads': { phoneCodes: ['+44', '+66'], countries: ['France', 'ไทย'] } }, true);
    const options = await import('../../leads/leads.options');
    expect(options.PHONE_CODES[0]).toBe('+44');
    expect(options.COUNTRIES).toEqual(['France', 'ไทย']);
  });
});
