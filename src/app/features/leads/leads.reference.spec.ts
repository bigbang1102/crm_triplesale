import { afterEach, describe, expect, it, vi } from 'vitest';
import { referenceDefaults, resetReferenceRegistry } from '@core/mock/reference';
import { resetMockupForTests, setDatasource } from '@core/mockup/mockup-datasource';
import { LeadsMock, registerReferenceLists } from './leads.mock';
import type { Lead, LeadQuery } from './leads.types';

afterEach(() => {
  resetMockupForTests();
  resetReferenceRegistry();
  vi.restoreAllMocks();
});

const ALL: LeadQuery = { status: '', search: '', sort: 'newest', filter: { sources: [], ownerCode: '', dateFrom: '', dateTo: '' } };
const everyLead = (): Lead[] => {
  const m = new LeadsMock();
  return (['owned', 'queue', 'trash'] as const).flatMap((scope) => m.list({ ...ALL, scope }).rows);
};

describe('the Lead menu taken from the shared Datasource (ref.leads.json)', () => {
  it('should give the very same leads, in the lists and in the queue, when the document is what the formulas made', () => {
    const before = everyLead();
    registerReferenceLists();
    const doc = referenceDefaults()['leads'];
    setDatasource({ 'ref.leads': doc }, true);
    expect(everyLead()).toEqual(before);
    expect(before.length).toBeGreaterThan(95);
  });

  it('should show the leads the file says: a changed name, a lead the file adds, and counts that follow', () => {
    registerReferenceLists();
    const doc = referenceDefaults()['leads'] as { leads: Record<string, unknown>[] };
    const before = new LeadsMock().list(ALL).counts;
    doc.leads[0]['name'] = 'ลีดจากไฟล์กลาง';
    doc.leads.push({ ...doc.leads[0], id: 5000, code: 'LD-FILE-1', name: 'ลีดที่ไฟล์เพิ่ม', status: 'new', ownerCode: 'CS0001' });
    setDatasource({ 'ref.leads': doc }, true);
    const { rows, counts } = new LeadsMock().list(ALL);
    expect(rows.map((r) => r.name)).toEqual(expect.arrayContaining(['ลีดจากไฟล์กลาง', 'ลีดที่ไฟล์เพิ่ม']));
    expect(counts.new).toBe(before.new + 1);
    expect(counts.all).toBe(before.all + 1);
  });

  it('should keep the formulas when the file does not fit', () => {
    vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    const before = everyLead();
    setDatasource({ 'ref.leads': { leads: [{ id: 1 }] } }, true);
    expect(everyLead()).toEqual(before);
  });

  it('should list the owners, sources, sales lines and teams, and the org chart of the menu (read when the modules load: a fresh load)', async () => {
    vi.resetModules();
    const fresh = await import('@core/mock/reference');
    const { registerReferenceLists: register } = await import('./leads.mock');
    register();
    const lists = fresh.referenceDefaults()['leads'];
    expect(Object.keys(lists).sort()).toEqual(['areas', 'firstNames', 'lastNames', 'leads', 'ownerOfEmployee', 'owners', 'queueNames', 'salesLines', 'salesTeams', 'sources', 'superiors']);
    expect(lists['ownerOfEmployee']).toEqual({ E101: 'CS0001', E102: 'CS0002', E103: 'CS0003', E104: 'CS0004' });
  });
});
