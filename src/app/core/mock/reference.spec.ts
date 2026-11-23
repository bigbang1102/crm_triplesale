import { afterEach, describe, expect, it, vi } from 'vitest';
import { resetMockupForTests, setDatasource } from '../mockup/mockup-datasource';
import { SEED_GROUPS, type SeedGroup } from './crm-seed';
import { fits, productsCodec, reference, referenceDefaults, resetReferenceRegistry } from './reference';

afterEach(() => {
  resetMockupForTests();
  resetReferenceRegistry();
  vi.restoreAllMocks();
});

const TAGS = [
  { id: 1, code: 'VIP', name: 'VIP' },
  { id: 2, code: 'DOC', name: 'รอเอกสาร', note: '' },
];

describe('the reference lists of the mock pages (core/mock/reference.ts)', () => {
  it('should give the list of the code when there is no Datasource, or no such list in it', () => {
    expect(reference('activities.tags', TAGS)).toBe(TAGS);
    setDatasource({ 'ref.activities': { other: [] } }, true);
    expect(reference('activities.tags', TAGS)).toBe(TAGS);
  });

  it('should give the list of the document when it fits, as a copy the page may change', () => {
    const edited = [{ id: 1, code: 'VIP', name: 'ลูกค้าสำคัญ' }, { id: 9, code: 'NEW', name: 'ใหม่', extra: true }];
    setDatasource({ 'ref.activities': { tags: edited } }, true);
    const got = reference('activities.tags', TAGS);
    expect(got).toEqual(edited);
    expect(got).not.toBe(edited);
    got.pop();
    expect(edited).toHaveLength(2);
  });

  it('should keep the list of the code, and say so once, when the document does not fit', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    setDatasource({ 'ref.activities': { tags: [{ id: 'one', code: 'X' }] } }, true);
    expect(reference('activities.tags', TAGS)).toBe(TAGS);
    expect(reference('activities.tags', TAGS)).toBe(TAGS);
    expect(warn).toHaveBeenCalledTimes(1);
    expect(warn.mock.calls[0][0]).toContain('ref.activities.json');
  });

  it('should tell what fits: kind of value, the fields of the first row, and every key of an object', () => {
    expect(fits(TAGS, [])).toBe(true);
    expect(fits(TAGS, 'text')).toBe(false);
    expect(fits(TAGS, [{ id: 1, code: 'A' }])).toBe(false); // name is missing
    expect(fits(TAGS, [{ id: 1, code: 'A', name: 'a' }])).toBe(true);
    expect(fits({ CS: ['a'], AN: ['b'] }, { CS: ['x'], AN: [], LS: ['new'] })).toBe(true); // a key may be added
    expect(fits({ CS: ['a'], AN: ['b'] }, { CS: ['x'] })).toBe(false); // not taken away
    expect(fits(['a'], [1])).toBe(false);
    expect(fits({ a: null }, { a: { any: 1 } })).toBe(true); // null in the code says nothing
    expect(fits({ a: 'x' }, { a: null })).toBe(true); // null = no text
    expect(fits({ a: [1] }, { a: null })).toBe(false); // but a list is needed where the code has one
    expect(fits([], [1, 2])).toBe(true);
  });

  it('should list what the code has for the export, by page', () => {
    reference('activities.tags', TAGS);
    reference('shared.steps', ['a', 'b']);
    reference('shared.deep.name', [1]);
    expect(referenceDefaults()).toEqual({ activities: { tags: TAGS }, shared: { steps: ['a', 'b'], 'deep.name': [1] } });
  });

  it('should save the groups of a product as ids and give back the live groups', () => {
    interface P {
      id: number;
      groups: SeedGroup[];
    }
    const products: P[] = [{ id: 1, groups: SEED_GROUPS.slice(0, 2) }];
    const codec = productsCodec<P>();
    expect(codec.encode(products)).toEqual([{ id: 1, groupIds: [SEED_GROUPS[0].id, SEED_GROUPS[1].id] }]);
    setDatasource({ 'ref.shared': { products: [{ id: 1, groupIds: [SEED_GROUPS[2].id, 999] }] } }, true);
    const got = reference('shared.products', products, codec);
    expect(got).toEqual([{ id: 1, groups: [SEED_GROUPS[2]] }]); // an unknown group is left out
    expect(got[0].groups[0]).toBe(SEED_GROUPS[2]);
  });
});
